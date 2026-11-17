'use strict';
const {createHash}=require('node:crypto');
const text=(value,limit)=>String(value ?? '').replace(/```[\s\S]*?```/g,'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,limit);
const list=(value,count,limit)=>Array.isArray(value)?value.map(item=>text(item,limit)).filter(Boolean).slice(0,count):[];
// The same bounded evidence is used for generation and freshness checks.
function editorialFacts(report){return {
 key:report.key,title:text(report.title,100),objective:text(report.objective,700),summary:text(report.summary,900),generatedAt:report.generatedAt,
 sections:(report.sections || []).slice(0,20).map(item=>({heading:text(item.heading,140),text:text(item.text,8000)})),
 metrics:(report.metrics || []).slice(0,30).map(item=>({label:text(item?.label,80),value:text(item?.value,80),change:text(item?.change,80)})),
 conclusions:list(report.takeaways,4,340),watchlist:list(report.watchlist,3,340),
 headlines:(report.headlines || []).slice(0,5).map(item=>({title:text(item?.title,240),source:text(item?.source,100),description:text(item?.description,360)})),
 sources:list(report.sources,8,180),
 tables:(report.tables || []).slice(0,6).map(table=>({kind:table.kind==='guide'?'guide':'data',title:text(table.title,140),note:text(table.note,800),columns:(table.columns || []).slice(0,12),rows:(table.rows || []).slice(0,100)})),
 sourceLinks:(report.sourceLinks || []).slice(0,40),
};}
const editorialFingerprint=facts=>createHash('sha256').update(JSON.stringify(facts)).digest('hex');
module.exports={editorialFacts,editorialFingerprint};
