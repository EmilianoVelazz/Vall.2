'use strict';

const path = require('node:path');
const dotenv = require('dotenv');
const { setTimeout: pause } = require('node:timers/promises');
const { createClient } = require('@supabase/supabase-js');
const { connectDatabase } = require('../lib/database-connection');
const { configureSystemTrust } = require('../lib/tls-trust');

dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

let supabase;
let restDisabledUntil = 0;

function restClient() {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    configureSystemTrust();
    if (!supabase) supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (resource, options = {}) => fetch(resource, { ...options, signal: options.signal || AbortSignal.timeout(6000) }) },
    });
    return supabase;
}



function profile(row) {
    if (!row) return null;
    return {
        id: row.id, email: row.email, passwordHash: row.password_hash, role: row.role,
        displayName: row.display_name || '', preferences: row.preferences || {}, trainingOptIn: row.training_opt_in !== false,
        active: row.active !== false, lastLoginAt: row.last_login_at || null,
        credentialVersion: Number(row.credential_version || 0), passwordChangedAt: row.password_changed_at || null,
    };
}

async function withStore(restOperation, sqlOperation) {
    const rest = restClient();
    let restError;
    if (rest && Date.now() >= restDisabledUntil) {
        for (let attempt = 0; ; attempt++) {
            try { return await restOperation(rest); }
            catch (error) {
                // Supabase can briefly reject the gateway's fresh secret-key
                // JWT because its validator has a stale clock. That rejection
                // never executes the database operation, so retrying is safe.
                if (error.code === 'PGRST303' && error.message === 'JWT issued at future' && attempt < 2) {
                    await pause((attempt + 1) * 1000);
                    continue;
                }
                restError = error;
                restDisabledUntil = Date.now() + 5 * 1000;
                console.warn('[profiles] Supabase REST no disponible; usando PostgreSQL:', error.message);
                break;
            }
        }
    }
    const database = await connectDatabase();
    if (!database) throw restError || new Error(rest ? 'El servicio de perfiles está temporalmente no disponible.' : 'Supabase no está configurado.');
    try { return await sqlOperation(database); } finally { await database.end().catch(() => {}); }
}

async function findByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    return withStore(async rest => {
        const { data, error } = await rest.from('app_profiles').select('*').eq('email', normalized).maybeSingle();
        if (error) throw error;
        return profile(data);
    }, async database => profile((await database.query('SELECT * FROM app_profiles WHERE LOWER(email)=$1 LIMIT 1', [normalized])).rows[0]));
}

async function findById(id) {
    return withStore(async rest => {
        const { data, error } = await rest.from('app_profiles').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return profile(data);
    }, async database => profile((await database.query('SELECT * FROM app_profiles WHERE id=$1 LIMIT 1', [id])).rows[0]));
}

async function upsertAdmin(email, displayName = 'Administrador') {
    const normalized = String(email || '').trim().toLowerCase();
    return withStore(async rest => {
        const { data: found, error: findError } = await rest.from('app_profiles').select('*').ilike('email', normalized).maybeSingle();
        if (findError) throw findError;
        const existing = profile(found);
        if (existing) {
            const { data, error } = await rest.from('app_profiles').update({ role: 'admin', active: true, updated_at: new Date().toISOString() }).eq('id', existing.id).select().single();
            if (error) throw error;
            return profile(data);
        }
        const { data, error } = await rest.from('app_profiles').insert({ email: normalized, role: 'admin', display_name: displayName, active: true }).select().single();
        if (error) throw error;
        return profile(data);
    }, async database => {
        const existing = (await database.query('SELECT id FROM app_profiles WHERE LOWER(email)=$1 LIMIT 1', [normalized])).rows[0];
        if (existing) return profile((await database.query("UPDATE app_profiles SET role='admin',active=TRUE,updated_at=NOW() WHERE id=$1 RETURNING *", [existing.id])).rows[0]);
        return profile((await database.query("INSERT INTO app_profiles (email,role,display_name,active) VALUES ($1,'admin',$2,TRUE) RETURNING *", [normalized, displayName])).rows[0]);
    });
}

async function markLogin(id) {
    return withStore(async rest => { const { error } = await rest.from('app_profiles').update({ last_login_at: new Date().toISOString() }).eq('id', id); if (error) throw error; return true; },
        async database => { await database.query('UPDATE app_profiles SET last_login_at=NOW() WHERE id=$1', [id]); return true; });
}

async function updatePassword(id, passwordHash) {
    return withStore(async rest => {
        const {data,error}=await rest.rpc('vall_update_profile_password',{target_id:id,new_hash:passwordHash});
        if(error) throw error;
        if(!Number.isInteger(data)) throw Object.assign(Error('Perfil de usuario no encontrado.'),{status:404});
        return data;
    },async database=>{
        const version=(await database.query('SELECT public.vall_update_profile_password($1,$2) AS version',[id,passwordHash])).rows[0]?.version;
        if(!Number.isInteger(version)) throw Object.assign(Error('Perfil de usuario no encontrado.'),{status:404});
        return version;
    });
}

async function listProfiles() {
    const fields='id,email,role,display_name,active,last_login_at,password_changed_at,created_at';
    return withStore(async rest=>{
        const {data,error}=await rest.from('app_profiles').select(fields).order('created_at',{ascending:true}).limit(200);
        if(error) throw error;return data||[];
    },async db=>(await db.query(`SELECT ${fields} FROM app_profiles ORDER BY created_at,id LIMIT 200`)).rows);
}

async function updateProfile(id, { displayName, preferences, trainingOptIn, preferencePatch } = {}) {
    const patch = {};
    if (typeof displayName === 'string') patch.display_name = displayName.trim().slice(0, 80);
    if (preferences && typeof preferences === 'object' && !Array.isArray(preferences)) patch.preferences = preferences;
    if (typeof trainingOptIn === 'boolean') patch.training_opt_in = trainingOptIn;
    patch.updated_at = new Date().toISOString();
    return withStore(async rest => {
        if (preferencePatch) {
            for (let attempt=0;attempt<3;attempt++) {
                const current=await rest.from('app_profiles').select('preferences,updated_at').eq('id',id).maybeSingle();
                if(current.error) throw current.error;
                if(!current.data) throw Error('Perfil no encontrado.');
                const latest={...patch,preferences:{...current.data.preferences,...preferencePatch},updated_at:new Date().toISOString()};
                const {data,error}=await rest.from('app_profiles').update(latest).eq('id',id).eq('updated_at',current.data.updated_at).select().maybeSingle();
                if(error) throw error;
                if(data) return profile(data);
            }
            throw Object.assign(Error('El perfil cambió durante el guardado. Reintenta.'),{status:409});
        }
        const { data, error } = await rest.from('app_profiles').update(patch).eq('id', id).select().single(); if (error) throw error; return profile(data);
    }, async database => {
        if(preferencePatch) return profile((await database.query(`UPDATE app_profiles SET
            display_name=COALESCE($2,display_name),preferences=COALESCE(preferences,'{}'::jsonb)||$3::jsonb,
            training_opt_in=COALESCE($4,training_opt_in),updated_at=NOW() WHERE id=$1 RETURNING *`,
        [id,patch.display_name ?? null,JSON.stringify(preferencePatch),patch.training_opt_in ?? null])).rows[0]);
        const current = profile((await database.query('SELECT * FROM app_profiles WHERE id=$1', [id])).rows[0]);
        const mergedPreferences = preferences ? { ...(current?.preferences || {}), ...preferences } : current?.preferences || {};
        const result = await database.query(`UPDATE app_profiles SET display_name=$2,preferences=$3::jsonb,training_opt_in=$4,updated_at=NOW() WHERE id=$1 RETURNING *`,
            [id, patch.display_name ?? current?.displayName ?? '', JSON.stringify(mergedPreferences), patch.training_opt_in ?? current?.trainingOptIn ?? true]);
        return profile(result.rows[0]);
    });
}

async function listConversations(profileId) {
    return withStore(async rest => { const { data, error } = await rest.from('app_chat_conversations').select('id,title,messages,created_at,updated_at').eq('profile_id', profileId).order('updated_at', { ascending: false }).limit(40); if (error) throw error; return data || []; },
        async database => (await database.query('SELECT id,title,messages,created_at,updated_at FROM app_chat_conversations WHERE profile_id=$1 ORDER BY updated_at DESC LIMIT 40', [profileId])).rows);
}

async function saveConversation(profileId, conversation) {
    const row = { id: String(conversation.id).slice(0, 100), profile_id: profileId, title: String(conversation.title || 'Nueva conversación').slice(0, 160), messages: Array.isArray(conversation.messages) ? conversation.messages.slice(-80) : [], updated_at: new Date(conversation.updatedAt || Date.now()).toISOString() };
    return withStore(async rest => { const { error } = await rest.from('app_chat_conversations').upsert(row, { onConflict: 'profile_id,id' }); if (error) throw error; return true; },
        async database => { await database.query(`INSERT INTO app_chat_conversations (id,profile_id,title,messages,updated_at) VALUES ($1,$2,$3,$4::jsonb,$5)
            ON CONFLICT (profile_id,id) DO UPDATE SET title=EXCLUDED.title,messages=EXCLUDED.messages,updated_at=EXCLUDED.updated_at`, [row.id, profileId, row.title, JSON.stringify(row.messages), row.updated_at]); return true; });
}

async function deleteConversation(profileId, conversationId) {
    return withStore(async rest => { const { error } = await rest.from('app_chat_conversations').delete().eq('profile_id', profileId).eq('id', conversationId); if (error) throw error; return true; },
        async database => { await database.query('DELETE FROM app_chat_conversations WHERE profile_id=$1 AND id=$2', [profileId, conversationId]); return true; });
}

async function recordTrainingQuery(profileId, data) {
    if (!profileId) return false;
    const row = { profile_id: profileId, conversation_id: String(data.conversationId || '').slice(0, 100) || null, query_text: String(data.query || '').slice(0, 12000), response_text: String(data.response || '').slice(0, 50000), model: String(data.model || '').slice(0, 120), source_query_id: Number.isSafeInteger(Number(data.queryId)) ? Number(data.queryId) : null, metadata: data.metadata || {}, approved_for_training: false };
    if (!row.query_text) return false;
    return withStore(async rest => { const { error } = await rest.from('app_training_queries').insert(row); if (error) throw error; return true; },
        async database => {
            const result = await database.query(`INSERT INTO app_training_queries (profile_id,conversation_id,query_text,response_text,model,source_query_id,metadata,approved_for_training)
                SELECT $1,$2,$3,$4,$5,$6,$7::jsonb,FALSE
                WHERE EXISTS (SELECT 1 FROM app_profiles WHERE id=$1 AND active=TRUE AND training_opt_in=TRUE)`,
            [row.profile_id, row.conversation_id, row.query_text, row.response_text, row.model, row.source_query_id, JSON.stringify(row.metadata)]);
            return result.rowCount > 0;
        });
}

// La auditoría operativa de ORION no es un corpus de entrenamiento. Se guarda
// siempre para dar trazabilidad al usuario, al hilo y al enrutamiento usado,
// incluso si `training_opt_in` es falso.
async function recordOrionQuery(profileId, data = {}) {
    if (!profileId) return false;
    const row = {
        profile_id: profileId,
        user_email: String(data.userEmail || '').trim().toLowerCase().slice(0, 320),
        user_display_name: String(data.userDisplayName || '').trim().slice(0, 160),
        conversation_id: String(data.conversationId || '').trim().slice(0, 100) || null,
        query_text: String(data.query || '').trim().slice(0, 12000),
        response_text: String(data.response || '').slice(0, 50000),
        requested_mode: String(data.mode || 'auto').slice(0, 30),
        selected_tier: data.tier === 'pro' ? 'pro' : 'flash',
        selected_model: String(data.model || '').slice(0, 160),
        domain_allowed: data.domainAllowed === true,
        domain_reason: String(data.domainReason || '').slice(0, 80),
        source_query_id: Number.isSafeInteger(Number(data.queryId)) ? Number(data.queryId) : null,
        latency_ms: Number.isFinite(Number(data.latencyMs)) ? Math.max(0, Math.round(Number(data.latencyMs))) : null,
        metadata: data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata) ? data.metadata : {},
    };
    if (!row.query_text || !row.user_email) return false;
    return withStore(async rest => {
        const { error } = await rest.from('orion_query_audit').insert(row);
        if (error) throw error;
        return true;
    }, async database => {
        const result = await database.query(`INSERT INTO orion_query_audit
            (profile_id,user_email,user_display_name,conversation_id,query_text,response_text,requested_mode,selected_tier,selected_model,domain_allowed,domain_reason,source_query_id,latency_ms,metadata)
            SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb
            WHERE EXISTS (SELECT 1 FROM app_profiles WHERE id=$1 AND active=TRUE)`,
        [row.profile_id, row.user_email, row.user_display_name, row.conversation_id, row.query_text, row.response_text,
            row.requested_mode, row.selected_tier, row.selected_model, row.domain_allowed, row.domain_reason,
            row.source_query_id, row.latency_ms, JSON.stringify(row.metadata)]);
        return result.rowCount > 0;
    });
}

async function recentReportQueries(profileId, since) {
    return withStore(async rest => {
        const { data, error } = await rest.from('orion_query_audit').select('query_text,created_at')
            .eq('profile_id', profileId).eq('domain_allowed', true).gte('created_at', since)
            .order('created_at', { ascending: false }).limit(80);
        if (error) throw error;
        return data || [];
    }, async database => (await database.query(`SELECT query_text,created_at FROM orion_query_audit
        WHERE profile_id=$1 AND domain_allowed=TRUE AND created_at >= $2
        ORDER BY created_at DESC LIMIT 80`, [profileId, since])).rows);
}

module.exports = { findByEmail, findById, upsertAdmin, markLogin, updatePassword, updateProfile, listProfiles, listConversations, saveConversation, deleteConversation, recordTrainingQuery, recordOrionQuery, recentReportQueries };
