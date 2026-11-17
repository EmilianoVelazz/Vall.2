'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
(async()=>{
 const folder=path.resolve('output/unlimited-chat-20261117');await fs.mkdir(folder,{recursive:true});
 const child=spawn(process.execPath,['scripts/lib/chat-credit-ui-fixture.cjs'],{cwd:path.resolve('.'),env:{...process.env,VALL_REPORT_EMAIL_AUTOMATION_ENABLED:'false'},windowsHide:true,stdio:['ignore','pipe','pipe']});let browser,page;
 try{
  const base=await new Promise((resolve,reject)=>{let buffer='';const timer=setTimeout(()=>reject(Error('Fixture startup timed out')),10000);child.stdout.on('data',chunk=>{buffer+=chunk;for(const line of buffer.split('\n'))try{const data=JSON.parse(line);if(data.url){clearTimeout(timer);resolve(new URL(data.url).origin);}}catch{}});child.once('exit',()=>{clearTimeout(timer);reject(Error('Fixture exited'));});});
  browser=await chromium.launch({headless:true});const results=[];
  for(const width of [1440,390])for(const role of ['user','admin']){
   const context=await browser.newContext({viewport:{width,height:width===1440?1050:844},reducedMotion:'reduce'});
   await context.route('**/*',route=>new URL(route.request().url()).origin===base ? route.continue() : route.abort());
   page=await context.newPage();const errors=[];let usageRequests=0;
   page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(new URL(request.url()).pathname==='/api/chat-usage')usageRequests++;});
   await page.goto(base+'/orion?mode='+role);const input=page.locator('#vaiInput');await input.waitFor();
   await page.waitForFunction(()=>!globalThis.document.querySelector('#vaiInput').disabled);
   assert.equal(await page.locator('.vai-chat-usage,.vai-credit-windows,.vai-credit-alert').count(),0);
   assert(!/Administrador · chat sin límite de créditos|MXN disponibles|Se recargan el/.test(await page.locator('body').innerText()));
   await input.fill('Explica qué es un bono gubernamental');await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();
   await page.getByText('Respuesta de prueba sin cupos internos.',{exact:true}).waitFor();
   await page.waitForFunction(()=>!globalThis.document.querySelector('#vaiInput').disabled);
   assert.equal(usageRequests,0,'La interfaz no debe consultar ni actualizar un saldo retirado');assert.deepEqual(errors,[]);
   await page.screenshot({path:path.join(folder,`orion-${role}-${width}.png`),fullPage:true});
   results.push({role,width,noticeRemoved:true,messageSent:true,usageRequests,errors});await context.close();page=null;
  }
  await fs.writeFile(path.join(folder,'ui-results.json'),JSON.stringify(results,null,2));
  console.log('Unlimited chat UI: users and administrator, desktop and mobile, no credit notice or balance requests, and messages delivered; no real AI calls.');
 }catch(error){if(page)await page.screenshot({path:path.join(folder,'chat-error.png'),fullPage:true});throw error;}
 finally{await browser?.close();child.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
