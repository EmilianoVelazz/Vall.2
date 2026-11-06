'use strict';
const assert = require('node:assert/strict');
const { createPorciculturaClient, parsePorciculturaPrices, API, PAGE } = require('../backend/services/porcicultura-public');
const { createMexicoPriceClient } = require('../backend/services/mexico-protein-prices');
const { proteinProfile, createProteinPriceClient, proteinPriceEvidence } = require('../backend/services/protein-market-intelligence');
const { planQuery } = require('../backend/ai/query-planner');
const { guardProteinPrices } = require('../backend/ai/protein-price-quality');
const { AIOrchestrator } = require('../backend/ai/orchestrator');
const NOW = Date.parse('2026-10-08T17:30:00Z');
const period = {start:'2026-10-01',end:'2026-10-08'};
const payload = {data:[
    {fecha:'2026-10-07',estados:[{nombre:'Puebla',precio:38},{nombre:'Jalisco',precio:34.17},{nombre:'Desconocido',precio:99},{nombre:'Sonora',precio:0},{nombre:'Veracruz',precio:null}]},
    {fecha:'2026-10-06',estados:[{nombre:'Puebla',precio:38.5},{nombre:'Veracruz',precio:39.5}]},
    {fecha:'2026-10-09',estados:[{nombre:'Puebla',precio:90}]},
    {fecha:'2026-02-31',estados:[{nombre:'Puebla',precio:90}]},
]};
const rows = parsePorciculturaPrices(payload,period,'2026-10-08');
assert.equal(rows.length,3);assert.equal(rows.find(row=>row.stateCode==='PUE').value,38);
assert.equal(rows.find(row=>row.stateCode==='PUE').date,'2026-10-07');
assert.deepEqual(parsePorciculturaPrices(payload,{start:'2026-10-08',end:'2026-10-08'},'2026-10-08'),[],'No fingir que el registro de ayer es de hoy');
assert.deepEqual(parsePorciculturaPrices({data:[{fecha:'2026-10-07',estados:[{nombre:'Puebla',precio:38},{nombre:'Puebla',precio:39}]}]},period,'2026-10-08'),[],'No seleccionar un duplicado contradictorio');
const history = [{role:'user',content:'Vendo cerdo. Usa supuestos hipotéticos: compra 80 MXN/kg, flete 5 MXN/kg, merma 4% y venta 100 MXN/kg. No busques precios.'},{role:'assistant',content:'Margen 11.46%. Canal de cerdo en Aguascalientes 70–78 MXN/kg.'}];
const plan = planQuery({message:'precio estimado para puebla',history});
assert(plan.followsThread);assert(plan.needsProteinPrices);assert(!plan.providedInputsOnly);
assert.equal(plan.needsFxQuote,false,'La moneda MXN del ejercicio no solicita tipo de cambio');
assert.equal(plan.needsLiveQuote,false,'Consultar precios físicos sin otra cotización financiera');
assert.deepEqual(plan.proteinProfile.products,['pork']);assert.deepEqual(plan.proteinProfile.mexicoStates,['PUE']);
assert(planQuery({message:'Ahora baja mi precio de venta 10%',history}).providedInputsOnly,'Conservar la restricción del ejercicio al calcular');
const fromPuebla = planQuery({message:'¿Y en Veracruz?',history:[{role:'user',content:'Precio del cerdo en pie en Puebla según Porcicultura'}]}).proteinProfile;
assert.deepEqual(fromPuebla.mexicoStates,['VER']);assert.equal(fromPuebla.priceBasis,'live');
assert.deepEqual(planQuery({message:'Ahora de México',history:[{role:'user',content:'Precio del cerdo en Puebla'}]}).proteinProfile.mexicoStates,[],'Ampliar país sin arrastrar la plaza anterior');
const empty = {context:'',citations:[],sourceCodes:[],evidenceCount:0,charts:[],evidenceRecords:[],retrievalStrategy:'fixture'};
async function main() {
    let calls = 0;
    const client = createPorciculturaClient({now:()=>NOW,fetchPage:async url=>{calls++;assert.equal(url,API);return {ok:true,text:async()=>JSON.stringify(payload)};}});
    const values = await Promise.all([client.get(plan.proteinProfile,period),client.get(plan.proteinProfile,period)]);
    assert.equal(calls,1);assert(values.every(records=>records.length===1));
    assert.equal(values[0][0].market,'Puebla');assert.equal(values[0][0].unit,'MXN/kg vivo');assert.equal(values[0][0].url,PAGE);
    for (const query of ['Precio de canal de cerdo en Puebla','Precio de lomo de cerdo en Puebla','Precio de futuro de cerdo CME','Precio del pollo en Puebla']) assert.deepEqual(await client.get(proteinProfile(query),period),[],query);
    assert.equal((await client.get(proteinProfile('Precio del cerdo en pie en Puebla'),period)).length,1);
    assert.deepEqual(await client.get(proteinProfile('Precio del cerdo en Puebla según SNIIM'),period),[]);
    const sniimHtml='<title>Porcinos : Carne en canal</title><table><tr><td>Ags. : R.M. Aguascalientes</td></tr><tr><td>08/10/2026</td><td>Supremo</td><td>65</td><td>70</td><td>78</td><td>1</td><td>2</td></tr></table>';
    const sniim=createMexicoPriceClient({now:()=>NOW,fetchPage:async()=>({ok:true,text:async()=>sniimHtml})});
    assert.deepEqual(await sniim.get(plan.proteinProfile,period),[],'No convertir un rastro de Aguascalientes en Puebla');
    assert.deepEqual(await sniim.get(proteinProfile('Precio del cerdo vivo en Puebla'),period),[],'No usar canal para un pedido de cerdo vivo');
    const source=createProteinPriceClient({now:()=>NOW,mexicoClient:sniim,porciculturaClient:client});
    const evidence=await proteinPriceEvidence(plan.proteinProfile,source);
    assert.equal(evidence.proteinPriceRecords.length,1);assert.deepEqual(evidence.sourceCodes,['porcicultura_live_pork_prices']);
    const answer=guardProteinPrices(plan,evidence,'Puebla se alinea a Aguascalientes: 70–78 MXN/kg. Recalculo tu margen.');
    assert(answer.changed);assert.match(answer.text,/Puebla.*referencias/s);assert.match(answer.text,/38\.00 MXN\/kg vivo/);
    assert.match(answer.text,/2026-10-07/);assert.match(answer.text,/Porcicultura\.com/);assert.doesNotMatch(answer.text,/70–78|70\.00–78\.00|Aguascalientes/);
    assert.match(answer.text,/No recalculo tu margen/);
    const fail=createPorciculturaClient({fetchPage:async()=>({ok:false,status:503}),now:()=>NOW});
    const failedEvidence=await proteinPriceEvidence(plan.proteinProfile,createProteinPriceClient({now:()=>NOW,mexicoClient:sniim,porciculturaClient:fail}));
    assert.equal(failedEvidence.proteinPriceRecords.length,0);assert(failedEvidence.warnings.length);
    assert.match(guardProteinPrices(plan,failedEvidence,'Precio Puebla 78 MXN/kg').text,/No disponible/);
    const mixed=createProteinPriceClient({now:()=>NOW,mexicoClient:{get:async()=>[{...rows[0],category:'Canal de cerdo',priceBasis:'carcass',source:'SNIIM',sourceCode:'sniim_mexico_protein_prices',value:78}]},porciculturaClient:client});
    const onlyPorci=await proteinPriceEvidence(proteinProfile('Precio del cerdo en Puebla según Porcicultura'),mixed);
    assert(onlyPorci.proteinPriceRecords.every(row=>row.sourceCode==='porcicultura_live_pork_prices'),'Respetar la fuente pedida');
    for(const method of ['stream','generateStructured']) {
        const bad='Puebla se alinea a Aguascalientes: 70–78 MXN/kg. Tu margen es mayor que 11.46%.';
        const chunks=[];
        const provider={name:'fixture',isConfigured:()=>true,generate:async()=>({text:bad,model:'fixture'}),stream:async request=>{request.onText(bad);return {text:bad,model:'fixture'};}};
        const chat=new AIOrchestrator({provider,liveDataGrounder:async()=>evidence,retriever:{retrieve:async()=>empty,recordQuery:async()=>null,recordEvidence:async()=>null}});
        const reply=await chat[method]({message:'precio estimado para puebla',history,tier:'flash',onText:part=>chunks.push(part)});
        assert.match(reply.text,/38\.00 MXN\/kg vivo/);assert.doesNotMatch(reply.text,/Aguascalientes|11\.46%|70–78/);
        assert.doesNotMatch(chunks.join(''),/Aguascalientes|11\.46%|70–78/,'No transmitir extrapolación local ni margen inventado');
        assert(reply.citations.some(citation=>citation.source.startsWith('Porcicultura')));
    }
    console.log('Porcicultura chat: dated state prices, live/carcass/cut distinction, scope changes, source selection, failure and both chat paths OK');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
