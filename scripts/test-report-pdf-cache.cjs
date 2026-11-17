'use strict';
const assert=require('node:assert/strict');
const {createReportPdfCache}=require('../backend/lib/report-pdf-cache');
async function main(){
 let now=0,calls=0;const cache=createReportPdfCache({now:()=>now,ttlMs:100,maxEntries:2,maxBytes:12});
 const input={owner:'a@example.invalid',language:'es',title:'Informe',report:{key:'fx',generatedAt:'2026-11-12',value:10}};
 const load=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));return Buffer.from('%PDF-'+calls);};
 const first=await Promise.all([cache.getOrCreate(input,load),cache.getOrCreate(input,load)]);
 assert.equal(calls,1);assert(first[0].equals(first[1]));assert((await cache.getOrCreate(input,load)).equals(first[0]));
 await cache.getOrCreate({...input,owner:'b@example.invalid'},load);assert.equal(calls,2,'Another account never shares private bytes');
 await cache.getOrCreate({...input,report:{...input.report,value:11}},load);assert.equal(calls,3,'Corrections invalidate a report with the same date and key');
 assert(cache.snapshot().bytes<=12);assert.equal(cache.snapshot().entries,2);
 await cache.getOrCreate(input,load);assert.equal(calls,4,'Least recently used entries are evicted');
 now+=101;await cache.getOrCreate(input,load);assert.equal(calls,5,'Expired entries are regenerated');
 await cache.getOrCreate({...input,language:'en'},load);assert.equal(calls,6);
 await cache.getOrCreate({...input,title:'Otro título'},load);assert.equal(calls,7);
 const roomy=createReportPdfCache();let failures=0;
 const fail=()=>{failures++;throw Error('Isolated rendering failure');};
 await assert.rejects(roomy.getOrCreate(input,fail));await assert.rejects(roomy.getOrCreate(input,fail));assert.equal(failures,2);assert.equal(roomy.snapshot().pending,0);
 const tiny=createReportPdfCache({maxBytes:2});let large=0;for(let i=0;i<2;i++)await tiny.getOrCreate(input,()=>{large++;return Buffer.from('large');});assert.equal(large,2);assert.equal(tiny.snapshot().bytes,0);
 console.log('PDF cache: concurrent deduplication, account isolation, corrected evidence, languages, titles, expiry, LRU, byte limits and failed-render recovery passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
