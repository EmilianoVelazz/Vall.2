import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fetchAnnualEdition,createAnnualReportLoader} from '../frontend/src/lib/reportLibrary.js';
const require=createRequire(import.meta.url);
const {createAnnualLibrary,validAnnualLibrary}=require('../backend/services/annual-report-library');
const bundled=path.resolve('backend/data/annual-report-library.json'),snapshot=JSON.parse(await fs.readFile(bundled,'utf8'));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'annual-loading-'));
const never=()=>new Promise(()=>{}),owner='fixture@example.invalid';
const response=year=>Response.json({success:true,year,data:snapshot.years[year],accountEmail:owner});
const quick={retryDelays:[0,0],attemptTimeoutMs:30,timeoutMs:150};
try {
  assert(validAnnualLibrary(snapshot));
  let sources=0;
  const cold=createAnnualLibrary({file:path.join(temp,'absent/library.json'),fallbackFile:bundled,load:async()=>{sources++;throw Error('No external sources on page load');}});
  const [a,b]=await Promise.all([cold.get({buildIfMissing:false}),cold.get({buildIfMissing:false})]);
  assert.strictEqual(a,b);assert.equal(Object.values(a.years).flat().length,56);assert.equal(sources,0);
  for(const invalid of ['{broken',JSON.stringify({...snapshot,years:{}}),JSON.stringify({...snapshot,years:{...snapshot.years,2022:Array(14).fill(snapshot.years[2022][0])}})]) {
    const file=path.join(temp,'invalid.json');await fs.writeFile(file,invalid);
    const restored=await createAnnualLibrary({file,fallbackFile:bundled,load:never}).get({buildIfMissing:false});
    assert.deepEqual(restored,snapshot,'Recovers corrupt/incomplete/duplicate disk editions from packaged data');
  }
  const absent=createAnnualLibrary({file:path.join(temp,'missing.json'),load:async()=>{sources++;return {};}});
  for(let attempt=0;attempt<2;attempt++)await assert.rejects(absent.get({buildIfMissing:false}),error=>error.code==='ANNUAL_LIBRARY_UNAVAILABLE');
  assert.equal(sources,0,'An HTTP read never starts a mass historical import');
  await fs.writeFile(path.join(temp,'readonly'),'file blocking directory');let warnings=0,loads=0;
  const raw={generatedAt:snapshot.generatedAt,references:[],production:{},errors:[]};
  const unwritable=createAnnualLibrary({file:path.join(temp,'readonly/library.json'),load:async()=>{loads++;return raw;},onWarning:()=>warnings++});
  assert(validAnnualLibrary(await unwritable.get()));assert(validAnnualLibrary(await unwritable.get()));
  assert.equal(loads,1);assert.equal(warnings,1,'A cache write failure does not discard generated reports');
  const refresh=createAnnualLibrary({file:path.join(temp,'refresh.json'),fallbackFile:bundled,load:async()=>{throw Error('Source offline');}});
  const previous=await refresh.get();await assert.rejects(refresh.get({refresh:true}),/offline/);assert.strictEqual(await refresh.get(),previous);

  let calls=0;
  const recovered=await fetchAnnualEdition(2022,undefined,{...quick,fetcher:async()=>++calls===1 ? new Response('Unavailable',{status:503}) : response(2022)});
  assert.equal(calls,2);assert.equal(recovered.data.length,14);assert.equal(recovered.accountEmail,owner);
  for(const status of [401,403,409,429]) {
    calls=0;await assert.rejects(fetchAnnualEdition(2022,undefined,{...quick,fetcher:async()=>{calls++;return Response.json({success:false,error:'Test rejection'},{status});}}),error=>error.status===status);
    assert.equal(calls,1,'No automatic retry for session, permissions, account or rate limits');
  }
  for(const mutate of [r=>r.pop(),r=>{r[0]=null;},r=>{delete r[0].generatedAt;},r=>{delete r[0].annualCoverage;},r=>{r[0].annualCoverage.available='3';},r=>{r[1]=r[0];}]) {
    calls=0;const data=structuredClone(snapshot.years[2022]);mutate(data);
    await assert.rejects(fetchAnnualEdition(2022,undefined,{...quick,fetcher:async()=>{calls++;return Response.json({success:true,year:2022,data});}}),error=>error.code==='ANNUAL_LIBRARY_INVALID');
    assert.equal(calls,1,'Malformed documents are rejected before rendering and are not retried');
  }
  await assert.rejects(fetchAnnualEdition(2022,undefined,{...quick,expectedOwner:'other@example.invalid',fetcher:async()=>response(2022)}),error=>error.status===409);
  calls=0;await assert.rejects(fetchAnnualEdition(2022,undefined,{...quick,fetcher:()=>{calls++;return never();}}),error=>error.name==='TimeoutError');assert.equal(calls,3);
  await assert.rejects(fetchAnnualEdition(2022,undefined,{...quick,fetcher:async()=>({ok:true,json:never})}),error=>error.name==='TimeoutError');
  await assert.rejects(fetchAnnualEdition(2022,undefined,{...quick,timeoutMs:15,attemptTimeoutMs:100,fetcher:never}),error=>error.name==='TimeoutError' && /conexión/.test(error.message));
  const controller=new AbortController();calls=0;
  const aborted=fetchAnnualEdition(2022,controller.signal,{...quick,fetcher:()=>{calls++;return never();}});
  await new Promise(resolve=>setTimeout(resolve,0));controller.abort();
  await assert.rejects(aborted,error=>error.name==='AbortError');assert.equal(calls,1);
  calls=0;await assert.rejects(fetchAnnualEdition(2021,undefined,{fetcher:()=>{calls++;return never();}}));assert.equal(calls,0);

  const deferred=new Map(),seen=[];
  const loader=createAnnualReportLoader({request:year=>new Promise(resolve=>deferred.set(year,resolve)),notify:state=>seen.push(state)});
  const slow=loader.load(2022),fast=loader.load(2025);
  deferred.get(2025)({data:snapshot.years[2025],accountEmail:owner});await fast;
  deferred.get(2022)({data:snapshot.years[2022],accountEmail:owner});await slow;
  assert.equal(loader.getState().year,2025);assert.equal(loader.getState().data[0].reportYear,2025);
  const count=seen.length;await loader.load(2025,{expectedOwner:owner});assert.equal(seen.length,count+1);assert.equal(loader.getState().loading,false);
  let attempts=0;
  const retry=createAnnualReportLoader({request:async()=>{if(++attempts===1)throw Error('Disconnected');return recovered;}});
  await retry.load(2022);assert.match(retry.getState().error,/Disconnected/);
  await retry.load(2022);assert.equal(retry.getState().data.length,14);assert.equal(retry.getState().error,'');
  const stopped=createAnnualReportLoader({request:()=>new Promise(resolve=>deferred.set('stopped',resolve)),notify:()=>calls++});
  const work=stopped.load(2024);const before=calls;stopped.cancel();deferred.get('stopped')(recovered);await work;assert.equal(calls,before);
  // Isolated HTTP router: fake identity, no real accounts, workers or providers.
  process.env.JWT_SECRET='annual-loading-isolated-fixture';process.env.NODE_ENV='test';
  const express=require('express'),jwt=require('jsonwebtoken');
  require('../backend/services/user-profile-store').findById=async()=>({active:true,email:owner,credentialVersion:0});
  const {annualLibrary}=require('../backend/services/annual-report-library'),originalGet=annualLibrary.get;
  annualLibrary.get=options=>{assert.equal(options.buildIfMissing,false);return cold.get(options);};
  const app=express();app.use('/api',require('../backend/routes/report-library'));
  const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const url='http://127.0.0.1:'+server.address().port;
  const headers={Authorization:'Bearer '+jwt.sign({sub:'annual-fixture',email:owner,role:'user'},process.env.JWT_SECRET,{expiresIn:'1m'})};
  try {
    assert.equal((await fetch(url+'/api/annual-reports?year=2022')).status,401);
    assert.equal((await fetch(url+'/api/annual-reports?year=2021',{headers})).status,400);
    for(const year of [2022,2023,2024,2025]) {
      const result=await fetch(url+'/api/annual-reports?year='+year,{headers,signal:AbortSignal.timeout(5000)}),body=await result.json();
      assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'private, no-store');
      assert.equal(body.data.length,14);assert.equal(body.accountEmail,owner);assert.equal(body.year,year);
    }
    annualLibrary.get=options=>absent.get(options);
    const unavailable=await fetch(url+'/api/annual-reports?year=2022',{headers});
    assert.equal(unavailable.status,503);assert.equal(unavailable.headers.get('retry-after'),'5');assert.equal((await unavailable.json()).code,'ANNUAL_LIBRARY_UNAVAILABLE');
    assert.equal(sources,0);
  }finally{annualLibrary.get=originalGet;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  console.log('Carga anual: OK · 56 ediciones incluidas, arranque sin caché, archivos dañados, disco sin escritura, recuperación, plazos, cancelación, sesión, datos inválidos y cambios rápidos de año.');
}finally{await fs.rm(temp,{recursive:true,force:true});}
