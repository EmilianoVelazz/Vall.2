import './Footer.css';
import { Link } from 'react-router-dom';

const NAV = [
  ['/inicio', 'Inicio'],
  ['/finanzas', 'Finanzas'],
  ['/mercados', 'Mercados'],
  ['/geopolitica', 'Geopolítica'],
  ['/mercado-proteinas', 'Proteínas'],
  ['/mexico', 'México'],
];

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="vn-footer">
      <div className="vn-footer-inner">
        <div className="vn-footer-brand">
          <img src="/Logotipos/logo1.png" alt="VALLNews" />
          <div className="vn-footer-brand-txt">
            <span className="vn-footer-name">VALL<i>News</i></span>
            <span className="vn-footer-tag">Inteligencia Económica Global</span>
          </div>
        </div>

        <nav className="vn-footer-nav">
          {NAV.map(([to, label]) => (
            <Link key={to} to={to}>{label}</Link>
          ))}
        </nav>

        <div className="vn-footer-meta">
          <span className="vn-footer-status"><span className="vn-footer-dot"></span> Datos en tiempo real</span>
          <span className="vn-footer-copy">© {year} VALLNews · Todos los derechos reservados</span>
        </div>
      </div>
    </footer>
  );
}
