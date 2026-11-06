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
const { getProteinSourceConnectionStatus } = require('../lib/protein-source-ingestion');
const {
    usdaNassLivestockSnapshot, eurostatPigmeatSnapshot, ibgeSlaughterSnapshot, statcanHogProductionSnapshot,
    usdaAmsProteinSnapshot, faoFpmaMexicoFeedSnapshot,
} = require('../ai/protein-training-sources');
const { verifyToken } = require('./auth');
const executiveReportStore = require('../services/market-report-store');
const { executiveReportAgent } = require('../ai/executive-report-agent');
const { enrichSectorReport } = require('../lib/report-sector-format');
const {quotePoints,indexedVisual:comparisonVisual}=require('../lib/report-observations');
const {nextMarketReportRefreshAt,marketReportRefreshDue,scheduleMarketReport}=require('../lib/report-schedule');
const {reportDeadline}=require('../lib/report-deadline');
const {loadGlobalCommodities,config:COMMODITY_MARKETS}=require('../lib/report-global-commodities');
const {loadReportMarketFx,loadReportOpenInterest}=require('../lib/report-market-context');
const {withDailyEvidence}=require('../lib/report-daily-evidence');
const {loadProteinPrices,proteinPricesDue,config:PROTEIN_MARKETS}=require('../lib/report-protein-prices');
const {loadMercolleidaReport}=require('../lib/report-mercolleida');
const isPhysicalProtein=item=>item?.provider==='mercolleida' || PROTEIN_MARKETS.markets.some(market=>market.provider===item?.provider);
const {loadPrimaryNews,selectDiverseNews}=require('../lib/report-primary-news');

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

// Cotizaciones físicas de Puebla investigadas por Gemini con búsqueda web.
// El caché vive en el servidor durante 12 h. La primera consulta espera la
// verificación; así la página nunca recibe el caché nacional anterior mientras
// la actualización local ocurre en segundo plano.
// Esta consulta puede activar investigación asistida por Gemini. La sección
// correspondiente ya está protegida en React, así que el backend debe aplicar
// la misma regla y no permitir consumo anónimo del proveedor.
router.get('/proteinas/precios-comerciales', verifyToken, async (req, res) => {
    try {
        const data = await getGeminiWholesalePrices({ background: false });
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

// Auditoría de conectividad: expone fecha, tipo de respuesta y error técnico
// de cada portal, nunca claves ni contenido privado del proveedor.
router.get('/proteinas/fuentes/estado', (req, res) => {
    res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
    res.json(getProteinSourceConnectionStatus());
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
    statcan: statcanHogProductionSnapshot,
    'usda-ams': usdaAmsProteinSnapshot,
    'fao-fpma': faoFpmaMexicoFeedSnapshot,
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
    // Muestra líquida y diversa de emisoras BMV. No se etiqueta como el universo
    // completo del IPC: cada fila llega directamente del ticker correspondiente.
    { ticker:'AMXL.MX',     symbol:'AMXL',    name:'América Móvil',  type:'stock',     bucket:'bmv'      },
    { ticker:'GRUMAB.MX',   symbol:'GRUMA',   name:'Gruma',          type:'stock',     bucket:'bmv'      },
    { ticker:'BIMBOA.MX',   symbol:'BIMBO',   name:'Bimbo',          type:'stock',     bucket:'bmv'      },
    { ticker:'FEMSAUBD.MX', symbol:'FEMSA',   name:'FEMSA',          type:'stock',     bucket:'bmv'      },
    { ticker:'WALMEX.MX',   symbol:'WALMEX',  name:'Walmart México', type:'stock',     bucket:'bmv'      },
    { ticker:'CEMEXCPO.MX', symbol:'CEMEX',   name:'Cemex CPO',      type:'stock',     bucket:'bmv'      },
    { ticker:'GMEXICOB.MX', symbol:'GMEXICO', name:'Grupo México',   type:'stock',     bucket:'bmv'      },
    { ticker:'GFNORTEO.MX', symbol:'GFNORTE', name:'Banorte',        type:'stock',     bucket:'bmv'      },
    { ticker:'KOFUBL.MX',   symbol:'KOF',     name:'Coca-Cola FEMSA',type:'stock',     bucket:'bmv'      },
    { ticker:'AC.MX',       symbol:'AC',      name:'Arca Continental', type:'stock',   bucket:'bmv'      },
    { ticker:'GAPB.MX',     symbol:'GAP',     name:'GAP',            type:'stock',     bucket:'bmv'      },
    { ticker:'ASURB.MX',    symbol:'ASUR',    name:'ASUR',           type:'stock',     bucket:'bmv'      },
    { ticker:'TLEVISACPO.MX', symbol:'TELEVISA', name:'Grupo Televisa', type:'stock',  bucket:'bmv'      },
    { ticker:'BOLSAA.MX',   symbol:'BOLSA',   name:'Bolsa Mexicana de Valores', type:'stock', bucket:'bmv' },
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
        previousPrice:Number.isFinite(previous) ? previous : null,
        currency:meta.currency || (asset.ticker.endsWith('.MX') ? 'MXN' : 'USD'),
        observedAt:Number.isFinite(meta.regularMarketTime) ? new Date(meta.regularMarketTime*1000).toISOString() : null,
        series:quotePoints(result.indicators?.quote?.[0]?.close || [],result.timestamp || []),
        sourceUrl:`https://finance.yahoo.com/quote/${encodeURIComponent(asset.ticker)}/`,
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

async function getBmvMarket() {
    const age = Date.now() - _bmvCache.ts;
    if (_bmvCache.data && age < BMV_TTL) return _bmvCache.data;
    if (_bmvCache.data) {
        _refreshBmvYahoo().catch(err => console.error('[bmv] refresh:', err.message));
        return _bmvCache.data;
    }
    return _refreshBmvYahoo();
}
router.get('/bmv-market', async (req, res) => {
    res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    try {
        res.json(await getBmvMarket());
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

    return { name: `${fn} (Yahoo Finance · ${spec.ticker})`, unit: spec.unidad, interval: 'monthly', priceBasis: 'futures', currentMonthPartial: true, data: puntos };
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
const { BoundedCache, createSingleFlight } = require('../lib/bounded-cache');
const _stockCache    = new BoundedCache();
const stockFlight = createSingleFlight();
const STOCK_TTL      = 15 * 60 * 1000;
const YAHOO_INTERVALS = new Set(['1m', '5m', '15m', '30m', '1h', '1d', '1wk', '1mo']);
const YAHOO_RANGES    = new Set(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '3y', '4y', '5y', '10y', '20y', 'ytd', 'max']);

router.get('/stock-history', async (req, res) => {
    if (Object.keys(req.query).some(key => !['ticker', 'interval', 'range'].includes(key))
        || ['ticker', 'interval', 'range'].some(key => req.query[key] != null && typeof req.query[key] !== 'string')) {
        return res.status(400).json({ error: 'Parámetros inválidos.' });
    }
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

    // Algunos horizontes extensos no son rangos nativos estables de Yahoo.
    // Se construyen con fechas explícitas para que 20 años signifique 20 años,
    // en lugar de degradar silenciosamente a "max" o a una ventana menor.
    let url;
    if (range === '3y' || range === '4y' || range === '20y') {
        const years   = Number.parseInt(range, 10);
        const period2 = Math.floor(Date.now() / 1000);
        const period1 = Math.floor(period2 - years * 365.25 * 24 * 3600);
        url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&period1=${period1}&period2=${period2}`;
    } else {
        url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
    }

    try {
        const payload = await stockFlight(key, async () => {
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

            _stockCache.set(key, { ts: Date.now(), data: payload });
            return payload;
        });
        res.json(payload);
    } catch (err) {
        console.error('/api/stock-history error:', err.message);
        if (hit) return res.json(hit.data);
        if (err.code === 'UPSTREAM_BUSY') res.set('Retry-After', '5');
        res.status(err.code === 'UPSTREAM_BUSY' ? 503 : 502).json({ error: 'Cotización temporalmente no disponible.' });
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
    '^GSPC', '^NDX', '^VIX', '^GSPTSE', '^SPCDNX', '^MXX', '^MERV', '^BVSP',
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
let _marketReportMemory = null;
let _marketReportRefresh = null;

function reportNumber(value, maximumFractionDigits = 2) {
    return Number.isFinite(value) ? new Intl.NumberFormat('es-MX', { maximumFractionDigits }).format(value) : '—';
}
function reportChange(value) {
    return Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` : 'Sin variación verificable';
}
function sourceList(items) { return [...new Set(items.filter(Boolean))]; }

function performanceLabel(value) {
    return Number.isFinite(value) ? reportChange(value) : 'Sin serie comparable';
}

function reportTable(title, columns, rows, note = '') {
    return { title, columns, rows: rows.filter(row => Array.isArray(row) && row.length), note };
}

function indexedVisual(title, items, note) {
    return comparisonVisual(title,items,note);
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

function marketNewsVisual(headlines) {
    const totals = new Map();
    headlines.forEach(item => {
        const topic = marketNewsTopic(item);
        totals.set(topic, (totals.get(topic) || 0) + 1);
    });
    const bars = [...totals.entries()].map(([label, value]) => ({ label, value }));
    return bars.length ? { type: 'bar', title: 'Agenda de noticias por frente', unit: 'historias verificadas', note: 'Clasificación por el texto de los cinco titulares; organiza seguimiento y no mide por sí sola la magnitud del impacto.', bars } : null;
}

function marketNewsIso(value) {
    const text = String(value || '').trim();
    const compact = text.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
    if (compact) return new Date(`${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`).toISOString();
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function marketRawNewsSnapshot() {
    const keywords=/commodit|agricultur|grain|crop|energy|oil|gas|metal|copper|livestock|pork|beef|protein|feed|shipping|freight|tariff|trade war|trade policy|export|import/i;
    const query='(commodities OR agriculture OR grains OR energy OR metals OR livestock OR protein OR freight)';
    const tasks=[
        ['Organismos primarios · FAO, OMC y EIA',()=>loadPrimaryNews({area:'markets'})],
        ['Finnhub · fuentes editoriales conectadas',async()=>{
            if(!process.env.FINNHUB_TOKEN) return [];
            const response=await externalGet('https://finnhub.io/api/v1/news?category=general&token='+encodeURIComponent(process.env.FINNHUB_TOKEN),{},10000);
            if(!response.ok) throw Error('Finnhub no disponible');
            return (await response.json() || []).filter(item=>keywords.test((item.headline || '')+' '+(item.summary || ''))).map(item=>({title:item.headline,source:item.source || 'Finnhub',url:item.url || '',publishedAt:item.datetime ? new Date(item.datetime*1000).toISOString() : '',description:item.summary || ''}));
        }],
        ['NewsAPI · fuentes editoriales conectadas',async()=>{
            if(!process.env.NEWSAPI_KEY) return [];
            const response=await externalGet('https://newsapi.org/v2/everything?q='+encodeURIComponent(query)+'&language=en&pageSize=15&sortBy=publishedAt&apiKey='+encodeURIComponent(process.env.NEWSAPI_KEY),{Accept:'application/json'},12000);
            if(!response.ok) throw Error('NewsAPI no disponible');
            return ((await response.json())?.articles || []).map(item=>({title:item.title,source:item.source?.name || 'NewsAPI',url:item.url || '',publishedAt:marketNewsIso(item.publishedAt),description:item.description || item.content || ''}));
        }],
        ['GDELT · agregación de fuentes abiertas',async()=>{
            const response=await externalGet('https://api.gdeltproject.org/api/v2/doc/doc?query='+encodeURIComponent(query)+'&mode=ArtList&format=json&maxrecords=6&sort=HybridRel',{Accept:'application/json','User-Agent':'VALLNews/1.0'},12000);
            if(!response.ok) throw Error('GDELT no disponible');
            return ((await response.json())?.articles || []).map(item=>({title:item.title,source:item.domain || 'GDELT',url:item.url || '',publishedAt:marketNewsIso(item.seendate),description:item.seentext || ''}));
        }],
    ];
    // Los plazos son por fuente: una caída del respaldo no descarta las noticias
    // que otra fuente ya entregó. La prioridad editorial se conserva al combinar.
    const results=await Promise.allSettled(tasks.map(([,load])=>reportDeadline(load,12000)));
    const articles=[];
    results.forEach(result=>{
        if(result.status!=='fulfilled') return;
        for(const item of result.value) {
            const title=String(item.title || '').trim(),url=String(item.url || '').trim();
            if(!title || articles.some(previous=>previous.title.toLowerCase()===title.toLowerCase() && previous.url===url)) continue;
            articles.push({...item,title,url,description:String(item.description || '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,620)});
        }
    });
    const selected=selectDiverseNews(articles,{limit:12,maxPerSource:2});
    return {articles:selected,source:sourceList(selected.map(item=>item.source)).join(' · ')};
}

async function marketNewsSnapshot(){const cutoff=new Date().toISOString(),data=await require('../lib/report-market-news').loadMarketNews({cutoff,other:marketRawNewsSnapshot().then(result=>result.articles).catch(()=>[])});return {articles:data.stories,source:[...new Set(data.stories.map(item=>item.source))].join(' · ')};}

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
    ].filter(Boolean).join('\n\n');
}

// se pueede incrementar el valor de la base de ddatos en base a los datos y mopdelo mcp integrados

async function buildMarketExecutiveReports(previousSnapshot) {
    const previous=previousSnapshot?.reports?.find(report=>report.key==='proteins')?.sourceSnapshot?.proteins || [];
    const [catalog,physicalProteins,mercolleidaTables,marketFx,marketOpenInterest]=await Promise.all([loadGlobalCommodities({previous:previousSnapshot?.reports?.flatMap(report=>['grains','energy','proteins'].flatMap(key=>report.sourceSnapshot?.[key] || [])) || []}),loadProteinPrices({previous}),loadMercolleidaReport({previous:previousSnapshot?.reports?.find(report=>report.key==='proteins')?.tables || []}),loadReportMarketFx({previous:previousSnapshot?.reports?.find(report=>report.marketFx)?.marketFx}),loadReportOpenInterest({previous:previousSnapshot?.reports?.find(report=>report.marketOpenInterest)?.marketOpenInterest})]);
    const quote=(ticker)=>Promise.resolve(catalog.find(item=>item.ticker===ticker)).then(item=>{if(!item)throw Error('Contrato fuera de catálogo');return item;});
    const [grainsSettled, energySettled, proteinsSettled, newsSettled, officialProteinSettled] = await Promise.all([
        Promise.allSettled(catalog.filter(item=>item.bucket==='grains').map(item=>quote(item.ticker))),
        Promise.allSettled(catalog.filter(item=>item.bucket==='energy').map(item=>quote(item.ticker))),
        Promise.allSettled(catalog.filter(item=>item.bucket==='proteins' || item.alsoProtein).map(item=>quote(item.ticker))),
        // Las noticias no pueden cancelar los cuatro informes de precios si
        // GDELT aplica cuota o una fuente editorial está temporalmente caída.
        reportDeadline(marketNewsSnapshot).catch(error => {
            console.warn('[market-reports] Noticias no disponibles:', error.message);
            return { articles: [], source: '' };
        }),
        // Los contratos se complementan con indicadores físicos oficiales.
        // Cada proveedor es tolerante a fallas: una actualización externa no
        // bloquea el informe ni convierte un dato ausente en una estimación.
        Promise.allSettled([
            ...[statcanHogProductionSnapshot,eurostatPigmeatSnapshot,ibgeSlaughterSnapshot].map(load=>reportDeadline(load)),
        ]),
    ]);
    const grains = grainsSettled.filter(item => item.status === 'fulfilled').map(item => item.value);
    const energy = energySettled.filter(item => item.status === 'fulfilled').map(item => item.value);
    const proteins = [...proteinsSettled.filter(item => item.status === 'fulfilled').map(item => item.value),...physicalProteins,...(mercolleidaTables.quotes || [])];
    // La consulta de noticias ya devuelve un objeto tolerante a fallas (no un
    // resultado de Promise.allSettled). Leer `.status` aquí la descartaba por
    // completo aunque Finnhub o NewsAPI hubieran entregado cinco historias.
    const news = newsSettled && typeof newsSettled === 'object' ? newsSettled : { articles: [], source: '' };
    const headlines = news.articles || [];
    const officialProtein = Array.isArray(officialProteinSettled)
        ? officialProteinSettled.filter(item => item.status === 'fulfilled').map(item => item.value).filter(item=>item && typeof item==='object')
        : [];
    const byOfficialSource = id => officialProtein.find(item => item?.source_id === id);
    const statcanProtein = byOfficialSource('statcan_hog_production');
    const eurostatProtein = byOfficialSource('eurostat_pigmeat_eu27');
    const ibgeProtein = byOfficialSource('ibge_sidra_slaughter');
    const officialProteinSources = officialProtein.map(item => item.source_name).filter(Boolean);
    const officialProteinRows = [];
    const officialProteinTakeaways = [];
    const canadaHogs = statcanProtein?.payload?.annual_production?.hogs;
    if (canadaHogs && Number.isFinite(canadaHogs.value)) {
        officialProteinRows.push(['Canadá · cerdo', 'Producción estimada', `${reportNumber(canadaHogs.value)} ${canadaHogs.unit || 'tonnes'}`, String(canadaHogs.period || 'Sin periodo'), 'Statistics Canada']);
        officialProteinTakeaways.push(`Canadá: Statistics Canada reporta producción estimada de carne de cerdo de ${reportNumber(canadaHogs.value)} ${canadaHogs.unit || 'toneladas'} para ${canadaHogs.period || 'el último periodo publicado'}; es un indicador físico anual, no una cotización.`);
    }
    if (eurostatProtein?.payload && Number.isFinite(eurostatProtein.payload.value)) {
        officialProteinRows.push(['UE-27 · cerdo', 'Producción mensual', `${reportNumber(eurostatProtein.payload.value)} ${eurostatProtein.payload.unit || 'thousand_tonnes'}`, String(eurostatProtein.payload.period || 'Sin periodo'), 'Eurostat']);
        officialProteinTakeaways.push(`UE-27: Eurostat publica ${reportNumber(eurostatProtein.payload.value)} ${eurostatProtein.payload.unit || 'miles de toneladas'} de producción de carne de cerdo para ${eurostatProtein.payload.period || 'el último periodo disponible'}; su frecuencia y unidad son distintas a las de los futuros.`);
    }
    const brazilHogs = ibgeProtein?.payload?.slaughter?.hogs;
    if (brazilHogs && Number.isFinite(brazilHogs.value)) {
        officialProteinRows.push(['Brasil · cerdo', 'Sacrificio', `${reportNumber(brazilHogs.value)} ${brazilHogs.unit || ''}`.trim(), String(brazilHogs.period || 'Sin periodo'), 'IBGE SIDRA']);
        officialProteinTakeaways.push(`Brasil: IBGE registra ${reportNumber(brazilHogs.value)} ${brazilHogs.unit || 'cabezas'} de sacrificio porcino en ${brazilHogs.period || 'el último periodo disponible'}; no es equivalente a producción ni a precio.`);
    }
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
            sources: sourceList([...grains,...energy,...proteins].map(item=>item.source).concat(news.source)), sourceLinks:[...grains,...energy,...proteins].filter(item=>item.url).map(item=>({label:item.label+' · '+item.source,url:item.url})).slice(0,40), sourceSnapshot: { grains, energy, proteins, headlines },
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
            sources: sourceList(grains.map(item => item.source)),sourceLinks:grains.filter(item=>item.url).map(item=>({label:item.label+' · '+item.source,url:item.url})), sourceSnapshot: { grains },
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
            sources: sourceList(energy.map(item => item.source)),sourceLinks:energy.filter(item=>item.url).map(item=>({label:item.label+' · '+item.source,url:item.url})), sourceSnapshot: { energy },
        },
        {
            key: 'proteins', title: 'Mercado de proteínas', eyebrow: 'Pollo, huevo, pescado, procesados, ganado y alimento', generatedAt,
            objective: 'Revisar precios físicos internacionales de pollo, huevo, pescado y procesados junto con referencias de ganado y alimento. Comparar sólo las dos últimas publicaciones de fuentes diarias, conservando fechas, unidades, presentación y frecuencia.',
            summary: proteins.length ? `El corte presenta ${proteins.length} referencias de proteína animal y alimento. ${leaderSentence(proteinLeader, 'proteínas')}${officialProteinTakeaways.length ? ` Se añadieron ${officialProteinTakeaways.length} indicadores físicos oficiales de Canadá, Unión Europea y Brasil cuando estuvieron disponibles.` : ''}` : 'No hubo suficientes referencias verificables para el corte de proteínas.',
            metrics: proteins.map(metric),
            takeaways: [
                proteinLeader && `${proteinLeader.label} registra ${performanceLabel(proteinLeader.performance?.day)} entre sus dos últimas publicaciones diarias; confirmar país, unidad y presentación antes de trasladarlo al costo propio.`,
                pork && `Cerdo magro: ${price(pork)}; referencia de futuros, no precio físico de un corte.`,
                'Pollo congelado y refrigerado de Brasil, huevo y salmón en Rungis: precios físicos con fechas de cada publicación. Pollo de Francia, salmón ahumado y surimi: contexto semanal; huevo líquido: indicador mensual.',
                soyMeal && `Harina de soya: ${price(soyMeal)}; funciona como referencia de alimento dentro de la cadena, pero una formulación exige cantidades, sustitutos, bases y fletes específicos.`,
                ...officialProteinTakeaways,
                'El margen depende de venta, alimento, rendimiento, sanidad, logística, procesamiento y canal. Una cotización internacional no equivale al costo entregado local.',
            ].filter(Boolean),
            watchlist: [
                'Producción, sacrificio, pesos, inventarios, comercio exterior, sanidad y demanda por especie en las fuentes sectoriales aplicables.',
                'Costo entregado de alimento, disponibilidad de ingredientes, conversión, inventario, formulación y exposición a maíz/harina de soya.',
                'Diferencial entre contrato de referencia, precio físico, tipo de cambio, costos logísticos y precio de venta propio.',
            ],
            closing: 'Una lectura ejecutiva de proteína debe seguir el margen por especie y canal, no sólo el precio de un futuro. Conviene actualizar el tablero con datos físicos y comerciales de la organización antes de traducir estas señales en compras, ventas o coberturas.',
            tables: [
                officialProteinRows.length && reportTable('Oferta física internacional: indicadores oficiales', ['Mercado', 'Indicador', 'Último dato', 'Periodo', 'Fuente'], officialProteinRows, 'Los indicadores físicos usan frecuencias y unidades distintas. Se presentan como contexto de oferta, sin convertirlos en precio local ni en margen.'),
                ...mercolleidaTables,
            ].filter(Boolean),
            visuals: [proteinVisual].filter(Boolean),
            sections: [
                { heading: 'Qué pasó', text: `El corte conserva ${proteins.length} referencias: pollo, huevo, pescado y procesados físicos, junto con futuros de ganado, cerdo y alimento. Sólo se compara la última publicación diaria con la anterior; los precios semanales y mensuales se muestran con su fecha original. ${officialProteinTakeaways.join(' ')}` },
                { heading: 'Por qué pasó', text: 'Un precio por sí solo no identifica una causa. Pollo exige contrastar sacrificio, cortes y demanda; huevo, postura, calibre y sanidad; pescado, capturas, acuicultura, talla y cadena fría; procesados, materia prima, rendimiento, energía y contratos. Las explicaciones requieren evidencia fechada de la misma plaza y presentación.' },
                { heading: 'Por qué importa', text: 'El precio de proteína y el costo de alimento son extremos de una misma cadena de margen. Un movimiento favorable de venta puede no compensar alimento, logística o sanidad; un cambio de alimento puede transmitirse de forma distinta según conversión, inventario y contrato.' },
                { heading: 'Qué debemos vigilar', text: 'Integra al seguimiento los costos por kilogramo o tonelada, consumo de alimento, precio de canal, sacrificio, inventario, disponibilidad de insumos, tipo de cambio y demanda. Separa cada especie y canal antes de comparar márgenes o tomar decisiones.' },
            ],
            sources: sourceList([...proteins.map(item => item.source), ...officialProteinSources]), sourceLinks:proteins.filter(item=>item.url).map(item=>({label:item.label+' · '+item.source,url:item.url})), sourceSnapshot: { proteins, officialProtein },
        },
        require('../lib/report-market-news').buildMarketNewsReport({stories:headlines,generatedAt}),
    ];
    const proteinReport=reports.find(report=>report.key==='proteins');if(proteinReport){proteinReport.proteinMarketContext=mercolleidaTables.context || [];proteinReport.proteinFeed=catalog.filter(item=>['ZC=F','ZM=F'].includes(item.symbol || item.ticker));proteinReport.proteinFundamentals=await require('../lib/report-protein-fundamentals').loadProteinFundamentals({cutoff:generatedAt,previous:previousSnapshot?.reports?.find(item=>item.key==='proteins')?.proteinFundamentals || []});}
    if(mercolleidaTables.length && proteinReport){proteinReport.sources.push('Mercolleida · tendencias y comentarios públicos');proteinReport.sourceLinks.push({label:'Mercolleida · tendencias y comentarios públicos',url:'https://www.mercolleida.com/es/'});}
    const enriched = await executiveReportAgent.enrich(reports, { area: 'Mercados' });
    return { reports: enriched.map(report => withDailyEvidence({ ...report,marketFx,marketOpenInterest,commodityCatalogVersion:COMMODITY_MARKETS.version,...(['proteins','overview'].includes(report.key) ? {proteinCatalogVersion:PROTEIN_MARKETS.version,proteinPricesCheckedAt:generatedAt} : {}), content: report.key==='market_news' ? '' : marketExecutiveDocument(report) })), generatedAt };
}

async function refreshMarketExecutiveReports(previousSnapshot,{force=false}={}) {
    if (_marketReportRefresh) return _marketReportRefresh;
    _marketReportRefresh = (async () => {
        const previous = previousSnapshot===undefined ? _marketReportMemory || await executiveReportStore.load().catch(() => null) : previousSnapshot;
        if(!force && !marketReportRefreshDue(previous)){_marketReportMemory=previous;return previous;}
        const { reports, generatedAt } = await buildMarketExecutiveReports(previous);
        const newsIndex=reports.findIndex(report=>report.key==='market_news'),priorNews=previous?.reports?.find(report=>report.key==='market_news');
        if(newsIndex>=0 && !reports[newsIndex].marketNews?.length && priorNews)reports[newsIndex]=require('../lib/report-market-news').buildMarketNewsReport({stories:priorNews.marketNews || priorNews.headlines || [],generatedAt,status:'unavailable'});
        const {withPreviousDailyEvidence}=require('../lib/report-daily-evidence');
        for(let index=0;index<reports.length;index++) if(reports[index].key!=='market_news') reports[index]=withPreviousDailyEvidence(reports[index],previous?.reports?.find(item=>item.key===reports[index].key));
        const {loadReportDerivatives,attachReportDerivatives}=require('../lib/report-commodity-derivatives');
        const derivatives=await loadReportDerivatives({cutoff:generatedAt,refresh:true});
        const integrated=require('../lib/report-market-overview').composeMarketOverview(attachReportDerivatives({reports,generatedAt},derivatives,{generatedAt}));
        _marketReportMemory = await executiveReportStore.save(integrated.reports, generatedAt).catch(error => {
            console.warn('[market-reports] No se pudo persistir en Supabase:', error.message);
            return { reports:integrated.reports, generatedAt, persistence: 'memory' };
        });
        return _marketReportMemory;
    })().finally(() => { _marketReportRefresh = null; });
    return _marketReportRefresh;
}

function allowsReportRefresh(req) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const expected = process.env.CRON_SECRET || process.env.REFRESH_SECRET;
    return Boolean(expected && token && token === expected);
}
let _globalCoverageRefresh=null;
async function ensureGlobalMarketCoverage(snapshot) {
    if(!snapshot?.reports?.length || snapshot.reports.every(report=>report.commodityCatalogVersion===COMMODITY_MARKETS.version)) return snapshot;
    if(_globalCoverageRefresh) return _globalCoverageRefresh;
    _globalCoverageRefresh=(async()=>{
        const previous=snapshot.reports.flatMap(report=>['grains','energy','proteins'].flatMap(key=>report.sourceSnapshot?.[key] || []));
        const startedAt=new Date().toISOString(),[quotes,marketFx,marketOpenInterest]=await Promise.all([loadGlobalCommodities({cutoff:startedAt,previous}),loadReportMarketFx({cutoff:startedAt,previous:snapshot.reports.find(report=>report.marketFx)?.marketFx}),loadReportOpenInterest({cutoff:startedAt,previous:snapshot.reports.find(report=>report.marketOpenInterest)?.marketOpenInterest})]);
        const generatedAt=new Date().toISOString(),{withDailyEvidence}=require('../lib/report-daily-evidence'),{weeklyReport}=await import('../../shared/report-weekly.mjs');
        const groups={grains:quotes.filter(item=>item.bucket==='grains'),energy:quotes.filter(item=>item.bucket==='energy'),proteins:[...quotes.filter(item=>item.bucket==='proteins' || item.alsoProtein),...(snapshot.reports.find(report=>report.key==='proteins')?.sourceSnapshot?.proteins || []).filter(isPhysicalProtein)]};
        const reports=snapshot.reports.map(report=>{
            const keys=report.key==='overview' ? ['grains','energy','proteins'] : report.key==='energy_metals' ? ['energy'] : groups[report.key] ? [report.key] : [];
            const sources=keys.flatMap(key=>groups[key]),sourceLinks=[...new Map([...sources.filter(item=>item.url).map(item=>({label:item.label+' · '+item.exchange+' · '+item.source,url:item.url})),...(report.sourceLinks || [])].map(item=>[item.url,item])).values()].slice(0,40);
            const updated=withDailyEvidence({...report,generatedAt,marketFx,marketOpenInterest,commodityCatalogVersion:COMMODITY_MARKETS.version,marketHistory:undefined,sessionObservations:undefined,dailyReferences:undefined,sourceSnapshot:{...report.sourceSnapshot,...Object.fromEntries(keys.map(key=>[key,groups[key]]))},sources:sourceList([...sources.map(item=>item.source),...(report.sources || [])]),sourceLinks,tables:keys.length ? (report.tables || []).filter(table=>table.kind==='guide' || /oficial|Oferta física|^Mercolleida ·/.test(table.title)) : report.tables});
            updated.summary=weeklyReport({...updated,collection:'markets'}).summary;
            return updated;
        });
        const current=_marketReportMemory || snapshot;if(Date.parse(current.generatedAt)>Date.parse(startedAt))return current;
        _marketReportMemory=await executiveReportStore.save(reports,generatedAt);return _marketReportMemory;
    })().finally(()=>{_globalCoverageRefresh=null;});
    return _globalCoverageRefresh;
}
let _proteinCoverageRefresh=null;
async function ensureProteinMarketCoverage(snapshot,{force=false}={}) {
    const protein=snapshot?.reports?.find(report=>report.key==='proteins');
    if(!protein || !force && !proteinPricesDue(protein) && Array.isArray(protein.proteinMarketContext) && Array.isArray(protein.proteinFundamentals))return snapshot;
    if(_proteinCoverageRefresh)return _proteinCoverageRefresh;
    _proteinCoverageRefresh=(async()=>{
        const startedAt=new Date().toISOString(),[physical,mercolleidaTables,fundamentals]=await Promise.all([loadProteinPrices({previous:protein.sourceSnapshot?.proteins || [],cutoff:startedAt}),loadMercolleidaReport({previous:protein.tables || [],cutoff:startedAt}),require('../lib/report-protein-fundamentals').loadProteinFundamentals({cutoff:startedAt,previous:protein.proteinFundamentals || []})]);
        const generatedAt=new Date().toISOString(),{withDailyEvidence}=require('../lib/report-daily-evidence'),{weeklyReport}=await import('../../shared/report-weekly.mjs');
        const current=_marketReportMemory || snapshot;
        if(Date.parse(current.generatedAt)>Date.parse(startedAt))return current;
        const reports=current.reports.map(report=>{
            if(!['proteins','overview'].includes(report.key))return report;
            const proteins=[...(report.sourceSnapshot?.proteins || []).filter(item=>!isPhysicalProtein(item)),...physical,...(mercolleidaTables.quotes || [])];
            const sourceLinks=[...new Map([...(mercolleidaTables.length ? [{label:'Mercolleida · tendencias y comentarios públicos',url:'https://www.mercolleida.com/es/'}] : []),...physical.map(item=>({label:item.label+' · '+item.source,url:item.url})),...(report.sourceLinks || [])].map(item=>[item.url,item])).values()].slice(0,60);
            const updated=withDailyEvidence({...report,generatedAt,proteinMarketContext:[...(mercolleidaTables.context || []),...(report.proteinMarketContext || [])].slice(0,6),proteinCatalogVersion:PROTEIN_MARKETS.version,proteinPricesCheckedAt:generatedAt,marketHistory:undefined,sessionObservations:undefined,dailyReferences:undefined,sourceSnapshot:{...report.sourceSnapshot,proteins},sourceLinks,sources:sourceList([...physical.map(item=>item.source),...(report.sources || [])]),...(report.key==='proteins' ? {eyebrow:'Pollo, huevo, pescado, procesados, ganado y alimento',objective:'Revisar precios físicos internacionales por producto, presentación, unidad y fecha. Comparar sólo las dos últimas publicaciones de fuentes diarias; conservar las semanales y mensuales como contexto.',tables:(report.tables || []).filter(table=>table.kind==='guide' || /oficial|Oferta física/.test(table.title))} : {})});
            if(report.key==='proteins'){updated.proteinFundamentals=fundamentals;updated.proteinFeed=(current.reports.find(item=>item.key==='grains')?.sourceSnapshot?.grains || []).filter(item=>['ZC=F','ZM=F'].includes(item.symbol || item.ticker));}
            updated.summary=weeklyReport({...updated,collection:'markets'}).summary;
            if(report.key==='proteins') {
                updated.tables.push(...mercolleidaTables);
                if(mercolleidaTables.length)updated.sources=sourceList([...updated.sources,'Mercolleida · tendencias y comentarios públicos']);
                updated.takeaways=['Pollo físico: congelado y refrigerado de São Paulo, Brasil; entero y filete de Francia. Huevo: calibres M y G en Rungis y futuro chino, cada uno con su unidad.','Pescado físico: salmón entero de Noruega y Escocia y filete de Noruega comercializados en Rungis. Procesados: salmón ahumado, surimi y huevo líquido.','Sólo fuentes diarias se comparan con la sesión publicada anterior. Pollo francés, ahumados y surimi se publican semanalmente; huevo líquido es mensual. Se conserva su fecha original, sin inventar precios diarios.'];
                updated.sections=[{heading:'Cobertura y actualización',text:'Precios físicos internacionales, referencias de futuros y alimento conservan producto, presentación, unidad, fuente y fecha. Las fuentes físicas se consultan en los cortes programados y al abrir el informe cuando han pasado al menos 30 minutos desde la última consulta.'}];
                updated.closing='Comparar rendimientos, moneda, presentación, impuestos y flete antes de sustituir proteínas o estimar un costo entregado. Un precio internacional o futuro no demuestra el margen local.';
                updated.content=marketExecutiveDocument(updated);
            }
            return updated;
        });
        _marketReportMemory=await executiveReportStore.save(reports,generatedAt);
        return _marketReportMemory;
    })().finally(()=>{_proteinCoverageRefresh=null;});
    return _proteinCoverageRefresh;
}
let _marketNewsRefresh=null;
async function ensureMarketNewsCoverage(snapshot,{force=false}={}){
    const prior=snapshot?.reports?.find(item=>item.key==='market_news');if(!prior)return snapshot;
    const {newsDay}=require('../../shared/report-financial-news.mjs'),cutoff=new Date().toISOString();
    if(!force && prior.marketNewsVersion===1 && newsDay(prior.generatedAt)===newsDay(cutoff) && Date.parse(cutoff)-Date.parse(prior.newsCheckedAt || prior.generatedAt)<20*60000)return snapshot;
    if(_marketNewsRefresh)return _marketNewsRefresh;
    _marketNewsRefresh=(async()=>{const {loadMarketNews,buildMarketNewsReport}=require('../lib/report-market-news'),data=await loadMarketNews({cutoff,previous:prior.marketNews || prior.headlines || [],other:marketRawNewsSnapshot().then(result=>result.articles).catch(()=>[])}).catch(()=>({stories:prior.marketNews || prior.headlines || [],status:'unavailable'})),current=_marketReportMemory || snapshot,report=buildMarketNewsReport({stories:data.stories,generatedAt:cutoff,status:data.status}),reports=current.reports.map(item=>item.key==='market_news' ? report : item),integrated=require('../lib/report-market-overview').composeMarketOverview({...current,reports});_marketReportMemory=await executiveReportStore.save(integrated.reports,integrated.generatedAt);return _marketReportMemory;})().finally(()=>{_marketNewsRefresh=null;});return _marketNewsRefresh;
}
let _marketReadRefresh=null;
function refreshMarketReadSnapshot(snapshot){
    if(_marketReadRefresh)return _marketReadRefresh;
    _marketReadRefresh=(async()=>{
        if(marketReportRefreshDue(snapshot))snapshot=await refreshMarketExecutiveReports(snapshot);
        _marketReportMemory=snapshot;return snapshot;
    })().finally(()=>{_marketReadRefresh=null;});return _marketReadRefresh;
}
router.get('/market-executive-reports', verifyToken, async (req, res) => {
    try {
        let snapshot = _marketReportMemory || await executiveReportStore.load().catch(() => null);
        if(!snapshot?.reports?.length)snapshot=await refreshMarketReadSnapshot(snapshot);
        else if(marketReportRefreshDue(snapshot))refreshMarketReadSnapshot(snapshot).catch(()=>console.warn('[market-reports] Actualización semanal pendiente; el último corte sigue disponible.'));
        // Reading a weekly edition must not refresh news, proteins or derivatives.
        snapshot=require('../lib/report-market-overview').composeMarketOverview(snapshot);
        res.set('Cache-Control', 'private, no-store');
        res.json({ success: true, data: snapshot.reports.map(report=>enrichSectorReport(report,'markets')), generatedAt: snapshot.generatedAt, nextRefreshAt: nextMarketReportRefreshAt().toISOString(), refreshPolicy:require('../../shared/report-refresh-policy.json').markets, persistence: snapshot.persistence, refreshing:Boolean(_marketReadRefresh), stale:marketReportRefreshDue(snapshot) });
    } catch (error) {
        console.error('/api/market-executive-reports:', error.message);
        res.status(502).json({ success: false, error: 'No se pudieron actualizar los informes de Mercados.' });
    }
});
router.get('/market-executive-reports/refresh', async (req, res) => {
    if (!allowsReportRefresh(req)) return res.status(401).json({ success: false, error: 'No autorizado.' });
    try {
        const snapshot = await refreshMarketExecutiveReports(undefined,{force:req.query.force==='1'});
        res.json({ success: true, generatedAt: snapshot.generatedAt, reports: snapshot.reports.length, nextRefreshAt:nextMarketReportRefreshAt().toISOString(), persistence: snapshot.persistence });
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
    void refreshMarketExecutiveReports().catch(()=>console.warn('[market-reports] Corte semanal pendiente; se reintentará al consultar.'));
    return scheduleMarketReport(refreshMarketExecutiveReports, 'market-reports');
}

module.exports = { router, initCommodityWarmer, startMarketExecutiveReportsScheduler, refreshMarketExecutiveReports, ensureGlobalMarketCoverage, ensureProteinMarketCoverage, ensureMarketNewsCoverage, getBmvMarket };
