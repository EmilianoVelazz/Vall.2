'use strict';
process.env.NODE_ENV='test';process.env.VERCEL='1';process.env.JWT_SECRET='preview-reuse-ui-fixture-only-32bytes';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const key of ['SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DATABASE_URL','SUPABASE_PASSWORD','GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS','USER_PASSWORD','VALL_AUTH_PASSWORD'])process.env[key]='';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),express=require('express'),{chromium}=require('playwright');
const owner='preview-reuse@example.invalid',authId=require.resolve('../backend/routes/auth');
require.cache[authId]={id:authId,filename:authId,loaded:true,exports:{verifyToken:(req,res,next)=>{req.user={email:owner,id:'preview-reuse',role:'user'};next();}}};
const {reportLabels}=require('../backend/lib/report-language');
require('../backend/services/report-translation').reportTranslator.localize=async input=>({...input,...reportLabels('es'),source:value=>value,translateText:value=>value});
const router=require('../backend/routes/export');
async function main(){
 const snapshot=JSON.parse(await fs.readFile('backend/cache/finance_executive_reports.json','utf8')),reports=['equities','fx'].map(key=>snapshot.reports.find(report=>report.key===key)),app=express(),output=path.resolve('output/pdf-preview-performance-20261112');await fs.mkdir(output,{recursive:true});
 let exports=0,verifyCalls=0;const errors=[];
 app.use('/api',(req,res,next)=>{
  if(req.path==='/report-export'){exports++;return next();}
  if(req.path==='/verify-token'){verifyCalls++;return res.json({success:true,email:owner});}
  if(req.path==='/profile')return res.json({success:true,profile:{email:owner,preferences:{}}});
  if(req.path==='/finance-executive-reports')return res.json({success:true,data:reports});
  return res.json({success:true,data:[],articles:[]});
 });app.use('/api',router);app.use(express.static(path.resolve('dist')));app.use((req,res)=>res.sendFile(path.resolve('dist/index.html')));
 let server,browser;
 try{
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/informes');
  const open=async report=>{await page.locator('.erh-library-entry').filter({has:page.locator('strong',{hasText:report.title})}).first().click();await page.getByRole('region',{name:'Vista previa PDF de '+report.title,exact:true}).locator('canvas').waitFor({state:'visible',timeout:60000});};
  await open(reports[0]);assert.equal(exports,1,'The initial preview requires one export');
  await open(reports[1]);assert.equal(exports,2);
  const verifiedBefore=verifyCalls,start=Date.now();await open(reports[0]);const reopenedMs=Date.now()-start;
  assert.equal(exports,2,'Returning to an unchanged report reuses its private PDF');assert(verifyCalls>verifiedBefore,'Cached bytes still require a fresh account verification');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar PDF',exact:true}).click();await downloadPromise;
  assert.equal(exports,2,'Download uses exactly the reviewed PDF');assert.deepEqual(errors,[]);
  await page.getByRole('region',{name:'Vista previa PDF de '+reports[0].title,exact:true}).screenshot({path:path.join(output,'preview-reuse-desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.getByRole('region',{name:'Vista previa PDF de '+reports[0].title,exact:true}).locator('canvas').waitFor({state:'visible'});await page.screenshot({path:path.join(output,'preview-reuse-mobile.png')});
  await fs.writeFile(path.join(output,'ui-reuse.json'),JSON.stringify({exports,reopenedMs,cachedAccountVerified:true,downloadReusedReviewedBytes:true,errors},null,2));
  console.log(JSON.stringify({exports,reopenedMs,cachedAccountVerified:true,downloadReusedReviewedBytes:true,errors}));
 }finally{if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
