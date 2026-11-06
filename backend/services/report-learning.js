'use strict';
const store=require('./user-profile-store');
const {normalizeLearning,deriveInterests}=require('../lib/report-interests');
function createReportLearning({profiles=store,now=Date.now,timeoutMs=2500}={}) {
 const unavailable=()=>({status:'unavailable',historyEnabled:true,providerEnabled:false,interests:[],queriesUsed:0});
 async function identity(user) {
  if(!user?.email) return null;
  const profile=user.sub ? await profiles.findById(user.sub) : await profiles.findByEmail(user.email);
  return profile?.active && profile.email.toLowerCase()===user.email.toLowerCase() ? profile : null;
 }
 async function load(user) {
  let timer;
  try {return await Promise.race([(async()=>{
   const profile=await identity(user);if(!profile) return unavailable();
   const settings=normalizeLearning(profile.preferences?.reportLearning),cutoff=Math.max(now()-90*86400000,Date.parse(settings.resetAt)||0);
   let queries=[],partial=false;
   if(settings.enabled) try {queries=await profiles.recentReportQueries(profile.id,new Date(cutoff).toISOString());} catch {partial=true;}
   const context=deriveInterests({preferences:profile.preferences,queries,now:now()});
   return {...context,...(partial ? {status:'partial'}:{})};
  })(),new Promise(resolve=>{timer=setTimeout(()=>resolve(unavailable()),timeoutMs);})]);}
  catch {return unavailable();}finally {clearTimeout(timer);}
 }
 async function update(user,{enabled,providerEnabled,reset}={}) {
  const profile=await identity(user);if(!profile) throw Object.assign(Error('No se pudo acceder a tu perfil.'),{status:503});
  if(typeof enabled!=='boolean'&&typeof providerEnabled!=='boolean'&&reset!==true) throw Object.assign(Error('Elige activar, desactivar o reiniciar los intereses.'),{status:400});
  const settings=normalizeLearning(profile.preferences?.reportLearning);
  if(typeof enabled==='boolean') settings.enabled=enabled;
  if(typeof providerEnabled==='boolean') settings.providerEnabled=providerEnabled;
  if(reset===true) settings.resetAt=new Date(now()).toISOString();
  await profiles.updateProfile(profile.id,{preferences:{...profile.preferences,reportLearning:settings},preferencePatch:{reportLearning:settings}});
  return load(user);
 }
 return {load,update};
}
module.exports={createReportLearning,reportLearning:createReportLearning()};
