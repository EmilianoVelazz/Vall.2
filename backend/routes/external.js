'use strict';
const express = require('express');
const fs      = require('fs');
const path    = require('path');

const { externalGet, gdeltFetch, yahooFetch, YF_UA } = require('../lib/http');
const { CACHE_DIR }                                   = require('../lib/config');

const router = express.Router();

// Utilidad FIFO: limita el tamaño de los Map de caché
function boundedSet(map, key, value, maxSize = 150) {
    if (map.size >= maxSize) {
        const oldest = map.keys().next().value;
        map.delete(oldest);
    }
    map.set(key, value);
}

const BANXICO_TOKEN = process.env.BANXICO_TOKEN || '';

// ── Banxico proxy ─────────────────────────────────────────────────────────────
const _bnxCache = new Map();
const BNX_TTL   = 6 * 60 * 60 * 1000;

// Circuit breaker: evita spam de logs cuando el token es inválido
let _bnxCircuitOpen  = false;
let _bnxCircuitUntil = 0;
const BNX_CIRCUIT_MS = 6 * 60 * 60 * 1000; // 6 horas — un log por turno de caché

router.get('/banxico/:serie/history', async (req, res) => {
    const { serie } = req.params;
    const start = String(req.query.start || '');
    const end = String(req.query.end || '');
    if (!/^[A-Z0-9]+$/i.test(serie)) return res.status(400).json({ error: 'Serie inválida' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
        return res.status(400).json({ error: 'Fechas inválidas. Usa YYYY-MM-DD.' });
    }
    const startDate = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${end}T00:00:00Z`);
    if (startDate > endDate || endDate - startDate > 20 * 366 * 86400000) {
        return res.status(400).json({ error: 'El periodo debe ser válido y no superar 20 años.' });
    }
    const cacheKey = `${serie}:${start}:${end}`;
    const hit = _bnxCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < BNX_TTL) return res.json(hit.data);
    try {
        const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${serie}/datos/${start}/${end}`;
        const response = await externalGet(url, { 'Bmx-Token': BANXICO_TOKEN }, 20000);
        const payload = await response.json();
        if (payload?.error || !Array.isArray(payload?.bmx?.series?.[0]?.datos)) {
            throw new Error(payload?.error?.mensaje || 'Respuesta histórica inválida de Banxico');
        }
        boundedSet(_bnxCache, cacheKey, { ts: Date.now(), data: payload }, 100);
        res.json(payload);
    } catch (error) {
        console.error('/api/banxico history:', error.message);
        if (hit) return res.json(hit.data);
        res.status(502).json({ error: 'No se pudo obtener el histórico de Banxico.' });
    }
});

router.get('/banxico/:serie', async (req, res) => {
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

async function fetchYahooYield(ticker) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const r = await yahooFetch(url, {
        headers: { 'User-Agent': YF_UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) throw new Error(`Yahoo ${r.status}`);
    const json   = await r.json();
    const result = json?.chart?.result?.[0];
    const meta   = result?.meta;
    if (!meta?.regularMarketPrice) throw new Error('sin precio');
    const closes = result?.indicators?.quote?.[0]?.close?.filter(v => v != null) || [];
    const prev   = closes.length >= 2 ? closes[closes.length - 2] : null;
    return { yield: meta.regularMarketPrice, prev };
}

async function fetchBanxicoYield(serie) {
    const end   = new Date();
    const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
    const fmt   = d => d.toISOString().slice(0, 10);
    const url   = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${serie}/datos/${fmt(start)}/${fmt(end)}`;
    const r = await externalGet(url, { 'Bmx-Token': BANXICO_TOKEN }, 7000);
    if (!r.ok) throw new Error(`Banxico ${r.status}`);
    const json  = await r.json();
    const datos = json?.bmx?.series?.[0]?.datos || [];
    const vals  = datos.map(d => parseFloat(d.dato)).filter(v => !isNaN(v));
    if (!vals.length) throw new Error('sin dato');
    const curr = vals[vals.length - 1];
    const prev = vals.length >= 2 ? vals[vals.length - 2] : null;
    return { yield: curr, prev };
}

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
    const data    = { tiie, cetes, udibonos, source: hasLive ? 'banxico' : 'reference', date: new Date().toISOString().slice(0, 10) };

    if (hasLive) { _mxRatesCache.ts = Date.now(); _mxRatesCache.data = data; }
    res.json(data);
});

module.exports = router;
