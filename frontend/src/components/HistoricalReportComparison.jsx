import {useEffect,useRef,useState} from 'react';
import {reportJsonRequest} from '../lib/reportRequest.js';
import {isReportDocument} from '../lib/reportDataValidation.js';
import {reportChangeSnapshot,compareReportSnapshots} from '../lib/reportChanges.js';
function archivedEntries(payload,area,key){
 if(!Array.isArray(payload.data) || payload.data.some(item=>!item || !/^[a-f0-9]{64}$/.test(item.id) || item.collection!==area || item.key!==key || !Number.isFinite(Date.parse(item.generatedAt))))throw Error('El historial devolvió una lista de cortes inválida.');
 return payload.data;
}
export default function HistoricalReportComparison({area,reportKey,accountEmail,t}){
 const [entries,setEntries]=useState([]),[cursor,setCursor]=useState(null),[older,setOlder]=useState(''),[newer,setNewer]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null);
 const request=useRef(null);
 useEffect(()=>{
  request.current?.abort();setEntries([]);setCursor(null);setResult(null);setError('');setOlder('');setNewer('');
  if(!reportKey || !accountEmail){setBusy(false);return undefined;}
  const controller=new AbortController();request.current=controller;setBusy(true);
  const query=new URLSearchParams({area,key:reportKey,limit:'100'});
  reportJsonRequest('/api/report-history?'+query,{signal:controller.signal},{expectedOwner:accountEmail}).then(payload=>{if(controller.signal.aborted)return;const data=archivedEntries(payload,area,reportKey);setEntries(data);setCursor(payload.nextCursor || null);setNewer(data[0]?.id || '');setOlder(data[1]?.id || '');}).catch(issue=>{if(!controller.signal.aborted)setError(issue.message);}).finally(()=>{if(request.current===controller){request.current=null;setBusy(false);}});
  return ()=>{controller.abort();request.current?.abort();request.current=null;};
 },[area,reportKey,accountEmail]);
 const more=async()=>{
  if(!cursor || request.current)return;const controller=new AbortController();request.current=controller;setBusy(true);setError('');
  try{const query=new URLSearchParams({area,key:reportKey,limit:'100',cursor}),payload=await reportJsonRequest('/api/report-history?'+query,{signal:controller.signal},{expectedOwner:accountEmail});const data=archivedEntries(payload,area,reportKey);if(!controller.signal.aborted){setEntries(current=>[...new Map([...current,...data].map(item=>[item.id,item])).values()]);setCursor(payload.nextCursor || null);}}
  catch(issue){if(!controller.signal.aborted)setError(issue.message);}finally{if(request.current===controller){request.current=null;setBusy(false);}}
 };
 const compare=async()=>{
  if(!older || !newer || older===newer || request.current)return;
  const a=entries.find(item=>item.id===older),b=entries.find(item=>item.id===newer);
  if(Date.parse(a?.generatedAt)>Date.parse(b?.generatedAt)){setError(t('El corte anterior debe preceder al posterior.'));return;}
  const controller=new AbortController();request.current=controller;setBusy(true);setError('');setResult(null);
  try{
   const reports=await Promise.all([a,b].map(async entry=>{const payload=await reportJsonRequest('/api/report-history/'+encodeURIComponent(entry.id),{signal:controller.signal},{expectedOwner:accountEmail});const report=payload.data;if(!isReportDocument(report) || report.collection!==area || report.key!==reportKey || report.generatedAt!==entry.generatedAt)throw Error(t('El historial devolvió otra edición. Vuelve a seleccionar los cortes.'));return report;}));
   const comparison=compareReportSnapshots(...reports.map(reportChangeSnapshot));if(!comparison)throw Error(t('Las ediciones no son comparables. Selecciona el mismo informe y periodo.'));
   if(!controller.signal.aborted)setResult({owner:accountEmail,...comparison});
  }catch(issue){if(!controller.signal.aborted)setError(issue.message);}finally{if(request.current===controller){request.current=null;setBusy(false);}}
 };
 const label=(item,index)=>new Date(item.generatedAt).toLocaleString(t.locale,{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'})+(entries.some(other=>other.id!==item.id && other.generatedAt===item.generatedAt) ? ' · '+t('Versión')+' '+(index+1) : '');
 const number=value=>Number.isFinite(value) ? value.toLocaleString(t.locale,{maximumFractionDigits:5}) : '—';
 const kinds={movement:'Movimiento observado',correction:'Dato revisado',publication:'Nueva publicación',unavailable:'Referencia ausente',news:'Nueva noticia'};
 return <section className="reports-historical-comparison reports-support-panel" aria-label={t('Comparar ediciones guardadas')}>
  <h3>{t('Comparar ediciones guardadas')}</h3><p>{t('Selecciona dos cortes del mismo informe. Se utilizan sus datos archivados; no es necesario haberlos abierto en esta sesión.')}</p>
  {!reportKey ? <p>{t('Selecciona un informe del historial para comparar sus cortes.')}</p> : <>
   <div className="reports-annex-filters">{[['Corte anterior',older,setOlder],['Corte posterior',newer,setNewer]].map(([text,value,setValue])=><label key={text}>{t(text)}<select aria-label={t(text)} disabled={busy || !accountEmail} value={value} onChange={event=>{setValue(event.target.value);setResult(null);setError('');}}><option value="">{t('Seleccionar corte')}</option>{entries.map((entry,index)=><option key={entry.id} value={entry.id}>{label(entry,index)}</option>)}</select></label>)}<button type="button" disabled={busy || !accountEmail || !older || !newer || older===newer} onClick={compare}>{t('Comparar cortes')}</button>{cursor && <button type="button" disabled={busy} onClick={more}>{t('Cargar más cortes')}</button>}</div>
   {!busy && entries.length<2 && !error && <p>{t('Se necesitan dos ediciones guardadas. Los cortes ausentes no se reconstruyen.')}</p>}
  </>}
  {busy && <p role="status">{t('Consultando el historial…')}</p>}{error && <p role="alert">{error}</p>}
  {result?.owner===accountEmail && <div className="reports-comparison-result"><p role="status">{result.items.length} {t(result.items.length===1 ? 'cambio entre los cortes elegidos' : 'cambios entre los cortes elegidos')}</p>{result.items.length ? <div role="region" tabIndex={0} aria-label={t('Diferencias entre ediciones')}><table><thead><tr>{['Tipo','Referencia','Anterior','Posterior','Unidad','Fecha de la observación'].map(text=><th scope="col" key={text}>{t(text)}</th>)}</tr></thead><tbody>{result.items.map((item,index)=><tr key={index}><td>{t(kinds[item.kind])}</td><th scope="row">{item.label}{item.detail && <small>{item.detail}</small>}{item.historyOnly && <small>{t('Historial o estado revisado; último valor sin cambio.')}</small>}</th><td>{item.beforeText || number(item.before)}</td><td>{item.afterText || number(item.after)}</td><td>{item.unit || '—'}</td><td>{item.date || '—'}</td></tr>)}</tbody></table></div> : <p>{t('No hay diferencias en las referencias comparables.')}</p>}<small>{t('Las diferencias describen publicaciones y revisiones. Cada referencia conserva su unidad; no se atribuyen causas ni se homogeneizan productos distintos.')}</small></div>}
 </section>;
}
