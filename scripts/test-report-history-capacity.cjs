'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createReportHistoryStore}=require('../backend/services/report-history-store');
async function main(){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-history-capacity-'));
 try{
  const source=JSON.parse(await fs.readFile(path.resolve(__dirname,'../backend/cache/finance_executive_reports.json'),'utf8'));
  const reports=source.reports.filter(report=>['equities','fx'].includes(report.key)),store=createReportHistoryStore({directory});
  assert.equal(reports.length,2);await store.archive(reports,'finance');const entries=await store.list({area:'finance'});assert.equal(entries.length,2,'Full equity and FX histories must fit the archive');
  for(const report of reports){
   const entry=entries.find(item=>item.key===report.key),saved=await store.get(entry.id),expected=structuredClone({...report,collection:'finance'});delete expected.sourceInputs;delete expected.causeText;if(expected.dataStatus)delete expected.dataStatus.attemptedAt;
   assert.deepEqual(saved.report,expected,'Archive must retain every original series, point and table');
   await fs.writeFile(path.join(directory,'index',entry.id+'.json'),'{invalid');
  }
  assert.equal((await store.list()).length,2,'Large immutable editions can rebuild their metadata');
  await store.archive([{key:'fx',title:'Oversized fixture',generatedAt:'2026-11-10T12:00:00Z',content:'x'.repeat(7*1024*1024)}],'finance');assert.equal((await store.list()).length,2,'Oversized editions remain bounded');
  const id='f'.repeat(64);await fs.writeFile(path.join(directory,id+'.json'),'x'.repeat(7*1024*1024+1));assert.equal(await store.get(id),null,'Read limit matches archive write limit');
  console.log('History capacity: complete equity/FX round trips, metadata recovery and bounded oversized reads/writes passed.');
 }finally{
  const resolved=path.resolve(directory),relative=path.relative(path.resolve(os.tmpdir()),resolved);assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(resolved).startsWith('vall-history-capacity-'));await fs.rm(resolved,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
