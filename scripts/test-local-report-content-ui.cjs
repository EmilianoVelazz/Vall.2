'use strict';
/* global document,innerWidth */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),express=require('express'),{chromium}=require('playwright');
const PDFDocument=require('pdfkit');
async function main(){
 const folder=path.resolve('output/local-content-20261126'),collections={};
 for(const [area,name]of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']])collections[area]=JSON.parse(await fs.readFile('backend/cache/'+name+'.json','utf8')).reports;
 const production=collections.mexico.find(item=>item.key==='mx_production'),news=collections.markets.find(item=>item.key==='market_news');
 assert(production.structuralReferences.length===5 && news.marketNews.length>0);
 // This UI fixture checks labels and reader data. Separate integration tests validate the real PDF renderer.
 const pdf=await new Promise(resolve=>{const doc=new PDFDocument(),chunks=[];doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.text('Validacion local de etiquetas y cobertura');doc.end();});
 const app=express(),routes={'/finance-executive-reports':'finance','/market-executive-reports':'markets','/mexico-executive-reports':'mexico'};
 app.use('/api',(req,res)=>{
  if(req.path==='/verify-token')return res.json({success:true,email:'content-fixture@example.invalid'});
  if(req.path==='/profile')return res.json({success:true,profile:{email:'content-fixture@example.invalid',preferences:{}}});
  if(req.path==='/report-export')return res.type('application/pdf').send(pdf);
  if(routes[req.path])return res.json({success:true,data:collections[routes[req.path]]});
  return res.json({success:true,data:[],articles:[]});
 });
 app.use(express.static(path.resolve('dist')));app.use((req,res)=>res.sendFile(path.resolve('dist/index.html')));
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});let browser;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/informes');await page.locator('#erh-tab-mexico').click();
  const entry=title=>page.locator('.erh-library-entry').filter({has:page.locator('strong',{hasText:title})}).first();
  const card=entry(production.title);await card.waitFor();assert((await card.innerText()).includes('Histórico'));assert((await card.innerText()).includes('Periodo de los datos: 2024 · 2025'));assert(!(await card.innerText()).includes('Sin fecha'));
  await card.screenshot({path:path.join(folder,'production-periods-desktop.png')});
  const partial=entry(collections.mexico.find(item=>item.key==='mx_proteins').title);assert((await partial.innerText()).includes('referencias con dato'));assert((await partial.innerText()).includes('sin dato'));
  await page.setViewportSize({width:390,height:844});await card.scrollIntoViewIfNeeded();await card.screenshot({path:path.join(folder,'production-periods-mobile.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.setViewportSize({width:1440,height:1050});await page.locator('#erh-tab-markets').click();const newsCard=entry(news.title);await newsCard.waitFor();assert((await newsCard.innerText()).includes('Actualizado'));
  await newsCard.locator('button.erh-book').click();await page.getByRole('button',{name:'Lectura',exact:true}).click();await page.getByText(news.marketNews[0].title,{exact:true}).first().waitFor({state:'visible'});
  assert.deepEqual(errors,[]);const result={passed:true,productionPeriods:['2024','2025'],newsShown:news.marketNews.length,partialCoverageExplained:true,desktop:true,mobile:true,errors};await fs.writeFile(path.join(folder,'ui-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
