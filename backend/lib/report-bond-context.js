'use strict';
const {externalGet}=require('./http');
const {reportDeadline}=require('./report-deadline');
const {BOND_CONTEXT,compactBondPoints,bondPoints,bondMonthBefore}=require('../../shared/report-bond-evidence.mjs');
const {loadPrimaryNews}=require('./report-primary-news');
const {parseCatalystRss}=require('./report-equity-context');
function parseFred(text,definition,cutoff){
    if(typeof text!=='string' || text.length>3000000 || /<html|<!doctype/i.test(text))throw Error('Serie de tasas no válida');
    const rows=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/),headers=rows.shift().split(','),column=headers.indexOf(definition.id);if(column<0 || !/date/i.test(headers[0]))throw Error('Serie no confirmada');
    return bondPoints(rows.flatMap(row=>{const cells=row.split(',');return /^-?\d+(?:\.\d+)?$/.test(cells[column] || '') ? [{date:cells[0],value:Number(cells[column])*(definition.multiplier || 1)}] : [];}),cutoff);
}
function parseNyFed(data,definition,cutoff){return bondPoints((data?.refRates || []).filter(item=>item.type===definition.id && typeof item.percentRate==='number').map(item=>({date:item.effectiveDate,value:item.percentRate})),cutoff);}
function parseBcrp(data,cutoff){
    const name=data?.config?.series?.[0]?.name || '';if(data?.config?.series?.length!==1 || !/EMBIG.*M[eé]xico.*pbs/i.test(name))throw Error('Indicador EMBIG no confirmado');
    const months={ene:'01',feb:'02',mar:'03',abr:'04',may:'05',jun:'06',jul:'07',ago:'08',set:'09',sep:'09',oct:'10',nov:'11',dic:'12'};
    return bondPoints((data.periods || []).flatMap(item=>{const match=String(item.name || '').match(/^(\d{1,2})\.?([A-Za-z]{3})\.?(\d{2}|\d{4})$/),raw=item.values?.[0];if(!match || !months[match[2].toLowerCase()] || !/^-?\d+(?:\.\d+)?$/.test(raw || ''))return [];return [{date:(match[3].length===2 ? '20'+match[3] : match[3])+'-'+months[match[2].toLowerCase()]+'-'+match[1].padStart(2,'0'),value:Number(raw)}];}),cutoff);
}
function parseFundingBanxico(data,definition,cutoff){
    const item=data?.bmx?.series?.find(item=>item.idSerie===definition.id),title=String(item?.titulo || '');
    if(!/TIIE/i.test(title) || !new RegExp(definition.match==='fondeo' ? 'fondeo' : '\\b28\\b','i').test(title))return [];
    return bondPoints((item.datos || []).flatMap(point=>{const date=point.fecha?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return date && /^-?\d+(?:\.\d+)?$/.test(point.dato || '') ? [{date:date[3]+'-'+date[2]+'-'+date[1],value:Number(point.dato)}] : [];}),cutoff);
}
function parseBanxicoPublic(html,cutoff){
    if(typeof html!=='string' || html.length>1000000 || !/TIIE de fondeo/.test(html))throw Error('Publicación de tasas no confirmada');
    return BOND_CONTEXT.filter(item=>item.provider==='banxico').flatMap(definition=>{const date=html.match(new RegExp('id="fecha'+definition.id+'"[^>]*>\\s*(\\d{2})/(\\d{2})/(\\d{4})')),raw=html.match(new RegExp('id="td'+definition.id+'"[^>]*>\\s*(-?\\d+(?:\\.\\d+)?)\\s*<'));
        const points=date && raw ? bondPoints([{date:date[3]+'-'+date[2]+'-'+date[1],value:Number(raw[1])}],cutoff) : [];
        return points.length ? [{...definition,market:'México',cadence:'daily',basis:'official-reference',source:'Banco de México · publicación pública de tasas',url:'https://www.banxico.org.mx/tipcamb/llenarTasasInteresAction.do?idioma=sp',series:points}] : [];
    });
}
async function readPublic(url,headers={},timeoutMs=8000){
    const target=new URL(url);if(!['fred.stlouisfed.org','markets.newyorkfed.org','www.banxico.org.mx','estadisticas.bcrp.gob.pe'].includes(target.hostname) || target.protocol!=='https:' || target.username || target.password || target.port)throw Error('Fuente de tasas no autorizada');
    const response=await fetch(url,{headers:{'User-Agent':'VALLNews/1.0',...headers},redirect:'error',signal:AbortSignal.timeout(timeoutMs)}),reader=response.body?.getReader(),chunks=[];let bytes=0;
    if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>3000000)throw Error('Serie demasiado grande');chunks.push(Buffer.from(value));}}catch(error){await reader.cancel().catch(()=>{});throw error;}
    const body=Buffer.concat(chunks).toString('utf8');return {ok:response.ok,status:response.status,text:async()=>body,json:async()=>JSON.parse(body)};
}
async function loadBondContext({get=externalGet,cutoff,previous=[],token=process.env.BANXICO_TOKEN,timeoutMs=8500}={}){
    const request=get===externalGet ? readPublic : get;
    const publicMexico=(async()=>{try{
        const url='https://www.banxico.org.mx/tipcamb/llenarTasasInteresAction.do?idioma=sp',response=await request(url,{Accept:'text/html'},timeoutMs),current=response.ok ? parseBanxicoPublic(await response.text(),cutoff) : [],deadline=Date.now()+timeoutMs;
        const weekday=date=>{const value=new Date(date+'T00:00:00Z');while([0,6].includes(value.getUTCDay()))value.setUTCDate(value.getUTCDate()-1);return value.toISOString().slice(0,10);};
        const query=async(definition,target)=>{for(let offset=0;offset<=7 && Date.now()<deadline;offset++){const date=weekday(new Date(Date.parse(target)-offset*86400000).toISOString().slice(0,10)),formatted=date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4),endpoint='https://www.banxico.org.mx/tipcamb/datosieajax?'+new URLSearchParams({accion:'dato',idSeries:definition.id,decimales:'4',fecha:formatted});try{const result=await request(endpoint,{Accept:'application/json'},Math.max(1,Math.min(4000,deadline-Date.now()))),data=result.ok ? await result.json() : null,raw=data?.header?.exito===true && data.body?.length===1 && data.body[0].exito===true ? data.body[0].mensaje : null;if(typeof raw==='string' && /^-?\d+(?:\.\d+)?$/.test(raw))return {date,value:Number(raw)};}catch{/* Try an earlier published business day only. */}}return null;};
        return await Promise.all(BOND_CONTEXT.filter(item=>item.provider==='banxico').map(async definition=>{
            const seed=current.find(item=>item.id===definition.id),last=seed?.series.at(-1) || await query(definition,cutoff.slice(0,10));if(!last)return null;
            const targets=[new Date(Date.parse(last.date)-86400000).toISOString().slice(0,10),new Date(Date.parse(last.date)-7*86400000).toISOString().slice(0,10),bondMonthBefore(last.date,1),bondMonthBefore(last.date,12),'2020-12-31'],prior=previous.find(item=>item.id===definition.id),points=bondPoints([...(prior?.series || prior?.points || []),last],cutoff);
            for(const target of targets){const value=await query(definition,target);if(value)points.push(value);}
            // Backfill actual monthly closes once, then reuse them on refresh.
            // Four workers per series, all requests share the same deadline.
            const pending=[];for(let year=2020;year<=Number(last.date.slice(0,4));year++)for(let month=0;month<12;month++){
                const target=new Date(Date.UTC(year,month+1,0)).toISOString().slice(0,10);
                if(target>=last.date)continue;
                const observed=points.find(point=>point.date.slice(0,7)===target.slice(0,7) && Date.parse(weekday(target))-Date.parse(point.date)<=7*86400000);
                if(!observed)pending.push(target);
            }
            let cursor=0;await Promise.all(Array.from({length:4},async()=>{while(cursor<pending.length && Date.now()<deadline){const target=pending[cursor++],value=await query(definition,target);if(value)points.push(value);}}));
            return {...definition,market:'México',cadence:'daily',basis:'official-reference',source:'Banco de México · consulta pública de tasas',url,series:bondPoints(points,cutoff)};
        })).then(items=>items.filter(Boolean));
    }catch{return [];}})();
    const collected=await Promise.all(BOND_CONTEXT.map(async definition=>{
        let points=[],source='',url='';
        try{await reportDeadline(async()=>{
            if(definition.provider==='nyfed'){url='https://markets.newyorkfed.org/api/rates/'+definition.path+'/search.json?startDate=2020-01-01&endDate='+cutoff.slice(0,10);const response=await request(url,{Accept:'application/json'},timeoutMs);if(response.ok)points=parseNyFed(await response.json(),definition,cutoff);source='Reserva Federal de Nueva York';}
            else if(definition.provider==='banxico'){if(!token)return;url='https://www.banxico.org.mx/SieAPIRest/service/v1/series/'+definition.id+'/datos/2020-01-01/'+cutoff.slice(0,10);const response=await request(url,{'Bmx-Token':token,Accept:'application/json'},timeoutMs);if(response.ok)points=parseFundingBanxico(await response.json(),definition,cutoff);source='Banco de México · SIE';url='https://www.banxico.org.mx/SieInternet/';}
            else if(definition.provider==='bcrp'){url='https://estadisticas.bcrp.gob.pe/estadisticas/series/api/'+definition.id+'/json/2020-01-01/'+cutoff.slice(0,10)+'/esp';const response=await request(url,{Accept:'application/json'},timeoutMs);if(response.ok)points=parseBcrp(await response.json(),cutoff);source='BCRP · spread EMBIG México';url='https://estadisticas.bcrp.gob.pe/estadisticas/series/diarias/resultados/'+definition.id+'/html';}
            else{url='https://fred.stlouisfed.org/graph/fredgraph.csv?id='+definition.id+'&cosd=2020-01-01&coed='+cutoff.slice(0,10);const response=await request(url,{Accept:'text/csv'},timeoutMs);if(response.ok)points=parseFred(await response.text(),definition,cutoff);source=definition.role==='credit' ? 'ICE BofA · OAS / FRED' : 'Reserva Federal · FRED';url='https://fred.stlouisfed.org/series/'+definition.id;}
        },timeoutMs);}catch{/* Retain dated evidence without inventing levels. */}
        const prior=previous.find(item=>item.id===definition.id);if(!points.length && prior){points=prior.series || prior.points || [];source=prior.source;url=prior.url;}
        points=compactBondPoints(points,cutoff);return points.length ? {...definition,market:definition.market || (definition.currency==='MXN' ? 'México' : 'Estados Unidos'),cadence:'daily',basis:definition.role==='credit' ? 'oas-bp' : 'official-reference',source,url,series:points,value:points.at(-1).value} : null;
    }));
    for(const item of await publicMexico){const index=collected.findIndex(quote=>quote?.id===item.id),prior=previous.find(quote=>quote.id===item.id),existing=index>=0 ? collected[index] : null;const points=compactBondPoints([...(existing?.series || prior?.series || prior?.points || []),...item.series],cutoff);if(!points.length)continue;const value={...item,series:points,value:points.at(-1).value};if(index>=0)collected[index]=value;else collected.push(value);}
    return collected.filter(Boolean);
}
async function loadBondNews({cutoff=new Date().toISOString(),previous=[],sessionEnd}={}){
    const session=new Date(sessionEnd || Date.parse(cutoff)-86400000);while([0,6].includes(session.getUTCDay()))session.setUTCDate(session.getUTCDate()-1);
    const phrase=new Intl.DateTimeFormat('es',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(session),rss=(async()=>{try{const response=await externalGet('https://www.bing.com/news/search?'+new URLSearchParams({q:'bonos Treasury rendimientos Fed '+phrase,format:'rss',mkt:'es-MX',setlang:'es-mx',cc:'mx'}),{},4000);return response.ok ? parseCatalystRss(await response.text(),'Bonos',cutoff) : [];}catch{return [];}})();
    const [articles,catalysts]=await Promise.all([loadPrimaryNews({area:'finance',cutoff,daily:false}),rss]),seen=new Set();return [...catalysts,...articles,...previous].filter(item=>{const time=Date.parse(item.publishedAt);if(!Number.isFinite(time) || time>Date.parse(cutoff) || Date.parse(cutoff)-time>7*86400000 || !/fed\b|fomc|banxico|treasur|inflaci|inflation|subasta|yield|empleo|payroll/i.test(item.title+' '+item.description) || seen.has(item.url))return false;seen.add(item.url);return true;}).slice(0,12);
}
module.exports={loadBondContext,loadBondNews,parseFred,parseNyFed,parseFundingBanxico,parseBanxicoPublic,parseBcrp};
