import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {getDocument} from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {sourceEntries,reportCsv} from '../frontend/src/lib/reportCsv.js';
import {reportBlockCount} from '../frontend/src/lib/reportOutline.js';
import {reportNumber,reportAxisDigits} from '../frontend/src/lib/reportNumberFormat.js';
const require=createRequire(import.meta.url);
process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-report-review-secret';delete process.env.USER_PASSWORD;
const {_test}=require('../backend/routes/export');
const backendNumbers=require('../backend/lib/report-number-format');
const collections=require('../shared/report-collections.json');
const {seriesObservation}=require('../backend/lib/report-observations');

const references={sources:['SNIIM','Nota sin enlace',' SNIIM ','SNIIM: https://example.invalid/pollo'],sourceLinks:[
  {label:'SNIIM',url:'https://example.invalid/pollo'},
  {label:'SNIIM',url:'https://example.invalid/res'},
  {label:' sniim ',url:'https://example.invalid/res'},
  {label:'SNIIM',url:'javascript:alert(1)'},
]};
const originalReferences=JSON.stringify(references),entries=sourceEntries(references);
assert.equal(entries.length,3,'Dos documentos del mismo publicador y una referencia simple');
assert.deepEqual(entries.filter(item=>item.url).map(item=>item.url),['https://example.invalid/pollo','https://example.invalid/res']);
assert.equal(reportBlockCount(references,'sources'),entries.length,'Conteo, lectura y CSV comparten referencias');
assert.equal(JSON.stringify(references),originalReferences,'Las fuentes originales no se sobrescriben');
for(const url of ['https://example.invalid/pollo','https://example.invalid/res']) assert(reportCsv(references).includes(url),'El CSV conserva cada enlace');
assert(!reportCsv(references).includes('javascript:'));
assert.equal(sourceEntries({sourceLinks:[{label:'',url:'https://www.example.invalid/evidencia'}]})[0].label,'example.invalid','Un enlace público sin título conserva una identidad legible');
assert.deepEqual(sourceEntries({sourceLinks:[{label:'Respaldo',url:'https://usuario:clave@example.invalid'}]}),[{label:'Respaldo',url:'',domain:''}]);

for(const value of [0,-5,1.05321,1.05329,4.12345678,.0000001,1234567.12345678,null,NaN,Infinity]) assert.equal(reportNumber(value),backendNumbers.reportNumber(value),'La misma precisión en pantalla y PDF');
assert.equal(reportNumber(1.05329),'1.05329');assert.equal(reportNumber(0),'0');
for(const [minimum,maximum] of [[1.0532,1.0533],[4.123456,4.123457],[0,0],[100,200]]) {
  const digits=reportAxisDigits(minimum,maximum);assert.equal(digits,backendNumbers.reportAxisDigits(minimum,maximum));
  if(minimum!==maximum) assert.notEqual(reportNumber(minimum,digits),reportNumber(maximum,digits),'El eje distingue extremos próximos');
}

const intraday={type:'line',title:'Precisión intradía de simulación',unit:'unidades de prueba',note:'Datos sintéticos; fechas y horas en UTC.',series:[{label:'Referencia de precisión',points:[{date:'2026-10-13T12:00:00Z',value:1.05321},{date:'2026-10-13T13:00:00Z',value:1.05329}]}]};
const daily={...intraday,series:[{label:'Referencia de precisión',points:[{date:'2026-10-12',value:1.05321},{date:'2026-10-13',value:1.05329}]}]};
const observation=seriesObservation(daily,daily.series[0],'2026-10-13T14:00:00Z');
assert.equal(observation.first.value,1.05321);assert.notEqual(observation.change,'0 %');
const base={title:'Revisión completa de simulación',generatedAt:'2026-10-13T14:00:00Z',
  summary:'Validar la evidencia disponible. '.repeat(80)+'FINDELRESUMEN',objective:'Confirmar alcance y fecha. '.repeat(50)+'FINDELOBJETIVO',closing:'Contrastar condiciones antes de decidir. '.repeat(48)+'FINDELCIERRE',
  sections:Array.from({length:12},(_,i)=>({heading:'Bloque de revisión '+i,text:(i===0 ? 'Verificar fecha, unidad y condición. '.repeat(90) : 'Análisis de simulación. ')+'FINDELBLOQUE'+i})),
  metrics:[{label:'CEROENINDICADOR',value:0}],tables:[{title:'Tabla de ceros',columns:['Referencia','Valor'],rows:[['CEROENCELDA',0]]}],visuals:[intraday],
  takeaways:Array.from({length:7},(_,i)=>'SEÑALCONSERVADA'+i),watchlist:Array.from({length:6},(_,i)=>'RIESGOCONSERVADO'+i),...references,sourceLinks:references.sourceLinks.slice(0,3),
  sourceSnapshot:{missing:{label:'Dato ausente',value:null,previous:10},blank:{label:'Dato vacío',value:' ',previous:10},flag:{label:'Booleano',value:false,previous:10},valid:{label:'Cambio calculado',value:12,previous:10,change:null},zero:{label:'Cero real',value:10,previous:10,change:0}}};
let sample,count=0;
for(const [collection,definition] of Object.entries(collections)) for(const key of definition.reportKeys) {
  // An equity index needs a positive level; its zero session change is valid.
  const report={...base,collection,key,...(key==='equities' ? {metrics:[{label:'Índice de simulación',value:100,change:0}]} : {})},before=JSON.stringify(report),payload=_test.executivePayload(report);
  count++;assert.equal(JSON.stringify(report),before);assert.equal(payload.metrics[0].value,key==='equities' ? '100' : '0',collection+'/'+key);
  if(key==='equities') assert.equal(payload.metrics[0].change,'0');
  assert.equal(payload.tables[0].rows[0][1],'0');assert.deepEqual(payload.sections,report.sections);
  for(const field of ['summary','objective','closing','takeaways','watchlist']) assert.deepEqual(payload[field],report[field],'El PDF conserva '+collection+'/'+key+' · '+field);
  assert.deepEqual(payload.visuals[0].series[0].points,intraday.series[0].points,'No recortar fechas ni cifras');
  if(collection!=='mexico') {
    assert(!payload.comparisons.some(item=>['Dato ausente','Dato vacío','Booleano'].includes(item.label)),'Ausencias no son caídas de mercado');
    assert(Math.abs(payload.comparisons.find(item=>item.label==='Cambio calculado').change-20)<1e-10,'Calcular un cambio ausente con ambos valores válidos');
    assert.equal(payload.comparisons.find(item=>item.label==='Cero real').change,0,'Respetar un cero explícito');
  }
  if(key==='fx') sample=payload;
}
assert.equal(count,14);
const bytes=await _test.makeExecutivePdf(sample.title,sample),task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true}),pdf=await task.promise;
let text='';const links=[];
for(let i=1;i<=pdf.numPages;i++) {
  const page=await pdf.getPage(i),items=(await page.getTextContent()).items;
  const body=items.filter(item=>item.str.trim() && !/^(USO INTERNO|CONFIDENCIAL|COMPARTIBLE|PAGINA)/.test(item.str));
  assert(body.length>4,'Sin hojas vacías');
  for(const item of body) assert(item.transform[5]>=55 && item.transform[4]>=30 && item.transform[4]+item.width<=584,'El contenido completo conserva márgenes: '+item.str);
  text+=items.map(item=>item.str).join(' ')+'\n';links.push(...await page.getAnnotations());
}
for(const marker of ['1.05329','12:00 UTC','13:00 UTC']) assert(text.includes(marker),'Conservar en PDF: '+marker);
for(const marker of ['FINDELRESUMEN','FINDELOBJETIVO','FINDELCIERRE','FINDELBLOQUE0','FINDELBLOQUE11','SEÑALCONSERVADA6','RIESGOCONSERVADO5']) assert(!text.includes(marker),'Presentación de datos sin narrativa: '+marker);
assert(!text.includes('FUENTES Y TRAZABILIDAD'),'Sin apartado de fuentes en PDF');
for(const source of references.sourceLinks.slice(0,2)) assert(!links.some(link=>link.url===source.url),'No exportar la lista de referencias: '+source.url);
await task.destroy();
console.log('Revisión de reportes: OK · 14 subapartados, texto completo, ceros, ausencias, fuentes repetidas, horas, precisión, CSV y PDF');
process.exit(0);
