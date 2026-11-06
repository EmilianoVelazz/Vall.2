'use strict';
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'test-only-independent-account-server';
process.env.VERCEL = '1';
process.env.PRODUCTION_URL = 'https://test.example.invalid';
const profiles = require('../backend/services/user-profile-store');
let preferences = {}, updates = 0;
profiles.findById = async id => ['test-user','other-user'].includes(id) ? { id, email:id==='test-user' ? 'user@example.invalid' : 'other@example.invalid', active: true, preferences } : null;
profiles.updateProfile = async (id, patch) => { preferences = patch.preferences; updates++; return { email: 'user@example.invalid', ...patch }; };
const app = require('../api/auth');
assert(!Object.keys(require.cache).some(file => /[\\/]backend[\\/]routes[\\/](market|chat|export)\.js$/.test(file)), 'Guardar preferencias no carga mercados, IA ni exportadores');
const config = require('../vercel.json');
for (const endpoint of ['login', 'logout', 'verify-token', 'profile', 'change-password']) assert.equal(config.rewrites.find(rule => rule.source === `/api/${endpoint}`).destination, '/api/auth.js');
const server = app.listen(0, '127.0.0.1');
(async () => {
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const token = jwt.sign({ sub: 'test-user', email: 'user@example.invalid', role: 'user' }, process.env.JWT_SECRET);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: process.env.PRODUCTION_URL };
  assert.equal((await fetch(`${base}/profile`)).status, 401);
  const saved = await fetch(`${base}/profile`, { method: 'POST', headers, body: JSON.stringify({ preferences: { executiveReports: { depth: 'brief', customTitle: 'Mi informe' } } }) });
  assert.equal(saved.status, 200); assert.match(saved.headers.get('cache-control'), /private, no-store/);
  const loaded = await (await fetch(`${base}/profile`, { headers })).json();
  assert.equal(loaded.profile.preferences.executiveReports.customTitle, 'Mi informe');
  assert.equal((await fetch(`${base}/verify-token`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/profile`, { method: 'POST', headers: { ...headers, Origin: 'https://evil.example.invalid' }, body: '{}' })).status, 403);
  assert.equal((await fetch(`${base}/profile`, { method: 'POST', headers, body: JSON.stringify({ preferences: { data: 'a'.repeat(17000) } }) })).status, 413);
  assert.equal(updates, 1, 'Las solicitudes rechazadas no escriben preferencias');
  const business = await fetch(`${base}/profile`, {method:'POST',headers,body:JSON.stringify({preferences:{businessProfile:{products:['pork','beef','pork','invalid'],markets:['México'],currency:'MXN',role:'merchant'}}})});
  assert.equal(business.status,200);
  const businessLoaded = await (await fetch(`${base}/profile`,{headers})).json();
  assert.deepEqual(businessLoaded.profile.preferences.businessProfile.products,['pork','beef']);
  assert.equal(businessLoaded.profile.preferences.executiveReports.customTitle,'Mi informe');
  assert.equal(businessLoaded.profile.preferences.businessProfile.currency,'MXN');
  assert.equal((await fetch(`${base}/report-export`, { headers })).status, 404);
  let limited;
  for (let index = 0; index < 125; index++) {
    const response = await fetch(`${base}/verify-token`, { headers });
    if (response.status === 429) { limited = response; break; }
  }
  assert(limited, 'El servidor independiente conserva límites de solicitudes');
  assert(Number(limited.headers.get('retry-after')) > 0);
  const other = jwt.sign({ sub: 'other-user', email: 'other@example.invalid', role: 'user' }, process.env.JWT_SECRET);
  assert.equal((await fetch(`${base}/verify-token`, { headers: { ...headers, Authorization: `Bearer ${other}` } })).status, 200, 'El límite de una cuenta no bloquea otra');
  console.log('Independent account server: OK · rutas, sesión, persistencia, origen y tamaño de solicitudes');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { server.closeAllConnections(); server.close(); });
