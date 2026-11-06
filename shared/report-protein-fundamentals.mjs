const DAY=86400000;
const paths={Porcino:'/topics/animal-products/hogs-pork/market-outlook',Vacuno:'/topics/animal-products/cattle-beef/market-outlook','Avícola':'/topics/animal-products/poultry-eggs/market-outlook'};
export function safeProteinFundamentals(items,cutoff){
 const end=Date.parse(cutoff),seen=new Set();if(!Number.isFinite(end))return [];
 return (Array.isArray(items) ? items : []).slice(0,12).flatMap(item=>{
  let url;try{url=new URL(item.url);}catch{return [];}
  const date=String(item.publishedAt || ''),time=Date.parse(date);
  if(!['www.ers.usda.gov','ers.usda.gov'].includes(url.hostname) || url.pathname.replace(/\/$/,'')!==paths[item.sector] || url.protocol!=='https:' || url.username || url.password || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(time) || new Date(time).toISOString().slice(0,10)!==date || time>end || end-time>45*DAY || !['Porcino','Vacuno','Avícola'].includes(item.sector) || !String(item.text || '').trim() || seen.has(item.sector))return [];
  seen.add(item.sector);return [{sector:item.sector,text:String(item.text).slice(0,600),publishedAt:date,source:'USDA ERS · perspectivas sectoriales',url:url.href}];
 });
}
