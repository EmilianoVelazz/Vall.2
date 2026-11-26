'use strict';
const assert=require('node:assert/strict');
const newsPath=require.resolve('../backend/lib/report-financial-news');
const translationPath=require.resolve('../backend/lib/report-financial-news-translation');
const originalNews=require(newsPath),originalTranslation=require(translationPath);
let fixture={stories:[],status:'empty'},loaderOptions;
require.cache[newsPath].exports={...originalNews,loadFinancialNews:async options=>{loaderOptions=options;return fixture;}};
require.cache[translationPath].exports={...originalTranslation,translateFinancialNews:async stories=>stories};
const {loadMarketNews,buildMarketNewsReport}=require('../backend/lib/report-market-news');
const cutoff='2026-11-26T18:00:00Z';
const current={title:'Cosecha de maíz y exportaciones: comunicado de prueba',description:'Noticia sintética; no es información de mercado.',source:'Fuente de prueba',url:'https://example.invalid/market-news-fixture',publishedAt:'2026-11-26T15:00:00Z'};
const old={...current,publishedAt:'2026-11-24T12:00:00Z'};
async function main(){
 try{
  for(const status of ['current','empty','unavailable']){
   fixture={stories:[old],status};
   const loaded=await loadMarketNews({cutoff,previous:[old]});
   assert.equal(loaderOptions.lookbackDays,1,'Seleccionar noticias del mismo día desde la recuperación, antes de aplicar el límite de historias');
   assert.equal(loaded.stories.length,0);assert.equal(loaded.status,status==='unavailable'?'unavailable':'empty');
   const report=buildMarketNewsReport({stories:fixture.stories,generatedAt:cutoff,status});
   assert.equal(report.marketNews.length,0);assert.equal(report.newsStatus,loaded.status);
   assert.equal(report.sourceLinks.length,0);assert.equal(report.headlines.length,0);
  }
  fixture={stories:[current,old],status:'current'};
  const loaded=await loadMarketNews({cutoff,previous:[old]});
  assert.equal(loaded.stories.length,1);assert.equal(loaded.status,'current');
  const report=buildMarketNewsReport({stories:loaded.stories,generatedAt:cutoff,status:loaded.status});
  assert.equal(report.newsStatus,'current');assert.equal(report.marketNews.length,1);
  assert.equal(report.sourceLinks.length,1);
  assert.equal(buildMarketNewsReport({generatedAt:cutoff}).newsStatus,'empty');
  const boundary=buildMarketNewsReport({generatedAt:'2026-11-27T03:00:00Z',stories:[{...current,publishedAt:'2026-11-27T02:00:00Z'},{...old,publishedAt:'2026-11-26T03:00:00Z'}]});
  assert.equal(boundary.marketNews.length,1,'La ventana diaria usa la fecha de CDMX');
  console.log('Noticias de Mercados: carga e informe conservan la misma ventana diaria; estados vacío, no disponible y actualizado coherentes, incluidas fechas CDMX.');
 }finally{require.cache[newsPath].exports=originalNews;require.cache[translationPath].exports=originalTranslation;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
