import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { animate } from 'animejs';
import useScrollScene from '../lib/useScrollScene.js';
import { useAnimatedContent, useShowcasePointer } from '../lib/useShowcaseInteraction.js';
import { CUTS, PIG_OUTLINE } from '../lib/presentationShowcaseData.js';
import './PresentationShowcases.css';

function Footer({ orion = false }) {
  return <div className="sx-scene-footer"><span>{orion ? 'UNA PREGUNTA PUEDE CAMBIAR TU PERSPECTIVA.' : 'DEL ORIGEN A UNA PERSPECTIVA GLOBAL.'}</span>{orion ? <Link to="/login">Entrar a VALLNews ↗</Link> : <a href="#vp-orion">Descubrir ORION <span aria-hidden="true">↓</span></a>}<div className="sx-scene-progress" aria-label="Avance de la escena"><i /></div></div>;
}

export function ProteinScene({ moving, reducedMotion }) {
  const root = useRef(null);
  const manual = useRef(false);
  const [selected, setSelected] = useState(0);
  const { panel, displayed } = useAnimatedContent(selected, moving);
  const cut = CUTS[selected];
  const shownCut = CUTS[displayed];
  const progress = useCallback((value, inView) => {
    if (!inView) { manual.current = false; return; }
    if (!manual.current) setSelected(Math.min(4, Math.floor(value * 5)));
  }, []);
  useScrollScene(root, moving, reducedMotion, progress);
  useShowcasePointer(root, moving);
  useEffect(() => {
    const parts = [...root.current.querySelectorAll('.px-pig-part')];
    const line = root.current.querySelector('.px-cut-leader');
    if (!moving) { parts.forEach(node => node.style.removeProperty('transform')); line.style.removeProperty('stroke-dashoffset'); return undefined; }
    const tween = animate(parts, { x: (_, i) => i === selected ? cut.offset[0] : 0, y: (_, i) => i === selected ? cut.offset[1] : 0, duration: 900, ease: 'out(4)' });
    const draw = animate(line, { strokeDashoffset: [1, 0], duration: 800, ease: 'inOut(3)' });
    return () => { tween.cancel(); draw.cancel(); };
  }, [selected, cut, moving]);
  const choose = i => { manual.current = true; setSelected(i); };
  return <section ref={root} id="vp-proteinas" className={`sx-scene sx-protein px-protein${reducedMotion ? ' sx-reduced' : ''}`} aria-labelledby="sx-protein-title">
    <div className="sx-scene-viewport">
      <div className="px-protein-light" aria-hidden="true" />
      <div className="sx-scene-top"><span>VALLNews / PROTEÍNAS</span><span>03 — LA PERSPECTIVA DEL ORIGEN</span></div>
      <div className="px-layout">
        <div className="px-copy" data-scene-copy><p className="px-eyebrow">PRODUCCIÓN. COMERCIO. CONTEXTO.</p><h2 id="sx-protein-title">Del origen<br /><span>al mercado.</span></h2><p className="px-lead">Una mirada más cercana a la proteína porcina. Elige un corte y descubre su lugar en el panorama.</p>
          <div className="px-cut-list" aria-label="Elegir corte porcino">{CUTS.map((item, i) => <button type="button" key={item.en} onClick={() => choose(i)} aria-pressed={i === selected}><span>0{i + 1}</span><strong>{item.name}</strong><i aria-hidden="true">↗</i></button>)}</div>
          <Link className="px-link" to="/login">Explorar el mercado de proteínas <span>↗</span></Link>
        </div>
        <div className="sx-visual px-protein-visual">
          <div className="px-art-label"><span>PORCINO / EXPLORACIÓN INTERACTIVA</span><span>0{selected + 1} <i>/ 05</i></span></div>
          <div className="px-pig-surface" data-pointer-surface><div data-pointer-layer>
            <svg className="px-pig-svg" viewBox="0 0 710 425" aria-label="Diagrama interactivo de los cortes del cerdo">
              <defs>
                <clipPath id="px-pig-clip"><path d={PIG_OUTLINE} /></clipPath>
                <linearGradient id="px-pig-body" x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#526c8c" /><stop offset=".45" stopColor="#273c55" /><stop offset="1" stopColor="#162337" /></linearGradient>
                <linearGradient id="px-cut-active" x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#d4e6fc" /><stop offset=".5" stopColor="#89b2e1" /><stop offset="1" stopColor="#476f9e" /></linearGradient>
                <linearGradient id="px-cut-rest" x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#4a6482" /><stop offset=".4" stopColor="#314963" /><stop offset="1" stopColor="#1f3047" /></linearGradient>
                <radialGradient id="px-ground"><stop stopColor="#000" stopOpacity=".6" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
              </defs>
              <ellipse cx="348" cy="373" rx="290" ry="32" fill="url(#px-ground)" />
              <ellipse cx="348" cy="369" rx="304" ry="34" fill="none" stroke="#5f7c9f" strokeOpacity=".2" />
              <path d={PIG_OUTLINE} fill="url(#px-pig-body)" stroke="#a5bdd9" strokeOpacity=".55" strokeWidth="1.2" />
              {CUTS.map((item, i) => <g key={item.en} className={`px-pig-part${selected === i ? ' selected' : ''}`} role="button" tabIndex="0" aria-label={`Explorar ${item.name}`} aria-pressed={i === selected} onClick={() => choose(i)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(i); } }}><path d={item.path} clipPath="url(#px-pig-clip)" /><text x={item.x} y={item.y} textAnchor="middle">0{i + 1}</text></g>)}
              <path d="M620 155q44-33 49-8t-21 12q-7-8 8-14M125 113l20 45-32-4M59 199l3 38M177 334h22M306 334h24M547 334h25" fill="none" stroke="#bdd0e6" strokeOpacity=".6" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="99" cy="186" r="3.5" fill="#d8e7f6" /><ellipse cx="36" cy="221" rx="2.5" ry="4" fill="#a6bdd6" />
              <path className="px-cut-leader" pathLength="1" strokeDasharray="1" d={`M${cut.x} ${cut.y - 25}V65Q${cut.x} 55 ${cut.x + 12} 55H610`} fill="none" stroke="#a1c7f7" strokeWidth=".8" />
              <circle cx={cut.x} cy={cut.y - 25} r="3" fill="#dbeafe" /><text className="px-cut-label" x="610" y="43" textAnchor="end">{cut.name.toUpperCase()}</text>
            </svg>
          </div></div>
          <div className="px-cut-caption" ref={panel} aria-live="polite"><div><span className="px-small">{shownCut.zone} / {shownCut.en}</span><h3>{shownCut.name}</h3><span className="px-products">{shownCut.products}</span></div><p>{shownCut.detail}</p></div>
          <p className="px-reference">Esquema ilustrativo. <a href="https://usmef.net/cortes-de-cerdo-consumidores/" target="_blank" rel="noreferrer">Nomenclatura USMEF ↗</a></p>
        </div>
      </div><Footer />
    </div>
  </section>;
}
