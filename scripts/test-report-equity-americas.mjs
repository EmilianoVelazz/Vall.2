import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {equityHistoryChart} from '../shared/report-equity-history-chart.mjs';
import {equityCountry,equityRegion,equityRegionSeries,equityRegionalGroups,equityRegionalLabel} from '../shared/report-equity-regions.mjs';
import {mapReportText} from '../shared/report-localized-text.mjs';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const require=createRequire(import.meta.url);process.env.NODE_ENV='test';process.env.JWT_SECRET='equity-americas-isolated-fixture-at-least-32-bytes';process.env.USER_PASSWORD='';process.env.VALL_AUTH_PASSWORD='';
const points=[{date:'2020-01-02',value:100},{date:'2026-11-10',value:120}];
const input=[{label:'S&P 500',region:'América',country:'Estados Unidos'},{label:'S&P/TSX Composite',region:'América',country:'Canadá'},{label:'IPC',symbol:'^MXX',region:'México',country:'México'},{label:'Ibovespa',region:'América',country:'Brasil'},{label:'S&P Merval',region:'América',country:'Argentina'},{label:'S&P IPSA',region:'Otras plazas',country:'Chile'},{label:'MSCI COLCAP',country:'Colombia'},{label:'S&P/BVL Perú General',country:'Perú'},{label:'DAX 40',region:'Europa',country:'Alemania'}].map(item=>({...item,points})),before=JSON.stringify(input),all=equityHistoryChart({series:input}),groups=equityRegionalGroups(all.series),america=groups.find(item=>item.label==='América');
assert.equal(america.series.length,8);assert.deepEqual(america.series.slice(0,6).map(equityCountry),['México','Brasil','Argentina','Chile','Colombia','Perú']);assert(america.series.some(item=>item.country==='Estados Unidos'));assert(america.series.some(item=>item.country==='Canadá'));
assert.equal(equityRegion({label:'S&P/BMV IPC'}),'América');assert.equal(equityRegionSeries(input,'Latinoamérica').length,6);assert.equal(equityRegionSeries(input,'América').length,8);assert.equal(equityRegionSeries(input,'Europa').length,1);
for(const item of america.series){assert.strictEqual(item,all.series.find(original=>original.label===item.label));assert.deepEqual(item.points,points);assert(equityRegionalLabel(item).includes(equityCountry(item)));}
const translated=mapReportText({...input[2],equityCountry:'México',equityRegion:'América'},value=>'translated:'+value);assert.equal(equityCountry(translated),'México');assert.equal(equityRegion(translated),'América');assert.equal(JSON.stringify(input),before);
const source={...JSON.parse(await fs.readFile('backend/cache/finance_executive_reports.json','utf8')).reports.find(item=>item.key==='equities'),collection:'finance'},original=JSON.stringify(source),model=weeklyReport(source),regional=equityRegionalGroups(equityHistoryChart(model.equityExecutive.globalHistory).series).find(item=>item.label==='América');
assert(regional.series.some(item=>equityCountry(item)==='México'),'The real cut includes the IPC in Americas');assert(regional.series.some(item=>equityCountry(item)==='Brasil'),'The real cut includes Ibovespa');
const {_test}=require('../backend/routes/export'),bytes=await _test.makeExecutivePdf(source.title,source),task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise;let text='';
try{assert(pdf.numPages<=4);for(let index=1;index<=pdf.numPages;index++){const page=await pdf.getPage(index),items=(await page.getTextContent()).items;const content=items.map(item=>item.str).join(' ');if(content.includes('Comparativas regionales'))text=content;for(const item of items.filter(item=>item.str.trim()))assert(item.transform[4]>=18 && item.transform[4]+item.width<=page.view[2]-16,'Text stays inside the sheet: '+item.str);}
assert(text.includes('México y Latinoamérica'));assert(text.includes('México · S&P/BMV IPC'));assert(text.includes('Brasil · Ibovespa'));assert(text.includes('Estados Unidos ·'));assert(text.indexOf('México · S&P/BMV IPC')<text.indexOf('Estados Unidos ·'));assert.equal(JSON.stringify(source),original);
await fs.mkdir('output/pdf/identidad-vallnews',{recursive:true});await fs.writeFile('output/pdf/identidad-vallnews/VALLNEWS-Bolsa-America-y-Latinoamerica.pdf',bytes);
}finally{await task.destroy();}
console.log('PASS Americas equity chart: Mexico + six LatAm markets supported, US/Canada retained, country legends, immutable dates/values/colors, localized grouping and real four-page PDF');
