import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {hasPublishedReportData} from '../shared/report-available-data.mjs';
const require=createRequire(import.meta.url);
process.env.NODE_ENV='test';process.env.JWT_SECRET='decision-quality-isolated-fixture-at-least-32-bytes';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DATABASE_URL','DATABASE_URL','GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS'])process.env[key]='';
const {_test}=require('../backend/routes/export');
const snapshots={};for(const [area,file]of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']])snapshots[area]=JSON.parse(await fs.readFile('backend/cache/'+file+'.json','utf8'));
const {composePanorama,composeMexicoPanorama}=require('../backend/lib/report-panorama'),{composeMarketOverview}=require('../backend/lib/report-market-overview');
const markets=composeMarketOverview(snapshots.markets),mexico=composeMexicoPanorama(snapshots.mexico),finance=await composePanorama(snapshots.finance,{marketsSnapshot:markets,mexicoSnapshot:mexico});
const output=path.resolve('tmp/pdfs/report-decision-quality');await fs.mkdir(output,{recursive:true});const results=[];
for(const [collection,snapshot]of Object.entries({finance,markets,mexico}))for(const original of snapshot.reports){
 if(process.argv.includes('--individual') && ['overview','mx_overview'].includes(original.key))continue;
 if(process.argv.includes('--panoramas') && !['overview','mx_overview'].includes(original.key))continue;
 const report={...original,collection},before=JSON.stringify(report);let buffer;
 try{buffer=await _test.makeExecutivePdf(report.title,report);}catch(error){
  assert.equal(error.code,'REPORT_DATA_UNAVAILABLE');
  assert.equal(hasPublishedReportData(weeklyReport(report)),false,'Un informe con datos publicados debe poder exportarse');
  assert.equal(JSON.stringify(report),before);
  results.push({collection,key:report.key,status:'unavailable',correctlyRejected:true});
  console.log('PASS rechazo sin datos '+collection+'/'+report.key);continue;
 }
 const task=getDocument({data:new Uint8Array(buffer),isEvalSupported:false,useSystemFonts:true}),pdf=await task.promise;
 try{
  const isOverview=['overview','mx_overview'].includes(original.key);
  const openingPages=isOverview ? Math.min(3,pdf.numPages) : 1;
  let first='';
  for(let p=1;p<=openingPages;p++)first+=(await(await pdf.getPage(p)).getTextContent()).items.map(item=>item.str).join(' ')+' ';
  for(const heading of ['Qué cambió','Cuánto importa','Qué revisar primero'])assert(first.includes(heading),collection+'/'+report.key+' apertura: '+heading);
  if(report.key==='fx')assert(first.indexOf('Qué cambió')<first.indexOf('Monedas operativas'),'La conclusión precede al detalle de divisas');
  assert(!first.includes('science and practice'));assert(!first.includes('SMM Análisis de mediodía del níquel'));
  assert.equal(JSON.stringify(report),before,'La revisión editorial no reescribe las fuentes');
  await fs.writeFile(path.join(output,collection+'-'+report.key+'.pdf'),buffer);
  results.push({collection,key:report.key,pages:pdf.numPages,bytes:buffer.length});console.log('PASS PDF '+collection+'/'+report.key+' · '+pdf.numPages+' páginas');
 }finally{await task.destroy();}
}
await fs.writeFile(path.join(output,process.argv.includes('--individual') ? 'results-individual.json' : process.argv.includes('--panoramas') ? 'results-panoramas.json' : 'results.json'),JSON.stringify(results,null,2));
