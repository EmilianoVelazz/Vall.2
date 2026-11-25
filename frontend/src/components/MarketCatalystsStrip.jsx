import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const FILTROS = [
  { id: 'all', label: 'Todos' },
  { id: 'macro', label: 'Macro MX/US' },
  { id: 'agro', label: 'Granos & Agro' },
  { id: 'proteinas', label: 'Proteínas' },
];

function formatDateEs(iso) {
  if (!iso) return '—';
  const dt = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(dt.getTime())) return iso;
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(dt);
}

export default function MarketCatalystsStrip() {
  const [data, setData] = useState(null);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/market-catalysts?days=45&limit=12', { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!ctrl.signal.aborted && json?.available) setData(json);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  if (!data?.events?.length) return null;

  const visible = data.events
    .filter((ev) => category === 'all' || ev.category === category)
    .slice(0, 6);

  return (
    <section id="ih-catalysts" className="ih-catalysts-section" data-ih-reveal aria-labelledby="ih-catalysts-title">
      <div className="ih-section-heading">
        <div>
          <span className="ih-eyebrow">Agenda que mueve precios</span>
          <h2 id="ih-catalysts-title">Próximos catalizadores de mercado.</h2>
          <p>Fechas clave de Banxico, Fed, INEGI y USDA que impactan dólar, tasas, ración y proteínas.</p>
        </div>
        <div className="ih-tabs" role="group" aria-label="Filtrar catalizadores">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={category === f.id}
              onClick={() => setCategory(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ih-catalysts-grid">
        {visible.map((ev) => (
          <article key={ev.id} className={`ih-cat-card${ev.daysUntil <= 5 ? ' soon' : ''}`}>
            <div className="ih-cat-top">
              <span className="ih-cat-inst">{ev.institution}</span>
              <div className="ih-cat-badges">
                <span className={`ih-cat-impact ${ev.impact === 'ALTO' ? 'high' : 'med'}`}>{ev.impact}</span>
                <span className="ih-cat-count">{ev.countdownLabel}</span>
              </div>
            </div>
            <h3>{ev.title}</h3>
            <div className="ih-cat-date">
              <i className="fa-regular fa-calendar" aria-hidden="true" /> {formatDateEs(ev.date)} · {ev.timeCdmx}
            </div>
            <p>{ev.whyItMatters}</p>
            <div className="ih-cat-assets">
              {(ev.assets || []).slice(0, 4).map((asset) => (
                <span key={asset}>{asset}</span>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="ih-catalysts-foot">
        <small>{data.disclaimer}</small>
        <Link to="/orion" className="ih-text-link">
          Preparar escenario en ORION <i className="fa-solid fa-arrow-right" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
