'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {createClient} = require('@supabase/supabase-js');
const {connectDatabase} = require('../lib/database-connection');
const {CACHE_DIR} = require('../lib/config');
const {nextReportRefreshAt,nextMarketReportRefreshAt} = require('../lib/report-schedule');
const {reportDeadline} = require('../lib/report-deadline');

function createExecutiveReportStore({table, keys, file=path.join(CACHE_DIR,table+'.json'), clientFactory=createClient, connect=connectDatabase, timeoutMs=4000, writeTimeoutMs=timeoutMs}={}) {
    if(!['finance_executive_reports','market_executive_reports'].includes(table)) throw Error('Colección de informes inválida.');
    let memory=null, client=null, loading=null, writing=Promise.resolve();
    const valid=value=>value && Number.isFinite(Date.parse(value.generatedAt)) && Array.isArray(value.reports) && value.reports.length>0
        && new Set(value.reports.map(report=>report?.key)).size===value.reports.length
        && value.reports.every(report=>keys.includes(report?.key) && typeof report.title==='string' && report.title.trim() && (Array.isArray(report.sections) || typeof report.content==='string'));
    const ordered=reports=>[...reports].sort((a,b)=>keys.indexOf(a.key)-keys.indexOf(b.key));
    const requestWithSignal=(request,signal)=>typeof request.abortSignal==='function' ? request.abortSignal(signal) : request;
    function serviceClient() {
        const url=process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
        if(!url || !key) return null;
        if(!client) client=clientFactory(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
        return client;
    }
    async function diskSave(snapshot) {
        const temporary=file+'.'+crypto.randomUUID()+'.tmp';
        try {
            await fs.mkdir(path.dirname(file),{recursive:true});
            await fs.writeFile(temporary,JSON.stringify({...snapshot,schemaVersion:1}),{flag:'wx',mode:0o600});
            if(memory && memory!==snapshot) return false;
            await fs.rename(temporary,file);
            return true;
        } catch {console.warn(`[${table}] No se confirmó el respaldo local del corte.`);return false;}
        finally {await fs.unlink(temporary).catch(()=>{});}
    }
    async function databaseRead(signal) {
        const db=await connect();if(!db) return null;
        try {signal.throwIfAborted();return (await db.query(`SELECT report, generated_at FROM ${table} ORDER BY generated_at DESC`)).rows;}
        finally {await db.end().catch(()=>{});}
    }
    async function read() {
        if(memory) return memory;
        try {
            if((await fs.stat(file)).size<=12*1024*1024) {
                const value=JSON.parse(await fs.readFile(file,'utf8'));
                if(value.schemaVersion===1 && valid(value)) {if(!memory || Date.parse(value.generatedAt)>Date.parse(memory.generatedAt))memory={...value,persistence:'disk'};return memory;}
            }
        } catch { /* Un caché ausente o incompleto no sustituye el almacén remoto. */ }
        for(const [persistence,readRows] of [
            ['supabase-service-role',async signal=>{const service=serviceClient();if(!service) return null;const {data,error}=await requestWithSignal(service.from(table).select('report, generated_at').order('generated_at',{ascending:false}),signal);signal.throwIfAborted();if(error) throw error;return data;}],
            ['supabase-postgres',databaseRead],
        ]) {
            try {
                const rows=await reportDeadline(readRows,timeoutMs);
                const snapshot=rows?.length ? {reports:ordered(rows.map(row=>row.report)),generatedAt:rows[0].generated_at,persistence} : null;
                if(valid(snapshot)) {if(!memory || Date.parse(snapshot.generatedAt)>=Date.parse(memory.generatedAt)) memory=snapshot;await diskSave(memory);return memory;}
            } catch {console.warn(`[${table}] Lectura ${persistence} no disponible; se conserva el último corte.`);}
        }
        return memory;
    }
    function load() {
        if(memory) return Promise.resolve(memory);
        if(!loading) loading=read().finally(()=>{loading=null;});
        return loading;
    }
    async function save(reports,generatedAt) {
        const snapshot={reports:ordered(reports),generatedAt,persistence:'memory'};
        if(!valid(snapshot)) throw Error('El corte de informes está incompleto.');
        // No publicar un corte antiguo que terminó de generarse después de otro.
        if(memory && Date.parse(memory.generatedAt)>Date.parse(generatedAt)) return memory;
        memory=snapshot;
        // Publicar en memoria es inmediato; persistir respeta el orden de los
        // cortes y descarta los que fueron sustituidos mientras esperaban.
        const saved=writing.then(()=>persist(snapshot));
        writing=saved.catch(()=>{});
        return saved;
    }
    async function persist(snapshot) {
        if(memory!==snapshot)return memory;
        const {reports,generatedAt}=snapshot;
        if(process.env.NODE_ENV!=='test' && path.resolve(file)===path.resolve(CACHE_DIR,table+'.json'))await require('./report-history-store').reportHistory.archive(reports,table==='finance_executive_reports'?'finance':'markets').catch(()=>console.warn('[report-history] No se confirmó el archivo del corte.'));
        if(await diskSave(snapshot)) snapshot.persistence='disk';
        if(memory!==snapshot)return memory;
        const nextRefresh=table==='market_executive_reports' ? nextMarketReportRefreshAt : nextReportRefreshAt;
        const rows=reports.map(report=>({report_key:report.key,title:report.title,report,source_snapshot:report.sourceSnapshot || {},generated_at:generatedAt,next_refresh_at:nextRefresh(generatedAt).toISOString()}));
        try {
            const service=serviceClient();
            if(service) {
                // Un solo upsert publica el corte completo en una transacción
                // de PostgREST; no deja filas de una generación a medias.
                await reportDeadline(async signal=>{signal.throwIfAborted();const {error}=await requestWithSignal(service.from(table).upsert(rows,{onConflict:'report_key'}),signal);signal.throwIfAborted();if(error)throw error;},writeTimeoutMs);
                snapshot.persistence='supabase-service-role';return memory;
            }
        } catch {console.warn(`[${table}] Escritura REST no disponible; corte conservado localmente.`);}
        if(memory!==snapshot)return memory;
        try {
            const written=await reportDeadline(async signal=>{
                const db=await connect();if(!db) return false;
                try {
                    signal.throwIfAborted();
                    await db.query('BEGIN');
                    for(const row of rows) {
                        signal.throwIfAborted();
                        await db.query(`INSERT INTO ${table} (report_key,title,report,source_snapshot,generated_at,next_refresh_at)
                        VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6) ON CONFLICT (report_key) DO UPDATE SET
                        title=EXCLUDED.title,report=EXCLUDED.report,source_snapshot=EXCLUDED.source_snapshot,
                        generated_at=EXCLUDED.generated_at,next_refresh_at=EXCLUDED.next_refresh_at,updated_at=NOW()
                        WHERE ${table}.generated_at<=EXCLUDED.generated_at`,
                        [row.report_key,row.title,JSON.stringify(row.report),JSON.stringify(row.source_snapshot),row.generated_at,row.next_refresh_at]);
                    }
                    signal.throwIfAborted();
                    await db.query('COMMIT');
                    return true;
                } catch(error) {
                    await db.query('ROLLBACK').catch(()=>{});
                    throw error;
                } finally {await db.end().catch(()=>{});}
            },writeTimeoutMs);
            if(written) snapshot.persistence='supabase-postgres';
        } catch {console.warn(`[${table}] Escritura PostgreSQL no disponible; corte conservado localmente.`);}
        return memory;
    }
    return {load,save};
}
module.exports={createExecutiveReportStore};
