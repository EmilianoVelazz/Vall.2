'use strict';
/* global document, innerWidth */
process.env.NODE_ENV='test';process.env.RUN_BACKGROUND_JOBS='false';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
require('../backend/lib/tls-trust').configureSystemTrust();
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),express=require('express'),{chromium}=require('playwright');
const auth=require.resolve('../backend/routes/auth');require.cache[auth]={id:auth,filename:auth,loaded:true,exports:{verifyToken:(req,res,next)=>{req.user={email:'local-cme@example.invalid'};next();}}};
const exportsRouter=require('../backend/routes/export');
async function main(){
 const root=path.resolve(__dirname,'..'),folder=path.join(root,'output/cme-derivatives-20261117');await fs.mkdir(folder,{recursive:true});await fs.mkdir(path.join(root,'output/pdf'),{recursive:true});
 const snapshot=JSON.parse(await fs.readFile(path.join(root,'backend/cache/market_executive_reports.json'))),report={...snapshot.reports.find(item=>item.key==='grains'),collection:'markets'};
 const {weeklyReport}=require('../shared/report-weekly.mjs'),model=weeklyReport(report),tables=model.results.filter(table=>['commodity-options','commodity-futures'].includes(table.printGroup));
 assert.equal(tables.length,2);assert.equal(new Set(report.marketDerivatives.options.map(item=>item.symbol)).size,4);
 const expected=new Map(tables.map(table=>[table.title,table.rows.length])),pdfChecks=[];
 const oiCounts=new Set([...tables[0].rows.flatMap(row=>[row[2],row[3]]),...tables[1].rows.map(row=>row[1])]);
 for(const period of ['daily','weekly']){
  const payload=exportsRouter._test.executivePayload({...report,analysisPeriod:period}),bytes=await exportsRouter._test.makeExecutivePdf(payload.title,payload);
  const {getDocument}=await import('../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs'),task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false});
  try{
   const pdf=await task.promise;let text='',smallest=Infinity;const derivativePages=[],chartPages=[];
   for(let n=1;n<=pdf.numPages;n++){
    const page=await pdf.getPage(n),items=(await page.getTextContent()).items.filter(item=>item.str.trim()),pageText=items.map(item=>item.str).join(' ');text+=pageText+' ';
    const hasDerivatives=/Opciones de commodities|Interés abierto de futuros|Put\/Call/.test(pageText);if(hasDerivatives)derivativePages.push(n);
    if(pageText.includes(model.grainGlobalHistory.title)){
     const normalized=pageText.replace(/\s+/g,' ');chartPages.push(n);
     for(const visual of model.visuals.filter(visual=>visual.grainRecentFeatured))assert(normalized.includes(visual.title),'Recent charts share the history sheet instead of leaving a nearly empty page');
     for(const series of model.grainGlobalHistory.series)assert(normalized.includes(series.shortLabel),'Every historical reference survives spacing changes');
     for(const item of items.filter(item=>model.grainGlobalHistory.series.some(series=>item.str===series.shortLabel)))assert(Math.hypot(item.transform[0],item.transform[1])>=7,'History labels keep their readable type size');
    }
    for(const item of items){assert(item.transform[4]>=28 && item.transform[4]+item.width<=page.view[2]-25,'PDF text remains within horizontal margins');assert(item.transform[5]>=50,'PDF text remains above the footer');if(hasDerivatives && oiCounts.has(item.str.trim()) && item.transform[5]>80)smallest=Math.min(smallest,Math.hypot(item.transform[0],item.transform[1]));}
   }
   assert(smallest>=7,'Numeric evidence remains readable');const flat=text.replace(/[,\s]/g,'');
   for(const row of tables[0].rows){for(const cell of [row[1],row[2],row[3],row[5]])assert(flat.includes(cell.replace(/[,\s]/g,'')),'PDF contains every paired series, date and OI');}
   for(const row of tables[1].rows)assert(flat.includes(row[1].replace(/[,\s]/g,'')),'PDF contains aggregate futures OI');
   assert(text.includes('Put/Call') && text.includes('Final'));assert.equal(chartPages.length,1);assert(pdf.numPages<=4,'The current complete grain edition fits four balanced pages');await fs.writeFile(path.join(folder,'granos-'+period+'.pdf'),bytes);
   if(period==='daily')await fs.writeFile(path.join(root,'output/pdf/granos-forrajes-calls-puts.pdf'),bytes);
   pdfChecks.push({period,pages:pdf.numPages,smallestNumericFont:smallest,derivativePages,chartPages});
  }finally{await task.destroy();}
 }
 const app=express();app.use('/api',(req,res,next)=>{
  if(/^\/report-(?:export|download|localize)/.test(req.path))return next();
  if(req.path==='/verify-token')return res.json({success:true,email:'local-cme@example.invalid'});
  if(req.path==='/profile')return res.json({success:true,profile:{email:'local-cme@example.invalid',preferences:{}}});
  if(req.path==='/market-executive-reports')return res.json({success:true,data:[report],generatedAt:report.generatedAt});
  res.json({success:true,data:[],articles:[]});
 });app.use('/api',exportsRouter);app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
 let server,browser;const errors=[];
 try{
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'});page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());await page.goto('http://127.0.0.1:'+server.address().port+'/informes');await page.locator('#erh-tab-markets').click();
  const viewer=page.locator('.erh-pdf-viewer');await viewer.locator('canvas').waitFor({state:'visible',timeout:120000});const input=viewer.getByRole('spinbutton',{name:'Número de página del PDF',exact:true});assert.equal(Number(await input.getAttribute('max')),pdfChecks[0].pages);
  const derivativePage=pdfChecks[0].derivativePages[0];await input.fill(String(derivativePage));await input.press('Enter');await viewer.locator('canvas[aria-label^="Página '+derivativePage+' /"]').waitFor({timeout:30000});await page.waitForFunction(()=>/Put\/Call/.test(document.querySelector('.erh-pdf-viewport > .erh-pdf-page-text')?.textContent || ''),null,{timeout:30000});await viewer.screenshot({path:path.join(folder,'pdf-calls-puts.png')});
  const chartPage=pdfChecks[0].chartPages[0];await input.fill(String(chartPage));await input.press('Enter');await viewer.locator('canvas[aria-label^="Página '+chartPage+' /"]').waitFor({timeout:30000});await page.waitForFunction(()=>/Granos del mundo/.test(document.querySelector('.erh-pdf-viewport > .erh-pdf-page-text')?.textContent || ''),null,{timeout:30000});await viewer.screenshot({path:path.join(folder,'pdf-espacios-graficas.png')});
  await page.getByRole('button',{name:'Lectura',exact:true}).click();for(const [title,count]of expected){const table=page.getByRole('table',{name:title,exact:true});await table.waitFor({state:'visible'});assert.equal(await table.locator('tbody tr').count(),count);}
  const options=page.getByRole('table',{name:tables[0].title,exact:true});await options.locator('tbody tr').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(folder,'lectura-calls-puts.png')});await page.setViewportSize({width:390,height:844});await options.locator('tbody tr').first().scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(folder,'lectura-calls-puts-mobile.png')});assert.deepEqual(errors,[]);
  const result={observationDates:[...new Set(report.marketDerivatives.options.map(item=>item.date))],optionPairs:tables[0].rows.length,futures:tables[1].rows.length,pdfChecks,desktop:true,mobile:true,errors,emailsSent:0};await fs.writeFile(path.join(folder,'validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
