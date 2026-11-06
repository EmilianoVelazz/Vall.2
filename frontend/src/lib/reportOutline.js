import { executiveReading } from './reportReading.js';
import { reportLayout } from './reportLayout.js';
import { sourceEntries } from './reportSources.js';
import {weeklyReport} from '../../../shared/report-weekly.mjs';
import {reportReaderOrder} from './reportReaderOrder.js';

export const REPORT_CONTENT_BLOCKS = [
  { key: 'indicators', label: 'Indicadores', icon: 'fa-gauge-high', field: 'metrics', note: 'Valores y variaciones del corte' },
  { key: 'charts', label: 'Gráficas', icon: 'fa-chart-line', field: 'visuals', note: 'Series y comparaciones visuales' },
  { key: 'tables', label: 'Tablas', icon: 'fa-table-list', field: 'tables', note: 'Detalle de los datos disponibles' },
  { key: 'risks', label: 'Riesgos', icon: 'fa-shield-halved', field: 'watchlist', note: 'Señales que necesitan seguimiento' },
  { key: 'sources', label: 'Fuentes', icon: 'fa-link', field: 'sources', note: 'Referencias y enlaces del informe' },
];

export function reportBlockCount(report, key) {
  if (!report) return 0;
  if (key === 'risks') return executiveReading(report).risks.length;
  if (key === 'sources') return sourceEntries(report).length;
  const block = REPORT_CONTENT_BLOCKS.find(item => item.key === key);
  return block ? (report[block.field] || []).length : 0;
}

export function reportOutline(report, chapters = []) {
  const blocks = [
    { key: 'summary', label: 'Resumen ejecutivo', icon: 'fa-align-left', count: null },
    { key: 'analysis', label: 'Análisis e implicaciones', icon: 'fa-book-open', count: chapters.length },
    { ...REPORT_CONTENT_BLOCKS[3], count: reportBlockCount(report, 'risks') },
    ...(report?.closing ? [{ key: 'closing', label: 'Decisión y seguimiento', icon: 'fa-flag-checkered', count: null }] : []),
    ...REPORT_CONTENT_BLOCKS.slice(0, 3).map(block => ({ ...block, count: reportBlockCount(report, block.key) })),
  ].filter(block => block.count === null || block.count > 0);
  const layout = reportLayout(report);
  if(layout?.composition==='weekly-sheet') return reportReaderOrder(weeklyReport(report).blocks.map(block=>block.key==='results' ? {...block,label:layout.label} : block));
  if (layout?.composition === 'company-dashboard') {
    const labels = {summary:'Lectura del periodo',charts:layout.chartHeading,tables:'Detalle de referencias',indicators:'Indicadores del corte',analysis:'Análisis para el destinatario'};
    const dashboard = blocks.filter(block => !['risks','closing'].includes(block.key)).map(block => ({...block,label:labels[block.key] || block.label}));
    if (report?.closing || executiveReading(report).highlights.length || reportBlockCount(report,'risks')) dashboard.push({key:'conclusions',label:'Conclusiones',icon:'fa-list-check',count:null});
    return reportReaderOrder([...dashboard.sort((a,b) => layout.order.indexOf(a.key) - layout.order.indexOf(b.key)),{key:'causes',number:'A',label:'Causas y consecuencias',icon:'fa-diagram-project',count:null}]);
  }
  return reportReaderOrder(layout?.order ? [...blocks].sort((a,b) => layout.order.indexOf(a.key) - layout.order.indexOf(b.key)) : blocks);
}
