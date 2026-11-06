import {safeMarketNews,marketNewsEvidence} from './report-market-news.mjs';
import {financialNewsEvidence} from './report-financial-news.mjs';
import {focusedEvidence,marketEvidence} from './report-market-analysis.mjs';
import {sessionEvidence} from './report-session-evidence.mjs';
import {compactBondPoints} from './report-bond-evidence.mjs';
import {weeklyReport} from './report-weekly.mjs';
import {panoramaSignals,panoramaImplications} from './report-panorama-signals.mjs';

export const PANORAMA_VERSION=2,PANORAMA_MAX_BYTES=3*1024*1024;
const permitted=new Set(['finance:equities','finance:bonds','finance:fx','finance:daily_news','markets:grains','markets:energy_metals','markets:proteins','markets:market_news','mexico:mx_overview','mexico:mx_bolsa','mexico:mx_proteins','mexico:mx_production']);
const areas={finance:'Finanzas',markets:'Mercados',mexico:'México'},finite=Number.isFinite;
const text=(value,max=4000)=>typeof value==='string' || typeof value==='number' ? String(value).slice(0,max) : '';
const list=value=>Array.isArray(value) ? value : [];
const link=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href.slice(0,1800) : '';}catch{return '';}};
export const isPanorama=report=>[['finance','overview'],['markets','overview'],['mexico','mx_overview']].some(([area,key])=>(report.baseReport?.collection || report.collection)===area && (report.baseReport?.key || report.key)===key) && report.periodType!=='annual' && Array.isArray(report.panoramaParts);
export function compactPanoramaPart(input,collection,cutoff){
 if(!input || !permitted.has(collection+':'+input.key) || !finite(Date.parse(input.generatedAt)) || Date.parse(input.generatedAt)>Date.parse(cutoff) || input.panoramaParts)throw Error('Referencia de Panorama no válida.');
 const src={...input,collection},key=input.key,part={key,collection,title:text(input.title,140),generatedAt:input.generatedAt,summary:text(input.summary),objective:text(input.objective,2000),closing:text(input.closing),eyebrow:text(input.eyebrow,160),
  sections:list(input.sections).slice(0,20).map(item=>({heading:text(item.heading,140),text:text(item.text,8000)})),metrics:list(input.metrics).slice(0,50).map(item=>({label:text(item.label,140),value:text(item.value,140),change:text(item.change,140)})),
  tables:list(input.tables).slice(0,20).map(table=>({title:text(table.title,140),note:text(table.note,800),kind:table.kind==='guide' ? 'guide' : undefined,columns:list(table.columns).slice(0,12).map(value=>text(value,140)),rows:list(table.rows).slice(0,1000).map(row=>list(row).slice(0,12).map(value=>text(value,1200)))})),
  visuals:[],sources:list(input.sources).slice(0,192).map(value=>text(value,240)),sourceLinks:list(input.sourceLinks).slice(0,192).flatMap(item=>link(item.url) ? [{label:text(item.label,240),url:link(item.url)}] : []),takeaways:list(input.takeaways).slice(0,20).map(value=>text(value,1500)),watchlist:list(input.watchlist).slice(0,20).map(value=>text(value,1500)),...focusedEvidence(src,{saved:true})};
 if(key==='equities'){
  const evidence=marketEvidence(src);part.equityObservations=evidence.filter(item=>item.unit==='puntos').map(item=>({...item,points:item.points.slice(-2)}));part.equityNews=list(input.equityNews);part.equityCatalogVersion=input.equityCatalogVersion || 1;part.metrics=[];part.tables=[];part.sections=[];
 }else if(key==='bonds'){
  part.bondSchemaVersion=input.bondSchemaVersion;part.bondNews=list(input.bondNews);part.bondObservations=list(input.bondObservations || input.sourceSnapshot?.bonds).slice(0,96).map(item=>({id:text(item.id,40),label:text(item.label,140),symbol:text(item.symbol,30),market:text(item.market,80),currency:text(item.currency,8),region:text(item.region,40),maturity:text(item.maturity,12),tenorYears:finite(item.tenorYears) ? item.tenorYears : undefined,cadence:['auction','monthly'].includes(item.cadence) ? item.cadence : 'daily',basis:text(item.basis,40),code:text(item.code,3),source:text(item.source,240),url:link(item.url),points:item.cadence==='monthly' ? list(item.series || item.points).filter(point=>/^20\d{2}-\d{2}$/.test(point.date) && point.date<=cutoff.slice(0,7) && finite(point.value)).slice(-256) : compactBondPoints(item.series || item.points || [],input.generatedAt)}));part.metrics=[];part.tables=[];part.sections=[];
 }else if(key==='fx'){part.metrics=[];part.tables=[];part.sections=[];}
 else if(collection==='markets' && !key.endsWith('news')){part.sessionObservations=sessionEvidence(src);part.sessionNews=safeMarketNews(src.sessionNews || [],src.generatedAt);part.tables=[];part.metrics=[];if(key==='proteins')part.proteinScope=input.proteinScope;}
 else if(collection==='mexico'){part.dailyReferences=list(input.dailyReferences);part.sessionObservations=sessionEvidence(src);part.visuals=list(input.visuals);}
 if(key==='daily_news')part.financialNews=financialNewsEvidence(src);
 if(key==='market_news')part.marketNews=marketNewsEvidence(src);
 if(key.endsWith('news'))part.headlines=list(input.headlines || input.sourceSnapshot?.headlines || input.sessionNews).slice(0,40).flatMap(item=>finite(Date.parse(item.publishedAt)) && Date.parse(item.publishedAt)<=Date.parse(cutoff) && link(item.url) ? [{title:text(item.title,600),description:text(item.description || item.insight,1200),source:text(item.source,240),publishedAt:item.publishedAt,url:link(item.url),categoryLabel:text(item.categoryLabel,140)}] : []);
 return part;
}
export function safePanoramaParts(input,cutoff){
 if(!Array.isArray(input) || input.length>12)throw Error('La composición de Panorama no es válida.');
 const seen=new Set();return input.map(part=>{const id=part.collection+':'+part.key;if(seen.has(id))throw Error('Un informe aparece dos veces en Panorama.');seen.add(id);return compactPanoramaPart(part,part.collection,cutoff);});
}
const shortFact=value=>{const parts=[...new Intl.Segmenter('es',{granularity:'sentence'}).segment(String(value || ''))];return parts.slice(0,2).map(item=>item.segment).join('').trim();};
function newsKey(item){const url=new URL(item.url);for(const key of [...url.searchParams.keys()])if(/^utm_|^fbclid$|^gclid$/i.test(key))url.searchParams.delete(key);return url.href.replace(/\/$/,'');}
export function panoramaReport(report,{t=value=>value}={}){
 const cutoff=report.generatedAt,scope=report.baseReport?.collection || report.collection,parts=safePanoramaParts(report.panoramaParts,cutoff),news=[],urls=new Set(),titles=new Set(),chapters=[];
 if(scope!=='finance' && parts.some(part=>part.collection!==scope))throw Error('Un capítulo no pertenece al panorama solicitado.');
 for(const part of parts){
  if(part.key.endsWith('news')){for(const item of ['daily_news','market_news'].includes(part.key) ? weeklyReport(part,{t}).newsExecutive.stories : part.headlines || []){const key=newsKey(item),title=item.title.normalize('NFKD').replace(/[\u0300-\u036f\W_]+/g,'').toLowerCase();if(urls.has(key) || titles.has(title))continue;urls.add(key);titles.add(title);news.push(item);}continue;}
  const model=weeklyReport({...part,personalization:report.personalization,analysisPeriod:report.analysisPeriod},{t}),id=part.collection+'-'+part.key,structural=part.collection==='mexico' && ['mx_overview','mx_production'].includes(part.key);
  const lead=model.summaryPanels?.[0]?.body || shortFact(model.summary || part.summary),risk=model.equityExecutive?.risk;
  chapters.push({id,label:part.title,area:areas[part.collection],kind:structural ? 'structural' : 'market',generatedAt:part.generatedAt,componentReport:part,model,fact:(risk ? risk.label+' · EE. UU. '+lead : lead).slice(0,750),references:model.references?.length || 0,charts:model.visuals?.length || 0,rows:(model.results || []).reduce((sum,table)=>sum+table.rows.length,0)});
 }
 if(news.length)chapters.push({id:'news',label:'Noticias y agenda integrada',area:'Actualidad',kind:'news',generatedAt:cutoff,news,fact:news.length+' publicaciones únicas con fecha y fuente.',references:0,charts:0,rows:news.length});
 const facts=chapters.filter(item=>item.kind!=='news').map(item=>({heading:item.label,body:item.fact})),structural=chapters.filter(item=>item.kind==='structural'),seen=new Set(),references=chapters.flatMap(chapter=>list(chapter.model?.references).filter(item=>{const key=JSON.stringify([item.label,item.unit,item.source,item.points]);if(seen.has(key))return false;seen.add(key);return true;}).map(item=>({...item,panoramaChangeUnit:chapter.model.bondExecutive ? 'pb' : '%'})));
 const flags=report.personalization?.sections || {},signals=flags.indicators===false ? [] : panoramaSignals(chapters,{scope,cutoff,weekly:report.analysisPeriod==='weekly',t}).map(item=>flags.charts===false ? {...item,points:[]} : item),implications=flags.risks===false ? [] : panoramaImplications(signals,chapters,{t});
 const scopeLabel=t(scope==='markets' ? 'Mercados · granos, energía, metales y proteínas' : scope==='mexico' ? 'México · economía, bolsa, proteínas y producción' : 'Finanzas · Mercados · México');
 const results=chapters.flatMap(chapter=>list(chapter.model?.results).map(table=>({...table,title:chapter.label+' · '+table.title}))),annexTables=chapters.flatMap(chapter=>list(chapter.model?.annexTables).map(table=>({...table,title:chapter.label+' · '+table.title})));
 return {panorama:{scope,scopeLabel,signals,chapters,facts,implications,news,structural:structural.map(item=>item.id),sourceCount:parts.length},sessionReport:true,focusedMarket:true,summary:scopeLabel+'. '+t('Señales principales, implicaciones para el negocio y detalle por capítulos. Cada referencia conserva su fecha, unidad y frecuencia.'),summaryPanels:facts,commentary:facts,references,results,annexTables,visuals:chapters.flatMap(item=>list(item.model?.visuals)),metrics:[],history:[],tables:[],statistics:[],followup:[],coverage:'',blocks:[{key:'panorama-summary',number:'1',label:t('Lectura ejecutiva integrada')},...chapters.map((item,index)=>({key:'part-'+item.id,number:String(index+2),label:t(item.label)}))]};
}
