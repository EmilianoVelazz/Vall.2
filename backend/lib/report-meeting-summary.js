'use strict';
const path=require('node:path');
const {weeklyReport}=require('../../shared/report-weekly.mjs');
const {BRAND}=require('./report-branding');
const text=value=>String(value??'').replace(/\s+/g,' ').trim();
function meetingSummaryModel(report,{t=value=>value}={}){
 const model=weeklyReport(report),panorama=model.panorama;
 const candidates=panorama?.signals?.length?panorama.signals:(model.references||[]).filter(item=>Number.isFinite(item.last?.value)).map(item=>({label:item.label,value:item.last.value.toLocaleString('es-MX',{maximumFractionDigits:3}),unit:item.unit,date:item.last.date,source:item.source,url:item.url}));
 const indicators=candidates.filter(item=>Number.isFinite(Date.parse(item.date))&&Date.parse(item.date)<=Date.parse(report.generatedAt)).slice(0,3);
 const panels=panorama?.facts?.length?panorama.facts:model.summaryPanels?.length?model.summaryPanels:(report.sections||[]).map(item=>({heading:item.heading,body:item.text}));
 const seen=new Set(),extracts=panels.filter(item=>text(item.body)&&!seen.has(text(item.body))&&seen.add(text(item.body))).slice(0,3).map(item=>({heading:text(item.heading),body:text(item.body)}));
 if(!indicators.length&&!extracts.length&&!text(report.summary))throw Object.assign(Error('No hay contenido para preparar el resumen.'),{status:422,code:'REPORT_SUMMARY_EMPTY'});
 const links=[...indicators,...(report.sourceLinks||[])].flatMap(item=>{try{const url=new URL(item.url);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?[{label:text(item.source||item.label||url.hostname),url:url.href}]:[];}catch{return [];}});
 return {title:report.title,generatedAt:report.generatedAt,summary:text(model.summary||report.summary),indicators,extracts,sources:[...new Map(links.map(item=>[item.url,item])).values()].slice(0,3),note:t('Selección de cifras y extractos del informe abierto. Consulta el documento completo para revisar el contexto, los riesgos y todas las fuentes.')};
}
function makeMeetingSummaryPdf(report,{PDFDocument,pdfPageHeader,pdfExecutiveFooter,pdfPersonalization,t=value=>value}={}){
 const model=meetingSummaryModel(report,{t});
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'A4',margins:{top:36,left:36,right:36,bottom:36},bufferPages:true,info:{Title:report.title+' · '+t('Resumen para junta'),Author:'VALLNEWS'}}),chunks=[];
  doc.registerFont('MeetingBody',path.join(__dirname,'../../assets/fonts/noto-jp/NotoSansJP-Regular.otf'));doc.registerFont('MeetingBold',path.join(__dirname,'../../assets/fonts/noto-jp/NotoSansJP-Bold.otf'));
  doc._vallPdfDataOnly=true;doc._vallPdfPersonalization=pdfPersonalization(report);doc.on('data',chunk=>chunks.push(chunk));doc.on('error',reject);
  doc.on('end',()=>{const bytes=Buffer.concat(chunks);Object.defineProperty(bytes,'reportPageCount',{value:1});resolve(bytes);});
  const x=36,w=doc.page.width-72;
  const measure=(value,width,size,bold=false)=>doc.font(bold?'MeetingBold':'MeetingBody').fontSize(size).heightOfString(value,{width,lineGap:1});
  const fit=(value,width,size,maxHeight,bold=false)=>{const input=text(value);if(measure(input,width,size,bold)<=maxHeight)return input;let low=0,high=input.length;while(low<high){const mid=Math.ceil((low+high)/2);if(measure(input.slice(0,mid)+'…',width,size,bold)<=maxHeight)low=mid;else high=mid-1;}const space=input.lastIndexOf(' ',low);return input.slice(0,space>low*.65?space:low).trim()+'…';};
  const write=(value,left,y,width,size=9,bold=false,color=BRAND.navy,options={})=>doc.font(bold?'MeetingBold':'MeetingBody').fontSize(size).fillColor(color).text(value,left,y,{width,lineGap:1,...options});
  try{
   pdfPageHeader(doc,t('Resumen para junta').toUpperCase());
   write(t('RESUMEN PARA JUNTA'),x,98,w,9,true,BRAND.teal);
   const title=fit(model.title,w,22,66,true);write(title,x,119,w,22,true);
   let y=119+measure(title,w,22,true)+12;
   const cut=new Date(model.generatedAt).toLocaleString('es-MX',{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'});write(t('Corte')+': '+cut+' · CDMX',x,y,w,8.5,false,BRAND.muted);y+=25;
   const introduction=fit(model.summary,w,9,43);write(introduction,x,y,w,9);y+=measure(introduction,w,9)+20;
   if(model.indicators.length){
    const gap=10,cw=(w-gap*(model.indicators.length-1))/model.indicators.length;
    for(const [i,item]of model.indicators.entries()){
     const left=x+i*(cw+gap);doc.roundedRect(left,y,cw,145,5).fillAndStroke(BRAND.pale,BRAND.line);doc.rect(left,y,cw,3).fill(BRAND.teal);
     write(fit(item.label,cw-18,9,35,true),left+9,y+13,cw-18,9,true);
     let size=18;while(size>10&&doc.font('MeetingBold').fontSize(size).widthOfString(text(item.value))>cw-18)size--;
     write(text(item.value),left+9,y+51,cw-18,size,true);write(fit(item.unit,cw-18,8,22),left+9,y+78,cw-18,8);
     write(item.date,left+9,y+105,cw-18,8,true);write(fit(item.source,cw-18,7.5,23),left+9,y+120,cw-18,7.5,false,BRAND.muted);
    }y+=166;
   }
   write(t('Lectura ejecutiva')+' · '+t('Extractos'),x,y,w,11,true);y+=25;
   for(const item of model.extracts){write(fit(item.heading,w,9,22,true),x,y,w,9,true);y+=22;const body=fit(item.body,w,9,40);write(body,x,y,w,9);y+=measure(body,w,9)+13;}
   y=Math.max(y,675);
   if(y>700)y=700;
   if(model.sources.length){write(t('Fuentes'),x,y,w,8,true);y+=16;for(const item of model.sources){write(fit(item.label+' · '+new URL(item.url).hostname,w,7.5,12),x,y,w,7.5,false,BRAND.teal,{link:item.url});y+=14;}}
   write(fit(model.note,w,7.5,26),x,750,w,7.5,false,BRAND.muted);
   pdfExecutiveFooter(doc,1);
   if(doc.bufferedPageRange().count!==1)throw Object.assign(Error('No se pudo componer un resumen legible de una página.'),{status:422,code:'REPORT_SUMMARY_LAYOUT'});
   doc.end();
  }catch(error){doc.end();reject(error);}
 });
}
module.exports={meetingSummaryModel,makeMeetingSummaryPdf};
