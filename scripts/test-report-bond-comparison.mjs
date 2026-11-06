import assert from 'node:assert/strict';
import {bondChangeComparison,bondYearMonthGrid} from '../shared/report-bond-comparison.mjs';

const visual={unit:'%',rangeStart:'2020-01-01',rangeEnd:'2026-10-27',series:[
  {id:'a',points:[{date:'2019-12-31',value:5},{date:'2020-01-31',value:0},{date:'2020-02-28',value:-1},{date:'2023-01-31',value:2},{date:'2026-09-30',value:3},{date:'2026-10-26',value:4},{date:'2026-10-28',value:99}]},
  {id:'b',points:[{date:'2020-02-27',value:4},{date:'2023-01-31',value:5},{date:'2026-09-30',value:6},{date:'2026-10-27',value:7}]},
]},before=JSON.stringify(visual),comparison=bondChangeComparison(visual);
assert.equal(comparison.baseDate,'2023-01-31','Unequal start dates cannot be treated as a common 2020 base');
assert.equal(comparison.rangeEnd,'2026-09-30','A comparison ends on the last observed common date');
for(const series of comparison.series){assert.equal(series.points[0].value,0);assert.equal(series.points.at(-1).value,100);assert.equal(series.baseDate,comparison.baseDate);}
assert.equal(bondChangeComparison({...visual,unit:'pb'}).series[0].points.at(-1).value,1,'Credit already in bp must not be multiplied again');
assert.equal(bondChangeComparison({...visual,unit:'USD'}),null);
assert.equal(bondChangeComparison({...visual,series:[{points:[{date:'2020-01-31',value:0}]}]}),null);
assert.equal(bondChangeComparison({...visual,series:[]}),null);
const grid=bondYearMonthGrid(visual,visual.series[0]);
assert.equal(grid.rows.length,7);assert.equal(grid.rows[0].year,2020);assert.equal(grid.rows[0].cells[0].value,0);assert.equal(grid.rows[0].cells[1].value,-1);
assert.equal(grid.rows[0].cells[2].value,null,'Missing months stay missing');
assert.equal(grid.rows.at(-1).cells[9].value,4,'Future data is excluded');assert.equal(grid.rows.at(-1).cells[9].partial,true);
assert.equal(grid.rows.at(-1).cells[10].future,true);assert.equal(grid.min,-1);assert.equal(grid.max,4);
assert.equal(bondYearMonthGrid(visual,visual.series[1]).rows[0].cells[0].value,null,'Partial histories are visible');
assert.equal(bondYearMonthGrid({...visual,rangeEnd:'bad'},visual.series[0]),null);
assert.equal(bondYearMonthGrid(visual,{points:[]}),null);
assert.equal(bondYearMonthGrid(visual,{points:[{date:'2020-01-31',value:0},{date:'2026-10-26',value:0}]}).rows[0].cells[0].intensity,.5,'Flat or zero rates produce a valid color scale');
assert.equal(JSON.stringify(visual),before,'Derived comparisons leave canonical evidence intact');
console.log('Bonos visual: common observed bases, correct %/bp conversions, monthly heatmaps 2020–cutoff, zero/negative levels, gaps and partial histories.');
