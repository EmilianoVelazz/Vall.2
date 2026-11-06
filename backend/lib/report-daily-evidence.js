'use strict';
const {currencies}=require('../../shared/report-fx.json');
const finite=value=>typeof value==='number' && Number.isFinite(value);
const list=value=>Array.isArray(value) ? value : [];
const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'});
function day(value) {
    const date=String(value || '');
    if(date.length>10 && !/T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(date)) return '';
    if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date.slice(0,10)).toISOString().slice(0,10)!==date.slice(0,10)) return '';
    return date.length===10 ? date : dayFormat.format(new Date(date));
}
function windowFor(generatedAt) {
    const today=day(generatedAt);
    return today ? {today,yesterday:new Date(Date.parse(today)-86400000).toISOString().slice(0,10)} : {today:'',yesterday:''};
}
// Keep dated observations, never infer the date of a provider's previousPrice.
function dailyEvidence(report) {
    const snapshot=report.sourceSnapshot || {},key=report.baseReport?.key || report.key;
    const area=report.baseReport?.collection || report.collection,positive=key==='equities' && (!area || area==='finance');
    let references=Array.isArray(report.dailyReferences) ? report.dailyReferences : null;
    if(references && report.sourceSnapshot) {
        // Old saved cuts can have an empty daily projection alongside valid raw
        // observations. Recover only missing days for the same reference/unit.
        const recovered=dailyEvidence({...report,dailyReferences:undefined});
        if(recovered?.length) {
            const byReference=new Map(recovered.map(item=>[JSON.stringify([item.label,item.unit]),item]));
            references=references.length ? references.map(item=>{
                const points=list(item?.points),present=new Set(points.filter(point=>finite(point?.value) && (!positive || point.value>0)).map(point=>day(point.date)));
                const source=byReference.get(JSON.stringify([item?.label,item?.unit]));
                return {...item,points:[...points,...list(source?.points).filter(point=>!present.has(day(point.date)))]};
            }) : recovered;
        }
    }
    if(!references && key==='fx' && (snapshot.fxHistories || snapshot.fx)) references=currencies.map(currency=>{
        const history=list(snapshot.fxHistories).find(item=>item?.symbol===currency.symbol && item.baseCurrency==='USD' && item.quoteCurrency===currency.code);
        const quote=list(snapshot.fx).find(item=>item?.code===currency.code);
        // History and spot are distinct observations. Prefer the dated history
        // when present, so an intraday spot does not overwrite a daily close.
        return {label:'USD/'+currency.code+' · '+currency.name,unit:currency.code+' por 1 USD',points:history?.series || history?.recentSeries || (quote ? [{date:quote.updatedAt,value:quote.value}] : [])};
    });
    if(!references) {
        const quotes=[...list(snapshot.equities).map(item=>({...item,unit:'puntos'})),...list(snapshot.bonds).map(item=>({...item,unit:'%'})),...list(snapshot.grains),...list(snapshot.energy),...list(snapshot.proteins),...list(snapshot.quotes)].filter(item=>item && typeof item==='object');
        if(!quotes.length && snapshot.leader) quotes.push({...snapshot.leader,unit:'puntos'});
        if(!quotes.length && snapshot.fxHistory) quotes.push({...snapshot.fxHistory,unit:'MXN por 1 USD'});
        if(quotes.length || ['equities','bonds','grains','energy','proteins','quotes'].some(key=>Array.isArray(snapshot[key]))) references=quotes.map(item=>({label:item.label || item.name,unit:item.unit || '',points:item.series || item.recentSeries || []}));
    }
    if(!references) return undefined; // Legacy/manual reports are handled by the shared view model.
    const cutoff=Date.parse(report.generatedAt);
    return references.slice(0,192).map(reference=>{
        const instants=new Map(),conflicts=new Set(),days=new Map();
        for(const point of list(reference?.points)) {
            const date=day(point?.date),timestamp=Date.parse(point?.date);
            if(!finite(point?.value) || positive && point.value<=0 || !date || timestamp>cutoff) continue;
            if(instants.has(timestamp) && instants.get(timestamp).value!==point.value) conflicts.add(timestamp);
            instants.set(timestamp,{date:point.date,value:point.value});
        }
        for(const [timestamp,point] of [...instants].sort(([a],[b])=>a-b)) if(!conflicts.has(timestamp)) days.set(day(point.date),point);
        return {label:String(reference?.label || '').slice(0,140),unit:String(reference?.unit || '').slice(0,80),points:[...days.values()].slice(-65)};
    });
}
function withDailyEvidence(report) {
    if(report?.periodType==='annual')return report;
    report=require('../../shared/report-protein-scope.mjs').scopeUsProteinReport(report);
    report={...report,...require('../../shared/report-market-analysis.mjs').focusedEvidence(report)};
    const dailyReferences=dailyEvidence(report);
    const key=report.baseReport?.key || report.key;
    if(['equities','bonds'].includes(key)) return dailyReferences ? {...report,dailyReferences} : report;
    // Same field projection as shared/report-session-evidence.mjs. The API and
    // saved copies preserve histories before the daily window is applied.
    const snapshot=report.sourceSnapshot || {},quotes=[...list(snapshot.grains),...list(snapshot.energy),...list(snapshot.proteins),...list(snapshot.quotes)];
    if(snapshot.leader) quotes.push({...snapshot.leader,unit:'puntos'});
    const histories=list(snapshot.fxHistories);
    for(const item of histories) quotes.push({...item,label:'USD/'+item.quoteCurrency,unit:item.quoteCurrency+' por 1 USD'});
    if(!histories.length && snapshot.fxHistory) quotes.push({...snapshot.fxHistory,label:'USD/MXN',unit:'MXN por 1 USD'});
    const sessionObservations=report.sessionObservations || quotes.map(item=>({label:item.label || item.name || '',unit:item.unit || '',region:item.region || '',market:item.market || '',exchange:item.exchange || '',source:item.source || '',url:item.url || '',cadence:item.cadence || 'daily',category:item.category || '',basis:item.basis || '',quoteStatus:item.quoteStatus || '',points:(item.series || item.recentSeries || item.points || []).slice(-65)}));
    const sessionNews=(report.sessionNews || report.headlines || snapshot.headlines || []).slice(0,12).map(item=>({title:String(item.title || '').slice(0,500),description:String(item.description || '').slice(0,800),source:String(item.source || '').slice(0,240),publishedAt:String(item.publishedAt || '').slice(0,80),url:String(item.url || '').slice(0,1800),categoryLabel:String(item.categoryLabel || item.category || 'Otros temas').slice(0,140)}));
    const current={...report,...(dailyReferences ? {dailyReferences} : {}),...(sessionObservations.length ? {sessionObservations} : {}),...(sessionNews.length ? {sessionNews} : {})};
    const usProtein=require('../../shared/report-protein-scope.mjs').isUsProteinReport(current),globalGrains=key==='grains' && (!current.collection || current.collection==='markets');
    if((!usProtein && !globalGrains) || current.userEdition)return current;
    const model=require('../../shared/report-weekly.mjs').weeklyReport(current),data=[...(current.marketDerivatives?.options || []),...(current.marketDerivatives?.futures || [])];
    const links=[...model.references.map(item=>({label:item.source,url:item.url})),...data.map(item=>({label:item.source+' · '+item.date,url:item.url}))].filter(item=>item.url);
    if(usProtein)for(const item of [...(current.proteinFeed || []),...(current.proteinFundamentals || [])])if(item.url)links.push({label:item.source,url:item.url});
    const onlyUs=current.proteinScope==='US_ONLY';
    return {...current,title:current.personalization?.customTitle || (usProtein ? (onlyUs ? 'Mercado de proteínas · Estados Unidos' : 'Mercado de proteínas · América y panorama global') : 'Granos y forrajes · panorama mundial'),eyebrow:usProtein ? (onlyUs ? 'Estados Unidos · Precios físicos, futuros y opciones' : 'México, Latinoamérica, Estados Unidos y Canadá · Referencias globales complementarias') : 'Mercados mundiales · Granos, forrajes y derivados',summary:model.summary,objective:usProtein ? (onlyUs ? 'Revisar precios de proteínas de Estados Unidos, su última sesión comparable y las variaciones mensual, trimestral, semestral, anual y acumulada del año; conservar las observaciones históricas disponibles desde 2020.' : 'Priorizar México, Latinoamérica, Estados Unidos y Canadá, con referencias globales complementarias. Comparar sesión previa, semana, mes, trimestre, semestre y año únicamente con bases de la misma referencia, conservando moneda, unidad, etapa comercial y ambas fechas. Mantener la historia disponible desde 2020.') : 'Comparar granos y materias primas de alimentación por país, plaza y etapa comercial. Separar los cierres diarios de futuros y los precios físicos de las referencias semanales o mensuales; calcular horizontes e históricos desde 2020 únicamente con bases verificables.',sections:model.summaryPanels.slice(1).map(item=>({heading:item.heading,text:item.body})),metrics:[],tables:model.results,visuals:model.visuals,takeaways:[],watchlist:[],closing:'Cada referencia conserva producto, unidad, etapa comercial, fuente y fecha. Los futuros se distinguen de los precios físicos y los periodos sin base verificable no se estiman.',sources:[...new Set(model.references.map(item=>item.source).filter(Boolean))],sourceLinks:[...new Map(links.map(item=>[item.url,item])).values()],content:'',executiveBrief:undefined,headlines:[],sessionNews:usProtein ? sessionNews : []};
}
function withPreviousDailyEvidence(report,previous) {
    const current=dailyEvidence(report),prior=dailyEvidence(previous || {});
    if(!current || !prior) return withDailyEvidence(report);
    const references=new Map(current.map(item=>[JSON.stringify([item.label,item.unit]),{...item,points:[...item.points]}]));
    for(const item of prior) {
        const key=JSON.stringify([item.label,item.unit]);
        if(references.has(key)) {
            const target=references.get(key),dates=new Set(target.points.map(point=>day(point.date)));
            target.points.push(...item.points.filter(point=>!dates.has(day(point.date))));
        } else references.set(key,item);
    }
    // Re-filter against the new cut, rather than retaining yesterday's window.
    return withDailyEvidence({...report,dailyReferences:[...references.values()]});
}
module.exports={dailyEvidence,withDailyEvidence,withPreviousDailyEvidence,windowFor,day};
