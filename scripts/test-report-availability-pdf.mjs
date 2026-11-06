import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {hasPublishedReportData} from '../shared/report-available-data.mjs';
const require=createRequire(import.meta.url);process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const {_test}=require('../backend/routes/export');
await assert.rejects(_test.makeExecutivePdf('Sin datos',{key:'grains',collection:'markets',title:'Sin datos',generatedAt:'2026-10-28T18:00:00Z',sections:[],tables:[],visuals:[],metrics:[],sources:[],sourceLinks:[],watchlist:[],takeaways:[]}),error=>error.status===422 && error.code==='REPORT_DATA_UNAVAILABLE','The real export renderer rejects empty reports');
const directory='output/report-availability';await fs.mkdir(directory,{recursive:true});
const stats=[];
for(const [collection,name] of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']]){
 const snapshot=JSON.parse(await fs.readFile('backend/cache/'+name+'.json','utf8'));
 for(const source of snapshot.reports){
  if(collection==='finance' && source.key==='overview')continue;
  const report={...source,collection},model=weeklyReport(report);
  if(!hasPublishedReportData(model)){
   await assert.rejects(_test.makeExecutivePdf(report.title,report),error=>error.status===422 && error.code==='REPORT_DATA_UNAVAILABLE','An unavailable real cut cannot produce an empty PDF');
   stats.push({key:collection+'/'+report.key,status:'unavailable',exportStatus:422});continue;
  }
  const bytes=await _test.makeExecutivePdf(report.title,report),task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise;
  const pageLimit=model.panorama ? Infinity : model.bondExecutive ? 5 : collection==='markets' && report.key==='proteins' ? 6 : 3;
  assert(pdf.numPages<=pageLimit,report.key+' fits its page limit');let cells=0;
  for(let number=1;number<=pdf.numPages;number++){
   const page=await pdf.getPage(number),items=(await page.getTextContent()).items;
   for(const item of items){
    const text=item.str.trim();if(!text)continue;cells++;
    assert(text!=='—' && !/^(?:Sin dato(?: de \d{4})?$|Sin base comparable$|No calculable$|Sin producción reportada$)/.test(text),report.key+': unavailable value on page '+number+': '+text);
    assert(item.transform[4]>=(model.panorama ? 20 : 24) && item.transform[4]+item.width<=page.view[2]-(model.panorama ? 18 : 22),report.key+': horizontal clipping');assert(item.transform[5]>=(model.panorama ? 20 : 42),report.key+': vertical clipping');
   }
  }
  const filename=collection+'-'+report.key+'.pdf';await fs.writeFile(directory+'/'+filename,bytes);stats.push({key:collection+'/'+report.key,pages:pdf.numPages,cells,file:filename});await task.destroy();console.log(stats.at(-1));
 }
}
await fs.writeFile(directory+'/pdf-validation.json',JSON.stringify(stats,null,2));
console.log('Availability PDFs: '+stats.length+' actual daily reports; no missing-value cells, clipped content or excess pages.');
