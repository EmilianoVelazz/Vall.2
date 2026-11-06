import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {priceChartGroups,unifyAnnualEquityCharts,COMPARISON_LINE_LIMIT} from '../shared/report-chart-grouping.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {filteredReportModel} from '../shared/report-view-filters.mjs';
import {createReportDraft} from '../frontend/src/lib/reportCreation.js';
const require=createRequire(import.meta.url);process.env.NODE_ENV='test';process.env.JWT_SECRET='offline-chart-grouping-test';
const {_test}=require('../backend/routes/export');
const points=[{date:'2026-10-21',value:-3},{date:'2026-10-22',value:0},{date:'2026-10-23',value:4}];
const future=(label,extra={})=>({label,unit:'USD/bbl',cadence:'daily',basis:'serie continua de futuros; cierre sin ajustar',sector:'Petróleo',points,...extra});
const fixtures=[future('WTI'),future('Brent'),future('Otra moneda',{unit:'CAD/bbl'}),future('Otro periodo',{cadence:'weekly'}),future('Otra familia',{sector:'Gas'}),future('Ajustado',{basis:'serie continua de futuros; cierre ajustado'}),future('Físico',{symbol:'EIA-WTI-SPOT',basis:'Precio físico de referencia publicado por EIA. No es un contrato de futuros.'}),future('Desconocido A',{basis:''}),future('Desconocido B',{basis:''})];
const original=JSON.stringify(fixtures),groups=priceChartGroups(fixtures);
assert.equal(groups.length,8);assert.deepEqual(groups[0].items.map(item=>item.label),['WTI','Brent']);
assert.equal(JSON.stringify(fixtures),original,'Grouping cannot mutate evidence');
assert.deepEqual(groups.flatMap(group=>group.items),fixtures,'Grouping retains each original value, including zero and negative prices');
assert(priceChartGroups(Array.from({length:19},(_,index)=>future(String(index)))).every(group=>group.items.length<=COMPARISON_LINE_LIMIT),'Bounded legends');
assert.equal(priceChartGroups([future('A',{unit:''}),future('B',{unit:''})]).length,2,'An undeclared unit is not compatible evidence');
assert.equal(priceChartGroups([future('A',{cadence:undefined}),future('B',{cadence:undefined})]).length,2,'An undeclared cadence is not a daily observation');
const annualRefs=Array.from({length:24},(_,index)=>({label:'Índice '+index,unit:'puntos',kind:'price',change:index+.0004}));
const annualCharts=annualRefs.map(ref=>({type:'bar',title:'Variación anual 2022 · Precios e índices · '+ref.label,unit:'%',bars:[{label:ref.label,value:Number(ref.change.toFixed(3))}],note:'Diciembre contra diciembre.'}));
const volatility={type:'bar',title:'Variación anual 2022 · Volatilidad',unit:'puntos',bars:[{label:'VIX',value:4}]};
const combined=unifyAnnualEquityCharts([...annualCharts,volatility],annualRefs,2022);
assert.equal(combined.length,3);assert(combined.slice(0,2).every(visual=>visual.bars.length<=18));
assert.deepEqual(combined.slice(0,2).flatMap(visual=>visual.bars),annualCharts.flatMap(visual=>visual.bars),'Annual percentage changes remain exact');
assert.strictEqual(combined.at(-1),volatility,'Volatility is not an equity percentage change');
assert.equal(unifyAnnualEquityCharts(annualCharts,annualRefs,2023).length,24,'Different annual periods remain separate');
const localizedAnnual=annualCharts.map(chart=>({...chart,title:'Translated '+chart.title,bars:chart.bars.map(bar=>({...bar,label:'Translated '+bar.label}))}));
const translatedCombined=unifyAnnualEquityCharts(localizedAnnual,annualRefs,2022,{source:value=>value.replace(/^Translated /,''),t:value=>'Translated '+value});
assert.equal(translatedCombined.length,2);assert(translatedCombined.every(chart=>chart.title.startsWith('Translated ')),'Localization preserves identities and translates the final grouped title');
const output='output/report-chart-unification-20261023';await fs.mkdir(output,{recursive:true});
const reports=[];
for(const [collection,file] of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']])for(const report of JSON.parse(await fs.readFile('backend/cache/'+file+'.json','utf8')).reports)reports.push({...report,collection});
reports.push(...Object.values(JSON.parse(await fs.readFile('backend/cache/annual-report-library.json','utf8')).years).flat());
const stats=[];
for(const report of reports){
  const before=JSON.stringify(report),model=weeklyReport(report);
  assert.equal(JSON.stringify(report),before);
  if(['grains','proteins','energy_metals'].includes(report.key) && !report.reportYear){
    const expected=model.references.filter(ref=>ref.points.filter(point=>Date.parse(ref.last.date)-Date.parse(point.date)<=185*86400000).length>1).flatMap(ref=>ref.points.filter(point=>Date.parse(ref.last.date)-Date.parse(point.date)<=185*86400000).map(point=>JSON.stringify([ref.unit,ref.label,point.date,point.value])));
    const actual=model.visuals.filter(visual=>visual.type==='line').flatMap(visual=>visual.series.flatMap(series=>series.points.map(point=>JSON.stringify([visual.unit,series.label,point.date,point.value]))));
    assert.deepEqual(new Set(actual),new Set(expected),'All six-month observations survive regrouping: '+report.key);
    assert.equal(actual.length,expected.length,'No invented or repeated chart observations');
    for(const visual of model.visuals.filter(visual=>visual.type==='line')){
      const refs=visual.series.map(series=>model.references.find(ref=>ref.label===series.label));
      assert(refs.every(ref=>ref.unit===visual.unit && ref.cadence===visual.cadence));
      assert.equal(priceChartGroups(refs).length,1,'Every combined panel has a verified common pricing basis');
    }
    const draft=createReportDraft(report.collection,report).report;
    assert.deepEqual(weeklyReport(draft).visuals,model.visuals,'Saved copies retain compatibility and all series');
    const exported=weeklyReport(_test.executivePayload(report));
    assert.equal(exported.references.length,model.references.length,'Export normalization cannot invent a duplicate reference');
    assert.equal(exported.visuals.length,model.visuals.length,'Reader and exported PDF use the same chart grouping');
    const title=model.visuals[0]?.title;
    if(title)assert.equal(weeklyReport({...draft,causeText:{[title]:'Translated grouped title'}}).visuals[0].title,'Translated grouped title','The complete grouped title participates in localization');
    if(report.key==='energy_metals'){
      assert(model.visuals.some(visual=>visual.series?.some(series=>/WTI/.test(series.label)) && visual.series.some(series=>/Brent/.test(series.label))),'Comparable oil benchmarks share a panel');
      assert(!model.visuals.some(visual=>visual.series?.some(series=>series.label==='Gas Henry Hub físico · EE. UU.') && visual.series.some(series=>series.label==='Gas Henry Hub · EE. UU.')),'Spot gas and gas futures remain separate');
    }
  }
  if(report.key==='equities' && !report.reportYear){
    assert(model.visuals.some(visual=>!visual.globalComparison),'Regional mini charts complement the global chart');
    const global=model.visuals.find(visual=>visual.globalComparison);assert(global.globalComparison && global.requiredInPrint);
    assert(global.series.some(series=>series.label==='S&P/BMV IPC'),'Mexico belongs in the global comparison');
    assert.equal(global.series.length,model.references.filter(ref=>ref.points.filter(point=>point.date>='2020-01-01').length>1).length,'Every eligible index appears once');
    for(const series of global.series){assert.equal(series.points[0].value,100);assert.equal(series.baseDate,series.points[0].date,'Each actual base date is explicit, including partial history');}
    const filtered=filteredReportModel(model,report,{country:'México'});assert(filtered.visuals.length>=1);for(const visual of filtered.visuals)assert.deepEqual(visual.series.map(series=>series.label),['S&P/BMV IPC']);
  }
  stats.push({id:report.collection+'-'+report.key+'-'+(report.reportYear || 'diario'),charts:model.visuals.length,series:model.visuals.reduce((sum,visual)=>sum+(visual.series?.length || 0),0)});
}
await fs.writeFile(output+'/models.json',JSON.stringify(stats,null,2));
console.log('Chart grouping: OK · '+reports.length+' models; exact observations, currencies, units, frequency, basis, annual periods, common index bases, copies and filters verified.');
