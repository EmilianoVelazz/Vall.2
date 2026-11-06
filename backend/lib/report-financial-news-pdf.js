'use strict';
function makeFinancialNewsPdf(title,report,helpers){
 const {PDFDocument,weekly:model,pdfPageHeader,pdfExecutiveFooter,pdfPersonalization}=helpers,{t=value=>value,locale='es-MX'}=helpers.localization || {},desk=model.newsExecutive;
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'A4',margins:{top:32,bottom:40,left:35,right:35},bufferPages:true,info:{Title:title,Author:'VALLNEWS'}}),chunks=[];let page=1,y=65;const x=35,w=doc.page.width-70,bottom=doc.page.height-75,ink='#193758',muted='#5c7285',line='#d4e0e8';
  doc.on('data',chunk=>chunks.push(chunk));doc.on('error',reject);doc.on('end',()=>{const bytes=Buffer.concat(chunks);Object.defineProperty(bytes,'reportPageCount',{value:page});resolve(bytes);});
  doc._vallPdfDataOnly=true;doc._vallPdfPersonalization=pdfPersonalization(report);
  const write=(text,left,top,width,size=9,bold=false,color=ink,options={})=>doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color).text(t(String(text)),left,top,{width,lineGap:2,...options});
  const height=(text,width,size=9,bold=false)=>doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).heightOfString(t(String(text)),{width,lineGap:2});
  const stamp=value=>new Date(value).toLocaleString(locale,{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'});
  const header=()=>{doc._vallPdfPageNumber=page;pdfPageHeader(doc,t(desk.titleLabel || 'Daily News · Inteligencia financiera').toUpperCase());};
  const next=()=>{pdfExecutiveFooter(doc,page);doc.addPage();page++;header();y=65;};
  const band=label=>{doc.rect(x,y,w,17).fill(ink);write(label,x+6,y+3,w-12,8.5,true,'#ffffff');y+=22;};
  const cardSize=item=>{
   const titleHeight=height(item.title,w-16,10.5,true),descriptionHeight=item.description ? height(item.description,w-16,8.5)+6 : 0,col=(w-30)/2,analysisHeight=Math.max(height(item.effect,col,8.2),report.personalization?.sections?.risks===false ? 0 : height(item.watch,col,8.2));
   return {titleHeight,descriptionHeight,col,cardHeight:titleHeight+descriptionHeight+analysisHeight+85+(item.language==='original' ? 10 : 0)};
  };
  try{
   header();write(report.title || title,x,y,w,16,true);y+=26;write(desk.date+' · '+desk.stories.length+' '+t('noticias')+' · '+desk.sourceCount+' '+t('fuentes')+' · '+t('Corte')+': '+stamp(report.generatedAt),x,y,w,8,false,muted);y+=18;
   write(model.summary,x,y,w,8.5);y+=height(model.summary,w,8.5)+8;write(desk.note,x,y,w,7.5,false,muted);y+=height(desk.note,w,7.5)+12;
   if(!desk.stories.length){band(t('Cobertura del día'));write(report.newsStatus==='unavailable' ? t('Las fuentes no respondieron en esta consulta. Vuelve a consultar; no se sustituyen con noticias de fechas anteriores.') : t('No hay publicaciones financieras del día disponibles en las fuentes recuperadas.'),x,y,w,10);}
   for(const group of desk.groups){
    if(y+cardSize(group.stories[0]).cardHeight+22>bottom)next();band(group.label);
    for(const item of group.stories){
     const {titleHeight,descriptionHeight,col,cardHeight}=cardSize(item);
     if(y+cardHeight>bottom){next();band(group.label+' · '+t('continuación'));}
     const top=y;doc.roundedRect(x,top,w,cardHeight,4).fillAndStroke('#ffffff',line);write((item.sourceType==='primary' ? t('Comunicado oficial') : t('Publicación periodística'))+' · '+stamp(item.publishedAt),x+8,y+6,w-16,7.5,false,muted);y+=20;write(item.title,x+8,y,w-16,10.5,true);y+=titleHeight+5;
     if(item.language==='original'){write(t('Titular en su idioma original'),x+8,y,w-16,7.5,false,muted);y+=10;}
     if(item.description){write(item.description,x+8,y,w-16,8.5);y+=descriptionHeight;}
     doc.rect(x+8,y,w-16,16).fill('#edf2f6');write(item.channel,x+14,y+3,w-28,8,true);y+=22;
     write(t('Posibles repercusiones'),x+8,y,col,8.2,true);if(report.personalization?.sections?.risks!==false)write(t('Qué vigilar'),x+22+col,y,col,8.2,true);y+=14;write(item.effect,x+8,y,col,8.2);if(report.personalization?.sections?.risks!==false)write(item.watch,x+22+col,y,col,8.2);
     const linkY=top+cardHeight-14;if(report.personalization?.sections?.sources!==false)write(t('Leer publicación')+' · '+item.source,x+8,linkY,w-16,7.5,false,'#52728e',{link:item.url});y=top+cardHeight+8;
    }
   }
   pdfExecutiveFooter(doc,page);doc.end();
  }catch(error){doc.end();reject(error);}
 });
}
module.exports={makeFinancialNewsPdf};
