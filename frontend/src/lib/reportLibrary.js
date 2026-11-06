import {reportMethodology} from '../../../shared/report-methodology.mjs';
import {reportJsonRequest} from './reportRequest.js';
import {isReportDocument} from './reportDataValidation.js';
import catalog from '../../../shared/report-library.json' with {type:'json'};
import {weeklyReport} from '../../../shared/report-weekly.mjs';
import {marketAnalysisTables} from '../../../shared/report-market-analysis.mjs';
import {scopeUsProteinReport} from '../../../shared/report-protein-scope.mjs';
import {sourceEntries} from './reportSources.js';
export {catalog as REPORT_LIBRARY};
export async function fetchAnnualReports(year,signal) {
  if(!catalog.years.includes(Number(year)))throw Error('Año de la librería no válido.');
  const payload=await reportJsonRequest('/api/annual-reports?year='+year,{signal},{timeoutMs:180000,errorMessage:'No se pudo cargar la edición anual.'});
  const expected=Object.entries(catalog.reports).flatMap(([area,items])=>Object.keys(items).map(key=>area+':'+key));
  if(payload.year!==Number(year) || !Array.isArray(payload.data) || payload.data.length!==expected.length || new Set(payload.data.map(report=>report.collection+':'+report.key)).size!==expected.length || payload.data.some(report=>report.periodType!=='annual' || report.reportYear!==Number(year) || !isReportDocument(report) || !expected.includes(report.collection+':'+report.key)))throw Error('La librería devolvió una edición incompleta o de otro año.');
  return payload.data;
}
export function reportAnnex(report,{t=value=>value}={}) {
  report=scopeUsProteinReport(report);
  const model=weeklyReport(report,{t}),annual=report.periodType==='annual';
  const labels=t;t=value=>report.causeText?.[value] || labels(value);
  const methods=reportMethodology(report).map(item=>({title:t(item.title),text:t(item.text)}));
  if(model.panorama)methods.push({title:t('Panorama integrado'),text:t('Cada capítulo conserva su propio corte, moneda, unidad y frecuencia. Las comparativas de largo plazo usan las muestras históricas disponibles; no se fabrican sesiones intermedias. Los indicadores económicos y de producción mensuales o anuales son contexto estructural, separado de los cambios diarios. Las noticias se agrupan por título o enlace para evitar duplicados.')});
  if(model.equityExecutive)methods.push({title:t('Riesgo y moneda base'),text:t('El sesgo favorable exige S&P 500 al alza, VIX a la baja y spread HY sin ampliación, en las mismas fechas. El defensivo exige la combinación contraria; en otro caso se informa señal mixta. Es una lectura de datos observados, no una probabilidad ni una orden de inversión. La equivalencia USD usa el tipo de cambio de cada fecha, no el cambio actual aplicado al pasado.')});
  const snapshot=model.fxExecutive ? {...report.sourceSnapshot,fxHistories:model.references.map(item=>({...item,series:item.points}))} : report.sourceSnapshot || {},seen=new Set(),provenance=[];
  for(const bucket of ['equities','bonds','fxHistories','grains','energy','proteins','quotes'])for(const item of snapshot[bucket] || []) {
    const key=[item.label || item.name || item.symbol,item.source,item.unit].join('|');if(seen.has(key))continue;seen.add(key);
    const last=(item.series || item.recentSeries || []).at(-1);
    provenance.push([item.label || item.name || item.symbol || 'Referencia',item.source || 'Sin proveedor identificado',item.market || '',item.unit || (bucket==='equities' ? 'puntos' : bucket==='fxHistories' ? item.quoteCurrency+' por 1 USD' : ''),({daily:'Diaria',weekly:'Semanal',monthly:'Mensual',annual:'Anual',auction:'Subasta'})[item.cadence || (bucket==='equities' || bucket==='fxHistories' ? 'daily' : '')] || 'No declarada',last?.date || item.observedAt || 'Sin dato',item.basis || '',item.quoteStatus==='preserved' ? 'Último dato conservado' : last ? 'Con observaciones' : 'Sin observaciones recuperadas']);
  }
  const tables=[...model.results,...(model.annexTables || []),...marketAnalysisTables(report)];
  if(provenance.length)tables.push({kind:'provenance',title:'Procedencia y alcance de cada referencia',columns:['Referencia','Proveedor','Mercado','Unidad','Frecuencia original','Última observación','Naturaleza del dato','Disponibilidad'],rows:provenance.map(row=>row.map(t)),note:'El enlace identifica la fuente; la fecha y la disponibilidad acreditan qué dato se recuperó. Las referencias de distintos proveedores no se encadenan para calcular un cambio diario.'});
  return {methods,sources:sourceEntries(report),tables:tables.map(table=>({...table,title:t(table.title),note:t(table.note || ''),columns:table.columns.map(t)})),coverage:model.coverage,title:report.title,period:annual ? String(report.reportYear) : report.generatedAt};
}
export function saveReportBlob(blob,name) {
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
