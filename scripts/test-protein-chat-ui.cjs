'use strict';
/* global document, innerWidth */
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {chromium}=require('playwright');const {guardProteinPrices}=require('../backend/ai/protein-price-quality');
async function main(){
 const dir=path.resolve('output/chat-proteinas-global/interfaz');fs.mkdirSync(dir,{recursive:true});
 const merma=JSON.parse(fs.readFileSync('output/chat-proteinas-global/respuestas/final/merma.json','utf8'));
 const prices=JSON.parse(fs.readFileSync('output/chat-proteinas-global/respuestas/validado/huevo-docena.json','utf8'));
 const safe=guardProteinPrices(prices.plan,prices.liveEvidence||{},prices.text).text;
 const browser=await chromium.launch({headless:true});
 try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport});const page=await context.newPage();const requests=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url());
   if(!url.pathname.startsWith('/api/')) return route.continue();
   if(url.pathname==='/api/verify-token')return route.fulfill({json:{success:true,email:'demo@example.invalid'}});
   if(url.pathname==='/api/ai-insight-stream'){
    const request=route.request().postDataJSON();requests.push(request);const text=requests.length===1?merma.text:safe;
    const body='data: '+JSON.stringify({text})+'\n\n'+'data: '+JSON.stringify({done:true,finalText:text,tier:'flash',model:'replay-local',mode:'normal',citations:[]})+'\n\n';
    return route.fulfill({contentType:'text/event-stream',body});
   }
   if(url.pathname==='/api/chat-conversations')return route.fulfill({json:{success:true,conversations:[]}});
   return route.fulfill({json:{success:true,data:[],conversations:[],preferences:{},user:{id:'demo',email:'demo@example.invalid'}}});
  });
  await page.goto('http://127.0.0.1:5273/orion',{waitUntil:'domcontentloaded'});
  try { await page.locator('#vaiInput').waitFor({state:'visible',timeout:20000}); } catch(error) { console.log(JSON.stringify({url:page.url(),errors,body:await page.locator('body').innerText()}));await page.screenshot({path:path.join(dir,'fallo-ui.png')});throw error; }
  await page.getByText('Calcular margen y merma',{exact:true}).waitFor({state:viewport.width>600?'visible':'attached'});
  await page.locator('#vaiInput').fill(merma.question);await page.locator('#vaiSend').click();
  await page.getByText(/88[.,]54/).first().waitFor({timeout:15000});await page.locator('#vaiInput').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.getElementById('vaiInput').disabled);
  assert.equal(requests.length,1);assert.equal(requests[0].message,merma.question);
  await page.screenshot({path:path.join(dir,'margen-'+viewport.width+'.png'),fullPage:true});
  await page.locator('#vaiInput').fill('Ahora dime el precio del huevo por docena en España hoy');await page.locator('#vaiSend').click();
  await page.getByText(/No pude validar una cotización/).first().waitFor({timeout:15000});
  assert.equal(requests.length,2);assert(requests[1].history.some(t=>String(t.content||t.text||'').includes('merma')),'Enviar historia al servidor');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'Sin desbordamiento horizontal');
  assert.deepEqual(errors,[]);await page.screenshot({path:path.join(dir,'cotizacion-'+viewport.width+'.png'),fullPage:true});
  fs.writeFileSync(path.join(dir,'resultado-'+viewport.width+'.json'),JSON.stringify({viewport,passed:true,requests:requests.length,historySent:true,pageErrors:errors,transport:'API simulada local; respuestas del modelo real previamente capturadas; no evalúa disponibilidad del backend'},null,2));
  await context.close();console.log('ORION UI '+viewport.width+': send, history, price control, rendering and horizontal overflow OK');
 }}finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
