import {useEffect,useId,useRef,useState} from 'react';
import formats from '../../../shared/report-export-options.json';
import ReportControlIcon from './ReportControlIcon.jsx';
import './ReportDownloadMenu.css';
export default function ReportDownloadMenu({onDownload,disabled=false,busy=false,compact=false,children,t=value=>value}){
 const [format,setFormat]=useState('pdf'),selected=formats.find(item=>item.value===format);
 const [open,setOpen]=useState(false),root=useRef(null),trigger=useRef(null),popupId=useId();
 useEffect(()=>{
  if(!open)return undefined;
  const outside=event=>{if(!root.current?.contains(event.target))setOpen(false);};
  const escape=event=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);trigger.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open]);
 if(compact)return <div className="reports-download-menu reports-download-compact" ref={root} role="group" aria-label={t('Descargar esta edición')}>
  <button type="button" className="erh-download" disabled={disabled || busy} aria-busy={busy || undefined} onClick={event=>onDownload('pdf',event)}><ReportControlIcon name="download" />{t(busy ? 'Preparando…' : 'Descargar PDF')}</button>
  <button ref={trigger} type="button" className="reports-options-trigger" aria-label={t('Más opciones del informe')} title={t('Más opciones del informe')} aria-expanded={open} aria-controls={popupId} disabled={disabled || busy} onClick={()=>setOpen(value=>!value)}><ReportControlIcon name="more" /></button>
  {open && <div id={popupId} className="reports-options-popup" onClick={event=>{if(event.target.closest('button,a'))setOpen(false);}}>
   {children}
   <span className="reports-options-label">{t('Otros formatos')}</span>
   {formats.filter(item=>item.value!=='pdf').map(item=><button key={item.value} type="button" disabled={disabled || busy} onClick={event=>onDownload(item.value,event)}><ReportControlIcon name="table" />{t(item.button)}</button>)}
  </div>}
 </div>;
 return <div className="reports-download-menu" role="group" aria-label={t('Descargar esta edición')}>
  <label>{t('Formato')}<select aria-label={t('Formato de descarga')} value={format} disabled={disabled || busy} onChange={event=>setFormat(event.target.value)}>{formats.map(item=><option key={item.value} value={item.value}>{t(item.label)}</option>)}</select></label>
  <button type="button" className="erh-download" disabled={disabled || busy} aria-busy={busy || undefined} onClick={event=>onDownload(format,event)}>{t(busy ? 'Preparando…' : selected.button)}</button>
 </div>;
}
