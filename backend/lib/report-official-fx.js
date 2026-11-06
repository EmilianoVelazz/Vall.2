'use strict';
const {externalGet}=require('./http');
const {dailyPoints}=require('./report-observations');
const {reportDeadline}=require('./report-deadline');
const {currencies}=require('../../shared/report-fx.json');
const ECB='https://data-api.ecb.europa.eu/service/data/EXR/D.'+['USD',...currencies.map(item=>item.code).filter(code=>!['EUR','RUB','VES'].includes(code))].join('+')+'.EUR.SP00.A?startPeriod=2019-12-01&format=csvdata';
const ecbCodes=currencies.map(item=>item.code).filter(code=>!['EUR','RUB','VES'].includes(code)),ECB_BATCHES=Array.from({length:Math.ceil(ecbCodes.length/6)},(_,index)=>'https://data-api.ecb.europa.eu/service/data/EXR/D.USD+'+ecbCodes.slice(index*6,index*6+6).join('+')+'.EUR.SP00.A?startPeriod=2019-12-01&format=csvdata');
const BOC='https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?start_date=2019-12-01';
function parseEcbFxCsv(text,cutoff){
    const {csvRows}=require('./report-bond-global'),days=new Map();
    for(const row of csvRows(text)){
        if(row.FREQ!=='D' || row.CURRENCY_DENOM!=='EUR' || row.EXR_TYPE!=='SP00' || row.EXR_SUFFIX!=='A' || row.UNIT_MULT!=='0' || row.UNIT!==row.CURRENCY || !['A',''].includes(row.OBS_STATUS) || !/^\d{4}-\d{2}-\d{2}$/.test(row.TIME_PERIOD) || !published(row.TIME_PERIOD,cutoff,'Europe/Berlin',16))continue;
        if(!days.has(row.TIME_PERIOD))days.set(row.TIME_PERIOD,new Map([['EUR',1]]));
        const rates=days.get(row.TIME_PERIOD),value=Number(row.OBS_VALUE);if(positive(value))rates.set(row.CURRENCY,rates.has(row.CURRENCY) && rates.get(row.CURRENCY)!==value ? NaN : value);
    }
    return currencies.map(item=>({...item,baseCurrency:'USD',quoteCurrency:item.code,label:'USD/'+item.code,provider:'ecb',source:'BCE · tipos de cambio de referencia',url:ECB,cadence:'daily',basis:'Referencia BCE: cruce de referencias en moneda por euro y dólares por euro en la misma publicación; no es cierre interbancario ni precio ejecutable.',series:dailyPoints([...days].flatMap(([date,rates])=>positive(rates.get('USD')) && positive(rates.get(item.code)) ? [{date,value:rates.get(item.code)/rates.get('USD')}] : []),cutoff)})).filter(item=>item.series.length);
}
const positive=value=>Number.isFinite(value) && value>0;
function published(date,cutoff,zone,hour,minute=0) {
    const local=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(cutoff));
    return date<local.slice(0,10) || date===local.slice(0,10) && local.slice(-5)>=String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0');
}
function parseEcbFx(xml,cutoff) {
    if(typeof xml!=='string' || xml.length>2000000 || !/www\.ecb\.int\/vocabulary\/2002-08-01\/eurofxref/.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('XML BCE no válido');
    const series=new Map(currencies.map(item=>[item.code,[]]));
    for(const day of xml.matchAll(/<Cube\b[^>]*\btime=['"](\d{4}-\d{2}-\d{2})['"][^>]*>([\s\S]*?)<\/Cube>/g)) {
        if(!published(day[1],cutoff,'Europe/Berlin',16))continue;
        const rates=new Map([['EUR',1]]),conflicts=new Set();
        for(const rate of day[2].matchAll(/<Cube\b[^>]*currency=['"]([A-Z]{3})['"][^>]*rate=['"]([\d.]+)['"][^>]*\/>/g)) {
            const value=Number(rate[2]);if(!positive(value))continue;
            if(rates.has(rate[1]) && rates.get(rate[1])!==value)conflicts.add(rate[1]);
            rates.set(rate[1],value);
        }
        if(!positive(rates.get('USD')) || conflicts.has('USD'))continue;
        for(const [code,points] of series)if(positive(rates.get(code)) && !conflicts.has(code))points.push({date:day[1],value:rates.get(code)/rates.get('USD')});
    }
    return currencies.map(item=>({...item,baseCurrency:'USD',quoteCurrency:item.code,label:'USD/'+item.code,provider:'ecb',source:'BCE · tipos de cambio de referencia',url:ECB,cadence:'daily',basis:'Referencia BCE: unidades de moneda por euro divididas entre dólares por euro de la misma publicación; no es un cierre bursátil.',series:dailyPoints(series.get(item.code),cutoff).slice(-65)})).filter(item=>item.series.length);
}
function parseBocFx(payload,cutoff) {
    const meta=payload?.seriesDetail?.FXUSDCAD;
    if(meta?.label!=='USD/CAD' || !/Canadian dollars/i.test(meta.description || '') || !/US dollar/i.test(meta.description || ''))throw Error('Identidad USD/CAD no coincide');
    const series=dailyPoints((payload.observations || []).flatMap(row=>{
        const raw=row?.FXUSDCAD?.v,value=typeof raw==='string' && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
        return positive(value) && /^\d{4}-\d{2}-\d{2}$/.test(row.d) && published(row.d,cutoff,'America/Toronto',16,30) ? [{date:row.d,value}] : [];
    }),cutoff);
    return series.length ? [{...currencies.find(item=>item.code==='CAD'),baseCurrency:'USD',quoteCurrency:'CAD',label:'USD/CAD',provider:'boc',source:'Banco de Canadá · promedio diario USD/CAD',url:BOC,cadence:'daily',basis:'Promedio diario publicado por el Banco de Canadá; no es un precio de cierre ni una cotización operable.',series}] : [];
}
async function loadOfficialFxHistories({get=externalGet,cutoff=new Date().toISOString(),timeoutMs=15000}={}) {
    if(!Number.isFinite(Date.parse(cutoff)))throw Error('Corte de divisas inválido');
    const results=await Promise.all([...ECB_BATCHES.map(url=>[url,parseEcbFxCsv,false]),[BOC,parseBocFx,true]].map(async([url,parse,json])=>{
        try{return await reportDeadline(async()=>{const response=await get(url,{Accept:json ? 'application/json' : 'text/csv'},timeoutMs);if(!response.ok)throw Error('Fuente de divisas no disponible');return parse(await (json ? response.json() : response.text()),cutoff);},timeoutMs);}catch{return [];}
    }));
    const byCode=new Map();for(const quote of results.flat())byCode.set(quote.quoteCurrency,{...quote,retrievedAt:new Date().toISOString(),quoteStatus:'verified'});
    return [...byCode.values()];
}
module.exports={parseEcbFx,parseEcbFxCsv,parseBocFx,loadOfficialFxHistories,ECB,BOC};
