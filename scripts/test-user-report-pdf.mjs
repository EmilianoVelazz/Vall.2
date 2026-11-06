import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {getDocument,OPS} from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const require=createRequire(import.meta.url);
process.env.JWT_SECRET='isolated-user-report-pdf-secret';
process.env.NODE_ENV='test';
delete process.env.USER_PASSWORD;
const {_test}=require('../backend/routes/export');
const report={userEdition:true,personalization:{recipientName:'Ana',confidentiality:'confidential'},title:'Mi informe personalizado',summary:'Mi resumen '+ 'dato '.repeat(450)+'FINALRESUMEN',objective:'Objetivo del usuario',sections:[{heading:'Análisis propio',text:'texto '.repeat(800)+'FINALSECCION'}],closing:'CIERREPERSONAL',takeaways:['CONCLUSIONPERSONAL'],watchlist:['RIESGOPERSONAL'],sources:['Fuente escrita'],sourceLinks:[{label:'Mi enlace',url:'https://example.org/evidencia'}],tables:[{title:'Tabla completa',columns:Array.from({length:8},(_,i)=>'Columna '+i),rows:[Array.from({length:8},(_,i)=>'CELDA'+i)]}]};
const normalized=_test.executivePayload(report);
assert.equal(normalized.executiveBrief,null);
const wideRows=Array.from({length:3},(_,row)=>Array.from({length:12},(_,column)=>column ? `FILA${row}DATO${column}` : `IDENTIDAD${row}`));
report.tables=[{title:'Tabla completa',columns:Array.from({length:12},(_,i)=>'Columna '+i),rows:wideRows}];
report.metrics=Array.from({length:30},(_,i)=>({label:`METRICA${i}`,value:`VALOR${i}`,change:`CAMBIO${i}`}));
report.metrics[4].value='r\n'.repeat(50)+'FINALMETRICA';
report.watchlist.push('Riesgo extenso\n'.repeat(85)+'FINALRIESGO');
report.baseReport={collection:'mexico',key:'mx_proteins',title:'Proteínas por estado',generatedAt:'2026-10-12T14:00:00Z'};
report.personalization.depth='detailed';
const complete=_test.executivePayload(report);
assert.equal(complete.collection,'mexico','Una edición conserva la colección de su base');
const bytes=await _test.makeExecutivePdf(report.title,complete);
const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true});const pdf=await task.promise;
let text='',annotations=[];for(let number=1;number<=pdf.numPages;number++) {
 const page=await pdf.getPage(number),items=(await page.getTextContent()).items,operators=await page.getOperatorList();
 annotations.push(...await page.getAnnotations());
 assert(operators.fnArray.includes(OPS.paintImageXObject),'La marca de agua se conserva en la página '+number);
 assert(operators.fnArray.lastIndexOf(OPS.paintImageXObject)>operators.fnArray.lastIndexOf(OPS.showText),'La marca permanece visible sobre los fondos de la página '+number);
 for(const item of items.filter(item=>!item.str.startsWith('CONFIDENCIAL') && !item.str.startsWith('PAGINA'))) assert(item.transform[5]>=55,'Separar contenido y pie: '+item.str);
 text+=items.map(item=>item.str).join(' ')+'\n';
}
for(const value of ['CONFIDENCIAL','Mi informe personalizado','HOJA 01','METRICA29','Sin dato']) assert(text.includes(value),'El PDF conserva '+value);
for(const value of ['FINALMETRICA','VALOR29','CAMBIO29']) assert(!text.includes(value),'No presentar valores sin fecha como datos diarios: '+value);
assert(complete.metrics[4].value.includes('FINALMETRICA'),'Los datos originales permanecen guardados');
for(const value of ['Detallado con evidencia','FINALRESUMEN','FINALSECCION','CIERREPERSONAL','CONCLUSIONPERSONAL','RIESGOPERSONAL','FINALRIESGO']) assert(!text.includes(value),'El PDF de datos excluye '+value);
for(const row of wideRows) {
 assert(!text.includes(row[0]),'La tabla sin fechas queda fuera de la comparación diaria');
 for(const cell of row.slice(1)) assert(complete.tables[0].rows.some(stored=>stored.includes(cell)),'Las doce columnas permanecen en la edición guardada: '+cell);
}
assert(!text.includes('FUENTES Y TRAZABILIDAD'),'Sin apartado de fuentes en ediciones guardadas');
assert(!annotations.some(item=>item.subtype==='Link' && item.url==='https://example.org/evidencia'),'Sin lista de enlaces en PDF');
assert(!text.includes('Síntesis determinista'),'No atribuir validación automática al texto del usuario');
const excluded=_test.executivePayload({...report,personalization:{audience:'purchasing',decisionHorizon:'month',recipientName:'Jefe',organization:'Empresa',confidentiality:'confidential',sections:{tables:false,risks:false,sources:false}}});
assert.deepEqual(excluded.tables,[]);assert.deepEqual(excluded.watchlist,[]);assert.deepEqual(excluded.sources,[]);assert.equal(excluded.personalization.audience,'Compras y abastecimiento');assert.equal(excluded.personalization.horizon,'Próximos 30 días');assert.equal(excluded.personalization.organization,'Empresa');
await task.destroy();
const excludedTask=getDocument({data:new Uint8Array(await _test.makeExecutivePdf(report.title,excluded)),useSystemFonts:true,disableFontFace:true}),excludedPdf=await excludedTask.promise;
let excludedText='';for(let number=1;number<=excludedPdf.numPages;number++) {const page=await excludedPdf.getPage(number);assert.equal((await page.getAnnotations()).filter(item=>item.subtype==='Link').length,0,'No exportar enlaces excluidos');excludedText+=(await page.getTextContent()).items.map(item=>item.str).join(' ');}
for(const value of ['RIESGOPERSONAL','IDENTIDAD0','Mi enlace','FUENTES Y TRAZABILIDAD']) assert(!excludedText.includes(value),'Respetar bloques excluidos: '+value);
await excludedTask.destroy();
const short={userEdition:true,title:'Informe breve de simulación',generatedAt:'2026-10-12T14:00:00Z',summary:'Validar la presentación y conservar la identidad institucional del documento.',sections:[{heading:'Acción a revisar',text:'Confirmar fecha, presentación y fuente antes de comparar referencias.'}]};
const shortBytes=await _test.makeExecutivePdf(short.title,_test.executivePayload(short)),shortTask=getDocument({data:new Uint8Array(shortBytes),useSystemFonts:true,disableFontFace:true}),shortPdf=await shortTask.promise;
assert.equal(shortPdf.numPages,1,'Un informe breve conserva una sola página');assert((await (await shortPdf.getPage(1)).getOperatorList()).fnArray.includes(OPS.paintImageXObject),'El informe de una página también conserva la marca');await shortTask.destroy();
if(process.argv.includes('--preview')) {
 await fs.mkdir('output/pdf',{recursive:true});await fs.writeFile('output/pdf/informe-nuevo-breve-marca.pdf',shortBytes);
 const sample={...short,title:'Plan de abastecimiento · simulación',personalization:{audience:'purchasing',depth:'detailed',decisionHorizon:'month',recipientName:'Comité de compras',organization:'Empresa de simulación',confidentiality:'internal'},
 summary:'Este informe utiliza datos de simulación para revisar el formato de una edición propia. La comparación distingue el costo por kilogramo de las condiciones de entrega; las referencias se deben validar antes de comprar.',
 objective:'Revisar costos, disponibilidad y condiciones comerciales para el siguiente abastecimiento.',
 takeaways:['Confirmar que las cotizaciones correspondan a la misma presentación y etapa comercial.','Contrastar el plazo de entrega y el inventario disponible con el proveedor.'],
 sections:[{heading:'Costos y condiciones de compra',text:'La referencia de simulación de pollo es de 40 MXN/kg. Para compararla, el equipo debe confirmar presentación, volumen, impuestos y transporte. Estas condiciones pueden cambiar el costo final aunque el precio publicado sea igual.\n\nEl dato sirve únicamente para comprobar el diseño del documento. No constituye una cotización actual ni una oferta de compra.'},{heading:'Disponibilidad y seguimiento',text:'Antes de formalizar una compra, registrar proveedor, fecha de observación, cantidad confirmada y plazo de entrega. Conservar el respaldo de cada referencia para que compras y finanzas trabajen sobre el mismo corte.'}],
 watchlist:['No comparar una referencia en pie con carne en canal o cortes.','Confirmar vigencia y condiciones de entrega antes de aprobar el pedido.'],
 closing:'Solicitar cotizaciones comparables y confirmar el costo total antes de decidir.',
 metrics:[{label:'Referencia de simulación · pollo',value:'40 MXN/kg',change:'Presentación y vigencia por confirmar'},{label:'Horizonte de revisión',value:'30 días',change:'Plazo del plan; no es una proyección de precio'},{label:'Prioridad comercial',value:'Costo total',change:'Revisar impuestos, transporte y entrega'}],
 tables:[{title:'Lista de revisión de la compra',columns:['Validaciones del equipo'],rows:[['Presentación, cantidad y unidad de la cotización.'],['Fecha de observación, impuestos, transporte y condiciones de entrega.']]},{title:'Comparabilidad de referencias · simulación',columns:['Producto','Etapa','Presentación','Unidad','Precio','Fecha','Transporte','Vigencia'],rows:[['Pollo','Por confirmar','Por confirmar','MXN/kg','40 · simulación','Sin fecha comercial','Por confirmar','Por confirmar'],['Res','Por confirmar','Por confirmar','Por confirmar','Sin cotización','Sin fecha comercial','Por confirmar','Por confirmar']]}],
 sources:['Datos de simulación preparados para revisar el formato del informe.'],sourceLinks:[{label:'Referencia de ejemplo para validar enlaces',url:'https://example.org/evidencia'}]};
 await fs.writeFile('output/pdf/informe-nuevo-marca-espacios.pdf',await _test.makeExecutivePdf(sample.title,_test.executivePayload(sample)));
}
console.log('User report PDF: OK · marca, espacios, texto y tarjetas extensas, 30 indicadores, 12 columnas con identidad repetida, enlaces activos, colección y exclusiones');
process.exit(0);
