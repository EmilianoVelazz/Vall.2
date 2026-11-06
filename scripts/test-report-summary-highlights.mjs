import assert from 'node:assert/strict';
import fs from 'node:fs';
import {reportSummaryHighlights,compactHorizonHighlights} from '../shared/report-summary-highlights.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
const labels=JSON.parse(fs.readFileSync('shared/report-languages.json')).labels;
for(const [collection,file] of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']]){
  for(const report of JSON.parse(fs.readFileSync('backend/cache/'+file+'.json')).reports){
    const model=weeklyReport({...report,collection}),original=JSON.stringify(model),panels=reportSummaryHighlights(model);
    assert(panels.length);assert.equal(panels[0].heading,'Qué pasó');
    for(const panel of model.summaryPanels || model.commentary || [])if(panel.body)assert(panels.some(result=>result.body.includes(panel.body)),'Keep complete facts, conditions and qualifications');
    assert(panels.some(panel=>panel.heading==='Cómo se explica'));
    if(model.benchmark)assert(panels.some(panel=>panel.heading==='Repercusiones posibles'));
    const localized=reportSummaryHighlights(model,{t:value=>labels[value]?.[0] || value});
    assert.equal(localized[0].heading,'What happened');
    assert.equal(JSON.stringify(model),original);
  }
}
const model={benchmark:'Reference',analysisPeriod:'weekly',summaryPanels:[{heading:'Lectura',body:'Observed facts.'}],references:[{label:'Daily leader',periods:{day:{value:9},week:{value:1}}},{label:'Weekly leader',periods:{day:{value:-1},week:{value:-8}}}]};
const panels=reportSummaryHighlights(model);
assert(panels.find(panel=>panel.heading==='Cómo se explica').body.includes('no identifican una causa confirmada'));
assert(panels.find(panel=>panel.heading==='Repercusiones posibles').body.includes('La baja de Weekly leader'),'Weekly implications use weekly comparisons');
assert(!reportSummaryHighlights({summaryPanels:[{heading:'Lectura',body:'No comparable prices.'}]}).some(panel=>panel.heading==='Repercusiones posibles'),'No invented quantified impact without supporting evidence');
const groups=[{labels:['Mes'],selected:{label:'Serie A',unit:'USD/t'},change:{lastDate:'2026-10-23',baseDate:'2026-09-23',value:1}},{labels:['Trimestre'],selected:{label:'Serie A',unit:'USD/t'},change:{lastDate:'2026-10-23',baseDate:'2026-07-23',value:2}}];
const before=JSON.stringify(groups),compact=compactHorizonHighlights(groups,{change:value=>value+' %'});
assert.equal(compact.split('Serie A').length-1,1,'A repeated instrument is named once');
for(const date of ['2026-10-23','2026-09-23','2026-07-23'])assert(compact.includes(date),'Retain observation and base dates');
for(const label of ['Mes: 1 %','Trimestre: 2 %','USD/t'])assert(compact.includes(label));
assert.equal(JSON.stringify(groups),before);
assert.equal(compactHorizonHighlights([...groups,{...groups[0],selected:{label:'Serie A',unit:'EUR/t'}}]).split('Serie A').length-1,2,'Do not merge currencies');
assert.equal(compactHorizonHighlights([...groups,{...groups[0],change:{...groups[0].change,lastDate:'2026-10-22'}}]).split('Serie A').length-1,2,'Do not merge different end dates');
console.log('Report highlights: OK · complete facts and qualifications, honest causal evidence, period-aware implications, localization and immutable inputs.');
