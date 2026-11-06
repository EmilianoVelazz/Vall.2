'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
process.env.NODE_ENV='test';
process.env.SUPABASE_URL='https://fixture.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-only';
const {createExecutiveReportStore}=require('../backend/services/executive-report-store');
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const reports=stamp=>['overview','grains'].map(key=>({key,title:key,generatedAt:stamp,sections:[]}));
const older='2026-10-30T20:00:00Z',newer='2026-11-06T20:00:00Z';

(async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-cut-consistency-'));
 const create=(name,extra={})=>createExecutiveReportStore({table:'market_executive_reports',keys:['overview','grains'],file:path.join(directory,name+'.json'),connect:async()=>null,timeoutMs:1000,...extra});
 try {
  const entered=deferred(),release=deferred(),writes=[];
  const store=create('ordered',{clientFactory:()=>({from:()=>({upsert:rows=>({abortSignal:async signal=>{
   assert(signal instanceof AbortSignal);writes.push(rows);
   if(writes.length===1){entered.resolve();await release.promise;}
   return {error:null};
  }})})})});
  const first=store.save(reports(older),older);await entered.promise;
  const second=store.save(reports(newer),newer);
  assert.equal((await store.load()).generatedAt,newer,'Readers see the latest in-memory cut while persistence is busy');
  assert.equal(writes.length,1,'A later cut cannot overtake an in-flight remote write');
  release.resolve();const saved=await Promise.all([first,second]);
  assert(saved.every(cut=>cut.generatedAt===newer),'An earlier caller cannot restore old process-level memory after a newer cut was published');
  assert.deepEqual(writes.map(rows=>rows.map(row=>row.generated_at)),[[older,older],[newer,newer]],'Each remote request contains the complete cut, in chronological order');
  assert.equal((await store.save(reports(older),older)).generatedAt,newer);
  assert.equal(writes.length,2,'An outdated generation never writes over a newer cut');
  assert.equal(JSON.parse(await fs.readFile(path.join(directory,'ordered.json'),'utf8')).generatedAt,newer);

  const file=path.join(directory,'cold-read.json');
  await fs.writeFile(file,JSON.stringify({schemaVersion:1,generatedAt:older,reports:reports(older)}));
  const readStarted=deferred(),finishRead=deferred(),originalRead=fs.readFile;
  let intercepted=false;
  fs.readFile=async(target,...args)=>{
   const data=await originalRead(target,...args);
   if(target===file && !intercepted){intercepted=true;readStarted.resolve();await finishRead.promise;}
   return data;
  };
  try {
   const cold=create('cold-read',{clientFactory:()=>null});
   const loading=cold.load();await readStarted.promise;
   await cold.save(reports(newer),newer);finishRead.resolve();
   assert.equal((await loading).generatedAt,newer,'A delayed disk read must not restore an old cut over a new generation');
   assert.equal((await cold.load()).generatedAt,newer);
  } finally {finishRead.resolve();fs.readFile=originalRead;}

  const insertStarted=deferred(),finishInsert=deferred(),closed=deferred(),statements=[];
  const timed=create('timeout',{writeTimeoutMs:100,clientFactory:()=>null,connect:async()=>({
   query:async sql=>{const command=sql.trim().split(/\s+/)[0];statements.push(command);if(command==='INSERT'){insertStarted.resolve();await finishInsert.promise;}return {rows:[]};},
   end:async()=>closed.resolve(),
  })});
  const saving=timed.save(reports(newer),newer);await insertStarted.promise;
  assert.equal((await saving).persistence,'disk','A timed-out remote write retains the complete local cut');
  finishInsert.resolve();await closed.promise;
  assert.deepEqual(statements,['BEGIN','INSERT','ROLLBACK'],'A late query cannot continue writing or commit a partial cut after its deadline');
  console.log('Cut consistency: OK · complete REST batches, serialized writes, stale generation rejection, delayed disk reads and rollback after timeout.');
 } finally {await fs.rm(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
