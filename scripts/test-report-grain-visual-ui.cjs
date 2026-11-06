'use strict';
/* global document, innerWidth, getComputedStyle */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),express=require('express'),{chromium}=require('playwright');
process.env.NODE_ENV='test';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_PASSWORD','SUPABASE_DATABASE_URL','GEMINI_API_KEY','GMAIL_USER','GMAIL_PASS'])process.env[key]='';
const owner='grain-visual@example.invalid',auth=require.resolve('../backend/routes/auth');require.cache[auth]={id:auth,filename:auth,loaded:true,exports:{verifyToken:(req,res,next)=>{req.user={email:owner,id:'fixture'};next();}}};
const exportRouter=require('../backend/routes/export');
const luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>{const n=value/255;return n<=.04045 ? n/12.92 : ((n+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
(async()=>{
 const root=path.resolve(__dirname,'..'),output=path.join(root,'output/granos-diseno-20261106');await fs.mkdir(output,{recursive:true});
 const report=JSON.parse(await fs.readFile(path.join(root,'backend/cache/market_executive_reports.json'),'utf8')).reports.find(item=>item.key==='grains'),{weeklyReport}=await import('../shared/report-weekly.mjs'),model=weeklyReport(report),history=model.grainGlobalHistory,unchanged=JSON.stringify(report),errors=[],app=express();let server,browser,page;
 app.use('/api',exportRouter);app.use('/api',(req,res)=>{
  if(req.path==='/verify-token')return res.json({success:true,email:owner});
  if(req.path==='/profile')return res.json({success:true,profile:{email:owner,preferences:{}}});
  if(req.path==='/market-executive-reports')return res.json({success:true,data:[report]});
  return res.json({success:true,data:[],articles:[]});
 });app.use(express.static(path.join(root,'dist')));app.use((_req,res)=>res.sendFile(path.join(root,'dist/index.html')));
 try{
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1600},reducedMotion:'reduce'});page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/informes');await page.getByRole('tab',{name:/^Mercados/}).click();await page.locator('.erh-library-entry').filter({has:page.locator('strong',{hasText:report.title})}).first().click();
  await page.getByRole('region',{name:'Vista previa PDF de '+report.title,exact:true}).locator('canvas').waitFor({state:'visible',timeout:120000});await page.getByRole('button',{name:'Lectura',exact:true}).click();
  const figure=page.getByRole('figure',{name:history.title,exact:true});await figure.waitFor();assert.equal(await figure.locator('.erh-grain-trace').count(),history.series.length);assert.equal(await figure.locator('tr[data-grain-reference]').count(),history.series.length);
  assert(await figure.getByRole('button',{name:'Por producto',exact:true}).getAttribute('aria-pressed')==='true');
  assert.equal(await figure.locator('.erh-grain-group').count(),new Set(history.series.map(item=>item.grainFamily)).size);
  await figure.getByRole('button',{name:'Por país',exact:true}).click();assert.equal(await figure.locator('.erh-grain-group').count(),new Set(history.series.map(item=>item.country)).size);assert.equal(await figure.locator('.erh-grain-trace').count(),history.series.length);
  await figure.getByRole('button',{name:'Por producto',exact:true}).click();
  assert((await figure.locator('.erh-grain-sparkline').first().boundingBox()).height>=56,'The history trace is tall enough to distinguish movements');
  for(const direction of ['erh-grain-rise','erh-grain-fall']){const colors=await figure.locator('.'+direction).first().evaluate(element=>({text:getComputedStyle(element).color,background:getComputedStyle(element).backgroundColor})),a=luminance(colors.text),b=luminance(colors.background);assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,'Small percentage text keeps readable contrast in the application theme');}
  await figure.screenshot({path:path.join(output,'granos-tabla-visual.png')});
  const search=figure.getByLabel('Buscar país o referencia',{exact:true}),product=figure.getByLabel('Filtrar producto',{exact:true});
  await search.fill('México');assert.equal(await figure.locator('tr[data-grain-reference]').count(),history.series.filter(item=>item.country==='México').length);assert((await figure.innerText()).includes('Culiacán'));assert((await figure.innerText()).includes('Ciudad de México'));
  await search.clear();await product.selectOption('corn');assert.equal(await figure.locator('.erh-grain-trace').count(),history.series.filter(item=>item.grainFamily==='corn').length);
  await search.fill('sin coincidencias de prueba');await figure.getByRole('status').waitFor();assert.equal(await figure.locator('tr[data-grain-reference]').count(),0);
  await search.clear();await product.selectOption('all');await search.fill('Argentina');
  const selected=history.series.find(item=>item.country==='Argentina');const selectedButton=figure.locator('.erh-grain-reference').filter({hasText:selected.label.replace(/^\d+\.\s*/,'')});await selectedButton.click();const detail=figure.locator('.erh-grain-detail');await detail.waitFor();
  assert((await detail.innerText()).includes(selected.baseDate+' / '+selected.lastDate));assert.equal(await detail.locator('circle').count(),selected.points.length);
  assert((await detail.locator('circle title').last().textContent()).includes(selected.lastPrice.toLocaleString('es-MX',{maximumFractionDigits:3})+' '+selected.originalUnit));
  const observation=detail.getByRole('slider',{name:'Seleccionar observación histórica',exact:true});await observation.focus();await observation.press('Home');assert((await detail.locator('output').innerText()).includes(selected.points[0].date));assert((await detail.locator('output').innerText()).includes(selected.basePrice.toLocaleString('es-MX',{maximumFractionDigits:3})));
  await observation.press('ArrowRight');assert((await detail.locator('output').innerText()).includes(selected.points[1].date));await observation.press('End');assert((await detail.locator('output').innerText()).includes(selected.lastDate));
  await detail.screenshot({path:path.join(output,'granos-historia-ampliada.png')});
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await detail.screenshot({path:path.join(output,'granos-detalle-movil.png')});
  const svgWidth=Number((await detail.locator('svg').getAttribute('viewBox')).split(' ')[2]);assert(svgWidth<600,'Detail coordinates adapt to the mobile width rather than shrinking text');
  await detail.getByRole('button',{name:'Cerrar detalle',exact:true}).click();assert(await selectedButton.evaluate(element=>element===document.activeElement));await search.clear();assert.equal(await figure.locator('.erh-grain-trace').count(),history.series.length);assert((await figure.locator('.erh-grain-sparkline').first().boundingBox()).height>=56);await figure.screenshot({path:path.join(output,'granos-tabla-movil.png')});
  assert.deepEqual(errors,[]);assert.equal(JSON.stringify(report),unchanged);await fs.writeFile(path.join(output,'ui-validation.json'),JSON.stringify({references:history.series.length,allRowsPreserved:true,productFilter:true,countrySearch:true,groupByProductAndCountry:true,publishedObservationPicker:true,partialHistoryExpanded:true,originalPricesPreserved:true,mobileWidth:390,errors},null,2));console.log('Grain visual UI: complete atlas, original prices and dates, product/country filters, partial-history enlargement, desktop/mobile and unchanged evidence.');
 }catch(error){if(page){await page.screenshot({path:path.join(output,'error.png')});await fs.writeFile(path.join(output,'error.txt'),await page.locator('body').innerText());}throw error;}
 finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
})().catch(error=>{console.error(error);process.exitCode=1;});
