'use strict';
const {parseCommercialNumber}=require('./commercial-calculator');
const fold=value=>String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
function guardMarketClaims(plan={},evidence={},text=''){
 const quotes=[...(Array.isArray(evidence.marketQuotes)?evidence.marketQuotes:[]),...(Array.isArray(evidence.citations)?evidence.citations:[]).filter(item=>item && ['live_fx_quote','live_market_quote'].includes(item.type))].filter(quote=>quote && Number.isFinite(quote.value) && typeof quote.url==='string' && /^https?:\/\//.test(quote.url) && Number.isFinite(Date.parse(quote.updatedAt || quote.date)));
 let removedQuotes=0,removedGuarantees=0;
 const reviewed=String(text).split('\n').map(line=>{
  const normalized=fold(line);
  const guarantee=/\b(?:garantiza(?:n)? (?:una )?(?:ganancias?|rentabilidad(?:es)?|rendimientos?)|ganancias? garantizadas?|inversion sin riesgo)\b/.exec(normalized);
  if(guarantee && !/\b(?:no|nunca|jamas|tampoco|sin que)\b/.test(normalized.slice(Math.max(0,guarantee.index-45),guarantee.index))){removedGuarantees++;return 'El resultado financiero no está garantizado; depende de las condiciones, costos y riesgos de la operación.';}
  if(/^(?:\s*[>*-]\s*)?(?:si\b|escenario\b|ejemplo\b|supuesto\b)/.test(normalized) || /\b(?:hipotetic[oa]|supuest[oa]|no es una cotizacion)\b/.test(normalized))return line;
  if(!plan.needsLiveQuote || plan.providedInputsOnly)return line;
  const quoteClaim=normalized.match(/\b(?:cotiza(?:n)?(?:\s+(?:hoy|ahora|actualmente))?(?:\s+(?:a|en))?|(?:precio|spot|tipo de cambio)\s+(?:actual|de hoy)(?:\s+es)?(?:\s+de)?)\s*[:=]?\s*[$€£]?\s*(\d+(?:[.,]\d+)*)/);
  if(!quoteClaim)return line;
  const value=parseCommercialNumber(quoteClaim[1]);
  const percentage=/^\s*(?:%|por ciento\b)/.test(normalized.slice(quoteClaim.index+quoteClaim[0].length));
  const matching=quotes.some(quote=>{
   const names=[quote.symbol,quote.pair,quote.ticker,quote.label].filter(Boolean).map(fold);
   const tokens=value=>' '+value.replace(/[^\p{L}\p{N}]+/gu,' ').trim()+' ';
   const named=names.some(name=>name.length>=2 && tokens(normalized).includes(tokens(name)));
   const urls=[...line.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map(match=>match[1].replace(/\/$/,''));
   const dates=line.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [],date=String(quote.updatedAt || quote.date).slice(0,10);
   const currencies=[...new Set((line.match(/\b(?:USD|MXN|EUR|GBP|CAD|BRL|JPY)\b/gi) || []).map(currency=>currency.toUpperCase()))];
   const unitOk=percentage?quote.unit==='%':!currencies.length || typeof quote.unit==='string' && currencies.every(currency=>quote.unit.includes(currency));
   return named && unitOk && (!dates.length || dates.includes(date)) && (!urls.length || urls.includes(quote.url.replace(/\/$/,''))) && Math.abs(quote.value-value)<=.005;
  });
  if(!matching){removedQuotes++;return 'No se confirmó esa cotización con una observación fechada y una fuente verificable; el valor quedó excluido.';}
  return line;
 }).join('\n');
 return {text:reviewed,changed:removedQuotes+removedGuarantees>0,review:{removedQuotes,removedGuarantees,scope:'Explicit current-quote assertions and financial guarantees; not general factual verification.'}};
}
module.exports={guardMarketClaims};
