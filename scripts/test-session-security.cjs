'use strict';
// All identities, providers and writes are simulated in this process.
const assert=require('node:assert/strict');
const jwt=require('jsonwebtoken');
const {start}=require('./lib/security-fixture.cjs');
const profiles=require('../backend/services/user-profile-store');
const {orchestrator}=require('../backend/ai/orchestrator');
async function main(){
 const fixture=await start();
 const current={id:'session-security',email:'session-security@example.invalid',role:'user',active:true,credentialVersion:0,trainingOptIn:true,preferences:{}};
 let down=false,trainingWrites=0;
 profiles.findById=async id=>{if(down)throw Error('Simulated profile outage');return id===current.id?{...current}:null;};
 profiles.recordTrainingQuery=async()=>{trainingWrites++;return true;};
 const token=patch=>jwt.sign({sub:current.id,email:current.email,role:'user',trainingOptIn:true,...patch},process.env.JWT_SECRET,{expiresIn:'5m'});
 const legacy=token({});
 const request=async(token,route='/api/verify-token',body)=>{
  const response=await fetch(fixture.url+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});
  await response.text();return response.status;
 };
 try{
  assert.equal(await request(legacy),200,'An active baseline account can use its older session');
  current.active=false;
  for(const [route,body] of [['/api/verify-token'],['/api/ai-rich',{message:'Analiza proteínas'}],['/api/user-reports']])assert.equal(await request(legacy,route,body),401,'Disabled account cannot retain access through a legacy token: '+route);
  current.active=true;current.credentialVersion=1;
  assert.equal(await request(legacy),401,'Password version invalidates legacy sessions too');
  for(const version of [0,-1,'1',null])assert.equal(await request(token({credentialVersion:version})),401,'Reject an obsolete or invalid credential version');
  const fresh=token({credentialVersion:1});assert.equal(await request(fresh),200);
  down=true;assert.equal(await request(fresh),503,'Storage failure does not silently authenticate a user');down=false;
  current.trainingOptIn=false;
  assert.equal(await request(fresh,'/api/ai-rich',{message:'Analiza proteínas'}),200);assert.equal(trainingWrites,0,'An older consent claim cannot override the current opt-out');
  current.trainingOptIn=true;
  assert.equal(await request(token({credentialVersion:1,trainingOptIn:false}),'/api/ai-rich',{message:'Analiza proteínas'}),200);assert.equal(trainingWrites,1,'A new opt-in is read from the profile');
  const generate=orchestrator.generateStructured;
  orchestrator.generateStructured=async input=>{const result=await generate(input);current.trainingOptIn=false;return result;};
  assert.equal(await request(fresh,'/api/ai-rich',{message:'Analiza proteínas'}),200);assert.equal(trainingWrites,1,'Recheck consent after generation, before persisting');
  down=true;assert.equal(await request(fresh),503);down=false;
  current.role='admin';current.active=false;assert.equal(await request(token({role:'admin',credentialVersion:1})),401,'A disabled administrator other than the bootstrap owner cannot retain a signed session');
  console.log('Session security: OK · legacy revocation, account status, credential versions, profile outage and current training consent.');
 }finally{await fixture.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
