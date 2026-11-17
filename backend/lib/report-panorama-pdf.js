'use strict';
const {PDFDocument:MergeDocument,StandardFonts,rgb,PDFName,PDFHexString}=require('pdf-lib');
const path=require('node:path');
const {availablePresentationModel,hasPublishedReportData}=require('../../shared/report-available-data.mjs');
const {panoramaChart,panoramaNumber,panoramaSignalLayout}=require('../../shared/report-panorama-chart.mjs');
const {BRAND}=require('./report-branding');
function introductoryPdf(report,desk,entries,helpers){
 const {PDFDocument,pdfPersonalization,pdfPageHeader,pdfExecutiveFooter}=helpers;
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'A4',margins:{top:32,bottom:65,left:34,right:34},bufferPages:true,info:{Title:report.title,Author:'VALLNEWS'}}),buffers=[],links=[];let page=1,y=66;
  const x=34,w=doc.page.width-68,bottom=doc.page.height-76,ink='#193758',muted='#586b78';
  let summaryPage=0;
  doc._vallPdfDataOnly=true;doc._vallPdfPersonalization=pdfPersonalization(report);doc.on('data',data=>buffers.push(data));doc.on('error',reject);doc.on('end',()=>resolve({bytes:Buffer.concat(buffers),pages:page,links,summaryPage}));
  const head=()=>{doc._vallPdfPageNumber=page;pdfPageHeader(doc,'PANORAMA GENERAL · INFORME INTEGRADO');};
  const next=()=>{pdfExecutiveFooter(doc,page);doc.addPage();page++;head();y=66;};
  doc.registerFont('VallBody',path.join(__dirname,'../../assets/fonts/noto-jp/NotoSansJP-Regular.otf'));doc.registerFont('VallBold',path.join(__dirname,'../../assets/fonts/noto-jp/NotoSansJP-Bold.otf'));
  const font=(text,bold=false)=>/[↑↓→]/.test(text) ? (bold ? 'VallBold' : 'VallBody') : (bold ? 'Helvetica-Bold' : 'Helvetica');
  const height=(text,width,size=8.6,bold=false)=>doc.font(font(String(text),bold)).fontSize(size).heightOfString(String(text),{width,lineGap:1.5});
  const write=(text,left,top,width,size=8.6,bold=false,color=ink)=>doc.font(font(String(text),bold)).fontSize(size).fillColor(color).text(String(text),left,top,{width,lineGap:1.5});
  const band=(title,reserve=45)=>{if(y+reserve>bottom)next();doc.rect(x,y,w,18).fill(ink);write(title,x+6,y+4,w-12,8.5,true,'#ffffff');y+=24;};
  const paragraph=(title,body)=>{const h=height(body,w,8.7)+height(title,w,9,true)+13;if(y+h>bottom)next();write(title,x,y,w,9,true);y+=height(title,w,9,true)+5;write(body,x,y,w,8.7);y+=height(body,w,8.7)+8;};
  try{
   head();
   write('EDICIÓN INTEGRAL',x,118,w,9,true,BRAND.teal);
   doc.roundedRect(x,151,w,265,8).fill(BRAND.navy);
   write('PANORAMA GLOBAL',x+24,178,w-48,9,true,'#a9d9d5');
   let titleSize=32;while(titleSize>21 && height(report.title,w-48,titleSize,true)>130)titleSize--;
   write(report.title,x+24,217,w-48,titleSize,true,'#ffffff');
   write('Análisis, gráficas, tablas y noticias\nen un solo documento.',x+24,355,w-48,12,false,'#deebf1');
   write(desk.scopeLabel,x,450,w,13,true);
   write('Corte de la edición',x,510,w,9,true,muted);
   write(new Date(report.generatedAt).toLocaleString('es-MX',{timeZone:'America/Mexico_City',dateStyle:'long',timeStyle:'short'})+' · Ciudad de México',x,532,w,12,true);
   const stats=[['CAPÍTULOS',String(entries.length).padStart(2,'0')],['INFORMES INTEGRADOS',String(desk.sourceCount).padStart(2,'0')],['CONTENIDO','Edición completa']];
   for(const [index,[label,value]]of stats.entries()){const left=x+index*w/3;doc.moveTo(left,593).lineTo(left+w/3-12,593).lineWidth(1).strokeColor(BRAND.line).stroke();write(label,left,608,w/3-12,7.5,true,muted);write(value,left,630,w/3-12,index===2 ? 13 : 24,true);}
   write('Una perspectiva global, organizada para consultar cada mercado con su contexto, fecha, unidad y fuente.',x,710,w,10,false,muted);
   next();
   write('Índice de contenidos',x,y,w,22,true);y+=38;
   write('Selecciona un capítulo para ir a su primera página. Los números corresponden a este documento completo.',x,y,w,9,false,muted);y+=38;
   for(const [index,entry]of entries.entries()){
    const label=String(index+1).padStart(2,'0')+' · '+entry.label,h=Math.max(46,height(label,w-108,10,true)+25);
    if(y+h>bottom){next();band('Índice de contenidos · continuación');}
    doc.roundedRect(x,y,w,h-5,4).fill(index%2 ? '#ffffff' : '#f1f5f8');
    write(label,x+9,y+8,w-108,10,true);write(entry.area+' · '+new Date(entry.generatedAt).toLocaleDateString('es-MX',{timeZone:'America/Mexico_City',dateStyle:'medium'}),x+9,y+h-20,w-108,7.3,false,muted);
    write(entry.start===entry.end ? 'Pág. '+entry.start : 'Págs. '+entry.start+' - '+entry.end,x+w-86,y+12,78,9,true,BRAND.teal);
    links.push({page:page-1,x,y,width:w,height:h-5,id:entry.id});y+=h;
   }
   next();summaryPage=page-1;
   write('Lectura ejecutiva',x,y,w,21,true);y+=33;write(desk.scopeLabel,x,y,w,9,true,muted);y+=18;
   const intro='Corte: '+new Date(report.generatedAt).toLocaleString('es-MX',{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'})+'. Las referencias conservan sus propias fechas, unidades y frecuencias.';write(intro,x,y,w,8.7);y+=height(intro,w,8.7)+12;
   if(desk.implications.length){band('Implicaciones para el negocio',height(desk.implications[0].body,w,8.7)+60);for(const item of desk.implications)paragraph(item.heading,item.body);}
   if(desk.signals?.length){
    band('Señales principales · nivel, variación y trayectoria',140);
    const gap=9,layout=panoramaSignalLayout(desk.signals),columns=entries.length<=4 && layout.charts.length>=4 ? 3 : 2;
    // A level without history can occupy the last card slot without inventing
    // a chart. This keeps the short index with the Mexico opening.
    const freeSlots=columns-layout.charts.length%columns,inlineLevels=entries.length<=4 && freeSlots<columns ? layout.levels.slice(0,freeSlots) : [],cards=[...layout.charts,...inlineLevels];
    for(let start=0;start<cards.length;start+=columns){
     const batch=cards.slice(start,start+columns),cardWidth=(w-gap*(batch.length-1))/batch.length,levelSize=cardWidth<200 ? 10.5 : 12,sizes=batch.map(item=>({label:height(item.label,cardWidth-16,8.4,true),level:height(item.value+' '+item.unit,cardWidth-16,levelSize,true),plot:inlineLevels.includes(item) ? 0 : 73,change:item.change ? 23 : 0})),cardHeight=Math.max(...sizes.map(size=>size.label+size.plot+size.change+size.level+27));if(y+cardHeight>bottom){next();band('Señales principales · continuación');}
     for(const [index,item] of batch.entries()){
      const left=x+index*(cardWidth+gap),size=sizes[index];doc.roundedRect(left,y,cardWidth,cardHeight,5).fillAndStroke('#f7f9fb','#d5e0e7');let top=y+8;
      write(item.label,left+8,top,cardWidth-16,8.4,true);top+=size.label+4;write(item.value+' '+item.unit,left+8,top,cardWidth-16,levelSize,true);top+=size.level;
      if(item.change){write(item.change,left+8,top,cardWidth-16,8,false,item.numericChange<0 ? '#8a5e58' : item.numericChange>0 ? '#586b47' : muted);top+=11;write(item.baseDate+' / '+item.date,left+8,top,cardWidth-16,6.8,false,muted);top+=12;}
      write((item.kind==='structural' ? 'Periodo anual: ' : 'Fecha del dato: ')+item.date,left+8,top,cardWidth-16,7,false,muted);top+=12;
      if(size.plot){
       const chart=panoramaChart(item,{width:cardWidth-58,height:47}),px=left+43,py=top+5;
       for(const tick of chart.ticks){const yy=py+chart.y(tick);doc.moveTo(px,yy).lineTo(px+chart.width,yy).lineWidth(.4).strokeColor('#dce3e8').stroke();write(panoramaNumber(tick),left+5,yy-3,33,6.2,false,muted);}
       if(chart.annual){doc.moveTo(px,py+chart.zero).lineTo(px+chart.width,py+chart.zero).lineWidth(.6).strokeColor('#9aabb8').stroke();for(const point of chart.nodes){doc.rect(px+point.x-chart.barWidth/2,py+Math.min(point.y,chart.zero),chart.barWidth,Math.max(.8,Math.abs(point.y-chart.zero))).fill(chart.tone);write(point.date,px+point.x-11,py+53,25,6.4,false,muted);}}
       else{for(const [n,point] of chart.nodes.entries()){if(n)doc.lineTo(px+point.x,py+point.y);else doc.moveTo(px+point.x,py+point.y);}doc.lineWidth(1.2).strokeColor(chart.tone).stroke();for(const point of [chart.nodes[0],chart.nodes.at(-1)])doc.circle(px+point.x,py+point.y,1.8).fill(chart.tone);write(chart.first,px,py+53,chart.width/2,6.4,false,muted);for(const tick of chart.timeTicks)write(tick.label,px+tick.x-8,py+53,20,6.4,false,muted);doc.font('Helvetica').fontSize(6.4);const sw=doc.widthOfString(chart.last);write(chart.last,px+chart.width-sw,py+53,sw+1,6.4,false,muted);}
      }
     }
     y+=cardHeight+8;
    }
    for(const item of layout.levels.filter(item=>!inlineLevels.includes(item))){
     const labelWidth=w*.39,valueWidth=w*.57,value=item.value+' '+item.unit,detail=(item.kind==='structural' ? 'Periodo anual: ' : item.cadence==='weekly' ? 'Publicación semanal: ' : item.cadence==='monthly' ? 'Publicación mensual: ' : 'Fecha del dato: ')+item.date+(item.change ? ' · '+item.change+' ('+item.baseDate+' / '+item.date+')' : ''),h=Math.max(height(item.label,labelWidth,8.4,true),height(value,valueWidth,10,true))+height(detail,w-16,7)+21;
     if(y+h>bottom){next();band('Señales principales · continuación');}doc.roundedRect(x,y,w,h,5).fillAndStroke('#f7f9fb','#d5e0e7');write(item.label,x+8,y+7,labelWidth,8.4,true);write(value,x+w*.41,y+6,valueWidth,10,true);write(detail,x+8,y+h-height(detail,w-16,7)-6,w-16,7,false,muted);y+=h+8;
    }
    const note='Cada gráfica conserva su unidad y escala propia; las alturas no son comparables entre tarjetas.';if(y+22>bottom)next();write(note,x,y,w,7.4,false,muted);y+=height(note,w,7.4)+12;
   }else{band('Lectura ejecutiva · señales por frente');for(const item of desk.facts)paragraph(item.heading,item.body);}

   pdfExecutiveFooter(doc,page);doc.end();
  }catch(error){doc.end();reject(error);}
 });
}
function newsPdf(report,chapter,helpers){
 return new Promise((resolve,reject)=>{
  const {PDFDocument,pdfPersonalization,pdfPageHeader,pdfExecutiveFooter}=helpers,doc=new PDFDocument({size:'A4',margins:{top:34,bottom:70,left:34,right:34},bufferPages:true,info:{Title:chapter.label,Author:'VALLNEWS'}}),buffers=[];let page=1,y=65;const x=34,w=doc.page.width-68;
  doc._vallPdfDataOnly=true;doc._vallPdfPersonalization=pdfPersonalization(report);doc.on('data',data=>buffers.push(data));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(buffers)));const head=()=>{doc._vallPdfPageNumber=page;pdfPageHeader(doc,'PANORAMA · NOTICIAS Y AGENDA');};head();
  doc.font('Helvetica-Bold').fontSize(17).fillColor('#193758').text(chapter.label,x,y,{width:w});y+=31;
  try{for(const item of chapter.news){const body=[item.description,item.effect && 'Posibles repercusiones: '+item.effect,item.watch && 'Qué vigilar: '+item.watch].filter(Boolean).join('\n\n');const titleHeight=doc.font('Helvetica-Bold').fontSize(10).heightOfString(item.title,{width:w}),bodyHeight=doc.font('Helvetica').fontSize(9).heightOfString(body,{width:w,lineGap:2}),h=titleHeight+bodyHeight+36;if(y+h>doc.page.height-78){pdfExecutiveFooter(doc,page);doc.addPage();page++;head();y=65;}doc.font('Helvetica-Bold').fontSize(10).fillColor('#193758').text(item.title,x,y,{width:w});y+=titleHeight+7;doc.font('Helvetica').fontSize(9).fillColor('#344b5f').text(body,x,y,{width:w,lineGap:2});y+=bodyHeight+7;doc.fontSize(8).fillColor('#597c97').text(item.source+' · '+item.publishedAt.slice(0,10),x,y,{width:w,link:item.url});y+=22;}pdfExecutiveFooter(doc,page);doc.end();}catch(error){doc.end();reject(error);}
 });
}
async function makePanoramaPdf(title,report,helpers){
 const {weekly:model,renderPart}=helpers,desk=availablePresentationModel(model).panorama,documents=[];
 if(!hasPublishedReportData(model))throw Object.assign(Error('No hay datos publicados para generar este informe.'),{status:422,code:'REPORT_DATA_UNAVAILABLE'});
 for(const chapter of desk.chapters){const input={...chapter.componentReport,panoramaMember:true,panoramaPrint:'complete',analysisPeriod:report.analysisPeriod,personalization:{...report.personalization,customTitle:chapter.label}};const bytes=chapter.kind==='news' ? await newsPdf(report,chapter,{...helpers,pdfExecutiveFooter:()=>{}}) : await renderPart(chapter.label,input);const pdf=await MergeDocument.load(bytes);documents.push({id:chapter.id,label:chapter.label,area:chapter.area,generatedAt:chapter.generatedAt,pdf,pages:pdf.getPageCount()});}
 let count=1,front;
 for(let attempt=0;attempt<5;attempt++){let start=count+1;const entries=documents.map(item=>{const row={...item,start,end:start+item.pages-1};start+=item.pages;return row;});front=await introductoryPdf({...report,title:report.title || title},desk,entries,{...helpers,pdfExecutiveFooter:()=>{}});if(front.pages===count)break;count=front.pages;if(attempt===4)throw Error('No se pudo estabilizar la paginación del índice.');}
 const result=await MergeDocument.create(),intro=await MergeDocument.load(front.bytes),indexTargets=new Map();for(const page of await result.copyPages(intro,intro.getPageIndices()))result.addPage(page);
 for(const item of documents){indexTargets.set(item.id,result.getPageCount());for(const page of await result.copyPages(item.pdf,item.pdf.getPageIndices()))result.addPage(page);}
 if(result.getPageCount()>200)throw Error('La composición de Panorama supera el límite operativo de páginas.');
 const font=await result.embedFont(StandardFonts.Helvetica),bold=await result.embedFont(StandardFonts.HelveticaBold),total=result.getPageCount(),color=hex=>rgb(...hex.match(/[a-f0-9]{2}/gi).map(part=>Number.parseInt(part,16)/255));
 const classification=({confidential:'CONFIDENCIAL',shareable:'COMPARTIBLE'})[report.personalization?.confidentiality] || 'USO INTERNO';
 for(const [index,page] of result.getPages().entries()){
  const width=page.getWidth();page.drawRectangle({x:32,y:18,width:width-64,height:27,color:rgb(1,1,1)});
  page.drawLine({start:{x:34,y:43},end:{x:width-34,y:43},thickness:.5,color:color(BRAND.line)});page.drawLine({start:{x:34,y:43},end:{x:58,y:43},thickness:1.5,color:color(BRAND.teal)});
  page.drawText(classification+' · VALLNEWS · PANORAMA GENERAL',{x:34,y:29,size:6,font,color:color(BRAND.muted)});
  const label='Página '+(index+1)+' / '+total;page.drawRectangle({x:width-105,y:24,width:71,height:14,color:color(BRAND.pale)});page.drawText(label,{x:width-40-bold.widthOfTextAtSize(label,6.5),y:29,size:6.5,font:bold,color:color(BRAND.navy)});
 }
 for(const item of front.links){const page=result.getPage(item.page),target=result.getPage(indexTargets.get(item.id)),annotation=result.context.register(result.context.obj({Type:'Annot',Subtype:'Link',Rect:[item.x,page.getHeight()-item.y-item.height,item.x+item.width,page.getHeight()-item.y],Border:[0,0,0],Dest:[target.ref,PDFName.of('Fit')]}));page.node.addAnnot(annotation);}
 // Named chapter bookmarks complement the printed index in desktop and mobile readers.
 const outlineRows=[{label:'Portada',page:0},{label:'Índice de contenidos',page:1},{label:'Lectura ejecutiva',page:front.summaryPage},...documents.map(item=>({label:item.label,page:indexTargets.get(item.id)}))],outlines=result.context.obj({Type:'Outlines',Count:outlineRows.length}),outlineRef=result.context.register(outlines),nodes=outlineRows.map(item=>result.context.obj({Title:PDFHexString.fromText(item.label),Parent:outlineRef,Dest:[result.getPage(item.page).ref,PDFName.of('Fit')]})),refs=nodes.map(node=>result.context.register(node));
 nodes.forEach((node,index)=>{if(index)node.set(PDFName.of('Prev'),refs[index-1]);if(index+1<refs.length)node.set(PDFName.of('Next'),refs[index+1]);});outlines.set(PDFName.of('First'),refs[0]);outlines.set(PDFName.of('Last'),refs.at(-1));result.catalog.set(PDFName.of('Outlines'),outlineRef);
 result.setTitle(report.title || title);result.setAuthor('VALLNEWS');const buffer=Buffer.from(await result.save());Object.defineProperty(buffer,'reportPageCount',{value:total});return buffer;
}
module.exports={makePanoramaPdf};
