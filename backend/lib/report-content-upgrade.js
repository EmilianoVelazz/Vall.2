'use strict';
// Complete the deployed content schema using normal server workers. No mail delivery is invoked.
async function upgradeReportContent({loadMarkets,refreshNews,loadMexico,refreshMexico}){
 const entries=await Promise.allSettled([
  (async()=>{const snapshot=await loadMarkets(),news=snapshot?.reports?.find(item=>item.key==='market_news');
   if(!news)return 'no_snapshot';if(news.marketNews?.length)return 'current';await refreshNews(snapshot);return 'refreshed';})(),
  (async()=>{const snapshot=await loadMexico(),production=snapshot?.reports?.find(item=>item.key==='mx_production');
   if(!production)return 'no_snapshot';if(production.structuralReferences?.length)return 'current';await refreshMexico();return 'refreshed';})(),
 ]);
 return Object.fromEntries(entries.map((item,index)=>[['markets','mexico'][index],item.status==='fulfilled'?item.value:'retry_on_next_cut']));
}
module.exports={upgradeReportContent};
