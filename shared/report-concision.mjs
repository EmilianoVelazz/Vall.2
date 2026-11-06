// Exact presentation duplicates only. Values, units, dates and source evidence
// remain untouched; similar wording or a different observation is not a duplicate.
const text=value=>String(value ?? '').normalize('NFC').replace(/\s+/g,' ').trim();
const cell=value=>typeof value+':'+text(value);
const list=value=>Array.isArray(value) ? value : [];
function unique(items,key){const seen=new Set();return items.filter(item=>{const id=key(item);if(seen.has(id))return false;seen.add(id);return true;});}
function notes(...values){return unique(values.flatMap(value=>String(value || '').split(/\n{2,}/)).filter(value=>text(value)),text).join('\n\n');}
export function uniqueTableNotes(tables){
  const seen=new Set();return list(tables).map(table=>{
    const methodologyNote=table.methodologyNote ?? table.note ?? '';
    const paragraphs=String(methodologyNote).split(/\n{2,}/).filter(value=>{const id=text(value);if(!id || seen.has(id))return false;seen.add(id);return true;});
    return {...table,methodologyNote,note:paragraphs.join('\n\n')};
  });
}
function compactTables(tables){
  const seen=new Map(),result=[];
  for(const item of list(tables)){
    const rows=unique(list(item.rows),row=>JSON.stringify(row.map(cell)));
    const columns=list(item.columns),names=columns.map(text),ordered=new Set(names).size===names.length ? names.map((name,index)=>({name,index})).sort((a,b)=>a.name.localeCompare(b.name)) : names.map((name,index)=>({name,index}));
    const key=JSON.stringify([item.kind || '',item.unit || '',item.period || '',item.source || '',item.url || '',item.cadence || '',item.market || '',ordered.map(item=>item.name),rows.map(row=>ordered.map(({index})=>cell(row[index]))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
    const prior=seen.get(key);
    if(prior){prior.note=notes(prior.note,item.note);continue;}
    const table={...item,rows};seen.set(key,table);result.push(table);
  }
  return uniqueTableNotes(result);
}
function compactPanels(panels,{preserveOpening=false}={}){
  const seen=new Set();return list(panels).map((panel,index)=>{
    const scope=JSON.stringify([panel.heading,panel.url,panel.link?.url,panel.source]),parts=String(panel.body || '').split(/\n{2,}/).filter(part=>{const key=scope+'|'+text(part);if(!text(part) || seen.has(key) && !(preserveOpening && index<2))return false;seen.add(key);return true;});
    return {...panel,body:parts.join('\n\n')};
  }).filter((panel,index)=>text(panel.body) || preserveOpening && index<2);
}
export function conciseReportModel(model){
  const results=compactTables(model.results),visuals=unique(list(model.visuals),visual=>JSON.stringify([visual.type,visual.unit,visual.period,visual.cadence,visual.source,visual.url,visual.market,visual.yieldCurve,visual.dailyComparison,visual.monthly,visual.series,visual.bars,visual.note,visual.reading]));
  const commentary=compactPanels(model.focusedMarket ? model.summaryPanels : model.commentary,{preserveOpening:!model.focusedMarket});
  const followup=unique(list(model.followup),text);
  const blocks=list(model.blocks).filter(block=>!(block.key==='comparisons' && !results.length) && !(block.key==='charts' && !visuals.length) && !(block.key==='sessionContext' && !commentary.slice(2).length && !followup.length)).map(block=>block.key==='charts' ? {...block,count:visuals.length} : block);
  return {...model,results,visuals,commentary,followup,blocks,...(model.focusedMarket ? {summaryPanels:commentary} : {})};
}
