import { useCallback, useEffect, useRef, useState } from 'react';
import { startGeminiLive, supportsGeminiLive } from '../lib/geminiLive.js';
import {
  REPORT_AUDIENCES, REPORT_DEPTHS, REPORT_HORIZONS,
  normalizePreferences,
  reportPreferencesChanged,
} from '../lib/executiveReportPreferences.js';
import { reportEditionPreferences, visibleReportEdition, reportAiFocusSignature, reportHasContent } from '../lib/reportAiPreferences.js';
import { reportOutline } from '../lib/reportOutline.js';
import {reportReaderOrder} from '../lib/reportReaderOrder.js';
import { reportLayout } from '../lib/reportLayout.js';
import {weeklyReport} from '../../../shared/report-weekly.mjs';
import {availablePresentationModel,availableReportTables,availableReportVisuals,hasPublishedReportData,missingReportValue} from '../../../shared/report-available-data.mjs';
import VISUAL_COLORS from '../../../shared/report-chart-colors.json';
import {chartScale,chartLogScale,chartSeriesDash,spreadChartLabels} from '../../../shared/report-chart-geometry.mjs';
import {proteinLegendLabels,proteinChartTicks,proteinBarColor} from '../../../shared/report-protein-chart-style.mjs';
import {compactChartReadings} from '../../../shared/report-chart-layout.mjs';
import {reportLinePanels,chartLegendLabels,chartReadingIsTabulated} from '../../../shared/report-chart-density.mjs';
import { executiveReading } from '../lib/reportReading.js';
import { reportCsv } from '../lib/reportCsv.js';
import {reportPresentation,withoutSourcesText,REPORT_PRESENTATION_VERSION} from '../lib/reportPresentation.js';
import { finiteReportNumber as numeric, reportLineSeries,reportBarData,reportSeriesResults } from '../lib/reportVisualData.js';
import {reportNumber,reportAxisDigits} from '../lib/reportNumberFormat.js';
import { requestReportPdf,requestReportFile } from '../lib/reportPdf.js';
import {reportDownloadName} from '../../../shared/report-download-name.mjs';
import useIdioma,{leerIdioma,IDIOMAS} from '../lib/idioma.js';
import {useLocalizedReport} from '../lib/useLocalizedReport.js';
import {reportEmailState} from '../lib/reportEmailState.js';
import {useReportText} from '../lib/reportLocale.jsx';
import { reportJsonRequest,verifyReportOwner } from '../lib/reportRequest.js';
import { isReportDocument, isReportLibrary } from '../lib/reportDataValidation.js';
import { useReportPreferences } from '../lib/useReportPreferences.js';
import './ExecutiveReportsHub.css';
import ReportWorkspace from './ReportWorkspace.jsx';
import ReportVisualGrid from './ReportVisualGrid.jsx';
import EquityHistoryExplorer from './EquityHistoryExplorer.jsx';
import CommodityHistoryVisual from './CommodityHistoryVisual.jsx';
import BondExecutiveOpening from './BondExecutiveBrief.jsx';
import {FX_TREASURY_COLORS} from '../../../shared/report-fx-actions.mjs';
import FxTreasuryBrief from './FxTreasuryBrief.jsx';
import PanoramaReader from './PanoramaReader.jsx';
import FinancialNewsBrief from './FinancialNewsBrief.jsx';
import {CommodityOpening,CommodityChartExplorer} from './CommodityExecutiveBrief.jsx';
import {MexicoOpening,MexicoChartExplorer} from './MexicoExecutiveBrief.jsx';
import BondHistoryExplorer from './BondHistoryExplorer.jsx';
import BondInternationalExplorer from './BondInternationalExplorer.jsx';
import {EquityExecutiveOpening,EquityHeatmap,EquityBusiness,EquityYearComparison} from './EquityExecutiveBrief.jsx';
import {reportFilterOptions,filteredReportModel} from '../../../shared/report-view-filters.mjs';
import { createReportDraft } from '../lib/reportCreation.js';
import REPORT_COLLECTIONS from '../../../shared/report-collections.json';
import CREATION_FIELDS from '../../../shared/report-creation-fields.json';
import { readReportDraft, writeReportDraft, discardReportDraft } from '../lib/reportDraftSession.js';

const AREAS = REPORT_COLLECTIONS;

const DEFAULT_DELIVERY = Object.freeze({ enabled: false, frequency: 'daily', time: '08:00', weekday: 1 });
const DELIVERY_FREQUENCIES = [
  ['twice_daily', 'Con cada corte disponible (06:00 y 14:00)'],
  ['daily', 'Todos los días'],
  ['weekdays', 'De lunes a viernes'],
  ['weekly', 'Una vez por semana'],
];
const DELIVERY_DAYS = [
  [1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [0, 'Domingo'],
];
const DELIVERY_HOURS = Array.from({ length: 24 }, (_, hour) => {
  const value = `${String(hour).padStart(2, '0')}:00`;
  return [value, value];
});

function deliveryDraft(schedule) {
  if (!schedule?.delivery) return { ...DEFAULT_DELIVERY };
  return { ...DEFAULT_DELIVERY, ...schedule.delivery, enabled: true };
}

function deliveryDescription(delivery) {
  if (!delivery?.enabled) return 'No recibirás envíos automáticos de este informe.';
  if (delivery.frequency === 'twice_daily') return 'Se prepara una edición nueva al terminar cada corte: 06:00 y 14:00.';
  const frequency = DELIVERY_FREQUENCIES.find(([key]) => key === delivery.frequency)?.[1] || 'Todos los días';
  const day = delivery.frequency === 'weekly'
    ? ` · ${DELIVERY_DAYS.find(([key]) => key === Number(delivery.weekday))?.[1] || 'Lunes'}`
    : '';
  return `${frequency}${day} a las ${delivery.time} (hora de Ciudad de México).`;
}

function reportText(report) {
  if (report?.content && !report.personalization) return withoutSourcesText(String(report.content)).slice(0, 20_000);
  return [
    `# ${report?.title || 'Informe ejecutivo'}`,
    report?.eyebrow || '', report?.summary || '', report?.objective || '',
    ...(report?.metrics || []).map(item => `- ${item.label}: ${item.value}${item.change ? ` (${item.change})` : ''}`),
    ...(report?.sections || []).map(section => `## ${section.heading}\n${section.text}`),
    ...(report?.tables || []).map(table => `## ${table.title}\n${[table.columns, ...table.rows].map(row => row.join(' | ')).join('\n')}`),
    ...(report?.takeaways || []).map(item => `- ${item}`),
    ...(report?.watchlist || []).map(item => `Riesgo: ${item}`),
    report?.closing || '',
  ].filter(Boolean).join('\n\n');
}

function cutLabel(value,locale='es-MX',t=value=>value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Corte disponible' : `${t('Corte')} ${date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}`;
}

function cleanLine(value) {
  return String(value || '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/`/g, '')
    .trim();
}

function reportChapters(report) {
  if (Array.isArray(report?.sections) && report.sections.length) {
    const normalize=value=>String(value || '').replace(/\s+/g,' ').trim();
    const guides=(report.tables || []).filter(table=>table.kind==='guide').map(table=>normalize(table.rows.map(row=>row[0]+': '+row[1]+'\nInformación a contrastar o solicitar: '+row[2]+'.').join('\n\n')));
    return report.sections.filter(section=>!guides.includes(normalize(section.text))).map(section => ({ heading: cleanLine(section.heading), body: cleanLine(section.text) })).filter(chapter => chapter.body);
  }
  const raw = reportText(report).replace(/\r/g, '');
  return raw.split(/^##\s+/m).slice(1).map(section => {
    const [heading = 'Lectura', ...body] = section.split('\n');
    return { heading: cleanLine(heading), body: cleanLine(body.join('\n')) };
  }).filter(chapter => chapter.body);
}


function comparisonRows(report) {
  if (report.personalization?.sections?.indicators === false) return [];
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
  return [...unique.values()];
}

function comparisonValue(value) {
  return value.toLocaleString('es-MX', { maximumFractionDigits: Math.abs(value) >= 100 ? 2 : 4 });
}

function shortDate(value,intraday=false,locale='es-MX',monthly=false) {
  if(monthly) return new Date(value).toISOString().slice(0,7);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : intraday
    ? date.toLocaleTimeString(locale,{timeZone:'UTC',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
    : date.toLocaleDateString(locale, { timeZone: 'UTC', day: '2-digit', month: 'short' });
}

function chartNumber(value) {
  return reportNumber(value);
}
function dashboardNumber(value) {
  return reportNumber(value);
}

function chartDate(value,intraday=false,locale='es-MX',monthly=false) {
  if(monthly) return new Date(value).toISOString().slice(0,7);
  return new Date(value).toLocaleString(locale,{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric',...(intraday ? {hour:'2-digit',minute:'2-digit',hourCycle:'h23'} : {})})+(intraday ? ' UTC' : '');
}

function ChartResults({series,unit,compact=false,dataOnly=false,monthly=false}) {
  const t=useReportText();
  const intraday=series.some(item=>item.points.some(point=>point.date.includes("T")));
  if(compact) return <div className="erh-market-chart-table" tabIndex={0} role="region" aria-label={t("Resultados de la gráfica")}><table><thead><tr><th scope="col">{t("Referencia")}</th><th scope="col">{t("Último dato")}</th><th scope="col">{t("Cambio del tramo")}</th></tr></thead><tbody>{reportSeriesResults(series,unit).map((item,index)=><tr key={item.label}><th scope="row"><i style={{backgroundColor:VISUAL_COLORS[index%VISUAL_COLORS.length]}} aria-hidden="true" />{item.label}<small>{t("Desde")} {chartDate(item.first.timestamp,intraday,t.locale,monthly)} · {item.points.length} {t("observaciones")}</small></th><td><span className="erh-numeric-value">{dashboardNumber(item.last.value)}</span><small>{unit} · {chartDate(item.last.timestamp,intraday,t.locale,monthly)}</small></td><td><span className="erh-numeric-value">{item.change===null ? t("No calculable") : `${item.change>0 ? '+' : ''}${dashboardNumber(item.change)} ${item.changeUnit}`}</span><small>{t("Rango:")} {dashboardNumber(item.minimum)} {t("a")} {dashboardNumber(item.maximum)}</small></td></tr>)}</tbody></table>{!dataOnly && <p className="erh-chart-reading-note">{t("El cambio corresponde al periodo mostrado; el rango considera sus observaciones disponibles.")}</p>}</div>;
  return <div className="erh-chart-results" aria-label={t("Resultados del periodo mostrado")}>{reportSeriesResults(series,unit).map((item,index)=><div key={item.label}>
    <strong><i style={{backgroundColor:VISUAL_COLORS[index%VISUAL_COLORS.length]}} aria-hidden="true" />{item.label}</strong>
    <span>{t("Último dato")} <b>{chartNumber(item.last.value)} {unit}</b><small>{chartDate(item.last.timestamp,intraday,t.locale,monthly)}</small></span>
    <span>{t("Cambio del tramo")} <b>{item.change===null ? t("No calculable") : `${item.change>0 ? '+' : ''}${chartNumber(item.change)} ${item.changeUnit}`}</b></span>
    <small>{chartDate(item.first.timestamp,intraday,t.locale,monthly)} → {chartDate(item.last.timestamp,intraday,t.locale,monthly)} · {item.points.length} {t("observaciones")}</small>
    <small>{t("Rango mostrado:")} {chartNumber(item.minimum)} {t("a")} {chartNumber(item.maximum)} {unit}</small>
  </div>)}</div>;
}

function YieldCurveVisual({visual,dashboard=false}) {
  const t=useReportText(),plot=useRef(null),[width,setWidth]=useState(460);
  useEffect(()=>{if(!plot.current || typeof ResizeObserver==='undefined') return undefined;const observer=new ResizeObserver(([entry])=>setWidth(Math.max(160,Math.round(entry.contentRect.width))));observer.observe(plot.current);return ()=>observer.disconnect();},[]);
  const points=visual.curvePoints,height=visual.bondExecutiveCurve ? 280 : 218,pad={left:44,right:16,top:16,bottom:35};
  const sets=visual.curveSets ? visual.curveSets.map((set,index)=>({...set,label:t(set.label)+' · '+set.date,dash:index===1 ? '6 3' : index===2 ? '2 3' : undefined})) : [...(visual.previousDate ? [{key:'previous',label:t('Anterior')+' · '+visual.previousDate,color:'#8c9fb7'}] : []),{key:'value',label:t('Actual')+' · '+visual.currentDate,color:'#315785'}];
  const scale=chartScale(points.flatMap(point=>sets.map(set=>point[set.key])).filter(Number.isFinite)),xx=index=>pad.left+index/(points.length-1 || 1)*(width-pad.left-pad.right),yy=value=>pad.top+(scale.max-value)/(scale.max-scale.min)*(height-pad.top-pad.bottom);
  return <figure className={'erh-chart erh-yield-curve'+(dashboard ? ' erh-market-chart' : '')} aria-label={visual.title}>
    <figcaption><span>{visual.title}</span><small>{visual.unit}{visual.proteinCatalogChart ? ' · '+t('Catálogo de respaldo') : ''}</small></figcaption>
    <div ref={plot}><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={visual.title+' · '+visual.currentDate}>
      {scale.ticks.map(value=><g key={value}><line x1={pad.left} x2={width-pad.right} y1={yy(value)} y2={yy(value)} stroke="#dce5ef" /><text x={pad.left-6} y={yy(value)+3} textAnchor="end" fontSize="10" fill="#586b78">{reportNumber(value,2)}</text></g>)}
      {sets.map(set=><g key={set.key}><polyline points={points.map((point,index)=>xx(index)+','+yy(point[set.key])).join(' ')} fill="none" stroke={set.color} strokeDasharray={set.dash} strokeWidth="2" />{points.map((point,index)=><circle key={point.label} cx={xx(index)} cy={yy(point[set.key])} r="3" fill={set.color}><title>{point.label+' · '+reportNumber(point[set.key],3)+' %'}</title></circle>)}</g>)}
      {points.map((point,index)=>(width>=390 || points.length<=7 || index%2===0 || index===points.length-1) && <text key={point.label} x={xx(index)} y={height-12} textAnchor="middle" fontSize="10" fill="#586b78">{point.label}</text>)}
    </svg></div>
    <div className="erh-curve-legend">{sets.map(set=><span key={set.key}><svg width="24" height="8" aria-hidden="true"><line x1="0" x2="24" y1="4" y2="4" stroke={set.color} strokeWidth="2" strokeDasharray={set.dash} /></svg>{set.label}</span>)}</div>
    <p className="erh-chart-reading-note">{visual.note}</p>
    <details className="erh-market-explorer"><summary>{t('Datos de la gráfica')}</summary><div className="erh-market-chart-table" tabIndex={0}><table><thead><tr><th>{t('Plazo')}</th>{sets.map(set=><th key={set.key}>{set.label}</th>)}</tr></thead><tbody>{points.map(point=><tr key={point.label}><th>{point.label}</th>{sets.map(set=><td key={set.key}>{reportNumber(point[set.key],3)} %</td>)}</tr>)}</tbody></table></div></details>
  </figure>;
}

function LineVisual({ visual,dashboard=false,dataOnly=false }) {
  const t=useReportText(),[group,setGroup]=useState(0),panels=reportLinePanels({...visual,series:reportLineSeries(visual).series}),index=Math.min(group,panels.length-1);
  const names=chartLegendLabels(visual.series || []),aliases=new Map((visual.series || []).map((series,ordinal)=>[series.label,names[ordinal]]));
  if(panels.length===1)return <LineVisualPanel visual={visual} dashboard={dashboard} dataOnly={dataOnly} />;
  return <section className="erh-chart-groups" aria-label={visual.title}>
    <div className="erh-chart-group-controls"><label>{t('Referencias visibles')}<select aria-label={t('Seleccionar grupo de series')} value={index} onChange={event=>setGroup(Number(event.target.value))}>{panels.map((panel,ordinal)=><option key={ordinal} value={ordinal}>{(ordinal+1)+' · '+panel.series.map(series=>aliases.get(series.label)).join(' / ')}</option>)}</select></label><div><button type="button" aria-label={t('Ver grupo anterior')} disabled={index===0} onClick={()=>setGroup(index-1)}><i className="fas fa-chevron-left" aria-hidden="true" /></button><span role="status">{t('Grupo {value0} de {value1}',{value0:index+1,value1:panels.length})}</span><button type="button" aria-label={t('Ver siguiente grupo')} disabled={index===panels.length-1} onClick={()=>setGroup(index+1)}><i className="fas fa-chevron-right" aria-hidden="true" /></button></div></div>
    <p className="erh-chart-group-note">{t('Hasta cuatro series por grupo; todas las referencias están disponibles en el selector. Cada grupo usa su propia escala, indicada en el eje.')}</p>
    <LineVisualPanel key={panels[index].title} visual={panels[index]} dashboard={dashboard} dataOnly={dataOnly} />
  </section>;
}

function LineVisualPanel({ visual,dashboard=false,dataOnly=false }) {
  const t=useReportText();
  const [selectedTime,setSelectedTime]=useState(null);
  const [showData,setShowData]=useState(false);
  const [requestedSeries,setFocusedSeries]=useState(null);
  const plot=useRef(null),[width,setWidth]=useState(dashboard ? 480 : 640);
  const { series, dates } = reportLineSeries(visual);
  const focusedSeries=series.some(item=>item.label===requestedSeries) ? requestedSeries : null;
  const legendLabels=visual.proteinChart ? proteinLegendLabels(series) : chartLegendLabels(series);
  const ordinal=index=>visual.seriesOrdinals?.[index] ?? index+(visual.seriesOffset || 0);
  const color=index=>visual.fxTreasuryChart ? series[index].color || FX_TREASURY_COLORS[series[index].label] || '#668399' : visual.equityBenchmark ? index===0 ? '#668399' : VISUAL_COLORS[(ordinal(index)-1)%VISUAL_COLORS.length] : VISUAL_COLORS[ordinal(index)%VISUAL_COLORS.length];
  const dash=index=>chartSeriesDash(ordinal(index),VISUAL_COLORS.length,visual.globalComparison);
  const intraday=series.some(item=>item.points.some(point=>point.date.includes("T")));
  const values = series.flatMap(item => item.points.map(point => point.value));
  const available=Boolean(values.length || visual.fxOverview);
  useEffect(()=>{
    if(!available || !plot.current || typeof ResizeObserver==='undefined') return undefined;
    const observer=new ResizeObserver(([entry])=>{const next=Math.max(160,Math.round(entry.contentRect.width));setWidth(previous=>previous===next ? previous : next);});
    observer.observe(plot.current);return ()=>observer.disconnect();
  },[available]);
  if (!values.length && !visual.fxOverview) return null;
  const endLabels=visual.fxTreasuryChart || visual.fxOverview && width>=380 || visual.proteinChart && width>=620;
  const height=visual.unifiedHistory ? 460 : visual.globalComparison ? 440 : visual.proteinChart ? 350 : visual.fxTreasuryChart ? 340 : visual.fxOverview || visual.equityBenchmark ? 320 : 280,pad={left:48,right:endLabels && values.length ? visual.proteinChart ? 180 : visual.fxTreasuryChart ? 134 : 120 : 18,top:24,bottom:34};
  const usableHeight=height-pad.top-pad.bottom;
  const scale=visual.globalComparison || visual.equityLogScale ? chartLogScale(values) : chartScale(values);
  if(visual.bondHistory && !visual.bondChange && values.every(value=>value>=0) && scale.min<0){scale.min=0;scale.ticks=scale.ticks.filter(value=>value>=0);}
  const {min,max,ticks}=scale;
  const axisDigits=reportAxisDigits(min,max);
  const axisLabels=ticks.map(value=>reportNumber(value,axisDigits));
  pad.left=Math.min(width*.35,Math.max(pad.left,...axisLabels.map(label=>label.length*6+13)));
  const usableWidth=width-pad.left-pad.right;
  const firstDate = visual.bondHistory ? Date.parse(visual.rangeStart) : dates[0]; const lastDate=visual.bondHistory ? Date.parse(visual.rangeEnd) : dates.at(-1);const dateSpan = lastDate - firstDate;
  const selectedIndex=dates.includes(selectedTime) ? dates.indexOf(selectedTime) : dates.length-1;
  const selectedDate=dates[selectedIndex];
  const x = date => pad.left + (dateSpan ? (date - firstDate) / dateSpan : .5) * usableWidth;
  const y = value => pad.top + (1 - (scale.position ? scale.position(value) : (value-min)/(max-min))) * usableHeight;
  const line = points => points.map((point, index) => `${index && !(visual.bondHistory && point.timestamp-points[index-1].timestamp>(visual.monthly ? 32 : 62)*86400000) ? "L" : "M"}${x(point.timestamp).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
  const dateIndexes = [...new Set([0, Math.round((dates.length - 1) / 2), dates.length - 1])].filter(index=>index>=0 && index<dates.length);
  const historicalAxis=Boolean(visual.globalComparison || visual.equityBenchmark || visual.bondHistory || visual.commodityWindow==='history');
  const bondYears=Array.from({length:Math.max(0,new Date(lastDate).getUTCFullYear()-new Date(firstDate).getUTCFullYear())},(_,index)=>Date.UTC(new Date(firstDate).getUTCFullYear()+index,0,1)).filter(date=>date>=firstDate && date<=lastDate);
  const dateTicks=visual.proteinChart ? proteinChartTicks(firstDate,lastDate,width) : visual.bondHistory ? width>=500 ? [firstDate,...bondYears.filter(date=>date-firstDate>dateSpan*.055 && lastDate-date>dateSpan*.055),lastDate] : [firstDate,firstDate+dateSpan/2,lastDate] : historicalAxis && dates.length>1 ? [firstDate,firstDate+dateSpan/2,dates.at(-1)] : dateIndexes.map(index=>dates[index]);
  const axisDate=date=>visual.bondHistory || visual.proteinChart && historicalAxis ? new Intl.DateTimeFormat(t.locale,{year:'numeric',timeZone:'UTC'}).format(date) : historicalAxis ? new Intl.DateTimeFormat(t.locale,{year:'numeric',...(width>=480 ? {month:'short',day:'2-digit'} : {}),timeZone:'UTC'}).format(date) : shortDate(date,intraday,t.locale,visual.monthly);
  const emphasis=index=>focusedSeries===null || focusedSeries===series[index]?.label ? 1 : .18;
  const endings=endLabels ? spreadChartLabels(series.flatMap((item,index)=>{
    const point=visual.proteinChart ? item.points.at(-1) : item.points.find(point=>point.timestamp===dates.at(-1));
    return point ? [{label:item.label,index,value:point.value,actualX:x(point.timestamp),actualY:y(point.value),y:y(point.value)}] : [];
  }),pad.top+4,height-pad.bottom-(visual.proteinChart ? 16 : 4),visual.proteinChart ? 32 : 19) : [];
  const explorer=<div className="erh-chart-explorer">
    <label><span>{t("Consultar una fecha")} <b>{chartDate(selectedDate,intraday,t.locale,visual.monthly)}</b></span><input type="range" min="0" max={dates.length-1} step="1" value={selectedIndex} aria-label={t("Fecha en {value0}",{value0:visual.title})} aria-valuetext={chartDate(selectedDate,intraday,t.locale,visual.monthly)} onChange={event=>setSelectedTime(dates[Number(event.target.value)])} /></label>
    <div className="erh-chart-values" aria-live="polite" aria-atomic="true">{series.map((item,index)=>{const point=item.points.find(point=>point.timestamp===selectedDate);return <span key={item.label}><i style={{backgroundColor:color(index)}} aria-hidden="true" />{item.label}<b>{point ? `${chartNumber(point.value)} ${visual.unit || ''}` : t("Sin dato en esta fecha")}</b></span>;})}</div>
    {!dataOnly && <small>{t("Selecciona una fecha con el control o las flechas del teclado. Cada cifra corresponde a una observación disponible.")}</small>}
  </div>;
  return <figure className={`erh-chart${dashboard ? ' erh-market-chart' : ''}${visual.proteinChart ? ' erh-protein-chart' : ''}${visual.bondHistory ? ' erh-bond-history-chart' : ''}${visual.fxOverview ? ' erh-fx-overview' : ''}${visual.equityBenchmark ? ' erh-equity-benchmark-chart' : ''}${visual.unifiedHistory ? ' erh-unified-history-chart' : ''}`} aria-label={visual.title}>
    <figcaption><span><i className="fas fa-chart-line" aria-hidden="true" /> {visual.title}</span><small>{visual.unit}{visual.proteinCatalogChart ? ' · '+t('Catálogo de respaldo') : ''}</small></figcaption>
    {visual.dailyComparison && dates.length>0 && <div className="erh-chart-period"><span><i className="erh-point-previous" />{t('Anterior')} · {shortDate(dates[0],false,t.locale)}</span><span><i className="erh-point-current" />{t('Actual')} · {shortDate(dates.at(-1),false,t.locale)}</span></div>}
    {visual.equityBenchmark && <div className="erh-equity-benchmark-label"><b>{t('Bolsa de referencia')}: {visual.benchmark}</b><span>{visual.indexBaseDate+' / '+visual.indexEndDate}</span><span>{t(visual.equityLogScale ? 'Escala logarítmica' : 'Base común 100 · monedas originales')}</span></div>}
    {visual.globalComparison && dates.length>0 && <div className="erh-equity-benchmark-label"><b>{t('Escala logarítmica')}</b><span>{new Date(firstDate).toISOString().slice(0,10)+' / '+new Date(dates.at(-1)).toISOString().slice(0,10)}</span></div>}
    {visual.bondHistory && <p className="erh-chart-period">{visual.rangeStart+' / '+visual.rangeEnd} · {t(visual.monthly ? 'Promedios mensuales publicados' : 'Última observación publicada de cada mes')}</p>}
    {visual.fxTreasuryChart && <p className="erh-chart-period">{visual.indexBaseDate+' / '+visual.indexEndDate}</p>}
    <div ref={plot} className="erh-chart-canvas"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${visual.title}. ${visual.unit || ''}. ${visual.note || ''}`}>
      <rect x={pad.left} y={pad.top} width={usableWidth} height={usableHeight} rx="5" className="erh-chart-plot-bg" />
      {visual.proteinChart && series.length===1 && <path className="erh-protein-area" d={`${line(series[0].points)} L${x(series[0].points.at(-1).timestamp)},${height-pad.bottom} L${x(series[0].points[0].timestamp)},${height-pad.bottom} Z`} fill={color(0)} opacity=".09" />}
      {ticks.map(value => {const yy=y(value);return <g key={value}><line x1={pad.left} x2={width-pad.right} y1={yy} y2={yy} className={`erh-chart-grid${visual.fxOverview && value===100 || (visual.historyKey==='slope' || visual.bondChange) && value===0 ? ' erh-chart-baseline' : ''}`} /><text x={pad.left-10} y={yy+3.5} textAnchor="end" className="erh-chart-axis">{reportNumber(value,axisDigits)}</text></g>;})}
      {visual.proteinChart && visual.indexBaseDate && min<=100 && max>=100 && <line className="erh-chart-baseline" x1={pad.left} x2={width-pad.right} y1={y(100)} y2={y(100)} />}
      {dateTicks.map(date=><line key={date} x1={x(date)} x2={x(date)} y1={pad.top} y2={height-pad.bottom} className="erh-chart-grid-vertical" />)}
      {series.map((item, index) => <path key={item.label} d={line(item.points)} className="erh-series-path" fill="none" stroke={color(index)} opacity={emphasis(index)} strokeDasharray={visual.fxTreasuryChart ? undefined : visual.equityBenchmark && index===0 ? '6 4' : visual.globalComparison || visual.fxOverview || visual.bondHistory ? dash(index) : undefined} strokeWidth={focusedSeries===item.label ? '3.2' : visual.equityBenchmark && index===0 ? '2' : '2.7'} strokeLinecap="round" strokeLinejoin="round" />)}
      {!values.length && <text x={width/2} y={height/2} textAnchor="middle" className="erh-chart-axis">{t('Sin datos comparables para estas fechas')}</text>}
      {visual.dailyComparison && series.flatMap((item,index)=>item.points.map(point=><circle key={item.label+point.timestamp} cx={x(point.timestamp)} cy={y(point.value)} r={point.timestamp===dates.at(-1) ? 4.2 : 3.5} opacity={emphasis(index)} fill={point.timestamp===dates[0] ? '#fff' : color(index)} stroke={color(index)} strokeWidth="1.8"><title>{item.label+': '+chartNumber(point.value)+' '+visual.unit+' · '+point.date}</title></circle>))}
      {selectedTime!==null && <line x1={x(selectedDate)} x2={x(selectedDate)} y1={pad.top} y2={height-pad.bottom} className="erh-chart-cursor" />}
      {!visual.dailyComparison && series.map((item,index)=>{const point=item.points.find(point=>point.timestamp===selectedDate);return point ? <circle key={item.label} cx={x(point.timestamp)} cy={y(point.value)} r="4" fill={color(index)} stroke="#fff" strokeWidth="1.5"><title>{item.label+': '+chartNumber(point.value)+' '+visual.unit+' · '+chartDate(selectedDate,intraday,t.locale,visual.monthly)}</title></circle> : null;})}
      {endings.map(item=><g key={item.label} opacity={emphasis(item.index)}><path d={`M${visual.proteinChart ? item.actualX+6 : width-pad.right+6},${item.actualY} L${width-pad.right+15},${item.y}`} fill="none" stroke={color(item.index)} strokeWidth=".8" /><text x={width-pad.right+20} y={item.y+3} className="erh-chart-end-label" fill={color(item.index)}>{visual.proteinChart ? legendLabels[item.index] : visual.fxTreasuryChart ? item.label : item.label.replace(/^USD\//,'')}<tspan x={visual.proteinChart ? width-pad.right+20 : undefined} dy={visual.proteinChart ? 14 : undefined} dx={visual.proteinChart ? 0 : 5} fontWeight="500">{reportNumber(item.value,Math.max(2,axisDigits))}</tspan></text></g>)}
      {dateTicks.map((date,index) => <text key={date} x={x(date)} y={height - 8} textAnchor={index===0 ? 'start' : index===dateTicks.length-1 ? 'end' : 'middle'} className="erh-chart-axis">{axisDate(date)}</text>)}
    </svg></div>
    {visual.equityBenchmark && !visual.globalComparison && <div className="erh-equity-last-values">{series.map((item,index)=><span key={item.label} style={{'--series-color':color(index)}}>{item.label}<strong>{reportNumber(item.points.at(-1).value,1)}</strong>{t('Último índice base 100')}</span>)}</div>}
    {!visual.fxTreasuryChart && <div className="erh-chart-legend">{series.map((item, index) => <button type="button" key={item.label} aria-pressed={focusedSeries===item.label} aria-label={t('Resaltar {value0}',{value0:item.label})} title={item.label} onClick={()=>setFocusedSeries(previous=>previous===item.label ? null : item.label)} className={focusedSeries!==null && focusedSeries!==item.label ? 'is-muted' : ''}><svg width="24" height="8" aria-hidden="true"><line x1="0" y1="4" x2="24" y2="4" stroke={color(index)} strokeWidth="2" strokeDasharray={visual.equityBenchmark && index===0 ? '6 4' : visual.globalComparison || visual.fxOverview || visual.bondHistory ? dash(index) : undefined} /></svg>{visual.proteinChart ? <span className="erh-protein-legend-copy"><span>{legendLabels[index]}</span><strong>{reportNumber(item.points.at(-1).value,2)}<small> {visual.unit}</small></strong><small>{chartDate(item.points.at(-1).timestamp,false,t.locale)}</small></span> : legendLabels[index]}{visual.globalComparison && item.baseDate ? ' · '+item.baseDate : ''}{visual.fxOverview && !item.points.length ? ' · '+t('Sin dato') : ''}</button>)}</div>}
    {!visual.dailyComparison && !visual.dataInTables && <ChartResults series={series} unit={visual.unit} compact={dashboard} dataOnly={dataOnly} monthly={visual.monthly} />}
    {dates.length>0 && (dashboard ? <details className="erh-market-explorer"><summary>{t("Explorar fechas y valores")}</summary>{explorer}</details> : explorer)}
    <details className="erh-chart-data" onToggle={event=>setShowData(event.currentTarget.open)}><summary>{t("Ver datos de la gráfica")}</summary>{showData && <div tabIndex={0} role="region" aria-label={t("Datos de {value0}",{value0:visual.title})}><table><thead><tr><th scope="col">{t("Fecha")}</th>{series.map(item=><th scope="col" key={item.label}>{item.label}{visual.unit ? ` · ${visual.unit}` : ''}</th>)}</tr></thead><tbody>{dates.map(date=><tr key={date}><th scope="row">{chartDate(date,intraday,t.locale,visual.monthly)}</th>{series.map(item=>{const point=item.points.find(point=>point.timestamp===date);return <td key={item.label}>{point ? chartNumber(point.value) : t("Sin dato")}</td>;})}</tr>)}</tbody></table></div>}</details>
    {visual.note && (dashboard ? <details className="erh-market-method"><summary>{t("Metodología y alcance")}</summary><p>{visual.note}</p></details> : <p>{visual.note}</p>)}
  </figure>;
}

function BarVisual({ visual,dashboard=false,dataOnly=false }) {
  const t=useReportText();
  const [order,setOrder]=useState('source');
  const {bars:rawBars,signed}=reportBarData(visual);
  const bars=rawBars.map((item,index)=>({...item,color:proteinBarColor(visual,item) || (visual.sessionMovement ? item.value<0 ? '#9a6d65' : '#78856a' : VISUAL_COLORS[index%(visual.dailyComparison && !visual.fxOverview ? 2 : VISUAL_COLORS.length)])}));
  if(order!=='source') bars.sort((a,b)=>a.value===null ? b.value===null ? 0 : 1 : b.value===null ? -1 : order==='descending' ? b.value-a.value : a.value-b.value);
  if (!bars.length) return null;
  const scale=chartScale(bars.map(item=>item.value),{zero:true,symmetric:signed}),bound=Math.max(Math.abs(scale.min),Math.abs(scale.max));
  const barNumber=value=>value===null ? t('Sin dato') : visual.yieldMovement ? (value>0 ? '+' : '')+reportNumber(value,2)+' pb' : visual.sessionMovement ? (value>0 ? '+' : '')+reportNumber(value,2)+' %' : (visual.fxOverview && value>0 ? '+' : '')+(Number.isInteger(visual.displayDigits) ? reportNumber(value,visual.displayDigits) : chartNumber(value))+(visual.fxOverview ? ' %' : '');
  const valueWidth=Math.max(52,...bars.map(item=>barNumber(item.value).length*6.5+6));
  const periods=visual.proteinHistorical ? [] : [...new Set(rawBars.map(bar=>bar.date).filter(Boolean))];
  const orderControl=<label className="erh-chart-order">{t("Ordenar barras")}<select aria-label={t("Orden de {value0}",{value0:visual.title})} value={order} onChange={event=>setOrder(event.target.value)}><option value="source">{t("Orden de la fuente")}</option><option value="descending">{t("Mayor a menor")}</option><option value="ascending">{t("Menor a mayor")}</option></select></label>;
  return <figure className={`erh-chart erh-bar-chart${visual.proteinChart && visual.proteinHistorical ? ' erh-protein-bars' : ''}${dashboard ? ' erh-market-chart' : ''}${visual.fxOverview ? ' erh-fx-overview' : ''}`} aria-label={visual.title} style={{'--erh-value-width':valueWidth+'px'}}>
    <figcaption><span><i className="fas fa-chart-column" aria-hidden="true" /> {visual.title}</span><small>{visual.unit}{visual.proteinCatalogChart ? ' · '+t('Catálogo de respaldo') : ''}</small></figcaption>
    {visual.source && <p className="erh-protein-chart-source">{t('Fuentes')}: {visual.source}</p>}
    {!dashboard && orderControl}
    {periods.length>0 && <div className="erh-chart-period">{periods.map((date,index)=><span key={date}><i style={{backgroundColor:VISUAL_COLORS[index%2]}} />{t(index===0 ? 'Anterior' : 'Actual')} · {shortDate(date,false,t.locale)}</span>)}</div>}
    <div className={`erh-bars${signed ? ' erh-bars-signed' : ''}`}>{bars.map((item,index) => {const length=item.value===null ? 0 : Math.abs(item.value)/bound*(signed ? 50 : 100),firstOfGroup=item.reference && (index===0 || item.reference!==bars[index-1].reference);return <div className={`erh-bar-row${firstOfGroup ? ' erh-bar-group-start' : ''}${item.value===null ? ' is-unavailable' : ''}`} key={item.label}>
      {firstOfGroup && <b className="erh-bar-reference">{item.reference}</b>}
      <span title={item.date || undefined}>{item.date && !visual.proteinHistorical ? shortDate(item.date,false,t.locale) : item.label}</span><i className="erh-bar-track" aria-hidden="true"><b style={{ width:`${length}%`,marginLeft:signed ? `${item.value<0 ? 50-length : 50}%` : 0, backgroundColor:item.color }} />{item.value===0 && <em style={{left:signed ? '50%' : '0%',backgroundColor:item.color}} />}</i><strong>{barNumber(item.value)}</strong>
    </div>;})}</div>
    {bars.some(item=>item.value!==null) && <div className="erh-bar-axis" aria-hidden="true"><div><span>{chartNumber(signed ? -bound : 0)}</span><span>{chartNumber(signed ? 0 : bound/2)}</span><span>{signed ? '+' : ''}{chartNumber(bound)}</span></div></div>}
    <p className="erh-chart-scale">{!dataOnly && (signed ? t("El centro representa cero; las bajas se extienden a la izquierda y las alzas a la derecha.") : t("Las barras parten de cero y comparten la misma escala."))} {bars.length} {t("categorías ·")} {visual.unit || t('unidad no declarada')}.</p>
    {dashboard && <details className="erh-market-explorer"><summary>{t("Explorar orden de las barras")}</summary>{orderControl}</details>}
    {visual.note && (dashboard ? <details className="erh-market-method"><summary>{t("Metodología y alcance")}</summary><p>{visual.note}</p></details> : <p>{visual.note}</p>)}
  </figure>;
}

function ReportVisuals({ report }) {
  const t=useReportText();
  const {visuals,notes}=compactChartReadings(availableReportVisuals(report.visuals));
  if (!visuals.length) return null;
  const dashboard=['company-dashboard','weekly-sheet'].includes(reportLayout(report)?.composition);
  const dataOnly=reportLayout(report)?.composition==='weekly-sheet';
  const Grid=dashboard ? ReportVisualGrid : 'div';
  return <>{notes.length>0 && <details className="erh-market-method"><summary>{t('Metodología y alcance')}</summary><p>{notes.join(' ')}</p></details>}<Grid className={`erh-visuals${dashboard ? ' erh-market-visual-grid' : ''}${visuals.some(visual=>visual.reading) ? ' erh-session-visuals' : ''}`}>{visuals.map(visual => visual.bondInternationalOverview ? <BondInternationalExplorer key={visual.title} visual={visual} renderChart={selected=><LineVisual visual={selected} dashboard={dashboard} dataOnly={dataOnly} />} /> : visual.bondHistory ? <BondHistoryExplorer key={visual.title} visual={visual} renderChart={selected=><LineVisual visual={selected} dashboard={dashboard} dataOnly={dataOnly} />} /> : visual.reading ? <div key={visual.title} className="erh-visual-panel">{(visual.grainHistoryOverview || visual.energyHistoryOverview) ? <CommodityHistoryVisual key={visual.title} visual={visual} /> : visual.equityHistoryOverview ? <EquityHistoryExplorer key={visual.title} visual={visual} renderComparison={selected=><LineVisual visual={selected} dashboard={dashboard} dataOnly={dataOnly} />} /> : visual.equityYears ? <EquityYearComparison key={visual.title} visual={visual} /> : visual.equityHeatmap ? <EquityHeatmap key={visual.title} visual={visual} /> : visual.yieldCurve ? <YieldCurveVisual visual={visual} dashboard={dashboard} /> : visual.type === 'bar' ? <BarVisual visual={visual} dashboard={dashboard} dataOnly={dataOnly} /> : <LineVisual visual={visual} dashboard={dashboard} dataOnly={dataOnly} />}{chartReadingIsTabulated(visual) ? <details className="erh-market-method"><summary>{t('Lectura de la gráfica')}</summary><p>{visual.reading}</p></details> : <p className="erh-session-chart-reading">{visual.reading}</p>}</div> : (visual.grainHistoryOverview || visual.energyHistoryOverview) ? <CommodityHistoryVisual key={visual.title} visual={visual} /> : visual.equityHistoryOverview ? <EquityHistoryExplorer key={visual.title} visual={visual} renderComparison={selected=><LineVisual visual={selected} dashboard={dashboard} dataOnly={dataOnly} />} /> : visual.equityYears ? <EquityYearComparison key={visual.title} visual={visual} /> : visual.equityHeatmap ? <EquityHeatmap key={visual.title} visual={visual} /> : visual.yieldCurve ? <YieldCurveVisual key={visual.title} visual={visual} dashboard={dashboard} /> : visual.type==='bar' ? <BarVisual key={visual.title} visual={visual} dashboard={dashboard} dataOnly={dataOnly} /> : <LineVisual key={visual.title} visual={visual} dashboard={dashboard} dataOnly={dataOnly} />)}</Grid></>;
}

function reportTableCellClass(cell,index) {
  if(index===0)return undefined;
  const value=String(cell ?? '').trim(),first=value.split('\n')[0];
  if(/^\d{4}-\d{2}-\d{2}$/.test(value))return 'erh-cell-date';
  if(typeof cell!=='number' && !/^[↑↓→]?\s*[+-]?\d[\d,.]*(?:\s*(?:%|pb|p\.\s*p\.))?$/.test(first))return undefined;
  return 'erh-cell-number'+(first.startsWith('↑') ? ' erh-cell-rise' : first.startsWith('↓') ? ' erh-cell-fall' : '');
}

function ReportTables({ report }) {
  const t=useReportText();
  const originals=new Map(Object.entries(report.causeText || {}).map(([original,translated])=>[translated,original]));
  const tables = availableReportTables(report.tables,{t,source:value=>originals.get(value) || value});
  if (!tables.length) return null;
  return <div className="erh-tables">{tables.map((table, tableIndex) => {
    const small=table.columns?.length<=4 && table.rows?.length<=10;
    const content=<section key={tableIndex} className={`erh-table-wrap${small ? ' erh-table-small' : ' erh-table-wide'}`}><header><h4>{table.title}</h4>{table.note && !table.proteinQuote && <p>{table.note}</p>}</header><div tabIndex={0} role="region" aria-label={t("Tabla {value0}; desplázate para revisar todas las columnas",{value0:table.title})}><table aria-label={table.title}><thead><tr>{(table.columns || []).map((column, index) => <th scope="col" key={index}>{column}</th>)}</tr></thead><tbody>{(table.rows || []).map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className={reportTableCellClass(cell,cellIndex)}>{cell}</td>)}</tr>)}</tbody></table></div>{table.proteinQuote && table.note && <p className="erh-protein-conditions">{table.note}</p>}</section>;
    return table.kind==='guide' && reportLayout(report) ? <details key={tableIndex} className="erh-equity-guide"><summary><i className="fas fa-list-check" aria-hidden="true" />{t("Información por validar con el cliente")}</summary>{content}</details> : content;
  })}</div>;
}

function ProteinBulletinSheets({model,report}) {
  const t=useReportText();
  return <div className="erh-protein-sheets">{model.proteinSheets.map(sheet=><section className="erh-protein-sheet" key={sheet.id} aria-label={t('Tablilla')+' · '+sheet.label}>
    <header><span>{sheet.label}</span><small>{sheet.references} {t('referencias')}</small></header>
    <div className="erh-protein-sheet-body"><aside><div className="erh-protein-summary"><span className="erh-protein-kicker">{t('Lectura del mercado')}</span><h4>{sheet.heading}</h4><p>{sheet.observation}</p></div><div className="erh-protein-scope"><p className="erh-protein-dates">{sheet.scope}</p><small>{t('Los valores y fechas se conservan por plaza. Las causas y consecuencias se explican después de las gráficas.')}</small></div></aside><div className="erh-protein-prices"><p className="erh-protein-scroll-hint">{t('Desliza la tablilla para ver todas las columnas.')}</p><ReportTables report={{...report,tables:sheet.tables}} /></div></div>
    {sheet.visuals.length>0 && <div className="erh-protein-sheet-charts"><ReportVisuals report={{...report,visuals:sheet.visuals}} /></div>}
  </section>)}{model.supplementaryTables.length>0 && <section className="erh-protein-supplement"><h4>{t('Oferta y contexto del mercado')}</h4><ReportTables report={{...report,tables:model.supplementaryTables}} /></section>}</div>;
}

function ProteinCountryCoverage({model}) {
  const t=useReportText();
  return <div className="erh-protein-country-coverage"><h4>{t('Cobertura de América')}</h4><ul>{model.proteinCountries.map(item=><li key={item.label}><strong>{item.label}</strong><span>{item.count ? item.count+' '+t('referencias físicas con precio') : t('Sin precio reciente disponible')}</span>{item.dates.length>0 && <small>{item.dates.join(' / ')}</small>}</li>)}</ul><p>{t('Cada precio conserva su plaza, presentación, moneda y frecuencia. Las referencias semanales se muestran como contexto y no generan variaciones diarias.')}</p></div>;
}

function ExecutiveDesk({ brief }) {
  const t=useReportText();
  if (!brief?.generated) return null;
  const drivers = brief.drivers || [];
  const risks = brief.risks || [];
  return <section className="erh-executive-desk">
    <h4><i className="fas fa-compass" aria-hidden="true" /> {brief.agent || 'VALL Executive Desk'}<small>{brief.mode === 'ai' ? t("Lectura con IA") : t("Síntesis del corte")}</small></h4>
    {brief.headline && <p className="erh-executive-headline">{brief.headline}</p>}
    {brief.context && <p className="erh-executive-context"><strong>{t("Contexto:")}</strong> {brief.context}</p>}
    {brief.thesis && <p className="erh-executive-thesis">{brief.thesis}</p>}
    {(drivers.length > 0 || risks.length > 0) && <div className="erh-executive-grid">
      {drivers.length > 0 && <div><strong>{t("Impulsores visibles")}</strong><ul>{drivers.map(item => <li key={item}>{item}</li>)}</ul></div>}
      {risks.length > 0 && <div><strong>{t("Riesgos a contrastar")}</strong><ul>{risks.map(item => <li key={item}>{item}</li>)}</ul></div>}
    </div>}
    {brief.committeeQuestion && <p className="erh-committee-question"><i className="fas fa-circle-question" aria-hidden="true" /> <span>{t("Pregunta para comité:")}</span> {brief.committeeQuestion}</p>}
    {brief.evidenceNote && <small className="erh-evidence-note">{brief.evidenceNote}</small>}
  </section>;
}

function BeforeAfter({ report }) {
  const t=useReportText();
  const rows = comparisonRows(report);
  if (!rows.length) return null;
  return <section className="erh-before-after">
    <header><h4><i className="fas fa-arrow-right-arrow-left" aria-hidden="true" /> {t("Antes vs. ahora")}</h4><small>{t("Cierre previo → corte actual")}</small></header>
    <div className="erh-before-after-grid">
      {rows.map(row => <div key={row.label} className={row.change >= 0 ? 'is-up' : 'is-down'}>
        <strong>{row.label}</strong>
        <span><b>{t("Antes")}</b>{comparisonValue(row.previous)}{row.unit && <em>{row.unit}</em>}</span>
        <i aria-hidden="true" />
        <span><b>{t("Ahora")}</b>{comparisonValue(row.current)}{row.unit && <em>{row.unit}</em>}</span>
        <mark>{row.change >= 0 ? '+' : ''}{row.change.toFixed(2)}%</mark>
      </div>)}
    </div>
    <p>{t("Comparación calculada contra la observación previa disponible de la misma serie; no equivale a precio físico ni a una recomendación.")}</p>
  </section>;
}

function ReportReadingContext({report}) {
  const t=useReportText();
  if (!report.personalization) return null;
  const input=report.personalization;
  const preferences=normalizePreferences({...input,audience:input.audienceKey || REPORT_AUDIENCES.find(([key,label])=>key===input.audience || label===input.audience)?.[0]});
  const label=(options,key)=>options.find(([value])=>value===key)?.[1] || '';
  return <section className="erh-reading-context" aria-label={t("Enfoque de esta edición")}><span>{t("Enfoque de esta edición")}</span><dl>{[
    [t("Audiencia"),t(label(REPORT_AUDIENCES,preferences.audience))],
    [t("Horizonte"),t(label(REPORT_HORIZONS,preferences.decisionHorizon))],
    [t("Detalle"),t(label(REPORT_DEPTHS,preferences.depth).replace(' (informe actual)',''))],
  ].map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></section>;
}

function MarketConclusions({report,reading}) {
  const t=useReportText();
  const panels=[
    {title:t("Hechos y señales"),items:reading.highlights,empty:t("Sin señales adicionales en este corte.")},
    ...(report.personalization?.sections?.risks===false ? [] : [{title:t("Riesgos a monitorear"),items:reading.risks,empty:t("Sin riesgos adicionales documentados.")}]),
    {title:t("Acciones y seguimiento"),items:report.closing ? [report.closing] : [],empty:t("No se definieron acciones para esta edición.")},
  ];
  return <div className="erh-market-conclusions">{panels.filter(panel=>panel.items.length).map(panel=><section key={panel.title}><h4>{panel.title}</h4><ul>{panel.items.map((item,index)=><li key={index}>{item}</li>)}</ul></section>)}</div>;
}

function ReportCauses({annex}) {
  const t=useReportText();
  return <div className="erh-causes">
    <div className="erh-cause-status"><p>{annex.status}</p>{annex.conditions && <p>{annex.conditions}</p>}<small>{annex.period} · {annex.coverage}</small></div>
    {annex.groups.map((group,index)=><section className="erh-cause-group" key={index}>
      <h4>{group.label}</h4>
      <dl><div><dt>{t('De dónde viene')}</dt><dd>{group.origin}</dd></div><div><dt>{t('Posibles causas por contrastar')}</dt><dd>{group.factors}</dd></div><div><dt>{t('Qué verificar')}</dt><dd>{group.check}</dd></div></dl>
      <ReportTables report={{tables:[{title:t('Movimiento e impacto posible'),columns:[t('Referencia'),t('Cambio observado'),t('Consecuencias posibles')],rows:group.rows.map(row=>[row.reference,row.movement+'\n'+row.values,row.impact])}]}} />
      {group.link && <a className="erh-cause-method" href={group.link.url} target="_blank" rel="noreferrer">{t('Base del mecanismo')}: {group.link.label}<i className="fas fa-arrow-up-right-from-square" aria-hidden="true" /></a>}
    </section>)}
  </div>;
}

export function ReportReader({ report, prefix = 'erh-document' }) {
  const t=useReportText();
  const filterIdentity=[report.collection,report.key,report.editionId,report.baseReport?.key].join(':');
  const emptyFilters={country:'',query:'',state:''};
  const [selection,setSelection]=useState({identity:filterIdentity,value:emptyFilters});
  const filters=selection.identity===filterIdentity ? selection.value : emptyFilters;
  const setFilters=update=>setSelection(current=>{const value=current.identity===filterIdentity ? current.value : emptyFilters;return {identity:filterIdentity,value:typeof update==='function' ? update(value) : update};});
  const chapters = reportChapters(report);
  const outline = reportOutline(report, chapters);
  const reading = executiveReading(report);
  const layout=reportLayout(report);
  const isWeekly=layout?.composition==='weekly-sheet';
  const originals=new Map(Object.entries(report.causeText || {}).map(([original,translated])=>[translated,original]));
  const availability={t:(value,parameters)=>report.causeText?.[value] || t(value,parameters),source:value=>originals.get(value) || t.source?.(value) || value};
  const raw=weeklyReport(report,{t,number:reportNumber});
  const complete=availablePresentationModel(raw,availability);
  if(!hasPublishedReportData(complete))return <p role="status" className="erh-history-method">{t('No hay datos publicados para este informe.')}</p>;
  if(complete.newsExecutive)return <FinancialNewsBrief model={complete} report={report} prefix={prefix} />;
  if(complete.panorama)return <PanoramaReader model={complete} report={report} prefix={prefix} renderPart={(part,childPrefix)=><ReportReader report={part} prefix={childPrefix} />} />;
  const options=reportFilterOptions(complete,report);
  const daily=availablePresentationModel(filteredReportModel(raw,report,filters,availability),availability);
  const blocks=reportReaderOrder(daily.focusedMarket && isWeekly ? daily.blocks : outline);
  const weekly=isWeekly ? daily : null;
  const dashboard=isWeekly || layout?.composition==='company-dashboard';
  const content = {
    fxTreasury:daily.fxExecutive ? <FxTreasuryBrief model={daily} renderChart={visual=><LineVisual visual={visual} dashboard={dashboard} dataOnly={true} />} /> : null,
    session:daily.mexicoExecutive ? <MexicoOpening model={daily} /> : daily.commodityExecutive ? <CommodityOpening model={daily} /> : daily.equityExecutive ? <EquityExecutiveOpening model={daily} /> : daily.bondExecutive ? <BondExecutiveOpening model={daily} /> : daily.focusedMarket ? <div className="erh-session-context">{daily.summaryPanels.map(item=><section key={item.heading}><h4>{item.heading}</h4><p>{item.body}</p></section>)}</div> : <div className="erh-session-opening"><p>{daily.summary}</p>{daily.proteinBulletin && <ProteinCountryCoverage model={daily} />}<p className="erh-session-coverage">{daily.coverage}</p></div>,
    equityBusiness:daily.equityExecutive ? <EquityBusiness desk={daily.equityExecutive} /> : null,
    bondBusiness:daily.bondExecutive ? <EquityBusiness desk={daily.bondExecutive} /> : null,
    sessionContext:<div className="erh-session-context">{(daily.commentary || []).slice(2).map(item=><section key={item.heading}><h4>{item.heading}</h4><p>{item.body}</p></section>)}{daily.followup?.length>0 && <section><h4>{daily.followupHeading}</h4><ul>{daily.followup.map(item=><li key={item}>{item}</li>)}</ul></section>}</div>,
    causes:<ReportCauses annex={daily.causes} />,
    summary: <><div className={dashboard ? 'erh-executive-overview' : undefined}><p className="erh-document-summary">{report.summary || t("Sin resumen disponible para este corte.")}</p>
      {report.objective && <div className="erh-objective"><i className="fas fa-bullseye" aria-hidden="true" /><div><small>{t("Objetivo de la lectura")}</small><p>{report.objective}</p></div></div>}</div>
      {report.decisionGuide && <section className="erh-decision-guide" aria-label={t("Enfoque aplicado")}><h4>{report.decisionGuide.heading}</h4><p>{report.decisionGuide.action}</p><p>{report.decisionGuide.horizonNote}</p>{report.decisionGuide.coverageNote && <p className="erh-coverage-note">{report.decisionGuide.coverageNote}</p>}</section>}
      {!dashboard && !!reading.highlights.length && <div className="erh-takeaways"><h4>{reportLayout(report) ? t("Claves para el destinatario") : t("Claves para dirección")}</h4><ol>{reading.highlights.map((item, index) => <li key={index}>{item}</li>)}</ol></div>}
      <ExecutiveDesk brief={reading.brief} /></>,
    indicators: <><div className="erh-metrics">{(report.metrics || []).filter(metric=>!missingReportValue(metric.value)).map((metric, index) => <div key={index} className={metric.tone === 'down' ? 'is-down' : metric.tone === 'up' ? 'is-up' : 'is-neutral'}><small>{metric.label}</small><strong>{metric.value}</strong>{metric.change && <span className={metric.tone === 'down' ? 'erh-change-down' : metric.tone === 'up' ? 'erh-change-up' : 'erh-change-neutral'}><i className={`fas ${metric.tone === 'down' ? 'fa-arrow-trend-down' : metric.tone === 'up' ? 'fa-arrow-trend-up' : 'fa-minus'}`} aria-hidden="true" />{metric.change}</span>}</div>)}</div><BeforeAfter report={report} /></>,
    leadChart:<ReportVisuals report={{...report,visuals:daily.visuals.filter(visual=>visual.executiveLead)}} />,
    charts: daily.mexicoExecutive ? <MexicoChartExplorer key={daily.mexicoExecutive.key} model={daily} renderChart={visual=><ReportVisuals report={{...report,visuals:[visual]}} />} /> : daily.commodityExecutive ? <CommodityChartExplorer key={daily.commodityExecutive.key} model={daily} renderChart={visual=><ReportVisuals report={{...report,visuals:[visual]}} />} /> : <ReportVisuals report={weekly ? {...report,visuals:weekly.focusedMarket ? weekly.visuals.filter(visual=>!visual.executiveLead) : weekly.visuals} : report} />,
    tables: <ReportTables report={report} />,
    analysis: <div className="erh-chapters">{chapters.map((chapter, index) => <section key={index} className="erh-reader-chapter"><h4><span className="erh-chapter-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span>{t(chapter.heading)}</span></h4>{chapter.body.split(/\n{2,}/).filter(Boolean).map((paragraph, i) => <p key={i}>{paragraph}</p>)}</section>)}</div>,
    risks: <ol className="erh-risk-list" aria-label={t("Señales para seguimiento")}>{reading.risks.map((item, index) => <li key={index}><span className="erh-risk-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><p>{item}</p></li>)}</ol>,
    closing: <p className="erh-document-summary">{report.closing}</p>,
    conclusions: <MarketConclusions report={report} reading={reading} />,
  };
  if(weekly) {
    const tables=items=><ReportTables report={{...report,tables:items.map(table=>({...table,note:[table.note,table.unit && `${t('Unidad')}: ${table.unit}`,table.period && `${t('Periodo')}: ${table.period}`].filter(Boolean).join(' · ')}))}} />;
    content.results=<>
      {weekly.metrics.length>0 && <div className="erh-metrics erh-weekly-kpis">{weekly.metrics.map((metric,index)=><div key={index}><small>{metric.label}</small><strong>{metric.value}</strong>{metric.change && <span>{metric.change}</span>}</div>)}</div>}
    </>;
    content.comparisons=weekly.proteinBulletin ? <ProteinBulletinSheets model={weekly} report={report} /> : tables(weekly.results.filter(table=>!table.derivatives && (!weekly.equityExecutive || table.equityMaster)));
    content.equityContext=tables(weekly.results.filter(table=>table.equityContext));
    content.derivatives=tables(weekly.results.filter(table=>table.derivatives));
    content.history=<>{tables(weekly.history)}<ReportTables report={{...report,tables:weekly.tables}} /></>;
    content.statistics=tables(weekly.statistics);
  }
  return <>{!isWeekly && !daily.mexicoExecutive && <ReportReadingContext report={report} />}{complete.sessionReport && !complete.annualReport && <div className="erh-reading-filters">{complete.mexicoExecutive ? complete.mexicoExecutive.states.length>1 && <label>{t('Estado')}<select aria-label={t('Filtrar por estado')} value={filters.state || ''} onChange={event=>setFilters(current=>({...current,state:event.target.value}))}><option value="">{t('Todos los estados')}</option>{complete.mexicoExecutive.states.map(state=><option key={state} value={state}>{t(state)}</option>)}</select></label> : <label>{t('País')}<select aria-label={t('Filtrar por país')} value={filters.country} onChange={event=>setFilters(current=>({...current,country:event.target.value}))}><option value="">{t('Todos los países')}</option>{options.countries.map(country=><option key={country} value={country}>{report.causeText?.[country] || t(country)}</option>)}</select></label>}<label>{t('Producto o referencia')}<input type="search" aria-label={t('Filtrar producto o referencia')} value={filters.query} onChange={event=>setFilters(current=>({...current,query:event.target.value}))} /></label>{(filters.country || filters.query || filters.state) && <><button type="button" onClick={()=>setFilters({country:'',query:'',state:''})}>{t('Limpiar filtros')}</button><p role="status">{t(daily.mexicoExecutive ? 'Los filtros actualizan las señales visibles; el contexto nacional se identifica por separado y las descargas conservan el informe completo.' : daily.equityExecutive ? 'Los filtros seleccionan bolsas; el contexto y las descargas conservan el informe completo.' : 'Los filtros afectan la lectura; el resumen y las descargas conservan el informe completo.')}{!(daily.equityExecutive ? daily.results.some(table=>table.equityMaster) : daily.results.length) && ' '+t('No hay referencias que coincidan con los filtros.')}</p></>}</div>}<div className={`erh-reader${dashboard ? ' erh-company-reader erh-equity-reader' : ''}${isWeekly ? ' erh-weekly-reader' : ''}${daily.proteinBulletin ? ' erh-protein-reader' : ''}${daily.commodityExecutive || daily.mexicoExecutive ? ' erh-commodity-reader' : ''}`}>{blocks.map((block, index) => <section key={block.key} id={prefix + '-' + block.key} className={`erh-document-block erh-block-${block.key}`} aria-labelledby={prefix + '-heading-' + block.key} tabIndex={-1}>
    <header className="erh-block-heading"><span>{block.number || String(index + 1).padStart(2, '0')}</span><h3 id={prefix + '-heading-' + block.key}>{t(block.label)}</h3>{block.count != null && <small>{block.count} {t(block.count === 1 ? 'elemento' : 'elementos')}</small>}</header>
    {content[block.key]}
  </section>)}</div></>;
}

function ReportOrigin({report}) {
  const t=useReportText();
  return report.baseReport ? <p className="erh-report-origin">{t('Reporte base de')} {t(AREAS[report.baseReport.collection]?.label)}: <b>{report.baseReport.title}</b> · {cutLabel(report.baseReport.generatedAt,t.locale,t)}</p> : null;
}

export default function ExecutiveReportsHub({onAnnex}) {
  const presentationVersion=REPORT_PRESENTATION_VERSION;
  const [language]=useIdioma();
  const [requestedEdition] = useState(() => new URLSearchParams(window.location.search).get('informe') || '');
  const [area, setArea] = useState(() => requestedEdition ? 'mine' : 'finance');
  const [reportSets, setReportSets] = useState({ finance: null, markets: null });
  const [selected, setSelected] = useState({ finance: null, markets: null });
  const selectedRef=useRef(selected);selectedRef.current=selected;
  const [pendingCuts,setPendingCuts]=useState({});
  const manualRefresh=useRef(false);
  const [loadingArea, setLoadingArea] = useState('');
  const [refreshingArea,setRefreshingArea]=useState('');
  const libraryFetchedAt=useRef({});
  const loading = loadingArea === area;
  const [libraryError, setLibraryError] = useState({area:'',message:''});
  const [opening, setOpening] = useState({ id: '', pending: false, error: '' });
  const [status, setStatus] = useState('Elige una familia para consultar el último corte.');
  const [reader, setReader] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [pdfPreviewError,setPdfPreviewError]=useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingData,setDownloadingData]=useState(false);
  const [creationOpen, setCreationOpen] = useState(false);
  const [deliveryOpen,setDeliveryOpen]=useState(false);
  const [deliveryFeedback,setDeliveryFeedback]=useState({kind:'',message:''});
  const [mailStatus,setMailStatus]=useState(null);
  const [mailStatusLoading,setMailStatusLoading]=useState(false);
  const [mailStatusReload,setMailStatusReload]=useState(0);
  const [scheduleLoading,setScheduleLoading]=useState(false);
  const [scheduleLoadError,setScheduleLoadError]=useState('');
  const [scheduleReload,setScheduleReload]=useState(0);
  const [deleteTarget,setDeleteTarget]=useState(null);
  const [deletingReport,setDeletingReport]=useState(false);
  const [deleteError,setDeleteError]=useState('');
  const { preferences, ready: preferencesHydrated, email: accountEmail, setPreferences } = useReportPreferences();
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSchedules, setEmailSchedules] = useState([]);
  const [schedulingEmail, setSchedulingEmail] = useState(false);
  const [delivery, setDelivery] = useState(() => ({ ...DEFAULT_DELIVERY }));
  const [deliveryCategory,setDeliveryCategory]=useState('finance');
  const [deliveryTargets,setDeliveryTargets]=useState([]);
  const [deliveryUseAi,setDeliveryUseAi]=useState(false);
  const [deliveryCatalogLoading,setDeliveryCatalogLoading]=useState(false);
  const [deliveryCatalogError,setDeliveryCatalogError]=useState('');
  const [deliveryCatalogReload,setDeliveryCatalogReload]=useState(0);
  const [recipientChoice,setRecipientChoice]=useState({mode:'account',email:''});
  const [reloadVersion, setReloadVersion] = useState(0);
  const currentEdition = useRef('');
  const mounted = useRef(true);
  const openRequest = useRef(0);
  const libraryRequest = useRef(null);
  const editionRequest = useRef(null);
  const saveRequest = useRef(null);
  const deleteRequest = useRef(null);
  const creationId = useRef('');
  const saveIntent = useRef(null);
  const loadedDraftOwner = useRef('');
  const deliveryRequest = useRef(null);
  const deliveryChangeVersion=useRef(0);
  const deliveryDraftSignature=useRef('');
  const previewRequest = useRef(null);
  const downloadRequest = useRef(null);
  const pdfArtifact=useRef(null);
  const openedLink = useRef('');
  const reportAccount = useRef(accountEmail);
  useEffect(() => {
    if (reportAccount.current === accountEmail) return;
    reportAccount.current = accountEmail; openRequest.current++;
    for (const request of [aiRequest, libraryRequest, editionRequest, saveRequest, deleteRequest, deliveryRequest, previewRequest, downloadRequest]) { request.current?.abort(); request.current=null; }
    setAiGenerating(false);setSavingContent(false);setPdfPreviewLoading(false);setDownloadingPdf(false);setDownloadingData(false);setLoadingArea('');setLibraryError({area:'',message:''});setOpening({id:'',pending:false,error:''});
    setAiBefore(null);setAiError('');setAiInstructions('');setDraftPreferences(null);setCreationOverrides([]);aiMaterial.current=null;
    setSaveIssue('');setRecoverableDraft(null);setDraftStorageStatus('idle');creationId.current='';saveIntent.current=null;loadedDraftOwner.current='';
    setSelected(current => ({ ...current, mine: null }));
    setReportSets(current => ({ ...current, mine: null }));
    setContentDraft(null); setReloadVersion(value => value + 1);
    setCreationOpen(false);
    setDeleteTarget(null);setDeletingReport(false);setDeleteError('');
    setDeliveryOpen(false);setDeliveryFeedback({kind:'',message:''});setSendingEmail(false);setSchedulingEmail(false);
    setMailStatus(null);setMailStatusLoading(false);
    setRecipientChoice({mode:'account',email:''});
  }, [accountEmail]);

  const [contentDraft,setContentDraft]=useState(null);
  const draftRef = useRef(null);
  draftRef.current = contentDraft;
  const [savingContent,setSavingContent]=useState(false);
  const [aiInstructions,setAiInstructions]=useState('');
  const [aiTone,setAiTone]=useState('professional');
  const [draftPreferences,setDraftPreferences]=useState(null);
  const [creationOverrides,setCreationOverrides]=useState([]);
  const [saveIssue,setSaveIssue]=useState('');
  const [recoverableDraft,setRecoverableDraft]=useState(null);
  const [draftStorageStatus,setDraftStorageStatus]=useState('idle');
  const aiMaterial=useRef(null);
  const [aiGenerating,setAiGenerating]=useState(false);
  const [aiError,setAiError]=useState('');
  const [aiBefore,setAiBefore]=useState(null);
  const aiRequest=useRef(null);
  const saveUncertain=['uncertain','account'].includes(saveIssue);
  const reports = saveIssue==='account' || (area==='mine' && reportAccount.current!==accountEmail) ? [] : reportSets[area]?.data || [];
  useEffect(()=>{
    if(saveIssue!=='account') return;
    for(const request of [aiRequest,libraryRequest,editionRequest,deleteRequest,deliveryRequest,previewRequest,downloadRequest]) request.current?.abort();
    reader?.stop?.().catch(()=>{});setReader(null);setEmailSchedules([]);
    setCreationOpen(false);setDeliveryOpen(false);setDeleteTarget(null);setPreviewOpen(false);
  },[saveIssue,reader]);
  useEffect(()=>()=>{ for (const request of [aiRequest, libraryRequest, editionRequest, saveRequest, deleteRequest, deliveryRequest, previewRequest, downloadRequest]) request.current?.abort(); },[]);

  const baseActive = selected[area] || (area==='mine' ? null : reports[0]) || null;
  const editorPreferences = draftPreferences || reportEditionPreferences(baseActive, preferences);
  const active = reportAccount.current===accountEmail && saveIssue!=='account' ? reportPresentation(visibleReportEdition(contentDraft || baseActive, editorPreferences)) : null;
  const outputTitle=active ? `VALLNEWS · ${AREAS[area].label} · ${active.title}` : '';
  const localized=useLocalizedReport(active,outputTitle,language,accountEmail);
  const isPersonalized = reportPreferencesChanged(editorPreferences);
  const generationInstructions=aiInstructions.trim() || (creationOverrides.length ? 'Crea un informe con los datos disponibles, orientado a las preferencias que elegí. Señala la información que falta para tomar decisiones.' : '');
  const aiPending = Boolean(contentDraft && (active?.aiEdition ? (
    reportAiFocusSignature(active.aiEdition.preferences) !== reportAiFocusSignature(editorPreferences)
    || JSON.stringify(creationOverrides)!==JSON.stringify(active.aiEdition.preferenceOverrides || [])
    || (
      generationInstructions !== (active.aiEdition.instructions || '').trim()
      || aiTone !== (active.aiEdition.tone || 'professional')
    )
  ) : Boolean(generationInstructions)));
  const updateCreationPreference=(key,value)=>{
    if(!contentDraft || aiGenerating || savingContent || saveUncertain || !CREATION_FIELDS.includes(key)) return;
    const automatic=(['audience','depth','decisionHorizon','confidentiality'].includes(key) && value==='auto') || (key==='customTitle' && !String(value).trim());
    if(!automatic || key==='customTitle') setDraftPreferences(current=>key.startsWith('sections.')
      ? {...(current || editorPreferences),sections:{...(current || editorPreferences).sections,[key.slice(9)]:value}}
      : {...(current || editorPreferences),[key]:value});
    setCreationOverrides(current=>CREATION_FIELDS.filter(field=>field===key ? !automatic : current.includes(field)));
    setAiError('');
  };
  const scheduleSource=active?.baseReport ? {area:active.baseReport.collection,reportKey:active.baseReport.key} : baseActive && !baseActive.userEdition ? {area,reportKey:baseActive.key} : null;
  const activeSchedule=scheduleSource ? emailSchedules.find(schedule=>schedule.area===scheduleSource.area && schedule.reportKey===scheduleSource.reportKey) : null;
  const deliverySelectedSchedules=emailSchedules.filter(schedule=>deliveryTargets.includes(schedule.area+':'+schedule.reportKey));
  const deliveryActiveSchedule=deliveryTargets.length===1 ? deliverySelectedSchedules[0] : null;
  const recipientEmail=recipientChoice.mode==='other' ? recipientChoice.email.trim().toLowerCase() : accountEmail;
  const recipientValid=Boolean(recipientEmail && recipientEmail.length<=254 && /^[^\s@,;<>]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(recipientEmail));
  const nextRefreshAt = reportSets[area]?.nextRefreshAt;
  currentEdition.current = JSON.stringify([presentationVersion,language,area, baseActive?.key, baseActive?.generatedAt, baseActive?.editionVersion, preferences,draftPreferences,contentDraft]);

  const sessionStorage=()=>{try {return window.sessionStorage;} catch {return null;}};
  const draftRecord=()=>({version:1,owner:accountEmail.toLowerCase(),creationId:creationId.current,report:contentDraft,material:aiMaterial.current || contentDraft,preferences:editorPreferences,overrides:creationOverrides,instructions:aiInstructions,tone:aiTone,undo:aiBefore,saveIntent:saveIntent.current,saveIssue:savingContent || saveUncertain ? 'uncertain' : saveIssue});
  useEffect(()=>{
    if(!accountEmail || !preferencesHydrated || loadedDraftOwner.current===accountEmail) return;
    loadedDraftOwner.current=accountEmail;
    const recovered=readReportDraft(sessionStorage(),accountEmail);
    setRecoverableDraft(recovered.record);setDraftStorageStatus(recovered.status);
  },[accountEmail,preferencesHydrated]);
  useEffect(()=>{
    if(!contentDraft || !accountEmail || loadedDraftOwner.current!==accountEmail) return;
    setDraftStorageStatus(writeReportDraft(sessionStorage(),accountEmail,draftRecord()) ? 'saved' : 'unavailable');
    // Cada cambio del pedido o de su resultado se conserva en esta pestaña.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[accountEmail,contentDraft,draftPreferences,creationOverrides,aiInstructions,aiTone,aiBefore,saveIssue,savingContent]);
  useEffect(()=>{
    if(!contentDraft || draftStorageStatus!=='unavailable') return undefined;
    const protect=event=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',protect);
    return ()=>window.removeEventListener('beforeunload',protect);
  },[contentDraft,draftStorageStatus]);
  const resumeDraft=()=>{
    if(!recoverableDraft || contentDraft || aiGenerating || savingContent) return;
    const record=recoverableDraft;
    cancelOpening();setArea('mine');setSelected(current=>({...current,mine:null}));
    creationId.current=record.creationId;saveIntent.current=record.saveIntent || null;aiMaterial.current=record.material;
    setContentDraft(record.report);setDraftPreferences(record.preferences);setCreationOverrides(record.overrides);setAiInstructions(record.instructions);setAiTone(record.tone);
    setSaveIssue(record.saveIntent ? 'uncertain' : '');setAiBefore(record.undo || null);setAiError('');setRecoverableDraft(null);
    setStatus(record.saveIntent ? 'Recuperamos el borrador. Reintenta el guardado para comprobar el mismo informe, sin crear duplicados.' : 'Borrador recuperado. Puedes continuar donde te quedaste.');
  };
  const pauseDraft=()=>{
    if(!contentDraft || aiGenerating || savingContent) return;
    const record=draftRecord();
    if(!writeReportDraft(sessionStorage(),accountEmail,record)) {setDraftStorageStatus('unavailable');setStatus('Este navegador no pudo conservar el borrador. Mantén esta pestaña abierta y guarda el informe antes de salir.');return;}
    setRecoverableDraft(record);setContentDraft(null);setDraftPreferences(null);setCreationOverrides([]);setAiBefore(null);setAiError('');setAiInstructions('');setSaveIssue('');
    aiMaterial.current=null;saveIntent.current=null;creationId.current='';
    setStatus('Tu borrador queda en esta pestaña. Puedes revisar la biblioteca y continuar después.');
  };

  useEffect(() => () => { reader?.stop?.().catch(() => {}); }, [reader]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); }, [pdfPreviewUrl]);

  useEffect(() => {
    setEmailSchedules([]);setScheduleLoadError('');
    if(!accountEmail) {setScheduleLoading(false);return undefined;}
    const controller = new AbortController();
    setScheduleLoading(true);
    reportJsonRequest('/api/report-email-schedules',{signal:controller.signal},{expectedOwner:accountEmail,errorMessage:'No pudimos consultar tus programaciones.'})
      .then(payload=>{if(!Array.isArray(payload.data)) throw Error('La lista de programaciones está incompleta.');if(!controller.signal.aborted) setEmailSchedules(payload.data);})
      .catch(error=>{if(!controller.signal.aborted) {if(error.code==='REPORT_ACCOUNT_CHANGED') setSaveIssue('account');setScheduleLoadError(error.message);}})
      .finally(()=>{if(!controller.signal.aborted) setScheduleLoading(false);});
    return () => controller.abort();
  }, [accountEmail,scheduleReload]);

  useEffect(() => {
    if (!deliveryOpen || !accountEmail) return undefined;
    const controller=new AbortController();
    setMailStatusLoading(true);setMailStatus(null);
    reportJsonRequest('/api/report-email/status',{signal:controller.signal},{expectedOwner:accountEmail,timeoutMs:10000,errorMessage:'No pudimos comprobar el servidor de correo.'})
      .then(payload=>{
        if(typeof payload.mail?.configured!=='boolean') throw Error('El servidor no dispone de la comprobación de correo actualizada.');
        if(controller.signal.aborted) return;
        setMailStatus(payload.mail);
        if(payload.mail.configured) {
          setDeliveryFeedback(current=>current.code==='REPORT_EMAIL_NOT_CONFIGURED' || current.message==='El envío por correo aún no está configurado en el servidor.' ? {kind:'',message:''} : current);
          setStatus(current=>current==='El envío por correo aún no está configurado en el servidor.' || current.startsWith('El servidor no tiene configurado el correo:') ? 'Configuración de correo comprobada.' : current);
        }
      })
      .catch(error=>{if(!controller.signal.aborted) {if(error.code==='REPORT_ACCOUNT_CHANGED') setSaveIssue('account');setMailStatus({configured:null,message:error.message});}})
      .finally(()=>{if(!controller.signal.aborted) setMailStatusLoading(false);});
    return ()=>controller.abort();
  },[deliveryOpen,accountEmail,mailStatusReload]);

  useEffect(()=>{
    if(!deliveryOpen || !accountEmail) return undefined;
    const controller=new AbortController();let timer,running=false;
    const refresh=async()=>{
      if(running || controller.signal.aborted) return;
      running=true;clearTimeout(timer);
      const version=deliveryChangeVersion.current;
      try {
        const [scheduled,mail]=await Promise.all([
          reportJsonRequest('/api/report-email-schedules',{signal:controller.signal},{expectedOwner:accountEmail,timeoutMs:10000,errorMessage:'No pudimos consultar tus programaciones.'}),
          reportJsonRequest('/api/report-email/status',{signal:controller.signal},{expectedOwner:accountEmail,timeoutMs:10000,errorMessage:'No pudimos comprobar el servidor de correo.'}),
        ]);
        if(!controller.signal.aborted && version===deliveryChangeVersion.current) {
          if(Array.isArray(scheduled.data)) {setEmailSchedules(scheduled.data);setScheduleLoadError('');}
          if(typeof mail.mail?.configured==='boolean') setMailStatus(mail.mail);
        }
      } catch(error) {if(!controller.signal.aborted && error.code==='REPORT_ACCOUNT_CHANGED') setSaveIssue('account');}
      finally {running=false;if(!controller.signal.aborted) timer=setTimeout(refresh,30000);}
    };
    timer=setTimeout(refresh,30000);window.addEventListener('focus',refresh);
    return ()=>{controller.abort();clearTimeout(timer);window.removeEventListener('focus',refresh);};
  },[deliveryOpen,accountEmail]);

  useEffect(()=>{
    if(!deliveryOpen || !accountEmail) return undefined;
    setDeliveryCatalogError('');
    if(reportSets[deliveryCategory]?.data) {setDeliveryCatalogLoading(false);return undefined;}
    const controller=new AbortController();
    setDeliveryCatalogLoading(true);
    reportJsonRequest(AREAS[deliveryCategory].endpoint,{signal:controller.signal},{timeoutMs:60000,errorMessage:'No se pudieron cargar los informes de esta categoría.'})
      .then(payload=>{if(!isReportLibrary(payload.data)) throw Error('Biblioteca incompleta.');if(!controller.signal.aborted) setReportSets(current=>({...current,[deliveryCategory]:payload}));})
      .catch(error=>{if(!controller.signal.aborted) setDeliveryCatalogError(error.message);})
      .finally(()=>{if(!controller.signal.aborted) setDeliveryCatalogLoading(false);});
    return ()=>controller.abort();
  },[deliveryOpen,accountEmail,deliveryCategory,deliveryCatalogReload,reportSets]);

  useEffect(() => {
    const signature=JSON.stringify([accountEmail,scheduleSource?.area,scheduleSource?.reportKey,activeSchedule?.delivery,activeSchedule?.recipientEmail,activeSchedule?.preferences?.emailRecipient]);
    if(deliveryDraftSignature.current===signature) return;
    deliveryDraftSignature.current=signature;
    setDelivery(deliveryDraft(activeSchedule));
    const target=activeSchedule?.recipientEmail || activeSchedule?.preferences?.emailRecipient;
    setRecipientChoice(target && target.toLowerCase()!==accountEmail?.toLowerCase() ? {mode:'other',email:target} : {mode:'account',email:''});
  }, [scheduleSource?.area, scheduleSource?.reportKey, activeSchedule,accountEmail]);

  useEffect(() => {
    previewRequest.current?.abort();previewRequest.current=null;setPdfPreviewLoading(false);
    pdfArtifact.current=null;
    setPdfPreviewUrl('');
    setPdfPreviewError('');
  }, [presentationVersion,language,area, active?.key, active?.generatedAt, active?.editionVersion, preferences,draftPreferences,contentDraft,accountEmail]);

  useEffect(() => {
    const cached = reportSets[area];
    if (area==='mine' && cached && !cached.partial) {
      // Al sincronizar la cuenta puede cancelarse una consulta mientras su
      // respuesta ya está disponible. La biblioteca debe mostrar ese corte.
      setLoadingArea(current => current === area ? '' : current);
      return;
    }
    const controller = new AbortController();
    libraryRequest.current = controller;
    const requestedManually=manualRefresh.current;manualRefresh.current=false;
    libraryFetchedAt.current[area]=Date.now();
    setRefreshingArea(area);
    setLoadingArea(cached?.data?.length ? '' : area);
    setLibraryError({area:'',message:''});
    if (!draftRef.current && !cached?.data?.length) setStatus('Consultando los informes…');
    // Un corte puede regenerarse manualmente durante una transición editorial.
    // No reutilizamos una respuesta privada de minutos atrás porque mostraría
    // una hora de generación y un contenido distintos al informe disponible.
    reportJsonRequest(AREAS[area].endpoint, { signal: controller.signal }, { expectedOwner:area==='mine' ? accountEmail : undefined, timeoutMs:area==='mine' ? 20000 : 60000, errorMessage: 'No fue posible cargar los informes.', timeoutMessage: 'La biblioteca tardó demasiado. Vuelve a intentar la carga.' })
      .then(payload => {
        if (!isReportLibrary(payload.data,area==='mine')) throw new Error('La biblioteca devolvió una respuesta incompleta. Vuelve a intentar la carga.');
        if (controller.signal.aborted) return;
        setReportSets(current => ({ ...current, [area]: payload }));
        if(area!=='mine') {
          const prior=selectedRef.current[area],updated=payload.data.find(report=>report.key===prior?.key) || payload.data[0] || null;
          const expandedGrains=area==='markets' && updated?.key==='grains' && (updated.commodityCatalogVersion || 0)>(prior?.commodityCatalogVersion || 0);
          if(prior && !requestedManually && !expandedGrains && JSON.stringify(updated)!==JSON.stringify(prior))setPendingCuts(current=>({...current,[area]:updated}));
          else {setSelected(current=>JSON.stringify(updated)===JSON.stringify(current[area])?current:{...current,[area]:updated});setPendingCuts(current=>({...current,[area]:null}));}
        }
        if (!draftRef.current) setStatus(payload.data.length ? 'Elige un informe para descargarlo o escucharlo.' : AREAS[area].empty);
      })
      .catch(error => { if (!controller.signal.aborted) {if(error.code==='REPORT_ACCOUNT_CHANGED') setSaveIssue('account');setLibraryError({area,message:error.message || AREAS[area].empty});if(!draftRef.current) setStatus(error.message || AREAS[area].empty);} })
      .finally(() => { if (libraryRequest.current === controller) { libraryRequest.current=null; if (!controller.signal.aborted) {setLoadingArea('');setRefreshingArea('');} } });
    return () => { controller.abort(); };
    // La petición pertenece al área que estaba activa al iniciarse. Los cambios
    // de carga no son dependencias: si lo fueran, limpiarían esta petición antes
    // de que pudiera pintar su respuesta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, reloadVersion, accountEmail,presentationVersion]);

  useEffect(()=>{
    if(area==='mine')return undefined;
    const refresh=()=>{
      if(document.visibilityState==='hidden' || draftRef.current || libraryRequest.current || Date.now()-(libraryFetchedAt.current[area] || 0)<60000)return;
      setReloadVersion(value=>value+1);
    };
    const timer=setInterval(refresh,60000);
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[area]);

  const openSavedReport = useCallback(async report => {
    editionRequest.current?.abort();
    const controller = new AbortController(), owner = accountEmail;
    editionRequest.current=controller;
    const request = ++openRequest.current;
    setSelected(current=>({...current,mine:null}));
    setOpening({id:report.editionId,title:report.title || 'tu informe',pending:true,error:''});
    setStatus('Abriendo el contenido completo de tu informe…');
    try {
      const payload=await reportJsonRequest('/api/user-reports/'+encodeURIComponent(report.editionId),{signal:controller.signal},{expectedOwner:owner,errorMessage:'No se pudo abrir tu informe.',timeoutMessage:'El informe tardó demasiado en cargar. Puedes reintentar la apertura.'});
      if (!isReportDocument(payload.data) || payload.data.editionId!==report.editionId || !Array.isArray(payload.data.sections) || !reportHasContent(payload.data) || !Number.isInteger(payload.data.editionVersion) || payload.data.editionVersion<1) throw Error('El servidor devolvió un informe incompleto. Reintenta la apertura.');
      if (!mounted.current || controller.signal.aborted || request!==openRequest.current || reportAccount.current!==owner) return;
      setSelected(current=>({...current,mine:payload.data}));
      setOpening({id:'',pending:false,error:''});setStatus(`Tu informe: ${payload.data.title}.`);
    } catch(error) {
      if (mounted.current && !controller.signal.aborted && request===openRequest.current && reportAccount.current===owner) {
        if(error.code==='REPORT_ACCOUNT_CHANGED') setSaveIssue('account');
        setOpening({id:report.editionId,title:report.title || 'tu informe',pending:false,error:error.message});setStatus(error.message);
      }
    } finally { if(editionRequest.current===controller) editionRequest.current=null; }
  }, [accountEmail]);

  useEffect(() => {
    if (saveIssue==='account' || area!=='mine' || !accountEmail || contentDraft || selected.mine || opening.id) return;
    const linkKey=accountEmail+':'+requestedEdition;
    const fromLink=requestedEdition && openedLink.current!==linkKey;
    const report=fromLink ? {editionId:requestedEdition} : reportSets.mine?.data?.[0];
    if (!report) return;
    if (fromLink) openedLink.current=linkKey;
    void openSavedReport(report);
  }, [area,accountEmail,contentDraft,selected.mine,opening.id,requestedEdition,reportSets.mine,openSavedReport,saveIssue]);

  const cancelOpening = () => {
    openRequest.current++;editionRequest.current?.abort();editionRequest.current=null;
    setOpening({id:'',pending:false,error:''});
  };

  const changeArea = nextArea => {
    if(saveIssue==='account') return;
    if(aiGenerating) {setStatus('Espera a que termine la IA o cancela la generación.');return;}
    if(contentDraft) {setStatus('Guarda o cancela la edición antes de cambiar de colección.');return;}
    if (requestedEdition) openedLink.current = accountEmail + ':' + requestedEdition;
    cancelOpening();
    if (reader) { reader.stop?.().catch(() => {}); setReader(null); }
    setPreviewOpen(false);
    setDraftPreferences(null);setCreationOverrides([]);setAiBefore(null);setAiError('');setAiInstructions('');aiMaterial.current=null;
    setArea(nextArea);
  };

  const selectReport = async report => {
    if(saveIssue==='account') return;
    if(aiGenerating) {setStatus('Espera a que termine la IA o cancela la generación.');return;}
    if(contentDraft) {setStatus('Guarda o cancela la edición antes de abrir otro informe.');return;}
    if (requestedEdition) openedLink.current = accountEmail + ':' + requestedEdition;
    setDraftPreferences(null);setCreationOverrides([]);setAiBefore(null);setAiError('');setAiInstructions('');aiMaterial.current=null;
    if(report.editionId) {
      await openSavedReport(report);
      return;
    }
    cancelOpening();
    setPendingCuts(current=>({...current,[area]:null}));
    setSelected(current => ({ ...current, [area]: report }));
    setStatus(`Vista previa lista: ${report.title}.`);
  };
  const restoreTables=()=>{
    if(contentDraft || aiGenerating || savingContent || saveIssue==='account' || !accountEmail)return;
    const restore=current=>({...current,sections:{...current.sections,tables:true}});
    setPreferences(restore);
    setDraftPreferences(current=>restore(current || editorPreferences));
    setStatus('Tablas de datos activadas para la lectura y las descargas.');
  };
  const newReport=()=>{
    if(saveIssue==='account') return;
    if(aiGenerating) {setStatus('Espera a que termine la IA o cancela la generación.');return;}
    if(contentDraft) {setStatus('Guarda o cancela tu edición actual antes de crear otro informe.');return;}
    if (!accountEmail) {setStatus('Inicia sesión para crear y guardar tus informes.');return;}
    if(recoverableDraft) {setStatus('Continúa o descarta tu borrador pendiente antes de crear otro informe.');return;}
    setCreationOpen(true);
  };
  const startReport=(collection,base)=>{
    if (saveIssue==='account' || !accountEmail || contentDraft || recoverableDraft || aiGenerating) return;
    const draft=createReportDraft(collection,base,preferences);
    if (requestedEdition) openedLink.current = accountEmail + ':' + requestedEdition;
    cancelOpening();
    reader?.stop?.().catch(()=>{});setReader(null);setPreviewOpen(false);setCreationOpen(false);
    setDraftPreferences(draft.preferences);setCreationOverrides([]);setAiInstructions('');setAiTone('professional');setAiBefore(null);setAiError('');aiMaterial.current=draft.report;
    creationId.current=draft.creationId;saveIntent.current=null;setSaveIssue('');
    setSelected(current=>({...current,mine:null}));setArea('mine');setContentDraft(draft.report);
    setStatus(base ? `Base seleccionada: ${base.title}. Escribe qué necesitas y pulsa Generar con IA.` : 'Escribe qué informe necesitas y genéralo con IA.');
  };
  const saveContent=async(copy=false)=>{
    if(saveIssue==='account' || !contentDraft || !accountEmail || saveRequest.current || aiGenerating) return;
    if(aiPending) {setStatus('Genera tu nuevo pedido antes de guardar la edición.');return;}
    if(copy) {creationId.current=crypto.randomUUID();saveIntent.current=null;}
    if(!creationId.current) creationId.current=crypto.randomUUID();
    const intent=saveIntent.current || {creationId:creationId.current,report:JSON.parse(JSON.stringify(active))};
    saveIntent.current=intent;
    const owner = accountEmail,controller=new AbortController();saveRequest.current=controller;
    setSavingContent(true);setSaveIssue('');setStatus('Guardando tu informe…');
    try {const payload=await reportJsonRequest('/api/user-reports',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({...intent,expectedOwner:owner})},{timeoutMs:30000,errorMessage:'No se pudo confirmar el guardado. Tu borrador sigue disponible.',timeoutMessage:'El guardado tardó demasiado. Conservamos tu borrador. Reintenta para comprobar el mismo informe sin crear duplicados.'});
      if(!isReportDocument(payload.data) || payload.data.editionId!==intent.creationId || !Array.isArray(payload.data.sections) || !reportHasContent(payload.data) || !Number.isInteger(payload.data.editionVersion) || payload.data.editionVersion<1) throw Error('No se pudo confirmar el guardado completo. Tu borrador sigue disponible; reintenta el guardado.');
      if (!mounted.current || controller.signal.aborted || reportAccount.current !== owner) return;
      const saved=payload.data;
      discardReportDraft(sessionStorage(),owner);creationId.current='';saveIntent.current=null;setSaveIssue('');setRecoverableDraft(null);setDraftStorageStatus('empty');
      libraryRequest.current?.abort();libraryRequest.current=null;setLoadingArea('');
      setAiBefore(null);setAiError('');setDraftPreferences(null);setCreationOverrides([]);aiMaterial.current=null;setSelected(current=>({...current,mine:saved}));setContentDraft(null);setArea('mine');
      setReportSets(current=>({...current,mine:{...current.mine,success:true,partial:!current.mine || Boolean(current.mine.partial),storage:payload.storage || current.mine?.storage,data:[{key:saved.key,editionId:saved.editionId,editionVersion:saved.editionVersion,title:saved.title,eyebrow:'Tu informe guardado',updatedAt:saved.updatedAt,userEdition:true},...(current.mine?.data || []).filter(report=>report.editionId!==saved.editionId)]}}));setReloadVersion(value=>value+1);
      setStatus(`Informe guardado: ${payload.data.title}. Ya está disponible en Mis informes.`);
    } catch(error) {if (mounted.current && !controller.signal.aborted && reportAccount.current === owner) {
      const definite=error.status && error.status<500;
      if(definite) saveIntent.current=null;
      setSaveIssue(error.code==='REPORT_ACCOUNT_CHANGED' ? 'account' : error.code==='REPORT_CREATION_CONFLICT' ? 'conflict' : error.code==='REPORT_CREATION_REMOVED' ? 'removed' : error.status===401 ? 'session' : definite ? '' : 'uncertain');setStatus(error.message);
    }}
    finally {if(saveRequest.current===controller) {saveRequest.current=null;if (mounted.current) setSavingContent(false);}}
  };

  const generateAi=async()=>{
    if(!contentDraft || aiRequest.current || savingContent || saveUncertain || !preferencesHydrated) return;
    if(!accountEmail) {setAiError('Inicia sesión para generar tu informe.');return;}
    if(!generationInstructions) {setAiError('Describe qué necesitas o elige las opciones de tu informe.');return;}
    const owner=accountEmail,controller=new AbortController();
    const source=JSON.parse(JSON.stringify(contentDraft || baseActive));
    if(!source.userEdition && area!=='mine') source.collection=area;
    // Mantén los datos del material inicial para poder volver a incluir bloques
    // en otra generación durante esta edición, aunque la IA los haya excluido.
    if(aiMaterial.current) for(const key of ['metrics','visuals','tables','sources','sourceLinks','watchlist']) source[key]=aiMaterial.current[key] || [];
    const before={draft:JSON.parse(JSON.stringify(contentDraft)),preferences:contentDraft.aiEdition?.preferences || editorPreferences,overrides:contentDraft.aiEdition?.preferenceOverrides || creationOverrides,material:aiMaterial.current,instructions:contentDraft.aiEdition?.instructions || aiInstructions,tone:contentDraft.aiEdition?.tone || aiTone};
    const configuration=normalizePreferences(editorPreferences);
    aiRequest.current=controller;setAiGenerating(true);setAiError('');setStatus('ORION está generando tu versión personalizada…');
    try {
      const payload=await reportJsonRequest('/api/user-reports/generate',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({expectedOwner:owner,report:source,instructions:generationInstructions,preferences:configuration,options:{tone:aiTone,mode:'instructions',preferenceOverrides:creationOverrides}})},{timeoutMs:100000,timeoutMessage:'La generación tardó demasiado. Tu informe sigue disponible; puedes intentarlo de nuevo.',errorMessage:'No se pudo generar una versión. Tu informe sigue disponible.'});
      if(!isReportDocument(payload.data) || !Array.isArray(payload.data.sections) || !payload.data.sections.some(section=>typeof section?.text==='string' && section.text.trim())) throw Error('La IA devolvió una edición incompleta. Tu informe anterior sigue disponible.');
      if(!mounted.current || controller.signal.aborted || reportAccount.current!==owner) return;
      setAiBefore(before);aiMaterial.current=source;setDraftPreferences(normalizePreferences(payload.data.aiEdition?.preferences || payload.data.personalization || configuration));setAiTone(payload.data.aiEdition?.tone || aiTone);
      setContentDraft({...payload.data,key:source.key,editionId:source.editionId,editionVersion:source.editionVersion});
      setPreviewOpen(false);
      setStatus('Versión generada con IA. Revísala en la lectura; puedes pedir más cambios o guardar tu informe.');
    } catch(error) {
      if(mounted.current && reportAccount.current===owner && aiRequest.current===controller) {
        if(controller.signal.aborted) setStatus('Generación cancelada. Se conserva tu versión anterior.');
        else {const message=error.name==='TimeoutError' ? 'La generación tardó demasiado. Tu informe sigue disponible; puedes intentarlo de nuevo.' : error.message;if(error.code==='REPORT_ACCOUNT_CHANGED') setSaveIssue('account');setAiError(message);setStatus(message);}
      }
    } finally {if(aiRequest.current===controller) {aiRequest.current=null;if(mounted.current) setAiGenerating(false);}}
  };
  const undoAi=()=>{if(!aiBefore || aiGenerating || savingContent || saveUncertain) return;setContentDraft(aiBefore.draft);setDraftPreferences(aiBefore.preferences);setCreationOverrides(aiBefore.overrides);setAiInstructions(aiBefore.instructions || '');setAiTone(aiBefore.tone || 'professional');aiMaterial.current=aiBefore.material;setAiBefore(null);setAiError('');setStatus('Restaurada la versión anterior a la generación de IA.');};
  const cancelCreation=()=>{
    if(savingContent) return;
    const origin=contentDraft?.baseReport;
    aiRequest.current?.abort();aiRequest.current=null;setAiGenerating(false);
    discardReportDraft(sessionStorage(),accountEmail);setRecoverableDraft(null);
    creationId.current='';saveIntent.current=null;setSaveIssue('');setDraftStorageStatus('empty');
    setContentDraft(null);setDraftPreferences(null);setCreationOverrides([]);aiMaterial.current=null;
    setAiBefore(null);setAiError('');setAiInstructions('');setPreviewOpen(false);
    if(origin?.collection && AREAS[origin.collection]) {
      const base=reportSets[origin.collection]?.data?.find(report=>report.key===origin.key);
      if(base) setSelected(current=>({...current,[origin.collection]:base}));
      setArea(origin.collection);
    }
    setStatus('Creación cancelada. Tus informes guardados siguen disponibles.');
  };
  const requestDelete=report=>{
    if(area!=='mine' || !accountEmail || !report?.editionId || aiGenerating || savingContent || deletingReport) return;
    if(contentDraft) {setStatus('Guarda o cancela tu edición antes de eliminar un informe.');return;}
    setDeleteTarget(report);setDeleteError('');
  };
  const deleteReport=async()=>{
    if(!deleteTarget || deleteRequest.current || contentDraft || !accountEmail) return;
    const target=deleteTarget,owner=accountEmail,controller=new AbortController();deleteRequest.current=controller;
    setDeletingReport(true);setDeleteError('');
    try {
      const payload=await reportJsonRequest('/api/user-reports/'+encodeURIComponent(target.editionId),{method:'DELETE',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({version:target.editionVersion,expectedOwner:owner})},{errorMessage:'No se pudo eliminar el informe.',timeoutMessage:'No pudimos confirmar la eliminación. Actualiza Mis informes antes de volver a intentar.'});
      if(payload.data?.editionId!==target.editionId) throw Error('No pudimos confirmar qué informe se eliminó. Actualiza Mis informes.');
      if(!mounted.current || controller.signal.aborted || reportAccount.current!==owner) return;
      libraryRequest.current?.abort();libraryRequest.current=null;setLoadingArea('');
      if(selected.mine?.editionId===target.editionId || opening.id===target.editionId) {
        cancelOpening();reader?.stop?.().catch(()=>{});setReader(null);setPreviewOpen(false);
        setSelected(current=>({...current,mine:current.mine?.editionId===target.editionId ? null : current.mine}));
        setDraftPreferences(null);setCreationOverrides([]);setAiBefore(null);setAiError('');setAiInstructions('');aiMaterial.current=null;
      }
      setReportSets(current=>({...current,mine:{...current.mine,data:(current.mine?.data || []).filter(report=>report.editionId!==target.editionId)}}));
      const url=new URL(window.location.href);
      if(url.searchParams.get('informe')===target.editionId) {url.searchParams.delete('informe');window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);openedLink.current=owner+':'+requestedEdition;}
      setDeleteTarget(null);setStatus(`Informe eliminado: ${target.title}.`);
    } catch(error) {if(mounted.current && !controller.signal.aborted && reportAccount.current===owner) {if(error.code==='REPORT_ACCOUNT_CHANGED') setSaveIssue('account');setDeleteError(error.message);}}
    finally {if(deleteRequest.current===controller) {deleteRequest.current=null;if(mounted.current) setDeletingReport(false);}}
  };
  const updateDelivery = (key, value) => setDelivery(current => ({ ...current, [key]: value }));
  const runDeliveryAction=async(kind,message,operation)=>{
    if(saveIssue==='account' || deliveryRequest.current || !accountEmail) return;
    const owner=accountEmail,controller=new AbortController();deliveryRequest.current=controller;
    deliveryChangeVersion.current++;
    if(kind==='email') setSendingEmail(true);else setSchedulingEmail(true);
    setDeliveryFeedback({kind:'loading',message});setStatus(message);
    try {
      const result=await operation(controller.signal);
      if(!mounted.current || controller.signal.aborted || reportAccount.current!==owner) return;
      result.apply?.();setDeliveryFeedback({kind:'success',message:result.message,messageKey:result.messageKey,parameters:result.parameters,nextRunAt:result.nextRunAt});setStatus(result.message);
    } catch(error) {
      if(mounted.current && !controller.signal.aborted && reportAccount.current===owner) {if(error.code==='REPORT_ACCOUNT_CHANGED') setSaveIssue('account');setDeliveryFeedback({kind:'error',message:error.message,code:error.code});setStatus(error.message);}
    } finally {if(deliveryRequest.current===controller) {deliveryRequest.current=null;if(mounted.current) {setSendingEmail(false);setSchedulingEmail(false);}}}
  };

  const sendPdfByEmail=()=>{
    if(reportEmailState({active,accountEmail,sessionChanged:saveIssue==='account',sendingEmail,schedulingEmail,pdfPreviewLoading,downloadingPdf,downloadingData,localizingReport:localized.pending,localizationError:localized.error,recipientValid,mailStatusLoading,mailStatus,aiEditorProps:{pending:aiPending,generating:aiGenerating}}).disabled) return;
    const report=active,language=leerIdioma();
    return runDeliveryAction('email','Generando y enviando el PDF…',async signal=>{
      const payload=await reportJsonRequest('/api/report-email',{method:'POST',signal,headers:{'Content-Type':'application/json','X-VALL-Report-Language':language},body:JSON.stringify({expectedOwner:accountEmail,language,title:`VALLNEWS · ${AREAS[area].label} · ${report.title}`,content:reportText(report),executiveReport:report,recipientEmail})},{timeoutMs:language==='es' ? 60000 : 150000,errorMessage:'No se pudo enviar el informe.',timeoutMessage:'No pudimos confirmar el envío. Revisa el correo de destino antes de volver a intentar.'});
      if(payload.language!==language) throw Error('El servidor no confirmó el idioma del envío. Comprueba el correo recibido antes de volver a enviarlo.');
      return {message:`PDF enviado a ${payload.email || recipientEmail}.`,messageKey:'PDF enviado a {email}.',parameters:{email:payload.email || recipientEmail}};
    });
  };

  const schedulePdfEmail=()=>{
    if(!deliveryTargets.length || scheduleLoading || scheduleLoadError || (deliveryUseAi && aiPending) || aiGenerating) return;
    if(!delivery.enabled) {
      if(deliveryActiveSchedule) return cancelPdfSchedule(deliveryActiveSchedule);
      const message='Los envíos automáticos siguen desactivados para este informe.';
      setDeliveryFeedback({kind:'success',message});setStatus(message);return;
    }
    if(!recipientValid) return;
    const language=leerIdioma();
    const editing=Boolean(contentDraft);
    const savedAi=active?.aiEdition || activeSchedule?.preferences?.aiCustomization || {};
    const instructions=editing ? generationInstructions : savedAi.instructions || '';
    const byRequest=editing ? Boolean(instructions.trim()) : savedAi.mode==='instructions';
    const overrides=editing ? creationOverrides : savedAi.preferenceOverrides || [];
    const ai=deliveryUseAi ? {enabled:true,instructions,tone:editing ? aiTone : savedAi.tone || 'professional',...(byRequest ? {mode:'instructions'} : {}),...(overrides.length ? {preferenceOverrides:overrides} : {})} : {enabled:false};
    const selection=deliveryTargets.map(key=>{
      const [selectedArea,reportKey]=key.split(':');
      const current=scheduleSource?.area===selectedArea && scheduleSource?.reportKey===reportKey;
      return {area:selectedArea,reportKey,preferences:current ? editorPreferences : normalizePreferences({...preferences,customTitle:''}),ai};
    });
    return runDeliveryAction('schedule','Programando la entrega…',async signal=>{
      const multiple=selection.length>1;
      const payload=await reportJsonRequest('/api/report-email-schedules'+(multiple?'/batch':''),{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedOwner:accountEmail,language,...(multiple?{reports:selection}:selection[0]),delivery,recipientEmail})},{errorMessage:'No se pudo programar el informe.'});
      const saved=multiple ? payload.schedules : [payload.schedule];
      if(!Array.isArray(saved)||saved.length!==selection.length||selection.some(source=>!saved.some(row=>row?.nextRunAt&&row.area===source.area&&row.reportKey===source.reportKey))) throw Error('No pudimos confirmar la programación del informe.');
      const nextRunAt=saved.map(row=>row.nextRunAt).sort()[0];
      return {message:`Entrega activada para ${recipientEmail}. Próximo envío: ${new Date(nextRunAt).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Mexico_City'})}, hora de Ciudad de México.`,messageKey:'Entrega activada para {email}. Próximo envío: {date}, hora de Ciudad de México.',parameters:{email:recipientEmail},nextRunAt,apply:()=>setEmailSchedules(current=>[...current.filter(item=>!selection.some(source=>item.area===source.area&&item.reportKey===source.reportKey)),...saved])};
    });
  };

  const cancelPdfSchedule=(schedule=activeSchedule)=>{
    if(!schedule) return;
    return runDeliveryAction('schedule','Cancelando programación…',async signal=>{
      await reportJsonRequest('/api/report-email-schedules/cancel',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedOwner:accountEmail,area:schedule.area,reportKey:schedule.reportKey})},{errorMessage:'No se pudo cancelar la programación.'});
      return {message:'Se canceló el envío automático de este informe.',apply:()=>{
        setEmailSchedules(current=>current.filter(item=>!(item.area===schedule.area && item.reportKey===schedule.reportKey)));
        if(schedule.area===scheduleSource?.area && schedule.reportKey===scheduleSource?.reportKey) setDelivery(current=>({...current,enabled:false}));
      }};
    });
  };

  const openPdfPreview = async () => {
    if (!active || previewRequest.current || downloadRequest.current || localized.pending || localized.error || aiPending || aiGenerating) return;
    const requestedLanguage=leerIdioma();
    const edition = currentEdition.current,controller=new AbortController();previewRequest.current=controller;
    setPdfPreviewLoading(true);
    setPdfPreviewError('');
    setStatus('Generando la vista previa del PDF…');
    try {
      await verifyReportOwner(accountEmail,controller.signal);
      if(edition!==currentEdition.current || requestedLanguage!==leerIdioma()) return;
      if(pdfPreviewUrl && pdfArtifact.current?.language===requestedLanguage && pdfArtifact.current.edition===edition) return;
      const cached=pdfArtifact.current;
      const blob=cached?.language===requestedLanguage && cached.edition===edition ? cached.blob : await requestReportPdf(active,outputTitle,reportText(active),fetch,{signal:controller.signal,expectedOwner:accountEmail,language:requestedLanguage});
      if (!mounted.current || controller.signal.aborted) return;
      if (edition !== currentEdition.current || requestedLanguage!==leerIdioma()) { setStatus('La edición o el idioma cambió durante la generación. Genera el PDF de la versión actual.'); return; }
      setPdfPreviewUrl(URL.createObjectURL(blob));
      pdfArtifact.current={blob,language:requestedLanguage,edition};
      setStatus('Vista previa PDF lista. Esta copia no cambia el informe base.');
    } catch (error) { if (mounted.current && !controller.signal.aborted) {if(error.code==='REPORT_ACCOUNT_CHANGED') setSaveIssue('account');const message=error.message || 'No se pudo generar la vista previa del PDF.';setPdfPreviewError(message);setStatus(message);} }
    finally { if (previewRequest.current===controller) {previewRequest.current=null;if (mounted.current) setPdfPreviewLoading(false);} }
  };

  const openPdfFile=async event=>{
    event.preventDefault();
    if(!pdfPreviewUrl || !accountEmail) return;
    const owner=accountEmail,edition=currentEdition.current,selectedLanguage=leerIdioma();
    try {
      await verifyReportOwner(owner);
      if(!mounted.current || reportAccount.current!==owner || edition!==currentEdition.current || selectedLanguage!==leerIdioma()) return;
      window.open(pdfPreviewUrl,'_blank','noopener,noreferrer');
    } catch(error) {if(mounted.current && reportAccount.current===owner) {if(error.code==='REPORT_ACCOUNT_CHANGED') setSaveIssue('account');setStatus(error.message);}}
  };

  const downloadPdf = async event => {
    if (!active || downloadRequest.current || previewRequest.current || localized.pending || localized.error || event.currentTarget.disabled || aiPending || aiGenerating) return;
    const button = event.currentTarget;
    const owner=accountEmail,language=leerIdioma(),controller=new AbortController();downloadRequest.current=controller;setDownloadingPdf(true);
    setStatus('Preparando PDF…');
    try {
      // Se descarga exactamente la edición revisada, sin sustituirla por otro
      // corte entre la vista previa y el clic. El visor y la descarga comparten bytes.
      const reportToExport=active,edition=currentEdition.current;
      await verifyReportOwner(owner,controller.signal);
      if(edition!==currentEdition.current || language!==leerIdioma()) return;
      const cached=pdfArtifact.current;
      const blob=cached?.language===language && cached.edition===edition ? cached.blob : await requestReportPdf(reportToExport,outputTitle,reportText(reportToExport),fetch,{signal:controller.signal,expectedOwner:owner,language});
      if (!mounted.current || controller.signal.aborted || reportAccount.current!==owner || language!==leerIdioma() || edition!==currentEdition.current) return;
      pdfArtifact.current={blob,language,edition};
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = reportDownloadName(reportToExport,'pdf',{language,title:localized.report?.title});
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus('PDF listo para descargar.');
    } catch (error) { if(mounted.current && !controller.signal.aborted && reportAccount.current===owner) {if(error.code==='REPORT_ACCOUNT_CHANGED') setSaveIssue('account');setStatus(error.message || 'No se pudo descargar el PDF.');} }
    finally { if(downloadRequest.current===controller) {downloadRequest.current=null;if(mounted.current) setDownloadingPdf(false);} button.disabled = false; }
  };

  const downloadData = async () => {
    if (!active || downloadRequest.current || aiPending || aiGenerating) return;
    const owner=accountEmail,language=leerIdioma(),report=active,controller=new AbortController();downloadRequest.current=controller;setDownloadingData(true);setStatus('Preparando datos en el idioma seleccionado…');
    try {
      await verifyReportOwner(owner,controller.signal);
      const excel=(report.baseReport?.key || report.key)==='grains',blob=excel ? await requestReportFile(report,report.title,reportText(report),'xlsx',fetch,{signal:controller.signal,expectedOwner:owner,language}) : language==='es' ? new Blob([reportCsv(report)],{type:'text/csv;charset=utf-8'}) : await requestReportFile(report,report.title,reportText(report),'csv',fetch,{signal:controller.signal,expectedOwner:owner,language});
      if(!mounted.current || controller.signal.aborted || reportAccount.current!==owner || language!==leerIdioma()) return;
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=reportDownloadName(report,excel ? 'xlsx' : 'csv',{language,title:localized.report?.title});
      document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setStatus('Datos estructurados listos para abrir en Excel o una hoja de cálculo.');
    } catch(error) {if(mounted.current && !controller.signal.aborted && reportAccount.current===owner) {if(error.code==='REPORT_ACCOUNT_CHANGED') setSaveIssue('account');setStatus(error.message || 'No se pudieron exportar los datos.');}}
    finally {if(downloadRequest.current===controller) {downloadRequest.current=null;if(mounted.current) setDownloadingData(false);}}
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
    if (!supportsGeminiLive()) { setStatus('La lectura con ORION requiere HTTPS y un navegador compatible.'); return; }
    button.disabled = true;
    setStatus('Conectando con ORION…');
    try {
      const session = await startGeminiLive({
        captureMicrophone: false,
        onState: state => setStatus({ connecting: 'Conectando con ORION…', listening: 'ORION está listo para leer el informe.', speaking: 'ORION está leyendo el informe…' }[state] || 'Lectura finalizada.'),
        onError: message => { setReader(null); setStatus(`Lectura no disponible: ${message}`); },
      });
      setReader(session);
      session.speak(`Lee en voz alta este informe ejecutivo de ${AREAS[area].label} de manera clara, natural y profesional. No agregues cifras, fuentes o consejos que no estén en el texto. ${reportText(active)}`);
    } catch (error) { setStatus(error.message || 'No se pudo iniciar ORION.'); }
    finally { button.disabled = false; }
  };

  const retryReports = () => {
    manualRefresh.current=true;
    if(area==='mine')setReportSets(current => ({ ...current, [area]: null }));
    setReloadVersion(current => current + 1);
  };

  return <ReportWorkspace
    onAnnex={onAnnex} pendingCut={pendingCuts[area]} applyPendingCut={()=>{const next=pendingCuts[area];if(next){setSelected(current=>({...current,[area]:next}));setPendingCuts(current=>({...current,[area]:null}));}}}
    deliveryOpen={deliveryOpen} openDelivery={()=>{if(saveIssue!=='account' && !aiGenerating && !savingContent && accountEmail) {setDeliveryFeedback({kind:'',message:''});setDeliveryCategory(scheduleSource?.area || 'finance');setDeliveryTargets(scheduleSource?[scheduleSource.area+':'+scheduleSource.reportKey]:[]);setDeliveryUseAi(activeSchedule?.preferences?.aiCustomization?.enabled ?? Boolean(active?.aiEdition));setDelivery(deliveryDraft(activeSchedule));setDeliveryOpen(true);}}} closeDelivery={()=>{if(!sendingEmail && !schedulingEmail) setDeliveryOpen(false);}}
    deliveryFeedback={deliveryFeedback} scheduleSource={scheduleSource} emailSchedules={emailSchedules} cancelPdfSchedule={cancelPdfSchedule}
    mailStatus={mailStatus} mailStatusLoading={mailStatusLoading} retryMailStatus={()=>setMailStatusReload(value=>value+1)}
    recipientChoice={recipientChoice} recipientEmail={recipientEmail} recipientValid={recipientValid} updateRecipientChoice={(key,value)=>{setRecipientChoice(current=>({...current,[key]:value}));setDeliveryFeedback({kind:'',message:''});}}
    scheduleLoading={scheduleLoading} scheduleLoadError={scheduleLoadError} retrySchedules={()=>setScheduleReload(value=>value+1)}
    deliveryCategory={deliveryCategory} setDeliveryCategory={setDeliveryCategory} deliveryTargets={deliveryTargets}
    toggleDeliveryTarget={key=>setDeliveryTargets(current=>current.includes(key)?current.filter(item=>item!==key):[...current,key])}
    selectDeliveryCategory={rows=>setDeliveryTargets(current=>[...new Set([...current,...rows.map(row=>deliveryCategory+':'+row.key)])])}
    deliveryCatalogLoading={deliveryCatalogLoading} deliveryCatalogError={deliveryCatalogError} retryDeliveryCatalog={()=>setDeliveryCatalogReload(value=>value+1)}
    deliveryUseAi={deliveryUseAi} setDeliveryUseAi={setDeliveryUseAi} deliveryActiveSchedule={deliveryActiveSchedule}
    refreshAfterDeleteError={()=>{if(!deletingReport) {setDeleteTarget(null);setDeleteError('');cancelOpening();setSelected(current=>({...current,mine:null}));retryReports();}}}
    deleteTarget={deleteTarget} deletingReport={deletingReport} deleteError={deleteError} requestDelete={requestDelete} deleteReport={deleteReport} closeDelete={()=>{if(!deletingReport) {setDeleteTarget(null);setDeleteError('');}}}
    creationOpen={creationOpen} closeCreation={()=>setCreationOpen(false)} startReport={startReport}
    sessionChanged={saveIssue==='account'}
    recoverableDraft={saveIssue!=='account' && recoverableDraft?.owner===accountEmail?.toLowerCase() ? recoverableDraft : null} resumeDraft={resumeDraft} discardRecovery={()=>{discardReportDraft(sessionStorage(),accountEmail);setRecoverableDraft(null);setDraftStorageStatus('empty');}}
    saveIssue={saveIssue} draftStorageStatus={draftStorageStatus} pauseDraft={pauseDraft}
    contentDraft={contentDraft} newReport={newReport} saveContent={saveContent} savingContent={savingContent} cancelCreation={cancelCreation}
    aiEditorProps={{account:accountEmail,instructions:aiInstructions,onInstructions:value=>{if(savingContent || saveUncertain) return;setAiInstructions(value);setAiError('');},pending:aiPending,onGenerate:generateAi,onCancel:()=>aiRequest.current?.abort(),onUndo:undoAi,generating:aiGenerating,disabled:savingContent || saveUncertain || !accountEmail || !preferencesHydrated,error:aiError,canUndo:Boolean(aiBefore),canGenerate:Boolean(generationInstructions),report:contentDraft || baseActive,material:aiMaterial.current || contentDraft,preferences:editorPreferences,overrideFields:creationOverrides,onPreference:updateCreationPreference,onReleasePreferences:()=>{if(!aiGenerating && !savingContent && !saveUncertain) {setCreationOverrides([]);setAiError('');}}}}
    areas={AREAS} area={area} changeArea={changeArea} reports={reports} reportSets={reportSets}
    active={active} baseActive={baseActive} selectReport={selectReport} loading={loading}
    libraryError={libraryError.area===area ? libraryError.message : ''}
    opening={saveIssue==='account' ? {id:'',pending:false,error:''} : opening} retryOpening={()=>openSavedReport({editionId:opening.id,title:opening.title})}
    status={status} retryReports={retryReports} refreshingReports={refreshingArea===area} nextRefreshAt={nextRefreshAt} cut={cutLabel(active?.generatedAt)}
    preferences={preferences} preferencesHydrated={preferencesHydrated} isPersonalized={isPersonalized}
    restoreTables={restoreTables}
    delivery={delivery} updateDelivery={updateDelivery} deliveryDescription={deliveryDescription(delivery)}
    deliveryFrequencies={DELIVERY_FREQUENCIES} deliveryHours={DELIVERY_HOURS} deliveryDays={DELIVERY_DAYS}
    activeSchedule={activeSchedule} schedulingEmail={schedulingEmail} schedulePdfEmail={schedulePdfEmail}
    sendPdfByEmail={sendPdfByEmail} sendingEmail={sendingEmail} accountEmail={accountEmail}
    pdfPreviewUrl={pdfArtifact.current?.language===language && pdfArtifact.current.edition===currentEdition.current ? pdfPreviewUrl : ''} pdfPreviewLoading={pdfPreviewLoading} pdfPreviewError={pdfPreviewError} pdfPreviewKey={currentEdition.current} openPdfPreview={openPdfPreview} openPdfFile={openPdfFile}
    localizedReport={localized.report} localizingReport={localized.pending} localizationError={localized.error} retryLocalization={localized.retry}
    downloadPdf={downloadPdf} downloadingPdf={downloadingPdf} downloadingData={downloadingData} downloadData={downloadData} reader={reader} listen={listen}
    language={language} languageName={IDIOMAS.find(item=>item.lang===language)?.nombre || language}
    previewOpen={previewOpen} setPreviewOpen={setPreviewOpen} chapters={reportChapters(active)}
    renderReport={(report, prefix) => <><ReportOrigin report={report} /><ReportReader report={report} prefix={prefix} /></>}
  />;
}
