'use strict';
const assert=require('node:assert/strict'),express=require('express'),jwt=require('jsonwebtoken');
process.env.NODE_ENV='test';process.env.VERCEL='1';process.env.JWT_SECRET='fixture-market-access-only';process.env.GEMINI_API_KEY='';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_PASSWORD','SUPABASE_DATABASE_URL'])process.env[key]='';
const profiles=require('../backend/services/user-profile-store');profiles.findById=async id=>({id,email:'access@example.invalid',active:true,credentialVersion:0});
const generatedAt=new Date().toISOString(),report={key:'proteins',title:'Proteínas de América',summary:'Corte guardado',generatedAt,sections:[],tables:[],metrics:[],visuals:[],sourceSnapshot:{proteins:[{label:'Pollo · Estados Unidos',market:'Estados Unidos',unit:'USD/kg',source:'Fuente de prueba',series:[{date:generatedAt.slice(0,10),value:10}]}]}};
const quote=(symbol,label)=>({symbol,label,market:'Estados Unidos',unit:'USD por unidad',cadence:'daily',basis:'serie de futuros de prueba',source:'Fixture',series:[{date:generatedAt.slice(0,10),value:10}]});
report.sourceSnapshot.proteins.push(quote('HE=F','Cerdo magro CME'),quote('LE=F','Ganado vivo CME'),quote('GF=F','Ganado de engorda CME'));
report.sourceSnapshot.proteins.push({...quote('BR-PORK','Cerdo · Brasil'),market:'Brasil'},{...quote('MX-PORK','Cerdo · México'),market:'México'});
const grains={...report,key:'grains',title:'Granos y forrajes',sourceSnapshot:{grains:[quote('ZC=F','Maíz CBOT'),quote('ZS=F','Soya CBOT'),quote('ZW=F','Trigo CBOT'),quote('ZM=F','Harina de soya CBOT')]}};
const {latestMarketReportCutAt}=require('../backend/lib/report-schedule'),lastCut=new Date(latestMarketReportCutAt().getTime()-1000).toISOString();
require('../backend/services/market-report-store').load=async()=>({reports:[report,grains],generatedAt:lastCut,persistence:'fixture'});
const seed=require('../backend/data/commodity-derivatives-public-2026-10-23.json'),fixture={...seed,checkedAt:generatedAt};
for(const field of ['options','futures'])fixture[field]=seed[field].map(item=>({...item,date:generatedAt.slice(0,10),retrievedAt:generatedAt,...(field==='options' ? {contractMonth:'2050-12'} : {})}));
report.marketDerivatives=fixture;grains.marketDerivatives=fixture;
require('../backend/lib/report-commodity-derivatives').loadReportDerivatives=async()=>fixture;
// Simulate an upstream that never finishes, without making any network request.
const pending=()=>new Promise(()=>{});
require('../backend/lib/report-global-commodities').loadGlobalCommodities=pending;
require('../backend/lib/report-protein-prices').loadProteinPrices=pending;
require('../backend/lib/report-market-context').loadReportMarketFx=pending;
require('../backend/lib/report-market-context').loadReportOpenInterest=pending;
const app=express();app.use('/api',require('../backend/routes/market').router);
(async()=>{const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});try{
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/market-executive-reports')).status,401);
 const token=jwt.sign({sub:'fixture-access',email:'access@example.invalid',role:'user',credentialVersion:0},process.env.JWT_SECRET,{expiresIn:'5m'}),start=Date.now();
 const response=await fetch(base+'/api/market-executive-reports',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(2500)});
 const data=await response.json();assert.equal(response.status,200);assert.equal(data.data[0].key,'proteins');assert.equal(data.refreshing,true);assert(Date.now()-start<2000,'A slow source cannot block an existing report');
 assert.equal(data.data[0].proteinScope,'GLOBAL');assert.equal(data.data[0].title,'Mercado de proteínas · América y panorama global');assert(data.data[0].sourceSnapshot.proteins.some(item=>item.market==='Brasil') && data.data[0].sourceSnapshot.proteins.some(item=>item.market==='Estados Unidos'),'International and US protein prices are included in the authenticated API payload');
 const {weeklyReport}=await import('../shared/report-weekly.mjs');
 for(const report of data.data){const counts=weeklyReport(report).results.filter(table=>table.derivatives).map(table=>table.rows.length);assert.deepEqual(counts,report.key==='proteins' ? [3,3] : [4,4],'The actual HTTP response contains options and futures OI for '+report.key);}
 console.log('Protein access: OK · authenticated HTTP, saved cut opens while upstream remains pending, one background refresh, no external calls.');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
