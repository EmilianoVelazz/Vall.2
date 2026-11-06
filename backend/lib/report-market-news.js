'use strict';
const {loadFinancialNews,buildFinancialNewsReport}=require('./report-financial-news');
const {translateFinancialNews}=require('./report-financial-news-translation');
const {safeMarketNews}=require('../../shared/report-market-news.mjs');
async function loadMarketNews({cutoff=new Date().toISOString(),previous=[],other=[]}={}){
 const loaded=await loadFinancialNews({cutoff,previous,other,area:'markets',searches:['granos cosechas maíz trigo soya','proteínas ganado cerdo pollo huevo Estados Unidos USDA','energía petróleo gas metales demanda','comercio granos exportaciones aranceles logística','sanidad animal aviar porcina','cosecha sequía clima agricultura mundial'],feeds:[{source:'Agroinformación',url:'https://agroinformacion.com/feed/'},{source:'El País · Economía',url:'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada'}],select:safeMarketNews});
 return {...loaded,stories:safeMarketNews(await translateFinancialNews(loaded.stories),cutoff)};
}
function buildMarketNewsReport({stories=[],generatedAt=new Date().toISOString(),status='current'}={}){
 const marketNews=safeMarketNews(stories,generatedAt),base=buildFinancialNewsReport({generatedAt,stories:[]});
 return {...base,key:'market_news',collection:'markets',title:'Noticias de mercados · Inteligencia sectorial',eyebrow:'Noticias del día · Oferta, costos y abastecimiento',marketNewsVersion:1,newsStatus:marketNews.length ? 'current' : status,financialNews:undefined,marketNews,headlines:marketNews,summary:marketNews.length ? 'Noticias del día relacionadas con oferta, demanda, sanidad, energía, comercio y abastecimiento.' : 'No se recuperaron noticias sectoriales fechadas en este día.',sources:[...new Set(marketNews.map(item=>item.source))],sourceLinks:marketNews.map(item=>({label:item.source+' · '+item.publishedAt.slice(0,10),url:item.url}))};
}
module.exports={loadMarketNews,buildMarketNewsReport};
