import {usProteinReference} from './report-protein-scope.mjs';

const DAY=86400000;
const finite=value=>typeof value==='number' && Number.isFinite(value);
const number=value=>finite(value) ? value.toLocaleString('es-MX',{maximumFractionDigits:Math.abs(value)<.01 ? 6 : 3}) : '—';
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString().slice(0,10)===value;

// This is an indicative translation of a US price, never a Mexican quote or a
// historical return. Keep the physical denominator and both observation dates.
export function safeProteinFx(input,cutoff){
  const end=Date.parse(cutoff),observed=Date.parse(input?.observedAt);
  if(input?.base!=='USD' || input.rates?.USD!==1 || !finite(input.rates?.MXN) || input.rates.MXN<=0 || !finite(end) || !finite(observed) || observed>end || end-observed>3*DAY || !String(input.source || '').trim())return undefined;
  let url;
  try{url=new URL(input.url);if(url.protocol!=='https:' || url.username || url.password)return undefined;}catch{return undefined;}
  return {base:'USD',rates:{USD:1,MXN:input.rates.MXN},observedAt:new Date(observed).toISOString(),source:String(input.source).slice(0,240),url:url.href.slice(0,1800)};
}

export function proteinPriceTable(references,input,{cutoff,title='Estados Unidos · precios de proteínas',t=value=>value}={}){
  const end=Date.parse(cutoff),items=[];
  for(const reference of Array.isArray(references) ? references : []){
    const unit=String(reference.unit || '').match(/^(USD|US¢)\/(.+)$/),last=reference.last;
    if(!usProteinReference(reference) || !unit || !validDate(last?.date) || !finite(last.value) || last.value<=0 || !finite(end) || Date.parse(last.date)>end || end-Date.parse(last.date)>(({daily:7,weekly:21,monthly:70,annual:370})[reference.cadence] || 14)*DAY)return null;
    const divisor=unit[1]==='US¢' ? 100 : 1,previous=reference.cadence==='daily' && validDate(reference.previous?.date) && reference.previous.date<last.date && finite(reference.previous.value) && reference.previous.value>0 ? reference.previous : null;
    items.push({reference,unit:'USD/'+unit[2],divisor,last:last.value/divisor,previous});
  }
  if(!items.length)return null;
  const fx=safeProteinFx(input,cutoff),converted=fx && items.every(item=>finite(item.last*fx.rates.MXN));
  const note=[t('Precios de Estados Unidos expresados en USD en su misma unidad física. Los centavos de dólar se dividen entre 100; no se convierten libras, kilogramos ni presentaciones. Anterior significa la publicación diaria previa, con su fecha; las series semanales o mensuales conservan su frecuencia.'),converted ? t('Equivalencia informativa del último precio: 1 USD = {rate} MXN; tipo de cambio observado el {date}. Fuente: {source}.').replace('{rate}',number(fx.rates.MXN)).replace('{date}',fx.observedAt.slice(0,10)).replace('{source}',fx.source)+' '+t('El precio estadounidense y el tipo de cambio pueden tener fechas distintas. No es una cotización mexicana ni incluye comisiones, impuestos o flete. No se aplica esta tasa a los precios anteriores ni a sus variaciones.') : ''].filter(Boolean).join(' ');
  return {title:t(title),printGroup:'market-levels',printTitle:t('Cierres y precios publicados'),proteinCurrency:true,columns:['País / referencia','Unidad USD','Anterior · USD','Fecha anterior','Último · USD','Fecha del dato',...(converted ? ['Equivalente MXN'] : [])].map(t),rows:items.map(item=>[t(item.reference.label),item.unit,number(item.previous ? item.previous.value/item.divisor : null),item.previous?.date || '—',number(item.last),item.reference.last.date,...(converted ? [number(item.last*fx.rates.MXN)] : [])]),note};
}
