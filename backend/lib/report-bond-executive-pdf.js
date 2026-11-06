'use strict';
const path=require('node:path');
const {availableReportTables}=require('../../shared/report-available-data.mjs');
const INK='#193758',MUTED='#586b78',LINE='#dce4ea';
function makeBondExecutivePdf(title,report,helpers){
    const {PDFDocument,weekly:model,pdfPageHeader,pdfExecutiveFooter,pdfPersonalization,chartGeometry}=helpers,{t=value=>value}=helpers.localization || {},desk=model.bondExecutive;
    return new Promise((resolve,reject)=>{
        const doc=new PDFDocument({size:'A4',margins:{top:34,bottom:40,left:34,right:34},bufferPages:true,info:{Title:title,Author:'VALLNEWS'}}),buffers=[];let page=1,count=1,y=65;
        doc.on('data',chunk=>buffers.push(chunk));doc.on('error',reject);doc.on('pageAdded',()=>count++);doc.on('end',()=>{const buffer=Buffer.concat(buffers);Object.defineProperty(buffer,'reportPageCount',{value:count});resolve(buffer);});
        doc.registerFont('VallBody',path.join(__dirname,'../../assets/fonts/noto-jp/NotoSansJP-Regular.otf'));doc.registerFont('VallBold',path.join(__dirname,'../../assets/fonts/noto-jp/NotoSansJP-Bold.otf'));
        const left=34,width=doc.page.width-68,bottom=doc.page.height-84,flags=report.personalization?.sections || {};
        doc._vallPdfDataOnly=true;doc._vallPdfPageNumber=1;doc._vallPdfPageLabel=t('Bonos · informe ejecutivo').toUpperCase();doc._vallPdfPersonalization=pdfPersonalization(report);
        const font=(bold,text)=>/[↑↓→]/u.test(String(text)) ? bold ? 'VallBold' : 'VallBody' : bold ? 'Helvetica-Bold' : 'Helvetica';
        const measure=(text,w,size=8.2,bold=false)=>doc.font(font(bold,text)).fontSize(size).heightOfString(String(text),{width:w,lineGap:1});
        const write=(text,x,top,w,size=8.2,bold=false,color=INK,extra={})=>doc.font(font(bold,text)).fontSize(size).fillColor(color).text(String(text),x,top,{width:w,lineGap:1,...extra});
        const header=()=>{doc._vallPdfPageNumber=page;pdfPageHeader(doc,doc._vallPdfPageLabel);};
        const next=()=>{pdfExecutiveFooter(doc,page);doc.addPage();page++;header();y=65;};
        const heading=text=>{doc.rect(left,y,width,18).fill(INK);write(text,left+6,y+4,width-12,8.3,true,'#ffffff');y+=23;};
        const check=()=>{if(y>bottom || count>(desk.international?.references.length ? 5 : 2))throw Object.assign(Error('El informe de Bonos excede el espacio disponible para una composición legible.'),{layout:{page,y,bottom,count}});};
        try{
            header();write(report.title || title,left,y,width*.7,16,true);write(report.generatedAt.slice(0,10),left+width*.7,y+4,width*.3,8,false,MUTED,{align:'right'});y+=27;
            if(desk.dashboard.length){const cw=width/desk.dashboard.length;desk.dashboard.forEach((item,index)=>{const x=left+index*cw;doc.roundedRect(x,y,cw-6,44,3).fillAndStroke('#f3f6f9',LINE);write(item.label,x+6,y+5,cw-18,8,true);write(item.value,x+6,y+18,cw-18,10,true);write(item.date,x+6,y+32,cw-18,7,false,MUTED);if(/^https:\/\//.test(item.url))doc.link(x,y,cw-6,44,item.url);});y+=51;}
            for(const panel of model.summaryPanels){const text=panel.heading+': '+panel.body,h=measure(text,width-10,8.4);write('•',left,y,8,8.4);write(text,left+10,y,width-10,8.4);y+=h+6;}
            const businessHeight=23+desk.business.reduce((sum,panel)=>sum+measure(panel.heading+': '+panel.body,width,8.3)+5,0);
            const plot=(visual,h,curve,x=left,w=width,top=y)=>{
                if(!visual)return;
                doc.roundedRect(x,top,w,h-5,3).fillAndStroke('#f8fafb',LINE);
                write(t(visual.title)+' · '+visual.unit,x+6,top+6,w-12,8,true);
                const aliases={'Grado de inversión · OAS':'IG · OAS','Alto rendimiento · OAS':'HY · OAS','EMBIG México':'EMBIG MX','Treasury 10A':'Nominal 10A','TIPS real 10A':'Real 10A','Breakeven 10A':'Breakeven 10A'};
                const sets=curve ? visual.curveSets : visual.series.map((item,index)=>({key:index,label:visual.historyKey==='sovereign' ? item.shortLabel : aliases[item.shortLabel] || item.shortLabel || item.label,date:'',color:['#668399','#7B8668','#8B9299'][index]})),points=curve ? visual.curvePoints : null,values=curve ? points.flatMap(point=>sets.map(set=>point[set.key])) : visual.series.flatMap(item=>item.points.map(point=>point.value)),scale=chartGeometry.chartScale(values,{ticks:4}),px=x+31,pw=w-42,py=top+26,ph=h-68;
                if(values.every(value=>value>=0) && scale.min<0){scale.min=0;scale.ticks=scale.ticks.filter(value=>value>=0);}
                const dates=curve ? [] : visual.series.flatMap(item=>item.points.map(point=>Date.parse(point.date))),first=visual.bondHistory ? Date.parse(visual.rangeStart) : Math.min(...dates),last=visual.bondHistory ? Date.parse(visual.rangeEnd) : Math.max(...dates),xx=value=>curve ? px+value/(points.length-1 || 1)*pw : px+(Date.parse(value)-first)/(last-first || 1)*pw,yy=value=>py+(scale.max-value)/(scale.max-scale.min)*ph;
                for(const value of scale.ticks){doc.moveTo(px,yy(value)).lineTo(px+pw,yy(value)).strokeColor(visual.historyKey==='slope' && value===0 ? '#8B9299' : LINE).lineWidth(visual.historyKey==='slope' && value===0 ? .9 : .35).stroke();write(value.toLocaleString('es-MX',{maximumFractionDigits:2}),x+2,yy(value)-3,25,7,false,MUTED,{align:'right'});}
                sets.forEach((set,index)=>{const observations=curve ? points.map((point,ordinal)=>({x:xx(ordinal),y:yy(point[set.key])})) : visual.series[index].points.map(point=>({x:xx(point.date),y:yy(point.value),date:point.date}));doc.save();if(index)doc.dash(index===1 ? [5,3] : [2,3]);observations.forEach((point,ordinal)=>{if(ordinal && !(visual.bondHistory && Date.parse(point.date)-Date.parse(observations[ordinal-1].date)>(visual.monthly ? 32 : 62)*86400000))doc.lineTo(point.x,point.y);else doc.moveTo(point.x,point.y);});doc.strokeColor(set.color).lineWidth(index===0 ? 1.6 : 1.1).stroke().restore();});
                if(curve)points.forEach((point,index)=>write(point.label,xx(index)-12,py+ph+4,26,7,false,MUTED,{align:'center'}));
                else [first,first+(last-first)/2,last].forEach((date,index)=>{const label=new Date(date).toISOString().slice(0,index===2 ? 10 : 4);write(label,index===0 ? px : index===2 ? px+pw-62 : px+pw/2-20,py+ph+4,index===1 ? 40 : 62,7,false,MUTED,{align:index===0 ? 'left' : index===2 ? 'right' : 'center'});});
                sets.forEach((set,index)=>{const lx=x+6+index*(w-12)/sets.length,ly=py+ph+17;doc.save();if(index)doc.dash(index===1 ? [5,3] : [2,3]);doc.moveTo(lx,ly+4).lineTo(lx+10,ly+4).strokeColor(set.color).lineWidth(1.4).stroke().restore();const start=!curve && visual.series[index].points[0].date.slice(0,4);write(t(set.label)+(set.date ? ' · '+set.date : start>'2020' ? ' ('+start+')' : ''),lx+14,ly,(w-12)/sets.length-17,7.2);});
            };
            if(flags.charts!==false){
                const historical=(desk.historical || []).filter(visual=>!['mexico','slope'].includes(visual.historyKey)),rows=Math.ceil(historical.length/2),notes=historical.length ? t('Historia: última publicación de cada mes; mes actual parcial. Las líneas se interrumpen si faltan más de dos meses. OAS y EMBIG son primas distintas; fondeo USD/MXN en moneda original. Curva: plazos con separación uniforme.') : '',noteHeight=notes ? measure(notes,width,7)+7 : 0,curveHeight=desk.yieldCurve ? 140 : 0,available=bottom-y-businessHeight-noteHeight-5,historyHeight=rows ? Math.min(148,(available-curveHeight)/rows) : 0;
                if(rows && historyHeight<115)throw Error('El espacio disponible no permite gráficas históricas legibles en dos páginas.');
                if(desk.yieldCurve){plot(desk.yieldCurve,curveHeight,true);y+=curveHeight;}
                if(historical.length){const cw=(width-10)/2,start=y;historical.forEach((visual,index)=>plot(visual,historyHeight,false,left+index%2*(cw+10),cw,start+Math.floor(index/2)*historyHeight));y=start+rows*historyHeight;write(notes,left,y,width,7,false,MUTED);y+=noteHeight;}
                else if(desk.trend){plot(desk.trend,130,false);y+=130;}
            }
            let businessPlaced=false;
            const business=()=>{heading(t('Implicaciones para el negocio'));for(const panel of desk.business){const text=panel.heading+': '+panel.body;write(text,left,y,width,8.3);y+=measure(text,width,8.3)+5;}};
            if(desk.business.length && y+businessHeight<=bottom){business();businessPlaced=true;}
            check();
            write(t('CME FedWatch · consultar probabilidades de la próxima reunión'),left,bottom+5,width,7,false,'#668399');doc.link(left,bottom+4,width,12,'https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool');
            const additional=flags.charts===false ? [] : (desk.historical || []).filter(visual=>['mexico','slope'].includes(visual.historyKey));
            if(model.results.length || additional.length || desk.business.length && !businessPlaced){next();}
            if(additional.length){const cw=(width-10)/2,top=y;additional.forEach((visual,index)=>plot(visual,116,false,left+index*(cw+10),cw,top));y+=116;}
            const dateCodes=new Map(),getDates=item=>item.cadence==='auction' ? item.last.date : item.previous ? item.previous.date+' / '+item.last.date : item.last.date;
            for(const item of model.references.filter(item=>item.role!=='policy' && item.cadence!=='monthly')){const dates=getDates(item);if(!dateCodes.has(dates))dateCodes.set(dates,String.fromCharCode(65+dateCodes.size));}
            const rateNames={'DFII10':'TIPS real 10A','T10YIE':'Breakeven 10A','BAMLC0A0CM':'Crédito IG · OAS','BAMLH0A0HYM2':'Crédito HY · OAS','PD43667XD':'EMBIG México'};
            for(const table of model.results.filter(item=>!item.bondInternational)){
                const weights=table.columns.map((_,index)=>index===0 ? 2.7 : index===1 ? 1.9 : 1),total=weights.reduce((sum,value)=>sum+value,0),widths=weights.map(value=>value/total*width);
                doc.rect(left,y,width,16).fill(INK);write(table.title,left+6,y+3,width-12,8,true,'#ffffff');y+=19;
                const labels=table.columns.map(label=>label===t('Sesiones comparadas') ? t('Fechas') : label),headerHeight=Math.max(17,...labels.map((label,index)=>measure(label,widths[index]-6,7.2,true)+4));
                doc.rect(left,y,width,headerHeight).fill('#e8eef3');let x=left;labels.forEach((label,index)=>{write(label,x+3,y+3,widths[index]-6,7.3,true);x+=widths[index];});y+=headerHeight;
                table.rows.forEach((row,index)=>{
                    const item=model.references.find(item=>row[0]===item.label+' · '+item.currency),values=row.map((value,column)=>table.columns[column]===t('Sesiones comparadas') && item ? '['+dateCodes.get(getDates(item))+']' : value);
                    if(item && rateNames[item.id])values[0]=t(rateNames[item.id])+' · '+item.currency;
                    const h=Math.max(15.5,...values.map((cell,column)=>measure(cell,widths[column]-6,7.8)+2.5));doc.rect(left,y,width,h).fill(index%2 ? '#f3f6f9' : '#ffffff');let cx=left;
                    values.forEach((cell,column)=>{write(cell,cx+3,y+2,widths[column]-6,8,/^(?:Día|Semana)/.test(table.columns[column]),String(cell).startsWith('↑') ? '#946c64' : String(cell).startsWith('↓') ? '#657455' : INK,{align:column ? 'right' : 'left'});cx+=widths[column];});y+=h;
                });y+=5;
            }
            if(dateCodes.size){const note=[...dateCodes].map(([dates,code])=>code+': '+dates).join(' · ')+'. '+t('2020: cierre del año. Subastas: última publicación, sin cambio diario.');write(note,left,y,width,7,false,MUTED);y+=measure(note,width,7)+8;}
            if(desk.business.length && !businessPlaced)business();
            check();
            const international=desk.international;
            if(!desk.compactInternational && flags.charts!==false && international?.printVisuals.length){
                next();heading(t('Bonos internacionales · comparativas regionales'));
                const note=t('Promedios mensuales publicados desde 2020. Referencias de largo plazo en sus monedas originales; no son cierres diarios ni retornos de inversión. Cada serie conserva su inicio real.');
                write(note,left,y,width,8,false,MUTED);y+=measure(note,width,8)+12;
                const cw=(width-10)/2,top=y,h=177;
                international.printVisuals.forEach((visual,index)=>plot(visual,h,false,left+index%2*(cw+10),cw,top+Math.floor(index/2)*h));y=top+Math.ceil(international.printVisuals.length/2)*h;
                const sources='OCDE: https://www.oecd.org/en/data/indicators/long-term-interest-rates.html · BCE: https://www.ecb.europa.eu/stats/financial_markets_and_interest_rates/long_term_interest_rates/';
                write(sources,left,y,width,7,false,MUTED);y+=measure(sources,width,7)+7;check();
            }
            if(!desk.compactInternational && flags.tables!==false && international?.table){
                next();
                for(const table of availableReportTables([international.table],{t,source:helpers.localization?.source})){
                    const weights=table.columns.map((_,index)=>index===0 ? 2.2 : 1.2),total=weights.reduce((sum,value)=>sum+value,0),cols=weights.map(value=>value/total*width);
                    const tableHeader=()=>{heading(t('Bonos internacionales · rendimientos mensuales por país'));const h=Math.max(16,...table.columns.map((label,index)=>measure(label,cols[index]-6,6.9,true)+3));let x=left;doc.rect(left,y,width,h).fill('#e8eef3');table.columns.forEach((label,index)=>{write(label,x+3,y+2,cols[index]-6,6.9,true);x+=cols[index];});y+=h+1;};
                    tableHeader();
                    table.rows.forEach((row,index)=>{
                        const reference=international.references.find(item=>String(row[0]).startsWith(item.market)),cells=[reference?.market || row[0],...row.slice(1)],h=Math.max(11.5,...cells.map((cell,column)=>measure(cell,cols[column]-6,6.7)+1.2));
                        if(y+h>bottom-15){check();next();tableHeader();}
                        doc.rect(left,y,width,h).fill(index%2 ? '#f3f6f9' : '#fff');let x=left;
                        cells.forEach((cell,column)=>{write(cell,x+3,y+1.1,cols[column]-6,6.7,column===0,INK,{align:column>1 && column<cols.length-1 ? 'right' : 'left'});if(column===cols.length-1 && reference?.url?.startsWith('https://'))doc.link(x,y,cols[column],h,reference.url);x+=cols[column];});y+=h;
                    });
                }
                const note=t('Promedios mensuales, no sesiones diarias. Mes/año: diferencia absoluta frente al mes anterior o al mismo mes de hace un año. Dic. 2020 es el promedio publicado de ese mes. Fuentes enlazadas por país.');
                y+=6;write(note,left,y,width,6.8,false,MUTED);y+=measure(note,width,6.8)+4;check();
            }
            const europe=desk.compactInternational ? international : international?.europe;
            if(europe?.references.length && (flags.charts!==false || flags.tables!==false)){
                next();heading(t(desk.compactInternational ? 'Bonos internacionales · '+europe.countryCount+' países' : 'Europa · '+europe.countryCount+' países en el panorama de bonos'));
                const intro=t(desk.compactInternational ? 'Rendimientos soberanos de largo plazo en moneda original. Último mes publicado y cambio frente al mismo mes de hace un año. La historia desde 2020 y las demás comparativas permanecen completas en la página y en Excel.' : 'Historia desde 2020 y último mes publicado. Rendimientos soberanos de largo plazo en moneda original. Cobertura de la zona euro, países nórdicos, Europa central y oriental y otras monedas europeas.');
                write(intro,left,y,width,8,false,MUTED);y+=measure(intro,width,8)+10;
                if(!desk.compactInternational && flags.charts!==false && europe.printVisuals.length){
                    const cw=(width-10)/2,top=y,h=146;
                    europe.printVisuals.forEach((visual,index)=>plot(visual,h,false,left+index%2*(cw+10),cw,top+Math.floor(index/2)*h));y=top+Math.ceil(europe.printVisuals.length/2)*h+7;
                }
                if(flags.tables!==false){
                    heading(t(desk.compactInternational ? 'Países · nivel y cambio anual' : 'Todos los países europeos · nivel y cambio anual'));
                    const half=Math.ceil(europe.references.length/2),cw=(width-12)/2,top=y,cols=[.28,.14,.14,.23,.21].map(value=>value*cw),format=value=>value.toLocaleString('es-MX',{maximumFractionDigits:2});
                    let tableBottom=top;
                    for(let side=0;side<2;side++){
                        const x=left+side*(cw+12),items=europe.references.slice(side*half,(side+1)*half),hasAnnual=items.every(item=>Number.isFinite(item.periods.year?.value)),widths=hasAnnual ? cols : [.30,.14,.33,.23].map(value=>value*cw);let rowY=top,cx=x;
                        doc.rect(x,rowY,cw,22).fill('#e8eef3');
                        [t('País'),t('Moneda'),t('Nivel %'),t('Mes publicado'),...(hasAnnual ? [t('Año · pb')] : [])].forEach((label,index)=>{write(label,cx+3,rowY+3,widths[index]-6,7.2,true);cx+=widths[index];});rowY+=24;
                        items.forEach((item,index)=>{
                            const change=item.periods.year,annual=change ? (change.value>0 ? '+' : '')+format(change.value)+' pb' : '',cells=[item.market,item.currency,format(item.last.value)+(!hasAnnual && annual ? ' · '+t('Año')+': '+annual : ''),item.last.date,...(hasAnnual ? [annual] : [])],h=Math.max(15,...cells.map((cell,column)=>measure(cell,widths[column]-6,7.5)+3));
                            doc.rect(x,rowY,cw,h).fill(index%2 ? '#f3f6f9' : '#ffffff');let cellX=x;
                            cells.forEach((cell,column)=>{write(cell,cellX+3,rowY+2,widths[column]-6,7.5,column===0,INK,{align:column>1 ? 'right' : 'left'});cellX+=widths[column];});
                            if(/^https:\/\//.test(item.url))doc.link(x,rowY,cols[0],h,item.url);rowY+=h;
                        });tableBottom=Math.max(tableBottom,rowY);
                    }
                    y=tableBottom+9;
                }
                const note=t('Fuentes: OCDE y BCE; nombres de países enlazados. Promedios mensuales en % anual, no cierres diarios. Año: cambio absoluto en puntos base contra el mismo mes de hace doce meses; no es retorno. Sin interpolaciones: cada historia conserva su inicio y sus huecos.');
                write(note,left,y,width,7,false,MUTED);y+=measure(note,width,7)+5;check();
            }
            pdfExecutiveFooter(doc,page);doc.end();
        }catch(error){doc.end();reject(error);}
    });
}
module.exports={makeBondExecutivePdf};
