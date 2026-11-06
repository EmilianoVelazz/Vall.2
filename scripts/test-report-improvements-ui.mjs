import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);process.env.NODE_ENV='test';
const express=require('express'),{chromium}=require('playwright');
const {createReportTranslator}=require('../backend/services/report-translation');
const {createReportHistoryStore}=require('../backend/services/report-history-store');
const {createReportHistoryRouter}=require('../backend/routes/report-history');
const reports={};for(const [area,file] of [['finance','finance_executive_reports.json'],['markets','market_executive_reports.json'],['mexico','mexico-executive-reports.json']])reports[area]=JSON.parse(await fs.readFile('backend/cache/'+file,'utf8')).reports;
const library=JSON.parse(await fs.readFile('backend/cache/annual-report-library.json','utf8'));
const letters=id=>id<26?String.fromCharCode(97+id):letters(Math.floor(id/26)-1)+letters(id%26);
const translator=createReportTranslator({provider:{isConfigured:()=>true,generate:async request=>{const data=JSON.parse(request.prompt);return {text:JSON.stringify({language:data.language,translations:data.translations.map(item=>({id:item.id,text:'English passage '+letters(item.id)+' '+(item.text.match(/__VNT_\w+_\d+_\d+__/g)||[]).join(' ')}))})};}}});
const app=express(),directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-improvements-ui-')),history=createReportHistoryStore({directory});
const protein={...reports.markets.find(report=>report.key==='proteins'),collection:'markets'};await history.archive([protein],'markets');
let marketRequests=0;const exportRequests=[];let server,browser;
app.use(express.json({limit:'7mb'}));
app.use('/api',createReportHistoryRouter({store:history,authenticate:(req,res,next)=>next()}));
app.post('/api/report-localize',async(req,res)=>{try{const value=await translator.localize({report:req.body.executiveReport,title:req.body.title,language:req.body.language},{owner:'fixture@example.invalid'});res.json({success:true,accountEmail:'fixture@example.invalid',language:value.language,report:value.report});}catch(error){res.status(502).json({success:false,error:error.message});}});
app.use('/api',(req,res)=>{
 if(req.path==='/verify-token')return res.json({success:true,email:'fixture@example.invalid'});
 if(req.path==='/profile')return res.json({success:true,profile:{email:'fixture@example.invalid',preferences:{}}});
 if(req.path==='/annual-reports')return res.json({success:true,year:Number(req.query.year),data:library.years[req.query.year],generatedAt:library.generatedAt});
 if(req.path==='/report-export'){exportRequests.push(req.body);return res.type('text/csv').set('Content-Language',req.body.language).send('Year,Value\n2025,123');}
 for(const [area,endpoint] of [['finance','finance-executive-reports'],['markets','market-executive-reports'],['mexico','mexico-executive-reports']])if(req.path==='/'+endpoint){if(area==='markets')marketRequests++;return res.json({success:true,data:reports[area]});}
 return res.json({success:true,data:[]});
});app.use('/assets',express.static(path.resolve('assets')));app.use(express.static(path.resolve('frontend/dist')));app.use((req,res)=>res.sendFile(path.resolve('frontend/dist/index.html')));
try{
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce',acceptDownloads:true}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto('http://127.0.0.1:'+server.address().port+'/informes');
 await page.getByRole('tab',{name:/Mercados/}).click();await page.locator('.erh-book').filter({hasText:'Mercado de proteínas'}).click();await page.locator('.erh-protein-sheets').waitFor();
 assert(await page.locator('.erh-book .erh-data-health').count()>0,'Estado del dato en la biblioteca');
 const count=marketRequests;await page.locator('.erh-workbar-actions').getByRole('button',{name:'Ver anexos',exact:true}).click();
 const annex=page.locator('.reports-annexes');await annex.getByText('Anexos de la edición seleccionada',{exact:false}).waitFor();assert.equal(marketRequests,count,'Los anexos no sustituyen el corte seleccionado con otra consulta');assert((await annex.innerText()).includes(protein.generatedAt.slice(0,10)));
 const nav=page.locator('.reports-page-nav');await nav.getByRole('button',{name:/Historial diario/}).click();const historical=page.locator('.reports-archive').filter({has:page.getByRole('heading',{name:'Historial diario',exact:true})});
 await historical.locator('.reports-archive-book').first().click();await historical.locator('.reports-archive-document>header h3').waitFor();assert((await historical.locator('.reports-archive-document').innerText()).includes(protein.generatedAt.slice(0,4)));
 await page.evaluate(()=>localStorage.setItem('vn_lang',JSON.stringify({lang:'en'})));await page.reload();await page.locator('.reports-page-nav').getByRole('button',{name:/^Library/}).click();
 const annual=page.locator('.reports-archive').filter({has:page.getByRole('heading',{name:'Annual library',exact:true})});await annual.locator('.reports-archive-paper .erh-reader').waitFor();
 assert(!/Resumen anual|Indicadores del año|Causas y consecuencias del año/.test(await annual.locator('.reports-archive-paper').innerText()));
 const download=page.waitForEvent('download');await annual.getByRole('button',{name:'Download CSV data',exact:true}).click();await download;assert.equal(exportRequests.at(-1).language,'en');assert.equal(exportRequests.at(-1).executiveReport.reportYear,2025);
 await annual.getByRole('button',{name:'View annexes',exact:true}).click();await page.locator('.reports-annexes .reports-method-grid').waitFor();
 assert(!/Informe diario|Las comparaciones|Se conservan|Los movimientos observados/.test(await page.locator('.reports-annexes .reports-method-grid').innerText()),'Metodología en el idioma elegido');
 await fs.mkdir('output/mejoras-informes',{recursive:true});await page.screenshot({path:'output/mejoras-informes/anexos-ingles.png'});
 for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:1050});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sin desbordamiento: '+width);}
 await page.screenshot({path:'output/mejoras-informes/anexos-movil.png'});assert.deepEqual(errors,[]);
 console.log('Interfaz: OK · estados, anexos del mismo corte, historial, anuales y CSV en inglés, metodología traducida y 320–1440 px.');
}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}assert(path.basename(directory).startsWith('vall-improvements-ui-'));await fs.rm(directory,{recursive:true,force:true});}
