'use strict';
/* global document, innerWidth */
// Real browser + real PDF exports. Account and source changes are local fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto'),express=require('express');
const {chromium}=require('playwright');
process.env.NODE_ENV='test';process.env.JWT_SECRET='report-refresh-user-fixture-fixture-only-testing-32bytes';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const key of ['SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','SUPABASE_DATABASE_URL','DATABASE_URL','SUPABASE_PASSWORD','GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS'])process.env[key]='';
const owner='refresh-user@example.invalid',auth=require.resolve('../backend/routes/auth');
require.cache[auth]={id:auth,filename:auth,loaded:true,exports:{verifyToken:(req,res,next)=>{req.user={email:owner,id:'refresh-user',role:'user'};next();}}};
const router=require('../backend/routes/export'),digest=bytes=>createHash('sha256').update(bytes).digest('hex');
(async()=>{
 const root=path.resolve(__dirname,'..'),output=path.resolve(root,process.env.REPORT_REFRESH_OUTPUT || 'output/pruebas-informes-20261110/usuario');await fs.mkdir(output,{recursive:true});
 const original=JSON.parse(await fs.readFile(path.join(root,'backend/cache/finance_executive_reports.json'),'utf8')).reports.find(report=>report.key==='fx');
 const make=(value,generatedAt)=>{const report=structuredClone({...original,collection:'finance',generatedAt}),references=report.sourceSnapshot?.fxHistories || report.marketHistory,mxn=references.find(item=>item.quoteCurrency==='MXN'),points=mxn.series || mxn.points,last=points.findLast(point=>point.date.slice(0,10)<=generatedAt.slice(0,10));assert(last);last.value=value;return report;};
 let latest=make(18.1111,'2026-11-09T20:00:00Z'),mode='normal',denyExport=false,failExport=false,libraryCalls=0;const exports=[],checks=[],errors=[];
 const app=express();let server,browser,page;
 app.use('/api',(req,res,next)=>{
  if(req.path==='/report-export'){
   if(denyExport)return res.status(409).json({success:false,code:'REPORT_ACCOUNT_CHANGED',error:'La sesión cambió de cuenta. Recarga la cuenta para continuar.'});
   if(failExport){failExport=false;return res.status(503).json({success:false,error:'Generación temporalmente no disponible. Reintenta el PDF.'});}
   const send=res.send.bind(res);res.send=body=>{if(Buffer.isBuffer(body)&&res.statusCode===200)exports.push({bytes:body,hash:digest(body),cut:req.body.executiveReport.generatedAt});return send(body);};
  }
  next();
 });
 app.use('/api',router);app.use(express.json());app.use('/api',(req,res)=>{
  if(req.path==='/verify-token')return res.json({success:true,email:owner});
  if(req.path==='/profile')return res.json({success:true,profile:{email:owner,preferences:{}}});
  if(req.path==='/finance-executive-reports'){libraryCalls++;if(mode==='fail')return res.status(503).json({success:false,error:'No se pudo actualizar la biblioteca de prueba.'});return res.json({success:true,data:[latest],generatedAt:latest.generatedAt,nextRefreshAt:'2026-11-10T20:00:00Z'});}
  if(req.path==='/morning-brief')return res.json({success:false,error:'Brief fuera del alcance de esta simulación.'});
  return res.json({success:true,data:[],articles:[]});
 });
 app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
 const record=name=>{checks.push(name);console.log('PASS '+name);};
 try{
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://**/*',route=>route.abort());await page.clock.install({time:new Date('2026-11-10T12:15:00Z')});
  await page.goto('http://127.0.0.1:'+server.address().port+'/informes');
  const pdfText=async(value,timeout=30000)=>page.waitForFunction(text=>document.querySelector('.erh-pdf-page-text')?.textContent.includes(text),value,{timeout});
  const download=async()=>{const count=exports.length,[file]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Descargar PDF',exact:true}).click()]),bytes=await fs.readFile(await file.path());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.equal(await file.failure(),null);assert.equal(exports.length,count,'Saving reuses the exact displayed PDF');assert.equal(digest(bytes),exports.at(-1).hash);return bytes;};
  await pdfText('18.1111');await download();record('PDF inicial y descarga idénticos');
  latest=make(19.2222,'2026-11-10T12:00:00Z');const refresh=page.waitForResponse(response=>response.url().endsWith('/api/finance-executive-reports'));await page.clock.fastForward(61000);await refresh;
  await page.getByRole('button',{name:'Abrir nuevo corte',exact:true}).waitFor();await pdfText('18.1111');await download();record('Nuevo corte avisa sin sustituir la lectura abierta');
  const updates=page.locator('.erh-report-updates');await updates.getByText('Novedades del próximo corte').waitFor();assert((await updates.innerText()).includes('19.2222'));await updates.screenshot({path:path.join(output,'novedades-proximo-corte.png')});record('Novedades anticipan el corte sin sustituir el PDF abierto');
  await page.getByRole('button',{name:'Abrir nuevo corte',exact:true}).click();await pdfText('19.2222');await download();record('Aceptar corte actualiza vista previa y archivo');
  latest=make(20.3333,'2026-11-10T12:00:00Z');const corrected=page.waitForResponse(response=>response.url().endsWith('/api/finance-executive-reports'));await page.getByRole('button',{name:'Actualizar datos',exact:true}).click();await corrected;
  await page.getByRole('button',{name:'Lectura',exact:true}).click();await page.locator('.erh-document').getByText('20.3333',{exact:true}).first().waitFor();await page.getByRole('button',{name:'Ver PDF',exact:true}).click();await pdfText('20.3333',7000);await download();await updates.getByText('Dato revisado',{exact:true}).first().waitFor();assert((await updates.innerText()).includes('20.3333'));await updates.screenshot({path:path.join(output,'novedades-revision.png')});record('Corrección con el mismo corte invalida el PDF anterior y aparece como dato revisado');
  mode='fail';await page.getByRole('button',{name:'Actualizar datos',exact:true}).click();await page.getByRole('alert').filter({hasText:'No se pudo actualizar la biblioteca de prueba.'}).waitFor();await pdfText('20.3333');await download();record('Fallo de actualización conserva informe y descarga');
  mode='normal';latest=make(21.4444,'2026-11-10T14:00:00Z');failExport=true;await page.getByRole('button',{name:'Actualizar datos',exact:true}).click();await page.getByRole('alert').filter({hasText:'Generación temporalmente no disponible.'}).waitFor();await page.getByRole('button',{name:'Reintentar',exact:true}).click();await pdfText('21.4444');await download();record('PDF fallido permite reintentar sin perder el informe');
  await page.getByRole('button',{name:'Lectura',exact:true}).click();const paper=page.locator('.erh-document');assert(await paper.locator('table').count()>0);await paper.locator('table').first().scrollIntoViewIfNeeded();await page.clock.runFor(400);await page.locator('.erh-document-column').screenshot({path:path.join(output,'tablas-actualizadas.png')});
  await page.setViewportSize({width:390,height:844});await paper.locator('table').first().scrollIntoViewIfNeeded();await page.clock.runFor(400);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,'tablas-movil.png')});record('Tablas visibles y página móvil sin desbordamiento');
  await page.getByRole('button',{name:'Ver PDF',exact:true}).click();await pdfText('21.4444');const viewport=page.getByRole('region',{name:'Vista previa PDF de '+original.title,exact:true});await viewport.screenshot({path:path.join(output,'pdf-actualizado.png')});
  denyExport=true;latest=make(22.5555,'2026-11-10T15:00:00Z');await page.getByRole('button',{name:'Actualizar datos',exact:true}).click();await page.getByRole('button',{name:'Recargar cuenta',exact:true}).waitFor();assert.equal(await page.locator('.erh-document').count(),0);assert.equal(await updates.count(),0);record('Cambio de cuenta bloquea entrega de datos anteriores y novedades');  
  assert.deepEqual(errors,[]);for(const [index,item]of exports.entries())await fs.writeFile(path.join(output,'version-'+(index+1)+'.pdf'),item.bytes);
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,libraryCalls,exports:exports.map(({hash,cut,bytes})=>({hash,cut,bytes:bytes.length})),errors,syntheticPrices:true},null,2));
 }catch(error){if(page){await fs.writeFile(path.join(output,'error.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(output,'error.png'),fullPage:true});}await fs.writeFile(path.join(output,'failed.json'),JSON.stringify({checks,exports:exports.length,libraryCalls,error:error.message,errors},null,2));throw error;}
 finally{if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
})().catch(error=>{console.error(error);process.exitCode=1;});
