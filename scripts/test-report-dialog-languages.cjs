'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const express=require('express'),{chromium}=require('playwright'),catalog=require('../shared/report-languages.json');
const languages=['es','en','fr','it','de','ja'];
const copy=(language,text,parameters={})=>(language==='es' ? text : catalog.labels[text]?.[languages.indexOf(language)-1] || text).replace(/\{(\w+)\}/g,(match,key)=>String(parameters[key] ?? match));
const summaries={es:'Resumen sintético del informe.',en:'Synthetic report summary.',fr:'Résumé synthétique du rapport.',it:'Riepilogo sintetico del rapporto.',de:'Synthetische Berichtszusammenfassung.',ja:'テスト用レポートの要約。'};
async function main() {
 const app=express(),email='dialogs@example.invalid',sent=[],saved=[],deleted=[],errors=[];
 const report={collection:'finance',key:'equities',title:'Bolsa',eyebrow:'Renta variable global',generatedAt:'2026-10-14T14:00:00Z',summary:summaries.es,sections:[{heading:'Análisis',text:'Datos sintéticos.'}],metrics:[],tables:[],visuals:[],sources:[],sourceLinks:[]};
 const own={...report,key:'edition_owned',editionId:'owned',editionVersion:1,userEdition:true,title:'Mi informe personal',baseReport:{collection:'finance',key:'equities',title:'Bolsa',generatedAt:report.generatedAt}};
 let mailConfigured=true,failSend=false,schedules=[],creationFails=false,deleteFails=true,localizationMode='ok';
 const pendingLocalizations=[];
 const nextRunAt='2026-10-15T15:00:00Z';
 app.use(express.json());app.use('/api',(req,res)=>{
  if(req.path==='/verify-token')return res.json({success:true,email});
  if(req.path==='/profile')return res.json({success:true,profile:{email,preferences:{}}});
  if(req.path==='/report-localize'){if(localizationMode==='pending'){pendingLocalizations.push(res);return;}if(localizationMode==='fail')return res.status(502).json({success:false,code:'REPORT_TRANSLATION_INVALID',error:'No se pudo completar la traducción del informe. Conservamos el original; vuelve a intentarlo.'});const {language,executiveReport}=req.body;return res.json({success:true,accountEmail:email,language,report:{...executiveReport,title:copy(language,executiveReport.title),eyebrow:copy(language,executiveReport.eyebrow),summary:summaries[language]}});}
  if(req.path==='/finance-executive-reports')return res.json({success:true,data:[report]});
  if(req.path==='/market-executive-reports')return creationFails ? res.status(503).json({success:false,error:'Error de prueba sin traducir'}) : res.json({success:true,data:[{...report,collection:'markets',key:'proteins',title:'Mercado de proteínas'}]});
  if(req.path==='/mexico-executive-reports')return res.json({success:true,data:[{...report,collection:'mexico',key:'mx_proteins',title:'Proteínas en México por estado'}]});
  if(req.path==='/report-email/status')return res.json({success:true,mail:{configured:mailConfigured,environment:'local',automaticEnabled:false,missing:mailConfigured ? [] : ['GMAIL_PASS']}});
  if(req.path==='/report-email-schedules' && req.method==='GET')return res.json({success:true,data:schedules});
  if(req.path==='/report-email-schedules' && req.method==='POST'){saved.push(req.body);const schedule={id:'fixture',...req.body,preferences:{...req.body.preferences,_deliveryRetries:1},nextRunAt,lastSentAt:'2026-10-14T15:00:00Z',lastError:'No se pudo entregar el correo. Inténtalo de nuevo más tarde.'};schedules=[schedule];return res.json({success:true,schedule});}
  if(req.path==='/report-email-schedules/cancel'){schedules=[];return res.json({success:true});}
  if(req.path==='/report-email'){sent.push(req.body);return failSend ? res.status(503).json({success:false,code:'REPORT_EMAIL_NOT_CONFIGURED',error:'El envío por correo aún no está configurado en el servidor.'}) : res.json({success:true,language:req.body.language,email:req.body.recipientEmail});}
  if(req.path==='/user-reports')return res.json({success:true,data:[own]});
  if(req.path==='/user-reports/owned' && req.method==='DELETE'){deleted.push(req.body);return deleteFails ? res.status(503).json({success:false,error:'Error de borrado en español no catalogado'}) : res.json({success:true});}
  if(req.path==='/user-reports/owned')return res.json({success:true,data:own});
  return res.json({success:true,data:[]});
 });
 app.use('/assets',express.static(path.resolve('assets')));app.use(express.static(path.resolve('dist')));app.use((req,res)=>res.sendFile(path.resolve('dist/index.html')));
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});let browser;
 const output=path.resolve('output/reportes-idiomas');
 try {
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));await page.route('https://**/*',route=>route.abort());
  const origin='http://127.0.0.1:'+server.address().port;await page.goto(origin+'/informes');await page.locator('.erh-document').waitFor();
  await fs.mkdir(output,{recursive:true});
  for(const language of languages) {
   schedules=[];mailConfigured=true;creationFails=false;
   await page.locator('#erh-tab-finance').click();
   await page.evaluate(language=>localStorage.setItem('vn_lang',JSON.stringify({lang:language})),language);await page.reload();await page.locator('.erh-document').waitFor();
   const t=(text,parameters)=>copy(language,text,parameters);
   await page.locator('.erh-program-button').click();const dialog=page.locator('.erh-send-dialog');
   await dialog.locator('.erh-mail-status strong').filter({hasText:t('Correo configurado · Servidor local')}).waitFor();
   assert.equal(await dialog.getAttribute('lang'),language);assert.equal(await dialog.getAttribute('translate'),'no');
   assert.equal(await dialog.locator('h2').innerText(),t('Programar reportes'));assert.equal(await dialog.locator('.erh-send-document strong').innerText(),t('Bolsa'));
   const formatted=new Date(report.generatedAt).toLocaleString(catalog.languages[language].locale,{dateStyle:'medium',timeStyle:'short',timeZone:'America/Mexico_City'});
   assert.equal(await dialog.locator('.erh-send-document small').innerText(),t('Corte')+': '+formatted);
   await dialog.getByRole('radio').nth(1).check();const recipient=dialog.locator('input[type=email]');await recipient.fill('invalid');assert(await dialog.locator('.erh-send-immediate button').isDisabled());
   assert.equal(await dialog.locator('#erh-recipient-help').innerText(),t('Escribe un solo correo válido para habilitar el envío.'));await recipient.fill('recipient@example.invalid');
   await dialog.getByLabel(t('Envíos automáticos'),{exact:true}).check();await dialog.getByLabel(t('Frecuencia'),{exact:true}).selectOption('weekly');
   const day=dialog.getByLabel(t('Día de entrega'),{exact:true});assert.equal(await day.locator('option[value="3"]').innerText(),t('Miércoles'));await day.selectOption('3');
   await dialog.getByLabel(t('Hora · Ciudad de México'),{exact:true}).fill('09:15');
   await dialog.getByRole('button',{name:t('Guardar entrega automática'),exact:true}).click();
   await dialog.locator('.erh-send-feedback').filter({hasText:'recipient@example.invalid'}).waitFor();assert.equal(saved.at(-1).language,language);assert.equal(saved.at(-1).delivery.frequency,'weekly');assert.equal(saved.at(-1).delivery.weekday,3);
   assert((await dialog.locator('.erh-send-schedules').innerText()).includes(t('Último envío registrado:')));
   assert((await dialog.locator('.erh-send-schedules').innerText()).includes(t('El último intento falló.')));
   assert((await dialog.locator('.erh-send-schedules').innerText()).includes(t('Hay un reintento programado para la fecha indicada.')));
   assert.equal(await dialog.locator('.erh-send-feedback').innerText(),t('Entrega activada para {email}. Próximo envío: {date}, hora de Ciudad de México.',{email:'recipient@example.invalid',date:new Date(nextRunAt).toLocaleString(catalog.languages[language].locale,{dateStyle:'medium',timeStyle:'short',timeZone:'America/Mexico_City'})}));
   failSend=true;await dialog.locator('.erh-send-immediate button').click();await dialog.locator('.erh-send-feedback[role=alert]').waitFor();assert.equal(await dialog.locator('.erh-send-feedback').innerText(),t('El envío por correo aún no está configurado en el servidor.'));
   failSend=false;await dialog.locator('.erh-send-immediate button').click();await dialog.locator('.erh-send-feedback[role=status]').filter({hasText:'recipient@example.invalid'}).waitFor();assert.equal(sent.at(-1).language,language);assert.equal(await dialog.locator('.erh-send-feedback').innerText(),t('PDF enviado a {email}.',{email:'recipient@example.invalid'}));
   mailConfigured=false;await dialog.locator('.erh-mail-status button').click();await dialog.locator('.erh-mail-status strong').filter({hasText:t('El servidor no tiene configurado el correo')}).waitFor();assert(await dialog.locator('.erh-send-immediate button').isDisabled());assert((await dialog.locator('.erh-mail-status').innerText()).includes('GMAIL_PASS'));
   mailConfigured=true;await dialog.locator('.erh-mail-status button').click();await dialog.locator('.erh-mail-status strong').filter({hasText:t('Correo configurado · Servidor local')}).waitFor();
   if(language==='en'){await page.screenshot({path:path.join(output,'ventana-programar-en.png')});await page.setViewportSize({width:390,height:844});assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:path.join(output,'ventana-programar-en-movil.png')});await page.setViewportSize({width:1440,height:1000});}
   await dialog.locator('header button').click();await page.locator('.erh-library-actions button').last().click();const create=page.locator('.erh-create-dialog');await create.locator('.erh-create-bases button').first().waitFor();
   assert.equal(await create.locator('h2').innerText(),t('Elige tu reporte base'));assert.equal(await create.getAttribute('lang'),language);assert.equal(await create.locator('.erh-create-selection > p').first().innerText(),summaries[language]);
   await create.locator('.erh-sector-format summary').click();assert.equal(await create.locator('.erh-sector-format li strong').first().innerText(),t('Desempeño regional'));
   creationFails=true;await create.locator('.erh-create-collections button').nth(1).click();await create.locator('[role=alert]').waitFor();assert.equal(await create.locator('[role=alert]').innerText(),language==='es' ? 'Error de prueba sin traducir' : t('No pudimos cargar los reportes base.'));
   creationFails=false;await create.getByRole('button',{name:t('Reintentar colección'),exact:true}).click();await create.locator('.erh-create-selection > p').filter({hasText:summaries[language]}).waitFor();
   await create.locator('.erh-create-collections button').nth(2).click();await create.locator('.erh-create-selection > p').filter({hasText:summaries[language]}).waitFor();assert.equal(await create.locator('.erh-create-selection > strong').innerText(),t('Proteínas en México por estado'));
   if(language==='en')await page.screenshot({path:path.join(output,'ventana-crear-en.png')});await create.locator('header button').click();
   await page.locator('#erh-tab-mine').click();await page.locator('.erh-delete-card').click();const remove=page.locator('.erh-delete-dialog');assert.equal(await remove.locator('h2').innerText(),t('Eliminar informe'));assert.equal(await remove.getAttribute('lang'),language);assert.equal(await remove.locator('p strong').innerText(),own.title,'El título escrito por el usuario se conserva');
   await remove.locator('.erh-delete-confirm').click();await remove.locator('[role=alert]').waitFor();assert.equal(await remove.locator('[role=alert]').innerText(),language==='es' ? 'Error de borrado en español no catalogado' : t('No se pudo eliminar el informe. Vuelve a intentarlo.'));await remove.locator('footer button').first().click();
   console.log('Dialog UI · '+language+' · creación, entrega, borrado, errores, fechas y opciones');
  }
  // Keep the same open dialog and change the account preference in another tab.
  await page.locator('#erh-tab-finance').click();await page.locator('.erh-program-button').click();
  const other=await context.newPage();await other.route('https://**/*',route=>route.abort());await other.goto(origin+'/login');await other.evaluate(()=>localStorage.setItem('vn_lang',JSON.stringify({lang:'fr'})));
  const open=page.locator('.erh-send-dialog');await open.locator('h2').filter({hasText:copy('fr','Programar reportes')}).waitFor();assert.equal(await open.getAttribute('lang'),'fr');await page.keyboard.press('Escape');await open.waitFor({state:'detached'});await other.close();
  // Reproduce el botón deshabilitado en italiano: una preparación pendiente
  // debe explicar el bloqueo junto al botón y un fallo debe permitir recuperar.
  localizationMode='pending';schedules=[];mailConfigured=true;
  await page.evaluate(()=>localStorage.setItem('vn_lang',JSON.stringify({lang:'it'})));
  const localizationStarted=page.waitForRequest(request=>request.url().endsWith('/api/report-localize'));await page.reload();await localizationStarted;
  await page.locator('.erh-program-button').click();const retryDialog=page.locator('.erh-send-dialog'),sendButton=retryDialog.locator('.erh-send-immediate > button');
  await retryDialog.locator('.erh-mail-status strong').filter({hasText:copy('it','Correo configurado · Servidor local')}).waitFor();
  assert(await sendButton.isDisabled());assert.equal(await sendButton.innerText(),copy('it','Preparando…'));assert.equal(await retryDialog.locator('#erh-send-availability').innerText(),copy('it','Preparando el informe en {language}…',{language:'Italiano'}));
  localizationMode='fail';for(const response of pendingLocalizations.splice(0))response.status(502).json({success:false,code:'REPORT_TRANSLATION_INVALID',error:'No se pudo completar la traducción del informe. Conservamos el original; vuelve a intentarlo.'});
  await sendButton.filter({hasText:copy('it','Reintentar envío')}).waitFor();assert(await sendButton.isEnabled(),'Una vista previa fallida no bloquea indefinidamente el envío');
  assert.equal(await retryDialog.locator('#erh-send-availability').innerText(),copy('it','Puedes reintentar el envío. El servidor comprobará el PDF y el idioma antes de enviarlo.'));
  failSend=true;await sendButton.click();await retryDialog.locator('.erh-send-feedback[role=alert]').waitFor();assert(await sendButton.isEnabled(),'Un fallo del servidor no confirma el envío y permite reintentar');
  failSend=false;await sendButton.click();await retryDialog.locator('.erh-send-feedback[role=status]').filter({hasText:copy('it','PDF enviado a {email}.',{email})}).waitFor();assert.equal(sent.at(-1).language,'it');assert.equal(sent.at(-1).expectedOwner,email);assert(await sendButton.isEnabled());
  await page.screenshot({path:path.join(output,'envio-recuperado-it.png')});
  localizationMode='ok';await retryDialog.locator('.erh-send-preview-recovery button').click();await sendButton.filter({hasText:copy('it','Enviar PDF por correo')}).waitFor();assert(await sendButton.isEnabled());assert.equal(await retryDialog.locator('.erh-send-preview-recovery').count(),0);await retryDialog.locator('header button').click();
  assert.deepEqual(errors,[]);assert(sent.length===14);assert(saved.length===6);assert(deleted.length===6);
  console.log('Report dialog languages: OK · seis idiomas, Google desactivado, cambio con ventana abierta, opciones estables, diseño móvil y recuperación de envío tras fallo de vista previa; ningún correo real');
 } finally {if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
