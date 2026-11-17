'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {proteinPdfPages}=require('./report-public-document');
const {readCmeBulletin}=require('./report-cme-document');
const {safeCommodityDerivatives,DERIVATIVES_VERSION}=require('../../shared/report-commodity-derivatives.mjs');
const cachePath=path.join(__dirname,'../cache/commodity_derivatives.json');
const seed=require('../data/commodity-derivatives-public-2026-10-23.json');
const prefix='https://www.cmegroup.com/daily_bulletin/current/';
const documents=['Section15_Live_Cattle_Call_Options','Section16_Live_Cattle_Put_Options','Section17_Feeder_Cattle_Call_Options','Section18_Feeder_Cattle_Put_Options','Section19_Lean_Hogs_Call_Options','Section20_Lean_Hogs_Put_Options','Section56_Corn_Oat_RoughRice_Options','Section57_Soybean_Soymeal_Soyoil_SoybeanCrush_wheat_Options','Section63_Energy_Options_Products','Section64_Metals_Option_Products'];
const products={
  'LEAN HOG':['HE=F','LEANHOGS','Cerdo magro CME','CME'],'LEAN HOGS':['HE=F','LEANHOGS','Cerdo magro CME','CME'],
  'LV CATTLE':['LE=F','LVCATTLE','Ganado vivo CME','CME'],'LIVE CATTLE':['LE=F','LVCATTLE','Ganado vivo CME','CME'],
  'FEEDER CATTLE':['GF=F','FEEDERCATTLE','Ganado de engorda CME','CME'],'FDR CATTLE':['GF=F','FEEDERCATTLE','Ganado de engorda CME','CME'],'CORN':['ZC=F','CORN','Maíz CBOT','CBOT'],
  'SOYBEAN':['ZS=F','SOYBEAN','Soya CBOT','CBOT'],'SOY MEAL':['ZM=F','SOYMEAL','Harina de soya CBOT','CBOT'],'WHEAT':['ZW=F','WHEAT','Trigo CBOT','CBOT'],
  LO:['CL=F','LO','Petróleo WTI NYMEX','NYMEX'],LO2:['CL=F','LO2','Petróleo WTI NYMEX · LO2','NYMEX'],
  OG:['GC=F','OG','Oro COMEX','COMEX'],HX:['HG=F','HX','Cobre COMEX','COMEX'],HXE:['HG=F','HXE','Cobre COMEX · HXE','COMEX'],
};
const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function parseCmeOptions(pages,{url,retrievedAt}={}){
  const text=pages.map(page=>page.text || page.lines.join(' ')).join(' '),stamp=text.match(/\b(?:Mon|Tue|Wed|Thu|Fri),\s*([A-Z][a-z]{2})\s+(\d{1,2}),\s*(20\d{2})/);
  if(!stamp)return {options:[],futures:[]};
  const month=months.indexOf(stamp[1].toUpperCase());if(month<0)return {options:[],futures:[]};
  if([...text.matchAll(/\b(?:Mon|Tue|Wed|Thu|Fri),\s*([A-Z][a-z]{2})\s+(\d{1,2}),\s*(20\d{2})/g)].some(match=>match.slice(1).join('|')!==stamp.slice(1).join('|')))return {options:[],futures:[]};
  const date=stamp[3]+'-'+String(month+1).padStart(2,'0')+'-'+stamp[2].padStart(2,'0');
  let active=null,activeFuture=null,contractMonth='',side='',blocked=false;const options=[],futures=[];
  pages.forEach((page,index)=>{
    const status=/\bPRELIMINARY\b/.test(page.text || page.lines.join(' ')) ? 'preliminary' : /\bFINAL\b/.test(page.text || page.lines.join(' ')) ? 'final' : 'published';
    for(const [lineIndex,rawLine] of page.lines.entries()){
      // Energy/metals PDFs place the TOTAL label on the line after its counts.
      // Accept only the same complete numeric total schema as grain bulletins.
      const previous=page.lines[lineIndex-1] || '';
      const line=rawLine==='TOTAL' && /^(?:\d+\s+){1,2}\d+(?:\s+[+-]\s*\d+|\s+-\d+|\s+UNCH)?$/.test(previous) ? 'TOTAL '+previous : rawLine;
      if(/^(?:OPTIONS EOOS?|BLOCKS and EXERCISES|OPTION EXERCISES)(?:\b|\s)/i.test(line)){blocked=true;active=null;}
      if(blocked)continue;
      const futureHeader=line.match(/^([A-Z][A-Z ]*) FUT$/);if(futureHeader){activeFuture=products[futureHeader[1]] || null;active=null;contractMonth='';}
      const header=line.match(/^(LEAN HOGS?|LV CATTLE|LIVE CATTLE|FEEDER CATTLE|FDR CATTLE|CORN|SOYBEAN|SOY MEAL|WHEAT) (CALL|PUT)S?(?: OPTIONS)?$/) || line.match(/^(LO2?|OG|HXE?) (CALL|PUT)\b/);
      if(header){const next=products[header[1]],nextSide=header[2].toLowerCase();if(active?.[1]!==next[1] || side!==nextSide)contractMonth='';active=next;activeFuture=null;side=nextSide;continue;}
      // A different named product must not inherit the previous product's OI.
      if(/^[A-Z][A-Z0-9 /().-]+ (?:CALLS|PUTS|CALL|PUT|OPT|OPTIONS)(?:\s|$)/.test(line) && !/^PG\d|^(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2}/.test(line)){active=null;activeFuture=null;contractMonth='';}
      const expiry=line.match(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})(?:\s+(?:\(FUTURES SETT\.|(?:LEAN HOGS?|LV CATTLE|FEEDER CATTLE|FDR CATTLE|CORN|SOYBEAN|SOY MEAL|WHEAT) (?:CALL|PUT))|$)/);
      if(expiry && active)contractMonth='20'+expiry[2]+'-'+String(months.indexOf(expiry[1])+1).padStart(2,'0');
      const total=line.match(/^TOTAL\s+((?:\d+\s+)*\d+)(?:\s+([+-])\s*(\d+)|\s+(-\d+)|\s+UNCH)?$/);
      if(total && active && contractMonth){
        const numbers=total[1].split(/\s+/).map(Number);if(numbers.length<2 || numbers.length>3)continue;
        const [symbol,productCode,label,exchange]=active;
        options.push({symbol,productCode,label,exchange,date,retrievedAt,contractMonth,side,openInterest:numbers.at(-1),changeOpenInterest:total[2] ? Number(total[3])*(total[2]==='-' ? -1 : 1) : total[4] ? Number(total[4]) : null,url,page:index+1,status});
      }
      const future=line.match(/^TOTAL (LEAN HOGS|LV CATTLE|FDR CATTLE|CORN|SOYBEAN|SOY MEAL|WHEAT) FUT (\d+) (\d+) (\d+) ([+-])\s*(\d+)/);
      if(future){const [symbol,productCode,label,exchange]=products[future[1]];futures.push({symbol,productCode,label,exchange,date,retrievedAt,openInterest:Number(future[4]),changeOpenInterest:Number(future[6])*(future[5]==='-' ? -1 : 1),url,page:index+1,status});}
      const continuedFuture=line.match(/^(\d+) (\d+) (\d+) ([+-])\s*(\d+) (\d+) (\d+)$/);
      if(continuedFuture && activeFuture && !active){const [symbol,productCode,label,exchange]=activeFuture;futures.push({symbol,productCode,label,exchange,date,retrievedAt,openInterest:Number(continuedFuture[3]),changeOpenInterest:Number(continuedFuture[5])*(continuedFuture[4]==='-' ? -1 : 1),url,page:index+1,status});}
    }
  });
  return {options,futures};
}
function createReportDerivativesLoader({filePath=cachePath,initialSeed=seed,documentNames=documents,now=()=>Date.now()}={}){
let memory=null,pending=null,initializing=null;
const timestamp=()=>new Date(now()).toISOString();
return async function loadReportDerivatives({cutoff,read=readCmeBulletin,pdfPages=proteinPdfPages,refresh=true,force=false}={}){
  // A current report is cut after retrieval; explicit historical cuts stay strict.
  const safe=data=>safeCommodityDerivatives(data,cutoff || timestamp());
  if(!memory){
    if(!initializing)initializing=(async()=>{
    let saved;try{saved=JSON.parse(await fs.readFile(filePath,'utf8'));}catch{saved=initialSeed;}
    if(!saved || typeof saved!=='object' || Array.isArray(saved))saved=initialSeed;
    // A newer public reading supplements an older cache without replacing newer provider observations.
    memory={...saved,checkedAt:[saved.checkedAt,initialSeed.checkedAt].filter(value=>Number.isFinite(Date.parse(value))).sort().at(-1)};
    for(const field of ['options','futures']){const rows=[...(Array.isArray(initialSeed[field]) ? initialSeed[field] : []),...(Array.isArray(saved[field]) ? saved[field] : [])].filter(item=>item && typeof item==='object').sort((a,b)=>Date.parse(a.retrievedAt)-Date.parse(b.retrievedAt));memory[field]=[...new Map(rows.map(item=>[[item.productCode,item.date,item.contractMonth || '',item.side || ''].join('|'),item])).values()];}
    })();
    await initializing;
  }
  const age=now()-Date.parse(memory.checkedAt),retryMs=memory.unavailable?.length ? 5*60000 : 3600000;
  if(!refresh || !force && age>=0 && age<retryMs)return safe(memory);
  if(!pending)pending=(async()=>{
    const latest={version:DERIVATIVES_VERSION,options:[],futures:[],unavailable:[],failures:[]};
    let cursor=0;
    await Promise.all([0,1].map(async()=>{while(cursor<documentNames.length){const file=documentNames[cursor++],url=prefix+file+'.pdf';try{const buffer=await read(url,{encoding:null,timeoutMs:15000,maxBytes:8*1024*1024});const pages=await pdfPages(buffer,{maxPages:200});const parsed=parseCmeOptions(pages,{url,retrievedAt:timestamp()});const valid=safeCommodityDerivatives(parsed,timestamp());if(!valid.options.length && !valid.futures.length)throw Object.assign(new Error('No dated rows'),{code:'CME_NO_CURRENT_ROWS'});latest.options.push(...valid.options);latest.futures.push(...valid.futures);}catch(error){latest.unavailable.push(file);latest.failures.push({document:file,code:typeof error.code==='string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : error.name==='TimeoutError' ? 'CME_TIMEOUT' : 'CME_DOWNLOAD_FAILED'});}}}));
    // A failed provider never erases a dated, still-valid previous observation.
    for(const field of ['options','futures']){
      const fresh=new Set(latest[field].map(item=>[item.productCode,item.date,item.contractMonth || '',item.side || ''].join('|')));
      latest[field].push(...(memory[field] || []).filter(item=>!fresh.has([item.productCode,item.date,item.contractMonth || '',item.side || ''].join('|'))));
    }
    latest.checkedAt=timestamp();memory={...latest,...safeCommodityDerivatives(latest,latest.checkedAt)};
    await fs.mkdir(path.dirname(filePath),{recursive:true});const temp=filePath+'.'+require('node:crypto').randomUUID()+'.tmp';
    try{await fs.writeFile(temp,JSON.stringify(memory));await fs.rename(temp,filePath);}finally{await fs.rm(temp,{force:true}).catch(()=>{});}return memory;
  })().finally(()=>{pending=null;});
  try{return safe(await pending);}catch{return safe(memory);}
};
}
const loadReportDerivatives=createReportDerivativesLoader();
function attachReportDerivatives(snapshot,data,{generatedAt}={}){
    if(!snapshot?.reports?.length)return snapshot;
    const safe=safeCommodityDerivatives(data,generatedAt || new Date().toISOString());
    if(!safe.options.length && !safe.futures.length)return snapshot;
    const reports=snapshot.reports.map(report=>{
        if(report.userEdition || !['overview','grains','energy_metals','proteins'].includes(report.key) || report.marketDerivatives?.checkedAt===safe.checkedAt)return report;
        const {marketEvidence}=require('../../shared/report-market-analysis.mjs'),symbols=new Set(marketEvidence(report).map(item=>item.symbol));
        const evidence=[...safe.options,...safe.futures].filter(item=>symbols.has(item.symbol));if(!evidence.length)return report;
        const links=[...new Map([...(report.sourceLinks || []),...evidence.map(item=>({label:item.source+' · '+item.date,url:item.url}))].map(item=>[item.url,item])).values()];
        const cut=generatedAt || new Date(Math.max(Date.parse(report.generatedAt),...evidence.map(item=>Date.parse(item.retrievedAt)))).toISOString();
        return {...report,generatedAt:cut,marketDerivatives:{...safe,options:safe.options.filter(item=>symbols.has(item.symbol)),futures:safe.futures.filter(item=>symbols.has(item.symbol))},sourceLinks:links};
    });
    return reports.every((report,index)=>report===snapshot.reports[index]) ? snapshot : {...snapshot,generatedAt:new Date(Math.max(Date.parse(snapshot.generatedAt),...reports.map(report=>Date.parse(report.generatedAt)))).toISOString(),reports};
}
module.exports={loadReportDerivatives,createReportDerivativesLoader,parseCmeOptions,attachReportDerivatives,DERIVATIVES_VERSION};
