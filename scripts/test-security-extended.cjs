'use strict';
// Disposable identities, directories and API. Never uses hosting credentials.
process.env.NODE_ENV='test';
process.env.VERCEL='1';
for(const key of ['SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DATABASE_URL','DATABASE_URL','SUPABASE_PASSWORD','DB_PASSWORD','GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS','CRON_SECRET','VALL_AUTH_PASSWORD','USER_PASSWORD','USER_EMAIL'])process.env[key]='';
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {fork}=require('node:child_process');
const {createSessionRevocations,sessionIdentity}=require('../backend/services/session-revocations');

if(process.argv[2]==='--revocation-child'){
 const store=createSessionRevocations({mode:'disk',directory:process.argv[3]});
 process.on('message',async message=>{
  if(message.op==='close')return process.exit(0);
  try{const value=await store[message.op](message.item);process.send({id:message.id,ok:true,value:value??null});}
  catch(error){process.send({id:message.id,ok:false,error:error.message});}
 });
 process.send({ready:true});
}else{
 const checks=[];const output=path.resolve(__dirname,'..',process.env.SECURITY_ASSESSMENT_OUTPUT || 'output/seguridad-ampliada-20261110');
 async function test(name,run){const started=Date.now();try{await run();checks.push({name,passed:true,durationMs:Date.now()-started});console.log('PASS '+name);}catch(error){checks.push({name,passed:false,durationMs:Date.now()-started,error:error.message});console.error('FAIL '+name+': '+error.message);}}
 function identity(name,expiry=Date.now()+60000){const iat=Math.floor(Date.now()/1000);return sessionIdentity({sub:'extended-fixture',jti:name,iat,exp:Math.ceil(expiry/1000)});}
 async function worker(directory){
  const child=fork(__filename,['--revocation-child',directory],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Revocation worker startup timeout'));},15000);child.once('message',message=>{clearTimeout(timer);if(message.ready)resolve();else reject(Error('Worker did not become ready'));});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',()=>{clearTimeout(timer);reject(Error('Worker exited before readiness'));});});
  let serial=0;return {
   request(op,item){const id=++serial;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.off('message',receive);reject(Error('Revocation worker request timeout'));},10000);function receive(message){if(message.id!==id)return;clearTimeout(timer);child.off('message',receive);if(message.ok)resolve(message.value);else reject(Error(message.error));}child.on('message',receive);child.send({id,op,item});});},
   async close(){if(child.exitCode!==null)return;await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},3000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.send({op:'close'});});},
  };
 }
 async function ledgerChecks(directory){
  let now=Date.now();const disk=createSessionRevocations({mode:'disk',directory:path.join(directory,'capacity'),maxRecords:2,now:()=>now}),a=identity('capacity-a'),b=identity('capacity-b'),c=identity('capacity-c');
  await test('Disk capacity rejects a new revocation without evicting existing active records',async()=>{await disk.revoke(a);await disk.revoke(b);await assert.rejects(disk.revoke(c),/ocupado/);assert(await disk.isRevoked(a));assert(await disk.isRevoked(b));assert.equal(await disk.isRevoked(c),false);});
  await test('Repeated logout remains idempotent when the ledger is full',async()=>{await disk.revoke(a);assert(await disk.isRevoked(a));});
  await test('Expired disk records free capacity without invalidating the next revocation',async()=>{now=Math.max(a.expiresAt,b.expiresAt)+1;const next={...c,expiresAt:now+10000};await disk.revoke(next);assert(await disk.isRevoked(next));assert.equal((await fs.readdir(path.join(directory,'capacity'))).filter(name=>name.endsWith('.json')).length,1);});
  await test('An oversized or invalid expiry record fails closed',async()=>{const folder=path.join(directory,'malformed');await fs.mkdir(folder);const ledger=createSessionRevocations({mode:'disk',directory:folder});await fs.writeFile(path.join(folder,a.digest+'.json'),'x'.repeat(300));await assert.rejects(ledger.isRevoked(a));await fs.writeFile(path.join(folder,a.digest+'.json'),JSON.stringify({expiresAt:'tomorrow'}));await assert.rejects(ledger.isRevoked(a));});
  await test('Memory mode cannot accidentally be enabled in production',async()=>{const previous=process.env.NODE_ENV;try{process.env.NODE_ENV='production';assert.throws(()=>createSessionRevocations({mode:'memory'}),/pruebas/);}finally{process.env.NODE_ENV=previous;}});
  await test('Session identities do not depend on JSON claim order and have an eight-hour maximum',async()=>{const iat=Math.floor(now/1000),first={sub:'fixture',iat,jti:'a',exp:iat+86400},second={exp:iat+86400,jti:'a',iat,sub:'fixture'};assert.deepEqual(sessionIdentity(first),sessionIdentity(second));assert.equal(sessionIdentity(first).expiresAt,(iat+28800)*1000);assert.throws(()=>sessionIdentity({sub:'fixture',iat:'not-an-integer'}));});
  const shared=path.join(directory,'processes'),peers=[];
  try{
   for(let i=0;i<4;i++)peers.push(await worker(shared));
   await test('Four processes can revoke distinct sessions concurrently',async()=>{await Promise.all(peers.flatMap((peer,index)=>Array.from({length:4},(_,item)=>peer.request('revoke',identity('worker-'+index+'-'+item)))));assert.equal((await fs.readdir(shared)).filter(name=>name.endsWith('.json')).length,16);});
   await test('All processes observe concurrent logout of the same session',async()=>{const item=identity('concurrent-common');await Promise.all(peers.map(peer=>peer.request('revoke',item)));assert((await Promise.all(peers.map(peer=>peer.request('isRevoked',item)))).every(Boolean));assert.equal((await fs.readdir(shared)).filter(name=>name.endsWith('.tmp')).length,0);});
   await test('A new process still rejects a session revoked before it started',async()=>{const item=identity('persisted-worker');await peers[0].request('revoke',item);const fresh=await worker(shared);try{assert.equal(await fresh.request('isRevoked',item),true);}finally{await fresh.close();}});
  }finally{await Promise.all(peers.map(peer=>peer.close()));}
  const records=new Map();let sqlClosed=0,restReads=0,unavailable=false;
  const rest=()=>({from(table){assert.equal(table,'app_session_revocations');let digest='',after=0;return {select(){return this;},eq(_column,value){digest=value;return this;},gt(_column,value){after=Date.parse(value);return this;},async maybeSingle(){restReads++;return unavailable?{error:Error('Isolated REST outage')}:{data:Date.parse(records.get(digest)||'')>after?{digest}:null};},delete(){return this;},async lte(_column,value){for(const [key,expiry]of records)if(Date.parse(expiry)<=Date.parse(value))records.delete(key);return unavailable?{error:Error('Isolated REST outage')}:{error:null};},async upsert(row){if(unavailable)return {error:Error('Isolated REST outage')};records.set(row.digest,row.expires_at);return {error:null};}};}});
  const fallback=createSessionRevocations({mode:'database',rest,connect:async()=>({query:async()=>{throw Error('Isolated SQL outage');},end:async()=>{sqlClosed++;}})}),item=identity('rest-fallback');
  await test('Failed SQL connections close and fall back to the private REST adapter',async()=>{assert.equal(await fallback.isRevoked(item),false);await fallback.revoke(item);assert.equal(await fallback.isRevoked(item),true);assert(sqlClosed>=3);});
  await test('A previous allowed response is not cached after another instance revokes a session',async()=>{const second=identity('no-negative-cache');assert.equal(await fallback.isRevoked(second),false);records.set(second.digest,new Date(second.expiresAt).toISOString());const before=restReads;assert.equal(await fallback.isRevoked(second),true);assert.equal(restReads,before+1);});
  await test('REST read and write failures never become successful authentication or logout',async()=>{unavailable=true;try{await assert.rejects(fallback.isRevoked(item));await assert.rejects(fallback.revoke(item));}finally{unavailable=false;}});
 }
 async function fileChecks(directory){
  const {createReportFileStore}=require('../backend/services/report-file-store');
  const root=path.join(directory,'files'),store=createReportFileStore({directory:root,maxOwnerFiles:2,maxTotalFiles:3}),owner='files-a@example.invalid',other='files-b@example.invalid';
  const bytes=Buffer.from('Contenido privado de prueba.');let saved;
  await test('Concurrent report writes enforce the per-owner quota without losing accepted files',async()=>{const writes=await Promise.allSettled(Array.from({length:8},(_,i)=>store.save({buffer:bytes,owner,name:'prueba-'+i+'.txt',mime:'text/plain'})));const accepted=writes.filter(x=>x.status==='fulfilled');assert.equal(accepted.length,2);assert(writes.filter(x=>x.status==='rejected').every(x=>x.reason.status===507));saved=accepted[0].value;for(const item of accepted)assert((await store.get(item.value.token,owner)).buffer.equals(bytes));});
  await test('The total quota leaves capacity for another owner and then rejects safely',async()=>{const second=await store.save({buffer:bytes,owner:other,name:'otro.txt',mime:'text/plain'});await assert.rejects(store.save({buffer:bytes,owner:other,name:'no-cabe.txt',mime:'text/plain'}),error=>error.status===507);assert((await store.get(second.token,other)).buffer.equals(bytes));});
  await test('A private file token cannot cross owners; owner email comparison is normalized',async()=>{assert.equal(await store.get(saved.token,other),null);assert.equal(await store.get(saved.token,''),null);assert((await store.get(saved.token,' FILES-A@EXAMPLE.INVALID ')).buffer.equals(bytes));});
  await test('Traversal tokens and unsafe filename or MIME metadata are rejected',async()=>{for(const token of ['../private','a'.repeat(49),'../../'+saved.token])assert.equal(await store.get(token,owner),null);for(const patch of [{name:'../../secret.txt'},{mime:'text/plain\r\nX-Evil: yes'},{buffer:Buffer.alloc(0)}])await assert.rejects(store.save({buffer:bytes,owner,name:'safe.txt',mime:'text/plain',...patch}));});
  const folder=path.join(root,crypto.createHash('sha256').update(owner).digest('hex')),binary=path.join(folder,saved?.token+'.bin'),metadata=path.join(folder,saved?.token+'.json');
  await test('Changing file bytes without changing length fails the stored digest check',async()=>{const altered=Buffer.from(bytes);altered[0]^=1;await fs.writeFile(binary,altered);assert.equal(await store.get(saved.token,owner),null);await fs.writeFile(binary,bytes);assert((await store.get(saved.token,owner)).buffer.equals(bytes));});
  await test('Malformed and oversized report metadata cannot be delivered',async()=>{const original=await fs.readFile(metadata);try{await fs.writeFile(metadata,'{invalid');assert.equal(await store.get(saved.token,owner),null);await fs.writeFile(metadata,' '.repeat(4097));assert.equal(await store.get(saved.token,owner),null);}finally{await fs.writeFile(metadata,original);}});
 }
 async function apiChecks(directory){
  process.env.VALL_REPORT_STORAGE_DIR=path.join(directory,'api-reports');
  const nativeFetch=globalThis.fetch,externalRequests=[];
  globalThis.fetch=(resource,options)=>{const url=new URL(typeof resource==='string' || resource instanceof URL?resource:resource.url);if(!['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname)){externalRequests.push(url.hostname);throw Error('External network blocked by extended fixture');}return nativeFetch(resource,options);};
  const {start}=require('./lib/security-fixture.cjs'),jwt=require('jsonwebtoken'),profiles=require('../backend/services/user-profile-store'),auth=require('../backend/routes/auth'),{sessionRevocations}=require('../backend/services/session-revocations');
  const {reportFileStore,createReportFileStore}=require('../backend/services/report-file-store');
  Object.assign(reportFileStore,createReportFileStore({directory:process.env.VALL_REPORT_STORAGE_DIR}));
  const a={id:'extended-a',email:'extended-a@example.invalid',role:'user',active:true,credentialVersion:2,trainingOptIn:false},b={id:'extended-b',email:'extended-b@example.invalid',role:'user',active:true,credentialVersion:0,trainingOptIn:false};
  profiles.findById=async id=>id===a.id?{...a}:id===b.id?{...b}:null;let adminReads=0;profiles.listProfiles=async()=>{adminReads++;return [];};
  const mint=(actor,patch={},options={})=>jwt.sign({sub:actor.id,email:actor.email,role:actor.role,credentialVersion:actor.credentialVersion,...patch},process.env.JWT_SECRET,{expiresIn:'5m',jwtid:crypto.randomUUID(),...options});
  const token=mint(a),other=mint(b),fixture=await start();
  async function request(route,{session=token,body,headers={}}={}){const response=await fetch(fixture.url+route,{method:body===undefined?'GET':'POST',headers:{...(session?{Authorization:'Bearer '+session}:{}),'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});const bytes=Buffer.from(await response.arrayBuffer());let data;try{data=JSON.parse(bytes);}catch{}return {status:response.status,headers:response.headers,bytes,data};}
  try{
   await test('A valid session works and private responses cannot be shared through caches',async()=>{const response=await request('/api/verify-token');assert.equal(response.status,200);assert(response.headers.get('cache-control').includes('no-store'));assert.equal(response.headers.get('x-vall-account'),a.email);});
   const bad=[['unsigned',jwt.sign({sub:a.id,email:a.email},'',{algorithm:'none'})],['wrong-key',jwt.sign({sub:a.id,email:a.email},'different-fixture-key-at-least-thirty-two-bytes',{expiresIn:'5m'})],['wrong-algorithm',mint(a,{}, {algorithm:'HS384'})],['expired',mint(a,{}, {expiresIn:-1})],['not-yet-valid',mint(a,{nbf:Math.floor(Date.now()/1000)+120})],['missing-issued-at',mint(a,{}, {noTimestamp:true})],['missing-subject',mint(a,{sub:undefined})],['email-mismatch',mint(a,{email:b.email})],['malformed','not.a.jwt'],['oversized','a'.repeat(5000)]];
   for(const [name,invalid]of bad)await test('JWT rejected: '+name,async()=>{assert.equal((await request('/api/verify-token',{session:invalid})).status,401);});
   await test('An administrator claim cannot elevate a current ordinary profile',async()=>{const before=adminReads;assert.equal((await request('/api/admin/profiles',{session:mint(a,{role:'admin'})})).status,403);assert.equal(adminReads,before);});
   await test('Current profile permissions override an older role claim in either direction',async()=>{a.role='admin';auth.invalidateProfileCache(a.id);assert.equal((await request('/api/admin/profiles')).status,200);a.role='user';auth.invalidateProfileCache(a.id);assert.equal((await request('/api/admin/profiles',{session:mint(a,{role:'admin'})})).status,403);});
   await test('A stale account header prevents reading another active account',async()=>{const response=await request('/api/verify-token',{session:other,headers:{'X-VALL-Account':a.email}});assert.equal(response.status,409);assert.equal(response.data.code,'ACCOUNT_CHANGED');});
   let savedUrl;
   await test('Real authenticated export creates a private file for its current owner',async()=>{const response=await request('/api/report-export',{body:{title:'Prueba privada',content:'Datos sintéticos exclusivos A',format:'txt',expectedOwner:a.email}});assert.equal(response.status,200);assert(response.data.success);savedUrl=response.data.downloadUrl;const file=await request(savedUrl);assert.equal(file.status,200);assert(file.bytes.toString().includes('Datos sintéticos exclusivos A'));assert(file.headers.get('content-disposition').startsWith('attachment;'));assert(file.headers.get('cache-control').includes('no-store'));});
   await test('Private exports remain unavailable without a session or to another active owner',async()=>{assert(savedUrl);assert.equal((await request(savedUrl,{session:null})).status,401);const response=await request(savedUrl,{session:other});assert.equal(response.status,404);assert(!response.bytes.toString().includes('Datos sintéticos exclusivos A'));});
   await test('Concurrent cross-owner export attempts fail before creating files',async()=>{const response=await request('/api/report-export',{session:other,body:{title:'B',content:'B',format:'txt',expectedOwner:b.email}});assert.equal(response.status,200);const before=await fs.readdir(process.env.VALL_REPORT_STORAGE_DIR,{recursive:true});const attempts=await Promise.all(Array.from({length:8},()=>request('/api/report-export',{session:other,body:{title:'Denied',content:'Denied',format:'txt',expectedOwner:a.email}})));assert(attempts.every(item=>item.status===409));assert.deepEqual(await fs.readdir(process.env.VALL_REPORT_STORAGE_DIR,{recursive:true}),before);});
   await test('The cookie identity has priority over an unrelated bearer token',async()=>{const response=await request(savedUrl,{session:token,headers:{Cookie:'vn_token='+other}});assert.equal(response.status,404);assert.equal(response.headers.get('x-vall-account'),b.email);});
   await test('Revocation storage outage blocks verification and export even with a warm profile cache',async()=>{const original=sessionRevocations.isRevoked;sessionRevocations.isRevoked=async()=>{throw Error('Isolated revocation read outage');};try{assert.equal((await request('/api/verify-token')).status,503);assert.equal((await request('/api/report-export',{body:{title:'Blocked',content:'Blocked',format:'txt'}})).status,503);}finally{sessionRevocations.isRevoked=original;}assert.equal((await request('/api/verify-token')).status,200);});
   await test('Sixteen simultaneous logout calls are idempotent and finish revocation before success',async()=>{const results=await Promise.all(Array.from({length:16},()=>request('/api/logout',{body:{}})));assert(results.every(item=>item.status===200 && item.data.success));assert.equal((await request('/api/verify-token')).status,401);assert.equal((await request(savedUrl)).status,401);assert.equal((await request('/api/verify-token',{session:other})).status,200);});
   await test('Logging out an expired token remains safe and does not revoke a separate session',async()=>{assert.equal((await request('/api/logout',{session:bad.find(([name])=>name==='expired')[1],body:{}})).status,200);assert.equal((await request('/api/verify-token',{session:other})).status,200);});
   await test('Authorization recovers after an outage without enabling external services',async()=>{assert.equal((await request('/api/verify-token',{session:other})).status,200);assert.deepEqual(externalRequests,[]);});
  }finally{await fixture.close();globalThis.fetch=nativeFetch;}
 }
 async function main(){
  await fs.mkdir(output,{recursive:true});const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-security-extended-'));
  try{await ledgerChecks(directory);await fileChecks(directory);await apiChecks(directory);}finally{const target=path.resolve(directory),relative=path.relative(path.resolve(os.tmpdir()),target);assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(target).startsWith('vall-security-extended-'));await fs.rm(target,{recursive:true,force:true});}
  const summary={generatedAt:new Date().toISOString(),checks,passed:checks.filter(item=>item.passed).length,failed:checks.filter(item=>!item.passed).length,isolatedAccounts:true,temporaryStorage:true,remoteDatabaseTested:false,liveProjectTargeted:false,realMailSent:false};await fs.writeFile(path.join(output,'results.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({passed:summary.passed,failed:summary.failed}));if(summary.failed)process.exitCode=1;
 }
 main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
