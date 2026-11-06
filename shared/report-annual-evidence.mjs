const finite=value=>typeof value==='number' && Number.isFinite(value);
export function annualEvidence(report){
 if(report.periodType!=='annual' || !Number.isInteger(report.reportYear) || !Array.isArray(report.annualReferences))return {};
 const year=report.reportYear,text=(value,max=240)=>String(value ?? '').slice(0,max),url=value=>{try{const link=new URL(value);return ['http:','https:'].includes(link.protocol) && !link.username && !link.password ? link.href.slice(0,1800) : '';}catch{return '';}};
 const list=value=>Array.isArray(value) ? value : [],record=value=>value && typeof value==='object' && !Array.isArray(value);
 const point=(value,previous=false)=>record(value) && /^\d{4}-\d{2}-\d{2}$/.test(value.date) && finite(value.value) && Number.isFinite(Date.parse(value.date)) && new Date(value.date).toISOString().slice(0,10)===value.date && (previous ? value.date.startsWith((year-1)+'-12-') : value.date.startsWith(year+'-')) ? {date:value.date,value:value.value} : null;
 const references=report.annualReferences.slice(0,192).filter(record).map(item=>({id:text(item.id,100),label:text(item.label),unit:text(item.unit,80),kind:text(item.kind,24),market:text(item.market),region:text(item.region,40),cadence:text(item.cadence,16),source:text(item.source),url:url(item.url),points:list(item.points).slice(0,12).map(value=>point(value)).filter(Boolean),prior:point(item.prior,true),last:point(item.last),...Object.fromEntries(['change','mean','minimum','maximum','months','observationCount','annualValue'].flatMap(key=>finite(item[key]) ? [[key,item[key]]] : [])),status:text(item.status,32)}));
 const production=list(report.annualProduction).slice(0,32).filter(record).map(item=>({state:text(item.state,80),...Object.fromEntries(['corn','wheat','sorghum','soy'].map(key=>[key,finite(item[key]) ? item[key] : null]))}));
 return {annualEvidenceVersion:1,annualReferences:references,...(production.length ? {annualProduction:production} : {})};
}
