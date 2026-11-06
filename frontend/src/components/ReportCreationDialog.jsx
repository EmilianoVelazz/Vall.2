import { useEffect, useRef, useState } from 'react';
import REPORT_COLLECTIONS from '../../../shared/report-collections.json';
import { reportJsonRequest } from '../lib/reportRequest.js';
import { reportSectorFormat } from '../lib/reportSectorFormat.js';
import { isReportLibrary } from '../lib/reportDataValidation.js';
import { keepDialogFocus, restoreDialogFocus, isDialogBackdropClick } from '../lib/reportDialog.js';
import {useReportText} from '../lib/reportLocale.jsx';
import {useLocalizedReport} from '../lib/useLocalizedReport.js';
import {reportDialogDate,reportDialogMessage} from '../lib/reportDialogLocale.js';

const collections = Object.entries(REPORT_COLLECTIONS).filter(([key]) => key !== 'mine');

export default function ReportCreationDialog({ initialCollection, initialKey, reportSets, accountEmail, currentPreview, onCreate, onClose }) {
  const t=useReportText(),dateLabel=value=>reportDialogDate(value,t);
  const dialog = useRef(null);
  const [collection, setCollection] = useState(initialCollection === 'mine' ? 'finance' : initialCollection);
  const [selected, setSelected] = useState(initialKey || '');
  const [snapshots, setSnapshots] = useState(reportSets);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const snapshot = snapshots[collection];
  const reports = (isReportLibrary(snapshot?.data) ? snapshot.data : []).filter(report => REPORT_COLLECTIONS[collection].reportKeys.includes(report.key) && !report.userEdition);
  const base = reports.find(report => report.key === selected) || reports[0];
  const format=reportSectorFormat(base,collection);
  const reusePreview=currentPreview?.collection===collection && currentPreview?.key===base?.key;
  const previewSource=base && !reusePreview ? {key:base.key,collection,title:base.title,eyebrow:base.eyebrow,summary:base.summary,generatedAt:base.generatedAt,sections:[],metrics:[],tables:[],visuals:[],sources:[],sourceLinks:[]} : null;
  const translated=useLocalizedReport(previewSource,base?.title || '',t.language,accountEmail);
  const localized=reusePreview ? currentPreview : translated;

  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current.showModal();
    return () => { document.body.style.overflow = overflow; restoreDialogFocus(previous); };
  }, []);

  useEffect(() => {
    setError('');
    if (snapshot && !snapshot.partial) { setLoading(false); return undefined; }
    const controller = new AbortController();
    setLoading(true);
    reportJsonRequest(REPORT_COLLECTIONS[collection].endpoint, { signal: controller.signal }, {
      errorMessage: 'No pudimos cargar los reportes base.', timeoutMessage: 'La colección tardó demasiado. Puedes reintentar o elegir otra.',
    }).then(payload => {
      if (!isReportLibrary(payload.data)) throw Error('La colección devolvió una respuesta incompleta.');
      if (!controller.signal.aborted) setSnapshots(current => ({ ...current, [collection]: payload }));
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [collection, snapshot, attempt]);

  return <dialog ref={dialog} className="erh-create-dialog notranslate" translate="no" lang={t.language} aria-labelledby="erh-create-title" onKeyDown={keepDialogFocus} onCancel={onClose} onClick={event => { if (isDialogBackdropClick(event)) onClose(); }}>
    <header><div><span className="erh-eyebrow">{t("Nuevo informe con ORION")}</span><h2 id="erh-create-title">{t("Elige tu reporte base")}</h2><p>{t("Empieza con datos de un corte o desde cero. Después podrás elegir contenido, enfoque y presentación.")}</p></div><button type="button" aria-label={t("Cerrar nuevo informe")} onClick={onClose}><i className="fas fa-xmark" aria-hidden="true" /></button></header>
    <div className="erh-create-steps" aria-label={t("Pasos para crear un informe")}><span aria-current="step"><b>1</b> {t("Elige tus datos")}</span><span><b>2</b> {t("Hazlo a tu medida")}</span><span><b>3</b> {t("Revisa y guarda")}</span></div>
    <div className="erh-create-collections" role="group" aria-label={t("Colección del reporte base")}>{collections.map(([key, item]) => <button type="button" key={key} aria-pressed={collection === key} onClick={() => { setCollection(key); setSelected(''); }}><i className={`fas ${item.icon}`} aria-hidden="true" />{t(item.label)}</button>)}</div>
    <div className="erh-create-body" aria-busy={loading}>
      {loading ? <p role="status"><i className="fas fa-spinner fa-spin" aria-hidden="true" /> {t("Cargando reportes base…")}</p> : error ? <div><p role="alert">{reportDialogMessage(t,error,undefined,'No pudimos cargar los reportes base.')}</p><button type="button" className="erh-secondary-button" onClick={() => setAttempt(value => value + 1)}>{t("Reintentar colección")}</button></div> : reports.length ? <div className="erh-create-bases" role="group" aria-label={t("Reportes base disponibles")}>{reports.map(report => <button type="button" key={report.key} aria-pressed={base?.key === report.key} onClick={() => setSelected(report.key)}><span><i className={`fas ${base?.key === report.key ? 'fa-circle-check' : 'fa-file-lines'}`} aria-hidden="true" />{t("Reporte base")}</span><strong>{base?.key===report.key && localized.report ? localized.report.title : t(report.title)}</strong><small>{base?.key===report.key && localized.report ? localized.report.eyebrow : t(report.eyebrow || 'Informe ejecutivo')}</small><small>{t("Corte:")} {dateLabel(report.generatedAt || snapshot.generatedAt)}</small></button>)}</div> : <p role="status">{t("No hay reportes base disponibles en esta colección.")}</p>}
      {!loading && !error && base && <section className="erh-create-selection" aria-label={t("Base seleccionada")}><strong>{localized.report?.title || t(base.title)}</strong>{localized.pending ? <p role="status">{t('Traduciendo el informe…')}</p> : localized.error ? <div><p role="alert">{reportDialogMessage(t,localized.error,undefined,'No se pudo completar la traducción del informe. Conservamos el original; vuelve a intentarlo.')}</p><button type="button" className="erh-secondary-button" onClick={localized.retry}>{t('Reintentar traducción')}</button></div> : <p>{localized.report?.summary || t('Usarás el análisis y los datos disponibles de este corte.')}</p>}<ul><li>{base.metrics?.length || 0} {t("indicadores")}</li><li>{base.tables?.length || 0} {t("tablas")}</li><li>{base.visuals?.length || 0} {t("gráficas")}</li></ul>{format && <details className="erh-sector-format"><summary>{t("Qué cubre el formato ·")} {t(format.label)}</summary><ul aria-label={t("Frentes del nuevo informe")}>{format.topics.map(topic=><li key={topic.heading}><strong>{t(topic.heading)}</strong><span>{t(topic.question)}</span></li>)}</ul><p>{t("El nivel detallado desarrolla estos frentes según la evidencia y el objetivo del usuario.")}</p></details>}</section>}
    </div>
    <footer><p>{t("Describe qué necesitas y ORION creará un informe nuevo con estos datos. Revísalo y guárdalo en Mis informes.")}</p><button type="button" className="erh-download" disabled={loading || Boolean(error) || !base} onClick={() => onCreate(collection, base)}><i className="fas fa-arrow-right" aria-hidden="true" />{t("Crear con esta base")}</button><button type="button" className="erh-secondary-button" onClick={() => onCreate(null, null)}>{t("Crear desde cero")}</button></footer>
  </dialog>;
}
