'use strict';
// Cálculos reproducibles sobre observaciones publicadas, sin interpolación ni pronósticos.
const number=value=>typeof value==='number' && Number.isFinite(value);
const {reportNumber:format}=require('./report-number-format');
function datedPoints(points) {
    const byTime=new Map(),conflicts=new Set();
    for(const point of points || []) {
        const timestamp=Date.parse(point?.date);
        if(!number(point?.value) || !Number.isFinite(timestamp)) continue;
        if(/^\d{4}-\d{2}-\d{2}$/.test(point.date) && new Date(timestamp).toISOString().slice(0,10)!==point.date) continue;
        if(byTime.has(timestamp) && byTime.get(timestamp).value!==point.value) conflicts.add(timestamp);
        byTime.set(timestamp,{...point,timestamp});
    }
    return [...byTime.values()].filter(point=>!conflicts.has(point.timestamp)).sort((a,b)=>a.timestamp-b.timestamp);
}
function dailyPoints(points,cutoff=new Date()) {
    const end=new Date(cutoff).getTime(),byDate=new Map(),conflicts=new Set();
    if(!Number.isFinite(end)) return [];
    for(const point of points || []) {
        const date=point?.date,value=point?.value;
        if(!number(value) || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) continue;
        const stamp=Date.parse(date);
        if(!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0,10)!==date || stamp>end) continue;
        if(byDate.has(date) && byDate.get(date)!==value) conflicts.add(date);
        byDate.set(date,value);
    }
    return [...byDate].filter(([date])=>!conflicts.has(date)).sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({date,value}));
}
function periodChange(points,sessions,current) {
    if(!Number.isInteger(sessions) || sessions<1 || points.length<=sessions || !number(current)) return null;
    const base=points[points.length-1-sessions]?.value;
    return number(base) && base>0 ? (current-base)/base*100 : null;
}
function quotePoints(closes,timestamps,cutoff=new Date(),{positive=false,timeZone='UTC',regularPeriod,closedOnly=false}={}) {
    const end=new Date(cutoff).getTime();if(!number(end))return [];let dateFormat;try{dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});}catch{return [];}
    const periodStart=regularPeriod?.start*1000,periodEnd=regularPeriod?.end*1000;
    return dailyPoints((closes || []).flatMap((value,index)=>{
        const timestamp=timestamps?.[index];
        if(!number(value) || positive && value<=0 || !number(timestamp) || timestamp*1000>end) return [];
        if(number(periodStart) && number(periodEnd) && periodEnd>end && timestamp*1000>=periodStart && timestamp*1000<periodEnd)return [];
        const date=new Date(timestamp*1000);
        if(!Number.isFinite(date.getTime()))return [];
        const label=dateFormat.format(date);
        if(closedOnly && (!number(periodStart) || !number(periodEnd)) && label===dateFormat.format(new Date(end)))return [];
        if(number(periodStart) && number(periodEnd) && periodStart>end && label===dateFormat.format(new Date(end))){const clock=new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});if(clock.format(new Date(end))<clock.format(new Date(periodEnd)))return [];}
        return [{date:label,value}];
    }),cutoff);
}
function samplePoints(points,limit=42) {
    if(points.length<=limit) return points;
    return Array.from({length:limit},(_,index)=>points[Math.round(index*(points.length-1)/(limit-1))]);
}
function indexedVisual(title,items,note='',cutoff=new Date()) {
    const candidates=items.map(item=>({label:item.label,points:dailyPoints(item.series,cutoff)})).filter(item=>item.points.length>1);
    if(!candidates.length) return null;
    const common=candidates[0].points.map(point=>point.date).filter(date=>candidates.every(item=>item.points.some(point=>point.date===date && point.value>0)));
    if(common.length<2) return null;
    const first=common[0],last=common.at(-1);
    const series=candidates.map(item=>{
        const base=item.points.find(point=>point.date===first).value;
        return {label:item.label,points:samplePoints(item.points.filter(point=>point.date>=first && point.date<=last).map(point=>({date:point.date,value:Number((point.value/base*100).toFixed(8))})).filter(point=>number(point.value)))};
    });
    return {type:'line',title,unit:'Índice base 100',series,note:`${note} Base común: cierre del ${first}; ventana hasta ${last}. Se muestran hasta 42 observaciones por serie, conservando extremos; no se interpolan fechas sin dato. El índice compara cambios relativos, no niveles de precio ni márgenes.`.trim()};
}
function seriesObservation(visual,series,cutoff) {
    const points=dailyPoints(series.points,cutoff);
    if(points.length<2) return null;
    const first=points[0],last=points.at(-1),minimum=Math.min(...points.map(point=>point.value)),maximum=Math.max(...points.map(point=>point.value));
    const delta=last.value-first.value;
    const change=visual.unit==='%' ? `${format(delta)} p. p. (${format(delta*100)} pb)` : first.value>0 ? `${format(delta/first.value*100)} %` : 'Porcentaje no calculable con base no positiva';
    return {label:series.label,first,last,count:points.length,minimum,maximum,change};
}
const ANALYSIS_HEADING='Lectura cuantitativa del periodo mostrado';
const ANALYSIS_TABLE='Comparaciones calculadas de las gráficas';
const OBSERVATION_READING='Las comparaciones de todas las series se detallan en la tabla '+ANALYSIS_TABLE+'. El inicio, el cierre, el rango y el cambio corresponden a los puntos mostrados de cada gráfica, con sus fechas y unidades. Contrasta el movimiento de la última sesión con la trayectoria del periodo y con la exposición real del destinatario antes de plantear una decisión.';
function enrichReportObservations(report) {
    if(report.userEdition || report.sections?.some(section=>section.heading===ANALYSIS_HEADING)) return report;
    const rows=[],paragraphs=[];
    for(const visual of report.visuals || []) {
        if(visual.type!=='line') continue;
        const observations=(visual.series || []).map(series=>seriesObservation(visual,series,report.generatedAt || new Date())).filter(Boolean);
        if(!observations.length) continue;
        rows.push(...observations.map(item=>[`${item.label} · ${visual.title}`,`${item.first.date} a ${item.last.date} · ${item.count} datos`,`${format(item.first.value)} / ${format(item.last.value)}`,item.change,`${format(item.minimum)} / ${format(item.maximum)}`,visual.unit || 'Unidad no declarada']));
        paragraphs.push(visual.title+': '+observations.map(item=>`${item.label} pasa de ${format(item.first.value)} a ${format(item.last.value)} ${visual.unit || '(sin unidad declarada)'} entre ${item.first.date} y ${item.last.date}; cambio del tramo: ${item.change}.`).join(' '));
    }
    if(!rows.length || (report.sections || []).length>=20) return report;
    const note='Cálculos de VALLNews sobre los puntos mostrados, con extremos y fechas de cada serie. Las gráficas pueden estar muestreadas: el rango corresponde a esos puntos, no al máximo o mínimo de toda la historia diaria. Un cambio del tramo no equivale a una variación de sesión ni a un pronóstico. En rendimientos, p. p. significa puntos porcentuales y pb puntos base.';
    const tables=report.tables || [];
    // La evidencia del corte conserva prioridad sobre una guía de campos pendientes.
    const guide=tables.filter(table=>table.kind==='guide'),evidence=tables.filter(table=>table.kind!=='guide');
    const table={title:ANALYSIS_TABLE,note,columns:['Serie / gráfica','Periodo / observaciones','Inicio / cierre','Cambio del tramo','Mínimo / máximo mostrado','Unidad'],rows:rows.slice(0,100)};
    let text=paragraphs.join('\n\n');
    if(text.length>7200 || report.key==='equities') text=OBSERVATION_READING;
    return {...report,sections:[...(report.sections || []),{heading:ANALYSIS_HEADING,text:text+'\n\n'+note}],tables:evidence.length<6 ? [...evidence,table,...guide].slice(0,6) : tables};
}
module.exports={dailyPoints,datedPoints,quotePoints,periodChange,samplePoints,indexedVisual,seriesObservation,enrichReportObservations,OBSERVATION_READING};
