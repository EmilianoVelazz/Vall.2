import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TEMAS_NOTICIAS, SUBTEMAS_NOTICIAS, fechaNoticia } from '../lib/noticias.js';
import { imagenesNoticia, imagenReferenciaNoticia } from '../lib/noticiasImagenes.js';
import './NoticiasLectura.css';

export function Icon({ name, ...props }) {
  return <i className={`fa-solid ${name}`} aria-hidden="true" {...props} />;
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

export function VentanaNoticia({ article, related, onClose, onOpen }) {
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
  const backdropClick = event => {
    if (event.target !== dialogRef.current) return;
    const box = dialogRef.current.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
  };
  return createPortal(<dialog ref={dialogRef} className="nt-dialog" aria-labelledby="nt-reader-title"
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={backdropClick}>
    <div className="nt-reader-bar"><span><Icon name="fa-book-open" /> Lectura de noticias <b>VALLNews</b></span><button type="button" onClick={onClose} aria-label="Cerrar noticia"><Icon name="fa-xmark" /></button></div>
    <FotoNoticia key={article.id} article={article} priority />
    <div className="nt-reader-body">
      <div className="nt-reader-tags"><span>{article.topicLabel}</span>{article.impact && <span>Impacto editorial: {article.impact}</span>}</div>
      <h2 id="nt-reader-title" ref={headingRef} tabIndex={-1}>{article.title}</h2>
      <Metadata article={article} />
      <section className="nt-reader-summary" aria-labelledby="nt-reader-summary-title"><h3 id="nt-reader-summary-title">De qué trata la noticia</h3><p>{article.description || 'La fuente compartió únicamente el titular. Abre la cobertura original para conocer los detalles de esta noticia.'}</p></section>
      {article.insight && <section className="nt-reader-context"><Icon name="fa-lightbulb" /><div><h3>Contexto editorial</h3><p>{article.insight}</p></div></section>}
      {article.subtopics.length > 0 && <div className="nt-reader-subtopics"><span>Temas de esta noticia</span><div>{article.subtopics.map(id => <span key={id}>{SUBTEMAS_NOTICIAS.find(item => item.id === id)?.label}</span>)}</div></div>}
      <div className="nt-reader-source"><div><small>Cobertura original</small><strong>{article.source}</strong><span>{new URL(article.url).hostname.replace(/^www\./, '')}</span></div><a href={article.url} target="_blank" rel="noopener noreferrer">Leer en la fuente <Icon name="fa-arrow-up-right-from-square" /><span className="nt-sr-only"> (abre una pestaña nueva)</span></a></div>
      {related.length > 0 && <section className="nt-reader-related"><h3>Para seguir leyendo</h3>{related.map(item => <button key={item.id} type="button" onClick={() => onOpen(item)}><span>{item.topicLabel} · {item.source}</span><strong>{item.title}</strong><Icon name="fa-arrow-right" /></button>)}</section>}
    </div>
  </dialog>, document.body);
}
