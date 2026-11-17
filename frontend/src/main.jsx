import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import {precargarRuta} from './lib/routePrefetch.js';
import { AuthProvider } from './context/AuthContext.jsx';
import '../../assets/css/mobile-experience.css';

const mount=()=>createRoot(document.getElementById('root')).render(
  <BrowserRouter future={{ v7_startTransition: true }}>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);

// Keep the prerendered home visible until its interactive module is available.
if(window.location.pathname==='/') precargarRuta('/').then(mount,mount); else mount();
