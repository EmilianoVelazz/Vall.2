'use strict';

// Proyecto Loopus: motor de entrenamiento e investigación asistida para mejorar
// la cobertura de datos y el raciocinio analítico tanto del chat (ORION) como
// de la creación de informes ejecutivos y de usuario.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), quiet: true });
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local'), quiet: true });

const { configureSystemTrust, trustedCertificates } = require('../lib/tls-trust');
configureSystemTrust();

const fs = require('fs');
const https = require('https');
const path = require('path');
const crypto = require('crypto');
const { GeminiProvider } = require('./providers/gemini-provider');
const { REJECT_UNAUTHORIZED } = require('../lib/http');
const { createTrainingRun, updateTrainingRunProgress, finishTrainingRun, persistRuleProposals, persistTrainingEvent } = require('./ml-persistence');
const { evaluateQueries } = require('./brain-worker');
const { runIntegrityPipeline } = require('./ml-unsupervised');
const { updateReasoningPlaybook } = require('./loopus-knowledge');

const DEFAULT_TRAINING_MINUTES = 60;
const DEFAULT_INTERVAL_SECONDS = 35;
const SUMMARY_FILE = path.join(__dirname, '../cache/loopus-training-summary.json');
const EVENTS_FILE = path.join(__dirname, '../cache/loopus-training-events.json');

// Currículum ampliado de 36 módulos que cruzan Finanzas, Mercados, México,
// razonamiento conversacional de ORION y síntesis de informes ejecutivos.
const TRAINING_CURRICULUM = [
    { topic: 'Macroeconomics & Monetary Policy Transmission', wikiEs: 'Política monetaria Banco de México inflación', wikiEn: 'Monetary policy inflation transmission', domain: 'both', collection: 'finance', reportKey: 'overview', audience: 'general' },
    { topic: 'Foreign Exchange USD/MXN & Import Hedging', wikiEs: 'Tipo de cambio peso mexicano dólar cobertura', wikiEn: 'Foreign exchange hedge currency risk', domain: 'both', collection: 'finance', reportKey: 'fx', audience: 'finance' },
    { topic: 'Sovereign Yield Curves CETES vs US Treasury', wikiEs: 'Curva de rendimiento CETES bonos gubernamentales', wikiEn: 'Yield curve United States Treasury security', domain: 'reports', collection: 'finance', reportKey: 'bonds', audience: 'finance' },
    { topic: 'Equity Markets BMV & North American Benchmarks', wikiEs: 'Bolsa Mexicana de Valores índice IPC valuación', wikiEn: 'Stock market index valuation volatility', domain: 'both', collection: 'finance', reportKey: 'equities', audience: 'general' },
    { topic: 'Financial News Qualification & Causal Attribution', wikiEs: 'Periodismo financiero riesgo regulatorio aranceles', wikiEn: 'Financial market impact event analysis', domain: 'reports', collection: 'finance', reportKey: 'news', audience: 'general' },
    { topic: 'Pork Production & Carcass vs Live Price Spreads', wikiEs: 'Porcicultura carne de cerdo canal rastro México', wikiEn: 'Pork production lean hogs carcass yield', domain: 'both', collection: 'markets', reportKey: 'proteins', audience: 'purchasing' },
    { topic: 'Poultry Farming, Broiler Distribution & Feed Conversion', wikiEs: 'Avicultura carne de pollo conversión alimenticia', wikiEn: 'Poultry farming broiler feed conversion ratio', domain: 'both', collection: 'markets', reportKey: 'proteins', audience: 'operations' },
    { topic: 'Egg Market Dynamics Wholesale vs Retail Presentations', wikiEs: 'Producción de huevo mercado mayorista México', wikiEn: 'Egg production agricultural marketing wholesale', domain: 'chat', collection: 'mexico', reportKey: 'mx_proteins', audience: 'commercial' },
    { topic: 'Beef Cattle Feeding, Slaughter & Export Flows', wikiEs: 'Ganadería bovina carne en canal exportación', wikiEn: 'Beef cattle feedlot meat packing industry', domain: 'both', collection: 'markets', reportKey: 'proteins', audience: 'purchasing' },
    { topic: 'Corn Futures CBOT vs Physical Basis in Mexico', wikiEs: 'Mercado de maíz futuros grano importación México', wikiEn: 'Corn futures contract basis commodity market', domain: 'both', collection: 'markets', reportKey: 'grains', audience: 'purchasing' },
    { topic: 'Soybean Meal & Oilseed Crushing Margins', wikiEs: 'Pasta de soya oleaginosas alimento balanceado', wikiEn: 'Soybean meal crush spread animal feed', domain: 'both', collection: 'markets', reportKey: 'grains', audience: 'operations' },
    { topic: 'Wheat Markets, Milling Quality & Global Supply', wikiEs: 'Trigo comercio internacional cereales', wikiEn: 'Wheat commodity market supply chain', domain: 'reports', collection: 'markets', reportKey: 'grains', audience: 'purchasing' },
    { topic: 'Crude Oil, Diesel, Natural Gas & Cold-Chain Logistics', wikiEs: 'Precio del petróleo gas natural diésel transporte', wikiEn: 'Energy market diesel fuel cold chain logistics', domain: 'both', collection: 'markets', reportKey: 'energy_metals', audience: 'operations' },
    { topic: 'African Swine Fever (ASF) & Biosecurity Trade Shocks', wikiEs: 'Peste porcina africana impacto comercial', wikiEn: 'African swine fever virus pork trade', domain: 'both', collection: 'markets', reportKey: 'market_news', audience: 'general' },
    { topic: 'Avian Influenza H5N1 & Poultry Supply Disruptions', wikiEs: 'Influenza aviar sanidad avícola producción', wikiEn: 'Avian influenza poultry supply shock', domain: 'both', collection: 'markets', reportKey: 'market_news', audience: 'operations' },
    { topic: 'USMCA / T-MEC Agricultural Trade & Tariff Rules', wikiEs: 'Tratado entre México Estados Unidos y Canadá agropecuario', wikiEn: 'United States-Mexico-Canada Agreement agriculture', domain: 'chat', collection: 'mexico', reportKey: 'mx_overview', audience: 'general' },
    { topic: 'Mexico Regional Livestock Production by State (SIAP)', wikiEs: 'Producción pecuaria en México estados Jalisco Sonora Puebla', wikiEn: 'Agriculture in Mexico livestock production', domain: 'reports', collection: 'mexico', reportKey: 'mx_production', audience: 'operations' },
    { topic: 'Mexico State Protein Price Dispersion (SNIIM & PROFECO)', wikiEs: 'Sistema Nacional de Información e Integración de Mercados precios', wikiEn: 'Food price dispersion wholesale retail Mexico', domain: 'chat', collection: 'mexico', reportKey: 'mx_proteins', audience: 'commercial' },
    { topic: 'Mexico Macroeconomic Structural Indicators & Demand', wikiEs: 'Economía de México consumo interno inflación alimentaria', wikiEn: 'Economy of Mexico domestic consumption', domain: 'reports', collection: 'mexico', reportKey: 'mx_overview', audience: 'general' },
    { topic: 'Mexico BMV Issuers & Currency Exposure', wikiEs: 'Empresas de consumo Bolsa Mexicana de Valores tipo de cambio', wikiEn: 'Mexican Stock Exchange corporate currency exposure', domain: 'reports', collection: 'mexico', reportKey: 'mx_bolsa', audience: 'finance' },
    { topic: 'El Niño & La Niña Agricultural Yield Impacts', wikiEs: 'El Niño La Niña sequía agricultura rendimiento agrícola', wikiEn: 'El Niño Southern Oscillation agriculture crop yield', domain: 'both', collection: 'markets', reportKey: 'grains', audience: 'purchasing' },
    { topic: 'Fertilizer Costs, Natural Gas & Crop Economics', wikiEs: 'Fertilizantes urea amoníaco costos agrícolas', wikiEn: 'Fertilizer price natural gas agricultural economics', domain: 'chat', collection: 'markets', reportKey: 'energy_metals', audience: 'purchasing' },
    { topic: 'Commercial Margin & Shrinkage Calculation in Meat Trading', wikiEs: 'Margen comercial merma rendimiento en canal comercialización', wikiEn: 'Gross margin shrinkage meat industry pricing', domain: 'chat', collection: 'markets', reportKey: 'proteins', audience: 'commercial' },
    { topic: 'Executive Committee Report Synthesis & Decision Framing', wikiEs: 'Informe ejecutivo toma de decisiones gobierno corporativo', wikiEn: 'Executive summary decision analysis risk management', domain: 'reports', collection: 'finance', reportKey: 'overview', audience: 'general' },
    { topic: 'Treasury & Working Capital Risk Framing in Reports', wikiEs: 'Tesorería capital de trabajo liquidez riesgo financiero', wikiEn: 'Working capital management treasury liquidity risk', domain: 'reports', collection: 'finance', reportKey: 'fx', audience: 'finance' },
    { topic: 'Procurement & Supply Continuity Report Framing', wikiEs: 'Gestión de compras cadena de suministro materias primas', wikiEn: 'Procurement supply chain risk agribusiness', domain: 'reports', collection: 'markets', reportKey: 'overview', audience: 'purchasing' },
    { topic: 'European Pork Benchmarks (Mercolleida & Eurostat)', wikiEs: 'Sector porcino en España Mercolleida exportación', wikiEn: 'Pig farming in Europe pork price benchmark', domain: 'both', collection: 'markets', reportKey: 'proteins', audience: 'commercial' },
    { topic: 'South American Protein Exports (Brazil IBGE & Argentina)', wikiEs: 'Industria cárnica en Brasil exportación proteína animal', wikiEn: 'Agriculture in Brazil beef poultry pork exports', domain: 'both', collection: 'markets', reportKey: 'proteins', audience: 'commercial' },
    { topic: 'North American Hog & Cattle Cycles (USDA & StatCan)', wikiEs: 'Ciclo ganadero inventario porcino y bovino América del Norte', wikiEn: 'Livestock cycle cattle hog inventory North America', domain: 'both', collection: 'markets', reportKey: 'proteins', audience: 'purchasing' },
    { topic: 'Statistical Trend, Volatility & OLS Regression Interpretation', wikiEs: 'Regresión lineal mínimos cuadrados volatilidad series temporales', wikiEn: 'Ordinary least squares time series volatility', domain: 'chat', collection: 'finance', reportKey: 'equities', audience: 'finance' },
];

const TOPICS = TRAINING_CURRICULUM.map(item => item.topic);

const LOCAL_EVIDENCE_FILES = [
    path.resolve(__dirname, '../../docs/AI_ARCHITECTURE.md'),
    path.resolve(__dirname, '../../boveda_obsidian/17_Inteligencia_Artificial/Fine_Tuning_Modelos.md'),
    path.resolve(__dirname, '../../boveda_obsidian/VALL-ML_Motor_de_Integridad.md'),
    path.resolve(__dirname, '../cache/market-review.json'),
    path.resolve(__dirname, '../cache/ml-memory.json'),
    path.resolve(__dirname, '../cache/learning-proposals.json'),
    path.resolve(__dirname, '../cache/brain-proposals.json'),
];

const REPORT_CACHE_FILES = {
    finance: path.resolve(__dirname, '../cache/finance_executive_reports.json'),
    markets: path.resolve(__dirname, '../cache/market_executive_reports.json'),
    mexico: path.resolve(__dirname, '../cache/mexico-executive-reports.json'),
};

const PROTEIN_SNAPSHOTS_FILE = path.resolve(__dirname, '../cache/protein-source-snapshots.json');
const COMMODITY_CACHE_FILE = path.resolve(__dirname, '../cache/commodity-cache.json');
const SNIIM_CACHE_FILE = path.resolve(__dirname, '../sniim-cache.json');

const SYSTEM_PROMPT = `Eres Proyecto Loopus, el motor de aprendizaje analítico y mejora continua de VALL AI (ORION).
Tu objetivo es analizar un corpus multi-fuente (cortes reales de informes ejecutivos de VALLNews, series de proteínas/commodities, literatura técnica y dictámenes de integridad) para destilar REGLAS DE RACIOCINIO de alta precisión que vuelvan más inteligente:
1) El CHAT de ORION (domain: "chat"): cruce de variables (FX + futuros + físico + tasas), distinción de etapas comerciales/unidades, cálculo de márgenes y separación entre dato observado e inferencia condicional.
2) La CREACIÓN DE INFORMES ejecutivos y personalizados (domain: "reports"): estructura de tesis para comité, conexión entre evidencia e implicación operativa en impulsores (drivers), formulación de riesgos con condición observable y preguntas de validación por audiencia (general, finance, purchasing, operations, commercial), sin inventar cifras ni dar recomendaciones de compra/venta.
3) Reglas transversales aplicables a ambos (domain: "both").

REGLAS ESTRICTAS:
- No fijes precios del día como verdades permanentes en learned_rule; destila el mecanismo causal, la relación entre variables, la disciplina de unidades/fechas y el protocolo de razonamiento.
- Toda regla debe incluir una cadena lógica explícita (reasoning_chain) con formato "Paso 1 -> Paso 2 -> Paso 3 -> Implicación/Validación".
- Genera entre 3 y 5 reglas de alta calidad por iteración, cubriendo tanto el chat como la creación de informes.

Devuelve ÚNICAMENTE JSON estricto con este esquema:
{
  "nuevas_reglas": [{
    "domain": "chat|reports|both",
    "audience": "general|finance|purchasing|operations|commercial",
    "condition_trigger": "situación o tipo de consulta/informe observable (máximo 200 caracteres)",
    "learned_rule": "protocolo de razonamiento o síntesis verificable (máximo 400 caracteres)",
    "reasoning_chain": "Observación -> Mecanismo -> Condición de invalidez -> Validación (máximo 240 caracteres)",
    "confidence_score": 88
  }],
  "insight_mercado": "síntesis ejecutiva prudente basada en la evidencia del ciclo (máximo 450 caracteres)"
}`;

function trainingDurationMs() {
    const requestedMinutes = Number(process.env.VALL_ML_TRAINING_MINUTES || DEFAULT_TRAINING_MINUTES);
    const minutes = Number.isFinite(requestedMinutes) && requestedMinutes > 0 ? requestedMinutes : DEFAULT_TRAINING_MINUTES;
    return Math.round(minutes * 60 * 1000);
}

function trainingIntervalMs() {
    const seconds = Number(process.env.LOOPUS_TRAINING_INTERVAL_SECONDS || DEFAULT_INTERVAL_SECONDS);
    return Math.round((Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_INTERVAL_SECONDS) * 1000);
}

function localEvidence() {
    const excerpts = [];
    for (const file of LOCAL_EVIDENCE_FILES) {
        try {
            const raw = fs.readFileSync(file, 'utf8');
            if (file.endsWith('.json')) {
                const parsed = JSON.parse(raw);
                const rows = Array.isArray(parsed) ? parsed : [parsed];
                const safeRows = rows.filter(item => item?.status === 'approved' || item?.deterministicIssues || item?.approval?.approved === true);
                if (safeRows.length) excerpts.push(`${path.basename(file)}:\n${JSON.stringify(safeRows.slice(-15))}`);
            } else {
                excerpts.push(`${path.basename(file)}:\n${raw.replace(/\s+/g, ' ').trim().slice(0, 2800)}`);
            }
        } catch { /* recurso opcional */ }
    }
    return excerpts.join('\n\n').slice(0, 7500);
}

function extractPublishedReportEvidence(collection, reportKey) {
    try {
        const file = REPORT_CACHE_FILES[collection];
        if (!file || !fs.existsSync(file)) return '';
        const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
        const reports = Array.isArray(snap?.reports) ? snap.reports : [];
        const target = reports.find(r => r.key === reportKey) || reports[0];
        if (!target) return '';
        const compact = {
            collection,
            key: target.key,
            title: target.title,
            generatedAt: target.generatedAt || snap.generatedAt,
            objective: target.objective,
            summary: String(target.summary || '').slice(0, 700),
            metrics: (target.metrics || []).slice(0, 10).map(m => ({ label: m.label, value: m.value, change: m.change })),
            takeaways: (target.takeaways || []).slice(0, 4),
            watchlist: (target.watchlist || []).slice(0, 4),
            sections: (target.sections || []).slice(0, 4).map(s => ({ heading: s.heading, text: String(s.text || '').slice(0, 400) })),
            tables: (target.tables || []).slice(0, 3).map(t => ({ title: t.title, columns: t.columns, sampleRows: (t.rows || []).slice(0, 4) })),
            executiveBrief: target.executiveBrief ? {
                headline: target.executiveBrief.headline,
                thesis: target.executiveBrief.thesis,
                drivers: target.executiveBrief.drivers,
                risks: target.executiveBrief.risks,
                committeeQuestion: target.executiveBrief.committeeQuestion,
            } : null,
        };
        return `CORTE DE INFORME VALLNEWS (${collection}/${target.key}):\n${JSON.stringify(compact)}`;
    } catch {
        return '';
    }
}

function extractMarketAndProteinSnapshots() {
    const blocks = [];
    try {
        if (fs.existsSync(PROTEIN_SNAPSHOTS_FILE)) {
            const snap = JSON.parse(fs.readFileSync(PROTEIN_SNAPSHOTS_FILE, 'utf8'));
            const sources = Array.isArray(snap?.sources) ? snap.sources.slice(0, 8) : [];
            if (sources.length) {
                blocks.push(`FUENTES INTERNACIONALES DE PROTEÍNAS:\n${JSON.stringify(sources.map(s => ({ id: s.id, title: s.title, status: s.status, summary: String(s.summary || '').slice(0, 260) })))}`);
            }
        }
    } catch { /* opcional */ }
    try {
        if (fs.existsSync(SNIIM_CACHE_FILE)) {
            const sniim = JSON.parse(fs.readFileSync(SNIIM_CACHE_FILE, 'utf8'));
            blocks.push(`REFERENCIA SNIIM MÉXICO:\n${JSON.stringify({ cerdo: sniim.cerdo, res: sniim.res, pollo: sniim.pollo, huevo: sniim.huevo, meta: sniim._meta })}`);
        }
    } catch { /* opcional */ }
    try {
        if (fs.existsSync(COMMODITY_CACHE_FILE)) {
            const comm = JSON.parse(fs.readFileSync(COMMODITY_CACHE_FILE, 'utf8'));
            const summary = {};
            for (const [k, v] of Object.entries(comm).slice(0, 8)) {
                const rows = v?.data?.data || v?.data;
                if (Array.isArray(rows) && rows[0]) summary[k] = { latest: rows[0], unit: v?.data?.unit || null };
            }
            if (Object.keys(summary).length) blocks.push(`SERIES DE COMMODITIES EN CACHÉ:\n${JSON.stringify(summary)}`);
        }
    } catch { /* opcional */ }
    return blocks.join('\n\n').slice(0, 4500);
}

function criticFilterProposals(rawRules = []) {
    if (!Array.isArray(rawRules)) return [];
    const clean = (value, max) => String(value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    return rawRules
        .map(rule => {
            const condition_trigger = clean(rule?.condition_trigger, 200);
            const learned_rule = clean(rule?.learned_rule, 400);
            const reasoning_chain = clean(rule?.reasoning_chain, 240);
            const domain = ['chat', 'reports', 'both'].includes(rule?.domain) ? rule.domain : 'both';
            const audience = ['general', 'finance', 'purchasing', 'operations', 'commercial'].includes(rule?.audience) ? rule.audience : 'general';
            const rawScore = Number(rule?.confidence_score);
            const confidence_score = Number.isFinite(rawScore)
                ? (rawScore <= 1 && rawScore > 0 ? Math.round(rawScore * 100) : Math.min(100, Math.max(0, Math.round(rawScore))))
                : 80;
            return { condition_trigger, learned_rule, reasoning_chain, domain, audience, confidence_score };
        })
        .filter(rule => rule.condition_trigger.length >= 15 && rule.learned_rule.length >= 35);
}

function saveRuleProposals(newRules, source) {
    const filtered = criticFilterProposals(newRules);
    if (!filtered.length) return [];
    const baseSource = source && typeof source === 'object' ? source : {};
    const formattedRules = filtered.slice(0, 10).map(rule => ({
        condition_trigger: rule.condition_trigger,
        learned_rule: rule.learned_rule,
        confidence_score: rule.confidence_score,
        domain: rule.domain,
        audience: rule.audience,
        reasoning_chain: rule.reasoning_chain || null,
        source: {
            ...baseSource,
            domain: rule.domain,
            audience: rule.audience,
            reasoning_chain: rule.reasoning_chain || null,
        },
        status: 'pending_human_review',
        created_at: new Date().toISOString(),
    }));

    const output = path.join(__dirname, '../cache/learning-proposals.json');
    let existing = [];
    try {
        const parsed = JSON.parse(fs.readFileSync(output, 'utf8'));
        if (Array.isArray(parsed)) existing = parsed;
    } catch { /* primera ejecución */ }
    const ruleKey = rule => `${rule?.condition_trigger || ''}\u0000${rule?.learned_rule || ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
    const known = new Set(existing.map(ruleKey));
    const fresh = formattedRules.filter(rule => {
        const key = ruleKey(rule);
        if (known.has(key)) return false;
        known.add(key);
        return true;
    });
    if (!fresh.length) return [];
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify([...existing, ...fresh].slice(-300), null, 2), 'utf8');
    return fresh;
}

function saveTrainingEvent(event) {
    let existing = [];
    try {
        const parsed = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
        if (Array.isArray(parsed)) existing = parsed;
    } catch { /* primer evento */ }
    fs.mkdirSync(path.dirname(EVENTS_FILE), { recursive: true });
    fs.writeFileSync(EVENTS_FILE, JSON.stringify([...existing, event].slice(-1000), null, 2), 'utf8');
}

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const request = https.get({
            hostname: target.hostname,
            path: `${target.pathname}${target.search}`,
            headers: { 'User-Agent': 'Proyecto-Loopus-Research/2.0', Accept: 'application/json' },
            timeout: 15_000,
            ca: trustedCertificates(),
            rejectUnauthorized: REJECT_UNAUTHORIZED,
        }, response => {
            let data = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { data += chunk; });
            response.on('end', () => {
                if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`HTTP ${response.statusCode}`));
                try { resolve(JSON.parse(data)); } catch { resolve(null); }
            });
        });
        request.on('timeout', () => request.destroy(new Error('Tiempo de espera agotado')));
        request.on('error', reject);
    });
}

async function fetchWikiLang(lang, queryText) {
    if (!queryText) return null;
    try {
        const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(queryText)}&srlimit=3&utf8=&format=json`;
        const search = await fetchJSON(searchUrl);
        const rows = search?.query?.search;
        if (!Array.isArray(rows) || !rows.length) return null;
        const snippets = rows.slice(0, 3).map(row => `${row.title}: ${String(row.snippet || '').replace(/<[^>]+>/g, '')}`).join('\n');
        const topTitle = rows[0]?.title;
        if (!topTitle) return snippets;
        const extractUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exchars=1400&redirects=1&titles=${encodeURIComponent(topTitle)}&format=json`;
        const extractRes = await fetchJSON(extractUrl).catch(() => null);
        const pages = extractRes?.query?.pages || {};
        const firstPage = Object.values(pages)[0];
        const extract = String(firstPage?.extract || '').trim();
        return extract ? `${snippets}\nExtracto (${topTitle}): ${extract}` : snippets;
    } catch {
        return null;
    }
}

async function getWikipediaText(topicOrSpec) {
    const spec = typeof topicOrSpec === 'object' && topicOrSpec !== null
        ? topicOrSpec
        : { topic: String(topicOrSpec || ''), wikiEs: String(topicOrSpec || ''), wikiEn: String(topicOrSpec || '') };
    const [esText, enText] = await Promise.all([
        fetchWikiLang('es', spec.wikiEs || spec.topic),
        fetchWikiLang('en', spec.wikiEn || spec.topic),
    ]);
    return [
        esText ? `[Wikipedia ES]\n${esText}` : '',
        enText ? `[Wikipedia EN]\n${enText}` : '',
    ].filter(Boolean).join('\n\n') || null;
}

async function gatherTopicCorpus(spec, projectEvidence) {
    const wikipediaText = await getWikipediaText(spec);
    const reportEvidence = extractPublishedReportEvidence(spec.collection, spec.reportKey);
    const marketSnapshots = extractMarketAndProteinSnapshots();
    const sourcesUsed = [
        ...(wikipediaText ? ['wikipedia-es-en'] : []),
        ...(reportEvidence ? [`vallnews-report-${spec.collection}-${spec.reportKey}`] : []),
        ...(marketSnapshots ? ['market-protein-commodity-caches'] : []),
        ...(projectEvidence ? ['local-approved-evidence'] : []),
    ];
    const text = [
        `MÓDULO DE ENTRENAMIENTO: ${spec.topic} | Dominio objetivo: ${spec.domain} | Audiencia principal: ${spec.audience} | Informe asociado: ${spec.collection}/${spec.reportKey}`,
        reportEvidence,
        marketSnapshots,
        wikipediaText ? `LITERATURA Y CONTEXTO PÚBLICO (Wikipedia ES/EN):\n${wikipediaText}` : '',
        projectEvidence ? `ARQUITECTURA Y DICTÁMENES PREVIOS:\n${projectEvidence}` : '',
    ].filter(Boolean).join('\n\n');

    return {
        text,
        sourcesUsed,
        wikipediaText,
        hasReportEvidence: Boolean(reportEvidence),
        hasMarketSnapshots: Boolean(marketSnapshots),
    };
}

async function generateWithTierRotation(ai, { prompt, systemInstruction, preferredTier = 'pro' }) {
    const order = preferredTier === 'report'
        ? ['report', 'pro', 'flash']
        : ['pro', 'report', 'flash'];
    let lastError;
    for (const tier of order) {
        try {
            return await ai.generate({
                prompt,
                systemInstruction,
                tier,
                json: true,
                timeoutMs: 45_000,
            });
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function runTrainingLoop() {
    if (process.env.VALL_ML_TRAINING_ENABLED !== 'true') {
        throw new Error('Entrenamiento desactivado. Define VALL_ML_TRAINING_ENABLED=true para ejecutar un ciclo con propuestas sujetas a revisión humana.');
    }

    const ai = new GeminiProvider();
    if (!ai.isConfigured()) throw new Error('Gemini no está configurado.');

    const startedAt = Date.now();
    const durationMs = trainingDurationMs();
    const intervalMs = trainingIntervalMs();
    const endAt = startedAt + durationMs;
    let topicIndex = 0;
    let attempts = 0;
    let proposals = 0;
    let playbookAdded = 0;
    let errors = 0;
    let runId = null;
    let lastFeedbackReviewAt = 0;
    let lastIntegrityReviewAt = 0;
    let projectEvidence = localEvidence();
    const runKey = `loopus-training-${new Date(startedAt).toISOString()}-${crypto.randomUUID()}`;
    try {
        runId = await createTrainingRun({
            runKey,
            startedAt,
            metadata: {
                project: 'Proyecto Loopus v2 (Chat + Reports Reasoning)',
                duration_minutes: Math.round(durationMs / 60000),
                interval_seconds: Math.round(intervalMs / 1000),
                provider: 'gemini',
                curriculum_size: TRAINING_CURRICULUM.length,
                topics: TOPICS,
            },
        });
    } catch (error) {
        console.warn('[Loopus] No se pudo registrar el inicio en Supabase:', error.message);
    }
    console.log(`[Loopus] Inicio: ${new Date(startedAt).toISOString()} · duración: ${Math.round(durationMs / 60000)} min · currículum: ${TRAINING_CURRICULUM.length} módulos.`);

    while (Date.now() < endAt) {
        const spec = TRAINING_CURRICULUM[topicIndex++ % TRAINING_CURRICULUM.length];
        const topic = spec.topic;
        attempts += 1;
        const attemptStartedAt = Date.now();
        let event = null;
        try {
            if (Date.now() - lastFeedbackReviewAt >= 10 * 60 * 1000) {
                lastFeedbackReviewAt = Date.now();
                await evaluateQueries().catch(() => {});
            }
            if (Date.now() - lastIntegrityReviewAt >= 15 * 60 * 1000) {
                lastIntegrityReviewAt = Date.now();
                await runIntegrityPipeline().catch(() => {});
                projectEvidence = localEvidence();
            }

            const corpus = await gatherTopicCorpus(spec, projectEvidence);
            if (corpus.text.length > 80) {
                const preferredTier = spec.domain === 'reports' ? 'report' : (attempts % 2 === 0 ? 'report' : 'pro');
                const response = await generateWithTierRotation(ai, {
                    prompt: `MÓDULO #${attempts}: ${topic}\nENFOQUE SOLICITADO: Genera reglas de raciocinio aplicables a ${spec.domain === 'chat' ? 'ORION Chat y cruce de variables' : spec.domain === 'reports' ? `Creación y síntesis de informes (${spec.collection}/${spec.reportKey}, audiencia ${spec.audience})` : `ORION Chat y Creación de Informes (${spec.collection}/${spec.reportKey})`}.\n\nCORPUS MULTI-FUENTE VERIFICADO:\n${corpus.text}`,
                    systemInstruction: SYSTEM_PROMPT,
                    preferredTier,
                });
                const cleanedText = String(response.text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
                const result = JSON.parse(cleanedText);
                const saved = saveRuleProposals(result?.nuevas_reglas, {
                    provider: 'loopus-gemini-v2',
                    model: response.model || null,
                    sources: corpus.sourcesUsed,
                    topic,
                    collection: spec.collection,
                    report_key: spec.reportKey,
                    collected_at: new Date().toISOString(),
                });
                proposals += saved.length;
                playbookAdded += updateReasoningPlaybook(saved.map(item => ({
                    ...item,
                    topic: `${spec.collection}_${spec.reportKey}`,
                })));

                event = {
                    event_key: `${runKey}-attempt-${attempts}`,
                    run_key: runKey,
                    attempt_number: attempts,
                    topic,
                    status: 'completed',
                    model: response.model,
                    sources: corpus.sourcesUsed,
                    evidence: {
                        collection: spec.collection,
                        report_key: spec.reportKey,
                        domain: spec.domain,
                        audience: spec.audience,
                        has_report_evidence: corpus.hasReportEvidence,
                        has_market_snapshots: corpus.hasMarketSnapshots,
                        corpus_chars: corpus.text.length,
                    },
                    output: {
                        insight_mercado: result?.insight_mercado || null,
                        proposals_saved: saved.length,
                        proposals: saved,
                    },
                    started_at: new Date(attemptStartedAt).toISOString(),
                    ended_at: new Date().toISOString(),
                };
                try {
                    await persistRuleProposals(saved, runId);
                } catch (error) {
                    errors += 1;
                    console.warn('[Loopus] No se pudieron guardar propuestas en Supabase:', error.message);
                }
                console.log(`[Loopus #${attempts}] ${topic} (${response.model}): ${saved.length} nuevas reglas (total sesión: ${proposals}, playbook: +${playbookAdded}).`);
            }
        } catch (error) {
            errors += 1;
            event = {
                event_key: `${runKey}-attempt-${attempts}`,
                run_key: runKey,
                attempt_number: attempts,
                topic,
                status: 'failed',
                model: null,
                sources: ['loopus-gemini-v2'],
                evidence: { collection: spec.collection, report_key: spec.reportKey },
                output: null,
                error_code: error.code || error.message,
                started_at: new Date(attemptStartedAt).toISOString(),
                ended_at: new Date().toISOString(),
            };
            console.warn(`[Loopus #${attempts}] ${topic}: ${error.code || error.message}`);
        }
        if (event) {
            saveTrainingEvent(event);
            try { await persistTrainingEvent(event, runId); }
            catch (error) { console.warn('[Loopus] No se pudo guardar el evento en Supabase:', error.message); }
            try { await updateTrainingRunProgress(runId, { startedAt, attempts, proposalCount: proposals, errorCount: errors }); }
            catch (error) { console.warn('[Loopus] No se pudo actualizar el progreso en Supabase:', error.message); }
        }

        const remaining = endAt - Date.now();
        if (remaining > 0) await pause(Math.min(intervalMs, remaining));
    }

    const endedAt = Date.now();
    try {
        await finishTrainingRun(runId, { status: 'completed', startedAt, endedAt, attempts, proposalCount: proposals, errorCount: errors });
    } catch (error) {
        console.warn('[Loopus] No se pudo finalizar el registro en Supabase:', error.message);
    }
    const summary = {
        project: 'Proyecto Loopus v2',
        status: 'completed',
        run_key: runKey,
        started_at: new Date(startedAt).toISOString(),
        ended_at: new Date(endedAt).toISOString(),
        duration_minutes: Math.round((endedAt - startedAt) / 60000),
        attempts,
        proposals_pending_human_review: proposals,
        playbook_rules_added: playbookAdded,
        errors,
        resources: ['gemini-pro-report-flash', 'wikipedia-es-en', 'vallnews-executive-reports', 'protein-commodity-snapshots', 'market-integrity', 'chat-feedback'],
    };
    fs.mkdirSync(path.dirname(SUMMARY_FILE), { recursive: true });
    fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`[Loopus] Completado. Intentos: ${attempts}; propuestas nuevas: ${proposals}; reglas de raciocinio activas en playbook: +${playbookAdded}.`);
    return summary;
}

if (require.main === module) {
    runTrainingLoop().catch(error => {
        console.error('[Loopus] Error crítico:', error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    runTrainingLoop,
    saveRuleProposals,
    saveTrainingEvent,
    trainingDurationMs,
    trainingIntervalMs,
    localEvidence,
    gatherTopicCorpus,
    criticFilterProposals,
    TRAINING_CURRICULUM,
};
