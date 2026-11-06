import { useEffect, useRef } from 'react';
import { keepDialogFocus, restoreDialogFocus } from '../lib/reportDialog.js';
import {useReportText} from '../lib/reportLocale.jsx';
import {reportDialogMessage} from '../lib/reportDialogLocale.js';

export default function ReportDeleteDialog({ report, deleting, error, onConfirm, onClose, onRefresh }) {
  const t=useReportText();
  const dialog=useRef(null);
  useEffect(()=>{
    const previous=document.activeElement,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';dialog.current.showModal();
    return ()=>{document.body.style.overflow=overflow;restoreDialogFocus(previous);};
  },[]);
  return <dialog ref={dialog} className="erh-delete-dialog notranslate" translate="no" lang={t.language} aria-labelledby="erh-delete-title" onKeyDown={keepDialogFocus} onCancel={event=>{event.preventDefault();if(!deleting) onClose();}}>
    <span className="erh-delete-icon"><i className="fas fa-trash-can" aria-hidden="true" /></span>
    <h2 id="erh-delete-title">{t("Eliminar informe")}</h2>
    <p>{t("Vas a eliminar")} <strong>{report.title}</strong> {t("de tu cuenta. Esta acción no se puede deshacer.")}</p>
    {error && <p role="alert" className="erh-ai-error">{reportDialogMessage(t,error,undefined,'No se pudo eliminar el informe. Vuelve a intentarlo.')}</p>}
    {error && <button type="button" className="erh-secondary-button" disabled={deleting} onClick={onRefresh}>{t("Actualizar Mis informes")}</button>}
    {deleting && <p role="status">{t("Eliminando tu informe…")}</p>}
    <footer><button type="button" className="erh-secondary-button" disabled={deleting} onClick={onClose}>{t("Conservar informe")}</button><button type="button" className="erh-delete-confirm" disabled={deleting} onClick={onConfirm}>{deleting ? t("Eliminando…") : t("Eliminar definitivamente")}</button></footer>
  </dialog>;
}
