import ReportDownloadMenu from './ReportDownloadMenu.jsx';
import {useReportExport} from '../lib/useReportExport.js';
import useIdioma from '../lib/idioma.js';
import {useLocalizedReport} from '../lib/useLocalizedReport.js';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ReportReader} from './ExecutiveReportsHub.jsx';
import {ReportLocaleContext,reportText} from '../lib/reportLocale.jsx';
import {fetchAnnualReports,REPORT_LIBRARY} from '../lib/reportLibrary.js';
import {reportOutline} from '../lib/reportOutline.js';
import './ReportWeekly.css';
import './ReportCharts.css';
import './ReportLayout.css';
const areas={finance:'Finanzas',markets:'Mercados',mexico:'México'};
export default function AnnualReportsLibrary({onAnnex,requestedYear,accountEmail}) {
  const [language]=useIdioma(),t=useMemo(()=>reportText(language),[language]);
  const params=new URLSearchParams(window.location.search),initial=Number(params.get('anio'));
  const reportCount=Object.values(REPORT_LIBRARY.reports).reduce((total,reports)=>total+Object.keys(reports).length,0);
  const [year,setYear]=useState(REPORT_LIBRARY.years.includes(initial) ? initial : Math.max(...REPORT_LIBRARY.years)),[area,setArea]=useState('finance'),[keys,setKeys]=useState({finance:'equities',markets:'overview',mexico:'mx_overview'}),[search,setSearch]=useState(''),[data,setData]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const cache=useRef(new Map()),panel=useRef(null);
  useEffect(()=>{if(REPORT_LIBRARY.years.includes(requestedYear?.year))setYear(requestedYear.year);},[requestedYear]);
  useEffect(()=>{
    const controller=new AbortController();setError('');setData(cache.current.get(year) || null);
    if(!cache.current.has(year))fetchAnnualReports(year,controller.signal).then(reports=>{if(!controller.signal.aborted){cache.current.set(year,reports);setData(reports);}}).catch(issue=>{if(!controller.signal.aborted)setError(issue.message);});
    return ()=>controller.abort();
  },[year,retry]);
  const reports=data?.filter(report=>report.reportYear===year && report.collection===area) || [],active=reports.find(report=>report.key===keys[area]) || reports[0];
  const localized=useLocalizedReport(active,active?.title || '',language,accountEmail),reading=localized.report;
  const exported=useReportExport(active,accountEmail,language,reading?.title);
  const chooseYear=next=>setYear(next);
  const jump=key=>panel.current?.querySelector('#annual-document-'+key)?.scrollIntoView({block:'start',behavior:'instant'});
  return <ReportLocaleContext.Provider value={t}><section className="erh erh-studio reports-archive notranslate" translate="no" lang={language} aria-label={t('Librería de informes anuales')} ref={panel}>
    <header className="reports-section-heading"><div><span className="informes-kicker">{t('Archivo histórico')}</span><h2>{t('Librería anual')}</h2><p>{t('Finanzas, Mercados y México, con una edición para cada año disponible. Periodos cerrados de enero a diciembre.')}</p></div><span className="reports-count">{REPORT_LIBRARY.years.length} {t('años')} · {REPORT_LIBRARY.years.length*reportCount} {t('informes')}</span></header>
    <div className="reports-year-grid" role="group" aria-label={t('Año del informe')}>{REPORT_LIBRARY.years.map(value=><button type="button" key={value} aria-pressed={year===value} onClick={()=>chooseYear(value)}><small>{t('Informe anual')}</small><strong>{value}</strong><span>{reportCount} {t('ediciones · enero a diciembre')}</span></button>)}</div>
    <div className="reports-archive-toolbar"><div className="erh-switch" role="group" aria-label={t('Familia de la librería anual')}>{Object.entries(areas).map(([id,label])=><button key={id} type="button" aria-pressed={area===id} onClick={()=>{setArea(id);setSearch('');}}>{t(label)}<small>{Object.keys(REPORT_LIBRARY.reports[id]).length}</small></button>)}</div><label className="reports-search">{t('Buscar informe')}<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder={t('Bolsa, proteínas, producción…')} /></label></div>
    {!data && !error && <p className="reports-message" role="status">{t("Cargando las ediciones de {year}…",{year})}</p>}
    {error && <div className="reports-message" role="alert"><p>{error}</p><button type="button" onClick={()=>{cache.current.delete(year);setRetry(value=>value+1);}}>{t('Volver a intentar')}</button></div>}
    {data && <><div className="reports-archive-books">{reports.filter(report=>(report.title+' '+report.eyebrow).toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))).map(report=><button className="reports-archive-book" type="button" key={report.key} aria-pressed={active?.key===report.key} onClick={()=>{setKeys(current=>({...current,[area]:report.key}));}}><span>{t(areas[area])} · {year}</span><strong>{t(REPORT_LIBRARY.reports[area][report.key])}</strong><small>{t('Edición anual')}</small><span>{(Number(report.annualCoverage.available)||0)+(Number(report.annualCoverage.indicators)||0) || report.annualCoverage.states || 0} {t("referencias con dato del año")}</span></button>)}</div>{!reports.some(report=>(report.title+' '+report.eyebrow).toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))) && <p className="reports-message">{t('No hay informes que coincidan con esa búsqueda.')}</p>}
      {active && <article className="reports-archive-document"><header><div><small>{t("Lectura del archivo")} · {year}</small><h3>{reading?.title || t(active.title)}</h3><p>{t("Periodo: enero a diciembre de {year}. Preparado: {date}.",{year,date:active.generatedAt.slice(0,10)})}</p></div><div className="reports-document-actions"><ReportDownloadMenu key={active.key+active.reportYear} t={t} busy={exported.busy} disabled={!accountEmail || localized.pending || Boolean(localized.error)} onDownload={exported.download} /><button type="button" onClick={()=>onAnnex(active)}>{t('Ver anexos')}</button></div></header>
        {exported.error && <p className="reports-message" role="alert">{exported.error}</p>}
        <nav className="reports-document-index" aria-label={t('Índice del informe anual')}>{reportOutline(active).map(block=><button type="button" key={block.key} onClick={()=>jump(block.key)}>{t(block.label)}</button>)}</nav>
        <div className="reports-archive-paper">{localized.pending ? <p role="status">{t("Traduciendo el informe…")}</p> : localized.error ? <div role="alert"><p>{t("No se pudo traducir la vista previa.")}</p><button type="button" onClick={localized.retry}>{t("Reintentar traducción")}</button></div> : reading && <ReportReader report={reading} prefix="annual-document" />}</div>
      </article>}</>}
  </section></ReportLocaleContext.Provider>;
}
