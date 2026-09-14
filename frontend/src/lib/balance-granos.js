/*
 * Balance mundial y comercio de grano — campaña 2025/26.
 *
 * ── De dónde salen las cifras ──────────────────────────────────────────────
 * Del mismo PSD del USDA que alimenta produccion-granos.js (ver allí las URL y
 * el filtro). Aquí se leen cuatro atributos más por cultivo, todos en (1000 MT)
 * y Market_Year 2025, agregando TODAS las filas de país:
 *
 *     Production · Domestic Consumption · Feed Dom. Consumption ·
 *     Beginning Stocks · Ending Stocks · Exports · Imports
 *
 * ── Por qué se puede sumar el mundo aquí ───────────────────────────────────
 * El PSD no publica una fila «World», así que el total es la suma de países. Se
 * comprobó que eso NO duplica: en esta campaña el dataset no trae a los socios
 * de la UE por separado —Francia, Alemania, Polonia y el resto no aparecen—,
 * solo la fila «European Union», que los representa. Verificado país a país
 * antes de sumar; si en una campaña futura el USDA volviera a desglosarlos,
 * habría que excluir la fila del bloque o el total saldría inflado.
 *
 * El maíz da 1 329.9 Mt. Circulan notas de enero de 2026 con ~1 296: la
 * diferencia son las revisiones al alza posteriores —sobre todo el récord de
 * Estados Unidos— y no un error de suma. Este archivo se generó en agosto de
 * 2026, con el dataset ya revisado.
 *
 * ── Qué NO hay aquí ────────────────────────────────────────────────────────
 * Nada calculado a ojo. `stockUso` es la única cifra derivada y es una división
 * entre dos valores de esta misma tabla. Al actualizar, regenerar todo junto:
 * mezclar una campaña de producción con otra de existencias da un stock/uso que
 * no significa nada.
 */

import { CAMPANA, FUENTE } from './produccion-granos.js';

export { CAMPANA, FUENTE };

/*
 * Millones de toneladas.
 *
 * `pienso` es Feed Dom. Consumption: la parte del consumo que se va a
 * alimentación animal. Es el número que más importa en esta plataforma —el
 * costo de la ración sale de ahí— y explica por qué el maíz manda: casi dos
 * tercios del que se produce en el mundo se lo come el ganado.
 *
 * En soja va a `null` a propósito, no a cero: la soja apenas se da en grano al
 * animal, se procesa antes en pasta y aceite, así que el PSD reporta 0 y ese 0
 * significa «no aplica», no «no se usa para alimentar». Un cero en pantalla se
 * leería como lo segundo.
 */
export const BALANCE = {
  maiz: {
    nombre: 'Maíz',
    produccion: 1329.9,
    consumo: 1304.3,
    pienso: 827.4,
    inicial: 296.7,
    existencias: 298.8,
    comercio: 220.7,
    stockUso: 22.9,
  },
  trigo: {
    nombre: 'Trigo',
    produccion: 843.4,
    consumo: 817.5,
    pienso: 168.2,
    inicial: 260.5,
    existencias: 280.2,
    comercio: 227.4,
    stockUso: 34.3,
  },
  soja: {
    nombre: 'Soja',
    produccion: 429.5,
    consumo: 430.3,
    pienso: null,
    inicial: 126,
    existencias: 125.1,
    comercio: 187.2,
    stockUso: 29.1,
  },
};

/* Los seis mayores de cada lado, en millones de toneladas. Nombres ya en
   español: el PSD escribe «United States» y «Korea, South». */
export const COMERCIO = {
  maiz: {
    exportadores: [
      { pais: 'Estados Unidos', mt: 86.36 },
      { pais: 'Argentina', mt: 45 },
      { pais: 'Brasil', mt: 42 },
      { pais: 'Ucrania', mt: 23 },
      { pais: 'Rusia', mt: 4 },
      { pais: 'Paraguay', mt: 3.5 },
    ],
    importadores: [
      { pais: 'México', mt: 27 },
      { pais: 'Unión Europea', mt: 18.5 },
      { pais: 'Japón', mt: 15.5 },
      { pais: 'Vietnam', mt: 13.5 },
      { pais: 'Egipto', mt: 12.5 },
      { pais: 'Corea del Sur', mt: 11.5 },
    ],
  },
  trigo: {
    exportadores: [
      { pais: 'Rusia', mt: 48 },
      { pais: 'Unión Europea', mt: 31.5 },
      { pais: 'Canadá', mt: 29.6 },
      { pais: 'Estados Unidos', mt: 24.71 },
      { pais: 'Australia', mt: 24.5 },
      { pais: 'Argentina', mt: 19.1 },
    ],
    importadores: [
      { pais: 'Egipto', mt: 15.5 },
      { pais: 'Indonesia', mt: 13.02 },
      { pais: 'Argelia', mt: 9 },
      { pais: 'Filipinas', mt: 7.73 },
      { pais: 'Bangladés', mt: 7.4 },
      { pais: 'Vietnam', mt: 7.3 },
    ],
  },
  soja: {
    exportadores: [
      { pais: 'Brasil', mt: 115 },
      { pais: 'Estados Unidos', mt: 41.37 },
      { pais: 'Argentina', mt: 9 },
      { pais: 'Paraguay', mt: 8.2 },
      { pais: 'Canadá', mt: 5.3 },
      { pais: 'Ucrania', mt: 2.3 },
    ],
    importadores: [
      { pais: 'China', mt: 113 },
      { pais: 'Unión Europea', mt: 13.8 },
      { pais: 'Argentina', mt: 7.05 },
      { pais: 'México', mt: 6.7 },
      { pais: 'Egipto', mt: 4.9 },
      { pais: 'Turquía', mt: 4.25 },
    ],
  },
};

/*
 * Lectura del stock/uso: cuántos días de consumo quedan guardados al cerrar la
 * campaña. Es EL indicador de tensión del mercado de granos, y por eso se
 * enseña interpretado y no como un porcentaje suelto.
 *
 * Los cortes no son arbitrarios: por debajo del 20% el mercado no tiene colchón
 * y cualquier susto de clima se va al precio; por encima del 30% hay grano de
 * sobra y las subidas no se sostienen. Es la banda que maneja el propio sector,
 * y aplicarla igual a los tres cultivos es una simplificación deliberada — el
 * maíz suele moverse más bajo que el trigo, así que el trigo tenderá a salir
 * «holgado» y el maíz «ajustado» con más frecuencia. Se marca así a propósito:
 * es una lectura relativa entre cultivos, no un veredicto por cultivo.
 */
export function lecturaStock(pct) {
  if (pct < 20) return { tono: 'tenso', etiqueta: 'Tenso', nota: 'Sin colchón: un problema de clima se traslada al precio.' };
  if (pct < 30) return { tono: 'ajustado', etiqueta: 'Ajustado', nota: 'Reserva suficiente, sensible a sorpresas de oferta.' };
  return { tono: 'holgado', etiqueta: 'Holgado', nota: 'Existencias amplias: las subidas cuestan más de sostener.' };
}

/** Días de consumo que cubren las existencias finales. */
export function diasDeReserva(cultivo) {
  const b = BALANCE[cultivo];
  if (!b) return null;
  return Math.round((b.existencias / b.consumo) * 365);
}
