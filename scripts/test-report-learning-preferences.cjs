'use strict';
const assert=require('node:assert/strict');
const Module=require('node:module');
process.env.SUPABASE_URL='https://learning-profiles.example.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-only';
const storePath=require.resolve('../backend/services/user-profile-store');
let current={id:'fixture',email:'fixture@example.invalid',preferences:{other:true,executiveReports:{depth:'standard'}},updated_at:'2026-10-12T14:00:00.000Z'},writes=0;
const client={from:()=>({
 select:()=>({eq:()=>({maybeSingle:async()=>({data:{...current,preferences:{...current.preferences}}})})}),
 update:patch=>{const conditions={};const chain={eq:(key,value)=>{conditions[key]=value;return chain;},select:()=>chain,maybeSingle:async()=>{
  writes++;if(writes===1) current={...current,preferences:{...current.preferences,executiveReports:{depth:'detailed'}},updated_at:'2026-10-12T14:00:01.000Z'};
  if(conditions.updated_at!==current.updated_at) return {data:null};
  current={...current,...patch};return {data:current};
 }};return chain;},
})};
const original=Module._load;
Module._load=function(name,parent,main) {
 if(name==='dotenv') return {config(){}};
 if(name==='@supabase/supabase-js') return {createClient:()=>client};
 if(name==='../lib/database-connection'&&parent.filename===storePath) return {connectDatabase:async()=>{throw Error('La prueba no usa una base real');}};
 return original.call(this,name,parent,main);
};
let store;try {delete require.cache[storePath];store=require(storePath);} finally {Module._load=original;}
(async()=>{
 const reportLearning={enabled:true,providerEnabled:true,resetAt:null};
 const saved=await store.updateProfile('fixture',{preferences:{other:true,executiveReports:{depth:'standard'},reportLearning},preferencePatch:{reportLearning}});
 assert.equal(writes,2,'Un cambio concurrente vuelve a leer el perfil antes de escribir');assert.equal(saved.preferences.executiveReports.depth,'detailed','No se pierde el ajuste concurrente del informe');assert(saved.preferences.other);assert.equal(saved.preferences.reportLearning.providerEnabled,true);
 console.log('Report learning preferences: OK · guardado concurrente conserva otros ajustes mediante comparación y reintento');
})().catch(error=>{console.error(error);process.exitCode=1;});
