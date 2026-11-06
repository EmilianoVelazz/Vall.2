'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const espree = require('espree');
const { fitAutoregressive, trainAndAssess, walkForwardEvaluation } = require('../backend/ml/autoregressive-forecast');
const { forecastRequest, buildAnswerStrategy } = require('../backend/ai/answer-strategy');
const { buildForecastAnalysis, loadForecast, attachForecastAnalysis, guardForecastAnswer } = require('../backend/ai/forecast-analysis');
const { planQuery } = require('../backend/ai/query-planner');
const { buildPrompt } = require('../backend/ai/prompt-builder');
const { markdownToRichResponse } = require('../backend/ai/response-schema');
const { AIOrchestrator, attachEvidence } = require('../backend/ai/orchestrator');

const now = Date.parse('2026-10-06T18:00:00Z');
const DAY = 86_400_000;
const seasonal = Array.from({ length: 110 }, (_, i) => 100 + i * .4 + [0, 5, 9, 6, 0, -5, -8, -5][i % 8]);
const instrument = { ticker: 'TSN', name: 'Tyson Foods', unit: 'USD' };

function payload({ values = seasonal, end = now - DAY, adjusted = true, meta = {} } = {}) {
    return { ok: true, json: async () => ({ chart: { result: [{
        timestamp: values.map((_, i) => (end - (values.length - 1 - i) * DAY) / 1000),
        meta: { currency: 'USD', ...meta },
        indicators: { quote: [{ close: values }], ...(adjusted ? { adjclose: [{ adjclose: values }] } : {}) },
    }] } }) };
}

function checkTemporalEvaluation(horizon) {
    const measured = walkForwardEvaluation(seasonal, { horizon });
    const end = seasonal.length - horizon + 1;
    const errors = [], reference = [];
    for (let origin = end - 24; origin < end; origin++) {
        // La prueba reproduce cada origen con su prefijo, sin entregar al
        // ajuste ninguna observación del horizonte que está evaluando.
        const model = fitAutoregressive(seasonal.slice(0, origin));
        errors.push(Math.abs(seasonal[origin + horizon - 1] - model.predictSteps(horizon)));
        reference.push(Math.abs(seasonal[origin + horizon - 1] - seasonal[origin - 1]));
    }
    assert.equal(measured.horizon, horizon);
    assert.equal(measured.modelMae, errors.reduce((a, b) => a + b, 0) / errors.length);
    assert.equal(measured.baselineMae, reference.reduce((a, b) => a + b, 0) / reference.length);
    const result = trainAndAssess(seasonal, { horizon });
    assert.equal(result.eligible, measured.improvement >= .02);
    if (result.eligible) {
        assert.equal(result.forecast.horizon, horizon);
        assert(Math.abs(result.forecast.upperBound - result.forecast.value - measured.errorRange) < 1e-10);
        assert.equal(result.forecast.probabilityUp, null);
    }
}

function checkFollowUpRendering(strategy) {
    const source = fs.readFileSync('assets/js/vall-ai-page-v4.js', 'utf8');
    const tree = espree.parse(source, { ecmaVersion: 'latest', range: true });
    const functions = [];
    function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'FunctionDeclaration' && ['followUpSuggestions', 'attachFollowUpActions'].includes(node.id.name)) functions.push(source.slice(...node.range));
        Object.values(node).forEach(value => Array.isArray(value) ? value.forEach(visit) : value && typeof value === 'object' ? visit(value) : undefined);
    }
    visit(tree);
    const element = () => ({ children: [], attributes: {}, append(...nodes) { this.children.push(...nodes); }, appendChild(node) { this.children.push(node); },
        setAttribute(name, value) { this.attributes[name] = value; }, addEventListener(name, handler) { this[name] = handler; }, querySelector() { return null; },
        set innerHTML(_value) { throw new Error('No insertar sugerencias como HTML'); } });
    const sent = [];
    const sandbox = { document: { createElement: element, createTextNode: text => ({ text }) }, shouldShowAssistantControls: () => true, sendMessage: text => sent.push(text) };
    vm.createContext(sandbox);
    vm.runInContext(functions.join('\n'), sandbox);
    const message = { rich: { meta: { followUps: [...strategy.followUps, { label: 'extra', prompt: 'extra' }] } } };
    const bubble = element();
    sandbox.attachFollowUpActions(bubble, message);
    const buttons = bubble.children[0].children.slice(1);
    assert.equal(buttons.length, 3);
    buttons[0].click();
    assert.equal(sent[0], strategy.followUps[0].prompt);
    const malicious = { rich: { meta: { followUps: [{ label: '<img onerror=alert(1)>', prompt: 'p'.repeat(900), icon: 'fa-link" onclick="alert(1)' }] } } };
    const safe = sandbox.followUpSuggestions(malicious)[0];
    assert.equal(safe.icon, 'fa-link');
    assert.equal(safe.prompt.length, 600);
    const attackBubble = element();
    sandbox.attachFollowUpActions(attackBubble, malicious);
    assert.equal(attackBubble.children[0].children[1].children[1].text, malicious.rich.meta.followUps[0].label);
}

async function main() {
    [1, 5, 20].forEach(checkTemporalEvaluation);
    assert.throws(() => trainAndAssess(seasonal, { horizon: 21 }), RangeError);
    assert.throws(() => trainAndAssess(seasonal, { horizon: 1.5 }), RangeError);
    assert.equal(trainAndAssess(Array(100).fill(50)).eligible, false);
    assert.equal(trainAndAssess(seasonal.slice(0, 50), { horizon: 20 }).eligible, false);
    assert.deepEqual(trainAndAssess([null, false, '', ...seasonal]).evaluation, trainAndAssess(seasonal).evaluation);

    assert.equal(forecastRequest('Pronóstico de TSN para dos semanas').horizon, 10);
    assert.equal(forecastRequest('Predice TSN en un mes').horizon, 20);
    assert.equal(forecastRequest('TSN mañana').horizon, 1);
    assert.equal(forecastRequest('Perspectiva de TSN y sus resultados').requested, false);
    assert.equal(forecastRequest('Qué pronosticó Rabobank en su informe publicado de 2025').requested, false);
    assert.equal(forecastRequest('Pronóstico de TSN en un año').supported, false);
    const history = [{ role: 'user', content: 'Pronóstico de TSN para un mes' }, { role: 'assistant', content: 'Corte y escenarios.' }];
    assert.equal(forecastRequest('Ahora para 5 sesiones', history).horizon, 5);
    assert.equal(forecastRequest('Ahora cambia el horizonte a una sesión y explícamelo breve. Conserva las acciones y mi objetivo.', history).horizon, 1);
    const shortFollow = planQuery({ message: 'Ahora cambia el horizonte a una sesión y explícamelo breve. Conserva las acciones y mi objetivo.', history });
    assert.match(shortFollow.marketQuery, /TSN/);
    assert.equal(shortFollow.forecast.horizon, 1);
    const shifted = [...history, { role: 'user', content: 'Cambiando de tema, pronóstico de PPC para una semana' }, { role: 'assistant', content: 'Escenario PPC.' }];
    assert.equal(forecastRequest('Amplía el análisis anterior', shifted).horizon, 5);
    const plan = planQuery({ message: 'Soy inversor. Pronóstico de TSN para 5 sesiones', history: [] });
    assert.equal(plan.asksAnalysis, true);
    const strategy = buildAnswerStrategy({ message: plan.marketQuery, plan });
    assert.equal(strategy.audience, 'investor');
    for (const item of strategy.followUps) {
        const follow = planQuery({ message: item.prompt, history: [{ role: 'user', content: plan.marketQuery }, { role: 'assistant', content: 'Escenario de TSN.' }] });
        assert.match(follow.marketQuery, /TSN/i);
        assert.equal(follow.forecast.horizon, 5);
    }
    assert.equal(buildAnswerStrategy({ message: 'Soy productor de pollo' }).audience, 'producer');
    assert.equal(buildAnswerStrategy({ message: 'Soy comprador de huevo' }).audience, 'buyer');
    assert.match(buildPrompt({ message: 'Predice TSN para una semana', plan }).prompt, /No inventes ni repitas precios objetivo/);
    assert.equal(buildPrompt({ message: 'Predice TSN para una semana', mode: 'quick', plan }).mode, 'quick');
    checkFollowUpRendering(strategy);

    const accepted = await loadForecast(instrument, 5, { now, get: async () => payload() });
    assert.equal(accepted.available, true);
    assert.equal(accepted.cutoff, '2026-10-05');
    assert.equal(accepted.prediction.probabilityUp, null);
    assert.equal(accepted.evaluation.horizon, 5);
    const openBar = await loadForecast(instrument, 1, { now, get: async () => payload({ values: [...seasonal, 999999], end: now }) });
    assert.equal(openBar.cutoff, '2026-10-05');
    assert.equal(openBar.observations, seasonal.length);
    const closedBar = await loadForecast(instrument, 1, { now: now + 5 * 3_600_000, get: async () => payload({ end: now, meta: { currentTradingPeriod: { regular: { start: now / 1000 - 10_000, end: now / 1000 + 7200 } } } }) });
    assert.equal(closedBar.cutoff, '2026-10-06');
    const nullBar = await loadForecast(instrument, 1, { now, get: async () => payload({ values: [...seasonal, null], end: now - DAY }) });
    assert.equal(nullBar.cutoff, '2026-10-04');
    assert.equal(nullBar.observations, seasonal.length);
    assert.equal((await loadForecast(instrument, 1, { now, get: async () => payload({ end: now - 8 * DAY }) })).available, false);
    assert.match((await loadForecast(instrument, 1, { now, get: async () => payload({ adjusted: false }) })).reason, /ajustados/);
    let calls = 0;
    const deps = { now, get: async () => { calls++; return payload(); } };
    const analysis = await buildForecastAnalysis(plan, deps);
    assert.equal(analysis.available, true);
    assert.equal(calls, 1);
    const physical = await buildForecastAnalysis(planQuery({ message: 'Pronóstico del precio físico del cerdo en México para una semana' }), deps);
    assert.equal(physical.available, false);
    assert.match(physical.reason, /precio físico/);
    assert.equal(calls, 1, 'No usar futuros como proxy de la serie física');
    const noFutures = await buildForecastAnalysis(planQuery({ message: 'Pronóstico del precio físico del cerdo en México para una semana. No confundas mi precio físico con futuros.' }), deps);
    assert.equal(noFutures.available, false);
    assert.equal(calls, 1, 'Una mención negativa no pide pronosticar futuros');
    const margin = await buildForecastAnalysis(planQuery({ message: 'Soy productor de cerdo. Quiero pronosticar mi margen para la próxima semana. No confundas mi precio físico con futuros.' }), deps);
    assert.match(margin.reason, /margen/);
    assert.equal(calls, 1, 'No pronosticar una cotización cuando se pidió margen');
    const long = await buildForecastAnalysis(planQuery({ message: 'Pronóstico TSN para un año' }), deps);
    assert.equal(long.available, false);
    assert.equal(calls, 1);
    const failure = await buildForecastAnalysis(plan, { now, get: async () => { throw new Error('not reachable'); } });
    assert.equal(failure.available, false);
    assert.doesNotMatch(failure.records[0].reason, /not reachable/);

    const body = markdownToRichResponse('## Lectura\nEl costo del alimento afecta al margen.', { model: 'fixture' });
    delete body.markdown;
    attachForecastAnalysis(body, analysis);
    attachEvidence(body, { citations: [], evidenceCount: 0 });
    assert.match(body.markdown, /costo del alimento/);
    assert.match(body.markdown, /Pronóstico cuantitativo evaluado/);
    assert.equal(body.meta.citations[0].type, 'forecast_historical_series');
    for (const text of ['TSN subirá seguro 20%.', 'Mi pronóstico es 80 USD.', 'La probabilidad de acierto es 90%.', 'No hay garantía, pero TSN subirá seguro 20%.']) {
        const guarded = guardForecastAnswer(plan, text);
        assert.equal(guarded.changed, true, text);
        assert.doesNotMatch(guarded.text, /20%|80 USD|90%/);
    }
    for (const text of ['No puedo garantizar una subida de 20%.', 'Si el costo sube 10%, el margen podría caer.', '| Hecho | Lectura |\n| --- | --- |\n| El maíz cae | Menor costo |']) {
        assert.deepEqual(guardForecastAnswer(plan, text), { changed: false, text });
    }

    const retriever = { retrieve: async () => ({ context: '', citations: [], sourceCodes: [], evidenceCount: 0 }), recordQuery: async () => null, recordEvidence: async () => null };
    const provider = { name: 'fixture', modelForTier: () => 'fixture', stream: async request => {
        assert.match(request.prompt, /PRONÓSTICO NUMÉRICO/);
        request.onText?.('TSN subirá seguro 20%.', 'TSN subirá seguro 20%.');
        return { text: 'TSN subirá seguro 20%.\nEl menor costo del alimento favorece márgenes si los precios de venta resisten.', model: 'fixture' };
    }, generate: async () => ({ text: JSON.stringify(markdownToRichResponse('## Tesis\nVigila márgenes y costos antes de decidir.', { model: 'fixture' })), model: 'fixture' }) };
    const orchestration = new AIOrchestrator({ provider, retriever, liveDataGrounder: async () => ({ context: '', citations: [], evidenceCount: 0 }), forecastBuilder: async () => analysis });
    const chunks = [];
    const streamed = await orchestration.stream({ message: 'Pronóstico de TSN para 5 sesiones', tier: 'flash', history: [], onText: text => chunks.push(text) });
    assert.equal(chunks.length, 1, 'Validar las afirmaciones futuras antes de emitir el texto');
    assert.doesNotMatch(streamed.text, /subirá seguro|20%/);
    assert.match(streamed.text, /menor costo del alimento/);
    assert.equal(streamed.response.meta.followUps.length, 3);
    assert.equal(streamed.citations[0].type, 'forecast_historical_series');
    const structured = await orchestration.generateStructured({ message: 'Pronóstico de TSN para 5 sesiones', tier: 'flash', history: [] });
    assert.match(structured.text, /Vigila márgenes y costos/);
    assert.match(structured.text, /Pronóstico cuantitativo evaluado/);
    // Un fallo de auditoría no debe ocultar una respuesta ya calculada.
    retriever.recordQuery = async () => { throw new Error('DB unavailable'); };
    provider.generate = async () => ({ text: 'Lectura compatible: vigila costos y ventas.', model: 'fixture' });
    const fallback = await orchestration.generateStructured({ message: 'Pronóstico de TSN para 5 sesiones', tier: 'flash', history: [] });
    assert.match(fallback.text, /Lectura compatible/);
    assert.equal(fallback.queryId, null);
    assert.equal(fallback.response.meta.forecastAnalysis.available, true);
    console.log('ORION forecast, temporal validation and conversational controls: OK');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
