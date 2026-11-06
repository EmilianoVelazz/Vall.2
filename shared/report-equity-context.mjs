// Extra evidence for the equity executive report, never an investment forecast.
export const EQUITY_CONTEXT_VERSION=1;
export const EQUITY_SECTORS=[['XLK','Tecnología'],['XLF','Financiero'],['XLE','Energía'],['XLV','Salud'],['XLY','Consumo discrecional'],['XLP','Consumo básico'],['XLI','Industria'],['XLB','Materiales'],['XLU','Servicios públicos'],['XLRE','Inmobiliario'],['XLC','Comunicaciones']];
export const EQUITY_CONTEXT_MARKETS=[
  {id:'benchmark:sp500tr',label:'S&P 500 TR',symbol:'^SP500TR',unit:'puntos',role:'benchmark',returnBasis:'total-return'},
  {id:'vix',label:'VIX',symbol:'^VIX',unit:'puntos',role:'risk'},
  {id:'us10y',label:'Treasury 10 años',symbol:'DGS10',unit:'%',role:'yield'},
  {id:'credit',label:'Crédito HY · OAS',symbol:'BAMLH0A0HYM2',unit:'%',role:'spread'},
  {id:'dxy',label:'Dólar · DXY',symbol:'DX-Y.NYB',unit:'puntos',role:'dollar'},
  {id:'wti',label:'WTI',symbol:'CL=F',unit:'USD/barril',role:'commodity'},
  {id:'brent',label:'Brent',symbol:'BZ=F',unit:'USD/barril',role:'commodity'},
  {id:'gas',label:'Gas natural',symbol:'NG=F',unit:'USD/MMBtu',role:'commodity'},
  {id:'copper',label:'Cobre',symbol:'HG=F',unit:'USD/lb',role:'commodity'},
  {id:'gold',label:'Oro',symbol:'GC=F',unit:'USD/onza troy',role:'commodity'},
  ...EQUITY_SECTORS.map(([symbol,label])=>({id:'sector:'+symbol,symbol,label,unit:'USD/participación',role:'sector'})),
];
const codes=new Set('USD MXN CAD BRL ARS EUR GBP JPY CNY HKD TWD KRW INR IDR MYR SGD AUD NZD CHF SEK NOK DKK ILS TRY ZAR RUB PLN THB CLP COP PEN'.split(' '));
export const equityCurrency=value=>codes.has(value) ? value : '';
export function safeEquityUrl(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href.slice(0,1800) : '';}catch{return '';}}
export function equityContextPoints(input,cutoff,{positive=true,limit=400}={}){
  const end=Date.parse(cutoff),seen=new Map(),conflicts=new Set();if(!Number.isFinite(end))return [];
  for(const point of Array.isArray(input) ? input : []){
    const date=String(point?.date || '').slice(0,10),time=Date.parse(date);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(time) || time>end || new Date(time).toISOString().slice(0,10)!==date || !Number.isFinite(point?.value) || positive && point.value<=0)continue;
    if(seen.has(date) && seen.get(date).value!==point.value)conflicts.add(date);seen.set(date,{date,value:point.value});
  }
  return [...seen.values()].filter(point=>!conflicts.has(point.date)).sort((a,b)=>a.date.localeCompare(b.date)).slice(-limit);
}
export function safeEquityContext(input,cutoff){
  const end=Date.parse(cutoff),quotes=[],seen=new Set();if(!input || !Number.isFinite(end))return {version:EQUITY_CONTEXT_VERSION,quotes:[],news:[]};
  for(const item of (Array.isArray(input.quotes) ? input.quotes : []).slice(0,60)){
    const code=String(item?.id || '').startsWith('fx:') ? equityCurrency(String(item.id).slice(3)) : '';
    const definition=EQUITY_CONTEXT_MARKETS.find(entry=>entry.id===item?.id) || (code && {id:'fx:'+code,label:'USD/'+code,symbol:code+'=X',unit:code+' por 1 USD',role:'fx',currency:code});
    if(!definition || seen.has(definition.id) || item.unit!==definition.unit || !item.source || !safeEquityUrl(item.url))continue;
    const points=equityContextPoints(item.points || item.series,cutoff,{positive:!['yield','spread'].includes(definition.role),limit:['benchmark','commodity'].includes(definition.role) ? 3000 : 400}),last=points.at(-1);if(!last || end-Date.parse(last.date)>7*86400000)continue;
    seen.add(definition.id);quotes.push({...definition,source:String(item.source).slice(0,240),url:safeEquityUrl(item.url),basis:String(item.basis || '').slice(0,500),points});
  }
  const urls=new Set(),news=[];
  for(const item of (Array.isArray(input.news) ? input.news : []).slice(0,40)){
    const time=Date.parse(item?.publishedAt),url=safeEquityUrl(item?.url);
    if(!url || urls.has(url) || !item.title || !item.source || !Number.isFinite(time) || time>end || end-time>7*86400000)continue;
    urls.add(url);news.push({title:String(item.title).slice(0,500),description:String(item.description || '').slice(0,1000),source:String(item.source).slice(0,240),url,publishedAt:new Date(time).toISOString(),region:String(item.region || '').slice(0,80)});
  }
  return {version:EQUITY_CONTEXT_VERSION,quotes,news};
}
export function equityUsdChange(reference,change,context){
  if(!change || !Number.isFinite(change.base) || change.base<=0 || !Number.isFinite(change.last) || change.last<=0)return null;
  const currency=equityCurrency(reference.currency);if(!currency)return null;
  if(currency==='USD')return {...change,value:(change.last/change.base-1)*100,currency,fxBase:1,fxLast:1,source:reference.source};
  const quote=context.quotes.find(item=>item.id==='fx:'+currency);
  if(!quote?.points?.length)return null;
  const base=quote.points.find(item=>item.date===change.baseDate) || quote.points.filter(p=>p.date<=change.baseDate && (Date.parse(change.baseDate)-Date.parse(p.date))<=4*86400000).at(-1);
  const last=quote.points.find(item=>item.date===change.lastDate) || quote.points.filter(p=>p.date<=change.lastDate && (Date.parse(change.lastDate)-Date.parse(p.date))<=4*86400000).at(-1);
  if(!base || !last || !Number.isFinite(base.value) || base.value<=0 || !Number.isFinite(last.value) || last.value<=0)return null;
  return {...change,value:((change.last/change.base)*(base.value/last.value)-1)*100,currency,fxBase:base.value,fxLast:last.value,source:quote.source,url:quote.url};
}
