'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createScheduleStore,nextRunAt}=require('../backend/services/report-email-schedule-store');
const {startReportEmailWorker}=require('../backend/lib/report-email-worker');
const {latestReportCutAt}=require('../backend/lib/report-schedule');
const {createScheduledReportDelivery}=require('../backend/services/report-scheduled-delivery');
async function main() {
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-schedule-edge-'));
    try {
        let time=new Date('2026-10-15T21:00:00Z');
        const file=path.join(directory,'schedules.json'),store=createScheduleStore({file,localOnly:true,clock:()=>time});
        const input={ownerEmail:'owner@example.invalid',area:'finance',reportKey:'overview',preferences:{},delivery:{frequency:'daily',time:'12:00'}};
        await store.upsert(input);
        let rows=JSON.parse(await fs.readFile(file,'utf8'));rows[0].nextRunAt='2026-10-16T12:00:00.000Z';await fs.writeFile(file,JSON.stringify(rows));
        const dry=await store.reconcileCalendarTimes();assert.equal(dry.corrected.length,1);assert.equal(dry.corrected[0].to,'2026-10-16T18:00:00.000Z');
        assert.equal((await store.list(input.ownerEmail))[0].nextRunAt,'2026-10-16T12:00:00.000Z','El diagnóstico no cambia datos');
        await store.reconcileCalendarTimes({dryRun:false});assert.equal((await store.list(input.ownerEmail))[0].nextRunAt,'2026-10-16T18:00:00.000Z');
        assert.equal((await store.reconcileCalendarTimes({dryRun:false})).corrected.length,0);
        for(const delivery of [{frequency:'monthly'},{time:'12:60'},{time:'25:00'},{weekday:9},{timeZone:'UTC'},null]) await assert.rejects(store.upsert({...input,delivery}),error=>error.status===400);
        time=new Date('2026-10-16T18:00:00Z');let row=(await store.due())[0];assert(await store.claim(row));
        assert(await store.isCurrent(row));assert.equal((await store.reconcileCalendarTimes({dryRun:false})).corrected.length,0,'La reserva de un envío no se confunde con una hora errónea');
        await store.remove(input.ownerEmail,input.area,input.reportKey);assert.equal(await store.isCurrent(row),false,'Una cancelación invalida la reserva antes del SMTP');
        await store.upsert(input);time=new Date(Date.parse((await store.list(input.ownerEmail))[0].nextRunAt));row=(await store.due())[0];assert(await store.claim(row));
        await store.record(row.id,{error:'offline',delivery:row.delivery,preferences:row.preferences,leaseUntil:row.leaseUntil,leaseToken:row.leaseToken});
        assert.equal((await store.reconcileCalendarTimes({dryRun:false})).corrected.length,0,'Un reintento de cinco minutos conserva su hora');
        const restarted=createScheduleStore({file,localOnly:true,clock:()=>time});assert.equal((await restarted.list(input.ownerEmail)).length,1);
        await restarted.upsert(input);time=new Date(Date.parse((await restarted.list(input.ownerEmail))[0].nextRunAt)+1000);
        const abandoned=(await restarted.due())[0];assert(await restarted.claim(abandoned));
        time=new Date(Date.parse(abandoned.leaseUntil)+1000);
        const recovered=(await store.due())[0];assert(await store.claim(recovered));
        assert.equal(recovered.scheduledFor,abandoned.nextRunAt,'La recuperación conserva la hora solicitada original');
        assert.equal(await restarted.isCurrent(abandoned),false);assert(await store.isCurrent(recovered));
        // A new chosen time can equal the old lease expiry. Its timestamp
        // alone must never authorize the old worker to send or overwrite it.
        time=new Date('2026-10-17T18:49:00Z');await store.upsert(input);
        time=new Date('2026-10-18T18:50:00Z');const collision=(await store.due())[0];assert(await store.claim(collision));
        await store.upsert({...input,delivery:{frequency:'daily',time:'13:00'}});
        assert.equal((await store.list(input.ownerEmail))[0].nextRunAt,collision.leaseUntil);
        assert.equal(await store.isCurrent(collision),false);
        await store.record(collision.id,{sentAt:time.toISOString(),delivery:collision.delivery,preferences:collision.preferences,leaseUntil:collision.leaseUntil,leaseToken:collision.leaseToken});
        assert.equal((await store.list(input.ownerEmail))[0].delivery.time,'13:00');
        // Midnight, weekends, year boundary and CDMX calendar, not host time.
        assert.equal(nextRunAt({frequency:'daily',time:'00:00'},new Date('2026-12-31T23:00:00Z')).toISOString(),'2027-01-01T06:00:00.000Z');
        assert.equal(latestReportCutAt('2026-10-15T11:59:59Z').toISOString(),'2026-10-14T20:00:00.000Z');
        assert.equal(latestReportCutAt('2026-10-15T12:00:00Z').toISOString(),'2026-10-15T12:00:00.000Z');
        assert.equal(latestReportCutAt('2026-10-15T20:00:00Z').toISOString(),'2026-10-15T20:00:00.000Z');
        let timer,stopped=false,ticks=0,clock=Date.parse('2026-10-15T17:59:37.250Z');
        const stop=startReportEmailWorker(()=>{ticks++;},{now:()=>clock,setTimer:(callback,delay)=>{timer={callback,delay};return timer;},clearTimer:()=>{stopped=true;}});
        await Promise.resolve();assert.equal(ticks,1,'Al iniciar se comprueban pendientes de inmediato');assert.equal(timer.delay,22750);
        clock=Date.parse('2026-10-15T18:00:00Z');timer.callback();await Promise.resolve();assert.equal(ticks,2);assert.equal(timer.delay,60000);
        clock+=5*60_000+13000;timer.callback();await Promise.resolve();assert.equal(timer.delay,47000,'Tras suspensión vuelve a alinear con el minuto');
        stop();assert(stopped);

        const records=[],sent=[];
        const schedule={id:'a',ownerEmail:'owner@example.invalid',area:'finance',reportKey:'overview',preferences:{},delivery:{frequency:'daily',time:'12:00'},nextRunAt:'2026-10-15T18:00:00Z'};
        const deps={store:{due:async()=>[schedule],claim:async()=>true,isCurrent:async()=>true,record:async(id,value)=>records.push({id,...value})},collections:{finance:{reportKeys:['overview'],label:'Finanzas'}},loadSnapshot:async()=>({generatedAt:'2026-10-15T12:00:05Z',reports:[{key:'overview',title:'Prueba',generatedAt:'2026-10-15T12:00:05Z',sections:[]}]}),personalize:report=>report,prepare:report=>report,deliver:async value=>{sent.push(value);return {messageId:'fixture'};},now:()=>Date.parse('2026-10-15T18:00:00Z')};
        await createScheduledReportDelivery({...deps,store:{...deps.store,isCurrent:async()=>false}})();assert.equal(sent.length,0);
        const cutSchedule={...schedule,delivery:{frequency:'twice_daily'},nextRunAt:'2026-10-15T20:00:00Z'};
        const stale=await createScheduledReportDelivery({...deps,store:{...deps.store,due:async()=>[cutSchedule]}})();assert.equal(stale.errors,1);assert.equal(sent.length,0,'El corte de 14:00 no envía la edición de 06:00 si todavía se está actualizando');
        const dailyAtCut=await createScheduledReportDelivery({...deps,store:{...deps.store,due:async()=>[{...cutSchedule,delivery:{frequency:'daily',time:'14:00'}}]}})();
        assert.equal(dailyAtCut.errors,1);assert.equal(sent.length,0,'La espera del corte también se aplica a una entrega diaria a las 14:00');
        let release,fastDelivered;
        const gate=new Promise(resolve=>{release=resolve;}),fast=new Promise(resolve=>{fastDelivered=resolve;});
        const slow={...schedule,id:'slow',preferences:{aiCustomization:{enabled:true,instructions:'Prueba'}}};
        const runner=createScheduledReportDelivery({...deps,store:{...deps.store,due:async()=>[slow,{...schedule,id:'fast'}]},generate:async()=>{await gate;return {title:'Lento',sections:[]};},deliver:async value=>{if(value.executive.title==='Prueba')fastDelivered();return {};}});
        const processing=runner();
        try {await Promise.race([fast,new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Una entrega lenta bloqueó la rápida')),1000);timer.unref();})]);}finally{release();}
        await processing;
        const before=records.length;
        const accepted=await createScheduledReportDelivery({...deps,store:{...deps.store,record:async()=>{throw Error('No se guardó el recibo');}}})();
        assert.equal(accepted.sent,1);assert.equal(accepted.errors,1);assert.equal(records.length,before,'Un correo aceptado no se convierte en un reintento de envío por error al registrar');
        const receipt=records.find(row=>row.preferences?._lastDelivery)?.preferences._lastDelivery;assert(receipt.startedAt&&receipt.acceptedAt&&receipt.scheduledFor);
        console.log('Programación: desfase UTC/CDMX reparable, medianoche, reinicios, minuto exacto, suspensión, reservas, cancelación, corte fresco, concurrencia acotada y aceptación sin reenvío inmediato OK; sin correos reales.');
    } finally {assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
