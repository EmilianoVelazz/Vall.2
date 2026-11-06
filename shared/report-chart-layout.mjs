// A shared sentence is printed once beside the group, while each figure keeps
// its own values, dates and interpretation. The source model is never changed.
export function compactChartReadings(visuals=[]) {
  const key=text=>text.replace(/\s+/g,' ').trim();
  const split=value=>[...new Map(String(value || '').trim().split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜÑÀÂÄÇÈÊËÎÏÔÖÙÛŸ¿¡])/u).filter(Boolean).map(text=>[key(text),text])).values()];
  const sentences=visuals.map(visual=>split(visual.reading));
  const counts=new Map();
  for(const parts of sentences)for(const text of new Set(parts.map(key)))if(text.length>=30 && !/\d/.test(text))counts.set(text,(counts.get(text)||0)+1);
  const shared=new Set([...counts].filter(([,count])=>count>1).map(([text])=>text)),notes=[];
  for(const parts of sentences)for(const text of parts)if(shared.has(key(text)) && !notes.includes(key(text)))notes.push(key(text));
  return {notes,visuals:visuals.map((visual,index)=>{
    const displayed=new Set([...sentences[index].map(key),...notes.map(key)]);
    return {...visual,reading:sentences[index].filter(text=>!shared.has(key(text))).join(' '),note:split(visual.note).filter(text=>!displayed.has(key(text))).join(' ')};
  })};
}

// Contiguous groups retain the source order. Balance their measured heights,
// since a long reference may wrap to several lines while another uses one.
export function balancedChartRows(heights,maximumRows) {
  if(!heights.length)return [];
  const limit=Math.max(1,Math.floor(maximumRows)),count=Math.ceil(heights.length/limit),prefix=[0];
  for(const height of heights)prefix.push(prefix.at(-1)+height);
  const costs=Array.from({length:count+1},()=>Array(heights.length+1).fill(Infinity));
  const cuts=Array.from({length:count+1},()=>Array(heights.length+1));costs[0][0]=0;
  for(let group=1;group<=count;group++)for(let end=group;end<=Math.min(heights.length,group*limit);end++) {
    for(let start=Math.max(group-1,end-limit);start<end;start++) {
      const cost=Math.max(costs[group-1][start],prefix[end]-prefix[start]);
      if(cost<costs[group][end]){costs[group][end]=cost;cuts[group][end]=start;}
    }
  }
  const ranges=[];let end=heights.length;
  for(let group=count;group>0;group--){const start=cuts[group][end];ranges.unshift([start,end]);end=start;}
  return ranges;
}
