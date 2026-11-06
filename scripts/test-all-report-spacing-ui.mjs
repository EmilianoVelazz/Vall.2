import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),express=require('express'),{chromium}=require('playwright');
const source=JSON.parse(await fs.readFile('tmp/pdfs/todos-informes/sources.json','utf8')),daily=source.filter(report=>report.periodType!=='annual');
const endpoints={finance:'finance-executive-reports',markets:'market-executive-reports',mexico:'mexico-executive-reports'};
const app=express();app.use('/api',(req,res)=>{
 if(req.path==='/verify-token')return res.json({success:true,email:'fixture@example.invalid'});
 if(req.path==='/profile')return res.json({success:true,profile:{email:'fixture@example.invalid',preferences:{}}});
 if(req.path==='/annual-reports')return res.json({success:true,year:Number(req.query.year),data:source.filter(report=>report.reportYear===Number(req.query.year)),generatedAt:source[0].generatedAt});
 for(const [area,endpoint] of Object.entries(endpoints))if(req.path==='/'+endpoint)return res.json({success:true,data:daily.filter(report=>report.collection===area)});
 return res.json({success:true,data:[]});
});app.use('/assets',express.static(path.resolve('assets')));app.use(express.static(path.resolve('frontend/dist')));app.use((req,res)=>res.sendFile(path.resolve('frontend/dist/index.html')));
let server,browser;const output='output/todos-informes';await fs.mkdir(output,{recursive:true});
try{
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto('http://127.0.0.1:'+server.address().port+'/informes');
 const geometry=()=>{
  const failures=[];
  for(const grid of document.querySelectorAll('.erh-document .erh-market-visual-grid')){
   const style=getComputedStyle(grid),cards=[...grid.children].map(card=>card.getBoundingClientRect());
   if(cards.length && style.gridAutoRows!=='4px')failures.push('La distribución compacta no está activa');
   for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){
    const a=cards[i],b=cards[j];if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)failures.push('Tarjetas superpuestas');
   }
   if(cards.length && cards.every(card=>Math.abs(card.width-cards[0].width)<1))for(const left of [...new Set(cards.map(card=>Math.round(card.left)))]){
    const stack=cards.filter(card=>Math.abs(card.left-left)<1).sort((a,b)=>a.top-b.top),maximumGap=Number.parseFloat(style.getPropertyValue('--erh-card-gap'))+5;
    for(let i=1;i<stack.length;i++)if(stack[i].top-stack[i-1].bottom>maximumGap)failures.push('Hueco entre gráficas: '+Math.round(stack[i].top-stack[i-1].bottom)+' px (máximo '+maximumGap+')');
   }
  }
  if(document.documentElement.scrollWidth>innerWidth+1)failures.push('Desbordamiento horizontal');return failures;
 };
 let count=0;
 for(const [area,label] of [['finance','Finanzas'],['markets','Mercados'],['mexico','México']]){
  await page.getByRole('tab',{name:new RegExp(label)}).click();
  await page.waitForFunction(expected=>document.querySelectorAll('.erh-book').length===expected,daily.filter(report=>report.collection===area).length);
  for(const report of daily.filter(report=>report.collection===area)){
   await page.locator('.erh-book').filter({hasText:report.title}).click();await page.locator('.erh-reader').waitFor();
   for(const width of [1440,1000,820,700,390,320]){
    await page.setViewportSize({width,height:1050});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.deepEqual(await page.evaluate(geometry),[],report.collection+'/'+report.key+' a '+width+' px');
   }
   await page.setViewportSize({width:1440,height:1050});const context=page.locator('#erh-document-sessionContext');
   if(await context.count())await context.scrollIntoViewIfNeeded();
   await page.locator('.erh-document').screenshot({path:output+'/'+area+'-'+report.key+'.png'});count++;console.log('Pantalla OK: '+area+'/'+report.key);
  }
 }
 assert.equal(count,14);assert.deepEqual(errors,[]);console.log('Pantallas: OK · los 14 informes, seis anchuras, gráficas sin superposición ni desbordamiento.');
}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
