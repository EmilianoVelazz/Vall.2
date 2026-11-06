'use strict';
/* global document, window */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),express=require('express');
const {chromium}=require('playwright');
const {createUserReportStore}=require('../backend/services/user-report-store');
const {createUserReportsRouter}=require('../backend/routes/user-reports');
const {UserReportAgent}=require('../backend/ai/user-report-agent');
const {reportOwnerBinding}=require('../backend/lib/report-session-owner');

async function main() {
 const root=path.resolve(__dirname,'..'),directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-report-journeys-')),output=path.join(root,'output/pruebas-usuario-informes');
 await fs.mkdir(output,{recursive:true});const store=createUserReportStore({directory}),writes=[],generations=[],exports=[],errors=[];let server,browser,page,saveMode='normal',aiMode='normal',cases=0,releaseAi,waitingAi;
 const owner='ana@example.invalid',other='luis@example.invalid';
 const base=(key,title)=>({key,title,generatedAt:'2026-10-13T14:00:00Z',summary:'Material de simulación: 40 MXN/kg.',sections:[{heading:'Datos del corte',text:'Referencia de prueba; confirmar condiciones antes de comprar.'}],metrics:[{label:'Referencia',value:'40 MXN/kg'}],visuals:[{type:'bar',title:'Comparación de prueba',unit:'MXN/kg',bars:[{label:'Referencia',value:40}]}],tables:[{title:'Detalle de prueba',columns:['Producto','Referencia'],rows:[['Pollo','40 MXN/kg']]}],sources:['Fuente de prueba'],sourceLinks:[{label:'Fuente de prueba',url:'https://example.invalid/datos'}],watchlist:['Validar vigencia y disponibilidad.'],takeaways:[]});
 const catalog={finance:base('overview','Finanzas de prueba'),markets:base('proteins','Mercados de prueba'),mexico:base('mx_proteins','México de prueba')};
 catalog.markets.sourceSnapshot={proteins:[{label:'Cerdo de prueba · Estados Unidos',market:'Estados Unidos',unit:'USD/100 lb',cadence:'daily',source:'USDA · SIMULACIÓN',url:'https://example.invalid/fixture',series:[{date:'2026-10-12',value:39},{date:'2026-10-13',value:40}]}]};
 const user=req=>req.headers.cookie?.includes('fixture_account=luis') ? other : owner;
 const check=async(name,operation)=>{await operation();cases++;console.log('OK · '+name);};
 try {
  const wrappedStore={...store,save:async(email,input)=>{
   writes.push({email,input});const mode=saveMode;saveMode='normal';
   if(mode==='session') throw Object.assign(Error('Sesión vencida de prueba'),{status:401});
   if(mode==='capacity') throw Object.assign(Error('Llegaste al límite de informes. Conserva el borrador y elimina un informe guardado antes de crear otro.'),{status:409});
   if(mode==='reject') throw Object.assign(Error('Guardado temporalmente no disponible'),{status:503});
   if(mode==='slow') await new Promise(resolve=>setTimeout(resolve,500));
   const saved=await store.save(email,input);
   if(mode==='lost') throw Object.assign(Error('Se perdió la confirmación del guardado'),{status:503});
   if(mode==='hang') return new Promise(()=>{});
   if(mode==='incomplete') return {...saved,editionVersion:undefined};
   if(mode==='empty') return {...saved,summary:'',sections:[],metrics:[],tables:[]};
   return saved;
  }};
  const agent={generate:async(input,context)=>{
   generations.push(input);const mode=aiMode;aiMode='normal';
   if(mode==='wait') await new Promise(resolve=>{releaseAi=resolve;waitingAi();});
   if(mode==='incomplete') return {title:'Respuesta cortada',sections:[]};
   if(mode==='fail') throw Object.assign(Error('IA temporalmente no disponible'),{status:503});
   return new UserReportAgent({provider:{isConfigured:()=>true,generate:async()=>{
    await new Promise(resolve=>setTimeout(resolve,80));
    return {model:'fixture',text:JSON.stringify({title:input.preferences.customTitle || 'Informe de usuario',summary:'Lectura de la referencia de prueba; contrastar unidad y fecha.',sections:[{heading:'Validación',text:'Contrastar la referencia de prueba con el proveedor.'}],closing:'Confirmar condiciones antes de decidir.',preferences:input.preferences,tone:'professional',dataSelection:Object.fromEntries(['metrics','tables','visuals'].map(key=>[key,input.report[key]?.length ? [0] : []])),watchlist:['Validar vigencia y disponibilidad.']})};
   }}}).generate(input,context);
  }};
  const app=express();app.use('/api',createUserReportsRouter({store:wrappedStore,agent,learning:{load:async()=>({status:'empty',historyEnabled:true,interests:[]})},authenticate:(req,res,next)=>{req.user={email:user(req)};next();}}));app.use(express.json({limit:'512kb'}));
  app.use('/api',(req,res,next)=>{req.user={email:user(req)};next();},reportOwnerBinding);
  app.use('/api',(req,res)=>{
   if(req.path==='/verify-token') return res.json({success:true,email:user(req)});
   if(req.path==='/profile') return res.json({success:true,profile:{email:user(req),preferences:{}}});
   for(const [area,endpoint] of [['finance','/finance-executive-reports'],['markets','/market-executive-reports'],['mexico','/mexico-executive-reports']]) if(req.path===endpoint) return res.json({success:true,data:[catalog[area]]});
   if(req.path==='/report-export') {exports.push(req.body);return res.type('application/pdf').send('%PDF-1.7\nFixture');}
   if(req.path==='/report-email') throw Error('No enviar correos durante estas pruebas');
   return res.json({success:true,data:[],articles:[]});
  });
  app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const url=`http://127.0.0.1:${server.address().port}/informes`,request=page.getByLabel('¿Cómo quieres este informe?',{exact:true}),generate=page.getByRole('button',{name:'Generar con IA',exact:true});
  const open=async(area='Mercados')=>{await page.getByRole('button',{name:'Nuevo informe',exact:true}).click();await page.getByRole('dialog',{name:'Elige tu reporte base'}).getByRole('button',{name:area,exact:true}).click();await page.getByRole('button',{name:'Crear con esta base',exact:true}).click();await request.waitFor();};
  const ready=async()=>{await page.waitForFunction(()=>{const button=document.querySelector('.erh-save-document');return button && !button.disabled;});};
  const resume=async()=>{await page.getByRole('region',{name:'Borrador pendiente',exact:true}).waitFor();await page.getByRole('button',{name:'Continuar borrador',exact:true}).click();await request.waitFor();};
  await page.goto(url);
  await check('cancelar sin guardar y regresar al reporte base',async()=>{
   const before=(await store.list(owner)).length,attempts=writes.length;
   await open('Finanzas');await request.fill('Un pedido que decidí no guardar.');
   const cancel=page.getByRole('button',{name:'Cancelar creación',exact:true});
   assert.equal((await cancel.innerText()).trim(),'Cancelar');assert(await cancel.isEnabled());
   await cancel.scrollIntoViewIfNeeded();const box=await cancel.boundingBox();assert(box.height>=40 && box.width>=90,'Cancelar tiene tamaño de botón principal');
   await page.locator('.erh-creation-composer').screenshot({path:path.join(output,'cancelar-informe-escritorio.png')});
   await page.setViewportSize({width:390,height:844});await cancel.scrollIntoViewIfNeeded();
   const mobile=await cancel.boundingBox();assert(mobile.y>=0 && mobile.y+mobile.height<=844,'Cancelar es alcanzable en móvil');
   await page.locator('.erh-creation-composer').screenshot({path:path.join(output,'cancelar-informe-movil.png')});
   await cancel.click();await page.locator('.erh-creation-composer').waitFor({state:'detached'});
   assert.equal(await page.getByRole('tab',{name:/Finanzas/}).getAttribute('aria-selected'),'true','Volver a la base elegida');
   assert.equal(writes.length,attempts);assert.equal((await store.list(owner)).length,before,'No crea informes al cancelar');
   await page.reload();assert.equal(await page.getByRole('region',{name:'Borrador pendiente',exact:true}).count(),0,'No reaparece el borrador descartado');
   await page.setViewportSize({width:1440,height:1000});
  });
  await check('cancelar durante la generación sin recuperar una respuesta tardía',async()=>{
   const before=writes.length,started=new Promise(resolve=>{waitingAi=resolve;});aiMode='wait';
   await open();await request.fill('Un informe que cancelo mientras ORION trabaja.');await generate.click();await started;
   const cancel=page.getByRole('button',{name:'Cancelar creación',exact:true});assert(await cancel.isEnabled());
   await cancel.click();await page.locator('.erh-creation-composer').waitFor({state:'detached'});releaseAi();
   await page.waitForTimeout(300);
   assert.equal(await page.locator('.erh-creation-composer').count(),0,'La respuesta tardía no reabre el borrador');
   assert.equal(writes.length,before);assert.equal(await page.getByRole('tab',{name:/Mercados/}).getAttribute('aria-selected'),'true');
  });
  await check('escribir palabra por palabra y borrar datos de identidad',async()=>{
   await open();await page.locator('.erh-creation-details summary').click();
   for(const label of ['Objetivo de mi informe','Preparado para','Empresa o área']) {const field=page.getByLabel(label,{exact:true});await field.fill('');await field.pressSequentially('Revisar compras con mi jefe',{delay:5});assert.equal(await field.inputValue(),'Revisar compras con mi jefe');await field.fill('');assert.equal(await field.inputValue(),'');}
   await page.getByLabel('Título de mi informe',{exact:true}).fill('Informe de pruebas de usuario');
   await request.fill('Conserva la evidencia y las gráficas.');await generate.click();await ready();
   assert.equal(generations.at(-1).preferences.recipientName,'');assert.equal(generations.at(-1).preferences.organization,'');assert.equal(generations.at(-1).preferences.objective,'');
  });
  await check('recargar y recuperar el informe completo sin guardarlo aún',async()=>{
   await page.reload();await resume();assert.equal(await request.inputValue(),'Conserva la evidencia y las gráficas.');assert.equal(await page.locator('.erh-document h2').innerText(),'Informe de pruebas de usuario');await ready();assert.equal((await store.list(owner)).length,0);
  });
  await check('respuesta perdida: reintentar y conservar un solo documento',async()=>{
   saveMode='lost';await page.getByRole('button',{name:'Guardar mi informe',exact:true}).click();await page.getByRole('button',{name:'Reintentar guardado',exact:true}).waitFor();assert.equal((await store.list(owner)).length,1);assert(await request.isDisabled());assert(await generate.isDisabled());assert(await page.getByRole('button',{name:'Volver a la versión anterior',exact:true}).isDisabled());
   await page.reload();await resume();await page.getByRole('button',{name:'Reintentar guardado',exact:true}).click();await page.locator('.erh-creation-composer').waitFor({state:'detached'});assert.equal((await store.list(owner)).length,1);assert.equal(writes.at(-1).input.creationId,writes.at(-2).input.creationId);
  });
  await check('doble clic y controles bloqueados durante un guardado lento',async()=>{
   await open('Finanzas');await request.fill('Prepara un resumen para dirección.');await generate.click();await ready();const before=writes.length;saveMode='slow';
   await page.getByRole('button',{name:'Guardar mi informe',exact:true}).evaluate(button=>{button.click();button.click();});await page.getByRole('button',{name:'Guardando…',exact:true}).waitFor();assert(await request.isDisabled());assert(await page.getByRole('button',{name:'Volver a la versión anterior',exact:true}).isDisabled());assert(await page.getByRole('button',{name:'Cancelar creación',exact:true}).isDisabled());
   await page.locator('.erh-creation-composer').waitFor({state:'detached'});assert.equal(writes.length,before+1);assert.equal((await store.list(owner)).length,2);
  });
  await check('sesión vencida conserva el borrador y ofrece iniciar sesión',async()=>{
   await open('México');await request.fill('Conserva las referencias estatales y sus fechas.');await generate.click();await ready();saveMode='session';await page.getByRole('button',{name:'Guardar mi informe',exact:true}).click();await page.getByRole('link',{name:'Inicia sesión para guardar',exact:true}).waitFor();assert.equal((await store.list(owner)).length,2);assert.equal(await request.inputValue(),'Conserva las referencias estatales y sus fechas.');
   await page.reload();await resume();await page.getByRole('button',{name:'Guardar mi informe',exact:true}).click();await page.locator('.erh-creation-composer').waitFor({state:'detached'});assert.equal((await store.list(owner)).length,3);
  });
  await check('respuesta de IA incompleta y fallo del proveedor preservan la versión',async()=>{
   await open();await request.fill('Prepara seguimiento de compras.');const title=await page.locator('.erh-document h2').innerText();aiMode='incomplete';await generate.click();await page.getByRole('alert').filter({hasText:'edición incompleta'}).waitFor();assert.equal(await page.locator('.erh-document h2').innerText(),title);assert.equal((await store.list(owner)).length,3);
   aiMode='fail';await generate.click();await page.getByRole('alert').filter({hasText:'IA temporalmente no disponible'}).waitFor();assert.equal(await request.inputValue(),'Prepara seguimiento de compras.');await generate.click();await ready();
  });
  await check('sin conexión: recuperar y reintentar el mismo guardado',async()=>{
   const before=(await store.list(owner)).length;await context.setOffline(true);await page.getByRole('button',{name:'Guardar mi informe',exact:true}).click();await page.getByRole('button',{name:'Reintentar guardado',exact:true}).waitFor();assert.equal((await store.list(owner)).length,before);await context.setOffline(false);
   await page.getByRole('button',{name:'Reintentar guardado',exact:true}).click();await page.locator('.erh-creation-composer').waitFor({state:'detached'});assert.equal((await store.list(owner)).length,before+1);
  });
  await check('confirmación incompleta no cierra ni duplica el borrador',async()=>{
   await open();const before=(await store.list(owner)).length;saveMode='incomplete';await page.getByRole('button',{name:'Guardar mi informe',exact:true}).click();await page.getByRole('button',{name:'Reintentar guardado',exact:true}).waitFor();assert.equal((await store.list(owner)).length,before+1);await page.getByRole('button',{name:'Reintentar guardado',exact:true}).click();await page.locator('.erh-creation-composer').waitFor({state:'detached'});assert.equal((await store.list(owner)).length,before+1);
  });
  await check('confirmación sin contenido conserva el resultado y permite reintentar',async()=>{
   await open();const before=(await store.list(owner)).length,document=await page.locator('.erh-document').innerText();saveMode='empty';await page.getByRole('button',{name:'Guardar mi informe',exact:true}).click();await page.getByRole('button',{name:'Reintentar guardado',exact:true}).waitFor();assert.equal((await store.list(owner)).length,before+1);assert.equal(await page.locator('.erh-document').innerText(),document,'An empty response cannot replace any part of the reviewed document');await page.getByRole('button',{name:'Reintentar guardado',exact:true}).click();await page.locator('.erh-creation-composer').waitFor({state:'detached'});assert.equal((await store.list(owner)).length,before+1);
  });
  await check('límite de informes: pausar, revisar la biblioteca y continuar',async()=>{
   await open();await request.fill('Un reporte pendiente para después.');await generate.click();await ready();saveMode='capacity';await page.getByRole('button',{name:'Guardar mi informe',exact:true}).click();await page.locator('.erh-creation-composer').getByText(/Llegaste al límite/).waitFor();await page.getByRole('button',{name:'Continuar más tarde',exact:true}).click();assert.equal(await page.locator('.erh-creation-composer').count(),0);assert(await page.getByRole('button',{name:'Nuevo informe',exact:true}).isDisabled());await page.getByRole('tab',{name:/Finanzas/}).click();await resume();assert.equal(await request.inputValue(),'Un reporte pendiente para después.');await page.getByRole('button',{name:'Cancelar creación',exact:true}).click();
  });
  await check('borrador corrupto y almacenamiento bloqueado no rompen la interfaz',async()=>{
   await open();await request.fill('Un pedido que conserve mi trabajo.');await page.evaluate(()=>{const key=Object.keys(sessionStorage).find(key=>key.startsWith('vall_report_creation_v1_'));sessionStorage.setItem(key,'{corrupto');});await page.reload();await page.getByRole('button',{name:'Nuevo informe',exact:true}).waitFor();assert.equal(await page.getByRole('region',{name:'Borrador pendiente'}).count(),0);assert(await page.getByRole('button',{name:'Nuevo informe',exact:true}).isEnabled());
   await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('vall_report_creation_v1_')) throw new DOMException('Quota de prueba','QuotaExceededError');return original.call(this,key,value);};});await open();await request.fill('Guardar pese a la cuota del navegador.');await generate.click();await ready();await page.locator('.erh-draft-storage').getByText(/no pudo conservar/).waitFor();await page.getByRole('button',{name:'Continuar más tarde',exact:true}).click();assert.equal(await page.locator('.erh-creation-composer').count(),1,'Pausar sin copia no pierde el borrador');await page.getByRole('button',{name:'Guardar mi informe',exact:true}).click();await page.locator('.erh-creation-composer').waitFor({state:'detached'});await page.reload();
  });
  await check('cambio de cuenta en otra pestaña no guarda datos bajo otro usuario',async()=>{
   await open();await request.fill('Borrador exclusivo de Ana.');await generate.click();await ready();const before=(await store.list(other)).length;await context.addCookies([{name:'fixture_account',value:'luis',url}]);await page.getByRole('button',{name:'Guardar mi informe',exact:true}).click();await page.getByRole('button',{name:'Recargar cuenta',exact:true}).waitFor();assert.equal((await store.list(other)).length,before);assert.equal(await request.count(),0);assert(!await page.getByText('Borrador exclusivo de Ana.',{exact:true}).count());await page.getByRole('button',{name:'Recargar cuenta',exact:true}).click();await page.getByRole('button',{name:'Nuevo informe',exact:true}).waitFor();assert.equal(await page.getByRole('region',{name:'Borrador pendiente'}).count(),0);assert(!await page.getByText('Borrador exclusivo de Ana.',{exact:true}).count());
   await context.addCookies([{name:'fixture_account',value:'ana',url}]);await page.reload();await resume();assert.equal(await request.inputValue(),'Borrador exclusivo de Ana.');await page.getByRole('button',{name:'Cancelar creación',exact:true}).click();
  });
  await check('dos pestañas con el mismo borrador conservan ambas decisiones',async()=>{
   await open();await request.fill('Mi propuesta original.');await generate.click();await ready();const draftKey=await page.evaluate(()=>Object.keys(sessionStorage).find(key=>key.startsWith('vall_report_creation_v1_'))),record=await page.evaluate(key=>sessionStorage.getItem(key),draftKey);
   const tab=await context.newPage();tab.on('pageerror',error=>errors.push(error.message));await tab.goto(url);await tab.evaluate(({key,value})=>sessionStorage.setItem(key,value),{key:draftKey,value:record});await tab.reload();await tab.getByRole('button',{name:'Continuar borrador',exact:true}).click();await tab.locator('.erh-creation-details summary').click();await tab.getByLabel('Título de mi informe',{exact:true}).fill('Decisión desde otra pestaña');await tab.getByRole('button',{name:'Generar con IA',exact:true}).click();await tab.waitForFunction(()=>!document.querySelector('.erh-save-document').disabled);
   const before=(await store.list(owner)).length;await page.getByRole('button',{name:'Guardar mi informe',exact:true}).click();await page.locator('.erh-creation-composer').waitFor({state:'detached'});await tab.getByRole('button',{name:'Guardar mi informe',exact:true}).click();await tab.getByRole('button',{name:'Guardar como informe nuevo',exact:true}).waitFor();assert.equal((await store.list(owner)).length,before+1);await tab.getByRole('button',{name:'Guardar como informe nuevo',exact:true}).click();await tab.locator('.erh-creation-composer').waitFor({state:'detached'});assert.equal((await store.list(owner)).length,before+2);assert((await store.list(owner)).some(report=>report.title==='Decisión desde otra pestaña'));await tab.close();
  });
  await check('guardado confirmado tras timeout y recarga conserva un solo informe',async()=>{
   await open();const before=(await store.list(owner)).length;await page.clock.install();saveMode='hang';await page.getByRole('button',{name:'Guardar mi informe',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.erh-save-document')?.textContent.includes('Guardando'));await page.clock.fastForward(31000);await page.getByRole('button',{name:'Reintentar guardado',exact:true}).waitFor();assert.equal((await store.list(owner)).length,before+1);await page.reload();await resume();await page.getByRole('button',{name:'Reintentar guardado',exact:true}).click();await page.locator('.erh-creation-composer').waitFor({state:'detached'});assert.equal((await store.list(owner)).length,before+1);
  });
  await check('leer, exportar y usar móvil después de los fallos',async()=>{
   await page.getByRole('button',{name:'Descargar PDF',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.erh-status')?.textContent.includes('PDF listo'));assert(exports.length>0);assert.equal(await page.getByRole('button',{name:/^Editar/}).count(),0);
   for(const width of [360,390,768,1024]) {await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));}
   await page.screenshot({path:path.join(output,'resultado-movil.png'),animations:'disabled'});
  });
  await check('cambiar de cuenta antes de exportar bloquea el PDF y oculta la edición',async()=>{
   const before=exports.length;await context.addCookies([{name:'fixture_account',value:'luis',url}]);await page.getByRole('button',{name:'Descargar PDF',exact:true}).click();await page.getByRole('button',{name:'Recargar cuenta',exact:true}).waitFor();assert.equal(exports.length,before);assert.equal(await page.locator('.erh-document').count(),0);assert(await page.getByRole('button',{name:'Nuevo informe',exact:true}).isDisabled());assert(await page.getByRole('button',{name:'Programar reportes',exact:true}).isDisabled());await context.addCookies([{name:'fixture_account',value:'ana',url}]);await page.reload();
  });
  await check('cambiar de cuenta antes de abrir Mis informes descarta la respuesta ajena',async()=>{
   await page.getByRole('tab',{name:/Finanzas/}).click();
   // Esperar a que termine la carga de la cuenta anterior antes de simular
   // el cambio: de otro modo el bloqueo ocurre durante esa carga, antes del clic.
   await page.locator('.erh-library-entry').filter({has:page.locator('strong',{hasText:catalog.finance.title})}).first().waitFor({state:'visible'});
   await context.addCookies([{name:'fixture_account',value:'luis',url}]);await page.getByRole('tab',{name:/Mis informes/}).click();await page.getByRole('button',{name:'Recargar cuenta',exact:true}).waitFor();assert.equal(await page.locator('.erh-library-entry').count(),0);assert.equal(await page.locator('.erh-document').count(),0);await context.addCookies([{name:'fixture_account',value:'ana',url}]);await page.reload();
  });
  assert.deepEqual(errors,[]);console.log(`Report user journeys: OK · ${cases} recorridos, navegador real, servidor real y cuentas de prueba; IA y exportaciones simuladas`);
 } catch(error) {if(page) {await fs.writeFile(path.join(output,'error.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(output,'error.png'),fullPage:true});}throw error;}
 finally {if(browser) await browser.close();if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
