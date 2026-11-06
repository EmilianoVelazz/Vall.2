import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {equitySessionReport} from '../shared/report-equity-session.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {reportOutline} from '../frontend/src/lib/reportOutline.js';
import {createReportDraft} from '../frontend/src/lib/reportCreation.js';
import {reportCsv} from '../frontend/src/lib/reportCsv.js';
const require=createRequire(import.meta.url);
const marketConfig=require('../shared/report-equity-markets.json');
process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-equity-session-test';
const {normalizeReport}=require('../backend/services/user-report-store');
const {reportExportContent}=require('../backend/lib/report-export-content');
const {_test}=require('../backend/routes/export');
const {loadEquityMarkets}=require('../backend/lib/report-equity-markets');
const names=[['S&P 500','América'],['Nasdaq','América'],['IPC México','América'],['Dow Jones','América'],['Brasil','América'],['Euro Stoxx','Europa'],['DAX','Europa'],['CAC','Europa'],['FTSE','Europa'],['Nikkei','Asia'],['Hang Seng','Asia'],['Shanghai','Asia'],['KOSPI','Asia'],['Australia','Asia'],['VIX','Volatilidad']];
const dates=Array.from({length:35},(_,index)=>new Date(Date.UTC(2026,8,15+index))).filter(date=>![0,6].includes(date.getUTCDay())).map(date=>date.toISOString().slice(0,10));
const quotes=names.map(([label,region],index)=>({label,region,symbol:label==='VIX' ? '^VIX' : 'FIXTURE'+index,series:dates.map((date,n)=>({date,value:(label==='VIX' ? 22 : 1000+index*120)+(index%2 ? -1 : 2)*n})),source:'Datos sintéticos'}));
const report={key:'equities',collection:'finance',title:'Bolsa · simulación de formato',generatedAt:'2026-10-19T22:00:00Z',summary:'SIMULACIÓN: cifras ficticias para revisar el diseño, sin cotizaciones actuales.',sections:[{heading:'Noticias del corte',text:'Ejemplo de contexto fechado de simulación. La coincidencia con un movimiento no demuestra su causa.'}],sourceSnapshot:{equities:quotes},metrics:[],tables:[],visuals:[],watchlist:['Revisar resultados y calendario de cada plaza.'],sources:['Datos sintéticos para comprobar el formato'],sourceLinks:[{label:'Fuente de simulación',url:'https://example.invalid/bolsa'}]};
const model=equitySessionReport(report);
assert.equal(model.references.length,15);assert.equal(model.results[0].rows.length,14);
assert.equal(model.visuals.length,4);assert(model.visuals.every(visual=>visual.reading));
assert.deepEqual(model.visuals.filter(visual=>visual.type==='line').map(visual=>visual.series.length),[5,4,5]);
assert(!model.visuals[0].bars.some(bar=>bar.label==='VIX'));
assert.equal(model.references[0].previous.date,'2026-10-16');
assert.equal(model.references[0].last.date,'2026-10-19');
assert.equal(model.references[0].change,(1048/1046-1)*100);
assert(model.visuals.filter(visual=>visual.type==='line').every(visual=>visual.series.every(series=>series.points[0].value===100 && series.points.length===2)));
assert.deepEqual(reportOutline(report).map(block=>block.key),['session','comparisons','charts','equityBusiness']);
assert(weeklyReport(report).equitySession);
assert.equal(model.blocks.find(item=>item.key==='sessionContext').label,'Causas y consecuencias');
for(const heading of ['Por qué pudo pasar','Cómo se transmite a las bolsas','Qué consecuencias puede tener','Qué falta confirmar']) assert(model.commentary.some(item=>item.heading===heading));
const explained=equitySessionReport({...report,sections:[{heading:'Noticias del corte',text:'La noticia del corte menciona tasas e inflación y resultados corporativos.'}]});
assert(explained.commentary.find(item=>item.heading==='Cómo se transmite a las bolsas').body.includes('descuentan las utilidades futuras'));
assert(explained.commentary.find(item=>item.heading==='Por qué pudo pasar').body.includes('no demuestra'));
assert(explained.commentary.find(item=>item.heading==='Qué consecuencias puede tener').body.includes('posiciones compradas'));
const unconfirmed=equitySessionReport({...report,sections:[]});assert(unconfirmed.commentary.find(item=>item.heading==='Por qué pudo pasar').body.includes('no incluye un hecho fechado'));
assert(!weeklyReport({...report,collection:'markets',key:'grains'}).equitySession,'Other reports keep their current model');
const early=equitySessionReport({...report,generatedAt:'2026-10-19T12:00:00Z',sourceSnapshot:{equities:[{label:'S&P 500',series:[{date:'2026-10-15',value:100},{date:'2026-10-16',value:101},{date:'2026-10-20',value:999}]}]}});
assert(early.coverage.includes('no contiene un cierre fechado hoy'));assert.equal(early.references[0].last.date,'2026-10-16');
const bad=equitySessionReport({...report,sourceSnapshot:{equities:[{label:'Inválido',series:[{date:'2026-02-31',value:7},{date:'2026-10-15',value:0},{date:'2026-10-16',value:100},{date:'2026-10-16',value:101},{date:'2026-10-19',value:-1}]}]}});
assert.equal(bad.references[0].points.length,0);assert.equal(bad.references[0].change,null);
const excluded=equitySessionReport({...report,personalization:{sections:{indicators:false,charts:false,tables:false,risks:false}}});
for(const field of ['metrics','visuals','results','followup']) assert.deepEqual(excluded[field],[]);
const draft=createReportDraft('finance',report),saved=normalizeReport(draft.report),savedModel=equitySessionReport(saved);
assert.equal(saved.equityObservations.length,15);assert.equal(savedModel.visuals.length,4);assert.equal(savedModel.references[0].previous.date,'2026-10-16');
assert.equal(_test.executivePayload(report).equityObservations.length,15);
const csv=reportCsv(report);assert(csv.includes('"S&P 500","América","2026-10-19","1048"'));assert(csv.includes('https://example.invalid/bolsa'));
const content=await reportExportContent(report);assert(content.includes('Qué pasó'));assert(content.includes('Implicaciones para el negocio'));assert(!content.includes('Ejemplo de contexto fechado'),'Undated source prose is not a verified catalyst');assert(!content.includes('undefined'));
assert(!content.includes('Causas y consecuencias'));assert(content.indexOf('Implicaciones para el negocio')>content.indexOf('Comparación visual por bloques'));
const {createReportTranslator}=require('../backend/services/report-translation');
const translator=createReportTranslator({provider:{isConfigured:()=>true,generate:async request=>{
  const input=JSON.parse(request.prompt);
  // Transport fixture: check protected observations and display mapping. It
  // does not pretend that prefixing Spanish prose is a valid translation.
  return {text:JSON.stringify({language:input.language,translations:input.translations.map(item=>({id:item.id,text:'Translated: observed market data '+(item.text.match(/__VNT_\w+_\d+_\d+__/g) || []).join(' ')}))})};
}}});
const localized=await translator.localize({report:_test.executivePayload(report),language:'en'});
const translatedModel=weeklyReport(localized.report);
assert(translatedModel.summary.startsWith('Translated: '));assert(translatedModel.summaryPanels.every(item=>item.body.startsWith('Translated: ')));
assert(translatedModel.visuals.every(item=>item.note.startsWith('Translated: ')));
assert.deepEqual(translatedModel.references[0].points,weeklyReport(report).references[0].points,'Translation leaves observed prices intact');
// The exchange map and report catalogue must cover the same venues.
const box={window:{}};vm.runInNewContext(await fs.readFile('assets/js/world-exchanges.js','utf8'),box);
const exchanges=Object.values(box.window.VN_WORLD_EXCHANGES).flatMap(country=>country.bolsas);
for(const exchange of exchanges) assert(marketConfig.markets.some(item=>item.id===exchange.mic),'Catálogo incluye '+exchange.sigla);
let active=0,peak=0;
const allQuotes=await loadEquityMarkets(async item=>{
  active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,1));active--;
  const index=marketConfig.markets.indexOf(item);
  return {...item,series:quotes[index%quotes.length].series,source:'Datos sintéticos'};
},{cutoff:report.generatedAt,concurrency:4});
assert(peak<=4);assert.equal(allQuotes.length,62);
const world={...report,equityCatalogVersion:1,sourceSnapshot:{equities:allQuotes},equityNews:[{title:'SIMULACIÓN: inflación y expectativas de tasas',description:'Este hecho ficticio comprueba el vínculo entre evidencia y explicación; no es una noticia real.',source:'Fuente de simulación',publishedAt:'2026-10-19T15:00:00Z',url:'https://example.invalid/evento'},{title:'NOTICIA FUTURA EXCLUIDA',publishedAt:'2026-10-20T12:00:00Z'},{title:'NOTICIA ANTIGUA EXCLUIDA',publishedAt:'2026-10-16T12:00:00Z'}]};
const full=equitySessionReport(world);
assert.equal(equitySessionReport({...world,dailyReferences:[{label:'Shanghai Composite',points:quotes[0].series},{label:'VIX',points:quotes[0].series}]}).references.length,62,'Las proyecciones antiguas no duplican índices ni VIX con otro nombre');
assert.equal(full.results[0].rows.length,61);assert(full.results[0].rows.some(row=>row[0].includes('BMV')));assert(full.results[0].rows.some(row=>row[0].includes('BIVA')));
assert(full.visuals.some(item=>item.title==='Bolsa de México'));
const chartLabels=new Set(full.visuals.filter(item=>item.type==='line').flatMap(item=>item.series.map(series=>series.label)));
for(const quote of allQuotes.filter(item=>item.symbol && item.kind==='equity')) assert(chartLabels.has(quote.label),'Se grafica '+quote.label);
assert(full.visuals.filter(item=>item.type==='line').every(item=>item.series.length<=6));
assert(full.commentary.some(item=>item.heading==='México: causas y repercusiones' && item.body.includes('$100,000 MXN')));
const explanation=full.commentary.find(item=>item.heading==='Por qué pudo pasar').body;
assert(explanation.includes('SIMULACIÓN: inflación'));assert(!explanation.includes('EXCLUIDA'));assert(explanation.includes('no se confirma causalidad'));
const unavailable=await loadEquityMarkets(async()=>{throw Error('Proveedor sin conexión');},{cutoff:report.generatedAt,previous:allQuotes});
assert.equal(unavailable.length,62);assert.equal(unavailable.find(item=>item.symbol==='^MXX').series.length,dates.length,'Una caída del proveedor conserva evidencia fechada');
const noQuotes=equitySessionReport({...world,sourceSnapshot:{equities:await loadEquityMarkets(async()=>{throw Error('Sin conexión');},{cutoff:report.generatedAt})}});
assert.equal(noQuotes.results[0].rows.length,61);assert.equal(noQuotes.visuals.length,0);assert.equal(noQuotes.metrics[0].value,'0');
assert(noQuotes.commentary.find(item=>item.heading==='México: causas y repercusiones').body.includes('No se interpreta la ausencia'));
const worldDraft=createReportDraft('finance',world),worldSaved=normalizeReport(worldDraft.report);
assert.equal(worldSaved.equityObservations.length,62);assert.equal(_test.executivePayload(world).equityObservations.length,62);
assert.equal(equitySessionReport(worldSaved).results[0].rows.length,61);assert.equal(worldSaved.equityNews.length,3);
const old=equitySessionReport({...report,sourceSnapshot:{equities:[{label:'S&P 500',series:[{date:'2026-09-01',value:100},{date:'2026-09-02',value:101}]}]}});
assert.equal(old.references[0].change,null);assert(old.results[0].rows[0].includes('Cierre antiguo'));
const bytes=await _test.makeExecutivePdf(world.title,_test.executivePayload(world));
const {getDocument}=await import('../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true}),pdf=await task.promise;
const historyPages=require('../backend/lib/report-equity-history-pdf').equityHistoryPages(weeklyReport(world).equityExecutive.globalHistory).length;
assert(pdf.numPages<=2+historyPages,'Dos páginas ejecutivas más el anexo visual que contiene todas las trayectorias');
let text='';
for(let n=1;n<=pdf.numPages;n++) {const page=await pdf.getPage(n),items=(await page.getTextContent()).items;text+=items.map(item=>item.str).join(' ')+'\n';for(const item of items.filter(item=>item.str.trim() && !item.str.startsWith('USO INTERNO') && !item.str.startsWith('PAGINA'))) assert(item.transform[5]>=55,'Contenido sobre el pie: '+item.str);}
assert(text.indexOf('Tabla maestra')<text.indexOf('Implicaciones para el negocio'));
for(const token of ['Tabla maestra','Día %','Mes %','YTD %','Implicaciones para el negocio','Nasdaq','2026-10-19']) assert(text.toLocaleLowerCase().includes(token.toLocaleLowerCase()),'PDF conserva '+token);
assert(!text.includes('CONTEXTO Y SEGUIMIENTO'));
assert(text.includes('Evolución de todas las bolsas'),'La historia global debe estar dentro del PDF descargado');
await task.destroy();
if(process.argv.includes('--preview')) {
  await fs.mkdir('output/pdf',{recursive:true});await fs.writeFile('output/pdf/bolsa-formato-sesion-muestra.pdf',bytes);
  await fs.mkdir('output/bolsa-sesion',{recursive:true});await fs.writeFile('output/bolsa-sesion/fixture.json',JSON.stringify(world));
}
if(process.argv.includes('--ui')) {
 const express=require('express'),{chromium}=require('playwright');const app=express();let server,browser;
 app.use(express.json());app.use('/api',(req,res)=>{
  if(req.path==='/verify-token') return res.json({success:true,email:'fixture@example.invalid'});
  if(req.path==='/profile') return res.json({success:true,profile:{email:'fixture@example.invalid',preferences:{}}});
  if(req.path.includes('finance-executive-reports')) return res.json({success:true,data:[world],generatedAt:world.generatedAt});
  if(req.path==='/report-export') return res.type('application/pdf').send(bytes);
  if(req.path==='/report-email/status') return res.json({success:true,mail:{configured:false}});
  return res.json({success:true,data:[],articles:[]});
 });app.use('/assets',express.static(path.resolve('assets')));app.use(express.static(path.resolve('frontend/dist')));app.use((req,res)=>res.sendFile(path.resolve('frontend/dist/index.html')));
 try {
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/informes`);await page.locator('#erh-document-session').waitFor();
  assert.equal(await page.locator('#erh-document-charts figure').count(),weeklyReport(world).visuals.length);
  assert(await page.locator('#erh-document-charts').evaluate(chart=>Boolean(chart.compareDocumentPosition(document.getElementById('erh-document-equityBusiness')) & Node.DOCUMENT_POSITION_FOLLOWING)),'Causas debajo de todas las gráficas');
  await fs.mkdir('output/bolsa-sesion',{recursive:true});await page.screenshot({path:'output/bolsa-sesion/escritorio.png',fullPage:true,animations:'disabled'});
  await page.getByRole('navigation',{name:'Índice del informe'}).getByRole('button',{name:/Implicaciones para el negocio/}).click();
  assert.equal(await page.locator('#erh-document-equityBusiness').getByRole('heading',{name:'Prioridad de seguimiento'}).count(),1);
  await page.screenshot({path:'output/bolsa-sesion/causas.png',fullPage:true,animations:'disabled'});
  await page.getByRole('navigation',{name:'Índice del informe'}).getByRole('button',{name:/Comparación visual por bloques/}).click();
  await page.screenshot({path:'output/bolsa-sesion/graficas.png',fullPage:true,animations:'disabled'});
  for(const width of [390,768]) {await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sin desbordamiento a '+width);}
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:'output/bolsa-sesion/movil.png',fullPage:true,animations:'disabled'});assert.deepEqual(errors,[]);
 } finally {await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
console.log('Bolsa sesión: OK · cierre contra sesión previa, fines de semana, fechas, datos inválidos, 3 regiones, VIX, lectura, exclusiones, guardado, CSV y PDF'+(process.argv.includes('--ui') ? ', escritorio y móvil' : ''));
