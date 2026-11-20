import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {requestReportPdf} from '../lib/reportPdf.js';
import {verifyReportOwner} from '../lib/reportRequest.js';
import {keepDialogFocus,restoreDialogFocus} from '../lib/reportDialog.js';
import './ReportMeetingTools.css';
export default function ReportMeetingTools({report,reading,owner,language,disabled,renderReport,t=value=>value}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const dialog=useRef(null),trigger=useRef(null),request=useRef(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 useEffect(()=>{
  if(!open)return;
  const node=dialog.current,previous=trigger.current;
  node.showModal();const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  return ()=>{if(document.fullscreenElement===node)void document.exitFullscreen().catch(()=>{});node.close();document.body.style.overflow=overflow;restoreDialogFocus(previous);};
 },[open]);
 async function summary(){
  if(busy||disabled)return;
  const controller=new AbortController();request.current=controller;setBusy(true);setNotice(t('Preparando resumen…'));
  try{
   await verifyReportOwner(owner,controller.signal);
   const blob=await requestReportPdf(report,report.title,'',fetch,{expectedOwner:owner,language,edition:'meeting-summary',signal:controller.signal});
   await verifyReportOwner(owner,controller.signal);if(controller.signal.aborted)return;
   const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='VALLNews-'+String(report.key||'informe').replace(/[^a-zA-Z0-9_-]/g,'')+'-resumen-junta.pdf';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);setNotice(t('Resumen listo para descargar.'));
  }catch(error){if(!controller.signal.aborted)setNotice(error.message||t('No se pudo descargar el resumen.'));}
  finally{if(request.current===controller){request.current=null;if(!controller.signal.aborted)setBusy(false);}}
 }
 return <><button type="button" className="erh-secondary-button" aria-label={t('Descargar resumen de una página')} disabled={disabled||busy} onClick={summary}>{t(busy?'Preparando…':'Resumen · 1 pág.')}</button><button ref={trigger} type="button" className="erh-secondary-button" disabled={disabled||!reading} onClick={()=>setOpen(true)}>{t('Modo reunión')}</button>{notice&&<span className="erh-meeting-status" role="status">{notice}</span>}{open&&createPortal(<dialog ref={dialog} className="erh erh-studio erh-meeting" aria-label={t('Modo reunión del informe')} onKeyDown={keepDialogFocus} onCancel={event=>{event.preventDefault();setOpen(false);}}><header className="erh-meeting-toolbar"><div><span>VALLNEWS · {t('Modo reunión')}</span><h2>{reading.title}</h2></div><div><button type="button" onClick={()=>{if(!dialog.current.requestFullscreen){setNotice(t('Pantalla completa no disponible.'));return;}dialog.current.requestFullscreen().catch(()=>setNotice(t('La lectura sigue disponible en esta ventana.')));}}>{t('Pantalla completa')}</button><button type="button" autoFocus onClick={()=>setOpen(false)}>{t('Salir del modo reunión')}</button></div></header><div className="erh-meeting-content erh-document notranslate" lang={language} translate="no"><p className="erh-meeting-cut">{t('Corte')}: {new Date(reading.generatedAt).toLocaleString('es-MX',{timeZone:'America/Mexico_City'})} · CDMX</p>{renderReport(reading,'erh-meeting-report')}</div>{notice&&<p role="status">{notice}</p>}</dialog>,document.body)}</>;
}
