import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {isAnnualReport} from '../shared/report-annual.mjs';
import {reportCsv} from '../frontend/src/lib/reportCsv.js';
import {reportAnnex} from '../frontend/src/lib/reportLibrary.js';
import {createReportDraft} from '../frontend/src/lib/reportCreation.js';
const require=createRequire(import.meta.url);process.env.NODE_ENV='test';process.env.JWT_SECRET='annual-library-fixture';
const {annualStats,buildAnnualReports,createAnnualLibrary}=require('../backend/services/annual-report-library'),{parseAnnualYahoo,parseBls,parseCropProduction,parseSniimAnnual}=require('../backend/lib/report-annual-data'),{normalizeReport}=require('../backend/services/user-report-store'),{_test}=require('../backend/routes/export');
const points=[{date:'2021-12-31',value:100},...Array.from({length:12},(_,index)=>({date:'2022-'+String(index+1).padStart(2,'0')+'-15',value:100+index})),{date:'2023-01-02',value:9999}];
const reference={id:'fixture',label:'Referencia de prueba',unit:'USD/t',bucket:'grains',kind:'price',cadence:'monthly',market:'Mercado de prueba',region:'Europa',source:'SIMULACIÓN',url:'https://example.invalid/serie',series:points};
const stats=annualStats(reference,2022);assert.equal(stats.change,11);assert.equal(stats.months,12);assert.equal(stats.points.length,12);assert.equal(stats.mean,105.5);assert.equal(stats.minimum,100);assert.equal(stats.maximum,111);assert.equal(stats.last.date,'2022-12-15');assert.equal(annualStats({...reference,series:points.filter(point=>point.date!=='2022-06-15')},2022).change,null);assert.equal(annualStats({...reference,series:points.filter(point=>point.date!=='2021-12-31')},2022).change,null);assert.equal(annualStats({...reference,kind:'yield'},2022).change,1100);assert.equal(annualStats({...reference,series:[...points,{date:'2022-05-15',value:999}]},2022).months,11);
assert.equal(annualStats({...reference,cadence:'daily'},2022).change,null,'Un precio diario del 15 de diciembre no es el cierre anual');
const item={symbol:'^FIX',bucket:'equities'},payload={chart:{result:[{meta:{symbol:'^FIX',instrumentType:'INDEX',exchangeTimezoneName:'America/New_York'},timestamp:[Date.parse('2022-12-30T21:00:00Z')/1000,Date.parse('2026-01-02T21:00:00Z')/1000],indicators:{quote:[{close:[50,999]}]}}]}};assert.deepEqual(parseAnnualYahoo(payload,item),[{date:'2022-12-30',value:50}]);assert.throws(()=>parseAnnualYahoo(payload,{...item,symbol:'^OTHER'}));
const zeroIndex=structuredClone(payload);zeroIndex.chart.result[0].indicators.quote[0].close[0]=0;assert.deepEqual(parseAnnualYahoo(zeroIndex,item),[],'Un índice de cero no es una pérdida bursátil histórica');
assert.deepEqual(parseBls({status:'REQUEST_SUCCEEDED',Results:{series:[{seriesID:'TEST',data:[{year:'2022',period:'M01',value:'2.5'},{year:'2022',period:'M13',value:'999'},{year:'2025',period:'M10',value:'-'}]}]}},{symbol:'TEST'}),[{date:'2022-01-01',value:2.5}]);
const csv='Anio,Idestado,Idddr,Idcader,Idmunicipio,Idciclo,Idmodalidad,Idunidadmedida,Nomunidad,Idcultivo,Nomcultivo,Volumenproduccion\n2022,1,1,1,1,1,1,1,Tonelada,1,Maíz grano,2.5\n2022,1,1,1,2,1,1,1,Tonelada,1,Maíz grano,3.5\n2025,1,1,1,3,1,1,1,Tonelada,1,Maíz grano,999';assert.equal(parseCropProduction(csv,2022)[0].corn,6);assert.equal(parseCropProduction(csv,2022)[0].wheat,null);assert.throws(()=>parseCropProduction(csv+'\n'+csv.split('\n')[1],2022));
const sniim='Registros del Año 2022 Pollo Entero <table><tr>'+['Puebla',...Array.from({length:12},(_,i)=>i===6 ? '' : String(i+20))].map(cell=>'<td>'+cell+'</td>').join('')+'</tr></table>';assert.equal(parseSniimAnnual(sniim,2022,{match:'Pollo Entero',label:'Pollo',id:'pollo'}).at(0).series.length,11);assert.throws(()=>parseSniimAnnual(sniim,2023,{match:'Pollo Entero'}));
const data={generatedAt:'2026-10-19T22:00:00Z',references:[reference],production:{},errors:[]};
for(const year of [2022,2023,2024,2025]){
 const reports=buildAnnualReports(data,year);assert.equal(reports.length,14);assert.equal(new Set(reports.map(report=>report.collection+':'+report.key)).size,14);
 for(const report of reports){const model=weeklyReport(report);assert(isAnnualReport(report));assert(model.annualReport);assert(model.blocks.some(block=>block.label==='Resumen anual'));assert(model.blocks.at(-1).label.includes('consecuencias del año'));assert(!model.blocks.some(block=>block.label==='Comparación de sesión'));assert(report.visuals.every(visual=>(visual.series || []).every(series=>series.points.every(point=>point.date.startsWith(year+'-')))));assert(reportAnnex(report).methods.some(item=>item.text.includes('Reconstrucción') || item.text.includes('Preparada')));
  const exported=weeklyReport(_test.executivePayload(report));assert(exported.annualReport);assert.equal(exported.results.reduce((sum,table)=>sum+table.rows.length,0),model.results.reduce((sum,table)=>sum+table.rows.length,0));assert.equal(exported.visuals.length,model.visuals.length);assert(reportCsv(report).includes('Periodo anual'));
  const draft=createReportDraft(report.collection,report).report,saved=normalizeReport(draft);assert(isAnnualReport(saved));assert.equal(weeklyReport(saved).visuals.length,model.visuals.length);
 }
}
const report=buildAnnualReports(data,2022).find(report=>report.key==='grains');assert(reportCsv(report).includes('2022-01-15'));assert(reportCsv(report).includes('2022-12-15'));assert(!reportCsv(report).includes('9999'));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'annual-library-'));let loads=0;const store=createAnnualLibrary({file:path.join(temp,'library.json'),load:async()=>{loads++;return data;}});const [first,second]=await Promise.all([store.get(),store.get()]);assert.strictEqual(first,second);assert.equal(loads,1);assert.equal(Object.values(first.years).flat().length,56);const restored=await createAnnualLibrary({file:path.join(temp,'library.json'),load:async()=>{throw Error('must not load');}}).get();assert.equal(restored.years[2022].length,14);await fs.rm(temp,{recursive:true});
const actual=JSON.parse(await fs.readFile('backend/cache/annual-report-library.json','utf8'));assert.equal(Object.values(actual.years).flat().length,56);
for(const [year,reports] of Object.entries(actual.years)){
 for(const report of reports){
  assert.equal(report.reportYear,Number(year));const model=weeklyReport(report);assert(model.annualReport);
  const exported=weeklyReport(_test.executivePayload(report)),chartValues=value=>JSON.stringify(value.visuals.map(visual=>visual.type==='bar' ? visual.bars : visual.series)).replace(/[\u2013\u2014\u2212]/g,'-');assert.equal(chartValues(exported),chartValues(model),'Downloads keep the same commercial chart values as the reader, allowing PDF dash normalization');
  assert.equal(exported.results.reduce((sum,table)=>sum+table.rows.length,0),report.tables.reduce((sum,table)=>sum+table.rows.length,0),'Separating special-regime currencies never removes their source rows');
 }
 const crops=reports.find(report=>report.key==='mx_production');assert.equal(crops.tables[0].rows.length,32);assert(!crops.tables.some(table=>table.title==='Minería estatal · '+year && year!=='2024'));
}
console.log('Librería anual: OK · 56 ediciones, periodos, cierres anuales, cobertura, fuentes, producción por año, exportación, guardado y persistencia.');
