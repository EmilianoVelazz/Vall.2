// Species panels use one physical reference at a time. Original currencies,
// commercial stages, cadence and observation dates remain unchanged.
const DAY=86400000;
export const PROTEIN_PRICE_PANELS=[
 {sector:'Porcino',label:'Cerdo',preferred:['AMS-PORK-CUTOUT','MX-PORK-AGS-MIN','QC-PORK-GLOBAL']},
 {sector:'Vacuno',label:'Res',preferred:['AMS-BEEF-CHOICE','MX-BEEF-AGS-MIN','AR-CATTLE-0']},
 {sector:'Huevo',label:'Huevo',preferred:['USDA-EGG-NATIONAL-INDEX','USDA-EGG-MIDWEST-CARTON','MX-EGG-AGS']},
];
export function proteinSpeciesPriceCharts(references,{t=value=>value}={}){
 return PROTEIN_PRICE_PANELS.flatMap(({sector,label,preferred})=>{
  const eligible=references.filter(item=>item.sector===sector && item.evidenceOrigin!=='catalog' && ['verified','preserved'].includes(item.quoteStatus) && !/futuro|serie continua/i.test(item.basis || '') && !/=F$/.test(item.symbol || ''));
  const rank=item=>{const index=preferred.indexOf(item.symbol);return index<0 ? 100 : index;};
  const reference=eligible.toSorted((a,b)=>rank(a)-rank(b) || b.points.length-a.points.length)[0];if(!reference)return [];
  const last=reference.points.at(-1),points=reference.points.filter(point=>point.value>0 && Date.parse(last.date)-Date.parse(point.date)<=185*DAY);if(!points.length)return [];
  const span=points[0].date+' / '+last.date,rolling=/índice móvil|promedio móvil/i.test(reference.basis || ''),cadence=({daily:'Diaria',weekly:'Semanal',monthly:'Mensual'})[reference.cadence] || reference.cadence;
  const identity=t(reference.label),title=t(label+' · precios físicos publicados')+' · '+identity;
  const note=t('Referencia')+': '+identity+'. '+t('Frecuencia')+': '+t(cadence)+'. '+span+'. '+(rolling ? t('Índice móvil de cinco días publicado diariamente; no es precio spot de una jornada.')+' ' : '')+t('Conserva moneda, unidad y etapa comercial. No se traslada la historia de futuros a este precio físico.');
  const common={title,unit:reference.unit,cadence:reference.cadence,proteinSpecies:sector,proteinPriceReference:identity,proteinChart:true,proteinUnitedStates:reference.country==='Estados Unidos',commodityWindow:'species',financePalette:true,dataInTables:true,requiredInPrint:true,note};
  return [points.length>=3 ? {...common,type:'line',series:[{label:identity,points}]} : {...common,type:'bar',bars:points.map(point=>({label:point.date,value:point.value,date:point.date})),note:note+' '+t(points.length===1 ? 'Una observación publicada: nivel de precio, sin tendencia calculada.' : 'Dos publicaciones fechadas: se muestran como barras, sin inferir una tendencia.')}];
 });
}
export function proteinSpeciesPriceTables(references,{t=value=>value}={}){
 return proteinSpeciesPriceCharts(references,{t}).map(chart=>{
  const points=chart.type==='line' ? chart.series[0].points : chart.bars,rows=points.slice(-5).map(point=>[point.date,point.value.toLocaleString('es-MX',{maximumFractionDigits:3})]);
  return {title:t(({Porcino:'Cerdo',Vacuno:'Res',Huevo:'Huevo'})[chart.proteinSpecies]+' · últimas publicaciones de precios'),proteinSpeciesPrices:true,proteinSpecies:chart.proteinSpecies,proteinPriceReference:chart.proteinPriceReference,proteinProtectedCoverage:true,proteinRequiredRows:rows.map(row=>row[0]),printGroup:'protein-species-prices',market:chart.proteinSpecies,unit:chart.unit,columns:['Fecha de publicación','Precio · '+chart.unit].map(t),rows,note:chart.proteinPriceReference+'. '+t('Precios originales publicados; no son promedios del período ni una historia reconstruida.')};
 });
}
