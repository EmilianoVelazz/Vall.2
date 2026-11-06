import CREATION_FIELDS from '../../../shared/report-creation-fields.json' with { type: 'json' };
import REPORT_COLLECTIONS from '../../../shared/report-collections.json' with { type: 'json' };
import { isReportDocument } from './reportDataValidation.js';
import {isPanorama} from '../../../shared/report-panorama.mjs';

const PREFIX='vall_report_creation_v1_';
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MAX_LENGTH=1536*1024;
const maximum=record=>[record?.report,record?.draft,record?.material].some(value=>value && isPanorama(value)) ? 8*1024*1024 : MAX_LENGTH;
const key=owner=>PREFIX+encodeURIComponent(owner.trim().toLowerCase());
const validReport=report=>report && typeof report==='object' && !Array.isArray(report)
  && isReportDocument(report)
  && typeof report.title==='string' && report.title.length<=140
  && Array.isArray(report.sections) && report.sections.length<=20
  && report.sections.every(section=>typeof section?.text==='string' && section.text.length<=8000)
  && ['metrics','tables','visuals','sources','sourceLinks','watchlist','takeaways'].every(field=>Array.isArray(report[field]))
  && report.metrics.every(item=>item && typeof item==='object')
  && ['sources','watchlist','takeaways'].every(field=>report[field].every(item=>typeof item==='string'))
  && report.sourceLinks.every(item=>item && typeof item.label==='string' && typeof item.url==='string')
  && report.tables.every(table=>Array.isArray(table?.columns) && Array.isArray(table.rows) && table.rows.every(Array.isArray))
  && report.visuals.every(visual=>visual && typeof visual==='object' && (visual.bars==null || Array.isArray(visual.bars)) && (visual.series==null || Array.isArray(visual.series) && visual.series.every(series=>Array.isArray(series?.points))))
  && (!report.baseReport || REPORT_COLLECTIONS[report.baseReport.collection]?.reportKeys?.includes(report.baseReport.key));
const validPreferences=pref=>pref && typeof pref==='object' && !Array.isArray(pref)
  && ['general','finance','purchasing','operations','commercial'].includes(pref.audience)
  && ['standard','brief','detailed'].includes(pref.depth) && ['current','month','quarter','year'].includes(pref.decisionHorizon)
  && ['internal','confidential','shareable'].includes(pref.confidentiality)
  && ['customTitle','recipientName','organization','objective'].every(field=>typeof pref[field]==='string')
  && ['indicators','charts','tables','risks','sources'].every(field=>typeof pref.sections?.[field]==='boolean');
const validUndo=undo=>!undo || validReport(undo.draft) && validReport(undo.material) && validPreferences(undo.preferences)
  && typeof undo.instructions==='string' && undo.instructions.length<=4000 && ['professional','simple','technical'].includes(undo.tone)
  && Array.isArray(undo.overrides) && undo.overrides.every(field=>CREATION_FIELDS.includes(field));

export function validReportDraft(record,owner) {
  return record?.version===1 && record.owner===owner.trim().toLowerCase() && ID.test(record.creationId)
    && validReport(record.report) && validReport(record.material)
    && typeof record.instructions==='string' && record.instructions.length<=4000
    && ['professional','simple','technical'].includes(record.tone)
    && validPreferences(record.preferences)
    && validUndo(record.undo)
    && Array.isArray(record.overrides) && record.overrides.length<=CREATION_FIELDS.length && new Set(record.overrides).size===record.overrides.length && record.overrides.every(field=>CREATION_FIELDS.includes(field))
    && (!record.saveIntent || record.saveIntent.creationId===record.creationId && validReport(record.saveIntent.report));
}

export function readReportDraft(storage,owner) {
  if(!storage || !owner) return {status:'unavailable',record:null};
  try {
    const raw=storage.getItem(key(owner));
    if(!raw) return {status:'empty',record:null};
    let record;
    try {record=raw.length<=8*1024*1024 ? JSON.parse(raw) : null;} catch {storage.removeItem(key(owner));return {status:'invalid',record:null};}
    if(raw.length>maximum(record)){storage.removeItem(key(owner));return {status:'invalid',record:null};}
    if(!validReportDraft(record,owner)) {storage.removeItem(key(owner));return {status:'invalid',record:null};}
    return {status:'saved',record};
  } catch {return {status:'unavailable',record:null};}
}

export function writeReportDraft(storage,owner,record) {
  if(!storage || !owner) return false;
  try {
    const data={...record,version:1,owner:owner.trim().toLowerCase()},raw=JSON.stringify(data);
    if(raw.length>maximum(data) || !validReportDraft(data,owner)) return false;
    storage.setItem(key(owner),raw);return true;
  } catch {return false;}
}

export function discardReportDraft(storage,owner) {
  try {storage?.removeItem(key(owner));} catch { /* Se puede seguir usando el borrador en memoria. */ }
}
