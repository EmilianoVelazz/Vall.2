'use strict';
process.env.NODE_ENV='test';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {createSessionRevocations,sessionIdentity}=require('../backend/services/session-revocations');
async function main(){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-session-revocations-'));let now=Date.now();
 try{
  const claims={sub:'fixture',iat:Math.floor(now/1000),exp:Math.floor(now/1000)+100,jti:'fixture-session'},identity=sessionIdentity(claims),other=sessionIdentity({...claims,jti:'other-session'}),first=createSessionRevocations({directory,mode:'disk',now:()=>now});
  assert.equal(await first.isRevoked(identity),false);await first.revoke(identity);assert.equal(await first.isRevoked(identity),true);assert.equal(await first.isRevoked(other),false);
  const restarted=createSessionRevocations({directory,mode:'disk',now:()=>now});assert.equal(await restarted.isRevoked(identity),true,'Revocation persists across service instances and restart');await Promise.all([first.revoke(identity),restarted.revoke(identity)]);assert.equal(await restarted.isRevoked(identity),true);
  now+=101000;assert.equal(await restarted.isRevoked(identity),false);await restarted.revoke({...other,expiresAt:now+10000});assert.equal(await fs.access(path.join(directory,identity.digest+'.json')).then(()=>true,()=>false),false);
  await fs.writeFile(path.join(directory,other.digest+'.json'),'{broken');await assert.rejects(restarted.isRevoked(other));await assert.rejects(restarted.isRevoked({digest:'../../private',expiresAt:now+10}));
  assert.equal(sessionIdentity({...claims}).digest,identity.digest);assert.notEqual(identity.digest,other.digest);assert(!JSON.stringify(await fs.readdir(directory)).includes('fixture-session'));
  const records=new Map();const shared=createSessionRevocations({mode:'database',now:()=>now,connect:async()=>({query:async(sql,values)=>{if(sql.startsWith('INSERT'))records.set(values[0],values[1]);if(sql.startsWith('SELECT'))return {rows:records.has(values[0])?[{digest:values[0]}]:[]};return {rows:[]};},end:async()=>{}})});const active={...identity,expiresAt:now+1000};assert.equal(await shared.isRevoked(active),false);await shared.revoke(active);assert.equal(await shared.isRevoked(active),true);
  const unavailable=createSessionRevocations({mode:'database',connect:async()=>{throw Error('offline');},rest:()=>{throw Error('offline');}});await assert.rejects(unavailable.isRevoked(active));await assert.rejects(unavailable.revoke(active));
  const weak=spawnSync(process.execPath,['-e',"require('./backend/routes/auth')"],{cwd:path.resolve(__dirname,'..'),env:{...process.env,JWT_SECRET:'short-fixture-secret'},encoding:'utf8',windowsHide:true});assert.notEqual(weak.status,0);assert(weak.stderr.includes('al menos 32 bytes'));
  console.log('Session revocations: persistent restart, concurrent writes, per-session isolation, expiry, malformed records, shared SQL adapter, storage outage and weak-key startup rejection passed.');
 }finally{const target=path.resolve(directory),relative=path.relative(path.resolve(os.tmpdir()),target);assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(target).startsWith('vall-session-revocations-'));await fs.rm(target,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
