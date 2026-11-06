import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {createReportDraft} from '../frontend/src/lib/reportCreation.js';
import {reportCsv} from '../frontend/src/lib/reportCsv.js';
const require=createRequire(import.meta.url);process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const {_test}=require('../backend/routes/export'),{normalizeReport}=require('../backend/services/user-report-store'),{annualStats}=require('../backend/services/annual-report-library'),{conventionalAnnualFx}=require('../backend/lib/report-annual-fx');
const inputs=JSON.parse(await fs.readFile('output/reportes-simulacion-ampliada-20261029/source-inputs.json','utf8'));
const fx=inputs.find(report=>report.key==='fx' && report.periodType!=='annual'),before=JSON.stringify(fx),full=weeklyReport(fx),exported=weeklyReport(_test.executivePayload(fx));
assert.deepEqual(exported.references,full.references,'A direct FX download preserves every stored historical observation, not just a compact sample');
assert.equal(JSON.stringify(fx),before);
const equity=inputs.find(report=>report.key==='equities' && report.periodType!=='annual'),draft=createReportDraft('finance',equity).report,saved=normalizeReport(draft);
assert.deepEqual(saved.sourceLinks,equity.sourceLinks);assert.deepEqual(_test.executivePayload(equity).sourceLinks,equity.sourceLinks);
assert.deepEqual(weeklyReport(saved).visuals,weeklyReport(equity).visuals,'Saving cannot change any plotted benchmark date or value');
assert.throws(()=>normalizeReport({...draft,sourceLinks:Array.from({length:193},()=>({label:'Test',url:'https://example.invalid/'}))}),/demasiados/,'The new bounded capacity is still enforced');
const raw=JSON.parse(await fs.readFile('backend/cache/annual-history-data.json','utf8')),library=JSON.parse(await fs.readFile('backend/cache/annual-report-library.json','utf8'));
for(const [year,reports] of Object.entries(library.years)){
 const report=reports.find(item=>item.collection==='finance' && item.key==='fx');
 const presentation=weeklyReport(report);assert(presentation.results.some(table=>table.title.startsWith('RUB y VES · análisis separado')));
 assert(presentation.visuals.every(visual=>!(visual.type==='bar' ? visual.bars : visual.series).some(item=>/^USD\/(?:RUB|VES)/.test(item.label))),'Restricted currencies cannot distort the commercial annual chart scales');
 for(const code of ['EUR','GBP']){
  const original=raw.references.find(item=>item.bucket==='fx' && item.label.startsWith('USD/'+code)),reference=report.annualReferences.find(item=>item.label.startsWith(code+'/USD'));
  assert(reference);const expected=annualStats(conventionalAnnualFx(original),Number(year));
  assert.equal(reference.mean,expected.mean);assert.equal(reference.change,expected.change);assert.equal(reference.minimum,expected.minimum);assert.equal(reference.maximum,expected.maximum);
  assert.deepEqual(reference.points,expected.monthly);assert.equal(reference.unit,'USD por 1 '+code);
 }
 for(const report of reports){
  const payload=_test.executivePayload(report);assert.deepEqual(payload.annualReferences,normalizeReport(createReportDraft(report.collection,report).report).annualReferences,'Numeric annual evidence survives saving and downloads');
  if(report.key==='fx')assert(!/USD\/(?:EUR|GBP)/.test(reportCsv(report)));
 }
}
console.log('Export evidence: complete FX history, all equity source links with a bounded 192 limit, annual EUR/USD and GBP/USD statistics recomputed from original inverted points, exact numeric annual save/export round trips.');
