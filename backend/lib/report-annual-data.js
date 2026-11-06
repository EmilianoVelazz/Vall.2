'use strict';
const {externalGet}=require('./http');
const {dailyPoints}=require('./report-observations');
const {csvRows,parseGlobalCsv}=require('./report-bond-global');
const {parseTreasuryXml,parseBanxicoSeries}=require('./report-bond-markets');
const {textOnly}=require('../services/mercolleida-public');
const {queryRnmHistory}=require('./rnm-history-query');
const {markets:eiaMarkets,parseEiaPrices}=require('./report-eia-prices');
const {loadMoex}=require('./report-moex');
const equities=require('../../shared/report-equity-markets.json').markets;
const commodities=require('../../shared/report-commodity-markets.json').markets;
const proteins=require('../../shared/report-protein-markets.json').markets;
const currencies=require('../../shared/report-fx.json').currencies;
const library=require('../../shared/report-library.json');
const START='2021-12-01',END='2026-01-01';
const STATE_NAMES=['Aguascalientes','Baja California','Baja California Sur','Campeche','Coahuila','Colima','Chiapas','Chihuahua','Ciudad de México','Durango','Guanajuato','Guerrero','Hidalgo','Jalisco','Estado de México','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla','Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatán','Zacatecas'];
const number=value=>typeof value==='number' ? value : /^-?\d+(?:\.\d+)?$/.test(String(value).trim()) ? Number(value) : null;
function historicalPoints(points) {return dailyPoints(points,END).filter(point=>point.date>=START && point.date<END);}
function parseAnnualYahoo(payload,item) {
    const result=payload?.chart?.result?.[0],meta=result?.meta;
    const symbol=item.symbol || item.ticker;
    if(meta?.symbol!==symbol)throw Error('Identidad histórica no coincide');
    if(item.bucket==='equities' && meta.instrumentType!=='INDEX')throw Error('La referencia histórica no es un índice');
    if(item.bucket==='fx' && (meta.instrumentType!=='CURRENCY' || meta.currency!==item.currency))throw Error('Par o moneda histórica no coincide');
    if(item.provider==='yahoo' && (meta.currency!==item.currency || !['FUTURE','ALTSYMBOL'].includes(meta.instrumentType) || !new RegExp(item.match,'i').test((meta.shortName || '')+' '+(meta.longName || ''))))throw Error('Contrato histórico no coincide');
    const prices=result.indicators?.quote?.[0]?.close || [],zone=meta.exchangeTimezoneName || 'UTC';
    const format=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
    return historicalPoints((result.timestamp || []).flatMap((stamp,index)=>Number.isFinite(stamp) && Number.isFinite(prices[index]) && (!['equities','fx'].includes(item.bucket) || prices[index]>0) ? [{date:format.format(new Date(stamp*1000)),value:Number(prices[index].toFixed(item.decimals ?? 6))}] : []));
}
function parseBls(payload,item) {
    if(payload?.status!=='REQUEST_SUCCEEDED')throw Error('BLS no disponible');
    const series=payload.Results?.series?.find(series=>series.seriesID===item.symbol);
    return historicalPoints((series?.data || []).flatMap(row=>/^M(?:0[1-9]|1[0-2])$/.test(row.period) && /^202[1-5]$/.test(row.year) && number(row.value)>0 ? [{date:row.year+'-'+row.period.slice(1)+'-01',value:number(row.value)}] : []));
}
function parseRnmHistory(html,item) {
    const heading=textOnly(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
    if(!new RegExp(item.match,'i').test(heading) || !html.includes('name="C" value="'+item.id+'"'))throw Error('Serie RNM histórica no coincide');
    const table=html.match(/<table class="tabcot"[^>]*>[\s\S]*?<\/table>/i)?.[0] || '';
    return historicalPoints([...table.matchAll(/<tr><td[^>]*>(\d{2})\/(\d{2})\/(\d{2})\s*<\/td>\s*<td[^>]*>([^<]+)/g)].flatMap(row=>number(row[4])>0 ? [{date:'20'+row[3]+'-'+row[2]+'-'+row[1],value:number(row[4])}] : []));
}
function parseCropProduction(text,year) {
    const crops=[['corn',/^Ma.z grano$/i],['wheat',/^Trigo grano$/i],['sorghum',/^Sorgo grano$/i],['soy',/^Soya$/i]],states=new Map(),seen=new Set();
    for(const row of csvRows(text)) {
        const crop=crops.find(([,match])=>match.test(row.Nomcultivo));
        if(row.Anio!==String(year) || row.Nomunidad!=='Tonelada' || !crop)continue;
        const state=STATE_NAMES[Number(row.Idestado)-1],value=number(row.Volumenproduccion);
        if(!state || value===null || value<0)continue;
        const key=['Idestado','Idddr','Idcader','Idmunicipio','Idciclo','Idmodalidad','Idcultivo','Idunidadmedida'].map(key=>row[key]).join('|');
        if(seen.has(key))throw Error('Producción municipal duplicada; se requiere revisión');seen.add(key);
        if(!states.has(state))states.set(state,{state,corn:null,wheat:null,sorghum:null,soy:null});
        const target=states.get(state);target[crop[0]]=(target[crop[0]] ?? 0)+value;
    }
    if(!states.size)throw Error('Sin producción del año solicitado');
    return STATE_NAMES.map(state=>states.get(state) || {state,corn:null,wheat:null,sorghum:null,soy:null}).map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,typeof value==='number' ? Number(value.toFixed(2)) : value])));
}
function cleanSniimName(value) {
    return String(value).replace(/Michoac�n/g,'Michoacán').replace(/Quer�taro/g,'Querétaro').replace(/Yucat�n/g,'Yucatán').replace(/M�xico/g,'México').replace(/Nuevo Le�n/g,'Nuevo León').replace(/San Luis Potos�/g,'San Luis Potosí');
}
function parseSniimAnnual(html,year,meta) {
    if(!new RegExp('Registros del A.o '+year).test(textOnly(html)) || !new RegExp(meta.match,'i').test(textOnly(html)))throw Error('Producto o año SNIIM no coincide');
    const references=[];
    for(const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells=[...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell=>textOnly(cell[1]).trim());
        if(cells.length<13 || /N\s*A\s*C\s*I\s*O\s*N\s*A\s*L/i.test(cells[0]))continue;
        // The source identifies distribution centres, not necessarily states.
        const series=cells.slice(1,13).flatMap((cell,index)=>number(cell)>0 ? [{date:year+'-'+String(index+1).padStart(2,'0')+'-01',value:number(cell)}] : []);
        if(!series.length || !cells[0])continue;
        const place=cleanSniimName(cells[0]);
        references.push({...meta,id:meta.id+'-'+year+'-'+references.length,label:meta.label+' · '+place,market:'México · '+place,series});
    }
    return references;
}
async function loadAnnualData({get=externalGet,onProgress=()=>{},previous=null,timeoutMs=12000}={}) {
    const jobs=[],references=[],production={},errors=[];
    const read=async(url,json=true,timeout=timeoutMs,accept)=>{const response=await get(url,{Accept:accept || (json ? 'application/json' : 'text/plain')},timeout);if(!response.ok)throw Error('Fuente histórica no disponible');return json ? response.json() : response.text();};
    const add=(meta,load)=>jobs.push(async()=>{try {const series=await load();references.push({...meta,series,retrievedAt:new Date().toISOString()});} catch {const prior=previous?.references?.find(item=>item.id===meta.id && item.unit===meta.unit);references.push({...meta,series:prior?.series || [],...(prior ? {retrievedAt:prior.retrievedAt,preserved:true} : {})});errors.push(meta.label);}});
    const yahoo=meta=>{
        const symbol=meta.symbol || meta.ticker,url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?interval=1d&period1='+Date.parse(START)/1000+'&period2='+Date.parse(END)/1000;
        add({...meta,url:'https://finance.yahoo.com/quote/'+encodeURIComponent(symbol)+'/history/',source:'Yahoo Finance · historia de cierres',cadence:'daily'},async()=>parseAnnualYahoo(await read(url),meta));
    };
    for(const item of equities) {const meta={...item,bucket:'equities',unit:'puntos',kind:item.kind==='volatility' ? 'volatility' : 'price'};if(item.provider==='moex')add({...meta,source:'Moscow Exchange · índice IMOEX oficial',url:'https://www.moex.com/ru/indices',cadence:'daily'},async()=>historicalPoints((await loadMoex(item,{get,cutoff:'2025-12-31T23:59:59Z',start:START,end:'2025-12-31',timeoutMs})).series));else if(item.symbol)yahoo(meta);else references.push({...meta,series:[],source:'Catálogo de bolsas',url:''});}
    for(const item of currencies)yahoo({...item,id:'FX-'+item.code,label:'USD/'+item.code+' · '+item.name,bucket:'fx',kind:'price',unit:item.code+' por 1 USD',currency:item.code,market:item.name,region:'Divisas'});
    for(const item of commodities) {
        const meta={...item,id:'FUT-'+item.ticker,kind:'price'};
        if(item.provider==='yahoo')yahoo(meta);
        else add({...meta,cadence:'daily',source:'Sina Finance · historia de futuros chinos',url:'https://finance.sina.com.cn/futures/quotes/'+item.ticker+'.shtml'},async()=>{
            const rows=await read('https://stock2.finance.sina.com.cn/futures/api/json.php/InnerFuturesNewService.getDailyKLine?symbol='+item.ticker);
            return historicalPoints(Array.isArray(rows) ? rows.map(row=>({date:row.d,value:number(row.c)})) : []);
        });
    }
    for(const item of eiaMarkets)add({...item,id:'SPOT-'+item.ticker},async()=>historicalPoints(parseEiaPrices(await read(item.url,false),item,'2025-12-31T23:59:59Z').series));
    for(const item of proteins.filter(item=>item.provider==='rnm'))add({...item,id:'HIST-'+item.ticker,bucket:'proteins',kind:'price',source:'FranceAgriMer–RNM · historial físico',url:'https://rnm.franceagrimer.fr/prix?LIBCOD='+item.id},async()=>{
        const latest=await read('https://rnm.franceagrimer.fr/prix?LIBCOD='+item.id,false),market=latest.match(/name="H" value="(\d+)"/)?.[1];
        if(!market)throw Error('Mercado RNM histórico no identificado');
        return parseRnmHistory(await queryRnmHistory(market,item.id),item);
    });
    for(const item of [
        {symbol:'APU0000FF1101',label:'Pechuga de pollo deshuesada · EE. UU.',unit:'USD/lb'},
        {symbol:'APU0000708111',label:'Huevo grado A grande · EE. UU.',unit:'USD/docena'},
        {symbol:'APU0000703112',label:'Carne molida de res 100 % · EE. UU.',unit:'USD/lb'},
        {symbol:'APU0000FD3101',label:'Chuletas de cerdo · EE. UU.',unit:'USD/lb'},
    ])add({...item,id:item.symbol,kind:'price',bucket:'proteins',region:'América',market:'Estados Unidos · venta minorista',cadence:'monthly',source:'BLS · Average Price Data',url:'https://data.bls.gov/timeseries/'+item.symbol},async()=>parseBls(await read('https://api.bls.gov/publicAPI/v2/timeseries/data/'+item.symbol+'?startyear=2021&endyear=2025'),item));
    // Monthly sovereign yields are levels, not bond investment returns.
    for(const [provider,url] of [['oecd','https://sdmx.oecd.org/public/rest/v1/data/OECD.SDD.STES,DSD_STES@DF_FINMARK,4.0/.M.IRLT.PA.....?startPeriod=2021-12&endPeriod=2025-12&dimensionAtObservation=AllDimensions'],['ecb','https://data-api.ecb.europa.eu/service/data/IRS/M..L.L40.CI.0000..N.Z?format=csvdata&startPeriod=2021-12&endPeriod=2025-12']])jobs.push(async()=>{
        try {for(const quote of parseGlobalCsv(await read(url,false,25000,'text/csv'),provider,'2026-01-01',{historyLimit:65}))references.push({...quote,id:quote.id+'-'+provider,bucket:'bonds',unit:'%',kind:'yield',series:quote.series.map(point=>({...point,date:point.date+'-01'}))});}catch {errors.push('Bonos internacionales · '+provider);}
    });
    for(const year of [2021,...library.years])jobs.push(async()=>{
        try {const url='https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value='+year;for(const quote of parseTreasuryXml(await read(url,false),'2026-01-01'))references.push({...quote,id:quote.id+'-'+year,bucket:'bonds',kind:'yield',unit:'%',series:historicalPoints(quote.series),url,source:'U.S. Treasury · par yield curve'});}catch {errors.push('Treasury · '+year);}
    });
    if(process.env.BANXICO_TOKEN)jobs.push(async()=>{
        try{const items=require('../../shared/report-bond-markets.json').markets.filter(item=>item.seriesId),url='https://www.banxico.org.mx/SieAPIRest/service/v1/series/'+items.map(item=>item.seriesId).join(',')+'/datos/2021-12-01/2025-12-31',response=await get(url,{'Bmx-Token':process.env.BANXICO_TOKEN},timeoutMs);if(!response.ok)throw Error('Banxico no disponible');for(const quote of parseBanxicoSeries(await response.json(),'2026-01-01'))references.push({...quote,bucket:'bonds',kind:'yield',unit:'%'});}catch {errors.push('Banxico · CETES históricos');}
    });
    const macro=[['NY.GDP.MKTP.KD.ZG','Crecimiento real del PIB','%'],['FP.CPI.TOTL.ZG','Inflación de precios al consumidor','% anual'],['SL.UEM.TOTL.ZS','Desempleo','%'],['NE.TRD.GNFS.ZS','Comercio exterior / PIB','% del PIB']];
    for(const [code,label,unit] of macro)jobs.push(async()=>{
        try{const payload=await read('https://api.worldbank.org/v2/country/WLD;MEX;USA;BRA;CHN;JPN;IND;DEU;GBR;FRA;ZAF;AUS;CAN;ESP;KOR/indicator/'+code+'?format=json&per_page=2000&date=2022:2025');const groups=new Map();for(const row of payload?.[1] || []){if(row.indicator?.id!==code || !Number.isFinite(row.value) || !library.years.includes(Number(row.date)))continue;const id=code+'-'+row.countryiso3code;if(!groups.has(id))groups.set(id,{id,indicator:code,bucket:'macro',kind:'indicator',unit,label:label+' · '+row.country.value,market:row.country.value,country:row.countryiso3code,cadence:'annual',source:'Banco Mundial · WDI',url:'https://data.worldbank.org/indicator/'+code+'?locations='+row.countryiso3code,series:[]});groups.get(id).series.push({date:row.date+'-12-31',value:row.value});}references.push(...groups.values());}catch {errors.push('Banco Mundial · '+label);}
    });
    for(const year of library.years)jobs.push(async()=>{
        const url='https://nube.agricultura.gob.mx/index.php?view=10AE434F-A2158368-A120BC5A-EDF4AFAA&ANIO='+year;
        try {production[year]={rows:parseCropProduction(await read(url,false,25000),year),source:'DGSIAP · cierre agrícola '+year,url};}catch {if(previous?.production?.[year])production[year]=previous.production[year];errors.push('DGSIAP · '+year);}
    });
    // State-level monthly reports, with native product codes from SNIIM.
    for(const year of [2021,...library.years])for(const [code,label,match,unit] of [['AVEPOLENT','Pollo entero','Pollo Entero','MXN/kg'],['BOVPIETOR','Toro en pie','Toro','MXN/kg vivo'],['PORPIESUP','Cerdo supremo en pie','Supremo','MXN/kg vivo'],['HUEHUEBLA','Huevo blanco','Huevo Blanco','MXN/kg']])jobs.push(async()=>{
        const url='https://www.economia-sniim.gob.mx/CuadroAnualConsPec.asp?anio='+year+'&per=M&prod='+code+'&xedo=S',meta={id:'SNIIM-'+code,bucket:'mx_proteins',kind:'price',cadence:'monthly',label,match,unit,stateLevel:true,source:'SNIIM · historia mensual por entidad',url,region:'México'};
        try {references.push(...parseSniimAnnual(await read(url,false),year,meta));}catch {errors.push('SNIIM · '+label+' · '+year);}
    });
    let cursor=0,completed=0;await Promise.all(Array.from({length:6},async()=>{while(cursor<jobs.length){const job=jobs[cursor++];await job();onProgress(++completed,jobs.length);}}));
    // Merge years only for the same native identifier, method and unit.
    const merged=new Map();
    for(const quote of references){const id=(quote.bucket==='mx_proteins' ? quote.label : quote.id.replace(/-(2021|2022|2023|2024|2025)$/,''))+'|'+quote.unit+'|'+quote.source;if(!merged.has(id))merged.set(id,{...quote,series:[]});merged.get(id).series.push(...quote.series);}
    return {schemaVersion:library.version,generatedAt:new Date().toISOString(),references:[...merged.values()].map(quote=>({...quote,series:historicalPoints(quote.series)})),production,errors};
}
module.exports={loadAnnualData,parseAnnualYahoo,parseBls,parseRnmHistory,parseCropProduction,parseSniimAnnual,STATE_NAMES,cleanSniimName};
