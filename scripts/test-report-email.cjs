'use strict';
/* global document, window */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const express=require('express');
const jwt=require('jsonwebtoken');
const {chromium}=require('playwright');
const {normalizeRecipient}=require('../backend/lib/report-email-recipient');
const {buildReportEmail}=require('../backend/services/report-email-template');

async function main() {
 const directory=path.resolve(__dirname,'../output/correos-informes');await fs.mkdir(directory,{recursive:true});
 assert.equal(normalizeRecipient(undefined,'Owner@Example.invalid'),'owner@example.invalid');
 assert.equal(normalizeRecipient(' jefe+compras@example.invalid '),'jefe+compras@example.invalid');
 for(const invalid of ['', 'bad','a@example.invalid,b@example.invalid','Ana <a@example.invalid>','a@example.invalid\r\nBcc:b@example.invalid','a@-example.invalid','a..b@example.invalid','a@example..invalid','x'.repeat(65)+'@example.invalid',[],{}]) assert.throws(()=>normalizeRecipient(invalid),error=>error.status===400);
 const report={title:'Abastecimiento de proteínas · Comité de compras',eyebrow:'México · Edición personalizada',generatedAt:'2026-10-12T14:00:00Z',summary:'El corte reúne referencias de cerdo, pollo y res para revisar el abastecimiento. La fecha, la presentación y las condiciones de entrega deben compararse antes de decidir.\n\nEsta muestra sirve para revisar el diseño del correo; sus referencias son datos de simulación.',takeaways:['Contrastar la disponibilidad del proveedor con la referencia de cada plaza.','Separar ganado en pie, canal y producto al mayoreo para comparar costos.','Completar flete, merma y condiciones de pago para evaluar el costo entregado.'],closing:'Solicitar cotizaciones con la misma presentación y fecha, y revisar la disponibilidad antes de confirmar un pedido.',metrics:[{label:'Cerdo · referencia de simulación',value:'38 MXN/kg vivo',change:'Puebla · dato de prueba'},{label:'Res · referencia de simulación',value:'90 MXN/kg canal',change:'Puebla · dato de prueba'},{label:'Pollo · referencia de simulación',value:'40 MXN/kg',change:'Jalisco · mayoreo de prueba'}],personalization:{audience:'purchasing',organization:'Empresa de simulación',confidentiality:'confidential',sections:{indicators:true,sources:true}}};
 report.metrics.push({label:'Ajuste confirmado de simulación',value:0,change:'Sin cambio en el dato de prueba'});
 report.watchlist=['Confirmar que la fecha y la presentación de cada precio sean comparables.','Validar disponibilidad y continuidad de entrega con el proveedor.','Revisar flete y condiciones de pago antes de cerrar el pedido.'];
 report.sourceLinks=[{label:'Fuente de precios de simulación',url:'https://example.invalid/precios?region=mx&producto=pollo'},{label:'Fuente de condiciones de simulación',url:'https://example.invalid/condiciones'}];
 report.sources=['Fuente de precios de simulación','Fuente de condiciones de simulación'];
 report.tables=[{title:'Referencias de prueba',columns:['Producto','Precio'],rows:[['Pollo','40 MXN/kg']]}];
 report.visuals=[{title:'Comparación de prueba',type:'bar',bars:[{label:'Pollo',value:40}],unit:'MXN/kg'}];
 const original=JSON.stringify(report),mail=buildReportEmail({title:report.title,executive:report,attachmentName:'informe-compras.pdf'});
 for(const phrase of ['PDF adjunto','Confidencial','Empresa de simulación','informe-compras.pdf','12 oct 2026','Inteligencia económica']) {assert(mail.html.includes(phrase),phrase);assert(mail.text.includes(phrase),phrase);}
 const injection=buildReportEmail({title:'Fallback',executive:{...report,title:'Prueba\r\nBcc: evil@example.invalid',summary:'<script>alert(1)</script>',personalization:{recipientName:'<img src=x onerror=alert(1)>'}},attachmentName:'<b>archivo</b>.pdf'});
 assert(!/[\r\n]/.test(injection.subject));assert(!injection.html.includes('<script>'));assert(injection.html.includes('&lt;script&gt;'));assert(!injection.html.includes('<img'));
 for(const phrase of ['Se adjunta el informe para su revisión.','Atentamente,']) {assert(mail.html.includes(phrase),phrase);assert(mail.text.includes(phrase),phrase);}
 for(const phrase of ['Lectura ejecutiva','Claves del informe','Indicadores del corte','Decisión y seguimiento','Riesgo a revisar:','Fuente de precios de simulación',...report.takeaways,...report.watchlist,...report.metrics.map(item=>item.label),report.closing]) {assert(!mail.html.includes(phrase),phrase);assert(!mail.text.includes(phrase),phrase);}
 assert(!mail.text.includes('Tu informe está listo'));assert(mail.text.split(/\s+/).length<=100,'La muestra es una nota de remisión de hasta 100 palabras');assert.equal(JSON.stringify(report),original,'La plantilla no modifica el informe ni su evidencia, incluidos cifras y ceros');
 assert(mail.text.endsWith('Atentamente,\nVALLNews\nInteligencia económica'),'La firma institucional cierra el texto alternativo');
 assert.equal((mail.html.match(/class="email-signature"/g)||[]).length,1,'Una sola firma institucional');
 const hidden=buildReportEmail({executive:{...report,personalization:{...report.personalization,sections:{indicators:false,charts:false,tables:false,risks:false,sources:false}}},attachmentName:'informe-compras.pdf'});
 assert.equal(hidden.html,mail.html,'Los bloques del PDF no recargan la nota de entrega');assert(!hidden.text.includes('las fuentes'));
 const fallback=buildReportEmail({executive:{title:'Sin bloques adicionales',summary:'La evidencia debe completarse.',generatedAt:'fecha inválida',metrics:[],takeaways:[],watchlist:[],sourceLinks:[]},attachmentName:'informe.pdf'});assert(fallback.html.includes('Fecha de corte no disponible'));assert(!fallback.html.includes('Indicadores del corte'));assert(!fallback.html.includes('En el PDF:'));
 const unsafe=buildReportEmail({executive:{...report,sourceLinks:[{label:'JS',url:'javascript:alert(1)'},{label:'Credenciales',url:'https://usuario:clave@example.invalid'},{label:'Data',url:'data:text/html,ejemplo'}],sources:[]},attachmentName:'archivo.pdf'});assert(!unsafe.html.includes('href='));assert(!unsafe.text.includes('usuario:clave'));assert(!unsafe.text.includes('las fuentes'));
 const bounded=buildReportEmail({executive:{...report,takeaways:Array.from({length:50},(_,i)=>'Clave '+i),watchlist:Array.from({length:50},(_,i)=>'Riesgo '+i),metrics:Array.from({length:80},(_,i)=>({label:'Indicador '+i,value:i}))},attachmentName:'informe-compras.pdf'});assert.equal(bounded.html,mail.html,'Un informe con muchos bloques no alarga el cuerpo del correo');
 const decimal='El cerdo registra 38.50 MXN/kg vivo. La cifra es una referencia, no una oferta.';
 const extract=buildReportEmail({executive:{...report,summary:decimal+' '+('Contexto extenso '.repeat(80))+'.'},attachmentName:'informe.pdf'});assert(extract.text.includes(decimal),'Conserva frases completas, decimales, unidad y condición');assert(!extract.text.includes('Contexto extenso'));assert(extract.text.includes('PDF'));
 const oversized=buildReportEmail({executive:{title:'Lectura extensa',summary:'Una frase '+('muy extensa '.repeat(50))+'.'},attachmentName:'informe.pdf'});assert(oversized.text.includes('El contenido completo se presenta en el PDF adjunto.'));assert(!oversized.text.includes('muy extensa'));
 const empty=buildReportEmail({});assert.match(empty.text,/Informe ejecutivo/);assert.match(empty.text,/PDF adjunto: informe.pdf/);assert.match(empty.text,/El contenido completo se presenta en el PDF adjunto/);
 const repeated=buildReportEmail({executive:{title:'Lectura',summary:'Confirmar condiciones.',closing:'Confirmar condiciones.'},attachmentName:'informe.pdf'});assert(!repeated.text.includes('Decisión y seguimiento'),'Evita repetir la misma conclusión');
 await fs.writeFile(path.join(directory,'correo-ejecutivo-muestra.html'),mail.html);await fs.writeFile(path.join(directory,'correo-ejecutivo-muestra.txt'),mail.text);

 // Todo SMTP se sustituye antes de cargar la ruta. No se envían correos reales.
 process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-report-email-secret';delete process.env.USER_PASSWORD;process.env.GMAIL_USER='sender@example.invalid';process.env.GMAIL_PASS='fixture-only';
 process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
 require('../backend/services/user-profile-store').findById=async id=>({id,email:'owner@example.invalid',active:true,credentialVersion:0});
 const sent=[],scheduled=[];const nodemailer=require('nodemailer');nodemailer.createTransport=()=>({sendMail:async message=>{sent.push(message);return {accepted:[message.to]};}});
 require('../backend/services/report-mailer').mailAutomationEnabled=()=>true; // Sólo el programador simulado; SMTP no sale de memoria.
 const persisted=[];process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-only';
 require('@supabase/supabase-js').createClient=()=>({from:()=>({upsert:row=>{persisted.push(structuredClone(row));return {select:()=>({single:async()=>({data:structuredClone(row)})})};}})});
 const store=require('../backend/services/report-email-schedule-store');
 Object.assign(store,store.createScheduleStore({serverless:true}));
 const saved=await store.upsert({ownerEmail:'owner@example.invalid',area:'mexico',reportKey:'mx_proteins',recipientEmail:'Jefe@Example.invalid',preferences:{customTitle:'Edición de prueba'}});
 assert.equal(saved.recipientEmail,'jefe@example.invalid');assert.equal(persisted[0].preferences.emailRecipient,'jefe@example.invalid');assert.equal(persisted[0].owner_email,'owner@example.invalid');
 const legacy=await store.upsert({ownerEmail:'owner@example.invalid',area:'finance',reportKey:'overview'});assert.equal(legacy.recipientEmail,'owner@example.invalid','Las entregas anteriores conservan el correo de la cuenta');
 await assert.rejects(store.upsert({ownerEmail:'owner@example.invalid',area:'finance',reportKey:'overview',recipientEmail:'bad'}),error=>error.status===400);assert.equal(persisted.length,2);
 let due=[];const records=[];store.isCurrent=async()=>true;store.claim=async()=>true;store.due=async()=>due;store.record=async(id,value)=>records.push({id,...value});store.list=async()=>[];store.upsert=async options=>{scheduled.push(options);return {...options,id:'fixture',nextRunAt:'2026-10-13T14:00:00Z'};};store.remove=async()=>{};
 require('../backend/services/finance-report-store').load=async()=>({reports:[{...report,key:'overview',collection:'finance'}]});
 const router=require('../backend/routes/export');let server,browser;
 try {
  const app=express();app.use('/api',router);server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const origin=`http://127.0.0.1:${server.address().port}`,headers={'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({sub:'fixture',email:'owner@example.invalid'},process.env.JWT_SECRET)};
  const post=(endpoint,body,customHeaders=headers)=>fetch(origin+endpoint,{method:'POST',headers:customHeaders,body:JSON.stringify(body)});
  const payload={title:report.title,content:report.summary,executiveReport:report};
  assert.equal((await post('/api/report-email',payload,{'Content-Type':'application/json'})).status,401);assert.equal(sent.length,0);
  assert.equal((await post('/api/report-email',{...payload,recipientEmail:'a@example.invalid,b@example.invalid'})).status,400);assert.equal(sent.length,0);
  assert.equal((await post('/api/report-email',{...payload,recipientEmail:'jefe@example.invalid'})).status,200);assert.equal(sent[0].to,'jefe@example.invalid');
  assert(sent[0].attachments[0].content.subarray(0,5).toString()==='%PDF-');assert.match(sent[0].html,/class="email-signature"/);assert.match(sent[0].text,/Atentamente,\nVALLNews\nInteligencia económica/);assert(!sent[0].html.includes('Indicadores del corte'));
  assert.equal((await post('/api/report-email',payload)).status,200);assert.equal(sent[1].to,'owner@example.invalid');
  assert.equal((await post('/api/report-email-schedules',{area:'mexico',reportKey:'mx_proteins',recipientEmail:'jefe@example.invalid',ownerEmail:'other@example.invalid'})).status,200);assert.equal(scheduled[0].ownerEmail,'owner@example.invalid');assert.equal(scheduled[0].recipientEmail,'jefe@example.invalid');
  assert.equal((await post('/api/report-email-schedules',{area:'mexico',reportKey:'mx_proteins',recipientEmail:'malformed'})).status,400);assert.equal(scheduled.length,1);
  due=[{id:'scheduled-fixture',ownerEmail:'owner@example.invalid',area:'finance',reportKey:'overview',preferences:{audience:'purchasing',customTitle:'Edición programada de simulación',confidentiality:'confidential'},delivery:{frequency:'daily',time:'08:00'}}];
  const automatic=await router.runScheduledReportEmails();assert.equal(automatic.sent,1);assert.equal(sent.length,3);assert.match(sent[2].html,/class="email-signature"/);assert.match(sent[2].html,/Edición programada de simulación/);assert.match(sent[2].text,/Atentamente,\nVALLNews\nInteligencia económica/);assert(sent[2].attachments[0].content.subarray(0,5).toString()==='%PDF-');assert(records[0].sentAt);due=[];
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:760,height:1000}});await page.setContent(mail.html);
  assert.equal(await page.locator('h1').innerText(),report.title);assert.equal(await page.locator('script,img').count(),0);
  await page.setViewportSize({width:760,height:Math.ceil(await page.locator('.email-shell').evaluate(element=>element.getBoundingClientRect().bottom+20))});await page.screenshot({path:path.join(directory,'correo-ejecutivo-escritorio.png'),fullPage:true});
  assert.equal(await page.locator('a').count(),0,'El detalle de fuentes se concentra en el PDF');assert.equal(await page.locator('h2,.metric-row').count(),0,'El correo no reproduce los bloques del informe');assert.equal(await page.locator('.email-signature').innerText(),'VALLNews\n\nInteligencia económica');assert.equal(await page.locator('.email-summary').innerText(),report.summary.split('\n\n')[0]);assert(await page.locator('.email-shell').evaluate(element=>element.getBoundingClientRect().height<650),'La muestra de escritorio cabe en una tarjeta breve');
  for(const width of [320,390,600]) {await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Correo sin desbordamiento a '+width);}
  await page.setViewportSize({width:390,height:844});assert(await page.locator('.email-shell').evaluate(element=>element.getBoundingClientRect().height<750),'La muestra móvil cabe en una pantalla de 844 píxeles');await page.setViewportSize({width:390,height:Math.ceil(await page.locator('.email-shell').evaluate(element=>element.getBoundingClientRect().bottom+20))});await page.screenshot({path:path.join(directory,'correo-ejecutivo-movil.png'),fullPage:true});
  await page.locator('style').evaluateAll(elements=>elements.forEach(element=>element.remove()));await page.setViewportSize({width:320,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Sigue utilizable si el cliente elimina las reglas responsive');
  await page.setContent(buildReportEmail({executive:{...report,title:'Título'.repeat(22),personalization:{organization:'Empresa'.repeat(35),recipientName:'Nombre'.repeat(25),confidentialityLabel:'Etiqueta'.repeat(25)}},attachmentName:'archivo-muy-largo-'.repeat(10)+'.pdf'}).html);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Título, destinatario, empresa y adjunto extensos conservan el ancho');
  console.log('Report email: OK · remisión de hasta 100 palabras en la muestra, firma institucional en HTML y texto, frases completas, PDF intacto, móvil, sesión y entregas inmediata y programada; SMTP simulado');
 } finally {if(browser) await browser.close();if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
