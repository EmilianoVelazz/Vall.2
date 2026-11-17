'use strict';
/* global document, innerWidth */
process.env.NODE_ENV='test';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';process.env.RUN_BACKGROUND_JOBS='false';
process.env.JWT_SECRET='panorama-ui-fixture-only-at-least-32-bytes';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),express=require('express'),{chromium}=require('playwright');
const auth=require.resolve('../backend/routes/auth'),owner='panorama@example.invalid';require.cache[auth]={id:auth,filename:auth,loaded:true,exports:{verifyToken:(req,res,next)=>{req.user={email:owner};next();}}};
const router=require('../backend/routes/export');
async function main(){
 const root=path.resolve(__dirname,'..'),useLocalCache=process.argv.includes('--local-cache'),folder=path.join(root,useLocalCache?'output/local-panorama-preview-20261117':'output/panoramas-completos'),reports={};await fs.mkdir(folder,{recursive:true});
 if(useLocalCache){
  const load=async name=>JSON.parse(await fs.readFile(path.join(root,'backend/cache',name+'.json'),'utf8')),{composePanorama,composeMexicoPanorama}=require('../backend/lib/report-panorama'),{composeMarketOverview}=require('../backend/lib/report-market-overview');
  const markets=composeMarketOverview(await load('market_executive_reports')),mexico=composeMexicoPanorama(await load('mexico-executive-reports')),finance=await composePanorama(await load('finance_executive_reports'),{marketsSnapshot:markets,mexicoSnapshot:mexico});
  for(const [area,snapshot]of [['finance',finance],['markets',markets],['mexico',mexico]])reports[area]=snapshot.reports.find(item=>item.key===(area==='mexico'?'mx_overview':'overview'));
 }else for(const area of ['finance','markets','mexico'])reports[area]=JSON.parse(await fs.readFile(path.join(folder,area+'.json'),'utf8'));
 const app=express(),endpoints={'/finance-executive-reports':'finance','/market-executive-reports':'markets','/mexico-executive-reports':'mexico'};
 app.use('/api',(req,res,next)=>{
  if(/^\/report-(?:export|download|localize)/.test(req.path))return next();
  if(req.path==='/verify-token')return res.json({success:true,email:owner});
  if(req.path==='/profile')return res.json({success:true,profile:{email:owner,preferences:{}}});
  if(endpoints[req.path]){const report=reports[endpoints[req.path]];return res.json({success:true,data:[report],generatedAt:report.generatedAt});}
  res.json({success:true,data:[],articles:[]});
 });
 app.use('/api',router);app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
 let server,browser;const results=[];
 try{
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());await page.goto('http://127.0.0.1:'+server.address().port+'/informes');
  for(const area of ['finance','markets','mexico']){
   const openedAt=Date.now();await page.locator('#erh-tab-'+area).click();const viewer=page.locator('.erh-pdf-viewer');await viewer.locator('canvas').waitFor({state:'visible',timeout:120000});const firstPageMs=Date.now()-openedAt;
   const badge=await page.locator('.erh-book.is-active .erh-data-health b').innerText();assert.notEqual(badge,'Sin datos','A panorama containing published chapters cannot have an empty-data badge');
   const number=viewer.getByRole('spinbutton',{name:'Número de página del PDF',exact:true}),last=await number.getAttribute('max');assert(Number(last)>3);
   async function showPage(value){await number.fill(value);await number.press('Enter');await viewer.locator('canvas[aria-label^="Página '+value+' /"]').waitFor({state:'visible',timeout:30000});await page.waitForFunction(expected=>document.querySelector('.erh-pdf-viewport > .erh-pdf-page-text')?.textContent.replace(/\s+/g,' ').includes('Página '+expected+' /'),value,{timeout:30000});}
   await showPage('2');assert((await viewer.locator('.erh-pdf-viewport > .erh-pdf-page-text').innerText()).includes('Índice de contenidos'));
   await viewer.screenshot({path:path.join(folder,area+'-pdf-index.png')});await showPage(last);await showPage('1');
   assert((await viewer.locator('.erh-pdf-viewport > .erh-pdf-page-text').innerText()).includes('EDICIÓN INTEGRAL'));await viewer.screenshot({path:path.join(folder,area+'-pdf-cover.png')});
   await page.getByRole('button',{name:'Lectura',exact:true}).click();const cover=page.locator('.erh-panorama-cover'),index=page.getByRole('navigation',{name:'Índice del panorama',exact:true}),chapters=page.locator('.erh-panorama-chapter');
   await cover.waitFor({state:'visible'});assert.equal(await chapters.count(),reports[area].panoramaParts.length);assert.equal(await index.getByRole('link').count(),await chapters.count());
   await page.getByRole('button',{name:'Contraer capítulos',exact:true}).click();assert.equal(await chapters.locator('button[aria-expanded="true"]').count(),0);
   await index.getByRole('link').last().click();assert.equal(await chapters.last().locator(':scope > header > button').getAttribute('aria-expanded'),'true');assert(await chapters.last().locator('[id*="-body-"]').isVisible());
   await cover.scrollIntoViewIfNeeded();await cover.screenshot({path:path.join(folder,area+'-reader-desktop.png')});
   await page.setViewportSize({width:390,height:844});await cover.scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const box=await cover.boundingBox();assert(box.x>=0 && box.x+box.width<=390);
   await cover.getByRole('link',{name:'Ir al índice'}).click();assert(await index.isVisible());await cover.screenshot({path:path.join(folder,area+'-reader-mobile.png')});await page.setViewportSize({width:1440,height:1100});
   results.push({area,chapters:await chapters.count(),pages:Number(last),badge,firstPageMs,pdfCover:true,pdfIndex:true,lastPdfPage:true,desktop:true,mobile:true,indexOpensChapter:true});
  }
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(folder,'ui-validation.json'),JSON.stringify({results,errors,emailsSent:0},null,2));console.log(JSON.stringify({passed:results.length,results,errors}));
 }finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
