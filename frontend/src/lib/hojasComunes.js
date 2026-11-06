/**
 * Hojas compartidas por las páginas, en un único sitio.
 *
 * Estaban copiadas en cada componente, y la copia se desincronizó: Inicio pedía
 * `base.css?v=2` mientras el resto pedía `base.css` a secas, y `dark-pilot.css`
 * iba con ?v=2 en Inicio y ?v=12 en Finanzas. Como usePageStyles lleva la
 * cuenta por URL, dos versiones del mismo archivo son dos <link> distintos y
 * dos entradas de caché: se descarga dos veces y una de las dos puede quedarse
 * vieja. Declarándolas aquí, cambiar una versión es un solo cambio.
 *
 * ESQUELETO va primero en todas las páginas; lo propio de cada sección va
 * después, para que gane. Ver el comentario de orden en usePageStyles.
 */

/** Cabecera, pie, retícula y tipografía: lo que comparte todo el sitio. */
export const ESQUELETO = [
  '/assets/css/base.css?v=2',
  '/assets/css/header.css?v=9',
  '/assets/css/footer.css',
  '/assets/css/responsive.css',
];

/** Igual que ESQUELETO pero sin pie, para las pantallas que no lo montan. */
export const ESQUELETO_SIN_PIE = ESQUELETO.filter((h) => !h.includes('footer.css'));

/** Tema oscuro piloto (Inicio y Finanzas). Ver la memoria del proyecto. */
export const DARK_PILOT = '/assets/css/dark-pilot.css?v=16';

/** Capa de datos heredada: casi todas las secciones la necesitan. */
export const DATOS = [
  '/assets/js/api-keys.js?v=5',
  '/assets/js/data-service.js?v=23',
];
export const CHART_JS='/assets/js/vendor/chart.umd.js?v=2';
export const LIGHTWEIGHT_CHARTS='/assets/js/vendor/lightweight-charts.standalone.production.js?v=1';
export const MAPA_MUNDIAL='/assets/js/world-map-data.js?v=2';
