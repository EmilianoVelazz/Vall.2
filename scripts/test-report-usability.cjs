'use strict';
/* global document, window */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),express=require('express');
const {chromium}=require('playwright');
const {createUserReportStore}=require('../backend/services/user-report-store');
const {createUserReportsRouter}=require('../backend/routes/user-reports');
const {UserReportAgent}=require('../backend/ai/user-report-agent');

async function main() {
 const root=path.resolve(__dirname,'..'),directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-report-usability-')),output=path.join(root,'output/pruebas-usabilidad-informes');
 const owner='usability@example.invalid',store=createUserReportStore({directory}),results=[],errors=[],generations=[],deletions=[];
 let server,browser,page,aiMode='normal',deleteMode='normal',catalogMode='normal';
 const base={key:'overview',title:'Base de prueba',generatedAt:'2026-10-13T14:00:00Z',summary:'Referencia de simulación: 40 MXN/kg.',sections:[{heading:'Evidencia',text:'Confirmar condiciones antes de comprar.'}],metrics:[{label:'Referencia',value:'40 MXN/kg'}],tables:[{title:'Datos',columns:['Producto','Precio'],rows:[['Pollo','40 MXN/kg']]}]};
 const catalog={finance:base,markets:{...base,key:'proteins'},mexico:{...base,key:'mx_proteins'}};
 catalog.markets.sourceSnapshot={proteins:[{label:'Cerdo de prueba · Estados Unidos',market:'Estados Unidos',unit:'USD/100 lb',cadence:'daily',source:'USDA · SIMULACIÓN',url:'https://example.invalid/fixture',series:[{date:'2026-10-12',value:39},{date:'2026-10-13',value:40}]}]};
 const check=async(name,run)=>{const started=Date.now();await run();results.push({name,status:'passed',durationMs:Date.now()-started});console.log('OK · '+name);};
 await fs.mkdir(output,{recursive:true});
 try {
  const wrapped={...store,remove:async(email,input)=>{
   deletions.push(input);const mode=deleteMode;deleteMode='normal';
   if(mode==='slow') await new Promise(resolve=>setTimeout(resolve,600));
   const result=await store.remove(email,input);
   if(mode==='lost') throw Object.assign(Error('Se perdió la confirmación de eliminación.'),{status:503});
   return result;
  }};
  const agent={generate:async(input,context)=>{
   const mode=aiMode;aiMode='normal';generations.push(input);
   if(mode==='malformed') return {...input.report,summary:'Respuesta inválida',sections:[{heading:'Lectura',text:'Texto'}],metrics:[{label:'Referencia',value:{precio:40}}]};
   return new UserReportAgent({provider:{isConfigured:()=>true,generate:async()=>{
    await new Promise(resolve=>setTimeout(resolve,mode==='slow' ? 600 : 60));
    return {model:'fixture',text:JSON.stringify({title:input.preferences.customTitle || 'Informe de prueba',summary:input.report.metrics?.length ? 'Lectura de una referencia de 40 MXN/kg.' : 'Sin cotizaciones: hace falta evidencia antes de decidir.',sections:[{heading:'Pedido del usuario',text:input.instructions}],closing:'Validar condiciones antes de decidir.',preferences:input.preferences,tone:'professional',dataSelection:{metrics:input.report.metrics?.length ? [0] : [],tables:[],visuals:[]}})};
   }}}).generate(input,context);
  }};
  const app=express();app.use('/api',createUserReportsRouter({store:wrapped,agent,learning:{load:async()=>({status:'empty',historyEnabled:true,interests:[]})},authenticate:(req,res,next)=>{req.user={email:owner};next();}}));app.use(express.json());
  app.use('/api',(req,res)=>{
   if(req.path==='/verify-token') return res.json({success:true,email:owner});
   if(req.path==='/profile') return res.json({success:true,profile:{email:owner,preferences:{}}});
   for(const [area,endpoint] of [['finance','/finance-executive-reports'],['markets','/market-executive-reports'],['mexico','/mexico-executive-reports']]) if(req.path===endpoint) {
    if(area==='markets' && catalogMode==='malformed') {catalogMode='normal';return res.json({success:true,data:[null,catalog[area]]});}
    return res.json({success:true,data:[catalog[area]]});
   }
   if(req.path==='/report-email') throw Error('No enviar correos en estas pruebas');
   return res.json({success:true,data:[],articles:[]});
  });
  app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.on('pageerror',error=>errors.push(error.message));
  const url=`http://127.0.0.1:${server.address().port}/informes`,create=page.getByRole('button',{name:'Nuevo informe',exact:true}),request=page.getByLabel('¿Cómo quieres este informe?',{exact:true}),generate=page.getByRole('button',{name:'Generar con IA',exact:true});
  const open=async(fromZero=false)=>{await create.click();await page.getByRole('button',{name:fromZero ? 'Crear desde cero' : 'Crear con esta base',exact:true}).click();await request.waitFor();};
  const ready=async()=>page.waitForFunction(()=>document.querySelector('.erh-save-document') && !document.querySelector('.erh-save-document').disabled);
  const cancel=async()=>{await page.getByRole('button',{name:'Cancelar creación',exact:true}).click();await page.locator('.erh-creation-composer').waitFor({state:'detached'});};
  await page.goto(url);await create.waitFor();

  await check('teclado: foco dentro del selector y retorno al cerrar',async()=>{
   await create.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog',{name:'Elige tu reporte base',exact:true});await dialog.waitFor();
   for(let i=0;i<18;i++) {await page.keyboard.press('Tab');assert(await dialog.evaluate(element=>element.contains(document.activeElement)),'El foco permanece en la ventana');}
   await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert(await create.evaluate(element=>element===document.activeElement));
  });
  await check('hacer clic dentro del borde no descarta la selección',async()=>{
   await create.click();const dialog=page.getByRole('dialog',{name:'Elige tu reporte base',exact:true}),box=await dialog.boundingBox();await dialog.click({position:{x:1,y:Math.round(box.height/2)}});assert(await dialog.isVisible());await page.keyboard.press('Escape');
  });
  await check('crear desde cero bloquea pedidos vacíos y conserva la falta de datos',async()=>{
   await open(true);assert(await generate.isDisabled());assert(await page.getByRole('button',{name:'Guardar mi informe',exact:true}).isDisabled());await request.fill('   \n  ');assert(await generate.isDisabled());await request.fill('Prepara un plan de compras e indica qué datos faltan.');await generate.click();await ready();assert.equal((await store.list(owner)).length,0);assert.equal(await page.locator('.erh-document .erh-metric').count(),0);assert.match(await page.locator('.erh-document').innerText(),/No hay datos publicados para este informe/);await cancel();
  });
  await check('límite del pedido: las ideas no reemplazan ni cortan lo escrito',async()=>{
   await open();const text='Texto del usuario '.repeat(230).slice(0,3990);await request.fill(text);await page.getByRole('button',{name:'Para dirección',exact:true}).click();assert.equal(await request.inputValue(),text);await page.getByRole('status').filter({hasText:'Acórtalo'}).waitFor();await cancel();
  });
  await check('cancelar la IA no aplica una respuesta tardía ni pierde el pedido',async()=>{
   await open();await request.fill('Conserva los datos y presenta decisiones de compra.');const before=await page.locator('.erh-document').innerText();aiMode='slow';await generate.click();await page.getByRole('button',{name:'Cancelar generación',exact:true}).click();await generate.waitFor();assert.equal(await page.locator('.erh-document').innerText(),before);assert.equal(await request.inputValue(),'Conserva los datos y presenta decisiones de compra.');await generate.click();await ready();await cancel();
  });
  await check('respuesta con un objeto en lugar de un precio mantiene la versión anterior',async()=>{
   await open();const before=await page.locator('.erh-reader').innerText();await request.fill('Explica los datos de este corte.');aiMode='malformed';await generate.click();await page.getByRole('alert').filter({hasText:'edición incompleta'}).waitFor();assert.equal(await page.locator('.erh-reader').innerText(),before);await generate.click();await ready();await cancel();
  });
  await check('borrador con una tabla dañada se rechaza sin romper la biblioteca',async()=>{
   await open();await request.fill('Trabajo pendiente de compras.');await page.evaluate(()=>{const key=Object.keys(sessionStorage).find(value=>value.startsWith('vall_report_creation_v1_')),record=JSON.parse(sessionStorage.getItem(key));record.report.tables=[{title:'Daño de simulación',columns:['Dato'],rows:[[{precio:40}]]}];sessionStorage.setItem(key,JSON.stringify(record));});await page.reload();await create.waitFor();await page.getByRole('alert').filter({hasText:'No pudimos recuperar el borrador temporal'}).waitFor();assert.equal(await page.getByRole('region',{name:'Borrador pendiente'}).count(),0);assert(await create.isEnabled());
  });
  await check('colección con una ficha nula ofrece reintento y mantiene las otras bases',async()=>{
   catalogMode='malformed';await create.click();const dialog=page.getByRole('dialog',{name:'Elige tu reporte base',exact:true});await dialog.getByRole('button',{name:'Mercados',exact:true}).click();await dialog.getByRole('alert').waitFor();assert(await dialog.getByRole('button',{name:'Crear con esta base',exact:true}).isDisabled());await dialog.getByRole('button',{name:'Reintentar colección',exact:true}).click();await dialog.getByRole('group',{name:'Reportes base disponibles',exact:true}).waitFor();assert(await dialog.getByRole('button',{name:'Crear con esta base',exact:true}).isEnabled());await page.keyboard.press('Escape');
  });
  await check('texto HTML permanece como texto y el CSV protege fórmulas',async()=>{
   await open();await page.locator('.erh-creation-details summary').click();await page.getByLabel('Título de mi informe',{exact:true}).fill('=HYPERLINK("https://example.invalid","abrir")');await request.fill('Explica este texto literalmente: <img src=x onerror="window.__reportPwned=true">');await generate.click();await ready();assert.equal(await page.locator('.erh-document img[src="x"]').count(),0);assert.equal(await page.evaluate(()=>window.__reportPwned),undefined);await page.getByRole('button',{name:'Ver anexos',exact:true}).click();const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Descargar tablas CSV',exact:true}).click()]);const csv=await fs.readFile(await download.path(),'utf8');assert.match(csv,/'=HYPERLINK/);await page.getByRole('button',{name:/^Informes diarios/}).click();await cancel();
  });
  await check('eliminación lenta bloquea doble clic y Escape y recupera el foco',async()=>{
   const saved=await store.save(owner,{report:{...base,title:'Eliminar sólo este informe'}});await page.goto(url+'?informe='+saved.editionId);await page.locator('.erh-document h2').getByText(saved.title,{exact:true}).waitFor();await page.getByRole('button',{name:'Eliminar informe',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Eliminar informe',exact:true});deleteMode='slow';const before=deletions.length;await dialog.getByRole('button',{name:'Eliminar definitivamente',exact:true}).evaluate(button=>{button.click();button.click();});await dialog.getByRole('button',{name:'Eliminando…',exact:true}).waitFor();await page.keyboard.press('Escape');assert(await dialog.isVisible());await dialog.waitFor({state:'detached'});assert.equal(deletions.length,before+1);assert.equal(await store.get(owner,saved.editionId),null);assert(await page.evaluate(()=>Boolean(document.activeElement.closest('.erh-studio'))),'El foco vuelve a un control del espacio de informes');
  });
  await check('confirmación de eliminación perdida se resuelve actualizando la biblioteca',async()=>{
   const saved=await store.save(owner,{report:{...base,title:'Borrado con respuesta perdida'}});await page.goto(url+'?informe='+saved.editionId);await page.locator('.erh-document h2').getByText(saved.title,{exact:true}).waitFor();await page.getByRole('button',{name:'Eliminar informe',exact:true}).click();deleteMode='lost';const dialog=page.getByRole('dialog',{name:'Eliminar informe',exact:true});await dialog.getByRole('button',{name:'Eliminar definitivamente',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await store.get(owner,saved.editionId),null);await dialog.getByRole('button',{name:'Actualizar Mis informes',exact:true}).click();await dialog.waitFor({state:'detached'});assert.equal(await page.getByRole('button',{name:'Eliminar informe '+saved.title,exact:true}).count(),0);
  });
  await check('móvil y texto ampliado mantienen controles utilizables sin desbordamiento',async()=>{
   await page.goto(url);await create.waitFor();for(const width of [320,360,390,768]) {await page.setViewportSize({width,height:844});await open();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Sin desbordamiento a '+width);await request.fill('Un informe claro para compras.');await generate.click();await ready();assert(await page.getByRole('button',{name:'Guardar mi informe',exact:true}).isVisible());if(width===390) await page.screenshot({path:path.join(output,'creacion-movil.png'),fullPage:true,animations:'disabled'});await cancel();}
   await page.setViewportSize({width:1280,height:960});await page.evaluate(()=>document.documentElement.style.zoom='2');await create.click();const dialog=page.getByRole('dialog',{name:'Elige tu reporte base',exact:true});assert(await dialog.isVisible());assert(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1));await page.keyboard.press('Escape');await page.evaluate(()=>document.documentElement.style.zoom='');
  });

  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,'resultados.json'),JSON.stringify({generatedAt:new Date().toISOString(),simulation:true,results},null,2));
  console.log(`Report usability: OK · ${results.length} recorridos adicionales, navegador y HTTP reales, datos e IA simulados`);
 } catch(error) {if(page) {await fs.writeFile(path.join(output,'error.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(output,'error.png'),fullPage:true});}throw error;}
 finally {if(browser) await browser.close();if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
