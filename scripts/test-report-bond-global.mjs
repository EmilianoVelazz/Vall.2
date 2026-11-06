import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {bondSessionReport} from '../shared/report-bond-session.mjs';
import {createReportDraft} from '../frontend/src/lib/reportCreation.js';
import {reportCsv} from '../frontend/src/lib/reportCsv.js';
const require=createRequire(import.meta.url);
process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-global-bond-test';
const {countries,parseGlobalCsv,loadGlobalBondMarkets,csvRows}=require('../backend/lib/report-bond-global');
const {config}=require('../backend/lib/report-bond-markets');
const {normalizeReport}=require('../backend/services/user-report-store');
const {_test}=require('../backend/routes/export');
const cut='2026-10-19T22:00:00Z';
const headers='REF_AREA,FREQ,MEASURE,UNIT_MEASURE,ACTIVITY,ADJUSTMENT,TRANSFORMATION,TIME_HORIZ,METHODOLOGY,TIME_PERIOD,OBS_VALUE,OBS_STATUS,UNIT_MULT';
const oecd=headers+'\n'+countries.filter(country=>!['CY','MT'].includes(country.code)).flatMap((country,index)=>['2026-07','2026-08','2026-09'].map((month,n)=>[country.iso3,'M','IRLT','PA','_Z','_Z','_Z','_Z','N',month,(country.code==='CH' ? -.3 : 3+index*.05)+n*.02,'A','0'].join(','))).join('\n');
const ecbHeaders='REF_AREA,FREQ,IR_TYPE,TR_TYPE,MATURITY_CAT,CURRENCY_TRANS,TIME_PERIOD,OBS_VALUE,OBS_STATUS,UNIT_MULT,UNIT,TITLE';
const ecb=ecbHeaders+'\n'+['CY','MT','DE'].flatMap(code=>['2026-07','2026-08','2026-09'].map((month,index)=>[code,'M','L','L40','CI','EUR',month,2.5+index*.05,'A','0','PC','"Nombre, con coma"'].join(','))).join('\n');
assert.equal(csvRows('a,b\n"texto, con coma","dos\nlineas"\n')[0].a,'texto, con coma');
const parsed=parseGlobalCsv(oecd,'oecd',cut);assert.equal(parsed.length,46);assert(parsed.some(item=>item.market==='Japón'));assert(parsed.find(item=>item.code==='CH').series[0].value<0);
const all=await loadGlobalBondMarkets({cutoff:cut,get:async url=>({ok:true,text:async()=>url.includes('oecd.org') ? oecd : ecb})});
assert.equal(all.length,48);assert.equal(all.find(item=>item.code==='DE').source.split(' · ')[0],'BCE');assert(all.every(item=>item.series.length===3));
const rejected=headers+'\n'+['EA20,M,IRLT,PA,_Z,_Z,_Z,_Z,N,2026-09,4,A,0','JPN,M,IRLT,PA,_Z,_Z,_Z,_Z,N,2026-10,99,A,0','JPN,M,IRLT,PA,_Z,_Z,_Z,_Z,N,2026-11,99,A,0','CAN,M,IRLT,PA,_Z,_Z,_Z,_Z,N,2026-09,5,F,0','CAN,M,IRLT,PA,_Z,_Z,_Z,_Z,N,2026-08,5,A,2'].join('\n');
assert.equal(parseGlobalCsv(rejected,'oecd',cut).length,0,'No agregar áreas regionales, periodos incompletos, pronósticos ni unidades distintas');
const conflict=headers+'\n'+['JPN,M,IRLT,PA,_Z,_Z,_Z,_Z,N,2026-09,1,A,0','JPN,M,IRLT,PA,_Z,_Z,_Z,_Z,N,2026-09,2,A,0'].join('\n');assert.equal(parseGlobalCsv(conflict,'oecd',cut).length,0);
const preserved=await loadGlobalBondMarkets({cutoff:cut,previous:all,get:async()=>{throw Error('offline');}});assert.equal(preserved.length,48);
const domestic=config.markets.map((item,index)=>({...item,series:item.cadence==='auction' ? [{date:'2026-10-08',value:7},{date:'2026-10-15',value:7.1}] : [{date:'2026-10-16',value:4+index*.01},{date:'2026-10-19',value:4.05+index*.01}]}));
const report={collection:'finance',key:'bonds',bondSchemaVersion:2,title:'Bonos internacionales · SIMULACIÓN',summary:'Datos ficticios para validar el formato, no cotizaciones actuales.',generatedAt:cut,sections:[],metrics:[],tables:[],visuals:[],watchlist:['Revisar el calendario de publicaciones mensuales.'],sources:['OCDE · datos de simulación','BCE · datos de simulación'],sourceLinks:[{label:'OCDE · fuente de simulación',url:'https://example.invalid/oecd'}],sourceSnapshot:{bonds:[...domestic,...all]}};
const model=bondSessionReport(report);assert.equal(model.references.length,65);assert.equal(model.results[1].rows.length,48);assert(model.summary.includes('48 países'));assert(!model.visuals.some(item=>item.monthly));assert(model.visuals.filter(item=>item.series).every(item=>item.series.every(series=>series.points.length<=2)));
for(const country of countries) assert(model.results[1].rows.some(row=>row[0].startsWith(country.market+' · ')),'Contexto conserva '+country.market);
const japanese=model.references.find(item=>item.code==='JP');assert.equal(japanese.changeBp,null,'No presentar un cambio mensual como variación diaria');
const stale=bondSessionReport({...report,sourceSnapshot:{bonds:all.map(item=>({...item,series:[{date:'2020-01',value:1},{date:'2020-02',value:1.1}]}))}});assert(stale.references.every(item=>item.changeBp===null));assert.equal(stale.visuals.length,0);assert(stale.results[1].rows.every(row=>row.at(-1)==='Dato antiguo'));
const skipped=bondSessionReport({...report,sourceSnapshot:{bonds:[{...all[0],series:[{date:'2026-06',value:3},{date:'2026-09',value:4}]}]}});assert.equal(skipped.references[0].changeBp,null);assert.equal(skipped.results[1].rows[0].at(-1),'Mensual; sin comparación diaria');
const saved=normalizeReport(createReportDraft('finance',report).report),payload=_test.executivePayload(report);
assert.equal(saved.bondObservations.length,65);assert.equal(payload.bondObservations.length,65);const savedModel=bondSessionReport(saved);assert.equal(savedModel.results[1].rows.length,48);assert.equal(savedModel.references.find(item=>item.code==='JP').cadence,'monthly');assert.equal(savedModel.references.find(item=>item.code==='JP').points[0].date,'2026-07');assert.equal(savedModel.references.find(item=>item.code==='JP').currency,'JPY');
const csv=reportCsv(saved);assert(csv.includes('"2026-09"'));assert(csv.includes('Contexto internacional mensual vigente'));
const bytes=await _test.makeExecutivePdf(report.title,payload),{getDocument}=await import('../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true}),pdf=await task.promise;let text='';assert(pdf.numPages<=20);
for(let i=1;i<=pdf.numPages;i++){const items=(await(await pdf.getPage(i)).getTextContent()).items;text+=items.map(item=>item.str).join(' ')+'\n';for(const item of items.filter(item=>item.str.trim() && !/^(USO INTERNO|PAGINA)/.test(item.str)))assert(item.transform[5]>=55,'Contenido separado del pie: '+item.str);}
assert(pdf.numPages<=5);assert(text.includes('2026-09'),'Las referencias internacionales aparecen con su mes publicado, separadas de las sesiones diarias');for(const country of countries)assert(text.includes(country.market),'PDF incluye '+country.market);assert(text.includes('Implicaciones para el negocio'));await task.destroy();
if(process.argv.includes('--preview')){await fs.mkdir('output/pdf',{recursive:true});await fs.writeFile('output/pdf/bonos-internacionales-simulacion.pdf',bytes);await fs.mkdir('output/bonos-global',{recursive:true});await fs.writeFile('output/bonos-global/fixture.json',JSON.stringify(report));}
if(process.argv.includes('--ui')) {
 const express=require('express'),{chromium}=require('playwright'),app=express();let server,browser;
 app.use('/api',(req,res)=>{if(req.path==='/verify-token')return res.json({success:true,email:'fixture@example.invalid'});if(req.path==='/profile')return res.json({success:true,profile:{email:'fixture@example.invalid',preferences:{}}});if(req.path.includes('finance-executive-reports'))return res.json({success:true,data:[report],generatedAt:cut});return res.json({success:true,data:[],articles:[]});});app.use('/assets',express.static(path.resolve('assets')));app.use(express.static(path.resolve('frontend/dist')));app.use((req,res)=>res.sendFile(path.resolve('frontend/dist/index.html')));
 try {server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());await page.goto('http://127.0.0.1:'+server.address().port+'/informes');await page.locator('#erh-document-session').waitFor();
  const table=await page.locator('#erh-document-comparisons').innerText();for(const country of countries)assert(table.includes(country.market),'Tabla incluye '+country.market);
  assert.equal(await page.locator('.erh-session-chart-reading').count(),model.visuals.length);assert(await page.locator('#erh-document-charts').evaluate(node=>Boolean(node.compareDocumentPosition(document.getElementById('erh-document-sessionContext')) & Node.DOCUMENT_POSITION_FOLLOWING)));assert(!(await page.locator('#erh-document-charts').innerText()).includes('2026-09'));
  await fs.mkdir('output/bonos-global',{recursive:true});await page.getByRole('navigation',{name:'Índice del informe'}).getByRole('button',{name:/Gráficas y lectura/}).click();await page.screenshot({path:'output/bonos-global/graficas.png',fullPage:true,animations:'disabled'});await page.getByRole('navigation',{name:'Índice del informe'}).getByRole('button',{name:/Causas y consecuencias/}).click();await page.screenshot({path:'output/bonos-global/causas.png',fullPage:true,animations:'disabled'});
  for(const width of [390,768]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sin desbordamiento en '+width);}await page.screenshot({path:'output/bonos-global/movil.png',fullPage:true,animations:'disabled'});assert.deepEqual(errors,[]);
 } finally {await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
console.log('Bonos globales: OK · 48 países, 65 referencias, CSV SDMX, fuentes, meses, datos antiguos, negativos, no duplicados, guardado, CSV y PDF'+(process.argv.includes('--ui') ? ', escritorio y móvil' : ''));
