import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { animate, stagger, svg } from 'animejs';
import ConstelacionOrion from './ConstelacionOrion.jsx';
import useScrollScene from '../lib/useScrollScene.js';
import { useAnimatedContent, useShowcasePointer } from '../lib/useShowcaseInteraction.js';
import { MODELS, EXAMPLES } from '../lib/presentationShowcaseData.js';
import './OrionFlagship.css';

// Stable, lightweight stars keep the illustration independent of network data.
const STARS = Array.from({ length: 65 }, (_, i) => ({
  x: (i * 179 + 31) % 1440, y: (i * 137 + 53) % 900,
  r: i % 11 === 0 ? 1.5 : .65, opacity: .12 + (i % 5) * .09,
}));
// Keep mouse focus from scrolling the sticky presentation during selection.
const keepScrollPosition = event => event.preventDefault();

function useConstellationEntrance(root, moving) {
  useEffect(() => {
    if (!moving) return undefined;
    const paths = root.current.querySelectorAll('.vai-orion-lines path');
    let entered = false;
    let drawing;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || entered) return;
      entered = true;
      drawing = animate(svg.createDrawable(paths, 0, 1), {
        draw: ['0 0', '0 1'], duration: 1900, delay: stagger(130), ease: 'inOut(3)',
      });
      observer.disconnect();
    }, { threshold: .4 });
    observer.observe(root.current.querySelector('.of-visual'));
    return () => {
      observer.disconnect();
      drawing?.revert();
      paths.forEach(path => ['draw', 'pathLength', 'stroke-dasharray', 'stroke-dashoffset'].forEach(attribute => path.removeAttribute(attribute)));
    };
  }, [root, moving]);
}

export default function OrionFlagship({ moving, reducedMotion }) {
  const root = useRef(null);
  const manual = useRef(false);
  const [phase, setPhase] = useState(0);
  const [model, setModel] = useState(0);
  const [example, setExample] = useState(0);
  const modelCopy = useAnimatedContent(model, moving);
  const demoCopy = useAnimatedContent(example, moving);
  const progress = useCallback((value, inView) => {
    if (!inView) { manual.current = false; return; }
    setPhase(value >= .305 ? 1 : 0);
    if (!manual.current && value >= .5) setExample(Math.min(2, Math.floor((value - .5) * 6)));
  }, []);
  useScrollScene(root, moving, reducedMotion, progress);
  useShowcasePointer(root, moving);
  useConstellationEntrance(root, moving);
  const currentModel = MODELS[modelCopy.displayed];
  const sample = EXAMPLES[demoCopy.displayed];
  const heroHidden = !reducedMotion && phase === 1;
  const exploreHidden = !reducedMotion && phase === 0;

  return <section ref={root} id="vp-orion" className={`sx-scene of-orion${reducedMotion ? ' of-reduced' : ''}${!moving ? ' of-still' : ''}`} data-model={model} data-phase={phase} aria-labelledby="of-title">
    <span id="vp-orion-explore" className="of-explore-anchor" aria-hidden="true" />
    <div className="sx-scene-viewport of-viewport" data-orion-story>
      <div className="of-aurora" aria-hidden="true" />
      <svg className="of-starfield" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">{STARS.map((star, i) => <circle key={i} cx={star.x} cy={star.y} r={star.r} opacity={star.opacity} />)}</svg>
      <div className="sx-scene-top of-top"><span>VALLNews / PRODUCTO INSIGNIA</span><span>04 — UN UNIVERSO DE PERSPECTIVAS</span></div>

      <div className="sx-visual of-visual" aria-hidden="true">
        <div className="of-object" data-pointer-surface><div className="of-object-tilt" data-pointer-layer>
          <div className="of-aura" data-breathe />
          <div className="of-core" />
          <svg className="of-orbits" viewBox="0 0 600 600" aria-hidden="true">
            <defs><linearGradient id="of-orbit-light" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#a4cdff" stopOpacity=".12" /><stop offset=".48" stopColor="#dcecff" stopOpacity=".7" /><stop offset="1" stopColor="#609eff" stopOpacity=".13" /></linearGradient></defs>
            <circle cx="300" cy="300" r="216" fill="none" stroke="#8bbdff" strokeOpacity=".14" strokeWidth=".65" />
            <circle cx="300" cy="300" r="245" fill="none" stroke="#8bbdff" strokeOpacity=".1" strokeWidth=".6" strokeDasharray="1 13" />
            {[-35, 35, 90].map((angle, i) => <g key={angle} transform={`rotate(${angle} 300 300)`}>
              <path data-flow data-duration={22000 + i * 6000} d="M40 300a260 100 0 1 0 520 0a260 100 0 1 0-520 0" fill="none" stroke="url(#of-orbit-light)" strokeWidth={i === 2 ? '.65' : '1.1'} />
              <circle data-particle={i} cx="40" cy="300" r={i === 2 ? '2' : '3.2'} fill="#dbeafe" />
            </g>)}
            <path d="M300 34v12M554 300h12M300 554v12M34 300h12" stroke="#8bbdff" strokeOpacity=".5" strokeWidth="1" />
            <circle cx="300" cy="300" r="279" fill="none" stroke="#8bbdff" strokeOpacity=".055" />
          </svg>
          <div className="of-constellation" data-float><ConstelacionOrion label="Constelación de ORION" /><span>ORION</span><small>INTELIGENCIA QUE CONECTA</small></div>
          <span className="of-orbit-label of-orbit-label-a">DATOS</span><span className="of-orbit-label of-orbit-label-b">CONTEXTO</span><span className="of-orbit-label of-orbit-label-c">PERSPECTIVA</span>
        </div></div>
      </div>

      <div className="of-hero" aria-hidden={heroHidden} inert={heroHidden ? '' : undefined}>
        <p className="of-kicker"><i /> NUESTRA INTELIGENCIA. TU PERSPECTIVA.</p>
        <h2 id="of-title">ORION</h2>
        <h3>Ve más allá.<br /><span>Conecta lo que importa.</span></h3>
        <p className="of-intro">Nuestro producto insignia. Un asistente para investigar, relacionar información y dar forma a tus ideas.</p>
        <div className="of-actions"><Link to="/login" className="of-primary">Entrar a ORION <span aria-hidden="true">↗</span></Link><a href="#vp-orion-explore" className="of-discover">Explorar sus modelos <span aria-hidden="true">↓</span></a></div>
        <div className="of-capabilities"><span><small>01</small>Investiga</span><span><small>02</small>Conecta</span><span><small>03</small>Crea</span></div>
      </div>

      <div className="of-explore" aria-hidden={exploreHidden} inert={exploreHidden ? '' : undefined}>
        <div className="of-models">
          <p className="of-kicker">UN ORION. TRES FORMAS DE EXPLORAR.</p>
          <h3>La profundidad<br /><span>la eliges tú.</span></h3>
          <div className="of-model-picker" aria-label="Explorar modelos ORION"><span className="of-model-indicator" style={{ transform: `translateX(${model * 100}%)` }} aria-hidden="true" />{MODELS.map((item, i) => <button type="button" key={item.name} aria-pressed={model === i} onMouseDown={keepScrollPosition} onClick={() => setModel(i)}>{item.name}</button>)}</div>
          <div className="of-model-copy" ref={modelCopy.panel} aria-live="polite"><span className="of-small">{currentModel.name}</span><h4>{currentModel.title}</h4><p>{currentModel.detail}</p></div>
          <Link className="of-primary" to="/login">Descubrir ORION <span aria-hidden="true">↗</span></Link><small className="of-access">Tu siguiente pregunta empieza dentro de VALLNews.</small>
        </div>
        <div className="of-demo">
          <div className="of-demo-top"><span><i /> ORION / EXPLORA UNA PREGUNTA</span><small>VISTA ILUSTRATIVA</small></div>
          <div className="of-example-picker" aria-label="Preguntas de ejemplo">{EXAMPLES.map((item, i) => <button type="button" key={item.label} aria-pressed={example === i} onMouseDown={keepScrollPosition} onClick={() => { manual.current = true; setExample(i); }}>{item.label}</button>)}</div>
          <div className="of-demo-copy" ref={demoCopy.panel} aria-live="polite"><h4>{sample.question}</h4><p>{sample.answer}</p><div className="of-tags">{sample.tags.map(tag => <span key={tag}>{tag}</span>)}</div></div>
          <small className="of-demo-note">Ejemplo ilustrativo. No es una respuesta generada en vivo.</small>
        </div>
      </div>

      <div className="sx-scene-footer of-footer"><span>{phase === 0 ? 'DESPLÁZATE. DESCUBRE LO QUE PUEDES EXPLORAR.' : 'INVESTIGA. CONECTA. DA FORMA A TU PERSPECTIVA.'}</span><a href={phase === 0 ? '#vp-orion-explore' : '#vp-orion'}>{phase === 0 ? 'Descubrir ORION' : 'Volver a ORION'} <span aria-hidden="true">{phase === 0 ? '↓' : '↑'}</span></a><div className="sx-scene-progress" aria-label="Avance de ORION"><i /></div></div>
    </div>
  </section>;
}
