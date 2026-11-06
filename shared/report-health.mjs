import {sessionEvidence,sessionNews} from './report-session-evidence.mjs';
const DAY=86400000;
const validDate=value=>typeof value==='string' && Number.isFinite(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}/.test(value) && new Date(Date.parse(value.slice(0,10))).toISOString().slice(0,10)===value.slice(0,10);
const monthlyDate=value=>typeof value==='string' && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value);
const observedTime=(value,cadence)=>cadence==='monthly' && monthlyDate(value) ? Date.UTC(Number(value.slice(0,4)),Number(value.slice(5,7)),0,23,59,59,999) : Date.parse(value);
const businessDays=(from,to)=>{
  const first=Date.parse(from.slice(0,10)),last=Date.parse(new Date(to).toISOString().slice(0,10));
  if(last-first>7*DAY)return 6;
  let days=0;for(let date=first+DAY;date<=last;date+=DAY)if(![0,6].includes(new Date(date).getUTCDay()))days++;
  return days;
};
export function reportHealth(report,now=Date.now()){
  const generated=Date.parse(report?.generatedAt),cutoff=Number.isFinite(generated) ? Math.min(now,generated) : now;
  const grouped=new Map();
  for(const item of [...sessionEvidence(report || {}),...(report?.equityObservations || []),...(report?.bondObservations || []),...(report?.dailyReferences || []),...(report?.annualReferences || [])]){
    const key=[item.id || item.label,item.unit,item.market].join('|'),prior=grouped.get(key);
    grouped.set(key,prior ? {...item,...prior,cadence:prior.cadence || item.cadence,points:[...(prior.points || []),...(item.points || []),...(item.last ? [item.last] : [])]} : {...item,points:[...(item.points || []),...(item.last ? [item.last] : [])]});
  }
  const quotes=[...grouped.values()],available=quotes.flatMap(item=>{
    const points=item.points.filter(point=>Number.isFinite(point.value)&&(validDate(point.date)||item.cadence==='monthly' && monthlyDate(point.date))&&observedTime(point.date,item.cadence)<=cutoff).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
    return points.length ? [{...item,last:points.at(-1)}] : [];
  });
  const news=sessionNews(report || {}).filter(item=>item.title && validDate(item.publishedAt) && Date.parse(item.publishedAt)<=cutoff);
  const dates=[...available.map(item=>item.last.date),...news.map(item=>item.publishedAt)].sort((a,b)=>Date.parse(a)-Date.parse(b));
  const tablePrice=(report?.tables || []).some(table=>table.rows?.some(row=>row.some(cell=>/\d[\d.,]*\s+(?:MXN|USD|EUR|BRL|PEN|CAD)\//.test(String(cell)))));
  const context=report?.periodType==='annual'||['mx_production','mx_overview'].includes(report?.baseReport?.key || report?.key);
  const data=available.length>0 || news.length>0 || tablePrice || (!quotes.length || context) && ((report?.metrics || []).some(item=>/\d/.test(String(item.value))) || (report?.tables || []).some(table=>table.rows?.some(row=>row.some(cell=>typeof cell==='number'||/\d/.test(String(cell))))));
  const retained=available.filter(item=>item.quoteStatus==='preserved').length;
  const fresh=item=>item.cadence==='annual' ? now-Date.parse(item.last.date)<=370*DAY : item.cadence==='monthly' ? now-observedTime(item.last.date,item.cadence)<=45*DAY : ['weekly','auction'].includes(item.cadence) ? now-Date.parse(item.last.date)<=10*DAY : businessDays(item.last.date,now)<=1;
  const recent=available.filter(fresh).length+news.filter(item=>businessDays(item.publishedAt,now)<=1).length,total=available.length+news.length;
  const state=!data?'empty':report?.periodType==='annual'?'historical':report?.dataStatus?.state==='preserved'?'preserved':!dates.length?'undated':!recent?'stale':report?.dataStatus?.state==='partial'||retained||recent<total||quotes.length>available.length?'partial':'updated';
  return {state,label:({empty:'Sin datos',preserved:'Conservado',partial:'Parcial',updated:'Actualizado',stale:'Desactualizado',historical:'Histórico',undated:'Sin fecha'})[state],asOf:dates.at(-1)?.slice(0,10) || '',generatedAt:report?.generatedAt || ''};
}
