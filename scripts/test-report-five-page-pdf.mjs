import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {getDocument} from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import * as chartGeometry from '../shared/report-chart-geometry.mjs';
import {REPORT_PDF_MAX_PAGES} from '../shared/report-print-edition.mjs';
const require=createRequire(import.meta.url),PDFDocument=require('pdfkit');
const {makeCompanyDashboardPdf}=require('../backend/lib/report-company-dashboard-pdf');
const {renderIndividualReportPdf}=require('../backend/lib/report-pdf-page-limit');
const documents=[];
class ObservedDocument extends PDFDocument {
  constructor(options){super(options);documents.push(this);}
}
const rows=Array.from({length:600},(_,i)=>['Referencia '+i+'\nPaís '+i%8,'USD/kg','24.10','2026-10-21','24.30','2026-10-22']);
const summaryPanels=[{heading:'Lectura',body:'RESUMEN_COMPLETO: cotizaciones sintéticas para comprobar el límite editorial, no precios de mercado.'},{heading:'Causas y límites',body:'CAUSA_COMPLETA: la coincidencia temporal no demuestra causalidad. RIESGO_COMPLETO: confirmar presentación y condiciones de entrega.'}];
const model={sessionReport:true,focusedMarket:true,blocks:[],summaryPanels,results:[{title:'Precios publicados',printGroup:'market-levels',columns:['País / referencia','Unidad original','Cierre anterior','Fecha anterior','Último publicado','Fecha del dato'],rows}],metrics:[],tables:[],visuals:[]};
const report={title:'Prueba del máximo de tres páginas',generatedAt:'2026-10-23T14:00:00Z',tables:[],sections:[],visuals:[]};
const helpers={weekly:model,PDFDocument:ObservedDocument,layout:{collectionLabel:'Finanzas',label:report.title},chartGeometry,pdfPersonalization:()=>({}),pdfPageHeader:doc=>{doc.x=36;doc.y=65;},pdfExecutiveFooter:()=>{},pdfWatermark:()=>{}};
const original=JSON.stringify(model),bytes=await renderIndividualReportPdf({report,model,render:edition=>makeCompanyDashboardPdf(report.title,report,{...helpers,weekly:edition})});
assert(documents[0]._vallPdfPageNumber>REPORT_PDF_MAX_PAGES,'The fixture must really overflow before editorial selection');
const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true}),pdf=await task.promise;
assert(pdf.numPages<=REPORT_PDF_MAX_PAGES);let text='';
for(let number=1;number<=pdf.numPages;number++){
  const page=await pdf.getPage(number),items=(await page.getTextContent()).items.filter(item=>item.str.trim());
  text+=items.map(item=>item.str).join(' ')+' ';
  for(const item of items){
    assert(item.transform[4]>=30 && item.transform[4]+item.width<=page.view[2]-28,'No horizontal clipping');
    assert(item.transform[5]>=55,'No text below the body');
    if(/24\.10|24\.30/.test(item.str))assert(Math.abs(Math.hypot(item.transform[0],item.transform[1])-7.2)<.001,'Quote text keeps its readable 7.2-point size');
  }
}
for(const value of ['RESUMEN_COMPLETO','CAUSA_COMPLETA','RIESGO_COMPLETO','2026-10-21','2026-10-22','USD/kg','24.10','24.30'])assert(text.includes(value),'The delivered PDF contains '+value);
assert(!text.includes('PDF ejecutivo:') && !text.includes('Selección distribuida') && !/\d+ de \d+ filas;/.test(text),'Export mechanics are not printed as an opening');
assert(text.includes('Lectura') && text.includes('Causas y límites'),'Opening keeps its complete original analysis');
assert.equal(JSON.stringify(model),original,'Full table evidence stays available outside the executive PDF');
await task.destroy();
console.log('Three-page overflow PDF: OK · real overflow becomes '+pdf.numPages+' readable pages; no page clipping, font reduction or summary loss.');
