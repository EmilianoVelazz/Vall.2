'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { connectDatabase } = require('../lib/database-connection');
const { CACHE_DIR } = require('../lib/config');
const { normalizeRecipient } = require('../lib/report-email-recipient');
const { REPORT_HOURS, REPORT_TIME_ZONE } = require('../lib/report-schedule');
const {atomicFileReplace}=require('../lib/atomic-file-replace');

dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const FILE = path.join(CACHE_DIR, 'report-email-schedules.json');
const TABLE = 'report_email_schedules';
const INTERVAL_MS = 12 * 60 * 60 * 1000;
const DELIVERY_FREQUENCIES = new Set(['twice_daily', 'daily', 'weekdays', 'weekly']);
let supabase;
let warned = false;
let restDisabledUntil = 0;

function client() {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    if (!supabase) supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url,options={}) => fetch(url,{...options,signal:AbortSignal.any([AbortSignal.timeout(5000),...(options.signal ? [options.signal] : [])])}) } });
    return supabase;
}



function idFor(owner, area, reportKey) {
    return crypto.createHash('sha256').update(`${owner}|${area}|${reportKey}`).digest('hex').slice(0, 32);
}

function normalizeDelivery(input = {}) {
    const frequency = DELIVERY_FREQUENCIES.has(input?.frequency) ? input.frequency : 'twice_daily';
    const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(input?.time || '')) ? String(input.time) : '08:00';
    const weekday = Number.isInteger(Number(input?.weekday)) && Number(input.weekday) >= 0 && Number(input.weekday) <= 6
        ? Number(input.weekday)
        : 1;
    return { frequency, time, weekday, timeZone: REPORT_TIME_ZONE };
}

function validateDelivery(input) {
    if(input===undefined) return;
    if(!input || typeof input!=='object' || Array.isArray(input)
        || input.frequency!==undefined&&!DELIVERY_FREQUENCIES.has(input.frequency)
        || input.time!==undefined&&(typeof input.time!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.time))
        || input.weekday!==undefined&&(!Number.isInteger(Number(input.weekday))||Number(input.weekday)<0||Number(input.weekday)>6)
        || input.timeZone!==undefined&&input.timeZone!==REPORT_TIME_ZONE) {
        throw Object.assign(Error('La programación debe indicar una frecuencia válida, una hora válida y la zona de Ciudad de México.'),{status:400});
    }
}

function intervalHoursFor(delivery) {
    if (delivery.frequency === 'weekly') return 168;
    if (delivery.frequency === 'twice_daily') return 12;
    return 24;
}

function localParts(date, timeZone = REPORT_TIME_ZONE) {
    const values = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    return values;
}

// Convierte una fecha/hora del huso elegido a UTC sin suponer una diferencia
// fija. Así la preferencia sigue siendo correcta aunque el usuario cambie de
// zona en el futuro o la regla local de horario se actualice.
function zonedDate({ year, month, day, hour, minute }, timeZone = REPORT_TIME_ZONE) {
    let timestamp = Date.UTC(year, month - 1, day, hour, minute);
    for (let index = 0; index < 2; index += 1) {
        const seen = localParts(new Date(timestamp), timeZone);
        const wanted = Date.UTC(year, month - 1, day, hour, minute);
        const actual = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
        timestamp += wanted - actual;
    }
    return new Date(timestamp);
}

function addLocalDays(parts, days) {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: date.getUTCDay() };
}

function nextRunAt(input, now = new Date()) {
    const delivery = normalizeDelivery(input);
    const current = localParts(now, delivery.timeZone);
    const [hour, minute] = delivery.time.split(':').map(Number);

    for (let offset = 0; offset < 15; offset += 1) {
        const day = addLocalDays(current, offset);
        if (delivery.frequency === 'weekdays' && (day.weekday === 0 || day.weekday === 6)) continue;
        if (delivery.frequency === 'weekly' && day.weekday !== delivery.weekday) continue;
        const hours = delivery.frequency === 'twice_daily' ? REPORT_HOURS : [hour];
        for (const candidateHour of hours) {
            const candidate = zonedDate({ ...day, hour: candidateHour, minute: delivery.frequency === 'twice_daily' ? 0 : minute }, delivery.timeZone);
            if (candidate.getTime() > now.getTime()) return candidate;
        }
    }
    // El ciclo nunca debería llegar aquí, pero evita dejar una programación sin
    // próxima ejecución si el calendario local cambiara de forma inesperada.
    return new Date(now.getTime() + INTERVAL_MS);
}

function normalize(row) {
    const preferences = row.preferences || {};
    const delivery = normalizeDelivery(preferences.delivery || row.delivery);
    return {
        id: row.id, ownerEmail: row.owner_email || row.ownerEmail, area: row.area, reportKey: row.report_key || row.reportKey,
        preferences, delivery, active: row.active !== false, intervalHours: Number(row.interval_hours || row.intervalHours || intervalHoursFor(delivery)),
        recipientEmail: preferences.emailRecipient || row.owner_email || row.ownerEmail,
        nextRunAt: row.next_run_at || row.nextRunAt, lastSentAt: row.last_sent_at || row.lastSentAt || null,
        lastError: row.last_error ?? row.lastError ?? '', createdAt: row.created_at || row.createdAt, updatedAt: row.updated_at || row.updatedAt,
    };
}

function createScheduleStore({ file=FILE, clock=()=>new Date(), remote=client, databaseConnect=connectDatabase, serverless=!!process.env.VERCEL, localOnly=false }={}) {
let localMode=localOnly;
let remoteSelected=false;
let mutation=Promise.resolve();
async function localRows() {
    try {
        const rows=JSON.parse(await fs.readFile(file, 'utf8'));
        if(!Array.isArray(rows)) throw Error('Formato de programaciones inválido.');
        return rows.map(normalize);
    } catch(error) { if(error.code==='ENOENT') return []; throw error; }
}
async function saveLocal(rows) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    try {
        const handle=await fs.open(temp,'wx',0o600);
        try {await handle.writeFile(JSON.stringify(rows,null,2));await handle.sync();}finally{await handle.close();}
        await atomicFileReplace(temp,file);
    } finally {await fs.unlink(temp).catch(()=>{});}
}
function serialize(operation) {
    const locked=async()=>{
        await fs.mkdir(path.dirname(file),{recursive:true});
        const lockPath=file+'.lock',until=Date.now()+2500;
        let handle;
        while(!handle) {
            try {handle=await fs.open(lockPath,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid}));}
            catch(error) {
                if(error.code!=='EEXIST') throw error;
                try {const info=JSON.parse(await fs.readFile(lockPath,'utf8'));try{process.kill(info.pid,0);}catch(dead){if(dead.code==='ESRCH') {await fs.unlink(lockPath);continue;}}} catch(readError) {if(readError.code==='ENOENT') continue;}
                if(Date.now()>=until) throw Object.assign(Error('Almacén de programaciones ocupado; reintenta.'),{status:503});
                await new Promise(resolve=>setTimeout(resolve,25));
            }
        }
        try {return await operation();} finally {await handle.close();await fs.unlink(lockPath);}
    };
    const result=mutation.then(locked,locked);
    mutation=result.catch(()=>{});
    return result;
}

async function withPersistence(operation, databaseOperation, fallback) {
    // Keep one storage source per running instance. Existing local schedules
    // remain local; a transient database recovery must not hide them.
    if(!serverless && !localMode && !remoteSelected) {
        try { await fs.access(file); localMode=true; } catch(error) { if(error.code!=='ENOENT') throw error; }
    }
    if(localMode && !serverless) return serialize(fallback);
    const connection = remote();
    if (connection && Date.now() >= restDisabledUntil) {
        try { const result=await operation(connection); remoteSelected=true; return result; } catch (error) {
            restDisabledUntil = Date.now() + 5 * 60 * 1000;
            if (!warned) { console.warn('[report-email-schedules] Supabase REST no disponible; usando PostgreSQL de respaldo:', error.message); warned = true; }
        }
    }
    let database;
    try {
        database = await databaseConnect();
        if (database) {const result=await databaseOperation(database);remoteSelected=true;return result;}
    } catch (error) {
        if (!warned) { console.warn('[report-email-schedules] PostgreSQL no disponible:', error.code || 'DB_UNAVAILABLE'); warned = true; }
    } finally { await database?.end().catch(() => {}); }
    if(serverless || remoteSelected) throw Object.assign(Error('No se pudo acceder al almacenamiento de las programaciones. Reintenta cuando se restablezca la base de datos.'),{status:503,code:'REPORT_SCHEDULE_STORAGE_UNAVAILABLE'});
    localMode=true;
    return serialize(fallback);
}

async function upsert({ ownerEmail, area, reportKey, preferences, delivery, recipientEmail }) {
    validateDelivery(delivery);
    const now = clock();
    const normalizedDelivery = normalizeDelivery(delivery);
    const schedulePreferences = { ...(preferences || {}), _deliveryRetries:0,delivery: normalizedDelivery, emailRecipient: normalizeRecipient(recipientEmail,ownerEmail) };
    const row = {
        id: idFor(ownerEmail, area, reportKey), owner_email: ownerEmail, area, report_key: reportKey, preferences: schedulePreferences,
        active: true, interval_hours: intervalHoursFor(normalizedDelivery), next_run_at: nextRunAt(normalizedDelivery, now).toISOString(),
        last_error: '', updated_at: now.toISOString(),
    };
    return withPersistence(async connection => {
        const { data, error } = await connection.from(TABLE).upsert(row, { onConflict: 'owner_email,area,report_key' }).select().single();
        if (error) throw error;
        return normalize(data);
    }, async database => {
        const result = await database.query(`INSERT INTO report_email_schedules
            (id, owner_email, area, report_key, preferences, active, interval_hours, next_run_at, last_error, updated_at)
            VALUES ($1,$2,$3,$4,$5::jsonb,TRUE,$6,$7,'',$8)
            ON CONFLICT (owner_email,area,report_key) DO UPDATE SET preferences=EXCLUDED.preferences, active=TRUE,
              interval_hours=EXCLUDED.interval_hours, next_run_at=EXCLUDED.next_run_at, last_error='', updated_at=EXCLUDED.updated_at
            RETURNING *`, [row.id, ownerEmail, area, reportKey, JSON.stringify(schedulePreferences), row.interval_hours, row.next_run_at, row.updated_at]);
        return normalize(result.rows[0]);
    }, async () => {
        const rows = await localRows();
        const prior = rows.find(item => item.id === row.id);
        const normalized = normalize({ ...prior, ...row, created_at: prior?.createdAt || now.toISOString() });
        await saveLocal([...rows.filter(item => item.id !== row.id), normalized]);
        return normalized;
    });
}

async function upsertMany(inputs) {
    if(!Array.isArray(inputs)||!inputs.length||inputs.length>24) throw Object.assign(Error('Selecciona entre 1 y 24 informes.'),{status:400});
    const identities=new Set(inputs.map(row=>`${row.area}:${row.reportKey}`));
    if(identities.size!==inputs.length||inputs.some(row=>row.ownerEmail!==inputs[0].ownerEmail)) throw Object.assign(Error('La selección contiene informes duplicados o cuentas distintas.'),{status:400});
    const now=clock();
    const rows=inputs.map(({ownerEmail,area,reportKey,preferences,delivery,recipientEmail})=>{
        validateDelivery(delivery);
        const normalizedDelivery=normalizeDelivery(delivery);
        return {id:idFor(ownerEmail,area,reportKey),owner_email:ownerEmail,area,report_key:reportKey,
            preferences:{...(preferences||{}),_deliveryRetries:0,delivery:normalizedDelivery,emailRecipient:normalizeRecipient(recipientEmail,ownerEmail)},
            active:true,interval_hours:intervalHoursFor(normalizedDelivery),next_run_at:nextRunAt(normalizedDelivery,now).toISOString(),last_error:'',updated_at:now.toISOString()};
    });
    return withPersistence(async connection=>{
        const {data,error}=await connection.from(TABLE).upsert(rows,{onConflict:'owner_email,area,report_key'}).select();
        if(error) throw error;
        if(!Array.isArray(data)||data.length!==rows.length) throw Error('No se confirmó la selección completa. Consulta tus programaciones antes de reintentar.');
        return data.map(normalize);
    },async database=>{
        const values=[];
        const placeholders=rows.map(row=>{
            const offset=values.length;
            values.push(row.id,row.owner_email,row.area,row.report_key,JSON.stringify(row.preferences),row.interval_hours,row.next_run_at,row.updated_at);
            const p=index=>'$'+(offset+index);
            return `(${p(1)},${p(2)},${p(3)},${p(4)},${p(5)}::jsonb,TRUE,${p(6)},${p(7)},'',${p(8)})`;
        });
        const {rows:saved}=await database.query(`INSERT INTO report_email_schedules
            (id,owner_email,area,report_key,preferences,active,interval_hours,next_run_at,last_error,updated_at)
            VALUES ${placeholders.join(',')} ON CONFLICT (owner_email,area,report_key) DO UPDATE SET
            preferences=EXCLUDED.preferences,active=TRUE,interval_hours=EXCLUDED.interval_hours,next_run_at=EXCLUDED.next_run_at,last_error='',updated_at=EXCLUDED.updated_at RETURNING *`,values);
        return saved.map(normalize);
    },async()=>{
        const current=await localRows(),ids=new Set(rows.map(row=>row.id));
        const saved=rows.map(row=>normalize({...current.find(prior=>prior.id===row.id),...row,created_at:current.find(prior=>prior.id===row.id)?.createdAt||now.toISOString()}));
        await saveLocal([...current.filter(row=>!ids.has(row.id)),...saved]);
        return saved;
    });
}

async function list(ownerEmail) {
    return withPersistence(async connection => {
        const { data, error } = await connection.from(TABLE).select('*').eq('owner_email', ownerEmail).eq('active', true).order('next_run_at');
        if (error) throw error;
        return (data || []).map(normalize);
    }, async database => {
        const result = await database.query('SELECT * FROM report_email_schedules WHERE owner_email=$1 AND active=TRUE ORDER BY next_run_at', [ownerEmail]);
        return result.rows.map(normalize);
    }, async () => (await localRows()).filter(item => item.ownerEmail === ownerEmail && item.active));
}

async function remove(ownerEmail, area, reportKey) {
    return withPersistence(async connection => {
        const { error } = await connection.from(TABLE).delete().eq('owner_email', ownerEmail).eq('area', area).eq('report_key', reportKey);
        if (error) throw error;
        return true;
    }, async database => {
        await database.query('DELETE FROM report_email_schedules WHERE owner_email=$1 AND area=$2 AND report_key=$3', [ownerEmail, area, reportKey]);
        return true;
    }, async () => {
        const rows = await localRows();
        await saveLocal(rows.filter(item => !(item.ownerEmail === ownerEmail && item.area === area && item.reportKey === reportKey)));
        return true;
    });
}

async function due(now = clock()) {
    const iso = now.toISOString();
    return withPersistence(async connection => {
        const { data, error } = await connection.from(TABLE).select('*').eq('active', true).lte('next_run_at', iso).order('next_run_at').limit(50);
        if (error) throw error;
        return (data || []).map(normalize);
    }, async database => {
        const result = await database.query('SELECT * FROM report_email_schedules WHERE active=TRUE AND next_run_at <= $1 ORDER BY next_run_at LIMIT 50', [iso]);
        return result.rows.map(normalize);
    }, async () => (await localRows()).filter(item => item.active && Date.parse(item.nextRunAt) <= now.getTime()).sort((a,b)=>Date.parse(a.nextRunAt)-Date.parse(b.nextRunAt)).slice(0, 50));
}

async function claim(schedule) {
    const now=clock(), lease=new Date(now.getTime()+10*60_000).toISOString();
    if(!Number.isFinite(Date.parse(schedule.nextRunAt)) || Date.parse(schedule.nextRunAt)>now.getTime()) return false;
    const token=crypto.randomUUID();
    const original=schedule.preferences?._deliveryRunAt || schedule.preferences?._deliveryLease?.scheduledFor || schedule.nextRunAt;
    const scheduledFor=Number.isFinite(Date.parse(original)) ? original : schedule.nextRunAt;
    const preferences={...schedule.preferences,_deliveryRunAt:scheduledFor,_deliveryLease:{until:lease,scheduledFor,token}};
    const claimed=await withPersistence(async connection=>{
        const {data,error}=await connection.from(TABLE).update({next_run_at:lease,preferences}).eq('id',schedule.id).eq('active',true).eq('next_run_at',schedule.nextRunAt).select('id');
        if(error) throw error;
        return !!data?.length;
    },async database=>{
        const result=await database.query('UPDATE report_email_schedules SET next_run_at=$3,preferences=$4::jsonb WHERE id=$1 AND active=TRUE AND next_run_at=$2 RETURNING id',[schedule.id,schedule.nextRunAt,lease,JSON.stringify(preferences)]);
        return !!result.rows.length;
    },async()=>{
        const rows=await localRows(), current=rows.find(item=>item.id===schedule.id && item.active && item.nextRunAt===schedule.nextRunAt);
        if(!current) return false;
        await saveLocal(rows.map(item=>item.id===current.id ? {...item,nextRunAt:lease,preferences} : item));
        return true;
    });
    if(claimed) {schedule.leaseUntil=lease;schedule.leaseToken=token;schedule.scheduledFor=scheduledFor;schedule.preferences={...schedule.preferences,_deliveryRunAt:scheduledFor};}
    return claimed;
}

async function isCurrent(schedule) {
    if(!schedule.leaseUntil || !schedule.leaseToken || Date.parse(schedule.leaseUntil)<=clock().getTime()) return false;
    return withPersistence(async connection=>{
        const {data,error}=await connection.from(TABLE).select('id').eq('id',schedule.id).eq('active',true).eq('next_run_at',schedule.leaseUntil).eq('preferences->_deliveryLease->>token',schedule.leaseToken).limit(1);
        if(error) throw error;
        return !!data?.length;
    },async database=>!!(await database.query("SELECT id FROM report_email_schedules WHERE id=$1 AND active=TRUE AND next_run_at=$2 AND preferences->'_deliveryLease'->>'token'=$3",[schedule.id,schedule.leaseUntil,schedule.leaseToken])).rows.length,
    async()=>(await localRows()).some(row=>row.id===schedule.id&&row.active&&row.nextRunAt===schedule.leaseUntil&&row.preferences?._deliveryLease?.token===schedule.leaseToken));
}

async function reconcileCalendarTimes({dryRun=true}={}) {
    const corrected=[],now=clock();
    function correction(row) {
        const stamp=Date.parse(row.nextRunAt);
        // Retries and active/recoverable leases intentionally differ from the
        // chosen wall-clock time. Never turn those into a different daily run.
        if(!row.active || !Number.isFinite(stamp) || stamp<=now.getTime()
            || Number(row.preferences?._deliveryRetries)>0 || row.preferences?._deliveryLease?.until===row.nextRunAt) return null;
        const date=localParts(new Date(stamp)),delivery=row.delivery;
        const weekday=addLocalDays(date,0).weekday;
        const hours=delivery.frequency==='twice_daily' ? REPORT_HOURS : [Number(delivery.time.slice(0,2))];
        const validDay=delivery.frequency==='weekly' ? weekday===delivery.weekday : delivery.frequency!=='weekdays'||weekday>0&&weekday<6;
        const minute=delivery.frequency==='twice_daily'?0:Number(delivery.time.slice(3));
        if(validDay&&hours.includes(date.hour)&&date.minute===minute&&stamp%60000===0) return null;
        const midnight=zonedDate({...date,hour:0,minute:0});
        return nextRunAt(delivery,new Date(midnight.getTime()-1)).toISOString();
    }
    async function inspect(rows,write) {
        for(const row of rows.map(normalize)) {
            const fixed=correction(row);if(!fixed || fixed===row.nextRunAt) continue;
            if(!dryRun && !(await write(row,fixed))) continue;
            corrected.push({area:row.area,reportKey:row.reportKey,from:row.nextRunAt,to:fixed,time:row.delivery.time,timeZone:REPORT_TIME_ZONE});
        }
        return {checked:rows.length,dryRun,corrected};
    }
    return withPersistence(async connection=>{
        const {data,error}=await connection.from(TABLE).select('*').eq('active',true).order('next_run_at').limit(200);
        if(error) throw error;
        return inspect(data || [],async(row,fixed)=>{
            const {data,error}=await connection.from(TABLE).update({next_run_at:fixed}).eq('id',row.id).eq('active',true).eq('next_run_at',row.nextRunAt).select('id');
            if(error) throw error;return !!data?.length;
        });
    },async database=>{
        const {rows}=await database.query('SELECT * FROM report_email_schedules WHERE active=TRUE ORDER BY next_run_at LIMIT 200');
        return inspect(rows,async(row,fixed)=>!!(await database.query('UPDATE report_email_schedules SET next_run_at=$3 WHERE id=$1 AND active=TRUE AND next_run_at=$2 RETURNING id',[row.id,row.nextRunAt,fixed])).rows.length);
    },async()=>{
        let rows=await localRows();
        const result=await inspect(rows,async(row,fixed)=>{rows=rows.map(item=>item.id===row.id?{...item,nextRunAt:fixed}:item);return true;});
        if(!dryRun&&corrected.length) await saveLocal(rows);
        return result;
    });
}

async function record(id, { sentAt = null, error = '', delivery = null, preferences={}, retryable=true,leaseUntil=null,leaseToken=null } = {}) {
    if(leaseUntil&&!leaseToken) throw Error('Falta identificar la ejecución que registra la entrega.');
    const now = clock();
    const normalizedDelivery = normalizeDelivery(delivery);
    const patch = { next_run_at: nextRunAt(normalizedDelivery, now).toISOString(), last_error: String(error || '').slice(0, 500), updated_at: now.toISOString() };
    const attempts=error ? Math.min(4,Number(preferences._deliveryRetries || 0)+1) : 0;
    patch.preferences={...preferences,_deliveryRetries:retryable&&attempts<=3 ? attempts : 0};
    delete patch.preferences._deliveryLease;
    if(!error || !retryable || attempts>3) delete patch.preferences._deliveryRunAt;
    if(error && retryable && attempts<=3) patch.next_run_at=new Date(Math.min(Date.parse(patch.next_run_at),now.getTime()+[0,5,15,30][attempts]*60_000)).toISOString();
    if (sentAt) patch.last_sent_at = sentAt;
    return withPersistence(async connection => {
        let query=connection.from(TABLE).update(patch).eq('id', id);
        if(leaseUntil) query=query.eq('next_run_at',leaseUntil);
        if(leaseToken) query=query.eq('preferences->_deliveryLease->>token',leaseToken);
        const { error: updateError } = await query;
        if (updateError) throw updateError;
        return true;
    }, async database => {
        await database.query(`UPDATE report_email_schedules SET next_run_at=$2, last_error=$3, updated_at=$4,
            last_sent_at=COALESCE($5,last_sent_at), preferences=$6::jsonb WHERE id=$1 AND ($7::timestamptz IS NULL OR next_run_at=$7) AND ($8::text IS NULL OR preferences->'_deliveryLease'->>'token'=$8)`, [id, patch.next_run_at, patch.last_error, patch.updated_at, patch.last_sent_at || null,JSON.stringify(patch.preferences),leaseUntil,leaseToken]);
        return true;
    }, async () => {
        const rows = await localRows();
        await saveLocal(rows.map(item => item.id === id && (!leaseUntil || item.nextRunAt===leaseUntil) && (!leaseToken || item.preferences?._deliveryLease?.token===leaseToken) ? normalize({ ...item, ...patch }) : item));
        return true;
    });
}
return {upsert,upsertMany,list,remove,due,record,claim,isCurrent,reconcileCalendarTimes};
}
module.exports = { INTERVAL_MS, REPORT_TIME_ZONE, normalizeDelivery, validateDelivery,nextRunAt, createScheduleStore,...createScheduleStore() };
