'use strict';
/* global document, window */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),express=require('express');
const {chromium}=require('playwright');
process.env.JWT_SECRET='isolated-report-ai-ui-secret';delete process.env.USER_PASSWORD;
const {UserReportAgent}=require('../backend/ai/user-report-agent');
const {createUserReportStore}=require('../backend/services/user-report-store');
const {createUserReportsRouter}=require('../backend/routes/user-reports');
async function main() {
 const root=path.resolve(__dirname,'..'),directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-ai-text-ui-')),output=path.join(root,'output/informes-con-ia');
 const store=createUserReportStore({directory}),email='fixture@example.invalid',requests=[],exports=[];let server,browser,page;
 await fs.mkdir(output,{recursive:true});
 try {
  const report={key:'proteins',title:'Informe base',summary:'Referencia de prueba: pollo a 40 MXN/kg.',sections:[{heading:'Abasto',text:'Datos de prueba del informe base'}],metrics:[{label:'Pollo',value:'40 MXN/kg'}],tables:[{title:'Tabla base',columns:['Producto','Precio'],rows:[['Pollo','40 MXN/kg']]}],visuals:[{type:'bar',title:'Precio de prueba',unit:'MXN/kg',bars:[{label:'Pollo',value:40}]}],sourceLinks:[{label:'Fuente de prueba',url:'https://example.org/prueba'}]};
  const provider={isConfigured:()=>true,generate:async options=>{
   requests.push(options);await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,500);options.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('Abort'));},{once:true});});
   const restore=options.prompt.includes('Vuelve a incluir tablas'),simple=options.prompt.includes('más sencillo');
   return {model:'fixture',text:JSON.stringify({title:'Plan de compras',summary:'Referencia disponible de 40 MXN/kg, pendiente de confirmar.',sections:[{heading:'Compras',text:simple ? 'Explicación sencilla para mi jefe.' : 'Comparar disponibilidad antes de comprar.'}],watchlist:['Confirmar disponibilidad'],dataSelection:{metrics:[0],tables:restore ? [0] : [],visuals:[0]},preferences:{audience:'purchasing',depth:'brief',decisionHorizon:'month',customTitle:'Plan de compras',recipientName:'Jefatura',organization:'',objective:'Revisar abastecimiento',confidentiality:'internal',sections:{indicators:true,charts:true,tables:restore,risks:true,sources:true}},tone:'simple'})};
  }};
  const app=express();app.use('/api',createUserReportsRouter({store,learning:{load:async()=>({status:'empty',historyEnabled:true,interests:[]})},agent:new UserReportAgent({provider}),authenticate:(req,res,next)=>{req.user={email,sub:'fixture'};next();}}));app.use(express.json());
  app.use('/api',(req,res)=>{
   if(req.path==='/verify-token') return res.json({success:true,email});
   if(req.path==='/profile') return res.json({success:true,profile:{email,preferences:{}}});
   if(req.path==='/report-export') {exports.push(req.body);return res.type('application/pdf').send('%PDF-1.7\nFixture');}
   if(req.path==='/report-email') throw Error('No enviar correos en pruebas');
   if(req.path.includes('executive-reports')) return res.json({success:true,data:[report]});
   return res.json({success:true,data:[],articles:[]});
  });
  app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port+'/informes');
  await page.getByRole('button',{name:'Nuevo informe',exact:true}).waitFor();assert.equal(await page.locator('.erh-edition').count(),0);assert.equal(await page.getByRole('button',{name:/^Editar/}).count(),0);
  await page.getByRole('button',{name:'Nuevo informe',exact:true}).click();await page.getByRole('dialog',{name:'Elige tu reporte base'}).getByRole('button',{name:'Mercados',exact:true}).click();await page.getByRole('button',{name:'Crear con esta base',exact:true}).click();
  const request=page.getByLabel('¿Cómo quieres este informe?',{exact:true}),generate=page.getByRole('button',{name:'Generar con IA',exact:true});
  await request.waitFor();await page.getByRole('heading',{name:'Crear informe',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Editar informe',exact:true}).count(),0);assert.equal(await page.getByRole('navigation',{name:'Secciones del editor'}).count(),0);
  assert.equal(await page.getByRole('group',{name:'Contenido de mi informe',exact:true}).getByRole('checkbox').count(),5);assert.equal(await page.locator('#erh-setting-ai>fieldset textarea').count(),1);
  assert.equal(await generate.isEnabled(),false,'Escribir el pedido antes de generar');
  const first='Titúlalo Plan de compras. Hazlo breve y sencillo para compras y Jefatura, a 30 días. No incluyas tablas, conserva gráficas y fuentes.';
  await request.fill(first);await generate.click();await page.locator('.erh-document').getByText('Comparar disponibilidad antes de comprar.',{exact:true}).waitFor();
  assert.equal(await page.locator('.erh-document h2').innerText(),'Plan de compras');assert.equal(await page.locator('#erh-document-tables').count(),0);assert.equal(await page.locator('#erh-document-charts').count(),1);
  assert.equal(await page.getByRole('button',{name:'Guardar mi informe',exact:true}).isEnabled(),true);assert.equal((await store.list(email)).length,0);
  await page.locator('#erh-creation-panel').evaluate(element=>window.scrollTo({top:window.scrollY+element.getBoundingClientRect().top-80,behavior:'instant'}));await page.screenshot({path:path.join(output,'editor-listo-escritorio.png'),animations:'disabled'});
  await page.setViewportSize({width:390,height:844});await page.locator('#erh-creation-panel').evaluate(element=>window.scrollTo({top:window.scrollY+element.getBoundingClientRect().top-80,behavior:'instant'}));await page.screenshot({path:path.join(output,'editor-listo-movil.png'),animations:'disabled'});await page.setViewportSize({width:1440,height:1000});
  await request.fill(first+' Agrega más detalle.');assert.equal(await page.getByRole('button',{name:'Guardar mi informe',exact:true}).isEnabled(),false,'Un pedido pendiente no se guarda como aplicado');
  await request.fill(first);assert.equal(await page.locator('.erh-ai-pending').count(),0);
  await page.getByRole('button',{name:'Descargar PDF',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.erh-status')?.textContent.includes('PDF listo para descargar'));
  assert.equal(exports.at(-1).executiveReport.title,'Plan de compras');assert.deepEqual(exports.at(-1).executiveReport.tables,[]);assert.equal(exports.at(-1).executiveReport.visuals.length,1);assert.equal(exports.at(-1).executiveReport.personalization.audience,'purchasing');
  await request.fill('Vuelve a incluir tablas y conserva gráficas y fuentes.');await generate.click();await page.locator('#erh-document-tables').waitFor();
  assert.match(requests.at(-1).prompt,/40 MXN\/kg/,'Reutilizar el material original');await page.getByRole('button',{name:'Volver a la versión anterior',exact:true}).click();
  await page.locator('#erh-document-tables').waitFor({state:'detached'});assert.equal(await request.inputValue(),first,'Deshacer también restaura el pedido aplicado');
  await request.fill('Hazlo más sencillo para mi jefe, conservando gráficas y fuentes.');await generate.click();
  await page.locator('.erh-document').getByText('Explicación sencilla para mi jefe.',{exact:true}).waitFor();
  await page.locator('.erh-creation-details summary').click();
  await page.getByLabel('Para quién es',{exact:true}).selectOption('commercial');await page.getByLabel('Extensión del informe',{exact:true}).selectOption('brief');await page.getByLabel('Horizonte de decisión',{exact:true}).selectOption('quarter');
  await page.getByLabel('Objetivo de mi informe',{exact:true}).fill('Revisar abastecimiento');await page.getByLabel('Título de mi informe',{exact:true}).fill('Informe de abastecimiento');
  await page.getByLabel('Preparado para',{exact:true}).fill('Jefatura');await page.getByLabel('Empresa o área',{exact:true}).fill('Empresa de simulación');await page.getByLabel('Clasificación del documento',{exact:true}).selectOption('confidential');
  await page.getByLabel('Incluir gráficas',{exact:true}).uncheck();await page.getByLabel('Incluir tablas',{exact:true}).check();await page.getByLabel('Incluir fuentes',{exact:true}).uncheck();
  for(const label of ['Guardar mi informe','Descargar PDF','Programar reportes','Exportar datos CSV']) assert(await page.getByRole('button',{name:label,exact:true}).isDisabled(),'No exportar un pedido pendiente: '+label);
  await generate.click();await page.waitForFunction(()=>!document.querySelector('.erh-save-document').disabled);await page.locator('.erh-document h2').getByText('Informe de abastecimiento',{exact:true}).waitFor();assert.equal(await page.locator('#erh-document-charts').count(),0);assert.equal(await page.locator('#erh-document-tables').count(),1,'Una inclusión explícita recupera la tabla original aunque la IA no la seleccione');assert.equal(await page.locator('#erh-document-sources').count(),0);
  assert.match(requests.at(-1).prompt,/ELECCIONES EXPLÍCITAS DEL USUARIO/);assert.match(requests.at(-1).prompt,/Empresa de simulación/);
  await page.getByLabel('Incluir gráficas',{exact:true}).check();await page.getByLabel('Incluir tablas',{exact:true}).uncheck();await generate.click();await page.getByRole('button',{name:'Guardar mi informe',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.erh-save-document').disabled);
  assert.equal(await page.locator('#erh-document-charts').count(),1,'La regeneración conserva el material original');assert.equal(await page.locator('#erh-document-tables').count(),0);
  await page.getByRole('button',{name:'Descargar PDF',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.erh-status')?.textContent.includes('PDF listo para descargar'));
  assert.equal(exports.at(-1).executiveReport.personalization.audience,'commercial');assert.equal(exports.at(-1).executiveReport.personalization.decisionHorizon,'quarter');assert.equal(exports.at(-1).executiveReport.personalization.confidentiality,'confidential');assert.deepEqual(exports.at(-1).executiveReport.sourceLinks,[]);
  await page.locator('.erh-creation-options').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'preferencias-creacion-escritorio.png'),animations:'disabled'});
  await page.setViewportSize({width:390,height:844});await page.getByLabel('Para quién es',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'preferencias-creacion-movil.png'),animations:'disabled'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Guardar mi informe',exact:true}).click();await page.locator('.erh-creation-composer').waitFor({state:'detached'});
  const saved=(await store.list(email))[0],edition=await store.get(email,saved.editionId);assert.equal(edition.aiEdition.mode,'instructions');assert.equal(edition.aiEdition.tone,'simple');assert.equal(edition.personalization.audience,'commercial');assert.equal(edition.visuals.length,1);assert(edition.aiEdition.preferenceOverrides.includes('sections.charts'));assert.equal(edition.personalization.customTitle,'Informe de abastecimiento');
  await page.reload();await page.getByRole('tab',{name:/Mis informes/}).click();await page.locator('.erh-document').getByText('Explicación sencilla para mi jefe.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:/^Editar/}).count(),0);assert.equal(await page.locator('.erh-edition').count(),0);
  await page.getByRole('button',{name:'Nuevo informe',exact:true}).click();await page.getByRole('dialog',{name:'Elige tu reporte base'}).getByRole('button',{name:'Mercados',exact:true}).click();await page.getByRole('button',{name:'Crear con esta base',exact:true}).click();
  await page.locator('.erh-creation-details summary').click();await page.getByLabel('Para quién es',{exact:true}).selectOption('finance');assert.equal(await request.inputValue(),'');assert(await generate.isEnabled(),'Las opciones también permiten generar sin escribir un pedido');
  await generate.click();await page.waitForFunction(()=>!document.querySelector('.erh-save-document').disabled);assert.equal(await page.locator('.erh-ai-pending').count(),0,'La generación por opciones queda aplicada');
  await page.getByRole('button',{name:'Dejar que ORION decida',exact:true}).click();assert(await page.getByRole('button',{name:'Guardar mi informe',exact:true}).isDisabled());
  await request.fill('Agrega seguimiento sin cambiar las cifras.');const original=await page.locator('.erh-document').innerText();
  await page.route('**/api/user-reports/generate',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:'IA temporalmente no disponible'})}));
  await generate.click();await page.getByRole('alert').filter({hasText:'IA temporalmente no disponible'}).waitFor();
  assert.equal(await request.inputValue(),'Agrega seguimiento sin cambiar las cifras.');assert.equal(await page.locator('.erh-document').innerText(),original);await page.unroute('**/api/user-reports/generate');
  await generate.click();await page.getByRole('button',{name:'Cancelar generación',exact:true}).click();await generate.waitFor();assert.equal(await page.locator('.erh-document').innerText(),original);
  await page.locator('#erh-creation-panel').evaluate(element=>window.scrollTo({top:window.scrollY+element.getBoundingClientRect().top-80,behavior:'instant'}));await page.screenshot({path:path.join(output,'editor-texto-escritorio.png'),animations:'disabled'});
  for(const width of [360,390,768,1024]) {await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Sin desbordamiento a '+width);if(width===390) {await request.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'editor-texto-movil.png'),animations:'disabled'});}}
  await page.getByRole('button',{name:'Cancelar creación',exact:true}).click();assert.equal(await page.locator('.erh-edition').count(),0);assert.equal(await page.getByRole('button',{name:/^Editar/}).count(),0);assert.equal((await store.list(email)).length,1,'Cancelar un nuevo informe conserva el documento guardado');
  await page.locator('.erh-book').filter({hasText:saved.title}).click();await page.locator('.erh-document').getByText('Explicación sencilla para mi jefe.',{exact:true}).waitFor();assert.equal(await page.locator('.erh-edition').count(),0);
  assert.deepEqual(errors,[]);console.log('Report AI UI: OK · sin edición de reportes, creación con IA, PDF, gráficas, exclusiones, regeneración, deshacer, guardado, recarga, errores, cancelación y móvil');
 } catch(error) {if(page) {await fs.writeFile(path.join(output,'error-ui.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(output,'error-ui.png')});}throw error;}
 finally {if(browser) await browser.close();if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
