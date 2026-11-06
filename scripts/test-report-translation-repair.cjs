'use strict';
const assert=require('node:assert/strict');
const {createReportTranslator}=require('../backend/services/report-translation');
async function main() {
 const report={title:'Informe sintético para reparación',summary:'El costo es 38.50 MXN/kg. El cambio corresponde al último mes.',sections:[{heading:'Revisión de existencias',text:'Confirmar existencias con proveedor.'}],metrics:[],tables:[],visuals:[]};
 const original=JSON.stringify(report),calls=[],diagnostics=[];
 const tokenPattern=/__VNT_[a-f0-9]+_\d+_\d+__/g;
 const provider={isConfigured:()=>true,generate:async request=>{
  const payload=JSON.parse(request.prompt);calls.push(payload);
  assert.match(request.systemInstruction,/quantities written in words must remain words/);
  return {finishReason:'STOP',text:JSON.stringify({language:'ja',translations:payload.translations.map(item=>({id:item.id,text:(item.text.match(tokenPattern) || []).join(' ')+' '+(item.text.includes('último mes') ? payload.repair ? '直近の月の変動です。' : '直近1か月の変動です。' : '確認用のテキストです。')}))})};
 }};
 const translator=createReportTranslator({provider,onDiagnostic:metadata=>diagnostics.push(metadata)});
 const localized=await translator.localize({report,language:'ja'},{owner:'repair@example.invalid'});
 assert.equal(calls.length,2);assert(calls[0].translations.length>1);assert.equal(calls[1].translations.length,1,'Sólo se reintenta el campo rechazado');assert.equal(calls[1].repair,true);
 assert(localized.report.summary.includes('38.50 MXN/kg'));assert(localized.report.summary.includes('直近の月'));assert(!localized.report.summary.includes('1か月'));
 assert.equal(JSON.stringify(report),original);assert.equal(diagnostics[0].reason,'unprotected_value');assert(!('source' in diagnostics[0]),'Los diagnósticos no incluyen texto del usuario');
 await translator.localize({report,language:'ja'},{owner:'repair@example.invalid'});assert.equal(calls.length,2,'Sólo el resultado validado se guarda en caché');
 await translator.localize({report,language:'ja'},{owner:'another@example.invalid'});assert.equal(calls.length,4,'La caché sigue separada por cuenta');
 for(const bad of ['number','token','url']) {
  let attempts=0;
  const invalid=createReportTranslator({provider:{isConfigured:()=>true,generate:async request=>{attempts++;const payload=JSON.parse(request.prompt);return {text:JSON.stringify({language:'ja',translations:payload.translations.map(item=>({id:item.id,text:bad==='token' ? '欠落した値です。' : item.text+(bad==='number' ? ' 99999' : ' https://example.invalid/new')}))})};}}});
  await assert.rejects(invalid.localize({report,language:'ja'}),error=>error.code==='REPORT_TRANSLATION_INVALID');assert.equal(attempts,2,'El reintento está acotado');
 }
 for(const [code,expected] of [['AI_RATE_LIMIT','REPORT_TRANSLATION_BUSY'],['AI_AUTH','REPORT_TRANSLATION_UNAVAILABLE'],['AI_TIMEOUT','REPORT_TRANSLATION_TIMEOUT']]) {
  const failing=createReportTranslator({provider:{isConfigured:()=>true,generate:async()=>{throw Object.assign(Error('Provider fixture'),{code});}}});
  await assert.rejects(failing.localize({report,language:'ja'}),error=>error.code===expected);
 }
 let repairStarted=false;
 const stalled=createReportTranslator({timeoutMs:30,provider:{isConfigured:()=>true,generate:request=>{if(JSON.parse(request.prompt).repair){repairStarted=true;return new Promise(()=>{});}return provider.generate(request);}}});
 await assert.rejects(stalled.localize({report,language:'ja'}),error=>error.code==='REPORT_TRANSLATION_TIMEOUT');assert(repairStarted,'El plazo total también incluye la reparación');
 console.log('Report translation repair: OK · japonés, reparación por campo, cifras y unidades intactas, rechazo de valores y URLs nuevos, reintento acotado y caché privada');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
