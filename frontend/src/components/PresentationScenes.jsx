import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { animate, createScope } from 'animejs';
import { ProteinScene } from './PresentationShowcases.jsx';
import OrionScene from './OrionFlagship.jsx';
import useScrollScene from '../lib/useScrollScene.js';
import './PresentationScenes.css';

const INDICES = [
  { name: 'S&P 500', region: 'Estados Unidos', symbol: 'SPX', wave: 0 },
  { name: 'S&P/BMV IPC', region: 'México', symbol: 'IPC', wave: 1.2 },
  { name: 'Nikkei 225', region: 'Japón', symbol: 'N225', wave: 2.4 },
];
function SceneFooter({ next, label, caption }) {
  return <div className="sx-scene-footer"><span>{caption}</span>{next.startsWith('/') ? <Link to={next}>{label}</Link> : <a href={next}>{label} <span aria-hidden="true">↓</span></a>}<div className="sx-scene-progress" aria-label="Avance de la escena"><i /></div></div>;
}
function usePanelMotion(root, key, moving) {
  useEffect(() => {
    if (!moving) return undefined;
    const scope = createScope({ root }).add(() => {
      animate('[data-panel]', { opacity: [.4, 1], y: [8, 0], duration: 500, ease: 'out(3)' });
    });
    return () => scope.revert();
  }, [root, key, moving]);
}

function MarketScene({ moving, reducedMotion }) {
  const root = useRef(null);
  const [active, setActive] = useState(0);
  const [period, setPeriod] = useState(1);
  const [hover, setHover] = useState(23);
  const manual = useRef(false);
  const progress = useCallback((value, inView) => {
    if (!inView) { manual.current = false; return; }
    if (!manual.current && value > .12) setActive(Math.min(2, Math.floor(value * 3)));
  }, []);
  useScrollScene(root, moving, reducedMotion, progress);
  usePanelMotion(root, `${active}-${period}`, moving);
  const index = INDICES[active];
  const values = Array.from({ length: 32 }, (_, i) => 94 + i * .38 + Math.sin(i * (.5 + period * .06) + index.wave) * (2.4 + period) + Math.cos(i * .9) * 1.3);
  const yFor = value => 310 - (value - 89) * 12;
  const line = values.map((value, i) => `${i ? 'L' : 'M'}${48 + i * 18.5} ${yFor(value)}`).join(' ');
  const pointer = event => {
    const box = event.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(31, Math.round(((event.clientX - box.left) / box.width * 700 - 48) / 18.5))));
  };
  return <section ref={root} id="vp-bolsa" className={`sx-scene sx-market${reducedMotion ? ' sx-reduced' : ''}`} aria-labelledby="sx-market-title">
    <div className="sx-scene-viewport">
      <div className="sx-grid-bg" aria-hidden="true" />
      <div className="sx-scene-top"><span>VALLNews / FINANZAS</span><span>02 — EL PULSO DE LOS MERCADOS</span></div>
      <div className="sx-scene-layout">
        <div className="sx-scene-copy"><p className="sx-eyebrow">DEL MUNDO A SUS MOVIMIENTOS</p><h2 id="sx-market-title">El pulso global.<br /><span>En tus manos.</span></h2><p className="sx-lead">Bolsas, divisas, bonos y contexto económico. Descubre las conexiones detrás de cada gráfica.</p>
          <div className="sx-choice-group" aria-label="Elegir índice">{INDICES.map((item, i) => <button type="button" key={item.symbol} aria-pressed={i === active} onClick={() => { manual.current = true; setActive(i); }}>{item.name}</button>)}</div>
          <div className="sx-market-detail" data-panel><span className="sx-micro">PERSPECTIVA SELECCIONADA</span><h3>{index.region}</h3><p>Explora el panorama financiero y profundiza en sus indicadores dentro de VALLNews.</p></div>
          <Link className="sx-text-link" to="/login">Explorar Finanzas <span>↗</span></Link>
        </div>
        <div className="sx-visual sx-market-visual">
          <div className="sx-chart-header"><div><span className="sx-micro">{index.symbol} / VISTA ILUSTRATIVA</span><h3>{index.name}</h3></div><div className="sx-periods" aria-label="Periodo de la simulación">{['1D', '1S', '1M'].map((label, i) => <button key={label} type="button" aria-pressed={period === i} onClick={() => setPeriod(i)}>{label}</button>)}</div></div>
          <div className="sx-chart-readout" data-panel><strong>{values[hover].toFixed(2)}</strong><span>Índice base 100 <i /> Simulación</span></div>
          <svg className="sx-market-svg" viewBox="0 0 700 380" role="img" aria-label={`Gráfica interactiva ilustrativa de ${index.name}`} onPointerMove={pointer}>
            <defs><linearGradient id="sx-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#5899ef" stopOpacity=".24" /><stop offset="1" stopColor="#5899ef" stopOpacity="0" /></linearGradient></defs>
            {[90, 95, 100, 105, 110].map(v => <g key={v}><path d={`M40 ${yFor(v)}H635`} stroke="#94a3b8" strokeOpacity=".14" strokeDasharray="2 6" /><text x="655" y={yFor(v) + 4}>{v}</text></g>)}
            {[0, 1, 2, 3, 4, 5].map(v => <path key={v} d={`M${48 + v * 114} 36V324`} stroke="#94a3b8" strokeOpacity=".08" />)}
            <path d={`${line}L621.5 330H48Z`} fill="url(#sx-chart-fill)" />
            {values.map((v, i) => { const previous = values[Math.max(0, i - 1)] - .5; const y = yFor(Math.max(v, previous)); return <g key={i} className={`sx-candle${v >= previous ? ' up' : ''}`} style={{ transformOrigin: `${48 + i * 18.5}px 330px` }}><path d={`M${48 + i * 18.5} ${y - 10}V${yFor(Math.min(v, previous)) + 10}`} /><rect x={44 + i * 18.5} y={y} width="8" height={Math.max(5, Math.abs(v - previous) * 12)} rx="1" /></g>; })}
            <path className="sx-market-line" data-draw d={line} fill="none" stroke="#a1caff" strokeWidth="2" />
            <g className="sx-crosshair"><path d={`M${48 + hover * 18.5} 25V330M40 ${yFor(values[hover])}H635`} stroke="#c4dbff" strokeOpacity=".4" strokeDasharray="3 6" /><circle cx={48 + hover * 18.5} cy={yFor(values[hover])} r="5" fill="#111827" stroke="#c4dbff" strokeWidth="2" /></g>
            <text x="45" y="366">APERTURA</text><text x="310" y="366">SESIÓN</text><text x="574" y="366">CIERRE</text>
          </svg>
          <input className="sx-chart-slider" type="range" min="0" max="31" value={hover} aria-label="Explorar puntos de la gráfica" onChange={event => setHover(Number(event.target.value))} />
          <div className="sx-chart-bottom"><span>Mueve el cursor sobre la gráfica</span><span>Sin cotizaciones en tiempo real</span></div>
          <div className="sx-market-orbits" aria-hidden="true"><span data-float>BOLSAS GLOBALES ↗</span><span data-float>DIVISAS / BONOS</span></div>
        </div>
      </div>
      <SceneFooter next="#vp-proteinas" label="De las bolsas a la producción" caption="DESPLÁZATE PARA CONECTAR LOS MERCADOS" />
    </div>
  </section>;
}

export default function PresentationScenes(props) {
  return <><MarketScene {...props} /><ProteinScene {...props} /><OrionScene {...props} /></>;
}
