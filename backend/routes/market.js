'use strict';
const express      = require('express');
const path         = require('path');
const fs           = require('fs');

const { externalGet, yahooFetch, YF_UA } = require('../lib/http');
const { CACHE_DIR }           = require('../lib/config');
const { getSNIIMData }  = require('../lib/sniim-service');
const { getFirstSalePrices } = require('../lib/sniim-first-sale-service');
const { getGlobalPorkMonitor } = require('../lib/pork-global-monitor-service');
const { getGeminiWholesalePrices } = require('../lib/gemini-wholesale-price-service');
const { sourceCatalog } = require('../lib/protein-source-catalog');
const {
    usdaNassLivestockSnapshot, eurostatPigmeatSnapshot, ibgeSlaughterSnapshot,
} = require('../ai/protein-training-sources');
const { verifyToken } = require('./auth');
const executiveReportStore = require('../services/market-report-store');
const { executiveReportAgent } = require('../ai/executive-report-agent');
const { nextReportRefreshAt, scheduleDailyReport } = require('../lib/report-schedule');

const router = express.Router();



const { triangulateData } = require('../lib/triangulation');
const REVIEW_FILE = path.join(__dirname, '../cache/market-review.json');

// Caché compartida para BMV/CME
const _bmvCache  = { ts: 0, data: null };
const BMV_TTL    = 5 * 60 * 1000; // 5 minutos

async function readMarketReview() {
    try {
        const review = JSON.parse(await fs.promises.readFile(REVIEW_FILE, 'utf8'));
        const createdAt = Date.parse(review?.createdAt);
        return Number.isFinite(createdAt) && Date.now() - createdAt < 7 * 24 * 60 * 60 * 1000 ? review : null;
    } catch {
        return null;
    }
}

function cachedExchangeRate() {
    const quote = Array.isArray(_bmvCache.data)
        ? _bmvCache.data.find(item => item?.symbol === 'USD/MXN' || item?.ticker === 'USDMXN=X')
        : null;
    const value = Number(quote?.price);
    return Number.isFinite(value) && value > 10 && value < 30 ? value : null;
}

// ── SNIIM (Mercado Nacional Pecuario México) ──────────────────────────────
router.get('/sniim', async (req, res) => {
    try {
        const data = await getSNIIMData();
        const cmeProxy = _bmvCache.data || [];
        const finalData = triangulateData(data, cmeProxy, cachedExchangeRate());
        const review = await readMarketReview();
        if (review) {
            finalData.ml_review = {
                status: review.status,
                source: review.source,
                deterministicIssues: review.deterministicIssues,
                modelStatus: review.model?.status,
                approvalRequired: true,
            };
        }
        res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
        res.json(finalData);
    } catch (err) {
        console.error('[SNIIM API] Error sirviendo datos:', err.message);
        res.status(503).json({ error: 'Datos de mercado temporalmente no disponibles.' });
    }
});

// Precios de primera comercialización. A diferencia de /sniim, esta ruta no
// mezcla cortes, central de abasto ni valores estáticos: expone ganado en pie
// de rastro cuando la fuente lo publica y declara el nivel de pollo/huevo.
router.get('/sniim/primer-mercado', async (req, res) => {
    try {
        const data = await getFirstSalePrices();
        res.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
        res.json(data);
    } catch (error) {
        console.error('[SNIIM primer mercado] Error:', error.message);
        res.status(503).json({ error: 'Los precios de primera venta no están disponibles temporalmente.' });
    }
});

// Cotizaciones comerciales diarias investigadas por Gemini con búsqueda web.
// El cache vive en el servidor por 24 h; el navegador revalida para no quedarse
// con una cifra anterior cuando vence esa ventana.
router.get('/proteinas/precios-comerciales', async (req, res) => {
    try {
        const data = await getGeminiWholesalePrices({ background: true });
        res.set('Cache-Control', 'no-cache, max-age=0, must-revalidate');
        res.json(data);
    } catch (error) {
        console.error('[Gemini precios comerciales] Error sirviendo datos:', error.message);
        res.status(503).json({ available: false, prices: {}, error: 'Las cotizaciones comerciales diarias no están disponibles temporalmente.' });
    }
});

// Contexto de oferta global para Proteínas. Cada fuente conserva su fecha y
// nivel de agregación para no confundir inventario, producción y exportación.
router.get('/proteinas/pulso-cerdo', async (req, res) => {
    try {
        const data = await getGlobalPorkMonitor();
        res.set('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=43200');
        res.json(data);
    } catch (error) {
        console.error('[Pulso global cerdo] Error:', error.message);
        res.status(503).json({ error: 'El pulso global del cerdo no está disponible temporalmente.' });
    }
});

// Inventario transparente de cobertura internacional. No llama a los
// proveedores: informa cuáles ya están conectados y cuáles requieren una clave
// o una ingesta antes de poder usarse como evidencia en la plataforma.
router.get('/proteinas/fuentes', (req, res) => {
    const catalog = sourceCatalog();
    res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.json(catalog);
});

// Evidencia oficial ya normalizada. Se mantiene separada del catálogo para que
// la UI pueda consultarla bajo demanda, sin añadir llamadas externas a cada
// cambio de página. La respuesta conserva unidad, periodo y descripción.
const _proteinEvidenceCache = new Map();
const PROTEIN_EVIDENCE_TTL = 12 * 60 * 60 * 1000;
const PROTEIN_EVIDENCE_PROVIDERS = Object.freeze({
    'usda-nass': usdaNassLivestockSnapshot,
    eurostat: eurostatPigmeatSnapshot,
    ibge: ibgeSlaughterSnapshot,
});
router.get('/proteinas/evidencia/:source', async (req, res) => {
    const source = String(req.params.source || '').toLowerCase();
    const provider = PROTEIN_EVIDENCE_PROVIDERS[source];
    if (!provider) return res.status(404).json({ error: 'Fuente de evidencia no disponible.' });
    const hit = _proteinEvidenceCache.get(source);
    const fresh = hit?.data && Date.now() - hit.ts < PROTEIN_EVIDENCE_TTL;
    if (fresh) return res.json(hit.data);
    try {
        const data = await provider();
        _proteinEvidenceCache.set(source, { ts: Date.now(), data });
        res.set('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
        res.json(data);
    } catch (error) {
        console.error(`[Proteínas evidencia ${source}] Error:`, error.message);
        if (hit?.data) return res.json(hit.data);
        res.status(503).json({ error: 'La evidencia solicitada no está disponible temporalmente.' });
    }
});

// Pronósticos numéricos publicados únicamente cuando el entrenamiento temporal
// supera al baseline ingenuo. Esta ruta nunca entrena bajo demanda.
router.get('/prediction/:symbol', async (req, res) => {
    const symbol = String(req.params.symbol || '').trim().toUpperCase();
    if (!/^[A-Z0-9.^=-]{1,20}$/i.test(symbol)) return res.status(400).json({ error: 'Símbolo inválido.' });
    try {
        const { getLatestAcceptedForecast } = require('../ml/forecasting-service');
        const forecast = await getLatestAcceptedForecast(symbol);
        if (!forecast) return res.status(404).json({
            error: 'Aún no existe un pronóstico publicado para este símbolo.',
            notice: 'Un modelo solo se publica tras reunir datos suficientes y superar al baseline en validación temporal.',
        });
        res.set('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
        res.json({ forecast, notice: 'Pronóstico estadístico; no constituye certeza ni recomendación financiera.' });
    } catch (error) {
        console.error('[prediction] Error consultando pronóstico:', error.message);
        res.status(503).json({ error: 'El pronóstico no está disponible temporalmente.' });
    }
});

// ── BMV Market (Yahoo Finance) ────────────────────────────────────────────
// Patrón stale-while-revalidate.

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
    res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
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

const ALLOWED_COMMODITIES = new Set([
    'CORN', 'SOYBEANS', 'WHEAT', 'CRUDE_OIL', 'COPPER', 'NATURAL_GAS', 'ALUMINUM',
    'LEAN_HOGS', 'LIVE_CATTLE',
]);
const _avComCache   = new Map();
const AV_COM_TTL    = 12 * 60 * 60 * 1000;
const COM_CACHE_FILE = path.join(CACHE_DIR, 'commodity-cache.json');

// AV usa WTI como nombre de función para CRUDE_OIL
const AV_FN_MAP   = { CRUDE_OIL: 'WTI' };
const AV_FN_RATIO = {};

/* ── Instrumentos que Alpha Vantage no cubre ───────────────────────────────────
   AV no tiene función para el ganado ni para la soja, y no la va a tener: su
   catálogo de commodities se limita a energía, metales y unos pocos granos. La
   soja estaba igualmente en la lista de permitidos, así que /api/commodity la
   aceptaba, pedía a AV una función inexistente y no cacheaba nunca — respondía
   503 de forma permanente. El ganado ni siquiera estaba, y devolvía 400.

   En ambos casos el cliente se tragaba el fallo dentro de un Promise.allSettled
   y caía a su valor por defecto, de modo que el precio del cerdo, la res y la
   soja eran constantes escritas en el código. Nada lo advertía en pantalla.

   Se resuelven aquí, sirviéndolos desde Yahoo con la misma forma que devuelve
   AV, para que quien consume /api/commodity no tenga que saber de dónde viene
   cada serie: los cinco llamadores repartidos por el frontend siguen igual.

   `factor` lleva la cotización del contrato a la unidad que ya espera el resto
   del sistema. El ganado cotiza en centavos por libra y así se queda, porque es
   lo que convierten tanto datosProteinas() como MercadoProteinas. La soja
   cotiza en centavos por bushel y la app la maneja en dólares por tonelada. */
const YF_COMMODITIES = {
    LEAN_HOGS:   { ticker: 'HE=F', factor: 1,             unidad: 'centavos USD/lb' },
    LIVE_CATTLE: { ticker: 'LE=F', factor: 1,             unidad: 'centavos USD/lb' },
    SOYBEANS:    { ticker: 'ZS=F', factor: 36.7437 / 100, unidad: 'USD/MT' },
};

/* Devuelve la serie mensual en el formato de AV: puntos { date, value } del más
   reciente al más antiguo, que es el orden del que dependen commodityWithPct()
   —toma data[0] como precio y data[3] como referencia de tres meses— y el
   histórico de seis puntos de las sparklines. */
async function _fetchYahooCommodity(fn) {
    const spec = YF_COMMODITIES[fn];
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(spec.ticker)}`
        + '?interval=1mo&range=2y';
    const r = await yahooFetch(url, {
        headers: { 'User-Agent': YF_UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`Yahoo ${r.status}`);
    const json   = await r.json();
    const result = json?.chart?.result?.[0];
    const marcas = result?.timestamp || [];
    const cierres = result?.indicators?.quote?.[0]?.close || [];
    if (!marcas.length || marcas.length !== cierres.length) throw new Error('serie vacía');

    /* Un punto por mes. Yahoo añade al final de la serie mensual la cotización
       en curso con la fecha de hoy, de modo que el mes corriente aparece dos
       veces; si se dejaran ambos, el "mes anterior" de commodityWithPct() sería
       en realidad el mismo mes y la variación a tres meses se quedaría en dos.
       Alpha Vantage entrega un punto por mes, y de ahí vienen los índices que
       usa el cliente, así que la serie tiene que tener esa misma forma. */
    const puntos = [];
    const meses = new Set();
    for (let i = marcas.length - 1; i >= 0; i--) {
        if (cierres[i] == null) continue; // el mes en curso puede no haber cerrado
        const fecha = new Date(marcas[i] * 1000).toISOString().slice(0, 10);
        const mes = fecha.slice(0, 7);
        if (meses.has(mes)) continue; // ya se tomó el dato más reciente de ese mes
        meses.add(mes);
        puntos.push({ date: `${mes}-01`, value: String(+(cierres[i] * spec.factor).toFixed(4)) });
    }
    if (puntos.length < 2) throw new Error('serie insuficiente');

    /* El primer punto es el mes en curso, aún sin cerrar: su cierre va con
       retraso frente al precio de ahora, y es el precio de ahora el que se
       enseña en pantalla. */
    const vivo = result?.meta?.regularMarketPrice;
    if (Number.isFinite(vivo)) puntos[0].value = String(+(vivo * spec.factor).toFixed(4));

    return { name: `${fn} (Yahoo Finance · ${spec.ticker})`, unit: spec.unidad, data: puntos };
}

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

    // Los que no cubre AV van por Yahoo, que no gasta cuota ni necesita clave.
    if (YF_COMMODITIES[fn]) {
        try {
            const payload = await _fetchYahooCommodity(fn);
            _avComCache.set(fn, { ts: Date.now(), data: payload });
            _comCacheSave();
            console.log(`[commodity] cached ${fn} via Yahoo (${payload.data[0]?.value})`);
        } catch (e) { console.error(`[commodity] yahoo error ${fn}:`, e.message); }
        finally { _fetchingCommodities.delete(fn); }
        return;
    }

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
        // La espera existe por la cuota de Alpha Vantage (5 por minuto). Yahoo no
        // la tiene, así que esperar tras uno suyo sólo retrasaría el arranque.
        const ultimo = i === stale.length - 1;
        if (!ultimo && !YF_COMMODITIES[stale[i]]) await new Promise(r => setTimeout(r, 13000));
    }
    console.log(`[commodity] ${label} complete`);
}

router.get('/commodity', (req, res) => {
    res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
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

    if (!ticker || !/^[A-Z0-9\-^.=]+$/i.test(ticker) || ticker.length > 20)
        return res.status(400).json({ error: 'ticker inválido' });
    if (!YAHOO_INTERVALS.has(interval)) return res.status(400).json({ error: 'interval inválido' });
    if (!YAHOO_RANGES.has(range))       return res.status(400).json({ error: 'range inválido' });

    res.set('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');

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
            // Yahoo entrega el volumen junto al resto de la vela y hasta ahora se
            // descartaba, de modo que el cliente no tenía forma de mostrarlo.
            // Puede venir nulo (es habitual en algunos índices): se deja como null
            // para que la vista lo marque como no disponible en vez de inventarlo.
            const v = quote.volume?.[i] ?? null;
            if (isIntraday) return { time: t, open: o, high: h, low: l, close: c, volume: v };
            const d  = new Date(t * 1000);
            const ds = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
            return { time: ds, open: o, high: h, low: l, close: c, volume: v };
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

// ── Índices mundiales para el mapa de bolsas ─────────────────────────────────
//
// El mapa de Finanzas › Bolsa colorea cada país según la variación de su índice.
// Pedirlos uno por uno desde el navegador serían ~33 peticiones en cada carga;
// aquí se traen todos de una vez y se cachean.
//
// La lista vive en el servidor y NO la manda el cliente: sería convertir la ruta
// en un proxy abierto a Yahoo. Debe mantenerse en sincronía con el campo
// `simbolo` de assets/js/world-exchanges.js.
//
// Cada ticker de esta lista está VERIFICADO: devolvió al menos dos velas diarias
// en un rango de 5 días. Los índices que solo responden con rangos largos
// (Grecia, Tailandia, Filipinas, Arabia Saudita) quedaron fuera a propósito: sus
// velas están separadas por días, así que la "variación" no sería de sesión.

const WORLD_INDEX_TICKERS = [
    '^GSPC', '^NDX', '^VIX', '^GSPTSE', '^SPCDNX', '^MERV', '^BVSP',
    '^FTSE', '^GDAXI', '^FCHI', '^IBEX', 'FTSEMIB.MI', '^AEX', '^SSMI',
    '^OMX', 'OSEBX.OL', '^OMXC25', '^OMXH25', '^BFX', 'PSI20.LS', '^ATX',
    '^ISEQ', 'XU100.IS',
    '^N225', '^HSI', '000001.SS', '399001.SZ', '^KS11', '^TWII', '^NSEI', '^BSESN',
    '^STI', '^JKSE', '^KLSE',
    '^AXJO', '^NZ50', '^J203.JO', '^TA125.TA',
];

const WORLD_IDX_TTL = 10 * 60 * 1000;
const _worldIdxCache = { ts: 0, data: null };
let _worldIdxFetching = null;

async function _fetchWorldIndex(ticker) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const response = await yahooFetch(url, { headers: { 'User-Agent': YF_UA, 'Accept': 'application/json' } });
    if (!response.ok) throw new Error(`${ticker}: Yahoo HTTP ${response.status}`);
    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error(`${ticker}: sin datos`);

    const meta = result.meta || {};
    const closes = (result.indicators?.quote?.[0]?.close || []).filter(Number.isFinite);
    const price = meta.regularMarketPrice ?? closes[closes.length - 1];
    if (!Number.isFinite(price)) throw new Error(`${ticker}: precio no disponible`);

    // La variación es de SESIÓN: cierre más reciente contra el anterior.
    //
    // NO usar meta.chartPreviousClose: con range=5d es el cierre previo a toda
    // la ventana, así que da el movimiento de cinco días. Con eso el S&P 500
    // marcaba +3.31% en una sesión que había sido de -0.02%, y el mapa salía
    // casi entero en verde.
    //
    // Se calcula igual que fetchQuote() de finanzas-favro.js para que las dos
    // fuentes del mapa no se contradigan. Sin dos cierres, `change` va en null y
    // el país se queda gris: sin variación conocida no se pinta.
    const ultimo = closes[closes.length - 1];
    const previo = closes[closes.length - 2];
    const change = Number.isFinite(ultimo) && Number.isFinite(previo) && previo !== 0
        ? ((ultimo - previo) / previo) * 100
        : null;

    return { ticker, price: Number(price.toFixed(2)), change: change == null ? null : Number(change.toFixed(2)) };
}

async function _refreshWorldIndices() {
    if (_worldIdxFetching) return _worldIdxFetching;
    _worldIdxFetching = (async () => {
        const settled = await Promise.allSettled(WORLD_INDEX_TICKERS.map(_fetchWorldIndex));
        const data = {};
        let fallidos = 0;
        settled.forEach((r, i) => {
            if (r.status === 'fulfilled') data[r.value.ticker] = { price: r.value.price, change: r.value.change };
            else { fallidos++; console.warn('[world-indices] omitido:', WORLD_INDEX_TICKERS[i], r.reason?.message || 'error'); }
        });
        if (!Object.keys(data).length) throw new Error('Ningún índice mundial disponible');
        const payload = { ok: true, asOf: new Date().toISOString(), total: Object.keys(data).length, fallidos, data };
        _worldIdxCache.data = payload;
        _worldIdxCache.ts = Date.now();
        return payload;
    })().finally(() => { _worldIdxFetching = null; });
    return _worldIdxFetching;
}

router.get('/world-indices', async (req, res) => {
    const age = Date.now() - _worldIdxCache.ts;
    if (_worldIdxCache.data && age < WORLD_IDX_TTL) return res.json(_worldIdxCache.data);
    try {
        res.json(await _refreshWorldIndices());
    } catch (err) {
        console.error('/api/world-indices error:', err.message);
        // Servir caché vencida antes que nada: un mapa con datos de hace una
        // hora es mejor que un mapa entero en gris.
        if (_worldIdxCache.data) return res.json(_worldIdxCache.data);
        res.status(502).json({ ok: false, error: err.message });
    }
});

// ── Informes ejecutivos de Mercados ──────────────────────────────────────────
// Los precios se consultan directamente con Yahoo al generar el corte. Esto evita
// presentar valores de ejemplo de la interfaz como si fueran cotizaciones reales.
const MARKET_REPORT_TTL = 24 * 60 * 60 * 1000;
let _marketReportMemory = null;
let _marketReportRefresh = null;

function reportNumber(value, maximumFractionDigits = 2) {
    return Number.isFinite(value) ? new Intl.NumberFormat('es-MX', { maximumFractionDigits }).format(value) : '—';
}
function reportChange(value) {
    return Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` : 'Sin variación verificable';
}
function sourceList(items) { return [...new Set(items.filter(Boolean))]; }

function percentageBetween(current, base) {
    return Number.isFinite(current) && Number.isFinite(base) && base !== 0 ? ((current - base) / base) * 100 : null;
}

function reportPerformance(points, sessions, current) {
    return percentageBetween(current, points[Math.max(0, points.length - 1 - sessions)]?.value);
}

function reportYtd(points, current) {
    const year = new Date().getUTCFullYear();
    const first = points.find(point => new Date(point.date).getUTCFullYear() === year)?.value;
    return percentageBetween(current, first);
}

function compactReportSeries(points, limit = 42) {
    if (points.length <= limit) return points;
    const step = (points.length - 1) / (limit - 1);
    return Array.from({ length: limit }, (_, index) => points[Math.round(index * step)]);
}

function performanceLabel(value) {
    return Number.isFinite(value) ? reportChange(value) : 'Sin serie comparable';
}

function reportTable(title, columns, rows, note = '') {
    return { title, columns, rows: rows.filter(row => Array.isArray(row) && row.length), note };
}

function indexedVisual(title, items, note) {
    const series = items.filter(item => item?.series?.length > 1).map(item => {
        const base = item.series[0]?.value;
        return {
            label: item.label,
            points: item.series.map(point => ({ date: point.date, value: Number.isFinite(base) && base !== 0 ? (point.value / base) * 100 : point.value })),
        };
    });
    return series.length ? { type: 'line', title, unit: 'Índice base 100', note, series } : null;
}

function marketNewsTopic(item) {
    const text = `${item?.title || ''} ${item?.description || ''}`.toLowerCase();
    if (/protein|livestock|cattle|beef|pork|hog|poultry|chicken|meat|animal feed/.test(text)) return 'Proteínas';
    if (/grain|corn|maize|wheat|soy|crop|harvest|farm|agricultur|feed/.test(text)) return 'Granos y forrajes';
    if (/oil|crude|gas|energy|opec|fuel|refin/.test(text)) return 'Energía';
    if (/metal|copper|gold|aluminum|mining/.test(text)) return 'Metales';
    if (/freight|shipping|port|logistics|tariff|supply chain|trade war|trade policy|export|import/.test(text)) return 'Logística y comercio';
    return 'Mercados generales';
}

function newsHeadline(item) {
    return String(item?.title || '').replace(/\s*-\s*(?:reuters|bloomberg|cnbc)\.com\s*$/i, '').trim();
}

function marketNewsExplanation(item) {
    const title = newsHeadline(item);
    const titleComparable = title.toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, ' ').trim();
    const description = String(item?.description || '').replace(/\s+/g, ' ').trim();
    const descriptionComparable = description.toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, ' ').trim();
    // Algunas sindicaciones repiten el titular como “resumen”. Cuando hay un
    // texto propio se conserva; sólo se usa una explicación editorial breve
    // cuando ese resumen no añade información comprobable.
    if (description.length >= 60 && descriptionComparable !== titleComparable && !descriptionComparable.includes(titleComparable)) return description;

    const text = `${title} ${description}`.toLowerCase();
    if (/houthi|bab el-mandeb|red sea/.test(text)) return 'Aborda la presión sobre el estrecho de Bab el-Mandeb y el posible efecto sobre la navegación comercial, rutas marítimas y costos de flete.';
    if (/iran.*freight|freight.*iran/.test(text)) return 'Describe un cambio en los cargos de flete aplicables a embarcaciones que transportan productos energéticos hacia o desde Irán; conviene confirmar las rutas y contratos afectados.';
    if (/oil industry.*gulf|gulf.*oil industry/.test(text)) return 'Analiza la posición de la industria petrolera asiática frente a la tensión en el Golfo y la continuidad operativa del suministro energético regional.';
    if (/oil.*\$?100|\$?100.*oil/.test(text)) return 'Resume una sesión de mercado en la que el petróleo superó el nivel de 100 dólares, una señal que debe contrastarse con el costo físico de energía y transporte.';
    if (/grain|corn|maize|wheat|soy|crop|harvest|agricultur/.test(text)) return 'Trata un hecho relacionado con granos o agricultura que puede modificar la percepción de oferta, demanda, inventarios o costos de alimentación.';
    if (/protein|livestock|cattle|beef|pork|hog|poultry|chicken|meat/.test(text)) return 'Trata una señal de proteína animal que requiere contraste con producción, sacrificio, comercio, sanidad y costo de alimentación antes de estimar un impacto.';
    if (/metal|copper|gold|aluminum|mining/.test(text)) return 'Aborda un hecho del mercado de metales cuya relevancia depende de la exposición a insumos industriales, manufactura, infraestructura o cobertura.';
    if (/freight|shipping|port|logistics|tariff|supply chain|trade war|trade policy|export|import/.test(text)) return 'Trata un evento de logística o comercio que puede afectar rutas, plazos de entrega, disponibilidad y costos; la fuente original permite confirmar su alcance.';
    return `El titular se relaciona con ${marketNewsTopic(item).toLowerCase()}. La fuente original debe revisarse para confirmar el activo, la región y la magnitud del posible impacto.`;
}

function marketNewsVisual(headlines) {
    const totals = new Map();
    headlines.forEach(item => {
        const topic = marketNewsTopic(item);
        totals.set(topic, (totals.get(topic) || 0) + 1);
    });
    const bars = [...totals.entries()].map(([label, value]) => ({ label, value }));
    return bars.length ? { type: 'bar', title: 'Agenda de noticias por frente', unit: 'historias verificadas', note: 'Clasificación por el texto de los cinco titulares; organiza seguimiento y no mide por sí sola la magnitud del impacto.', bars } : null;
}

function marketNewsNarrative(headlines) {
    if (!headlines.length) return [
        { heading: 'Cobertura no disponible', text: 'No se obtuvo ninguna noticia verificable para este corte. El informe no rellena esa ausencia con una interpretación genérica; vuelve a intentar la actualización cuando una fuente abierta responda.' },
    ];
    const stories = headlines.slice(0, 5).map((item, index) => {
        const date = item.publishedAt ? new Date(item.publishedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : 'fecha no entregada por la fuente';
        const detail = item.description || 'La fuente entregó el titular sin resumen; abre el enlace original para confirmar alcance y datos.';
        return `${index + 1}. ${item.title}\nFuente: ${item.source || 'fuente abierta'} · ${date}. ${detail}${item.url ? ` Enlace: ${item.url}` : ''}`;
    }).join('\n\n');
    return [
        { heading: 'Noticias verificadas del corte', text: stories },
        { heading: 'Implicación operativa', text: 'Clasifica cada historia por exposición: alimento, energía, metal, logística o proteína. Después valida contrato, plaza, moneda, inventario y horizonte antes de atribuir un cambio de costo a un titular.' },
    ];
}

async function marketReportQuote(ticker, label, unit) {
    // Un año de cierres permite distinguir la señal diaria de las ventanas de
    // cinco sesiones, un mes y año a la fecha. La gráfica se compacta después;
    // los porcentajes siempre se calculan con la serie diaria completa.
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`;
    const response = await yahooFetch(url, { headers: { 'User-Agent': YF_UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`${ticker}: Yahoo HTTP ${response.status}`);
    const result = (await response.json())?.chart?.result?.[0];
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const timestamps = result?.timestamp || [];
    const points = closes.map((value, index) => ({
        date: timestamps[index] ? new Date(timestamps[index] * 1000).toISOString().slice(0, 10) : null,
        value: Number(value),
    })).filter(point => point.date && Number.isFinite(point.value));
    const current = Number(result?.meta?.regularMarketPrice ?? points.at(-1)?.value);
    const previous = points.at(-2)?.value;
    if (!Number.isFinite(current)) throw new Error(`${ticker}: sin precio verificable`);
    return {
        ticker, label, unit, value: current, previous,
        change: percentageBetween(current, previous),
        performance: {
            day: percentageBetween(current, previous),
            week: reportPerformance(points, 5, current),
            month: reportPerformance(points, 21, current),
            ytd: reportYtd(points, current),
        },
        series: compactReportSeries(points),
        source: 'Yahoo Finance · contrato de futuros y cierre diario más reciente',
    };
}

function marketNewsIso(value) {
    const text = String(value || '').trim();
    const compact = text.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
    if (compact) return new Date(`${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`).toISOString();
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function marketNewsSnapshot() {
    const query = '(commodities OR agriculture OR grains OR energy OR metals OR livestock OR protein)';
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&format=json&maxrecords=6&sort=HybridRel`;
    const articles = [];
    const providers = [];
    const addArticles = (items, provider) => {
        let inserted = 0;
        for (const item of items) {
            const key = `${String(item?.title || '').trim().toLowerCase()}|${String(item?.url || '').trim()}`;
            if (!item?.title || articles.some(existing => `${existing.title.toLowerCase()}|${existing.url}` === key)) continue;
            articles.push(item); inserted++;
            if (articles.length >= 5) break;
        }
        if (inserted && provider) providers.push(provider);
    };
    // Primero se usan las fuentes editoriales conectadas. En el corte actual
    // Finnhub entrega Reuters, CNBC y Bloomberg; GDELT queda como respaldo y
    // no desplaza una fuente editorial por un agregador menos consistente.
    if (process.env.FINNHUB_TOKEN) {
        try {
            const token = process.env.FINNHUB_TOKEN;
            const response = await externalGet(`https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(token)}`, {}, 10_000);
            if (!response.ok) throw new Error(`Finnhub HTTP ${response.status}`);
            const keywords = /commodit|agricultur|grain|crop|energy|oil|gas|metal|copper|livestock|pork|beef|protein|feed|shipping|freight|tariff|trade war|trade policy|export|import/i;
            addArticles((await response.json() || []).filter(item => keywords.test(`${item?.headline || ''} ${item?.summary || ''}`)).map(item => ({
                title: String(item?.headline || '').trim(), source: item?.source || 'Finnhub', url: item?.url || '',
                publishedAt: item?.datetime ? new Date(item.datetime * 1000).toISOString() : '',
                description: String(item?.summary || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 620),
            })).filter(item => item.title), 'Finnhub · fuentes editoriales conectadas');
        } catch (error) {
            console.warn('[market-reports] Finnhub no disponible:', error.message);
        }
    }

    if (articles.length < 5 && process.env.NEWSAPI_KEY) {
        try {
            const newsQuery = '(commodities OR agriculture OR grains OR energy OR metals OR livestock OR protein OR freight)';
            const response = await externalGet(`https://newsapi.org/v2/everything?q=${encodeURIComponent(newsQuery)}&language=en&pageSize=15&sortBy=publishedAt&apiKey=${encodeURIComponent(process.env.NEWSAPI_KEY)}`, { Accept: 'application/json' }, 12_000);
            if (!response.ok) throw new Error(`NewsAPI HTTP ${response.status}`);
            addArticles(((await response.json())?.articles || []).map(item => ({
                title: String(item?.title || '').trim(), source: item?.source?.name || 'NewsAPI', url: item?.url || '',
                publishedAt: marketNewsIso(item?.publishedAt),
                description: String(item?.description || item?.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 620),
            })).filter(item => item.title), 'NewsAPI · fuentes editoriales conectadas');
        } catch (error) {
            console.warn('[market-reports] NewsAPI no disponible:', error.message);
        }
    }

    if (articles.length < 5) {
        try {
            const response = await externalGet(url, { Accept: 'application/json', 'User-Agent': 'VALLNews/1.0' }, 12_000);
            if (!response.ok) throw new Error(`GDELT HTTP ${response.status}`);
            addArticles(((await response.json())?.articles || []).map(item => ({
                title: String(item?.title || '').trim(), source: String(item?.domain || 'GDELT').trim(),
                url: item?.url || '', publishedAt: marketNewsIso(item?.seendate),
                description: String(item?.seentext || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 620),
            })).filter(item => item.title), 'GDELT · agregación de fuentes abiertas');
        } catch (gdeltError) {
            console.warn('[market-reports] GDELT no disponible:', gdeltError.message);
        }
    }

    return { articles: articles.slice(0, 5), source: sourceList(providers).join(' · ') };
}

function marketExecutiveDocument(report) {
    const metrics = (report.metrics || []).map(metric => `- **${metric.label}:** ${metric.value}${metric.change ? ` (${metric.change})` : ''}`).join('\n');
    const takeaways = (report.takeaways || []).map((item, index) => `${index + 1}. ${item}`).join('\n');
    const watchlist = (report.watchlist || []).map((item, index) => `${index + 1}. ${item}`).join('\n');
    const tables = (report.tables || []).map(table => {
        const header = `| ${table.columns.join(' | ')} |\n| ${table.columns.map(() => '---').join(' | ')} |`;
        const rows = table.rows.map(row => `| ${row.map(value => String(value).replace(/\|/g, '/')).join(' | ')} |`).join('\n');
        return `## ${table.title}\n${header}\n${rows}${table.note ? `\n\nNota: ${table.note}` : ''}`;
    }).join('\n\n');
    const sections = (report.sections || []).map(section => `## ${section.heading}\n${section.text}`).join('\n\n');
    const context = {
        grains: 'Los futuros agrícolas son referencias de mercado y no equivalen automáticamente al precio físico entregado en México. Bases regionales, flete, tipo de cambio, calidad, humedad, calendario de cosecha y condiciones de entrega pueden cambiar de forma material el costo real. Para alimento animal, la relación entre maíz, harina de soya y energía suele importar más que el movimiento aislado de un contrato.',
        energy_metals: 'Energía y metales confluyen en costos de transporte, fertilización, empaque, maquinaria e infraestructura. WTI y gas muestran precios de referencia internacional; cobre y oro aportan señales de ciclo industrial o refugio, pero no sustituyen contratos locales. Una cobertura debe considerar unidad, plazo, base, moneda y volumen físico que se desea proteger.',
        proteins: 'Los futuros de cerdo y ganado vivo son referencias norteamericanas y no describen por sí solos el precio de cada canal, corte, plaza o especie en México. El margen depende también de alimento, conversión, logística, sanidad, peso de sacrificio y demanda. El informe ordena preguntas de seguimiento; no estima automáticamente un margen ni sugiere una operación.',
        market_news: 'Los titulares son una agenda de verificación, no evidencia concluyente. Una noticia sobre clima, comercio, energía o sanidad debe revisarse en su fuente original antes de modificar compras, ventas o coberturas. La prioridad ejecutiva es identificar exposición, plazo, dato de confirmación y responsable de seguimiento.',
        overview: 'El panorama integrado relaciona el costo de alimentación, energía, proteína y eventos informativos. Una coincidencia de movimientos no prueba causalidad: las fuentes y horarios de los mercados no siempre son idénticos. Su utilidad es priorizar conversaciones comerciales, operativas y de riesgo antes de tomar una decisión con información específica de la organización.',
    };
    return [
        `# VALLNEWS · Informe ejecutivo de Mercados: ${report.title}`,
        `**Corte:** ${new Date(report.generatedAt).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })}`,
        `## Objetivo\n${report.objective || `Este informe ofrece una lectura ejecutiva de ${report.eyebrow || report.title} con referencias de fuentes conectadas.`} Integra precios, variaciones, contexto operativo, riesgos y una agenda de seguimiento. No constituye una recomendación de compra, venta, cobertura o inversión, ni sustituye cotizaciones físicas, contratos o asesoría especializada.`,
        `## Indicadores del corte\n${metrics || 'No hubo indicadores verificables suficientes para este corte.'}`,
        `## Resumen ejecutivo\n${report.summary || 'No hay un resumen disponible para este corte.'}`,
        takeaways && `## Conclusiones clave\n${takeaways}`,
        tables,
        sections,
        watchlist && `## Qué monitorear\n${watchlist}`,
        `## Interpretación ejecutiva\n${context[report.key] || context.overview}\n\nPara transformar la lectura en una decisión, hay que contrastarla con el consumo esperado, inventario, contratos vigentes, moneda funcional, bases logísticas y límites aprobados. Un precio de pantalla puede variar antes de que se cotice, ejecute o entregue una operación física.`,
        `## Riesgos y controles\nLos precios pueden cambiar después del corte por clima, reportes de oferta y demanda, decisiones de política comercial, inventarios, interrupciones logísticas, liquidez o revisiones de proveedores. Antes de distribuir una cifra, validar fecha, unidad, moneda, mercado de referencia y fuente primaria. Cuando exista exposición material, complementar este informe con escenarios de sensibilidad, calendario de compras, análisis de base, tipo de cambio y revisión de especialistas internos o asesores autorizados.`,
        `## Conclusión\n${report.closing || 'El valor de este informe es convertir señales dispersas en una agenda de seguimiento. La acción apropiada depende del horizonte, el volumen, la exposición y los criterios de riesgo propios de cada organización.'}`,
        `## Fuentes y trazabilidad\n${(report.sources || []).map(source => `- ${source}`).join('\n') || '- Sin fuente disponible en este corte.'}\n\nLos cortes se renuevan cada doce horas. Cada proveedor puede tener horarios, metodologías y mercados distintos; por ello los indicadores se presentan con su fuente y no como una serie perfectamente sincronizada.`,
    ].filter(Boolean).join('\n\n');
}

async function buildMarketExecutiveReports() {
    const [grainsSettled, energySettled, proteinsSettled, newsSettled] = await Promise.all([
        Promise.allSettled([marketReportQuote('ZC=F', 'Maíz CME', 'USD/bu'), marketReportQuote('ZS=F', 'Soya CBOT', 'USD/bu'), marketReportQuote('ZW=F', 'Trigo CBOT', 'USD/bu'), marketReportQuote('ZM=F', 'Harina de soya', 'USD/t corta')]),
        Promise.allSettled([marketReportQuote('CL=F', 'Petróleo WTI', 'USD/bbl'), marketReportQuote('NG=F', 'Gas natural', 'USD/MMBtu'), marketReportQuote('HG=F', 'Cobre', 'USD/lb'), marketReportQuote('GC=F', 'Oro', 'USD/oz')]),
        Promise.allSettled([marketReportQuote('HE=F', 'Cerdo magro', '¢ USD/lb'), marketReportQuote('LE=F', 'Ganado vivo', '¢ USD/lb'), marketReportQuote('GF=F', 'Ganado alimentado', '¢ USD/lb'), marketReportQuote('ZM=F', 'Harina de soya', 'USD/t corta')]),
        // Las noticias no pueden cancelar los cuatro informes de precios si
        // GDELT aplica cuota o una fuente editorial está temporalmente caída.
        marketNewsSnapshot().catch(error => {
            console.warn('[market-reports] Noticias no disponibles:', error.message);
            return { articles: [], source: '' };
        }),
    ]);
    const grains = grainsSettled.filter(item => item.status === 'fulfilled').map(item => item.value);
    const energy = energySettled.filter(item => item.status === 'fulfilled').map(item => item.value);
    const proteins = proteinsSettled.filter(item => item.status === 'fulfilled').map(item => item.value);
    // La consulta de noticias ya devuelve un objeto tolerante a fallas (no un
    // resultado de Promise.allSettled). Leer `.status` aquí la descartaba por
    // completo aunque Finnhub o NewsAPI hubieran entregado cinco historias.
    const news = newsSettled && typeof newsSettled === 'object' ? newsSettled : { articles: [], source: '' };
    const headlines = news.articles || [];
    const generatedAt = new Date().toISOString();
    const leader = values => values.slice().sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0))[0];
    const grainLeader = leader(grains), energyLeader = leader(energy), proteinLeader = leader(proteins);
    const metric = item => ({
        label: item.label,
        value: `${reportNumber(item.value, item.value < 10 ? 4 : 2)} ${item.unit}`,
        change: performanceLabel(item.performance?.day),
        tone: !Number.isFinite(item.performance?.day) ? 'flat' : item.performance.day >= 0 ? 'up' : 'down',
    });
    const price = item => `${reportNumber(item?.value, item?.value < 10 ? 4 : 2)} ${item?.unit || ''}`.trim();
    const quoteRows = values => values.map(item => [
        item.label, price(item), performanceLabel(item.performance?.day), performanceLabel(item.performance?.week), performanceLabel(item.performance?.month), performanceLabel(item.performance?.ytd),
    ]);
    const quoteTable = (title, values, note) => reportTable(title, ['Referencia', 'Último', 'Día', '5 sesiones', '1 mes', 'YTD'], quoteRows(values), note);
    const firstBy = (values, ticker) => values.find(item => item.ticker === ticker);
    const corn = firstBy(grains, 'ZC=F');
    const soyMeal = firstBy(grains, 'ZM=F') || firstBy(proteins, 'ZM=F');
    const wti = firstBy(energy, 'CL=F');
    const pork = firstBy(proteins, 'HE=F');
    const marketNews = marketNewsVisual(headlines);
    const marketChainVisual = indexedVisual(
        'Cadena de impacto: alimento, energía y proteína',
        [corn, soyMeal, wti, pork].filter(Boolean),
        'Base 100 en el primer cierre del periodo mostrado. Permite comparar dirección, no niveles de precio ni márgenes físicos.'
    );
    const grainVisual = indexedVisual(
        'Granos y forrajes: evolución relativa', grains,
        'Base 100 en el primer cierre del periodo mostrado. Maíz, soya, trigo y harina de soya son contratos de futuros; la base y el flete local no están incluidos.'
    );
    const energyVisual = indexedVisual(
        'Energía y metales: evolución relativa', energy,
        'Base 100 en el primer cierre del periodo mostrado. Las referencias internacionales no sustituyen una cotización física de combustible, logística o metal.'
    );
    const proteinVisual = indexedVisual(
        'Proteínas y alimento: evolución relativa', proteins,
        'Base 100 en el primer cierre del periodo mostrado. La comparación ordena tendencias de contratos; no representa por sí sola margen, canal o precio local.'
    );
    const leaderSentence = (item, scope) => item
        ? `${item.label} registra ${performanceLabel(item.performance?.day)} en la sesión disponible, ${performanceLabel(item.performance?.week)} en cinco sesiones y ${performanceLabel(item.performance?.month)} en un mes.`
        : `No hubo una referencia verificable suficiente para identificar el movimiento de ${scope}.`;
    const newsDate = item => item?.publishedAt ? new Date(item.publishedAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin fecha publicada';
    const newsImpact = item => `${marketNewsTopic(item)} · validar alcance`;
    const newsDescription = item => marketNewsExplanation(item);
    const newsSourceLinks = headlines.map(item => ({
        label: `${item.source || 'Fuente conectada'} · ${newsDate(item)} · ${newsHeadline(item).slice(0, 115)}`,
        url: item.url || '',
    }));
    const newsSources = sourceList([
        news.source,
        ...headlines.map(item => `${item.source || 'Fuente conectada'} · ${newsDate(item)}${item.url ? ` · ${item.url}` : ''}`),
    ]);
    const reports = [
        {
            key: 'overview', title: 'Panorama general', eyebrow: 'Síntesis de Mercados', generatedAt,
            objective: 'Integrar las señales de granos, energía, metales, proteínas y noticias en una cadena de impacto para dirección, sin repetir los informes especializados ni confundir una coincidencia de precios con causalidad.',
            summary: `Corte integrado de insumos y mercados. ${grainLeader ? `${grainLeader.label} ${performanceLabel(grainLeader.performance?.day)} diario. ` : ''}${energyLeader ? `${energyLeader.label} ${performanceLabel(energyLeader.performance?.day)} diario. ` : ''}${proteinLeader ? `${proteinLeader.label} ${performanceLabel(proteinLeader.performance?.day)} diario.` : ''}`.trim(),
            metrics: [grainLeader, energyLeader, proteinLeader].filter(Boolean).map(metric),
            takeaways: [
                grainLeader && `Alimento: ${leaderSentence(grainLeader, 'granos')}`,
                energyLeader && `Energía o metales: ${leaderSentence(energyLeader, 'energía')}`,
                proteinLeader && `Proteínas: ${leaderSentence(proteinLeader, 'proteína')}`,
                headlines[0] && `Agenda informativa: ${headlines[0].source || 'una fuente conectada'} reporta una historia del frente ${marketNewsTopic(headlines[0])}. El detalle queda en Noticias de mercados; confirma la fuente primaria antes de asociarla con un precio.`,
            ].filter(Boolean),
            watchlist: [
                'Relación entre maíz, harina de soya y el consumo físico de alimento; confirma inventario, fórmula, base y compras pendientes.',
                'WTI, gas y rutas logísticas frente a contratos de combustible, fletes y fecha de entrega reales.',
                'Precio de venta, sacrificio, sanidad, exportaciones e importaciones de proteína; los futuros no sustituyen esos datos.',
            ],
            closing: 'La cadena útil para dirección no es un precio aislado: alimento y energía entran al costo, la logística y el tipo de cambio modulan la transmisión, y el precio de proteína determina la capacidad de absorberla. El siguiente paso es cuantificar la exposición propia por insumo, plazo y contraparte.',
            tables: [reportTable('Tablero integrado de variables', ['Frente', 'Señal actual', 'Lectura temporal', 'Qué vigilar'], [
                grainLeader && ['Granos y forrajes', `${grainLeader.label}: ${price(grainLeader)}`, `Día ${performanceLabel(grainLeader.performance?.day)} · Mes ${performanceLabel(grainLeader.performance?.month)}`, 'Inventario, clima, cosecha, base y flete'],
                energyLeader && ['Energía y metales', `${energyLeader.label}: ${price(energyLeader)}`, `Día ${performanceLabel(energyLeader.performance?.day)} · Mes ${performanceLabel(energyLeader.performance?.month)}`, 'Combustible, gas, rutas, oferta y demanda'],
                proteinLeader && ['Proteínas', `${proteinLeader.label}: ${price(proteinLeader)}`, `Día ${performanceLabel(proteinLeader.performance?.day)} · Mes ${performanceLabel(proteinLeader.performance?.month)}`, 'Costo de alimento, sacrificio, sanidad y canal'],
                headlines[0] && ['Noticias', marketNewsTopic(headlines[0]), headlines[0].source || 'Fuente conectada', 'Actualización y fuente primaria'],
            ].filter(Boolean), 'El tablero condensa señales con horarios de corte distintos; no mide un margen ni demuestra causalidad.')],
            visuals: [marketChainVisual, marketNews].filter(Boolean),
            sections: [
                { heading: 'Qué pasó', text: `El corte reúne ${grains.length} referencias agrícolas, ${energy.length} de energía y metales, ${proteins.length} de proteínas y alimento, y ${headlines.length} noticias verificadas. ${leaderSentence(grainLeader, 'granos')} ${leaderSentence(energyLeader, 'energía')} ${leaderSentence(proteinLeader, 'proteínas')}` },
                { heading: 'Por qué pasó', text: 'Las cotizaciones y sus series diarias permiten observar el movimiento, pero Yahoo Finance no atribuye una causa. Los cambios pueden coincidir con oferta, demanda, clima, inventarios, geopolítica, tipo de cambio, liquidez o datos macro; la relación debe confirmarse con reportes y fuentes primarias antes de presentarse como driver.' },
                { heading: 'Por qué importa', text: 'Maíz y harina de soya son referencias de alimento; energía y logística pueden alterar el costo de movilizar, procesar o producir; los contratos de proteína ofrecen una señal de mercado animal. El efecto final sobre un negocio depende de fórmula, ubicación, base, moneda, inventario, contratos y canal de venta.' },
                { heading: 'Qué debemos vigilar', text: 'Prioriza variables con exposición física: inventario y compras pendientes de alimento, precio y disponibilidad de combustible, rutas y fletes, tipo de cambio, costos sanitarios y demanda de proteína. Para cada una define umbral, horizonte, responsable y fuente de confirmación.' },
            ],
            sources: sourceList(['Yahoo Finance · contratos de futuros y cierres diarios', news.source]), sourceSnapshot: { grains, energy, proteins, headlines },
        },
        {
            key: 'grains', title: 'Granos y forrajes', eyebrow: 'Maíz, soya, trigo y harina de soya', generatedAt,
            objective: 'Analizar las referencias agrícolas que inciden en el costo de alimentación y separar el precio de futuros de los determinantes físicos: oferta, demanda, cosecha, inventario, exportaciones, base, flete y moneda.',
            summary: grains.length ? `El corte reúne ${grains.length} contratos agrícolas. ${leaderSentence(grainLeader, 'granos')}` : 'No hubo suficientes cotizaciones agrícolas verificables para elaborar este corte.',
            metrics: grains.map(metric),
            takeaways: [
                grainLeader && `${grainLeader.label} concentra el mayor cambio porcentual absoluto de la sesión disponible (${performanceLabel(grainLeader.performance?.day)}); su lectura mensual es ${performanceLabel(grainLeader.performance?.month)}.`,
                corn && `Maíz CME: ${price(corn)}; cinco sesiones ${performanceLabel(corn.performance?.week)}, mes ${performanceLabel(corn.performance?.month)} y YTD ${performanceLabel(corn.performance?.ytd)}.`,
                soyMeal && `Harina de soya: ${price(soyMeal)}; es una referencia de ingrediente y no el costo de una formulación ni de una entrega física en México.`,
                'Los futuros comparan contratos estandarizados. Base local, flete, calidad, humedad, tipo de cambio y términos de entrega pueden cambiar de forma material el precio pagado.',
            ].filter(Boolean),
            watchlist: [
                'Oferta y demanda: reportes de cosecha, condiciones climáticas, ritmo de siembra/cosecha, inventarios y exportaciones de los orígenes relevantes.',
                'Compra física: base regional, disponibilidad, costos portuarios y marítimos cuando aplique, flete y calidad entregada.',
                'Exposición: consumo mensual, cobertura vigente, moneda, fecha de compra y relación de sustitución entre ingredientes.',
            ],
            closing: 'La prioridad es traducir cada movimiento a costo por tonelada entregada y a días de inventario, no reaccionar únicamente al cierre de un futuro. Una lectura útil compara el precio contratado con el consumo, la formulación y las alternativas reales de suministro.',
            tables: [quoteTable('Precios, futuros y trayectoria de granos', grains, 'Porcentajes calculados con cierres diarios de Yahoo Finance. No incluye curva de vencimientos, base física, inventario, producción ni exportaciones; esos datos requieren sus fuentes primarias.')],
            visuals: [grainVisual].filter(Boolean),
            sections: [
                { heading: 'Qué pasó', text: grains.length ? `La tabla conserva el último cierre de ${grains.length} contratos y sus variaciones de sesión, cinco sesiones, un mes y YTD. ${leaderSentence(grainLeader, 'granos')}` : 'No se recibieron suficientes cierres agrícolas verificables para describir el corte.' },
                { heading: 'Por qué pasó', text: 'El contrato y su serie histórica muestran que hubo un cambio, pero no identifican su driver. Para explicar el movimiento deben contrastarse los reportes de oferta y demanda, clima, ritmo de exportaciones, condiciones de cultivo, inventarios y posicionamiento con fecha y mercado específico.' },
                { heading: 'Por qué importa', text: 'Maíz y harina de soya son referencias directas de ración; soya y trigo aportan contexto de sustitución y competencia por superficie o demanda. La transmisión hacia el costo de alimentación depende de la mezcla, la base regional, la logística, el tipo de cambio y la cobertura vigente.' },
                { heading: 'Qué debemos vigilar', text: 'Monitorea cada semana inventario físico, consumo proyectado, compras por fijar, calendario agrícola, condiciones de transporte, diferencial contra el futuro y exposición cambiaria. Vincula el tablero a un costo por tonelada entregada y a un umbral de margen, no sólo a variaciones porcentuales.' },
            ],
            sources: sourceList(grains.map(item => item.source)), sourceSnapshot: { grains },
        },
        {
            key: 'energy_metals', title: 'Energía y metales', eyebrow: 'Energía, transporte e insumos industriales', generatedAt,
            objective: 'Analizar las referencias de energía y metales que pueden transmitirse a combustible, transporte, logística, manufactura, construcción y actividad agroindustrial; distinguir la señal del contrato de los costos físicos de la operación.',
            summary: energy.length ? `Se observaron ${energy.length} referencias de energía y metales. ${leaderSentence(energyLeader, 'energía y metales')}` : 'No hubo suficientes cotizaciones verificables para este corte industrial.',
            metrics: energy.map(metric),
            takeaways: [
                energyLeader && `${energyLeader.label} concentra el mayor cambio porcentual absoluto de la sesión disponible (${performanceLabel(energyLeader.performance?.day)}); a un mes registra ${performanceLabel(energyLeader.performance?.month)}.`,
                wti && `WTI: ${price(wti)}; cinco sesiones ${performanceLabel(wti.performance?.week)} y YTD ${performanceLabel(wti.performance?.ytd)}. Es una referencia internacional, no el precio de diésel puesto en planta.`,
                'Gas natural, cobre y oro amplían la lectura de energía, industria y refugio, pero no permiten inferir por sí solos una dirección de costos para una empresa.',
                'Un efecto presupuestal requiere volumen, ruta, eficiencia, contrato, impuestos, precio local, moneda y fecha de entrega.',
            ].filter(Boolean),
            watchlist: [
                'Oferta y demanda energética, inventarios, capacidad de refinación, rutas, interrupciones logísticas y decisiones geopolíticas verificadas.',
                'Cotización física de combustible, flete y energía de la operación frente al contrato de referencia y su base local.',
                'Exposición de transporte, empaque, fertilización, maquinaria, manufactura y construcción por plazo y moneda.',
            ],
            closing: 'El informe sirve para detectar qué referencias merecen una revisión operativa. La decisión debe basarse en el costo físico contratado y en la sensibilidad de cada unidad de negocio, no únicamente en un futuro internacional.',
            tables: [quoteTable('Contratos, precios y trayectoria de energía y metales', energy, 'Porcentajes calculados con cierres diarios de Yahoo Finance. No se infieren spreads, inventarios, precios de diésel local ni costos de transporte a partir de estos contratos.')],
            visuals: [energyVisual].filter(Boolean),
            sections: [
                { heading: 'Qué pasó', text: energy.length ? `El corte compara ${energy.length} contratos de energía y metales. ${leaderSentence(energyLeader, 'energía y metales')}` : 'No se recibieron suficientes cierres verificables para describir el corte industrial.' },
                { heading: 'Por qué pasó', text: 'La serie muestra variación, no una causa demostrada. Antes de atribuir un movimiento a geopolítica, oferta, demanda, inventarios o actividad económica, valida el evento, la fecha, el contrato y el dato de mercado en la fuente primaria correspondiente.' },
                { heading: 'Por qué importa', text: 'WTI y gas ayudan a contextualizar energía, combustible, fertilizantes y transporte; cobre y oro aportan referencias industriales y de mercado. La transmisión a logística, manufactura, construcción o agro depende de contratos y costos físicos particulares.' },
                { heading: 'Qué debemos vigilar', text: 'Contrasta los precios de referencia con consumo de combustible, tarifas de flete, inventario crítico, calendario de entregas y presupuesto. Documenta el diferencial entre el precio internacional y el costo local antes de estimar un impacto o plantear una cobertura.' },
            ],
            sources: sourceList(energy.map(item => item.source)), sourceSnapshot: { energy },
        },
        {
            key: 'proteins', title: 'Mercado de proteínas', eyebrow: 'Cerdo, ganado y costo de alimentación', generatedAt,
            objective: 'Identificar señales de oferta, demanda y costo de alimentación en proteínas, comparando referencias de cerdo y ganado con harina de soya sin convertir contratos norteamericanos en un precio local, margen o recomendación comercial.',
            summary: proteins.length ? `El corte presenta ${proteins.length} referencias de proteína animal y alimento. ${leaderSentence(proteinLeader, 'proteínas')}` : 'No hubo suficientes referencias verificables para el corte de proteínas.',
            metrics: proteins.map(metric),
            takeaways: [
                proteinLeader && `${proteinLeader.label} registra ${performanceLabel(proteinLeader.performance?.day)} en la sesión y ${performanceLabel(proteinLeader.performance?.month)} en un mes; es una señal de contrato, no un precio de canal o de venta en México.`,
                pork && `Cerdo magro: ${price(pork)}; cinco sesiones ${performanceLabel(pork.performance?.week)} y YTD ${performanceLabel(pork.performance?.ytd)}.`,
                soyMeal && `Harina de soya: ${price(soyMeal)}; funciona como referencia de alimento dentro de la cadena, pero una formulación exige cantidades, sustitutos, bases y fletes específicos.`,
                'El margen se construye entre precio de venta, alimento, conversión, peso, sanidad, logística, mortalidad, procesamiento y canal; no puede deducirse de estos cuatro contratos.',
            ].filter(Boolean),
            watchlist: [
                'Producción, sacrificio, pesos, inventarios, comercio exterior, sanidad y demanda por especie en las fuentes sectoriales aplicables.',
                'Costo entregado de alimento, disponibilidad de ingredientes, conversión, inventario, formulación y exposición a maíz/harina de soya.',
                'Diferencial entre contrato de referencia, precio físico, tipo de cambio, costos logísticos y precio de venta propio.',
            ],
            closing: 'Una lectura ejecutiva de proteína debe seguir el margen por especie y canal, no sólo el precio de un futuro. Conviene actualizar el tablero con datos físicos y comerciales de la organización antes de traducir estas señales en compras, ventas o coberturas.',
            tables: [quoteTable('Proteínas y costo de alimentación: referencias de mercado', proteins, 'Porcentajes calculados con cierres diarios de Yahoo Finance. Cerdo y ganado son contratos norteamericanos; harina de soya es una referencia de alimento. No se incluyen producción, sacrificio, inventario o comercio físico.')],
            visuals: [proteinVisual].filter(Boolean),
            sections: [
                { heading: 'Qué pasó', text: proteins.length ? `El corte conserva ${proteins.length} referencias: cerdo magro, ganado vivo, ganado alimentado y harina de soya cuando la fuente los entrega. ${leaderSentence(proteinLeader, 'proteínas')}` : 'No se recibieron suficientes referencias verificables para describir el corte de proteínas.' },
                { heading: 'Por qué pasó', text: 'Los cierres de futuros muestran una variación pero no identifican una causa única. Para explicarla, se requieren datos por especie sobre oferta, sacrificio, pesos, consumo, exportaciones, importaciones, inventario, sanidad y costo de alimento, con fuente y fecha verificables.' },
                { heading: 'Por qué importa', text: 'El precio de proteína y el costo de alimento son extremos de una misma cadena de margen. Un movimiento favorable de venta puede no compensar alimento, logística o sanidad; un cambio de alimento puede transmitirse de forma distinta según conversión, inventario y contrato.' },
                { heading: 'Qué debemos vigilar', text: 'Integra al seguimiento los costos por kilogramo o tonelada, consumo de alimento, precio de canal, sacrificio, inventario, disponibilidad de insumos, tipo de cambio y demanda. Separa cada especie y canal antes de comparar márgenes o tomar decisiones.' },
            ],
            sources: sourceList(proteins.map(item => item.source)), sourceSnapshot: { proteins },
        },
        {
            key: 'market_news', title: 'Noticias de mercados', eyebrow: 'Agenda de fuentes abiertas', generatedAt,
            objective: 'Convertir cinco noticias verificadas en inteligencia de mercados: qué ocurrió, qué frente puede tocar, por qué importa, qué evidencia falta y qué debe monitorearse antes de escalar un titular a una decisión.',
            summary: headlines.length ? `El corte reúne ${headlines.length} historias verificadas. Cada una presenta primero el titular y después el contexto disponible; las fuentes y enlaces originales se concentran al final del informe.` : 'No llegaron titulares verificables de fuentes abiertas para este corte.',
            metrics: headlines.slice(0, 4).map(item => ({ label: marketNewsTopic(item), value: 'Historia verificada', change: item.publishedAt ? newsDate(item) : 'Sin hora', tone: 'flat' })),
            takeaways: headlines.slice(0, 5).map((item, index) => `${index + 1}. ${newsHeadline(item)} — ${newsDescription(item)}`).filter(Boolean),
            watchlist: [
                'Actualizaciones de cada medio y confirmación de fecha, alcance geográfico, contrato o mercancía mencionada.',
                'Reacción de precios e inventarios sólo después de confirmar que la historia afecta una exposición concreta.',
                'Eventos de clima, comercio, energía, logística o sanidad con responsable, umbral y señal de validación definidos.',
            ],
            closing: 'El informe organiza hechos para una conversación ejecutiva; no convierte titulares en causalidad ni en una recomendación de compra o venta. Cada historia requiere verificación en su fuente original y contraste con la exposición real del negocio.',
            tables: [reportTable('Cinco noticias y frente de seguimiento', ['Titular', 'De qué trata', 'Frente', 'Qué confirmar'], headlines.map(item => [newsHeadline(item), newsDescription(item).slice(0, 260), marketNewsTopic(item), newsImpact(item)]), 'La tabla prioriza el hecho y su contexto. Las fuentes y enlaces originales se reúnen al final del informe para no interrumpir la lectura.')],
            visuals: [marketNews].filter(Boolean),
            sections: [
                { heading: 'Qué pasó', text: headlines.length ? headlines.map((item, index) => `${index + 1}. ${newsHeadline(item)}\n${newsDescription(item)}`).join('\n\n') : 'No se obtuvo ninguna historia verificable. El informe no rellena esa ausencia con titulares inventados.' },
                { heading: 'Por qué pasó', text: headlines.length ? 'Los medios describen hechos y contexto, pero el titular por sí solo no demuestra la causa de un precio. La explicación debe verificarse en el material original y, cuando corresponda, contra reportes oficiales de oferta, inventarios, comercio, clima, energía, logística o sanidad.' : 'Sin historias verificables no se atribuye un driver de mercado.' },
                { heading: 'Por qué importa', text: headlines.length ? `Las historias se agrupan por posible frente de exposición: ${[...new Set(headlines.map(marketNewsTopic))].join(', ')}. El impacto real depende de qué producto, mercado, volumen, región y horizonte estén expuestos.` : 'No hay un frente de impacto verificable sin historias conectadas.' },
                { heading: 'Qué debemos vigilar', text: 'Antes de elevar una nota, define el activo o costo afectado, el horizonte, la fuente primaria, el dato que confirmaría el impacto y la persona responsable. Distingue una actualización editorial de un cambio confirmado de precio, inventario o flujo físico.' },
            ],
            sourceLinks: newsSourceLinks, headlines, sources: newsSources, sourceSnapshot: { headlines },
        },
    ];
    const enriched = await executiveReportAgent.enrich(reports, { area: 'Mercados' });
    return { reports: enriched.map(report => ({ ...report, content: marketExecutiveDocument(report) })), generatedAt };
}

async function refreshMarketExecutiveReports() {
    if (_marketReportRefresh) return _marketReportRefresh;
    _marketReportRefresh = (async () => {
        const previous = _marketReportMemory || await executiveReportStore.load().catch(() => null);
        const { reports, generatedAt } = await buildMarketExecutiveReports();
        const news = reports.find(report => report.key === 'market_news');
        const priorNews = previous?.reports?.find(report => report.key === 'market_news');
        if (news && !news.headlines?.length && priorNews?.headlines?.length) {
            news.headlines = priorNews.headlines;
            news.summary = `Las fuentes abiertas no entregaron historias nuevas para este corte. Se conserva la última selección verificable del ${new Date(priorNews.generatedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}; confirma su vigencia antes de utilizarla.`;
            news.metrics = priorNews.metrics || [];
            news.takeaways = priorNews.takeaways || [];
            news.watchlist = priorNews.watchlist || news.watchlist;
            news.tables = priorNews.tables || [];
            news.visuals = priorNews.visuals || [];
            news.sections = priorNews.sections || marketNewsNarrative(priorNews.headlines);
            news.sourceLinks = priorNews.sourceLinks || [];
            news.sources = sourceList([...(priorNews.sources || []), 'Último corte verificable conservado por indisponibilidad temporal de fuentes']);
            news.sourceSnapshot = { ...(priorNews.sourceSnapshot || {}), preservedFrom: priorNews.generatedAt };
            news.content = marketExecutiveDocument(news);
        }
        _marketReportMemory = await executiveReportStore.save(reports, generatedAt).catch(error => {
            console.warn('[market-reports] No se pudo persistir en Supabase:', error.message);
            return { reports, generatedAt, persistence: 'memory' };
        });
        return _marketReportMemory;
    })().finally(() => { _marketReportRefresh = null; });
    return _marketReportRefresh;
}
function reportIsCurrent(snapshot) { return snapshot?.generatedAt && Date.now() - Date.parse(snapshot.generatedAt) < MARKET_REPORT_TTL; }
function allowsReportRefresh(req) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const expected = process.env.CRON_SECRET || process.env.REFRESH_SECRET;
    return Boolean(expected && token && token === expected);
}
router.get('/market-executive-reports', verifyToken, async (req, res) => {
    try {
        let snapshot = _marketReportMemory || await executiveReportStore.load().catch(() => null);
        // El cron diario mantiene el mismo corte durante el día. Sólo se crea
        // uno bajo demanda cuando el almacén aún no tiene informes.
        if (!snapshot?.reports?.length) snapshot = await refreshMarketExecutiveReports();
        res.set('Cache-Control', 'private, max-age=300');
        res.json({ success: true, data: snapshot.reports, generatedAt: snapshot.generatedAt, nextRefreshAt: nextReportRefreshAt(snapshot.generatedAt).toISOString(), persistence: snapshot.persistence });
    } catch (error) {
        console.error('/api/market-executive-reports:', error.message);
        res.status(502).json({ success: false, error: 'No se pudieron actualizar los informes de Mercados.' });
    }
});
router.get('/market-executive-reports/refresh', async (req, res) => {
    if (!allowsReportRefresh(req)) return res.status(401).json({ success: false, error: 'No autorizado.' });
    try {
        const snapshot = await refreshMarketExecutiveReports();
        res.json({ success: true, generatedAt: snapshot.generatedAt, reports: snapshot.reports.length, persistence: snapshot.persistence });
    } catch (error) {
        console.error('/api/market-executive-reports/refresh:', error.message);
        res.status(502).json({ success: false, error: 'No se pudieron actualizar los informes de Mercados.' });
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

function startMarketExecutiveReportsScheduler() {
    return scheduleDailyReport(refreshMarketExecutiveReports, 'market-reports');
}

module.exports = { router, initCommodityWarmer, startMarketExecutiveReportsScheduler, refreshMarketExecutiveReports };
