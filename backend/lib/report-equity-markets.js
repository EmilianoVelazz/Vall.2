'use strict';
const config=require('../../shared/report-equity-markets.json');
const {reportDeadline}=require('./report-deadline');
const finite=value=>typeof value==='number' && Number.isFinite(value);

// Bounded concurrency and one budget for the whole catalogue. A failed source
// leaves a visible reference; it never removes a market or supplies a zero.
async function loadEquityMarkets(load,{previous=[],cutoff=new Date().toISOString(),concurrency=6,budgetMs=30000}={}) {
    const quotes=new Map(previous.filter(item=>item?.symbol).map(item=>[item.symbol,item]));
    const jobs=config.markets.filter(item=>item.symbol),deadline=Date.now()+budgetMs;
    let cursor=0;
    await Promise.all(Array.from({length:Math.max(1,Math.min(6,concurrency))},async()=>{
        while(cursor<jobs.length && Date.now()<deadline) {
            const item=jobs[cursor++];
            try {
                const quote=await reportDeadline(()=>load(item,cutoff),Math.max(1,Math.min(12500,deadline-Date.now())));
                if(quote?.series?.some(point=>finite(point.value) && point.value>0)) quotes.set(item.symbol,quote);
            } catch { /* The previous dated observations remain available. */ }
        }
    }));
    return config.markets.map(item=>{
        const quote=quotes.get(item.symbol),limit=Date.parse(cutoff);
        const series=(quote?.series || quote?.points || quote?.recentSeries || []).filter(point=>finite(point.value) && point.value>0 && Date.parse(point.date)<=limit);
        const value=series.at(-1)?.value,previous=series.at(-2)?.value;
        return {...quote,...item,series,recentSeries:series.slice(-config.historyLimit),value,previous,
            change:finite(value) && finite(previous) ? (value/previous-1)*100 : null,
            quoteStatus:series.length ? 'observed' : item.symbol ? 'unavailable' : 'not-connected'};
    });
}
module.exports={config,loadEquityMarkets};
