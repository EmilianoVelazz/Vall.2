'use strict';
const config=require('../../shared/report-fx.json');
const {dailyPoints}=require('./report-observations');
const {reportNumber}=require('./report-number-format');
const {loadOfficialFxHistories}=require('./report-official-fx');
const positive=value=>typeof value==='number' && Number.isFinite(value) && value>0;
function isFxReport(report) {
    const key=report?.baseReport?.key || report?.key,collection=report?.baseReport?.collection || report?.collection;
    return key==='fx' && (!collection || collection==='finance');
}
function reportVisualLimit(report){
    if(report?.periodType==='annual')return 12;
    if(isFxReport(report))return config.maximumVisuals;
    const area=report?.baseReport?.collection || report?.collection,key=report?.baseReport?.key || report?.key;
    return ['grains','energy_metals','proteins'].includes(key) && (!area || area==='markets') ? 64 : 6;
}

async function loadFxHistories(load,{concurrency=3}={}) {
    let cursor=0;const results=new Array(config.currencies.length);
    await Promise.all(Array.from({length:Math.max(1,Math.min(3,concurrency))},async()=>{
        while(cursor<config.currencies.length) {
            const index=cursor++,currency=config.currencies[index];
            try {results[index]=await load(currency);} catch {results[index]=null;}
        }
    }));
    return results.filter(Boolean);
}

async function loadDiverseFxHistories(load,{cutoff=new Date().toISOString(),officialLoader=loadOfficialFxHistories,...options}={}) {
    const official=await officialLoader({...options,cutoff}).catch(()=>[]);
    return loadFxHistories(async currency=>{
        const history=official.find(item=>item.quoteCurrency===currency.code),latest=history?.series?.at(-1);
        if(latest && Date.parse(cutoff)-Date.parse(latest.date)<=7*86400000)return history;
        try{return await load(currency);}catch(error){if(history)return history;throw error;}
    },options);
}

function buildFxReportData({rates=[],histories=[],previous,generatedAt=new Date().toISOString()}={}) {
    const cutoff=Date.parse(generatedAt),quotes=[],keptHistories=[],visuals=[];
    const previousHistories=previous?.sourceSnapshot?.fxHistories || [];
    for(const currency of config.currencies) {
        const {code,name,symbol}=currency,label='USD/'+code;
        const history=[...histories,...previousHistories].find(item=>item?.symbol===symbol && item?.quoteCurrency===code && item?.baseCurrency==='USD' && dailyPoints(item.series,generatedAt).some(point=>positive(point.value)));
        const points=history ? dailyPoints(history.series,generatedAt).filter(point=>positive(point.value)) : [];
        const recent=points.slice(-config.historyObservations),last=points.at(-1),prior=points.at(-2);
        const reference=[...rates,...(previous?.sourceSnapshot?.fx || [])].find(item=>{
            const time=Date.parse(item?.updatedAt);
            return item?.code===code && item?.label===label && positive(item?.value) && Number.isFinite(time) && time<=cutoff;
        });
        const quote={code,name,label,value:last?.value ?? reference?.value ?? null,previous:prior?.value ?? null,updatedAt:last?.date || reference?.updatedAt || null,source:last ? history.source || 'Yahoo Finance' : reference?.source || '',url:last ? history.url || '' : reference?.url || '',provider:history?.provider || '',basis:history?.basis || '',unit:code+' por 1 USD'};
        quotes.push(quote);
        if(history && recent.length) keptHistories.push({...history,label,code,name,series:points,recentSeries:recent,value:last.value,previous:prior?.value ?? null});
        if(recent.length>=2) visuals.push({type:'line',title:label+' · '+name,unit:quote.unit,series:[{label,points:recent}],note:''});
        else if(positive(quote.value)) visuals.push({type:'bar',title:label+' · '+name,unit:quote.unit,bars:[{label:quote.updatedAt,value:quote.value}],note:''});
    }
    const metrics=quotes.map(quote=>({label:quote.label+' · '+quote.name,value:positive(quote.value) ? reportNumber(quote.value)+' '+quote.code : 'Sin dato',change:quote.updatedAt || '',tone:'flat'}));
    const table={title:'Cotizaciones por 1 USD',columns:['Moneda','Par','Unidades por 1 USD','Fecha del dato','Fuente'],rows:quotes.map(quote=>[quote.name,quote.label,positive(quote.value) ? reportNumber(quote.value)+' '+quote.code : 'Sin dato',quote.updatedAt || 'Sin dato',quote.source || 'Sin dato']),note:''};
    return {fxSchemaVersion:config.schemaVersion,metrics,visuals,tables:[table],sourceSnapshot:{baseCurrency:'USD',fx:quotes,fxHistories:keptHistories,fxHistory:keptHistories.find(item=>item.code==='MXN') || null},sources:[...new Set(quotes.map(quote=>quote.source).filter(Boolean))],sourceLinks:[...new Map(keptHistories.filter(item=>item.url).map(item=>[item.url,{label:item.source || item.label,url:item.url}])).values()]};
}
function exportFxHistory(report){
    if(!isFxReport(report) || report.periodType==='annual' || report.userEdition || !report.sourceSnapshot?.fxHistories?.length)return undefined;
    const {validMarketPoints}=require('../../shared/report-market-analysis.mjs');
    return config.currencies.flatMap(definition=>{
        const item=report.sourceSnapshot.fxHistories.find(value=>value.baseCurrency==='USD' && value.quoteCurrency===definition.code);
        if(!item)return [];
        const points=validMarketPoints(item.series || item.points || [],report.generatedAt).filter(point=>point.value>0).slice(-3000);
        let url='';try{const link=new URL(item.url);if(['http:','https:'].includes(link.protocol) && !link.username && !link.password)url=link.href.slice(0,1800);}catch { /* A missing source URL is not a reason to invent one. */ }
        return points.length ? [{label:'USD/'+definition.code,unit:definition.code+' por 1 USD',source:String(item.source || '').slice(0,240),url,market:String(item.market || definition.market || '').slice(0,100),basis:String(item.basis || '').slice(0,400),cadence:'daily',points}] : [];
    });
}
module.exports={config,isFxReport,reportVisualLimit,loadFxHistories,loadDiverseFxHistories,buildFxReportData,exportFxHistory};
