import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { injectGlobalStyles } from './lib/assets.js';
import './theme-premium.css';
import './premium-polish.css';

// base.css es común a todas las páginas → se inyecta una sola vez y persiste.
// theme-premium.css (importado arriba) redefine sus tokens con más especificidad.
injectGlobalStyles(['/css/base.css']);

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
