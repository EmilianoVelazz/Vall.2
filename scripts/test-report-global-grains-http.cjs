'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
process.env.NODE_ENV='test';process.env.VERCEL='1';process.env.JWT_SECRET='fixture-global-grains-http';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DATABASE_URL','SUPABASE_PASSWORD'])process.env[key]='';
const express=require('express'),jwt=require('jsonwebtoken'),profiles=require('../backend/services/user-profile-store');
profiles.findById=async id=>({id,email:'grains@example.invalid',active:true,credentialVersion:0});
(async()=>{
 if(process.argv.includes('--server'))for(const [url,status]of [['http://127.0.0.1:3101/api/health',200],['http://127.0.0.1:5273/informes',200],['http://127.0.0.1:3101/api/market-executive-reports',401]]){const response=await fetch(url,{signal:AbortSignal.timeout(12000)});assert.equal(response.status,status);console.log('Local',url,response.status);}
 const report=JSON.parse(await fs.readFile('output/granos-global-20261026/report.json'));
 const app=express();app.use('/api',require('../backend/routes/export'));const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 try{
  const token=jwt.sign({sub:'fixture-grains',email:'grains@example.invalid',role:'user',credentialVersion:0},process.env.JWT_SECRET,{expiresIn:'5m'}),url='http://127.0.0.1:'+server.address().port+'/api/report-export';
  const unauthorized=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(unauthorized.status,401);
  for(const format of ['xlsx','pdf']){
   const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-VALL-Report-Language':'es'},body:JSON.stringify({format,response:'file',language:'es',expectedOwner:'grains@example.invalid',title:report.title,content:report.summary || 'Granos y forrajes · panorama mundial',executiveReport:report}),signal:AbortSignal.timeout(45000)});
   if(response.status!==200)throw Error(format+': HTTP '+response.status+' '+(await response.text()).slice(0,350));
   assert(response.headers.get('content-disposition')?.includes('attachment'));const bytes=Buffer.from(await response.arrayBuffer());
   if(format==='xlsx'){assert(response.headers.get('content-type').startsWith('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));assert.equal(bytes.subarray(0,2).toString(),'PK');const zip=await require('jszip').loadAsync(bytes);assert((await zip.file('xl/workbook.xml').async('string')).includes('Horizontes'));}
   else {assert(response.headers.get('content-type').startsWith('application/pdf'));assert.equal(bytes.subarray(0,5).toString(),'%PDF-');}
   await fs.writeFile('output/granos-global-20261026/http-'+format+'.'+format,bytes);console.log('Authenticated grain download:',format,response.status,bytes.length,'bytes');
  }
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
