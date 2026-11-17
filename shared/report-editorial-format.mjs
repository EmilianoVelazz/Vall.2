const normalized=value=>String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[\s\W_]+/g,'').toLowerCase();
export function editorialModel(report,model,{t=value=>value}={}){
 const labels=t;t=value=>report.causeText?.[value] || labels(value);
 const annual=report.periodType==='annual',weekly=!annual && report.analysisPeriod==='weekly';
 const panels=items=>{const seen=new Set();return (items || []).filter(item=>{const key=normalized(item.body);if(!key || seen.has(key) || item.summaryKind==='coverage')return false;seen.add(key);return true;});};
 const results=(model.results || []).map(table=>{
  if(!table.derivatives || /20\d{2}-\d{2}/.test(table.title))return table;
  const indices=table.columns.flatMap((column,index)=>/fecha|date|periodo observado/i.test(column) ? [index] : []),dates=[...new Set(table.rows.flatMap(row=>indices.flatMap(index=>String(row[index] || '').match(/20\d{2}-\d{2}-\d{2}/g) || [])))].sort();
  return dates.length ? {...table,title:t(table.title+' · '+dates[0]+(dates.length>1 ? ' / '+dates.at(-1) : ''))} : table;
 });
 const visuals=(model.visuals || []).map(visual=>{
  if(visual.type==='bar' || visual.yieldCurve || visual.dailyComparison || !(visual.series?.length) || !visual.series.every(series=>series.points?.length===2))return visual;
  return {...visual,pointComparison:true,title:t('Comparación entre dos observaciones')+' · '+visual.title};
 });
 return {...model,results,visuals,...(model.summaryPanels ? {summaryPanels:panels(model.summaryPanels)} : {}),...(model.commentary ? {commentary:panels(model.commentary)} : {}),blocks:(model.blocks || []).map(block=>weekly && block.key==='session' ? {...block,label:t('Balance de la semana')} : block),editorialEdition:annual ? 'annual' : weekly ? 'weekly' : 'daily'};
}
