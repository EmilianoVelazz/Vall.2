'use strict';
const {loadFinancialNews,buildFinancialNewsReport}=require('./report-financial-news');
const {translateFinancialNews}=require('./report-financial-news-translation');
const {safeMarketNews}=require('../../shared/report-market-news.mjs');
async function loadMarketNews({cutoff=new Date().toISOString(),previous=[],other=[]}={}){
 const loaded=await loadFinancialNews({cutoff,previous,other,area:'markets',lookbackDays:1,searches:['granos cosechas maíz trigo soya','proteínas ganado cerdo pollo huevo Estados Unidos USDA','energía petróleo gas metales demanda','comercio granos exportaciones aranceles logística','sanidad animal aviar porcina','cosecha sequía clima agricultura mundial'],feeds:[{source:'Agroinformación',url:'https://agroinformacion.com/feed/'},{source:'El País · Economía',url:'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada'},{source:'El Economista · Empresas',url:'https://www.eleconomista.com.mx/rss/empresas.xml'},{source:'El Economista · Mercados',url:'https://www.eleconomista.com.mx/rss/mercados.xml'}],select:safeMarketNews});
 const translated=await translateFinancialNews(loaded.stories,{timeoutMs:2500});
 const stories=safeMarketNews(translated,cutoff);
 return {...loaded,status:stories.length ? 'current' : loaded.status==='unavailable' ? 'unavailable' : 'empty',stories};
}
function buildMarketNewsReport({stories=[],generatedAt=new Date().toISOString(),status='current'}={}){
 const marketNews=safeMarketNews(stories,generatedAt),base=buildFinancialNewsReport({generatedAt,stories:[]});
 return {...base,key:'market_news',collection:'markets',title:'Noticias de mercados · Inteligencia sectorial',eyebrow:'Noticias del día · Oferta, costos y abastecimiento',marketNewsVersion:1,newsStatus:marketNews.length ? 'current' : status==='unavailable' ? 'unavailable' : 'empty',financialNews:undefined,marketNews,headlines:marketNews,summary:marketNews.length ? 'Noticias del día relacionadas con oferta, demanda, sanidad, energía, comercio y abastecimiento.' : 'No se recuperaron noticias sectoriales fechadas en este día.',sources:[...new Set(marketNews.map(item=>item.source))],sourceLinks:marketNews.map(item=>({label:item.source+' · '+item.publishedAt.slice(0,10),url:item.url}))};
}
module.exports={loadMarketNews,buildMarketNewsReport};
