import { normalizePreferences, REPORT_AUDIENCES, REPORT_HORIZONS, REPORT_CONFIDENTIALITY } from './executiveReportPreferences.js';

export function reportHasContent(report) {
  return Boolean(
    typeof report?.summary==='string' && report.summary.trim()
    || typeof report?.content==='string' && report.content.trim()
    || Array.isArray(report?.sections) && report.sections.some(section=>typeof section?.text==='string' && section.text.trim())
    || Array.isArray(report?.metrics) && report.metrics.length
    || Array.isArray(report?.tables) && report.tables.length
  );
}

export function reportEditionPreferences(report, fallback) {
  return normalizePreferences(report?.userEdition ? { ...report.aiEdition?.preferences, ...report.personalization } : fallback);
}

// La estructura e identidad se aplican sin reescribir ni recortar el material
// que necesita Gemini para generar una nueva versión.
export function visibleReportEdition(report, input) {
  if (!report) return null;
  const preferences = normalizePreferences(input);
  const label = (options, key) => options.find(([value]) => value === key)?.[1] || '';
  // Las versiones anteriores podían guardar el análisis sólo en content.
  // Conviértelo a una sección antes de retirar ese campo de la copia visible.
  const sections = report.sections?.some(section => typeof section?.text==='string' && section.text.trim()) ? report.sections
    : typeof report.content === 'string' && report.content.trim() ? [{ heading: 'Contenido del informe', text: report.content }] : report.sections || [];
  return { ...report, sections, title: preferences.customTitle || report.title,
    personalization: { ...preferences, audienceLabel: label(REPORT_AUDIENCES, preferences.audience), horizon: label(REPORT_HORIZONS, preferences.decisionHorizon), confidentialityLabel: label(REPORT_CONFIDENTIALITY, preferences.confidentiality) },
    metrics: preferences.sections.indicators ? report.metrics || [] : [],
    visuals: preferences.sections.charts ? report.visuals || [] : [],
    tables: preferences.sections.tables ? report.tables || [] : [],
    watchlist: preferences.sections.risks ? report.watchlist || [] : [],
    sources: preferences.sections.sources ? report.sources || [] : [],
    sourceLinks: preferences.sections.sources ? report.sourceLinks || [] : [],
    ...(report.executiveBrief && !preferences.sections.risks ? { executiveBrief: { ...report.executiveBrief, risks: [] } } : {}),
    content: '',
  };
}

export function reportAiFocusSignature(input) {
  const pref = normalizePreferences(input);
  return JSON.stringify(pref);
}
