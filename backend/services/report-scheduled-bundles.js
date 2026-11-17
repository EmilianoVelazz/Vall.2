'use strict';
const {normalizeRecipient}=require('../lib/report-email-recipient');
const {enrichSectorReport}=require('../lib/report-sector-format');
const {latestReportCutAt,latestMarketReportCutAt}=require('../lib/report-schedule');
function slot(schedule){const value=schedule.scheduledFor||schedule.preferences?._deliveryRunAt||schedule.preferences?._deliveryLease?.scheduledFor||schedule.nextRunAt;return Number.isFinite(Date.parse(value))?new Date(value).toISOString():String(value||'');}
function bundleKey(schedule){return JSON.stringify([String(schedule.ownerEmail||'').trim().toLowerCase(),normalizeRecipient(schedule.preferences?.emailRecipient,schedule.ownerEmail),schedule.preferences?.language||'es',slot(schedule)]);}

function createScheduledBundleDelivery({store,collections,loadSnapshot,generate,personalize,prepare,deliverBundle,normalizeAiCustomization,now,maxDurationMs,concurrency}){
 return async function runBundles(due){
  if(['list','claim','isCurrent'].some(method=>typeof store[method]!=='function'))throw Error('El envío agrupado requiere consultar, reclamar y validar las programaciones del propietario.');
  const started=now(),owners=new Map(),snapshots=new Map(),seen=new Set(),groups=[];
  let sent=0,emails=0,errors=0,deferred=0,cursor=0;
  for(const seed of due){
   let key;try{key=bundleKey(seed);}catch{key='invalid:'+seed.id;}
   if(seen.has(key))continue;seen.add(key);
   if(key.startsWith('invalid:')){groups.push([seed]);continue;}
   if(!owners.has(seed.ownerEmail))owners.set(seed.ownerEmail,Promise.resolve().then(()=>store.list(seed.ownerEmail)));
   // Incluir también el ancla que otra instancia haya arrendado: aunque ya
   // no salga en due(), impide partir un mismo paquete entre dos procesos.
   const rows=await owners.get(seed.ownerEmail);
   const members=rows.filter(row=>{try{return row.active!==false&&bundleKey(row)===key;}catch{return false;}}).sort((a,b)=>a.id.localeCompare(b.id));
   if(members.length)groups.push(members);else deferred++;
  }
  async function recordRetry(schedule,message,retryable=true){
   await store.record(schedule.id,{error:message,delivery:schedule.delivery,preferences:schedule.preferences,retryable,leaseUntil:schedule.leaseUntil,leaseToken:schedule.leaseToken});
  }
  async function releaseGroup(claimed){for(const schedule of claimed)await recordRetry(schedule,'La selección cambió durante la preparación. Se reintentará el paquete completo.').catch(()=>{});}
  async function processGroup(members){
   if(now()-started>maxDurationMs-90000){deferred+=members.length;return;}
   const claimed=[],ready=[];let accepted=false;
   const startedAt=new Date(now()).toISOString();
   try{
    // Reclamar siempre primero el mismo ID. No enviar un subconjunto si
    // algún miembro ya está ocupado o cambió desde que se leyó la selección.
    for(const schedule of members){
     if(store.claim && !(await store.claim(schedule))){deferred+=members.length;await releaseGroup(claimed);return;}
     claimed.push(schedule);
    }
    const first=members[0],recipient=normalizeRecipient(first.preferences?.emailRecipient,first.ownerEmail),language=first.preferences?.language||'es';
    for(const schedule of members){
     if(!collections[schedule.area]?.reportKeys.includes(schedule.reportKey))throw Object.assign(Error('Colección o informe no disponible.'),{status:400});
     if(!snapshots.has(schedule.area))snapshots.set(schedule.area,Promise.resolve().then(()=>loadSnapshot(schedule.area)));
     const snapshot=await snapshots.get(schedule.area),scheduledFor=slot(schedule);
     const cut=Number.isFinite(Date.parse(scheduledFor))?(schedule.area==='markets'?latestMarketReportCutAt:latestReportCutAt)(new Date(Math.max(Date.parse(scheduledFor),now()))):null;
     const original=snapshot?.reports?.find(report=>report.key===schedule.reportKey);
     if(cut&&(!(Date.parse(snapshot?.generatedAt)>=cut.getTime())||original&&!(Date.parse(original.generatedAt)>=cut.getTime())))throw Object.assign(Error('El corte programado aún no está listo; se reintentará el paquete completo.'),{code:'REPORT_CUT_NOT_READY'});
     if(!original)throw Error('No existe el informe en el corte vigente.');
     const base=enrichSectorReport(original,schedule.area),ai=normalizeAiCustomization(schedule.preferences?.aiCustomization);
     const report=ai.enabled?await generate({report:{...base,collection:schedule.area},preferences:schedule.preferences,instructions:ai.instructions,options:{tone:ai.tone,...(ai.mode?{mode:ai.mode}:{}),...(ai.preferenceOverrides?.length?{preferenceOverrides:ai.preferenceOverrides}:{})}},{ownerEmail:schedule.ownerEmail}):personalize(base,schedule.preferences);
     ready.push({schedule,base,area:schedule.area,title:report.title,executive:prepare(report)});
    }
    const beforeSend=async()=>!store.isCurrent||(await Promise.all(members.map(schedule=>store.isCurrent(schedule)))).every(Boolean);
    if(!(await beforeSend())){deferred+=members.length;await releaseGroup(claimed);return;}
    const delivery=await deliverBundle({recipient,language,owner:first.ownerEmail,reports:ready.map(({area,title,executive})=>({area,title,executive})),beforeSend});
    if(delivery?.skipped){deferred+=members.length;await releaseGroup(claimed);return;}
    accepted=true;emails++;sent+=members.length;
    const acceptedAt=new Date(now()).toISOString();
    // SMTP ya aceptó el paquete. Intentar guardar el recibo de cada miembro,
    // incluso si falla uno, sin convertir una entrega aceptada en un reenvío.
    for(const {schedule,base}of ready){
     const preferences={...schedule.preferences,_lastDelivery:{scheduledFor:slot(schedule),startedAt,acceptedAt,reportGeneratedAt:base.generatedAt,bundleReportCount:members.length,...(delivery?.messageId?{messageId:delivery.messageId}:{})}};
     try{await store.record(schedule.id,{sentAt:acceptedAt,delivery:schedule.delivery,preferences,leaseUntil:schedule.leaseUntil,leaseToken:schedule.leaseToken});}
     catch(error){errors++;console.warn('[report-email-bundles] No se confirmó un recibo aceptado:',error.code||error.name);}
    }
   }catch(error){
    if(!accepted){errors+=members.length;const message=error.code==='REPORT_CUT_NOT_READY'||[400,413,422].includes(error.status)?error.message:'No se pudo preparar o entregar el paquete completo.';
     for(const schedule of claimed)await recordRetry(schedule,message,![400,413,422].includes(error.status)).catch(()=>{});
    }
    console.warn('[report-email-bundles] Falló el paquete:',error.code||error.name);
   }
  }
  const workers=Math.min(groups.length,Math.max(1,Math.min(4,Math.floor(Number(concurrency))||2)));
  await Promise.all(Array.from({length:workers},async()=>{while(cursor<groups.length)await processGroup(groups[cursor++]);}));
  return {due:Math.max(due.length,groups.reduce((sum,group)=>sum+group.length,0)),sent,emails,errors,deferred};
 };
}
module.exports={createScheduledBundleDelivery,bundleKey};
