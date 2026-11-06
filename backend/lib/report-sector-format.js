'use strict';
const formats=require('../../shared/report-sector-formats.json');
const {enrichReportObservations,indexedVisual}=require('./report-observations');
const {normalizeEquityEvidence}=require('./report-equity-quality');
const {reportPresentation}=require('./report-presentation');
const {withDailyEvidence}=require('./report-daily-evidence');
function equityRegionalVisuals(report,collection) {
    if(report?.userEdition || (report?.baseReport?.key || report?.key)!=='equities' || (report?.baseReport?.collection || collection || report?.collection || 'finance')!=='finance') return report;
    const quotes=report.sourceSnapshot?.equities;
    if(!Array.isArray(quotes)) return report;
    const visuals=[...(report.visuals || [])];
    let added=false;
    for(const region of ['América','Europa','Asia']) {
        const title='Bolsa de '+region+' · evolución relativa';
        if(visuals.some(visual=>visual.title===title) || visuals.length>=6) continue;
        const visual=indexedVisual(title,quotes.filter(item=>item.region===region && item.symbol!=='^VIX' && item.value>0).map(item=>({...item,series:(item.series || item.recentSeries || []).filter(point=>point.value>0)})), 'Comparación de índices de la misma región con cierres observados.',report.generatedAt || new Date());
        if(visual) {visuals.push(visual);added=true;}
    }
    // Recalcular sólo el respaldo derivado cuando un corte anterior recibe
    // nuevas gráficas. Las ediciones del usuario no se modifican.
    return added ? {...report,visuals,sections:(report.sections || []).filter(section=>section.heading!=='Lectura cuantitativa del periodo mostrado'),tables:(report.tables || []).filter(table=>table.title!=='Comparaciones calculadas de las gráficas')} : report;
}
function sectorFormat(report,collection) {
    const origin=report?.baseReport;
    const area=origin?.collection || collection || report?.collection;
    const key=origin?.key || report?.key;
    if(formats[area]?.[key]) return {collection:area,key,...formats[area][key]};
    // An overview needs its collection; a title is never used as authority.
    if(area) return null;
    const matches=Object.entries(formats).filter(([,items])=>items[key]);
    return matches.length===1 ? {collection:matches[0][0],key,...matches[0][1][key]} : null;
}
function enrichSectorReport(report,collection) {
    if(require('../../shared/report-panorama.mjs').isPanorama(report) || require('../../shared/report-financial-news.mjs').isFinancialNews(report) || require('../../shared/report-market-news.mjs').isMarketNews(report))return report;
    report=withDailyEvidence(report);
    if(['grains','proteins'].includes(report.baseReport?.key || report.key))return {...report,collection:report.collection || collection};
    report=reportPresentation(report);
    report=normalizeEquityEvidence(report.collection ? report : {...report,collection});
    report=enrichReportObservations(equityRegionalVisuals(report,collection));
    const format=sectorFormat(report,collection);
    if(!format) return report;
    const heading='Información complementaria para '+format.label.toLowerCase();
    if(report.sections?.some(section=>section.heading===heading)) return report;
    const section={heading,text:format.topics.map(topic=>topic.heading+': '+topic.question+'\nInformación a contrastar o solicitar: '+topic.inputs+'.').join('\n\n')};
    const table={kind:'guide',title:'Guía sectorial de validación',note:'Campos a contrastar con las fuentes del corte y los datos de la empresa. Esta guía no acredita que todas las variables estén disponibles ni contiene cotizaciones adicionales.',columns:['Frente','Pregunta de decisión','Información necesaria'],rows:format.topics.map(topic=>[topic.heading,topic.question,topic.inputs])};
    return {...report,collection:format.collection,sections:[...(report.sections || []),section],tables:(report.tables || []).length<6 ? [...(report.tables || []),table] : report.tables};
}
module.exports={sectorFormat,enrichSectorReport};
