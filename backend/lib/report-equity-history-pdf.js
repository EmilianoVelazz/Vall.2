'use strict';
const {equityHistoryChart}=require('../../shared/report-equity-history-chart.mjs');
const {equityCountry,equityRegionMatches,equityRegionalGroups,equityRegionalLabel}=require('../../shared/report-equity-regions.mjs');
const INK='#193758',MUTED='#586b78',GRID='#dce4ea';
function equityHistoryPages(visual){const chart=equityHistoryChart(visual);return chart ? [chart.series] : [];}
function drawEquityHistoryPage(doc,series,{left,top,width,bottom,write,t=value=>value}){
    const chart=equityHistoryChart({series});if(!chart)return top;
    const columns=series.length>66 ? 4 : 3,rows=Math.ceil(series.length/columns),rowHeight=19,legendHeight=rows*rowHeight,plotHeight=Math.min(355,bottom-top-legendHeight-55),px=left+32,pw=width-40,py=top+5;
    if(plotHeight<120)throw Error('La gráfica comparativa necesita espacio adicional para conservar su legibilidad.');
    const xx=date=>px+chart.x(date)*pw,yy=value=>py+chart.y(value)*plotHeight;
    doc.rect(px,py,pw,plotHeight).fill('#f7f9fb');
    for(const value of chart.scale.ticks){doc.moveTo(px,yy(value)).lineTo(px+pw,yy(value)).strokeColor(GRID).lineWidth(.4).stroke();write(value.toLocaleString('es-MX',{maximumFractionDigits:2}),left,yy(value)-3,27,7,false,MUTED,{align:'right'});}
    doc.save().dash(2,{space:2}).moveTo(px,yy(100)).lineTo(px+pw,yy(100)).strokeColor('#9aabb8').lineWidth(.8).stroke().restore();
    for(const tick of chart.years){const x=px+(tick.time-chart.first)/(chart.last-chart.first || 1)*pw;doc.moveTo(x,py).lineTo(x,py+plotHeight).strokeColor(GRID).lineWidth(.25).stroke();write(tick.label,x-12,py+plotHeight+6,26,7,false,MUTED,{align:tick.time===chart.first ? 'left' : 'center'});}
    for(const item of chart.series){doc.save();if(item.dash)doc.dash(item.dash.split(' ').map(Number));item.points.forEach((point,index)=>{if(index)doc.lineTo(xx(point.date),yy(point.value));else doc.moveTo(xx(point.date),yy(point.value));});doc.strokeColor(item.color).lineWidth(.8).stroke().undash();const last=item.points.at(-1);doc.circle(xx(last.date),yy(last.value),1).fill(item.color);doc.restore();}
    const legendTop=py+plotHeight+25,cw=width/columns;
    for(const [index,item] of chart.series.entries()){
        const x=left+(index%columns)*cw,y=legendTop+Math.floor(index/columns)*rowHeight,last=item.points.at(-1),change=last.value-100,percent=(change>0 ? '+' : '')+change.toLocaleString('es-MX',{maximumFractionDigits:1})+' %';
        doc.save();if(item.dash)doc.dash(item.dash.split(' ').map(Number));doc.moveTo(x+1,y+4).lineTo(x+14,y+4).strokeColor(item.color).lineWidth(1.2).stroke().restore();
        const label=item.ordinal+'. '+item.label+(item.returnBasis==='total-return' ? ' †' : '');
        doc.save();doc.font('Helvetica-Bold').fontSize(7.1);
        const percentWidth=doc.widthOfString(percent)+2,labelWidth=Math.min(doc.widthOfString(label)+1,cw-18-percentWidth-11);
        doc.restore();
        write(label,x+18,y,labelWidth,7.1,true,INK,{height:9,ellipsis:true});
        write(percent,x+18+labelWidth+5,y,percentWidth,7.1,true,change>0 ? '#657455' : change<0 ? '#946c64' : MUTED,{align:'left',height:9,lineBreak:false});
        write(item.points[0].date+' / '+last.date,x+18,y+9,cw-22,6.6,false,MUTED,{height:8,lineBreak:false});
    }
    const end=legendTop+legendHeight+3;
    write(t('Escala logarítmica común · Base 100 por serie. El porcentaje de la leyenda es el cambio desde su fecha base, no una variación diaria.'),left,end,width,7,false,MUTED);
    return end+17;
}
function drawRegionalEquityHistory(doc,visual,{left,top,width,bottom,write,t=value=>value}){
    const all=equityHistoryChart(visual);if(!all)return top;
    const groups=equityRegionalGroups(all.series);
    const scope=t('Base 100 por índice; escala logarítmica propia de cada panel. Colores y números corresponden a la gráfica global. Las fechas base y metodologías permanecen en su leyenda.');
    doc.roundedRect(left,top,width,22,3).fill('#edf3f8');write(scope,left+5,top+3,width-10,7,false,MUTED);top+=25;
    const gap=14,cw=(width-gap)/2,rows=Math.ceil(groups.length/2),height=(bottom-top)/rows;
    groups.forEach((group,index)=>{
        const america=group.label==='América',columns=america && group.series.length<=10 ? 1 : 2;
        const x=left+(index%2)*(cw+gap),y=top+Math.floor(index/2)*height,chart=equityHistoryChart({series:group.series}),legendRows=Math.ceil(group.series.length/columns),ph=height-62-legendRows*12,px=x+29,py=y+27,pw=cw-37;
        if(ph<85)throw Error('La comparativa regional necesita más espacio para conservar las referencias.');
        doc.roundedRect(x,y,cw,height-7,3).fillAndStroke('#f8fafb',GRID);
        const label=america && group.series.some(item=>equityRegionMatches(item,'Latinoamérica')) ? 'América · México y Latinoamérica' : group.label;
        write(t(label)+' · '+group.series.length,x+6,y+6,cw-12,9,true,INK);
        const xx=date=>px+all.x(date)*pw,yy=value=>py+chart.y(value)*ph;
        for(const tick of chart.scale.ticks){doc.moveTo(px,yy(tick)).lineTo(px+pw,yy(tick)).strokeColor(GRID).lineWidth(.35).stroke();write(tick.toLocaleString('es-MX',{maximumFractionDigits:0}),x+1,yy(tick)-3,24,6.8,false,MUTED,{align:'right'});}
        for(const item of group.series){doc.save();if(item.dash)doc.dash(item.dash.split(' ').map(Number));item.points.forEach((point,i)=>{if(i)doc.lineTo(xx(point.date),yy(point.value));else doc.moveTo(xx(point.date),yy(point.value));});doc.strokeColor(item.color).lineWidth(.9).stroke().restore();}
        const dates=[new Date(all.first).toISOString().slice(0,4),new Date(all.last).toISOString().slice(0,10)];
        write(dates[0],px,py+ph+5,pw/2,7,false,MUTED);write(dates[1],px+pw/2,py+ph+5,pw/2,7,false,MUTED,{align:'right'});
        group.series.forEach((item,i)=>{const lx=x+6+(i%columns)*(cw-12)/columns,ly=py+ph+22+Math.floor(i/columns)*12;doc.save();if(item.dash)doc.dash(item.dash.split(' ').map(Number));doc.moveTo(lx,ly+4).lineTo(lx+10,ly+4).strokeColor(item.color).lineWidth(1.2).stroke().restore();write(item.ordinal+'. '+(america ? equityRegionalLabel(item,{t}) : item.label)+(item.returnBasis==='total-return' ? ' †' : ''),lx+14,ly,(cw-12)/columns-17,6.9,america && equityCountry(item)==='México',INK,{height:10,ellipsis:true});});
    });
    return top+rows*height;
}
module.exports={equityHistoryPages,drawEquityHistoryPage,drawRegionalEquityHistory};
