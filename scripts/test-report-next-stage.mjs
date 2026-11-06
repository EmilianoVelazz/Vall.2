import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chartSegments} from '../shared/report-chart-geometry.mjs';
import {reportCauseAnnex} from '../shared/report-causes.mjs';
import {reportFilterOptions,filteredReportModel} from '../shared/report-view-filters.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {isReportDocument} from '../frontend/src/lib/reportDataValidation.js';
import {requestReportFile} from '../frontend/src/lib/reportPdf.js';
const require=createRequire(import.meta.url),JSZip=require('jszip');
const {makeReportWorkbook,REPORT_WORKBOOK_MIME}=require('../backend/lib/report-workbook');
const {annualEvidence}=require('../backend/lib/report-annual-evidence');
const library=JSON.parse(await fs.readFile('backend/data/annual-report-library.json','utf8'));
const references=Array.from({length:10},(_,i)=>({label:'Maíz '+i,market:i===9?'México':'Estados Unidos',unit:'USD/t',previous:100,current:i===9?140:101}));
const causes=items=>reportCauseAnnex({key:'grains',collection:'markets'},items,{yesterday:'2026-10-21',today:'2026-10-22'});
const names=annex=>annex.groups.flatMap(group=>group.rows.map(row=>row.reference));
assert(names(causes(references)).includes('Maíz 9'));assert.deepEqual(names(causes(references)),names(causes([...references].reverse())));
const mixed=causes([...references,{label:'Tasa',unit:'%',previous:5,current:6}]);assert(names(mixed).includes('Tasa'),'Rates and relative price movements have separate ranking groups');
const points=[{date:'2025-01-01',value:10},{date:'2025-07-01',value:11},{date:'2025-08-01',value:12}];
assert.deepEqual(chartSegments(points,{monthly:true}).map(segment=>segment.length),[1,2]);assert.equal(chartSegments(points).length,1,'Daily comparisons are not subjected to monthly gaps');
const mx=library.years[2025].find(report=>report.key==='mx_proteins'),model=weeklyReport(mx),options=reportFilterOptions(model,mx),unchanged=JSON.stringify(mx);
const nayarit=mx.annualReferences.find(item=>item.label.includes('Pollo entero') && item.label.includes('Nayarit'));
assert(nayarit);assert(chartSegments(nayarit.points,{monthly:true}).length>1);
const filtered=filteredReportModel(model,mx,{country:'México',query:'Nayarit',product:'Pollo'});
assert(filtered.results.length);assert(filtered.results.every(table=>table.rows.every(row=>row[0].includes('Nayarit') && row[0].includes('Pollo'))));
assert(filtered.visuals.some(visual=>visual.series?.some(series=>series.label===nayarit.label)));assert.equal(options.identify(nayarit.label),'México');assert.equal(JSON.stringify(mx),unchanged);
const eq=library.years[2025].find(report=>report.key==='equities'),outside=eq.annualReferences.filter(item=>item.points.length>=2).at(-1);
assert(!eq.visuals.some(v=>v.series?.some(s=>s.label===outside.label)),'Fixture selects a reference outside the default monthly sample');
assert(filteredReportModel(weeklyReport(eq),eq,{series:[outside.id]}).visuals.some(v=>v.series?.some(s=>s.label===outside.label)));
for(const [year,reports] of Object.entries(library.years))for(const report of reports){assert(isReportDocument(report));assert(annualEvidence(report));assert.equal(report.reportYear,Number(year));assert(report.summary.includes(year));}
for(const report of library.years[2022])assert.equal(new Set(Object.values(library.years).map(reports=>reports.find(item=>item.collection===report.collection && item.key===report.key).sections.find(section=>section.heading==='Repercusiones y transmisión').text)).size,4);
const corrupt=structuredClone(mx);corrupt.annualReferences[0].points.push({date:'2026-01-01',value:1});assert.throws(()=>annualEvidence(corrupt));assert.equal(isReportDocument(corrupt),false);
await fs.mkdir('output/report-next-stage-20261022',{recursive:true});
let books=0;
for(const report of Object.values(library.years).flat()){
  const workbook=await makeReportWorkbook(report),zip=await JSZip.loadAsync(workbook),xml=await zip.file('xl/workbook.xml').async('string');
  assert(xml.includes('Observaciones') && xml.includes('Cobertura'));
  for(const file of Object.keys(zip.files).filter(name=>name.endsWith('.xml'))){const content=await zip.file(file).async('string');assert(!/<f(?:\s|>)/.test(content),'No implicit formulas or executable spreadsheet input');}
  const data=await zip.file('xl/worksheets/sheet2.xml').async('string');assert(data.includes('state="frozen"'));assert(data.includes('t="inlineStr"'));assert(data.includes('s="2"') || report.key==='mx_production' || report.key.endsWith('_news'));
  if(report===mx)await fs.writeFile('output/report-next-stage-20261022/proteinas-mexico-2025.xlsx',workbook);
  books++;
}
const injection=await JSZip.loadAsync(await makeReportWorkbook({...mx,title:'=WEBSERVICE("https://example.invalid")',summary:'<test>& text'}));
const summary=await injection.file('xl/worksheets/sheet1.xml').async('string');assert(summary.includes('=WEBSERVICE'));assert(summary.includes('&lt;test&gt;&amp; text'));assert(!summary.includes('<f>'));
const book=await makeReportWorkbook(mx);
const response=await requestReportFile(mx,mx.title,mx.summary,'xlsx',async()=>new Response(book,{headers:{'content-type':REPORT_WORKBOOK_MIME}}),{language:'es'});assert.equal(response.size,book.length);
await assert.rejects(requestReportFile(mx,mx.title,mx.summary,'xlsx',async()=>new Response('wrong',{headers:{'content-type':REPORT_WORKBOOK_MIME}}),{language:'es'}),/incompleto/);
// Exercise the actual export route with simulated identity and localization only.
process.env.NODE_ENV='test';process.env.JWT_SECRET='next-stage-report-fixture';
const owner='reports@example.invalid',jwt=require('jsonwebtoken'),express=require('express');
require('../backend/services/user-profile-store').findById=async()=>({active:true,email:owner,credentialVersion:0});
const {reportTranslator}=require('../backend/services/report-translation'),original=reportTranslator.localize;
reportTranslator.localize=async input=>({...input,t:value=>value,source:value=>value});
const app=express();app.use('/api',require('../backend/routes/export'));
const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
const url='http://127.0.0.1:'+server.address().port+'/api/report-export',headers={'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({sub:'fixture',email:owner,role:'user'},process.env.JWT_SECRET,{expiresIn:'1m'})};
try{
  const body={title:mx.title,content:mx.summary,executiveReport:mx,format:'xlsx',response:'file',language:'es',expectedOwner:owner};
  const unauthorized=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(unauthorized.status,401);
  const result=await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});assert.equal(result.status,200,await result.clone().text().then(text=>result.ok?'':text));assert.equal(result.headers.get('content-type'),REPORT_WORKBOOK_MIME);assert.match(result.headers.get('cache-control'),/private/);await JSZip.loadAsync(await result.arrayBuffer());
  const other=await fetch(url,{method:'POST',headers,body:JSON.stringify({...body,expectedOwner:'other@example.invalid'})});assert.equal(other.status,409);
}finally{reportTranslator.localize=original;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
console.log(`Mejoras de informes: OK · segmentos sin interpolación, selección estable y diversa, filtros, evidencia, ${books} libros XLSX, tipos, seguridad de celdas y exportación HTTP autenticada.`);
