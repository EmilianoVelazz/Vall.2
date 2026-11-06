import { reportHasContent } from '../lib/reportAiPreferences.js';

const Icon=({name})=><i className={`fas ${name}`} aria-hidden="true" />;

export default function ReportCreationComposer({report,onSave,onCancel,saving,headingRef,status,aiEditor,generating,aiAction,onReview,pending,documentTitle,saveIssue,draftStorageStatus,onPause}) {
  const hasContent=reportHasContent(report);
  return <aside className="erh-edition erh-creation-composer" aria-labelledby="erh-creation-heading">
    <header className="erh-edition-heading">
      <div className="erh-editor-brand"><span className="erh-editor-emblem"><Icon name="fa-wand-magic-sparkles" /></span><div><span className="erh-eyebrow">ORION · Nuevo informe</span><h2 id="erh-creation-heading" ref={headingRef} tabIndex={-1}>Crear informe</h2></div></div>
      <div className="erh-editor-source"><Icon name="fa-file-lines" /><span>Documento</span><strong title={documentTitle || report.title}>{documentTitle || report.title}</strong></div>
    </header>
    <p className="erh-save-state" role="status">{status}</p>
    {saveIssue==='session' && <p className="erh-draft-notice"><a href="/login">Inicia sesión para guardar</a>. Tu borrador se conserva en esta pestaña.</p>}
    {saveIssue==='uncertain' && <p className="erh-draft-notice">Reintentar comprueba el mismo informe. El pedido queda protegido hasta confirmar el guardado.</p>}
    {saveIssue==='account' && <p className="erh-draft-notice">Tu borrador pertenece a la sesión anterior. <button type="button" onClick={()=>window.location.reload()}>Recargar cuenta</button></p>}
    <div className="erh-edition-scroll">{aiEditor}</div>
    <footer className={`erh-edition-footer${report.aiEdition && !pending && !generating ? ' is-ready' : ''}`}>
      <div className="erh-editor-next"><span>{generating ? 'Preparando tu informe…' : pending ? 'Genera para aplicar tu nuevo pedido' : report.aiEdition ? 'Tu informe está listo para revisar' : 'Describe qué necesitas y genera tu informe'}</span>{report.aiEdition && !generating && <button type="button" onClick={onReview}>Ver resultado <Icon name="fa-arrow-right" /></button>}</div>
      <div className="erh-primary-actions">{aiAction}<button type="button" className="erh-secondary-button erh-save-document" disabled={saving || generating || pending || !hasContent || ['conflict','removed','account'].includes(saveIssue)} onClick={()=>onSave(false)}><Icon name={saving ? 'fa-spinner fa-spin' : 'fa-bookmark'} />{saving ? 'Guardando…' : saveIssue==='uncertain' ? 'Reintentar guardado' : 'Guardar mi informe'}</button><button type="button" className="erh-secondary-button erh-cancel-creation" aria-label="Cancelar creación" disabled={saving} onClick={onCancel}><Icon name="fa-xmark" />Cancelar</button></div>
      {['conflict','removed'].includes(saveIssue) && <button type="button" className="erh-secondary-button" disabled={saving || generating || pending} onClick={()=>onSave(true)}>Guardar como informe nuevo</button>}
      <small className="erh-draft-storage">{draftStorageStatus==='saved' ? 'Borrador protegido en esta pestaña; el informe se guarda por separado.' : draftStorageStatus==='unavailable' ? 'El navegador no pudo conservar una copia. Mantén esta pestaña abierta hasta guardar.' : ''}</small>
      <div className="erh-footer-links"><button type="button" disabled={saving || generating} onClick={onPause}>Continuar más tarde</button></div>
    </footer>
  </aside>;
}
