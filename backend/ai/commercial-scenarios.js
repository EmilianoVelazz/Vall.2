'use strict';
const {normalizeForIntent}=require('./conversation-context');
const {parseCommercialInputs,calculateMargin}=require('./commercial-calculator');
const FIELDS={venta:'sellPricePerKg',compra:'buyPricePerKg',costo:'buyPricePerKg',merma:'shrinkFraction',flete:'freight'};
const LABELS={sellPricePerKg:'Venta/kg',buyPricePerKg:'Compra/kg',shrinkFraction:'Merma',freight:'Flete del lote',freightPerKg:'Flete/kg'};
const scalar=value=>{const raw=value.trim().match(/^(-?\d+(?:[.,]\d+)*)(?:\s*(%|mxn|usd|eur|cad|brl|gbp))?(?:\s*\/\s*(kg|kilo))?$/i);return raw?{raw:raw[1],suffix:raw[2] || '',perKg:Boolean(raw[3])}:null;};
function scenarioRequest(message){
 const text=normalizeForIntent(message);
 if(!/\b(?:compara|simula|escenarios?|sensibilidad|tabla)\b/.test(text))return {requested:false,dimensions:[]};
 const markers=[...text.matchAll(/\b(?:precio de )?(venta|compra|merma|flete|costo)\s*(?:(?:(?:a|de|en|con|es|precios?)\b|:)\s*){0,3}/g)],dimensions=[];
 for(let i=0;i<markers.length;i++){
  const match=markers[i],end=markers[i+1]?.index || text.length;
  const tail=text.slice(match.index+match[0].length,end).split(/\b(?:mant[eé]n|conserva|manteniendo|sin cambiar|con los demas|con el resto)\b/)[0].replace(/[.?!]\s*$/,'').trim().replace(/[,;]\s*$/,'');
  // Parse each named variable separately: a second percentage must not be
  // silently discarded or treated as another value of the first variable.
  const relative=tail.match(/\b(sube|aumenta|incrementa|baja|cae|disminuye)\s+(\d+(?:[.,]\d+)?)\s*%/);
  if(relative){
   if(match[1]==='merma')return {requested:true,dimensions:[],reason:'Indica los porcentajes finales de merma a comparar; distingue porcentaje relativo de puntos porcentuales.'};
   const signed=(verb,value)=>(/^(?:baja|cae|disminuye)$/.test(verb)?-1:1)*Number(value.replace(',','.'));
   const deltas=[0,signed(relative[1],relative[2])];
   let rest=tail.slice(relative.index+relative[0].length),alternative;
   while((alternative=rest.match(/^\s*(?:o|y|,|;)\s*(?:(sube|aumenta|incrementa|baja|cae|disminuye)\s+)?(\d+(?:[.,]\d+)?)\s*%/))){
    deltas.push(signed(alternative[1] || relative[1],alternative[2]));
    rest=rest.slice(alternative[0].length);
   }
   if(/%/.test(rest) || deltas.length>5)return {requested:true,dimensions:[],reason:'Indica hasta cuatro variaciones porcentuales por variable, además del caso base.'};
   dimensions.push({field:FIELDS[match[1]],relativePercents:[...new Set(deltas)],currencies:[]});
   continue;
  }
  const pieces=tail.split(/[,;]\s+|\s+(?:y|o)\s+/).map(value=>value.trim()).filter(Boolean);
  if(pieces.length<2)continue;
  const numbers=pieces.map(scalar);if(numbers.some(value=>!value))return {requested:true,dimensions:[],reason:'Escribe los valores separados por punto y coma, indicando moneda por kg o porcentaje de merma.'};
  if(numbers.length>5 || dimensions.length>=2)return {requested:true,dimensions:[],reason:'Puedo comparar hasta dos variables y cinco valores por variable en una tabla.'};
  const suffix=numbers.at(-1),field=FIELDS[match[1]];
  const values=numbers.map(value=>{
   const rendered=match[1]==='merma'?`merma ${value.raw}${value.suffix || suffix.suffix}`:`${match[1]==='costo'?'compra':match[1]} a ${value.raw} ${value.suffix || suffix.suffix}${value.perKg || suffix.perKg?'/kg':''}`;
   const parsed=parseCommercialInputs(rendered),key=field==='freight' && (value.perKg || suffix.perKg)?'freightPerKg':field;
   return {key,value:parsed[key],currency:parsed.currency};
  });
  if(values.some(value=>!Number.isFinite(value.value)) || new Set(values.map(value=>value.key)).size!==1)return {requested:true,dimensions:[],reason:'No se pudo interpretar una de las unidades; indica importes por kg y la merma con %.'};
  dimensions.push({field:values[0].key,values:values.map(value=>value.value),currencies:[...new Set(values.map(value=>value.currency).filter(Boolean))]});
 }
 if(dimensions.length>2)return {requested:true,dimensions:[],reason:'Puedo comparar hasta dos variables y cinco valores por variable en una tabla.'};
 if(new Set(dimensions.map(item=>item.field)).size!==dimensions.length)return {requested:true,dimensions:[],reason:'Agrupa las variaciones de cada variable en una sola lista para evitar cambios contradictorios.'};
 if(!dimensions.length && markers.length && /\b(?:escenarios?|sensibilidad)\b/.test(text))return {requested:true,dimensions:[],reason:'Indica los valores a comparar, separados por punto y coma, con su unidad.'};
 return {requested:dimensions.length>0,dimensions};
}
function sanitizeScenarios(value){
 if(!Array.isArray(value))return [];
 return value.slice(0,25).filter(item=>item && typeof item.label==='string' && item.patch && typeof item.patch==='object').map(item=>({label:item.label.replace(/[|\r\n]/g,' ').slice(0,150),patch:Object.fromEntries(Object.entries(item.patch).filter(([key,val])=>Object.hasOwn(LABELS,key) && typeof val==='number' && Number.isFinite(val) && Math.abs(val)<=1e12))})).filter(item=>Object.keys(item.patch).length);
}
function selectScenario(message,options){const match=normalizeForIntent(message).match(/\b(?:usa|elige|selecciona|conserva|aplica)\s+(?:(?:el|la)\s+)?(?:escenario\s+)?(\d{1,2}|primero|primer|segundo|tercero|cuarto|quinto)\b/);if(!match)return null;const number=({primero:1,primer:1,segundo:2,tercero:3,cuarto:4,quinto:5})[match[1]] || Number(match[1]);return {number,option:sanitizeScenarios(options)[number-1] || null};}
function calculateScenarios(request,inputs){
 if(request.reason)return {available:false,reason:request.reason};
 if(!request.dimensions.length)return {available:false,reason:'Indica qué valores de venta, compra, merma o flete quieres comparar.'};
 const currencies=[...new Set(request.dimensions.flatMap(item=>item.currencies || []))];
 if(currencies.length>1 || currencies.length && currencies[0]!==inputs.currency)return {available:false,reason:'Los escenarios deben usar la moneda del caso base; falta una conversión documentada.'};
 const resolvedDims=[];
 for(const dimension of request.dimensions){
  if(Array.isArray(dimension.relativePercents)){
   const key=dimension.field==='freight' && inputs.freightPerKg!=null && inputs.freight==null?'freightPerKg':dimension.field;
   const base=inputs[key];
   if(!Number.isFinite(base))return {available:false,reason:'Indica el valor base numérico para calcular las variaciones porcentuales.'};
   resolvedDims.push({field:key,values:dimension.relativePercents.map(p=>Number((base*(1+p/100)).toFixed(4)))});
  }else{
   resolvedDims.push(dimension);
  }
 }
 let patches=[{}];for(const dimension of resolvedDims)patches=patches.flatMap(patch=>dimension.values.map(value=>({...patch,[dimension.field]:value})));
 if(patches.length>25)return {available:false,reason:'La combinación supera 25 escenarios; reduce el número de valores.'};
 const rows=patches.map((patch,index)=>{const current={...inputs,...patch};if(Object.hasOwn(patch,'freightPerKg'))delete current.freight;if(Object.hasOwn(patch,'freight'))delete current.freightPerKg;return {number:index+1,patch,calculation:calculateMargin(current)};});
 const invalid=rows.find(row=>!row.calculation.available);if(invalid)return {available:false,reason:`Escenario ${invalid.number}: ${invalid.calculation.reason}`};
 return {available:true,rows,currency:inputs.currency,perKgBasis:rows[0].calculation.perKgBasis,options:rows.map(row=>({label:`Escenario ${row.number}`,patch:row.patch}))};
}
function scenarioReply(result){
 if(!result.available)return result.reason+' No se calculó una comparación con supuestos incompletos.';
 const format=value=>Number(value).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}),fields=Object.keys(result.rows[0].patch),amount=result.perKgBasis?'Resultado/kg':'Resultado';
 return `**Comparación con tus supuestos (${result.currency}).**\n\n| Esc. | ${fields.map(field=>LABELS[field]).join(' | ')} | ${amount} | Margen % |\n| --- | ${fields.map(()=>'---').join(' | ')} | --- | --- |\n`+result.rows.map(row=>`| ${row.number} | ${fields.map(field=>format(row.patch[field]*(field==='shrinkFraction'?100:1))+(field==='shrinkFraction'?'%':'')).join(' | ')} | ${format(result.perKgBasis?row.calculation.profitPerKg:row.calculation.profit)} | ${format(row.calculation.marginOnSalePercent)}% |`).join('\n')+`\n\nEl margen se expresa sobre venta; el resultado corresponde ${result.perKgBasis?'a cada kg vendible':'al lote'}. Cada fila cambia únicamente las variables mostradas. Son escenarios hipotéticos, sin probabilidades asignadas; los gastos no indicados siguen excluidos. El caso base se conserva. Para continuar con una fila puedes indicar «Usa el escenario 2».`;
}
module.exports={scenarioRequest,calculateScenarios,scenarioReply,sanitizeScenarios,selectScenario};
