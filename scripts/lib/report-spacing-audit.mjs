// Geometry only: card/plot interiors count as content. Page margins and the
// unoccupied end of a column are reported separately from bounded holes.
export function columnSpacing(boxes,{width,height,top=65,bottom=height-78,margin=36}={}) {
 const columns=[.25,.75].map((fraction,index)=>{
  const x=margin+(width-2*margin)*fraction;
  const left=margin+(width-2*margin)*index/2,right=margin+(width-2*margin)*(index+1)/2;
  // Scan column bands rather than a single vertical ray: a ray can pass
  // through the gutter between two KPI cards and miss an occupied row.
  const intervals=boxes.filter(box=>Math.min(box.x+box.width,right)-Math.max(box.x,left)>1 && box.y<bottom && box.y+box.height>top)
   .map(box=>[Math.max(top,box.y),Math.min(bottom,box.y+box.height)]).sort((a,b)=>a[0]-b[0]);
  const merged=[];
  for(const interval of intervals){const last=merged.at(-1);if(last && interval[0]<=last[1]+.1)last[1]=Math.max(last[1],interval[1]);else merged.push([...interval]);}
  const gaps=merged.slice(1).map((interval,index)=>({top:merged[index][1],bottom:interval[0],height:interval[0]-merged[index][1]}));
  return {x,gaps,leading:merged.length ? merged[0][0]-top : bottom-top,trailing:merged.length ? bottom-merged.at(-1)[1] : bottom-top,used:merged.reduce((sum,interval)=>sum+interval[1]-interval[0],0)};
 });
 return {columns,maxInteriorGap:Math.max(0,...columns.flatMap(column=>column.gaps.map(gap=>gap.height)))};
}
