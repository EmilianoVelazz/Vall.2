import assert from 'node:assert/strict';
import { createReportPreferenceStore } from '../frontend/src/lib/reportPreferenceStore.js';
import { normalizePreferences } from '../frontend/src/lib/executiveReportPreferences.js';

const email = 'sync@example.invalid';
const reply = (body, status = 200) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body });
async function scenario(mode) {
  let remote = normalizePreferences(), writes = 0, resolveWrite;
  const states = [];
  const store = createReportPreferenceStore({ delay: 100000, retryDelays: [0, 0], notify: state => states.push(state.status), request: async (path, options) => {
    if (path.endsWith('verify-token')) return reply({ success: true, email });
    if (options.method === 'POST') {
      writes++;
      if (mode === 'forbidden') return reply({ success: false }, 403);
      if (mode === 'offline' || mode === 'transient' && writes === 1) return reply({ success: false }, 503);
      const incoming = JSON.parse(options.body).preferences.executiveReports;
      if (mode === 'slow') await new Promise(resolve => { resolveWrite = resolve; });
      remote = incoming;
      if (mode === 'lost-response') throw new TypeError('Simulated connection interruption after commit');
      return reply({ success: true });
    }
    return reply({ success: true, profile: { email, preferences: { executiveReports: remote } } });
  } });
  await store.load(); store.update({ customTitle: 'Mi edición sincronizada', audience: 'finance' });
  const saving = store.retry();
  if (mode === 'slow') {
    const same = store.retry(); assert.strictEqual(same, saving, 'Los clics repetidos comparten el guardado en curso');
    await Promise.resolve(); await Promise.resolve(); resolveWrite();
  }
  await saving;
  if (mode === 'offline') { assert.equal(writes, 3); assert.equal(store.getState().status, 'save-error'); }
  else if (mode === 'forbidden') { assert.equal(writes, 1); assert.equal(store.getState().status, 'save-error'); assert.match(store.getState().errorMessage, /dominio/); }
  else { assert.equal(store.getState().status, 'saved'); assert.equal(remote.customTitle, 'Mi edición sincronizada'); }
  if (mode === 'lost-response') { assert.equal(writes, 1, 'Comprueba un guardado exitoso cuando se perdió la respuesta'); assert(states.includes('verifying')); }
  if (mode === 'transient') { assert.equal(writes, 2); assert(states.includes('retrying')); }
  store.dispose();
}
for (const mode of ['lost-response', 'transient', 'offline', 'forbidden', 'slow']) await scenario(mode);
for (const mode of ['transient', 'offline', 'forbidden']) {
  let reads = 0;
  const states = [];
  const store = createReportPreferenceStore({ retryDelays: [0, 0], notify: state => states.push(state), request: async path => {
    if (path.endsWith('verify-token')) return reply({ success: true, email });
    reads++;
    if (mode === 'forbidden') return reply({ success: false }, 403);
    if (mode === 'offline' || reads === 1) return reply({ success: false }, 503);
    return reply({ success: true, profile: { email, preferences: { executiveReports: { customTitle: 'Edición de la cuenta' } } } });
  } });
  await store.load();
  assert.equal(reads, mode === 'transient' ? 2 : mode === 'offline' ? 3 : 1);
  assert.equal(store.getState().status, mode === 'transient' ? 'idle' : 'load-error');
  if (mode === 'transient') assert.equal(store.getState().preferences.customTitle, 'Edición de la cuenta');
  assert(states.some(state => state.ready), 'Los campos siguen disponibles durante la reconexión');
  store.dispose();
}
console.log('Report synchronization: OK · confirmación, reintentos limitados, errores y solicitudes duplicadas');
