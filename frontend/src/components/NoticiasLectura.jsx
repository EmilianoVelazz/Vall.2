import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TEMAS_NOTICIAS, SUBTEMAS_NOTICIAS, fechaNoticia } from '../lib/noticias.js';
import { imagenesNoticia, imagenReferenciaNoticia } from '../lib/noticiasImagenes.js';
import './NoticiasLectura.css';

export function Icon({ name, ...props }) {
  return <i className={`fa-solid ${name}`} aria-hidden="true" {...props} />;
}

export function BotonGuardar({ article, saved, onToggleSave }) {
  if (!onToggleSave) return null;
  const label = saved ? `Quitar noticia guardada: ${article.title}` : `Guardar noticia: ${article.title}`;
  return (
    <button
      type="button"
      className={`nt-save-btn${saved ? ' nt-save-btn--active' : ''}`}
      aria-label={label}
      aria-pressed={!!saved}
      onClick={event => {
        event.stopPropagation();
        onToggleSave(article, !saved);
      }}
    >
      <Icon name="fa-bookmark" />
    </button>
  );
}

export function FotoNoticia({ article, priority = false }) {
  const [imageIndex, setImageIndex] = useState(0);
  const images = useMemo(() => imagenesNoticia({ image: article.image, imageRaw: article.imageRaw, topic: article.topic }), [article.image, article.imageRaw, article.topic]);
  useEffect(() => { setImageIndex(0); }, [images]);
  const src = images[imageIndex];
  const reference = src === imagenReferenciaNoticia(article.topic);
  const icon = TEMAS_NOTICIAS.find(topic => topic.id === article.topic)?.icon || 'fa-newspaper';
  return <div className={`nt-photo nt-photo--${article.topic}`}>
    {src
      ? <img key={src} src={src} alt={reference ? `Imagen de referencia: ${article.topicLabel}` : ''} data-image-kind={reference ? 'reference' : 'source'} loading={priority ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setImageIndex(index => index + 1)} />
      : <div className="nt-photo-placeholder"><Icon name={icon} /><span>{article.topicLabel}</span></div>}
    <span className="nt-photo-region"><Icon name={article.scope === 'mexico' ? 'fa-location-dot' : 'fa-earth-americas'} />{article.scope === 'mexico' ? 'México' : 'Mundo'}</span>
    {reference && <span className="nt-photo-reference">Imagen de referencia</span>}
  </div>;
}

export function Metadata({ article }) {
  return <div className="nt-meta"><strong>{article.source}</strong><span aria-hidden="true">·</span>{article.publishedAt ? <time dateTime={article.publishedAt}>{fechaNoticia(article.publishedAt)}</time> : <span>Fecha no disponible</span>}</div>;
}

export function VentanaNoticia({ article, related, saved = false, onToggleSave, onClose, onOpen }) {
  const dialogRef = useRef(null);
  const headingRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    dialogRef.current.scrollTop = 0;
    headingRef.current.focus({ preventScroll: true });
  }, [article.id]);
  const handleKeyDown = event => {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusables = [...dialogRef.current.querySelectorAll('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const backdropClick = event => {
    if (event.target !== dialogRef.current) return;
    const box = dialogRef.current.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
  };
  const showOriginal = article.editorial || article.summaryOrigin === 'assisted' || (article.originalTitle && article.originalTitle !== article.title);
  return createPortal(<dialog ref={dialogRef} className="nt-dialog" aria-labelledby="nt-reader-title"
    onKeyDown={handleKeyDown}
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={backdropClick}>
    <div className="nt-reader-bar">
      <span><Icon name="fa-book-open" /> Lectura de noticias <b>VALLNews</b></span>
      <div className="nt-reader-actions">
        {onToggleSave && (
          <button type="button" className="nt-reader-save" onClick={() => onToggleSave(article, !saved)}>
            <Icon name="fa-bookmark" /> {saved ? 'Quitar de Guardadas' : 'Guardar para después'}
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Cerrar noticia"><Icon name="fa-xmark" /></button>
      </div>
    </div>
    <FotoNoticia key={article.id} article={article} priority />
    <div className="nt-reader-body">
      <div className="nt-reader-tags">
        <span>{article.topicLabel}</span>
        {article.impact && <span>Impacto editorial: {article.impact}</span>}
        {(article.editorial || article.summaryOrigin === 'assisted') && (
          <span>Edición asistida · comprueba la cobertura original</span>
        )}
      </div>
      <h2 id="nt-reader-title" ref={headingRef} tabIndex={-1}>{article.title}</h2>
      <Metadata article={article} />
      <section className="nt-reader-summary" aria-labelledby="nt-reader-summary-title"><h3 id="nt-reader-summary-title">De qué trata la noticia</h3><p>{article.description || 'La fuente compartió únicamente el titular. Abre la cobertura original para conocer los detalles de esta noticia.'}</p></section>
      {showOriginal && article.originalTitle && (
        <details className="nt-reader-original">
          <summary>Titular original de la fuente</summary>
          <p>{article.originalTitle}</p>
          {article.originalDescription && <p>{article.originalDescription}</p>}
        </details>
      )}
      {article.insight && <section className="nt-reader-context"><Icon name="fa-lightbulb" /><div><h3>Contexto editorial</h3><p>{article.insight}</p></div></section>}
      {article.subtopics?.length > 0 && <div className="nt-reader-subtopics"><span>Temas de esta noticia</span><div>{article.subtopics.map(id => <span key={id}>{SUBTEMAS_NOTICIAS.find(item => item.id === id)?.label}</span>)}</div></div>}
      <div className="nt-reader-source"><div><small>Cobertura original</small><strong>{article.source}</strong><span>{new URL(article.url).hostname.replace(/^www\./, '')}</span></div><a href={article.url} target="_blank" rel="noopener noreferrer">Leer en la fuente <Icon name="fa-arrow-up-right-from-square" /><span className="nt-sr-only"> (abre una pestaña nueva)</span></a></div>
      {related.length > 0 && <section className="nt-reader-related"><h3>Para seguir leyendo</h3>{related.map(item => <button key={item.id} type="button" onClick={() => onOpen(item)}><span>{item.topicLabel} · {item.source}</span><strong>{item.title}</strong><Icon name="fa-arrow-right" /></button>)}</section>}
    </div>
  </dialog>, document.body);
}
