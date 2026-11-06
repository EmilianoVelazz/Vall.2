'use strict';
const {externalGet}=require('./http');
const {safeMarketFx}=require('../../shared/report-market-analysis.mjs');
let cachedFx=null,fxRequest=null,cachedOi=null,oiRequest=null;
const CFTC='https://publicreporting.cftc.gov/resource/6dca-aqww.json';
const contracts=[['ZC=F','002602','Maíz CBOT'],['ZW=F','001602','Trigo CBOT'],['ZS=F','005602','Soya CBOT'],['ZM=F','026603','Harina de soya CBOT'],['HE=F','054642','Cerdo magro CME'],['LE=F','057642','Ganado vivo CME'],['GF=F','061641','Ganado de engorda CME'],['CL=F','067651','WTI físico NYMEX'],['HG=F','085692','Cobre n.º 1 COMEX'],['GC=F','088691','Oro COMEX']];
// Official 2026 holiday exceptions: cftc.gov/MarketReports/CommitmentsofTraders/ReleaseSchedule/.
const delayedReleases={'2026-01-02':'2026-01-05','2026-06-19':'2026-06-22','2026-07-03':'2026-07-06','2026-11-13':'2026-11-16','2026-11-27':'2026-11-30','2026-12-25':'2026-12-28'};
function cotPublished(date,cutoff){
    const time=Date.parse(date),end=Date.parse(cutoff);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(time) || !Number.isFinite(end) || new Date(time).toISOString().slice(0,10)!==date || time>end)return false;
    const day=new Date(time).getUTCDay(),friday=new Date(time+((5-day+7)%7)*86400000).toISOString().slice(0,10),release=delayedReleases[friday] || friday;
    const local=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(end));
    return local>=release+' 15:30';
}
async function loadReportMarketFx({get=externalGet,cutoff=new Date().toISOString(),previous}={}){
    if(cachedFx && Date.now()-cachedFx.checked<3600000)return safeMarketFx(cachedFx.value,cutoff);
    if(!fxRequest)fxRequest=(async()=>{const response=await get('https://open.er-api.com/v6/latest/USD',{Accept:'application/json'},6000);if(!response.ok)throw Error('FX_UNAVAILABLE');const payload=await response.json();const value=safeMarketFx({base:payload.base_code,rates:payload.rates,observedAt:Number.isFinite(payload.time_last_update_unix) ? new Date(payload.time_last_update_unix*1000).toISOString() : '',source:'ExchangeRate-API · www.exchangerate-api.com',url:'https://open.er-api.com/v6/latest/USD'},cutoff);if(!value)throw Error('FX_INVALID');cachedFx={value,checked:Date.now()};return value;})().finally(()=>{fxRequest=null;});
    try{return await fxRequest;}catch{return safeMarketFx(previous,cutoff);}
}
function parseReportOpenInterest(rows,cutoff){
    if(!Array.isArray(rows))return [];
    return contracts.flatMap(([symbol,code,label])=>{
        const seen=new Map(),conflicts=new Set();
        for(const row of rows.filter(row=>row.cftc_contract_market_code===code)){
            const date=String(row.report_date_as_yyyy_mm_dd || '').slice(0,10),value=/^\d+$/.test(String(row.open_interest_all)) ? Number(row.open_interest_all) : NaN;
            if(!Number.isSafeInteger(value) || value<0 || !cotPublished(date,cutoff))continue;
            if(seen.has(date) && seen.get(date).value!==value)conflicts.add(date);
            seen.set(date,{date,value});
        }
        const values=[...seen.values()].filter(item=>!conflicts.has(item.date)).sort((a,b)=>a.date.localeCompare(b.date));
        const last=values.at(-1),previous=values.at(-2);if(!last || Date.parse(cutoff)-Date.parse(last.date)>14*86400000)return [];
        return [{symbol,label,date:last.date,value:last.value,change:previous?.value>0 && Date.parse(last.date)-Date.parse(previous.date)<=10*86400000 ? (last.value/previous.value-1)*100 : null,previousDate:previous?.date || '',source:'CFTC · Legacy Futures Only',url:CFTC,cadence:'weekly'}];
    });
}
async function loadReportOpenInterest({get=externalGet,cutoff=new Date().toISOString(),previous=[]}={}){
    if(cachedOi && Date.now()-cachedOi.checked<3600000)return cachedOi.value.filter(item=>cotPublished(item.date,cutoff) && Date.parse(cutoff)-Date.parse(item.date)<=14*86400000);
    if(!oiRequest)oiRequest=(async()=>{const query=new URLSearchParams({'$where':"cftc_contract_market_code in ("+contracts.map(([,code])=>"'"+code+"'").join(',')+")",'$select':'cftc_contract_market_code,report_date_as_yyyy_mm_dd,market_and_exchange_names,open_interest_all','$order':'report_date_as_yyyy_mm_dd DESC','$limit':'100'});const response=await get(CFTC+'?'+query,{Accept:'application/json'},6000);if(!response.ok)throw Error('CFTC_UNAVAILABLE');const value=parseReportOpenInterest(await response.json(),cutoff);cachedOi={value,checked:Date.now()};return value;})().finally(()=>{oiRequest=null;});
    try{return await oiRequest;}catch{return previous.filter(item=>cotPublished(item.date,cutoff) && Date.parse(cutoff)-Date.parse(item.date)<=14*86400000);}
}
module.exports={loadReportMarketFx,loadReportOpenInterest,parseReportOpenInterest};
