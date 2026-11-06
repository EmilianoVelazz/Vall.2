import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
const require=createRequire(import.meta.url);process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const {_test}=require('../backend/routes/export'),reports=JSON.parse(fs.readFileSync('backend/cache/mexico-executive-reports.json')).reports;
for(const original of reports)for(const period of ['daily','weekly']){
 const report={...original,analysisPeriod:period},before=JSON.stringify(report),model=weeklyReport(report),bytes=await _test.makeExecutivePdf(report.title,_test.executivePayload(report)),task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise;
 assert(pdf.numPages<=3);let text='';
 for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),items=(await page.getTextContent()).items.filter(item=>item.str.trim());assert(items.length>20,'No empty or nearly empty PDF page');text+=items.map(item=>item.str).join(' ')+' ';for(const item of items){assert(item.transform[4]>=24 && item.transform[4]+item.width<=page.view[2]-22,'No horizontal clipping: '+item.str);assert(item.transform[5]>=42,'Body and footer remain separate');}}
 const compact=text.replace(/\s/g,'');
 if(report.key==='mx_bolsa'){assert(text.includes('intradía'));assert(text.includes('UTC'));for(const reference of model.references)assert(compact.includes(reference.last.value.toLocaleString('es-MX',{maximumFractionDigits:2}).replace(/\s/g,'')),'Every current quote is printed');}
 if(report.key==='mx_proteins'){assert(!text.includes('2025-03'));for(const reference of model.references){assert(text.includes(reference.state));assert(compact.includes(reference.last.value.toLocaleString('es-MX',{maximumFractionDigits:2})));}assert(text.includes('MXN/kg vivo') && text.includes('mensual') && text.includes('fuente semanal'),'Units and frequency survive compact context headings');}
 if(report.key==='mx_production'){const table=report.tables.find(table=>table.title.startsWith('Granos por entidad'));for(const row of table.rows){assert(text.includes(row[0]));for(const value of row.slice(1))if(/^\d/.test(value))assert(compact.includes(value),'Every published crop/state value survives: '+row[0]+' '+value);}assert(text.includes('0.000105') && text.includes('0.0000762'),'Small positive mining amounts cannot become zero');}
 assert.equal(JSON.stringify(report),before);console.log(report.key+' / '+period+': '+pdf.numPages+' pages; complete published values, units, periods and margins verified.');await task.destroy();
}
