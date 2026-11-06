'use strict';
const assert = require('node:assert/strict');
const { createOrionMcpSession, MAX_RESULT_BYTES } = require('../backend/ai/mcp-tools');
const { AIOrchestrator } = require('../backend/ai/orchestrator');
const { planQuery } = require('../backend/ai/query-planner');

async function sessionTest(handlers, run, options) {
    const session = await createOrionMcpSession(handlers, options);
    try { await run(session); } finally { await session.close(); }
}

async function main() {
    let calls = 0;
    await sessionTest({ market_research: async () => { calls++; return { available: true, citations: [{ date: '2026-10-01', url: 'https://example.org/report' }] }; } }, async session => {
        assert.equal(session.client.getServerVersion().name, 'orion-intelligence');
        assert.equal(session.client.getNegotiatedProtocolVersion(), '2026-07-28');
        assert.deepEqual(session.catalog.tools.map(tool => tool.name), ['market_research']);
        assert.equal(session.catalog.tools[0].annotations.readOnlyHint, true);
        const injected = await session.client.callTool({ name: 'market_research', arguments: { userKeyHash: 'another-user', url: 'http://127.0.0.1/admin' } });
        assert(injected.isError);
        assert.equal(calls, 0, 'No consulta un proveedor con parámetros fuera del esquema');
        await assert.rejects(session.call('delete_file'), error => error.code === 'MCP_TOOL_DENIED');
        await assert.rejects(session.client.callTool({ name: 'delete_file', arguments: {} }), error => error.code === -32602);
        assert.equal((await session.call('market_research')).available, true);
        assert.equal(calls, 1);
        assert.equal(session.trace.at(-1).status, 'completed');
    });
    await assert.rejects(createOrionMcpSession({ shell: async () => null }), TypeError);
    await sessionTest({ forecast_analysis: async () => { throw Error('https://secret.invalid/?token=private'); } }, async session => {
        assert.equal(session.catalog.tools[0].annotations.readOnlyHint, false, 'El seguimiento estadístico declara su escritura interna');
        const result = await session.client.callTool({ name: 'forecast_analysis', arguments: {} });
        assert(result.isError);
        assert.doesNotMatch(JSON.stringify(result), /secret|private/);
    });
    await sessionTest({ market_research: async () => 'x'.repeat(MAX_RESULT_BYTES) }, async session => {
        await assert.rejects(session.call('market_research'), error => error.code === 'MCP_RESULT_TOO_LARGE');
    });
    let cancelled = false;
    await sessionTest({ market_research: ({ signal }) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => { cancelled = true; reject(Error('aborted')); }, { once: true });
    }) }, async session => {
        await assert.rejects(session.call('market_research'), error => error.code === 'MCP_TIMEOUT');
        assert(cancelled, 'El límite cancela el trabajo que admite AbortSignal');
        assert.equal(session.trace[0].status, 'timeout');
    }, { timeoutMs: 30 });
    const controller = new AbortController();
    await sessionTest({ market_research: ({ signal }) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(Error('aborted')), { once: true });
    }) }, async session => {
        const call = session.call('market_research');
        setTimeout(() => controller.abort(), 20);
        await assert.rejects(call);
    }, { signal: controller.signal });

    let started = 0, release;
    const barrier = new Promise(resolve => { release = resolve; });
    await sessionTest({ market_research: async () => { started++; await barrier; return { available: true }; } }, async session => {
        const pending = Array.from({ length: 20 }, () => session.call('market_research'));
        try {
            const deadline = Date.now() + 2000;
            while (started < 20 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
            assert.equal(started, 20);
            await assert.rejects(session.call('market_research'), error => error.code === 'MCP_BUSY');
        } finally { release(); await Promise.all(pending); }
        assert.equal((await session.call('market_research')).available, true, 'Recupera capacidad al terminar el trabajo');
    });

    // Same orchestrator, simultaneous turns. The authenticated identity is
    // closed over by each MCP server, and is never supplied in tool arguments.
    const empty = { context: '', citations: [], sourceCodes: [], evidenceCount: 0 };
    const orchestrator = new AIOrchestrator({ provider: {}, retriever: {
        retrieve: async (query, identity) => ({ ...empty, context: `${identity}:${query}` }),
    }, liveDataGrounder: async () => { throw Error('upstream unavailable'); } });
    const plan = planQuery({ message: 'Cotización actual del dólar USD/MXN' });
    const [first, second] = await Promise.all(['account-a', 'account-b'].map(userKeyHash => orchestrator.collectEvidence({
        plan, retrievalQuery: 'USD/MXN', userKeyHash, directConversion: null,
    })));
    assert.equal(first.values[0].context, 'account-a:USD/MXN');
    assert.equal(second.values[0].context, 'account-b:USD/MXN');
    assert.equal(first.values[2].available, false, 'Una falla no se presenta como un dato verificado');
    assert.equal(first.execution.status, 'partial');
    assert(first.execution.tools.some(tool => tool.tool === 'knowledge_search' && tool.status === 'completed'));
    assert(first.execution.tools.some(tool => tool.tool === 'market_research' && tool.status === 'failed'));
    console.log('ORION MCP: protocolo 2026-07-28, descubrimiento, ejecución, aislamiento, esquemas, límites, cancelación y fallo parcial OK');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
