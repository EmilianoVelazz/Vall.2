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
const BASE = process.argv[2] || 'http://localhost:5273';
const RAIZ = 'file:///C:/Users/JonathanEmirL%C3%B3pezVel/Documents/public_html/';

const mod = await import(new URL('node_modules/puppeteer/lib/puppeteer/puppeteer.js', RAIZ).href);
const puppeteer = mod.default ?? mod;

let fallos = 0;
const ok = (cond, txt, detalle = '') => {
  if (!cond) fallos++;
  console.log(`  ${cond ? 'OK  ' : 'FALLA'} ${txt}${detalle ? `  ${detalle}` : ''}`);
};

const nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

/** Abre una pestaña de Mercados ya autenticada. `tema` fuerza data-theme. */
async function abrir(tab, { tema = null, cortarNoticias = false } = {}) {
  const p = await nav.newPage();
  await p.setViewport({ width: 1500, height: 1000 });
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  if (cortarNoticias) {
    await p.setRequestInterception(true);
    p.on('request', (r) => (/\/api\/daily-news-markets/.test(r.url()) ? r.abort('failed') : r.continue()));
  }
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.evaluate((t) => {
    sessionStorage.setItem('vn_auth', 'verificacion');
    sessionStorage.setItem('vn_user', 'verificacion');
    localStorage.setItem('mkt_active_tab', t);
  }, tab);
  await p.goto(`${BASE}/mercados`, { waitUntil: 'networkidle2' });
  if (tema) await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
  await new Promise((r) => setTimeout(r, tab === 'noticias' ? 11000 : 5000));
  return { p, errores };
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
    const { p } = await abrir(tab, { tema });
    const foto = await p.evaluate((s) => {
      const e = document.querySelector(s);
      return e ? /url\(/.test(getComputedStyle(e).backgroundImage) : null;
    }, sel);
    ok(foto === true, `${nombre.padEnd(10)} con data-theme=${String(tema)}`, foto === null ? '(hero no visible)' : '');
    await p.close();
  }
}

// ── 2. La sala de Noticias monta entera ─────────────────────────────────────
console.log('\n2 · Sala de Noticias · estructura');
{
  const { p, errores } = await abrir('noticias');
  const e = await p.evaluate(() => ({
    capitulos: ['.fnb-masthead', '.fnb-pulse', '.fnb-reading-route', '.fnb-desk', '.fnb-lead',
      '.fnb-brief', '.fnb-radar', '.fnb-departments', '.fnb-perspectives', '.fnb-coverage', '.fnb-archive']
      .filter((s) => document.querySelector(s)).length,
    pulso: document.querySelectorAll('.fnb-pulse-node').length,
    tarjetas: document.querySelectorAll('.fnb-card').length,
    indice: document.querySelectorAll('.fnb-archive-item').length,
    cobertura: document.querySelectorAll('.fnb-coverage-card').length,
    /* Si el tema de Daily News no se aplicó, la sala se ve BLANCA: su base es
       una hoja de tema claro y lo oscuro va colgado de estas clases. */
    tema: document.body.classList.contains('ff-detail-noticias'),
  }));
  ok(e.capitulos === 11, `los 11 capítulos montan`, `(${e.capitulos}/11)`);
  ok(e.tema, 'el tema de Daily News está aplicado (body.ff-detail-noticias)');
  ok(e.pulso > 0, 'el pulso tiene puntos', `(${e.pulso})`);
  ok(e.tarjetas > 0, 'la parrilla tiene tarjetas', `(${e.tarjetas})`);
  ok(e.indice > 0, 'el índice tiene historias', `(${e.indice})`);
  ok(e.cobertura > 0, 'la cobertura tiene tarjetas', `(${e.cobertura})`);
  ok(errores.length === 0, 'sin errores de runtime', errores.join(' | '));
  await p.close();
}

// ── 3. Lo interactivo hace lo suyo ──────────────────────────────────────────
console.log('\n3 · Sala de Noticias · interacción');
{
  const { p } = await abrir('noticias');

  // Pulso: hay que mover el ratón DE VERDAD; React delega mouseenter vía mouseover.
  await p.evaluate(() => document.getElementById('mkt-pulse-section')?.scrollIntoView({ block: 'center' }));
  await pausa(2000);
  const caja = await p.evaluate(() => {
    const d = document.querySelector('.fnb-pulse-node .fnb-pulse-dot');
    if (!d) return null;
    const r = d.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (caja) {
    await p.mouse.move(caja.x, caja.y);
    await pausa(600);
  }
  ok(await p.evaluate(() => document.querySelectorAll('.fnb-pulse-node.is-active').length === 1),
    'el pulso responde al señalar un punto');

  // Carrusel: la tira tiene que DESPLAZARSE, no solo cambiar la marca.
  await p.evaluate(() => document.getElementById('mkt-coverage-section')?.scrollIntoView({ block: 'center' }));
  await pausa(1500);
  const antes = await p.evaluate(() => Math.round(document.querySelector('.fnb-coverage-grid')?.scrollLeft ?? -1));
  await p.evaluate(() => document.querySelectorAll('.fnb-carousel-controls button')[1]?.click());
  await pausa(1200);
  const despues = await p.evaluate(() => Math.round(document.querySelector('.fnb-coverage-grid')?.scrollLeft ?? -1));
  ok(despues > antes, 'el carrusel desplaza la tira', `(scrollLeft ${antes} → ${despues})`);

  // Dossiers
  const d0 = await p.evaluate(() => document.querySelector('.fnb-department-host')?.innerText.slice(0, 40));
  await p.evaluate(() => document.querySelectorAll('.fnb-thread-map button')[1]?.click());
  await pausa(700);
  ok(await p.evaluate((a) => document.querySelector('.fnb-department-host')?.innerText.slice(0, 40) !== a, d0),
    'los dossiers cambian de contenido');

  // Buscador del índice
  const n0 = await p.evaluate(() => document.querySelectorAll('.fnb-archive-item').length);
  await p.evaluate(() => {
    const i = document.querySelector('#mkt-archive-search');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, 'a'); i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await pausa(700);
  const n1 = await p.evaluate(() => document.querySelectorAll('.fnb-archive-item').length);
  ok(n1 > 0 && n1 <= n0, 'el buscador del índice filtra', `(${n0} → ${n1})`);
  await p.close();
}

// ── 4. La sala aguanta que se caiga su fuente ───────────────────────────────
console.log('\n4 · Sala de Noticias · resistencia');
{
  const { p } = await abrir('noticias', { cortarNoticias: true });
  const r = await p.evaluate(() => ({
    historias: document.querySelectorAll('.fnb-archive-item').length,
    cartel: /no disponible/i.test(document.querySelector('.fnb-desk')?.innerText || ''),
    fuente: document.querySelector('.fnb-edition small')?.textContent || '',
  }));
  ok(r.historias > 0, 'con la fuente caída sigue habiendo noticias', `(${r.historias})`);
  ok(!r.cartel, 'no aparece el cartel de «edición no disponible»');
  ok(/directas/i.test(r.fuente), 'y avisa de que es la edición de reserva', `"${r.fuente}"`);
  await p.close();
}

/* ── 5. La línea de tiempo del mapa de Proteínas ────────────────────────────
   Está aquí por lo mismo que el resto: puede romperse sin dar un solo error.
   Si `datosDe` dejara de recibir el año, el control seguiría moviéndose y el
   mapa se quedaría clavado en 2023 — y eso, mirándolo de frente, se ve igual
   que un mapa que funciona. Lo que se comprueba es que el RELLENO cambie. */
console.log('\n5 · Mapa de Proteínas · línea de tiempo');
{
  const { p } = await abrir('proteinas');
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
  await p.close();
}

/* ── 6. «Lo que come una persona» ───────────────────────────────────────────
   Lo que se vigila aquí es el fallo que no da error: que el color deje de ir
   con la proteína. Si algún día alguien ordena los tramos por tamaño «para que
   se vea mejor», el cerdo dejará de ser azul en cuanto se cambie de país, y
   quien haya aprendido el color estará leyendo mal el siguiente — sin que nada
   falle ni se vea raro en una captura. */
console.log('\n6 · Lo que come una persona · dónut por país');
{
  const { p } = await abrir('proteinas');
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

  await p.select('.cp-selector select', 'Argentina');
  await pausa(700);
  const ar = await leer();
  ok(ar.total !== mx.total, 'cambiar de país cambia el dato', `${mx.total} → ${ar.total}`);
  ok(ar.orden.join() === mx.orden.join() && ar.tramos.join() === mx.tramos.join(),
    'pero NO repinta: cada proteína conserva su color', `${ar.tramos.join(' ')}`);
  await p.close();
}

/* ── 7. «De qué parte del animal» ───────────────────────────────────────────
   Aquí lo que se vigila es una tentación, no un bug: que alguien haga que el
   reparto por cortes cambie con el país. No existe esa serie en ninguna fuente
   —ni FAO ni USDA—, así que un reparto que cambiase de país sería inventado, y
   se vería perfectamente normal en pantalla. El porcentaje TIENE que ser el
   mismo en todas partes y el cartel que lo dice tiene que estar. */
console.log('\n7 · De qué parte del animal · despiece');
{
  const { p } = await abrir('proteinas');
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
  await p.select('.ca-canal-pais select', 'Mongolia');
  await pausa(700);
  const dsp = await leer();
  ok(dsp.kg !== antes.kg, 'cambiar de país cambia los kilos', `${antes.kg} → ${dsp.kg}`);
  ok(dsp.pcts.join() === antes.pcts.join(),
    'pero NO el reparto: el porcentaje es rendimiento de canal, no dato por país');
  ok(/no existe publicado el consumo por corte/i.test(dsp.aviso), 'y el cartel que lo advierte sigue ahí');
  ok(dsp.despojos > 0, 'las vísceras y la grasa (dato real por país) se pintan', `(${dsp.despojos} filas)`);
  await p.close();
}

/* ── 8. Balance nacional con selector de país ───────────────────────────────
   Lo que se vigila: que el medidor del hero NO se contagie del selector. Ese
   recuadro es el ancla de «cómo estamos nosotros» y está clavado en México a
   propósito; si algún día alguien lo conecta al mismo estado, la portada de la
   sección empezaría a decir la autosuficiencia de Brasil bajo un rótulo que
   sigue diciendo «México», y nada fallaría. */
console.log('\n8 · Balance nacional · selector de país');
{
  const { p } = await abrir('proteinas');
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

  await p.select('.pb-pais select', 'Brazil');
  await pausa(700);
  const br = await leer();
  ok(/Brasil/.test(br.titulo), 'cambiar de país cambia el bloque', `→ "${br.titulo}"`);
  ok(br.auto !== mx.auto, 'y su autosuficiencia', `${mx.auto} → ${br.auto}`);
  ok(br.heroLbl === mx.heroLbl && br.heroVal === mx.heroVal,
    'pero el medidor del hero SIGUE clavado en México', `"${br.heroLbl}" ${br.heroVal}`);
  await p.close();
}

await nav.close();
console.log(`\n${fallos ? `${fallos} COMPROBACIÓN(ES) FALLIDA(S)` : 'Todo correcto.'}\n`);
process.exit(fallos ? 1 : 0);
