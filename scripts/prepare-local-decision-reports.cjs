'use strict';
// Use the existing public-source cache only. No network generation, shared DB writes or mail.
process.env.VALL_REPORT_STORAGE_LOCAL_ONLY='true';
process.env.RUN_BACKGROUND_JOBS='false';
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const folder=path.resolve('output/decision-tools-20261126'),cache=path.resolve('backend/cache');
async function read(file){return JSON.parse(await fs.readFile(path.join(cache,file),'utf8'));}
async function write(file,data){const target=path.join(cache,file),temp=target+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(data),{flag:'wx',mode:0o600});await fs.rename(temp,target);}finally{await fs.unlink(temp).catch(()=>{});}}
async function main(){
 await fs.mkdir(folder,{recursive:true});
 for(const file of ['mexico-executive-reports.json','finance_executive_reports.json'])await fs.copyFile(path.join(cache,file),path.join(folder,file+'.before'),require('node:fs').constants.COPYFILE_EXCL).catch(e=>{if(e.code!=='EEXIST')throw e;});
 const firstSale=await read('sniim-first-sale.json');
 for(const key of ['beef','chicken','egg'])Object.assign(firstSale.data.prices[key],{source:'SNIIM',sourceUrl:'https://www.economia-sniim.gob.mx/nuevo/'});
 await write('sniim-first-sale.json',firstSale);
 const old=await read('mexico-executive-reports.json'),{createMexicoReports}=require('../backend/services/mexico-executive-reports');
 const reportStore={async load(){return old;},async save(snapshot){return {...snapshot,schemaVersion:3,persistence:'disk'};}};
 const service=createMexicoReports({reportStore,loaders:{macro:async()=>old.sourceInputs?.macro,bmv:async()=>old.sourceInputs?.bmv,proteins:async()=>firstSale.data},editorial:{async enrich(reports){return reports;}}});
 const {composeMexicoPanorama,composePanorama}=require('../backend/lib/report-panorama');
 const mexico=composeMexicoPanorama(await service.refresh());await write('mexico-executive-reports.json',mexico);
 const finance=await composePanorama(await read('finance_executive_reports.json'),{marketsSnapshot:await read('market_executive_reports.json'),mexicoSnapshot:mexico});
 await write('finance_executive_reports.json',{...finance,schemaVersion:1});
 const products=['pork','beef','chicken','egg'],previous=JSON.parse(await fs.readFile(path.join(folder,'first-sale-before.json'),'utf8')).data;
 const sets=products.map(key=>new Set((previous.prices[key]?.states || []).map(row=>row.stateCode)));
 const result={localOnly:true,previousVisibleStates:[...sets[0]].filter(key=>sets.every(set=>set.has(key))).length,visibleStates:new Set(products.flatMap(key=>firstSale.data.prices[key].states.map(row=>row.stateCode))).size,stateProductReferences:products.reduce((sum,key)=>sum+firstSale.data.prices[key].states.length,0),sourceDatesPreserved:true};
 await fs.writeFile(path.join(folder,'local-report-refresh.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(error.code || error.message);process.exitCode=1;});
