import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import MktChart from '../components/MktChart.jsx';
import MapaGranos from '../components/MapaGranos.jsx';
import SalaNoticiasMercados from '../components/SalaNoticiasMercados.jsx';
import ConsumoPersona from '../components/ConsumoPersona.jsx';
import CortesAnimal from '../components/CortesAnimal.jsx';
import {
  ORIGENES_PROTEINAS, METRICAS as METRICAS_PROT, ESCALA as ESCALA_PROT,
  proteinasDe, balanceDe, dietaDe, tablaPaises, paisesConBalance, FILA_MUNDO,
  ANIOS as ANIOS_PROT, ANIO as ANIO_PROT, ANIOS_ESTIMADOS as ESTIMADOS_PROT,
  fuenteDe as FUENTE_ANIO_PROT, FUENTE as FUENTE_PROT, PROTEINAS as PROTEINAS_FAO,
  FAMILIAS_ALT, ALT_SIN_MEDIR, matrizAlternativas, topesColumna, DIETA_MUNDO,
} from '../lib/proteinas-mapa.js';
import { CAMPANA, FUENTE } from '../lib/produccion-granos.js';
import { nombreEs } from '../lib/paises-es.js';
import { BALANCE, COMERCIO, lecturaStock, diasDeReserva } from '../lib/balance-granos.js';
import {
  PLAZAS, PLAZAS_ENERGIA, PLAZAS_METALES, papelEnCultivo, importeLocal, fmtMoneda,
} from '../lib/plazas-granos.js';
import usePageStyles from '../lib/usePageStyles.js';
import loadScripts, { globalLegado } from '../lib/loadScripts.js';
/* colorCalor, montoCorto y ETIQUETA_DIRECCION ya no se importan: alimentaban el
   mapa de calor y la perspectiva a 2-4 semanas, que salieron de la portada.
   Las funciones siguen en lib/mercados.js —no se han tocado— por si ese
   contenido se recupera dentro de alguna pestaña. */
import {
  calcIPI, impactoLabel, inteligenciaGranos, inteligenciaEnergia,
  inteligenciaMetales, calcularPresupuestoMetal, PRESUPUESTOS_METAL,
  datosProteinas, NOMBRE_ESPECIE, ESPECIES_PROTEINA, ESPECIE_A_FAO,
  estimarDiesel, aplicarEscenarioEnergia,
  /* BU_POR_MT vuelve al import: la matriz de plazas convierte el precio por
     bushel a tonelada para poder aplicarle el tipo de cambio de cada mercado.
     `precioMxnPorTonelada` salió, porque hacía esa misma conversión pero atada
     al peso mexicano — la matriz la necesita para ocho monedas. */
  resultadoEscenarioEnergia, LB_POR_MT, BU_POR_MT,
  simularOpcion, volatilidadHistorica, subyacentesDe, precioEnUnidad,
  procesarOpenInterest, diasDelCot,
  clasificarNoticia, ETIQUETA_CATEGORIA, ICONO_CATEGORIA, impactoNoticia,
  boletinesGranos, boletinesEnergia, imagenValida,
} from '../lib/mercados.js';
import './Mercados.css';
import { ESQUELETO } from '../lib/hojasComunes.js';

/*
 * Mercados en React (antes pages/mercados.html: 3330 líneas, ~1730 de JS
 * inline con 55 funciones globales).
 *
 * El cálculo NO vive aquí: está en lib/mercados.js como funciones puras y
 * verificado contra las fórmulas originales (calcIPI idéntico, spread
 * soja/maíz, raciones, márgenes por especie, presupuesto de metales). Este
 * archivo solo compone la vista a partir de ese resultado.
 *
 * Lo que cambia respecto al original:
 *  - Las pestañas eran display:none sobre cinco <div> siempre presentes en el
 *    DOM; aquí solo se monta la activa. La gráfica se crea al abrir su pestaña
 *    y se destruye al salir (ver MktChart), en vez de acumularse en un objeto
 *    global `_mktCharts`.
 *  - Los simuladores de escenario y presupuesto leían sus valores con
 *    getElementById en cada tecla; ahora son estado controlado.
 *  - El setInterval de 20 min no se cancelaba nunca.
 */

const HOJAS = [
  ...ESQUELETO,
  '/assets/css/mercados-redesign-v2.css?v=1',
  /* Las CUATRO hojas de Daily News, tal cual las carga Finanzas. La pestaña
     Noticias usa su plantilla literal (`.fnb-*`), así que necesita su hoja
     literal: `-favro` es la base y las otras tres son el tema oscuro, que son
     1.264 reglas colgadas de `body.vn-dark-finanzas.ff-detail-noticias`. Esas
     clases las pone y las quita el efecto de más abajo, solo en esa pestaña.
     Se comprobó antes de traerlas que no tocan nada del resto de Mercados. */
  '/assets/css/daily-news-favro.css?v=23',
  '/assets/css/daily-news-editorial.css?v=11',
  '/assets/css/daily-news-coverage-window.css?v=1',
  '/assets/css/daily-news-story-index.css?v=2',
];

/* world-map-data.js son 121 KB de trazos ya proyectados que publica
   window.VN_WORLD_MAP. Es el mismo archivo que usa el mapa de Finanzas: la
   geometría del mundo se genera una vez (scripts/build-world-map.mjs) y la
   comparten las secciones que la necesiten, en vez de tener cada una la suya. */
const LIBS = [
  '/assets/js/api-keys.js?v=5',
  '/assets/js/data-service.js?v=22',
  '/assets/js/world-map-data.js?v=1',
];
const LIB_CHART = ['https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js'];

const MS_REFRESCO = 20 * 60 * 1000;
const CLAVE_TAB = 'mkt_active_tab';

/* Los filtros de la sala de noticias salen del CATÁLOGO de categorías, no de
   una lista escrita a mano. Escribirla a mano es como se cuela el fallo que ya
   documenta categoriaDe(): basta con olvidar una —se me olvidó «Divisas»— para
   que sus titulares se vean en «Todas» y no haya ninguna pestaña que los
   muestre. Derivándola, añadir una categoría al clasificador la añade aquí. */
const FILTROS_NOTICIAS = [
  ['all', 'Todas'],
  ...Object.entries(ETIQUETA_CATEGORIA),
];


/* Los cinco módulos, en un solo sitio.
   Los leen la portada (para pintar los recuadros) y la barra de navegación del
   detalle (para su título y sus pestañas). Estaban escritos dentro del render,
   y tenerlos duplicados en los dos sitios es justo como se desincronizan: se
   cambia el nombre de una sección y se queda con el viejo en la otra mitad. */
const MODULOS = [
  {
    id: 'granos', clase: 'mhc-granos', icono: 'fa-seedling',
    titulo: 'Granos & Forrajes', sub: 'Maíz · Soja · Trigo · CME', badge: 'CME',
    destacado: ['Maíz'], cta: 'Ver análisis de granos',
    desc: 'Maíz, soja y trigo de referencia CME/CBOT: el costo base de la alimentación animal en México.',
    foto: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=900&q=75&auto=format&fit=crop',
  },
  /* Energéticos y Metales eran dos módulos y ahora son uno.
     No es solo ahorrar una pestaña: los dos leen el mismo ciclo industrial y se
     consultaban juntos. El diésel encarece el flete con el que llega el cobre, y
     el aluminio es energía transformada —su propio KPI lo dice—, así que separar
     el precio de la energía del precio del metal obligaba a saltar de pestaña
     para completar una sola lectura. Dentro, cada familia conserva su bloque y
     su color; lo que se unifica es la sección, no los datos. */
  {
    id: 'industriales', clase: 'mhc-industriales', icono: 'fa-industry',
    titulo: 'Energía & Metales', sub: 'WTI · Gas · Cobre · Aluminio', badge: 'NYMEX/LME',
    destacado: ['WTI'], cta: 'Ver energía y metales',
    desc: 'Petróleo, gas y diésel junto a cobre y aluminio: lo que cuesta mover y lo que cuesta construir, leídos como un solo ciclo industrial.',
    foto: 'https://images.unsplash.com/photo-1516937941344-00b4e0337589?w=900&q=75&auto=format&fit=crop',
  },
  {
    id: 'proteinas', clase: 'mhc-proteinas', icono: 'fa-drumstick-bite',
    titulo: 'Mercado de Proteínas', sub: 'Cerdo · Pollo · Res · Huevo', badge: 'GLOBAL',
    destacado: ['Cerdo'], cta: 'Abrir tablero de proteínas',
    desc: 'Precio, costo de alimentación y margen de las cuatro proteínas, con la producción y el consumo de cada país.',
    /* Un cerdo y no la res de antes: la cifra que enseña el recuadro es la del
       cerdo (`destacado: ['Cerdo']`), así que la foto y el dato hablaban de
       animales distintos. Esta toma sirve además al texto que lleva encima —el
       fondo cae oscuro justo en la esquina del título, que es donde una foto
       clara deja el titular ilegible. */
    foto: 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?w=900&q=75&auto=format&fit=crop',
  },
  /* Noticias no es un mercado, es la lectura de todos: reúne en un solo sitio
     los titulares que hasta ahora solo se veían dentro de Granos y de
     Energéticos, más los boletines propios. Por eso `moneda: false` —su cifra
     destacada es un recuento de titulares, no un precio, y sin la marca se
     pintaría como «$24.00»— y por eso ocupa la fila entera en la portada, que
     es lo que evita que quede un hueco suelto al lado del cuarto recuadro. */
  {
    id: 'noticias', clase: 'mhc-noticias', icono: 'fa-newspaper',
    titulo: 'Noticias', sub: 'Agencias · Boletines VALL · Cada 20 min', badge: 'EN VIVO',
    destacado: ['Titulares'], cta: 'Abrir sala de noticias', moneda: false, ancho: true,
    desc: 'Todo lo que mueve a los mercados de insumos, de las agencias y del análisis propio, en una sola lectura.',
    foto: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=900&q=75&auto=format&fit=crop',
  },
];

/* ── Las cuatro proteínas ───────────────────────────────────────────────────
   Un solo catálogo con lo que la sección necesita de cada especie: su icono, su
   clave en el catálogo de volúmenes de la FAO y la frase que la sitúa. Estaba
   repartido en cinco listas escritas a mano dentro del render —['pork',
   'chicken', 'beef'] aparecía tres veces— y añadir el huevo habría significado
   acordarse de las tres. Ahora la lista es ESPECIES_PROTEINA y esto la
   describe.

   El icono importa más de lo que parece: las tres tarjetas llevaban el mismo
   muslo de pollo, así que el cerdo y la res se anunciaban con un dibujo de
   pollo. Con cuatro especies eso ya no se sostiene. */
const ESPECIES_META = {
  pork: {
    icono: 'fa-bacon', fao: 'cerdo',
    pie: 'La proteína que México más importa: produce dos de cada tres kilos que come.',
  },
  chicken: {
    icono: 'fa-drumstick-bite', fao: 'pollo',
    pie: 'La más eficiente del tablero: 1.75 kg de alimento por kilo de carne.',
  },
  beef: {
    icono: 'fa-cow', fao: 'res',
    pie: 'La más cara y la de ciclo más largo; México produce más de la que come.',
  },
  egg: {
    icono: 'fa-egg', fao: 'huevo',
    pie: 'La proteína animal más barata, y la que México come más que ningún país.',
  },
};

/* Las notas al pie de la leyenda del mapa de Proteínas.
   No lleva la del rayado de Granos —la FAO publica país a país y aquí no hay
   bloque UE agregado— pero sí una que allí no hacía falta: la del gris.

   El mapa de Granos deja gris a un puñado de países sin agricultura y nadie se
   pregunta por qué. Aquí el gris más visible es JAPÓN, que es uno de los
   mayores importadores de carne del mundo, y un hueco así sin explicar se lee
   como un fallo del mapa. No lo es: la FAO no publica hoja de balance para
   Japón en esta edición (ver la cabecera de scripts/build-proteinas.mjs). Decir
   «sin dato en la fuente» cuesta una línea y evita esa lectura. */
const NOTAS_PROTEINAS = [
  { clase: 'gm-marca-muestra', texto: 'Remarcado: decide el mercado mexicano' },
  { clase: 'gm-sindato-muestra', texto: 'Gris: la fuente no publica ese país' },
];

/* Minigráfica de seis meses.
 *
 * El dato ya venía preparado y nadie lo usaba: data-service.js guarda en
 * `history` los últimos seis cierres —su propio comentario dice "para
 * sparkline"— y la página solo enseñaba el precio y su variación. Con la misma
 * consulta se ve si ese −9% es una caída nueva o el final de una pendiente
 * larga, que no es lo mismo para decidir una cobertura.
 *
 * Una sola serie, así que no lleva leyenda: la etiqueta del KPI ya la nombra.
 * El color es el del signo de la variación, el mismo que el porcentaje de al
 * lado, y el último punto va marcado porque es el que se está leyendo.
 */
function Minigrafica({ datos, etiqueta }) {
  if (!Array.isArray(datos) || datos.length < 2) return null;
  const min = Math.min(...datos);
  const max = Math.max(...datos);
  const rango = max - min || 1;
  /* El color lo decide la propia serie —primer punto contra último— y no la
     variación del mes. Con el dato mensual, el trigo salía con la curva en rojo
     y su acumulado a tres meses en verde justo al lado: dos colores contando
     cosas distintas del mismo cuadro. */
  const sube = datos[datos.length - 1] >= datos[0];
  const A = 92; const AL = 26; const M = 3;
  const puntos = datos.map((v, i) => [
    M + (i / (datos.length - 1)) * (A - M * 2),
    AL - M - ((v - min) / rango) * (AL - M * 2),
  ]);
  const linea = puntos.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${M},${AL - M} ${linea} ${A - M},${AL - M}`;
  const [fx, fy] = puntos[puntos.length - 1];
  const tono = sube ? 'var(--mk-up)' : 'var(--mk-down)';
  return (
    <svg
      className="mkt-spark"
      viewBox={`0 0 ${A} ${AL}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${etiqueta}: seis meses, de ${min} a ${max}`}
    >
      <polygon points={area} fill={tono} opacity=".13" />
      <polyline points={linea} fill="none" stroke={tono} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={fx} cy={fy} r="2.4" fill={tono} />
    </svg>
  );
}

const RANGOS = [['1mo', '1M'], ['3mo', '3M'], ['6mo', '6M'], ['1y', '1A'], ['3y', '3A'], ['5y', '5A'], ['max', 'MAX']];
const MODOS = [['candles', 'fa-chart-column', 'Velas'], ['line', 'fa-chart-line', 'Línea'], ['area', 'fa-chart-area', 'Área']];

/* Los dos catálogos van sueltos y no dentro de INSTRUMENTOS porque el panel
   unificado los necesita por separado: juntos para poder buscar cualquier
   ticker, y separados para agrupar el desplegable y para saber de qué familia
   es el instrumento elegido (de ahí sale el color de la línea). */
const INSTRUMENTOS_ENERGIA = {
  'CL=F': { name: 'Petróleo WTI', market: 'NYMEX · New York', key: 'wti', unit: '/bbl', icon: 'fa-oil-well' },
  'BZ=F': { name: 'Petróleo Brent', market: 'ICE Futures Europe', key: null, unit: '/bbl', icon: 'fa-droplet' },
  'NG=F': { name: 'Gas Natural Henry Hub', market: 'NYMEX · New York', key: 'gasnat', unit: '/MMBtu', icon: 'fa-fire-flame-curved' },
  'HO=F': { name: 'Diesel ULSD', market: 'NYMEX · New York', key: 'diesel', unit: '/gal', icon: 'fa-gas-pump' },
  'RB=F': { name: 'Gasolina RBOB', market: 'NYMEX · New York', key: null, unit: '/gal', icon: 'fa-gauge-high' },
};

const INSTRUMENTOS_METALES = {
  'HG=F': { name: 'Cobre Grado A', market: 'COMEX · New York', key: 'cobre', unit: '/lb', icon: 'fa-bolt' },
  'ALI=F': { name: 'Aluminio primario', market: 'LME / COMEX', key: 'aluminio', unit: '/MT', icon: 'fa-layer-group' },
  'GC=F': { name: 'Oro', market: 'COMEX · New York', key: null, unit: '/oz', icon: 'fa-coins' },
  'SI=F': { name: 'Plata', market: 'COMEX · New York', key: null, unit: '/oz', icon: 'fa-circle' },
  'PL=F': { name: 'Platino', market: 'NYMEX · New York', key: null, unit: '/oz', icon: 'fa-gem' },
};

const INSTRUMENTOS = {
  granos: {
    'ZC=F': { name: 'Maíz amarillo #2', market: 'CME · CBOT Chicago', key: 'maiz', unit: '/bu', icon: 'fa-seedling' },
    'ZS=F': { name: 'Soja en grano', market: 'CME · CBOT Chicago', key: 'soja', unit: '/MT', icon: 'fa-leaf' },
    'ZW=F': { name: 'Trigo SRW', market: 'CME · CBOT Chicago', key: 'trigo', unit: '/bu', icon: 'fa-wheat-awn' },
    'ZM=F': { name: 'Pasta de soja', market: 'CME · CBOT Chicago', key: null, unit: '', icon: 'fa-leaf' },
    'ZO=F': { name: 'Avena', market: 'CME · CBOT Chicago', key: null, unit: '', icon: 'fa-seedling' },
    'ZR=F': { name: 'Arroz rough', market: 'CME · CBOT Chicago', key: null, unit: '', icon: 'fa-bowl-rice' },
  },
  /* Un solo panel para las dos familias: el explorador de la sección unificada
     ofrece los diez instrumentos en un desplegable con dos grupos. */
  industriales: { ...INSTRUMENTOS_ENERGIA, ...INSTRUMENTOS_METALES },
};

/* Grupos del desplegable, solo para los paneles que mezclan familias. Un panel
   que no aparezca aquí pinta su lista plana, como siempre. */
const GRUPOS_INSTRUMENTOS = {
  industriales: [
    ['Energéticos · NYMEX/ICE', INSTRUMENTOS_ENERGIA, 'energia'],
    ['Metales · LME/COMEX', INSTRUMENTOS_METALES, 'metales'],
  ],
};

const TICKER_INICIAL = { granos: 'ZC=F', industriales: 'CL=F' };
const DECIMALES = { gasnat: 3, aluminio: 0 };

const num = (v, f = 0) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : f);
const fmtPct = (v) => `${num(v) >= 0 ? '+' : ''}${num(v).toFixed(2)}%`;
const mxnFmt = (v) => v.toLocaleString('es-MX', { maximumFractionDigits: 0 });

/* ── Carga de datos ─────────────────────────────────────────────────────────
   Devuelve el objeto `precios` con la misma forma que el original: por cada
   commodity, valor + _pct + _pct3m + _hist + _real. El sufijo _real distingue
   una cotización verdadera de un valor de referencia, y se usa para bajar la
   confianza en la perspectiva y para etiquetar en pantalla. */
async function cargarPrecios(VDS) {
  const [maiz, soja, wti, cobre, trigo, gasnat, aluminio, mxn, hogs, cattle] = await Promise.allSettled([
    VDS.commodityWithPct('CORN'), VDS.commodityWithPct('SOYBEANS'), VDS.commodityWithPct('CRUDE_OIL'),
    VDS.commodityWithPct('COPPER'), VDS.commodityWithPct('WHEAT'), VDS.commodityWithPct('NATURAL_GAS'),
    VDS.commodityWithPct('ALUMINUM'), VDS.usdmxn(),
    VDS.commodityWithPct('LEAN_HOGS'), VDS.commodityWithPct('LIVE_CATTLE'),
  ]);

  /* Todas las divisas, no solo el peso. VDS.usdmxn() pide este mismo endpoint y
     se queda con `rates.MXN`; el monitor necesita la tabla entera para poner el
     precio en la moneda de cada plaza. Se pide aparte y no se toca usdmxn(),
     que lo usan otras cinco pantallas.

     Va fuera del Promise.allSettled de arriba a propósito: si falla, el monitor
     enseña solo la columna en dólares y el resto de la sección no se entera. */
  let tasas = null;
  try {
    const r = await fetch('/api/exchange-rates');
    if (r.ok) tasas = (await r.json())?.rates || null;
  } catch { /* sin divisas: el monitor se queda en USD */ }

  const val = (r) => (r.status === 'fulfilled' && r.value != null ? r.value : null);
  const d = {
    maiz: val(maiz), soja: val(soja), wti: val(wti), cobre: val(cobre), trigo: val(trigo),
    gasnat: val(gasnat), aluminio: val(aluminio),
  };
  const mxnRate = val(mxn);
  const hogsD = val(hogs);
  const cattleD = val(cattle);

  const REF = { maiz: '4.82', soja: '342.50', trigo: '5.30', wti: '70.00', gasnat: '2.450', cobre: '4.18', aluminio: '2400' };
  const precios = {};
  for (const [k, v] of Object.entries(d)) {
    const dec = DECIMALES[k] ?? 2;
    precios[k] = v ? v.price.toFixed(dec) : REF[k];
    precios[`${k}_pct`] = v?.pct ?? 0;
    precios[`${k}_pct3m`] = v?.pct3m ?? null;
    precios[`${k}_hist`] = v?.history ?? null;
    precios[`${k}_real`] = !!v;
  }

  // El sorgo no cotiza en el tablero: se estima como maíz × 0.92.
  precios.sorgo = d.maiz ? (d.maiz.price * 0.92).toFixed(2) : '4.43';
  precios.sorgo_pct = d.maiz?.pct ?? 0;
  /* El diesel tampoco: se deriva del WTI.

     Su variación NO es la del WTI, aunque lo pareciera: `estimarDiesel` es
     wti/42×1.30 + 0.50, y ese sumando constante rompe la proporcionalidad. Con
     el WTI cayendo un 5.13% el diesel cae un 4.31% — heredar el porcentaje lo
     exageraba 1.19 veces. Es el mismo fallo que tenían el pollo y el huevo en
     Proteínas. Se recalcula aplicando la fórmula al precio anterior.

     El sorgo de arriba SÍ puede heredar el suyo: es maíz × 0.92, un factor puro
     sin constante, y ahí el porcentaje se conserva exactamente. */
  const wtiHoy = d.wti?.price ?? 70;
  precios.diesel = estimarDiesel(wtiHoy).toFixed(2);
  const wtiPrevio = d.wti?.pct != null && d.wti.pct !== -100
    ? wtiHoy / (1 + d.wti.pct / 100)
    : null;
  precios.diesel_pct = wtiPrevio != null && wtiPrevio > 0
    ? +((estimarDiesel(wtiHoy) / estimarDiesel(wtiPrevio) - 1) * 100).toFixed(2)
    : 0;

  return { precios, mxnRate, hogsD, cattleD, tasas };
}

/* Las tres fuentes traen la fecha de publicación, pero en dos formatos: ISO en
   Finnhub y el compacto YYYYMMDDTHHMMSS de Alpha Vantage y GDELT, que `Date` no
   sabe leer y convierte en NaN. */
function fechaNoticia(valor) {
  if (!valor) return null;
  let d = new Date(valor);
  if (Number.isNaN(d.getTime())) {
    const m = String(valor).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
    if (!m) return null;
    d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  }
  return Number.isNaN(d.getTime()) ? null : d;
}

/* Antes las ocho noticias mostraban la hora de carga de la página, la misma para
   todas: parecía que se habían publicado a la vez. Ahora cada una lleva la suya,
   en relativo, que es lo que interesa de una noticia.

   Si la fecha no se puede leer o cae fuera de lo razonable —negativa por un
   desfase de zona, o de hace meses— se vuelve a la hora de carga en vez de
   enseñar «hace -3 h». */
function etiquetaFecha(d, respaldo) {
  if (!d) return respaldo;
  const minutos = (Date.now() - d.getTime()) / 60000;
  if (minutos < -60 || minutos > 60 * 24 * 30) return respaldo;
  if (minutos < 60) return `hace ${Math.max(1, Math.round(minutos))} min`;
  const horas = minutos / 60;
  if (horas < 24) return `hace ${Math.round(horas)} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'ayer' : `hace ${dias} d`;
}

async function cargarNoticias(VDS, precios, mxnRate, hora) {
  const [av, fh, soy, wheat] = await Promise.allSettled([
    VDS.newsAlphaVantage('commodities', 8),
    VDS.finnhubNews('general'),
    VDS.gdeltNews('soybean', 10),
    VDS.gdeltNews('wheat', 10),
  ]);
  const usar = (r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);

  const cuando = (a) => etiquetaFecha(fechaNoticia(a.publishedAt), hora);
  /* `fecha` es la etiqueta que se lee («hace 2 h») y no sirve para ordenar. `ts`
     guarda el instante en milisegundos para que el minuto a minuto de la sala
     pueda ser de verdad cronológico; null cuando la fuente no manda fecha
     utilizable, y esas caen al final en vez de colarse como recentísimas. */
  const sello = (a) => fechaNoticia(a.publishedAt)?.getTime() ?? null;

  const todas = [
    ...usar(av).map((a) => ({ title: a.title, desc: a.description || '', src: a.source || 'Alpha Vantage', url: a.url || '', fecha: cuando(a), ts: sello(a), image: a.banner_image || a.image || '' })),
    ...usar(soy).map((a) => ({ title: a.title, desc: a.description || '', src: a.source || 'GDELT', url: a.url || '', fecha: cuando(a), ts: sello(a), image: a.image || '' })),
    ...usar(wheat).map((a) => ({ title: a.title, desc: a.description || '', src: a.source || 'GDELT', url: a.url || '', fecha: cuando(a), ts: sello(a), image: a.image || '' })),
    ...usar(fh).map((a) => ({ title: a.title, desc: a.description || a.summary || '', src: a.source || 'Finnhub', url: a.url || '', fecha: cuando(a), ts: sello(a), image: a.image || '' })),
  ];

  const vistos = new Set();
  const unicas = todas.filter((a) => {
    const k = (a.title || '').toLowerCase().slice(0, 50);
    if (!k || k.length < 8 || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  const dedup = (lista) => lista.filter((a, i, arr) => arr.findIndex((b) => (b.title || '').toLowerCase() === (a.title || '').toLowerCase()) === i);

  /* Los boletines son análisis propios de VALL sobre el maíz, la soja y la
     energía. Ninguna sección tiene ya panel de noticias propio, así que van
     todos al módulo Noticias: sin ellos, la sala se quedaría solo con lo que
     traen las agencias. */
  const bolGranos = boletinesGranos(precios, mxnRate, hora);
  const bolEnergia = boletinesEnergia(precios, mxnRate, hora);

  /* Un solo pool. Hubo paneles por sección que repartían los titulares por
     categoría con `de(cat)`; al retirarse el último, ese reparto dejó de tener
     destino y la función se fue con él — el módulo Noticias no filtra aquí,
     tiene sus propios filtros en la interfaz. */
  return {
    todas: dedup([...unicas, ...bolGranos, ...bolEnergia]).slice(0, 30),
  };
}

/* ── Piezas de interfaz ─────────────────────────────────────────────────────*/

function Variacion({ pct }) {
  const n = num(pct);
  return <div className={`cmt-pct ${n >= 0 ? 'up' : 'down'}`}>{fmtPct(n)}</div>;
}

/* Las agencias pegan su nombre al final del titular («… oil worries fester -
   Reuters») y la ficha ya lo enseña debajo, así que se quita cuando coincide con
   la fuente: repetido ocupa el ancho del titular, que es lo que se lee. El corte
   duro a 110 caracteres deja además la frase a medias sin avisar; ahora se marca
   con puntos suspensivos y sin partir la última palabra. */
const escapaRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Quita el nombre de la fuente pegado al final, con o sin guion delante: las
   agencias lo pegan de las dos formas («… fester - Reuters» y «… fester
   Reuters»). Se usa en el titular y en la bajada. */
function sinFirma(texto, src) {
  const t = (texto || '').trim();
  if (!src) return t;
  return t.replace(new RegExp(`\\s*[-|–—·]?\\s*${escapaRegex(src.trim())}\\s*$`, 'i'), '').trim();
}

function tituloNoticia(a) {
  const t = sinFirma(a.title, a.src);
  if (t.length <= 110) return t;
  const corte = t.slice(0, 109);
  const espacio = corte.lastIndexOf(' ');
  return `${(espacio > 70 ? corte.slice(0, espacio) : corte).trimEnd()}…`;
}

/**
 * La bajada, o null si no aporta nada.
 *
 * Varias de las fuentes conectadas mandan `description` igual al `title` —a
 * veces con el nombre de la agencia pegado detrás—, así que la ficha imprimía
 * el mismo titular dos veces seguidas, la segunda en gris y más pequeño. Ocupaba
 * tres líneas para no decir nada nuevo. Se compara sin acentos, sin puntuación y
 * sin la firma, y también por prefijo: `description` suele ser el titular más
 * una frase, o el titular cortado.
 */
function bajadaDe(a, limite) {
  const d = sinFirma(a.desc, a.src);
  if (!d) return null;
  const plano = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const pd = plano(d);
  const pt = plano(sinFirma(a.title, a.src));
  if (!pd || pd === pt || pt.startsWith(pd) || pd.startsWith(pt)) return null;
  return d.length > limite ? `${d.slice(0, limite).trimEnd()}…` : d;
}

/* La categoría que se enseña y por la que se filtra tienen que salir del mismo
   sitio. La ficha caía en 'macro' cuando el clasificador no acertaba ninguna,
   pero el filtro comparaba sin ese respaldo: al pulsar «Macro» salía «No hay
   noticias» justo debajo de una ficha etiquetada MACRO —los boletines propios,
   que el clasificador no reconoce, son precisamente los que caen ahí. */
const categoriaDe = (a) => clasificarNoticia(a.title) || clasificarNoticia(a.desc) || 'macro';

function TarjetaGrafica({ panel, titulo, precios, ticker, onTicker, rango, onRango, modo, onModo, listo }) {
  const meta = INSTRUMENTOS[panel][ticker];
  const precio = meta.key ? num(precios[meta.key], null) : null;
  const pct = meta.key ? num(precios[`${meta.key}_pct`], null) : null;
  const dec = DECIMALES[meta.key] ?? 2;
  const grupos = GRUPOS_INSTRUMENTOS[panel];

  /* El acento de la serie lo decide el INSTRUMENTO, no el panel. En la sección
     unificada un solo panel sirve energéticos y metales, y MktChart colorea por
     panel: sin esto, el cobre saldría con la línea naranja del petróleo. */
  const acento = grupos
    ? (grupos.find(([, lista]) => lista[ticker])?.[2] ?? 'granos')
    : panel;

  const opcion = ([t, m]) => <option key={t} value={t}>{m.name} · {t}</option>;

  return (
    <section className="grain-chart-card">
      <div className="grain-card-head">
        <div><small>Explorador histórico</small><h2>{titulo}</h2></div>
        <select className="chart-sel" value={ticker} onChange={(e) => onTicker(e.target.value)}>
          {grupos
            ? grupos.map(([etiqueta, lista]) => (
              <optgroup key={etiqueta} label={etiqueta}>
                {Object.entries(lista).map(opcion)}
              </optgroup>
            ))
            : Object.entries(INSTRUMENTOS[panel]).map(opcion)}
        </select>
      </div>

      <div className="grain-chart-snapshot">
        <span className="gcs-icon"><i className={`fas ${meta.icon}`} /></span>
        <div><small>{meta.market}</small><strong>{meta.name}</strong></div>
        <div className="gcs-price">
          <small>Último</small>
          <strong>{precio != null ? `$${precio.toFixed(dec)}${meta.unit}` : 'Histórico'}</strong>
        </div>
        <div className="gcs-change">
          <small>Variación mensual</small>
          <strong className={pct == null ? '' : pct >= 0 ? 'up' : 'down'}>
            {pct != null ? fmtPct(pct) : 'Consulta gráfica'}
          </strong>
        </div>
        <div className="gcs-status"><i /> Mercado de referencia</div>
      </div>

      <div className="grain-chart-toolbar">
        <div className="grain-view-switch">
          <span>Vista</span>
          {MODOS.map(([id, icono, texto]) => (
            <button key={id} type="button" className={modo === id ? 'active' : ''} onClick={() => onModo(id)}>
              <i className={`fas ${icono}`} /> {texto}
            </button>
          ))}
        </div>
        <div className="grain-period-control">
          <span>Periodo</span>
          <div className="chart-intervals">
            {RANGOS.map(([id, texto]) => (
              <button key={id} type="button" className={`chart-int-btn${rango === id ? ' active' : ''}`} onClick={() => onRango(id)}>
                {texto}
              </button>
            ))}
          </div>
        </div>
      </div>

      {listo
        ? <MktChart ticker={ticker} rango={rango} modo={modo} panel={acento} />
        : <div className="grain-chart-canvas" />}
    </section>
  );
}

/*
 * Interpola un número hacia su nuevo valor.
 *
 * En el simulador el usuario arrastra una barra y las cuatro cifras saltan de
 * golpe: no se ve la relación entre lo que movió y lo que cambió. Animando el
 * recorrido, el ojo sigue el cambio y entiende que una cosa causó la otra.
 *
 * Respeta `prefers-reduced-motion`: quien lo tenga activo recibe el valor final
 * directamente, sin recorrido.
 */
function useValorAnimado(valor, ms = 400) {
  const [mostrado, setMostrado] = useState(valor);
  const desde = useRef(valor);

  useEffect(() => {
    const sinMovimiento = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const fin = valor;
    const ini = desde.current;

    if (sinMovimiento || !Number.isFinite(ini) || !Number.isFinite(fin) || ini === fin) {
      desde.current = fin;
      setMostrado(fin);
      return undefined;
    }

    let raf;
    const t0 = performance.now();
    const paso = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      // easeOutCubic: arranca rápido y frena al llegar, que es como se lee mejor.
      const e = 1 - (1 - p) ** 3;
      const actual = ini + (fin - ini) * e;
      desde.current = actual;
      setMostrado(actual);
      if (p < 1) raf = requestAnimationFrame(paso);
      else { desde.current = fin; setMostrado(fin); }
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor, ms]);

  return mostrado;
}

/*
 * Una salida del simulador: cifra animada, la cuenta que la produce y cuánto se
 * aparta del escenario de hoy.
 *
 * El delta es lo que convierte el panel en una herramienta de decisión: saber
 * que el flete «son 30 pesos» no dice nada; saber que «son 30, un 19% más que
 * hoy» sí. Sin esa referencia, el usuario tendría que apuntar el valor inicial
 * antes de tocar nada para poder comparar.
 */
/* `etiquetaBase` existe desde que el simulador de put reutiliza esta tarjeta:
   allí la referencia no es «hoy» sino la cobertura completa al 100%, y dejar
   escrito «Frente a hoy» decía algo que no era. Por defecto sigue siendo la de
   Energía & Metales, que no se toca. */
function SalidaSim({ icono, titulo, valor, base, unidad, cuenta, nota, destacado, formato, etiquetaBase = 'Frente a hoy' }) {
  const animado = useValorAnimado(valor);
  const delta = Number.isFinite(base) && base !== 0 ? ((valor - base) / base) * 100 : null;
  /* Por debajo de medio punto se considera "igual": si no, el redondeo de los
     sliders enseña un +0.1% permanente que parece un cambio y no lo es. */
  const hayCambio = delta != null && Math.abs(delta) >= 0.5;

  return (
    <article className={`mkt-sim-salida${destacado ? ' es-total' : ''}`}>
      <header>
        <span className="mkt-sim-icono"><i className={`fas ${icono}`} aria-hidden="true" /></span>
        <h4>{titulo}</h4>
        {hayCambio && (
          <span className={`mkt-sim-delta ${delta > 0 ? 'es-sube' : 'es-baja'}`}>
            <i className={`fas ${delta > 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`} aria-hidden="true" />
            {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
          </span>
        )}
      </header>
      <strong>{formato(animado)}<em>{unidad}</em></strong>
      <code className="mkt-sim-cuenta">{cuenta}</code>
      <p>
        {nota}
        {hayCambio && (
          <span className="mkt-sim-vs">
            {' '}{etiquetaBase}: <b>{formato(base)}</b>.
          </span>
        )}
      </p>
    </article>
  );
}

/* ── Simuladores de cobertura con opciones (Granos) ─────────────────────────
 *
 * UN solo componente para el put y el call. Antes esto era el bloque del put
 * escrito a mano dentro de la pestaña; al entrar el call, copiarlo habría
 * dejado ~180 líneas de JSX duplicadas cuyas diferencias reales son el signo
 * de tres cuentas y el texto. Ese es exactamente el patrón que ya costó caro
 * en Finanzas: dos copias que se separan en cuanto alguien retoca una.
 *
 * Lo que cambia entre las dos vive en COPIA_OPCION, y lo que cambia de verdad
 * —la prima, el límite y los escenarios— en simularOpcion() (lib/mercados.js).
 * Aquí no hay ni una fórmula.
 */
/* Lo que cambia entre Granos y Proteínas no es la mecánica —es el mismo
   Black-76 sobre el mismo tipo de contrato del CME— sino QUIÉN está al otro
   lado. Un put de maíz lo compra el que cosecha; uno de cerdo, el que engorda.
   Meter esos nombres en el texto es la diferencia entre un panel que habla de
   tu negocio y uno genérico, y no justifica duplicar el componente. */
const COPIA_FAMILIA = {
  granos: {
    etiquetaSelect: 'Grano',
    elige: 'el grano',
    vendedor: 'productor',
    comprador: 'importador',
    compradores: 'el importador, el engordador, el molino',
    queSeCubre: 'cubrir cosecha',
    queSeCompra: 'grano',
  },
  proteinas: {
    etiquetaSelect: 'Proteína',
    elige: 'la proteína',
    vendedor: 'engordador',
    comprador: 'empacador',
    compradores: 'el empacador, el procesador, la cadena que compra carne',
    queSeCubre: 'cubrir una engorda',
    queSeCompra: 'carne',
  },
};

const COPIA_OPCION = {
  put: {
    iconoKicker: 'fa-umbrella',
    kicker: (f) => `Cobertura de venta · ${f.vendedor}`,
    titulo: 'Qué cuesta ponerle un suelo a tu precio',
    intro: (f) => (
      <>
        Un <b>put</b> te paga la caída si el mercado se hunde y te deja la subida si no.
        Elige {f.elige}, hasta dónde quieres protegerte y cuánto volumen tienes:
        el simulador calcula la <b>prima</b>, el <b>precio mínimo</b> que te queda
        garantizado y lo que cuesta la cobertura completa.
      </>
    ),
    /* Los atajos llevan escrito lo que aplican, igual que los del simulador
       energético: «Ajustada» sin el −10% no dice si son cinco puntos o cuarenta. */
    presets: (f) => [
      [90, 'Barata', '90%', 'Solo cubre caídas fuertes: prima baja, suelo lejos'],
      [95, 'Habitual', '95%', `El equilibrio que más se usa para ${f.queSeCubre}`],
      [100, 'Completa', '100%', 'Protege desde el precio de hoy: la prima más cara'],
    ],
    strikeIni: 95,
    strikeMin: 70,
    strikeMax: 110,
    strikeLbl: 'Precio protegido',
    strikeAyuda: (k) => (k >= 100
      ? 'protege desde el primer centavo de caída.'
      : `empieza a pagar cuando el mercado cae más de un ${100 - k}%.`),
    volumenQue: 'Cuántas toneladas quieres cubrir.',
    primaTitulo: 'Prima del put',
    /* El icono obvio para un suelo era `fa-arrow-down-to-line`, y es de Font
       Awesome PRO: aquí solo está la Free. Una clase de icono inexistente NO da
       error — deja un hueco mudo del tamaño del icono, que en una rejilla de
       cuatro tarjetas se lee como fallo de carga. Se comprueba con
       getComputedStyle(el, '::before').content. */
    limiteIcono: 'fa-hand-holding-dollar',
    limiteTitulo: 'Precio mínimo garantizado',
    limiteCuenta: (s) => `${s.strikeMT.toFixed(2)} strike − ${s.primaMT.toFixed(2)} prima`,
    limiteNota: (s) => `Un ${Math.abs(s.limitePct).toFixed(1)}% por debajo del futuro de hoy. `
      + 'Por aquí no bajas, pases lo que pases.',
    probCuenta: (s) => `N(−d₂) · delta ${s.delta.toFixed(3)}`,
    colPago: 'Paga el put',
    /* Quien vende quiere el número ALTO, así que la diferencia se lee
       «con cobertura − sin cobertura». En el call es al revés y por eso esto
       es un dato de la copia y no una resta fija en la tabla. */
    diferencia: (e) => e.efectivo - e.sinCobertura,
    escenarioPie: 'no caiga',
    sesgo: (f) => `los strikes bajos —los que compra un ${f.vendedor}—`,
  },
  call: {
    /* `fa-cart-shopping` y no otro carro: el kicker distingue de un vistazo los
       dos paneles, que por lo demás son idénticos. Free, comprobado. */
    iconoKicker: 'fa-cart-shopping',
    kicker: (f) => `Cobertura de compra · ${f.comprador}`,
    titulo: 'Qué cuesta ponerle un techo a tu precio',
    intro: (f) => (
      <>
        Un <b>call</b> te paga la subida si el mercado se dispara y te deja la baja si no.
        Es la cobertura del que <b>compra</b> {f.queSeCompra} —{f.compradores}—:
        elige {f.elige}, hasta dónde aguantas que suba y cuánto volumen
        necesitas, y el simulador calcula la <b>prima</b>, el <b>precio máximo</b> que te
        queda garantizado y lo que cuesta la cobertura completa.
      </>
    ),
    /* Mismo orden de lectura que el put —barata a la izquierda, completa a la
       derecha—, aunque aquí eso signifique strikes DESCENDENTES: en un call lo
       caro es el strike bajo. Ordenarlos al revés por simetría numérica pondría
       la opción más cara donde el usuario ya aprendió que está la más barata. */
    presets: () => [
      [110, 'Barata', '110%', 'Solo cubre subidas fuertes: prima baja, techo lejos'],
      [105, 'Habitual', '105%', 'El equilibrio que más se usa para cubrir compras'],
      [100, 'Completa', '100%', 'Protege desde el precio de hoy: la prima más cara'],
    ],
    strikeIni: 105,
    strikeMin: 90,
    strikeMax: 130,
    strikeLbl: 'Precio tope',
    strikeAyuda: (k) => (k <= 100
      ? 'protege desde el primer centavo de subida.'
      : `empieza a pagar cuando el mercado sube más de un ${k - 100}%.`),
    volumenQue: 'Cuántas toneladas necesitas comprar.',
    primaTitulo: 'Prima del call',
    limiteIcono: 'fa-file-invoice-dollar',
    limiteTitulo: 'Precio máximo garantizado',
    limiteCuenta: (s) => `${s.strikeMT.toFixed(2)} strike + ${s.primaMT.toFixed(2)} prima`,
    limiteNota: (s) => `Un ${Math.abs(s.limitePct).toFixed(1)}% por encima del futuro de hoy. `
      + 'Por aquí no subes, pase lo que pase.',
    probCuenta: (s) => `N(d₂) · delta ${s.delta.toFixed(3)}`,
    colPago: 'Paga el call',
    // Quien compra quiere el número BAJO: la diferencia va del revés que el put.
    diferencia: (e) => e.sinCobertura - e.efectivo,
    escenarioPie: 'no suba',
    sesgo: (f) => `los strikes altos —los que compra un ${f.comprador}—`,
  },
};

/* Estado y cálculo de un simulador. Es un hook y no estado suelto en la página
   porque hay CUATRO instancias —put y call, en Granos y en Proteínas— y cada
   una necesita su propio subyacente, su propio strike y su propia volatilidad:
   compartirlos haría que mover el put moviera el call.

   `fuente` es un mapa { clave: { precio, hist } } y no el objeto `precios` de la
   página: los granos viven ahí, pero el cerdo y la res llegan de dos objetos
   aparte (hogsD, cattleD) con otra forma. Prepararlo fuera deja el hook igual
   para las dos familias en vez de meterle un `if` por cada origen.

   `vol` en null NO significa «sin volatilidad»: significa «usa la que sale de
   la serie». Se distingue de un número porque al cambiar de subyacente hay que
   volver a la del nuevo, y con un número no habría forma de saber si el usuario
   lo puso a mano o lo dejó heredado del anterior. */
function useSimuladorOpcion(tipo, familia, fuente, fx) {
  const inicial = subyacentesDe(familia)[0][0];
  const [subyacente, setSubyacente] = useState(inicial);
  const [strike, setStrike] = useState(COPIA_OPCION[tipo].strikeIni);
  const [meses, setMeses] = useState(6);
  const [vol, setVol] = useState(null);
  const [tasa, setTasa] = useState(4.5);
  const [ton, setTon] = useState(500);

  const dato = fuente?.[subyacente];
  const volHist = useMemo(() => volatilidadHistorica(dato?.hist), [dato]);
  /* Si la serie no da para calcularla se arranca en 25, pero la vista lo dice y
     no lo presenta como un dato de mercado: es un punto de partida a ajustar. */
  const volUsada = vol ?? (volHist != null ? Math.round(volHist * 10) / 10 : 25);

  const comun = { tipo, subyacente, precio: dato?.precio, meses, vol: volUsada, tasa, toneladas: ton, fx };
  const sim = useMemo(
    () => simularOpcion({ ...comun, strikePct: strike }),
    [tipo, subyacente, dato, strike, meses, volUsada, tasa, ton, fx],
  );
  /* Referencia para los deltas de las tarjetas: la MISMA cobertura a strike
     100% y al plazo de hoy. Sin una base fija, cada tarjeta compararía contra
     sí misma y el delta sería siempre 0. */
  const base = useMemo(
    () => simularOpcion({ ...comun, strikePct: 100 }),
    [tipo, subyacente, dato, meses, volUsada, tasa, ton, fx],
  );

  return {
    familia, subyacente, strike, meses, vol, tasa, ton,
    setStrike, setMeses, setVol, setTasa, setTon,
    elegirSubyacente: (k) => { setSubyacente(k); setVol(null); },
    volHist, volUsada, sim, base,
  };
}

/*
 * La vista. Reutiliza el armazón `.mkt-sim` de Energía & Metales —mismos
 * controles, mismas tarjetas de salida con la cuenta a la vista— con el
 * modificador `.es-granos`, que solo cambia el acento: esa hoja tiene el
 * naranja de energía escrito en siete sitios.
 */
function SimuladorOpcion({ tipo, s }) {
  const c = COPIA_OPCION[tipo];
  const f = COPIA_FAMILIA[s.familia];
  const { sim, base } = s;
  if (!sim) return null;

  /* Los ids llevan la familia: con las cuatro instancias montadas, un
     `put-sim-t` repetido rompe el aria-labelledby —el lector de pantalla se
     queda con el primero— y duplica un id en el documento. */
  const id = `${s.familia}-${tipo}-sim-t`;

  return (
    <section className="mkt-sim es-granos" aria-labelledby={id}>
      <header className="mkt-sim-head">
        <div>
          <span className="grain-outlook-kicker">
            <i className={`fas ${c.iconoKicker}`} aria-hidden="true" /> {c.kicker(f)}
          </span>
          <h3 id={id}>{c.titulo}</h3>
          <p>{c.intro(f)}</p>
        </div>
        <div className="mkt-sim-moneda">
          <label>
            <span>{f.etiquetaSelect}</span>
            <select value={s.subyacente} onChange={(e) => s.elegirSubyacente(e.target.value)}>
              {subyacentesDe(s.familia).map(([k, g]) => (
                <option key={k} value={k}>{g.nombre}</option>
              ))}
            </select>
          </label>
          <small>
            Futuro hoy: ${sim.futuroMT.toFixed(2)}/MT
            {sim.unidad && ` · ${precioEnUnidad(sim.unidad, sim.precioUnidad)}`}
          </small>
        </div>
      </header>

      <div className="mkt-sim-cuerpo">
        <div className="mkt-sim-controles">
          <div className="mkt-sim-grupo">
            <h4><i className="fas fa-shield-halved" aria-hidden="true" /> La cobertura</h4>
            <p className="mkt-sim-que">
              Hasta dónde quieres protegerte y por cuánto tiempo. Un strike más{' '}
              {tipo === 'put' ? 'alto' : 'bajo'} protege antes y cuesta más.
            </p>
            <div className="mkt-sim-presets">
              {c.presets(f).map(([v, txt, delta, ayuda]) => (
                <button
                  key={v}
                  type="button"
                  title={ayuda}
                  className={s.strike === v ? 'is-activo' : undefined}
                  onClick={() => s.setStrike(v)}
                >
                  {txt}<em>{delta}</em>
                </button>
              ))}
            </div>
            <label className="mkt-sim-slider">
              <span className="mkt-sim-lbl">{c.strikeLbl}<em>% del futuro de hoy</em></span>
              <input
                type="range" min={c.strikeMin} max={c.strikeMax} step="1" value={s.strike}
                onChange={(e) => s.setStrike(+e.target.value)}
              />
              <b>{s.strike}%</b>
            </label>
            <label className="mkt-sim-slider">
              <span className="mkt-sim-lbl">Plazo<em>hasta el vencimiento</em></span>
              <input
                type="range" min="1" max="12" step="1" value={s.meses}
                onChange={(e) => s.setMeses(+e.target.value)}
              />
              <b>{s.meses} m</b>
            </label>
            <p className="mkt-sim-ayuda">
              Strike: ${sim.strikeMT.toFixed(2)}/MT
              {sim.unidad && ` (${precioEnUnidad(sim.unidad, sim.strikeUnidad)})`}
              {' — '}
              {c.strikeAyuda(s.strike)}
            </p>
          </div>

          <div className="mkt-sim-grupo">
            <h4><i className="fas fa-weight-hanging" aria-hidden="true" /> Tu volumen</h4>
            <p className="mkt-sim-que">{c.volumenQue}</p>
            <label className="mkt-sim-slider">
              <span className="mkt-sim-lbl">Toneladas<em>a cubrir</em></span>
              <input
                type="range" min="50" max="10000" step="50" value={s.ton}
                onChange={(e) => s.setTon(+e.target.value)}
              />
              <b>{mxnFmt(s.ton)}</b>
            </label>
            {/* El tamaño del contrato sale del catálogo y no escrito a mano:
                son 5 000 bushels en grano pero 40 000 libras en ganado, y con
                el número fijo la pestaña de Proteínas habría dicho «bushels de
                cerdo» sin que nada fallara. */}
            <p className="mkt-sim-ayuda">
              Son <b>{sim.contratos.toFixed(1)} contratos</b> del CME: cada uno son{' '}
              {mxnFmt(sim.unidadesPorContrato)} {sim.unidadLarga}, o sea{' '}
              {sim.toneladasPorContrato.toFixed(1)} toneladas de {sim.nombre.toLowerCase()}.
              El mercado solo vende contratos enteros.
            </p>
          </div>

          <div className="mkt-sim-grupo">
            <h4><i className="fas fa-wave-square" aria-hidden="true" /> Los supuestos</h4>
            {/* Esto NO son datos de mercado y el bloque lo dice: la volatilidad
                sale de la propia serie de precios y la tasa la pone el usuario.
                Ver el pie de la sección. */}
            <p className="mkt-sim-que">
              Los dos números que no vienen del tablero. Cámbialos si tienes una
              referencia mejor.
            </p>
            <label className="mkt-sim-slider">
              <span className="mkt-sim-lbl">Volatilidad<em>% anual</em></span>
              <input
                type="range" min="5" max="80" step="0.5" value={s.volUsada}
                onChange={(e) => s.setVol(+e.target.value)}
              />
              <b>{s.volUsada.toFixed(1)}%</b>
            </label>
            <label className="mkt-sim-slider">
              <span className="mkt-sim-lbl">Tasa de interés<em>% anual, USD</em></span>
              <input
                type="range" min="0" max="12" step="0.25" value={s.tasa}
                onChange={(e) => s.setTasa(+e.target.value)}
              />
              <b>{s.tasa.toFixed(2)}%</b>
            </label>
            <p className="mkt-sim-ayuda">
              {s.volHist != null ? (
                <>
                  La histórica {sim.de} es{' '}
                  <b>{s.volHist.toFixed(1)}%</b>, calculada con los seis meses de la
                  serie —son cinco rendimientos, así que es orientativa—.
                  {s.vol != null && (
                    <>
                      {' '}
                      <button type="button" className="put-reset" onClick={() => s.setVol(null)}>
                        Volver a la histórica
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  No hay serie suficiente para calcular la volatilidad de {sim.nombre.toLowerCase()}:
                  el <b>25%</b> es solo un punto de partida, no un dato de mercado. Ajústalo.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="mkt-sim-salidas">
          <SalidaSim
            icono="fa-receipt"
            titulo={c.primaTitulo}
            valor={sim.primaMT}
            base={base?.primaMT}
            unidad={`USD por tonelada${sim.unidad ? ` · ${precioEnUnidad(sim.unidad, sim.primaUnidad, 3)}` : ''}`}
            cuenta={`Black-76 · F ${sim.futuroMT.toFixed(2)} · K ${sim.strikeMT.toFixed(2)} · σ ${s.volUsada.toFixed(1)}% · ${s.meses}m`}
            nota={`Es el ${sim.costoPct.toFixed(1)}% del valor de la tonelada.`}
            formato={(v) => `$${v.toFixed(2)}`}
            etiquetaBase="Protegiendo el 100%"
          />
          <SalidaSim
            icono={c.limiteIcono}
            titulo={c.limiteTitulo}
            valor={sim.limiteMT}
            base={base?.limiteMT}
            unidad="USD por tonelada"
            cuenta={c.limiteCuenta(sim)}
            nota={c.limiteNota(sim)}
            formato={(v) => `$${v.toFixed(2)}`}
            etiquetaBase="Protegiendo el 100%"
            destacado
          />
          <SalidaSim
            icono="fa-sack-dollar"
            titulo="Costo de la cobertura"
            valor={sim.costoTotal}
            base={base?.costoTotal}
            unidad={sim.costoTotalMxn != null ? `USD · ${mxnFmt(sim.costoTotalMxn)} MXN` : 'USD'}
            cuenta={`${sim.primaMT.toFixed(2)} × ${mxnFmt(s.ton)} toneladas`}
            nota="Se paga por adelantado y no se recupera, ejerzas o no."
            formato={(v) => `$${mxnFmt(v)}`}
            etiquetaBase="Protegiendo el 100%"
          />
          <SalidaSim
            icono="fa-percent"
            titulo="Probabilidad de ejercerlo"
            valor={sim.probEjercicio}
            base={base?.probEjercicio}
            unidad="implícita en el precio"
            cuenta={c.probCuenta(sim)}
            nota="Es la probabilidad neutral al riesgo que implica la propia fórmula, no un pronóstico del mercado físico."
            formato={(v) => `${v.toFixed(1)}%`}
            etiquetaBase="Protegiendo el 100%"
          />
        </div>
      </div>

      {/* La tabla es lo que convierte el panel en una decisión: las cuatro
          tarjetas dicen qué cuesta, y esto dice qué pasa. Sin ella, el usuario
          tendría que creerse el límite sin ver nunca el caso en el que la
          cobertura NO sirve —el de arriba—. */}
      <div className="put-esc-marco">
        <h4 className="put-esc-titulo">
          <i className="fas fa-table-list" aria-hidden="true" /> Qué pasa en cada escenario
        </h4>
        <div className="put-esc-scroll">
          <table className="put-esc">
            <thead>
              <tr>
                <th scope="col">Si el mercado…</th>
                <th scope="col">Futuro<em>USD/MT</em></th>
                <th scope="col">Sin cobertura<em>USD/MT</em></th>
                <th scope="col">{c.colPago}<em>USD/MT</em></th>
                <th scope="col">Con cobertura<em>USD/MT</em></th>
                <th scope="col">Diferencia<em>USD/MT</em></th>
              </tr>
            </thead>
            <tbody>
              {sim.escenarios.map((e) => {
                const dif = c.diferencia(e);
                return (
                  <tr key={e.mov} className={e.mov === 0 ? 'es-hoy' : undefined}>
                    <th scope="row">
                      {e.mov === 0 ? 'se queda igual' : e.mov < 0 ? `cae ${Math.abs(e.mov)}%` : `sube ${e.mov}%`}
                    </th>
                    <td>{e.futuroFinal.toFixed(2)}</td>
                    <td>{e.sinCobertura.toFixed(2)}</td>
                    <td className={e.pago > 0 ? 'es-paga' : undefined}>
                      {e.pago > 0 ? `+${e.pago.toFixed(2)}` : '—'}
                    </td>
                    <td><b>{e.efectivo.toFixed(2)}</b></td>
                    <td className={dif >= 0 ? 'es-favor' : 'es-contra'}>
                      {dif >= 0 ? '+' : ''}{dif.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="put-esc-pie">
          La cobertura cuesta ${sim.primaMT.toFixed(2)}/MT pase lo que pase: por eso la
          última columna es negativa mientras el mercado {c.escenarioPie}. Se paga por no
          tener que adivinar cuál de estas filas va a ocurrir.
        </p>
      </div>

      <p className="mkt-sim-pie">
        <i className="fas fa-triangle-exclamation" aria-hidden="true" />
        <span>
          <b>Es una prima teórica, no una cotización.</b> El proyecto no tiene ningún
          feed de primas de opciones: esto es Black-76 sobre el futuro que sí cotiza,
          con la volatilidad calculada de su propia serie. El mercado real cobra más,
          por la horquilla y porque {c.sesgo(f)} se pagan con sobreprecio. Además
          Black-76 valora una opción europea y las del CME son americanas, así que
          esta cifra es un <b>suelo</b> de lo que te van a pedir, nunca un techo.
          Para operar, pide la prima a tu bróker.
        </span>
      </p>
    </section>
  );
}

/* ── Interés abierto (COT) ──────────────────────────────────────────────────
 *
 * Curva de 53 semanas en SVG a mano y no con MktChart: aquí no hace falta una
 * gráfica con ejes, tooltip y destrucción al cambiar de pestaña, sino una línea
 * que diga «esto viene subiendo». Montar tres instancias de LightweightCharts
 * dentro de la rejilla costaría más de lo que aporta.
 *
 * Sin `preserveAspectRatio="none"`: estirar el viewBox deformaría el grosor del
 * trazo y convertiría el punto final en una elipse. Escala proporcional y el
 * ancho lo pone el CSS.
 */
function MiniSerie({ valores, etiqueta }) {
  const W = 220;
  const H = 44;
  const P = 4;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const span = max - min || 1;
  const x = (i) => P + (i * (W - P * 2)) / (valores.length - 1);
  const y = (v) => H - P - ((v - min) / span) * (H - P * 2);

  const linea = valores.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${linea} L${x(valores.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`;

  return (
    <svg className="oi-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={etiqueta}>
      <path className="oi-spark-area" d={area} />
      <path className="oi-spark-linea" d={linea} vectorEffect="non-scaling-stroke" />
      <circle
        className="oi-spark-hoy"
        cx={x(valores.length - 1)}
        cy={y(valores[valores.length - 1])}
        r="2.6"
      />
    </svg>
  );
}

/*
 * El panel. Un grano por tarjeta, y en cada una el mismo orden de lectura:
 * cuánto hay abierto → cómo viene → quién lo tiene.
 *
 * El dato NO se colorea como un precio. Que el interés abierto suba no es bueno
 * ni malo —significa que entra dinero, y entra en los dos sentidos a la vez—,
 * así que su variación va en gris con una flecha. Lo que sí tiene signo es la
 * posición NETA de cada grupo, y ahí sí van el verde y el rojo del tablero.
 */
function PanelOpenInterest({ oi, nota }) {
  if (!oi) return null;
  const rezago = diasDelCot(oi.fecha);
  const id = `oi-${oi.familia}-t`;

  return (
    <section className="oi-panel" aria-labelledby={id}>
      <header className="oi-head">
        <div>
          <span className="grain-outlook-kicker">
            <i className="fas fa-layer-group" aria-hidden="true" /> Estructura del mercado
          </span>
          <h3 id={id}>Interés abierto: cuánto dinero sigue comprometido</h3>
          <p>
            El <b>interés abierto</b> son los contratos que siguen vivos, no los que se
            operaron hoy: solo sube cuando entran un comprador y un vendedor nuevos a la
            vez, así que mide <b>compromiso</b> y no actividad. Al lado va quién lo tiene
            —fondos, industria o pequeños—, que es lo que convierte el número en una lectura.
            {nota && <> {nota}</>}
          </p>
        </div>
        <div className="oi-sello">
          <small>CFTC · COT</small>
          <b>{oi.fecha}</b>
          <small>
            {rezago != null ? `${rezago} ${rezago === 1 ? 'día' : 'días'} de rezago` : 'corte semanal'}
          </small>
        </div>
      </header>

      <div className="oi-grid">
        {oi.contratos.map((g) => (
          <article className="oi-card" key={g.clave}>
            <header className="oi-card-head">
              <h4>{g.nombre}</h4>
              <span className="oi-contrato">{g.contrato}</span>
            </header>

            <div className="oi-cifra">
              <strong>{mxnFmt(g.oi)}</strong>
              <em>contratos abiertos</em>
              <span className="oi-var">
                <i
                  className={`fas ${g.oiVar >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'}`}
                  aria-hidden="true"
                />
                {g.oiVar >= 0 ? '+' : ''}{g.oiVar.toFixed(1)}% en la semana
              </span>
            </div>

            <MiniSerie
              valores={g.serie.map((p) => p.oi)}
              etiqueta={`Interés abierto de ${g.nombre.toLowerCase()}, últimas ${g.serie.length} semanas`}
            />
            {g.rangoOi && (
              <p className="oi-rango">
                Rango del año: {mxnFmt(g.rangoOi.min)} – {mxnFmt(g.rangoOi.max)} ·
                hoy en el <b>{g.rangoOi.pct.toFixed(0)}%</b> de esa banda.
              </p>
            )}

            {/* Aquí llegó a ir una tira de «volumen de la sesión». Se retiró el
                25/08/2026 al medir la fuente: el volumen de la serie continua de
                Yahoo está roto por los roll de vencimiento. El diagnóstico
                completo, con cifras, está en lib/mercados.js sobre
                CATEGORIAS_COT. */}

            <div className="oi-cats">
              {/* La cuarta columna es el cambio de la semana y necesita su
                  rótulo: un «+57,238» suelto al lado de un neto se lee como
                  parte del mismo número. Es el mismo defecto que ya se corrigió
                  en las tarjetas de señal —un valor sin decir contra qué—. */}
              <div className="oi-cats-cab">
                <span>Posición neta</span>
                <span>corto ← → largo</span>
                <span>semana</span>
              </div>
              {g.categorias.map((c) => (
                <div className="oi-cat" key={c.clave} title={c.ayuda}>
                  <span className="oi-cat-nombre">{c.nombre}</span>
                  <b className={c.neto >= 0 ? 'es-largo' : 'es-corto'}>
                    {c.neto >= 0 ? '+' : '−'}{mxnFmt(Math.abs(c.neto))}
                  </b>
                  {/* Cero en el centro: la barra crece a la derecha si el grupo
                      está largo y a la izquierda si está corto. Las tres
                      comparten la escala del grano (escalaNeto) para que se
                      puedan comparar entre sí. */}
                  <span className="oi-barra">
                    <i
                      className={c.neto >= 0 ? 'es-largo' : 'es-corto'}
                      style={{ width: `${(Math.abs(c.neto) / g.escalaNeto) * 50}%` }}
                    />
                  </span>
                  <small className={c.cambio >= 0 ? 'es-largo' : 'es-corto'}>
                    {c.cambio >= 0 ? '+' : '−'}{mxnFmt(Math.abs(c.cambio))}
                  </small>
                </div>
              ))}
            </div>

            <p className="oi-lectura"><i className="fas fa-quote-left" aria-hidden="true" />{g.lectura}</p>
          </article>
        ))}
      </div>

      <p className="mkt-sim-pie">
        <i className="fas fa-triangle-exclamation" aria-hidden="true" />
        <span>
          <b>Es un dato semanal y con rezago.</b> La CFTC publica el COT cada viernes
          con corte al <b>martes</b> anterior, así que la foto tiene tres días cuando sale
          y hasta diez al final de la semana. Sirve para leer posicionamiento —quién está
          de qué lado y si se está moviendo—, nunca para operar sobre el precio de hoy.
          Informe <i>Legacy, futures only</i>: no incluye las opciones que valoran los
          simuladores de abajo.
        </span>
      </p>
    </section>
  );
}

/*
 * Termómetro de tres posiciones.
 *
 * Sustituye a la tarjeta <Senal> en Energía & Metales. El problema de aquellas
 * era que enseñaban un valor cualitativo suelto —«Media», «Mixta», «Débil»— sin
 * decir contra qué. Un usuario que lee «Volatilidad: Media» no sabe si eso es
 * bueno, malo, ni entre qué extremos se mueve; y ocho tarjetas idénticas en
 * rejilla se leen como un formulario, no como una lectura de mercado.
 *
 * Aquí el valor se sitúa en su escala: se ven las tres posiciones posibles y
 * cuál está encendida. «Media» pasa de ser una palabra a ser un punto entre
 * «Baja» y «Alta».
 *
 * `sentido` dice hacia dónde es malo: en volatilidad y riesgo, más es peor
 * ('alto-malo'); en demanda industrial, más es mejor ('alto-bueno'). Sin eso el
 * color mentiría en la mitad de los casos.
 */
function Termometro({ icono, titulo, valor, niveles, nota, sentido = 'alto-malo' }) {
  const i = niveles.findIndex((n) => n.toLowerCase() === String(valor || '').toLowerCase());
  const pos = i < 0 ? null : i;
  /* El tono sale de la POSICIÓN y del sentido, no del texto: así «Débil» en
     demanda y «Alta» en riesgo comparten color de alerta aunque no se parezcan
     en nada como palabras. */
  const tono = pos == null ? 'nulo'
    : sentido === 'alto-bueno'
      ? ['malo', 'medio', 'bueno'][pos]
      : ['bueno', 'medio', 'malo'][pos];

  return (
    <article className={`mkt-term es-${tono}`}>
      <header>
        <span className="mkt-term-icono"><i className={`fas ${icono}`} aria-hidden="true" /></span>
        <h4>{titulo}</h4>
      </header>
      <strong>{valor || '—'}</strong>
      <ol className="mkt-term-escala" aria-label={`Escala: ${niveles.join(', ')}`}>
        {niveles.map((n, k) => (
          <li key={n} className={k === pos ? 'is-activo' : undefined} aria-current={k === pos ? 'true' : undefined}>
            <i aria-hidden="true" />
            <span>{n}</span>
          </li>
        ))}
      </ol>
      <p>{nota}</p>
    </article>
  );
}

/* `Senal` vivía aquí y se retiró el 25/08/2026 con la rejilla de cinco señales
   de Proteínas, que era su última usuaria — Energía & Metales ya había pasado a
   `Termometro` por los motivos del comentario de arriba. Las clases
   `.grain-signal-card` y `.grain-signal-icon` NO se tocan: siguen vivas en la
   hoja heredada y las usan otras secciones. */

/* ── Matriz de países × proteínas ───────────────────────────────────────────
 * Sustituye al ranking de «Consumo por persona», que enseñaba siete países.
 * Siete no son el mundo: dejaban fuera a Vietnam, Nigeria o la India, que es
 * donde se está moviendo la demanda. Aquí caben los 152 que publica la FAO.
 *
 * Sigue el patrón del Monitor por plazas de Granos —matriz con las primeras
 * columnas congeladas dentro de .grain-table-scroll— porque el problema es el
 * mismo: con nueve columnas hay que desplazarse a lo ancho, y al hacerlo se
 * pierde de vista de qué país es la fila.
 *
 * Los nombres de clase son propios (.pm-*) y no los .mz-* de aquella matriz.
 * Es la regla de esta hoja: mercados-redesign-v2.css se carga por usePageStyles
 * y el orden entre las dos hojas no está garantizado, así que reutilizar sus
 * selectores sería pelearse por la especificidad a ciegas.
 */
const COLS_MATRIZ = [
  { id: 'prod', txt: 'Produce', uni: 'Mt', ancla: 'pm-prod' },
  { id: 'cons', txt: 'Consume', uni: 'Mt', ancla: 'pm-cons' },
  { id: 'auto', txt: 'Autosuf.', uni: '%' },
  { id: 'kg', txt: 'Por persona', uni: 'kg/año' },
];

function MatrizProteinas({ filas, mundo, proteinas: catalogo }) {
  /* Arranca por producción y de mayor a menor: es el orden con el que se lee un
     mercado, y deja arriba a los países de los que se habla en el resto de la
     sección. */
  const [orden, setOrden] = useState({ col: 'prod', dir: -1 });

  const ordenadas = useMemo(() => {
    const valor = (f) => {
      if (orden.col === 'ne') return nombreEs(f.ne);
      if (COLS_MATRIZ.some((c) => c.id === orden.col)) return f[orden.col] ?? -1;
      /* En las columnas de proteína se ordena por PRODUCCIÓN, que es la cifra
         grande de la celda. Ordenar por el número pequeño dejaría una columna
         que se ordena por algo que no es lo que se está mirando. */
      return f.porProteina[orden.col]?.prod ?? -1;
    };
    return [...filas].sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      return typeof va === 'string' ? orden.dir * va.localeCompare(vb, 'es') : orden.dir * (va - vb);
    });
  }, [filas, orden]);

  /* Al cambiar de columna se arranca en el sentido útil de cada una: los
     números de mayor a menor y el nombre de la A a la Z. Volver a pulsar la
     misma invierte. */
  const ordenar = (col) => setOrden((o) => (
    o.col === col ? { col, dir: -o.dir } : { col, dir: col === 'ne' ? 1 : -1 }
  ));

  const aria = (col) => (orden.col !== col ? 'none' : orden.dir === 1 ? 'ascending' : 'descending');
  const Cabecera = ({ col, clase, children }) => (
    <th className={`${clase || ''}${orden.col === col ? ' es-orden' : ''}`} aria-sort={aria(col)} scope="col">
      <button type="button" onClick={() => ordenar(col)}>
        {children}
        <i className={`fas ${orden.col !== col ? 'fa-sort' : orden.dir === 1 ? 'fa-sort-up' : 'fa-sort-down'}`} aria-hidden="true" />
      </button>
    </th>
  );

  /* El «<0.01» del final no es un adorno: sin él, las 3 000 toneladas de cerdo
     de Bahamas se imprimían como «0.00», que en una columna de cifras se lee
     como un cero — es decir, como «aquí no hay», que es lo contrario de lo que
     dice el dato. La celda vacía de verdad va con guion. */
  const mt = (v) => (
    v >= 10 ? v.toFixed(0)
      : v >= 1 ? v.toFixed(1)
        : v >= 0.01 ? v.toFixed(2)
          : v > 0 ? '<0.01' : '0'
  );

  const Fila = ({ f, destacada }) => (
    <tr className={destacada || undefined}>
      <th className="pm-pais" scope="row">{f.ne === 'MUNDO' ? 'Mundo' : nombreEs(f.ne)}</th>
      <td className="pm-prod"><span className="pm-monto">{mt(f.prod)}</span></td>
      <td className="pm-cons"><span className="pm-monto">{mt(f.cons)}</span></td>
      <td className="pm-auto">
        {f.auto != null ? (
          <>
            <span className="pm-monto">{f.auto.toFixed(0)}<em>%</em></span>
            {/* Barra recortada al 200%: sin tope, Uruguay (601%) estiraría la
                escala y las decenas de países que rondan el 100% quedarían
                indistinguibles unos de otros. La cifra sigue siendo exacta. */}
            <span className="pm-auto-barra">
              <i style={{ width: `${Math.min(100, (f.auto / 200) * 100)}%` }} />
              <u aria-hidden="true" />
            </span>
          </>
        ) : <span className="pm-nulo">—</span>}
      </td>
      <td className="pm-kg"><span className="pm-monto">{f.kg != null ? f.kg.toFixed(0) : '—'}</span></td>
      {catalogo.map(([clave]) => {
        const c = f.porProteina[clave];
        return (
          <td key={clave} className="pm-esp">
            {c.prod > 0 || c.cons > 0 ? (
              <>
                <span className="pm-monto">{mt(c.prod)}</span>
                <span className="pm-sub">come {mt(c.cons)}</span>
              </>
            ) : <span className="pm-nulo">—</span>}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className="grain-table-scroll pm-scroll">
      <table className="pm-matriz">
        {/* La entradilla del bloque ya cuenta esto en pantalla; el <caption> es
            para quien navega la tabla con un lector, que llega a ella sin haber
            pasado por el párrafo de arriba. Va oculto visualmente y no con
            `display:none`, que lo quitaría también del árbol de accesibilidad. */}
        <caption>Producción y consumo de carne y huevo por país, en millones de toneladas. Pulsa una cabecera para ordenar.</caption>
        <thead>
          <tr>
            <Cabecera col="ne" clase="pm-pais">País</Cabecera>
            {COLS_MATRIZ.map((c) => (
              <Cabecera key={c.id} col={c.id} clase={c.ancla}>
                {c.txt}<small>{c.uni}</small>
              </Cabecera>
            ))}
            {catalogo.map(([clave, nombre]) => (
              <Cabecera key={clave} col={clave} clase="pm-esp">
                {nombre}<small>Mt</small>
              </Cabecera>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* El mundo va fijo arriba y fuera del orden: es la vara de medir de
              todas las filas, no un competidor del ranking. */}
          <Fila f={mundo} destacada="es-mundo" />
          {ordenadas.map((f) => <Fila key={f.ne} f={f} destacada={f.ne === 'Mexico' ? 'es-mexico' : null} />)}
        </tbody>
      </table>
    </div>
  );
}

/* ── Catálogo de proteínas alternativas ─────────────────────────────────────
 * Responde a la primera mitad de la pregunta —«qué proteínas alternativas
 * hay»— antes de que la matriz responda a la segunda. Sin este paso, la tabla
 * llega con nueve columnas cuyos rótulos no dicen si el frijol y el alga están
 * ahí por lo mismo, ni por qué las hortalizas aparecen encima de las legumbres.
 *
 * Cada ficha lleva la cifra mundial de su familia, que es la vara con la que se
 * lee después cada país: cuando la matriz enseña 9.1 g de legumbre en India,
 * lo que importa es que el mundo está en 4.7.
 */
function CatalogoAlt({ mundo }) {
  return (
    <>
      <ol className="ca-grid">
        {FAMILIAS_ALT.map((f) => {
          const g = mundo.g[f.clave];
          const pct = mundo.pct[f.clave];
          return (
            <li key={f.clave} className={`ca-ficha es-${f.grupo} fam-${f.clave}`}>
              <header>
                <span className="ca-icono"><i className={`fas ${f.icono}`} aria-hidden="true" /></span>
                <div>
                  <h4>{f.nombre}</h4>
                  <p className="ca-que">{f.que}</p>
                </div>
              </header>

              <div className="ca-cifra">
                <strong>{g != null ? g.toFixed(2) : '—'}<em>g/día</em></strong>
                <span>
                  {/* La barra es minúscula a propósito: no compara familias entre
                      sí —para eso está el reparto de arriba—, sitúa a esta dentro
                      del total de proteína del mundo. Por eso la escala es el
                      total y no el máximo de la lista. */}
                  <i style={{ width: `${Math.min(100, (pct ?? 0) * 2.4)}%` }} />
                </span>
                <b>{pct != null ? `${pct.toFixed(1)}%` : '—'}<small> de la proteína mundial</small></b>
              </div>

              {/* Solo las oleaginosas traen desglose, y es el dato que ancla el
                  bloque con Granos: cuánta de esa proteína es SOJA, la misma que
                  se muele para la ración. Sin él, la ficha dice que compite con
                  el alimento y no enseña con cuánto. */}
              {f.detalle && (
                <ul className="ca-detalle">
                  {f.detalle.map(([clave, etiqueta]) => (
                    <li key={clave}>
                      <span>{etiqueta}</span>
                      <b>{mundo.g[f.clave] && DIETA_MUNDO[clave] != null ? `${DIETA_MUNDO[clave].toFixed(2)} g` : '—'}</b>
                      <em>
                        {DIETA_MUNDO[clave] != null && mundo.g[f.clave]
                          ? `${((DIETA_MUNDO[clave] / mundo.g[f.clave]) * 100).toFixed(0)}% de la familia`
                          : ''}
                      </em>
                    </li>
                  ))}
                </ul>
              )}

              <p className="ca-lectura">{f.lectura}</p>
              <p className="ca-mercado"><i className="fas fa-chart-line" aria-hidden="true" />{f.mercado}</p>

              <span className={`ca-tag es-${f.grupo}`}>
                {f.grupo === 'sustituta' ? 'Sustituye a la carne' : 'Proteína de acompañamiento'}
              </span>
            </li>
          );
        })}
      </ol>

      {/* ── Lo que la fuente no mide ──────────────────────────────────────
          Va DENTRO del catálogo y no en una nota al pie porque forma parte de
          la respuesta: quien pregunta qué proteínas alternativas hay está
          pensando justo en estas cuatro, y encontrarlas ausentes de la tabla
          sin explicación se lee como un olvido. Ninguna lleva cifra, que es
          exactamente el punto. */}
      <div className="ca-sinmedir">
        <h4>
          <i className="fas fa-circle-question" aria-hidden="true" />
          Y las que existen pero la FAO no mide
        </h4>
        <p>
          Estas cuatro son las que suelen llamarse «proteínas alternativas» en el
          sector, y ninguna tiene fila propia en las hojas de balance. No se les pone
          cifra por país porque no la hay: lo que circula son estimaciones de
          consultora que no se pueden poner en la misma tabla que lo demás.
        </p>
        <ol>
          {ALT_SIN_MEDIR.map((a) => (
            <li key={a.nombre}>
              <span className="ca-sm-icono"><i className={`fas ${a.icono}`} aria-hidden="true" /></span>
              <div>
                <b>{a.nombre}</b>
                <em>{a.que}</em>
                <small><i className="fas fa-ban" aria-hidden="true" /> {a.porque}</small>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

/* ── La matriz de alternativas ──────────────────────────────────────────────
 * Países × familias, en gramos de proteína por habitante y día.
 *
 * Sigue el patrón de MatrizProteinas —columnas de identidad congeladas, orden
 * por cualquier cabecera, el mundo fijo arriba— porque el problema de lectura es
 * el mismo. Lo que añade es el MAPA DE CALOR de las celdas, y ahí hay dos
 * decisiones que conviene dejar dichas:
 *
 *   1. La intensidad es relativa a SU columna, no a la tabla. El cereal va de 20
 *      a 60 g y el alga de 0 a 3: con una escala común, la matriz sería una
 *      columna oscura y ocho en blanco.
 *   2. El tono es el del GRUPO —verde vegetal, azul acuático—, los mismos dos
 *      colores del reparto de arriba. Así el color no encoda dos cosas a la vez:
 *      el tono dice de qué origen es la familia y la intensidad cuánto se come.
 *
 * Los nombres de clase son propios (.ma-*) por la misma razón que los .pm-*:
 * mercados-redesign-v2.css se carga aparte y el orden entre hojas no está
 * garantizado.
 */
const BANDAS_CALOR = 5;

function MatrizAlternativas({ filas, mundo }) {
  /* Arranca por la proporción no ganadera y de mayor a menor: es la respuesta
     directa a la pregunta del bloque, y deja arriba los países que viven de la
     proteína alternativa en vez de los que simplemente comen mucho. */
  const [orden, setOrden] = useState({ col: 'pctNoGanadera', dir: -1 });
  const [unidad, setUnidad] = useState('g');
  const [busca, setBusca] = useState('');

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    /* Se normalizan los acentos en los dos lados: quien escribe «peru» sin
       tilde busca Perú, y sin esto la tabla le contesta que no hay nada. */
    const plano = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const filtradas = q ? filas.filter((f) => plano(f.pais).includes(plano(q))) : filas;

    const valor = (f) => {
      if (orden.col === 'pais') return f.pais;
      if (f.g[orden.col] !== undefined) return f.g[orden.col] ?? -1;
      return f[orden.col] ?? -1;
    };
    return [...filtradas].sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      return typeof va === 'string' ? orden.dir * va.localeCompare(vb, 'es') : orden.dir * (va - vb);
    });
  }, [filas, orden, busca]);

  /* Los topes salen de TODAS las filas y no de las visibles: si el mapa de calor
     se recalibrara al escribir en el buscador, el mismo país cambiaría de
     intensidad según lo que hubiera escrito al lado. La escala tiene que ser
     una sola para toda la tabla. */
  const topes = useMemo(() => topesColumna(filas), [filas]);

  const ordenar = (col) => setOrden((o) => (
    o.col === col ? { col, dir: -o.dir } : { col, dir: col === 'pais' ? 1 : -1 }
  ));

  const aria = (col) => (orden.col !== col ? 'none' : orden.dir === 1 ? 'ascending' : 'descending');
  const Cabecera = ({ col, clase, children, titulo }) => (
    <th className={`${clase || ''}${orden.col === col ? ' es-orden' : ''}`} aria-sort={aria(col)} scope="col" title={titulo}>
      <button type="button" onClick={() => ordenar(col)}>
        {children}
        <i className={`fas ${orden.col !== col ? 'fa-sort' : orden.dir === 1 ? 'fa-sort-up' : 'fa-sort-down'}`} aria-hidden="true" />
      </button>
    </th>
  );

  /* Dos decimales por debajo de 1: el alga de la mayoría de países vive entre
     0.01 y 0.4 g, y con un decimal media columna se imprimiría como «0.0» —que
     se lee como «aquí no hay», justo lo contrario del dato. */
  const gr = (v) => (v == null ? null : v >= 10 ? v.toFixed(1) : v.toFixed(2));

  const Celda = ({ fila, fam }) => {
    const v = fila.g[fam.clave];
    if (v == null) return <td className={`ma-cel fam-${fam.clave}`}><span className="ma-nulo">—</span></td>;

    const tope = topes[fam.clave] || 1;
    /* Raíz cuadrada y no proporción directa. Casi todas estas familias tienen
       una cola larguísima —un país con 3 g de alga y ciento cuarenta por debajo
       de 0.3— y en lineal esos ciento cuarenta salen todos con el mismo tinte
       imperceptible. La raíz reparte los cinco pasos por donde están los datos.
       No cambia el número de la celda, solo cuánto se nota. */
    const banda = Math.min(BANDAS_CALOR, Math.ceil(Math.sqrt(v / tope) * BANDAS_CALOR)) || 1;
    const esDom = fila.dominante?.clave === fam.clave;

    return (
      <td
        className={`ma-cel fam-${fam.clave} ma-b${banda}${esDom ? ' es-dominante' : ''}`}
        /* El dominante se marca con un recuadro, pero un recuadro no lo oye
           nadie: el título lo dice con palabras para quien va por lector. */
        title={esDom ? `${fam.nombre}: la mayor fuente alternativa de ${fila.pais}` : undefined}
      >
        <span className="ma-val">
          {unidad === 'g' ? gr(v) : fila.pct[fam.clave].toFixed(1)}
          <em>{unidad === 'g' ? 'g' : '%'}</em>
        </span>
      </td>
    );
  };

  const Fila = ({ f, destacada }) => (
    <tr className={destacada || undefined}>
      <th className="ma-pais" scope="row">
        {f.pais}
        {f.dominante && <small>{f.dominante.corto}</small>}
      </th>
      <td className="ma-no-gan">
        <span className="ma-val">{f.pctNoGanadera.toFixed(0)}<em>%</em></span>
        {/* Barra de dos tramos: dentro de lo no ganadero, cuánto es vegetal y
            cuánto acuático. Es la misma lectura del reparto de arriba, repetida
            en miniatura para poder seguirla fila a fila. */}
        <span className="ma-ng-barra" aria-hidden="true">
          <i className="es-veg" style={{ width: `${(f.total ? ((f.noGanadera - (f.g.pescado || 0) - (f.g.alga || 0)) / f.total) * 100 : 0)}%` }} />
          <i className="es-agua" style={{ width: `${(f.total ? (((f.g.pescado || 0) + (f.g.alga || 0)) / f.total) * 100 : 0)}%` }} />
        </span>
      </td>
      <td className="ma-total"><span className="ma-val">{f.total.toFixed(0)}<em>g</em></span></td>
      {FAMILIAS_ALT.map((fam) => <Celda key={fam.clave} fila={f} fam={fam} />)}
    </tr>
  );

  return (
    <>
      <div className="ma-controles">
        <div className="ma-busca">
          <i className="fas fa-magnifying-glass" aria-hidden="true" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar país…"
            aria-label="Filtrar la matriz por nombre de país"
          />
        </div>
        <div className="ma-unidad" role="group" aria-label="Unidad de las celdas">
          {[['g', 'Gramos al día'], ['pct', '% de su proteína']].map(([id, txt]) => (
            <button key={id} type="button" className={unidad === id ? 'active' : ''} onClick={() => setUnidad(id)}>
              {txt}
            </button>
          ))}
        </div>
        <span className="ma-cuenta">
          {visibles.length === filas.length
            ? `${filas.length} países`
            : `${visibles.length} de ${filas.length}`}
        </span>
      </div>

      {/* La leyenda del calor va fuera de la tabla y no dentro de una celda: si
          va dentro, se desplaza con el scroll horizontal y desaparece justo
          cuando hace falta, que es al mirar las columnas de la derecha. */}
      <div className="ma-leyenda">
        <span><i className="ma-sw es-veg" aria-hidden="true" /> Vegetal</span>
        <span><i className="ma-sw es-agua" aria-hidden="true" /> Acuática</span>
        <span className="ma-leyenda-calor">
          Menos
          {Array.from({ length: BANDAS_CALOR }, (_, i) => (
            <i key={i} className={`ma-sw fam-cereal ma-b${i + 1}`} aria-hidden="true" />
          ))}
          Más <small>· dentro de cada columna</small>
        </span>
        <span className="ma-leyenda-dom"><i className="ma-sw es-dom" aria-hidden="true" /> Familia dominante del país</span>
      </div>

      <div className="grain-table-scroll ma-scroll">
        <table className="ma-matriz">
          <caption>
            Proteína alternativa por país y familia, en gramos por habitante y día, año {ANIO_PROT}.
            Pulsa una cabecera para ordenar por esa columna.
          </caption>
          <thead>
            <tr>
              <Cabecera col="pais" clase="ma-pais">País</Cabecera>
              <Cabecera col="pctNoGanadera" clase="ma-no-gan" titulo="Vegetal, pescado y algas sobre el total de proteína del país">
                No ganadera<small>%</small>
              </Cabecera>
              <Cabecera col="total" clase="ma-total" titulo="Toda la proteína de la dieta, de cualquier origen">
                Dieta<small>g/día</small>
              </Cabecera>
              {FAMILIAS_ALT.map((f) => (
                <Cabecera key={f.clave} col={f.clave} clase={`ma-cel fam-${f.clave}`} titulo={f.que}>
                  {f.corto}<small>{unidad === 'g' ? 'g/día' : '% dieta'}</small>
                </Cabecera>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* El mundo va fijo arriba y fuera del orden y del filtro: es la vara
                de medir de todas las filas, no un competidor del ranking. */}
            <Fila f={mundo} destacada="es-mundo" />
            {visibles.map((f) => <Fila key={f.ne} f={f} destacada={f.ne === 'Mexico' ? 'es-mexico' : null} />)}
            {!visibles.length && (
              <tr className="ma-vacio">
                <td colSpan={3 + FAMILIAS_ALT.length}>
                  Ningún país coincide con «{busca}». La FAO publica {filas.length} de los 177 del mapa.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Página ─────────────────────────────────────────────────────────────────*/

export default function Mercados() {
  usePageStyles(HOJAS);

  const [pestana, setPestana] = useState(() => {
    try {
      const guardada = localStorage.getItem(CLAVE_TAB);
      /* Se valida contra MODULOS y no contra una segunda lista de pestañas:
         eran los mismos identificadores escritos dos veces, y añadir o renombrar
         una sección obligaba a acordarse de tocar las dos. */
      const validas = ['general', ...MODULOS.map((m) => m.id)];
      /* Quien tenía abierta Energéticos o Metales cuando se fusionaron guardó un
         identificador que ya no existe. Sin esto, la validación lo descarta y le
         devuelve el resumen: aterrizaría lejos de donde estaba, sin explicación.
         La traducción los lleva a la sección que ahora contiene lo que miraban. */
      const RENOMBRADAS = { energia: 'industriales', metales: 'industriales' };
      const id = RENOMBRADAS[guardada] || guardada;
      return validas.includes(id) ? id : 'general';
    } catch { return 'general'; }
  });

  const [datos, setDatos] = useState(null);
  /* Solo `todas`: ninguna sección tiene ya panel de noticias propio y todos los
     titulares se leen en el módulo Noticias. */
  const [noticias, setNoticias] = useState({ todas: [] });
  const [chartListo, setChartListo] = useState(false);
  const [hora, setHora] = useState('');

  const [tickers, setTickers] = useState(TICKER_INICIAL);
  const [rangos, setRangos] = useState({ granos: '1y', industriales: '1y' });
  const [modos, setModos] = useState({ granos: 'candles', industriales: 'candles' });
  const [filtroNoticias, setFiltroNoticias] = useState({ todas: 'all' });

  /* Cultivo activo en «Quién vende y quién compra». Empieza en maíz porque es
     el que manda en la ración pecuaria, que es el negocio de esta plataforma. */
  const [cultivoComercio, setCultivoComercio] = useState('maiz');

  /* Moneda de salida del simulador y cuánto se mueve respecto a su tasa real.
     Sustituyen a los dos sliders de USD/MXN que tenía cada panel por separado:
     un porcentaje sirve para cualquier moneda, y así no hay dos tipos de cambio
     distintos en la misma pantalla. */
  const [monedaSim, setMonedaSim] = useState('MXN');
  const [fxDelta, setFxDelta] = useState(0);

  const [escenario, setEscenario] = useState(null);
  const [presetEscenario, setPresetEscenario] = useState('actual');
  const [presupuesto, setPresupuesto] = useState({ cobreT: 5, aluminioT: 20, fx: 18 });
  const [presetPresupuesto, setPresetPresupuesto] = useState('medium');
  /* `especie` se retiró con los bloques «Del grano al kilo» y «Economía de
     producción» (25/08/2026): su conmutador vivía dentro de esos paneles y no
     quedó nada más que lo leyera. Lo que sí sigue por especie —las cuatro
     tarjetas, la señal de exposición al grano, el fcr del pie de la matriz— no
     depende de una selección, recorre las cuatro. */

  useEffect(() => {
    try { localStorage.setItem(CLAVE_TAB, pestana); } catch { /* sin almacenamiento */ }
  }, [pestana]);

  /* El tema oscuro de la sección se activa por clase, no por media query:
     mercados-redesign-v2.css cuelga el fondo de body.vn-dark-mercados. Se pone
     al montar y se quita al salir, para que no tiña el resto de rutas. Es el
     mismo patrón que usan Inicio y Finanzas.

     La clase va también en <html>, y no es redundante: el <html> conserva el
     azul claro del tema heredado y asoma por detrás del body, lavando el color
     de la página entera. Finanzas hace exactamente esto mismo. */
  useEffect(() => {
    document.documentElement.classList.add('vn-dark-mercados');
    document.body.classList.add('vn-dark-mercados');
    return () => {
      document.documentElement.classList.remove('vn-dark-mercados');
      document.body.classList.remove('vn-dark-mercados');
    };
  }, []);

  /* ── El tema de Daily News, prestado para la pestaña Noticias ─────────────
     La sala de Noticias usa la plantilla literal de Daily News (`.fnb-*`), y su
     tema oscuro NO está en `daily-news-favro.css` —esa es la base CLARA—: son
     1.264 reglas repartidas en las otras tres hojas, todas colgadas de
     `html.vn-dark-pilot body.vn-dark-finanzas.ff-detail-noticias`. Sin esas tres
     clases la sala se vería blanca dentro de una página oscura.

     Traerlas parecía arriesgado, porque `dark-pilot.css` tiene otras 1.123
     reglas colgadas de `body.vn-dark-finanzas`. Se midió antes de hacerlo: con
     las cuatro hojas cargadas y las clases puestas, se compararon los estilos
     calculados de las 64 piezas del cromo de Mercados (cabecera, cinta,
     pestañas, enlaces, títulos, pie) y cambiaron CERO — todas esas reglas
     apuntan a selectores `.ff-*` y `.fin-*` que aquí no existen.

     Aun así van atadas a la pestaña y no al montaje de la página: fuera de
     Noticias no pintan nada, y dejarlas puestas sería invitar a que la próxima
     hoja que alguien añada sí encuentre a qué agarrarse. */
  useEffect(() => {
    if (pestana !== 'noticias') return undefined;
    const raiz = document.documentElement;
    const cuerpo = document.body;
    raiz.classList.add('vn-dark-pilot');
    cuerpo.classList.add('vn-dark-finanzas', 'ff-detail-noticias');
    return () => {
      raiz.classList.remove('vn-dark-pilot');
      cuerpo.classList.remove('vn-dark-finanzas', 'ff-detail-noticias');
    };
  }, [pestana]);

  useEffect(() => {
    loadScripts(LIB_CHART).then(() => setChartListo(true)).catch((e) => console.error('Mercados: LightweightCharts', e));
  }, []);

  useEffect(() => {
    let vivo = true;
    let reloj = null;

    const ejecutar = async (VDS) => {
      const ahora = new Date();
      const h = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      const d = await cargarPrecios(VDS);
      if (!vivo) return;
      setDatos(d);
      setHora(h);
      window.VNLoader?.hide();

      try {
        const n = await cargarNoticias(VDS, d.precios, d.mxnRate, h);
        if (vivo) setNoticias(n);
      } catch (e) { console.warn('Mercados · noticias:', e); }
    };

    (async () => {
      try {
        await loadScripts(LIBS);
      } catch (e) { console.error('Mercados: no se pudo cargar data-service', e); return; }
      if (!vivo) return;

      const VDS = globalLegado('VDS');
      if (!VDS) { console.error('Mercados: data-service.js no expuso VDS.'); return; }

      await ejecutar(VDS).catch((e) => console.error('Mercados:', e));
      reloj = setInterval(() => ejecutar(VDS).catch(() => {}), MS_REFRESCO);
    })();

    return () => { vivo = false; if (reloj) clearInterval(reloj); };
  }, []);

  const precios = datos?.precios;
  const mxnRate = datos?.mxnRate;
  /* Tabla de divisas del día para la matriz del monitor. Puede venir en null si
     el servicio falló: la matriz lo dice y se queda en la columna de dólares. */
  const tasas = datos?.tasas;

  const ipi = useMemo(() => (precios ? calcIPI(precios) : null), [precios]);

  /* Distancia de referencia del flete en «Cómo el barril llega al flete», dentro
     de Energía & Metales. Lo compartía con «Del pizarrón a la bodega» hasta que
     esa sección se retiró de Granos. Mil km es el orden de magnitud de un puerto
     del Golfo a una planta del Bajío. */
  const [kmFlete, setKmFlete] = useState(1000);

  /* El dato en vivo que enseña cada recuadro. Va aparte de MODULOS porque esa
     constante es estática y esto depende del estado; así el catálogo de módulos
     no tiene que reconstruirse en cada render. */
  const destacadoDe = (id) => ({
    granos: precios?.maiz,
    /* El WTI y no el cobre: es el precio que arrastra al resto del recuadro
       —el diésel se estima de él y el flete del diésel— y el que ya nombra
       `destacado: ['WTI']`. El cobre tiene su propio KPI dentro. */
    industriales: precios?.wti,
    proteinas: proteinas?.precios.pork,
    // Recuento, no precio: el módulo lo declara con `moneda: false`.
    noticias: noticias.todas.length || null,
  }[id]);
  const granos = useMemo(() => (precios ? inteligenciaGranos(precios, mxnRate) : null), [precios, mxnRate]);
  const energia = useMemo(() => (precios ? inteligenciaEnergia(precios, mxnRate) : null), [precios, mxnRate]);
  const metales = useMemo(() => (precios ? inteligenciaMetales(precios, mxnRate) : null), [precios, mxnRate]);
  const proteinas = useMemo(
    () => (precios ? datosProteinas(precios, mxnRate, datos.hogsD, datos.cattleD) : null),
    [precios, mxnRate, datos],
  );

  /* ── Simuladores de cobertura ─────────────────────────────────────────────
     Cuatro instancias INDEPENDIENTES del mismo hook: put y call en cada una de
     las dos pestañas. El put cubre al que vende y el call al que compra, y
     quien lee la sección suele ser una de las dos cosas, no las dos; con estado
     compartido, elegir soja en el panel de venta cambiaría el de compra por
     detrás. Todo lo demás lo pone <SimuladorOpcion>.

     `fuente` normaliza de dónde sale cada precio, que es lo único que no se
     parece entre las dos familias: los granos vienen del objeto `precios` con
     sufijo `_hist`, y el cerdo y la res de hogsD/cattleD, que traen `price` e
     `history`. En centavos por libra, además — la conversión la hace el
     catálogo de lib/mercados.js y no esto. */
  const fuenteGranos = useMemo(() => ({
    maiz: { precio: precios?.maiz, hist: precios?.maiz_hist },
    trigo: { precio: precios?.trigo, hist: precios?.trigo_hist },
    soja: { precio: precios?.soja, hist: precios?.soja_hist },
  }), [precios]);

  /* `datos?` y no `datos.`: arranca en null hasta que responde la carga, y sin
     el opcional el primer render lanza y se lleva por delante la página ENTERA
     —las cinco pestañas, no solo esta—. El resto del archivo lee `datos` dentro
     de un `precios ? … : null` y por eso no le pasaba. */
  const fuenteProteinas = useMemo(() => ({
    cerdo: { precio: datos?.hogsD?.price, hist: datos?.hogsD?.history },
    res: { precio: datos?.cattleD?.price, hist: datos?.cattleD?.history },
  }), [datos]);

  const simPut = useSimuladorOpcion('put', 'granos', fuenteGranos, mxnRate);
  const simCall = useSimuladorOpcion('call', 'granos', fuenteGranos, mxnRate);
  const simPutProt = useSimuladorOpcion('put', 'proteinas', fuenteProteinas, mxnRate);
  const simCallProt = useSimuladorOpcion('call', 'proteinas', fuenteProteinas, mxnRate);

  /* ── Interés abierto (COT de la CFTC) ─────────────────────────────────────
     Va por su cuenta y no dentro de cargarPrecios(): es semanal, tarda lo suyo
     —seis peticiones a Socrata— y no lo necesita nada más de la página. Si
     falla, se queda en null y la sección sencillamente no se monta; el resto de
     la pestaña no se entera. Es el mismo trato que la tabla de divisas.

     Una sola petición para las dos pestañas: la respuesta trae las dos familias
     y el backend la cachea 12 h, así que abrir Granos deja servida Proteínas.
     Por eso la condición mira las DOS pestañas y no solo la suya. */
  const [openInterest, setOpenInterest] = useState(null);
  useEffect(() => {
    if ((pestana !== 'granos' && pestana !== 'proteinas') || openInterest) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch('/api/open-interest');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const bruto = await r.json();
        if (!vivo) return;
        /* Se guardan las dos familias ya procesadas y no el payload en crudo:
           así el procesado corre una vez y no en cada render de cada pestaña. */
        const granos = procesarOpenInterest(bruto, 'granos');
        const proteinas = procesarOpenInterest(bruto, 'proteinas');
        if (granos || proteinas) setOpenInterest({ granos, proteinas });
      } catch (e) {
        /* Se registra y se calla: un panel que no aparece es mejor que uno con
           ceros, que en esta sección se leería como «el mercado está vacío». */
        console.warn('[mercados] interés abierto no disponible:', e.message);
      }
    })();
    return () => { vivo = false; };
  }, [pestana, openInterest]);

  /* Volumen y dieta de la FAO. No dependen de ningún precio ni de ninguna
     petición —son un archivo estático generado por scripts/build-proteinas.mjs—
     así que se calculan una vez y no en cada render. */
  /* Dos balances y no uno, a propósito:
       · `balanceMx` está clavado en México y alimenta el medidor del hero. Ahí
         es un ancla, no una exploración: toda la plataforma se lee desde México
         y ese recuadro dice «cómo estamos nosotros».
       · `balancePais` es el del bloque de abajo, que sí se puede cambiar. */
  const balanceMx = useMemo(() => balanceDe('Mexico'), []);
  const [paisBalance, setPaisBalance] = useState('Mexico');
  const balancePais = useMemo(() => balanceDe(paisBalance), [paisBalance]);
  const paisesBalance = useMemo(() => paisesConBalance(), []);
  const dietaMx = useMemo(() => dietaDe('Mexico'), []);
  const dietaMundo = useMemo(() => dietaDe('MUNDO'), []);
  const tablaProteinas = useMemo(() => tablaPaises(), []);
  const alternativas = useMemo(() => matrizAlternativas(), []);
  /* `futuro` ya no existe: era un useMemo cuyo resultado no leía nadie —código
     muerto de antes de esta pasada— y con él se fue la última llamada a
     perspectiva() en esta página, al retirarse «Señal por cultivo». La función
     sigue exportada en lib/mercados.js. */

  // Base del simulador energético: se fija cuando llegan los datos reales.
  useEffect(() => {
    if (!energia || !precios) return;
    const base = { wti: num(precios.wti, 70), gas: num(precios.gasnat, 2.5), fx: num(mxnRate, 18) };
    setEscenario(aplicarEscenarioEnergia(base, 'actual'));
    setPresupuesto((p) => ({ ...p, fx: num(mxnRate, 18) }));
  }, [energia, precios, mxnRate]);

  const aplicarPreset = useCallback((modo) => {
    if (!precios) return;
    setPresetEscenario(modo);
    setEscenario(aplicarEscenarioEnergia(
      { wti: num(precios.wti, 70), gas: num(precios.gasnat, 2.5), fx: num(mxnRate, 18) }, modo,
    ));
    /* El preset mueve TAMBIÉN el tipo de cambio, no solo los precios: un
       escenario de estrés en el que la energía sube pero la moneda se queda
       quieta no es un escenario de estrés, es medio. Los factores son los de
       ESCENARIOS_ENERGIA.fx (0.97 / 1 / 1.06) llevados a porcentaje, que es la
       unidad en la que trabaja este control. */
    setFxDelta({ relief: -3, actual: 0, stress: 6 }[modo] ?? 0);
  }, [precios, mxnRate]);

  const resultado = escenario ? resultadoEscenarioEnergia(escenario) : null;
  const presupuestoCalc = precios ? calcularPresupuestoMetal(presupuesto, precios) : null;

  /* ── Simulador unificado ──────────────────────────────────────────────────
     Antes eran dos paneles separados —«Escenario energético» y «Presupuesto de
     compra»— que compartían el mismo defecto: enseñaban un resultado sin decir
     de dónde salía, y cada uno tenía su propio slider de USD/MXN, así que se
     podían dejar en tipos de cambio distintos y dar cifras incoherentes entre
     sí en la misma pantalla.

     Aquí el tipo de cambio es uno solo y ya no se teclea: se elige la MONEDA y
     la tasa es la real del día (la misma tabla que usa el monitor de granos).
     Lo que sí se simula es cuánto se mueve esa moneda, con un control en
     porcentaje que vale igual para el peso, el real o el euro. */
  const simulacion = useMemo(() => {
    if (!precios || !escenario) return null;
    const fxBase = num(tasas?.[monedaSim], monedaSim === 'USD' ? 1 : null);
    if (!fxBase) return null;
    const fx = fxBase * (1 + fxDelta / 100);

    // Energía: cada paso es el de la cadena «del crudo al camión».
    const dieselGal = estimarDiesel(escenario.wti);
    /* El 8.5 es MXN por tonelada cada 100 km por dólar de diésel: una constante
       de la ruta mexicana. Para enseñarla en otra moneda hay que volver a
       dólares con el tipo de cambio REAL del peso y de ahí a la moneda pedida;
       aplicarle directamente otra tasa daría un número sin significado. */
    const fxMxnReal = num(tasas?.MXN, num(mxnRate, 17));
    const fleteUsd = (dieselGal * 8.5) / fxMxnReal;
    const operacionUsd = dieselGal * 50 + escenario.gas * 5;

    // Metales: toneladas por el precio de la tonelada.
    const cobreMT = num(precios.cobre, 4.18) * LB_POR_MT;
    const aluminioMT = num(precios.aluminio, 2400);
    const costoCobre = presupuesto.cobreT * cobreMT;
    const costoAluminio = presupuesto.aluminioT * aluminioMT;
    const metalUsd = costoCobre + costoAluminio;

    /* La MISMA cuenta con los precios reales de hoy y sin mover la moneda. Es
       la referencia contra la que se mide cada salida: sin ella, el usuario
       tendría que apuntar los valores iniciales antes de tocar nada para saber
       si lo que ve es mucho o poco. Los volúmenes de metal NO se normalizan
       —son una decisión suya, no un precio de mercado—, así que la compra se
       compara a igualdad de toneladas y el delta refleja solo el efecto FX. */
    const dieselHoy = estimarDiesel(num(precios.wti, 70));
    const baseHoy = {
      dieselGal: dieselHoy,
      fleteLocal: ((dieselHoy * 8.5) / fxMxnReal) * fxBase,
      operacionLocal: (dieselHoy * 50 + num(precios.gasnat, 2.5) * 5) * fxBase,
      metalLocal: (presupuesto.cobreT * cobreMT + presupuesto.aluminioT * aluminioMT) * fxBase,
    };

    return {
      fx,
      fxBase,
      dieselGal,
      fleteUsd,
      operacionUsd,
      metalUsd,
      cobreMT,
      aluminioMT,
      costoCobre,
      costoAluminio,
      parteCobre: metalUsd ? (costoCobre / metalUsd) * 100 : 0,
      baseHoy,
      // Todo lo que se enseña en moneda local sale de aquí, no de conversiones sueltas.
      local: (usd) => usd * fx,
    };
  }, [precios, escenario, presupuesto, tasas, monedaSim, fxDelta, mxnRate]);

  const cambiarPresupuesto = (campo, valor) => {
    setPresetPresupuesto('');
    setPresupuesto((p) => ({ ...p, [campo]: valor }));
  };

  const aplicarPresetPresupuesto = (modo) => {
    setPresetPresupuesto(modo);
    setPresupuesto({ ...PRESUPUESTOS_METAL[modo], cobreT: PRESUPUESTOS_METAL[modo].cobre, aluminioT: PRESUPUESTOS_METAL[modo].aluminio, fx: num(mxnRate, 18) });
  };

  const cargando = !precios;

  const filasCalor = precios ? [
    { key: 'maiz', lbl: 'Maíz', price: precios.maiz, pct: precios.maiz_pct, unit: '$/bu', emoji: '🌽' },
    { key: 'soja', lbl: 'Soja', price: precios.soja, pct: precios.soja_pct, unit: '$/MT', emoji: '🫘' },
    { key: 'trigo', lbl: 'Trigo', price: precios.trigo, pct: precios.trigo_pct, unit: '$/bu', emoji: '🌾' },
    { key: 'wti', lbl: 'WTI', price: precios.wti, pct: precios.wti_pct, unit: '$/bbl', emoji: '🛢' },
    { key: 'gasnat', lbl: 'Gas Nat.', price: precios.gasnat, pct: precios.gasnat_pct, unit: '$/MMBtu', emoji: '🔥' },
    { key: 'diesel', lbl: 'Diesel', price: precios.diesel, pct: precios.diesel_pct, unit: '$/gal', emoji: '⛽' },
    { key: 'cobre', lbl: 'Cobre', price: precios.cobre, pct: precios.cobre_pct, unit: '$/lb', emoji: '🔩' },
    { key: 'aluminio', lbl: 'Aluminio', price: precios.aluminio, pct: precios.aluminio_pct, unit: '$/MT', emoji: '🏗' },
    { key: 'mxn', lbl: 'USD/MXN', price: mxnRate, pct: null, unit: 'pesos', emoji: '💱' },
  ] : [];

  const filasGranos = precios ? [
    { key: 'maiz', name: 'Maíz Amarillo #2', sub: 'CME · CBOT Chicago', price: precios.maiz, pct: precios.maiz_pct, pct3m: precios.maiz_pct3m, unit: '/bu' },
    { key: 'trigo', name: 'Trigo SRW Chicago', sub: 'CBOT · SRW', price: precios.trigo, pct: precios.trigo_pct, pct3m: precios.trigo_pct3m, unit: '/bu' },
    { key: 'soja', name: 'Soja en Grano', sub: 'CME · CBOT Chicago', price: precios.soja, pct: precios.soja_pct, pct3m: precios.soja_pct3m, unit: '/MT' },
    { key: 'sorgo', name: 'Sorgo Amarillo', sub: 'Est. Maíz ×0.92', price: precios.sorgo, pct: precios.sorgo_pct, pct3m: null, unit: '/bu' },
  ] : [];

  const filasEnergia = precios ? [
    { key: 'wti', name: 'Petróleo WTI', sub: 'NYMEX · New York', price: precios.wti, pct: precios.wti_pct, unit: '/bbl', dec: 2 },
    { key: 'gasnat', name: 'Gas Natural H.Hub', sub: 'NYMEX · MMBtu', price: precios.gasnat, pct: precios.gasnat_pct, unit: '/MMBtu', dec: 3 },
    { key: 'diesel', name: 'Diesel ULSD Est.', sub: 'NYMEX · Est.', price: precios.diesel, pct: precios.diesel_pct, unit: '/gal', dec: 2 },
  ] : [];

  const filasMetales = precios ? [
    { key: 'cobre', name: 'Cobre Grado A', sub: 'LME / COMEX', price: precios.cobre, pct: precios.cobre_pct, unit: '/lb', dec: 2, factor: LB_POR_MT },
    { key: 'aluminio', name: 'Aluminio Primario', sub: 'LME London', price: precios.aluminio, pct: precios.aluminio_pct, unit: '/MT', dec: 0, factor: 1 },
  ] : [];

  return (
    <>
      <Header />
      <div className="hdr-divider" />

      <div className="mkt-ticker">
        <div className="ticker-inner">
          {[...Array(2)].flatMap((_, rep) => [
            ['Maíz', precios?.maiz, precios?.maiz_pct, 2],
            ['Soja', precios?.soja, precios?.soja_pct, 2],
            ['Trigo', precios?.trigo, precios?.trigo_pct, 2],
            ['Sorgo', precios?.sorgo, precios?.sorgo_pct, 2],
            ['WTI', precios?.wti, precios?.wti_pct, 2],
            ['Gas Nat.', precios?.gasnat, precios?.gasnat_pct, 3],
            ['Cobre', precios?.cobre, precios?.cobre_pct, 2],
            ['Aluminio', precios?.aluminio, precios?.aluminio_pct, 0],
            ['USD/MXN', mxnRate, null, 2],
          ].map(([lbl, precio, pct, dec], i) => (
            <div className="tk-item" key={`${rep}-${i}`}>
              <span className="tk-lbl">{lbl}</span>
              <span className="tk-val">{precio != null ? `$${num(precio).toFixed(dec)}` : '–'}</span>
              {pct != null && <span className={`tk-pct ${num(pct) >= 0 ? 'up' : 'down'}`}>{fmtPct(pct)}</span>}
            </div>
          )))}
        </div>
      </div>

      <div className="mkt-wrap">
        {/* ── Navegación ────────────────────────────────────────────────────
            Misma lógica que Finanzas: la portada presenta los cuatro módulos y
            no lleva barra; al abrir uno, esa barra la sustituye por la de
            detalle —volver al resumen, el módulo abierto y sus hermanos— que
            es la que permite saltar entre secciones sin pasar por la portada.

            La fila de cinco pestañas de antes estaba siempre visible y repetía
            lo que ya ofrecen los recuadros; en Finanzas su equivalente
            (.fin-tabs-nav) está oculto por el mismo motivo. */}
        {pestana !== 'general' && (() => {
          const activo = MODULOS.find((m) => m.id === pestana);
          if (!activo) return null;
          return (
            <section className={`mkt-detail-nav mdn-${activo.id}`} aria-labelledby="mkt-detail-title">
              <button
                className="mkt-detail-back"
                type="button"
                onClick={() => { setPestana('general'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              >
                <i className="fas fa-arrow-left" aria-hidden="true" />
                <span>Volver al resumen</span>
              </button>

              <div className="mkt-detail-heading">
                <span className="mkt-detail-eyebrow">{activo.sub}</span>
                <h1 id="mkt-detail-title">{activo.titulo}</h1>
                <p>{activo.desc}</p>
              </div>

              {/* El número de columnas lo dicta MODULOS, no una constante en el
                  CSS: la hoja tenía `repeat(4, …)` escrito a mano y al añadir el
                  quinto módulo la pestaña de Noticias caía sola a una segunda
                  fila. Así, añadir o quitar un módulo reajusta la fila. */}
              <nav
                className="mkt-detail-tabs"
                aria-label="Apartados de Mercados"
                style={{ '--tabs': MODULOS.length }}
              >
                {MODULOS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={m.id === pestana ? 'is-active' : undefined}
                    aria-current={m.id === pestana ? 'page' : undefined}
                    onClick={() => { setPestana(m.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  >
                    <i className={`fas ${m.icono}`} aria-hidden="true" />
                    <span>{m.titulo.replace('Mercado de ', '')}</span>
                  </button>
                ))}
              </nav>
            </section>
          );
        })()}

        {/* ── General ───────────────────────────────────────────────────── */}
        {pestana === 'general' && (
          <div>
            <div className="hub-hero">
              <div className="hub-hero-accent-mkt" />
              <div className="hub-hero-beam-mkt" />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div className="hub-hero-eyebrow"><div className="hub-hero-dot-w" />VALLNews · Mercado de Insumos</div>
                <div className="hub-hero-title">Mercados</div>
                <div className="hub-hero-sub">
                  <span className="live-dot" />
                  Granos · Energéticos · Metales · Logística &nbsp;·&nbsp;
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '.6rem' }}>{hora || '-'}</span>
                </div>
              </div>
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.5rem' }}>
                <div className="hub-hero-live-mkt"><div className="hub-live-dot-mkt" />Datos en vivo</div>
                <span style={{ fontSize: '.54rem', fontWeight: 700, padding: '.2rem .7rem', borderRadius: 20, background: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.8)', border: '1px solid rgba(255,255,255,.18)', fontFamily: "'JetBrains Mono',monospace" }}>
                  IPI {ipi ? ipi.score : '-'}/100
                </span>
              </div>
            </div>

            <div className="mkt-hub-grid">
              {MODULOS.map((m) => ({ ...m, destacado: [m.destacado[0], destacadoDe(m.id)] })).map((c) => (
                <div key={c.id} className={`mkt-hub-card ${c.clase}`} role="button" tabIndex={0}
                  onClick={() => setPestana(c.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setPestana(c.id); }}
                >
                  {/* Estructura calcada de los recuadros de Finanzas
                      (.ff-module.ffm-card): la foto ocupa la tarjeta entera y
                      TODO el contenido va en una sola capa encima. Nada de
                      cabecera y pie con fondo propio — eran esas bandas las que
                      partían la imagen en tres y dejaban franjas negras.

                      El alt va vacío a propósito: la foto es decorativa y el
                      título que lleva encima ya nombra el apartado. */}
                  <div className="mkt-hub-photo">
                    <img src={c.foto} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  </div>
                  <div className="mkt-hub-body">
                    <header>
                      <span className="mkt-hub-icon"><i className={`fas ${c.icono}`} /></span>
                      <div>
                        <small>{c.sub}</small>
                        <h2>{c.titulo}</h2>
                      </div>
                      <span className="mkt-hub-badge"><span className="mkt-hub-bdot" />{c.badge}</span>
                    </header>
                    <div className="mkt-hub-foot">
                      <span className="mkt-hub-link">{c.cta} <i className="fas fa-arrow-right" /></span>
                      <span className="mkt-hub-stat">
                        <em>{c.destacado[0]}</em>
                        {/* `moneda: false` es lo que distingue un recuento de un
                            precio. Sin esa marca, los 24 titulares de Noticias
                            se pintaban como «$24.00». */}
                        <strong>
                          {c.destacado[1] == null
                            ? '—'
                            : c.moneda === false
                              ? num(c.destacado[1]).toFixed(0)
                              : `$${num(c.destacado[1]).toFixed(2)}`}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}

        {/* ── Granos ────────────────────────────────────────────────────── */}
        {pestana === 'granos' && (
          <div>
            <section className="grain-hero">
              <div className="grain-hero-copy">
                <div className="grain-eyebrow"><span /> VALL Agro Intelligence · CME/CBOT</div>
                <h1>Granos &amp; Forrajes</h1>
                <p>Precios, presión de insumos y señales de abastecimiento para decisiones de compra, cobertura y formulación pecuaria.</p>
                <div className="grain-hero-meta">
                  <span><i className="fas fa-satellite-dish" /> Mercado activo</span>
                  <span><i className="fas fa-seedling" /> 4 cultivos monitoreados</span>
                  <span><i className="fas fa-clock" /> {hora ? `Actualizado ${hora}` : 'Actualizando…'}</span>
                </div>
              </div>
              <div className="grain-pressure-card">
                <small>Presión de granos</small>
                <strong>{granos ? `${granos.presion}/100` : '—'}</strong>
                <div><i style={{ width: `${granos?.presion ?? 0}%` }} /></div>
                <span>{granos?.etiquetaPresion || 'Calculando señal…'}</span>
              </div>
            </section>

            <div className="grain-kpi-grid">
              {[
                ['corn', 'fa-seedling', 'Maíz amarillo #2', precios?.maiz, precios?.maiz_pct, 'Energía de la ración', precios?.maiz_hist, precios?.maiz_pct3m],
                ['soy', 'fa-leaf', 'Soja / pasta', precios?.soja, precios?.soja_pct, 'Proteína y aminoácidos', precios?.soja_hist, precios?.soja_pct3m],
                ['wheat', 'fa-wheat-awn', 'Trigo CBOT', precios?.trigo, precios?.trigo_pct, 'Alimento y sustitución', precios?.trigo_hist, precios?.trigo_pct3m],
                ['sorghum', 'fa-plant-wilt', 'Sorgo estimado', precios?.sorgo, null, 'Alternativa energética', null, null],
              ].map(([cls, icono, titulo, precio, pct, nota, hist, pct3m]) => (
                <div className={`grain-kpi ${cls}`} key={cls}>
                  <span className="grain-kpi-icon"><i className={`fas ${icono}`} /></span>
                  <span>
                    <small>{titulo}</small>
                    <strong>
                      {precio != null ? `$${num(precio).toFixed(2)}` : '—'}
                      {pct != null && <em className={num(pct) >= 0 ? 'up' : 'down'}> {fmtPct(pct)}</em>}
                    </strong>
                    <i>{nota}</i>
                    {/* El acumulado a 3 meses da la referencia que le falta al dato
                        mensual: distingue un mes malo dentro de una tendencia
                        estable de una caída sostenida. Ya venía calculado. */}
                    {pct3m != null && (
                      <b className="grain-kpi-3m">
                        <span>3 m</span>
                        <em className={num(pct3m) >= 0 ? 'up' : 'down'}>{fmtPct(pct3m)}</em>
                      </b>
                    )}
                  </span>
                  <Minigrafica datos={hist} etiqueta={titulo} />
                </div>
              ))}
              <div className="grain-kpi fx">
                <span className="grain-kpi-icon"><i className="fas fa-dollar-sign" /></span>
                <span><small>USD/MXN</small><strong>{mxnRate ? `$${num(mxnRate).toFixed(4)}` : '—'}</strong><i>Traslado a costo local</i></span>
              </div>
            </div>


            <MapaGranos precios={precios} num={num} fmtPct={fmtPct} />
            <div className="grain-market-grid gmg-amplio">
              <TarjetaGrafica
                panel="granos" titulo="Curva de precios" precios={precios || {}}
                ticker={tickers.granos} onTicker={(t) => setTickers((s) => ({ ...s, granos: t }))}
                rango={rangos.granos} onRango={(r) => setRangos((s) => ({ ...s, granos: r }))}
                modo={modos.granos} onModo={(m) => setModos((s) => ({ ...s, granos: m }))}
                listo={chartListo}
              />
            </div>

            {/* ── Balance mundial ────────────────────────────────────────────
                El precio de Chicago no se explica solo con la cosecha: se
                explica con lo que sobra al final de la campaña. Un año de
                récord con las existencias vacías sube, y uno mediocre con los
                silos llenos no. Ese es el stock/uso, y hasta ahora la sección
                no lo decía en ninguna parte.

                Todo sale de balance-granos.js (PSD del USDA, misma campaña que
                el mapa). El único cálculo es la división del stock/uso. */}
            <section className="grain-balance" aria-labelledby="grain-balance-t">
              <header className="grain-balance-head">
                <div>
                  <span className="grain-outlook-kicker">
                    <i className="fas fa-warehouse" aria-hidden="true" /> Oferta, consumo y reservas
                  </span>
                  <h3 id="grain-balance-t">Cuánto grano hay en el mundo</h3>
                  <p>
                    Lo que decide el precio no es solo la cosecha, sino lo que queda guardado cuando
                    termina la campaña. La relación entre existencias y consumo es el termómetro de
                    tensión del mercado.
                  </p>
                </div>
              </header>

              <div className="grain-balance-grid">
                {Object.entries(BALANCE).map(([clave, b]) => {
                  const lec = lecturaStock(b.stockUso);
                  const dias = diasDeReserva(clave);
                  const saldo = b.existencias - b.inicial;
                  return (
                    <article className={`grain-balance-card es-${lec.tono}`} key={clave}>
                      <header>
                        <h4>{b.nombre}</h4>
                        <span className="gb-tag">{lec.etiqueta}</span>
                      </header>

                      {/* La barra compara consumo contra producción. Es la
                          lectura de un vistazo: si el consumo pasa de la
                          cosecha, ese año se está tirando de reservas — que es
                          justo lo que le pasa a la soja. */}
                      <div className="gb-barra" aria-hidden="true">
                        <i style={{ width: `${Math.min(100, (b.consumo / b.produccion) * 100)}%` }} />
                      </div>
                      <ul className="gb-lineas">
                        <li><b>Producción</b><em>{mxnFmt(b.produccion)}<i>Mt</i></em></li>
                        <li><b>Consumo</b><em>{mxnFmt(b.consumo)}<i>Mt</i></em></li>
                        {b.pienso != null && (
                          <li className="gb-pienso">
                            <b>De eso, a pienso</b>
                            <em>{Math.round((b.pienso / b.consumo) * 100)}<i>%</i></em>
                          </li>
                        )}
                        <li className="gb-sep">
                          <b>Existencias finales</b>
                          <em>{mxnFmt(b.existencias)}<i>Mt</i></em>
                        </li>
                      </ul>

                      <div className="gb-stock">
                        <div>
                          <small>Existencias / consumo</small>
                          <strong>{b.stockUso}%</strong>
                        </div>
                        <span>{dias} días de reserva</span>
                      </div>

                      <p className="gb-nota">
                        {lec.nota}
                        {' '}
                        {saldo >= 0
                          ? `La campaña cierra con ${mxnFmt(Math.abs(saldo))} Mt más que al empezar.`
                          : `La campaña se come ${mxnFmt(Math.abs(saldo))} Mt de las reservas.`}
                      </p>
                    </article>
                  );
                })}
              </div>
            </section>

            {/* ── Comercio mundial ───────────────────────────────────────────
                El complemento del mapa: producir no es vender. Argentina cosecha
                menos maíz que China y exporta cuarenta veces más, porque China
                se lo come entero. Y aquí aparece el dato que más le importa a
                esta plataforma: México es el mayor importador de maíz del
                mundo — el grano de la ración mexicana se compra fuera, y por
                eso el precio de Chicago y el tipo de cambio mandan tanto. */}
            <section className="grain-trade" aria-labelledby="grain-trade-t">
              <header className="grain-balance-head">
                <div>
                  <span className="grain-outlook-kicker">
                    <i className="fas fa-ship" aria-hidden="true" /> Comercio mundial
                  </span>
                  <h3 id="grain-trade-t">Quién vende y quién compra</h3>
                  <p>Producir no es vender: estos son los seis mayores de cada lado en la campaña {CAMPANA}.</p>
                </div>
                <div className="grain-trade-tabs" role="group" aria-label="Elegir cultivo">
                  {Object.entries(BALANCE).map(([clave, b]) => (
                    <button
                      key={clave}
                      type="button"
                      className={cultivoComercio === clave ? 'is-activo' : undefined}
                      aria-pressed={cultivoComercio === clave}
                      onClick={() => setCultivoComercio(clave)}
                    >
                      {b.nombre}
                    </button>
                  ))}
                </div>
              </header>

              {(() => {
                const c = COMERCIO[cultivoComercio];
                const b = BALANCE[cultivoComercio];
                /* Las barras se escalan al mayor de CADA lado y no a un máximo
                   común: exportación e importación están igual de concentradas
                   o no, y con una escala compartida el lado más repartido se
                   quedaba en barras diminutas ilegibles. */
                const lados = [
                  ['Exportadores', 'fa-arrow-up-from-bracket', c.exportadores],
                  ['Importadores', 'fa-arrow-down-to-bracket', c.importadores],
                ];
                return (
                  <div className="grain-trade-grid">
                    {lados.map(([titulo, icono, lista]) => {
                      const tope = Math.max(...lista.map((x) => x.mt));
                      return (
                        <div className="grain-trade-col" key={titulo}>
                          <h4><i className={`fas ${icono}`} aria-hidden="true" /> {titulo}</h4>
                          <ol>
                            {lista.map((x) => (
                              <li key={x.pais}>
                                <span className="gt-pais">{x.pais}</span>
                                <span className="gt-barra" aria-hidden="true">
                                  <i style={{ width: `${(x.mt / tope) * 100}%` }} />
                                </span>
                                <span className="gt-mt">{x.mt}<em>Mt</em></span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <p className="grain-trade-pie">
                <i className="fas fa-circle-info" aria-hidden="true" />
                Comercio mundial de {BALANCE[cultivoComercio].nombre.toLowerCase()}: {mxnFmt(BALANCE[cultivoComercio].comercio)} Mt,
                el {Math.round((BALANCE[cultivoComercio].comercio / BALANCE[cultivoComercio].produccion) * 100)}% de la
                producción. El resto se consume dentro del país que lo cosecha. Fuente: {FUENTE}.
              </p>
            </section>

            {/* Aquí iban la lectura ejecutiva y las cuatro señales (spread
                soja/maíz, ración base, volatilidad y fase estacional). Se
                retiraron: `inteligenciaGranos()` sigue calculándose porque de
                ella sale el medidor de presión del hero, que es lo único que
                queda leyéndola en esta sección. */}
            {/* ── Matriz de plazas ───────────────────────────────────────────
                Antes era una tabla con una sola columna de equivalencia,
                MXN/MT, como si México fuera el único destino. Ahora es una
                matriz cultivo × plaza: la misma tonelada de Chicago puesta en
                la moneda de cada mercado, con su papel —vende o compra— según
                las tablas de comercio del USDA.

                Ahí está la lectura que una columna sola no daba: la subida del
                maíz es ingreso para Argentina y costo para México y Japón, y el
                tipo de cambio de cada uno cambia cuánto. */}
            <section className="grain-panel grain-monitor-panel">
              <div className="grain-panel-head">
                <div>
                  <small>Mercado de referencia</small>
                  <h2>Monitor CME/CBOT por plaza</h2>
                </div>
                <span>Precio por tonelada · moneda local</span>
              </div>

              <div className="grain-table-scroll">
                <table className="cmt cmt-matriz">
                  <thead>
                    <tr>
                      <th className="mz-cultivo">Commodity</th>
                      <th className="mz-base">Chicago</th>
                      <th className="mz-var">Var. mensual</th>
                      {PLAZAS.map((p) => (
                        <th key={p.cod} className="mz-plaza">
                          <span className="mz-plaza-pais">{p.pais}</span>
                          <span className="mz-plaza-fx">
                            {p.moneda}
                            {tasas?.[p.moneda] != null && (
                              <em>{num(tasas[p.moneda]) >= 100
                                ? num(tasas[p.moneda]).toFixed(0)
                                : num(tasas[p.moneda]).toFixed(2)}</em>
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cargando && <tr><td colSpan={3 + PLAZAS.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: '1.5rem' }}>Cargando datos…</td></tr>}
                    {filasGranos.map((r) => {
                      /* La base en USD/MT es el eje de toda la fila: cada plaza
                         es esta cifra por su tipo de cambio, y nada más. */
                      const usdMT = num(r.price) * (r.unit === '/MT' ? 1 : BU_POR_MT);
                      return (
                        <tr key={r.key}>
                          <td className="mz-cultivo">
                            <div className="cmt-name">{r.name}</div>
                            <div className="cmt-sub">{r.sub}</div>
                          </td>
                          <td className="mz-base">
                            <div className="cmt-price">${num(r.price).toFixed(2)}<em>{r.unit}</em></div>
                            <div className="mz-usd">${usdMT.toFixed(0)} USD/MT</div>
                          </td>
                          <td className="mz-var">
                            <Variacion pct={r.pct} />
                            {r.pct3m != null && (
                              <div className="mz-3m">{num(r.pct3m) >= 0 ? '+' : ''}{num(r.pct3m).toFixed(1)}% 3M</div>
                            )}
                          </td>
                          {PLAZAS.map((p) => {
                            const tasa = tasas?.[p.moneda];
                            /* El sorgo no está en las tablas de comercio del
                               USDA —no se comercia como los otros tres—, así
                               que su fila sale sin papeles. Es correcto: no hay
                               dato, no se inventa uno. */
                            const papel = papelEnCultivo(COMERCIO, r.key, p.pais);
                            const local = tasa != null ? usdMT * num(tasa) : null;
                            return (
                              <td key={p.cod} className={`mz-plaza${papel ? ` es-${papel}` : ''}`}>
                                {local != null ? (
                                  <>
                                    <span className="mz-monto">{importeLocal(local, p.moneda)}</span>
                                    {papel && (
                                      <span className="mz-papel">
                                        <i className={`fas ${papel === 'exporta' ? 'fa-arrow-up-from-bracket' : 'fa-arrow-down-to-bracket'}`} aria-hidden="true" />
                                        {papel === 'exporta' ? 'vende' : 'compra'}
                                      </span>
                                    )}
                                  </>
                                ) : <span className="mz-nulo">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mz-pie">
                <i className="fas fa-circle-info" aria-hidden="true" />
                Cada celda es la tonelada de Chicago convertida al tipo de cambio del día.
                «Vende» y «compra» señalan a las plazas que están entre los seis mayores exportadores
                o importadores de ese cultivo según el USDA — para la misma subida, unas cobran más y
                otras pagan más. El sorgo no aparece en esas tablas y va sin marcar.
                {!tasas && ' Sin conexión con el servicio de divisas: solo se muestra la referencia en dólares.'}
              </p>
              <div className="ia-insight">
                <i className="fas fa-robot" />
                <span>
                  {precios
                    ? `Maíz ${num(precios.maiz) > 5 ? 'sobre $5/bu — costos de ración elevados, evaluar cobertura.' : 'en rango moderado.'} `
                      + `Soja $${precios.soja}/MT — proteína en ${num(precios.soja_pct) > 0 ? 'tendencia alcista' : 'corrección'}. `
                      + `Sorgo estimado $${precios.sorgo}/bu (maíz ×0.92).`
                    : 'Calculando análisis de granos…'}
                </span>
              </div>
            </section>
            <PanelOpenInterest oi={openInterest?.granos} />

            <SimuladorOpcion tipo="put" s={simPut} />
            <SimuladorOpcion tipo="call" s={simCall} />
          </div>
        )}

        {/* ── Energía & Metales ─────────────────────────────────────────────
            Las dos que antes eran pestañas separadas. Se leen seguidas y no
            entremezcladas: cada familia conserva su encabezado, sus KPIs y su
            lectura ejecutiva, y a partir del explorador comparten todo lo que
            de verdad era común —una sola gráfica con los diez instrumentos,
            una rejilla de señales, las dos cadenas de conversión, los dos
            simuladores y los dos monitores. */}
        {pestana === 'industriales' && (
          <div>
            <section className="energy-hero">
              <div className="grain-hero-copy">
                <div className="energy-eyebrow"><span /> VALL Industrial Intelligence · NYMEX/ICE · LME/COMEX</div>
                <h1>Energéticos &amp; Metales</h1>
                <p>Petróleo, gas y combustibles junto a cobre y aluminio: el costo de mover y el costo de construir, leídos como un solo ciclo industrial.</p>
                <div className="grain-hero-meta">
                  <span><i className="fas fa-satellite-dish" /> Mercado global</span>
                  <span><i className="fas fa-fire-flame-curved" /> 10 referencias monitoreadas</span>
                  <span><i className="fas fa-clock" /> {hora ? `Actualizado ${hora}` : 'Actualizando…'}</span>
                </div>
              </div>
              {/* Los dos medidores que antes encabezaban una pestaña cada uno.
                  Juntos porque miden el mismo ciclo por sus dos extremos: lo
                  que cuesta transportar y en qué punto está la demanda
                  industrial que hay que transportar. */}
              <div className="mkt-hero-gauges">
                <div className="energy-pressure-card">
                  <small>Presión logística</small>
                  <strong>{energia ? `${energia.presion}/100` : '—'}</strong>
                  <div><i style={{ width: `${energia?.presion ?? 0}%` }} /></div>
                  <span>{energia?.etiquetaPresion || 'Calculando transmisión a costos…'}</span>
                </div>
                <div className="grain-pressure-card">
                  <small>Ciclo industrial</small>
                  <strong>{metales ? `${metales.score}/100` : '—'}</strong>
                  <div><i style={{ width: `${metales?.score ?? 0}%` }} /></div>
                  <span>{metales?.etiquetaCiclo || 'Calculando impulso…'}</span>
                </div>
              </div>
            </section>

            {/* Los encabezados de familia son lo que hace legible la fusión: sin
                ellos, siete KPIs seguidos se leen como una sola lista en la que
                el cobre parece un energético más. */}
            <h2 className="mkt-family-head mfh-energia">
              <i className="fas fa-oil-well" aria-hidden="true" />
              <span>Energéticos</span>
              <small>WTI · Gas natural · Diésel · Flete</small>
            </h2>

            <div className="grain-kpi-grid energy-kpi-grid">
              {[
                ['energy-wti', 'fa-oil-well', 'Petróleo WTI', precios?.wti, precios?.wti_pct, 2, 'Referencia de Norteamérica', precios?.wti_hist, precios?.wti_pct3m],
                ['energy-gas', 'fa-fire-flame-curved', 'Gas natural', precios?.gasnat, precios?.gasnat_pct, 3, 'Henry Hub · calefacción e industria', precios?.gasnat_hist, precios?.gasnat_pct3m],
                ['energy-diesel', 'fa-gas-pump', 'Diesel ULSD estimado', precios?.diesel, precios?.diesel_pct, 2, 'Combustible agrícola y transporte', precios?.diesel_hist, precios?.diesel_pct3m],
              ].map(([cls, icono, titulo, precio, pct, dec, nota, hist, pct3m]) => (
                <div className={`grain-kpi ${cls}`} key={cls}>
                  <span className="grain-kpi-icon"><i className={`fas ${icono}`} /></span>
                  <span>
                    <small>{titulo}</small>
                    <strong>
                      {precio != null ? `$${num(precio).toFixed(dec)}` : '—'}
                      {pct != null && <em className={num(pct) >= 0 ? 'up' : 'down'}> {fmtPct(pct)}</em>}
                    </strong>
                    <i>{nota}</i>
                    {/* Mismo par que en Granos: el acumulado a tres meses y la
                        curva de seis. El diésel es estimado del WTI y no tiene
                        serie propia, así que ahí no aparecen. */}
                    {pct3m != null && (
                      <b className="grain-kpi-3m">
                        <span>3 m</span>
                        <em className={num(pct3m) >= 0 ? 'up' : 'down'}>{fmtPct(pct3m)}</em>
                      </b>
                    )}
                  </span>
                  <Minigrafica datos={hist} etiqueta={titulo} />
                </div>
              ))}
              <div className="grain-kpi energy-freight">
                <span className="grain-kpi-icon"><i className="fas fa-truck-fast" /></span>
                <span><small>Flete México</small><strong>{energia ? `~${energia.flete.toFixed(0)} MXN` : '—'}</strong><i>Tonelada por cada 100 km</i></span>
              </div>
              <div className="grain-kpi energy-fx">
                <span className="grain-kpi-icon"><i className="fas fa-dollar-sign" /></span>
                <span><small>USD/MXN</small><strong>{mxnRate ? `$${num(mxnRate).toFixed(4)}` : '—'}</strong><i>Traslado del costo importado</i></span>
              </div>
            </div>

            <div className="grain-reading energy-reading">
              <span><i className="fas fa-bolt" /></span>
              <div><small>Lectura ejecutiva VALL</small><p>{energia?.lectura || 'Procesando petróleo, gas, combustibles y exposición logística…'}</p></div>
            </div>

            <h2 className="mkt-family-head mfh-metales">
              <i className="fas fa-layer-group" aria-hidden="true" />
              <span>Metales industriales</span>
              <small>Cobre · Aluminio · LME/COMEX</small>
            </h2>

            <div className="grain-kpi-grid">
              {[
                ['fa-bolt', 'Cobre Grado A', precios?.cobre, precios?.cobre_pct, 2, '/lb', 'Anticipa el ciclo global', precios?.cobre_hist, precios?.cobre_pct3m],
                ['fa-layer-group', 'Aluminio primario', precios?.aluminio, precios?.aluminio_pct, 0, '/MT', 'Energía y transformación', precios?.aluminio_hist, precios?.aluminio_pct3m],
              ].map(([icono, titulo, precio, pct, dec, unidad, nota, hist, pct3m]) => (
                <div className="grain-kpi" key={titulo}>
                  <span className="grain-kpi-icon"><i className={`fas ${icono}`} /></span>
                  <span>
                    <small>{titulo}</small>
                    <strong>
                      {precio != null ? `$${num(precio).toFixed(dec)}${unidad}` : '—'}
                      {pct != null && <em className={num(pct) >= 0 ? 'up' : 'down'}> {fmtPct(pct)}</em>}
                    </strong>
                    <i>{nota}</i>
                    {/* En metales el acumulado a tres meses importa más que en
                        ningún otro sitio: el cobre se lee como termómetro del
                        ciclo, y un mes suelto no dice si el ciclo gira o solo
                        respira. */}
                    {pct3m != null && (
                      <b className="grain-kpi-3m">
                        <span>3 m</span>
                        <em className={num(pct3m) >= 0 ? 'up' : 'down'}>{fmtPct(pct3m)}</em>
                      </b>
                    )}
                  </span>
                  <Minigrafica datos={hist} etiqueta={titulo} />
                </div>
              ))}
              {/* El ratio era una ficha del panel lateral de señales, que ya no
                  existe: es una relación de precios, así que su sitio natural
                  está entre los precios. El USD/MXN no se repite —ya va en el
                  bloque de arriba y es el mismo tipo de cambio—, y en su lugar
                  esta tarjeta enseña la presión que antes vivía colgada de él. */}
              <div className="grain-kpi fx">
                <span className="grain-kpi-icon"><i className="fas fa-scale-balanced" /></span>
                <span>
                  <small>Ratio cobre / aluminio</small>
                  <strong>{metales ? `${metales.ratio.toFixed(2)}×` : '—'}</strong>
                  <i>Cobre por tonelada (×{LB_POR_MT} lb) · presión FX {metales?.presionFx || '—'}</i>
                </span>
              </div>
            </div>

            <div className="grain-reading">
              <span><i className="fas fa-industry" /></span>
              <div><small>Lectura ejecutiva VALL</small><p>{metales?.lectura || 'Procesando cobre, aluminio y ciclo industrial…'}</p></div>
            </div>

            {/* `gmg-amplio`: sin el panel de noticias al lado, el explorador se
                queda con la fila entera, igual que el de Granos. Los titulares
                del sector siguen en el módulo Noticias. */}
            <div className="grain-market-grid gmg-amplio">
              {/* Un solo explorador para las dos familias: el desplegable lleva
                  los diez instrumentos en dos grupos, y la línea toma el color
                  de la familia del que esté elegido. */}
              <TarjetaGrafica
                panel="industriales" titulo="Curva energética y de metales" precios={precios || {}}
                ticker={tickers.industriales} onTicker={(t) => setTickers((s) => ({ ...s, industriales: t }))}
                rango={rangos.industriales} onRango={(r) => setRangos((s) => ({ ...s, industriales: r }))}
                modo={modos.industriales} onModo={(m) => setModos((s) => ({ ...s, industriales: m }))}
                listo={chartListo}
              />
            </div>

            {/* ── Termómetros ────────────────────────────────────────────────
                Los seis estados cualitativos, ahora con su escala a la vista.
                Cada uno enseña las tres posiciones posibles y cuál está
                encendida, para que «Media» se lea como un punto entre «Baja» y
                «Alta» y no como una palabra suelta. */}
            <section className="mkt-terms" aria-labelledby="mkt-terms-t">
              <header>
                <span className="grain-outlook-kicker">
                  <i className="fas fa-gauge-high" aria-hidden="true" /> Estado del mercado
                </span>
                <h3 id="mkt-terms-t">Cómo se está comportando</h3>
                <p>Cada indicador marca en qué punto de su escala está hoy.</p>
              </header>

              <div className="mkt-terms-grid">
                <Termometro
                  icono="fa-wave-square" titulo="Volatilidad de la energía"
                  valor={energia?.volatilidad} niveles={['Baja', 'Media', 'Alta']}
                  nota={energia?.notaVolatilidad || 'Cuánto se mueve el precio de mes a mes en WTI, gas y diésel. Cuanto más alto, menos fiable es presupuestar con el precio de hoy.'}
                />
                <Termometro
                  icono="fa-route" titulo="Traslado a tus costos"
                  valor={energia?.transmision} niveles={['Baja', 'Media', 'Alta']}
                  nota={energia?.notaTransmision || 'Probabilidad de que la energía acabe encareciendo transporte, frío y operación.'}
                />
                <Termometro
                  icono="fa-arrows-left-right" titulo="Dirección de los metales"
                  valor={metales?.amplitud} niveles={['Contractiva', 'Mixta', 'Expansiva']}
                  sentido="alto-bueno"
                  nota={metales?.notaAmplitud || 'Si cobre y aluminio suben juntos, bajan juntos o van cada uno por su lado.'}
                />
                <Termometro
                  icono="fa-chart-simple" titulo="Volatilidad del metal"
                  valor={metales?.volatilidad} niveles={['Baja', 'Media', 'Alta']}
                  nota={metales?.notaVolatilidad || 'Cuánto se mueve el precio del cobre y el aluminio de mes a mes.'}
                />
                <Termometro
                  icono="fa-boxes-stacked" titulo="Demanda industrial"
                  valor={metales?.demanda} niveles={['Débil', 'Neutral', 'Fuerte']}
                  sentido="alto-bueno"
                  nota={metales?.notaDemanda || 'El tirón de la industria sobre el metal. El cobre suele anticipar el ciclo económico.'}
                />
                <Termometro
                  icono="fa-helmet-safety" titulo="Riesgo al invertir en equipo"
                  valor={metales?.riesgoCapex} niveles={['Bajo', 'Medio', 'Alto']}
                  nota={metales?.notaCapex || 'Cuánto riesgo añade el precio del metal y el tipo de cambio a comprar maquinaria ahora.'}
                />
              </div>
            </section>
            {(() => {
              const wti = num(precios?.wti);
              if (!wti) return null;
              const dieselGal = precios?.diesel != null ? num(precios.diesel) : estimarDiesel(precios?.wti);
              const porGalon = wti / 42;
              const fletePor100 = dieselGal * 8.5;
              const ruta = fletePor100 * (kmFlete / 100);
              /* Cada paso lleva ahora una FRASE, no solo la operación. Antes la
                 columna del medio decía «÷ 42 gal/bbl» o «× 8.5» y esos números
                 parecían salir de la nada: quien no conoce el sector no sabe que
                 un barril son 42 galones ni de dónde viene el 8.5. La operación
                 se queda —es la trazabilidad del cálculo— pero explicada. */
              const pasos = [
                {
                  etiqueta: 'El barril de crudo', valor: `$${wti.toFixed(2)}`, unidad: 'por barril',
                  porque: 'Precio del WTI, la referencia de Norteamérica.', op: null,
                },
                {
                  etiqueta: 'Repartido en galones', valor: `$${porGalon.toFixed(2)}`, unidad: 'por galón',
                  porque: 'Un barril de petróleo son 42 galones.', op: '÷ 42',
                },
                {
                  etiqueta: 'Ya convertido en diésel', valor: `$${dieselGal.toFixed(2)}`, unidad: 'por galón',
                  porque: 'Refinarlo y llevarlo al surtidor añade un 30% más medio dólar.', op: '× 1.30 + 0.50',
                },
                {
                  etiqueta: 'Cargado en el camión', valor: `$${fletePor100.toFixed(0)}`, unidad: 'MXN por tonelada / 100 km',
                  porque: 'Cada dólar de diésel son 8.50 MXN de flete por tonelada cada 100 km.', op: '× 8.5',
                },
              ];
              return (
                <section className="mkt-chain es-energia mkt-chain-v2" aria-labelledby="energy-chain-t">
                  <header className="mkt-chain-head">
                    <div>
                      <span className="mkt-chain-kicker">
                        <i className="fas fa-route" aria-hidden="true" /> Del crudo al camión
                      </span>
                      <h3 id="energy-chain-t">Por qué un barril en Texas encarece un viaje en Guanajuato</h3>
                      <p className="mkt-chain-intro">
                        Cuatro pasos separan el precio del petróleo del costo de mover tu mercancía.
                        Estos son, con los números de hoy.
                      </p>
                    </div>
                    <label className="mkt-chain-km">
                      <span>Distancia del viaje</span>
                      <select value={kmFlete} onChange={(e) => setKmFlete(Number(e.target.value))}>
                        <option value={500}>500 km</option>
                        <option value={1000}>1 000 km</option>
                        <option value={1500}>1 500 km</option>
                      </select>
                    </label>
                  </header>

                  <ol className="mkt-chain-steps">
                    {pasos.map((p, i) => (
                      <li key={p.etiqueta} className={i === pasos.length - 1 ? 'is-final' : undefined}>
                        <span className="mkt-chain-num" aria-hidden="true">{i + 1}</span>
                        <span className="mkt-chain-lbl">{p.etiqueta}</span>
                        <strong>{p.valor}<em>{p.unidad}</em></strong>
                        <span className="mkt-chain-porque">
                          {p.porque}
                          {p.op && <b className="mkt-chain-op">{p.op}</b>}
                        </span>
                      </li>
                    ))}
                  </ol>

                  <p className="mkt-chain-foot">
                    <i className="fas fa-truck-fast" aria-hidden="true" />
                    <span>
                      <b>En resumen:</b> con el crudo a ${wti.toFixed(2)}, mover una tonelada
                      {' '}{mxnFmt(kmFlete)} km cuesta <strong>${mxnFmt(ruta)} MXN</strong>.
                      {' '}Si el barril subiera 10 dólares, ese mismo viaje pasaría a
                      {' '}<strong>${mxnFmt(estimarDiesel(wti + 10) * 8.5 * (kmFlete / 100))} MXN</strong>.
                      {precios?.diesel == null && ' El diésel no cotiza por separado: se estima del WTI con los pasos de arriba.'}
                    </span>
                  </p>
                </section>
              );
            })()}
            {(() => {
              const cobre = num(precios?.cobre);
              const fx = num(mxnRate);
              if (!cobre || !fx) return null;
              const usdMT = cobre * LB_POR_MT;
              const mxnMT = usdMT * fx;
              const porTonelada = mxnMT / 1000;
              const pasos = [
                ['Cobre COMEX', `$${cobre.toFixed(2)}`, '/lb', null],
                ['Tonelada en dólares', `$${mxnFmt(usdMT)}`, 'USD/MT', `× ${LB_POR_MT} lb/MT`],
                ['Tonelada en pesos', `$${mxnFmt(mxnMT)}`, 'MXN/MT', `× USD/MXN ${fx.toFixed(2)}`],
                ['Por kilogramo', `$${porTonelada.toFixed(2)}`, 'MXN/kg', '÷ 1 000 kg'],
              ];
              return (
                <section className="mkt-chain es-metales" aria-labelledby="metal-chain-t">
                  <header className="mkt-chain-head">
                    <div>
                      <span className="mkt-chain-kicker">
                        <i className="fas fa-scale-balanced" aria-hidden="true" /> Unidad de compra
                      </span>
                      <h3 id="metal-chain-t">De la libra a la tonelada</h3>
                    </div>
                  </header>
                  <ol className="mkt-chain-steps">
                    {pasos.map(([etiqueta, valor, unidad, op], i) => (
                      <li key={etiqueta} className={i === pasos.length - 1 ? 'is-final' : undefined}>
                        {op && <span className="mkt-chain-op">{op}</span>}
                        <span className="mkt-chain-lbl">{etiqueta}</span>
                        <strong>{valor}<em>{unidad}</em></strong>
                      </li>
                    ))}
                  </ol>
                  <p className="mkt-chain-foot">
                    <i className="fas fa-boxes-stacked" aria-hidden="true" />
                    El cobre se cotiza por libra y se contrata por tonelada: esta es la equivalencia con la
                    que trabaja el presupuesto de más abajo.
                    {precios?.cobre_real === false && ' El cobre usa precio de referencia, no cotización en vivo.'}
                  </p>
                </section>
              );
            })()}

            {simulacion && escenario && (
              <section className="mkt-sim" aria-labelledby="mkt-sim-t">
                <header className="mkt-sim-head">
                  <div>
                    <span className="grain-outlook-kicker">
                      <i className="fas fa-sliders" aria-hidden="true" /> Simulador
                    </span>
                    <h3 id="mkt-sim-t">Qué pasa con tus costos si cambia el mercado</h3>
                    {/* Antes esto decía «mueve los precios y mira el efecto»,
                        que no dice QUÉ se calcula. Ahora se enumeran las cuatro
                        salidas: quien llega aquí sabe de entrada si le sirve. */}
                    <p>
                      Pon los precios y los volúmenes que quieras y el simulador calcula cuatro cosas:
                      a cuánto sale el <b>diésel</b>, cuánto cuesta <b>mover una tonelada</b>,
                      cuánto <b>operar un día</b> y cuánto <b>comprar el metal</b> —todo en la moneda
                      que elijas y con la cuenta a la vista—.
                    </p>
                  </div>
                  <div className="mkt-sim-moneda">
                    <label>
                      <span>Ver resultados en</span>
                      <select value={monedaSim} onChange={(e) => setMonedaSim(e.target.value)}>
                        <option value="USD">USD · Dólar</option>
                        {PLAZAS.filter((p) => tasas?.[p.moneda] != null).map((p) => (
                          <option key={p.moneda} value={p.moneda}>{p.moneda} · {p.pais}</option>
                        ))}
                      </select>
                    </label>
                    <small>
                      {monedaSim === 'USD'
                        ? 'Moneda base de los mercados.'
                        : `1 USD = ${simulacion.fxBase.toFixed(simulacion.fxBase >= 100 ? 0 : 2)} ${monedaSim} hoy`}
                    </small>
                  </div>
                </header>

                <div className="mkt-sim-cuerpo">
                  {/* ── Controles ── */}
                  <div className="mkt-sim-controles">
                    <div className="mkt-sim-grupo">
                      <h4><i className="fas fa-oil-well" aria-hidden="true" /> Precios de la energía</h4>
                      <p className="mkt-sim-que">Qué precio del petróleo y del gas quieres suponer.</p>
                      {/* Los atajos llevan escrito lo que aplican. Antes decían
                          solo «Alivio» y «Estrés», y nadie podía saber si eso
                          era un 5% o un 40% ni sobre qué. */}
                      <div className="mkt-sim-presets">
                        {[
                          ['relief', 'Alivio', '−10%', 'La energía baja un 10% y la moneda se aprecia un 3%'],
                          ['actual', 'Hoy', 'real', 'Los precios de cierre de hoy, sin tocar nada'],
                          ['stress', 'Estrés', '+15%', 'La energía sube un 15% y la moneda se deprecia un 6%'],
                        ].map(([id, txt, delta, ayuda]) => (
                          <button
                            key={id}
                            type="button"
                            title={ayuda}
                            className={presetEscenario === id ? 'is-activo' : undefined}
                            onClick={() => aplicarPreset(id)}
                          >
                            {txt}<em>{delta}</em>
                          </button>
                        ))}
                      </div>
                      <p className="mkt-sim-ayuda">
                        {presetEscenario === 'relief' && 'Escenario favorable: energía un 10% más barata y moneda más fuerte.'}
                        {presetEscenario === 'actual' && 'Los precios reales del mercado hoy.'}
                        {presetEscenario === 'stress' && 'Escenario adverso: energía un 15% más cara y moneda más débil.'}
                        {!presetEscenario && 'Valores a medida: los estás moviendo tú con las barras.'}
                      </p>
                      {[
                        ['wti', 'Petróleo WTI', 35, 150, 1, 'USD/barril', 0],
                        ['gas', 'Gas natural', 1, 12, 0.1, 'USD/MMBtu', 1],
                      ].map(([campo, etiqueta, min, max, paso, unidad, dec]) => (
                        <label className="mkt-sim-slider" key={campo}>
                          <span className="mkt-sim-lbl">{etiqueta}<em>{unidad}</em></span>
                          <input
                            type="range" min={min} max={max} step={paso}
                            value={escenario[campo]}
                            onChange={(e) => { setPresetEscenario(''); setEscenario((s) => ({ ...s, [campo]: parseFloat(e.target.value) })); }}
                          />
                          <b>{escenario[campo].toFixed(dec)}</b>
                        </label>
                      ))}
                    </div>

                    <div className="mkt-sim-grupo">
                      <h4><i className="fas fa-layer-group" aria-hidden="true" /> Metal a comprar</h4>
                      <p className="mkt-sim-que">Cuántas toneladas piensas comprar en el periodo.</p>
                      {/* Cada atajo enseña su volumen: «Ligero» no significa
                          nada por sí solo, «2+8 t» sí. */}
                      <div className="mkt-sim-presets">
                        {Object.entries(PRESUPUESTOS_METAL).map(([id, v]) => {
                          const nombre = { light: 'Ligero', medium: 'Medio', intensive: 'Intensivo' }[id];
                          return (
                            <button
                              key={id}
                              type="button"
                              title={`${v.cobre} toneladas de cobre y ${v.aluminio} de aluminio`}
                              className={presetPresupuesto === id ? 'is-activo' : undefined}
                              onClick={() => aplicarPresetPresupuesto(id)}
                            >
                              {nombre}<em>{v.cobre}+{v.aluminio} t</em>
                            </button>
                          );
                        })}
                      </div>
                      {[
                        ['cobreT', 'Cobre', 0, 50, 1],
                        ['aluminioT', 'Aluminio', 0, 200, 1],
                      ].map(([campo, etiqueta, min, max, paso]) => (
                        <label className="mkt-sim-slider" key={campo}>
                          <span className="mkt-sim-lbl">{etiqueta}<em>toneladas</em></span>
                          <input
                            type="range" min={min} max={max} step={paso}
                            value={presupuesto[campo]}
                            onChange={(e) => cambiarPresupuesto(campo, parseFloat(e.target.value))}
                          />
                          <b>{presupuesto[campo]} t</b>
                        </label>
                      ))}
                    </div>

                    <div className="mkt-sim-grupo">
                      <h4><i className="fas fa-money-bill-transfer" aria-hidden="true" /> Tipo de cambio</h4>
                      <p className="mkt-sim-que">
                        Todo lo de arriba cotiza en dólares. Esto simula que tu moneda se
                        {' '}<b>debilite</b> (+) o se <b>fortalezca</b> (−) frente a él.
                      </p>
                      {/* Un porcentaje y no una cifra absoluta: así el mismo
                          control vale para el peso, el real o el won, y no hay
                          que saberse de memoria el rango plausible de cada uno. */}
                      <label className="mkt-sim-slider">
                        <span className="mkt-sim-lbl">
                          Si la moneda se mueve
                          <em>{monedaSim === 'USD' ? 'no aplica al dólar' : 'frente al dólar'}</em>
                        </span>
                        <input
                          type="range" min={-20} max={20} step={1}
                          value={fxDelta}
                          disabled={monedaSim === 'USD'}
                          /* Tocar esto rompe el preset: si no, el botón seguiría
                             marcado como «Estrés» con un tipo de cambio que ya
                             no es el suyo. */
                          onChange={(e) => { setPresetEscenario(''); setFxDelta(parseFloat(e.target.value)); }}
                        />
                        <b className={fxDelta > 0 ? 'es-malo' : fxDelta < 0 ? 'es-bueno' : undefined}>
                          {fxDelta > 0 ? '+' : ''}{fxDelta}%
                        </b>
                      </label>
                      {monedaSim !== 'USD' && (
                        <p className="mkt-sim-ayuda">
                          {fxDelta === 0
                            ? `Con el tipo de cambio de hoy: 1 USD = ${simulacion.fxBase.toFixed(simulacion.fxBase >= 100 ? 0 : 2)} ${monedaSim}.`
                            : `Quedaría en 1 USD = ${simulacion.fx.toFixed(simulacion.fx >= 100 ? 0 : 2)} ${monedaSim}. ${fxDelta > 0 ? 'Todo lo importado sube.' : 'Todo lo importado baja.'}`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* ── Resultados: cifra animada, cuenta y distancia a hoy ── */}
                  <div className="mkt-sim-salidas">
                    {[
                      {
                        icono: 'fa-gas-pump',
                        titulo: 'Diésel en surtidor',
                        valor: simulacion.dieselGal,
                        base: simulacion.baseHoy.dieselGal,
                        formato: (v) => `$${v.toFixed(2)}`,
                        unidad: 'USD/galón',
                        cuenta: `(${escenario.wti.toFixed(0)} ÷ 42) × 1.30 + 0.50`,
                        nota: 'El barril repartido en galones, más refino y logística.',
                      },
                      {
                        icono: 'fa-truck-fast',
                        titulo: 'Flete por tonelada',
                        valor: simulacion.local(simulacion.fleteUsd),
                        base: simulacion.baseHoy.fleteLocal,
                        formato: (v) => fmtMoneda(v, monedaSim),
                        unidad: `${monedaSim} / 100 km`,
                        /* Con MXN la conversión no existe —el 8.5 ya está en
                           pesos— y escribir «→ MXN» sobraba y confundía. */
                        cuenta: monedaSim === 'MXN'
                          ? `${simulacion.dieselGal.toFixed(2)} × 8.5`
                          : `${simulacion.dieselGal.toFixed(2)} × 8.5 MXN → ${monedaSim}`,
                        nota: monedaSim === 'MXN'
                          ? 'Cada dólar de diésel son 8.50 MXN por tonelada cada 100 km.'
                          : 'Referencia de la ruta mexicana, convertida a la moneda elegida.',
                      },
                      {
                        icono: 'fa-industry',
                        titulo: 'Operación de un día',
                        valor: simulacion.local(simulacion.operacionUsd),
                        base: simulacion.baseHoy.operacionLocal,
                        formato: (v) => fmtMoneda(v, monedaSim),
                        unidad: `${monedaSim} / día`,
                        cuenta: `(${simulacion.dieselGal.toFixed(2)} × 50 gal) + (${escenario.gas.toFixed(1)} × 5 MMBtu)`,
                        nota: 'Consumo indicativo de una planta tipo.',
                      },
                      {
                        icono: 'fa-cart-shopping',
                        titulo: 'Compra de metal',
                        valor: simulacion.local(simulacion.metalUsd),
                        base: simulacion.baseHoy.metalLocal,
                        formato: (v) => fmtMoneda(v, monedaSim),
                        unidad: monedaSim,
                        cuenta: `(${presupuesto.cobreT} t × $${mxnFmt(simulacion.cobreMT)}) + (${presupuesto.aluminioT} t × $${mxnFmt(simulacion.aluminioMT)})`,
                        nota: `${simulacion.parteCobre.toFixed(0)}% cobre · ${(100 - simulacion.parteCobre).toFixed(0)}% aluminio.`,
                        destacado: true,
                      },
                    ].map((s) => <SalidaSim key={s.titulo} {...s} />)}
                  </div>
                </div>

                <p className="mkt-sim-pie">
                  <i className="fas fa-circle-info" aria-hidden="true" />
                  <span>
                    <b>Qué se puede mover y qué no:</b> el petróleo, el gas, las toneladas de metal y el
                    tipo de cambio. Los precios del <b>cobre y el aluminio</b> son siempre los de cierre
                    de hoy —el simulador cambia cuánto compras, no a cuánto cotizan—. Los atajos
                    «Alivio» y «Estrés» mueven a la vez la energía y la moneda, porque en un escenario
                    real las dos cosas van juntas.
                  </span>
                </p>
              </section>
            )}
            <section className="grain-panel energy-monitor-panel">
              <div className="grain-panel-head">
                <div>
                  <small>Mercado de referencia</small>
                  <h2>Monitor NYMEX por plaza</h2>
                </div>
                <span>Precio en su unidad · moneda local</span>
              </div>
              <div className="grain-table-scroll">
                <table className="cmt cmt-matriz">
                  <thead>
                    <tr>
                      <th className="mz-cultivo">Commodity</th>
                      <th className="mz-base">NYMEX</th>
                      <th className="mz-var">Var. mensual</th>
                      {PLAZAS_ENERGIA.map((p) => (
                        <th key={p.cod} className="mz-plaza">
                          <span className="mz-plaza-pais">{p.pais}</span>
                          <span className="mz-plaza-fx">
                            {p.moneda}
                            {tasas?.[p.moneda] != null && (
                              <em>{num(tasas[p.moneda]) >= 100
                                ? num(tasas[p.moneda]).toFixed(0)
                                : num(tasas[p.moneda]).toFixed(2)}</em>
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cargando && <tr><td colSpan={3 + PLAZAS_ENERGIA.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: '1.5rem' }}>Cargando datos…</td></tr>}
                    {filasEnergia.map((r) => {
                      const imp = impactoLabel(r.key, r.pct);
                      const usd = num(r.price);
                      return (
                        <tr key={r.key}>
                          <td className="mz-cultivo">
                            <div className="cmt-name">{r.name}</div>
                            <div className="cmt-sub">{r.sub}</div>
                          </td>
                          <td className="mz-base">
                            <div className="cmt-price">${usd.toFixed(r.dec)}<em>{r.unit}</em></div>
                            <div className="mz-usd"><b className={`tono-${imp.tono}`}>{imp.lbl}</b></div>
                          </td>
                          <td className="mz-var"><Variacion pct={r.pct} /></td>
                          {PLAZAS_ENERGIA.map((p) => {
                            const tasa = tasas?.[p.moneda];
                            const local = tasa != null ? usd * num(tasa) : null;
                            return (
                              <td key={p.cod} className="mz-plaza">
                                {local != null
                                  ? <span className="mz-monto">{importeLocal(local, p.moneda)}</span>
                                  : <span className="mz-nulo">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mz-pie">
                <i className="fas fa-circle-info" aria-hidden="true" />
                Cada celda es el precio de NYMEX en su propia unidad —barril, MMBtu o galón—
                convertido al tipo de cambio del día. No se marca quién vende y quién compra:
                a diferencia del grano, la plataforma no tiene una serie de comercio de crudo
                con la que respaldarlo.
                {!tasas && ' Sin conexión con el servicio de divisas: solo se muestra la referencia en dólares.'}
              </p>
              <div className="ia-insight">
                <i className="fas fa-robot" />
                <span>
                  {precios
                    ? `WTI $${precios.wti}/bbl · Diesel estimado $${precios.diesel}/gal → flete ~${(num(precios.diesel) * 8.5).toFixed(0)} MXN/ton·100km. `
                      + (num(precios.wti) > 75 ? 'Presión alta en logística — revisar coberturas de combustible.' : 'Energéticos en zona moderada.')
                    : 'Calculando análisis energético…'}
                </span>
              </div>
            </section>
            <section className="grain-panel">
              <div className="grain-panel-head">
                <div>
                  <small>Mercado de referencia</small>
                  <h2>Monitor LME/COMEX por plaza</h2>
                </div>
                <span>Precio por tonelada · moneda local</span>
              </div>
              <div className="grain-table-scroll">
                <table className="cmt cmt-matriz">
                  <thead>
                    <tr>
                      <th className="mz-cultivo">Metal</th>
                      <th className="mz-base">LME/COMEX</th>
                      <th className="mz-var">Var. mensual</th>
                      {PLAZAS_METALES.map((p) => (
                        <th key={p.cod} className="mz-plaza">
                          <span className="mz-plaza-pais">{p.pais}</span>
                          <span className="mz-plaza-fx">
                            {p.moneda}
                            {tasas?.[p.moneda] != null && (
                              <em>{num(tasas[p.moneda]) >= 100
                                ? num(tasas[p.moneda]).toFixed(0)
                                : num(tasas[p.moneda]).toFixed(2)}</em>
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cargando && <tr><td colSpan={3 + PLAZAS_METALES.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: '1.5rem' }}>Cargando datos…</td></tr>}
                    {filasMetales.map((r) => {
                      const imp = impactoLabel(r.key, r.pct);
                      // `factor` lleva el cobre de libra a tonelada; el aluminio ya cotiza así.
                      const usdMT = num(r.price) * r.factor;
                      return (
                        <tr key={r.key}>
                          <td className="mz-cultivo">
                            <div className="cmt-name">{r.name}</div>
                            <div className="cmt-sub">{r.sub}</div>
                          </td>
                          <td className="mz-base">
                            <div className="cmt-price">${num(r.price).toFixed(r.dec)}<em>{r.unit}</em></div>
                            <div className="mz-usd">${mxnFmt(usdMT)} USD/MT</div>
                          </td>
                          <td className="mz-var">
                            <Variacion pct={r.pct} />
                            <div className="mz-3m"><b className={`tono-${imp.tono}`}>{imp.lbl}</b></div>
                          </td>
                          {PLAZAS_METALES.map((p) => {
                            const tasa = tasas?.[p.moneda];
                            const local = tasa != null ? usdMT * num(tasa) : null;
                            return (
                              <td key={p.cod} className="mz-plaza">
                                {local != null
                                  ? <span className="mz-monto">{importeLocal(local)}</span>
                                  : <span className="mz-nulo">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mz-pie">
                <i className="fas fa-circle-info" aria-hidden="true" />
                Todas las cifras son por tonelada: el cobre cotiza por libra y se pasa a tonelada
                (×{LB_POR_MT}) para que las dos filas se puedan comparar. Chile y Perú aparecen como
                productores —para ellos esta cotización es ingreso, no costo—.
                {!tasas && ' Sin conexión con el servicio de divisas: solo se muestra la referencia en dólares.'}
              </p>

              <div className="ia-insight"><i className="fas fa-robot" /><span>{metales?.callout || 'Calculando análisis de metales…'}</span></div>
            </section>
          </div>
        )}

        {/* ── Proteínas ─────────────────────────────────────────────────── */}
        {/* La clase del envoltorio no es decorativa. Los bloques que esta
            sección comparte con Granos —.grain-kpi, .grain-panel, .grain-reading,
            .grain-signal-card— llevan el DORADO de Granos escrito en la hoja
            legada, así que la sección de proteínas se pintaba medio dorada y
            medio rosa. `.mkt-proteinas` es el gancho desde el que se corrige,
            sin tocar reglas que Granos también usa. */}
        {pestana === 'proteinas' && (
          <div className="mkt-proteinas">
            <section className="protein-hero">
              <div className="grain-hero-copy">
                <div className="grain-eyebrow"><span /> VALL Protein Intelligence</div>
                <h1>Mercado de Proteínas</h1>
                <p>
                  Cerdo, pollo, res y huevo: lo que cuesta el kilo, lo que cuesta producirlo
                  y cuánto produce y consume cada país.
                </p>
                <div className="grain-hero-meta">
                  <span><i className="fas fa-satellite-dish" /> CME · precio en MXN</span>
                  <span><i className="fas fa-globe" /> FAO · volumen {ANIO_PROT}</span>
                  <span><i className="fas fa-clock" /> {hora ? `Actualizado ${hora}` : 'Actualizando…'}</span>
                </div>
              </div>

              {/* Dos medidores y no uno. El de presión de alimento cuenta el
                  COSTO —de dónde viene y hacia dónde va—, pero no dice nada de
                  la posición del país, que es la otra mitad de la pregunta:
                  México importa cerdo y pollo y exporta res, y eso cambia por
                  completo a quién le conviene que el grano suba. El envoltorio
                  es el mismo que ya usa Energía & Metales para sus dos. */}
              <div className="mkt-hero-gauges">
                <div className="grain-pressure-card">
                  <small>Presión de alimento</small>
                  <strong>{proteinas ? `${proteinas.presionAlimento}/100` : '—'}</strong>
                  <div><i style={{ width: `${proteinas?.presionAlimento ?? 0}%` }} /></div>
                  <span>{proteinas?.etiquetaAlimento || 'Calculando…'}</span>
                </div>
                <div className="grain-pressure-card es-auto">
                  <small>Autosuficiencia · México</small>
                  <strong>{balanceMx?.auto != null ? `${balanceMx.auto.toFixed(0)}%` : '—'}</strong>
                  <div><i style={{ width: `${Math.min(100, balanceMx?.auto ?? 0)}%` }} /></div>
                  <span>
                    {balanceMx
                      ? `Produce ${balanceMx.prod.toFixed(1)} Mt y consume ${balanceMx.cons.toFixed(1)} Mt`
                      : 'Calculando…'}
                  </span>
                </div>
              </div>
            </section>
            <div className="grain-kpi-grid">
              {ESPECIES_PROTEINA.map((k) => (
                <div className="grain-kpi" key={k}>
                  <span className="grain-kpi-icon"><i className={`fas ${ESPECIES_META[k].icono}`} /></span>
                  <span>
                    <small>
                      {NOMBRE_ESPECIE[k]}
                      {proteinas && !proteinas.real[k] && (
                        <b className="grain-kpi-ref" title={k === 'pork' || k === 'beef'
                          ? 'Valor de referencia: la cotización del CME no está disponible ahora mismo.'
                          : 'Estimado a partir del maíz y la soja: no cotiza en ningún mercado de futuros.'}>
                          {k === 'pork' || k === 'beef' ? 'ref.' : 'est.'}
                        </b>
                      )}
                    </small>
                    <strong>
                      {proteinas ? `$${proteinas.precios[k].toFixed(2)} MXN/kg` : '—'}
                      {/* Con el precio en referencia la variación es siempre 0, y un
                          "0.0%" verde se lee como un mercado plano y no como un dato
                          que falta. Mejor no enseñarla. */}
                      {proteinas && (proteinas.real[k] || k === 'chicken' || k === 'egg') && (
                        <em className={proteinas.variacion[k] >= 0 ? 'up' : 'down'}> {fmtPct(proteinas.variacion[k])}</em>
                      )}
                    </strong>
                    <i>{proteinas ? `$${proteinas.costoProteina[k].toFixed(2)} MXN por kg de proteína` : ''}</i>
                    {proteinas?.variacion3m[k] != null && (
                      <b className="grain-kpi-3m">
                        <span>3 m</span>
                        <em className={num(proteinas.variacion3m[k]) >= 0 ? 'up' : 'down'}>{fmtPct(proteinas.variacion3m[k])}</em>
                      </b>
                    )}
                  </span>
                  <Minigrafica datos={proteinas?.historial[k]} etiqueta={NOMBRE_ESPECIE[k]} />
                </div>
              ))}
              <div className="grain-kpi fx">
                <span className="grain-kpi-icon"><i className="fas fa-dollar-sign" /></span>
                <span><small>USD/MXN</small><strong>{proteinas ? `${proteinas.fx.toFixed(4)}` : '—'}</strong><i>Aplica a granos; precios de carne son nativos MXN</i></span>
              </div>
            </div>

            <div className="grain-reading">
              <span><i className="fas fa-wand-magic-sparkles" /></span>
              <div><small>Lectura ejecutiva VALL</small><p>{proteinas?.lectura || 'Procesando precios y márgenes por especie…'}</p></div>
            </div>
            <MapaGranos
              origenes={ORIGENES_PROTEINAS}
              tono="proteinas"
              kicker="Producción y consumo"
              titulo="Quién produce la proteína y quién se la come"
              entradilla={`Cada país pintado por su volumen de carne y huevo. Cambia entre producción y consumo para ver quién tiene de sobra y quién necesita comprar, y recorre los años de ${ANIOS_PROT[0]} a ${ANIOS_PROT[ANIOS_PROT.length - 1]} para ver hacia dónde se ha movido; pasa el cursor para el desglose.`}
              datosDe={proteinasDe}
              escala={ESCALA_PROT}
              metricas={METRICAS_PROT}
              anios={ANIOS_PROT}
              /* Abre por 2023 y no por 2025: los dos últimos son estimación y
                 pintan la mitad de países. Ver el comentario de la prop. */
              anioInicial={Number(ANIO_PROT)}
              aniosEstimados={ESTIMADOS_PROT}
              /* El aviso nombra la fuente del año concreto, no una genérica:
                 2024 y 2025 no se estiman con lo mismo, y el lector que quiera
                 comprobarlo necesita saber a cuál ir. */
              notaEstimado={(a) => `${a} es una estimación, no dato medido: la FAO cierra sus hojas de balance en ${ANIO_PROT}, así que este año toma ese nivel y le aplica la variación de ${FUENTE_ANIO_PROT(a)}. Hay menos países con dato${a > 2024 ? ', y el huevo no tiene fuente para este año' : ''}.`}
              prefijoBanda="gm-q"
              unidad="Mt"
              leyendaTitulo="Color del país"
              notasEscala={NOTAS_PROTEINAS}
              pie={`Producción, suministro interno y consumo por habitante de carne de cerdo, pollo y res y de huevo, año a año de ${ANIOS_PROT[0]} a ${ANIOS_PROT[ANIOS_PROT.length - 1]}. De ${ANIOS_PROT[0]} a ${ANIO_PROT} el dato es de ${FUENTE_PROT}: 152 países. La escala de color es la misma en todos los años, así que un país que se oscurece está creciendo de verdad. ${ESTIMADOS_PROT.join(' y ')} van marcados como estimación: la FAO cierra sus hojas de balance en ${ANIO_PROT}, y esos años toman ese nivel movido por la variación del resto de la producción ganadera de FAOSTAT y del PSD del USDA — el nivel sigue siendo el de la FAO, solo se toma prestado el movimiento. Por eso pintan menos países (151 en producción y 75 en consumo para 2024; unos 72 para 2025) y el huevo no llega a 2025. Los grises no tienen dato en ese año, y no se rellenan con el valor del anterior. El precio de la sección es la referencia del CME, que es global: el mapa no la reparte por país.`}
            />
            <ConsumoPersona />

            <CortesAnimal />
            {balancePais && (() => {
              const tope = Math.max(...balancePais.filas.flatMap((f) => [f.prod, f.cons]));
              const nombrePais = nombreEs(paisBalance);
              return (
                <section className="prot-balance" aria-labelledby="prot-bal-t">
                  <header className="grain-balance-head">
                    <div>
                      <span className="grain-map-kicker">
                        <i className="fas fa-scale-unbalanced-flip" aria-hidden="true" /> Balance nacional
                      </span>
                      <h3 id="prot-bal-t">Lo que {nombrePais} produce y lo que se come</h3>
                      <p>
                        Producción frente a suministro interno, proteína a proteína, en {ANIO_PROT}.
                        Donde la barra de consumo pasa a la de producción, la diferencia se importa.
                      </p>
                      <label className="pb-pais mkt-pais-sel">
                        <span>País</span>
                        <select value={paisBalance} onChange={(e) => setPaisBalance(e.target.value)}>
                          {paisesBalance.map((p) => (
                            <option key={p.ne} value={p.ne}>{p.nombre}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="pb-total">
                      <small>Autosuficiencia</small>
                      <strong>{balancePais.auto != null ? `${balancePais.auto.toFixed(0)}%` : '—'}</strong>
                      <span>del total que consume</span>
                    </div>
                  </header>

                  <ul className="pb-lista">
                    {balancePais.filas.map((f) => {
                      const estado = f.auto == null ? 'equilibrio'
                        : f.auto < 98 ? 'deficit'
                          : f.auto > 102 ? 'superavit' : 'equilibrio';
                      const leyenda = { deficit: 'importa el resto', superavit: 'le sobra', equilibrio: 'en equilibrio' }[estado];
                      const clave = ESPECIES_PROTEINA.find((k) => ESPECIE_A_FAO[k] === f.clave);
                      return (
                        <li key={f.clave} className={`es-${estado}`}>
                          <span className="pb-nombre">
                            <i className={`fas ${ESPECIES_META[clave].icono}`} aria-hidden="true" />
                            {f.nombre}
                          </span>
                          {/* El largo de cada barra es proporcional y solo eso:
                              la cifra va FUERA, en su propia columna. Con la
                              etiqueta dentro hacía falta un ancho mínimo para
                              que cupiera, y un ancho mínimo es una barra que ya
                              no mide lo que dice medir. */}
                          <span className="pb-barras">
                            <span className="pb-fila">
                              <i className="pb-prod" style={{ width: `${(f.prod / tope) * 100}%` }} />
                              <em>Produce <b>{f.prod.toFixed(2)}</b> Mt</em>
                            </span>
                            <span className="pb-fila">
                              <i className="pb-cons" style={{ width: `${(f.cons / tope) * 100}%` }} />
                              <em>Consume <b>{f.cons.toFixed(2)}</b> Mt</em>
                            </span>
                          </span>
                          <span className="pb-auto">
                            <strong>{f.auto != null ? `${f.auto.toFixed(0)}%` : '—'}</strong>
                            <i>{leyenda}</i>
                          </span>
                          <span className="pb-kg">
                            <strong>{f.kg != null ? f.kg.toFixed(1) : '—'}</strong>
                            <i>kg por persona</i>
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <p className="grain-trade-pie">
                    <i className="fas fa-circle-info" aria-hidden="true" />
                    «Consume» es el suministro interno de la FAO —producción más importación menos
                    exportación—, no lo que se lleva a la mesa: eso es la columna de kilos por
                    persona. Cifras de {ANIO_PROT}, {FUENTE_PROT}.
                  </p>
                </section>
              );
            })()}
            <section className="prot-matriz" aria-labelledby="prot-mx-t">
              <header className="grain-balance-head">
                <div>
                  <span className="grain-map-kicker">
                    <i className="fas fa-table-list" aria-hidden="true" /> El mundo, país a país
                  </span>
                  <h3 id="prot-mx-t">Producción y consumo de los 152 países</h3>
                  <p>
                    Millones de toneladas en {ANIO_PROT}; la cifra pequeña de cada proteína es lo que
                    ese país se come. Pulsa una cabecera para ordenar por esa columna.
                  </p>
                </div>
                <div className="pb-total">
                  <small>Cobertura</small>
                  <strong>{tablaProteinas.length}</strong>
                  <span>países con dato</span>
                </div>
              </header>

              <MatrizProteinas filas={tablaProteinas} mundo={FILA_MUNDO} proteinas={PROTEINAS_FAO} />

              <p className="grain-trade-pie">
                <i className="fas fa-circle-info" aria-hidden="true" />
                «Autosuf.» es cuánto del consumo sale del propio país: por debajo de 100 importa la
                diferencia, por encima le sobra. La barra está recortada al 200% para que las decenas
                de países que rondan el equilibrio sigan distinguiéndose; la cifra es exacta.
                Datos de {ANIO_PROT}, {FUENTE_PROT}.
              </p>
            </section>

            {dietaMx && dietaMundo && (
              <section className="prot-alt" aria-labelledby="prot-alt-t">
                <header className="grain-balance-head">
                  <div>
                    <span className="grain-map-kicker">
                      <i className="fas fa-seedling" aria-hidden="true" /> Proteínas alternativas
                    </span>
                    <h3 id="prot-alt-t">Cuánta proteína no viene de la ganadería, y de dónde viene</h3>
                    <p>
                      Gramos de proteína por habitante y día, separados por procedencia. No es una
                      previsión de mercado: es lo que la FAO midió que se comió en {ANIO_PROT}.
                      «Alternativa» aquí significa una cosa concreta —proteína que no sale de una
                      granja ganadera—, así que el pescado y las algas cuentan y la leche no.
                    </p>
                  </div>
                  <div className="pb-total">
                    <small>El mundo</small>
                    <strong>{dietaMundo.pctNoGanadera.toFixed(0)}%</strong>
                    <span>de su proteína, sin ganado</span>
                  </div>
                </header>

                {/* ── 1. El reparto ── */}
                <div className="pa-grid">
                  {[['México', dietaMx], ['Mundo', dietaMundo]].map(([nombre, d]) => {
                    const agua = (d.pescado || 0) + (d.alga || 0);
                    const mayor = d.familias[0]?.valor || 1;
                    return (
                      <div className="pa-tarjeta" key={nombre}>
                        <header>
                          <h4>{nombre}</h4>
                          <strong>{d.total.toFixed(1)}<em> g/día</em></strong>
                        </header>
                        <div className="pa-split">
                          <i className="pa-vegetal" style={{ width: `${(d.vegetal / d.total) * 100}%` }} />
                          <i className="pa-agua" style={{ width: `${(agua / d.total) * 100}%` }} />
                          <i className="pa-animal" style={{ width: `${d.pctGanadera}%` }} />
                        </div>
                        <ul className="pa-leyenda">
                          <li><i className="pa-vegetal" aria-hidden="true" /> Vegetal <b>{d.vegetal.toFixed(1)} g</b> <em>{((d.vegetal / d.total) * 100).toFixed(0)}%</em></li>
                          <li><i className="pa-agua" aria-hidden="true" /> Acuática <b>{agua.toFixed(1)} g</b> <em>{((agua / d.total) * 100).toFixed(0)}%</em></li>
                          <li><i className="pa-animal" aria-hidden="true" /> Ganadería <b>{d.ganadera.toFixed(1)} g</b> <em>{d.pctGanadera.toFixed(0)}%</em></li>
                        </ul>
                        <ol className="pa-familias">
                          {d.familias.map((f) => (
                            <li key={f.clave} className={`fam-${f.clave}`}>
                              <b><i className={`fas ${f.icono}`} aria-hidden="true" /> {f.nombre}</b>
                              {/* La escala es la familia MAYOR del propio país y no
                                  su total: con el total, el cereal se comería la
                                  barra y las otras ocho serían ocho rayas iguales
                                  de cortas. */}
                              <span><i style={{ width: `${(f.valor / mayor) * 100}%` }} /></span>
                              <em>{f.valor.toFixed(1)}<small>g</small></em>
                            </li>
                          ))}
                        </ol>
                      </div>
                    );
                  })}
                </div>

                {/* ── 2. El catálogo ── */}
                <div className="pa-sub">
                  <h4 id="prot-alt-cat"><i className="fas fa-list-check" aria-hidden="true" /> Qué proteínas alternativas hay</h4>
                  <p>
                    Nueve familias con dato de la FAO, ordenadas por lo que pesan en la proteína
                    del mundo. Las cuatro primeras y las dos acuáticas son sustitutas —se comen en
                    lugar de carne—; las otras tres aportan proteína sin que nadie las coma por eso.
                  </p>
                </div>
                <CatalogoAlt mundo={alternativas.mundo} />

                {/* ── 3. La matriz ── */}
                <div className="pa-sub" id="prot-alt-matriz">
                  <h4><i className="fas fa-table-cells" aria-hidden="true" /> Cuánto se consume en cada país</h4>
                  <p>
                    Los {alternativas.filas.length} países que publica la FAO contra las nueve familias.
                    Cada celda es lo que come un habitante al día; el tinte compara dentro de su columna
                    y el recuadro marca la mayor fuente alternativa de ese país. Ordena por cualquier
                    cabecera o busca uno concreto.
                  </p>
                </div>
                <MatrizAlternativas filas={alternativas.filas} mundo={alternativas.mundo} />

                <p className="mkt-chain-foot">
                  <i className="fas fa-circle-info" aria-hidden="true" />
                  Dos tercios de la proteína del mundo ya son de fuera de la ganadería, y casi toda
                  esa parte es cereal comido directamente, no producto sustituto. Para el tablero de
                  esta sección importa por un motivo concreto: <strong>la soja que compite con la
                  ración</strong>. Cada kilo que se come directo no pasa antes por un animal — y, con
                  las conversiones de la cadena de arriba, ese paso cuesta
                  entre {Math.min(...ESPECIES_PROTEINA.map((k) => proteinas?.economia[k].fcr ?? 0)).toFixed(1)} y{' '}
                  {Math.max(...ESPECIES_PROTEINA.map((k) => proteinas?.economia[k].fcr ?? 0)).toFixed(1)} kg
                  de alimento por kilo de producto. Datos de {ANIO_PROT}, {FUENTE_PROT}; los 25 países
                  sin fila —Japón entre ellos— no los publica la fuente.
                </p>
              </section>
            )}


            <PanelOpenInterest
              oi={openInterest?.proteinas}
              nota={(
                <>
                  Solo aparecen las que <b>cotizan</b>: el pollo y el huevo no tienen
                  futuros en ningún mercado, así que no hay interés abierto que medir.
                </>
              )}
            />

            <SimuladorOpcion tipo="put" s={simPutProt} />
            <SimuladorOpcion tipo="call" s={simCallProt} />

            {/* Aquí estaba la rejilla de cinco señales (ratio cerdo/pollo,
                ratio res/huevo, mejor margen, más eficiente y más expuesta al
                grano). Retirada a petición el 25/08/2026.

                Era la última usuaria del componente <Senal>, que también se
                fue: Energía & Metales ya lo había sustituido por <Termometro>.
                Los cálculos siguen en `datosProteinas()` porque van en el mismo
                objeto que lo que sí se usa; si algún día se quiere revivir
                alguna, el dato está entero. */}
          </div>
        )}

        {/* ── Noticias ──────────────────────────────────────────────────────
            La PLANTILLA LITERAL de Daily News: el mismo árbol `.fnb-*` de
            Finanzas y sus mismas cuatro hojas, con los datos de Mercados
            (/api/daily-news-markets). El porqué de cada decisión está en la
            cabecera de SalaNoticiasMercados.jsx.

            Hubo dos intentos previos del mismo apartado, conservados «hasta
            decidir cuál se queda». La decisión estaba tomada de hecho —esta es
            la que se usa— así que el 21/08/2026 se retiraron los dos y todo lo
            suyo: el componente `<SalaMercados>` y sus 406 reglas `.mn-*` de
            Mercados.css, y `SalaFavroMercados.jsx` con su daily-news-mercados.css
            (que la página seguía DESCARGANDO: 26 KB y 168 selectores, ninguno
            usado por nada). Están en el historial de git si hicieran falta. */}
        {pestana === 'noticias' && (
          <div className="mkt-newsroom">
            {/* `respaldo` es la red de seguridad: las noticias que esta página ya
                carga por su cuenta (Alpha Vantage, Finnhub, GDELT y los boletines
                de VALL). La sala las usa solo si `/api/daily-news-markets` falla
                o vuelve vacía, para que un corte en una cadena no deje la sección
                en blanco. Ver la cabecera de SalaNoticiasMercados.jsx. */}
            <SalaNoticiasMercados respaldo={noticias.todas} horaRespaldo={hora} />
          </div>
        )}
      </div>

      <Footer />
    </>
  );
}
