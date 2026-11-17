'use strict';
process.env.NODE_ENV='test';process.env.VERCEL='1';process.env.JWT_SECRET='pdf-cache-http-fixture-not-production-32-bytes';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const key of ['SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DATABASE_URL','SUPABASE_PASSWORD','GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS','USER_PASSWORD','VALL_AUTH_PASSWORD'])process.env[key]='';
const assert=require('node:assert/strict'),express=require('express'),jwt=require('jsonwebtoken');
const profiles=require('../backend/services/user-profile-store'),users=[{id:'pdf-cache-a',email:'a@example.invalid',role:'user',active:true,credentialVersion:0},{id:'pdf-cache-b',email:'b@example.invalid',role:'user',active:true,credentialVersion:0}];
profiles.findById=async id=>{const user=users.find(item=>item.id===id);return user?{...user}:null;};
const {reportLabels}=require('../backend/lib/report-language');
require('../backend/services/report-translation').reportTranslator.localize=async input=>({...input,...reportLabels(input.language),source:value=>value,translateText:value=>value});
const auth=require('../backend/routes/auth'),exportsRouter=require('../backend/routes/export'),{reportPdfCache}=require('../backend/lib/report-pdf-cache');
async function main(){
 const app=express();app.use('/api',auth.router);app.use('/api',exportsRouter);
 const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));}),base='http://127.0.0.1:'+server.address().port;
 const token=user=>jwt.sign({sub:user.id,email:user.email,role:'user',credentialVersion:user.credentialVersion},process.env.JWT_SECRET,{expiresIn:'5m',jwtid:require('node:crypto').randomUUID()}),a=token(users[0]),b=token(users[1]);
 const request=async(session,owner=users[0].email,extra={})=>{const response=await fetch(base+'/api/report-export',{method:'POST',headers:{Authorization:'Bearer '+session,'Content-Type':'application/json'},body:JSON.stringify({title:'Vista privada',content:'Dato ficticio: 10 MXN.',format:'pdf',response:'file',expectedOwner:owner,...extra})});return {response,bytes:Buffer.from(await response.arrayBuffer())};};
 try{
  const first=await request(a),cached=await request(a);assert.equal(first.response.status,200);assert(first.bytes.equals(cached.bytes));assert.equal(reportPdfCache.snapshot().entries,1);assert.match(cached.response.headers.get('cache-control'),/private, no-store/);
  assert.equal((await request('invalid')).response.status,401);
  assert.equal((await request(b)).response.status,409);assert.equal(reportPdfCache.snapshot().entries,1,'Account binding runs before cache use');
  assert.equal((await request(b,users[1].email)).response.status,200);assert.equal(reportPdfCache.snapshot().entries,2);
  users[0].active=false;auth.invalidateProfileCache();assert.equal((await request(a)).response.status,401,'A warm PDF cannot bypass a disabled profile');
  users[0].active=true;users[0].credentialVersion=1;auth.invalidateProfileCache();assert.equal((await request(a)).response.status,401);
  const renewed=token(users[0]);assert.equal((await request(renewed)).response.status,200);
  const logout=await fetch(base+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+renewed}});await logout.text();assert.equal(logout.status,200);assert.equal((await request(renewed)).response.status,401,'A warm PDF cannot bypass logout revocation');
  console.log('Cached PDF HTTP: identical bytes, private headers, current authentication, account binding, account isolation, disabled profiles, password versions and logout revocation passed.');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
