'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
async function main(){
 const origin='http://127.0.0.1:5273';
 const paths=['/mexico','/informes','/mercado-proteinas','/api/health','/api/sniim/primer-mercado','/api/marranas','/api/report-history?area=finance&key=equities'];
 const responses=await Promise.all(paths.map(async url=>{const response=await fetch(origin+url,{signal:AbortSignal.timeout(30000)});const text=await response.text();return {url,status:response.status,body:response.headers.get('content-type')?.includes('json')?JSON.parse(text):null};}));
 for(const response of responses)assert.equal(response.status,response.url.startsWith('/api/report-history')?401:200,response.url);
 const prices=responses.find(row=>row.url==='/api/sniim/primer-mercado').body;
 const products=['pork','beef','chicken','egg'],states=new Set(products.flatMap(key=>prices.prices[key].states.map(row=>row.stateCode)));
 assert.equal(states.size,31);
 const ml=responses.find(row=>row.url==='/api/marranas').body;assert(ml.available);assert(ml.version);assert(Array.isArray(ml.closedLoopAudit?.recentEvaluations));assert.equal(ml.closedLoopAudit?.summary?.evaluationScope,'prospective_current_model_only');
 const mexico=JSON.parse(await fs.readFile('backend/cache/mexico-executive-reports.json','utf8'));assert.equal(mexico.schemaVersion,3);
 const result={checkedAt:new Date().toISOString(),localOnly:true,http:responses.map(({url,status})=>({url,status})),visibleStates:states.size,stateProductReferences:products.reduce((sum,key)=>sum+prices.prices[key].states.length,0),modelVersion:ml.version,realProspectiveEvaluations:ml.closedLoopAudit.summary.totalEvaluated,historyRequiresAuthentication:true};
 await fs.writeFile('output/decision-tools-20261126/local-http-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
