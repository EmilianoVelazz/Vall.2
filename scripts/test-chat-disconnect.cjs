'use strict';
const assert = require('node:assert/strict');
const { start } = require('./lib/security-fixture.cjs');
const { orchestrator } = require('../backend/ai/orchestrator');
const originalStream = orchestrator.stream, originalConfigured = orchestrator.isConfigured;
let started, aborted;
const began = new Promise(resolve => { started = resolve; });
const cancelled = new Promise(resolve => { aborted = resolve; });
orchestrator.isConfigured = () => true;
orchestrator.stream = input => new Promise((_, reject) => {
    assert(input.signal instanceof AbortSignal);
    started();
    input.signal.addEventListener('abort', () => { aborted(); reject(Object.assign(new Error('Cancelado'), { code: 'AI_TIMEOUT', cancelled: true })); }, { once: true });
});
(async () => {
    const fixture = await start();
    try {
        const controller = new AbortController();
        const response = await fetch(fixture.url + '/api/ai-insight-stream', { method: 'POST', signal: controller.signal,
            headers: { Authorization: fixture.authorization(), 'Content-Type': 'application/json', Origin: 'https://app.example.test' },
            body: JSON.stringify({ message: 'Explica qué es un bono soberano', tier: 'flash' }) });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /event-stream/);
        await Promise.race([began, new Promise((_, reject) => setTimeout(() => reject(new Error('No inició la generación')), 2000))]);
        controller.abort();
        await Promise.race([cancelled, new Promise((_, reject) => setTimeout(() => reject(new Error('Cerrar el chat no canceló la generación')), 2000))]);
        console.log('Chat disconnect: OK · HTTP y SSE reales, cancelar navegador propaga señal al proveedor, sin inferencia ni persistencia reales');
    } finally { await fixture.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    orchestrator.stream = originalStream; orchestrator.isConfigured = originalConfigured;
});