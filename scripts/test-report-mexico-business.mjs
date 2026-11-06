import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {filteredReportModel} from '../shared/report-view-filters.mjs';
import {mexicoExecutiveBrief} from '../shared/report-mexico-brief.mjs';
import {availablePresentationModel,missingReportValue} from '../shared/report-available-data.mjs';
import {mapReportText} from '../shared/report-localized-text.mjs';
const require=createRequire(import.meta.url),catalog=require('../shared/report-languages.json');
const reports=JSON.parse(fs.readFileSync('backend/cache/mexico-executive-reports.json')).reports;
const before=JSON.stringify(reports),profile={effect:'Impacto de prueba.',watch:'Seguimiento de prueba.'};
const inflation=mexicoExecutiveBrief('mx_overview',{profile,results:[{title:'Economía nacional',rows:[['Inflación',4,'%',2025,'5 (2024)','-1 p. p.']]}]});
assert(inflation.panels[1].body.includes('no implica precios más bajos'));assert(inflation.summary.includes('2025'));
const gdp=mexicoExecutiveBrief('mx_overview',{profile,results:[{title:'Economía nacional',rows:[['PIB, crecimiento real',-1,'%',2025,'2 (2024)','-3 p. p.']]}]});assert(gdp.summary.includes('contracción en 2025'));
const slower=mexicoExecutiveBrief('mx_overview',{profile,results:[{title:'Economía nacional',rows:[['PIB, crecimiento real',1,'%',2025,'2 (2024)','-1 p. p.']]}]});assert(slower.summary.includes('crecimiento en 2025, a un ritmo menor que en 2024'),'Slower positive growth is not described as a contraction');
const fx=mexicoExecutiveBrief('mx_bolsa',{profile,references:[{unit:'MXN por 1 USD',periods:{day:{base:20,last:20.1,baseDate:'2026-11-04',lastDate:'2026-11-05'}}}]});assert(fx.panels[1].body.includes('0.1 MXN por USD'));assert(fx.panels[1].body.includes('Encarece'));
for(const report of reports){
 const model=weeklyReport(report),visible=availablePresentationModel(model);
 assert.equal(model.summaryPanels.length,3);assert.equal(model.summaryPanels[1].heading,'Impacto para la empresa');assert.equal(model.summaryPanels[2].heading,'Qué verificar antes de decidir');
 for(const table of visible.results)for(const row of table.rows)assert(row.every(cell=>!missingReportValue(cell)));
 const hidden=weeklyReport({...report,personalization:{sections:{risks:false,charts:false}}});assert.equal(hidden.summaryPanels.length,2);assert.deepEqual(hidden.visuals,[]);
 if(report.key==='mx_proteins'){
  const selected=filteredReportModel(model,report,{state:'Querétaro'});
  assert(selected.references.every(item=>item.state==='Querétaro'));assert(selected.summary.includes('Querétaro'));assert(selected.mexicoExecutive.signals.length);
  assert(selected.mexicoExecutive.signals.every(signal=>!signal.value.includes('–')),'A single published price is not printed as a repeated min/max range');
  assert(selected.summaryPanels.slice(1).every(panel=>panel.heading.startsWith('Contexto nacional')));
  const absent=filteredReportModel(model,report,{state:'Estado inexistente'});assert.deepEqual(absent.mexicoExecutive.signals,[]);assert.deepEqual(absent.summaryPanels,[]);assert.deepEqual(absent.results,[]);
 }
 if(report.key==='mx_production')for(const visual of model.visuals.filter(visual=>visual.mexicoAllBars?.length>1)){
  const target=visual.mexicoAllBars.at(-1),selected=filteredReportModel(model,report,{state:target.state}),local=selected.visuals.find(item=>item.mexicoWindow===visual.mexicoWindow && item.unit===visual.unit && item.title.startsWith(visual.title.split(' · ')[0]));
  assert(local);assert.equal(local.mexicoRegisteredTotal,visual.mexicoAllBars.reduce((sum,item)=>sum+item.value,0));
  const signal=selected.mexicoExecutive.signals.find(item=>item.label.startsWith(visual.mexicoWindow==='mining' ? 'Minería' : visual.title.split(' · ')[0]));
  assert(signal);assert.equal(Number(signal.value.replace(/,/g,'')),Number((target.value/local.mexicoRegisteredTotal*100).toFixed(2)),'Filtering a state preserves its share of the national registered total');
 }
}
const production=reports.find(item=>item.key==='mx_production'),raw=weeklyReport(production),{reportLabels}=require('../backend/lib/report-language'),t=reportLabels('en').t;
const originals=new Map(Object.entries(catalog.labels).flatMap(([key,values])=>values[0] ? [[values[0],key]] : [])),source=value=>originals.get(value) || value;
const translated=mapReportText(raw,t),state=raw.visuals.find(item=>item.mexicoWindow==='production').mexicoAllBars[1].state;
const english=filteredReportModel(translated,production,{state},{t,source});assert(english.summary.includes('Tables and charts cover'));assert(english.mexicoExecutive.signals.some(item=>item.label.includes('share of')));assert(english.summaryPanels[1].heading.startsWith('National context'));
assert.equal(JSON.stringify(reports),before,'The executive reading and filters never change stored data');
const text=fs.readFileSync('shared/report-languages.json','utf8').split('  "labels": {')[1],keys=[...text.matchAll(/^ {4}("(?:[^"\\]|\\.)*")\s*:/gm)].map(match=>JSON.parse(match[1]));
assert.deepEqual(keys.filter((key,index)=>keys.indexOf(key)!==index),[],'Translation labels remain unique');
console.log('Mexico business reading: annual context, percentage-point meaning, FX impact per USD, heterogeneous proteins, state-specific signals, unchanged national denominator, empty filters, localization and source immutability.');
