import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {reportAnnex} from '../frontend/src/lib/reportLibrary.js';
import {reportCsv} from '../frontend/src/lib/reportCsv.js';
const require=createRequire(import.meta.url),express=require('express'),{chromium}=require('playwright');
const read=async name=>JSON.parse(await fs.readFile('backend/cache/'+name,'utf8'));
const finance=(await read('finance_executive_reports.json')).reports,markets=(await read('market_executive_reports.json')).reports,annual=await read('annual-report-library.json');
const fx=finance.find(report=>report.key==='fx'),energy=markets.find(report=>report.key==='energy_metals');
const provenance=reportAnnex(fx).tables.find(table=>table.title==='Procedencia y alcance de cada referencia');
assert(provenance.rows.some(row=>row.includes('BCE · tipos de cambio de referencia')));
assert(provenance.rows.some(row=>row.includes('Banco de Canadá · promedio diario USD/CAD')));
const csv=reportCsv(fx,{extraTables:[provenance]});assert(csv.includes(provenance.title) && csv.includes('Banco de Canadá'));
assert(energy.sourceSnapshot.energy.some(item=>item.provider==='eia' && item.series.length));
for(const year of [2022,2023,2024,2025]) {
 const reports=annual.years[year];
 assert(reports.find(report=>report.key==='energy_metals').sourceLinks.some(item=>item.url.includes('eia.gov')));
 assert(reports.find(report=>report.key==='equities').sourceLinks.some(item=>item.url.includes('moex.com')));
}
const app=express();app.use('/api',(req,res)=>{
 if(req.path==='/verify-token')return res.json({success:true,email:'fixture@example.invalid'});
 if(req.path==='/profile')return res.json({success:true,profile:{email:'fixture@example.invalid',preferences:{}}});
 if(req.path==='/finance-executive-reports')return res.json({success:true,data:finance});
 if(req.path==='/market-executive-reports')return res.json({success:true,data:markets});
 return res.json({success:true,data:[]});
});app.use('/assets',express.static(path.resolve('assets')));app.use(express.static(path.resolve('frontend/dist')));app.use((req,res)=>res.sendFile(path.resolve('frontend/dist/index.html')));
let server,browser;
try {
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());
 await page.goto(`http://127.0.0.1:${server.address().port}/informes?seccion=anexos`);
 const annex=page.getByRole('region',{name:'Anexos de los informes'});
 await annex.getByLabel('Informe',{exact:true}).selectOption('fx');
 const sources=annex.locator('.reports-source-list');
 await sources.getByRole('link',{name:/Banco de Canadá/}).waitFor();assert(await sources.getByRole('link',{name:/BCE/}).count()>0);
 const table=annex.locator('.reports-annex-table').filter({has:page.getByRole('heading',{name:'Procedencia y alcance de cada referencia',exact:true})});
 assert.equal(await table.locator('tbody tr').count(),fx.sourceSnapshot.fxHistories.length);
 const event=page.waitForEvent('download');await annex.getByRole('button',{name:'Descargar tablas CSV'}).click();
 const downloaded=await event;assert((await fs.readFile(await downloaded.path(),'utf8')).includes('Procedencia y alcance de cada referencia'));
 await fs.mkdir('output/fuentes-publicas',{recursive:true});
 await sources.scrollIntoViewIfNeeded();await page.screenshot({path:'output/fuentes-publicas/anexos-divisas.png'});
 await annex.getByLabel('Familia',{exact:true}).selectOption('markets');
 await annex.getByLabel('Informe',{exact:true}).selectOption('energy_metals');
 await sources.getByRole('link',{name:/WTI físico/}).waitFor();assert.equal(await sources.getByRole('link',{name:/EIA/}).count(),3);
 for(const width of [1440,390]){await page.setViewportSize({width,height:1050});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await sources.scrollIntoViewIfNeeded();await page.screenshot({path:'output/fuentes-publicas/anexos-energia-movil.png'});
 assert.deepEqual(errors,[]);console.log('Fuentes en pantalla: OK · bancos centrales y EIA, procedencia por referencia, CSV completo, históricos 2022–2025 y móvil.');
}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
