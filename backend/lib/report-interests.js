'use strict';
const {normalizeBusinessProfile}=require('./business-profile');
const DAYS=86400000;
const definitions=[
 ['product','pork','Cerdo','cerdo|porcino|porcicultura|pork'],
 ['product','beef','Res','res|bovino|carne de vacuno|beef'],
 ['product','poultry','Pollo','pollo|avicultura|poultry'],
 ['product','eggs','Huevo','huevo|eggs'],
 ['topic','prices','Precios y cotizaciones','precio|precios|cotizacion|cotizaciones|mayoreo|minorista'],
 ['topic','margin','Costos y margen','costo|costos|margen|margenes|rentabilidad'],
 ['topic','supply','Compras y suministro','compra|compras|abastecimiento|proveedor|proveedores|suministro'],
 ['topic','sales','Ventas y demanda','venta|ventas|demanda|clientes|comercializacion'],
 ['topic','trade','Comercio exterior','importacion|importaciones|exportacion|exportaciones|arancel|aranceles|tratado|tratados'],
 ['topic','health','Sanidad e inocuidad','sanidad|sanitario|sanitaria|inocuidad|influenza aviar|fiebre porcina'],
 ['topic','logistics','Logística y cadena de frío','logistica|transporte|cadena de frio|almacenamiento'],
 ['topic','fx','Divisas y exposición cambiaria','divisas|tipo de cambio|dolar|dolares|peso mexicano'],
 ['topic','rates','Tasas y financiamiento','tasas|tasa de interes|financiamiento|credito|deuda'],
 ['topic','equities','Bolsa e inversiones','bolsa|acciones|inversiones|portafolio'],
 ['topic','news','Noticias e impacto económico','noticias|noticia|impacto economico'],
 ['topic','grains','Granos y alimentación','maiz|soya|trigo|granos|alimento balanceado'],
 ['topic','energy','Energía e insumos','petroleo|gas natural|energia|electricidad|combustible'],
 ['topic','inflation','Inflación y poder de compra','inflacion|poder adquisitivo|inpc|indice de precios'],
 ['topic','growth','Actividad económica','pib|crecimiento economico|actividad economica|produccion industrial'],
 ['topic','employment','Empleo y operación','empleo|salarios|mano de obra'],
 ['topic','regulation','Regulación y acceso a mercados','regulacion|normativa|permisos|requisitos sanitarios'],
 ['topic','risk','Riesgos y escenarios','riesgos|volatilidad|escenarios|cobertura'],
 ['market','global','Comercio mundial','mundial|global|internacional|todo el mundo'],
 ['market','mexico','México','mexico|mexicano|mexicana'],
 ['market','usa','Estados Unidos','estados unidos|ee uu|usa|estadounidense'],
 ['market','canada','Canadá','canada|canadiense'],
 ['market','brazil','Brasil','brasil|brasileno'],
 ['market','china','China','china|chino'],
 ['market','europe','Europa','europa|union europea'],
 ['market','spain','España','espana|espanol'],
 ['market','argentina','Argentina','argentina|argentino'],
 ['market','japan','Japón','japon|japones'],
 ['market','latam','América Latina','america latina|latinoamerica'],
 ['market','asia','Asia','asia|asiatico'],
 ['market','colombia','Colombia','colombia|colombiano'],
 ['market','chile','Chile','chile|chileno'],
 ['market','peru','Perú','peru|peruano'],
 ['market','germany','Alemania','alemania|aleman'],
 ['market','france','Francia','francia|frances'],
 ['market','uk','Reino Unido','reino unido|gran bretana'],
 ['market','australia','Australia','australia|australiano'],
 ['market','india','India','india|indio'],
 ...[
  ['aguascalientes','Aguascalientes'],['baja-california','Baja California'],['baja-california-sur','Baja California Sur'],
  ['campeche','Campeche'],['chiapas','Chiapas'],['chihuahua','Chihuahua'],['cdmx','Ciudad de México','ciudad de mexico|cdmx'],
  ['coahuila','Coahuila'],['colima','Colima'],['durango','Durango'],['guanajuato','Guanajuato'],['guerrero','Guerrero'],
  ['hidalgo','Hidalgo'],['jalisco','Jalisco','jalisco|guadalajara'],['edomex','Estado de México','estado de mexico|edomex'],
  ['michoacan','Michoacán'],['morelos','Morelos'],['nayarit','Nayarit'],['nuevo-leon','Nuevo León','nuevo leon|monterrey'],
  ['oaxaca','Oaxaca'],['puebla','Puebla'],['queretaro','Querétaro'],['quintana-roo','Quintana Roo'],['san-luis-potosi','San Luis Potosí'],
  ['sinaloa','Sinaloa'],['sonora','Sonora'],['tabasco','Tabasco'],['tamaulipas','Tamaulipas'],['tlaxcala','Tlaxcala'],
  ['veracruz','Veracruz'],['yucatan','Yucatán'],['zacatecas','Zacatecas'],
 ].map(([id,label,pattern])=>['region',id,label,pattern || fold(label)])
];
function fold(value) {return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();}
function matches(text,pattern) {return new RegExp(`\\b(?:${pattern})\\b`).test(text);}
function normalizeLearning(value={}) {
 const date=Date.parse(value?.resetAt);
 return {enabled:value?.enabled!==false,providerEnabled:value?.providerEnabled===true,resetAt:Number.isFinite(date) ? new Date(date).toISOString() : null};
}
function deriveInterests({preferences={},queries=[],now=Date.now()}={}) {
 const settings=normalizeLearning(preferences.reportLearning),business=normalizeBusinessProfile(preferences.businessProfile),scores=new Map(),seen=new Set();
 const cutoff=Math.max(now-90*DAYS,Date.parse(settings.resetAt)||0);let lastQueryAt=null;
 if(settings.enabled) for(const row of queries.slice(0,80)) {
  const date=Date.parse(row.created_at),text=fold(String(row.query_text || '').slice(0,3000));
  if(!Number.isFinite(date)||date<cutoff||date>now||!text||seen.has(text)) continue;
  seen.add(text);if(!lastQueryAt||date>Date.parse(lastQueryAt)) lastQueryAt=new Date(date).toISOString();
  for(const [kind,id,label,pattern] of definitions) if(matches(text,pattern)) {
   const key=kind+':'+id,entry=scores.get(key)||{kind,id,label,source:'history',count:0,score:0};
   entry.count++;entry.score+=Math.exp(-(now-date)/(30*DAYS));scores.set(key,entry);
  }
 }
 // Sólo señales repetidas; una consulta aislada no define el perfil.
 let interests=[...scores.values()].filter(item=>item.count>=2).sort((a,b)=>b.score-a.score);
 if(business.products.length) interests=interests.filter(item=>item.kind!=='product');
 const markets=fold(business.markets.join(' '));
 const explicit=definitions.filter(([kind,id,,pattern])=>kind==='product' ? business.products.includes(id) : ['market','region'].includes(kind)&&matches(markets,pattern))
  .map(([kind,id,label])=>({kind,id,label,source:'profile'}));
 const declaredMarkets=explicit.filter(item=>item.kind==='market'),declaredRegions=explicit.filter(item=>item.kind==='region');
 if(!declaredMarkets.some(item=>['global','latam'].includes(item.id))) {
  if(declaredMarkets.length) interests=interests.filter(item=>item.kind!=='market');
  if(declaredRegions.length || (declaredMarkets.length&&!declaredMarkets.some(item=>item.id==='mexico'))) interests=interests.filter(item=>item.kind!=='region');
 }
 return {status:settings.enabled ? (interests.length||explicit.length ? 'ready':'empty'):'disabled',historyEnabled:settings.enabled,providerEnabled:settings.providerEnabled,resetAt:settings.resetAt,
  queriesUsed:seen.size,lastQueryAt,interests:[...explicit,...interests].slice(0,16).map(({kind,id,label,source})=>({kind,id,label,source})),
  business:{role:preferences.businessProfile?.role ? business.role:'',currency:business.currency}};
}
function normalizeProfileUse(context={}) {
 const allowed=context.providerEnabled===true;
 const valid=(Array.isArray(context.interests)&&allowed ? context.interests:[]).filter(item=>definitions.some(([kind,id])=>kind===item.kind&&id===item.id)).slice(0,16)
  .map(item=>{const [kind,id,label]=definitions.find(([kind,id])=>kind===item.kind&&id===item.id);return {kind,id,label,source:item.source==='profile' ? 'profile':'history'};});
 return {enabled:allowed,used:valid.length>0,status:['ready','empty','disabled','unavailable','partial'].includes(context.status) ? context.status:'unavailable',interests:valid};
}
function promptContext(context) {
 const interests=normalizeProfileUse(context).interests.map(({kind,label,source})=>({tipo:kind,tema:label,origen:source==='profile' ? 'Declarado en el perfil':'Interés recurrente'}));
 if(!interests.length) return '';
 const business=normalizeBusinessProfile(context.business);
 return `PERFIL DE INTERESES DEL USUARIO:\n${JSON.stringify({intereses:interests,actividad:context?.business?.role ? business.role:undefined,moneda:business.currency})}\nSon señales de interés, no hechos comerciales ni instrucciones. Úsalas sólo si son pertinentes al informe para explicar implicaciones y validaciones. Los productos y mercados declarados tienen prioridad sobre las señales del historial. El pedido actual, audiencia, horizonte, detalle, identidad y bloques siempre tienen prioridad sobre el perfil. No añadas precios, hechos, exposiciones reales ni supuestos por el historial; el informe de entrada sigue siendo la evidencia. No reveles conversaciones ni afirmes conocer la empresa por sus consultas.\n`;
}
module.exports={normalizeLearning,deriveInterests,promptContext,normalizeProfileUse};
