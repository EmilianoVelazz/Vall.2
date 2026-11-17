import catalog from './report-equity-markets.json' with {type:'json'};
import {LATAM_COUNTRIES} from './report-equity-history.mjs';

const definition=item=>catalog.markets.find(market=>item.symbol && market.symbol===item.symbol || market.label===item.label);
export function equityCountry(item){return item.equityCountry || definition(item)?.market || item.country || item.market || (item.region==='México' ? 'México' : '');}
export function equityRegion(item){
  const country=equityCountry(item),region=item.equityRegion || definition(item)?.region || item.region;
  return LATAM_COUNTRIES.includes(country) || ['Estados Unidos','Canadá'].includes(country) || region==='México' ? 'América' : region || 'Otras regiones';
}
export function equityRegionMatches(item,region){return !region || (region==='Latinoamérica' ? LATAM_COUNTRIES.includes(equityCountry(item)) : equityRegion(item)===region);}
export function equityRegionalLabel(item,{t=value=>value}={}){const country=equityCountry(item);return country ? t(country)+' · '+item.label : item.label;}
export function equityRegionSeries(series,region){
  const selected=series.filter(item=>equityRegionMatches(item,region));
  if(!['América','Latinoamérica'].includes(region))return selected;
  const order=[...LATAM_COUNTRIES,'Estados Unidos','Canadá'],rank=item=>{const index=order.indexOf(equityCountry(item));return index<0 ? order.length : index;};
  return selected.toSorted((a,b)=>rank(a)-rank(b));
}
export function equityRegionalGroups(series){
  const definitions=[['América',['América']],['Europa',['Europa']],['Asia y Medio Oriente',['Asia','Medio Oriente']],['Oceanía y África',['Oceanía','África']]];
  const groups=definitions.map(([label,regions])=>({label,series:label==='América' ? equityRegionSeries(series,label) : series.filter(item=>regions.includes(equityRegion(item)))})).filter(group=>group.series.length);
  const known=new Set(groups.flatMap(group=>group.series)),other=series.filter(item=>!known.has(item));if(other.length)groups.push({label:'Otras regiones',series:other});
  return groups;
}
