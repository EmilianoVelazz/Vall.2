'use strict';
const config=require('../../shared/report-bond-markets.json');
const {externalGet}=require('./http');
const {dailyPoints}=require('./report-observations');
const {reportDeadline}=require('./report-deadline');
const {loadGlobalBondMarkets}=require('./report-bond-global');
const {loadBondContext}=require('./report-bond-context');
const {compactBondPoints}=require('../../shared/report-bond-evidence.mjs');
const finite=value=>typeof value==='number' && Number.isFinite(value);
function parseTreasuryXml(xml,cutoff) {
    if(typeof xml!=='string' || xml.length>3*1024*1024) throw Error('Respuesta Treasury inválida.');
    const entries=[...xml.matchAll(/<(?:\w+:)?entry\b[^>]*>([\s\S]*?)<\/(?:\w+:)?entry>/g)].map(match=>match[1]);
    const field=(entry,key)=>entry.match(new RegExp('<(?:\\w+:)?'+key+'\\b[^>]*>([^<]+)<\\/(?:\\w+:)?'+key+'>'))?.[1];
    return config.markets.filter(item=>item.field).map(item=>({...item,series:dailyPoints(entries.flatMap(entry=>{
        const date=field(entry,'NEW_DATE')?.slice(0,10),raw=field(entry,item.field)?.trim();
        return /^-?\d+(?:\.\d+)?$/.test(raw || '') ? [{date,value:Number(raw)}] : [];
    }),cutoff)}));
}
function parseBanxicoSeries(payload,cutoff) {
    return config.markets.filter(item=>item.seriesId).map(item=>{
        const series=payload?.bmx?.series?.find(series=>series.idSerie===item.seriesId);
        // Reject a mismatched instrument rather than displaying a policy rate.
        const days=item.maturity.slice(0,-1),title=String(series?.titulo || '');
        const matches=/cetes/i.test(title) && new RegExp('\\b'+days+'\\b').test(title) && /rendimiento/i.test(title);
        return {...item,series:dailyPoints(matches ? (series.datos || []).flatMap(point=>{
            const parts=String(point.fecha || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/),raw=String(point.dato || '').trim();
            return parts && /^-?\d+(?:\.\d+)?$/.test(raw) ? [{date:parts[3]+'-'+parts[2]+'-'+parts[1],value:Number(raw)}] : [];
        }) : [],cutoff)};
    });
}
async function loadBondMarkets({get=externalGet,cutoff=new Date().toISOString(),previous=[],token=process.env.BANXICO_TOKEN,loadYahoo,timeoutMs=10000,includeContext=true}={}) {
    const date=new Date(cutoff);if(!Number.isFinite(date.getTime())) throw Error('Corte de bonos inválido.');
    if(date.getUTCFullYear()<2020 || date.getUTCFullYear()>new Date().getUTCFullYear())throw Error('El corte histórico de bonos debe estar entre 2020 y el año actual.');
    const year=date.getUTCFullYear(),years=Array.from({length:Math.max(0,year-2019)},(_,index)=>2020+index);
    const headers={Accept:'application/xml','User-Agent':'VALLNews/1.0'};
    const [treasury,mexico,global,context]=await Promise.all([
        Promise.all(years.map(async year=>{
            try {return await reportDeadline(async()=>{const response=await get('https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value='+year,headers,timeoutMs);if(!response.ok) throw Error('Treasury no disponible');return parseTreasuryXml(await response.text(),cutoff);},timeoutMs);} catch {return [];}
        })).then(files=>config.markets.filter(item=>item.field).map(item=>({...item,series:dailyPoints(files.flat().filter(quote=>quote.id===item.id).flatMap(quote=>quote.series),cutoff)}))),
        (async()=>{
            if(!token) return [];
            try {return await reportDeadline(async()=>{
                const start='2020-01-01',end=cutoff.slice(0,10),ids=config.markets.filter(item=>item.seriesId).map(item=>item.seriesId).join(',');
                const response=await get(`https://www.banxico.org.mx/SieAPIRest/service/v1/series/${ids}/datos/${start}/${end}`,{'Bmx-Token':token,Accept:'application/json'},timeoutMs);
                if(!response.ok) throw Error('Banxico no disponible');return parseBanxicoSeries(await response.json(),cutoff);
            },timeoutMs);} catch {return [];}
        })(),
        loadGlobalBondMarkets({get,cutoff,previous,timeoutMs}),
        includeContext ? loadBondContext({get,cutoff,previous,token,timeoutMs:Math.min(timeoutMs,8500)}) : [],
    ]);
    const fallback=loadYahoo && !treasury.some(item=>item.series.length) ? await Promise.all(config.markets.filter(item=>item.symbol).map(async item=>{
        try {return {...await reportDeadline(()=>loadYahoo(item,cutoff),12500),id:item.id,basis:item.symbol==='^IRX' ? 'bank-discount' : 'yahoo-yield',source:'Yahoo Finance · referencia de rendimiento'};} catch {return null;}
    })) : [];
    const domestic=config.markets.map(item=>{
        const prior=previous.find(quote=>quote.id===item.id || item.symbol && quote.symbol===item.symbol || quote.label===item.label);
        const fresh=[...treasury,...mexico].find(quote=>quote.id===item.id && quote.series.length);
        const quote=fresh || (prior && (prior.series || prior.points || []).length ? prior : null) || fallback.find(quote=>quote?.id===item.id);
        const series=compactBondPoints([...(fresh && prior?.basis===fresh.basis ? prior.series || prior.points || [] : []),...(quote?.series || quote?.points || quote?.recentSeries || [])],cutoff);
        const last=series.at(-1),before=series.at(-2);
        // Old Yahoo ^IRX histories use bank discount, unlike Treasury par yields.
        const basis=quote?.basis || (item.symbol==='^IRX' ? 'bank-discount' : quote && !fresh ? 'yahoo-yield' : item.basis);
        return {...item,basis,source:quote?.source || item.source,series,value:last?.value,previous:before?.value,
            delta:finite(last?.value) && finite(before?.value) ? last.value-before.value : null,
            quoteStatus:series.length ? 'observed' : item.seriesId && !token ? 'not-configured' : 'unavailable'};
    });
    return [...domestic,...context,...global];
}
module.exports={config,loadBondMarkets,parseTreasuryXml,parseBanxicoSeries};
