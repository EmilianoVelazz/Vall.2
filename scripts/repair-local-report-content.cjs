'use strict';
// Explicitly local: never publish these repairs to the shared report database or send mail.
process.env.VALL_REPORT_STORAGE_LOCAL_ONLY='true';
process.env.RUN_BACKGROUND_JOBS='false';
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),cache=path.join(root,'backend/cache'),output=path.join(root,'output/local-content-20261126');
require('dotenv').config({path:path.join(root,'backend/.env'),quiet:true});
// Public sources provide the evidence; optional AI editorial work is unnecessary for a data repair.
process.env.GEMINI_API_KEY='';
require('../backend/lib/tls-trust').configureSystemTrust();
const files={finance:'finance_executive_reports.json',markets:'market_executive_reports.json',mexico:'mexico-executive-reports.json'};
async function read(area){return JSON.parse(await fs.readFile(path.join(cache,files[area]),'utf8'));}
async function write(area,value){const file=path.join(cache,files[area]),temp=file+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify({...value,schemaVersion:area==='mexico'?3:1}),{flag:'wx',mode:0o600});await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(()=>{});}}
async function main(){
 await fs.mkdir(output,{recursive:true});
 for(const [area,file]of Object.entries(files))await fs.copyFile(path.join(cache,file),path.join(output,area+'-before.json'),require('node:fs').constants.COPYFILE_EXCL).catch(error=>{if(error.code!=='EEXIST')throw error;});
 console.log('[local-content] Copia local de los tres cortes guardada.');
 const {buildMexicoReports}=require('../backend/services/mexico-executive-reports');
 const mx=await read('mexico'),production=buildMexicoReports({}).find(report=>report.key==='mx_production');
 const original=mx.reports.find(report=>report.key==='mx_overview');
 const {composeMexicoPanorama,composePanorama}=require('../backend/lib/report-panorama');
 await write('mexico',composeMexicoPanorama({...mx,reports:mx.reports.map(report=>report.key==='mx_production'?production:report.key==='mx_overview' && original.panoramaParts?original.panoramaParts.find(part=>part.key==='mx_overview'):report)}));
 console.log('[local-content] Periodos agrícola 2025 y minero 2024 incorporados.');
 if(process.argv.includes('--prices') || process.argv.includes('--mexico')){
  console.log('[local-content] Consultando referencias públicas de México.');
  await require('../backend/services/mexico-executive-reports').mexicoReports.refresh();
 }
 if(process.argv.includes('--prices')){
  console.log('[local-content] Consultando referencias públicas de Mercados.');
  await require('../backend/routes/market').refreshMarketExecutiveReports(undefined,{force:true});
  console.log('[local-content] Consultando referencias públicas de Finanzas.');
  await require('../backend/routes/finanzas').refreshExecutiveReports();
 }
 const cutoff=new Date().toISOString(),{loadMarketNews,buildMarketNewsReport}=require('../backend/lib/report-market-news');
 const markets=await read('markets'),prior=markets.reports.find(report=>report.key==='market_news');
 const news=await loadMarketNews({cutoff,previous:prior?.marketNews || prior?.headlines || []});
 const rebuilt=buildMarketNewsReport({stories:news.stories,generatedAt:cutoff,status:news.status});
 const market=require('../backend/lib/report-market-overview').composeMarketOverview({...markets,reports:markets.reports.map(report=>report.key==='market_news'?rebuilt:report)});
 await write('markets',market);
 const mexico=composeMexicoPanorama(await read('mexico'));await write('mexico',mexico);
 const finance=await composePanorama(await read('finance'),{marketsSnapshot:market,mexicoSnapshot:mexico});await write('finance',finance);
 const {reportHealth}=require('../shared/report-health.mjs'),reports=[];
 for(const area of Object.keys(files))for(const report of (await read(area)).reports){const health=reportHealth({...report,collection:area});reports.push({area,key:report.key,state:health.state,asOf:health.asOf,periodLabel:health.periodLabel,coverage:health.coverage,issues:health.references.filter(item=>['missing','stale','preserved'].includes(item.status))});}
 const result={checkedAt:new Date().toISOString(),localOnly:true,newsCount:rebuilt.marketNews.length,reports};
 await fs.writeFile(path.join(output,'after.json'),JSON.stringify(result,null,2));
 console.log('[local-content] '+JSON.stringify({localOnly:true,newsCount:result.newsCount,reports:reports.map(({area,key,state,asOf,coverage})=>({area,key,state,asOf,coverage}))}));
}
main().catch(error=>{console.error('[local-content] '+(error.code || error.message));process.exitCode=1;});
