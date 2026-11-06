import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {weeklyReport} from '../shared/report-weekly.mjs';
const require=createRequire(import.meta.url),express=require('express'),{chromium}=require('playwright');
const reports={};for(const [area,file] of [['finance','finance_executive_reports.json'],['markets','market_executive_reports.json'],['mexico','mexico-executive-reports.json']])reports[area]=JSON.parse(await fs.readFile('backend/cache/'+file,'utf8')).reports;
const model=weeklyReport({...reports.markets.find(report=>report.key==='proteins'),collection:'markets'}),app=express();
let marketRequests=0,updatedCut=false;
const protein=reports.markets.find(report=>report.key==='proteins');
const legacyProtein={...protein,sessionObservations:undefined,dailyReferences:undefined,sources:['Yahoo Finance · serie diaria de futuros'],sourceLinks:[],tables:[],sourceSnapshot:{proteins:protein.sourceSnapshot.proteins.filter(item=>item.provider==='yahoo')}};
app.use('/api',(req,res)=>{
 if(req.path==='/verify-token')return res.json({success:true,email:'fixture@example.invalid'});
 if(req.path==='/profile')return res.json({success:true,profile:{email:'fixture@example.invalid',preferences:{}}});
 for(const [area,name] of [['finance','finance-executive-reports'],['markets','market-executive-reports'],['mexico','mexico-executive-reports']])if(req.path==='/'+name){if(area==='markets'){marketRequests++;return res.json({success:true,data:reports.markets.map(report=>report.key!=='proteins' ? report : marketRequests===1 ? legacyProtein : updatedCut ? {...report,title:report.title+' · corte actualizado'} : report)});}return res.json({success:true,data:reports[area]});}
 return res.json({success:true,data:[]});
});app.use('/assets',express.static(path.resolve('assets')));app.use(express.static(path.resolve('frontend/dist')));app.use((req,res)=>res.sendFile(path.resolve('frontend/dist/index.html')));
let server,browser;
try {
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.clock.install();
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());
 await page.goto(`http://127.0.0.1:${server.address().port}/informes`);
 await page.getByRole('tab',{name:/Mercados/}).click();await page.locator('.erh-book').filter({hasText:'Mercado de proteínas'}).click();
 const reader=page.locator('.erh-protein-reader'),sheets=reader.locator('.erh-protein-sheet');await sheets.first().waitFor();
 assert.equal(await sheets.locator('tbody tr').count(),4);
 assert.equal(await reader.locator('.erh-protein-source-coverage').count(),0);
 await page.getByRole('button',{name:'Actualizar datos',exact:true}).click();
 await sheets.filter({hasText:'Pollo congelado'}).waitFor();
 assert(!/Yahoo|Sina Finance|CEPEA|FranceAgriMer|DG AGRI|Mercolleida/.test(await reader.innerText()));assert.equal(await page.locator('.erh-document-header h2').innerText(),protein.title,'Actualizar conserva Proteínas como selección');
 // La hora del último refresco manual puede ser posterior al inicio del intervalo.
 // Adelanta Date antes de un solo tick; dos saltos consecutivos también adelantan
 // el timeout HTTP mientras la respuesta local todavía se está procesando.
 await page.locator('.erh-document').evaluate(node=>{node.scrollTop=1200;});
 const beforeRefresh=await page.locator('.erh-document').evaluate(node=>node.scrollTop);
 updatedCut=true;await page.clock.setSystemTime(new Date(await page.evaluate(()=>Date.now())+120000));await page.clock.fastForward(61000);
 console.log('Revalidación',JSON.stringify({marketRequests,state:await page.evaluate(()=>({time:Date.now(),visibility:document.visibilityState})),heading:await page.locator('.erh-document-header h2').innerText(),errors}));
 await page.getByRole('button',{name:'Abrir nuevo corte',exact:true}).waitFor();
 assert.equal(await page.locator('.erh-document').evaluate(node=>node.scrollTop),beforeRefresh,'La consulta no interrumpe la posición de lectura');
 assert.equal(await page.locator('.erh-document-header h2').innerText(),protein.title,'El corte nuevo espera la elección del lector');
 await page.getByRole('button',{name:'Abrir nuevo corte',exact:true}).click();
 await page.locator('.erh-document-header h2').filter({hasText:'corte actualizado'}).waitFor();
 assert(marketRequests>=3,'El corte se vuelve a consultar automáticamente');
 const countryCoverage=reader.locator('.erh-protein-country-coverage');assert.equal(await countryCoverage.locator('li').count(),8);
 for(const name of ['Estados Unidos','Canadá','México','Chile','Argentina','Colombia','Perú','Brasil'])assert.equal(await countryCoverage.getByText(name,{exact:true}).count(),1);
 assert(!(await countryCoverage.innerText()).includes('Sin precio reciente disponible'));
 await fs.mkdir('output/proteinas-boletin',{recursive:true});await reader.locator('.erh-session-opening').scrollIntoViewIfNeeded();await page.screenshot({path:'output/proteinas-boletin/informe-sin-fuentes.png'});
 assert.equal(await sheets.count(),7);assert.equal(await sheets.locator('tbody tr').count(),model.references.length);
 await page.getByLabel('Filtrar por país',{exact:true}).selectOption('Canadá');assert.equal(await sheets.locator('tbody tr').count(),1);
 await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();assert.equal(await sheets.locator('tbody tr').count(),model.references.length);
 assert.equal(await reader.locator('.erh-market-visual-grid>figure,.erh-market-visual-grid>.erh-visual-panel').count(),model.visuals.length);
 for(const name of ['Pollo','Huevo','Porcino','Vacuno','Pescado y acuicultura','Procesados y alternativas','Alimentación animal'])assert(await reader.getByRole('region',{name:'Tablilla · '+name,exact:true}).count()===1);
 const processed=sheets.filter({has:page.getByText('Procesados y alternativas',{exact:true})});
 assert.equal(await processed.locator('table').count(),2);assert.equal(await processed.locator('thead').filter({hasText:'Dif.'}).count(),0);
 const charts=reader.locator('.erh-protein-sheet-charts').last(),causes=reader.locator('.erh-block-sessionContext');assert(await charts.evaluate((node,other)=>Boolean(node.compareDocumentPosition(other)&Node.DOCUMENT_POSITION_FOLLOWING),await causes.elementHandle()));assert.equal(await sheets.filter({has:page.locator('.erh-protein-sheet-charts')}).count(),7);assert.equal(await reader.locator('.erh-protein-source-coverage').count(),0);assert(!/Yahoo|Sina Finance|CEPEA|FranceAgriMer|DG AGRI|Mercolleida/.test(await reader.innerText()));
 assert((await causes.innerText()).includes('ponedoras'));assert((await causes.innerText()).includes('Surimi'));
 await fs.mkdir('output/proteinas-boletin',{recursive:true});
 for(const width of [1440,1024,768,390,320]){
   await page.setViewportSize({width,height:1050});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Página sin desbordamiento a '+width);
   assert(await page.locator('.erh-document').evaluate(node=>node.scrollWidth<=node.clientWidth+1),'Lectura sin desbordamiento a '+width);
   const columns=await sheets.first().locator('.erh-protein-sheet-body').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length);
   assert.equal(columns,1,'Tablillas a todo el ancho, sin columna lateral vacía');
   if(width===1440){const dimensions=await sheets.first().evaluate(node=>({body:node.querySelector('.erh-protein-sheet-body').clientWidth,prices:node.querySelector('.erh-protein-prices').clientWidth}));assert(dimensions.prices>=dimensions.body-1,'Los precios aprovechan todo el ancho disponible');}
   if(width===1440 || width===390){
     await sheets.first().evaluate(node=>{const frame=node.closest('.erh-document');frame.scrollTop+=node.getBoundingClientRect().top-frame.getBoundingClientRect().top-18;});
     await page.locator('.erh-document-column').scrollIntoViewIfNeeded();await page.screenshot({path:`output/proteinas-boletin/pantalla-${width}.png`});
   }
 }
 await page.getByRole('tab',{name:/Finanzas/}).click();await page.locator('.erh-book').filter({hasText:'Bolsa'}).first().click();assert.equal(await page.locator('.erh-protein-reader').count(),0);
 assert.deepEqual(errors,[]);console.log('Boletín en pantalla: OK · siete familias, todas las referencias, físico/futuros y frecuencias, causas tras gráficas, 320–1440 px y otros informes intactos.');
}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
