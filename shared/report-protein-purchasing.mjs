// Purchasing comparisons retain commercial stages: currency conversion is not
// a carcass-yield adjustment, a delivered quote or an executable arbitrage.
import {directionalChange,marketPeriods,marketEvidence} from './report-market-analysis.mjs';
import {safeReportOpenInterest} from './report-open-interest.mjs';
import {safeProteinFundamentals} from './report-protein-fundamentals.mjs';
import {proteinSpeciesPriceCharts,proteinSpeciesPriceTables} from './report-protein-species-charts.mjs';
const DAY=86400000,LB=.45359237;
const number=value=>value.toLocaleString('es-MX',{maximumFractionDigits:3});
const sectors=['Porcino','Vacuno','Pollo','Huevo','Procesados y alternativas'];
const symbol=item=>({LH0:'DCE-LH',JD0:'DCE-JD'})[item.symbol || item.ticker] || item.symbol || item.ticker || '';
const aliases={
 'MERCO-US-USDA-PORK-CUTOUT':['AMS-PORK-CUTOUT'],
 'MERCO-US-USDA-BEEF-CHOICE':['AMS-BEEF-CHOICE'],
 'MERCO-US-USDA-CHICKEN':['USDA-CHICKEN-WHOLE'],
 'MERCO-US-USDA-EGG':['USDA-EGG-MIDWEST-CARTON'],
 'MERCO-MX-SNIIM-PORK':['MX-PORK-AGS-MIN'],
 'MERCO-MX-SNIIM-BEEF':['MX-BEEF-AGS-MIN'],
 'MERCO-MX-SNIIM-CHICKEN':['MX-CHICKEN-RAYON'],
 'MERCO-MX-SNIIM-EGG':['MX-EGG-AGS'],
 'MERCO-CA-QC-PORK':['QC-PORK-GLOBAL'],
 'MERCO-AR-CANUELAS-BEEF':['AR-CATTLE-0'],
 'MERCO-BR-CEPEA-CHICKEN':['CEPEA-130'],
};
const trusted=item=>item.evidenceOrigin!=='catalog' && ['verified','preserved'].includes(item.quoteStatus);
export function preferredProteinReferences(references){
 const discarded=[],selected=references.filter(item=>{
  const alternatives=aliases[symbol(item)],direct=alternatives && references.find(other=>alternatives.includes(symbol(other)) && trusted(other));
  if(!direct)return true;
  discarded.push({item,direct});return false;
 });
 return {selected,discarded};
}
export function proteinCommercialStage(item){
 const positiveBasis=String(item.basis || '').split(/;\s*no\b|\.\s*no\b/i)[0];
 const text=(item.label+' '+positiveBasis+' '+item.unit).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/desvieje|lechon|piglet|cabeza/.test(text))return 'Recría / descarte';
 if(/=F$/.test(symbol(item)) || /futuro|serie continua/.test(item.basis || ''))return 'Futuro';
 if(/liquido|procesad/.test(text))return 'Procesado';
 if(/huevo|docena|caja/.test(text))return 'Huevo con cáscara';
 if(/minorista|consumidor|retail/.test(text))return 'Venta al público';
 if(/kg vivo|en pie|en vivo/.test((item.label+' '+item.unit).toLowerCase()) || /por kil[oó]gramo vivo|peso vivo/.test(item.basis || ''))return 'Animal vivo';
 if(/cutout|carcasa|carcass|kg canal|canal (?:porcina|bovina|de (?:cerdo|res|toros))/.test(text) || item.provider==='quebec' || item.provider==='dgagri' && ['Porcino','Vacuno'].includes(item.sector))return 'Canal';
 return 'Carne mayorista';
}
export function proteinUsdPerKg(item,fx,cutoff){
 if(!trusted(item) || ['Futuro','Recría / descarte','Venta al público'].includes(proteinCommercialStage(item)))return null;
 const date=String(item.last?.date || ''),end=Date.parse(cutoff),time=Date.parse(date);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(end) || !Number.isFinite(time) || new Date(time).toISOString().slice(0,10)!==date || time>end || end-time>({daily:7,weekly:21,monthly:70}[item.cadence] || 14)*DAY)return null;
 const match=String(item.unit).match(/^(USD|US¢|EUR|MXN|CAD|BRL|CLP|ARS|COP|PEN|CNY)\/(kg(?: vivo| canal)?|100 kg|lb|100 lb|t|arroba \(15 kg\))$/);
 if(!match || !(item.last?.value>0))return null;
 const [,currency,denominator]=match,kg=denominator==='lb' ? LB : denominator==='100 lb' ? 100*LB : denominator==='100 kg' ? 100 : denominator==='t' ? 1000 : denominator.startsWith('arroba') ? 15 : 1;
 const code=currency==='US¢' ? 'USD' : currency,rate=code==='USD' ? 1 : fx?.rates?.[code];
 if(!(rate>0) || code!=='USD' && (!fx.source || !/^https:\/\//.test(fx.url || '') || fx.base!=='USD' || fx.rates?.USD!==1 || !Number.isFinite(Date.parse(fx.observedAt)) || Date.parse(fx.observedAt)>Date.parse(cutoff) || Date.parse(cutoff)-Date.parse(fx.observedAt)>3*DAY))return null;
 const value=item.last.value/(currency==='US¢' ? 100 : 1)/rate/kg;
 return Number.isFinite(value) ? {value,kg,rate,code,fxDate:code==='USD' ? null : fx.observedAt.slice(0,10)} : null;
}
const frequency=item=>({daily:'Diaria',weekly:'Semanal',monthly:'Mensual',auction:'Subasta'})[item.cadence] || item.cadence;
function indexed(items,title,window){
 if(items.length<2)return null;
 const dates=items[0].points.filter(point=>point.date>='2020-01-01' && point.value>0 && items.every(item=>item.points.some(other=>other.date===point.date && other.value>0))).map(point=>point.date);
 const start=dates[0],end=dates.at(-1);if(dates.length<3 || !start?.startsWith('2020-'))return null;
 return {type:'line',title,unit:'Índice base 100',indexBaseDate:start,indexEndDate:end,commodityWindow:window,proteinChart:true,financePalette:true,dataInTables:true,series:items.map(item=>{const base=item.points.find(point=>point.date===start).value;return {label:item.label,points:item.points.filter(point=>point.date>=start && point.date<=end).map(point=>({date:point.date,value:point.value/base*100}))};}),note:'Base común observada: '+start+' / '+end+'. Series continuas de futuros; no son precios físicos, costos de una ración ni rentabilidad con renovación de contratos.'};
}
export function proteinPurchasingReport(report,model,{t=value=>value}={}){
 const {selected:references,discarded}=preferredProteinReferences(model.references),annex=[...(model.annexTables || []),...model.results];
 if(discarded.length)annex.push({title:t('Referencias de respaldo desplazadas por fuentes directas'),columns:['Referencia de catálogo','Precio de respaldo','Unidad','Fecha del respaldo','Referencia directa priorizada','Precio directo','Fecha del dato directo'].map(t),rows:discarded.map(({item,direct})=>[item.label,item.last.value,item.unit,item.last.date,direct.label,direct.last.value,direct.last.date]),note:t('Se apartan del cuerpo ejecutivo para evitar precios aparentemente duplicados. Una referencia nacional genérica de catálogo no sustituye una plaza, calidad o etapa específicas. No se concluye que las dos observaciones sean operaciones comparables.')});
 const priority=['AMS-PORK-CUTOUT','HE=F','MX-PORK-AGS-MIN','QC-PORK-GLOBAL','MERCO-ES-PORK-NORMAL','MERCO-BR-SP-CARCASS','DCE-LH','AMS-BEEF-CHOICE','LE=F','GF=F','MX-BEEF-AGS-MIN','AR-CATTLE-0','MERCO-BR-CEPEA-BEEF','MERCO-ES-BEEF-CRUZADO','USDA-CHICKEN-WHOLE','MX-CHICKEN-RAYON','CEPEA-130','CL-RETAIL-0','CO-CHICKEN-0','PE-AVES-0','MERCO-ES-CHICKEN-BELLPUIG','USDA-EGG-NATIONAL-INDEX','USDA-EGG-MIDWEST-CARTON','MX-EGG-AGS','MERCO-ES-EGG-BELLPUIG','USDA-EGG-LIQUID-WHOLE'];
 const score=item=>{const n=priority.indexOf(symbol(item));return n>=0 ? n : 100+Number(item.evidenceOrigin==='catalog')*20;};
 const picked=[];
 for(const sector of sectors){
  const local=references.filter(item=>item.sector===sector).toSorted((a,b)=>score(a)-score(b) || a.label.localeCompare(b.label,'es')),countries=new Set();
  for(const item of local){if(priority.includes(symbol(item)) || !countries.has(item.country) || trusted(item) && !picked.some(other=>other.sector===sector && other.country===item.country && trusted(other))){picked.push(item);countries.add(item.country);}}
 }
 const changeCopy=item=>{
  // Mexican physical publications keep their cadence. The executive board
  // emphasizes meaningful longer windows; exact daily zeroes stay in annexes.
  const keys=item.country==='México' ? ['month','quarter','semester','year'] : symbol(item)==='DCE-LH' ? ['day','month','year'] : ['day','month','semester','year'];
  const names={day:'Día',week:'Semana',month:'Mes',quarter:'Trimestre',semester:'Semestre',year:'Año'};
  const parts=keys.filter(key=>item.periods[key]).slice(0,4).map(key=>names[key]+': '+directionalChange(item.periods[key].value));
  if(symbol(item)==='DCE-LH'){
   const base=model.yearComparisons?.find(reference=>symbol(reference)==='DCE-LH')?.values?.find(point=>point.year===2022);
   if(base?.value>0)parts.push('Frente a 2022 ('+base.date+'): '+directionalChange((item.last.value/base.value-1)*100));
  }
  return parts.length ? parts.join(' · ') : 'Última publicación fechada';
 };
 const result=[];
 const mainSectors=[['Porcino','Sector porcino global'],['Vacuno','Sector vacuno global'],['Pollo','Avícola y procesados'],['Huevo','Huevo · precios por mercado']];
 for(const [sector,title] of mainSectors){
  const items=picked.filter(item=>sector==='Pollo' ? ['Pollo','Procesados y alternativas'].includes(item.sector) : item.sector===sector);if(!items.length)continue;
  result.push({title:t(title),market:'protein-sector-'+sector,proteinSectorBoard:true,proteinPurchasingTable:true,printGroup:'protein-purchasing',columns:['País / referencia','Etapa / estado','Precio publicado','Fecha / frecuencia','Variaciones disponibles · %'].map(t),rows:items.map(item=>[t(item.country)+'\n'+t(item.label),t(proteinCommercialStage(item))+(item.evidenceOrigin==='catalog' ? '\n'+t('Catálogo · por corroborar') : item.quoteStatus==='preserved' ? '\n'+t('Consulta conservada') : ''),number(item.last.value)+' '+item.unit,item.last.date+'\n'+t(frequency(item)),t(changeCopy(item))]),note:sector==='Porcino' ? t('Precios originales por producto, plaza y etapa. Catálogo: referencia pendiente de corroboración. Las seis ventanas y sus bases fechadas se conservan en Anexos.') : ''});
 }
 result.push(...proteinSpeciesPriceTables(references,{t}));
 const matrix=picked.flatMap(item=>{const converted=proteinUsdPerKg(item,report.marketFx,report.generatedAt);return converted ? [{item,...converted}] : [];});
 if(matrix.length)result.unshift({title:t('Matriz de compras · conversión a USD/kg'),proteinUsdMatrix:true,proteinPurchasingTable:true,printGroup:'protein-purchasing',columns:['Proteína / país','Referencia y base comercial','USD/kg','Fecha precio / cambio'].map(t),rows:matrix.map(row=>[t(row.item.sector)+' · '+t(row.item.country),t(row.item.label)+'\n'+t(proteinCommercialStage(row.item)),number(row.value),row.item.last.date+(row.fxDate ? '\nFX '+row.fxDate : '')]),note:t('Conversión de moneda y masa, sin ajustar calidad, rendimiento de canal, flete, aranceles ni permisos sanitarios. Vivo, canal, mínimo de rango y cutout no son precios equivalentes. No constituye un ranking de importación. Se excluyen catálogos no revalidados, futuros, cabeza, docena y caja sin peso documentado.')});
 if(matrix.length)annex.push({title:t('Matriz USD/kg · cálculo y trazabilidad'),columns:['Referencia','Precio original','Unidad original','Kilogramos por unidad','Moneda por USD','USD/kg','Fecha del precio','Fecha FX','Fuente FX','Fuente del precio','Enlace'].map(t),rows:matrix.map(row=>[row.item.label,row.item.last.value,row.item.unit,row.kg,row.rate,row.value,row.item.last.date,row.fxDate,row.fxDate ? report.marketFx.source : 'USD original',row.item.source,row.item.url])});
 const feed=marketEvidence({key:'grains',collection:'markets',generatedAt:report.generatedAt,sourceSnapshot:{grains:report.proteinFeed || []}}).filter(item=>['ZC=F','ZM=F'].includes(symbol(item)) && Date.parse(report.generatedAt)-Date.parse(item.points.at(-1)?.date)<=7*DAY),hog=references.find(item=>symbol(item)==='HE=F');
 const inputs=[hog,...feed].filter(Boolean),feedChart=report.personalization?.sections?.charts!==false && feed.length===2 && hog ? indexed(inputs,t('Cerdo frente a maíz y harina de soya · desde 2020'),'feed') : null;
 const feedRows=inputs.flatMap(item=>{const last=item.points.at(-1),factor=symbol(item)==='HE=F' && item.unit==='US¢/lb' ? 10/LB : symbol(item)==='ZC=F' && item.unit==='US¢/bu' ? 10/(56*LB) : symbol(item)==='ZM=F' && item.unit==='USD/t corta' ? 1000/(2000*LB) : null;return factor && feed.length ? [[item.label,number(last.value*factor),last.date,...['month','year'].map(key=>{const period=marketPeriods(item.points,item.cadence)[key];return period ? directionalChange(period.value) : null;})]] : [];});
 if(feedRows.length)result.push({title:t('Venta y alimento · referencias de futuros'),proteinFeedTable:true,proteinPurchasingTable:true,printGroup:'protein-purchasing',columns:['Referencia','USD/t','Fecha','Mes · %','Año · %'].map(t),rows:feedRows,note:t('Maíz: bushel de 56 lb; harina de soya: tonelada corta de 2,000 lb; cerdo: centavos por libra. No es costo de una ración ni margen de granja. Se requieren conversión alimenticia, fórmula, precio físico, base local y costos operativos.')});
 const oi=safeReportOpenInterest(report.marketOpenInterest,report.generatedAt).flatMap(item=>{
  const ref=references.find(ref=>symbol(ref)===item.symbol);if(!ref)return [];
  const base=ref.points.find(point=>point.date===item.previousDate),last=ref.points.find(point=>point.date===item.date),paired=base?.value>0 && last?.value>0 ? (last.value/base.value-1)*100 : null;
  return [{item,paired,reading:paired==null ? 'Participación semanal; sin cierre comparable en ambas fechas.' : paired<0 && item.change>0 ? 'Precio baja y OI aumenta: más contratos abiertos durante la caída; no identifica ventas de fondos.' : paired>0 && item.change>0 ? 'Precio y OI aumentan: participación creciente durante el alza; no prueba escasez ni una posición institucional.' : 'Precio y participación muestran señales distintas; revisar posiciones largas y cortas por categoría.'}];
 });
 if(oi.length)result.push({title:t('Participación y precio · mismas fechas CFTC'),derivatives:true,proteinOiReading:true,columns:['Contrato','OI · contratos','Cambio OI · %','Cierres comparados','Precio · %','Lectura'].map(t),rows:oi.map(({item,paired,reading})=>[item.label,number(item.value),item.change==null ? null : directionalChange(item.change),item.previousDate+' / '+item.date,paired==null ? null : directionalChange(paired),t(reading)]),note:t('COT semanal, futuros de todos los vencimientos frente a la serie continua de precios: cobertura distinta. No se cruza OI semanal con caída mensual. Cada contrato abierto tiene comprador y vendedor; el OI agregado no identifica fondos ni acredita cortos netos.')});
 const historicalNames=new Set(references.filter(item=>['HE=F','LE=F','GF=F'].includes(symbol(item))).map(item=>t(item.label)));
 result.push(...model.results.filter(table=>table.proteinHistoryTable).map(table=>({...table,rows:table.rows.filter(row=>historicalNames.has(String(row[0]).split('\n')[0]))})).filter(table=>table.rows.length),...model.results.filter(table=>table.derivatives && !/commodity-cftc/.test(table.printGroup || '')));
 const fundamentals=safeProteinFundamentals(report.proteinFundamentals,report.generatedAt);
 if(fundamentals.length)annex.push({title:t('Fundamentales sectoriales · publicaciones USDA'),columns:['Sector','Lectura publicada','Fecha','Fuente','Enlace'].map(t),rows:fundamentals.map(item=>[item.sector,item.text,item.publishedAt,item.source,item.url]),note:t('Perspectivas mensuales y revisiones de oferta; no prueban por sí solas la causa de una variación diaria.')});
 const moves=['Porcino','Vacuno','Pollo','Huevo'].flatMap(sector=>{const item=references.filter(item=>item.sector===sector && item.evidenceOrigin!=='catalog' && item.periods[report.analysisPeriod==='weekly' ? 'week' : 'day']?.value!==0 && item.periods[report.analysisPeriod==='weekly' ? 'week' : 'day']).toSorted((a,b)=>score(a)-score(b))[0],change=item?.periods[report.analysisPeriod==='weekly' ? 'week' : 'day'];return change ? [item.label+': '+directionalChange(change.value)+' ('+change.baseDate+' / '+change.lastDate+').'] : [];}).slice(0,3);
 const feedMoves=inputs.flatMap(item=>{const change=marketPeriods(item.points,item.cadence).month;return change ? [item.label+': '+directionalChange(change.value)+' en el mes ('+change.baseDate+' / '+change.lastDate+')'] : [];});
 const physicalImplication=model.summaryPanels.find(panel=>panel.summaryKind==='implications')?.body || '';
 const panels=[{summaryKind:'session',heading:t('Qué cambió para compras'),body:t(moves.join(' ') || model.summary)},...(fundamentals.length ? [{summaryKind:'context',heading:t('Oferta y demanda · contexto publicado'),body:fundamentals.map(item=>t(item.sector+': '+item.text)+' · USDA ERS '+item.publishedAt+'.').join(' ')}] : model.summaryPanels.filter(panel=>panel.summaryKind==='context').slice(0,1)),{summaryKind:'implications',heading:t('Alimento, reposición y margen'),body:t(feedMoves.length===3 ? feedMoves.join('; ')+'. Comparar estas trayectorias ayuda a vigilar la presión entre venta y alimento; no demuestra utilidad o pérdida sin la ración, conversión alimenticia, base física y costos de la operación.' : physicalImplication+' La matriz conserva la base comercial. Solicitar ofertas de la misma calidad y entrega, con flete, aranceles y permisos sanitarios, antes de elegir un origen.')},...(oi.length && !fundamentals.length ? [{summaryKind:'watch',heading:t('Participación y riesgos a vigilar'),body:t(oi[0].item.label+': '+oi[0].reading+' Para pollo y huevo, contrastar las detecciones fechadas de APHIS y el inventario de ponedoras; un cambio de precio no confirma por sí solo un brote. La caída de un futuro chino no demuestra por sí sola una reducción de importaciones.')}] : [])];
 const visuals=report.personalization?.sections?.charts===false ? [] : model.visuals.filter(visual=>!(visual.series || []).some(series=>discarded.some(({item})=>series.label===t(item.label))));
 const benchmark=visuals.find(visual=>visual.proteinMercolleida && visual.series?.some(series=>references.some(item=>symbol(item)==='MERCO-ES-PORK-NORMAL' && t(item.label)===series.label)));
 const speciesCharts=report.personalization?.sections?.charts===false ? [] : proteinSpeciesPriceCharts(references,{t});
 const featured=[visuals.find(visual=>visual.proteinHistorical && visual.executiveLead),benchmark,feedChart,...speciesCharts].filter(Boolean);
 if(feedChart)visuals.push(feedChart);
 for(const chart of speciesCharts){
  const duplicate=visuals.findIndex(visual=>visual.commodityWindow==='recent' && visual.series?.length===1 && visual.series[0].label===chart.proteinPriceReference);
  if(duplicate>=0)visuals[duplicate]=chart;else visuals.push(chart);
 }
 const finalVisuals=visuals.map(visual=>({...visual,requiredInPrint:featured.includes(visual),executiveLead:visual===featured[0],proteinRegionalFeatured:visual===benchmark,proteinCatalogChart:visual.proteinCatalogChart || visual===benchmark}));
 const blocks=[['session','Lectura ejecutiva'],...(result.some(table=>!table.derivatives) ? [['comparisons','Compras, precios y variaciones']] : []),...(finalVisuals.length ? [['charts','Comparativas e historia']] : []),...(result.some(table=>table.derivatives) ? [['derivatives','Participación y coberturas']] : [])].map(([key,label],index)=>({key,label:t(label),number:String(index+1)}));
 const pins=new Set(['AMS-PORK-CUTOUT','MX-PORK-AGS-MIN','QC-PORK-GLOBAL','MERCO-ES-PORK-NORMAL','DCE-LH','AMS-BEEF-CHOICE','LE=F','GF=F','MX-BEEF-AGS-MIN','AR-CATTLE-0','USDA-CHICKEN-WHOLE','USDA-EGG-NATIONAL-INDEX','USDA-EGG-MIDWEST-CARTON','MX-EGG-AGS','CEPEA-130','CL-RETAIL-0','CO-CHICKEN-0','PE-AVES-0'].flatMap(id=>references.filter(item=>symbol(item)===id).map(item=>t(item.country)+'\n'+t(item.label))));
 const results=result.map(table=>{
  if(table.derivatives || table.proteinHistoryTable)return table;
  const required=table.proteinFeedTable || table.proteinSpeciesPrices ? table.rows : table.proteinUsdMatrix ? table.rows.filter((row,index,all)=>['Estados Unidos','México','Canadá','Brasil','España'].some(country=>row[0].endsWith(' · '+t(country))) && all.findIndex(other=>other[0].split(' · ').at(-1)===row[0].split(' · ').at(-1))===index) : table.rows.filter(row=>pins.has(row[0]));
  return {...table,proteinProtectedCoverage:true,proteinRequiredRows:required.map(row=>row[0])};
 });
 return {...model,proteinPurchasing:true,references,results:report.personalization?.sections?.tables===false ? [] : results,annexTables:annex,summary:t(moves.join(' ') || model.summary),summaryPanels:panels,commentary:panels,visuals:finalVisuals,blocks,commodityExecutive:{...model.commodityExecutive,scope:t('Lectura de compras por proteína: precios físicos, futuros y referencias de respaldo diferenciados; comparación monetaria sin mezclar etapas comerciales.'),references:references.length,catalogReferences:references.filter(item=>item.evidenceOrigin==='catalog').length,chartCount:finalVisuals.length}};
}
