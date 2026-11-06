import useIdioma from '../lib/idioma.js';
import {useLocalizedReport} from '../lib/useLocalizedReport.js';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ReportReader} from './ExecutiveReportsHub.jsx';
import {ReportLocaleContext,reportText} from '../lib/reportLocale.jsx';
import {fetchAnnualReports,REPORT_LIBRARY,saveReportBlob} from '../lib/reportLibrary.js';
import {reportOutline} from '../lib/reportOutline.js';
import {reportCsv} from '../lib/reportCsv.js';
import {requestReportPdf,requestReportFile} from '../lib/reportPdf.js';
import {verifyReportOwner} from '../lib/reportRequest.js';
import {reportDownloadName} from '../../../shared/report-download-name.mjs';
import './ReportWeekly.css';
import './ReportCharts.css';
import './ReportLayout.css';
const areas={finance:'Finanzas',markets:'Mercados',mexico:'México'};
export default function AnnualReportsLibrary({onAnnex,requestedYear,accountEmail}) {
  const [language]=useIdioma(),t=useMemo(()=>reportText(language),[language]);
  const params=new URLSearchParams(window.location.search),initial=Number(params.get('anio'));
  const [year,setYear]=useState(REPORT_LIBRARY.years.includes(initial) ? initial : 2025),[area,setArea]=useState('finance'),[keys,setKeys]=useState({finance:'equities',markets:'overview',mexico:'mx_overview'}),[search,setSearch]=useState(''),[data,setData]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const cache=useRef(new Map()),panel=useRef(null),exportRequest=useRef(null);
  useEffect(()=>{if(REPORT_LIBRARY.years.includes(requestedYear?.year))setYear(requestedYear.year);},[requestedYear]);
  useEffect(()=>{
    const controller=new AbortController();setError('');setData(cache.current.get(year) || null);setNotice('');
    if(!cache.current.has(year))fetchAnnualReports(year,controller.signal).then(reports=>{if(!controller.signal.aborted){cache.current.set(year,reports);setData(reports);}}).catch(issue=>{if(!controller.signal.aborted)setError(issue.message);});
    return ()=>controller.abort();
  },[year,retry]);
  useEffect(()=>()=>exportRequest.current?.abort(),[]);
  const reports=data?.filter(report=>report.reportYear===year && report.collection===area) || [],active=reports.find(report=>report.key===keys[area]) || reports[0];
  const localized=useLocalizedReport(active,active?.title || '',language,accountEmail),reading=localized.report;
  useEffect(()=>{exportRequest.current?.abort();setBusy(false);},[language,accountEmail]);
  const chooseYear=next=>{exportRequest.current?.abort();setBusy(false);setYear(next);};
  const download=async format=>{
    if(!active || !accountEmail || exportRequest.current || busy || localized.pending || localized.error)return;const report=active,controller=new AbortController();exportRequest.current=controller;setBusy(true);setNotice('');
    try{await verifyReportOwner(accountEmail,controller.signal);const blob=format==='csv' ? language==='es' ? new Blob([reportCsv(report)],{type:'text/csv;charset=utf-8'}) : await requestReportFile(report,report.title,report.summary,'csv',fetch,{signal:controller.signal,language,expectedOwner:accountEmail}) : await requestReportPdf(report,report.title,report.summary,fetch,{signal:controller.signal,language,expectedOwner:accountEmail});if(!controller.signal.aborted)saveReportBlob(blob,reportDownloadName(report,format,{language,title:reading?.title}));}
    catch(issue){if(!controller.signal.aborted)setNotice(issue.message);}
    finally{if(exportRequest.current===controller){setBusy(false);exportRequest.current=null;}}
  };
  const jump=key=>panel.current?.querySelector('#annual-document-'+key)?.scrollIntoView({block:'start',behavior:'instant'});
  return <ReportLocaleContext.Provider value={t}><section className="erh erh-studio reports-archive notranslate" translate="no" lang={language} aria-label={t('Librería de informes anuales')} ref={panel}>
    <header className="reports-section-heading"><div><span className="informes-kicker">{t('Archivo histórico')}</span><h2>{t('Librería anual')}</h2><p>{t('Los mismos 14 informes de Finanzas, Mercados y México, con una edición para cada año. Periodos cerrados de enero a diciembre.')}</p></div><span className="reports-count">{t('4 años · 56 informes')}</span></header>
    <div className="reports-year-grid" role="group" aria-label={t('Año del informe')}>{REPORT_LIBRARY.years.map(value=><button type="button" key={value} aria-pressed={year===value} onClick={()=>chooseYear(value)}><small>{t('Informe anual')}</small><strong>{value}</strong><span>{t('14 ediciones · enero a diciembre')}</span></button>)}</div>
    <div className="reports-archive-toolbar"><div className="erh-switch" role="group" aria-label={t('Familia de la librería anual')}>{Object.entries(areas).map(([id,label])=><button key={id} type="button" aria-pressed={area===id} onClick={()=>{setArea(id);setSearch('');}}>{t(label)}<small>{Object.keys(REPORT_LIBRARY.reports[id]).length}</small></button>)}</div><label className="reports-search">{t('Buscar informe')}<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder={t('Bolsa, proteínas, producción…')} /></label></div>
    {!data && !error && <p className="reports-message" role="status">{t("Cargando las ediciones de {year}…",{year})}</p>}
    {error && <div className="reports-message" role="alert"><p>{error}</p><button type="button" onClick={()=>{cache.current.delete(year);setRetry(value=>value+1);}}>{t('Volver a intentar')}</button></div>}
    {data && <><div className="reports-archive-books">{reports.filter(report=>(report.title+' '+report.eyebrow).toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))).map(report=><button className="reports-archive-book" type="button" key={report.key} aria-pressed={active?.key===report.key} onClick={()=>{setKeys(current=>({...current,[area]:report.key}));setNotice('');}}><span>{t(areas[area])} · {year}</span><strong>{t(REPORT_LIBRARY.reports[area][report.key])}</strong><small>{t('Edición anual')}</small><span>{(Number(report.annualCoverage.available)||0)+(Number(report.annualCoverage.indicators)||0) || report.annualCoverage.states || 0} {t("referencias con dato del año")}</span></button>)}</div>{!reports.some(report=>(report.title+' '+report.eyebrow).toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))) && <p className="reports-message">{t('No hay informes que coincidan con esa búsqueda.')}</p>}
      {active && <article className="reports-archive-document"><header><div><small>{t("Lectura del archivo")} · {year}</small><h3>{reading?.title || t(active.title)}</h3><p>{t("Periodo: enero a diciembre de {year}. Preparado: {date}.",{year,date:active.generatedAt.slice(0,10)})}</p></div><div className="reports-document-actions"><button type="button" disabled={busy || localized.pending || Boolean(localized.error)} onClick={()=>download('pdf')}>{t(busy ? 'Preparando…' : 'Descargar PDF')}</button><button type="button" disabled={busy || localized.pending || Boolean(localized.error)} onClick={()=>download('csv')}>{t('Descargar datos CSV')}</button><button type="button" onClick={()=>onAnnex(active)}>{t('Ver anexos')}</button></div></header>
        {notice && <p className="reports-message" role="alert">{notice}</p>}
        <nav className="reports-document-index" aria-label={t('Índice del informe anual')}>{reportOutline(active).map(block=><button type="button" key={block.key} onClick={()=>jump(block.key)}>{t(block.label)}</button>)}</nav>
        <div className="reports-archive-paper">{localized.pending ? <p role="status">{t("Traduciendo el informe…")}</p> : localized.error ? <div role="alert"><p>{t("No se pudo traducir la vista previa.")}</p><button type="button" onClick={localized.retry}>{t("Reintentar traducción")}</button></div> : reading && <ReportReader report={reading} prefix="annual-document" />}</div>
      </article>}</>}
  </section></ReportLocaleContext.Provider>;
}
