import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {availableReportTables,missingReportValue} from '../shared/report-available-data.mjs';
import {executivePrintEdition,THREE_PAGE_BUDGETS} from '../shared/report-print-edition.mjs';

process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const require=createRequire(import.meta.url),{_test}=require('../backend/routes/export');
const {getDocument}=await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const report=JSON.parse(await fs.readFile(new URL('../backend/cache/market_executive_reports.json',import.meta.url),'utf8')).reports.find(item=>item.key==='grains');
const before=JSON.stringify(report),model=weeklyReport(report),folder=new URL('../output/bolsa-tablas-granos-20261105/',import.meta.url);
await fs.mkdir(folder,{recursive:true});
const sparse={title:'Variaciones verificadas',preserveNumericGrid:true,printGroup:'market-returns',columns:['Referencia','Mes','Año'],rows:[['A','0 %','2 %'],['B','3 %',null],['C',null,'4 %']]};
const grouped=availableReportTables([sparse]);
assert.equal(grouped.flatMap(table=>table.rows).length,3);
assert(grouped.every(table=>!table.availabilityFacts && table.rows.every(row=>row.every(cell=>!missingReportValue(cell)))));
assert.deepEqual(availableReportTables(grouped),grouped,'Repeated presentation filtering preserves numeric groups');
const stats=[];
for(const analysisPeriod of ['daily','weekly']){
 const input={...report,analysisPeriod},reading=weeklyReport(input);
 for(const budget of THREE_PAGE_BUDGETS){
  const print=executivePrintEdition(reading,budget);
  assert.equal(print.results.filter(table=>table.printGroup==='market-levels').flatMap(table=>table.rows).length,reading.references.length,'Every budget retains every current grain price');
  assert(print.results.every(table=>!table.availabilityFacts && table.rows.every(row=>row.every(cell=>!missingReportValue(cell)))),'Numeric tables must not become prose or contain empty cells');
 }
 const buffer=await _test.makeExecutivePdf(input.title,_test.executivePayload(input)),task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise;
 try{
  assert(pdf.numPages<=3);const pages=[];
  for(let number=1;number<=pdf.numPages;number++){
   const page=await pdf.getPage(number),items=(await page.getTextContent()).items.filter(item=>item.str.trim());
   for(const item of items){assert(item.transform[4]>=25 && item.transform[4]+item.width<=page.view[2]-24,item.str);assert(item.transform[5]>=37,item.str);}
   pages.push(items.map(item=>item.str).join(' ').replace(/\s+/g,' '));
  }
  const text=pages.join(' ');
  for(const reference of reading.references){assert(text.includes(reference.label),reference.label+' current price must remain in the PDF');assert(text.includes(reference.unit),reference.unit);assert(text.includes(reference.last.date),reference.last.date);}
  assert(!text.includes('Datos publicados'));assert(text.includes('2020') && text.includes('2025'));assert(text.includes('Interés abierto'));
  const firstPrice=pages.findIndex(text=>text.includes('Tabla maestra')),firstChart=pages.findIndex(text=>text.includes('COMPARATIVAS E HISTORIA'));assert(firstPrice>=0 && firstPrice<=firstChart,'The complete master table precedes charts');
  const atlas=pages.find(text=>text.includes(reading.grainGlobalHistory.title));assert(atlas,'The historical chart is inside the downloaded PDF');
  for(const series of reading.grainGlobalHistory.series)assert(atlas.includes(series.shortLabel),series.label+' must be present in the historical chart');
  await fs.writeFile(new URL('granos-'+analysisPeriod+'.pdf',folder),buffer);
  stats.push({edition:analysisPeriod,pages:pdf.numPages,currentPrices:reading.references.length,bytes:buffer.length});
 }finally{await task.destroy();}
}
assert.equal(JSON.stringify(report),before);assert(model.references.length>0);
await fs.writeFile(new URL('granos-validacion.json',folder),JSON.stringify(stats,null,2));
console.log('Granos: all current prices retained, numeric grids without blanks, original units/dates, daily/weekly PDFs <=3 pages, and immutable evidence.',JSON.stringify(stats));
