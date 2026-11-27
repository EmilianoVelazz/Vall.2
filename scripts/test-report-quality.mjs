import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {getDocument} from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {executiveReading} from '../frontend/src/lib/reportReading.js';
import {reportOutline} from '../frontend/src/lib/reportOutline.js';
const require=createRequire(import.meta.url);
process.env.JWT_SECRET='isolated-report-quality-secret-at-least-32-bytes';
delete process.env.USER_PASSWORD;
const {_test}=require('../backend/routes/export');
const {renderIndividualReportPdf}=require('../backend/lib/report-pdf-page-limit');
const {input,time}=require('./lib/mexico-report-fixture.cjs');
const {buildMexicoReports}=require('../backend/services/mexico-executive-reports');
const publishedModel={metrics:[{label:'Dato publicado',value:'10'}]},fourPagePdf=async()=>({reportPageCount:4});
assert.equal((await renderIndividualReportPdf({report:{executiveBrief:{traceability:{}}},model:publishedModel,render:fourPagePdf,renderCompact:fourPagePdf})).reportPageCount,4,'A cited appendix may use one additional executive page');
await assert.rejects(renderIndividualReportPdf({report:{},model:publishedModel,render:fourPagePdf,renderCompact:fourPagePdf}),/No se pudo componer un PDF legible/,'Reports without evidence links retain the original page limit');

const duplicate={title:'Título',summary:'Lectura del corte.',takeaways:['Señal principal','  Señal principal '],watchlist:['Confirmar inventario'],
  executiveBrief:{generated:true,mode:'deterministic',headline:'Título',thesis:'Lectura del corte.',drivers:['Señal principal'],risks:['Confirmar inventario']}};
const reading=executiveReading(duplicate);
assert.deepEqual(reading.highlights,['Señal principal']);
assert.deepEqual(reading.risks,['Confirmar inventario']);
assert.equal(reading.brief.thesis,'','El resumen determinista no se repite');
assert.equal(reportOutline(duplicate).find(block=>block.key==='risks').count,1);
assert.equal(duplicate.takeaways.length,2,'La presentación no sobrescribe el documento');
const tracedReading=executiveReading({takeaways:[],watchlist:[],executiveBrief:{generated:true,mode:'ai',thesis:'Lectura de prueba.',drivers:['Señal trazable.'],risks:['Dato pendiente.'],traceability:{thesis:{kind:'interpretation',evidenceIds:['metric-1']},drivers:[{kind:'observed',evidenceIds:['metric-1']}],risks:[{kind:'pending',evidenceIds:[]}]},evidence:[{id:'metric-1',label:'Indicador',excerpt:'Valor observado',date:'2026-11-12',unit:'MXN',source:'Fuente',url:'https://example.org/indicador'}]}});
assert.deepEqual(tracedReading.highlightTraceability,[{kind:'observed',evidenceIds:['metric-1']}]);
assert.deepEqual(tracedReading.riskTraceability,[{kind:'pending',evidenceIds:[]}]);
assert.equal(tracedReading.brief.evidence[0].url,'https://example.org/indicador');
const mexico=buildMexicoReports(input,time);
assert(mexico.every(report=>report.objective && report.takeaways.length && report.closing),'Cada informe mexicano prepara una decisión');

// A general base report preserves metrics, rows and columns without a sources section.
const base={title:'Abastecimiento · comité de prueba',summary:'Lectura ejecutiva con evidencia sintética para validar el formato.',generatedAt:time.toISOString(),
  sections:[{heading:'Implicaciones para compras',text:'ANALISISANTESDELOS DATOS. Confirmar etapa, presentación y vigencia.'}],closing:'CIERREANTESDELOSDATOS',takeaways:['Comparar condiciones de compra'],watchlist:['Confirmar inventario'],
  metrics:Array.from({length:15},(_,i)=>({label:'Indicador '+i,value:'VALORMETRICA'+i})),
  tables:[{title:'Detalle completo',columns:Array.from({length:8},(_,i)=>'Campo '+i),rows:Array.from({length:32},(_,i)=>Array.from({length:8},(_,j)=>'FILA'+i+'CELDA'+j))}],
  sources:Array.from({length:8},(_,i)=>'FUENTEDECLARADA'+i),sourceLinks:[{label:'Evidencia enlazada',url:'https://example.org/evidencia-ejecutiva'}]};
const bytes=await _test.makeExecutivePdf(base.title,_test.executivePayload(base));
const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true});
const pdf=await task.promise;
let text='';
for(let number=1;number<=pdf.numPages;number++) {
  const page=await pdf.getPage(number),items=(await page.getTextContent()).items;
  const content=items.filter(item=>!item.str.startsWith('USO INTERNO') && !item.str.startsWith('PAGINA'));
  assert(content.filter(item=>item.str.trim()).length>4,'No producir páginas vacías');
  // Footer remains separated from body text; inspect drawings visually too.
  for(const item of content) assert(item.transform[5]>=55,'El contenido no invade el pie de página: '+item.str);
  text+=items.map(item=>item.str).join(' ')+'\n';
}
for(const token of ['VALORMETRICA14','FILA31CELDA7']) assert(text.includes(token),'Preservar '+token);
for(const token of ['FUENTES Y TRAZABILIDAD','FUENTEDECLARADA7','https://example.org/evidencia-ejecutiva']) assert(!text.includes(token),'Sin apartado de fuentes: '+token);
assert(text.indexOf('ANALISISANTESDELOS')<text.indexOf('VALORMETRICA0'));
assert(text.indexOf('CIERREANTESDELOSDATOS')<text.indexOf('VALORMETRICA14'));
await task.destroy();
const traceUrl='https://example.org/evidencia-ejecutiva';
const tracedReport={...base,title:'Lectura con trazabilidad',executiveBrief:{
  generated:true,mode:'ai',headline:'Referencia para revisión',context:'Corte de simulación.',thesis:'La referencia es 20 MXN por USD; el efecto depende de la exposición real.',
  drivers:['La cifra disponible requiere validación operativa.'],risks:['Confirmar vigencia antes de usarla.'],committeeQuestion:'¿Qué exposición debe confirmarse?',
  traceability:{thesis:{kind:'interpretation',evidenceIds:['metric-1']},drivers:[{kind:'observed',evidenceIds:['metric-1']}],risks:[{kind:'pending',evidenceIds:[]}]},
  evidence:[{id:'metric-1',label:'USD/MXN · Fuente primaria',excerpt:'USD/MXN: 20 MXN por USD',date:'2026-11-12',unit:'MXN por USD',source:'Fuente de simulación',url:traceUrl}],
}};
const tracedPayload=_test.executivePayload(tracedReport);
assert.equal(tracedPayload.executiveBrief.evidence[0].url,traceUrl);
const danglingPayload=_test.executivePayload({...tracedReport,executiveBrief:{...tracedReport.executiveBrief,traceability:{...tracedReport.executiveBrief.traceability,thesis:{kind:'observed',evidenceIds:['news-999']}}}});
assert.deepEqual(danglingPayload.executiveBrief.traceability.thesis,{kind:'pending',evidenceIds:[]},'An export cannot retain a claim category without its linked evidence');
const tracedBytes=await _test.makeExecutivePdf(tracedReport.title,tracedPayload);
const tracedTask=getDocument({data:new Uint8Array(tracedBytes),useSystemFonts:true,disableFontFace:true});
const tracedPdf=await tracedTask.promise;
let tracedText='',linkAnnotations=[];
for(let number=1;number<=tracedPdf.numPages;number++){
 const page=await tracedPdf.getPage(number);tracedText+=(await page.getTextContent()).items.map(item=>item.str).join(' ');
 linkAnnotations.push(...(await page.getAnnotations()).filter(item=>item.subtype==='Link'));
}
assert.match(tracedText,/TRAZABILIDAD POR CONCLUSIÓN/);
assert.match(tracedText,/INTERPRETACIÓN CONDICIONAL/);
assert.match(tracedText,/DATO OBSERVADO/);
assert.match(tracedText,/PENDIENTE DE VALIDAR/);
assert(tracedText.includes(traceUrl),'The PDF shows the exact evidence URL');
assert(linkAnnotations.some(item=>item.url===traceUrl),'The PDF source reference is clickable');
await tracedTask.destroy();
if(process.argv.includes('--preview')) {
  const output='output/pdf';await fs.mkdir(output,{recursive:true});
  const sample=mexico.find(report=>report.key==='mx_overview');
  await fs.writeFile(output+'/informe-ejecutivo-calidad-muestra.pdf',await _test.makeExecutivePdf(sample.title,_test.executivePayload(sample)));
}
console.log('Report quality: OK · lectura ejecutiva, duplicados, México, orden y evidencia completa en PDF');
process.exit(0);
