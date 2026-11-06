// Shared by the browser and PDF. Geometry never alters the observations.
export {reportLinePanels,chartLegendLabels,chartReadingIsTabulated} from './report-chart-density.mjs';
const finite=value=>typeof value==='number' && Number.isFinite(value);
export const SERIES_DASHES=['','6 3','2 3','8 3 2 3','10 4','4 2','1 3','6 2 1 2','9 2 3 2'];
// Reuse a color only after assigning its next dash pattern. This distinguishes
// large comparisons without changing their observations or adding bright hues.
export function chartSeriesDash(index,paletteSize=6,extended=false) {
  const ordinal=Math.max(0,Math.floor(index) || 0),colors=Math.max(1,Math.floor(paletteSize) || 1);
  return SERIES_DASHES[(extended ? Math.floor(ordinal/colors) : ordinal)%SERIES_DASHES.length];
}
// A position is an upward fraction of the axis, like (value-min)/(max-min)
// on a linear scale. Consumers retain raw values for labels and tooltips.
export function chartLogScale(values,{ticks=5}={}) {
  const valid=values.filter(value=>finite(value) && value>0),target=Math.max(3,Math.min(11,Math.floor(ticks) || 5));
  const lower=valid.length ? Math.min(...valid) : 1,upper=valid.length ? Math.max(...valid) : 10;
  const first=Math.log10(lower),last=Math.log10(upper),range=last-first || .04;
  let logMin=Math.max(Math.log10(Number.MIN_VALUE),first-range*.08),logMax=Math.min(Math.log10(Number.MAX_VALUE),last+range*.08);
  let min=Math.max(Number.MIN_VALUE,10**logMin),max=Math.min(Number.MAX_VALUE,10**logMax);
  const pUpper=10**Math.floor(last);
  const niceUpper=[1,2,5,10].find(f=>f*pUpper>=upper)*pUpper;
  if(niceUpper && Math.log10(niceUpper)>logMax && Math.log10(niceUpper)-last<range*.25){logMax=Math.log10(niceUpper);max=niceUpper;}
  const pLower=10**Math.floor(first);
  const niceLower=[10,5,2,1].find(f=>f*pLower<=lower)*pLower;
  if(niceLower && Math.log10(niceLower)<logMin && first-Math.log10(niceLower)<range*.25){logMin=Math.log10(niceLower);min=niceLower;}
  if(min===max){if(max<Number.MAX_VALUE/2){max*=2;logMax=Math.log10(max);}else{min/=2;logMin=Math.log10(min);}}
  const span=logMax-logMin;
  let marks=[];
  for(let power=Math.floor(logMin);power<=Math.ceil(logMax);power++)for(const factor of [1,2,5]){
    const value=factor*10**power;
    if(finite(value) && value>=min && value<=max)marks.push(value);
  }
  if(marks.length<3)marks=Array.from({length:target},(_,index)=>10**(logMin+span*index/(target-1))).filter(finite);
  if(marks.length>11)marks=Array.from({length:11},(_,index)=>marks[Math.round(index*(marks.length-1)/10)]);
  return {min,max,ticks:[...new Set(marks)],position:value=>finite(value) && value>0 ? (Math.log10(value)-logMin)/span : NaN};
}
export function chartScale(values,{zero=false,symmetric=false,ticks=5}={}) {
  const valid=values.filter(finite);
  let min=valid.length ? Math.min(...valid) : zero || symmetric ? 0 : 99,max=valid.length ? Math.max(...valid) : zero || symmetric ? 1 : 101;
  if(zero) {min=Math.min(0,min);max=Math.max(0,max);}
  if(symmetric) {const bound=Math.max(Math.abs(min),Math.abs(max)) || 1;min=-bound;max=bound;}
  const range=max-min;
  if(!zero && !symmetric) {const gap=range>Math.max(Math.abs(min),Math.abs(max),1)*Number.EPSILON*32 ? range : Math.max(Math.abs(max)*.02,1);min-=gap*.12;max+=gap*.12;}
  if(min===max) max=min+1;
  const rawStep=(max-min)/Math.max(2,ticks-1),power=10**Math.floor(Math.log10(rawStep));
  if(!finite(rawStep) || !finite(power) || power===0) return {min,max,step:range,ticks:[min,max]};
  const step=[1,2,2.5,5,10].find(factor=>factor*power>=rawStep*(1-1e-12))*power;
  const clean=value=>Number(value.toPrecision(13));
  min=clean(Math.floor(Number((min/step).toPrecision(12)))*step);max=clean(Math.ceil(Number((max/step).toPrecision(12)))*step);
  const count=Math.min(12,Math.round((max-min)/step));
  return {min,max,step,ticks:Array.from({length:count+1},(_,i)=>clean(min+i*step))};
}
export function spreadChartLabels(labels,top,bottom,gap=17) {
  if(!labels.length) return [];
  const sorted=labels.map(item=>({...item,y:Math.max(top,Math.min(bottom,item.y))})).sort((a,b)=>a.y-b.y);
  const spacing=Math.min(gap,(bottom-top)/Math.max(1,sorted.length-1));
  for(let i=1;i<sorted.length;i++) sorted[i].y=Math.max(sorted[i].y,sorted[i-1].y+spacing);
  if(sorted.at(-1).y>bottom) {sorted.at(-1).y=bottom;for(let i=sorted.length-2;i>=0;i--) sorted[i].y=Math.min(sorted[i].y,sorted[i+1].y-spacing);}
  return sorted;
}
