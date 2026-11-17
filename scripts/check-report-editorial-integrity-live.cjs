'use strict';
// Reads saved public cuts. Writes verification artifacts only; never publishes or mails.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
process.env.NODE_ENV='test';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';process.env.RUN_BACKGROUND_JOBS='false';
require('dotenv').config({path:'backend/.env',quiet:true});require('../backend/lib/tls-trust').configureSystemTrust();
const {GeminiProvider,MODELS}=require('../backend/ai/providers/gemini-provider');
const {ExecutiveReportAgent}=require('../backend/ai/executive-report-agent');
const {withDailyEvidence}=require('../backend/lib/report-daily-evidence');
const {weeklyReport}=require('../shared/report-weekly.mjs');
const {reportLabels}=require('../backend/lib/report-language');
require('../backend/services/report-translation').reportTranslator.localize=async input=>({...input,...reportLabels('es'),source:value=>value,translateText:value=>value});
const {_test}=require('../backend/routes/export');
async function main(){
 const finance=JSON.parse(await fs.readFile('backend/cache/finance_executive_reports.json','utf8')),markets=JSON.parse(await fs.readFile('backend/cache/market_executive_reports.json','utf8'));
 const samples=[{key:'equities',area:'Finanzas',snapshot:finance},{key:'fx',area:'Finanzas',snapshot:finance},{key:'grains',area:'Mercados',snapshot:markets}];
 const folder=path.resolve('output/report-verification-20261112/live'),pdfFolder=path.resolve('tmp/pdfs/report-verification/live');await fs.mkdir(folder,{recursive:true});await fs.mkdir(pdfFolder,{recursive:true});
 const results=[];
 for(const {key,area,snapshot} of samples){
  const selected=process.argv.find(value=>value.startsWith('--key='))?.slice(6);if(selected && selected!==key)continue;
  const input=structuredClone(snapshot.reports.find(report=>report.key===key));assert(input);delete input.executiveBrief;const before=JSON.stringify(input);
  const provider=new GeminiProvider();assert(provider.isConfigured());assert.equal(MODELS.report,'gemini-4-argon');provider.modelsForTier=()=>[MODELS.report];let calls=0;
  const generate=provider.generate.bind(provider);provider.generate=options=>{calls++;return generate(options);};
  const started=Date.now(),[report]=await new ExecutiveReportAgent({provider}).enrich([input],{area}),generationMs=Date.now()-started;
  assert.equal(report.executiveBrief.mode,'ai',key+': no se obtuvo una lectura validada');assert.equal(report.executiveBrief.model,MODELS.report);assert.equal(JSON.stringify(input),before);
  await fs.writeFile(path.join(folder,key+'-generated.json'),JSON.stringify(report,null,2));
  const payload=withDailyEvidence(_test.executivePayload(report)),view=weeklyReport(payload);
  assert.equal(payload.executiveBrief?.thesis,report.executiveBrief.thesis,key+': la normalización perdió el análisis');
  assert.equal(view.summaryPanels.find(panel=>panel.summaryKind==='session')?.body,report.executiveBrief.thesis,key+': la plantilla perdió el análisis');
  const bytes=await _test.makeExecutivePdf(payload.title,payload),pdf=path.join(pdfFolder,key+'.pdf');await fs.writeFile(pdf,bytes);
  const result={key,model:report.executiveBrief.model,generationMs,calls,cutoff:report.generatedAt,brief:report.executiveBrief,pdf,pdfBytes:bytes.length,passed:true};results.push(result);
  await fs.writeFile(path.join(folder,key+'.json'),JSON.stringify({result,report},null,2));await fs.writeFile(path.join(folder,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({key,generationMs,calls,model:result.model,pdfBytes:bytes.length,passed:true}));
 }
}
main().catch(error=>{console.error('[live-report-verification]',JSON.stringify({code:error.code || error.name,status:error.status,message:error.name==='AssertionError'?error.message:'No terminó la prueba real.'}));process.exitCode=1;});
