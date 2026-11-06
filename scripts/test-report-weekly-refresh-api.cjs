'use strict';
const assert=require('node:assert/strict'),express=require('express'),path=require('node:path');
process.env.NODE_ENV='test';process.env.VERCEL='1';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';process.env.JWT_SECRET='weekly-refresh-fixture';
for(const key of ['SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','SUPABASE_DATABASE_URL','DATABASE_URL','SUPABASE_PASSWORD','GEMINI_API_KEY'])process.env[key]='';
const NativeDate=Date;let instant=NativeDate.parse('2026-11-05T20:30:00Z');
global.Date=class extends NativeDate{constructor(...args){super(...(args.length ? args : [instant]));}static now(){return instant;}};
const original={generatedAt:'2026-11-05T18:00:00Z',reports:[{key:'proteins',title:'Proteínas · SIMULACIÓN',generatedAt:'2026-11-05T18:00:00Z',sections:[],tables:[],metrics:[],visuals:[],sourceSnapshot:{proteins:[]}},{key:'market_news',title:'Noticias · SIMULACIÓN',generatedAt:'2026-10-30T20:05:00Z',sections:[],tables:[],visuals:[],marketNewsVersion:0}]},before=JSON.stringify(original),calls={sources:0,writes:0};
const store=require('../backend/services/market-report-store');store.load=async()=>structuredClone(original);store.save=async()=>{calls.writes++;throw Error('No escribir fuera del corte semanal');};
const forbidden=async()=>{calls.sources++;throw Error('No consultar proveedores antes del viernes');};
require('../backend/lib/report-global-commodities').loadGlobalCommodities=forbidden;require('../backend/lib/report-protein-prices').loadProteinPrices=forbidden;require('../backend/lib/report-mercolleida').loadMercolleidaReport=forbidden;require('../backend/lib/report-market-context').loadReportMarketFx=forbidden;require('../backend/lib/report-market-context').loadReportOpenInterest=forbidden;require('../backend/lib/report-commodity-derivatives').loadReportDerivatives=forbidden;require('../backend/lib/report-market-news').loadMarketNews=forbidden;
const authPath=require.resolve('../backend/routes/auth');require.cache[authPath]={id:authPath,filename:authPath,loaded:true,exports:{verifyToken:(req,res,next)=>{req.user={email:'weekly@example.invalid',id:'fixture'};next();}}};
const market=require('../backend/routes/market'),app=express();app.use('/api',market.router);
(async()=>{let server;try{
 server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});const base='http://127.0.0.1:'+server.address().port;
 for(const stamp of ['2026-11-05T20:30:00Z','2026-11-06T12:00:00Z','2026-11-06T19:59:59Z']){
  instant=NativeDate.parse(stamp);const response=await fetch(base+'/api/market-executive-reports'),body=await response.json();assert.equal(response.status,200);assert.equal(body.generatedAt,original.generatedAt);assert.equal(body.nextRefreshAt,'2026-11-06T20:00:00.000Z');assert.equal(body.refreshPolicy.frequency,'weekly');assert.equal(body.refreshing,false);assert.equal(body.stale,false);assert.equal(body.data.find(item=>item.key==='market_news').generatedAt,original.reports[1].generatedAt);
  const current=await market.refreshMarketExecutiveReports();assert.equal(current.generatedAt,original.generatedAt,'Daily cron must reuse the published weekly edition');
 }
 assert.deepEqual(calls,{sources:0,writes:0},'No news, protein, schema or derivatives refresh when reading a published edition');assert.equal(JSON.stringify(original),before);
 const rows=[],{createExecutiveReportStore}=require('../backend/services/executive-report-store');process.env.SUPABASE_URL='https://example.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
 for(const table of ['finance_executive_reports','market_executive_reports']){
  const instance=createExecutiveReportStore({table,keys:['fixture'],file:path.resolve('output/actualizacion-semanal-20261105/'+table+'.json'),connect:async()=>null,clientFactory:()=>({from:()=>({upsert:async value=>{rows.push({table,...value[0]});return {error:null};}})})});await instance.save([{key:'fixture',title:'SIMULACIÓN',sections:[]}],original.generatedAt);
 }
 assert.equal(rows.find(item=>item.table==='market_executive_reports').next_refresh_at,'2026-11-06T20:00:00.000Z');assert.equal(rows.find(item=>item.table==='finance_executive_reports').next_refresh_at,'2026-11-05T20:00:00.000Z');
 console.log('API: Mercados permanece inmutable hasta viernes 14:00, incluso ante cron diario, noticias antiguas o esquema anterior; Supabase recibe fechas semanales y Finanzas conserva fechas diarias. Sin conexiones externas.');
}finally{global.Date=NativeDate;if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}})().catch(error=>{console.error(error);process.exitCode=1;});
