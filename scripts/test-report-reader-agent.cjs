'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'report-reader-agent-test-fixture-32-bytes';
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const { ReportReaderAgent } = require('../backend/ai/report-reader-agent');
const { createReportReaderRouter } = require('../backend/routes/report-reader');

const sampleFinanceReport = {
    key: 'bonds',
    collection: 'finance',
    title: 'Bonos y tasas',
    eyebrow: 'Curva soberana y fondeo',
    generatedAt: '2026-11-17T18:00:00Z',
    summary: 'El Treasury 10Y cerró en 4.25% (+0.05 p.p.) y CETES 28d en 10.25%.',
    metrics: [
        { label: 'Treasury 10Y', value: '4.25%', change: '+0.05 p.p.', date: '2026-11-17' },
        { label: 'CETES 28d', value: '10.25%', change: '0.00 p.p.', date: '2026-11-17' },
    ],
    tables: [{
        title: 'Tasas soberanas principales',
        columns: ['Instrumento', 'Nivel actual', 'Cambio diario'],
        rows: [
            ['Treasury 10Y', '4.25%', '+0.05 p.p.'],
            ['CETES 28d', '10.25%', '0.00 p.p.'],
        ],
    }],
    sourceSnapshot: {
        bonds: [{
            id: 'TNX',
            label: 'Treasury 10Y',
            market: 'Estados Unidos',
            currency: 'USD',
            tenorLabel: '10 años',
            tenorYears: 10,
            cadence: 'daily',
            basis: 'yield',
            source: 'Yahoo Finance',
            url: 'https://finance.yahoo.com/quote/%5ETNX',
            value: 4.25,
            previous: 4.2,
            delta: 0.05,
            quoteStatus: 'observed',
            series: [{ date: '2026-11-14', value: 4.2 }, { date: '2026-11-17', value: 4.25 }],
        }],
    },
    sections: [
        { heading: 'Resumen de tasas', text: 'Los rendimientos soberanos cerraron en 4.25% para Treasury 10Y.' },
    ],
    takeaways: ['Treasury 10Y cerró en 4.25% (+0.05 p.p.).'],
    watchlist: ['Vigilar próxima decisión de política monetaria.'],
    sources: ['Banxico · Yahoo Finance'],
    sourceLinks: [{ label: 'Banxico', url: 'https://www.banxico.org.mx/' }],
};

const stores = {
    finance: { load: async () => ({ generatedAt: '2026-11-17T18:00:00Z', persistence: 'supabase-service-role', reports: [sampleFinanceReport] }) },
    markets: { load: async () => ({ generatedAt: '2026-11-17T18:00:00Z', persistence: 'supabase-service-role', reports: [] }) },
    mexico: { get: async () => ({ generatedAt: '2026-11-17T18:00:00Z', persistence: 'disk', reports: [] }) },
    history: { get: async id => id === 'a'.repeat(64) ? { id, collection: 'finance', report: sampleFinanceReport } : null },
    user: { get: async (owner, id) => owner === 'reader@example.invalid' && id === 'custom-1' ? { ...sampleFinanceReport, title: 'Mi edición privada' } : null },
};

async function main() {
    // 1. Lectura determinista + catálogo sin IA
    const offlineAgent = new ReportReaderAgent({ provider: { isConfigured: () => false }, stores });
    const catalog = await offlineAgent.catalog();
    assert(catalog.collections.find(c => c.collection === 'finance').reports[0].hasData);
    assert.equal(catalog.collections.find(c => c.collection === 'finance').reports[0].tablesCount, 1);

    const direct = await offlineAgent.read({ collection: 'finance', key: 'bonds', question: '¿En cuánto cerró el Treasury 10Y?' });
    assert.equal(direct.hasData, true);
    assert.equal(direct.reading.mode, 'deterministic');
    assert(direct.reading.keyPoints.some(p => p.includes('4.25')));

    // 2. Guardia anti-alucinación: rechaza cifras inventadas por el modelo
    const hallucinatingAgent = new ReportReaderAgent({
        provider: {
            isConfigured: () => true,
            generate: async () => ({
                model: 'fixture-gemini',
                text: JSON.stringify({
                    headline: 'Lectura de tasas',
                    answer: 'El Treasury subió a 99.99% según estimación.',
                    keyPoints: ['Nivel proyectado de 99.99%.'],
                    missingData: [],
                }),
            }),
        },
        stores,
    });
    const guarded = await hallucinatingAgent.read({ collection: 'finance', key: 'bonds', question: '¿Cuál es el nivel del Treasury?' });
    assert.equal(guarded.reading.mode, 'deterministic');
    assert.equal(guarded.reading.validationFallback, 'UNSUPPORTED_NUMBERS');
    assert(!JSON.stringify(guarded.reading).includes('99.99'));

    // 3. Respuesta válida con IA cuando conserva cifras literales
    const validAgent = new ReportReaderAgent({
        provider: {
            isConfigured: () => true,
            generate: async () => ({
                model: 'gemini-3.8-flash',
                text: JSON.stringify({
                    headline: 'Cierre de Treasury 10Y en 4.25%',
                    answer: 'De acuerdo con el informe de Bonos del 2026-11-17, el Treasury 10Y cerró en 4.25% (+0.05 p.p.).',
                    keyPoints: ['Treasury 10Y: 4.25% (+0.05 p.p.).'],
                    missingData: [],
                }),
            }),
        },
        stores,
    });
    const aiResult = await validAgent.read({ collection: 'finance', key: 'bonds', question: '¿Cómo cerró el Treasury 10Y?' });
    assert.equal(aiResult.reading.mode, 'ai');
    assert.equal(aiResult.reading.model, 'gemini-3.8-flash');

    // 4. Router HTTP: auth, validación de parámetros y aislamiento por cuenta
    const authenticate = (req, res, next) => {
        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'No autenticado' });
        req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
        next();
    };
    const app = express();
    app.use('/api', createReportReaderRouter({ agent: validAgent, authenticate }));
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try {
        const base = `http://127.0.0.1:${server.address().port}/api`;
        assert.equal((await fetch(`${base}/report-reader/catalog`)).status, 401);

        const readerToken = jwt.sign({ sub: 'u1', email: 'reader@example.invalid', role: 'user' }, process.env.JWT_SECRET);
        const otherToken = jwt.sign({ sub: 'u2', email: 'other@example.invalid', role: 'user' }, process.env.JWT_SECRET);

        const catRes = await fetch(`${base}/report-reader/catalog`, { headers: { Authorization: `Bearer ${readerToken}` } });
        assert.equal(catRes.status, 200);

        const badRes = await fetch(`${base}/report-reader/read`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${readerToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ collection: 'invalid', key: 'bonds' }),
        });
        assert.equal(badRes.status, 400);

        const readRes = await fetch(`${base}/report-reader/read`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${readerToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ collection: 'finance', key: 'bonds', question: '¿Cómo cerró el Treasury 10Y?' }),
        });
        assert.equal(readRes.status, 200);
        const readJson = await readRes.json();
        assert.equal(readJson.reading.mode, 'ai');

        const isolated = await fetch(`${base}/report-reader/read`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${otherToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ userReportId: 'custom-1' }),
        });
        assert.equal(isolated.status, 404);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }

    // 5. Integración con ORION (query-planner + MCP report_reader + AIOrchestrator)
    const { planQuery } = require('../backend/ai/query-planner');
    const { AIOrchestrator } = require('../backend/ai/orchestrator');

    assert.equal(planQuery({ message: 'Resume el informe de bonos de finanzas' }).needsExecutiveReport, true);
    assert.deepEqual(ReportReaderAgent.matchTargets('¿Qué dice el informe de bonos?'), [{ collection: 'finance', key: 'bonds' }]);

    const queryDigest = await validAgent.forQuery({ message: '¿Qué dice el informe de bonos de finanzas?' });
    assert.equal(queryDigest.available, true);
    assert(queryDigest.context.includes('[LECTURA DE INFORMES EJECUTIVOS · REPORT READER]'));
    assert(queryDigest.context.includes('4.25%'));
    assert(queryDigest.citations.some(c => c.type === 'executive_report_source'));

    let capturedPrompt = '';
    const mockOrchestratorProvider = {
        name: 'mock',
        isConfigured: () => true,
        tierForModel: () => 'flash',
        modelForTier: () => 'mock-flash',
        generate: async ({ prompt }) => {
            capturedPrompt = prompt;
            return {
                model: 'mock-flash',
                text: JSON.stringify({
                    type: 'rich_response',
                    title: 'Informe de bonos',
                    summary: 'Según el informe de Bonos del corte vigente, el Treasury 10Y cerró en 4.25% (+0.05 p.p.).',
                    mode: 'executive',
                    blocks: [{ type: 'text', content: 'El corte de Bonos reporta Treasury 10Y en 4.25% (+0.05 p.p.).' }],
                }),
            };
        },
        stream: async ({ prompt, onText }) => {
            capturedPrompt = prompt;
            const text = 'Según el informe de Bonos, el Treasury 10Y cerró en 4.25%.';
            onText?.(text, text);
            return { model: 'mock-flash', text };
        },
    };
    const orchestrator = new AIOrchestrator({
        provider: mockOrchestratorProvider,
        retriever: {
            retrieve: async () => ({ context: '', citations: [], sourceCodes: [], retrievedChunks: 0, evidenceCount: 0, retrievalStrategy: 'mock', evidenceRecords: [] }),
            recordQuery: async () => null,
            recordEvidence: async () => {},
        },
        liveDataGrounder: async () => ({ context: '', citations: [], sourceCodes: [], available: false, warnings: [], strategy: 'mock' }),
        reportReader: validAgent,
    });
    const orionResult = await orchestrator.generateStructured({ message: '¿Qué dice el informe de bonos de finanzas?' });
    assert(capturedPrompt.includes('[LECTURA DE INFORMES EJECUTIVOS · REPORT READER]'));
    assert(capturedPrompt.includes('4.25%'));
    assert(orionResult.response.meta.toolExecution.tools.some(t => t.tool === 'report_reader' && t.status === 'completed'));

    // 6. Integración con ORION streaming (SSE) + cancelación por AbortSignal
    let streamedChunks = 0;
    capturedPrompt = '';
    const streamResult = await orchestrator.stream({
        message: 'Lee el informe de bonos de finanzas',
        onText: () => { streamedChunks++; },
    });
    assert(capturedPrompt.includes('[LECTURA DE INFORMES EJECUTIVOS · REPORT READER]'));
    assert(streamedChunks >= 1);
    assert(streamResult.response.meta.toolExecution.tools.some(t => t.tool === 'report_reader' && t.status === 'completed'));

    const abortController = new AbortController();
    abortController.abort();
    await assert.rejects(() => orchestrator.stream({
        message: 'Lee el informe de bonos de finanzas',
        signal: abortController.signal,
    }));

    console.log('ReportReaderAgent: OK · catálogo, lectura determinista, guardia anti-alucinación, IA, auth, aislamiento y ORION MCP (structured + stream + abort) verificados.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
