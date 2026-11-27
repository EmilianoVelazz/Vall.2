'use strict';
process.env.NODE_ENV='test';
const assert=require('node:assert/strict');
const {ExecutiveReportAgent}=require('../backend/ai/executive-report-agent');
const report={key:'fx',collection:'finance',title:'Referencia de simulación',summary:'USD/MXN de 20 MXN por USD.',generatedAt:'2026-11-12T15:00:00Z',metrics:[{label:'USD/MXN',value:'20 MXN por USD'}],sections:[],tables:[]};
const valid={key:'fx',headline:'Referencia para tesorería',context:'Se conserva la referencia proporcionada.',thesis:'El dato es 20 MXN por USD; su efecto depende de la exposición real.',drivers:['Contrastar los vencimientos en la moneda del contrato.'],risks:['La referencia no es una cotización bancaria ejecutable.'],committeeQuestion:'¿Qué pagos requieren confirmar el diferencial bancario?',traceability:{thesis:{kind:'interpretation',evidenceIds:['metric-1']},drivers:[{kind:'interpretation',evidenceIds:['metric-1']}],risks:[{kind:'pending',evidenceIds:[]}] }};
const response=(draft,model='gemini-4-argon')=>({model,text:JSON.stringify({reports:Array.isArray(draft)?draft:[draft]})});
const provider=generate=>({isConfigured:()=>true,generate});
async function main(){
 const original=JSON.stringify(report),requests=[];
 const long={...valid,thesis:'Una explicación muy extensa que debe sintetizarse sin perder su condición ni su conclusión. '.repeat(12)};
 const repaired=await new ExecutiveReportAgent({provider:provider(async options=>{requests.push(options);return response(requests.length===1?long:valid);})}).enrich([report],{area:'Finanzas'});
 assert.equal(requests.length,2);assert.match(requests[1].prompt,/CORRECCIÓN ÚNICA/);assert.match(requests[1].prompt,/thesis/);assert.match(requests[0].systemInstruction,/no redondees ni calcules/);
 assert.equal(repaired[0].executiveBrief.thesis,valid.thesis,'Publish the complete corrected sentence, never the truncated draft');assert.equal(repaired[0].executiveBrief.mode,'ai');assert.equal(JSON.stringify(report),original);
 let badCalls=0;const rejected=await new ExecutiveReportAgent({provider:provider(async()=>{badCalls++;return response(long);})}).enrich([report]);
 assert.equal(badCalls,2);assert.equal(rejected[0].executiveBrief.mode,'deterministic','Persistent overlength cannot reach the displayed report');
 for(const invalid of [{...valid,thesis:'La referencia cambia a 999999 MXN por USD.'},{...valid,traceability:{...valid.traceability,thesis:{kind:'observed',evidenceIds:['news-999']}}},{...valid,context:'Una frase incompleta sin cierre'},{...valid,risks:[]},{...valid,drivers:[valid.drivers[0],valid.drivers[0],valid.drivers[0],valid.drivers[0]]}]){
  let calls=0;const [result]=await new ExecutiveReportAgent({provider:provider(async()=>response(++calls===1?invalid:valid))}).enrich([report]);
  assert.equal(calls,2);assert.equal(result.executiveBrief.mode,'ai');assert.equal(result.executiveBrief.thesis,valid.thesis);
 }
 let jsonCalls=0;const [jsonRecovered]=await new ExecutiveReportAgent({provider:provider(async()=>++jsonCalls===1?{text:'JSON incompleto'}:response(valid))}).enrich([report]);
 assert.equal(jsonCalls,2);assert.equal(jsonRecovered.executiveBrief.mode,'ai');
 const pair=[report,{...report,key:'bonds',title:'Bonos de simulación'}];let pairCalls=0;
 const combined=await new ExecutiveReportAgent({provider:provider(async()=>++pairCalls===1?response([valid,{...long,key:'bonds'}],'first-model'):response([{...valid,key:'fx',headline:'No debe sustituir el informe ya validado'},{...valid,key:'bonds'}],'repair-model'))}).enrich(pair);
 assert.equal(combined[0].executiveBrief.model,'first-model');assert.equal(combined[0].executiveBrief.headline,valid.headline);assert.equal(combined[1].executiveBrief.model,'repair-model');
 const timeouts=[];let secondSignal;
 const stalled=await new ExecutiveReportAgent({timeoutMs:100,provider:provider(async options=>{timeouts.push(options.timeoutMs);if(timeouts.length===1){await new Promise(resolve=>setTimeout(resolve,20));return response(long);}secondSignal=options.signal;return new Promise(()=>{});})}).enrich([report]);
 assert.equal(timeouts.length,2);assert(timeouts[1]<timeouts[0],'The correction shares the original total deadline');assert(secondSignal.aborted);assert.equal(stalled[0].executiveBrief.mode,'deterministic');
 let safetyCalls=0;await new ExecutiveReportAgent({provider:provider(async()=>{safetyCalls++;throw Object.assign(Error('Blocked'),{code:'AI_SAFETY'});})}).enrich([report]);assert.equal(safetyCalls,1);
 console.log('Editorial repair: complete sentences, literal figures, bounded correction, schema recovery, partial batch preservation, shared deadline and safety rejection passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
