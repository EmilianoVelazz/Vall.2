import { Routes, Route, Navigate } from 'react-router-dom';
import LegacyPage from './components/LegacyPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Configuracion from './pages/Configuracion.jsx';
import Mexico from './pages/Mexico.jsx';

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
  { ruta: '/inicio',            html: '/inicio.html' },
  { ruta: '/finanzas',          html: '/pages/finanzas.html' },
  { ruta: '/mercados',          html: '/pages/mercados.html' },
  { ruta: '/geopolitica',       html: '/pages/geopolitica.html' },
  { ruta: '/mercado-proteinas', html: '/pages/mercadoproteinas.html' },
  { ruta: '/vall-ai',           html: '/pages/vall-ai.html' },
];

export default function App() {
  return (
    <Routes>
      {/* Migrada a React idiomático: ya no pasa por LegacyPage. */}
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Navigate to="/" replace />} />

      <Route
        path="/configuracion"
        element={<ProtectedRoute><Configuracion /></ProtectedRoute>}
      />
      <Route
        path="/mexico"
        element={<ProtectedRoute><Mexico /></ProtectedRoute>}
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
