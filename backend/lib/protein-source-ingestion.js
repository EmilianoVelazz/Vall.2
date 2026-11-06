'use strict';

/*
 * Conector de disponibilidad para las fuentes internacionales de proteínas.
 *
 * No hace scraping indiscriminado ni convierte texto de una página en una
 * cifra. Su responsabilidad es comprobar el origen oficial, conservar una
 * ficha mínima trazable y marcar la fuente como conectada únicamente después
 * de una respuesta HTTP correcta. Los adaptadores numéricos permanecen en
 * `ai/protein-training-sources.js`, donde se validan unidad, periodo y serie.
 */

const fs = require('fs');
const https = require('https');
const path = require('path');
const { SOURCES, getSourceConnectionStatuses } = require('./protein-source-catalog');
const { REJECT_UNAUTHORIZED } = require('./http');

const CACHE_FILE = path.join(__dirname, '../cache/protein-source-connections.json');
const REFRESH_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_PARALLEL = 5;
let refreshInFlight = null;

// Algunos portales institucionales son aplicaciones web pesadas o protegen la
// portada con un WAF, aunque sus recursos de datos sean públicos. Estos son
// endpoints oficiales ligeros que permiten comprobar la misma fuente sin
// depender de una pantalla gráfica. No contienen credenciales.
const PROBE_ENDPOINTS = Object.freeze({
    us_ams_lmpr: 'https://mpr.datamart.ams.usda.gov/services/v1.1/reports/2498/Cutout%20and%20Primal%20Values',
    ph_psa_livestock: 'https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/DB__2E__LP__INV__NEW/',
    global_oecd_sdmx: 'https://sdmx.oecd.org/public/rest/v1/dataflow/all/all/latest',
    ke_knbs_agriculture: 'https://new.knbs.or.ke/',
    global_fao_fpma: 'https://fpma.fao.org/giews/v4/global/price_module/api/v1/FpmaSerieDomestic/?iso3_country_codes=MEX&limit=1',
});
const STRUCTURED_DATA_SOURCES = new Set(['us_ams_lmpr', 'global_fao_fpma']);
const RECOVERY_HINTS = Object.freeze({
    id_bps_livestock: 'Requiere BPS_API_KEY gratuita para consultar la API oficial de Indonesia.',
    vn_nso_livestock: 'Se actualizó al dominio oficial NSO; se reintentará en el siguiente ciclo de conectividad.',
    au_abares_farm: 'El portal responde mediante descargas masivas; requiere un adaptador CSV dedicado.',
});

function cleanText(value, max = 240) {
    return String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#(?:x[0-9a-f]+|\d+);/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

function htmlTitle(html) {
    const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return cleanText(match?.[1], 180) || null;
}

function requestOfficialPage(url, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 5) return reject(new Error('Demasiadas redirecciones'));
        const target = new URL(url);
        const request = https.request({
            hostname: target.hostname,
            port: target.port || 443,
            path: `${target.pathname}${target.search}`,
            method: 'GET',
            rejectUnauthorized: REJECT_UNAUTHORIZED,
            headers: {
                Accept: 'text/html,application/json,application/xml;q=0.9,*/*;q=0.6',
                'User-Agent': 'VALLNews-Protein-SourceConnector/1.0 (+https://vallnews.local)',
            },
        }, response => {
            const status = Number(response.statusCode || 0);
            const location = response.headers.location;
            if (status >= 300 && status < 400 && location) {
                response.resume();
                return requestOfficialPage(new URL(location, target).toString(), redirects + 1).then(resolve, reject);
            }
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => {
                // La ficha sólo requiere identificar la publicación; no
                // retenemos ni procesamos el documento completo.
                if (body.length < 64_000) body += chunk.slice(0, 64_000 - body.length);
            });
            response.on('end', () => resolve({
                status,
                url: target.toString(),
                contentType: String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase(),
                body,
            }));
        });
        request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error('Tiempo de espera agotado')));
        request.on('error', reject);
        request.end();
    });
}

function readCache() {
    try {
        const saved = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        const connections = saved?.connections && typeof saved.connections === 'object' ? saved.connections : {};
        return {
            generated_at: typeof saved?.generated_at === 'string' ? saved.generated_at : null,
            connections,
            summary: connectionSummary(connections),
        };
    } catch {
        const connections = getSourceConnectionStatuses();
        return { generated_at: null, connections, summary: connectionSummary(connections) };
    }
}

function connectionSummary(connections) {
    const entries = Object.values(connections || {});
    return {
        checked: entries.length,
        connected: entries.filter(item => item?.status === 'connected').length,
        unavailable: entries.filter(item => item?.status !== 'connected').length,
    };
}

function writeCache(connections) {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({
        generated_at: new Date().toISOString(),
        connections,
    }, null, 2), 'utf8');
}

async function probeOfficialSource(source) {
    try {
        const probeUrl = PROBE_ENDPOINTS[source.id] || source.url;
        const response = await requestOfficialPage(probeUrl);
        if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
        return {
            status: 'connected', checked_at: new Date().toISOString(),
            mode: STRUCTURED_DATA_SOURCES.has(source.id) ? 'structured_api' : 'official_portal', source_url: source.url,
            endpoint_url: probeUrl, resolved_url: response.url || probeUrl, http_status: response.status,
            content_type: response.contentType || null,
            title: /html|xml/i.test(response.contentType) ? htmlTitle(response.body) : null,
        };
    } catch (error) {
        return {
            status: 'unavailable', checked_at: new Date().toISOString(),
            mode: STRUCTURED_DATA_SOURCES.has(source.id) ? 'structured_api' : 'official_portal', source_url: source.url,
            error: error.name === 'AbortError' ? 'Tiempo de espera agotado' : String(error.message || error).slice(0, 180),
            next_action: RECOVERY_HINTS[source.id] || 'Se reintentará automáticamente en el siguiente ciclo.',
        };
    }
}

async function mapConcurrent(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    async function run() {
        while (true) {
            const index = cursor++;
            if (index >= items.length) return;
            results[index] = await worker(items[index]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
    return results;
}

async function refreshProteinSourceConnections({ force = false } = {}) {
    if (refreshInFlight) return refreshInFlight;
    const cached = readCache();
    const cacheAge = Date.now() - Date.parse(cached.generated_at || 0);
    if (!force && Number.isFinite(cacheAge) && cacheAge >= 0 && cacheAge < REFRESH_MS) return cached;

    refreshInFlight = (async () => {
        const scheduled = SOURCES.filter(source => source.integration === 'scheduled_ingestion');
        const checked = await mapConcurrent(scheduled, MAX_PARALLEL, async source => [source.id, await probeOfficialSource(source)]);
        const connections = { ...cached.connections, ...Object.fromEntries(checked) };
        writeCache(connections);
        const status = {
            generated_at: new Date().toISOString(), connections,
            summary: connectionSummary(connections),
        };
        return status;
    })().finally(() => { refreshInFlight = null; });
    return refreshInFlight;
}

function getProteinSourceConnectionStatus() {
    const cached = readCache();
    const entries = Object.values(cached.connections);
    return {
        generated_at: cached.generated_at,
        summary: {
            checked: entries.length,
            connected: entries.filter(item => item?.status === 'connected').length,
            unavailable: entries.filter(item => item?.status === 'unavailable').length,
            stale: !cached.generated_at || Date.now() - Date.parse(cached.generated_at) >= REFRESH_MS,
        },
        connections: cached.connections,
    };
}

function initProteinSourceIngestion(isLongRunningServer) {
    if (!isLongRunningServer) return;
    setTimeout(() => {
        refreshProteinSourceConnections().then(status => {
            console.log(`[protein-sources] ${status.summary.connected}/${status.summary.checked} portales oficiales conectados.`);
        }).catch(error => console.warn('[protein-sources] No se pudo actualizar el catálogo:', error.message));
    }, 8_000).unref?.();
    const timer = setInterval(() => {
        refreshProteinSourceConnections({ force: true }).catch(error => console.warn('[protein-sources] Actualización falló:', error.message));
    }, REFRESH_MS);
    timer.unref?.();
}

module.exports = {
    getProteinSourceConnectionStatus,
    initProteinSourceIngestion,
    refreshProteinSourceConnections,
};
