export const ORION_REPORT_HANDOFF_KEY = 'vn_orion_report_handoff_v1';

const AREA_LABELS = Object.freeze({
  finance: 'Finanzas',
  markets: 'Mercados',
  mexico: 'México',
  mine: 'Mis informes',
});

const PERIOD_LABELS = Object.freeze({
  daily: 'Corte diario',
  weekly: 'Edición semanal',
  annual: 'Anuario',
});

function safeSessionStorage() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function cleanInline(value, limit = 320) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

/**
 * Generates a compact, filesystem-safe Markdown filename from a report title.
 */
export function slugifyReportFilename(title, fallback = 'contexto-informe') {
  const ascii = String(title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${ascii || fallback}.md`;
}

function formatMarkdownTable(table) {
  const columns = Array.isArray(table?.columns) ? table.columns.slice(0, 10) : [];
  const rows = Array.isArray(table?.rows) ? table.rows.slice(0, 10) : [];
  if (!columns.length || !rows.length) return '';
  const esc = cell => cleanInline(cell, 160).replace(/\|/g, '\\|') || '—';
  const heading = table?.title ? `### ${cleanInline(table.title, 140)}\n\n` : '';
  const head = `| ${columns.map(esc).join(' | ')} |`;
  const sep = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map(row => `| ${columns.map((_, idx) => esc(row?.[idx])).join(' | ')} |`).join('\n');
  return `${heading}${head}\n${sep}\n${body}`;
}

/**
 * Packages the active report and optional verified ReportReader findings into
 * a structured handoff payload ready for `/orion`.
 */
export function buildReportOrionHandoff({
  area = '',
  report = null,
  reportDoc = null,
  response = null,
  question = '',
  cutLabel = '',
  accountEmail = '',
} = {}) {
  const digest = response?.digest || null;
  const reading = response?.reading || null;
  const source = reportDoc || report || {};
  const title = cleanInline(reading?.title || digest?.title || source.title || 'Informe ejecutivo', 140);
  const resolvedArea = area || digest?.collection || source.collection || 'reports';
  const areaLabel = AREA_LABELS[resolvedArea] || 'Informes';
  const rawPeriod = digest?.analysisPeriod || source.analysisPeriod || 'daily';
  const periodLabel = PERIOD_LABELS[rawPeriod] || 'Corte disponible';
  const cut = cleanInline(cutLabel || digest?.generatedAt || source.generatedAt || '', 120);
  const cleanQuestion = cleanInline(question, 900);

  const metrics = (digest?.metrics?.length ? digest.metrics : source.metrics || []).slice(0, 16);
  const signals = (digest?.signals?.length ? digest.signals : source.panorama?.signals || []).slice(0, 12);
  const tables = (digest?.tables?.length ? digest.tables : source.tables || []).slice(0, 4);
  const takeaways = (digest?.takeaways?.length ? digest.takeaways : source.takeaways || []).slice(0, 6);
  const watchlist = (digest?.watchlist?.length ? digest.watchlist : source.watchlist || []).slice(0, 6);
  const sections = (digest?.sections?.length ? digest.sections : source.sections || []).slice(0, 4);
  const summary = cleanInline(digest?.summary || source.summary || source.objective || '', 1200);
  const sources = (digest?.sources?.length ? digest.sources : source.sources || []).slice(0, 16);

  const lines = [
    `# ${title}`,
    '',
    `- **Área:** ${areaLabel}`,
    `- **Periodo:** ${periodLabel}`,
    cut ? `- **Corte de datos:** ${cut}` : '',
  ];

  if (reading) {
    lines.push('', `## Lectura verificada (${cleanInline(reading.agent || 'Lector de informes', 80)})`);
    if (reading.headline) lines.push('', `**${cleanInline(reading.headline, 180)}**`);
    if (reading.answer) lines.push('', cleanInline(reading.answer, 2200));
    if (Array.isArray(reading.keyPoints) && reading.keyPoints.length) {
      lines.push('', '### Puntos clave', ...reading.keyPoints.slice(0, 6).map(pt => `- ${cleanInline(pt, 320)}`));
    }
    if (Array.isArray(reading.missingData) && reading.missingData.length) {
      lines.push('', '### Brechas o datos no presentes en el corte', ...reading.missingData.slice(0, 5).map(gap => `- ${cleanInline(gap, 300)}`));
    }
  }

  if (summary) lines.push('', '## Resumen ejecutivo', '', summary);
  if (metrics.length) {
    lines.push(
      '',
      '## Métricas clave del corte',
      ...metrics.map(item => `- ${cleanInline(item.label, 120)}: ${cleanInline(item.value, 100)}${item.change ? ` (${cleanInline(item.change, 80)})` : ''}`),
    );
  }
  if (signals.length) {
    lines.push(
      '',
      '## Señales del panorama',
      ...signals.map(item => `- ${cleanInline(item.label, 120)}: ${cleanInline(item.value, 100)}${item.change ? ` (${cleanInline(item.change, 80)})` : ''}`),
    );
  }
  if (tables.length) {
    const formattedTables = tables.map(formatMarkdownTable).filter(Boolean);
    if (formattedTables.length) lines.push('', '## Tablas del informe', '', formattedTables.join('\n\n'));
  }
  if (takeaways.length) {
    lines.push('', '## Conclusiones clave', ...takeaways.map(item => `- ${cleanInline(item, 320)}`));
  }
  if (watchlist.length) {
    lines.push('', '## Puntos de vigilancia y riesgos', ...watchlist.map(item => `- ${cleanInline(item, 320)}`));
  }
  if (sections.length) {
    lines.push(
      '',
      '## Secciones del informe',
      ...sections.map(sec => `### ${cleanInline(sec.heading, 140)}\n${cleanInline(sec.text, 1200)}`).filter(Boolean),
    );
  }
  if (sources.length) {
    lines.push('', '## Fuentes citadas en el corte', ...sources.map(src => `- ${cleanInline(src, 180)}`));
  }

  const markdown = lines.filter(line => line !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 14_000);

  let prompt;
  if (cleanQuestion) {
    prompt = `Con base en el informe adjunto "${title}" (${areaLabel}), responde y profundiza: ${cleanQuestion}\n\nContrasta con datos actualizados cuando haga falta, explica las implicaciones prácticas y genera una tabla o gráfica comparativa.`;
  } else if (Array.isArray(reading?.missingData) && reading.missingData.length) {
    const gaps = reading.missingData.slice(0, 2).map(gap => cleanInline(gap, 140)).join('; ');
    prompt = `Profundiza el informe adjunto "${title}" (${areaLabel}). Investiga con datos actualizados las brechas detectadas (${gaps}), evalúa escenarios e incluye una tabla o gráfica comparativa.`;
  } else {
    prompt = `Analiza en profundidad el informe adjunto "${title}" (${areaLabel}), contrasta sus cifras principales con el contexto reciente de mercado, identifica riesgos e implicaciones y genera una tabla o gráfica comparativa.`;
  }

  return {
    version: 1,
    title,
    area: resolvedArea,
    reportKey: cleanInline(source.key || digest?.key || '', 120),
    analysisPeriod: rawPeriod,
    cutLabel: cut,
    accountEmail: cleanInline(accountEmail, 240).toLowerCase(),
    fileName: slugifyReportFilename(title),
    markdown,
    prompt,
    createdAt: Date.now(),
  };
}

/**
 * Writes the serialized report handoff to sessionStorage for consumption by `/orion`.
 */
export function writeOrionReportHandoff(handoff, storage = safeSessionStorage()) {
  if (!storage || !handoff || handoff.version !== 1 || !handoff.markdown || !handoff.prompt) return false;
  try {
    storage.setItem(ORION_REPORT_HANDOFF_KEY, JSON.stringify({
      ...handoff,
      createdAt: Number(handoff.createdAt || Date.now()),
    }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads and clears the pending report handoff once, verifying freshness and account scope.
 */
export function consumeOrionReportHandoff(storage = safeSessionStorage(), { owner = '', maxAgeMs = 15 * 60 * 1000 } = {}) {
  if (!storage) return null;
  let raw = null;
  try {
    raw = storage.getItem(ORION_REPORT_HANDOFF_KEY);
    storage.removeItem(ORION_REPORT_HANDOFF_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return null;
    if (typeof parsed.markdown !== 'string' || !parsed.markdown.trim()) return null;
    if (typeof parsed.prompt !== 'string' || !parsed.prompt.trim()) return null;
    const age = Date.now() - Number(parsed.createdAt || 0);
    if (!Number.isFinite(age) || age < -60_000 || age > maxAgeMs) return null;
    const expectedOwner = cleanInline(owner, 240).toLowerCase();
    const handoffOwner = cleanInline(parsed.accountEmail, 240).toLowerCase();
    if (handoffOwner && expectedOwner && handoffOwner !== expectedOwner) return null;
    return parsed;
  } catch {
    return null;
  }
}
