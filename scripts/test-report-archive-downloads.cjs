'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const express=require('express'),{chromium}=require('playwright');
process.env.NODE_ENV='test';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const key of ['SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','SUPABASE_DATABASE_URL','DATABASE_URL','SUPABASE_PASSWORD','GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS'])process.env[key]='';
const owner='archive-download@example.invalid';let sessionOwner=owner;
const auth=require.resolve('../backend/routes/auth');require.cache[auth]={id:auth,filename:auth,loaded:true,exports:{verifyToken:(req,res,next)=>{req.user={email:sessionOwner,id:'archive-fixture',role:'user'};next();}}};
const router=require('../backend/routes/export');
(async()=>{
 const root=path.resolve(__dirname,'..'),folder=path.join(root,'output/archive-downloads-20261105');await fs.mkdir(folder,{recursive:true});
 const library=JSON.parse(await fs.readFile(path.join(root,'backend/cache/annual-report-library.json'),'utf8')),history=[];
 for(const [area,file,key]of [['finance','finance_executive_reports','equities'],['markets','market_executive_reports','proteins'],['mexico','mexico-executive-reports','mx_bolsa']]){
  const snapshot=JSON.parse(await fs.readFile(path.join(root,'backend/cache',file+'.json'),'utf8')),report={...snapshot.reports.find(report=>report.key===key),collection:area};
  history.push({id:crypto.createHash('sha256').update(area+'-'+key).digest('hex'),collection:area,key,title:report.title,generatedAt:report.generatedAt,report});
 }
 const {reportDownloadName,reportDocumentTitle}=await import('../shared/report-download-name.mjs'),{getDocument}=await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
 const app=express(),errors=[],results=[];let server,browser,page,downloads=0;
 app.use('/api',router);app.use(express.json());app.use('/api',(req,res)=>{
  if(req.path==='/verify-token')return res.json({success:true,email:sessionOwner});
  if(req.path==='/profile')return res.json({success:true,profile:{email:owner,preferences:{}}});
  if(req.path==='/annual-reports')return res.json({success:true,year:Number(req.query.year),data:library.years[req.query.year],generatedAt:library.generatedAt});
  if(req.path==='/report-history')return res.json({success:true,data:history.filter(item=>(!req.query.area || item.collection===req.query.area)&&(!req.query.key || item.key===req.query.key)).map(({report:_report,...entry})=>entry)});
  if(req.path.startsWith('/report-history/'))return res.json({success:true,data:history.find(item=>item.id===req.path.split('/').at(-1))?.report});
  return res.json({success:true,data:[],articles:[]});
 });app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
 try{
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  page.on('pageerror',error=>errors.push(error.message));page.on('download',()=>downloads++);
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/informes?seccion=libreria');
  const archive=page.getByRole('region',{name:'Librería de informes anuales'});
  const check=async(container,report,format,section)=>{
   const [download]=await Promise.all([page.waitForEvent('download',{timeout:180000}),container.getByRole('button',{name:format==='pdf'?'Descargar PDF':'Descargar datos CSV',exact:true}).click()]);
   assert.equal(await download.failure(),null);assert.equal(download.suggestedFilename(),reportDownloadName(report,format));
   const bytes=await fs.readFile(await download.path());assert(bytes.length>0);
   if(format==='pdf'){const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false});try{const pdf=await task.promise;assert.equal((await pdf.getMetadata()).info.Title,reportDocumentTitle(report,{title:report.title}));}finally{await task.destroy();}}
   else assert(bytes.toString('utf8').includes(report.title));
   results.push({section,key:report.key,year:report.reportYear,filename:download.suggestedFilename(),bytes:bytes.length});console.log('PASS '+section+' · '+download.suggestedFilename());
  };
  for(const [year,area,key]of [[2022,'finance','equities'],[2023,'markets','grains'],[2024,'mexico','mx_production'],[2025,'markets','proteins']]){
   await archive.getByRole('group',{name:'Año del informe'}).getByRole('button').filter({hasText:String(year)}).click();
   await archive.getByRole('group',{name:'Familia de la librería anual'}).getByRole('button',{name:new RegExp('^'+({finance:'Finanzas',markets:'Mercados',mexico:'México'})[area])}).click();
   const report=library.years[year].find(report=>report.collection===area && report.key===key);
   await archive.locator('.reports-archive-book').filter({has:page.locator('strong',{hasText:require('../shared/report-library.json').reports[area][key]})}).click();
   await archive.locator('.reports-archive-document>header h3').getByText(report.title,{exact:true}).waitFor();
   await check(archive,report,'pdf','annual');await check(archive,report,'csv','annual');
  }
  const before=downloads;sessionOwner='other@example.invalid';await archive.getByRole('button',{name:'Descargar datos CSV',exact:true}).click();await archive.getByText('La sesión cambió de cuenta. Recarga la cuenta para continuar.',{exact:true}).waitFor();assert.equal(downloads,before,'A local CSV cannot bypass the account check');sessionOwner=owner;
  await page.getByRole('navigation',{name:'Secciones del centro de informes'}).getByRole('button',{name:/^Historial diario/}).click();
  const section=page.locator('.reports-archive').filter({has:page.getByRole('heading',{name:'Historial diario',exact:true})});
  for(const item of history){
   await section.getByLabel('Familia del historial').selectOption(item.collection);await section.getByLabel('Informe del historial').selectOption(item.key);
   await section.locator('.reports-archive-book').first().click();await section.locator('.reports-archive-document>header h3').getByText(item.report.title,{exact:true}).waitFor();
   await check(section,item.report,'pdf','history');await check(section,item.report,'csv','history');
  }
  assert.deepEqual(errors,[]);assert.equal(results.length,14);await fs.writeFile(path.join(folder,'validation.json'),JSON.stringify({results,errors,accountChangeBlocked:true},null,2));
 }catch(error){if(page){await fs.writeFile(path.join(folder,'error.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(folder,'error.png')});}throw error;}
 finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
})().catch(error=>{console.error(error);process.exitCode=1;});
