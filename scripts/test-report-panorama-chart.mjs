import assert from 'node:assert/strict';
import {panoramaChart,panoramaTone,panoramaSignalLayout} from '../shared/report-panorama-chart.mjs';

const input={id:'sp500',date:'2026-11-05',points:[{date:'2020-01-02',value:100},{date:'2025-12-31',value:90},{date:'2026-07-01',value:115},{date:'2026-10-01',value:110},{date:'2026-11-05',value:120}]},original=JSON.stringify(input),chart=panoramaChart(input);
assert.equal(JSON.stringify(input),original);
assert.equal(chart.points.length,5);
assert.equal(chart.nodes[0].x,0);assert.equal(chart.nodes.at(-1).x,chart.width);
assert(chart.nodes.every(point=>point.y>=0 && point.y<=chart.height));
assert.equal(panoramaChart(input,{range:'half'}).points.length,3);
assert.equal(panoramaChart(input,{range:'year'}).points.length,4);
assert.equal(panoramaChart({...input,points:input.points.slice(-2)}),null,'Two observations are not a historical trend');
assert.equal(panoramaChart({...input,points:[...input.points,input.points[0],{date:'2027-01-01',value:999},{date:'2026-02-31',value:NaN}]}).points.length,5,'Do not plot duplicate, invalid or future observations');
const annual=panoramaChart({id:'macro',kind:'structural',date:'2025',points:[{date:'2020',value:-8.3},{date:'2021',value:6},{date:'2025',value:2.3}]});
assert(annual.annual);assert(annual.zero>=0 && annual.zero<=annual.height,'Bars use an actual zero baseline');
assert.equal(annual.nodes[0].value,-8.3);assert.equal(annual.points.length,3,'Missing annual observations are not inserted');
assert(!/NaN|Infinity/.test(chart.path));assert.notEqual(panoramaTone(input),panoramaTone({id:'vix'}));
assert.equal(panoramaChart({...input,points:input.points.slice(0,3)},{range:'half'}),null,'Sparse selected intervals remain empty rather than inventing points');
const layout=panoramaSignalLayout([input,{id:'single',date:'2026-11-05',points:[]}]);assert.equal(layout.charts.length,1);assert.equal(layout.levels.length,1);assert.equal(layout.wide,input.id,'Unpaired charts use the full row; levels without history do not reserve empty chart space');
console.log('Panorama charts: original values, dates, annual zero, partial history and sparse intervals verified.');
