import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {getDocument} from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {globalEquityComparison,EQUITY_COMPARISON_NOTE,EQUITY_CHART_COLORS} from '../shared/report-equity-comparison.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {executivePrintEdition} from '../shared/report-print-edition.mjs';
import {chartSeriesDash,chartLogScale} from '../shared/report-chart-geometry.mjs';
const require=createRequire(import.meta.url);process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-equity-global-fixture';
const refs=[{label:'A',points:[{date:'2019-12-31',value:50},{date:'2020-01-02',value:100},{date:'2026-10-23',value:120},{date:'2027-01-01',value:999}]},{label:'B',points:[{date:'2020-01-03',value:200},{date:'2026-10-26',value:240}]},{label:'Partial',points:[{date:'2026-07-24',value:10},{date:'2026-10-22',value:11}]},{label:'One point',points:[{date:'2020-01-02',value:10}]}];
const chart=globalEquityComparison(refs,{cutoff:'2026-10-26T14:00:00Z',benchmark:'B'});
assert.deepEqual(chart.series.map(series=>series.label),['B','A','Partial']);
assert.deepEqual(chart.series.find(series=>series.label==='A').points,[{date:'2020-01-02',value:100},{date:'2026-10-23',value:120}]);
assert.equal(chart.series.find(series=>series.label==='Partial').baseDate,'2026-07-24');assert(chart.note.includes(EQUITY_COMPARISON_NOTE));
const log=chartLogScale([50,100,200,400,1600]);assert(Math.abs((log.position(200)-log.position(100))-(log.position(400)-log.position(200)))<1e-12,'Equal proportional changes occupy equal log-axis distances');assert(log.ticks.every(value=>value>0));
assert.equal(new Set(Array.from({length:41},(_,i)=>[i%EQUITY_CHART_COLORS.length,chartSeriesDash(i,EQUITY_CHART_COLORS.length,true)].join('|'))).size,41,'Neutral colors and dash combinations identify all lines');
const cached=JSON.parse(await fs.readFile('backend/cache/finance_executive_reports.json','utf8')).reports.find(report=>report.key==='equities');
const report={...cached,collection:'finance'},snapshot=JSON.stringify(report),model=weeklyReport(report),global=model.visuals.find(visual=>visual.globalComparison);
const minis=model.visuals.filter(visual=>!visual.globalComparison);
assert(minis.length>1,'Regional mini charts are retained alongside the global comparison');
assert(minis.every(visual=>visual.equityComparison && visual.series.length<=8));
for(const mini of minis)assert(mini.series.every(series=>series.points[0].date===mini.indexBaseDate && series.points[0].value===100),'Mini charts retain a common observed base');
assert.equal(EQUITY_CHART_COLORS.length,6);
assert(model.summaryPanels.length<=4,'Keep session, horizons, explanation and implications in a compact executive summary');
for(const heading of ['Qué pasó','Claves por horizonte','Cómo se explica','Repercusiones posibles'])assert(model.summaryPanels.some(panel=>panel.heading===heading));
assert(!model.summaryPanels.some(panel=>/colateral|emitir acciones|mecanismo sólo/.test(panel.body)));
assert.equal(new Set(global.series.map(series=>series.label)).size,global.series.length);
for(const series of global.series){
  const reference=model.references.find(reference=>reference.label===series.label),points=reference.points.filter(point=>point.date>='2020-01-01');
  assert.deepEqual(series.points,points.map(point=>({date:point.date,value:point.value/points[0].value*100})),'No interpolation, arbitrary sampling or loss of the latest observation');
}
assert(model.results.filter(table=>table.printGroup==='market-levels').length===1,'Published closing prices appear in one consolidated table');
assert(model.results.filter(table=>table.printGroup==='market-returns').length===1,'All available horizons share one comparison table');
const benchmark=model.results.find(table=>table.title.startsWith('Comparación de '));
assert(!benchmark || !benchmark.columns.includes('Variación de la bolsa'),'Daily changes are not copied into a second comparison table');
const print=executivePrintEdition(model,{rows:1,charts:1});
assert(print.visuals.includes(global),'The complete historical chart survives executive PDF selection');
assert(print.visuals.some(visual=>visual.executiveLead),'The main visual survives executive PDF selection');
assert.equal(new Set(print.visuals).size,print.visuals.length,'Essential figures are not duplicated');
const output='output/bolsa-global-20261026';await fs.mkdir(output,{recursive:true});
const {_test}=require('../backend/routes/export');
const bytes=await _test.makeExecutivePdf(report.title,_test.executivePayload(report));await fs.writeFile(output+'/bolsa-global.pdf',bytes);
const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true}),pdf=await task.promise;let text='';
try{
  assert(pdf.numPages<=5);
  for(let i=1;i<=pdf.numPages;i++)text+=(await(await pdf.getPage(i)).getTextContent()).items.map(item=>item.str).join(' ')+' ';
  const legend=text.slice(text.indexOf('Bolsas globales')).replace(/\s+/g,'');
  for(const series of global.series){assert(legend.includes(series.label.replace(/\s+/g,'')),'PDF legend contains '+series.label);assert(legend.includes(series.baseDate),'PDF base date is visible');}
}finally{await task.destroy();}
assert.equal(JSON.stringify(report),snapshot);
console.log('Global equities: OK · '+global.series.length+' indices, 2020–latest, explicit partial histories, all observations, deduplicated tables, complete PDF chart and five-page limit.');
