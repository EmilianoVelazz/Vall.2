import { useEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';
import './ModuleEntryCards.css';
const moneda = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Presentación compartida; cada página conserva sus destinos y sus datos. */
export default function ModuleEntryCards({ modulos, cotizaciones, onOpen, label, className = '' }) {
  const root = useRef(null);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let entrada;
    if (!reduced.matches) {
      entrada = animate(root.current.querySelectorAll('.mmc-content'), {
        opacity: [.65, 1], y: [10, 0], delay: stagger(80), duration: 500, ease: 'out(3)',
      });
    }
    const motionChange = () => { if (reduced.matches) entrada?.revert(); };
    reduced.addEventListener('change', motionChange);
    return () => { entrada?.revert(); reduced.removeEventListener('change', motionChange); };
  }, []);

  return (
    <section ref={root} className={`module-entry-cards ${className}`} data-module-count={modulos.length} style={{ '--module-columns': modulos.length }} aria-label={label}>
      {modulos.map((modulo, index) => {
        const quote = cotizaciones[modulo.id];
        const disponible = quote.precio != null && quote.precio !== '' && Number.isFinite(Number(quote.precio));
        return (
          <article key={modulo.id} className={`mmc-card ${modulo.clase || ''}`} aria-labelledby={`mmc-title-${modulo.id}`}>
            <img className="mmc-photo" src={modulo.foto} alt="" width="1000" height="665" decoding="async" draggable="false" />
            <div className="mmc-content">
              <div className="mmc-topline"><span>{modulo.categoria}</span><span className="mmc-number" aria-hidden="true">0{index + 1} / {String(modulos.length).padStart(2, '0')}</span></div>
              <header className="mmc-heading">
                <span className="mmc-icon" aria-hidden="true"><i className={`fas ${modulo.icono}`} /></span>
                <h2 id={`mmc-title-${modulo.id}`}>{modulo.titulo.replace('Mercado de ', '')}</h2>
                <p>{modulo.sub}</p>
              </header>
              <p className="mmc-description">{modulo.intro}</p>
              <div className="mmc-reference">
                <div className="mmc-reference-head"><span>{quote.etiqueta}</span><span>{modulo.badge}</span></div>
                <div className={`mmc-quote-row${quote.grafica ? '' : ' is-text-only'}`}>
                  <div><strong className="mmc-price">{quote.valor ?? (disponible ? `$${moneda.format(Number(quote.precio))}` : '—')}</strong><small className="mmc-unit">{quote.unidad}</small></div>
                  {quote.grafica && <div className="mmc-history">{quote.grafica}<small>Historial disponible</small></div>}
                </div>
                <span className={`mmc-status ${quote.verificado ? 'is-verified' : ''}`}>{quote.estado}</span>
              </div>
              <button type="button" className="mmc-link" onClick={() => onOpen(modulo.id)}>
                <span>{modulo.cta}</span><span className="mmc-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
