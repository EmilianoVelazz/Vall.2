import {weeklyReport} from '../../../shared/report-weekly.mjs';
import {sessionNews} from '../../../shared/report-session-evidence.mjs';

export function reportChangeSnapshot(report){
 const model=weeklyReport(report),quotes=(model.references || []).filter(item=>Number.isFinite(item.last?.value)).map(item=>({
  id:JSON.stringify([item.id || item.symbol || item.label,item.unit,item.market || item.country,item.currency,item.basis]),
  label:item.displayLabel || item.label,unit:item.unit || '',value:item.last.value,date:item.last.date,
  history:JSON.stringify((item.points || []).map(point=>[point.date,point.value])),status:item.quoteStatus || '',
 }));
 const rows=quotes.length ? [] : (model.results || []).flatMap(table=>{const seen=new Map();return (table.rows || []).map(row=>{const key=String(row[0]),ordinal=seen.get(key) || 0;seen.set(key,ordinal+1);return {id:JSON.stringify([table.title,key,ordinal]),label:key,table:table.title,value:JSON.stringify(row)};});});
 const news=sessionNews(report).map(item=>({id:JSON.stringify([item.title,item.publishedAt,item.source]),label:item.title}));
 const snapshot={key:[report.collection || report.baseReport?.collection,report.key || report.baseReport?.key,report.periodType || '',report.reportYear || '',report.analysisPeriod || 'daily'].join('/'),cut:report.generatedAt,quotes,rows,news};
 return {...snapshot,signature:JSON.stringify(snapshot)};
}

export function compareReportSnapshots(previous,next){
 if(!previous || previous.key!==next.key)return null;
 const items=[],old=new Map(previous.quotes.map(item=>[item.id,item]));
 for(const quote of next.quotes){
  const prior=old.get(quote.id);old.delete(quote.id);
  if(!prior)items.push({kind:'publication',label:quote.label,after:quote.value,unit:quote.unit,date:quote.date});
  else if(quote.value!==prior.value || quote.date!==prior.date || quote.history!==prior.history || quote.status!==prior.status)items.push({kind:quote.date<=prior.date ? 'correction' : quote.value===prior.value ? 'publication' : 'movement',label:quote.label,before:prior.value,after:quote.value,unit:quote.unit,date:quote.date,previousDate:prior.date,historyOnly:quote.value===prior.value && quote.date===prior.date});
 }
 for(const quote of old.values())items.push({kind:'unavailable',label:quote.label,before:quote.value,unit:quote.unit,date:quote.date});
 const priorRows=new Map(previous.rows.map(item=>[item.id,item]));
 for(const row of next.rows){const before=priorRows.get(row.id);priorRows.delete(row.id);if(before?.value!==row.value)items.push({kind:before ? 'correction' : 'publication',label:row.label,detail:row.table,beforeText:before ? JSON.parse(before.value).slice(1).join(' · ') : '',afterText:JSON.parse(row.value).slice(1).join(' · ')});}
 for(const row of priorRows.values())items.push({kind:'unavailable',label:row.label,detail:row.table,beforeText:JSON.parse(row.value).slice(1).join(' · ')});
 const priorNews=new Set(previous.news.map(item=>item.id));
 for(const item of next.news)if(!priorNews.has(item.id))items.push({kind:'news',label:item.label});
 return {from:previous.cut,to:next.cut,items};
}
