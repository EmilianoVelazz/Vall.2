import assert from 'node:assert/strict';
import {createReportHealthReader} from '../frontend/src/lib/reportHealthReader.js';
let now=1000,calls=0;const read=createReportHealthReader({now:()=>now,ttlMs:60,evaluate:(report,instant)=>{calls++;return {value:report?.value,instant};}}),report={key:'fx',generatedAt:'same-cut',value:10};
const first=read(report);for(let i=0;i<10;i++)assert.equal(read(report),first);assert.equal(calls,1);
assert.equal(read({...report,value:11}).value,11);assert.equal(calls,2,'Corrections with the same date recompute immediately');
now+=61;assert.notEqual(read(report),first);assert.equal(calls,3,'Freshness rechecks remain time-bound');
now=500;assert.equal(read(report).instant,500);assert.equal(calls,4,'Clock rollback cannot freeze an old result');
read(null);assert.equal(calls,5);console.log('Report health: repeated renders reuse analysis; corrected reports, expiry and clock rollback re-evaluate without altering source data.');
