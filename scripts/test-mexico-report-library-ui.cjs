'use strict';
/* global document */
// Read-only UI verification of the current public cut on an isolated server.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const express=require('express');
const {chromium}=require('playwright');
process.env.NODE_ENV='test';
const {createMexicoReportsRouter}=require('../backend/routes/mexico-reports');
const {createReportTranslator}=require('../backend/services/report-translation');
const labels=require('../shared/report-languages.json');
const letters=id=>id<26 ? String.fromCharCode(97+id) : letters(Math.floor(id/26)-1)+letters(id%26);
const translator=createReportTranslator({provider:{isConfigured:()=>true,generate:async request=>{const data=JSON.parse(request.prompt);return {text:JSON.stringify({language:data.language,translations:data.translations.map(item=>({id:item.id,text:'Translated passage '+letters(item.id)+' '+(item.text.match(/__VNT_\w+_\d+_\d+__/g)||[]).join(' ')}))})};}}});
async function main(){
 const snapshot=JSON.parse(await fs.readFile('backend/cache/mexico-executive-reports.json','utf8')),app=express();let browser,server;
 app.use(express.json({limit:'7mb'}));
 app.use('/api',createMexicoReportsRouter({service:{get:async()=>snapshot},authenticate:(req,res,next)=>next()}));
 app.post('/api/report-localize',async(req,res)=>{try{const value=await translator.localize({report:req.body.executiveReport,title:req.body.title,language:req.body.language},{owner:'fixture@example.invalid'});res.json({success:true,accountEmail:'fixture@example.invalid',language:value.language,report:value.report});}catch(error){res.status(502).json({success:false,error:error.message});}});
 app.use('/api',(req,res)=>{if(req.path==='/verify-token')return res.json({success:true,email:'fixture@example.invalid'});if(req.path==='/profile')return res.json({success:true,profile:{email:'fixture@example.invalid',preferences:{}}});return res.json({success:true,data:[]});});
 app.use('/assets',express.static(path.resolve('assets')));app.use(express.static(path.resolve('frontend/dist')));app.use((req,res)=>res.sendFile(path.resolve('frontend/dist/index.html')));
 try{
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const origin='http://127.0.0.1:'+server.address().port;
  const response=await fetch(origin+'/api/mexico-executive-reports');assert.equal(response.status,200);assert.equal((await response.json()).data.length,4);
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  for(const language of ['es','en']){
   await page.goto(origin+'/informes');await page.evaluate(language=>localStorage.setItem('vn_lang',JSON.stringify({lang:language})),language);await page.reload();
   await page.getByRole('tab',{name:language==='es'?/México/:/Mexico/}).click();await page.waitForFunction(()=>document.querySelectorAll('.erh-book').length===4);
   for(const report of snapshot.reports){
    const title=language==='es'?report.title:labels.labels[report.title][0];await page.locator('.erh-book').filter({hasText:title}).click();await page.locator('.erh-document-header h2').filter({hasText:title}).waitFor();
    assert(await page.locator('.erh-document table tbody tr').count()>0);const text=await page.locator('.erh-document').innerText();
    assert(!/\b(?:daily|weekly|monthly|annual|weekly-ai)\b/.test(text),'Sin códigos internos de frecuencia en '+language);
    if(language==='en')assert(!/\b(?:El corte|La comparación|Las referencias|al alza|por entidad|sin cambio|Causas y consecuencias|Lectura del mercado)\b/.test(text),'Sin frases españolas en '+report.key);
    console.log(language+' / '+report.key+': visible, con tablas y datos');
   }
   await fs.mkdir('output/informes-mexico',{recursive:true});await page.screenshot({path:'output/informes-mexico/catalogo-restaurado-'+language+'.png'});
  }
  assert.deepEqual(errors,[]);console.log('México: ruta y cuatro informes actuales visibles; traducción nativa sin Google.');
 }finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
