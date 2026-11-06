'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {normalizeScheduleSelection}=require('../backend/lib/report-schedule-selection');
const {createScheduleStore,nextRunAt}=require('../backend/services/report-email-schedule-store');
const {createScheduledReportDelivery}=require('../backend/services/report-scheduled-delivery');
const collections=require('../shared/report-collections.json');
const {atomicFileReplace}=require('../backend/lib/atomic-file-replace');
async function main() {
    let renameAttempts=0;const waits=[];
    await atomicFileReplace('temporary','current',{rename:async()=>{if(++renameAttempts<4)throw Object.assign(Error('locked'),{code:'EPERM'});},wait:async delay=>waits.push(delay)});
    assert.equal(renameAttempts,4);assert.deepEqual(waits,[25,50,100]);
    let permanentAttempts=0;
    await assert.rejects(atomicFileReplace('temporary','current',{rename:async()=>{permanentAttempts++;throw Object.assign(Error('disk'),{code:'ENOSPC'});},wait:async()=>{throw Error('No debe reintentar un disco lleno');}}),{code:'ENOSPC'});
    assert.equal(permanentAttempts,1);
    let exhausted=0;
    await assert.rejects(atomicFileReplace('temporary','current',{rename:async()=>{exhausted++;throw Object.assign(Error('locked'),{code:'EBUSY'});},wait:async()=>{}}),{code:'EBUSY'});
    assert.equal(exhausted,7,'Los reintentos por bloqueo son acotados');
    const selected=[{area:'finance',reportKey:'equities'},{area:'markets',reportKey:'grains'},{area:'mexico',reportKey:'mx_proteins'}];
    assert.equal(normalizeScheduleSelection(selected).length,3);
    for(const invalid of [[],null,[{area:'mine',reportKey:'private'}],[{area:'finance',reportKey:'grains'}],[selected[0],selected[0]],Array(25).fill(selected[0])]) assert.throws(()=>normalizeScheduleSelection(invalid),error=>error.status===400);
    assert.equal(nextRunAt({frequency:'daily',time:'17:23'},new Date('2026-10-15T23:22:59Z')).toISOString(),'2026-10-15T23:23:00.000Z');
    assert.equal(nextRunAt({frequency:'daily',time:'17:23'},new Date('2026-10-15T23:23:00Z')).toISOString(),'2026-10-16T23:23:00.000Z');
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-batch-schedules-'));
    try {
        let now=new Date('2026-10-15T23:22:00Z');
        const file=path.join(directory,'schedules.json'),store=createScheduleStore({file,localOnly:true,clock:()=>now});
        const input=selected.map(source=>({...source,ownerEmail:'owner@example.invalid',recipientEmail:'recipient@example.invalid',delivery:{frequency:'daily',time:'17:23'},preferences:{language:'es',aiCustomization:{enabled:false}}}));
        await store.upsert({...input[0],ownerEmail:'other@example.invalid',delivery:{frequency:'daily',time:'20:00'}});
        const saved=await store.upsertMany(input);assert.equal(saved.length,3);
        assert(saved.every(row=>row.nextRunAt==='2026-10-15T23:23:00.000Z'));
        assert.equal((await store.list('other@example.invalid')).length,1,'La selección no modifica otra cuenta');
        assert.equal((await store.reconcileCalendarTimes()).corrected.length,0,'Una hora con minutos no se repara como si fuera un error');
        const before=await fs.readFile(file,'utf8');
        await assert.rejects(store.upsertMany([...input.slice(0,2),{...input[2],delivery:{frequency:'daily',time:'17:99'}}]),error=>error.status===400);
        assert.equal(await fs.readFile(file,'utf8'),before,'Un elemento inválido no guarda parcialmente la selección');
        await assert.rejects(store.upsertMany([input[0],input[0]]),error=>error.status===400);
        await assert.rejects(store.upsertMany([input[0],{...input[1],ownerEmail:'other@example.invalid'}]),error=>error.status===400);
        const restarted=createScheduleStore({file,localOnly:true,clock:()=>now});
        assert.equal((await restarted.list('owner@example.invalid')).length,3);
        now=new Date('2026-10-15T23:22:59Z');assert.equal((await restarted.due()).length,0);
        now=new Date('2026-10-15T23:23:00Z');
        const sent=[];
        const runner=createScheduledReportDelivery({store:restarted,collections,now:()=>now.getTime(),
            loadSnapshot:async area=>({generatedAt:'2026-10-15T20:00:10Z',reports:input.filter(row=>row.area===area).map(row=>({key:row.reportKey,title:row.area,sections:[]}))}),
            generate:async()=>{throw Error('Un informe estándar no debe llamar a la IA');},personalize:report=>report,prepare:report=>report,
            deliver:async request=>{sent.push(request);return {messageId:'test-only'};}});
        const result=await runner();assert.equal(result.sent,3);assert.equal(result.errors,0);assert.equal(sent.length,3);
        assert(sent.every(row=>row.recipient==='recipient@example.invalid'));assert.equal((await runner()).sent,0,'No repite envíos ya aceptados');
        for(const row of await restarted.list('owner@example.invalid')) assert.equal(row.preferences._lastDelivery.scheduledFor,'2026-10-15T23:23:00.000Z');
        let sqlCalls=0,released=false;
        const sqlStore=createScheduleStore({serverless:true,remote:()=>null,clock:()=>now,databaseConnect:async()=>({query:async(sql,parameters)=>{
            sqlCalls++;assert(sql.includes('ON CONFLICT'));assert.equal(parameters.length,24);assert(!sql.includes('recipient@example.invalid'));
            return {rows:input.map((row,index)=>({id:'sql-'+index,owner_email:row.ownerEmail,area:row.area,report_key:row.reportKey,preferences:row.preferences,next_run_at:now.toISOString()}))};
        },end:async()=>{released=true;}})});
        assert.equal((await sqlStore.upsertMany(input)).length,3);assert.equal(sqlCalls,1);assert(released);
        let restCalls=0;
        const restStore=createScheduleStore({serverless:true,clock:()=>now,remote:()=>({from:table=>{
            assert.equal(table,'report_email_schedules');return {upsert:(rows,options)=>{
                restCalls++;assert.equal(rows.length,3);assert.equal(options.onConflict,'owner_email,area,report_key');
                assert(rows.every(row=>row.owner_email==='owner@example.invalid'));
                return {select:async()=>({data:rows,error:null})};
            }};
        }}),databaseConnect:async()=>{throw Error('No debe usar SQL cuando REST confirmó el lote');}});
        const viaRest=await restStore.upsertMany(input);assert.equal(viaRest.length,3);assert.equal(restCalls,1);
        assert(viaRest.every(row=>row.delivery.time==='17:23'));
        console.log('Report selection: categorías, guardado atómico, aislamiento, minutos CDMX, reinicio y tres envíos simulados sin IA ni duplicados OK');
    } finally {assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
