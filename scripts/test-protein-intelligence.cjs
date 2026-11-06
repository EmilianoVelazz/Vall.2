'use strict';

const assert = require('node:assert/strict');
const { PRODUCTS, proteinProfile, proteinResearchContext, numericPrice, isoDate, parseEuPrices, parseUsPrices, createProteinPriceClient, proteinPriceEvidence, proteinNewsQuery } = require('../backend/services/protein-market-intelligence');
const { planQuery, planContext, mergeEvidence } = require('../backend/ai/query-planner');
const { groundLiveData, liveNews, newsContext, selectNews } = require('../backend/ai/live-data-grounder');
const { domainDecision } = require('../backend/ai/domain-policy');
const { AIOrchestrator, shouldUseGoogleSearch } = require('../backend/ai/orchestrator');
const { scopeTradeEvidence, guardTradeResearch, auditResponse } = require('../backend/ai/response-quality');
const { blsRetailSnapshot } = require('../backend/ai/protein-training-sources');
const { selectRecords: selectRabobankRecords } = require('../backend/services/rabobank-public');

const NOW = Date.parse('2026-10-05T12:00:00Z');
const period = { start: '2026-09-01', end: '2026-10-05' };
const euRow = { memberStateCode: 'ES', memberStateName: 'Spain', beginDate: '21/09/2026', endDate: '27/09/2026', price: '€170.70', unit: '100 KG', pigClass: 'E' };
const response = data => ({ ok: true, status: 200, text: async () => JSON.stringify(data) });

assert.deepEqual(proteinProfile('Precios mundiales de cerdo, pollo, huevo y res').products, ['pork','poultry','eggs','beef']);
assert.deepEqual(proteinProfile('Precio del huevo en México').products, ['eggs']);
assert.deepEqual(proteinProfile('Precio del puerco en Sudáfrica').countries, ['ZA']);
assert.deepEqual(proteinProfile('Precios del pollo en Chequia').countries, ['CZ']);
assert.deepEqual(proteinProfile('¿Y las noticias?', 'Precios mundiales de proteínas').products, ['pork','poultry','eggs','beef']);
assert(proteinProfile('¿Y las noticias?', 'Precios mundiales de cerdo').global);
assert.deepEqual(proteinProfile('¿Y en Brasil?', 'Precio del huevo en México').countries, ['BR']);
assert.match(proteinResearchContext(proteinProfile('precios mundiales de proteínas')), /Bloomberg Terminal/);
assert.match(proteinNewsQuery(proteinProfile('noticias de cerdo y huevo en China')), /pork.*egg.*China/);
for (const message of ['Precio del huevo', 'Precio de la res', 'Puerco', 'Chicken market']) assert(domainDecision({ message }).allowed, message);
assert.equal(domainDecision({ message: 'Dame una receta de pollo' }).allowed, false);
const combinedQuery = 'Compara los precios mundiales de cerdo, pollo, huevo y res hoy, noticias internacionales y acuerdos entre países; usa Mercolleida y Rabobank';
const plan = planQuery({ message: combinedQuery });
for (const flag of ['needsProteinPrices','needsProteinResearch','needsMercolleida','needsRabobank','needsLiveNews','needsTradeResearch','requiresWebResearch']) assert.equal(plan[flag], true, flag);
assert.equal(plan.needsLiveQuote, false, 'No usar futuros como cotización física mundial');
assert(shouldUseGoogleSearch(plan));
assert.match(planContext(plan), /moneda\/unidad/);
assert.equal(planQuery({ message: 'Precio del huevo hoy' }).needsProteinPrices, true);
assert.equal(planQuery({ message: 'Precio del futuro de cerdo CME hoy' }).needsProteinPrices, false);
assert.equal(proteinProfile('Precios del cerdo en España y noticias internacionales').global,false);
assert.deepEqual(planQuery({message:'Precio del cerdo en España. Usa una tabla.'}).proteinProfile.countries,['ES']);
assert.deepEqual(planQuery({message:'Precios del cerdo USA'}).proteinProfile.countries,['US']);
assert.deepEqual(proteinProfile('Precios del cerdo en usa').countries,['US']);
const raboFixture = [{title:'Global pork outlook',date:'2026-10-01',url:'https://www.rabobankna.com/knowledge-hub/pork-outlook/',source:'Rabobank',access:'public_article',paragraphs:['Global pork supply faces changes in demand and export markets.']}];
assert.equal(selectRabobankRecords(raboFixture,'Rabobank cerdo. Usa una tabla.',NOW).records.length,1);
assert.equal(selectRabobankRecords(raboFixture,'Rabobank cerdo USA',NOW).records.length,0,'Una referencia global sin mencionar EE. UU. no cubre ese país');
assert.equal(planQuery({ message: 'Dame noticias internacionales de cerdo y Mercolleida' }).needsLiveNews, true);
assert(shouldUseGoogleSearch(planQuery({ message: 'Dame noticias internacionales de cerdo y Mercolleida' })));

assert.equal(numericPrice(null), null);
assert.equal(numericPrice(''), null);
assert.equal(numericPrice('0'), null);
assert.equal(numericPrice('€170.70'), 170.7);
assert.equal(numericPrice('no reportado'), null);
assert.equal(isoDate('31/02/2026'), null);
assert.equal(isoDate('09/27/2026','us'), '2026-09-27');
const pork = PRODUCTS[0];
const records = parseEuPrices([euRow, { ...euRow, price:'€180.00', beginDate:'14/09/2026', endDate:'20/09/2026' }, { ...euRow, price:'' }, { ...euRow, endDate:'27/09/2027' }, { ...euRow, memberStateCode:'FR' }, { ...euRow, price:'$170.70' }], pork, ['ES'], period, NOW);
assert.equal(records.length, 1);
assert.equal(records[0].value, 170.7);
assert.equal(records[0].date, '2026-09-27');
assert.equal(records[0].unit, '100 KG');
const usRows = { results: [ { report_date:'09/23/2026', pork_carcass:'96.00' }, { report_date:'09/30/2026', pork_carcass:'98.40' }, { report_date:'10/07/2026', pork_carcass:'104' }, { report_date:'10/01/2026', pork_carcass:'' } ] };
assert.equal(parseUsPrices(usRows, pork, period)[0].value, 98.4, 'Ordenar por fecha; no confiar en la primera fila');
assert.match(parseUsPrices(usRows,pork,period)[0].unit, /100 lb/);

(async () => {
    const bls = await blsRetailSnapshot(async (_url,options) => {
        const seriesid = JSON.parse(options.body).seriesid;
        assert.deepEqual(seriesid,['APU0000703112','APU0000FF1101','APU0000708111','APU0000FD3101']);
        return {Results:{series:seriesid.map((seriesID,index)=>({seriesID,data:[{year:'2025',period:'M01',value:'1'},{year:'2025',period:'M13',value:'99'},{year:'2025',period:'M02',value:String(index+2)}]}))}};
    });
    assert.equal(bls.payload.prices.pollo.value,3);
    assert.equal(bls.payload.prices.cerdo.value,5);
    assert.equal(bls.payload.prices.huevo.unit,'USD/dozen');
    assert.equal(bls.payload.prices.res.period,'2025-02');
    assert.match(bls.payload.prices.pollo.category,/Chicken breast/);
    let calls = 0;
    const urls = [];
    const source = createProteinPriceClient({ now: () => NOW, fetchPage: async url => { calls++; urls.push(url); return response([euRow]); } });
    const profile = proteinProfile('Precios del cerdo en España');
    const results = await Promise.all([source.get(profile), source.get(profile)]);
    assert.equal(calls,1,'Deduplicar peticiones simultáneas');
    assert(results.every(item => item.records.length === 1));
    await source.get(profile);
    assert.equal(calls,1,'Reutilizar caché fresco');
    const evidence = await proteinPriceEvidence(profile,source);
    assert.match(evidence.context,/no un promedio/);
    assert.equal(evidence.citations[0].type,'verified_protein_price');
    assert.equal(evidence.citations[0].date,'2026-09-27');
    assert.equal(new URL(evidence.citations[0].url).searchParams.get('memberStateCodes'),'ES','El enlace debe permitir reproducir el filtro geográfico');
    assert.equal(evidence.proteinPrices.count,1);
    const mexican = await source.get(proteinProfile('Precio del huevo en México'));
    assert.equal(calls,4,'Consultar los tres meses de la ventana de 42 días del SNIIM');
    assert.match(urls.at(-1),/economia-sniim.*e_Hue/);
    assert.equal(mexican.records.length,0,'Una respuesta europea no se puede reinterpretar como precio mexicano');
    await source.get(proteinProfile('Precio del cerdo en pie en España'));
    assert.equal(calls,4,'No sustituir peso vivo por canal');
    const scoped = createProteinPriceClient({ now: () => NOW, fetchPage: async url => { urls.push(url); return response([]); } });
    await scoped.get(proteinProfile('Precio del cerdo en España en 2023'));
    assert.equal(new URL(urls.at(-1)).searchParams.get('endDate'),'31/12/2023','Mantener el periodo pedido');

    const articles = [
        {title:'Pork prices and exports rise',url:'https://news.example/pork',domain:'news.example',seendate:'20261001T120000Z'},
        {title:'Egg market disruption',url:'https://news.example/eggs',domain:'news.example',seendate:'20261001T130000Z'},
        {title:'Chicken recipe of the week',url:'https://news.example/recipe',domain:'news.example',seendate:'20261001T130000Z'},
        {title:'Beef trade agreements reviewed',url:'https://news.example/beef',domain:'news.example',seendate:'20261001T140000Z'},
        {title:'Poultry export demand increases',url:'https://news.example/chicken',domain:'news.example',seendate:'20261001T150000Z'},
    ];
    const savedKey = process.env.NEWSAPI_KEY;
    delete process.env.NEWSAPI_KEY;
    try {
        const news = await liveNews(combinedQuery, async url => { assert.match(url,/startdatetime=\d{14}/); assert.match(url,/enddatetime=\d{14}/); return {ok:true,json:async()=>({articles})}; },{profile:plan.proteinProfile,now:NOW});
        assert.equal(news.length,0,'Hoy no incluye titulares indexados cuatro días antes');
        news.push(...await liveNews('Noticias mundiales de proteínas de los últimos siete días',async()=>({ok:true,json:async()=>({articles})}),{profile:plan.proteinProfile,now:NOW}));
        assert.equal(news.length,4);
        assert(news.every(item => item.publishedAt === null && item.indexedAt));
        const context = newsContext(news);
        assert.match(context.context,/Indexación|indexación/);
        assert(context.citations.every(item=>item.date === null && item.access === 'headline_or_summary'));
    } finally { if(savedKey === undefined) delete process.env.NEWSAPI_KEY; else process.env.NEWSAPI_KEY=savedKey; }
    assert.equal(selectNews([{title:'Future egg market',url:'https://news.example/future',publishedAt:'2099-01-01'}],plan.proteinProfile).length,0);

    const mercolleidaClient = { get:async()=>({records:[],stale:false,warning:null,fetchedAt:null}) };
    const rabobankClient = { get:async()=>({records:[],stale:false,partial:false,warning:null}) };
    const tradeClient = { get:async()=>({documents:[],period,warnings:[],fetchedAt:null}) };
    let marketCalls=0;
    const live = await groundLiveData(plan,combinedQuery,{mercolleidaClient,rabobankClient,tradeClient,proteinPriceClient:source,
        marketGrounder:async()=>{marketCalls++; return {context:'Titular internacional recuperado',available:true,citations:[{id:'L1',title:'Pork news',source:'Noticias',url:'https://news.example/pork',type:'live_news'}],sourceCodes:['fixture_news'],strategy:'news_fixture'};} });
    assert.equal(marketCalls,1,'Mercolleida y acuerdos no deben excluir noticias');
    assert(live.proteinPrices.available);
    assert(live.mercolleida && live.rabobank);
    assert(live.citations.some(item=>item.type === 'live_news'));
    const merged=mergeEvidence({context:'',citations:[],sourceCodes:[],evidenceCount:0},live);
    assert(merged.proteinPrices.available);
    const tradeGuard = guardTradeResearch(plan,merged,'Acuerdo supuesto');
    assert(tradeGuard.blocked,'Un precio no demuestra un tratado');
    assert.match(tradeGuard.text,/170.7/,'La falta de documentos comerciales no debe descartar los precios recuperados');
    assert.doesNotMatch(tradeGuard.text,/Acuerdo supuesto/);
    const scopedEvidence=scopeTradeEvidence(plan,merged);
    assert(scopedEvidence.citations.some(item=>item.type==='verified_protein_price'),'Conservar precios de una solicitud mixta sin usarlos para acreditar acuerdos');
    const multiplePrices = scopeTradeEvidence(plan,{...merged,citations:[evidence.citations[0],{...evidence.citations[0],id:'P2',title:'Cerdo · Francia'}]});
    assert.equal(multiplePrices.citations.length,2,'Un endpoint puede aportar cotizaciones de varios mercados');
    const partial = await groundLiveData({...plan,needsTradeResearch:false,needsMercolleida:false,needsRabobank:false},combinedQuery,{proteinPriceClient:source,marketGrounder:async()=>{throw Error('offline');}});
    assert(partial.available && partial.proteinPrices.available);
    assert.match(partial.context,/COBERTURA PARCIAL/);
    const timed = await groundLiveData({...plan,needsTradeResearch:false,needsMercolleida:false,needsRabobank:false},combinedQuery,{proteinPriceClient:source,marketGrounder:()=>new Promise(()=>{}),sourceTimeoutMs:20});
    assert(timed.proteinPrices.available && timed.available,'Conservar precios aunque otro proveedor exceda el tiempo de consulta');
    assert.match(timed.context,/COBERTURA PARCIAL/);
    const newsAudit=auditResponse({text:'Referencias de la Comisión Europea',plan:{needsProteinPrices:true,needsLiveNews:true},liveData:{proteinPrices:{available:true},marketDataAvailable:false},evidence});
    assert.match(newsAudit.disclosure,/Noticias/);
    assert.doesNotMatch(newsAudit.disclosure,/No uses cifras/,'No invalidar precios confirmados por una falla de noticias');

    for (const method of ['stream','generateStructured']) {
        const requests=[];
        const provider = {name:'fixture',isConfigured:()=>true,
            generate:async request=>{requests.push(request);return {text:'Cerdo en España: 170.70 EUR/100 kg, semana terminada el 27 de septiembre de 2026, Comisión Europea.',model:'fixture'};},
            stream:async request=>{requests.push(request);const text='Cerdo en España: 170.70 EUR/100 kg, semana terminada el 27 de septiembre de 2026, Comisión Europea.';request.onText(text,text);return {text,model:'fixture'};}};
        const chat=new AIOrchestrator({provider,liveDataGrounder:async()=>evidence,retriever:{retrieve:async()=>({context:'',citations:[],sourceCodes:[],evidenceCount:0,charts:[],evidenceRecords:[],retrievalStrategy:'fixture'}),recordQuery:async()=>null,recordEvidence:async()=>null}});
        const answer=await chat[method]({message:'Precio del cerdo en España hoy',history:[],tier:'flash',onText(){}});
        assert.match(requests.at(-1).prompt,/PRECIOS FÍSICOS DE PROTEÍNAS VERIFICADOS/);
        assert.deepEqual(requests.at(-1).tools,[{googleSearch:{}}]);
        assert(answer.response.meta.proteinPrices.available);
        assert(answer.citations.some(item=>item.type==='verified_protein_price'));
        assert.match(answer.text,/api\.tech\.ec\.europa\.eu/);
    }
    console.log('Protein intelligence: products, geography, dates, units, news, parallel sources and both chat paths OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
