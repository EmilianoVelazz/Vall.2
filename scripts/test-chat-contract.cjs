'use strict';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', 'backend', '.env'), quiet: true });
const assert = require('node:assert/strict');
const chatRouter = require('../backend/routes/chat');
const { domainDecision } = require('../backend/ai/domain-policy');
const { parseCurrencyConversion, parseCurrencyPair, calculateConversion, conversionContext, isSimpleCurrencyConversion, conversionAnswer } = require('../backend/ai/currency-converter');
const { planQuery, planContext, mergeEvidence } = require('../backend/ai/query-planner');
const { rulesForMessage } = require('../backend/ai/live-data-grounder');
const { auditResponse, appendDisclosure } = require('../backend/ai/response-quality');
const { isLikelyFollowUp, conversationAnchor, conversationInstruction, conversationFocus } = require('../backend/ai/conversation-context');
const { buildPrompt } = require('../backend/ai/prompt-builder');
const { retrievalQuestion } = require('../backend/ai/orchestrator');

const fromMessage = chatRouter.structuredInput({ message: '  Hola VALL AI  ' });
const fromPrompt = chatRouter.structuredInput({ prompt: '  Analiza mercados  ' });
const fromQuery = chatRouter.structuredInput({ query: '  Panorama global  ' });

assert.equal(fromMessage.message, 'Hola VALL AI');
assert.equal(fromPrompt.message, 'Analiza mercados');
assert.equal(fromQuery.message, 'Panorama global');
assert.equal(chatRouter.structuredInput({}).message, '');
assert.equal(chatRouter.structuredInput({ message: 'Respuesta breve', mode: 'technical', tier: 'pro' }).mode, 'technical');
assert.equal(chatRouter.structuredInput({ message: 'Respuesta breve', mode: 'technical', tier: 'pro' }).tier, 'pro');
assert.equal(chatRouter.structuredInput({ message: 'Respuesta breve', mode: 'inventado' }).mode, 'auto');
assert.equal(chatRouter.structuredInput({ message: 'Crea un reporte detallado con riesgos y escenarios' }).tier, 'pro');
for (const [modelProfile, expectedTier] of [['nebula', 'flash'], ['cirius', 'flash'], ['pulsar', 'pro']]) {
    const selected = chatRouter.structuredInput({ message: 'Explica qué es un bono', modelProfile });
    assert.equal(selected.modelProfile, modelProfile);
    assert.equal(selected.tier, expectedTier);
}
assert.equal(chatRouter.structuredInput({ message: 'Crea un reporte detallado con riesgos y escenarios', modelProfile: 'nebula' }).tier, 'flash');
assert.equal(chatRouter.structuredInput({ message: 'Explica qué es un bono', modelProfile: 'gemini-unknown' }).modelProfile, null);
assert.equal(chatRouter.structuredInput({ message: 'Explica qué es un bono', modelProfile: '__proto__' }).modelProfile, null);
assert.equal(chatRouter.hashUser({ id: 'usuario-1' }), chatRouter.hashUser({ id: 'usuario-1' }));
assert.notEqual(chatRouter.hashUser({ id: 'usuario-1' }), chatRouter.hashUser({ id: 'usuario-2' }));
assert.equal(chatRouter.hashUser(null), null);

// Las conversiones son una consulta financiera: las variantes plurales no
// pueden ser enviadas por error al rechazo de temas ajenos.
assert.equal(domainDecision({ message: 'Convierte 216 dólares a pesos mexicanos' }).allowed, true);
assert.equal(domainDecision({ message: 'Convierte 216 dolares a pesos mexicano' }).reason, 'domain');
const conversionRequest = parseCurrencyConversion('Convierte 216 dolares a pesos mexicanos');
assert.deepEqual(conversionRequest, { amount: 216, from: 'USD', to: 'MXN' });
assert.deepEqual(parseCurrencyConversion('Me conviertiera 216 dólares a pesos mexicanos'), { amount: 216, from: 'USD', to: 'MXN' });
assert.deepEqual(parseCurrencyPair('¿A cuánto está el dólar estadounidense frente al peso mexicano?'), { from: 'USD', to: 'MXN' });
assert.deepEqual(parseCurrencyConversion('Convierte 100 libras esterlinas a yenes japoneses'), { amount: 100, from: 'GBP', to: 'JPY' });
assert.deepEqual(parseCurrencyPair('Compara el naira nigeriano frente al franco suizo'), { from: 'NGN', to: 'CHF' });
const conversion = calculateConversion(conversionRequest, { USD: 1, MXN: 18.25 });
assert.equal(conversion.result, 3942);
assert.match(conversionContext({ ...conversion, source: 'Prueba', updatedAt: null }), /3,942\.00 MXN/);
assert.equal(isSimpleCurrencyConversion('Me conviertiera 216 dólares a pesos mexicanos', conversion), true);
assert.match(conversionAnswer({ ...conversion, source: 'Prueba', updatedAt: null }), /3,942\.00 MXN/);

// El plan de consultas selecciona evidencia por tema antes de delegar al
// modelo. Así una cotización actual no queda a criterio de su memoria.
const oilPlan = planQuery({ message: '¿A cuánto cotiza el petróleo WTI hoy?' });
assert.equal(oilPlan.topic, 'commodities');
assert.equal(oilPlan.needsLiveQuote, true);
assert.match(planContext(oilPlan), /cotización actual/i);
assert.equal(rulesForMessage('¿A cuánto cotiza el petróleo WTI hoy?', oilPlan)[0].symbol, 'CL=F');
const reportPlan = planQuery({ message: 'Elabora un reporte ejecutivo con riesgos y escenarios para el peso mexicano' });
assert.equal(reportPlan.topic, 'fx');
assert.equal(reportPlan.recommendedTier, 'pro');
const mergedEvidence = mergeEvidence({ context: 'Evidencia interna', citations: [], sourceCodes: [], evidenceCount: 0, retrievalStrategy: 'rag' }, {
    context: 'Dato en vivo', citations: [{ id: 'L1', title: 'USD/MXN', source: 'Prueba', date: '2026-09-10' }], sourceCodes: ['fx'], strategy: 'live_data_verified_v1',
});
assert.match(mergedEvidence.context, /Dato en vivo/);
assert.equal(mergedEvidence.evidenceCount, 1);
const unavailableAudit = auditResponse({ text: 'El precio actual es 100.', plan: oilPlan, liveData: { available: false }, evidence: {} });
assert.match(appendDisclosure('El precio actual es 100.', unavailableAudit), /Cotización sin confirmar/);

const liveConfig = chatRouter.liveSessionConfig();
assert.deepEqual(liveConfig.responseModalities, ['AUDIO']);
assert.deepEqual(liveConfig.inputAudioTranscription, {});
assert.deepEqual(liveConfig.outputAudioTranscription, {});
assert.match(liveConfig.systemInstruction, /español de México/i);
assert.ok(liveConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName);
assert.ok(liveConfig.thinkingConfig.thinkingLevel === 'minimal' || liveConfig.thinkingConfig.thinkingBudget === 0);
assert.equal(liveConfig.realtimeInputConfig.automaticActivityDetection.silenceDurationMs, 350);
assert.equal(liveConfig.realtimeInputConfig.activityHandling, 'START_OF_ACTIVITY_INTERRUPTS');
assert.match(liveConfig.systemInstruction, /ALCANCE OBLIGATORIO DE ORION/);
assert.match(liveConfig.systemInstruction, /Solo puedo ayudarte con finanzas, mercados, bolsas, divisas, monedas/);
assert.match(liveConfig.systemInstruction, /juego de roles/);
assert.match(chatRouter.LIVE_MODEL, /^gemini-/);
assert.match(chatRouter.liveFxInstruction({ rate: 16.89, source: 'Prueba', updatedAt: null }), /1 USD = 16\.89 MXN/);
assert.match(chatRouter.liveFxInstruction(null), /no inventes/i);

// El hilo conserva el encargo aunque el seguimiento mencione un nuevo activo,
// país, periodo o formato. Un cambio de tema explícito sí corta la herencia.
const threadHistory = [
    { role: 'user', content: 'Compara el dólar y el euro durante 2025 en una gráfica' },
    { role: 'model', content: 'Preparé la comparación solicitada.' },
    { role: 'user', content: 'agrégale la libra esterlina' },
    { role: 'model', content: 'Incorporé GBP a la comparación.' },
];
assert.equal(isLikelyFollowUp('¿y el peso mexicano?', threadHistory), true);
assert.equal(isLikelyFollowUp('ahora hazla en tabla y conserva 2025', threadHistory), true);
assert.equal(isLikelyFollowUp('¿Qué impacto tendría?', threadHistory), true);
assert.equal(isLikelyFollowUp('¿Cómo afecta a la decisión?', threadHistory), true);
assert.equal(isLikelyFollowUp('cambiando de tema, analiza el precio del petróleo', threadHistory), false);
const marginQuestion = 'Soy productor de cerdo en México. Vendo 10,000 kg a 42 MXN/kg, con costo completo de 36 MXN/kg; 60% es alimento y sólo ese componente sube 15%.';
const marginHistory = [
    { role: 'user', content: marginQuestion },
    { role: 'assistant', content: 'Costo nuevo: 39.24 MXN/kg. Utilidad original: 60,000 MXN; después: 27,600 MXN.' },
];
const marginFollowUp = 'Mantén todos los supuestos anteriores y el nuevo costo del alimento. Ahora aumenta únicamente mi precio de venta 10%. Dame en menos de 100 palabras la nueva utilidad total, margen sobre ventas y diferencia frente a la utilidad ORIGINAL. No vuelvas a preguntarme los datos.';
for (const message of [marginFollowUp, 'Mantén los mismos datos y recalcula con una subida del 10%.', 'Recalcula aumentando sólo la venta un 10%.']) {
    assert.equal(isLikelyFollowUp(message, marginHistory), true);
    assert.equal(domainDecision({ message, history: marginHistory }).reason, 'follow_up');
    assert.equal(conversationFocus(message, marginHistory).anchor, marginQuestion);
}
assert.match(buildPrompt({ message: marginFollowUp, history: marginHistory }).prompt, /39\.24 MXN\/kg/);
assert.match(retrievalQuestion(marginFollowUp, marginHistory, 'follow_up'), /42 MXN\/kg/);
assert.equal(domainDecision({ message: marginFollowUp, history: [] }).allowed, false);
assert.equal(domainDecision({ message: 'Mantén los supuestos anteriores y escribe un poema de amor', history: marginHistory }).allowed, false);
assert.equal(domainDecision({ message: 'Recalcula mi dosis de medicamento', history: marginHistory }).allowed, false);
const scenarioQuestion = marginQuestion + ' Caso hipotético. Usa únicamente estos supuestos; no busques precios actuales.';
const scenarioHistory = [{ role: 'user', content: scenarioQuestion }, marginHistory[1]];
for (const plan of [planQuery({ message: scenarioQuestion }), planQuery({ message: marginFollowUp, history: scenarioHistory })]) {
    assert.equal(plan.providedInputsOnly, true);
    for (const flag of ['needsLiveQuote', 'needsFxQuote', 'needsProteinPrices', 'needsLiveNews', 'requiresWebResearch', 'usesVerifiedRepository']) assert.equal(plan[flag], false);
}
assert.equal(planQuery({ message: 'Mantén el ejercicio pero consulta el precio actual del cerdo en México', history: scenarioHistory }).providedInputsOnly, false);
assert.equal(planQuery({ message: 'Precio actual del cerdo en México' }).providedInputsOnly, false);
assert.match(buildPrompt({ message: marginFollowUp, history: scenarioHistory, plan: planQuery({ message: marginFollowUp, history: scenarioHistory }) }).prompt, /máximo de 99 palabras/);
assert.equal(conversationAnchor(threadHistory), 'Compara el dólar y el euro durante 2025 en una gráfica');
assert.match(conversationInstruction('ahora hazla en tabla', threadHistory), /libra esterlina/i);
const followUpPrompt = buildPrompt({ message: 'ahora hazla en tabla', history: threadHistory });
assert.match(followUpPrompt.prompt, /MEMORIA ACTIVA DE LA CONVERSACION/);
assert.match(followUpPrompt.prompt, /Compara el dólar y el euro durante 2025/);
assert.match(followUpPrompt.prompt, /entrega el resultado ya modificado/i);
assert.match(followUpPrompt.systemInstruction, /datos que tenemos/i);
const chartFollowUp = retrievalQuestion(
    'genial ahora me puedes generar una gráfica en base a lo que te pedí',
    threadHistory,
    'follow_up',
);
assert.match(chartFollowUp, /dólar y el euro durante 2025/i);
assert.match(chartFollowUp, /libras? esterlinas?/i);
assert.match(chartFollowUp, /generar una gráfica/i);

const longHistory = Array.from({ length: 30 }, (_, index) => ({
    role: index % 2 ? 'model' : 'user',
    content: `Turno ${index + 1}`,
}));
assert.equal(chatRouter.structuredInput({ message: 'continúa', history: longHistory }).history.length, 24);
assert.equal(chatRouter.structuredInput({
    message: 'profundiza y agrega escenarios',
    history: [{ role: 'user', content: 'Analiza el mercado de maíz en México' }],
}).tier, 'pro');

console.log('Chat request contract: OK');
