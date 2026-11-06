import { lazy, Suspense, useEffect, useLayoutEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import RouteErrorBoundary from './components/RouteErrorBoundary.jsx';
import { iniciarTema } from './lib/tema.js';
import { iniciarIdioma } from './lib/idioma.js';
import { precargarDesdeEnlace, precargarModulos, precargarRuta } from './lib/routePrefetch.js';
import legacyRoutes from '../../shared/legacy-routes.json';

// Las pantallas siguen separadas para conservar una entrada ligera, pero sus
// módulos se precargan silenciosamente al quedar libre el navegador. Suspense
// ya no dibuja una portada con logo: durante un acceso frío no introduce una
// pantalla artificial entre la acción del usuario y la página solicitada.
const Presentacion      = lazy(() => precargarRuta('/'));
const Login             = lazy(() => precargarRuta('/login'));
const Configuracion     = lazy(() => precargarRuta('/configuracion'));
const Mexico            = lazy(() => precargarRuta('/mexico'));
const Noticias          = lazy(() => precargarRuta('/noticias'));
const Inicio            = lazy(() => precargarRuta('/inicio'));
const Informes          = lazy(() => precargarRuta('/informes'));
const Orion            = lazy(() => precargarRuta('/orion'));
const MercadoProteinas  = lazy(() => precargarRuta('/mercado-proteinas'));
const Mercados          = lazy(() => precargarRuta('/mercados'));
const Finanzas          = lazy(() => precargarRuta('/finanzas'));

/*
 * Migración terminada: las rutas son componentes de React.
 *
 * Ya no queda LegacyPage ni la tabla SECCIONES que montaba los .html en tiempo
 * de ejecución. Finanzas fue la última en salir; con ella se fueron también los
 * archivos de pages/, para que no vuelva a haber dos copias del mismo marcado
 * separándose sin que nadie lo note — que es como fracasó el primer intento.
 */
/* Las rutas con sesión. En tabla y no bloques calcados: así añadir
   una sección es una línea, y no hay forma de que a una se le olvide el
   ProtectedRoute — que es el fallo silencioso que importa aquí. */
const PROTEGIDAS = [
  ['/inicio', Inicio],
  ['/informes', Informes],
  ['/finanzas', Finanzas],
  ['/mercados', Mercados],
  ['/mercado-proteinas', MercadoProteinas],
  ['/mexico', Mexico],
  ['/noticias', Noticias],
  ['/orion', Orion],
  ['/configuracion', Configuracion],
];

function RedirigirRuta({ destino }) {
  const { search, hash } = useLocation();
  return <Navigate to={destino + search + hash} replace />;
}

function restablecerScrollInstantaneo() {
  const raiz = document.documentElement;
  const comportamientoPrevio = raiz.style.scrollBehavior;

  raiz.style.scrollBehavior = 'auto';
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  raiz.scrollTop = 0;
  document.body.scrollTop = 0;
  raiz.style.scrollBehavior = comportamientoPrevio;
}

function esCambioDeRutaInterno(enlace, evento) {
  if (!enlace?.href || enlace.hasAttribute('download')) return false;
  if (enlace.target && enlace.target !== '_self') return false;
  if (evento.button !== undefined && evento.button !== 0) return false;
  if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return false;

  const destino = new URL(enlace.href, window.location.origin);
  return destino.origin === window.location.origin
    && destino.pathname !== window.location.pathname;
}
/**
 * React Router conserva la posición vertical al cambiar de ruta. Cuando el
 * usuario navega desde el final de una página, eso deja visible durante un
 * instante el logotipo del footer de la siguiente sección. useLayoutEffect se
 * ejecuta antes de que el navegador pinte la ruta nueva, así que el cambio ya
 * nace en la parte superior y no necesita una transición ni un loader.
 */
function RestablecerScrollDeRuta() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    restablecerScrollInstantaneo();
  }, [pathname]);

  useEffect(() => {
    const restauracionPrevia = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = restauracionPrevia; };
  }, []);

  return null;
}

export default function App() {
  /* Aquí y no en cada página: la hoja del tema tiene que estar en el <head>
     valga cual valga la ruta, y añadida al final para ganarle a los !important
     de las hojas heredadas. Ver lib/tema.js. */
  useEffect(() => { iniciarTema(); iniciarIdioma(); }, []);

  useEffect(() => {
    const prepararEnlace = (evento) => {
      const enlace = evento.target.closest?.('a[href]');
      if (!enlace) return;

      precargarDesdeEnlace(enlace);

      // Restablecer al hacer click, cuando el destino ya está fijado. Hacerlo
      // en pointerdown mueve los enlaces de una página larga antes de soltar
      // el botón y puede impedir que se complete la navegación.
      if (
        evento.type === 'click'
        && esCambioDeRutaInterno(enlace, evento)
      ) {
        restablecerScrollInstantaneo();
      }
    };
    document.addEventListener('pointerover', prepararEnlace, { capture: true, passive: true });
    document.addEventListener('pointerdown', prepararEnlace, { capture: true, passive: true });
    document.addEventListener('click', prepararEnlace, { capture: true, passive: true });
    document.addEventListener('focusin', prepararEnlace, { capture: true });
    return () => {
      document.removeEventListener('pointerover', prepararEnlace, { capture: true });
      document.removeEventListener('pointerdown', prepararEnlace, { capture: true });
      document.removeEventListener('click', prepararEnlace, { capture: true });
      document.removeEventListener('focusin', prepararEnlace, { capture: true });
    };
  }, []);

  useEffect(() => {
    const preparar = () => { void precargarModulos(PROTEGIDAS.map(([ruta]) => ruta)); };
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(preparar, { timeout: 1200 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(preparar, 250);
    return () => window.clearTimeout(id);
  }, []);

  return (

    <>
      <RestablecerScrollDeRuta />
      <RouteErrorBoundary><Suspense fallback={null}>
        <Routes>
          {/* La presentación y el login son públicos; la plataforma exige sesión. */}
          <Route path="/" element={<Presentacion />} />
          <Route path="/login" element={<Login />} />
          {Object.entries(legacyRoutes).map(([desde, destino]) => (
            <Route key={desde} path={desde} element={<RedirigirRuta destino={destino} />} />
          ))}
          <Route path="/vall-ai" element={<ProtectedRoute><RedirigirRuta destino="/orion" /></ProtectedRoute>} />
          {PROTEGIDAS.map(([ruta, Pagina]) => (
            <Route
              key={ruta}
              path={ruta}
              element={<ProtectedRoute><Pagina /></ProtectedRoute>}
            />
          ))}

          {/* Las direcciones desconocidas vuelven a la presentación. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense></RouteErrorBoundary>
    </>
  );
}
