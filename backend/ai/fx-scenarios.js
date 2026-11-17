'use strict';
const {normalizeForIntent}=require('./conversation-context');
const {parseCommercialNumber}=require('./commercial-calculator');
const CURRENCY=/^(?:USD|MXN|EUR|GBP|CAD|BRL|JPY)$/;
function sanitizeFxScenarios(value){
 if(!value || !CURRENCY.test(value.from || '') || !CURRENCY.test(value.to || '') || value.from===value.to || !Number.isFinite(value.amount) || value.amount<=0 || value.amount>1e12 || !Array.isArray(value.rates) || !value.rates.length || value.rates.length>5 || !value.rates.every(rate=>Number.isFinite(rate) && rate>0 && rate<=1e6 && value.amount*rate<=Number.MAX_SAFE_INTEGER/100))return null;
 return {from:value.from,to:value.to,amount:value.amount,rates:[...value.rates],selected:Number.isInteger(value.selected) && value.selected>=1 && value.selected<=value.rates.length?value.selected:null};
}
function fxScenarioRequest(message,market){
 const text=normalizeForIntent(message);
 if(!/\b(?:simula|escenarios?|sensibilidad)\b/.test(text) || !/tipo de cambio|\b(?:usd|mxn|eur|gbp|cad|brl|jpy)\s*\//.test(text))return null;
 const amounts=String(message).match(/\b(?:pago|pagar|pagar[eé]|importe(?: de)?|debo)\s+(-?\d+(?:[.,]\d+)*)\s+(USD|MXN|EUR|GBP|CAD|BRL|JPY)\b/i)
  || String(market?.objective || '').match(/\b(?:pago|pagar|pagar[eé]|importe(?: de)?|debo)\s+(-?\d+(?:[.,]\d+)*)\s+(USD|MXN|EUR|GBP|CAD|BRL|JPY)\b/i)
  || String(market?.anchor || '').match(/\b(?:pago|pagar|pagar[eé]|importe(?: de)?|debo)\s+(-?\d+(?:[.,]\d+)*)\s+(USD|MXN|EUR|GBP|CAD|BRL|JPY)\b/i);
 const pair=String(message).match(/\b(USD|MXN|EUR|GBP|CAD|BRL|JPY)\s*\/\s*(USD|MXN|EUR|GBP|CAD|BRL|JPY)\b/i)
  || String(market?.assets?.[0] || '').match(/^(USD|MXN|EUR|GBP|CAD|BRL|JPY)\/(USD|MXN|EUR|GBP|CAD|BRL|JPY)$/);
 const start=text.match(/(?:tipo de cambio(?:\s+(?:de|a|en))?|\b(?:usd|mxn|eur|gbp|cad|brl|jpy)\s*\/\s*(?:usd|mxn|eur|gbp|cad|brl|jpy))\s*[:=]?\s*(-?\d)/);
 if(!start)return null;
 const offset=start.index+start[0].length-start[1].length;
 const list=text.slice(offset).replace(/[.?!]\s*$/,'').trim().split(/[,;]\s+|\s+(?:y|o)\s+/);
 if(list.length<2)return null;
 if(list.length>5)return {error:'Indica hasta cinco tipos de cambio hipotéticos.'};
 const rates=list.map(value=>{const match=value.trim().match(/^(-?\d+(?:[.,]\d+)*)(?:\s*(?:mxn|usd|eur|gbp|cad|brl|jpy))?$/);return match?parseCommercialNumber(match[1]):NaN;});
 if(!amounts || !pair)return {error:'Indica el importe y el par, por ejemplo: pago 10000 USD; escenarios USD/MXN 18; 19; 20.'};
 if(amounts[2].toUpperCase()!==pair[1].toUpperCase())return {error:'La moneda del pago debe coincidir con la primera moneda del par; confirma la dirección de la conversión.'};
 const scenario=sanitizeFxScenarios({from:pair[1].toUpperCase(),to:pair[2].toUpperCase(),amount:parseCommercialNumber(amounts[1]),rates});
 return scenario?{scenario}:{error:'Importe o tipos de cambio fuera de rango; usa valores positivos y una sola convención de cotización.'};
}
function fxScenarioReply(scenario){
 const safe=sanitizeFxScenarios(scenario);if(!safe)return 'No hay un ejercicio cambiario válido para calcular.';
 const format=value=>Number(value).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:6});
 if(safe.selected){const rate=safe.rates[safe.selected-1];return `**Escenario ${safe.selected} seleccionado:** pago de ${format(safe.amount)} ${safe.from} × ${format(rate)} ${safe.to} por ${safe.from} = **${format(safe.amount*rate)} ${safe.to}**. Es un supuesto del ejercicio, sin comisiones ni costos financieros; no es una cotización ni un pronóstico.`;}
 return `**Pago hipotético de ${format(safe.amount)} ${safe.from}.** Tipos en ${safe.to} por ${safe.from}.\n\n| Esc. | Tipo supuesto | Pago (${safe.to}) |\n| --- | --- | --- |\n`+safe.rates.map((rate,index)=>`| ${index+1} | ${format(rate)} | ${format(safe.amount*rate)} |`).join('\n')+'\n\nCálculo: importe × tipo de cambio. No incluye comisiones, financiación ni primas. Son supuestos aportados por ti, sin probabilidad asignada ni cotización actual. Puedes continuar con «Usa el escenario 2».';
}
module.exports={sanitizeFxScenarios,fxScenarioRequest,fxScenarioReply};
