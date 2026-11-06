import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),express=require('express'),{chromium}=require('playwright');
const {createMexicoReportsRouter}=require('../backend/routes/mexico-reports');
const {mexicoReports}=require('../backend/services/mexico-executive-reports');
const app=express();let queries=0;
app.use('/api',createMexicoReportsRouter({service:{get:async()=>{queries++;return mexicoReports.get();}},authenticate:(req,res,next)=>next()}));
app.use('/api',(req,res)=>{
 if(req.path==='/verify-token')return res.json({success:true,email:'fixture@example.invalid'});
 if(req.path==='/profile')return res.json({success:true,profile:{email:'fixture@example.invalid',preferences:{}}});
 if(req.path.includes('executive-reports'))return res.json({success:true,data:[{key:'base',title:'Base de prueba',summary:'Resumen de prueba'}]});
 return res.json({success:true,data:[]});
});app.use('/assets',express.static(path.resolve('assets')));app.use(express.static(path.resolve('frontend/dist')));app.use((req,res)=>res.sendFile(path.resolve('frontend/dist/index.html')));
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE_ERROR',e.stack);});
 page.on('response',async r=>{if(r.url().includes('mexico-executive'))console.log('MEXICO_RESPONSE',r.status());});
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('http://127.0.0.1:'+server.address().port+'/informes');
 await page.getByRole('searchbox',{name:'Buscar informe',exact:true}).fill('Base de prueba');
 await page.getByRole('tab',{name:/México/}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.erh-book').length===4,{},{timeout:25000});
 console.log('MEXICO_BOOKS',await page.locator('.erh-book').allTextContents());
 for(const title of ['Panorama nacional de México','Bolsa México y tipo de cambio','Proteínas en México por estado','Producción estatal: granos y minería']){
  await page.locator('.erh-book').filter({hasText:title}).click();await page.locator('.erh-reader').waitFor();assert((await page.locator('.erh-document').innerText()).includes(title));
 }
 assert.equal(queries,1);assert.deepEqual(errors,[]);console.log('México real: OK · consulta y lectura de los cuatro informes del corte guardado.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
