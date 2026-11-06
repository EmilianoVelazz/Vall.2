'use strict';
const {missingReportValue}=require('../../shared/report-available-data.mjs');
const {FX_TREASURY_COLORS,fxSourceCaption}=require('../../shared/report-fx-actions.mjs');
function makeFxExecutivePdf(title,report,helpers){
 const {PDFDocument,weekly:model,pdfPageHeader,pdfExecutiveFooter,pdfPersonalization,chartGeometry}=helpers,{t=value=>value}=helpers.localization || {},desk=model.fxExecutive;
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'A4',margins:{top:30,bottom:38,left:32,right:32},bufferPages:true,info:{Title:title,Author:'VALLNEWS'}}),chunks=[];let pages=1,y=61;
  doc.on('data',chunk=>chunks.push(chunk));doc.on('pageAdded',()=>pages++);doc.on('error',reject);doc.on('end',()=>{const buffer=Buffer.concat(chunks);Object.defineProperty(buffer,'reportPageCount',{value:pages});resolve(buffer);});
  const x=32,w=doc.page.width-64,bottom=doc.page.height-62,ink='#193758',muted='#526882',line='#dce5ed',n=(value,digits=4)=>Number.isFinite(value) ? value.toLocaleString('es-MX',{maximumFractionDigits:digits}) : '—';
  const write=(text,left,top,width,size=8,bold=false,color=ink)=>doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color).text(String(text),left,top,{width,lineGap:1});
  const measure=(text,width,size=8)=>doc.font('Helvetica').fontSize(size).heightOfString(String(text),{width,lineGap:1});
  const section=label=>{doc.rect(x,y,w,16).fill(ink);write(t(label),x+5,y+3,w-10,8,true,'#ffffff');y+=19;};
  const next=()=>{pdfExecutiveFooter(doc,pages);doc.addPage();doc._vallPdfPageNumber=pages;pdfPageHeader(doc,t('Tesorería cambiaria').toUpperCase());y=61;};
  const selectRows=(table,predicate)=>{const indices=table.rows.flatMap((row,index)=>predicate(table.rowCodes[index]) ? [index] : []);return {...table,rows:indices.map(index=>table.rows[index]),rowCodes:indices.map(index=>table.rowCodes[index]),costTones:indices.map(index=>table.costTones[index])};};
  const coreCodes=new Set(['MXN','BRL','CAD','EUR','GBP','JPY','CNY']),coreTables=model.results.map(table=>selectRows(table,code=>coreCodes.has(code))).filter(table=>table.rows.length),globalTables=model.results.map(table=>selectRows(table,code=>!coreCodes.has(code))).filter(table=>table.rows.length);
  const colors={adverse:['#f6edeb','#965d59'],favorable:['#edf3ed','#50745b'],neutral:['#f0f3f6',muted],unavailable:['#ffffff',muted]};
  const renderTable=table=>{
    section(table.title);
    const previous=table.columns.indexOf(t('Anterior')),spot=table.columns.indexOf(t('Spot')),indices=table.columns.map((_,index)=>index).filter(index=>index!==previous),weights=indices.map(column=>column===0 ? 1.2 : column===table.columns.length-1 ? 4.6 : 1),total=weights.reduce((sum,value)=>sum+value,0),cols=(table.columns.length===10 && previous===2 ? [.10,.11,.08,.08,.085,.095,.095,.095,.26] : table.columns.length===7 && previous===2 ? [.12,.12,.10,.10,.10,.46] : weights.map(weight=>weight/total)).map(weight=>weight*w);
    let left=x;doc.rect(x,y,w,19).fill('#e6edf4');indices.forEach((column,index)=>{write(column===spot && previous>=0 ? t('Spot / ant.') : table.columns[column],left+3,y+3,cols[index]-6,7.1,true);left+=cols[index];});y+=20;
    table.rows.forEach((row,ordinal)=>{
     const cells=indices.map(column=>column===spot && previous>=0 ? row[spot]+'\n'+t('Ant.')+' '+row[previous] : row[column]),h=Math.max(22,...cells.map((cell,index)=>measure(cell,cols[index]-6,7.5)+4));doc.rect(x,y,w,h).fill(ordinal%2 ? '#f1f5f8' : '#ffffff');let cx=x;
     cells.forEach((cell,index)=>{const period=table.changeColumns.indexOf(indices[index]);if(period>=0){const tone=table.costTones[ordinal]?.[period] || 'unavailable',[bg,fg]=colors[tone] || colors.unavailable;doc.roundedRect(cx+1,y+3,cols[index]-2,13,2).fill(bg);write(cell,cx+3,y+5,cols[index]-6,7.5,true,fg);}else write(cell,cx+3,y+3,cols[index]-6,7.5,index===0);cx+=cols[index];});
     const reference=desk.main.find(item=>item.label===row[0]);if(reference?.url)doc.link(x,y,cols[0],h,reference.url);y+=h;
    });y+=5;
  };
  const plot=(visual,h=130,lx=x,width=w,top=y)=>{
    doc.roundedRect(lx,top,width,h-5,3).fillAndStroke('#f8fafb',line);write(visual.title,lx+5,top+5,width-10,8,true);
    const ph=h-55,px=lx+27,pw=width-122,py=top+23,series=visual.series,values=series.flatMap(item=>item.points.map(point=>point.value)),scale=chartGeometry.chartScale(values,{ticks:4}),first=Date.parse(visual.indexBaseDate),last=Date.parse(visual.indexEndDate),xx=date=>px+(Date.parse(date)-first)/(last-first || 1)*pw,yy=value=>py+(scale.max-value)/(scale.max-scale.min)*ph;
    for(const value of scale.ticks){doc.moveTo(px,yy(value)).lineTo(px+pw,yy(value)).strokeColor(line).lineWidth(.4).stroke();write(n(value,1),lx+2,yy(value)-3,21,7);}
    series.forEach(item=>{doc.save();item.points.forEach((point,index)=>{if(index && Date.parse(point.date)-Date.parse(item.points[index-1].date)<=7*86400000)doc.lineTo(xx(point.date),yy(point.value));else doc.moveTo(xx(point.date),yy(point.value));});doc.strokeColor(item.color || FX_TREASURY_COLORS[item.label] || '#668399').lineWidth(1.6).stroke().restore();});
    const endings=chartGeometry.spreadChartLabels(series.map(item=>({label:item.label,color:item.color,value:item.points.at(-1).value,y:yy(item.points.at(-1).value),actualY:yy(item.points.at(-1).value)})),py+3,py+ph-3,12);
    for(const item of endings){const color=item.color || FX_TREASURY_COLORS[item.label] || '#668399';doc.moveTo(px+pw+2,item.actualY).lineTo(px+pw+9,item.y).strokeColor(color).lineWidth(.6).stroke();write(item.label+' '+n(item.value,2),px+pw+12,item.y-3,80,7.2,true,color);}
    write(visual.indexBaseDate,px,py+ph+5,75,7,false,muted);write(visual.indexEndDate,px+pw-70,py+ph+17,75,7,false,muted);
  };
  try{
   doc._vallPdfDataOnly=true;doc._vallPdfPageNumber=1;doc._vallPdfPersonalization=pdfPersonalization(report);pdfPageHeader(doc,t('Tesorería cambiaria').toUpperCase());
   write(t('Tablero ejecutivo de divisas y coberturas'),x,y,w-93,13,true);write(report.generatedAt.slice(0,10),x+w-91,y+3,91,8);y+=25;
   const dxy=desk.dxy,delta=dxy?.periods.day?.value,dxyText='DXY: '+n(dxy?.last.value,2)+(Number.isFinite(delta) ? ' ('+(delta>0 ? '+' : '')+n(delta,2)+'%)' : '')+' · '+(dxy?.last.date || '—');
   if(dxy){doc.roundedRect(x,y,w,29,3).fill('#edf3f8');write(dxyText,x+7,y+4,w-14,10,true);write(t('Cesta ICE de seis monedas. Cada par conserva su fecha; no son precios ejecutables.'),x+7,y+18,w-14,7,false,muted);if(dxy?.url)doc.link(x,y,w,29,dxy.url);y+=35;}
   for(const table of coreTables)renderTable(table);
   if(model.results.length){const note=t('Costo de comprar la moneda base: rojo = mayor, verde = menor. USD/MXN: USD con pesos; EUR/USD: EUR con USD.');write(note,x,y,w,7,false,muted);y+=measure(note,w,7)+5;}
   const rateText=[['Fed',desk.carry.fed],['Banxico',desk.carry.banxico],['Selic',desk.carry.selic],['MX–Fed',desk.carry.mexicoDifferential],['BR–Fed',desk.carry.brazilDifferential]].filter(([,value])=>!missingReportValue(value)).map(([label,value])=>label+' '+value).join(' · ');
   if(rateText){doc.roundedRect(x,y,w,31,3).fillAndStroke('#f7f9fb',line);write(t('Tasas objetivo / diferencial'),x+6,y+4,w-12,7.7,true);write(rateText,x+6,y+17,w-12,7.5);y+=37;}
   const risk=desk.risk;
   if(risk){const text='USD/MXN · '+t('Vol. realizada 20 sesiones')+' '+n(risk.volatility,2)+'% · '+t('Rango de cierres')+' '+n(risk.low)+'–'+n(risk.high)+' · '+t('Escenario al cierre de mes')+' '+n(risk.scenarioLow)+'–'+n(risk.scenarioHigh)+' ('+risk.endDate+')';write(text,x,y,w,7.5);y+=measure(text,w,7.5)+5;}
   const visual=model.visuals.find(item=>!item.fxRegionalChart);
   if(visual){
    section('Dólar y monedas comerciales de América · seis meses · base 100');
    const ph=99,px=x+29,pw=w-133,py=y+3,series=visual.series,values=series.flatMap(item=>item.points.map(point=>point.value)),scale=chartGeometry.chartScale(values,{ticks:4}),first=Date.parse(visual.indexBaseDate),last=Date.parse(visual.indexEndDate),xx=date=>px+(Date.parse(date)-first)/(last-first || 1)*pw,yy=value=>py+(scale.max-value)/(scale.max-scale.min)*ph;
    for(const value of scale.ticks){doc.moveTo(px,yy(value)).lineTo(px+pw,yy(value)).strokeColor(line).lineWidth(.4).stroke();write(n(value,1),x,yy(value)-3,25,7);}
    series.forEach(item=>{doc.save();item.points.forEach((point,index)=>{if(index && Date.parse(point.date)-Date.parse(item.points[index-1].date)<=7*86400000)doc.lineTo(xx(point.date),yy(point.value));else doc.moveTo(xx(point.date),yy(point.value));});doc.strokeColor(FX_TREASURY_COLORS[item.label] || '#668399').lineWidth(1.8).stroke().restore();});
    const endings=chartGeometry.spreadChartLabels(series.map(item=>({label:item.label,value:item.points.at(-1).value,y:yy(item.points.at(-1).value),actualY:yy(item.points.at(-1).value)})),py+3,py+ph-3,15);
    for(const item of endings){const color=FX_TREASURY_COLORS[item.label] || '#668399';doc.moveTo(px+pw+2,item.actualY).lineTo(px+pw+10,item.y).strokeColor(color).lineWidth(.6).stroke();write(item.label+' '+n(item.value,2),px+pw+14,item.y-3,91,7.5,true,color);}
    write(visual.indexBaseDate,px,py+ph+4,90,7,false,muted);write(visual.indexEndDate,px+pw-70,py+ph+4,75,7,false,muted);y=py+ph+19;
   }
   for(const bullet of desk.bullets){const text=bullet.heading+': '+bullet.body;write(text,x,y,w,7.5);y+=measure(text,w,7.5)+5;}
   const decision=desk.decision;
   if(decision.items.length){
    const statements=decision.items.map(item=>item.code==='MXN' ? 'USD/MXN: '+(item.triggered ? t('Evaluar cobertura de 65% a 90D de pagos netos confirmados; umbral ilustrativo <18.70 cumplido.') : t('65% a 90D condicionado a spot <18.70; umbral no cumplido. No activar automáticamente.'))+' '+n(item.spot)+' ('+item.date+').' : 'USD/BRL: '+t('Evaluar spot o NDF hasta 30 días para pagos confirmados; no extender plazo sin validar exposición y liquidez.'));
    if(decision.stress)statements.push(t('Escenario si se cubre 65%: 35% abierto; USD +5% suma 1.75% al costo base del flujo, sin costo de cobertura.'));
    statements.push(t('Parámetros ilustrativos solicitados; sujetos a flujo neto, cobertura existente y límites aprobados.'));
    const h=22+statements.reduce((sum,text)=>sum+measure(text,w-14,7.4)+4,0);doc.roundedRect(x,y,w,h,3).fillAndStroke('#f2f6f3','#afc1b4');write(decision.title,x+7,y+6,w-14,8,true);let top=y+21;for(const text of statements){write(text,x+7,top,w-14,7.4);top+=measure(text,w-14,7.4)+4;}y+=h+5;
   }
   write(desk.methodology,x,y,w,7,false,muted);y+=measure(desk.methodology,w,7)+3;
   const dateText=desk.main.filter(item=>coreCodes.has(item.code)).map(item=>item.label+' '+item.last.date.slice(5)).join(' · ');write(dateText,x,y,w,6.8,false,muted);y+=measure(dateText,w,6.8)+3;
   for(const item of desk.catalysts.slice(0,1)){const caption=t(fxSourceCaption(item));write(caption,x,y,w,7,false,muted);doc.link(x,y,w,10,item.url);y+=11;}
   if(y>bottom)throw Object.assign(Error('El tablero ejecutivo excede una página legible.'),{layout:{y,bottom,pages}});
   const regional=model.visuals.filter(item=>item.fxRegionalChart),cw=(w-12)/2;
   let plottedRegional=0;
   if(globalTables.length || regional.length){next();for(const table of globalTables)renderTable({...table,title:'Cobertura global ampliada · '+(desk.main.length-7)+' monedas adicionales'});const refs=desk.main.filter(item=>!coreCodes.has(item.code)),dates=[...new Set(refs.map(item=>item.last.date))],note='Fechas: '+(dates.length===1 ? dates[0] : refs.map(item=>item.label+' '+item.last.date).join(' · '))+'. '+t('Alza de la gráfica: USD gana valor. Base 100 propia de cada panel; fechas comunes observadas.');write(note,x,y,w,7,false,muted);y+=measure(note,w,7)+8;const availableForCharts=bottom-y;if(regional.length && availableForCharts>=95){const chartH=Math.min(128,availableForCharts-10),top=y;regional.slice(0,2).forEach((item,index)=>plot(item,chartH,x+index*(cw+12),cw,top));y+=chartH;plottedRegional=2;}if(y>bottom)throw Object.assign(Error('La tabla global excede el espacio legible.'),{layout:{y,bottom,pages}});}
   if(regional.length>plottedRegional){next();section('Comparativas regionales · fuerza del USD · base 100');const remaining=regional.slice(plottedRegional);const top=y,rows=Math.ceil(remaining.length/2),available=bottom-top-25,rowHeight=Math.floor(available/rows),chartH=Math.min(205,rowHeight-6);remaining.forEach((item,index)=>plot(item,chartH,x+index%2*(cw+12),cw,top+Math.floor(index/2)*rowHeight));y=top+rows*rowHeight;write(t('Alza: USD se fortalece frente a la moneda indicada. Máximo cuatro líneas por panel, sin interpolar días.'),x,y,w,7,false,muted);y+=14;if(y>bottom)throw Object.assign(Error('Las comparativas regionales exceden el espacio legible.'),{layout:{y,bottom,pages}});}
   if(pages>3)throw Error('La edición de divisas excede tres páginas.');pdfExecutiveFooter(doc,pages);doc.end();
  }catch(error){doc.end();reject(error);}
 });
}
module.exports={makeFxExecutivePdf};
