'use strict';
const crypto=require('node:crypto');
const {readPublicDocument,proteinPdfPages}=require('./report-public-document');
const {dailyPoints}=require('./report-observations');
const {matchingProteinSeries,mergeProteinSeries}=require('./report-protein-series');
const root='https://www.ams.usda.gov/mnreports/';
const markets=[
 {ticker:'USDA-CHICKEN-WHOLE',report:'3646',category:'Pollo',label:'Pollo entero, compuesto nacional entregado · USDA, Estados Unidos',unit:'US¢/lb',cadence:'weekly',basis:'Precio físico mayorista semanal ponderado de pollo entero fresco convencional nacional; entregado. La fecha es la publicación del boletín, no una sesión diaria ni el costo de un contrato particular.'},
 {ticker:'USDA-EGG-NATIONAL-INDEX',report:'2843',category:'Huevo',label:'Huevo blanco grande · índice móvil 5 días, FOB · USDA, Estados Unidos',unit:'US¢/docena',cadence:'daily',basis:'Índice móvil ponderado de cinco días, publicado diariamente; huevo blanco grande, Graded Loose, Caged, nacional, FOB. No es un precio spot de una sola jornada ni huevo en cartón entregado.'},
 {ticker:'USDA-EGG-MIDWEST-CARTON',report:'2848',category:'Huevo',label:'Huevo blanco grande en cartón, almacén Midwest · USDA, Estados Unidos',unit:'US¢/docena',cadence:'weekly',basis:'Precio medio semanal de huevo blanco grande en cartón, Caged, entregado a almacén en Midwest. La fecha es la publicación del boletín; su semana declarada se conserva por separado.'},
 {ticker:'USDA-EGG-LIQUID-WHOLE',report:'2842',category:'Procesados',label:'Huevo líquido entero, FOB · USDA, Estados Unidos',unit:'US¢/lb',cadence:'weekly',basis:'Precio físico mayorista semanal ponderado de huevo líquido entero, Caged, FOB, en cargas de camión para entrega dentro de catorce días. No se expresa por docena ni es un precio de huevo con cáscara.'},
].map(item=>({...item,symbol:item.ticker,provider:'usda_pdf',country:'Estados Unidos',market:'Estados Unidos · mercado físico',region:'América',currency:'USD',exchange:'Mercado físico',bucket:'proteins',source:'USDA AMS · boletín público '+item.report,url:root+'ams_'+item.report+'.pdf'}));
const iso=(year,month,day)=>{const date=String(year)+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0'),time=Date.parse(date);return Number.isFinite(time) && new Date(time).toISOString().slice(0,10)===date ? date : '';};
const usDate=value=>{const m=String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m ? iso(m[3],m[1],m[2]) : '';};
const englishDate=text=>{const m=text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),\s*(20\d{2})\b/i);return m ? iso(m[3],['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[1].slice(0,3).toLowerCase())+1,m[2]) : '';};
function section(lines,start,end){const index=lines.findIndex(line=>start.test(line));if(index<0)throw Error('Producto o sistema de producción USDA ausente.');const stop=lines.findIndex((line,ordinal)=>ordinal>index && end.test(line));return lines.slice(index,stop<0 ? undefined : stop);}
function weightedRow(lines,pattern,{volume=false}={}){
 const rows=lines.filter(line=>pattern.test(line));if(rows.length!==1)throw Error('Fila USDA ausente o ambigua.');
 const rest=rows[0].replace(pattern,'').trim(),match=rest.match(new RegExp('^'+(volume ? '([0-9][0-9,]*)\\s+' : '')+'([0-9]+\\.[0-9]+)\\s+-\\s+([0-9]+\\.[0-9]+)\\s+([0-9]+\\.[0-9]+)(?:\\s+(.*))?$'));
 if(!match || volume && Number(match[1].replaceAll(',',''))<=0)throw Error('Estructura de precio USDA no reconocida.');
 const offset=Number(volume),low=Number(match[1+offset]),high=Number(match[2+offset]),value=Number(match[3+offset]),tail=String(match[4+offset] || '').split(/\s+/).filter(Boolean);
 if(!(value>0 && low>0 && high>=low && value>=low && value<=high))throw Error('Precio USDA fuera del rango publicado.');
 return {value,tail};
}
function priorObservation(lines,row,current,tailCount=2){
 const header=lines.find(line=>/Last Reported|^(?:Type|Class) /.test(line) && /\(\d{1,2}\/\d{1,2}\/\d{4}\)/.test(line));
 const date=header?.match(/\((\d{1,2}\/\d{1,2}\/\d{4})\)/)?.[1],previousDate=usDate(date);
 // With missing columns, do not guess which trailing number is a prior price.
 if(!previousDate || previousDate>=current || row.tail.length!==tailCount)return [];
 const [change,value]=row.tail.map(Number);
 if(!Number.isFinite(change) || !(value>0) || Math.abs(row.value-value-change)>.021)return [];
 return [{date:previousDate,value}];
}
function parseUsdaProteinPages(pages,item,cutoff){
 const page=pages[0],lines=page?.lines || [],text=lines.join(' '),publishedAt=englishDate(text),end=Date.parse(cutoff);
 const titles={'3646':'Weekly National Chicken Report','2843':'Daily National Shell Egg Index Report (5-day rolling average)','2848':'Weekly Combined Regional Shell Egg Report','2842':'Weekly National Egg Products'};
 if(!publishedAt || !Number.isFinite(end) || Date.parse(publishedAt)>end || !lines.includes(titles[item.report]) || !/Agricultural Marketing Service/.test(text) || !new RegExp('view[Rr]eport/'+item.report+'\\b').test(text))throw Error('Identidad o fecha del boletín USDA no coincide.');
 const period=text.match(/Report [Ff]or:\s*(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+(?:to|-)\s+(\d{1,2}\/\d{1,2}\/\d{4}))?/),reportPeriodStart=usDate(period?.[1]),reportPeriodEnd=usDate(period?.[2] || period?.[1]);
 if(!reportPeriodStart || !reportPeriodEnd || reportPeriodStart>reportPeriodEnd || reportPeriodStart>publishedAt)throw Error('Período USDA inválido.');
 let board,row,points=[];
 if(item.report==='3646'){
  board=section(lines,/^Chicken, Whole - Cents Per Lb$/, /^WOG Trading by Size:/);
  if(!board.includes('Domestic - Fresh - Conventional - Delivered') || !board.some(line=>line.includes('Current Weeks Trading Previous Weeks Trading')))throw Error('Etapa o unidad de pollo USDA no coincide.');
  row=weightedRow(board,/^National Composite Whole\s+/);if(row.tail.length!==4 || !/^[\d,]+$/.test(row.tail[1]) || Number(row.tail[1].replaceAll(',',''))<=0)throw Error('Volumen de pollo USDA inválido.');
  // The preceding week has no explicit publication date in this board.
 }else if(item.report==='2843'){
  if(reportPeriodStart!==publishedAt || reportPeriodEnd!==publishedAt)throw Error('Fecha del índice diario USDA no coincide.');
  board=section(lines,/^NATIONAL SHELL EGGS(?:¹)? - Caged$/,/^NATIONAL SHELL EGGS(?:¹)? - Cage-Free$/);
  if(!board.includes('30-Dozen Cases / Cents Per Dozen / FOB'))throw Error('Unidad del índice de huevo USDA no coincide.');
  row=weightedRow(board,/^White Large\s+/,{volume:true});points=priorObservation(board,row,publishedAt,3);
 }else if(item.report==='2848'){
  board=section(lines,/^Midwest Shell Eggs - Caged$/,/^Delivered Store Door/);
  if(!board.includes('Delivered Warehouse, White, Cents Per Dozen'))throw Error('Etapa regional de huevo USDA no coincide.');
  row=weightedRow(board,/^Large\s+/);points=priorObservation(board,row,publishedAt);
 }else if(item.report==='2842'){
  board=section(lines,/^National Liquid Eggs - Caged$/,/^National Liquid Eggs - Cage-Free$/);
  if(!board.includes('cents per pound / FOB'))throw Error('Unidad del huevo líquido USDA no coincide.');
  row=weightedRow(board,/^Liquid Whole\s+/,{volume:true});points=priorObservation(board,row,publishedAt);
 }else throw Error('Boletín USDA no admitido.');
 points.push({date:publishedAt,value:row.value});
 return {points:dailyPoints(points,cutoff),publishedAt,reportPeriodStart,reportPeriodEnd};
}
async function loadUsdaProteins({read=readPublicDocument,cutoff=new Date().toISOString(),previous=[],timeoutMs=12000}={}){
 return Promise.all(markets.map(async item=>{
  const prior=previous.find(quote=>matchingProteinSeries(item,quote));
  try{
   const buffer=await read(item.url,{encoding:null,timeoutMs}),pages=await proteinPdfPages(buffer,{maxPages:6}),record=parseUsdaProteinPages(pages,item,cutoff),{series,validatedLatest}=mergeProteinSeries(item,record.points,prior,cutoff),last=series.at(-1),prev=series.at(-2),change=item.cadence==='daily' && prev && Date.parse(last.date)-Date.parse(prev.date)<=7*86400000 ? (last.value/prev.value-1)*100 : null;
   return {...item,...(validatedLatest ? record : {publishedAt:prior?.publishedAt || null,reportPeriodStart:prior?.reportPeriodStart || null,reportPeriodEnd:prior?.reportPeriodEnd || null}),points:undefined,series,value:last.value,previous:item.cadence==='daily' ? prev?.value ?? null : null,change,performance:{day:change},observedAt:last.date,retrievedAt:validatedLatest ? new Date().toISOString() : prior?.retrievedAt || null,quoteStatus:validatedLatest ? 'verified' : 'preserved',evidenceOrigin:'provider',sourceDocumentHash:validatedLatest ? crypto.createHash('sha256').update(buffer).digest('hex') : prior?.sourceDocumentHash || null};
  }catch(error){const series=dailyPoints(prior?.series,cutoff),last=series.at(-1);return {...item,series,value:last?.value ?? null,previous:null,change:null,performance:{day:null},observedAt:last?.date || null,retrievedAt:prior?.retrievedAt || null,publishedAt:prior?.publishedAt || null,reportPeriodStart:prior?.reportPeriodStart || null,reportPeriodEnd:prior?.reportPeriodEnd || null,sourceDocumentHash:prior?.sourceDocumentHash || null,quoteStatus:last ? 'preserved' : 'unavailable',evidenceOrigin:'provider',retrievalError:String(error.message).slice(0,160)};}
 }));
}
module.exports={markets,parseUsdaProteinPages,loadUsdaProteins};
