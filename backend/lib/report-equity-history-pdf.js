'use strict';
const {equityHistoryChart}=require('../../shared/report-equity-history-chart.mjs');
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
module.exports={equityHistoryPages,drawEquityHistoryPage};
