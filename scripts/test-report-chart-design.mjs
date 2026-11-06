import assert from 'node:assert/strict';
import {chartScale,spreadChartLabels,SERIES_DASHES} from '../shared/report-chart-geometry.mjs';
import {reportBarData} from '../frontend/src/lib/reportVisualData.js';
import {weeklyReport} from '../shared/report-weekly.mjs';
for(const values of [[100,101],[.000027,.000032],[63976,64001],[-20,-10],[-1,4],[0,0],[],[null,false,NaN,Infinity]]) {
  const scale=chartScale(values);
  assert(scale.min<scale.max && scale.ticks.length>=2 && scale.ticks.length<=13);
  assert(scale.ticks.every(Number.isFinite));
  for(const value of values.filter(value=>typeof value==='number' && Number.isFinite(value))) assert(value>=scale.min && value<=scale.max,'El eje no recorta observaciones');
  for(let i=1;i<scale.ticks.length;i++) assert(scale.ticks[i]>scale.ticks[i-1],'Marcas distintas y en orden');
}
for(const values of [[2,3],[-2,-3],[-4,2],[0,0],[]]) {
  const scale=chartScale(values,{zero:true,symmetric:true});
  assert.equal(scale.min,-scale.max,'Las variaciones mantienen cero centrado, incluso si todas son positivas');
  assert(scale.ticks.includes(0));
  for(const value of values) assert(Math.abs(value)<=scale.max);
}
const flat=chartScale([100,100]);assert(flat.min<100 && flat.max>100,'Una serie constante sigue siendo visible');
assert.equal(chartScale([-2.0000000000000018,2.0000000000000018],{zero:true,symmetric:true}).max,2,'El ruido de coma flotante no duplica la escala');
const missing=reportBarData({fxOverview:true,dailyComparison:true,bars:[{label:'USD/MXN',value:null},{label:'USD/EUR',value:0}]});
assert.equal(missing.bars[0].value,null);assert.equal(missing.bars[1].value,0);assert(missing.signed,'Ausencia y cero mantienen significado distinto');
const labels=spreadChartLabels(Array.from({length:9},(_,index)=>({label:String(index),y:100})),20,220,19);
assert.equal(labels.length,9);assert(labels[0].y>=20 && labels.at(-1).y<=220);
for(let i=1;i<labels.length;i++) assert(labels[i].y-labels[i-1].y>=18.999,'Las nueve etiquetas no se superponen');
assert.equal(SERIES_DASHES.length,9);
// Commodity trend charts require three observations; retain a genuine zero in
// that window rather than testing an unsupported two-point trend.
const report={collection:'markets',key:'grains',title:'Prueba de gráficas',generatedAt:'2026-10-16T18:00Z',dailyReferences:[{label:'Maíz',unit:'USD/t',points:[{date:'2026-10-14',value:0},{date:'2026-10-15',value:100},{date:'2026-10-16',value:110}]}]};
// La comparación mundial usa base 100 y requiere una base positiva. La gráfica
// de precios en su unidad original debe conservar también el cero publicado.
const before=JSON.stringify(report),line=weeklyReport(report).visuals.find(visual=>visual.type==='line' && visual.unit==='USD/t');
assert.deepEqual(line.series.map(item=>[item.label,item.points]),[['Maíz',[{date:'2026-10-14',value:0},{date:'2026-10-15',value:100},{date:'2026-10-16',value:110}]]]);
assert.equal(JSON.stringify(report),before,'El diseño no reescribe las observaciones');
console.log('Diseño de gráficas: escalas comunes, signos, cero real, faltantes, etiquetas sin colisiones y comparación por referencia OK');
