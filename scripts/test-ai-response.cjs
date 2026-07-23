'use strict';

const assert = require('assert');
const {
    validateMermaid, normalizeChartSpec, validateRichResponse,
    markdownToRichResponse, toLegacyMarkdown, ensureRequestedChart, ensureRequestedTable,
} = require('../backend/ai/response-schema');
const { detectMode, detectTaskType, selectModelTier, buildPrompt } = require('../backend/ai/prompt-builder');
const { GeminiProvider } = require('../backend/ai/providers/gemini-provider');
const { domainDecision, domainRedirectText } = require('../backend/ai/domain-policy');
const { AIOrchestrator, retrievalQuestion, attachEvidence } = require('../backend/ai/orchestrator');
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
assert.equal(detectMode('Realiza un análisis técnico de esta curva de tasas', 'auto'), 'technical');
assert.equal(detectMode('Analiza el mercado de bonos globales', 'auto'), 'executive');
assert.equal(detectTaskType('Compara dos estrategias'), 'comparison');
assert.equal(selectModelTier({ message: 'Dime rápido el precio' }), 'flash');
assert.equal(selectModelTier({ message: 'Crea un reporte detallado con escenarios, riesgos y recomendación ejecutiva' }), 'pro');
assert.equal(selectModelTier({ message: 'Analiza a fondo esta arquitectura técnica y propón una solución completa' }), 'pro');
const prompt = buildPrompt({ message: 'Analiza técnicamente la curva de CETES', context: 'Texto externo', mode: 'technical' });
assert(prompt.systemInstruction.includes('contexto recuperado'));
assert(prompt.prompt.includes('[SOLICITUD ACTUAL DEL USUARIO]'));
assert(prompt.systemInstruction.includes('polarArea'));
assert(prompt.systemInstruction.includes('tabla real'));
assert(prompt.systemInstruction.includes('Conclusión ejecutiva'));
assert(prompt.systemInstruction.toLowerCase().includes('lectura ejecutiva'));
assert(prompt.prompt.includes('[FECHA DE REFERENCIA]'));
assert(prompt.prompt.includes('Prioriza metodología'));
assert(prompt.systemInstruction.includes('No escribas código'));
assert(prompt.systemInstruction.includes('[M1]'));
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

    assert.equal(domainDecision({ message: 'Analiza la inflación y las tasas de México' }).allowed, true);
    assert.equal(domainDecision({ message: '¿Cómo cambio mi contraseña en VALLNews?' }).allowed, true);
    assert.equal(domainDecision({ message: 'Escribe un programa en Python para consultar el dólar' }).reason, 'programming');
    assert.equal(domainDecision({ message: 'Dame una receta de pastel' }).reason, 'off_topic');
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
    console.log('AI response tests: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
