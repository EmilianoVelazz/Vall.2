import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {ReportLocaleContext,reportText,useReportText} from '../lib/reportLocale.jsx';
import ReportAiEditor, { ReportAiGenerateAction } from './ReportAiEditor.jsx';
import ReportCreationComposer from './ReportCreationComposer.jsx';
import ReportCreationDialog from './ReportCreationDialog.jsx';
import ReportDeleteDialog from './ReportDeleteDialog.jsx';
import ReportDeliveryDialog from './ReportDeliveryDialog.jsx';
import { animate, createScope, stagger } from 'animejs';
import './ReportStudio.css';
import './ReportWeekly.css';
import './ReportCharts.css';
import './ReportLayout.css';
import './ReportProteinBulletin.css';
import { reportOutline } from '../lib/reportOutline.js';
import {reportHealth} from '../../../shared/report-health.mjs';
import {reportDownloadName} from '../../../shared/report-download-name.mjs';
import {reportRefreshLabel} from '../lib/reportRefreshLabel.js';
import { keepDialogFocus, restoreDialogFocus, isDialogBackdropClick } from '../lib/reportDialog.js';

const Icon = ({ name }) => <i className={`fas ${name}`} aria-hidden="true" />;
const PdfReportPreview = lazy(() => import('./PdfReportPreview.jsx'));
function ReportHealth({report}){
  const t=useReportText();if(report?.userEdition&&!report.baseReport)return null;
  const health=reportHealth(report);
  return <span className={'erh-data-health is-'+health.state}><b>{t(health.label)}</b>{health.asOf && <small>{t('Último dato')}: {health.asOf}</small>}{health.generatedAt && <small>{t('Corte')}: {new Date(health.generatedAt).toLocaleString(t.locale,{timeZone:'America/Mexico_City',dateStyle:'short',timeStyle:'short'})}</small>}</span>;
}

function ReportDialog({ open, onClose, title, children }) {
  const t=useReportText();
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!open) return undefined;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = overflow; restoreDialogFocus(previous); };
  }, [open]);
  return <dialog ref={ref} className="erh-modal-paper" aria-labelledby="erh-expanded-title" onKeyDown={keepDialogFocus} onCancel={onClose} onClick={event => { if (isDialogBackdropClick(event)) onClose(); }}>
    <header><div><span>{t("Lectura ampliada")}</span><h2 id="erh-expanded-title">{title}</h2></div><button type="button" aria-label={t("Cerrar lectura ampliada")} onClick={onClose}><Icon name="fa-xmark" /></button></header>
    {open && <div className="erh-modal-body">{children}</div>}
  </dialog>;
}

function ReportPdfStage({p,reading,t}){
 if(!p.pdfPreviewUrl)return <div className="erh-pdf-stage notranslate" translate="no" lang={p.language}><div className="erh-pdf-notice" role={p.pdfPreviewError ? 'alert' : 'status'}><p>{p.pdfPreviewError || t('Generando la vista previa del PDF…')}</p>{p.pdfPreviewError && <button type="button" className="erh-secondary-button" disabled={p.pdfPreviewLoading || p.localizingReport || Boolean(p.localizationError)} onClick={()=>void p.openPdfPreview()}>{t('Reintentar')}</button>}</div></div>;
 return <div className="erh-pdf-stage notranslate" translate="no" lang={p.language}><div className="erh-pdf-actions"><span>{t('Abre el documento en otra pestaña o guarda esta edición.')}</span><a onClick={p.openPdfFile} href={p.pdfPreviewUrl} target="_blank" rel="noopener noreferrer">{t('Abrir PDF')}</a><a onClick={event=>{event.preventDefault();void p.downloadPdf(event);}} href={p.pdfPreviewUrl} download={reportDownloadName(p.active,'pdf',{language:p.language,title:reading?.title})}>{t('Guardar PDF')}</a></div><Suspense fallback={<p className="erh-pdf-notice" role="status">{t('Cargando el visor PDF…')}</p>}><PdfReportPreview key={p.pdfPreviewUrl} url={p.pdfPreviewUrl} title={reading?.title || p.active.title} /></Suspense></div>;
}

export default function ReportWorkspace(props) {
  const p = props;
  const t=useMemo(()=>reportText(p.language),[p.language]);
  const reading=p.localizedReport;
  const outputBlocked=!p.accountEmail || p.localizingReport || Boolean(p.localizationError);
  const observed=new Date(reading?.generatedAt || p.active?.generatedAt);
  const readingCut=Number.isFinite(observed.getTime()) ? `${t('Corte')}: ${observed.toLocaleString(t.locale,{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'})}` : t('Corte disponible');
  const rootRef = useRef(null);
  const activeKey = p.active?.key;
  const editionHeadingRef = useRef(null);
  const newReportButtonRef = useRef(null);
  const previousOpen = useRef(Boolean(p.contentDraft));
  const [selectedBlock, setSelectedBlock] = useState('summary');
  const [pdfMode, setPdfMode] = useState(true);
  const autoPreview=useRef('');
  const [search, setSearch] = useState('');
  const blocks = reportOutline(p.active, p.chapters);
  const cardTitle=report=>report.key===p.active?.key && reading ? reading.title : report.userEdition ? report.title : t(report.title);
  const cardEyebrow=report=>report.key===p.active?.key && reading ? reading.eyebrow : t(report.eyebrow || 'Informe ejecutivo');
  const filteredReports = p.reports.filter(report => `${report.title} ${report.eyebrow || ''} ${cardTitle(report)} ${cardEyebrow(report)}`.toLocaleLowerCase(t.locale).includes(search.toLocaleLowerCase(t.locale)));
  const showPdf = pdfMode;
  const creatingReport = Boolean(p.contentDraft);
  const identity = p.active?.personalization || {};
  const phase = p.aiEditorProps.generating ? 1 : p.aiEditorProps.pending ? 0 : p.contentDraft ? (p.contentDraft.aiEdition ? 2 : 0) : p.active?.userEdition ? 2 : 0;
  const editionState = p.aiEditorProps.generating ? 'Generando tu versión' : p.aiEditorProps.pending ? 'Pedido pendiente' : p.contentDraft ? 'Borrador sin guardar' : p.active?.userEdition ? 'Informe guardado' : 'Informe base';
  const previewKey=p.pdfPreviewKey || JSON.stringify([p.area,activeKey,p.active?.generatedAt,p.active?.editionVersion,p.language]);
  const requestPdfPreview=p.openPdfPreview;

  useEffect(()=>{setPdfMode(!creatingReport);},[p.area,activeKey,creatingReport]);
  useEffect(()=>{autoPreview.current='';},[previewKey]);
  useEffect(()=>{
    if(!pdfMode || !activeKey || outputBlocked || p.sessionChanged || p.preferencesHydrated===false || p.aiEditorProps.pending || p.aiEditorProps.generating || p.pdfPreviewUrl || p.pdfPreviewLoading || p.downloadingPdf || p.downloadingData || typeof requestPdfPreview!=='function' || autoPreview.current===previewKey)return undefined;
    const timer=window.setTimeout(()=>{autoPreview.current=previewKey;void requestPdfPreview();},250);
    return ()=>window.clearTimeout(timer);
  },[pdfMode,activeKey,previewKey,outputBlocked,p.sessionChanged,p.preferencesHydrated,p.aiEditorProps.pending,p.aiEditorProps.generating,p.pdfPreviewUrl,p.pdfPreviewLoading,p.downloadingPdf,p.downloadingData,requestPdfPreview]);

  useEffect(() => {
    if (!activeKey || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const scope = createScope({ root: rootRef.current }).add(() => {
      animate('.erh-document-header, .erh-document-block', { opacity: [0, 1], translateY: [12, 0], duration: 430, delay: stagger(35), ease: 'outCubic' });
    });
    return () => scope.revert();
  }, [p.area, activeKey]);

  useEffect(()=>{
    rootRef.current?.querySelector('.erh-document')?.scrollTo({top:0,behavior:'instant'});
    setSelectedBlock('summary');
  },[p.area,activeKey]);

  useEffect(() => {
    const viewport = rootRef.current?.querySelector('.erh-document');
    const elements = [...(viewport?.querySelectorAll('.erh-document-block') || [])];
    if (!elements.length || showPdf) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = viewport.getBoundingClientRect().top + 25;
      let current = elements[0];
      for (const element of elements) {
        if (element.getBoundingClientRect().top <= top) current = element;
        else break;
      }
      // La última sección puede quedar más abajo cuando ya no hay espacio para desplazar.
      if (viewport.scrollTop > 0 && viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2) current = elements.at(-1);
      setSelectedBlock(current.id.replace('erh-document-', ''));
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(viewport);
    elements.forEach(element => observer?.observe(element));
    viewport.addEventListener('scroll', schedule, {passive:true});
    window.addEventListener('resize', schedule);
    schedule();
    return () => { observer?.disconnect(); viewport.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); window.cancelAnimationFrame(frame); };
  }, [p.area, p.active?.key, p.preferences, p.contentDraft, showPdf,reading]);

  useEffect(() => {
    if (showPdf) return;
    const index = rootRef.current?.querySelector('.erh-document-tools nav');
    const current = index?.querySelector('[aria-current="location"]');
    if (!current) return;
    const bounds = index.getBoundingClientRect(), button = current.getBoundingClientRect();
    if (button.left < bounds.left) index.scrollLeft += button.left - bounds.left - 8;
    else if (button.right > bounds.right) index.scrollLeft += button.right - bounds.right + 8;
  }, [selectedBlock, showPdf]);

  useEffect(() => {
    if (creatingReport && !previousOpen.current) {
      editionHeadingRef.current?.focus({ preventScroll: true });
      if (window.innerWidth < 1000) editionHeadingRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    } else if (!creatingReport && previousOpen.current) newReportButtonRef.current?.focus({ preventScroll: true });
    previousOpen.current = creatingReport;
  }, [creatingReport]);

  const jumpToBlock = key => {
    const block = rootRef.current?.querySelector(`#erh-document-${key}`);
    const viewport=rootRef.current?.querySelector('.erh-document');
    block?.focus({ preventScroll: true });
    if(block && viewport) viewport.scrollTo({top:viewport.scrollTop+block.getBoundingClientRect().top-viewport.getBoundingClientRect().top-24,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    setSelectedBlock(key);
  };
  const reviewResult = () => {
    setPdfMode(false);
    window.requestAnimationFrame(() => {
      const document = rootRef.current?.querySelector('.erh-document');
      document?.scrollTo({top:0,behavior:'instant'});
      document?.focus({ preventScroll: true });
      rootRef.current?.querySelector('.erh-document-column')?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
  };

  const areaKeyDown = event => {
    const keys = Object.keys(p.areas);
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? keys[0] : event.key === 'End' ? keys.at(-1) : keys[(keys.indexOf(p.area) + (event.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
    setSearch(''); p.changeArea(next);
    rootRef.current?.querySelector(`#erh-tab-${next}`)?.focus();
  };

  return <ReportLocaleContext.Provider value={t}><section className="erh erh-studio" lang={p.language} data-report-language={p.language} ref={rootRef} aria-label={t("Espacio de trabajo de informes")}>
    {p.sessionChanged && <div className="erh-draft-recovery" role="alert"><div><Icon name="fa-user-lock" /><span><strong>{t("La sesión cambió de cuenta")}</strong><small>{t("Recarga para continuar con la cuenta actual. El borrador anterior se conserva para su propietario en esta pestaña.")}</small></span></div><button type="button" className="erh-secondary-button" onClick={()=>window.location.reload()}>{t("Recargar cuenta")}</button></div>}
    {!p.sessionChanged && p.deliveryOpen && <ReportDeliveryDialog props={p} onClose={p.closeDelivery} />}
    {!p.sessionChanged && p.creationOpen && <ReportCreationDialog accountEmail={p.accountEmail} currentPreview={{collection:p.area,key:p.active?.key,report:reading,pending:p.localizingReport,error:p.localizationError,retry:p.retryLocalization}} initialCollection={p.area} initialKey={p.baseActive?.key} reportSets={p.reportSets} onCreate={p.startReport} onClose={p.closeCreation} />}
    {!p.sessionChanged && p.deleteTarget && <ReportDeleteDialog report={p.deleteTarget} deleting={p.deletingReport} error={p.deleteError} onConfirm={p.deleteReport} onClose={p.closeDelete} onRefresh={p.refreshAfterDeleteError} />}
    <div className="erh-collection-toolbar notranslate" translate="no"><div className="erh-switch" role="tablist" aria-label={t("Familia de informes")} onKeyDown={areaKeyDown}>{Object.entries(p.areas).map(([key, item]) => <button id={`erh-tab-${key}`} key={key} type="button" role="tab" disabled={p.sessionChanged} tabIndex={p.area === key ? 0 : -1} aria-selected={p.area === key} aria-controls="erh-library-panel" onClick={() => { setSearch(''); p.changeArea(key); }}><Icon name={item.icon} />{t(item.label)}<small>{p.sessionChanged ? "—" : p.reportSets[key]?.data?.length ?? '—'}</small></button>)}</div><div className="erh-library-actions">{p.area!=='mine' && <button type="button" className="erh-secondary-button" disabled={p.sessionChanged || p.refreshingReports || Boolean(p.contentDraft)} aria-busy={p.refreshingReports || undefined} onClick={p.retryReports}><Icon name={p.refreshingReports ? "fa-spinner fa-spin" : "fa-rotate"} />{t(p.refreshingReports ? "Actualizando datos…" : "Actualizar datos")}</button>}<button type="button" className="erh-secondary-button erh-program-button" disabled={p.sessionChanged || !p.accountEmail || p.aiEditorProps.generating || p.savingContent || p.aiEditorProps.pending} onClick={p.openDelivery}><Icon name="fa-calendar-check" />{t("Programar reportes")}</button><button ref={newReportButtonRef} type="button" className="erh-secondary-button" disabled={p.sessionChanged || Boolean(p.contentDraft || p.recoverableDraft) || !p.accountEmail} onClick={() => { setPdfMode(false); p.newReport(); }}><Icon name="fa-plus" />{t("Nuevo informe")}</button></div><span className="erh-next-cut"><Icon name="fa-clock" />{reportRefreshLabel(p.nextRefreshAt,p.area,{locale:t.locale,t})}</span></div>
    {p.recoverableDraft && !p.contentDraft && <section className="erh-draft-recovery" aria-label={t("Borrador pendiente")}><div><Icon name="fa-file-pen" /><span><strong>{t("Tienes un borrador pendiente")}</strong><small>{p.recoverableDraft.preferences?.customTitle || p.recoverableDraft.report.title}{t("· Conservado en esta pestaña")}</small></span></div><button type="button" className="erh-secondary-button" onClick={p.resumeDraft}>{t("Continuar borrador")}</button><button type="button" className="erh-secondary-button" onClick={p.discardRecovery}>{t("Descartar borrador")}</button></section>}
    {!p.sessionChanged && !p.contentDraft && p.draftStorageStatus==='invalid' && <p className="erh-status" role="alert">{t("No pudimos recuperar el borrador temporal porque sus datos están incompletos. Tus informes guardados siguen disponibles.")}</p>}
    <div id="erh-library-panel" className="notranslate" translate="no" role="tabpanel" aria-labelledby={`erh-tab-${p.area}`}>
      {p.pendingCut && <div className="erh-new-cut" role="status"><span>{t('Hay un corte nuevo disponible. Tu lectura actual se conserva.')}</span><button type="button" onClick={p.applyPendingCut}>{t('Abrir nuevo corte')}</button></div>}
      <div className="erh-collection-heading"><div><span className="erh-eyebrow">{t("01 · Selecciona un informe")}</span><h2>{p.area === 'mine' ? t("Mis informes guardados") : t(`Tu biblioteca de ${p.areas[p.area].label.toLowerCase()}`)}</h2></div><label className="erh-search"><Icon name="fa-magnifying-glass" /><input type="search" aria-label={t("Buscar informe")} value={search} onChange={event => setSearch(event.target.value)} placeholder={t("Buscar en esta colección")} /></label></div>
      {p.area === 'mine' && p.reportSets.mine?.storage === 'temporary_runtime' && <p role="status" className="erh-status">{t("Este servidor conserva los informes de forma temporal. Descarga tu PDF para conservar una copia.")}</p>}
      {p.reportSets[p.area]?.stale && <p role="status" className="erh-status">{t("Mostramos el último corte disponible. Revisa la fecha del informe y de cada dato antes de utilizarlo.")}</p>}
      <div className="erh-books" aria-label={t("Informes disponibles")} aria-busy={p.loading}>
        {p.loading ? <div className="erh-loading" role="status"><Icon name="fa-spinner fa-spin" />{t("Cargando los informes del último corte…")}</div> : filteredReports.map((report, index) => <div key={report.key} className="erh-library-entry"><button type="button" className={`erh-book${p.active?.key === report.key ? ' is-active' : ''}`} aria-pressed={p.active?.key === report.key} onClick={() => { setPdfMode(true); p.selectReport(report); }}><div><span>{String(index + 1).padStart(2, '0')}</span><Icon name={p.active?.key === report.key ? "fa-circle-check" : p.areas[p.area].icon} /></div><strong>{cardTitle(report)}</strong><small>{cardEyebrow(report)}</small><ReportHealth report={report} /><span className="erh-book-state">{p.active?.key === report.key ? t("Estás revisando este informe") : t("Seleccionar informe")}<Icon name="fa-arrow-right" /></span></button>{p.area==='mine' && report.editionId && <button type="button" className="erh-delete-card" aria-label={`Eliminar informe ${report.title}`} disabled={Boolean(p.contentDraft) || p.aiEditorProps.generating || p.savingContent || p.deletingReport} onClick={()=>p.requestDelete(report)}><Icon name="fa-trash-can" />{t("Eliminar")}</button>}</div>)}
      </div>
      {p.libraryError && p.reports.length>0 && <div className="erh-status"><span role="alert">{p.libraryError} {t("El informe abierto sigue disponible.")}</span><button type="button" className="erh-secondary-button" onClick={p.retryReports}>{t("Actualizar biblioteca")}</button></div>}
      {!p.sessionChanged && !p.loading && !filteredReports.length && <div className="erh-empty"><Icon name="fa-folder-open" /><h3>{p.reports.length ? t("No encontramos ese informe") : p.libraryError ? t("No pudimos cargar la biblioteca") : t("No hay informes disponibles")}</h3><p role={p.libraryError ? "alert" : undefined}>{p.reports.length ? t("Prueba con otra palabra o limpia la búsqueda.") : p.status}</p><button type="button" className="erh-secondary-button" onClick={p.reports.length ? () => setSearch('') : p.retryReports}>{p.reports.length ? t("Limpiar búsqueda") : t("Volver a intentar")}</button></div>}
    </div>
    {p.opening.pending && <div className="erh-loading" role="status" aria-busy="true"><Icon name="fa-spinner fa-spin" />{t("Cargando el contenido completo de")} {p.opening.title}{"…"}</div>}
    {p.opening.error && <div className="erh-empty"><p role="alert">{p.opening.error}</p><button type="button" className="erh-secondary-button" onClick={p.retryOpening}>{t("Reintentar apertura")}</button></div>}
    {p.active && <>
      {!creatingReport && identity.sections?.tables===false && <div className="erh-tables-notice" role="status"><p>{t('Las tablas están desactivadas en esta edición.')}</p><button type="button" className="erh-secondary-button" disabled={outputBlocked || !p.preferencesHydrated} onClick={p.restoreTables}><Icon name="fa-table-list" />{t('Mostrar tablas de datos')}</button></div>}
      {creatingReport && <ol className="erh-workflow" aria-label={t("Crear un informe")}>{[['fa-sliders','Describe tu informe','Objetivo, contenido y audiencia'],['fa-wand-magic-sparkles','Genera con ORION','Un informe a tu medida'],['fa-file-circle-check','Revisa y guarda','Listo para compartir']].map(([icon,title,note],index)=>{const complete=index===0 ? phase>0 : index===1 ? Boolean(p.active.aiEdition && !p.aiEditorProps.generating) : false;return <li key={title} aria-current={phase===index ? "step" : undefined} className={complete ? "is-complete" : ''}><span><Icon name={complete ? "fa-check" : icon} /></span><div><strong>{t(title)}</strong><small>{t(note)}</small></div><b>{String(index+1).padStart(2,'0')}</b></li>;})}</ol>}
      <div className="erh-workbar notranslate" translate="no"><div><span className="erh-eyebrow">{creatingReport ? t("02 · Revisa tu nuevo informe") : t("02 · Lectura del informe")}</span><strong className="notranslate" translate="no">{reading?.title || cardTitle(p.active)}</strong><small className="notranslate" translate="no">{readingCut}</small></div><div className="erh-workbar-actions">{p.onAnnex && p.active && <button type="button" className="erh-secondary-button" disabled={outputBlocked} onClick={()=>p.onAnnex(p.active)}>{t("Ver anexos")}</button>}{p.area==='mine' && p.active.editionId && !creatingReport && <button type="button" className="erh-secondary-button" disabled={p.deletingReport} onClick={()=>p.requestDelete(p.baseActive)}><Icon name="fa-trash-can" />{t("Eliminar informe")}</button>}<button type="button" className="erh-download" disabled={outputBlocked || p.pdfPreviewLoading || p.downloadingPdf || p.downloadingData || p.aiEditorProps.pending || p.aiEditorProps.generating} onClick={p.downloadPdf}><Icon name="fa-download" />{t("Descargar PDF")}</button></div></div>
      <div className={`erh-review-layout${creatingReport ? ' has-composer' : ''}`}>
        <div className="erh-document-column"><div className="erh-document-tools notranslate" translate="no"><div className="erh-preview-heading"><span><Icon name="fa-file-lines" />{t("Vista previa")}</span><small className={`erh-edition-badge${p.aiEditorProps.generating ? ' is-generating' : p.contentDraft || p.aiEditorProps.pending ? ' is-draft' : ''}`}><Icon name={p.aiEditorProps.generating ? "fa-spinner fa-spin" : p.contentDraft || p.aiEditorProps.pending ? "fa-circle-dot" : "fa-circle-check"} />{t(editionState)}</small></div><nav aria-label={t("Índice del informe")}>{blocks.map(block => <button key={block.key} type="button" aria-current={!showPdf && selectedBlock === block.key ? "location" : undefined} disabled={Boolean(showPdf)} onClick={() => jumpToBlock(block.key)}><Icon name={block.icon} />{t(block.label)}{block.count != null && <small>{block.count}</small>}</button>)}</nav><div className="erh-view-tools"><button type="button" aria-pressed={!showPdf} onClick={() => setPdfMode(false)}>{t("Lectura")}</button><button type="button" disabled={outputBlocked || p.downloadingPdf || p.pdfPreviewLoading || p.aiEditorProps.pending || p.aiEditorProps.generating} aria-pressed={Boolean(showPdf)} onClick={() => { setPdfMode(true); void p.openPdfPreview(); }}><Icon name={p.pdfPreviewLoading ? "fa-spinner fa-spin" : "fa-file-pdf"} />{p.pdfPreviewLoading ? t("Preparando…") : t("Ver PDF")}</button><button type="button" className="erh-expand" aria-label={t("Ampliar lectura del informe")} disabled={outputBlocked} onClick={() => p.setPreviewOpen(true)}><Icon name="fa-expand" /></button></div></div>
          {p.localizingReport ? <div className="erh-localization-state notranslate" translate="no" lang={p.language} role="status">{t("Traduciendo el informe…")}</div> : p.localizationError ? <div className="erh-localization-state"><p role="alert">{p.localizationError}</p><button type="button" onClick={p.retryLocalization}>{t("Reintentar traducción")}</button></div> : showPdf ? <ReportPdfStage p={p} reading={reading} t={t} /> : <article className="erh-document notranslate" translate="no" lang={p.language} tabIndex={0} aria-label={`Contenido completo de ${p.active.title}`}><header className="erh-document-header"><div className="erh-document-brand"><span>{"VALL"}<span>{"NEWS"}</span></span><small>{t('Inteligencia económica').toLocaleUpperCase(t.locale)}</small><b>{t(p.aiEditorProps.pending ? 'Encargo pendiente de generar' : p.active.aiEdition ? 'Edición generada con IA' : p.contentDraft ? 'Cambios sin guardar' : p.active.userEdition ? 'Tu informe guardado' : p.isPersonalized ? 'Tu edición personalizada' : 'Edición base')}</b></div><p className="erh-eyebrow">{reading?.eyebrow || t('Informe ejecutivo')}</p><h2>{reading?.title}</h2><div className="erh-document-meta"><span><Icon name="fa-calendar" />{readingCut}</span><span><Icon name="fa-layer-group" />{t('{count} bloques disponibles',{count:blocks.length})}</span>{identity.recipientName && <span>{t('Preparado para')} {identity.recipientName}{identity.organization ? ` · ${identity.organization}` : ''}</span>}</div></header>{reading && p.renderReport(reading, 'erh-document')}<footer className="erh-document-footer"><span>VALLNEWS · {t('Inteligencia económica')}</span><span>{t(identity.confidentiality === 'confidential' ? 'Confidencial' : identity.confidentiality === 'shareable' ? 'Compartible' : 'Uso interno')}</span></footer></article>}
        </div>
        {creatingReport && <div id="erh-creation-panel"><ReportCreationComposer saveIssue={p.saveIssue} draftStorageStatus={p.draftStorageStatus} onPause={p.pauseDraft} documentTitle={p.active.title} report={p.contentDraft} onSave={p.saveContent} onCancel={p.cancelCreation} saving={p.savingContent} generating={p.aiEditorProps.generating} aiAction={<ReportAiGenerateAction {...p.aiEditorProps} />} status={p.status} headingRef={editionHeadingRef} onReview={reviewResult} pending={p.aiEditorProps.pending} aiEditor={<ReportAiEditor {...p.aiEditorProps} />} /></div>}
      </div>
    </>}
    <p className="erh-status" role="status"><Icon name="fa-circle-info" />{p.status}</p>
    <ReportDialog open={p.previewOpen && Boolean(p.active)} onClose={() => p.setPreviewOpen(false)} title={reading?.title}>{reading && <div className="notranslate" translate="no" lang={p.language}>{p.renderReport(reading, 'erh-expanded')}</div>}</ReportDialog>
  </section></ReportLocaleContext.Provider>;
}
