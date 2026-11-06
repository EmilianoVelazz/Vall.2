'use strict';
const {externalGet}=require('./http');
const {readPublicDocument}=require('./report-public-document');
const {publicXlsxSheet}=require('./report-public-xlsx');
const {dailyPoints}=require('./report-observations');
const {reportDeadline}=require('./report-deadline');
const {textOnly}=require('../services/mercolleida-public');
const {DEFAULT_GRAIN_CACHE,grainIdentity,mergeGrainQuotes,readGrainCache,saveGrainCache}=require('./report-grain-cache');
const {loadFpmaGrains}=require('./report-fpma-grains');
const DAY=86400000,EU='https://api.tech.ec.europa.eu/agrifood/api/cereal/prices';
const WORLD='https://circabc.europa.eu/sd/a/bc2f8af9-c12b-41ee-b3a6-231457a0e52d/cereals-world-prices.xlsx';
const WB='https://www.worldbank.org/en/research/commodity-markets';
const AR='https://www.magyp.gob.ar/sitio/areas/ss_mercados_agropecuarios/ws/ssma/precios_fob.php';
const SA='https://derivative.co.za/safex-prices.html';
const SILO='Departure from silo - after some storage - on truck or other transport means';
const FARM='Departure from farm or from production area - on truck or other transport means';
const CUSTOMER='Deliver to first customer - silo or processing plant - on truck or other transport means';
const definitions=[
    ['ES','España','Lerida','Maíz forrajero','Feed maize',SILO,'LER'],
    ['DE','Alemania','Hamburg','Cebada forrajera','Feed barley',SILO,'HAM'],
    ['FR','Francia','Rouen','Cebada forrajera','Feed barley','Delivered to port - grain delivered to a port silo by train or truck or barge','ROU'],
    ['PL','Polonia','National Average','Maíz forrajero','Feed maize',CUSTOMER,'NATAVG'],
    ['RO','Rumanía','Muntenia','Maíz forrajero','Feed maize',SILO,'MUT'],
    ['BG','Bulgaria','Varna','Maíz forrajero','Feed maize',FARM,'VAN'],
    ['HU','Hungría','North Hungary','Maíz forrajero','Feed maize','Price at farm gate','NORHU'],
    ['IT','Italia','Milano','Maíz forrajero','Feed maize',CUSTOMER,'MIL'],
    ['AT','Austria','Wien','Maíz forrajero','Feed maize',SILO,'WIE'],
    ['DE','Alemania','Würzburg','Salvado de trigo','Wheat bran',SILO,'WUR'],
];
const stages={[SILO]:'salida de silo',[FARM]:'salida de explotación',[CUSTOMER]:'entregado al primer comprador','Price at farm gate':'puerta de explotación','Delivered to port - grain delivered to a port silo by train or truck or barge':'entregado al silo portuario'};
const euMarkets=definitions.map(([country,market,place,product,match,stage])=>({ticker:'DGAGRI-GRAIN-'+country+'-'+place+'-'+match,provider:'dgagri-grains',bucket:'grains',country,market,place,match,stage,label:product+' · '+(place==='National Average' ? 'promedio nacional' : place)+' · '+market,unit:'EUR/t',currency:'EUR',cadence:'weekly',region:'Europa',exchange:'Mercado físico',source:'Comisión Europea · DG AGRI · cereales',url:EU+'?'+new URLSearchParams({memberStateCodes:country}),basis:'Precio físico mayorista; '+stages[stage]+'; '+place+'; sin IVA. La fecha es el final de la semana de referencia.'}));
const brazilMarkets=[['corn','milho','Maíz físico · Campinas · Brasil','INDICADOR DO MILHO ESALQ/BM&FBOVESPA'],['soy','soja','Soya física · Paranaguá · Brasil','INDICADOR DA SOJA CEPEA/ESALQ - PARANAGUÁ']].map(([id,path,label,match])=>({ticker:'CEPEA-GRAIN-'+id,provider:'cepea-grains',bucket:'grains',label,match,url:'https://www.cepea.org.br/br/indicador/'+path+'.aspx',unit:'BRL/saco 60 kg',currency:'BRL',region:'América del Sur',market:'Brasil',cadence:'daily',exchange:'Mercado físico',source:'CEPEA/ESALQ–USP · indicadores de granos',basis:'Precio físico del indicador CEPEA; '+(id==='corn' ? 'Campinas, al contado' : 'Paranaguá')+'; reales por saco de 60 kg.'}));
const iso=value=>{const m=String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m ? m[3]+'-'+m[2]+'-'+m[1] : '';};
function quote(item,points,cutoff,previous=[],retrievedAt=new Date().toISOString()){
    const prior=previous.find(row=>row.ticker===item.ticker && row.provider===item.provider && row.unit===item.unit && row.basis===item.basis);
    // A successful fetch owns overlapping dates, including provider revisions.
    const current=dailyPoints(points,cutoff).filter(point=>point.value>0),dates=new Set(current.map(point=>point.date));
    const series=dailyPoints([...(prior?.series || []).filter(point=>!dates.has(point.date)),...current],cutoff).filter(point=>point.value>0 && point.date>='2020-01-01').slice(-2500),last=series.at(-1),before=series.at(-2);
    if(!last)return null;
    const daily=item.cadence==='daily',change=daily && before?.value>0 ? (last.value/before.value-1)*100 : null;
    return {...item,series,value:last.value,previous:daily ? before?.value ?? null : null,change,performance:{day:change},observedAt:last.date,retrievedAt:current.length ? retrievedAt : prior?.retrievedAt || retrievedAt,quoteStatus:current.length ? 'verified' : 'preserved'};
}
function parseEuGrains(data,cutoff,previous=[]){
    if(!Array.isArray(data) || data.length>22000)throw Error('Respuesta semanal de cereales no válida.');
    // DG AGRI also names the same delivered-port stage in French for Rouen.
    // Accept this explicit alias only for French feed barley at that market.
    const sameStage=(item,row)=>row.stageName===item.stage || item.country==='FR' && item.place==='Rouen' && item.match==='Feed barley' && row.stageName==='Rendu Port - Delivered';
    return euMarkets.map(item=>quote(item,data.filter(row=>row.memberStateCode===item.country && row.productName===item.match && row.marketName===item.place && sameStage(item,row) && row.unit==='TONNES' && /^€\d+(?:[.,]\d+)?$/.test(row.price) && Date.parse(iso(row.endDate))-Date.parse(iso(row.beginDate))===6*DAY && Date.parse(iso(row.referencePeriod))<=Date.parse(cutoff)).map(row=>({date:iso(row.endDate),value:Number(row.price.slice(1).replace(',','.'))})),cutoff,previous)).filter(Boolean);
}
function parseBrazilGrains(html,item,cutoff,previous=[]){
    if(typeof html!=='string' || html.length>1500000 || !html.includes(item.match) || !/Reais por saca de 60 kg/.test(textOnly(html)))throw Error('Producto o unidad CEPEA no coinciden.');
    const table=html.match(/<table\b[^>]*id="imagenet-indicador1"[^>]*>[\s\S]*?<\/table>/)?.[0] || '';
    if(!/Valor R\$/.test(textOnly(table)))throw Error('Columna en reales ausente.');
    const points=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].flatMap(row=>{
        const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(cell=>textOnly(cell[1]).trim());
        return cells.length===5 && /^\d+(?:,\d+)?$/.test(cells[1]) ? [{date:iso(cells[0]),value:Number(cells[1].replace(',','.'))}] : [];
    });
    if(!dailyPoints(points,cutoff).length)throw Error('Sin precios CEPEA fechados.');
    return quote(item,points,cutoff,previous);
}
async function parseWorldGrains(buffer,cutoff,previous=[]){
    const cover=await publicXlsxSheet(buffer,'Graphs',{maxRows:1000,maxColumns:6}),publication=cover[1]?.[4];
    if(cover[0]?.[2]!=='World export prices FOB' || !Number.isInteger(publication) || (publication-25569)*DAY>Date.parse(cutoff))throw Error('Edición mundial no publicada al corte.');
    const rows=await publicXlsxSheet(buffer,'Data',{maxRows:2000,maxColumns:30});
    if(rows[0]?.[1]!=='Wheat prices - $/ton' || rows[0]?.[10]!=='Barley prices - $/ton')throw Error('Moneda o unidad mundiales no coinciden.');
    const specs=[['Wheat - EU Rouen (grade 1)','Trigo grado 1 FOB · Rouen · Francia','Francia'],['Durum wheat - CA St Lawrence (CWAD)','Trigo duro CWAD FOB · San Lorenzo · Canadá','Canadá'],['Wheat - Ukraine (milling)','Trigo panificable FOB · Ucrania','Ucrania'],['Barley - Black Sea (feed)','Cebada forrajera FOB · mar Negro','Mar Negro · origen no desglosado']];
    return specs.map(([match,label,market])=>{
        const index=rows[1]?.indexOf(match);if(index<1 || index>11)return null;
        const item={ticker:'DGAGRI-WORLD-'+index,provider:'dgagri-world',bucket:'grains',label,market,unit:'USD/t',currency:'USD',region:market==='Canadá' ? 'América del Norte' : 'Europa y mar Negro',cadence:'weekly',source:'Comisión Europea · precios mundiales de cereales',url:WORLD,exchange:'Mercado físico · FOB',basis:'Precio físico de exportación FOB; '+match+'. Cotización semanal del miércoles; no es un cierre diario ni un precio entregado.'};
        const points=rows.slice(2).filter(row=>Number.isInteger(row[0]) && typeof row[index]==='number').map(row=>({date:new Date((row[0]-25569)*DAY).toISOString().slice(0,10),value:row[index]}));
        return quote(item,points,cutoff,previous);
    }).filter(Boolean);
}
async function parseWorldBankGrains(buffer,cutoff,url,previous=[]){
    const rows=await publicXlsxSheet(buffer,'Monthly Prices',{maxRows:2000,maxColumns:95});
    if(rows[0]?.[0]!=='World Bank Commodity Price Data (The Pink Sheet)' || !/^Updated on /.test(rows[3]?.[0]) || !Number.isFinite(Date.parse(rows[3][0].slice(11))) || Date.parse(rows[3][0].slice(11))>Date.parse(cutoff))throw Error('Edición Pink Sheet no válida.');
    const specs=[['Rice, Thai 5% ','Arroz blanco 5 % quebrado FOB · Bangkok · Tailandia','Tailandia','Bangkok'],['Rice, Viet Namese 5%','Arroz blanco 5 % quebrado FOB · Hanói · Vietnam','Vietnam','Hanói']];
    return specs.map(([match,label,market,place])=>{
        const column=rows[4]?.indexOf(match);if(column<1 || rows[5]?.[column]!=='($/mt)')return null;
        const item={ticker:'WB-GRAIN-'+market,provider:'worldbank-grains',bucket:'grains',label,market,unit:'USD/t',currency:'USD',region:'Asia',cadence:'monthly',exchange:'Mercado físico · FOB',source:'Banco Mundial · Pink Sheet · precios mensuales',url,basis:'Precio físico indicativo de exportación FOB '+place+'; arroz blanco con 5 % de quebrado; promedio mensual. La fecha identifica el final del mes observado, no una sesión diaria.'};
        return quote(item,rows.slice(6).flatMap(row=>{const m=String(row[0]).match(/^(20\d{2})M(0[1-9]|1[0-2])$/);return m && typeof row[column]==='number' ? [{date:new Date(Date.UTC(Number(m[1]),Number(m[2]),0)).toISOString().slice(0,10),value:row[column]}] : [];}),cutoff,previous);
    }).filter(Boolean);
}
function parseSouthAfricaGrains(html,cutoff,previous=[]){
    if(typeof html!=='string' || html.length>1000000 || !html.includes('SAFEX grain futures settlement prices in rand per tonne'))throw Error('Tabla SAFEX no válida.');
    const contract=textOnly(html).match(/Latest settlement[^.]*?\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2}) contract/),months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if(!contract)throw Error('Vencimiento SAFEX no identificado.');
    const expiry='20'+contract[2]+'-'+String(months.indexOf(contract[1])+1).padStart(2,'0');
    const table=html.match(/<table class="px-table">[\s\S]*?<\/table>/)?.[0] || '',rows=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(row=>({date:row[1].match(/<time datetime="(\d{4}-\d{2}-\d{2})"/)?.[1],cells:[...row[1].matchAll(/<td class="px-cell">([\s\S]*?)<\/td>/g)].map(cell=>cell[1])})).filter(row=>row.date).sort((a,b)=>b.date.localeCompare(a.date));
    return [['WMAZ','Maíz blanco'],['YMAZ','Maíz amarillo'],['WHEAT','Trigo'],['SUNS','Semilla de girasol'],['SOYA','Soya']].map(([code,product],index)=>{
        const item={ticker:'SAFEX-'+code+'-'+expiry,provider:'applied-derivatives',bucket:'grains',label:product+' SAFEX '+expiry+' · Sudáfrica',market:'Sudáfrica',unit:'ZAR/t',currency:'ZAR',region:'África',cadence:'daily',exchange:'JSE/SAFEX',source:'Applied Derivatives · liquidaciones SAFEX publicadas por el intermediario',url:SA,basis:'Futuro SAFEX con vencimiento '+expiry+'; precio de liquidación publicado por Applied Derivatives. Se conserva únicamente el tramo sin cambio de vencimiento; no es un precio físico.'};
        const points=[];
        for(const row of rows){
            const cell=row.cells[index] || '',value=textOnly(cell.match(/<span class="px">([\s\S]*?)<\/span>/)?.[1] || '').replace(/^R\s*/,'').replace(/[\s\u202f]/g,'');
            if(/^\d+(?:\.\d+)?$/.test(value))points.push({date:row.date,value:Number(value)});
            // A dash denotes a contract roll or initial row. Do not chain it.
            const change=textOnly(cell.match(/<span class="chg [^"]+">([\s\S]*?)<\/span>/)?.[1] || '').trim();
            if(!/class="chg (?:down|up|flat)"/.test(cell) || /^(?:[–—-]|&(?:ndash|mdash);|&#(?:8211|8212);|&#x201[34];)$/i.test(change))break;
        }
        return quote(item,points,cutoff,previous);
    }).filter(Boolean);
}
// Keep the published tariff position and shipment month. No averaging of grades
// or historical roll across different delivery months.
function parseArgentinaGrains(payload,requestedDate,shipment,cutoff,previous=[]){
    if(!Array.isArray(payload?.posts) || payload.posts.length>2000)throw Error('Respuesta FOB oficial no válida.');
    return [['10019900110W','Trigo pan'],['10059010120A','Maíz'],['12019000190C','Soya'],['23040010100B','Harina/pellets de soya']].map(([position,product])=>{
        const [year,month]=shipment.split('-').map(Number),target=year*12+month,rows=payload.posts.filter(row=>row.posicion===position && row.fecha?.slice(0,10)===requestedDate && Number.isInteger(row.mesDesde) && row.mesDesde>=1 && row.mesDesde<=12 && Number.isInteger(row.mesHasta) && row.mesHasta>=1 && row.mesHasta<=12 && Number.isInteger(row.añoDesde) && Number.isInteger(row.añoHasta) && row.añoDesde*12+row.mesDesde<=target && target<=row.añoHasta*12+row.mesHasta && typeof row.precio==='number' && row.precio>0);
        const values=new Set(rows.map(row=>row.precio));if(values.size!==1)return null;
        const item={ticker:'AR-FOB-'+position+'-'+shipment,provider:'sagyp-grains',bucket:'grains',label:product+' FOB '+shipment+' · Argentina',market:'Argentina',unit:'USD/t',currency:'USD',region:'América del Sur',cadence:'daily',exchange:'Referencia FOB oficial',source:'Secretaría de Agricultura de Argentina · precios FOB oficiales',url:AR+'?'+new URLSearchParams({Fecha:requestedDate.split('-').reverse().join('/')}),basis:'Precio FOB oficial, posición arancelaria '+position+'; embarque '+shipment+'. Referencia administrativa de exportación, no una oferta física ejecutable ni un futuro.'};
        return quote(item,[{date:requestedDate,value:rows[0].precio}],cutoff,previous);
    }).filter(Boolean);
}
async function loadGlobalGrainPrices({get=externalGet,read=readPublicDocument,cutoff=new Date().toISOString(),previous=[],timeoutMs=12000,cacheFile=get===externalGet && read===readPublicDocument ? DEFAULT_GRAIN_CACHE : null}={}){
    previous=mergeGrainQuotes([...await readGrainCache(cacheFile,cutoff),...previous],cutoff);
    const tasks=[],safe=(providers,operation)=>tasks.push(reportDeadline(operation,timeoutMs).catch(()=>previous.filter(item=>providers.includes(item.provider)).map(item=>quote(item,[],cutoff,previous)).filter(Boolean)));
    safe(['fpma-grains'],async()=>loadFpmaGrains({get,cutoff,timeoutMs:Math.min(timeoutMs,6000)}));
    const date=value=>value.slice(0,10).split('-').reverse().join('/');
    const json=async url=>{const response=await get(url,{Accept:'application/json'},timeoutMs);if(!response.ok)throw Error('Fuente pública no disponible.');return response.json();};
    const html=async url=>{const response=await get(url,{Accept:'text/html'},timeoutMs);if(!response.ok)throw Error('Fuente pública no disponible.');return response.text();};
    safe(['dgagri-grains'],async()=>parseEuGrains(await json(EU+'?'+new URLSearchParams({memberStateCodes:[...new Set(definitions.map(item=>item[0]))].join(','),marketCodes:definitions.map(item=>item[6]).join(','),productCodes:'MAI,ORGFOUR,SON',beginDate:'01/01/2020',endDate:date(cutoff)})),cutoff,previous));
    for(const item of brazilMarkets)safe([],async()=>[parseBrazilGrains(await html(item.url),item,cutoff,previous)].filter(Boolean));
    safe(['dgagri-world'],async()=>parseWorldGrains(await read(WORLD,{encoding:null,timeoutMs}),cutoff,previous));
    safe(['worldbank-grains'],async()=>{
        const landing=await html(WB),link=[...landing.matchAll(/https:\/\/thedocs\.worldbank\.org\/en\/doc\/[a-z\d-]+\/related\/CMO-Historical-Data-Monthly\.xlsx/g)].map(m=>m[0])[0];
        if(!link)throw Error('Enlace mensual oficial ausente.');
        return parseWorldBankGrains(await read(link,{encoding:null,timeoutMs}),cutoff,link,previous);
    });
    safe(['applied-derivatives'],async()=>parseSouthAfricaGrains(await html(SA),cutoff,previous));
    safe(['sagyp-grains'],async()=>{
        const days=Array.from({length:8},(_,index)=>new Date(Date.parse(cutoff.slice(0,10))-index*DAY)).filter(day=>![0,6].includes(day.getUTCDay())).map(day=>day.toISOString().slice(0,10));
        // Two concurrent requests, bounded retries; merge the same shipment only.
        const results=[];let cursor=0;
        await Promise.all(Array.from({length:2},async()=>{while(cursor<days.length){const day=days[cursor++];try{results.push(...parseArgentinaGrains(await json(AR+'?'+new URLSearchParams({Fecha:date(day)})),day,cutoff.slice(0,7),cutoff));}catch{/* An unpublished holiday remains absent. */}}}));
        const merged=new Map();
        for(const item of results){const prior=merged.get(item.ticker);merged.set(item.ticker,{...item,series:[...(prior?.series || []),...item.series]});}
        if(!merged.size)throw Error('Sin publicaciones FOB.');return [...merged.values()].map(item=>quote(item,item.series,cutoff,previous));
    });
    const fetched=(await Promise.all(tasks)).flat(),ids=new Set(fetched.map(grainIdentity));
    // A partial response is not evidence that the missing market disappeared.
    const result=[...fetched,...previous.filter(item=>!ids.has(grainIdentity(item))).map(item=>quote(item,[],cutoff,previous)).filter(Boolean)];
    await saveGrainCache(cacheFile,result,cutoff);
    return result;
}
module.exports={euMarkets,brazilMarkets,parseEuGrains,parseBrazilGrains,parseWorldGrains,parseWorldBankGrains,parseSouthAfricaGrains,parseArgentinaGrains,loadGlobalGrainPrices};
