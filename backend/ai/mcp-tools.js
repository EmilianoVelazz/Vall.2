'use strict';

const { McpServer, createMcpHandler } = require('@modelcontextprotocol/server');
const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client');
const z = require('zod/v4');

const MAX_RESULT_BYTES = 2 * 1024 * 1024;
const MAX_ACTIVE = 20;
let active = 0;
const DEFINITIONS = Object.freeze({
    knowledge_search: ['Buscar evidencia del repositorio autorizado para esta consulta.', true],
    market_research: ['Consultar fuentes públicas, precios y documentos del mercado solicitado.', true],
    statistical_analysis: ['Calcular estadísticas con series verificadas para esta consulta.', true],
    forecast_analysis: ['Evaluar un pronóstico temporal y registrar su estimación original para seguimiento.', false],
    commercial_margin: ['Calcular margen con los datos comerciales explícitos de esta consulta.', true],
});

function failure(code) {
    return { isError: true, content: [{ type: 'text', text: code }], structuredContent: { code } };
}

// Each server belongs to one authorized turn. Inputs and identity are bound by
// the orchestrator, never accepted from a tool argument or a retrieved document.
// The transport runs real MCP discovery/calls over fetch without opening a port.
async function createOrionMcpSession(handlers, { signal, timeoutMs = 12_000 } = {}) {
    for (const [name, execute] of Object.entries(handlers)) {
        if (!DEFINITIONS[name] || typeof execute !== 'function') throw new TypeError('Herramienta MCP no permitida.');
    }
    const trace = [];
    const handler = createMcpHandler(() => {
        const server = new McpServer({ name: 'orion-intelligence', version: '1.0.0' });
        for (const [name, execute] of Object.entries(handlers)) {
            const [description, readOnlyHint] = DEFINITIONS[name];
            server.registerTool(name, { description, inputSchema: z.object({}).strict(),
                annotations: { readOnlyHint, destructiveHint: false, idempotentHint: true, openWorldHint: name !== 'commercial_margin' } },
            async (_input, context) => {
                const started = Date.now();
                const entry = { tool: name, status: 'pending' };
                trace.push(entry);
                const controller = new AbortController();
                const requestSignal = AbortSignal.any([controller.signal, context.mcpReq.signal, ...(signal ? [signal] : [])]);
                let timer;
                try {
                    requestSignal.throwIfAborted();
                    if (active >= MAX_ACTIVE) { entry.status = 'busy'; return failure('MCP_BUSY'); }
                    active++;
                    // Keep the slot until the upstream actually settles, even
                    // if it ignores cancellation. Timeouts cannot spawn unbounded work.
                    const work = Promise.resolve().then(() => {
                        requestSignal.throwIfAborted();
                        return execute({ signal: requestSignal });
                    }).finally(() => { active--; });
                    const value = await Promise.race([work, new Promise((_, reject) => {
                        const abort = () => reject(Object.assign(new Error('Consulta cancelada.'), { code: 'MCP_CANCELLED' }));
                        requestSignal.addEventListener('abort', abort, { once: true });
                        work.finally(() => requestSignal.removeEventListener('abort', abort)).catch(() => {});
                        timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('Tiempo agotado.'), { code: 'MCP_TIMEOUT' })); }, timeoutMs);
                    })]);
                    requestSignal.throwIfAborted();
                    const json = JSON.stringify({ data: value ?? null });
                    if (Buffer.byteLength(json) > MAX_RESULT_BYTES) { entry.status = 'oversized'; return failure('MCP_RESULT_TOO_LARGE'); }
                    entry.status = 'completed';
                    return { content: [{ type: 'text', text: json }], structuredContent: JSON.parse(json) };
                } catch (error) {
                    entry.status = signal?.aborted ? 'cancelled' : requestSignal.aborted ? 'timeout' : 'failed';
                    // Provider errors can contain URLs or credentials. They are
                    // not forwarded to the model, UI, or protocol client.
                    return failure(entry.status === 'timeout' ? 'MCP_TIMEOUT' : entry.status === 'cancelled' ? 'MCP_CANCELLED' : error.code === 'MCP_CANCELLED' ? 'MCP_CANCELLED' : 'MCP_TOOL_FAILED');
                } finally {
                    clearTimeout(timer);
                    entry.latencyMs = Date.now() - started;
                }
            });
        }
        return server;
    });
    const client = new Client({ name: 'orion-chat', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
    const transport = new StreamableHTTPClientTransport(new URL('http://orion.internal/mcp'), {
        fetch: (url, init) => handler.fetch(new Request(url, init)),
    });
    try {
        await client.connect(transport, { signal, timeout: 2000 });
        const catalog = await client.listTools({}, { signal, timeout: 2000 });
        const allowed = new Set(catalog.tools.map(tool => tool.name));
        return { client, catalog, trace, protocolVersion: client.getNegotiatedProtocolVersion(),
            async call(name) {
                if (!allowed.has(name)) throw Object.assign(new Error('Herramienta no autorizada.'), { code: 'MCP_TOOL_DENIED' });
                const result = await client.callTool({ name, arguments: {} }, { signal, timeout: timeoutMs + 1000 });
                if (result.isError) throw Object.assign(new Error('La herramienta no completó la consulta.'), { code: result.structuredContent?.code || 'MCP_TOOL_FAILED' });
                return result.structuredContent.data;
            },
            async close() { await client.close().finally(() => handler.close()); },
        };
    } catch (error) {
        await client.close().catch(() => {});
        await handler.close().catch(() => {});
        throw error;
    }
}

module.exports = { createOrionMcpSession, DEFINITIONS, MAX_RESULT_BYTES };
