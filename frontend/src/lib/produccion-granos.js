/*
 * Producción de grano por país — campaña 2025/26.
 *
 * ── De dónde salen estas cifras ────────────────────────────────────────────
 * Del PSD (Production, Supply and Distribution) del USDA Foreign Agricultural
 * Service, que es la serie de referencia del sector y de dominio público:
 *
 *     https://apps.fas.usda.gov/psdonline/downloads/psd_grains_pulses_csv.zip
 *     https://apps.fas.usda.gov/psdonline/downloads/psd_oilseeds_csv.zip
 *
 * Filtro aplicado: Attribute_Description = "Production", Unit = "(1000 MT)",
 * Market_Year = 2025, cultivos Corn / Wheat / Oilseed, Soybean. Los valores de
 * abajo son ese número dividido entre mil, es decir MILLONES de toneladas
 * métricas. Descargado y cruzado el 2026-08-19.
 *
 * ── Por qué la campaña 2025/26 y no la 2026/27 ─────────────────────────────
 * El PSD ya publica Market_Year 2026, pero en agosto de 2026 esa campaña
 * acaba de empezar y sus cifras son PROYECCIÓN, no cosecha. La 2025/26 es la
 * última cerrada: es la que responde a «cuánto produjo el año pasado». Al
 * actualizar, subir de año solo cuando la campaña haya terminado, y mover
 * `CAMPANA` con ella — la etiqueta que ve el usuario sale de ahí, no de un
 * texto suelto en el componente.
 *
 * ── Las claves son nombres de Natural Earth, no del USDA ───────────────────
 * El PSD escribe «United States», «Burma», «Congo (Kinshasa)»; la geometría del
 * mapa (assets/js/world-map-data.js) escribe «United States of America»,
 * «Myanmar», «Dem. Rep. Congo». Este archivo guarda ya la forma de Natural
 * Earth, porque una clave que no case deja al país gris sin avisar de nada.
 * El cruce se hizo contra la lista real de la geometría, no a ojo: de 121
 * países con producción, 104 casan y superan el mínimo, y los que no casaban
 * se resolvieron con alias hasta no dejar ninguno relevante fuera.
 *
 * ── Esto NO contradice al catálogo de orígenes ─────────────────────────────
 * granos-mapa.js advertía que el mapa no podía decir cuánto produce cada país
 * "porque obligaría a inventar cifras". La advertencia seguía siendo cierta
 * mientras la única fuente eran los precios de Chicago, que son globales y no
 * se reparten por país. Aquí no se reparte nada: son cifras publicadas, país a
 * país, por el organismo que las mide.
 */

/** Campaña a la que corresponden las cifras. Se muestra al usuario. */
export const CAMPANA = '2025/26';

/** Fuente citada en el pie del mapa. */
export const FUENTE = 'USDA · Foreign Agricultural Service (PSD)';

/** Millones de toneladas métricas. Claves = nombres Natural Earth. */
export const PRODUCCION_GRANOS = {
  'United States of America': { maiz: 432.342, trigo: 54.01, soja: 115.989 },
  China: { maiz: 301.24, trigo: 140.07, soja: 20.9 },
  Brazil: { maiz: 140, trigo: 7.873, soja: 180.5 },
  India: { maiz: 55.09, trigo: 117.945, soja: 11.027 },
  Argentina: { maiz: 63, trigo: 27.886, soja: 49.5 },
  Russia: { maiz: 14.8, trigo: 90.3, soja: 9 },
  Canada: { maiz: 14.867, trigo: 39.955, soja: 6.918 },
  Ukraine: { maiz: 30.9, trigo: 24.1, soja: 5.5 },
  Pakistan: { maiz: 8.794, trigo: 28.396, soja: 0.001 },
  Australia: { maiz: 0.361, trigo: 35.985, soja: 0.052 },
  Mexico: { maiz: 24.7, trigo: 1.75, soja: 0.305 },
  Turkey: { maiz: 7.9, trigo: 16.8, soja: 0.15 },
  'South Africa': { maiz: 18, trigo: 1.906, soja: 3.05 },
  Kazakhstan: { maiz: 1.001, trigo: 19.326, soja: 0.213 },
  Paraguay: { maiz: 6.4, trigo: 1.2, soja: 12.1 },
  Ethiopia: { maiz: 10.3, trigo: 6.5, soja: 0.26 },
  Egypt: { maiz: 6.7, trigo: 9.2, soja: 0.085 },
  Iran: { maiz: 1.4, trigo: 13.5, soja: 0.17 },
  Indonesia: { maiz: 13.3, soja: 0.32 },
  Nigeria: { maiz: 11.7, trigo: 0.13, soja: 1.5 },
  'United Kingdom': { maiz: 0.03, trigo: 11.958 },
  Philippines: { maiz: 8.2, soja: 0.001 },
  Tanzania: { maiz: 7.5, trigo: 0.075 },
  Serbia: { maiz: 3.4, trigo: 3.681, soja: 0.3 },
  Bangladesh: { maiz: 5.8, trigo: 1.05, soja: 0.175 },
  Uzbekistan: { maiz: 0.725, trigo: 6.1, soja: 0.01 },
  Thailand: { maiz: 5.4, soja: 0.051 },
  Bolivia: { maiz: 1.15, trigo: 0.3, soja: 3.9 },
  Nepal: { maiz: 3.1, trigo: 2.2 },
  Afghanistan: { maiz: 0.275, trigo: 4.8 },
  Iraq: { maiz: 0.5, trigo: 4.4 },
  Uruguay: { maiz: 1.2, trigo: 1.43, soja: 2.1 },
  Uganda: { maiz: 4.5, trigo: 0.025, soja: 0.15 },
  Belarus: { maiz: 1.8, trigo: 2.7 },
  Zambia: { maiz: 3.865, trigo: 0.13, soja: 0.289 },
  Vietnam: { maiz: 4.2, soja: 0.041 },
  Mali: { maiz: 4, trigo: 0.035 },
  Ghana: { maiz: 3.5, soja: 0.36 },
  Kenya: { maiz: 3.4, trigo: 0.22 },
  Morocco: { maiz: 0.055, trigo: 3.5 },
  Angola: { maiz: 3.3, trigo: 0.04 },
  Algeria: { maiz: 0.012, trigo: 3.2 },
  Myanmar: { maiz: 2.7, trigo: 0.07, soja: 0.14 },
  Malawi: { maiz: 2.86, trigo: 0.001 },
  Benin: { maiz: 2.13, soja: 0.7 },
  Moldova: { maiz: 1.001, trigo: 1.596 },
  'North Korea': { maiz: 2.3, trigo: 0.065, soja: 0.18 },
  Mozambique: { maiz: 2.3, trigo: 0.017 },
  'Dem. Rep. Congo': { maiz: 2.25, trigo: 0.009 },
  Cameroon: { maiz: 2.2 },
  Azerbaijan: { maiz: 0.29, trigo: 1.9 },
  Peru: { maiz: 1.65, trigo: 0.215, soja: 0.003 },
  'Burkina Faso': { maiz: 1.85 },
  Zimbabwe: { maiz: 1.5, trigo: 0.28, soja: 0.042 },
  Chile: { maiz: 0.55, trigo: 1.17 },
  Colombia: { maiz: 1.55, trigo: 0.006, soja: 0.135 },
  Guatemala: { maiz: 1.629, soja: 0.036 },
  Syria: { maiz: 0.45, trigo: 1.15, soja: 0.004 },
  Ecuador: { maiz: 1.509, trigo: 0.005, soja: 0.019 },
  Kyrgyzstan: { maiz: 0.81, trigo: 0.516 },
  Tunisia: { trigo: 1.318 },
  Japan: { maiz: 0.016, trigo: 1.059, soja: 0.239 },
  Venezuela: { maiz: 1.26, soja: 0.007 },
  'Saudi Arabia': { maiz: 0.135, trigo: 1.1 },
  Tajikistan: { maiz: 0.4, trigo: 0.811 },
  Togo: { maiz: 1.12 },
  Cambodia: { maiz: 1 },
  'Bosnia and Herz.': { maiz: 0.63, trigo: 0.275, soja: 0.007 },
  Guinea: { maiz: 0.76 },
  'New Zealand': { maiz: 0.227, trigo: 0.463 },
  Honduras: { maiz: 0.69 },
  Switzerland: { maiz: 0.16, trigo: 0.5, soja: 0.008 },
  Albania: { maiz: 0.4, trigo: 0.23 },
  'El Salvador': { maiz: 0.61 },
  Turkmenistan: { maiz: 0.008, trigo: 0.6 },
  Burundi: { maiz: 0.6 },
  Senegal: { maiz: 0.569 },
  Rwanda: { maiz: 0.5, trigo: 0.015 },
  Laos: { maiz: 0.47 },
  Chad: { maiz: 0.45, trigo: 0.004 },
  Norway: { trigo: 0.42 },
  Nicaragua: { maiz: 0.37, soja: 0.007 },
  Georgia: { maiz: 0.21, trigo: 0.15 },
  Madagascar: { maiz: 0.3 },
  'Sri Lanka': { maiz: 0.3 },
  Sudan: { trigo: 0.3 },
  'South Korea': { maiz: 0.094, trigo: 0.038, soja: 0.156 },
  Haiti: { maiz: 0.275 },
  Mongolia: { trigo: 0.268 },
  'Central African Rep.': { maiz: 0.2 },
  Libya: { trigo: 0.2 },
  'S. Sudan': { maiz: 0.185 },
  Yemen: { maiz: 0.07, trigo: 0.115 },
  Armenia: { trigo: 0.17 },
  Lebanon: { maiz: 0.003, trigo: 0.14 },
  Panama: { maiz: 0.12 },
  Taiwan: { maiz: 0.105, trigo: 0.002, soja: 0.007 },
  Cuba: { maiz: 0.11 },
  eSwatini: { maiz: 0.1 },
  Namibia: { maiz: 0.075, trigo: 0.025 },
  Somalia: { maiz: 0.097 },
  Lesotho: { maiz: 0.075, trigo: 0.007 },
  'Dominican Rep.': { maiz: 0.07 },
  Israel: { trigo: 0.06 },
};

/*
 * ── La Unión Europea es un caso aparte, y hay que decirlo ──────────────────
 * El PSD deja de desglosar a los socios de la UE en las campañas recientes: no
 * publica Francia ni Alemania por separado, solo el bloque. Si el mapa se
 * limitara a `PRODUCCION_GRANOS`, media Europa saldría gris — leyéndose como
 * "aquí no se cultiva nada" cuando el bloque es el tercer productor mundial de
 * grano con 204.8 Mt.
 *
 * Repartir esos 204.8 Mt entre los 26 países sería exactamente lo que este
 * archivo no hace. Así que se pintan como bloque y la ficha lo dice con
 * todas las letras: la cifra es de la UE entera, no de ese país.
 */
export const BLOQUE_UE = { maiz: 56.799, trigo: 145.106, soja: 2.854 };

export const MIEMBROS_UE = [
  'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia', 'Denmark',
  'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Ireland',
  'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Netherlands', 'Poland',
  'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden',
];

/** Nombre y orden de lectura de los tres cultivos. */
export const CULTIVOS = [
  ['maiz', 'Maíz'],
  ['trigo', 'Trigo'],
  ['soja', 'Soja'],
];

/*
 * ── La escala de color ─────────────────────────────────────────────────────
 * El relleno del mapa codifica MAGNITUD (cuánto grano produce el país), y la
 * regla para magnitud es una rampa de UN SOLO TONO, claro→oscuro. Antes el
 * mapa pintaba cuatro colores categóricos —dorado, morado, verde, rosa—
 * tomados prestados de otras secciones: cuatro identidades distintas para un
 * dato que no es identidad sino cantidad. De ahí que "no fueran acorde": el
 * color no decía nada de lo que la ficha contaba.
 *
 * Los seis pasos salen del dorado de Mercados (--mk-granos, OKLCH H=80.4°),
 * con L de 0.48 a 0.88 en saltos de 0.08 y el croma máximo que admite sRGB en
 * cada paso. Validados contra la superficie del mapa (#1d2837) con el script
 * de la guía de visualización: L monótona, ΔL ≥ 0.06 entre pasos, y el extremo
 * tenue a 2.24:1 del fondo — por encima del mínimo de 2:1 que lo separa del
 * mar. Los hex viven en Mercados.css como --gm-p0…--gm-p5; aquí solo está el
 * número de banda, porque el color va por clase y nunca en línea.
 *
 * Los cortes son redondos y no cuantiles: 1 / 5 / 20 / 60 / 200 Mt reparten los
 * 104 países en 37-37-16-6-5-3, que es la cola larga real del sector. Un
 * cuantil daría bandas de igual tamaño y haría parecer que Camboya y Estados
 * Unidos están a dos pasos de distancia.
 */
export const CORTES = [1, 5, 20, 60, 200];

/*
 * La etiqueta de cada paso es su corte INFERIOR, no el rango completo. Con
 * rangos («20 – 60», «60 – 200», «≥ 200») las etiquetas medían más que su casilla
 * y se montaban unas sobre otras en la esquina de la cabecera. Los cortes se
 * leen igual de bien —una escalera se entiende por sus divisiones— y caben.
 */
export const ESCALA = [
  { banda: 0, etiqueta: '0' },
  { banda: 1, etiqueta: '1' },
  { banda: 2, etiqueta: '5' },
  { banda: 3, etiqueta: '20' },
  { banda: 4, etiqueta: '60' },
  /* El «+» cierra la escalera: sin él, el 200 se lee como el tope del mapa y no
     como el arranque de la última banda, que es abierta (Estados Unidos son
     602). Antes ese cierre lo hacía un «Mt» suelto al final de la fila, que no
     decía nada de por sí. */
  { banda: 5, etiqueta: '200+' },
];

/** Banda de la escala (0..5) que le toca a un total en millones de toneladas. */
export function bandaDe(total) {
  return CORTES.filter((c) => total >= c).length;
}

/** Por debajo de esto un cultivo no se enseña en la ficha. Ver `produccionDe`. */
const MINIMO_CULTIVO = 0.5;

/**
 * Todo lo que el mapa necesita saber de un país: sus cultivos ordenados, el
 * total y la banda de color. Devuelve null si no hay dato — nunca un cero de
 * relleno, que es la regla de la casa.
 *
 * Los socios de la UE devuelven la cifra del BLOQUE con `esBloque: true`, para
 * que la ficha pueda advertirlo en vez de hacer pasar 204.8 Mt por producción
 * de Luxemburgo.
 */
export function produccionDe(ne) {
  const esBloque = MIEMBROS_UE.includes(ne);
  const p = esBloque ? BLOQUE_UE : PRODUCCION_GRANOS[ne];
  if (!p) return null;

  const total = CULTIVOS.reduce((s, [c]) => s + (p[c] || 0), 0);
  /* El umbral existe porque Australia produce 0.052 Mt de soja: cifra real,
     pero que en una ficha de tres líneas ocupa el mismo sitio que sus 36 Mt de
     trigo y hace creer que las dos pesan igual. Si ninguna llega al mínimo se
     enseña igualmente la mayor, para que un país con datos nunca salga con la
     ficha en blanco. */
  const todas = CULTIVOS
    .map(([clave, nombre]) => ({ clave, nombre, mt: p[clave] }))
    .filter((f) => Number.isFinite(f.mt) && f.mt > 0)
    .sort((a, b) => b.mt - a.mt);
  const filas = todas.filter((f) => f.mt >= MINIMO_CULTIVO);

  return {
    filas: filas.length ? filas : todas.slice(0, 1),
    total,
    banda: bandaDe(total),
    esBloque,
  };
}
