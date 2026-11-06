'use strict';
const {createMercolleidaClient}=require('../services/mercolleida-public');
const mercolleidaData=require('../../shared/report-mercolleida-markets.json');
const client=createMercolleidaClient();
const {mercolleidaMarkets}=require('../../shared/report-mercolleida.mjs');
function loadMercolleidaMarkets({cutoff=new Date().toISOString()}={}){return mercolleidaMarkets(cutoff);}

function loadMercolleidaComparativeTables(){
    const tables=mercolleidaData?.comparativeTables || {};
    return [tables.species2020ToDateMatrix,tables.homogeneousConversion,tables.annualBalance2020_2026,tables.internationalCuts].filter(Boolean).map(table=>({...table,mercolleidaTable:true,printGroup:'mercolleida-comparative'}));
}

async function loadMercolleidaReport({source=client,cutoff=new Date().toISOString(),previous=[]}={}){
    const result=await source.get();
    const records=(Array.isArray(result?.records) ? result.records : []).filter(record=>record.date && Date.parse(record.date)<=Date.parse(cutoff) && Date.parse(cutoff)-Date.parse(record.date)<=14*86400000);
    // Preserve the dated public evidence on failure, never label it freshly verified.
    let tables;
    if(!records.length){
        tables=previous.filter(table=>/^Mercolleida ·/.test(table.title)).map(table=>({...table,note:String(table.note || '').replace(/ Consulta:.*$/,'')+' Consulta: fuente no disponible; se conserva la publicación fechada anterior.'}));
    }else{
        const note='Fuente: Mercolleida · España. Información pública cualitativa; no contiene precios absolutos ni una variación diaria calculada. '+(result.stale ? 'Consulta sin actualización confirmada: ' : 'Consulta: ')+result.fetchedAt+'. https://www.mercolleida.com/es/';
        const trends=records.filter(record=>record.kind==='trend'),comments=records.filter(record=>record.kind==='comment' && ['porcino','vacuno'].includes(record.sector)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,2);
        tables=[trends.length && {title:'Mercolleida · tendencias públicas',columns:['Producto / plaza','Tendencia publicada','Fecha'],rows:trends.map(record=>[record.title+' · Lleida, España',record.trend,record.date]),note},comments.length && {title:'Mercolleida · comentarios publicados',columns:['Publicación','Fecha','Lectura de la fuente'],rows:comments.map(record=>[record.title,record.date,record.summary.slice(0,240)]),note}].filter(Boolean);
    }
    tables.quotes=loadMercolleidaMarkets({cutoff});
    tables.context=require('../../shared/report-protein-quality.mjs').proteinPublicComments(tables,cutoff);
    tables.comparativeTables=loadMercolleidaComparativeTables();
    return tables;
}
module.exports={loadMercolleidaReport,loadMercolleidaMarkets,loadMercolleidaComparativeTables};
