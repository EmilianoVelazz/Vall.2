import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {availableReportTables,availablePresentationModel,availableReportVisuals,hasPublishedReportData,missingReportValue} from '../shared/report-available-data.mjs';
import {executivePrintEdition} from '../shared/report-print-edition.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {renderIndividualReportPdf}=require('../backend/lib/report-pdf-page-limit');

for(const value of [null,undefined,NaN,Infinity,'','  ','—','—\n2025-10-20','Sin dato de 2024','Sin base comparable','Sin producción reportada','No calculable','No disponible'])assert(missingReportValue(value),String(value));
for(const value of [0,'0','0 %','→ 0 pb',-1,'2025-10-20','USDA','0.000'])assert(!missingReportValue(value),String(value));
const sparse={title:'Cotizaciones',columns:['Referencia','Último','Día %','Mes %'],rows:[['Con cero',0,'→ 0 %','—'],['Sin precio','—','+2 %','+3 %'],['Con mes',12,'—','+3 %']],rowCodes:['ZERO','NONE','MONTH'],rowStates:['A','B','C'],changeColumns:[2,3],costTones:[['neutral','unavailable'],['adverse','adverse'],['unavailable','adverse']]};
const tables=availableReportTables([sparse]);assert.equal(tables.length,2);assert.equal(tables.reduce((sum,table)=>sum+table.rows.length,0),2);assert.equal(tables[0].rows[0][1],0);assert.deepEqual(tables[0].rowCodes,['ZERO']);assert.deepEqual(tables[0].changeColumns,[2]);assert.deepEqual(tables[1].costTones,[['adverse']]);assert.deepEqual(tables[1].rowStates,['C']);
assert.deepEqual(availableReportTables(tables),tables,'Cleaning is idempotent');
const production={title:'Agricultura',columns:['Estado','Maíz (t)','Soya (t)'],rows:[['A','0','Sin producción reportada'],['B','100','50']]};
const crops=availableReportTables([production])[0];assert.equal(crops.rows.length,3);assert(crops.rows.some(row=>row[2]==='0'));assert(!crops.rows.some(row=>row.includes('Sin producción reportada')));
assert.equal(availableReportVisuals([{type:'bar',bars:[{label:'Cero',value:0},{label:'Sin dato',value:NaN}]}])[0].bars.length,1);
assert.equal(availableReportVisuals([{series:[{points:[{date:'2026-01-01',value:1}]}]}]).length,0,'One observation is not a trend');
const empty={results:[{title:'Ausente',columns:['Referencia','Último','Unidad'],rows:[['Maíz','—','t']]}],visuals:[],metrics:[],blocks:[]};
assert(!hasPublishedReportData(empty));
await assert.rejects(renderIndividualReportPdf({report:{},model:empty,render:()=>{throw Error('Must not render an empty PDF');}}),error=>error.status===422 && error.code==='REPORT_DATA_UNAVAILABLE');
const inputs=[];
for(const [collection,name] of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']]){
 const snapshot=JSON.parse(await fs.readFile('backend/cache/'+name+'.json','utf8'));
 inputs.push(...snapshot.reports.map(report=>({...report,collection})));
}
const annual=JSON.parse(await fs.readFile('backend/cache/annual-report-library.json','utf8'));inputs.push(...Object.values(annual.years).flat());
inputs.push(...inputs.filter(report=>!report.reportYear && !report.key.endsWith('news') && report.key!=='overview').map(report=>({...report,analysisPeriod:'weekly'})));
let cells=0,zeros=0;
for(const report of inputs){
 const model=weeklyReport(report),before=JSON.stringify(model),clean=availablePresentationModel(model),print=executivePrintEdition(model,{rows:84,charts:3});
 for(const edition of [clean,print])for(const table of edition.results){
  assert(table.rows.length && table.columns.length>1,report.key+' contains no empty table');
  for(const row of table.rows){assert.equal(row.length,table.columns.length);for(const cell of row){assert(!missingReportValue(cell),report.key+' '+table.title+': '+String(cell));cells++;if(cell===0 || /^0(?:[.,]0+)?(?: %)?$/.test(String(cell)))zeros++;}}
  if(table.rowStates)assert.equal(table.rowStates.length,table.rows.length);
  if(table.rowCodes)assert.equal(table.rowCodes.length,table.rows.length);
 }
 assert.equal(JSON.stringify(model),before,'Complete evidence remains unchanged: '+report.key);
 assert.deepEqual(availablePresentationModel(clean),clean,'Presentation remains stable: '+report.key);
 if(report.key==='mx_production' && !report.reportYear){const table=print.results.find(table=>table.availabilityProduction);assert.equal(new Set(table.rows.map(row=>row[1])).size,4,'Printed selection covers every available crop');}
}
assert(zeros>0,'Genuine zero observations survive');
console.log('Availability: '+inputs.length+' daily, weekly and annual models; '+cells+' populated cells; '+zeros+' genuine zeros; no missing cells, source mutation or metadata misalignment. Empty PDFs rejected.');
