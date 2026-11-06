'use strict';
// Compiled UI -> authenticated HTTP router -> PDF -> SMTP. Only the fixture
// identity and stored catalog are isolated. Default SMTP stays in memory.
// --live permits one message to VALL_REPORT_UI_TEST_RECIPIENT, supplied only
// for an explicitly authorized live check. Recorded attempts are not retried.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const express=require('express'),cookieParser=require('cookie-parser'),jwt=require('jsonwebtoken');
const {chromium}=require('playwright'),nodemailer=require('nodemailer'),{PDFDocument}=require('pdf-lib');
const live=process.argv.includes('--live'),owner='interfaz@example.invalid';
const target=live ? process.env.VALL_REPORT_UI_TEST_RECIPIENT : 'recipient@example.invalid';
assert(target,'Set VALL_REPORT_UI_TEST_RECIPIENT to the authorized address for a live check');
const recipient=require('../backend/lib/report-email-recipient').normalizeRecipient(target);
process.env.NODE_ENV='test';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
if(live){require('dotenv').config({path:path.resolve('backend/.env'),quiet:true});require('../backend/lib/tls-trust').configureSystemTrust();}
else{process.env.GMAIL_USER='sender@example.invalid';process.env.GMAIL_PASS='fixture-only';}
process.env.JWT_SECRET='isolated-ui-mail-http-not-production';process.env.GEMINI_API_KEY='';
for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','SUPABASE_DATABASE_URL','DATABASE_URL','SUPABASE_PASSWORD'])process.env[key]='';
const profile={id:'ui-mail-fixture',email:owner,role:'user',active:true,credentialVersion:0,preferences:{}};
const profiles=require('../backend/services/user-profile-store');
profiles.findById=async id=>id===profile.id ? profile : null;
profiles.findByEmail=async()=>{throw Error('Unexpected external identity lookup');};
profiles.updateProfile=async()=>{throw Error('Unexpected profile write');};
const schedules=require('../backend/services/report-email-schedule-store');
schedules.list=async()=>[];
for(const name of ['upsert','upsertMany','remove'])schedules[name]=async()=>{throw Error('Schedules must remain unchanged');};
const root=path.resolve(__dirname,'..'),folder=path.join(root,'output/correo-pruebas-20261106');
const ledger=path.join(folder,'interfaz-envio-real.json'),createTransport=nodemailer.createTransport.bind(nodemailer);
let sendCalls=0,sentMessage;
nodemailer.createTransport=options=>{
 const transport=createTransport(live ? options : {streamTransport:true,buffer:true,newline:'windows'}),send=transport.sendMail.bind(transport);
 transport.sendMail=async message=>{
  assert.equal(message.to,recipient,'Only the user-authorized recipient may be contacted');
  assert.equal(sendCalls,0,'No duplicate email may leave the UI test');sendCalls++;sentMessage=message;
  const attempt={state:'attempting',recipient,startedAt:new Date().toISOString(),via:'compiled UI and real HTTP export router',fixtureIdentity:true,automaticEmails:false};
  if(live)await fs.writeFile(ledger,JSON.stringify(attempt,null,2),{flag:'wx'});
  try{
   await new Promise(resolve=>setTimeout(resolve,800));
   const receipt=await send(message),accepted=live ? receipt.accepted : receipt.envelope.to;
   if(live)await fs.writeFile(ledger,JSON.stringify({...attempt,state:accepted?.includes(recipient) ? 'accepted_by_smtp' : 'not_confirmed',finishedAt:new Date().toISOString(),messageId:receipt.messageId,attachmentName:message.attachments[0].filename,pdfBytes:message.attachments[0].content.length,inboxConfirmed:false},null,2));
   return live ? receipt : {...receipt,accepted,rejected:[]};
  }catch(error){if(live)await fs.writeFile(ledger,JSON.stringify({...attempt,state:'not_confirmed',code:error.code || 'MAIL_TEST_FAILED'},null,2));throw error;}
 };
 return transport;
};
const {router:auth}=require('../backend/routes/auth'),exportRouter=require('../backend/routes/export');
(async()=>{
 await fs.mkdir(folder,{recursive:true});
 if(live){let exists=false;try{await fs.access(ledger);exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}assert(!exists,'A real UI send is already recorded; do not resend automatically');}
 const snapshot=JSON.parse(await fs.readFile(path.join(root,'backend/cache/mexico-executive-reports.json'),'utf8'));
 const report=structuredClone(snapshot.reports.find(item=>item.key==='mx_overview'));assert(report);
 report.title='[PRUEBA INTERFAZ] Panorama nacional de México';report.personalization={...report.personalization,customTitle:report.title};
 const unchanged=JSON.stringify(snapshot),app=express(),requests=[],errors=[];let browser,page,server;
 app.use(cookieParser());
 app.use((req,res,next)=>{if(req.method==='POST' && req.path==='/api/report-email')requests.push({method:req.method,path:req.path});next();});
 app.use('/api',auth);app.use('/api',exportRouter);
 app.get('/api/mexico-executive-reports',(_req,res)=>res.json({success:true,data:[report]}));
 app.use('/api',(_req,res)=>res.json({success:true,data:[],articles:[]}));
 app.use(express.static(path.join(root,'dist')));app.use((_req,res)=>res.sendFile(path.join(root,'dist/index.html')));
 try{
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.addCookies([{name:'vn_token',value:jwt.sign({sub:profile.id,email:owner,role:'user',credentialVersion:0},process.env.JWT_SECRET,{expiresIn:'10m'}),url:origin,httpOnly:true,sameSite:'Lax'}]);
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/informes');await page.getByRole('tab',{name:/^México/}).click();
  await page.locator('.erh-library-entry').filter({has:page.locator('strong',{hasText:report.title})}).first().click();
  await page.getByRole('region',{name:'Vista previa PDF de '+report.title,exact:true}).locator('canvas').waitFor({state:'visible',timeout:120000});
  await page.getByRole('button',{name:'Programar reportes',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Programar reportes',exact:true});
  await dialog.getByText('Correo configurado · Servidor local',{exact:true}).waitFor();
  await dialog.getByText('Las entregas automáticas están pausadas en esta sesión de diagnóstico. Puedes usar Enviar ahora.',{exact:true}).waitFor();
  assert(await dialog.getByLabel('Envíos automáticos',{exact:true}).isDisabled());
  await dialog.getByLabel('Otro correo',{exact:false}).check();const address=dialog.getByLabel('Correo del destinatario',{exact:true}),button=dialog.getByRole('button',{name:'Enviar PDF por correo',exact:true});
  assert(await button.isDisabled());await address.fill('correo-invalido');assert(await button.isDisabled());
  for(const candidate of ['prueba@gmail.com','prueba@hotmail.com','prueba@outlook.com']){await address.fill(candidate);assert(await button.isEnabled(),candidate+' may be selected without sending');}
  await address.fill(recipient);await dialog.getByRole('button',{name:'Comprobar correo',exact:true}).click();await dialog.getByText('Correo configurado · Servidor local',{exact:true}).waitFor();assert.equal(sendCalls,0);
  for(const width of [390,1440]){await page.setViewportSize({width,height:1000});assert(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1));}
  await page.screenshot({path:path.join(folder,live ? 'interfaz-real-antes.png' : 'interfaz-simulada-antes.png')});
  await dialog.locator('.erh-send-immediate>button:enabled').waitFor();
  const responseReady=page.waitForResponse(response=>response.url()===origin+'/api/report-email' && response.request().method()==='POST',{timeout:75000});
  if(live)await button.click();else await button.evaluate(element=>{element.click();element.click();});
  const busy=dialog.getByRole('button',{name:'Enviando PDF…',exact:true});await busy.waitFor();assert(await busy.isDisabled());assert(await address.isDisabled());
  const response=await responseReady,body=await response.json();assert.equal(response.status(),200,JSON.stringify(body));assert.equal(body.success,true);
  const request=response.request().postDataJSON();assert.equal(request.expectedOwner,owner);assert.equal(request.recipientEmail,recipient);assert.equal(request.language,'es');assert.equal(request.executiveReport.title,report.title);
  await dialog.locator('.erh-send-feedback').filter({hasText:'PDF enviado'}).waitFor();assert((await dialog.locator('.erh-send-feedback').innerText()).includes('@'+recipient.split('@')[1]));
  for(const width of [390,1440]){await page.setViewportSize({width,height:1000});await dialog.locator('.erh-send-body').evaluate(element=>{element.scrollTop=element.scrollHeight;});const feedback=await dialog.locator(':scope > .erh-send-feedback').boundingBox();assert(feedback && feedback.y>=0 && feedback.y+feedback.height<=1000,'The send confirmation remains visible while scrolling at '+width+'px');}
  assert.equal(sendCalls,1);assert.equal(requests.length,1);assert.equal(sentMessage.attachments[0].filename,body.filename);assert.equal(sentMessage.attachments[0].content.length,body.size);
  const pdf=await PDFDocument.load(sentMessage.attachments[0].content),normalized=exportRouter._test.executivePayload(request.executiveReport),{reportDocumentTitle,reportDownloadName}=await import('../shared/report-download-name.mjs');
  assert.equal(pdf.getTitle(),reportDocumentTitle(normalized,{language:'es',title:normalized.title}));assert.equal(body.filename,reportDownloadName(normalized));assert(sentMessage.subject.includes(report.title));
  assert(pdf.getPageCount()>=1);assert.deepEqual(errors,[]);assert.equal(JSON.stringify(snapshot),unchanged);
  await page.screenshot({path:path.join(folder,live ? 'interfaz-real-confirmacion.png' : 'interfaz-simulada-confirmacion.png')});
  const result={mode:live ? 'live SMTP' : 'simulated SMTP with real MIME',fixtureIdentity:true,origin,route:'/api/report-email',httpStatus:response.status(),requests:requests.length,smtpMessages:sendCalls,realMessages:live ? 1 : 0,recipient,filename:body.filename,pdfBytes:body.size,pages:pdf.getPageCount(),invalidRecipientBlocked:true,recipientDomainsAccepted:['gmail.com','hotmail.com','outlook.com'],duplicateClickTested:!live,automaticEmails:false,errors};
  await fs.writeFile(path.join(folder,live ? 'interfaz-real-resultado.json' : 'interfaz-simulada-resultado.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(error){if(page){await page.screenshot({path:path.join(folder,live ? 'interfaz-real-error.png' : 'interfaz-simulada-error.png')});await fs.writeFile(path.join(folder,'interfaz-error.txt'),await page.locator('body').innerText());}throw error;}
 finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
})().catch(error=>{console.error(error);process.exitCode=1;});
