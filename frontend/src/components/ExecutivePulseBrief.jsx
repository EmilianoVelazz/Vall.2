import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function ExecutivePulseBrief() {
  const [pulse, setPulse] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/executive-pulse', { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!ctrl.signal.aborted && json?.available) setPulse(json);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  if (!pulse?.available) return null;

  const { opportunity, risk, nextCatalyst, keyMoves = [] } = pulse;

  return (
    <section className="ih-pulse-section" data-ih-reveal aria-labelledby="ih-pulse-title">
      <div className="ih-pulse-head">
        <div>
          <span className="ih-eyebrow">Briefing ejecutivo · 1 minuto</span>
          <h2 id="ih-pulse-title">Lo que importa decidir hoy.</h2>
        </div>
        <Link to="/orion" className="ih-text-link">
          Profundizar en ORION <i className="fa-solid fa-arrow-right" aria-hidden="true" />
        </Link>
      </div>

      <div className="ih-pulse-grid">
        {opportunity && (
          <article className="ih-pulse-card opp">
            <div className="ih-pulse-card-top">
              <span className="ih-pulse-tag opp">Oportunidad #1</span>
              <span className="ih-pulse-metric">{opportunity.metric}</span>
            </div>
            <h3>{opportunity.icon} {opportunity.label} · {opportunity.stance}</h3>
            <p>{opportunity.detail}</p>
            <Link to="/mercado-proteinas" className="ih-pulse-link">
              Ver margen y paridad <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </Link>
          </article>
        )}

        {risk && (
          <article className="ih-pulse-card risk">
            <div className="ih-pulse-card-top">
              <span className="ih-pulse-tag risk">Riesgo activo #1</span>
              <span className="ih-pulse-metric">{risk.riskLevel} · {risk.riskScore}/100</span>
            </div>
            <h3>{risk.title}</h3>
            <p>
              Sesgo <b>{risk.bias}</b> en {risk.species} ({risk.eventCount} noticias recientes).
              {risk.headline ? ` "${risk.headline}"` : ''}
            </p>
            <Link to="/mercado-proteinas" className="ih-pulse-link">
              Abrir radar sanitario <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </Link>
          </article>
        )}

        {nextCatalyst && (
          <article className="ih-pulse-card cat">
            <div className="ih-pulse-card-top">
              <span className="ih-pulse-tag cat">Próximo catalizador</span>
              <span className="ih-pulse-metric">{nextCatalyst.countdownLabel}</span>
            </div>
            <h3>{nextCatalyst.institution} · {nextCatalyst.title}</h3>
            <p>{nextCatalyst.date} ({nextCatalyst.timeCdmx}) — {nextCatalyst.whyItMatters}</p>
            <a href="#ih-catalysts" className="ih-pulse-link">
              Ver agenda completa <i className="fa-solid fa-arrow-down" aria-hidden="true" />
            </a>
          </article>
        )}
      </div>

      {keyMoves.length > 0 && (
        <div className="ih-pulse-moves" aria-label="Tres señales clave del día">
          {keyMoves.map((m) => (
            <div key={m.id} className="ih-pulse-move">
              <strong>{m.tag}</strong>
              <span>{m.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
