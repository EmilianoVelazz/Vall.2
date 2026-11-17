'use strict';
/* global document, innerWidth */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),express=require('express'),{chromium}=require('playwright');
process.env.NODE_ENV='test';process.env.JWT_SECRET='decision-ui-isolated-fixture-at-least-32-bytes';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const key of ['SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','SUPABASE_DATABASE_URL','GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS'])process.env[key]='';
const owner='decision-quality@example.invalid',auth=require.resolve('../backend/routes/auth');
require.cache[auth]={id:auth,filename:auth,loaded:true,exports:{verifyToken:(req,res,next)=>{req.user={email:owner};next();}}};
const router=require('../backend/routes/export');
async function main(){
 const root=path.resolve(__dirname,'..'),output=path.join(root,'tmp/pdfs/report-decision-quality/ui');await fs.mkdir(output,{recursive:true});
 const catalog={},selection={finance:['equities','fx'],markets:['proteins','market_news'],mexico:['mx_bolsa','mx_production']};
 for(const [collection,file]of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']])catalog[collection]=JSON.parse(await fs.readFile(path.join(root,'backend/cache/'+file+'.json'),'utf8')).reports.filter(report=>selection[collection].includes(report.key)).map(report=>({...report,collection}));
 const app=express();app.use('/api',router);app.use('/api',(req,res)=>{
  if(req.path==='/verify-token')return res.json({success:true,email:owner});
  if(req.path==='/profile')return res.json({success:true,profile:{email:owner,preferences:{}}});
  for(const [collection,endpoint]of [['finance','finance-executive-reports'],['markets','market-executive-reports'],['mexico','mexico-executive-reports']])if(req.path==='/'+endpoint)return res.json({success:true,data:catalog[collection]});
  return res.json({success:true,data:[],articles:[]});
 });app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
 let server,browser,page;const errors=[],results=[];
 try{
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
  page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/informes');
  for(const [collection,label]of [['finance','Finanzas'],['markets','Mercados'],['mexico','México']]){
   await page.getByRole('tab',{name:new RegExp('^'+label)}).click();
   for(const report of catalog[collection]){
    await page.locator('.erh-library-entry').filter({has:page.locator('strong',{hasText:report.title})}).first().click();
    await page.locator('.erh-pdf-viewer canvas').waitFor({state:'visible',timeout:120000});
    await page.getByRole('button',{name:'Lectura',exact:true}).click();const paper=page.locator('article.erh-document');await paper.waitFor();
    for(const heading of ['Qué cambió','Cuánto importa','Qué revisar primero'])await paper.getByRole('heading',{name:heading,exact:true}).first().waitFor();
    const text=await paper.innerText();assert(!text.includes('The science and practice'));
    if(report.key==='market_news'){
     assert(!text.includes('operador móvil'));
     const strike=paper.locator('.erh-news-story').filter({hasText:/huelga/}).first();assert((await strike.innerText()).includes('Logística:'));assert((await strike.locator('.erh-news-transmission').innerText()).includes('Costo entregado'));
     await paper.getByRole('combobox',{name:'Frente de mercado',exact:true}).selectOption('policy');assert((await paper.locator('.erh-news-group').innerText()).includes('IRPF'));await paper.getByRole('button',{name:'Limpiar filtros',exact:true}).click();
    }
    await paper.screenshot({path:path.join(output,collection+'-'+report.key+'-desktop.png')});
    await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await paper.screenshot({path:path.join(output,collection+'-'+report.key+'-mobile.png')});await page.setViewportSize({width:1440,height:1100});
    await page.getByRole('button',{name:'Ver PDF',exact:true}).click();await page.locator('.erh-pdf-viewer canvas').waitFor({state:'visible',timeout:120000});
    results.push({collection,key:report.key,desktop:true,mobile:true,pdf:true});console.log('PASS interfaz '+collection+'/'+report.key+' · lectura, PDF y móvil');
   }
  }
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'results.json'),JSON.stringify({results,errors},null,2));
 }catch(error){if(page){await fs.writeFile(path.join(output,'error.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(output,'error.png')});}throw error;}
 finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
