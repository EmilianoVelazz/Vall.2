'use strict';
const assert=require('node:assert/strict'),express=require('express');
const {createReportEmailLimits}=require('../backend/lib/report-email-limits');
async function main() {
 const app=express(),limits=createReportEmailLimits({keyGenerator:req=>req.get('x-fixture-user'),maxAttempts:5,maxDeliveries:2,maxSchedules:1});let delivered=0;
 app.post('/send',limits.attempts,limits.deliveries,(req,res)=>{if(req.get('x-fixture-fail'))return res.status(502).json({success:false,code:'REPORT_TRANSLATION_INVALID'});delivered++;res.json({success:true});});
 app.post('/schedule',limits.schedules,(req,res)=>res.json({success:true}));
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 const post=(endpoint,user='owner',fail=false)=>fetch('http://127.0.0.1:'+server.address().port+endpoint,{method:'POST',headers:{'x-fixture-user':user,...(fail ? {'x-fixture-fail':'1'} : {})}});
 async function limited(response) {assert.equal(response.status,429);const body=await response.json();assert.equal(body.code,'REPORT_EMAIL_RATE_LIMIT');assert(body.retryAfterSeconds>0);assert.equal(Number(response.headers.get('retry-after')),body.retryAfterSeconds);}
 try {
  assert.equal((await post('/schedule')).status,200);await limited(await post('/schedule'));
  assert.equal((await post('/send','owner',true)).status,502);assert.equal((await post('/send','owner',true)).status,502);
  assert.equal((await post('/send')).status,200);assert.equal((await post('/send')).status,200);await limited(await post('/send'));
  assert.equal(delivered,2,'Programar y fallar la preparación no consumen el cupo de entrega');await limited(await post('/send'));
  assert.equal((await post('/send','another')).status,200,'La cuota sigue separada por cuenta');
  for(let n=0;n<5;n++)assert.equal((await post('/send','failures',true)).status,502);await limited(await post('/send','failures',true));
  assert.equal(delivered,3);console.log('Report email limits: OK · entrega y programación independientes, fallos de traducción sin consumir entregas, intentos acotados y errores JSON con espera; cero correos reales');
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
