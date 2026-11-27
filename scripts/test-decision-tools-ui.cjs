'use strict';
/* global document,innerWidth,window */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),express=require('express'),{chromium}=require('playwright');
const PDFDocument=require('pdfkit');

async function main(){
 const folder=path.resolve('output/decision-tools-20261126');await fs.mkdir(folder,{recursive:true});
 const read=async file=>JSON.parse(await fs.readFile('backend/cache/'+file+'.json','utf8'));
 const collections={finance:(await read('finance_executive_reports')).reports,markets:(await read('market_executive_reports')).reports,mexico:(await read('mexico-executive-reports')).reports};
 const firstSale=(await read('sniim-first-sale')).data,artifact=await read('protein-ml-forecasts');
 const fixture={available:true,...artifact,closedLoopAudit:{summary:{totalEvaluated:0,modelVersion:artifact.version,evaluationScope:'prospective_current_model_only'}}};
 const report=collections.finance.find(item=>item.key==='equities'),previous=JSON.parse(JSON.stringify(report));
 previous.generatedAt=new Date(Date.parse(report.generatedAt)-86400000).toISOString();
 const mutate=value=>{if(!value||typeof value!=='object')return;for(const key of Object.keys(value)){if(['value','close','price'].includes(key)&&Number.isFinite(value[key]))value[key]*=.99;else mutate(value[key]);}};mutate(previous);
 const {reportChangeSnapshot,compareReportSnapshots}=await import('../frontend/src/lib/reportChanges.js');
 assert(compareReportSnapshots(reportChangeSnapshot(previous),reportChangeSnapshot(report)).items.length>0,'The fixture must contain real comparable changes');
 const pdf=await new Promise(resolve=>{const doc=new PDFDocument(),chunks=[];doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.text('SIMULACION UI: documento de prueba, sin datos personales');doc.end();});
 let owner='decision-fixture@example.invalid',mismatch=false,evaluated=false;
 const priorId='a'.repeat(64),app=express(),routes={'/finance-executive-reports':'finance','/market-executive-reports':'markets','/mexico-executive-reports':'mexico'};
 app.use('/api',(req,res)=>{
  if(req.path==='/verify-token')return res.json({success:true,email:owner});
  if(req.path==='/profile')return res.json({success:true,profile:{email:owner,preferences:{}}});
  if(req.path==='/report-export')return res.type('application/pdf').send(pdf);
  if(routes[req.path])return res.json({success:true,data:collections[routes[req.path]],accountEmail:owner});
  if(req.path==='/sniim/primer-mercado')return res.json(firstSale);
  if(req.path==='/report-history')return res.json({success:true,accountEmail:owner,data:[{id:priorId,collection:'finance',key:'equities',title:report.title,generatedAt:previous.generatedAt}]});
  if(req.path==='/report-history/'+priorId)return res.json({success:true,accountEmail:mismatch?'other-fixture@example.invalid':owner,data:previous});
  if(req.path==='/marranas'||req.path==='/vall-proteinas'){
   const data=JSON.parse(JSON.stringify(fixture));
   if(evaluated){const summary={totalEvaluated:1,evaluations:1,directionalEvaluations:1,directionalHitRatePct:100,avgMapePct:4.55,baselineImprovementPct:50,modelVersion:artifact.version,evaluationScope:'prospective_current_model_only'};
    data.closedLoopAudit={summary,bySpecies:{cerdo:summary},byHorizon:{'1w':summary},recentEvaluations:[{symbol:'SYNTHETIC-UI-ONLY',unit:'MXN/kg',generatedAt:'2026-10-01',targetAt:'2026-10-10',evaluatedAt:'2026-10-10',predictedValue:105,actualValue:110,percentageError:4.55}]};}
   return res.json(data);
  }
  return res.json({success:true,data:[],articles:[]});
 });
 app.use(express.static(path.resolve('dist')));app.use((req,res)=>res.sendFile(path.resolve('dist/index.html')));
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});let browser;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'}),errors=[];
  page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const origin='http://127.0.0.1:'+server.address().port;
  await page.goto(origin+'/mexico');await page.getByRole('button',{name:'Ver mercado productivo'}).click();
  const livestock=page.locator('section[aria-labelledby="mxh-livestock-title"] .mxh-livestock-table');await livestock.getByText('Baja California Sur',{exact:true}).waitFor();
  assert.equal(await livestock.locator('tbody tr').count(),31);assert((await livestock.innerText()).includes('Histórico'));
  const grains=page.getByRole('region',{name:'Precios físicos de granos de México'});await grains.waitFor();assert((await grains.innerText()).includes('mensual'));
  const scenarios=page.locator('section[aria-labelledby="feed-scenarios-title"]');assert.equal(await scenarios.getByLabel('Tipo de cambio · MXN por USD').inputValue(),'');
  await scenarios.getByRole('button',{name:'Cargar ejemplo ilustrativo'}).click();const results=scenarios.getByRole('region',{name:'Resultados de escenarios de costos'});
  await results.waitFor();assert((await results.innerText()).includes('20.83'));assert((await results.innerText()).includes('22.56'));
  await scenarios.screenshot({path:path.join(folder,'cost-scenarios-desktop.png')});
  await scenarios.getByLabel('Maíz en la mezcla · %').fill('90');await results.waitFor({state:'hidden'});
  await scenarios.getByRole('button',{name:'Cargar ejemplo ilustrativo'}).click();
  owner='second-fixture@example.invalid';await page.evaluate(()=>window.dispatchEvent(new Event('vn:session-refresh')));
  await page.waitForFunction(()=>document.querySelector('section[aria-labelledby="feed-scenarios-title"] input')?.value==='');
  await scenarios.getByRole('button',{name:'Cargar ejemplo ilustrativo'}).click();await page.setViewportSize({width:390,height:844});await scenarios.scrollIntoViewIfNeeded();
  await scenarios.screenshot({path:path.join(folder,'cost-scenarios-mobile.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mexico page must not overflow on mobile');
  await page.setViewportSize({width:1440,height:1050});
  await scenarios.getByRole('button',{name:'Analizar en ORION'}).click();
  await page.waitForURL('**/orion');
  const orionInput=page.getByRole('textbox',{name:'Mensaje para ORION'});
  const expectedPrompt='Con base en el escenario adjunto de costo de ración (maíz, pasta de soya, FCR y tipo de cambio), evalúa cuál es el principal riesgo de margen y qué estrategia de compras o cobertura conviene priorizar.';
  await page.waitForFunction(()=>document.getElementById('vaiInput')?.value.includes('costo de ración'));
  assert.equal(await orionInput.inputValue(),expectedPrompt,'ORION recibe la instrucción del simulador sin enviarla');
  const handoffAttachment=page.locator('#vaiAttachments .vai-attachment-card');
  await handoffAttachment.getByText('escenarios-de-costo-de-racion-maiz-soya-fcr.md',{exact:true}).waitFor();
  await handoffAttachment.getByRole('button',{name:'Vista previa'}).click();
  await handoffAttachment.getByText('Matriz de sensibilidad',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('vn_orion_report_handoff_v1')),null,'ORION consume el contexto de una sola vez');
  assert.equal(await page.locator('#vaiMessages').locator('.vai-message.user').count(),0,'El contexto queda listo para revisar; no se envía al chat automáticamente');
  await page.setViewportSize({width:1440,height:1050});await page.goto(origin+'/mercado-proteinas');
  const track=page.locator('section[aria-labelledby="forecast-track-title"]');await track.waitFor();assert((await track.innerText()).includes('Todavía no hay resultados prospectivos'));
  evaluated=true;await page.reload();await track.getByText('Resultados evaluados',{exact:false}).waitFor();
  assert((await track.innerText()).includes('50%'));await track.getByText('Ver las últimas comparaciones publicadas').click();await track.getByText('SYNTHETIC-UI-ONLY',{exact:false}).waitFor();
  await track.screenshot({path:path.join(folder,'forecast-track-synthetic-ui.png')});
  await page.goto(origin+'/informes');await page.locator('#erh-tab-finance').click();
  const button=page.getByRole('button',{name:'Comparar cortes',exact:true});await button.click();const dialog=page.getByRole('dialog');await dialog.waitFor();
  await dialog.getByLabel('Edición anterior').selectOption(priorId);const changes=dialog.getByRole('region',{name:'Diferencias entre cortes'});await changes.waitFor();assert(await changes.locator('tbody tr').count()>0);
  await dialog.screenshot({path:path.join(folder,'report-comparison-desktop.png')});
  await page.setViewportSize({width:390,height:844});await dialog.screenshot({path:path.join(folder,'report-comparison-mobile.png')});assert(await dialog.evaluate(el=>el.getBoundingClientRect().width<=innerWidth),'Comparison dialog must fit mobile');
  mismatch=true;await dialog.getByLabel('Edición anterior').selectOption('');await dialog.getByLabel('Edición anterior').selectOption(priorId);
  await dialog.getByRole('alert').waitFor();assert((await dialog.getByRole('alert').innerText()).includes('cambió de cuenta'));assert.equal(await changes.count(),0,'A response for a different owner must not be displayed');
  await dialog.getByRole('button',{name:'Cerrar comparación'}).click();await dialog.waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);const result={passed:true,realPhysicalStates:31,monthlyPhysicalGrains:true,scenarioFormula:true,invalidSharesRejected:true,accountSwitchClearsAssumptions:true,feedScenarioOrionHandoff:true,orionHandoffAttachmentPreview:true,handoffNotAutoSent:true,prospectiveEmptyState:true,syntheticAuditRendering:true,officialCutComparison:true,crossAccountResponseRejected:true,desktop:true,mobile:true,browserErrors:errors};
  await fs.writeFile(path.join(folder,'ui-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
