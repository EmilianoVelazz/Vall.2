'use strict';
// Generates only explicitly labelled fictional reports; no user records or mail.
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
// Match backend/server.js: a separate .env.local may belong to another API project.
require('dotenv').config({path:'backend/.env',quiet:true});
require('../backend/lib/tls-trust').configureSystemTrust();
const {GeminiProvider}=require('../backend/ai/providers/gemini-provider');
const {ExecutiveReportAgent}=require('../backend/ai/executive-report-agent');
const {UserReportAgent}=require('../backend/ai/user-report-agent');
async function main(){
 const provider=new GeminiProvider();assert(provider.isConfigured(),'Gemini is not configured');assert.equal(provider.modelForTier('report'),'gemini-4-argon');
 const report={key:'fx',collection:'finance',title:'Prueba de integración Argon · datos ficticios',generatedAt:'2026-11-12T15:00:00Z',summary:'Dato ficticio de integración: USD/MXN de 20 MXN por USD. No es una cotización real.',metrics:[{label:'USD/MXN de simulación',value:'20 MXN por USD',change:''}],sections:[{heading:'Alcance de la prueba',text:'La exposición y los vencimientos de la empresa no se conocen. No inferirlos ni calcular importes. El único dato numérico disponible es la referencia ficticia proporcionada.'}],tables:[],sourceLinks:[{label:'Fuente ficticia de integración',url:'https://example.invalid/argon-test'}]};
 const start=Date.now(),[executive]=await new ExecutiveReportAgent({provider}).enrich([report],{area:'Finanzas'}),executiveMs=Date.now()-start;
 assert.equal(executive.executiveBrief?.mode,'ai','The live response must pass evidence validation');assert.equal(executive.executiveBrief.model,'gemini-4-argon','A fallback cannot count as an Argon success');assert.deepEqual(executive.metrics,report.metrics);
 const personalizedAt=Date.now(),personalized=await new UserReportAgent({provider}).generate({report,instructions:'Redacta una lectura breve para tesorería usando sólo esta simulación. Conserva su referencia, distingue lo desconocido y no hagas cálculos ni agregues cifras.'});
 assert.equal(personalized.aiEdition.model,'gemini-4-argon');assert.deepEqual(personalized.metrics,report.metrics);
 const result={checkedAt:new Date().toISOString(),model:'gemini-4-argon',liveProvider:true,fictionalDataOnly:true,executiveMs,personalizedMs:Date.now()-personalizedAt,evidenceRetained:true,executiveBrief:executive.executiveBrief,personalized,emailsSent:0,userRecordsWritten:0};
 await fs.mkdir('output/report-argon-20261112',{recursive:true});await fs.writeFile('output/report-argon-20261112/live.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({model:result.model,executiveMs:result.executiveMs,personalizedMs:result.personalizedMs,evidenceRetained:true,emailsSent:0,userRecordsWritten:0}));
}
main().catch(error=>{console.error('[report-argon-live]',JSON.stringify({code:error.code || error.name,status:error.status,reason:error.name==='AssertionError' ? error.message : 'La prueba real no terminó correctamente.'}));process.exitCode=1;});
