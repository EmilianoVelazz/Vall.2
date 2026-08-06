import { Link } from 'react-router-dom';

/*
 * Pie compartido. En los .html el año está escrito a mano ("© 2025") y ya
 * quedó desfasado; aquí se calcula, así que no vuelve a envejecer.
 */
export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-logo">
        <div className="footer-icon">
          <img src="/assets/img/logo1.png" alt="VALLNEWS" />
        </div>
        <span className="footer-brand">VALLNews</span>
      </div>
      <nav className="footer-nav">
        <Link to="/inicio">Inicio</Link>
        <Link to="/finanzas">Finanzas</Link>
        <Link to="/mercados">Mercados</Link>
        <Link to="/geopolitica">Geopolítica</Link>
      </nav>
      <p className="footer-copy">
        © {new Date().getFullYear()} VALLNews · Inteligencia económica
      </p>
    </footer>
  );
}
