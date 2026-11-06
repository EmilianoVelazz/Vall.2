// Contract counts are independent of price, notional exposure and price direction.
const day=86400000;
const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString().slice(0,10)===value;
const count=value=>Number.isSafeInteger(value) && value>=0;
const url=value=>{try{const parsed=new URL(value);return parsed.protocol==='https:' && parsed.hostname==='www.cmegroup.com' && !parsed.username && !parsed.password ? parsed.href : '';}catch{return '';}};
export const DERIVATIVES_VERSION=1;
export function safeCommodityDerivatives(input,cutoff){
  const end=Date.parse(cutoff);if(!input || !Number.isFinite(end))return {version:DERIVATIVES_VERSION,options:[],futures:[]};
  const clean=(rows,options)=>{
    const seen=new Map(),conflicts=new Set();
    for(const item of (Array.isArray(rows) ? rows : []).slice(0,1500)){
      if(!item || typeof item!=='object' || Array.isArray(item))continue;
      const observed=Date.parse(item.date),retrieved=Date.parse(item.retrievedAt),link=url(item.url);
      if(!date(item.date) || observed>end || end-observed>7*day || !Number.isFinite(retrieved) || retrieved>end || retrieved<observed || !link || !count(item.openInterest) || !/^[A-Z0-9]{1,12}$/.test(item.productCode || '') || !/^[A-Z0-9]+(?:=F)?$/.test(item.symbol || ''))continue;
      if(options && (!['call','put'].includes(item.side) || !/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(item.contractMonth || '') || item.contractMonth<item.date.slice(0,7)))continue;
      const key=[item.productCode,item.date,options ? item.contractMonth : '',options ? item.side : ''].join('|');
      const value={symbol:item.symbol,productCode:item.productCode,label:String(item.label || '').slice(0,140),exchange:String(item.exchange || '').slice(0,40),date:item.date,retrievedAt:new Date(retrieved).toISOString(),openInterest:item.openInterest,changeOpenInterest:Number.isSafeInteger(item.changeOpenInterest) ? item.changeOpenInterest : null,source:'CME Group · Daily Bulletin',url:link,page:count(item.page) && item.page>0 ? item.page : null,status:['preliminary','final'].includes(item.status) ? item.status : 'published',...(options ? {side:item.side,contractMonth:item.contractMonth,scope:'series-strikes'} : {scope:'all-expiries'})};
      if(seen.has(key) && ['symbol','openInterest','changeOpenInterest','status'].some(field=>seen.get(key)[field]!==value[field]))conflicts.add(key);
      seen.set(key,value);
    }
    return [...seen].filter(([key])=>!conflicts.has(key)).map(([,value])=>value);
  };
  return {version:DERIVATIVES_VERSION,checkedAt:input.checkedAt,options:clean(input.options,true),futures:clean(input.futures,false)};
}
export function commodityDerivativesTables(report,references,{t=value=>value}={}){
  const data=safeCommodityDerivatives(report.marketDerivatives,report.generatedAt),lookup=new Map(references.filter(ref=>ref.symbol).map(ref=>[ref.symbol,ref]));
  const number=value=>value==null ? '—' : value.toLocaleString('es-MX',{maximumFractionDigits:3});
  const pairs=new Map();
  for(const item of data.options){
    if(!lookup.has(item.symbol))continue;
    const key=[item.symbol,item.productCode,item.contractMonth,item.date,item.status].join('|');
    if(!pairs.has(key))pairs.set(key,{...item});pairs.get(key)[item.side]=item;
  }
  const latest=new Map();
  for(const item of [...pairs.values()].filter(item=>item.call && item.put)){
    const key=[item.symbol,item.productCode,item.contractMonth].join('|'),previous=latest.get(key);
    if(!previous || item.date>previous.date || item.date===previous.date && item.status==='final')latest.set(key,item);
  }
  const paired=[...latest.values()].sort((a,b)=>a.symbol.localeCompare(b.symbol) || a.contractMonth.localeCompare(b.contractMonth));
  const tables=[];
  if(paired.length)tables.push({derivatives:true,printGroup:'commodity-options',title:t('Opciones de commodities · call y put'),columns:['Producto / mercado','Serie / mes','Call · OI','Put · OI','Put/Call · OI','Fecha del dato','Estado'].map(t),rows:paired.map(item=>[t(lookup.get(item.symbol).label)+'\n'+item.exchange,(/^(?:LO2?|OG|HXE?)$/.test(item.productCode) ? item.productCode+' · ' : '')+item.contractMonth,number(item.call.openInterest),number(item.put.openInterest),item.call.openInterest>0 ? number(item.put.openInterest/item.call.openInterest) : '—',item.date,t(item.status==='preliminary' ? 'Preliminar' : item.status==='final' ? 'Final' : 'Publicado')]),note:t('OI: contratos abiertos, agregados por serie mensual y sus precios de ejercicio. Call: derecho de compra; put: derecho de venta, con las condiciones del contrato. El mes de serie no es una fecha exacta de vencimiento. Put/Call usa OI del mismo producto, serie, fecha y estado; no es una señal automática de precio ni una prima de opción.')});
  const lastFutures=new Map();for(const item of data.futures.filter(item=>lookup.has(item.symbol))){const previous=lastFutures.get(item.productCode);if(!previous || item.date>previous.date)lastFutures.set(item.productCode,item);}
  const futures=[...lastFutures.values()];
  if(futures.length)tables.push({derivatives:true,printGroup:'commodity-futures',title:t('Interés abierto de futuros · CME'),columns:['Producto / mercado','OI · contratos','Cambio · contratos','Fecha del dato','Estado'].map(t),rows:futures.map(item=>[t(lookup.get(item.symbol).label)+'\n'+item.exchange,number(item.openInterest),item.changeOpenInterest==null ? '—' : (item.changeOpenInterest>0 ? '↑ +' : item.changeOpenInterest<0 ? '↓ ' : '→ ')+number(item.changeOpenInterest),item.date,t(item.status==='preliminary' ? 'Preliminar' : item.status==='final' ? 'Final' : 'Publicado')]),note:t('Totales publicados del producto a través de sus vencimientos. No son el interés abierto del futuro frontal ni volumen negociado. El cambio conserva la unidad contratos; no se suma con porcentajes ni con contratos de opciones.')});
  return tables;
}
