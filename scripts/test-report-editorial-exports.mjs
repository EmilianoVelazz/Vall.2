import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
const require=createRequire(import.meta.url);process.env.NODE_ENV='test';process.env.JWT_SECRET='editorial-export-isolated-fixture';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','GMAIL_USER','GMAIL_PASS','GEMINI_API_KEY'])process.env[key]='';
const auth=require.resolve('../backend/routes/auth');require.cache[auth]={id:auth,filename:auth,loaded:true,exports:{verifyToken:(_req,_res,next)=>next()}};
const {_test}=require('../backend/routes/export'),{composePanorama,composeMexicoPanorama}=require('../backend/lib/report-panorama'),{composeMarketOverview}=require('../backend/lib/report-market-overview');
const folder='output/correcciones-editoriales-20261106';await fs.mkdir(folder,{recursive:true});
const snapshots={};for(const [area,name] of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']])snapshots[area]=JSON.parse(await fs.readFile('backend/cache/'+name+'.json','utf8'));
snapshots.markets=composeMarketOverview(snapshots.markets);snapshots.mexico=composeMexicoPanorama(snapshots.mexico);snapshots.finance=await composePanorama(snapshots.finance,{marketsSnapshot:snapshots.markets,mexicoSnapshot:snapshots.mexico});
const inputs=Object.entries(snapshots).flatMap(([area,snapshot])=>snapshot.reports.map(report=>({...report,collection:area})));
for(const [area,key] of [['markets','grains'],['markets','proteins'],['finance','fx']])inputs.push({...inputs.find(report=>report.collection===area && report.key===key),analysisPeriod:'weekly'});
const annual=JSON.parse(await fs.readFile('backend/data/annual-report-library.json','utf8'));
for(const [year,area,key] of [[2025,'finance','daily_news'],[2024,'markets','market_news'],[2023,'mexico','mx_overview']])inputs.push(annual.years[year].find(report=>report.collection===area && report.key===key));
const results=[];
for(const report of inputs){
 const model=weeklyReport(report),id=[report.collection,report.key,report.periodType==='annual' ? report.reportYear : report.analysisPeriod || 'daily'].join('-'),original=JSON.stringify(report),bytes=await _test.makeExecutivePdf(report.title,report),task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise;
 let text='';for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n);for(const item of (await page.getTextContent()).items.filter(item=>item.str.trim())){assert(item.transform[4]>=18 && item.transform[4]+item.width<=page.view[2]-16,'Horizontal overflow '+id+' page '+n+': '+item.str);assert(item.transform[5]>=18,'Bottom overflow '+id+' page '+n);text+=item.str+' ';}}
 assert(!/NaN|Infinity|\(cid:/.test(text));assert.equal(JSON.stringify(report),original,'PDF generation preserves source evidence');
 if(!model.panorama)assert(pdf.numPages<=(report.key==='proteins' ? 6 : model.bondExecutive ? 5 : 3),id+' exceeds its executive page allowance');
 if(report.key==='fx')assert(!/65%|18\.70(?!\d)|1\.75%/.test(text),'No invented hedge policy in PDF');
 if(report.periodType==='annual')assert(text.includes('Hitos documentados') || text.includes('Balance del año'),'Annual export uses the executive annual model');
 await fs.writeFile(folder+'/'+id+'.pdf',bytes);await fs.writeFile(folder+'/'+id+'.json',JSON.stringify(report));results.push({id,pages:pdf.numPages,bytes:bytes.length});console.log(JSON.stringify(results.at(-1)));await task.destroy();
}
await fs.writeFile(folder+'/exports.json',JSON.stringify(results,null,2));console.log('Editorial export suite: '+results.length+' PDFs; original evidence, page limits and text bounds verified.');
