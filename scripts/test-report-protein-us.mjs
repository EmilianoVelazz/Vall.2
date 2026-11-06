import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {isUsProteinReport,usProteinReference,scopeUsProteinReport} from '../shared/report-protein-scope.mjs';
import {marketEvidence} from '../shared/report-market-analysis.mjs';
import {createReportDraft} from '../frontend/src/lib/reportCreation.js';
import {reportAnnex} from '../frontend/src/lib/reportLibrary.js';
import {reportCsv} from '../frontend/src/lib/reportCsv.js';
import {getDocument} from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const require=createRequire(import.meta.url),{withDailyEvidence}=require('../backend/lib/report-daily-evidence'),{_test}=require('../backend/routes/export');
const dates=['2020-10-23','2021-10-22','2022-10-21','2023-10-23','2024-10-23','2025-10-23','2025-12-31','2026-04-23','2026-07-23','2026-09-23','2026-10-16','2026-10-22','2026-10-23'];
const levels=[50,60,75,90,100,120,150,160,180,200,220,240,252],points=dates.map((date,i)=>({date,value:levels[i]}));
const quote=(label,market,symbol,series=points)=>({label,market,symbol,unit:'USD/100 lb',cadence:'daily',basis:'serie de futuros de prueba',source:'Fixture',url:'https://example.invalid/'+symbol,series});
const source={key:'proteins',collection:'markets',proteinScope:'US_ONLY',title:'Proteínas',generatedAt:'2026-10-26T17:30:00Z',summary:'Antiguo resumen internacional',tables:[],sections:[],metrics:[],visuals:[],sourceSnapshot:{proteins:[quote('Cerdo magro CME','Estados Unidos','HE=F'),quote('Ganado vivo CME','United States','LE=F'),quote('Ganado de engorda CME','EE. UU.','GF=F'),quote('Canal de cerdo · Estados Unidos','Estados Unidos','AMS-PORK-CUTOUT',points.slice(-2)),quote('Canal de cerdo · México','México','FOREIGN-MX'),quote('Pollo · Brasil','Brasil','FOREIGN-BR'),quote('Huevo · Canadá','Canadá','FOREIGN-CA'),quote('Pescado · Perú','Perú','FOREIGN-PE'),quote('Pollo · Francia','Francia','FOREIGN-FR'),quote('Huevo Dalian','China','FOREIGN-CN'),quote('No identificada','','UNKNOWN'),quote('Harina de soya CBOT','Estados Unidos','ZM=F')]},marketFx:{base:'USD',rates:{USD:1,MXN:20},observedAt:'2026-10-26T00:00:00Z',source:'Fixture FX'}};
source.marketFx.url='https://example.invalid/fx';
const original=JSON.stringify(source),model=weeklyReport(source);
assert.equal(JSON.stringify(source),original,'Scope changes never modify the original stored cut');
assert.equal(model.references.length,4);assert(model.references.every(item=>item.country==='Estados Unidos'));
assert(!usProteinReference({label:'Referencia CME',market:'Brasil',exchange:'CME',symbol:'HE=F'}),'Explicit foreign origin overrides a US exchange or ticker');
assert(!usProteinReference({label:'Referencia sin país',unit:'USD/kg'}),'Dollar denomination alone does not establish US origin');
assert(isUsProteinReport(source));assert(!isUsProteinReport({...source,periodType:'annual'}));assert(!isUsProteinReport({...source,key:'mx_proteins',collection:'mexico'}));
assert.equal(scopeUsProteinReport({...source,marketDerivatives:{options:'bad',futures:{}}}).marketDerivatives.options.length,0,'Malformed evidence is safely excluded');
const ref=model.references.find(item=>item.symbol==='HE=F');
for(const [period,expected,base] of [['day',5,'2026-10-22'],['month',26,'2026-09-23'],['quarter',40,'2026-07-23'],['semester',57.5,'2026-04-23'],['year',110,'2025-10-23'],['ytd',68,'2025-12-31'],['since2020',404,'2020-10-23']]){
 assert(Math.abs(ref.periods[period].value-expected)<1e-9,period+' has the hand-checked percentage');assert.equal(ref.periods[period].baseDate,base);assert.equal(ref.periods[period].lastDate,'2026-10-23');
}
assert.equal(model.references.find(item=>item.symbol==='AMS-PORK-CUTOUT').periods.year,null,'A short physical series never borrows the futures annual change');
assert(model.results.some(table=>table.columns.includes('2020') && table.columns.includes('2026')));
const historical=model.visuals.find(visual=>visual.title.includes('2020 a la fecha') || visual.title.includes('desde 2020'));
assert(historical?.requiredInPrint);assert.equal(historical.series.length,3);assert(historical.series.every(series=>series.points[0].value===100 && series.points[0].date==='2020-10-23'));
assert(!historical.series.some(series=>series.label.includes('Canal')),'Physical levels are not included in the futures historical index');
assert(model.summaryPanels.some(panel=>panel.heading==='Perspectiva desde 2020' || panel.heading==='Claves por horizonte'));
const currencyTables=model.results.filter(table=>table.proteinCurrency);
assert(currencyTables.length);assert(currencyTables.every(table=>table.columns.includes('Equivalente MXN')));
assert.equal(currencyTables.flatMap(table=>table.rows).length,model.references.length,'The equivalent belongs to the existing price rows, not a duplicate table');
assert.equal(model.marketFx.rates.MXN,20);
for(const item of [withDailyEvidence(source),createReportDraft('markets',source,{}).report,_test.executivePayload(source)]){
 assert(marketEvidence(item).every(usProteinReference));assert.equal(item.marketFx.rates.MXN,20,'Copies preserve the dated currency context without foreign prices');
}
const annex=reportAnnex(source),csv=reportCsv(source);
for(const text of [JSON.stringify(model),JSON.stringify(annex),csv])for(const marker of ['FOREIGN-','Pollo · Brasil','Canal de cerdo · México','Huevo Dalian','Pollo · Francia'])assert(!text.includes(marker),'No foreign price evidence in a US_ONLY report or its backups');
const {makeReportWorkbook}=require('../backend/lib/report-workbook'),JSZip=require('jszip'),zip=await JSZip.loadAsync(await makeReportWorkbook(source));
for(const file of Object.values(zip.files).filter(file=>/\.xml$/.test(file.name))){const xml=await file.async('string');assert(!/FOREIGN-|Pollo · Brasil|Huevo Dalian|Pollo · Francia/.test(xml),'Every workbook sheet respects US_ONLY scope');}
// Verify the real current cut as well as hand-calculated fixture arithmetic.
const current=JSON.parse(await fs.readFile('backend/cache/market_executive_reports.json')).reports.find(item=>item.key==='proteins');
const derivatives=require('../backend/lib/report-commodity-derivatives'),seed=JSON.parse(await fs.readFile('backend/data/commodity-derivatives-public-2026-10-23.json'));
const real=withDailyEvidence({...derivatives.attachReportDerivatives({reports:[current],generatedAt:current.generatedAt},seed,{generatedAt:seed.checkedAt}).reports[0],collection:'markets'}),realModel=weeklyReport(real);
assert(realModel.references.length>=30);assert(realModel.references.some(usProteinReference));assert(realModel.references.some(item=>/mercolleida/i.test(item.source || item.label)));assert(realModel.visuals.some(visual=>visual.title.includes('desde 2020') || visual.title.includes('2020 a la fecha')));
const folder='output/proteinas-us-20261026';await fs.mkdir(folder,{recursive:true});
await fs.writeFile(folder+'/proteinas-estados-unidos.xlsx',await makeReportWorkbook(real));
for(const [name,report] of [['diario',real],['semanal',{...real,analysisPeriod:'weekly'}]]){
 const bytes=await _test.makeExecutivePdf(report.title,_test.executivePayload(report));await fs.writeFile(folder+'/'+name+'.pdf',bytes);
 const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise;let text='';assert(pdf.numPages<=6 && pdf.numPages>=5);
 for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),items=(await page.getTextContent()).items.filter(item=>item.str.trim());text+=items.map(item=>item.str).join(' ')+'\n';for(const item of items){assert(item.transform[4]>=28 && item.transform[4]+item.width<=page.view[2]-25,'No horizontal clipping in the protein PDF');assert(item.transform[5]>=55,'No text below the report body');}}
 assert(text.includes('Mercolleida') && (text.includes('desde 2020') || text.includes('2020 a la fecha')) && /call, put/i.test(text));
 console.log('Global+Mercolleida protein '+name+': '+realModel.references.length+' references, '+pdf.numPages+' PDF pages.');await task.destroy();
}
console.log('Proteins: OK · Mercolleida + international + US coverage, exact session/month/quarter/semester/year/YTD arithmetic and dates, 2020 index, copies, annex, CSV, Excel and PDFs.');
