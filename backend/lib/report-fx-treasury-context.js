'use strict';
const {externalGet}=require('./http');
const {quotePoints,dailyPoints}=require('./report-observations');
const catalysts=require('../data/fx-catalysts-public.json');
async function loadDxy({get=externalGet,cutoff}={}){
 const symbol='DX-Y.NYB',url='https://query1.finance.yahoo.com/v8/finance/chart/'+symbol+'?period1=1575158400&period2='+Math.floor((Date.parse(cutoff)+86400000)/1000)+'&interval=1d';
 const r=await get(url,{'User-Agent':'Mozilla/5.0',Accept:'application/json'},12000);if(!r.ok)throw Error('DXY no disponible');const data=(await r.json())?.chart?.result?.[0];
 if(data?.meta?.symbol!==symbol || data.meta.currency!=='USD' || data.meta.instrumentType!=='INDEX')throw Error('Identidad DXY no confirmada');
 return {id:'DXY',symbol,label:'DXY · cesta ICE de seis monedas',unit:'puntos',source:'ICE US Dollar Index / Yahoo Finance',url:'https://finance.yahoo.com/quote/DX-Y.NYB/',basis:'Índice ICE DXY; seis monedas con ponderaciones fijas. No representa todas las monedas del mundo.',points:quotePoints(data.indicators?.quote?.[0]?.close || [],data.timestamp || [],cutoff,{positive:true,timeZone:data.meta.exchangeTimezoneName || 'America/New_York',regularPeriod:data.meta.currentTradingPeriod?.regular,closedOnly:true})};
}
async function loadFxTreasuryContext({get=externalGet,cutoff=new Date().toISOString(),previous={},bonds=[],loadIndex,news=[]}={}){
 const end=Date.parse(cutoff),day=cutoff.slice(0,10),valid=point=>point && Number.isFinite(point.value) && Date.parse(point.date)<=end && end-Date.parse(point.date)<=7*86400000;
 const rates=bonds.filter(item=>['SOFR','SF331451','DFEDTARL','DFEDTARU'].includes(item.id)).flatMap(item=>{const point=(item.series || item.points || []).at(-1);return valid(point) ? [{id:item.id,value:point.value,date:point.date,source:item.source,url:item.url}] : [];});
 const query=async(url,json=true)=>{const r=await get(url,{Accept:json ? 'application/json' : 'text/csv'},10000);if(!r.ok)throw Error('Fuente no disponible');return json ? r.json() : r.text();};
 const results=await Promise.allSettled([
  (loadIndex ? loadIndex() : loadDxy({get,cutoff})),
  (async()=>{const data=await query('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial='+new Date(end-10*86400000).toISOString().slice(0,10).split('-').reverse().join('/')+'&dataFinal='+day.split('-').reverse().join('/'));const points=dailyPoints((Array.isArray(data) ? data : []).flatMap(item=>{const m=item.data?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m && /^\d+(?:\.\d+)?$/.test(item.valor) ? [{date:m[3]+'-'+m[2]+'-'+m[1],value:Number(item.valor)}] : [];}),cutoff),point=points.at(-1);return valid(point) ? {id:'SELIC',...point,source:'Banco Central do Brasil · SGS 432',url:'https://www.bcb.gov.br/en/monetarypolicy/interestrates'} : null;})(),
  (async()=>{for(let offset=0;offset<7;offset++){const date=new Date(end-offset*86400000).toISOString().slice(0,10),data=await query('https://www.banxico.org.mx/tipcamb/datosieajax?'+new URLSearchParams({accion:'dato',idSeries:'SF61745',decimales:'4',fecha:date.split('-').reverse().join('/')}));const raw=data?.header?.exito===true && data.body?.[0]?.exito===true ? data.body[0].mensaje : '';if(/^\d+(?:\.\d+)?$/.test(raw))return {id:'BANXICO',date,value:Number(raw),source:'Banco de México · tasa objetivo SF61745',url:'https://www.banxico.org.mx/SieInternet/consultarDirectorioInternetAction.do?sector=18&accion=consultarCuadroAnalitico&idCuadro=CA51&locale=es'};}return null;})(),
  ...['DFEDTARL','DFEDTARU'].filter(id=>!rates.some(item=>item.id===id)).map(async id=>{const text=await query('https://fred.stlouisfed.org/graph/fredgraph.csv?id='+id+'&cosd='+new Date(end-10*86400000).toISOString().slice(0,10)+'&coed='+day,false),{parseFred}=require('./report-bond-context'),point=parseFred(text,{id},cutoff).at(-1);return valid(point) ? {id,...point,source:'Reserva Federal / FRED',url:'https://fred.stlouisfed.org/series/'+id} : null;})
 ]);
 for(const item of results.slice(1))if(item.status==='fulfilled' && item.value)rates.push(item.value);
 for(const item of previous.rates || [])if(!rates.some(rate=>rate.id===item.id) && valid(item))rates.push(item);
 const dxy=results[0].status==='fulfilled' ? results[0].value : previous.dxy;
 const liveNews=news.filter(item=>/brasil|brazil|\bbrl\b/i.test(item.title || '') && /real|cambio|câmbio|currency|fiscal|elei|election|d[oó]lar/i.test(item.title || '')).map(item=>({...item,codes:['BRL'],confidence:'context',description:'Titular financiero a contrastar: '+String(item.title || '').slice(0,300)}));
 return {dxy,rates,catalysts:[...catalysts,...liveNews,...(previous.catalysts || [])].filter((item,index,all)=>Number.isFinite(Date.parse(item.publishedAt)) && Date.parse(item.publishedAt)<=end && end-Date.parse(item.publishedAt)<=7*86400000 && all.findIndex(other=>other.url===item.url)===index),impliedVolatility:null};
}
module.exports={loadFxTreasuryContext,loadDxy};
