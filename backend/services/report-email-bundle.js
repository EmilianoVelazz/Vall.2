'use strict';
const {normalizeRecipient}=require('../lib/report-email-recipient');
const {reportDownloadName}=require('../../shared/report-download-name.mjs');
const {reportEmailAttachments}=require('./report-email-template');
const {buildReportBundleEmail}=require('./report-email-bundle-template');
const {mailTransport,mailSender,mailFailure}=require('./report-mailer');
const collections=require('../../shared/report-collections.json');
const MAX_BUNDLE_BYTES=18*1024*1024,MAX_BUNDLE_REPORTS=24;

function createReportBundleSender({render,localize,cache,transport=mailTransport,sender=mailSender,assets=reportEmailAttachments}={}){
 async function prepare({recipient,reports,language='es',owner='',testMode=false,onPrepared}){
  recipient=normalizeRecipient(recipient);
  if(!Array.isArray(reports)||!reports.length||reports.length>MAX_BUNDLE_REPORTS)throw Object.assign(Error('El paquete debe incluir entre 1 y 24 informes.'),{status:400});
  const attachments=[],items=[],brandAssets=assets();let bytes=brandAssets.reduce((sum,item)=>sum+(item.content?.length||0),0);
  const areas=['finance','markets','mexico'];
  const order=item=>[areas.indexOf(item?.area),/^(?:overview|mx_overview)$/.test(item?.executive?.key)?-1:collections[item?.area]?.reportKeys.indexOf(item?.executive?.key)??99];
  const ordered=reports.toSorted((a,b)=>{const left=order(a),right=order(b);return left[0]-right[0]||left[1]-right[1];});
  for(const [index,item]of ordered.entries()){
   if(!item?.executive || !['finance','markets','mexico'].includes(item.area))throw Object.assign(Error('El paquete contiene un informe no válido.'),{status:400});
   const localized=await localize({report:item.executive,title:item.title||item.executive.title,language},{owner});
   const input={owner,language,title:localized.title,report:localized.report,images:[]};
   const load=()=>render(localized.title,localized.report,localized);
   const buffer=await (cache?cache.getOrCreate(input,load):load());
   if(!Buffer.isBuffer(buffer)||buffer.subarray(0,5).toString()!=='%PDF-')throw Error('El generador no confirmó un PDF válido.');
   bytes+=buffer.length;
   if(bytes>MAX_BUNDLE_BYTES)throw Object.assign(Error('El paquete supera el límite de 18 MiB de adjuntos. Reduce la selección antes de enviarlo.'),{status:413,code:'REPORT_EMAIL_BUNDLE_TOO_LARGE'});
   const attachmentName=String(index+1).padStart(2,'0')+'_'+item.area+'_'+reportDownloadName(localized.report,'pdf',{language});
   attachments.push({filename:attachmentName,content:buffer,contentType:'application/pdf'});
   items.push({area:item.area,key:localized.report.key,title:localized.report.title||localized.title,generatedAt:localized.report.generatedAt,executive:localized.report,health:item.health,attachmentName,size:buffer.length});
   onPrepared?.({index:index+1,total:reports.length,filename:attachmentName,size:buffer.length});
  }
  const content=buildReportBundleEmail({reports:items,language,testMode});
  return {recipient,language,items,size:bytes,mail:{from:`VALLNEWS <${sender()}>`,to:recipient,headers:{'Content-Language':language},...content,attachments:[...attachments,...brandAssets]}};
 }
 async function sendPrepared(prepared,{beforeSend}={}){
  const recipient=normalizeRecipient(prepared.recipient);
  if(prepared.mail.to!==recipient)throw Object.assign(Error('El destinatario del paquete cambió.'),{status:400});
  if(beforeSend && !(await beforeSend()))return {skipped:true};
  const connection=transport();if(!connection)throw mailFailure();
  try{
   const {from,subject,html,text,attachments}=prepared.mail;
   const receipt=await connection.sendMail({from,to:recipient,subject,html,text,attachments,headers:{'Content-Language':prepared.language}});
   const contains=list=>list?.some(value=>String(value).trim().toLowerCase()===recipient.toLowerCase());
   if(!contains(receipt?.accepted)||contains(receipt?.rejected))throw Object.assign(Error('El servidor de correo no confirmó al destinatario.'),{code:'EENVELOPE'});
   return {messageId:String(receipt.messageId||'').slice(0,240),size:prepared.size,reportCount:prepared.items.length,attachmentNames:prepared.items.map(item=>item.attachmentName),language:prepared.language};
  }catch(error){throw error.code?.startsWith('REPORT_EMAIL_')?error:mailFailure(error);}
  finally{try{connection.close?.();}catch{console.warn('[report-email-bundle] No se confirmó el cierre del transporte.');}}
 }
 async function deliver(input){const prepared=await prepare(input);return sendPrepared(prepared,{beforeSend:input.beforeSend});}
 return {prepare,sendPrepared,deliver};
}
module.exports={createReportBundleSender,MAX_BUNDLE_BYTES,MAX_BUNDLE_REPORTS};
