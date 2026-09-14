/*
 * El reparto de una canal en cortes, por especie.
 *
 * ══ LEE ESTO ANTES DE USARLO ══════════════════════════════════════════════
 *
 * Estas cifras NO son consumo medido, y no son por país. Son el RENDIMIENTO
 * TÉCNICO del despiece: qué parte del peso de una canal sale como cada corte.
 * Es una constante de anatomía y de sala de corte, prácticamente la misma en
 * todas partes, no una preferencia nacional.
 *
 * ── Por qué no hay dato de cortes por país ────────────────────────────────
 * Porque no existe publicado. Se comprobó sobre las fuentes que ya usa la
 * sección: las hojas de balance de la FAO desglosan la carne en cuatro
 * partidas de especie (bovino, cerdo, ave, ovino) y nada más —no hay «pierna»
 * ni «lomo» en ninguna—; el PSD del USDA llega solo hasta producción y consumo
 * por especie. No hay ninguna serie nacional comparable de consumo por corte.
 *
 * Inventar un reparto distinto para cada país sería exactamente lo que el
 * resto de esta sección se niega a hacer. Así que el reparto es el mismo para
 * todos y LA VISTA LO DICE. Lo que sí cambia de país a país es el TAMAÑO del
 * animal que le toca a cada persona al año, que sí está medido (los kg por
 * habitante de la FAO), y por eso los kilos de cada corte sí son propios de
 * cada país.
 *
 * ── Lo que SÍ se mide por país y varía muchísimo ──────────────────────────
 * Vísceras y grasa animal comestibles (`DESPOJOS_PAIS`, partidas 2736 y 2737
 * de la FAO): de décimas de kilo a más de treinta. Esa es la parte del animal
 * en la que los países de verdad se diferencian, y va en su propio bloque con
 * dato real. Mongolia come 32.5 kg de vísceras al año por persona; la media
 * mundial es 2.6.
 *
 * ── De dónde salen los porcentajes ────────────────────────────────────────
 * De las tablas de despiece estándar de la industria cárnica (cortes primarios
 * sobre peso de canal). Van REDONDEADOS A ENTEROS a propósito: el rendimiento
 * real varía con la raza, el peso de sacrificio, el grado de engrasamiento y la
 * propia sala de corte, así que un decimal fingiría una precisión que no hay.
 * Suman 100 por especie. Son órdenes de magnitud correctos para responder «qué
 * parte del animal pesa más», que es la pregunta del bloque; no sirven para
 * calcular el rendimiento de un lote concreto.
 */

/** Cada especie, con su silueta, su corte y de qué campo saca los kilos. */
export const ESPECIES_CANAL = [
  {
    id: 'res',
    nombre: 'Res',
    articulo: 'la res',
    icono: 'fa-cow',
    /* La clave con la que este animal aparece en PROTEINAS_PAIS.kg */
    clave: 'res',
    nota: 'Media canal de bovino. La espaldilla y la pierna son los dos tercios que sostienen el precio del animal: son los cortes de guisado y molida, no los caros.',
    cortes: [
      { nombre: 'Espaldilla y diezmillo', pct: 26, usos: 'Guisado, molida, milanesa' },
      { nombre: 'Pierna', pct: 22, usos: 'Bistec, molida, cecina' },
      { nombre: 'Lomo y sirloin', pct: 17, usos: 'Los cortes caros: rib eye, T-bone' },
      { nombre: 'Pecho y falda', pct: 17, usos: 'Arrachera, brisket, barbacoa' },
      { nombre: 'Costillar', pct: 9, usos: 'Costilla, asado' },
      { nombre: 'Chambarete y recortes', pct: 9, usos: 'Caldo, osobuco' },
    ],
  },
  {
    id: 'cerdo',
    nombre: 'Cerdo',
    articulo: 'el cerdo',
    /* `fa-bacon` y no `fa-piggy-bank`: Font Awesome Free no trae cerdo, y una
       alcancía en un tablero de mercados se lee como dinero, no como carne.
       Comprobado que existe por su punto de código, que es la única forma
       fiable (una clase inexistente no da error, deja un hueco). */
    icono: 'fa-bacon',
    clave: 'cerdo',
    nota: 'Canal de porcino. Es la especie que más se aprovecha entera: entre la panza, la papada y las patas, casi un tercio del animal va a productos que no son músculo magro.',
    cortes: [
      { nombre: 'Pierna', pct: 24, usos: 'Jamón, pierna horneada' },
      { nombre: 'Lomo', pct: 21, usos: 'Chuleta, lomo, canadian bacon' },
      { nombre: 'Espaldilla', pct: 19, usos: 'Carnitas, pulled pork, chorizo' },
      { nombre: 'Panza y tocino', pct: 16, usos: 'Tocino, chicharrón' },
      { nombre: 'Papada, patas y recortes', pct: 14, usos: 'Embutido, manteca, patas' },
      { nombre: 'Costilla', pct: 6, usos: 'Costilla BBQ, caldo' },
    ],
  },
  {
    id: 'pollo',
    nombre: 'Pollo',
    articulo: 'el pollo',
    icono: 'fa-drumstick-bite',
    clave: 'pollo',
    nota: 'Ave lista para cocinar. La pechuga sola es más de un tercio del ave, y es la razón de que el precio del pollo se siga por la pechuga y no por el animal entero.',
    cortes: [
      { nombre: 'Pechuga', pct: 38, usos: 'Filete, milanesa, deshebrada' },
      { nombre: 'Pierna y muslo', pct: 32, usos: 'Rostizado, guisado, frito' },
      { nombre: 'Rabadilla y carcasa', pct: 18, usos: 'Caldo, fondo, separación mecánica' },
      { nombre: 'Ala', pct: 12, usos: 'Alitas, botana' },
    ],
  },
];

/* Comprobación de contrato: si alguien retoca un porcentaje y olvida cuadrar el
   resto, el bloque enseñaría un reparto que no suma un animal. Falla al cargar
   el módulo, que es cuando se puede arreglar, y no en silencio en pantalla. */
for (const e of ESPECIES_CANAL) {
  const suma = e.cortes.reduce((s, c) => s + c.pct, 0);
  if (suma !== 100) {
    throw new Error(`Los cortes de «${e.nombre}» suman ${suma}%, no 100. Ver lib/cortes-canal.js.`);
  }
}

export const especieCanal = (id) => ESPECIES_CANAL.find((e) => e.id === id) || ESPECIES_CANAL[0];

/**
 * Los cortes de una especie con los kilos que le corresponden a una persona
 * del país elegido, ordenados de mayor a menor.
 *
 * `kgEspecie` son los kilos reales por habitante y año de esa carne (FAO). El
 * porcentaje es el rendimiento de la canal; el kilo, por tanto, es una
 * EQUIVALENCIA: «de los 15.8 kg de res al año, el peso de la pierna sale a
 * 3.5». No es una medición de que se coman esa pierna concreta.
 */
export function cortesDe(id, kgEspecie) {
  const e = especieCanal(id);
  return e.cortes
    .map((c) => ({ ...c, kg: kgEspecie > 0 ? (kgEspecie * c.pct) / 100 : null }))
    .sort((a, b) => b.pct - a.pct);
}
