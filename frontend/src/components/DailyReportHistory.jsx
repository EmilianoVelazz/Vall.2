import {useEffect,useMemo,useRef,useState} from 'react';
import {ReportReader} from './ExecutiveReportsHub.jsx';
import {ReportLocaleContext,reportText} from '../lib/reportLocale.jsx';
import useIdioma from '../lib/idioma.js';
import {useLocalizedReport} from '../lib/useLocalizedReport.js';
import {reportJsonRequest,verifyReportOwner} from '../lib/reportRequest.js';
import {reportDownloadName} from '../../../shared/report-download-name.mjs';
import {isReportDocument} from '../lib/reportDataValidation.js';
import {requestReportPdf,requestReportFile} from '../lib/reportPdf.js';
import {reportCsv} from '../lib/reportCsv.js';
import {saveReportBlob,REPORT_LIBRARY} from '../lib/reportLibrary.js';
import collections from '../../../shared/report-collections.json';
export default function DailyReportHistory({accountEmail,onAnnex}){
  const [language]=useIdioma(),t=useMemo(()=>reportText(language),[language]);
  const [area,setArea]=useState('markets'),[key,setKey]=useState('proteins'),[date,setDate]=useState(''),[items,setItems]=useState([]),[report,setReport]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  const openRequest=useRef(null),exportRequest=useRef(null);
  useEffect(()=>{
    const controller=new AbortController();openRequest.current?.abort();setLoading(true);setError('');setReport(null);setItems([]);
    const query=new URLSearchParams({area,...(key?{key}:{}),...(date?{date}:{})});
    reportJsonRequest('/api/report-history?'+query,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setItems(value.data || []);}).catch(()=>{if(!controller.signal.aborted)setError('No se pudo consultar el historial.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[area,key,date,retry,accountEmail]);
  useEffect(()=>{exportRequest.current?.abort();setBusy(false);return ()=>{openRequest.current?.abort();exportRequest.current?.abort();};},[language,accountEmail]);
  const localized=useLocalizedReport(report,report?.title || '',language,accountEmail),reading=localized.report;
  const open=async id=>{
    openRequest.current?.abort();const controller=new AbortController();openRequest.current=controller;setReport(null);setError('');setLoading(true);
    try{const value=await reportJsonRequest('/api/report-history/'+id,{signal:controller.signal});if(!isReportDocument(value.data))throw Error('Edición inválida');if(!controller.signal.aborted)setReport(value.data);}
    catch{if(!controller.signal.aborted)setError('No se pudo abrir la edición.');}
    finally{if(!controller.signal.aborted)setLoading(false);}
  };
  const download=async format=>{
    if(!report||!accountEmail||exportRequest.current||busy||localized.pending||localized.error)return;const controller=new AbortController();exportRequest.current=controller;setBusy(true);
    try{await verifyReportOwner(accountEmail,controller.signal);const options={signal:controller.signal,language,expectedOwner:accountEmail};const blob=format==='pdf'?await requestReportPdf(report,report.title,report.summary,fetch,options):language==='es'?new Blob([reportCsv(report)],{type:'text/csv;charset=utf-8'}):await requestReportFile(report,report.title,report.summary,'csv',fetch,options);if(!controller.signal.aborted)saveReportBlob(blob,reportDownloadName(report,format,{language,title:reading?.title}));}
    catch{if(!controller.signal.aborted)setError('No se pudo preparar la descarga. Vuelve a intentarlo.');}
    finally{if(exportRequest.current===controller){setBusy(false);exportRequest.current=null;}}
  };
  return <ReportLocaleContext.Provider value={t}><section className="erh erh-studio reports-archive notranslate" translate="no" lang={language}>
    <header className="reports-section-heading"><div><h2>{t('Historial diario')}</h2><p>{t('Consulta las ediciones guardadas por fecha y corte. Cada informe conserva su comparación de una sola sesión.')}</p></div></header>
    <div className="reports-annex-filters"><label>{t('Familia')}<select value={area} aria-label={t('Familia del historial')} onChange={event=>{setArea(event.target.value);setKey('');}}>{['finance','markets','mexico'].map(value=><option key={value} value={value}>{t(collections[value].label)}</option>)}</select></label><label>{t('Informe')}<select aria-label={t('Informe del historial')} value={key} onChange={event=>setKey(event.target.value)}><option value="">{t('Todos los informes')}</option>{collections[area].reportKeys.map(value=><option key={value} value={value}>{t(REPORT_LIBRARY.reports[area][value])}</option>)}</select></label><label>{t('Fecha del corte')}<input type="date" value={date} aria-label={t('Fecha del corte')} onChange={event=>setDate(event.target.value)} /></label></div>
    {error && <p className="reports-message" role="alert">{t(error)}</p>}{loading && <p className="reports-message" role="status">{t('Cargando las ediciones…')}</p>}
    <div className="reports-archive-books">{items.map(item=><button type="button" className="reports-archive-book" key={item.id} onClick={()=>open(item.id)}><strong>{t(REPORT_LIBRARY.reports[item.collection][item.key])}</strong><span>{new Date(item.generatedAt).toLocaleString(t.locale,{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'})}</span></button>)}</div>
    {!loading&&!items.length&&!error && <p className="reports-message">{t('No hay ediciones guardadas para estos filtros. El historial registra los cortes disponibles desde su activación.')}</p>}
    <button type="button" className="erh-secondary-button" onClick={()=>setRetry(value=>value+1)}>{t('Actualizar historial')}</button>
    {report && <article className="reports-archive-document"><header><div><h3>{reading?.title || t(report.title)}</h3><p>{t('Corte')}: {new Date(report.generatedAt).toLocaleString(t.locale,{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'})}</p></div><div className="reports-document-actions"><button type="button" disabled={busy||localized.pending||Boolean(localized.error)} onClick={()=>download('pdf')}>{t('Descargar PDF')}</button><button type="button" disabled={busy||localized.pending||Boolean(localized.error)} onClick={()=>download('csv')}>{t('Descargar datos CSV')}</button><button type="button" onClick={()=>onAnnex(report)}>{t('Ver anexos')}</button></div></header><div className="reports-archive-paper">{localized.pending?<p role="status">{t('Traduciendo el informe…')}</p>:localized.error?<div role="alert"><p>{t('No se pudo traducir la vista previa.')}</p><button type="button" onClick={localized.retry}>{t('Reintentar traducción')}</button></div>:reading&&<ReportReader report={reading} prefix="history-document" />}</div></article>}
  </section></ReportLocaleContext.Provider>;
}
