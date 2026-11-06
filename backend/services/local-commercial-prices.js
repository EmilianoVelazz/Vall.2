'use strict';
const {fetchPublicPage,textOnly}=require('./mercolleida-public');
const {normalizeForIntent}=require('../ai/conversation-context');
const {stateFromMarket,requestedMexicoStates}=require('./mexico-price-scope');
const PROF='https://qqp.profeco.gob.mx';
const DSPC='https://dspc.mx/productos';
const NAMES={pork:'Cerdo',poultry:'Pollo',eggs:'Huevo',beef:'Res'};
const TERMS={pork:'chuleta',poultry:'pechuga',eggs:'huevo',beef:'bistec'};
// INEGI prefixes used by the public QQP city catalogue; observations also verify entidad.
const STATE_CODES=['AGS','BCN','BCS','CAM','COA','COL','CHP','CHH','CMX','DUR','GUA','GRO','HID','JAL','MEX','MIC','MOR','NAY','NLE','OAX','PUE','QUE','ROO','SLP','SIN','SON','TAB','TAM','TLA','VER','YUC','ZAC'];
const clean=value=>textOnly(value).replace(/[|\r\n]/g,' ').slice(0,280);
function validDate(value) {return /^\d{4}-\d{2}-\d{2}$/.test(value||'') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;}
function amount(value) {
    const text=String(value??'').replace(/[$\s]/g,'');
    if(text.includes(',') && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text)) return null;
    const numeric=text.replace(/,/g,'');
    return /^\d+(?:\.\d+)?$/.test(numeric) && Number(numeric)>0 && Number.isFinite(Number(numeric)) ? Number(numeric) : null;
}
function unitFrom(product) {
    const text=normalizeForIntent(product);
    if (/\b1\s*kg\b/.test(text)) return 'MXN/kg';
    const pack=text.match(/\bpaquete con\s+(\d{1,3})\b/);
    if(pack && Number(pack[1])>0) return `MXN/paquete de ${Number(pack[1])} huevos`;
    return null;
}
function parseProfeco(payload,id,url,period,today) {
    const types={poultry:/^pechuga$/,beef:/^bistec del [07]$/,pork:/^chuleta$/,eggs:/^huevo$/};
    const rows=Array.isArray(payload?.data?.productos) ? payload.data.productos : [];
    const candidates=[];
    for(const row of rows) {
        const state=stateFromMarket(row.entidad),date=row.fecha_observacion,value=amount(row.precio),unit=unitFrom(row.producto);
        if (!state || !types[id]?.test(normalizeForIntent(row.tipo_producto)) || !validDate(date) || date>today || date<period.start || date>period.end
            || value===null || !unit || !row.establecimiento || !row.municipio) continue;
        candidates.push({product:NAMES[id],productId:id,country:'México',countryCode:'MX',stateCode:state.code,
            market:clean(`${row.municipio}, ${row.entidad} · ${row.establecimiento}`),category:clean(row.producto),
            commercialStage:'retail',priceBasis:id==='eggs' ? 'pieces' : 'cut',recordType:'consumer_observation',
            value,currency:'MXN',unit,date,dateBasis:'observation',frequency:'retail_observation',
            source:'PROFECO · Quién es Quién en los Precios',sourceShort:'PROFECO',sourceCode:'profeco_retail_prices',url,
            basis:'Precio al público por presentación y establecimiento, con fecha de levantamiento; no mayoreo ni promedio estatal',verified:true});
    }
    return latestUnique(candidates);
}
function latestUnique(records) {
    records.sort((a,b)=>b.date.localeCompare(a.date));const latest=new Map();
    for(const record of records) {
        const key=JSON.stringify([record.productId,record.category,record.market,record.unit]);
        const previous=latest.get(key);
        if(!previous) latest.set(key,{record,conflict:false});
        else if(previous.record.date===record.date && previous.record.value!==record.value) previous.conflict=true;
    }
    return [...latest.values()].filter(entry=>!entry.conflict).map(entry=>entry.record);
}
function parseDspc(html,period,today) {
    if (!/Catalogo de mayoreo|Catálogo de mayoreo/i.test(textOnly(html)) || !/Puebla/.test(textOnly(html))) return [];
    const stamp=String(html).match(/<time\b[^>]*id="sello-sync"[^>]*datetime="([^"]+)"/)?.[1];
    const date=validDate(stamp?.slice(0,10)) && Number.isFinite(Date.parse(stamp)) ? stamp.slice(0,10) : null;
    if(!date || date>today || date<period.start || date>period.end) return [];
    const records=[];
    for(const section of String(html).matchAll(/<tbody\b[^>]*data-seccion="(res|pollo|cerdo)"[^>]*>([\s\S]*?)<\/tbody>/gi)) {
        const id={res:'beef',pollo:'poultry',cerdo:'pork'}[section[1].toLowerCase()];
        for(const row of section[2].matchAll(/<tr\b[^>]*data-producto="[^"]+"[^>]*>([\s\S]*?)<\/tr>/gi)) {
            const cells=[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell=>cell[1]);
            const link=cells[0]?.match(/<a\b[^>]*href="(\/productos\/[a-z\d-]+)"[^>]*>([\s\S]*?)<\/a>/i);
            const value=amount(textOnly(cells[2]));
            if(!link || textOnly(cells[1])!=='kg' || value===null || /borrego|mixt[ao]/i.test(textOnly(cells[0]))) continue;
            const base={product:NAMES[id],productId:id,country:'México',countryCode:'MX',stateCode:'PUE',
                market:'DSPC · San Pedro Cholula, Puebla',category:clean(link[2]),commercialStage:'wholesale',priceBasis:'cut',recordType:'supplier_listing',
                value,currency:'MXN',unit:'MXN/kg',date,dateBasis:'catalog_update',catalogUpdatedAt:stamp,
                source:'DSPC · catálogo público de mayoreo',sourceShort:'DSPC',sourceCode:'dspc_wholesale_prices',url:new URL(link[1],DSPC).href,
                frequency:'catalog_snapshot',basis:'Precio de lista de un proveedor; entrega anunciada en Puebla/Cholula/Cuautlancingo, sujeto a confirmación y flete; no canal ni promedio estatal',verified:true};
            records.push(base);
            const tier=textOnly(cells[5]).match(/^Desde\s+(\d+(?:\.\d+)?)\s+kg\s*[·:]\s*\$([\d,.]+)$/i);
            if(tier && amount(tier[1]) && amount(tier[2])) records.push({...base,value:amount(tier[2]),minOrderKg:Number(tier[1]),category:`${base.category} · desde ${tier[1]} kg`});
        }
    }
    return latestUnique(records);
}
function eligible(profile) {
    return profile.countries.includes('MX') && !profile.futures && !profile.priceSource
        && !['live','carcass','farm'].includes(profile.priceBasis);
}
function commercialStagesFor(value) {
    const query=normalizeForIntent(value);
    const retail=/\b(?:menudeo|(?:venta )?al publico|al detalle|minoristas?|consumidores?|supermercados?|retail)\b/.test(query);
    const wholesale=/\b(?:mayoreo|mayoristas?|wholesale)\b/.test(query);
    return /\b(?:ambos|ambas)\b/.test(query) || retail && wholesale ? ['wholesale','retail'] : retail ? ['retail'] : wholesale ? ['wholesale'] : null;
}
function requestedStages(profile) {
    if(Object.hasOwn(profile,'commercialStages')) return profile.commercialStages?.length ? profile.commercialStages : ['wholesale','retail'];
    return commercialStagesFor(profile.query) || ['wholesale','retail'];
}
function matchesPresentation(record,profile) {
    const query=normalizeForIntent(profile.presentationQuery ?? profile.query),category=normalizeForIntent(record.category);
    if(record.productId==='poultry' && /\bpollo entero\b/.test(query) && !/\bpollo entero\b/.test(category)) return false;
    const requested=[...query.matchAll(/\b(pechugas?|muslos?|lomos?|costillas?|ribeye|arrachera|bistecs?|tocino|bacon|sirloin|chuletas?)\b/g)].map(match=>match[1].replace(/s$/,''));
    if(requested.length && !requested.some(term=>category.includes(term))) return false;
    for(const term of query.matchAll(/\b(?:congelad[oa]s?|refrigerad[oa]s?|deshuesad[oa]s?|marinad[oa]s?)\b/g)) if(!category.includes(term[0].replace(/[oa]s?$/,''))) return false;
    if(profile.priceBasis==='pieces' && record.productId==='eggs') {
        if(/\bdocena\b/.test(query)) return /paquete de 12 huevos/.test(record.unit);
        const count=query.match(/\b(?:con|de)\s+(\d+)\s*(?:piezas?|huevos?)\b/);
        if(count) return record.unit===`MXN/paquete de ${count[1]} huevos`;
    }
    const variant=query.match(/\bhuevos?\s+(rojos?|blancos?|organicos?)\b/);
    if(record.productId==='eggs' && variant && !category.includes(variant[1].replace(/s$/,''))) return false;
    return true;
}
const cityKey=name=>normalizeForIntent(name)==='cdmx' ? 'ciudad de mexico' : normalizeForIntent(name);
function createLocalCommercialClient({fetchPage=fetchPublicPage,now=Date.now}={}) {
    const cache=new Map(),pending=new Map();
    async function read(url,profeco=false,deadline=null) {
        if(cache.get(url)?.expires>now()) return cache.get(url).body;
        if(!pending.has(url)) pending.set(url,(async()=>{
            // This public identifier is published in QQP's own browser bundle for public reads.
            const headers={Accept:profeco ? 'application/json' : 'text/html',...(profeco ? {Authorization:'Basic '+Buffer.from('qqpweb:qqpweb').toString('base64')} : {})};
            const remaining=deadline ? deadline-Date.now() : 6500;
            if(remaining<=0) throw Error('Se agotó el tiempo de consulta de esta fuente');
            const response=await fetchPage(url,{headers,signal:AbortSignal.timeout(Math.min(6500,remaining))});
            if(!response.ok) throw Error(`Fuente pública HTTP ${response.status}`);
            const body=await response.text();if(Buffer.byteLength(body)>1024*1024) throw Error('Fuente pública demasiado grande');
            if(cache.size>=64) cache.delete(cache.keys().next().value);
            cache.set(url,{body,expires:now()+5*60_000});return body;
        })().finally(()=>pending.delete(url)));
        return pending.get(url);
    }
    return {async get(profile,period) {
        if(!eligible(profile)) return {records:[],coverage:[]};
        const states=profile.mexicoStates || requestedMexicoStates(profile.query),stages=requestedStages(profile);
        const today=new Date(now()).toISOString().slice(0,10),coverage=[],tasks=[],deadline=Date.now()+8500;
        if(stages.includes('wholesale') && states.includes('PUE') && profile.products.some(id=>['beef','poultry','pork'].includes(id))) tasks.push((async()=>{
            let records=[],status='available';try {records=parseDspc(await read(DSPC,false,deadline),period,today);} catch {status='source_error';}
            records=records.filter(record=>matchesPresentation(record,profile));
            for(const id of profile.products.filter(id=>id!=='eggs')) coverage.push({productId:id,stateCode:'PUE',source:'DSPC',url:DSPC,stage:'wholesale',period,status:status==='source_error' ? status : records.some(record=>record.productId===id) ? 'available' : 'no_usable_records'});
            return records;
        })());
        if(stages.includes('retail')) tasks.push((async()=>{
            let cities;
            try {
                const data=JSON.parse(await read(PROF+'/api/ciudades',true,deadline));
                if(data.success===false || !Array.isArray(data?.data?.ciudades)) throw Error('Catálogo de ciudades no utilizable');
                cities=data.data.ciudades.filter(city=>/^\d{4}$/.test(String(city.clave_ciudad)) && city.ciudad);
            } catch {
                for(const state of states.length ? states : [null]) for(const id of profile.products) coverage.push({productId:id,stateCode:state,source:'PROFECO',url:PROF,stage:'retail',period,status:'source_error'});
                return [];
            }
            const wantedCities=profile.mexicoCities || [];
            const targets=cities.filter(city=>states.length ? states.includes(STATE_CODES[Number(String(city.clave_ciudad).slice(0,2))-1]) : true)
                .filter(city=>!wantedCities.length || wantedCities.some(wanted=>cityKey(city.ciudad)===cityKey(wanted.name)));
            // Sample one city per entity before taking extra cities. Never fill a
            // requested municipality with observations from a different municipality.
            const selected=[],seen=new Set();
            for(const city of targets) {
                const state=STATE_CODES[Number(String(city.clave_ciudad).slice(0,2))-1];
                if(!seen.has(state) && selected.length<4) {selected.push(city);seen.add(state);}
            }
            for(const city of targets) if(selected.length<4 && !selected.includes(city)) selected.push(city);
            const unqueried=states.filter(state=>!selected.some(city=>STATE_CODES[Number(String(city.clave_ciudad).slice(0,2))-1]===state));
            for(const state of unqueried) for(const id of profile.products) coverage.push({productId:id,stateCode:state,source:'PROFECO',url:PROF,stage:'retail',period,
                status:targets.some(city=>STATE_CODES[Number(String(city.clave_ciudad).slice(0,2))-1]===state) ? 'not_queried' : 'no_city_records'});
            const jobs=selected.flatMap(city=>profile.products.filter(id=>TERMS[id]).map(async id=>{
                const state=STATE_CODES[Number(String(city.clave_ciudad).slice(0,2))-1];
                const params=new URLSearchParams({clave_ciudad:String(city.clave_ciudad),busqueda:TERMS[id]});
                const url=PROF+'/api/precios?'+params;
                const sourceUrl=PROF+'/results?'+new URLSearchParams({city:String(city.clave_ciudad),searchTerm:TERMS[id]});
                let records=[],status='available';
                try {
                    const data=JSON.parse(await read(url,true,deadline));
                    if(data.success===false || !Array.isArray(data?.data?.productos)) throw Error('Observaciones no utilizables');
                    records=parseProfeco(data,id,sourceUrl,period,today).filter(record=>record.stateCode===state && matchesPresentation(record,profile)
                        && (!wantedCities.length || wantedCities.some(wanted=>cityKey(record.market.split(',')[0])===cityKey(wanted.name)
                            || state==='CMX' && record.stateCode==='CMX' && cityKey(wanted.name)==='ciudad de mexico')));
                } catch {status='source_error';}
                coverage.push({productId:id,stateCode:state,source:'PROFECO',url:sourceUrl,stage:'retail',period,status:status==='source_error' ? status : records.length ? 'available' : 'no_usable_records'});
                return records;
            }));
            return (await Promise.allSettled(jobs)).filter(result=>result.status==='fulfilled').flatMap(result=>result.value);
        })());
        const settled=await Promise.allSettled(tasks);
        const all=settled.filter(result=>result.status==='fulfilled').flatMap(result=>result.value).filter(record=>profile.products.includes(record.productId) && matchesPresentation(record,profile));
        const groups=new Map();
        const defaults={beef:'bistec',pork:'bistec',poultry:'pechuga'};
        const sorted=all.sort((a,b)=>Number(normalizeForIntent(b.category).includes(defaults[b.productId]||'\0'))-Number(normalizeForIntent(a.category).includes(defaults[a.productId]||'\0')) || b.date.localeCompare(a.date));
        for(const record of sorted) {
            const key=`${record.stateCode}:${record.productId}:${record.commercialStage}`;
            if(!groups.has(key)) groups.set(key,[]);
            const sample=groups.get(key);
            if(!sample.length || record.commercialStage==='wholesale' && record.minOrderKg && sample.length<2 && sample[0].url===record.url) sample.push(record);
        }
        return {records:[...groups.values()].flat(),coverage};
    }};
}
module.exports={createLocalCommercialClient,parseProfeco,parseDspc,matchesPresentation,requestedStages,commercialStagesFor};
