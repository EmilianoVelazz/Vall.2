import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {getDocument,OPS} from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {reportLayout} from '../frontend/src/lib/reportLayout.js';
import {reportOutline} from '../frontend/src/lib/reportOutline.js';
import {weeklyReport} from '../shared/report-weekly.mjs';
const require=createRequire(import.meta.url);
process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-dashboard-test-secret';delete process.env.USER_PASSWORD;
const collections=require('../shared/report-collections.json'),sectors=require('../shared/report-sector-formats.json');
const {reportLayout:backendLayout}=require('../backend/lib/report-layout'),{enrichSectorReport}=require('../backend/lib/report-sector-format');
const {_test}=require('../backend/routes/export'),{buildMexicoReports}=require('../backend/services/mexico-executive-reports');
const {input,time}=require('./lib/mexico-report-fixture.cjs');
const points=Array.from({length:12},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),value:100+i}));
const mexico=buildMexicoReports(input,time);
const reports=[];
const fixturePoints=(key,index)=>key==='fx'
 ? [{date:'2026-10-12T12:00:00Z',value:1.05321+index*.01},{date:'2026-10-12T13:00:00Z',value:1.05329+index*.01}]
 : points.map((point,n)=>({...point,value:point.value+index*n*.25}));
for(const [collection,{reportKeys}] of Object.entries(collections)) for(const key of reportKeys) {
 const labels=key==='proteins' ? ['Res','Cerdo','Pollo','Huevo'] : key==='grains' ? ['Maíz','Trigo','Soya','Sorgo'] : key==='energy_metals' ? ['WTI','Gas natural','Cobre','Aluminio'] : key==='fx' ? ['USD/MXN','EUR/USD','USD/JPY','USD/CAD'] : key==='bonds' ? ['Corto plazo','Mediano plazo','Largo plazo','Referencia local'] : ['Referencia A','Referencia B','Referencia C','Referencia D'];
 const unit=key==='bonds' ? '%' : key==='proteins' ? 'MXN/kg · simulación' : key==='grains' ? 'USD/t · simulación' : 'Índice base 100';
 const current=i=>111+i*2.75;
 const existing=mexico.find(report=>report.key===key);
 reports.push(existing || enrichSectorReport({key,collection,title:sectors[collection][key].label+' · simulación',generatedAt:time.toISOString(),summary:'Datos sintéticos para revisar el formato. No constituyen cotizaciones comerciales.',objective:'Comparar las referencias del corte con sus fechas y unidades.',metrics:labels.map((label,i)=>({label,value:current(i)+' '+unit,change:'Referencia de simulación'})),visuals:key.includes('news') ? [] : [{type:'line',title:'Trayectoria de referencia · '+key,unit,series:labels.slice(0,2).map((label,i)=>({label,points:fixturePoints(key,i)})),note:'Observaciones sintéticas. El cambio del tramo se calcula con los extremos disponibles; no es un cambio de sesión ni una proyección.'},{type:'bar',title:'Comparación de referencias · '+key,unit,bars:labels.map((label,i)=>({label,value:current(i)})),note:'Comparación de simulación con la misma unidad; barras desde cero.'}],tables:[{title:'Detalle del corte · '+key,columns:['Referencia','Valor','Unidad','Fecha'],rows:labels.map((label,i)=>[label,String(current(i)),unit,'2026-10-12'])},{title:'Condiciones por confirmar',columns:['Campo','Validación'],rows:[['Presentación','Confirmar comparabilidad'],['Entrega','Confirmar plazo y costo']]}],sections:[{heading:'Lectura para el destinatario',text:'Confirmar la vigencia y el alcance de las referencias antes de aplicarlas a una decisión de la empresa.'}],takeaways:['Distinguir observaciones del corte y condiciones comerciales.'],watchlist:['Confirmar exposición y evidencia local.'],closing:'Asignar la validación del dato al área que toma la decisión.',sources:['Material de simulación'],sourceLinks:[{label:'Fuente de ejemplo',url:'https://example.org/evidencia-'+key},{label:'Fuente de ejemplo',url:'https://example.org/metodologia-'+key}]},collection));
}
assert.equal(reports.length,14);
for(const report of reports) {report.sections.push({heading:'Fuentes y trazabilidad',text:'FUENTELEGACYNOVISIBLE'},{heading:'Análisis de prueba',text:'ANALISIS_NO_VISIBLE'});report.summary+=' RESUMEN_NO_VISIBLE';report.objective+=' OBJETIVO_NO_VISIBLE';report.closing+=' CONCLUSION_NO_VISIBLE';}
assert.equal(reportLayout({key:'overview'}),null,'Un panorama ambiguo necesita colección');
assert.equal(reportLayout({key:'fx',collection:'unknown'}),null,'No reasignar una colección explícita');
assert.equal(reportLayout({title:'México',key:'manual'}),null,'El título no impone sector');
assert.equal(reportLayout({collection:'finance',key:'constructor'}),null,'Sólo claves del catálogo');
const buffers=new Map();
async function inspect(bytes,report) {
 const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true}),pdf=await task.promise;let text='',links=[];
 for(let i=1;i<=pdf.numPages;i++) {
  const page=await pdf.getPage(i),items=(await page.getTextContent()).items,ops=await page.getOperatorList();assert.deepEqual(page.view,reportLayout(report)?.composition==='weekly-sheet' ? [0,0,595.28,841.89] : [0,0,612,1008]);assert(ops.fnArray.includes(OPS.paintImageXObject),'Marca en cada página');
  const content=items.filter(item=>item.str.trim() && !/^(USO INTERNO|CONFIDENCIAL|COMPARTIBLE|PAGINA)/.test(item.str));assert(content.length>4,'Sin hojas vacías');
  const guideHeading=items.findIndex(item=>/^INFORMACI[ÓO]N POR VALIDAR$/.test(item.str)),guide=report.tables?.find(table=>table.kind==='guide');
  if(guideHeading>=0 && guide?.rows[0]?.[0]) assert(items.slice(guideHeading+1).map(item=>item.str).join('').replace(/\s/g,'').includes(guide.rows[0][0].replace(/\s/g,'')),'La cabecera acompaña al primer bloque de validación');
  for(const item of content) {assert(item.transform[5]>=55,'Pie separado: '+item.str);assert(item.transform[4]>=30 && item.transform[4]+item.width<=584,'Dentro del ancho útil: '+item.str);}
  text+=items.map(item=>item.str).join(' ')+'\n';links.push(...await page.getAnnotations());
 }
 await task.destroy();return {text,links,pages:pdf.numPages,report};
}
for(const report of reports) {
 const layout=reportLayout(report);assert.deepEqual(layout,backendLayout(report));assert.equal(layout.composition,'weekly-sheet');assert.equal(layout.key,report.key);
 const dataOnly=layout.composition==='weekly-sheet';
 const outline=reportOutline(report,report.sections);assert.equal(outline.some(block=>block.key==='conclusions'),!dataOnly);assert.equal(outline.some(block=>block.key==='analysis'),!dataOnly);if((dataOnly ? weeklyReport(report).visuals : report.visuals).length) assert.equal(outline.find(block=>block.key==='charts').label,dataOnly ? weeklyReport(report).blocks.find(block=>block.key==='charts').label : layout.chartHeading);
 const before=JSON.stringify(report),payload=_test.executivePayload(report),bytes=await _test.makeExecutivePdf(report.title,payload),result=await inspect(bytes,report);assert.equal(JSON.stringify(report),before,'La composición no modifica datos');
 assert(result.text.includes(report.title),'Título completo: '+report.key);assert(result.text.includes(layout.collectionLabel.toUpperCase()),'Cabecera de su familia: '+report.key);assert.equal(result.text.includes('CONCLUSIONES'),!dataOnly);
 for(const marker of ['RESUMEN_NO_VISIBLE','OBJETIVO_NO_VISIBLE','CONCLUSION_NO_VISIBLE','ANALISIS_NO_VISIBLE']) assert.equal(result.text.includes(marker),!dataOnly,'Política de narrativa: '+report.key+' '+marker);
 for(const metric of dataOnly ? weeklyReport(payload).metrics : payload.metrics) assert(result.text.replace(/\s+/g,'').includes(metric.label.replace(/\s+/g,'')),'Indicador diario: '+metric.label);
 for(const table of dataOnly ? weeklyReport(payload).results : payload.tables) for(const row of table.rows) for(const [index,cell] of row.entries()) {
  if(!cell) continue;
  const visual=table.title==='Comparaciones calculadas de las gráficas' && index===0 && payload.visuals.find(visual=>String(cell).endsWith(' · '+visual.title));
  const parts=visual ? [cell.slice(0,-(' · '+visual.title).length),visual.title] : [cell];
  for(const part of parts) assert(result.text.replace(/\s+/g,'').includes(String(part).replace(/\s+/g,'')),'Celda y encabezado de gráfica conservados: '+cell);
 }
 assert(!outline.some(block=>block.key==='sources'),'Sin apartado de fuentes en lectura');
 const session=weeklyReport(report).sessionReport===true;
 assert.equal(outline.at(-1).key,session ? 'sessionContext' : 'causes','Cada familia conserva el orden de su composición');
 assert(result.text.includes('CAUSAS Y CONSECUENCIAS'),'El PDF incluye su cierre: '+report.key);
 assert(!result.text.includes('FUENTES Y TRAZABILIDAD'),'Sin apartado de fuentes en PDF');
 assert(!result.text.includes('FUENTELEGACYNOVISIBLE'),'No reintroducir el apartado desde una sección guardada');
 for(const source of payload.sourceLinks) assert(!result.links.some(link=>link.url===source.url),'No imprimir la lista de fuentes');
 if(report.key==='mx_proteins') {assert(result.text.includes('2026-10 (mensual)'),'El dato mensual conserva su periodo declarado');assert(result.text.includes('2026-10-11') && result.text.includes('2026-10-12'));assert(result.pages<=16,'Comparación estatal legible sin omitir las entidades sin dato');}
 const renamed={...report,userEdition:true,key:'draft',baseReport:{collection:layout.collection,key:layout.key,title:report.title,generatedAt:report.generatedAt}};assert.deepEqual(reportLayout(renamed),layout,'Edición propia conserva formato');
 const excluded=_test.executivePayload({...report,personalization:{sections:{charts:false,tables:false,indicators:false,risks:false,sources:false}}});
 // A retained analysis may name a chart; isolate the excluded visual block.
 excluded.sections=[{heading:'Lectura conservada',text:'El resumen permanece al excluir los bloques de datos.'}];
 const hidden=await inspect(await _test.makeExecutivePdf(report.title,excluded),report);for(const visual of report.visuals || []) assert(!hidden.text.includes(visual.title),'No reintroducir gráficas excluidas');assert.equal(hidden.links.length,0,'Sin enlaces excluidos');
 buffers.set(report.collection+'/'+report.key,bytes);
}
// Short, complete cuts fit on one sheet without reserving a blank second page.
const compact={collection:'markets',key:'grains',title:'Tablero compacto · simulación',summary:'Comparación de prueba.',metrics:[{label:'Dato compacto',value:'100 USD/t'}],tables:[{title:'Tabla compacta',columns:['Producto','Dato'],rows:[['Maíz','100 USD/t']]}],sections:[{heading:'Revisión',text:'Contrastar fecha y unidad.'}],takeaways:['Confirmar fuente.'],watchlist:['Confirmar vigencia.'],closing:'Validar condiciones.',sources:['Fuente de simulación']};
assert((await inspect(await _test.makeExecutivePdf(compact.title,_test.executivePayload(compact)),compact)).pages<=2,'Resumen, datos y causas completos sin salto obligatorio después del tablero');
if(process.argv.includes('--preview')) {
 await fs.mkdir('output/pdf',{recursive:true});for(const [key,name] of [['finance/equities','finanzas-tablero-denso-muestra.pdf'],['markets/proteins','mercados-tablero-denso-muestra.pdf'],['mexico/mx_proteins','mexico-tablero-denso-muestra.pdf']]) {const report=reports.find(report=>report.collection+'/'+report.key===key),sample={...report,title:report.title.replace(/ · simulación$/,'')+' · muestra de simulación',summary:'Datos simulados para validar el diseño; no son cotizaciones actuales. '+report.summary.replace(/^Datos sintéticos para revisar el formato\. No constituyen cotizaciones comerciales\./,'').trim()};await fs.writeFile(path.resolve('output/pdf',name),await _test.makeExecutivePdf(sample.title,_test.executivePayload(sample)));}
}
if(process.argv.includes('--ui')) {
 const express=require('express'),{chromium}=require('playwright'),app=express();app.use(express.json());
 app.use('/api',(req,res)=>{
  if(req.path==='/verify-token') return res.json({success:true,email:'fixture@example.invalid'});
  if(req.path==='/profile') return res.json({success:true,profile:{email:'fixture@example.invalid',preferences:{}}});
  for(const [area,definition] of Object.entries(collections)) if(req.path===definition.endpoint?.replace('/api','')) return res.json({success:true,data:reports.filter(report=>report.collection===area)});
  if(req.path==='/report-export') return res.type('application/pdf').send(buffers.get('markets/proteins'));
  if(req.path==='/report-email') throw Error('Sin correos reales');return res.json({success:true,data:[],articles:[]});
 });app.use(express.static(path.resolve('dist')));app.use((req,res)=>res.sendFile(path.resolve('dist/index.html')));
 let server,browser,page;const output=path.resolve('output/tableros-informes');await fs.mkdir(output,{recursive:true});
 try {
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port+'/informes');
  for(const [area,definition] of Object.entries(collections)) if(area!=='mine') {
   await page.getByRole('tab',{name:definition.label,exact:false}).click();
   for(const report of reports.filter(report=>report.collection===area)) {
    await page.locator('.erh-book').filter({hasText:report.title}).click();await page.locator('.erh-document h2').getByText(report.title,{exact:true}).waitFor();
    const view=reportLayout(report).composition==='weekly-sheet' ? weeklyReport(report) : report;
    assert.equal(await page.locator('.erh-company-reader').count(),1);assert.equal(await page.locator('.erh-market-visual-grid figure').count(),view.visuals?.length || 0);assert.equal(await page.locator('.erh-company-reader .erh-metrics>div').count(),view.metrics?.length || 0);
    assert.equal(await page.locator('.erh-report-sources,.erh-data-passport').count(),0,'Sin sección de fuentes y trazabilidad');
    assert(!(await page.locator('.erh-document').innerText()).includes('FUENTELEGACYNOVISIBLE'),'No mostrar secciones guardadas con el encabezado anterior');
    if(reportLayout(report).composition==='weekly-sheet' && !view.sessionReport) {
     const text=await page.locator('.erh-document').innerText();for(const marker of ['RESUMEN_NO_VISIBLE','OBJETIVO_NO_VISIBLE','CONCLUSION_NO_VISIBLE','ANALISIS_NO_VISIBLE']) assert(!text.includes(marker),'Lectura sin explicación: '+marker);
     assert.equal(await page.locator('.erh-document :is(.erh-reading-context,.erh-chapters,.erh-market-conclusions,.erh-market-method,.erh-equity-guide,.erh-chart-reading-note)').count(),0);
    }
    if(view.visuals?.length===2) {
     const grid=await page.locator('.erh-market-visual-grid').boundingBox();
     for(const chart of await page.locator('.erh-market-visual-grid>figure').all()) assert((await chart.boundingBox()).width>=grid.width*.46,'Dos gráficas aprovechan el ancho disponible');
    }
    for(const metric of await page.locator('.erh-company-reader .erh-metrics>div').all()) {const [card,value]=await Promise.all([metric.boundingBox(),metric.locator('strong').boundingBox()]);assert(value.width>=card.width*.65,'El valor dispone del ancho de la ficha y no se parte verticalmente');}
    if(report.key==='fx') {
     assert((await page.locator('.erh-block-results').innerText()).includes('1.05329'),'El último dato conserva su precisión');
     assert((await page.locator('.erh-block-comparisons').innerText()).includes('2026-10-11'),'Comparación con el día calendario anterior');
     await page.locator('.erh-market-chart').first().evaluate(element=>element.scrollIntoView({block:'center'}));await page.screenshot({path:path.join(output,'precision-grafica.png'),animations:'disabled'});
    }
   }
   await page.locator('.erh-document-column').evaluate(element=>window.scrollTo({top:window.scrollY+element.getBoundingClientRect().top-80,behavior:'instant'}));await page.screenshot({path:path.join(output,area+'-escritorio.png'),animations:'disabled'});
   for(const width of [360,390,768]) {await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Sin desbordamiento '+area+' '+width);if(width===390) await page.screenshot({path:path.join(output,area+'-movil.png'),animations:'disabled'});}await page.setViewportSize({width:1440,height:1000});
  }
  assert.deepEqual(errors,[]);
 } finally {if(browser) await browser.close();if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
console.log('Tableros: OK · 14 subapartados, identidad, datos completos, formato común, unidades, exclusiones, fuentes, marca y aprovechamiento de página');
process.exit(0);
