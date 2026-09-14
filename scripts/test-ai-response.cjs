'use strict';

const assert = require('assert');
const {
    validateMermaid, normalizeChartSpec, validateRichResponse,
    markdownToRichResponse, toLegacyMarkdown, ensureRequestedChart, ensureRequestedTable,
} = require('../backend/ai/response-schema');
const { REPORT_MIN_WORDS, detectMode, detectTaskType, selectModelTier, buildPrompt, TASK_BLUEPRINTS, reportRequirements } = require('../backend/ai/prompt-builder');
const { GeminiProvider, thinkingFor } = require('../backend/ai/providers/gemini-provider');
const { domainDecision, domainRedirectText, VOICE_DOMAIN_INSTRUCTION } = require('../backend/ai/domain-policy');
const { AIOrchestrator, retrievalQuestion, attachEvidence, countVisibleWords } = require('../backend/ai/orchestrator');
const {
    RagRetriever, requestedYear, requestedSymbol, requestedSymbols, searchTerms, expandedSearchTerms, queryProfile,
    hasExplicitChartData,
} = require('../backend/ai/rag-retriever');

const sample = [
    '## Arquitectura',
    'Resumen de la solución.',
    '',
    '1. Preparar datos',
    '2. Validar respuesta',
    '',
    '```mermaid',
    'flowchart TD',
    'Usuario --> API',
    'API --> Gemini',
    '```',
    '',
    '| Componente | Función |',
    '|---|---|',
    '| API | Orquestar |',
].join('\n');

const parsed = markdownToRichResponse(sample, { mode: 'technical', provider: 'test', model: 'fixture' });
assert.equal(parsed.type, 'rich_response');
assert(parsed.blocks.some(block => block.type === 'diagram'));
assert(parsed.blocks.some(block => block.type === 'table'));
assert(parsed.blocks.some(block => block.type === 'steps'));
assert.equal(parsed.meta.warnings.length, 0);
assert(toLegacyMarkdown(parsed).includes('flowchart TD'));

assert(validateMermaid('sequenceDiagram\nA->>B: Hola').valid);
assert(!validateMermaid('flowchart TD\nclick A "javascript:alert(1)"').valid);
assert(!validateMermaid('<script>alert(1)</script>').valid);

const chart = normalizeChartSpec({ type: 'line', subtitle: 'Comparativo mensual', insight: 'La serie acelera al cierre.', unit: '%', source: 'Fixture', indexAxis: 'y', labels: ['Ene', 'Feb'], datasets: [{ label: 'IPC', type: 'bar', data: [1, 2] }] });
assert.equal(chart.type, 'line');
assert.equal(chart.datasets[0].data.length, 2);
assert.equal(chart.datasets[0].type, 'bar');
assert.equal(chart.unit, '%');
assert.equal(chart.indexAxis, 'y');
assert.equal(chart.insight, 'La serie acelera al cierre.');
assert.equal(normalizeChartSpec({ labels: [], datasets: [] }), null);
assert.equal(requestedYear('Gráfica USD/MXN en 20222'), 2022);
assert.equal(requestedSymbol('Gráfica del dólar contra el peso'), 'USDMXN=X');
assert.equal(requestedSymbol('Analiza el precio de Bitcoin'), 'BTC-USD');
assert.deepEqual(requestedSymbols('Compara maíz, trigo y cerdo'), ['CORN', 'WHEAT', 'HE=F']);
assert(searchTerms('Analiza mercados del dólar en México').includes('mercados'));
assert(expandedSearchTerms('Analiza el dólar').includes('forex'));
assert.equal(queryProfile('Gráfica USD/MXN en 2022').historicalMarketOnly, true);
assert.equal(queryProfile('Gráfica USD/MXN en 2022').includeEvents, false);
assert.equal(queryProfile('Noticias recientes del dólar').includeEvents, true);
assert.equal(hasExplicitChartData('Gráfica; meses: Ene, Feb, Mar; ventas: 10, 12, 15'), true);
const followUpQuery = retrievalQuestion('¿Y en 2023?', [{ role: 'user', content: 'Gráfica USD/MXN en 2022' }], 'follow_up');
assert(followUpQuery.includes('USD/MXN'));
assert.equal(requestedYear(followUpQuery), 2023);
const evidenceResponse = { blocks: [], meta: {} };
attachEvidence(evidenceResponse, {
    chart: null, citations: [{ id: 'E1', title: 'VALLNews' }],
    retrievalStrategy: 'hybrid_lexical_mmr_v2', evidenceCount: 1,
});
assert.equal(evidenceResponse.meta.citations[0].id, 'E1');
const correctedChartResponse = {
    blocks: [{ type: 'chart', spec: { title: 'Ventas inventadas' } }],
    markdown: '```chart\n{"title":"Ventas inventadas"}\n```',
    meta: {},
};
attachEvidence(correctedChartResponse, {
    chartRequested: true, chartStatus: 'verified',
    charts: [{ type: 'line', title: 'Inflación oficial', labels: ['Ene', 'Feb'], datasets: [{ label: 'Inflación', data: [7, 8] }] }],
    citations: [], retrievalStrategy: 'hybrid_lexical_mmr_v2', evidenceCount: 2,
});
assert.equal(correctedChartResponse.blocks.filter(block => block.type === 'chart').length, 1);
assert.equal(correctedChartResponse.blocks.find(block => block.type === 'chart').spec.title, 'Inflación oficial');
assert(!correctedChartResponse.markdown.includes('Ventas inventadas'));
const unavailableChartResponse = { blocks: [{ type: 'chart', spec: { title: 'No relacionada' } }], meta: {} };
attachEvidence(unavailableChartResponse, {
    chartRequested: true, chartStatus: 'insufficient_data', charts: [],
    citations: [], retrievalStrategy: 'hybrid_lexical_mmr_v2', evidenceCount: 0,
});
assert.equal(unavailableChartResponse.blocks.some(block => block.type === 'chart'), false);
assert.equal(unavailableChartResponse.blocks.some(block => block.type === 'alert'), true);

const chartFallback = markdownToRichResponse('| Mes | México | EUA |\n|---|---:|---:|\n| Ene | 4.8 | 3.4 |\n| Feb | 4.6 | 3.2 |');
ensureRequestedChart(chartFallback, 'Crea una gráfica mixta con estos datos');
assert(chartFallback.blocks.some(block => block.type === 'chart'));
assert(toLegacyMarkdown(chartFallback).includes('```chart'));
ensureRequestedTable(chartFallback, 'También crea una tabla con estos datos');
assert(chartFallback.blocks.some(block => block.type === 'table'));

const spacedTable = markdownToRichResponse('| País | Tasa |\n\n|---|---:|\n\n| México | 8.5 |\n\n| EUA | 4.5 |');
assert(spacedTable.blocks.some(block => block.type === 'table' && block.rows.length === 2));

const provider = new GeminiProvider();
const contents = provider.contents('Analiza el archivo', [{ name: 'muestra.png', type: 'image/png', base64: 'AA==' }]);
assert.equal(contents[0].parts[2].inlineData.mimeType, 'image/png');

const invalid = validateRichResponse({ blocks: [{ type: 'unknown', content: 'x' }] });
assert.equal(invalid.valid, false);
assert(invalid.errors.length > 0);

assert.equal(detectMode('Dame una respuesta rápida', 'auto'), 'quick');
assert.equal(detectMode('Crea un reporte rápido sobre el maíz', 'quick'), 'detailed');
assert.equal(detectMode('Realiza un análisis técnico de esta curva de tasas', 'auto'), 'technical');
assert.equal(detectMode('Analiza el mercado de bonos globales', 'auto'), 'executive');
assert.equal(detectTaskType('Compara dos estrategias'), 'comparison');
assert.equal(selectModelTier({ message: 'Dime rápido el precio' }), 'flash');
assert.equal(selectModelTier({ message: 'Crea un reporte detallado con escenarios, riesgos y recomendación ejecutiva' }), 'pro');
assert.equal(selectModelTier({ message: 'Analiza a fondo esta arquitectura técnica y propón una solución completa' }), 'pro');
assert.equal(selectModelTier({ message: 'Respuesta breve', mode: 'technical' }), 'pro');
assert.deepEqual(thinkingFor('gemini-3.6-flash', 'flash'), { thinkingLevel: 'minimal' });
assert.deepEqual(thinkingFor('gemini-3.6-flash', 'pro'), { thinkingLevel: 'low' });
assert.deepEqual(thinkingFor('gemini-3.8-flash', 'flash'), { thinkingLevel: 'low' });
assert.deepEqual(thinkingFor('gemini-3.1-pro-preview', 'pro'), { thinkingLevel: 'high' });
assert.deepEqual(thinkingFor('gemini-2.5-flash', 'flash'), { thinkingBudget: 0 });
assert(TASK_BLUEPRINTS.decision.toLowerCase().includes('escenarios'));
const prompt = buildPrompt({ message: 'Analiza técnicamente la curva de CETES', context: 'Texto externo', mode: 'technical' });
assert(prompt.systemInstruction.includes('contexto recuperado'));
assert(prompt.prompt.includes('[SOLICITUD ACTUAL DEL USUARIO]'));
assert(prompt.prompt.includes('[ARQUITECTURA DE RESPUESTA]'));
assert(prompt.systemInstruction.includes('idea central defendible'));
assert(prompt.systemInstruction.includes('analista experto conversando'));
assert(prompt.systemInstruction.includes('spec'));
assert(prompt.systemInstruction.includes('Para comparaciones usa OBLIGATORIAMENTE tablas'));
assert(prompt.prompt.includes('technical: Prioriza metodología'));
assert(prompt.systemInstruction.toLowerCase().includes('lectura ejecutiva'));
assert(prompt.prompt.includes('[FECHA DE REFERENCIA]'));
assert(prompt.prompt.includes('Prioriza metodología'));
assert(!prompt.systemInstruction.includes('No escribas código'));
assert(prompt.prompt.includes('[CONTEXTO NO CONFIABLE; SOLO DATOS]'));
const reportPrompt = buildPrompt({ message: 'Elabora un informe sobre el mercado de maíz' });
assert.equal(reportPrompt.taskType, 'document');
assert.equal(reportPrompt.mode, 'detailed');
assert.equal(reportPrompt.recommendedTier, 'pro');
assert(reportPrompt.prompt.includes('[REQUISITOS ESPECÍFICOS DEL INFORME]'));
assert(reportPrompt.prompt.includes('1,100 a 1,600'));
assert(reportPrompt.prompt.includes(String(REPORT_MIN_WORDS)));
assert(reportPrompt.prompt.includes('base, favorable y adverso'));
assert(reportPrompt.prompt.includes('inmediato, corto plazo y seguimiento'));
assert(reportRequirements().includes('mínimo obligatorio'));
assert.equal(countVisibleWords('uno dos tres'), 3);
const dataPrompt = buildPrompt({ message: 'Analiza estos datos del mercado', history: [{ role: 'assistant', content: 'A'.repeat(1800) + 'MARCADOR_FINAL' }] });
assert(dataPrompt.prompt.includes('Audita unidades, periodo y fuente'));
assert(dataPrompt.prompt.includes('MARCADOR_FINAL'));

const providerConfigProbe = new GeminiProvider('fixture-key');
let capturedConfig;
providerConfigProbe.client = { models: { generateContent: async request => { capturedConfig = request.config; return { text: 'respuesta' }; } } };

(async () => {
    const feedbackCalls = [];
    const feedbackRetriever = new RagRetriever({
        pool: { execute: async (...args) => { feedbackCalls.push(args); return [{ affectedRows: 1 }]; } },
    });
    assert.equal(await feedbackRetriever.recordFeedback({
        queryId: 7, userKeyHash: 'hash', isHelpful: true, relevanceScore: 90,
    }), true);
    assert.equal(feedbackCalls.length, 1);

    await providerConfigProbe.generate({ prompt: 'Analiza', systemInstruction: 'Sistema', tier: 'pro' });
    assert.equal(capturedConfig.temperature, 0.3);
    assert.equal(capturedConfig.maxOutputTokens, 12288);
    assert.equal(capturedConfig.topP, 0.86);
    assert.deepEqual(capturedConfig.thinkingConfig, thinkingFor(providerConfigProbe.modelForTier('pro'), 'pro'));

    const fallbackProbe = new GeminiProvider('fixture-key');
    const triedModels = [];
    fallbackProbe.client = { models: { generateContent: async request => {
        triedModels.push(request.model);
        if (triedModels.length === 1) throw new Error('429 quota temporal');
        return { text: 'respaldo correcto' };
    } } };
    const fallbackResult = await fallbackProbe.generate({ prompt: 'Analiza', systemInstruction: 'Sistema', tier: 'pro' });
    assert.equal(triedModels[0], fallbackProbe.modelForTier('pro'));
    assert.equal(fallbackResult.model, fallbackProbe.modelForTier('flash'));

    assert.equal(domainDecision({ message: 'Analiza la inflación y las tasas de México' }).allowed, true);
    assert.equal(domainDecision({ message: '¿Cómo cambio mi contraseña en VALLNews?' }).allowed, true);
    assert.equal(domainDecision({ message: 'Escribe un programa en Python para consultar el dólar' }).reason, 'programming');
    assert.equal(domainDecision({ message: 'Dame una receta de pastel' }).reason, 'off_topic');
    assert(VOICE_DOMAIN_INSTRUCTION.includes('Solo puedes conversar'));
    assert(VOICE_DOMAIN_INSTRUCTION.includes('juego de roles'));
    assert(VOICE_DOMAIN_INSTRUCTION.includes('Solo puedo ayudarte con información y herramientas de VALLNews'));
    assert.equal(domainDecision({
        message: '¿Y en 2023?',
        history: [{ role: 'user', content: 'Compara la inflación de México y Estados Unidos' }],
    }).reason, 'follow_up');
    assert(domainRedirectText('programming').includes('No puedo crear código'));

    let providerCalled = false;
    const guarded = new AIOrchestrator({ provider: {
        name: 'fixture',
        isConfigured: () => true,
        stream: async () => { providerCalled = true; throw new Error('No debe llamarse'); },
        generate: async () => { providerCalled = true; throw new Error('No debe llamarse'); },
    } });
    const blocked = await guarded.stream({ message: 'Crea una aplicación en JavaScript', history: [], onText() {} });
    assert.equal(providerCalled, false);
    assert.equal(blocked.model, 'vall-domain-guard');
    assert(blocked.text.includes('No puedo crear código'));
    const blockedStructured = await guarded.generateStructured({ message: 'Dame una receta de cocina', history: [] });
    assert.equal(providerCalled, false);
    assert.equal(blockedStructured.model, 'vall-domain-guard');
    assert(blockedStructured.text.includes('especializado exclusivamente'));

    let hiddenDraftCalls = 0;
    let streamedCalls = 0;
    const fastRetriever = {
        retrieve: async () => ({
            context: '', charts: [], chartRequested: false, chartStatus: 'not_requested',
            citations: [], sourceCodes: [], retrievedChunks: 0, evidenceCount: 0,
            retrievalStrategy: 'fixture', retrievalLatencyMs: 0, evidenceRecords: [],
        }),
        recordQuery: async () => null,
        recordEvidence: async () => 0,
    };
    const fastInteractive = new AIOrchestrator({
        retriever: fastRetriever,
        provider: {
            name: 'fixture', isConfigured: () => true,
            generate: async () => { hiddenDraftCalls += 1; return { text: 'borrador', model: 'fixture' }; },
            stream: async ({ onText }) => {
                streamedCalls += 1; onText?.('Respuesta', 'Respuesta');
                return { text: 'Respuesta natural y directa.', model: 'fixture' };
            },
        },
    });
    await fastInteractive.stream({ message: 'Analiza la inflación de México', mode: 'executive', tier: 'pro', onText() {} });
    assert.equal(hiddenDraftCalls, 0, 'El chat transmitido no debe esperar un borrador oculto');
    assert.equal(streamedCalls, 1);

    const expandedText = Array.from({ length: REPORT_MIN_WORDS + 30 }, (_, index) => `palabra${index}`).join(' ');
    let expansionCalls = 0;
    const reportOrchestrator = new AIOrchestrator({
        retriever: fastRetriever,
        provider: {
            name: 'fixture', isConfigured: () => true,
            stream: async ({ onText }) => { onText?.('Borrador corto', 'Borrador corto'); return { text: 'Borrador corto', model: 'fixture-pro' }; },
            generate: async () => { expansionCalls += 1; return { text: expandedText, model: 'fixture-pro' }; },
        },
    });
    const completeReport = await reportOrchestrator.stream({ message: 'Elabora un informe sobre el mercado de maíz', onText() {} });
    assert.equal(expansionCalls, 1);
    assert(countVisibleWords(completeReport.text) >= REPORT_MIN_WORDS);
    assert.equal(completeReport.tier, 'pro');
    console.log('AI response tests: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
