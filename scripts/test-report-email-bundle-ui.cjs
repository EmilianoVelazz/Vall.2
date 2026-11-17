'use strict';
/* global document, window */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),express=require('express'),{chromium}=require('playwright');
async function main(){
 const out=path.resolve('output/report-bundle-test-20261117'),manifest=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8'));
 const html=(await fs.readFile(path.join(out,'email.html'),'utf8')).replaceAll('cid:vallnews-signature','/logo.png');
 const app=express();app.get('/',(_req,res)=>res.type('html').send(html));app.get('/logo.png',(_req,res)=>res.sendFile(path.resolve('assets/img/brand/logo.png')));
 const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});let browser;const results=[];
 try{
  browser=await chromium.launch({headless:true});
  for(const width of [800,390]){
   const context=await browser.newContext({viewport:{width,height:1000}}),base='http://127.0.0.1:'+server.address().port;
   await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base);
   assert.equal(await page.locator('h1').count(),1);assert(await page.getByText('PRUEBA DE FORMATO',{exact:true}).count());
   for(const item of manifest.items){assert.equal(await page.getByText(item.title,{exact:true}).count(),1);assert.equal(await page.getByText('PDF · '+item.attachmentName,{exact:true}).count(),1);}
   assert(await page.locator('img').evaluate(image=>image.complete&&image.naturalWidth>0));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));assert.deepEqual(errors,[]);
   await page.screenshot({path:path.join(out,'email-'+width+'.png'),fullPage:true});results.push({width,reports:manifest.items.length,logoLoaded:true,noHorizontalOverflow:true,errors});await context.close();
  }
  const mime=await fs.readFile(path.join(out,'preview.eml'),'utf8');assert.equal((mime.match(/Content-Type: application\/pdf/g)||[]).length,14);assert.match(mime,/To: jonathan\.lopez@vallpork\.com/);assert(!/^Bcc:|^Cc:/mi.test(mime));
  await fs.writeFile(path.join(out,'email-ui-results.json'),JSON.stringify({results,mimePdfs:14,recipients:1},null,2));console.log(JSON.stringify({passed:true,results,mimePdfs:14,recipients:1}));
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
