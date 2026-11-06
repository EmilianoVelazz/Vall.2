import { useEffect, useState } from 'react';
import { REPORT_AUDIENCES, REPORT_CONFIDENTIALITY, REPORT_DEPTHS, REPORT_HORIZONS } from '../lib/executiveReportPreferences.js';
import { REPORT_CONTENT_BLOCKS, reportBlockCount } from '../lib/reportOutline.js';
import {useReportText} from '../lib/reportLocale.jsx';

export function ReportSelectField({ label, value, options, onChange }) {
  const t=useReportText();
  return <label className="erh-field"><span>{t(label)}</span><select aria-label={t(label)} value={value} onChange={event => onChange(event.target.value)}>{options.map(([key, text]) => <option key={key} value={key}>{t(text)}</option>)}</select></label>;
}

export function ReportEditorIndex({ headingRef, manual = false }) {
  const [selected, setSelected] = useState('ai');
  useEffect(() => {
    const panel = headingRef.current?.closest('.erh-edition');
    const focusSection = event => {
      const section = event.target.closest('[id^="erh-setting-"]');
      if(section) setSelected(section.id.replace('erh-setting-', ''));
    };
    panel?.addEventListener('focusin', focusSection);
    return () => panel?.removeEventListener('focusin', focusSection);
  }, [headingRef]);
  return <nav className="erh-editor-index" aria-label="Secciones del editor">{[['ai', 'IA'], ['focus', 'Enfoque'], ['identity', 'Identidad'], ['content', 'Bloques'], ...(manual ? [['manual', 'Texto']] : [])].map(([key, label]) => <button key={key} type="button" aria-current={selected === key ? 'location' : undefined} onClick={() => {
    const section = headingRef.current?.closest('.erh-edition').querySelector(`#erh-setting-${key}`);
    if(!section) return;
    if(section.tagName === 'DETAILS') section.open = true;
    const scroll = section.closest('.erh-edition-scroll');
    scroll?.scrollTo({ top: scroll.scrollTop + section.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 16, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    section?.focus({ preventScroll: true });
    setSelected(key);
  }}>{label}</button>)}</nav>;
}

function EditorSection({ name, number, title, summary, children, disabled }) {
  return <details id={`erh-setting-${name}`} tabIndex={-1} className="erh-editor-section">
    <summary><span className="erh-section-number">{number}</span><span><strong>{title}</strong><small>{summary}</small></span><i className="fas fa-chevron-down" aria-hidden="true" /></summary>
    <fieldset className="erh-setting-group" disabled={disabled}><legend className="erh-sr-only">{title}</legend>{children}</fieldset>
  </details>;
}

export default function ReportCustomizationFields({ preferences: pref, report, onChange, disabled }) {
  const label = (options, value) => options.find(([key]) => key === value)?.[1] || '';
  const included = REPORT_CONTENT_BLOCKS.filter(block => pref.sections[block.key]).length;
  return <div className="erh-customization-fields">
    <EditorSection name="focus" number="01" title="Enfoque de la lectura" summary={`${label(REPORT_AUDIENCES, pref.audience)} · ${label(REPORT_DEPTHS, pref.depth)}`} disabled={disabled}><p>La IA usará audiencia, detalle, horizonte y objetivo para redactar el resumen, el análisis y las conclusiones.</p>
      <ReportSelectField label="Audiencia" value={pref.audience} options={REPORT_AUDIENCES} onChange={value => onChange('audience', value)} />
      <ReportSelectField label="Nivel de detalle" value={pref.depth} options={REPORT_DEPTHS} onChange={value => onChange('depth', value)} />
      <ReportSelectField label="Horizonte de decisión" value={pref.decisionHorizon} options={REPORT_HORIZONS} onChange={value => onChange('decisionHorizon', value)} />
      <label className="erh-field"><span>Objetivo <small>Opcional</small></span><textarea aria-label="Objetivo de la personalización" value={pref.objective} maxLength={400} rows={3} placeholder="¿Qué debe ayudarte a decidir este informe?" onChange={event => onChange('objective', event.target.value)} /><small className="erh-field-help">{pref.objective.length}/400 caracteres</small></label>
    </EditorSection>
    <EditorSection name="identity" number="02" title="Identidad del documento" summary={`${pref.recipientName || 'Tu edición'} · ${label(REPORT_CONFIDENTIALITY, pref.confidentiality)}`} disabled={disabled}><p>La IA recibe el título, el destinatario, la empresa y la clasificación. Se conservan también en el documento y el PDF.</p>
      <label className="erh-field"><span>Título de tu edición</span><input aria-label="Título de tu edición" value={pref.customTitle} maxLength={110} placeholder={report?.title || 'La IA puede proponer el título'} onChange={event => onChange('customTitle', event.target.value)} /></label>
      <label className="erh-field"><span>Preparado para <small>Opcional</small></span><input aria-label="Preparado para" value={pref.recipientName} maxLength={80} placeholder="Nombre del destinatario" onChange={event => onChange('recipientName', event.target.value)} /></label>
      <label className="erh-field"><span>Empresa o área <small>Opcional</small></span><input aria-label="Empresa o área" value={pref.organization} maxLength={100} placeholder="Ej. Dirección financiera" onChange={event => onChange('organization', event.target.value)} /></label>
      <ReportSelectField label="Clasificación" value={pref.confidentiality} options={REPORT_CONFIDENTIALITY} onChange={value => onChange('confidentiality', value)} />
    </EditorSection>
    <EditorSection name="content" number="03" title="Bloques incluidos" summary={`${included} de ${REPORT_CONTENT_BLOCKS.length} bloques seleccionados`} disabled={disabled}><p>ORION recibe tu selección y genera la edición con esos bloques. El resumen y el análisis se mantienen; los bloques excluidos también se omiten del PDF.</p>
      <div className="erh-content-options">{REPORT_CONTENT_BLOCKS.map(block => {
        const count = reportBlockCount(report, block.key);
        return <label key={block.key} className={pref.sections[block.key] ? 'is-included' : ''}>
          <input type="checkbox" aria-label={`Incluir ${block.label.toLowerCase()}`} checked={pref.sections[block.key]} onChange={event => onChange('sections', { ...pref.sections, [block.key]: event.target.checked })} />
          <i className={`fas ${block.icon}`} aria-hidden="true" /><span><strong>{block.label}</strong><small>{count} {count === 1 ? 'elemento disponible' : 'elementos disponibles'}</small></span><b>{pref.sections[block.key] ? 'Incluido' : 'Excluido'}</b>
        </label>;
      })}</div>
    </EditorSection>
  </div>;
}
