'use strict';
/* global location, window */
process.env.NODE_ENV='test';process.env.VERCEL='1';process.env.JWT_SECRET='initial-preview-loading-fixture-only-32bytes';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const key of ['SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DATABASE_URL','SUPABASE_PASSWORD','GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS','FINNHUB_TOKEN','NEWSAPI_KEY','USER_PASSWORD','VALL_AUTH_PASSWORD'])process.env[key]='';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),express=require('express'),{chromium}=require('playwright');
const owner='initial-preview@example.invalid',authId=require.resolve('../backend/routes/auth');
require.cache[authId]={id:authId,filename:authId,loaded:true,exports:{verifyToken:(req,res,next)=>{req.user={email:owner,id:'initial-preview',role:'user'};next();}}};
const http=require('../backend/lib/http');http.externalGet=async()=>{throw Error('External providers disabled');};http.gdeltFetch=http.externalGet;http.yahooFetch=http.externalGet;
let newsLoads=0;require('../backend/lib/report-financial-news').loadFinancialNews=()=>{newsLoads++;return new Promise(()=>{});};
const {reportLabels}=require('../backend/lib/report-language');require('../backend/services/report-translation').reportTranslator.localize=async input=>({...input,...reportLabels('es'),source:value=>value,translateText:value=>value});
async function main(){
 const snapshot=JSON.parse(await fs.readFile('backend/cache/finance_executive_reports.json','utf8'));snapshot.generatedAt=new Date().toISOString();
 const news=snapshot.reports.find(report=>report.key==='daily_news');news.newsVersion=0;
 const store=require('../backend/services/finance-report-store');store.load=async()=>snapshot;store.save=async()=>{throw Error('The intentionally stalled source cannot publish a new edition');};
 require('../backend/services/market-report-store').load=async()=>null;require('../backend/services/mexico-report-store').load=async()=>null;
 const finance=require('../backend/routes/finanzas'),exportsRouter=require('../backend/routes/export'),app=express(),timers=new Set(),apiTimes=[];let exportRequests=0,profileRequests=0,navigationAt=0;
 app.use('/api',(req,res,next)=>{
  const start=Date.now();res.once('finish',()=>apiTimes.push({path:req.path,startedAfterNavigationMs:start-navigationAt,ms:Date.now()-start,status:res.statusCode}));
  if(['/finance-executive-reports','/report-export'].includes(req.path)){if(req.path==='/report-export')exportRequests++;return next();}
  if(req.path==='/verify-token')return res.json({success:true,email:owner});
  if(req.path==='/profile'){
   profileRequests++;const timer=setTimeout(()=>res.status(503).json({success:false,error:'Simulated slow profile service'}),12000);timers.add(timer);res.once('close',()=>{clearTimeout(timer);timers.delete(timer);});return;
  }
  return res.json({success:true,data:[],articles:[]});
 });app.use('/api',finance);app.use('/api',exportsRouter);app.use(express.static(path.resolve('dist')));app.use((req,res)=>res.sendFile(path.resolve('dist/index.html')));
 let server,browser;const output=path.resolve('output/pdf-preview-loading-20261112');await fs.mkdir(output,{recursive:true});
 try{
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});await require('../backend/lib/report-branding').prepareReportBranding();browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const coldPreferences=process.argv.includes('--cold-preferences'),vite=process.argv.includes('--vite'),fixtureOrigin='http://127.0.0.1:'+server.address().port;
  if(!coldPreferences)await page.addInitScript(({owner})=>{try{if(location.hostname==='127.0.0.1' && window.top===window)sessionStorage.setItem(`vallnews:report-edition:v1:${encodeURIComponent(owner)}`,JSON.stringify({preferences:{},pending:false}));}catch{ /* PDF sandbox frames have no session storage. */ }},{owner});
  if(vite)await page.route('**/api/**',async route=>{const url=new URL(route.request().url());if(!url.pathname.startsWith('/api/'))return route.continue();try{const response=await route.fetch({url:fixtureOrigin+url.pathname+url.search,timeout:15000});await route.fulfill({response});}catch{if(!page.isClosed())await route.abort().catch(()=>{});}});
  const report=snapshot.reports.find(item=>item.key==='equities'),start=Date.now();navigationAt=start;await page.goto((vite?'http://127.0.0.1:5273':fixtureOrigin)+'/informes');
  await page.getByRole('region',{name:'Vista previa PDF de '+report.title,exact:true}).locator('canvas').waitFor({state:'visible',timeout:60000}).catch(async error=>{await page.screenshot({path:path.join(output,'initial-failure.png')});const detail={text:(await page.locator('body').innerText()).slice(0,4500),exportRequests,profileRequests,newsLoads,apiTimes,errors};await fs.writeFile(path.join(output,'initial-failure.json'),JSON.stringify(detail,null,2));console.log(JSON.stringify(detail));throw error;});const firstPageMs=Date.now()-start;
  assert.equal(exportRequests,1);assert(profileRequests>=1);assert.deepEqual(errors,[]);
  const firstExport=apiTimes.find(item=>item.path==='/report-export'),finishedProfile=apiTimes.find(item=>item.path==='/profile');
  assert(firstExport && (!finishedProfile || firstExport.startedAfterNavigationMs<finishedProfile.startedAfterNavigationMs+finishedProfile.ms),'PDF generation must start without waiting for the slow profile response');
  const name='initial-preview'+(vite?'-vite':'')+(coldPreferences?'-cold-preferences':'');
  await page.getByRole('region',{name:'Vista previa PDF de '+report.title,exact:true}).screenshot({path:path.join(output,name+'.png')});
  let panoramaPageMs;
  if(process.argv.includes('--panorama')){const panorama=snapshot.reports.find(item=>item.key==='overview'),opened=Date.now();await page.locator('.erh-library-entry').filter({has:page.locator('strong',{hasText:panorama.title})}).first().click();await page.getByRole('region',{name:'Vista previa PDF de '+panorama.title,exact:true}).locator('canvas').waitFor({state:'visible',timeout:60000});panoramaPageMs=Date.now()-opened;assert.equal(exportRequests,2);await page.getByRole('region',{name:'Vista previa PDF de '+panorama.title,exact:true}).screenshot({path:path.join(output,name+'-panorama.png')});}
  const result={firstPageMs,panoramaPageMs,exportRequests,profileRequests,newsLoads,profileDelayMs:12000,newsProviderNeverCompletes:true,realFinanceRoute:true,realPdfExport:true,actualDevelopmentFrontend:vite,coldPreferences,apiTimes,errors};await fs.writeFile(path.join(output,name+(panoramaPageMs?'-with-panorama':'')+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{if(browser)await browser.close();for(const timer of timers)clearTimeout(timer);if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
