import { useEffect, useRef, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';

/*
 * Cabecera compartida por las páginas migradas.
 *
 * En los .html este bloque está copiado tal cual en cada archivo, así que un
 * cambio de navegación había que repetirlo siete veces. Aquí vive una sola vez.
 *
 * Usa <Link>/<NavLink> en lugar de <a href>: la navegación ocurre dentro de la
 * SPA, sin recargar el documento ni volver a descargar CSS y datos.
 */

/*
 * VALL AI va aquí como una sección más. En los .html no estaba en el marcado:
 * lo inyectaba page-loader.js en cada página buscando `.nav-center` y metiendo
 * un <a> a mano. Con una cabecera compartida eso sobra — la entrada se declara
 * una vez y NavLink ya resuelve cuál está activa.
 */
const SECCIONES = [
  { a: '/inicio', icono: 'fa-house', texto: 'Inicio' },
  { a: '/finanzas', icono: 'fa-chart-line', texto: 'Finanzas' },
  { a: '/mercados', icono: 'fa-globe', texto: 'Mercados' },
  { a: '/geopolitica', icono: 'fa-landmark', texto: 'Geopolítica' },
  { a: '/mercado-proteinas', icono: 'fa-leaf', texto: 'Proteínas' },
  { a: '/mexico', icono: 'fa-flag', texto: 'México' },
  { a: '/vall-ai', icono: 'fa-wand-magic-sparkles', texto: 'VALL AI' },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const navRef = useRef(null);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    if (menuOpen) requestAnimationFrame(() => navRef.current?.querySelector('a[href]')?.focus());

    const handleKeyDown = (event) => {
      if (!menuOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        requestAnimationFrame(() => menuButtonRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(navRef.current?.querySelectorAll('a[href], button:not([disabled])') || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleResize = () => {
      if (window.innerWidth > 768) setMenuOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="header">
      <div className="hdr-top">
        <Link className="logo" to="/inicio">
          <div className="logo-icon">
            <img src="/assets/img/logo1.png" alt="VALLNEWS Logo" />
          </div>
          <span className="logo-text">VALLNews</span>
        </Link>
        <span className="hdr-tagline">
          Datos en tiempo real &nbsp;&middot;&nbsp; Economía global &nbsp;&middot;&nbsp; Mercados
        </span>
        <button
          ref={menuButtonRef}
          className={`vn-hamburger${menuOpen ? ' vn-ham-open' : ''}`}
          type="button"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-controls="vn-react-primary-navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
      <nav
        ref={navRef}
        id="vn-react-primary-navigation"
        className={`hdr-nav${menuOpen ? ' vn-nav-open' : ''}`}
        aria-label="Navegación principal"
      >
        <div className="nav-center">
          {SECCIONES.map(({ a, icono, texto }) => (
            <NavLink
              key={a}
              to={a}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              onClick={closeMenu}
            >
              <i className={`fas ${icono}`} /> {texto}
            </NavLink>
          ))}
        </div>
        <Link to="/configuracion" className="nav-user" title="Configuración de cuenta">
          <i className="fas fa-user-circle" />
        </Link>
      </nav>
    </header>
  );
}
