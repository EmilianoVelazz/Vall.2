'use strict';
/* global document, innerWidth */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),express=require('express'),{chromium}=require('playwright');
process.env.NODE_ENV='test';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const key of ['SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','SUPABASE_DATABASE_URL','DATABASE_URL','SUPABASE_PASSWORD','GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS'])process.env[key]='';
const owner='mexico-business@example.invalid',auth=require.resolve('../backend/routes/auth');require.cache[auth]={id:auth,filename:auth,loaded:true,exports:{verifyToken:(req,res,next)=>{req.user={email:owner,id:'fixture'};next();}}};
const router=require('../backend/routes/export');
(async()=>{
 const root=path.resolve(__dirname,'..'),folder=path.join(root,'output/mexico-business-20261105');await fs.mkdir(folder,{recursive:true});
 const snapshot=JSON.parse(await fs.readFile(path.join(root,'backend/cache/mexico-executive-reports.json'),'utf8')),app=express(),errors=[];let server,browser,page;
 app.use('/api',router);app.use(express.json());app.use('/api',(req,res)=>{
  if(req.path==='/verify-token')return res.json({success:true,email:owner});
  if(req.path==='/profile')return res.json({success:true,profile:{email:owner,preferences:{}}});
  if(req.path==='/mexico-executive-reports')return res.json({success:true,data:snapshot.reports});
  return res.json({success:true,data:[],articles:[]});
 });app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
 try{
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/informes');await page.getByRole('tab',{name:/^México/}).click();
  for(const report of snapshot.reports){
   await page.locator('.erh-library-entry').filter({has:page.locator('strong',{hasText:report.title})}).first().click();
   await page.getByRole('region',{name:'Vista previa PDF de '+report.title,exact:true}).locator('canvas').waitFor({state:'visible',timeout:120000});
   await page.getByRole('button',{name:'Lectura',exact:true}).click();const opening=page.locator('.erh-mexico-opening');await opening.waitFor();
   assert((await opening.innerText()).includes('CDMX'));assert((await opening.innerText()).includes('Impacto para la empresa'));assert((await opening.innerText()).includes('Qué verificar antes de decidir'));
   await opening.screenshot({path:path.join(folder,report.key+'.png')});
   if(report.key==='mx_proteins'){
    assert((await opening.innerText()).includes('rango descriptivo'));
    await page.getByLabel('Filtrar por estado',{exact:true}).selectOption('Querétaro');assert((await opening.locator('.erh-mexico-selection').innerText()).includes('Querétaro'));assert(!(await opening.locator('.erh-mexico-signals').innerText()).includes('rango de referencias'));
    await page.getByLabel('Filtrar producto o referencia',{exact:true}).fill('producto inexistente');await page.getByText('No hay datos publicados para esta selección.',{exact:true}).waitFor();assert.equal(await page.locator('.erh-mexico-signals').count(),0);
    await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await opening.screenshot({path:path.join(folder,'proteinas-mobile.png')});await page.setViewportSize({width:1440,height:1000});
   }
   if(report.key==='mx_production'){
    const state=page.getByLabel('Filtrar por estado',{exact:true});assert.equal(await state.inputValue(),'');await state.selectOption('Jalisco');
    const source=report.tables.find(table=>table.title.startsWith('Granos por entidad')),column=source.columns.findIndex(label=>label.startsWith('Maíz (')),value=row=>Number(String(row[column]).replace(/,/g,'')),total=source.rows.reduce((sum,row)=>sum+(Number.isFinite(value(row)) ? value(row) : 0),0),expected=(value(source.rows.find(row=>row[0]==='Jalisco'))/total*100).toLocaleString('es-MX',{maximumFractionDigits:2});
    const signal=opening.locator('.erh-mexico-signals section').filter({hasText:'Maíz'});assert((await signal.innerText()).includes('participación de Jalisco'));assert.equal((await signal.locator('strong').innerText()).trim(),expected);
    await opening.screenshot({path:path.join(folder,'jalisco-share.png')});
   }
  }
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(folder,'ui-validation.json'),JSON.stringify({reports:4,desktopWidth:1440,mobileWidth:390,filteredState:'Jalisco',nationalSharePreserved:true,emptySelectionHandled:true,errors},null,2));console.log('Mexico executive UI: four PDF previews and readings, state-specific signals, national denominator, clear filters, no empty panels and 390/1440px.');
 }catch(error){if(page){await fs.writeFile(path.join(folder,'error.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(folder,'error.png')});}throw error;}
 finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
})().catch(error=>{console.error(error);process.exitCode=1;});
