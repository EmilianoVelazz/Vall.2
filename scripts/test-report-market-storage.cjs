'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
process.env.NODE_ENV='test';process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-server-only';
const {createExecutiveReportStore}=require('../backend/services/executive-report-store');
(async()=>{
 const directory=path.resolve('output/report-market-storage-fixtures');await fs.mkdir(directory,{recursive:true});
 const reports=['overview','grains'].map(key=>({key,title:key,sections:[],sourceSnapshot:{}})),generatedAt='2026-10-23T14:00:00Z';
 const create=extra=>createExecutiveReportStore({table:'market_executive_reports',keys:['overview','grains'],file:path.join(directory,extra.name+'.json'),timeoutMs:10,writeTimeoutMs:100,...extra});
 let signal;
 const rest=create({name:'rest',clientFactory:()=>({from:()=>({upsert:()=>({abortSignal:value=>{signal=value;return new Promise(resolve=>setTimeout(()=>resolve({error:null}),25));}})})}),connect:async()=>{throw Error('Should use REST');}});
 assert.equal((await rest.save(reports,generatedAt)).persistence,'supabase-service-role');assert(signal instanceof AbortSignal);assert(!signal.aborted);
 for(const failing of [false,true]){
  const statements=[];let writes=0,ended=false;
  const store=create({name:failing?'rollback':'commit',clientFactory:()=>null,connect:async()=>({query:async sql=>{statements.push(sql.trim().split(/\s/)[0]);if(sql.startsWith('INSERT') && ++writes===2 && failing)throw Error('Simulated write failure');return {rows:[]};},end:async()=>{ended=true;}})});
  const saved=await store.save(reports,generatedAt);assert(ended);assert.deepEqual(statements,['BEGIN','INSERT','INSERT',failing?'ROLLBACK':'COMMIT']);assert.equal(saved.persistence,failing?'disk':'supabase-postgres');
  if(failing){const data=JSON.parse(await fs.readFile(path.join(directory,'rollback.json'),'utf8'));assert.equal(data.reports.length,2,'All reports remain in the local fallback');}
 }
 console.log('Report cut storage: OK · bounded write deadline, abort signal, transaction commit/rollback, complete disk fallback.');
})().catch(error=>{console.error(error);process.exitCode=1;});
