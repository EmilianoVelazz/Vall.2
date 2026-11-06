'use strict';
const TABLES = ['app_profiles', 'app_chat_conversations', 'forecast_learning_trials', 'orion_market_series', 'orion_market_observations'];
function errorCode(error) {
    const code = String(error?.code || error?.cause?.code || error?.name || 'UNAVAILABLE');
    return /^[A-Z0-9_]{1,40}$/i.test(code) ? code : 'UNAVAILABLE';
}
function credentialMetadata(key, url, now) {
    if (!key) return { configured: false };
    if (!key.startsWith('eyJ')) return { configured: true, kind: key.startsWith('sb_secret_') ? 'secret' : 'opaque' };
    try {
        const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
        return { configured: true, kind: 'legacy_jwt', metadataVerified: false,
            serviceRole: payload.role === 'service_role',
            projectMatches: payload.ref ? new URL(url).hostname.split('.')[0] === payload.ref : null,
            issuedInFuture: Number.isFinite(payload.iat) ? payload.iat * 1000 > now + 60000 : null,
            expired: Number.isFinite(payload.exp) ? payload.exp * 1000 <= now : null };
    } catch { return { configured: true, kind: 'unreadable_jwt' }; }
}
async function inspectOrionStorage({ env = process.env, get = fetch, connect, now = Date.now } = {}) {
    const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    const report = { checkedAt: new Date(now()).toISOString(), readOnly: true,
        credential: credentialMetadata(key, base, now()), rest: { configured: Boolean(base && key), tables: [] },
        postgres: { status: 'not_checked' } };
    if (base && key) {
        let origin;
        try { origin = new URL(base); if (origin.protocol !== 'https:' || origin.username || origin.password) throw Error(); }
        catch { report.rest.status = 'invalid_url'; return report; }
        for (const table of TABLES) {
            try {
                // Limit zero: confirm access/schema without downloading private rows.
                const headers = { apikey: key };
                if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
                const response = await get(new URL(`/rest/v1/${table}?select=*&limit=0`, origin), {
                    headers, signal: AbortSignal.timeout(5000) });
                const body = response.ok ? null : await response.json().catch(() => null);
                const remoteDate = Date.parse(response.headers.get('date'));
                if (Number.isFinite(remoteDate)) report.rest.clockOffsetSeconds = Math.round((remoteDate - now()) / 1000);
                report.rest.tables.push({ table, status: response.ok ? 'ready' : body?.code === 'PGRST205' ? 'missing'
                    : response.status === 401 || response.status === 403 ? 'denied' : 'unavailable',
                httpStatus: response.status, code: body ? errorCode(body) : null,
                clockRejection: body?.code === 'PGRST303' && /JWT issued at future/i.test(body.message || '') });
            } catch (error) { report.rest.tables.push({ table, status: 'unavailable', code: errorCode(error) }); }
        }
        report.rest.status = report.rest.tables.every(row => row.status === 'ready') ? 'ready' : 'unavailable';
    } else report.rest.status = 'not_configured';
    if (connect) {
        let database;
        try {
            database = await connect();
            if (!database) report.postgres.status = 'not_configured';
            else {
                const { rows } = await database.query('SELECT name, to_regclass(name) IS NOT NULL AS present FROM unnest($1::text[]) AS name', [TABLES.map(name => 'public.' + name)]);
                report.postgres = { status: rows.every(row => row.present) ? 'ready' : 'schema_incomplete',
                    tables: rows.map(row => ({ table: row.name.replace(/^public\./, ''), present: row.present })) };
            }
        } catch (error) { report.postgres = { status: 'unavailable', code: errorCode(error) }; }
        finally { await database?.end().catch(() => {}); }
    }
    report.remoteReady = report.rest.status === 'ready';
    return report;
}
module.exports = { inspectOrionStorage, TABLES };
