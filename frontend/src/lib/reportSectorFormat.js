import formats from '../../../shared/report-sector-formats.json' with { type: 'json' };
export function reportSectorFormat(report,collection) {
  const area=report?.baseReport?.collection || collection || report?.collection;
  const key=report?.baseReport?.key || report?.key;
  if(formats[area]?.[key]) return {collection:area,key,...formats[area][key]};
  if(area) return null;
  const matches=Object.entries(formats).filter(([,items])=>items[key]);
  return matches.length===1 ? {collection:matches[0][0],key,...matches[0][1][key]} : null;
}
