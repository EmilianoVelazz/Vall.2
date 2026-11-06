'use strict';
const {externalGet}=require('./http');
const {dailyPoints}=require('./report-observations');
const {reportDeadline}=require('./report-deadline');
const {textOnly}=require('../services/mercolleida-public');
const markets=[
    {ticker:'EIA-WTI-SPOT',label:'WTI físico FOB · Cushing, EE. UU.',region:'América',market:'Estados Unidos',unit:'USD/barril',match:'Cushing, OK WTI Spot Price FOB',unitMatch:'Dollars per Barrel',url:'https://www.eia.gov/dnav/pet/hist/rwtcD.htm'},
    {ticker:'EIA-BRENT-SPOT',label:'Brent físico FOB · Europa',region:'Europa',market:'Europa',unit:'USD/barril',match:'Europe Brent Spot Price FOB',unitMatch:'Dollars per Barrel',url:'https://www.eia.gov/dnav/pet/hist/rbrteD.htm'},
    {ticker:'EIA-HENRY-SPOT',label:'Gas Henry Hub físico · EE. UU.',region:'América',market:'Estados Unidos',unit:'USD/MMBtu',match:'Henry Hub Natural Gas Spot Price',unitMatch:'Dollars per Million Btu',url:'https://www.eia.gov/dnav/ng/hist/rngwhhdD.htm'},
].map(item=>({...item,provider:'eia',bucket:'energy',kind:'price',exchange:'Mercado físico · EIA',currency:'USD',cadence:'daily',source:'EIA · precios físicos diarios de energía',basis:'Precio físico de referencia publicado por EIA. No es un contrato de futuros ni un precio entregado a la empresa.'}));
function parseEiaPrices(html,item,cutoff) {
    if(typeof html!=='string' || html.length>2000000)throw Error('Página EIA no válida');
    const title=textOnly(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
    if(!title.includes(item.match) || !title.includes(item.unitMatch))throw Error('Producto o unidad EIA no coincide');
    const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],points=[];
    for(const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell=>textOnly(cell[1]).replace(/\s+/g,' ').trim());
        const week=cells[0]?.match(/^(\d{4}) ([A-Z][a-z]{2})-\s*(\d{1,2}) to ([A-Z][a-z]{2})-\s*(\d{1,2})$/);
        if(!week || cells.length!==6 || !months.includes(week[2]) || !months.includes(week[4]))continue;
        const start=Date.UTC(Number(week[1]),months.indexOf(week[2]),Number(week[3]));
        if(new Date(start).getUTCDay()!==1)continue;
        // The columns are Monday–Friday; a blank holiday stays absent.
        for(let i=0;i<5;i++)if(/^-?\d+(?:\.\d+)?$/.test(cells[i+1]))points.push({date:new Date(start+i*86400000).toISOString().slice(0,10),value:Number(cells[i+1])});
    }
    const series=dailyPoints(points,cutoff),last=series.at(-1),previous=series.at(-2);
    if(!last)throw Error('Sin precios diarios EIA fechados');
    return {...item,series,value:last.value,previous:previous?.value ?? null,change:previous?.value>0 ? (last.value/previous.value-1)*100 : null,observedAt:last.date,retrievedAt:new Date().toISOString(),quoteStatus:'verified'};
}
async function loadEiaPrices({get=externalGet,cutoff=new Date().toISOString(),previous=[],timeoutMs=12000,historyLimit=2500}={}) {
    return Promise.all(markets.map(async item=>{
        try {return await reportDeadline(async()=>{const response=await get(item.url,{Accept:'text/html'},timeoutMs);if(!response.ok)throw Error('EIA no disponible');const quote=parseEiaPrices(await response.text(),item,cutoff);return {...quote,series:quote.series.slice(-historyLimit)};},timeoutMs);}catch {
            const prior=previous.find(quote=>quote.ticker===item.ticker && quote.provider==='eia' && quote.unit===item.unit),series=dailyPoints(prior?.series || [],cutoff).slice(-historyLimit),last=series.at(-1),before=series.at(-2);
            return {...item,series,value:last?.value ?? null,previous:before?.value ?? null,change:before?.value>0 ? (last.value/before.value-1)*100 : null,observedAt:last?.date || null,retrievedAt:prior?.retrievedAt || null,quoteStatus:last ? 'preserved' : 'unavailable'};
        }
    }));
}
module.exports={markets,parseEiaPrices,loadEiaPrices};
