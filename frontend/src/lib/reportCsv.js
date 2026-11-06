import {reportLineSeries,finiteReportNumber} from './reportVisualData.js';
import {sourceEntries} from './reportSources.js';
import {reportLayout} from './reportLayout.js';
import {weeklyReport} from '../../../shared/report-weekly.mjs';
import {marketAnalysisTables} from '../../../shared/report-market-analysis.mjs';
import {displayReferenceLabel} from '../../../shared/report-display-format.mjs';
import {mexicoProductionObservations} from '../../../shared/report-mexico-export-data.mjs';
export {sourceEntries} from './reportSources.js';
function csvValue(value) {
  const text=String(value ?? ''),safe=!(typeof value==='number' && Number.isFinite(value)) && /^[\s\uFEFF]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"','""')}"`;
}
export function reportCsv(report,{t=value=>value,source=value=>value,extraTables=[]}={}) {
  const labels=values=>values.map(value=>t(value));
  const rows=[['VALLNEWS · '+t('Datos del informe ejecutivo'),report?.title || t('Informe ejecutivo')],[t('Corte'),report?.generatedAt || '']];
  if(reportLayout(report)?.composition==='weekly-sheet') {
    const model=weeklyReport(report,{t,source});
    const production=report.personalization?.sections?.tables===false ? [] : mexicoProductionObservations(report);
    if(production.length)rows.push([],[t('Observaciones anuales de producción')],labels(['Referencia','Mercado','Unidad','Periodo anual','Valor','Frecuencia original','Fuente','Enlace']),...production.map(item=>[item.label,item.market,item.unit,item.year,item.value,t('Anual'),item.source,item.url]));
    const currencyLevels=Boolean(model.bondExecutive || model.fxExecutive || model.panorama);
    if(model.panorama)rows.push([],[t('Cortes de los capítulos')],...model.panorama.chapters.map(chapter=>[chapter.label,chapter.generatedAt,t(chapter.kind==='structural' ? 'Contexto estructural' : 'Consultar fecha de cada observación')]));
    if(model.panorama?.signals.length && report.personalization?.sections?.tables!==false)rows.push([],[t('Señales principales')],labels(['Referencia','Valor','Unidad','Fecha / periodo observado','Variación','Unidad del cambio','Base comparada']),...model.panorama.signals.map(item=>[item.label,item.numericValue,item.unit,item.date,item.numericChange,item.changeUnit,item.baseDate]));
    if(model.annualReport) rows.splice(1,1,[t('Periodo anual'),String(report.reportYear)],[t('Preparado el'),report.generatedAt]);
    if(model.annualReport && report.personalization?.sections?.tables!==false && report.annualReferences?.length){
      rows.push([],[t('Observaciones anuales de la fuente')],labels(['Referencia','Mercado','Unidad','Fecha observada','Periodo anual','Valor','Naturaleza','Frecuencia original','Fuente','Enlace']));
      for(const item of report.annualReferences){
        const cadence=t(({daily:'Diaria',weekly:'Semanal',monthly:'Mensual',annual:'Anual'})[item.cadence] || 'No declarada');
        if(item.prior)rows.push([item.label,item.market,item.unit,item.prior.date,report.reportYear,item.prior.value,t('Base del cierre anual anterior'),cadence,item.source,item.url]);
        for(const point of item.points)rows.push([item.label,item.market,item.unit,point.date,report.reportYear,point.value,t('Muestra mensual publicada'),cadence,item.source,item.url]);
        if(Number.isFinite(item.annualValue))rows.push([item.label,item.market,item.unit,'',report.reportYear,item.annualValue,t('Indicador anual publicado'),cadence,item.source,item.url]);
      }
    }
    if(model.annualReport && report.personalization?.sections?.tables!==false && report.annualProduction?.length){
      rows.push([],[t('Observaciones anuales de producción')],labels(['Referencia','Mercado','Unidad','Periodo anual','Valor','Frecuencia original','Fuente']));
      for(const item of report.annualProduction)for(const [key,label] of [['corn','Maíz'],['wheat','Trigo'],['sorghum','Sorgo'],['soy','Soya']])if(Number.isFinite(item[key]))rows.push([t(label),'México · '+item.state,'t',report.reportYear,item[key],t('Anual'),'DGSIAP']);
    }
    if(model.sessionReport) {
      if(!model.annualReport && model.references.length) rows.push([],[t('Observaciones de la fuente')],model.mexicoExecutive ? labels(['Referencia','Unidad','Fecha o periodo observado','Valor observado','Frecuencia original','Etapa / presentación','Fuente','Enlace']) : currencyLevels ? [t('Referencia'),t('Mercado / moneda'),t('Unidad'),t('Fecha'),t('Nivel observado')] : [t('Referencia'),t(model.sectorSession ? 'Unidad' : 'Región'),t('Fecha'),t(model.bondSession ? 'Rendimiento (%)' : model.sectorSession ? 'Valor observado' : 'Cierre en puntos')]);
      if(report.personalization?.sections?.tables!==false) for(const item of model.references) {
        // A published monthly/weekly quote need not have a daily history.
        const points=item.points?.length ? item.points : Number.isFinite(item.last?.value) ? [item.last] : [];
        for(const point of model.focusedMarket ? points : points.slice(['weekly','monthly','annual','auction'].includes(item.cadence) ? -1 : -2)) rows.push(model.mexicoExecutive ? [displayReferenceLabel(item.label),item.unit,point.date,point.value,t(({daily:'Diaria',weekly:'Semanal',monthly:'Mensual',annual:'Anual',auction:'Subasta'})[item.cadence] || 'No declarada'),item.basis || '',item.source || '',item.url || ''] : currencyLevels ? [item.label,[item.market || item.region,item.currency].filter(Boolean).join(' · '),item.unit,point.date,point.value] : [item.label,model.bondSession ? [item.market || item.region,item.currency].filter(Boolean).join(' · ') : model.sectorSession ? item.unit : item.region,point.date,point.value]);
      }
      if((model.annualReport || model.mexicoExecutive || model.commodityExecutive?.key==='proteins') && report.personalization?.sections?.charts!==false) for(const visual of model.visuals) {
        rows.push([],[visual.title],[t('Método y alcance'),visual.note]);
        if(visual.type==='bar')rows.push([t('Referencia'),t('Valor'),t('Unidad'),...(model.mexicoExecutive || model.commodityExecutive?.key==='proteins' ? [t('Periodo')] : [])],...(visual.bars || []).map(item=>[item.label,item.value,visual.unit,...(model.mexicoExecutive || model.commodityExecutive?.key==='proteins' ? [item.date || visual.periodLabel || (/^20\d{2}$/.test(item.label) ? item.label : '')] : [])]));
        else rows.push([t('Referencia'),t('Fecha del dato'),t('Valor'),t('Unidad')],...(visual.series || []).flatMap(item=>item.points.map(point=>[item.label,point.date,point.value,visual.unit])));
      }
      const sources=sourceEntries(report);
      if(!model.proteinBulletin && report.personalization?.sections?.sources!==false && sources.length) rows.push([],[t('Fuentes y enlaces')],labels(['Fuente','Enlace']),...sources.map(item=>[item.label,item.url || '']));
    }
    for(const table of [...model.results,...(model.annexTables || [])]) rows.push([],[table.title],...(table.period ? [[t('Periodo'),table.period]] : []),...(table.note ? [[t('Método y alcance'),table.note]] : []),table.columns,...table.rows);
    for(const table of [...(model.focusedMarket && !model.bondExecutive && !model.panorama ? marketAnalysisTables(report) : []),...extraTables]) rows.push([],[table.title],[t('Método y alcance'),table.note || ''],table.columns,...table.rows);
    return `\uFEFF${rows.map(row=>row.map(csvValue).join(',')).join('\r\n')}`;
  }
  for(const [label,key] of [['Resumen ejecutivo','summary'],['Objetivo','objective'],['Decisión y seguimiento','closing']]) if(report?.[key]) rows.push([t(label),report[key]]);
  (report?.sections || []).forEach(section=>rows.push([],[t('Análisis'),section.heading],[t('Texto'),section.text]));
  rows.push([],[t('Indicadores')],labels(['Indicador','Valor','Cambio']),...(report?.metrics || []).map(item=>[item.label,item.value,item.change ?? '']));
  (report?.tables || []).forEach(table=>{rows.push([],[table.title],table.columns || [],...(table.rows || []));if(table.note) rows.push([t('Nota'),table.note]);});
  for(const visual of report?.visuals || []) {
    rows.push([],[t('Datos de la gráfica'),visual.title],[t('Unidad'),visual.unit || t('Sin unidad declarada')]);
    if(visual.note) rows.push([t('Método y alcance'),visual.note]);
    if(visual.type==='bar') {
      rows.push(labels(['Categoría','Valor mostrado','Unidad']));
      (visual.bars || []).forEach(item=>{const value=finiteReportNumber(item.value);if(value!==null) rows.push([item.label,value,visual.unit || '']);});
    } else {
      rows.push(labels(['Serie','Fecha observada','Valor mostrado','Unidad']));
      reportLineSeries(visual).series.forEach(series=>series.points.forEach(point=>rows.push([series.label,point.date,point.value,visual.unit || ''])));
    }
  }
  if(report?.takeaways?.length) rows.push([],[t('Claves para dirección')],...report.takeaways.map(value=>[value]));
  if(report?.watchlist?.length) rows.push([],[t('Riesgos y seguimiento')],...report.watchlist.map(value=>[value]));
  const sources=sourceEntries(report);
  for(const table of extraTables) rows.push([],[table.title],[t('Método y alcance'),table.note || ''],table.columns,...table.rows);
  if(sources.length) rows.push([],[t('Fuentes y enlaces')],labels(['Fuente','Enlace']),...sources.map(item=>[item.label,item.url || '']));
  return `\uFEFF${rows.map(row=>row.map(csvValue).join(',')).join('\r\n')}`;
}
