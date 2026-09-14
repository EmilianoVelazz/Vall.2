'use strict';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', 'backend', '.env'), quiet: true });
const assert = require('node:assert/strict');
const chatRouter = require('../backend/routes/chat');
const { domainDecision } = require('../backend/ai/domain-policy');
const { parseCurrencyConversion, parseCurrencyPair, calculateConversion, conversionContext, isSimpleCurrencyConversion, conversionAnswer } = require('../backend/ai/currency-converter');
const { planQuery, planContext, mergeEvidence } = require('../backend/ai/query-planner');
const { rulesForMessage } = require('../backend/ai/live-data-grounder');
const { auditResponse, appendDisclosure } = require('../backend/ai/response-quality');

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
assert.match(appendDisclosure('El precio actual es 100.', unavailableAudit), /Dato actual sin confirmar/);

const liveConfig = chatRouter.liveSessionConfig();
assert.deepEqual(liveConfig.responseModalities, ['AUDIO']);
assert.deepEqual(liveConfig.inputAudioTranscription, {});
assert.deepEqual(liveConfig.outputAudioTranscription, {});
assert.match(liveConfig.systemInstruction, /español de México/i);
assert.ok(liveConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName);
assert.ok(liveConfig.thinkingConfig.thinkingLevel === 'minimal' || liveConfig.thinkingConfig.thinkingBudget === 0);
assert.equal(liveConfig.realtimeInputConfig.automaticActivityDetection.silenceDurationMs, 350);
assert.equal(liveConfig.realtimeInputConfig.activityHandling, 'START_OF_ACTIVITY_INTERRUPTS');
assert.match(liveConfig.systemInstruction, /ALCANCE OBLIGATORIO DE VALLNEWS/);
assert.match(liveConfig.systemInstruction, /Solo puedo ayudarte con información y herramientas de VALLNews/);
assert.match(liveConfig.systemInstruction, /juego de roles/);
assert.match(chatRouter.LIVE_MODEL, /^gemini-/);
assert.match(chatRouter.liveFxInstruction({ rate: 16.89, source: 'Prueba', updatedAt: null }), /1 USD = 16\.89 MXN/);
assert.match(chatRouter.liveFxInstruction(null), /no inventes/i);

console.log('Chat request contract: OK');
