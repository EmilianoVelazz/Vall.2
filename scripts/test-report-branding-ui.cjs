'use strict';
/* global document, getComputedStyle, innerWidth */
process.env.NODE_ENV='test';process.env.JWT_SECRET='report-branding-ui-isolated-fixture-at-least-32-bytes';process.env.USER_PASSWORD='';process.env.VALL_AUTH_PASSWORD='';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),express=require('express'),{chromium}=require('playwright');
const auth=require.resolve('../backend/routes/auth'),owner='branding@example.invalid';require.cache[auth]={id:auth,filename:auth,loaded:true,exports:{verifyToken:(req,res,next)=>{req.user={email:owner};next();}}};
const router=require('../backend/routes/export');
async function main(){
 const root=path.resolve(__dirname,'..'),output=path.join(root,'tmp/pdfs/identidad-vallnews');await fs.mkdir(output,{recursive:true});
 const americas=process.argv.includes('--equity-americas'),simpleViewer=process.argv.includes('--simple-viewer');
 const report={...JSON.parse(await fs.readFile(path.join(root,'backend/cache/finance_executive_reports.json'),'utf8')).reports.find(item=>item.key===(americas || simpleViewer ? 'equities' : 'fx')),collection:'finance'};
 const app=express();app.use('/api',router);app.use('/api',(req,res)=>{
  if(req.path==='/verify-token')return res.json({success:true,email:owner});
  if(req.path==='/profile')return res.json({success:true,profile:{email:owner,preferences:{}}});
  if(req.path==='/finance-executive-reports')return res.json({success:true,data:[report],generatedAt:report.generatedAt});
  res.json({success:true,data:[],articles:[]});
 });app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
 let server,browser;
 try{
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/informes');
  await page.locator('.erh-pdf-viewer canvas').waitFor({state:'visible',timeout:120000});
  if(simpleViewer){
   const surface=page.locator('.erh-report-surface'),viewer=surface.locator('.erh-pdf-viewer'),number=viewer.getByRole('spinbutton',{name:'Número de página del PDF',exact:true}),more=surface.getByRole('button',{name:'Más opciones del informe',exact:true});
   const rendered=async expected=>{if(expected)await page.waitForFunction(value=>document.querySelector('.erh-pdf-jump input')?.value===value,String(expected));await viewer.locator('canvas').waitFor({state:'visible',timeout:60000});};
   assert.equal(await surface.getByRole('navigation',{name:'Índice del informe'}).count(),0);assert.equal(await surface.locator('.erh-pdf-search').count(),0);assert.equal(await surface.getByRole('button',{name:'Descargar PDF',exact:true}).count(),1);
   await viewer.getByRole('button',{name:'Página siguiente del PDF',exact:true}).click();await rendered('2');assert.equal(await number.inputValue(),'2');
   await viewer.getByRole('button',{name:'Página anterior del PDF',exact:true}).click();await rendered('1');assert.equal(await number.inputValue(),'1');
   const last=await number.getAttribute('max');await number.fill(last);await number.press('Enter');await rendered(last);assert.equal(await number.inputValue(),last);assert(await viewer.getByRole('button',{name:'Página siguiente del PDF',exact:true}).isDisabled());
   await viewer.getByRole('button',{name:'Aumentar zoom del PDF',exact:true}).click();await rendered();assert.equal(await viewer.getByRole('button',{name:'Ajustar PDF al ancho',exact:true}).innerText(),'125%');await viewer.getByRole('button',{name:'Ajustar PDF al ancho',exact:true}).click();await rendered();
   await viewer.getByRole('button',{name:'Buscar en el PDF',exact:true}).click();const query=viewer.getByRole('searchbox',{name:'Buscar referencia en el PDF',exact:true});assert(await query.evaluate(node=>node===document.activeElement));await query.fill('México');await viewer.getByRole('button',{name:'Buscar',exact:true}).click();await viewer.getByRole('navigation',{name:'Resultados de búsqueda en el PDF',exact:true}).waitFor();assert((await viewer.locator('.erh-pdf-search').innerText()).includes('México'));await query.press('Escape');assert.equal(await viewer.locator('.erh-pdf-search').count(),0);assert(await viewer.getByRole('button',{name:'Buscar en el PDF',exact:true}).evaluate(node=>node===document.activeElement));
   const expand=viewer.getByRole('button',{name:'Pantalla completa',exact:true});if(await expand.count()){await expand.click();await page.waitForFunction(()=>Boolean(document.fullscreenElement));await viewer.getByRole('button',{name:'Salir de pantalla completa',exact:true}).click();await page.waitForFunction(()=>!document.fullscreenElement);await rendered();}
   await more.click();assert(await surface.getByRole('button',{name:'Ver anexos',exact:true}).isVisible());assert(await surface.getByRole('link',{name:'Abrir PDF',exact:true}).isVisible());await page.keyboard.press('Escape');assert.equal(await more.getAttribute('aria-expanded'),'false');assert(await more.evaluate(node=>node===document.activeElement));
   for(const [format,label] of [['pdf','Descargar PDF'],['xlsx','Descargar Excel'],['csv','Descargar datos CSV']]){if(format!=='pdf')await more.click();const [download]=await Promise.all([page.waitForEvent('download'),surface.getByRole('button',{name:label,exact:true}).click()]);assert.equal(await download.failure(),null);assert(download.suggestedFilename().endsWith('.'+format));const bytes=await fs.readFile(await download.path());assert(bytes.length>100);if(format==='pdf')assert.equal(bytes.subarray(0,5).toString(),'%PDF-');}
   await number.fill(last);await number.press('Enter');await rendered();await surface.screenshot({path:path.join(output,'interfaz-simple-escritorio.png')});
   await page.setViewportSize({width:390,height:844});await rendered();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await surface.scrollIntoViewIfNeeded();await surface.screenshot({path:path.join(output,'interfaz-simple-movil.png')});await more.click();const popup=surface.locator('.reports-options-popup');const bounds=await popup.boundingBox();assert(bounds.x>=0 && bounds.x+bounds.width<=390);await surface.getByText('Alcance de esta exportación',{exact:true}).click();assert(await popup.locator('details').evaluate(node=>node.open));await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:1100});
   console.log('PASS simple viewer: page navigation/jump, zoom, optional search, full screen, keyboard menus, PDF/Excel/CSV downloads and mobile layout');
  }
  await page.getByRole('button',{name:'Lectura',exact:true}).click();
  if(simpleViewer){const index=page.locator('.erh-reader-index');await index.locator('summary').click();await index.getByRole('button').last().click();assert.equal(await index.evaluate(node=>node.open),false);assert(await page.locator('article.erh-document').evaluate(node=>node.scrollTop>0));await page.locator('article.erh-document').evaluate(node=>node.scrollTop=0);console.log('PASS reading view: section index opens, navigates and closes');}
  const paper=page.locator('article.erh-document');await paper.getByRole('img',{name:'VALLNEWS',exact:true}).waitFor();
  assert(await paper.locator('img.erh-vallnews-logo').evaluate(img=>img.complete && img.naturalWidth>0));
  assert((await paper.locator(':scope > .erh-reader').evaluate(node=>getComputedStyle(node,'::before').backgroundImage)).includes('vallnews-report-watermark.png'));
  if(americas){
   const chart=paper.locator('.erh-equity-history-explorer').first(),region=chart.getByRole('combobox',{name:'Región de las bolsas',exact:true});
   await region.selectOption('América');let text=await chart.innerText();for(const label of ['México · S&P/BMV IPC','Brasil · Ibovespa','Estados Unidos · S&P 500'])assert(text.includes(label),'Americas includes '+label);
   await chart.screenshot({path:path.join(output,'bolsa-america.png')});
   await region.selectOption('Latinoamérica');text=await chart.innerText();assert(text.includes('México · S&P/BMV IPC'));assert(text.includes('Brasil · Ibovespa'));assert(!text.includes('Estados Unidos · S&P 500'));
   await chart.screenshot({path:path.join(output,'bolsa-latinoamerica.png')});
   console.log('PASS browser Americas chart: Mexico/Brazil present alongside US; the Latin America filter retains both and excludes US');
  }
  await paper.screenshot({path:path.join(output,'lector-escritorio.png')});
  await page.setViewportSize({width:390,height:844});await paper.scrollIntoViewIfNeeded();
  assert(await paper.locator('img.erh-vallnews-logo').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(output,'lector-movil.png')});
  await page.getByRole('button',{name:'Ver PDF',exact:true}).click();await page.locator('.erh-pdf-viewer canvas').waitFor({state:'visible',timeout:120000});
  assert.deepEqual(errors,[]);console.log('PASS browser branding: official logo, paper watermark, desktop/mobile layout and PDF viewer without application errors');
 }finally{if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
