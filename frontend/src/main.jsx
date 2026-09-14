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
 * Cada sección declara las hojas que necesita y usePageStyles las inyecta al
 * montar y las retira al salir, para que el CSS de una no se filtre a la
 * siguiente. Así el aspecto es el mismo que tenía el sitio en HTML, sin una capa
 * de tema por encima que lo altere.
 */

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
