// Presentation only: missing evidence is omitted, never replaced or imputed.
// Canonical reports, observations and documentary annexes stay unchanged.
const list=value=>Array.isArray(value) ? value : [];
const fold=value=>String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
const finite=value=>typeof value==='number' && Number.isFinite(value);
export function missingReportValue(value,source=value=>value){
 if(value==null)return true;if(typeof value==='number')return !finite(value);
 const text=fold(source(value)),first=fold(String(source(value)).split('\n')[0]);
 if(/^[—–−\s/·|:-]+$/.test(text) || /^(?:null|undefined|nan|[-+]?infinity)$/.test(text))return true;
 return !text || /^[—–−-]+$/.test(text) || /^[—–−-]+$/.test(first) || /^(?:sin datos?(?: de \d{4}| verificables?| comparables?)?|sin informacion|sin precio reciente disponible|sin base comparable|sin produccion reportada|sin registro|no disponible|no calculable|no aplica(?:ble)?|n\/?a|n\/?d|not available|no data|not calculable|not applicable|indisponible|non disponible|non disponibile|nicht verfugbar|keine daten|データなし)$/.test(text) || /^(?:sin desglose estatal|sin observaciones disponibles|no hay (?:datos|referencias|cotizaciones|publicaciones)\b)/.test(text);
}
function project(table,rowIndices,columnIndices){
 const changes=list(table.changeColumns),keptChanges=changes.flatMap((column,index)=>columnIndices.includes(column) ? [index] : []);
 return {...table,columns:columnIndices.map(index=>table.columns[index]),rows:rowIndices.map(index=>columnIndices.map(column=>table.rows[index][column])),
  ...(table.rowCodes ? {rowCodes:rowIndices.map(index=>table.rowCodes[index])} : {}),...(table.rowStates ? {rowStates:rowIndices.map(index=>table.rowStates[index])} : {}),
  ...(table.changeColumns ? {changeColumns:keptChanges.map(index=>columnIndices.indexOf(changes[index]))} : {}),...(table.costTones ? {costTones:rowIndices.map(index=>keptChanges.map(period=>table.costTones[index]?.[period]))} : {})};
}
function inlineOptionalContext(table,{source}){
 let result=table,names=result.columns.map(value=>fold(source(value)));
 const merge=(optional,main,prefix)=>{
  if(optional<0 || main<0)return;
  if(result.rows.some(row=>!missingReportValue(row[optional],source) && missingReportValue(row[main],source)))return;
  const columns=result.columns.filter((_,index)=>index!==optional),rows=result.rows.map(row=>row.flatMap((value,index)=>index===optional ? [] : [index===main && !missingReportValue(row[optional],source) ? String(value)+' · '+prefix+': '+row[optional] : value]));
  result={...result,columns,rows};names=columns.map(value=>fold(source(value)));
 };
 if(table.equityMaster){const optional=names.findIndex(name=>/^(?:dia|semana) usd/.test(name)),main=names.findIndex(name=>/^(?:dia|semana)\b/.test(name) && !name.includes('usd'));if(optional>=0 && result.rows.some(row=>missingReportValue(row[optional],source)))merge(optional,main,'USD');}
 if(table.bondRates){const base=names.findIndex(name=>/^(?:cierre )?2020$/.test(name)),main=names.findIndex(name=>/^(?:nivel actual|actual)$/.test(name));if(base>=0 && result.rows.some(row=>missingReportValue(row[base],source)))merge(base,main,'2020');}
 return result;
}
function productionTable(table,{source,t}){
 const crops=table.columns.flatMap((name,index)=>index>0 && /(?:maiz|trigo|sorgo|soya).*(?:\(t\)|· t$)/.test(fold(source(name))) ? [index] : []);
 if(crops.length<2 || !table.rows.some(row=>crops.some(index=>missingReportValue(row[index],source))))return null;
 const rows=[],states=[];
 for(const row of table.rows)for(const index of crops)if(!missingReportValue(row[index],source)){rows.push([row[0],table.columns[index].replace(/\s*(?:\(t\)|· t)\s*$/i,''),row[index]]);states.push(row[0]);}
 return rows.length ? {...table,availabilityProduction:true,columns:[table.columns[0],t('Cultivo'),t('Producción · t')],rows,rowStates:states} : false;
}
function availableOne(input,options){
 const {source,t}=options,missing=value=>missingReportValue(value,source);
 if(!list(input.columns).length || !list(input.rows).length)return [];
 const production=productionTable(input,options);if(production!==null)return production ? [production] : [];
 let table=inlineOptionalContext(input,options),names=table.columns.map(column=>fold(source(column)));
 const primary=names.findIndex(name=>/^(?:ultimo\b|nivel actual\b|nivel ·|spot$|cierre$|actual$|precio(?:\b|\/)|valor(?:\b| \())/.test(name));
 const availability=names.findIndex(name=>/^disponibilidad$/.test(name));
 const metadata=name=>/^(?:unidad|fuente|enlace|fecha|fechas|periodo|ano|mes publicado|sesiones comparadas|cobertura|estado del|frecuencia)/.test(name);
 const data=names.flatMap((name,index)=>index>0 && (table.printGroup==='market-returns' || table.fxHorizons || !metadata(name)) ? [index] : []);
 const kept=table.rows.flatMap((row,index)=>!list(row).length || missing(row[0]) || primary>=0 && missing(row[primary]) || availability>=0 && missing(row[availability]) || primary<0 && data.length && data.every(column=>missing(row[column])) ? [] : [index]);
 if(!kept.length)return [];
 const columns=table.columns.flatMap((_,index)=>kept.some(row=>!missing(table.rows[row][index])) ? [index] : []);if(columns.length<2)return [];
 table=project(table,kept,columns);names=table.columns.map(column=>fold(source(column)));
 if(table.rows.every(row=>row.every(cell=>!missing(cell))))return [table];
 const matrix=table.printGroup==='market-returns' || table.fxHorizons || names.slice(1).filter(name=>/^20\d{2}(?:\b|\n)/.test(name)).length>=2;
 const groups=new Map();for(let index=0;index<table.rows.length;index++){const selected=table.columns.flatMap((_,column)=>!missing(table.rows[index][column]) ? [column] : []),key=selected.join(',');if(!groups.has(key))groups.set(key,{columns:selected,rows:[]});groups.get(key).rows.push(index);}
 if(!table.preserveNumericGrid && !table.proteinHistoryTable && !table.proteinComparisonTable && (matrix || groups.size>4 && !table.fxMaster)){
  return [{...table,availabilityFacts:true,columns:[table.columns[0],t('Datos publicados')],rows:table.rows.map(row=>[row[0],row.slice(1).flatMap((value,index)=>missing(value) ? [] : [table.columns[index+1]+': '+value]).join(' · ')]),...(table.changeColumns ? {changeColumns:[],costTones:table.rows.map(()=>[])} : {})}];
 }
 return [...groups.entries()].flatMap(([mask,group],ordinal)=>{
  if(group.columns.length<2)return [];
  const result=project(table,group.rows,group.columns),hasChange=result.columns.some(column=>/^(?:dia|semana|cambio)/.test(fold(source(column))));
  const frequency=group.rows.every(index=>/\nSemanal\b/i.test(String(source(table.rows[index][0])))) ? t('Publicaciones semanales') : group.rows.every(index=>/\nMensual\b/i.test(String(source(table.rows[index][0])))) ? t('Publicaciones mensuales') : hasChange ? t('Con comparación publicada') : t('Últimas publicaciones');
  return [{...result,...(table.preserveNumericGrid ? {numericGridTitle:table.numericGridTitle || table.title} : {}),...((table.preserveNumericGrid || table.proteinProtectedCoverage || table.proteinAmericas || table.proteinHistoryTable) && ordinal ? {note:'',...(table.proteinHistoryTable ? {printDateNote:''} : {})} : {}),title:groups.size>1 ? table.title+' · '+frequency : table.title,availabilityKey:mask}];
 });
}
export function availableReportTables(tables,{source=value=>value,t=value=>value}={}){return list(tables).flatMap(table=>availableOne(table,{source,t}));}
export function availableReportVisuals(visuals){
 return list(visuals).flatMap(visual=>{
 if(visual.yieldCurve){
  const curveSets=list(visual.curveSets).filter(set=>list(visual.curvePoints).filter(point=>finite(point[set.key])).length>1);
  const curvePoints=list(visual.curvePoints).filter(point=>curveSets.length ? curveSets.every(set=>finite(point[set.key])) : finite(point.value));
  return curvePoints.length>1 ? [{...visual,curveSets,curvePoints}] : [];
 }
  if(visual.equityYears){const rows=list(visual.rows).filter(row=>list(row.cells).some(cell=>finite(cell.value)));return rows.length ? [{...visual,rows}] : [];}
  if(visual.type==='bar'){const bars=list(visual.bars).filter(bar=>finite(bar.value) && !missingReportValue(bar.label));return bars.length ? [{...visual,bars}] : [];}
  const series=list(visual.series).flatMap(item=>{const points=list(item.points).filter(point=>finite(point.value) && Number.isFinite(Date.parse(point.date)));return points.length>1 ? [{...item,points}] : [];});
  return series.length ? [{...visual,series}] : [];
 });
}
export function hasPublishedReportData(model){
 if(!model)return false;
 if(model.newsExecutive)return model.newsExecutive.stories.length>0;
 if(model.panorama)return model.panorama.chapters.some(chapter=>chapter.kind==='news' ? chapter.news.length : hasPublishedReportData(chapter.model));
 return availableReportTables(model.results).length>0 || availableReportVisuals(model.visuals).length>0 || list(model.references).some(item=>finite(item.last?.value) && !item.stale) || list(model.metrics).some(item=>!missingReportValue(item.value) && !/^(?:referencias|comparaciones|fuentes|publicaciones|ano|periodo)/.test(fold(item.label)));
}
export function availablePresentationModel(model,options={}){
 const results=availableReportTables(model.results,options),visuals=availableReportVisuals(model.visuals),metrics=list(model.metrics).filter(item=>!missingReportValue(item.value,options.source)),summaryPanels=list(model.summaryPanels).filter(item=>!missingReportValue(item.body,options.source));
 const history=availableReportTables(model.history,options),tables=availableReportTables(model.tables,options),statistics=availableReportTables(model.statistics,options);
 const blocks=list(model.blocks).filter(block=>block.key==='comparisons' ? results.some(table=>!table.derivatives) : block.key==='derivatives' ? results.some(table=>table.derivatives) : block.key==='leadChart' ? visuals.some(visual=>visual.executiveLead) : block.key==='charts' ? visuals.length : block.key==='results' ? metrics.length : block.key==='history' ? history.length || tables.length : block.key==='statistics' ? statistics.length : block.key==='equityContext' ? results.some(table=>table.equityContext) : true);
 const chapters=model.panorama?.chapters.filter(chapter=>chapter.kind==='news' ? chapter.news.length : hasPublishedReportData(chapter.model));
 const panorama=model.panorama ? {...model.panorama,chapters,facts:list(model.panorama.facts).filter(fact=>chapters.some(chapter=>chapter.label===fact.heading))} : null;
 const desks={};
 for(const key of ['equityExecutive','bondExecutive'])if(model[key])desks[key]={...model[key],dashboard:list(model[key].dashboard).filter(item=>!missingReportValue(item.value,options.source))};
 if(desks.bondExecutive){desks.bondExecutive.yieldCurve=availableReportVisuals([model.bondExecutive.yieldCurve].filter(Boolean))[0] || null;desks.bondExecutive.historical=availableReportVisuals(model.bondExecutive.historical);}
 if(model.fxExecutive){const desk=model.fxExecutive;desks.fxExecutive={...desk,dxy:finite(desk.dxy?.last?.value) ? desk.dxy : null,risk:desk.risk && ['volatility','low','high','scenarioLow','scenarioHigh'].every(key=>finite(desk.risk[key])) ? desk.risk : null};}
 return {...model,results,visuals,metrics,...(Array.isArray(model.summaryPanels) ? {summaryPanels} : {}),history,tables,statistics,blocks,...desks,...(panorama ? {panorama} : {})};
}
