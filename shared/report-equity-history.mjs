const DAY=86400000;
// Private saved editions retain monthly observations and exact calculation
// dates; obsolete chart projections are rebuilt from this canonical evidence.
export function compactSavedEquityEvidence(history,context,periods){
  // Market history is already bounded by marketEvidence. Preserve every point
  // used by a plotted benchmark; only unplotted context can be compacted.
  const quotes=context.quotes.map(item=>{if(item.role==='benchmark')return item;const keep=new Set(item.points.slice(-10).map(point=>point.date));for(const change of Object.values(periods(item.points)))if(change){keep.add(change.baseDate);keep.add(change.lastDate);}if(item.role==='fx')for(const reference of history.filter(reference=>reference.currency===item.currency))for(const change of Object.values(periods(reference.points)))if(change){keep.add(change.baseDate);keep.add(change.lastDate);}return {...item,points:item.points.filter(point=>keep.has(point.date))};});
  return {marketHistory:history,equityContext:{...context,quotes}};
}
export const LATAM_COUNTRIES=['México','Brasil','Argentina','Chile','Colombia','Perú'];
const at=(points,date)=>{const result=points.findLast(point=>point.date<=date);return result && Date.parse(date)-Date.parse(result.date)<=7*DAY ? result : null;};
const target=(year,suffix)=>{const day=Number(suffix.slice(3)),month=Number(suffix.slice(0,2));return year+'-'+String(month).padStart(2,'0')+'-'+String(Math.min(day,new Date(Date.UTC(year,month,0)).getUTCDate())).padStart(2,'0');};
export function equityYearComparison(references,cutoff){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(cutoff || '') || !Number.isFinite(Date.parse(cutoff)) || new Date(Date.parse(cutoff)).toISOString().slice(0,10)!==cutoff)return null;
  const currentYear=Number(cutoff.slice(0,4)),years=Array.from({length:Math.max(0,currentYear-2019)},(_,index)=>2020+index),suffix=cutoff.slice(5);
  const rows=references.map(reference=>({label:reference.label,country:reference.country,symbol:reference.symbol,returnBasis:reference.returnBasis,source:reference.source,url:reference.url,cells:years.map(year=>{
    const date=target(year,suffix),base=at(reference.points,(year-1)+'-12-31'),last=at(reference.points,date);
    if(!base || !last || base.date.slice(0,4)!==String(year-1) || last.date.slice(0,4)!==String(year) || base.value<=0 || last.value<=0)return {year,value:null,targetDate:date};
    return {year,value:(last.value/base.value-1)*100,targetDate:date,baseDate:base.date,lastDate:last.date,base:base.value,last:last.value};
  })})).filter(row=>row.cells.some(cell=>cell.year<currentYear && cell.value!==null) && row.cells.at(-1)?.value!==null);
  if(!rows.length)return null;
  const keySymbols=['^GSPC','^NDX','^GDAXI','^N225','^MXX','^BVSP'];
  const benchmarkRows=keySymbols.map(sym=>rows.find(row=>row.symbol===sym)).filter(Boolean);
  const printed=benchmarkRows.length>=4 ? benchmarkRows : [...rows.filter(row=>row.symbol==='^GSPC'),...LATAM_COUNTRIES.flatMap(country=>rows.filter(row=>row.country===country)),...rows.filter(row=>row.country==='Canadá').slice(0,1)].filter((row,index,all)=>all.findIndex(item=>item.symbol===row.symbol)===index).slice(0,6);
  return {type:'bar',equityYears:true,bars:[],title:'Comparativa de años · 2020 a la fecha',unit:'Variación acumulada · %',cutoff,currentYear,years,rows,printRows:printed.length ? printed : rows.slice(0,6),note:'Cada año se mide desde su cierre anterior hasta el mismo día y mes del corte actual, o la última sesión previa dentro de siete días. Moneda local y metodología original de cada índice; † incorpora dividendos. No se compara un año completo con uno parcial. —: falta una base comparable.'};
}
export function equityBenchmarkChart(benchmark,peers,{title,totalReturn=false}={}){
  if(!benchmark || !peers.length)return null;
  const eligible=peers.filter(item=>item!==benchmark && (item.returnBasis==='total-return')===totalReturn);
  const selected=[benchmark,...eligible];if(selected.length<2)return null;
  // Use a common observed date. No interpolation or adjusted prices from a
  // different index are used to manufacture a benchmark.
  const common=benchmark.points.filter(point=>point.date>='2020-01-01' && selected.every(item=>item.points.some(value=>value.date===point.date && value.value>0)));
  if(common.length<2)return null;
  const first=common[0].date,last=common.at(-1).date;
  const log=eligible.some(item=>item.country==='Argentina');
  return {type:'line',equityComparison:true,equityBenchmark:true,equityLogScale:log,title,unit:'Índice base 100',benchmark:benchmark.label,returnBasis:totalReturn ? 'total-return' : 'price',indexBaseDate:first,indexEndDate:last,series:selected.map((item,index)=>{const base=item.points.find(point=>point.date===first).value;return {label:item.label+(index===0 ? ' · referencia' : ' · '+item.country),points:item.points.filter(point=>point.date>=first && point.date<=last).map(point=>({date:point.date,value:point.value/base*100}))};}),note:'Referencia: '+benchmark.label+'. Base común 100 al '+first+'; último cierre común '+last+'. '+(totalReturn ? 'Retorno total con dividendos en ambos índices.' : 'Índices de precios en ambas partes.')+' Monedas originales: permite comparar trayectorias, no la rentabilidad de una inversión en USD. Todas las series arrancan en 100; no se rellenan huecos.'+(log ? ' Escala logarítmica: distancias iguales representan cambios proporcionales iguales; no compara poder adquisitivo ni retorno real.' : '')};
}
