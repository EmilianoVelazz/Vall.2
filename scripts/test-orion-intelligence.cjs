'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cases=require('./lib/orion-intelligence-regressions.json');
const {planQuery}=require('../backend/ai/query-planner');
const {AIOrchestrator}=require('../backend/ai/orchestrator');
const {prepareBusinessConversation,sanitizeMemory,normalizeBusinessProfile}=require('../backend/ai/business-memory');
const {parseCommercialInputs,calculateMargin}=require('../backend/ai/commercial-calculator');
const {guardProteinPrices}=require('../backend/ai/protein-price-quality');
const {RagRetriever}=require('../backend/ai/rag-retriever');
const {conceptualSimilarity}=require('../backend/ai/semantic-search');
const {domainDecision}=require('../backend/ai/domain-policy');
let checks=0;
function check(fn) {fn();checks++;}
const empty={context:'',citations:[],sourceCodes:[],evidenceCount:0,charts:[],evidenceRecords:[],retrievalStrategy:'fixture'};
async function main() {
    for(const item of cases) {
        const p=planQuery({message:item.message,history:[]});
        if(item.country) check(()=>assert.deepEqual(p.proteinProfile.countries,[item.country],item.id));
        if(Object.hasOwn(item,'state')) check(()=>assert.deepEqual(p.proteinProfile.mexicoStates,item.state ? [item.state] : [],item.id));
        if(item.clarification) check(()=>assert.equal(p.locationClarification?.name,item.clarification,item.id));
        if(Object.hasOwn(item,'forecast')) check(()=>assert.equal(p.asksForecast,item.forecast,item.id));
    }
    const original='Mi empresa vende res, cerdo, huevo y pollo en México. Compara precio de cerdo en canal en Puebla.';
    const history=[{role:'user',content:original},...Array.from({length:34},()=>({role:'user',content:'Y conserva la presentación y el mercado'}))];
    const prepared=prepareBusinessConversation({message:'¿Y cuánto me cuesta llevarlo a Jalisco?',history});
    check(()=>assert(domainDecision({message:prepared.message,history:prepared.history}).allowed));
    check(()=>assert.deepEqual(planQuery({message:prepared.message,history:prepared.history}).proteinProfile.products,['pork','poultry','eggs','beef']));
    check(()=>assert.equal(prepared.conversationMemory.profile.priceBasis,'carcass'));
    const recalled=prepareBusinessConversation({message:'Y en Mérida',history:[],conversationMemory:prepared.conversationMemory});
    check(()=>assert.deepEqual(planQuery({message:recalled.message,history:recalled.history}).proteinProfile.mexicoStates,['YUC']));
    const switched=prepareBusinessConversation({message:'Cambiando de tema: precio del petróleo hoy',conversationMemory:prepared.conversationMemory});
    check(()=>assert.equal(switched.conversationMemory,null));
    for(const malformed of [{profile:{products:'pork',countries:1,mexicoStates:{}}},{inputs:{buyPricePerKg:1e300}},[],null]) check(()=>assert.doesNotThrow(()=>sanitizeMemory(malformed)));
    check(()=>assert.deepEqual(normalizeBusinessProfile({products:['pork','secret','pork'],currency:'INVALID',markets:['México',9]}).products,['pork']));
    const exercise='Compro 1000 kg de cerdo a 80 MXN/kg, vendo a 110 MXN/kg, merma 8%, flete 5000 MXN. Calcula mi margen.';
    const inputs=parseCommercialInputs(exercise),calculation=calculateMargin(inputs);
    check(()=>assert.equal(calculation.sellableKg,920));
    check(()=>assert.equal(calculation.totalCost,85000));
    check(()=>assert.equal(calculation.revenue,101200));
    check(()=>assert.equal(calculation.profit,16200));
    check(()=>assert(Math.abs(calculation.marginOnSalePercent-16.00790513833992)<1e-8));
    check(()=>assert.equal(calculateMargin({...inputs,shrinkFraction:1}).available,false));
    check(()=>assert.equal(calculateMargin({...inputs,mixedCurrencies:true}).available,false));
    check(()=>assert.equal(calculateMargin(parseCommercialInputs('Y venta a 100 USD/kg',inputs)).available,false,'Una venta en otra moneda no convierte automáticamente los costos anteriores'));
    check(()=>assert.equal(calculateMargin(parseCommercialInputs('Todos los costos en USD: compra a 80 USD/kg, venta a 100 USD/kg',inputs)).available,true,'Una declaración explícita cambia la moneda del ejercicio completo'));
    check(()=>assert.equal(calculateMargin({...inputs,incoterm:'CIF'}).available,false));
    check(()=>assert.equal(calculateMargin({...inputs,requiresTransformation:true}).available,false));
    check(()=>assert.equal(calculateMargin({...inputs,duties:null}).available,false));
    check(()=>assert.equal(calculateMargin({...inputs,currency:null}).available,false));
    check(()=>assert.equal(calculateMargin({...inputs,purchasedKg:1e300}).available,false));
    const rate=parseCommercialInputs('flete 5 MXN/kg',inputs);
    check(()=>assert.equal(calculateMargin(rate).totalCost,85000));
    const revised=parseCommercialInputs('Y flete 2000 MXN',rate);
    check(()=>assert.equal(calculateMargin(revised).totalCost,82000));
    check(()=>assert.equal(parseCommercialInputs('Ahora son 20 toneladas').purchasedKg,20000));
    check(()=>assert.equal(parseCommercialInputs('Y compra a 78 MXN/kg').buyPricePerKg,78));
    check(()=>assert.equal(parseCommercialInputs('venta 1000 kg').sellPricePerKg,undefined));
    check(()=>assert.equal(parseCommercialInputs('merma 0.125').shrinkFraction,0.125));
    check(()=>assert.equal(parseCommercialInputs('Compro 1,000 kg a 80 MXN/kg').purchasedKg,1000));
    const quotePlan=planQuery({message:'Precio del huevo por docena en España hoy'});
    const record={verified:true,productId:'eggs',product:'Huevo',countryCode:'ES',country:'España',category:'Docena',value:2.5,currency:'EUR',unit:'EUR/docena',priceBasis:'pieces',date:'2026-10-07',url:'https://example.invalid/observacion'};
    const valid='| Huevo | España | 2.50 EUR/docena | 2026-10-07 | [Fuente](https://example.invalid/observacion) |';
    const evidence={...empty,proteinPriceRecords:[record]};
    check(()=>assert.equal(guardProteinPrices(quotePlan,evidence,valid).blocked,false));
    const normalizedQuote=guardProteinPrices(quotePlan,evidence,valid).text;
    for(const bad of [valid.replace('2.50','9999.00'),valid.replace('España','Alemania'),valid.replace('docena','kg'),valid.replace('Huevo','Cerdo'),valid.replace('2026-10-07','2026-10-08'),valid.replace('/observacion','/otro'),valid.replace('2.50','2.50–9999')]) check(()=>{const guarded=guardProteinPrices(quotePlan,evidence,bad);assert(guarded.blocked || guarded.changed,bad);assert.equal(guarded.text,normalizedQuote,'Una tabla regenerada debe conservar exactamente la evidencia verificada, sin la cifra alterada');});
    check(()=>assert(guardProteinPrices(quotePlan,empty,valid).blocked));
    check(()=>assert(guardProteinPrices({...quotePlan,needsProteinPrices:false,needsProteinResearch:true},empty,valid).blocked));
    check(()=>assert(conceptualSimilarity('Enfermedad de cerdo afecta importaciones','African swine fever restricts pork imports')>0.7));
    check(()=>assert.equal(conceptualSimilarity('Precio del huevo','Crude oil futures'),0));
    const queryLog=[];
    const rag=new RagRetriever({pool:{execute:async(sql)=>{queryLog.push(sql);return [sql.includes('LIMIT 24') ? [{document_id:1,chunk_id:1,title:'African swine fever',content:'Swine disease restricts imports',trust_score:90,source_code:'official',document_type:'news_article',published_at:new Date(),canonical_url:'https://example.invalid/doc'}] : []];}}});
    const documents=await rag.retrieveDocuments('Enfermedad de cerdo afecta importaciones');
    check(()=>assert.equal(documents[0]?.chunk_id,1));
    check(()=>assert.equal(documents[0]?.retrieval_mode,'hybrid_conceptual'));
    const context=rag.formatContext({documents:[],events:[],economic:[],market:{rows:[]},memory:[{question_text:'Precio del cerdo',response_text:'99999 MXN/kg',rating:1,correction_text:'Revisa la plaza'}],neuralRules:[]});
    check(()=>assert.doesNotMatch(context,/99999|obedece|OBLIGATORIAMENTE/));
    for(const method of ['stream','generateStructured']) {
        let providerCalls=0;
        const provider={name:'fixture',isConfigured:()=>true,generate:async()=>{providerCalls++;return {text:'Respuesta de control',model:'fixture'};},stream:async request=>{providerCalls++;request.onText?.('Respuesta de control');return {text:'Respuesta de control',model:'fixture'};}};
        const chat=new AIOrchestrator({provider,liveDataGrounder:async()=>empty,forecastBuilder:async()=>null,statisticsBuilder:async()=>null,retriever:{retrieve:async()=>empty,recordQuery:async()=>null,recordEvidence:async()=>null}});
        const chunks=[];
        const answer=await chat[method]({message:exercise,history:[],onText:text=>chunks.push(text)});
        check(()=>assert.equal(providerCalls,0));
        check(()=>assert.match(answer.text,/16\.01%/));
        check(()=>assert.equal(answer.response.meta.calculation.profit,16200));
        const follow=await chat[method]({message:'Y recalcula con venta a 120 MXN/kg',history:[],conversationMemory:answer.response.meta.conversationMemory});
        check(()=>assert.equal(follow.response.meta.calculation.revenue,110400));
        const ambiguous=await chat[method]({message:'Precio del huevo en Mérida',history:[]});
        check(()=>assert.match(ambiguous.text,/Yucatán, México/));
        check(()=>assert.equal(ambiguous.response.meta.conversationMemory.pendingLocation,'Mérida'));
        const resolved=prepareBusinessConversation({message:'México',conversationMemory:ambiguous.response.meta.conversationMemory});
        check(()=>assert.deepEqual(planQuery({message:resolved.message,history:resolved.history}).proteinProfile.mexicoStates,['YUC']));
        check(()=>assert.deepEqual(planQuery({message:resolved.message,history:resolved.history}).proteinProfile.products,['eggs']));
        check(()=>assert.equal(planQuery({message:resolved.message,history:resolved.history}).needsProteinPrices,true));
        check(()=>assert.equal(chat.tools.describe()[0].name,'commercial_margin'));
        const forbidden=await chat[method]({message:'Escribe un programa Python para calcular mi margen. '+exercise,history:[]});
        check(()=>assert.equal(forbidden.response.meta.taskType,'domain_redirect'));
    }
    const { detectTaskType } = require('../backend/ai/prompt-builder');
    const { buildDataInventoryContext } = require('../backend/ai/data-inventory');
    const { createProteinPriceClient, proteinProfile } = require('../backend/services/protein-market-intelligence');
    const globalProteinHistory = [
        { role: 'user', content: 'Compara los últimos precios verificables de cerdo, pollo, huevo y res alrededor del mundo' },
        { role: 'assistant', content: 'Cerdo US 95.15 USD/100 lb y Res US 321.85 USD/100 lb.' },
    ];
    const coveragePlan = planQuery({ message: 'por que solo me diste de estados unidos', history: globalProteinHistory });
    check(()=>assert.equal(coveragePlan.asksCoverageExplanation, true));
    check(()=>assert.equal(coveragePlan.needsDataInventory, true));
    check(()=>assert.equal(coveragePlan.needsProteinPrices, false));
    check(()=>assert.equal(coveragePlan.needsProteinResearch, false));
    check(()=>assert.equal(guardProteinPrices(coveragePlan, empty, 'La API de la UE DG AGRI dio HTTP 500 y USDA LMPR cubre cutout de cerdo y res en EE. UU.').blocked, false));
    const inventoryPlan = planQuery({ message: 'dime que datos tienes ahorita mismo', history: globalProteinHistory });
    check(()=>assert.equal(inventoryPlan.asksDataInventory, true));
    check(()=>assert.equal(inventoryPlan.needsDataInventory, true));
    check(()=>assert.equal(inventoryPlan.needsProteinPrices, false));
    check(()=>assert.equal(detectTaskType('dime que datos tienes ahorita mismo'), 'general'));
    const invText = buildDataInventoryContext({ plan: coveragePlan });
    check(()=>assert.match(invText, /INVENTARIO Y COBERTURA EN VIVO/));
    check(()=>assert.match(invText, /DG AGRI/));
    const { buildAnswerStrategy } = require('../backend/ai/answer-strategy');
    check(()=>assert.equal(buildAnswerStrategy({ message: 'dime que datos tienes ahorita mismo', plan: inventoryPlan }).intent, 'inventory'));
    check(()=>assert.equal(buildAnswerStrategy({ message: 'por que solo me diste de estados unidos', plan: coveragePlan }).intent, 'coverage'));
    check(()=>assert.match(buildAnswerStrategy({ message: 'dime que datos tienes ahorita mismo', plan: inventoryPlan }).followUps[0].label, /prote[ií]nas/i));
    const snapClient = createProteinPriceClient({
        fetchPage: async () => { throw new Error('offline'); },
        now: () => Date.parse('2026-11-19T12:00:00Z'),
        mexicoClient: { getDetailed: async () => ({ records: [], coverage: [] }) },
        porciculturaClient: { getDetailed: async () => ({ records: [], coverage: [] }) },
        enableReportSnapshot: true,
    });
    const globalRecovery = await snapClient.get(proteinProfile('Compara los últimos precios verificables de cerdo, pollo, huevo y res alrededor del mundo'));
    check(()=>assert(globalRecovery.records.some(r => r.countryCode === 'BR')));
    check(()=>assert(globalRecovery.records.some(r => r.countryCode === 'FR')));
    check(()=>assert(globalRecovery.records.some(r => r.countryCode === 'MX')));
    check(()=>assert(globalRecovery.records.some(r => r.countryCode === 'US' && r.productId === 'poultry')));
    for (const method of ['stream', 'generateStructured']) {
        const explanation = 'Solo se mostró Estados Unidos en vivo porque DG AGRI UE devolvió HTTP 500 y USDA LMPR cubre cerdo/res.';
        const provider = { name: 'fixture', isConfigured: () => true, generate: async () => ({ text: explanation, model: 'fixture' }), stream: async req => { req.onText?.(explanation); return { text: explanation, model: 'fixture' }; } };
        const chat = new AIOrchestrator({ provider, liveDataGrounder: async () => empty, forecastBuilder: async () => null, statisticsBuilder: async () => null, retriever: { retrieve: async () => empty, recordQuery: async () => null, recordEvidence: async () => null } });
        const metaAns = await chat[method]({ message: 'por que solo me diste de estados unidos', history: globalProteinHistory });
        check(()=>assert.doesNotMatch(metaAns.text, /No pude validar los precios solicitados/));
        check(()=>assert.match(metaAns.text, /DG AGRI UE/));
    }
    const { buildShowcaseChart, buildForecastRecordChart, buildProteinComparisonChart } = require('../backend/ai/analytical-charts');
    const cornMlChart = buildShowcaseChart({ message: 'Pronóstico Loopus de ZC=F maiz cbot', plan: { asksForecast: true } });
    check(()=>assert.equal(cornMlChart?.type, 'line'));
    check(()=>assert(cornMlChart.datasets.length === 4 && cornMlChart.datasets.every(ds => ds.data.filter(v => v != null).length >= 2)));
    const mlOverviewChart = buildShowcaseChart({ message: 'Muestra los pronósticos ML activos de Loopus', plan: { asksDataInventory: true } });
    check(()=>assert.equal(mlOverviewChart?.type, 'bar'));
    const recChart = buildForecastRecordChart({ available: true, records: [{ available: true, ticker: 'TSN', name: 'Tyson', unit: 'USD', source: 'Yahoo', horizon: 3, cutoff: '2026-11-18', lastValue: 60, recentSeries: [{ date: '2026-11-12', value: 58 }, { date: '2026-11-13', value: 59 }, { date: '2026-11-16', value: 59.5 }, { date: '2026-11-18', value: 60 }], prediction: { value: 61.2, lowerBound: 58.1, upperBound: 64.3 }, evaluation: { improvement: 0.08 } }] });
    check(()=>assert.equal(recChart?.datasets?.length, 4));
    check(()=>assert.deepEqual(recChart.datasets[2].borderDash, [5, 4]));
    const fxFixture = { base: 'USD', rates: { USD: 1, MXN: 20, BRL: 6, EUR: 0.9, CAD: 1.4, CLP: 950, PLN: 4, CNY: 7 }, updatedAt: '2026-11-19', source: 'Fixture' };
    const proteinBar = buildProteinComparisonChart({ records: globalRecovery.records, fxRates: fxFixture, plan: planQuery({ message: 'Compara los últimos precios verificables de cerdo, pollo, huevo y res alrededor del mundo' }), message: 'Compara' });
    check(()=>assert.equal(proteinBar?.type, 'bar'));
    check(()=>assert(proteinBar?.labels?.length >= 4 && proteinBar.datasets.some(d => d.label.includes('Cerdo'))));
    const singleProteinChart = buildProteinComparisonChart({ records: [record], fxRates: fxFixture, plan: quotePlan, message: 'Precio del huevo en España hoy' });
    check(()=>assert.equal(singleProteinChart, null));
    const guardedWithChartFence = guardProteinPrices(quotePlan, evidence, `${valid}\n\n\`\`\`chart\n{"type":"bar","title":"Ref MXN 2026","labels":["A","B"],"datasets":[{"label":"X","data":[10,20]}]}\n\`\`\``);
    check(()=>assert.equal(guardedWithChartFence.blocked, false));
    const result={generatedAt:new Date().toISOString(),checks,passed:true,scope:'Regresiones locales con proveedores simulados; no certifica exactitud de cotizaciones reales ni predicciones.'};
    const output=path.join(__dirname,'../output/analisis-inteligencia-orion');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'regresiones.json'),JSON.stringify(result,null,2));
    console.log('ORION intelligence: '+checks+' checks passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
