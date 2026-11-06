'use strict';
process.env.NODE_ENV='test';
const assert=require('node:assert/strict');
const {markets,parseEuProteinPrices,queryUrl}=require('../backend/lib/report-eu-protein-prices');
const {loadProteinPrices}=require('../backend/lib/report-protein-prices');
const {loadMercolleidaReport}=require('../backend/lib/report-mercolleida');
const cutoff='2026-10-20T16:00:00Z';
const row=(item,overrides={})=>({memberStateCode:item.country,beginDate:'05/10/2026',endDate:'11/10/2026',price:'€220.50',unit:item.definition===0 ? '100 KG' : '€/100Kg',pigClass:'E',productCode:'AR3',farmingMethod:'Barn',...overrides});
(async()=>{
 for(const item of markets){
   const quote=parseEuProteinPrices([row(item),row(item,{beginDate:'12/10/2026',endDate:'18/10/2026',price:'€225.25'}),row(item,{beginDate:'19/10/2026',endDate:'25/10/2026'})],item,cutoff);
   assert.equal(quote.value,225.25);assert.equal(quote.series.length,2);assert.equal(quote.change,null);assert.equal(quote.previous,null);assert.equal(quote.cadence,'weekly');
   for(const overrides of [{memberStateCode:'XX'},{price:'$123.45'},{unit:'national currency/100kg'},{pigClass:'S',productCode:'AO3',farmingMethod:'Cage'},{beginDate:'31/02/2026',endDate:'31/02/2026'}])assert.throws(()=>parseEuProteinPrices([row(item,overrides)],item,cutoff));
 }
 let calls=0;const quotes=await loadProteinPrices({read:async()=>{throw Error('offline fixture');},cutoff,get:async url=>{if(!url.startsWith('https://api.tech.ec.europa.eu/'))throw Error('offline');calls++;return {ok:true,json:async()=>markets.filter(item=>queryUrl(item,cutoff)===url).map(item=>row(item))};}});
 assert.equal(calls,3,'Una descarga por sector, no por país');assert.equal(quotes.filter(item=>item.provider==='dgagri' && item.quoteStatus==='verified').length,19);
 const preserved=await loadProteinPrices({read:async()=>{throw Error('offline fixture');},cutoff,previous:quotes,get:async()=>{throw Error('offline');}});assert.equal(preserved.filter(item=>item.provider==='dgagri' && item.quoteStatus==='preserved').length,19);
 assert(preserved.filter(item=>item.provider==='dgagri').every(item=>item.previous===null && item.change===null));
 const records=[{kind:'trend',title:'Cerdo blanco',date:'2026-10-16',trend:'baja'},{kind:'comment',title:'Comentario porcino - 19/10/2026',sector:'porcino',date:'2026-10-19',summary:'Comentario de prueba.'},{kind:'trend',title:'Futuro',date:'2026-10-23',trend:'sube'}];
 const tables=await loadMercolleidaReport({cutoff,source:{get:async()=>({records,fetchedAt:cutoff})}});assert.equal(tables.length,2);assert.equal(tables[0].rows.length,1);assert(tables.every(table=>table.note.includes('no contiene precios absolutos')));
 const fallback=await loadMercolleidaReport({cutoff,previous:tables,source:{get:async()=>({records:[]})}});assert.deepEqual(fallback.map(table=>table.rows),tables.map(table=>table.rows));assert(fallback.every(table=>table.note.includes('fuente no disponible')));
 const {weeklyReport}=await import('../shared/report-weekly.mjs');
 const model=weeklyReport({key:'proteins',collection:'markets',generatedAt:cutoff,sourceSnapshot:{proteins:quotes},tables,visuals:[],metrics:[],sections:[]});
 assert.equal(model.references.length,19);assert(model.references.every(item=>item.cadence==='weekly' && item.points.length===1));
 assert.equal(model.visuals.length,0,'One weekly observation is a dated price, not an invented trend');
 assert(model.results.some(table=>table.proteinSectorBoard && table.rows.length && table.columns.includes('Fecha / frecuencia')));
 assert(model.annexTables.some(table=>table.title.includes('actualización y procedencia')));
 assert(model.commentary.some(item=>item.summaryKind==='context' && item.body.includes('Comentario de prueba.')),'The published Spanish comment reaches the executive summary');
 console.log('Proteínas multifuente: OK · 19 precios DG AGRI, nueve países, tres descargas, validación de clase/moneda/unidad/fecha, frecuencia semanal, fallas y evidencia pública Mercolleida.');
})().catch(error=>{console.error(error);process.exitCode=1;});
