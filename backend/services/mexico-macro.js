'use strict';
const { externalGet } = require('../lib/http');
const INDICATORS = [
    {id:'gdp_growth',code:'NY.GDP.MKTP.KD.ZG',label:'Crecimiento real del PIB',unit:'%'},
    {id:'unemployment',code:'SL.UEM.TOTL.ZS',label:'Desempleo',unit:'%'},
    {id:'trade_share',code:'NE.TRD.GNFS.ZS',label:'Comercio exterior / PIB',unit:'%'},
    {id:'remittances',code:'BX.TRF.PWKR.CD.DT',label:'Remesas recibidas',unit:'USD'},
    {id:'gdp_per_capita',code:'NY.GDP.PCAP.CD',label:'PIB por habitante',unit:'USD'},
    {id:'population',code:'SP.POP.TOTL',label:'Población',unit:'personas'},
];
function createMexicoMacro({get=externalGet,now=()=>new Date()}={}) {
    let cache;
    async function load() {
        const time=now(),year=time.getUTCFullYear();
        if(cache && time.getTime()-Date.parse(cache.timestamp)<86400000) return cache;
        const settled=await Promise.allSettled(INDICATORS.map(async meta=>{
            const response=await get(`https://api.worldbank.org/v2/country/MEX/indicator/${meta.code}?format=json&per_page=12&date=${year-7}:${year}`,{},12000);
            if(!response.ok) throw Error('Banco Mundial no disponible');
            const payload=await response.json();
            const rows=(Array.isArray(payload?.[1]) ? payload[1] : []).filter(row=>typeof row?.value==='number' && Number.isFinite(row.value) && /^\d{4}$/.test(String(row.date)) && Number(row.date)<=year).sort((a,b)=>Number(b.date)-Number(a.date));
            if(!rows.length) throw Error('Sin observación');
            return {...meta,value:rows[0].value,period:String(rows[0].date),series:rows.map(row=>({period:String(row.date),value:row.value})).reverse(),source:'Banco Mundial',url:`https://data.worldbank.org/indicator/${meta.code}?locations=MX`};
        }));
        const indicators=settled.filter(item=>item.status==='fulfilled').map(item=>item.value);
        if(!indicators.length) {if(cache) return {...cache,stale:true};throw Error('No se pudo obtener el panorama macroeconómico de México.');}
        cache={timestamp:time.toISOString(),indicators,unavailable:INDICATORS.length-indicators.length,note:'Indicadores anuales; cada cifra conserva su año de observación.'};
        return cache;
    }
    return {load};
}
module.exports={createMexicoMacro,getMexicoMacro:createMexicoMacro().load};
