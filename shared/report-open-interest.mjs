const DAY=86400000;
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString().slice(0,10)===value;
const number=value=>value.toLocaleString('es-MX',{maximumFractionDigits:3});

// The CFTC change supplied by the collector is a percentage, unlike CME's
// change in integer contracts. Preserve its weekly base and never sum the two.
export function safeReportOpenInterest(input,cutoff){
  const end=Date.parse(cutoff);if(!Number.isFinite(end))return [];
  const seen=new Map(),conflicts=new Set();
  for(const item of (Array.isArray(input) ? input : []).slice(0,40)){
    if(!item || typeof item!=='object' || !/^[A-Z0-9]+(?:=F)?$/.test(item.symbol || '') || !validDate(item.date) || Date.parse(item.date)>end || end-Date.parse(item.date)>14*DAY || !Number.isSafeInteger(item.value) || item.value<0)continue;
    let url;try{url=new URL(item.url);if(url.protocol!=='https:' || url.hostname!=='publicreporting.cftc.gov' || url.username || url.password)continue;}catch{continue;}
    const comparable=validDate(item.previousDate) && item.previousDate<item.date && Date.parse(item.date)-Date.parse(item.previousDate)<=10*DAY;
    const value={symbol:item.symbol,label:String(item.label || '').slice(0,140),date:item.date,previousDate:comparable ? item.previousDate : '',value:item.value,change:comparable && typeof item.change==='number' && Number.isFinite(item.change) && item.change>=-100 ? item.change : null,source:'CFTC · Legacy Futures Only',url:url.href,cadence:'weekly'};
    const key=item.symbol+'|'+item.date;
    if(seen.has(key) && ['value','change','previousDate'].some(field=>seen.get(key)[field]!==value[field]))conflicts.add(key);
    seen.set(key,value);
  }
  const latest=new Map();
  for(const [key,item] of seen){if(conflicts.has(key))continue;const previous=latest.get(item.symbol);if(!previous || item.date>previous.date)latest.set(item.symbol,item);}
  return [...latest.values()];
}

export function reportOpenInterestTable(input,references,{cutoff,t=value=>value}={}){
  const symbols=new Set((Array.isArray(references) ? references : []).map(item=>item.symbol));
  const items=safeReportOpenInterest(input,cutoff).filter(item=>symbols.has(item.symbol));if(!items.length)return null;
  return {derivatives:true,printGroup:'commodity-cftc',title:t('Interés abierto · contratos de futuros'),columns:['Contrato','OI · contratos','Cambio semanal · %','Fecha anterior','Fecha observada'].map(t),rows:items.map(item=>[t(item.label),number(item.value),item.change==null ? '—' : (item.change>0 ? '↑ +' : item.change<0 ? '↓ ' : '→ ')+number(item.change)+' %',item.change==null ? '—' : item.previousDate,item.date]),note:t('CFTC · COT semanal de futuros: agrega los vencimientos del mercado, no el futuro frontal. OI se expresa en contratos; el cambio semanal es porcentual y conserva ambas fechas. Se refiere al martes y suele publicarse el viernes, con ajustes por festivos. No equivale al OI diario de CME ni a volumen negociado; no es una señal de dirección.')};
}
