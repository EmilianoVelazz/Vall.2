import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';

/*
 * Aquí no se importa ningún CSS global, a propósito.
 *
 * La versión anterior cargaba theme-premium.css y premium-polish.css, que
 * redefinían los tokens de color del sitio, y además inyectaba /css/base.css,
 * ruta que en este árbol ya no existe (ahora es /assets/css/base.css).
 *
 * Cada sección trae sus propias hojas: LegacyPage lee los <link> del <head> del
 * HTML original y los inyecta al montar. Así el CSS que se aplica es exactamente
 * el mismo que hoy, sin una capa de tema por encima que cambie el aspecto.
 */

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
