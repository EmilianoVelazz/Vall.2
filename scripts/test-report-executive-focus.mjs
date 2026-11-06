import assert from 'node:assert/strict';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {executiveSessionFact} from '../shared/report-summary-highlights.mjs';
import {filteredReportModel} from '../shared/report-view-filters.mjs';
const observed=(label,value,start='2026-10-22',end='2026-10-23')=>({label,periods:{day:{value,baseDate:start,lastDate:end},week:{value:-value,baseDate:'2026-10-16',lastDate:end}}});
const refs=[observed('A',8),observed('B',-5,'2026-10-21','2026-10-22'),observed('C',1)];
const original=JSON.stringify(refs),fact=executiveSessionFact(refs,{change:value=>value+' %'});
assert(fact.includes('A: 8 % (2026-10-22 / 2026-10-23)'));
assert(fact.includes('B: -5 % (2026-10-21 / 2026-10-22)'));
assert(!fact.includes('C:'),'A brief describes directional extremes; full tables retain every observation');
assert.equal(JSON.stringify(refs),original);
assert.equal(executiveSessionFact([]),'');
assert(executiveSessionFact(refs,{period:'week'}).includes('A: -8'));
const points=[{date:'2020-01-02',value:50},{date:'2025-10-23',value:65},{date:'2025-12-31',value:70},{date:'2026-04-23',value:75},{date:'2026-07-23',value:80},{date:'2026-09-23',value:85},{date:'2026-10-16',value:90},{date:'2026-10-22',value:95},{date:'2026-10-23',value:100}];
for(const [collection,key] of [['finance','equities'],['finance','fx'],['markets','proteins'],['markets','grains'],['markets','energy_metals']]){
  const quote={label:key==='fx' ? 'USD/MXN' : 'Referencia Estados Unidos',unit:key==='fx' ? 'MXN por 1 USD' : key==='equities' ? 'puntos' : 'USD/kg',market:'Estados Unidos',region:'América',cadence:'daily',series:points,quoteCurrency:'MXN'};
  const snapshot=key==='fx' ? {fxHistories:[quote,{...quote,label:'USD/BRL',quoteCurrency:'BRL'}]} : {[key==='energy_metals' ? 'energy' : key]:[quote]};
  const report={collection,key,title:key,generatedAt:'2026-10-24T12:00:00Z',sourceSnapshot:snapshot,metrics:[],sections:[],tables:[],visuals:[]};
  const before=JSON.stringify(report),model=weeklyReport(report);
  assert.equal(JSON.stringify(report),before);
  assert.equal(model.metrics.length,0);
  assert.equal(model.summaryPanels[0].heading,key==='fx' ? 'Brasil · movimiento y detonante' : 'Qué pasó');
  assert(!model.blocks.some(block=>['results','causes','sessionContext'].includes(block.key)));
  if(key==='equities'){
    assert(model.equityExecutive);
    assert(model.results.filter(table=>table.equityMaster).some(table=>table.rows.length===model.references.length));
    assert(model.blocks.some(block=>block.key==='equityBusiness'));
    assert(model.visuals.filter(visual=>visual.type==='line').every(visual=>visual.series.length<=4));
  }else if(key==='fx'){assert(model.fxExecutive);assert(model.blocks.some(block=>block.key==='fxTreasury'));assert.equal(model.visuals.length,0,'No se inventa DXY para una gráfica incompleta');}else{
    assert.equal(model.visuals.filter(visual=>visual.executiveLead).length,1);
    assert(model.blocks.findIndex(block=>block.key==='leadChart')<model.blocks.findIndex(block=>block.key==='comparisons'));
  }
  assert(model.visuals.every(visual=>visual.dataInTables));
  assert.deepEqual(model.blocks.map(block=>block.number),model.blocks.map((_,index)=>String(index+1)));
  const noTables=weeklyReport({...report,personalization:{sections:{tables:false}}});
  assert(noTables.visuals.every(visual=>!visual.dataInTables),'Charts keep their own values when the tables are disabled');
  const noCharts=weeklyReport({...report,personalization:{sections:{charts:false}}});
  assert(!noCharts.blocks.some(block=>['leadChart','charts'].includes(block.key)));
  assert.equal(noCharts.visuals.length,0);
}
const filtered=filteredReportModel({focusedMarket:true,references:[{label:'A',country:'Estados Unidos'},{label:'B',country:'Estados Unidos'}],results:[{columns:['Referencia','Último'],rows:[['A','1'],['B','2']]}],visuals:[{title:'A',type:'line',executiveLead:true,series:[{label:'A',points:[]}]},{title:'B',type:'line',series:[{label:'B',points:[]}]}],blocks:[{key:'session'},{key:'leadChart'},{key:'comparisons'},{key:'charts'}]}, {collection:'markets'}, {query:'B'});
assert.equal(filtered.visuals[0].executiveLead,true,'Filtering reassigns a remaining chart to the lead position');
assert(!filtered.blocks.some(block=>block.key==='charts'),'No empty detail section after filtering');
assert.deepEqual(filtered.blocks.map(block=>block.number),['1','2','3']);
console.log('Executive focus: OK · observed facts, both directions, dates, visual-first order, no KPI cards or duplicated chart results, complete evidence and immutable inputs.');
