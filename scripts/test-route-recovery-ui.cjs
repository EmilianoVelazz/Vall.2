'use strict';
/* global window */
// Browser regression: failed route modules must recover once, without reload loops.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),express=require('express'),{chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),output=path.join(root,'output/pruebas-recuperacion-rutas');await fs.mkdir(output,{recursive:true});
 const library=JSON.parse(await fs.readFile(path.join(root,'backend/cache/finance_executive_reports.json'),'utf8')),email='route-recovery@example.invalid',checks=[];
 const app=express();app.use('/api',(req,res)=>{
  if(req.path==='/verify-token')return res.json({success:true,email});
  if(req.path==='/profile')return res.json({success:true,profile:{email,preferences:{}}});
  if(req.path==='/finance-executive-reports')return res.json({success:true,data:library.reports,generatedAt:library.generatedAt});
  if(req.path==='/report-export')return res.status(503).json({success:false,error:'Exportación fuera del alcance de esta prueba.'});
  return res.json({success:true,data:[],articles:[],accountEmail:email});
 });app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
 let server,browser;
 try{
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});browser=await chromium.launch({headless:true});
  for(const mode of ['temporary','persistent','render','offline','storage-blocked']){
   const context=await browser.newContext();const page=await context.newPage();let documents=0,modules=0,manualRecovery=false;
   page.on('request',request=>{if(request.isNavigationRequest() && request.frame()===page.mainFrame())documents++;});
   await page.route('https://**/*',route=>route.abort());
   if(mode==='offline')await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
   if(mode==='storage-blocked')await page.addInitScript(()=>Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('Blocked','SecurityError');}}));
   await page.route('**/vn-app/Informes-*.js',route=>{
    modules++;
    if(mode==='render')return route.fulfill({contentType:'text/javascript',body:'export default function Broken(){throw new Error("Fixture de error al mostrar la sección");}'});
    if(!manualRecovery && (mode!=='temporary' || modules===1))return route.abort('failed');
    return route.continue();
   });
   await page.goto('http://127.0.0.1:'+server.address().port+'/informes?revision=carga');
   if(mode==='temporary'){
    await page.locator('.erh-book').first().waitFor({timeout:30000});assert.equal(documents,2);assert.equal(modules,2);
    assert.equal(await page.getByText('No pudimos cargar esta sección.',{exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('vn_user')),email,'La recuperación conserva la sesión');
   }else{
    await page.getByText('No pudimos cargar esta sección.',{exact:true}).waitFor();
    if(mode==='persistent'){
     await page.waitForFunction(()=>performance.getEntriesByType('navigation')[0]?.type==='reload');
     await page.getByText('No pudimos cargar esta sección.',{exact:true}).waitFor();
    }
    // Una tercera recarga automática sería un bucle; los errores de render,
    // el modo sin conexión y el almacenamiento bloqueado no deben recargar.
    await page.waitForTimeout(750);assert.equal(documents,mode==='persistent'?2:1);assert.equal(modules,documents);
    const message=await page.locator('main[role=alert] p').innerText();assert(!message.includes('Comprueba tu conexión'));
    assert(message.includes(mode==='render'?'al mostrar':'completar la carga'));
    if(mode!=='render'){
     manualRecovery=true;await page.getByRole('button',{name:'Recargar página',exact:true}).click();await page.locator('.erh-book').first().waitFor({timeout:30000});
    }
   }
   assert.equal(new URL(page.url()).search,'?revision=carga');await page.screenshot({path:path.join(output,mode+'.png'),fullPage:true});
   checks.push({mode,documents,modules,passed:true});console.log('PASS '+mode);await context.close();
  }
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,syntheticProfile:true},null,2));
 }finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
})().catch(error=>{console.error(error);process.exitCode=1;});
