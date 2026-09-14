/**
 * Comprueba el modo oscuro en todas las rutas.
 *
 * No basta con mirar una captura: lo que rompe un tema generado son los
 * "islotes" — bloques que se quedaron claros porque su color venía de un
 * degradado o de un !important que no se cubrió. Aquí se recorre el DOM
 * visible, se mide la luminancia real de cada bloque grande y se listan los
 * que siguen siendo claros, que es la lista de trabajo pendiente.
 *
 * Uso: node scripts/verify-dark.mjs [/ruta ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const puppeteer = require('puppeteer');

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(RAIZ, 'scripts/_verify');
const ORIGEN = process.env.VERIFY_ORIGIN || 'http://localhost:5273';

const rutas = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const RUTAS = rutas.length ? rutas
  : ['/inicio', '/finanzas', '/mercados', '/geopolitica', '/mexico', '/mercado-proteinas', '/vall-ai', '/configuracion'];

const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, 'backend/.env'), 'utf8').split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, '')])
);
const token = jwt.sign({ email: env.USER_EMAIL }, env.JWT_SECRET, { expiresIn: '1h' });
fs.mkdirSync(SALIDA, { recursive: true });

const nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let problemas = 0;

for (const ruta of RUTAS) {
  const p = await nav.newPage();
  await p.setViewport({ width: 1600, height: 1000 });
  await p.setCookie({ name: 'vn_token', value: token, domain: 'localhost', path: '/', httpOnly: true });
  await p.evaluateOnNewDocument((t, c) => {
    sessionStorage.setItem('vn_auth', t);
    sessionStorage.setItem('vn_user', c);
    localStorage.setItem('vn_theme', 'dark');     // el tema, antes de pintar
  }, token, env.USER_EMAIL);

  await p.goto(ORIGEN + ruta, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 9000));

  const r = await p.evaluate(() => {
    const rgba = (c) => {
      const m = (c || '').match(/[\d.]+/g);
      if (!m || m.length < 3) return null;
      return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] };
    };
    const lumDe = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

    /* Luminancia relativa de WCAG (canales linealizados). La aproximación
       anterior sobre los valores en bruto daba cifras que no se podían
       comparar con ningún criterio; con esta, el umbral 3.0 es el AA de texto
       grande y el 4.5 el de texto normal. */
    const lumRel = ({ r, g, b }) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const contraste = (a, b) => {
      const [x, y] = [lumRel(a), lumRel(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };

    /* El fondo REAL de un nodo es el resultado de componer su color sobre el de
       sus ancestros. Sin esto, una insignia con rgba(239,68,68,.12) se mide
       como rojo sólido cuando en pantalla es casi el fondo del panel — daba
       decenas de falsos positivos de contraste. */
    const fondoEfectivo = (el) => {
      const capas = [];
      for (let p = el; p; p = p.parentElement) {
        const c = rgba(getComputedStyle(p).backgroundColor);
        if (!c || c.a === 0) continue;
        capas.push(c);
        if (c.a >= 1) break;
      }
      if (!capas.length) return null;
      let out = capas[capas.length - 1];
      for (let i = capas.length - 2; i >= 0; i--) {
        const s = capas[i];
        out = {
          r: s.r * s.a + out.r * (1 - s.a),
          g: s.g * s.a + out.g * (1 - s.a),
          b: s.b * s.a + out.b * (1 - s.a),
          a: 1,
        };
      }
      return out;
    };

    const lum = (c) => {
      const p = rgba(c);
      return !p || p.a === 0 ? null : lumDe(p);
    };
    const nombre = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
      + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');

    const claros = [];
    const ilegibles = [];

    document.querySelectorAll('body *').forEach((el) => {
      if (el.offsetParent === null) return;
      const caja = el.getBoundingClientRect();
      const s = getComputedStyle(el);

      // Umbral bajo de alto: las cintas de cotización miden ~28 px y con el
      // filtro anterior se colaban sin revisar.
      if (caja.width >= 200 && caja.height >= 22) {
        const L = lum(s.backgroundColor);
        // Las imágenes de fondo son fotografías: no son un fallo del tema.
        if (L !== null && L >= 150 && !s.backgroundImage.includes('url(')) {
          claros.push({ sel: nombre(el), bg: s.backgroundColor, lum: Math.round(L), area: Math.round(caja.width * caja.height / 1000) });
        }
      }

      /* Contraste de texto: lo que de verdad se nota en un tema generado no es
         un fondo claro suelto, sino texto oscuro que se quedó sobre fondo
         oscuro. Solo se miran nodos con texto propio y fondo resuelto. */
      const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
      if (!propio || caja.height < 8) return;
      const tinta = rgba(s.color);
      if (!tinta || tinta.a === 0) return;
      const fondo = fondoEfectivo(el);
      if (!fondo) return;
      // 3.0 es el AA de WCAG para texto grande; por debajo de eso no hay
      // tamaño que lo salve sobre un fondo oscuro.
      const ratio = contraste(tinta, fondo);
      if (ratio < 3.0) {
        ilegibles.push({
          sel: nombre(el), color: s.color,
          lum: Math.round(lumDe(tinta)), fondo: Math.round(lumDe(fondo)),
          ratio: ratio.toFixed(2),
        });
      }
    });
    claros.sort((a, b) => b.area - a.area);
    return {
      tema: document.documentElement.getAttribute('data-theme'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bodyColor: getComputedStyle(document.body).color,
      hojaTema: !!document.querySelector('link[data-vn-dark]'),
      posicionHoja: [...document.head.children].findIndex((e) => e.dataset?.vnDark) + 1,
      totalHead: document.head.children.length,
      claros: claros.slice(0, 6),
      nClaros: claros.length,
      ilegibles: ilegibles.slice(0, 6),
      nIlegibles: ilegibles.length,
    };
  });

  const ok = r.tema === 'dark' && r.hojaTema && r.nClaros === 0 && r.nIlegibles === 0;
  if (!ok) problemas++;
  console.log(`\n${ok ? 'OK   ' : 'REVISAR'}  ${ruta}`);
  console.log(`   tema=${r.tema}  hoja=${r.hojaTema ? `sí (posición ${r.posicionHoja}/${r.totalHead})` : 'NO CARGADA'}`);
  console.log(`   body bg=${r.bodyBg}  color=${r.bodyColor}`);
  if (r.nClaros) {
    console.log(`   ${r.nClaros} bloque(s) siguen claros:`);
    for (const c of r.claros) console.log(`      lum=${String(c.lum).padStart(3)} area=${String(c.area).padStart(4)}k  ${c.sel.slice(0, 52)}  ${c.bg}`);
  }
  if (r.nIlegibles) {
    console.log(`   ${r.nIlegibles} texto(s) sin contraste:`);
    for (const t of r.ilegibles) console.log(`      ratio=${t.ratio} tinta=${String(t.lum).padStart(3)} fondo=${String(t.fondo).padStart(3)}  ${t.sel.slice(0, 52)}`);
  }

  await p.screenshot({ path: path.join(SALIDA, 'dark' + ruta.replace(/\//g, '_') + '.png') });
  await p.close();
}

await nav.close();
console.log(`\n${problemas === 0 ? 'Todas las rutas en oscuro, sin islotes claros.' : problemas + ' ruta(s) con bloques claros pendientes.'}`);
process.exit(problemas === 0 ? 0 : 1);
