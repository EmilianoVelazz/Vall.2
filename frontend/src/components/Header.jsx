import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const NAV = [
  { to: '/inicio', label: 'Inicio', icon: 'fa-house' },
  { to: '/finanzas', label: 'Finanzas' },
  { to: '/mercados', label: 'Mercados' },
  { to: '/geopolitica', label: 'Geopolítica' },
  { to: '/mercado-proteinas', label: 'Proteínas' },
  { to: '/mexico', label: 'México' },
];

const PRELOAD = {
  '/inicio': () => import('../pages/Inicio.jsx'),
  '/finanzas': () => import('../pages/Finanzas.jsx'),
  '/mercados': () => import('../pages/Mercados.jsx'),
  '/geopolitica': () => import('../pages/Geopolitica.jsx'),
  '/mercado-proteinas': () => import('../pages/MercadoProteinas.jsx'),
  '/mexico': () => import('../pages/Mexico.jsx'),
  '/configuracion': () => import('../pages/Configuracion.jsx'),
};

export default function Header() {
  const { user } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark'
  );
  const { pathname } = useLocation();

  useEffect(() => {
    if (dark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('vn_theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('vn_theme', 'light');
    }
  }, [dark]);

  useEffect(() => setNavOpen(false), [pathname]);

  const preload = (path) => PRELOAD[path]?.();

  return (
    <>
      <header className="header">
        <div className="hdr-top">
          <NavLink className="logo" to="/inicio" onPointerEnter={() => preload('/inicio')}>
            <div className="logo-icon"><img src="/Logotipos/logo2.png" alt="VALLNEWS Logo" /></div>
            <span className="logo-text">VALLNews</span>
          </NavLink>
          <span className="hdr-tagline">Inteligencia Global</span>
          <button
            className={`vn-hamburger${navOpen ? ' vn-ham-open' : ''}`}
            onClick={() => setNavOpen((o) => !o)}
            aria-label={navOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={navOpen}
          >
            <span></span><span></span><span></span>
          </button>
        </div>
        <nav className={`hdr-nav${navOpen ? ' vn-nav-open' : ''}`}>
          <div className="nav-center">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                to={n.to}
                onPointerEnter={() => preload(n.to)}
                onFocus={() => preload(n.to)}
              >
                {n.icon && <i className={`fas ${n.icon}`}></i>} {n.label}
              </NavLink>
            ))}
          </div>
          <div className="nav-actions">
            <button className="nav-btn" title="Cambiar Tema" onClick={() => setDark((d) => !d)}>
              <i className={dark ? 'fas fa-sun' : 'fas fa-moon'}></i>
            </button>
            {/* id=navMailbox: el widget legacy mailbox.js lo conecta al panel */}
            <button className="nav-btn" id="navMailbox" title="Buzón de Reportes">
              <i className="fas fa-bell"></i><span className="badge-dot"></span>
            </button>
            <NavLink className="nav-btn" id="navUser" to="/configuracion" onPointerEnter={() => preload('/configuracion')} title={user ? `${user} · Mi cuenta` : 'Mi cuenta'} style={{ cursor: 'pointer' }}>
              <i className="fas fa-circle-user"></i>
            </NavLink>
          </div>
        </nav>
      </header>
      <div className="hdr-divider"></div>
    </>
  );
}
