import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import usePageStyles from '../lib/usePageStyles.js';
import SpaceJourney from '../components/SpaceJourney.jsx';
import PresentationScenes from '../components/PresentationScenes.jsx';
import './Presentacion.css';

const HOJAS = ['/assets/css/base.css'];

export default function Presentacion() {
  usePageStyles(HOJAS);
  const [paused, setPaused] = useState(false);
  const main = useRef(null);
  const [chapter, setChapter] = useState('vp-bolsa');
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const moving = !paused && !reducedMotion;
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const sections = [...main.current.querySelectorAll('.sx-scene')];
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
  const toggleMotion = () => setPaused(value => !value);
  return <div className="vn-presentacion">
    <a className="vp-skip" href="#vp-main">Saltar al contenido</a>
    <SpaceJourney moving={moving} reducedMotion={reducedMotion} paused={paused} onToggleMotion={toggleMotion} />
    <main id="vp-main" ref={main}>
      <nav className="sx-navigation" aria-label="Capítulos de la presentación">
        <a href="#vp-space-earth">Tierra</a>{[['vp-bolsa', 'Bolsa'], ['vp-proteinas', 'Proteínas'], ['vp-orion', 'ORION']].map(([id, name]) => <a key={id} href={`#${id}`} aria-current={chapter === id ? 'location' : undefined}>{name}</a>)}
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={toggleMotion} disabled={reducedMotion} aria-pressed={!moving} aria-label={reducedMotion ? 'Movimiento reducido' : moving ? 'Pausar animaciones' : 'Activar animaciones'}>{moving ? 'Ⅱ' : '▷'}</button>
        <Link to="/login">Entrar ↗</Link>
      </nav>
      <PresentationScenes moving={moving} reducedMotion={reducedMotion} />
    </main>
    <footer className="sx-footer"><a href="#vp-space-start" aria-label="Volver al inicio">VALL<span>News</span> ↑</a><p>Economía. Mercados. Perspectiva.</p><span>© 2026 VALLNews</span><Link to="/login">Entrar a la plataforma ↗</Link></footer>
  </div>;
}
