'use strict';
const {externalGet}=require('./http');
const {dailyPoints}=require('./report-observations');
const BASE='https://iss.moex.com/iss/history/engines/stock/markets/index/boards/SNDX/securities/IMOEX.json';
function parseMoex(payload,cutoff) {
    const table=payload?.history,columns=table?.columns;
    if(!Array.isArray(columns) || !Array.isArray(table.data) || !['BOARDID','SECID','TRADEDATE','CLOSE'].every(key=>columns.includes(key)))throw Error('Histórico MOEX no válido');
    const index=Object.fromEntries(columns.map((name,i)=>[name,i]));
    const local=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).format(new Date(cutoff));
    return dailyPoints(table.data.flatMap(row=>{
        const date=row[index.TRADEDATE],value=row[index.CLOSE];
        return row[index.BOARDID]==='SNDX' && row[index.SECID]==='IMOEX' && Number.isFinite(value) && value>0 && (date<local.slice(0,10) || date===local.slice(0,10) && Number(local.slice(-2))>=19) ? [{date,value}] : [];
    }),cutoff);
}
async function loadMoex(item,{get=externalGet,cutoff=new Date().toISOString(),start,end,timeoutMs=6000}={}) {
    const from=start || new Date(Date.parse(cutoff)-100*86400000).toISOString().slice(0,10),till=end || cutoff.slice(0,10),points=[];
    for(let offset=0;offset<1600;offset+=100) {
        const url=BASE+'?iss.meta=off&from='+from+'&till='+till+'&start='+offset;
        const response=await get(url,{Accept:'application/json'},timeoutMs);if(!response.ok)throw Error('MOEX no disponible');
        const payload=await response.json();points.push(...parseMoex(payload,cutoff));
        if(payload.history.data.length<100)break;
        if(offset===1500)throw Error('Historia MOEX excede el rango previsto');
    }
    const series=dailyPoints(points,cutoff),last=series.at(-1),previous=series.at(-2);
    if(!last)throw Error('MOEX sin cierres verificables');
    return {...item,series,recentSeries:series.slice(-65),value:last.value,previous:previous?.value ?? null,change:previous ? (last.value/previous.value-1)*100 : null,source:'Moscow Exchange · índice IMOEX oficial',provider:'moex',url:'https://www.moex.com/ru/indices',dataUrl:BASE,cadence:'daily',unit:'puntos',basis:'Índice de precios IMOEX, bolsa MOEX, tablero SNDX. Cierre oficial; no incluye dividendos.',observedAt:last.date,retrievedAt:new Date().toISOString()};
}
module.exports={parseMoex,loadMoex};
