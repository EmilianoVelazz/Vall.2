// Exercise the real download client, HTTP export route and private save/reopen.
// Only identity and translation are fixtures. No external delivery or DB writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {requestReportFile} from '../frontend/src/lib/reportPdf.js';
import {createReportDraft} from '../frontend/src/lib/reportCreation.js';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {mexicoProductionObservations} from '../shared/report-mexico-export-data.mjs';
const require=createRequire(import.meta.url);
process.env.NODE_ENV='test';process.env.JWT_SECRET='mexico-export-simulation-local-fixture';
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const name of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS'])process.env[name]='';
const express=require('express'),jwt=require('jsonwebtoken'),JSZip=require('jszip');
require('../backend/services/user-profile-store').findById=async id=>({active:true,email:id+'@example.invalid',credentialVersion:0});
const {reportLabels}=require('../backend/lib/report-language');
require('../backend/services/report-translation').reportTranslator.localize=async input=>({...input,...reportLabels('es'),source:text=>text,translateText:text=>text});
const router=require('../backend/routes/export'),{createUserReportStore}=require('../backend/services/user-report-store');
const output=path.resolve(process.env.MEXICO_EXPORT_SIM_OUTPUT || 'output/mexico-export-simulaciones-20261029');
await fs.mkdir(output,{recursive:true});
const store=createUserReportStore({directory:path.join(output,'private-fixtures')});
const reports=JSON.parse(await fs.readFile('backend/cache/mexico-executive-reports.json','utf8')).reports;
const originalHash=createHash('sha256').update(JSON.stringify(reports)).digest('hex');
const results=[],issues=[],expectations=[];
function check(condition,message){if(!condition)issues.push(message);}
function parseCsv(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(i===0 && c==='\uFEFF')continue;
  if(c==='"'){if(quoted && text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(!quoted && (c===',' || c==='\n')){row.push(cell);cell='';if(c==='\n'){rows.push(row);row=[];}}
  else if(c!=='\r' || quoted)cell+=c;
 }
 assert(!quoted,'CSV quote closes');row.push(cell);rows.push(row);return rows;
}
const safe=value=>{const text=String(value ?? '');return typeof value!=='number' && /^[\s\uFEFF]*[=+@-]/.test(text) ? "'"+text : text;};
const canonical=value=>String(value ?? '').replace(/\s+/g,'').replace(/[\u2013\u2014\u2212]/g,'-');
const token=id=>'Bearer '+jwt.sign({sub:id,email:id+'@example.invalid',role:'user'},process.env.JWT_SECRET,{expiresIn:'30m'});
const app=express();app.use('/api',router);
const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
const origin='http://127.0.0.1:'+server.address().port;
async function inspectFile(report,model,scenario,format,data){
 const key=report.baseReport?.key || report.key,id=key+'-'+scenario,prefix=id+' / '+format;
 const tables=[...model.results,...(model.annexTables || [])];
 if(format==='pdf'){
  const task=getDocument({data:new Uint8Array(data),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise;
  try{let text='';const pages=[];check(pdf.numPages<=3,prefix+': exceeds 3 pages');
   for(let n=1;n<=pdf.numPages;n++){
    const page=await pdf.getPage(n),words=(await page.getTextContent()).items.filter(item=>item.str?.trim());
    check(words.length>20,prefix+': nearly empty page '+n);
    for(const word of words){check(word.transform[4]>=24 && word.transform[4]+word.width<=page.view[2]-22,prefix+': horizontal clipping '+word.str);check(word.transform[5]>=42,prefix+': footer overlap '+word.str);}
    const body=words.filter(item=>item.transform[5]>65 && item.transform[5]<page.view[3]-65);
    pages.push({page:n,words:words.length,bottomGapPt:Math.round(Math.min(...body.map(item=>item.transform[5]))-65)});
    text+=words.map(item=>item.str).join(' ')+' ';
   }
   check(!/ref\. [a-f0-9]{10}/.test(text),prefix+': internal identity visible');
   const packed=canonical(text);
   for(const reference of model.references)check(packed.includes(canonical(reference.last.value.toLocaleString('es-MX',{maximumFractionDigits:2}))),prefix+': last quote missing '+reference.label);
   if(key==='mx_bolsa')check(text.includes('intradía') && text.includes('UTC'),prefix+': observation timing missing');
   if(key==='mx_production')for(const table of report.tables.filter(item=>/^Granos por entidad|^Valor minero por entidad/.test(item.title)))for(const row of table.rows){
    const mining=/^Valor minero/.test(table.title);check(text.includes(row[0]),prefix+': state missing '+row[0]);
    for(const [index,value] of row.slice(1,mining?3:5).entries())if(/^\d/.test(value)){
     // The PDF explicitly presents mining in billions; Excel keeps raw MXN.
     const scaled=Number(String(value).replaceAll(',',''))/1e9;
     const displayed=mining && index===0 ? scaled.toLocaleString('es-MX',scaled!==0 && Math.abs(scaled)<.001 ? {maximumSignificantDigits:3} : {maximumFractionDigits:3}) : value;
     check(packed.includes(canonical(displayed)),prefix+': published value missing '+value);
    }
    if(mining)check(text.includes('miles de millones') && text.includes('Cifras originales'),prefix+': mining scale or precision note missing');
   }
   return {pages:pdf.numPages,pageGeometry:pages};
  }finally{await task.destroy();}
 }
 if(format==='csv'){
  check(data.subarray(0,3).equals(Buffer.from([239,187,191])),prefix+': UTF-8 BOM missing');
  const text=data.toString('utf8'),rows=parseCsv(text),index=new Set(rows.map(row=>JSON.stringify(row)));
  check(rows[1]?.[1]===report.generatedAt,prefix+': cutoff changed');
  for(const table of tables){check(rows.some(row=>row.length===1 && row[0]===table.title),prefix+': table missing '+table.title);for(const row of table.rows)check(index.has(JSON.stringify(row.map(safe))),prefix+': table row lost '+table.title+' / '+row[0]);if(table.note)check(rows.some(row=>row[0]==='Método y alcance' && row[1]===table.note),prefix+': method lost '+table.title);}
  for(const reference of model.references)check(rows.some(row=>row.includes(reference.last.date) && row.includes(String(reference.last.value)) && row.includes(reference.unit)),prefix+': dated observation missing '+reference.label);
  for(const item of mexicoProductionObservations(report))check(index.has(JSON.stringify([item.label,item.market,item.unit,String(item.year),String(item.value),'Anual',item.source,item.url])),prefix+': annual numeric production missing '+item.market+' / '+item.label);
  return {rows:rows.length,tableRows:tables.reduce((sum,table)=>sum+table.rows.length,0)};
 }
 const zip=await JSZip.loadAsync(data,{checkCRC32:true});assert(zip.file('[Content_Types].xml'));assert(zip.file('xl/workbook.xml'));
 const xml=await zip.file('xl/workbook.xml').async('string'),sheets=Object.keys(zip.files).filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name));
 check(xml.includes('Datos de gráficas'),prefix+': chart backing data missing');
 const observations=[...model.references.flatMap(reference=>(reference.points?.length ? reference.points : [reference.last]).filter(point=>Number.isFinite(point?.value)).map(point=>({label:reference.label,unit:reference.unit,date:point.date,value:point.value,cadence:reference.cadence}))),...mexicoProductionObservations(report)];
 expectations.push({file:id+'.xlsx',key,scenario,tables,observations,cutoff:report.generatedAt,visualPoints:model.visuals.reduce((sum,visual)=>sum+(visual.type==='bar' ? visual.bars.length : visual.series.reduce((total,series)=>total+series.points.length,0)),0)});
 return {sheets:sheets.length,nativeCharts:Object.keys(zip.files).filter(name=>/^xl\/charts\/chart\d+\.xml$/.test(name)).length};
}
try{
 for(const original of reports){
  const before=JSON.stringify(original),draft=createReportDraft('mexico',{...original,analysisPeriod:'weekly'}).report;
  const saved=await store.save('simulation@example.invalid',{report:draft});
  const reopened=await store.get('simulation@example.invalid',saved.editionId);
  assert(reopened);assert.equal(reopened.generatedAt,original.generatedAt);
  for(const [scenario,report] of [['daily',{...original,analysisPeriod:'daily'}],['weekly',{...original,analysisPeriod:'weekly'}],['saved-weekly',reopened]]){
   const model=weeklyReport(report),key=original.key,base=weeklyReport({...original,analysisPeriod:scenario==='daily' ? 'daily' : 'weekly'});
   assert.deepEqual(model.results,base.results,'Saving preserves result rows');assert.deepEqual(model.visuals,base.visuals,'Saving preserves chart points');
   const id=key+'-'+scenario,account='mx-simulation-'+id;
   for(const format of ['pdf','csv','xlsx']){
    const started=performance.now();let headers;
    try{
     const blob=await requestReportFile(report,report.title,'Simulación local de exportación del informe.',format,async(route,options)=>{
      const response=await fetch(origin+route,{...options,headers:{...options.headers,Authorization:token(account)}});
      headers={status:response.status,length:Number(response.headers.get('content-length')),disposition:response.headers.get('content-disposition'),cache:response.headers.get('cache-control'),language:response.headers.get('content-language')};return response;
     },{language:'es',expectedOwner:account+'@example.invalid'});
     const data=Buffer.from(await blob.arrayBuffer());assert.equal(headers.status,200);assert.equal(headers.length,data.length);assert.match(headers.cache,/private, no-store/);assert.equal(headers.language,'es');assert.match(headers.disposition,new RegExp('attachment; filename="[^"\\r\\n]+\\.'+format+'"'));
     await fs.writeFile(path.join(output,id+'.'+format),data);
     const detail=await inspectFile(report,model,scenario,format,data);
     const result={report:key,scenario,format,status:200,bytes:data.length,ms:Math.round(performance.now()-started),sha256:createHash('sha256').update(data).digest('hex'),...detail};results.push(result);console.log(JSON.stringify(result));
    }catch(error){issues.push(id+' / '+format+': '+error.message);}
   }
  }
  assert.equal(JSON.stringify(original),before,'Source report remains immutable');
 }
 const rejection=[];
 const reject=async(name,body,authorization,status)=>{const response=await fetch(origin+'/api/report-export',{method:'POST',headers:{'Content-Type':'application/json',...(authorization ? {Authorization:authorization} : {})},body:JSON.stringify(body)});check(response.status===status,name+': expected '+status+', got '+response.status);rejection.push({name,status:response.status});};
 const body={content:'Validación local de descarga',format:'pdf',response:'file'};
 await reject('Sin sesión',body,null,401);
 await reject('Cambio de cuenta',{...body,expectedOwner:'someone-else@example.invalid'},token('simulation-guards'),409);
 const empty={collection:'mexico',key:'mx_bolsa',title:'Simulación sin cotizaciones',summary:'Sin observaciones publicadas.',generatedAt:reports[0].generatedAt,tables:[],visuals:[],dailyReferences:[],marketHistory:[]};
 for(const format of ['pdf','csv','xlsx'])await reject('Sin datos / '+format,{...body,executiveReport:empty,format},token('simulation-empty'),422);
 assert.equal(createHash('sha256').update(JSON.stringify(reports)).digest('hex'),originalHash);
 await fs.writeFile(path.join(output,'expected-workbooks.json'),JSON.stringify(expectations,null,2));
 await fs.writeFile(path.join(output,'simulation-results.json'),JSON.stringify({cutoff:reports[0].generatedAt,downloads:results.length,results,rejection,issues},null,2));
 console.log(JSON.stringify({downloads:results.length,rejection,issues:issues.length,output}));
 if(issues.length){console.error(issues.slice(0,25).join('\n'));process.exitCode=1;}
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
