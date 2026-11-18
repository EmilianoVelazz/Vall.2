'use strict';

const assert = require('node:assert/strict');
const { GeminiProvider, MODELS, PRO_FALLBACKS, googleSearchTools } = require('../backend/ai/providers/gemini-provider');
const { AIOrchestrator } = require('../backend/ai/orchestrator');
const { getChatReasoningContext } = require('../backend/ai/loopus-knowledge');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    // 1. Validación de adaptación de thinkingLevel cuando Google Search está activo en Cirius y Pulsar
    const probe = new GeminiProvider('fixture-key');
    const ciriusNoTools = probe.requestConfig({
        systemInstruction: 'sys',
        tier: 'flash',
        model: MODELS.flash,
        modelProfile: 'cirius',
        tools: null,
        timeoutMs: 30000,
    });
    assert.deepEqual(ciriusNoTools.thinkingConfig, { thinkingLevel: 'medium' }, 'Cirius sin búsqueda web conserva thinkingLevel medium');

    const ciriusWithSearch = probe.requestConfig({
        systemInstruction: 'sys',
        tier: 'flash',
        model: MODELS.flash,
        modelProfile: 'cirius',
        tools: googleSearchTools(true),
        timeoutMs: 30000,
    });
    assert.deepEqual(ciriusWithSearch.thinkingConfig, { thinkingLevel: 'low' }, 'Cirius con Google Search reduce thinkingLevel a low para evitar timeouts');

    const pulsarWithSearch = probe.requestConfig({
        systemInstruction: 'sys',
        tier: 'pro',
        model: MODELS.pro,
        modelProfile: 'pulsar',
        tools: googleSearchTools(true),
        timeoutMs: 30000,
    });
    assert.deepEqual(pulsarWithSearch.thinkingConfig, { thinkingLevel: 'low' }, 'Pulsar con Google Search reduce thinkingLevel a low para evitar timeouts');

    const pro25BudgetSafe = probe.requestConfig({
        systemInstruction: 'sys',
        tier: 'pro',
        model: 'gemini-2.5-pro',
        modelProfile: 'pulsar',
        maxOutputTokens: 256,
        timeoutMs: 30000,
    });
    assert.equal(pro25BudgetSafe.thinkingConfig.thinkingBudget, 8192);
    assert(pro25BudgetSafe.maxOutputTokens >= pro25BudgetSafe.thinkingConfig.thinkingBudget + 1024, 'gemini-2.5-pro reserva tokens de salida por encima de thinkingBudget');

    // 2. Validación de recuperación en modo buffered (onText = null) cuando el primer modelo emite un fragmento interno y luego agota su plazo
    const bufferedModelsTried = [];
    const bufferedProvider = new GeminiProvider('fixture-key');
    bufferedProvider.client = {
        models: {
            generateContentStream: async request => {
                bufferedModelsTried.push(request.model);
                if (bufferedModelsTried.length === 1) {
                    return {
                        [Symbol.asyncIterator]() {
                            let step = 0;
                            return {
                                next() {
                                    step += 1;
                                    if (step === 1) {
                                        return Promise.resolve({ done: false, value: { text: 'Fragmento interno no enviado al cliente' } });
                                    }
                                    return new Promise(() => {}); // se cuelga tras el primer fragmento
                                },
                                return() { return Promise.resolve({ done: true }); },
                            };
                        },
                    };
                }
                return (async function* () {
                    yield { text: 'Respuesta completa desde modelo de respaldo.', candidates: [{ finishReason: 'STOP' }] };
                })();
            },
        },
    };
    const bufferedRecovery = await bufferedProvider.stream({
        prompt: 'Analiza USD/MXN y maíz',
        tier: 'pro',
        onText: null, // modo buffered: aún no se envió texto al navegador
        timeoutMs: 120,
    });
    assert.equal(bufferedRecovery.text, 'Respuesta completa desde modelo de respaldo.');
    assert.equal(bufferedModelsTried.length, 2, 'En modo buffered (onText=null) un corte del modelo 1 debe activar el modelo 2');
    assert.equal(bufferedModelsTried[1], PRO_FALLBACKS[0]);

    // 3. Validación de rescate al cierre (tail-timeout salvage) cuando ya se generó un análisis amplio (>= 280 chars) en presupuesto de producción
    const longAnalysis = 'Análisis verificado de mercado: el tipo de cambio USD/MXN y el contrato de maíz en CBOT inciden directamente sobre el costo de formulación de alimento balanceado y el margen porcino en pie y en canal. '.repeat(3);
    assert(longAnalysis.length >= 280);
    const salvageProvider = new GeminiProvider('fixture-key');
    salvageProvider.client = {
        models: {
            generateContentStream: async () => ({
                [Symbol.asyncIterator]() {
                    let emitted = false;
                    return {
                        next() {
                            if (!emitted) {
                                emitted = true;
                                return Promise.resolve({ done: false, value: { text: longAnalysis } });
                            }
                            const err = new Error('Deadline expired before operation could complete.');
                            err.status = 504;
                            return Promise.reject(err);
                        },
                        return() { return Promise.resolve({ done: true }); },
                    };
                },
            }),
        },
    };
    const salvaged = await salvageProvider.stream({
        prompt: 'Analiza el impacto del maíz',
        tier: 'flash',
        timeoutMs: 15_000,
    });
    assert.equal(salvaged.text, longAnalysis.trim(), 'Si un stream falla por 504 tras generar >=280 caracteres válidos, rescata la respuesta');
    assert.equal(salvaged.finishReason, 'STOP');

    // 4. Validación de respaldo en AIOrchestrator cuando Google Search grounding agota el plazo
    const emptyEvidence = {
        context: 'Evidencia local verificada de VALLNews.',
        charts: [],
        chartRequested: false,
        chartStatus: 'not_requested',
        citations: [],
        sourceCodes: ['local_verified'],
        retrievedChunks: 1,
        evidenceCount: 1,
        retrievalStrategy: 'fixture',
        retrievalLatencyMs: 1,
        evidenceRecords: [],
    };
    const orchestratorCalls = [];
    const resilientOrchestrator = new AIOrchestrator({
        retriever: {
            retrieve: async () => emptyEvidence,
            recordQuery: async () => 101,
            recordEvidence: async () => 1,
        },
        liveDataGrounder: async () => emptyEvidence,
        statisticsBuilder: async () => null,
        forecastBuilder: async () => null,
        provider: {
            name: 'gemini',
            isConfigured: () => true,
            modelForTier: t => (t === 'pro' ? MODELS.pro : MODELS.flash),
            tierForModel: m => (m === MODELS.pro ? 'pro' : 'flash'),
            stream: async req => {
                orchestratorCalls.push({ tier: req.tier, hasTools: Boolean(req.tools?.length), modelProfile: req.modelProfile });
                if (req.tools?.length) {
                    const err = new Error('La generación agotó su plazo total.');
                    err.code = 'AI_TIMEOUT';
                    err.status = 504;
                    throw err;
                }
                await delay(5);
                req.onText?.('Respuesta rápida con evidencia local verificada.', 'Respuesta rápida con evidencia local verificada.');
                return {
                    text: 'Respuesta rápida con evidencia local verificada.',
                    model: MODELS.flash,
                    finishReason: 'STOP',
                    modelFallback: true,
                };
            },
        },
    });

    const recoveredTurn = await resilientOrchestrator.stream({
        message: 'Analiza el impacto del tipo de cambio USD/MXN y el maíz en los costos de proteína en México',
        mode: 'auto',
        tier: 'pro',
        modelProfile: 'pulsar',
        onText() {},
    });
    assert(recoveredTurn.text.includes('Respuesta rápida con evidencia local verificada.'));
    assert.equal(orchestratorCalls.length, 2, 'Si el stream con Google Search agota plazo, el orquestador reintenta sin Google Search usando la evidencia local');
    assert.equal(orchestratorCalls[0].hasTools, true);
    assert.equal(orchestratorCalls[1].hasTools, false);
    assert.equal(orchestratorCalls[1].tier, 'flash');
    assert.equal(recoveredTurn.modelFallback, true);

    // 5. Validación de presupuesto compacto de contexto Loopus para no inflar la latencia del prompt
    const loopusContext = getChatReasoningContext({
        message: '¿Cómo afecta el tipo de cambio USD/MXN y el maíz CBOT al costo de alimento balanceado y margen en cerdo?',
        plan: { topic: 'markets', topics: ['fx', 'commodities'], asksDecision: true, asksComparison: true },
    });
    assert(loopusContext.includes('PROYECTO LOOPUS'));
    assert(loopusContext.length <= 2000, `El contexto de Loopus para chat debe mantenerse compacto (actual: ${loopusContext.length} chars)`);

    console.log('ORION resilience & anti-timeout validations: OK');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
