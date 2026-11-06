'use strict';
const assert=require('node:assert/strict');
const express=require('express');
process.env.NODE_ENV='test';
process.env.VERCEL='1';
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const key of ['SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','SUPABASE_DATABASE_URL','DATABASE_URL','SUPABASE_PASSWORD','GEMINI_API_KEY','FINNHUB_TOKEN','NEWSAPI_KEY'])process.env[key]='';
const never=()=>new Promise(()=>{});
const auth=require.resolve('../backend/routes/auth');
require.cache[auth]={id:auth,filename:auth,loaded:true,exports:{verifyToken:(req,res,next)=>{req.user={id:'fixture',email:'fixture@example.invalid'};next();}}};
const store=require('../backend/services/finance-report-store');
const generatedAt=new Date(Date.now()-7*86400000).toISOString();
const original={generatedAt,persistence:'fixture',reports:[{key:'fx',collection:'finance',title:'Corte conservado · SIMULACIÓN',generatedAt,sections:[{heading:'Corte conservado',text:'Contenido sintético.'}],metrics:[],tables:[],visuals:[]}]};
const originalJson=JSON.stringify(original);
store.load=async()=>original;
store.save=async()=>{throw Error('A stalled source must not publish a new cut');};
let generations=0;
require('../backend/lib/report-equity-markets').loadEquityMarkets=()=>{generations++;return never();};
require('../backend/lib/report-bond-markets').loadBondMarkets=async()=>[];
require('../backend/lib/report-bond-context').loadBondNews=async()=>[];
require('../backend/lib/report-fx').loadDiverseFxHistories=async()=>[];
require('../backend/lib/report-deadline').reportDeadline=never;
require('../backend/lib/http').externalGet=async()=>{throw Error('No external provider calls in this fixture');};
const app=express();app.use('/api',require('../backend/routes/finanzas'));
(async()=>{
 const server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
 try {
  const base='http://127.0.0.1:'+server.address().port;
  const responses=await Promise.all(Array.from({length:3},async()=>{
   const response=await fetch(base+'/api/finance-executive-reports',{signal:AbortSignal.timeout(10000)});
   assert.equal(response.status,200);return response.json();
  }));
  for(const payload of responses){assert.equal(payload.generatedAt,generatedAt);assert.equal(payload.data[0].title,original.reports[0].title);assert.equal(payload.stale,true);assert.equal(payload.refreshing,true);assert.equal(payload.updatePending,true);}
  assert.equal(generations,1,'Simultaneous readers share one background refresh even when its provider stalls');
  assert.equal(JSON.stringify(original),originalJson,'Reading must not alter the previous edition or make it look current');
  console.log('Finance stale read: OK · cached edition remains readable, its date is preserved and three readers share one stalled background refresh.');
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
