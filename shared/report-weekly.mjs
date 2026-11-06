import {commodityExecutiveReport} from './report-commodity-executive.mjs';
import {mexicoExecutiveReport} from './report-mexico-executive.mjs';
import {isMarketNews,marketNewsReport} from './report-market-news.mjs';
// Daily composition shared by reading, PDF and text exports. Histories stay internal.
import fxConfig from './report-fx.json' with {type:'json'};
import {reportCauseAnnex} from './report-causes.mjs';
import {isEquitySession,equitySessionReport} from './report-equity-session.mjs';
import {isBondSession,bondSessionReport} from './report-bond-session.mjs';
import {isSectorSession,sectorSessionReport} from './report-sector-session.mjs';
import {uniqueTableNotes} from './report-concision.mjs';
import {isAnnualReport,annualReport} from './report-annual.mjs';
import {focusedMarketReport} from './report-market-analysis.mjs';
import {scopeUsProteinReport} from './report-protein-scope.mjs';
import {isPanorama,panoramaReport} from './report-panorama.mjs';
import {isFinancialNews,financialNewsReport} from './report-financial-news.mjs';
const finite=value=>typeof value==='number' && Number.isFinite(value);
const defaultNumber=value=>finite(value) ? value.toLocaleString('es-MX',{maximumFractionDigits:5}) : 'Sin dato';
const heading=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'});
export function reportDay(value) {
  const date=String(value || ''),time=Date.parse(date);
  if(date.length>10 && !/T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(date)) return '';
  if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(date) || !finite(time) || new Date(date.slice(0,10)).toISOString().slice(0,10)!==date.slice(0,10)) return '';
  return date.length===10 ? date : dateFormat.format(new Date(time));
}
export function dailyReportWindow(generatedAt) {
  const today=reportDay(generatedAt);
  return {today,yesterday:today ? new Date(Date.parse(today)-86400000).toISOString().slice(0,10) : '',timeZone:'America/Mexico_City'};
}
function observations(points,window,cutoff) {
  const instants=new Map(),conflicts=new Set(),days=new Map();
  for(const point of points || []) {
    const date=reportDay(point?.date),time=Date.parse(point?.date);
    if(!date || ![window.yesterday,window.today].includes(date) || !finite(point?.value) || time>cutoff) continue;
    if(instants.has(time) && instants.get(time).value!==point.value) conflicts.add(time);
    instants.set(time,{date,value:point.value,time});
  }
  for(const point of [...instants.values()].filter(point=>!conflicts.has(point.time)).sort((a,b)=>a.time-b.time)) days.set(point.date,point);
  return [...days.values()];
}
function legacyReferences(report,source) {
  const references=[];
  for(const visual of report.visuals || []) {
    if(visual.type!=='bar') references.push(...(visual.series || []).map(series=>({label:series.label,unit:visual.unit || '',points:series.points || []})));
    else for(const bar of visual.bars || []) {
      const date=bar.date || (/^\d{4}-\d{2}-\d{2}$/.test(bar.label) ? bar.label : '');
      if(date) references.push({label:visual.title,unit:visual.unit || '',points:[{date,value:bar.value}]});
    }
  }
  for(const table of report.tables || []) {
    if(table.kind==='guide') continue;
    const columns=(table.columns || []).map(label=>heading(source(label)));
    const dateIndex=columns.findIndex(label=>/fecha|periodo|date|period/.test(label));
    const valueIndex=columns.findIndex(label=>/^(precio|valor|ultimo|nivel|price|value|unidades por)/.test(label));
    const unitIndex=columns.findIndex(label=>/^(unidad|unit)/.test(label));
    if(dateIndex<0 || valueIndex<0) continue;
    for(const row of table.rows || []) {
      const date=String(source(row[dateIndex] || ''));
      if(!reportDay(date)) continue;
      const raw=String(source(row[valueIndex] || '')).trim(),match=raw.match(/^(-?\d[\d,]*(?:\.\d+)?)\s*(.*)$/);
      if(!match) continue;
      references.push({label:String(row[0]),unit:unitIndex>=0 ? String(row[unitIndex]) : match[2],points:[{date,value:Number(match[1].replace(/,/g,''))}]});
    }
  }
  return references;
}
export function weeklyReport(report,options={}){
  let model;
  if(isMarketNews(report))model=marketNewsReport(report,options);
  else if(isFinancialNews(report))model=financialNewsReport(report,options);
  else if(isPanorama(report))model=panoramaReport(report,options);
  else {
    report=scopeUsProteinReport(report);
    const base=baseWeeklyReport(report,options);
    model=report.periodType==='annual' || options.equitySession===false ? base : mexicoExecutiveReport(report,commodityExecutiveReport(report,focusedMarketReport(report,base,options),options),options);
  }
  // Las ediciones especializadas y anuales pasan por la misma limpieza. La
  // nota completa se conserva para restaurarla cuando se filtran las tablas.
  return {...model,results:uniqueTableNotes(model.results)};
}
function baseWeeklyReport(report,{t=value=>value,source=value=>value,number=defaultNumber,equitySession=true}={}) {
  if(isAnnualReport(report))return annualReport(report,{t});
  if(equitySession && isBondSession(report)) return {...bondSessionReport(report,{t,source}),causes:weeklyReport(report,{t,source,number,equitySession:false}).causes};
  if(equitySession && isEquitySession(report)) {
    const session=equitySessionReport(report,{t,source});
    // Keep the conditional annex available to existing translation/export clients.
    return {...session,causes:weeklyReport(report,{t,source,number,equitySession:false}).causes};
  }
  const originalSource=source,reverse=new Map(Object.entries(report.causeText || {}).map(([original,localized])=>[localized,original]));
  source=value=>reverse.get(value) ?? originalSource(value);
  const flags=report.personalization?.sections || {},window=dailyReportWindow(report.generatedAt),cutoff=Date.parse(report.generatedAt);
  const legacy=legacyReferences(report,source);
  const identity=reference=>{
    const label=source(reference.label || ''),pair=label.match(/^USD\/[A-Z]{3}(?= · |$)/)?.[0];
    return JSON.stringify([pair || label,source(reference.unit || '')]);
  };
  const legacyByReference=new Map();
  for(const reference of legacy) {
    const key=identity(reference);
    if(!legacyByReference.has(key)) legacyByReference.set(key,[]);
    legacyByReference.get(key).push(...reference.points);
  }
  const candidates=report.dailyReferences?.length ? report.dailyReferences.map(reference=>{
    if(reference.points?.length) return reference;
    return {...reference,points:observations(legacyByReference.get(identity(reference)),window,cutoff)};
  }) : legacy;
  const grouped=new Map();
  for(const reference of candidates) {
    const key=JSON.stringify([reference.label,reference.unit]);
    if(!grouped.has(key)) grouped.set(key,{...reference,points:[]});
    grouped.get(key).points.push(...(reference.points || []));
  }
  if(!grouped.size) for(const metric of report.metrics || []) grouped.set(metric.label,{label:metric.label,unit:'',points:[]});
  if(!grouped.size) grouped.set(report.title || t('Referencia'),{label:report.title || t('Referencia'),unit:'',points:[]});
  const references=[...grouped.values()].map(reference=>{
    const points=observations(reference.points,window,cutoff);
    return {...reference,points,previous:points.find(point=>point.date===window.yesterday)?.value ?? null,current:points.find(point=>point.date===window.today)?.value ?? null};
  });
  const absent=t('Sin dato'),format=value=>finite(value) ? number(value) : absent;
  const rows=references.map(reference=>{
    const {previous,current}=reference,delta=reference.unit?.trim() && finite(previous) && finite(current) ? current-previous : null;
    const percent=finite(delta) && previous>0 ? delta/previous*100 : null;
    return [reference.label,reference.unit || t('Unidad no declarada'),format(previous),format(current),format(delta),source(reference.unit).trim()==='%' ? finite(delta) ? number(delta)+' '+t('p. p.') : absent : finite(percent) ? number(percent)+' %' : finite(delta) ? t('No calculable') : absent];
  });
  const period=[window.yesterday,window.today].filter(Boolean).join(' / ');
  const results=flags.tables===false ? [] : [{title:t('Comparación diaria'),period,columns:[t('Referencia'),t('Unidad'),window.yesterday || absent,window.today || absent,t('Cambio absoluto'),t('Variación')],rows}];
  const units=new Map();
  for(const reference of references) {
    const unit=reference.unit || t('Unidad no declarada');
    if(!units.has(unit)) units.set(unit,[]);
    units.get(unit).push(reference);
  }
  const visuals=[];
  const key=report.baseReport?.key || report.key,collection=report.baseReport?.collection || report.collection;
  const combinedFx=key==='fx' && (!collection || collection==='finance') && references.some(reference=>/^USD\/[A-Z]{3}(?: ·|$)/.test(source(reference.label || '')));
  if(flags.charts!==false && combinedFx) {
    const currencies=fxConfig.currencies.map(currency=>{
      const pair='USD/'+currency.code;
      const reference=references.find(reference=>(source(reference.label)===pair || source(reference.label).startsWith(pair+' · ')) && source(reference.unit)===currency.code+' por 1 USD');
      const previous=reference?.previous,current=reference?.current,comparable=finite(previous) && previous>0 && finite(current) && current>0;
      return {label:pair,previous,current,comparable,change:comparable ? (current/previous-1)*100 : null};
    });
    const dates=[window.yesterday,window.today];
    visuals.push({type:'line',fxOverview:true,dailyComparison:true,dailyDates:dates,title:t('Divisas frente al USD · evolución conjunta'),unit:t('Índice · día anterior = 100'),note:'',series:currencies.map(currency=>({label:currency.label,points:finite(currency.previous) && currency.previous>0 ? [{date:window.yesterday,value:100},...(currency.comparable ? [{date:window.today,value:currency.current/currency.previous*100}] : [])] : []}))});
    visuals.push({type:'bar',fxOverview:true,dailyComparison:true,title:t('Divisas frente al USD · variación diaria'),unit:'% · '+dates.join(' / '),note:'',bars:currencies.map(currency=>({label:currency.label,value:currency.change}))});
  }
  if(flags.charts!==false && !combinedFx) for(const [unit,references] of units) {
    const available=references.filter(reference=>finite(reference.previous) || finite(reference.current));
    // An unavailable source still has a visible comparison, with explicit gaps.
    // Do not expand a whole state catalogue into dozens of empty charts.
    const items=available.length ? available : [{label:references.length===1 ? references[0].label : report.title || t('Comparación diaria'),previous:null,current:null,points:[]}];
    for(let start=0;start<items.length;start+=4) {
    const batch=items.slice(start,start+4),dates=[window.yesterday,window.today];
    const title=batch.length===1 ? batch[0].label : t('Comparación diaria')+' · '+unit+(items.length>4 ? ' · '+(start/4+1) : '');
    if(available.length) visuals.push({type:'line',dailyComparison:true,dailyDates:dates,title:title+' · '+t('Evolución diaria'),unit,note:'',series:batch.map(reference=>({label:reference.label,points:reference.points.map(point=>({date:point.date,value:point.value}))}))});
    visuals.push({type:'bar',dailyComparison:true,title,unit,note:'',bars:batch.flatMap(reference=>[
      {label:(batch.length>1 ? reference.label+' · ' : '')+(window.yesterday || t('Anterior')),reference:reference.label,date:window.yesterday,comparisonDay:'previous',value:reference.previous},
      {label:(batch.length>1 ? reference.label+' · ' : '')+(window.today || t('Actual')),reference:reference.label,date:window.today,comparisonDay:'current',value:reference.current},
    ])});
    }
  }
  const metrics=flags.indicators===false ? [] : references.slice(0,30).map(reference=>({label:reference.label,value:format(reference.current)+(finite(reference.current) && reference.unit ? ' '+reference.unit : ''),change:window.today || absent}));
  const blocks=[{key:'results',number:'1',label:'Resultados del corte',icon:'fa-gauge-high',count:null},...(visuals.length ? [{key:'charts',number:'1.1',label:'Evolución y comparaciones',icon:'fa-chart-column',count:visuals.length}] : []),...(results.length ? [{key:'comparisons',number:'1.2',label:'Resultado actual y comparación disponible',icon:'fa-table-list',count:results[0].rows.length}] : [])];
  const causes=reportCauseAnnex(report,references,window,{t,source,number});
  blocks.push({key:'causes',number:'2',label:'Causas y consecuencias',icon:'fa-diagram-project',count:null});
  const legacyModel={window,blocks,visuals,metrics,results,causes,history:[],statistics:[],tables:[]};
  return equitySession && isSectorSession(report) ? sectorSessionReport(report,legacyModel,{t,source}) : legacyModel;
}
