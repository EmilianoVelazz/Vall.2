'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
(async()=>{
 const folder=path.resolve('output/revision-final-20261105');await fs.mkdir(folder,{recursive:true});
 const child=spawn(process.execPath,['scripts/lib/chat-credit-ui-fixture.cjs'],{cwd:path.resolve('.'),env:{...process.env,VALL_REPORT_EMAIL_AUTOMATION_ENABLED:'false'},windowsHide:true,stdio:['ignore','pipe','pipe']});let browser,page;
 try{
  const base=await new Promise((resolve,reject)=>{let buffer='';const timer=setTimeout(()=>reject(Error('Fixture startup timed out')),10000);child.stdout.on('data',chunk=>{buffer+=chunk;for(const line of buffer.split('\n'))try{const data=JSON.parse(line);if(data.url){clearTimeout(timer);resolve(new URL(data.url).origin);}}catch{}});child.once('exit',()=>{clearTimeout(timer);reject(Error('Fixture exited'));});});
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/orion?mode=available');const usage=page.getByRole('complementary',{name:'Uso de créditos del chat'});await usage.waitFor({state:'visible'});assert.equal(await usage.locator('progress').count(),3);assert.match(await usage.innerText(),/200\.00 MXN/);assert.match(await usage.innerText(),/Los informes no consumen/);await usage.screenshot({path:path.join(folder,'chat-creditos.png')});
  await page.goto(base+'/orion?mode=blocked');await usage.getByRole('alert').waitFor();assert.match(await usage.getByRole('alert').innerText(),/Se recargan el/);
  await page.goto(base+'/orion?mode=server-blocked');const input=page.locator('#vaiInput');await input.waitFor();await page.waitForFunction(()=>!globalThis.document.querySelector('#vaiInput').disabled);await input.fill('Explica qué es un bono gubernamental');await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await page.locator('.vai-error').filter({hasText:'Tu cupo se recarga'}).waitFor({timeout:20000});assert.deepEqual(errors,[]);
  console.log('Chat UI: tres barras de saldo, recargas, informes excluidos y alerta del servidor al agotar créditos; sin IA ni cobros reales.');
 }catch(error){if(page)await page.screenshot({path:path.join(folder,'chat-error.png'),fullPage:true});throw error;}
 finally{await browser?.close();child.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
