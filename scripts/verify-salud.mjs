/**
 * Revisión estática de salud del proyecto.
 *
 * No sustituye a los verificadores de navegador (verify-page, verify-finanzas,
 * verify-dark): esos comprueban que la página funcione, este comprueba que el
 * código no tenga las averías que en este repositorio ya se han colado más de
 * una vez y que no dan la cara hasta mucho después.
 *
 * Uso:  node scripts/verify-salud.mjs
 * Sale con código 1 si encuentra algo, para poder encadenarlo en un hook.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', a, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const versionados = git('ls-files').split('\n').filter(Boolean);
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let problemas = 0;
const mal = (m) => { problemas++; console.log('  FALLO  ' + m); };
const ok = (m) => console.log('  ok     ' + m);

// ── 1. Sintaxis ──────────────────────────────────────────────────────────────
console.log('\n== 1. sintaxis de JavaScript ==');
const js = versionados.filter((f) => /\.(js|cjs|mjs)$/.test(f) && !f.includes('vendor/') && !f.startsWith('frontend/'));
let rotos = 0;
for (const f of js) {
  try { execFileSync(process.execPath, ['--check', path.join(RAIZ, f)], { stdio: 'pipe' }); }
  catch (e) { mal(`${f}: ${String(e.stderr).split('\n')[1] || 'error de sintaxis'}`); rotos++; }
}
if (!rotos) ok(`${js.length} archivos pasan node --check`);

// ── 2. Codificación ──────────────────────────────────────────────────────────
// Los verificadores llevan el patrón de mojibake escrito para detectarlo; si no
// se excluyen, se delatan a sí mismos.
console.log('\n== 2. codificación ==');
let moji = 0;
for (const f of versionados.filter((x) => /\.(js|jsx|mjs|cjs|css|html|md|json)$/.test(x))) {
  if (/^scripts\/verify-/.test(f)) continue;
  const n = (leer(f).match(/Ã[\x80-\xBF]|â€|Â[\x80-\xBF]/g) || []).length;
  if (n > 0) { mal(`${f}: ${n} secuencias mal codificadas`); moji++; }
}
if (!moji) ok('sin mojibake');

// ── 3. Rutas a /assets que no existen ────────────────────────────────────────
console.log('\n== 3. referencias a /assets ==');
const refs = new Set();
for (const f of versionados.filter((x) => /\.(js|jsx|mjs|cjs|html|css)$/.test(x))) {
  for (const m of leer(f).matchAll(/["'`(](\/assets\/[A-Za-z0-9._\-/]+\.(?:css|js|svg|png|webp|jpg))/g)) refs.add(m[1]);
}
let rotas = 0;
for (const r of [...refs].sort()) {
  if (!fs.existsSync(path.join(RAIZ, r.slice(1)))) { mal(`no existe: ${r}`); rotas++; }
}
if (!rotas) ok(`${refs.size} rutas, todas existen`);

// ── 4. Importaciones del frontend ────────────────────────────────────────────
console.log('\n== 4. importaciones del frontend ==');
let imp = 0;
for (const f of versionados.filter((x) => x.startsWith('frontend/src/'))) {
  const dir = path.dirname(path.join(RAIZ, f));
  for (const m of leer(f).matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    if (!fs.existsSync(path.resolve(dir, m[1]))) { mal(`${f} importa ${m[1]}, que no existe`); imp++; }
  }
}
if (!imp) ok('todas resuelven');

// ── 5. finanzas-page.js tiene que poder reejecutarse ─────────────────────────
// La sección se remonta al volver a /finanzas y el archivo se vuelve a evaluar.
// Un const/let de nivel superior deja su enlace en el ámbito léxico global, que
// NO se limpia al desmontar: la segunda evaluación lanza "already declared" y
// aborta el archivo entero. Engaña porque las globales de la primera siguen ahí
// y la página parece funcionar; solo faltan las gráficas.
console.log('\n== 5. finanzas-page.js reejecutable ==');
const cl = [...leer('assets/js/finanzas-page.js').matchAll(/^(const|let)[ \t]+([A-Za-z_$][\w$]*)/gm)];
if (cl.length) {
  for (const m of cl) mal(`"${m[2]}" es ${m[1]} de nivel superior; tiene que ser var`);
} else ok('sin const/let de nivel superior');

// ── 6. Colisión de globales entre los dos motores ────────────────────────────
console.log('\n== 6. colisión entre finanzas-page.js y finanzas-favro.js ==');
const decls = (t) => {
  const s = new Map();
  for (const m of t.matchAll(/^(?:async[ \t]+)?(function|const|let|var|class)[ \t]+([A-Za-z_$][\w$]*)/gm)) s.set(m[2], m[1]);
  return s;
};
const page = decls(leer('assets/js/finanzas-page.js'));
let ch = 0;
for (const [n, tipo] of decls(leer('assets/js/finanzas-favro.js'))) {
  if (!page.has(n)) continue;
  const otro = page.get(n);
  const seguro = ['var', 'function'].includes(tipo) && ['var', 'function'].includes(otro);
  if (!seguro) { mal(`"${n}": ${tipo} en favro y ${otro} en page — aborta el archivo`); ch++; }
}
if (!ch) ok('sin colisiones letales');

// ── 7. CSS balanceado ────────────────────────────────────────────────────────
// Una llave de más no da error: el navegador se recupera descartando en
// silencio la regla siguiente, y el fallo aparece como "un estilo que no aplica".
console.log('\n== 7. llaves del CSS ==');
function desbalance(css) {
  let prof = 0, linea = 1, com = false, cad = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '\n') { linea++; continue; }
    if (com) { if (c === '*' && css[i + 1] === '/') { com = false; i++; } continue; }
    if (cad) { if (c === '\\') { i++; continue; } if (c === cad) cad = null; continue; }
    if (c === '/' && css[i + 1] === '*') { com = true; i++; continue; }
    if (c === '"' || c === "'") { cad = c; continue; }
    if (c === '{') prof++;
    else if (c === '}' && --prof < 0) return { linea, tipo: 'cierre sobrante' };
  }
  return prof > 0 ? { linea: null, tipo: `faltan ${prof} cierres` } : null;
}
let ncss = 0;
for (const f of versionados.filter((x) => x.endsWith('.css') && !x.includes('vendor/'))) {
  const d = desbalance(leer(f));
  if (d) { mal(`${f}: ${d.tipo}${d.linea ? ` en la línea ${d.linea}` : ''}`); ncss++; }
}
if (!ncss) ok(`${versionados.filter((x) => x.endsWith('.css') && !x.includes('vendor/')).length} hojas balanceadas`);

// ── 8. HTML ──────────────────────────────────────────────────────────────────
console.log('\n== 8. HTML ==');
let nh = 0;
for (const f of versionados.filter((x) => x.endsWith('.html'))) {
  const t = leer(f);
  const a = (t.match(/<script/g) || []).length, b = (t.match(/<\/script/g) || []).length;
  if (a !== b) { mal(`${f}: ${a} <script> abiertos vs ${b} cerrados`); nh++; }
}
if (!nh) ok('etiquetas <script> equilibradas');

console.log(`\n${problemas === 0 ? '=== sin anomalías ===' : `=== ${problemas} anomalía(s) ===`}`);
process.exit(problemas === 0 ? 0 : 1);
