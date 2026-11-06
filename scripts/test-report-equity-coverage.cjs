'use strict';
process.env.NODE_ENV='test';
const assert=require('node:assert/strict');
const {config,loadEquityMarkets}=require('../backend/lib/report-equity-markets');
(async()=>{
 const cutoff='2026-10-19T22:00:00Z',http=require('../backend/lib/http'),get=http.externalGet;
 let calls=0,active=0,peak=0;
 http.externalGet=async url=>{
  assert(url.startsWith('https://query1.finance.yahoo.com/'));calls++;active++;peak=Math.max(peak,active);
  await new Promise(resolve=>setTimeout(resolve,1));active--;
  return {ok:true,json:async()=>({chart:{result:[{timestamp:['2026-10-16T20:00:00Z','2026-10-19T20:00:00Z','2026-10-20T20:00:00Z'].map(date=>Date.parse(date)/1000),indicators:{quote:[{close:[100,102,999]}]}}]}})};
 };
 const store=require('../backend/services/finance-report-store'),save=store.save;let saves=0;
 store.save=async(reports,generatedAt)=>{saves++;return {reports,generatedAt,persistence:'fixture'};};
 try {
  const router=require('../backend/routes/finanzas');
  const other={key:'fx',title:'Divisas conservadas',sections:[]};
  const original={generatedAt:cutoff,reports:[{key:'equities',title:'Bolsa',generatedAt:cutoff,sections:[],sourceSnapshot:{equities:[]}},other]};
  const unchanged=JSON.stringify(original);
  const [upgraded,duplicate]=await Promise.all([router.ensureEquityReportCoverage(original),router.ensureEquityReportCoverage(original)]);
  assert.strictEqual(upgraded,duplicate);assert.equal(calls,42);assert.equal(saves,1);assert(peak<=6);assert.equal(JSON.stringify(original),unchanged);
  assert.strictEqual(upgraded.reports.find(item=>item.key==='fx'),other);assert.equal(upgraded.generatedAt,cutoff);
  const equity=upgraded.reports.find(item=>item.key==='equities');assert.equal(equity.sourceSnapshot.equities.length,62);
  assert(equity.sourceSnapshot.equities.every(item=>item.series.every(point=>point.date<='2026-10-19')),'Sin observaciones posteriores al corte');
  assert.equal(equity.sourceSnapshot.equities.find(item=>item.symbol==='^MXX').change,2.0000000000000018);
  assert.equal(equity.sourceSnapshot.equities.find(item=>item.exchange==='BIVA').series.length,0);
  await router.ensureEquityReportCoverage(upgraded);assert.equal(calls,42,'No repite la migración');
  const started=Date.now();const timed=await loadEquityMarkets(()=>new Promise(()=>{}),{cutoff,budgetMs:30,concurrency:2});
  assert(Date.now()-started<1500);assert.equal(timed.length,config.markets.length);assert(timed.every(item=>!item.series.length));
  console.log('Cobertura Bolsa: OK · 59 bolsas, 42 consultas acotadas, corte respetado, migración única, otros informes intactos y presupuesto global');
 } finally {http.externalGet=get;store.save=save;}
})().catch(error=>{console.error(error);process.exitCode=1;});
