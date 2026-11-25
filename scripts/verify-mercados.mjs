/*
 * Comprueba de una pasada que la sección Mercados sigue entera.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * Esta sección se rompe por sitios que no se ven al mirarla de frente, y ya ha
 * pasado tres veces seguidas:
 *
 *   · El tema generado (`dark-theme.css`) emitió un `background-image ... !important`
 *     sobre `.grain-hero` y se llevó por delante la FOTOGRAFÍA de los recuadros
 *     de título de Granos, Energía y Proteínas. Solo se veía con
 *     `data-theme="dark"` en la raíz, así que una revisión normal no lo notaba.
 *   · La sala de Noticias dependía de UNA llamada; cuando fallaba, la sección
 *     entera se quedaba en blanco.
 *   · El carrusel movía la clase «activa» pero no desplazaba la tira, y el pulso
 *     tenía el aro de agarre sin `pointer-events`, así que no se podía pulsar.
 *
 * Ninguna de las tres daba error en consola. Por eso esto no mira si «carga»:
 * mira si cada pieza HACE LO SUYO.
 *
 * Uso:   node scripts/verify-mercados.mjs [http://localhost:5273]
 * Sale con código 1 si algo falla, para poder encadenarlo.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5273';

let fallos = 0;
const ok = (cond, txt, detalle = '') => {
  if (!cond) fallos++;
  console.log(`  ${cond ? 'OK  ' : 'FALLA'} ${txt}${detalle ? `  ${detalle}` : ''}`);
};

const nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

/** Abre una pestaña de Mercados ya autenticada. `tema` fuerza data-theme. */
async function abrir(tab, { tema = null } = {}) {
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript(({ t }) => {
    try {
      sessionStorage.setItem('vn_auth', '1');
      sessionStorage.setItem('vn_user', 'verificacion@vallnews.test');
      localStorage.setItem('mkt_active_tab', t);
    } catch { /* Ignora iframes sandboxed sin allow-same-origin */ }
  }, { t: tab });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  await p.route('**/api/verify-token*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, email: 'verificacion@vallnews.test' }),
  }));
  await p.route('**/api/profile*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, profile: { email: 'verificacion@vallnews.test', role: 'user', preferences: {} } }),
  }));
  await p.goto(`${BASE}/mercados`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.grain-hero, .energy-hero, .protein-hero', { timeout: 15000 }).catch(() => {});
  if (tema) await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
  await new Promise((r) => setTimeout(r, 5000));
  return {
    p,
    errores,
    cerrar: () => ctx.close(),
  };
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. Los recuadros de título conservan su fotografía ──────────────────────
console.log('\n1 · Recuadros de título (la foto de la portada)');
for (const tema of [null, 'dark']) {
  for (const [tab, sel, nombre] of [
    ['granos', '.grain-hero', 'Granos'],
    ['industriales', '.energy-hero', 'Energía'],
    ['proteinas', '.protein-hero', 'Proteínas'],
  ]) {
    const { p, errores, cerrar } = await abrir(tab, { tema });
    const foto = await p.evaluate((s) => {
      const e = document.querySelector(s);
      return e ? /url\(/.test(getComputedStyle(e).backgroundImage) : null;
    }, sel);
    ok(foto === true, `${nombre.padEnd(10)} con data-theme=${String(tema)}`, foto === null ? '(hero no visible)' : '');
    if (tema === null) ok(errores.length === 0, `${nombre.padEnd(10)} sin errores de runtime`, errores.join(' | '));
    await cerrar();
  }
}

// Nota: la antigua pestaña «Sala de Noticias» migró fuera de /mercados hacia
// /finanzas y /noticias (verificada por npm run test:news y verify-finanzas.mjs).
// Aquí se validan los módulos activos de Mercados: granos, energía y proteínas.

/* ── 5. La línea de tiempo del mapa de Proteínas ────────────────────────────
   Está aquí por lo mismo que el resto: puede romperse sin dar un solo error.
   Si `datosDe` dejara de recibir el año, el control seguiría moviéndose y el
   mapa se quedaría clavado en 2023 — y eso, mirándolo de frente, se ve igual
   que un mapa que funciona. Lo que se comprueba es que el RELLENO cambie. */
console.log('\n5 · Mapa de Proteínas · línea de tiempo');
{
  const { p, cerrar } = await abrir('proteinas');
  const banda = () => p.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('.gm-paises path[data-ne]')]
      .map((e) => [e.dataset.ne, e.getAttribute('class')]),
  ));
  const anio = () => p.$eval('.gm-tiempo-anio', (e) => e.textContent);

  const monta = await p.evaluate(() => {
    const b = document.querySelector('.gm-tiempo-barra');
    return b ? { max: b.max, valor: b.value, play: Boolean(document.querySelector('.gm-tiempo-play')) } : null;
  });
  ok(monta !== null, 'el control se monta');
  ok(monta?.play === true && Number(monta?.max) > 0, 'con botón de reproducir y barra de varios pasos', `max=${monta?.max}`);

  /* Abre por el último año MEDIDO, que no es el último de la serie: 2024 y 2025
     son estimaciones encadenadas y pintan la mitad de países. Si algún día el
     mapa arrancara en un año estimado, la primera impresión de la sección sería
     un planisferio medio gris — y eso no da ningún error. */
  ok((await anio()) === '2023', 'abre por el último año MEDIDO, no por el final de la serie', `→ ${await anio()}`);
  const marcados = await p.evaluate(() => [...document.querySelectorAll('.gm-tiempo-extremos .es-estimado')].map((e) => e.textContent));
  ok(marcados.join(',') === '2024,2025', 'los años estimados van marcados en la barra', `→ ${marcados.join(', ') || 'ninguno'}`);
  ok(!(await p.$('.gm-tiempo-nota')), 'y el cartel de estimación NO sale en un año medido');

  const en2023 = await banda();
  // Con el teclado: es interacción real y no depende de dónde caiga el tirador.
  await p.focus('.gm-tiempo-barra');
  await p.keyboard.press('Home');
  await pausa(800);
  const en2010 = await banda();

  ok((await anio()) === '2010', 'Inicio lleva al primer año', `→ ${await anio()}`);
  const movidos = Object.keys(en2023).filter((k) => en2023[k] !== en2010[k]);
  ok(movidos.length > 0, 'el relleno del mapa cambia con el año', `${movidos.length} países cambian de banda`);
  ok(/2010/.test(await p.$eval('.gm-escala-lbl em', (e) => e.textContent)), 'la leyenda rotula el año que se ve');

  /* Se para SOLA al llegar al final. En bucle, el bloque quedaría animándose
     detrás de quien intenta leer la ficha de un país. */
  await p.click('.gm-tiempo-play');
  await pausa(2500);
  ok(await p.$eval('.gm-tiempo-play', (e) => e.className.includes('is-jugando')), 'reproducir avanza los años');
  await pausa(14000);
  ok((await anio()) === '2025' && await p.$eval('.gm-tiempo-play', (e) => !e.className.includes('is-jugando')),
    'termina en el final de la serie y se detiene sola', `→ ${await anio()}`);

  /* Al pararse queda en 2025, que es estimado: es el momento exacto en el que
     el aviso TIENE que estar en pantalla. */
  const nota = await p.evaluate(() => document.querySelector('.gm-tiempo-nota')?.textContent || '');
  ok(/estimaci[óo]n/i.test(nota), 'en un año estimado sale el cartel que lo dice', `"${nota.slice(0, 70)}…"`);
  await cerrar();
}

/* ── 6. «Lo que come una persona» ───────────────────────────────────────────
   Lo que se vigila aquí es el fallo que no da error: que el color deje de ir
   con la proteína. Si algún día alguien ordena los tramos por tamaño «para que
   se vea mejor», el cerdo dejará de ser azul en cuanto se cambie de país, y
   quien haya aprendido el color estará leyendo mal el siguiente — sin que nada
   falle ni se vea raro en una captura. */
console.log('\n6 · Lo que come una persona · dónut por país');
{
  const { p, cerrar } = await abrir('proteinas');
  const leer = () => p.evaluate(() => ({
    total: document.querySelector('.cp-total strong')?.textContent || '',
    orden: [...document.querySelectorAll('.cp-desglose li span')].map((l) => l.textContent),
    tramos: [...document.querySelectorAll('.cp-tramo')].map((t) => t.getAttribute('stroke')),
    pcts: [...document.querySelectorAll('.cp-desglose li b')].map((b) => parseFloat(b.textContent)),
  }));

  const mx = await leer();
  ok(mx.tramos.length === 4, 'el dónut monta con sus cuatro tramos', `(${mx.tramos.length})`);
  ok(mx.orden.length === 4, 'y el desglose los repite con nombre y cifra', `(${mx.orden.join(', ')})`);
  /* El desglose es la leyenda Y la vista de tabla: sin él, el reparto solo se
     podría leer por el color, que es lo que no puede pasar. */
  ok(Math.abs(mx.pcts.reduce((s, v) => s + v, 0) - 100) <= 2, 'los porcentajes suman 100', `(${mx.pcts.join('+')})`);
  ok(/^\d/.test(mx.total), 'la cifra por persona sale', `→ ${mx.total}`);

  await p.selectOption('.cp-selector select', 'Argentina');
  await pausa(700);
  const ar = await leer();
  ok(ar.total !== mx.total, 'cambiar de país cambia el dato', `${mx.total} → ${ar.total}`);
  ok(ar.orden.join() === mx.orden.join() && ar.tramos.join() === mx.tramos.join(),
    'pero NO repinta: cada proteína conserva su color', `${ar.tramos.join(' ')}`);
  await cerrar();
}

/* ── 7. «De qué parte del animal» ───────────────────────────────────────────
   Aquí lo que se vigila es una tentación, no un bug: que alguien haga que el
   reparto por cortes cambie con el país. No existe esa serie en ninguna fuente
   —ni FAO ni USDA—, así que un reparto que cambiase de país sería inventado, y
   se vería perfectamente normal en pantalla. El porcentaje TIENE que ser el
   mismo en todas partes y el cartel que lo dice tiene que estar. */
console.log('\n7 · De qué parte del animal · despiece');
{
  const { p, cerrar } = await abrir('proteinas');
  const leer = () => p.evaluate(() => {
    const s = document.querySelector('.ca-canal');
    if (!s) return null;
    return {
      especie: s.querySelector('.ca-especies .is-activo')?.textContent.trim(),
      kg: s.querySelector('.ca-silueta strong')?.textContent || '',
      pcts: [...s.querySelectorAll('.ca-corte-cifras strong')].map((e) => parseFloat(e.textContent)),
      /* Cuenta formas en cualquier nivel: la vaca es un solo trazo de Font
         Awesome dentro de un <g> con transform, y el cerdo y el pollo son
         varias piezas. Contar solo los hijos directos daba 1 para la vaca. */
      trazos: s.querySelectorAll('.ca-silueta svg path, .ca-silueta svg ellipse, .ca-silueta svg circle').length,
      aviso: s.querySelector('.ca-canal-pie')?.textContent || '',
      despojos: s.querySelectorAll('.ca-despojos li').length,
    };
  });

  const res = await leer();
  ok(res !== null, 'el bloque monta');
  ok(res?.pcts.reduce((s, v) => s + v, 0) === 100, 'los cortes suman una canal entera', `(${res?.pcts.join('+')} = ${res?.pcts.reduce((s, v) => s + v, 0)})`);
  ok(res?.trazos >= 1, 'la silueta se dibuja', `(${res?.trazos} formas)`);

  // Las tres especies cambian de verdad el reparto y la silueta.
  const vistos = new Set();
  for (const n of ['Res', 'Cerdo', 'Pollo']) {
    await p.evaluate((x) => {
      [...document.querySelectorAll('.ca-especies button')].find((b) => b.textContent.trim() === x).click();
    }, n);
    await pausa(450);
    const d = await leer();
    vistos.add(d.pcts.join());
    ok(d.especie === n && d.pcts.reduce((s, v) => s + v, 0) === 100, `${n.padEnd(6)} despieza y suma 100`, `${d.pcts.join('/')}  ${d.kg}`);
  }
  ok(vistos.size === 3, 'los tres animales tienen repartos distintos');

  // Y AHORA lo importante: cambiar de país NO puede mover el reparto.
  const antes = await leer();
  await p.selectOption('.ca-canal-pais select', 'Mongolia');
  await pausa(700);
  const dsp = await leer();
  ok(dsp.kg !== antes.kg, 'cambiar de país cambia los kilos', `${antes.kg} → ${dsp.kg}`);
  ok(dsp.pcts.join() === antes.pcts.join(),
    'pero NO el reparto: el porcentaje es rendimiento de canal, no dato por país');
  ok(/no existe publicado el consumo por corte/i.test(dsp.aviso), 'y el cartel que lo advierte sigue ahí');
  ok(dsp.despojos > 0, 'las vísceras y la grasa (dato real por país) se pintan', `(${dsp.despojos} filas)`);
  await cerrar();
}

/* ── 8. Balance nacional con selector de país ───────────────────────────────
   Lo que se vigila: que el medidor del hero NO se contagie del selector. Ese
   recuadro es el ancla de «cómo estamos nosotros» y está clavado en México a
   propósito; si algún día alguien lo conecta al mismo estado, la portada de la
   sección empezaría a decir la autosuficiencia de Brasil bajo un rótulo que
   sigue diciendo «México», y nada fallaría. */
console.log('\n8 · Balance nacional · selector de país');
{
  const { p, cerrar } = await abrir('proteinas');
  const leer = () => p.evaluate(() => {
    const s = document.querySelector('.prot-balance');
    const h = document.querySelector('.grain-pressure-card.es-auto');
    return {
      titulo: s?.querySelector('h3')?.textContent || '',
      auto: s?.querySelector('.pb-total strong')?.textContent || '',
      filas: s?.querySelectorAll('.pb-lista li').length || 0,
      opciones: s?.querySelectorAll('.pb-pais option').length || 0,
      heroLbl: h?.querySelector('small')?.textContent || '',
      heroVal: h?.querySelector('strong')?.textContent || '',
    };
  });

  const mx = await leer();
  ok(mx.opciones > 100, 'el menú trae los países del balance', `(${mx.opciones})`);
  ok(/M[ée]xico/.test(mx.titulo), 'abre por México', `→ "${mx.titulo}"`);
  ok(mx.filas === 4, 'con sus cuatro proteínas', `(${mx.filas})`);

  await p.selectOption('.pb-pais select', 'Brazil');
  await pausa(700);
  const br = await leer();
  ok(/Brasil/.test(br.titulo), 'cambiar de país cambia el bloque', `→ "${br.titulo}"`);
  ok(br.auto !== mx.auto, 'y su autosuficiencia', `${mx.auto} → ${br.auto}`);
  ok(br.heroLbl === mx.heroLbl && br.heroVal === mx.heroVal,
    'pero el medidor del hero SIGUE clavado en México', `"${br.heroLbl}" ${br.heroVal}`);
  await cerrar();
}

await nav.close();
console.log(`\n${fallos ? `${fallos} COMPROBACIÓN(ES) FALLIDA(S)` : 'Todo correcto.'}\n`);
process.exit(fallos ? 1 : 0);
