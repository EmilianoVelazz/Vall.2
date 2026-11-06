'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {brazilMarkets,loadGlobalGrainPrices}=require('../backend/lib/report-global-grain-prices');
const {saveGrainCache,readGrainCache,mergeGrainQuotes}=require('../backend/lib/report-grain-cache');
(async()=>{
 const folder=path.resolve('output/informes-mejoras-20261026');await fs.mkdir(folder,{recursive:true});
 const file=path.join(folder,'cache-test-'+process.pid+'.json'),cutoff='2026-10-26T23:00:00Z';
 const quote={...brazilMarkets[0],retrievedAt:'2026-10-26T19:00:00Z',series:[{date:'2026-10-22',value:60},{date:'2026-10-23',value:61}]};
 const offline={cutoff,cacheFile:file,get:async()=>{throw Error('offline');},read:async()=>{throw Error('offline');}};
 try{
  await saveGrainCache(file,[quote],cutoff);
  const restored=await loadGlobalGrainPrices(offline);
  assert.equal(restored.length,1);assert.equal(restored[0].quoteStatus,'preserved');assert.equal(restored[0].retrievedAt,quote.retrievedAt);assert.equal(restored[0].observedAt,'2026-10-23');assert.equal(restored[0].value,61);
  const partial=await loadGlobalGrainPrices({...offline,get:async()=>({ok:true,json:async()=>[],text:async()=>''})});
  assert.equal(partial[0].value,61,'An empty but successful response does not remove a dated market');
  const revised={...quote,retrievedAt:'2026-10-26T20:00:00Z',series:[{date:'2026-10-23',value:62},{date:'2026-10-26',value:63},{date:'2026-10-27',value:999}]};
  await saveGrainCache(file,[revised],cutoff);
  const stored=await readGrainCache(file,cutoff);assert.equal(stored[0].series.length,3);assert.equal(stored[0].series[1].value,62);assert.equal(stored[0].value,63);assert.equal(stored[0].observedAt,'2026-10-26');
  await saveGrainCache(file,[quote],'2026-10-23T23:00:00Z');
  assert.equal((await readGrainCache(file,cutoff))[0].value,63,'Historical requests cannot truncate newer cache observations');
  assert.equal((await readGrainCache(file,'2026-10-22T23:00:00Z'))[0].value,60,'No later observations enter an earlier report');
  assert.equal(mergeGrainQuotes([quote,{...quote,basis:'Different commercial basis',series:[{date:'2026-10-23',value:999}]}],cutoff).length,2,'Different bases never share a history');
  assert.equal(mergeGrainQuotes([{...quote,unit:'USD/t'}],cutoff).length,0,'Reject a cached unit that contradicts its provider');
  await fs.writeFile(file,'{"version":1,"quotes":"broken"}');assert.deepEqual(await readGrainCache(file,cutoff),[]);
  await fs.writeFile(file,'not JSON');assert.deepEqual(await readGrainCache(file,cutoff),[]);
  console.log('Grain cache: OK · restart, partial outage, exact dates, revisions, historical requests, units, separate bases and corrupt files.');
 }finally{await fs.rm(file,{force:true});}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
