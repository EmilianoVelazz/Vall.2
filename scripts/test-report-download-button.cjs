'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),express=require('express');
const {chromium}=require('playwright');
process.env.NODE_ENV='test';process.env.JWT_SECRET='download-button-fixture';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const name of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS'])process.env[name]='';
const owner='download-button@example.invalid',auth=require.resolve('../backend/routes/auth');
require.cache[auth]={id:auth,filename:auth,loaded:true,exports:{verifyToken:(req,res,next)=>{req.user={email:owner,id:'download-button',role:'user'};next();}}};
const router=require('../backend/routes/export');
(async()=>{
 const root=path.resolve(__dirname,'..'),output=path.join(root,process.argv.includes('--panoramas-only') ? 'output/panoramas-diseno-20261106' : 'output/download-button-20261030');await fs.mkdir(output,{recursive:true});
 const reports={},snapshots={};for(const [area,file] of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']])snapshots[area]=JSON.parse(await fs.readFile(path.join(root,'backend/cache',file+'.json'),'utf8'));
 snapshots.markets=require('../backend/lib/report-market-overview').composeMarketOverview(snapshots.markets);snapshots.mexico=require('../backend/lib/report-panorama').composeMexicoPanorama(snapshots.mexico);snapshots.finance=await require('../backend/lib/report-panorama').composePanorama(snapshots.finance,{marketsSnapshot:snapshots.markets,mexicoSnapshot:snapshots.mexico});for(const area of Object.keys(snapshots))reports[area]=snapshots[area].reports;
 const {reportDownloadName}=await import('../shared/report-download-name.mjs');
 const app=express(),responses=[],errors=[],results=[];let server,browser,page;
 app.use('/api',router);app.use(express.json());
 app.use('/api',(req,res)=>{
  if(req.path==='/verify-token')return res.json({success:true,email:owner});
  if(req.path==='/profile')return res.json({success:true,profile:{email:owner,preferences:{}}});
  for(const [area,endpoint] of [['finance','/finance-executive-reports'],['markets','/market-executive-reports'],['mexico','/mexico-executive-reports']])if(req.path===endpoint){const clock=require('../backend/lib/report-schedule');return res.json({success:true,data:reports[area],nextRefreshAt:(area==='markets' ? clock.nextMarketReportRefreshAt() : clock.nextReportRefreshAt()).toISOString()});}
  return res.json({success:true,data:[],articles:[]});
 });
 app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
 try{
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.on('pageerror',error=>errors.push(error.message));
  page.on('response',async response=>{if(response.url().endsWith('/api/report-export'))responses.push({status:response.status(),type:response.headers()['content-type'],...(response.status()!==200 ? {body:await response.text().catch(()=>'<unreadable>')} : {})});});
  await page.goto('http://127.0.0.1:'+server.address().port+'/informes');
  if(process.argv.includes('--schedule-only')){
   await page.getByRole('tab',{name:/^Mercados/}).click();const clock=page.locator('.erh-next-cut');await clock.waitFor({state:'visible'});await page.waitForFunction(()=>/Corte semanal.*viernes.*14:00.*CDMX/.test(globalThis.document.querySelector('.erh-next-cut')?.textContent || ''));assert.match(await clock.innerText(),/viernes.*14:00/);await clock.screenshot({path:path.join(output,'corte-semanal-viernes.png')});
   await page.getByRole('tab',{name:/^Finanzas/}).click();await page.waitForFunction(()=>/Próximo corte/.test(globalThis.document.querySelector('.erh-next-cut')?.textContent || ''));assert(!/Corte semanal/.test(await clock.innerText()));assert.deepEqual(errors,[]);console.log('Navegador: Mercados muestra viernes 14:00 CDMX; Finanzas conserva el próximo corte diario.');return;
  }
  const cases=[['finance','equities','Finanzas'],['finance','bonds','Finanzas'],['finance','fx','Finanzas'],['finance','overview','Finanzas'],['markets','grains','Mercados'],['markets','energy_metals','Mercados'],['markets','proteins','Mercados'],['markets','overview','Mercados'],['mexico','mx_proteins','México'],['mexico','mx_overview','México']];
  const selectedCases=process.argv.includes('--grains-only') ? cases.filter(([,key])=>key==='grains') : process.argv.includes('--energy-only') ? cases.filter(([,key])=>key==='energy_metals') : process.argv.includes('--panoramas-only') ? cases.filter(([,key])=>['overview','mx_overview'].includes(key)) : cases;
  for(const [area,key,label] of selectedCases){
   await page.getByRole('tab',{name:new RegExp('^'+label)}).click();
   const report=reports[area].find(item=>item.key===key);assert(report);
   await page.locator('.erh-library-entry').filter({has:page.locator('strong',{hasText:report.title})}).first().click();
   const button=page.getByRole('button',{name:'Descargar PDF',exact:true});await button.waitFor();
   const viewer=page.getByRole('region',{name:'Vista previa PDF de '+report.title,exact:true});await viewer.locator('canvas').waitFor({state:'visible',timeout:120000});
   assert.equal(await page.getByRole('button',{name:'Ver PDF',exact:true}).getAttribute('aria-pressed'),'true','The PDF is the default view');
   const expected=reportDownloadName(report);assert.equal(await page.getByRole('link',{name:'Guardar PDF',exact:true}).getAttribute('download'),expected);
   const before=responses.length;
   const started=Date.now(),[download]=await Promise.all([page.waitForEvent('download',{timeout:130000}),button.click()]);
   const file=await download.path();assert.equal(await download.failure(),null);const bytes=await fs.readFile(file);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
   assert.equal(download.suggestedFilename(),expected);assert.equal(responses.length,before,'Saving reuses the displayed PDF without exporting again');
   const result={area,key,filename:download.suggestedFilename(),bytes:bytes.length,ms:Date.now()-started};results.push(result);console.log(JSON.stringify(result));
   if(key==='grains'){
    const {weeklyReport}=await import('../shared/report-weekly.mjs'),reading=weeklyReport(report),chart=reading.grainGlobalHistory;
    await page.getByRole('button',{name:'Lectura',exact:true}).click();
    const world=page.getByRole('figure',{name:chart.title,exact:true});await world.waitFor({state:'visible'});
    assert.equal(await world.locator('.erh-grain-trace').count(),chart.series.length,'The real reader draws every country/reference');
    assert.equal(await page.getByRole('button',{name:'Todos los países · desde 2020',exact:true}).getAttribute('aria-pressed'),'true');
    await world.screenshot({path:path.join(output,'granos-historia-mundial.png')});
    assert((await page.locator('body').innerText()).includes('Tabla maestra'));
   }
   if(key==='energy_metals'){
    const {weeklyReport}=await import('../shared/report-weekly.mjs'),reading=weeklyReport(report),chart=reading.energyExecutive.history;
    await page.getByRole('button',{name:'Lectura',exact:true}).click();
    const world=page.getByRole('img',{name:chart.title,exact:true});await world.waitFor({state:'visible'});
    assert.equal(await world.locator('path').count(),chart.series.length,'Energy reader draws every physical and futures reference');
    assert.equal(await page.getByRole('button',{name:'Energía y metales · desde 2020',exact:true}).getAttribute('aria-pressed'),'true');
    assert((await page.locator('body').innerText()).includes('Energía · precios publicados'));
    assert((await page.locator('body').innerText()).includes('Metales · precios publicados'));
    await world.screenshot({path:path.join(output,'energia-historia-2020.png')});
   }
   if(['overview','mx_overview'].includes(key)){
    const {weeklyReport}=await import('../shared/report-weekly.mjs'),desk=weeklyReport(report).panorama;assert(desk);
    await page.getByRole('button',{name:'Lectura',exact:true}).click();
    const opening=page.locator('.erh-panorama-opening').first();await opening.waitFor({state:'visible'});
    assert.equal(await opening.locator('.erh-panorama-signal').count(),desk.signals.length);
    assert.equal(await page.locator('.erh-panorama-index').first().locator('a').count(),desk.chapters.length);
    assert.equal(await page.locator('.erh-panorama-stats').count(),0,'No redundant reference-count boxes');
    await page.setViewportSize({width:1440,height:3300});
    await opening.screenshot({path:path.join(output,'panorama-'+area+'.png')});
    await page.setViewportSize({width:1440,height:1000});
    const {panoramaChart}=await import('../shared/report-panorama-chart.mjs'),chartCount=desk.signals.filter(item=>panoramaChart(item)).length;
    assert.equal(await opening.locator('.erh-panorama-signal svg').count(),chartCount,'Every eligible signal has an axis-labelled chart');
    const enlarge=opening.getByRole('button',{name:'Ampliar gráfica',exact:true}).first();await enlarge.click();
    const detail=opening.locator('.erh-panorama-detail');await detail.waitFor({state:'visible'});
    const picker=detail.getByRole('slider');await picker.focus();await picker.press('Home');const earliest=await picker.getAttribute('aria-valuetext');await picker.press('End');assert.notEqual(await picker.getAttribute('aria-valuetext'),earliest,'Keyboard accesses distinct published observations');
    await detail.getByRole('button',{name:'6 meses',exact:true}).click();assert.equal(await detail.getByRole('button',{name:'6 meses',exact:true}).getAttribute('aria-pressed'),'true');
    await detail.getByRole('button',{name:'1 año',exact:true}).click();assert.equal(await detail.getByRole('button',{name:'1 año',exact:true}).getAttribute('aria-pressed'),'true');
    await detail.getByRole('button',{name:'Historial disponible',exact:true}).click();
    await detail.screenshot({path:path.join(output,'detalle-'+area+'.png')});
    await page.setViewportSize({width:390,height:850});await page.waitForTimeout(180);
    assert(await opening.evaluate(node=>node.scrollWidth<=node.clientWidth+2),'Opening fits a mobile screen');
    assert(await detail.evaluate(node=>node.scrollWidth<=node.clientWidth+2),'Expanded chart fits a mobile screen');
    await detail.screenshot({path:path.join(output,'detalle-'+area+'-movil.png')});
    await detail.getByRole('button',{name:'Cerrar detalle',exact:true}).click();assert(await enlarge.evaluate(node=>node===globalThis.document.activeElement),'Closing returns focus to the originating chart');
    await page.setViewportSize({width:1440,height:1000});
    if(area==='mexico'){
     const structural=desk.signals.find(item=>item.kind==='structural'),card=opening.locator('.erh-panorama-signal').filter({has:page.locator('a strong',{hasText:structural.label})}).first();assert(await card.locator('svg rect').count()>=3,'Annual series are drawn as zero-based bars');
     await card.getByRole('button',{name:'Ampliar gráfica',exact:true}).click();assert.equal(await detail.locator('.erh-panorama-ranges').count(),0,'Annual data cannot be presented as six-month or daily history');await detail.getByRole('button',{name:'Cerrar detalle',exact:true}).click();
    }
    const last=opening.locator('.erh-panorama-signal>a').last();await last.click();
    assert(await page.locator('.erh-panorama-chapter>header>button[aria-expanded="true"]').count()>=1);
   }
  }
  assert.deepEqual(errors,[]);assert(responses.length>=selectedCases.length);assert(responses.every(item=>item.status===200));
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({results,responses,errors},null,2));
 }catch(error){if(page){await fs.writeFile(path.join(output,'error.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(output,'error.png'),fullPage:true});}await fs.writeFile(path.join(output,'diagnostics.json'),JSON.stringify({results,responses,errors},null,2));throw error;}
 finally{if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
})().catch(error=>{console.error(error);process.exitCode=1;});
