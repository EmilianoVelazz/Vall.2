'use strict';

/* Pulso global del cerdo.
 *
 * USDA y Statistics Canada se consultan directamente en sus publicaciones
 * abiertas. ABPA publica su serie consolidada en el informe anual, por lo que
 * se conserva la última edición verificada hasta que la asociación publique
 * el siguiente informe. FAOSTAT ya alimenta el mapa histórico de la SPA y se
 * declara aquí para que la procedencia del panel sea visible.
 */
const JSZip = require('jszip');

const USDA_URL = 'https://www.fas.usda.gov/data/production/commodity/0113000';
const STATCAN_DOWNLOAD = 'https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/32100160/en';
const ABPA_URL = 'https://abpa-br.org/wp-content/uploads/2025/04/ABPA-Annual-Report-2025.pdf';
const FAOSTAT_URL = 'https://www.fao.org/faostat/es/#data/QCL';
const TTL_MS = 12 * 60 * 60 * 1000;
let cache = null;

function plainText(html) {
    return String(html || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&quot;/gi, '"')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function number(value) {
    const parsed = Number(String(value || '').replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
}

async function getUsdaWorldProduction() {
    const response = await fetch(USDA_URL, { headers: { 'User-Agent': 'VALLNews/2.0' } });
    if (!response.ok) throw new Error(`USDA HTTP ${response.status}`);

    const matches = [...plainText(await response.text()).matchAll(/(20\d{2})\/(20\d{2})\s+Production\s+([\d.,]+)\s+Million Metric Tons/gi)]
        .map((match) => ({ start: Number(match[1]), end: Number(match[2]), value: number(match[3]) }))
        .filter((item) => item.value != null);
    const latest = matches.sort((a, b) => b.end - a.end)[0];
    if (!latest) throw new Error('USDA no publicó producción mundial legible');
    return {
        productionMt: latest.value,
        marketYear: `${latest.start}/${String(latest.end).slice(-2)}`,
        source: 'USDA FAS · Production, Supply & Distribution',
        url: USDA_URL,
    };
}

function parseCsvRow(line) {
    return String(line || '').replace(/^\uFEFF/, '').replace(/^"|"$/g, '').split('","');
}

async function getCanadaInventory() {
    const manifestResponse = await fetch(STATCAN_DOWNLOAD);
    if (!manifestResponse.ok) throw new Error(`Statistics Canada HTTP ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    if (!manifest?.object) throw new Error('Statistics Canada no devolvió el archivo');

    const archiveResponse = await fetch(manifest.object);
    if (!archiveResponse.ok) throw new Error(`Archivo Statistics Canada HTTP ${archiveResponse.status}`);
    const zip = await JSZip.loadAsync(Buffer.from(await archiveResponse.arrayBuffer()));
    const csvFile = Object.keys(zip.files).find((name) => /^32100160\.csv$/i.test(name));
    if (!csvFile) throw new Error('No se encontró la tabla 32-10-0160-01');

    const rows = (await zip.file(csvFile).async('string')).split(/\r?\n/).slice(1).map(parseCsvRow);
    const matches = rows
        .filter((row) => row[1] === 'Canada' && row[3] === 'Hogs, total' && /^At (January|July) 1$/.test(row[4]))
        .map((row) => ({
            year: Number(row[0]),
            date: row[4],
            value: number(row[11]),
        }))
        .filter((row) => Number.isFinite(row.year) && row.value != null)
        .sort((a, b) => b.year - a.year || (b.date === 'At July 1') - (a.date === 'At July 1'));
    const latest = matches[0];
    if (!latest) throw new Error('Statistics Canada no publicó inventario porcino legible');
    return {
        inventoryMillions: latest.value / 1000,
        referenceDate: `${latest.date}, ${latest.year}`,
        source: 'Statistics Canada · Tabla 32-10-0160-01',
        url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3210016001',
    };
}

const brazil = Object.freeze({
    productionMt: 5.295,
    exportsMt: 1.353,
    exportShare: 25.5,
    year: 2024,
    source: 'ABPA · Informe anual 2025',
    url: ABPA_URL,
});

async function getGlobalPorkMonitor() {
    if (cache && Date.now() - cache.ts < TTL_MS) return cache.data;

    const [usda, canada] = await Promise.allSettled([getUsdaWorldProduction(), getCanadaInventory()]);
    const data = {
        available: usda.status === 'fulfilled' || canada.status === 'fulfilled',
        retrievedAt: new Date().toISOString(),
        world: usda.status === 'fulfilled' ? usda.value : null,
        canada: canada.status === 'fulfilled' ? canada.value : null,
        brazil,
        faostat: {
            coverage: '1961–2024',
            role: 'Producción, sacrificio y rendimiento histórico del mapa',
            source: 'FAOSTAT · Livestock Primary',
            url: FAOSTAT_URL,
        },
    };
    cache = { ts: Date.now(), data };
    return data;
}

module.exports = { getGlobalPorkMonitor };
