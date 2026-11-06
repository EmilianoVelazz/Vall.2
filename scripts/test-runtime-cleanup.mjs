import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as espree from 'espree';
import { startPolling } from '../frontend/src/lib/startPolling.js';
import { CHART_JS, LIGHTWEIGHT_CHARTS, MAPA_MUNDIAL } from '../frontend/src/lib/hojasComunes.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

// Salir durante una consulta lenta no debe reactivar el temporizador después.
{
  const query = deferred(), timers = new Map(); let calls = 0;
  const stop = startPolling(() => { calls++; return query.promise; }, 100, {
    setTimer(fn) { timers.set(1, fn); return 1; }, clearTimer(id) { timers.delete(id); },
  });
  assert.equal(calls, 1); assert.equal(timers.size, 0);
  stop(); query.resolve(); await flush();
  assert.equal(timers.size, 0); assert.equal(calls, 1);
}
// Consultas lentas no se solapan; una caída se recupera en el siguiente ciclo.
{
  const timers = new Map(), failures = []; let active = 0, maxActive = 0, calls = 0;
  let query = deferred();
  const stop = startPolling(async () => {
    calls++; active++; maxActive = Math.max(active, maxActive);
    try { await query.promise; if (calls === 2) throw Error('Proveedor temporalmente caído'); }
    finally { active--; }
  }, 100, { onError: error => failures.push(error.message),
    setTimer(fn) { timers.set(1, fn); return 1; }, clearTimer(id) { timers.delete(id); },
  });
  assert.equal(timers.size, 0); query.resolve(); await flush();
  assert.equal(timers.size, 1);
  const next = timers.get(1); timers.delete(1); query = deferred(); next();
  assert.equal(calls, 2); assert.equal(timers.size, 0); assert.equal(maxActive, 1);
  query.resolve(); await flush(); assert.equal(failures.length, 1); assert.equal(timers.size, 1);
  const queued = timers.get(1); stop(); queued(); await flush();
  assert.equal(timers.size, 0); assert.equal(calls, 2);
}

// Ejecuta el efecto real de MktChart con React/DOM/proveedor simulados.
const source = fs.readFileSync(new URL('../frontend/src/components/MktChart.jsx', import.meta.url), 'utf8');
const tree = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true });
let effect;
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression' && node.callee.name === 'useEffect') effect = source.slice(...node.arguments[0].range);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
  }
}
visit(tree); assert(effect);
function chartFixture() {
  const query = deferred(), states = [], signals = []; let created = 0, removed = 0, disconnected = 0;
  const chart = { addLineSeries: () => ({ setData() {} }), timeScale: () => ({ fitContent() {} }), remove() { removed++; } };
  const context = vm.createContext({ AbortController, encodeURIComponent,
    window: { LightweightCharts: { CrosshairMode: { Normal: 0 }, createChart() { created++; return chart; } } },
    contenedor: { current: { clientWidth: 800, clientHeight: 280 } },
    setEstado: state => states.push(state), setError: error => states.push(error),
    fetch: (_, options) => { signals.push(options.signal); return query.promise; },
    token: (_, fallback) => fallback, ACENTO: { granos: { linea: '#aab', area: '#ccd' } },
    INTERVALO_POR_RANGO: { '1y': '1d' }, rango: '1y', ticker: 'TEST', modo: 'line', panel: 'granos',
    ResizeObserver: class { observe() {} disconnect() { disconnected++; } },
  });
  const cleanup = vm.runInContext(`(${effect})()`, context);
  return { query, states, signals, cleanup, counts: () => ({ created, removed, disconnected }) };
}
const response = { ok: true, json: async () => ({ candles: [{ time: '2026-10-21', open: 10, high: 12, low: 9, close: 11 }] }) };
{
  const old = chartFixture(), states = old.states.length;
  old.cleanup(); assert.equal(old.signals[0].aborted, true);
  old.query.resolve(response); await flush();
  assert.equal(old.counts().created, 0); assert.equal(old.states.length, states);
}
{
  const current = chartFixture(); current.query.resolve(response); await flush();
  assert.equal(current.counts().created, 1); current.cleanup();
  assert.deepEqual(current.counts(), { created: 1, removed: 1, disconnected: 1 });
}

// Finanzas/Mercados y el cargador clásico de ORION usan las mismas versiones.
const finance = fs.readFileSync(new URL('../frontend/src/pages/Finanzas.jsx', import.meta.url), 'utf8');
const markets = fs.readFileSync(new URL('../frontend/src/pages/Mercados.jsx', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../assets/js/data-service.js', import.meta.url), 'utf8');
let ensureSource;
function findEnsure(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration' && node.id.name === 'ensureChartJs') ensureSource = service.slice(...node.range);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(findEnsure); else if (value && typeof value === 'object') findEnsure(value);
  }
}
findEnsure(espree.parse(service, { ecmaVersion: 'latest', sourceType: 'script', range: true }));
assert(ensureSource);
{
  const scripts = []; let inserted = 0;
  const context = vm.createContext({ window: {}, document: {
    querySelector: selector => scripts.find(script => selector.includes(script.src)),
    createElement: () => Object.assign(new EventTarget(), { dataset: {}, remove() { const index = scripts.indexOf(this); if (index >= 0) scripts.splice(index, 1); } }),
    head: { appendChild(script) { scripts.push(script); inserted++; } },
  } });
  const ensure = vm.runInContext(`let _chartJsPromise = null; ${ensureSource}; ensureChartJs`, context);
  const first = ensure(), concurrent = ensure(); assert.equal(first, concurrent); assert.equal(inserted, 1);
  scripts[0].onerror(); await assert.rejects(first, /Chart.js/);
  const retry = ensure(); assert.equal(inserted, 2);
  context.window.Chart = {}; scripts[0].onload(); await retry;
  await ensure(); assert.equal(inserted, 2);
}
{
  const pending = Object.assign(new EventTarget(), { src: CHART_JS, dataset: {} }); let inserted = 0;
  const context = vm.createContext({ window: {}, document: { querySelector: () => pending, head: { appendChild() { inserted++; } } } });
  const ensure = vm.runInContext(`let _chartJsPromise = null; ${ensureSource}; ensureChartJs`, context);
  let finished = false; const waiting = ensure().then(() => { finished = true; });
  await flush(); assert.equal(finished, false); assert.equal(inserted, 0);
  context.window.Chart = {}; pending.dispatchEvent(new Event('load')); await waiting;
  assert.equal(pending.dataset.vnLoaded, 'true'); assert.equal(inserted, 0);
}
assert(service.includes(CHART_JS)); assert(finance.includes('CHART_JS'));
assert(markets.includes('const LIB_CHART = [LIGHTWEIGHT_CHARTS]'));
assert(finance.includes('MAPA_MUNDIAL') && markets.includes('MAPA_MUNDIAL'));
assert(LIGHTWEIGHT_CHARTS.startsWith('/assets/')); assert(MAPA_MUNDIAL.startsWith('/assets/'));
console.log('Ciclo de vida: salida durante carga, ausencia de solapamientos, recuperación, cancelación de fetch, liberación de gráfica/observer, reintento de librería y versiones compartidas OK.');
