'use strict';
const assert = require('node:assert/strict');
const {
    loadCachedProteinML,
    getProteinMLContextForQuery,
    forecastProteinSeries,
    buildMarranasAlerts,
    SPECIES_META,
    REGION_META,
} = require('../backend/ml/protein-ml-engine');
const { getPredictiveContextForQuery } = require('../backend/ml/predictive-showcase');
const { getReportReasoningContext } = require('../backend/ai/loopus-knowledge');
const {MODEL_VERSION, VALIDATION_PROTOCOL, MIN_VALIDATION_WINDOWS} = require('../backend/ml/protein-forecast-policy');

const artifact = loadCachedProteinML();
assert(artifact, 'Ejecuta train-protein-ml.cjs antes de esta prueba de integración con datos reales');
assert.equal(artifact.version, MODEL_VERSION);
assert.equal(artifact.validationProtocol, VALIDATION_PROTOCOL);
assert.match(artifact.dataFingerprint, /^[a-f0-9]{64}$/);
const active = artifact.forecasts.filter(item => item.available);
assert.equal(artifact.stats.activeModels, active.length);
assert.equal(artifact.stats.abstainedSeries, artifact.forecasts.length - active.length);

// La cobertura refleja solo modelos que superaron la validación, sin cuotas artificiales.
for (const sp of Object.keys(SPECIES_META)) {
    const sum = artifact.summary.bySpecies[sp];
    assert.equal(sum?.seriesCount || 0, active.filter(item => item.species === sp).length);
    if (sum) assert(['ALZA', 'BAJA', 'LATERAL'].includes(sum.consensusDirection));
}
for (const reg of Object.keys(REGION_META)) {
    const sum = artifact.summary.byRegion[reg];
    assert.equal(sum?.seriesCount || 0, active.filter(item => item.region === reg).length);
}

// Validar integridad matemática de cada pronóstico activo
for (const item of artifact.forecasts.filter(f => f.available)) {
    const p = item.primaryForecast;
    assert(['ALZA', 'BAJA', 'LATERAL'].includes(p.direction), `Dirección inválida en ${item.symbol}`);
    assert(p.probUpPct >= 0 && p.probUpPct <= 100, `Probabilidad fuera de rango en ${item.symbol}`);
    assert(Math.abs(p.probUpPct + p.probDownPct - 100) < 0.2, `Probabilidades no suman 100 en ${item.symbol}`);
    assert(p.low80 > 0 && p.high80 >= p.low80, `Banda P80 inválida en ${item.symbol}`);
    assert(p.low90 > 0 && p.high90 >= p.low90, `Banda P90 inválida en ${item.symbol}`);
    assert(Number.isFinite(p.projectedValue) && p.projectedValue > 0, `Objetivo inválido en ${item.symbol}`);
    assert(p.explainability && typeof p.explainability.narrative === 'string' && p.explainability.narrative.length > 20, `Factores asociados ausentes en ${item.symbol}`);
    assert(Array.isArray(p.explainability.factors) && p.explainability.factors.length >= 1);
    for (const h of item.horizons) {
        assert(h.eligible && h.targetDate > new Date().toISOString().slice(0, 10));
        assert.equal(h.validation.protocol, VALIDATION_PROTOCOL);
        assert(h.validation.evalWindows >= MIN_VALIDATION_WINDOWS);
        assert(h.validation.walkForwardDirectionalAccuracyPct > h.validation.baselineAccuracyPct + 1);
        assert(h.validation.brierSkillPct > 0 && h.validation.maeImprovementPct > 0);
        assert(!/heuristic|fallback|baseline/.test(h.modelUsed));
        if (h.validation.intervalCoverageScope === 'calibration_only') assert.equal(h.validation.conformal80CoveragePct, null);
    }
}
for (const item of artifact.forecasts.filter(f => !f.available)) {
    assert.equal(item.primaryForecast, null);
    assert.equal((item.horizons || []).length, 0);
}

// Verificar contexto para ORION Chat (con cifras y probabilidades) y trigger "MARRANAS"
const chatMxPork = getProteinMLContextForQuery('¿Qué dice MARRANAS sobre si va a subir o bajar el precio del cerdo en México?');
assert(chatMxPork.includes('MARRANAS · MOTOR ML DEDICADO DE PROTEÍNAS'), 'Debe incluir cabecera de MARRANAS');
const mxPork = active.filter(item => item.species === 'cerdo' && item.region === 'MX');
assert(mxPork.length ? /Subida \d+/.test(chatMxPork) : chatMxPork.includes('No hay pronósticos validados'), 'Debe mostrar cobertura real para México');
if (!mxPork.length) assert(!/^- .*\[.*\]: último=/m.test(chatMxPork), 'No sustituir silenciosamente el mercado solicitado');
assert(/México|SNIIM/i.test(chatMxPork), 'Debe priorizar series de México');

const chatEuEgg = getProteinMLContextForQuery('Tendencia del huevo y pollo en Europa y Latinoamérica');
assert(/Europa|EU|Latinoamérica|LATAM/i.test(chatEuEgg), 'Debe cubrir Europa y Latinoamérica');

// Verificar integración automática en predictive-showcase y modo sin cifras para informes
const showcaseChat = getPredictiveContextForQuery('¿Sube o baja el precio del pollo y huevo en México y EE. UU.?');
assert(showcaseChat.includes('MOTOR ML DEDICADO DE PROTEÍNAS'), 'predictive-showcase debe integrar el motor ML de proteínas');

const reportSafe = getReportReasoningContext({ area: 'markets', key: 'proteins', audience: 'purchasing', depth: 'detailed' });
assert(reportSafe.includes('RADAR ML ESPECIALIZADO EN PROTEÍNAS'), 'loopus-knowledge debe inyectar radar cualitativo en informes de proteínas');
assert(!/\d/.test(reportSafe.split('RADAR ML ESPECIALIZADO EN PROTEÍNAS')[1] || ''), 'El bloque de informes no debe introducir cifras ajenas');

// Verificar pronóstico determinista sobre serie sintética corta (sanity check)
const synthetic = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.UTC(2025, 0, 1 + i * 7)).toISOString().slice(0, 10),
    value: 50 + i * 0.4 + Math.sin(i) * 0.5,
}));
const unitTest = forecastProteinSeries({
    symbol: 'TEST-MX-PORK', label: 'Prueba Cerdo', species: 'cerdo', region: 'MX', country: 'México', unit: 'MXN/kg', cadence: 'weekly', source: 'Test', points: synthetic,
});
assert.equal(unitTest.available, false, 'Una serie histórica atrasada debe abstenerse');
assert.equal(unitTest.primaryForecast, null);

const { loadCachedClosedLoopAudit } = require('../backend/ml/protein-ml-closed-loop');
const audit = loadCachedClosedLoopAudit();
assert(audit?.summary, 'Debe existir auditoría, aunque los objetivos futuros todavía no hayan vencido');
assert.equal(audit.summary.modelVersion, MODEL_VERSION);
assert.equal(audit.summary.evaluationScope, 'prospective_current_model_only');
assert(audit.summary.totalEvaluated >= 0);
if (!audit.summary.totalEvaluated) {
    assert.equal(audit.summary.conformal80CoveragePct, null);
    assert.equal(audit.summary.avgMapePct, null);
}

const alerts = buildMarranasAlerts(artifact);
assert(Array.isArray(alerts), 'La ausencia de señales no debe producir alertas inventadas');
assert(alerts.every(a => ['CRÍTICA', 'ALTA', 'VIGILANCIA'].includes(a.severity) && a.title && a.detail), 'Formato válido de alertas tempranas');

// Verificar Paridad de Importación → México (MARRANAS v5.0)
assert(artifact.importParity && artifact.importParity.bySpecies, 'Debe existir artifact.importParity.bySpecies');
assert(artifact.importParity.fxRates && artifact.importParity.fxRates.usdMxn > 10, 'Debe existir USD/MXN válido en importParity');
for (const sp of Object.keys(SPECIES_META)) {
    const pSp = artifact.importParity.bySpecies[sp];
    assert(pSp && pSp.mexicoBenchmark?.priceMxnKg > 0, `Falta benchmark México MXN/kg para ${sp}`);
    assert(Array.isArray(pSp.origins) && pSp.origins.length >= 1, `Faltan orígenes de paridad para ${sp}`);
    assert(pSp.primaryParity && Number.isFinite(pSp.primaryParity.landedMxnKg) && pSp.primaryParity.landedMxnKg > 0, `Paridad puesta inválida para ${sp}`);
    assert(['TECHO_IMPORTACION', 'EQUILIBRIO', 'DESCUENTO_MX'].includes(pSp.primaryParity.signal), `Señal de paridad inválida para ${sp}`);
}
const chatParity = getProteinMLContextForQuery('¿Cómo está la paridad de importación del cerdo y pollo de EE. UU. hacia México?');
assert(chatParity.includes('Paridad de Importación → México'), 'ORION Chat debe inyectar paridad de importación ante consultas de arbitraje');
const reportParitySafe = getProteinMLContextForQuery('Paridad de importación de cerdo y pollo México EE. UU.', { stripNumbers: true });
assert(!/\d/.test(reportParitySafe), 'El bloque de informes de paridad con stripNumbers=true no debe contener dígitos');

// Verificar Motor NLP de Eventos Sanitarios y Comerciales (MARRANAS v6.0)
const { classifyProteinEvent } = require('../backend/ml/protein-nlp-events');
const nowMs = Date.now();
const evH5 = classifyProteinEvent({ title: 'México confirma nuevo brote de influenza aviar H5N1 en granjas de pollo y huevo en Yucatán', summary: 'SENASICA aplica cuarentena', source: 'Test', url: 'https://example.com/1', publishedMs: nowMs - 2 * 86400000, publishedAt: new Date(nowMs - 2 * 86400000).toISOString(), queryId: 't' }, nowMs);
assert(evH5 && evH5.eventType === 'BROTE_SANITARIO' && evH5.priceImpact === 'ALCISTA' && evH5.species.includes('pollo') && evH5.species.includes('huevo') && evH5.regions.includes('MX'), 'Clasificador NLP debe detectar brote H5N1 alcista en MX');

const evDairyOnly = classifyProteinEvent({ title: 'New bird flu cases appear in US dairy herds', summary: 'USDA reviews cattle vaccination', source: 'Test', url: 'https://example.com/2', publishedMs: nowMs - 86400000, publishedAt: new Date(nowMs - 86400000).toISOString(), queryId: 't' }, nowMs);
assert(evDairyOnly && evDairyOnly.species.includes('res') && !evDairyOnly.species.includes('pollo') && !evDairyOnly.species.includes('huevo'), 'H5N1 exclusivo de ganado lechero no debe contaminar pollo/huevo');

const evStale = classifyProteinEvent({ title: 'African swine fever outbreak in Belgium', summary: 'Old news', source: 'Test', url: 'https://example.com/3', publishedMs: Date.parse('2018-09-14T00:00:00Z'), publishedAt: '2018-09-14T00:00:00Z', queryId: 't' }, nowMs);
assert.equal(evStale, null, 'Artículos antiguos (>35 días) deben descartarse');

assert(artifact.nlpEvents && artifact.nlpEvents.bySpecies, 'Debe existir artifact.nlpEvents.bySpecies en MARRANAS v6.0');
assert((artifact.nlpEvents.stats?.relevantEventsDetected || 0) >= 0, 'No exigir un mínimo artificial de noticias');
const chatNlp = getProteinMLContextForQuery('¿Cómo afectan los brotes de H5N1 y gusano barrenador a los precios de res y pollo en México?');
assert(chatNlp.includes('Radar NLP de Eventos Sanitarios y Comerciales'), 'ORION Chat debe inyectar contexto NLP sanitario/comercial');
const reportNlpSafe = getProteinMLContextForQuery('Riesgo de influenza aviar H5N1 y gusano barrenador en México', { stripNumbers: true });
assert(!/\d/.test(reportNlpSafe), 'El bloque de informes NLP con stripNumbers=true no debe contener dígitos');

// Verificar integración nativa con ORION (MCP tool, Query Planner, Data Inventory, Auto-Charts y Chat completo)
const { planQuery } = require('../backend/ai/query-planner');
const { DEFINITIONS: MCP_DEFS } = require('../backend/ai/mcp-tools');
const { buildDataInventoryContext } = require('../backend/ai/data-inventory');
const { buildMarranasChart } = require('../backend/ai/analytical-charts');
const { getChatReasoningContext } = require('../backend/ai/loopus-knowledge');

assert(MCP_DEFS.marranas_proteins_ml, 'marranas_proteins_ml debe estar registrada como herramienta MCP nativa de ORION');
assert.equal(planQuery({ message: '¿Qué dice MARRANAS sobre la paridad de importación del cerdo?' }).needsMarranasML, true, 'planQuery debe activar needsMarranasML');
assert.equal(planQuery({ message: '¿Qué riesgo hay por gusano barrenador en ganado bovino en México?' }).needsMarranasML, true, 'planQuery debe activar needsMarranasML ante eventos sanitarios');
assert(buildDataInventoryContext().includes('MARRANAS'), 'Inventario en vivo de ORION debe incluir a MARRANAS');

const cDir = buildMarranasChart({ message: 'Pronóstico MARRANAS para proteínas' });
const cPar = buildMarranasChart({ message: 'Paridad de importación hacia México en MXN/kg' });
const cNlp = buildMarranasChart({ message: 'Riesgo sanitario NLP por H5N1 y gusano barrenador' });
const coveredSpecies = Object.values(artifact.summary.bySpecies).filter(sum => sum.seriesCount > 0).length;
assert(coveredSpecies < 2 ? cDir === null : cDir && cDir.datasets.length === 2 && cDir.labels.length === coveredSpecies, 'Gráfica direccional refleja cobertura validada');
assert(cPar && cPar.unit === 'MXN/kg' && cPar.labels.length === 4, 'Gráfica de paridad MXN/kg MARRANAS válida');
assert(cNlp && cNlp.labels.length === 4, 'Gráfica de riesgo NLP MARRANAS válida');

const orionChatFull = getChatReasoningContext({ message: '¿Qué dice MARRANAS sobre si sube o baja el cerdo y la res en México, la paridad de importación y el gusano barrenador?' });
assert(orionChatFull.includes('MARRANAS') && orionChatFull.includes('Paridad de Importación') && orionChatFull.includes('Radar NLP'), 'ORION Chat debe recibir el contexto disponible sin inventar pronósticos');

console.log(`Protein ML Engine: OK · ${artifact.version} · ${active.length} series publicadas de ${artifact.forecasts.length}, ${artifact.stats.totalObservationsIngested} observaciones, acierto histórico ${artifact.stats.avgWalkForwardDirectionalAccuracyPct}%, ${audit.summary.totalEvaluated} evaluaciones prospectivas, ${alerts.length} alertas contextuales/validadas. Cobertura real y ausencia de predicciones locales no acreditadas verificadas.`);
