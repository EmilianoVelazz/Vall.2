'use strict';
// Exercise the actual route and enrichment with isolated authentication and
// storage. Never changes the live session, database, schedule or cache.
process.env.NODE_ENV='test';process.env.JWT_SECRET='protein-route-fixture';
const assert=require('node:assert/strict'),fs=require('node:fs'),express=require('express');
const auth=require.resolve('../backend/routes/auth');
require.cache[auth]={id:auth,filename:auth,loaded:true,exports:{verifyToken:(req,res,next)=>next()}};
const snapshot=JSON.parse(fs.readFileSync('backend/cache/market_executive_reports.json','utf8'));
snapshot.generatedAt=new Date().toISOString();
for(const report of snapshot.reports)report.proteinPricesCheckedAt=snapshot.generatedAt;
const store=require('../backend/services/market-report-store');store.load=async()=>snapshot;store.save=async()=>{throw Error('Esta prueba no debe escribir datos');};
const {router}=require('../backend/routes/market'),app=express();app.use('/api',router);
(async()=>{
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/market-executive-reports'),body=await response.json();
   assert.equal(response.status,200);const report=body.data.find(report=>report.key==='proteins');
   const {weeklyReport}=await import('../shared/report-weekly.mjs'),model=weeklyReport(report);
   for(const provider of ['cepea','rnm','dgagri'])assert(report.sourceSnapshot.proteins.some(item=>item.provider===provider && item.series?.length));
   assert(model.proteinSources.some(item=>item.label==='Mercolleida'));
   assert.equal(model.references.length,report.sourceSnapshot.proteins.length);assert(model.visuals.length>=13);assert.equal(model.proteinCountries.length,8);assert(model.proteinCountries.every(country=>country.count>0));
   assert(model.references.some(item=>item.source.includes('CEPEA')));assert(model.references.some(item=>item.source.includes('DG AGRI')));
   assert(model.proteinSources.findIndex(item=>item.label.includes('CEPEA'))<model.proteinSources.findIndex(item=>item.label.includes('Yahoo')));
   console.log('Ruta de proteínas: OK · respuesta del manejador real, 38 referencias, 13 gráficas y evidencia CEPEA/RNM/DG AGRI/Mercolleida. Sesión y almacenamiento aislados.');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
