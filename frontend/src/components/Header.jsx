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

const SECCIONES = [
  { a: '/inicio', icono: 'fa-house', texto: 'Inicio' },
  { a: '/finanzas', icono: 'fa-chart-line', texto: 'Finanzas' },
  { a: '/mercados', icono: 'fa-globe', texto: 'Mercados' },
  { a: '/geopolitica', icono: 'fa-landmark', texto: 'Geopolítica' },
  { a: '/mercado-proteinas', icono: 'fa-leaf', texto: 'Proteínas' },
  { a: '/mexico', icono: 'fa-flag', texto: 'México' },
];

export default function Header() {
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
      </div>
      <nav className="hdr-nav">
        <div className="nav-center">
          {SECCIONES.map(({ a, icono, texto }) => (
            <NavLink
              key={a}
              to={a}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
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
