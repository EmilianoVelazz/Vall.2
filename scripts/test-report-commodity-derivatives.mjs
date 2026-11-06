import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {safeCommodityDerivatives,commodityDerivativesTables} from '../shared/report-commodity-derivatives.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {mapReportText} from '../shared/report-localized-text.mjs';
import {reportAnnex} from '../frontend/src/lib/reportLibrary.js';
const require=createRequire(import.meta.url),{parseCmeOptions,attachReportDerivatives}=require('../backend/lib/report-commodity-derivatives');
const seed=JSON.parse(fs.readFileSync('backend/data/commodity-derivatives-public-2026-10-23.json')),cutoff=seed.checkedAt,url=seed.options[0].url;
const page=(...lines)=>({lines,text:lines.join(' ')}),header='Fri, Oct 23, 2026 PRELIMINARY';
const parsed=parseCmeOptions([
 page(header,'LEAN HOGS CALL OPTIONS','TOTAL LEAN HOGS FUT 1809 39013 299200 + 2514 41989 335729','LEAN HOG CALLS','NOV26 LEAN HOGS CALL (FUTURES SETT. .00)','TOTAL 268 9178 + 137','DEC26 LEAN HOGS CALL (FUTURES SETT. 65.575 + 2.5 )'),
 page(header,'PG19 LEAN HOGS CALL OPTIONS','LEAN HOGS CALL OPTIONS','TOTAL 400 20 9999 - 27','UNKNOWN PRODUCT CALLS','JAN27','TOTAL 10 123456 + 7','OPTIONS EOOS, BLOCKS and EXERCISES','LEAN HOG CALLS','FEB27','TOTAL 1 777 + 1'),
],{url,retrievedAt:cutoff});
assert.equal(parsed.options.length,2,'Only known products and actual option totals are accepted');
assert.deepEqual(parsed.options.map(item=>[item.contractMonth,item.openInterest,item.changeOpenInterest]),[['2026-11',9178,137],['2026-12',9999,-27]]);
assert.equal(parsed.futures[0].openInterest,299200,'Aggregate futures counts are not option counts or volumes');
const feeder=parseCmeOptions([page(header,'FEEDER CATTLE CALL OPTIONS','TOTAL FDR CATTLE FUT 0 19462 64644 + 813 31466 82016','FEEDER CATTLE CALLS','FDR CATTLE CALL','NOV26 FDR CATTLE CALL (FUTURES SETT. 348.125 + 120.0 )','TOTAL 387 12157 + 79','FEEDER CATTLE PUTS','FDR CATTLE PUT','NOV26 FDR CATTLE PUT (FUTURES SETT. 348.125 + 120.0 )','TOTAL 427 18597 + 77')],{url,retrievedAt:cutoff});
assert.deepEqual(feeder.options.map(item=>[item.symbol,item.side,item.openInterest]),[['GF=F','call',12157],['GF=F','put',18597]],'The published FDR CATTLE abbreviation preserves the same product identity');
assert.equal(feeder.futures[0].openInterest,64644);
const wheat=parseCmeOptions([page(header,'WHEAT FUT'),page(header,'371 126843 523737 - 3905 105046 526213','UNKNOWN FUT','1 2 999999 + 1 4 5')],{url,retrievedAt:cutoff});
assert.deepEqual(wheat.futures.map(item=>[item.symbol,item.openInterest,item.page]),[['ZW=F',523737,2]],'A continued futures total retains its product but cannot leak into an unknown contract');
assert.equal(parseCmeOptions([page(header),page('Mon, Oct 26, 2026 FINAL')],{url,retrievedAt:cutoff}).options.length,0,'Mixed dated documents are rejected');
assert.equal(safeCommodityDerivatives(seed,cutoff).options.length,18);
assert.equal(safeCommodityDerivatives({options:[null,42,[],seed.options[0]]},cutoff).options.length,1,'Malformed entries cannot crash an export');
for(const [field,value] of [['date','2026-10-27'],['date','2026-02-30'],['retrievedAt','2026-10-27T00:00:00Z'],['url','https://example.invalid/prices'],['openInterest',-1],['openInterest',1.5],['contractMonth','2026-01']])assert.equal(safeCommodityDerivatives({options:[{...seed.options[0],[field]:value}]},cutoff).options.length,0,field+' is validated');
assert.equal(safeCommodityDerivatives(seed,'2026-11-01T00:00:00Z').options.length,0,'Old observations expire rather than being passed off as daily data');
assert.equal(safeCommodityDerivatives({options:[seed.options[0],{...seed.options[0],openInterest:2}]},cutoff).options.length,0,'Conflicting observations are excluded');
const refs=seed.options.map(item=>({symbol:item.symbol,label:item.label})),tables=commodityDerivativesTables({generatedAt:cutoff,marketDerivatives:seed},refs);
assert.equal(tables[0].rows.length,9);assert.equal(tables[1].rows.length,7,'Futures without a reference are not added');
assert(tables[0].rows.some(row=>row[1].includes('LO2')),'The actual WTI option series is retained');
const unpaired={...seed,options:seed.options.map(item=>item.side==='put' ? {...item,contractMonth:'2027-12'} : item)};
assert(!commodityDerivativesTables({generatedAt:cutoff,marketDerivatives:unpaired},refs).some(table=>table.printGroup==='commodity-options'),'Never compare mismatched call and put series');
const zero={...seed,options:seed.options.map(item=>({...item,openInterest:item.side==='call' ? 0 : item.openInterest}))};
assert(commodityDerivativesTables({generatedAt:cutoff,marketDerivatives:zero},refs)[0].rows.every(row=>row[4]==='—'),'Zero is valid but a zero denominator never produces an invented ratio');
const original=JSON.parse(fs.readFileSync('backend/cache/market_executive_reports.json')),before=JSON.stringify(original),snapshot=attachReportDerivatives(original,seed,{generatedAt:cutoff});
assert.equal(JSON.stringify(original),before,'Attaching derivatives does not mutate published price evidence');
assert.equal(attachReportDerivatives(snapshot,seed,{generatedAt:cutoff}),snapshot,'An identical refresh does not create a new report');
assert.equal(attachReportDerivatives(original,seed).generatedAt,attachReportDerivatives(original,seed).generatedAt,'A repeated read does not fabricate a new report generation time');
const expected={overview:[9,7],grains:[4,4],energy_metals:[2],proteins:[3,3],market_news:[]};
for(const source of snapshot.reports){
 const report={...source,collection:'markets'},model=weeklyReport(report),derivatives=model.results.filter(table=>table.derivatives && table.printGroup!=='commodity-cftc');
 for(const table of model.results.filter(table=>table.printGroup==='commodity-cftc')){assert(table.columns.includes('Cambio semanal · %'));assert(table.note.includes('No equivale al OI diario de CME'));assert(table.rows.every(row=>row[3]<row[4]),'CFTC weekly comparisons preserve both observed dates independently of CME totals');}
 assert.deepEqual(derivatives.map(table=>table.rows.length),expected[report.key]);
 assert.equal(model.blocks.some(block=>block.key==='derivatives'),derivatives.length>0);
 if(['grains','proteins'].includes(report.key)){
  const expected=report.key==='grains' ? ['ZC=F','ZS=F','ZW=F','ZM=F'] : ['HE=F','LE=F','GF=F'];
  assert.deepEqual(new Set(report.marketDerivatives.options.map(item=>item.symbol)),new Set(expected),'Each report includes every covered product and excludes unrelated derivatives');
  const content=await require('../backend/lib/report-export-content').reportExportContent(report);
  const start=content.indexOf('Call, put e interés abierto'),options=content.indexOf('Opciones de commodities · call y put');
  assert(start>=0 && options>start,'Narrative exports put options under the derivative section');
  assert.equal(content.split('### Opciones de commodities · call y put').length-1,1,'Narrative exports never duplicate the option table');
 }
 if(derivatives.length){
  assert(model.visuals.every(visual=>visual.financePalette && visual.dataInTables));
  assert(reportAnnex(report).tables.some(table=>table.title==='Derivados · respaldo de observaciones'));
  assert.deepEqual(mapReportText(report,text=>'Translated '+text).marketDerivatives,report.marketDerivatives,'Translation never changes contract identifiers, dates or integer evidence');
 }
}
const {makeReportWorkbook}=require('../backend/lib/report-workbook'),JSZip=require('jszip');
const report={...snapshot.reports.find(report=>report.key==='proteins'),collection:'markets'};
const zip=await JSZip.loadAsync(await makeReportWorkbook(report)),workbook=await zip.file('xl/workbook.xml').async('string');
const sheet=workbook.match(/<sheet name="Derivados" sheetId="(\d+)"/);assert(sheet);
const xml=await zip.file('xl/worksheets/sheet'+sheet[1]+'.xml').async('string');
assert(xml.includes('<v>9178</v>') && xml.includes('Section19_Lean_Hogs_Call_Options.pdf'),'Excel preserves exact numeric contracts and the original bulletin link');
assert.equal((xml.match(/<row /g)||[]).length,10,'Protein backup includes six options and three aggregate futures observations');
console.log('Commodity derivatives: OK · bulletin parsing, matching contracts/dates/status, expiry, conflicts, immutable evidence, four report views, annex and numeric Excel export.');
