'use strict';
const assert = require('node:assert/strict');
const { GeminiProvider, PRO_FALLBACKS, normalizeProviderError } = require('../backend/ai/providers/gemini-provider');
const { AIOrchestrator } = require('../backend/ai/orchestrator');
const { buildPrompt } = require('../backend/ai/prompt-builder');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function provider(models, calls = []) {
    const ai = new GeminiProvider('fixture-only-key');
    ai.client = { models: Object.fromEntries(Object.entries(models).map(([key, run]) => [key, async request => { calls.push(request); return run(request); }])) };
    return ai;
}
(async () => {
    for(const method of ['generate','stream']) {
        let attempts=0;
        const result={text:'Respaldo disponible',candidates:[{finishReason:'STOP'}]};
        const generator=()=>{attempts++;return attempts===1 ? new Promise(()=>{}) : Promise.resolve(result);};
        const recovery=provider({generateContent:generator,generateContentStream:async()=>{const value=await generator();return {[Symbol.asyncIterator]:async function*(){yield value;}};}},[]);
        const answer=await recovery[method]({prompt:'Prueba',timeoutMs:500});
        assert.equal(answer.text,'Respaldo disponible','Un modelo bloqueado deja tiempo real para el respaldo');
        assert.equal(attempts,2);
    }
    const businessPrompt = buildPrompt({ message: 'Cómo afectan los granos a mi negocio de proteínas' });
    assert(businessPrompt.systemInstruction.includes('Una variación histórica de un insumo no demuestra'));
    assert(businessPrompt.systemInstruction.includes('costo por unidad nutricional'));
    const attempts = [];
    const fallback = provider({ generateContent: async () => attempts.length === 1 ? { text: '' } : { text: 'Completa', candidates: [{ finishReason: 'STOP' }] } }, attempts);
    assert.equal((await fallback.generate({ prompt: 'Prueba', tier: 'pro' })).text, 'Completa');
    assert.equal(attempts.length, 2);
    assert.equal(attempts[1].model, PRO_FALLBACKS[0]);
    assert.equal(fallback.tierForModel(attempts[1].model), 'pro', 'El respaldo Pro conserva su nivel');
    assert(attempts[0].config.abortSignal instanceof AbortSignal);

    const cutoffCalls = [];
    const cutoff = provider({ generateContent: async () => cutoffCalls.length === 1 ? { text: 'JSON cortado', candidates: [{ finishReason: 'MAX_TOKENS' }] } : { text: '{"valid":true}', candidates: [{ finishReason: 'STOP' }] } }, cutoffCalls);
    assert.equal((await cutoff.generate({ prompt: 'Prueba', json: true })).text, '{"valid":true}');
    assert.equal(cutoffCalls.length, 2, 'No devuelve como completo un documento cortado');

    for (const response of [{ text: '', promptFeedback: { blockReason: 'SAFETY' } }, { text: 'bloqueado', candidates: [{ finishReason: 'SAFETY' }] }]) {
        const calls = [], safety = provider({ generateContent: async () => response }, calls);
        await assert.rejects(safety.generate({ prompt: 'Prueba' }), error => error.code === 'AI_SAFETY');
        assert.equal(calls.length, 1, 'No cambia de modelo para eludir un bloqueo');
    }
    for (const [status, expected] of [[401, 'AI_AUTH'], [403, 'AI_AUTH'], [429, 'AI_RATE_LIMIT'], [504, 'AI_TIMEOUT']]) assert.equal(normalizeProviderError({ status, message: 'Fallo' }).code, expected);
    const unauthorizedCalls = [], unauthorized = provider({ generateContent: async () => { throw { status: 403, message: 'denied' }; } }, unauthorizedCalls);
    await assert.rejects(unauthorized.generate({ prompt: 'Prueba' }), error => error.code === 'AI_AUTH');
    assert.equal(unauthorizedCalls.length, 1);

    const stalledCalls = [], stalled = provider({ generateContent: () => new Promise(() => {}) }, stalledCalls);
    let start = Date.now();
    await assert.rejects(stalled.generate({ prompt: 'Prueba', timeoutMs: 45 }), error => error.code === 'AI_TIMEOUT');
    assert(Date.now() - start < 1000, 'El plazo funciona aunque el SDK ignore la cancelación');
    assert(stalledCalls[0].config.abortSignal.aborted);
    const totalCalls = [], slowFailures = provider({ generateContent: async () => { await delay(28); throw new Error('Proveedor sin conexión'); } }, totalCalls);
    start = Date.now();
    await assert.rejects(slowFailures.generate({ prompt: 'Prueba', tier: 'pro', timeoutMs: 45 }), error => error.code === 'AI_TIMEOUT');
    assert(Date.now() - start < 1000);
    assert(totalCalls.length <= 2, 'Los respaldos comparten un mismo plazo');

    const controller = new AbortController();
    const stoppedCalls = [], stopped = provider({ generateContent: () => new Promise(() => {}) }, stoppedCalls);
    const pending = stopped.generate({ prompt: 'Prueba', signal: controller.signal });
    await delay(5); controller.abort();
    await assert.rejects(pending, error => error.code === 'AI_TIMEOUT' && error.cancelled);
    assert(stoppedCalls[0].config.abortSignal.aborted);
    const alreadyCancelled = new AbortController(); alreadyCancelled.abort();
    await assert.rejects(stopped.generate({ prompt: 'Prueba', signal: alreadyCancelled.signal }));
    assert.equal(stoppedCalls.length, 1, 'Una solicitud cancelada no llama al SDK');

    const streamCalls = [], visible = [];
    const streaming = provider({ generateContentStream: async () => ({ [Symbol.asyncIterator]() { let first = true; return {
        next() { if (first) { first = false; return Promise.resolve({ done: false, value: { text: 'Primera parte' } }); } return new Promise(() => {}); },
        return() { return new Promise(() => {}); },
    }; } }) }, streamCalls);
    start = Date.now();
    await assert.rejects(streaming.stream({ prompt: 'Prueba', timeoutMs: 45, onText: part => visible.push(part) }), error => error.code === 'AI_TIMEOUT');
    assert(Date.now() - start < 1000);
    assert.deepEqual(visible, ['Primera parte']);
    assert.equal(streamCalls.length, 1, 'No mezcla un respaldo con fragmentos ya entregados');
    const truncated = provider({ generateContentStream: async () => (async function* () { yield { text: 'Incompleta', candidates: [{ finishReason: 'MAX_TOKENS' }] }; })() });
    await assert.rejects(truncated.stream({ prompt: 'Prueba' }), error => error.code === 'AI_INCOMPLETE_RESPONSE');

    const empty = { context: '', citations: [], sourceCodes: [], charts: [], evidenceRecords: [], evidenceCount: 0 };
    const captured = [];
    const chat = new AIOrchestrator({ provider: { name: 'fixture', isConfigured: () => true,
        generate: async input => { captured.push(input); return { model: 'fixture-pro', text: JSON.stringify({ type: 'rich_response', title: 'Comparación', summary: 'Distintos riesgos', blocks: [{ type: 'text', content: 'Los bonos y las acciones tienen riesgos distintos.' }] }) }; } },
        retriever: { retrieve: async () => empty, recordQuery: async () => null, recordEvidence: async () => null },
        liveDataGrounder: async () => empty, statisticsBuilder: async () => null, forecastBuilder: async () => null });
    const signal = new AbortController().signal;
    const result = await chat.generateStructured({ message: 'Explica diferencias entre bonos y acciones', tier: 'pro', signal });
    assert(result.text);
    assert.equal(captured.length, 1, 'La respuesta estructurada tampoco genera un borrador oculto');
    assert.equal(captured[0].signal, signal);
    assert(!captured[0].prompt.includes('REGLAS NEURONALES APRENDIDAS AUTÓNOMAMENTE'));
    const pro = new AIOrchestrator({ provider: fallback });
    assert.equal((await pro.generateWithFallback({ prompt: 'Prueba' }, 'pro')).tier, 'pro');
    console.log('Gemini reliability: OK · calidad, plazos, cuota, autorización, cancelación, fragmentos y recuperación de un modelo bloqueado en ambos modos; sin llamadas reales');
})().catch(error => { console.error(error); process.exitCode = 1; });
