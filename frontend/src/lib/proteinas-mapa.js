/*
 * El mapa de Mercados › Proteínas: qué pinta, con qué escala y qué países marca.
 *
 * ── Qué cambió, y por qué ──────────────────────────────────────────────────
 * Antes este archivo no describía proteína: describía el ORIGEN DEL COSTO de la
 * proteína —el maíz de Chicago, la soja de Brasil—, porque la única serie
 * conectada era la de granos. El mapa de Proteínas era, literalmente, el mapa de
 * Granos con otro rótulo: pintaba cosechas de cereal y su ficha hablaba de
 * bushels. Quien lo abría buscando el mercado de la carne encontraba trigo.
 *
 * Ahora pinta lo que la sección dice que pinta: cuánta carne y cuánto huevo
 * PRODUCE y CONSUME cada país, de produccion-proteinas.js (FAO). Son las dos
 * caras que deciden el mercado —quién tiene de sobra y quién necesita comprar—
 * y se conmutan sobre el mismo mapa, porque la gracia está en comparar la misma
 * geografía bajo las dos preguntas: China produce mucho y consume aún más;
 * Brasil produce mucho más de lo que come.
 *
 * El costo del grano no se ha perdido: es de lo que trata el resto de la
 * sección —la cadena «del grano al kilo», la economía por especie, el medidor de
 * presión de alimento— y sigue enlazando con el tablero de Granos. Lo que se
 * corrige aquí es que el MAPA contara esa historia en vez de la suya.
 */

import {
  PROTEINAS_PAIS, PROTEINAS, MUNDO, DIETA_PAIS, DIETA_MUNDO,
  DESPOJOS_PAIS, DESPOJOS_MUNDO,
  ANIOS, ANIO, ANIOS_ESTIMADOS, FUENTE_ESTIMADA, FUENTE,
} from './produccion-proteinas.js';
import { nombreEs } from './paises-es.js';

export { ANIOS, ANIO, ANIOS_ESTIMADOS, FUENTE_ESTIMADA, FUENTE, PROTEINAS, DIETA_MUNDO };

/*
 * ── Medido contra estimado ─────────────────────────────────────────────────
 * La serie llega a 2025, pero la FAO solo mide hasta 2023. Los dos últimos años
 * son ENCADENADOS: el nivel es el de 2023 movido por la variación de otra
 * fuente (el QCL de la propia FAO para 2024, el PSD del USDA para 2025).
 *
 * Que estén en la misma serie NO los hace lo mismo, y la interfaz tiene que
 * decirlo en todos los sitios donde se lea una cifra de esos años: la leyenda,
 * la ficha del país y la propia línea de tiempo. Un estimado que pasa por dato
 * medido es peor que no tenerlo.
 *
 * Además son más ralos —2024 pinta 151 países en producción pero solo 75 en
 * consumo; 2025 baja a ~72— y el huevo no llega a 2025. Lo que no se puede
 * encadenar es `null` y el país sale gris, nunca con el valor del año anterior.
 */
const ESTIMADOS = new Set(ANIOS_ESTIMADOS);
export const esEstimado = (anio) => ESTIMADOS.has(anio);
export const fuenteDe = (anio) => FUENTE_ESTIMADA[anio] || FUENTE;

/*
 * ── El año, y por qué hay un «corte» ───────────────────────────────────────
 * El archivo generado guarda cada cifra como una SERIE de catorce años, que es
 * la forma compacta de escribirla pero la peor para consultarla: el mapa
 * necesita, para un año dado, el mismo objeto plano `{ cerdo: 1.7, pollo: 3.9 }`
 * que tenía cuando solo había un año.
 *
 * `corte(anio)` lo construye una vez por año y lo guarda. Importa que sea así y
 * no un cruce en cada render: la línea de tiempo repinta ~175 países cada vez
 * que avanza, y rehacer las 1.800 series a cada fotograma se nota. Catorce
 * cortes es todo lo que puede llegar a ocupar, y solo se paga el de los años
 * que alguien llegue a mirar.
 */
/*
 * El año POR DEFECTO de todo lo que no es el mapa, y es el último MEDIDO (2023),
 * no el último de la serie (2025).
 *
 * Es deliberado y es lo que evita un fallo silencioso: la matriz de 152 países
 * y el balance de México no llevan filtro de año, así que si el valor por
 * defecto fuera el final de la serie pasarían solas a 2025 —72 países, sin
 * huevo— sin que nadie lo hubiera pedido ni se viera un error. El mapa sí
 * recorre hasta 2025, pero porque tiene un control que lo dice.
 */
export const ANIO_ULTIMO = Number(ANIO);

/** El final de la serie: hasta dónde llega la línea de tiempo del mapa. */
export const ANIO_SERIE_FIN = ANIOS[ANIOS.length - 1];

const INDICE = new Map(ANIOS.map((a, i) => [a, i]));
const cortes = new Map();

function enAnio(obj, i) {
  const o = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k][i];
    // El generador ya escribe null donde la FAO no publica; aquí solo se omite.
    if (Number.isFinite(v) && v > 0) o[k] = v;
  }
  return o;
}

/** Los datos de un año concreto, en la forma plana que espera todo lo demás. */
function corte(anio) {
  /* Un año fuera de la serie cae al último en vez de devolver vacío: un mapa en
     blanco por un número mal pasado se lee como «no hay datos», que es
     exactamente la confusión que el resto del archivo evita. */
  const a = INDICE.has(anio) ? anio : ANIO_ULTIMO;
  let c = cortes.get(a);
  if (c) return c;

  const i = INDICE.get(a);
  const paises = {};
  for (const [ne, d] of Object.entries(PROTEINAS_PAIS)) {
    paises[ne] = { prod: enAnio(d.prod, i), cons: enAnio(d.cons, i), kg: enAnio(d.kg, i) };
  }
  c = {
    paises,
    mundo: { prod: enAnio(MUNDO.prod, i), cons: enAnio(MUNDO.cons, i), kg: enAnio(MUNDO.kg, i) },
  };
  cortes.set(a, c);
  return c;
}

/** El mundo del año pedido. Por defecto el último, que es el que rotula todo. */
export function mundoDe(anio = ANIO_ULTIMO) {
  return corte(anio).mundo;
}

/** Compatibilidad: `MUNDO` a secas sigue siendo el del último año cerrado. */
export const MUNDO_ULTIMO = mundoDe();
export { MUNDO_ULTIMO as MUNDO };

/* ── Las dos métricas del mapa ──────────────────────────────────────────────
   Producción y consumo son cantidades del mismo tipo y en la misma unidad, así
   que comparten rampa de color y cortes: es lo que permite mirar una y otra y
   ver de verdad la diferencia. Con dos escalas distintas, España pasaría de
   intenso a intenso y no se notaría que produce el doble de lo que come.

   Los rótulos son funciones del año y no cadenas fijas: con la línea de tiempo
   el mapa puede estar pintando 2014, y una leyenda que dijera «2023» convertiría
   el control en una trampa — es el único sitio donde se lee qué año se mira. */
export const METRICAS = [
  {
    id: 'prod',
    etiqueta: 'Producción',
    icono: 'fa-industry',
    leyenda: (a) => `Carne y huevo producidos en ${a}${esEstimado(a) ? ' (estimado)' : ''} · millones de toneladas`,
    tipTitulo: (a) => `Produce ${a}`,
    ayuda: 'Lo que salió de las granjas del país.',
  },
  {
    id: 'cons',
    etiqueta: 'Consumo',
    icono: 'fa-utensils',
    leyenda: (a) => `Carne y huevo consumidos en ${a}${esEstimado(a) ? ' (estimado)' : ''} · millones de toneladas`,
    tipTitulo: (a) => `Consume ${a}`,
    ayuda: 'Suministro interno: producción + importación − exportación.',
  },
];

/*
 * ── La escala de color ─────────────────────────────────────────────────────
 * Rampa secuencial de UN SOLO TONO, el rosa de Proteínas (--mk-proteinas,
 * OKLCH H=3.3°), con el mismo perfil de L y de croma que la rampa dorada de
 * Granos: solo cambia el matiz, para que las dos secciones se lean igual.
 *
 * Validada con el script de la guía de visualización contra la superficie del
 * mapa (#1d2837): L monótona, ΔL ≥ 0.06 entre pasos, un solo matiz (dispersión
 * de 1 grado) y el extremo tenue a 2.14:1 del fondo, por encima del mínimo de
 * 2:1 que lo separa del mar. Los hex viven en Mercados.css como --gm-q0…--gm-q5.
 *
 * Los cortes son redondos y no cuantiles: 0.1 / 0.5 / 2 / 8 / 30 Mt reparten los
 * 152 países en 36-49-37-22-5-3 en producción y 24-60-36-25-5-2 en consumo, que
 * es la cola larga real del sector y se sostiene con las dos métricas.
 */
export const CORTES = [0.1, 0.5, 2, 8, 30];

export const ESCALA = [
  { banda: 0, etiqueta: '0' },
  { banda: 1, etiqueta: '0.1' },
  { banda: 2, etiqueta: '0.5' },
  { banda: 3, etiqueta: '2' },
  { banda: 4, etiqueta: '8' },
  { banda: 5, etiqueta: '30+' },
];

export function bandaDe(total) {
  return CORTES.filter((c) => total >= c).length;
}

const suma = (o) => Object.values(o || {}).reduce((s, v) => s + v, 0);

/** Total de las cuatro proteínas de un país, en la métrica y el año pedidos. */
export function totalDe(ne, metrica = 'prod', anio = ANIO_ULTIMO) {
  return suma(corte(anio).paises[ne]?.[metrica]);
}

/**
 * La serie completa de un país: un valor por año de `ANIOS`, con null donde la
 * FAO no publica. Es lo que necesita quien quiera dibujar su evolución sin
 * volver a cruzar los catorce cortes.
 */
export function serieDe(ne, metrica = 'prod') {
  const d = ne === 'MUNDO' ? MUNDO : PROTEINAS_PAIS[ne];
  if (!d?.[metrica]) return null;
  const campos = Object.values(d[metrica]);
  return ANIOS.map((_, i) => {
    let t = 0;
    let hay = false;
    for (const s of campos) {
      const v = s[i];
      if (Number.isFinite(v) && v > 0) { t += v; hay = true; }
    }
    return hay ? t : null;
  });
}

/**
 * Todo lo que el mapa necesita saber de un país. Devuelve null si no hay dato:
 * nunca un cero de relleno, que es la regla de la casa.
 *
 * `extra` son las líneas de contexto que la ficha pinta bajo el desglose. Aquí
 * llevan justo lo que el mapa no puede enseñar con el color, porque el color ya
 * está ocupado por una sola de las dos métricas: la OTRA cifra, para poder
 * compararlas sin cambiar el conmutador, y el consumo por persona, que es la
 * misma pregunta a escala humana. Un país que produce 0.4 Mt puede ser el que
 * más carne come del mundo por habitante, y sin esa línea el mapa lo pintaría
 * tenue y no lo diría.
 */
export function proteinasDe(ne, metrica = 'prod', anio = ANIO_ULTIMO) {
  const c = corte(anio);
  const d = c.paises[ne];
  if (!d) return null;

  const activa = d[metrica] || {};
  const total = suma(activa);
  if (!total) return null;

  const otra = metrica === 'prod' ? 'cons' : 'prod';
  const totalOtra = suma(d[otra]);
  const kgTotal = suma(d.kg);

  /* El umbral existe por el mismo motivo que en Granos: una cifra de 0.002 Mt
     ocupa en la ficha el mismo sitio que una de 40 y hace creer que pesan igual.
     Si ninguna llega, se enseña la mayor para que un país con datos nunca salga
     con la ficha en blanco. */
  const todas = PROTEINAS
    .map(([clave, nombre]) => ({ clave, nombre, mt: activa[clave] }))
    .filter((f) => Number.isFinite(f.mt) && f.mt > 0)
    .sort((a, b) => b.mt - a.mt);
  const filas = todas.filter((f) => f.mt >= total * 0.02);

  const extra = [];
  if (totalOtra > 0) {
    extra.push({
      etiqueta: metrica === 'prod' ? 'Consume' : 'Produce',
      valor: totalOtra,
      unidad: 'Mt',
      /* El saldo es la lectura que de verdad se busca en un mapa de dos
         métricas: no «cuánto», sino «le sobra o le falta». */
      pie: saldoTexto(total, totalOtra, metrica),
    });
  }
  if (kgTotal > 0) {
    /* La media mundial es la del MISMO año, no la de 2023: comparar el consumo
       de un país en 2012 contra la media de once años después diría que come
       poco cuando puede estar por encima de la media de su época. */
    extra.push({
      etiqueta: 'Por persona',
      valor: kgTotal,
      unidad: 'kg/año',
      pie: `Media mundial ${suma(c.mundo.kg).toFixed(0)} kg`,
    });
  }

  return {
    filas: filas.length ? filas : todas.slice(0, 1),
    total,
    banda: bandaDe(total),
    esBloque: false,
    extra,
    /* La ficha lo dice pieza por pieza, y no solo la leyenda: quien mira un
       país concreto está leyendo un número, y ese número es una estimación. */
    aviso: esEstimado(anio)
      ? `Estimación: nivel de ${ANIO} movido con la variación de ${fuenteDe(anio)}.`
      : null,
  };
}

function saldoTexto(total, otra, metrica) {
  const produce = metrica === 'prod' ? total : otra;
  const consume = metrica === 'prod' ? otra : total;
  const razon = consume > 0 ? produce / consume : 1;
  /* La banda neutra es del ±3% y no del ±15% que llevaba antes. Con el 15%,
     China —que produce 127 Mt y consume 133— salía como «produce casi
     exactamente lo que come», y seis millones de toneladas de diferencia son
     justo lo que hace que China mueva el mercado mundial. El ±3% es el mismo
     criterio con el que el balance de México etiqueta el equilibrio. */
  if (razon >= 1.03) return `Produce un ${Math.round((razon - 1) * 100)}% más de lo que come`;
  if (razon <= 0.97) return `Le falta un ${Math.round((1 - razon) * 100)}% de lo que come`;
  return 'Produce casi exactamente lo que come';
}

/*
 * ── Los países remarcados ──────────────────────────────────────────────────
 * El contorno del mapa señala a los cuatro que deciden el mercado mexicano de
 * proteína. El criterio ya no es «de dónde viene el grano», que era el del mapa
 * de Granos; es quién fija la oferta, quién fija la demanda y quién vende a
 * México — que es lo que ahora pinta el color.
 *
 * `papel` lo consume PAPELES de granos-mapa.js, que decide qué se marca.
 */
export const ORIGENES_PROTEINAS = [
  {
    ne: 'United States of America',
    pais: 'Estados Unidos',
    papel: 'origen',
    clave: 'cerdo',
    factor: 'Proveedor de México · referencia CME',
    nota: 'De aquí sale la mayor parte del cerdo y el pollo que México importa, y aquí cotizan los contratos que fijan el precio de referencia.',
  },
  {
    ne: 'Brazil',
    pais: 'Brasil',
    papel: 'origen',
    clave: 'pollo',
    factor: 'El mayor exportador del mundo',
    nota: 'Produce mucho más pollo y res de lo que come. Ese excedente es el que marca el precio al que puede vender cualquier otro país.',
  },
  {
    ne: 'China',
    pais: 'China',
    papel: 'demanda',
    clave: 'cerdo',
    factor: 'La demanda que mueve el tablero',
    nota: 'Consume más carne de la que produce, y casi la mitad del cerdo del planeta. Cuando su cabaña porcina cae, el precio sube en todas partes.',
  },
  {
    ne: 'Mexico',
    pais: 'México',
    papel: 'destino',
    clave: 'huevo',
    factor: 'Produce, importa y come',
    nota: 'Le falta cerdo y pollo, le sobra res, y es el país que más huevo come por habitante del mundo. Aquí es donde el costo del grano se convierte en precio de mostrador.',
  },
];

/* ── Selectores para los paneles de la sección ─────────────────────────────── */

/** Balance producción/consumo de un país, proteína a proteína. */
export function balanceDe(ne, anio = ANIO_ULTIMO) {
  const d = corte(anio).paises[ne];
  if (!d) return null;
  const filas = PROTEINAS.map(([clave, nombre]) => {
    const prod = d.prod?.[clave] ?? 0;
    const cons = d.cons?.[clave] ?? 0;
    return {
      clave,
      nombre,
      prod,
      cons,
      kg: d.kg?.[clave] ?? null,
      // Autosuficiencia: cuánto de lo que se consume sale del propio país.
      auto: cons > 0 ? (prod / cons) * 100 : null,
    };
  }).filter((f) => f.prod > 0 || f.cons > 0);

  const prod = suma(d.prod);
  const cons = suma(d.cons);
  return { filas, prod, cons, auto: cons > 0 ? (prod / cons) * 100 : null };
}

/**
 * Una fila por país con todo lo que enseña la matriz: los totales, la
 * autosuficiencia, el consumo por habitante y el desglose de las cuatro
 * proteínas.
 *
 * Devuelve los 152 países de golpe y sin recortar. Es a propósito: el ranking
 * que había antes enseñaba siete, y siete países no son «el mundo» — dejaban
 * fuera a Vietnam, a Nigeria y a la India, que es donde de verdad se está
 * moviendo la demanda. Ordenar y recortar es cosa de quien la pinta.
 */
export function tablaPaises(anio = ANIO_ULTIMO) {
  return Object.entries(corte(anio).paises)
    /* Un país puede tener serie y no tener dato en ESTE año (Sudán del Sur antes
       de 2011). Sin este filtro entraría en la tabla con cuatro ceros, que se
       leen como «aquí no se produce nada» en vez de «la fuente no llega». */
    .filter(([, d]) => suma(d.prod) > 0 || suma(d.cons) > 0)
    .map(([ne, d]) => filaDe(ne, d));
}

/** El mundo entero como una fila más, para poder comparar cualquier país con él
    sin salir de la tabla. */
export const FILA_MUNDO = filaDe('MUNDO', MUNDO_ULTIMO);

function filaDe(ne, d) {
  const prod = suma(d.prod);
  const cons = suma(d.cons);
  return {
    ne,
    prod,
    cons,
    // Cuánto de lo que se consume sale del propio país.
    auto: cons > 0 ? (prod / cons) * 100 : null,
    kg: suma(d.kg) || null,
    porProteina: Object.fromEntries(PROTEINAS.map(([c]) => [c, {
      prod: d.prod?.[c] ?? 0,
      cons: d.cons?.[c] ?? 0,
      kg: d.kg?.[c] ?? null,
    }])),
  };
}

/*
 * ── LO QUE COME UNA PERSONA ────────────────────────────────────────────────
 *
 * El resto de la sección habla en millones de toneladas, que es la unidad del
 * mercado y no la de nadie. `kg` es la misma serie de la FAO puesta a escala
 * humana: kilos por habitante y año, que es la única cifra de este tablero que
 * alguien puede contrastar con su propia compra.
 *
 * Va SIEMPRE del último año medido y no acepta año: los años encadenados no
 * tienen `kg` —ni el QCL ni el PSD publican consumo por habitante—, así que un
 * parámetro de año solo serviría para devolver vacío.
 */
const ORDEN_COLOR = PROTEINAS.map(([c]) => c);

/**
 * El reparto del consumo anual de una persona, proteína a proteína.
 *
 * Las filas salen en el ORDEN FIJO de `PROTEINAS`, no ordenadas por tamaño: es
 * lo que ata cada proteína a su color. Ordenarlas por valor repintaría el
 * dónut al cambiar de país —el cerdo dejaría de ser azul en cuanto otro país lo
 * tenga en otra posición— y eso es justo lo que no puede pasar.
 */
export function consumoPersonaDe(ne) {
  const d = ne === 'MUNDO' ? MUNDO_ULTIMO : corte(ANIO_ULTIMO).paises[ne];
  if (!d?.kg) return null;

  const filas = ORDEN_COLOR
    .map((clave, i) => ({
      clave,
      nombre: PROTEINAS[i][1],
      kg: d.kg[clave] ?? null,
    }))
    .filter((f) => f.kg > 0);
  if (!filas.length) return null;

  const total = filas.reduce((s, f) => s + f.kg, 0);
  const mundo = suma(MUNDO_ULTIMO.kg);

  return {
    filas: filas.map((f) => ({ ...f, pct: (f.kg / total) * 100 })),
    total,
    /* Gramos al día: la misma cifra en la unidad en la que se piensa una
       comida. 42 kg al año no se imagina; 115 g al día sí. */
    gramosDia: (total * 1000) / 365,
    mundo,
    vsMundo: mundo > 0 ? ((total - mundo) / mundo) * 100 : null,
    // La que más pesa en el plato de ese país.
    mayor: filas.reduce((a, b) => (b.kg > a.kg ? b : a)),
  };
}

/**
 * Vísceras y grasa animal de un país, en kg por habitante y año, con la media
 * mundial al lado para poder situarlo.
 *
 * Es la única «parte del animal» que la FAO mide país a país —no hay serie de
 * cortes en ninguna fuente— y la que de verdad separa unas cocinas de otras:
 * de décimas de kilo a más de treinta.
 */
export function despojosDe(ne) {
  const d = ne === 'MUNDO' ? DESPOJOS_MUNDO : DESPOJOS_PAIS[ne];
  if (!d) return null;
  const filas = [
    { clave: 'visceras', nombre: 'Vísceras', kg: d.visceras ?? null, mundo: DESPOJOS_MUNDO.visceras },
    { clave: 'grasa', nombre: 'Grasa animal', kg: d.grasa ?? null, mundo: DESPOJOS_MUNDO.grasa },
  ].filter((f) => f.kg > 0);
  if (!filas.length) return null;
  return {
    filas: filas.map((f) => ({ ...f, veces: f.mundo > 0 ? f.kg / f.mundo : null })),
    /* El tope de la serie, para poder dibujar una barra con una escala que no
       cambie al cambiar de país: con el máximo local, Mongolia y Japón se
       verían igual de llenos. */
    tope: TOPE_VISCERAS,
  };
}

const TOPE_VISCERAS = Math.max(
  ...Object.values(DESPOJOS_PAIS).map((d) => d.visceras || 0),
  DESPOJOS_MUNDO.visceras || 0,
);

/** Países con consumo por habitante, ya en español y ordenados para un menú. */
export function paisesConConsumo() {
  return listaPaises((d) => suma(d.kg) > 0);
}

/**
 * Países con balance de producción y consumo. Es una lista DISTINTA de la de
 * `paisesConConsumo`: la FAO publica volúmenes de algunos países para los que
 * no da el suministro por habitante, así que usar una sola lista dejaría fuera
 * del balance a países que sí lo tienen.
 */
export function paisesConBalance() {
  return listaPaises((d) => suma(d.prod) > 0 || suma(d.cons) > 0);
}

function listaPaises(cumple) {
  return Object.entries(corte(ANIO_ULTIMO).paises)
    .filter(([, d]) => cumple(d))
    .map(([ne]) => ({ ne, nombre: nombreEs(ne) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/*
 * ── PROTEÍNAS ALTERNATIVAS ─────────────────────────────────────────────────
 *
 * «Alternativa» aquí quiere decir una cosa concreta y comprobable: proteína que
 * NO sale de una granja ganadera. No es un sinónimo de «vegetal» —el pescado y
 * las algas tampoco vienen de una vaca, un cerdo o una gallina, y son las dos
 * alternativas más consolidadas del mundo— ni un sinónimo de «novedosa».
 *
 * Es la definición que se puede sostener con la fuente. Lo que este tablero
 * llama alternativas se mide en las mismas hojas de balance de la FAO que el
 * resto de la sección, con el elemento 674 (proteína, g/hab/día), y es lo que
 * la gente YA come. Nada de aquí es una proyección de consultora.
 *
 * ── Lo que esta serie NO puede enseñar ─────────────────────────────────────
 * La micoproteína, los aislados vegetales tipo hamburguesa, la fermentación de
 * precisión, los insectos y la carne cultivada no tienen fila propia en la FAO:
 * o son demasiado pequeños para el balance nacional, o entran disueltos dentro
 * de la familia de su materia prima —una hamburguesa de soja se contabiliza en
 * `soja`, no aparte—. Por eso el catálogo de abajo marca cuáles se miden y
 * cuáles no, en vez de inventarles una cifra. Es el mismo criterio del resto de
 * la sección: antes un hueco declarado que un número de relleno.
 */

/**
 * El catálogo: qué proteínas alternativas hay, qué son y cómo se leen.
 *
 * `clave` es el campo de DIETA_PAIS, y a la vez la columna de la matriz. El
 * orden es el de lectura de la matriz, de la que más pesa a la que menos, con
 * los dos grupos acuáticos al final porque son de otro origen.
 *
 * `grupo` separa dos cosas que se confunden mucho al mirar la tabla:
 *   · 'sustituta' — se come EN LUGAR de carne, y compite con ella en el plato y
 *     a veces por la misma materia prima (la soja de la ración).
 *   · 'difusa'    — proteína real, pero que nadie come buscando proteína. Una
 *     papa aporta; nadie sustituye un bistec con papas. Sin esta marca, la
 *     matriz haría pasar a las hortalizas por una alternativa de mercado.
 */
export const FAMILIAS_ALT = [
  {
    clave: 'cereal',
    nombre: 'Cereales',
    corto: 'Cereal',
    icono: 'fa-wheat-awn',
    grupo: 'sustituta',
    que: 'Trigo, arroz y maíz comidos directamente, más el pan y la pasta.',
    lectura: 'Es la mayor fuente de proteína del planeta, y con diferencia. Donde el cereal manda, la proteína animal es un complemento y no la base.',
    mercado: 'Su precio es el de Granos: el mismo trigo y el mismo maíz que cotizan en Chicago.',
  },
  {
    clave: 'legumbre',
    nombre: 'Legumbres',
    corto: 'Legumbre',
    icono: 'fa-seedling',
    grupo: 'sustituta',
    que: 'Frijol, lenteja, garbanzo y chícharo seco.',
    lectura: 'La sustituta clásica de la carne, y la que más varía entre países: es tradición de cocina, no nivel de ingreso. México e India están muy por encima de la media mundial.',
    mercado: 'Casi todo se produce y se come dentro del propio país; el mercado internacional es delgado.',
  },
  {
    clave: 'oleaginosa',
    nombre: 'Oleaginosas',
    corto: 'Oleaginosa',
    icono: 'fa-jar',
    grupo: 'sustituta',
    que: 'Soja, cacahuate, ajonjolí y girasol comidos como alimento, no prensados para aceite.',
    lectura: 'La familia que más importa a este tablero: es la misma soja que se muele para la ración. Cada gramo que se come directo es un gramo que no pasa por un animal.',
    mercado: 'Cotiza en Chicago junto al maíz. Es el enlace directo entre este bloque y el de Granos.',
    detalle: [['soja', 'Soja'], ['cacahuate', 'Cacahuate']],
  },
  {
    clave: 'fruto',
    nombre: 'Frutos secos',
    corto: 'Fruto seco',
    icono: 'fa-tree',
    grupo: 'sustituta',
    que: 'Almendra, nuez, pistache y demás árbol de fruto seco.',
    lectura: 'Muy densa en proteína pero cara: aparece arriba en países ricos y en el Mediterráneo, y casi no aparece en el resto.',
    mercado: 'Cultivo perenne y de inversión larga: la oferta no responde a un año de precios altos.',
  },
  {
    clave: 'hortaliza',
    nombre: 'Hortalizas',
    corto: 'Hortaliza',
    icono: 'fa-carrot',
    grupo: 'difusa',
    que: 'Verdura fresca de todo tipo.',
    lectura: 'Aporta más proteína mundial que las legumbres, lo que sorprende. No es que sea rica en proteína: es que se come en cantidad enorme.',
    mercado: 'Perecedera y de mercado local. No sustituye a la carne, la acompaña.',
  },
  {
    clave: 'tuberculo',
    nombre: 'Tubérculos',
    corto: 'Tubérculo',
    /* No `fa-potato`: ese icono no existe en Font Awesome 6 Free, y una clase
       que no existe no falla —se queda como un hueco del tamaño del icono, que
       en una rejilla de nueve fichas se lee como un fallo de carga. Comprobado
       contra la hoja que carga la página. */
    icono: 'fa-mound',
    grupo: 'difusa',
    que: 'Papa, yuca, camote y ñame.',
    lectura: 'Proteína de base en el trópico, donde la yuca sostiene la dieta. En el resto del mundo es residual.',
    mercado: 'Voluminosa y barata de transportar mal: mercado sobre todo interno.',
  },
  {
    clave: 'fruta',
    nombre: 'Frutas',
    corto: 'Fruta',
    icono: 'fa-apple-whole',
    grupo: 'difusa',
    que: 'Fruta fresca, incluidos plátano y banano.',
    lectura: 'La familia más pobre en proteína de la tabla. Está porque completa el reparto, no porque compita con nada.',
    mercado: 'Sin relación con el mercado de proteína.',
  },
  {
    clave: 'pescado',
    nombre: 'Pescado y marisco',
    corto: 'Pescado',
    icono: 'fa-fish',
    grupo: 'sustituta',
    que: 'Pescado de mar y de agua dulce, crustáceos y moluscos, de captura y de granja acuícola.',
    lectura: 'La alternativa a la carne más consolidada que existe: aporta al mundo más proteína que la res. Domina en las costas asiáticas y en las islas.',
    mercado: 'Compite de frente con el pollo por precio, y la parte acuícola compite además por la misma harina y la misma soja.',
  },
  {
    clave: 'alga',
    nombre: 'Algas',
    corto: 'Alga',
    icono: 'fa-water',
    grupo: 'sustituta',
    que: 'Plantas acuáticas de consumo humano: alga marina, espirulina y similares.',
    lectura: 'Diminuta en la media mundial y enorme en un puñado de países del este de Asia. Es el caso donde la media engaña más de toda la matriz.',
    mercado: 'La única familia de este tablero que crece sin tierra agrícola ni alimento balanceado.',
  },
];

/** Solo las que de verdad sustituyen a la carne, para los totales y el ranking. */
export const CLAVES_SUSTITUTAS = FAMILIAS_ALT.filter((f) => f.grupo === 'sustituta').map((f) => f.clave);

/**
 * Las que la FAO NO mide, dichas por su nombre. El bloque las enseña porque la
 * pregunta «qué proteínas alternativas hay» no se responde entera con la tabla,
 * y callarlas haría creer que la matriz es la lista completa del sector.
 */
export const ALT_SIN_MEDIR = [
  {
    nombre: 'Aislados vegetales',
    icono: 'fa-burger',
    que: 'Hamburguesas, embutidos y leches formuladas a partir de proteína de soja, chícharo o trigo.',
    porque: 'La FAO contabiliza la materia prima, no el producto: una hamburguesa de soja entra en la columna de oleaginosas como soja, sin distinguirse del frijol de soja hervido.',
  },
  {
    nombre: 'Micoproteína y fermentación',
    icono: 'fa-bacterium',
    que: 'Proteína de hongo filamentoso y proteína producida por microorganismos en fermentador.',
    porque: 'No tiene partida en las hojas de balance alimentario: no procede de un cultivo ni de un animal, que son las dos entradas del balance.',
  },
  {
    nombre: 'Insectos',
    icono: 'fa-bug',
    que: 'Grillo y larva, tanto para consumo humano como para alimentar peces y aves.',
    porque: 'Consumo tradicional en decenas de países —México incluido— pero sin serie nacional comparable. Lo que hay son estimaciones locales que no se pueden poner en la misma tabla.',
  },
  {
    nombre: 'Carne cultivada',
    icono: 'fa-flask',
    que: 'Tejido animal producido en biorreactor a partir de células.',
    porque: 'Aprobada para venta solo en unos pocos mercados y en volúmenes que no llegan al gramo por habitante. Cualquier cifra por país sería inventada.',
  },
];

const num = (v) => (Number.isFinite(v) && v > 0 ? v : null);

/**
 * La dieta de un país en gramos de proteína por habitante y día, desglosada.
 * Es lo que sostiene el bloque de proteínas alternativas sin estimar nada: la
 * FAO ya mide cuánta proteína no ganadera come cada país.
 */
export function dietaDe(ne) {
  const d = ne === 'MUNDO' ? DIETA_MUNDO : DIETA_PAIS[ne];
  if (!d || !Number.isFinite(d.animal) || !Number.isFinite(d.vegetal)) return null;

  /* El total sale del Grand Total de la FAO si viene, y no de animal+vegetal:
     los dos agregados se redondean por separado y su suma se desvía unas
     centésimas. Con un total propio, los porcentajes de la matriz cuadran. */
  const total = num(d.total) || d.animal + d.vegetal;

  /* No ganadera = todo lo vegetal, más lo acuático. El pescado y las algas están
     dentro de `animal` en la clasificación de la FAO, así que hay que sumarlos
     a mano: son proteína animal, pero no de ganadería. */
  const pescado = num(d.pescado) || 0;
  const alga = num(d.alga) || 0;
  const noGanadera = d.vegetal + pescado + alga;

  return {
    ...d,
    total,
    noGanadera,
    ganadera: total - noGanadera,
    pctNoGanadera: (noGanadera / total) * 100,
    pctGanadera: ((total - noGanadera) / total) * 100,
    pctVegetal: (d.vegetal / total) * 100,
    pctAnimal: (d.animal / total) * 100,
    /* Las familias alternativas del país, de mayor a menor, ya cruzadas con el
       catálogo para que quien las pinte no tenga que volver a buscarlas. */
    familias: FAMILIAS_ALT
      .map((f) => ({ ...f, valor: num(d[f.clave]) }))
      .filter((f) => f.valor != null)
      .sort((a, b) => b.valor - a.valor),
  };
}

/**
 * La matriz: una fila por país, una columna por familia alternativa.
 *
 * Devuelve los 152 países sin recortar y sin ordenar. Ordenar, filtrar y decidir
 * cuántos caben es cosa de quien la pinta —la tabla se ordena por cualquier
 * columna—, y aquí solo se garantiza que el dato de cada celda sea el de la FAO
 * o un hueco declarado.
 *
 * `pct` es sobre el TOTAL de proteína del país, no sobre la parte vegetal. Es lo
 * que hace comparables dos filas muy distintas: el 9% de legumbre de India y el
 * 5% de México se leen sobre la misma base aunque coman cantidades de proteína
 * muy diferentes.
 */
export function matrizAlternativas() {
  const filas = Object.keys(DIETA_PAIS)
    .map((ne) => filaAlt(ne))
    .filter(Boolean);
  return { filas, mundo: filaAlt('MUNDO') };
}

function filaAlt(ne) {
  const d = dietaDe(ne);
  if (!d) return null;

  const g = {};
  const pct = {};
  for (const f of FAMILIAS_ALT) {
    const v = num(d[f.clave]);
    g[f.clave] = v;
    pct[f.clave] = v == null ? null : (v / d.total) * 100;
  }

  /* Lo que sustituye de verdad: la suma de las familias marcadas 'sustituta'.
     Es distinto de `noGanadera`, que incluye la papa y el tomate. Esta es la
     cifra con la que se ordena el ranking del bloque. */
  const sustituta = CLAVES_SUSTITUTAS.reduce((s, c) => s + (g[c] || 0), 0);

  return {
    ne,
    pais: ne === 'MUNDO' ? 'Mundo' : nombreEs(ne),
    esMundo: ne === 'MUNDO',
    total: d.total,
    ganadera: d.ganadera,
    noGanadera: d.noGanadera,
    pctNoGanadera: d.pctNoGanadera,
    sustituta,
    pctSustituta: (sustituta / d.total) * 100,
    g,
    pct,
    /* La familia alternativa más grande del país. Es la columna que la tabla
       resalta: dice de un vistazo de qué vive la proteína no ganadera de ahí. */
    dominante: FAMILIAS_ALT.reduce(
      (may, f) => ((g[f.clave] || 0) > (g[may?.clave] || 0) ? f : may),
      null,
    ),
  };
}

/**
 * Máximo de cada columna sobre las filas que se están pintando. Lo necesita el
 * mapa de calor de la matriz: la intensidad de una celda es relativa a SU
 * columna, no a la tabla entera. Con una sola escala global, el cereal —que va
 * de 20 a 60 g— dejaría a las algas y a los frutos secos en blanco absoluto y
 * la matriz solo enseñaría una columna oscura y ocho vacías.
 */
export function topesColumna(filas) {
  const topes = {};
  for (const f of FAMILIAS_ALT) {
    const vals = filas.map((r) => r.g[f.clave]).filter((v) => v != null);
    topes[f.clave] = vals.length ? Math.max(...vals) : 0;
  }
  return topes;
}
