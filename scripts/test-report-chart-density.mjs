import assert from 'node:assert/strict';
import {reportLinePanels,REPORT_LINE_SERIES_LIMIT,chartLegendLabels,chartReadingIsTabulated} from '../shared/report-chart-density.mjs';
import {chartSeriesDash} from '../shared/report-chart-geometry.mjs';
const series=Array.from({length:41},(_,index)=>({label:'Bolsa '+index,baseDate:'2020-01-'+String(index%28+1).padStart(2,'0'),points:[{date:'2020-01-30',value:100},{date:'2026-10-27',value:100+index}]}));
const visual={type:'line',title:'Comparación desde 2020',unit:'Índice base 100',series,globalComparison:true,requiredInPrint:true,note:'Bases observadas, sin interpolar.',reading:'Comparación de trayectorias.'};
const before=JSON.stringify(visual),panels=reportLinePanels(visual);
const combined={...visual,unifiedHistory:true};assert.strictEqual(reportLinePanels(combined)[0],combined,'The explicitly requested single historical chart retains all series together');assert.equal(reportLinePanels(combined).length,1);
assert.equal(REPORT_LINE_SERIES_LIMIT,4);
assert.equal(panels.length,11);
assert(panels.every(panel=>panel.series.length<=4 && panel.series.length>=3),'Balanced groups do not leave a single isolated line');
assert.deepEqual(panels.flatMap(panel=>panel.series),series,'Every series, exact point and base date survives, in source order');
assert.equal(new Set(panels.flatMap(panel=>panel.series.map(item=>item.label))).size,41);
for(const panel of panels){
  assert(panel.globalComparison && panel.requiredInPrint && panel.densityPanel);
  assert.equal(panel.unit,visual.unit);assert.equal(panel.note,visual.note);
  panel.series.forEach((item,index)=>{
    assert.strictEqual(item,series[panel.seriesOffset+index],'Splitting must not rewrite or sample observations');
    assert.equal(chartSeriesDash(panel.seriesOffset+index,6,true),chartSeriesDash(series.indexOf(item),6,true));
  });
}
assert.equal(JSON.stringify(visual),before);
const peers={...visual,globalComparison:false,equityComparison:true,series:series.slice(0,8)},comparisons=reportLinePanels(peers);
assert(comparisons.every(panel=>panel.series[0]===series[0] && panel.series.length<=4),'Every comparison keeps its benchmark without overcrowding');
assert.deepEqual(comparisons.flatMap(panel=>panel.series.slice(1)),peers.series.slice(1),'Every peer appears once');
for(const panel of comparisons)panel.series.forEach((item,index)=>assert.strictEqual(item,peers.series[panel.seriesOrdinals[index]],'The benchmark and peers keep their original color identities'));
for(let count=0;count<=150;count++){
  const input={...visual,series:Array.from({length:count},(_,index)=>({label:String(index),points:[]}))};
  const chunks=reportLinePanels(input);
  assert.deepEqual(chunks.flatMap(panel=>panel.series),input.series);
  assert(chunks.every(panel=>panel.series.length<=4));
  if(count<=4)assert.strictEqual(chunks[0],input,'Already readable charts stay unchanged');
}
const bars={type:'bar',bars:[{label:'A',value:2}]};assert.strictEqual(reportLinePanels(bars)[0],bars);
const curve={...visual,yieldCurve:true};assert.strictEqual(reportLinePanels(curve)[0],curve,'Tenor order is not split into unrelated curves');
const names=[{label:'Cerdo · Sonora · En pie; promedio ponderado · ref. abcdef1234567890'},{label:'Cerdo · Veracruz · En pie; otra plaza'},{label:'Pollo · Estados Unidos · Pechuga'},{label:'Pollo · Estados Unidos · Pierna'}];
const originalNames=JSON.stringify(names),short=chartLegendLabels(names);
assert.deepEqual(short,['Cerdo · Sonora','Cerdo · Veracruz','Pollo · Estados Unidos · Pechuga','Pollo · Estados Unidos · Pierna'],'Keep product/presentation distinctions when two aliases would collide');
assert.equal(JSON.stringify(names),originalNames);
const repeated={series:names.slice(0,2),dataInTables:true,reading:names.slice(0,2).map(item=>item.label+': 30 MXN/kg (2026-10-27)').join('; ')};
assert(chartReadingIsTabulated(repeated));
assert(!chartReadingIsTabulated({...repeated,dataInTables:false}),'Preserve complete readings when there is no backing table');
assert(!chartReadingIsTabulated({...repeated,reading:'La comparación conserva las fechas de publicación.'}),'Preserve methodology, conditions and independent interpretation');
console.log('Chart density: OK · at most four lines, all 41 histories and base dates retained, stable identities, balanced panels and immutable evidence.');
