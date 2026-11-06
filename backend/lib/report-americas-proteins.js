'use strict';
const {externalGet}=require('./http');
const {readPublicDocument,proteinPdfPages}=require('./report-public-document');
const {dailyPoints}=require('./report-observations');
const {matchingProteinSeries,mergeProteinSeries}=require('./report-protein-series');
const {parseMexicoPrices}=require('../services/mexico-protein-prices');
const {textOnly}=require('../services/mercolleida-public');
const clean=value=>textOnly(value).replace(/\s+/g,' ').trim();
const fold=value=>clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const iso=(year,month,day)=>{const value=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,time=Date.parse(value);return Number.isFinite(time) && new Date(time).toISOString().slice(0,10)===value ? value : '';};
const esDate=value=>{const m=fold(value).match(/(\d{1,2}) de ([a-z]+) de (\d{4})/i);return m ? iso(m[3],months.indexOf(m[2].toLowerCase())+1,m[1]) : '';};
const dmy=value=>{const m=String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m ? iso(m[3],m[2],m[1]) : '';};
const usDate=value=>{const m=String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m ? iso(m[3],m[1],m[2]) : '';};
const decimal=value=>/^\d+(?:\.\d+)?$/.test(value) && Number(value)>0 ? Number(value) : null;
const thousands=value=>/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(value) ? Number(value.replaceAll('.','')) || null : null;
const rows=html=>[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match=>[...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell=>clean(cell[1])));
const US='https://mpr.datamart.ams.usda.gov/services/v1.1/reports/';
const CA='https://accesporcqc.ca/nsphp/portail/info_prix.php';
const CL='https://www.odepa.gob.cl/precios/mejores-alimentos-de-temporada';
const AR='https://www.mercadoagroganadero.com.ar/dll/hacienda6.dll/haciinfo000225';
const CO='https://www.dane.gov.co/index.php/estadisticas-por-tema/agropecuario/sistema-de-informacion-de-precios-sipsa/mayoristas-boletin-semanal-1';
const PE='https://www.gob.pe/institucion/midagri/tema/precios-de-alimentos';
const MX='https://www.economia-sniim.gob.mx/SNIIM-Pecuarios-Nacionales/';
const definitions=[
 {ticker:'AMS-PORK-CUTOUT',provider:'ams',country:'Estados Unidos',category:'Porcino',label:'Canal porcina, cutout negociado · Estados Unidos',unit:'USD/100 lb',cadence:'daily',url:US+'2498/Cutout%20and%20Primal%20Values',report:'2498',section:'Cutout and Primal Values',field:'pork_carcass',basis:'Valor cutout de ventas negociadas de canal; no ganado vivo ni precio minorista'},
 {ticker:'AMS-BEEF-CHOICE',provider:'ams',country:'Estados Unidos',category:'Vacuno',label:'Vacuno Choice 600–900 lb, cutout · Estados Unidos',unit:'USD/100 lb',cadence:'daily',url:US+'2453/Current%20Cutout%20Values',report:'2453',section:'Current Cutout Values',field:'choice_600_900_current',basis:'Valor cutout Choice de ventas negociadas de canal de 600–900 lb; no precio del animal vivo'},
 {ticker:'QC-PORK-GLOBAL',provider:'quebec',country:'Canadá',category:'Porcino',label:'Cerdo, precio final al índice de clasificación · Québec, Canadá',unit:'CAD/100 kg',cadence:'daily',url:CA,basis:'Precio global final al índice de clasificación de Québec; no promedio nacional ni precio por kg vivo'},
 {ticker:'MX-CHICKEN-RAYON',provider:'sniim_report',country:'México',category:'Pollo',label:'Pollo entero Bachoco, origen Guanajuato · Rayón, Ciudad de México',unit:'MXN/kg',cadence:'daily',product:'poultry',path:'e_Ent.asp?prod=P01',matchMarket:'D.F. : Centro de distribución Rayón',matchCategory:'Pollo entero · Bachoco · origen Guanajuato',basis:'Precio publicado de pollo entero en centro de distribución; marca, origen y plaza fijos'},
 {ticker:'MX-PORK-AGS-MIN',provider:'sniim_report',country:'México',category:'Porcino',label:'Canal de cerdo Supremo, mínimo · Aguascalientes, México',unit:'MXN/kg',cadence:'daily',product:'pork',path:'e_Can.asp?Var=Por',matchMarket:'Ags. : Frigorífico y Empacadora de Aguascalientes',matchCategory:'Canal de cerdo · Supremo',basis:'Extremo mínimo del rango publicado de canal Supremo en frigorífico; no promedio ni precio de ganado vivo'},
 {ticker:'MX-BEEF-AGS-MIN',provider:'sniim_report',country:'México',category:'Vacuno',label:'Canal de res, toros, mínimo · Aguascalientes, México',unit:'MXN/kg',cadence:'daily',product:'beef',path:'e_Can.asp?Var=Bov',matchMarket:'Ags. : Frigorífico y Empacadora de Aguascalientes',matchCategory:'Canal de res · Toros',basis:'Extremo mínimo del rango publicado de canal de toros en frigorífico; no promedio ni precio de ganado vivo'},
 {ticker:'MX-EGG-AGS',provider:'sniim_report',country:'México',category:'Huevo',label:'Huevo blanco, mayoreo · Central de Abasto, Aguascalientes, México',unit:'MXN/kg',cadence:'weekly',product:'eggs',path:'e_Hue.asp?prod=H01&sem=0',matchMarket:'AGS: Central de Abasto de Aguascalientes',matchCategory:'Huevo blanco · mayoreo',basis:'Precio frecuente semanal de huevo blanco de mayoreo, por kilogramo; no por docena'},
 ...[{product:'Pollo Entero',category:'Pollo',label:'Pollo entero',channel:2},{product:'Pollo Pechuga',category:'Pollo',label:'Pechuga de pollo',channel:2},{product:'Huevo blanco',category:'Huevo',label:'Huevo blanco, supermercado',channel:4,egg:true},{product:'Cerdo Costillar',category:'Porcino',label:'Costillar de cerdo',channel:2},{product:'Posta Negra',category:'Vacuno',label:'Posta negra de vacuno',channel:2}].map((item,index)=>({...item,ticker:'CL-RETAIL-'+index,provider:'odepa_report',country:'Chile',label:item.label+' · Región Metropolitana, Chile',unit:item.egg ? 'CLP/docena' : 'CLP/kg',cadence:'weekly',url:CL,basis:'Precio semanal minorista de la Región Metropolitana, '+(item.egg ? 'supermercados; docena de huevo blanco' : 'canal tradicional (carnicerías); presentación indicada')+'. La fecha es el final de la semana de observación; no se usa el cambio de cuatro semanas como diario'})),
 ...['NOVILLITOS','VACAS'].map((product,index)=>({ticker:'AR-CATTLE-'+index,provider:'mag_report',country:'Argentina',category:'Vacuno',label:(index ? 'Vacas' : 'Novillitos')+' para faena · Cañuelas, Argentina',unit:'ARS/kg vivo',cadence:'daily',url:AR,product,basis:'Promedio ponderado de operaciones de ganado para faena, por kilogramo vivo; categoría indicada. Última publicación disponible, sujeta a cierre del mercado'})),
 ...['Pollo entero fresco sin vísceras','Pechuga de pollo'].map((product,index)=>({ticker:'CO-CHICKEN-'+index,provider:'dane_report',country:'Colombia',category:'Pollo',label:product+' · Paloquemao, Bogotá, Colombia',unit:'COP/kg',cadence:'weekly',url:CO,product,basis:'Precio medio semanal mayorista de la presentación indicada en Bogotá, Paloquemao. La fecha es el final de la semana; no es una variación diaria'})),
 ...[{product:'Mayorista (centros de distribucion)',label:'Pollo vivo, centros de distribución',category:'Pollo',basis:'Pollo vivo al mayorista en centros de distribución de Lima Metropolitana, por kilogramo vivo'},{product:'Consumidor (mercados minoristas)',label:'Pollo eviscerado, minorista',category:'Pollo',basis:'Pollo eviscerado al consumidor en mercados minoristas de Lima Metropolitana, por kilogramo'},{product:'Huevo rosado',label:'Huevo rosado, mercado de productores',category:'Huevo',basis:'Huevo rosado del mercado de productores de Santa Anita, por kilogramo, no por docena'}].map((item,index)=>({...item,ticker:'PE-AVES-'+index,provider:'midagri_report',country:'Perú',label:item.label+' · Lima, Perú',unit:'PEN/kg',cadence:'daily',url:PE})),
];
const markets=definitions.map(item=>({...item,bucket:'proteins',region:'América',market:item.country+' · '+(item.provider==='odepa_report' ? 'minorista regional' : 'mercado físico'),exchange:'Mercado físico',currency:item.unit.slice(0,3),url:item.url || MX+item.path,source:({ams:'USDA AMS · precios físicos',quebec:'Éleveurs de porcs du Québec',sniim_report:'SNIIM · precios pecuarios',odepa_report:'ODEPA · precios minoristas',mag_report:'Mercado Agroganadero · operaciones de hacienda',dane_report:'DANE SIPSA · precios mayoristas',midagri_report:'MIDAGRI · boletín diario de aves'})[item.provider]}));
function parseAms(data,item){
    if(data?.reportSection!==item.section || !Array.isArray(data.results))throw Error('Sección de precios estadounidense no coincide.');
    return data.results.filter(row=>String(row.slug_id)===item.report).map(row=>({date:usDate(row.report_date),value:decimal(String(row[item.field] || ''))}));
}
function parseCanada(html){
    const row=html.match(/<tr\b[^>]*>\s*<th>Prix global final[\s\S]*?<\/tr>/i)?.[0];
    if(!row || !/\$CAN\/100 kg/.test(row))throw Error('Unidad o precio de Québec no coincide.');
    return [...row.matchAll(/fjs_affiche_detail_prix\('([\d-]+)','0','GLOBAL'\)[^>]*>\$(\d+(?:\.\d+)?)</g)].map(match=>({date:match[1],value:Number(match[2])}));
}
function parseChile(html,item){
    const start=html.indexOf('Región Metropolitana'),end=html.indexOf('Región del Maule',start),section=html.slice(start,end>start ? end : undefined),plain=clean(section);
    const period=fold(plain).match(/Semana del \d{1,2} al (\d{1,2}) de ([a-z]+) de (\d{4})/i);
    if(start<0 || !period || !/Precio promedio canal tradicional/.test(plain))throw Error('Región o periodo chileno no coincide.');
    const found=rows(section).filter(row=>row[0]===item.product && row[1]===(item.egg ? 'docena' : 'kg'));
    const points=found.map(row=>({date:iso(period[3],months.indexOf(period[2])+1,period[1]),value:thousands(row[item.channel])}));
    return points;
}
function parseArgentina(html,item){
    const period=clean(html).match(/RESUMEN ESTADISTICO DE PRECIOS DESDE EL .*?(\d{2}\/\d{2}\/\d{4}) AL .*?(\d{2}\/\d{2}\/\d{4})/);
    if(!period || period[1]!==period[2] || !/HACIENDA VACUNA TIPO FAENA/.test(clean(html)))throw Error('Periodo o etapa argentina no coincide.');
    const points=[];
    for(const row of rows(html))if(row.find(Boolean)===item.product){const prices=row.filter(cell=>/^\$[\d.,]+$/.test(cell));if(prices.length<4)continue;const number=value=>Number(value.slice(1).replaceAll('.','').replace(',','.')),max=number(prices[0]),min=number(prices[1]),value=number(prices[2]);if(value>=min && value<=max)points.push({date:dmy(period[1]),value});}
    return points;
}
function parseColombia(pages,item){
    const points=[];
    for(const page of pages){const match=fold(page.text).match(/\b\d{1,2} al (\d{1,2}) de ([a-z]+) (\d{4})\b/);if(!match || !/Pesos por kilogramo/.test(page.text))continue;
        for(const column of page.columns){const at=column.findIndex(line=>fold(line)===fold(item.product));if(at<0)continue;
            for(const line of column.slice(at+1,at+9)){const row=fold(line).match(/^Bogota, D\.C\., Paloquemao\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s|$)/);if(!row)continue;const min=thousands(row[1]),max=thousands(row[2]),value=thousands(row[3]);if(min && max && value>=min && value<=max)points.push({date:iso(match[3],months.indexOf(match[2])+1,match[1]),value});}
        }
    }
    return points;
}
function parsePeru(pages,item){
    const page=pages.find(page=>/LIMA METROPOLITANA/.test(page.text) && /Precio de pollo/.test(page.text));if(!page || !/S\/ por kg/.test(page.text))throw Error('Plaza o unidad peruana no coincide.');
    const date=esDate(page.text),header=fold(page.text).match(/\b(?:lun|mar|mie|jue|vie|sab|dom)\s+(\d{1,2})\s+(?:lun|mar|mie|jue|vie|sab|dom)\s+(\d{1,2})\s+Var\./i);
    if(!date || !header || Number(header[2])!==Number(date.slice(-2)))throw Error('Fechas peruanas ambiguas.');
    const row=page.lines.find(line=>fold(line).startsWith(fold(item.product)+' '));if(!row)return [];
    const numbers=fold(row).slice(fold(item.product).length).trim().match(/^(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+[+-]?\d/);if(!numbers)return [];
    const previous=new Date(Date.parse(date)-86400000).toISOString().slice(0,10);if(Number(previous.slice(-2))!==Number(header[1]))throw Error('Comparación peruana no consecutiva.');
    return [{date:previous,value:Number(numbers[2])},{date,value:Number(numbers[3])}];
}
function finish(item,points,cutoff,previous,verified=true,url=item.url){
    const history=verified ? mergeProteinSeries(item,points,previous,cutoff) : {series:dailyPoints(points,cutoff).filter(point=>point.value>0),validatedLatest:false},series=history.series;
    if(!series.length && verified)throw Error('Sin precios fechados verificables.');
    const last=series.at(-1),prior=series.at(-2),change=item.cadence==='daily' && prior && Date.parse(last.date)-Date.parse(prior.date)<=7*86400000 ? (last.value/prior.value-1)*100 : null;
    return {...item,url,series,value:last?.value ?? null,previous:item.cadence==='daily' ? prior?.value ?? null : null,change,performance:{day:change},observedAt:last?.date || null,retrievedAt:history.validatedLatest ? new Date().toISOString() : previous?.retrievedAt || null,quoteStatus:history.validatedLatest ? 'verified' : last ? 'preserved' : 'unavailable'};
}
async function loadAmericasProteins({get=externalGet,read=readPublicDocument,cutoff=new Date().toISOString(),previous=[],timeoutMs=15000}={}){
    const cache=new Map(),today=cutoff.slice(0,10),start=new Date(Date.parse(today)-35*86400000).toISOString().slice(0,10);
    const text=url=>{if(!cache.has(url))cache.set(url,read(url,{timeoutMs,encoding:'latin1'}));return cache.get(url);};
    const json=url=>{if(!cache.has(url))cache.set(url,get(url,{Accept:'application/json'},timeoutMs).then(response=>{if(!response.ok)throw Error('Precio no disponible.');return response.json();}));return cache.get(url);};
    const utf8=url=>{if(!cache.has(url))cache.set(url,read(url,{timeoutMs}));return cache.get(url);};
    const pdf=url=>{if(!cache.has(url))cache.set(url,read(url,{timeoutMs,encoding:null}).then(proteinPdfPages));return cache.get(url);};
    let peruDocument,colombiaDocument;
    const peru=()=>peruDocument ||= (async()=>{const home=await utf8(PE),collection=[...home.matchAll(/href="([^"]+)"/g)].map(match=>match[1]).find(url=>url.includes('aves-ano-'+today.slice(0,4)));if(!collection)throw Error('Colección peruana no disponible.');const list=await utf8(new URL(collection,PE).href),reports=[...list.matchAll(/href="([^"]+informes-publicaciones\/[^"?]+)"/g)].map(match=>match[1]).filter(url=>/aves-/.test(url));for(const report of [...new Set(reports)].slice(0,2)){const html=await utf8(new URL(report,PE).href),links=[...html.matchAll(/href="(https:\/\/cdn\.www\.gob\.pe\/[^"\s]+\.pdf[^"\s]*)"/g)].map(match=>match[1].replaceAll('&amp;','&'));const dated=links.map(url=>{const m=url.match(/-(\d{2})-(\d{2})-(\d{4})\.pdf/);return {url,date:m ? iso(m[3],m[2],m[1]) : ''};}).filter(item=>item.date && item.date<=today).sort((a,b)=>b.date.localeCompare(a.date));if(dated.length)return {url:dated[0].url,pages:await pdf(dated[0].url)};}throw Error('Boletín peruano sin fecha válida.');})();
    const colombia=()=>colombiaDocument ||= (async()=>{const html=await utf8(CO),link=html.match(/href=["']([^"']*bol-SIPSASemanal-[^"']+\.pdf)["']/i)?.[1];if(!link)throw Error('Boletín colombiano no disponible.');const url=new URL(link,CO).href;if(new URL(url).hostname!=='www.dane.gov.co')throw Error('Dominio colombiano no coincide.');return {url,pages:await pdf(url)};})();
    const results=new Array(markets.length);let cursor=0;
    await Promise.all(Array.from({length:6},async()=>{while(cursor<markets.length){const index=cursor++,item=markets[index];try{
        let points=[],url=item.url;
        if(item.provider==='ams'){const date=value=>value.slice(5,7)+'/'+value.slice(8,10)+'/'+value.slice(0,4);url=item.url+'?'+new URLSearchParams({q:'report_date='+date(start)+':'+date(today)});points=parseAms(await json(url),item);}
        if(item.provider==='quebec')points=parseCanada(await text(CA));
        if(item.provider==='odepa_report')points=parseChile(await utf8(CL),item);
        if(item.provider==='mag_report'){const dates=Array.from({length:8},(_,i)=>new Date(Date.parse(today)-i*86400000)).filter(date=>![0,6].includes(date.getUTCDay())).map(date=>date.toISOString().slice(0,10));const settled=await Promise.allSettled(dates.map(date=>{const d=date.split('-').reverse().join('/');return text(AR+'?'+new URLSearchParams({txtFECHAINI:d,txtFECHAFIN:d,lisTipo:'1',LISTADO:'SI'})).then(html=>parseArgentina(html,item).filter(point=>point.date===date));}));points=settled.filter(result=>result.status==='fulfilled').flatMap(result=>result.value);}
        if(item.provider==='sniim_report'){const first=today.slice(0,8)+'01';url=MX+item.path+'&'+new URLSearchParams({RegPag:'1000',anio:today.slice(0,4),mes:today.slice(5,7),del:'01',al:today.slice(-2),destino:'0',origen:'0'});const html=await text(url);for(let day=0;day<8;day++){const end=new Date(Date.parse(today)-day*86400000).toISOString().slice(0,10);if(end<first)break;const record=parseMexicoPrices(html,item.product,url,{start:first,end},today).find(record=>fold(record.market)===fold(item.matchMarket) && fold(record.category)===fold(item.matchCategory));if(record)points.push({date:record.date,value:record.value});}}
        if(item.provider==='dane_report'){const document=await colombia();url=document.url;points=parseColombia(document.pages,item);}
        if(item.provider==='midagri_report'){const document=await peru();url=document.url;points=parsePeru(document.pages,item);}
        results[index]=finish(item,points,cutoff,previous.find(quote=>matchingProteinSeries(item,quote)),true,url);
    }catch(error){const prior=previous.find(quote=>matchingProteinSeries(item,quote));results[index]={...finish(item,prior?.series || [],cutoff,prior,false),retrievalError:String(error.message || 'Consulta no disponible').slice(0,160)};}}}));
    return results;
}
module.exports={markets,parseAms,parseCanada,parseChile,parseArgentina,parseColombia,parsePeru,loadAmericasProteins};
