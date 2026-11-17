'use strict';
// Frozen public report snapshots; no store writes, refresh calls or email sends.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
require('dotenv').config({path:'backend/.env',quiet:true});
require('../backend/lib/tls-trust').configureSystemTrust();
const {GeminiProvider,MODELS}=require('../backend/ai/providers/gemini-provider');
const {ExecutiveReportAgent,deterministicBrief}=require('../backend/ai/executive-report-agent');
const {numericTokens}=require('../backend/lib/report-evidence-numbers');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const escape=value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function usageOf(value){return Object.fromEntries(['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','cachedContentTokenCount','totalTokenCount'].map(key=>[key,Number(value?.[key] || 0)]));}
function estimateCost(model,usage){
 const rate=model==='gemini-4-argon' ? {input:2,output:10,cached:.1} : {input:2,output:12,cached:.2};
 const cached=Math.min(usage.promptTokenCount,usage.cachedContentTokenCount);
 return ((usage.promptTokenCount-cached)*rate.input+cached*rate.cached+(usage.candidatesTokenCount+usage.thoughtsTokenCount)*rate.output)/1e6;
}
function audit(brief,facts,rawDraft){
 const narrative={headline:brief?.headline,context:brief?.context,thesis:brief?.thesis,drivers:brief?.drivers,risks:brief?.risks,committeeQuestion:brief?.committeeQuestion};
 const allowed=numericTokens(JSON.stringify(facts)),unsupportedNumbers=[...numericTokens(JSON.stringify(narrative))].filter(number=>!allowed.has(number));
 const limits={headline:120,context:320,thesis:420,committeeQuestion:260},clippedFields=Object.entries(limits).filter(([key,limit])=>typeof rawDraft?.[key]==='string' && rawDraft[key].trim().length>limit).map(([key])=>key);
 for(const key of ['drivers','risks'])if(rawDraft?.[key]?.some(item=>String(item).trim().length>240))clippedFields.push(key);
 const words=Object.values(narrative).flat().filter(Boolean).join(' ').match(/\S+/g)?.length || 0;
 return {unsupportedNumbers,words,clippedFields,complete:Boolean(brief?.headline && brief?.context && brief?.thesis && brief?.committeeQuestion && brief?.drivers?.length && brief?.risks?.length)};
}
async function runVariant(sample,variant,repetition){
 const provider=new GeminiProvider();assert(provider.isConfigured(),'Gemini is not configured');
 const calls=[],original=provider.client.models.generateContent.bind(provider.client.models);
 provider.modelsForTier=()=>[variant.model];provider.modelForTier=()=>variant.model;
 provider.client.models.generateContent=async request=>{
  const call={model:request.model,startedAt:new Date().toISOString(),config:{thinkingConfig:request.config.thinkingConfig,maxOutputTokens:request.config.maxOutputTokens},systemInstruction:request.config.systemInstruction,prompt:request.contents[0].parts[0].text};calls.push(call);
  const started=Date.now();
  try{const response=await original(request);call.ms=Date.now()-started;call.modelVersion=response.modelVersion;call.usage=usageOf(response.usageMetadata);call.rawText=response.text;call.finishReason=response.candidates?.[0]?.finishReason;return response;}
  catch(error){call.ms=Date.now()-started;call.error={code:error.code || error.name,status:error.status};throw error;}
 };
 const generate=provider.generate.bind(provider);
 provider.generate=options=>generate({...options,tier:variant.tier,maxOutputTokens:32768,timeoutMs:45000});
 const frozen=structuredClone(sample.report),before=digest(frozen),started=Date.now();
 const [result]=await new ExecutiveReportAgent({provider,timeoutMs:45000}).enrich([frozen],{area:sample.area});
 assert.equal(digest(frozen),before,'The frozen report must remain unchanged');
 assert.deepEqual(result.metrics || [],sample.report.metrics || []);assert.deepEqual(result.sourceLinks || [],sample.report.sourceLinks || []);
 const call=calls[0];assert.equal(calls.length,1,'Comparison must never substitute a different model');
 const facts=JSON.parse(call.prompt.split('DATOS VERIFICADOS:\n')[1]);let rawDraft;
 try{rawDraft=JSON.parse(call.rawText.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'')).reports.find(row=>row.key===sample.key);}catch{ /* Invalid completion is a measured result. */ }
 const brief=result.executiveBrief,accepted=brief?.mode==='ai' && brief.model===variant.model;
 return {sample:sample.id,repetition,variant:variant.id,requestedModel:variant.model,accepted,ms:Date.now()-started,promptHash:digest([call.systemInstruction,call.prompt]),brief,audit:audit(brief,facts,rawDraft),costUsdEstimated:call.usage ? estimateCost(variant.model,call.usage) : null,calls};
}
function section(brief){return brief ? `<h4>${escape(brief.headline)}</h4><p><b>Contexto.</b> ${escape(brief.context)}</p><p><b>Tesis.</b> ${escape(brief.thesis)}</p><b>Señales</b><ul>${(brief.drivers || []).map(value=>`<li>${escape(value)}</li>`).join('')}</ul><b>Riesgos</b><ul>${(brief.risks || []).map(value=>`<li>${escape(value)}</li>`).join('')}</ul><p><b>Pregunta.</b> ${escape(brief.committeeQuestion)}</p>` : '<p>Sin lectura disponible.</p>';}
async function main(){
 const directory=path.resolve('output/argon-comparison-20261112');await fs.mkdir(directory,{recursive:true});
 const finance=JSON.parse(await fs.readFile('backend/cache/finance_executive_reports.json','utf8')),markets=JSON.parse(await fs.readFile('backend/cache/market_executive_reports.json','utf8'));
 const selections=[{id:'bolsa',area:'Finanzas',key:'equities',snapshot:finance},{id:'divisas',area:'Finanzas',key:'fx',snapshot:finance},{id:'granos',area:'Mercados',key:'grains',snapshot:markets}];
 const samples=selections.map(({snapshot,...sample})=>{const report=structuredClone(snapshot.reports.find(row=>row.key===sample.key));assert(report);const previousBrief=report.executiveBrief || deterministicBrief(report);delete report.executiveBrief;return {...sample,report,previousBrief,previousMode:sample.key==='grains' ? 'deterministic reconstruction; no stored executiveBrief' : 'stored '+previousBrief.mode};});
 assert.equal(MODELS.pro,'gemini-3.1-pro-preview','Baseline is the pre-migration configured Pro model');
 const variants=[{id:'anterior',model:'gemini-3.1-pro-preview',tier:'pro'},{id:'argon',model:'gemini-4-argon',tier:'report'}];
 const methodology={frozenAt:new Date().toISOString(),cases:samples.map(({report,previousBrief:_previousBrief,...sample})=>({...sample,title:report.title,cutoff:report.generatedAt,inputHash:digest(report)})),repetitions:2,models:variants,identicalPromptRequired:true,timeoutMs:45000,maxOutputTokens:32768,reasoning:{anterior:'high',argon:'medium'},fallbackDisabledForMeasurement:true,comparisonType:'Equal source/prompt/timeout/output cap with each model reasoning configuration; not a replay of the previous 15-second / 5000-token limits',costBasis:'Standard USD prices verified 2026-11-12; output includes thinking, cached input discounted; estimates exclude tax and billing rounding',qualityReview:'Editorial review against source evidence; numeric checks do not establish semantic accuracy',emailsSent:0,userRecordsWritten:0,productionChanged:false};
 await fs.writeFile(path.join(directory,'inputs.json'),JSON.stringify(samples,null,2));await fs.writeFile(path.join(directory,'methodology.json'),JSON.stringify(methodology,null,2));
 const runs=[];
 for(const sample of samples)for(let repetition=1;repetition<=2;repetition++){
  const order=repetition===1 ? variants : [...variants].reverse();
  const pair=await Promise.all(order.map(variant=>runVariant(sample,variant,repetition)));
  assert.equal(pair[0].promptHash,pair[1].promptHash,'Both models must receive identical facts and instructions');
  runs.push(...pair);for(const run of pair)await fs.writeFile(path.join(directory,`${sample.id}-${run.variant}-${repetition}.json`),JSON.stringify(run,null,2));
  await fs.writeFile(path.join(directory,'runs.json'),JSON.stringify(runs,null,2));
  console.log(JSON.stringify({sample:sample.id,repetition,results:pair.map(({variant,accepted,ms,audit,costUsdEstimated,calls})=>({variant,accepted,ms,audit,costUsdEstimated,usage:calls[0].usage,error:calls[0].error}))}));
 }
 const summaries=variants.map(variant=>{const values=runs.filter(run=>run.variant===variant.id),mean=key=>values.reduce((sum,row)=>sum+row[key],0)/values.length;return {variant:variant.id,model:variant.model,runs:values.length,accepted:values.filter(row=>row.accepted).length,meanMs:Math.round(mean('ms')),totalCostUsdEstimated:values.reduce((sum,row)=>sum+(row.costUsdEstimated || 0),0),meanCostUsdEstimated:mean('costUsdEstimated'),visibleWords:Math.round(values.reduce((sum,row)=>sum+row.audit.words,0)/values.length),truncatedFields:values.reduce((sum,row)=>sum+row.audit.clippedFields.length,0),unsupportedFinalNumbers:values.reduce((sum,row)=>sum+row.audit.unsupportedNumbers.length,0)};});
 await fs.writeFile(path.join(directory,'summary.json'),JSON.stringify({methodology,summaries},null,2));
 const blind=samples.flatMap((sample,index)=>[1,2].map(repetition=>{const pair=runs.filter(row=>row.sample===sample.id && row.repetition===repetition),ordered=(index+repetition)%2 ? pair : [...pair].reverse();return {sample:sample.id,repetition,variants:ordered.map((row,i)=>({label:i===0?'A':'B',accepted:row.accepted,brief:row.brief,audit:row.audit}))};}));
 await fs.writeFile(path.join(directory,'editorial-review.json'),JSON.stringify(blind,null,2));
 const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comparación de informes con Argon</title><style>body{font:16px/1.6 system-ui;color:#19324d;background:#f2f5f8;margin:0}main{max-width:1400px;margin:auto;padding:32px}h1,h2,h3{line-height:1.2}header,article,aside{background:white;border:1px solid #d5e0e8;border-radius:12px;padding:24px;margin:20px 0}.columns{display:grid;grid-template-columns:1fr 1fr;gap:24px}.columns>div{min-width:0}table{border-collapse:collapse;width:100%}td,th{padding:12px;text-align:left;border-bottom:1px solid #d5e0e8}small{color:#52697c}summary{cursor:pointer;font-weight:700}@media(max-width:850px){.columns{grid-template-columns:1fr}main{padding:16px}}</style><main><header><small>VALLNEWS · 12 de noviembre de 2026</small><h1>Comparación de informes con Argon</h1><p>Tres cortes guardados, dos repeticiones por modelo. Se conservan los mismos datos, instrucciones, plazo y límite de salida. Pro usa razonamiento alto; Argon, medio. La comparación de calidad es editorial y esta muestra pequeña no demuestra una mejora general.</p><p>La versión guardada utiliza una síntesis determinista. La columna del modelo anterior se regeneró con Gemini 3.1 Pro para separar el efecto del modelo del efecto de conseguir una respuesta de IA.</p></header><article><h2>Mediciones</h2><table><tr><th>Modelo</th><th>Respuestas aceptadas</th><th>Tiempo medio</th><th>Costo estimado de las seis pruebas</th><th>Campos recortados</th></tr>${summaries.map(row=>`<tr><td>${escape(row.model)}</td><td>${row.accepted}/${row.runs}</td><td>${(row.meanMs/1000).toFixed(1)} s</td><td>USD ${row.totalCostUsdEstimated.toFixed(4)}</td><td>${row.truncatedFields}</td></tr>`).join('')}</table><p><small>Precios estándar vigentes al probar. Incluye tokens de razonamiento y descuentos por caché; no es una factura de Google. Abrir o dibujar el PDF queda fuera de esta medición.</small></p></article>${samples.map(sample=>`<article><h2>${escape(sample.report.title)}</h2><p><small>Corte: ${escape(sample.report.generatedAt)}. No se actualizaron las fuentes durante la prueba.</small></p><details><summary>Síntesis anterior guardada</summary>${section(sample.previousBrief)}</details>${[1,2].map(repetition=>`<h3>Repetición ${repetition}</h3><div class="columns">${variants.map(variant=>{const run=runs.find(row=>row.sample===sample.id && row.repetition===repetition && row.variant===variant.id);return `<div><h3>${escape(variant.model)}</h3><small>${(run.ms/1000).toFixed(1)} s · ${run.accepted?'IA aceptada':'No pasó la generación o validación; se muestra el respaldo'} · ${run.audit.words} palabras · Campos recortados: ${escape(run.audit.clippedFields.join(', ') || 'ninguno')}</small>${section(run.brief)}</div>`;}).join('')}</div>`).join('')}</article>`).join('')}<aside><h2>Alcance</h2><p>No se enviaron correos, no se reescribieron informes de usuarios y no se modificó producción. La igualdad de cifras detectadas es una comprobación limitada: hay que revisar además fechas, unidades, causalidad y condiciones del texto. Los archivos de evidencia conservan la entrada, salida, modelo, tiempos y consumo por solicitud.</p><p>Tarifas: <a href="https://aistudio.google.com/docs/pricing">Google AI Studio</a>.</p></aside></main></html>`;
 await fs.writeFile(path.join(directory,'comparacion.html'),html);
 console.log(JSON.stringify({complete:true,directory,summaries}));
}
main().catch(error=>{console.error('[report-comparison]',JSON.stringify({code:error.code || error.name,status:error.status,message:error.name==='AssertionError' ? error.message : 'No terminó la comparación.'}));process.exitCode=1;});
