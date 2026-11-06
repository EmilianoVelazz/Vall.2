import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { withReportRequest } from '../lib/reportRequest.js';
import {useReportText} from '../lib/reportLocale.jsx';

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfReportPreview({ url, title }) {
  const t=useReportText();
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const renderRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(640);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState('');
  const [pageText, setPageText] = useState('');

  useEffect(() => {
    const element = viewportRef.current;
    const observer = new ResizeObserver(() => setWidth(Math.max(200, element.clientWidth - 32)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setPdf(null); setError(''); setPageNumber(1); setZoom(1); setRendering(true); setPageText('');
    const task = getDocument({ url, isEvalSupported: false, useSystemFonts: true });
    withReportRequest(async signal => {
      const destroy=()=>{task.destroy().catch(()=>{});};
      signal.addEventListener('abort',destroy,{once:true});
      try {return await task.promise;} finally {signal.removeEventListener('abort',destroy);}
    }, {signal:controller.signal,timeoutMs:30000})
      .then(document => { if (!cancelled) setPdf(document); })
      .catch(() => { if (!cancelled) {setRendering(false);setError(t('No se pudo abrir el documento. Puedes guardarlo o generar el PDF de nuevo.'));} });
    return () => { cancelled = true; controller.abort(); task.destroy().catch(() => {}); };
  }, [url,t]);

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

  return <section className="erh-pdf-viewer" aria-label={`${t('Vista previa PDF de')} ${title}`}>
    <div className="erh-pdf-toolbar">
      <div><button type="button" aria-label={t("Página anterior del PDF")} disabled={!pdf || pageNumber <= 1} onClick={() => setPageNumber(value => value - 1)}>‹</button>
        <span aria-live="polite">{t('Página')} {pageNumber} / {pdf?.numPages || '…'}</span>
        <button type="button" aria-label={t("Página siguiente del PDF")} disabled={!pdf || pageNumber >= pdf.numPages} onClick={() => setPageNumber(value => value + 1)}>›</button></div>
      <div><button type="button" aria-label={t("Reducir zoom del PDF")} disabled={!pdf || zoom <= .75} onClick={() => setZoom(value => Math.max(.75, value - .25))}>−</button>
        <button type="button" aria-label={t("Ajustar PDF al ancho")} disabled={!pdf} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label={t("Aumentar zoom del PDF")} disabled={!pdf || zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + .25))}>+</button></div>
    </div>
    <div className="erh-pdf-viewport" ref={viewportRef} tabIndex={0} aria-label="Página del PDF; desplázate para revisar el documento">
      {error ? <p className="erh-pdf-notice" role="alert">{error}</p> : rendering && <p className="erh-pdf-notice" role="status">{t('Preparando la página…')}</p>}
      <canvas ref={canvasRef} aria-label={`${t('Página')} ${pageNumber} / ${pdf?.numPages || '…'} · PDF`} hidden={Boolean(error)} style={{ visibility: rendering ? 'hidden' : 'visible' }} />
      <p className="erh-pdf-page-text">{pageText}</p>
    </div>
  </section>;
}
