import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { iniciarTema } from './lib/tema.js';
import Login from './pages/Login.jsx';
import Configuracion from './pages/Configuracion.jsx';
import Mexico from './pages/Mexico.jsx';
import Inicio from './pages/Inicio.jsx';
import VallAi from './pages/VallAi.jsx';
import MercadoProteinas from './pages/MercadoProteinas.jsx';
import Geopolitica from './pages/Geopolitica.jsx';
import Mercados from './pages/Mercados.jsx';
import Finanzas from './pages/Finanzas.jsx';

/*
 * Migración terminada: las nueve rutas son componentes de React.
 *
 * Ya no queda LegacyPage ni la tabla SECCIONES que montaba los .html en tiempo
 * de ejecución. Finanzas fue la última en salir; con ella se fueron también los
 * archivos de pages/, para que no vuelva a haber dos copias del mismo marcado
 * separándose sin que nadie lo note — que es como fracasó el primer intento.
 */
/* Las ocho rutas con sesión. En tabla y no ocho bloques calcados: así añadir
   una sección es una línea, y no hay forma de que a una se le olvide el
   ProtectedRoute — que es el fallo silencioso que importa aquí. */
const PROTEGIDAS = [
  ['/inicio', Inicio],
  ['/finanzas', Finanzas],
  ['/mercados', Mercados],
  ['/geopolitica', Geopolitica],
  ['/mercado-proteinas', MercadoProteinas],
  ['/mexico', Mexico],
  ['/vall-ai', VallAi],
  ['/configuracion', Configuracion],
];

export default function App() {
  /* Aquí y no en cada página: la hoja del tema tiene que estar en el <head>
     valga cual valga la ruta, y añadida al final para ganarle a los !important
     de las hojas heredadas. Ver lib/tema.js. */
  useEffect(() => { iniciarTema(); }, []);

  return (
    <>
      <Routes>
        {/* Login es la única pública; el resto exige sesión. */}
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Navigate to="/" replace />} />

        {PROTEGIDAS.map(([ruta, Pagina]) => (
          <Route
            key={ruta}
            path={ruta}
            element={<ProtectedRoute><Pagina /></ProtectedRoute>}
          />
        ))}

        {/* Cualquier otra cosa vuelve al login, que ya redirige a /inicio si
            hay sesión válida. Cubre también las URLs .html antiguas. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
