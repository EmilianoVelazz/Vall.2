// Real local HTTP exports; no remote writes, AI requests or mail delivery.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {hasPublishedReportData} from '../shared/report-available-data.mjs';
import {requestReportFile} from '../frontend/src/lib/reportPdf.js';
import {createReportDraft} from '../frontend/src/lib/reportCreation.js';
const require=createRequire(import.meta.url);
process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-report-suite-simulation-fixture';
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const name of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS'])process.env[name]='';
const express=require('express'),jwt=require('jsonwebtoken'),JSZip=require('jszip');
require('../backend/services/user-profile-store').findById=async id=>({active:true,email:id+'@example.invalid',credentialVersion:0});
const {reportLabels}=require('../backend/lib/report-language');
require('../backend/services/report-translation').reportTranslator.localize=async input=>({...input,...reportLabels('es'),source:text=>text,translateText:text=>text});
const router=require('../backend/routes/export'),{createUserReportStore}=require('../backend/services/user-report-store');
const root=path.resolve(process.env.REPORT_SUITE_OUTPUT || 'output/reportes-simulacion-ampliada-20261029');
await fs.mkdir(root,{recursive:true});
const sourceFile=path.join(root,'source-inputs.json');
let inputs;
try{inputs=JSON.parse(await fs.readFile(sourceFile,'utf8'));}catch(error){
 if(error.code!=='ENOENT')throw error;
 inputs=[];
 for(const [collection,file] of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']]){
  const value=JSON.parse(await fs.readFile('backend/cache/'+file+'.json','utf8'));inputs.push(...value.reports.map(report=>({...report,collection})));
 }
 inputs.push(...Object.values(JSON.parse(await fs.readFile('backend/cache/annual-report-library.json','utf8')).years).flat());
 await fs.writeFile(sourceFile,JSON.stringify(inputs));
}
const hash=report=>createHash('sha256').update(JSON.stringify(report)).digest('hex');
const inputHash=hash(inputs),live=inputs.filter(report=>report.periodType!=='annual'),annual=inputs.filter(report=>report.periodType==='annual');
if(process.argv.includes('--inventory')){console.log(JSON.stringify({active:live.length,annual:annual.length,expectedCases:live.length*3+annual.length,expectedDownloads:(live.length*3+annual.length)*3,empty:inputs.filter(report=>!hasPublishedReportData(weeklyReport(report))).map(report=>[report.collection,report.key,report.reportYear])}));process.exit(0);}
const store=createUserReportStore({directory:path.join(root,'private-fixtures'),maxReports:100});
const fixtureOwner='suite-fixture-'+randomUUID()+'@example.invalid';
const issues=[],warnings=[],results=[],expected=[],review=[];
const cases=[];
for(const report of live){
 for(const period of ['daily','weekly'])cases.push({id:report.collection+'-'+report.key+'-'+period,scenario:period,report:{...report,analysisPeriod:period}});
 try{
  const draft=createReportDraft(report.collection,{...report,analysisPeriod:'weekly'}).report;
  const saved=await store.save(fixtureOwner,{report:draft});
  cases.push({id:report.collection+'-'+report.key+'-saved-weekly',scenario:'saved-weekly',report:await store.get(fixtureOwner,saved.editionId),original:{...report,analysisPeriod:'weekly'}});
 }catch(error){issues.push({id:report.collection+'-'+report.key+'/save',detail:error.message});}
}
for(const report of annual)cases.push({id:report.collection+'-'+report.key+'-'+report.reportYear,scenario:'annual',report});
const xlsxOnly=process.argv.includes('--xlsx');
const only=xlsxOnly ? '__xlsx__' : process.argv.includes('--repair') ? '__repair__' : process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only')+1] : '';
const selectedIds=new Set(xlsxOnly ? cases.map(item=>item.id) : only==='__repair__' ? cases.filter(item=>item.scenario==='annual' || item.id==='finance-equities-saved-weekly').map(item=>item.id) : only.split(',').filter(Boolean));
if(only){
 const previous=JSON.parse(await fs.readFile(path.join(root,'suite-results.json'),'utf8'));assert.equal(previous.inputHash,inputHash,'Only unchanged input snapshots may reuse earlier successful cases');
 const replaced=id=>[...selectedIds].some(selected=>id===selected.replace(/-saved-weekly$/,'')+'/save' || (xlsxOnly ? id===selected+'/xlsx' : id.startsWith(selected)));
 issues.push(...previous.issues.filter(item=>!replaced(item.id)));warnings.push(...previous.warnings);
 results.push(...previous.results.filter(item=>!selectedIds.has(item.id) || xlsxOnly && item.format!=='xlsx'));review.push(...previous.review.filter(item=>!selectedIds.has(item.id)));
 expected.push(...JSON.parse(await fs.readFile(path.join(root,'expected-workbooks.json'),'utf8')).filter(item=>!selectedIds.has(item.id)));
}
const check=(condition,id,detail)=>{if(!condition)issues.push({id,detail});};
const clean=value=>String(value ?? '').replace(/[\u2013\u2014\u2212]/g,'-').replace(/\s+/g,' ').trim();
const safe=value=>{const text=String(value ?? '');return typeof value!=='number' && /^[\s\uFEFF]*[=+@-]/.test(text) ? "'"+text : text;};
function csvRows(text){let row=[],cell='',quoted=false;const rows=[];for(let i=0;i<text.length;i++){const c=text[i];if(i===0 && c==='\uFEFF')continue;if(c==='"'){if(quoted && text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted && (c===',' || c==='\n')){row.push(cell);cell='';if(c==='\n'){rows.push(row);row=[];}}else if(c!=='\r' || quoted)cell+=c;}assert(!quoted);row.push(cell);rows.push(row);return rows;}
const app=express();app.use('/api',router);
const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
const origin='http://127.0.0.1:'+server.address().port;
try{
 for(const item of cases.filter(item=>!only || selectedIds.has(item.id))){
  const {id,report,scenario}=item,before=hash(report),model=weeklyReport(report),normalized=router._test.executivePayload(report),exportedModel=weeklyReport(normalized);
  const tables=model.sessionReport ? [...model.results,...(model.annexTables || [])] : report.tables || [];
  const available=hasPublishedReportData(model),account='suite-'+id;
  const authorization='Bearer '+jwt.sign({sub:account,email:account+'@example.invalid',role:'user'},process.env.JWT_SECRET,{expiresIn:'60m'});
  if(item.original){const original=weeklyReport(item.original);check(JSON.stringify(original.results)===JSON.stringify(model.results),id,'Save/reopen changed result tables');check(JSON.stringify(original.visuals)===JSON.stringify(model.visuals),id,'Save/reopen changed chart data');}
  check(clean(model.summary)===clean(exportedModel.summary),id,'Normalization changed the executive summary');
  const shape={id,collection:report.baseReport?.collection || report.collection,key:report.baseReport?.key || report.key,scenario,year:report.reportYear,cutoff:report.generatedAt,available,references:model.references?.length || 0,rows:tables.reduce((sum,table)=>sum+table.rows.length,0),visuals:model.visuals?.length || 0,panorama:Boolean(model.panorama),news:Boolean(model.newsExecutive),countries:model.bondExecutive?.international?.countryCount};review.push(shape);
  for(const format of xlsxOnly ? ['xlsx'] : ['pdf','csv','xlsx']){
   const started=performance.now();let headers;
   try{
    const blob=await requestReportFile(report,report.title,'Simulación de exportación local del informe.',format,async(route,options)=>{const response=await fetch(origin+route,{...options,headers:{...options.headers,Authorization:authorization}});headers={status:response.status,length:Number(response.headers.get('content-length')),mime:response.headers.get('content-type'),language:response.headers.get('content-language'),cache:response.headers.get('cache-control'),disposition:response.headers.get('content-disposition')};return response;},{language:'es',expectedOwner:account+'@example.invalid',timeoutMs:120000});
    check(available,id+'/'+format,'Exported a report without published evidence');
    const data=Buffer.from(await blob.arrayBuffer()),file=id+'.'+format;assert.equal(headers.length,data.length);assert.match(headers.cache,/private, no-store/);assert.equal(headers.language,'es');assert(headers.disposition.endsWith('.'+format+'"'));
    await fs.writeFile(path.join(root,file),data);
    let details={};
    if(format==='pdf'){
     const task=getDocument({data:new Uint8Array(data),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise;let text='';const pages=[];
     try{
      check(model.panorama || pdf.numPages<=3,id+'/pdf','Individual PDF exceeds three pages');
      for(let n=1;n<=pdf.numPages;n++){
       const page=await pdf.getPage(n),words=(await page.getTextContent()).items.filter(word=>word.str?.trim());text+=words.map(word=>word.str).join(' ')+' ';
       if(model.newsExecutive)for(const group of model.newsExecutive.groups)if(words.some(word=>[clean(group.label),clean(group.label+' · continuación')].includes(clean(word.str))))check(group.stories.some(story=>clean(words.map(word=>word.str).join(' ')).includes(clean(story.title))),id+'/pdf','Orphan news section heading on page '+n+': '+group.label);
       check(words.length>15,id+'/pdf','Nearly empty page '+n);
       const clipped=words.filter(word=>word.transform[4]<23 || word.transform[4]+word.width>page.view[2]-21 || word.transform[5]<(model.panorama ? 18 : 41));
       if(clipped.length)issues.push({id:id+'/pdf',detail:'Clipping on page '+n,examples:clipped.slice(0,3).map(word=>word.str)});
       pages.push({page:n,words:words.length});
      }
      check(!/\b(?:NaN|undefined|Infinity)\b/.test(text),id+'/pdf','Invalid numeric or placeholder text');
      if(model.fxExecutive){check(!/USD\/(?:EUR|GBP)\b/.test(text),id+'/pdf','Inverted EUR or GBP market convention');if(model.fxExecutive.dxy)check(text.includes('DXY'),id+'/pdf','DXY missing');}
      if(model.bondExecutive)for(const term of ['SOFR','TIIE','TIPS'])if(model.references.some(ref=>ref.label.includes(term)))check(text.includes(term),id+'/pdf','Core bond reference omitted: '+term);
      if(model.annualReport)for(const panel of model.commentary || [])check(clean(text).includes(clean(panel.heading)),id+'/pdf','Annual analysis heading omitted: '+panel.heading);
      details={pages:pdf.numPages,pageDetails:pages};await fs.writeFile(path.join(root,id+'.txt'),text);
     }finally{await task.destroy();}
    }else if(format==='csv'){
     const rows=csvRows(data.toString('utf8')),rowIndex=new Set(rows.map(row=>JSON.stringify(row.map(clean))));
     check(data.subarray(0,3).equals(Buffer.from([239,187,191])),id+'/csv','UTF-8 BOM missing');
     for(const table of tables){check(rows.some(row=>row.length===1 && clean(row[0])===clean(table.title)),id+'/csv','Table title lost: '+table.title);for(const row of table.rows)check(rowIndex.has(JSON.stringify(row.map(safe).map(clean))),id+'/csv','Table row lost: '+table.title+' / '+row[0]);}
     if(model.fxExecutive)check(!/USD\/(?:EUR|GBP)\b/.test(data.toString('utf8')),id+'/csv','Inverted conventional pair');
     details={rows:rows.length};
    }else{
     const zip=await JSZip.loadAsync(data,{checkCRC32:true}),sheets=Object.keys(zip.files).filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name));assert(zip.file('xl/workbook.xml'));details={sheets:sheets.length};
     const refs=report.periodType==='annual' ? report.annualReferences || [] : model.references || [];
     expected.push({file,id,annual:report.periodType==='annual',year:report.reportYear,cutoff:report.generatedAt,tables,references:refs.map(ref=>({label:ref.label,unit:ref.unit,points:ref.points || [],last:ref.last,prior:ref.prior,annualValue:ref.annualValue,cadence:ref.cadence})),visuals:model.visuals || [],news:model.newsExecutive || null,panorama:Boolean(model.panorama),production:report.annualProduction || [],mexico:Boolean(model.mexicoExecutive),fx:Boolean(model.fxExecutive)});
    }
    results.push({id,format,status:200,bytes:data.length,ms:Math.round(performance.now()-started),sha256:createHash('sha256').update(data).digest('hex'),...details});
   }catch(error){
    if(!available && error.status===422){results.push({id,format,status:422,expectedRejection:true});}
    else issues.push({id:id+'/'+format,detail:error.message,status:error.status});
   }
  }
  assert.equal(hash(report),before);console.log(JSON.stringify({id,available,downloads:results.filter(result=>result.id===id).length,issues:issues.filter(issue=>issue.id.startsWith(id)).length}));
  await fs.writeFile(path.join(root,'suite-results.json'),JSON.stringify({inputHash,caseCount:cases.length,completedCases:review.length,results,issues,warnings,review},null,2));
 }
 assert.equal(hash(inputs),inputHash);
 await fs.writeFile(path.join(root,'expected-workbooks.json'),JSON.stringify(expected));
 console.log(JSON.stringify({cases:cases.length,downloads:results.filter(result=>result.status===200).length,rejections:results.filter(result=>result.expectedRejection).length,issues:issues.length,root}));
 if(issues.length)process.exitCode=1;
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
