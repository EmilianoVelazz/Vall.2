'use strict';
const express      = require('express');
const path         = require('path');
const fs           = require('fs');

const { externalGet }          = require('../lib/http');
const { CACHE_DIR }             = require('../lib/config');
const { getStockHistory }       = require('../core/mercados.service');

const router = express.Router();

// ── BMV Market (Yahoo Finance vía source compartido) ──────────────────────────
// Caché en memoria de 5 minutos para evitar ráfagas al upstream.
// Patrón stale-while-revalidate: devuelve caché inmediatamente, refresca en background.

const _bmvCache  = { ts: 0, data: null };
const BMV_TTL    = 5 * 60 * 1000; // 5 minutos
let   _bmvFetching = false;

const BMV_INSTRUMENTS = [
    { ticker: 'GRUMAB.MX',   symbol: 'GRUMA',   name: 'Gruma',          bucket: 'bmv',      type: 'stock' },
    { ticker: 'BIMBOA.MX',   symbol: 'BIMBO',   name: 'Bimbo',          bucket: 'bmv',      type: 'stock' },
    { ticker: 'FEMSAUBD.MX', symbol: 'FEMSA',   name: 'Femsa',          bucket: 'bmv',      type: 'stock' },
    { ticker: 'WALMEX.MX',   symbol: 'WALMEX',  name: 'Walmart',        bucket: 'bmv',      type: 'stock' },
    { ticker: 'USDMXN=X',    symbol: 'USD/MXN', name: 'Tipo de Cambio', bucket: 'bmv',      type: 'currency' },
    { ticker: 'HG=F',        symbol: 'HG=F',     name: 'Carne de Cerdo', bucket: 'porcino',  type: 'commodity' },
    { ticker: 'CL=F',        symbol: 'CL=F',     name: 'Petróleo WTI',   bucket: 'gasolina', type: 'commodity' },
    { ticker: 'BTC-USD',     symbol: 'BTC',      name: 'Bitcoin',        bucket: 'crypto',   type: 'crypto' },
    { ticker: 'ETH-USD',     symbol: 'ETH',      name: 'Ethereum',       bucket: 'crypto',   type: 'crypto' },
];

async function _fetchBmvData() {
    const data = { timestamp: new Date().toISOString(), bmv: [], porcino: [], gasolina: [], crypto: [] };
    const results = await Promise.allSettled(BMV_INSTRUMENTS.map(async instrument => {
        const quote = await getStockHistory({ ticker: instrument.ticker, interval: '1d', range: '5d' });
        const price = quote.meta.regularMarketPrice;
        if (!Number.isFinite(price)) throw new Error(`${instrument.ticker}: sin precio`);
        return {
            bucket: instrument.bucket,
            item: {
                symbol: instrument.symbol,
                name: instrument.name,
                price: Number(price.toFixed(instrument.type === 'currency' ? 4 : 2)),
                change_pct: Number.isFinite(quote.meta.regularMarketChangePercent)
                    ? Number(quote.meta.regularMarketChangePercent.toFixed(2))
                    : 0,
                type: instrument.type,
            },
        };
    }));

    results.forEach((result, index) => {
        if (result.status === 'fulfilled') data[result.value.bucket].push(result.value.item);
        else console.warn(`[bmv] ${BMV_INSTRUMENTS[index].ticker}: ${result.reason.message}`);
    });
    if (!Object.values(data).some(value => Array.isArray(value) && value.length)) {
        throw new Error('Yahoo Finance no devolvió datos BMV');
    }
    return data;
}

async function _refreshBmvCache() {
    if (_bmvFetching) return;
    _bmvFetching = true;
    try {
        _bmvCache.data = await _fetchBmvData();
        _bmvCache.ts = Date.now();
    } catch (err) {
        console.error('[bmv] Actualización fallida:', err.message);
    } finally {
        _bmvFetching = false;
    }
}

router.get('/bmv-market', async (req, res) => {
    const age = Date.now() - _bmvCache.ts;

    // Caché válido: devolver inmediatamente
    if (_bmvCache.data && age < BMV_TTL) {
        return res.json(_bmvCache.data);
    }

    // Caché expirado pero hay datos: devolver stale y refrescar en background
    if (_bmvCache.data && age >= BMV_TTL) {
        void _refreshBmvCache();
        return res.json(_bmvCache.data);
    }

    // Sin caché: esperar la primera consulta Node/Yahoo con timeout controlado.
    let timeout;
    try {
        const data = await Promise.race([
            _fetchBmvData(),
            new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new Error('Tiempo límite de consulta BMV')), 20_000);
            }),
        ]);
        clearTimeout(timeout);
        _bmvCache.data = data;
        _bmvCache.ts = Date.now();
        return res.json(data);
    } catch (err) {
        clearTimeout(timeout);
        console.error('[bmv] Consulta fallida:', err.message);
        return res.status(503).json({ success: false, error: 'Datos BMV temporalmente no disponibles.' });
    }
});


// ── Commodity prices (Alpha Vantage proxy) ────────────────────────────────────
// AV free tier: 5 req/min, 25 req/day → caché persistente en disco +
// warmer en background al iniciar (1 commodity cada 13 s).

const ALLOWED_COMMODITIES = new Set(['CORN', 'SOYBEANS', 'WHEAT', 'CRUDE_OIL', 'COPPER', 'NATURAL_GAS', 'ALUMINUM']);
const _avComCache   = new Map();
const AV_COM_TTL    = 12 * 60 * 60 * 1000;
const COM_CACHE_FILE = path.join(CACHE_DIR, 'commodity-cache.json');

// AV usa WTI como nombre de función para CRUDE_OIL
const AV_FN_MAP   = { CRUDE_OIL: 'WTI' };
const AV_FN_RATIO = {};

// Carga caché desde disco al arrancar
try {
    const disk = JSON.parse(fs.readFileSync(COM_CACHE_FILE, 'utf8'));
    Object.entries(disk).forEach(([fn, entry]) => _avComCache.set(fn, entry));
    console.log(`[commodity] Loaded ${_avComCache.size} cached entries from disk`);
} catch {}

function _comCacheSave() {
    try {
        fs.writeFileSync(COM_CACHE_FILE, JSON.stringify(Object.fromEntries(_avComCache.entries())), 'utf8');
    } catch (e) { console.error('[commodity] cache save error:', e.message); }
}

const _fetchingCommodities = new Set();

async function _fetchOneCommodity(fn) {
    if (_fetchingCommodities.has(fn)) return;
    _fetchingCommodities.add(fn);
    const avKey = process.env.ALPHA_VANTAGE_KEY;
    if (!avKey) { _fetchingCommodities.delete(fn); return; }
    const avFn  = AV_FN_MAP[fn] || fn;
    const ratio = AV_FN_RATIO[fn] || 1;
    try {
        const r = await externalGet(`https://www.alphavantage.co/query?function=${avFn}&apikey=${avKey}`);
        const j = await r.json();
        if (j?.Information || j?.Note) { console.warn(`[commodity] rate-limited on ${fn}`); return; }
        if (!Array.isArray(j?.data) || !j.data.length) { console.warn(`[commodity] invalid data for ${fn}`); return; }
        const data  = ratio !== 1 ? j.data.map(d => ({ ...d, value: String(parseFloat(d.value) * ratio) })) : j.data;
        _avComCache.set(fn, { ts: Date.now(), data: { ...j, data } });
        _comCacheSave();
        console.log(`[commodity] cached ${fn} (${data[0]?.value?.slice(0, 7)})`);
    } catch (e) { console.error(`[commodity] fetch error ${fn}:`, e.message); }
    finally { _fetchingCommodities.delete(fn); }
}

async function _runCommodityWarmer(label = 'warmup') {
    const stale = [...ALLOWED_COMMODITIES].filter(fn => {
        const hit = _avComCache.get(fn);
        return !hit || Date.now() - hit.ts >= AV_COM_TTL;
    });
    if (!stale.length) { console.log(`[commodity] ${label}: all cached, nothing to do`); return; }
    console.log(`[commodity] ${label}: fetching ${stale.length} stale entries (13 s apart)...`);
    for (let i = 0; i < stale.length; i++) {
        await _fetchOneCommodity(stale[i]);
        if (i < stale.length - 1) await new Promise(r => setTimeout(r, 13000));
    }
    console.log(`[commodity] ${label} complete`);
}

router.get('/commodity', (req, res) => {
    const fn = (req.query.fn || '').toUpperCase();
    if (!ALLOWED_COMMODITIES.has(fn))
        return res.status(400).json({ error: 'Commodity no permitida' });
    const hit = _avComCache.get(fn);
    if (hit) {
        if (Date.now() - hit.ts >= AV_COM_TTL) _fetchOneCommodity(fn); // fire-and-forget
        return res.json(hit.data);
    }
    return res.status(503).json({ error: 'Cargando datos — reintentar en breve' });
});

// ── Stock history (Yahoo Finance proxy) ───────────────────────────────────────
const _stockCache = new Map();
const STOCK_TTL      = 6 * 60 * 60 * 1000; // 6 horas
const YAHOO_INTERVALS = new Set(['1m', '5m', '15m', '30m', '1h', '1d', '1wk', '1mo']);
const YAHOO_RANGES    = new Set(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '3y', '4y', '5y', '10y', 'ytd', 'max']);

router.get('/stock-history', async (req, res) => {
    const ticker   = (req.query.ticker   || '').trim().toUpperCase();
    const interval = (req.query.interval || '1d').trim();
    const range    = (req.query.range    || '1y').trim();

    if (!ticker || !/^[A-Z0-9\-\^\.=]+$/i.test(ticker) || ticker.length > 20)
        return res.status(400).json({ error: 'ticker inválido' });
    if (!YAHOO_INTERVALS.has(interval)) return res.status(400).json({ error: 'interval inválido' });
    if (!YAHOO_RANGES.has(range))       return res.status(400).json({ error: 'range inválido' });

    const key = `${ticker}_${interval}_${range}`;
    const hit = _stockCache.get(key);
    if (hit && Date.now() - hit.ts < STOCK_TTL) return res.json(hit.data);

    try {
        const payload = await getStockHistory({ ticker, interval, range });

        // Límite FIFO: evita crecimiento ilimitado en servidores de larga duración
        if (_stockCache.size >= 500) {
            _stockCache.delete(_stockCache.keys().next().value);
        }
        _stockCache.set(key, { ts: Date.now(), data: payload });
        res.json(payload);
    } catch (err) {
        console.error('/api/stock-history error:', err.message);
        if (hit) return res.json(hit.data);
        res.status(502).json({ error: 'No se pudieron obtener datos históricos en este momento.' });
    }
});

// ── Inicialización del commodity warmer ───────────────────────────────────────
// Llamar desde server.js con initCommodityWarmer(require.main === module)

function initCommodityWarmer(isDirectRun) {
    if (isDirectRun) {
        // Servidor de larga duración: warmup secuencial (respeta 5 req/min de AV)
        (async () => {
            await new Promise(r => setTimeout(r, 5000));
            await _runCommodityWarmer('warmup');
        })();
        setInterval(() => _runCommodityWarmer('periodic'), AV_COM_TTL);
    } else {
        // Serverless (Vercel): fetch en paralelo (una sola ráfaga al iniciar)
        setImmediate(() => {
            const stale = [...ALLOWED_COMMODITIES].filter(fn => {
                const hit = _avComCache.get(fn);
                return !hit || Date.now() - hit.ts >= AV_COM_TTL;
            });
            if (stale.length) {
                Promise.all(stale.map(fn => _fetchOneCommodity(fn).catch(() => {}))).catch(() => {});
            }
        });
    }
}

module.exports = { router, initCommodityWarmer };
