'use strict';

// Evidencia para el observatorio de proteínas. Se conserva el tipo de dato y
// su procedencia: Gemini sólo puede resumir estas observaciones, no inventar
// cifras, precios ni alertas sanitarias.
const fs = require('fs');
const https = require('https');
const path = require('path');
const vm = require('vm');
const JSZip = require('jszip');
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

function parseCsvRow(line) {
    const fields = []; let value = ''; let quoted = false;
    for (let index = 0; index < String(line || '').length; index++) {
        const character = line[index];
        if (character === '"') {
            if (quoted && line[index + 1] === '"') { value += '"'; index++; }
            else quoted = !quoted;
        } else if (character === ',' && !quoted) {
            fields.push(value); value = '';
        } else value += character;
    }
    fields.push(value);
    return fields.map(field => field.replace(/^\uFEFF/, '').trim());
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

async function blsRetailSnapshot(request = requestJson) {
    // Average Price Data: precios minoristas mensuales, no índices CPI.
    // Catálogo contrastado con BLS/FRED; FF1101 es pollo, FD3101 es cerdo.
    const catalog = {
        APU0000703112: { species: 'res', category: 'Ground beef, 100% beef', unit: 'USD/lb' },
        APU0000FF1101: { species: 'pollo', category: 'Chicken breast, boneless', unit: 'USD/lb' },
        APU0000708111: { species: 'huevo', category: 'Eggs, Grade A, large', unit: 'USD/dozen' },
        APU0000FD3101: { species: 'cerdo', category: 'All pork chops', unit: 'USD/lb' },
    };
    const seriesIds = Object.keys(catalog);
    const year = new Date().getFullYear();
    const response = await request('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesid: seriesIds, startyear: String(year - 1), endyear: String(year) }),
    });
    const prices = {};
    for (const series of response?.Results?.series || []) {
        const item = catalog[series.seriesID];
        if (!item) continue;
        const latest = (series.data || []).filter(point => /^M(?:0[1-9]|1[0-2])$/.test(point.period)
            && /^\d{4}$/.test(String(point.year)) && String(point.value).trim() !== '' && Number(point.value) > 0
            && Number.isFinite(Number(point.value)) && `${point.year}-${point.period.slice(1)}` <= new Date().toISOString().slice(0,7))
            .sort((a,b) => `${b.year}-${b.period}`.localeCompare(`${a.year}-${a.period}`))[0];
        if (latest) prices[item.species] = {
            value: Number(latest.value), period: `${latest.year}-${latest.period.slice(1)}`,
            unit: item.unit, category: item.category, basis: 'monthly retail average',
            series_id: series.seriesID, source_url: `https://data.bls.gov/timeseries/${series.seriesID}`,
        };
    }
    if (!Object.keys(prices).length) throw new Error('BLS no devolvió precios minoristas mensuales utilizables');
    return {
        source_id: 'bls_us_retail', source_name: 'U.S. Bureau of Labor Statistics — Average Price Data',
        source_url: 'https://www.bls.gov/data/', data_type: 'observed_monthly', is_forecast: false,
        retrieved_at: new Date().toISOString(), data_vintage: Object.values(prices).map(item => item.period).sort().at(-1) || null, payload: { prices },
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



function amsLatestRow(rows, requiredFields) {
    return (Array.isArray(rows) ? rows : []).find(row =>
        requiredFields.every(field => nassNumber(row?.[field]) !== null)
    ) || null;
}

async function usdaAmsProteinSnapshot() {
    // Market News expone informes con nombres de sección, no una serie
    // homogénea. Consultamos los cortes nacionales explícitos y conservamos su
    // unidad original (USD/cwt): no se convierte a kg ni se mezcla con precios
    // de granja o de menudeo.
    const [porkResponse, beefResponse, swineResponse] = await Promise.all([
        requestJson('https://mpr.datamart.ams.usda.gov/services/v1.1/reports/2498/Cutout%20and%20Primal%20Values'),
        requestJson('https://mpr.datamart.ams.usda.gov/services/v1.1/reports/2453/Current%20Cutout%20Values'),
        requestJson('https://mpr.datamart.ams.usda.gov/services/v1.1/reports/2511'),
    ]);
    const pork = amsLatestRow(porkResponse?.results, ['pork_carcass']);
    const beef = amsLatestRow(beefResponse?.results, ['choice_600_900_current']);
    const swine = amsLatestRow(swineResponse?.results, ['barrows_head_count']);
    if (!pork && !beef && !swine) throw new Error('USDA AMS no devolvió observaciones pecuarias utilizables');
    const reportDate = pork?.report_date || beef?.report_date || swine?.report_date || null;
    return {
        source_id: 'usda_ams_lmpr', source_name: 'USDA AMS — Livestock Mandatory Price Reporting',
        source_url: 'https://mpr.datamart.ams.usda.gov/', data_type: 'official_daily_market_report', is_forecast: false,
        retrieved_at: new Date().toISOString(), data_vintage: reportDate,
        payload: {
            geography: 'United States', report_date: reportDate,
            negotiated_sales_usd_per_cwt: {
                pork_carcass: pork ? { value: nassNumber(pork.pork_carcass), report: pork.report_title } : null,
                beef_choice_600_900: beef ? { value: nassNumber(beef.choice_600_900_current), report: beef.report_title } : null,
            },
            slaughter: swine ? { barrows_and_gilts_head: nassNumber(swine.barrows_head_count), report: swine.report_title } : null,
            note: 'Valores de reportes nacionales de ventas negociadas; no equivalen a precio de productor, mayoreo mexicano ni precio al consumidor.',
        },
    };
}

async function faoFpmaMexicoFeedSnapshot() {
    // FPMA declara mercado, tipo de precio, moneda y unidad de medida. Se toma
    // una única serie mayorista identificada y se conserva ese contexto para no
    // tratarla como un precio nacional de alimento balanceado.
    const seriesResponse = await requestJson('https://fpma.fao.org/giews/v4/global/price_module/api/v1/FpmaSerieDomestic/?iso3_country_codes=MEX&limit=100');
    const series = (seriesResponse?.results || []).find(item =>
        item?.commodity_name === 'Maize (white, Sinaloa)'
        && item?.market_name === 'Culiacán'
        && item?.price_type === 'WHOLESALE'
        && Array.isArray(item?.periodicity) && item.periodicity.some(period => period.period === 'monthly')
    );
    if (!series?.uuid) throw new Error('FAO FPMA no devolvió la serie mayorista de maíz seleccionada');
    const priceResponse = await requestJson(`https://fpma.fao.org/giews/v4/global/price_module/api/v1/FpmaSeriePrice/?uuid__in=${encodeURIComponent(series.uuid)}&periodicity=monthly`);
    const latest = priceResponse?.results?.[0]?.datapoints?.find(point => Number.isFinite(Number(point?.price_value)));
    if (!latest) throw new Error('FAO FPMA no devolvió un precio mensual utilizable');
    return {
        source_id: 'fao_fpma_mexico_maize', source_name: 'FAO FPMA — Precio mayorista de maíz blanco',
        source_url: 'https://www.fao.org/giews/food-prices/', data_type: 'official_monthly_wholesale_price', is_forecast: false,
        retrieved_at: new Date().toISOString(), data_vintage: latest.date || null,
        payload: {
            geography: 'Culiacán, Sinaloa, México', commodity: series.commodity_name,
            market: series.market_name, price_type: series.price_type,
            value: Number(latest.price_value), currency: series.currency,
            unit: series.measure_unit_label, period: latest.date,
            price_value_dollar: Number.isFinite(Number(latest.price_value_dollar)) ? Number(latest.price_value_dollar) : null,
            note: 'Serie de mercado mayorista específica; sirve como contexto del maíz, no como cotización nacional de alimento balanceado.',
        },
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

async function statcanHogProductionSnapshot() {
    // Statistics Canada expone la tabla completa mediante WDS; el manifiesto
    // entrega el ZIP vigente y evita apuntar a un archivo fechado manualmente.
    const table = '32100126';
    const manifestResponse = await fetch(`https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/${table}/en`, {
        headers: { Accept: 'application/json', 'User-Agent': 'VALLNews-Protein-Research/1.0' },
        signal: AbortSignal.timeout(20_000),
    });
    if (!manifestResponse.ok) throw new Error(`Statistics Canada HTTP ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    if (!manifest?.object) throw new Error('Statistics Canada no devolvió el archivo de producción porcina');
    const archiveResponse = await fetch(manifest.object, { signal: AbortSignal.timeout(30_000) });
    if (!archiveResponse.ok) throw new Error(`Archivo Statistics Canada HTTP ${archiveResponse.status}`);
    const archive = await JSZip.loadAsync(Buffer.from(await archiveResponse.arrayBuffer()));
    const filename = Object.keys(archive.files).find(name => new RegExp(`^${table}\\.csv$`, 'i').test(name));
    if (!filename) throw new Error('No se encontró la tabla canadiense de producción pecuaria');
    const lines = (await archive.file(filename).async('string')).split(/\r?\n/).filter(Boolean);
    const header = parseCsvRow(lines.shift());
    const position = Object.fromEntries(header.map((name, index) => [name, index]));
    const rows = lines.map(parseCsvRow).filter(row =>
        row[position.GEO] === 'Canada'
        && row[position.Livestock] === 'Hogs'
        && row[position['Livestock estimates']] === 'Estimated meat production'
        && row[position.UOM] === 'Tonnes'
    ).map(row => ({
        period: row[position.REF_DATE], value: Number(row[position.VALUE]), unit: row[position.UOM],
    })).filter(row => Number.isFinite(row.value)).sort((a, b) => String(a.period).localeCompare(String(b.period)));
    const latest = rows.at(-1);
    if (!latest) throw new Error('Statistics Canada no publicó una observación porcina utilizable');
    return {
        source_id: 'statcan_hog_production', source_name: 'Statistics Canada — Hogs, sheep and lambs, farm and meat production',
        source_url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3210012601', data_type: 'official_annual_production', is_forecast: false,
        retrieved_at: new Date().toISOString(), data_vintage: latest.period,
        payload: { geography: 'Canada', annual_production: { hogs: latest }, table: '32-10-0126-01' },
    };
}

const SOURCE_CATALOG = [
    { source_id: 'usda_nass_quick_stats', source_name: 'USDA NASS — Quick Stats', source_url: 'https://data.nass.usda.gov/developer/', cadence: 'quarterly_or_annual', access: 'API key configurada; inventarios nacionales de bovino y cerdo' },
    { source_id: 'eurostat_pigmeat_eu27', source_name: 'Eurostat — Pigmeat production', source_url: 'https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started', cadence: 'monthly', access: 'API pública; producción de cerdo UE-27' },
    { source_id: 'ibge_sidra_slaughter', source_name: 'IBGE SIDRA — Pesquisa Trimestral do Abate', source_url: 'https://sidra.ibge.gov.br/', cadence: 'quarterly', access: 'API pública; sacrificio brasileño por especie' },
    { source_id: 'statcan_hog_production', source_name: 'Statistics Canada — Hogs, sheep and lambs, farm and meat production', source_url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3210012601', cadence: 'annual', access: 'API pública WDS; producción canadiense de carne de cerdo' },
    { source_id: 'usda_ams_lmpr', source_name: 'USDA AMS — Livestock Mandatory Price Reporting', source_url: 'https://mpr.datamart.ams.usda.gov/', cadence: 'daily', access: 'API pública; corte nacional de ventas negociadas y sacrificio' },
    { source_id: 'fao_fpma_mexico_maize', source_name: 'FAO FPMA — Precio mayorista de maíz blanco', source_url: 'https://www.fao.org/giews/food-prices/', cadence: 'monthly', access: 'API pública; Culiacán, Sinaloa, MXN/kg' },
    { source_id: 'usda_ers_livestock_trade', source_name: 'USDA ERS — Livestock and Meat International Trade Data', source_url: 'https://www.ers.usda.gov/data-products/livestock-and-meat-international-trade-data/', cadence: 'monthly', access: 'CSV público; comercio de carne, ganado, aves y huevo por socio' },
    { source_id: 'oecd_sdmx_agricultural_outlook', source_name: 'OECD — SDMX Agricultural Outlook', source_url: 'https://sdmx.oecd.org/public/rest', cadence: 'annual', access: 'API SDMX pública; histórico y proyecciones deben identificarse como tales' },
    { source_id: 'usda_fas_psd', source_name: 'USDA FAS — Production, Supply and Distribution', source_url: 'https://apps.fas.usda.gov/psdonline/', cadence: 'monthly_or_biannual', access: 'API key requerida para la API moderna' },
    { source_id: 'fao_faostat_trade', source_name: 'FAOSTAT — Detailed Trade Matrix', source_url: 'https://data.fao.org/catalog/dataset/955a7b61-ce56-4a04-adf5-61a3012eec84', cadence: 'annual', access: 'API y descarga pública' },
    { source_id: 'fao_fishstat', source_name: 'FAO FishStat', source_url: 'https://www.fao.org/statistics/data-collection/fishery-and-aquaculture/en', cadence: 'annual', access: 'descarga pública' },
    { source_id: 'un_comtrade', source_name: 'UN Comtrade', source_url: 'https://comtradeplus.un.org/', cadence: 'monthly_or_annual', access: 'API con límites y clave según volumen' },
    { source_id: 'world_bank_pink_sheet', source_name: 'World Bank — Pink Sheet', source_url: 'https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/world-bank-commodities-price-data-the-pink-sheet', cadence: 'monthly', access: 'descarga pública' },
];

async function gatherProteinEvidence() {
    // WAHIS no ofrece una API pública estable para esta consulta; sus alertas
    // se incorporan por extracción semanal validada, no por un endpoint roto.
    const tasks = [
        faoGlobalSnapshot, worldBankLivestockSnapshot, blsRetailSnapshot,
        inegiRetailSnapshot, usdaNassLivestockSnapshot, eurostatPigmeatSnapshot,
        ibgeSlaughterSnapshot, statcanHogProductionSnapshot, usdaAmsProteinSnapshot,
        faoFpmaMexicoFeedSnapshot,
    ];
    const settled = await Promise.allSettled(tasks.map(task => Promise.resolve().then(task)));
    const snapshots = settled.filter(item => item.status === 'fulfilled').map(item => item.value);
    const failures = settled.filter(item => item.status === 'rejected').map(item => item.reason?.message || 'Fuente no disponible');
    return { snapshots, failures, source_catalog: SOURCE_CATALOG, collected_at: new Date().toISOString() };
}

module.exports = {
    blsRetailSnapshot,
    gatherProteinEvidence, faoGlobalSnapshot, usdaNassLivestockSnapshot,
    eurostatPigmeatSnapshot, ibgeSlaughterSnapshot, statcanHogProductionSnapshot,
    usdaAmsProteinSnapshot, faoFpmaMexicoFeedSnapshot, SOURCE_CATALOG,
};
