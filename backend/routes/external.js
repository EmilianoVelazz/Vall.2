'use strict';
const express      = require('express');
const JSZip        = require('jszip');

const { externalGet, gdeltFetch, yahooFetch, YF_UA } = require('../lib/http');
const { verifyToken } = require('./auth');
const { analysisLimiter, analysisWork, analysisCacheKey, proteinAnalysisInput } = require('../lib/private-analysis');
const { boundedJson } = require('../lib/resource-limits');
const { BoundedCache } = require('../lib/bounded-cache');

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

/*
 * Último dato de una serie del SIE de Banxico.
 *
 * El cuerpo de este handler estaba VACÍO: la ruta existía, aceptaba la petición
 * y no respondía nunca. Cada VDS.banxico() se quedaba colgado hasta que el
 * AbortController de data-service lo cortaba a los 9 s, y en la consola solo se
 * veía `net::ERR_ABORTED`. Son tres llamadas por carga de Finanzas — TIIE
 * (SF43783), FIX (SF43718) e inflación anual (SP30578) — o sea 27 s de esperas
 * inútiles y tres recuadros vacíos, sin ningún error que señalara la causa.
 *
 * Que el cuerpo se borró y no que nunca existiera lo delata el circuit breaker
 * de aquí arriba, que quedó declarado y sin usar. Un comentario en el marcado
 * llegó a atribuirlo a que "las series de Banxico no responden"; no era Banxico.
 *
 * Se devuelve el payload del SIE tal cual porque el cliente lo lee crudo:
 * data-service.js hace j.bmx.series[0].datos[0].dato.
 */
router.get('/banxico/:serie', async (req, res) => {
    const { serie } = req.params;
    if (!/^[A-Z0-9]+$/i.test(serie)) return res.status(400).json({ error: 'Serie inválida' });

    const hit = _bnxCache.get(serie);
    if (hit && Date.now() - hit.ts < BNX_TTL) {
        res.set('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=43200');
        return res.json(hit.data);
    }

    if (!BANXICO_TOKEN) {
        // Sin token no hay nada que intentar; responder rápido es mejor que
        // dejar al cliente esperando al AbortController.
        return res.status(503).json({ error: 'BANXICO_TOKEN no configurado en el servidor.' });
    }

    // Con el token inválido, Banxico rechaza todas las series por igual: se
    // corta durante un turno de caché en vez de repetir el fallo por serie.
    if (_bnxCircuitOpen && Date.now() < _bnxCircuitUntil) {
        if (hit) return res.json(hit.data);
        return res.status(503).json({ error: 'Banxico no disponible temporalmente.' });
    }

    try {
        const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${serie}/datos/oportuno`;
        const response = await externalGet(url, { 'Bmx-Token': BANXICO_TOKEN }, 20000);
        const payload = await response.json();

        if (response.status === 401 || response.status === 403) {
            _bnxCircuitOpen = true;
            _bnxCircuitUntil = Date.now() + BNX_CIRCUIT_MS;
            console.error('/api/banxico: token rechazado; se abre el circuito 6 h');
            if (hit) return res.json(hit.data);
            return res.status(502).json({ error: 'Banxico rechazó las credenciales.' });
        }
        if (payload?.error || !Array.isArray(payload?.bmx?.series?.[0]?.datos)) {
            throw new Error(payload?.error?.mensaje || 'Respuesta inválida de Banxico');
        }

        _bnxCircuitOpen = false;
        boundedSet(_bnxCache, serie, { ts: Date.now(), data: payload }, 100);
        res.set('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=43200');
        res.json(payload);
    } catch (error) {
        console.error(`/api/banxico/${serie}:`, error.message);
        // Antes que nada, un dato viejo: estas series se publican una vez al día.
        if (hit) return res.json(hit.data);
        res.status(502).json({ error: 'No se pudo obtener la serie de Banxico.' });
    }
});

// ── USDA NASS Proxy ────────────────────────────────────────────────────────
const _usdaCache = new Map();
const USDA_TTL = 12 * 60 * 60 * 1000;
const USDA_NASS_KEY = process.env.USDA_NASS_KEY || '';

router.get('/usda/crop-progress', async (req, res) => {
    const commodity = String(req.query.commodity || 'CORN').toUpperCase();
    const cacheKey = `usda_cp_${commodity}`;
    const hit = _usdaCache.get(cacheKey);
    
    if (hit && Date.now() - hit.ts < USDA_TTL) return res.json(hit.data);
    if (!USDA_NASS_KEY) return res.status(503).json({ error: 'USDA_NASS_KEY no configurado.' });

    try {
        const year = new Date().getFullYear();
        const url = `https://quickstats.nass.usda.gov/api/api_GET/?key=${USDA_NASS_KEY}&commodity_desc=${commodity}&statisticcat_desc=CONDITION&year=${year}&freq_desc=WEEKLY&reference_period_desc=WEEK%20ENDING&format=JSON`;
        const response = await externalGet(url, {}, 15000);
        const payload = await response.json();
        
        if (!payload || !payload.data) {
            throw new Error('Respuesta inválida del USDA NASS');
        }

        // Filtramos solo el estado "US TOTAL" para obtener el progreso nacional
        const nationalData = payload.data.filter(d => d.state_alpha === 'US' && (d.unit_desc === 'PCT EXCELLENT' || d.unit_desc === 'PCT GOOD'));
        
        boundedSet(_usdaCache, cacheKey, { ts: Date.now(), data: nationalData }, 20);
        res.set('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
        res.json(nationalData);
    } catch (error) {
        console.error('/api/usda/crop-progress:', error.message);
        if (hit) return res.json(hit.data);
        // Fallback robusto en caso de que NASS falle o esté en mantenimiento
        res.status(502).json({ error: 'No se pudo obtener el reporte del USDA.' });
    }
});

// ── PROTEÍNAS: USDA AMS (Market News) ──────────────────────────────────────
const USDA_AMS_KEY = process.env.USDA_AMS_KEY || '';
const _amsCache = new Map();
const AMS_TTL = 6 * 60 * 60 * 1000;

router.get('/usda/ams/cutout', async (req, res) => {
    const cacheKey = 'ams_cutout';
    const hit = _amsCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < AMS_TTL) return res.json(hit.data);

    if (!USDA_AMS_KEY) {
        return res.json({ 
            _meta: {
                source: 'USDA AMS',
                real_time: false,
                type: 'STATIC_REFERENCE',
                disclaimer: 'USDA_AMS_KEY no configurada. Registrarse gratis en https://marketnews.usda.gov',
            },
            data: { pork_cutout: 104.50, beef_cutout: 312.20 }
        });
    }
    res.status(501).json({ error: 'Conexión real al USDA AMS pendiente.' });
});

// ── PROTEÍNAS: INEGI API — Precios Reales al Consumidor (México) ───────────
// API v1 del BIE (Banco de Información Económica): NO requiere API key.
// Series: SP1 = INPC general, pero usamos genéricos específicos de carne.
// Indicadores: 
//   628194 = Pollo (precio promedio MXN/kg)
//   628229 = Huevo (precio promedio MXN/kg) 
//   628191 = Carne de cerdo (precio promedio MXN/kg)
//   628188 = Carne de res (precio promedio MXN/kg)
const _inegiCache = new Map();
const INEGI_TTL = 12 * 60 * 60 * 1000;
const INEGI_TOKEN = process.env.INEGI_TOKEN || '';

router.get('/inegi/precios-carne', async (req, res) => {
    const cacheKey = 'inegi_carne';
    const hit = _inegiCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < INEGI_TTL) return res.json(hit.data);

    // Series del INPC agropecuario (subíndices de precios reales)
    const series = {
        pollo: '628194',
        huevo: '628229',
        cerdo: '628191',
        res: '628188'
    };

    const resultado = {
        _meta: {
            source: 'INEGI — Banco de Información Económica',
            real_time: true,
            type: 'REAL_DATA',
            disclaimer: 'Precios promedio al consumidor en MXN/kg. Levantamiento físico en puntos de venta. Datos reales, no estimaciones.',
            frequency: 'Mensual'
        },
        precios: {}
    };

    try {
        const fetchPromises = Object.entries(series).map(async ([nombre, serie]) => {
            try {
                const url = INEGI_TOKEN 
                    ? `https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/INDICATOR/${serie}/es/0700/false/BIE/2.0/${INEGI_TOKEN}?type=json`
                    : `https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/INDICATOR/${serie}/es/0700/true/BIE/2.0/0?type=json`;
                const response = await externalGet(url, {}, 8000);
                const data = await response.json();
                const observations = data?.Series?.[0]?.OBSERVATIONS || [];
                if (observations.length > 0) {
                    const ultimo = observations[observations.length - 1];
                    return {
                        nombre,
                        data: {
                            valor: parseFloat(ultimo.OBS_VALUE),
                            periodo: ultimo.TIME_PERIOD,
                            unidad: 'MXN/kg'
                        }
                    };
                }
                throw new Error('No observations');
            } catch (e) {
                console.warn(`[INEGI] Error obteniendo serie ${nombre}:`, e.message);
                throw e;
            }
        });

        const results = await Promise.allSettled(fetchPromises);
        results.forEach(res => {
            if (res.status === 'fulfilled' && res.value) {
                resultado.precios[res.value.nombre] = res.value.data;
            }
        });

        resultado._meta.real_time = Object.keys(resultado.precios).length > 0;
        if (Object.keys(resultado.precios).length === 0) {
            resultado._meta.type = 'API_ERROR';
            resultado._meta.disclaimer = 'No se pudieron obtener datos del INEGI. Posible mantenimiento del servidor.';
        }

        boundedSet(_inegiCache, cacheKey, { ts: Date.now(), data: resultado }, 10);
        res.json(resultado);
    } catch (error) {
        console.error('/api/inegi/precios-carne:', error.message);
        if (hit) return res.json(hit.data);
        res.status(502).json({ error: 'No se pudo conectar con el INEGI.' });
    }
});

// ── PROTEÍNAS: Banco Mundial — Precios Internacionales de Referencia ───────
// API pública gratuita, NO requiere key.
// Commodity prices "Pink Sheet" — precios mensuales REALES de mercado.
const _wbCache = new Map();
const WB_TTL = 24 * 60 * 60 * 1000; // 24h — se actualiza mensualmente

router.get('/worldbank/commodity-prices', async (req, res) => {
    const cacheKey = 'wb_meat';
    const hit = _wbCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < WB_TTL) return res.json(hit.data);

    const resultado = {
        _meta: {
            source: 'Banco Mundial — Commodity Markets (Pink Sheet)',
            real_time: true,
            type: 'REAL_DATA',
            disclaimer: 'Precios internacionales de referencia observados mensualmente. Datos reales, NO estimaciones.',
            frequency: 'Mensual'
        },
        prices: {}
    };

    try {
        // El Banco Mundial publica un Excel/CSV mensual. Usamos su API de indicadores.
        // AG.PRD.LVSK.XD = Livestock production index
        // Endpoint alternativo: CMO (Commodity Markets Outlook) data
        const url = 'https://api.worldbank.org/v2/country/WLD/indicator/AG.PRD.LVSK.XD?format=json&per_page=12&date=2020:2026';
        const response = await externalGet(url, {}, 15000);
        const data = await response.json();
        
        if (data && data[1] && Array.isArray(data[1])) {
            resultado.prices.livestock_index = data[1]
                .filter(d => d.value !== null)
                .map(d => ({ year: d.date, value: d.value }))
                .reverse();
            resultado._meta.real_time = true;
        }

        boundedSet(_wbCache, cacheKey, { ts: Date.now(), data: resultado }, 10);
        res.json(resultado);
    } catch (error) {
        console.error('/api/worldbank/commodity-prices:', error.message);
        if (hit) return res.json(hit.data);
        resultado._meta.type = 'API_ERROR';
        res.status(502).json(resultado);
    }
});

// ── PROTEÍNAS: BLS — Precios al Consumidor de Carne en EE.UU. ─────────────
// API v1: NO requiere key (límite 25 queries/día). Datos REALES de supermercados.
const _blsCache = new Map();
const BLS_TTL = 24 * 60 * 60 * 1000;

router.get('/bls/meat-prices', async (req, res) => {
    const cacheKey = 'bls_meat';
    const hit = _blsCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < BLS_TTL) return res.json(hit.data);

    // Series IDs del CPI para proteínas:
    // APU0000FF1101 = Ground beef (100% beef), per lb
    // APU0000FD3101 = Chicken breast, boneless, per lb  
    // APU0000FE1101 = Eggs, grade A, large, per doz
    // APU0000FF2101 = Pork chops, per lb
    const seriesIds = ['APU0000FF1101', 'APU0000FD3101', 'APU0000FE1101', 'APU0000FF2101'];
    const nombres = { APU0000FF1101: 'beef', APU0000FD3101: 'chicken', APU0000FE1101: 'eggs', APU0000FF2101: 'pork' };
    const year = new Date().getFullYear();

    const resultado = {
        _meta: {
            source: 'Bureau of Labor Statistics (BLS) — Consumer Price Index',
            real_time: true,
            type: 'REAL_DATA',
            disclaimer: 'Precios promedio al consumidor en supermercados de EE.UU. (USD). Datos REALES por muestreo estadístico.',
            frequency: 'Mensual'
        },
        prices: {}
    };

    try {
        // BLS API v2 (con o sin key)
        const BLS_KEY = process.env.BLS_API_KEY || '';
        const body = JSON.stringify({
            seriesid: seriesIds,
            startyear: String(year - 1),
            endyear: String(year),
            registrationkey: BLS_KEY || undefined
        });
        
        const response = await externalGet('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
        }, 20000);
        const data = await response.json();

        if (data?.Results?.series) {
            for (const serie of data.Results.series) {
                const nombre = nombres[serie.seriesID] || serie.seriesID;
                const puntos = (serie.data || []).slice(0, 6).map(d => ({
                    periodo: `${d.year}-${d.period.replace('M', '')}`,
                    valor: parseFloat(d.value),
                    unidad: 'USD/lb'
                }));
                if (puntos.length > 0) {
                    resultado.prices[nombre] = {
                        ultimo: puntos[0].valor,
                        periodo: puntos[0].periodo,
                        historico: puntos,
                        unidad: nombre === 'eggs' ? 'USD/dozen' : 'USD/lb'
                    };
                }
            }
        }

        resultado._meta.real_time = Object.keys(resultado.prices).length > 0;
        if (Object.keys(resultado.prices).length === 0) {
            resultado._meta.type = 'API_ERROR';
            resultado._meta.disclaimer = 'No se pudieron obtener datos del BLS. Límite diario de consultas posiblemente alcanzado.';
        }

        boundedSet(_blsCache, cacheKey, { ts: Date.now(), data: resultado }, 10);
        res.set('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
        res.json(resultado);
    } catch (error) {
        console.error('/api/bls/meat-prices:', error.message);
        if (hit) return res.json(hit.data);
        res.status(502).json({ error: 'No se pudo conectar con el BLS.' });
    }
});

// ── SANIDAD: WOAH/OIE — Alertas Sanitarias Globales ────────────────────────
// Gripe Aviar, Peste Porcina Africana, etc. API WAHIS pública.
const _woahCache = new Map();
const WOAH_TTL = 6 * 60 * 60 * 1000;

router.get('/woah/alerts', async (req, res) => {
    const cacheKey = 'woah_alerts';
    const hit = _woahCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < WOAH_TTL) return res.json(hit.data);

    const resultado = {
        _meta: {
            source: 'WOAH/OIE — World Animal Health Information System (WAHIS)',
            real_time: true,
            type: 'REAL_DATA',
            disclaimer: 'Notificaciones oficiales de brotes de enfermedades animales reportadas por gobiernos nacionales.',
            frequency: 'Continua'
        },
        alerts: []
    };

    try {
        // WAHIS API pública
        const url = 'https://wahis.woah.org/api/v1/pi/event/filtered?pageNumber=1&pageSize=10&eventStatuses=CONFIRMED&diseaseNames=African%20swine%20fever,Highly%20pathogenic%20avian%20influenza';
        const response = await externalGet(url, { 
            headers: { 'Accept': 'application/json' }
        }, 15000);
        const data = await response.json();

        if (data?.content && Array.isArray(data.content)) {
            resultado.alerts = data.content.slice(0, 10).map(e => ({
                disease: e.diseaseName || 'Unknown',
                country: e.countryName || 'Unknown',
                date: e.reportDate || e.startDate,
                status: e.eventStatus,
                species: e.animalSpecies || 'Unknown'
            }));
        }

        resultado._meta.real_time = resultado.alerts.length > 0;
        boundedSet(_woahCache, cacheKey, { ts: Date.now(), data: resultado }, 10);
        res.set('Cache-Control', 'public, s-maxage=14400, stale-while-revalidate=28800');
        res.json(resultado);
    } catch (error) {
        console.error('/api/woah/alerts:', error.message);
        if (hit) return res.json(hit.data);
        resultado._meta.type = 'API_ERROR';
        resultado._meta.disclaimer = 'No se pudo conectar con WAHIS/OIE.';
        res.json(resultado);
    }
});

// ── PROTEÍNAS: SIAP (Producción México) — Referencia Estática ──────────────
router.get('/siap/produccion', async (req, res) => {
    res.json({
        _meta: {
            source: 'SIAP (Servicio de Información Agroalimentaria y Pesquera)',
            real_time: false,
            type: 'STATIC_REFERENCE',
            disclaimer: 'Valores del cierre 2024. Para datos actualizados: datos.gob.mx',
            data_vintage: '2024-12',
        },
        toneladas_mensuales: { cerdo: 145000, res: 180000, pollo: 320000 }
    });
});

// ── PROTEÍNAS: OECD-FAO (Macrotendencias) — Referencia Estática ────────────
router.get('/fao/outlook', async (req, res) => {
    res.json({
        _meta: {
            source: 'OECD-FAO Agricultural Outlook',
            real_time: false,
            type: 'STATIC_REFERENCE',
            disclaimer: 'Proyecciones 2023-2032. Son estimaciones de la OECD-FAO.',
            publication_year: 2023,
        },
        proyeccion_2030: { crecimiento_cerdo_asia: '4.5%', demanda_res_usa: '-1.2%' }
    });
});

// ── Histórico de tasas soberanas a 10 años del BCE ────────────────────────────
// Serie "long-term interest rate for convergence purposes" (criterio de
// Maastricht): rendimiento del bono soberano a 10 años, mensual, publicado por
// el BCE para los países de la UE. Es la única fuente pública y gratuita que
// cubre muchos mercados con histórico homogéneo, así que es la que permite que
// la línea del tiempo sea internacional y no solo de México y EE.UU.
const _ecbCache = new Map();
const ECB_TTL = 12 * 60 * 60 * 1000;

router.get('/ecb/:area/history', async (req, res) => {
    const area = String(req.params.area || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(area)) return res.status(400).json({ error: 'Área inválida' });

    const years = Math.min(20, Math.max(1, parseInt(req.query.years, 10) || 5));
    const n = years * 12;
    const cacheKey = `${area}:${n}`;
    const hit = _ecbCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < ECB_TTL) return res.json(hit.data);

    try {
        const url = `https://data-api.ecb.europa.eu/service/data/IRS/M.${area}.L.L40.CI.0000.EUR.N.Z`
                  + `?format=jsondata&lastNObservations=${n}`;
        const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
        if (!r.ok) throw new Error(`ECB ${r.status}`);
        const j = await r.json();

        const serieObj = j?.dataSets?.[0]?.series;
        if (!serieObj) throw new Error('sin series');
        const clave = Object.keys(serieObj)[0];
        const obs = serieObj[clave]?.observations || {};
        const periodos = j?.structure?.dimensions?.observation?.[0]?.values || [];
        const nombre = j?.structure?.dimensions?.series?.find(d => d.id === 'REF_AREA')?.values?.[0]?.name || area;

        const points = Object.keys(obs)
            .map(i => ({ date: periodos[+i]?.id || null, value: Array.isArray(obs[i]) ? obs[i][0] : null }))
            .filter(p => p.date && Number.isFinite(p.value));

        if (!points.length) throw new Error('sin observaciones');
        const data = { area, name: nombre, points };
        boundedSet(_ecbCache, cacheKey, { ts: Date.now(), data }, 80);
        res.json(data);
    } catch (error) {
        console.error(`/api/ecb/${area} history:`, error.message);
        if (hit) return res.json(hit.data);
        res.status(502).json({ error: 'No se pudo obtener el histórico del BCE.' });
    }
});

// ── Histórico soberano de Asia vía OCDE ────────────────────────────────────
// La OCDE expone la tasa soberana japonesa de largo plazo en SDMX sin clave.
// La lista cerrada evita convertir este endpoint en un proxy arbitrario.
const FRED_BOND_SERIES = new Set([
    'IRLTLT01JPM156N', // Japón · bono soberano a 10 años
]);
const OECD_BOND_AREAS = {
    IRLTLT01JPM156N: 'JPN',
};
const _fredBondCache = new Map();
const FRED_BOND_TTL = 12 * 60 * 60 * 1000;

async function fetchOecdLongRate(series, years) {
    const area = OECD_BOND_AREAS[series];
    if (!area) throw new Error('serie sin correspondencia OCDE');
    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
    // La consulta estable publicada por la OCDE devuelve la ventana disponible
    // desde agosto de 2021. Los periodos menores se recortan localmente para no
    // depender de variantes startPeriod que el servicio responde con HTTP 500.
    const startPeriod = '2021-08';
    // Codificar los puntos evita que el cliente HTTP elimine las dimensiones
    // comodín finales y provoque una respuesta 422 de SDMX.
    const emptyDimensions = '%2E%2E%2E%2E%2E';
    const url = 'https://sdmx.oecd.org/public/rest/data/'
        + `OECD.SDD.STES,DSD_STES@DF_FINMARK,4.0/${area}.M.IRLT.PA${emptyDimensions}`
        + `?startPeriod=${startPeriod}&dimensionAtObservation=AllDimensions`;
    // fetch/undici evita el bloqueo observado en el helper HTTPS heredado con
    // este host SDMX y AbortSignal aplica también durante DNS/TLS.
    const response = await fetch(url, {
        headers: { Accept: 'text/csv', 'User-Agent': YF_UA },
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`OCDE ${response.status}`);
    const rows = (await response.text()).trim().split(/\r?\n/);
    const headers = rows.shift()?.split(',') || [];
    const dateIndex = headers.indexOf('TIME_PERIOD');
    const valueIndex = headers.indexOf('OBS_VALUE');
    if (dateIndex < 0 || valueIndex < 0) throw new Error('columnas OCDE ausentes');
    const points = rows.map(line => {
        const columns = line.split(',');
        const month = columns[dateIndex];
        const value = Number(columns[valueIndex]);
        return /^\d{4}-\d{2}$/.test(month) && Number.isFinite(value)
            ? { date: `${month}-01`, value }
            : null;
    }).filter(Boolean)
        .filter(point => new Date(`${point.date}T00:00:00Z`) >= cutoff)
        .sort((a, b) => a.date.localeCompare(b.date));
    if (!points.length) throw new Error('OCDE sin observaciones');
    return points;
}

router.get('/fred/:series/history', async (req, res) => {
    const series = String(req.params.series || '').toUpperCase();
    if (!FRED_BOND_SERIES.has(series)) {
        return res.status(400).json({ error: 'Serie soberana no permitida.' });
    }

    const years = Math.min(20, Math.max(1, parseInt(req.query.years, 10) || 5));
    const cacheKey = `${series}:${years}`;
    const hit = _fredBondCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < FRED_BOND_TTL) return res.json(hit.data);

    try {
        const points = await fetchOecdLongRate(series, years);
        const data = { series, points, source: 'OCDE · Financial Markets' };
        boundedSet(_fredBondCache, cacheKey, { ts: Date.now(), data }, 40);
        return res.json(data);
    } catch (oecdError) {
        console.warn(`/api/fred/${series}: OCDE no disponible, se intenta FRED:`, oecdError.message);
    }

    try {
        const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(series)}`;
        const response = await externalGet(url, { Accept: 'text/csv' }, 8000);
        if (!response.ok) throw new Error(`FRED ${response.status}`);
        const csv = await response.text();
        const cutoff = new Date();
        cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);

        const points = csv.trim().split(/\r?\n/).slice(1)
            .map(line => {
                const comma = line.indexOf(',');
                if (comma < 0) return null;
                const date = line.slice(0, comma).trim();
                const rawValue = line.slice(comma + 1).trim();
                const value = rawValue && rawValue !== '.' ? Number(rawValue) : NaN;
                const parsed = new Date(`${date}T00:00:00Z`);
                return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value) && parsed >= cutoff
                    ? { date, value }
                    : null;
            })
            .filter(Boolean);

        if (!points.length) throw new Error('sin observaciones');
        const data = { series, points, source: 'FRED · OECD' };
        boundedSet(_fredBondCache, cacheKey, { ts: Date.now(), data }, 40);
        res.json(data);
    } catch (error) {
        console.error(`/api/fred/${series} history:`, error.message);
        if (hit) return res.json(hit.data);
        res.status(502).json({ error: 'No se pudo obtener el histórico soberano de Asia.' });
    }
});

// ── Histórico del bono soberano chino a 10 años ─────────────────────────────
// ChinaBond/CCDC publica un XLSX anual con toda la curva oficial diaria. Se
// extrae únicamente el plazo 10Y; no se estiman días ni se interpolan valores.
const _chinaBondCache = new Map();
const CHINA_BOND_TTL = 12 * 60 * 60 * 1000;
const CHINA_BOND_CURVE_ID = '2c9081e50a2f9606010a3068cae70001';

function xlsxCell(rowXml, column) {
    const cell = rowXml.match(new RegExp(`<c[^>]*r="${column}\\d+"[^>]*>([\\s\\S]*?)<\\/c>`));
    if (!cell) return '';
    const value = cell[1].match(/<t[^>]*>([\s\S]*?)<\/t>/) || cell[1].match(/<v>([\s\S]*?)<\/v>/);
    return value ? value[1].trim() : '';
}

async function fetchChinaBondYear(year) {
    const qs = new URLSearchParams({
        locale: 'en_US', wrjxCBFlag: '0', ycDefId: CHINA_BOND_CURVE_ID,
        year: String(year), zblx: 'txy',
    });
    const response = await fetch(`https://yield.chinabond.com.cn/cbweb-mn/yc/downYearBzqx?${qs}`, {
        headers: { 'User-Agent': YF_UA, Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`ChinaBond ${year}: ${response.status}`);
    const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
    const worksheet = zip.file('xl/worksheets/sheet1.xml');
    if (!worksheet) throw new Error(`ChinaBond ${year}: hoja ausente`);
    const xml = await worksheet.async('string');
    return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].flatMap(match => {
        const row = match[1];
        const maturity = Number(xlsxCell(row, 'C'));
        if (maturity !== 10) return [];
        const rawDate = xlsxCell(row, 'A');
        const value = Number(xlsxCell(row, 'D'));
        const date = rawDate.replaceAll('/', '-');
        return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value) ? [{ date, value }] : [];
    });
}

router.get('/chinabond/history', async (req, res) => {
    const years = Math.min(10, Math.max(1, parseInt(req.query.years, 10) || 5));
    const hit = _chinaBondCache.get(years);
    if (hit && Date.now() - hit.ts < CHINA_BOND_TTL) return res.json(hit.data);

    const now = new Date();
    const cutoff = new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()));
    const annualYears = Array.from({ length: years + 1 }, (_, index) => now.getUTCFullYear() - index);
    try {
        const files = await Promise.allSettled(annualYears.map(fetchChinaBondYear));
        const byDate = new Map();
        files.forEach(result => {
            if (result.status !== 'fulfilled') return;
            result.value.forEach(point => {
                if (new Date(`${point.date}T00:00:00Z`) >= cutoff) byDate.set(point.date, point);
            });
        });
        const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
        if (!points.length) throw new Error('sin observaciones descargables');
        const data = { series: 'CGB10Y', name: 'China', points, source: 'ChinaBond · CCDC' };
        boundedSet(_chinaBondCache, years, { ts: Date.now(), data }, 12);
        res.json(data);
    } catch (error) {
        console.error('/api/chinabond/history:', error.message);
        if (hit) return res.json(hit.data);
        res.status(502).json({ error: 'No se pudo obtener el histórico oficial de ChinaBond.' });
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
    const points = datos.map(d => ({ value: parseFloat(d.dato), date: d.fecha })).filter(d => !isNaN(d.value));
    if (!points.length) throw new Error('sin dato');
    const curr = points[points.length - 1];
    const prev = points.length >= 2 ? points[points.length - 2] : null;
    return { yield: curr.value, prev: prev?.value ?? null, date: curr.date || null };
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
            fetchBanxicoYield('SF43783'), // TIIE 28 días
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

// ── Diferenciales de deuda soberana a 10 años ────────────────────────────────
//
// Alimenta la tabla de spreads al estilo World Government Bonds. La fuente es el
// portal de datos del BCE (dataflow IRS, "long-term interest rate for convergence
// purposes"), que publica el rendimiento a 10 años de cada país de la UE sin
// necesidad de clave. Todos los países europeos comparten el mismo corte, así que
// los diferenciales entre ellos son exactos.
//
// Estados Unidos se añade desde Yahoo (^TNX) porque el BCE no lo cubre. Su corte
// es diario, no mensual, y por eso viaja con su propio `period`: la vista debe
// mostrarlo para no dar a entender que ambas cifras son de la misma fecha.
const _spreadsCache = { ts: 0, data: null };
const SPREADS_TTL   = 6 * 60 * 60 * 1000; // el BCE publica una vez al mes

const SPREAD_COUNTRIES = [
    ['DE', 'Alemania',     '🇩🇪'], ['FR', 'Francia',    '🇫🇷'], ['IT', 'Italia',     '🇮🇹'],
    ['ES', 'España',       '🇪🇸'], ['NL', 'Países Bajos', '🇳🇱'], ['BE', 'Bélgica',   '🇧🇪'],
    ['AT', 'Austria',      '🇦🇹'], ['PT', 'Portugal',   '🇵🇹'], ['IE', 'Irlanda',    '🇮🇪'],
    ['FI', 'Finlandia',    '🇫🇮'], ['GR', 'Grecia',     '🇬🇷'], ['SK', 'Eslovaquia', '🇸🇰'],
    ['SI', 'Eslovenia',    '🇸🇮'], ['LT', 'Lituania',   '🇱🇹'], ['LV', 'Letonia',    '🇱🇻'],
    ['EE', 'Estonia',      '🇪🇪'], ['LU', 'Luxemburgo', '🇱🇺'], ['CY', 'Chipre',     '🇨🇾'],
    ['MT', 'Malta',        '🇲🇹'], ['HR', 'Croacia',    '🇭🇷'], ['BG', 'Bulgaria',   '🇧🇬'],
];

async function fetchEcbCountryYield(code) {
    const url = `https://data-api.ecb.europa.eu/service/data/IRS/M.${code}.L.L40.CI.0000.EUR.N.Z`
        + '?format=jsondata&lastNObservations=2';
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`ECB ${r.status}`);
    const j = await r.json();
    const series = j?.dataSets?.[0]?.series;
    if (!series) throw new Error('sin series');
    const obs = series[Object.keys(series)[0]]?.observations;
    if (!obs) throw new Error('sin observaciones');
    // Las claves de observación son índices en texto ("0", "1"): hay que
    // ordenarlas numéricamente para no tomar la más antigua como la actual.
    const valores = Object.keys(obs)
        .sort((a, b) => Number(a) - Number(b))
        .map(k => (Array.isArray(obs[k]) ? obs[k][0] : null))
        .filter(v => Number.isFinite(v));
    if (!valores.length) throw new Error('sin valores');
    const periodos = j?.structure?.dimensions?.observation?.[0]?.values || [];
    return {
        yield: valores[valores.length - 1],
        prev:  valores.length >= 2 ? valores[valores.length - 2] : null,
        period: periodos[periodos.length - 1]?.id || null,
    };
}

router.get('/bond-spreads', async (req, res) => {
    if (_spreadsCache.data && Date.now() - _spreadsCache.ts < SPREADS_TTL)
        return res.json(_spreadsCache.data);

    try {
        const europeos = await Promise.allSettled(
            SPREAD_COUNTRIES.map(async ([code, name, flag]) => {
                const d = await fetchEcbCountryYield(code);
                return { code, name, flag, ...d, source: 'BCE · tasa de largo plazo (10 años)' };
            })
        );

        const countries = europeos
            .filter(r => r.status === 'fulfilled' && Number.isFinite(r.value.yield))
            .map(r => r.value);

        // China: curva soberana oficial ChinaBond/CCDC. Se toman las dos
        // observaciones más recientes para conservar la misma lectura de
        // nivel y variación que el resto del tablero.
        try {
            const currentYear = new Date().getUTCFullYear();
            const chinaFiles = await Promise.allSettled([
                fetchChinaBondYear(currentYear),
                fetchChinaBondYear(currentYear - 1),
            ]);
            const chinaPoints = chinaFiles
                .filter(result => result.status === 'fulfilled')
                .flatMap(result => result.value)
                .sort((a, b) => a.date.localeCompare(b.date));
            const chinaLast = chinaPoints.at(-1);
            const chinaPrev = chinaPoints.at(-2);
            if (Number.isFinite(chinaLast?.value)) {
                countries.push({
                    code: 'CN', name: 'China', flag: '🇨🇳',
                    yield: chinaLast.value,
                    prev: Number.isFinite(chinaPrev?.value) ? chinaPrev.value : null,
                    period: chinaLast.date,
                    source: 'ChinaBond · CCDC (curva soberana oficial a 10 años)',
                });
            }
        } catch (e) {
            console.warn('/api/bond-spreads: sin ChinaBond:', e.message);
        }

        // Estados Unidos: corte diario, se etiqueta como tal.
        try {
            const us = await fetchYahooYield('^TNX');
            if (Number.isFinite(us?.yield)) {
                countries.push({
                    code: 'US', name: 'Estados Unidos', flag: '🇺🇸',
                    yield: us.yield, prev: us.prev,
                    period: new Date().toISOString().slice(0, 10),
                    source: 'Yahoo Finance · ^TNX (cierre diario)',
                });
            }
        } catch (e) {
            console.warn('/api/bond-spreads: sin ^TNX:', e.message);
        }

        if (!countries.length) throw new Error('ninguna fuente respondió');

        countries.sort((a, b) => a.yield - b.yield);
        const data = {
            countries,
            // Corte de los datos europeos, que son la mayoría de la tabla.
            asOf: countries.find(c => c.code === 'DE')?.period || countries[0].period,
            note: 'Los países europeos comparten el corte mensual del BCE. Estados Unidos usa cierre diario y China la curva soberana oficial de ChinaBond/CCDC; cada fila declara su fecha y fuente.',
        };

        _spreadsCache.ts   = Date.now();
        _spreadsCache.data = data;
        res.json(data);
    } catch (err) {
        console.error('/api/bond-spreads error:', err.message);
        if (_spreadsCache.data) return res.json(_spreadsCache.data);
        res.status(502).json({ error: 'No se pudieron obtener los diferenciales soberanos.' });
    }
});

// ── Curva de Tasas México (TIIE + Cetes + UDIBONOS) ──────────────────────────
const _mxRatesCache = { ts: 0, data: null };
const MX_RATES_TTL  = 30 * 60 * 1000;

// La página México y sus informes comparten datos y periodos de observación.
const {getMexicoMacro}=require('../services/mexico-macro');
router.get('/mexico-macro', async (req,res)=>{
    res.set('Cache-Control','public, s-maxage=86400, stale-while-revalidate=172800');
    try {res.json(await getMexicoMacro());}
    catch {res.status(502).json({error:'No se pudo obtener el panorama macroeconómico de México.'});}
});

router.get('/mx-rates', async (req, res) => {
    if (_mxRatesCache.data && Date.now() - _mxRatesCache.ts < MX_RATES_TTL)
        return res.json(_mxRatesCache.data);

    const [policy, t28, t91, t182, c28, c91, c182, c364] = await Promise.allSettled([
        fetchBanxicoYield('SF61745'),  // Tasa objetivo de Banxico
        fetchBanxicoYield('SF43783'),  // TIIE 28D
        fetchBanxicoYield('SF43878'),  // TIIE 91D
        fetchBanxicoYield('SF111916'), // TIIE 182D
        fetchBanxicoYield('SF43936'),  // Cetes 28D
        fetchBanxicoYield('SF43939'),  // Cetes 91D
        fetchBanxicoYield('SF43942'),  // Cetes 182D
        fetchBanxicoYield('SF43945'),  // Cetes 364D
    ]);

    const val = r => r.status === 'fulfilled' ? r.value : null;
    const tiie = [
        { label: '28D',  yield: val(t28)?.yield  ?? null, prev: val(t28)?.prev  ?? null },
        { label: '91D',  yield: val(t91)?.yield  ?? null, prev: val(t91)?.prev  ?? null },
        { label: '182D', yield: val(t182)?.yield ?? null, prev: val(t182)?.prev ?? null },
    ];
    const cetes = [
        { label: '28D',  yield: val(c28)?.yield  ?? null, prev: val(c28)?.prev  ?? null },
        { label: '91D',  yield: val(c91)?.yield  ?? null, prev: val(c91)?.prev  ?? null },
        { label: '182D', yield: val(c182)?.yield ?? null, prev: val(c182)?.prev ?? null },
        { label: '364D', yield: val(c364)?.yield ?? null, prev: val(c364)?.prev ?? null },
    ];

    const hasLive = [policy, t28, t91, t182, c28, c91, c182, c364].some(r => r.status === 'fulfilled');
    const latest = [policy, t28, t91, t182, c28, c91, c182, c364].map(val).find(Boolean);
    const data = { policyRate: val(policy), tiie, cetes, udibonos: [], source: hasLive ? 'banxico' : 'unavailable', date: latest?.date || null };

    if (hasLive) { _mxRatesCache.ts = Date.now(); _mxRatesCache.data = data; }
    res.json(data);
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Endpoints que el cliente llamaba y que no existían.
 *
 * Los cuatro devolvían 404 en cada carga. No se veía roto nada porque todas las
 * secciones caen a una capa de respaldo cuando la fuente falla: las noticias
 * pasan a contenido sintético etiquetado "(ref.)" o "Análisis VALL", y los
 * recuadros de cripto y divisas se quedan simplemente vacíos. Es decir, la
 * página aparentaba funcionar mientras servía datos inventados.
 *
 * En el caso de /gdelt el borrado dejó rastro: server.js sigue anunciando la
 * ruta en el log de arranque, pero el handler no estaba — el mismo patrón que
 * el de /banxico/:serie.
 *
 * Todos responden con la forma CRUDA del proveedor, porque data-service.js y
 * finanzas-page.js ya la desmenuzan tal cual (j.articles, data.rates.MXN,
 * data.market_cap_percentage.btc…). Reformatear aquí obligaría a tocar el
 * cliente sin ganar nada.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Cachea la respuesta de un proveedor y sirve lo viejo antes que un error. */
function cacheSimple(ttlMs) {
    const store = new Map();
    return {
        get(clave) {
            const hit = store.get(clave);
            return hit && Date.now() - hit.ts < ttlMs ? hit.data : null;
        },
        stale(clave) { return store.get(clave)?.data ?? null; },
        set(clave, data) { boundedSet(store, clave, { ts: Date.now(), data }, 80); },
    };
}

// ── /api/gdelt ────────────────────────────────────────────────────────────────
// GDELT limita por IP con ventanas cortas y responde 429 con facilidad, así que
// las peticiones se serializan y se espacian. El cliente ya encola por su lado
// (data-service.js), pero en serverless cada instancia arranca con su propio
// contador y ahí es donde se dispara el rate-limit.
const _gdeltCache = cacheSimple(15 * 60 * 1000);
// GDELT no publica su límite, pero por debajo de ~5 s entre peticiones empieza a
// devolver 429. Geopolítica sola encadena una decena de consultas por carga.
//
// AVISO: desde la red de desarrollo GDELT responde 429 SIEMPRE, incluso en la
// primera petición tras arrancar el backend en frío, así que este endpoint no se
// ha podido validar con datos reales aquí — solo que degrada bien. Encaja con la
// intercepción de TLS de esta red. En Vercel, con otra IP de salida, debería
// funcionar; conviene comprobarlo tras el primer despliegue.
const GDELT_MIN_MS = 5000;
const GDELT_CASTIGO_MS = 2 * 60 * 1000;
let _gdeltLastAt = 0;
let _gdeltBloqueadoHasta = 0;
let _gdeltCola = Promise.resolve();

router.get('/gdelt', async (req, res) => {
    const query = String(req.query.query || '').slice(0, 300);
    const mode = String(req.query.mode || 'ArtList');
    const maxrecords = Math.min(Math.max(parseInt(req.query.maxrecords, 10) || 10, 1), 75);
    if (!query) return res.status(400).json({ error: 'Falta el parámetro query.' });
    if (!/^[A-Za-z]+$/.test(mode)) return res.status(400).json({ error: 'Modo inválido.' });

    const clave = `${query}|${mode}|${maxrecords}`;
    const fresco = _gdeltCache.get(clave);
    if (fresco) {
        res.set('Cache-Control', 'public, s-maxage=10800, stale-while-revalidate=21600');
        return res.json(fresco);
    }

    // Tras un 429, insistir solo empeora el castigo: durante la ventana de
    // bloqueo se responde con lo cacheado sin tocar a GDELT.
    if (Date.now() < _gdeltBloqueadoHasta) {
        const viejo = _gdeltCache.stale(clave);
        return res.status(viejo ? 200 : 503).json(viejo || { articles: [], error: 'GDELT limitando peticiones.' });
    }

    try {
        const data = await (_gdeltCola = _gdeltCola.then(async () => {
            const cacheado = _gdeltCache.get(clave);
            if (cacheado) return cacheado;

            const espera = GDELT_MIN_MS - (Date.now() - _gdeltLastAt);
            if (espera > 0) await new Promise((r) => setTimeout(r, espera));
            _gdeltLastAt = Date.now();

            const qs = new URLSearchParams({
                query, mode, maxrecords: String(maxrecords), format: 'json', sort: 'DateDesc',
            });
            const payload = await gdeltFetch(`https://api.gdeltproject.org/api/v2/doc/doc?${qs}`);
            _gdeltCache.set(clave, payload);
            return payload;
        }));
        res.json(data);
    } catch (error) {
        /* «timeout» cuenta como motivo de bloqueo, y no solo el 429. Es un
           cinturón además del tirante de subir el plazo en gdeltFetch: si el
           proveedor vuelve a tardar más de lo que esperamos, el freno se activa
           igual en vez de dejar a cada petición pagando la espera entera. Un
           timeout repetido significa exactamente lo mismo que un 429 —no vamos a
           conseguir dato ahora—, así que la respuesta debe ser la misma. */
        if (/429|timeout/i.test(error.message)) _gdeltBloqueadoHasta = Date.now() + GDELT_CASTIGO_MS;
        console.error('/api/gdelt:', error.message);
        const viejo = _gdeltCache.stale(clave);
        if (viejo) return res.json(viejo);
        // Se devuelve la forma esperada y vacía: el cliente hace j.articles y
        // con un cuerpo ausente caería en su rama de excepción.
        res.status(502).json({ articles: [], error: 'GDELT no disponible.' });
    }
});

// ── /api/finnhub-news ─────────────────────────────────────────────────────────
const FINNHUB_TOKEN = process.env.FINNHUB_TOKEN || '';
const _finnhubCache = cacheSimple(10 * 60 * 1000);
const FINNHUB_CATEGORIAS = new Set(['general', 'forex', 'crypto', 'merger']);

router.get('/finnhub-news', async (req, res) => {
    const category = String(req.query.category || 'general');
    if (!FINNHUB_CATEGORIAS.has(category)) {
        return res.status(400).json({ error: 'Categoría no soportada por Finnhub.' });
    }
    const fresco = _finnhubCache.get(category);
    if (fresco) {
        res.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
        return res.json(fresco);
    }
    if (!FINNHUB_TOKEN) return res.status(503).json({ error: 'FINNHUB_TOKEN no configurado.' });

    try {
        const url = `https://finnhub.io/api/v1/news?category=${category}&token=${encodeURIComponent(FINNHUB_TOKEN)}`;
        const response = await externalGet(url, {}, 10000);
        const payload = await response.json();
        if (!Array.isArray(payload)) throw new Error(payload?.error || 'Respuesta inesperada de Finnhub');
        _finnhubCache.set(category, payload);
        res.json(payload);
    } catch (error) {
        console.error('/api/finnhub-news:', error.message);
        const viejo = _finnhubCache.stale(category);
        if (viejo) return res.json(viejo);
        res.status(502).json({ error: 'Finnhub no disponible.' });
    }
});

// ── /api/alphavantage-news ────────────────────────────────────────────────────
// El plan gratuito son 25 peticiones AL DÍA, así que la caché es de horas: sin
// ella, una sola sesión con varias recargas agota la cuota del día entero.
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY || '';
const _avNewsCache = cacheSimple(3 * 60 * 60 * 1000);

// Además del tope diario, el plan gratuito limita a 1 petición por segundo, y
// Mercados dispara varias a la vez (granos, energía, metales). Llegaban juntas y
// Alpha Vantage las rechazaba TODAS con un 200 y un {Information} de cortesía.
const AV_MIN_MS = 1200;
let _avLastAt = 0;
let _avCola = Promise.resolve();

/* Freno de cuota. El plan gratuito son 25 peticiones AL DÍA, y esa cuota la
   COMPARTEN estos titulares con los precios de maíz y trigo de /api/commodity,
   que usan la misma clave. Una petición rechazada por cuota gasta cupo igual.

   La respuesta {Information} no se cachea a propósito —dejaría el panel en
   blanco durante horas—, pero el efecto colateral era que cada carga de Inicio
   y de México volvía a preguntar y volvía a gastar. Con esto, tras el primer
   rechazo por cuota se deja de llamar durante una hora y se sirve lo último
   bueno que haya, que es justo lo que protege a los precios. */
const AV_CUOTA_MS = 60 * 60 * 1000;
let _avBloqueadoHasta = 0;
const _esCuota = (msg) => /rate limit|higher api call|premium|per day|thank you for using/i.test(msg || '');

router.get('/alphavantage-news', async (req, res) => {
    const topics = String(req.query.topics || 'financial_markets').slice(0, 120);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    if (!/^[a-z_,]+$/i.test(topics)) return res.status(400).json({ error: 'Temas inválidos.' });

    const clave = `${topics}|${limit}`;
    const fresco = _avNewsCache.get(clave);
    if (fresco) {
        res.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
        return res.json(fresco);
    }
    if (!ALPHA_VANTAGE_KEY) return res.status(503).json({ error: 'ALPHA_VANTAGE_KEY no configurada.' });

    // Cuota agotada: no se vuelve a gastar cupo, que lo necesitan los precios.
    if (Date.now() < _avBloqueadoHasta) {
        const viejo = _avNewsCache.stale(clave);
        return res.status(viejo ? 200 : 503).json(viejo || { feed: [], error: 'Cuota de Alpha Vantage agotada.' });
    }

    try {
        const payload = await (_avCola = _avCola.then(async () => {
            const cacheado = _avNewsCache.get(clave);
            if (cacheado) return cacheado;

            const espera = AV_MIN_MS - (Date.now() - _avLastAt);
            if (espera > 0) await new Promise((r) => setTimeout(r, espera));
            _avLastAt = Date.now();

            const qs = new URLSearchParams({
                function: 'NEWS_SENTIMENT', topics, limit: String(limit), apikey: ALPHA_VANTAGE_KEY,
            });
            const response = await externalGet(`https://www.alphavantage.co/query?${qs}`, {}, 12000);
            const cuerpo = await response.json();
            // Alpha Vantage responde 200 con {Information} o {Note} al pasarse de
            // cuota; cachearlo dejaría el panel en blanco durante horas.
            if (cuerpo?.Information || cuerpo?.Note) throw new Error(cuerpo.Information || cuerpo.Note);
            if (!Array.isArray(cuerpo?.feed)) throw new Error('Respuesta sin feed');
            _avNewsCache.set(clave, cuerpo);
            return cuerpo;
        }));
        res.json(payload);
    } catch (error) {
        if (_esCuota(error.message)) {
            _avBloqueadoHasta = Date.now() + AV_CUOTA_MS;
            console.warn('/api/alphavantage-news: cuota agotada, en pausa 1 h para no gastar el cupo de los precios.');
        } else {
            console.error('/api/alphavantage-news:', error.message);
        }
        const viejo = _avNewsCache.stale(clave);
        if (viejo) return res.json(viejo);
        res.status(502).json({ error: 'Alpha Vantage no disponible.' });
    }
});

// ── /api/crypto-global ────────────────────────────────────────────────────────
// Dominancia de BTC y capitalización total. CoinGecko no pide clave para esto.
const _cryptoCache = cacheSimple(10 * 60 * 1000);

router.get('/crypto-global', async (req, res) => {
    const fresco = _cryptoCache.get('global');
    if (fresco) return res.json(fresco);
    try {
        const response = await externalGet('https://api.coingecko.com/api/v3/global', {}, 10000);
        const payload = await response.json();
        if (!payload?.data?.market_cap_percentage) throw new Error('Respuesta inesperada de CoinGecko');
        _cryptoCache.set('global', payload);
        res.json(payload);
    } catch (error) {
        console.error('/api/crypto-global:', error.message);
        const viejo = _cryptoCache.stale('global');
        if (viejo) return res.json(viejo);
        res.status(502).json({ error: 'CoinGecko no disponible.' });
    }
});

// ── /api/exchange-rates ───────────────────────────────────────────────────────
// Base USD. open.er-api.com es la variante abierta de ExchangeRate-API: no pide
// clave y actualiza una vez al día, de ahí la caché larga.
const _fxCache = cacheSimple(60 * 60 * 1000);

router.get('/exchange-rates', async (req, res) => {
    const fresco = _fxCache.get('usd');
    if (fresco) return res.json(fresco);
    try {
        const response = await externalGet('https://open.er-api.com/v6/latest/USD', {}, 10000);
        const payload = await response.json();
        if (!payload?.rates?.MXN) throw new Error('Respuesta sin tipos de cambio');
        // La cotización puntual no incluye variación. Frankfurter aporta los dos
        // últimos cierres hábiles de una misma serie para colorear el mapa sin
        // mezclar niveles de proveedores distintos.
        try {
            const end = new Date();
            const start = new Date(end);
            start.setUTCDate(start.getUTCDate() - 10);
            const iso = date => date.toISOString().slice(0,10);
            const historyResponse = await externalGet(`https://api.frankfurter.app/${iso(start)}..${iso(end)}?from=USD`, {}, 10000);
            const historyPayload = await historyResponse.json();
            const dates = Object.keys(historyPayload?.rates || {}).sort();
            if (dates.length >= 2) {
                const currentDate = dates[dates.length - 1];
                const previousDate = dates[dates.length - 2];
                payload.comparison = {
                    source: 'Frankfurter · BCE',
                    currentDate,
                    previousDate,
                    currentRates: { USD:1, ...historyPayload.rates[currentDate] },
                    previousRates: { USD:1, ...historyPayload.rates[previousDate] },
                };
            }
        } catch (comparisonError) {
            console.warn('/api/exchange-rates comparación diaria:', comparisonError.message);
        }
        _fxCache.set('usd', payload);
        res.json(payload);
    } catch (error) {
        console.error('/api/exchange-rates:', error.message);
        const viejo = _fxCache.stale('usd');
        if (viejo) return res.json(viejo);
        res.status(502).json({ error: 'Proveedor de divisas no disponible.' });
    }
});

// ── /api/country-currencies ──────────────────────────────────────────────────
// Catálogo geográfico para el conversor cartográfico. Los tipos de cambio se
// consultan por separado en /exchange-rates; aquí sólo se relaciona cada país
// con sus monedas oficiales y nombres localizados.
const _countryCurrencyCache = cacheSimple(24 * 60 * 60 * 1000);

router.get('/country-currencies', async (req, res) => {
    const fresh = _countryCurrencyCache.get('all');
    if (fresh) return res.json(fresh);
    try {
        const response = await externalGet(
            'https://countries.dev/countries?fields=name,alpha2Code,region,subregion,currencies,flag&limit=300',
            {},
            15000
        );
        const payload = await response.json();
        if (!Array.isArray(payload) || !payload.length) throw new Error('Catálogo de países vacío');
        const countries = payload.map(country => ({
            code: country.alpha2Code || '',
            name: country.name || '',
            officialName: country.name || '',
            spanishName: country.name || '',
            region: country.region || '',
            subregion: country.subregion || '',
            flag: country.flag || '',
            currencies: (country.currencies || []).map(detail => ({
                code: detail?.code || '',
                name: detail?.name || detail?.code || '',
                symbol: detail?.symbol || detail?.code || '',
            })).filter(currency => currency.code),
        })).filter(country => country.name && country.currencies.length);
        const result = { updatedAt: new Date().toISOString(), countries };
        _countryCurrencyCache.set('all', result);
        res.json(result);
    } catch (error) {
        console.error('/api/country-currencies:', error.message);
        const stale = _countryCurrencyCache.stale('all');
        if (stale) return res.json(stale);
        res.status(502).json({ error: 'Catálogo internacional de monedas no disponible.' });
    }
});

// ── /api/open-interest ────────────────────────────────────────────────────
// Interés abierto y posicionamiento de los granos de Chicago, del COT que la
// CFTC publica cada viernes con datos al martes.
//
// Por qué la CFTC y no el CME: el interés abierto diario lo publica el propio
// CME, pero detrás de descargas de pago o de un scraping que se rompe solo. El
// COT es un dataset público en Socrata, sin clave, y trae algo que el dato del
// CME no tiene — el desglose POR TIPO DE OPERADOR, que es lo que convierte un
// número de contratos en una lectura: no es lo mismo que el interés abierto
// suba porque los fondos abren largos que porque la industria cubre cosecha.
//
// Se paga un precio por ello y la vista lo dice: el dato tiene tres días de
// rezago cuando sale y hasta diez al final de la semana. Sirve para leer
// posicionamiento, no para operar intradía.
//
// Informe LEGACY y FUTURES ONLY, de los cuatro que publica la CFTC. Legacy
// porque sus tres categorías —no comerciales, comerciales y no reportables— son
// las que se leen sin un glosario delante; futures only porque el simulador de
// al lado ya trata las opciones aparte y sumarlas aquí mezclaría dos cosas que
// la sección presenta separadas.
// Agrupados por la pestaña que los enseña. Granos van los tres de Chicago;
// Proteínas, los dos contratos que la sección ya cotiza de verdad —cerdo y res—
// más el becerro de engorda: es el INSUMO de la res, y esa pestaña modela
// justamente la cadena de engorda con su conversión alimenticia, así que su
// posicionamiento se lee junto al del animal terminado y no aparte.
//
// Pollo y huevo no están y no es un olvido: no tienen futuros en ningún
// mercado, así que no hay interés abierto que enseñar. La vista lo dice en vez
// de dejar dos huecos sin explicación.
const COT_CONTRATOS = {
    granos: {
        maiz:  { codigo: '002602', nombre: 'Maíz' },
        trigo: { codigo: '001602', nombre: 'Trigo' },
        soja:  { codigo: '005602', nombre: 'Soja' },
    },
    proteinas: {
        cerdo:   { codigo: '054642', nombre: 'Cerdo' },
        res:     { codigo: '057642', nombre: 'Res' },
        becerro: { codigo: '061641', nombre: 'Becerro de engorda' },
    },
};

const COT_CAMPOS = [
    'report_date_as_yyyy_mm_dd', 'market_and_exchange_names', 'open_interest_all',
    'noncomm_positions_long_all', 'noncomm_positions_short_all',
    'comm_positions_long_all', 'comm_positions_short_all',
    'nonrept_positions_long_all', 'nonrept_positions_short_all',
];

// Un año de historia: es lo que hace falta para situar el interés abierto de hoy
// en su propio rango anual, que es la única forma de saber si 1.7 millones de
// contratos es mucho o poco. En un dato semanal son 53 filas por grano.
const COT_SEMANAS = 53;
const _cotCache = cacheSimple(12 * 60 * 60 * 1000);

const numCot = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/* Un reintento y no más. Lanzando los seis contratos a la vez se vio fallar la
   tanda ENTERA con `fetch failed` —error de red, no respuesta de la CFTC— y a
   los pocos segundos funcionar sin tocar nada. Encaja con la intercepción de
   TLS de esta red, que es la misma razón por la que GDELT se serializa más
   arriba en este archivo. Con seis peticiones en serie y un reintento, un
   tropiezo suelto deja de vaciar el panel. */
async function pedirCot(url, intento = 0) {
    try {
        const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
        if (!r.ok) throw new Error(`CFTC ${r.status}`);
        return await r.json();
    } catch (e) {
        if (intento > 0) throw e;
        await espera(600);
        return pedirCot(url, intento + 1);
    }
}

async function cotDeContrato(codigo) {
    const url = 'https://publicreporting.cftc.gov/resource/6dca-aqww.json'
        + `?cftc_contract_market_code=${encodeURIComponent(codigo)}`
        + `&%24select=${encodeURIComponent(COT_CAMPOS.join(','))}`
        + '&%24order=report_date_as_yyyy_mm_dd%20DESC'
        + `&%24limit=${COT_SEMANAS}`;

    const filas = await pedirCot(url);
    if (!Array.isArray(filas) || !filas.length) throw new Error('sin filas');

    /* Socrata devuelve la fecha como instante ISO ('2026-08-18T00:00:00.000').
       Se recorta al día: la hora es siempre medianoche y no significa nada, y
       dejarla haría que el cliente la reinterpretara en su zona horaria y
       enseñara el martes como lunes en toda América. */
    const puntos = filas.map((f) => ({
        fecha: String(f.report_date_as_yyyy_mm_dd || '').slice(0, 10),
        oi: numCot(f.open_interest_all),
        gestores: { largos: numCot(f.noncomm_positions_long_all), cortos: numCot(f.noncomm_positions_short_all) },
        comerciales: { largos: numCot(f.comm_positions_long_all), cortos: numCot(f.comm_positions_short_all) },
        pequenos: { largos: numCot(f.nonrept_positions_long_all), cortos: numCot(f.nonrept_positions_short_all) },
    })).filter((p) => p.fecha && p.oi > 0);

    if (!puntos.length) throw new Error('sin interés abierto');
    /* Ascendente: la vista dibuja una línea de tiempo y el orden de Socrata es
       el inverso, el más reciente primero. */
    puntos.reverse();
    return { contrato: String(filas[0].market_and_exchange_names || '').trim(), puntos };
}

router.get('/open-interest', async (req, res) => {
    const cacheado = _cotCache.get('todo');
    if (cacheado) return res.json(cacheado);

    try {
        /* Los seis contratos en UN endpoint y no una familia en cada uno: la
           respuesta entera son ~53 KB, se cachea 12 h y así abrir una pestaña
           deja servida a la otra. Partirlo obligaría a pedir dos veces lo que
           la CFTC publica de una sola vez, el mismo viernes.

           En SERIE y espaciados, que es lo contrario de lo que pedía el
           instinto: en paralelo la tanda entera falló de golpe. Cuesta unos
           segundos más una vez cada 12 h y a cambio el panel no desaparece. */
        const planas = [];
        for (const [familia, contratos] of Object.entries(COT_CONTRATOS)) {
            for (const [clave, def] of Object.entries(contratos)) planas.push({ familia, clave, def });
        }

        const familias = {};
        for (const { familia, clave, def } of planas) {
            try {
                const valor = await cotDeContrato(def.codigo);
                (familias[familia] ||= {})[clave] = { nombre: def.nombre, ...valor };
            } catch (e) {
                /* `fetch failed` a secas no dice nada: el motivo real de undici
                   vive en `cause`, y sin él un fallo de red se confunde con uno
                   de la API. */
                const causa = e?.cause?.message || e?.cause?.code || '';
                console.error(`/api/open-interest ${familia}/${clave}:`, e?.message || e, causa && `· ${causa}`);
            }
            await espera(250);
        }

        /* Con uno solo que llegue, esa familia ya dice algo, y los que falten se
           quedan fuera en vez de tumbar el bloque entero. Si no llega ninguno es
           un fallo de verdad y se trata como tal: nunca se responde 200 con el
           objeto vacío, que es como un panel se queda en blanco sin explicar por
           qué —el modo de fallar que ya costó caro en Finanzas—. */
        if (!Object.keys(familias).length) throw new Error('ningún contrato disponible');

        const data = {
            fuente: 'CFTC · Commitments of Traders (Legacy, futures only)',
            actualizado: new Date().toISOString(),
            familias,
        };
        _cotCache.set('todo', data);
        res.json(data);
    } catch (error) {
        console.error('/api/open-interest:', error.message);
        const viejo = _cotCache.stale('todo');
        if (viejo) return res.json(viejo);
        res.status(502).json({ error: 'El COT de la CFTC no está disponible.' });
    }
});

// ── PROTEÍNAS: Proyecto Loopus · datos reales y aprendizaje supervisado ─────
// Genera un insight de IA consumiendo los datos verificados, y lo cachea.
const _aiInsightCache = new BoundedCache({ maxEntries: 64, maxBytes: 1024 * 1024 });
const AI_INSIGHT_TTL = 2 * 60 * 60 * 1000; // 2 horas

router.post('/ml/insight-proteinas', verifyToken, analysisLimiter, boundedJson({ limit: '10kb' }), analysisWork(async (req, res) => {
    let input;
    try { input = proteinAnalysisInput(req.body); }
    catch (error) { return res.status(400).json({ success: false, error: error.message }); }
    const cacheKey = analysisCacheKey(req, input);
    const hit = _aiInsightCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < AI_INSIGHT_TTL) {
        return res.json({ insight: hit.insight });
    }

    try {
        const { orchestrator } = require('../ai/orchestrator');
        
        const contextData = `
DATOS NUMÉRICOS PROPORCIONADOS POR EL CLIENTE (no constituyen por sí mismos evidencia verificada):
- Referencia INEGI (México al consumidor): Cerdo ${input.porkMxn ?? '?'} MXN/kg
- Referencia CME Lean Hogs (Futuros): ${input.hogsUsd ?? '?'} USD/lb
- Referencia BLS (EE.UU. al consumidor): Beef ${input.beefUsd ?? '?'} USD/lb
- Referencia WOAH: ${input.alerts} alertas proporcionadas; fecha y fuente no comprobadas aquí.
- Referencia Maíz: ${input.cornUsd ?? '?'} USD/bu
        `.trim();

        const prompt = `Eres Proyecto Loopus, el sistema de aprendizaje de VALL AI especializado en mercados pecuarios.
Genera una lectura condicional de los datos numéricos proporcionados (máximo 3 líneas). No los declares verificados ni los presentes como cotizaciones vigentes sin fuente y fecha comprobadas.
Usa formato HTML (<b> para negritas). No uses saludos ni introducciones, ve directo al grano.
ENFOQUE: Detectar oportunidades de rentabilidad, exportación o presiones inflacionarias/sanitarias.`;

        // Llamamos al orquestador para que aplique las REGLAS NEURONALES y memoria RAG
        const result = await orchestrator.generateStructured({
            message: prompt,
            context: contextData,
            mode: 'executive',
            tier: 'flash',
            taskType: 'decision'
        });

        const insight = String(result.text || '').slice(0, 12000);
        
        _aiInsightCache.set(cacheKey, { ts: Date.now(), insight });
        res.json({ insight });
    } catch (e) {
        console.error('[Loopus Insight Error]:', e.message);
        res.json({ 
            insight: `<b>Proyecto Loopus:</b> Procesando divergencias... ` +
            (input.hogsUsd != null ? `Referencia de futuros proporcionada: ${input.hogsUsd}. ` : '') +
            (input.alerts > 0 ? `Se proporcionaron ${input.alerts} alertas para revisar.` : 'Sin alertas verificadas en esta consulta.')
        });
    }
}));

module.exports = router;
