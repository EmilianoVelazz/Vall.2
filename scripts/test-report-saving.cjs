'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),express=require('express');
const {createUserReportStore}=require('../backend/services/user-report-store');
const {createUserReportsRouter}=require('../backend/routes/user-reports');

async function main() {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-save-retry-'));let server,cases=0;
 const store=createUserReportStore({directory,maxReports:4}),report={title:'Plan de prueba',summary:'Texto del usuario',sections:[{heading:'Decisión',text:'Confirmar abastecimiento'}]};
 const check=async(name,fn)=>{await fn();cases++;console.log('OK · '+name);};
 try {
  let loseResponse=false;
  const app=express();app.use('/api',createUserReportsRouter({store:{...store,save:async(...args)=>{const saved=await store.save(...args);if(loseResponse) {loseResponse=false;throw Object.assign(Error('La confirmación se perdió después del guardado'),{status:503});}return saved;}},authenticate:(req,res,next)=>{req.user={email:req.headers['x-fixture-owner']||'ana@example.invalid'};next();}}));
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const post=async(body,owner='ana@example.invalid')=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/user-reports`,{method:'POST',headers:{'Content-Type':'application/json','x-fixture-owner':owner},body:JSON.stringify(body)});return {status:response.status,...await response.json()};};
  const owner='ana@example.invalid',creationId=crypto.randomUUID();let saved;
  await check('respuesta perdida y reintento sin duplicados',async()=>{
   loseResponse=true;assert.equal((await post({creationId,report})).status,503);assert.equal((await store.list(owner)).length,1);
   saved=(await post({creationId,report})).data;assert.equal(saved.editionId,creationId);assert.equal(saved.editionVersion,1);assert.equal((await store.list(owner)).length,1);
  });
  await check('veinte reintentos simultáneos del mismo borrador',async()=>{
   const results=await Promise.all(Array.from({length:20},()=>post({creationId,report})));assert(results.every(result=>result.status===200 && result.data.editionVersion===1));assert.equal((await store.list(owner)).length,1);
  });
  await check('reintento tras reinicio y distinto orden de campos',async()=>{
   const restarted=createUserReportStore({directory});const replay=await restarted.save(owner,{creationId,report:{sections:report.sections,summary:report.summary,title:report.title}});assert.equal(replay.editionId,creationId);assert.equal(replay.updatedAt,saved.updatedAt);
  });
  await check('un cambio de texto en otra pestaña no sobrescribe el informe',async()=>{
   const conflict=await post({creationId,report:{...report,summary:'Otra decisión'}});assert.equal(conflict.status,409);assert.equal(conflict.code,'REPORT_CREATION_CONFLICT');assert.equal((await store.get(owner,creationId)).summary,report.summary);
  });
  await check('la misma identidad está aislada por cuenta',async()=>{
   const other=await post({creationId,report:{...report,title:'Documento de Luis'}},'luis@example.invalid');assert.equal(other.status,200);assert.equal((await store.get(owner,creationId)).title,report.title);assert.equal((await store.list('luis@example.invalid')).length,1);
  });
  await check('identidades inválidas y mezcla de crear con actualizar',async()=>{
   for(const invalid of ['../archivo',0,{},[creationId],'A'.repeat(500)]) assert.equal((await post({creationId:invalid,report})).status,400);
   assert.equal((await post({id:creationId,version:1,creationId,report})).status,400);
  });
  await check('un fallo de escritura libera el intento para reintentar',async()=>{
   const original=fs.writeFile,id=crypto.randomUUID();let injected=false;
   fs.writeFile=async(target,...args)=>{if(!injected && String(target).startsWith(directory) && String(target).endsWith('.tmp')) {injected=true;throw Object.assign(Error('Disco no disponible'),{code:'ENOSPC'});}return original(target,...args);};
   try {assert.equal((await post({creationId:id,report})).status,503);assert.equal(await store.get(owner,id),null);} finally {fs.writeFile=original;}
   assert.equal((await post({creationId:id,report})).status,200);assert.equal((await store.list(owner)).length,2);
  });
  await check('eliminar y reintentar no resucita el documento',async()=>{
   await store.remove(owner,{id:creationId,version:1});const replay=await post({creationId,report});assert.equal(replay.status,410);assert.equal(replay.code,'REPORT_CREATION_REMOVED');assert.equal(await store.get(owner,creationId),null);
   const restarted=createUserReportStore({directory});await assert.rejects(restarted.save(owner,{creationId,report}),error=>error.status===410);
  });
  await check('una copia deliberada recibe una identidad distinta',async()=>{
   const copy=await post({creationId:crypto.randomUUID(),report});assert.equal(copy.status,200);assert.notEqual(copy.data.editionId,creationId);
  });
  await check('el límite de documentos no bloquea un reintento ya guardado',async()=>{
   while((await store.list(owner)).length<4) await post({creationId:crypto.randomUUID(),report});
   assert.equal((await post({creationId:crypto.randomUUID(),report})).status,409);const entry=(await store.list(owner))[0],existing=await store.get(owner,entry.editionId);
   assert.equal((await post({creationId:entry.editionId,report:{title:existing.title,summary:existing.summary,sections:existing.sections}})).status,200);
  });
  console.log(`Report saving: OK · ${cases} escenarios con servidor y archivos temporales reales`);
 } finally {if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
