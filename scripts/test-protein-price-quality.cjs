'use strict';
const assert=require('node:assert/strict');
const {guardProteinPrices,quoteMatchesRecord}=require('../backend/ai/protein-price-quality');
const {proteinPriceTable}=require('../backend/ai/protein-price-table');
const {normalizeProteinPriceToKg,formatNormalizedKgText}=require('../backend/services/protein-unit-normalizer');
const {planQuery}=require('../backend/ai/query-planner');
const {AIOrchestrator}=require('../backend/ai/orchestrator');
const plan=planQuery({message:'Precio del huevo por docena en España hoy'});
const empty={context:'',citations:[],sourceCodes:[],evidenceCount:0,charts:[],evidenceRecords:[],retrievalStrategy:'fixture'};
const invalid=[
 '| Huevos | 2.50 EUR/docena | 2026 | [Artículo](https://example.invalid/2026-01-31/article) |',
 '| Huevos | 2.50 EUR/docena | 2026-10-08 | [Portada](https://www.mapa.gob.es/) |',
 '| Huevos | 2.50 EUR/docena | 2026-10-08 | [P1] |',
 'Huevos: 2.50 EUR/docena.',
 '| Huevos | 2.50 EUR/docena | 2026 | [MAPA](https://www.mapa.gob.es/) |',
 '| Huevos | 2.50 EUR/docena | octubre 2026 | [MAPA](https://www.mapa.gob.es/) |',
 '| Huevos | 2.50 EUR/docena | 2026-10-08 | sin fuente |',
 '| Huevos | 9999.00 EUR/docena | 2026-10-08 | [Informe](https://example.invalid/report) |',
 '| Huevos | 2.50 EUR/docena | 2026-10-08 | [Informe](https://example.invalid/report) |',
 'Huevos: 2.50 EUR/docena al 8 de octubre de 2026 [Informe](https://example.invalid/report).',
 '| Huevos | 2.50 EUR/docena | 2026 | [MAPA](https://www.mapa.gob.es/) |\n| Otro | 3.00 EUR/docena | 2026-10-08 | [Informe](https://example.invalid/report) |'
];
for(const text of invalid){const result=guardProteinPrices(plan,empty,text);assert(result.blocked);assert.doesNotMatch(result.text,/2\.50|3\.00/);}
for(const text of [
 'No se verificó una cotización.',
 'Ejemplo hipotético: 2.50 EUR/docena; no es una cotización.'
])assert.equal(guardProteinPrices(plan,empty,text).blocked,false);
assert.equal(guardProteinPrices({needsProteinPrices:false},empty,invalid[0]).blocked,false);
assert.equal(guardProteinPrices({...plan,providedInputsOnly:true},empty,invalid[0]).blocked,false);
(async()=>{
 for(const method of ['stream','generateStructured']){
  const text=invalid[1];const chunks=[];
  const provider={name:'fixture',isConfigured:()=>true,generate:async()=>({text,model:'fixture'}),stream:async request=>{request.onText(text,text);return {text,model:'fixture'};}};
  const chat=new AIOrchestrator({provider,liveDataGrounder:async()=>empty,retriever:{retrieve:async()=>empty,recordQuery:async()=>null,recordEvidence:async()=>null}});
  const answer=await chat[method]({message:'Precio del huevo por docena en España hoy',history:[],tier:'flash',onText:part=>chunks.push(part)});
  assert.match(answer.text,/No pude validar/);assert.doesNotMatch(answer.text,/2\.50/);assert.doesNotMatch(chunks.join(''),/2\.50/,'No transmitir el rango inválido antes del control');
  assert(answer.response.meta.warnings.some(w=>/cotizaciones/.test(w)));
 }
 const fxRates={base:'USD',rates:{USD:1,MXN:20,BRL:6,EUR:0.9},updatedAt:'2026-11-19',source:'Fixture FX'};
 const porkNorm=normalizeProteinPriceToKg({value:69.48,currency:'USD',unit:'USD/cwt (100 lb)'},fxRates);
 assert(porkNorm && Math.abs(porkNorm.usdPerKg-1.5318)<0.01 && Math.abs(porkNorm.mxnPerKg-30.635)<0.05);
 const broilerNorm=normalizeProteinPriceToKg({value:118.27,currency:'US¢',unit:'US¢/lb'},fxRates);
 assert(broilerNorm && Math.abs(broilerNorm.usdPerKg-2.6074)<0.01 && Math.abs(broilerNorm.mxnPerKg-52.148)<0.05);
 const arrobaNorm=normalizeProteinPriceToKg({value:300,currency:'BRL',unit:'BRL/arroba (15 kg)'},fxRates);
 assert(arrobaNorm && Math.abs(arrobaNorm.usdPerKg-(10/3))<0.01 && Math.abs(arrobaNorm.mxnPerKg-(200/3))<0.05);
 assert.equal(normalizeProteinPriceToKg({value:2.72,currency:'EUR',unit:'EUR/docena'},fxRates),null,'Docenas sin peso documentado no se convierten a kg');
 assert.equal(normalizeProteinPriceToKg({value:178.6,currency:'BRL',unit:'BRL/caja (30 doc.)'},fxRates),null,'Cajas de docenas no se convierten a kg');
 const globalPlan=planQuery({message:'Compara precios de cerdo, pollo, huevo y res alrededor del mundo'});
 const fxRecords=[
  {product:'Cerdo',productId:'pork',country:'Estados Unidos',countryCode:'US',market:'Estados Unidos',category:'Pork carcass cutout',priceBasis:'carcass',value:69.48,currency:'USD',unit:'USD/cwt (100 lb)',date:'2026-11-18',source:'USDA AMS',url:'https://example.invalid/usda-pork',verified:true},
  {product:'Pollo',productId:'poultry',country:'Estados Unidos',countryCode:'US',market:'Estados Unidos',category:'Pollo entero compuesto',priceBasis:'wholesale',value:118.27,currency:'US¢',unit:'US¢/lb',date:'2026-11-13',source:'USDA AMS 3646',url:'https://example.invalid/usda-broiler',verified:true},
  {product:'Huevo',productId:'eggs',country:'España',countryCode:'ES',market:'Bellpuig',category:'Huevo clasificado L',priceBasis:'egg_pack',value:2.72,currency:'EUR',unit:'EUR/docena',date:'2026-11-02',source:'Mercolleida',url:'https://example.invalid/es-egg',verified:true},
  {product:'Res',productId:'beef',country:'Brasil',countryCode:'BR',market:'São Paulo',category:'Boi Gordo CEPEA',priceBasis:'live',value:300,currency:'BRL',unit:'BRL/arroba (15 kg)',date:'2026-11-02',source:'CEPEA/ESALQ',url:'https://example.invalid/br-beef',verified:true},
 ];
 const fxEv={...empty,fxRates,proteinPrices:{available:true,fetchedAt:'2026-11-19T12:00:00Z'},proteinPriceRecords:fxRecords};
 const normTbl=proteinPriceTable(globalPlan,fxEv);
 assert.match(normTbl,/Equiv\. aprox\. \(\/kg\)/);
 assert.match(normTbl,/— \(sin base kg\)/);
 assert.equal(guardProteinPrices(globalPlan,fxEv,normTbl).blocked,false);
 const validRow=normTbl.split('\n').find(l=>l.includes('69.48'));
 assert.equal(quoteMatchesRecord(validRow,fxRecords[0],[],fxRates),true);
 const forgedRow=validRow.replace(formatNormalizedKgText(porkNorm),'~999.00 MXN/kg (~50.00 USD/kg)');
 assert.equal(quoteMatchesRecord(forgedRow,fxRecords[0],[],fxRates),false,'Una equivalencia alterada manualmente debe rechazarse');
 assert.equal(quoteMatchesRecord(validRow,fxRecords[0],[],null),false,'Sin tasa FX verificada no se acepta columna normalizada');
 console.log('Protein price presentation quality: adversarial quotes and 2 real orchestrator paths OK (does not certify factual accuracy)');
})().catch(error=>{console.error(error);process.exitCode=1});
