import assert from 'node:assert/strict';
import { reportOutline, reportBlockCount } from '../frontend/src/lib/reportOutline.js';
import { DEFAULT_REPORT_PREFERENCES, personalizeExecutiveReport } from '../frontend/src/lib/executiveReportPreferences.js';
import { finiteReportNumber, reportLineSeries } from '../frontend/src/lib/reportVisualData.js';

const report = { title: 'Informe', metrics: Array.from({ length: 7 }, (_, i) => ({ label: `Activo ${i}`, value: i + 1 })),
  visuals: [{ title: 'Serie 1' }, { title: 'Serie 2' }], tables: [{ rows: [['a']] }, { rows: [['b']] }],
  sections: Array.from({ length: 5 }, (_, i) => ({ heading: `Sección ${i}`, text: 'Evidencia del corte' })),
  sources: ['USDA', 'Rabobank'], sourceLinks: [{ label: 'USDA', url: 'https://usda.gov' }, { label: 'Mercolleida', url: 'https://mercolleida.com' }],
  watchlist: ['Riesgo operativo'], executiveBrief: { risks: ['Riesgo comercial'] }, closing: 'Conclusión del corte',
};
assert.equal(reportBlockCount(report, 'sources'), 3, 'Las fuentes con enlace se cuentan una sola vez');
assert.equal(reportBlockCount(report, 'risks'), 2, 'Incluye los riesgos del análisis ejecutivo');
assert.deepEqual(reportOutline(report, report.sections).map(block => block.key), ['summary', 'analysis', 'risks', 'closing', 'indicators', 'charts', 'tables']);
assert.equal(reportOutline(report, report.sections).find(block => block.key === 'indicators').count, 7);
const excluded = personalizeExecutiveReport(report, { ...DEFAULT_REPORT_PREFERENCES, sections: { ...DEFAULT_REPORT_PREFERENCES.sections, charts: false, risks: false, sources: false } });
assert.deepEqual(reportOutline(excluded, excluded.sections).map(block => block.key), ['summary', 'analysis', 'closing', 'indicators', 'tables']);
assert.equal(report.visuals.length, 2, 'Excluir un bloque no altera el informe base');
assert.equal(report.sources.length, 2);
assert.equal(report.sections.length, 5);
const restored = personalizeExecutiveReport(report, DEFAULT_REPORT_PREFERENCES);
assert.strictEqual(restored, report, 'Restaurar la edición conserva todos los datos originales');
const brief = personalizeExecutiveReport(report, { ...DEFAULT_REPORT_PREFERENCES, depth: 'brief' });
assert.equal(reportOutline(brief, brief.sections).find(block => block.key === 'indicators').count, 4, 'Los conteos corresponden a la edición visible');
assert.equal(reportOutline(brief, brief.sections).find(block => block.key === 'analysis').count, 3);
assert.deepEqual(reportOutline(null).map(block => block.key), ['summary']);
for (const value of [null, undefined, '', true, false, Infinity, 'sin dato']) assert.equal(finiteReportNumber(value), null, 'No convierte un dato ausente en cero');
assert.equal(finiteReportNumber(0), 0);
const plot = reportLineSeries({ series: [
  { label: 'A', points: [{ date: '2026-10-05', value: 12 }, { date: '2026-10-01', value: 10 }, { date: '2026-10-02', value: null }] },
  { label: 'B', points: [{ date: '2026-10-02', value: 8 }, { date: '2026-10-05', value: 9 }, { date: 'fecha inválida', value: 5 }] },
] });
assert.deepEqual(plot.dates.map(date => new Date(date).toISOString().slice(0, 10)), ['2026-10-01', '2026-10-02', '2026-10-05'], 'Las series comparten un eje de fechas real');
assert.equal(plot.series[0].points[0].value, 10);
assert.equal(plot.series[1].points.length, 2);
console.log('Report workspace tests: OK · visibilidad, conteos, exclusión y restauración');
