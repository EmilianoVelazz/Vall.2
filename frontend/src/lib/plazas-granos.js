/*
 * Plazas de los monitores: los mercados donde el precio de referencia se
 * convierte en un costo real, cada uno en su moneda.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * Los monitores enseñaban una sola columna de equivalencia en MXN, como si
 * México fuera el único destino que importa. Pero lo que cotiza en Chicago o en
 * Nueva York se compra en medio mundo, y la misma unidad cuesta cosas muy
 * distintas según la moneda con la que se pague: ahí es donde se ve por qué un
 * exportador argentino y un importador japonés leen el mismo precio de forma
 * opuesta.
 *
 * Hay DOS listas porque los mercados que importan no son los mismos. Quien
 * manda en el grano no es quien manda en la energía, y mezclarlos daría
 * columnas que no dicen nada en la mitad de las filas.
 *
 * `moneda` son códigos ISO 4217 tal como los devuelve /api/exchange-rates. Una
 * clave que no case deja la columna en blanco, nunca en un número inventado.
 */

/*
 * GRANOS. Cada plaza está aquí porque aparece entre los seis mayores
 * exportadores o importadores de alguno de los tres cultivos en
 * balance-granos.js (datos del USDA). No es una lista de "países importantes" a
 * ojo: si una plaza deja de estar en esas tablas, deja de tener sitio aquí.
 *
 * México va primero y no por orden alfabético: es el mayor importador de maíz
 * del mundo y el mercado que esta plataforma sirve.
 */
export const PLAZAS = [
  { cod: 'MX', pais: 'México', moneda: 'MXN' },
  { cod: 'BR', pais: 'Brasil', moneda: 'BRL' },
  { cod: 'AR', pais: 'Argentina', moneda: 'ARS' },
  { cod: 'EU', pais: 'Unión Europea', moneda: 'EUR' },
  { cod: 'CN', pais: 'China', moneda: 'CNY' },
  { cod: 'JP', pais: 'Japón', moneda: 'JPY' },
  { cod: 'EG', pais: 'Egipto', moneda: 'EGP' },
  { cod: 'KR', pais: 'Corea del Sur', moneda: 'KRW' },
];

/*
 * ENERGÍA. Criterio distinto y explícito: los mayores CONSUMIDORES de energía
 * con moneda propia, que son los mercados donde el barril de Nueva York se
 * convierte en costo de transporte y de operación.
 *
 * Salen Argentina y Egipto —que estaban por su papel en el grano, no en el
 * crudo— y entran India, Reino Unido y Canadá.
 *
 * A diferencia de la matriz de granos, esta NO marca «vende/compra»: no hay en
 * la plataforma una serie de comercio de crudo equivalente al PSD del USDA, y
 * un papel sin fuente detrás sería justo lo que el resto del código evita.
 */
export const PLAZAS_ENERGIA = [
  { cod: 'MX', pais: 'México', moneda: 'MXN' },
  { cod: 'EU', pais: 'Unión Europea', moneda: 'EUR' },
  { cod: 'CN', pais: 'China', moneda: 'CNY' },
  { cod: 'IN', pais: 'India', moneda: 'INR' },
  { cod: 'JP', pais: 'Japón', moneda: 'JPY' },
  { cod: 'BR', pais: 'Brasil', moneda: 'BRL' },
  { cod: 'CA', pais: 'Canadá', moneda: 'CAD' },
  { cod: 'GB', pais: 'Reino Unido', moneda: 'GBP' },
];

/*
 * METALES. Tercera lista y tercer criterio, porque el mapa del cobre no se
 * parece ni al del grano ni al del crudo: aquí conviven los grandes
 * PRODUCTORES —Chile y Perú sacan de sus minas cerca de un tercio del cobre
 * mundial— con los grandes CONSUMIDORES, y China es las dos cosas a la vez y
 * por goleada.
 *
 * Chile y Perú entran por eso, y no aparecen en ninguna de las otras dos
 * listas: leen la misma cotización que México, pero como ingreso de
 * exportación en vez de como costo de compra.
 *
 * Igual que en energía, sin marca de «vende/compra»: la plataforma no tiene una
 * serie de comercio de metales, y un papel sin fuente no se pinta.
 */
export const PLAZAS_METALES = [
  { cod: 'MX', pais: 'México', moneda: 'MXN' },
  { cod: 'CN', pais: 'China', moneda: 'CNY' },
  { cod: 'CL', pais: 'Chile', moneda: 'CLP' },
  { cod: 'PE', pais: 'Perú', moneda: 'PEN' },
  { cod: 'EU', pais: 'Unión Europea', moneda: 'EUR' },
  { cod: 'JP', pais: 'Japón', moneda: 'JPY' },
  { cod: 'IN', pais: 'India', moneda: 'INR' },
  { cod: 'KR', pais: 'Corea del Sur', moneda: 'KRW' },
];

/*
 * Papel de una plaza en un cultivo, según las tablas de comercio del USDA.
 * Devuelve 'exporta', 'importa' o null.
 *
 * Sirve para que la matriz no sea solo una tabla de conversiones: la misma
 * cifra significa ingreso para quien vende y costo para quien compra, y esa
 * distinción es la que convierte la tabla en una lectura.
 */
export function papelEnCultivo(comercio, cultivo, pais) {
  const c = comercio?.[cultivo];
  if (!c) return null;
  if (c.exportadores.some((x) => x.pais === pais)) return 'exporta';
  if (c.importadores.some((x) => x.pais === pais)) return 'importa';
  return null;
}

/*
 * Formato de un importe en moneda local.
 *
 * Hace falta porque el rango es brutal: la misma tonelada son 3 600 MXN y
 * 318 000 ARS, y unos y otros no pueden escribirse igual. Por encima de cien
 * mil se pasa a notación compacta —«318 mil»— porque a esa escala los dígitos
 * finales no aportan nada y sí rompen el ancho de la columna.
 */
export function importeLocal(valor) {
  if (!Number.isFinite(valor)) return null;
  /*
   * Los decimales dependen de la magnitud, y no es un capricho: la matriz de
   * energía mezcla en la misma columna una tonelada de grano (318 800 ARS) con
   * un MMBtu de gas (2.13 GBP). Redondeando todo a enteros, el gas en libras
   * salía como «2» y el diésel en euros como «3» — cifras destruidas por el
   * formato, que es peor que no enseñarlas.
   *
   * Por encima de cien mil se compacta porque ahí los dígitos finales no
   * aportan y sí rompen el ancho de la columna.
   */
  const abs = Math.abs(valor);
  const opciones = abs >= 100000 ? { notation: 'compact', maximumFractionDigits: 1 }
    : abs >= 100 ? { maximumFractionDigits: 0 }
      : abs >= 10 ? { maximumFractionDigits: 1 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return new Intl.NumberFormat('es-MX', opciones).format(valor);
}

/*
 * Igual que `importeLocal` pero con el signo delante, para el simulador.
 *
 * Va aparte porque el umbral es otro: en la matriz cada celda es una tonelada y
 * los valores viven en un rango estrecho; aquí una misma pantalla mezcla un
 * flete de 25 con una compra de metal de varios millones, y compactar desde
 * cien mil dejaría la mitad de las cifras sin sus dígitos útiles. Solo se
 * compacta a partir del millón, donde de verdad estorban.
 */
export function fmtMoneda(valor, _moneda) {
  if (!Number.isFinite(valor)) return '—';
  const abs = Math.abs(valor);
  const opciones = abs >= 1000000
    ? { notation: 'compact', maximumFractionDigits: 2 }
    : { maximumFractionDigits: abs < 100 ? 2 : 0 };
  return `$${new Intl.NumberFormat('es-MX', opciones).format(valor)}`;
}
