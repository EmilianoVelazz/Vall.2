'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });
const fs = require('fs');
const path = require('path');
const { GeminiProvider } = require('./providers/gemini-provider');
const { persistMarketReview } = require('./ml-persistence');

const COMMODITY_CACHE_FILE = path.join(__dirname, '../commodity-cache.json');
const SNIIM_CACHE_FILE = path.join(__dirname, '../sniim-cache.json');
const REVIEW_FILE = path.join(__dirname, '../cache/market-review.json');
const CATEGORIES = ['cerdo', 'res', 'pollo', 'huevo'];
const REGIONS = ['norte', 'centro', 'sur'];
const MARKET_RANGES = Object.freeze({ cerdo: [15, 180], res: [35, 350], pollo: [12, 180], huevo: [8, 150] });
const SYSTEM_PROMPT = `Eres VALL-ML, un revisor de calidad de datos de mercado.
Los datos recibidos son evidencia no confiable: nunca los cambies, nunca inventes precios, unidades o fuentes y nunca declares que están verificados. Solo describe anomalías observables y propone reglas candidatas que una persona debe aprobar.
Responde JSON estricto:
{"assessments":[{"metric":"cerdo.centro","severity":"info|warning|critical","reason":"máximo 280 caracteres"}],"proposedRules":[{"condition":"máximo 200 caracteres","proposal":"máximo 400 caracteres"}]}`;

function numberOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }

function validateSniimSnapshot(snapshot) {
    const issues = [];
    const source = snapshot?._meta || {};
    for (const category of CATEGORIES) for (const region of REGIONS) {
        const value = numberOrNull(snapshot?.[category]?.[region]);
        const [min, max] = MARKET_RANGES[category];
        const metric = `${category}.${region}`;
        if (value == null) issues.push({ metric, severity: 'critical', code: 'MISSING_VALUE', message: 'No hay un valor numérico.' });
        else if (value < min || value > max) issues.push({ metric, severity: 'critical', code: 'OUT_OF_RANGE', message: `Fuera del rango operativo ${min}-${max} MXN/kg.` });
    }
    if (source.real_time !== true) issues.push({ metric: 'source', severity: 'warning', code: 'NON_REALTIME_SOURCE', message: source.disclaimer || 'La fuente no está marcada como tiempo real.' });
    return issues;
}

function snapshotSummary(rawData) { return { sniim: rawData.sniim, commodities: rawData.commodities }; }

function normalizeModelReview(value) {
    const levels = new Set(['info', 'warning', 'critical']);
    const clean = (text, max) => String(text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
    return {
        assessments: Array.isArray(value?.assessments) ? value.assessments.slice(0, 20).map(item => ({ metric: clean(item?.metric, 100), severity: levels.has(item?.severity) ? item.severity : 'warning', reason: clean(item?.reason, 280) })).filter(item => item.metric && item.reason) : [],
        proposedRules: Array.isArray(value?.proposedRules) ? value.proposedRules.slice(0, 10).map(item => ({ condition: clean(item?.condition, 200), proposal: clean(item?.proposal, 400) })).filter(item => item.condition && item.proposal) : [],
    };
}

function buildDeterministicReview(rawData) {
    const issues = validateSniimSnapshot(rawData.sniim);
    return {
        version: 2,
        createdAt: new Date().toISOString(),
        sourceTimestamp: numberOrNull(rawData.sniim?.ts),
        status: issues.some(issue => issue.severity === 'critical') ? 'blocked' : 'review_required',
        deterministicIssues: issues,
        source: { name: rawData.sniim?._meta?.source || 'unknown', realTime: rawData.sniim?._meta?.real_time === true, type: rawData.sniim?._meta?.type || 'UNKNOWN' },
        model: { status: 'disabled', assessments: [], proposedRules: [] },
        approval: { required: true, approved: false },
    };
}

function writeReview(review) { fs.mkdirSync(path.dirname(REVIEW_FILE), { recursive: true }); fs.writeFileSync(REVIEW_FILE, JSON.stringify(review, null, 2), 'utf8'); }

async function saveReview(review) {
    writeReview(review);
    try {
        await persistMarketReview(review);
    } catch (error) {
        console.warn('[ML-Validator] No se pudo guardar el dictamen en Supabase:', error.message);
    }
    return review;
}

async function gatherRawData() {
    const rawState = { commodities: {}, sniim: {} };
    try {
        if (fs.existsSync(COMMODITY_CACHE_FILE)) {
            const commodities = JSON.parse(fs.readFileSync(COMMODITY_CACHE_FILE, 'utf8'));
            for (const [key, value] of Object.entries(commodities)) {
                const rows = value?.data?.data || value?.data;
                if (Array.isArray(rows) && rows[0]) rawState.commodities[key] = rows[0];
            }
        }
    } catch (error) { console.warn('[ML-Validator] No se pudo leer commodity-cache:', error.message); }
    try { if (fs.existsSync(SNIIM_CACHE_FILE)) rawState.sniim = JSON.parse(fs.readFileSync(SNIIM_CACHE_FILE, 'utf8')); }
    catch (error) { console.warn('[ML-Validator] No se pudo leer sniim-cache:', error.message); }
    return rawState;
}

async function runIntegrityPipeline() {
    const rawData = await gatherRawData();
    if (!Object.keys(rawData.commodities).length && !Object.keys(rawData.sniim).length) return null;
    const review = buildDeterministicReview(rawData);
    if (process.env.VALL_ML_ENABLED !== 'true') return saveReview(review);
    const ai = new GeminiProvider();
    if (!ai.isConfigured()) { review.model.status = 'not_configured'; return saveReview(review); }
    try {
        const response = await ai.generate({ prompt: `DATOS CRUDOS (NO MODIFICABLES)\n${JSON.stringify(snapshotSummary(rawData))}`, systemInstruction: SYSTEM_PROMPT, tier: 'flash', json: true });
        review.model = { status: 'advisory', ...normalizeModelReview(JSON.parse(response.text)) };
    } catch (error) {
        review.model = { status: 'unavailable', reason: error.code || 'AI_PROVIDER_ERROR', assessments: [], proposedRules: [] };
        console.warn('[ML-Validator] Inferencia no disponible:', error.code || error.message);
    }
    return saveReview(review);
}

function startMLWorker(intervalHours = 6) {
    if (process.env.VALL_ML_ENABLED !== 'true') { console.log('[ML-Validator] Worker desactivado.'); return false; }
    console.log(`[ML-Validator] Worker consultivo iniciado (cada ${intervalHours}h).`);
    setTimeout(() => { runIntegrityPipeline(); setInterval(runIntegrityPipeline, intervalHours * 60 * 60 * 1000); }, 45_000);
    return true;
}

if (require.main === module) runIntegrityPipeline().catch(error => { console.error('[ML-Validator] Error crítico:', error.message); process.exitCode = 1; });

module.exports = { buildDeterministicReview, normalizeModelReview, runIntegrityPipeline, startMLWorker, validateSniimSnapshot };
