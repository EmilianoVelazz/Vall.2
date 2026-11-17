import { useEffect, useId, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { withReportRequest } from '../lib/reportRequest.js';
import {useReportText} from '../lib/reportLocale.jsx';
import {readReportPosition,saveReportPosition} from '../lib/reportReadingMemory.js';
import ReportControlIcon from './ReportControlIcon.jsx';

GlobalWorkerOptions.workerSrc = workerUrl;
const searchText=value=>String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLocaleLowerCase();

export default function PdfReportPreview({ url, title,accountEmail='',readingKey='' }) {
  const t=useReportText();
  const viewportRef = useRef(null);
  const viewerRef = useRef(null),searchInputRef=useRef(null),searchButtonRef=useRef(null);
  const searchId=useId();
  const canvasRef = useRef(null);
  const renderRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(640);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState('');
  const [pageText, setPageText] = useState('');
  const [pageInput,setPageInput]=useState('1');
  const [query,setQuery]=useState('');
  const [matches,setMatches]=useState([]);
  const [searched,setSearched]=useState('');
  const [searching,setSearching]=useState(false);
  const [searchError,setSearchError]=useState('');
  const [searchOpen,setSearchOpen]=useState(false),[fullscreen,setFullscreen]=useState(false);
  const searchRequest=useRef(null),textCache=useRef(new Map());
  const positionReady=useRef('');
  useEffect(()=>{if(pdf && accountEmail && readingKey && positionReady.current===accountEmail+'|'+readingKey)saveReportPosition(accountEmail,readingKey,{page:pageNumber,zoom});},[pdf,pageNumber,zoom,accountEmail,readingKey]);
  useEffect(()=>{setPageInput(String(pageNumber));},[pageNumber]);
  useEffect(()=>{if(searchOpen)searchInputRef.current?.focus();},[searchOpen]);
  useEffect(()=>{
    const changed=()=>setFullscreen(document.fullscreenElement===viewerRef.current);
    document.addEventListener('fullscreenchange',changed);
    return ()=>document.removeEventListener('fullscreenchange',changed);
  },[]);

  useEffect(() => {
    const element = viewportRef.current;
    const observer = new ResizeObserver(() => setWidth(Math.max(200, element.clientWidth - 32)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    positionReady.current='';setPdf(null); setError(''); setPageNumber(1); setZoom(1); setRendering(true); setPageText('');
    searchRequest.current?.abort();textCache.current=new Map();setPageInput('1');setQuery('');setMatches([]);setSearched('');setSearching(false);setSearchError('');
    const task = getDocument({ url, isEvalSupported: false, useSystemFonts: true });
    withReportRequest(async signal => {
      const destroy=()=>{task.destroy().catch(()=>{});};
      signal.addEventListener('abort',destroy,{once:true});
      try {return await task.promise;} finally {signal.removeEventListener('abort',destroy);}
    }, {signal:controller.signal,timeoutMs:30000})
      .then(document => { if (!cancelled) {const position=readReportPosition(accountEmail,readingKey);setPageNumber(Math.min(document.numPages,position?.page || 1));setZoom(position?.zoom || 1);positionReady.current=accountEmail+'|'+readingKey;setPdf(document);} })
      .catch(() => { if (!cancelled) {setRendering(false);setError(t('No se pudo abrir el documento. Puedes guardarlo o generar el PDF de nuevo.'));} });
    return () => { cancelled = true; controller.abort(); searchRequest.current?.abort(); task.destroy().catch(() => {}); };
  }, [url,t,accountEmail,readingKey]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let task;
    const controller = new AbortController();
    setRendering(true); setError(''); setPageText('');
    const previousTask = renderRef.current;
    withReportRequest(async signal => {
      await previousTask?.promise.catch(() => {});
      signal.throwIfAborted();
      const page = await pdf.getPage(pageNumber);
      signal.throwIfAborted();
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width * zoom });
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = canvasRef.current;
      canvas.width = Math.ceil(viewport.width * density);
      canvas.height = Math.ceil(viewport.height * density);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      task = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport,
        transform: density === 1 ? null : [density, 0, 0, density, 0, 0] });
      renderRef.current = task;
      const cancel=()=>task.cancel();signal.addEventListener('abort',cancel,{once:true});
      try {await task.promise;} finally {signal.removeEventListener('abort',cancel);}
      if (cancelled) return;
      setRendering(false);
      viewportRef.current.scrollTo({ top: 0, left: 0 });
      // La extracción accesible no debe ocultar una página ya dibujada.
      const text=await withReportRequest(()=>page.getTextContent(),{signal,timeoutMs:5000}).catch(()=>null);
      if (!cancelled && text) setPageText(text.items.map(item => item.str || '').join(' '));
    }, {signal:controller.signal,timeoutMs:20000}).catch(cause => {
      if (!cancelled && cause?.name !== 'RenderingCancelledException') {
        setError('No se pudo mostrar esta página. Puedes abrir o guardar el PDF.'); setRendering(false);
      }
    });
    return () => { cancelled = true; controller.abort(); task?.cancel(); };
  }, [pdf, pageNumber, width, zoom]);

  const search=async event=>{
    event.preventDefault();if(!pdf || searchText(query).length<2)return;
    searchRequest.current?.abort();const controller=new AbortController();searchRequest.current=controller;
    const term=query.trim(),needle=searchText(term),cache=textCache.current;
    setSearching(true);setSearchError('');setSearched('');setMatches([]);
    try{
      const found=await withReportRequest(async signal=>{
        const pages=[];
        for(let number=1;number<=pdf.numPages;number++){
          signal.throwIfAborted();let text=cache.get(number);
          if(text===undefined){const page=await pdf.getPage(number);signal.throwIfAborted();const content=await page.getTextContent();signal.throwIfAborted();text=searchText(content.items.map(item=>item.str || '').join(' '));cache.set(number,text);}
          if(text.includes(needle))pages.push(number);
        }
        return pages;
      },{signal:controller.signal,timeoutMs:30000});
      if(searchRequest.current!==controller || controller.signal.aborted)return;
      setMatches(found);setSearched(term);if(found.length)setPageNumber(found[0]);
    }catch(cause){if(searchRequest.current===controller && cause.name!=='AbortError')setSearchError(t('No se pudo completar la búsqueda. Reintenta con otra referencia.'));}
    finally{if(searchRequest.current===controller){searchRequest.current=null;setSearching(false);}}
  };

  const jumpToPage=()=>{const number=Number(pageInput);if(pdf && Number.isInteger(number) && number>=1 && number<=pdf.numPages)setPageNumber(number);else setPageInput(String(pageNumber));};
  return <section className="erh-pdf-viewer" ref={viewerRef} aria-label={`${t('Vista previa PDF de')} ${title}`}>
    <div className="erh-pdf-toolbar">
      <div className="erh-pdf-pagination"><button type="button" title={t('Página anterior del PDF')} aria-label={t("Página anterior del PDF")} disabled={!pdf || pageNumber <= 1} onClick={() => setPageNumber(value => Math.max(1,value - 1))}><ReportControlIcon name="previous" /></button>
        <form className="erh-pdf-jump" onSubmit={event=>{event.preventDefault();jumpToPage();}}><label><span>{t('Página')}</span><input aria-label={t('Número de página del PDF')} type="number" inputMode="numeric" min="1" max={pdf?.numPages || 1} step="1" required value={pageInput} disabled={!pdf} onChange={event=>setPageInput(event.target.value)} onBlur={jumpToPage} /></label><span>/ {pdf?.numPages || '…'}</span></form>
        <button type="button" title={t('Página siguiente del PDF')} aria-label={t("Página siguiente del PDF")} disabled={!pdf || pageNumber >= pdf.numPages} onClick={() => setPageNumber(value => Math.min(pdf.numPages,value + 1))}><ReportControlIcon name="next" /></button><span className="erh-pdf-page-text" aria-live="polite">{t('Página')} {pageNumber} / {pdf?.numPages || '…'}</span></div>
      <div className="erh-pdf-utilities"><button ref={searchButtonRef} type="button" className="erh-pdf-search-toggle" title={t('Buscar en el PDF')} aria-label={t('Buscar en el PDF')} aria-expanded={searchOpen} aria-controls={searchId} disabled={!pdf} onClick={()=>setSearchOpen(value=>!value)}><ReportControlIcon name="search" /></button><span className="erh-pdf-tool-divider" aria-hidden="true" /><button type="button" aria-label={t("Reducir zoom del PDF")} disabled={!pdf || zoom <= .75} onClick={() => setZoom(value => Math.max(.75, value - .25))}>−</button>
        <button type="button" aria-label={t("Ajustar PDF al ancho")} disabled={!pdf} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label={t("Aumentar zoom del PDF")} disabled={!pdf || zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + .25))}>+</button>{document.fullscreenEnabled && <><span className="erh-pdf-tool-divider" aria-hidden="true" /><button type="button" aria-label={t(fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa')} title={t(fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa')} disabled={!pdf} onClick={()=>{const action=fullscreen ? document.exitFullscreen() : viewerRef.current.requestFullscreen();void action.catch(()=>{});}}><ReportControlIcon name={fullscreen ? 'compress' : 'expand'} /></button></>}</div>
    </div>
    {searchOpen && <div id={searchId} className="erh-pdf-search" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setSearchOpen(false);searchButtonRef.current?.focus();}}}>
      <form onSubmit={search}><label><input ref={searchInputRef} type="search" aria-label={t('Buscar referencia en el PDF')} placeholder={t('Buscar en el PDF')} maxLength={120} minLength={2} required value={query} disabled={!pdf} onChange={event=>setQuery(event.target.value)} /></label><button type="submit" disabled={!pdf || searching || searchText(query).length<2}>{t(searching ? 'Buscando…' : 'Buscar')}</button>{searching && <button type="button" onClick={()=>searchRequest.current?.abort()}>{t('Cancelar búsqueda')}</button>}<button type="button" aria-label={t('Cerrar búsqueda')} onClick={()=>{setSearchOpen(false);searchButtonRef.current?.focus();}}><ReportControlIcon name="close" /></button></form>
      {searchError && <p role="alert">{searchError}</p>}
      <div role="status" aria-live="polite">{searched && <p>{t('Búsqueda')}: “{searched}” · {matches.length} {t(matches.length===1 ? 'página encontrada' : 'páginas encontradas')}{!matches.length ? ' · '+t('Prueba otro nombre o abreviatura.') : ''}</p>}</div>
      {matches.length>0 && <nav aria-label={t('Resultados de búsqueda en el PDF')}>{matches.map(number=><button key={number} type="button" aria-current={pageNumber===number ? 'page' : undefined} onClick={()=>setPageNumber(number)}>{t('Página')} {number}</button>)}</nav>}
    </div>}
    <div className="erh-pdf-viewport" ref={viewportRef} tabIndex={0} aria-label={t('Página del PDF; desplázate para revisar el documento')}>
      {error ? <p className="erh-pdf-notice" role="alert">{error}</p> : rendering && <p className="erh-pdf-notice" role="status">{t('Preparando la página…')}</p>}
      <canvas ref={canvasRef} aria-label={`${t('Página')} ${pageNumber} / ${pdf?.numPages || '…'} · PDF`} hidden={Boolean(error)} style={{ visibility: rendering ? 'hidden' : 'visible' }} />
      <p className="erh-pdf-page-text">{pageText}</p>
    </div>
  </section>;
}
