import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {equityHistoryChart} from '../shared/report-equity-history-chart.mjs';
import {equityHistorySvg} from '../shared/report-equity-history-svg.mjs';
import {reportDownloadName} from '../shared/report-download-name.mjs';
import {visibleReportEdition} from '../frontend/src/lib/reportAiPreferences.js';
import {normalizePreferences} from '../frontend/src/lib/executiveReportPreferences.js';
const require=createRequire(import.meta.url);
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const {_test}=require('../backend/routes/export');
const screen=process.argv.includes('--screen'),branding=process.argv.includes('--branding'),focus=process.argv.includes('--reader-focus');
const folder=process.env.REPORT_REFERENCE_OUTPUT || (screen ? 'output/correccion-formato-real-20261110/'+(focus ? 'pantalla-preferencias' : branding ? 'pantalla-identidad' : 'pantalla') : 'output/restauracion-formato-20261110/finales');await fs.mkdir(folder,{recursive:true});
const results=[],fold=value=>value.normalize('NFKD').replace(/[\u0300-\u036f\s]/g,'').toLowerCase();
for(const [collection,name,keys]of [['finance','finance_executive_reports',['equities','bonds','fx']],['markets','market_executive_reports',['grains','energy_metals','proteins']]]){
 const snapshot=JSON.parse(await fs.readFile('backend/cache/'+name+'.json','utf8'));
 for(const key of keys){
  const original={...snapshot.reports.find(item=>item.key===key),collection};
  const preferences={...(branding ? {organization:'Empresa de prueba',recipientName:'Comité de prueba',customTitle:original.title} : {}),...(focus ? {audience:'finance',depth:'detailed',decisionHorizon:'quarter',objective:'Revisar exposición y costos del trimestre'} : {})};
  const report=screen ? _test.executivePayload(visibleReportEdition(original,normalizePreferences(preferences))) : original;
  if(screen)assert.equal(report.personalization.customized,false,'Reader preferences keep the original template without authored analysis');
  const before=JSON.stringify(report),model=weeklyReport(report);
  const bytes=await _test.makeExecutivePdf(report.title,report),task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise;
  try{
   assert(pdf.numPages<=(key==='bonds' ? 5 : key==='proteins' ? 6 : key==='equities' ? 4 : 3));let text='';
   for(let number=1;number<=pdf.numPages;number++){
    const page=await pdf.getPage(number),items=(await page.getTextContent()).items.filter(item=>item.str.trim());assert(items.length>20,'No almost-empty report page');
    for(const item of items){assert(item.transform[4]>=18 && item.transform[4]+item.width<=page.view[2]-16,'Horizontal clipping '+key+': '+item.str);assert(item.transform[5]>=18,'Bottom clipping '+key);}
    text+=items.map(item=>item.str).join(' ')+' ';
   }
   assert(!/NaN|Infinity|\(cid:/.test(text));
   if(key==='bonds'){
    for(const reference of model.bondExecutive.international?.references || [])assert(fold(text).includes(fold(reference.market)),'International country retained: '+reference.market);
    if(model.bondExecutive.international?.visuals?.length)assert(/comparativas regionales/i.test(text),'Regional comparison charts retain their own section');
   }
   if(key==='equities'){
    assert.match(text,/Comparativas regionales/,'Regional comparisons accompany the complete global chart');
    const visual=model.visuals.find(item=>item.equityHistoryOverview),chart=equityHistoryChart(visual),svg=equityHistorySvg(visual);
    assert.equal(chart.series.filter(item=>item.highlighted).length,chart.series.length);assert(!svg.includes('stroke-opacity="0.35"'));
    for(const item of chart.series)assert(svg.includes('stroke="'+item.color+'"'),'Every market keeps its actual color');
   }
   if(key==='fx')for(const pair of ['DXY','USD/MXN','EUR/USD','GBP/USD'])assert(text.includes(pair));
   if(collection==='markets')assert(text.includes('TABLAS Y COMPARACIONES'));
   assert.equal(JSON.stringify(report),before,'Format restoration preserves source evidence');
   const filename=reportDownloadName(report,'pdf');await fs.writeFile(folder+'/'+filename,bytes);results.push({key:collection+'/'+key+'/daily',format:'pdf',filename,pages:pdf.numPages,bytes:bytes.length});console.log(key+': '+pdf.numPages+' pages; tables, comparisons, colors, margins and source integrity verified.');
  }finally{await task.destroy();}
 }
}
await fs.writeFile(folder+'/validation.json',JSON.stringify({reports:results.length,files:results.length,results},null,2));
