// Independent arithmetic and malformed-input checks for the final review.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {annualEvidence} from '../shared/report-annual-evidence.mjs';
import {reportHealth} from '../shared/report-health.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {theoreticalForward} from '../shared/report-fx-executive.mjs';
const require=createRequire(import.meta.url),{dailyPoints}=require('../backend/lib/report-observations');
const {createReportHistoryStore}=require('../backend/services/report-history-store');
const now=Date.parse('2026-10-29T18:00:00Z'),quote=(date,value=1,cadence='daily')=>({label:'Prueba',unit:'USD',cadence,points:[{date,value}]});
assert.equal(reportHealth(null,now).state,'empty');
assert.equal(reportHealth({generatedAt:'2026-10-27T18:00:00Z',sessionObservations:[quote('2026-10-28')]},now).state,'empty','Generation time is an evidence cutoff, even when now is later');
assert.equal(reportHealth({sessionObservations:[quote('2026-02-30')]},now).state,'empty');
assert.equal(reportHealth({sessionObservations:[quote('2026-10-28',0)]},now).state,'updated','A published zero is evidence');
assert.equal(reportHealth({sessionObservations:[quote('2026-10-28'),{...quote('2026-09-30'),label:'Antigua'}]},now).state,'partial');
assert.equal(reportHealth({sessionObservations:[quote('2026-09-30',1,'monthly')]},now).state,'updated');
assert.equal(reportHealth({sessionObservations:[quote('2026-09',1,'monthly')]},now).state,'updated','A completed monthly period is not dated as its first daily session');
assert.equal(reportHealth({sessionObservations:[quote('2026-10',1,'monthly')]},now).state,'empty','An unfinished monthly period is not a published month-end observation');
assert.equal(reportHealth({sessionObservations:[quote('2026-07-31',1,'monthly')]},now).state,'stale');
const broken=annualEvidence({periodType:'annual',reportYear:2025,annualReferences:[null,4,[],{label:'Prueba',points:[{date:'2025-02-30',value:2},{date:'2025-02-28',value:0},{date:'2026-01-01',value:2}]}],annualProduction:[null,{state:'Prueba',corn:0,wheat:Infinity}]});
assert.equal(broken.annualReferences.length,1);assert.deepEqual(broken.annualReferences[0].points,[{date:'2025-02-28',value:0}]);assert.deepEqual(broken.annualProduction,[{state:'Prueba',corn:0,wheat:null,sorghum:null,soy:null}]);
assert.doesNotThrow(()=>annualEvidence({periodType:'annual',reportYear:2025,annualReferences:[{points:{}}],annualProduction:{}}));
const close=(actual,expected,label)=>assert(Math.abs(actual-expected)<=1e-10*Math.max(1,Math.abs(expected)),label+': '+actual+' != '+expected);
for(const days of [30,90,180]){
 close(theoreticalForward(20,{id:'SOFR',value:4},{id:'SF331451',value:8},days),20*(1+.08*days/360)/(1+.04*days/360),'MXN forward '+days);
 close(theoreticalForward(5,{id:'SOFR',value:4},{id:'SELIC',value:10},days),5*(1.1**(days/365))/(1+.04*days/360),'BRL forward '+days);
}
assert.equal(theoreticalForward(0,{value:4},{value:8},90),null);
const directory=await fs.mkdtemp(path.resolve('output/report-history-final-'));
try{
 const store=createReportHistoryStore({directory}),records=Array.from({length:12},(_,i)=>({key:'fx',title:'Fixture '+i,generatedAt:i%2 ? '2026-10-29T12:00:00-06:00' : '2026-10-29T18:00:00Z'}));
 const writes=await Promise.allSettled([store.archive(records,'finance'),store.archive(records,'finance')]);for(const result of writes)assert.equal(result.status,'fulfilled',result.reason?.stack);
 const all=await store.list();assert.equal(all.length,12,'Concurrent archive writes remain idempotent');
 const original=await fs.readFile(path.join(directory,all[0].id+'.json'));
 await fs.writeFile(path.join(directory,'index',all[0].id+'.json'),'{broken');
 assert.equal((await store.list()).length,12,'Corrupt metadata is rebuilt from immutable original evidence');
 assert.deepEqual(await fs.readFile(path.join(directory,all[0].id+'.json')),original);
 const ids=[];let cursor;
 do{const page=await store.listPage({area:'finance',key:'fx',limit:3,cursor});ids.push(...page.data.map(item=>item.id));cursor=page.nextCursor;}while(cursor);
 assert.equal(ids.length,12);assert.equal(new Set(ids).size,12,'Equivalent timestamps in different zones cannot lose a page boundary');
 const first=await store.listPage({area:'finance',key:'fx',limit:3});
 await assert.rejects(store.listPage({area:'markets',cursor:first.nextCursor}),error=>error.status===400);
 await assert.rejects(store.listPage({cursor:'../../private'}),error=>error.status===400);
 await assert.rejects(store.get('../../private'),error=>error.status===400);
}finally{assert.equal(path.dirname(directory),path.resolve('output'));assert(path.basename(directory).startsWith('report-history-final-'));await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
const raw=JSON.parse(await fs.readFile('backend/cache/annual-history-data.json','utf8')),library=JSON.parse(await fs.readFile('backend/cache/annual-report-library.json','utf8'));
let annualComparisons=0,originalObservations=0,fxPoints=0,horizons=0;
for(const [year,reports] of Object.entries(library.years)){
 for(const reference of reports.find(report=>report.collection==='finance' && report.key==='fx').annualReferences){
  const code=reference.label.match(/^([A-Z]{3})\/USD/)?.[1],original=raw.references.find(item=>item.bucket==='fx' && item.label===(code ? reference.label.replace(code+'/USD','USD/'+code) : reference.label));
  assert(original,'Original FX reference exists: '+reference.label);
  const points=dailyPoints(original.series,'2026-01-01').filter(point=>point.date.startsWith(year+'-')).map(point=>({...point,value:code ? 1/point.value : point.value}));
  if(!points.length)continue;
  const values=points.map(point=>point.value),prior=dailyPoints(original.series,'2026-01-01').filter(point=>point.date.startsWith((Number(year)-1)+'-12-')).at(-1);
  close(reference.mean,values.reduce((a,b)=>a+b,0)/values.length,reference.label+' annual mean');
  close(reference.minimum,Math.min(...values),reference.label+' annual minimum');close(reference.maximum,Math.max(...values),reference.label+' annual maximum');
  if(reference.change!=null){assert(prior);close(reference.change,(values.at(-1)/(code ? 1/prior.value : prior.value)-1)*100,reference.label+' annual return');}
  annualComparisons++;originalObservations+=points.length;
 }
}
const inputs=JSON.parse(await fs.readFile('output/reportes-simulacion-ampliada-20261029/source-inputs.json','utf8'));
for(const report of inputs.filter(item=>item.periodType!=='annual' && item.collection==='finance' && item.key==='fx')){
 const model=weeklyReport(report),raw=report.sourceSnapshot.fxHistories;
 for(const reference of model.references){
  const original=raw.find(item=>item.quoteCurrency===reference.code);assert(original);
  const lookup=new Map(dailyPoints(original.series,report.generatedAt).map(point=>[point.date,point.value]));
  for(const point of reference.points){assert(lookup.has(point.date));close(point.value,reference.inverse ? 1/lookup.get(point.date) : lookup.get(point.date),reference.label+' source point');fxPoints++;}
  for(const period of Object.values(reference.periods).filter(Boolean)){
   assert(period.baseDate<period.lastDate && Date.parse(period.lastDate)<=Date.parse(report.generatedAt));
   close(period.value,(period.last/period.base-1)*100,reference.label+' horizon');horizons++;
  }
 }
 assert(model.fxExecutive.visual.series.every(item=>!/^USD\/(?:RUB|VES)/.test(item.label)));
}
console.log(JSON.stringify({annualComparisons,originalObservations,fxPoints,horizons,archivedEditions:12,edgeCases:'cutoff, real calendar, zeros, cadence, malformed annual structures, concurrent history, corrupt index, zoned pagination, independent forwards and annual FX arithmetic'}));
