import { useEffect, useState } from 'react';
import ReportLearningPanel from './ReportLearningPanel.jsx';
import ReportCreationOptions from './ReportCreationOptions.jsx';
import { reportSectorFormat } from '../lib/reportSectorFormat.js';
const Icon=({name})=><i className={`fas ${name}`} aria-hidden="true" />;
export function ReportAiGenerateAction({generating,disabled,instructions='',canGenerate,onGenerate,onCancel}) {
  return <button type="button" className="erh-download erh-ai-generate" disabled={!generating && (disabled || (!instructions.trim() && !canGenerate))} onClick={generating ? onCancel : onGenerate}><Icon name={generating ? 'fa-stop' : 'fa-wand-magic-sparkles'} />{generating ? 'Cancelar generación' : 'Generar con IA'}</button>;
}
export default function ReportAiEditor({account,instructions,onInstructions,onUndo,generating,disabled,error,canUndo,pending,report,material,preferences,overrideFields,onPreference,onReleasePreferences}) {
  const [elapsed,setElapsed]=useState(0);
  const [suggestionNotice,setSuggestionNotice]=useState('');
  const format=reportSectorFormat(material || report);
  const addToRequest=text=>{
    const next=[instructions.trim(),text].filter(Boolean).join('\n\n');
    if(next.length>4000) {setSuggestionNotice('Tu pedido está cerca del límite. Acórtalo para agregar esta idea.');return;}
    onInstructions(next);setSuggestionNotice('Idea agregada a tu pedido. Puedes ajustar el texto.');
  };
  useEffect(()=>{
    setElapsed(0);
    if(!generating) return undefined;
    const started=Date.now(),timer=setInterval(()=>setElapsed(Math.floor((Date.now()-started)/1000)),1000);
    return ()=>clearInterval(timer);
  },[generating]);
  return <section id="erh-setting-ai" tabIndex={-1} className="erh-ai-editor erh-ai-text-only" aria-labelledby="erh-ai-title">
    <div className="erh-ai-heading"><h3 id="erh-ai-title">Tu pedido</h3><span className={generating ? 'is-working' : pending ? 'is-pending' : report?.aiEdition ? 'is-applied' : ''}>{generating ? 'En proceso' : pending ? 'Por aplicar' : report?.aiEdition ? 'Aplicado' : 'Con IA'}</span></div>
    <p>Describe qué necesitas decidir, qué debe explicar y qué quieres evitar. Puedes escribirlo con tus propias palabras.</p>
    <fieldset disabled={generating || disabled}>
      <div className="erh-creation-starters"><span>Un punto de partida</span><div>{[
        ['Para dirección','Prepara una lectura ejecutiva para dirección: conclusión principal, señales relevantes y decisiones pendientes, con evidencia disponible.'],
        ['Plan de compras','Enfoca el informe en compras y abastecimiento: costos, disponibilidad y seguimiento. Distingue referencias del mercado y cotizaciones de proveedores.'],
        ['Riesgos y acciones','Prioriza riesgos respaldados por la evidencia, condiciones a monitorear y acciones que requieren validación. Señala los datos que faltan.'],
      ].map(([label,text])=><button type="button" key={label} onClick={()=>addToRequest(text)}><Icon name="fa-plus" />{label}</button>)}</div></div>
      <label className="erh-field erh-ai-request"><span>¿Cómo quieres este informe?</span><textarea aria-label="¿Cómo quieres este informe?" aria-describedby="erh-ai-request-help" lang="es" spellCheck value={instructions} maxLength={4000} rows={8} onChange={event=>{setSuggestionNotice('');onInstructions(event.target.value);}} placeholder={'Por ejemplo:\nPrepara un informe ejecutivo para mi jefe, enfocado en compras y abastecimiento.\n\nConserva las gráficas y las fuentes. Agrega los riesgos relevantes y termina con las decisiones que debemos revisar.\n\nHazlo sencillo y señala la información que falta.'} /></label>
      <div id="erh-ai-request-help" className="erh-request-help"><span>Escribe tu pedido o elige opciones abajo.</span><span>{instructions.length.toLocaleString('es-MX')} / 4,000</span></div>
      {format && <details className="erh-creation-topics"><summary>Ideas para {format.label.toLowerCase()}</summary><p>Agrega sólo los temas que te interesan; se desarrollarán con los datos disponibles.</p><div>{format.topics.map(topic=><button type="button" key={topic.heading} onClick={()=>addToRequest(`Desarrolla ${topic.heading.toLowerCase()}: ${topic.question} Si falta evidencia, indica qué información necesitamos.`)}><Icon name="fa-plus" />{topic.heading}</button>)}</div></details>}
      {suggestionNotice && <span className="erh-suggestion-notice" role="status">{suggestionNotice}</span>}
      <p className="erh-ai-material-note"><Icon name="fa-database" /><span>Se trabaja con la información disponible del informe.</span></p>
      {pending && !generating && <p className="erh-ai-pending"><Icon name="fa-pen" /><span>Pedido pendiente. Genera para verlo aplicado en la vista previa.</span></p>}
    </fieldset>
    <ReportCreationOptions preferences={preferences} overrideFields={overrideFields} onPreference={onPreference} onReleasePreferences={onReleasePreferences} material={material || report} disabled={generating || disabled} />
    {generating && <div role="status" className="erh-ai-progress"><Icon name="fa-spinner fa-spin" /><div><strong>ORION está preparando tu informe</strong><p>{elapsed} s · Puedes cancelar y conservar tu versión anterior.</p></div></div>}
    {error && <p role="alert" className="erh-ai-error">{error}</p>}
    {report?.aiEdition && <details className="erh-ai-applied"><summary><Icon name="fa-circle-check" /><span>Pedido aplicado a esta versión</span><Icon name="fa-chevron-down" /></summary><p>{report.aiEdition.instructions}</p></details>}
    {canUndo && !generating && <button type="button" disabled={disabled} className="erh-secondary-button erh-ai-undo" onClick={onUndo}><Icon name="fa-rotate-left" />Volver a la versión anterior</button>}
    {account && <details className="erh-ai-profile"><summary>Mi perfil de intereses</summary><p>Tu pedido actual tiene prioridad sobre estos intereses.</p><ReportLearningPanel account={account} disabled={generating || disabled} /></details>}
  </section>;
}
