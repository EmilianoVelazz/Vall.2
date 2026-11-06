'use strict';
const assert = require('node:assert/strict');
const { createServerClient } = require('./lib/supabase-server-client.cjs');
const base = { VITE_SUPABASE_URL: 'https://project.example.invalid', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_TEST' };
for (const key of [undefined, 'sb_publishable_TEST', 'invalid', `eyJ.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.test`]) {
    assert.throws(() => createServerClient({ env: { ...base, SUPABASE_SERVICE_ROLE_KEY: key }, clientFactory() { throw Error('No debe crear el cliente'); } }), { code: 'SUPABASE_SERVER_KEY_REQUIRED' });
}
for (const key of ['sb_secret_TEST', `eyJ.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.test`]) {
    let options;
    const client = createServerClient({ env: { ...base, SUPABASE_SERVICE_ROLE_KEY: key }, clientFactory(url, privateKey, config) {
        assert.equal(url, base.VITE_SUPABASE_URL); assert.equal(privateKey, key); options = config; return { privateClient: true };
    } });
    assert(client.privateClient); assert.deepEqual(options.auth, { persistSession: false, autoRefreshToken: false });
}
console.log('Clientes de importación: clave privada obligatoria, sin respaldo publicable ni sesión persistente. OK');
