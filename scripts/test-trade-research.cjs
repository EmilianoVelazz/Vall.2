'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { planQuery, planContext } = require('../backend/ai/query-planner');
const { domainDecision } = require('../backend/ai/domain-policy');
const { guardTradeResearch } = require('../backend/ai/response-quality');
const { AIOrchestrator, shouldUseGoogleSearch } = require('../backend/ai/orchestrator');
const { createTradeResearchClient, tradeResearchEvidence, parseTradeDocument, discoverDocuments, researchPeriod } = require('../backend/services/trade-research');
const { groundLiveData } = require('../backend/ai/live-data-grounder');
const emptyRabobank = { get: async () => ({ records: [], period: null, fetchedAt: null, stale: false,
    warning: null, retrievedCount: 0, catalogTotal: 0, partial: false }) };

const message = 'me puedes decir que acuerdos comerciales de proteinas a habido en los ultimos meses entre china y estados unidos en temas fin';
const plan = planQuery({ message });
assert.equal(domainDecision({ message }).allowed, true);
assert.equal(plan.topic, 'commodities');
assert.equal(plan.requiresWebResearch, true);
assert.equal(plan.needsTradeResearch, true);
assert.equal(plan.needsMercolleida, false);
assert.equal(plan.needsLiveQuote, false);
assert.equal(shouldUseGoogleSearch(plan), true);
assert.match(planContext(plan), /seis meses/);
assert.match(planContext(plan), /entrada en vigor/);
assert.match(planContext(plan), /no que el hecho no exista/);
assert.equal(domainDecision({ message: '¿Qué acuerdos comerciales hubo entre China y Estados Unidos?' }).allowed, true);
assert.equal(planQuery({ message: '¿Qué es un acuerdo comercial?' }).needsTradeResearch, false);
assert.equal(planQuery({ message: 'Precio del cerdo Mercolleida hoy' }).needsTradeResearch, false);
assert.equal(shouldUseGoogleSearch(planQuery({ message: 'Precio del cerdo Mercolleida hoy' })), false);
const follow = planQuery({ message: '¿Y qué productos cubren?', history: [{ role: 'user', content: message }] });
assert.equal(follow.needsTradeResearch, true);
assert.equal(planQuery({ message: 'Ahora analiza Bitcoin', history: [{ role: 'user', content: message }] }).needsTradeResearch, false);
const reportedQuestion = 'dime que acuerdos se an informado en este alño en base al trato comercial de china y estados unidos';
for (const query of [reportedQuestion,'¿Qué acuerdos se han anunciado este año entre China y Estados Unidos?','Dime el trato comercial de China y Estados Unidos en 2026']) {
    const current = planQuery({message:query});
    assert.equal(domainDecision({message:query}).allowed,true,query);
    assert.equal(current.needsTradeResearch,true,query);
    assert.equal(current.tradeScope,'general');
    assert(shouldUseGoogleSearch(current));
    assert.equal(current.recommendedTier,'pro');
}
const broadened=planQuery({message:'Y dime qué acuerdos comerciales anunciaron este año China y Estados Unidos',history:[{role:'user',content:message}]});
assert.equal(broadened.tradeScope,'general','Una pregunta explícita de comercio general no debe convertirse en una pregunta exclusiva de carnes');
assert.equal(broadened.needsProteinResearch,false);
assert.equal(broadened.needsRabobank,false);
assert.match(planContext(broadened),/no la reduzcas a proteínas animales/);
assert.equal(planQuery({message:'¿Y qué acuerdos cubren esas proteínas?',history:[{role:'user',content:message}]}).tradeScope,'proteins');

const falseAnswer = 'En los últimos meses no se han firmado nuevos acuerdos comerciales. Los reportes del USDA son la única confirmación válida.';
assert.equal(guardTradeResearch(plan, { citations: [{ type: 'mercolleida_public_comment', url: 'https://www.mercolleida.com/' }] }, falseAnswer).blocked, true);
assert.equal(guardTradeResearch(plan, { citations: [{ type: 'live_market_quote', url: 'https://finance.yahoo.com/' }] }, falseAnswer).blocked, true);
assert.equal(guardTradeResearch(plan, { citations: [{ type: 'google_search_grounding', url: 'javascript:alert(1)' }] }, falseAnswer).blocked, true);

const citation = { type: 'google_search_grounding', url: 'https://official.example/trade-announcement', source: 'Fuente oficial de prueba' };
assert.equal(guardTradeResearch(plan, { citations: [citation] }, 'Existe un anuncio documentado.').blocked, false);
const localEvidence = () => ({ context: '', citations: [], sourceCodes: [], evidenceCount: 0, charts: [], evidenceRecords: [], retrievalStrategy: 'fixture' });
const publicData = { context: '[MERCOLLEIDA · INFORMACIÓN PÚBLICA]\nMuestra parcial de tendencias, no archivo completo.',
    available: true, citations: [{ type: 'mercolleida_public_comment', source: 'Mercolleida', url: 'https://www.mercolleida.com/', title: 'Comentario de prueba', date: '2026-10-01' }], sourceCodes: ['mercolleida_public'], strategy: 'fixture' };

function renderer(file, name, dependencies = []) {
    const source = fs.readFileSync(path.resolve(__dirname, '../assets/js', file), 'utf8');
    const functions = [...dependencies, name].map(item => {
        const start = source.indexOf(`    function ${item}(`);
        assert(start >= 0);
        const end = source.indexOf('\n    }', start) + '\n    }'.length;
        return source.slice(start, end);
    }).join('\n');
    return value => vm.runInNewContext(`${functions}\n${name}(input)`, { input: value });
}

for (const render of [renderer('vall-ai-page-v4.js', 'markdown', ['escapeHtml'])]) {
    const link = render('- [Casa Blanca · 2026-05-17](https://www.whitehouse.gov/fact-sheets/2026/05/test/)');
    assert.match(link, /<a href="https:\/\/www\.whitehouse\.gov/);
    assert.match(link, /rel="noopener noreferrer"/);
    assert.match(render('[Fuente](<https://www.mercolleida.com/>)'), /<a href="https:\/\/www\.mercolleida\.com\/"/);
    assert.match(render('[Fuente]\\([https://www.mercolleida.com/](https://www.mercolleida.com/))'), /<a href="https:\/\/www\.mercolleida\.com\/"/);
    assert(!render('[Peligro](javascript:alert(1))').includes('<a '));
    assert(!render('[Fuente](https://official.example/"onmouseover="alert(1))').includes('href="https://official.example/"onmouseover'));
}

(async () => {
    const time = Date.parse('2026-10-02T16:00:00Z');
    assert.deepEqual(researchPeriod('últimos tres meses', time), { start: '2026-07-02', end: '2026-10-02', assumption: false });
    assert.equal(researchPeriod('último mes', Date.parse('2026-03-31T16:00:00Z')).start, '2026-02-28');
    assert.equal(researchPeriod('en 2025', time).end, '2025-12-31');
    assert.deepEqual(researchPeriod('en este año',time),{start:'2026-01-01',end:'2026-10-02',assumption:false});
    assert.equal(researchPeriod(reportedQuestion,time).start,'2026-01-01');
    assert.deepEqual(researchPeriod('el año pasado',time),{start:'2025-01-01',end:'2025-12-31',assumption:false});
    assert.equal(researchPeriod('en este año',Date.parse('2026-01-01T02:00:00Z')).start,'2025-01-01','El año corresponde a la fecha de México, no a UTC');
    const officialUrl = 'https://www.whitehouse.gov/fact-sheets/2026/09/china-trade-fixture/';
    const fixture = '<meta property="article:published_time" content="2026-09-26T03:00:00Z"><h1>U.S.-China agricultural agreement</h1><time datetime="2026-09-25T23:00:00-04:00">September 25, 2026</time><div class="wp-block-post-content"><p>China and the United States agreed on agricultural trade.</p><ul><li>China restored market access for U.S. beef facilities.</li><li>The countries recommended reduced tariff treatment for fish and seafood.</li></ul></div><div><p>China will import pork worth a billion dollars: unrelated related-news teaser.</p></div>';
    const parsed = parseTradeDocument(fixture, officialUrl);
    assert.equal(parsed.date, '2026-09-25', 'Se conserva la fecha de publicación local, no el día UTC siguiente');
    assert(!parsed.excerpts.join(' ').includes('pork'), 'Se excluyen noticias relacionadas ajenas al documento');
    assert.equal(parseTradeDocument('<h1>Log in</h1>', officialUrl), null);
    assert.equal(parseTradeDocument(fixture, 'https://evil.example/trade/'), null);
    assert.equal(parseTradeDocument(fixture.replaceAll('2026-09-25', '2026-02-31').replaceAll('2026-09-26', '2026-02-31').replace('September 25, 2026', ''), officialUrl), null);
    assert.equal(parseTradeDocument(fixture.replace(/<div class="wp-block-post-content">[\s\S]*?<\/div>/, '<div class="wp-block-post-content"><p>Unrelated domestic announcement.</p></div>'), officialUrl), null);
    const generalFixture = '<h1>U.S.-China trade and investment</h1><time datetime="2026-09-25T23:00:00-04:00"></time><div class="wp-block-post-content"><p>The United States and China recommended reduced tariff treatment for non-sensitive goods.</p><p>China will import coal from the United States in 2027 and 2028.</p><p>The two countries established a Board of Investment.</p></div><div><p>A related headline claims a tariff already entered into force.</p></div>';
    const generalDoc=parseTradeDocument(generalFixture,officialUrl);
    assert(generalDoc,'Un acuerdo comercial general no requiere mencionar carne');
    assert.match(generalDoc.excerpts.join(' '),/coal/);
    assert.match(generalDoc.excerpts.join(' '),/Board of Investment/);
    assert.doesNotMatch(generalDoc.excerpts.join(' '),/already entered/);
    const chineseUrl='https://www.fmprc.gov.cn/eng./xw/zyxw/202609/t20260926_12031663.html';
    const chineseDoc=parseTradeDocument('<meta name="PubDate" content="2026-09-26"><div class="news_header_title">China and the United States deliverables</div><div class="content_text"><p>China and the United States reached an arrangement for reciprocal tariff reduction.</p><p>The two sides established an AI dialogue.</p></div>',chineseUrl);
    assert.equal(chineseDoc.date,'2026-09-26');
    assert.equal(chineseDoc.source,'Cancillería de China');
    assert.match(chineseDoc.excerpts.join(' '),/AI dialogue/);
    assert.deepEqual(discoverDocuments(`<a href="${officialUrl}">China agricultural trade</a><a href="https://evil.example">China agricultural trade</a><a href="https://www.whitehouse.gov@evil.example/test">China trade</a>`, 'https://www.whitehouse.gov/news/'), [officialUrl]);
    let calls = 0;
    const client = createTradeResearchClient({ now: () => time, sources: [], seeds: [officialUrl], fetchPage: async () => {
        calls += 1;
        return { ok: true, headers: { get: () => 'text/html' }, text: async () => fixture };
    } });
    const parallel = await Promise.all([client.get(message), client.get(message)]);
    assert.equal(calls, 1);
    assert.equal(parallel[0].documents.length, 1);
    assert.equal((await client.get('China Estados Unidos últimos tres meses')).documents.length, 1);
    assert.equal((await client.get('China Estados Unidos en 2025')).documents.length, 0);
    assert.equal((await client.get('Brasil y México')).documents.length, 0, 'No se atribuyen acuerdos China-EE. UU. a otros países');
    const verified = await groundLiveData(plan, message, { tradeClient: client, rabobankClient: emptyRabobank, mercolleidaClient: { get: () => { throw new Error('No consultar tendencias para acuerdos'); } } });
    assert.equal(verified.available, true);
    assert.equal(guardTradeResearch(plan, verified, 'Un anuncio verificado.').blocked, false, 'Los documentos leídos no dependen de metadatos de Google');
    assert.match(verified.context, /2026-04-02 a 2026-10-02/);
    assert.equal(guardTradeResearch(plan, { citations: verified.citations }, 'Anuncio').blocked, true, 'Una etiqueta de fuente sin documento no basta');
    assert.equal(guardTradeResearch(plan,verified,falseAnswer).needsRevision,true,'Una fuente válida no convierte una negación contradictoria en una buena respuesta');
    const down = createTradeResearchClient({ now: () => time, sources: [], seeds: [officialUrl], fetchPage: async () => { throw new Error('offline'); } });
    assert.equal((await tradeResearchEvidence(message, down)).available, false);
    for (const method of ['generateStructured', 'stream']) {
        const answerText = `Hay un anuncio oficial de 2026-09-25: China restauró el acceso para carne de res estadounidense. [Casa Blanca](${officialUrl}).\n\nInferencia: podría mejorar la salida exportadora si se concreta.`;
        const orchestrator = new AIOrchestrator({
            liveDataGrounder: (p, m) => groundLiveData(p, m, { tradeClient: client, rabobankClient: emptyRabobank }),
            retriever: { retrieve: async () => ({ ...localEvidence(), citations: publicData.citations, evidenceCount: 10 }), recordQuery: async () => null, recordEvidence: async () => null },
            provider: { name: 'fixture', isConfigured: () => true,
                generate: async request => { assert.match(request.prompt, /DOCUMENTOS COMERCIALES OFICIALES VERIFICADOS/); return { text: answerText, model: 'fallback', grounding: null }; },
                stream: async request => { request.onText(answerText, answerText); return { text: answerText, model: 'fallback', grounding: null }; },
            },
        });
        const answer = await orchestrator[method]({ message, history: [], tier: 'flash', onText() {} });
        assert.match(answer.text, /Hay un anuncio oficial/);
        assert.equal(answer.evidenceCount, 1);
        assert.deepEqual(answer.citations.map(item => item.type), ['verified_trade_document']);
        assert.match(answer.text, /Casa Blanca · 2026-09-25/);
        assert(!answer.text.includes('Mercolleida'));
    }
    for (const method of ['generateStructured','stream']) {
        let generations=0;
        const emitted=[];
        const corrected=`Identifiqué anuncios comerciales de 2026-09-25. Los países recomendaron trato arancelario favorable para bienes no sensibles; la recomendación no acredita una reducción vigente. [Casa Blanca](${generalDoc.url}).`;
        const chat=new AIOrchestrator({liveDataGrounder:async()=>({...verified,tradeDocuments:[generalDoc]}),
            retriever:{retrieve:async()=>localEvidence(),recordQuery:async()=>null,recordEvidence:async()=>null},
            provider:{name:'fixture',isConfigured:()=>true,
                generate:async()=>({text:++generations===1 && method==='generateStructured' ? falseAnswer : corrected,model:'fixture'}),
                stream:async request=>{request.onText(falseAnswer,falseAnswer);return {text:falseAnswer,model:'fixture'};}}});
        const answer=await chat[method]({message:reportedQuestion,history:[],tier:'flash',onText:part=>emitted.push(part)});
        assert.match(answer.text,/Identifiqué anuncios/);
        assert.doesNotMatch(answer.text,/no se han firmado/);
        assert.equal(generations,method==='stream'?1:2,'La revisión debe ocurrir sólo una vez');
        assert(!emitted.join('').includes('no se han firmado'),'No transmitir una negación antes de revisarla');
    }
    for (const grounded of [false, true]) {
        for (const method of ['generateStructured', 'stream']) {
            const emitted = [];
            let requestedTools = null;
            const text = grounded ? 'Se documentó un acuerdo comercial en el anuncio oficial de prueba, fechado dentro del periodo solicitado.' : falseAnswer;
            const grounding = grounded ? { groundingChunks: [{ web: { uri: citation.url, title: citation.source } }] } : null;
            const providerResponse = { text, model: 'fixture', grounding };
            const orchestrator = new AIOrchestrator({
                liveDataGrounder: async () => publicData,
                retriever: { retrieve: async () => localEvidence(), recordQuery: async () => null, recordEvidence: async () => null },
                provider: {
                    name: 'fixture', isConfigured: () => true,
                    generate: async request => { requestedTools = request.tools; return providerResponse; },
                    stream: async request => {
                        requestedTools = request.tools;
                        request.onText(text.slice(0, 35), text.slice(0, 35));
                        request.onText(text.slice(35), text);
                        assert.equal(emitted.length, 0, 'No se muestra el borrador antes de comprobar la búsqueda');
                        return providerResponse;
                    },
                },
            });
            const answer = await orchestrator[method]({ message, history: [], tier: 'flash', onText: part => emitted.push(part) });
            assert.deepEqual(requestedTools, [{ googleSearch: {} }]);
            if (grounded) {
                assert.match(answer.text, /Se documentó un acuerdo/);
                assert.match(answer.text, /https:\/\/official\.example\/trade-announcement/);
                assert(answer.citations.some(item => item.type === 'google_search_grounding'));
            } else {
                assert.match(answer.text, /No pude verificar/);
                assert.equal(answer.evidenceCount, 0, 'Las tendencias irrelevantes no cuentan como fuentes del acuerdo');
                assert.equal(answer.citations.length, 0);
                assert(!answer.text.includes('Comentario de prueba'));
                assert(!answer.text.includes('no se han firmado'));
                assert(!answer.text.includes('única confirmación válida'));
                assert(!emitted.join('').includes('no se han firmado'));
            }
            if (method === 'stream') assert.equal(emitted.length, 1);
        }
    }
    console.log('Trade agreements research and unverified-answer guard tests: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
