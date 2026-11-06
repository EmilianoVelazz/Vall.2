'use strict';
/* global document, window */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const express=require('express');
const {chromium}=require('playwright');
const {createUserReportsRouter}=require('../backend/routes/user-reports');
const {createReportLearning}=require('../backend/services/report-learning');
async function main() {
 const root=path.resolve(__dirname,'..'),output=path.join(root,'output/perfil-informes');await fs.mkdir(output,{recursive:true});
 const email='learning@example.invalid',now=Date.parse('2026-10-12T14:00:00Z');
 let profile={id:'fixture',email,active:true,preferences:{businessProfile:{products:['pork','beef','eggs','poultry'],markets:['México'],currency:'MXN'},other:{kept:true}}};
 const queries=['Quiero precios de cerdo en Puebla para comprar','Compara cotizaciones de pollo y huevo en Puebla'];
 const learning=createReportLearning({now:()=>now,profiles:{findById:async()=>profile,recentReportQueries:async()=>queries.map(query_text=>({query_text,created_at:new Date(now-86400000).toISOString()})),updateProfile:async(id,patch)=>{assert.equal(id,'fixture');profile={...profile,...patch};}}});
 const report={key:'overview',title:'Informe de prueba para compras',summary:'Material de simulación.',sections:[{heading:'Suministro',text:'Validar las referencias del corte.'}],metrics:[],tables:[],sources:[]};
 const app=express();app.use('/api',createUserReportsRouter({learning,authenticate:(req,res,next)=>{req.user={email,sub:'fixture'};next();},store:{list:async()=>[]}}));app.use(express.json());
 app.use('/api',(req,res)=>{
  if(req.path==='/verify-token') return res.json({success:true,email});
  if(req.path==='/profile') return res.json({success:true,profile});
  if(req.path.includes('executive-reports')) return res.json({success:true,data:[report]});
  if(req.path.includes('report-email')&&req.method==='POST') throw Error('Esta prueba no envía correos');
  return res.json({success:true,data:[],articles:[]});
 });app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});let browser,page;
 try {
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/informes`);
  const panel=page.getByRole('region',{name:'Intereses de ORION',exact:true}),toggle=panel.getByRole('checkbox',{name:'Detectar intereses de mis consultas',exact:true});
  const providerToggle=panel.getByRole('checkbox',{name:'Personalizar mis informes con este perfil',exact:true}),details=panel.locator('.erh-learning-details'),disclosure=details.locator('summary');
  await providerToggle.waitFor();assert.equal(await details.evaluate(element=>element.open),false,'Los ajustes avanzados comienzan cerrados');assert(await providerToggle.isVisible(),'La activación de IA permanece visible');
  assert((await panel.boundingBox()).height<420,'El perfil cabe en una tarjeta compacta');
  assert(await page.locator('.erh-ai-request').evaluate(element=>Boolean(element.compareDocumentPosition(document.querySelector('.erh-ai-intentions'))&4)),'El encargo se muestra antes de las ideas de enfoque');
  await page.locator('.erh-edition').evaluate(element=>window.scrollTo({top:window.scrollY+element.getBoundingClientRect().top-88,behavior:'instant'}));
  await page.screenshot({path:path.join(output,'editor-formato-escritorio.png')});
  await panel.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'perfil-compacto-escritorio.png')});await panel.screenshot({path:path.join(output,'intereses-compactos.png')});
  await disclosure.focus();await page.keyboard.press('Enter');assert.equal(await details.evaluate(element=>element.open),true,'Los ajustes se abren con teclado');
  await panel.getByText('Puebla',{exact:true}).waitFor();assert.equal(await toggle.isChecked(),true);assert(await panel.getByText('Cerdo',{exact:true}).isVisible());assert.match(await panel.innerText(),/Tu perfil/);
  assert(await panel.getByRole('region',{name:'Productos',exact:true}).isVisible());assert(await panel.getByRole('region',{name:'Mercados y plazas',exact:true}).isVisible());
  assert.equal(await providerToggle.isChecked(),false);await providerToggle.check();await panel.getByText(/Genera una nueva edición/).waitFor();assert.equal(profile.preferences.reportLearning.providerEnabled,true);assert.match(await panel.innerText(),/Google Gemini/);
  assert.equal(await panel.getByRole('link',{name:/Revisar mi perfil de negocio/}).getAttribute('href'),'/configuracion');
  await panel.getByText('Cerdo',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'perfil-escritorio.png')});
  await toggle.uncheck();await panel.getByText('Preferencia guardada.',{exact:true}).waitFor();assert.equal(profile.preferences.reportLearning.enabled,false);assert.equal(await panel.getByText('Puebla',{exact:true}).count(),0);assert(await panel.getByText('Cerdo',{exact:true}).isVisible());
  await page.reload();await providerToggle.waitFor();assert.equal(await details.evaluate(element=>element.open),false);await disclosure.click();await toggle.waitFor();assert.equal(await toggle.isChecked(),false,'La preferencia sobrevive a la recarga');
  assert.equal(await providerToggle.isChecked(),true,'La activación del perfil para IA también se conserva');
  await toggle.check();await panel.getByText('Puebla',{exact:true}).waitFor();await panel.getByRole('button',{name:'Reiniciar intereses',exact:true}).click();await panel.getByText(/Intereses reiniciados/).waitFor();assert.equal(await panel.getByText('Puebla',{exact:true}).count(),0);assert(profile.preferences.other.kept);assert.equal(profile.preferences.reportLearning.resetAt,new Date(now).toISOString());
  await page.route('**/api/user-reports/learning',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:'Intereses temporalmente no disponibles'})}));
  await toggle.uncheck();await panel.getByRole('alert').waitFor();assert.equal(await toggle.isChecked(),true,'Si falla el guardado se recupera la preferencia anterior');assert(await page.getByRole('button',{name:'Generar con IA',exact:true}).isEnabled(),'Un fallo del perfil no bloquea los informes');await page.unroute('**/api/user-reports/learning');await panel.getByRole('button',{name:'Reintentar',exact:true}).click();await panel.getByRole('alert').waitFor({state:'detached'});
  for(const width of [768,390,360]) {await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Sin desbordamiento en '+width+'px');}
  await panel.getByRole('button',{name:'Reiniciar intereses',exact:true}).scrollIntoViewIfNeeded();const action=await panel.getByRole('button',{name:'Reiniciar intereses',exact:true}).boundingBox(),footer=await page.locator('.erh-edition-footer').boundingBox();assert(action.y+action.height<=footer.y,'Los controles móviles se alcanzan dentro del editor');await panel.getByRole('link').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'intereses-movil.png')});
  await disclosure.click();await page.locator('.erh-edition').evaluate(element=>window.scrollTo({top:window.scrollY+element.getBoundingClientRect().top-88,behavior:'instant'}));
  await panel.evaluate(element=>{const scroller=element.closest('.erh-edition-scroll');scroller.scrollTop+=element.getBoundingClientRect().top-scroller.getBoundingClientRect().top-14;});
  await page.screenshot({path:path.join(output,'perfil-compacto-movil.png')});
  await page.locator('.erh-edition-scroll').evaluate(element=>{element.scrollTop=0;});await page.screenshot({path:path.join(output,'editor-formato-movil.png')});assert.deepEqual(errors,[]);
  console.log('Report learning UI: OK · formato compacto, teclado, grupos, detección, controles, reinicio, recarga, error recuperable y móvil');
 } catch(error) {if(page) await page.screenshot({path:path.join(output,'error.png'),fullPage:true});throw error;}
 finally {if(browser) await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
