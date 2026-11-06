'use strict';
// Real MIME composition, simulated SMTP acceptance. No external delivery.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const nodemailer=require('nodemailer'),{PDFDocument}=require('pdf-lib');
process.env.NODE_ENV='test';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
process.env.GMAIL_USER='sender@example.invalid';process.env.GMAIL_PASS='fixture-only';
for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DATABASE_URL','DATABASE_URL','SUPABASE_PASSWORD','GEMINI_API_KEY'])process.env[key]='';
const createTransport=nodemailer.createTransport.bind(nodemailer),messages=[];
let mode='accepted',closed=0;
nodemailer.createTransport=options=>{
 assert.equal(options.service,'gmail','The recipient never changes the configured sender transport');
 const stream=createTransport({streamTransport:true,buffer:true,newline:'windows'});
 return {sendMail:async message=>{
  if(mode==='timeout')throw Object.assign(Error('Private SMTP detail'),{code:'ETIMEDOUT'});
  if(mode==='rejected')return {accepted:[],rejected:[message.to]};
  const receipt=await stream.sendMail(message);messages.push({message,receipt});
  return {...receipt,accepted:receipt.envelope.to,rejected:[]};
 },close:()=>{closed++;stream.close();}};
};
const {normalizeRecipient}=require('../backend/lib/report-email-recipient');
const {mailAutomationEnabled}=require('../backend/services/report-mailer');
const router=require('../backend/routes/export');
(async()=>{
 const report={title:'[PRUEBA] Compatibilidad de correo',collection:'mine',userEdition:true,generatedAt:'2026-11-06T15:00:00Z',summary:'Prueba sintética de correo y archivo adjunto; no contiene precios de mercado.',sections:[{heading:'Comprobación',text:'Validar el mensaje y su PDF adjunto.'}],metrics:[],tables:[],visuals:[],takeaways:[],watchlist:[],sources:[],sourceLinks:[]};
 const original=JSON.stringify(report),folder=path.resolve('output/correo-pruebas-20261106');await fs.mkdir(folder,{recursive:true});const results=[];
 for(const address of ['prueba+informe@gmail.com','prueba+informe@hotmail.com','prueba+informe@outlook.com','prueba+informe@vallpork.com']){
  const recipient=normalizeRecipient(' '+address.toUpperCase()+' '),result=await router._test.deliverExecutiveEmail({recipient,title:report.title,executive:report});
  const {message,receipt}=messages.at(-1),mime=receipt.message.toString('utf8');
  assert.equal(message.to,address);assert.deepEqual(receipt.envelope.to,[address]);
  assert.match(mime,/^MIME-Version: 1\.0\r?$/m);assert.match(mime,/multipart\/mixed/i);assert.match(mime,/multipart\/alternative/i);
  assert.match(mime,/Content-Type: text\/plain; charset=utf-8/i);assert.match(mime,/Content-Type: text\/html; charset=utf-8/i);
  assert.match(message.html,/\[if mso\]/);assert.match(message.html,/role="presentation"/);assert.match(message.text,/PDF adjunto/);
  const boundary=/boundary="([^"]+)"/.exec(mime)?.[1];assert(boundary);
  const part=mime.split('--'+boundary).find(item=>/Content-Type: application\/pdf/i.test(item));assert(part);
  assert.match(part,/Content-Disposition: attachment/i);assert.match(part,/Content-Transfer-Encoding: base64/i);
  const attachment=Buffer.from(part.slice(part.indexOf('\r\n\r\n')+4).trim(),'base64');
  assert.deepEqual(attachment,message.attachments[0].content,'The MIME attachment is the complete exported PDF');
  const pdf=await PDFDocument.load(attachment);assert(pdf.getPageCount()>0);assert(pdf.getTitle().includes(report.title));
  assert.equal(result.size,attachment.length);assert.equal(result.attachmentName,message.attachments[0].filename);assert.equal(message.headers['Content-Language'],'es');
  results.push({domain:address.split('@')[1],mimeBytes:receipt.message.length,pdfBytes:attachment.length,pages:pdf.getPageCount(),filename:result.attachmentName});
 }
 for(const [failure,code,status] of [['rejected','REPORT_EMAIL_DELIVERY_FAILED',502],['timeout','REPORT_EMAIL_UNAVAILABLE',503]]){
  mode=failure;await assert.rejects(router._test.deliverExecutiveEmail({recipient:'prueba@gmail.com',title:report.title,executive:report}),error=>error.code===code && error.status===status && !error.message.includes('Private SMTP detail'));
 }
 assert.equal(messages.length,4);assert.equal(closed,6);assert.equal(JSON.stringify(report),original);assert.equal(mailAutomationEnabled(),false);
 await fs.writeFile(path.join(folder,'domains-simulation.json'),JSON.stringify({simulated:true,realMessages:0,results,errorsHandled:['rejected','timeout'],automaticEmails:false},null,2));
 console.log('Email domains: Gmail, Hotmail, Outlook and corporate recipients; real MIME composition, text/HTML alternatives, Outlook tables, complete PDF, matching filename, rejected SMTP and timeout. No real messages.');
})().catch(error=>{console.error(error);process.exitCode=1;});
