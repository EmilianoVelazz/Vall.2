import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const require=createRequire(import.meta.url),{_test}=require('../backend/routes/export');
const {getDocument}=await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const report=JSON.parse(await fs.readFile(new URL('../backend/cache/finance_executive_reports.json',import.meta.url),'utf8')).reports.find(item=>item.key==='equities'),before=JSON.stringify(report);
for(const analysisPeriod of ['daily','weekly']){
 const input={...report,analysisPeriod},buffer=await _test.makeExecutivePdf(input.title,input),task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise;
 try{
  assert(pdf.numPages<=3);let context,fullText='';
  for(let number=1;number<=pdf.numPages;number++){
   const page=await pdf.getPage(number),items=(await page.getTextContent()).items.filter(item=>item.str.trim());
   fullText+=items.map(item=>item.str).join(' ')+' ';
   for(const item of items){assert(item.transform[4]>=25 && item.transform[4]+item.width<=page.view[2]-24,item.str);assert(item.transform[5]>=34,item.str);}
   if(items.some(item=>item.str.includes('Materias primas · futuros')))context=items;
  }
  assert(context);const box=context.find(item=>item.str==='Compras y márgenes'),title=context.find(item=>item.str==='Materias primas · futuros'),annual=context.find(item=>item.str.includes('Comparativa de años'));
  assert(box && box.transform[4]>290 && box.transform[5]<title.transform[5] && box.transform[5]>annual.transform[5],'The existing business note uses the shorter commodity column');
  assert.equal(fullText.split('Compras y márgenes').length-1,1,'The relocated note is never repeated');
  const header=context.find(item=>item.str==='fecha %'),firstRow=context.find(item=>/^WTI ·/.test(item.str));
  assert(header && firstRow && header.transform[5]-firstRow.transform[5]>=9,'Wrapped column headers cannot collide with the first price');
  await fs.writeFile(new URL('../output/bolsa-tablas-granos-20261105/bolsa-'+analysisPeriod+'.pdf',import.meta.url),buffer);
 }finally{await task.destroy();}
}
assert.equal(JSON.stringify(report),before);
console.log('Bolsa layout: daily/weekly <=3 pages, shorter-column gap filled without duplicate text, wrapped headers separated from prices, original evidence retained.');
