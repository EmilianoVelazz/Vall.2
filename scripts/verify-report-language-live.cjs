'use strict';
/* global document */
// Gemini real: contenido sintético o el corte público de Bolsa en caché.
// Cuenta aislada y SMTP simulado en ambos modos; nunca envía correos reales.
if(!process.argv.includes('--run')) {console.log('Uso: node scripts/verify-report-language-live.cjs --run [--google] [--cached-equities] [--language=en|fr|it|de|ja] [--diagnostics]');process.exit(2);}
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-live-language-check';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
require('dotenv').config({path:path.resolve('backend/.env'),quiet:true});
require('../backend/lib/tls-trust').configureSystemTrust();
process.env.GMAIL_USER='synthetic-sender@example.invalid';process.env.GMAIL_PASS='smtp-not-used';
const messages=[];
require('nodemailer').createTransport=()=>({sendMail:async message=>{assert.equal(message.to,'synthetic-recipient@example.invalid');messages.push(message);return {accepted:[message.to]};}});
if(process.argv.includes('--diagnostics')) {
 const {reportTranslator,createReportTranslator}=require('../backend/services/report-translation');
 reportTranslator.localize=createReportTranslator({onDiagnostic:metadata=>console.log('Translation diagnostics:',JSON.stringify(metadata))}).localize;
}
async function main() {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-live-language-'));process.env.VALL_REPORT_STORAGE_DIR=directory;
 const express=require('express'),jwt=require('jsonwebtoken'),{chromium}=require('playwright'),{getDocument}=await import('../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
 const report=process.argv.includes('--cached-equities') ? JSON.parse(await fs.readFile('backend/cache/finance_executive_reports.json')).reports.find(report=>report.key==='equities') : {key:'fx',collection:'finance',title:'Informe sintético de proteínas',generatedAt:'2026-10-14T14:00:00Z',summary:'Este informe de prueba usa datos sintéticos. El costo de referencia es 38.50 MXN/kg. Confirmar disponibilidad antes de comprar.',sections:[{heading:'Revisión de abastecimiento',text:'Comparar la misma presentación y periodo. Los datos de esta prueba no son cotizaciones comerciales.'}],metrics:[{label:'Precio sintético del pollo',value:'38.50 MXN/kg'}],tables:[{title:'Comparación sintética',columns:['Producto','Referencia'],rows:[['Pollo','38.50 MXN/kg']]}],visuals:[{type:'bar',title:'Gráfica de prueba',unit:'MXN/kg',bars:[{label:'Pollo',value:38.5}]}],sources:[],sourceLinks:[]};
 const app=express();app.use(require('cookie-parser')());
 app.get('/api/verify-token',(req,res)=>res.json({success:true,email:'synthetic-recipient@example.invalid'}));
 app.all('/api/profile',express.json(),(req,res)=>res.json({success:true,profile:{email:'synthetic-recipient@example.invalid',preferences:{}}}));
 app.get('/api/finance-executive-reports',(req,res)=>res.json({success:true,data:[report]}));
 app.get('/api/report-email-schedules',(req,res)=>res.json({success:true,data:[]}));
 app.use('/api',require('../backend/routes/export'));
 app.use('/assets',express.static(path.resolve('assets')));app.use(express.static(path.resolve('dist')));app.use((req,res)=>res.sendFile(path.resolve('dist/index.html')));
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});let browser;
 const output=path.resolve('output/reportes-idiomas');
 async function pdfText(bytes) {const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true}),pdf=await task.promise;let text='';try {for(let n=1;n<=pdf.numPages;n++) text+=(await (await pdf.getPage(n)).getTextContent()).items.map(item=>item.str).join(' ');return text;}finally {await task.destroy();}}
 const compact=text=>text.replace(/\s/g,'');
 try {
  const origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true});
  const context=await browser.newContext({acceptDownloads:true,ignoreHTTPSErrors:process.argv.includes('--google'),viewport:{width:1440,height:1000}});
  await context.addCookies([{name:'vn_token',value:jwt.sign({sub:'synthetic',email:'synthetic-recipient@example.invalid'},process.env.JWT_SECRET),url:origin}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  if(!process.argv.includes('--google')) await page.route('https://**/*',route=>route.abort());
  await page.goto(origin+'/informes');await page.locator('.erh-document').waitFor();await fs.mkdir(output,{recursive:true});
  const selectedLanguage=process.argv.find(value=>value.startsWith('--language='))?.slice(11);
  const languageNames={en:'English',fr:'Français',it:'Italiano',de:'Deutsch',ja:'日本語'};
  if(selectedLanguage && !languageNames[selectedLanguage]) throw Error('Unsupported live-check language');
  for(const [language,name] of (selectedLanguage ? [[selectedLanguage,languageNames[selectedLanguage]]] : process.argv.includes('--cached-equities') ? [['en','English']] : [['en','English'],['fr','Français']])) {
   const localization=page.waitForResponse(response=>response.url().endsWith('/api/report-localize') && response.request().postDataJSON()?.language===language,{timeout:120000});
   await page.getByTitle(/^Idioma:/).click();await page.getByRole('option',{name:new RegExp(name)}).click();
   const response=await localization;assert.equal(response.status(),200);const translated=await response.json();
   await page.locator('.erh-document h2').filter({hasText:translated.report.title}).waitFor();
   assert.notEqual(translated.report.title,report.title);assert.equal(await page.locator('.erh-document-summary').first().innerText(),translated.report.summary);assert.equal(await page.locator('.erh-document').getAttribute('lang'),language);
   await page.evaluate(()=>{document.documentElement.lang='es';});await page.waitForFunction(language=>document.documentElement.lang===language,language);
   if(process.argv.includes('--google')) await page.locator('select.goog-te-combo').waitFor({state:'attached',timeout:20000});
   await page.locator('.erh-document-column').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`flujo-real-${language}.png`),fullPage:false});
   await page.locator('.erh-view-tools button').nth(1).click();await page.locator('.erh-pdf-page-text').filter({hasText:translated.report.title}).waitFor({timeout:120000});
   const previewReady=page.waitForEvent('download');await page.locator('.erh-pdf-actions a[download]').click();const preview=await fs.readFile(await (await previewReady).path());
   const downloadReady=page.waitForEvent('download');await page.locator('.erh-workbar-actions .erh-download').click();const downloaded=await fs.readFile(await (await downloadReady).path());assert.deepEqual(downloaded,preview);
   const extracted=await pdfText(downloaded);assert(compact(extracted).includes(compact(translated.report.summary)));
   const numbers=value=>String(value).match(/[-+]?\d[\d,.]*/g) || [];
   assert.deepEqual(numbers(translated.report.metrics[0].value),numbers(report.metrics[0].value),'La traducción preserva las cifras originales');
   const numericText=value=>String(value).replace(/[\s,]/g,'');
   for(const number of numbers(report.metrics[0].value)) assert(numericText(extracted).includes(numericText(number)),'La cifra se conserva aunque el PDF agrupe los millares');
   await page.locator('.erh-program-button').click();const emailDone=page.waitForResponse(response=>response.url().endsWith('/api/report-email') && response.request().method()==='POST');
   await page.locator('.erh-send-immediate button').click();const sentResponse=await emailDone;assert.equal(sentResponse.status(),200);assert.equal((await sentResponse.json()).language,language);const message=messages.at(-1);
   assert.equal(message.headers['Content-Language'],language);assert(message.html.includes(`lang="${language}"`));assert(message.subject.includes(translated.report.title));assert(compact(message.text).includes(compact(translated.report.summary)));assert.equal(await pdfText(message.attachments[0].content),extracted);
   await page.locator('.erh-send-dialog header button').click();await fs.writeFile(path.join(output,`flujo-real-${language}.pdf`),downloaded);
   console.log(JSON.stringify({language,title:translated.report.title,cachedEquities:process.argv.includes('--cached-equities'),nativeReading:true,previewMatchesDownload:true,emailMatchesPreview:true,googleEnabled:process.argv.includes('--google'),realEmailsSent:0}));
  }
  assert.deepEqual(errors,[]);
 } finally {if(browser) await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));assert.equal(path.dirname(directory),os.tmpdir());await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
