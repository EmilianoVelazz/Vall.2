// Opt-in integration check: actual local HTTP server and the configured private
// Supabase store. Creates one temporary account and removes only that account.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID, randomBytes } from 'node:crypto';
import { createReportPreferenceStore } from '../frontend/src/lib/reportPreferenceStore.js';
import { normalizePreferences } from '../frontend/src/lib/executiveReportPreferences.js';
const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env.local', quiet: true });
require('dotenv').config({ path: 'backend/.env', quiet: true });
require('../backend/lib/tls-trust').configureSystemTrust();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

if (!process.argv.includes('--live')) {
  console.log('Usa --live para probar el servidor local con una cuenta temporal en Supabase.');
  process.exit(0);
}
const base = new URL(process.env.VN_REPORT_SYNC_TEST_URL || 'http://127.0.0.1:5273');
assert(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Esta prueba sólo admite el servidor local');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && key, 'Falta la configuración privada de Supabase');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (resource, options = {}) => fetch(resource, { ...options, signal: options.signal || AbortSignal.timeout(10000) }) } });
const id = randomUUID(), email = `qa-report-sync-${id}@example.invalid`, password = randomBytes(32).toString('base64url');
const row = { id, email, role: 'user', active: true, display_name: 'Prueba temporal de sincronización', password_hash: await bcrypt.hash(password, 10), training_opt_in: false, preferences: { liveVerification: id } };
const clockRetry = async operation => {
  for (let attempt = 0; ; attempt++) {
    const result = await operation();
    if (!result.error) return result.data;
    if (result.error.code !== 'PGRST303' || result.error.message !== 'JWT issued at future' || attempt >= 2) throw result.error;
    await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
  }
};
let created = false, cookie, controller, lostReply = false, offlineReplies = 0;
const requests = [];
try {
  // A stable, newly generated UUID also makes setup recovery idempotent.
  await clockRetry(() => client.from('app_profiles').upsert(row, { onConflict: 'id' })); created = true;
  const login = await fetch(new URL('/api/login', base), { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base.origin }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(30000) });
  assert.equal(login.status, 200, 'La cuenta de prueba debe entrar mediante el login real');
  const loggedIn = await login.json(); assert.equal(loggedIn.success, true);
  cookie = login.headers.getSetCookie().find(value => value.startsWith('vn_token='))?.split(';')[0];
  assert(cookie, 'El login debe emitir la cookie httpOnly de sesión');
  const request = async (path, options = {}) => {
    if (options.method === 'POST' && offlineReplies > 0) { offlineReplies--; throw new TypeError('Simulated network interruption before request'); }
    const response = await fetch(new URL(path, base), { ...options, headers: { ...options.headers, Cookie: cookie, Origin: base.origin } });
    requests.push({ path, method: options.method || 'GET', status: response.status });
    if (options.method === 'POST' && lostReply) { lostReply = false; await response.arrayBuffer(); throw new TypeError('Simulated lost acknowledgement after successful write'); }
    return response;
  };
  const make = () => {
    const entries = new Map();
    return createReportPreferenceStore({ request, delay: 100000, storage: { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) } });
  };
  controller = make(); await controller.load();
  assert.equal(controller.getState().status, 'idle', 'La carga inicial debe leer Supabase');
  for (const [index, patch] of [
    { customTitle: 'Informe local · México', audience: 'purchasing', objective: 'Costos del maíz y proteínas' },
    { depth: 'brief', sections: { charts: false, risks: false } },
    { decisionHorizon: 'quarter', organization: 'Equipo de análisis', confidentiality: 'confidential' },
    { customTitle: 'Edición con respuesta recuperada' },
    { customTitle: 'Edición reconectada' },
  ].entries()) {
    if (index === 3) lostReply = true;
    if (index === 4) offlineReplies = 2;
    controller.update(current => ({ ...current, ...patch })); await controller.retry();
    assert.equal(controller.getState().status, 'saved', `Guardado real ${index + 1}`);
    const actual = await (await request('/api/profile')).json();
    assert.equal(actual.profile.email, email);
    assert.deepEqual(normalizePreferences(actual.profile.preferences.executiveReports), controller.getState().preferences);
    assert.equal(actual.profile.preferences.liveVerification, id, 'Conserva preferencias de otras funciones');
  }
  const expected = controller.getState().preferences; controller.dispose(); controller = make(); await controller.load();
  assert.deepEqual(controller.getState().preferences, expected, 'Una nueva instancia sin borrador debe recuperar la edición guardada');
  const crossSite = await fetch(new URL('/api/profile', base), { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.example.invalid', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(crossSite.status, 403, 'El guardado conserva la protección contra solicitudes de otro origen');
  await clockRetry(() => client.from('app_profiles').update({ active: false }).eq('id', id).eq('email', email));
  const inactive = await request('/api/profile'); assert.equal(inactive.status, 404, 'No admite una cuenta deshabilitada');
  console.log(JSON.stringify({ success: true, checks: ['login real', '5 ediciones confirmadas en Supabase', 'recarga sin borrador', 'respuesta perdida', 'desconexión temporal', 'preferencias preservadas', 'origen rechazado', 'cuenta deshabilitada'], httpRequests: requests.length, unsuccessfulRequests: requests.filter(row => row.status >= 500).length }, null, 2));
} catch (error) {
  console.error('Verificación real fallida:', error.code || error.name, error.message);
  console.error('Respuestas HTTP:', requests);
  process.exitCode = 1;
} finally {
  controller?.dispose();
  if (cookie) await fetch(new URL('/api/logout', base), { method: 'POST', headers: { Cookie: cookie, Origin: base.origin } }).catch(() => {});
  // Cleanup also covers a setup write whose acknowledgement was lost.
  try {
    const existing = await clockRetry(() => client.from('app_profiles').select('id,email').eq('id', id).maybeSingle());
    if (existing) {
      assert.equal(existing.email, email, 'Sólo puede eliminar su propia cuenta temporal');
      await clockRetry(() => client.from('app_profiles').delete().eq('id', id).eq('email', email));
      assert.equal(await clockRetry(() => client.from('app_profiles').select('id').eq('id', id).maybeSingle()), null);
    }
    if (created || existing) console.log('Cuenta temporal eliminada.');
  } catch (error) { console.error('No se completó la limpieza de la cuenta temporal:', error.code || error.name); process.exitCode = 1; }
}
