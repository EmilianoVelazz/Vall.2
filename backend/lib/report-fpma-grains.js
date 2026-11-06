'use strict';
const {externalGet}=require('./http');
const {dailyPoints}=require('./report-observations');
const API='https://fpma.fao.org/giews/v4/global/price_module/api/v1/';
const COUNTRIES=[
 ['MEX','México','América del Norte','Maize (white, Sinaloa)','Mexico City'],
 ['MEX','México','América del Norte','Maize (white, Sinaloa)','Culiacán'],
 ['COL','Colombia','América del Sur','Maize (yellow)','Medellín'],
 ['PER','Perú','América del Sur','Maize (yellow)','Lima'],
 ['CHL','Chile','América del Sur','Wheat','National Average'],
 ['ECU','Ecuador','América del Sur','Maize','Quito'],
 ['BOL','Bolivia','América del Sur','Maize (yellow)','Santa Cruz'],
 ['GTM','Guatemala','América Central','Maize (white)','Guatemala City'],
 ['HND','Honduras','América Central','Maize (white)','Tegucigalpa'],
 ['SLV','El Salvador','América Central','Maize (white)','San Salvador'],
 ['IND','India','Asia','Wheat','Punjab'],
 ['TZA','Tanzania','África','Maize','National Average'],
];
const UNITS={'Kg':'kg','kg':'kg','tonne':'t','100 kg':'100 kg','Spanish quintal (46 kg)':'quintal 46 kg','100 lbs':'100 lb'};
const PRODUCTS={'Maize':'Maíz','Maize (white)':'Maíz blanco','Maize (yellow)':'Maíz amarillo','Maize (white, Sinaloa)':'Maíz blanco de Sinaloa','Wheat':'Trigo'};
const MARKETS={'Mexico City':'Ciudad de México','National Average':'promedio nacional','Guatemala City':'Ciudad de Guatemala'};
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i,DAY=86400000;
const monthEnd=date=>/^\d{4}-(?:0[1-9]|1[0-2])-01$/.test(date) ? new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7)),0)).toISOString().slice(0,10) : null;
function selectFpmaGrainSeries(payload,specs,cutoff){
 if(!Array.isArray(payload?.results) || payload.results.length>100)throw Error('Catálogo FPMA no válido.');
 return specs.flatMap(([iso,market,region,product,place])=>{
  const item=payload.results.find(row=>row.iso3_country_code===iso && row.commodity_name===product && row.market_name===place && row.price_type==='WHOLESALE' && UUID.test(row.uuid) && UNITS[row.measure_unit_label] && /^[A-Z]{3}$/.test(row.currency) && row.source_name);
  if(!item)return [];
  const cadence=['weekly','monthly'].find(period=>item.periodicity?.some(row=>{const date=period==='monthly' ? monthEnd(row.end_date) : row.end_date;return row.period===period && date && Date.parse(date)<=Date.parse(cutoff) && Date.parse(cutoff)-Date.parse(date)<=(period==='monthly' ? 70 : 21)*DAY;}));
  if(!cadence)return [];
  return [{...item,cadence,country:iso,market,region,label:PRODUCTS[product]+' · '+(MARKETS[place] || place)+' · '+market,unit:item.currency+'/'+UNITS[item.measure_unit_label]}];
 });
}
function parseFpmaGrainPrices(payload,metadata,cutoff,retrievedAt=new Date().toISOString()){
 if(!Array.isArray(payload?.results) || payload.results.length>20)throw Error('Precios FPMA no válidos.');
 return metadata.flatMap(item=>{
  const matches=payload.results.filter(row=>row.uuid===item.uuid);if(matches.length!==1 || !Array.isArray(matches[0].datapoints) || matches[0].datapoints.length>6000)return [];
  // price_value already uses the declared original unit. The conversion
  // factor is identity metadata, not a multiplier to apply to that price.
  const rows=matches[0].datapoints.filter(row=>row.periodicity===item.cadence && (row.conversion_factor==null || row.conversion_factor===item.conversion_factor) && (typeof row.price_value==='number' || typeof row.price_value==='string' && /^\d+(?:\.\d+)?$/.test(row.price_value)));
  const series=dailyPoints(rows.flatMap(row=>{const date=item.cadence==='monthly' ? monthEnd(row.date) : row.date;return date ? [{date,value:Number(row.price_value)}] : [];}),cutoff).filter(row=>row.value>0 && row.date>='2020-01-01');
  const last=series.at(-1);if(!last || Date.parse(cutoff)-Date.parse(last.date)>(item.cadence==='monthly' ? 70 : 21)*DAY)return [];
  const uri=API+'FpmaSeriePrice/?'+new URLSearchParams({uuid__in:item.uuid,periodicity:item.cadence});
  return [{ticker:'FPMA-GRAIN-'+item.uuid,provider:'fpma-grains',bucket:'grains',country:item.country,market:item.market,region:item.region,label:item.label,unit:item.unit,currency:item.currency,cadence:item.cadence,exchange:'Mercado físico',source:'FAO FPMA · '+item.source_name,url:uri,sourceUrl:item.source_url,series,value:last.value,observedAt:last.date,retrievedAt,quoteStatus:'verified',previous:null,change:null,performance:{day:null},basis:'Precio mayorista de '+item.commodity_name+'; '+item.market_name+'; '+item.price_type+'; unidad original '+item.measure_unit_label+'. '+(item.cadence==='monthly' ? 'Promedio mensual; la fecha representa el final del mes observado.' : 'Publicación semanal; conserva la fecha observada de FAO FPMA.')+' No es un precio nacional salvo que la plaza publicada sea National Average.'}];
 });
}
async function loadFpmaGrains({get=externalGet,cutoff=new Date().toISOString(),timeoutMs=9000}={}){
 const json=async url=>{const response=await get(url,{Accept:'application/json'},timeoutMs);if(!response.ok)throw Error('FPMA no disponible.');return response.json();};
 const countries=[...new Set(COUNTRIES.map(row=>row[0]))],selected=[];let cursor=0;
 await Promise.all(Array.from({length:3},async()=>{while(cursor<countries.length){const iso=countries[cursor++];try{selected.push(...selectFpmaGrainSeries(await json(API+'FpmaSerieDomestic/?'+new URLSearchParams({iso3_country_codes:iso,limit:100})),COUNTRIES.filter(row=>row[0]===iso),cutoff));}catch{/* Preserve the same cached identity upstream; never use a substitute country. */}}}));
 const result=[];
 for(const cadence of ['weekly','monthly']){
  const items=selected.filter(item=>item.cadence===cadence);
  for(let offset=0;offset<items.length;offset+=8){const batch=items.slice(offset,offset+8);try{result.push(...parseFpmaGrainPrices(await json(API+'FpmaSeriePrice/?'+new URLSearchParams({uuid__in:batch.map(item=>item.uuid).join(','),periodicity:cadence})),batch,cutoff));}catch{/* An unavailable batch remains absent. */}}
 }
 return result;
}
module.exports={FPMA_GRAIN_COUNTRIES:COUNTRIES,selectFpmaGrainSeries,parseFpmaGrainPrices,loadFpmaGrains};
