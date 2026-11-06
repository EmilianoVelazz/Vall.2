'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createScheduleStore}=require('../backend/services/report-email-schedule-store');
const {createScheduledReportDelivery}=require('../backend/services/report-scheduled-delivery');
const {latestReportCutAt}=require('../backend/lib/report-schedule');
async function main() {
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-mail-reliability-'));
    try {
        let now=new Date('2026-10-15T13:59:00Z');
        const file=path.join(directory,'schedules.json');
        const options={file,localOnly:true,clock:()=>now};
        const store=createScheduleStore(options),other=createScheduleStore(options);
        const input={ownerEmail:'owner@example.invalid',area:'finance',reportKey:'overview',recipientEmail:'recipient@example.invalid',preferences:{customTitle:'Prueba privada'},delivery:{frequency:'daily',time:'08:00'}};
        await store.upsert(input);
        assert.equal((await store.list(input.ownerEmail))[0].nextRunAt,'2026-10-15T14:00:00.000Z');
        assert.equal((await store.list('another@example.invalid')).length,0);
        now=new Date('2026-10-15T14:00:01Z');
        let deliveries=0;
        const deps={collections:{finance:{reportKeys:['overview'],label:'Finanzas'}},loadSnapshot:async()=>({generatedAt:latestReportCutAt(now).toISOString(),reports:[{key:'overview',title:'Prueba',generatedAt:latestReportCutAt(now).toISOString(),sections:[]}]}),personalize:report=>report,prepare:report=>report,deliver:async()=>{deliveries++;await new Promise(resolve=>setTimeout(resolve,20));},now:()=>now.getTime()};
        const results=await Promise.all([createScheduledReportDelivery({...deps,store})(),createScheduledReportDelivery({...deps,store:other})()]);
        assert.equal(deliveries,1,'Dos instancias reclaman una sola entrega');
        assert.equal(results.reduce((sum,item)=>sum+item.sent,0),1);
        let row=(await other.list(input.ownerEmail))[0];
        assert(row.lastSentAt);assert.equal(row.nextRunAt,'2026-10-16T14:00:00.000Z');
        assert.equal(row.preferences.customTitle,'Prueba privada');
        await store.upsert({...input,delivery:{frequency:'daily',time:'09:00'}});
        assert.equal((await store.list(input.ownerEmail))[0].delivery.time,'09:00','Editar una programación cambia la hora guardada');
        now=new Date('2026-10-15T15:00:01Z');
        const failing=()=>createScheduledReportDelivery({...deps,store,deliver:async()=>{throw Error('Conexión SMTP temporalmente no disponible');}})();
        for(const delay of [5,15,30]) {
            await failing();row=(await store.list(input.ownerEmail))[0];
            assert.equal(Date.parse(row.nextRunAt)-now.getTime(),delay*60_000);
            now=new Date(Date.parse(row.nextRunAt)+1000);
        }
        await failing();row=(await store.list(input.ownerEmail))[0];
        assert.equal(row.nextRunAt,'2026-10-16T15:00:00.000Z','Tras tres reintentos se conserva el siguiente periodo');
        assert.equal(row.preferences._deliveryRetries,0);
        now=new Date(Date.parse(row.nextRunAt)+1000);
        await createScheduledReportDelivery({...deps,store})();row=(await store.list(input.ownerEmail))[0];
        assert.equal(row.lastError,'','Una entrega correcta limpia el error anterior');
        assert(row.lastSentAt);assert.equal(row.preferences._deliveryRetries,0);
        await store.upsert(input);now=new Date(Date.parse((await store.list(input.ownerEmail))[0].nextRunAt)+1000);
        const pending=(await store.due())[0];assert(await store.claim(pending));
        await store.upsert({...input,preferences:{customTitle:'Nueva edición'},delivery:{frequency:'weekly',time:'17:00',weekday:1}});
        await store.record(pending.id,{sentAt:now.toISOString(),delivery:pending.delivery,preferences:pending.preferences,leaseUntil:pending.leaseUntil,leaseToken:pending.leaseToken});
        row=(await store.list(input.ownerEmail))[0];
        assert.equal(row.preferences.customTitle,'Nueva edición','Una ejecución anterior no sobrescribe una edición nueva');
        assert.equal(row.delivery.frequency,'weekly');
        await store.record(row.id,{error:'Destino no válido',retryable:false,delivery:row.delivery,preferences:row.preferences});
        row=(await store.list(input.ownerEmail))[0];assert.equal(row.preferences._deliveryRetries,0,'Un fallo permanente no anuncia un reintento temporal');
        const unavailable=createScheduleStore({file:path.join(directory,'cloud.json'),serverless:true,remote:()=>null,databaseConnect:async()=>{throw Error('offline');}});
        await assert.rejects(unavailable.upsert(input),error=>error.status===503);
        await assert.rejects(fs.access(path.join(directory,'cloud.json')),'El entorno serverless no finge guardar en /tmp');
        await fs.writeFile(file,'{corrupto');
        await assert.rejects(store.upsert(input),SyntaxError,'Un archivo dañado no se reemplaza con una lista vacía');
        assert.equal(await fs.readFile(file,'utf8'),'{corrupto');
        const cron=require('../vercel.json').crons.find(item=>item.path==='/api/report-email-schedules/run');
        assert.equal(cron.schedule,'0 15 * * *','El despliegue conserva su revisión diaria a las 09:00 CDMX; la prueba no reactiva envíos ni cambia el cron.');
        console.log('Correo programado: hora CDMX, destinatario, aislamiento, reinicio, edición, concurrencia entre instancias, 3 reintentos, recuperación, almacenamiento cloud y archivo dañado OK; cero mensajes reales.');
    } finally {assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
