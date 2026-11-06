import assert from 'node:assert/strict';
import {compactChartReadings,balancedChartRows} from '../shared/report-chart-layout.mjs';
import {bondSessionReport} from '../shared/report-bond-session.mjs';
const method='La trayectoria de tasas no representa el precio ni el retorno de una cartera de bonos.';
const sharedPrice='La referencia cotizó a 100.25 USD el 2026-10-20; no es una oferta para tu empresa.';
const input=[
 {title:'A',unit:'%',reading:'Ventana 2026-10-19 a 2026-10-20. '+sharedPrice+' '+method,series:[{label:'A',points:[{date:'2026-10-19',value:4},{date:'2026-10-20',value:4.1}]}]},
 {title:'B',unit:'%',reading:'Fecha 2026-10-18. '+sharedPrice+' '+method,series:[{label:'B',points:[{date:'2026-10-17',value:5},{date:'2026-10-18',value:4.9}]}]},
];
const original=JSON.stringify(input),result=compactChartReadings(input);
assert.equal(JSON.stringify(input),original,'La presentación no cambia la evidencia original');
assert.deepEqual(result.notes,[method],'Una advertencia común se conserva una sola vez');
for(const [index,visual] of result.visuals.entries()){
 assert.deepEqual(visual.series,input[index].series);
 assert(visual.reading.includes(sharedPrice),'Las cifras y sus fechas permanecen junto a la referencia aunque se repitan');
 assert(!visual.reading.includes(method));
}
assert(result.visuals[0].reading.includes('2026-10-19 a 2026-10-20'));
assert(result.visuals[1].reading.includes('2026-10-18'));
assert.deepEqual(compactChartReadings([]),{notes:[],visuals:[]});
assert.deepEqual(compactChartReadings(input.slice(0,1)).notes,[],'Una nota única no se separa de su gráfica');
for(const heights of [[...Array(13).fill(13),...Array(12).fill(26)],Array(25).fill(13),[60,13,13,13,60],[]]) {
 const before=JSON.stringify(heights),ranges=balancedChartRows(heights,18);
 assert.equal(JSON.stringify(heights),before);
 assert.deepEqual(ranges.flatMap(([start,end])=>Array.from({length:end-start},(_,i)=>start+i)),heights.map((_,i)=>i),'Conservar todas las filas y su orden');
 assert(ranges.every(([start,end])=>end>start && end-start<=18));
 if(heights.length===25) {
  const tallest=ranges.reduce((max,[start,end])=>Math.max(max,heights.slice(start,end).reduce((a,b)=>a+b,0)),0);
  const optimum=Math.min(...Array.from({length:12},(_,i)=>i+7).map(cut=>Math.max(heights.slice(0,cut).reduce((a,b)=>a+b,0),heights.slice(cut).reduce((a,b)=>a+b,0))));
  assert.equal(tallest,optimum,'Se equilibra la altura real de las etiquetas, no sólo el número de filas');
 }
}
const references=[['US1M','Treasury 1 mes','1M',1/12,4,4.1],['US2Y','Treasury 2 años','2Y',2,4.5,4.4]].map(([ticker,label,maturity,tenorYears,a,b])=>({ticker,label,maturity,tenorYears,market:'Estados Unidos',currency:'USD',basis:'yield',cadence:'daily',series:[{date:'2026-10-19',value:a},{date:'2026-10-20',value:b}]}));
const report={collection:'finance',key:'bonds',title:'Bonos de prueba',generatedAt:'2026-10-21T12:00:00Z',metrics:[],sections:[],tables:[],visuals:[],watchlist:[],sourceSnapshot:{bonds:references}};
const model=bondSessionReport(report),chartsOnly=bondSessionReport({...report,personalization:{sections:{tables:false}}});
assert.equal(model.results[0].rows.length,2);
for(const label of references.map(item=>item.label)){
 assert(model.results[0].rows.some(row=>row[0]===label),'Cada referencia conserva su fila en la tabla');
 assert(chartsOnly.visuals.some(visual=>visual.reading.includes(label)),'Sin tabla se conserva el detalle dentro de las gráficas');
}
console.log('Distribución de gráficas: metodología común sin perder cifras, fechas, series ni detalles en ediciones sin tablas.');
