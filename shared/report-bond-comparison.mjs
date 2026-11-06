import {bondMonthlyHistory} from './report-bond-history.mjs';
import {bondPublishedMonths} from './report-bond-international.mjs';
const history=(visual,points)=>visual.monthly ? bondPublishedMonths(points,visual.rangeEnd) : bondMonthlyHistory(points,visual.rangeEnd);

// All transformations use published observations. A common base is an exact
// observed date in every series, never a forward-filled or interpolated level.
export function bondChangeComparison(visual){
  if(!['%','pb'].includes(visual.unit))return null;
  const series=(visual.series || []).map(item=>({...item,points:history(visual,item.points)}));
  if(!series.length || series.some(item=>!item.points.length))return null;
  const dates=series.map(item=>new Set(item.points.map(point=>point.date)));
  const common=series[0].points.filter(point=>dates.every(set=>set.has(point.date)));
  if(common.length<2)return null;
  const baseDate=common[0].date,lastDate=common.at(-1).date,factor=visual.unit==='%' ? 100 : 1;
  return {...visual,unit:'pb',bondChange:true,baseDate,rangeStart:visual.monthly ? baseDate+'-01' : baseDate,rangeEnd:visual.monthly ? new Date(Date.UTC(Number(lastDate.slice(0,4)),Number(lastDate.slice(5,7)),0)).toISOString().slice(0,10) : lastDate,
    series:series.map(item=>{const base=item.points.find(point=>point.date===baseDate).value;return {...item,base,baseDate,points:item.points.filter(point=>point.date>=baseDate && point.date<=lastDate).map(point=>({...point,value:(point.value-base)*factor}))};}),
    note:(visual.monthly ? 'Cambio absoluto desde un mismo mes publicado: '+baseDate+'. Último mes común: ' : 'Cambio absoluto desde una misma fecha observada: '+baseDate+'. Último cierre común: ')+lastDate+'. Cero es el nivel de partida. Las tasas porcentuales se convierten a puntos base (1 punto porcentual = 100 pb). No mide el retorno de una inversión. '+(visual.note || '')};
}

export function bondYearMonthGrid(visual,series){
  const cutoff=String(visual.rangeEnd || ''),end=Number(cutoff.slice(0,4));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(cutoff) || !Number.isInteger(end) || end<2020 || end>2100)return null;
  const points=history(visual,series?.points),byMonth=new Map(points.map(point=>[point.date.slice(0,7),point]));
  if(!points.length)return null;
  const values=points.map(point=>point.value),min=Math.min(...values),max=Math.max(...values);
  return {min,max,rows:Array.from({length:end-2019},(_,index)=>{
    const year=2020+index;
    return {year,cells:Array.from({length:12},(_,month)=>{
      const period=year+'-'+String(month+1).padStart(2,'0'),point=byMonth.get(period),future=period>cutoff.slice(0,7);
      return {period,future,partial:!visual.monthly && period===cutoff.slice(0,7),date:point?.date || null,value:point?.value ?? null,
        intensity:point ? max===min ? .5 : (point.value-min)/(max-min) : null};
    })};
  })};
}
