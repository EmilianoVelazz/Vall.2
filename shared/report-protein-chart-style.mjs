import {chartLegendLabels} from './report-chart-density.mjs';

export function proteinLegendLabels(series){
 const short=series.map(item=>String(item.label).split(' · ')[0]);
 const full=chartLegendLabels(series);
 return short.map((label,index)=>short.filter(other=>other===label).length===1 ? label : full[index]);
}

// Axis marks are calendar guides, never additional price observations.
export function proteinChartTicks(first,last,width){
 const span=last-first;if(!(span>0))return [first];
 if(span<540*86400000)return [first,first+span/2,last];
 const start=new Date(first).getUTCFullYear(),end=new Date(last).getUTCFullYear();
 const step=Math.max(1,Math.ceil((end-start)/(width>=600 ? 6 : 3)));
 const years=Array.from({length:Math.max(0,end-start)},(_,index)=>Date.UTC(start+index+1,0,1))
  .filter(date=>new Date(date).getUTCFullYear()<end && (new Date(date).getUTCFullYear()-start)%step===0 && date-first>span*.09 && last-date>span*.09);
 return [first,...years,last];
}

export function proteinBarColor(visual,bar){
 if(!visual.proteinChart || !visual.proteinHistorical || visual.commodityWindow!=='years')return null;
 const years=visual.bars.map(item=>Number(item.label)).filter(Number.isFinite);
 if(!years.length)return null;
 return Number(bar.label)===Math.max(...years) ? '#668399' : '#B5C2CD';
}
