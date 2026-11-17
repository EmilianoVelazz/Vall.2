'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),express=require('express');
process.env.NODE_ENV='test';process.env.JWT_SECRET='morning-brief-isolated-test-fixture-only-testing-32bytes';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const {createMorningBriefService}=require('../backend/services/morning-brief-service');
const {createMorningBriefRouter}=require('../backend/routes/morning-brief');
const {weeklyReport}=require('../shared/report-weekly.mjs');
const snapshots=Object.fromEntries([['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']].map(([key,name])=>[key,JSON.parse(fs.readFileSync('backend/cache/'+name+'.json','utf8'))]));
const sourceBefore=JSON.stringify(snapshots),checks=[];
const check=name=>{checks.push(name);console.log('PASS '+name);};
async function main(){
 let clock=Date.parse('2030-01-01T00:00:00Z');const counts={finance:0,markets:0,mexico:0};
 const loaders=Object.fromEntries(Object.entries(snapshots).map(([area,snapshot])=>['load'+({finance:'Finance',markets:'Markets',mexico:'Mexico'})[area],async()=>{counts[area]++;return snapshot;}]));
 const build=createMorningBriefService({...loaders,now:()=>clock,ttlMs:1000});
 const concurrent=await Promise.all(Array.from({length:30},()=>build())),brief=concurrent[0];
 assert(concurrent.every(value=>value===brief));assert.deepEqual(Object.values(counts),[1,1,1]);assert.equal(await build(),brief);
 check('30 lectores comparten una carga y una composición; caché acotada');
 const source=(area,key,predicate)=>weeklyReport(snapshots[area].reports.find(report=>report.key===key)).references.find(predicate);
 for(const [key,reference]of [
  ['usdmxn',source('finance','fx',item=>item.label==='USD/MXN')],
  ['corn_cbot',source('markets','grains',item=>item.symbol==='ZC=F')],
  ['soy_cbot',source('markets','grains',item=>item.symbol==='ZM=F')],
  ['treasury10',source('finance','bonds',item=>/Treasury 10 a/.test(item.label))],
  ['ipc',source('finance','equities',item=>item.symbol==='^MXX')],
 ]){
  assert(reference,'Real fixture contains '+key);const metric=brief.metrics.find(item=>item.key===key);
  assert.equal(metric.numericValue,reference.last.value);assert.equal(metric.unit,reference.unit);assert.equal(metric.date,reference.last.date);assert.equal(metric.numericChange,reference.periods.day?.value ?? null);
 }
 assert.equal(JSON.stringify(snapshots),sourceBefore);assert.notEqual(Date.parse(brief.generatedAt),clock);
 check('Precios, productos, unidades, fechas y puntos base coinciden con el informe fuente');
 clock+=1001;await build();assert.deepEqual(Object.values(counts),[2,2,2]);
 check('Al vencer la caché se vuelve a consultar sin inventar un corte nuevo');
 const empty=createMorningBriefService({loadFinance:async()=>null,loadMarkets:async()=>null,loadMexico:async()=>null});
 await assert.rejects(empty(),error=>error.code==='REPORT_DATA_UNAVAILABLE');
 check('Sin fuentes no se sustituyen cotizaciones por constantes');
 const partial=await createMorningBriefService({loadFinance:loaders.loadFinance,loadMarkets:async()=>{throw Error('Fixture');},loadMexico:async()=>null,now:()=>clock})();
 assert(partial.stale);assert(partial.metrics.filter(item=>['corn_cbot','soy_cbot','wti','pork_mx','egg_mx'].includes(item.key)).every(item=>!item.available && item.numericValue===null));
 check('La carga parcial identifica ausencias y conserva solamente cifras publicadas');
 let fail=false;
 const recover=createMorningBriefService({now:()=>clock,ttlMs:0,...Object.fromEntries(Object.entries(snapshots).map(([area,snapshot])=>['load'+({finance:'Finance',markets:'Markets',mexico:'Mexico'})[area],async()=>{if(fail)throw Error('Fixture');return snapshot;}]))});
 const first=await recover();fail=true;const stale=await recover();assert(stale.stale);assert.equal(stale.sourceErrors.length,3);assert.deepEqual(stale.metrics,first.metrics);assert.equal(stale.generatedAt,first.generatedAt);
 check('Un fallo posterior conserva el corte anterior y declara su estado');
 const stalledCounts=[0,0,0],stall=index=>()=>{stalledCounts[index]++;return new Promise(()=>{});};
 const stalled=createMorningBriefService({loadFinance:stall(0),loadMarkets:stall(1),loadMexico:stall(2),timeoutMs:25});
 for(let round=0;round<2;round++){const values=await Promise.allSettled(Array.from({length:15},()=>stalled()));assert(values.every(value=>value.status==='rejected'));}
 assert.deepEqual(stalledCounts,[1,1,1]);
 check('Proveedores que ignoran cancelación mantienen solo tres operaciones pendientes');
 let calls=0;const app=express();
 app.use('/private',createMorningBriefRouter({build:async()=>{calls++;return brief;}}));
 app.use('/fixture',createMorningBriefRouter({authenticate:(req,res,next)=>{req.user={email:'brief@example.invalid'};next();},build:async()=>{calls++;return brief;}}));
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  const denied=await fetch(origin+'/private/morning-brief');assert.equal(denied.status,401);await denied.arrayBuffer();assert.equal(calls,0);
  const allowed=await fetch(origin+'/fixture/morning-brief');assert.equal(allowed.status,200);assert.equal(allowed.headers.get('cache-control'),'private, no-store');assert.equal((await allowed.json()).accountEmail,'brief@example.invalid');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 check('La ruta requiere sesión y evita caché pública de respuestas autenticadas');
 fs.mkdirSync('output/revision-codigo-20261110',{recursive:true});fs.writeFileSync('output/revision-codigo-20261110/morning-brief.json',JSON.stringify({checks,remoteRequests:false},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
