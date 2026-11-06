// Derived exclusively from the report's dated observations. Physical prices
// never inherit the history, returns or pricing basis of a futures contract.
const contracts=['HE=F','LE=F','GF=F'];
const finite=Number.isFinite;
const number=value=>value.toLocaleString('es-MX',{maximumFractionDigits:3});
const change=value=>(value>0 ? '↑ +' : value<0 ? '↓ ' : '→ ')+number(value)+' %';

function buildIndexedLineChart(refs,title,noteText,{t,executiveLead=false,requiredInPrint=false,proteinShowcase=false}={}){
 if(refs.length<2)return null;
 const common=refs[0].points.filter(point=>point.date>='2020-01-01' && point.value>0 && refs.every(item=>item.points.some(other=>other.date===point.date && other.value>0))).map(point=>point.date);
 const baseDate=common[0],lastDate=common.at(-1);
 if(common.length<2 || !baseDate?.startsWith('2020-'))return null;
 const series=refs.map(item=>{
  const base=item.points.find(point=>point.date===baseDate).value;
  return {label:t(item.label),points:item.points.filter(point=>point.date>=baseDate && point.date<=lastDate).map(point=>({date:point.date,value:point.value/base*100}))};
 });
 return {
  type:'line',
  title:t(title),
  unit:t('Índice base 100'),
  indexBaseDate:baseDate,
  indexEndDate:lastDate,
  commodityWindow:'history',
  proteinHistorical:true,
  proteinShowcase,
  financePalette:true,
  dataInTables:true,
  executiveLead,
  requiredInPrint,
  series,
  note:t('Base 100 en una fecha común observada: ')+baseDate+' / '+lastDate+'. '+t(noteText),
 };
}

export function proteinHistoricalComparison(model,{t=value=>value}={}){
 const bySymbols=symbols=>model.references.filter(item=>symbols.includes(item.symbol) && item.points.some(point=>point.date.startsWith('2020-'))).toSorted((a,b)=>symbols.indexOf(a.symbol)-symbols.indexOf(b.symbol));
 const references=bySymbols(contracts);
 const charts=[],tables=[],annexTables=[],summaryParts=[];
 const usChart=buildIndexedLineChart(
  references,
  'Proteínas de Estados Unidos · evolución comparada desde 2020',
  'Compara trayectorias de futuros de cerdo, ganado vivo y ganado de engorda; no precios físicos ni productos intercambiables. Se conserva el cambio de contrato de cada serie continua. La historia antigua contiene muestras mensuales, no promedios anuales; no se rellenan días ni años.',
  {t,executiveLead:charts.length===0,requiredInPrint:true,proteinShowcase:true}
 );
 if(usChart){
  charts.push(usChart);
  summaryParts.push(t('Cambio desde la base común de')+' '+usChart.indexBaseDate+' '+t('hasta')+' '+usChart.indexEndDate+': '+usChart.series.map(item=>item.label+' '+change(item.points.at(-1).value-100)).join('; ')+'. '+t('Variación de la referencia de futuros; no equivale a rentabilidad de una inversión ni al precio físico de compra.'));
 }

 const summary=summaryParts.length ? {heading:t('Perspectiva desde 2020'),body:summaryParts.join(' ')} : null;
 const rank=item=>contracts.includes(item.symbol) ? contracts.indexOf(item.symbol) : 99;
 const comparisons=(model.yearComparisons || []).filter(item=>item.values.length>1).map(item=>({...item,values:item.values.filter(point=>point.year>=2020 && finite(point.value) && point.value>0).toSorted((a,b)=>a.year-b.year)})).filter(item=>item.values.length>1).toSorted((a,b)=>rank(a)-rank(b) || a.label.localeCompare(b.label,'es'));
 if(comparisons.length){
  const years=[...new Set(comparisons.flatMap(item=>item.values.map(point=>point.year)))].sort((a,b)=>a-b);
  const dates=Object.fromEntries(years.map(year=>[year,[...new Set(comparisons.flatMap(item=>item.values.filter(point=>point.year===year).map(point=>point.date)))]]));
  tables.push({
   title:t('Proteínas · precios comparables por año desde 2020'),
   proteinHistoryTable:true,
   printDateColumns:true,
   printDateNote:t('Cada columna muestra el precio observado hasta la misma fecha calendario de cada año. Las fechas distintas se conservan junto al valor.'),
   columns:[t('Referencia / unidad'),...years.map(String)],
   rows:comparisons.map(item=>[
    t(item.label)+'\n'+item.unit,
    ...years.map(year=>{const point=item.values.find(point=>point.year===year);return point ? number(point.value)+'\n'+point.date : null;}),
   ]),
   note:t('Última publicación hasta la fecha equivalente del último dato de cada referencia, con la tolerancia de su frecuencia. No son promedios anuales ni cierres de diciembre. Las unidades originales se mantienen; no se traslada la historia de futuros a precios físicos.'),
  });
  const selectedYearCharts=comparisons.slice(0,12);
  for(const item of selectedYearCharts){
   const last=item.last,earlier=item.values.filter(point=>point.year<Number(last.date.slice(0,4)));
   charts.push({type:'bar',title:t(item.label)+' · '+t('precios comparables por año'),unit:item.unit,commodityWindow:'years',proteinHistoryReference:t(item.label),proteinHistorical:true,financePalette:true,dataInTables:true,displayDigits:2,bars:item.values.map(point=>({label:String(point.year),value:point.value,date:point.date})),note:t('Un precio por año a la misma altura del calendario, no un promedio anual. Las fechas exactas están en la tabla histórica. Última observación: ')+last.date+'.'});
   if(earlier.length)charts.push({type:'bar',title:t(item.label)+' · '+t('último precio frente a años anteriores'),unit:'%',sessionMovement:true,commodityWindow:'yearChange',proteinHistoryReference:t(item.label),proteinHistorical:true,financePalette:true,dataInTables:true,displayDigits:2,bars:earlier.map(point=>({label:String(point.year),value:(last.value/point.value-1)*100,date:point.date})),note:t('Cada barra compara el último precio con la observación del año indicado; no es el rendimiento de ese año. Valores positivos: el último precio es mayor. Valores negativos: es menor. Última observación: ')+last.date+'.'});
  }
  annexTables.push({title:t('Proteínas · detalle numérico de la comparación histórica'),columns:['Referencia','Unidad original','Año','Precio de referencia','Fecha de referencia','Último precio','Fecha del último precio','Último frente a referencia · %','Fuente'].map(t),rows:comparisons.flatMap(item=>item.values.map(point=>[t(item.label),item.unit,point.year,point.value,point.date,item.last.value,item.last.date,(item.last.value/point.value-1)*100,item.source])),note:t('Cálculo: (último precio / precio de referencia − 1) × 100. Las observaciones y sus fechas se conservan sin redondear en este respaldo.')});
  charts.sort((a,b)=>({history:0,years:1,yearChange:2}[a.commodityWindow])-({history:0,years:1,yearChange:2}[b.commodityWindow]));
  return {charts,tables,annexTables,summary,years,dates};
 }
 return {charts,tables,annexTables,summary,years:[],dates:{}};
}
