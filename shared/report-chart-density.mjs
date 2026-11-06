// Presentation only. Never sample points, average markets or change bases.
export const REPORT_LINE_SERIES_LIMIT=4;
// Keep market/product identity in the legend; complete commercial qualifiers
// remain in tooltips, the chart's data table and the original evidence.
export function chartLegendLabels(series){
  const parts=series.map(item=>String(item.label || '').replace(/\s*·\s*ref\.\s*[a-f0-9]{16,64}\b/gu,'').trim().split(' · '));
  return parts.map((segments,index)=>{
    for(let length=2;length<segments.length;length++){
      const label=segments.slice(0,length).join(' · ');
      if(!parts.some((other,ordinal)=>ordinal!==index && other.slice(0,length).join(' · ')===label))return label;
    }
    return segments.join(' · ');
  });
}
export function chartReadingIsTabulated(visual){
  const entries=visual.type==='bar' ? visual.bars || [] : visual.series || [];
  return Boolean(visual.dataInTables && !visual.globalComparison && entries.length && /\d/.test(visual.reading || '') && entries.every(item=>item.label && visual.reading.includes(item.label)));
}
export function reportLinePanels(visual,{limit=REPORT_LINE_SERIES_LIMIT}={}){
  const series=Array.isArray(visual?.series) ? visual.series : [];
  const maximum=Math.max(1,Math.min(REPORT_LINE_SERIES_LIMIT,Math.floor(limit) || REPORT_LINE_SERIES_LIMIT));
  if(visual?.type==='bar' || visual?.yieldCurve || visual?.unifiedHistory || series.length<=maximum)return [visual];
  const anchored=Boolean(visual.equityComparison && !visual.globalComparison && maximum>1),items=anchored ? series.slice(1) : series;
  const count=Math.ceil(items.length/(maximum-Number(anchored))),base=Math.floor(items.length/count),remainder=items.length%count;
  let offset=0;
  return Array.from({length:count},(_,index)=>{
    const size=base+Number(index<remainder),start=offset;offset+=size;
    const ordinals=Array.from({length:size},(_,ordinal)=>start+ordinal+Number(anchored));
    if(anchored)ordinals.unshift(0);
    return {...visual,title:visual.title+' · '+(index+1)+'/'+count,series:ordinals.map(ordinal=>series[ordinal]),seriesOrdinals:ordinals.map(ordinal=>visual.seriesOrdinals?.[ordinal] ?? (visual.seriesOffset || 0)+ordinal),densityPanel:true,panelIndex:index,panelCount:count,seriesOffset:(visual.seriesOffset || 0)+start};
  });
}
