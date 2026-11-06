import { useEffect, useMemo, useState } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import { ESQUELETO } from '../lib/hojasComunes.js';
import {
  FUENTES_NOTICIAS, TEMAS_NOTICIAS, SUBTEMAS_NOTICIAS, PERIODOS_NOTICIAS,
  destacarNoticias, filtrarNoticias, reunirNoticias,
} from '../lib/noticias.js';
import { VentanaNoticia, FotoNoticia, Metadata, Icon } from '../components/NoticiasLectura.jsx';
import NoticiasPortada from '../components/NoticiasPortada.jsx';
import './Noticias.css';

function Noticia({ article, onOpen }) {
  return (
    <article className="nt-story">
      <FotoNoticia article={article} />
      <div className="nt-story-body">
        <span className="nt-eyebrow">{article.topicLabel}</span>
        <h3><button className="nt-title-button nt-stretched-button" type="button" onClick={() => onOpen(article)}>{article.title}</button></h3>
        <Metadata article={article} />
        {article.description && <p className="nt-summary">{article.description}</p>}
        <span className="nt-source-link" aria-hidden="true">Leer noticia <Icon name="fa-arrow-right" /></span>
      </div>
    </article>
  );
}

const INITIAL_EDITIONS = FUENTES_NOTICIAS.map(source => ({ ...source, articles: [], status: 'loading', stale: false }));
const DEFAULT_EXTRA = { subtopic: 'todos', source: 'todos', period: 'todos', from: '', until: '', impact: 'todos', withImage: false, withSummary: false };

export default function Noticias() {
  usePageStyles(ESQUELETO);
  const [editions, setEditions] = useState(INITIAL_EDITIONS);
  const [refresh, setRefresh] = useState(0);
  const [lastCheck, setLastCheck] = useState(null);
  const [scope, setScope] = useState('todos');
  const [topic, setTopic] = useState('todos');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [visibleCount, setVisibleCount] = useState(9);
  const [extra, setExtra] = useState(DEFAULT_EXTRA);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const changeExtra = (key, value) => setExtra(previous => ({ ...previous, [key]: value }));

  useEffect(() => {
    const title = document.title;
    document.title = 'Noticias · México y mundo | VALLNews';
    document.documentElement.classList.add('vn-noticias');
    document.body.classList.add('vn-noticias');
    return () => {
      document.title = title;
      document.documentElement.classList.remove('vn-noticias');
      document.body.classList.remove('vn-noticias');
    };
  }, []);

  useEffect(() => {
    let active = true;
    const controllers = [];
    const timers = [];
    setEditions(previous => previous.map(edition => ({ ...edition, status: 'loading' })));
    const requests = FUENTES_NOTICIAS.map(async source => {
      const controller = new AbortController();
      controllers.push(controller);
      const timer = window.setTimeout(() => controller.abort(), 22_000);
      timers.push(timer);
      try {
        const response = await fetch(source.url, { credentials: 'include', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'auth' : 'source');
        const payload = await response.json();
        if (!payload.success || !Array.isArray(payload.data?.noticias)) throw new Error('source');
        if (active) setEditions(previous => previous.map(edition => edition.id === source.id
          ? { ...edition, articles: payload.data.noticias, status: 'ready', stale: !!payload.stale, generated: payload.data.generado }
          : edition));
      } catch (error) {
        if (active) setEditions(previous => previous.map(edition => edition.id === source.id
          ? { ...edition, status: error.message === 'auth' ? 'auth' : 'error', stale: edition.articles.length > 0 }
          : edition));
      } finally { window.clearTimeout(timer); }
    });
    Promise.allSettled(requests).then(() => { if (active) setLastCheck(new Date().toISOString()); });
    return () => {
      active = false;
      controllers.forEach(controller => controller.abort());
      timers.forEach(timer => window.clearTimeout(timer));
    };
  }, [refresh]);

  useEffect(() => { setVisibleCount(9); }, [scope, topic, query, sort, extra]);
  const articles = useMemo(() => reunirNoticias(editions), [editions]);
  const filtered = useMemo(() => {
    const result = filtrarNoticias(articles, { scope, topic, query, ...extra });
    return sort === 'oldest' ? result.sort((a, b) => (a.timestamp || Infinity) - (b.timestamp || Infinity)) : result;
  }, [articles, scope, topic, query, sort, extra]);
  const topicCounts = useMemo(() => {
    const scoped = filtrarNoticias(articles, { scope, query, ...extra });
    return Object.fromEntries(TEMAS_NOTICIAS.map(item => [item.id, item.id === 'todos' ? scoped.length : scoped.filter(article => article.topic === item.id).length]));
  }, [articles, scope, query, extra]);
  const loading = editions.some(edition => edition.status === 'loading');
  const errors = editions.filter(edition => ['error', 'auth'].includes(edition.status));
  const oldEdition = editions.some(edition => edition.stale);
  const featured = useMemo(() => {
    const highlights = destacarNoticias(articles);
    if (!highlights.length) return [];
    const lead = highlights[0];
    // Incluye México en la portada cuando hay cobertura, sin repetir titulares.
    const mexico = lead.scope === 'mexico' ? null : highlights.find(article => article.scope === 'mexico');
    return [lead, ...[mexico, ...highlights.slice(1)].filter(Boolean)
      .filter((article, index, list) => list.findIndex(item => item.id === article.id) === index)].slice(0, 4);
  }, [articles]);
  const sources = useMemo(() => [...new Set(articles.map(article => article.source))].sort((a, b) => a.localeCompare(b, 'es')), [articles]);
  const subtopics = SUBTEMAS_NOTICIAS.filter(item => articles.some(article => article.subtopics.includes(item.id)));
  const related = selectedArticle ? articles.filter(article => article.id !== selectedArticle.id && article.topic === selectedArticle.topic).slice(0, 2) : [];
  const reset = () => { setScope('todos'); setTopic('todos'); setQuery(''); setExtra(DEFAULT_EXTRA); setSort('recent'); };
  const activeFilters = [
    ...(scope !== 'todos' ? [{ label: scope === 'mexico' ? 'México' : 'Mundo', remove: () => setScope('todos') }] : []),
    ...(topic !== 'todos' ? [{ label: TEMAS_NOTICIAS.find(item => item.id === topic)?.label, remove: () => setTopic('todos') }] : []),
    ...(query ? [{ label: `Búsqueda: ${query}`, remove: () => setQuery('') }] : []),
    ...(extra.subtopic !== 'todos' ? [{ label: SUBTEMAS_NOTICIAS.find(item => item.id === extra.subtopic)?.label, remove: () => changeExtra('subtopic', 'todos') }] : []),
    ...(extra.source !== 'todos' ? [{ label: extra.source, remove: () => changeExtra('source', 'todos') }] : []),
    ...(extra.period !== 'todos' ? [{ label: extra.period === 'custom' ? `${extra.from || 'Inicio'} → ${extra.until || 'Hoy'}` : PERIODOS_NOTICIAS.find(item => item.id === extra.period)?.label, remove: () => changeExtra('period', 'todos') }] : []),
    ...(extra.impact !== 'todos' ? [{ label: `Impacto ${extra.impact}`, remove: () => changeExtra('impact', 'todos') }] : []),
    ...(extra.withImage ? [{ label: 'Con imagen', remove: () => changeExtra('withImage', false) }] : []),
    ...(extra.withSummary ? [{ label: 'Con resumen', remove: () => changeExtra('withSummary', false) }] : []),
  ];
  const extraCount = activeFilters.length - Number(scope !== 'todos') - Number(topic !== 'todos') - Number(!!query);
  const invalidDates = extra.period === 'custom' && extra.from && extra.until && extra.from > extra.until;
  const showFrontpage = activeFilters.length === 0 && sort === 'recent';
  const feed = showFrontpage ? filtered.filter(article => !featured.some(item => item.id === article.id)) : filtered;

  return (
    <>
      <Header />
      <main className="noticias-page">
        <header className="nt-hero">
          <div className="nt-hero-copy">
            <span className="nt-eyebrow">VALLNews · Actualidad económica</span>
            <h1>Noticias<span className="nt-hero-period">.</span></h1>
            <p>Los hechos que mueven los mercados. La información que da perspectiva.</p>
          </div>
          <div className="nt-edition">
            <span className="nt-edition-label">México y mundo</span>
            <strong>{new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' }).format(new Date())}</strong>
            <div><span>{loading ? 'Consultando coberturas…' : lastCheck ? `Consulta ${new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }).format(new Date(lastCheck))} · CDMX` : 'Preparando edición'}</span><button type="button" className="nt-refresh" disabled={loading} onClick={() => setRefresh(value => value + 1)} aria-label="Actualizar noticias"><Icon name="fa-rotate-right" /></button></div>
          </div>
        </header>

        <nav className="nt-topics" aria-label="Temas de noticias">
          {TEMAS_NOTICIAS.map(item => <button type="button" key={item.id} aria-pressed={topic === item.id} onClick={() => { setTopic(item.id); changeExtra('subtopic', 'todos'); }}><Icon name={item.icon} />{item.label}<span>{topicCounts[item.id]}</span></button>)}
        </nav>
        {showFrontpage && <NoticiasPortada articles={featured} onOpen={setSelectedArticle} />}

        <section id="nt-news-filters" className="nt-controls" aria-label="Filtrar noticias">
          <div className="nt-controls-top">
            <div className="nt-scope" role="group" aria-label="Cobertura geográfica">
              {[['todos', 'México y mundo'], ['mexico', 'México'], ['mundo', 'Mundo']].map(([id, label]) => <button key={id} type="button" aria-pressed={scope === id} onClick={() => setScope(id)}>{label}</button>)}
            </div>
            <div className="nt-search"><Icon name="fa-magnifying-glass" /><input type="search" aria-label="Buscar noticias" placeholder="Buscar tema, noticia o fuente…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" onClick={() => setQuery('')} aria-label="Limpiar búsqueda"><Icon name="fa-xmark" /></button>}</div>
          </div>
          <details className="nt-advanced"><summary><span><Icon name="fa-sliders" /> Más filtros {extraCount > 0 && <b>{extraCount}</b>}</span><Icon name="fa-chevron-down" /></summary><div className="nt-advanced-grid">
            <label>Subtema<select value={extra.subtopic} onChange={event => changeExtra('subtopic', event.target.value)}><option value="todos">Todos los subtemas</option>{subtopics.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label>Fuente<select value={extra.source} onChange={event => changeExtra('source', event.target.value)}><option value="todos">Todas las fuentes</option>{sources.map(source => <option key={source} value={source}>{source}</option>)}</select></label>
            <label>Fecha de publicación<select value={extra.period} onChange={event => changeExtra('period', event.target.value)}>{PERIODOS_NOTICIAS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label>Impacto editorial<select value={extra.impact} onChange={event => changeExtra('impact', event.target.value)}><option value="todos">Cualquier impacto</option><option value="alto">Alto</option><option value="medio">Medio</option><option value="bajo">Bajo</option></select></label>
            {extra.period === 'custom' && <><label>Desde<input type="date" value={extra.from} aria-invalid={!!invalidDates} onInput={event => changeExtra('from', event.target.value)} onChange={event => changeExtra('from', event.target.value)} /></label><label>Hasta<input type="date" value={extra.until} min={extra.from || undefined} aria-invalid={!!invalidDates} onInput={event => changeExtra('until', event.target.value)} onChange={event => changeExtra('until', event.target.value)} /></label></>}
          </div><div className="nt-reading-filters"><label><input type="checkbox" checked={extra.withImage} onChange={event => changeExtra('withImage', event.target.checked)} /> Con imagen</label><label><input type="checkbox" checked={extra.withSummary} onChange={event => changeExtra('withSummary', event.target.checked)} /> Con resumen</label><span>Combina los filtros para afinar tu lectura.</span></div>{invalidDates && <p className="nt-date-error" role="alert">La fecha inicial debe ser anterior o igual a la fecha final.</p>}</details>
        </section>
        {activeFilters.length > 0 && <div className="nt-active-filters" aria-label="Filtros aplicados">{activeFilters.map((filter, index) => <button key={`${index}-${filter.label}`} type="button" onClick={filter.remove} aria-label={`Quitar filtro: ${filter.label}`}>{filter.label}<Icon name="fa-xmark" /></button>)}<button type="button" className="nt-reset-filters" onClick={reset}>Limpiar filtros</button></div>}


        <div className="nt-feed-status" aria-live="polite">
          <span>{loading ? 'Cargando noticias' : `${articles.length} ${articles.length === 1 ? 'noticia disponible' : 'noticias disponibles'}`}</span>
          <div>{editions.map(edition => <span key={edition.id} className={`nt-feed nt-feed--${edition.status}`}><span aria-hidden="true" />{edition.label}<span className="nt-sr-only">: {edition.status === 'ready' ? edition.stale ? 'edición anterior' : 'disponible' : edition.status === 'loading' ? 'cargando' : 'sin conexión'}</span></span>)}</div>
        </div>
        {errors.length > 0 && <div className="nt-notice" role="status"><Icon name="fa-circle-info" /><p>{errors.some(edition => edition.status === 'auth') ? <>La sesión venció. <a href="/login">Inicia sesión</a> para consultar las noticias.</> : <>No se pudo consultar {errors.map(edition => edition.label).join(' y ')}. {articles.length ? 'Puedes leer las coberturas disponibles.' : 'Intenta actualizar en unos momentos.'}</>}{oldEdition && ' Se conserva la última edición disponible; revisa las fechas de publicación.'}</p></div>}
        {oldEdition && !errors.length && <div className="nt-notice" role="status"><Icon name="fa-clock" /><p>Una cobertura está mostrando su última edición disponible. Las fechas de cada noticia corresponden a su publicación.</p></div>}

        {filtered.length > 0 ? <section className="nt-results" aria-labelledby="nt-results-title">
          <div className="nt-section-heading"><div><span className="nt-eyebrow">{activeFilters.length ? 'Lectura a tu medida' : 'La actualidad, en contexto'}</span><h2 id="nt-results-title">{activeFilters.length ? 'Tu selección' : 'Últimas noticias'}</h2><span className="nt-result-count" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'noticia' : 'noticias'}{showFrontpage && featured.length ? ` · ${featured.length} en portada` : ''}{scope !== 'todos' ? ` · ${scope === 'mexico' ? 'México' : 'Mundo'}` : ''}</span></div><label className="nt-sort">Ordenar<select value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Más recientes</option><option value="oldest">Más antiguas</option></select></label></div>
          {feed.length > 0 ? <div className="nt-stories">{feed.slice(0, visibleCount).map(article => <Noticia key={article.id} article={article} onOpen={setSelectedArticle} />)}</div> : <p className="nt-feed-complete">Todas las noticias disponibles están en la portada.</p>}
          {feed.length > visibleCount && <div className="nt-load-more"><button type="button" onClick={() => setVisibleCount(count => count + 9)}>Ver más noticias <Icon name="fa-arrow-down" /></button><span>{Math.min(visibleCount, feed.length)} de {feed.length}{showFrontpage ? ' fuera de portada' : ''}</span></div>}
        </section> : loading ? <section className="nt-loading" aria-label="Cargando portada" aria-busy="true"><div className="nt-skeleton nt-skeleton--lead" /><div className="nt-skeleton" /><p>Reuniendo noticias de las fuentes disponibles…</p></section> : <section className="nt-empty"><Icon name="fa-newspaper" /><h2>{articles.length ? 'No hay noticias con estos filtros' : 'La edición aún no está disponible'}</h2><p>{articles.length ? 'Prueba otro tema o busca con menos palabras.' : 'No se recibieron noticias de las fuentes. Puedes volver a consultar la edición.'}</p><button type="button" onClick={articles.length ? reset : () => setRefresh(value => value + 1)}>{articles.length ? 'Ver todas las noticias' : 'Volver a consultar'}</button></section>}

        <div className="nt-bottom-note"><Icon name="fa-book-open" /><p>Titulares y resúmenes de las fuentes disponibles. Abre la fuente para leer la cobertura completa. Las fechas se muestran en horario de Ciudad de México.</p></div>
      </main>
      <Footer />
      {selectedArticle && <VentanaNoticia article={selectedArticle} related={related} onClose={() => setSelectedArticle(null)} onOpen={setSelectedArticle} />}
    </>
  );
}
