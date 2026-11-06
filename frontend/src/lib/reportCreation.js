import {isCommodityExecutive} from '../../../shared/report-commodity-executive.mjs';
import {isMarketNews,marketNewsEvidence} from '../../../shared/report-market-news.mjs';
import {isFinancialNews,financialNewsEvidence} from '../../../shared/report-financial-news.mjs';
import { normalizePreferences } from './executiveReportPreferences.js';
import REPORT_COLLECTIONS from '../../../shared/report-collections.json' with { type: 'json' };
import {sessionEvidence,sessionNews} from '../../../shared/report-session-evidence.mjs';
import {weeklyReport} from '../../../shared/report-weekly.mjs';
import {focusedEvidence} from '../../../shared/report-market-analysis.mjs';
import {scopeUsProteinReport} from '../../../shared/report-protein-scope.mjs';
import {compactBondPoints} from '../../../shared/report-bond-evidence.mjs';

export function createReportDraft(collection, base, preferences) {
  const copy = scopeUsProteinReport(base ? {...JSON.parse(JSON.stringify(base)),collection} : {});
  if(collection==='markets' && base?.key==='proteins')copy.metrics=weeklyReport({...copy,collection}).metrics;
  const title = base ? `Mi edición · ${base.title}`.slice(0, 140) : 'Mi informe';
  const configuration = normalizePreferences({ ...preferences, customTitle: title });
  const baseReport = base ? { collection, key: base.key, title: base.title, generatedAt: base.generatedAt || '' } : undefined;
  if (base && !REPORT_COLLECTIONS[collection]?.reportKeys?.includes(base.key)) throw Error('Selecciona un reporte base disponible.');
  // Una creación siempre tiene identidad propia, incluso si la entrada contiene
  // metadatos de otra edición. Los arrays del catálogo se copian completos.
  const { editionId: _id, editionVersion: _version, aiEdition: _ai, baseReport: _origin, ...material } = copy;
  return { creationId:crypto.randomUUID(), preferences: configuration, report: {
    ...material, ...(isMarketNews(copy) ? {marketNews:marketNewsEvidence(copy),marketNewsVersion:1} : {}), ...(isFinancialNews(copy) ? {financialNews:financialNewsEvidence(copy),newsVersion:1} : {}), ...(copy.panoramaParts ? {} : focusedEvidence({...copy,collection},{saved:true})), key: 'draft', title, userEdition: true, baseReport,
    ...(baseReport?.key==='fx' ? {dailyReferences:undefined,sessionObservations:undefined,sessionNews:undefined} : {}),
    ...(!copy.panoramaParts && !isCommodityExecutive({...copy,collection}) && !['equities','bonds','fx'].includes(baseReport?.key) ? {sessionObservations:sessionEvidence(copy),sessionNews:sessionNews(copy)} : {}),
    ...((baseReport?.collection==='finance' && baseReport.key==='equities') ? {...(copy.equityCatalogVersion ? {equityCatalogVersion:copy.equityCatalogVersion} : {}),equityNews:copy.equityNews || [],equityObservations:copy.equityObservations || (copy.sourceSnapshot?.equities || copy.equitySeries || []).map(item=>({label:item.label,region:item.region || '',symbol:item.symbol || '',market:item.market || '',exchange:item.exchange || '',kind:item.kind || 'equity',points:(item.series || item.points || item.recentSeries || []).slice(-65)}))} : {}),
      ...((baseReport?.collection==='finance' && baseReport.key==='bonds') ? {...(copy.bondSchemaVersion ? {bondSchemaVersion:copy.bondSchemaVersion} : {}),bondNews:copy.bondNews || [],dailyReferences:undefined,bondObservations:(copy.bondObservations || copy.sourceSnapshot?.bonds || []).map(item=>({id:item.id || '',label:item.label,symbol:item.symbol || '',market:item.market || '',currency:item.currency || '',maturity:item.maturity || '',tenorYears:item.tenorYears,cadence:item.cadence || 'daily',basis:item.basis || '',region:item.region || '',code:item.code || '',source:item.source || '',url:item.url || '',points:item.cadence==='monthly' ? (item.series || item.points || []).filter(point=>point.date>='2020-01').slice(-256) : compactBondPoints(item.series || item.points || item.recentSeries || [],copy.generatedAt)}))} : {}),
      ...(isCommodityExecutive({...copy,collection}) ? {dailyReferences:undefined,sessionObservations:undefined} : {}),
    generatedAt: base?.generatedAt || new Date().toISOString(), personalization: configuration,
    executiveBrief: null, decisionGuide: null, sourceSnapshot: null, content: '',
    summary: baseReport?.key==='bonds' ? weeklyReport(copy).summary : copy.summary || '', objective: copy.objective || '', closing: copy.closing || '',
    sections: copy.sections?.length ? copy.sections : copy.content ? [{ heading: 'Análisis', text: copy.content }] : [{ heading: 'Análisis', text: '' }],
    metrics:isCommodityExecutive({...copy,collection}) || baseReport?.key==='fx' ? [] : copy.metrics || [], tables:isCommodityExecutive({...copy,collection}) || baseReport?.key==='fx' ? [] : copy.tables || [], visuals: isCommodityExecutive({...copy,collection}) || ['equities','bonds','fx'].includes(baseReport?.key) ? [] : copy.visuals || [],
    sources: (copy.sources || []).map(value=>String(value).replace(/https?:\/\/\S+/g,'').replace(/[: ·-]+$/,'').slice(0,240)).filter(Boolean), sourceLinks: copy.sourceLinks || [], watchlist: copy.watchlist || [], takeaways: copy.takeaways || [],
  } };
}
