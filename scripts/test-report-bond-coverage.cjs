'use strict';
process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-bond-coverage';
const assert=require('node:assert/strict');
const http=require('../backend/lib/http'),store=require('../backend/services/finance-report-store'),config=require('../shared/report-bond-markets.json');
const context=require('../backend/lib/report-bond-context'),loadContext=context.loadBondContext,loadNews=context.loadBondNews;
context.loadBondContext=async()=>[];context.loadBondNews=async()=>[];
(async()=>{
 const get=http.externalGet,save=store.save;let fetches=0,saves=0;
 http.externalGet=async url=>{
  fetches++;
  if(url.includes('treasury.gov')) return {ok:true,text:async()=>'<feed>'+['2026-10-15','2026-10-16','2026-10-20'].map(date=>'<entry><d:NEW_DATE>'+date+'T00:00:00</d:NEW_DATE>'+config.markets.filter(item=>item.field).map(item=>'<d:'+item.field+'>4</d:'+item.field+'>').join('')+'</entry>').join('')+'</feed>'};
  if(url.includes('banxico.org.mx')) return {ok:true,json:async()=>({bmx:{series:config.markets.filter(item=>item.seriesId).map(item=>({idSerie:item.seriesId,titulo:'Cetes a '+item.maturity.slice(0,-1)+' días Tasa de rendimiento',datos:[{fecha:'08/10/2026',dato:'7'},{fecha:'15/10/2026',dato:'7.1'},{fecha:'22/10/2026',dato:'99'}]}))}})};
  throw Error('Origen inesperado');
 };
 store.save=async(reports,generatedAt)=>{saves++;return {reports,generatedAt,persistence:'fixture'};};
 try {
  const router=require('../backend/routes/finanzas'),cut='2026-10-19T15:00:00Z';
  const equities={key:'equities',title:'Bolsa conservada',sections:[]},fx={key:'fx',title:'Divisas conservadas',sections:[]};
  const snapshot={generatedAt:cut,reports:[equities,fx,{key:'bonds',title:'Bonos',generatedAt:cut,sections:[],sourceSnapshot:{bonds:[]}}]},before=JSON.stringify(snapshot);
  const [first,duplicate]=await Promise.all([router.ensureBondReportCoverage(snapshot),router.ensureBondReportCoverage(snapshot)]);
  assert.strictEqual(first,duplicate);assert.equal(saves,1);assert(fetches<=40);assert.equal(JSON.stringify(snapshot),before);
  assert.strictEqual(first.reports.find(item=>item.key==='equities'),equities);assert.strictEqual(first.reports.find(item=>item.key==='fx'),fx);assert.equal(first.generatedAt,cut);
  const bonds=first.reports.find(item=>item.key==='bonds');assert.equal(bonds.sourceSnapshot.bonds.length,17);assert(bonds.sourceSnapshot.bonds.every(item=>item.series.every(point=>point.date<='2026-10-19')));
  await router.ensureBondReportCoverage(first);assert.equal(saves,1);assert.equal(first.reports.find(item=>item.key==='bonds').bondSchemaVersion,config.version);
  console.log('Cobertura Bonos: OK · migración única, corte conservado, 17 referencias, sin fechas futuras y otros informes intactos');
 } finally {http.externalGet=get;store.save=save;context.loadBondContext=loadContext;context.loadBondNews=loadNews;}
})().catch(error=>{console.error(error);process.exitCode=1;});
