'use strict';
const crypto=require('node:crypto');
const {compactPanoramaPart,PANORAMA_VERSION,PANORAMA_MAX_BYTES}=require('../../shared/report-panorama.mjs');
const {marketEvidence}=require('../../shared/report-market-analysis.mjs');
const {scopeUsProteinReport}=require('../../shared/report-protein-scope.mjs');
function composeMarketOverview(snapshot){
 const feed=snapshot?.reports?.find(item=>item.key==='grains')?.sourceSnapshot?.grains || [];
 if(feed.length)snapshot={...snapshot,reports:snapshot.reports.map(report=>report.key==='proteins' ? {...report,proteinFeed:feed.filter(item=>['ZC=F','ZM=F'].includes(item.symbol || item.ticker))} : report)};
 const news=snapshot?.reports?.find(item=>item.key==='market_news'),{safeMarketNews}=require('../../shared/report-market-news.mjs');
 if(news)snapshot={...snapshot,reports:snapshot.reports.map(report=>['grains','energy_metals','proteins'].includes(report.key) ? {...report,sessionNews:safeMarketNews(news.marketNews || news.headlines || [],report.generatedAt).filter(item=>report.key==='proteins' ? ['livestock','health','trade'].includes(item.topic) && /estados unidos|united states|USDA|\bU\.S\./i.test(item.title+' '+item.originalTitle+' '+item.description+' '+item.source) : (report.key==='grains' ? ['crop','weather','trade'] : ['energy','weather','trade']).includes(item.topic)).slice(0,4)} : report)};
 const prior=snapshot?.reports?.find(report=>report.key==='overview');if(!prior)return snapshot;
 const parts=['grains','energy_metals','proteins'].flatMap(key=>{const report=snapshot.reports.find(item=>item.key===key);return report && Number.isFinite(Date.parse(report.generatedAt)) && Date.parse(report.generatedAt)<=Date.now() ? [{key,generatedAt:report.generatedAt,context:report.sessionNews || [],history:marketEvidence(scopeUsProteinReport({...report,collection:'markets'})).map(item=>({...item,category:key}))}] : [];});if(!parts.length)return snapshot;
 const newsTime=Date.parse(news?.generatedAt),cutoff=new Date(Math.max(...parts.map(item=>Date.parse(item.generatedAt)),Number.isFinite(newsTime) && newsTime<=Date.now() ? newsTime : 0)).toISOString(),context=news ? safeMarketNews(news.marketNews || news.headlines || [],cutoff).slice(0,2) : [];
 const panoramaParts=snapshot.reports.filter(report=>['grains','energy_metals','proteins','market_news'].includes(report.key) && Number.isFinite(Date.parse(report.generatedAt)) && Date.parse(report.generatedAt)<=Date.parse(cutoff)).map(report=>compactPanoramaPart(report,'markets',cutoff));
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify({parts,context,panoramaParts})).digest('hex');if(prior.marketOverviewFingerprint===fingerprint && prior.panoramaVersion===PANORAMA_VERSION)return snapshot;
 const history=parts.flatMap(item=>item.history),sources=[...new Set(history.map(item=>item.source).filter(Boolean))],sourceLinks=[...new Map(history.filter(item=>item.url).map(item=>[item.url,{label:item.source,url:item.url}])).values()];
 const overview={...prior,collection:'markets',title:'Panorama de Mercados',generatedAt:cutoff,marketOverviewVersion:2,marketOverviewFingerprint:fingerprint,panoramaVersion:PANORAMA_VERSION,panoramaParts,marketHistory:undefined,sessionNews:undefined,sourceSnapshot:null,dailyReferences:undefined,sessionObservations:undefined,metrics:[],tables:[],visuals:[],sections:[],takeaways:[],watchlist:[],summary:'Lectura integrada de granos, energía, metales y proteínas, con las referencias vigentes y su frecuencia original.',objective:'Relacionar los mercados con compras, inventarios y margen sin combinar productos, monedas o bases comerciales incompatibles.',content:'',sources,sourceLinks};
 if(Buffer.byteLength(JSON.stringify(overview))>PANORAMA_MAX_BYTES)throw Error('El panorama de Mercados supera el límite de evidencia.');
 return {...snapshot,reports:snapshot.reports.map(item=>item.key==='overview' ? overview : item)};
}
module.exports={composeMarketOverview};
