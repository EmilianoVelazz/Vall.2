'use strict';
const config=require('../../shared/report-commodity-markets.json');
const {externalGet}=require('./http');
const {dailyPoints}=require('./report-observations');
const {reportDeadline}=require('./report-deadline');
const {loadEiaPrices}=require('./report-eia-prices');
const {loadGlobalGrainPrices}=require('./report-global-grain-prices');
function parseCommodity(payload,item,cutoff) {
    let points;
    if(item.provider==='sina') {
        if(!Array.isArray(payload)) throw Error('Serie diaria no disponible.');
        const numeric=value=>typeof value==='number' ? value : typeof value==='string' && /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
        points=dailyPoints(payload.map(row=>({date:row?.d,value:numeric(row?.c)})),cutoff);
        // A daily bar for China is final only after its daytime close at 15:00.
        const china=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).format(new Date(cutoff));
        if(Number(china.slice(-2))<15) points=points.filter(point=>point.date<china.slice(0,10));
    } else {
        const result=payload?.chart?.result?.[0],meta=result?.meta;
        if(!meta || meta.symbol!==item.ticker || meta.currency!==item.currency || !['FUTURE','ALTSYMBOL'].includes(meta.instrumentType) || !(new RegExp(item.match,'i')).test((meta.shortName || '')+' '+(meta.longName || ''))) throw Error('Identidad, moneda o tipo de contrato no coinciden.');
        const closes=result.indicators?.quote?.[0]?.close || [];
        points=dailyPoints((result.timestamp || []).flatMap((stamp,index)=>Number.isFinite(stamp) && stamp*1000<=Date.parse(cutoff) ? [{date:new Date(stamp*1000).toISOString().slice(0,10),value:closes[index]}] : []),cutoff);
        const session=meta.currentTradingPeriod?.regular;
        if(Number.isFinite(session?.end) && session.end*1000>Date.parse(cutoff)) {
            const timeZone=meta.exchangeTimezoneName || 'UTC',format=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}),activeDay=format.format(new Date(session.end*1000));
            points=points.filter(point=>point.date<activeDay);
        }
        if(!Number.isFinite(session?.end)) points=points.filter(point=>point.date<cutoff.slice(0,10));
    }
    if(!points.length) throw Error('Sin cierres diarios verificables.');
    // Provider floats (359.799987...) are a representation artifact. Keep the
    // original for audit and publish the contract's declared price precision.
    points=points.map(point=>({date:point.date,value:Number(point.value.toFixed(item.decimals ?? 5)),...(Number(point.value.toFixed(item.decimals ?? 5))!==point.value ? {rawValue:point.value} : {})}));
    const last=points.at(-1),previous=points.at(-2),change=previous?.value>0 ? (last.value/previous.value-1)*100 : null;
    return {...item,series:points.filter(point=>point.date>='2020-01-01').slice(-2500),value:last.value,previous:previous?.value ?? null,change,performance:{day:change},observedAt:last.date,retrievedAt:new Date().toISOString(),cadence:'daily',basis:'serie continua de futuros; cierre sin ajustar',source:item.provider==='sina' ? 'Sina Finance · serie diaria de futuros chinos' : 'Yahoo Finance · serie diaria de futuros',url:item.provider==='sina' ? 'https://finance.sina.com.cn/futures/quotes/'+item.ticker+'.shtml' : 'https://finance.yahoo.com/quote/'+encodeURIComponent(item.ticker)+'/'};
}
async function loadGlobalCommodities({get=externalGet,read,cutoff=new Date().toISOString(),previous=[],timeoutMs=9000,physicalTimeoutMs=12000}={}) {
    const physical=loadEiaPrices({get,cutoff,previous,timeoutMs:physicalTimeoutMs});
    const worldGrains=loadGlobalGrainPrices({get,read,cutoff,previous,timeoutMs:physicalTimeoutMs});
    let cursor=0;const values=new Array(config.markets.length);
    await Promise.all(Array.from({length:6},async()=>{while(cursor<config.markets.length){const index=cursor++,item=config.markets[index];
        try {values[index]=await reportDeadline(async()=>{const url=item.provider==='sina' ? 'https://stock2.finance.sina.com.cn/futures/api/json.php/InnerFuturesNewService.getDailyKLine?symbol='+item.ticker : 'https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(item.ticker)+'?interval=1d&period1=1577836800&period2='+Math.floor((Date.parse(cutoff)+86400000)/1000);const response=await get(url,{Accept:'application/json',...(item.provider==='sina' ? {Referer:'https://finance.sina.com.cn/'} : {})},timeoutMs);if(!response.ok)throw Error('Proveedor no disponible.');return parseCommodity(await response.json(),item,cutoff);},timeoutMs);}
        catch {const prior=previous.find(quote=>quote.ticker===item.ticker && quote.unit===item.unit && quote.provider===item.provider && dailyPoints(quote.series,cutoff).length);values[index]=prior ? {...prior,series:dailyPoints(prior.series,cutoff).slice(-2500),quoteStatus:'preserved'} : {...item,series:[],value:null,previous:null,change:null,cadence:'daily',quoteStatus:'unavailable'};}
    }}));
    return [...values,...await physical,...await worldGrains];
}
module.exports={config,parseCommodity,loadGlobalCommodities};
