import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { weeklyReport } from '../shared/report-weekly.mjs';

const require=createRequire(import.meta.url),express=require('express'),{chromium}=require('playwright');
const library=JSON.parse(await fs.readFile('backend/cache/annual-report-library.json','utf8'));
const daily={};
for(const [area,file] of [['finance','finance_executive_reports.json'],['markets','market_executive_reports.json'],['mexico','mexico-executive-reports.json']]) {
  daily[area]=JSON.parse(await fs.readFile('backend/cache/'+file,'utf8')).reports;
}
const output='output/diseno-informes';await fs.mkdir(output,{recursive:true});
const app=express();app.use('/api',(req,res)=>{
  if(req.path==='/verify-token')return res.json({success:true,email:'fixture@example.invalid'});
  if(req.path==='/profile')return res.json({success:true,profile:{email:'fixture@example.invalid',preferences:{}}});
  if(req.path==='/annual-reports')return res.json({success:true,data:library.years[req.query.year],year:Number(req.query.year)});
  for(const [area,endpoint] of [['finance','finance-executive-reports'],['markets','market-executive-reports'],['mexico','mexico-executive-reports']]) {
    if(req.path===('/'+endpoint))return res.json({success:true,data:daily[area]});
  }
  return res.json({success:true,data:[],articles:[]});
});
app.use('/assets',express.static(path.resolve('assets')));
app.use(express.static(path.resolve('frontend/dist')));
app.use((req,res)=>res.sendFile(path.resolve('frontend/dist/index.html')));
let server,browser;const errors=[],measurements=[];
try {
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/informes?seccion=libreria`);
  const navigation=page.getByRole('navigation',{name:'Secciones del centro de informes'});
  const archive=page.getByRole('region',{name:'Librería de informes anuales'});
  await archive.locator('.reports-archive-paper').waitFor();
  const check=async(root,label)=>{
    const grid=root.locator('.erh-market-visual-grid');
    if(!await grid.count())return;
    // ResizeObserver + requestAnimationFrame pueden necesitar dos ciclos al cambiar de edición.
    await grid.locator(':scope > :first-child').waitFor();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
    const result=await grid.evaluate(element=>{
      const box=element.getBoundingClientRect(),cards=[...element.children].map(card=>{
        const r=card.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
      });
      const overlaps=[];
      for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){
        const a=cards[i],b=cards[j];
        if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1)overlaps.push([i,j]);
      }
      const packed=getComputedStyle(element).gridAutoRows==='4px';
      let rowsHeight=0;
      for(let i=0;i<cards.length;i+=2)rowsHeight+=Math.max(cards[i].height,cards[i+1]?.height || 0)+(i ? 16 : 0);
      const narrowBars=[...element.querySelectorAll('.erh-bar-chart')].filter(card=>card.clientWidth<400).every(card=>{
        const row=card.querySelector('.erh-bar-row'),track=row?.querySelector('.erh-bar-track');
        if(!track)return true;
        return track.getBoundingClientRect().width>=row.getBoundingClientRect().width*.95;
      });
      return {cards,overlaps,packed,height:box.height,rowsHeight,narrowBars,
        contained:cards.every(card=>card.x>=box.x-1 && card.right<=box.right+1 && card.bottom<=box.bottom+1),
        overflow:document.documentElement.scrollWidth>innerWidth+1,
        columns:getComputedStyle(element).gridTemplateColumns.split(' ').length};
    });
    assert(!result.overflow,label+': sin desbordamiento de página');
    assert(result.contained,label+': todas las tarjetas dentro de la sección');
    assert.deepEqual(result.overlaps,[],label+': gráficas sin superponerse');
    assert(result.cards.every(card=>card.width>=200),label+': ancho legible');
    assert(result.columns<=2,label+': máximo dos columnas');
    assert(result.narrowBars,label+': en tarjetas estrechas la barra conserva todo el ancho');
    measurements.push({label,...result,cards:result.cards.length});
  };
  for(const year of [2022,2023,2024,2025]) {
    await archive.getByRole('group',{name:'Año del informe'}).getByRole('button',{name:new RegExp(String(year))}).click();
    for(const [area,label] of [['finance','Finanzas'],['markets','Mercados'],['mexico','México']]) {
      await archive.getByRole('group',{name:'Familia de la librería anual'}).getByRole('button',{name:new RegExp(label)}).click();
      for(const report of library.years[year].filter(report=>report.collection===area)) {
        await archive.locator('.reports-archive-book').filter({hasText:report.title.split(' · ')[0]}).click();
        await check(archive,`${year}/${area}/${report.key}`);
        assert.equal(await archive.locator('.erh-market-visual-grid>figure,.erh-market-visual-grid>.erh-visual-panel').count(),weeklyReport(report).visuals.length);
      }
    }
  }
  await archive.getByRole('group',{name:'Familia de la librería anual'}).getByRole('button',{name:/Finanzas/}).click();
  await archive.locator('.reports-archive-book').filter({hasText:'Bolsa'}).click();
  for(const width of [1440,768,390,320]) {
    await page.setViewportSize({width,height:1050});await check(archive,`anual/${width}`);
    const grid=archive.locator('.erh-market-visual-grid');
    const method=grid.locator('details').first();
    await method.locator('summary').click();await check(archive,`anual/abierto/${width}`);
    await method.locator('summary').click();await check(archive,`anual/cerrado/${width}`);
    if(width===1440 || width===390){await grid.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/anual-${width}.png`});}
  }
  await page.setViewportSize({width:1440,height:1050});
  await navigation.getByRole('button',{name:/Informes diarios/}).click();
  const workspace=page.getByRole('region',{name:'Espacio de trabajo de informes'});
  for(const [area,label] of [['finance','Finanzas'],['markets','Mercados'],['mexico','México']]) {
    await workspace.getByRole('tab',{name:new RegExp(label)}).click();
    for(const report of daily[area]) {
      await workspace.locator('.erh-book').filter({hasText:report.title}).click();
      await check(workspace,`diario/${area}/${report.key}`);
    }
  }
  await workspace.getByRole('tab',{name:/Mercados/}).click();
  await workspace.locator('.erh-book').filter({hasText:'Mercado de proteínas'}).click();
  for(const width of [1440,768,390,320]) {
    await page.setViewportSize({width,height:1050});await check(workspace,`diario/proteínas/${width}`);
    const grid=workspace.locator('.erh-market-visual-grid');
    if(width===1440 || width===390){await grid.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/diario-${width}.png`});}
    const causes=workspace.locator('.erh-block-sessionContext,.erh-block-causes').first();
    assert(await grid.evaluate((node,other)=>Boolean(node.compareDocumentPosition(other)&Node.DOCUMENT_POSITION_FOLLOWING),await causes.elementHandle()));
  }
  await workspace.getByRole('tab',{name:/Finanzas/}).click();
  for(const key of ['fx','bonds']) {
    await workspace.locator('.erh-book').filter({hasText:daily.finance.find(report=>report.key===key).title}).click();
    for(const width of [1440,390,320]) {
      await page.setViewportSize({width,height:1050});await check(workspace,`diario/${key}/${width}`);
    }
    const legend=workspace.locator('.erh-chart-legend button').first();
    if(await legend.count()) {
      await legend.click();assert.equal(await legend.getAttribute('aria-pressed'),'true');
      await check(workspace,`diario/${key}/resaltado`);
      await legend.click();assert.equal(await legend.getAttribute('aria-pressed'),'false');
    }
  }
  assert(measurements.some(item=>item.packed && item.height<item.rowsHeight-40),'La distribución reduce huecos respecto a filas de altura uniforme');
  assert.deepEqual(errors,[]);
  await fs.writeFile(`${output}/mediciones.json`,JSON.stringify(measurements,null,2));
  console.log(`Diseño: OK · 56 ediciones anuales, 14 diarios, 320/390/768/1440 px, tarjetas sin superposición, controles desplegables y causas después de gráficas. ${measurements.length} verificaciones de distribución.`);
} finally {
  await browser?.close();
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
