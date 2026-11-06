'use strict';
const path=require('node:path');
const {availableReportTables}=require('../../shared/report-available-data.mjs');
const COLORS=require('../../shared/report-chart-colors.json');
const {equityHistoryPages,drawEquityHistoryPage}=require('./report-equity-history-pdf');
const INK='#193758',MUTED='#586b78',UP='#657455',DOWN='#946c64',LINE='#d5dfe7';
const number=(value,digits=2)=>Number.isFinite(value) ? value.toLocaleString('es-MX',{maximumFractionDigits:digits}) : '—';
const percent=value=>Number.isFinite(value) ? (value>0 ? '+' : '')+number(value,Math.abs(value)<1 ? 3 : 2) : '—';

// Two executive pages, followed by a compact visual appendix containing every
// historical index. Every quoted index also keeps its original master row.
function makeEquityExecutivePdf(title,report,helpers){
    const {PDFDocument,weekly:model,pdfPageHeader,pdfExecutiveFooter,pdfPersonalization}=helpers,desk=model.equityExecutive;
    const {chartScale}=helpers.chartGeometry,{t=value=>value}=helpers.localization || {};
    return new Promise((resolve,reject)=>{
        const doc=new PDFDocument({size:'A4',margins:{top:34,bottom:40,left:34,right:34},bufferPages:true,info:{Title:title,Author:'VALLNEWS'}}),buffers=[];
        let totalPages=1;doc.on('pageAdded',()=>{totalPages++;});
        doc.on('data',chunk=>buffers.push(chunk));doc.on('error',reject);doc.on('end',()=>{const buffer=Buffer.concat(buffers);Object.defineProperty(buffer,'reportPageCount',{value:totalPages});resolve(buffer);});
        doc.registerFont('VallBody',path.join(__dirname,'../../assets/fonts/noto-jp/NotoSansJP-Regular.otf'));doc.registerFont('VallBold',path.join(__dirname,'../../assets/fonts/noto-jp/NotoSansJP-Bold.otf'));
        const left=34,width=doc.page.width-68,chartBottom=doc.page.height-76,bottom=doc.page.height-84,column=(width-12)/2;
        let y=65,page=1;const stages=[];
        doc._vallPdfDataOnly=true;doc._vallPdfPageNumber=1;doc._vallPdfPageLabel=t('Bolsa · informe ejecutivo').toUpperCase();doc._vallPdfPersonalization=pdfPersonalization(report);
        const font=(bold,text)=>/[↑↓→]/u.test(String(text)) ? bold ? 'VallBold' : 'VallBody' : bold ? 'Helvetica-Bold' : 'Helvetica';
        const printable=text=>String(text).replace(/[↑↓→]\s*/gu,'');
        const measure=(text,w,size=8,bold=false)=>doc.font(font(bold,printable(text))).fontSize(size).heightOfString(printable(text),{width:w,lineGap:1});
        const write=(text,x,top,w,size=8,bold=false,color=INK,extra={})=>doc.font(font(bold,printable(text))).fontSize(size).fillColor(color).text(printable(text),x,top,{width:w,lineGap:1,...extra});
        const heading=(text,top=y)=>{doc.rect(left,top,width,17).fill(INK);write(text,left+6,top+4,width-12,8,true,'#ffffff');return top+21;};
        const short=date=>date ? date.slice(8,10)+'/'+date.slice(5,7)+(date.slice(0,4)!==report.generatedAt.slice(0,4) ? '/'+date.slice(2,4) : '') : '—';
        const foot=()=>pdfExecutiveFooter(doc,page);
        const pageHeader=()=>{doc._vallPdfPageNumber=page;pdfPageHeader(doc,doc._vallPdfPageLabel);};
        const next=()=>{foot();doc.addPage();page++;pageHeader();y=65;};
        const tone=value=>value>0 ? UP : value<0 ? DOWN : MUTED;
        pageHeader();
        write(report.title || title,left,y,width*.62,16,true);write(report.generatedAt.slice(0,10),left+width*.65,y+3,width*.35,8,false,MUTED,{align:'right'});y+=25;
        write(desk.risk.label+' · '+t('EE. UU.'),left,y,width,9,true,desk.risk.tone==='up' ? UP : desk.risk.tone==='down' ? DOWN : INK);y+=16;
        if(desk.dashboard.length){
            const cellWidth=width/desk.dashboard.length,top=y;
            desk.dashboard.forEach((metric,index)=>{const x=left+index*cellWidth;doc.roundedRect(x,top,cellWidth-5,43,3).fillAndStroke('#f3f6f9',LINE);write(metric.label,x+5,top+4,cellWidth-15,7.2,true);write(metric.value,x+5,top+15,cellWidth-15,8.4,true);write(metric.change+' · '+short(metric.last.date),x+5,top+29,cellWidth-15,6.8,false,MUTED);doc.link(x,top,cellWidth-5,43,metric.url);});y+=49;
        }
        // Three concise messages; source attribution is part of the fact, never
        // an asserted causal link from a coincident price movement.
        for(const panel of model.summaryPanels){const text=panel.heading+': '+panel.body,h=measure(text,width-10,8.2);write('•',left,y,8,8.2);write(text,left+10,y,width-10,8.2);y+=h+5;}
        y+=3;stages.push({stage:'summary',y});
        let columns=[.25,.135,.14,.235,.12,.12].map(value=>value*width);
        let headers=['Índice','País','Cierre',desk.period==='day' ? 'Día % · USD cuando disponible' : 'Semana % · USD cuando disponible','Mes %','YTD %'];
        const header=()=>{const h=Math.max(18,...headers.map((label,index)=>measure(t(label),columns[index]-6,7.2,true)+8));doc.rect(left,y,width,h).fill('#e8eef3');let x=left;headers.forEach((label,index)=>{write(t(label),x+3,y+4,columns[index]-6,7.2,true);x+=columns[index];});y+=h;};
        const groups=report.personalization?.sections?.tables===false ? [] : desk.masterGroups,dates=new Map();
        let rows=groups.flatMap(item=>item.references.map((reference,index)=>{const change=reference.periods[desk.period],period=change ? change.baseDate+' / '+change.lastDate : reference.last.date;if(!dates.has(period))dates.set(period,String.fromCharCode(65+dates.size));return {reference,label:item.label,period,first:index===0};}));
        const originalCells=row=>{const ref=row.reference,change=ref.periods[desk.period];return [ref.label+(ref.returnBasis==='total-return' ? ' †' : '')+' ['+dates.get(row.period)+']',ref.country,number(ref.last.value),percent(change?.value)+(Number.isFinite(ref.usdPeriods?.[desk.period]?.value) ? ' · USD '+percent(ref.usdPeriods[desk.period].value) : ''),percent(ref.periods.month?.value),percent(ref.periods.ytd?.value)];};
        const baseHeaders=headers.slice(),baseWeights=columns.slice(),originalRows=rows.slice();
        rows=groups.flatMap(group=>{
            const sourceRows=originalRows.filter(row=>row.label===group.label),tables=availableReportTables([{title:group.label,columns:baseHeaders,rows:sourceRows.map(originalCells)}]);let ordinal=0;
            return tables.flatMap(table=>table.rows.map(values=>{
                const sparse=table.columns.length!==baseHeaders.length,reference=sourceRows.find(row=>originalCells(row)[0]===values[0]);
                return {...reference,label:group.label,values:sparse ? [table.columns.map((label,index)=>label+': '+values[index]).join(' · ')] : values,widths:sparse ? [width] : baseWeights,sparse,first:ordinal++===0};
            }));
        });
        const cells=row=>row.values;
        const rowHeight=row=>Math.max(11,...cells(row).map((cell,index)=>measure(cell,row.widths[index]-6,7.6)+1));
        const groupHeader=row=>{write(row.label,left,y+1,width,7.8,true);y+=measure(row.label,width,7.8,true)+2;};
        const rowDraw=(row,index)=>{const values=cells(row),h=rowHeight(row);if(row.sparse){doc.rect(left,y,width,h).fill('#f2f5f8');write(values[0],left+3,y+2,width-6,7.6);y+=h;return;}doc.rect(left,y,width,h).fill(index%2 ? '#f2f5f8' : '#ffffff');let x=left;values.forEach((value,columnIndex)=>{const ref=row.reference,numeric=baseHeaders.indexOf(headers[columnIndex])===3 ? ref.periods[desk.period]?.value : headers[columnIndex]==='Mes %' ? ref.periods.month?.value : headers[columnIndex]==='YTD %' ? ref.periods.ytd?.value : null;if(columnIndex===3 && Number.isFinite(numeric)){const ax=x+6,ay=y+h/2;doc.save().strokeColor(tone(numeric)).fillColor(tone(numeric)).lineWidth(.6);if(numeric===0)doc.moveTo(ax-2,ay).lineTo(ax+2,ay).stroke();else{const direction=numeric>0 ? -1 : 1;doc.moveTo(ax,ay-2*direction).lineTo(ax,ay+direction).stroke();doc.moveTo(ax,ay+3*direction).lineTo(ax-2,ay).lineTo(ax+2,ay).closePath().fill();}doc.restore();}write(value,x+3,y+2,columns[columnIndex]-6,7.6,columnIndex===3,columnIndex>=3 ? tone(numeric) : INK,{align:columnIndex>=2 ? 'right' : 'left'});x+=columns[columnIndex];});y+=h;};
        const isGlobalChart=desk.printCharts?.some(visual=>visual.globalComparison || visual.series?.length>6);
        const charts=desk.printCharts || [desk.developed,desk.emerging].filter(Boolean),chartReserve=charts.length && report.personalization?.sections?.charts!==false ? (isGlobalChart ? 180 : 143) : 0;
        if(rows.length){y=heading(t('Tabla maestra · todas las bolsas con datos'));const legend=[...dates].map(([period,code])=>code+': '+period.split(' / ').map(short).join(' / ')).join(' · '),text=t('Sesiones comparadas')+' · '+legend+'. '+t('† Índice de retorno total.');write(text,left,y,width,6.9,false,MUTED);y+=measure(text,width,6.9)+5;header();}
        let cursor=0;
        for(;cursor<rows.length;cursor++){
            const row=rows[cursor],needed=rowHeight(row)+(row.first ? 14 : 0);
            if(y+needed+chartReserve>chartBottom-4)break;
            if(row.first)groupHeader(row);rowDraw(row,cursor);
        }
        stages.push({stage:'page1-master',y,cursor});
        const plot=(visual,x,top,w)=>{
            const isGlobal=visual.globalComparison || visual.series.length>6;
            const h=isGlobal ? 180 : 135;doc.roundedRect(x,top,w,h,4).fillAndStroke('#ffffff',LINE);
            write(visual.title,x+6,top+5,w-12,8,true);
            const subLabel=visual.indexBaseDate+' / '+visual.indexEndDate+' · '+t(visual.returnBasis==='total-return' ? 'Base 100 · con dividendos' : 'Base 100 · precios')+(isGlobal ? ' · '+t('Escala logarítmica') : '');
            write(subLabel,x+6,top+17,w-12,6.8,false,MUTED);
            const times=visual.series.flatMap(series=>series.points.map(point=>Date.parse(point.date))),first=Math.min(...times),last=Math.max(...times);
            const values=visual.series.flatMap(series=>series.points.map(point=>point.value));
            const logScale=helpers.chartGeometry.chartLogScale(values),linearScale=chartScale(values,{ticks:5});
            const px=x+31,pw=w-40,py=top+28,ph=isGlobal ? 92 : 63;
            const xx=date=>px+(last===first ? .5 : (Date.parse(date)-first)/(last-first))*pw;
            const yy=value=>isGlobal ? py+(1-logScale.position(value))*ph : py+(linearScale.max-value)/(linearScale.max-linearScale.min)*ph;
            const ticks=isGlobal ? (logScale.ticks.length<=5 ? logScale.ticks : [logScale.ticks[0],logScale.ticks[Math.floor(logScale.ticks.length/2)],logScale.ticks.at(-1)]) : (linearScale.ticks.length<=5 ? linearScale.ticks : [linearScale.ticks[0],linearScale.ticks[Math.floor(linearScale.ticks.length/2)],linearScale.ticks.at(-1)]);
            for(const value of [...new Set(ticks)]){
                doc.moveTo(px,yy(value)).lineTo(px+pw,yy(value)).strokeColor(LINE).lineWidth(.3).stroke();
                write(number(value,0),x+1,yy(value)-3,26,6.4,false,MUTED,{align:'right'});
            }
            if(isGlobal && logScale.min<=100 && logScale.max>=100){
                doc.save().dash(2,{space:2}).moveTo(px,yy(100)).lineTo(px+pw,yy(100)).strokeColor('#9aabb8').lineWidth(.5).stroke().restore();
            }
            if(isGlobal){
                const yearDates=Array.from({length:Math.max(0,new Date(last).getUTCFullYear()-new Date(first).getUTCFullYear()+1)},(_,i)=>Date.UTC(2020+i,0,1)).filter(d=>d>=first && d<=last);
                yearDates.forEach((d)=>{
                    const xpos=xx(new Date(d).toISOString().slice(0,10));
                    doc.moveTo(xpos,py).lineTo(xpos,py+ph).strokeColor(LINE).lineWidth(.2).stroke();
                    write(String(new Date(d).getUTCFullYear()),xpos-12,py+ph+2,24,6.2,false,MUTED,{align:'center'});
                });
                const otherSeries=visual.series.slice(1);
                otherSeries.forEach((series,index)=>{
                    const color=COLORS[index%COLORS.length];
                    series.points.forEach((point,ordinal)=>{
                        if(ordinal)doc.lineTo(xx(point.date),yy(point.value));
                        else doc.moveTo(xx(point.date),yy(point.value));
                    });
                    doc.strokeColor(color).lineWidth(.6).stroke();
                });
                const spSeries=visual.series[0];
                if(spSeries && spSeries.points.length){
                    spSeries.points.forEach((point,ordinal)=>{
                        if(ordinal)doc.lineTo(xx(point.date),yy(point.value));
                        else doc.moveTo(xx(point.date),yy(point.value));
                    });
                    doc.strokeColor(INK).lineWidth(2.4).stroke();
                    const lastPoint=spSeries.points.at(-1);
                    doc.circle(xx(lastPoint.date),yy(lastPoint.value),2.6).fill(INK);
                }
                const ly=top+135,ly2=top+148,ly3=top+162;
                const spLast=spSeries?.points.at(-1)?.value;
                const spChange=spLast ? spLast-100 : 0;
                doc.moveTo(x+6,ly+4).lineTo(x+18,ly+4).strokeColor(INK).lineWidth(2.4).stroke();
                write('S&P 500 (ref. EE. UU.) · '+number(spLast,1)+' ('+(spChange>0 ? '+' : '')+number(spChange,1)+' %)',x+22,ly,172,7,true,INK);
                const keyNames=['Nasdaq 100','DAX 40','Nikkei 225','S&P/BMV IPC','Ibovespa'];
                const sampleMarkets=keyNames.map(name=>otherSeries.find(s=>s.label.includes(name))).filter(Boolean);
                sampleMarkets.slice(0,3).forEach((s,i)=>{
                    const sColor=COLORS[otherSeries.indexOf(s)%COLORS.length];
                    const sLast=s.points.at(-1)?.value;
                    const sx=x+200+i*105;
                    doc.moveTo(sx,ly+4).lineTo(sx+10,ly+4).strokeColor(sColor).lineWidth(1.4).stroke();
                    write(s.label.split(' · ')[0]+' '+number(sLast,0),sx+13,ly,90,6.6,false,MUTED);
                });
                write(t('• Universo de 40 bolsas'),x+6,ly2,185,6.6,false,MUTED);
                sampleMarkets.slice(3).forEach((s,i)=>{
                    const sColor=COLORS[otherSeries.indexOf(s)%COLORS.length];
                    const sLast=s.points.at(-1)?.value;
                    const sx=x+200+i*105;
                    doc.moveTo(sx,ly2+4).lineTo(sx+10,ly2+4).strokeColor(sColor).lineWidth(1.4).stroke();
                    write(s.label.split(' · ')[0]+' '+number(sLast,0),sx+13,ly2,90,6.6,false,MUTED);
                });
                write(visual.note || t('40 bolsas mundiales comparadas desde 2020 en escala logarítmica base 100. Detalle de todas las series en la Hoja 03.'),x+6,ly3,w-12,6.3,false,MUTED);
            } else {
                visual.series.forEach((series,index)=>{
                    const color=visual.equityBenchmark && index===0 ? '#668399' : COLORS[(index-Number(Boolean(visual.equityBenchmark))+COLORS.length)%COLORS.length];
                    series.points.forEach((point,ordinal)=>{
                        if(ordinal)doc.lineTo(xx(point.date),yy(point.value));
                        else doc.moveTo(xx(point.date),yy(point.value));
                    });
                    if(visual.equityBenchmark && index===0)doc.dash(3,{space:2});
                    doc.strokeColor(color).lineWidth(index===0 ? 1 : 1.5).stroke().undash();
                    const lastPoint=series.points.at(-1);
                    doc.circle(xx(lastPoint.date),yy(lastPoint.value),2).fill(color);
                    const lx=x+6+(index%2)*(w-12)/2,ly=top+103+Math.floor(index/2)*12;
                    doc.moveTo(lx,ly+4).lineTo(lx+11,ly+4).strokeColor(color).lineWidth(1.5).stroke();
                    write(series.label.split(' · ')[0]+(index===0 && visual.equityBenchmark ? ' · ref.' : '')+' '+number(lastPoint.value,1),lx+15,ly,(w-12)/2-17,7);
                });
                if(visual.equityBenchmark)write(t('Referencia')+': '+visual.benchmark+' · '+t('Monedas originales'),x+6,top+122,w-12,6.8,false,MUTED);
            }
        };
        if(chartReserve){const top=Math.max(y+7,chartBottom-chartReserve);charts.forEach((visual,index)=>plot(visual,left+index*(column+12),top,charts.length===1 ? width : column));y=top+(isGlobalChart ? 180 : 135);}
        const hasContext=desk.sectors.length || desk.signals.length || desk.business.length || cursor<rows.length;
        const contextEstimate=(report.personalization?.sections?.tables!==false && desk.signals.length ? 255 : 0)+(desk.heatmap && report.personalization?.sections?.charts!==false ? 75 : 0)+(desk.business.length ? 120 : 0);
        if(hasContext && (cursor<rows.length || y+contextEstimate>bottom)){next();if(cursor<rows.length){y=heading(t('Tabla maestra · continuación'));header();let previous='';for(;cursor<rows.length;cursor++){const row=rows[cursor];if(row.label!==previous){groupHeader(row);previous=row.label;}rowDraw(row,cursor);}y+=5;}}
        stages.push({stage:'page2-master',y});
        const placedBusiness=new Set();
        const miniTable=(input,x,top,w)=>{
            if(!input)return top;
            for(const table of availableReportTables([input])){
                write(table.title,x,top,w,8.5,true);top+=measure(table.title,w,8.5,true)+4;
                const base=input.fractions || [.40,.20,.20,.20],fractions=table.columns.map(column=>base[input.columns.indexOf(column)] || 1),total=fractions.reduce((sum,value)=>sum+value,0),widths=fractions.map(value=>value/total*w),labels=table.columns;
                const headerHeight=Math.max(16,...labels.map((label,index)=>measure(label,widths[index]-6,6.8,true)+7));
                doc.rect(x,top,w,headerHeight).fill('#e8eef3');let hx=x;labels.forEach((label,index)=>{write(label,hx+3,top+3,widths[index]-6,6.8,true);hx+=widths[index];});top+=headerHeight;
                table.rows.forEach((row,index)=>{const h=Math.max(11.5,...row.map((cell,i)=>measure(cell,widths[i]-6,7.2)+2));doc.rect(x,top,w,h).fill(index%2 ? '#f2f5f8' : '#ffffff');let cellX=x;row.forEach((cell,i)=>{write(cell,cellX+3,top+2,widths[i]-6,7.2,false,/^-/.test(cell) ? DOWN : /^\+/.test(cell) ? UP : INK,{align:i ? 'right' : 'left'});cellX+=widths[i];});top+=h;});top+=5;
            }return top;
        };
        if(report.personalization?.sections?.tables!==false && (desk.sectors.length || desk.signals.length)){
            y=heading(t('Rotación sectorial y materias primas'));
            const variation=t(desk.period==='week' ? 'Semana %' : 'Día %');
            const sector=desk.sectors.length ? {title:t('Sectores de EE. UU. · ETF SPDR'),columns:[t('Sector'),variation,t('Mes %'),'YTD %'],rows:desk.sectors.map(item=>[t(item.label)+' · '+item.symbol,percent(item.periods[desk.period]?.value),percent(item.periods.month?.value),percent(item.periods.ytd?.value)])} : null;
            const commoditySignalTable=(items,title)=>items.length ? {
                title: t(title),
                fractions: [.34,.18,.16,.18,.14],
                columns: [t('Referencia'),t('Último'),variation,t('2020 a fecha %'),t('Fecha')],
                rows: items.map(item=>{
                    const hist=item.periods?.since2020 || item.periods?.history;
                    return [
                        item.label+(item.unit ? ' · '+item.unit.split('/')[0] : ''),
                        number(item.last.value, item.last.value>=100 ? 1 : 2),
                        percent(item.periods[desk.period]?.value),
                        percent(hist?.value),
                        short(item.last.date)
                    ];
                })
            } : null;
            const commodities=commoditySignalTable(desk.signals.filter(item=>item.role==='commodity'),'Materias primas · futuros');
            const top=y,a=miniTable(sector,left,top,commodities ? column : width);
            const b=miniTable(commodities,sector ? left+column+12 : left,top,sector ? column : width);
            if(sector && commodities){
                const boxX=a>b ? left+column+12 : left,boxTop=Math.min(a,b)+2,limit=Math.max(a,b),panel=desk.business.at(-1);
                if(panel){
                    const headingHeight=measure(panel.heading,column-12,8.2,true),bodyHeight=measure(panel.body,column-12,8.2),h=headingHeight+bodyHeight+16;
                    if(boxTop+h<=limit){
                        doc.roundedRect(boxX,boxTop,column,h,3).fill('#f3f6f9');
                        write(panel.heading,boxX+6,boxTop+5,column-12,8.2,true);
                        write(panel.body,boxX+6,boxTop+headingHeight+9,column-12,8.2);
                        placedBusiness.add(panel);
                    }
                }
            }
            y=Math.max(a,b)+4;
            const note=t('ETF: precios sin dividendos. Futuros: precios continuos; 2020 a la fecha compara contra la primera sesión de 2020.');write(note,left,y,width,6.8,false,MUTED);y+=measure(note,width,6.8)+7;
        }
        stages.push({stage:'context',y});
        if(desk.annualComparison && report.personalization?.sections?.charts!==false){
            const annual=desk.annualComparison,wLabel=width*.26,cw=(width-wLabel)/annual.years.length;
            write(t('Comparativa de años · 2020 a la fecha'),left,y,width,8.5,true);y+=13;
            write(t('Mismo tramo acumulado de cada año hasta')+' '+short(annual.cutoff)+' · '+t('Variación acumulada · %'),left,y,width,6.8,false,MUTED);y+=12;
            annual.years.forEach((year,index)=>{const x=left+wLabel+index*cw;doc.rect(x,y,cw-2,13).fill(year===annual.currentYear ? '#dce6ee' : '#eef2f6');write(year,x+2,y+2,cw-6,7,true,INK,{align:'center'});});y+=15;
            for(const row of annual.printRows){if(row.cells.some(cell=>!Number.isFinite(cell.value))){const facts=row.cells.filter(cell=>Number.isFinite(cell.value)).map(cell=>cell.year+': '+percent(cell.value)+' %').join(' · ');if(facts){write(row.label+': '+facts,left,y,width,7.2);y+=measure(row.label+': '+facts,width,7.2)+4;}continue;}write(row.label+(row.returnBasis==='total-return' ? ' †' : ''),left,y,wLabel-5,7.2);row.cells.forEach((cell,index)=>{const x=left+wLabel+index*cw;doc.rect(x,y,cw-2,14).fill(cell.value===null ? '#eef2f6' : cell.value>=0 ? '#e6ecdf' : '#efe4e1');if(cell.year===annual.currentYear)doc.rect(x,y,cw-2,12).lineWidth(.5).strokeColor('#668399').stroke();write(cell.value===null ? '—' : percent(cell.value)+' %',x+2,y+2,cw-6,6.8,cell.year===annual.currentYear,cell.value===null ? MUTED : tone(cell.value),{align:'center'});});y+=12.5;}
            const note=t('† Con dividendos. Monedas originales; cada fila conserva su índice. Bases y fechas completas en anexos.');write(note,left,y,width,6.7,false,MUTED);y+=measure(note,width,6.7)+5;
        }else if(!isGlobalChart && desk.heatmap && report.personalization?.sections?.charts!==false){
            write(t('Diferencias frente al S&P 500 · mismo periodo'),left,y,width,8.5,true);y+=14;
            const items=desk.heatmap.bars,cw=width/items.length;
            items.forEach((item,index)=>{const x=left+index*cw;doc.roundedRect(x,y,cw-4,32,3).fill(item.value>0 ? '#e6ecdf' : item.value<0 ? '#efe4e1' : '#edf1f5');write(item.label,x+4,y+4,cw-12,6.8,true);write(percent(item.value)+' p. p.',x+4,y+18,cw-12,7.2,true,tone(item.value));});y+=37;
            write(t('Tres mayores y tres menores diferencias relativas; sólo fechas idénticas. Positivo no implica que el índice haya subido.'),left,y,width,6.8,false,MUTED);y+=measure(t('Tres mayores y tres menores diferencias relativas; sólo fechas idénticas. Positivo no implica que el índice haya subido.'),width,6.8)+6;
        }
        stages.push({stage:'heatmap',y});
        const remainingBusiness=desk.business.filter(panel=>!placedBusiness.has(panel));
        if(remainingBusiness.length){y=heading(t('Implicaciones para el negocio'));const w=(width-16*(remainingBusiness.length-1))/remainingBusiness.length,stacked=remainingBusiness.reduce((sum,panel)=>sum+measure(panel.heading+': '+panel.body,width,8.2)+5,0),columnsHeight=Math.max(...remainingBusiness.map(panel=>13+measure(panel.body,w,8.2)))+5;
            if(stacked<=columnsHeight)for(const panel of remainingBusiness){const text=panel.heading+': '+panel.body;write(text,left,y,width,8.2);y+=measure(text,width,8.2)+5;}
            else{const top=y;let end=top;remainingBusiness.forEach((panel,index)=>{const x=left+index*(w+16);write(panel.heading,x,top,w,8.2,true);write(panel.body,x,top+13,w,8.2);end=Math.max(end,top+13+measure(panel.body,w,8.2));});y=end+5;}}
        if(y>bottom+2 || totalPages>2){doc.end();const error=Error('El informe de Bolsa requiere ajustar la composición para conservar dos páginas legibles.');error.layout={y,bottom,pages:totalPages,indices:rows.length,stages};reject(error);return;}
        write(t('USD: se convierte el índice, sin añadir dividendos ni costos. Fuentes enlazadas en el tablero; respaldo en anexos y Excel.'),left,bottom+5,width,6.8,false,MUTED);
        if(report.personalization?.sections?.charts!==false)for(const [index,series] of equityHistoryPages(desk.globalHistory).entries()){
            doc._vallPdfPageLabel=t('Bolsa · evolución histórica').toUpperCase();next();
            y=heading(t('Evolución de todas las bolsas · 2020 a la fecha')+(index ? ' · '+(index+1) : ''));
            const scope=t('Base 100 en la primera observación real de cada índice. Monedas originales; † incluye dividendos. Las historias parciales comienzan en su fecha real; no es un ranking homogéneo.');
            write(scope,left,y,width,7.5,false,MUTED);y+=measure(scope,width,7.5)+7;
            y=drawEquityHistoryPage(doc,series,{left,top:y,width,bottom,write,t});
            if(y>bottom+2){doc.end();reject(Error('El anexo de evolución histórica excedió el espacio disponible.'));return;}
        }
        foot();doc.end();
    });
}
module.exports={makeEquityExecutivePdf};
