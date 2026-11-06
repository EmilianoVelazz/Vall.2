'use strict';
// Actualiza únicamente respaldos locales de datos públicos. No envía correo ni usa IA.
process.env.NODE_ENV='test';
const fs=require('node:fs/promises'),crypto=require('node:crypto');
const {loadOfficialFxHistories}=require('../backend/lib/report-official-fx');
const {loadEiaPrices}=require('../backend/lib/report-eia-prices');
const {loadMoex}=require('../backend/lib/report-moex');
const {loadPrimaryNews,selectDiverseNews}=require('../backend/lib/report-primary-news');
const {buildFxReportData}=require('../backend/lib/report-fx');
const {withDailyEvidence}=require('../backend/lib/report-daily-evidence');
const {createAnnualLibrary}=require('../backend/services/annual-report-library');
const equityConfig=require('../shared/report-equity-markets.json'),commodityConfig=require('../shared/report-commodity-markets.json');
const item=equityConfig.markets.find(item=>item.provider==='moex'),output='output/fuentes-publicas';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const write=async(file,value)=>{const temporary=file+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(temporary,JSON.stringify(value));await fs.rename(temporary,file);}finally{await fs.unlink(temporary).catch(()=>{});}};
const links=items=>items.filter(item=>item?.url && item.source).map(item=>({label:item.baseCurrency==='USD' ? item.source : [item.label,item.source].filter(Boolean).join(' · '),url:item.url}));
const mergeLinks=items=>[...new Map(items.filter(item=>item?.url).map(item=>[item.url,item])).values()];
const backup=async(file,target)=>{try{await fs.copyFile(file,target,require('node:fs').constants.COPYFILE_EXCL);}catch(error){if(error.code!=='EEXIST')throw error;}};
(async()=>{
 const {weeklyReport}=await import('../shared/report-weekly.mjs'),generatedAt=new Date().toISOString();
 await fs.mkdir(output,{recursive:true});
 const [fx,energy,moex,financeNews,marketNews]=await Promise.all([
   loadOfficialFxHistories({cutoff:generatedAt}),loadEiaPrices({cutoff:generatedAt,historyLimit:20000}),loadMoex(item,{cutoff:generatedAt}),loadPrimaryNews({area:'finance',cutoff:generatedAt}),loadPrimaryNews({area:'markets',cutoff:generatedAt}),
 ]);
 if(fx.length<6 || energy.some(item=>!item.series.length) || !moex.series.length)throw Error('La verificación en vivo no recuperó las series nuevas completas; no se modifica el respaldo.');
 const finish=(report,collection)=>{
   report=withDailyEvidence({...report,collection,generatedAt,sessionObservations:undefined,dailyReferences:undefined});
   const model=weeklyReport(report);report.summary=model.summary;
   report.content=[report.title,model.summary,model.coverage,...model.results.map(table=>table.title+'\n'+[table.columns,...table.rows].map(row=>row.join(' | ')).join('\n')),...(model.commentary || []).map(item=>item.heading+'\n'+item.body),...(report.sourceLinks || []).map(item=>item.label+': '+item.url)].filter(Boolean).join('\n\n');
   return report;
 };
 for(const [collection,file] of [['finance','finance_executive_reports.json'],['markets','market_executive_reports.json']]){
   const target='backend/cache/'+file,snapshot=await read(target);await backup(target,output+'/antes-'+file);
   const reports=snapshot.reports.map(original=>{
     let report={...original},quotes=[];
     const primary=collection==='finance' ? financeNews : marketNews;
     const headlines=selectDiverseNews([...primary,...(report.headlines || report.sourceSnapshot?.headlines || [])],{cutoff:generatedAt});
     if(collection==='finance' && report.key==='fx') {
       const codes=new Set(fx.map(item=>item.quoteCurrency));
       const histories=[...fx,...(report.sourceSnapshot?.fxHistories || []).filter(item=>!codes.has(item.quoteCurrency))];
       report={...report,...buildFxReportData({histories,previous:report,generatedAt}),sections:(report.sections || []).filter(section=>!section.text?.includes('Yahoo'))};
     }
     if(collection==='finance' && report.key==='equities') {
       quotes=[...(report.sourceSnapshot?.equities || []).filter(quote=>quote.id!==item.id && quote.symbol!==item.symbol),moex];
       report={...report,equityCatalogVersion:equityConfig.version,equityNews:headlines,sourceSnapshot:{...report.sourceSnapshot,equities:quotes}};
     }
     if(collection==='finance' && report.key==='bonds')report.bondNews=headlines;
     if(collection==='finance' && report.key==='overview') {
       const mxn=fx.find(item=>item.quoteCurrency==='MXN');
       if(mxn)report.sourceSnapshot={...report.sourceSnapshot,fxHistory:mxn,usdmxn:{...mxn,value:mxn.series.at(-1).value,updatedAt:mxn.series.at(-1).date}};
       report.sourceLinks=mergeLinks([...(report.sourceLinks || []),...links(fx)]);
     }
     if(collection==='markets' && ['overview','energy_metals'].includes(report.key)) {
       quotes=[...(report.sourceSnapshot?.energy || []).filter(item=>item.provider!=='eia'),...energy.map(item=>({...item,series:item.series.slice(-65)}))];
       report.sourceSnapshot={...report.sourceSnapshot,energy:quotes};
     }
     if(collection==='markets')report.commodityCatalogVersion=commodityConfig.version;
     report.headlines=headlines;report.sessionNews=headlines;
     report.sourceSnapshot={...report.sourceSnapshot,headlines};
     const used=[...quotes,...(collection==='finance' && report.key==='fx' ? fx : [])];
     const inputs=Object.values(report.sourceSnapshot).flat().filter(item=>item && typeof item==='object' && !Array.isArray(item));
     const oldNewsUrls=new Set((original.headlines || original.sourceSnapshot?.headlines || []).map(item=>item.url));
     report.sources=[...new Set([...inputs.map(item=>item.source || item.source_name),...used.map(item=>item.source),...headlines.map(item=>item.source)].filter(Boolean))];
     report.sourceLinks=mergeLinks([...(report.sourceLinks || []).filter(item=>!oldNewsUrls.has(item.url)),...links(used),...headlines.map(item=>({label:item.source,url:item.url}))]);
     return finish(report,collection);
   });
   await write(target,{...snapshot,reports,generatedAt});
 }
 // Reconstrucción histórica: mismas series oficiales, recortadas al año estudiado.
 const rawFile='backend/cache/annual-history-data.json',raw=await read(rawFile);
 const historicalMoex=await loadMoex(item,{cutoff:'2025-12-31T23:59:59Z',start:'2021-12-01',end:'2025-12-31',timeoutMs:12000});
 const historicalEnergy=energy.map(quote=>({...quote,id:'SPOT-'+quote.ticker,series:quote.series.filter(point=>point.date>='2021-12-01' && point.date<'2026-01-01')}));
 if(historicalEnergy.some(quote=>!quote.series.length))throw Error('Historia EIA incompleta');
 const additions=[...historicalEnergy,{...historicalMoex,id:item.id,bucket:'equities',unit:'puntos',kind:'price'}],ids=new Set(additions.map(item=>item.id));
 const references=[...raw.references.filter(item=>!ids.has(item.id)),...additions];
 await backup(rawFile,output+'/antes-annual-history-data.json');
 const historical={...raw,generatedAt,references};await write(rawFile,historical);
 await createAnnualLibrary({load:async()=>historical}).get({refresh:true});
 const audit={generatedAt,fx:fx.map(item=>({currency:item.code,provider:item.provider,source:item.source,observations:item.series.length,last:item.series.at(-1)})),energy:energy.map(item=>({label:item.label,source:item.source,status:item.quoteStatus,last:item.series.at(-1),historicalObservations:item.series.filter(point=>point.date>='2021-12-01' && point.date<'2026-01-01').length})),equity:{label:moex.label,source:moex.source,last:moex.series.at(-1),historicalObservations:historicalMoex.series.length},financeNews:financeNews.map(item=>({source:item.source,publishedAt:item.publishedAt,title:item.title})),marketNews:marketNews.map(item=>({source:item.source,publishedAt:item.publishedAt,title:item.title})),note:'Sólo documentos publicados en el día del corte; sin publicaciones nuevas no se rellenan las noticias.'};
 await fs.writeFile(output+'/auditoria.json',JSON.stringify(audit,null,2));
 console.log(JSON.stringify(audit));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
