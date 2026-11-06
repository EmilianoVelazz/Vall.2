import policy from '../../../shared/report-refresh-policy.json' with {type:'json'};
export function reportRefreshLabel(value,area,{locale='es-MX',t=text=>text}={}){
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return t(area==='markets' ? 'Mercados · actualización semanal los viernes' : 'Cortes 06:00 · 14:00');
 return t(area==='markets' ? 'Corte semanal' : 'Próximo corte')+': '+date.toLocaleString(locale,{timeZone:policy.timeZone,weekday:area==='markets' ? 'long' : undefined,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})+' · CDMX';
}
