import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {getDocument} from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {executiveReading} from '../frontend/src/lib/reportReading.js';
import {reportOutline} from '../frontend/src/lib/reportOutline.js';
const require=createRequire(import.meta.url);
process.env.JWT_SECRET='isolated-report-quality-secret';
delete process.env.USER_PASSWORD;
const {_test}=require('../backend/routes/export');
const {input,time}=require('./lib/mexico-report-fixture.cjs');
const {buildMexicoReports}=require('../backend/services/mexico-executive-reports');

const duplicate={title:'Título',summary:'Lectura del corte.',takeaways:['Señal principal','  Señal principal '],watchlist:['Confirmar inventario'],
  executiveBrief:{generated:true,mode:'deterministic',headline:'Título',thesis:'Lectura del corte.',drivers:['Señal principal'],risks:['Confirmar inventario']}};
const reading=executiveReading(duplicate);
assert.deepEqual(reading.highlights,['Señal principal']);
assert.deepEqual(reading.risks,['Confirmar inventario']);
assert.equal(reading.brief.thesis,'','El resumen determinista no se repite');
assert.equal(reportOutline(duplicate).find(block=>block.key==='risks').count,1);
assert.equal(duplicate.takeaways.length,2,'La presentación no sobrescribe el documento');
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
if(process.argv.includes('--preview')) {
  const output='output/pdf';await fs.mkdir(output,{recursive:true});
  const sample=mexico.find(report=>report.key==='mx_overview');
  await fs.writeFile(output+'/informe-ejecutivo-calidad-muestra.pdf',await _test.makeExecutivePdf(sample.title,_test.executivePayload(sample)));
}
console.log('Report quality: OK · lectura ejecutiva, duplicados, México, orden y evidencia completa en PDF');
process.exit(0);
