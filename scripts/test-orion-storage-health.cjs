'use strict';
const assert = require('node:assert/strict');
const { inspectOrionStorage, TABLES } = require('../backend/services/orion-storage-health');
const { databaseConfig } = require('../backend/lib/database-connection');
const now = () => Date.parse('2026-10-15T18:00:00Z');
async function main() {
    const env = { SUPABASE_URL: 'https://project.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_TEST_PRIVATE' };
    const calls = [];
    let closed = false;
    const good = await inspectOrionStorage({ env, now, get: async (url, options) => {
        calls.push({ url: String(url), options });
        assert.equal(options.headers.Authorization, undefined);
        assert.equal(new URL(url).searchParams.get('limit'), '0');
        return new Response('[]', { headers: { date: new Date(now()).toUTCString() } });
    }, connect: async () => ({ query: async (sql, values) => {
        assert(sql.includes('to_regclass')); assert(values[0].includes('public.app_chat_conversations'));
        return { rows: TABLES.map(table => ({ name: 'public.' + table, present: true })) };
    }, end: async () => { closed = true; } }) });
    assert(good.remoteReady); assert(closed); assert.equal(calls.length, 5);
    assert(!JSON.stringify(good).includes(env.SUPABASE_SERVICE_ROLE_KEY));
    const failed = await inspectOrionStorage({ env, now, get: async () => new Response(JSON.stringify({ code: 'PGRST303', message: 'JWT issued at future' }), { status: 401 }),
        connect: async () => { throw Object.assign(Error('Private connectionString=password'), { code: 'ENOTFOUND' }); } });
    assert(!failed.remoteReady); assert(failed.rest.tables.every(table => table.clockRejection));
    assert.equal(failed.postgres.code, 'ENOTFOUND'); assert(!JSON.stringify(failed).includes('password'));
    const absent = await inspectOrionStorage({ env: {}, now, get: async () => { throw Error('Must not connect'); } });
    assert.equal(absent.rest.status, 'not_configured');
    const missing = await inspectOrionStorage({ env, now, get: async () => new Response(JSON.stringify({ code: 'PGRST205' }), { status: 404 }) });
    assert(missing.rest.tables.every(table => table.status === 'missing'));
    for (const port of ['5432', '6543']) {
        assert.equal(databaseConfig({ SUPABASE_URL: env.SUPABASE_URL, SUPABASE_PASSWORD: 'private', SUPABASE_POOLER_HOST: 'known.pooler.supabase.com', SUPABASE_POOLER_PORT: port }).port, Number(port));
    }
    assert.throws(() => databaseConfig({ SUPABASE_URL: env.SUPABASE_URL, SUPABASE_PASSWORD: 'private', SUPABASE_POOLER_HOST: 'known.pooler.supabase.com', SUPABASE_POOLER_PORT: '22' }), { code: 'DB_INVALID_PORT' });
    console.log('ORION storage: diagnóstico sin datos privados, errores, esquema y puertos de pooler OK');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
