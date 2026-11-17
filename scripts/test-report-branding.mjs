import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {PDFDocument,PDFName,PDFBool} from 'pdf-lib';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {createReportDraft} from '../frontend/src/lib/reportCreation.js';
const require=createRequire(import.meta.url);
process.env.NODE_ENV='test';process.env.JWT_SECRET='vallnews-branding-fixture-at-least-32-bytes';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';process.env.USER_PASSWORD='';process.env.VALL_AUTH_PASSWORD='';
const {_test}=require('../backend/routes/export'),{finishReportBranding}=require('../backend/lib/report-branding'),{reportLabels}=require('../backend/lib/report-language');
const snapshots={};for(const [area,file] of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']])snapshots[area]=JSON.parse(await fs.readFile('backend/cache/'+file+'.json','utf8'));
const inputs=[['finance','equities'],['finance','bonds'],['finance','fx'],['finance','daily_news'],['markets','grains'],['markets','proteins'],['mexico','mx_proteins']].map(([area,key])=>({report:{...snapshots[area].reports.find(item=>item.key===key),collection:area}}));
const annual=JSON.parse(await fs.readFile('backend/data/annual-report-library.json','utf8')).years[2025].find(item=>item.collection==='finance' && item.key==='fx');inputs.push({report:annual});
const custom=createReportDraft('finance',inputs[2].report,{organization:'Comité de prueba',confidentiality:'confidential'}).report;custom.aiEdition={model:'fixture',generatedAt:custom.generatedAt};custom.title='Tesorería · edición del comité';inputs.push({report:custom});
inputs.push({report:inputs[2].report,localization:{...reportLabels('en'),source:value=>value,translateText:value=>value}});
if(process.argv.includes('--panorama')){const {composePanorama,composeMexicoPanorama}=require('../backend/lib/report-panorama'),{composeMarketOverview}=require('../backend/lib/report-market-overview');const markets=composeMarketOverview(snapshots.markets),mexico=composeMexicoPanorama(snapshots.mexico),finance=await composePanorama(snapshots.finance,{marketsSnapshot:markets,mexicoSnapshot:mexico});inputs.push({report:{...finance.reports.find(item=>item.key==='overview'),collection:'finance'}});}
const results=[],samples=path.resolve('output/pdf/identidad-vallnews');if(process.argv.includes('--samples'))await fs.mkdir(samples,{recursive:true});
for(const {report,localization} of inputs){
 const before=JSON.stringify(report),buffer=await _test.makeExecutivePdf(report.title,report,localization),pdf=await PDFDocument.load(buffer),task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true,isEvalSupported:false}),reader=await task.promise;
 assert.equal(JSON.stringify(report),before,'Branding never rewrites source observations');assert.equal(reader.numPages,buffer.reportPageCount);
 for(const [index,page] of pdf.getPages().entries()){
  assert.equal(page.node.get(PDFName.of('VallnewsWatermark')),PDFBool.True,'Every final page is watermarked, including chapter and appendix pages');
  const text=(await(await reader.getPage(index+1)).getTextContent()).items.map(item=>item.str).join(' ');assert(text.includes('VALLNEWS'),'The publisher remains identifiable even with company personalization');assert(!/\b(?:NaN|Infinity)\b/.test(text));
 }
 const streams=pdf.getPages().map(page=>page.node.Contents()?.toString());await finishReportBranding(pdf);assert.deepEqual(pdf.getPages().map(page=>page.node.Contents()?.toString()),streams,'A second pass cannot duplicate the watermark');
 results.push({collection:report.collection || report.baseReport?.collection,key:report.key,year:report.reportYear,language:localization?.language || 'es',pages:reader.numPages,bytes:buffer.length});
 if(process.argv.includes('--samples') && !localization && !report.userEdition){const name=report===annual ? 'VALLNEWS-Informe-Anual.pdf' : report.collection==='finance' && report.key==='fx' ? 'VALLNEWS-Divisas-Ejecutivo.pdf' : report.collection==='markets' && report.key==='proteins' ? 'VALLNEWS-Mercados-Proteinas.pdf' : null;if(name)await fs.writeFile(path.join(samples,name),buffer);}
 await task.destroy();console.log('PASS brand identity · '+(report.collection || 'mine')+'/'+report.key+' · '+(localization?.language || 'es')+' · '+reader.numPages+' pages');
}
await fs.mkdir('tmp/pdfs/identidad-vallnews',{recursive:true});await fs.writeFile('tmp/pdfs/identidad-vallnews/branding-validation.json',JSON.stringify(results,null,2));
