'use strict';
const express      = require('express');
const path         = require('path');
const fs           = require('fs');

const { externalGet, yahooFetch, YF_UA } = require('../lib/http');
const { IS_VERCEL, CACHE_DIR }           = require('../lib/config');

const router = express.Router();

// ── BMV Market (Yahoo Finance) ────────────────────────────────────────────
// Caché en memoria de 5 minutos. Patrón stale-while-revalidate.

const _bmvCache  = { ts: 0, data: null };
const BMV_TTL    = 5 * 60 * 1000; // 5 minutos

const BMV_YAHOO_ASSETS = [
    { ticker:'GRUMAB.MX',   symbol:'GRUMA',   name:'Gruma',          type:'stock',     bucket:'bmv'      },
    { ticker:'BIMBOA.MX',   symbol:'BIMBO',   name:'Bimbo',          type:'stock',     bucket:'bmv'      },
    { ticker:'FEMSAUBD.MX', symbol:'FEMSA',   name:'FEMSA',          type:'stock',     bucket:'bmv'      },
    { ticker:'WALMEX.MX',   symbol:'WALMEX',  name:'Walmart México', type:'stock',     bucket:'bmv'      },
    { ticker:'USDMXN=X',    symbol:'USD/MXN', name:'Tipo de Cambio', type:'currency',  bucket:'bmv'      },
    { ticker:'HE=F',        symbol:'HE=F',    name:'Carne de Cerdo', type:'commodity', bucket:'porcino'  },
    { ticker:'CL=F',        symbol:'CL=F',    name:'Petróleo WTI',   type:'commodity', bucket:'gasolina' },
    { ticker:'BTC-USD',     symbol:'BTC',     name:'Bitcoin',        type:'crypto',    bucket:'crypto'   },
    { ticker:'ETH-USD',     symbol:'ETH',     name:'Ethereum',       type:'crypto',    bucket:'crypto'   },
];
let _bmvYahooFetching = null;

async function _fetchBmvYahooAsset(asset) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.ticker)}?interval=1d&range=5d`;
    const response = await yahooFetch(url, { headers:{ 'User-Agent':YF_UA, 'Accept':'application/json' } });
    if (!response.ok) throw new Error(`${asset.ticker}: Yahoo HTTP ${response.status}`);
    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error(`${asset.ticker}: sin datos`);
    const closes = (result.indicators?.quote?.[0]?.close || []).filter(Number.isFinite);
    const meta = result.meta || {};
    const price = meta.regularMarketPrice ?? closes[closes.length - 1];
    const previous = meta.chartPreviousClose ?? closes[closes.length - 2];
    if (!Number.isFinite(price)) throw new Error(`${asset.ticker}: precio no disponible`);
    const changePct = Number.isFinite(previous) && previous !== 0 ? (price - previous) / previous * 100 : 0;
    return { bucket:asset.bucket, value:{
        symbol:asset.symbol, name:asset.name,
        price:Number(price.toFixed(price < 10 ? 4 : 2)),
        change_pct:Number(changePct.toFixed(2)), type:asset.type,
    }};
}

async function _refreshBmvYahoo() {
    if (_bmvYahooFetching) return _bmvYahooFetching;
    _bmvYahooFetching = (async () => {
        const settled = await Promise.allSettled(BMV_YAHOO_ASSETS.map(_fetchBmvYahooAsset));
        const payload = { timestamp:new Date().toISOString(), bmv:[], porcino:[], gasolina:[], crypto:[] };
        settled.forEach((result,index) => {
            if (result.status === 'fulfilled') payload[result.value.bucket].push(result.value.value);
            else console.warn('[bmv] activo omitido:', BMV_YAHOO_ASSETS[index].ticker, result.reason?.message || 'error');
        });
        const loaded = payload.bmv.length + payload.porcino.length + payload.gasolina.length + payload.crypto.length;
        if (!loaded) throw new Error('No fue posible cargar ningún activo BMV');
        _bmvCache.data = payload;
        _bmvCache.ts = Date.now();
        return payload;
    })().finally(() => { _bmvYahooFetching = null; });
    return _bmvYahooFetching;
}

router.get('/bmv-market', async (req, res) => {
    const age = Date.now() - _bmvCache.ts;
    if (_bmvCache.data && age < BMV_TTL) return res.json(_bmvCache.data);
    if (_bmvCache.data) {
        _refreshBmvYahoo().catch(err => console.error('[bmv] refresh:', err.message));
        return res.json(_bmvCache.data);
    }
    try {
        res.json(await _refreshBmvYahoo());
    } catch (err) {
        console.error('[bmv] carga inicial:', err.message);
        res.status(502).json({ success:false, error:'Datos BMV temporalmente no disponibles.' });
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
const _stockCache    = new Map();
const STOCK_TTL      = 15 * 60 * 1000;
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

    // 3y y 4y no son rangos nativos de Yahoo → calculamos con period1/period2
    let url;
    if (range === '3y' || range === '4y') {
        const years   = range === '3y' ? 3 : 4;
        const period2 = Math.floor(Date.now() / 1000);
        const period1 = Math.floor(period2 - years * 365.25 * 24 * 3600);
        url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&period1=${period1}&period2=${period2}`;
    } else {
        url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
    }

    try {
        const r = await yahooFetch(url, {
            headers: {
                'User-Agent':      YF_UA,
                'Accept':          'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });
        if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
        const json = await r.json();

        const result = json?.chart?.result?.[0];
        if (!result) throw new Error('Sin datos en respuesta');

        const tss   = result.timestamp || [];
        const quote = result.indicators?.quote?.[0] || {};
        const isIntraday = ['1m', '5m', '15m', '30m', '1h'].includes(interval);

        const candles = tss.map((t, i) => {
            const o = quote.open?.[i], h = quote.high?.[i],
                  l = quote.low?.[i],  c = quote.close?.[i];
            if (o == null || h == null || l == null || c == null) return null;
            if (isIntraday) return { time: t, open: o, high: h, low: l, close: c };
            const d  = new Date(t * 1000);
            const ds = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
            return { time: ds, open: o, high: h, low: l, close: c };
        }).filter(Boolean);

        const meta    = result.meta || {};
        const payload = {
            candles,
            meta: {
                symbol:                     meta.symbol,
                currency:                   meta.currency,
                regularMarketPrice:         meta.regularMarketPrice,
                regularMarketDayHigh:       meta.regularMarketDayHigh,
                regularMarketDayLow:        meta.regularMarketDayLow,
                regularMarketChangePercent: (() => {
                    if (meta.regularMarketChangePercent != null) return meta.regularMarketChangePercent;
                    if (meta.regularMarketChange != null && meta.regularMarketPrice != null) {
                        const prev = meta.regularMarketPrice - meta.regularMarketChange;
                        return prev !== 0 ? (meta.regularMarketChange / prev) * 100 : null;
                    }
                    if (candles.length >= 2) {
                        const last = candles[candles.length - 1].close;
                        const prev = candles[candles.length - 2].close;
                        return prev > 0 ? ((last - prev) / prev) * 100 : null;
                    }
                    return null;
                })(),
                longName: meta.longName || meta.shortName || '',
            },
        };

        // Límite FIFO: evita crecimiento ilimitado en servidores de larga duración
        if (_stockCache.size >= 500) {
            _stockCache.delete(_stockCache.keys().next().value);
        }
        _stockCache.set(key, { ts: Date.now(), data: payload });
        res.json(payload);
    } catch (err) {
        console.error('/api/stock-history error:', err.message);
        if (hit) return res.json(hit.data);
        res.status(502).json({ error: err.message });
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
