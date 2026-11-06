import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { normalizePreferences, personalizeExecutiveReport } from '../frontend/src/lib/executiveReportPreferences.js';
import { createReportPreferenceStore } from '../frontend/src/lib/reportPreferenceStore.js';
const require = createRequire(import.meta.url);
const backend = require('../backend/lib/executive-report-preferences.js');
const report = { title: 'Mercados', summary: 'Datos del corte.', generatedAt: '2026-10-07T14:00:00Z',
  metrics: [{ label: 'Ventas', value: 12 }, { label: 'Costo de maíz', value: 25 }, { label: 'VIX · volatilidad', value: 19 }],
  sections: [{ heading: 'Demanda', text: 'Ventas del sector.' }, { heading: 'Oferta de maíz', text: 'Inventarios y costo del alimento.' }],
  sources: ['Fuente de prueba'], sourceLinks: [{ label: 'Referencia' }], content: 'Contenido sin personalizar', executiveBrief: { drivers: ['Ventas', 'Costo de maíz'], risks: ['Riesgo de prueba'] },
};
for (const audience of ['general', 'finance', 'purchasing', 'operations', 'commercial']) for (const depth of ['brief', 'standard', 'detailed']) {
  const prefs = { audience, depth, objective: 'Costo del maíz', decisionHorizon: 'quarter', sections: { risks: false } };
  assert.deepEqual(personalizeExecutiveReport(report, prefs), backend.personalizeExecutiveReport(report, prefs), 'Lectura y entrega deben aplicar la misma edición');
}
assert.equal(personalizeExecutiveReport(report, { audience: 'finance' }).metrics[0].label, 'VIX · volatilidad');
assert.equal(personalizeExecutiveReport(report, { audience: 'purchasing' }).metrics[0].label, 'Costo de maíz');
assert.match(personalizeExecutiveReport(report, { depth: 'detailed' }).sections.at(-1).text, /2026-10-07/);
assert.match(personalizeExecutiveReport(report, { objective: 'exportaciones avícolas' }).decisionGuide.coverageNote, /no contiene evidencia/);
assert.equal(report.content, 'Contenido sin personalizar');
assert.deepEqual(normalizePreferences({ audience: 'desconocida', sections: { sources: false } }), backend.normalizePreferences({ audience: 'desconocida', sections: { sources: false } }));

const entries = new Map();
const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) };
let email = 'ana@example.invalid', failLoad = true, failSave = true, remote = normalizePreferences(), writes = [];
const request = async (path, options = {}) => {
  if (path.includes('verify-token')) return { ok: true, status: 200, json: async () => ({ success: true, email }) };
  if (options.method === 'POST') {
    const incoming = JSON.parse(options.body).preferences.executiveReports; writes.push(incoming);
    if (failSave) return { ok: false, status: 503, json: async () => ({ success: false }) };
    remote = incoming;
  } else if (failLoad) return { ok: false, status: 503, json: async () => ({ success: false }) };
  return { ok: true, status: 200, json: async () => ({ success: true, profile: { email, preferences: { executiveReports: remote } } }) };
};
const make = () => createReportPreferenceStore({ request, storage, delay: 100000, retryDelays: [0, 0] });
let store = make(); await store.load();
assert.equal(store.getState().ready, true, 'Una caída del perfil no bloquea los campos');
assert.equal(store.getState().status, 'load-error');
store.update(current => ({ ...current, customTitle: 'Mi edición pendiente', depth: 'brief' })); await store.retry();
assert.equal(store.getState().status, 'save-error'); store.dispose();
store = make(); await store.load();
assert.equal(store.getState().preferences.customTitle, 'Mi edición pendiente', 'Recargar conserva el borrador no sincronizado');
failLoad = false; failSave = false; await store.retry();
assert.equal(store.getState().status, 'saved'); assert.equal(remote.customTitle, 'Mi edición pendiente');
store.dispose(); email = 'otro@example.invalid'; remote = normalizePreferences();
store = make(); await store.load();
assert.equal(store.getState().preferences.customTitle, '', 'Una segunda cuenta no recibe el borrador de la primera'); store.dispose();

// A slower save must never report a newer, unsaved edition as synchronized.
let resolveOld;
store = createReportPreferenceStore({ storage, delay: 100000, request: async (path, options) => {
  if (options.method !== 'POST') return request(path, options);
  await new Promise(resolve => { resolveOld = resolve; });
  return { ok: true, json: async () => ({ success: true }) };
} });
await store.load(); store.update({ customTitle: 'Primera' }); const pending = store.retry();
await Promise.resolve(); await Promise.resolve();
store.update({ customTitle: 'Segunda' }); resolveOld(); await pending;
assert.notEqual(store.getState().status, 'saved'); assert.equal(store.getState().preferences.customTitle, 'Segunda'); store.dispose();

let firstResolve, lastWrite, count = 0;
entries.clear();
store = createReportPreferenceStore({ storage, delay: 100000, request: async (path, options) => {
  if (options.method !== 'POST') return request(path, options);
  const prefs = JSON.parse(options.body).preferences.executiveReports;
  if (++count === 1) await new Promise(resolve => { firstResolve = resolve; });
  lastWrite = prefs;
  return { ok: true, json: async () => ({ success: true }) };
} });
await store.load(); store.update({ customTitle: 'Temporal' }); const firstWrite = store.retry();
await Promise.resolve(); await Promise.resolve();
store.update(normalizePreferences()); firstResolve(); await firstWrite; await store.retry();
assert.equal(lastWrite.customTitle, '', 'Restaurar durante un guardado lento también debe sincronizarse');
store.dispose();

const expired = createReportPreferenceStore({ storage, request: async () => ({ ok: false, status: 401, json: async () => ({ success: false }) }) });
await expired.load(); assert.equal(expired.getState().status, 'session-error'); assert.equal(expired.getState().ready, false); expired.dispose();
console.log('Report editions: OK · persistencia, reintentos, aislamiento, prioridades y paridad');
