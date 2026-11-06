// Offline download simulation: real HTTP router and frontend file client;
// fixture identity/localization only. No AI, database writes or email delivery.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {getDocument} from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {requestReportFile} from '../frontend/src/lib/reportPdf.js';
const require=createRequire(import.meta.url);
process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-download-simulation-not-a-production-secret';
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS'])process.env[key]='';
const express=require('express'),jwt=require('jsonwebtoken'),JSZip=require('jszip');
const owner='download-fixture@example.invalid';
require('../backend/services/user-profile-store').findById=async id=>({active:true,email:id+'@example.invalid',credentialVersion:0});
const {reportLabels}=require('../backend/lib/report-language');
require('../backend/services/report-translation').reportTranslator.localize=async input=>({...input,...reportLabels('es'),source:text=>text,translateText:text=>text});
const router=require('../backend/routes/export'),app=express();app.use('/api',router);
const reports=JSON.parse(await fs.readFile('output/report-five-pages-20261023/final/sources.json','utf8'));
const id=report=>report.collection+'-'+report.key+'-'+(report.reportYear || (report.analysisPeriod==='weekly' ? 'semanal' : 'diario'));
const cases=['finance-equities-diario','finance-fx-diario','markets-proteins-diario','markets-grains-diario','mexico-mx_proteins-diario','finance-equities-semanal','finance-bonds-2022','markets-proteins-2023','markets-overview-2024','mexico-mx_proteins-2025'];
const output=path.resolve('output/report-download-simulations-20261023');await fs.mkdir(output,{recursive:true});
const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
const origin='http://127.0.0.1:'+server.address().port;
const authorization=subject=>'Bearer '+jwt.sign({sub:subject,email:subject+'@example.invalid',role:'user'},process.env.JWT_SECRET,{expiresIn:'30m'});
const headers={'Content-Type':'application/json',Authorization:authorization('download-fixture')},results=[];
try{
  const unauthenticated=await fetch(origin+'/api/report-export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'Prueba de descarga',format:'pdf',response:'file'})});
  assert.equal(unauthenticated.status,401,'A missing session never downloads private report data');
  const changed=await fetch(origin+'/api/report-export',{method:'POST',headers:{...headers,Authorization:authorization('other-download-fixture')},body:JSON.stringify({content:'Prueba de identidad',expectedOwner:owner,format:'pdf',response:'file'})});
  assert.equal(changed.status,409,'An account change is rejected before file generation');
  for(const key of cases){
    const report=reports.find(report=>id(report)===key);assert(report,'Missing fixture '+key);
    const unchanged=JSON.stringify(report);
    for(const format of ['pdf','xlsx']){
      const started=performance.now();let received;
      const blob=await requestReportFile(report,report.title,report.summary || 'Informe con datos guardados.',format,async(route,options)=>{
        const response=await fetch(origin+route,{...options,headers:{...options.headers,Authorization:headers.Authorization}});
        received={status:response.status,length:Number(response.headers.get('content-length')),disposition:response.headers.get('content-disposition'),cache:response.headers.get('cache-control')};
        return response;
      },{language:'es',expectedOwner:owner,timeoutMs:120000});
      assert.equal(received.status,200);assert.equal(received.length,blob.size);
      assert.match(received.disposition,new RegExp('attachment; filename="[^"\\r\\n]+\\.'+format+'"'));
      assert.match(received.cache,/private, no-store/);
      const data=Buffer.from(await blob.arrayBuffer()),file=path.join(output,key+'.'+format);await fs.writeFile(file,data);
      let detail;
      if(format==='pdf'){
        const task=getDocument({data:new Uint8Array(data),useSystemFonts:true}),pdf=await task.promise;
        try{
          assert(pdf.numPages>=1 && pdf.numPages<=5,'The downloaded PDF respects the five-page limit');
          for(let n=1;n<=pdf.numPages;n++)assert((await(await pdf.getPage(n)).getTextContent()).items.some(item=>item.str.trim()),'No empty downloaded page');
          detail={pages:pdf.numPages};
        }finally{await task.destroy();}
      }else{
        const book=await JSZip.loadAsync(data,{checkCRC32:true});assert(book.file('[Content_Types].xml'));assert(book.file('xl/_rels/workbook.xml.rels'));
        const xml=await book.file('xl/workbook.xml').async('string');assert(xml.includes('Observaciones') && xml.includes('Cobertura'));
        const sheets=Object.keys(book.files).filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name));assert(sheets.length>=3);
        for(const sheet of sheets){const content=await book.file(sheet).async('string');assert(content.includes('</worksheet>'));assert(!/<f(?:\s|>)/.test(content),'No implicit spreadsheet formulas');}
        detail={sheets:sheets.length};
      }
      const result={report:key,format,bytes:data.length,milliseconds:Math.round(performance.now()-started),...detail};results.push(result);console.log(JSON.stringify(result));
    }
    assert.equal(JSON.stringify(report),unchanged,'Downloading never modifies the full report');
  }
  const limited=await fetch(origin+'/api/report-export',{method:'POST',headers,body:JSON.stringify({content:'Comprobación del límite',format:'pdf',response:'file',expectedOwner:owner})});
  assert.equal(limited.status,429,'The existing export rate limit remains active');
  await fs.writeFile(path.join(output,'http-results.json'),JSON.stringify({downloads:results.length,checks:{missingSession:401,changedAccount:409,rateLimit:429},results},null,2));
  console.log('HTTP downloads: OK · '+results.length+' PDF/Excel files, all report areas, daily/weekly and 2022–2025; valid headers, complete files, five-page PDF limit, protected sessions and active rate limit.');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
