'use strict';
const assert=require('node:assert/strict');
const {guardProteinPrices}=require('../backend/ai/protein-price-quality');
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
 console.log('Protein price presentation quality: adversarial quotes and 2 real orchestrator paths OK (does not certify factual accuracy)');
})().catch(error=>{console.error(error);process.exitCode=1});
