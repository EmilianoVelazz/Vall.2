import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {marketPeriods} from '../shared/report-market-analysis.mjs';
import {proteinAmericasComparison} from '../shared/report-protein-americas.mjs';
import {availablePresentationModel,availableReportTables,missingReportValue} from '../shared/report-available-data.mjs';
import {executivePrintEdition,PROTEIN_PDF_MAX_PAGES} from '../shared/report-print-edition.mjs';
import {filteredReportModel} from '../shared/report-view-filters.mjs';
import {createReportDraft} from '../frontend/src/lib/reportCreation.js';
import {reportCsv} from '../frontend/src/lib/reportCsv.js';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const require=createRequire(import.meta.url);process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const {_test}=require('../backend/routes/export'),{makeReportWorkbook}=require('../backend/lib/report-workbook'),JSZip=require('jszip');
const points=[{date:'2025-11-04',value:40},{date:'2026-05-04',value:80},{date:'2026-11-03',value:90},{date:'2026-11-04',value:100}],fixture=(country,cadence='daily',series=points)=>({label:'Cerdo de prueba · '+country,country,sector:'Porcino',symbol:country,unit:'MONEDA/kg canal',source:'SIMULACIÓN',url:'https://example.invalid',cadence,points:series,last:series.at(-1),previous:series.at(-2),periods:marketPeriods(series,cadence)});
const mexico=fixture('México'),weekly=fixture('Chile','weekly',[{date:'2026-10-26',value:10},{date:'2026-11-02',value:11}]),alone=fixture('Colombia','weekly',[{date:'2026-10-30',value:20}]),before=JSON.stringify([mexico,weekly,alone]),comparison=proteinAmericasComparison([mexico,weekly,alone]);
const daily=comparison.tables.find(table=>table.cadence==='daily');assert(daily.columns.includes('Día anterior · %'));assert(daily.rows[0][4].includes('11.111 %') && daily.rows[0][4].includes('2026-11-03'));assert(daily.rows[0][daily.columns.indexOf('Semestre · %')].includes('+25 %') && daily.rows[0][daily.columns.indexOf('Semestre · %')].includes('2026-05-04'));assert(daily.rows[0][daily.columns.indexOf('Año · %')].includes('+150 %') && daily.rows[0][daily.columns.indexOf('Año · %')].includes('2025-11-04'));
const periodic=comparison.tables.find(table=>table.cadence==='periodic');assert(periodic.columns.includes('Publicación anterior · %'));assert(!periodic.columns.includes('Día anterior · %'));assert(periodic.rows[0][4].includes('+10 %'));assert(periodic.rows[1].slice(4).every(value=>value===null));
assert.equal(JSON.stringify([mexico,weekly,alone]),before,'Comparison does not change original prices or dates');
for(const table of availableReportTables(comparison.tables))for(const row of table.rows)assert(row.every(value=>!missingReportValue(value)),'Missing horizons do not become empty fields or fake zeros');
const current=JSON.parse(await fs.readFile('backend/cache/market_executive_reports.json','utf8')).reports.find(item=>item.key==='proteins'),snapshot=JSON.stringify(current),model=weeklyReport(current),wanted=['México','Estados Unidos','Canadá','Brasil','Argentina','Chile','Colombia','Perú'];
assert.equal(PROTEIN_PDF_MAX_PAGES,6);assert(model.proteinPurchasing);assert.equal(model.results.filter(table=>table.proteinSectorBoard).length,4);
await assert.rejects(require('../backend/lib/report-pdf-page-limit').renderIndividualReportPdf({report:{},model,render:async()=>({reportPageCount:7}),renderCompact:async()=>({reportPageCount:7})}),/seis páginas/,'The expanded purchasing edition never accepts seven pages');
assert.equal(model.references[0].country,'México');assert(model.results[0].proteinUsdMatrix);for(const country of wanted)assert(model.results.some(table=>table.proteinSectorBoard && table.rows.some(row=>row[0].startsWith(country+'\n'))),'American country is visible: '+country);
for(const table of model.results.filter(table=>!table.proteinAmericas && (table.printGroup==='market-levels' || table.printGroup==='market-returns')))assert(!table.rows.some(row=>model.references.some(item=>wanted.includes(item.country) && row[0].split('\n')[0]===item.label)),'American observations are not duplicated in global price/horizon boards');
for(const rows of [70,32,16,8]){
 const edition=executivePrintEdition(model,{rows,charts:2,selectPrices:true}),selected=edition.results.filter(table=>table.proteinSectorBoard).flatMap(table=>table.rows),countries=new Set(selected.map(row=>row[0].split('\n')[0]));
 for(const country of wanted)assert(countries.has(country),'Compact PDF keeps '+country+' even with row budget '+rows);
 for(const species of ['Cerdo','res','Pollo','Huevo'])assert(model.results.filter(table=>table.proteinSectorBoard).flatMap(table=>table.rows).some(row=>row[0].startsWith('México\n') && row[0].toLowerCase().includes(species.toLowerCase())),'The full reader retains Mexican '+species);
 assert(edition.results.filter(table=>table.proteinSectorBoard).length===4,'Pork, beef, poultry and egg boards stay separate');
 assert(selected.some(row=>row[0].includes('Cerdo cebado normal')),'The Spanish benchmark survives selection');
 assert(edition.results.some(table=>table.proteinHistoryTable),'2020 history is retained');
}
const filtered=availablePresentationModel(filteredReportModel(model,current,{country:'México'}));assert(filtered.results.filter(table=>table.proteinSectorBoard).every(table=>table.rows.every(row=>row[0].startsWith('México\n'))));assert(filtered.visuals.some(visual=>visual.proteinAmericas));
for(const input of [createReportDraft('markets',current).report,_test.executivePayload(current)]){
 const copy=weeklyReport(input);assert.deepEqual(copy.results,model.results,'Copies retain the sector boards, matrix and the exact dated evidence');
}
assert(reportCsv(current).includes('respaldo numérico de las variaciones de proteínas'));const zip=await JSZip.loadAsync(await makeReportWorkbook(current));assert((await zip.file('xl/workbook.xml').async('string')).includes('Datos de gráficas'));
const directory='output/proteinas-cobertura-20261104';await fs.mkdir(directory,{recursive:true});
for(const [name,input]of [['diario',current],['semanal',{...current,analysisPeriod:'weekly'}]]){
 const bytes=await _test.makeExecutivePdf(input.title,input),task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise;assert(pdf.numPages<=PROTEIN_PDF_MAX_PAGES);let text='';
 for(let index=1;index<=pdf.numPages;index++){const page=await pdf.getPage(index),items=(await page.getTextContent()).items.filter(item=>item.str.trim());text+=items.map(item=>item.str).join(' ');for(const item of items){assert(item.transform[4]>=24 && item.transform[4]+item.width<=page.view[2]-22,'No horizontal clipping');assert(item.transform[5]>=42,'No vertical clipping');assert(item.str.trim()!=='—','No empty field');}}
 assert(pdf.numPages<7);for(const country of wanted)assert(text.includes(country),'Country appears in printed evidence: '+country);
 for(const term of ['mes','semestre','año','2020','usd/kg'])assert(text.toLocaleLowerCase('es').includes(term),'Comparison field survives export: '+term);
 for(const term of ['Estados Unidos','USDA','CME','cutout negociado','Vacuno Choice','Pollo entero','Mercolleida','Cerdo cebado normal','Sector porcino','Sector vacuno','Avícola'])assert(text.includes(term),'Visible business coverage in the actual PDF: '+term);
 await fs.writeFile(directory+'/'+name+'.pdf',bytes);await task.destroy();console.log(name+': '+pdf.numPages+' pages; eight American countries, Mexico, prior session, semester, year and 2020 history.');
}
assert.equal(JSON.stringify(current),snapshot);console.log('Americas proteins: exact dated arithmetic, periodic-vs-daily distinction, no invented horizons, eight-country PDF protection, Mexico species coverage, filters, immutable copies and full exports pass.');
