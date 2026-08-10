import { Routes, Route, Navigate } from 'react-router-dom';
import LegacyPage from './components/LegacyPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Configuracion from './pages/Configuracion.jsx';
import Mexico from './pages/Mexico.jsx';
import Inicio from './pages/Inicio.jsx';
import VallAi from './pages/VallAi.jsx';
import MercadoProteinas from './pages/MercadoProteinas.jsx';
import Geopolitica from './pages/Geopolitica.jsx';
import Mercados from './pages/Mercados.jsx';

/*
 * Fase 1 de la migración: React se queda con el enrutado, la sesión y el shell.
 * El contenido de cada sección lo sigue sirviendo su HTML actual, montado por
 * LegacyPage (patrón Strangler Fig).
 *
 * LegacyPage hace fetch del HTML EN TIEMPO DE EJECUCIÓN: no congela una copia.
 * Esa distinción es la que importa — el intento anterior incrustó el markup en
 * archivos .js y quedó obsoleto en tres semanas (~22.000 líneas de diferencia).
 * Aquí cualquier cambio en los .html aparece en React sin tocar nada.
 *
 * Migrar una sección a React idiomático más adelante consiste en sustituir su
 * entrada de esta tabla por un componente propio. El resto sigue funcionando.
 */
const SECCIONES = [
  { ruta: '/finanzas',          html: '/pages/finanzas.html' },
];

export default function App() {
  return (
    <Routes>
      {/* Migrada a React idiomático: ya no pasa por LegacyPage. */}
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Navigate to="/" replace />} />

      <Route
        path="/inicio"
        element={<ProtectedRoute><Inicio /></ProtectedRoute>}
      />
      <Route
        path="/configuracion"
        element={<ProtectedRoute><Configuracion /></ProtectedRoute>}
      />
      <Route
        path="/mexico"
        element={<ProtectedRoute><Mexico /></ProtectedRoute>}
      />
      <Route
        path="/vall-ai"
        element={<ProtectedRoute><VallAi /></ProtectedRoute>}
      />
      <Route
        path="/mercado-proteinas"
        element={<ProtectedRoute><MercadoProteinas /></ProtectedRoute>}
      />
      <Route
        path="/geopolitica"
        element={<ProtectedRoute><Geopolitica /></ProtectedRoute>}
      />
      <Route
        path="/mercados"
        element={<ProtectedRoute><Mercados /></ProtectedRoute>}
      />

      {SECCIONES.map(({ ruta, html }) => (
        <Route
          key={ruta}
          path={ruta}
          element={
            <ProtectedRoute>
              <LegacyPage src={html} />
            </ProtectedRoute>
          }
        />
      ))}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
