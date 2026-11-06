// Canonical observations for a six-month daily chart and exact period bases.
// No rounding, resampling or interpolation. Monthly observations retain 2020+.
export function compactFxPoints(points,periods={}){
 const keep=new Set(points.slice(-140).map(point=>point.date)),months=new Map();
 for(const point of points)if(point.date>='2019-12-01')months.set(point.date.slice(0,7),point.date);
 for(const date of months.values())keep.add(date);
 for(const period of Object.values(periods))if(period)keep.add(period.baseDate);
 const first=points.find(point=>point.date>='2020-01-01');if(first)keep.add(first.date);
 return points.filter(point=>keep.has(point.date)).slice(-256);
}
export function fxRegionalVisuals(references,cutoff){
 const specs=[['europe-core','Europa · monedas principales',['EUR','GBP','CHF','SEK']],['europe-north','Europa · norte y centro',['NOK','DKK','PLN','CZK']],['europe-other','Europa · otras monedas',['HUF','RON','TRY','ISK']],['asia-core','Asia · mercados principales',['CNY','JPY','INR','KRW']],['asia-south','Asia · centros y sudeste',['SGD','HKD','THB','MYR']],['asia-other','Asia · otras monedas',['IDR','PHP','ILS']],['oceania','Oceanía',['AUD','NZD']],['africa','África · Sudáfrica',['ZAR']]],from=new Date(Date.parse(cutoff)-184*86400000).toISOString().slice(0,10),colors=['#53745f','#b18152','#83708f','#597c97'];
 return specs.flatMap(([key,title,codes])=>{
  const members=codes.map(code=>references.find(item=>item.code===code)).filter(item=>item && item.points.filter(point=>point.date>=from).length>=20);if(!members.length)return [];
  const calendars=members.map(item=>new Set(item.points.map(point=>point.date))),dates=members[0].points.filter(point=>point.date>=from && calendars.every(calendar=>calendar.has(point.date)));if(dates.length<20)return [];
  const start=dates[0].date,finish=dates.at(-1).date;
  return [{type:'line',fxOverview:true,fxTreasuryChart:true,fxRegionalChart:true,fxGroup:key,title:'USD frente a '+title,unit:'Fuerza del USD · base común 100',indexBaseDate:start,indexEndDate:finish,series:members.map((item,index)=>{const base=item.points.find(point=>point.date===start).value;return {label:item.code,reference:item.label,color:colors[index],points:item.points.filter(point=>point.date>=start && point.date<=finish).map(point=>({date:point.date,value:item.inverse ? base/point.value*100 : point.value/base*100}))};}),note:'Una subida indica que el USD gana valor frente a la moneda indicada. Base común 100 en '+start+'; última fecha común '+finish+'. EUR, GBP, AUD y NZD se invierten solo para este índice; las tablas conservan sus pares convencionales. No se rellenan días ni se comparan niveles nominales de monedas distintas.',dataInTables:true}];
 });
}
export function fxVisualWindow(visual,months=6){
 if(months===6)return visual;
 const end=new Date(visual.indexEndDate+'T00:00:00Z'),day=end.getUTCDate();end.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()-months);end.setUTCDate(Math.min(day,new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate()));const from=end.toISOString().slice(0,10),members=visual.series;
 const common=members[0]?.points.filter(point=>point.date>=from && members.every(item=>item.points.some(other=>other.date===point.date))) || [];if(common.length<2)return null;
 const start=common[0].date,finish=common.at(-1).date;
 return {...visual,indexBaseDate:start,indexEndDate:finish,series:members.map(item=>{const base=item.points.find(point=>point.date===start).value;return {...item,points:item.points.filter(point=>point.date>=start && point.date<=finish).map(point=>({date:point.date,value:point.value/base*100}))};}),note:visual.note+' Ventana seleccionada: '+start+' / '+finish+'; la base 100 se recalcula en una fecha observada común a las series de este panel.'};
}
