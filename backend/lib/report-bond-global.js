'use strict';
const countries=require('../../shared/report-bond-countries.json');
const {externalGet}=require('./http');
const {reportDeadline}=require('./report-deadline');
const OECD_URL='https://sdmx.oecd.org/public/rest/v1/data/OECD.SDD.STES,DSD_STES@DF_FINMARK,4.0/.M.IRLT.PA.....';
const ECB_URL='https://data-api.ecb.europa.eu/service/data/IRS/M..L.L40.CI.0000..N.Z';
// SDMX CSV can contain quoted commas, embedded newlines and escaped quotes.
function csvRows(text) {
    if(typeof text!=='string' || text.length>8*1024*1024) throw Error('CSV internacional inválido.');
    const rows=[];let row=[],field='',quoted=false;
    for(let i=0;i<text.length;i++) {
        const char=text[i];
        if(char==='"') {if(quoted && text[i+1]==='"') {field+='"';i++;} else quoted=!quoted;}
        else if(!quoted && (char===',' || char==='\n' || char==='\r')) {
            row.push(field);field='';
            if(char!==',') {if(row.some(Boolean)) rows.push(row);row=[];if(char==='\r' && text[i+1]==='\n') i++;}
        } else field+=char;
    }
    if(quoted) throw Error('CSV internacional incompleto.');
    if(field || row.length) {row.push(field);rows.push(row);}
    const headers=rows.shift()?.map(header=>header.replace(/^\uFEFF/,'')) || [];
    return rows.map(values=>Object.fromEntries(headers.map((header,index)=>[header,values[index] || ''])));
}
function parseGlobalCsv(text,provider,cutoff,{historyLimit=256}={}) {
    const currentMonth=String(cutoff).slice(0,7),groups=new Map();
    for(const row of csvRows(text)) {
        const oecd=provider==='oecd',country=countries.find(item=>(oecd ? item.iso3 : item.code)===row.REF_AREA);
        if(!country || row.FREQ!=='M' || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(row.TIME_PERIOD) || row.TIME_PERIOD<'2020-01' || row.TIME_PERIOD>=currentMonth || !/^-?\d+(?:\.\d+)?$/.test(row.OBS_VALUE)) continue;
        if(row.UNIT_MULT!=='0' || !['A','P',''].includes(row.OBS_STATUS)) continue;
        if(oecd ? row.MEASURE!=='IRLT' || row.UNIT_MEASURE!=='PA' || row.METHODOLOGY!=='N' || ['ACTIVITY','ADJUSTMENT','TRANSFORMATION','TIME_HORIZ'].some(key=>row[key]!=='_Z') : row.IR_TYPE!=='L' || row.TR_TYPE!=='L40' || row.MATURITY_CAT!=='CI' || row.UNIT!=='PC' || !/^[A-Z]{3}$/.test(row.CURRENCY_TRANS)) continue;
        const currency=oecd ? country.code==='BG' && row.TIME_PERIOD<'2026-01' ? 'BGN' : country.code==='HR' && row.TIME_PERIOD<'2023-01' ? 'HRK' : country.currency : row.CURRENCY_TRANS,key=country.code+'|'+currency;
        if(!groups.has(key)) groups.set(key,{...country,id:'GOV10Y-'+country.code,label:country.market+' · soberano largo plazo',currency,maturity:'10Y',tenorYears:10,cadence:'monthly',basis:oecd ? 'oecd-government-10y' : 'ecb-convergence-10y',source:oecd ? 'OCDE · Financial market · tipos de largo plazo' : 'BCE · rendimiento de convergencia a largo plazo',url:oecd ? 'https://data-explorer.oecd.org/vis?df[ag]=OECD.SDD.STES&df[id]=DSD_STES@DF_FINMARK&df[vs]=4.0&dq='+country.iso3+'.M.IRLT.PA.....' : 'https://data.ecb.europa.eu/data/datasets/IRS/IRS.M.'+country.code+'.L.L40.CI.0000.'+currency+'.N.Z',values:new Map(),conflicts:new Set()});
        const group=groups.get(key),value=Number(row.OBS_VALUE);
        if(group.values.has(row.TIME_PERIOD) && group.values.get(row.TIME_PERIOD)!==value) group.conflicts.add(row.TIME_PERIOD);
        group.values.set(row.TIME_PERIOD,value);
    }
    return [...groups.values()].map(({values,conflicts,...item})=>({...item,series:[...values].filter(([date])=>!conflicts.has(date)).sort(([a],[b])=>a.localeCompare(b)).slice(-historyLimit).map(([date,value])=>({date,value}))})).filter(item=>item.series.length);
}
async function loadGlobalBondMarkets({get=externalGet,cutoff=new Date().toISOString(),previous=[],timeoutMs=10000}={}) {
    const datasets=await Promise.all([['oecd',OECD_URL+'?startPeriod=2020-01&dimensionAtObservation=AllDimensions'],['ecb',ECB_URL+'?format=csvdata&startPeriod=2020-01']].map(async([provider,url])=>{
        try {return await reportDeadline(async()=>{const response=await get(url,{Accept:'text/csv'},timeoutMs);if(!response.ok) throw Error('Fuente internacional no disponible');return parseGlobalCsv(await response.text(),provider,cutoff);},timeoutMs);} catch {return [];}
    }));
    const best=new Map();
    // A complete series from one provider is retained; do not splice methods or
    // currencies. On an equally recent period prefer the ECB for its countries.
    for(const quote of [...previous.filter(item=>item.cadence==='monthly'),...datasets.flat()]) {
        const series=(quote.series || quote.points || []).filter(point=>/^\d{4}-(?:0[1-9]|1[0-2])$/.test(point.date) && point.date>='2020-01' && point.date<cutoff.slice(0,7) && Number.isFinite(point.value)).slice(-256);
        if(!series.length) continue;
        const prior=best.get(quote.id);
        if(!prior || series.at(-1).date>=prior.series.at(-1).date) best.set(quote.id,{...quote,series,value:series.at(-1).value,previous:series.at(-2)?.value,quoteStatus:'observed'});
    }
    return [...best.values()].sort((a,b)=>a.market.localeCompare(b.market,'es'));
}
module.exports={countries,parseGlobalCsv,loadGlobalBondMarkets,csvRows};
