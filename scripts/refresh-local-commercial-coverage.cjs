'use strict';
process.env.VALL_REPORT_STORAGE_LOCAL_ONLY='true';process.env.RUN_BACKGROUND_JOBS='false';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';process.env.GEMINI_API_KEY='';
const fs=require('node:fs'),path=require('node:path');
require('../backend/lib/tls-trust').configureSystemTrust();
async function main(){
 const folder=path.resolve('output/decision-tools-20261126');fs.mkdirSync(folder,{recursive:true});
 const file=path.resolve('backend/cache/sniim-first-sale.json');if(fs.existsSync(file))fs.copyFileSync(file,path.join(folder,'first-sale-before.json'));
 const before=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)).data:null;
 console.log('[coverage] Consultando publicaciones estatales directas, sin generación de precios con IA.');
 await require('../backend/lib/weekly-state-livestock-service').getWeeklyStateLivestockPrices({force:true});
 const data=await require('../backend/lib/sniim-first-sale-service').getFirstSalePrices({force:true});
 const products=['pork','beef','chicken','egg'];const union=value=>new Set(products.flatMap(product=>(value?.prices?.[product]?.states || []).map(row=>row.stateCode))).size;
 const result={checkedAt:new Date().toISOString(),localOnly:true,previousUnion:union(before),currentUnion:union(data),products:products.map(product=>({product,before:before?.prices?.[product]?.states?.length || 0,after:data.prices?.[product]?.states?.length || 0,dates:[...new Set((data.prices?.[product]?.states || []).map(row=>row.date))].sort()}))};
 fs.writeFileSync(path.join(folder,'coverage-live.json'),JSON.stringify(result,null,2));console.log('[coverage] '+JSON.stringify(result));
}
main().catch(error=>{console.error('[coverage] '+(error.code||error.message));process.exitCode=1;});
