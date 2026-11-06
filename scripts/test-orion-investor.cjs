'use strict';

const assert = require('node:assert/strict');
const { planQuery } = require('../backend/ai/query-planner');
const { requestedInstruments } = require('../backend/ai/statistical-analysis');
const { rulesForMessage, yahooQuote, quoteCitations, groundMarketData, groundLiveData, selectNews, liveNews } = require('../backend/ai/live-data-grounder');
const { researchPeriod } = require('../backend/services/trade-research');
const { PROTEIN_ISSUERS, parseIssuerDocument, createIssuerResearchClient, requestedProteinIssuers } = require('../backend/services/protein-equities');
const { auditResponse, guardNewsCoverage } = require('../backend/ai/response-quality');
const { detectTaskType, buildPrompt } = require('../backend/ai/prompt-builder');
const { AIOrchestrator } = require('../backend/ai/orchestrator');
const { domainDecision } = require('../backend/ai/domain-policy');

const message = 'Dame el precio actual de las acciones TSN, PPC, CALM y JBS del sector de proteínas.';
const equities = planQuery({ message });
assert.equal(equities.needsProteinPrices, false);
assert.equal(equities.needsLiveQuote, true);
assert.deepEqual(rulesForMessage(message, equities).map(item => item.symbol), ['TSN', 'PPC', 'CALM', 'JBS']);
assert.equal(requestedInstruments(message).length, 2, 'Keep OLS comparisons limited to pairs');
assert.equal(requestedInstruments('Maíz')[0].unit, '¢ USD/bu', 'CME grain values are cents, not dollars');
const comparison = 'Compara Tyson Foods, Pilgrim’s Pride y Cal-Maine Foods como inversor: resultados, deuda y riesgos, con enlaces a los reportes oficiales.';
assert.equal(planQuery({ message: comparison }).needsIssuerResearch, true);
assert.equal(domainDecision({ message: 'TSN hoy?' }).allowed, true);
assert.equal(detectTaskType(comparison), 'comparison');
assert.equal(detectTaskType('Genera un reporte sobre TSN con fuentes oficiales'), 'document');
assert.equal(detectTaskType('Qué documentos leíste y si tienes acceso a informes privados'), 'general');
assert.match(buildPrompt({ message: comparison, context: 'x'.repeat(20000) + 'PPC documento al final' }).prompt, /PPC documento al final/);
const mixed = 'Dame los precios del pollo y huevo en España y el precio de la acción TSN hoy.';
const mixedPlan = planQuery({ message: mixed });
assert.equal(mixedPlan.needsProteinPrices, true);
assert.equal(mixedPlan.needsLiveQuote, true);
assert.deepEqual(rulesForMessage(mixed, mixedPlan).map(item => item.symbol), ['TSN']);
const newsMessage = 'Qué noticias de los últimos siete días afectan al pollo, huevo, cerdo y res y qué acciones son sensibles.';
const newsPlan = planQuery({ message: newsMessage });
assert.equal(newsPlan.needsLiveQuote, false, 'News dates do not request commodity futures');
assert.deepEqual(rulesForMessage(newsMessage, newsPlan), []);
const newsCoverage = guardNewsCoverage(newsPlan, 'No existen comunicados financieros de TSN y PPC en los últimos siete días.\nCal-Maine publicó resultados el 30 de septiembre.');
assert.equal(newsCoverage.changed, true);
assert.doesNotMatch(newsCoverage.text, /No existen comunicados/);
assert.match(newsCoverage.text, /Cal-Maine publicó resultados/);
assert.equal(guardNewsCoverage(newsPlan, 'No recuperé noticias de cerdo en las fuentes consultadas.').changed, false);
assert.equal(planQuery({ message: newsMessage.replace('acciones son', 'acciones cotizadas son') }).needsLiveQuote, false);
assert(planQuery({ message: newsMessage }).proteinIssuers.some(issuer => issuer.ticker === 'JBS'));
const inputCosts = 'Dame la cotización actual de futuros de maíz y cerdo magro CME; explica su impacto en TSN y PPC.';
assert.deepEqual(rulesForMessage(inputCosts, planQuery({ message: inputCosts })).map(item => item.symbol), ['ZC=F', 'HE=F']);
const fixedNow = Date.parse('2026-10-05T20:00:00Z');
const period = researchPeriod(newsMessage, fixedNow);
assert.deepEqual(period, { start: '2026-09-28', end: '2026-10-05', assumption: false });
const headlineRows = [
    { title: 'Poultry exports expand', url: 'https://news.example/old', publishedAt: '2026-09-27T12:00:00Z' },
    { title: 'Poultry exports expand', url: 'https://news.example/current', publishedAt: '2026-09-30T12:00:00Z' },
    { title: 'Poultry exports expand', url: 'https://news.example/indexed', publishedAt: null, indexedAt: '2026-10-01T12:00:00Z' },
    { title: 'Poultry export', url: 'https://news.example/future', indexedAt: '2099-01-01' },
    { title: 'Así usa el chef la carne de cerdo en su cocina', url: 'https://recipes.example/pork', publishedAt: '2026-10-01T12:00:00Z' },
];
assert.deepEqual(selectNews(headlineRows, newsPlan.proteinProfile, period).map(item => item.url), ['https://news.example/current', 'https://news.example/indexed']);

function quotePayload({ closes = [50, 52, null], timestamps = [1704067200, 1704153600, 1704240000], meta = {} } = {}) {
    return { ok: true, json: async () => ({ chart: { result: [{ timestamp: timestamps, meta: { currency: 'USD', ...meta }, indicators: { quote: [{ close: closes }] } }] } }) };
}
const issuer = PROTEIN_ISSUERS[0];
const docUrl = issuer.documents[0];
const documentHtml = '<meta property="og:title" content="Tyson Foods Updates Fiscal 2026 Outlook"><div id="_ctrl0_divBody"><p>Springdale, September 3, 2026. Tyson Foods now expects adjusted operating income of $1.85 billion to $2.05 billion. This guidance replaces the previously published outlook and preserves its period.</p></div>';
assert.equal(parseIssuerDocument(documentHtml, docUrl, issuer, fixedNow).date, '2026-09-03');
assert.equal(parseIssuerDocument(documentHtml.replace('2026.', '2099.'), docUrl, issuer, fixedNow), null);
assert.equal(parseIssuerDocument(documentHtml, 'https://attacker.example/news/news-details/false', issuer, fixedNow), null);
assert.equal(parseIssuerDocument(documentHtml, docUrl.replace('https:', 'http:'), issuer, fixedNow), null);

(async () => {
    const quote = await yahooQuote({ symbol: 'TSN', label: 'Tyson', unit: 'USD' }, async () => quotePayload());
    assert.equal(quote.value, 52);
    assert.equal(quote.updatedAt, '2024-01-02T00:00:00.000Z', 'Null last close must not receive the last timestamp');
    assert.equal(quote.change.toFixed(2), '4.00');
    assert.match(quoteCitations([quote])[0].url, /chart\/TSN\?/);
    const session = await yahooQuote({ symbol: 'TSN', unit: 'USD' }, async () => quotePayload({ meta: { regularMarketPrice: 53, regularMarketTime: 1704153660, chartPreviousClose: 40 } }));
    assert.equal(session.value, 53);
    assert.equal(session.frequency, 'timestamped_session_quote');
    assert.equal(session.change.toFixed(1), '6.0', 'Compare to prior daily observation, not beginning of 5-day range');
    await assert.rejects(yahooQuote({ symbol: 'TSN' }, async () => quotePayload({ timestamps: [4102444800, 4102531200, 4102617600] })), /fechado/);

    const savedKey = process.env.NEWSAPI_KEY;
    delete process.env.NEWSAPI_KEY;
    try {
        let requestedUrl;
        const indexedToday = new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}/, '');
        const articles = await liveNews(newsMessage, async url => { requestedUrl = new URL(url); return { ok: true, json: async () => ({ articles: [{ title: 'Poultry exports expand', url: 'https://news.example/release', domain: 'news.example', seendate: indexedToday }] }) }; }, { profile: newsPlan.proteinProfile });
        const expected = researchPeriod(newsMessage);
        assert.equal(requestedUrl.searchParams.get('startdatetime'), expected.start.replaceAll('-', '') + '000000');
        assert.equal(articles.length, 1, 'La noticia de prueba debe pertenecer al periodo relativo de la consulta');
        assert.equal(articles[0].publishedAt, null, 'GDELT indexing must never become publication date');

        const quoteAndNews = await groundMarketData({ ...equities, needsLiveNews: true }, 'Precio actual TSN y noticias', { get: async url => {
            if (url.includes('finance.yahoo.com')) throw new Error('quote feed unavailable');
            return { ok: true, json: async () => ({ articles: [{ title: 'Poultry earnings update', url: 'https://issuer.example/release', domain: 'issuer.example', seendate: new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}/, '') }] }) };
        } });
        assert.equal(quoteAndNews.quotesAvailable, false);
        assert.equal(quoteAndNews.newsAvailable, true);
        assert.match(auditResponse({ plan: { needsLiveQuote: true }, liveData: quoteAndNews }).disclosure, /Cotización sin confirmar/);
        const fxMessage = 'Dame el precio actual de TSN y el tipo de cambio USD/MXN.';
        const fxPlan = planQuery({ message: fxMessage });
        const both = await groundMarketData(fxPlan, fxMessage, { get: async () => quotePayload(), currencyQuote: async () => ({ from: 'USD', to: 'MXN', rate: 20, updatedAt: '2026-10-05', source: 'fixture FX' }) });
        assert(both.citations.some(item => item.type === 'live_fx_quote'));
        assert(both.marketQuotes.some(item => item.symbol === 'TSN'));
    } finally { if (savedKey === undefined) delete process.env.NEWSAPI_KEY; else process.env.NEWSAPI_KEY = savedKey; }

    const client = createIssuerResearchClient({ now: () => fixedNow, fetchPage: async url => ({ ok: true, text: async () => url === issuer.url ? '<a href="https://attacker.example/news/news-details/false">Results</a>' : documentHtml }) });
    const issuerEvidence = await groundLiveData({ needsIssuerResearch: true, proteinIssuers: requestedProteinIssuers('TSN') }, 'Analiza TSN', { issuerClient: client });
    assert.equal(issuerEvidence.issuerDocuments[0].date, '2026-09-03');
    assert.equal(issuerEvidence.citations[0].type, 'verified_issuer_document');
    const snapshotNow = Date.parse('2026-10-05T21:00:00Z');
    const cachedClient = createIssuerResearchClient({ now: () => snapshotNow, fetchPage: async () => { throw new Error('public site unavailable'); } });
    const snapshots = await cachedClient.research(requestedProteinIssuers('PPC CALM'));
    assert.equal(snapshots.documents.length, 2);
    assert(snapshots.documents.every(doc => doc.access === 'reviewed_public_summary' && doc.reviewedAt));
    const expiredClient = createIssuerResearchClient({ now: () => snapshotNow + 8 * 86_400_000, fetchPage: async () => { throw new Error('unavailable'); } });
    assert.equal((await expiredClient.research(requestedProteinIssuers('PPC CALM'))).documents.length, 0, 'Do not reuse dated financial summaries indefinitely');
    const updatedNow = Date.parse('2026-10-07T18:00:00Z');
    const unavailableIssuer = createIssuerResearchClient({ now: () => updatedNow, fetchPage: async () => { throw new Error('unavailable'); } });
    const tysonFallback = await unavailableIssuer.research(requestedProteinIssuers('TSN'));
    assert.equal(tysonFallback.documents[0].date, '2026-09-03');
    assert.match(tysonFallback.documents[0].excerpt, /1,850–1,950/);
    const expiredTyson = createIssuerResearchClient({ now: () => updatedNow + 8 * 86_400_000, fetchPage: async () => { throw new Error('unavailable'); } });
    assert.equal((await expiredTyson.research(requestedProteinIssuers('TSN'))).documents.length, 0);
    const hypothetical = 'Soy productor de cerdo. Caso hipotético: vendo 10000 kg a 42 MXN/kg, costo 36 MXN/kg, alimento 60%. Usa únicamente estos supuestos; no busques precios actuales.';
    const scenarioOrchestrator = new AIOrchestrator({ provider: { name: 'fixture', modelForTier: () => 'fixture', stream: async request => {
        assert.match(request.prompt, /CÁLCULO CON SUPUESTOS/);
        assert.equal(request.tools, null);
        return { text: 'La utilidad original es 60000 MXN bajo tus supuestos.', model: 'fixture' };
    } }, retriever: { retrieve: async () => { throw new Error('Scenario must not retrieve market evidence'); }, recordQuery: async () => null, recordEvidence: async () => null },
    liveDataGrounder: async () => { throw new Error('Scenario must not query prices'); } });
    const scenarioResult = await scenarioOrchestrator.stream({ message: hypothetical, history: [], tier: 'flash', onText() {} });
    assert.equal(scenarioResult.evidenceCount, 0);
    assert.doesNotMatch(scenarioResult.text, /Cotización sin confirmar/);

    // The real orchestrator must activate IR research even when the user does
    // not request a quote or headlines. No Gemini call or database write here.
    let researchCalled = false;
    const orchestrator = new AIOrchestrator({ provider: { name: 'fixture', modelForTier: () => 'fixture', stream: async request => {
        assert.match(request.prompt, /Tyson Foods/); return { text: 'Análisis de riesgos con cobertura parcial.', model: 'fixture' };
    } }, retriever: { retrieve: async () => ({ context: '', citations: [], sourceCodes: [], evidenceCount: 0 }), recordQuery: async () => null, recordEvidence: async () => null },
    liveDataGrounder: async plan => { researchCalled = plan.needsIssuerResearch; return issuerEvidence; } });
    await orchestrator.stream({ message: 'Compara TSN y PPC: resultados, deuda y riesgos.', history: [], tier: 'flash', onText() {} });
    assert.equal(researchCalled, true);
    console.log('ORION investor audit regression tests: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
