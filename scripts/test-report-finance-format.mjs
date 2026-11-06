import assert from 'node:assert/strict';
import fs from 'node:fs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {bondSessionReport} from '../shared/report-bond-session.mjs';
const labels=JSON.parse(fs.readFileSync('shared/report-languages.json')).labels;
const translate=value=>labels[value]?.[0] || value;
const reports=JSON.parse(fs.readFileSync('backend/cache/finance_executive_reports.json')).reports;
for(const key of ['bonds','fx']){
 const report={...reports.find(report=>report.key===key),collection:'finance'},snapshot=JSON.stringify(report),model=weeklyReport(report);
 for(const heading of key==='bonds' ? ['Qué pasó','Prioridad para finanzas'] : ['Brasil · movimiento y detonante','México · caja y márgenes'])assert(model.summaryPanels.some(panel=>panel.heading===heading));
 assert(model.summaryPanels.length<=4);assert(!model.summaryPanels.some(panel=>/100,000|posición hipotética/.test(panel.body)));
 assert(model.visuals.every(visual=>visual.financePalette && visual.dataInTables));
 if(key==='bonds'){
  const original=bondSessionReport(report),daily=model.results.find(table=>table.bondRates && !table.title.startsWith('Subastas')),auctions=model.results.find(table=>table.title.startsWith('Subastas'));
  assert(model.references.length<=original.references.length);assert(model.references.every(item=>!item.stale));assert(model.references.some(item=>item.cadence==='monthly'));
  assert(daily.rows.every(row=>!row[6].includes('Subasta')));assert.equal(auctions.columns.length,8);
  assert(!model.summaryPanels.some(panel=>panel.body.includes('precio objetivo')));
  assert(model.annexTables.some(table=>table.title.includes('mensual vigente')),'Only fresh monthly context remains in annexes');
 }else{
  assert(model.fxExecutive);assert.equal(model.results.filter(table=>table.fxMaster).length,2);assert(model.fxExecutive.decision.items.some(item=>item.targetPercent===65));assert(model.fxExecutive.main.length>=7);assert(model.fxExecutive.main.some(item=>item.label==='EUR/USD'));assert(model.fxExecutive.main.every(item=>item.periods.year && item.periods.semester && item.periods.quarter));
  assert(model.visuals.every(visual=>visual.series.every(series=>series.points[0].value===100)),'Compare relative trajectories, never raw currency units');
 }
 const en=weeklyReport(report,{t:translate});if(key==='bonds')assert(en.summaryPanels.some(panel=>panel.heading==='What happened'));else assert.equal(en.fxExecutive.main.length,model.fxExecutive.main.length);assert(en.visuals.every(visual=>visual.financePalette));
 assert.equal(JSON.stringify(report),snapshot);
}
console.log('Bond/FX format: OK · complete coverage, separate auction/monthly frequencies, compact currency tables, observed dates, honest explanations, no repeated chart results and shared palette.');
