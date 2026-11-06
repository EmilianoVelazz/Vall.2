// Real HTTP exports with cached report data and isolated identities.
// No external providers, AI calls, database writes or email delivery.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {hasPublishedReportData} from '../shared/report-available-data.mjs';
import {reportDownloadName,reportDocumentTitle} from '../shared/report-download-name.mjs';
import {requestReportFile} from '../frontend/src/lib/reportPdf.js';
import {reportCsv} from '../frontend/src/lib/reportCsv.js';
import {createReportDraft} from '../frontend/src/lib/reportCreation.js';
const require=createRequire(import.meta.url);
process.env.NODE_ENV='test';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';process.env.JWT_SECRET='export-matrix-fixture-only';
for(const key of ['SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','SUPABASE_DATABASE_URL','DATABASE_URL','SUPABASE_PASSWORD','GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS'])process.env[key]='';
const express=require('express'),jwt=require('jsonwebtoken'),JSZip=require('jszip');
require('../backend/services/user-profile-store').findById=async id=>id.startsWith('export-fixture-') ? {id,active:true,email:id+'@example.invalid',credentialVersion:0} : null;
const {reportLabels}=require('../backend/lib/report-language');
require('../backend/services/report-translation').reportTranslator.localize=async input=>({...input,...reportLabels('es'),source:value=>value,translateText:value=>value});
const router=require('../backend/routes/export'),{_test}=router,app=express();app.use('/api',router);
const snapshots={};
for(const [collection,file]of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']])snapshots[collection]=JSON.parse(await fs.readFile('backend/cache/'+file+'.json','utf8'));
snapshots.markets=require('../backend/lib/report-market-overview').composeMarketOverview(snapshots.markets);
snapshots.mexico=require('../backend/lib/report-panorama').composeMexicoPanorama(snapshots.mexico);
snapshots.finance=await require('../backend/lib/report-panorama').composePanorama(snapshots.finance,{marketsSnapshot:snapshots.markets,mexicoSnapshot:snapshots.mexico});
const daily=Object.entries(snapshots).flatMap(([collection,snapshot])=>snapshot.reports.map(report=>({...report,collection})));
const annual=Object.values(JSON.parse(await fs.readFile('backend/cache/annual-report-library.json','utf8')).years).flat();
const weekly=daily.filter(report=>report.collection==='markets' && report.key!=='market_news').map(report=>({...report,analysisPeriod:'weekly'}));
const custom=createReportDraft('finance',daily.find(report=>report.collection==='finance' && report.key==='fx')).report;
custom.title='Tesorería para el comité';custom.personalization={...custom.personalization,customTitle:custom.title};
const reports=process.argv.includes('--custom-only') ? [custom] : [...daily,...weekly,...annual,custom],folder=path.resolve('output/exportaciones-20261105');await fs.mkdir(folder,{recursive:true});
const server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
const base='http://127.0.0.1:'+server.address().port,results=[],unavailable=[],names=new Set();
const identity=index=>{const id='export-fixture-'+index;return {owner:id+'@example.invalid',authorization:'Bearer '+jwt.sign({sub:id,email:id+'@example.invalid',role:'user',credentialVersion:0},process.env.JWT_SECRET,{expiresIn:'1h'})};};
try {
 assert.equal((await fetch(base+'/api/report-export',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 const first=identity('owner');
 assert.equal((await fetch(base+'/api/report-export',{method:'POST',headers:{'Content-Type':'application/json',Authorization:first.authorization},body:JSON.stringify({format:'pdf',response:'file',content:'Prueba',expectedOwner:'another@example.invalid'})})).status,409);
 for(const [index,report]of reports.entries()){
  const original=JSON.stringify(report),model=weeklyReport(report),{owner,authorization}=identity(index),key=[report.collection,report.baseReport?.key || report.key,report.reportYear || report.analysisPeriod || 'daily'].join('/');
  if(!hasPublishedReportData(model)){
   const response=await fetch(base+'/api/report-export',{method:'POST',headers:{'Content-Type':'application/json',Authorization:authorization},body:JSON.stringify({executiveReport:report,title:report.title,format:'pdf',response:'file',expectedOwner:owner})});
   assert.equal(response.status,422);assert.equal((await response.json()).code,'REPORT_DATA_UNAVAILABLE');unavailable.push(key);continue;
  }
  const formats=['pdf','csv',...((report.baseReport?.key || report.key)==='grains' ? ['xlsx'] : [])];
  for(const format of formats){
   const started=Date.now();let headers;
   const blob=await requestReportFile(report,report.title,'',format,async(route,options)=>{
    const response=await fetch(base+route,{...options,headers:{...options.headers,Authorization:authorization}});
    headers={status:response.status,length:Number(response.headers.get('content-length')),disposition:response.headers.get('content-disposition'),cache:response.headers.get('cache-control'),language:response.headers.get('content-language')};return response;
   },{language:'es',expectedOwner:owner,timeoutMs:180000});
   const filename=reportDownloadName(report,format);assert(!names.has(filename),'Different reports must not overwrite the same file: '+filename);names.add(filename);
   assert.equal(headers.status,200);assert.equal(headers.length,blob.size);assert.equal(headers.language,'es');assert.match(headers.cache,/private, no-store/);assert.equal(headers.disposition,'attachment; filename="'+filename+'"');
   const bytes=Buffer.from(await blob.arrayBuffer());let detail;
   if(format==='pdf'){
    const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise;
    try{
     const max=model.panorama ? 200 : model.bondExecutive ? 5 : model.commodityExecutive?.key==='proteins' ? 6 : 3;
     assert(pdf.numPages>0 && pdf.numPages<=max,key+' page limit');
     const metadata=await pdf.getMetadata();assert.equal(metadata.info.Title,reportDocumentTitle(report,{title:report.title}));assert.equal((await pdf.getViewerPreferences()).get('DisplayDocTitle'),true);
     for(let n=1;n<=pdf.numPages;n++){const text=(await(await pdf.getPage(n)).getTextContent()).items.map(item=>item.str).join(' ');assert(text.trim(),key+' has no empty pages');assert(!/\b(?:NaN|Infinity)\b/.test(text));}
     detail={pages:pdf.numPages,title:metadata.info.Title};
    } finally {await task.destroy();}
   }else if(format==='csv'){
    const expected=Buffer.from(reportCsv(_test.executivePayload(report)),'utf8');assert(bytes.equals(expected),'CSV includes its BOM and the complete normalized report, without truncation');assert(bytes.toString('utf8').includes(report.title));detail={characters:bytes.toString('utf8').length};
   }else{
    const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});assert(zip.file('[Content_Types].xml'));const sheets=Object.keys(zip.files).filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name));assert(sheets.length>=3);
    for(const file of sheets){const xml=await zip.file(file).async('string');assert(xml.endsWith('</worksheet>'));assert(!/<f(?:\s|>)/.test(xml));}detail={sheets:sheets.length};
   }
   await fs.writeFile(path.join(folder,filename),bytes);results.push({key,format,filename,bytes:bytes.length,ms:Date.now()-started,...detail});
  }
  assert.equal(JSON.stringify(report),original,'Export never changes the source report');console.log('PASS '+key+' · '+formats.join(', '));
 }
 const limited=identity('limit'),payload={executiveReport:custom,format:'csv',response:'file',expectedOwner:limited.owner};
 for(let n=0;n<=20;n++){const response=await fetch(base+'/api/report-export',{method:'POST',headers:{'Content-Type':'application/json',Authorization:limited.authorization},body:JSON.stringify(payload)});assert.equal(response.status,n===20 ? 429 : 200,'Export rate limit remains active');await response.arrayBuffer();}
 const evidence={reports:reports.length,available:reports.length-unavailable.length,unavailable,files:results.length,checks:{missingSession:401,changedAccount:409,rateLimit:429},results};
 await fs.writeFile(path.join(folder,process.argv.includes('--custom-only') ? 'validation-custom.json' : 'validation.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({reports:evidence.reports,available:evidence.available,files:evidence.files,unavailable}));
} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
