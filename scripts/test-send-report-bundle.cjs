'use strict';
// Preparar y revisar primero. --send hace un único envío, al destinatario
// explícitamente autorizado, sin activar programaciones ni otras cuentas.
const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
require('dotenv').config({path:'backend/.env',quiet:true});require('dotenv').config({path:'.env.local',quiet:true});
process.env.NODE_ENV='test';process.env.VERCEL='1';process.env.RUN_BACKGROUND_JOBS='false';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
process.env.JWT_SECRET='fixture-only-bundle-preparation-secret-never-used-to-login';
for(const key of ['GEMINI_API_KEY','SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DATABASE_URL','DATABASE_URL','FINNHUB_TOKEN','NEWSAPI_KEY'])process.env[key]='';
const {reportMailStatus,mailSender}=require('../backend/services/report-mailer');
const http=require('../backend/lib/http');http.externalGet=async()=>{throw Error('External data sources disabled for the format test');};http.yahooFetch=http.externalGet;http.gdeltFetch=http.externalGet;
const {PDFDocument}=require('pdf-lib');
const RECIPIENT='jonathan.lopez@vallpork.com',out=path.resolve('output/report-bundle-test-20261117');
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
async function main(){
 if(!reportMailStatus().configured)throw Object.assign(Error('Correo no configurado'),{code:'REPORT_EMAIL_NOT_CONFIGURED'});
 await fs.mkdir(path.join(out,'attachments'),{recursive:true});
 if(!process.argv.includes('--send')){
  if(sync.existsSync(path.join(out,'send-attempt.json')))throw Error('Ya se intentó enviar esta prueba; se conserva para evitar duplicados.');
  const {_test}=require('../backend/routes/export'),{enrichSectorReport}=require('../backend/lib/report-sector-format');
  await require('../backend/lib/report-branding').prepareReportBranding();
  const reports=[];
  for(const [area,file]of [['finance','finance_executive_reports.json'],['markets','market_executive_reports.json'],['mexico','mexico-executive-reports.json']]){
   const snapshot=JSON.parse(await fs.readFile(path.join('backend/cache',file),'utf8'));
   for(const report of snapshot.reports)reports.push({area,executive:_test.executivePayload(enrichSectorReport(report,area))});
  }
  if(reports.length!==14||reports.some(item=>!item.executive))throw Error('La prueba requiere los 14 informes de las tres colecciones.');
  const prepared=await _test.reportBundleSender.prepare({recipient:RECIPIENT,owner:RECIPIENT,reports,testMode:true,onPrepared:info=>console.log(JSON.stringify({prepared:info.index,total:info.total,size:info.size,filename:info.filename}))});
  const files=[];
  for(const attachment of prepared.mail.attachments){
   let pages=null;if(attachment.contentType==='application/pdf'){const document=await PDFDocument.load(attachment.content,{updateMetadata:false});pages=document.getPageCount();if(!pages)throw Error('PDF vacío');}
   const file=path.join('attachments',attachment.filename),target=path.resolve(out,file);
   if(!target.startsWith(out+path.sep))throw Error('Ruta de adjunto inválida.');
   await fs.writeFile(target,attachment.content);
   files.push({file,filename:attachment.filename,contentType:attachment.contentType,...(attachment.cid?{cid:attachment.cid,contentDisposition:attachment.contentDisposition}:{}),size:attachment.content.length,pages,sha256:hash(attachment.content)});
  }
  await fs.writeFile(path.join(out,'email.html'),prepared.mail.html);await fs.writeFile(path.join(out,'email.txt'),prepared.mail.text);
  const manifest={preparedAt:new Date().toISOString(),recipient:RECIPIENT,from:prepared.mail.from,subject:prepared.mail.subject,language:prepared.language,size:prepared.size,reportCount:prepared.items.length,items:prepared.items.map(({executive:_report,...item})=>item),files,automationEnabled:false,source:'Saved editions with their original cutoff dates; no source refresh or AI generation.'};
  await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
  const preview=await require('nodemailer').createTransport({streamTransport:true,buffer:true,newline:'unix'}).sendMail(prepared.mail);
  await fs.writeFile(path.join(out,'preview.eml'),preview.message);
  console.log(JSON.stringify({prepared:true,recipient:RECIPIENT,reportCount:prepared.items.length,pdfBytes:prepared.size,mimeBytes:preview.message.length,subject:prepared.mail.subject,sent:false}));return;
 }
 const manifest=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8'));
 if(manifest.recipient!==RECIPIENT||manifest.reportCount!==14||manifest.from!==`VALLNEWS <${mailSender()}>`)throw Error('La prueba preparada no coincide con el destinatario o remitente autorizados.');
 const attachments=[];
 for(const file of manifest.files){const target=path.resolve(out,file.file);if(!target.startsWith(out+path.sep))throw Error('Ruta inválida');const content=await fs.readFile(target);if(hash(content)!==file.sha256)throw Error('El adjunto cambió desde la revisión.');attachments.push({filename:file.filename,content,contentType:file.contentType,...(file.cid?{cid:file.cid,contentDisposition:file.contentDisposition}:{})});}
 const prepared={recipient:RECIPIENT,language:manifest.language,items:manifest.items,size:manifest.size,mail:{from:manifest.from,to:RECIPIENT,subject:manifest.subject,headers:{'Content-Language':manifest.language},html:await fs.readFile(path.join(out,'email.html'),'utf8'),text:await fs.readFile(path.join(out,'email.txt'),'utf8'),attachments}};
 await fs.writeFile(path.join(out,'send-attempt.json'),JSON.stringify({recipient:RECIPIENT,startedAt:new Date().toISOString(),state:'attempted-once'},null,2),{flag:'wx'});
 const {createReportBundleSender}=require('../backend/services/report-email-bundle');
 const receipt=await createReportBundleSender().sendPrepared(prepared);
 const result={acceptedAt:new Date().toISOString(),recipient:RECIPIENT,emails:1,...receipt,scheduledTasksRun:false};
 await fs.writeFile(path.join(out,'sent.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(JSON.stringify({code:error.code||error.name,status:error.status,message:['REPORT_EMAIL_NOT_CONFIGURED','REPORT_EMAIL_AUTH_FAILED','REPORT_EMAIL_UNAVAILABLE','REPORT_EMAIL_BUNDLE_TOO_LARGE'].includes(error.code)?error.message:'La prueba no terminó; revisar los archivos locales antes de reintentar para evitar duplicados.'}));process.exitCode=1;});
