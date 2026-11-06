import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {getDocument} from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const require=createRequire(import.meta.url),{attachReportDerivatives}=require('../backend/lib/report-commodity-derivatives'),{_test}=require('../backend/routes/export');
const seed=JSON.parse(await fs.readFile('backend/data/commodity-derivatives-public-2026-10-23.json'));
const source=attachReportDerivatives(JSON.parse(await fs.readFile('backend/cache/market_executive_reports.json')),seed,{generatedAt:seed.checkedAt});
const folder='output/commodities-20261026';await fs.mkdir(folder,{recursive:true});const stats=[];
for(const original of source.reports.filter(report=>report.marketDerivatives))for(const period of ['daily','weekly']){
 const report=_test.executivePayload({...original,collection:'markets',...(period==='weekly' ? {analysisPeriod:'weekly'} : {})});
 assert(report?.marketDerivatives?.options.length,'Public evidence survives the export request sanitizer');
 const bytes=await _test.makeExecutivePdf(report.title,report);assert(bytes.subarray(0,5).toString()==='%PDF-');
 const name=report.key+'-'+period;await fs.writeFile(folder+'/'+name+'.pdf',bytes);
 const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise;let text='',smallest=100;
 assert(pdf.numPages<=5,'Keep the five-page report limit');
 for(let number=1;number<=pdf.numPages;number++){
  const page=await pdf.getPage(number),items=(await page.getTextContent()).items.filter(item=>item.str.trim());
  text+=items.map(item=>item.str).join(' ')+'\n';
  for(const item of items){
   assert(item.transform[4]>=28 && item.transform[4]+item.width<=page.view[2]-25,'No horizontal clipping');
   assert(item.transform[5]>=55,'No text falls below the report body');
   if(item.transform[5]>80 && /^(?:9,178|11,162|600,935|463,530|106,622|60,641|16,343|22,608|117|51)$/.test(item.str.trim()))smallest=Math.min(smallest,Math.hypot(item.transform[0],item.transform[1]));
  }
 }
 assert(text.includes('Opciones de commodities') && text.includes('Put/Call'),'The derivative section is present in the delivered PDF');
 assert(text.includes('2026-10-23') && /Preliminar|Final/.test(text),'Exact observation date and status remain visible');
 if(['grains','proteins'].includes(report.key)){
  const flat=text.replace(/[,\s]/g,'');
  for(const item of [...report.marketDerivatives.options,...report.marketDerivatives.futures])assert(flat.includes(String(item.openInterest)),'The PDF keeps every covered option and futures count for '+report.key+' / '+item.symbol);
  assert(text.toLocaleLowerCase('es').includes('call, put e interés abierto'),'The section is explicitly named in both target PDFs');
 }
 assert(smallest>=7,'Tables are not reduced to illegible text');
 assert(!text.includes('PDF ejecutivo: máximo'),'No repeated export mechanics in the introduction');
 stats.push({name,pages:pdf.numPages,bytes:bytes.length,smallestFont:smallest});
 await task.destroy();
}
await fs.writeFile(folder+'/exports.json',JSON.stringify(stats,null,2)+'\n');
console.log('Commodity PDF exports: OK · '+stats.map(row=>row.name+': '+row.pages+' pages').join('; ')+'.');
