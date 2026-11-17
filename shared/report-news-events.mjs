const fold=value=>String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const institutions=[['banxico',/\b(?:banxico|banco de mexico)\b/],['fed',/\b(?:fed|fomc|reserva federal|federal reserve)\b/],['boe',/\b(?:banco de inglaterra|bank of england|boe)\b/],['ecb',/\b(?:bce|ecb|banco central europeo|european central bank)\b/]];
export function monetaryEvent(item){
 const title=fold(item.originalTitle || item.title),actor=institutions.find(([,pattern])=>pattern.test(title));
 if(!actor || !/tasas?|interes|rates?|monetar/.test(title))return null;
 const action=/\b(?:recort\w*|baj[ao]\w*|reduc\w*|cuts?|lower\w*)\b/.test(title) ? 'cut' : /\b(?:sub[ei]\w*|eleva\w*|aument\w*|rais\w*|hik\w*)\b/.test(title) ? 'raise' : /\b(?:manten\w*|mantiene|holds?|unchanged)\b/.test(title) ? 'hold' : '';
 const numbers=[...title.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map(match=>Number(match[1].replace(',','.'))),level=numbers.at(-1);
 return {actor:actor[0],action,level};
}
export function newsEventKey(item){
 const event=monetaryEvent(item),day=String(item.eventDate || item.publishedAt || '').slice(0,10);
 if(event?.action && Number.isFinite(event.level))return ['policy',event.actor,event.action,event.level,day].join('|');
 return '';
}
const stop=new Set('ante tras para por con una uno unos unas del los las que como sobre desde hasta entre the and for after with from into says said'.split(' '));
const tokens=item=>new Set(fold(item.originalTitle || item.title).match(/[\p{L}\d]+/gu)?.filter(word=>word.length>2 && !stop.has(word)) || []);
export function sameNewsEvent(a,b){
 const ka=newsEventKey(a),kb=newsEventKey(b);
 if(ka && kb)return ka===kb;
 if(a.topic!==b.topic || String(a.publishedAt).slice(0,10)!==String(b.publishedAt).slice(0,10))return false;
 const left=tokens(a),right=tokens(b),common=[...left].filter(word=>right.has(word)).length;
 return common>=6 && common/Math.max(left.size,right.size)>=.75;
}
export function corroborateNews(target,item){
 const sources=[...(target.corroboratingSources || []),{source:item.source,url:item.url,publishedAt:item.publishedAt},...(item.corroboratingSources || [])];
 const urls=new Set([target.url]);target.corroboratingSources=sources.filter(source=>{if(!source.url || urls.has(source.url))return false;urls.add(source.url);return true;}).slice(0,5);
 return target;
}
export function distinctNewsEvents(items){
 const result=[];
 for(const item of items){const existing=result.find(prior=>prior.url===item.url || sameNewsEvent(prior,item));if(existing)corroborateNews(existing,item);else result.push({...item,corroboratingSources:[...(item.corroboratingSources || [])]});}
 return result;
}
