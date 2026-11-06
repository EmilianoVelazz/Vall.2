'use strict';
const assert = require('node:assert/strict');
const { parsePublicRecords, selectRecords, safeArticleUrl, createRabobankClient, rabobankEvidence } = require('../backend/services/rabobank-public');
const { planQuery } = require('../backend/ai/query-planner');
const { domainDecision } = require('../backend/ai/domain-policy');
const { groundLiveData } = require('../backend/ai/live-data-grounder');
const { auditResponse, guardTradeResearch, scopeTradeEvidence, textMentionsSource } = require('../backend/ai/response-quality');
const { AIOrchestrator } = require('../backend/ai/orchestrator');
const { detectTaskType, buildPrompt } = require('../backend/ai/prompt-builder');

// Publicaciones sintéticas: no representan cifras o pronósticos del banco.
const TIME = Date.parse('2026-10-02T16:00:00Z');
function article(id, title, text, date = '2026-09-01') {
    return { id, status: 'publish', link: `https://www.rabobankna.com/knowledge-hub/fixture-${id}/`, date,
        title: { rendered: title }, content: { rendered: `<p>${text}</p><h2>Disclaimer</h2><p>Unrelated beef boilerplate</p><script>Never include this script</script>`, protected: false },
        excerpt: { rendered: '', protected: false } };
}
const fixtures = [
    article(1, 'Beef outlook', 'China and the United States feature in this beef outlook. The expected direction is a forecast for 2027, not an observed price.'),
    article(2, 'Grains outlook', 'Wheat and corn in Canada have different supply risks. These synthetic sentences test selection of grain research.'),
    article(3, 'Poultry outlook 2025', 'Poultry consumption in China was the subject of this historical report. The forecast refers to 2025 rather than the current year.', '2025-05-28'),
    article(4, 'Energy outlook', 'North American fuel markets include a single passing reference to beef. This publication focuses on energy and fuel prices.'),
];
function response(items, pages = 1, total = items.length) {
    return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json', 'x-wp-totalpages': String(pages), 'x-wp-total': String(total) }), text: async () => JSON.stringify(items) };
}

(async () => {
    const invalid = [
        { ...fixtures[0], date: '2026-02-31' }, { ...fixtures[0], date: '2027-01-01' },
        { ...fixtures[0], status: 'draft' }, { ...fixtures[0], link: 'https://www.rabobankna.com@evil.example/knowledge-hub/stolen/' },
        { ...fixtures[0], content: { protected: true, rendered: '<p>Private text</p>' } },
    ];
    const records = parsePublicRecords([...fixtures, ...invalid, fixtures[0]], TIME);
    assert.equal(records.length, 4);
    assert(!JSON.stringify(records).includes('boilerplate'));
    assert(!JSON.stringify(records).includes('script'));
    assert.equal(safeArticleUrl('http://www.rabobankna.com/knowledge-hub/test/'), null);
    assert.equal(safeArticleUrl('https://www.rabobankna.com/knowledge-hub/test/?redirect=evil'), null);
    const restricted = article(5, 'Exclusive beef', 'This is an exclusive article. Do not ingest an exclusive beef report.');
    restricted.excerpt.rendered = '<p>A public summary of the beef report is available for this publication.</p>';
    const limited = parsePublicRecords([restricted], TIME)[0];
    assert.equal(limited.access, 'public_summary');
    assert(!limited.paragraphs.join(' ').includes('exclusive article'));
    assert.deepEqual(selectRecords(records, 'Rabobank China Estados Unidos proteínas', TIME).records.map(item => item.title), ['Beef outlook']);
    assert.deepEqual(selectRecords(records, 'Rabobank proteínas últimos tres meses', TIME).records.map(item => item.title), ['Beef outlook']);
    assert.deepEqual(selectRecords(records, 'Rabobank pollo en 2025', TIME).records.map(item => item.title), ['Poultry outlook 2025']);
    assert.equal(selectRecords(records, 'Rabobank Canadá granos', TIME).records.length, 1);
    assert.equal(selectRecords(records, 'Rabobank Estados Unidos granos', TIME).records.length, 0);
    const long = parsePublicRecords([article(8, 'Pork research', 'Pork forecast is dated. Padding ' + Array.from({ length: 210 }, () => 'padding').join(' ') + ' 999 USD.')], TIME);
    const excerpt = selectRecords(long, 'Rabobank cerdo', TIME).records[0].excerpts;
    assert.equal(excerpt, 'Pork forecast is dated.', 'No se corta una oración dejando una cifra sin unidad');

    let time = TIME, calls = 0, offline = false;
    const source = createRabobankClient({ now: () => time, fetchPage: async (url, options) => {
        calls += 1;
        assert.equal(new URL(url).hostname, 'www.rabobankna.com');
        assert(options.signal);
        if (offline) throw new Error('offline');
        const number = Number(new URL(url).searchParams.get('page'));
        return response(number === 1 ? fixtures.slice(0, 2) : fixtures.slice(2), 2, 4);
    } });
    const parallel = await Promise.all([source.get('proteínas'), source.get('granos')]);
    assert.equal(calls, 2, 'La descarga paginada se comparte entre consultas simultáneas');
    assert.equal(parallel[0].retrievedCount, 4);
    assert.equal(parallel[1].records[0].title, 'Grains outlook');
    assert.equal((await source.get('cerdo')).records.length, 0, 'El tema se filtra de nuevo al reutilizar el caché');
    offline = true;
    time += 16 * 60_000;
    const stale = await source.get('proteínas');
    assert(stale.stale && stale.records.length);
    const beforeRetry = calls;
    await source.get('proteínas');
    assert.equal(calls, beforeRetry, 'El reintento tiene espera para no saturar un proveedor caído');
    time += 7 * 60 * 60_000;
    assert.equal((await source.get('proteínas')).records.length, 0, 'Se descarta el caché demasiado antiguo');
    offline = false;
    time += 31_000;
    assert.equal((await source.get('granos')).stale, false);
    const partial = createRabobankClient({ now: () => TIME, fetchPage: async url => {
        if (new URL(url).searchParams.get('page') === '2') throw new Error('partial');
        return response(fixtures.slice(0, 1), 4, 100);
    } });
    assert.equal((await partial.get('proteínas')).partial, true);
    const htmlError = createRabobankClient({ now: () => TIME, fetchPage: async () => ({ ...response([]), headers: new Headers({ 'content-type': 'text/html' }) }) });
    assert.equal((await htmlError.get()).records.length, 0);

    const message = 'Rabobank proteínas';
    const plan = planQuery({ message });
    assert(plan.needsRabobank && plan.explicitRabobank && plan.needsSources);
    assert.equal(domainDecision({ message: 'RaboResearch' }).allowed, true);
    assert.equal(domainDecision({ message: 'Rabobank crea código en Python' }).allowed, false);
    assert.equal(planQuery({ message: 'Precio del maíz hoy' }).needsRabobank, false);
    const summaryQuery = 'Resume el informe público de Rabobank sobre aves de 2025 en 150 palabras';
    assert.equal(detectTaskType(summaryQuery), 'general');
    assert(!buildPrompt({ message: summaryQuery }).prompt.includes('mínimo obligatorio e innegociable'));
    assert.equal(detectTaskType('Resume el informe de Rabobank y genera un PDF'), 'document');
    assert.equal(detectTaskType('Elabora un informe sobre Rabobank'), 'document');
    assert.equal(planQuery({ message: 'Panorama de proteínas' }).needsRabobank, true);
    const history = [{ role: 'user', content: 'Rabobank analiza proteínas' }];
    const follow = planQuery({ message: '¿Y los cereales?', history });
    assert(follow.needsRabobank && !follow.rabobankQuery.includes('proteínas'));
    assert.equal(planQuery({ message: 'Ahora analiza Bitcoin', history }).needsRabobank, false);
    assert.equal(planQuery({ message: '¿Qué riesgos hay?', history: [{ role: 'user', content: 'Panorama del maíz' }] }).needsRabobank, true);

    const publicData = await rabobankEvidence(message, source);
    assert(publicData.available && publicData.rabobank.retrievedCount === 4);
    assert(textMentionsSource('Según Rabobank, el pronóstico...', publicData.citations), 'La atribución al banco reconoce también el nombre de su canal sin añadir un bloque duplicado');
    assert.match(publicData.context, /no equivale a todo RaboResearch mundial/);
    assert.match(publicData.context, /Un pronóstico para 2025 no cubre 2026/);
    const tradePlan = { ...plan, needsTradeResearch: true };
    assert(guardTradeResearch(tradePlan, publicData, 'Un supuesto acuerdo').blocked);
    assert.equal(scopeTradeEvidence(tradePlan, publicData).citations.length, 0, 'Rabobank por sí solo no verifica tratados');
    const unavailableMarket = await groundLiveData({ ...plan, needsLiveQuote: true }, message, { rabobankClient: source,
        marketGrounder: async () => ({ context: 'Sin cotización actual', available: false, citations: [], sourceCodes: [], strategy: 'unavailable' }) });
    assert(unavailableMarket.available && unavailableMarket.marketDataAvailable === false);
    assert.match(auditResponse({ plan: { ...plan, needsLiveQuote: true }, liveData: unavailableMarket }).disclosure, /Cotización sin confirmar/);
    const combined = await groundLiveData({ ...plan, needsMercolleida: true }, message, { rabobankClient: source,
        mercolleidaClient: { get: async () => ({ records: [], stale: false, warning: 'offline' }) } });
    assert(combined.rabobank.available && combined.mercolleida.available === false);
    assert.match(auditResponse({ plan: { ...plan, needsMercolleida: true }, liveData: combined }).disclosure, /Mercolleida/);

    for (const method of ['generateStructured', 'stream']) {
        const answerText = 'Rabobank publicó un análisis de res en 2026-09-01. El pronóstico corresponde a 2027 y debe interpretarse como escenario. [RaboResearch](https://www.rabobankna.com/knowledge-hub/fixture-1/).';
        let retrievalCalls = 0;
        const provider = { name: 'fixture', isConfigured: () => true,
            generate: async request => { assert.match(request.prompt, /RABOBANK · INVESTIGACIÓN PÚBLICA VERIFICADA/); return { text: answerText, model: 'fallback', grounding: null }; },
            stream: async request => { assert.match(request.prompt, /RABOBANK · INVESTIGACIÓN PÚBLICA VERIFICADA/); request.onText(answerText, answerText); return { text: answerText, model: 'fallback', grounding: null }; } };
        const chat = new AIOrchestrator({ provider,
            liveDataGrounder: (p, m) => groundLiveData(p, m, { rabobankClient: source }),
            retriever: { retrieve: async () => { retrievalCalls += 1; throw new Error('No RAG para el canal solicitado'); }, recordQuery: async () => null, recordEvidence: async () => null } });
        const answer = await chat[method]({ message, history: [], tier: 'flash', onText() {} });
        assert.equal(retrievalCalls, 0);
        assert.match(answer.text, /Rabobank publicó/);
        assert.match(answer.text, /https:\/\/www\.rabobankna\.com\/knowledge-hub\/fixture-1\//);
        assert.equal(answer.response.meta.rabobank.retrievedCount, 4);
        assert(answer.citations.every(item => item.type === 'rabobank_public_research'));
        assert.equal(answer.evidenceCount, answer.citations.length);
    }
    console.log('Rabobank public research, cache, relevance and chat integration tests: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
