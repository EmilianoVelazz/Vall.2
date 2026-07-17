'use strict';
const express = require('express');
const fs      = require('fs');
const path    = require('path');

const { externalGet, gdeltFetch }   = require('../lib/http');
const { genAI, MODEL_FLASH }        = require('../lib/gemini');
const { CACHE_DIR }                 = require('../lib/config');
const { fetchYahooYield }           = require('../core/sources/yahoo');
const { fetchBanxicoYield }         = require('../core/sources/banxico');
const { countryForBondKey }         = require('../core/shape');

const router = express.Router();

const BANXICO_TOKEN = process.env.BANXICO_TOKEN || '';

// ── Banxico proxy ─────────────────────────────────────────────────────────────
const _bnxCache = new Map();
const BNX_TTL   = 6 * 60 * 60 * 1000;

// Circuit breaker: evita spam de logs cuando el token es inválido
let _bnxCircuitOpen  = false;
let _bnxCircuitUntil = 0;
const BNX_CIRCUIT_MS = 6 * 60 * 60 * 1000; // 6 horas — un log por turno de caché

router.get('/banxico/:serie', async (req, res) => {
    const { serie } = req.params;
    if (!/^[A-Z0-9]+$/i.test(serie)) return res.status(400).json({ error: 'Serie inválida' });
    const hit = _bnxCache.get(serie);
    if (hit && Date.now() - hit.ts < BNX_TTL) return res.json(hit.data);

    // Circuit breaker abierto: no reintentar hasta que pase el tiempo
    if (_bnxCircuitOpen && Date.now() < _bnxCircuitUntil) {
        if (hit) return res.json(hit.data);
        return res.status(502).json({ error: 'Datos de Banxico temporalmente no disponibles.' });
    }

    const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${serie}/datos/oportuno`;
    try {
        const r = await externalGet(url, { 'Bmx-Token': BANXICO_TOKEN });
        const j = await r.json();

        // Detectar rechazo de token específicamente para abrir el circuit breaker
        const errMsg = j?.error?.mensaje || '';
        if (errMsg && (errMsg.toLowerCase().includes('inv') || errMsg.toLowerCase().includes('token'))) {
            if (!_bnxCircuitOpen) {
                _bnxCircuitOpen  = true;
                _bnxCircuitUntil = Date.now() + BNX_CIRCUIT_MS;
                console.error(`[Banxico] ${errMsg} — Genera un nuevo token en https://www.banxico.org.mx/SieAPIRest/service/v1/token y actualiza BANXICO_TOKEN en backend/.env. Reintentos bloqueados por 1h.`);
            }
            if (hit) return res.json(hit.data);
            return res.status(502).json({ error: 'Datos de Banxico temporalmente no disponibles.' });
        }

        // Banxico responde 200 incluso con token inválido; validar que haya un dato real
        if (j?.error || !j?.bmx?.series?.[0]?.datos?.[0]) {
            throw new Error(j?.error?.mensaje || 'Respuesta inválida de Banxico');
        }

        _bnxCircuitOpen = false; // token válido: cerrar circuit breaker
        _bnxCache.set(serie, { ts: Date.now(), data: j });
        res.json(j);
    } catch (err) {
        console.error('/api/banxico error:', err.message);
        if (hit) return res.json(hit.data);
        res.status(502).json({ error: 'Error al conectar con Banxico. Intenta más tarde.' });
    }
});

// ── Finnhub news proxy: caché en memoria + disco ──────────────────────────────
// La caché en disco sobrevive reinicios del servidor (y cold starts tibios en
// Vercel vía /tmp), para que el ciclo de renovación de 12 h se respete de verdad.
const _fhCache      = new Map();
const FH_TTL        = 12 * 60 * 60 * 1000; // 12 horas
const FH_CACHE_FILE = path.join(CACHE_DIR, 'finnhub_cache.json');

if (fs.existsSync(FH_CACHE_FILE)) {
    try {
        const saved = JSON.parse(fs.readFileSync(FH_CACHE_FILE, 'utf8'));
        Object.entries(saved).forEach(([k, v]) => _fhCache.set(k, v));
        console.log(`  Finnhub cache: ${_fhCache.size} entradas cargadas desde disco`);
    } catch { /* archivo corrupto, ignorar */ }
}

function _saveFhCacheToDisk() {
    try {
        const obj = {};
        _fhCache.forEach((v, k) => { obj[k] = v; });
        fs.writeFileSync(FH_CACHE_FILE, JSON.stringify(obj));
    } catch { /* no crítico */ }
}

router.get('/finnhub-news', async (req, res) => {
    const category = ['forex', 'general', 'crypto', 'merger'].includes(req.query.category)
        ? req.query.category : 'general';
    const hit = _fhCache.get(category);
    if (hit && Date.now() - hit.ts < FH_TTL) return res.json(hit.data);
    try {
        const qs = new URLSearchParams({ token: process.env.FINNHUB_TOKEN, category });
        const r  = await externalGet(`https://finnhub.io/api/v1/news?${qs}`, {}, 7000);
        if (!r.ok) throw new Error(`Finnhub HTTP ${r.status}`);
        const j  = await r.json();

        // Traducción automática de noticias a Español usando Gemini
        if (genAI && j && j.length > 0) {
            try {
                const topNews = j.slice(0, 15);
                const textToTranslate = JSON.stringify(topNews.map(n => ({ id: n.id, headline: n.headline, summary: n.summary })));

                const model = genAI.getGenerativeModel({
                    model: MODEL_FLASH,
                    generationConfig: { responseMimeType: "application/json" }
                });
                const prompt = `Translate the 'headline' and 'summary' of this JSON array of news to Spanish. Keep the exact same JSON array format. JSON: ${textToTranslate}`;

                const result = await model.generateContent(prompt);
                const translatedText = result.response.text();

                try {
                    const translatedNews = JSON.parse(translatedText);
                    const newsArray = Array.isArray(translatedNews) ? translatedNews : [translatedNews]; // por si devuelve un solo objeto

                    newsArray.forEach(tn => {
                        const original = topNews.find(n => n.id === tn.id);
                        if (original && tn.headline) {
                            original.headline = tn.headline;
                            original.summary = tn.summary || '';
                        }
                    });
                    j.splice(0, topNews.length, ...topNews);
                } catch (parseError) {
                    console.error('JSON Parse error on Gemini output:', parseError.message);
                    console.error('Raw Gemini output:', translatedText.substring(0, 150));
                }
            } catch (e) {
                console.error('Translation error:', e.message);
            }
        }

        _fhCache.set(category, { ts: Date.now(), data: j });
        _saveFhCacheToDisk();
        res.json(j);
    } catch (err) {
        console.error('/api/finnhub-news:', err.message);
        const stale = _fhCache.get(category);
        if (stale) return res.json(stale.data);
        res.status(502).json({ error: 'No se pudieron cargar las noticias en este momento.' });
    }
});

// ── Alpha Vantage news proxy ───────────────────────────────────────────────────
// La clave vivía en el cliente (js/api-keys.js) y se quitó por seguridad, pero
// nunca se creó este proxy — desde entonces newsAlphaVantage() devolvía null
// siempre, dejando sin fuente dedicada a "commodities" (la única que alimentaba
// la categoría Proteínas), lo que la dejaba con 0 artículos permanentemente.
const _avCache = new Map();
const AV_TTL   = 3 * 60 * 60 * 1000;
const AV_TOPICS = ['commodities', 'economy_macro', 'financial_markets', 'technology', 'earnings'];

router.get('/alphavantage-news', async (req, res) => {
    const topics = AV_TOPICS.includes(req.query.topics) ? req.query.topics : 'commodities';
    const limit  = Math.min(parseInt(req.query.limit, 10) || 5, 20);
    const cacheKey = `${topics}_${limit}`;
    const hit = _avCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < AV_TTL) return res.json(hit.data);

    if (!process.env.ALPHA_VANTAGE_KEY)
        return res.status(503).json({ error: 'Alpha Vantage no configurado.' });

    try {
        const qs = new URLSearchParams({ function: 'NEWS_SENTIMENT', topics, limit, apikey: process.env.ALPHA_VANTAGE_KEY });
        const r  = await externalGet(`https://www.alphavantage.co/query?${qs}`, {}, 8000);
        if (!r.ok) throw new Error(`Alpha Vantage HTTP ${r.status}`);
        const j = await r.json();
        if (j?.Information || j?.Note) throw new Error(j.Information || j.Note); // rate-limit propio de AV
        _avCache.set(cacheKey, { ts: Date.now(), data: j });
        res.json(j);
    } catch (err) {
        console.error('/api/alphavantage-news: upstream temporalmente no disponible');
        const stale = _avCache.get(cacheKey);
        if (stale) return res.json(stale.data);
        res.status(502).json({ error: 'No se pudieron cargar noticias de Alpha Vantage.' });
    }
});

// ── Exchange rates proxy (open.er-api → caché 30 min) ────────────────────────
const _erCache = { ts: 0, data: null };
const ER_TTL   = 30 * 60 * 1000;

router.get('/exchange-rates', async (req, res) => {
    if (_erCache.data && Date.now() - _erCache.ts < ER_TTL)
        return res.json(_erCache.data);
    try {
        const r = await externalGet('https://open.er-api.com/v6/latest/USD', {}, 8000);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        _erCache.data = j;
        _erCache.ts   = Date.now();
        res.json(j);
    } catch (err) {
        console.error('/api/exchange-rates:', err.message);
        if (_erCache.data) return res.json(_erCache.data);
        res.status(502).json({ error: 'No se pudieron obtener tipos de cambio.' });
    }
});

// ── Crypto global market cap proxy (CoinGecko → caché 15 min) ───────────────
const _cgCache = { ts: 0, data: null };
const CG_TTL   = 15 * 60 * 1000;

router.get('/crypto-global', async (req, res) => {
    if (_cgCache.data && Date.now() - _cgCache.ts < CG_TTL)
        return res.json(_cgCache.data);
    try {
        const r = await externalGet('https://api.coingecko.com/api/v3/global', {}, 8000);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        _cgCache.data = j;
        _cgCache.ts   = Date.now();
        res.json(j);
    } catch (err) {
        console.error('/api/crypto-global:', err.message);
        if (_cgCache.data) return res.json(_cgCache.data);
        res.status(502).json({ error: 'No se pudo obtener capitalización cripto.' });
    }
});

// ── GDELT proxy: caché en memoria + disco, cola (1 req / 5.5 s) ───────────────
// GDELT tiene rate-limit de 1 req / 5 s por IP. La cola serializa requests
// paralelos del cliente. La caché en disco sobrevive reinicios del servidor.

const _gdeltCache      = new Map();
const GDELT_TTL        = 6 * 60 * 60 * 1000;
const GDELT_CACHE_FILE = path.join(CACHE_DIR, 'gdelt_cache.json');
const GDELT_MIN_GAP    = 5500;

if (fs.existsSync(GDELT_CACHE_FILE)) {
    try {
        const saved = JSON.parse(fs.readFileSync(GDELT_CACHE_FILE, 'utf8'));
        Object.entries(saved).forEach(([k, v]) => _gdeltCache.set(k, v));
        console.log(`  GDELT cache: ${_gdeltCache.size} entradas cargadas desde disco`);
    } catch { /* archivo corrupto, ignorar */ }
}

function _saveGdeltCacheToDisk() {
    try {
        const obj = {};
        _gdeltCache.forEach((v, k) => { obj[k] = v; });
        fs.writeFileSync(GDELT_CACHE_FILE, JSON.stringify(obj));
    } catch { /* no crítico */ }
}

let _gdeltLastAt   = 0;
const _gdeltQueue  = [];
let _gdeltDraining = false;

async function _drainGdeltQueue() {
    if (_gdeltDraining) return;
    _gdeltDraining = true;
    while (_gdeltQueue.length > 0) {
        const { url, resolve, reject } = _gdeltQueue.shift();
        const wait = Math.max(0, _gdeltLastAt + GDELT_MIN_GAP - Date.now());
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        _gdeltLastAt = Date.now();
        try { resolve(await gdeltFetch(url)); }
        catch (e) { reject(e); }
    }
    _gdeltDraining = false;
}

const GDELT_QUEUE_MAX = 20;

function _queueGdeltFetch(url) {
    if (_gdeltQueue.length >= GDELT_QUEUE_MAX)
        return Promise.reject(new Error('GDELT queue llena — demasiadas peticiones en cola'));
    return new Promise((resolve, reject) => {
        _gdeltQueue.push({ url, resolve, reject });
        _drainGdeltQueue();
    });
}

router.get('/gdelt', async (req, res) => {
    const { query, mode, maxrecords = '5' } = req.query;
    const safeQuery = String(query || '').trim();
    const safeMaxRecords = Math.min(Math.max(parseInt(maxrecords, 10) || 5, 1), 50);
    if (!safeQuery || safeQuery.length > 200 || !['ArtList', 'imagecollageinfo'].includes(mode))
        return res.status(400).json({ error: 'Parámetros inválidos' });
    const cacheKey = `${mode}:${safeQuery}:${safeMaxRecords}`;
    const hit = _gdeltCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < GDELT_TTL) return res.json(hit.data);

    const qs = new URLSearchParams({ query: safeQuery, mode, format: 'json', maxrecords: safeMaxRecords });
    try {
        const j = await _queueGdeltFetch(`https://api.gdeltproject.org/api/v2/doc/doc?${qs}`);
        _gdeltCache.set(cacheKey, { ts: Date.now(), data: j });
        _saveGdeltCacheToDisk();
        res.json(j);
    } catch (err) {
        console.error('/api/gdelt error:', err.message.slice(0, 80));
        if (hit) return res.json(hit.data);
        res.json(mode === 'imagecollageinfo' ? { images: [] } : { articles: [] });
    }
});

// ── Bond yields ───────────────────────────────────────────────────────────────
const _bondsCache = { ts: 0, data: null };
const BONDS_TTL   = 20 * 60 * 1000;

const _BOND_FALLBACK_RATES = {
    us3m:  { yield: 4.33, prev: 4.35 },
    us5y:  { yield: 4.35, prev: 4.38 },
    us10y: { yield: 4.51, prev: 4.48 },
    us30y: { yield: 4.95, prev: 4.92 },
    eu10y: { yield: 2.65, prev: 2.70 },
    mx:    { yield: 8.50, prev: 9.00 },
};

// fetchYahooYield y fetchBanxicoYield ahora viven en core/sources/ (fuente única
// de verdad, compartida con /stock-history y otras rutas). fetchECBYield sigue
// aquí porque es la única ruta que consume la API del BCE.
async function fetchECBYield(seriesKey) {
    const url = `https://data-api.ecb.europa.eu/service/data/${seriesKey}?format=jsondata&lastNObservations=5`;
    const r = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) throw new Error(`ECB ${r.status}`);
    const json      = await r.json();
    const seriesObj = json?.dataSets?.[0]?.series;
    if (!seriesObj) throw new Error('sin series');
    const firstKey = Object.keys(seriesObj)[0];
    const obsObj   = seriesObj[firstKey]?.observations;
    if (!obsObj) throw new Error('sin obs');
    const obsVals  = Object.values(obsObj).map(v => (Array.isArray(v) ? v[0] : null)).filter(v => v != null);
    if (!obsVals.length) throw new Error('obs vacías');
    const curr = obsVals[obsVals.length - 1];
    const prev = obsVals.length >= 2 ? obsVals[obsVals.length - 2] : null;
    return { yield: curr, prev };
}

router.get('/bond-yields', async (req, res) => {
    if (_bondsCache.data && Date.now() - _bondsCache.ts < BONDS_TTL)
        return res.json(_bondsCache.data);

    try {
        const [us3m, us5y, us10y, us30y, euroArea, mxTiie] = await Promise.allSettled([
            fetchYahooYield('^IRX'),
            fetchYahooYield('^FVX'),
            fetchYahooYield('^TNX'),
            fetchYahooYield('^TYX'),
            fetchECBYield('YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y'),
            fetchBanxicoYield('SF61745'), // TIIE 28 días
        ]);

        const val     = r => r.status === 'fulfilled' ? r.value : null;
        const mxYield = val(mxTiie) || _BOND_FALLBACK_RATES.mx;

        const data = [
            {
                key: 'us', country: 'Estados Unidos', flag: '🇺🇸', source: 'US Treasury / Yahoo Finance',
                bonds: [
                    { label: '3 meses', maturity: '3M',  ...(val(us3m)  || _BOND_FALLBACK_RATES.us3m) },
                    { label: '5 años',  maturity: '5Y',  ...(val(us5y)  || _BOND_FALLBACK_RATES.us5y) },
                    { label: '10 años', maturity: '10Y', ...(val(us10y) || _BOND_FALLBACK_RATES.us10y) },
                    { label: '30 años', maturity: '30Y', ...(val(us30y) || _BOND_FALLBACK_RATES.us30y) },
                ],
            },
            {
                key: 'eu', country: 'Zona Euro', flag: '🇪🇺', source: 'ECB Statistical Data Warehouse',
                bonds: [{ label: '10 años', maturity: '10Y', ...(val(euroArea) || _BOND_FALLBACK_RATES.eu10y) }],
            },
            { key: 'mx', country: 'México',      flag: '🇲🇽', source: 'Banxico SIE (TIIE 28 días)',      bonds: [{ label: 'TIIE 28D',     maturity: '28D', ...mxYield }] },
            { key: 'jp', country: 'Japón',       flag: '🇯🇵', source: 'Bank of Japan (tasa objetivo)',   bonds: [{ label: 'Tasa objetivo', maturity: 'OVN', yield: 0.50, prev: 0.25 }] },
            { key: 'gb', country: 'Reino Unido', flag: '🇬🇧', source: 'Bank of England (base rate)',     bonds: [{ label: 'Tasa base',     maturity: 'OVN', yield: 4.50, prev: 4.75 }] },
            { key: 'cn', country: 'China',       flag: '🇨🇳', source: "People's Bank of China (LPR)",   bonds: [{ label: 'LPR 1 año',     maturity: '1Y',  yield: 3.45, prev: 3.65 }] },
            { key: 'br', country: 'Brasil',      flag: '🇧🇷', source: 'Banco Central do Brasil (SELIC)', bonds: [{ label: 'SELIC',         maturity: 'OVN', yield: 13.75,prev: 14.75}] },
            { key: 'ca', country: 'Canadá',      flag: '🇨🇦', source: 'Bank of Canada (tasa objetivo)',  bonds: [{ label: 'Tasa objetivo', maturity: 'OVN', yield: 4.25, prev: 4.50 }] },
        ];

        // Dimensión país/región (aditivo — prep. para el futuro apartado "México")
        data.forEach(b => { b.countryCode = countryForBondKey(b.key); });

        _bondsCache.ts   = Date.now();
        _bondsCache.data = data;
        res.json(data);
    } catch (err) {
        console.error('/api/bond-yields error:', err.message);
        if (_bondsCache.data) return res.json(_bondsCache.data);
        res.status(502).json({ error: 'Error al cargar rendimientos de bonos.' });
    }
});

// ── Curva de Tasas México (TIIE + Cetes + UDIBONOS) ──────────────────────────
const _mxRatesCache = { ts: 0, data: null };
const MX_RATES_TTL  = 30 * 60 * 1000;

router.get('/mx-rates', async (req, res) => {
    if (_mxRatesCache.data && Date.now() - _mxRatesCache.ts < MX_RATES_TTL)
        return res.json(_mxRatesCache.data);

    const [t28, t91, t182, c28, c91, c182, c364] = await Promise.allSettled([
        fetchBanxicoYield('SF61745'),  // TIIE 28D
        fetchBanxicoYield('SF43884'),  // TIIE 91D
        fetchBanxicoYield('SF43885'),  // TIIE 182D
        fetchBanxicoYield('SF43936'),  // Cetes 28D
        fetchBanxicoYield('SF43939'),  // Cetes 91D
        fetchBanxicoYield('SF43942'),  // Cetes 182D
        fetchBanxicoYield('SF43945'),  // Cetes 364D
    ]);

    const val = r => r.status === 'fulfilled' ? r.value : null;
    const REF = { t28: 8.42, t91: 8.37, t182: 8.22, c28: 8.40, c91: 8.35, c182: 8.20, c364: 7.90 };

    const tiie = [
        { label: '28D',  yield: val(t28)?.yield  ?? REF.t28,  prev: val(t28)?.prev  ?? null },
        { label: '91D',  yield: val(t91)?.yield  ?? REF.t91,  prev: val(t91)?.prev  ?? null },
        { label: '182D', yield: val(t182)?.yield ?? REF.t182, prev: val(t182)?.prev ?? null },
    ];
    const cetes = [
        { label: '28D',  yield: val(c28)?.yield  ?? REF.c28,  prev: val(c28)?.prev  ?? null },
        { label: '91D',  yield: val(c91)?.yield  ?? REF.c91,  prev: val(c91)?.prev  ?? null },
        { label: '182D', yield: val(c182)?.yield ?? REF.c182, prev: val(c182)?.prev ?? null },
        { label: '364D', yield: val(c364)?.yield ?? REF.c364, prev: val(c364)?.prev ?? null },
    ];
    const udibonos = [
        { label: '3A',  maturity: 'Jun 2029', realYield: 4.15 },
        { label: '10A', maturity: 'Nov 2034', realYield: 4.52 },
        { label: '30A', maturity: 'Nov 2046', realYield: 4.78 },
    ];

    const hasLive = [t28, t91, t182, c28, c91, c182, c364].some(r => r.status === 'fulfilled');
    // countryCode 'MX' aditivo: /mx-rates es por definición México (prep. apartado "México")
    const data    = { tiie, cetes, udibonos, source: hasLive ? 'banxico' : 'reference', date: new Date().toISOString().slice(0, 10), countryCode: 'MX' };

    if (hasLive) { _mxRatesCache.ts = Date.now(); _mxRatesCache.data = data; }
    res.json(data);
});

module.exports = router;
