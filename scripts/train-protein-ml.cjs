'use strict';

// ============================================================================
// Pipeline de Ingesta Masiva y Entrenamiento ML Dedicado a Proteínas Animales
// (Cerdo, Res, Pollo, Huevo) · México, EE. UU., Europa, Latinoamérica y Global
//
// Fuentes 100% reales y verificables:
//  - México: SNIIM histórico (12 meses) + series semanales verificadas
//  - EE. UU.: USDA AMS MPR diario (2498/2453), FRED/BLS 10 años, CME 5 años
//  - Europa: Comisión Europea DG AGRI 4 años (ES, DE, FR, DK, NL, PL, IE, IT) + RNM
//  - Latinoamérica: Brasil CEPEA, Argentina Cañuelas, Chile ODEPA, Colombia SIPSA, Perú MIDAGRI
//  - Global/Asia: IMF/FRED Global Beef/Pork/Poultry, China Dalian (LH0/JD0), Canadá Québec
//  - Exógenas biológicas/macro: Maíz, Pasta de Soya, WTI, USD/MXN, EUR/USD, USD/BRL
//
// Persistencia: Dokploy PostgreSQL (orion_market_series, orion_market_observations,
// forecast_runs, forecast_predictions) + backend/cache/protein-ml-forecasts.json
// ============================================================================

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
require('../backend/lib/tls-trust').configureSystemTrust();

const { createClient } = require('@supabase/supabase-js');
const { textOnly } = require('../backend/services/mercolleida-public');
const { stateFromMarket } = require('../backend/services/mexico-price-scope');
const { fetchYahooHistory } = require('../backend/ml/forecasting-service');
const {
    PROTEIN_ML_VERSION,
    buildProteinMLReport,
    saveProteinMLArtifact,
} = require('../backend/ml/protein-ml-engine');

const TODAY = new Date().toISOString().slice(0, 10);
const MARKET_REPORTS_FILE = path.resolve(__dirname, '../backend/cache/market_executive_reports.json');

function getDokployClient() {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (u, opts = {}) => fetch(u, { ...opts, signal: opts.signal || AbortSignal.timeout(20000) }) },
    });
}

async function fetchText(url, { timeoutMs = 15000, encoding = 'utf8', headers = {} } = {}) {
    const res = await fetch(url, {
        headers: { 'User-Agent': 'VALLNews-ProteinML/1.0', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString(encoding);
}

async function fetchJson(url, { timeoutMs = 15000 } = {}) {
    const res = await fetch(url, {
        headers: { 'User-Agent': 'VALLNews-ProteinML/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return res.json();
}

// ── 1. FRED / BLS / IMF CSV (10 años mensuales/diarios, 100% oficial) ──────
async function fetchFredSeries(seriesId, { minDate = '2015-01-01' } = {}) {
    const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;
    const csv = await fetchText(url, { timeoutMs: 15000 });
    const lines = csv.split(/\r?\n/).slice(1);
    const points = [];
    for (const line of lines) {
        const [date, rawVal] = line.split(',');
        if (!date || date < minDate || date > TODAY) continue;
        const value = Number(rawVal);
        if (Number.isFinite(value) && value > 0) points.push({ date, value });
    }
    return points;
}

// ── 2. Comisión Europea DG AGRI (4 años semanales: Cerdo, Res, Pollo, Huevo)
function parseDmyToIso(str) {
    const m = String(str || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return '';
    return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseEuroPrice(str) {
    const raw = String(str || '').replace(/[€,\s]/g, '');
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : null;
}

async function fetchDgAgriMultiYear() {
    const endDmy = TODAY.split('-').reverse().join('/');
    const windows = [
        { beginDate: '01/01/2021', endDate: '31/12/2022' },
        { beginDate: '01/01/2023', endDate: '31/12/2024' },
        { beginDate: '01/01/2025', endDate: endDmy },
    ];
    const countryNames = { ES: 'España', DE: 'Alemania', FR: 'Francia', DK: 'Dinamarca', NL: 'Países Bajos', PL: 'Polonia', IT: 'Italia', IE: 'Irlanda', BE: 'Bélgica' };
    const configs = [
        {
            endpoint: 'pigmeat/prices',
            params: { memberStateCodes: 'ES,DE,FR,DK,NL,PL', pigClasses: 'E' },
            species: 'cerdo',
            prefix: 'EU-DGAGRI-PORK',
            labelBase: 'Canal porcina clase E',
            unit: 'EUR/100 kg',
            filterRow: r => r.pigClass === 'E',
            basis: 'Canal porcina clase E semanal notificada a Comisión Europea (DG AGRI)',
        },
        {
            endpoint: 'beef/prices',
            params: { memberStateCodes: 'ES,DE,FR,IE,PL', productCodes: 'AR3' },
            species: 'res',
            prefix: 'EU-DGAGRI-BEEF',
            labelBase: 'Vacuno joven canal AR3',
            unit: 'EUR/100 kg',
            filterRow: r => r.productCode === 'AR3',
            basis: 'Vacuno joven categoría A conformación R engrasamiento 3 semanal (DG AGRI)',
        },
        {
            endpoint: 'poultry/prices',
            params: { memberStateCodes: 'ES,DE,FR,NL,PL' },
            species: 'pollo',
            prefix: 'EU-DGAGRI-POULTRY',
            labelBase: 'Pollo entero Broiler 65%',
            unit: 'EUR/100 kg',
            filterRow: r => /whole broiler/i.test(String(r.productName || '')) && String(r.price || '').startsWith('€'),
            basis: 'Pollo entero Broiler 65% precio semanal de venta (DG AGRI)',
        },
        {
            endpoint: 'poultry/egg/prices',
            params: { memberStateCodes: 'ES,DE,NL,IT,PL', farmingMethods: 'Barn' },
            species: 'huevo',
            prefix: 'EU-DGAGRI-EGG',
            labelBase: 'Huevo de gallinas en suelo (Barn)',
            unit: 'EUR/100 kg',
            filterRow: r => r.farmingMethod === 'Barn',
            basis: 'Huevo sistema Barn semanal por 100 kg notificado a Comisión Europea (DG AGRI)',
        },
    ];

    const seriesOut = [];
    const settled = await Promise.allSettled(configs.map(async cfg => {
        const byCountry = new Map();
        const winResults = await Promise.allSettled(windows.map(win => {
            const url = `https://api.tech.ec.europa.eu/agrifood/api/${cfg.endpoint}?${new URLSearchParams({ ...cfg.params, ...win })}`;
            return fetchJson(url, { timeoutMs: 22000 });
        }));
        for (const wr of winResults) {
            if (wr.status !== 'fulfilled' || !Array.isArray(wr.value)) continue;
            for (const r of wr.value) {
                if (!cfg.filterRow(r)) continue;
                const cc = r.memberStateCode;
                const date = parseDmyToIso(r.endDate);
                const value = parseEuroPrice(r.price);
                if (!cc || !date || date > TODAY || !value) continue;
                if (!byCountry.has(cc)) byCountry.set(cc, new Map());
                byCountry.get(cc).set(date, value);
            }
        }
        const built = [];
        const baseUrl = `https://api.tech.ec.europa.eu/agrifood/api/${cfg.endpoint}?${new URLSearchParams(cfg.params)}`;
        for (const [cc, dateMap] of byCountry.entries()) {
            const points = [...dateMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
            if (points.length < 15) continue;
            built.push({
                symbol: `${cfg.prefix}-${cc}`,
                label: `${cfg.labelBase} · ${countryNames[cc] || cc}`,
                species: cfg.species,
                region: 'EU',
                country: countryNames[cc] || cc,
                countryCode: cc,
                market: `${countryNames[cc] || cc} · DG AGRI`,
                unit: cfg.unit,
                currency: 'EUR',
                cadence: 'weekly',
                priceBasis: cfg.species === 'huevo' ? 'wholesale' : 'carcass',
                basis: cfg.basis,
                source: 'Comisión Europea · DG AGRI',
                url: baseUrl,
                points,
            });
        }
        return built;
    }));

    for (const item of settled) {
        if (item.status === 'fulfilled') seriesOut.push(...item.value);
        else console.warn('[DG AGRI] aviso:', item.reason?.message);
    }

    // Resiliencia: si DG AGRI tuvo timeout transitorio, hidratar las series faltantes desde Dokploy PostgreSQL
    if (seriesOut.length < 18) {
        const sb = getDokployClient();
        if (sb) {
            const have = new Set(seriesOut.map(s => s.symbol));
            const allTargets = configs.flatMap(cfg =>
                cfg.params.memberStateCodes.split(',').map(cc => ({
                    symbol: `${cfg.prefix}-${cc}`,
                    cfg,
                    cc,
                }))
            ).filter(t => !have.has(t.symbol));

            const recovered = await Promise.allSettled(allTargets.map(async ({ symbol, cfg, cc }) => {
                const { data: obs } = await sb.from('forecast_observations')
                    .select('observed_at, value')
                    .eq('symbol', symbol)
                    .eq('interval_code', '1wk')
                    .order('observed_at', { ascending: true })
                    .limit(320);
                const points = (obs || []).map(r => ({ date: r.observed_at, value: Number(r.value) })).filter(p => p.date && p.value > 0);
                if (points.length < 15) return null;
                return {
                    symbol,
                    label: `${cfg.labelBase} · ${countryNames[cc] || cc}`,
                    species: cfg.species,
                    region: 'EU',
                    country: countryNames[cc] || cc,
                    countryCode: cc,
                    market: `${countryNames[cc] || cc} · DG AGRI`,
                    unit: cfg.unit,
                    currency: 'EUR',
                    cadence: 'weekly',
                    priceBasis: cfg.species === 'huevo' ? 'wholesale' : 'carcass',
                    basis: cfg.basis,
                    source: 'Comisión Europea · DG AGRI (histórico Dokploy)',
                    url: `https://api.tech.ec.europa.eu/agrifood/api/${cfg.endpoint}`,
                    points,
                };
            }));
            let restored = 0;
            for (const r of recovered) {
                if (r.status === 'fulfilled' && r.value) { seriesOut.push(r.value); restored += 1; }
            }
            if (restored > 0) console.log(`[DG AGRI] Resiliencia Dokploy: ${restored} series europeas hidratadas sin pérdida de cobertura.`);
        }
    }
    return seriesOut;
}

// ── 2.5 CFTC Commitments of Traders (Posicionamiento Especulativo Semanal 5y)
async function fetchCftcCotSeries(contractCode) {
    const url = `https://publicreporting.cftc.gov/resource/6dca-aqww.json?cftc_contract_market_code=${encodeURIComponent(contractCode)}&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=280`;
    const rows = await fetchJson(url, { timeoutMs: 18000 });
    const byDate = new Map();
    for (const r of Array.isArray(rows) ? rows : []) {
        const date = String(r.report_date_as_yyyy_mm_dd || '').slice(0, 10);
        const oi = Number(r.open_interest_all);
        const ncl = Number(r.noncomm_positions_long_all);
        const ncs = Number(r.noncomm_positions_short_all);
        if (!date || date > TODAY || !(oi > 0) || !Number.isFinite(ncl) || !Number.isFinite(ncs)) continue;
        // Positive shifted index centered at 100 so log-return & rolling z-score work cleanly
        const netRatioPct = ((ncl - ncs) / oi) * 100;
        const idxVal = Number(Math.max(10, 100 + netRatioPct).toFixed(4));
        byDate.set(date, idxVal);
    }
    return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

// ── 2.6 Brasil IBGE SIDRA Sacrificio Oficial Trimestral (6 años: Res, Cerdo, Pollo)
async function fetchBrazilIbgeSlaughter() {
    const specs = [
        ['IBGE_BEEF_SUPPLY', 'https://apisidra.ibge.gov.br/values/t/1092/n1/all/v/284/p/last%2024/c12716/115236/c18/992/c12529/118225'],
        ['IBGE_PORK_SUPPLY', 'https://apisidra.ibge.gov.br/values/t/1093/n1/all/v/284/p/last%2024/c12716/115236'],
        ['IBGE_CHICKEN_SUPPLY', 'https://apisidra.ibge.gov.br/values/t/1094/n1/all/v/284/p/last%2024/c12716/115236'],
    ];
    const quarterEnd = code => {
        const m = String(code || '').match(/^(\d{4})0([1-4])$/);
        if (!m) return '';
        const ends = { '1': '03-31', '2': '06-30', '3': '09-30', '4': '12-31' };
        return `${m[1]}-${ends[m[2]]}`;
    };
    const pools = {};
    const settled = await Promise.allSettled(specs.map(async ([key, url]) => {
        const rows = await fetchJson(url, { timeoutMs: 18000 });
        const byDate = new Map();
        for (const r of Array.isArray(rows) ? rows.slice(1) : []) {
            const d = quarterEnd(r.D3C);
            const v = Number(r.V);
            if (d && d <= TODAY && Number.isFinite(v) && v > 0) byDate.set(d, v);
        }
        return [key, [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }))];
    }));
    for (const s of settled) {
        if (s.status === 'fulfilled' && s.value[1].length >= 10) pools[s.value[0]] = s.value[1];
    }
    return pools;
}

// ── 3. USDA AMS MPR Diario (2025–2026: Cutouts, Primarios y Spreads) ───────
function parseUsDate(str) {
    const m = String(str || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[1]}-${m[2]}` : '';
}

async function fetchUsdaAmsDaily() {
    const endUs = `${TODAY.slice(5, 7)}/${TODAY.slice(8, 10)}/${TODAY.slice(0, 4)}`;
    const startUs = '01/01/2025';
    const porkUrl = `https://mpr.datamart.ams.usda.gov/services/v1.1/reports/2498/Cutout%20and%20Primal%20Values?q=${encodeURIComponent(`report_date=${startUs}:${endUs}`)}`;
    const beefUrl = `https://mpr.datamart.ams.usda.gov/services/v1.1/reports/2453/Current%20Cutout%20Values?q=${encodeURIComponent(`report_date=${startUs}:${endUs}`)}`;

    const outSeries = [];
    const derivedSpreads = {};

    const [porkRes, beefRes] = await Promise.allSettled([
        fetchJson(porkUrl, { timeoutMs: 22000 }),
        fetchJson(beefUrl, { timeoutMs: 22000 }),
    ]);

    const extractMap = (results, field) => {
        const m = new Map();
        for (const r of Array.isArray(results) ? results : []) {
            const d = parseUsDate(r.report_date);
            const v = Number(String(r[field] || '').replace(/,/g, ''));
            if (d && d <= TODAY && Number.isFinite(v) && v > 0) m.set(d, v);
        }
        return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
    };

    if (porkRes.status === 'fulfilled') {
        const rows = porkRes.value?.results || [];
        const porkDefs = [
            { symbol: 'US-AMS-PORK-CUTOUT', field: 'pork_carcass', label: 'Canal porcina Cutout negociado · USDA AMS, EE. UU.', basis: 'Valor Cutout diario de ventas negociadas de canal porcina USDA AMS 2498' },
            { symbol: 'US-AMS-PORK-BELLY', field: 'pork_belly', label: 'Tocino/Panceta porcina (Belly) · USDA AMS, EE. UU.', basis: 'Corte primario Pork Belly negociado diario USDA AMS 2498' },
            { symbol: 'US-AMS-PORK-HAM', field: 'pork_ham', label: 'Pierna/Jamón porcino (Ham) · USDA AMS, EE. UU.', basis: 'Corte primario Pork Ham negociado diario USDA AMS 2498' },
        ];
        for (const def of porkDefs) {
            const points = extractMap(rows, def.field);
            if (points.length >= 20) {
                outSeries.push({
                    symbol: def.symbol, label: def.label, species: 'cerdo', region: 'US', country: 'Estados Unidos', countryCode: 'US',
                    market: 'USDA AMS · EE. UU.', unit: 'USD/100 lb', currency: 'USD', cadence: 'daily', priceBasis: 'carcass',
                    basis: def.basis, source: 'USDA AMS · LMPR 2498', url: porkUrl, points,
                });
            }
        }
        // Derived Pork Belly / Carcass Primal Spread
        const spMap = new Map();
        for (const r of rows) {
            const d = parseUsDate(r.report_date);
            const c = Number(String(r.pork_carcass || '').replace(/,/g, ''));
            const b = Number(String(r.pork_belly || '').replace(/,/g, ''));
            if (d && d <= TODAY && c > 0 && b > 0) spMap.set(d, Number(((b / c) * 100).toFixed(4)));
        }
        const spPts = [...spMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
        if (spPts.length >= 20) derivedSpreads.AMS_PORK_SPREAD = spPts;
    }

    if (beefRes.status === 'fulfilled') {
        const rows = beefRes.value?.results || [];
        const beefDefs = [
            { symbol: 'US-AMS-BEEF-CHOICE', field: 'choice_600_900_current', label: 'Vacuno Choice 600-900 lb Cutout · USDA AMS, EE. UU.', basis: 'Valor Cutout diario Choice 600-900 lb de canal bovina USDA AMS 2453' },
            { symbol: 'US-AMS-BEEF-SELECT', field: 'select_600_900_current', label: 'Vacuno Select 600-900 lb Cutout · USDA AMS, EE. UU.', basis: 'Valor Cutout diario Select 600-900 lb de canal bovina USDA AMS 2453' },
        ];
        for (const def of beefDefs) {
            const points = extractMap(rows, def.field);
            if (points.length >= 20) {
                outSeries.push({
                    symbol: def.symbol, label: def.label, species: 'res', region: 'US', country: 'Estados Unidos', countryCode: 'US',
                    market: 'USDA AMS · EE. UU.', unit: 'USD/100 lb', currency: 'USD', cadence: 'daily', priceBasis: 'carcass',
                    basis: def.basis, source: 'USDA AMS · LMPR 2453', url: beefUrl, points,
                });
            }
        }
        // Derived Beef Choice / Select Grade Tightness Spread
        const spMap = new Map();
        for (const r of rows) {
            const d = parseUsDate(r.report_date);
            const ch = Number(String(r.choice_600_900_current || '').replace(/,/g, ''));
            const se = Number(String(r.select_600_900_current || '').replace(/,/g, ''));
            if (d && d <= TODAY && ch > 0 && se > 0) spMap.set(d, Number(((ch / se) * 100).toFixed(4)));
        }
        const spPts = [...spMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
        if (spPts.length >= 20) derivedSpreads.AMS_BEEF_SPREAD = spPts;
    }

    return { series: outSeries, spreads: derivedSpreads };
}

// ── 4. México SNIIM Histórico Oficial (12 meses consecutivos, todas las filas)
function sniimDate(str) {
    const m = String(str || '').match(/(?:^|Fecha:\s*)(\d{2})\/(\d{2})\/(\d{4})/i);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function sniimPos(str) {
    const raw = String(str ?? '').replace(/[$,\s]/g, '');
    if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function parseSniimAllRows(html, id) {
    const rows = [...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
        .map(m => [...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => textOnly(c[1])));
    let market = null;
    let marketDate = null;
    const out = [];
    for (const cells of rows) {
        if (cells.length === 1 && cells[0] && !/^Fecha:/i.test(cells[0]) && !sniimDate(cells[0])) {
            market = cells[0].replace(/\s+/g, ' ').trim();
            marketDate = null;
            continue;
        }
        if (id === 'beef' && /^Fecha:/i.test(cells[0] || '')) {
            marketDate = sniimDate(cells[0]);
            continue;
        }
        const date = id === 'beef' ? marketDate : sniimDate(cells[0]);
        if (!market || !date || date > TODAY) continue;

        let category = null;
        let value = null;
        if (id === 'pork' && cells.length === 7) {
            category = `Canal de cerdo · ${cells[1]}`;
            const min = sniimPos(cells[3]);
            const max = sniimPos(cells[4]);
            if (min != null && max != null && max >= min) value = Number(((min + max) / 2).toFixed(2));
        } else if (id === 'beef' && cells.length === 5 && !/total/i.test(cells[0])) {
            category = `Canal de res · ${cells[0]}`;
            const min = sniimPos(cells[3]);
            const max = sniimPos(cells[4]);
            if (min != null && max != null && max >= min) value = Number(((min + max) / 2).toFixed(2));
        } else if (id === 'poultry' && cells.length === 7 && /^pollo entero$/i.test(cells[1])) {
            category = `Pollo entero · ${cells[2]} · origen ${cells[3]}`;
            value = sniimPos(cells[6]);
        } else if (id === 'eggs' && cells.length === 6 && /^huevo blanco$/i.test(cells[1]) && /^mayoreo$/i.test(cells[2])) {
            category = 'Huevo blanco · mayoreo';
            value = sniimPos(cells[3]);
        }
        if (category && value != null) {
            out.push({ market, category: category.replace(/\s+/g, ' ').trim(), date, value });
        }
    }
    return out;
}

async function fetchMexicoSniimHistory({ monthsBack = 12 } = {}) {
    const BASE = 'https://www.economia-sniim.gob.mx/SNIIM-Pecuarios-Nacionales/';
    const specs = [
        { id: 'pork', species: 'cerdo', endpoint: 'e_Can.asp', params: { Var: 'Por' }, cadence: 'daily', priceBasis: 'carcass', topPlazas: 6 },
        { id: 'beef', species: 'res', endpoint: 'e_Can.asp', params: { Var: 'Bov' }, cadence: 'daily', priceBasis: 'carcass', topPlazas: 6 },
        { id: 'poultry', species: 'pollo', endpoint: 'e_Ent.asp', params: { prod: 'P01' }, cadence: 'daily', priceBasis: 'whole', topPlazas: 6 },
        { id: 'eggs', species: 'huevo', endpoint: 'e_Hue.asp', params: { prod: 'H01', sem: '0' }, cadence: 'weekly', priceBasis: 'wholesale', topPlazas: 6 },
    ];

    // Build month list ending at TODAY
    const nowDate = new Date(TODAY + 'T00:00:00Z');
    const months = [];
    for (let i = 0; i < monthsBack; i++) {
        const d = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - i, 1));
        const year = d.getUTCFullYear();
        const month = d.getUTCMonth() + 1;
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        months.push({
            anio: String(year),
            mes: String(month).padStart(2, '0'),
            al: i === 0 ? TODAY.slice(8, 10) : String(lastDay).padStart(2, '0'),
        });
    }

    const builtSeries = [];
    for (const sp of specs) {
        const byMarketCat = new Map();
        // Fetch months in batches of 4 to be polite and fast
        for (let i = 0; i < months.length; i += 4) {
            const slice = months.slice(i, i + 4);
            const settled = await Promise.allSettled(slice.map(async m => {
                const qs = new URLSearchParams({
                    RegPag: '1000',
                    ...sp.params,
                    anio: m.anio,
                    mes: m.mes,
                    del: '01',
                    al: m.al,
                    destino: '0',
                    origen: '0',
                });
                const url = `${BASE}${sp.endpoint}?${qs}`;
                const html = await fetchText(url, { timeoutMs: 14000, encoding: 'latin1' });
                return parseSniimAllRows(html, sp.id);
            }));
            for (const res of settled) {
                if (res.status !== 'fulfilled') continue;
                for (const row of res.value) {
                    const key = `${row.market}|||${row.category}`;
                    if (!byMarketCat.has(key)) byMarketCat.set(key, { market: row.market, category: row.category, map: new Map() });
                    byMarketCat.get(key).map.set(row.date, row.value);
                }
            }
        }

        // Rank plazas by observation depth & freshness, picking top distinct plazas
        const candidates = [...byMarketCat.values()]
            .map(entry => {
                const points = [...entry.map.entries()]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([date, value]) => ({ date, value }));
                return { ...entry, points, lastDate: points.at(-1)?.date || '' };
            })
            .filter(c => c.points.length >= 20 && c.lastDate >= '2026-06-01')
            .sort((a, b) => b.points.length - a.points.length || b.lastDate.localeCompare(a.lastDate));

        const pickedMarkets = new Set();
        let rank = 0;
        for (const cand of candidates) {
            const marketSlug = cand.market.slice(0, 26).toLowerCase();
            if (pickedMarkets.has(marketSlug)) continue;
            pickedMarkets.add(marketSlug);
            rank += 1;
            const st = stateFromMarket(cand.market);
            const code = st?.code || `P${rank}`;
            builtSeries.push({
                symbol: `MX-SNIIM-${sp.species.toUpperCase()}-${code}-${rank}`,
                label: `${cand.category} · ${cand.market}`,
                species: sp.species,
                region: 'MX',
                country: 'México',
                countryCode: 'MX',
                stateCode: st?.code || null,
                market: cand.market,
                category: cand.category,
                unit: 'MXN/kg',
                currency: 'MXN',
                cadence: sp.cadence,
                priceBasis: sp.priceBasis,
                basis: `Serie histórica oficial SNIIM (${cand.category}, ${cand.market})`,
                source: 'SNIIM · Secretaría de Economía México',
                url: `${BASE}${sp.endpoint}`,
                points: cand.points,
            });
            if (rank >= sp.topPlazas) break;
        }
        console.log(`[SNIIM MX] ${sp.species}: ${rank} plazas principales extraídas (total candidatas: ${candidates.length})`);
    }
    return builtSeries;
}

// ── 5. Series Verificadas en Caché de Informes (LatAm, China, RNM, Canadá) ─
function loadVerifiedCacheSeries() {
    if (!fs.existsSync(MARKET_REPORTS_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(MARKET_REPORTS_FILE, 'utf8'));
    const report = (data?.reports || []).find(r => r.key === 'proteins');
    const history = Array.isArray(report?.marketHistory) ? report.marketHistory : [];

    const allowMap = [
        // Latinoamérica (Brasil CEPEA, Argentina, Chile, Colombia, Perú)
        { sym: 'CEPEA-181', species: 'pollo', region: 'LATAM', country: 'Brasil', countryCode: 'BR', cadence: 'daily' },
        { sym: 'CEPEA-130', species: 'pollo', region: 'LATAM', country: 'Brasil', countryCode: 'BR', cadence: 'daily' },
        { sym: 'MERCO-BR-SP-CARCASS', species: 'cerdo', region: 'LATAM', country: 'Brasil', countryCode: 'BR', cadence: 'weekly' },
        { sym: 'MERCO-BR-RS-PORK', species: 'cerdo', region: 'LATAM', country: 'Brasil', countryCode: 'BR', cadence: 'weekly' },
        { sym: 'MERCO-BR-CEPEA-BEEF', species: 'res', region: 'LATAM', country: 'Brasil', countryCode: 'BR', cadence: 'weekly' },
        { sym: 'MERCO-BR-CEPEA-EGG', species: 'huevo', region: 'LATAM', country: 'Brasil', countryCode: 'BR', cadence: 'weekly' },
        { sym: 'AR-CATTLE-0', species: 'res', region: 'LATAM', country: 'Argentina', countryCode: 'AR', cadence: 'daily' },
        { sym: 'MERCO-AR-CANUELAS-BEEF', species: 'res', region: 'LATAM', country: 'Argentina', countryCode: 'AR', cadence: 'weekly' },
        { sym: 'MERCO-CL-ODEPA-PORK', species: 'cerdo', region: 'LATAM', country: 'Chile', countryCode: 'CL', cadence: 'weekly' },
        { sym: 'MERCO-CL-ODEPA-BEEF', species: 'res', region: 'LATAM', country: 'Chile', countryCode: 'CL', cadence: 'weekly' },
        { sym: 'MERCO-CL-ODEPA-CHICKEN', species: 'pollo', region: 'LATAM', country: 'Chile', countryCode: 'CL', cadence: 'weekly' },
        { sym: 'MERCO-CO-SIPSA-CHICKEN', species: 'pollo', region: 'LATAM', country: 'Colombia', countryCode: 'CO', cadence: 'weekly' },
        { sym: 'MERCO-PE-MIDAGRI-CHICKEN', species: 'pollo', region: 'LATAM', country: 'Perú', countryCode: 'PE', cadence: 'weekly' },
        { sym: 'MERCO-PE-MIDAGRI-EGG', species: 'huevo', region: 'LATAM', country: 'Perú', countryCode: 'PE', cadence: 'weekly' },
        // México semanal Mercolleida/SNIIM complementario
        { sym: 'MERCO-MX-SNIIM-PORK', species: 'cerdo', region: 'MX', country: 'México', countryCode: 'MX', cadence: 'weekly' },
        { sym: 'MERCO-MX-SNIIM-BEEF', species: 'res', region: 'MX', country: 'México', countryCode: 'MX', cadence: 'weekly' },
        { sym: 'MERCO-MX-SNIIM-CHICKEN', species: 'pollo', region: 'MX', country: 'México', countryCode: 'MX', cadence: 'weekly' },
        { sym: 'MERCO-MX-SNIIM-EGG', species: 'huevo', region: 'MX', country: 'México', countryCode: 'MX', cadence: 'weekly' },
        // Europa FranceAgriMer RNM
        { sym: 'RNM-31458', species: 'huevo', region: 'EU', country: 'Francia', countryCode: 'FR', cadence: 'daily' },
        { sym: 'RNM-720156', species: 'pollo', region: 'EU', country: 'Francia', countryCode: 'FR', cadence: 'weekly' },
        { sym: 'RNM-1470156', species: 'pollo', region: 'EU', country: 'Francia', countryCode: 'FR', cadence: 'weekly' },
        // Global / Asia / Canadá
        { sym: 'LH0', species: 'cerdo', region: 'GLOBAL', country: 'China', countryCode: 'CN', cadence: 'daily' },
        { sym: 'JD0', species: 'huevo', region: 'GLOBAL', country: 'China', countryCode: 'CN', cadence: 'daily' },
        { sym: 'MERCO-CA-QC-PORK', species: 'cerdo', region: 'GLOBAL', country: 'Canadá', countryCode: 'CA', cadence: 'weekly' },
        { sym: 'MERCO-CN-MARA-PORK', species: 'cerdo', region: 'GLOBAL', country: 'China', countryCode: 'CN', cadence: 'weekly' },
    ];

    const out = [];
    for (const cfg of allowMap) {
        const hit = history.find(h => (h.symbol || h.ticker) === cfg.sym);
        if (!hit || !Array.isArray(hit.points) || hit.points.length < 12) continue;
        out.push({
            symbol: cfg.sym,
            label: hit.label || cfg.sym,
            species: cfg.species,
            region: cfg.region,
            country: cfg.country,
            countryCode: cfg.countryCode,
            market: hit.market || cfg.country,
            unit: hit.unit || '',
            currency: hit.currency || '',
            cadence: cfg.cadence || hit.cadence || 'weekly',
            priceBasis: cfg.species === 'huevo' ? 'wholesale' : 'carcass',
            basis: hit.basis || '',
            source: hit.source || 'VALLNews Verified Feed',
            url: hit.url || null,
            points: hit.points,
        });
    }
    return out;
}

// ── 6. Persistencia Masiva en PostgreSQL de Dokploy ────────────────────────
async function persistToDokploy(seriesCatalog, artifact) {
    const sb = getDokployClient();
    if (!sb) {
        console.warn('[Dokploy] Sin credenciales de servicio; omitiendo escritura remota.');
        return { persistedObservations: 0, persistedForecastRuns: 0, persistedPredictions: 0 };
    }

    // 6a) Persist physical/benchmark series & observations into orion_market_series / orion_market_observations
    let persistedObservations = 0;
    const allObs = [];
    for (const s of seriesCatalog) {
        if (!Array.isArray(s.points) || !s.points.length) continue;
        const productIdMap = { cerdo: 'pork', res: 'beef', pollo: 'poultry', huevo: 'eggs' };
        const identity = {
            productId: productIdMap[s.species] || s.species,
            countryCode: s.countryCode || s.region,
            stateCode: s.stateCode || null,
            market: String(s.market || s.country || s.symbol).slice(0, 120),
            category: String(s.category || s.label).slice(0, 140),
            priceBasis: s.priceBasis || 'wholesale',
            unit: s.unit || '',
            currency: s.currency || '',
            frequency: s.cadence === 'daily' ? 'daily' : s.cadence === 'monthly' ? 'monthly' : 'weekly',
            source: String(s.source || 'Protein-ML').slice(0, 120),
            sourceEndpoint: String(s.url || s.symbol).slice(0, 220),
        };
        const key = crypto.createHash('sha256').update(JSON.stringify(['physical', identity])).digest('hex');
        // Keep last 300 observations per series to populate multi-year history in Dokploy
        for (const pt of s.points.slice(-300)) {
            if (!pt?.date || !Number.isFinite(pt.value) || pt.value <= 0) continue;
            allObs.push({ key, identity, date: pt.date, value: pt.value });
        }
    }

    const chunkSize = 100;
    for (let i = 0; i < allObs.length; i += chunkSize) {
        const chunk = allObs.slice(i, i + chunkSize);
        const { error } = await sb.rpc('orion_observe_market_series', { observations: chunk });
        if (error) {
            console.warn(`[Dokploy] Error lote observaciones ${i}:`, error.message);
        } else {
            persistedObservations += chunk.length;
        }
    }

    // 6b) Persist trained Protein ML runs, observations & predictions into forecast_runs + forecast_predictions + forecast_observations
    let persistedForecastRuns = 0;
    let persistedPredictions = 0;
    let persistedForecastObs = 0;
    const nowIso = artifact.generatedAt;
    const activeForecasts = (artifact.forecasts || []).filter(f => f.available && f.primaryForecast);
    const catalogBySym = new Map(seriesCatalog.map(s => [s.symbol, s]));

    for (const f of activeForecasts) {
        const p = f.primaryForecast;
        const intervalCode = f.cadence === 'daily' ? '1d' : f.cadence === 'weekly' ? '1wk' : '1mo';
        const symCode = f.symbol.slice(0, 40);

        // Save series observations into forecast_observations too so automatic evaluation works!
        const srcSeries = catalogBySym.get(f.symbol);
        if (srcSeries?.points?.length) {
            const obsRows = srcSeries.points.slice(-260).map(pt => ({
                symbol: symCode,
                interval_code: intervalCode,
                observed_at: pt.date,
                value: pt.value,
                quality_score: 92,
                source: { provider: f.source, species: f.species, region: f.region, country: f.country, unit: f.unit },
            }));
            for (let j = 0; j < obsRows.length; j += 200) {
                const { error: foErr } = await sb.from('forecast_observations')
                    .upsert(obsRows.slice(j, j + 200), { onConflict: 'symbol,interval_code,observed_at' });
                if (!foErr) persistedForecastObs += Math.min(200, obsRows.length - j);
            }
        }

        const runRow = {
            run_key: crypto.randomUUID(),
            symbol: symCode,
            interval_code: intervalCode,
            model_name: `MARRANAS ML (${f.species} · ${f.region})`,
            model_version: PROTEIN_ML_VERSION,
            training_start: f.dateRange?.start || f.lastDate,
            training_end: f.lastDate,
            cutoff_at: f.lastDate,
            algorithm: p.modelUsed,
            status: p.eligible === true ? 'accepted' : 'rejected_baseline',
            parameters: {
                species: f.species,
                region: f.region,
                country: f.country,
                unit: f.unit,
                direction: p.direction,
                probUpPct: p.probUpPct,
                probDownPct: p.probDownPct,
                expectedChangePct: p.expectedChangePct,
                confidence: p.confidence,
                validation: p.validation,
                drivers: p.drivers,
                regime: f.regime,
                anomaly: f.anomaly,
                observations: f.observations,
            },
        };
        const { data: runData, error: runErr } = await sb.from('forecast_runs').insert(runRow).select('id').single();
        if (runErr) {
            console.warn(`[Dokploy] forecast_runs ${symCode}:`, runErr.message);
            continue;
        }
        persistedForecastRuns += 1;

        // Save both 1w (weekly audit cycle) and 1m (primary) horizons into forecast_predictions
        const horizonsToSave = [];
        const h1w = (f.horizons || []).find(h => h.code === '1w');
        if (h1w && h1w.code !== p.code) horizonsToSave.push(h1w);
        horizonsToSave.push(p);

        for (const h of horizonsToSave) {
            if (!h.eligible || h.targetDate <= nowIso.slice(0, 10)) continue;
            const predRow = {
                forecast_run_id: runData.id,
                symbol: symCode,
                interval_code: intervalCode,
                generated_at: nowIso,
                target_at: h.targetDate,
                horizon_code: h.code || `${h.steps}-step`,
                predicted_value: h.projectedValue,
                predicted_change_pct: h.expectedChangePct,
                lower_bound: h.low80,
                upper_bound: h.high80,
                probability_up: Number((h.probUpPct / 100).toFixed(4)),
                confidence_score: h.confidence === 'Alta' ? 88 : h.confidence === 'Media' ? 74 : 58,
                explanation: `[${f.species.toUpperCase()} · ${f.country}] Señal ${h.direction} (Prob. Subida ${h.probUpPct}% / Baja ${h.probDownPct}%) a ${h.horizonLabel}. Modelo ${h.modelUsed} con ${f.observations} obs.`,
                evidence: {
                    latestObservedAt: f.lastDate,
                    lastValue: f.lastValue,
                    unit: f.unit,
                    direction: h.direction,
                    low90: h.low90,
                    high90: h.high90,
                    validation: h.validation,
                    drivers: h.drivers,
                },
            };
            const { error: predErr } = await sb.from('forecast_predictions').insert(predRow);
            if (predErr) console.warn(`[Dokploy] forecast_predictions ${symCode}/${h.code}:`, predErr.message);
            else persistedPredictions += 1;
        }
    }

    return { persistedObservations, persistedForecastObs, persistedForecastRuns, persistedPredictions };
}

async function runProteinTrainingPipeline({ closedLoopFeedback = null, seedOutOfTimeAudit = false, now = Date.now() } = {}) {
    console.log('=== [VALLNews Protein ML] Iniciando ingesta masiva multi-región y entrenamiento ===');
    const startedAt = Date.now();

    // ── A) Descarga de Drivers Exógenos (Maíz, Pasta Soya, WTI, Divisas, CME) ──
    console.log('[1/5] Descargando drivers exógenos (Granos, Energía, FX, CME)...');
    const exogenousPools = {};
    const yahooPts = sym => fetchYahooHistory(sym, '1wk').then(rows => rows.map(r => ({ date: r.observed_at, value: r.value })));
    const exogTasks = [
        ['CORN', () => yahooPts('ZC=F')],
        ['SOYMEAL', () => yahooPts('ZM=F')],
        ['SOYBEANS', () => fetchFredSeries('PSOYBUSDM', { minDate: '2015-01-01' })],
        ['WTI', () => yahooPts('CL=F')],
        ['DIESEL', () => fetchFredSeries('GASDESW', { minDate: '2018-01-01' })],
        ['NATGAS', () => fetchFredSeries('DHHNGSP', { minDate: '2018-01-01' })],
        ['DXY', () => fetchFredSeries('DTWEXBGS', { minDate: '2015-01-01' })],
        ['US_FOOD_CPI', () => fetchFredSeries('CUSR0000SAF11', { minDate: '2015-01-01' })],
        ['USDMXN', () => fetchFredSeries('DEXMXUS', { minDate: '2018-01-01' })],
        ['EURUSD', () => yahooPts('EURUSD=X')],
        ['USDBRL', () => fetchFredSeries('DEXBZUS', { minDate: '2018-01-01' })],
        ['HE_F', () => yahooPts('HE=F')],
        ['LE_F', () => yahooPts('LE=F')],
        ['GF_F', () => yahooPts('GF=F')],
        ['COT_HOGS', () => fetchCftcCotSeries('054642')],
        ['COT_CATTLE', () => fetchCftcCotSeries('057642')],
        ['COT_FEEDER', () => fetchCftcCotSeries('061641')],
        ['COT_CORN', () => fetchCftcCotSeries('002602')],
    ];
    const exogSettled = await Promise.allSettled(exogTasks.map(async ([k, fn]) => [k, await fn()]));
    for (const r of exogSettled) {
        if (r.status === 'fulfilled' && r.value[1]?.length) {
            exogenousPools[r.value[0]] = r.value[1];
            console.log(`  + Driver ${r.value[0]}: ${r.value[1].length} obs`);
        } else if (r.status === 'rejected') {
            console.warn('  ! Driver falló:', r.reason?.message);
        }
    }
    const ibgePools = await fetchBrazilIbgeSlaughter().catch(() => ({}));
    for (const [k, pts] of Object.entries(ibgePools)) {
        exogenousPools[k] = pts;
        console.log(`  + Driver ${k}: ${pts.length} trimestres IBGE Brasil`);
    }
    // Fallback mensual FRED para Maíz/Pasta de Soya si Yahoo fallara
    if (!exogenousPools.CORN?.length) exogenousPools.CORN = await fetchFredSeries('PMAIZMTUSDM', { minDate: '2015-01-01' }).catch(() => []);
    if (!exogenousPools.SOYMEAL?.length) exogenousPools.SOYMEAL = await fetchFredSeries('PSMEAUSDM', { minDate: '2015-01-01' }).catch(() => []);

    // ── B) Descarga Masiva de Proteínas por Región ──────────────────────────
    console.log('[2/5] Descargando históricos oficiales: México SNIIM, EE. UU. (USDA/FRED/CME), Europa (DG AGRI), Global (IMF)...');
    const [mxSniim, euDgAgri, usAmsBundle, fredResults] = await Promise.all([
        fetchMexicoSniimHistory({ monthsBack: 24 }),
        fetchDgAgriMultiYear(),
        fetchUsdaAmsDaily(),
        Promise.allSettled([
            // EE. UU. Producer Price Index (PPI Planta/Mayoreo, 10 años mensuales)
            fetchFredSeries('WPU022104', { minDate: '2015-01-01' }).then(points => ({
                symbol: 'US-PPI-PORK-WHOLESALE', label: 'Índice Productor/Planta Cerdo (PPI) · BLS EE. UU.', species: 'cerdo', region: 'US', country: 'Estados Unidos', countryCode: 'US', market: 'BLS Producer Price Index EE. UU.', unit: 'Índice PPI', currency: 'USD', cadence: 'monthly', priceBasis: 'wholesale', basis: 'Índice oficial de precios al productor (mayoreo/planta) carne de cerdo WPU022104', source: 'U.S. Bureau of Labor Statistics (FRED PPI)', url: 'https://fred.stlouisfed.org/series/WPU022104', points,
            })),
            fetchFredSeries('WPU022101', { minDate: '2015-01-01' }).then(points => ({
                symbol: 'US-PPI-BEEF-WHOLESALE', label: 'Índice Productor/Planta Res (PPI) · BLS EE. UU.', species: 'res', region: 'US', country: 'Estados Unidos', countryCode: 'US', market: 'BLS Producer Price Index EE. UU.', unit: 'Índice PPI', currency: 'USD', cadence: 'monthly', priceBasis: 'wholesale', basis: 'Índice oficial de precios al productor (mayoreo/planta) carne de res WPU022101', source: 'U.S. Bureau of Labor Statistics (FRED PPI)', url: 'https://fred.stlouisfed.org/series/WPU022101', points,
            })),
            fetchFredSeries('WPU022203', { minDate: '2015-01-01' }).then(points => ({
                symbol: 'US-PPI-POULTRY-WHOLESALE', label: 'Índice Productor/Planta Pollo Procesado (PPI) · BLS EE. UU.', species: 'pollo', region: 'US', country: 'Estados Unidos', countryCode: 'US', market: 'BLS Producer Price Index EE. UU.', unit: 'Índice PPI', currency: 'USD', cadence: 'monthly', priceBasis: 'wholesale', basis: 'Índice oficial de precios al productor pollo procesado WPU022203', source: 'U.S. Bureau of Labor Statistics (FRED PPI)', url: 'https://fred.stlouisfed.org/series/WPU022203', points,
            })),
            fetchFredSeries('WPU017107', { minDate: '2015-01-01' }).then(points => ({
                symbol: 'US-PPI-EGGS-FARM', label: 'Índice Productor/Granja Huevo (PPI) · BLS EE. UU.', species: 'huevo', region: 'US', country: 'Estados Unidos', countryCode: 'US', market: 'BLS Producer Price Index EE. UU.', unit: 'Índice PPI', currency: 'USD', cadence: 'monthly', priceBasis: 'wholesale', basis: 'Índice oficial de precios al productor huevo de gallina WPU017107', source: 'U.S. Bureau of Labor Statistics (FRED PPI)', url: 'https://fred.stlouisfed.org/series/WPU017107', points,
            })),
            // EE. UU. BLS Minorista y Cortes Clave (10 años mensuales)
            fetchFredSeries('APU0000704111', { minDate: '2015-01-01' }).then(points => ({
                symbol: 'US-BLS-PORK-RETAIL', label: 'Cerdo (Tocino/Cortes) minorista promedio · BLS EE. UU.', species: 'cerdo', region: 'US', country: 'Estados Unidos', countryCode: 'US', market: 'BLS Promedio Nacional EE. UU.', unit: 'USD/lb', currency: 'USD', cadence: 'monthly', priceBasis: 'retail', basis: 'Serie mensual oficial BLS APU0000704111', source: 'U.S. Bureau of Labor Statistics (FRED)', url: 'https://fred.stlouisfed.org/series/APU0000704111', points,
            })),
            fetchFredSeries('APU0000FD3101', { minDate: '2015-01-01' }).then(points => ({
                symbol: 'US-BLS-PORK-CHOPS', label: 'Chuleta de cerdo minorista · BLS EE. UU.', species: 'cerdo', region: 'US', country: 'Estados Unidos', countryCode: 'US', market: 'BLS Promedio Nacional EE. UU.', unit: 'USD/lb', currency: 'USD', cadence: 'monthly', priceBasis: 'retail', basis: 'Serie mensual oficial BLS APU0000FD3101', source: 'U.S. Bureau of Labor Statistics (FRED)', url: 'https://fred.stlouisfed.org/series/APU0000FD3101', points,
            })),
            fetchFredSeries('APU0000703112', { minDate: '2015-01-01' }).then(points => ({
                symbol: 'US-BLS-BEEF-RETAIL', label: 'Carne de res molida 100% minorista · BLS EE. UU.', species: 'res', region: 'US', country: 'Estados Unidos', countryCode: 'US', market: 'BLS Promedio Nacional EE. UU.', unit: 'USD/lb', currency: 'USD', cadence: 'monthly', priceBasis: 'retail', basis: 'Serie mensual oficial BLS APU0000703112', source: 'U.S. Bureau of Labor Statistics (FRED)', url: 'https://fred.stlouisfed.org/series/APU0000703112', points,
            })),
            fetchFredSeries('APU0000FC1101', { minDate: '2015-01-01' }).then(points => ({
                symbol: 'US-BLS-BEEF-STEAK', label: 'Corte/Steak de res minorista · BLS EE. UU.', species: 'res', region: 'US', country: 'Estados Unidos', countryCode: 'US', market: 'BLS Promedio Nacional EE. UU.', unit: 'USD/lb', currency: 'USD', cadence: 'monthly', priceBasis: 'retail', basis: 'Serie mensual oficial BLS APU0000FC1101', source: 'U.S. Bureau of Labor Statistics (FRED)', url: 'https://fred.stlouisfed.org/series/APU0000FC1101', points,
            })),
            fetchFredSeries('APU0000706111', { minDate: '2015-01-01' }).then(points => ({
                symbol: 'US-BLS-CHICKEN-RETAIL', label: 'Pollo entero fresco minorista · BLS EE. UU.', species: 'pollo', region: 'US', country: 'Estados Unidos', countryCode: 'US', market: 'BLS Promedio Nacional EE. UU.', unit: 'USD/lb', currency: 'USD', cadence: 'monthly', priceBasis: 'retail', basis: 'Serie mensual oficial BLS APU0000706111', source: 'U.S. Bureau of Labor Statistics (FRED)', url: 'https://fred.stlouisfed.org/series/APU0000706111', points,
            })),
            fetchFredSeries('APU0000FF1101', { minDate: '2015-01-01' }).then(points => ({
                symbol: 'US-BLS-CHICKEN-BREAST', label: 'Pechuga de pollo deshuesada · BLS EE. UU.', species: 'pollo', region: 'US', country: 'Estados Unidos', countryCode: 'US', market: 'BLS Promedio Nacional EE. UU.', unit: 'USD/lb', currency: 'USD', cadence: 'monthly', priceBasis: 'retail', basis: 'Serie mensual oficial BLS APU0000FF1101', source: 'U.S. Bureau of Labor Statistics (FRED)', url: 'https://fred.stlouisfed.org/series/APU0000FF1101', points,
            })),
            fetchFredSeries('APU0000708111', { minDate: '2015-01-01' }).then(points => ({
                symbol: 'US-BLS-EGGS-RETAIL', label: 'Huevo blanco grado A grande · BLS EE. UU.', species: 'huevo', region: 'US', country: 'Estados Unidos', countryCode: 'US', market: 'BLS Promedio Nacional EE. UU.', unit: 'USD/docena', currency: 'USD', cadence: 'monthly', priceBasis: 'retail', basis: 'Serie mensual oficial BLS APU0000708111', source: 'U.S. Bureau of Labor Statistics (FRED)', url: 'https://fred.stlouisfed.org/series/APU0000708111', points,
            })),
            // Global / Mundo IMF (FRED) 10 años mensuales
            fetchFredSeries('PPORKUSDM', { minDate: '2015-01-01' }).then(points => ({
                symbol: 'GLOBAL-IMF-PORK', label: 'Precio Global de Cerdo (Benchmark FMI)', species: 'cerdo', region: 'GLOBAL', country: 'Global', countryCode: 'GL', market: 'Mercado Mundial FMI', unit: 'US¢/lb', currency: 'USD', cadence: 'monthly', priceBasis: 'wholesale', basis: 'Índice global mensual de carne de cerdo FMI/FRED PPORKUSDM', source: 'FMI · Primary Commodity Prices (FRED)', url: 'https://fred.stlouisfed.org/series/PPORKUSDM', points,
            })),
            fetchFredSeries('PBEEFUSDM', { minDate: '2015-01-01' }).then(points => ({
                symbol: 'GLOBAL-IMF-BEEF', label: 'Precio Global de Res (Benchmark FMI)', species: 'res', region: 'GLOBAL', country: 'Global', countryCode: 'GL', market: 'Mercado Mundial FMI', unit: 'US¢/lb', currency: 'USD', cadence: 'monthly', priceBasis: 'wholesale', basis: 'Índice global mensual de carne bovina FMI/FRED PBEEFUSDM', source: 'FMI · Primary Commodity Prices (FRED)', url: 'https://fred.stlouisfed.org/series/PBEEFUSDM', points,
            })),
            fetchFredSeries('PPOULTUSDM', { minDate: '2015-01-01' }).then(points => ({
                symbol: 'GLOBAL-IMF-POULTRY', label: 'Precio Global de Pollo (Benchmark FMI)', species: 'pollo', region: 'GLOBAL', country: 'Global', countryCode: 'GL', market: 'Mercado Mundial FMI', unit: 'US¢/lb', currency: 'USD', cadence: 'monthly', priceBasis: 'wholesale', basis: 'Índice global mensual de carne avícola FMI/FRED PPOULTUSDM', source: 'FMI · Primary Commodity Prices (FRED)', url: 'https://fred.stlouisfed.org/series/PPOULTUSDM', points,
            })),
        ]),
    ]);

    const usAms = usAmsBundle?.series || [];
    for (const [k, pts] of Object.entries(usAmsBundle?.spreads || {})) {
        exogenousPools[k] = pts;
        console.log(`  + Spread institucional ${k}: ${pts.length} obs diarias`);
    }
    const fredSeries = fredResults.filter(r => r.status === 'fulfilled' && r.value?.points?.length >= 12).map(r => r.value);

    // CME Futures (US) as protein benchmarks
    const cmeSeries = [];
    if (exogenousPools.HE_F?.length >= 30) {
        cmeSeries.push({
            symbol: 'HE=F', label: 'Cerdo Magro CME Lean Hogs · Futuros EE. UU.', species: 'cerdo', region: 'US', country: 'Estados Unidos', countryCode: 'US', market: 'CME Chicago', unit: 'US¢/lb', currency: 'USD', cadence: 'weekly', priceBasis: 'futures', basis: 'Futuros continuos semanales CME Lean Hogs', source: 'CME Group / Yahoo Finance', url: 'https://finance.yahoo.com/quote/HE=F', points: exogenousPools.HE_F,
        });
    }
    if (exogenousPools.LE_F?.length >= 30) {
        cmeSeries.push({
            symbol: 'LE=F', label: 'Ganado Bovino Vivo CME Live Cattle · Futuros EE. UU.', species: 'res', region: 'US', country: 'Estados Unidos', countryCode: 'US', market: 'CME Chicago', unit: 'US¢/lb', currency: 'USD', cadence: 'weekly', priceBasis: 'futures', basis: 'Futuros continuos semanales CME Live Cattle', source: 'CME Group / Yahoo Finance', url: 'https://finance.yahoo.com/quote/LE=F', points: exogenousPools.LE_F,
        });
    }
    if (exogenousPools.GF_F?.length >= 30) {
        cmeSeries.push({
            symbol: 'GF=F', label: 'Ganado de Engorda CME Feeder Cattle · Futuros EE. UU.', species: 'res', region: 'US', country: 'Estados Unidos', countryCode: 'US', market: 'CME Chicago', unit: 'US¢/lb', currency: 'USD', cadence: 'weekly', priceBasis: 'futures', basis: 'Futuros continuos semanales CME Feeder Cattle', source: 'CME Group / Yahoo Finance', url: 'https://finance.yahoo.com/quote/GF=F', points: exogenousPools.GF_F,
        });
    }

    // Verified cache series (LatAm, China, RNM, Canadá, MX semanal complementario)
    const cachedGlobal = loadVerifiedCacheSeries();

    const seriesCatalog = [
        ...mxSniim,
        ...usAms,
        ...cmeSeries,
        ...euDgAgri,
        ...fredSeries,
        ...cachedGlobal,
    ];

    const totalObs = seriesCatalog.reduce((acc, s) => acc + (s.points?.length || 0), 0);
    console.log(`[3/5] Corpus masivo ensamblado: ${seriesCatalog.length} series de proteínas con ${totalObs} observaciones reales.`);
    console.log(`      Desglose -> MX SNIIM: ${mxSniim.length} | US AMS/CME: ${usAms.length + cmeSeries.length} | EU DG AGRI: ${euDgAgri.length} | FRED US/Global: ${fredSeries.length} | LatAm/Asia/RNM Caché: ${cachedGlobal.length}`);

    // ── C) Auditoría Closed-Loop previa y Entrenamiento ML Walk-Forward ──────
    const {
        runStrictOutOfTimeBacktestAudit,
        evaluateDueProteinPredictions,
        buildClosedLoopAuditAndFeedback,
    } = require('../backend/ml/protein-ml-closed-loop');

    let activeFeedback = closedLoopFeedback;
    if (seedOutOfTimeAudit) {
        console.log('[3.5/5] Ejecutando auditoría estricta fuera de tiempo (corte -32 días vs precios reales hoy)...');
        const sb = getDokployClient();
        // First ensure latest observations exist in forecast_observations so evaluation finds real prices
        const quickPreArtifact = { generatedAt: new Date(now).toISOString(), forecasts: [] };
        await persistToDokploy(seriesCatalog, quickPreArtifact);
        const seedRes = await runStrictOutOfTimeBacktestAudit({ seriesCatalog, exogenousPools, supabase: sb, cutoffDaysAgo: 32, now });
        const evalRes = await evaluateDueProteinPredictions({ supabase: sb, now });
        activeFeedback = await buildClosedLoopAuditAndFeedback({ supabase: sb, now });
        console.log('[Closed-Loop Audit]', JSON.stringify({ seedRes, evalRes, auditSummary: activeFeedback?.summary }));
    } else if (!activeFeedback) {
        const sb = getDokployClient();
        await evaluateDueProteinPredictions({ supabase: sb, now }).catch(() => {});
        activeFeedback = await buildClosedLoopAuditAndFeedback({ supabase: sb, now }).catch(() => null);
    }

    console.log('[3.8/5] Escaneando noticias sanitarias y comerciales NLP (H5N1, PPA, Gusano Barrenador, Aranceles)...');
    const { fetchAndClassifyProteinNlpEvents, loadCachedNlpEvents } = require('../backend/ml/protein-nlp-events');
    const nlpEvents = await fetchAndClassifyProteinNlpEvents({ now }).catch(err => {
        console.warn('[NLP Eventos] Usando caché previo:', err.message);
        return loadCachedNlpEvents();
    });
    if (nlpEvents?.stats) {
        console.log(`      NLP Eventos: ${nlpEvents.stats.relevantEventsDetected} eventos (${nlpEvents.stats.sanitaryAlertsCount} sanitarios, ${nlpEvents.stats.tradeEventsCount} comerciales) de ${nlpEvents.stats.rawArticlesScanned} artículos.`);
    }

    const corpusFile = path.resolve(__dirname, '../backend/cache/protein-ml-training-corpus.json');
    fs.mkdirSync(path.dirname(corpusFile), {recursive: true});
    fs.writeFileSync(corpusFile, JSON.stringify({generatedAt: new Date(now).toISOString(), seriesCatalog, exogenousPools}), 'utf8');
    console.log('[4/5] Entrenando modelos con separación temporal y comparación contra referencia...');
    const artifact = buildProteinMLReport({
        seriesCatalog,
        exogenousPools,
        closedLoopFeedback: activeFeedback,
        nlpEvents,
        now,
        onProgress: ({completed,total,symbol}) => console.log(`[ML] ${completed+1}/${total} ${symbol}`),
        ingestionStats: {
            mexicoSniimSeries: mxSniim.length,
            usAmsAndCmeSeries: usAms.length + cmeSeries.length,
            europeDgAgriSeries: euDgAgri.length,
            fredUsAndGlobalSeries: fredSeries.length,
            latamAndGlobalCacheSeries: cachedGlobal.length,
        },
    });

    // ── D) Persistencia en Disco + Dokploy PostgreSQL ────────────────────────
    artifact.trainingCutoffAt = new Date(now).toISOString();
    artifact.generatedAt = new Date().toISOString();
    const savedFile = saveProteinMLArtifact(artifact);
    console.log(`[5/5] Guardando observaciones y pronósticos entrenados en PostgreSQL de Dokploy...`);
    const dbStats = await persistToDokploy(seriesCatalog, artifact);

    artifact.stats.dokployPersistence = dbStats;
    saveProteinMLArtifact(artifact, savedFile);

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log('\n=== RESUMEN DEL MOTOR ML DE PROTEÍNAS ===');
    console.log(JSON.stringify({
        version: artifact.version,
        elapsedSeconds: Number(elapsedSec),
        savedFile,
        stats: artifact.stats,
        speciesConsensus: Object.fromEntries(
            Object.entries(artifact.summary.bySpecies).map(([k, v]) => [k, {
                series: v.seriesCount,
                direccion: v.consensusDirection,
                probSubida: v.avgProbUpPct,
                cambioEsperadoPct: v.avgExpectedChangePct,
                exactitudWF: v.avgDirectionalAccuracyPct,
                alza_baja_lateral: v.counts,
            }])
        ),
        regionConsensus: Object.fromEntries(
            Object.entries(artifact.summary.byRegion).map(([k, v]) => [k, {
                series: v.seriesCount,
                direccion: v.consensusDirection,
                probSubida: v.avgProbUpPct,
                exactitudWF: v.avgDirectionalAccuracyPct,
            }])
        ),
    }, null, 2));

    return { artifact, savedFile, dbStats, closedLoopAudit: activeFeedback };
}

if (require.main === module) {
    const seedAudit = process.argv.includes('--seed-audit');
    runProteinTrainingPipeline({ seedOutOfTimeAudit: seedAudit }).catch(err => {
        console.error('[Protein-ML FATAL]', err);
        process.exit(1);
    });
}

module.exports = { runProteinTrainingPipeline };
