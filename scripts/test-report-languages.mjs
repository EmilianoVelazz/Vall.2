import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {getDocument} from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {requestReportPdf,requestReportFile} from '../frontend/src/lib/reportPdf.js';
import {leerIdioma,IDIOMAS} from '../frontend/src/lib/idioma.js';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {reportDocumentTitle} from '../shared/report-download-name.mjs';
const require=createRequire(import.meta.url),express=require('express'),jwt=require('jsonwebtoken'),JSZip=require('jszip');
process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-report-language-secret';delete process.env.USER_PASSWORD;
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','SUPABASE_DATABASE_URL','DATABASE_URL','SUPABASE_PASSWORD','GEMINI_API_KEY'])process.env[key]='';
require('../backend/services/user-profile-store').findById=async id=>({id,email:id==='fixture' ? 'ana@example.invalid' : id+'@example.invalid',active:true,credentialVersion:0});
const storage=await fs.mkdtemp(path.join(os.tmpdir(),'vall-report-languages-'));process.env.VALL_REPORT_STORAGE_DIR=storage;
assert.equal(path.dirname(path.resolve(storage)),path.resolve(os.tmpdir()));assert(path.basename(storage).startsWith('vall-report-languages-'));
const {createReportTranslator,reportTranslator}=require('../backend/services/report-translation');
const {reportLabels,reportLanguage,requestReportLanguage}=require('../backend/lib/report-language');
const interfaceCatalog=require('../shared/report-languages.json');
const collections=require('../shared/report-collections.json');
const languages=['es','en','fr','it','de','ja'];
assert.deepEqual(IDIOMAS.map(item=>item.lang),languages);
for(const invalid of ['pt','EN','en-US','../en',null,{},[],4]) assert.throws(()=>reportLanguage(invalid),error=>error.status===400);
assert.equal(requestReportLanguage({body:{},cookies:{googtrans:'/es/fr'}}),'fr');
assert.equal(requestReportLanguage({body:{language:'es'},cookies:{googtrans:'/es/fr'}}),'es','La elección explícita prevalece sobre la cookie');
assert.equal(requestReportLanguage({body:{},cookies:{googtrans:'/es/pt'}}),'es');
assert.throws(()=>requestReportLanguage({body:{language:null},cookies:{googtrans:'/es/en'}}),error=>error.status===400);
assert.throws(()=>requestReportLanguage({body:{language:'es'},headers:{'x-vall-report-language':'en'}}),error=>error.code==='REPORT_LANGUAGE_MISMATCH');
async function pdfText(bytes) {
 const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true}),pdf=await task.promise;let text='';
 try {for(let i=1;i<=pdf.numPages;i++) text+=(await (await pdf.getPage(i)).getTextContent()).items.map(item=>item.str).join(' ')+'\n';return text;}
 finally {await task.destroy();}
}
async function assertPdfLanguage(bytes,language) {
 const text=(await pdfText(bytes)).replace(/\s/g,''),heading=reportLabels(language).t('Tablero ejecutivo de divisas y coberturas');
 assert(text.toLocaleUpperCase().includes(heading.toLocaleUpperCase().replace(/\s/g,'')),'Los rótulos del PDF usan '+language);
 assert(text.includes('38.5') && text.includes('USD/MXN'),'No modifica la cotización ni el par');
 if(language!=='es') assert(!text.includes('Elprecioes'),'No conserva el resumen español');
}
const vocabulary={
 'Informe de prueba':['Test report','Rapport de test','Rapporto di prova','Testbericht','テストレポート'],
 'El precio es':['The price is','Le prix est','Il prezzo è','Der Preis beträgt','価格は'],
 'Validar disponibilidad.':['Check availability.','Vérifier la disponibilité.','Verificare la disponibilità.','Verfügbarkeit prüfen.','在庫状況を確認してください。'],
 'Pollo':['Chicken','Poulet','Pollo','Hähnchen','鶏肉'],
 'Precio de prueba':['Test price','Prix de test','Prezzo di prova','Testpreis','テスト価格'],
 'Serie de prueba':['Test series','Série de test','Serie di prova','Testreihe','テスト系列'],
 'Observaciones sintéticas.':['Synthetic observations.','Observations synthétiques.','Osservazioni sintetiche.','Synthetische Beobachtungen.','シミュレーションの観測値です。'],
 'Comparación de prueba':['Test comparison','Comparaison de test','Confronto di prova','Testvergleich','テスト比較'],
 'Producto':['Product','Produit','Prodotto','Produkt','製品'],
 'Detalle de prueba':['Test details','Détail du test','Dettagli di prova','Testdetails','テストの詳細']
};
let calls=0,mode='normal';
const provider={isConfigured:()=>true,generate:async request=>{
 calls++;assert.equal(request.tools,undefined,'Sin investigación web');assert.match(request.systemInstruction,/untrusted document content/);
 const payload=JSON.parse(request.prompt),index=languages.indexOf(payload.language)-1;
 const translations=payload.translations.map(item=>{
  let text=Object.entries(vocabulary).reduce((text,[source,targets])=>text.replaceAll(source,targets[index]),item.text);
  if(text===item.text && text.length>=50 && (text.match(/\b(?:el|los|las|del|con|sin|para|por|una|que|cada|entre|y)\b/gi)||[]).length>=4)text=['Translated passage','Texte traduit','Testo tradotto','Übersetzter Text','翻訳文'][index]+' '+String.fromCharCode(97+item.id%26).repeat(Math.floor(item.id/26)+1)+' '+(item.text.match(/__VNT_\w+_\d+_\d+__/g)||[]).join(' ');
  return {id:item.id,text};
 });
 if(mode==='number') translations[0].text+=' 999999';
 if(mode==='token') translations.find(item=>/__VNT_/.test(item.text)).text=translations.find(item=>/__VNT_/.test(item.text)).text.replace(/__VNT_\w+_\d+_\d+__/,'');
 if(mode==='missing') translations.pop();
 return {text:JSON.stringify({language:mode==='wrong' ? 'es' : payload.language,translations})};
}};
const translator=createReportTranslator({provider});reportTranslator.localize=translator.localize;
process.env.GMAIL_USER='sender@example.invalid';process.env.GMAIL_PASS='fixture-only';
const messages=[];require('nodemailer').createTransport=()=>({sendMail:async message=>{messages.push(message);return {accepted:[message.to]};}});
// El permiso del programador sólo se simula en este proceso; el transporte y
// el almacén se sustituyen por memoria y los envíos reales siguen apagados.
require('../backend/services/report-mailer').mailAutomationEnabled=()=>true;
const schedules=require('../backend/services/report-email-schedule-store');let due=[],lastSchedule;
schedules.list=async()=>[];schedules.due=async()=>due;schedules.record=async()=>{};schedules.upsert=async input=>{lastSchedule=input;return {...input,id:'language-fixture',nextRunAt:'2026-10-15T14:00:00Z'};};
schedules.claim=async()=>true;schedules.isCurrent=async()=>true;
const router=require('../backend/routes/export'),{_test}=router;
const report={collection:'finance',key:'fx',title:'Informe de prueba',generatedAt:'2026-10-14T14:00:00Z',summary:'El precio es 38.50 MXN por 1 USD.',objective:'Validar disponibilidad.',sections:[{heading:'Análisis',text:'Validar disponibilidad.'}],closing:'Validar disponibilidad.',metrics:[{label:'Precio de prueba',value:'38.50 MXN por 1 USD',change:'0%'}],tables:[{title:'Detalle de prueba',columns:['Producto','Precio de prueba'],rows:[['USD/MXN','38.50 MXN por 1 USD'],['USD/MXN',0]]}],visuals:[{type:'line',title:'Serie de prueba',unit:'MXN por 1 USD',note:'Observaciones sintéticas.',series:[{label:'USD/MXN',points:[{date:'2026-10-13',value:37.25},{date:'2026-10-14',value:38.5}]}]},{type:'bar',title:'Comparación de prueba',unit:'MXN por 1 USD',bars:[{label:'USD/MXN',value:38.5}]}],takeaways:['Validar disponibilidad.'],watchlist:['Validar disponibilidad.'],sources:['SNIIM'],sourceLinks:[{label:'SNIIM',url:'https://example.invalid/precios?producto=pollo&fecha=2026-10-14'},{label:'SNIIM',url:'https://example.invalid/precios/res'}],personalization:{confidentiality:'confidential',organization:'Empresa de prueba',recipientName:'Ana',audience:'purchasing'}};
// Divisas necesita una serie de divisas válida; el reporte especializado no
// debe tratar precios físicos de pollo como cotizaciones cambiarias.
report.sourceSnapshot={fxHistories:[{label:'USD/MXN',baseCurrency:'USD',quoteCurrency:'MXN',market:'México',unit:'MXN por 1 USD',source:'Fuente sintética',series:[{date:'2026-10-13',value:37.25},{date:'2026-10-14',value:38.5}]}]};
const original=JSON.stringify(report),payload=_test.executivePayload(report),output=path.resolve('output/reportes-idiomas');
const buffers=new Map(),localizedByLanguage=new Map();
for(const language of languages) {
 const localized=await translator.localize({report:payload,title:report.title,language},{owner:'ana@example.invalid'});localizedByLanguage.set(language,localized);
 const expected=language==='es' ? report.title : vocabulary[report.title][languages.indexOf(language)-1];
 assert.equal(localized.report.title,expected);assert.equal(localized.report.metrics[0].value,'38.50 MXN por 1 USD');assert.equal(localized.report.metrics[0].change,'0%');assert.equal(localized.report.tables[0].rows[1][1],'0');
 const derived=await translator.localize({report:{...payload,baseReport:{title:report.title}},language},{owner:'ana@example.invalid'});assert.equal(derived.report.baseReport.title,expected);
 assert.deepEqual(localized.report.visuals[0].series[0].points,payload.visuals[0].series[0].points);assert.deepEqual(localized.report.sourceLinks,payload.sourceLinks);assert.equal(localized.report.personalization.organization,'Empresa de prueba');
 for(const [collection,definition] of Object.entries(collections)) for(const key of definition.reportKeys) {const variant=await translator.localize({report:{...payload,collection,key},title:report.title,language},{owner:'ana@example.invalid'});assert.equal(variant.report.collection,collection);assert.equal(variant.report.key,key);assert.equal(variant.report.title,expected);}
 const bytes=await _test.makeExecutivePdf(localized.title,localized.report,localized);buffers.set(language,bytes);
 const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true}),pdf=await task.promise;let text='';const links=[];
 for(let i=1;i<=pdf.numPages;i++) {
  const page=await pdf.getPage(i),items=(await page.getTextContent()).items,ops=await page.getOperatorList();assert(ops.fnArray.length>0,'El PDF contiene elementos dibujados');
  for(const item of items.filter(item=>item.str.trim())) assert(item.transform[4]>=30 && item.transform[4]+item.width<=584,'Sin texto fuera del ancho: '+language+' '+item.str);
  text+=items.map(item=>item.str).join(' ')+'\n';links.push(...await page.getAnnotations());
 }
 const metadata=await pdf.getMetadata();assert.equal(metadata.info.Title,reportDocumentTitle(localized.report,{language,title:localized.report.title}),'Título del documento en '+language);
 const heading=weeklyReport(localized.report,{t:reportLabels(language).t}).blocks.find(block=>block.key==='fxTreasury')?.label;
 assert(heading && text.replace(/\s/g,'').toLocaleUpperCase().includes(heading.toLocaleUpperCase().replace(/\s/g,'')),'Encabezado en '+language);
 assert(!text.includes(reportLabels(language).t('Fuentes y trazabilidad').toUpperCase()),'Sin apartado de fuentes en '+language);
 for(const url of report.sourceLinks.map(item=>item.url)) assert(!links.some(item=>item.url===url),'Sin lista de fuentes en '+language);
 assert(text.includes('38.5') && text.includes('USD/MXN'));if(language!=='es') {assert(!text.includes('RESUMEN EJECUTIVO'));assert.equal(metadata.info.Language,reportLabels(language).locale,'Idioma del PDF');}
 await task.destroy();
 if(process.argv.includes('--preview')) {await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,`informe-${language}.pdf`),bytes);}
}
assert.equal(JSON.stringify(report),original);
// Different market annexes can evict an older entry from the bounded cache.
await translator.localize({report:payload,title:report.title,language:'en'},{owner:'ana@example.invalid'});
const beforeCache=calls;await translator.localize({report:payload,title:report.title,language:'en'},{owner:'ana@example.invalid'});assert.equal(calls,beforeCache);
await translator.localize({report:payload,title:report.title,language:'en'},{owner:'luis@example.invalid'});assert(calls>beforeCache,'No compartir la traducción privada entre cuentas');
for(const failureMode of ['number','token','missing','wrong']) {mode=failureMode;await assert.rejects(createReportTranslator({provider}).localize({report:payload,title:report.title,language:'en'},{owner:failureMode}),error=>error.code==='REPORT_TRANSLATION_INVALID');}mode='normal';
const unavailable=createReportTranslator({provider:{isConfigured:()=>false}});assert.equal((await unavailable.localize({report:payload,language:'es'})).language,'es');await assert.rejects(unavailable.localize({report:payload,language:'ja'}),error=>error.code==='REPORT_TRANSLATION_UNAVAILABLE');
const hanging=createReportTranslator({provider:{isConfigured:()=>true,generate:()=>new Promise(()=>{})},timeoutMs:30});await assert.rejects(hanging.localize({report:payload,language:'en'}),error=>error.code==='REPORT_TRANSLATION_TIMEOUT');

let server;
try {
 const app=express();app.use(require('cookie-parser')());
 const sessionEmail=req=>jwt.verify(req.cookies.vn_token || token,process.env.JWT_SECRET).email;
 app.get('/api/verify-token',(req,res)=>res.json({success:true,email:sessionEmail(req)}));
 app.use('/api/profile',express.json(),(req,res)=>res.json({success:true,profile:{email:sessionEmail(req),preferences:{}}}));
 for(const [area,definition] of Object.entries(collections)) if(area!=='mine') app.get(definition.endpoint,(req,res)=>res.json({success:true,data:[{...report,collection:area,key:definition.reportKeys[0]}]}));
 app.use('/api',router);app.use(express.static(path.resolve('dist')));app.use((req,res)=>res.sendFile(path.resolve('dist/index.html')));
 server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 const origin='http://127.0.0.1:'+server.address().port,token=jwt.sign({sub:'fixture',email:'ana@example.invalid'},process.env.JWT_SECRET),headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
 const post=(endpoint,body,customHeaders=headers)=>fetch(origin+endpoint,{method:'POST',headers:customHeaders,body:JSON.stringify(body)}),body={title:report.title,content:report.summary,executiveReport:report,response:'file'};
 assert.equal((await post('/api/report-export',{...body,format:'pdf',language:'en'},{'Content-Type':'application/json'})).status,401);
 assert.equal((await post('/api/report-export',{...body,format:'pdf',language:'en',expectedOwner:'other@example.invalid'})).status,409);
 assert.equal((await post('/api/report-export',{...body,format:'pdf',language:'pt'})).status,400);
 assert.equal((await post('/api/report-localize',{...body,language:'en'},{'Content-Type':'application/json'})).status,401);
 assert.equal((await post('/api/report-localize',{...body,language:'en',expectedOwner:'other@example.invalid'})).status,409);
 for(const language of languages) {
  const response=await post('/api/report-localize',{...body,language});assert.equal(response.status,200);const localized=await response.json();assert.equal(localized.language,language);assert.equal(localized.report.title,language==='es' ? report.title : vocabulary[report.title][languages.indexOf(language)-1]);assert.equal(localized.report.metrics[0].value,'38.50 MXN por 1 USD');
 }
 for(const language of languages) for(const format of ['pdf','csv']) {
  const response=await post('/api/report-export',{...body,format,language});assert.equal(response.status,200,await response.clone().text().then(text=>text.slice(0,200)));assert.equal(response.headers.get('content-language'),language);
  if(format==='csv') {const csv=await response.text();assert(csv.includes(reportLabels(language).t('Datos del informe ejecutivo')));assert(csv.includes('38.5') && csv.includes('MXN por 1 USD'));assert(csv.includes('https://example.invalid/precios/res'),'El CSV de divisas conserva sus enlaces de respaldo');assert(!csv.includes('2026-10-12'));if(language!=='es') assert(!csv.includes('El precio es'));}
  else assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
 }
 for(const format of ['docx','html','txt','markdown','json']) {
  const response=await post('/api/report-export',{...body,format,language:'en'});assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.language,'en');
  const file=await fetch(origin+saved.downloadUrl,{headers});assert.equal(file.status,200);const bytes=Buffer.from(await file.arrayBuffer());
  if(format==='docx') {const zip=await JSZip.loadAsync(bytes),xml=await zip.file('word/document.xml').async('string');assert(xml.includes('Test report'));assert(!xml.includes('Generado por ORION'));}
  else {const text=bytes.toString('utf8');assert(text.includes('Test report'));assert(!text.includes('El precio es'));if(format==='html') assert(text.includes('lang="en"'));}
 }
 const translateBeforeEmail=reportTranslator.localize,beforeRejectedEmail=messages.length;
 try {
  reportTranslator.localize=async()=>{throw Object.assign(Error('No se pudo completar la traducción del informe. Conservamos el original; vuelve a intentarlo.'),{status:502,code:'REPORT_TRANSLATION_INVALID'});};
  const failedEmail=await post('/api/report-email',{...body,language:'it'});
  assert.equal(failedEmail.status,502);assert.equal((await failedEmail.json()).code,'REPORT_TRANSLATION_INVALID');assert.equal(messages.length,beforeRejectedEmail,'Nunca se envía un PDF de otro idioma cuando falla la traducción del envío');
 } finally {reportTranslator.localize=translateBeforeEmail;}
 for(const language of languages) {
  const languageHeaders={...headers,Authorization:'Bearer '+jwt.sign({sub:'mail-'+language,email:`mail-${language}@example.invalid`},process.env.JWT_SECRET)};
  const response=await post('/api/report-email',{...body,language},languageHeaders);assert.equal(response.status,200);assert.equal((await response.json()).language,language);
  const message=messages.at(-1);assert(message.html.includes(`lang="${language}"`));assert(message.text.includes(reportLabels(language).t('Atentamente,')));
  await assertPdfLanguage(message.attachments[0].content,language);
 }
 const cookieHeaders={...headers,Cookie:'googtrans=%2Fes%2Ffr'};
 const legacyDownload=await post('/api/report-export',{...body,format:'pdf'},cookieHeaders);assert.equal(legacyDownload.headers.get('content-language'),'fr');await assertPdfLanguage(Buffer.from(await legacyDownload.arrayBuffer()),'fr');
 const legacyEmail=await post('/api/report-email',body,cookieHeaders);assert.equal((await legacyEmail.json()).language,'fr');await assertPdfLanguage(messages.at(-1).attachments[0].content,'fr');
 await post('/api/report-email-schedules',{area:'finance',reportKey:'fx',language:'de',preferences:{},delivery:{frequency:'daily'}});assert.equal(lastSchedule.preferences.language,'de');
 require('../backend/services/finance-report-store').load=async()=>({reports:[report]});due=[{id:'fixture',area:'finance',reportKey:'fx',ownerEmail:'ana@example.invalid',preferences:{language:'de'},delivery:{frequency:'daily'}}];
 const beforeDelivery=messages.length,delivery=await router.runScheduledReportEmails();assert.equal(delivery.sent,1);assert.equal(messages.length,beforeDelivery+1);assert(messages.at(-1).html.includes('lang="de"'));assert(messages.at(-1).text.includes(reportLabels('de').t('Atentamente,')));await assertPdfLanguage(messages.at(-1).attachments[0].content,'de');due=[];

 globalThis.localStorage={getItem:()=>JSON.stringify({lang:'ja'})};assert.equal(leerIdioma(),'ja');let sentRequest;
 const fake=async(url,options)=>{sentRequest=JSON.parse(options.body);return new Response(buffers.get('ja'),{status:200,headers:{'Content-Type':'application/pdf','Content-Language':'ja'}});};
 await requestReportPdf(report,report.title,report.summary,fake);assert.equal(sentRequest.language,'ja');
 await assert.rejects(requestReportPdf(report,report.title,report.summary,async()=>new Response(buffers.get('es'),{headers:{'Content-Type':'application/pdf','Content-Language':'es'}})),error=>error.code==='REPORT_LANGUAGE_MISMATCH');
 await requestReportFile(report,report.title,report.summary,'csv',async(url,options)=>{assert.equal(JSON.parse(options.body).language,'ja');return new Response('CSV',{headers:{'Content-Type':'text/csv','Content-Language':'ja'}});});delete globalThis.localStorage;
 const artifacts=require('../assets/js/report-artifacts');let rebuilt=0,head=0;
 globalThis.document={documentElement:{lang:'fr'}};globalThis.localStorage={getItem:()=>JSON.stringify({lang:'es'})};assert.equal(artifacts.selectedLanguage(),'fr');assert.equal(leerIdioma(),'es','La elección explícita no cambia por una modificación visual del traductor');delete globalThis.document;delete globalThis.localStorage;
 await artifacts.ensure({artifact:{downloadUrl:'/api/report-download/'+'a'.repeat(48),language:'es'},language:'en',fetchFile:async()=>{head++;},rebuild:async()=>{rebuilt++;return {downloadUrl:'/api/report-download/'+'b'.repeat(48),language:'en'};}});assert.equal(rebuilt,1);assert.equal(head,0);

 if(process.argv.includes('--ui')) {
  const {chromium}=require('playwright'),browser=await chromium.launch({headless:true});
  try {
   const context=await browser.newContext({acceptDownloads:true});await context.addCookies([{name:'vn_token',value:jwt.sign({sub:'browser',email:'browser@example.invalid'},process.env.JWT_SECRET),url:origin}]);const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.route('https://**/*',route=>route.abort());await page.goto(origin+'/informes');
   await page.getByTitle(/^Idioma:/).click();await page.getByRole('option',{name:/English/}).click();await page.waitForFunction(()=>document.documentElement.lang==='en');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('vn_lang')).lang),'en');
   for(const language of ['en','fr','it','de','ja','es']) {
    await page.evaluate(language=>localStorage.setItem('vn_lang',JSON.stringify({lang:language})),language);await page.reload();await page.locator('.erh-book').first().click();
    await page.locator('.erh-document').waitFor();const expectedTitle=language==='es' ? report.title : vocabulary[report.title][languages.indexOf(language)-1];assert.equal(await page.locator('.erh-document h2').innerText(),expectedTitle,'La lectura está traducida sin Google Translate');
    assert.equal(await page.locator('.erh-document').getAttribute('lang'),language);
    const ui=text=>language==='es' ? text : interfaceCatalog.labels[text]?.[languages.indexOf(language)-1] || text;
    assert.equal(await page.locator('.erh-workbar-actions .erh-download').innerText(),ui('Descargar PDF'),'El botón usa el idioma nativo sin Google');
    assert.equal(await page.locator('.erh-preview-heading > span').innerText(),ui('Vista previa'));
    assert.equal(await page.locator('.erh-book.is-active strong').innerText(),expectedTitle,'La tarjeta coincide con la lectura');
    assert.equal(await page.locator('.erh-studio').getAttribute('data-report-language'),language);
    await page.locator('.erh-view-tools button').nth(1).click();await page.locator('.erh-pdf-page-text').filter({hasText:expectedTitle}).waitFor();
    const savedReady=page.waitForEvent('download');await page.locator('.erh-pdf-actions a[download]').click();const saved=await savedReady,previewBytes=await fs.readFile(await saved.path());await assertPdfLanguage(previewBytes,language);
    if(language==='en') {await page.evaluate(()=>{document.documentElement.lang='es';});await page.waitForFunction(()=>document.documentElement.lang==='en');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('vn_lang')).lang),'en','El reinicio del DOM a español no altera la selección');}
    const pdfReady=page.waitForEvent('download');await page.locator('.erh-workbar-actions .erh-download').click();const pdf=await pdfReady;assert(pdf.suggestedFilename().includes(language==='es' ? '.pdf' : '-'+language+'.pdf'));await assertPdfLanguage(await fs.readFile(await pdf.path()),language);
    assert.deepEqual(await fs.readFile(await pdf.path()),previewBytes,'Vista previa, Guardar PDF y Descargar PDF comparten exactamente el archivo');
    const csvReady=page.waitForEvent('download');await page.locator('.erh-secondary-actions button').first().click();const csv=await csvReady;assert(csv.suggestedFilename().includes(language==='es' ? '-datos.csv' : '-'+language+'.csv'));
    console.log('UI · '+language+' · PDF y CSV descargados');
   }
   // Una pestaña abierta debe reaccionar sin recargar al traductor, al DOM y a
   // la selección hecha en otra pestaña. Ni el visor ni el correo usan su idioma anterior.
   await page.getByRole('button',{name:'Ver PDF',exact:true}).click();await page.locator('.erh-pdf-viewer').waitFor();
   const other=await context.newPage();await other.route('https://**/*',route=>route.abort());await other.goto(origin+'/login');await other.evaluate(()=>localStorage.setItem('vn_lang',JSON.stringify({lang:'fr'})));await page.getByTitle('Idioma: Français').waitFor();
   assert.equal(await page.locator('.erh-pdf-viewer').count(),0,'Invalida la vista previa española');
   await page.evaluate(()=>{const select=document.createElement('select');select.className='goog-te-combo';select.innerHTML='<option value="es">Español</option>';document.body.append(select);select.dispatchEvent(new Event('change',{bubbles:true}));});
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('vn_lang')).lang),'fr','Un evento automático del motor no sustituye la elección');
   await other.evaluate(()=>localStorage.setItem('vn_lang',JSON.stringify({lang:'it'})));await page.getByTitle('Idioma: Italiano').waitFor();await other.close();await page.locator('.erh-document h2').filter({hasText:vocabulary[report.title][2]}).waitFor();
   const activeDownload=page.waitForEvent('download');await page.locator('.erh-workbar-actions .erh-download').click();await assertPdfLanguage(await fs.readFile(await (await activeDownload).path()),'it');
   await page.locator('.erh-program-button').click();const dialog=page.locator('.erh-send-dialog');
   assert((await dialog.locator('.erh-send-language').innerText()).includes('Italiano'));const emailSent=page.waitForResponse(response=>response.url().endsWith('/api/report-email') && response.request().method()==='POST');
   await dialog.locator('.erh-send-immediate button').click();const emailResponse=await emailSent;assert.equal(emailResponse.request().postDataJSON().language,'it');assert.equal((await emailResponse.json()).language,'it');await assertPdfLanguage(messages.at(-1).attachments[0].content,'it');
   await dialog.locator('header button').click();
   // Una traducción fallida no deja un documento español bajo la etiqueta de
   // otro idioma, y permite recuperar la lectura sin perder el informe base.
   await page.route('**/api/report-localize',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:'Traducción de prueba no disponible'})}));
   await page.reload();await page.locator('.erh-localization-state [role="alert"]').filter({hasText:'Traducción de prueba no disponible'}).waitFor();
   assert.equal(await page.locator('.erh-document').count(),0);assert(await page.locator('.erh-workbar-actions .erh-download').isDisabled());
   await page.unroute('**/api/report-localize');await page.locator('.erh-localization-state button').click();await page.locator('.erh-document h2').filter({hasText:vocabulary[report.title][2]}).waitFor();
   await fs.mkdir(output,{recursive:true});await page.screenshot({path:path.join(output,'lectura-italiano-sin-google.png'),fullPage:false});
   console.log('UI · cambio sin recarga · DOM, traductor, otra pestaña, caché del visor y adjunto por correo verificados');
   const blocked=await browser.newContext({acceptDownloads:true,viewport:{width:390,height:844}});await blocked.addCookies([{name:'vn_token',value:jwt.sign({sub:'blocked',email:'blocked@example.invalid'},process.env.JWT_SECRET),url:origin}]);const privatePage=await blocked.newPage();await privatePage.route('https://**/*',route=>route.abort());
   await privatePage.addInitScript(()=>{Storage.prototype.setItem=function(){throw Error('Storage blocked for test');};});await privatePage.goto(origin+'/informes');
   await privatePage.getByRole('button',{name:'Abrir menú',exact:true}).click();await privatePage.getByTitle(/^Idioma:/).click();
   for(const option of await privatePage.getByRole('listbox',{name:'Idioma de la página'}).getByRole('option').all()) {const box=await option.boundingBox();assert(box && box.x>=0 && box.y>=0 && box.x+box.width<=390 && box.y+box.height<=844,'Idioma accesible en móvil');}
   await privatePage.getByRole('option',{name:/Français/}).click();await privatePage.waitForFunction(()=>document.documentElement.lang==='fr');await privatePage.keyboard.press('Escape');
   await privatePage.locator('.erh-book').first().click();const privateReady=privatePage.waitForEvent('download');await privatePage.locator('.erh-workbar-actions .erh-download').click();assert((await privateReady).suggestedFilename().endsWith('-fr.pdf'));
   assert.deepEqual(errors,[]);
  } catch(error) {await fs.mkdir(output,{recursive:true});for(const context of browser.contexts()) for(const page of context.pages()) {await fs.writeFile(path.join(output,'error-ui.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(output,'error-ui.png')});}throw error;}
  finally {await browser.close();}
 }
} finally {if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await fs.rm(storage,{recursive:true,force:true});}
console.log('Report languages: OK · seis idiomas, 14 orígenes, PDF y japonés, CSV, Word, HTML, texto, JSON, correo, programación, caché privada, cifras y fuentes; IA y SMTP simulados');
process.exit(0);
