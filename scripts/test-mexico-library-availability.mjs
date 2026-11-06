import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
process.env.NODE_ENV='test';
const {buildMexicoReports,createMexicoReports}=require('../backend/services/mexico-executive-reports');
const {input,time}=require('./lib/mexico-report-fixture.cjs');
const {createMexicoReportsRouter}=require('../backend/routes/mexico-reports'),express=require('express');
const old={reports:buildMexicoReports(input,time),generatedAt:time.toISOString(),expiresAt:time.toISOString()};
let snapshot=structuredClone(old),release,calls=0;
const held=new Promise(resolve=>{release=resolve;});
const service=createMexicoReports({reportStore:{load:async()=>snapshot,save:async value=>(snapshot=value)},now:()=>new Date(time.getTime()+86400000),loaders:Object.fromEntries(Object.entries(input).map(([key,value])=>[key,async()=>{calls++;await held;return value;}])),sourceTimeoutMs:5000});
const app=express();app.use('/api',createMexicoReportsRouter({service,authenticate:(req,res,next)=>next()}));
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
try{
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/mexico-executive-reports',{signal:AbortSignal.timeout(1000)});
 assert.equal(response.status,200);const payload=await response.json();
 assert.equal(payload.refreshing,true);assert.equal(payload.data.length,4);assert.equal(payload.generatedAt,old.generatedAt);
 assert(payload.data.every(report=>report.dataStatus.state==='preserved' && report.generatedAt===old.generatedAt));
 assert.deepEqual(payload.data[2].tables,old.reports[2].tables,'Las fuentes lentas no vacían las referencias estatales');
 const repeated=await service.get();assert.equal(repeated.reports.length,4);assert.equal(calls,3,'Una actualización compartida en segundo plano');
 release();await service.refresh();const updated=await service.get();assert.equal(updated.refreshing,false);assert(updated.reports.every(report=>report.dataStatus.state==='updated'));assert.notEqual(updated.generatedAt,old.generatedAt);
 // A rejected build after collection also must not reject the library read.
 let rejected=false;
 const broken=createMexicoReports({reportStore:{load:async()=>old,save:async()=>{throw Error('No guardar un corte inválido');}},now:()=>new Date(time.getTime()+86400000),loaders:{macro:async()=>({indicators:Array.from({length:31},(_,i)=>({...input.macro.indicators[0],label:'Indicador '+i}))}),bmv:async()=>input.bmv,proteins:async()=>input.proteins}});
 assert.equal((await broken.get()).reports.length,4);
 await broken.refresh().catch(()=>{rejected=true;});assert(rejected);assert.equal((await broken.get()).reports[0].generatedAt,old.generatedAt);
 await broken.refresh().catch(()=>{});
 console.log('Disponibilidad México: OK · apertura inmediata con fuentes pendientes, cuatro informes conservados, actualización compartida y recuperación tras fallo.');
}finally{release();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
