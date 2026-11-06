'use strict';
// Updates the local public-report backup only; no mail, AI or user editions.
process.env.NODE_ENV='test';
const fs=require('node:fs/promises'),crypto=require('node:crypto');
const {config}=require('../backend/lib/report-protein-prices');
const {withDailyEvidence}=require('../backend/lib/report-daily-evidence');
(async()=>{
 const file='backend/cache/market_executive_reports.json',snapshot=JSON.parse(await fs.readFile(file,'utf8')),audit=JSON.parse(await fs.readFile('output/proteinas-america/precios-verificados.json','utf8'));
 if(audit.quotes.some(quote=>!quote.series?.length))throw Error('Falta un precio americano verificado; no se cambia el informe.');
 await fs.copyFile(file,'output/proteinas-america/antes-market-reports.json',require('node:fs').constants.COPYFILE_EXCL).catch(error=>{if(error.code!=='EEXIST')throw error;});
 const generatedAt=new Date().toISOString(),tickers=new Set(audit.quotes.map(quote=>quote.ticker)),{weeklyReport}=await import('../shared/report-weekly.mjs');
 const reports=snapshot.reports.map(report=>{
   if(!['proteins','overview'].includes(report.key))return report;
   const proteins=[...(report.sourceSnapshot?.proteins || []).filter(quote=>!tickers.has(quote.ticker)),...audit.quotes];
   const updated=withDailyEvidence({...report,generatedAt,proteinCatalogVersion:config.version,proteinPricesCheckedAt:generatedAt,sessionObservations:undefined,dailyReferences:undefined,sourceSnapshot:{...report.sourceSnapshot,proteins},sources:[...new Set([...(report.sources || []),...audit.quotes.map(quote=>quote.source)])],sourceLinks:[...new Map([...(report.sourceLinks || []),...audit.quotes.map(quote=>({label:quote.label+' · '+quote.source,url:quote.url}))].map(quote=>[quote.url,quote])).values()]});
   if(report.key==='proteins'){const model=weeklyReport({...updated,collection:'markets'});updated.summary=model.summary;updated.content=[updated.title,model.summary,model.coverage,...model.results.map(table=>table.title+'\n'+[table.columns,...table.rows].map(row=>row.join(' | ')).join('\n')),...model.commentary.map(item=>item.heading+'\n'+item.body)].join('\n\n');}
   return updated;
 });
 const model=weeklyReport({...reports.find(report=>report.key==='proteins'),collection:'markets'});if(model.proteinCountries.some(country=>!country.count))throw Error('Cobertura física incompleta.');
 const temporary=file+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(temporary,JSON.stringify({...snapshot,reports,generatedAt}));await fs.rename(temporary,file);}finally{await fs.unlink(temporary).catch(()=>{});}
 console.log(JSON.stringify({references:model.references.length,charts:model.visuals.length,countries:model.proteinCountries},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
