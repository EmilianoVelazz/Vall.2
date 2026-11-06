export function finiteReportNumber(value) {
  if (value == null || typeof value === 'boolean' || typeof value==='string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function reportLineSeries(visual) {
  const series = (visual.series || []).map(item => {
    const byTime=new Map(),conflicts=new Set();
    for(const point of item.points || []) {
      const value=finiteReportNumber(point.value),timestamp=Date.parse(point.date);
      if(value===null || !Number.isFinite(timestamp)) continue;
      if(/^\d{4}-\d{2}-\d{2}$/.test(point.date) && new Date(timestamp).toISOString().slice(0,10)!==point.date) continue;
      if(byTime.has(timestamp) && byTime.get(timestamp).value!==value) conflicts.add(timestamp);
      byTime.set(timestamp,{...point,value,timestamp});
    }
    return {...item,points:[...byTime.values()].filter(point=>!conflicts.has(point.timestamp)).sort((a,b)=>a.timestamp-b.timestamp)};
  }).filter(item=>visual.fxOverview || item.points.length>1 || visual.dailyComparison && item.points.length===1);
  const dates = [...new Set(visual.dailyComparison && visual.dailyDates?.length===2 ? visual.dailyDates.map(Date.parse).filter(Number.isFinite) : series.flatMap(item => item.points.map(point => point.timestamp)))].sort((a, b) => a - b);
  return { series, dates };
}
export function reportBarData(visual) {
  const bars=(visual.bars || []).map(item=>({...item,value:finiteReportNumber(item.value)})).filter(item=>visual.dailyComparison || item.value!==null);
  return {bars,max:Math.max(...bars.map(item=>Math.abs(item.value)),0) || 1,signed:visual.fxOverview || bars.some(item=>item.value<0)};
}

export function reportSeriesResults(series, unit) {
  return series.map(item => {
    const first=item.points[0],last=item.points.at(-1),delta=last.value-first.value;
    const change=unit==='%' ? delta : first.value>0 ? delta/first.value*100 : null;
    return {...item,first,last,minimum:Math.min(...item.points.map(point=>point.value)),maximum:Math.max(...item.points.map(point=>point.value)),change,changeUnit:unit==='%' ? 'p. p.' : '%'};
  });
}
