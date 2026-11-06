'use strict';
/* global document, innerWidth, window */
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const {chromium}=require('playwright');
async function main(){
 const auditPath=process.argv.find(value=>value.startsWith('--audit='))?.slice('--audit='.length)||'output/chat-proteinas-global/respuestas/mexico/tabla-mexico.json';
 const audit=JSON.parse(fs.readFileSync(auditPath,'utf8'));
 const heading=audit.text.match(/\*\*([^*]+)\*\*/)?.[1];
 const expectedRows=(audit.text.match(/^\| /gm)||[]).length-2;
 const priorReply=audit.history.find(turn=>turn.role==='assistant')?.content||'Referencias internacionales de cerdo, pollo, huevo y res: Europa y Estados Unidos.';
 const precedingQuestion=audit.history[0]?.content||'Dame referencias del precio del cerdo en México';
 const dir=path.resolve(process.argv.find(value=>value.startsWith('--out='))?.slice('--out='.length)||'output/chat-proteinas-mexico/interfaz');fs.mkdirSync(dir,{recursive:true});const browser=await chromium.launch({headless:true});
 try{for(const viewport of [{width:1440,height:1200},{width:390,height:844}]){
  const context=await browser.newContext({viewport});const page=await context.newPage();const requests=[];const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url());if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname==='/api/verify-token')return route.fulfill({json:{success:true,email:'demo@example.invalid'}});
   if(url.pathname==='/api/ai-insight-stream'){
    const data=route.request().postDataJSON();requests.push(data);const text=requests.length===1?priorReply:audit.text;
    return route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({text})+'\n\n'+'data: '+JSON.stringify({done:true,finalText:text,model:'replay-pulsar',tier:'pro',citations:audit.citations})+'\n\n'});
   }
   return route.fulfill({json:{success:true,conversations:[],data:[],preferences:{}}});
  });
  await page.goto('http://127.0.0.1:5273/orion',{waitUntil:'domcontentloaded'});await page.locator('#vaiInput').waitFor({state:'visible',timeout:20000});
  await page.waitForFunction(()=>typeof window.VNVallAi?.desmontar==='function',{},{timeout:30000});
  await page.locator('#vaiInput').fill(precedingQuestion);await page.locator('#vaiSend').click();
  try { await page.getByText(priorReply,{exact:false}).first().waitFor(); } catch(error) {console.log(JSON.stringify({requests,errors,body:await page.locator('body').innerText()}));throw error;}
  await page.waitForFunction(()=>!document.getElementById('vaiInput').disabled);
  await page.locator('#vaiInput').fill(audit.question);await page.locator('#vaiSend').click();await page.getByText(heading,{exact:true}).waitFor();
  await page.waitForFunction(()=>!document.getElementById('vaiInput').disabled);
  const rows=await page.locator('table tbody tr').count();assert.equal(rows,expectedRows,'Conservar las referencias locales en tabla');
  assert.equal(requests.length,2);assert(requests[1].history.some(turn=>String(turn.content||turn.text).includes(precedingQuestion)));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);assert.deepEqual(errors,[]);
  await page.getByText(heading,{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(dir,'tabla-'+viewport.width+'.png'),fullPage:true});
  fs.writeFileSync(path.join(dir,'resultado-'+viewport.width+'.json'),JSON.stringify({passed:true,viewport,rows,errors,transport:'API local simulada, tabla capturada de ORION Pulsar real y SNIIM real'},null,2));
  await context.close();console.log('Mexico table UI '+viewport.width+': rows, history, sources and no horizontal overflow OK');
 }}finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
