// Annual production periods are not publication dates or observations of today's market.
export function structuralEvidence(report){
 if((report?.baseReport?.key || report?.key)!=='mx_production' || (report?.baseReport?.collection || report?.collection)!=='mexico')return {};
 const cutoff=Date.parse(report.generatedAt),year=Number.isFinite(cutoff) ? new Date(cutoff).getUTCFullYear() : 0;
 const text=(value,max)=>typeof value==='string' ? value.slice(0,max) : '';
 const references=(Array.isArray(report.structuralReferences) ? report.structuralReferences : []).slice(0,8).flatMap(item=>{
  if(!/^\d{4}$/.test(item?.period) || Number(item.period)>=year || !Number.isFinite(item.value) || item.value<0 || !item.label || !item.source)return [];
  let url;try{url=new URL(item.url);if(!['https:','http:'].includes(url.protocol) || url.username || url.password)return [];}catch{return [];}
  return [{label:text(item.label,140),period:item.period,value:item.value,unit:text(item.unit,80),source:text(item.source,240),url:url.href.slice(0,1800),cadence:'annual'}];
 });
 return references.length ? {structuralReferences:references} : {};
}
