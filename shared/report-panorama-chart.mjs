import {chartScale} from './report-chart-geometry.mjs';

const tones={sp500:'#70805d',treasury10:'#71889b',sofr:'#8b8094',usdmxn:'#8c7854',vix:'#976f69',wti:'#b08b69',corn:'#8a915e',gas:'#71889b',gold:'#aa955a',pork:'#8a7c88','mexico-corn':'#7b8c77','mx-chicken':'#71889b','mx-egg':'#aa955a'};
export const panoramaTone=item=>tones[item.id] || '#71889b';
export const panoramaNumber=(value,locale='es-MX')=>value.toLocaleString(locale,{maximumFractionDigits:3});
export function panoramaSignalLayout(signals=[]){
 const charts=signals.filter(item=>panoramaChart(item)),levels=signals.filter(item=>!panoramaChart(item));
 return {charts,levels,wide:charts.length%2 ? charts.at(-1)?.id : null};
}
// A range is a view of published observations, never an interpolated series.
export function panoramaChart(item,{range='all',width=280,height=76}={}){
 const annual=item.kind==='structural',seen=new Set();
 let points=(item.points || []).filter(point=>Number.isFinite(point.value) && /^\d{4}(?:-\d{2}-\d{2})?$/.test(point.date) && Number.isFinite(Date.parse(point.date)) && point.date<=item.date).toSorted((a,b)=>a.date.localeCompare(b.date)).filter(point=>{if(seen.has(point.date))return false;seen.add(point.date);return true;});
 if(!annual && range!=='all' && points.length){const start=new Date(points.at(-1).date+'T00:00:00Z');if(range==='year')start.setUTCFullYear(start.getUTCFullYear()-1);else start.setUTCMonth(start.getUTCMonth()-6);points=points.filter(point=>point.date>=start.toISOString().slice(0,10));}
 if(points.length<3)return null;
 const scale=chartScale(points.map(point=>point.value),{zero:annual}),first=Date.parse(points[0].date),last=Date.parse(points.at(-1).date),step=width/points.length;
 const x=(point,index)=>annual ? step*(index+.5) : (Date.parse(point.date)-first)/(last-first || 1)*width,y=value=>height-(value-scale.min)/(scale.max-scale.min)*height;
 const nodes=points.map((point,index)=>({...point,x:x(point,index),y:y(point.value)})),path=nodes.map((point,index)=>(index ? 'L' : 'M')+point.x.toFixed(2)+','+point.y.toFixed(2)).join(' '),ticks=[scale.min,(scale.min+scale.max)/2,scale.max];
 const timeTicks=[];
 if(!annual && last-first>2*365*86400000){
  const count=Math.max(1,Math.floor(width/95)-1),step=Math.max(1,Math.ceil((Number(points.at(-1).date.slice(0,4))-Number(points[0].date.slice(0,4)))/(count+1)));
  for(let year=Number(points[0].date.slice(0,4))+step;year<=Number(points.at(-1).date.slice(0,4));year+=step){const position=(Date.parse(year+'-01-01')-first)/(last-first)*width;if(position>48 && position<width-48)timeTicks.push({x:position,label:String(year)});}
 }
 return {annual,points,nodes,scale,ticks,timeTicks,width,height,path,y,zero:y(0),barWidth:Math.min(24,step*.55),tone:panoramaTone(item),first:points[0].date,last:points.at(-1).date};
}
