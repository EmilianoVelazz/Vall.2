'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
process.env.SUPABASE_URL = 'https://profiles.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-secret';
const storePath = require.resolve('../backend/services/user-profile-store');
const clockError = { code: 'PGRST303', message: 'JWT issued at future' };

async function scenario(mode) {
  let calls = 0, fallbacks = 0, written;
  const pauses = [];
  const row = { id: 'profile-test', email: 'test@example.invalid', preferences: {}, active: true };
  const result = async patch => {
    calls++;
    if (mode === 'expired') return { error: { code: 'PGRST303', message: 'JWT expired' } };
    if (mode === 'permanent' || calls < (mode === 'write' ? 2 : 3)) return { error: clockError };
    written = patch;
    return { data: { ...row, ...patch } };
  };
  const client = { from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: () => result() }) }),
    update: patch => ({ eq: () => ({ select: () => ({ single: () => result(patch) }) }) }),
  }) };
  const original = Module._load;
  Module._load = function (name, parent, main) {
    if (name === 'dotenv') return { config() {} };
    if (name === '@supabase/supabase-js') return { createClient: () => client };
    if (name === 'node:timers/promises') return { setTimeout: async ms => { pauses.push(ms); } };
    if (name === '../lib/database-connection' && parent.filename === storePath) return { connectDatabase: async () => { fallbacks++; return null; } };
    return original.call(this, name, parent, main);
  };
  delete require.cache[storePath];
  let store;
  try { store = require(storePath); } finally { Module._load = original; }
  if (mode === 'read') {
    assert.equal((await store.findById(row.id)).email, row.email);
    assert.equal(calls, 3); assert.equal(fallbacks, 0); assert.deepEqual(pauses, [1000, 2000]);
  } else if (mode === 'write') {
    const preferences = { executiveReports: { customTitle: 'Edición recuperada' }, otherFeature: true };
    assert.deepEqual((await store.updateProfile(row.id, { preferences })).preferences, preferences);
    assert.deepEqual(written.preferences, preferences); assert.equal(calls, 2); assert.equal(fallbacks, 0); assert.deepEqual(pauses, [1000]);
  } else {
    await assert.rejects(store.findById(row.id), error => error.message === (mode === 'expired' ? 'JWT expired' : clockError.message));
    assert.equal(calls, mode === 'expired' ? 1 : 3); assert.equal(fallbacks, 1);
    assert.deepEqual(pauses, mode === 'expired' ? [] : [1000, 2000]);
    await assert.rejects(store.findById(row.id), /temporalmente/);
    assert.equal(calls, mode === 'expired' ? 1 : 3, 'El circuito conserva un límite durante la caída');
  }
}
(async () => {
  for (const mode of ['read', 'write', 'permanent', 'expired']) await scenario(mode);
  console.log('Profile clock recovery: OK · lectura, escritura, reintentos acotados y credenciales inválidas');
})().catch(error => { console.error(error); process.exitCode = 1; });
