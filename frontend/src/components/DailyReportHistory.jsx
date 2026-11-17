import HistoricalReportComparison from './HistoricalReportComparison.jsx';
import ReportDownloadMenu from './ReportDownloadMenu.jsx';
import {useReportExport} from '../lib/useReportExport.js';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ReportReader} from './ExecutiveReportsHub.jsx';
import {ReportLocaleContext,reportText} from '../lib/reportLocale.jsx';
import useIdioma from '../lib/idioma.js';
import {useLocalizedReport} from '../lib/useLocalizedReport.js';
import {reportJsonRequest} from '../lib/reportRequest.js';
import {isReportDocument} from '../lib/reportDataValidation.js';
import {REPORT_LIBRARY} from '../lib/reportLibrary.js';
import collections from '../../../shared/report-collections.json';
import {loadReportHistoryPage} from '../lib/reportHistory.js';
export default function DailyReportHistory({accountEmail,onAnnex}){
  const [language]=useIdioma(),t=useMemo(()=>reportText(language),[language]);
  const [area,setArea]=useState('markets'),[key,setKey]=useState('proteins'),[date,setDate]=useState(''),[items,setItems]=useState([]),[report,setReport]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0);
  const [cursor,setCursor]=useState(null),[loadingMore,setLoadingMore]=useState(false);
  const openRequest=useRef(null),listRequest=useRef(null);
  useEffect(()=>{
    listRequest.current?.abort();const controller=new AbortController();listRequest.current=controller;openRequest.current?.abort();setLoading(true);setLoadingMore(false);setError('');setReport(null);setItems([]);setCursor(null);
    if(accountEmail)loadReportHistoryPage({area,key,date},{signal:controller.signal,owner:accountEmail}).then(page=>{if(!controller.signal.aborted){setItems(page.data);setCursor(page.nextCursor);}}).catch(issue=>{if(!controller.signal.aborted)setError(issue.message);}).finally(()=>{if(listRequest.current===controller){listRequest.current=null;setLoading(false);}});
    else {listRequest.current=null;setLoading(false);}
    return ()=>{controller.abort();listRequest.current?.abort();};
  },[area,key,date,retry,accountEmail]);
  useEffect(()=>()=>openRequest.current?.abort(),[accountEmail]);
  const more=async()=>{
    if(!cursor || !accountEmail || listRequest.current || loading)return;
    const controller=new AbortController();listRequest.current=controller;setLoadingMore(true);setError('');
    try{const page=await loadReportHistoryPage({area,key,date,cursor},{signal:controller.signal,owner:accountEmail});if(!controller.signal.aborted){setItems(current=>[...new Map([...current,...page.data].map(item=>[item.id,item])).values()]);setCursor(page.nextCursor);}}
    catch(issue){if(!controller.signal.aborted)setError(issue.message);}
    finally{if(listRequest.current===controller){listRequest.current=null;setLoadingMore(false);}}
  };
  const localized=useLocalizedReport(report,report?.title || '',language,accountEmail),reading=localized.report;
  const open=async id=>{
    openRequest.current?.abort();const controller=new AbortController();openRequest.current=controller;setReport(null);setError('');setLoading(true);
    try{const value=await reportJsonRequest('/api/report-history/'+id,{signal:controller.signal});if(!isReportDocument(value.data))throw Error('Edición inválida');if(!controller.signal.aborted)setReport(value.data);}
    catch{if(!controller.signal.aborted)setError('No se pudo abrir la edición.');}
    finally{if(!controller.signal.aborted)setLoading(false);}
  };
  const exported=useReportExport(report,accountEmail,language,reading?.title);
  return <ReportLocaleContext.Provider value={t}><section className="erh erh-studio reports-archive notranslate" translate="no" lang={language}>
    <header className="reports-section-heading"><div><h2>{t('Historial diario')}</h2><p>{t('Consulta las ediciones guardadas por fecha y corte. Cada informe conserva su comparación de una sola sesión.')}</p></div></header>
    <div className="reports-annex-filters"><label>{t('Familia')}<select value={area} aria-label={t('Familia del historial')} onChange={event=>{setArea(event.target.value);setKey('');}}>{['finance','markets','mexico'].map(value=><option key={value} value={value}>{t(collections[value].label)}</option>)}</select></label><label>{t('Informe')}<select aria-label={t('Informe del historial')} value={key} onChange={event=>setKey(event.target.value)}><option value="">{t('Todos los informes')}</option>{collections[area].reportKeys.map(value=><option key={value} value={value}>{t(REPORT_LIBRARY.reports[area][value])}</option>)}</select></label><label>{t('Fecha del corte')}<input type="date" value={date} aria-label={t('Fecha del corte')} onChange={event=>setDate(event.target.value)} /></label></div>
    <HistoricalReportComparison area={area} reportKey={key} accountEmail={accountEmail} t={t} />
    {(exported.error) && <p className="reports-message" role="alert">{exported.error}</p>}
    {error && <p className="reports-message" role="alert">{t(error)}</p>}{loading && <p className="reports-message" role="status">{t('Cargando las ediciones…')}</p>}
    <div className="reports-archive-books">{items.map(item=><button type="button" className="reports-archive-book" key={item.id} onClick={()=>open(item.id)}><strong>{t(REPORT_LIBRARY.reports[item.collection][item.key])}</strong><span>{new Date(item.generatedAt).toLocaleString(t.locale,{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'})}</span></button>)}</div>
    {!loading&&!items.length&&!error && <p className="reports-message">{t('No hay ediciones guardadas para estos filtros. El historial registra los cortes disponibles desde su activación.')}</p>}
    {cursor && <button type="button" className="erh-secondary-button" disabled={loading || loadingMore} aria-busy={loadingMore || undefined} onClick={more}>{t(loadingMore ? 'Cargando las ediciones…' : 'Cargar más cortes')}</button>}
    <button type="button" className="erh-secondary-button" onClick={()=>setRetry(value=>value+1)}>{t('Actualizar historial')}</button>
    {report && <article className="reports-archive-document"><header><div><h3>{reading?.title || t(report.title)}</h3><p>{t('Corte')}: {new Date(report.generatedAt).toLocaleString(t.locale,{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'})}</p></div><div className="reports-document-actions"><ReportDownloadMenu key={report.key+report.generatedAt} t={t} busy={exported.busy} disabled={!accountEmail || localized.pending || Boolean(localized.error)} onDownload={exported.download} /><button type="button" onClick={()=>onAnnex(report)}>{t('Ver anexos')}</button></div></header><div className="reports-archive-paper">{localized.pending?<p role="status">{t('Traduciendo el informe…')}</p>:localized.error?<div role="alert"><p>{t('No se pudo traducir la vista previa.')}</p><button type="button" onClick={localized.retry}>{t('Reintentar traducción')}</button></div>:reading&&<ReportReader report={reading} prefix="history-document" />}</div></article>}
  </section></ReportLocaleContext.Provider>;
}
