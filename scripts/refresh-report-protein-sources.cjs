'use strict';
// Only updates the local public-data backup; no mail, AI or user editions.
process.env.NODE_ENV='test';
const fs=require('node:fs/promises'),crypto=require('node:crypto');
const {config}=require('../backend/lib/report-protein-prices');
const {withDailyEvidence}=require('../backend/lib/report-daily-evidence');
(async()=>{
 const file='backend/cache/market_executive_reports.json',snapshot=JSON.parse(await fs.readFile(file,'utf8'));
 const publicData=JSON.parse(await fs.readFile('output/proteinas-fuentes/consulta-publica.json','utf8'));
 for(const quote of publicData.quotes){const item=config.markets.find(item=>item.ticker===quote.ticker);if(item)quote.basis=item.basis;}
 if(publicData.quotes.filter(quote=>quote.provider==='dgagri' && quote.quoteStatus==='verified').length<15 || !publicData.tables.length)throw Error('Evidencia pública incompleta; se conserva el respaldo.');
 const generatedAt=new Date().toISOString(),{weeklyReport}=await import('../shared/report-weekly.mjs');
 await fs.copyFile(file,'output/proteinas-fuentes/antes-market-reports.json',require('node:fs').constants.COPYFILE_EXCL).catch(error=>{if(error.code!=='EEXIST')throw error;});
 const providers=new Set(config.markets.map(item=>item.provider));
 const reports=snapshot.reports.map(report=>{
   if(!['proteins','overview'].includes(report.key))return report;
   const proteins=[...(report.sourceSnapshot?.proteins || []).filter(item=>!providers.has(item.provider)),...publicData.quotes];
   const sourceLinks=[...new Map([{label:'Mercolleida · tendencias y comentarios públicos',url:'https://www.mercolleida.com/es/'},...publicData.quotes.map(item=>({label:item.label+' · '+item.source,url:item.url})),...(report.sourceLinks || [])].map(item=>[item.url,item])).values()];
   const updated=withDailyEvidence({...report,generatedAt,proteinCatalogVersion:config.version,proteinPricesCheckedAt:generatedAt,sessionObservations:undefined,dailyReferences:undefined,sourceSnapshot:{...report.sourceSnapshot,proteins},sourceLinks,sources:[...new Set([...proteins.map(item=>item.source),'Mercolleida · tendencias y comentarios públicos',...(report.sources || [])])],tables:report.key==='proteins' ? [...(report.tables || []).filter(table=>!/^Mercolleida ·/.test(table.title)),...publicData.tables] : report.tables});
   const model=weeklyReport({...updated,collection:'markets'});updated.summary=model.summary;updated.content=[updated.title,model.summary,model.coverage,...model.results.map(table=>table.title+'\n'+[table.columns,...table.rows].map(row=>row.join(' | ')).join('\n')),...model.commentary.map(item=>item.heading+'\n'+item.body)].join('\n\n');return updated;
 });
 const temporary=file+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(temporary,JSON.stringify({...snapshot,reports,generatedAt}));await fs.rename(temporary,file);}finally{await fs.unlink(temporary).catch(()=>{});}
 const model=weeklyReport({...reports.find(report=>report.key==='proteins'),collection:'markets'});
 console.log(JSON.stringify({references:model.references.length,withPrice:model.references.filter(item=>item.last).length,charts:model.visuals.length,sources:model.proteinSources},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
