import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {bondSessionReport} from '../shared/report-bond-session.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {reportOutline} from '../frontend/src/lib/reportOutline.js';
import {createReportDraft} from '../frontend/src/lib/reportCreation.js';
import {reportCsv} from '../frontend/src/lib/reportCsv.js';
const require=createRequire(import.meta.url);
process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-bond-test';
const {config,loadBondMarkets,parseTreasuryXml,parseBanxicoSeries}=require('../backend/lib/report-bond-markets');
const {normalizeReport}=require('../backend/services/user-report-store');
const {reportExportContent}=require('../backend/lib/report-export-content');
const {_test}=require('../backend/routes/export');
const cutoff='2026-10-19T22:00:00Z';
const usDates=Array.from({length:35},(_,index)=>new Date(Date.UTC(2026,8,15+index))).filter(date=>![0,6].includes(date.getUTCDay())).map(date=>date.toISOString().slice(0,10));
const mxDates=['2026-09-17','2026-09-24','2026-10-01','2026-10-08','2026-10-15'];
const quotes=config.markets.map((item,index)=>({...item,series:(item.cadence==='auction' ? mxDates : usDates).map((date,n)=>({date,value:(item.currency==='MXN' ? 7 : 3.5)+item.tenorYears*.02+n*(index%2 ? -.005 : .01)}))}));
const report={key:'bonds',collection:'finance',title:'Bonos · simulación de formato',generatedAt:cutoff,bondSchemaVersion:1,summary:'DATOS FICTICIOS para revisar la presentación; no son rendimientos actuales.',sourceSnapshot:{bonds:quotes},bondNews:[{title:'SIMULACIÓN: inflación y expectativas de tasas',description:'Hecho ficticio que permite revisar la explicación y su fecha.',source:'Fuente de simulación',publishedAt:'2026-10-19T15:00:00Z',url:'https://example.invalid/noticia'},{title:'FUTURA EXCLUIDA',publishedAt:'2026-10-20T12:00:00Z'}],metrics:[],tables:[],visuals:[],sections:[],watchlist:['Contrastar calendario de Banxico y subastas.'],sources:['Datos sintéticos'],sourceLinks:[{label:'Fuente de simulación',url:'https://example.invalid/bonos'}]};
// Preserve the raw session compatibility contract; the public executive
// composition is covered by test-report-bond-executive.mjs.
const before=JSON.stringify(report),model=bondSessionReport(report);
assert(model.bondSession && model.sessionReport);assert.equal(model.references.length,17);assert.equal(model.results[0].rows.length,17);
assert.deepEqual(reportOutline(report).map(item=>item.key),['session','comparisons','charts','bondBusiness']);
assert.equal(model.visuals.filter(item=>item.yieldCurve).length,2);assert(model.visuals.every(item=>item.reading));assert(!model.visuals.some(item=>item.title==='Cambio de rendimiento · México'),'Una subasta no se compara como sesión diaria');
assert(model.visuals.filter(item=>item.type==='line' && !item.yieldCurve).every(item=>item.unit==='%' && item.series.length<=6));
const us=model.references.find(item=>item.id==='UST-10Y'),mx=model.references.find(item=>item.id==='SF43936');
assert.equal(us.previous.date,'2026-10-16');assert.equal(us.last.date,'2026-10-19');assert.equal(mx.previous.date,'2026-10-08');assert.equal(mx.last.date,'2026-10-15');
assert.equal(model.curve.date,'2026-10-19');assert(model.results[0].rows.filter(row=>row[0].startsWith('CETES')).every(row=>row.at(-1).includes('sin variación diaria')));
assert(model.commentary.find(item=>item.heading==='Por qué pudo pasar').body.includes('SIMULACIÓN: inflación'));assert(!model.commentary.find(item=>item.heading==='Por qué pudo pasar').body.includes('FUTURA'));
assert(model.commentary.find(item=>item.heading==='Qué consecuencias puede tener').body.includes('duración modificada de 5'));
assert.equal(JSON.stringify(report),before);
const laterNews=bondSessionReport({...report,sourceSnapshot:{bonds:quotes.map(item=>({...item,series:item.series.filter(point=>point.date<='2026-10-16')}))}});assert(laterNews.commentary.find(item=>item.heading==='Por qué pudo pasar').body.includes('no explican retroactivamente'),'Una noticia del lunes no explica el rendimiento del viernes');
const small=items=>bondSessionReport({...report,sourceSnapshot:{bonds:items}});
const move=small([{label:'Tasa de prueba',series:[{date:'2026-10-16',value:4},{date:'2026-10-19',value:4.5}]}]);assert.equal(move.references[0].changeBp,50);assert(move.results[0].rows[0].includes('+50 pb'));
const negative=small([{label:'Tasa negativa',series:[{date:'2026-10-16',value:0},{date:'2026-10-19',value:-.1}]}]);assert.equal(negative.references[0].changeBp,-10);assert.equal(negative.references[0].last.value,-.1);
const invalid=small([{label:'Inválido',series:[{date:'2026-02-31',value:5},{date:'2026-10-16',value:4},{date:'2026-10-16',value:5},{date:'2026-10-20',value:99}]}]);assert.equal(invalid.references[0].points.length,0);
const mixed=small(quotes.map(item=>item.id==='UST-3M' ? {...item,basis:'bank-discount'} : item));assert.equal(mixed.curve,null,'No mezclar descuento bancario y rendimiento par');
const stale=small([{...quotes[5],series:[{date:'2026-08-01',value:4},{date:'2026-08-03',value:4.5}]}]);assert.equal(stale.references[0].changeBp,null);assert.equal(stale.visuals.length,0);
const expiredCurve=small(quotes.filter(item=>['UST-3M','UST-10Y'].includes(item.id)).map(item=>({...item,series:[{date:'2026-09-01',value:4},{date:'2026-09-02',value:4.5}]})));assert.equal(expiredCurve.curve,null);
const hidden=bondSessionReport({...report,personalization:{sections:{indicators:false,charts:false,tables:false,risks:false}}});for(const key of ['metrics','visuals','results','followup']) assert.deepEqual(hidden[key],[]);
const saved=normalizeReport(createReportDraft('finance',report).report),payload=_test.executivePayload(report);
assert.equal(saved.bondObservations.length,17);assert.equal(payload.bondObservations.length,17);assert.equal(weeklyReport(saved).references.length,17);assert.equal(weeklyReport(saved).curve.current,model.curve.current);
assert.equal(weeklyReport(_test.executivePayload({...report,sourceSnapshot:{bonds:[{label:'Cero legítimo',series:[{date:'2026-10-16',value:0},{date:'2026-10-19',value:0}]}]}})).references[0].changeBp,0);
const csv=reportCsv(report);assert(csv.includes('"Nivel observado"'));assert(weeklyReport(report).references.filter(item=>item.cadence==='auction').every(item=>item.periods.day===null));assert(csv.includes('2026-10-15'));assert(csv.includes('Día · pb'));
const content=await reportExportContent(report);assert(content.includes('Curva soberana'));assert(content.includes('Implicaciones para el negocio'));assert(!content.includes('posición hipotética'));
const xml='<feed xmlns:d="urn:data">'+['2026-10-16','2026-10-19','2026-10-20'].map((date,index)=>'<entry><content><d:NEW_DATE>'+date+'T00:00:00</d:NEW_DATE>'+config.markets.filter(item=>item.field).map(item=>'<d:'+item.field+'>'+(4+index*.1)+'</d:'+item.field+'>').join('')+'</content></entry>').join('')+'</feed>';
const banxico={bmx:{series:config.markets.filter(item=>item.seriesId).map(item=>({idSerie:item.seriesId,titulo:'Cetes a '+item.maturity.slice(0,-1)+' días Tasa de rendimiento',datos:[{fecha:'08/10/2026',dato:'7.00'},{fecha:'15/10/2026',dato:'7.10'},{fecha:'22/10/2026',dato:'99'},{fecha:'32/10/2026',dato:'99'},{fecha:'14/10/2026',dato:'N/E'}]}))}};
assert.equal(parseTreasuryXml(xml,cutoff)[0].series.length,2);assert.equal(parseBanxicoSeries(banxico,cutoff)[0].series.length,2);
const wrong=structuredClone(banxico);wrong.bmx.series[0].titulo='TIIE 28 días';assert.equal(parseBanxicoSeries(wrong,cutoff)[0].series.length,0);
let fetched=0;const treasuryYears=[];const loaded=await loadBondMarkets({cutoff,token:'mock-token',includeContext:false,get:async url=>{fetched++;if(url.includes('treasury.gov'))treasuryYears.push(Number(new URL(url).searchParams.get('field_tdr_date_value')));return url.includes('treasury.gov') ? {ok:true,text:async()=>xml} : {ok:true,json:async()=>banxico};}});
assert.equal(fetched,10);assert.equal(loaded.length,17);assert(loaded.every(item=>item.series.length===2));
assert.deepEqual(treasuryYears.sort(),[2020,2021,2022,2023,2024,2025,2026]);
await assert.rejects(()=>loadBondMarkets({cutoff:'9999-01-01',includeContext:false,get:async()=>{throw Error('No network expected');}}),/corte histórico/);
const unavailable=await loadBondMarkets({cutoff,token:'',includeContext:false,previous:loaded,get:async()=>{throw Error('offline');}});assert(unavailable.every(item=>item.series.length===2),'Conservar publicaciones anteriores si falla la fuente');
const empty=await loadBondMarkets({cutoff,token:'',includeContext:false,get:async()=>{throw Error('offline');}});assert.equal(empty.length,17);assert(empty.every(item=>!item.series.length));
const {createReportTranslator}=require('../backend/services/report-translation');
const translator=createReportTranslator({provider:{isConfigured:()=>true,generate:async request=>{const input=JSON.parse(request.prompt);return {text:JSON.stringify({language:input.language,translations:input.translations.map(item=>({id:item.id,text:'Translated: observed bond market data '+(item.text.match(/__VNT_\w+_\d+_\d+__/g) || []).join(' ')}))})};}}});
const localized=await translator.localize({report:payload,language:'en'}),translated=weeklyReport(localized.report);assert(translated.summary.startsWith('Translated: '));assert(translated.commentary.some(item=>item.body.startsWith('Translated: ')));assert.equal(translated.curve.current,model.curve.current);
const bytes=await _test.makeExecutivePdf(report.title,payload),{getDocument}=await import('../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true}),pdf=await task.promise;assert(pdf.numPages<=8);let text='';
for(let i=1;i<=pdf.numPages;i++){const items=(await(await pdf.getPage(i)).getTextContent()).items;text+=items.map(item=>item.str).join(' ')+'\n';for(const item of items.filter(item=>item.str.trim() && !/^(USO INTERNO|PAGINA)/.test(item.str))) assert(item.transform[5]>=55,'Separado del pie: '+item.str);}
assert(pdf.numPages<=2);assert(text.includes('Curva soberana'));assert(text.includes('CETES'));assert(text.includes('Implicaciones para el negocio'));assert(text.includes('Día'));await task.destroy();
if(process.argv.includes('--preview')) {await fs.mkdir('output/pdf',{recursive:true});await fs.writeFile('output/pdf/bonos-formato-sesion-muestra.pdf',bytes);}
if(process.argv.includes('--ui')) {
 const express=require('express'),{chromium}=require('playwright'),app=express();let server,browser;
 app.use('/api',(req,res)=>{if(req.path==='/verify-token') return res.json({success:true,email:'fixture@example.invalid'});if(req.path==='/profile') return res.json({success:true,profile:{email:'fixture@example.invalid',preferences:{}}});if(req.path.includes('finance-executive-reports')) return res.json({success:true,data:[report],generatedAt:cutoff});return res.json({success:true,data:[],articles:[]});});app.use('/assets',express.static(path.resolve('assets')));app.use(express.static(path.resolve('frontend/dist')));app.use((req,res)=>res.sendFile(path.resolve('frontend/dist/index.html')));
 try {server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());await page.goto('http://127.0.0.1:'+server.address().port+'/informes');await page.locator('#erh-document-session').waitFor();
  assert.equal(await page.locator('.erh-yield-curve').count(),2);assert.equal(await page.locator('.erh-session-chart-reading').count(),model.visuals.length);assert(await page.locator('#erh-document-charts').evaluate(node=>Boolean(node.compareDocumentPosition(document.getElementById('erh-document-sessionContext')) & Node.DOCUMENT_POSITION_FOLLOWING)));
  await fs.mkdir('output/bonos-sesion',{recursive:true});await page.getByRole('navigation',{name:'Índice del informe'}).getByRole('button',{name:/Gráficas y lectura/}).click();await page.screenshot({path:'output/bonos-sesion/graficas.png',fullPage:true,animations:'disabled'});
  await page.getByRole('navigation',{name:'Índice del informe'}).getByRole('button',{name:/Causas y consecuencias/}).click();await page.screenshot({path:'output/bonos-sesion/causas.png',fullPage:true,animations:'disabled'});
  for(const width of [390,768]) {await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sin desbordamiento en '+width);}await page.screenshot({path:'output/bonos-sesion/movil.png',fullPage:true,animations:'disabled'});assert.deepEqual(errors,[]);
 } finally {await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
console.log('Bonos: OK · 17 referencias, puntos base, cero y tasas negativas, fechas y subastas, curva homogénea, causas, guardado, CSV, traducción y PDF'+(process.argv.includes('--ui') ? ', escritorio y móvil' : ''));
