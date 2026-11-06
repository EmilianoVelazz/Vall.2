import COLORS from './report-chart-colors.json' with {type:'json'};
import {chartLogScale,chartSeriesDash} from './report-chart-geometry.mjs';

// One plane, retaining every observation, base date and index methodology.
export function equityHistoryChart(visual){
  const series=(visual?.series || []).map(item=>({...item,points:(item.points || []).filter(point=>Number.isFinite(point.value) && point.value>0 && /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(Date.parse(point.date))).slice().sort((a,b)=>a.date.localeCompare(b.date))})).filter(item=>item.points.length>=2).map((item,index)=>({...item,ordinal:index+1,color:COLORS[index%COLORS.length],dash:chartSeriesDash(index,COLORS.length,true)}));
  if(!series.length)return null;
  const times=series.flatMap(item=>item.points.map(point=>Date.parse(point.date))),first=Math.min(...times),last=Math.max(...times),scale=chartLogScale(series.flatMap(item=>item.points.map(point=>point.value))),years=[];
  for(let year=new Date(first).getUTCFullYear();year<=new Date(last).getUTCFullYear();year++)years.push({label:String(year),time:Math.max(first,Date.UTC(year,0,1))});
  return {series,first,last,scale,years,x:date=>(Date.parse(date)-first)/(last-first || 1),y:value=>1-scale.position(value)};
}
