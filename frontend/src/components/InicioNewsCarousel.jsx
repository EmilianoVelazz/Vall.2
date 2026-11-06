import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { destacarNoticias } from '../lib/noticias.js';
import { useReducedMotion } from '../lib/useInicioMotion.js';
import { FotoNoticia, Metadata, VentanaNoticia, Icon } from './NoticiasLectura.jsx';

const FILTERS = [
  { id: 'todos', label: 'En foco', topics: [] },
  { id: 'mercados', label: 'Mercados', topics: ['bolsas', 'finanzas'] },
  { id: 'proteinas', label: 'Proteínas', topics: ['ganaderia'] },
  { id: 'campo', label: 'Campo', topics: ['cosechas', 'materias'] },
];

export default function InicioNewsCarousel({ news, loading, stale, onRefresh }) {
  const rootRef = useRef(null);
  const reduced = useReducedMotion();
  const [topic, setTopic] = useState('todos');
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [foreground, setForeground] = useState(() => !document.hidden);
  const [reader, setReader] = useState(null);
  const articles = useMemo(() => {
    const filter = FILTERS.find(item => item.id === topic);
    return destacarNoticias(news.filter(article => !filter.topics.length || filter.topics.includes(article.topic)), 6);
  }, [news, topic]);
  const activeIndex = articles.length ? index % articles.length : 0;
  const active = articles[activeIndex];
  const moving = playing && !reduced && !hovered && !focused && visible && foreground && !reader && articles.length > 1;
  const ids = articles.map(article => article.id).join('|');
  useEffect(() => { setIndex(0); }, [ids]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => setVisible(entries[0].isIntersecting), { threshold: .15 });
    observer.observe(rootRef.current);
    const update = () => setForeground(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  useEffect(() => {
    if (!moving) return undefined;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % articles.length), 8_000);
    return () => window.clearInterval(timer);
  }, [moving, articles.length, activeIndex]);
  useEffect(() => { if (reduced) setPlaying(false); }, [reduced]);
  const change = offset => { setPlaying(false); setIndex((activeIndex + offset + articles.length) % articles.length); };

  return <section id="ih-news" className="ih-carousel" ref={rootRef} aria-label="Noticias para entender el mercado" aria-roledescription="carrusel"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onKeyDown={event => { if (!reader && articles.length > 1 && ['ArrowRight', 'ArrowLeft'].includes(event.key)) { event.preventDefault(); change(event.key === 'ArrowRight' ? 1 : -1); } }}>
    <div className="ih-carousel-heading"><span className="ih-eyebrow"><span className="ih-status-dot" /> El mundo en tu radar</span><Link to="/noticias">Ver noticias <Icon name="fa-arrow-up-right-from-square" /></Link></div>
    <div className="ih-news-filters" role="group" aria-label="Temas del carrusel de noticias">{FILTERS.map(filter => <button key={filter.id} type="button" aria-pressed={topic === filter.id} onClick={() => { setPlaying(false); setTopic(filter.id); }}>{filter.label}</button>)}</div>
    {active ? <>
      <div className="ih-news-deck" aria-live={moving ? 'off' : 'polite'}>
        {articles.map((article, position) => <article key={article.id} className={`ih-news-slide${position === activeIndex ? ' is-active' : ''}`}
          role="group" aria-roledescription="diapositiva" aria-label={`${position + 1} de ${articles.length}`} aria-hidden={position !== activeIndex} inert={position !== activeIndex ? '' : undefined}>
          <div className="ih-news-visual"><FotoNoticia article={article} priority={position === activeIndex} /><svg viewBox="0 0 440 220" aria-hidden="true"><ellipse cx="330" cy="100" rx="140" ry="110" /><ellipse cx="330" cy="100" rx="86" ry="110" /><ellipse cx="330" cy="100" rx="30" ry="110" /><path d="M195 45H465M190 100H470M195 155H465" /></svg><span className="ih-news-visual-label">{article.topicLabel}</span></div>
          <div className="ih-news-copy"><Metadata article={article} /><h2><button type="button" onClick={() => { setPlaying(false); setReader(article); }}>{article.title}</button></h2>
            {article.description && <p>{article.description}</p>}
            <button className="ih-news-read" type="button" onClick={() => { setPlaying(false); setReader(article); }}>Leer la noticia <Icon name="fa-arrow-right" /></button>
          </div>
        </article>)}
      </div>
      <div className="ih-carousel-controls"><span aria-live={moving ? 'off' : 'polite'}><b>{String(activeIndex + 1).padStart(2, '0')}</b> / {String(articles.length).padStart(2, '0')}</span>
        <div className="ih-carousel-dots" role="group" aria-label="Elegir noticia">{articles.map((article, position) => <button key={article.id} type="button" aria-label={`Ver noticia ${position + 1}: ${article.title}`} aria-pressed={position === activeIndex} onClick={() => { setPlaying(false); setIndex(position); }} />)}</div>
        <div className="ih-carousel-arrows"><button type="button" disabled={articles.length < 2 || reduced} aria-label={playing ? 'Pausar noticias automáticas' : 'Activar noticias automáticas'} aria-pressed={playing} onClick={() => setPlaying(value => !value)}><Icon name={playing ? 'fa-pause' : 'fa-play'} /></button><button type="button" disabled={articles.length < 2} aria-label="Noticia anterior" onClick={() => change(-1)}><Icon name="fa-arrow-left" /></button><button type="button" disabled={articles.length < 2} aria-label="Siguiente noticia" onClick={() => change(1)}><Icon name="fa-arrow-right" /></button></div>
      </div>
      {stale && <p className="ih-news-notice">Última edición disponible. Algunas fuentes no se actualizaron; revisa la fecha de cada noticia.</p>}
    </> : <div className="ih-news-unavailable" aria-live="polite"><Icon name="fa-newspaper" /><h2>{loading ? 'Conectando con la actualidad.' : 'El radar está en espera.'}</h2><p>{loading ? 'Reuniendo noticias económicas, del campo y del sector de proteínas.' : topic !== 'todos' && news.length ? 'No hay noticias de este tema en la edición disponible. Explora otra cobertura.' : 'Las fuentes no respondieron. Puedes volver a consultar las noticias.'}</p>{!loading && <button type="button" className="ih-button" onClick={news.length ? () => setTopic('todos') : onRefresh}>{news.length ? 'Ver toda la cobertura' : 'Volver a consultar'} <Icon name="fa-arrow-right" /></button>}</div>}
    {reader && <VentanaNoticia article={reader} related={news.filter(article => article.id !== reader.id && article.topic === reader.topic).slice(0, 3)} onClose={() => setReader(null)} onOpen={setReader} />}
  </section>;
}
