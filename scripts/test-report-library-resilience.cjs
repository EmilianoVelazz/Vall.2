'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const localFetch=global.fetch;
global.fetch=(url,options)=>String(url).startsWith('http://127.0.0.1:') ? localFetch(url,options) : Promise.reject(Error('External request disabled in fixture'));
process.env.NODE_ENV='test';
process.env.JWT_SECRET='isolated-report-library-resilience';
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
process.env.SUPABASE_URL='https://fixture.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-only';
process.env.GEMINI_API_KEY='fixture-only';
process.env.FINNHUB_TOKEN='fixture-only';
process.env.NEWSAPI_KEY='fixture-only';
const {reportDeadline}=require('../backend/lib/report-deadline');
const {createExecutiveReportStore}=require('../backend/services/executive-report-store');
const keys=['equities','bonds','fx','daily_news','overview'];
const date='2026-10-14T14:00:00Z';
const report={key:'overview',title:'Corte sintético conservado',generatedAt:date,summary:'Evidencia de prueba',sections:[{heading:'Lectura',text:'Contenido del informe'}]};
const never=()=>new Promise(()=>{});
const clockFailure=()=>({from:()=>({upsert:async()=>({error:Error('JWT issued at future')}),select:()=>({order:async()=>({error:Error('JWT issued at future')})})})});

async function main() {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-library-resilience-'));
 let server;
 try {
  const file=path.join(directory,'finance.json');
  const create=(extra={})=>createExecutiveReportStore({table:'finance_executive_reports',keys,file,clientFactory:clockFailure,connect:async()=>{throw Error('DNS unavailable');},timeoutMs:20,...extra});
  const store=create();const saved=await store.save([report],date);assert.equal(saved.persistence,'disk');
  let remoteCalls=0;
  const afterRestart=create({clientFactory:()=>{remoteCalls++;throw Error('No debe consultar la red con respaldo disponible');}});
  const restored=await afterRestart.load();assert.equal(restored.reports[0].title,report.title);assert.equal(restored.generatedAt,date);assert.equal(restored.persistence,'disk');assert.equal(remoteCalls,0);
  await assert.rejects(store.save([{...report,key:'unknown'}],date),/incompleto/);
  await assert.rejects(store.save([report,report],date),/incompleto/);
  await fs.writeFile(file,'{interrumpido');
  let reads=0;
  const recovered=create({clientFactory:()=>({from:()=>({select:()=>({order:async()=>{reads++;await new Promise(resolve=>setTimeout(resolve,10));return {data:[{report,generated_at:date}]};}})})})});
  const concurrent=await Promise.all(Array.from({length:12},()=>recovered.load()));assert(concurrent.every(snapshot=>snapshot.reports[0].title===report.title));assert.equal(reads,1,'Una lectura compartida ante solicitudes simultáneas');
  const stuck=create({file:path.join(directory,'missing.json'),clientFactory:()=>({from:()=>({select:()=>({order:never})})}),connect:async()=>null});
  const began=Date.now();assert.equal(await stuck.load(),null);assert(Date.now()-began<400,'La caída remota tiene un plazo total acotado');
  let ended=false;
  const late=create({file:path.join(directory,'late.json'),clientFactory:()=>null,connect:async()=>{await new Promise(resolve=>setTimeout(resolve,45));return {query:async()=>({rows:[]}),end:async()=>{ended=true;}};}});
  assert.equal(await late.load(),null);await new Promise(resolve=>setTimeout(resolve,65));assert(ended,'Libera la conexión que llega después del timeout');
  await assert.rejects(reportDeadline(never,10),error=>error.code==='REPORT_SOURCE_TIMEOUT');

  // Se montan los routers reales, con red, IA y base remota sustituidas por
  // fallos controlados. No se envían correos ni se consultan proveedores reales.
  const originalLoad=Module._load;
  let calls=0,editorialCalls=0;
  const http={externalGet:async url=>{
   calls++;
   if(url.includes('finance/chart/')) return {ok:true,json:async()=>({chart:{result:[{timestamp:[1791806400,1791892800,1791979200],indicators:{quote:[{close:[38,38.5,39]}]}}]}})};
   if(url.includes('open.er-api.com')) return {ok:true,json:async()=>({rates:{MXN:18.2,EUR:.9,JPY:140,GBP:.8,CAD:1.3}})};
   if(url.includes('finnhub.io/api/v1/news')) return {ok:true,json:async()=>[{headline:'Protein trade fixture',summary:'Verified fixture text',source:'Fixture publisher',url:'https://example.invalid/news',datetime:Math.floor(Date.now()/1000)}]};
   if(url.includes('newsapi.org')) return never();
   if(url.includes('gdeltproject.org')) return {ok:true,json:async()=>({articles:[]})};
   return {ok:false,status:503,json:async()=>({})};
  },gdeltFetch:async()=>({ok:false,status:503}),yahooFetch:async()=>({ok:false,status:503}),YF_UA:'fixture'};
  class Provider {isConfigured(){return true;}generate({signal}){editorialCalls++;assert(signal);return never();}}
  Module._load=function(name,parent,isMain) {
   if(name==='dotenv') return {config(){}};
   if(name.endsWith('/report-deadline')) return {reportDeadline:(operation,ms=14000)=>reportDeadline(operation,Math.max(10,ms/100))};
   if(name==='../lib/http' || name==='./http') return http;
   if(name==='./providers/gemini-provider') return {GeminiProvider:Provider};
   if(name==='./report-financial-news-translation')return {translateFinancialNews:async stories=>stories};
   if(name==='../lib/report-market-news')return {...originalLoad.call(this,name,parent,isMain),loadMarketNews:async({other=[]})=>({stories:await other})};
   if(name==='../lib/report-commodity-derivatives')return {loadReportDerivatives:async()=>({options:[],futures:[]}),attachReportDerivatives:snapshot=>snapshot};
   if(name==='../ai/protein-training-sources') return {statcanHogProductionSnapshot:never,eurostatPigmeatSnapshot:async()=>null,ibgeSlaughterSnapshot:async()=>null};
   return originalLoad.call(this,name,parent,isMain);
  };
  let finance,market;
  require('../backend/services/user-profile-store').findById=async()=>({id:'fixture',email:'fixture@example.invalid',active:true,role:'user',credentialVersion:0});
  const financeStore=require('../backend/services/finance-report-store'),marketStore=require('../backend/services/market-report-store');
  const diskFinance=create({file:path.join(directory,'router-finance.json')});
  const diskMarket=createExecutiveReportStore({table:'market_executive_reports',keys:['overview','grains','energy_metals','proteins','market_news'],file:path.join(directory,'router-market.json'),clientFactory:clockFailure,connect:async()=>null,timeoutMs:20});
  let financeLoads=0;financeStore.load=()=>{financeLoads++;return diskFinance.load();};financeStore.save=diskFinance.save;marketStore.load=diskMarket.load;marketStore.save=diskMarket.save;
  try {
   require('../backend/lib/report-market-news').loadMarketNews=async({other=[]})=>({stories:await other});
   require('../backend/lib/report-commodity-derivatives').loadReportDerivatives=async()=>({options:[],futures:[]});
   require('../backend/lib/report-protein-fundamentals').loadProteinFundamentals=async()=>[];
   finance=require('../backend/routes/finanzas');market=require('../backend/routes/market').router;
  } finally {Module._load=originalLoad;}
  const express=require('express'),jwt=require('jsonwebtoken'),app=express();app.use('/api',finance);app.use('/api',market);
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const origin='http://127.0.0.1:'+server.address().port,headers={Authorization:'Bearer '+jwt.sign({email:'fixture@example.invalid',sub:'fixture'},process.env.JWT_SECRET)};
  assert.equal((await fetch(origin+'/api/finance-executive-reports')).status,401);
  const coldStart=Date.now();
  const responses=await Promise.all(Array.from({length:3},()=>fetch(origin+'/api/finance-executive-reports',{headers}).then(async response=>{assert.equal(response.status,200);return response.json();})));
  assert(responses.every(response=>response.data.length===5));assert(responses[0].data.find(item=>item.key==='equities').metrics.length>0,'Conserva los instrumentos que sí respondieron');
  assert.equal(editorialCalls,1,'Los clics simultáneos comparten la generación');assert.equal(financeLoads,3,'No repite la lectura del almacén dentro de la regeneración');assert(Date.now()-coldStart<3000);
  const previousCalls=calls;await fetch(origin+'/api/finance-executive-reports',{headers});assert.equal(calls,previousCalls,'La segunda lectura usa el corte disponible');
  const marketResponse=await fetch(origin+'/api/market-executive-reports',{headers});assert.equal(marketResponse.status,200);const marketPayload=await marketResponse.json();assert.equal(marketPayload.data.length,5);
  assert(marketPayload.data.find(item=>item.key==='market_news').headlines.some(item=>item.source==='Fixture publisher'),'Una fuente de noticias colgada no elimina la noticia recuperada de otra');
  const restarted=create({file:path.join(directory,'router-finance.json'),clientFactory:()=>{throw Error('Fuera de servicio tras reiniciar');}});
  financeStore.load=restarted.load;delete require.cache[require.resolve('../backend/routes/finanzas')];
  const old=await restarted.load();old.reports=old.reports.map(item=>({...item,pdfSchemaVersion:0}));
  const another=require('express')();another.use('/api',require('../backend/routes/finanzas'));
  const restartServer=await new Promise(resolve=>{const instance=another.listen(0,'127.0.0.1',()=>resolve(instance));});
  try {const before=calls;const response=await fetch('http://127.0.0.1:'+restartServer.address().port+'/api/finance-executive-reports',{headers});assert.equal(response.status,200);assert.equal((await response.json()).data.length,5);assert.equal(calls,before,'Una versión anterior del formato no bloquea la biblioteca tras reiniciar');}
  finally {restartServer.closeAllConnections();await new Promise(resolve=>restartServer.close(resolve));}
  console.log('Report library resilience: OK · arranque en frío, 3 aperturas simultáneas, red/IA/DB colgadas, noticias parciales, disco tras reinicio, caché corrupto, formato anterior, cifras, aislamiento y plazos; cero proveedores o correos reales');
 } finally {
  if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  assert.equal(path.dirname(directory),os.tmpdir());assert(path.basename(directory).startsWith('vall-library-resilience-'));
  await fs.rm(directory,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
