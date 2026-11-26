'use strict';
const assert=require('node:assert/strict');
const {upgradeReportContent}=require('../backend/lib/report-content-upgrade');
async function main(){
 let news=0,mexico=0;
 const dependencies={loadMarkets:async()=>({reports:[{key:'market_news',marketNews:[]}]}),refreshNews:async()=>{news++;},loadMexico:async()=>({reports:[{key:'mx_production'}]}),refreshMexico:async()=>{mexico++;}};
 assert.deepEqual(await upgradeReportContent(dependencies),{markets:'refreshed',mexico:'refreshed'});assert.equal(news,1);assert.equal(mexico,1);
 const current={...dependencies,loadMarkets:async()=>({reports:[{key:'market_news',marketNews:[{}]}]}),loadMexico:async()=>({reports:[{key:'mx_production',structuralReferences:[{}]}]})};
 assert.deepEqual(await upgradeReportContent(current),{markets:'current',mexico:'current'});assert.equal(news,1);assert.equal(mexico,1);
 assert.deepEqual(await upgradeReportContent({...dependencies,refreshNews:async()=>{throw Error('Source unavailable');}}),{markets:'retry_on_next_cut',mexico:'refreshed'});
 assert.deepEqual(await upgradeReportContent({...dependencies,loadMarkets:async()=>null,loadMexico:async()=>null}),{markets:'no_snapshot',mexico:'no_snapshot'});
 console.log('Upgrade de contenido: repara cortes persistentes anteriores, conserva cortes completos y aísla fallos de fuentes; sin dependencia de envío de correo.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
