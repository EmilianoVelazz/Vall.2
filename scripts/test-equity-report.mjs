import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {getDocument,OPS} from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {reportOutline} from '../frontend/src/lib/reportOutline.js';
import {reportLayout} from '../frontend/src/lib/reportLayout.js';
const require=createRequire(import.meta.url);
process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-equity-report-secret';delete process.env.USER_PASSWORD;
const {_test}=require('../backend/routes/export');
const {enrichSectorReport}=require('../backend/lib/report-sector-format');
const {UserReportAgent}=require('../backend/ai/user-report-agent');
const markets=[['S&P 500','América'],['Nasdaq','América'],['IPC México','América'],['Brasil','América'],['Dow Jones','América'],['Euro Stoxx','Europa'],['DAX','Europa'],['CAC','Europa'],['FTSE','Europa'],['Nikkei','Asia'],['Hang Seng','Asia'],['Shanghai','Asia'],['KOSPI','Asia'],['Australia','Asia']];
const quotes=markets.map(([label,region],index)=>{
 const series=Array.from({length:42},(_,day)=>({date:new Date(Date.UTC(2026,8,1+day)).toISOString().slice(0,10),value:1000+index*100+day*(index%2 ? -1 : 2)}));
 return {label,region,market:label,symbol:'FIXTURE'+index,value:series.at(-1).value,previous:series.at(-2).value,series,recentSeries:series,performance:{day:index%2 ? -0.1 : 0.2,week:null,month:undefined,ytd:''}};
});
const base=enrichSectorReport({key:'equities',title:'Bolsa de simulación',generatedAt:'2026-10-12T14:00:00Z',summary:'Cierres sintéticos para validar la lectura de Bolsa.',objective:'Comparar las referencias disponibles.',takeaways:['Separar el cierre de la sesión y la trayectoria del periodo.'],watchlist:['Confirmar exposición y fecha antes de actuar.'],closing:'Contrastar la lectura con las necesidades del destinatario.',sections:[{heading:'Análisis del cliente',text:'No se presupone una cartera ni una recomendación.'}],
 metrics:quotes.map(item=>({label:item.label,value:item.value+' puntos',change:item.performance.day+'%'})),sourceSnapshot:{equities:quotes},sources:['Fuente sintética de simulación'],sourceLinks:[{label:'Evidencia de prueba',url:'https://example.org/bolsa'}],tables:[{title:'Desempeño por referencia',columns:['Referencia','Región','Mercado','Cierre','Día','5 sesiones','21 sesiones','YTD','Fecha'],rows:quotes.map(item=>[item.label,item.region,item.market,String(item.value),item.performance.day+'%','Sin comparación','Sin comparación','Sin comparación',item.series.at(-1).date])}]},'finance');
assert.equal(base.visuals.length,3);assert.deepEqual(base.visuals.map(visual=>visual.series.length),[5,4,5]);
assert.strictEqual(enrichSectorReport(base,'finance'),base,'Un corte enriquecido no duplica material');
assert.equal(reportLayout({...base,title:'Cualquier título'}).style,'market-brief');
assert.equal(reportLayout({key:'edition',title:'Bolsa',baseReport:{collection:'markets',key:'proteins'}}).key,'proteins','El título no determina el sector');
const prefs={audience:'commercial',depth:'detailed',decisionHorizon:'month',customTitle:'Bolsa para dirección comercial',recipientName:'Jefatura comercial',organization:'Empresa de prueba',confidentiality:'confidential',sections:{indicators:true,charts:true,tables:true,risks:true,sources:true}};
const instructions='Prepara la lectura para dirección comercial. Conserva las gráficas, las tablas y las fuentes. No supongas una cartera.';
let prompt;
const agent=new UserReportAgent({provider:{isConfigured:()=>true,generate:async options=>{
 prompt=options;
 return {model:'fixture',text:JSON.stringify({title:prefs.customTitle,summary:'Lectura para el cliente con datos de simulación. Revisar exposición antes de trasladar estos movimientos a la actividad comercial.',objective:'Identificar qué referencias requieren seguimiento.',sections:[{heading:'ANALISIS CLIENTE',text:'Confirmar si estos mercados afectan las condiciones comerciales. El material no acredita una cartera propia.'}],takeaways:['Confirmar pertinencia para el cliente antes de actuar.'],watchlist:['Validar exposición, fecha y alcance.'],closing:'CIERRE CLIENTE: identificar el responsable de validar exposición.',preferences:prefs,tone:'professional'})};
}}});
const generated=await agent.generate({report:base,instructions,options:{mode:'instructions'},preferences:prefs});
const owned={...generated,userEdition:true,key:'edition_11111111-1111-4111-8111-111111111111',editionId:'11111111-1111-4111-8111-111111111111',editionVersion:1};
assert(prompt.systemInstruction.includes('No supongas que el cliente posee una cartera'));
assert.equal(reportLayout(owned).style,'market-brief');assert.equal(owned.personalization.audience,'commercial');
assert.equal(reportLayout(owned).composition,'company-dashboard');
assert.equal(owned.visuals.length,3);assert.equal(owned.tables.find(table=>table.title==='Desempeño por referencia').rows.length,14);
assert.deepEqual(reportOutline(owned).slice(0,3).map(block=>block.key),['summary','indicators','charts']);
const payload=_test.executivePayload(owned),bytes=await _test.makeExecutivePdf(owned.title,payload);
const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true}),pdf=await task.promise;
let text='',annotations=[];
for(let number=1;number<=pdf.numPages;number++) {
 const page=await pdf.getPage(number),items=(await page.getTextContent()).items,operators=await page.getOperatorList();annotations.push(...await page.getAnnotations());
 assert.deepEqual(page.view,[0,0,612,1008],'Mantener formato vertical oficio también en las continuaciones');
 assert(operators.fnArray.includes(OPS.paintImageXObject),'Marca de agua en cada página');
 assert(items.filter(item=>item.str.trim()).length>5,'Sin páginas vacías');
 for(const item of items.filter(item=>!item.str.startsWith('CONFIDENCIAL') && !item.str.startsWith('PAGINA'))) assert(item.transform[5]>=55,'Contenido separado del pie: '+item.str);
 text+=items.map(item=>item.str).join(' ')+'\n';
}
for(const token of ['Bolsa para dirección comercial','Jefatura comercial','Empresa de prueba','CONFIDENCIAL','2026-10-12','CIERRE CLIENTE','Australia']) assert(text.includes(token),'Conservar '+token);
for(const token of ['INFORMACIÓN DE MERCADOS','CONCLUSIONES','Hechos y señales','Riesgos a monitorear','Acciones y seguimiento','Inicio / cierre','Cambio tramo']) assert(text.includes(token),'Tablero de referencia: '+token);
assert(text.indexOf('Bolsa de América')<text.indexOf('ANALISIS CLIENTE'),'La evidencia visual precede al desarrollo');
assert(annotations.some(item=>item.url==='https://example.org/bolsa'),'Fuente activa');await task.destroy();
const excluded=_test.executivePayload({...owned,personalization:{...prefs,sections:{indicators:false,charts:false,tables:false,risks:false,sources:false}}});
for(const field of ['metrics','visuals','tables','watchlist','sources','sourceLinks']) assert.deepEqual(excluded[field],[],'Respetar la exclusión '+field);
const cleaned=_test.executivePayload({...base,sourceSnapshot:{equities:quotes.map(item=>({...item,change:null}))}});
assert(cleaned.equitySeries.every(item=>item.change===null && item.performance.week===null && item.performance.month===null && item.performance.ytd===null),'Los campos ausentes no se convierten en cero');
assert.deepEqual(_test.executivePayload({title:'Valores',visuals:[{type:'bar',title:'Dato faltante',bars:[{label:'Vacío',value:null},{label:'Cero real',value:0}]}]}).visuals[0].bars,[{label:'Cero real',value:0}]);
const longEdition=_test.executivePayload({...owned,metrics:[],tables:[],sections:[],takeaways:Array.from({length:5},(_,i)=>`Señal ${i}. `+'Confirmar la exposición documentada y el alcance del dato. '.repeat(13)+`FIN_SEÑAL_${i}`),watchlist:Array.from({length:4},(_,i)=>`Riesgo ${i}. `+'Revisar fecha, unidad y responsable antes de decidir. '.repeat(8)+`FIN_RIESGO_${i}`),closing:'Validar el seguimiento. '.repeat(45)+'FIN_ACCIONES',visuals:[{type:'line',title:'Gráfica extensa para el destinatario con ocho referencias y fechas verificables',unit:'%',series:Array.from({length:8},(_,i)=>({label:'Referencia extensa de validación '+i,points:quotes[i].series}))}]});
const longTask=getDocument({data:new Uint8Array(await _test.makeExecutivePdf(longEdition.title,longEdition)),useSystemFonts:true,disableFontFace:true}),longPdf=await longTask.promise;let longText='';
for(let n=1;n<=longPdf.numPages;n++) {const page=await longPdf.getPage(n),items=(await page.getTextContent()).items;assert.deepEqual(page.view,[0,0,612,1008]);for(const item of items.filter(item=>item.str.trim() && !item.str.startsWith('CONFIDENCIAL') && !item.str.startsWith('PAGINA'))) assert(item.transform[5]>=55,'La edición extensa conserva el margen del pie: '+item.str);longText+=items.map(item=>item.str).join(' ');}
for(const token of ['FIN_SEÑAL_0','FIN_SEÑAL_4','FIN_RIESGO_3','FIN_ACCIONES','Referencia extensa de validación 7','p. p.']) assert(longText.includes(token),'Conservar toda la edición extensa: '+token);await longTask.destroy();
const output=path.resolve('output/bolsa-cliente');
if(process.argv.includes('--preview')) {await fs.mkdir('output/pdf',{recursive:true});await fs.writeFile(path.resolve('output/pdf/bolsa-tablero-muestra.pdf'),bytes);}
if(process.argv.includes('--ui')) {
 const express=require('express'),{chromium}=require('playwright');let browser,page,server;await fs.mkdir(output,{recursive:true});
 const app=express();app.use(express.json());app.use('/api',(req,res)=>{
  if(req.path==='/verify-token') return res.json({success:true,email:'fixture@example.invalid'});
  if(req.path==='/profile') return res.json({success:true,profile:{email:'fixture@example.invalid',preferences:{}}});
  if(req.path.includes('executive-reports')) return res.json({success:true,data:[base]});
  if(req.path==='/user-reports') return res.json({success:true,data:[owned]});
  if(req.path.startsWith('/user-reports/')) return res.json({success:true,data:owned});
  if(req.path==='/report-export') return res.type('application/pdf').send(bytes);
  if(req.path==='/report-email') throw Error('No enviar correos en pruebas');
  return res.json({success:true,data:[],articles:[]});
 });app.use(express.static(path.resolve('dist')));app.use((req,res)=>res.sendFile(path.resolve('dist/index.html')));
 try {
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port+'/informes');await page.locator('.erh-equity-reader').waitFor();
  const guide=page.locator('.erh-equity-guide');assert.equal(await guide.getAttribute('open'),null);await guide.locator('summary').click();assert(await guide.locator('table').isVisible());await guide.locator('summary').click();
  await page.getByRole('tab',{name:/Mis informes/}).click();await page.locator('.erh-document h2').getByText(owned.title,{exact:true}).waitFor();
  assert.equal(await page.locator('.erh-equity-reader .erh-document-block').nth(2).getAttribute('id'),'erh-document-charts');
  assert.equal(await page.locator('#erh-document-charts figure').count(),3);
  assert.equal(await page.locator('.erh-market-chart-table').count(),3);assert.equal(await page.locator('.erh-market-chart-table tbody tr').count(),14);
  assert.equal(await page.locator('.erh-market-chart-table td small').filter({hasText:'Rango:'}).count(),14,'Each series exposes its range next to its return');
  assert.equal(await page.locator('.erh-market-conclusions>section').count(),3);
  await page.locator('.erh-market-explorer summary').first().click();await page.locator('.erh-market-explorer input[type="range"]').first().fill('0');assert.equal(await page.locator('.erh-market-explorer input[type="range"]').first().inputValue(),'0');await page.locator('.erh-market-explorer summary').first().click();
  await page.locator('.erh-document-column').evaluate(element=>window.scrollTo({top:window.scrollY+element.getBoundingClientRect().top-80,behavior:'instant'}));await page.screenshot({path:path.join(output,'bolsa-cliente-escritorio.png'),animations:'disabled'});
  await page.getByRole('navigation',{name:'Índice del informe'}).getByRole('button',{name:/Información de mercados/}).click();await page.screenshot({path:path.join(output,'bolsa-tablero-escritorio.png'),animations:'disabled'});
  for(const width of [360,390,768,1024]) {await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Sin desbordamiento a '+width);if(width===390) await page.screenshot({path:path.join(output,'bolsa-cliente-movil.png'),animations:'disabled'});}
  assert.deepEqual(errors,[]);
 } finally {if(browser) await browser.close();if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
console.log('Bolsa: OK · formato por origen, audiencia, regiones completas, orden, exclusiones, datos ausentes, PDF, fuentes y marca de agua');
process.exit(0);
