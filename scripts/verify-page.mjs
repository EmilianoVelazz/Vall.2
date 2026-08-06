/**
 * Verificador de páginas renderizadas.
 *
 * El login usa bcrypt y la contraseña real no está disponible en esta máquina,
 * así que en vez de teclearla se firma un JWT con el mismo JWT_SECRET que usa
 * el backend y se inyecta como cookie `vn_token`. Es exactamente el token que
 * emitiría /api/login, de modo que el auth-guard y ProtectedRoute lo aceptan.
 *
 * Uso:
 *   node scripts/verify-page.mjs /inicio [/finanzas ...]
 *
 * Por cada ruta reporta: errores de consola, peticiones fallidas, tamaño del
 * texto renderizado y un PNG en scripts/_verify/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const puppeteer = require('puppeteer');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, '..');
const SALIDA = path.join(__dirname, '_verify');
const ORIGEN = process.env.VERIFY_ORIGIN || 'http://localhost:5173';

// ── Credenciales desde backend/.env ───────────────────────────────────────────
function leerEnv() {
  const texto = fs.readFileSync(path.join(RAIZ, 'backend', '.env'), 'utf8');
  const vars = {};
  for (const linea of texto.split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return vars;
}

// El login debe poder verse sin sesión: con una sesión válida su comportamiento
// correcto es redirigir a /inicio, así que no se podría inspeccionar.
const sinSesion = process.argv.includes('--sin-sesion');
const rutas = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!rutas.length) {
  console.error('Uso: node scripts/verify-page.mjs /ruta [/otra ...]');
  process.exit(1);
}

const env = leerEnv();
if (!env.JWT_SECRET) {
  console.error('backend/.env no define JWT_SECRET; no se puede firmar la sesión de prueba.');
  process.exit(1);
}
const token = jwt.sign({ email: env.USER_EMAIL || 'admin@vall.com' }, env.JWT_SECRET, { expiresIn: '1h' });

fs.mkdirSync(SALIDA, { recursive: true });

const navegador = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

let fallos = 0;

for (const ruta of rutas) {
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: 1600, height: 1000 });

  const errores = [];
  const fallidas = [];
  pagina.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text().slice(0, 200));
  });
  pagina.on('pageerror', (e) => errores.push('PAGEERROR: ' + e.message.slice(0, 200)));
  pagina.on('requestfailed', (r) => {
    // Los proveedores externos fallan a menudo por CORS/red y no indican un
    // fallo de la migración; solo interesan los recursos del propio sitio.
    const u = r.url();
    if (u.startsWith(ORIGEN)) fallidas.push(`${r.failure()?.errorText} ${u.replace(ORIGEN, '')}`);
  });
  // Un 404 propio (imagen o CSS que ya no existe) sí importa; los de terceros no.
  pagina.on('response', (r) => {
    if (r.status() === 404 && r.url().startsWith(ORIGEN)) {
      fallidas.push(`404 ${r.url().replace(ORIGEN, '')}`);
    }
  });

  if (!sinSesion) {
    // La cookie del backend es httpOnly; se instala vía CDP antes de navegar.
    await pagina.setCookie({
      name: 'vn_token', value: token, domain: 'localhost', path: '/', httpOnly: true,
    });
    // ProtectedRoute lee sessionStorage, no la cookie: se siembra igual.
    await pagina.evaluateOnNewDocument((t, correo) => {
      sessionStorage.setItem('vn_auth', t);
      sessionStorage.setItem('vn_user', correo);
    }, token, env.USER_EMAIL || 'admin@vall.com');
  }

  const url = ORIGEN + ruta;
  let estado = 'ok';
  try {
    await pagina.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
  } catch (e) {
    estado = 'timeout de carga: ' + e.message.slice(0, 120);
  }
  // Margen para gráficas y datos. Estas páginas consultan varios proveedores
  // externos en cascada y tardan ~9 s en resolver; con 3,5 s se fotografiaban
  // siempre a medio cargar.
  await new Promise((r) => setTimeout(r, Number(process.env.VERIFY_ESPERA || 10000)));

  const info = await pagina.evaluate(() => {
    const raiz = document.getElementById('root');
    return {
      urlFinal: location.pathname,
      titulo: document.title,
      textoLen: (document.body.innerText || '').trim().length,
      nodos: raiz ? raiz.querySelectorAll('*').length : 0,
      canvas: document.querySelectorAll('canvas').length,
      // Un mojibake típico (UTF-8 leído como Latin-1) delata CSS/HTML mal servido.
      mojibake: (document.body.innerText.match(/Ã.|â€./g) || []).length,
    };
  });

  const archivo = path.join(SALIDA, ruta.replace(/\//g, '_').replace(/^_/, '') || 'raiz');
  await pagina.screenshot({ path: archivo + '.png', fullPage: false });

  const malo = estado !== 'ok' || info.textoLen < 200 || errores.length > 0;
  if (malo) fallos++;
  console.log(`\n${malo ? 'FALLA' : 'OK   '}  ${ruta}  →  ${info.urlFinal}`);
  console.log(`   titulo="${info.titulo}"  texto=${info.textoLen}  nodos=${info.nodos}  canvas=${info.canvas}  mojibake=${info.mojibake}`);
  if (estado !== 'ok') console.log('   estado: ' + estado);
  if (errores.length) console.log('   consola: ' + errores.slice(0, 6).join(' | '));
  if (fallidas.length) console.log('   recursos: ' + [...new Set(fallidas)].slice(0, 6).join(' | '));
  console.log('   captura: ' + path.relative(RAIZ, archivo + '.png'));

  await pagina.close();
}

await navegador.close();
console.log(`\n${fallos === 0 ? 'Todas las rutas pasaron.' : fallos + ' ruta(s) con problemas.'}`);
process.exit(fallos === 0 ? 0 : 1);
