import policy from '../../../shared/report-refresh-policy.json' with {type:'json'};
export function reportRefreshLabel(value,area,{locale='es-MX',t=text=>text}={}){
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return t(area==='markets' ? 'Mercados · corte diario 14:00' : 'Cortes 06:00 · 14:00');
 return t('Próximo corte')+': '+date.toLocaleString(locale,{timeZone:policy.timeZone,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})+' · CDMX';
}
