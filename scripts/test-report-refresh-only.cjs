'use strict';
const assert=require('node:assert/strict'),express=require('express');
const {createReportRefreshHandler}=require('../backend/lib/report-refresh-handler');
async function main(){
 let finance=0,markets=0,mexico=0,emails=0,reviews=0,options,fail=false;
 const app=express();app.get(['/refresh','/api/executive-reports/refresh-content'],createReportRefreshHandler({getSecret:()=> 'fixture-refresh-only-not-production',logger:{warn(){},error(){}},
  finance:async()=>{finance++;if(fail)throw Error('private-error');return {reports:[]};},
  markets:async value=>{markets++;options=value;return {reports:[{key:'market_news',marketNews:[{title:'Ficticio'}],newsStatus:'current'}]};},
  mexico:async()=>{mexico++;return {reports:[]};},deliver:async()=>{emails++;},review:async()=>{reviews++;return {checked:1};}}));
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));}),base='http://127.0.0.1:'+server.address().port;
 const run=(query='',authorized=true)=>fetch(base+'/refresh'+query,{headers:authorized?{Authorization:'Bearer fixture-refresh-only-not-production'}:{}});
 try{
  assert.equal((await run('?refreshOnly=1&forceMarkets=1',false)).status,401);assert.equal(finance+markets+mexico+emails+reviews,0);
  const response=await run('?refreshOnly=1&forceMarkets=1'),quiet=await response.json();assert.equal(response.status,200);assert(quiet.success);assert.equal(quiet.reportContent.marketNews.count,1);
  assert.deepEqual(options,{force:true});assert.equal(emails,0);assert.equal(reviews,0);assert.equal(finance,1);
  const separate=await fetch(base+'/api/executive-reports/refresh-content?forceMarkets=1',{headers:{Authorization:'Bearer fixture-refresh-only-not-production'}});
  assert.equal(separate.status,200);assert.equal((await separate.json()).forecastReview.reason,'report_refresh_only');assert.equal(emails,0);assert.equal(reviews,0);
  const normal=await run('?forceMarkets=1');assert.equal(normal.status,200);assert.deepEqual(options,{force:false});assert.equal(emails,1);assert.equal(reviews,1);
  fail=true;const failure=await run('?refreshOnly=1');assert.equal(failure.status,502);assert(!(await failure.text()).includes('private-error'));assert.equal(emails,1);
  console.log('Actualización: autenticación previa, reparación silenciosa sin correo, renovación explícita de Mercados y calendario normal conservado OK.');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
