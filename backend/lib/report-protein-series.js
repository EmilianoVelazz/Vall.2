'use strict';
const {dailyPoints}=require('./report-observations');

function matchingProteinSeries(item,previous){
 return previous && previous.evidenceOrigin!=='catalog' && ['verified','preserved'].includes(previous.quoteStatus) && ['ticker','provider','unit','cadence','market','basis'].every(key=>(item[key] || '')===(previous[key] || ''));
}

function mergeProteinSeries(item,points,previous,cutoff){
 const fresh=dailyPoints(points,cutoff).filter(point=>point.value>0);
 if(!fresh.length)throw Error('Sin observaciones nuevas fechadas verificables.');
 const prior=matchingProteinSeries(item,previous) ? dailyPoints(previous.series,cutoff).filter(point=>point.value>0) : [];
 // A newly validated publication may revise its own earlier prices. Conflicts
 // inside a single response are rejected by dailyPoints, never averaged.
 const merged=new Map(prior.map(point=>[point.date,point]));fresh.forEach(point=>merged.set(point.date,point));
 let series=[...merged.values()].sort((a,b)=>a.date.localeCompare(b.date));
 if(series.length>4000){
  const recent=series.slice(-3000),start=recent[0].date,months=new Map();
  for(const point of series)if(point.date<start)months.set(point.date.slice(0,7),point);
  series=[series[0],...[...months.values()].slice(-999),...recent].filter((point,index,all)=>!index || point.date!==all[index-1].date);
 }
 const last=series.at(-1),validatedLatest=fresh.some(point=>point.date===last.date && point.value===last.value);
 return {series,validatedLatest};
}
module.exports={matchingProteinSeries,mergeProteinSeries};
