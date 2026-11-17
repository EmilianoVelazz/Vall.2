'use strict';
// Synthetic questions and business inputs only. --live uses the configured model.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const phase=process.argv.includes('--before')?'before':'after',live=process.argv.includes('--live');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output/orion-respuestas-20261110');
const initial='Compro 1000 kg de cerdo a 80 MXN/kg, vendo a 110 MXN/kg, merma 8%, flete 5000 MXN. Calcula mi margen.';
const history=[{role:'user',content:initial},{role:'assistant',content:'El lote tiene 920 kg vendibles, costo de 85000 MXN y resultado de 16200 MXN.'}];
async function main(){
 await fs.mkdir(output,{recursive:true});
 if(live){require('dotenv').config({path:path.join(root,'backend/.env'),quiet:true});require('dotenv').config({path:path.join(root,'.env.local'),quiet:true});require('../backend/lib/tls-trust').configureSystemTrust();}
 const {prepareBusinessConversation}=require('../backend/ai/business-memory'),{domainDecision}=require('../backend/ai/domain-policy'),{buildPrompt}=require('../backend/ai/prompt-builder'),{AIOrchestrator}=require('../backend/ai/orchestrator');
 const empty={context:'',citations:[],sourceCodes:[],evidenceCount:0,charts:[],evidenceRecords:[],retrievalStrategy:'simulation'};
 const results=[],prompts=[];let providerCalls=0;const provider={name:'simulation',isConfigured:()=>true,generate:async request=>{providerCalls++;prompts.push(request.prompt);return {text:'Respuesta de control: el cálculo no se resolvió localmente.',model:'simulation'};},stream:async request=>{providerCalls++;prompts.push(request.prompt);const text='Respuesta de control: el cálculo no se resolvió localmente.';request.onText?.(text);return {text,model:'simulation'};}};
 const chat=new AIOrchestrator({provider,liveDataGrounder:async()=>empty,forecastBuilder:async()=>null,statisticsBuilder:async()=>null,retriever:{retrieve:async()=>empty,recordQuery:async()=>null,recordEvidence:async()=>null},priceArchive:null});
 const cases=[
  {id:'topic-switch',message:'Ahora compara maíz y trigo',check:answer=>assert.equal(answer.memory,null)},
  {id:'acknowledgement',message:'Perfecto',check:answer=>assert.equal(answer.scope,'social')},
  {id:'natural-shrink-update',message:'Y la merma ahora es 5%',profit:19500},
  {id:'sale-update',message:'¿Y si vendo a 100 MXN/kg?',profit:7000},
  {id:'freight-update',message:'El flete ahora es 2000 MXN',profit:19200},
  {id:'quantity-update',message:'Y ahora son 800 kilos',profit:11960},
  {id:'comma-decimals',message:'Y el flete ahora es 1.200,50 MXN',profit:19999.5},
  {id:'invalid-shrink',message:'Y la merma ahora es -5%',unavailable:true},
  {id:'one-sentence',message:'Recalcula mi margen en una frase',sentence:true},
  {id:'twelve-words',message:'Recalcula mi margen en máximo 12 palabras',wordLimit:12},
  {id:'buy-price-natural',message:'El precio de compra ahora es 78 MXN/kg',profit:18200},
  {id:'sale-percentage-not-price',message:'Y venta a 80%',unavailable:true},
  {id:'margin-with-explanation',message:'Recalcula mi margen y explica los riesgos',narrative:true},
  {id:'per-kg-without-volume',history:[],message:'Vendo cerdo: compra 80 MXN/kg, venta 100 MXN/kg, merma 4%, flete 5 MXN/kg. Calcula margen y recargo sobre costo.',perKg:true},
  {id:'fixed-cost-needs-volume',history:[],message:'Vendo cerdo: compra 80 MXN/kg, venta 100 MXN/kg, merma 4%, flete 5000 MXN. Calcula mi margen.',unavailable:true},
  {id:'lot-after-per-kg',history:[{role:'user',content:'Vendo cerdo: compra 80 MXN/kg, venta 100 MXN/kg, merma 4%, flete 5 MXN/kg. Calcula mi margen.'}],message:'Y ahora son 1000 kg',profit:11000,noMixedBasis:true},
 ];
 for(const method of ['generateStructured','stream'])for(const item of cases){
  const before=providerCalls,chunks=[];let answer;
  try{const activeHistory=item.history || history,prepared=prepareBusinessConversation({message:item.message,history:activeHistory});const result=await chat[method]({message:item.message,history:activeHistory,onText:text=>chunks.push(text)});answer={text:result.text,memory:prepared.conversationMemory,scope:domainDecision({message:item.message,history:activeHistory}).reason,calculation:result.response.meta.calculation,providerCalls:providerCalls-before,streamed:chunks.join('')};
   if(item.check)item.check(answer);else if(item.narrative){assert.equal(answer.providerCalls,1);assert.equal(answer.calculation.profit,16200);assert(prompts.at(-1).includes('[CÁLCULO COMERCIAL VERIFICADO POR EL SERVIDOR]'));if(method==='stream')assert.equal(answer.streamed,answer.text);}else {assert.equal(answer.providerCalls,0);if(item.unavailable)assert.equal(answer.calculation.available,false);else if(item.sentence || item.wordLimit){assert(answer.text.split(/\s+/).length<=(item.wordLimit || 45));assert(!answer.text.includes('|'));}else if(item.perKg){assert.equal(answer.calculation.perKgBasis,true);assert(Math.abs(answer.calculation.costPerSellableKg-85/.96)<1e-8);assert(!answer.memory.inputs.purchasedKg);assert(answer.text.includes('Sin volumen no se calcula utilidad total'));}else assert(Math.abs(answer.calculation.profit-item.profit)<1e-8);}
   if(item.noMixedBasis)assert(!answer.text.includes('Cambio frente al cálculo anterior'));
   results.push({id:item.id,method,passed:true,...answer});
  }catch(error){results.push({id:item.id,method,passed:false,error:error.message,...answer});}
 }
 const lengthPrompt=buildPrompt({message:'Explica margen sobre venta en una frase',history:[],plan:{providedInputsOnly:true}});
 results.push({id:'prompt-one-sentence',passed:!(/entre 120 y 180/.test(lengthPrompt.prompt)),guidance:lengthPrompt.prompt});
 const {forecastRequest}=require('../backend/ai/answer-strategy');
 results.push({id:'certainty-question-not-forecast',passed:forecastRequest('¿Puedes asegurar que el dólar subirá mañana?').requested===false});
 results.push({id:'explicit-forecast-still-supported',passed:forecastRequest('Pronostica USD/MXN para cinco sesiones').requested===true});
 const shortDocument=buildPrompt({message:'Crea un informe de margen en máximo 80 palabras',history:[]}),beforeExpansion=providerCalls;
 await chat.enforceReportMinimum(shortDocument,{text:'Un resumen breve con los supuestos disponibles.',model:'simulation'},'flash');
 results.push({id:'explicit-short-document-no-forced-expansion',passed:providerCalls===beforeExpansion && shortDocument.responseLength.maxWords===80});
 const samples=[];const {answerWordCount}=require('../backend/ai/answer-format');
 if(live){
  const {GeminiProvider}=require('../backend/ai/providers/gemini-provider');const actual=new GeminiProvider();if(!actual.isConfigured())throw Error('Proveedor no configurado.');
  const context='EJERCICIO FICTICIO, NO COTIZACIONES: un lote cuesta 85000 MXN y genera ingresos por 101200 MXN, utilidad 16200 MXN; margen sobre venta 16.0079%, recargo sobre costo 19.0588%. Para otro ejercicio, un pago de 10000 USD a 90 días usa un spot supuesto de 18 MXN/USD y forward supuesto de 18.30 MXN/USD; no hay datos de tasas ni noticias reales.';
  for(const item of [{id:'live-one-sentence',question:'Con estos datos del lote, explica la diferencia entre margen sobre venta y recargo sobre costo en una frase.'},{id:'live-payment',question:'Con el ejercicio del pago en USD: ¿cuánto pagaría al spot supuesto y con el forward supuesto? ¿Cuál es la diferencia? ¿Qué riesgo queda? Máximo 100 palabras.'},{id:'live-no-current-data',question:'Soy importador: con estos supuestos, ¿puedes afirmar que el dólar subirá mañana y que el forward garantiza una ganancia? Máximo 80 palabras.'}]){
   const built=buildPrompt({message:item.question,context,history:[],mode:'normal',plan:{providedInputsOnly:true}}),started=Date.now();try{const answer=await actual.generate({...built,tier:'flash',maxOutputTokens:1536,timeoutMs:30000,tools:null});samples.push({id:item.id,question:item.question,text:answer.text,model:answer.model,latencyMs:Date.now()-started,finishReason:answer.finishReason,words:answerWordCount(answer.text),wordLimit:built.responseLength.maxWords,withinWordLimit:!built.responseLength.maxWords || answerWordCount(answer.text)<=built.responseLength.maxWords});}catch(error){samples.push({id:item.id,error:error.code || 'provider_unavailable',latencyMs:Date.now()-started});}
  }
 }
 const report={generatedAt:new Date().toISOString(),phase,syntheticInputs:true,deterministic:{passed:results.filter(item=>item.passed).length,total:results.length,results},modelSamples:samples,modelSamplesAreNotTruthCertification:true};await fs.writeFile(path.join(output,phase+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({phase,passed:report.deterministic.passed,total:results.length,failed:results.filter(item=>!item.passed).map(item=>({id:item.id,method:item.method,error:item.error})),modelSamples:samples.map(({id,error,model,words,withinWordLimit})=>({id,error,model,words,withinWordLimit}))},null,2));if(phase==='after' && (results.some(item=>!item.passed) || samples.some(item=>item.error || !item.withinWordLimit)))process.exitCode=1;
}
main().catch(error=>{console.error(error.code || error.message);process.exitCode=1;});
