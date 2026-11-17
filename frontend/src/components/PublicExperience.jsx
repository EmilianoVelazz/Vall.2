import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { animate, createScope } from 'animejs';
import site from '../../../shared/public-site.json';
import PublicPreview from './PublicPreview.jsx';
import PublicIcon from './PublicIcon.jsx';
import useViewportVisibility from '../lib/useViewportVisibility.js';
import './PublicExperience.css';

const experience = {
  '/soluciones/informes': { kind: 'report', eyebrow: 'EL CONTEXTO EN UNA EDICIÓN', index: '01' },
  '/soluciones/finanzas': { kind: 'finance', eyebrow: 'UNA MIRADA AL PULSO GLOBAL', index: '02' },
  '/soluciones/mercados': { kind: 'markets', eyebrow: 'PRODUCCIÓN. COMERCIO. PERSPECTIVA.', index: '03' },
  '/soluciones/mexico': { kind: 'mexico', eyebrow: 'TU PERSPECTIVA LOCAL', index: '04' },
  '/soluciones/orion': { kind: 'orion', eyebrow: 'INVESTIGA. RELACIONA. PREPARA.', index: '05' },
  '/metodologia': { kind: 'method', eyebrow: 'EL CONTEXTO TAMBIÉN ES CÓMO LO LEES', index: '06' },
  '/contacto': { kind: 'access', eyebrow: 'TU PRÓXIMA PERSPECTIVA EMPIEZA AQUÍ', index: '07' },
};

export default function PublicExperience({ route, children }) {
  const page = site.pages[route], design = experience[route];
  const root = useRef(null), hero = useRef(null), navigation = useRef(null);
  const [systemReduced, setSystemReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [motionChoice, setMotionChoice] = useState(null);
  const visible = useViewportVisibility(hero, route);
  const [pageVisible, setPageVisible] = useState(true);
  const moving = motionChoice === 'play' || (motionChoice !== 'pause' && !systemReduced);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setSystemReduced(preference.matches); setMotionChoice(null); };
    const visibility = () => setPageVisible(!document.hidden);
    visibility();
    preference.addEventListener('change', update);
    document.addEventListener('visibilitychange', visibility);
    return () => { preference.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const nav = navigation.current, selected = nav?.querySelector('[aria-current="page"]');
      if (selected) {
        const left = selected.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft - (nav.clientWidth - selected.clientWidth) / 2;
        nav.scrollTo({ left, behavior: 'instant' });
      }
      // Centering the horizontal menu must not overwrite a direct section link.
      const anchor = window.location.hash.slice(1);
      if (['public-details', 'public-content'].includes(anchor)) root.current?.querySelector(`#${anchor}`)?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [route]);
  useEffect(() => {
    if (!moving || typeof IntersectionObserver !== 'function') return undefined;
    let live = true;
    const scope = createScope({ root: root.current });
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!live || !entry.isIntersecting) return;
        scope.add(() => animate(entry.target, { opacity: [.3, 1], y: [18, 0], duration: 700, ease: 'out(4)' }));
        observer.unobserve(entry.target);
      });
    }, { threshold: .1 });
    root.current.querySelectorAll('[data-public-reveal]').forEach(element => observer.observe(element));
    return () => { live = false; observer.disconnect(); scope.revert(); };
  }, [route, moving]);

  return <div ref={root} className="public-page public-product-page" data-product={design.kind}>
    <a className="public-skip" href="#public-content">Saltar al contenido</a>
    <header className="public-header public-width"><Link className="public-brand" to="/#conoce-vallnews" aria-label="Volver a Conoce VALLNews">VALL<span>News</span><small>UNA PERSPECTIVA GLOBAL</small></Link><div className="public-header-actions"><button className="public-motion-button" type="button" onClick={() => setMotionChoice(moving ? 'pause' : 'play')} aria-label={moving ? 'Pausar animaciones' : 'Activar animaciones'} aria-pressed={!moving}>{moving ? 'Ⅱ' : '▷'}</button><Link className="public-login" to="/login">Entrar <span aria-hidden="true">↗</span></Link></div></header>
    <nav ref={navigation} className="public-product-nav public-width" aria-label="Perspectivas de VALLNews">{Object.entries(site.pages).filter(([path]) => path !== '/').map(([path, item]) => <Link key={path} to={path} aria-current={path === route ? 'page' : undefined}>{item.label}</Link>)}</nav>
    <main className="public-width" id="public-content">
      <div ref={hero} className="public-product-hero">
        <div className="public-product-copy" data-public-reveal><p className="public-eyebrow"><i /> {design.eyebrow}</p><h1>{page.heading}</h1><p className="public-lead">{page.intro}</p><a className="public-detail-link" href="#public-details">Descubre qué incluye <span aria-hidden="true">↓</span></a></div>
        <PublicPreview key={route} kind={design.kind} moving={moving && visible && pageVisible} />
      </div>
      <section className="public-feature-section" id="public-details" aria-labelledby="public-features-title"><div className="public-feature-heading" data-public-reveal><div><p className="public-eyebrow">DE LA INFORMACIÓN A LA PERSPECTIVA</p><h2 id="public-features-title">Una mirada más cercana.</h2></div><span>{design.index} / VALLNEWS</span></div><div className="public-feature-grid" data-count={page.sections.length}>{page.sections.map((section, i) => <article className="public-feature" key={section.title} data-public-reveal><div className="public-feature-top"><span>0{i + 1}</span><PublicIcon kind={design.kind} /></div><h3>{section.title}</h3><p>{section.text}</p></article>)}</div></section>
      <aside className="public-product-cta" data-public-reveal><div><p className="public-eyebrow">TU PRÓXIMA PERSPECTIVA</p><h2>Explora VALLNews con tu cuenta.</h2><p>Entra a los informes y las herramientas de la plataforma. Para solicitar acceso, contacta al administrador de tu organización.</p></div><Link className="public-login" to="/login">Ir al acceso <span aria-hidden="true">↗</span></Link></aside>
    </main>
    <footer className="public-footer public-width"><Link to="/#conoce-vallnews" className="public-return">← Volver a Conoce VALLNews</Link>{children}<p>VALLNews · Economía. Mercados. Perspectiva.</p></footer>
  </div>;
}
