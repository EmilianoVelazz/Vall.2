'use strict';
/* global document */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const express=require('express');
const {chromium}=require('playwright');
process.env.JWT_SECRET='isolated-report-delivery-ui';delete process.env.USER_PASSWORD;
const {createUserReportStore}=require('../backend/services/user-report-store');
const {createUserReportsRouter}=require('../backend/routes/user-reports');
async function main() {
 const root=path.resolve(__dirname,'..'),directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-delivery-ui-')),output=path.join(root,'output/programar-reportes'),email='fixture@example.invalid';
 const store=createUserReportStore({directory}),scheduled=[],canceled=[],sent=[],errors=[];
 let server,browser,page,failList=true,failSend=true,mailConfigured=true;
 const finance={key:'overview',title:'Panorama financiero de prueba',summary:'Referencia de simulación',generatedAt:'2026-10-12T14:00:00Z',sections:[{heading:'Lectura',text:'Material base de simulación'}],metrics:[{label:'Dato de prueba',value:'40 MXN/kg'}]};
 const own=await store.save(email,{report:{...finance,title:'Mi edición de México',baseReport:{collection:'mexico',key:'mx_proteins',title:'Proteínas México de prueba',generatedAt:finance.generatedAt},personalization:{customTitle:'Mi edición de México',audience:'purchasing'},aiEdition:{instructions:'Conserva el pedido guardado',tone:'technical',preferences:{audience:'purchasing'}}}});
 const manual=await store.save(email,{report:{...finance,title:'Informe manual sin base'}});
 let schedules=[{id:'mexico-seed',area:'mexico',reportKey:'mx_overview',preferences:{customTitle:'Otra programación de México'},delivery:{frequency:'daily',time:'08:00'},nextRunAt:'2026-10-13T14:00:00Z'}];
 await fs.mkdir(output,{recursive:true});
 try {
  const app=express();app.use('/api',createUserReportsRouter({store,learning:{load:async()=>({status:'empty',historyEnabled:true,interests:[]})},authenticate:(req,res,next)=>{req.user={email};next();}}));app.use(express.json());
  app.use('/api',(req,res)=>{
   if(req.path==='/verify-token') return res.json({success:true,email});
   if(req.path==='/profile') return res.json({success:true,profile:{email,preferences:{}}});
   if(req.path==='/report-email/status') return res.json({success:true,accountEmail:email,mail:{configured:mailConfigured,missing:mailConfigured ? [] : ['GMAIL_PASS'],automaticEnabled:true,environment:'local',version:2}});
   if(req.path.includes('executive-reports')) return res.json({success:true,data:[finance]});
   if(req.path==='/report-email-schedules' && req.method==='GET') {if(failList) {failList=false;return res.status(503).json({success:false,error:'Fallo de carga de prueba'});}return res.json({success:true,data:schedules});}
   if(req.path==='/report-email-schedules' && req.method==='POST') {
    scheduled.push(req.body);const schedule={id:req.body.area+':'+req.body.reportKey,...req.body,nextRunAt:'2026-10-14T15:00:00Z'};
    schedules=[...schedules.filter(item=>item.area!==schedule.area || item.reportKey!==schedule.reportKey),schedule];return res.json({success:true,schedule});
   }
   if(req.path==='/report-email-schedules/cancel') {canceled.push(req.body);schedules=schedules.filter(item=>item.area!==req.body.area || item.reportKey!==req.body.reportKey);return res.json({success:true});}
   // El envío es un registro de prueba: nunca invoca al transportador de correo.
   if(req.path==='/report-email') {sent.push(req.body);if(failSend) {failSend=false;return res.status(503).json({success:false,code:'REPORT_EMAIL_NOT_CONFIGURED',error:'El envío por correo aún no está configurado en el servidor.'});}return res.json({success:true,email:req.body.recipientEmail || email,language:req.body.language});}
   return res.json({success:true,data:[],articles:[]});
  });
  app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.on('pageerror',error=>errors.push(error.message));
  const url=`http://127.0.0.1:${server.address().port}/informes`;
  await page.goto(url);await page.getByRole('button',{name:'Lectura',exact:true}).click();await page.locator('.erh-document').waitFor();assert.equal(await page.locator('.erh-edition').count(),0);assert.equal(await page.getByRole('button',{name:/^Editar/}).count(),0);
  const program=page.getByRole('button',{name:'Programar reportes',exact:true}),create=page.getByRole('button',{name:'Nuevo informe',exact:true});
  assert((await program.boundingBox()).y < (await create.boundingBox()).y,'Programar aparece arriba de Nuevo informe');
  await program.click();const dialog=page.getByRole('dialog',{name:'Programar reportes',exact:true});
  await dialog.getByRole('alert').getByText('Fallo de carga de prueba',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Reintentar programaciones',exact:true}).click();
  await dialog.getByRole('button',{name:'Desactivar programación Otra programación de México',exact:true}).waitFor();
  await dialog.getByLabel('Otro correo', {exact:false}).check();
  assert(await dialog.getByRole('button',{name:'Enviar PDF por correo',exact:true}).isDisabled(),'No envía a un destino vacío');
  await dialog.getByLabel('Correo del destinatario',{exact:true}).fill('correo-invalido');
  assert(await dialog.getByRole('button',{name:'Enviar PDF por correo',exact:true}).isDisabled());
  await dialog.getByLabel('Correo del destinatario',{exact:true}).fill('jefe@example.invalid');
  await dialog.getByLabel('Envíos automáticos',{exact:true}).check();await dialog.getByLabel('Frecuencia',{exact:true}).selectOption('weekly');await dialog.getByLabel('Día de entrega',{exact:true}).selectOption('3');await dialog.getByLabel('Hora · Ciudad de México',{exact:true}).fill('09:00');
  const controlBoxes=await Promise.all(['Frecuencia','Hora · Ciudad de México','Día de entrega'].map(label=>dialog.getByLabel(label,{exact:true}).boundingBox()));
  assert(controlBoxes.every(box=>Math.abs(box.y-controlBoxes[0].y)<2),'Los controles semanales comparten fila en escritorio');
  await dialog.getByRole('button',{name:'Guardar entrega automática',exact:true}).click();await dialog.getByRole('status').getByText(/Entrega activada/).waitFor();
  assert.equal(scheduled[0].area,'finance');assert.equal(scheduled[0].reportKey,'overview');assert.equal(scheduled[0].delivery.weekday,3);assert.equal(scheduled[0].delivery.time,'09:00');assert.equal(scheduled[0].ai.enabled,false,'El corte base no activa otra generación de IA');
  assert.equal(scheduled[0].recipientEmail,'jefe@example.invalid','La programación conserva el destino seleccionado');
  assert.equal(await dialog.getByLabel('Correo del destinatario',{exact:true}).inputValue(),'jefe@example.invalid');
  await dialog.getByRole('button',{name:'Desactivar programación Otra programación de México',exact:true}).click();await dialog.getByRole('status').getByText(/Se canceló/).waitFor();assert.deepEqual(canceled[0],{expectedOwner:'fixture@example.invalid',area:'mexico',reportKey:'mx_overview'});assert(await dialog.getByLabel('Envíos automáticos',{exact:true}).isChecked(),'Cancelar otra programación conserva la seleccionada');
  await dialog.getByRole('button',{name:'Enviar PDF por correo',exact:true}).click();await dialog.getByRole('alert').getByText('El envío por correo aún no está configurado en el servidor.',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Comprobar correo',exact:true}).click();await dialog.getByRole('alert').waitFor({state:'detached'});await dialog.getByText('Correo configurado · Servidor local',{exact:true}).waitFor();assert.equal(sent.length,1,'Comprobar retira el error anterior sin volver a enviar el informe');assert(!(await page.locator('.erh-status').last().innerText()).includes('El envío por correo aún no está configurado'),'Tampoco queda el aviso antiguo detrás de la ventana');
  mailConfigured=false;await dialog.getByRole('button',{name:'Comprobar correo',exact:true}).click();await dialog.locator('.erh-mail-status strong').getByText('El servidor no tiene configurado el correo',{exact:true}).waitFor();assert(await dialog.getByRole('button',{name:'Enviar PDF por correo',exact:true}).isDisabled());assert.equal(sent.length,1);
  mailConfigured=true;await dialog.getByRole('button',{name:'Comprobar correo',exact:true}).click();await dialog.getByText('Correo configurado · Servidor local',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Enviar PDF por correo',exact:true}).click();await dialog.getByRole('status').getByText(/PDF enviado/).waitFor();assert.equal(sent.at(-1).executiveReport.title,finance.title);
  assert.equal(sent.at(-1).recipientEmail,'jefe@example.invalid','El envío inmediato usa otro correo');
  assert.equal(sent.at(-1).expectedOwner,'fixture@example.invalid','El envío queda vinculado a la cuenta que abrió la edición');assert.equal(scheduled[0].expectedOwner,'fixture@example.invalid');
  assert.match(await dialog.locator('.erh-send-feedback').innerText(),/jefe@example.invalid/);
  await dialog.locator('.erh-send-body').evaluate(element=>{element.scrollTop=element.scrollHeight;});
  const summaryBox=await dialog.getByRole('region',{name:'Informe para entregar',exact:true}).boundingBox(),bodyBox=await dialog.locator('.erh-send-body').boundingBox();
  assert(summaryBox.y+summaryBox.height<=bodyBox.y+1,'El resumen del informe está fuera del área que se desplaza');
  assert(await dialog.getByRole('region',{name:'Informe para entregar',exact:true}).getByText(finance.title,{exact:true}).isVisible());
  await dialog.locator('.erh-send-body').evaluate(element=>{element.scrollTop=0;});
  await page.screenshot({path:path.join(output,'programar-reportes-escritorio.png'),animations:'disabled'});
  for(const width of [768,390,360]) {
    await page.setViewportSize({width,height:844});
    assert(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1),'Distribución semanal sin desbordamiento a '+width+'px');
    const headerBox=await dialog.locator(':scope > header').boundingBox(),footerBox=await dialog.locator(':scope > footer').boundingBox();
    assert(headerBox.y>=0 && footerBox.y+footerBox.height<=845,'Cabecera y cierre visibles a '+width+'px');
  }
  await page.setViewportSize({width:390,height:844});await dialog.locator('.erh-send-body').evaluate(element=>{element.scrollTop=0;});await page.screenshot({path:path.join(output,'programar-reportes-semanal-movil.png'),animations:'disabled'});
  await page.setViewportSize({width:1440,height:1000});
  await dialog.getByRole('button',{name:'Volver a informes',exact:true}).click();assert.equal(await page.locator('.erh-edition').count(),0);
  await page.reload();await program.click();await dialog.getByLabel('Correo del destinatario',{exact:true}).waitFor();assert.equal(await dialog.getByLabel('Correo del destinatario',{exact:true}).inputValue(),'jefe@example.invalid','El destino programado se recupera al recargar');await dialog.getByRole('button',{name:'Volver a informes',exact:true}).click();
  await create.click();await page.getByRole('button',{name:'Crear con esta base',exact:true}).click();const request=page.getByLabel('¿Cómo quieres este informe?',{exact:true});
  await program.click();await dialog.getByLabel('Frecuencia',{exact:true}).selectOption('daily');await dialog.getByRole('button',{name:'Volver a informes',exact:true}).click();assert.equal(await request.inputValue(),'','La entrega no modifica el nuevo informe');await request.fill('Mantén mi encargo independiente de la entrega');assert(await program.isDisabled(),'Un pedido pendiente no puede enviarse ni programarse');await page.getByRole('button',{name:'Cancelar creación',exact:true}).click();
  await page.goto(url+'?informe='+own.editionId);await page.getByRole('button',{name:'Lectura',exact:true}).click();await page.locator('.erh-document').getByRole('heading',{name:own.title,exact:true}).waitFor();await program.click();await dialog.getByLabel('Envíos automáticos',{exact:true}).check();await dialog.getByRole('button',{name:'Guardar entrega automática',exact:true}).click();await dialog.getByRole('status').getByText(/Entrega activada/).waitFor();assert.equal(scheduled.at(-1).area,'mexico');assert.equal(scheduled.at(-1).reportKey,'mx_proteins');assert.equal(scheduled.at(-1).ai.instructions,'Conserva el pedido guardado');assert.equal(scheduled.at(-1).ai.tone,'technical');
  await dialog.getByLabel('Envíos automáticos',{exact:true}).uncheck();await dialog.getByRole('button',{name:'Desactivar entrega automática',exact:true}).click();await dialog.getByRole('status').getByText(/Se canceló/).waitFor();assert.equal(canceled.at(-1).reportKey,'mx_proteins');
  await dialog.getByRole('button',{name:'Volver a informes',exact:true}).click();await page.goto(url+'?informe='+manual.editionId);await page.getByRole('button',{name:'Lectura',exact:true}).click();await page.locator('.erh-document').getByRole('heading',{name:manual.title,exact:true}).waitFor();await program.click();assert.equal(await dialog.getByLabel('Envíos automáticos',{exact:true}).count(),1);await dialog.getByRole('button',{name:'Enviar PDF por correo',exact:true}).click();await dialog.getByRole('status').getByText(/PDF enviado/).waitFor();assert.equal(sent.at(-1).executiveReport.title,manual.title);
  assert.equal(sent.at(-1).recipientEmail,email,'Cambiar de informe sin programación vuelve al correo de la cuenta');
  await page.setViewportSize({width:390,height:844});assert(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1),'El panel no desborda en móvil');await page.screenshot({path:path.join(output,'programar-reportes-movil.png'),animations:'disabled'});await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert(await program.evaluate(element=>element===document.activeElement));assert.deepEqual(errors,[]);
  console.log('Report delivery UI: OK · entrada sobre Nuevo informe, editor separado, carga y reintento, envío simulado, programación semanal, cancelación independiente, borrador intacto, edición guardada, corte base, pedido y tono, móvil y cierre');
 } finally {if(browser) await browser.close();if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
