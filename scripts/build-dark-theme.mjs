/**
 * Genera assets/css/dark-theme.css a partir de las hojas del sitio.
 *
 * POR QUÉ SE GENERA Y NO SE ESCRIBE A MANO
 * El color de VALLNews no vive en tokens: está escrito a mano hoja por hoja
 * (221 usos de #fff, 65 de #0f172a…) y repartido en 27 archivos con 5.371
 * !important, resultado de cuatro sistemas de diseño superpuestos sobre el
 * mismo DOM. Un tema oscuro escrito a mano cubriría una fracción y quedaría
 * desfasado al primer retoque. Este script lee las reglas que de verdad
 * existen y emite, para cada una, su contraparte bajo [data-theme="dark"].
 *
 * CÓMO DECIDE EL COLOR
 * Se convierte a HSL y se trata según la saturación:
 *  - Casi neutro (croma < 18%): es superficie o tinta. Se invierte la luminosidad
 *    sobre una escala azul acero, nunca negra, y se le pega un punto de tinte
 *    para que el gris no se vea muerto.
 *  - Con color (croma >= 18%): es semántico — verde de subida, rojo de bajada,
 *    ámbar de alerta, el dorado de marca. Se CONSERVAN tono y saturación y
 *    solo se ajusta la luminosidad si no llegaría a contrastar. Invertirlos
 *    haría ilegible el dato, que es lo único que esta plataforma no puede
 *    permitirse.
 *
 * Uso:  node scripts/build-dark-theme.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(RAIZ, 'assets/css/dark-theme.css');

/* Hojas que pintan la aplicación. Se excluyen vendor y normalize: son reset y
   librerías de terceros, y sus superficies ya las cubren las de arriba.
   dark-pilot.css también queda fuera, y no por ahorrar trabajo: YA es una hoja
   oscura. Al leerla, sus tintas claras se clasificaban como superficie ("l>55
   ⇒ fondo") y salían invertidas a oscuro, de modo que el tema generado
   sobrescribía --dp-muted con #323b47 y --bond-muted con #313a46. Es decir,
   activar el modo oscuro apagaba el texto secundario de Inicio y Finanzas
   justo en las dos rutas que el piloto ya tenía resueltas.

   mercados-redesign-v2.css sale por EL MISMO MOTIVO, y costó una regresión
   visible: es el sistema oscuro de Mercados —de ahí salen --mk-bg #161f2c y
   todos los --mk-*—, así que pasarlo por un conversor de claro a oscuro es un
   error de categoría. Lo que hizo en concreto: de `.grain-hero { background:
   radial-gradient(...), linear-gradient(...) }` sacó un
   `background-image: <degradados> !important`, y ese !important SUSTITUYE LA
   LISTA ENTERA de fondos. Cincuenta líneas más abajo, en esa misma hoja,
   `body.vn-dark-mercados .grain-hero` pone la fotografía de la sección como
   segunda capa — y se la llevaba por delante. Con data-theme="dark" los
   recuadros de título de Granos, Energía y Proteínas se quedaban sin foto.

   Regla general para no repetirlo: una hoja que YA está escrita en oscuro no
   entra aquí. Si hay que añadir alguna, comprobar antes si declara superficies
   oscuras propias. */
const YA_OSCURAS = new Set(['dark-theme.css', 'dark-pilot.css', 'mercados-redesign-v2.css']);

const FUENTES = [
  ...fs.readdirSync(path.join(RAIZ, 'assets/css'))
    .filter((f) => f.endsWith('.css') && !YA_OSCURAS.has(f))
    .map((f) => path.join(RAIZ, 'assets/css', f)),
  ...fs.readdirSync(path.join(RAIZ, 'frontend/src/pages'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => path.join(RAIZ, 'frontend/src/pages', f)),
].filter((p) => !p.includes('vendor'));

// ── Color ────────────────────────────────────────────────────────────────────
function aRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/* Cualquier literal de color de los que usa el sitio, con su alfa. Hacía falta
   ampliarlo: la primera versión solo leía #hex y se dejaba fuera los
   rgba(255,255,255,.9) de los paneles de Geopolítica y VALL-AI, que son los que
   quedaban blancos. */
const RE_COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)/g;

function analizar(txt) {
  if (txt.startsWith('#')) {
    const c = aRgb(txt);
    return c ? { rgb: c, a: 1 } : null;
  }
  const n = txt.match(/[\d.]+/g);
  if (!n || n.length < 3) return null;
  return { rgb: n.slice(0, 3).map(Number), a: n[3] === undefined ? 1 : Number(n[3]) };
}

function aHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function aHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
  return '#' + seg.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/* Azul acero: el tinte al que tienden los neutros en oscuro. NO negro. */
const TINTE = 214;

/**
 * Croma: cuánto se aleja un color del eje gris, en términos absolutos (0-100).
 *
 * Se usa para decidir si un color es neutro o semántico, EN LUGAR de la
 * saturación HSL. La saturación se dispara en los extremos de luminosidad: el
 * plano del pie #ccd9e3 marca 29 % de saturación y #f8fafc llega al 40 %, así
 * que ambos se clasificaban como "semánticos" y en oscuro salían convertidos en
 * losas azules (#2b404f) en vez de superficies oscuras — que es de donde venían
 * los 36 fallos de contraste del pie en todas las rutas. Por croma dan 9 % y
 * 1.6 %: neutros, como se ven. Los semánticos de verdad quedan muy por encima
 * del umbral (verde 55 %, rojo 71 %, ámbar 83 %), así que la frontera es clara.
 */
function croma([r, g, b]) {
  return ((Math.max(r, g, b) - Math.min(r, g, b)) / 255) * 100;
}

/**
 * @param {string} texto  literal de color (#hex, rgb() o rgba())
 * @param {'fondo'|'texto'|'borde'|'auto'} papel
 */
function invertir(texto, papel) {
  const c = analizar(texto);
  if (!c) return null;
  const { rgb, a } = c;
  const [h, s, l] = aHsl(rgb);

  // Un token puede acabar de fondo o de tinta; se decide por su luminosidad.
  if (papel === 'auto') papel = l > 55 ? 'fondo' : 'texto';

  // El alfa se conserva: muchos paneles son blancos translúcidos sobre una
  // imagen, y volverlos opacos taparía el fondo que da profundidad.
  const conAlfa = (hex) => {
    if (a >= 1) return hex;
    const p = aRgb(hex);
    return p ? `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${a})` : hex;
  };
  const salida = (hex) => conAlfa(hex);

  if (croma(rgb) < 18) {
    // Neutro: superficie o tinta. Se invierte la luminosidad sobre la escala
    // azul acero. Los topes evitan tanto el negro puro como el blanco puro.
    if (papel === 'fondo') {
      /* La escala anterior mandaba TODA superficie blanca al 8 % de luz, por
         debajo del propio plano de la página (11.6 %): las tarjetas salían más
         oscuras que el fondo sobre el que descansan, la elevación quedaba del
         revés y ningún bloque se distinguía del siguiente. Ahora el blanco cae
         en el 16.5 %, claramente por encima del plano, y los grises claros
         suben un poco más — que es como funciona la elevación en oscuro: a más
         altura, más luz. */
      const nl = 16.5 + (100 - l) * 0.22;       // #fff -> ~16.5%, #e2e8f0 -> ~18.6%
      return salida(aHex(TINTE, Math.max(s, 14), Math.min(nl, 36)));
    }
    // Sobre superficies más claras, una línea al 10 % ya no se ve.
    if (papel === 'borde') return `rgba(255, 255, 255, ${(l > 60 ? 0.14 : 0.22) * a})`;
    const nl = 100 - l * 0.55;                   // #0f172a -> ~92%
    return salida(aHex(TINTE, Math.max(s, 10), Math.max(nl, 62)));
  }

  // Con color: es semántico. Se conserva el tono y solo se corrige la
  // luminosidad hasta que sea legible sobre fondo oscuro.
  if (papel === 'fondo') {
    // Los fondos de color son insignias y avisos: se atenúan mucho para que
    // no griten sobre el oscuro, conservando el tono que los identifica.
    /* El suelo (19) los deja por encima del plano de superficie (16.5): antes,
       al 12, una insignia quedaba MÁS oscura que la tarjeta que la contiene. El
       techo se queda bajo (25) a propósito: no todo lo que pasa el filtro de
       croma es una insignia — las superficies con tinte azul (#bfdbfe y
       parientes) también entran, y con techo 32 las tarjetas de bolsas se iban
       al 32 % de luz, fuera de la familia del resto de la página. */
    return salida(aHex(h, Math.min(s, 55), Math.max(19, Math.min(l * 0.26, 25))));
  }
  if (papel === 'borde') return salida(aHex(h, Math.min(s, 50), 40));
  return salida(aHex(h, Math.min(s + 8, 88), Math.max(l, 68)));
}

/** Reescribe TODOS los literales de color de un valor. Así un degradado se
 *  recolorea entero, conservando su forma. */
function remapear(valor, papel) {
  let cambió = false;
  const nuevo = valor.replace(RE_COLOR, (lit) => {
    const r = invertir(lit, papel);
    if (!r) return lit;
    cambió = true;
    return r;
  });
  return cambió ? nuevo : null;
}

const lumDe = (txt) => {
  const c = analizar(txt);
  return c ? 0.2126 * c.rgb[0] + 0.7152 * c.rgb[1] + 0.0722 * c.rgb[2] : null;
};

// ── Recorrido del CSS ────────────────────────────────────────────────────────
/** Selectores que NO hay que tocar: ya son oscuros o son datos semánticos. */
const OMITIR = /(^|[\s,])(\.up|\.down|\.pos|\.neg|\.vn-live-dot|\.hub-badge-dot)\b/;

const reglas = [];
const tokens = [];
let vistos = 0;

/** Luminancia media de un valor con varios colores (p. ej. un degradado). */
function lumMedia(valor) {
  const lits = valor.match(RE_COLOR) || [];
  const ls = lits.map(lumDe).filter((x) => x !== null);
  return ls.length ? ls.reduce((a, b) => a + b, 0) / ls.length : null;
}

/** Separa las capas de un `background` por las comas de primer nivel: las que
 *  van dentro de un gradient(...) no cuentan. */
function dividirCapas(valor) {
  const capas = [];
  let prof = 0, actual = '';
  for (const ch of valor) {
    if (ch === '(') prof++;
    else if (ch === ')') prof--;
    if (ch === ',' && prof === 0) { capas.push(actual.trim()); actual = ''; continue; }
    actual += ch;
  }
  if (actual.trim()) capas.push(actual.trim());
  return capas;
}

for (const archivo of FUENTES) {
  const css = fs.readFileSync(archivo, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');            // fuera comentarios

  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    const cuerpo = m[2];
    if (!selector || selector.startsWith('@') || selector.includes('%')) continue;
    if (OMITIR.test(selector)) continue;

    /* Propiedades personalizadas. Hay que tratarlas aparte porque muchas
       superficies no traen el color escrito: ponen background: var(--card).
       Redefiniendo el token en oscuro se arreglan todas de una vez. */
    for (const d of cuerpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
      const valor = d[2].replace(/\s*!\s*important\s*$/i, '').trim();
      if (!RE_COLOR.test(valor)) { RE_COLOR.lastIndex = 0; continue; }
      RE_COLOR.lastIndex = 0;
      if (/url\(/i.test(valor)) continue;

      /* Solo se recalculan los tokens NEUTROS, que son los de superficie y
         tinta. Los saturados son la paleta de sección (--sec-finanzas,
         --sec-mercados…), validada para daltonismo, y los semánticos de
         subida/bajada. Al pasarlos por 'auto' se aclaraban los que tenían la
         luminosidad por debajo del umbral, y como encima llevan texto blanco,
         las insignias quedaban ilegibles. Se dejan intactos. */
      const lits = valor.match(RE_COLOR) || [];
      RE_COLOR.lastIndex = 0;
      /* Aquí SÍ se mide por saturación HSL, no por croma como en invertir().
         No es un descuido: el filtro protege de más a propósito. Un token no
         dice si es superficie o tinta, y 'auto' lo adivina por luminosidad
         ("oscuro = tinta"), que falla justo en los fondos oscuros: --navy2
         #001827 es el fondo del ticker de Mercados, y al tratarlo como tinta lo
         aclaraba a #eaf3ff — texto blanco sobre fondo casi blanco, 1.06:1 en 52
         elementos. La saturación HSL, alta en los extremos de luminosidad,
         deja fuera precisamente esos casos. Comprobado midiendo: con croma aquí,
         el tema oscuro pasa de 80 a 132 fallos. */
      const saturado = lits.some((c) => {
        const p = analizar(c);
        return p && aHsl(p.rgb)[1] >= 18;
      });
      if (saturado) continue;

      const nuevo = remapear(valor, 'auto');
      if (!nuevo) continue;
      tokens.push({ selector, decl: `${d[1]}: ${nuevo};` });
      vistos++;
    }

    if (selector.startsWith('html') || selector.startsWith('body')) continue;

    const props = [];

    /* Texto relleno con degradado: el fondo NO es una superficie, es la tinta
       (se recorta con background-clip:text y el color se pone transparente).
       Oscurecerlo dejaba títulos como "Monitor de Commodities" en oscuro sobre
       oscuro, invisibles. Aquí el fondo se aclara, como cualquier otro texto. */
    const textoRelleno = /background-clip\s*:\s*text/i.test(cuerpo);

    /* ── Y la tinta NO se globaliza a un selector de etiqueta pelado ─────────
       Aquí se emite el degradado aclarado, pero NO lo que lo convierte en tinta
       —`background-clip: text` y `-webkit-text-fill-color: transparent`—, que se
       quedan en la regla de origen. Mientras las dos partes viajen juntas no
       pasa nada; el problema es cuando esta hoja llega a una página donde la de
       origen no está:

         `finanzas-premium.css` pinta `.hub-hero-title, h1, #ff-page-title` con
         un degradado recortado al texto, y solo se carga en Finanzas. El
         generador aclaró ese degradado y lo emitió con el mismo selector, ESTA
         hoja se carga en todas las rutas, y en Inicio, Login y Mercados no
         había ningún `background-clip` que recortara nada: el degradado claro
         se pintaba entero. Resultado, un RECTÁNGULO gris claro detrás de CADA
         `<h1>` del sitio.

       Re-emitir el recorte aquí no vale: se probó y deja `-webkit-text-fill-
       color: transparent` sobre todos los `h1`, incluidos los que nunca fueron
       de degradado. El titular de Inicio —palabras en `inline-block` con su
       propia ventana— se volvió INVISIBLE entero.

       La regla correcta es no globalizar: un selector de ETIQUETA pelado (`h1`,
       `h2`, `p`) describe elementos de todo el sitio, y la tinta solo es válida
       donde vive su recorte. Con clase o id el riesgo no existe, porque el
       nombre ya acota dónde aplica. Así `.hub-hero-title` y `#ff-page-title`
       siguen aclarándose, y el `h1` pelado deja de heredar el degradado. */
    const soloEtiqueta = (s) => /^[a-z][a-z0-9]*$/i.test(s.trim());

    for (const d of cuerpo.matchAll(/(^|;)\s*(background-color|background|background-image|color|border-color|border|border-top|border-bottom|border-left|border-right)\s*:\s*([^;]+)/g)) {
      const prop = d[2];
      /* Hay que quitar el !important de origen: si se arrastra, la salida
         acaba con "… !important !important", que es inválido y el navegador
         DESCARTA la regla entera. Como las hojas de este proyecto llevan miles
         de !important, era la mayoría de las reglas generadas. */
      const valor = d[3].replace(/\s*!\s*important\s*$/i, '').trim();
      if (/url\(/i.test(valor)) continue;            // fotografía: no se recolorea
      const L = lumMedia(valor);
      if (L === null) continue;

      if (prop.startsWith('background')) {
        if (textoRelleno) {
          // Es tinta, no superficie: se aclara y no se toca si ya es clara.
          if (L > 150) continue;
          const nuevo = remapear(valor, 'texto');
          if (nuevo) {
            props.push(/gradient/i.test(valor)
              ? `background-image: ${nuevo} !important;`
              : `background-color: ${nuevo} !important;`);
          }
          vistos++;
          continue;
        }
        if (L < 150) continue;                       // ya es oscuro: se respeta
        const nuevo = remapear(valor, 'fondo');
        if (!nuevo) continue;

        /* `background` admite capas de imagen y, al final, un color suelto.
           `background-image` NO admite ese color: colarlo invalida la
           declaración entera y el navegador la descarta — que es justo por lo
           que .vai-workspace se quedaba blanco. Se separan las dos cosas. */
        const capas = dividirCapas(nuevo);
        const imagenes = capas.filter((c) => /gradient|url\(/i.test(c));
        const sueltos = capas.filter((c) => !/gradient|url\(/i.test(c));
        if (imagenes.length) props.push(`background-image: ${imagenes.join(', ')} !important;`);
        if (sueltos.length) props.push(`background-color: ${sueltos[sueltos.length - 1]} !important;`);
      } else if (prop === 'color') {
        if (L > 150) continue;                       // ya es claro
        const nuevo = remapear(valor, 'texto');
        if (nuevo) props.push(`color: ${nuevo} !important;`);
      } else {
        if (L < 130) continue;                       // borde ya oscuro
        /* El valor puede ser el atajo completo (`1px solid #e2e8f0`). Solo
           interesa el color: pasarle el atajo a border-color es inválido. */
        const lits = valor.match(RE_COLOR);
        RE_COLOR.lastIndex = 0;
        if (!lits) continue;
        const nuevo = invertir(lits[lits.length - 1], 'borde');
        if (!nuevo) continue;
        const propColor = prop === 'border' ? 'border-color' : `${prop}-color`;
        props.push(`${propColor}: ${nuevo} !important;`);
      }
      vistos++;
    }

    if (props.length) {
      /* En las reglas de tinta se descartan los selectores de etiqueta pelados
         (ver `soloEtiqueta`): son los que sacaban el degradado de su página y lo
         repartían por todo el sitio. En las demás reglas no se filtra nada. */
      const partes = selector.split(',')
        .map((s) => s.trim())
        .filter((s) => !(textoRelleno && soloEtiqueta(s)));
      if (partes.length) {
        const conTema = partes.map((s) => `[data-theme="dark"] ${s}`).join(',\n');
        reglas.push(`${conTema} {\n    ${[...new Set(props)].join('\n    ')}\n}`);
      }
    }
  }
}

/* Los tokens se agrupan por selector y van los PRIMEROS: así una regla
   posterior que escriba el color a pelo sigue mandando sobre su token. */
const porSelector = new Map();
for (const t of tokens) {
  const clave = t.selector === ':root' ? ':root[data-theme="dark"]' : `[data-theme="dark"] ${t.selector}`;
  if (!porSelector.has(clave)) porSelector.set(clave, new Set());
  porSelector.get(clave).add(t.decl);
}
const bloqueTokens = [...porSelector]
  .map(([sel, decls]) => `${sel} {\n    ${[...decls].join('\n    ')}\n}`)
  .join('\n\n');

const cabecera = `/* ============================================================================
   MODO OSCURO — GENERADO, NO EDITAR A MANO
   Se regenera con:  node scripts/build-dark-theme.mjs

   Se activa cuando <html> lleva data-theme="dark", que pone el guion
   anti-parpadeo de frontend/index.html a partir de localStorage.vn_theme.

   Por qué generado: el color del sitio está escrito a mano en 27 hojas con
   miles de !important — cuatro sistemas de diseño apilados sobre el mismo DOM.
   Este archivo lee esas reglas y emite su contraparte oscura, de modo que al
   retocar una hoja basta con volver a ejecutar el generador.

   Regla de oro que respeta: los colores CON saturación son semánticos (verde
   de subida, rojo de bajada, ámbar de alerta, dorado de marca) y conservan su
   tono; solo se les sube la luminosidad para que contrasten. Los neutros sí se
   invierten, sobre una escala azul acero — nunca negra.
   ============================================================================ */

/* Base: plano, tinta y tokens compartidos. */
:root[data-theme="dark"] {
    --clr-bg:      #131a26;
    --clr-text:    #e8eef7;
    --clr-muted:   #93a3b8;
    --clr-white:   #e8eef7;
    --bdr:         rgba(148, 176, 219, 0.26);
    --bdr-l:       rgba(148, 176, 219, 0.16);

    --plane:       #131a26;
    --surface:     #212c3d;
    --ink:         #e8eef7;
    --ink-2:       #b2c0d2;
    --ink-3:       #8b9ab0;
    --hairline:    rgba(255, 255, 255, 0.14);
}

[data-theme="dark"] html,
html[data-theme="dark"] {
    background-color: #0f1622 !important;
}

[data-theme="dark"] body {
    background-color: #131a26 !important;
    background-image: none !important;
    color: #e8eef7 !important;
}

/* Los lienzos de las gráficas se pintan por JS con su propio color de fondo;
   forzarlos aquí solo taparía la serie. */
[data-theme="dark"] canvas {
    background-color: transparent !important;
}

/* Campos: heredan del navegador y quedarían blancos. */
[data-theme="dark"] input,
[data-theme="dark"] select,
[data-theme="dark"] textarea {
    background-color: #212c3d !important;
    color: #e8eef7 !important;
    border-color: rgba(255, 255, 255, 0.18) !important;
}

[data-theme="dark"] ::placeholder { color: #7d8da3 !important; }

/* Los botones de las tarjetas toman su color de los tokens -ink de sección,
   validados para 4.9:1 SOBRE BLANCO; sobre fondo oscuro caen a negro (1,13:1).
   Los tokens no se pueden recalcular: son la paleta de marca, validada además
   para daltonismo.
   Se intentó conservar el tono de cada sección con
   color-mix(in srgb, var(--cat-ink, var(--sec-finanzas-ink)) 42%, #fff), pero
   la cadena de var() anidados dentro de color-mix no resolvía y el color se
   quedaba en negro. Un valor sólido es menos elegante y sí funciona. */
[data-theme="dark"] .card-btn,
[data-theme="dark"] .card-btn::after {
    color: #cfe0ff !important;
}

/* ── Tokens recalculados ──────────────────────────────────────────────────── */

`;

const salidaCss = cabecera + bloqueTokens
  + '\n\n/* ── Contrapartes generadas ───────────────────────────────────────────────── */\n\n'
  + reglas.join('\n\n') + '\n';

fs.writeFileSync(SALIDA, salidaCss, 'utf8');

console.log('hojas leídas      : %d', FUENTES.length);
console.log('declaraciones     : %d', vistos);
console.log('reglas emitidas   : %d', reglas.length);
console.log('tokens recalculados: %d en %d selectores', tokens.length, porSelector.size);
console.log('escrito           : %s (%d KB)', path.relative(RAIZ, SALIDA), Math.round(fs.statSync(SALIDA).size / 1024));
