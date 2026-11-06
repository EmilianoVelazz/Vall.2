import assert from 'node:assert/strict';
import {chartLogScale,chartSeriesDash} from '../shared/report-chart-geometry.mjs';
import {globalEquityComparison} from '../shared/report-equity-comparison.mjs';

const prices=[50,100,200,400,1600],snapshot=JSON.stringify(prices),scale=chartLogScale(prices);
assert.equal(JSON.stringify(prices),snapshot,'Geometry never mutates observed prices');
const near=(a,b)=>assert(Math.abs(a-b)<1e-12,`${a} must equal ${b}`);
near(scale.position(200)-scale.position(100),scale.position(400)-scale.position(200));
assert(scale.position(50)>0 && scale.position(1600)<1,'Padding retains both extreme observations');
assert(scale.ticks.every(value=>Number.isFinite(value) && value>0));
assert(scale.ticks.every((value,index,all)=>index===0 || value>all[index-1]));
for(const values of [[],[100],[0,-4,NaN,Infinity,100],[.0001,.0002],[1e-200,1e200],[Number.MIN_VALUE],[Number.MAX_VALUE]]){
  const current=chartLogScale(values);
  assert(current.max>current.min && current.min>0);
  assert(current.ticks.length>=2 && current.ticks.length<=11);
  assert(current.ticks.every(value=>Number.isFinite(value) && value>0));
  assert(Number.isNaN(current.position(0)) && Number.isNaN(current.position(-1)));
  for(const value of values.filter(value=>Number.isFinite(value) && value>0))assert(Number.isFinite(current.position(value)));
}
const identities=Array.from({length:41},(_,index)=>[index%6,chartSeriesDash(index,6,true)].join('|'));
assert.equal(new Set(identities).size,41,'Each of 41 global series has a distinct muted color and dash combination');
assert.equal(chartSeriesDash(0,6,true),'');assert.equal(chartSeriesDash(6,6,true),'6 3');
const chart=globalEquityComparison([{label:'A',points:[{date:'2020-01-02',value:100},{date:'2026-10-26',value:200}]},{label:'B',points:[{date:'2020-01-03',value:100},{date:'2026-10-26',value:400}]}],{cutoff:'2026-10-26'});
const points=chart.series.flatMap(series=>series.points.map(point=>point.value)),axis=chartLogScale(points);
near(axis.position(200)-axis.position(100),axis.position(400)-axis.position(200));
assert(chart.note.includes('Escala logarítmica'),'The declared equity axis matches the logarithmic geometry');
console.log('Report logarithmic geometry: OK; proportional distances, positive ticks, raw values and distinct muted line identities.');
