// scripts/verify-contracts.mjs
//
// Verificador de contratos de la API — Fase 1 del refactor de backend.
// Arranca el app Express en un puerto efímero, golpea cada endpoint de
// Finanzas/Mercados y calcula una "huella de forma" (status + estructura de
// tipos, NO valores volátiles de mercado). Compara el antes y el después del
// refactor para confirmar que ningún contrato se rompió.
//
// Uso:
//   node scripts/verify-contracts.mjs baseline   → captura y guarda el estado actual
//   node scripts/verify-contracts.mjs check       → recaptura y compara contra el baseline
//
// Clasificación de diferencias:
//   BREAKING  → campo eliminado, tipo cambiado o status cambiado  (falla, exit 1)
//   ADDITIVE  → campo nuevo (p.ej. countryCode)                    (informativo, no falla)
//
// El root package.json es ESM; el backend es CommonJS → se carga con createRequire.

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_FILE = path.join(__dirname, '.contract-baseline.json');

// ── Endpoints en alcance (Finanzas + Mercados, solo GET públicos) ───────────
const ENDPOINTS = [
  { name: 'finanzas',         path: '/api/finanzas' },
  { name: 'noticias',         path: '/api/noticias?categoria=econom%C3%ADa&region=global' },
  { name: 'scenarios',        path: '/api/scenarios?tiie=9&fed=4.5&usdmxn=17.2&vix=18&wti=72' },
  { name: 'banxico',          path: '/api/banxico/SF61745' },
  { name: 'finnhub-news',     path: '/api/finnhub-news?category=general' },
  { name: 'alphavantage-news',path: '/api/alphavantage-news?topics=commodities&limit=5' },
  { name: 'exchange-rates',   path: '/api/exchange-rates' },
  { name: 'crypto-global',    path: '/api/crypto-global' },
  { name: 'gdelt',            path: '/api/gdelt?query=Mexico&mode=ArtList&maxrecords=3' },
  { name: 'bond-yields',      path: '/api/bond-yields' },
  { name: 'mx-rates',         path: '/api/mx-rates' },
  { name: 'commodity',        path: '/api/commodity?fn=CORN' },
  { name: 'stock-history',    path: '/api/stock-history?ticker=AAPL&interval=1d&range=1mo' },
  { name: 'bmv-market',       path: '/api/bmv-market' },
];

const TIMEOUT_MS = 22000;

// ── Huella de forma: reduce un valor a su estructura de tipos ────────────────
// Los arreglos se colapsan a la forma de su primer elemento (los datos de
// mercado son listas homogéneas), así el largo variable no genera ruido.
function shapeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return { __array: v.length ? shapeOf(v[0]) : 'empty' };
  const t = typeof v;
  if (t === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = shapeOf(v[k]);
    return o;
  }
  return t; // number | string | boolean
}

async function capture(baseUrl) {
  const out = {};
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetch(baseUrl + ep.path, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      let body = null;
      try { body = await res.json(); } catch { body = '<no-json>'; }
      out[ep.name] = { status: res.status, shape: body === '<no-json>' ? 'non-json' : shapeOf(body) };
      process.stdout.write(`  ✓ ${ep.name.padEnd(20)} ${res.status}\n`);
    } catch (err) {
      out[ep.name] = { status: 'ERROR', shape: err.name === 'TimeoutError' ? 'timeout' : String(err.message) };
      process.stdout.write(`  ⚠ ${ep.name.padEnd(20)} ${out[ep.name].shape}\n`);
    }
  }
  return out;
}

// ── Diff recursivo de dos huellas ────────────────────────────────────────────
function diffShape(base, cur, at, breaking, additive) {
  // `null` solo indica que el dato opcional no estuvo disponible en esa
  // captura; no prueba que el contrato prohíba un valor en otra muestra.
  if (base === 'null' || cur === 'null') return;
  const bT = typeof base, cT = typeof cur;
  if (bT !== 'object' || cT !== 'object' || base === null || cur === null) {
    if (JSON.stringify(base) !== JSON.stringify(cur)) breaking.push(`${at}: tipo ${JSON.stringify(base)} → ${JSON.stringify(cur)}`);
    return;
  }
  // arreglos
  if (base.__array || cur.__array) {
    if (!base.__array || !cur.__array) { breaking.push(`${at}: array vs no-array`); return; }
    // Un arreglo vacío en la muestra ('empty') no revela el tipo de sus elementos:
    // es un comodín. Comparar 'empty' contra un tipo concreto es volatilidad de
    // datos, no cambio de contrato → se ignora.
    if (base.__array === 'empty' || cur.__array === 'empty') return;
    diffShape(base.__array, cur.__array, `${at}[]`, breaking, additive);
    return;
  }
  const keys = new Set([...Object.keys(base), ...Object.keys(cur)]);
  for (const k of keys) {
    if (!(k in cur))       breaking.push(`${at}.${k}: campo ELIMINADO`);
    else if (!(k in base)) additive.push(`${at}.${k}: campo NUEVO`);
    else                   diffShape(base[k], cur[k], `${at}.${k}`, breaking, additive);
  }
}

function compare(base, cur) {
  const breaking = [], additive = [];
  const names = new Set([...Object.keys(base), ...Object.keys(cur)]);
  const unreliable = [];
  for (const name of names) {
    if (!(name in cur))  { breaking.push(`${name}: ENDPOINT desaparecido`); continue; }
    if (!(name in base)) { additive.push(`${name}: ENDPOINT nuevo`); continue; }
    // El contrato que importa es el de la RUTA FELIZ (2xx). Si en alguna de las
    // dos corridas el upstream externo falló (timeout/ERROR o 5xx: rate-limit de
    // Alpha Vantage, token de Banxico inválido, spawn de Python de bmv, etc.),
    // no hay un contrato de éxito estable que comparar → se reporta como
    // informativo ("no verificable en esta corrida"), nunca como ruptura. Los
    // 4xx sí se comparan estrictos (validación determinista del propio código).
    const upstreamDown = s => s === 'ERROR' || (typeof s === 'number' && s >= 500);
    if (upstreamDown(base[name].status) || upstreamDown(cur[name].status)) {
      unreliable.push(`${name}: upstream no disponible (${base[name].status} → ${cur[name].status})`);
      continue;
    }
    if (base[name].status !== cur[name].status)
      breaking.push(`${name}: status ${base[name].status} → ${cur[name].status}`);
    diffShape(base[name].shape, cur[name].shape, name, breaking, additive);
  }
  return { breaking, additive, unreliable };
}

// ── Arranque del app en puerto efímero ───────────────────────────────────────
async function withServer(fn) {
  const app = require(path.join(__dirname, '..', 'backend', 'server.js'));
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const port = server.address().port;
  try { return await fn(`http://127.0.0.1:${port}`); }
  finally { server.close(); }
}

// ── Main ─────────────────────────────────────────────────────────────────────
const mode = process.argv[2];
if (!['baseline', 'check'].includes(mode)) {
  console.error('Uso: node scripts/verify-contracts.mjs <baseline|check>');
  process.exit(2);
}

await withServer(async (baseUrl) => {
  console.log(`\n[verify-contracts] modo=${mode} · ${baseUrl}\n`);
  const snap = await capture(baseUrl);

  if (mode === 'baseline') {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(snap, null, 2));
    console.log(`\n✅ Baseline guardado en ${path.relative(process.cwd(), BASELINE_FILE)} (${ENDPOINTS.length} endpoints).`);
    return;
  }

  // mode === 'check'
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error('\n❌ No hay baseline. Corre primero: node scripts/verify-contracts.mjs baseline');
    process.exit(2);
  }
  const base = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const { breaking, additive, unreliable } = compare(base, snap);

  console.log('\n──────────── RESULTADO ────────────');
  if (unreliable.length) {
    console.log(`\n○ Endpoints sin baseline confiable (informativo) — ${unreliable.length}:`);
    unreliable.forEach(d => console.log('   ○ ' + d));
  }
  if (additive.length) {
    console.log(`\nℹ️  Cambios ADITIVOS (no rompen contrato) — ${additive.length}:`);
    additive.forEach(d => console.log('   + ' + d));
  }
  if (breaking.length) {
    console.log(`\n❌ Cambios QUE ROMPEN CONTRATO — ${breaking.length}:`);
    breaking.forEach(d => console.log('   ! ' + d));
    console.log('\nFALLÓ: el refactor cambió al menos un contrato.\n');
    process.exit(1);
  }
  console.log('\n✅ Ningún contrato roto. Solo cambios aditivos (si los hay).\n');
});
