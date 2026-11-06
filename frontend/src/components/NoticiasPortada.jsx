import { useEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';
import { FotoNoticia, Metadata, Icon } from './NoticiasLectura.jsx';

export default function NoticiasPortada({ articles, onOpen }) {
  const root = useRef(null);
  const ids = articles.map(article => article.id).join('|');
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let entrance;
    if (!reduced.matches && root.current) {
      entrance = animate(root.current.querySelectorAll('[data-news-reveal]'), {
        opacity: [.8, 1], y: [8, 0], delay: stagger(65), duration: 450, ease: 'out(3)',
      });
    }
    const motionChange = () => { if (reduced.matches) entrance?.revert(); };
    reduced.addEventListener('change', motionChange);
    return () => { entrance?.revert(); reduced.removeEventListener('change', motionChange); };
  }, [ids]);
  if (!articles.length) return null;
  const [lead, ...headlines] = articles;

  return (
    <section className="nt-frontpage" ref={root} aria-labelledby="nt-frontpage-title">
      <div className="nt-frontpage-heading"><h2 id="nt-frontpage-title">En portada</h2><span>Economía, mercados y sector productivo</span></div>
      <div className={`nt-frontpage-grid${headlines.length ? '' : ' nt-frontpage-grid--single'}`}>
        <article className="nt-lead" data-news-reveal>
          <FotoNoticia key={lead.id} article={lead} priority />
          <div className="nt-lead-copy">
            <div className="nt-lead-tags"><span className="nt-eyebrow">{lead.topicLabel}</span>{lead.impact === 'alto' && <span className="nt-impact-tag">Impacto alto</span>}</div>
            <h3><button className="nt-title-button nt-stretched-button" type="button" onClick={() => onOpen(lead)}>{lead.title}</button></h3>
            {lead.description && <p className="nt-lead-summary">{lead.description}</p>}
            <div className="nt-lead-bottom"><Metadata article={lead} /><span className="nt-lead-read" aria-hidden="true">Leer noticia <Icon name="fa-arrow-right" /></span></div>
          </div>
        </article>
        {headlines.length > 0 && <aside className="nt-focus" aria-labelledby="nt-focus-title">
          <header><span className="nt-eyebrow">Para seguir de cerca</span><h2 id="nt-focus-title">En foco</h2></header>
          <div className="nt-focus-list">{headlines.map(article => <article key={article.id} className="nt-top-story" data-news-reveal>
            <div className="nt-top-story-copy"><div className="nt-top-story-tag"><span className="nt-eyebrow">{article.topicLabel}</span><span>{article.scope === 'mexico' ? 'México' : 'Mundo'}</span></div><h3><button className="nt-title-button nt-stretched-button" type="button" onClick={() => onOpen(article)}>{article.title}</button></h3><Metadata article={article} /></div>
            <FotoNoticia article={article} priority />
          </article>)}</div>
          <a className="nt-all-news" href="#nt-results-title">Todas las noticias <Icon name="fa-arrow-down" /></a>
        </aside>}
      </div>
    </section>
  );
}
