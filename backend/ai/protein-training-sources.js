'use strict';

// Evidencia para el observatorio de proteínas. Se conserva el tipo de dato y
// su procedencia: Gemini sólo puede resumir estas observaciones, no inventar
// cifras, precios ni alertas sanitarias.
const fs = require('fs');
const https = require('https');
const path = require('path');
const vm = require('vm');
const { REJECT_UNAUTHORIZED } = require('../lib/http');

// El ciclo puede ejecutarse fuera de server.js; en ese caso también necesita
// las credenciales locales. `.env` está ignorado por Git y nunca se expone al
// cliente ni se guarda dentro de los snapshots.
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const FAO_DATA_FILE = path.resolve(__dirname, '../../frontend/src/lib/produccion-proteinas.js');

function requestJson(url, { method = 'GET', body, headers = {}, timeout = 20_000 } = {}) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const request = https.request({
            hostname: target.hostname, port: target.port || 443,
            path: `${target.pathname}${target.search}`, method, rejectUnauthorized: REJECT_UNAUTHORIZED,
            headers: { Accept: 'application/json', 'User-Agent': 'VALLNews-Protein-Research/1.0', ...headers },
        }, response => {
            let content = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { content += chunk; });
            response.on('end', () => {
                if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`HTTP ${response.statusCode}`));
                try { resolve(JSON.parse(content)); } catch { reject(new Error('Respuesta no JSON')); }
            });
        });
        request.setTimeout(timeout, () => request.destroy(new Error('Tiempo de espera agotado')));
        request.on('error', reject);
        if (body) request.write(body);
        request.end();
    });
}

function extractExportObject(source, name) {
    const match = source.match(new RegExp(`export const ${name} = (\\{[\\s\\S]*?\\n\\};)`));
    if (!match) throw new Error(`No se encontró ${name} en el conjunto FAOSTAT local.`);
    return vm.runInNewContext(`(${match[1].replace(/;\s*$/, '')})`, Object.create(null), { timeout: 1_000 });
}

function extractExportArray(source, name) {
    const match = source.match(new RegExp(`export const ${name} = (\\[[\\s\\S]*?\\]);`));
    if (!match) throw new Error(`No se encontró ${name} en el conjunto FAOSTAT local.`);
    return vm.runInNewContext(`(${match[1]})`, Object.create(null), { timeout: 1_000 });
}

function faoGlobalSnapshot() {
    const source = fs.readFileSync(FAO_DATA_FILE, 'utf8');
    const years = extractExportArray(source, 'ANIOS');
    const world = extractExportObject(source, 'MUNDO');
    const measuredYear = Number((source.match(/export const ANIO = '([^']+)'/) || [])[1]);
    const observedIndex = years.indexOf(measuredYear);
    if (observedIndex < 0) throw new Error('El año observado de FAOSTAT no está en la serie local.');
    const species = { cerdo: 'Pork', pollo: 'Chicken meat', res: 'Beef', huevo: 'Eggs' };
    const production = Object.fromEntries(Object.entries(species).map(([id, label]) => [id, {
        label, million_tonnes: world.prod?.[id]?.[observedIndex] ?? null,
        year: measuredYear,
    }]));
    return {
        source_id: 'fao_faostat_global',
        source_name: 'FAOSTAT — Food Balances and Crop and Livestock Products',
        source_url: 'https://www.fao.org/faostat/',
        data_type: 'observed_annual', is_forecast: false, retrieved_at: new Date().toISOString(),
        data_vintage: String(measuredYear),
        payload: { global_production_million_tonnes: production, note: 'Serie local trazada a FAOSTAT; los años posteriores al último medido se excluyen del entrenamiento.' },
    };
}

async function worldBankLivestockSnapshot() {
    const data = await requestJson('https://api.worldbank.org/v2/country/WLD/indicator/AG.PRD.LVSK.XD?format=json&per_page=12&date=2020:2026');
    const values = Array.isArray(data?.[1]) ? data[1].filter(row => Number.isFinite(row?.value)).map(row => ({ year: Number(row.date), value: row.value })).sort((a, b) => a.year - b.year) : [];
    return {
        source_id: 'world_bank_livestock_index', source_name: 'World Bank — Livestock production index',
        source_url: 'https://data.worldbank.org/indicator/AG.PRD.LVSK.XD', data_type: 'observed_annual', is_forecast: false,
        retrieved_at: new Date().toISOString(), data_vintage: values.at(-1)?.year ? String(values.at(-1).year) : null,
        payload: { index_2004_2006_100: values },
    };
}

async function blsRetailSnapshot() {
    // Series CPI de BLS: res molida, pechuga de pollo, huevo y chuleta de cerdo.
    const seriesIds = ['APU0000FF1101', 'APU0000FD3101', 'APU0000FE1101', 'APU0000FF2101'];
    const names = { APU0000FF1101: 'res', APU0000FD3101: 'pollo', APU0000FE1101: 'huevo', APU0000FF2101: 'cerdo' };
    const year = new Date().getFullYear();
    const response = await requestJson('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesid: seriesIds, startyear: String(year - 1), endyear: String(year) }),
    });
    const prices = {};
    for (const series of response?.Results?.series || []) {
        const latest = (series.data || []).find(point => /^M\d{2}$/.test(point.period) && Number.isFinite(Number(point.value)));
        if (latest && names[series.seriesID]) prices[names[series.seriesID]] = {
            value: Number(latest.value), period: `${latest.year}-${latest.period.slice(1)}`,
            unit: names[series.seriesID] === 'huevo' ? 'USD/dozen' : 'USD/lb',
        };
    }
    return {
        source_id: 'bls_us_retail', source_name: 'U.S. Bureau of Labor Statistics — Average Price Data',
        source_url: 'https://www.bls.gov/data/', data_type: 'observed_monthly', is_forecast: false,
        retrieved_at: new Date().toISOString(), data_vintage: Object.values(prices)[0]?.period || null, payload: { prices },
    };
}

async function inegiRetailSnapshot() {
    const token = process.env.INEGI_TOKEN;
    if (!token) throw new Error('INEGI_TOKEN no configurado');
    const series = { pollo: '628194', huevo: '628229', cerdo: '628191', res: '628188' };
    const rows = await Promise.all(Object.entries(series).map(async ([species, indicator]) => {
        const url = `https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/INDICATOR/${indicator}/es/0700/true/BIE/2.0/${encodeURIComponent(token)}?type=json`;
        const data = await requestJson(url, { timeout: 15_000 });
        const observations = data?.Series?.[0]?.OBSERVATIONS || [];
        const last = observations.at(-1);
        return last && Number.isFinite(Number(last.OBS_VALUE)) ? [species, { value: Number(last.OBS_VALUE), period: last.TIME_PERIOD, unit: 'MXN/kg' }] : null;
    }));
    const prices = Object.fromEntries(rows.filter(Boolean));
    return {
        source_id: 'inegi_mx_retail', source_name: 'INEGI — Banco de Información Económica',
        source_url: 'https://www.inegi.org.mx/app/indicadores/', data_type: 'observed_monthly', is_forecast: false,
        retrieved_at: new Date().toISOString(), data_vintage: Object.values(prices)[0]?.period || null, payload: { prices },
    };
}

async function woahHealthSnapshot() {
    const url = 'https://wahis.woah.org/api/v1/pi/event/filtered?pageNumber=1&pageSize=20&eventStatuses=CONFIRMED&diseaseNames=African%20swine%20fever,Highly%20pathogenic%20avian%20influenza';
    const response = await requestJson(url);
    const alerts = Array.isArray(response?.content) ? response.content.slice(0, 20).map(event => ({
        disease: event.diseaseName || null, country: event.countryName || null,
        report_date: event.reportDate || event.startDate || null, status: event.eventStatus || null,
    })) : [];
    return {
        source_id: 'woah_wahis', source_name: 'WOAH — World Animal Health Information System',
        source_url: 'https://wahis.woah.org/', data_type: 'official_health_notification', is_forecast: false,
        retrieved_at: new Date().toISOString(), data_vintage: alerts[0]?.report_date || null, payload: { alerts },
    };
}

function nassNumber(value) {
    const normalized = String(value ?? '').replace(/,/g, '').trim();
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
}

function latestNassObservation(rows) {
    // Quick Stats incluye múltiples cortes de la misma serie. Conservamos el
    // agregado nacional en cabezas y la descripción literal del indicador;
    // así no se confunde, por ejemplo, "CATTLE ON FEED" con todo el hato.
    const candidates = (Array.isArray(rows) ? rows : []).filter(row =>
        String(row.agg_level_desc || '').toUpperCase() === 'NATIONAL'
        && String(row.unit_desc || '').toUpperCase() === 'HEAD'
        && String(row.domain_desc || '').toUpperCase() === 'TOTAL'
        && nassNumber(row.Value) !== null
    );
    return candidates.sort((a, b) =>
        Number(b.year || 0) - Number(a.year || 0)
        || String(b.reference_period_desc || '').localeCompare(String(a.reference_period_desc || ''))
    )[0] || null;
}

async function usdaNassLivestockSnapshot() {
    const apiKey = process.env.USDA_NASS_KEY;
    if (!apiKey) throw new Error('USDA_NASS_KEY no configurado');

    const inventories = await Promise.all(['CATTLE', 'HOGS'].map(async commodity => {
        const params = new URLSearchParams({
            key: apiKey,
            commodity_desc: commodity,
            statisticcat_desc: 'INVENTORY',
            agg_level_desc: 'NATIONAL',
            format: 'JSON',
        });
        const data = await requestJson(`https://quickstats.nass.usda.gov/api/api_GET/?${params.toString()}`);
        const latest = latestNassObservation(data?.data);
        if (!latest) throw new Error(`USDA NASS no devolvió inventario nacional utilizable para ${commodity}`);
        return [commodity === 'CATTLE' ? 'cattle_on_feed' : 'hogs', {
            value: nassNumber(latest.Value),
            unit: 'head',
            year: Number(latest.year),
            period: latest.reference_period_desc || null,
            short_description: latest.short_desc || null,
        }];
    }));

    const values = Object.fromEntries(inventories);
    return {
        source_id: 'usda_nass_quick_stats', source_name: 'USDA NASS — Quick Stats',
        source_url: 'https://data.nass.usda.gov/developer/', data_type: 'official_inventory', is_forecast: false,
        retrieved_at: new Date().toISOString(),
        data_vintage: String(Math.max(...Object.values(values).map(item => item.year || 0))) || null,
        payload: { national_stock: values },
    };
}

function latestEurostatObservation(data) {
    const positions = Object.entries(data?.dimension?.time?.category?.index || {})
        .map(([period, index]) => ({ period, index: Number(index), value: Number(data?.value?.[index]) }))
        .filter(item => Number.isFinite(item.index) && Number.isFinite(item.value))
        .sort((a, b) => a.period.localeCompare(b.period));
    return positions.at(-1) || null;
}

async function eurostatPigmeatSnapshot() {
    // apro_mt_pwgtm = producción mensual de carne. B3100 es carne de cerdo;
    // THS_T evita inferir unidades desde la respuesta.
    const url = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/apro_mt_pwgtm?geo=EU27_2020&meat=B3100&unit=THS_T&lang=EN';
    const data = await requestJson(url);
    const latest = latestEurostatObservation(data);
    if (!latest) throw new Error('Eurostat no devolvió producción mensual utilizable de carne de cerdo');
    return {
        source_id: 'eurostat_pigmeat_eu27', source_name: 'Eurostat — Pigmeat production',
        source_url: url, data_type: 'official_monthly_production', is_forecast: false,
        retrieved_at: new Date().toISOString(), data_vintage: latest.period,
        payload: {
            geography: 'EU27_2020', species: 'pigmeat',
            value: latest.value, unit: 'thousand_tonnes', period: latest.period,
            dataset: 'apro_mt_pwgtm',
        },
    };
}

function ibgeNumber(value) {
    const normalized = String(value ?? '').replace(/\./g, '').replace(',', '.').trim();
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
}

async function ibgeSlaughterSnapshot() {
    // Tablas oficiales SIDRA: 1092 bovinos, 1093 suínos y 1094 pollos.
    const tables = [
        ['cattle', '1092'], ['hogs', '1093'], ['chickens', '1094'],
    ];
    const entries = await Promise.all(tables.map(async ([species, table]) => {
        const url = `https://apisidra.ibge.gov.br/values/t/${table}/n1/1/v/284/p/last%201`;
        const rows = await requestJson(url);
        const observation = Array.isArray(rows) ? rows.slice(1).find(row => row?.D2N === 'Animais abatidos' && row?.D4N === 'Total') : null;
        const value = ibgeNumber(observation?.V);
        if (!observation || value === null) throw new Error(`IBGE no devolvió sacrificio nacional utilizable para ${species}`);
        return [species, {
            value, unit: observation.MN || 'Cabeças', period: observation.D3N || null,
            reference: observation.D6N || null, table,
        }];
    }));
    const slaughter = Object.fromEntries(entries);
    return {
        source_id: 'ibge_sidra_slaughter', source_name: 'IBGE SIDRA — Pesquisa Trimestral do Abate',
        source_url: 'https://sidra.ibge.gov.br/', data_type: 'official_quarterly_slaughter', is_forecast: false,
        retrieved_at: new Date().toISOString(), data_vintage: slaughter.cattle?.period || null,
        payload: { geography: 'Brasil', slaughter },
    };
}

const SOURCE_CATALOG = [
    { source_id: 'usda_nass_quick_stats', source_name: 'USDA NASS — Quick Stats', source_url: 'https://data.nass.usda.gov/developer/', cadence: 'quarterly_or_annual', access: 'API key configurada; inventarios nacionales de bovino y cerdo' },
    { source_id: 'eurostat_pigmeat_eu27', source_name: 'Eurostat — Pigmeat production', source_url: 'https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started', cadence: 'monthly', access: 'API pública; producción de cerdo UE-27' },
    { source_id: 'ibge_sidra_slaughter', source_name: 'IBGE SIDRA — Pesquisa Trimestral do Abate', source_url: 'https://sidra.ibge.gov.br/', cadence: 'quarterly', access: 'API pública; sacrificio brasileño por especie' },
    { source_id: 'usda_fas_psd', source_name: 'USDA FAS — Production, Supply and Distribution', source_url: 'https://apps.fas.usda.gov/psdonline/', cadence: 'monthly_or_biannual', access: 'API key requerida para la API moderna' },
    { source_id: 'fao_faostat_trade', source_name: 'FAOSTAT — Detailed Trade Matrix', source_url: 'https://data.fao.org/catalog/dataset/955a7b61-ce56-4a04-adf5-61a3012eec84', cadence: 'annual', access: 'API y descarga pública' },
    { source_id: 'fao_fishstat', source_name: 'FAO FishStat', source_url: 'https://www.fao.org/statistics/data-collection/fishery-and-aquaculture/en', cadence: 'annual', access: 'descarga pública' },
    { source_id: 'un_comtrade', source_name: 'UN Comtrade', source_url: 'https://comtradeplus.un.org/', cadence: 'monthly_or_annual', access: 'API con límites y clave según volumen' },
    { source_id: 'world_bank_pink_sheet', source_name: 'World Bank — Pink Sheet', source_url: 'https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/world-bank-commodities-price-data-the-pink-sheet', cadence: 'monthly', access: 'descarga pública' },
];

async function gatherProteinEvidence() {
    // WAHIS no ofrece una API pública estable para esta consulta; sus alertas
    // se incorporan por extracción semanal validada, no por un endpoint roto.
    const tasks = [faoGlobalSnapshot, worldBankLivestockSnapshot, blsRetailSnapshot, inegiRetailSnapshot, usdaNassLivestockSnapshot, eurostatPigmeatSnapshot, ibgeSlaughterSnapshot];
    const settled = await Promise.allSettled(tasks.map(task => Promise.resolve().then(task)));
    const snapshots = settled.filter(item => item.status === 'fulfilled').map(item => item.value);
    const failures = settled.filter(item => item.status === 'rejected').map(item => item.reason?.message || 'Fuente no disponible');
    return { snapshots, failures, source_catalog: SOURCE_CATALOG, collected_at: new Date().toISOString() };
}

module.exports = {
    gatherProteinEvidence, faoGlobalSnapshot, usdaNassLivestockSnapshot,
    eurostatPigmeatSnapshot, ibgeSlaughterSnapshot, SOURCE_CATALOG,
};
