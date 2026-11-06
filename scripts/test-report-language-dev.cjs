'use strict';
/* global document */
// Isolated browser against local Vite. All API calls are fixtures; no mail or AI.
const assert=require('node:assert/strict'),{chromium}=require('playwright');
async function main() {
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const diagnostics=[];
  page.on('requestfailed',request=>diagnostics.push({url:request.url(),failure:request.failure()?.errorText}));
  page.on('response',response=>{if(response.status()>=400) diagnostics.push({url:response.url(),status:response.status()});});
  page.on('console',message=>{if(message.type()==='error') diagnostics.push({console:message.text()});});
  await page.route('https://**/*',route=>route.abort());
  const report={collection:'finance',key:'equities',title:'Bolsa',eyebrow:'Renta variable global',summary:'Resumen de prueba.',generatedAt:'2026-10-14T14:00:00Z',sections:[{heading:'Análisis',text:'Contenido de prueba.'}],metrics:[],visuals:[],tables:[],sources:[],sourceLinks:[]};
  await page.route(url=>url.pathname.startsWith('/api/'),route=>{
   const request=route.request(),endpoint=new URL(request.url()).pathname;
   let body={success:true};
   if(endpoint==='/api/verify-token') body={success:true,email:'dev-language@example.invalid'};
   else if(endpoint==='/api/profile') body={success:true,profile:{email:'dev-language@example.invalid',preferences:{}}};
   else if(endpoint==='/api/finance-executive-reports') body={success:true,data:[report]};
   else if(endpoint==='/api/report-localize') {const {language}=request.postDataJSON();body={success:true,language,report:{...report,title:language==='en' ? 'Stock Market' : 'Bourse',eyebrow:'Global equities',summary:language==='en' ? 'Test summary.' : 'Résumé de test.'}};}
   else body={success:true,data:[]};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:5273/informes');
  try {await page.locator('.erh-document').waitFor();}catch(error) {console.error('Fixture diagnostics:',JSON.stringify({url:page.url(),errors,diagnostics,body:(await page.locator('body').innerText()).slice(0,1600)}));throw error;}
  // A second development revision changes the store consumed by the mounted
  // Header and Hub. No reload and no Google DOM translation can hide a split.
  const selected=await page.evaluate(async()=>{
   const revision=await import('/src/lib/idioma.js?language-regression=second');
   revision.fijarIdioma('en',{recargar:false});return revision.leerIdioma();
  });
  assert.equal(selected,'en');await page.getByTitle('Idioma: English').waitFor();
  await page.locator('.erh-document h2').filter({hasText:'Stock Market'}).waitFor();
  assert.equal(await page.locator('.erh-studio').getAttribute('data-report-language'),'en');
  assert.equal(await page.locator('.erh-workbar-actions .erh-download').innerText(),'Download PDF');
  assert.equal(await page.locator('.erh-book.is-active strong').innerText(),'Stock Market');
  await page.evaluate(()=>{document.documentElement.lang='es';});await page.waitForFunction(()=>document.documentElement.lang==='en');
  await page.locator('.erh-search input').fill('Stock');assert.equal(await page.locator('.erh-book').count(),1);
  await page.evaluate(async()=>{(await import('/src/lib/idioma.js?language-regression=third')).fijarIdioma('fr',{recargar:false});});
  await page.getByTitle('Idioma: Français').waitFor();await page.locator('.erh-search input').fill('');
  await page.locator('.erh-document h2').filter({hasText:'Bourse'}).waitFor();
  assert.equal(await page.locator('.erh-studio').getAttribute('data-report-language'),'fr');
  assert.notEqual(await page.locator('.erh-workbar-actions .erh-download').innerText(),'Descargar PDF');
  assert.deepEqual(errors,[]);
  console.log('Vite language flow: OK · Header, tarjetas, búsqueda, lectura y botones comparten EN/FR sin recarga ni Google; API simulada');
 } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
