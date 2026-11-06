import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {compactMarketPoints,marketPeriods} from '../shared/report-market-analysis.mjs';
import {energyExecutiveReport} from '../shared/report-energy-executive.mjs';
import {filteredReportModel} from '../shared/report-view-filters.mjs';
import {createReportDraft} from '../frontend/src/lib/reportCreation.js';
import {availablePresentationModel} from '../shared/report-available-data.mjs';
import {executivePrintEdition,THREE_PAGE_BUDGETS} from '../shared/report-print-edition.mjs';

process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const require=createRequire(import.meta.url),{_test}=require('../backend/routes/export'),{makeReportWorkbook}=require('../backend/lib/report-workbook'),{publicXlsxSheet}=require('../backend/lib/report-public-xlsx');
const folder='output/energia-metales-20261105';await fs.mkdir(folder,{recursive:true});
const report=JSON.parse(await fs.readFile('backend/cache/market_executive_reports.json','utf8')).reports.find(item=>item.key==='energy_metals'),before=JSON.stringify(report),model=weeklyReport(report);
assert.equal(model.energyExecutive.referenceCount,14);assert.equal(model.energyExecutive.physicalCount,3);assert.equal(model.energyExecutive.futuresCount,11);
assert.equal(model.results.filter(table=>table.energyPrices).flatMap(table=>table.rows).length,14);
const presentation=availablePresentationModel(model);
assert.equal(presentation.results.filter(table=>table.energyPrices).flatMap(table=>table.rows).length,14);
for(const table of presentation.results)for(const row of table.rows)assert(row.every(value=>value!==null && value!==undefined && String(value).trim() && String(value)!=='—'),'No blank placeholders');
for(const budget of THREE_PAGE_BUDGETS){const printed=executivePrintEdition(model,budget);assert.equal(printed.results.filter(table=>table.energyPrices).flatMap(table=>table.rows).length,14,'Never discard a published current price');assert.equal(printed.visuals.find(visual=>visual.energyHistoryOverview).series.length,14);}
const history=model.energyExecutive.history;
assert.equal(history.series.length,14);
const china=filteredReportModel(model,report,{country:'China'}),chinaCount=model.references.filter(item=>item.country==='China').length;
assert(chinaCount>0);assert.equal(china.results.filter(table=>table.energyPrices).flatMap(table=>table.rows).length,chinaCount);assert.equal(china.visuals.find(visual=>visual.energyHistoryOverview).series.length,chinaCount,'Stable codes preserve country filters');
for(const series of history.series){const reference=model.references.find(item=>series.label.endsWith(item.label)),base=reference.points.find(point=>point.date===series.baseDate);assert(base);assert.equal(series.points[0].value,100);assert.equal(series.points.at(-1).date,reference.last.date);assert.equal(series.points.length,reference.points.filter(point=>point.date>=base.date).length);for(const point of series.points){assert.equal(point.value,reference.points.find(item=>item.date===point.date).value/base.value*100);assert(Number.isFinite(point.value));}}
const physical=model.references.find(item=>item.symbol==='EIA-WTI-SPOT');
const physicalBase=physical.points.find(point=>point.date>='2020-01-01');assert.equal(physicalBase.date,'2020-01-02');assert.equal(physicalBase.value,61.17);
assert.equal(physical.points.find(point=>point.date==='2020-04-20').value,-36.98,'Preserve actual negative WTI');
assert(history.series.find(item=>item.label.endsWith(physical.label)).points.some(point=>point.value<0),'Linear chart must retain negative indexed values');
const features=model.visuals.filter(visual=>visual.energyFeature);assert.equal(features.length,2);
for(const chart of features){assert.equal(new Set(chart.series.map(series=>model.references.find(item=>item.label===series.label).unit)).size,1);assert.equal(new Set(chart.series.map(series=>/^EIA-/.test(model.references.find(item=>item.label===series.label).symbol))).size,1,'Do not mix futures and physical prices');assert(chart.series.every(series=>series.points[0].date.startsWith('2020-')));}
assert(!model.summaryPanels.some(panel=>/baja laboral/i.test(panel.body)),'Unrelated news must not appear');
const points=[{date:'2020-01-02',value:60},{date:'2020-04-20',value:-37},{date:'2020-04-21',value:0},{date:'2022-03-08',value:130},{date:'2026-11-03',value:90},{date:'2026-11-04',value:91}],compacted=compactMarketPoints(points,'daily',2,{preserveExtremes:true});
assert.deepEqual(compacted,points,'Preserve extrema, zero and negative observations even outside recent sessions');
const partialPoints=[{date:'2024-01-02',value:50},{date:'2026-11-04',value:60}],partial={...physical,label:'Referencia parcial',points:partialPoints,last:partialPoints.at(-1),periods:marketPeriods(partialPoints)};
const partialModel=energyExecutiveReport(report,{...model,references:[partial],visuals:[],results:[],annexTables:[]});
assert.equal(partialModel.energyExecutive.history.series[0].baseDate,'2024-01-02');assert.equal(partialModel.energyExecutive.history.series[0].partialHistory,true);assert.equal(partial.periods.since2020,null);
const nonpositive={...partial,points:[{date:'2020-01-02',value:0},partialPoints.at(-1)],periods:{}};
assert.equal(energyExecutiveReport(report,{...model,references:[nonpositive],visuals:[],results:[],annexTables:[]}).energyExecutive.history,null,'Never divide by zero or invent a 2020 base');
assert.equal(weeklyReport({...report,personalization:{sections:{charts:false}}}).visuals.length,0);
assert.equal(weeklyReport({...report,personalization:{sections:{tables:false}}}).results.length,0);
for(const [name,input] of [['diario',report],['semanal',{...report,analysisPeriod:'weekly'}]]){
 const bytes=await _test.makeExecutivePdf(input.title,input),task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise;assert(pdf.numPages<=3);
 let text='';
 for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),items=(await page.getTextContent()).items.filter(item=>item.str.trim());for(const item of items){assert(item.transform[4]>=24 && item.transform[4]+item.width<=page.view[2]-22,'No horizontal clipping');assert(item.transform[5]>=42,'No footer collisions');}text+=items.map(item=>item.str).join(' ')+' ';}
 for(const reference of model.references)assert(text.includes(reference.label),'PDF retains every current reference: '+reference.label);
 for(const label of ['2020','2026','WTI y Brent físicos','futuros continuos','Comparación histórica','Índice final'])assert(text.toLowerCase().includes(label.toLowerCase()),'PDF contains '+label);
 assert(!/NaN|Infinity|\(cid:/.test(text));await fs.writeFile(folder+'/energia-'+name+'.pdf',bytes);await task.destroy();console.log(name+': '+pdf.numPages+' páginas; 14 precios y 3 gráficas históricas.');
}
const workbook=await makeReportWorkbook(report),master=await publicXlsxSheet(workbook,'Maestra energía',{maxRows:100,maxColumns:16}),historical=await publicXlsxSheet(workbook,'Historia energía',{maxRows:10000,maxColumns:8});
assert.equal(master.length,15);assert.equal(historical.length,history.series.reduce((sum,item)=>sum+item.points.length,0)+1);assert(historical.some(row=>row[5]<0));
for(const row of master.slice(1)){const reference=model.references.find(item=>item.label===row[1]);assert.equal(row[6],reference.last.value);assert.equal(row[9],reference.points.find(point=>point.date>='2020-01-01').value);}
await fs.writeFile(folder+'/energia-datos.xlsx',workbook);assert.equal(JSON.stringify(report),before);
const {normalizeReport}=require('../backend/services/user-report-store');
for(const copy of [normalizeReport(createReportDraft('markets',report).report),_test.executivePayload(report)]){const saved=weeklyReport(copy);assert.deepEqual(saved.energyExecutive.history,history);assert.deepEqual(saved.results,model.results,'Saved/exported reports retain all current prices and variations');}
console.log('Energía: datos originales inmutables, 2020 real, historias parciales explícitas, negativos y cero preservados, unidades y tipos de precio separados, Excel numérico y PDF diario/semanal sin recortes.');
