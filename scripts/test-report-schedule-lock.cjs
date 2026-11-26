'use strict';
process.env.NODE_ENV='test';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createScheduleStore}=require('../backend/services/report-email-schedule-store');
const {acquireScheduleFileLock}=require('../backend/lib/schedule-file-lock');
async function main(){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-schedule-lock-'));
 const file=path.join(directory,'schedules.json'),lockPath=file+'.lock';
 try{
  await fs.writeFile(file,'[]');
  await fs.writeFile(lockPath,JSON.stringify({pid:process.pid}));
  const old=new Date(Date.now()-86400000);await fs.utimes(lockPath,old,old);
  const options={file,localOnly:true,serverless:false},store=createScheduleStore(options);
  assert.deepEqual(await store.list('fixture@example.invalid'),[],'Un PID reutilizado no conserva un bloqueo abandonado');
  await assert.rejects(fs.access(lockPath),error=>error.code==='ENOENT');
  await fs.mkdir(lockPath);await fs.utimes(lockPath,old,old);
  assert.deepEqual(await store.list('fixture@example.invalid'),[],'También se recupera un bloqueo abandonado del formato nuevo');
  const owner=await acquireScheduleFileLock(file);
  try{
   await assert.rejects(store.list('fixture@example.invalid'),error=>error.status===503,'Un bloqueo activo conserva la exclusión');
   const before=(await fs.stat(lockPath)).mtimeMs;
   await new Promise(resolve=>setTimeout(resolve,10500));
   assert((await fs.stat(lockPath)).mtimeMs>before,'El bloqueo activo se renueva mientras se utiliza');
   owner.assertOwned();
  }finally{await owner.release();}
  const other=createScheduleStore(options),ownerEmail='fixture@example.invalid';
  await Promise.all(Array.from({length:12},(_,i)=>(i%2?other:store).upsert({ownerEmail,area:'finance',reportKey:'fixture-'+i,preferences:{},delivery:{frequency:'daily',time:'09:00'}})));
  assert.equal((await store.list(ownerEmail)).length,12,'Dos instancias conservan todas las escrituras concurrentes');
  await fs.writeFile(file,'{broken');await assert.rejects(store.list(ownerEmail),SyntaxError);
  await fs.writeFile(file,'[]');assert.deepEqual(await other.list(ownerEmail),[],'Un error de lectura libera el bloqueo');
  console.log('Bloqueos: PID reutilizado, recuperación de ambos formatos, exclusión, renovación, doce escrituras entre instancias y liberación tras errores OK.');
 }finally{
  assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));
  assert(path.basename(directory).startsWith('vall-schedule-lock-'));
  await fs.rm(directory,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
