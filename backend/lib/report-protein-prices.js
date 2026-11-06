'use strict';
const catalog=require('../../shared/report-protein-markets.json');
const {markets:euMarkets,parseEuProteinPrices,queryUrl}=require('./report-eu-protein-prices');
const {markets:americanMarkets,loadAmericasProteins}=require('./report-americas-proteins');
const {markets:usdaMarkets,loadUsdaProteins}=require('./report-usda-proteins');
const {matchingProteinSeries,mergeProteinSeries}=require('./report-protein-series');
const baseMarkets=[...catalog.markets,...euMarkets];
const config={...catalog,version:4,markets:[...baseMarkets,...americanMarkets,...usdaMarkets]};
const {externalGet}=require('./http');
const {dailyPoints}=require('./report-observations');
const {textOnly}=require('../services/mercolleida-public');
const {reportDeadline}=require('./report-deadline');
const sourceUrl=item=>item.url || 'https://rnm.franceagrimer.fr/prix?LIBCOD='+item.id;
const plain=value=>textOnly(value).replace(/\s+/g,' ').trim();
function rows(html) {
    return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row=>[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell=>plain(cell[1])));
}
function date(value) {
    const match=value.match(/^(\d{2})\/(\d{2})\/(\d{4}|\d{2})$/);
    if(!match)return '';
    return (match[3].length===2 ? '20'+match[3] : match[3])+'-'+match[2]+'-'+match[1];
}
function price(value,decimalComma=false) {
    const raw=decimalComma ? value.replace(',','.') : value;
    return /^\d+(?:\.\d+)?$/.test(raw) && Number(raw)>0 ? Number(raw) : null;
}
function parseProteinPrices(html,item,cutoff) {
    if(item.provider==='dgagri')return parseEuProteinPrices(html,item,cutoff);
    if(typeof html!=='string' || html.length>1500000)throw Error('Respuesta de precios no válida.');
    let table;
    if(item.provider==='cepea') {
        const title=html.indexOf(item.match),start=html.indexOf('<table id="'+item.table+'"',title);
        if(title<0 || start<0 || !/Reais por quilo|R\$\/kg/.test(plain(html)))throw Error('Producto o unidad CEPEA no coinciden.');
        table=html.slice(start,html.indexOf('</table>',start)+8);
        if(!/Valor R\$/.test(plain(table)))throw Error('Columna de precio CEPEA ausente.');
    } else {
        const heading=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '';
        if(!new RegExp(item.match,'i').test(plain(heading)) || !new RegExp('name="C" value="'+item.id+'"').test(html) || !/cours Grossistes/.test(plain(heading)) || !/&euro; HT/.test(heading) || !(item.unit.includes('100 piezas') ? /les 100 pi.ce/.test(plain(heading)) : /le kg/.test(plain(heading))))throw Error('Producto, presentación, etapa o unidad RNM no coinciden.');
        table=html.match(/<table class="tabcot"[^>]*>[\s\S]*?<\/table>/i)?.[0] || '';
        if(!/prix moyen/.test(plain(table)))throw Error('Columna de precio RNM ausente.');
    }
    const series=dailyPoints(rows(table).filter(row=>row.length===4).map(row=>{
        const value=price(row[1],item.provider==='cepea'),min=price(row[2]),max=price(row[3]);
        // RNM publishes an average without min/max for eggs. Validate any
        // available bounds, but absence of a range does not erase that average.
        return {date:date(row[0]),value:item.provider==='rnm' && (min!==null && max!==null && min>max || min!==null && value<min || max!==null && value>max) ? null : value};
    }),cutoff).slice(-65);
    if(!series.length)throw Error('Sin precios fechados verificables.');
    // Reject a daily feed that has silently become weekly; never fabricate days.
    if(item.cadence==='daily' && series.length>=4 && series.slice(-3).every((point,index)=>Date.parse(point.date)-Date.parse(series.at(-4+index).date)>=6*86400000))throw Error('La frecuencia publicada dejó de ser diaria.');
    const last=series.at(-1),previous=series.at(-2),change=item.cadence==='daily' && previous ? (last.value/previous.value-1)*100 : null;
    return {...item,bucket:'proteins',url:sourceUrl(item),source:item.provider==='cepea' ? 'CEPEA/ESALQ–USP · precios físicos de pollo' : 'FranceAgriMer–RNM · precios físicos de proteínas',series,value:last.value,previous:previous?.value ?? null,change,performance:{day:change},observedAt:last.date,retrievedAt:new Date().toISOString(),quoteStatus:'verified'};
}
async function loadProteinPrices({get=externalGet,read,cutoff=new Date().toISOString(),previous=[],timeoutMs=4500}={}) {
    const usda=reportDeadline(()=>loadUsdaProteins({read,cutoff,previous,timeoutMs:12000}),18000).catch(()=>loadUsdaProteins({read:async()=>{throw Error('Plazo agotado');},cutoff,previous}));
    const american=reportDeadline(()=>loadAmericasProteins({get,read,cutoff,previous,timeoutMs:Math.max(timeoutMs,15000)}),45000).catch(()=>loadAmericasProteins({get:async()=>{throw Error('Plazo agotado');},read:async()=>{throw Error('Plazo agotado');},cutoff,previous}));
    // Both chicken series share a single page; coalesce provider requests.
    const pages=new Map();let cursor=0;const quotes=new Array(baseMarkets.length);
    await Promise.all(Array.from({length:6},async()=>{while(cursor<baseMarkets.length){const index=cursor++,item=baseMarkets[index],url=sourceUrl(item);
        try {
            const requestUrl=item.provider==='dgagri' ? queryUrl(item,cutoff) : url;
            if(!pages.has(requestUrl))pages.set(requestUrl,reportDeadline(async()=>{const response=await get(requestUrl,{Accept:item.provider==='dgagri' ? 'application/json' : 'text/html'},timeoutMs);if(!response.ok)throw Error('Fuente no disponible.');return item.provider==='dgagri' ? response.json() : response.text();},timeoutMs));
            const parsed=parseProteinPrices(await pages.get(requestUrl),item,cutoff),prior=previous.find(quote=>matchingProteinSeries(item,quote)),history=mergeProteinSeries(item,parsed.series,prior,cutoff),last=history.series.at(-1),prev=history.series.at(-2),change=item.cadence==='daily' && prev && Date.parse(last.date)-Date.parse(prev.date)<=7*86400000 ? (last.value/prev.value-1)*100 : null;
            quotes[index]={...parsed,series:history.series,value:last.value,previous:prev?.value ?? null,change,performance:{day:change},observedAt:last.date,quoteStatus:history.validatedLatest ? 'verified' : 'preserved',retrievedAt:history.validatedLatest ? parsed.retrievedAt : prior?.retrievedAt || null};
        } catch {
            const prior=previous.find(quote=>matchingProteinSeries(item,quote));
            const series=dailyPoints(prior?.series,cutoff),last=series.at(-1),prev=series.at(-2),change=item.cadence==='daily' && prev && Date.parse(last.date)-Date.parse(prev.date)<=7*86400000 ? (last.value/prev.value-1)*100 : null;
            quotes[index]={...item,bucket:'proteins',url,source:item.source || (item.provider==='cepea' ? 'CEPEA/ESALQ–USP · precios físicos de pollo' : 'FranceAgriMer–RNM · precios físicos de proteínas'),series,value:last?.value ?? null,previous:item.cadence==='daily' ? prev?.value ?? null : null,change,performance:{day:change},observedAt:last?.date || null,retrievedAt:prior?.retrievedAt || null,quoteStatus:last ? 'preserved' : 'unavailable'};
        }
    }}));
    return [...quotes,...await american,...await usda];
}
function proteinPricesDue(report,now=Date.now()) {
    const checked=Date.parse(report?.proteinPricesCheckedAt);
    return report?.proteinCatalogVersion!==config.version || !Number.isFinite(checked) || checked>now || now-checked>=config.refreshMinutes*60000;
}
module.exports={config,sourceUrl,parseProteinPrices,loadProteinPrices,proteinPricesDue};
