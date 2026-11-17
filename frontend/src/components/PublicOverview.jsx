import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { animate, createScope, stagger } from 'animejs';
import site from '../../../shared/public-site.json';
import PerspectiveIcon from './PublicIcon.jsx';
import useViewportVisibility from '../lib/useViewportVisibility.js';
import './PublicOverview.css';

const perspectives = [
  { route: '/soluciones/informes', name: 'Informes', detail: 'Del dato a una lectura ejecutiva.', signal: 'Una lectura que conecta.', icon: 'report', x: 240, y: 42, labelX: 240, labelY: 20 },
  { route: '/soluciones/finanzas', name: 'Finanzas', detail: 'Bolsas, divisas y bonos con contexto.', signal: 'El pulso de los mercados.', icon: 'finance', x: 420, y: 130, labelX: 420, labelY: 104 },
  { route: '/soluciones/mercados', name: 'Mercados', detail: 'Producción, comercio y precios de referencia.', signal: 'Del origen al mercado.', icon: 'markets', x: 352, y: 294, labelX: 352, labelY: 327 },
  { route: '/soluciones/mexico', name: 'México', detail: 'La mirada local del panorama global.', signal: 'México, conectado al mundo.', icon: 'mexico', x: 128, y: 294, labelX: 128, labelY: 327 },
  { route: '/soluciones/orion', name: 'ORION', detail: 'Investiga, relaciona y prepara tus ideas.', signal: 'Tu próxima pregunta empieza aquí.', icon: 'orion', x: 60, y: 130, labelX: 60, labelY: 104 },
];

export default function PublicOverview({ moving = true, children }) {
  const root = useRef(null);
  const revealed = useRef(false);
  const lastInteraction = useRef(0);
  const inView = useViewportVisibility(root);
  const [pageVisible, setPageVisible] = useState(true);
  const [active, setActive] = useState(0);
  const animating = moving && inView && pageVisible;

  useEffect(() => {
    const visibility = () => setPageVisible(!document.hidden);
    visibility();
    document.addEventListener('visibilitychange', visibility);
    // Wait until the router has reset the page before resolving a direct link.
    const anchorFrame = window.location.hash === '#conoce-vallnews' ? window.requestAnimationFrame(() => root.current?.scrollIntoView({ block: 'start', behavior: 'instant' })) : 0;
    return () => { window.cancelAnimationFrame(anchorFrame); document.removeEventListener('visibilitychange', visibility); };
  }, []);

  useEffect(() => {
    if (!animating) return undefined;
    const timer = window.setInterval(() => {
      // Scroll can change the element under a stationary pointer without a new
      // React pointer event. Check the actual hover/focus before advancing.
      if (!root.current || root.current.querySelector('.public-grid:hover, .public-grid:focus-within') || Date.now() - lastInteraction.current < 4800) return;
      setActive(value => (value + 1) % perspectives.length);
    }, 4800);
    return () => window.clearInterval(timer);
  }, [animating]);

  useEffect(() => {
    if (!animating || revealed.current) return undefined;
    revealed.current = true;
    const scope = createScope({ root: root.current }).add(() => {
      animate('[data-overview-reveal]', { opacity: [.25, 1], y: [22, 0], duration: 850, delay: stagger(75), ease: 'out(4)' });
    });
    return () => scope.revert();
  }, [animating]);

  const explore = index => { lastInteraction.current = Date.now(); setActive(index); };
  return <section ref={root} id="conoce-vallnews" className="public-overview" aria-labelledby="public-overview-title" data-motion={animating ? 'true' : 'false'}>
    <div className="public-overview-glow" aria-hidden="true" />
    <div className="public-width">
      <div className="public-overview-kicker" data-overview-reveal><p className="public-eyebrow"><i aria-hidden="true" /> CONOCE VALLNEWS</p><span>UNA PERSPECTIVA. MUCHAS CONEXIONES.</span></div>
      <div className="public-overview-hero">
        <div className="public-overview-copy" data-overview-reveal>
          <h2 id="public-overview-title">{site.pages['/'].heading}</h2>
          <p className="public-lead">Conecta las finanzas, los mercados productivos y la investigación. Encuentra el contexto detrás de cada movimiento.</p>
          <a className="public-overview-explore" href="#vallnews-soluciones">Encuentra tu perspectiva <span aria-hidden="true">↓</span></a>
        </div>
        <div className="public-overview-visual" aria-hidden="true" data-overview-reveal>
          <svg className="public-connection-map" viewBox="0 0 480 360" fill="none">
            <circle className="public-map-orbit" cx="240" cy="180" r="108" stroke="currentColor" strokeDasharray="2 9" />
            <circle cx="240" cy="180" r="72" stroke="currentColor" opacity=".15" />
            {perspectives.map((item, i) => <g key={item.route} className="public-map-branch" data-active={i === active ? 'true' : 'false'}>
              <path className="public-map-track" d={`M240 180 Q${240 + (item.x - 240) * .2} ${item.y} ${item.x} ${item.y}`} />
              <path className="public-map-flow" d={`M240 180 Q${240 + (item.x - 240) * .2} ${item.y} ${item.x} ${item.y}`} />
              <circle className="public-map-node-ring" cx={item.x} cy={item.y} r="13" />
              <circle className="public-map-node" cx={item.x} cy={item.y} r="4" />
              <text x={item.labelX} y={item.labelY} textAnchor="middle">{item.name}</text>
            </g>)}
          </svg>
          <div className="public-map-brand"><span>VALL<span>News</span></span><small>EL CONTEXTO NOS CONECTA</small></div>
          <div className="public-map-caption"><span>{String(active + 1).padStart(2, '0')} / 05 · {perspectives[active].name}</span><strong>{perspectives[active].signal}</strong></div>
        </div>
      </div>
      <div id="vallnews-soluciones" className="public-grid">
        {perspectives.map((item, i) => <Link className="public-card" key={item.route} to={item.route} data-active={i === active ? 'true' : 'false'} onPointerEnter={() => explore(i)} onFocus={() => explore(i)} data-overview-reveal>
          <div className="public-card-top"><PerspectiveIcon kind={item.icon} /><small>{String(i + 1).padStart(2, '0')}</small></div>
          <h3>{site.pages[item.route].label}</h3><p>{item.detail}</p><span className="public-card-action">Explorar <span aria-hidden="true">↗</span></span>
        </Link>)}
      </div>
      <div className="public-overview-links">{children}</div>
    </div>
  </section>;
}
