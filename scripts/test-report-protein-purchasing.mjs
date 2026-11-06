import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {proteinUsdPerKg,preferredProteinReferences,proteinCommercialStage} from '../shared/report-protein-purchasing.mjs';
import {safeProteinFundamentals} from '../shared/report-protein-fundamentals.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {focusedEvidence} from '../shared/report-market-analysis.mjs';
import {createReportDraft} from '../frontend/src/lib/reportCreation.js';
import {proteinSpeciesPriceCharts,proteinSpeciesPriceTables} from '../shared/report-protein-species-charts.mjs';
import {filteredReportModel} from '../shared/report-view-filters.mjs';
const require=createRequire(import.meta.url);process.env.NODE_ENV='test';process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const cutoff='2026-11-05T23:59:59Z',fx={base:'USD',rates:{USD:1,MXN:20,EUR:.9,BRL:5,CAD:1.4},observedAt:'2026-11-05T00:00:00Z',source:'SIMULACIÓN',url:'https://example.invalid/fx'};
const quote=(unit='USD/100 lb',extra={})=>({symbol:'AMS-PORK-CUTOUT',label:'Canal porcina · Estados Unidos',country:'Estados Unidos',cadence:'daily',basis:'Cutout de canal; no ganado vivo',unit,quoteStatus:'verified',last:{date:'2026-11-04',value:100},...extra});
assert(Math.abs(proteinUsdPerKg(quote(),null,cutoff).value-2.2046226218487757)<1e-10);
assert(Math.abs(proteinUsdPerKg(quote('US¢/lb'),null,cutoff).value-2.2046226218487757)<1e-10);
assert.equal(proteinUsdPerKg(quote('BRL/arroba (15 kg)',{last:{date:'2026-11-04',value:300}}),fx,cutoff).value,4);
assert(Math.abs(proteinUsdPerKg(quote('EUR/kg vivo',{basis:'Cerdo cebado en vivo',label:'Cerdo normal',last:{date:'2026-11-04',value:1.35}}),fx,cutoff).value-1.5)<1e-10);
assert.equal(proteinCommercialStage(quote('EUR/kg vivo',{basis:'Cerdo cebado en vivo',label:'Cerdo normal'})),'Animal vivo');
assert.equal(proteinCommercialStage(quote('CLP/kg',{label:'Pollo entero',basis:'Precio minorista en canal tradicional'})),'Venta al público','A retail distribution channel is not a carcass');
assert.equal(proteinCommercialStage(quote('USD/100 lb',{basis:'Valor cutout de ventas negociadas de canal; no ganado vivo ni precio minorista'})),'Canal','A negated retail qualifier must not discard USDA wholesale cutout');
assert.equal(proteinUsdPerKg(quote('CLP/kg',{label:'Pollo entero',basis:'Precio minorista en canal tradicional'}),fx,cutoff),null);
assert.equal(proteinCommercialStage(quote('MXN/kg',{label:'Huevo blanco',basis:'Huevo de mayoreo'})),'Huevo con cáscara');
assert.equal(proteinUsdPerKg(quote('MXN/kg',{label:'Huevo blanco',basis:'Huevo de mayoreo'}),fx,cutoff).value,5,'An actual kilogram egg price requires no assumed egg weight');
for(const unit of ['USD/docena','EUR/cabeza','BRL/caja (30 doc.)','USD/kg inventado'])assert.equal(proteinUsdPerKg(quote(unit),fx,cutoff),null);
for(const extra of [{quoteStatus:'reference',evidenceOrigin:'catalog'},{symbol:'HE=F'},{last:{date:'2026-11-06',value:100}},{last:{date:'2020-01-02',value:100}}])assert.equal(proteinUsdPerKg(quote('USD/100 lb',extra),fx,cutoff),null);
assert.equal(proteinUsdPerKg(quote('MXN/kg'),{...fx,observedAt:'2026-10-20'},cutoff),null);
const catalog=quote('USD/100 lb',{symbol:'MERCO-US-USDA-PORK-CUTOUT',evidenceOrigin:'catalog',quoteStatus:'reference'});
assert.deepEqual(preferredProteinReferences([catalog,quote()]).selected,[quote()]);assert.equal(preferredProteinReferences([catalog,quote('USD/100 lb',{quoteStatus:'unavailable'})]).discarded.length,0);
const fundamental={sector:'Vacuno',text:'SIMULACIÓN de perspectiva, no una noticia diaria.',publishedAt:'2026-10-19',source:'USDA ERS',url:'https://www.ers.usda.gov/topics/animal-products/cattle-beef/market-outlook'};
assert.equal(safeProteinFundamentals([fundamental],cutoff).length,1);for(const extra of [{publishedAt:'2026-11-06'},{publishedAt:'2026-01-01'},{url:'https://example.invalid/fake'}])assert.equal(safeProteinFundamentals([{...fundamental,...extra}],cutoff).length,0);
const {loadProteinFundamentals,parseProteinFundamental,sources}=require('../backend/lib/report-protein-fundamentals');
assert.throws(()=>parseProteinFundamental('Updated: 10/19/2026 Report Summary: unsupported narrative',sources[0],cutoff));
for(const size of [1,2,3]){
 const ref={...quote(),sector:'Huevo',symbol:'USDA-EGG-NATIONAL-INDEX',unit:'US¢/docena',basis:'Índice móvil ponderado de cinco días',points:[{date:'2026-11-03',value:40},{date:'2026-11-04',value:41},{date:'2026-11-05',value:42}].slice(0,size)};
 const before=JSON.stringify(ref),[chart]=proteinSpeciesPriceCharts([ref]);assert.equal(chart.type,size<3 ? 'bar' : 'line');assert(chart.note.includes('Índice móvil de cinco días'));assert.equal(proteinSpeciesPriceTables([ref])[0].rows.length,size);assert.equal(JSON.stringify(ref),before);
 assert.equal(proteinSpeciesPriceCharts([{...ref,evidenceOrigin:'catalog'}]).length,0,'Catalog prices cannot displace the physical price panel');
}
if(process.argv.includes('--local')){
 const folder='output/proteinas-compras-20261105';fs.mkdirSync(folder,{recursive:true});
 const {composeMarketOverview}=require('../backend/lib/report-market-overview'),snapshot=JSON.parse(fs.readFileSync('backend/cache/market_executive_reports.json')),report=composeMarketOverview(snapshot).reports.find(item=>item.key==='proteins');
 if(process.argv.includes('--live')){
  report.proteinFundamentals=await loadProteinFundamentals({cutoff:report.generatedAt,previous:report.proteinFundamentals});
  report.marketFx=await require('../backend/lib/report-market-context').loadReportMarketFx({cutoff:report.generatedAt,previous:report.marketFx});
  assert.equal(report.proteinFundamentals.length,3,'Three official dated USDA outlooks are recognized');
  fs.writeFileSync(folder+'/fundamentales.json',JSON.stringify(report.proteinFundamentals,null,2));fs.writeFileSync(folder+'/divisas.json',JSON.stringify(report.marketFx,null,2));
 }else{
  if(fs.existsSync(folder+'/fundamentales.json'))report.proteinFundamentals=JSON.parse(fs.readFileSync(folder+'/fundamentales.json'));
  if(fs.existsSync(folder+'/divisas.json'))report.marketFx=JSON.parse(fs.readFileSync(folder+'/divisas.json'));
 }
 const original=JSON.stringify(report),model=weeklyReport(report),main=JSON.stringify(model.results);
 for(const analysisPeriod of ['daily','weekly']){
  const hidden=weeklyReport({...report,analysisPeriod,personalization:{sections:{charts:false}}});
  assert.deepEqual(hidden.visuals,[],'Desactivar gráficas excluye también la comparación de cerdo y alimento');
  assert.equal(hidden.commodityExecutive.chartCount,0);assert(!hidden.blocks.some(block=>block.key==='charts'));assert(hidden.results.length>0,'Las tablas de precios siguen disponibles');
 }
 assert(model.proteinPurchasing);assert.equal(model.references.some(item=>item.symbol==='MERCO-US-USDA-PORK-CUTOUT'),false);assert.equal(model.references.some(item=>item.symbol==='MERCO-MX-SNIIM-EGG'),false);
 assert(!main.includes('Carne de cerdo en canal (cutout) · USDA'));assert(!main.includes('Huevo blanco mayoreo · SNIIM'));
 assert(model.results.some(table=>table.proteinUsdMatrix));assert(model.results.some(table=>table.proteinFeedTable && table.rows.length===3));
 assert(model.results.find(table=>table.proteinUsdMatrix).rows.some(row=>row[0]==='Porcino · Estados Unidos' && row[1].includes('cutout negociado')),'The direct US cutout remains in the USD/kg purchasing matrix');
 assert(model.visuals.some(chart=>chart.commodityWindow==='feed' && chart.series.length===3));
 assert(model.visuals.find(chart=>chart.proteinMercolleida && chart.requiredInPrint).series.some(series=>series.label.includes('Cerdo cebado normal')));
 assert(model.results.filter(table=>table.proteinSectorBoard).length===4);
 for(const sector of ['Porcino','Vacuno','Huevo']){assert(model.visuals.some(chart=>chart.proteinSpecies===sector && chart.requiredInPrint));assert(model.results.some(table=>table.proteinSpeciesPrices && table.proteinSpecies===sector));}
 const usa=filteredReportModel(model,report,{country:'Estados Unidos'});assert.equal(usa.visuals.filter(chart=>chart.proteinSpecies).length,3);assert.equal(usa.results.filter(table=>table.proteinSpeciesPrices).length,3,'Filtering by country uses the reference identity, not date labels');
 assert.equal(filteredReportModel(model,report,{country:'México'}).visuals.filter(chart=>chart.proteinSpecies).length,0,'US physical panels do not leak into a Mexican filter');
 assert.equal(focusedEvidence(report).proteinFeed.length,2);
 const saved=require('../backend/services/user-report-store').normalizeReport(createReportDraft('markets',report).report),savedModel=weeklyReport(saved);
 assert.equal(saved.proteinFeed.length,2);assert.equal(saved.proteinFundamentals.length,report.proteinFundamentals.length);assert.deepEqual(savedModel.results,model.results);
 const {_test}=require('../backend/routes/export'),{getDocument}=await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs'),stats=[];
 for(const analysisPeriod of ['daily','weekly']){
  const bytes=await _test.makeExecutivePdf(report.title,{...report,analysisPeriod}),task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise;assert(pdf.numPages<7);let text='';
  for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),items=(await page.getTextContent()).items.filter(item=>item.str.trim());assert(items.length>10);for(const item of items){assert(item.transform[4]>=24 && item.transform[4]+item.width<=page.view[2]-22,item.str);assert(item.transform[5]>=42,item.str);}text+=items.map(item=>item.str).join(' ')+' ';}
  for(const phrase of ['USD/kg','Cerdo cebado normal','2020','harina de soya','Sector porcino global','Sector vacuno global','Avícola y procesados','Huevo · precios por mercado','Cerdo frente a maíz y harina de soya','Cerdo · precios físicos publicados','Res · precios físicos publicados','Huevo · precios físicos publicados','Cerdo · últimas publicaciones de precios','Res · últimas publicaciones de precios','Huevo · últimas publicaciones de precios'])assert(text.includes(phrase),phrase);
  if(model.references.some(item=>item.symbol==='LH0'))assert(text.includes('China') && text.includes('Frente a 2022'),'The observed Chinese price comparison survives the compact edition');
  assert(!text.includes('Cerda de desvieje'));
  const headings=['1 · Lectura ejecutiva','2 · Tablas y comparaciones','3 · Comparativas e historia','4 · Participación y coberturas'].map(label=>text.toLocaleLowerCase('es').indexOf(label.toLocaleLowerCase('es')));assert(headings.every((index,i)=>index>=0 && (!i || index>headings[i-1])),JSON.stringify(headings));
  fs.writeFileSync(folder+'/proteinas-'+analysisPeriod+'.pdf',bytes);stats.push({analysisPeriod,pages:pdf.numPages,bytes:bytes.length});await task.destroy();
 }
 assert.equal(JSON.stringify(report),original);fs.writeFileSync(folder+'/validacion.json',JSON.stringify({references:model.references.length,discarded:model.annexTables.find(table=>table.title==='Referencias de respaldo desplazadas por fuentes directas')?.rows.length || 0,results:model.results.map(table=>({title:table.title,rows:table.rows.length})),stats},null,2));console.log(stats);
}
console.log('Protein purchasing: unit conversion, stage separation, safe FX and dates, direct-source priority, dated fundamentals, same-period OI interpretation and source preservation.');
