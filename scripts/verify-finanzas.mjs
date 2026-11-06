/**
 * Recorrido funcional de /finanzas en React.
 *
 * verify-page.mjs solo comprueba que la ruta pinta algo. Aquí se ejercita lo
 * que de verdad puede romper al migrar esta página: los manejadores en línea
 * ahora son onClick={(e) => window.finTab(...)}, así que si una global no
 * quedó colgada de window el botón no hace nada y NO se ve ningún error.
 * También se sale de la sección y se vuelve, que es donde aparecen las fugas
 * de ciclo de vida (intervalos que siguen vivos, scripts que no se reejecutan).
 *
 * Uso: node scripts/verify-finanzas.mjs
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
const ORIGEN = process.env.VERIFY_ORIGIN || 'http://localhost:5273';

const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, 'backend', '.env'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, '')])
);
const token = jwt.sign({ email: env.USER_EMAIL || 'admin@vall.com' }, env.JWT_SECRET, { expiresIn: '1h' });

const navegador = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const pagina = await navegador.newPage();
await pagina.setViewport({ width: 1600, height: 1000 });

const errores = [];
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 160)); });
pagina.on('pageerror', (e) => errores.push('PAGEERROR: ' + e.message.slice(0, 160)));

await pagina.setCookie({ name: 'vn_token', value: token, domain: 'localhost', path: '/', httpOnly: true });
await pagina.evaluateOnNewDocument((t, correo) => {
  sessionStorage.setItem('vn_auth', t);
  sessionStorage.setItem('vn_user', correo);
}, token, env.USER_EMAIL || 'admin@vall.com');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

await pagina.goto(ORIGEN + '/finanzas', { waitUntil: 'networkidle2', timeout: 45000 });
await esperar(9000);

let fallos = 0;
const linea = (ok, txt) => { if (!ok) fallos++; console.log(`  ${ok ? 'ok  ' : 'FALLA'}  ${txt}`); };

// ── 1. Las globales que el marcado invoca por nombre ─────────────────────────
console.log('\n== globales que los onClick necesitan ==');
const GLOBALES = [
  'finTab', 'openFxDetail', 'openFxSectionReport', 'setFinInt', 'setFinChartType',
  'setGlobalBondRegion', 'setCountryFactsheet', 'setCapitalView', 'setEnergyDriver',
  'setFxChartType', 'rdsSwitchTab', 'ncFilter', 'ncMove', 'reportCardKey',
  'refreshCurrentFinanceSection', 'updateEnergyScenario', 'ensureFinanceSection', 'refreshAll',
];

/* Estas ocho las invoca el marcado (~45 onclick) pero NO están definidas en
   ninguna parte del proyecto, ni antes ni después de migrar: se comprobó contra
   el HTML anterior a la extracción. Es decir, abrir el detalle de un bono
   soberano, de una fila de riesgo o de una tarjeta de factores lleva roto desde
   siempre — el propio código lo sospecha y en finanzas-page.js:2161 ya consulta
   `typeof openBondDetail === 'function'` antes de llamarla.
   Se listan aparte para que su ausencia no se confunda con una regresión, y
   para que el día que se implementen se pueda mover a la lista de arriba. */
const NUNCA_EXISTIERON = [
  'openBondDetail', 'openRiskDetail', 'openPetroDetail', 'openCreditDetail',
  'openMacroDetail', 'openEquityInstitutionalReport', 'openEquityVixReport',
  'openEquitySummaryReport',
];

const faltan = await pagina.evaluate((n) => n.filter((f) => typeof window[f] !== 'function'), GLOBALES);
linea(faltan.length === 0, faltan.length ? `faltan en window: ${faltan.join(', ')}` : `las ${GLOBALES.length} que el marcado necesita están en window`);

const revividas = await pagina.evaluate((n) => n.filter((f) => typeof window[f] === 'function'), NUNCA_EXISTIERON);
console.log(`  nota   ${NUNCA_EXISTIERON.length - revividas.length} funciones de detalle siguen sin existir (bug previo a la migración, no regresión)`);

// ── 2. Recorrido de secciones ────────────────────────────────────────────────
console.log('\n== recorrido de secciones ==');
const medir = () => pagina.evaluate(() => {
  const visible = (el) => el && el.offsetParent !== null;
  return {
    texto: (document.body.innerText || '').trim().length,
    canvas: document.querySelectorAll('canvas').length,
    paneles: ['fin-layout-wrap', 'fx-pro-panel', 'news-pro-panel', 'bvmx-panel', 'bonds-panel']
      .filter((id) => visible(document.getElementById(id))),
  };
});

for (const tab of ['general', 'mercados', 'bonos', 'mexico', 'noticias']) {
  await pagina.evaluate((t) => window.finTab(t, document.querySelector(`.fin-tab-card[data-tab="${t}"]`)), tab);
  await esperar(3500);
  const m = await medir();
  linea(m.texto > 400, `${tab.padEnd(9)} texto=${String(m.texto).padEnd(6)} canvas=${String(m.canvas).padEnd(4)} visibles=[${m.paneles.join(', ')}]`);
}

console.log('\n== accesos rápidos de la línea del tiempo ==');
await pagina.evaluate(() => window.finTab('bonos', document.querySelector('.fin-tab-card[data-tab="bonos"]')));
await esperar(800);
const shortcutBase = await pagina.evaluate(() => ({
  countries: [...document.querySelectorAll('#rtl-country option')].map(option => option.value),
  shortcuts: document.querySelectorAll('.debt-country-card[data-bond-country]').length,
}));
linea(shortcutBase.countries.includes('mx'), 'México aparece en la gráfica histórica');
linea(shortcutBase.shortcuts === 11, 'los once recuadros superiores son accesos por país');
await pagina.click('.debt-country-card[data-bond-country="cn"]');
const chinaActive = await pagina.evaluate(() => ({
  country: document.getElementById('rtl-country')?.value,
  pressed: document.querySelector('.debt-country-card[data-bond-country="cn"]')?.getAttribute('aria-pressed'),
}));
linea(chinaActive.country === 'cn' && chinaActive.pressed === 'true', 'China actualiza y queda resaltada');
await pagina.evaluate(() => document.getElementById('bond-shortcut-us-value')?.closest('article')?.click());
const treasuryActive = await pagina.evaluate(() => ({
  country: document.getElementById('rtl-country')?.value,
  series: document.getElementById('rtl-series')?.value,
}));
linea(treasuryActive.country === 'us' && treasuryActive.series === '^TNX', 'Treasury 10Y funciona como atajo al histórico');

console.log('\n== mapa mundial de bonos ==');
await pagina.evaluate(() => window.finTab('bonos', document.querySelector('.fin-tab-card[data-tab="bonos"]')));
await esperar(1200);
const bondMapBase = await pagina.evaluate(() => ({
  svg: !!document.querySelector('#fbm-map-canvas svg'),
  markets: document.querySelectorAll('#fbm-map-canvas .fbm-country.has-data').length,
  markers: document.querySelectorAll('#fbm-map-canvas .fbm-marker').length,
  mexico: !!document.querySelector('#fbm-map-canvas [data-fbm-key="mx"]'),
  mexicoOption: !!document.querySelector('#fbm-country option[value="mx"]'),
  selected: document.getElementById('fbm-country')?.value,
  sidePanel: !!document.getElementById('fbm-detail'),
  mapWidth: document.getElementById('fbm-map-wrap')?.getBoundingClientRect().width || 0,
  workspaceWidth: document.querySelector('.fbm-workspace')?.getBoundingClientRect().width || 1,
}));
linea(bondMapBase.svg, 'la cartografía soberana se renderiza');
linea(bondMapBase.markets >= 18 && bondMapBase.markers >= 18,
  `cobertura 10A: ${bondMapBase.markets} territorios y ${bondMapBase.markers} marcadores`);
linea(bondMapBase.mexico && bondMapBase.mexicoOption,
  'México está disponible en el mapa soberano y en su selector');
linea(!bondMapBase.sidePanel && bondMapBase.mapWidth / bondMapBase.workspaceWidth > .98,
  'el mapa ocupa todo el ancho, sin panel lateral permanente');

const fixedMaturityMap = await pagina.evaluate(() => ({
  controls: document.querySelectorAll('[data-fbm-maturity]').length,
  label: document.querySelector('#bond-world-map .fbm-fixed-maturity')?.innerText || '',
  aria: document.querySelector('#fbm-map-canvas svg')?.getAttribute('aria-label') || '',
}));
linea(fixedMaturityMap.controls === 0 && /10 años/i.test(fixedMaturityMap.label) && /10 años/i.test(fixedMaturityMap.aria),
  'el mapa queda fijo a 10 años y no muestra controles de plazo');

await pagina.click('[data-fbm-filter="americas"]');
const americasMap = await pagina.evaluate(() => ({
  active: document.querySelector('[data-fbm-filter="americas"]')?.getAttribute('aria-pressed'),
  visible: document.querySelectorAll('#fbm-map-canvas .fbm-marker:not(.is-filtered)').length,
  status: document.getElementById('fbm-filter-status')?.innerText || '',
}));
linea(americasMap.active === 'true' && americasMap.visible === 4 && /4 de 19/i.test(americasMap.status),
  'el filtro de Américas reduce y comunica la cobertura');
await pagina.click('[data-fbm-filter="all"]');

await pagina.click('[data-fbm-zoom="in"]');
const zoomedMap = await pagina.evaluate(() => ({
  zoom: document.getElementById('fbm-map-stage')?.dataset.zoom,
  output: document.getElementById('fbm-zoom-value')?.innerText,
  outDisabled: document.querySelector('[data-fbm-zoom="out"]')?.disabled,
}));
linea(zoomedMap.zoom === '1.2' && zoomedMap.output === '120%' && !zoomedMap.outDisabled,
  'los controles acercan el mapa y actualizan su estado');
await pagina.click('[data-fbm-zoom="reset"]');

await pagina.hover('.fbm-marker[data-fbm-key="br"]');
const hoverMap = await pagina.evaluate(() => ({
  visible: !document.getElementById('fbm-hover-tip')?.hidden,
  text: document.getElementById('fbm-hover-tip')?.innerText || '',
  previewed: document.querySelectorAll('#fbm-map-canvas [data-fbm-key="br"].is-previewed').length,
  legendMin: document.getElementById('fbm-legend-min')?.innerText,
  legendMax: document.getElementById('fbm-legend-max')?.innerText,
}));
linea(hoverMap.visible && /Brasil/i.test(hoverMap.text) && /%/.test(hoverMap.text) && hoverMap.previewed === 2,
  'la ficha rápida aparece al explorar un país');
linea(/%/.test(hoverMap.legendMin || '') && /%/.test(hoverMap.legendMax || ''),
  'la leyenda comunica el rango real del vencimiento');

await pagina.evaluate(() => document.querySelector('.fbm-marker[data-fbm-key="br"]')?.dispatchEvent(new MouseEvent('click', { bubbles:true })));
const pinnedMap = await pagina.evaluate(() => ({
  tip: document.getElementById('fbm-hover-tip')?.classList.contains('is-pinned'),
  chipRemoved: !document.getElementById('fbm-selection-chip'),
  text: document.getElementById('fbm-hover-tip')?.innerText || '',
}));
linea(pinnedMap.tip && pinnedMap.chipRemoved && /Brasil/i.test(pinnedMap.text),
  'el clic fija la ficha sin mostrar el indicador de selección');
await pagina.evaluate(() => document.querySelector('.fbm-marker[data-fbm-key="br"]')?.dispatchEvent(new MouseEvent('click', { bubbles:true })));
const releasedMap = await pagina.evaluate(() => ({
  hidden: document.getElementById('fbm-hover-tip')?.hidden,
}));
linea(releasedMap.hidden, 'un segundo clic suelta la ficha');

// ── 3. Salir y volver: ciclo de vida ─────────────────────────────────────────
//
// SIEMPRE con clics, NUNCA con page.goto(). Una navegación de puppeteer recarga
// el documento y reinicia el ámbito léxico global, que es justo donde vive el
// fallo que esta sección busca: un const/let de nivel superior en
// finanzas-page.js hace que la SEGUNDA ejecución lance "already declared" y
// aborte el archivo entero. Con goto() eso no ocurre nunca y la prueba pasaba
// dando una falsa tranquilidad — pasó de verdad con _fxHistoryNoteTimer.
console.log('\n== unificacion visual de mapas ==');
await pagina.evaluate(() => document.querySelector('[data-detail-module="bolsa"]')?.click());
await esperar(900);
const unifiedMaps = await pagina.evaluate(() => {
  const stock = document.getElementById('ff-world-map');
  const bond = document.getElementById('bond-world-map');
  const css = el => el ? getComputedStyle(el) : null;
  const stockStyle = css(stock);
  const bondStyle = css(bond);
  const stockHead = css(stock?.querySelector('.ffwm-head'));
  const bondHead = css(bond?.querySelector('.fbm-header'));
  const stockMap = css(stock?.querySelector('.ffwm-map'));
  const bondMap = css(bond?.querySelector('.fbm-map-wrap'));
  const stockToolbar = css(stock?.querySelector('.ffwm-toolbar'));
  const bondToolbar = css(bond?.querySelector('.fbm-toolbar'));
  const stockFooter = css(stock?.querySelector('.ffwm-footer'));
  const bondFooter = css(bond?.querySelector('.fbm-footer'));
  return {
    visible: stock?.offsetParent !== null,
    radius: [stockStyle?.borderRadius, bondStyle?.borderRadius],
    background: [stockStyle?.backgroundColor, bondStyle?.backgroundColor],
    headerPadding: [stockHead?.padding, bondHead?.padding],
    mapBackground: [stockMap?.backgroundImage, bondMap?.backgroundImage],
    toolbar: [stockToolbar?.display, bondToolbar?.display, stockToolbar?.padding, bondToolbar?.padding],
    footer: [stockFooter?.display, bondFooter?.display, stockFooter?.padding, bondFooter?.padding],
    tools: css(stock?.querySelector('.ffwm-map-tools'))?.display,
    chipRemoved: !document.getElementById('ffwm-selection-chip'),
  };
});
linea(unifiedMaps.visible, 'el mapa de Bolsa abre dentro de su apartado');
linea(unifiedMaps.radius[0] === unifiedMaps.radius[1]
  && unifiedMaps.background[0] === unifiedMaps.background[1]
  && unifiedMaps.headerPadding[0] === unifiedMaps.headerPadding[1]
  && unifiedMaps.mapBackground[0] === unifiedMaps.mapBackground[1]
  && unifiedMaps.toolbar[0] === unifiedMaps.toolbar[1]
  && unifiedMaps.toolbar[2] === unifiedMaps.toolbar[3]
  && unifiedMaps.footer[0] === unifiedMaps.footer[1]
  && unifiedMaps.footer[2] === unifiedMaps.footer[3],
  'Bolsa y Bonos comparten superficie, encabezado, barra, lienzo y pie');
linea(unifiedMaps.tools === 'flex' && unifiedMaps.chipRemoved,
  'Bolsa usa los mismos controles sin indicador flotante de seleccion');
const firstStockMarker = await pagina.$('#ffwm-map .ffwm-marca[data-pais]');
if (firstStockMarker) await firstStockMarker.hover();
const stockHover = await pagina.evaluate(() => ({
  visible: !document.getElementById('ffwm-tip')?.hidden,
}));
linea(stockHover.visible,
  'el hover de Bolsa conserva la ficha flotante contextual');
await pagina.screenshot({ path: path.join(__dirname, '_verify', 'finanzas-mapa-bolsa.png') });
await pagina.evaluate(() => document.getElementById('ff-back-overview')?.click());
await esperar(500);

console.log('\n== salir a /inicio y volver (navegando por la SPA) ==');
const antesErr = errores.length;

/* Marca para distinguir una navegación de la SPA de una recarga completa: si
   sobrevive, no hubo recarga y el remontaje se ejercitó de verdad. */
await pagina.evaluate(() => { window.__vnMarcaSpa = 1; });

await pagina.click('a[href="/inicio"]');
await esperar(3000);
const enInicio = await pagina.evaluate(() => ({
  ruta: location.pathname,
  favro: !!window.VNFavro,
  finanzas: !!window.VNFinanzas,
}));
linea(enInicio.ruta === '/inicio', `navegó a ${enInicio.ruta}`);
linea(!enInicio.favro && !enInicio.finanzas,
  `al salir se soltaron los motores (VNFavro=${enInicio.favro}, VNFinanzas=${enInicio.finanzas})`);

await pagina.click('a[href="/finanzas"]');
await esperar(9000);
const sinRecarga = await pagina.evaluate(() => window.__vnMarcaSpa === 1);
linea(sinRecarga, 'la ida y vuelta fue por la SPA, sin recargar el documento');

const alVolver = await medir();
linea(alVolver.texto > 400, `al volver: texto=${alVolver.texto} canvas=${alVolver.canvas}`);

/* Que finTab exista NO prueba nada: si la reejecución aborta, las globales de
   la primera siguen colgadas de window. Lo que delata el aborto es que las
   gráficas no se reconstruyan y el "already declared" en consola. */
const declarado = errores.filter((e) => /already been declared/i.test(e));
linea(declarado.length === 0,
  declarado.length ? `reejecución abortada: ${declarado[0]}` : 'la reejecución no choca con declaraciones previas');
linea(alVolver.canvas >= 90, `las gráficas se reconstruyeron (canvas=${alVolver.canvas})`);

// ── 4. Errores de consola ────────────────────────────────────────────────────
console.log('\n== consola ==');
/* Errores que ya daba la página antes de migrarla: endpoints del backend que
   devuelven 404 o cuelgan, y una variable que nunca se declaró. Ver la memoria
   del proyecto sobre los bugs vivos de finanzas. */
const CONOCIDOS = /_macroIntData|exchange-rates|banxico|Failed to load resource|gdelt|finnhub|alphavantage|stock-history|loadBitcoinDominance|HTTP 404|HTTP 429|El cruce principal no devolvió datos|signal is aborted without reason/;
const nuevos = [...new Set(errores)].filter((e) => !CONOCIDOS.test(e));
linea(nuevos.length === 0, nuevos.length ? `errores nuevos:\n      ${nuevos.join('\n      ')}` : 'solo los errores de backend ya conocidos');
console.log(`  (${errores.length} errores en total, ${errores.length - antesErr} tras la renavegación)`);

await pagina.evaluate(() => window.finTab('bonos', document.querySelector('.fin-tab-card[data-tab="bonos"]')));
await esperar(500);
await pagina.evaluate(() => document.getElementById('bond-world-map')?.scrollIntoView({ block: 'center' }));
await esperar(800);
await pagina.screenshot({ path: path.join(__dirname, '_verify', 'finanzas-recorrido.png') });
await navegador.close();

console.log(`\n${fallos === 0 ? 'TODO PASA.' : fallos + ' comprobación(es) con problemas.'}`);
process.exit(fallos === 0 ? 0 : 1);
