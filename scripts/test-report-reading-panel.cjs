'use strict';
/* global document, window */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const express=require('express');
const {chromium}=require('playwright');
const PDFDocument=require('pdfkit');

async function main() {
 const root=path.resolve(__dirname,'..'),output=path.join(root,'output/lectura-informes');await fs.mkdir(output,{recursive:true});
 const report={key:'overview',title:'Panorama ejecutivo de prueba',summary:'Resumen del corte de simulación.',generatedAt:'2026-10-12T14:00:00Z',sections:Array.from({length:20},(_,i)=>({heading:'Frente '+i,text:`Evidencia del frente ${i}. `+'Información del corte y validaciones para la empresa. '.repeat(35)})),closing:'Validación final del informe.',metrics:[{label:'Referencia de simulación',value:'40 MXN/kg'}],tables:[{title:'Respaldo de prueba',columns:['Producto','Referencia'],rows:[['Pollo','40 MXN/kg']]}],sources:['Fuente de simulación']};
 report.metrics=[{label:'Costo de referencia del producto en simulación',value:'40 MXN/kg',change:'+2.0%',tone:'up'},{label:'Disponibilidad de simulación',value:'1,250 t',change:'-1.5%',tone:'down'},{label:'Plazo de entrega de simulación',value:'7 días',change:'Sin cambio',tone:'neutral'},{label:'Cotización pendiente de validación local',value:'No disponible'}];
 report.watchlist=['Confirmar la vigencia de la referencia antes de comprar.','Validar disponibilidad y condiciones de entrega con el proveedor.','Contrastar el costo por presentación para evitar comparaciones incorrectas.'];
 report.visuals=[{type:'bar',title:'Comparación de simulación',unit:'MXN/kg',bars:[{label:'Referencia A',value:38},{label:'Referencia B',value:40}],note:'Datos de prueba; no son cotizaciones comerciales.'}];
 report.visuals.push({type:'bar',title:'Variaciones de simulación',unit:'%',bars:[{label:'Alza',value:10},{label:'Baja',value:-5},{label:'Sin cambio',value:0}]});
 report.visuals.push({type:'line',title:'Trayectoria con fechas incompletas',unit:'MXN/kg',series:[{label:'Serie A',points:[{date:'2026-10-10',value:100},{date:'2026-10-11',value:105},{date:'2026-10-12',value:110}]},{label:'Serie B',points:[{date:'2026-10-10',value:200},{date:'2026-10-12',value:220}]}],note:'Datos sintéticos. No se interpolan las cifras consultadas.'});
 report.sourceLinks=[{label:'Referencia consultable de simulación',url:'https://example.invalid/corte'},{label:'Referencia con enlace rechazado',url:'javascript:alert(1)'}];
 const pdf=await new Promise(resolve=>{const doc=new PDFDocument(),chunks=[];doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.text('Primera pagina del informe');doc.addPage();doc.text('Ultima pagina del informe');doc.end();});
 const app=express();app.use(express.json());app.use('/api',(req,res)=>{
  if(req.path==='/verify-token') return res.json({success:true,email:'fixture@example.invalid'});
  if(req.path==='/profile') return res.json({success:true,profile:{email:'fixture@example.invalid',preferences:{}}});
  if(req.path.includes('executive-reports')) return res.json({success:true,data:[report,{...report,key:'fx',title:'Otra lectura de prueba'}]});
  if(req.path==='/report-export') return res.type('application/pdf').send(pdf);
  if(req.path==='/report-email') throw Error('No enviar correos en pruebas');
  return res.json({success:true,data:[],articles:[]});
 });app.use(express.static(path.join(root,'dist')));app.use((req,res)=>res.sendFile(path.join(root,'dist/index.html')));
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});let browser,page;
 try {
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/informes`);await page.locator('.erh-document').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  const column=page.locator('.erh-document-column'),reader=page.locator('.erh-document');
  const position=async()=>{await column.evaluate(element=>window.scrollTo({top:window.scrollY+element.getBoundingClientRect().top-88,behavior:'instant'}));};
  const aligned=async()=>{const [left,layout]=await Promise.all([column.boundingBox(),page.locator('.erh-review-layout').boundingBox()]);assert(Math.abs(left.width-layout.width)<=2,'La lectura ocupa el ancho disponible');assert(left.height<=1000,'El informe no crea una tira larga');assert.equal(await page.locator('.erh-edition,#erh-creation-panel,.erh-workflow').count(),0,'Los informes abiertos no muestran el apartado de edición');assert.equal(await page.getByRole('button',{name:/^Editar/}).count(),0);};
  await position();await aligned();assert(await reader.evaluate(element=>element.scrollHeight>element.clientHeight),'La lectura tiene desplazamiento interno');
  const outside=await page.evaluate(()=>window.scrollY),tools=await page.locator('.erh-document-tools').boundingBox();
  await reader.focus();await page.keyboard.press('PageDown');await page.waitForFunction(()=>document.querySelector('.erh-document').scrollTop>0);
  await page.waitForTimeout(300); // Esperar el desplazamiento nativo del teclado antes de medir.
  assert.equal(await page.evaluate(()=>window.scrollY),outside,'El teclado desplaza el informe y no la página');
  assert.equal((await page.locator('.erh-document-tools').boundingBox()).y,tools.y,'El índice permanece visible');
  await reader.evaluate(element=>{element.scrollTop=element.scrollHeight;});assert(await reader.locator('.erh-document-footer').isVisible());
  const navigation=page.getByRole('navigation',{name:'Índice del informe',exact:true});
  await navigation.locator('button[aria-current="location"]').filter({hasText:'Fuentes'}).waitFor();
  const [currentTab,navigationFrame]=await Promise.all([navigation.locator('button[aria-current="location"]').boundingBox(),navigation.boundingBox()]);assert(currentTab.x>=navigationFrame.x-1&&currentTab.x+currentTab.width<=navigationFrame.x+navigationFrame.width+1,'La sección activa se mantiene visible en el índice al desplazar la lectura');
  await page.getByRole('navigation',{name:'Índice del informe',exact:true}).getByRole('button',{name:/Análisis e implicaciones/}).click();
  const [analysis,frame]=await Promise.all([page.locator('#erh-document-analysis').boundingBox(),reader.boundingBox()]);assert(Math.abs(analysis.y-frame.y-24)<3,`El índice abre la sección dentro del cuadro (${analysis.y-frame.y}px)`);assert.equal(await page.evaluate(()=>window.scrollY),outside);
  await page.getByRole('navigation',{name:'Índice del informe',exact:true}).getByRole('button',{name:/Resumen ejecutivo/}).click();
  await page.screenshot({path:path.join(output,'paneles-escritorio.png'),animations:'disabled'});
  const index=page.getByRole('navigation',{name:'Índice del informe',exact:true});
  assert(await index.isVisible(),'El índice sigue disponible en la lectura de ancho completo');
  await index.getByRole('button',{name:/Indicadores/}).click();assert.equal(await reader.locator('.erh-metrics>div').count(),4);
  await index.locator('button[aria-current="location"]').filter({hasText:'Indicadores'}).waitFor();
  assert(await reader.locator('.erh-change-neutral').filter({hasText:'Sin cambio'}).isVisible(),'Las variaciones neutras se distinguen de las alzas');
  assert.equal(await reader.locator('.erh-change-up').evaluate(element=>window.getComputedStyle(element).color),'rgb(22, 114, 79)','El alza tiene contraste sobre el documento blanco');
  await page.screenshot({path:path.join(output,'indicadores-escritorio.png'),animations:'disabled'});
  await index.getByRole('button',{name:/Gráficas/}).click();
  const signedBars=reader.locator('.erh-bars-signed>div'),positive=await signedBars.nth(0).locator('b').boundingBox(),negative=await signedBars.nth(1).locator('b').boundingBox(),track=await signedBars.nth(1).locator('i').boundingBox();
  assert(positive.width>0 && negative.width>0,'Ambos signos se representan');assert(Math.abs(negative.x+negative.width-track.x-track.width/2)<1,'La baja termina en el cero central');assert.equal((await signedBars.nth(2).locator('b').boundingBox()).width,0,'El cero no se representa como volumen positivo');
  await page.screenshot({path:path.join(output,'graficas-signos-escritorio.png'),animations:'disabled'});
  const barChart=reader.getByRole('figure',{name:'Variaciones de simulación',exact:true});
  await barChart.getByRole('combobox',{name:'Orden de Variaciones de simulación'}).selectOption('ascending');
  assert.deepEqual(await barChart.locator('.erh-bars>div>span').allTextContents(),['Baja','Sin cambio','Alza'],'Ordenar sin cambiar valores ni signos');
  const chart=reader.getByRole('figure',{name:'Trayectoria con fechas incompletas',exact:true}),slider=chart.getByRole('slider',{name:'Fecha en Trayectoria con fechas incompletas'});
  assert.match(await chart.locator('.erh-chart-results').innerText(),/Último dato\s+110 MXN\/kg/);
  assert.equal(await chart.locator('svg circle').count(),2,'Marcar los valores de la fecha consultada');
  await slider.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
  assert.match(await chart.locator('.erh-chart-values').innerText(),/105 MXN\/kg/);assert.match(await chart.locator('.erh-chart-values').innerText(),/Sin dato en esta fecha/);
  assert.equal(await chart.locator('svg circle').count(),1,'No dibujar un dato inexistente');
  await chart.locator('summary').click();await chart.getByRole('region',{name:'Datos de Trayectoria con fechas incompletas'}).waitFor();
  assert.equal(await chart.locator('tbody tr').count(),3);assert.match(await chart.locator('tbody tr').nth(1).innerText(),/Sin dato/);
  await chart.locator('summary').click();await chart.scrollIntoViewIfNeeded();await chart.screenshot({path:path.join(output,'grafica-resultados-escritorio.png'),animations:'disabled'});
  await index.getByRole('button',{name:/Riesgos/}).click();assert.equal(await reader.getByRole('list',{name:'Señales para seguimiento'}).getByRole('listitem').count(),3);await page.screenshot({path:path.join(output,'riesgos-escritorio.png'),animations:'disabled'});
  await index.getByRole('button',{name:/Fuentes/}).click();assert(await reader.getByRole('link',{name:'Abrir fuente: Referencia consultable de simulación',exact:true}).isVisible());assert.equal(await reader.getByRole('link',{name:'Abrir fuente: Referencia con enlace rechazado',exact:true}).count(),0);assert(await reader.getByText('example.invalid',{exact:true}).isVisible());
  await index.locator('button[aria-current="location"]').filter({hasText:'Fuentes'}).waitFor();
  await page.screenshot({path:path.join(output,'fuentes-escritorio.png'),animations:'disabled'});assert.equal(await page.evaluate(()=>window.scrollY),outside,'Revisar indicadores, riesgos y fuentes mantiene la posición de la página');
  await page.locator('.erh-book').filter({hasText:'Otra lectura de prueba'}).click();assert.equal(await reader.evaluate(element=>element.scrollTop),0,'Otro informe comienza arriba');
  await position();await aligned();
  await page.getByRole('button',{name:'Ver PDF',exact:true}).click();await page.locator('.erh-pdf-page-text').getByText('Primera pagina del informe',{exact:false}).waitFor();await aligned();
  await page.getByRole('button',{name:'Página siguiente del PDF',exact:true}).click();await page.locator('.erh-pdf-page-text').getByText('Ultima pagina del informe',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Lectura',exact:true}).click();await page.getByRole('button',{name:'Ampliar lectura del informe',exact:true}).click();await page.getByRole('dialog',{name:'Otra lectura de prueba',exact:true}).waitFor();assert(await page.locator('.erh-modal-body').getByText('Frente 19',{exact:true}).isVisible());await page.getByRole('button',{name:'Cerrar lectura ampliada',exact:true}).click();
  assert(await reader.evaluate(element=>element.scrollHeight>element.clientHeight),'La lectura conserva el cuadro');
  for(const [width,height] of [[1024,768],[768,844],[390,844],[360,640],[1366,540]]) {
   await page.setViewportSize({width,height});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Sin desbordamiento a '+width+'px');
   assert((await column.boundingBox()).height<1100);await reader.evaluate(element=>{element.scrollTop=element.scrollHeight;});assert(await reader.locator('.erh-document-footer').isVisible());
   if(width===390) {await reader.evaluate(element=>{element.scrollTop=0;});await position();await page.screenshot({path:path.join(output,'panel-lectura-movil.png'),animations:'disabled'});await index.getByRole('button',{name:/Fuentes/}).click();await page.screenshot({path:path.join(output,'fuentes-movil.png'),animations:'disabled'});}
  }
  await page.setViewportSize({width:390,height:844});await chart.scrollIntoViewIfNeeded();await chart.screenshot({path:path.join(output,'grafica-resultados-movil.png'),animations:'disabled'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Los resultados de la gráfica no desbordan el móvil');
  assert.deepEqual(errors,[]);console.log('Report reading panel: OK · sin edición, ancho completo, scroll y teclado, índice fijo, gráficas, fuentes, PDF, ampliación y móvil');
 } catch(error) {if(page) await page.screenshot({path:path.join(output,'error.png'),fullPage:true});throw error;}
 finally {if(browser) await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
