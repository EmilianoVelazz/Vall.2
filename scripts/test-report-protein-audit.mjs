import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {marketAnalysisTables,marketPeriods,marketEvidence} from '../shared/report-market-analysis.mjs';
import {proteinAmericasComparison} from '../shared/report-protein-americas.mjs';
import {mercolleidaMarkets} from '../shared/report-mercolleida.mjs';
import {executivePrintEdition} from '../shared/report-print-edition.mjs';
import {availablePresentationModel,availableReportTables,missingReportValue} from '../shared/report-available-data.mjs';
import {createReportDraft} from '../frontend/src/lib/reportCreation.js';
import {mapReportText} from '../shared/report-localized-text.mjs';
import {safeProteinMarketContext} from '../shared/report-protein-quality.mjs';
const require=createRequire(import.meta.url),{loadMercolleidaMarkets}=require('../backend/lib/report-mercolleida');
for(const cutoff of ['2019-12-31T23:59:59Z','invalid']){
 assert.deepEqual(loadMercolleidaMarkets({cutoff}),[],'The backend never substitutes future catalog observations');
 assert.deepEqual(mercolleidaMarkets(cutoff),[],'Reader and backend share the cutoff validation');
}
for(const cutoff of ['2020-01-15T23:59:59Z','2026-11-04T22:00:00Z']){
 const backend=loadMercolleidaMarkets({cutoff});assert.deepEqual(backend,mercolleidaMarkets(cutoff));
 assert(backend.every(item=>item.quoteStatus==='reference' && item.evidenceOrigin==='catalog'));
 assert(backend.every(item=>item.series.every(point=>Date.parse(point.date)<=Date.parse(cutoff))));
 if(cutoff.startsWith('2020-01-15'))assert(backend.every(item=>item.previous===null && item.change===null),'One observation never invents a zero change');
}
const points=[['2020-11-03',50],['2025-11-03',100],['2026-05-01',120],['2026-08-03',140],['2026-10-02',160],['2026-10-27',180],['2026-11-02',190],['2026-11-03',200]].map(([date,value])=>({date,value}));
const us={label:'Cerdo · Estados Unidos',country:'Estados Unidos',symbol:'HE=F',unit:'US¢/lb',cadence:'daily',source:'SIMULACIÓN',url:'https://example.invalid',points,last:points.at(-1),previous:points.at(-2),periods:marketPeriods(points)};
const fx={base:'USD',rates:{USD:1,MXN:20},observedAt:'2026-11-04T00:00:00Z',source:'SIMULACIÓN',url:'https://example.invalid/fx'},cutoff='2026-11-04T22:00:00Z';
const comparison=proteinAmericasComparison([us],{fx,cutoff}),table=comparison.tables[0];
for(const label of ['Día anterior','Semana','Mes','Trimestre','Semestre','Año'])assert(table.columns.includes(label+' · %'));
assert.equal(table.rows[0][table.columns.indexOf('Equivalente MXN')],'40','200 US cents/lb become 2 USD/lb and 40 MXN/lb');
assert.equal(comparison.annexTables.find(item=>item.title.includes('equivalencias')).rows[0][4],'MXN/lb','Currency conversion keeps the physical denominator');
for(const [label,key] of [['Día anterior','day'],['Semana','week'],['Mes','month'],['Trimestre','quarter'],['Semestre','semester'],['Año','year']]){
 const row=comparison.annexTables[0].rows.find(row=>row[3]===label);assert.equal(row[8],us.periods[key].value);assert.equal(row[5],us.periods[key].baseDate);
}
for(const observedAt of ['2026-10-01T00:00:00Z','2026-11-05T00:00:00Z'])assert(!proteinAmericasComparison([us],{fx:{...fx,observedAt},cutoff}).tables[0].columns.includes('Equivalente MXN'),'Future and stale FX cannot produce equivalent prices');
const shortReport={key:'proteins',collection:'markets',title:'SIMULACIÓN',generatedAt:cutoff,sourceSnapshot:{proteins:[{...us,market:'Estados Unidos',series:points.slice(-2)}]}};
assert(!marketAnalysisTables(shortReport).flatMap(item=>item.rows).some(row=>row[1]==='Desde 2020'),'A short series never acquires a fake 2020 horizon');
const historyReport={...shortReport,sourceSnapshot:{proteins:[{...us,market:'Estados Unidos',series:points}]}};
const historical=marketAnalysisTables(historyReport)[0].rows;
assert.equal(historical.filter(row=>row[1]==='Desde 2020').length,1,'History is not duplicated under two internal aliases');
assert.equal(new Set(historical.map(row=>JSON.stringify(row))).size,historical.length);
const source=JSON.parse(await fs.readFile('backend/cache/market_executive_reports.json','utf8')).reports.find(item=>item.key==='proteins'),original=JSON.stringify(source),model=weeklyReport(source),edition=executivePrintEdition(model,{rows:120,charts:4,selectPrices:true});
const comment={title:'Comentario porcino · SIMULACIÓN',description:'SIMULACIÓN: comentario público para probar su conservación, sin noticias reales.',publishedAt:'2026-11-03',source:'Mercolleida',url:'https://www.mercolleida.com/es/'};
assert.equal(safeProteinMarketContext([comment,comment],cutoff).length,1);
for(const invalid of [{...comment,publishedAt:'2026-11-05'},{...comment,publishedAt:'2026-10-01'},{...comment,url:'https://example.invalid'},{...comment,url:'javascript:alert(1)'}])assert.deepEqual(safeProteinMarketContext([invalid],cutoff),[]);
const contextual={...historyReport,proteinMarketContext:[comment]},normalized=require('../backend/lib/report-daily-evidence').withDailyEvidence(contextual);
assert(weeklyReport(normalized).summaryPanels.some(panel=>panel.summaryKind==='context' && panel.body.includes(comment.description)),'Normalization must not erase dated public context');
assert(createReportDraft('markets',normalized).report.proteinMarketContext.length,'Saved copies retain the public comment separately from price observations');
assert(weeklyReport(require('../backend/routes/export')._test.executivePayload(normalized)).summaryPanels.some(panel=>panel.summaryKind==='context' && panel.body.includes('SIMULACIÓN')),'The actual export payload retains public context');
const physicalReport={...historyReport,sourceSnapshot:{proteins:[{...us,symbol:'AMS-FIXTURE',market:'Estados Unidos',series:points,unit:'USD/100 lb',quoteStatus:'verified'}]}};
assert(weeklyReport(physicalReport).summaryPanels.find(panel=>panel.summaryKind==='implications').body.includes('+10 USD/100 lb'),'The business implication uses the absolute change and original physical denominator');
const twoComments=[comment,{...comment,title:'Comentario vacuno · SIMULACIÓN'}],expanded=weeklyReport({...source,proteinFundamentals:[],proteinMarketContext:twoComments});
assert.equal(expanded.annexTables.find(table=>table.title==='Proteínas · contexto publicado').rows.length,2,'The complete public context remains in annexes');
const printedContext=executivePrintEdition(expanded,{rows:120,charts:4,selectPrices:true}).summaryPanels.find(panel=>panel.summaryKind==='context');
assert(printedContext.body.includes(comment.description) && !printedContext.body.includes(twoComments[1].title),'The PDF selects a complete contextual item rather than cutting sentences');
assert(edition.summaryPanels.some(panel=>panel.summaryKind==='implications'),'Compact PDFs retain business implications');
const quality=model.annexTables.find(item=>item.title.includes('actualización y procedencia')),displaced=model.annexTables.find(item=>item.title==='Referencias de respaldo desplazadas por fuentes directas');assert.equal(quality.rows.length,model.references.length+(displaced?.rows.length || 0),'Provenance includes the catalog references moved to the annex, excluding stale observations');
assert(model.references.some(item=>item.quoteStatus==='reference'));assert(model.references.some(item=>item.provider==='ams'));
assert(model.annexTables.some(table=>table.proteinCurrency && table.columns.includes('Equivalente MXN')),'The full original-denominator MXN equivalence remains in the annex');
assert(model.annexTables.some(table=>table.columns.includes('Mes · %') && table.columns.includes('Trimestre · %')),'All six horizons remain available behind the shorter sector board');
const clean=availablePresentationModel(model);for(const table of [...clean.results,...availableReportTables([quality])])for(const row of table.rows)assert(row.every(value=>!missingReportValue(value)),'No empty presentation fields');
const draft=createReportDraft('markets',source).report,copy=marketEvidence(draft);
for(const reference of marketEvidence(source)){const item=copy.find(item=>item.label===reference.label && item.unit===reference.unit);assert(item);assert.equal(item.quoteStatus,reference.quoteStatus);assert.equal(item.retrievedAt,reference.retrievedAt);}
const mapped=mapReportText({summaryKind:'implications',quoteStatus:'reference',evidenceOrigin:'catalog',retrievedAt:cutoff},value=>'translated:'+value);
assert.deepEqual(mapped,{summaryKind:'implications',quoteStatus:'reference',evidenceOrigin:'catalog',retrievedAt:cutoff});
assert.equal(JSON.stringify(source),original);
console.log('Protein audit: no future catalog fallback, no false zero or 2020 history, six exact horizons, dated FX and units, protected business implications, traceable provenance and immutable saved copies.');
