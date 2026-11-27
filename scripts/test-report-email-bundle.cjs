'use strict';
process.env.GMAIL_USER='fixture-only@example.invalid';process.env.GMAIL_PASS='fixture-only-password';process.env.RESEND_API_KEY='';
const assert=require('node:assert/strict');
const {createReportBundleSender,MAX_BUNDLE_BYTES}=require('../backend/services/report-email-bundle');
const {buildReportBundleEmail}=require('../backend/services/report-email-bundle-template');
const source=[{area:'mexico',health:{state:'partial',label:'Parcial',issueCount:2,references:[{label:'Precio pollo',source:'SNIIM',date:'2026-10-10',unit:'MXN/kg',status:'stale'},{label:'Res <dato>',source:'Mercado & plaza',date:'',status:'missing'}],coverage:{available:3,total:5,missing:1,stale:1,preserved:0}},executive:{key:'mx_bolsa',title:'Bolsa <México>',generatedAt:'2026-11-11T20:00:00Z'}},{area:'finance',executive:{key:'equities',title:'Bolsa <img src=x onerror="alert(1)">',generatedAt:'2026-11-12T15:00:00Z'}}];
async function main(){
 let sends=0,closes=0;const messages=[];
 const dependencies={render:async()=>Buffer.from('%PDF-1.7\nfixture'),localize:async input=>({...input,title:input.title||input.report.title}),sender:()=> 'sender@example.invalid',assets:()=>[],transport:()=>({sendMail:async message=>{sends++;messages.push(message);return {accepted:[message.to],rejected:[],messageId:'bundle-fixture-id'};},close(){closes++;}})};
 const sender=createReportBundleSender(dependencies),prepared=await sender.prepare({recipient:'recipient@example.invalid',owner:'owner@example.invalid',reports:source,testMode:true});
 assert.equal(prepared.items.length,2);assert.equal(prepared.items[0].area,'finance');assert.equal(prepared.mail.attachments.length,2);
 assert.equal(prepared.items[1].health.state,'partial');assert(prepared.mail.html.includes('Calidad de datos: Parcial'));assert(prepared.mail.text.includes('3/5 referencias con dato'));
 assert(prepared.mail.html.includes('SNIIM'));assert(prepared.mail.html.includes('Fecha del dato: 2026-10-10'));assert(prepared.mail.html.includes('Res &lt;dato&gt;'));assert(prepared.mail.text.includes('Referencias para revisar'));assert(prepared.mail.text.includes('Precio pollo — Desactualizado · Fuente: SNIIM'));
 assert.equal(new Set(prepared.items.map(item=>item.attachmentName)).size,2);assert(prepared.mail.subject.startsWith('[PRUEBA]'));
 assert(!prepared.mail.html.includes('<img src=x'));assert(prepared.mail.html.includes('&lt;img'));assert(prepared.mail.html.includes('12 nov'));assert(prepared.mail.html.includes('ediciones guardadas'));
 assert(prepared.items.every(item=>prepared.mail.text.includes(item.attachmentName)));
 assert.equal(sends,0,'Preparar y revisar el paquete nunca envía correo');
 const receipt=await sender.sendPrepared(prepared);assert.equal(sends,1);assert.equal(closes,1);assert.equal(receipt.reportCount,2);assert.equal(receipt.messageId,'bundle-fixture-id');
 assert.equal(messages[0].to,'recipient@example.invalid');assert.equal(messages[0].cc,undefined);assert.equal(messages[0].bcc,undefined);
 assert.equal((await sender.sendPrepared(prepared,{beforeSend:async()=>false})).skipped,true);assert.equal(sends,1);
 await assert.rejects(sender.sendPrepared({...prepared,mail:{...prepared.mail,to:'another@example.invalid'}}),{status:400});assert.equal(sends,1);
 await assert.rejects(sender.prepare({recipient:'one@example.invalid,two@example.invalid',reports:source}),{status:400});
 await assert.rejects(sender.prepare({recipient:'recipient@example.invalid',reports:[]}),{status:400});
 await assert.rejects(sender.prepare({recipient:'recipient@example.invalid',reports:Array(25).fill(source[0])}),{status:400});
 await assert.rejects(sender.prepare({recipient:'recipient@example.invalid',reports:[{...source[0],area:'mine'}]}),{status:400});
 const huge=Buffer.alloc(MAX_BUNDLE_BYTES+1);huge.write('%PDF-');
 await assert.rejects(createReportBundleSender({...dependencies,render:async()=>huge}).deliver({recipient:'recipient@example.invalid',reports:source}),{code:'REPORT_EMAIL_BUNDLE_TOO_LARGE'});assert.equal(sends,1);
 await assert.rejects(createReportBundleSender({...dependencies,render:async()=>Buffer.from('not a pdf')}).prepare({recipient:'recipient@example.invalid',reports:source}));
 let rejectedClosed=false;
 await assert.rejects(createReportBundleSender({...dependencies,transport:()=>({sendMail:async()=>({accepted:[],rejected:['recipient@example.invalid']}),close(){rejectedClosed=true;}})}).sendPrepared(prepared),{code:'REPORT_EMAIL_DELIVERY_FAILED'});assert(rejectedClosed);
 for(const language of ['es','en','fr','it','de','ja']){const mail=buildReportBundleEmail({reports:prepared.items,language});assert(mail.html.includes(`lang="${language}"`));assert(!mail.subject.includes('[PRUEBA]'));assert(mail.html.includes('vallnews-signature'));}
 const invalid=buildReportBundleEmail({reports:[{...prepared.items[0],generatedAt:'invalid'}]});assert(invalid.html.includes('Fecha de corte no disponible'));
 await sender.sendPrepared({...prepared,mail:{...prepared.mail,cc:'other@example.invalid',bcc:'hidden@example.invalid',envelope:{to:'other@example.invalid'}}});
 assert.equal(messages.at(-1).cc,undefined);assert.equal(messages.at(-1).bcc,undefined);assert.equal(messages.at(-1).envelope,undefined);assert.equal(messages.at(-1).to,'recipient@example.invalid');
 console.log('Email bundle: one message, all PDFs, order, preserved cutoffs, safe HTML, six languages, cancellation, recipient isolation, attachment limits and SMTP acceptance passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
