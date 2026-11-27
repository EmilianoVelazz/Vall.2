'use strict';
const {createHash}=require('node:crypto');
const text=(value,limit)=>String(value ?? '').replace(/```[\s\S]*?```/g,'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,limit);
const list=(value,count,limit)=>Array.isArray(value)?value.map(item=>text(item,limit)).filter(Boolean).slice(0,count):[];
function safeUrl(value) {
 try { const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href.slice(0,1800):''; }
 catch { return ''; }
}
function observedDate(value) {
 const raw=String(value||'').trim();
 const day=raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
 if(day&&Number.isFinite(Date.parse(day))&&new Date(`${day}T00:00:00Z`).toISOString().slice(0,10)===day)return day;
 return /^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(raw)?raw:'';
}
function editorialEvidence(report={}) {
 const records=[];
 const add=(id,label,excerpt,{date='',unit='',source='',url=''}={})=>{
  const cleanExcerpt=text(excerpt,1200);
  if(cleanExcerpt)records.push({id,label:text(label,180)||id,excerpt:cleanExcerpt,date:observedDate(date),unit:text(unit,60),source:text(source,180),url:safeUrl(url)});
 };
 (report.metrics||[]).slice(0,30).forEach((item,index)=>add(`metric-${index+1}`,item?.label,`${item?.label||''}: ${item?.value||''}${item?.change ? ` · ${item.change}` : ''}`,{
  date:item?.observedAt||item?.date||item?.period,unit:item?.unit,source:item?.source,url:item?.url,
 }));
 (report.sections||[]).slice(0,20).forEach((item,index)=>{
  const urls=[...String(item?.text||'').matchAll(/\]\((https?:\/\/[^\s)]+)\)/g)].map(match=>safeUrl(match[1])).filter(Boolean);
  add(`section-${index+1}`,item?.heading,item?.text,{date:item?.observedAt||item?.date,source:item?.source,url:urls.length===1?urls[0]:item?.url});
 });
 (report.tables||[]).slice(0,6).forEach((table,tableIndex)=>{
  (table.rows||[]).slice(0,30).forEach((row,rowIndex)=>{
   const cells=Array.isArray(row)?row:[];
   const excerpt=(Array.isArray(table.columns)?table.columns:[]).map((column,index)=>`${column}: ${cells[index]??''}`).join(' · ');
   const urls=cells.flatMap(cell=>[...String(cell).matchAll(/https?:\/\/[^\s)]+/g)].map(match=>safeUrl(match[0]))).filter(Boolean);
   const date=String(excerpt).match(/\b\d{4}(?:-\d{2}(?:-\d{2})?)?\b/)?.[0]||'';
   const unit=(table.columns||[]).find(column=>/unidad|unit/i.test(column)) ? cells[(table.columns||[]).findIndex(column=>/unidad|unit/i.test(column))] : '';
   add(`table-${tableIndex+1}-row-${rowIndex+1}`,`${table.title||'Tabla'} · fila ${rowIndex+1}`,excerpt,{date,unit,source:table.source,url:urls.length===1?urls[0]:''});
  });
 });
 (report.sessionNews||report.headlines||[]).slice(0,12).forEach((item,index)=>add(`news-${index+1}`,item?.title,`${item?.title||''}${item?.description?` · ${item.description}`:''}`,{
  date:item?.publishedAt||item?.date,source:item?.source,url:item?.url,
 }));
 (report.sourceLinks||[]).slice(0,40).forEach((item,index)=>add(`source-${index+1}`,item?.label,item?.description||item?.label,{
  date:item?.publishedAt||item?.date||item?.asOf,unit:item?.unit,source:item?.source||item?.label,url:item?.url,
 }));
 (report.dailyReferences||[]).slice(0,40).forEach((item,index)=>{
  const points=(item.points||item.series||[]).filter(point=>Number.isFinite(point?.value));
  const last=points.at(-1);
  add(`daily-${index+1}`,item.label,`${item.label||''}: ${last?.value??item.value??''}${item.unit?` ${item.unit}`:''}`,{
   date:last?.date||item.date,unit:item.unit,source:item.source,url:item.url,
  });
 });
 (report.structuralReferences||[]).slice(0,40).forEach((item,index)=>add(`structural-${index+1}`,item.label,`${item.label||''}: ${item.value??''}${item.unit?` ${item.unit}`:''}`,{
  date:item.period,unit:item.unit,source:item.source,url:item.url,
 }));
 return records.slice(0,120);
}
// The same bounded evidence is used for generation and freshness checks.
function editorialFacts(report){return {
 key:report.key,title:text(report.title,100),objective:text(report.objective,700),summary:text(report.summary,900),generatedAt:report.generatedAt,
 sections:(report.sections || []).slice(0,20).map(item=>({heading:text(item.heading,140),text:text(item.text,8000)})),
 metrics:(report.metrics || []).slice(0,30).map(item=>({label:text(item?.label,80),value:text(item?.value,80),change:text(item?.change,80)})),
 conclusions:list(report.takeaways,4,340),watchlist:list(report.watchlist,3,340),
 headlines:(report.sessionNews||report.headlines || []).slice(0,12).map(item=>({title:text(item?.title,240),source:text(item?.source,100),description:text(item?.description,360),publishedAt:text(item?.publishedAt||item?.date,40),url:safeUrl(item?.url)})),
 sources:list(report.sources,8,180),
 tables:(report.tables || []).slice(0,6).map(table=>({kind:table.kind==='guide'?'guide':'data',title:text(table.title,140),note:text(table.note,800),columns:(table.columns || []).slice(0,12),rows:(table.rows || []).slice(0,100)})),
 sourceLinks:(report.sourceLinks || []).slice(0,40),
 evidence:editorialEvidence(report),
};}
const editorialFingerprint=facts=>createHash('sha256').update(JSON.stringify(facts)).digest('hex');
module.exports={editorialFacts,editorialEvidence,editorialFingerprint};
