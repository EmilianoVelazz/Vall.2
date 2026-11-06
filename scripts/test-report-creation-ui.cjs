'use strict';
/* global document */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const express=require('express');
const {chromium}=require('playwright');
process.env.JWT_SECRET='isolated-report-creation-ui-secret';delete process.env.USER_PASSWORD;
const {UserReportAgent}=require('../backend/ai/user-report-agent');
const {createUserReportStore}=require('../backend/services/user-report-store');
const {createUserReportsRouter}=require('../backend/routes/user-reports');
const collections=require('../shared/report-collections.json');

async function main() {
 const root=path.resolve(__dirname,'..'),directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-report-creation-')),output=path.join(root,'output/nuevo-informe');
 const store=createUserReportStore({directory}),email='fixture@example.invalid',requests=[],errors=[],catalog={};
 let server,browser,page,failMarkets=true;
 await fs.mkdir(output,{recursive:true});
 const configs=[['finance','overview','Panorama financiero base','Evidencia financiera exclusiva'],['markets','proteins','Proteínas del mercado base','Evidencia comercial exclusiva'],['mexico','mx_proteins','Proteínas México base','Evidencia mexicana exclusiva']];
 for(const [area,key,title,evidence] of configs) catalog[area]={key,title,summary:evidence,generatedAt:'2026-10-12T14:00:00Z',sections:[{heading:'Análisis base',text:evidence}],metrics:[{label:'Precio de prueba',value:'40 MXN/kg'}],tables:[{title:'Tabla base',columns:['Producto','Referencia'],rows:[['Pollo','40 MXN/kg']]}],sourceLinks:[{label:'Fuente de simulación',url:'https://example.org/datos'}]};
 const original=JSON.stringify(catalog);
 try {
  const provider={isConfigured:()=>true,generate:async options=>{
   requests.push(options);
   const area=configs.find(([, , , evidence])=>options.prompt.includes(evidence))?.[0];
   assert(area,'ORION recibe material de una colección elegida');
   for(const [other,,,evidence] of configs) if(other!==area) assert(!options.prompt.includes(evidence),'No mezcla material de otra colección');
   return {model:'fixture',text:JSON.stringify({title:`Plan propio ${area}`,summary:`Nueva lectura de ${area} con evidencia de 40 MXN/kg.`,sections:[{heading:'Decisión propia',text:`Acciones para ${area} a partir del reporte elegido.`}],closing:'Verificar condiciones con el proveedor.',takeaways:[],watchlist:[],dataSelection:{metrics:[0],tables:[],visuals:[]},preferences:{customTitle:`Plan propio ${area}`,audience:'purchasing',depth:'detailed',decisionHorizon:'month',recipientName:'',organization:'Empresa de simulación',objective:'Decidir abastecimiento',confidentiality:'internal',sections:{indicators:true,charts:true,tables:false,risks:true,sources:true}},tone:'professional'})};
  }};
  const app=express();app.use('/api',createUserReportsRouter({store,learning:{load:async()=>({status:'empty',historyEnabled:true,interests:[]})},agent:new UserReportAgent({provider}),authenticate:(req,res,next)=>{req.user={email};next();}}));app.use(express.json());
  app.use('/api',(req,res)=>{
   if(req.path==='/verify-token') return res.json({success:true,email,userId:'fixture'});
   if(req.path==='/profile') return res.json({success:true,profile:{email,preferences:{}}});
   const area=Object.keys(catalog).find(key=>collections[key].endpoint==='/api'+req.path);
   if(area) {
    if(area==='markets' && failMarkets) {failMarkets=false;return res.status(503).json({success:false,error:'Colección temporalmente no disponible'});}
    return res.json({success:true,data:[catalog[area]]});
   }
   if(req.path==='/report-email') throw Error('No enviar correos en la prueba');
   return res.json({success:true,data:[],articles:[]});
  });
  app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.on('pageerror',error=>errors.push(error.message));
  const url=`http://127.0.0.1:${server.address().port}/informes`;
  const openCreation=async()=>{await page.getByRole('button',{name:'Nuevo informe',exact:true}).click();return page.getByRole('dialog',{name:'Elige tu reporte base',exact:true});};
  await page.goto(url);await page.getByRole('button',{name:'Nuevo informe',exact:true}).waitFor();
  let dialog=await openCreation();await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  assert(await page.getByRole('button',{name:'Nuevo informe',exact:true}).evaluate(button=>button===document.activeElement),'Cerrar recupera el foco');
  for(const [area,,,evidence] of configs) {
   if(area!=='finance') await page.goto(url);
   await page.getByRole('button',{name:'Nuevo informe',exact:true}).waitFor();assert.equal(await page.locator('.erh-edition').count(),0);
   dialog=await openCreation();
   await dialog.getByRole('group',{name:'Colección del reporte base',exact:true}).getByRole('button',{name:collections[area].label,exact:true}).click();
   if(area==='markets') {
    await dialog.getByRole('alert').waitFor();assert(await dialog.getByRole('button',{name:'Crear con esta base',exact:true}).isDisabled());
    await dialog.getByRole('button',{name:'Reintentar colección',exact:true}).click();
   }
   await dialog.getByRole('group',{name:'Reportes base disponibles',exact:true}).waitFor();
   if(area==='finance') await page.screenshot({path:path.join(output,'selector-escritorio.png'),animations:'disabled'});
   assert.match(await dialog.getByRole('region',{name:'Base seleccionada',exact:true}).innerText(),new RegExp(evidence));
   await dialog.locator('.erh-sector-format summary').click();
   assert(await dialog.getByRole('list',{name:'Frentes del nuevo informe',exact:true}).locator('li').count()>=4,'La base describe la cobertura de su sector');
   if(area==='markets') await dialog.screenshot({path:path.join(output,'formato-sectorial-escritorio.png'),animations:'disabled'});
   assert.equal(requests.length,configs.findIndex(item=>item[0]===area),'Elegir no llama a IA ni guarda');
   await dialog.getByRole('button',{name:'Crear con esta base',exact:true}).click();
   await page.getByRole('heading',{name:'Crear informe',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:/^Editar/}).count(),0);
   if(area==='finance') {
    const request=page.getByLabel('¿Cómo quieres este informe?',{exact:true});await request.fill('Mi prioridad es decidir abastecimiento.');await page.getByRole('button',{name:'Para dirección',exact:true}).click();assert((await request.inputValue()).startsWith('Mi prioridad es decidir abastecimiento.'),'Las ideas no reemplazan el pedido del usuario');
    await page.locator('.erh-creation-topics summary').click();await page.locator('.erh-creation-topics button').first().click();assert.match(await request.inputValue(),/Mi prioridad es decidir abastecimiento/);
    await request.fill('x'.repeat(3999));await page.getByRole('button',{name:'Para dirección',exact:true}).click();assert.equal((await request.inputValue()).length,3999,'Un pedido largo no se trunca para insertar una sugerencia');assert.match(await page.locator('.erh-suggestion-notice').innerText(),/Acórtalo/);
   }
   await page.getByLabel('¿Cómo quieres este informe?',{exact:true}).fill(`Titúlalo Plan propio ${area}. Informe detallado para compras de Empresa de simulación a 30 días. Objetivo: Decidir abastecimiento. No incluyas tablas y termina con acciones para compras.`);
   assert.match(await page.locator('.erh-document').innerText(),new RegExp(evidence),'La copia muestra el material elegido');
   await page.getByRole('button',{name:'Generar con IA',exact:true}).click();
   await page.locator('.erh-document').getByText(`Acciones para ${area} a partir del reporte elegido.`,{exact:true}).waitFor();
   assert.match(requests.at(-1).prompt,/Decidir abastecimiento/);assert.match(requests.at(-1).prompt,/Empresa de simulación/);assert.match(requests.at(-1).prompt,/30 días/);
   assert.equal(await page.locator('#erh-document-tables').count(),0);
   await page.getByRole('button',{name:'Guardar mi informe',exact:true}).click();
   await page.locator('.erh-book').filter({hasText:`Plan propio ${area}`}).waitFor();
   const entry=(await store.list(email)).find(report=>report.title===`Plan propio ${area}`),saved=await store.get(email,entry.editionId);
   assert.equal(saved.baseReport.collection,area);assert.equal(saved.baseReport.key,catalog[area].key);assert.equal(saved.title,`Plan propio ${area}`);assert.equal(saved.tables.length,0);
   assert.equal(saved.aiEdition.preferences.audience,'purchasing');assert.equal(JSON.stringify(catalog),original,'El catálogo conserva sus reportes base');
   await page.goto(url+'?informe='+entry.editionId);await page.locator('.erh-document').getByText(`Acciones para ${area} a partir del reporte elegido.`,{exact:true}).waitFor();
   assert.match(await page.locator('.erh-report-origin').innerText(),new RegExp(catalog[area].title),'El informe guardado conserva su base');
   assert.equal(await page.locator('.erh-edition').count(),0);assert.equal(await page.getByRole('button',{name:/^Editar/}).count(),0);
  }
  dialog=await openCreation();await dialog.getByRole('button',{name:'México',exact:true}).click();await dialog.getByRole('group',{name:'Reportes base disponibles',exact:true}).waitFor();
  await dialog.locator('.erh-sector-format summary').click();
  await page.setViewportSize({width:390,height:844});assert(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1),'Selector móvil sin desbordamiento');
  await page.screenshot({path:path.join(output,'selector-movil.png'),animations:'disabled'});
  await dialog.getByRole('button',{name:'Crear desde cero',exact:true}).click();await page.getByRole('heading',{name:'Crear informe',exact:true}).waitFor();assert.equal(await page.getByLabel('¿Cómo quieres este informe?',{exact:true}).inputValue(),'');assert.equal(await page.locator('.erh-report-origin').count(),0);
  assert(await page.getByRole('button',{name:'Guardar mi informe',exact:true}).isDisabled(),'Un informe vacío no se puede guardar');
  await page.getByRole('button',{name:'Cancelar creación',exact:true}).click();assert.equal(await page.locator('.erh-edition').count(),0);assert.equal((await store.list(email)).length,3);
  assert.deepEqual(errors,[]);
  console.log('Report creation UI: OK · tres colecciones sin editor, base y corte correctos, generación explícita, guardado propio, catálogo intacto, recarga, error y reintento, cierre, móvil y creación desde cero');
 } catch(error) {if(page) {await fs.writeFile(path.join(output,'error-ui.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(output,'error-ui.png')});}throw error;} finally {if(browser) await browser.close();if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
