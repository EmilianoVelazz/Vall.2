import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {getDocument,OPS} from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {requestReportPdf} from '../frontend/src/lib/reportPdf.js';
import {weeklyReport} from '../shared/report-weekly.mjs';
const require=createRequire(import.meta.url);
process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-archived-report-test';delete process.env.USER_PASSWORD;
// Exercise the real route with an isolated account and archived material.
const auth=require.resolve('../backend/routes/auth');
require.cache[auth]={id:auth,filename:auth,loaded:true,exports:{verifyToken:(req,res,next)=>{req.user={email:'density-fixture@example.invalid'};next();}}};
const route=require('../backend/routes/export'),{_test}=route;
const {normalizeEquityEvidence}=require('../backend/lib/report-equity-quality');
const {createUserReportStore}=require('../backend/services/user-report-store');
const {quotePoints}=require('../backend/lib/report-observations');
const fixture=require('./lib/equities-pdf-regression.json'),before=JSON.stringify(fixture);
const report=normalizeEquityEvidence(fixture);
assert.equal(JSON.stringify(fixture),before,'Preserve the uploaded evidence');
assert.strictEqual(normalizeEquityEvidence(report),report,'Validation is idempotent');
const os=require('node:os'),crypto=require('node:crypto');
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-equity-validation-'));
try {
 const owner='validation@example.invalid',id='11111111-1111-4111-8111-111111111111',folder=path.join(directory,crypto.createHash('sha256').update(owner).digest('hex'));
 await fs.mkdir(folder);
 const legacy={...fixture,userEdition:true,key:'edition_'+id,editionId:id,editionVersion:2,baseReport:{collection:'finance',key:'equities',title:'Bolsa',generatedAt:fixture.generatedAt}};
 const target=path.join(folder,id+'.json'),original=JSON.stringify(legacy);await fs.writeFile(target,original);
 const restored=await createUserReportStore({directory}).get(owner,id);
 assert.equal(restored.editionVersion,2);assert.equal(restored.metrics.find(metric=>metric.label==='Hang Seng').value,'Sin dato validado');
 assert.equal(await fs.readFile(target,'utf8'),original,'Reading a legacy edition does not overwrite the stored evidence');
} finally {
 assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));
 assert(path.basename(directory).startsWith('vall-equity-validation-'));
 await fs.rm(directory,{recursive:true,force:true});
}
assert(report.summary.includes('Nasdaq Composite') && !report.summary.includes('S&P/ASX 200 registra'),'The weakest valid session is identified correctly');
for(const name of ['Hang Seng','Shanghai Composite','KOSPI']) {
 assert.equal(report.metrics.find(metric=>metric.label===name).value,'Sin dato validado');
 assert(!report.visuals.some(visual=>visual.series.some(series=>series.label===name)),'Invalid closes do not create false crashes');
}
assert.strictEqual(normalizeEquityEvidence({collection:'mexico',key:'mx_proteins',metrics:[{label:'Cobertura',value:'0',change:'0%'}]}).metrics[0].value,'0','Zero coverage remains valid');
const stamps=['2026-10-10','2026-10-11','2026-10-12'].map(date=>Date.parse(date)/1000);
assert.deepEqual(quotePoints([100,0,-1],stamps,new Date('2026-10-13'),{positive:true}).map(point=>point.value),[100]);
assert.deepEqual(quotePoints([100,0,-1],stamps,new Date('2026-10-13')).map(point=>point.value),[100,0,-1],'Do not impose positive prices on all kinds of observation');
const express=require('express'),app=express();app.use('/api',route);
let server;
try {
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port;
 const blob=await requestReportPdf(fixture,fixture.title,fixture.summary,(url,options)=>fetch(base+url,options));
 const bytes=Buffer.from(await blob.arrayBuffer());
 const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true}),pdf=await task.promise;
 const weekly=weeklyReport(_test.executivePayload(report)),historyRows=weekly.history.reduce((sum,table)=>sum+table.rows.length,0);
 assert(pdf.numPages<=5+Math.ceil(historyRows/20),'Full history and statistics have a bounded A4 page budget');
 const texts=[],usage=[];
 for(let i=1;i<=pdf.numPages;i++) {
  const page=await pdf.getPage(i),items=(await page.getTextContent()).items,ops=await page.getOperatorList();
  assert.deepEqual(page.view,[0,0,595.28,841.89]);assert(ops.fnArray.includes(OPS.paintImageXObject),'Watermark on every page');
  const body=items.filter(item=>item.str.trim() && item.transform[5]<775 && !/^(PAGINA|USO INTERNO|CONFIDENCIAL|COMPARTIBLE)/.test(item.str));
  assert(body.length>25,'No page containing only a short conclusion');
  for(const item of body) {assert(item.transform[5]>=65,'Keep text above the footer');assert(item.transform[4]>=35 && item.transform[4]+item.width<=577,'Keep the full line inside the print area');}
  const bottom=841.89-Math.min(...body.map(item=>item.transform[5]));
  usage.push(Math.round((bottom-65)/(764-65)*100));
  assert(bottom>(i===pdf.numPages ? 140 : 400),'Avoid a mostly empty sheet');
  const baselines=[...new Set(body.map(item=>Math.round(841.89-item.transform[5])))].sort((a,b)=>a-b);
  assert(Math.max(...baselines.slice(1).map((y,index)=>y-baselines[index]))<115,'No giant blank interval between sections');
  texts.push(items.map(item=>item.str).join(' '));
 }
 assert(usage.slice(0,-1).every(value=>value>=55),'Las páginas intermedias aprovechan el espacio; el corte diario no se rellena con historia: '+usage.join('/'));
 const text=texts.join(' '),compact=text.replace(/\s+/g,'');
 assert(!text.includes('Resumen del corte') && texts[0].includes('1.1'),'First sheet exposes data and comparisons without narrative');
 assert(text.includes('Comparación diaria') && !text.includes('HISTÓRICO Y DETALLE DEL CORTE') && !text.includes('INFORMACIÓN ESTADÍSTICA'),'Mostrar sólo la comparación diaria');
 assert(!text.includes('Compras y abastecimiento') && !text.includes('purchasing'),'Audience instructions are omitted from the data report');
 assert(!text.includes('-100%') && !text.includes('-100.00%'),'Do not export invalid falls as returns');
 for(const metric of weekly.metrics) assert(compact.includes(metric.label.replace(/\s+/g,'')),'Every tracked reference remains visible');
 for(const table of weekly.tables) for(const row of table.rows) for(const [index,cell] of row.entries()) {
  const visual=table.title==='Comparaciones calculadas de las gráficas' && index===0 && report.visuals.find(visual=>cell.endsWith(' · '+visual.title));
  const parts=visual ? [cell.slice(0,-(' · '+visual.title).length),visual.title] : [cell];
  for(const part of parts) assert(compact.includes(String(part).replace(/\s+/g,'')),'Preserve every validated cell: '+part);
 }
 for(const visual of _test.executivePayload(fixture).visuals) if(visual.note) assert(!compact.includes(visual.note.replace(/\s+/g,'')),'Omit methodology paragraphs');
 assert(!text.includes('Campos a contrastar con las fuentes del corte'),'No validation guides in the data report');
 assert(text.includes(weekly.window.today) && text.includes(weekly.window.yesterday),'Ambas fechas del corte son visibles');
 assert(!text.includes('Las comparaciones de todas las series se detallan en la tabla'),'No comparison explanations');
 await task.destroy();
 // Modified evidence is retained as a separate table and is not attributed to
 // a curve with different endpoints/range. User prose is preserved as well.
 const changed=structuredClone(fixture);
 changed.tables[1].rows[0][2]='100 / 9999.1234';
 changed.sections.push({heading:'Análisis del usuario',text:'MANTENER_ANALISIS_PERSONAL: confirmar exposición y responsables.'});
 const changedTask=getDocument({data:new Uint8Array(await _test.makeExecutivePdf(changed.title,_test.executivePayload(changed))),useSystemFonts:true,disableFontFace:true}),changedPdf=await changedTask.promise;
 let changedText='';for(let i=1;i<=changedPdf.numPages;i++) changedText+=(await (await changedPdf.getPage(i)).getTextContent()).items.map(item=>item.str).join(' ')+' ';
 assert(!changedText.includes('9999.1234') && !changedText.includes('MANTENER_ANALISIS_PERSONAL'),'Las cifras sin fecha no pasan a la comparación diaria');assert(changed.tables[1].rows[0][2].includes('9999.1234'),'La cifra editada permanece guardada');assert(changed.sections.at(-1).text.includes('MANTENER_ANALISIS_PERSONAL'),'Stored narrative is not deleted');await changedTask.destroy();
 if(process.argv.includes('--preview')) {
  // Label this clearly as a revision of the archive, not a live market report.
  const attached=structuredClone(fixture);
  attached.title='Bolsa · tablero de dirección · corte del 12 de octubre';
  attached.sources=['Revisión del archivo recibido, corte del 12 de octubre de 2026. Las cifras no se reconsultaron al proveedor; las curvas se recuperaron del PDF con precisión gráfica.',fixture.sources[1]];
  const result=await requestReportPdf(attached,attached.title,attached.summary,(url,options)=>fetch(base+url,options));
  await fs.mkdir('output/pdf',{recursive:true});await fs.writeFile(path.resolve('output/pdf/bolsa-tablero-direccion-corte-12-octubre.pdf'),Buffer.from(await result.arrayBuffer()));
 }
 console.log('PDF density: OK · A4, comparación de dos fechas, datos originales conservados, uso '+usage.join('/' )+'%, pie, marca y exportación HTTP');
} finally {if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
process.exit(0);
