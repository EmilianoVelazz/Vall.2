import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {proteinLegendLabels,proteinChartTicks,proteinBarColor} from '../shared/report-protein-chart-style.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';

const series=[{label:'Cerdo magro CME · EE. UU.'},{label:'Ganado vivo CME · EE. UU.'},{label:'Ganado de engorda CME · EE. UU.'}];
assert.deepEqual(proteinLegendLabels(series),['Cerdo magro CME','Ganado vivo CME','Ganado de engorda CME']);
assert.equal(new Set(proteinLegendLabels([{label:'Cerdo · productor'},{label:'Cerdo · canal'}])).size,2,'Short labels must preserve commercial differences');
const start=Date.parse('2020-01-02'),end=Date.parse('2026-11-03');
for(const width of [200,350,1100]){
 const ticks=proteinChartTicks(start,end,width);
 assert.equal(ticks[0],start);assert.equal(ticks.at(-1),end);
 assert(ticks.every((date,index)=>!index || date>ticks[index-1]));
 assert(ticks.length<=(width>=600 ? 8 : 5),'Readable calendar tick density');
 assert.equal(new Set(ticks.map(date=>new Date(date).getUTCFullYear())).size,ticks.length,'No repeated year labels');
}
assert.deepEqual(proteinChartTicks(start,start,1100),[start]);
const yearChart={proteinChart:true,proteinHistorical:true,commodityWindow:'years',bars:[{label:'2020',value:0},{label:'2026',value:5}]},before=JSON.stringify(yearChart);
assert.notEqual(proteinBarColor(yearChart,yearChart.bars[0]),proteinBarColor(yearChart,yearChart.bars[1]));
assert.equal(proteinBarColor({...yearChart,proteinChart:false},yearChart.bars[0]),null,'Other report colors remain unchanged');
assert.equal(proteinBarColor({...yearChart,commodityWindow:'yearChange'},yearChart.bars[0]),null,'Signed changes retain their directional color');
assert.equal(JSON.stringify(yearChart),before,'Styling does not alter prices, years or zero values');
const report=JSON.parse(await fs.readFile('backend/cache/market_executive_reports.json','utf8')).reports.find(item=>item.key==='proteins'),model=weeklyReport(report),history=model.visuals.find(visual=>visual.executiveLead);
assert(model.visuals.every(visual=>visual.proteinChart));assert.equal(history.series.length,3);
assert(model.visuals.filter(visual=>visual.proteinMercolleida).every(visual=>visual.title.includes('Mercolleida')));
for(const visual of model.visuals.filter(visual=>visual.type==='line'))assert.equal(new Set(proteinLegendLabels(visual.series)).size,visual.series.length,'Every shortened legend remains identifiable');
console.log('Protein charts: distinct labels, readable calendar ticks, current-year emphasis, unchanged directional colors, prices and source observations.');
