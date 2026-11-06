import assert from 'node:assert/strict';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {compactMarketPoints} from '../shared/report-market-analysis.mjs';
import {reportLinePanels} from '../shared/report-chart-density.mjs';
import {equityHistoryGeometry,equityHistorySvg} from '../shared/report-equity-history-svg.mjs';
import {equityHistoryChart} from '../shared/report-equity-history-chart.mjs';
import {filteredReportModel} from '../shared/report-view-filters.mjs';
const symbols=['^GSPC','^MXX','^BVSP','^GDAXI'],names=['S&P 500','S&P/BMV IPC','Ibovespa','DAX 40'],countries=['Estados Unidos','México','Brasil','Alemania'];
const equities=Array.from({length:41},(_,index)=>({label:names[index] || 'Índice '+index,symbol:symbols[index] || 'SYM'+index,market:countries[index] || 'Japón',region:index===3 ? 'Europa' : index<3 ? 'América' : 'Asia',currency:'USD',series:[{date:'2019-12-31',value:100},{date:index===40 ? '2024-02-01' : '2020-01-02',value:100+index},{date:'2026-10-22',value:120+index},{date:'2026-10-23',value:index===1 ? 90 : 130+index},{date:'2026-10-25',value:999999}],source:'Fuente de prueba',url:'https://example.invalid/indices'}));
const report={key:'equities',collection:'finance',title:'Bolsa',generatedAt:'2026-10-24T12:00:00Z',sourceSnapshot:{equities}},before=JSON.stringify(report),model=weeklyReport(report),visual=model.visuals.find(item=>item.equityHistoryOverview);
assert(visual);assert.equal(visual.series.length,41,'Every equity with an observed history is available, including Mexico and Brazil');
assert(visual.series.every(series=>series.points[0].value===100 && series.points.every(point=>point.date>='2020-01-01' && point.date<=report.generatedAt.slice(0,10))));
assert.equal(visual.series.find(item=>item.label==='Índice 40').baseDate,'2024-02-01','A partial history cannot invent 2020 observations');
for(const series of visual.series){const original=equities.find(item=>item.label===series.label),base=original.series.find(point=>point.date===series.baseDate);for(const point of series.points)assert.equal(point.value,original.series.find(item=>item.date===point.date).value/base.value*100);}
assert.equal(visual.series.find(item=>item.label==='Ibovespa').returnBasis,'total-return');
const chart=equityHistoryChart(visual);assert.equal(chart.series.length,41);assert.equal(new Set(chart.series.map(item=>item.color+'|'+item.dash)).size,41);for(const item of chart.series){assert.deepEqual(item.points,visual.series.find(series=>series.label===item.label).points);for(const point of item.points){assert(chart.x(point.date)>=0 && chart.x(point.date)<=1);assert(chart.y(point.value)>=0 && chart.y(point.value)<=1);}}assert.equal(equityHistoryChart(null),null);
const unified=reportLinePanels(visual);assert.equal(unified.length,1);assert.equal(unified[0].series.length,41,'The requested global history is one chart');
const panels=reportLinePanels({...visual,unifiedHistory:false});assert(panels.every(item=>item.series.length<=4));assert.equal(panels.flatMap(item=>item.series).length,41);assert.equal(new Set(panels.flatMap(item=>item.series.map(series=>series.label))).size,41);
const filtered=filteredReportModel(model,report,{country:'Brasil'}).visuals.find(item=>item.equityHistoryOverview);assert.equal(filtered.series.length,1);assert.equal(filtered.series[0].label,'Ibovespa');
const svg=equityHistorySvg(visual);for(const series of visual.series)assert(svg.includes(series.label.replaceAll('&','&amp;')));assert.equal((svg.match(/<path /g)||[]).length,41,'One independent trajectory per index in the downloadable atlas');assert(svg.includes('2020-01-02')&&svg.includes('2026-10-23'));assert(!svg.includes('NaN')&&!svg.includes('Infinity'));
const malicious=equityHistorySvg({...visual,title:'"><script>alert(1)</script>',series:[{...visual.series[0],label:'<image href="https://evil.invalid" onload="bad()"/>'}]});assert(!malicious.includes('<script')&&!malicious.includes('<image')&&!malicious.includes('onload="'));
for(const series of visual.series){const g=equityHistoryGeometry(series);assert(g);for(const point of series.points){assert(g.x(point.date)>=g.left && g.x(point.date)<=g.width-g.right);assert(g.y(point.value)>=g.top && g.y(point.value)<=g.height-g.bottom);}assert.equal(g.change,series.points.at(-1).value-100);}
assert.equal(equityHistoryGeometry({points:[]}),null);assert.equal(equityHistoryGeometry({points:[{date:'2020-01-01',value:0}]}),null);
const sampled=compactMarketPoints([{date:'2019-12-31',value:100},{date:'2020-01-02',value:101},{date:'2020-01-31',value:102},{date:'2026-10-23',value:200}]);assert(sampled.some(point=>point.date==='2020-01-02'),'The first observed 2020 session is retained during compaction');
assert.equal(JSON.stringify(report),before);assert(!weeklyReport({...report,personalization:{sections:{charts:false}}}).visuals.some(item=>item.equityHistoryOverview));
assert(model.annexTables.some(table=>table.title===model.equityExecutive.globalHistory.title && table.rows.length===41),'The complete atlas keeps its own backup table, distinct from the S&P comparison title');
console.log('Equity evolution: OK; every index, 2020 base and partial histories, no future values, exact normalization, groups of four, country filters, complete escaped SVG, bounds, annexes and immutable evidence.');
