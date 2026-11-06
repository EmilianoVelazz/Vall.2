import useIdioma from '../lib/idioma.js';
import {reportText} from '../lib/reportLocale.jsx';
import {useLocalizedReport} from '../lib/useLocalizedReport.js';
import {useEffect,useMemo,useState} from 'react';
import {reportJsonRequest} from '../lib/reportRequest.js';
import {isReportLibrary} from '../lib/reportDataValidation.js';
import {fetchAnnualReports,REPORT_LIBRARY,reportAnnex,saveReportBlob} from '../lib/reportLibrary.js';
import {reportCsv} from '../lib/reportCsv.js';
import COLLECTIONS from '../../../shared/report-collections.json';
export default function ReportAnnexes({initialReport,onAnnual,accountEmail}) {
  const [language]=useIdioma(),t=useMemo(()=>reportText(language),[language]);
  const [pinned,setPinned]=useState(Boolean(initialReport));
  const [scope,setScope]=useState(initialReport?.periodType==='annual' ? String(initialReport.reportYear) : 'daily'),[area,setArea]=useState(initialReport?.collection || 'finance'),[key,setKey]=useState(initialReport?.key || 'equities'),[reports,setReports]=useState(initialReport ? [initialReport] : []),[error,setError]=useState(''),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{if(initialReport){setPinned(true);setScope(initialReport.periodType==='annual' ? String(initialReport.reportYear) : 'daily');setArea(initialReport.collection);setKey(initialReport.key);setReports([initialReport]);}},[initialReport]);
  useEffect(()=>{
    if(pinned && initialReport){setReports([initialReport]);setLoading(false);setError('');return undefined;}
    const controller=new AbortController();setError('');setLoading(true);
    const load=scope==='daily' ? reportJsonRequest(COLLECTIONS[area].endpoint,{signal:controller.signal}).then(payload=>payload.data) : fetchAnnualReports(Number(scope),controller.signal).then(data=>data.filter(report=>report.collection===area));
    load.then(data=>{if(controller.signal.aborted)return;if(!isReportLibrary(data))throw Error('Los anexos no recibieron una colección válida.');setReports(data);setKey(current=>data.some(report=>report.key===current) ? current : data[0]?.key || '');}).catch(issue=>{if(!controller.signal.aborted){setReports([]);setError(issue.message);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[scope,area,retry,initialReport,pinned]);
  const active=reports.find(report=>report.key===key);
  const localized=useLocalizedReport(active,active?.title || '',language,accountEmail);
  const annex=localized.report ? reportAnnex(localized.report,{t}) : null;
  const chooseScope=value=>{setPinned(false);setScope(value);setReports([]);};
  return <section className="reports-annexes notranslate" translate="no" lang={language} aria-label={t('Anexos de los informes')}>
    <header className="reports-section-heading"><div><span className="informes-kicker">{t('Respaldo de la información')}</span><h2>{t('Anexos')}</h2><p>{t('Consulta las fuentes, las tablas completas y cómo se calcularon los resultados de cada informe diario o anual.')}</p></div></header>
    {pinned && active && <div className="reports-message"><p>{t("Anexos de la edición seleccionada")}: {active.generatedAt?.slice(0,10)}</p>{scope==='daily' && <button type="button" onClick={()=>{setPinned(false);setReports([]);setRetry(value=>value+1);}}>{t('Consultar último corte')}</button>}</div>}
    <div className="reports-annex-filters"><label>{t('Edición')}<select aria-label={t('Edición')} value={scope} onChange={event=>chooseScope(event.target.value)}><option value="daily">{t('Diario actual')}</option>{REPORT_LIBRARY.years.map(year=><option value={year} key={year}>{t("Anual")} {year}</option>)}</select></label><label>{t('Familia')}<select aria-label={t('Familia')} value={area} onChange={event=>{setPinned(false);setArea(event.target.value);setReports([]);}}>{Object.entries(REPORT_LIBRARY.reports).map(([id])=><option value={id} key={id}>{t(COLLECTIONS[id].label)}</option>)}</select></label><label>{t('Informe')}<select aria-label={t('Informe')} value={key} disabled={loading || !reports.length} onChange={event=>{setPinned(false);setKey(event.target.value);}}>{reports.map(report=><option value={report.key} key={report.key}>{report.key===active?.key && localized.report ? localized.report.title : t(report.title)}</option>)}</select></label></div>
    {(loading || localized.pending) && <p className="reports-message" role="status">{t('Cargando respaldo del informe…')}</p>}
    {(error || localized.error) && <div className="reports-message" role="alert"><p>{t("No se pudo cargar el respaldo del informe.")}</p><button type="button" onClick={()=>{setRetry(value=>value+1);localized.retry();}}>{t('Volver a intentar')}</button></div>}
    {!loading && !localized.pending && annex && <><header className="reports-annex-title"><div><h3>{annex.title}</h3><p>{annex.coverage}</p></div><div className="reports-document-actions"><button type="button" onClick={()=>saveReportBlob(new Blob([reportCsv(localized.report,{t,extraTables:annex.tables.filter(table=>table.kind==='provenance')})],{type:'text/csv;charset=utf-8'}),`vallnews-anexos-${active.collection}-${active.key}-${scope}.csv`)}>{t('Descargar tablas CSV')}</button>{active.periodType==='annual' && <button type="button" onClick={()=>onAnnual(active.reportYear)}>{t('Ir a la librería anual')}</button>}</div></header>
      <section className="reports-annex-block" aria-labelledby="reports-annex-methods"><h3 id="reports-annex-methods">{t('Metodología')}</h3><div className="reports-method-grid">{annex.methods.map(item=><article key={item.title}><h4>{item.title}</h4><p>{item.text}</p></article>)}</div></section>
      <section className="reports-annex-block" aria-labelledby="reports-annex-sources"><h3 id="reports-annex-sources">{t("Fuentes y documentos originales")} <small>{annex.sources.length}</small></h3>{annex.sources.length ? <ul className="reports-source-list">{annex.sources.map((source,index)=><li key={source.label+source.url}><span>{String(index+1).padStart(2,'0')}</span><div>{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}<i className="fas fa-arrow-up-right-from-square" aria-hidden="true" /></a> : <strong>{source.label}</strong>}{source.domain && <small>{source.domain}</small>}{!source.url && <small>{t('Referencia declarada sin enlace directo')}</small>}</div></li>)}</ul> : <p>{t('No hay referencias enlazadas disponibles para esta edición.')}</p>}</section>
      <section className="reports-annex-block" aria-labelledby="reports-annex-tables"><h3 id="reports-annex-tables">{t("Tablas de respaldo")} <small>{annex.tables.length}</small></h3>{annex.tables.map((table,index)=><article className="reports-annex-table" key={table.title+index}><h4>{table.title}</h4>{table.note && <p>{table.note}</p>}<div role="region" tabIndex={0} aria-label={table.title}><table><thead><tr>{table.columns.map((column,n)=><th key={n} scope="col">{column}</th>)}</tr></thead><tbody>{table.rows.map((row,n)=><tr key={n}>{row.map((cell,m)=>m===0 ? <th key={m} scope="row">{cell}</th> : <td key={m}>{cell}</td>)}</tr>)}</tbody></table></div></article>)}</section>
    </>}
  </section>;
}
