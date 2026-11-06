// One calculation contract for reading, weekly editions and all export formats.
// Percentages always retain their observed base date; missing days are not filled.
import {priceChartGroups,COMPARISON_LINE_LIMIT} from './report-chart-grouping.mjs';
import {globalEquityComparison} from './report-equity-comparison.mjs';
import {safeCommodityDerivatives,commodityDerivativesTables} from './report-commodity-derivatives.mjs';
import {formatFinanceReport} from './report-finance-format.mjs';
import {compactPrintTables} from './report-print-tables.mjs';
import equityCatalog from './report-equity-markets.json' with {type:'json'};
import {isUsProteinReport,usProteinReference,proteinReportReference} from './report-protein-scope.mjs';
import {mercolleidaMarkets} from './report-mercolleida.mjs';
import {safeProteinMarketContext} from './report-protein-quality.mjs';
import {safeProteinFundamentals} from './report-protein-fundamentals.mjs';
import {comparableProteinPoints} from './report-protein-observation-basis.mjs';
import {reportSummaryHighlights,compactHorizonHighlights,executiveSessionFact} from './report-summary-highlights.mjs';
import {proteinPriceTable} from './report-protein-fx.mjs';
import {safeReportOpenInterest,reportOpenInterestTable} from './report-open-interest.mjs';
import {safeEquityContext,equityCurrency} from './report-equity-context.mjs';
import {equityExecutiveReport} from './report-equity-executive.mjs';
import {compactSavedEquityEvidence} from './report-equity-history.mjs';
import {bondExecutiveReport} from './report-bond-executive.mjs';
import {fxExecutiveReport,safeFxTreasuryContext} from './report-fx-executive.mjs';
import {compactFxPoints} from './report-fx-series.mjs';
const finite=value=>typeof value==='number' && Number.isFinite(value);
const fold=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const list=value=>Array.isArray(value) ? value : [];
const DAY=86400000;
const safeUrl=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.href.slice(0,1800) : '';}catch{return '';}};
export const MARKET_PERIODS=[['day','Día'],['week','Semana'],['month','Mes'],['quarter','Trimestre'],['semester','Semestre'],['year','Año'],['ytd','Acumulado del año']];
const countries=[['España',/espana|spain|\blleida\b|bellpuig|zamora/],['Alemania',/alemania|germany|vezg|\bami\b/],['Francia',/francia|france|breton|\bmpb\b|cholet|rungis/],['Países Bajos',/paises bajos|netherlands|beurs|\bbpp\b/],['Dinamarca',/dinamarca|denmark|danish crown/],['Italia',/italia|italy|\bcun\b|modena/],['Bélgica',/belgica|belgium|danis/],['Polonia',/polonia|poland/],['Portugal',/portugal|montijo/],['Reino Unido',/reino unido|united kingdom|\buk\b|\bspp\b|ahdb/],['Irlanda',/irlanda|ireland|bord bia/],['Unión Europea',/union europea|eu-27|\bue\b/],['Noruega',/noruega|norway/],['Escocia',/escocia|scotland/],['Ucrania',/ucrania|ukraine/],['Estados Unidos',/estados unidos|ee\.?\s*uu|united states|\busa\b|\bcme\b|\bcbot\b|\bcomex\b/],['Brasil',/brasil|brazil|cepea/],['México',/mexico|\bmex\b|sniim/],['Canadá',/canada|quebec/],['Chile',/chile|odepa/],['Argentina',/argentina|canuelas/],['Colombia',/colombia|sipsa/],['Perú',/\bperu\b|midagri/],['China',/china|dalian|\bmara\b/]];
const animal=[['Porcino',/cerdo|cerda|porcin|pork|hog|lechon/],['Vacuno',/ganado|vacun|bovin|cattle|carne de res|\bres\b|boi gordo|novill|vaca|anojo|frison|cruzad|terner/],['Pollo',/pollo|chicken|poulet|frango|broiler|pechuga/],['Huevo',/huevo|egg|oeuf|ovo/],['Ovino y cunícola',/cordero|ovino|conejo|cunicol/],['Pescado y acuicultura',/pescad|salmon|fish|acuicult/]];
export function marketCountry(item){const primary=fold(item.market || item.country || ''),text=fold([item.market,item.label,item.exchange].join(' '));return countries.find(([,pattern])=>pattern.test(primary))?.[0] || countries.find(([,pattern])=>pattern.test(text))?.[0] || item.market || item.region || '';}
function grainRegion(item){
  const country=fold(item.market || item.country);
  if(/estados unidos|canada|mexico/.test(country))return 'América del Norte';
  if(/brasil|argentina|chile|peru|colombia/.test(country))return 'América del Sur';
  if(/bolivia|ecuador|uruguay|paraguay/.test(country))return 'América del Sur';
  if(/guatemala|honduras|salvador|nicaragua|costa rica|panama/.test(country))return 'América Central';
  if(/sudafrica|africa/.test(country))return 'África';
  if(/china|tailandia|vietnam|india|japon/.test(country))return 'Asia';
  if(/australia|nueva zelanda/.test(country))return 'Oceanía';
  return /europa|mar negro/.test(fold(item.region)) ? 'Europa y mar Negro' : item.region || item.country;
}
export function proteinSector(item){const text=fold(item.category+' '+item.label);return /procesad|surimi|ahumad|liquido/.test(text) ? 'Procesados y alternativas' : animal.find(([,pattern])=>pattern.test(text))?.[0] || 'Otras proteínas';}
export function americanProtein(item){return !/harina|soya|soja|soybean|\bmeal\b/.test(fold(item.label)) && (fold(item.region)==='america' || countries.some(([,pattern])=>pattern.test(fold([item.market,item.label,item.exchange].join(' ')))));}
export function validMarketPoints(points,cutoff){
  const end=Date.parse(cutoff),values=new Map(),conflicts=new Set();
  if(!finite(end))return [];
  for(const item of list(points)){
    const date=String(item?.date || '').slice(0,10),time=Date.parse(item?.date);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !finite(time) || new Date(Date.parse(date)).toISOString().slice(0,10)!==date || time>end || !finite(item?.value))continue;
    if(values.has(date) && values.get(date).value!==item.value)conflicts.add(date);
    values.set(date,{date,value:item.value});
  }
  return [...values.values()].filter(item=>!conflicts.has(item.date)).sort((a,b)=>a.date.localeCompare(b.date));
}
function monthBefore(date,months){
  const target=new Date(date+'T00:00:00Z'),day=target.getUTCDate();target.setUTCDate(1);target.setUTCMonth(target.getUTCMonth()-months);
  const end=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(day,end));return target.toISOString().slice(0,10);
}
function before(points,target,tolerance){return [...points].reverse().find(item=>item.date<=target && Date.parse(target)-Date.parse(item.date)<=tolerance*DAY);}
function compare(base,last){return base && last && base.date<last.date && base.value>0 ? {value:(last.value/base.value-1)*100,baseDate:base.date,lastDate:last.date,base:base.value,last:last.value} : null;}
export function marketPeriods(points,cadence='daily'){
  const last=points.at(-1);if(!last)return {};
  const tolerance=({daily:7,weekly:10,monthly:40,annual:370})[cadence] || 7;
  const at=(target,days=tolerance)=>compare(before(points,target,days),last);
  const historyBase=points.find(item=>item.date>='2020-01-01'),base2020=points.find(item=>item.date.startsWith('2020-'));
  return {day:cadence==='daily' ? compare(points.at(-2) && Date.parse(last.date)-Date.parse(points.at(-2).date)<=7*DAY ? points.at(-2) : null,last) : null,
    week:['daily','weekly'].includes(cadence) ? at(new Date(Date.parse(last.date)-7*DAY).toISOString().slice(0,10)) : null,
    month:cadence==='annual' ? null : at(monthBefore(last.date,1)),quarter:cadence==='annual' ? null : at(monthBefore(last.date,3)),semester:cadence==='annual' ? null : at(monthBefore(last.date,6)),year:at(monthBefore(last.date,12)),ytd:cadence==='annual' ? null : at((Number(last.date.slice(0,4))-1)+'-12-31'),
    since2020:compare(base2020,last),history:compare(historyBase,last)};
}
// Retain exact comparison bases plus recent observations and monthly context.
// This bounds saved copies without losing a weekly/monthly/annual base.
export function compactMarketPoints(points,cadence='daily',recentLimit=65,{preserveExtremes=false}={}){
  const last=points.at(-1);if(!last)return [];
  const keep=new Set(points.slice(-recentLimit).map(item=>item.date)),periods=marketPeriods(points,cadence),months=new Map();
  const historyStart=points.find(item=>item.date>='2020-01-01');if(historyStart)keep.add(historyStart.date);
  for(const period of Object.values(periods))if(period)keep.add(period.baseDate);
  for(const item of points)if(item.date>='2019-12-01')months.set(item.date.slice(0,7),item);
  for(const item of months.values())keep.add(item.date);
  for(let year=2020;year<=Number(last.date.slice(0,4));year++){
    const target=monthBefore(last.date,(Number(last.date.slice(0,4))-year)*12),item=before(points,target,cadence==='monthly' ? 40 : cadence==='weekly' ? 10 : 7);if(item)keep.add(item.date);
    for(const point of points)if(Math.abs(Date.parse(point.date)-Date.parse(target))<=7*DAY)keep.add(point.date);
  }
  if(preserveExtremes){
    const history=points.filter(item=>item.date>='2020-01-01');
    if(history.length){keep.add(history.reduce((a,b)=>a.value<b.value ? a : b).date);keep.add(history.reduce((a,b)=>a.value>b.value ? a : b).date);}
    for(const point of history)if(point.value<=0)keep.add(point.date);
    const required=new Set([...points.slice(-recentLimit).map(item=>item.date),...Object.values(periods).filter(Boolean).map(item=>item.baseDate),...(historyStart ? [historyStart.date] : []),...history.filter(item=>item.value<=0).map(item=>item.date)]);
    if(history.length){required.add(history.reduce((a,b)=>a.value<b.value ? a : b).date);required.add(history.reduce((a,b)=>a.value>b.value ? a : b).date);}
    const selected=points.filter(item=>keep.has(item.date));
    while(selected.length>256){const removable=selected.findIndex(item=>!required.has(item.date));if(removable<0)break;selected.splice(removable,1);}
    return selected;
  }
  return points.filter(item=>keep.has(item.date)).slice(-256);
}
export function marketEvidence(report){
  const snapshot=report.sourceSnapshot || {},key=report.baseReport?.key || report.key,baseQuotes=(report.causeText || report.baseReport?.key==='equities') && list(report.marketHistory).length ? report.marketHistory : [...list(snapshot.equities).map(item=>({...item,unit:'puntos'})),...list(snapshot.bonds).map(item=>({...item,unit:'%'})),...list(snapshot.grains).map(item=>key==='overview' ? {...item,category:'grains'} : item),...list(snapshot.energy).map(item=>key==='overview' ? {...item,category:'energy_metals'} : item),...list(snapshot.proteins).map(item=>key==='overview' ? {...item,category:'proteins'} : item),...list(snapshot.quotes),...list(snapshot.fxHistories).map(item=>({...item,label:'USD/'+item.quoteCurrency,unit:item.quoteCurrency+' por 1 USD'})),...list(report.marketHistory),...list(report.equityObservations).map(item=>({...item,unit:'puntos'})),...list(report.bondObservations).map(item=>({...item,unit:'%'})),...list(report.sessionObservations),...list(report.dailyReferences)];
  const injectMercolleida=isUsProteinReport(report) && report?.proteinScope!=='US_ONLY' && !/simulaci[oó]n|datos sint[eé]ticos|fixture/i.test((report.title || '')+' '+(report.summary || '')) && baseQuotes.some(item=>['HE=F','LE=F','GF=F'].includes(item?.symbol || item?.ticker) && !/fixture|sint[eé]tic|prueba/i.test(item?.source || '')) && !baseQuotes.some(item=>item?.provider==='mercolleida' || /^MERCO-/.test(item?.symbol || item?.ticker || ''));
  const quotes=injectMercolleida ? [...baseQuotes,...mercolleidaMarkets(report.generatedAt)] : baseQuotes;
  const seen=new Map(),proteinFilter=report?.proteinScope==='US_ONLY' ? usProteinReference : proteinReportReference;
  for(const item of quotes){
    if(isUsProteinReport(report) && !proteinFilter(item))continue;
    const label=String(item.label || item.name || '').slice(0,140),unit=String(item.unit || '').slice(0,80);
    // Export text normalizes numeric ranges (600–900 → 600-900). That is
    // still the same reference, not a second market observation.
    const identity=label.replace(/(\d)[–−](?=\d)/g,'$1-'),id=(key==='fx' ? identity.match(/^USD\/[A-Z]{3}/)?.[0] || identity : identity)+'|'+unit;
    if(!label || !unit)continue;
    // VES=X carried the old monetary scale through 2021-10-03. Do not chain
    // that scale to the post-reconversion quotes or manufacture an adjustment.
    // BCV reform effective 2021-10-01: comunicado_bolivardigital.pdf.
    const current=seen.get(id);
    const metadata={...item};for(const field of ['source','url','market','region','exchange','currency','symbol','ticker','basis','category','cadence','provider','quoteStatus','retrievedAt','evidenceOrigin','catalogUpdatedAt','publishedAt','reportPeriodStart','reportPeriodEnd','sourceDocumentHash'])if(!metadata[field] && current?.[field])metadata[field]=current[field];
    const observations=validMarketPoints(item.series || item.points || item.recentSeries,report.generatedAt).filter(point=>key!=='fx' || !/^USD\/VES(?:\b| ·)/.test(label) || report.generatedAt<'2021-10-04' || point.date>='2021-10-04');
    const points=isUsProteinReport(report) ? comparableProteinPoints(metadata,observations) : observations;
    if(current && current.points.length>=points.length)continue;
    const catalog=key==='equities' ? equityCatalog.markets.find(entry=>entry.label===label || metadata.symbol && entry.symbol===metadata.symbol) : null;
    seen.set(id,{label,unit,...(isUsProteinReport(report) ? {provider:String(metadata.provider || '').slice(0,80),quoteStatus:/^MERCO-/.test(metadata.symbol || metadata.ticker || '') ? 'reference' : ['verified','preserved','reference','unavailable'].includes(metadata.quoteStatus) ? metadata.quoteStatus : 'unconfirmed',evidenceOrigin:/^MERCO-/.test(metadata.symbol || metadata.ticker || '') ? 'catalog' : metadata.evidenceOrigin==='catalog' ? 'catalog' : 'provider',retrievedAt:Number.isFinite(Date.parse(metadata.retrievedAt)) && Date.parse(metadata.retrievedAt)<=Date.parse(report.generatedAt) ? new Date(metadata.retrievedAt).toISOString() : null,publishedAt:String(metadata.publishedAt || '').slice(0,10),reportPeriodStart:String(metadata.reportPeriodStart || '').slice(0,10),reportPeriodEnd:String(metadata.reportPeriodEnd || '').slice(0,10),sourceDocumentHash:/^[a-f0-9]{64}$/.test(metadata.sourceDocumentHash || '') ? metadata.sourceDocumentHash : ''} : {}),currency:equityCurrency(metadata.currency),market:String(metadata.market || catalog?.market || '').slice(0,100),region:String(metadata.region || catalog?.region || '').slice(0,40),exchange:String(metadata.exchange || catalog?.exchange || '').slice(0,80),source:String(metadata.source || '').slice(0,240),url:safeUrl(metadata.url),cadence:['daily','weekly','monthly','annual','auction'].includes(metadata.cadence) ? metadata.cadence : 'daily',category:String(metadata.category || '').slice(0,80),basis:String(metadata.basis || '').slice(0,400),symbol:String(metadata.symbol || metadata.ticker || '').slice(0,50),kind:['equity','volatility','informational'].includes(metadata.kind) ? metadata.kind : '',points});
  }
  return [...seen.values()].slice(0,192).map(item=>({...item,points:key==='fx' ? compactFxPoints(item.points,marketPeriods(item.points)) : compactMarketPoints(item.points,item.cadence,65,{preserveExtremes:key==='energy_metals' || key==='overview' && item.category==='energy_metals'})}));
}
export function safeMarketFx(input,cutoff){
  if(!input || input.base!=='USD' || !finite(Date.parse(cutoff)) || !finite(Date.parse(input.observedAt)) || Date.parse(input.observedAt)>Date.parse(cutoff) || Date.parse(cutoff)-Date.parse(input.observedAt)>3*DAY)return undefined;
  const rates=Object.fromEntries(['USD','EUR','CNY','MXN','CAD','BRL','CLP','ARS','COP','PEN'].filter(code=>finite(input.rates?.[code]) && input.rates[code]>0).map(code=>[code,input.rates[code]]));
  if(rates.USD!==1 || !rates.MXN)return undefined;
  return {base:'USD',observedAt:new Date(input.observedAt).toISOString(),source:String(input.source || '').slice(0,240),url:safeUrl(input.url),rates};
}
export function focusedEvidence(report,{saved=false}={}){
 if((report.baseReport?.key || report.key)==='bonds')return report.analysisPeriod==='weekly' ? {analysisPeriod:'weekly'} : {};
 const history=marketEvidence(report),context=safeEquityContext(report.equityContext,report.generatedAt),fx=safeMarketFx(report.marketFx,report.generatedAt),interest=safeReportOpenInterest(report.marketOpenInterest,report.generatedAt),equity=(report.baseReport?.key || report.key)==='equities',compact=saved && equity ? compactSavedEquityEvidence(history,context,marketPeriods) : null;
 const protein=isUsProteinReport(report),feed=protein ? marketEvidence({key:'grains',collection:'markets',generatedAt:report.generatedAt,sourceSnapshot:{grains:Array.isArray(report.proteinFeed) ? report.proteinFeed.slice(0,4) : []}}).filter(item=>item.symbol==='ZC=F' && item.unit==='US¢/bu' || item.symbol==='ZM=F' && item.unit==='USD/t corta') : [];
 return {...(protein && report.proteinMarketContext ? {proteinMarketContext:safeProteinMarketContext(report.proteinMarketContext,report.generatedAt)} : {}),...(protein && report.proteinFundamentals ? {proteinFundamentals:safeProteinFundamentals(report.proteinFundamentals,report.generatedAt)} : {}),...(feed.length ? {proteinFeed:feed} : {}),...(report.fxTreasury ? {fxTreasury:safeFxTreasuryContext(report.fxTreasury,report.generatedAt)} : {}),...(report.equityContext ? {equityContext:compact?.equityContext || context} : {}),...(report.marketDerivatives ? {marketDerivatives:safeCommodityDerivatives(report.marketDerivatives,report.generatedAt)} : {}),...(history.length ? {marketHistory:compact?.marketHistory || history} : {}),...(fx ? {marketFx:fx} : {}),...(interest.length ? {marketOpenInterest:interest} : {}),...(report.analysisPeriod==='weekly' ? {analysisPeriod:'weekly'} : {}),...(typeof report.analysisBenchmark==='string' ? {analysisBenchmark:report.analysisBenchmark.slice(0,140)} : {})};
}
const number=value=>finite(value) ? value.toLocaleString('es-MX',{maximumFractionDigits:Math.abs(value)<.01 ? 6 : 3}) : '—';
export function directionalChange(value){return finite(value) ? (value>0 ? '↑ +' : value<0 ? '↓ ' : '→ ')+number(value)+' %' : '—';}
export function marketAnalysisTables(report){
  const history=(report.baseReport?.key || report.key)==='fx' ? fxExecutiveReport(report,{}).references : marketEvidence(report),rows=[];
  for(const item of history){const periods=marketPeriods(item.points,item.cadence);if(isUsProteinReport(report)){periods.since2020=compare(item.points.find(point=>point.date.startsWith('2020-')),item.points.at(-1));delete periods.history;}for(const [period,change] of Object.entries(periods))if(change)rows.push([item.label,MARKET_PERIODS.find(([key])=>key===period)?.[1] || (period==='history' ? 'Desde inicio disponible' : 'Desde 2020'),item.unit,change.base,change.baseDate,change.last,change.lastDate,change.value,item.cadence,item.source]);}
  const tables=rows.length ? [{title:'Bases y fechas de las variaciones',columns:['Referencia','Horizonte','Unidad original','Valor base','Fecha base','Último','Fecha último','Variación · %','Frecuencia original','Fuente'],rows,note:'Bases observadas de la misma serie; no se completan huecos ni se encadenan mercados.'}] : [];
  if((report.baseReport?.key || report.key)==='grains'){
    const preserved=(report.sourceSnapshot?.grains || []).filter(item=>item.quoteStatus==='preserved' && history.some(reference=>reference.label===item.label && reference.unit===item.unit));
    if(preserved.length)tables.push({title:'Granos · fuentes conservadas como respaldo fechado',columns:['Referencia','Unidad','Fecha del precio','Estado','Fuente','Enlace'],rows:preserved.map(item=>[item.label,item.unit,item.observedAt,'Respaldo fechado; no revalidado en la última actualización',item.source,item.url]),note:'La fecha del informe no convierte un precio conservado en una nueva publicación. Una interrupción de la fuente no confirma ni invalida por sí sola el precio anterior.'});
  }
  const data=safeCommodityDerivatives(report.marketDerivatives,report.generatedAt),symbols=new Set(history.map(item=>item.symbol)),derivatives=[...data.options,...data.futures].filter(item=>symbols.has(item.symbol));
  if(derivatives.length)tables.push({title:'Derivados · respaldo de observaciones',columns:['Producto','Símbolo','Serie','Mes de serie','Lado','Fecha','OI · contratos','Cambio · contratos','Estado','Consulta','Fuente','Documento','Página'],rows:derivatives.map(item=>[item.label,item.symbol,item.productCode,item.contractMonth || 'Todos los vencimientos',item.side || 'Futuro',item.date,item.openInterest,item.changeOpenInterest ?? '—',item.status,item.retrievedAt,item.source,item.url,item.page]),note:'Unidades enteras publicadas por serie. El mes de serie no es una fecha exacta de vencimiento.'});
  return tables;
}
function indexedChart(references,title,benchmark){
  const eligible=references.filter(item=>item.points.length>1 && item.points.at(-1).value>0);
  if(eligible.length<2)return null;
  const start=eligible.map(item=>item.points[0].date).sort().at(-1),common=eligible[0].points.map(item=>item.date).filter(date=>date>=start && eligible.every(item=>item.points.some(point=>point.date===date && point.value>0)));
  if(common.length<2)return null;
  const first=common[0],last=common.at(-1),series=[...eligible].sort((a,b)=>Number(b.label===benchmark)-Number(a.label===benchmark)).map(item=>{
    const base=item.points.find(point=>point.date===first).value,all=item.points.filter(point=>point.date>=first && point.date<=last),sample=all.length<=100 ? all : Array.from({length:100},(_,index)=>all[Math.round(index*(all.length-1)/99)]);
    return {label:item.label,points:sample.map(point=>({date:point.date,value:point.value/base*100}))};
  });
  const indexDateNote=`Base común: ${first}. Últimas observaciones hasta ${last}.`;
  return {type:'line',title,unit:'Índice base 100',indexBaseDate:first,indexEndDate:last,indexDateNote,note:indexDateNote+' Se comparan trayectorias relativas, no niveles de monedas ni precios físicos. No se rellenan días sin publicación.',series};
}
function referenceLabel(item,t){const country=countries.find(([country])=>country===item.country),included=country?.[1].test(fold(item.label)) || fold(item.label).includes(fold(item.country));return t(item.label)+(item.country && !included ? '\n'+t(item.country) : '');}
function performanceTable(references,title,t,protein=false){
  const hasMercolleida=protein && references.some(item=>/^MERCO-/.test(item.symbol || ''));
  const periods=[...MARKET_PERIODS,...(protein ? [['since2020','Desde 2020']] : [])].filter(([key])=>!(hasMercolleida && key==='day') && references.some(item=>item.periods[key]));
  if(!periods.length)return null;
  return {title:t(title),printGroup:'market-returns',printTitle:t('Variaciones por horizonte'),columns:[t('País / referencia'),...periods.map(([key,label])=>t(key==='ytd' ? 'Acum. '+references[0].last.date.slice(0,4) : label))],rows:references.map(item=>[referenceLabel(item,t),...periods.map(([key])=>directionalChange(item.periods[key]?.value))]),note:t('Variaciones sobre la moneda y unidad originales. Día: última sesión cerrada contra la anterior. Semana: siete días calendario; mes, trimestre, semestre y año: fechas equivalentes. Se toma la última publicación anterior a la fecha objetivo, dentro de la tolerancia de su frecuencia. —: sin base comparable; no se interpola. Las bases y fechas se conservan en los anexos.')+(protein ? ' '+t('Desde 2020 compara la primera observación verificable de la serie en 2020 con el último dato. Su base puede diferir de la tabla interanual, que compara la misma altura de cada año; ambas fechas constan en los anexos.') : '')};
}
function availableModel(model){
  const missing=value=>value==null || typeof value==='number' && !finite(value) || typeof value==='string' && /^(?:\s*|—|–|-|sin datos?(?:\s.*)?|sin precio(?:\s.*)?|no disponible|no calculable|no aplica|no diaria)$/i.test(value.trim());
  const results=list(model.results).map(table=>{
    const values=table.columns.map((label,index)=>/^(?:último|precio|valor|rendimiento)(?:\s|\(|\/|$)/i.test(label) ? index : -1).filter(index=>index>=0);
    return {...table,rows:table.rows.filter(row=>values.length ? values.some(index=>!missing(row[index])) : row.slice(1).some(value=>!missing(value)))};
  }).filter(table=>table.rows.length);
  const references=list(model.references).filter(item=>list(item.points).some(point=>finite(point.value)));
  const visuals=list(model.visuals).map(visual=>visual.type==='bar' ? {...visual,bars:list(visual.bars).filter(item=>finite(item.value))} : {...visual,series:list(visual.series).map(item=>({...item,points:list(item.points).filter(point=>finite(point.value))})).filter(item=>item.points.length)}).filter(visual=>visual.type==='bar' ? visual.bars.length : visual.series.length);
  return {...model,results,references,visuals};
}
export function focusedMarketReport(report,model,{t:labels=value=>value}={}){
  const t=value=>report.causeText?.[value] || labels(value);
  if(report.periodType==='annual')return {...model,metrics:[],blocks:model.blocks.filter(block=>!['results','indicators'].includes(block.key))};
  if(!model.sessionReport)return {...model,metrics:[]};
  const key=report.baseReport?.key || report.key,area=report.baseReport?.collection || report.collection;
  if(key==='bonds' && (!area || area==='finance'))return bondExecutiveReport(report,model,{t});
  if(key==='fx' && (!area || area==='finance'))return fxExecutiveReport(report,model,{t});
  const protein=key==='proteins' && (!area || area==='markets'),equity=key==='equities',fx=key==='fx',commodity=['grains','energy_metals','proteins'].includes(key),weekly=report.analysisPeriod==='weekly';
  const supported=equity || fx || commodity;
  if(!supported)model=availableModel(model);
  const proteinFilter=report?.proteinScope==='US_ONLY' ? usProteinReference : proteinReportReference;
  let references=marketEvidence(report).map(item=>{const last=item.points.at(-1),previous=item.points.at(-2),periods=marketPeriods(item.points,item.cadence),delta=item.cadence==='daily' && periods.day && previous ? last.value-previous.value : null,percent=item.cadence==='daily' && periods.day ? periods.day.value : null;if(protein)periods.since2020=compare(item.points.find(point=>point.date.startsWith('2020-')),last);return {...item,last,previous,delta,percent,country:report?.proteinScope==='US_ONLY' ? 'Estados Unidos' : marketCountry(item),sector:protein ? proteinSector(item) : key,periods};}).filter(item=>item.last && (equity || fx ? item.last.value>0 : true) && (!protein || item.last.value>0 && proteinFilter(item)) && (!equity || !/vix/i.test(item.label) && item.kind!=='informational'));
  if(supported)references=references.filter(item=>Date.parse(report.generatedAt)-Date.parse(item.last.date)<=(({daily:equity ? 21 : 7,weekly:21,monthly:70,annual:370})[item.cadence] || 14)*DAY);
  const grainRegions=['América del Norte','América Central','América del Sur','Europa y mar Negro','Asia','África','Oceanía'];
  const subVariant=item=>/selecto|graso|desvieje|\bsow\b|lechon|piglet|zamora|sp-carcass|hembra|frison|gf=f|egg-m\b/i.test((item.symbol || '')+' '+fold(item.label)) ? 1 : 0;
  references.sort((a,b)=>(key==='grains' ? grainRegions.indexOf(grainRegion(a))-grainRegions.indexOf(grainRegion(b)) : (countries.findIndex(([country])=>country===a.country)+1 || 99)-(countries.findIndex(([country])=>country===b.country)+1 || 99)) || a.country.localeCompare(b.country,'es') || a.sector.localeCompare(b.sector,'es') || (protein ? subVariant(a)-subVariant(b) : 0) || a.label.localeCompare(b.label,'es'));
  if(protein && report?.proteinScope!=='US_ONLY'){
    const seenCountrySector=new Map();
    references=references.map(item=>{const k=item.sector+'|'+item.country,tier=seenCountrySector.get(k) || 0;seenCountrySector.set(k,tier+1);return {...item,_tier:tier};}).sort((a,b)=>a._tier-b._tier || (countries.findIndex(([country])=>country===a.country)+1 || 99)-(countries.findIndex(([country])=>country===b.country)+1 || 99) || a.label.localeCompare(b.label,'es')).map(({_tier,...item})=>item);
  }
  const mainPeriod=weekly ? 'week' : 'day',ranked=references.filter(item=>item.periods[mainPeriod]).sort((a,b)=>Math.abs(b.periods[mainPeriod].value)-Math.abs(a.periods[mainPeriod].value));
  const leader=ranked[0],move=leader?.periods[mainPeriod];
  const summary=supported && leader ? executiveSessionFact(references,{period:mainPeriod,t,change:directionalChange}) : supported && references.length ? `${references.slice(0,3).map(item=>item.label+': '+number(item.last.value)+' '+item.unit+' al '+item.last.date).join('; ')}. No se publica una variación sin una base comparable.` : protein ? 'Estados Unidos: no hay precios recientes verificables para este corte. No se sustituyen con cotizaciones de otros países ni se calculan variaciones sin observaciones comparables.' : model.summary;
  const highlightGroups=new Map();
  if(supported)for(const [period,label] of [...MARKET_PERIODS,...(protein ? [['since2020','Desde 2020']] : [])].filter(([period])=>['day','month',...(protein ? ['since2020'] : []),'quarter','semester','year','ytd'].includes(period) && !(leader && period===mainPeriod))){
    const selected=references.filter(item=>item.periods[period]).sort((a,b)=>Math.abs(b.periods[period].value)-Math.abs(a.periods[period].value))[0],change=selected?.periods[period];
    if(!change)continue;
    const id=JSON.stringify([selected.label,selected.unit,change.baseDate,change.lastDate,change.base,change.last]);
    if(!highlightGroups.has(id))highlightGroups.set(id,{labels:[],selected,change});
    highlightGroups.get(id).labels.push(label);
  }
  const highlights=compactHorizonHighlights(highlightGroups.values(),{t,change:directionalChange});
  const causal=protein || key==='grains' ? [] : (model.commentary || []).filter(item=>/causa|transmit|repercu|consecu|factores/i.test(item.heading || '') && !/méxico|porcino|vacuno|pollo|huevo|pescado|alimentaci/i.test(item.heading || '')).slice(0,3);
  const summaryPanels=[{heading:t('Qué pasó'),body:t(summary)},...(highlights ? [{heading:t('Claves por horizonte'),body:t(highlights)}] : []),...(equity ? [] : causal.map(item=>({...item,heading:t(item.heading)})))].filter(item=>item.body);
  if(key==='grains' && references.length){
    const regions=grainRegions.filter(region=>references.some(item=>grainRegion(item)===region));
    const panorama=regions.map(region=>{
      const items=references.filter(item=>grainRegion(item)===region && item!==leader);
      // Each region keeps its own observation frequency and comparison dates.
      const period=(weekly ? ['week','day','month'] : ['day','week','month']).find(period=>items.some(item=>item.periods[period]));
      const regionalLeader=period && items.filter(item=>item.periods[period]).sort((a,b)=>Math.abs(b.periods[period].value)-Math.abs(a.periods[period].value))[0],change=regionalLeader?.periods[period];
      return change ? region+': '+regionalLeader.label+' '+directionalChange(change.value)+' ('+({day:'sesión',week:'semana',month:'mes'})[period]+'; '+change.baseDate+' / '+change.lastDate+').' : '';
    }).filter(Boolean).join('\n');
    const scope=regions.map(t).join(', ');
    const effects=(model.commentary || []).find(panel=>panel.heading===t('Qué repercusiones puede tener'))?.body;
    const implications=[t('Un movimiento de futuros no demuestra un cambio del precio físico en otro país. Para contrastar oferta, revisar cosecha, existencias, exportaciones, clima y logística del mismo mercado. En compras, comparar calidad, etapa, moneda y flete.'),effects,references.some(item=>/\bFOB\b/.test(item.basis)) ? t('FOB excluye el transporte hasta destino.') : '',references.some(item=>item.country==='Argentina') ? t('La referencia FOB oficial argentina es administrativa.') : ''].filter(Boolean).join(' ');
    if(panorama)summaryPanels.push({heading:t('Panorama mundial'),body:t(panorama)});
    summaryPanels.push({heading:t('Cómo se explica y qué implica'),body:scope+'. '+implications});
  }
  if(protein && leader)summaryPanels.push({heading:t('Efecto en compras e inventarios'),body:t(`${move.value>0 ? 'El alza puede encarecer la reposición y presionar el margen si no se traslada a la venta.' : move.value<0 ? 'La baja puede aliviar la reposición y reducir el valor de inventarios comprados a un precio mayor.' : 'El precio publicado no cambió; flete, tipo de cambio o rendimiento todavía pueden modificar el costo entregado.'} Es un canal posible, no una causa confirmada. La referencia conserva su presentación, plaza y etapa comercial; no se aplica su porcentaje a otros productos.`)});
  if(protein)summaryPanels.push({heading:t('Cómo se explica'),body:t(report?.proteinScope==='US_ONLY' ? 'La lectura se limita a referencias de Estados Unidos. Los precios observados no permiten atribuir por sí solos una causa. Para explicar el movimiento se deben contrastar publicaciones fechadas de oferta, faena, inventarios y demanda del mismo producto y mercado; los futuros de CME se mantienen separados de los precios físicos de USDA.' : 'El informe integra las cotizaciones internacionales de Mercolleida (España, Alemania, Francia, Países Bajos, Dinamarca, Italia, Bélgica, Polonia, Portugal, Reino Unido, Irlanda, UE-27, Brasil, China y Ucrania) junto con referencias físicas de América, Europa y futuros de CME y Dalian. Los precios observados conservan su moneda, presentación (vivo, canal o despiece) y frecuencia; no se encadenan mercados ni se atribuyen causas sin evidencia fechada.')});
  if(equity){
    const enriched=reportSummaryHighlights({summaryPanels,references,benchmark:true,analysisPeriod:weekly ? 'weekly' : 'daily'},{t});
    summaryPanels.splice(0,summaryPanels.length,...enriched);
    const seen=new Set(),up=ranked.filter(item=>item.periods[mainPeriod].value>0).length,down=ranked.filter(item=>item.periods[mainPeriod].value<0).length;
    for(const panel of summaryPanels)panel.body=panel.body.replace('Las alzas de '+up+' índices','Las alzas').replace('Las bajas de '+down+' índices','Las bajas').split(/\n{2,}/).filter(part=>{const key=part.replace(/\s+/g,' ').trim();if(seen.has(key))return false;seen.add(key);return true;}).join('\n\n');
  }
  let results=model.results,visuals=key.endsWith('_news') ? [] : model.visuals,yearComparisons=[];
  const marketFx=safeMarketFx(report.marketFx,report.generatedAt);
  if(supported){
    results=[];visuals=[];
    const groupFor=item=>protein ? item.sector : equity ? item.region || item.country || 'Mercado' : item.country || item.region || 'Mercado';
    const proteinOrder=['Porcino','Vacuno','Pollo','Huevo'];
    const speciesTitles={
      Porcino:'Cerdo (Porcino) · precios de lonjas, mercados físicos y futuros',
      Vacuno:'Res (Vacuno) · precios de lonjas, mercados físicos y futuros',
      Pollo:'Pollo · precios de lonjas y mercados físicos',
      Huevo:'Huevo · precios de lonjas, mercados físicos y futuros',
    };
    const rawGroups=[...new Set(references.map(groupFor))];
    if(protein)rawGroups.sort((a,b)=>((proteinOrder.indexOf(a)+1)||99)-((proteinOrder.indexOf(b)+1)||99));
    const groups=fx ? [['Todas las monedas',references]] : rawGroups.map(label=>[label,references.filter(item=>groupFor(item)===label)]);
    for(const [label,items] of groups){
      if(!items.length)continue;
      if(fx){
        results.push({title:t('Divisas · cotizaciones frente al dólar'),columns:['Par','Unidades por 1 USD','Anterior','Fecha anterior','Fecha del dato'].map(t),rows:items.map(item=>[item.label,number(item.last.value),number(item.previous?.value),item.previous?.date || '—',item.last.date]),note:t('Cada par indica unidades de moneda local por 1 USD. Son valores publicados por cada fuente; pueden corresponder a promedios o referencias oficiales, no necesariamente a un cierre negociable. Las fechas se conservan por moneda.')});
        const variations=performanceTable(items,'Divisas · variaciones por horizonte',t);if(variations)results.push({...variations,note:t('Una subida del par USD/moneda local indica depreciación de la moneda local frente al dólar; una baja indica apreciación. ')+variations.note});
      }
      else{
        const currency=protein ? proteinPriceTable(items,marketFx,{cutoff:report.generatedAt,title:label+' · cierres y precios publicados',t}) : null;
        const globalProtein=protein && report?.proteinScope!=='US_ONLY' && !currency;
        const tableTitle=globalProtein && speciesTitles[label] ? speciesTitles[label] : label+' · cierres y precios publicados';
        const showPrev=item=>item.cadence==='daily' || (globalProtein && item.cadence==='weekly');
        results.push(currency || {title:t(tableTitle),printGroup:'market-levels',market:globalProtein ? label : undefined,printTitle:t(globalProtein && speciesTitles[label] ? speciesTitles[label] : 'Cierres y precios publicados'),columns:[t('País / referencia'),t('Unidad original'),t('Cierre anterior'),t('Fecha anterior'),t('Último publicado'),t('Fecha del dato')],rows:items.map(item=>[referenceLabel(item,t)+((key==='grains' || protein) && item.cadence!=='daily' ? '\n'+t(({weekly:'Semanal',monthly:'Promedio mensual'})[item.cadence] || item.cadence) : ''),item.unit,number(showPrev(item) ? item.previous?.value : null),showPrev(item) ? item.previous?.date || '—' : '—',number(item.last.value),item.last.date]),note:t('Se conserva la unidad, presentación y frecuencia de cada fuente. Un precio semanal o mensual no se repite como una observación diaria. Cierre anterior significa la sesión publicada previa, con su fecha.')});
        const table=performanceTable(items,label+' · variaciones',t,protein);if(table)results.push(table);
      }
    }
    if(commodity){
      const family=item=>protein ? item.sector : key==='grains' ? 'Granos' : /petroleo|brent|wti/.test(fold(item.label)) ? 'Petróleo' : /gas|henry|ttf/.test(fold(item.label)) ? 'Gas' : 'Metales';
      const eligible=references.map(item=>({...item,points:item.points.filter(point=>Date.parse(item.last.date)-Date.parse(point.date)<=185*DAY)})).filter(item=>item.points.length>1);
      for(const group of priceChartGroups(eligible,{family}))visuals.push({type:'line',title:t([group.label+' · tendencia de precios',group.basisLabel,group.unit].filter(Boolean).join(' · ')+(group.parts>1 ? ' · '+group.part : '')),unit:group.unit,cadence:group.cadence,series:group.items.map(item=>({label:t(item.label),points:item.points})),note:t('Muestra de cierres mensuales y observaciones recientes de los últimos seis meses disponibles. Las variaciones por horizonte se presentan en las tablas; no se rellenan días ni se mezclan unidades. Las líneas conservan su producto, presentación y fechas; no representan un promedio ni un precio intercambiable.')});
      if(protein){
        const history=references.filter(item=>['HE=F','LE=F','GF=F'].includes(item.symbol) && item.cadence==='daily' && item.points.some(point=>point.date>='2020-01-01' && point.date<'2021-01-01')).map(item=>({...item,points:item.points.filter(point=>point.date>='2020-01-01')}));
        const chart=indexedChart(history,t('Estados Unidos · futuros de proteínas · 2020 a la fecha'),history[0]?.label);
        if(chart)visuals.push({...chart,requiredInPrint:true,note:chart.indexDateNote+' '+t('Índice base 100 de las mismas series de futuros estadounidenses, calculado sobre una fecha común observada desde 2020. Compara variaciones relativas; no son precios físicos ni rentabilidad con renovación de contratos. Se conservan observaciones mensuales y recientes, sin rellenar días ni encadenar proveedores.')});
      }
    }
    const benchmark=references.find(item=>item.label===report.analysisBenchmark)?.label || references.find(item=>/s&p 500/i.test(item.label))?.label || references.find(item=>item.country==='Estados Unidos')?.label || references[0]?.label;
    if(fx){const start=Date.parse(report.generatedAt)-185*DAY,chart=indexedChart(references.map(item=>({...item,points:item.points.filter(point=>Date.parse(point.date)>=start)})),t('Divisas · comparación histórica unificada · seis meses'),benchmark);if(chart)visuals.push({...chart,note:chart.indexDateNote+' '+t('Trayectorias relativas con una base común; las cotizaciones originales y sus fechas están en las tablas. No se rellenan días ni se encadena el bolívar anterior a la reconversión de 2021 con su expresión actual.')});}
    if(equity){
      const selected=references.find(item=>item.label===benchmark),regionFor=item=>item.region==='México' || item.country==='México' ? 'América' : item.region || item.country;
      const regions=[...new Set(references.map(regionFor))].sort((a,b)=>Number(b==='América')-Number(a==='América')),size=COMPARISON_LINE_LIMIT-1;
      for(const region of regions){
        const peers=references.filter(item=>item.label!==benchmark && regionFor(item)===region);
        for(let offset=0;offset<peers.length;offset+=size){
          const mini=indexedChart([selected,...peers.slice(offset,offset+size)].filter(Boolean),t(benchmark+' frente a '+region)+(offset ? ' · '+(offset/size+1) : ''),benchmark);
          if(mini)visuals.push({...mini,equityComparison:true});
        }
      }
      const chart=globalEquityComparison(references,{cutoff:report.generatedAt,benchmark,t});if(chart)visuals.push(chart);
    }
    for(const item of references){const values=[];for(let year=Number(item.last.date.slice(0,4));year>=2020;year--){const target=monthBefore(item.last.date,(Number(item.last.date.slice(0,4))-year)*12),point=before(item.points,target,item.cadence==='monthly' ? 40 : item.cadence==='weekly' ? 10 : 7);if(point && point.date.startsWith(year+'-'))values.push({year,...point});}if(values.length>1)yearComparisons.push({...item,values});}
    if(yearComparisons.length){const years=[...new Set(yearComparisons.flatMap(item=>item.values.map(value=>value.year)))].sort((a,b)=>b-a);results.push({title:t('Comparación interanual · misma altura del año desde 2020'),printDateColumns:true,printDateNote:t('Las fechas de los encabezados se aplican a su columna; las excepciones mantienen su fecha junto al valor.'),columns:[t('Referencia / unidad'),...years.map(String)],rows:yearComparisons.map(item=>[t(item.label)+'\n'+item.unit,...years.map(year=>{const point=item.values.find(point=>point.year===year);return point ? number(point.value)+'\n'+point.date : '—';})]),note:t(commodity ? 'Se compara la última publicación disponible a la misma fecha calendario de cada año, con tolerancia según la frecuencia. No son promedios anuales ni cierres de diciembre. Los años sin observaciones comparables se omiten. Las series continuas de futuros pueden cambiar de contrato y no equivalen a precios físicos.' : 'Se compara la última publicación disponible a la misma fecha calendario de cada año, con tolerancia según la frecuencia. No son promedios anuales ni cierres de diciembre. Los años sin observaciones comparables se omiten.')});
      if(!fx && !equity && !visuals.some(visual=>visual.requiredInPrint))for(const item of [...yearComparisons].sort((a,b)=>b.values.length-a.values.length).slice(0,1))visuals.push({type:'bar',title:t(item.label+' · comparación interanual'),unit:item.unit,bars:[...item.values].reverse().map(point=>({label:String(point.year),value:point.value})),note:t('Nivel observado a la misma altura de cada año; las fechas exactas están en la tabla interanual. No representa variaciones porcentuales ni un pronóstico.')});
    }
    if(equity && benchmark){const base=references.find(item=>item.label===benchmark),rows=references.filter(item=>item!==base && item.periods[mainPeriod] && base?.periods[mainPeriod] && item.periods[mainPeriod].baseDate===base.periods[mainPeriod].baseDate && item.last.date===base.last.date).map(item=>[item.label,item.country,base.periods[mainPeriod].baseDate+' / '+base.last.date,number(item.periods[mainPeriod].value-base.periods[mainPeriod].value)+' p. p.']);if(rows.length)results.push({title:t('Comparación de '+benchmark+' contra las demás bolsas'),columns:['Bolsa','País','Sesiones comparadas','Diferencia'].map(t),rows,note:t('La diferencia en puntos porcentuales sólo se calcula cuando ambas bolsas tienen exactamente las mismas fechas de comparación. Las demás plazas conservan su propia tabla de cierres.')});}
    if(commodity){const interestTable=reportOpenInterestTable(report.marketOpenInterest,references,{cutoff:report.generatedAt,t});if(interestTable)results.push(interestTable);
      const futures=references.filter(item=>/^(?:serie continua de futuros\b|futuro safex con vencimiento\b)/i.test(item.basis) || !item.basis && /=F$/.test(item.symbol));if(futures.length)results.push({title:t('Referencias para revisar coberturas'),columns:['Producto / contrato','Símbolo','Mercado'].map(t),rows:futures.map(item=>[item.label,item.symbol,item.exchange || item.country]),note:t('Los precios, unidades y fechas están en las tablas principales. Validar vencimiento, calidad, entrega y moneda frente a la exposición física. Inventario de referencias negociadas, no una recomendación de operación. No se supone una cobertura 1:1 ni se calcula cantidad de contratos sin conocer volumen, tamaño del contrato y exposición. El interés abierto, cuando existe, es contexto de participación y no sustituye liquidez ejecutable.')});}
  }
  if(equity){
    const variations=performanceTable(references,'Variaciones por horizonte',t);
    const consolidated=compactPrintTables(results.filter(table=>table.printGroup!=='market-returns'),{foldDates:false,compactUnits:false});
    results=consolidated.flatMap((table,index)=>index===0 && variations ? [table,variations] : [table]);
  }
  const marketReport=area==='markets' && ['overview','grains','energy_metals','proteins'].includes(key);
  if(marketReport){
    results.push(...commodityDerivativesTables(report,marketEvidence(report),{t}));
    visuals=visuals.map(visual=>({...visual,financePalette:true,dataInTables:true}));
    const opening=summaryPanels[0];if(opening)opening.heading=t('Qué pasó');
    if(commodity && !protein)for(const panel of summaryPanels){if(panel.heading===t('Posibles causas y evidencia necesaria'))panel.heading=t('Cómo se explica');if(panel.heading===t('Qué repercusiones puede tener'))panel.heading=t('Repercusiones posibles');}
    if(commodity && !protein){
      const retained=summaryPanels.filter((panel,index)=>index<2 || !/transmit/i.test(panel.heading));
      summaryPanels.splice(0,summaryPanels.length,...retained);
    }
    if(commodity){
      const changes=performanceTable(references,'Variaciones por horizonte',t,protein);
      const joined=compactPrintTables(results.filter(table=>table.printGroup!=='market-returns'),{foldDates:false,compactUnits:false});
      const lastLevel=Math.max(0,joined.reduce((last,table,idx)=>table.printGroup==='market-levels' ? idx : last,0));
      results=joined.flatMap((table,index)=>index===lastLevel && changes ? [table,changes] : [table]);
    }
  }
  const flags=report.personalization?.sections || {};
  if(flags.tables===false)results=[];if(flags.charts===false)visuals=[];
  let primary=visuals.findIndex(item=>!item.globalComparison && !item.requiredInPrint && item.series?.some(series=>series.label===t(leader?.label)));
  if(primary<0)primary=visuals.findIndex(item=>item.type!=='bar');
  if(primary<0)primary=visuals.findIndex(item=>item.bars?.length>0 && item.bars.length<=10);
  visuals=visuals.map((item,index)=>({...item,executiveLead:index===primary,dataInTables:results.length>0,reading:item.reading || item.note || ''}));
  const hasLead=primary>=0;
  const blocks=[{key:'session',label:t(weekly ? 'Resumen de la semana' : 'Resumen de la sesión'),count:null},...(hasLead ? [{key:'leadChart',label:t('Tendencias y comparativas'),count:null}] : []),...(results.some(table=>!table.derivatives) ? [{key:'comparisons',label:t('Tablas y comparaciones'),count:null}] : []),...(results.some(table=>table.derivatives) ? [{key:'derivatives',icon:'fa-layer-group',label:t('Call, put e interés abierto'),count:null}] : []),...(visuals.length>Number(hasLead) ? [{key:'charts',label:t('Gráficas de detalle'),count:visuals.length-Number(hasLead)}] : [])].map((block,index)=>({...block,number:String(index+1)}));
  const formatted=formatFinanceReport(report,{...model,focusedMarket:true,proteinBulletin:false,proteinSheets:[],proteinCountries:[],proteinSources:[],supplementaryTables:[],causes:null,metrics:[],coverage:'',summary:t(summary),summaryPanels,commentary:summaryPanels,followup:[],blocks,references:supported ? references : model.references,results,visuals,yearComparisons,marketFx,benchmark:equity ? report.analysisBenchmark || references.find(item=>/s&p 500/i.test(item.label))?.label || references[0]?.label : null},{t,commentary:model.commentary,change:directionalChange});
  return equity ? equityExecutiveReport(report,formatted,{t,periods:marketPeriods}) : formatted;
}
