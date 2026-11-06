/*
 * Precarga de rutas de la SPA.
 *
 * Las pantallas siguen separadas en chunks para no ralentizar el inicio, pero
 * una navegación no debe mostrar HTML sin formato. Antes React resolvía el
 * componente y usePageStyles descargaba las hojas heredadas después del primer
 * pintado. Aquí ambas cosas se preparan antes de que la ruta se pueda montar.
 */
import { DARK_PILOT, ESQUELETO } from './hojasComunes.js';
import { hojaDelMarco } from './shellStyles.js';
import { HOJAS_FINANZAS } from './finanzasStyles.js';

const ESTILOS_POR_RUTA = {
  '/': ['/assets/css/base.css'],
  '/login': ['/assets/css/base.css'],
  '/inicio': [...ESQUELETO, DARK_PILOT],
  '/informes': [...ESQUELETO, DARK_PILOT],
  '/finanzas': HOJAS_FINANZAS,
  '/mercados': [
    ...ESQUELETO,
    '/assets/css/mercados-redesign-v2.css?v=1',
    '/assets/css/daily-news-favro.css?v=23',
    '/assets/css/daily-news-editorial.css?v=14',
    '/assets/css/daily-news-coverage-window.css?v=1',
    '/assets/css/daily-news-story-index.css?v=2',
  ],
  '/mexico': [
    ...ESQUELETO,
    DARK_PILOT,
    '/assets/css/daily-news-favro.css?v=23',
    '/assets/css/daily-news-editorial.css?v=14',
    '/assets/css/daily-news-coverage-window.css?v=1',
    '/assets/css/daily-news-story-index.css?v=2',
  ],
  '/mercado-proteinas': [...ESQUELETO],
  '/noticias': [...ESQUELETO],
  '/configuracion': [...ESQUELETO],
  '/orion': [
    '/assets/css/base.css',
    '/assets/css/header.css?v=9',
    '/assets/css/responsive.css',
    '/assets/css/vall-ai-page.css?v=12',
    '/assets/css/vall-ai-redesign.css?v=45',
  ],
};

const CARGADORES = {
  '/': () => import('../pages/Presentacion.jsx'),
  '/login': () => import('../pages/Login.jsx'),
  '/inicio': () => import('../pages/Inicio.jsx'),
  '/informes': () => import('../pages/Informes.jsx'),
  '/finanzas': () => import('../pages/Finanzas.jsx'),
  '/mercados': () => import('../pages/Mercados.jsx'),
  '/mexico': () => import('../pages/Mexico.jsx'),
  '/noticias': () => import('../pages/Noticias.jsx'),
  '/mercado-proteinas': () => import('../pages/MercadoProteinas.jsx'),
  '/configuracion': () => import('../pages/Configuracion.jsx'),
  '/orion': () => import('../pages/VallAi.jsx'),
};

const rutasEnCurso = new Map();
const ESPERA_ESTILOS_MS = 180;

function rutaNormalizada(ruta) {
  try {
    const url = new URL(ruta, window.location.origin);
    return url.pathname === '/vall-ai' ? '/orion' : url.pathname;
  } catch {
    return ruta;
  }
}

function enlacePreparado(href) {
  return [...document.querySelectorAll('link[data-vn-page-css], link[data-vn-prefetch-css]')]
    .find((link) => link.dataset.vnPageCss === href || link.dataset.vnPrefetchCss === href);
}

function precargarEstilo(href) {
  if (hojaDelMarco(href)) return Promise.resolve();
  const previo = enlacePreparado(href);
  if (previo) return Promise.resolve();

  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'style';
    link.href = href;
    link.dataset.vnPrefetchCss = href;
    link.onload = () => resolve();
    // Si una CDN no responde, la ruta debe seguir siendo utilizable; el hook
    // conservará su manejo normal al intentar activar la hoja.
    link.onerror = () => { link.remove(); resolve(); };
    document.head.appendChild(link);
  });
}

/**
 * Devuelve el módulo de una ruta solo cuando su CSS heredado ya está en caché.
 * React.lazy usa esta promesa, por lo que la vista nueva nunca se monta desnuda.
 */
export function precargarRuta(ruta) {
  const rutaFinal = rutaNormalizada(ruta);
  const cargador = CARGADORES[rutaFinal];
  if (!cargador) return Promise.resolve(null);
  if (rutasEnCurso.has(rutaFinal)) return rutasEnCurso.get(rutaFinal);

  const estilos = Promise.all((ESTILOS_POR_RUTA[rutaFinal] || []).map(precargarEstilo));
  // Una hoja lenta (o una CDN temporalmente ocupada) no debe congelar toda la
  // navegación. Normalmente ya está en caché gracias al hover/foco; cuando no,
  // le damos una ventana muy corta y usePageStyles la activa antes del paint.
  const esperaBreve = new Promise((resolve) => window.setTimeout(resolve, ESPERA_ESTILOS_MS));
  const promesa = Promise.all([cargador(), Promise.race([estilos, esperaBreve])])
    .then(([modulo]) => modulo)
    .catch(error => {
      rutasEnCurso.delete(rutaFinal);
      throw error;
    });

  rutasEnCurso.set(rutaFinal, promesa);
  return promesa;
}

/** Prepara cualquier enlace interno al pasar el puntero o recibir foco. */
export function precargarDesdeEnlace(enlace) {
  if (!enlace?.href) return;
  const url = new URL(enlace.href, window.location.origin);
  if (url.origin !== window.location.origin) return;
  precargarRuta(url.pathname).catch(() => { /* La precarga es opcional; se reintenta al navegar. */ });
}

/**
 * Descarga los módulos de navegación cuando el navegador queda libre, sin
 * activar sus hojas de estilo. Mantiene pequeño el primer render y evita que
 * un clic posterior tenga que esperar la descarga del chunk de la página.
 */
export function precargarModulos(rutas = Object.keys(CARGADORES)) {
  return Promise.allSettled(rutas.map((ruta) => {
    const cargador = CARGADORES[rutaNormalizada(ruta)];
    return cargador ? cargador() : Promise.resolve(null);
  }));
}
