'use strict';
process.env.NODE_ENV='test';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createScheduleStore}=require('../backend/services/report-email-schedule-store');
const {createScheduledReportDelivery}=require('../backend/services/report-scheduled-delivery');
const {latestReportCutAt,latestMarketReportCutAt}=require('../backend/lib/report-schedule');
const collections=require('../shared/report-collections.json');
async function main(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vall-bundle-schedules-'));const results=[];let now;
 const owner='owner@example.invalid',recipient='recipient@example.invalid';
 const input=(area,key,extra={})=>({ownerEmail:owner,recipientEmail:recipient,area,reportKey:key,delivery:{frequency:'daily',time:'09:00'},...extra});
 function storeFor(name){return createScheduleStore({file:path.join(root,name+'.json'),localOnly:true,serverless:false,clock:()=>now});}
 function dependencies(store,deliverBundle){return {store,collections,now:()=>now.getTime(),personalize:(report,preferences)=>({...report,title:preferences.customTitle||report.title}),prepare:report=>report,generate:async()=>{throw Error('AI disabled');},deliver:async()=>{throw Error('No enviar informes individuales');},deliverBundle,loadSnapshot:async area=>{const generatedAt=(area==='markets'?latestMarketReportCutAt:latestReportCutAt)(now).toISOString();return {generatedAt,reports:collections[area].reportKeys.map(key=>({key,title:key,generatedAt,sections:[]}))};}};}
 async function setup(name,inputs){now=new Date('2026-11-16T14:59:00Z');const store=storeFor(name);for(const item of inputs)await store.upsert(item);now=new Date('2026-11-16T15:00:01Z');return store;}
 try{
  const store=await setup('concurrency',[input('finance','equities'),input('finance','bonds'),input('mexico','mx_bolsa')]),other=storeFor('concurrency');
  const packets=[];let entered,release,pause=true;
  const anchorClaimed=new Promise(resolve=>{entered=resolve;}),hold=new Promise(resolve=>{release=resolve;}),claim=store.claim;
  store.claim=async schedule=>{const won=await claim(schedule);if(won&&pause){pause=false;entered();await hold;}return won;};
  const delivery=async packet=>{assert(await packet.beforeSend());packets.push(packet);return {messageId:'bundle-shared'};};
  const first=createScheduledReportDelivery(dependencies(store,delivery))();
  await anchorClaimed;
  const blocked=await createScheduledReportDelivery(dependencies(other,delivery))();assert.equal(blocked.emails,0);assert.equal(blocked.deferred,3,'El ancla arrendada sigue bloqueando el grupo aunque no aparezca en due()');
  release();const completed=await first;assert.equal(completed.sent,3);assert.equal(completed.emails,1);assert.equal(packets.length,1);assert.equal(packets[0].reports.length,3);
  for(const row of await other.list(owner)){assert.equal(row.nextRunAt,'2026-11-17T15:00:00.000Z');assert.equal(row.preferences._lastDelivery.messageId,'bundle-shared');assert.equal(row.preferences._lastDelivery.bundleReportCount,3);}
  results.push('Dos instancias, ancla oculta en due(), un correo y tres recibos con el horario original');

  const isolated=await setup('isolation',[input('finance','equities'),input('finance','equities',{ownerEmail:'another@example.invalid'}),input('mexico','mx_bolsa',{ownerEmail:'another@example.invalid',preferences:{language:'en'}})]),separate=[];
  await createScheduledReportDelivery(dependencies(isolated,async packet=>{separate.push(packet);return {messageId:'isolated'};}))();
  assert.equal(separate.length,3);assert(separate.every(packet=>packet.reports.length===1));assert.equal(new Set(separate.map(packet=>packet.owner+'|'+packet.language)).size,3);
  results.push('Propietarios e idiomas distintos nunca se mezclan aunque compartan destinatario');

  const cancel=await setup('cancel',[input('finance','equities'),input('mexico','mx_bolsa')]);let accepted=0;
  const canceled=await createScheduledReportDelivery(dependencies(cancel,async packet=>{
   await cancel.upsert(input('mexico','mx_bolsa',{preferences:{customTitle:'Edición nueva'}}));
   if(!(await packet.beforeSend()))return {skipped:true};accepted++;return {};
  }))();
  assert.equal(accepted,0);assert.equal(canceled.sent,0);assert.equal(canceled.deferred,2);
  assert.equal((await cancel.list(owner)).find(row=>row.area==='mexico').preferences.customTitle,'Edición nueva');
  results.push('Una edición modificada durante la preparación cancela el paquete sin sobrescribir cambios');

  const retry=await setup('retry',[input('finance','equities'),input('mexico','mx_bolsa')]);let ready=false,mailCount=0;
  const retryDeps=dependencies(retry,async packet=>{mailCount++;assert.equal(packet.reports.length,2);return {messageId:'retried-together'};}),load=retryDeps.loadSnapshot;
  retryDeps.loadSnapshot=async area=>{const snapshot=await load(area);if(area==='mexico'&&!ready)snapshot.generatedAt='2026-11-15T12:00:00Z';return snapshot;};
  const failed=await createScheduledReportDelivery(retryDeps)();assert.equal(failed.errors,2);assert.equal(mailCount,0);
  const pending=await retry.list(owner);assert(pending.every(row=>row.preferences._deliveryRetries===1));assert.equal(new Set(pending.map(row=>row.preferences._deliveryRunAt)).size,1);
  now=new Date(Date.parse(pending[0].nextRunAt)+1000);ready=true;
  const retried=await createScheduledReportDelivery(retryDeps)();assert.equal(retried.sent,2);assert.equal(retried.emails,1);assert.equal(mailCount,1);
  results.push('Un corte atrasado impide envíos parciales; el reintento conserva el paquete completo');

  const lease=await setup('lease',[input('finance','equities'),input('mexico','mx_bolsa')]);const anchor=(await lease.list(owner)).sort((a,b)=>a.id.localeCompare(b.id))[0];assert(await lease.claim(anchor));
  now=new Date(now.getTime()+11*60000);let recovered=0;
  const recoveredRun=await createScheduledReportDelivery(dependencies(lease,async packet=>{recovered++;assert.equal(packet.reports.length,2);return {};}))();assert.equal(recoveredRun.sent,2);assert.equal(recovered,1);
  results.push('Un proceso interrumpido permite recuperar el ancla y enviar el paquete completo tras vencer el arrendamiento');

  const custom=await setup('custom',[input('finance','equities',{preferences:{aiCustomization:{enabled:true,instructions:'Conservar las cifras',tone:'simple'}}}),input('mexico','mx_bolsa',{preferences:{customTitle:'Lectura de México'}})]);let generated=0;const customized=[];
  const customDeps=dependencies(custom,async packet=>{customized.push(packet);return {};});
  customDeps.generate=async(request,context)=>{generated++;assert.equal(context.ownerEmail,owner);assert.equal(request.instructions,'Conservar las cifras');assert.equal(request.options.tone,'simple');return {...request.report,title:'Edición con IA de prueba'};};
  const customRun=await createScheduledReportDelivery(customDeps)();assert.equal(customRun.sent,2);assert.equal(generated,1);assert.equal(customized.length,1);assert(customized[0].reports.some(item=>item.executive.title==='Edición con IA de prueba'));assert(customized[0].reports.some(item=>item.executive.title==='Lectura de México'));
  results.push('Se conservan el pedido de IA y el título personalizado de cada informe dentro del mismo paquete');

  now=new Date('2026-11-20T19:59:00Z');const weekly=storeFor('weekly');
  await weekly.upsert(input('finance','equities'));await weekly.upsert(input('mexico','mx_bolsa'));
  for(const key of ['grains','proteins'])await weekly.upsert(input('markets',key,{delivery:{frequency:'weekly',time:'14:00',weekday:5}}));
  now=new Date('2026-11-20T20:00:01Z');const weeklyPackets=[];
  const weeklyRun=await createScheduledReportDelivery(dependencies(weekly,async packet=>{weeklyPackets.push(packet);return {};}))();assert.equal(weeklyRun.sent,2);assert.equal(weeklyPackets.length,1);assert(weeklyPackets[0].reports.every(report=>report.area==='markets'));
  results.push('Mercados conserva su envío del viernes a las 14:00 sin adelantar Finanzas ni México');

  const acceptedStore=await setup('receipts',[input('finance','equities'),input('mexico','mx_bolsa')]),record=acceptedStore.record;let receiptFailure=true,acceptedEmails=0;
  acceptedStore.record=async(...args)=>{if(args[1].sentAt&&receiptFailure){receiptFailure=false;throw Object.assign(Error('Synthetic receipt outage'),{code:'FIXTURE_OUTAGE'});}return record(...args);};
  const acceptedDeps=dependencies(acceptedStore,async()=>{acceptedEmails++;return {messageId:'accepted-once'};});
  const acceptedRun=await createScheduledReportDelivery(acceptedDeps)();assert.equal(acceptedRun.sent,2);assert.equal(acceptedRun.emails,1);assert.equal(acceptedRun.errors,1);
  await createScheduledReportDelivery(acceptedDeps)();assert.equal(acceptedEmails,1);assert.equal((await acceptedStore.list(owner)).filter(row=>row.lastSentAt).length,1);
  results.push('Un fallo al guardar un recibo no impide guardar los demás ni reenvía inmediatamente un correo aceptado');
  const output=path.resolve('output/report-bundle-test-20261117');await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'scheduler-tests.json'),JSON.stringify({results,emailsSent:0,temporaryStorage:true},null,2));console.log(JSON.stringify({passed:results.length,results}));
 }finally{const target=path.resolve(root),relative=path.relative(path.resolve(os.tmpdir()),target);assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&path.basename(target).startsWith('vall-bundle-schedules-'));await fs.rm(target,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
