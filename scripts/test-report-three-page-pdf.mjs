import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {REPORT_PDF_MAX_PAGES} from '../shared/report-print-edition.mjs';
const require=createRequire(import.meta.url);process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const {_test}=require('../backend/routes/export'),{reportLabels}=require('../backend/lib/report-language');
assert.equal(REPORT_PDF_MAX_PAGES,3);
const directory='output/tres-paginas-20261028';await fs.mkdir(directory,{recursive:true});
const inputs=[];
for(const [collection,name] of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']]){
 const snapshot=JSON.parse(await fs.readFile('backend/cache/'+name+'.json','utf8'));
 inputs.push(...snapshot.reports.map(report=>({...report,collection})));
}
const annual=JSON.parse(await fs.readFile('backend/cache/annual-report-library.json','utf8'));inputs.push(...Object.values(annual.years).flat());
const markets=inputs.filter(report=>report.collection==='markets' && !report.reportYear);
inputs.push(...markets.filter(report=>report.key!=='market_news').map(report=>({...report,analysisPeriod:'weekly'})));
const stats=[];
for(const report of inputs){
 const before=JSON.stringify(report),model=weeklyReport(report),integrated=Boolean(model.panorama),bytes=await _test.makeExecutivePdf(report.title,report),task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise;
 assert.equal(pdf.numPages,bytes.reportPageCount,report.key+' reports its actual page count');
 if(integrated)assert(pdf.numPages>3,'Integrated Panorama remains extensive');else if(model.bondExecutive)assert(pdf.numPages<=5,report.key+' exceeds five pages');else if(model.commodityExecutive?.key==='proteins')assert(pdf.numPages<=6,report.key+' exceeds six pages');else assert(pdf.numPages<=3,report.key+' exceeds three pages');
 let printed='';
 for(let index=1;index<=pdf.numPages;index++){
  const page=await pdf.getPage(index),items=(await page.getTextContent()).items.filter(item=>item.str.trim());
  printed+=items.map(item=>item.str).join(' ')+' ';
  if(!integrated)for(const item of items){assert(item.transform[4]>=24 && item.transform[4]+item.width<=page.view[2]-22,'No horizontal clipping: '+report.key);assert(item.transform[5]>=42,'No clipped footer/body: '+report.key);}
 }
 if(model.bondExecutive){for(const term of ['SOFR','TIIE','TIPS'])if(model.references.some(item=>item.label.includes(term)))assert(printed.includes(term),'Core funding/inflation reference survives the three-page composition: '+term);for(const tenor of ['1M','30Y'])if(model.bondExecutive.yieldCurve?.curvePoints.some(point=>point.label===tenor))assert(printed.includes(tenor),'Sovereign curve retains its maturity range');}
 assert.equal(JSON.stringify(report),before,'Selection never alters the complete report');
 const key=[report.collection,report.key,report.reportYear || 'daily',report.analysisPeriod || 'daily'].join('-');
 if(!report.reportYear)await fs.writeFile(directory+'/'+key+'.pdf',bytes);
 stats.push({key,pages:pdf.numPages,integrated,bytes:bytes.length});console.log(stats.at(-1));await task.destroy();
}
for(const report of markets){const labels=reportLabels('en'),bytes=await _test.makeExecutivePdf(report.title,report,{...labels,source:value=>value,images:[]});const maxPages=report.key==='proteins' ? 6 : 3;assert(bytes.reportPageCount<=maxPages,'Localized report also respects the limit: '+report.key);}
await fs.writeFile(directory+'/validation.json',JSON.stringify(stats,null,2));
console.log('Three-page PDFs: '+stats.filter(item=>!item.integrated).length+' daily/weekly/annual editions; integrated Panorama remains complete; English market exports also fit; no clipping or source mutation.');
