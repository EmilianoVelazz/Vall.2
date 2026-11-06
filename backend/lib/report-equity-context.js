'use strict';
const fs=require('node:fs'),path=require('node:path');
const {externalGet}=require('./http');
const {reportDeadline}=require('./report-deadline');
const {loadPrimaryNews}=require('./report-primary-news');
const {textOnly}=require('../services/mercolleida-public');
const {safeEquityContext,EQUITY_CONTEXT_MARKETS,equityCurrency}=require('../../shared/report-equity-context.mjs');
const OFFICIAL=[
    {id:'vix',source:'Cboe · cierre oficial del VIX',url:'https://cdn-api.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv'},
    {id:'us10y',source:'Reserva Federal · H.15 / FRED',url:'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10',column:'DGS10'},
    {id:'credit',source:'ICE BofA · OAS High Yield / FRED',url:'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2',column:'BAMLH0A0HYM2'},
];
async function readOfficial(url,headers={},timeoutMs=6000){
    const target=new URL(url);if(target.protocol!=='https:' || !['cdn-api.cboe.com','fred.stlouisfed.org','news.google.com','www.ecb.europa.eu','www.federalreserve.gov','www.boj.or.jp','www.wto.org'].includes(target.hostname) || target.username || target.password || target.port)throw Error('Origen público no permitido');
    const response=await fetch(url,{signal:AbortSignal.timeout(Math.max(1,Math.min(timeoutMs,6000))),redirect:'error',headers:{Accept:'text/csv','User-Agent':'Mozilla/5.0 (compatible; VALLNews/1.0)',...headers}});
    const reader=response.body?.getReader(),chunks=[];let bytes=0;
    if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>3000000)throw Error('CSV demasiado grande');chunks.push(Buffer.from(value));}}catch(error){await reader.cancel().catch(()=>{});throw error;}
    return {ok:response.ok,status:response.status,text:async()=>Buffer.concat(chunks).toString('utf8')};
}
function parseCatalystRss(xml,region,cutoff){
    if(typeof xml!=='string' || xml.length>2000000 || !/<rss\b/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('RSS de sesión no válido');
    const clean=value=>textOnly(String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')).replace(/\s+/g,' ').trim(),news=[];
    for(const entry of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){
        const field=name=>entry[1].match(new RegExp('<'+name+'\\b[^>]*>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1] || '';
        const title=clean(field('title')),source=clean(field('News:Source') || field('source')),publishedAt=Date.parse(clean(field('pubDate')));let url;try{url=new URL(clean(field('link')));if(['www.bing.com','bing.com'].includes(url.hostname) && url.searchParams.get('url'))url=new URL(url.searchParams.get('url'));}catch{continue;}
        if(!title || !source || !Number.isFinite(publishedAt) || publishedAt>Date.parse(cutoff) || Date.parse(cutoff)-publishedAt>7*86400000 || url.protocol!=='https:' || url.username || url.password || url.port || /^(localhost|127\.|0\.|\[|10\.|192\.168\.)/i.test(url.hostname))continue;
        news.push({title,description:clean(field('description')).slice(0,800),source:source+' · RSS de noticias',url:url.href,publishedAt:new Date(publishedAt).toISOString(),region});
    }
    return news;
}
async function loadSessionCatalysts({cutoff,sessionStart,sessionEnd,get}){
    const end=String(sessionEnd || cutoff.slice(0,10)).slice(0,10),start=String(sessionStart || new Date(Date.parse(end)-4*86400000).toISOString().slice(0,10));
    const datePhrase=Number(end.slice(8,10))+' '+new Intl.DateTimeFormat('es',{month:'long',timeZone:'UTC'}).format(new Date(end))+' '+end.slice(0,4);
    return (await Promise.all([['América','Wall Street'],['Europa','bolsas Europa'],['Asia','bolsas Asia']].map(async([region,query])=>{
        const url='https://www.bing.com/news/search?'+new URLSearchParams({q:query+' '+datePhrase,format:'rss',mkt:'es-MX',setlang:'es-mx',cc:'mx'});
        try{const response=await get(url,{},4000);if(!response.ok)return [];return parseCatalystRss(await response.text(),region,cutoff).filter(item=>item.publishedAt.slice(0,10)>start && item.publishedAt.slice(0,10)<=end).slice(0,8);}catch{return [];}
    }))).flat();
}
function parseContextCsv(text,definition,cutoff){
    if(typeof text!=='string' || text.length>3000000 || /<html|<!doctype/i.test(text))throw Error('CSV financiero no válido');
    const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/),cells=line=>line.split(',').map(value=>value.trim().replace(/^"|"$/g,''));
    const header=cells(lines.shift() || ''),column=header.findIndex(value=>value===(definition.column || 'CLOSE'));
    if(column<0 || !/date/i.test(header[0] || ''))throw Error('Serie o columna no confirmada');
    const points=[];
    for(const line of lines){const row=cells(line),match=row[0]?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/),date=match ? match[3]+'-'+match[1].padStart(2,'0')+'-'+match[2].padStart(2,'0') : row[0];if(!/^-?\d+(?:\.\d+)?$/.test(row[column] || ''))continue;points.push({date,value:Number(row[column])});}
    const item=EQUITY_CONTEXT_MARKETS.find(item=>item.id===definition.id);
    return safeEquityContext({quotes:[{...item,...definition,points}]},cutoff).quotes[0];
}
function seedEquityContext(snapshot){
    const equity=snapshot?.reports?.find(item=>item.key==='equities'),bonds=snapshot?.reports?.find(item=>item.key==='bonds'),fx=snapshot?.reports?.find(item=>item.key==='fx');
    if(!equity)return undefined;
    const quotes=[...(equity.equityContext?.quotes || [])];
    try {
        const marketCache = path.join(__dirname, '../cache/market_executive_reports.json');
        if (fs.existsSync(marketCache)) {
            const mData = JSON.parse(fs.readFileSync(marketCache, 'utf8'));
            const energy = mData.reports?.find(r => r.key === 'energy_metals')?.sourceSnapshot?.energy || [];
            const commMap = { wti: 'Petróleo WTI', brent: 'Petróleo Brent', gas: 'Gas Henry Hub', copper: 'Cobre COMEX', gold: 'Oro COMEX' };
            for (let i = 0; i < quotes.length; i++) {
                const labelMatch = commMap[quotes[i].id];
                if (labelMatch) {
                    const match = energy.find(e => e.label.includes(labelMatch));
                    if (match?.series?.length) {
                        quotes[i] = { ...quotes[i], points: match.series.filter(p => p.date >= '2020-01-01') };
                    }
                }
            }
        }
    } catch {}
    const vix=equity.sourceSnapshot?.equities?.find(item=>item.symbol==='^VIX');
    const ten=bonds?.sourceSnapshot?.bonds?.find(item=>item.market==='Estados Unidos' && item.tenorYears===10 && item.cadence!=='auction');
    for(const [id,value] of [['vix',vix],['us10y',ten]])if(value && !quotes.some(item=>item.id===id))quotes.push({...value,...EQUITY_CONTEXT_MARKETS.find(item=>item.id===id),points:(value.series || value.points || []).filter(point=>value.sessionBasis==='closed-daily' || point.date<(equity.generatedAt || snapshot.generatedAt).slice(0,10))});
    for(const item of fx?.sourceSnapshot?.fxHistories || []){
        const code=equityCurrency(item.quoteCurrency);if(item.baseCurrency!=='USD' || !code || quotes.some(value=>value.id==='fx:'+code))continue;
        quotes.push({...item,id:'fx:'+code,unit:code+' por 1 USD',points:(item.series || item.points || []).filter(point=>!/yahoo/i.test(item.source || '') || item.sessionBasis==='closed-daily' || point.date<(equity.generatedAt || snapshot.generatedAt).slice(0,10))});
    }
    return safeEquityContext({quotes,news:[...(equity.equityContext?.news || []),...(equity.equityNews || []),...(snapshot.reports.find(item=>item.key==='daily_news')?.headlines || [])]},equity.generatedAt || snapshot.generatedAt);
}
async function loadEquityExecutiveContext({cutoff=new Date().toISOString(),previous,loadQuote,get=externalGet,news=[],fx=[],currencyCodes=[],sessionStart,sessionEnd,budgetMs=14000}={}){
    if(!Number.isFinite(Date.parse(cutoff)))return safeEquityContext(null,cutoff);
    const prior=safeEquityContext(previous,cutoff),byId=new Map(prior.quotes.map(item=>[item.id,item])),deadline=Date.now()+budgetMs;
    const official=Promise.all(OFFICIAL.map(async definition=>{
        try {const quote=await reportDeadline(async()=>{const url=definition.column ? definition.url+'&cosd='+(Number(cutoff.slice(0,4))-1)+'-01-01&coed='+cutoff.slice(0,10) : definition.url;const response=get===externalGet ? await readOfficial(url) : await get(url,{Accept:'text/csv'},6000);if(!response.ok)throw Error('Fuente no disponible');return parseContextCsv(await response.text(),definition,cutoff);},6500);if(quote)byId.set(quote.id,quote);}catch { /* Keep a dated observation only. */ }
    }));
    for(const quote of fx){const code=equityCurrency(quote.quoteCurrency);if(code && quote.baseCurrency==='USD'){const item=safeEquityContext({quotes:[{...quote,id:'fx:'+code,unit:code+' por 1 USD',points:quote.series || quote.points}]},cutoff).quotes[0];if(item)byId.set(item.id,item);}}
    const jobs=EQUITY_CONTEXT_MARKETS.filter(item=>!['risk','yield','spread'].includes(item.role));
    for(const code of [...new Set(['EUR','JPY','MXN','CNY',...currencyCodes].map(equityCurrency).filter(code=>code && code!=='USD'))])if(!byId.has('fx:'+code))jobs.push({id:'fx:'+code,label:'USD/'+code,symbol:code+'=X',unit:code+' por 1 USD',role:'fx',currency:code});
    let cursor=0;
    const tasks=Array.from({length:6},async()=>{while(loadQuote && cursor<jobs.length && Date.now()<deadline){const item=jobs[cursor++];try{const quote=await reportDeadline(()=>loadQuote(item),Math.max(1,Math.min(6500,deadline-Date.now())));if(['sector','commodity'].includes(item.role) && quote?.currency!=='USD')continue;const value=safeEquityContext({quotes:[{...quote,...item,points:quote?.series || quote?.points,basis:item.role==='sector' ? 'ETF sectorial de Estados Unidos; variación del precio sin reinvertir dividendos.' : item.role==='commodity' ? 'Futuro continuo; no equivale a precio físico entregado ni a rentabilidad por renovación de contratos.' : quote?.basis || ''}]},cutoff).quotes[0];if(value)byId.set(item.id,value);}catch { /* No fabricated substitutes. */ }}});
    const publicGet=get===externalGet ? readOfficial : get;
    const primary=loadPrimaryNews({area:'finance',cutoff,get:publicGet,timeoutMs:4000,daily:false}),sessionNews=loadSessionCatalysts({cutoff,sessionStart,sessionEnd,get});
    await Promise.all([...tasks,official]);
    return safeEquityContext({quotes:[...byId.values()],news:[...await primary,...await sessionNews,...news,...prior.news]},cutoff);
}
module.exports={OFFICIAL,parseContextCsv,parseCatalystRss,seedEquityContext,loadEquityExecutiveContext};
