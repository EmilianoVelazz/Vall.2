'use strict';
const {weeklyReport}=require('../../shared/report-weekly.mjs');
const {reportNumber}=require('./report-number-format');
const list=value=>Array.isArray(value) ? value : [];
const fold=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

function composeMorningBrief(snapshots,{now=Date.now()}={}) {
    const models=new Map(),reports=new Map();
    for(const [area,snapshot]of Object.entries(snapshots))for(const report of list(snapshot?.reports)){
        if(!Number.isFinite(Date.parse(report.generatedAt)) || Date.parse(report.generatedAt)>now)continue;
        reports.set(area+'/'+report.key,report);
    }
    const references=key=>{
        if(!models.has(key)){const report=reports.get(key);models.set(key,report ? weeklyReport(report).references || [] : []);}
        return models.get(key);
    };
    const metric=(key,label,category,reportKey,predicate,{basisPoints=false}={})=>{
        const report=reports.get(reportKey),reference=references(reportKey).find(predicate),last=reference?.last;
        const available=Number.isFinite(last?.value) && Number.isFinite(Date.parse(last.date));
        const day=available ? reference.periods?.day : null,change=Number.isFinite(day?.value) ? day.value : null;
        return {key,label,category,available,value:available ? reportNumber(last.value,4)+' '+reference.unit : 'Sin dato publicado',
            numericValue:available ? last.value : null,unit:reference?.unit || null,
            change:change===null ? 'Sin base diaria comparable' : (change>0 ? '+' : '')+reportNumber(change,3)+(basisPoints ? ' pb' : ' %'),
            numericChange:change,tone:change>0 ? 'up' : change<0 ? 'down' : 'flat',
            date:available ? last.date : null,baseDate:day?.baseDate || null,cadence:reference?.cadence || null,
            source:reference?.source || null,url:reference?.url || null,reportCut:report?.generatedAt || null};
    };
    const metrics=[
        metric('usdmxn','USD/MXN','Divisas','finance/fx',item=>item.label==='USD/MXN'),
        metric('cetes28','CETES 28 días','Tasas','finance/bonds',item=>/cetes.*28/.test(fold(item.label)),{basisPoints:true}),
        metric('treasury10','Treasury 10 años','Tasas','finance/bonds',item=>/treasury 10 anos/.test(fold(item.label)),{basisPoints:true}),
        metric('ipc','S&P/BMV IPC','Renta variable','finance/equities',item=>item.symbol==='^MXX'),
        metric('sp500','S&P 500','Renta variable','finance/equities',item=>item.symbol==='^GSPC'),
        metric('corn_cbot','Maíz CBOT','Granos','markets/grains',item=>item.symbol==='ZC=F'),
        metric('soy_cbot','Harina de soya CBOT','Granos','markets/grains',item=>item.symbol==='ZM=F'),
        metric('wti','WTI físico · Cushing','Energía','markets/energy_metals',item=>item.symbol==='EIA-WTI-SPOT'),
        metric('pork_mx','Cerdo · Aguascalientes','Proteínas','mexico/mx_proteins',item=>/cerdo|porcin/.test(fold(item.label)) && item.state==='Aguascalientes'),
        metric('egg_mx','Huevo · Ciudad de México','Proteínas','mexico/mx_proteins',item=>/huevo/.test(fold(item.label)) && item.state==='Ciudad de México'),
    ];
    if(!metrics.some(item=>item.available))throw Object.assign(Error('No hay observaciones publicadas para preparar el briefing.'),{status:503,code:'REPORT_DATA_UNAVAILABLE'});
    const byKey=Object.fromEntries(metrics.map(item=>[item.key,item]));
    const describe=key=>{const item=byKey[key];return item.available ? item.label+': '+item.value+' ('+item.date+')' : item.label+': sin dato publicado';};
    const generatedAt=new Date(Math.max(...metrics.filter(item=>item.available).map(item=>Date.parse(item.reportCut)))).toISOString();
    const actions=[
        {pillar:'Tesorería & Divisas',badge:'SEGUIMIENTO',headline:describe('usdmxn')+'.',recommendation:'Contrastar la referencia publicada con los pagos y cobros en USD y solicitar cotizaciones de cobertura para los importes y vencimientos confirmados.'},
        {pillar:'Compras de Granos & Alimento',badge:'SEGUIMIENTO',headline:describe('corn_cbot')+'. '+describe('soy_cbot')+'.',recommendation:'Comparar futuros y cotizaciones físicas conservando producto, unidad y fecha. Incorporar base comercial, flete e impuestos al costo entregado.'},
        {pillar:'Proteínas & Margen Comercial',badge:'SEGUIMIENTO',headline:describe('pork_mx')+'. '+describe('egg_mx')+'.',recommendation:'Comparar cotizaciones por plaza, presentación y fecha. Incorporar alimento y logística para calcular el margen; los precios publicados por sí solos no lo determinan.'},
    ];
    return {key:'morning_brief',collection:'overview',title:'Briefing Matutino · Inteligencia Económica y Agropecuaria',
        eyebrow:'Últimos cortes publicados · consultar fecha de cada referencia',generatedAt,
        summary:describe('usdmxn')+'. '+describe('cetes28')+'. '+describe('corn_cbot')+'.',
        metrics,actions,takeaways:[describe('usdmxn')+'. '+describe('cetes28')+'.',describe('corn_cbot')+'. '+describe('soy_cbot')+'.',describe('ipc')+'. '+describe('sp500')+'.'],
        watchlist:['Calendario de decisiones de Banxico y la Reserva Federal.','Publicaciones de oferta y demanda agrícola del USDA.','Cotizaciones vigentes de proveedores, fletes y condiciones de entrega.'],
        closing:'Cada referencia conserva la fecha, frecuencia, unidad y fuente de su publicación.'};
}

module.exports={composeMorningBrief};
