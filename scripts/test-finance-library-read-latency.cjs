'use strict';
process.env.NODE_ENV='test';process.env.VERCEL='1';process.env.JWT_SECRET='finance-library-latency-fixture-only-32bytes';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const key of ['SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DATABASE_URL','SUPABASE_PASSWORD','GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS','FINNHUB_TOKEN','NEWSAPI_KEY','USER_PASSWORD','VALL_AUTH_PASSWORD'])process.env[key]='';
const assert=require('node:assert/strict'),express=require('express'),{performance}=require('node:perf_hooks');
const nativeFetch=fetch;global.fetch=(url,options)=>String(url).startsWith('http://127.0.0.1:')?nativeFetch(url,options):Promise.reject(Error('External sources disabled in this test'));
const http=require('../backend/lib/http');http.externalGet=async()=>{throw Error('External sources disabled in this test');};http.gdeltFetch=http.externalGet;
const authId=require.resolve('../backend/routes/auth');require.cache[authId]={id:authId,filename:authId,loaded:true,exports:{verifyToken:(req,res,next)=>{req.user={id:'finance-latency',email:'latency@example.invalid'};next();}}};
let snapshot={generatedAt:new Date().toISOString(),reports:[{key:'daily_news',title:'Corte guardado',generatedAt:new Date().toISOString(),newsVersion:0,sections:[],metrics:[],visuals:[],tables:[],financialNews:[]}]},writes=0,loads=0,release;
const store=require('../backend/services/finance-report-store');store.load=async()=>snapshot;store.save=async(reports,generatedAt)=>{writes++;snapshot={reports,generatedAt};return snapshot;};
require('../backend/services/market-report-store').load=async()=>null;require('../backend/services/mexico-report-store').load=async()=>null;
require('../backend/lib/report-financial-news').loadFinancialNews=()=>{loads++;return new Promise(resolve=>{release=resolve;});};
const finance=require('../backend/routes/finanzas');
async function main(){
 const app=express();app.use('/api',finance);const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),url='http://127.0.0.1:'+server.address().port+'/api/finance-executive-reports';
 try{
  const start=performance.now(),first=await fetch(url,{signal:AbortSignal.timeout(1500)}),body=await first.json(),firstMs=Math.round(performance.now()-start);
  assert.equal(first.status,200);assert.equal(body.data[0].title,'Corte guardado');assert.equal(body.generatedAt,snapshot.generatedAt);assert.equal(writes,0,'Delivering a saved edition never waits for or claims a remote write');
  for(let i=0;i<20&&!release;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(loads,1);
  const second=await fetch(url,{signal:AbortSignal.timeout(1500)});assert.equal(second.status,200);await second.text();assert.equal(loads,1,'Concurrent readers share the pending source refresh');
  release({stories:[],status:'unavailable'});for(let i=0;i<100&&!writes;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(writes,1);
  const updated=await(await fetch(url)).json();assert.equal(updated.data[0].newsStatus,'unavailable');assert.equal(loads,1,'A failed source is not retried on every view');
  console.log(JSON.stringify({firstMs,savedReportDeliveredBeforeSources:true,sourceRefreshSingleFlight:true,failedSourceDoesNotBlockLibrary:true,updatedSnapshotVisible:true}));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));global.fetch=nativeFetch;}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
