// Classify explicit publisher labels only; a date alone does not prove cadence.
export function reportReferenceStatus(value){
 const text=String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/por corroborar|pendiente de corroboracion|unverified/.test(text))return 'pending';
 if(/consulta conservada|dato conservado|preserved/.test(text))return 'preserved';
 for(const [kind,words]of [['monthly','mensual|monthly'],['weekly','semanal|weekly'],['daily','diaria|diario|daily'],['annual','anual|annual']]){
  const explicit=new RegExp('(?:^|[\\n·])\\s*(?:'+words+')\\s*(?:$|[\\n·])|\\((?:fuente )?(?:'+words+')\\)|\\b(?:fuente|publicacion|frecuencia)\\s+(?:'+words+')\\b');
  if(explicit.test(text))return kind;
 }
 return '';
}
