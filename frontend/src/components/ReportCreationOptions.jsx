import { REPORT_AUDIENCES, REPORT_DEPTHS, REPORT_HORIZONS, REPORT_CONFIDENTIALITY } from '../lib/executiveReportPreferences.js';
import { REPORT_CONTENT_BLOCKS, reportBlockCount } from '../lib/reportOutline.js';

export default function ReportCreationOptions({preferences:pref,overrideFields=[],onPreference,onReleasePreferences,material,disabled}) {
  if(!pref || !onPreference) return null;
  const select=(key,label,options)=><label className="erh-field" key={key}><span>{label}</span><select aria-label={label} value={overrideFields.includes(key) ? pref[key] : 'auto'} onChange={event=>onPreference(key,event.target.value)}><option value="auto">Según mi pedido</option>{options.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select>{overrideFields.includes(key) && <small className="erh-choice-caption">Elegido por ti</small>}</label>;
  return <section className="erh-creation-options" aria-labelledby="erh-creation-options-title">
    <div className="erh-creation-section-title"><span>02</span><div><h3 id="erh-creation-options-title">Elige qué incluir</h3><p>El resumen y el análisis siempre forman parte del informe.</p></div></div>
    <fieldset disabled={disabled} className="erh-creation-blocks"><legend className="erh-sr-only">Contenido de mi informe</legend>{REPORT_CONTENT_BLOCKS.map(block=>{
      const chosen=overrideFields.includes('sections.'+block.key),count=reportBlockCount(material,block.key);
      const available=count ? `${count} ${count===1 ? 'elemento disponible' : 'elementos disponibles'}` : block.key==='risks' ? 'Según la evidencia disponible' : block.key==='tables' ? 'Síntesis con tus datos' : 'Sin datos en la base';
      return <label key={block.key} className={pref.sections[block.key] ? 'is-included' : ''}><input type="checkbox" checked={pref.sections[block.key]} aria-label={`Incluir ${block.label.toLowerCase()}`} onChange={event=>onPreference('sections.'+block.key,event.target.checked)} /><i className={`fas ${block.icon}`} aria-hidden="true" /><span><strong>{block.label}</strong><small>{available}</small></span><b>{chosen ? 'Tu elección' : 'Según pedido'}</b></label>;
    })}</fieldset>
    <details className="erh-creation-details">
      <summary><span><i className="fas fa-sliders" aria-hidden="true" /> Afinar enfoque y presentación</span><i className="fas fa-chevron-down" aria-hidden="true" /></summary>
      <fieldset disabled={disabled}><legend className="erh-sr-only">Preferencias de mi informe</legend><p>Opcional. Puedes definirlo aquí o explicarlo en tu pedido.</p>
        <div className="erh-creation-field-grid">{select('audience','Para quién es',REPORT_AUDIENCES)}{select('depth','Extensión del informe',REPORT_DEPTHS.map(([key,label])=>[key,key==='standard' ? 'Equilibrado' : label]))}</div>
        {select('decisionHorizon','Horizonte de decisión',REPORT_HORIZONS)}
        <label className="erh-field"><span>Objetivo de mi informe</span><textarea aria-label="Objetivo de mi informe" rows={2} maxLength={400} value={pref.objective} placeholder="Ej. decidir compras, entender riesgos o preparar una reunión" onChange={event=>onPreference('objective',event.target.value)} /></label>
        <label className="erh-field"><span>Título de mi informe</span><input aria-label="Título de mi informe" maxLength={110} value={pref.customTitle} placeholder="Deja vacío para que ORION proponga el título" onChange={event=>onPreference('customTitle',event.target.value)} /></label>
        <div className="erh-creation-field-grid"><label className="erh-field"><span>Preparado para</span><input aria-label="Preparado para" maxLength={80} value={pref.recipientName} placeholder="Opcional" onChange={event=>onPreference('recipientName',event.target.value)} /></label><label className="erh-field"><span>Empresa o área</span><input aria-label="Empresa o área" maxLength={100} value={pref.organization} placeholder="Opcional" onChange={event=>onPreference('organization',event.target.value)} /></label></div>
        {select('confidentiality','Clasificación del documento',REPORT_CONFIDENTIALITY)}
      </fieldset>
    </details>
    <div className="erh-creation-choice-note"><i className="fas fa-circle-check" aria-hidden="true" /><p>{overrideFields.length ? 'Tus elecciones tienen prioridad sobre el pedido y se conservan en el PDF. Genera para aplicar los cambios.' : 'ORION interpretará tu pedido. Puedes elegir opciones para fijar tus preferencias.'}</p>{overrideFields.length>0 && <button type="button" disabled={disabled} onClick={onReleasePreferences}>Dejar que ORION decida</button>}</div>
  </section>;
}
