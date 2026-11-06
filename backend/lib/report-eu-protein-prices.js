'use strict';
// Public DG AGRI API. Weekly observations remain weekly; no daily interpolation.
const {dailyPoints}=require('./report-observations');
const ROOT='https://api.tech.ec.europa.eu/agrifood/api/';
const countries={ES:'España',DE:'Alemania',FR:'Francia',IE:'Irlanda',IT:'Italia',PL:'Polonia',DK:'Dinamarca',NL:'Países Bajos',BE:'Bélgica'};
const definitions=[
    {path:'pigmeat/prices',filter:'pigClasses',value:'E',field:'pigClass',countries:['ES','DE','FR','DK','NL','PL','IT','BE'],category:'Porcino',label:'Canal porcina clase E',unitMatch:/^100 KG$/i,basis:'Canal porcina clase E; precio semanal comunicado por el Estado miembro'},
    {path:'beef/prices',filter:'productCodes',value:'AR3',field:'productCode',countries:['ES','DE','FR','IE','IT','PL'],category:'Vacuno',label:'Vacuno joven, canal AR3',unitMatch:/^€\/100Kg$/i,basis:'Vacuno joven, categoría A, conformación R, engrasamiento 3; precio semanal de canal'},
    {path:'poultry/egg/prices',filter:'farmingMethods',value:'Barn',field:'farmingMethod',countries:['ES','DE','NL','IT','PL'],category:'Huevo',label:'Huevo de gallinas en suelo',unitMatch:/^€\/100Kg$/i,basis:'Huevo, sistema Barn (gallinas en suelo); referencia semanal por peso, no por piezas'},
];
const markets=definitions.flatMap((definition,index)=>definition.countries.map(country=>({ticker:'DGAGRI-'+index+'-'+country,provider:'dgagri',definition:index,country,label:definition.label+' · '+countries[country],category:definition.category,unit:'EUR/100 kg',currency:'EUR',cadence:'weekly',market:countries[country]+' · precio físico notificado',exchange:'Mercado físico',region:'Europa',basis:definition.basis+'. La fecha indica el fin de la semana de referencia, no el día exacto de publicación.',source:'Comisión Europea · DG AGRI',url:ROOT+definition.path+'?memberStateCodes='+country+'&'+definition.filter+'='+definition.value})));
function iso(value){const m=String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)return '';const day=m[3]+'-'+m[2]+'-'+m[1],time=Date.parse(day);return Number.isFinite(time) && new Date(time).toISOString().slice(0,10)===day ? day : '';}
function parseEuProteinPrices(data,item,cutoff){
    if(!Array.isArray(data) || data.length>20000)throw Error('Respuesta DG AGRI no válida.');
    const definition=definitions[item.definition];
    const series=dailyPoints(data.filter(row=>row.memberStateCode===item.country && row[definition.field]===definition.value && definition.unitMatch.test(row.unit) && /^€\d+(?:\.\d+)?$/.test(row.price) && Date.parse(iso(row.endDate))-Date.parse(iso(row.beginDate))===6*86400000).map(row=>({date:iso(row.endDate),value:Number(row.price.slice(1))})).filter(point=>point.value>0),cutoff).slice(-65);
    if(!series.length)throw Error('Sin precio semanal, moneda, país y clase verificables.');
    return {...item,bucket:'proteins',series,value:series.at(-1).value,previous:null,change:null,performance:{day:null},observedAt:series.at(-1).date,retrievedAt:new Date().toISOString(),quoteStatus:'verified'};
}
function queryUrl(item,cutoff){
    const end=new Date(cutoff),start=new Date(end.getTime()-90*86400000),date=value=>value.toISOString().slice(0,10).split('-').reverse().join('/');
    const definition=definitions[item.definition],params=new URLSearchParams({memberStateCodes:definition.countries.join(','),[definition.filter]:definition.value,beginDate:date(start),endDate:date(end)});
    return ROOT+definition.path+'?'+params;
}
module.exports={markets,parseEuProteinPrices,queryUrl};
