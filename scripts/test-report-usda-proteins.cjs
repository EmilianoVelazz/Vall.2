'use strict';
process.env.NODE_ENV='test';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const assert=require('node:assert/strict'),fs=require('node:fs'),PDFDocument=require('pdfkit');
const {markets,parseUsdaProteinPages,loadUsdaProteins}=require('../backend/lib/report-usda-proteins');
const {mergeProteinSeries,matchingProteinSeries}=require('../backend/lib/report-protein-series');
const fixtures=require('./lib/usda-protein-public-fixtures.json'),cutoff='2026-11-04T23:59:59Z';
const clone=value=>JSON.parse(JSON.stringify(value));
async function pdf(lines){return new Promise(resolve=>{const document=new PDFDocument({size:'A4',margin:36}),chunks=[];document.on('data',chunk=>chunks.push(chunk));document.on('end',()=>resolve(Buffer.concat(chunks)));for(const line of lines)document.font('Helvetica').fontSize(8).text(line,{lineGap:2});document.end();});}
(async()=>{
 const records=Object.fromEntries(markets.map(item=>[item.ticker,parseUsdaProteinPages(fixtures[item.report],item,cutoff)]));
 assert.deepEqual(records['USDA-CHICKEN-WHOLE'].points,[{date:'2026-10-30',value:117.37}],'No invented date for the preceding chicken week');
 assert.deepEqual(records['USDA-EGG-NATIONAL-INDEX'].points,[{date:'2026-11-03',value:39.36},{date:'2026-11-04',value:40.17}]);
 assert.deepEqual(records['USDA-EGG-MIDWEST-CARTON'].points,[{date:'2026-10-23',value:53.5},{date:'2026-10-30',value:53.5}]);
 assert.equal(records['USDA-EGG-MIDWEST-CARTON'].reportPeriodEnd,'2026-10-31','The original week remains distinct from publication date');
 assert.deepEqual(records['USDA-EGG-LIQUID-WHOLE'].points,[{date:'2026-10-23',value:13.77},{date:'2026-10-30',value:17}]);
 for(const item of markets){assert.throws(()=>parseUsdaProteinPages(fixtures[item.report],item,'2026-10-01T00:00:00Z'));const wrong=clone(fixtures[item.report]);wrong[0].lines=wrong[0].lines.map(line=>line.replace('Cents Per Lb','Dollars Per Dozen').replace('Cents Per Dozen','Dollars Per Pound').replace('cents per pound','dollars per dozen'));assert.throws(()=>parseUsdaProteinPages(wrong,item,cutoff));}
 const egg=markets.find(item=>item.report==='2843'),wrongSystem=clone(fixtures['2843']);wrongSystem[0].lines=wrongSystem[0].lines.filter(line=>line!=='NATIONAL SHELL EGGS¹ - Caged');assert.throws(()=>parseUsdaProteinPages(wrongSystem,egg,cutoff));
 const duplicate=clone(fixtures['2843']);duplicate[0].lines.splice(duplicate[0].lines.findIndex(line=>/^White Large /.test(line)),0,'White Large 1,000 29.00 - 58.00 40.00 0.64 39.36 180.33');assert.throws(()=>parseUsdaProteinPages(duplicate,egg,cutoff));
 const malformed=clone(fixtures['2843']);malformed[0].lines=malformed[0].lines.map(line=>line.replace('29.00 - 58.00 40.17','29.00 - 38.00 40.17'));assert.throws(()=>parseUsdaProteinPages(malformed,egg,cutoff));
 const noPrior=clone(fixtures['2843']);noPrior[0].lines=noPrior[0].lines.map(line=>line.replace('40.17 0.81 39.36 180.33','40.17 180.33'));assert.equal(parseUsdaProteinPages(noPrior,egg,cutoff).points.length,1,'An absent column never becomes the preceding price');
 const item=markets[0],prior={...item,quoteStatus:'verified',series:[{date:'2020-01-02',value:50},{date:'2026-10-23',value:117.39}],retrievedAt:'2026-10-24T00:00:00Z'};
 assert(matchingProteinSeries(item,prior));assert(!matchingProteinSeries(item,{...prior,unit:'USD/lb'}));assert(!matchingProteinSeries(item,{...prior,provider:'mercolleida',evidenceOrigin:'catalog'}));
 const merged=mergeProteinSeries(item,[{date:'2026-10-30',value:117.37}],prior,cutoff);assert.equal(merged.series[0].date,'2020-01-02');assert.equal(merged.series.length,3);
 const revised=mergeProteinSeries(item,[{date:'2026-10-23',value:118},{date:'2026-10-30',value:117.37}],prior,cutoff);assert.equal(revised.series.find(point=>point.date==='2026-10-23').value,118,'A validated revision replaces the same date, not its history');
 assert.throws(()=>mergeProteinSeries(item,[{date:'2026-10-30',value:10},{date:'2026-10-30',value:20}],prior,cutoff),'Conflicting fresh points are not rescued as a successful consultation');
 assert(!mergeProteinSeries(item,[{date:'2020-01-02',value:50}],prior,cutoff).validatedLatest,'An older response cannot revalidate the latest cached price');
 const documents=Object.fromEntries(await Promise.all(markets.map(async item=>[item.url,await pdf(fixtures[item.report][0].lines)]))),loaded=await loadUsdaProteins({cutoff,previous:[prior],read:async url=>documents[url]});
 assert(loaded.every(quote=>quote.quoteStatus==='verified' && /^[a-f0-9]{64}$/.test(quote.sourceDocumentHash)));
 assert(loaded[0].series.some(point=>point.date==='2020-01-02'));assert(Math.abs(loaded[1].change-(40.17/39.36-1)*100)<1e-10,'USDA change in cents is not reused as a percentage');
 const failed=await loadUsdaProteins({cutoff,previous:loaded,read:async()=>{throw Error('offline fixture');}});assert(failed.every(quote=>quote.quoteStatus==='preserved'));assert.deepEqual(failed.map(quote=>quote.series),loaded.map(quote=>quote.series));assert.deepEqual(failed.map(quote=>quote.retrievedAt),loaded.map(quote=>quote.retrievedAt));
 const {weeklyReport}=await import('../shared/report-weekly.mjs'),{proteinReportReference}=await import('../shared/report-protein-scope.mjs');
 assert(loaded.every(proteinReportReference));assert(!proteinReportReference({...loaded[3],provider:'unknown'}));
 const report={key:'proteins',collection:'markets',title:'SIMULACIÓN · boletines USDA',generatedAt:cutoff,sourceSnapshot:{proteins:loaded},tables:[],sections:[],metrics:[],visuals:[],marketFx:{base:'USD',rates:{USD:1,MXN:20},observedAt:'2026-11-04T00:00:00Z',source:'SIMULACIÓN',url:'https://example.invalid/fx'}},model=weeklyReport(report),original=JSON.stringify(report);
 assert.equal(model.references.length,4);assert(model.references.some(reference=>reference.sector==='Procesados y alternativas'));
 assert(model.annexTables.some(table=>table.title.includes('documentos y períodos originales') && table.rows.length===4));
 for(const table of model.results.filter(table=>table.proteinCurrency))for(const row of table.rows){const reference=model.references.find(item=>row[0].endsWith(item.label));assert(Math.abs(Number(row[table.columns.indexOf('Equivalente MXN')].replaceAll(',',''))-reference.last.value/100*20)<.001);}
 const {createReportDraft}=await import('../frontend/src/lib/reportCreation.js');assert.equal(weeklyReport(createReportDraft('markets',report).report).references.length,4);assert.equal(JSON.stringify(report),original);
 if(process.argv.includes('--live')){const live=await loadUsdaProteins();for(const quote of live)console.log({ticker:quote.ticker,status:quote.quoteStatus,date:quote.observedAt,value:quote.value,unit:quote.unit});assert(live.every(quote=>quote.quoteStatus==='verified'));fs.mkdirSync('output/proteinas-investigacion-20261104',{recursive:true});fs.writeFileSync('output/proteinas-investigacion-20261104/usda-live.json',JSON.stringify(live,null,2));}
 console.log('USDA proteins: four dated public documents, correct cents and physical units, separate rolling index/weekly prices, processed egg scope, archive retention, revisions, safe failure and saved copies.');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
