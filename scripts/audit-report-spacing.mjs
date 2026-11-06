import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {getDocument} from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const require=createRequire(import.meta.url);process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-report-spacing-audit';
const {_test}=require('../backend/routes/export');
const stage=process.argv.includes('--baseline')?'before':'after',analyzeOnly=process.argv.includes('--analyze-only'),root=path.resolve('tmp/pdfs/todos-informes'),sources=path.join(root,'sources.json');
await fs.mkdir(root,{recursive:true});
let reports;
if(stage==='before' && !analyzeOnly){
 reports=[];
 for(const [collection,file] of [['finance','finance_executive_reports.json'],['markets','market_executive_reports.json'],['mexico','mexico-executive-reports.json']])for(const report of JSON.parse(await fs.readFile(path.join('backend/cache',file),'utf8')).reports)reports.push({...report,collection});
 const annual=JSON.parse(await fs.readFile('backend/cache/annual-report-library.json','utf8'));
 reports.push(...Object.values(annual.years).flat());await fs.writeFile(sources,JSON.stringify(reports));
}else reports=JSON.parse(await fs.readFile(sources,'utf8'));
const matching=process.argv.find(arg=>arg.startsWith('--match='))?.slice(8);
if(matching)reports=reports.filter(report=>new RegExp(matching).test(report.collection+'-'+report.key+'-'+(report.reportYear||'diario')));
const results=[];
for(const report of reports){
 const id=report.collection+'-'+report.key+'-'+(report.reportYear||'diario'),original=JSON.stringify(report);
 const file=path.join(root,stage+'-'+id+'.pdf'),data=analyzeOnly ? await fs.readFile(file) : await _test.makeExecutivePdf(report.title,_test.executivePayload(report));
 if(JSON.stringify(report)!==original)throw Error('El diseño modificó los datos: '+id);
 if(!analyzeOnly)await fs.writeFile(file,data);
 const task=getDocument({data:new Uint8Array(data),useSystemFonts:true,disableFontFace:true}),pdf=await task.promise,pages=[];
 for(let n=1;n<=pdf.numPages;n++){
  const page=await pdf.getPage(n),height=page.view[3],items=(await page.getTextContent()).items.filter(item=>item.str.trim());
  const body=items.filter(item=>item.transform[5]>=78&&item.transform[5]<height-60&&!/^(USO INTERNO|P[ÁA]GINA)/.test(item.str));
  if(!body.length)throw Error('Página sin contenido: '+id+'/'+n);
  for(const item of items.filter(item=>!/^USO INTERNO|^P[ÁA]GINA/.test(item.str)))if(item.transform[4]<30||item.transform[4]+item.width>page.view[2]-28||item.transform[5]<55)throw Error('Contenido fuera de márgenes: '+id+'/'+n+' '+item.str);
  const last=height-Math.min(...body.map(item=>item.transform[5]));pages.push({page:n,usedPercent:Math.round((last-65)/(height-78-65)*100),textItems:body.length});
 }
 results.push({id,collection:report.collection,key:report.key,year:report.reportYear||null,title:report.title,pages:pdf.numPages,occupancy:pages});await task.destroy();
 console.log(id+': '+pdf.numPages+' páginas');
}
await fs.writeFile(path.join(root,stage+(matching ? '-focused' : '')+'.json'),JSON.stringify(results,null,2));console.log(stage+': '+results.length+' informes verificados.');
process.exit(0);
