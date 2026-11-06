import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EARTH_LOCATIONS, JOURNEY_CHAPTERS } from '../lib/earthJourneyData.js';
import { useAnimatedContent } from '../lib/useShowcaseInteraction.js';
import './SpaceJourney.css';

export default function SpaceJourney({ moving, reducedMotion, paused, onToggleMotion }) {
  const section = useRef(null);
  const viewport = useRef(null);
  const host = useRef(null);
  const labels = useRef([]);
  const progressFill = useRef(null);
  const progressText = useRef(null);
  const controller = useRef(null);
  const motion = useRef(moving);
  const manualCity = useRef(false);
  const autoCity = useRef(null);
  const selectedCity = useRef('mexico');
  const [stage, setStage] = useState(reducedMotion ? 2 : 0);
  const [selected, setSelected] = useState('mexico');
  const [status, setStatus] = useState('loading');
  const chapterCopy = useAnimatedContent(stage, moving);
  const cityCopy = useAnimatedContent(selected, moving);
  const chapter = JOURNEY_CHAPTERS[chapterCopy.displayed];
  const location = EARTH_LOCATIONS.find(item => item.id === cityCopy.displayed);
  const travelProgress = useCallback(progress => {
    if (progress < .20) { manualCity.current = false; autoCity.current = null; return; }
    if (progress < .64) { autoCity.current = null; return; }
    if (manualCity.current) return;
    const city = EARTH_LOCATIONS[Math.min(EARTH_LOCATIONS.length - 1, Math.floor((progress - .64) / .36 * EARTH_LOCATIONS.length))];
    if (autoCity.current === city.id) return;
    autoCity.current = city.id;
    selectedCity.current = city.id;
    setSelected(city.id);
    controller.current?.focusRegion(city.id);
  }, []);
  const manualInteraction = useCallback(() => { manualCity.current = true; }, []);

  useEffect(() => {
    motion.current = moving;
    controller.current?.refresh();
  }, [moving]);

  useEffect(() => {
    let stopped = false;
    let sceneController;
    import('../lib/createEarthJourney.js').then(({ default: createEarthJourney }) => {
      if (stopped) return;
      sceneController = createEarthJourney({
        host: host.current, section: section.current, viewport: viewport.current,
        labels: labels.current, fill: progressFill.current, progressText: progressText.current,
        motion, reduced: reducedMotion, onProgress: reducedMotion ? undefined : travelProgress,
        onInteract: manualInteraction,
        onStage: value => { if (!stopped) setStage(value); },
        onReady: () => { if (!stopped) setStatus('ready'); },
        onFailure: () => { if (!stopped) setStatus('fallback'); },
      });
      controller.current = sceneController;
      if (manualCity.current) sceneController?.focusRegion(selectedCity.current);
    }).catch(() => { if (!stopped) setStatus('fallback'); });
    return () => {
      stopped = true;
      sceneController?.dispose();
      controller.current = null;
    };
  }, [reducedMotion, travelProgress, manualInteraction]);

  useEffect(() => {
    if (status !== 'fallback') return undefined;
    const update = () => {
      const travel = section.current.offsetHeight - viewport.current.clientHeight;
      const progress = reducedMotion ? 1 : Math.max(0, Math.min(1, -section.current.getBoundingClientRect().top / Math.max(1, travel)));
      setStage(progress < .20 ? 0 : progress < .55 ? 1 : 2);
      if (!reducedMotion) travelProgress(progress);
      progressFill.current.style.transform = `scaleX(${progress})`;
      progressText.current.textContent = `${Math.round(progress * 100).toString().padStart(2, '0')}%`;
      viewport.current.style.setProperty('--vp-fallback-scale', String(1 + progress * .7));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [status, reducedMotion, travelProgress]);

  const selectLocation = id => {
    manualCity.current = true;
    selectedCity.current = id;
    setSelected(id);
    controller.current?.focusRegion(id);
  };
  const reset = () => {
    manualCity.current = false;
    autoCity.current = null;
    selectedCity.current = 'mexico';
    setSelected('mexico');
    controller.current?.reset();
  };

  return <section ref={section} className={`vp-space-journey${reducedMotion ? ' vp-space-reduced' : ''}`} aria-label="Viaje interactivo del espacio a la Tierra" data-stage={stage}>
    {JOURNEY_CHAPTERS.map((item, i) => <span key={item.id} className={`vp-space-anchor vp-space-anchor-${i}`} id={item.id} aria-hidden="true" />)}
    <div ref={viewport} className="vp-space-viewport" data-status={status}>
      <div className="vp-space-nebula" aria-hidden="true" />
      <div className="vp-space-fallback" aria-hidden="true"><div /></div>
      <div ref={host} className="vp-space-render" />
      <div className="vp-space-atmosphere" aria-hidden="true" />
      <div className="vp-space-top">
        <Link to="/" className="vp-space-brand" aria-label="VALLNews, presentación">VALL<span>News</span><small>UNA PERSPECTIVA GLOBAL</small></Link>
        <span className="vp-space-top-caption"><i /> EL MUNDO NUNCA SE DETIENE.</span>
        <Link to="/login" className="vp-space-login">Entrar a la plataforma <span aria-hidden="true">↗</span></Link>
      </div>

      <div className="vp-space-copy" ref={chapterCopy.panel}>
        <p className="vp-space-eyebrow">{chapter.eyebrow}</p>
        <h1 className="vp-space-title">{chapter.first}<br /><span>{chapter.second}</span></h1>
        <p className="vp-space-description">{chapter.description}</p>
        {chapterCopy.displayed === 0 && <a href="#vp-space-earth" className="vp-space-arrive">Llegar a la Tierra <span aria-hidden="true">↓</span></a>}
        {chapterCopy.displayed === 2 && <a href="#vp-bolsa" className="vp-space-arrive">Descubrir la bolsa <span aria-hidden="true">↗</span></a>}
      </div>

      <div className="vp-earth-labels">
        {EARTH_LOCATIONS.map((item, i) => <button ref={node => { labels.current[i] = node; }} key={item.id} type="button" className="vp-earth-label" hidden aria-label={`Explorar ${item.city}`} onClick={() => selectLocation(item.id)}><i aria-hidden="true" /><span>{item.label}</span></button>)}
      </div>

      <div className="vp-space-tools" aria-label="Controles de la Tierra">
        <span>ARRASTRA PARA GIRAR <span aria-hidden="true">↔</span></span>
        <button type="button" onClick={reset}>Restablecer vista <span aria-hidden="true">↺</span></button>
        <button type="button" onClick={onToggleMotion} disabled={reducedMotion} aria-pressed={paused || reducedMotion}>{moving ? 'Ⅱ Pausar movimiento' : reducedMotion ? 'Movimiento reducido' : '▷ Activar movimiento'}</button>
      </div>

      <aside className="vp-location-card" aria-label="Explora una perspectiva del mundo" aria-hidden={stage === 0} inert={stage === 0 ? '' : undefined}>
        <div className="vp-location-picker" aria-label="Elegir ciudad">{EARTH_LOCATIONS.map(item => <button key={item.id} type="button" onClick={() => selectLocation(item.id)} aria-pressed={selected === item.id} className={selected === item.id ? 'active' : ''}>{item.label}</button>)}</div>
        <div className="vp-location-content" ref={cityCopy.panel} aria-live="polite"><span>{location.category}</span><h3>{location.title}</h3><p>{location.description}</p><div className="vp-location-bottom"><small>{location.coordinates}</small><Link to="/login">Explorar la plataforma ↗</Link></div></div>
      </aside>

      <div className="vp-space-footer">
        <div className="vp-space-chapters" aria-label="Etapas del recorrido">{JOURNEY_CHAPTERS.map((item, i) => <a key={item.id} href={`#${item.id}`} aria-current={stage === i ? 'step' : undefined} className={stage === i ? 'active' : ''}><span>0{i + 1}</span>{item.label}</a>)}</div>
        <span className="vp-space-scroll-hint">{stage === 2 ? 'DESPLÁZATE PARA EXPLORAR CIUDADES' : 'DESPLÁZATE PARA VIAJAR'} <span aria-hidden="true">↓</span></span>
        <div className="vp-space-progress" aria-label="Avance del recorrido"><span ref={progressText}>{reducedMotion ? '100%' : '00%'}</span><div><i ref={progressFill} /></div></div>
      </div>
    </div>
  </section>;
}
