import { ANIO, ANIOS_ESTIMADOS, FUENTE, mundoDe } from '../lib/proteinas-mapa.js';

const SPECIES = [
  ['cerdo', 'Cerdo', 'fa-piggy-bank'],
  ['pollo', 'Pollo', 'fa-drumstick-bite'],
  ['res', 'Res', 'fa-cow'],
  ['huevo', 'Huevo', 'fa-egg'],
];

export default function ProteinGlobalOverview() {
  const world = mundoDe(Number(ANIO));
  return (
    <section className="mp-panel" aria-labelledby="protein-global-title" style={{ marginBottom: '1rem' }}>
      <div className="mp-section-lbl" id="protein-global-title">Panorama global de proteínas</div>
      <p style={{ margin: '0 0 .8rem', color: '#526474', fontSize: '.82rem', lineHeight: 1.45 }}>
        Producción mundial medida en <b>{ANIO}</b>, millones de toneladas. No es una cotización ni un pronóstico.
      </p>
      <div className="mp-stat-grid">
        {SPECIES.map(([id, label, icon]) => (
          <div className="mp-stat-box" key={id}>
            <div className="mp-stat-lbl"><i className={`fas ${icon}`} aria-hidden="true" /> {label}</div>
            <div className="mp-stat-val">{Number(world.prod?.[id]).toFixed(1)}</div>
            <div className="mp-stat-note">Mt producidas</div>
          </div>
        ))}
      </div>
      <p className="mp-consume-para" style={{ marginBottom: 0 }}>
        Fuente: {FUENTE}. Los años {ANIOS_ESTIMADOS.join(' y ')} son estimaciones y se muestran por separado en el mapa de Mercados.
      </p>
    </section>
  );
}
