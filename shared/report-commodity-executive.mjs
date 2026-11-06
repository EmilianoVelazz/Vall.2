import {usProteinReference,proteinReportReference} from './report-protein-scope.mjs';
import {safeMarketNews} from './report-market-news.mjs';
import {priceChartGroups} from './report-chart-grouping.mjs';
import {marketEvidence,marketPeriods,directionalChange,marketCountry,proteinSector} from './report-market-analysis.mjs';
import {proteinHistoricalComparison} from './report-protein-history.mjs';
import {isAmericanProtein,orderProteinAmericas,proteinAmericasComparison} from './report-protein-americas.mjs';
import {isMercolleidaProtein,proteinMercolleidaComparison} from './report-protein-reference-comparison.mjs';
import {proteinQualityAnnex,proteinDocumentAnnex,safeProteinMarketContext,proteinPublicComments} from './report-protein-quality.mjs';
import {proteinPurchasingReport} from './report-protein-purchasing.mjs';
import {grainHistoricalComparison} from './report-grain-history.mjs';
import {energyExecutiveReport} from './report-energy-executive.mjs';
import {mapReportText,reportSourceText} from './report-localized-text.mjs';
const list=value=>Array.isArray(value) ? value : [];
const fold=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const profiles={
 grains:{label:'Granos y forrajes · panorama mundial',scope:'Referencias de América, Europa, Asia y África según disponibilidad. Las publicaciones diarias, semanales y mensuales conservan su frecuencia.',effect:'Relacionar el grano y los coproductos con la fórmula de alimento, inventario y reposición. Una caída del futuro puede aliviar la referencia, pero base local, calidad, divisa y flete determinan el costo entregado.',watch:'Contrastar cosecha, existencias y exportaciones de la misma campaña; revisar oferta física y flete antes de cambiar el calendario de compra.'},
 energy_metals:{label:'Energía y metales · costos industriales',scope:'Energía y metales por producto, mercado, moneda y unidad. Los precios físicos y los contratos de futuros se mantienen separados.',effect:'Revisar consumo de combustible, energía y metales, junto con las cláusulas y fechas de ajuste de cada contrato. La variación del petróleo no se aplica directamente a electricidad, diésel o flete.',watch:'En energía, revisar inventarios y capacidad de suministro; en metales, producción y demanda industrial. Contrastar el contrato y la referencia que realmente determina el costo.'},
 proteins:{label:'Proteínas · precios y perspectiva histórica',scope:'Precios publicados por especie, país, moneda y etapa comercial. La comparación desde 2020 usa las observaciones disponibles de cada referencia y conserva las fechas de ambas bases.',effect:'Relacionar el precio de reposición con inventarios, rendimiento de cortes y calendario de compras. Comparar el mismo producto y etapa comercial antes de estimar el cambio en el margen.',watch:'Contrastar disponibilidad, sacrificio, pesos y demanda con las publicaciones del mercado de origen; revisar el vencimiento del contrato y el precio físico antes de definir coberturas.'},
 overview:{label:'Panorama de Mercados',scope:'Lectura conjunta de Granos, Energía y metales y Proteínas. Cada referencia mantiene su fecha, unidad y naturaleza comercial.',effect:'Leer alimento, energía y proteína en conjunto sin sumar sus precios o variaciones. La transmisión al margen depende de consumo, rendimiento, contratos, inventario, moneda y transporte.',watch:'Priorizar la exposición material de compras, ventas e inventarios. Confirmar los cambios en la oferta física y usar el detalle especializado para cada producto.'},
};
export const isCommodityExecutive=report=>Boolean(report && (report.baseReport?.collection || report.collection)==='markets' && profiles[report.baseReport?.key || report.key] && report.periodType!=='annual');
function chartWindow(item,period){
 const last=item.points.at(-1);return {...item,points:item.points.filter(point=>period==='history' ? point.date>='2020-01-01' : Date.parse(last.date)-Date.parse(point.date)<=185*86400000)};
}
function makeCharts(references,key,t){
 const family=item=>key==='overview' && item.category==='grains' ? 'Granos y forrajes' : (key==='proteins' || key==='overview' && item.category==='proteins') ? proteinSector(item) : key==='grains' ? 'Granos y forrajes' : /gas|henry|ttf/i.test(item.label) ? 'Gas' : /petroleo|brent|wti/i.test(fold(item.label)) ? 'Petróleo' : 'Metales';
 const charts=[];
 for(const window of ['recent','history']){
  const entries=references.map(item=>chartWindow(item,window)).filter(item=>item.points.length>=3 && (window!=='history' || item.points[0].date<'2025-01-01'));
  for(const group of priceChartGroups(entries,{family,limit:4})){
   const start=group.items.reduce((date,item)=>item.points[0].date<date ? item.points[0].date : date,group.items[0].points[0].date),title=[key==='proteins' ? [...new Set(group.items.map(item=>item.country))].filter(Boolean).join(' / ') : '',group.label,group.basisLabel,group.unit,window==='history' ? 'Historia '+start.slice(0,4)+'–'+group.items[0].points.at(-1).date.slice(0,4) : 'Últimos seis meses disponibles'].filter(Boolean).join(' · ')+(group.parts>1 ? ' · '+group.part+'/'+group.parts : ''),series=group.items.map(item=>({label:t(item.label),points:item.points}));
   charts.push({type:'line',title:t(title),unit:group.unit,cadence:group.cadence,series,commodityWindow:window,financePalette:true,dataInTables:true,note:t(window==='history' ? 'Historia disponible desde 2020. Cada serie conserva su fecha inicial y sus huecos; no se completan años sin datos. Las observaciones antiguas son muestras mensuales, no promedios anuales.' : 'Últimos seis meses disponibles. Se mantienen producto, presentación, unidad, base comercial y frecuencia. Las líneas no representan un precio intercambiable ni el costo entregado.')});
   if(window==='recent' && group.items.length>1){
    const common=group.items[0].points.map(point=>point.date).find(date=>group.items.every(item=>item.points.some(point=>point.date===date && point.value>0)));if(!common)continue;
    charts.push({type:'line',title:t(title+' · trayectorias comparadas'),unit:t('Índice base 100'),commodityWindow:'relative',financePalette:true,dataInTables:true,indexBaseDate:common,series:group.items.map(item=>{const base=item.points.find(point=>point.date===common).value;return {label:t(item.label),points:item.points.filter(point=>point.date>=common).map(point=>({date:point.date,value:point.value/base*100}))};}),note:t('Base 100 en la primera fecha común: ')+common+'. '+t('Se compara la trayectoria relativa dentro de la misma unidad y base comercial. No equivale a igualdad de calidad, costo ni sustitución. Sin interpolar días ni convertir monedas.')});
   }
  }
 }
 return charts;
}
export function commodityExecutiveReport(input,model,{t:labels=value=>value,source=value=>value}={}){
 if(!isCommodityExecutive(input))return model;
 const canonical=reportSourceText(input,source);
 const report=input.causeText ? mapReportText(input,canonical) : input,t=(value,parameters)=>input.causeText?.[value] || labels(value,parameters);
 if(input.causeText)model=mapReportText(model,canonical);
 const key=report.baseReport?.key || report.key,profile=key==='proteins' && report?.proteinScope==='US_ONLY' ? {...profiles.proteins,label:'Proteínas · Estados Unidos',scope:'Precios físicos y futuros de Estados Unidos. Cada especie, presentación y etapa comercial conserva su unidad; se incluye equivalencia en pesos sólo con un tipo de cambio fechado.'} : profiles[key],weekly=report.analysisPeriod==='weekly',period=weekly ? 'week' : 'day';
 let references=key==='overview' ? marketEvidence(report).filter(item=>item.category!=='proteins' || (report?.proteinScope==='US_ONLY' ? usProteinReference(item) : proteinReportReference(item) && !/dalian/i.test(item.label || ''))).map(item=>({...item,last:item.points.at(-1),previous:item.points.at(-2),country:marketCountry(item),periods:marketPeriods(item.points,item.cadence)})).filter(item=>item.last && Date.parse(report.generatedAt)-Date.parse(item.last.date)<=({daily:7,weekly:21,monthly:70}[item.cadence] || 14)*86400000) : model.references;
 if(key==='proteins')references=orderProteinAmericas(references);
 const sessionReferences=key==='proteins' && references.some(isAmericanProtein) ? references.filter(isAmericanProtein) : references;
 const ranked=sessionReferences.filter(item=>item.periods?.[period]).toSorted((a,b)=>Math.abs(b.periods[period].value)-Math.abs(a.periods[period].value)),up=ranked.find(item=>item.periods[period].value>0),down=ranked.find(item=>item.periods[period].value<0),selected=[up,down].filter(Boolean);
 const hasMercolleida=key==='proteins' && report?.proteinScope!=='US_ONLY' && references.some(item=>item.provider==='mercolleida' || /^MERCO-/.test(item.symbol || '') || /mercolleida/i.test(item.source || item.label || ''));
 const fact=selected.length ? selected.map(item=>{const change=item.periods[period];return item.label+': '+directionalChange(change.value)+' ('+change.baseDate+' / '+change.lastDate+').';}).join(' ') : references.length ? t('Se muestran las últimas publicaciones disponibles. Una variación requiere una base de la misma referencia y frecuencia.') : t('No hay referencias recientes disponibles en este corte.');
 const physical=key==='proteins' ? ranked.find(item=>item.quoteStatus==='verified' && !/=[F]$/.test(item.symbol || '') && !/futuro|serie continua|índice móvil|promedio móvil/i.test(item.basis+' '+item.exchange) && item.periods[period].value!==0) : key==='grains' ? ranked.find(item=>/^Mercado físico$/i.test(item.exchange || '') && item.periods[period].value!==0) : undefined;
 const physicalChange=physical?.periods?.[period],priceDelta=physicalChange ? physicalChange.last-physicalChange.base : null;
 const implication=physicalChange ? 'Para compras referenciadas a '+physical.label+', el cambio observado equivale a '+(priceDelta>0 ? '+' : '-')+Math.abs(priceDelta).toLocaleString('es-MX',{maximumFractionDigits:3})+' '+physical.unit+' ('+physicalChange.baseDate+' / '+physicalChange.lastDate+'). A igual volumen y condiciones, '+(priceDelta>0 ? 'eleva' : 'reduce')+' el valor de reposición de esa referencia; el costo entregado depende también de flete, impuestos y contrato.' : profile.effect;
 const summaryPanels=[
  {summaryKind:'session',heading:t(weekly ? 'Qué cambió en la semana' : 'Qué cambió en la sesión'),body:t(fact)},
  {summaryKind:'implications',heading:t('Repercusiones para compras y margen'),body:t(implication)},
  ...(report.personalization?.sections?.risks===false ? [] : [{summaryKind:'watch',heading:t('Seguimiento prioritario'),body:t(profile.watch)}]),
 ];
 const context=[...safeMarketNews(report.sessionNews || [],report.generatedAt).filter(item=>key!=='energy_metals' || /petrol|crudo|brent|wti|refineri|gas natural|henry hub|cobre|alumin|metales|mineri|energy|\beia\b/i.test(item.title+' '+(item.description || '')+' '+item.source)),...(key==='proteins' ? safeProteinMarketContext([...(report.proteinMarketContext || []),...proteinPublicComments(report.tables,report.generatedAt)],report.generatedAt) : [])].toSorted((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,2);if(context.length)summaryPanels.push({summaryKind:'context',heading:t('Contexto publicado'),printBody:context.length>1 ? t(context[0].title)+': '+t(context[0].description || '')+' · '+context[0].source+' · '+context[0].publishedAt.slice(0,10)+'. '+t('Comentario publicado; no demuestra por sí solo la causa de cada variación.') : undefined,body:context.map(item=>t(item.title)+(item.description ? ': '+t(item.description).slice(0,260) : '')+' · '+item.source+' · '+item.publishedAt.slice(0,10)).join('\n\n')+' '+t('Publicaciones del corte; no acreditan por sí solas la causa de una variación de precio.')});
 const annex=[...(model.annexTables || []),...(key==='proteins' ? [proteinQualityAnnex(references,report.generatedAt,{t}),...proteinDocumentAnnex(references,{t}),...(context.length ? [{title:t('Proteínas · contexto publicado'),columns:['Publicación','Extracto publicado','Fecha de publicación','Fuente','Enlace'].map(t),rows:context.map(item=>[item.title,item.description || null,item.publishedAt,item.source,item.url]),note:t('Contexto fechado separado del precio; una publicación no demuestra por sí sola la causa de cada variación.')}] : [])] : [])];let tables=model.results.flatMap(table=>{
  if(/Referencias para revisar coberturas/.test(table.title)){annex.push(table);return [];}
  if(table.printGroup==='market-levels'){
   const isGlobalSpecies=hasMercolleida && table.market;
   return [{
    ...table,
    columns:[...table.columns,t(weekly ? 'Semana %' : 'Día %'),...(isGlobalSpecies ? [t('Desde 2020 %')] : [])],
    rows:table.rows.map(row=>{
     const label=String(row[0]).split('\n')[0],item=references.find(item=>item.label===label || label.startsWith(item.label)),change=item?.periods?.[period],since2020=item?.periods?.since2020;
     return [...row,change ? directionalChange(change.value) : '—',...(isGlobalSpecies ? [since2020 ? directionalChange(since2020.value) : '—'] : [])];
    }),
   }];
  }
  if(table.printGroup==='market-returns'){const indices=table.columns.map((_,index)=>index).filter(index=>index===0 || table.columns[index]!==t(weekly ? 'Semana' : 'Día'));return [{...table,columns:indices.map(index=>table.columns[index]),rows:table.rows.map(row=>indices.map(index=>row[index]))}];}
  return [table];
 });
 if(key==='overview' && report.personalization?.sections?.tables!==false){
  const number=value=>Number.isFinite(value) ? value.toLocaleString('es-MX',{maximumFractionDigits:3}) : '—';
  const derivatives=tables.filter(table=>table.derivatives);
  tables=[['grains','Granos y forrajes'],['energy_metals','Energía y metales'],['proteins','Proteínas · mercados internacionales y Mercolleida']].flatMap(([category,label])=>{const selected=references.filter(item=>item.category===category);return selected.length ? [{title:t(label+' · tablero del corte'),printGroup:'market-levels',market:category,columns:['Referencia / país','Unidad','Último','Fecha del dato',weekly ? 'Semana %' : 'Día %','Mes %','Acum. %'].map(t),rows:selected.map(item=>[item.label,item.unit,number(item.last.value),item.last.date,...[period,'month','ytd'].map(key=>directionalChange(item.periods[key]?.value))]),note:t('Cada fila conserva su moneda, unidad y frecuencia. Las variaciones sólo se calculan con una base de la misma referencia. El detalle especializado conserva las dos fechas de comparación, el cierre anterior, los horizontes y las condiciones comerciales.')}]:[];});
  tables.push(...derivatives);
 }
 const proteinHistory=key==='proteins' ? proteinHistoricalComparison(model,{t}) : null;
 if(proteinHistory?.tables.length){tables=tables.filter(table=>!table.printDateColumns);const prices=tables.filter(table=>table.printGroup==='market-levels'),rest=tables.filter(table=>table.printGroup!=='market-levels');tables=[...prices,...proteinHistory.tables,...rest];annex.push(...proteinHistory.annexTables);}
 if(proteinHistory?.summary)summaryPanels.splice(1,0,{...proteinHistory.summary,summaryKind:'history'});
 const americas=key==='proteins' ? proteinAmericasComparison(references,{t,fx:report.marketFx,cutoff:report.generatedAt}) : null;
 const mercolleida=key==='proteins' ? proteinMercolleidaComparison(references,{t}) : null;
 if(americas?.tables.length){
  summaryPanels.splice(1,0,{summaryKind:'coverage',heading:t('América en este corte'),body:americas.countries.map(t).join(' · ')+'. '+t('Precios por país y producto, con comparaciones de sesión, semana, mes, trimestre, semestre y año cuando existe una base publicada.')});
  const labels=new Set(references.filter(item=>isAmericanProtein(item) || isMercolleidaProtein(item)).map(item=>item.label));
  const remaining=tables.flatMap(table=>{
   if(table.printGroup!=='market-levels' && table.printGroup!=='market-returns')return [table];
   annex.push(table);
   const rows=table.rows.filter(row=>!labels.has(String(row[0]).split('\n')[0]));return rows.length ? [{...table,rows}] : [];
  });
  tables=[...americas.tables.filter(table=>table.proteinCoverage==='united-states'),...(mercolleida?.tables || []),...americas.tables.filter(table=>table.proteinCoverage!=='united-states'),...remaining];annex.push(...americas.annexTables,...(mercolleida?.annexTables || []));
 }else if(mercolleida?.tables.length){
  const labels=new Set(references.filter(isMercolleidaProtein).map(item=>item.label));
  tables=[...mercolleida.tables,...tables.flatMap(table=>{if(!['market-levels','market-returns'].includes(table.printGroup))return [table];const rows=table.rows.filter(row=>!labels.has(String(row[0]).split('\n')[0]));return rows.length ? [{...table,rows}] : [];})];annex.push(...mercolleida.annexTables);
 }
 const charts=report.personalization?.sections?.charts===false ? [] : makeCharts(references,key,t),originalBars=model.visuals.filter(visual=>visual.type==='bar' && !visual.sessionMovement).map(visual=>({...visual,commodityWindow:'years'}));
 const preferred=charts.findIndex(visual=>visual.commodityWindow==='recent' && visual.series?.some(series=>series.label===t(ranked[0]?.label))),lead=preferred<0 ? 0 : preferred,history=charts.findIndex(visual=>visual.commodityWindow==='history'),relative=charts.findIndex(visual=>visual.commodityWindow==='relative');
 let visuals=[...charts,...originalBars].map((visual,index)=>({...visual,executiveLead:index===lead,requiredInPrint:index===history || key!=='proteins' && index===relative}));
 if(proteinHistory?.charts.length && report.personalization?.sections?.charts!==false){const lead=proteinHistory.charts.find(visual=>visual.executiveLead),combined=new Set((lead?.series || []).map(series=>series.label));visuals=[...proteinHistory.charts,...visuals.filter(visual=>!(lead && visual.commodityWindow==='history' && visual.series?.every(series=>combined.has(series.label)))).map(visual=>({...visual,executiveLead:!lead && visual.executiveLead,requiredInPrint:!lead && visual.requiredInPrint}))];}
 if(key==='proteins'){
  visuals=visuals.map(visual=>({...visual,proteinChart:true,proteinAmericas:visual.commodityWindow==='recent' && visual.series?.length>0 && visual.series.every(series=>references.some(item=>t(item.label)===series.label && isAmericanProtein(item))),proteinUnitedStates:visual.commodityWindow==='recent' && visual.series?.length>0 && visual.series.every(series=>references.some(item=>t(item.label)===series.label && item.country==='Estados Unidos')),proteinMercolleida:visual.commodityWindow==='recent' && visual.series?.length>0 && visual.series.every(series=>references.some(item=>t(item.label)===series.label && isMercolleidaProtein(item)))}));
  visuals=visuals.map(visual=>visual.proteinMercolleida && !visual.title.includes(t('Mercolleida')) ? {...visual,title:t('Mercolleida')+' · '+visual.title} : visual);
  visuals=visuals.map(visual=>({...visual,proteinCatalogChart:Boolean(visual.series?.some(series=>references.some(item=>t(item.label)===series.label && item.evidenceOrigin==='catalog')) || visual.proteinHistoryReference && references.some(item=>t(item.label)===visual.proteinHistoryReference && item.evidenceOrigin==='catalog'))}));
  const featured=new Set(['México','Brasil'].flatMap(country=>visuals.filter(visual=>visual.proteinAmericas && visual.series.some(series=>references.some(item=>item.country===country && t(item.label)===series.label))).slice(0,1)));
  const mercoChart=visuals.find(visual=>visual.proteinMercolleida);
  visuals=visuals.map(visual=>({...visual,proteinRegionalFeatured:featured.has(visual) || visual===mercoChart,requiredInPrint:visual.requiredInPrint || visual===mercoChart || featured.has(visual) && visual.series.some(series=>references.some(item=>item.country==='México' && t(item.label)===series.label))}));
 }
 const blocks=[{key:'session',label:t('Lectura ejecutiva')},...(tables.some(table=>!table.derivatives) ? [{key:'comparisons',label:t('Precios y variaciones')}]:[]),...(visuals.length ? [{key:'charts',label:t('Comparativas e historia')}]:[]),...(tables.some(table=>table.derivatives) ? [{key:'derivatives',label:t(tables.some(table=>table.printGroup==='commodity-options') ? 'Call, put e interés abierto' : 'Interés abierto de futuros')}]:[])].map((block,index)=>({...block,number:String(index+1)}));
 if(key==='grains')tables=tables.map(table=>({...table,preserveNumericGrid:true}));
 const grainHistory=key==='grains' ? grainHistoricalComparison(references,{weekly,t}) : null;
 if(grainHistory){
  annex.push(...tables.filter(table=>table.printGroup==='market-levels'));
  const covered=new Set(grainHistory.entries.map(entry=>entry.item.label));
  const standalone=tables.filter(table=>table.printGroup==='market-levels').flatMap(table=>{const rows=table.rows.filter(row=>!covered.has(String(row[0]).split('\n')[0]));return rows.length ? [{...table,rows}] : [];});
  tables=[grainHistory.table,...standalone,...tables.filter(table=>table.printGroup!=='market-levels')];
  if(report.personalization?.sections?.charts!==false)visuals=[grainHistory.visual,...visuals.map(visual=>{
   const featured=visual.commodityWindow==='recent' && visual.series?.length===1 && references.some(item=>item.country==='México' && item.label===visual.series[0].label);
   return {...visual,...(featured ? {title:t('México · ')+visual.series[0].label.split(' · ').slice(0,2).join(' · ')+' · '+t('Últimos seis meses disponibles')} : {}),grainRecentFeatured:featured,executiveLead:false,requiredInPrint:false};
  })];
 }
 const result={...model,commodityExecutive:{key,title:t(profile.label),scope:t(profile.scope),catalogReferences:references.filter(item=>item.evidenceOrigin==='catalog').length,references:references.length,countries:[...new Set(references.map(item=>item.country || item.market).filter(Boolean))],chartCount:visuals.length},summary:t(fact),summaryPanels,commentary:summaryPanels,metrics:[],references,results:tables,annexTables:annex,visuals,blocks};
 const output=key==='proteins' ? proteinPurchasingReport(report,result,{t}) : key==='energy_metals' ? energyExecutiveReport(report,result,{t}) : grainHistory ? {...result,grainGlobalHistory:grainHistory.visual,blocks:['session','comparisons','derivatives','charts'].flatMap(key=>result.blocks.filter(block=>block.key===key)).map((block,index)=>({...block,number:String(index+1)}))} : result;
 return input.causeText ? mapReportText(output,t) : output;
}
