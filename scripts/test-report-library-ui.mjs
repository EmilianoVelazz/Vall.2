import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {weeklyReport} from '../shared/report-weekly.mjs';
const require=createRequire(import.meta.url);process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-library-ui';
const express=require('express'),{chromium}=require('playwright'),{_test}=require('../backend/routes/export');
const library=JSON.parse(await fs.readFile('backend/cache/annual-report-library.json','utf8')),daily={};for(const [area,file] of [['finance','finance_executive_reports.json'],['markets','market_executive_reports.json'],['mexico','mexico-executive-reports.json']])daily[area]=JSON.parse(await fs.readFile('backend/cache/'+file,'utf8')).reports;
await fs.mkdir('tmp/pdfs',{recursive:true});await fs.mkdir('output/otros-informes',{recursive:true});const pdfs={};for(const [year,area,key] of [[2022,'finance','equities'],[2025,'markets','proteins'],[2024,'mexico','mx_production']]){const report=library.years[year].find(report=>report.collection===area && report.key===key);pdfs[key]=await _test.makeExecutivePdf(report.title,_test.executivePayload(report));await fs.writeFile(`tmp/pdfs/anual-${key}-${year}.pdf`,pdfs[key]);}
const app=express(),errors=[];let server,browser,pdfRequests=0,fail2024=true;
app.use(express.json({limit:'2mb'}));app.use('/api',(req,res)=>{
 if(req.path==='/verify-token')return res.json({success:true,email:'fixture@example.invalid'});
 if(req.path==='/profile')return res.json({success:true,profile:{email:'fixture@example.invalid',preferences:{}}});
 if(req.path==='/annual-reports'){const year=req.query.year;if(year==='2024' && fail2024){fail2024=false;return res.status(503).json({success:false,error:'Falla de prueba; vuelve a intentar.'});}return res.json({success:true,year:Number(year),data:library.years[year],generatedAt:library.generatedAt});}
 if(req.path==='/report-export'){assert.equal(req.body.executiveReport.periodType,'annual');assert.equal(req.body.executiveReport.reportYear,2025);assert.equal(req.body.executiveReport.key,'proteins');pdfRequests++;return res.type('application/pdf').set('Content-Language','es').send(pdfs.proteins);}
 for(const [area,endpoint] of [['finance','finance-executive-reports'],['markets','market-executive-reports'],['mexico','mexico-executive-reports']])if(req.path===('/'+endpoint))return res.json({success:true,data:daily[area]});
 return res.json({success:true,data:[],articles:[]});
});app.use('/assets',express.static(path.resolve('assets')));app.use(express.static(path.resolve('frontend/dist')));app.use((req,res)=>res.sendFile(path.resolve('frontend/dist/index.html')));
try{
 server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());await page.goto('http://127.0.0.1:'+server.address().port+'/informes');
 const navigation=page.getByRole('navigation',{name:'Secciones del centro de informes'});await navigation.getByRole('button',{name:/Librería/}).click();const archive=page.getByRole('region',{name:'Librería de informes anuales'});
 await archive.getByRole('heading',{name:/Informe anual 2025/,level:3}).waitFor();
 for(const year of [2022,2023,2024,2025]){
  await archive.getByRole('group',{name:'Año del informe'}).getByRole('button',{name:new RegExp(String(year))}).click();
  if(year===2024){await archive.getByRole('alert').filter({hasText:'Falla de prueba'}).waitFor();await archive.getByRole('button',{name:'Volver a intentar'}).click();}
  for(const [area,label] of [['finance','Finanzas'],['markets','Mercados'],['mexico','México']]){
   await archive.getByRole('group',{name:'Familia de la librería anual'}).getByRole('button',{name:new RegExp(label)}).click();
   for(const report of library.years[year].filter(report=>report.collection===area)){
    await archive.locator('.reports-archive-book').filter({hasText:report.title.split(' · Informe anual')[0]}).click();
    await archive.locator('.reports-archive-document>header h3').getByText(report.title,{exact:true}).waitFor();const model=weeklyReport(report);assert.equal(await archive.locator('.erh-market-visual-grid>figure,.erh-market-visual-grid>.erh-visual-panel').count(),model.visuals.length);
    assert((await archive.locator('#annual-document-session').innerText()).includes('01-01-'+year));
    const chart=archive.locator('#annual-document-charts'),causes=archive.locator('#annual-document-sessionContext');if(await chart.count())assert(await chart.evaluate((node,other)=>Boolean(node.compareDocumentPosition(other)&Node.DOCUMENT_POSITION_FOLLOWING),await causes.elementHandle()));
   }
  }
 }
 // Re-enter a specific edition and keep its year/report when opening annexes.
 await archive.getByRole('group',{name:'Familia de la librería anual'}).getByRole('button',{name:/Mercados/}).click();await archive.locator('.reports-archive-book').filter({hasText:'Mercado de proteínas'}).click();await archive.locator('.reports-archive-document>header h3').getByText('Mercado de proteínas · Informe anual 2025',{exact:true}).waitFor();
 await archive.locator('.reports-search input').fill('proteínas');assert.equal(await archive.locator('.reports-archive-book').count(),1);await archive.locator('.reports-search input').fill('');
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sin desbordamiento a '+width);}
 await page.setViewportSize({width:1440,height:1000});await archive.scrollIntoViewIfNeeded();await page.screenshot({path:'output/otros-informes/libreria-anual-desktop.png'});
 const download=page.waitForEvent('download');await archive.getByRole('button',{name:'Descargar PDF',exact:true}).click();assert((await download).suggestedFilename().includes('2025.pdf'));assert.equal(pdfRequests,1);
 await archive.getByRole('button',{name:'Ver anexos',exact:true}).click();const annex=page.getByRole('region',{name:'Anexos de los informes'});await annex.locator('.reports-annex-title h3').getByText('Mercado de proteínas · Informe anual 2025',{exact:true}).waitFor();assert.equal(await annex.getByLabel('Edición',{exact:true}).inputValue(),'2025');assert.equal(await annex.getByLabel('Familia',{exact:true}).inputValue(),'markets');assert.equal(await annex.getByLabel('Informe',{exact:true}).inputValue(),'proteins');assert(await annex.locator('.reports-source-list a').count()>0);assert(await annex.locator('.reports-method-grid article').count()>=5);assert(await annex.locator('.reports-annex-table tbody tr').count()>0);
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Anexos sin desbordamiento a '+width);}
 await annex.scrollIntoViewIfNeeded();await page.screenshot({path:'output/otros-informes/anexos-anual-movil.png'});
 await annex.getByRole('button',{name:'Ir a la librería anual'}).click();await archive.locator('.reports-archive-document>header h3').getByText('Mercado de proteínas · Informe anual 2025',{exact:true}).waitFor();
 await navigation.getByRole('button',{name:/Informes diarios/}).click();await page.getByRole('tab',{name:/Mercados/}).click();await page.locator('.erh-book').filter({hasText:'Mercado de proteínas'}).click();await page.locator('.erh-document-header h2').getByText('Mercado de proteínas',{exact:true}).waitFor();assert(!(await page.locator('#erh-document-session').innerText()).includes('Periodo anual'));
 assert.deepEqual(errors,[]);console.log('Pantalla: OK · 56 ediciones, 4 años, 3 familias, anexos, búsqueda, fallo/reintento, PDF, navegación y 390/768/1440 px; informes diarios conservados.');
}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
