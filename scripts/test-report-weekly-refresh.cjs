'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const schedulePath=path.resolve(__dirname,'../backend/lib/report-schedule.js'),schedule=require(schedulePath);
assert.equal(schedule.MARKET_REPORT_DAY,5);assert.equal(schedule.MARKET_REPORT_HOUR,14);
for(const [from,next,last] of [
 ['2026-11-05T20:30:00Z','2026-11-06T20:00:00Z','2026-10-30T20:00:00Z'],
 ['2026-11-06T01:00:00Z','2026-11-06T20:00:00Z','2026-10-30T20:00:00Z'],
 ['2026-11-06T19:59:59.999Z','2026-11-06T20:00:00Z','2026-10-30T20:00:00Z'],
 ['2026-11-06T20:00:00Z','2026-11-13T20:00:00Z','2026-11-06T20:00:00Z'],
 ['2026-11-07T00:00:00Z','2026-11-13T20:00:00Z','2026-11-06T20:00:00Z'],
 ['2026-12-31T20:00:00Z','2027-01-01T20:00:00Z','2026-12-25T20:00:00Z'],
 ['2028-02-29T20:00:00Z','2028-03-03T20:00:00Z','2028-02-25T20:00:00Z'],
]){assert.equal(schedule.nextMarketReportRefreshAt(from).toISOString(),new Date(next).toISOString());assert.equal(schedule.latestMarketReportCutAt(from).toISOString(),new Date(last).toISOString());}
const snapshot={reports:[{key:'grains'}],generatedAt:'2026-11-05T18:00:00Z'};
assert(!schedule.marketReportRefreshDue(snapshot,new Date('2026-11-06T19:59:59Z')));
assert(schedule.marketReportRefreshDue(snapshot,new Date('2026-11-06T20:00:00Z')));
assert(schedule.marketReportRefreshDue(snapshot,new Date('2026-11-08T20:00:00Z')),'Recover a missed Friday cut after downtime');
assert(!schedule.marketReportRefreshDue({...snapshot,generatedAt:'2026-11-06T20:01:00Z'},new Date('2026-11-12T20:00:00Z')));
assert(schedule.marketReportRefreshDue(null));
let time=Date.parse('2026-11-05T20:30:00Z');class Clock extends Date{constructor(...args){super(...(args.length ? args : [time]));}static now(){return time;}}
const timers=[],warnings=[];const sandbox={module:{exports:{}},require:createRequire(schedulePath),Date:Clock,Intl,console:{log(){},warn:value=>warnings.push(value)},setTimeout(callback,delay){const timer={callback,delay,unref(){}};timers.push(timer);return timer;},clearTimeout(){}};
vm.runInNewContext(fs.readFileSync(schedulePath,'utf8'),sandbox);
(async()=>{
 let runs=0;const stop=sandbox.module.exports.scheduleMarketReport(async()=>{runs++;if(runs===1)throw Error('Fallo simulado');});
 assert.equal(timers[0].delay,23.5*3600000);time=Date.parse('2026-11-06T20:00:00Z');await timers[0].callback();assert.equal(runs,1);assert.equal(warnings.length,1);assert.equal(timers[1].delay,7*86400000);stop();
 let release;const count=timers.length,cancel=sandbox.module.exports.scheduleMarketReport(()=>new Promise(resolve=>{release=resolve;}));time=Date.parse('2026-11-13T20:00:00Z');const work=timers.at(-1).callback();cancel();release();await work;assert.equal(timers.length,count+1,'Cancelling an active task never rearms its timer');
 const {reportRefreshLabel}=await import('../frontend/src/lib/reportRefreshLabel.js');
 const es=reportRefreshLabel('2026-11-06T20:00:00Z','markets');assert(es.includes('viernes') && es.includes('14:00') && es.includes('CDMX'));
 const en=reportRefreshLabel('2026-11-06T20:00:00Z','markets',{locale:'en-US',t:value=>value==='Corte semanal' ? 'Weekly update' : value});assert(en.includes('Weekly update') && en.includes('Friday') && !en.includes('viernes'));
 console.log('Semanal: viernes 14:00 CDMX, límites exactos, año nuevo, bisiesto, recuperación del corte pendiente, reprogramación tras fallos y cancelación.');
})().catch(error=>{console.error(error);process.exitCode=1;});
