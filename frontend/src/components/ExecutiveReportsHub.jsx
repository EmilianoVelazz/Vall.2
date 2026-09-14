import { useEffect, useState } from 'react';
import { startGeminiLive, supportsGeminiLive } from '../lib/geminiLive.js';
import './ExecutiveReportsHub.css';

const AREAS = {
  finance: { label: 'Finanzas', icon: 'fa-chart-line', endpoint: '/api/finance-executive-reports', empty: 'Los informes de Finanzas no están disponibles por el momento.' },
  markets: { label: 'Mercados', icon: 'fa-wheat-awn', endpoint: '/api/market-executive-reports', empty: 'Los informes de Mercados no están disponibles por el momento.' },
};

function reportText(report) {
  if (report?.content) return String(report.content).slice(0, 20_000);
  return [
    `# ${report?.title || 'Informe ejecutivo'}`,
    report?.eyebrow || '', report?.summary || '',
    ...(report?.metrics || []).map(item => `- ${item.label}: ${item.value}${item.change ? ` (${item.change})` : ''}`),
    ...(report?.sections || []).map(section => `## ${section.heading}\n${section.text}`),
    `Fuentes: ${(report?.sources || []).join(', ') || 'sin fuente disponible'}.`,
  ].filter(Boolean).join('\n\n');
}

function cutLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Corte disponible' : `Corte ${date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}`;
}

function cleanLine(value) {
  return String(value || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/`/g, '')
    .trim();
}

function reportChapters(report) {
  if (Array.isArray(report?.sections) && report.sections.length) {
    return report.sections.map(section => ({ heading: cleanLine(section.heading), body: cleanLine(section.text) })).filter(chapter => chapter.body);
  }
  const raw = reportText(report).replace(/\r/g, '');
  return raw.split(/^##\s+/m).slice(1).map(section => {
    const [heading = 'Lectura', ...body] = section.split('\n');
    return { heading: cleanLine(heading), body: cleanLine(body.join('\n')) };
  }).filter(chapter => chapter.body);
}

const VISUAL_COLORS = ['#7ce4fb', '#f2b56d', '#9ce4bf', '#f491b3', '#b8a4ff'];

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function comparisonRows(report) {
  const found = [];
  const walk = (value, depth = 0) => {
    if (!value || depth > 5) return;
    if (Array.isArray(value)) { value.forEach(item => walk(item, depth + 1)); return; }
    if (typeof value !== 'object') return;
    const current = numeric(value.value);
    const previous = numeric(value.previous);
    if (typeof value.label === 'string' && current !== null && previous !== null && previous !== 0) {
      const change = numeric(value.change) ?? ((current - previous) / previous) * 100;
      found.push({ label: value.label, current, previous, change, unit: value.unit || '' });
    }
    Object.values(value).forEach(item => walk(item, depth + 1));
  };
  walk(report?.sourceSnapshot);
  const unique = new Map();
  found.forEach(item => { if (!unique.has(item.label)) unique.set(item.label, item); });
  return [...unique.values()].slice(0, 4);
}

function comparisonValue(value) {
  return value.toLocaleString('es-MX', { maximumFractionDigits: Math.abs(value) >= 100 ? 2 : 4 });
}

function shortDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function LineVisual({ visual }) {
  const width = 640; const height = 190; const pad = { left: 40, right: 12, top: 18, bottom: 28 };
  const usableWidth = width - pad.left - pad.right; const usableHeight = height - pad.top - pad.bottom;
  const series = (visual.series || []).map(item => ({ ...item, points: (item.points || []).map(point => ({ ...point, value: numeric(point.value) })).filter(point => point.value !== null) })).filter(item => item.points.length > 1);
  const values = series.flatMap(item => item.points.map(point => point.value));
  if (!values.length) return null;
  const rawMin = Math.min(...values); const rawMax = Math.max(...values); const gap = (rawMax - rawMin) || Math.max(Math.abs(rawMax) * .04, 1);
  const min = rawMin - gap * .12; const max = rawMax + gap * .12;
  const x = (index, count) => pad.left + (count <= 1 ? 0 : (index / (count - 1)) * usableWidth);
  const y = value => pad.top + (1 - ((value - min) / (max - min))) * usableHeight;
  const line = points => points.map((point, index) => `${index ? 'L' : 'M'}${x(index, points.length).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
  const tickDates = series[0]?.points || [];
  const dateIndexes = [0, Math.round((tickDates.length - 1) / 2), tickDates.length - 1];
  return <figure className="erh-chart" aria-label={visual.title}>
    <figcaption><span><i className="fas fa-chart-line" aria-hidden="true" /> {visual.title}</span><small>{visual.unit}</small></figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${visual.title}. ${visual.note || ''}`}>
      {[0, .5, 1].map(position => { const value = max - ((max - min) * position); const yy = y(value); return <g key={position}><line x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} className="erh-chart-grid" /><text x={pad.left - 7} y={yy + 3} textAnchor="end" className="erh-chart-axis">{value.toLocaleString('es-MX', { maximumFractionDigits: 2 })}</text></g>; })}
      {series.map((item, index) => <path key={item.label} d={line(item.points)} fill="none" stroke={VISUAL_COLORS[index % VISUAL_COLORS.length]} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />)}
      {dateIndexes.map(index => tickDates[index] && <text key={index} x={x(index, tickDates.length)} y={height - 8} textAnchor={index === 0 ? 'start' : index === tickDates.length - 1 ? 'end' : 'middle'} className="erh-chart-axis">{shortDate(tickDates[index].date)}</text>)}
    </svg>
    <div className="erh-chart-legend">{series.map((item, index) => <span key={item.label}><i style={{ backgroundColor: VISUAL_COLORS[index % VISUAL_COLORS.length] }} />{item.label}</span>)}</div>
    {visual.note && <p>{visual.note}</p>}
  </figure>;
}

function BarVisual({ visual }) {
  const bars = (visual.bars || []).map(item => ({ ...item, value: numeric(item.value) })).filter(item => item.value !== null);
  const max = Math.max(...bars.map(item => item.value), 1);
  if (!bars.length) return null;
  return <figure className="erh-chart erh-bar-chart" aria-label={visual.title}>
    <figcaption><span><i className="fas fa-chart-column" aria-hidden="true" /> {visual.title}</span><small>{visual.unit}</small></figcaption>
    <div className="erh-bars">{bars.map((item, index) => <div key={item.label}><span>{item.label}</span><i><b style={{ width: `${(item.value / max) * 100}%`, backgroundColor: VISUAL_COLORS[index % VISUAL_COLORS.length] }} /></i><strong>{item.value}</strong></div>)}</div>
    {visual.note && <p>{visual.note}</p>}
  </figure>;
}

function ReportVisuals({ report, compact = false }) {
  const visuals = compact ? (report.visuals || []).slice(0, 1) : (report.visuals || []);
  if (!visuals.length) return null;
  return <div className="erh-visuals">{visuals.map(visual => visual.type === 'bar' ? <BarVisual key={visual.title} visual={visual} /> : <LineVisual key={visual.title} visual={visual} />)}</div>;
}

function ReportTables({ report, compact = false }) {
  const tables = compact ? (report.tables || []).slice(0, 1) : (report.tables || []);
  if (!tables.length) return null;
  return <div className="erh-tables">{tables.map(table => <section key={table.title} className="erh-table-wrap"><header><h4>{table.title}</h4>{table.note && <p>{table.note}</p>}</header><div><table><thead><tr>{table.columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{table.rows.slice(0, compact ? 4 : undefined).map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>{compact && table.rows.length > 4 && <small>La lectura completa incluye {table.rows.length - 4} filas adicionales.</small>}</section>)}</div>;
}

function ExecutiveDesk({ brief }) {
  if (!brief?.generated) return null;
  const drivers = (brief.drivers || []).slice(0, 3);
  const risks = (brief.risks || []).slice(0, 3);
  return <section className="erh-executive-desk">
    <h4><i className="fas fa-compass" aria-hidden="true" /> {brief.agent || 'VALL Executive Desk'}<small>{brief.mode === 'ai' ? 'Lectura con IA' : 'Síntesis del corte'}</small></h4>
    {brief.headline && <p className="erh-executive-headline">{brief.headline}</p>}
    {brief.context && <p className="erh-executive-context"><strong>Contexto:</strong> {brief.context}</p>}
    {brief.thesis && <p className="erh-executive-thesis">{brief.thesis}</p>}
    {(drivers.length > 0 || risks.length > 0) && <div className="erh-executive-grid">
      {drivers.length > 0 && <div><strong>Impulsores visibles</strong><ul>{drivers.map(item => <li key={item}>{item}</li>)}</ul></div>}
      {risks.length > 0 && <div><strong>Riesgos a contrastar</strong><ul>{risks.map(item => <li key={item}>{item}</li>)}</ul></div>}
    </div>}
    {brief.committeeQuestion && <p className="erh-committee-question"><i className="fas fa-circle-question" aria-hidden="true" /> <span>Pregunta para comité:</span> {brief.committeeQuestion}</p>}
    {brief.evidenceNote && <small className="erh-evidence-note">{brief.evidenceNote}</small>}
  </section>;
}

function BeforeAfter({ report, compact = false }) {
  const rows = comparisonRows(report).slice(0, compact ? 2 : 4);
  if (!rows.length) return null;
  return <section className="erh-before-after">
    <header><h4><i className="fas fa-arrow-right-arrow-left" aria-hidden="true" /> Antes vs. ahora</h4><small>Cierre previo → corte actual</small></header>
    <div className="erh-before-after-grid">
      {rows.map(row => <div key={row.label} className={row.change >= 0 ? 'is-up' : 'is-down'}>
        <strong>{row.label}</strong>
        <span><b>Antes</b>{comparisonValue(row.previous)}{row.unit && <em>{row.unit}</em>}</span>
        <i aria-hidden="true" />
        <span><b>Ahora</b>{comparisonValue(row.current)}{row.unit && <em>{row.unit}</em>}</span>
        <mark>{row.change >= 0 ? '+' : ''}{row.change.toFixed(2)}%</mark>
      </div>)}
    </div>
    <p>Comparación calculada contra la observación previa disponible de la misma serie; no equivale a precio físico ni a una recomendación.</p>
  </section>;
}

function ExecutiveBrief({ report, compact = false }) {
  const takeaways = (report.takeaways || []).slice(0, compact ? 3 : 4);
  const watchlist = (report.watchlist || []).slice(0, compact ? 2 : 3);
  if (!report.objective && !takeaways.length && !watchlist.length) return null;
  return <div className="erh-brief">
    {report.objective && <section className="erh-objective"><i className="fas fa-bullseye" aria-hidden="true" /><div><small>Objetivo del informe</small><p>{report.objective}</p></div></section>}
    <BeforeAfter report={report} compact={compact} />
    <ExecutiveDesk brief={report.executiveBrief} />
    {takeaways.length > 0 && <section><h4><i className="fas fa-sparkles" aria-hidden="true" /> Conclusiones clave</h4><ol>{takeaways.map(item => <li key={item}>{item}</li>)}</ol></section>}
    {watchlist.length > 0 && <section><h4><i className="fas fa-binoculars" aria-hidden="true" /> Qué monitorear</h4><ul>{watchlist.map(item => <li key={item}>{item}</li>)}</ul></section>}
  </div>;
}

function ReportSources({ report, compact = false }) {
  const items = Array.isArray(report?.sourceLinks) ? report.sourceLinks.filter(item => item?.label) : [];
  if (!items.length) return null;
  const visible = compact ? items.slice(0, 3) : items;
  return <section className="erh-report-sources" aria-label="Fuentes verificadas">
    <h4><i className="fas fa-shield-halved" aria-hidden="true" /> Fuentes verificadas</h4>
    <p>Las fuentes se separan de los titulares para mantener una lectura limpia.</p>
    <ul>
      {visible.map((item, index) => <li key={`${item.url || item.label}-${index}`}>
        <span>{item.label}</span>
        {item.url && <a href={item.url} target="_blank" rel="noreferrer"><i className="fas fa-arrow-up-right-from-square" aria-hidden="true" /> Ver nota original</a>}
      </li>)}
    </ul>
    {compact && items.length > visible.length && <small>Abre la lectura completa para ver las {items.length} fuentes.</small>}
  </section>;
}

function ReportReader({ report, compact = false }) {
  const chapters = reportChapters(report);
  const visible = compact ? chapters.slice(0, 3) : chapters;
  return (
    <div className={compact ? 'erh-reader erh-reader-compact' : 'erh-reader'}>
      <ExecutiveBrief report={report} compact={compact} />
      <ReportVisuals report={report} compact={compact} />
      <ReportTables report={report} compact={compact} />
      {visible.map(chapter => (
        <section key={chapter.heading} className="erh-reader-chapter">
          <h4>{chapter.heading}</h4>
          {chapter.body.split(/\n{2,}/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </section>
      ))}
      {compact && chapters.length > visible.length && <p className="erh-reader-more"><i className="fas fa-book-open" aria-hidden="true" /> Incluye {chapters.length - visible.length} secciones más en la lectura completa.</p>}
      <ReportSources report={report} compact={compact} />
    </div>
  );
}

export default function ExecutiveReportsHub() {
  const [area, setArea] = useState('finance');
  const [reportSets, setReportSets] = useState({ finance: null, markets: null });
  const [selected, setSelected] = useState({ finance: null, markets: null });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Elige una familia para consultar el último corte.');
  const [reader, setReader] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const reports = reportSets[area]?.data || [];
  const active = selected[area] || reports[0] || null;

  useEffect(() => () => { reader?.stop?.().catch(() => {}); }, [reader]);

  useEffect(() => {
    if (reportSets[area]) return;
    let activeRequest = true;
    setLoading(true);
    setStatus('Consultando el último corte…');
    fetch(AREAS[area].endpoint, { credentials: 'include' })
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.error || 'No fue posible cargar los informes.');
        return payload;
      })
      .then(payload => {
        if (!activeRequest) return;
        setReportSets(current => ({ ...current, [area]: payload }));
        setSelected(current => ({ ...current, [area]: payload.data?.[0] || null }));
        setStatus(payload.data?.length ? 'Elige un informe para descargarlo o escucharlo.' : AREAS[area].empty);
      })
      .catch(error => activeRequest && setStatus(error.message || AREAS[area].empty))
      .finally(() => activeRequest && setLoading(false));
    return () => { activeRequest = false; };
    // La petición pertenece al área que estaba activa al iniciarse. Los cambios
    // de carga no son dependencias: si lo fueran, limpiarían esta petición antes
    // de que pudiera pintar su respuesta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area]);

  const changeArea = nextArea => {
    if (reader) { reader.stop?.().catch(() => {}); setReader(null); }
    setPreviewOpen(false);
    setArea(nextArea);
  };

  const selectReport = report => {
    setSelected(current => ({ ...current, [area]: report }));
    setStatus(`Vista previa lista: ${report.title}.`);
  };

  const downloadPdf = async event => {
    if (!active || event.currentTarget.disabled) return;
    const button = event.currentTarget;
    button.disabled = true;
    setStatus('Preparando PDF…');
    try {
      const response = await fetch('/api/report-export', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `VALLNEWS · ${AREAS[area].label} · ${active.title}`, content: reportText(active), executiveReport: active, format: 'pdf' }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.downloadUrl) throw new Error(payload.error || 'No se pudo generar el PDF.');
      const link = document.createElement('a');
      link.href = payload.downloadUrl; link.download = payload.filename || `${active.key}.pdf`;
      document.body.append(link); link.click(); link.remove();
      setStatus('PDF listo para descargar.');
    } catch (error) { setStatus(error.message || 'No se pudo descargar el PDF.'); }
    finally { button.disabled = false; }
  };

  const listen = async event => {
    if (!active) return;
    const button = event.currentTarget;
    if (reader) {
      await reader.stop?.().catch(() => {});
      setReader(null);
      setStatus('Lectura detenida.');
      return;
    }
    if (!supportsGeminiLive()) { setStatus('La lectura con VALL AI requiere HTTPS y un navegador compatible.'); return; }
    button.disabled = true;
    setStatus('Conectando con VALL AI…');
    try {
      const session = await startGeminiLive({
        captureMicrophone: false,
        onState: state => setStatus({ connecting: 'Conectando con VALL AI…', listening: 'VALL AI está listo para leer el informe.', speaking: 'VALL AI está leyendo el informe…' }[state] || 'Lectura finalizada.'),
        onError: message => { setReader(null); setStatus(`Lectura no disponible: ${message}`); },
      });
      setReader(session);
      session.speak(`Lee en voz alta este informe ejecutivo de ${AREAS[area].label} de manera clara, natural y profesional. No agregues cifras, fuentes o consejos que no estén en el texto. ${reportText(active)}`);
    } catch (error) { setStatus(error.message || 'No se pudo iniciar VALL AI.'); }
    finally { button.disabled = false; }
  };

  return (
    <section className="erh" aria-labelledby="erh-title" data-revelar="">
      <div className="erh-heading">
        <span className="erh-kicker"><i className="fas fa-file-lines" aria-hidden="true" /> Informes ejecutivos</span>
        <h2 id="erh-title">Diez cortes, una sola biblioteca</h2>
        <p>Explora cada corte como una colección: revisa una lectura previa, abre el informe completo, descárgalo en PDF o deja que VALL AI lo lea. Se actualizan cada 12 horas.</p>
      </div>
      <div className="erh-workspace">
        <div className="erh-switch" role="tablist" aria-label="Familia de informes">
          {Object.entries(AREAS).map(([key, item]) => (
            <button key={key} type="button" role="tab" aria-selected={area === key} aria-controls="erh-library-panel" className={area === key ? 'is-active' : ''} onClick={() => changeArea(key)}>
              <i className={`fas ${item.icon}`} aria-hidden="true" /> {item.label}<small>{reportSets[key]?.data?.length || 5}</small>
            </button>
          ))}
        </div>
        <div className="erh-library" id="erh-library-panel" role="tabpanel">
          <div className="erh-shelf" aria-label={`Colección de informes de ${AREAS[area].label}`}>
            <div className="erh-shelf-heading"><span>Estantería</span><small>{loading ? 'Cargando…' : `${reports.length} cortes disponibles`}</small></div>
            <div className="erh-books">
              {loading && <span className="erh-loading">Preparando la colección…</span>}
              {!loading && reports.map((report, index) => <button key={report.key} type="button" className={`erh-book ${active?.key === report.key ? 'is-active' : ''}`} aria-pressed={active?.key === report.key} onClick={() => selectReport(report)}>
                <span className="erh-book-spine"><i className={`fas ${AREAS[area].icon}`} aria-hidden="true" /><b>{String(index + 1).padStart(2, '0')}</b></span>
                <span className="erh-book-copy"><small>{report.eyebrow || 'Informe ejecutivo'}</small><strong>{report.title}</strong><em>{report.summary || 'Abrir lectura previa del corte.'}</em></span>
                <i className="fas fa-arrow-right erh-book-arrow" aria-hidden="true" />
              </button>)}
            </div>
          </div>
          <div className="erh-reading-desk">
            {active ? <>
              <header className="erh-preview-head">
                <span className="erh-preview-mark"><i className={`fas ${AREAS[area].icon}`} aria-hidden="true" /></span>
                <div><small>{active.eyebrow || 'Informe ejecutivo'}</small><h3>{active.title}</h3><p>{cutLabel(active.generatedAt)}</p></div>
              </header>
              <p className="erh-preview-summary">{active.summary}</p>
              <div className="erh-metrics" aria-label="Indicadores destacados">
                {(active.metrics || []).slice(0, 4).map(metric => <span key={metric.label}><small>{metric.label}</small><b>{metric.value}</b>{metric.change && <em className={metric.tone === 'down' ? 'is-down' : ''}>{metric.change}</em>}</span>)}
              </div>
              <div className="erh-preview-window" aria-label={`Vista previa de ${active.title}`} tabIndex="0"><ReportReader report={active} compact /></div>
              <div className="erh-actions">
                <button type="button" className="erh-preview-open" onClick={() => setPreviewOpen(true)}><i className="fas fa-book-open" aria-hidden="true" /> Leer vista completa</button>
                <button type="button" className="erh-download" onClick={downloadPdf}><i className="fas fa-file-pdf" aria-hidden="true" /> Descargar PDF</button>
                <button type="button" className="erh-listen" onClick={listen}><i className={`fas ${reader ? 'fa-stop' : 'fa-headphones'}`} aria-hidden="true" /> {reader ? 'Detener lectura' : 'Escuchar con VALL AI'}</button>
              </div>
            </> : <p className="erh-empty">Selecciona un informe para abrir su mesa de lectura.</p>}
            <p className="erh-status" aria-live="polite">{status}</p>
          </div>
        </div>
      </div>
      {previewOpen && active && <div className="erh-modal" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPreviewOpen(false); }}>
        <section className="erh-modal-paper" role="dialog" aria-modal="true" aria-labelledby="erh-reader-title">
          <header><div><span>{AREAS[area].label} · lectura completa</span><h3 id="erh-reader-title">{active.title}</h3><p>{cutLabel(active.generatedAt)}</p></div><button type="button" aria-label="Cerrar lectura completa" onClick={() => setPreviewOpen(false)}><i className="fas fa-xmark" /></button></header>
          <div className="erh-modal-body"><ReportReader report={active} /></div>
          <footer><button type="button" className="erh-listen" onClick={listen}><i className={`fas ${reader ? 'fa-stop' : 'fa-headphones'}`} aria-hidden="true" /> {reader ? 'Detener lectura' : 'Escuchar con VALL AI'}</button><button type="button" className="erh-download" onClick={downloadPdf}><i className="fas fa-file-pdf" aria-hidden="true" /> Descargar PDF</button></footer>
        </section>
      </div>}
    </section>
  );
}
