'use strict';
/* global Node, document, innerWidth */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),express=require('express');
const {chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),output=path.join(root,'output/report-tables-restored-20261030');await fs.mkdir(output,{recursive:true});
 const reports={},results=[],errors=[];for(const [area,file] of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']])reports[area]=JSON.parse(await fs.readFile(path.join(root,'backend/cache',file+'.json'),'utf8')).reports;
 const owner='tables-fixture@example.invalid',app=express();let preferences={sections:{tables:false}},server,browser,page;
 app.use(express.json());app.use('/api',(req,res)=>{
  if(req.path==='/verify-token')return res.json({success:true,email:owner});
  if(req.path==='/profile'){if(req.method==='POST')preferences=req.body.preferences.executiveReports;return res.json({success:true,profile:{email:owner,preferences:{executiveReports:preferences}}});}
  for(const [area,endpoint] of [['finance','/finance-executive-reports'],['markets','/market-executive-reports'],['mexico','/mexico-executive-reports']])if(req.path===endpoint)return res.json({success:true,data:reports[area]});
  return res.json({success:true,data:[],articles:[]});
 });
 app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
 try{
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/informes');
  const restore=page.getByRole('button',{name:'Mostrar tablas de datos',exact:true});await restore.waitFor();
  assert.equal(await page.locator('.erh-document .erh-block-comparisons table').count(),0,'A preserved false preference explains the hidden tables');
  await restore.click();await page.locator('.erh-document .erh-block-comparisons table').first().waitFor();assert.equal(await restore.count(),0);
  for(const [area,label] of [['finance','Finanzas'],['markets','Mercados'],['mexico','México']]){
   await page.getByRole('tab',{name:new RegExp('^'+label)}).click();
   for(const report of reports[area].filter(item=>!item.key.endsWith('news'))){
    await page.locator('.erh-library-entry').filter({has:page.locator('strong',{hasText:report.title})}).first().click();
    const paper=page.locator('.erh-document');await paper.locator('table').first().waitFor();
    const layout=await paper.evaluate(element=>{const table=element.querySelector('table'),chart=element.querySelector('.erh-chart,.erh-market-explorer,.erh-commodity-explorer');return {tables:element.querySelectorAll('table').length,tableBeforeChart:!chart || Boolean(table.compareDocumentPosition(chart)&Node.DOCUMENT_POSITION_FOLLOWING)};});
    assert(layout.tableBeforeChart,area+'/'+report.key+': tables before chart explorers');results.push({area,key:report.key,...layout});
   }
  }
  await page.getByRole('tab',{name:/^Mercados/}).click();await page.locator('.erh-library-entry').filter({has:page.locator('strong',{hasText:reports.markets.find(item=>item.key==='grains').title})}).first().click();
  await page.locator('.erh-document .erh-block-comparisons table').first().scrollIntoViewIfNeeded();await page.locator('.erh-document-column').screenshot({path:path.join(output,'tablas-escritorio.png')});
  await page.setViewportSize({width:390,height:844});await page.locator('.erh-document .erh-block-comparisons table').first().scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,'tablas-movil.png')});
  await page.reload();await page.getByRole('button',{name:'Descargar PDF',exact:true}).waitFor();assert.equal(await restore.count(),0,'Restored preference persists after reload');
  assert.equal(preferences.sections.tables,true);assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({restoredPreference:true,reports:results.length,results,errors},null,2));console.log(JSON.stringify({restoredPreference:true,reports:results.length,errors}));
 }catch(error){if(page){await fs.writeFile(path.join(output,'error.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(output,'error.png'),fullPage:true});}throw error;}
 finally{if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
})().catch(error=>{console.error(error);process.exitCode=1;});
