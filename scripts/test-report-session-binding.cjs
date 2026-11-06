'use strict';
const assert=require('node:assert/strict'),express=require('express');
process.env.NODE_ENV='test';process.env.GMAIL_USER='sender@example.invalid';process.env.GMAIL_PASS='fixture-only';
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='true'; // All delivery and schedule side effects below are stubs.
require('nodemailer').createTransport=()=>{throw Error('SMTP no debe abrirse en la prueba de identidad');};
const owner='ana@example.invalid',other='luis@example.invalid',operations=[];
function replaceModule(name,value) {const id=require.resolve(name);require.cache[id]={id,filename:id,loaded:true,exports:value};}
replaceModule('../backend/routes/auth',{verifyToken:(req,res,next)=>{req.user={email:owner};next();}});
replaceModule('../backend/services/report-file-store',{reportFileStore:{save:async()=>{operations.push('export');return {token:'fixture',name:'prueba.txt',size:5};}}});
replaceModule('../backend/services/report-email-schedule-store',{
 list:async()=>[],upsert:async input=>{operations.push('schedule');return {...input,nextRunAt:'2026-10-14T14:00:00Z'};},
 upsertMany:async inputs=>{operations.push('schedule-batch');return inputs.map(input=>({...input,nextRunAt:'2026-10-14T14:00:00Z'}));},
 remove:async()=>operations.push('cancel'),
});
const router=require('../backend/routes/export');
async function main() {
 const app=express();app.use('/api',router);let server;
 try {
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const request=async(endpoint,body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/${endpoint}`,{method:body ? 'POST' : 'GET',headers:{'Content-Type':'application/json'},...(body ? {body:JSON.stringify(body)} : {})});return {status:response.status,...await response.json()};};
  const cases=[['report-export',{title:'Prueba',content:'Texto',format:'txt'}],['report-email',{title:'Prueba',content:'Texto'}],['report-email-schedules',{area:'finance',reportKey:'overview',delivery:{enabled:true,frequency:'daily',time:'08:00'}}],['report-email-schedules/batch',{reports:[{area:'finance',reportKey:'equities'},{area:'mexico',reportKey:'mx_proteins'}],delivery:{frequency:'daily',time:'08:25'}}],['report-email-schedules/cancel',{area:'finance',reportKey:'overview'}]];
  for(const [endpoint,body] of cases) {
   const result=await request(endpoint,{...body,expectedOwner:other});assert.equal(result.status,409,endpoint);assert.equal(result.code,'REPORT_ACCOUNT_CHANGED');
  }
  assert.deepEqual(operations,[],'El rechazo precede a exportar, enviar o modificar programaciones');
  assert.equal((await request('report-email-schedules')).accountEmail,owner);
  for(const [endpoint,body] of cases.filter(([endpoint])=>endpoint!=='report-email')) assert.equal((await request(endpoint,{...body,expectedOwner:owner.toUpperCase()})).status,200,endpoint);
  assert.deepEqual(operations,['export','schedule','schedule-batch','cancel']);
  assert.equal((await request('report-email-schedules/batch',{expectedOwner:owner,reports:[{area:'finance',reportKey:'invalid'}]})).status,400);
  assert.deepEqual(operations,['export','schedule','schedule-batch','cancel'],'La validación completa precede al guardado');
  console.log('Report session binding: OK · rutas reales de exportación, correo, programación y cancelación; ninguna entrega real');
 } finally {if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
