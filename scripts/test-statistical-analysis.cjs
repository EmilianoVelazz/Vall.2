'use strict';

const assert = require('node:assert/strict');
const {
    wantsStatisticalAnalysis, requestedRange, requestedInstruments, ordinaryLeastSquares,
    buildStatisticalModel, mergeStatisticalEvidence, attachStatisticalModel, statisticalResponse,
} = require('../backend/ai/statistical-analysis');
const { AIOrchestrator } = require('../backend/ai/orchestrator');

assert.equal(wantsStatisticalAnalysis('Calcula una regresión lineal del maíz'), true);
assert.equal(wantsStatisticalAnalysis('Dame las noticias del día'), false);
assert.equal(requestedRange('Regresión del IPC de los últimos 3 años'), '3y');
assert.equal(requestedRange('Modelo lineal del petróleo de seis meses'), '6mo');
assert.equal(requestedRange('Dame un análisis estadístico del acero en el año 2023'), 'year:2023');
assert.deepEqual(requestedInstruments('Regresión de maíz frente a USD/MXN').map(item => item.ticker), ['ZC=F', 'USDMXN=X']);
assert.deepEqual(requestedInstruments('Dame un análisis estadístico del precio del acero').map(item => item.ticker), ['HRC=F']);
assert.deepEqual(requestedInstruments('Analiza el petróleo Brent').map(item => item.ticker), ['BZ=F']);
assert.deepEqual(requestedInstruments('Analiza la harina de soya').map(item => item.ticker), ['ZM=F']);
assert.deepEqual(requestedInstruments('Analiza el café').map(item => item.ticker), ['KC=F']);
assert.deepEqual(requestedInstruments('Calcula una regresión del ticker BHP.AX').map(item => item.ticker), ['BHP.AX']);

const rows = Array.from({ length: 12 }, (_, index) => ({ x: index + 1, y: 3 + 2 * (index + 1), date: `2026-01-${String(index + 1).padStart(2, '0')}` }));
const regression = ordinaryLeastSquares(rows);
assert.equal(regression.n, 12);
assert.equal(regression.slope, 2);
assert.equal(regression.intercept, 3);
assert.equal(regression.rSquared, 1);
assert.equal(regression.residualStdError, 0);

function yahooFixture(values) {
    const start = Date.UTC(2026, 0, 1) / 1000;
    return {
        ok: true,
        json: async () => ({ chart: { result: [{
            timestamp: values.map((_, index) => start + index * 86_400),
            indicators: { quote: [{ close: values }] },
        }] } }),
    };
}

(async () => {
    const oneSeries = await buildStatisticalModel('Calcula una regresión lineal de USD/MXN para seis meses', {
        // Yahoo puede devolver cierres 0 en días sin negociación; se excluyen
        // antes de calcular rendimientos, volatilidad y OLS.
        get: async () => yahooFixture([17, 17.2, 0, 17.4, 17.6, 17.8, 18, 18.2, 18.4, 18.6]),
    });
    assert.equal(oneSeries.kind, 'time_trend');
    assert.equal(oneSeries.regression.n, 9);
    assert.equal(oneSeries.regression.rSquared, 1);
    assert.ok(oneSeries.statistics.standardDeviation > 0);
    assert.ok(oneSeries.statistics.annualizedVolatility > 0);
    assert.equal(oneSeries.blocks.some(block => block.type === 'table'), true);
    assert.equal(oneSeries.blocks.filter(block => block.type === 'table').length, 2);
    assert.equal(oneSeries.blocks.some(block => block.type === 'formula'), true);
    assert.equal(oneSeries.blocks.some(block => block.type === 'chart'), true);

    const deterministicResponse = statisticalResponse(oneSeries);
    assert.equal(deterministicResponse.meta.statisticalModel.available, true);
    assert.equal(deterministicResponse.blocks.filter(block => block.type === 'table').length, 2);
    assert.equal(deterministicResponse.blocks.some(block => block.type === 'chart'), true);
    const unavailableResponse = statisticalResponse({ unavailable: true, reason: 'Falta el activo.' });
    assert.equal(unavailableResponse.meta.statisticalModel.available, false);
    assert.equal(unavailableResponse.blocks[0].type, 'alert');

    const australiaPork = await buildStatisticalModel('Dame un análisis estadístico sobre el precio del cerdo en el año 2023 en Australia');
    assert.equal(australiaPork.unavailable, true);
    assert.equal(australiaPork.strict, false);
    assert.match(australiaPork.reason, /australiana/i);
    const contextualResponse = { title: 'Australia 2023', summary: 'Fuentes australianas.', blocks: [{ type: 'markdown', content: 'Análisis contextual con evidencia australiana.' }], markdown: 'Análisis contextual con evidencia australiana.', meta: {} };
    attachStatisticalModel(contextualResponse, australiaPork);
    assert.equal(contextualResponse.blocks.length, 2);
    assert.equal(contextualResponse.blocks[0].type, 'alert');
    assert.equal(contextualResponse.meta.statisticalModel.strict, false);
    assert.match(contextualResponse.markdown, /evidencia australiana/i);

    const conflictingIndex = await buildStatisticalModel('Calcula una regresión lineal del ASX 200 de España en el año 2026');
    assert.equal(conflictingIndex.unavailable, true);
    assert.equal(conflictingIndex.strict, true);
    assert.match(conflictingIndex.reason, /ASX 200/i);
    assert.match(conflictingIndex.reason, /IBEX 35/i);
    const conflictResponse = statisticalResponse(conflictingIndex);
    assert.equal(conflictResponse.title, 'Consulta por confirmar');
    assert.equal(conflictResponse.summary, '');
    assert.equal(conflictResponse.blocks.length, 1);
    assert.equal(conflictResponse.blocks[0].title, 'Consulta por confirmar');

    const mexicoBeef = await buildStatisticalModel('Dame un análisis estadístico del precio físico de res en México en 2023');
    assert.equal(mexicoBeef.unavailable, true);
    assert.equal(mexicoBeef.strict, false);
    assert.match(mexicoBeef.reason, /México/i);
    assert.match(mexicoBeef.reason, /referencia internacional/i);

    const steel = await buildStatisticalModel('Dame un análisis estadístico sobre el precio del acero en el año 2023', {
        get: async () => yahooFixture([900, 920, 910, 940, 960, 950, 970, 980, 990]),
    });
    assert.equal(steel.kind, 'time_trend');
    assert.match(steel.title, /Acero laminado en caliente CME/);
    assert.equal(steel.regression.n, 9);

    let calls = 0;
    const pair = await buildStatisticalModel('Haz una regresión lineal de maíz frente a USD/MXN', {
        get: async () => {
            calls += 1;
            return yahooFixture(calls === 1
                ? [100, 102, 104, 106, 108, 110, 112, 114, 116]
                : [10, 11, 12, 13, 14, 15, 16, 17, 18]);
        },
    });
    assert.equal(pair.kind, 'pair_regression');
    assert.equal(pair.regression.n, 9);
    assert.equal(pair.regression.rSquared, 1);
    assert.match(pair.equation, /Maíz CME/);

    const evidence = mergeStatisticalEvidence({ context: 'Evidencia base', citations: [{ id: 'E1' }], sourceCodes: ['base'], evidenceCount: 2, retrievalStrategy: 'fixture' }, {
        evidence: { context: 'Modelo OLS', citations: [{ id: 'S1' }], sourceCodes: ['ols'] },
    });
    assert.match(evidence.context, /Modelo OLS/);
    assert.equal(evidence.evidenceCount, 3);
    assert.deepEqual(evidence.sourceCodes, ['ols', 'base']);

    const response = { blocks: [{ type: 'markdown', content: 'Respuesta del modelo.' }], markdown: 'Respuesta del modelo.', meta: {} };
    attachStatisticalModel(response, { unavailable: true, reason: 'Falta una serie concreta.' });
    assert.equal(response.blocks[0].type, 'alert');
    assert.equal(response.meta.statisticalModel.available, false);

    const fakeEvidence = {
        context: '[MODELO ESTADÍSTICO DETERMINISTA — OLS]\nR²: 0.81.',
        citations: [{ id: 'S1', title: 'Modelo de prueba', source: 'Fixture' }], sourceCodes: ['ols-fixture'],
    };
    const fakeModel = {
        kind: 'time_trend', source: 'Fixture', updatedAt: '2026-01-09',
        regression: { n: 9, rSquared: 0.81 }, evidence: fakeEvidence,
        blocks: [{ type: 'formula', content: 'y = 2 + 0.5 · t' }], markdown: '$$\ny = 2 + 0.5 · t\n$$',
    };
    const fakeRetriever = {
        retrieve: async () => ({
            context: '', charts: [], chartRequested: false, chartStatus: 'not_requested', citations: [], sourceCodes: [],
            retrievedChunks: 0, evidenceCount: 0, retrievalStrategy: 'fixture', retrievalLatencyMs: 0, evidenceRecords: [],
        }),
        recordQuery: async () => null,
        recordEvidence: async () => 0,
    };
    const fakeProvider = {
        name: 'fixture', isConfigured: () => true,
        generate: async () => ({ model: 'fixture', text: JSON.stringify({
            type: 'rich_response', title: 'Respuesta', summary: 'Interpretación', mode: 'technical',
            blocks: [{ type: 'markdown', content: 'Interpretación del modelo estadístico.' }],
        }) }),
    };
    const chat = new AIOrchestrator({ provider: fakeProvider, retriever: fakeRetriever, statisticsBuilder: async () => fakeModel, liveDataGrounder: async () => null });
    const result = await chat.generateStructured({ message: 'Calcula una regresión lineal del maíz' });
    assert.equal(result.response.meta.statisticalModel.kind, 'time_trend');
    assert.equal(result.response.meta.citations[0].id, 'S1');
    assert.equal(result.response.blocks[0].type, 'formula');

    console.log('Statistical analysis tests: OK');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
