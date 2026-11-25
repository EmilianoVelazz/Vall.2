import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import SpaceJourney from '../components/SpaceJourney.jsx';
import {PublicOverview,PublicLinks} from '../components/PublicSite.jsx';
import PresentationScenes from '../components/PresentationScenes.jsx';
import './Presentacion.css';

const HOJAS = ['/assets/css/base.css'];

export default function Presentacion() {
  usePageStyles(HOJAS);
  const auth = useAuth();
  const entryTo = auth?.user ? '/inicio' : '/login';
  const [paused, setPaused] = useState(false);
  const main = useRef(null);
  const [chapter, setChapter] = useState('vp-bolsa');
  const [systemReducedMotion, setSystemReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [motionRequested, setMotionRequested] = useState(false);
  const reducedMotion = systemReducedMotion && !motionRequested;
  const moving = !paused && !reducedMotion;
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setSystemReducedMotion(preference.matches); setMotionRequested(false); };
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const sections = [...main.current.querySelectorAll('.sx-scene, .public-overview')];
    let frame;
    const update = () => {
      frame = null;
      const current = sections.find(section => {
        const bounds = section.getBoundingClientRect();
        return bounds.top <= window.innerHeight * .45 && bounds.bottom > window.innerHeight * .45;
      });
      if (current) setChapter(current.id);
    };
    const scroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', scroll, { passive: true });
    update();
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', scroll); };
  }, []);
  const toggleMotion = () => { if (reducedMotion) { setMotionRequested(true); setPaused(false); } else setPaused(value => !value); };
  return <div className="vn-presentacion">
    <a className="vp-skip" href="#vp-main">Saltar al contenido</a>
    <SpaceJourney moving={moving} reducedMotion={reducedMotion} paused={paused} onToggleMotion={toggleMotion} />
    <main id="vp-main" ref={main}>
      <nav className="sx-navigation" aria-label="Capítulos de la presentación">
        <a href="#vp-space-earth">Tierra</a>{[['vp-bolsa', 'Bolsa'], ['vp-proteinas', 'Proteínas'], ['vp-orion', 'ORION']].map(([id, name]) => <a key={id} href={`#${id}`} aria-current={chapter === id ? 'location' : undefined}>{name}</a>)}
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={toggleMotion} aria-pressed={!moving} aria-label={moving ? 'Pausar animaciones' : 'Activar animaciones'}>{moving ? 'Ⅱ' : '▷'}</button>
        <Link to={entryTo}>Entrar ↗</Link>
      </nav>
      <PresentationScenes moving={moving} reducedMotion={reducedMotion} />
      <PublicOverview moving={moving} />
    </main>
    <footer className="sx-footer"><a href="#vp-space-start" aria-label="Volver al inicio">VALL<span>News</span> ↑</a><p>Economía. Mercados. Perspectiva.</p><span>© 2026 VALLNews</span><PublicLinks /><Link to={entryTo}>Entrar a la plataforma ↗</Link></footer>
  </div>;
}
