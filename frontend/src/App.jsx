import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLoading from './components/AppLoading.jsx';
import { useAuth } from './context/AuthContext.jsx';

const Inicio = lazy(() => import('./pages/Inicio.jsx'));
const Configuracion = lazy(() => import('./pages/Configuracion.jsx'));
const MercadoProteinas = lazy(() => import('./pages/MercadoProteinas.jsx'));
const Mexico = lazy(() => import('./pages/Mexico.jsx'));
const Geopolitica = lazy(() => import('./pages/Geopolitica.jsx'));
const Mercados = lazy(() => import('./pages/Mercados.jsx'));
const Finanzas = lazy(() => import('./pages/Finanzas.jsx'));

const SPA_PATHS = new Set(['/inicio', '/configuracion', '/mercado-proteinas', '/mexico', '/geopolitica', '/mercados', '/finanzas']);
const PAGE_TITLES = {
  '/inicio': 'Inicio', '/configuracion': 'Configuración', '/mercado-proteinas': 'Mercado de Proteínas',
  '/mexico': 'México', '/geopolitica': 'Geopolítica', '/mercados': 'Mercados', '/finanzas': 'Finanzas',
};

function NavigationExperience() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.title = `${PAGE_TITLES[pathname] || 'Acceso'} · VALLNews`;
  }, [pathname]);

  useEffect(() => {
    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || !SPA_PATHS.has(url.pathname)) return;
      event.preventDefault();
      navigate(url.pathname + url.search + url.hash);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [navigate]);

  return null;
}

export default function App() {
  const { checking } = useAuth();
  if (checking) return <AppLoading label="Verificando sesión…" />;

  return (
    <Suspense fallback={<AppLoading label="Cargando sección…" />}>
      <NavigationExperience />
      <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/inicio"
        element={
          <ProtectedRoute>
            <Inicio />
          </ProtectedRoute>
        }
      />
      <Route
        path="/configuracion"
        element={
          <ProtectedRoute>
            <Configuracion />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mercado-proteinas"
        element={
          <ProtectedRoute>
            <MercadoProteinas />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mexico"
        element={
          <ProtectedRoute>
            <Mexico />
          </ProtectedRoute>
        }
      />
      <Route
        path="/geopolitica"
        element={
          <ProtectedRoute>
            <Geopolitica />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mercados"
        element={
          <ProtectedRoute>
            <Mercados />
          </ProtectedRoute>
        }
      />
      <Route
        path="/finanzas"
        element={
          <ProtectedRoute>
            <Finanzas />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
