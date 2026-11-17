'use strict';
const {normalizeForIntent,isLikelyFollowUp,visibleTurns}=require('./conversation-context');
const {sanitizeFxScenarios}=require('./fx-scenarios');
const DOMAINS=['fx','bonds','equities'];
const ASSET=/^(?:(?:USD|MXN|EUR|GBP|CAD|BRL|JPY)\/(?:USD|MXN|EUR|GBP|CAD|BRL|JPY)|\^?[A-Z][A-Z0-9.-]{0,14}|S&P 500)$/;
const COUNTRIES=[['MX',/\bmexico\b/],['US',/\b(?:estados unidos|eeuu|usa)\b/],['BR',/\bbrasil\b/],['CA',/\bcanada\b/],['DE',/\balemania\b/],['FR',/\bfrancia\b/],['ES',/\bespana\b/],['IT',/\bitalia\b/],['GB',/\b(?:reino unido|gran bretana)\b/],['JP',/\bjapon\b/],['CN',/\bchina\b/],['EU',/\b(?:europa|eurozona)\b/]];
const text=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max):'';
function sanitizeMarketMemory(value){
 if(!value || !DOMAINS.includes(value.domain))return null;
 const anchor=text(value.anchor,1200);if(!anchor)return null;
 const list=(items,valid,max)=>Array.isArray(items)?[...new Set(items.filter(valid))].slice(0,max):[];
 return {domain:value.domain,anchor,assets:list(value.assets,item=>typeof item==='string' && ASSET.test(item),8),countries:list(value.countries,item=>COUNTRIES.some(([code])=>code===item),12),period:text(value.period,160),horizon:text(value.horizon,100),objective:text(value.objective,200),format:['table','brief','detailed','executive','technical'].includes(value.format)?value.format:null,refinements:Array.isArray(value.refinements)?value.refinements.filter(item=>typeof item==='string').slice(-6).map(item=>text(item,240)):[],fxScenarios:value.domain==='fx'?sanitizeFxScenarios(value.fxScenarios):null};
}
function domainFor(message){
 const value=normalizeForIntent(message);
 if(/\b(?:usd|eur|gbp|mxn|brl|cad|jpy)\s*[/-]\s*(?:usd|eur|gbp|mxn|brl|cad|jpy)\b|\b(?:divisas?|forex|tipo de cambio|dolar|forward)\b/.test(value))return 'fx';
 if(/\b(?:bonos?|renta fija|cetes|udibonos?|treasur(?:y|ies)|bund|rendimientos? soberanos?)\b/.test(value))return 'bonds';
 if(/\b(?:acciones?|bolsa|bursatil|nasdaq|ipc|sp500|s&p|ticker|etfs?|portafolio|cartera|tsn|jbs|brf)\b/.test(value))return 'equities';
 return null;
}
function updateMemory(previous,message,history){
 const value=normalizeForIntent(message),domain=domainFor(message);
 const follow=Boolean(previous && isLikelyFollowUp(message,[{role:'user',content:previous.anchor},...history]));
 if(!domain && !follow)return null;
 let state=previous && follow && (!domain || domain===previous.domain)?{...previous,assets:[...previous.assets],countries:[...previous.countries],refinements:[...previous.refinements]}:null;
 if(!state){if(!domain)return null;state={domain,anchor:text(message,1200),assets:[],countries:[],period:'',horizon:'',objective:'',format:null,refinements:[]};}
 const assets=[...message.matchAll(/\b(?:USD|EUR|GBP|MXN|BRL|CAD|JPY)\s*[/-]\s*(?:USD|EUR|GBP|MXN|BRL|CAD|JPY)\b/gi)].map(match=>match[0].replace(/\s/g,'').replace('-','/').toUpperCase());
 for(const [name,pattern]of [['CETES',/\bcetes\b/],['TREASURY',/\btreasur(?:y|ies)\b/],['BUND',/\bbund\b/],['S&P 500',/\bs&p\s*500\b/],['NASDAQ',/\bnasdaq\b/],['IPC',/\bipc\b/]])if(pattern.test(value))assets.push(name);
 if(state.domain==='equities')for(const match of message.matchAll(/(?:\$|\bticker\s+)([A-Z][A-Z0-9.-]{0,9})\b/g))assets.push(match[1]);
 const countries=COUNTRIES.filter(([,pattern])=>pattern.test(value)).map(([code])=>code);
 const add=/\b(?:agrega|incluye|tambien|suma|incorpora|comparalo con|compara con)\b/.test(value);
 if(assets.length){if(!add && assets.join('|')!==state.assets.join('|'))state.fxScenarios=null;state.assets=add?[...state.assets,...assets]:assets;}
 if(countries.length)state.countries=add?[...state.countries,...countries]:countries;
 const period=value.match(/\b(?:desde|durante|en|del?)\s+(?:20\d{2}(?:-\d{2}-\d{2})?(?:\s+(?:hasta|a|al)\s+(?:20\d{2}(?:-\d{2}-\d{2})?|hoy|la fecha))?|(?:el\s+)?ultimo\s+(?:ano|mes|trimestre))\b/);
 const end=value.match(/\b(?:hasta|al)\s+(20\d{2}(?:-\d{2}-\d{2})?|hoy|la fecha)\b/);
 const horizon=value.match(/\b(?:a|en|para|plazo(?: de)?)\s+(?:\d{1,3}|un|una|dos|tres|cinco|seis|doce)\s+(?:dias?|sesiones?|semanas?|meses?|anos?)\b/);
 if(period)state.period=period[0];else if(end){const start=state.period.match(/\b(?:desde|del?)\s+20\d{2}(?:-\d{2}-\d{2})?/);state.period=(start?start[0]+' ':'')+'hasta '+end[1];}if(horizon)state.horizon=horizon[0];
 if(/\b(?:pago|pagar|cobertura|cubrir|importador|exportador|liquidez|inversion|conservador|presupuesto)\b/.test(value))state.objective=text(message,200);
 if(/\b(?:pago|pagar|debo|importe)\s+\d/.test(value))state.fxScenarios=null;
 if(/\btabla\b/.test(value))state.format='table';else if(/\b(?:amplia|detalla|profundiza)\b/.test(value))state.format='detailed';else if(/\b(?:breve|resume|una frase)\b/.test(value))state.format='brief';else if(/\btecnico\b/.test(value))state.format='technical';else if(/\bejecutivo\b/.test(value))state.format='executive';
 if(follow && !/^(?:perfecto|gracias|ok|vale|entendido)[.!\s]*$/.test(value))state.refinements.push(text(message,240));
 return sanitizeMarketMemory(state);
}
function prepareMarketMemory({message,history=[],memory=null}){
 let state=sanitizeMarketMemory(memory);
 if(!state){const prior=[];for(const turn of visibleTurns(history,80).filter(turn=>turn.role==='user')){state=updateMemory(state,turn.text,prior);prior.push(turn);}}
 const followUp=Boolean(state && isLikelyFollowUp(message,[{role:'user',content:state.anchor},...history]));
 return {memory:updateMemory(state,String(message || ''),history),followUp};
}
function marketMemorySummary(memory){const safe=sanitizeMarketMemory(memory);return safe?'[CONDICIONES FINANCIERAS APORTADAS POR EL USUARIO]\n'+JSON.stringify(safe)+'\nConserva las condiciones no sustituidas; la solicitud actual prevalece. Esta memoria no acredita precios actuales, noticias ni resultados del mercado.':'';}
module.exports={sanitizeMarketMemory,prepareMarketMemory,marketMemorySummary};
