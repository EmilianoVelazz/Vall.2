import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {proteinPrintTables} from '../shared/report-protein-print-layout.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {executivePrintEdition} from '../shared/report-print-edition.mjs';

const fixture={proteinComparisonTable:true,title:'Estados Unidos · comparación',columns:['País / referencia','Precio publicado','Unidad original','Fecha del dato','Día anterior · %'],note:'Metodología compartida.',rows:[['Estados Unidos\nCerdo · Estados Unidos',0,'USD/kg','2026-11-04','→ 0 %\nBase: 2026-11-03'],['Estados Unidos\nProducto de Estados Unidos · USDA, Estados Unidos',12,'USD/kg','2026-11-04','↑ +2 %\nBase: 2026-11-03']]};
const mixed={...fixture,title:'América',rows:[['México\nCerdo · México',10,'MXN/kg','2026-11-03','→ 0 %'],['Perú\nCerdo · Perú',20,'PEN/kg','2026-11-04','↑ +2 %']]};
const other={title:'Otra sección',columns:['Referencia','Valor'],rows:[['Intacto',0]],note:'Nota independiente.'};
const original=JSON.stringify([fixture,mixed,other]),[single,multi,unchanged]=proteinPrintTables([fixture,mixed,other]);
assert.deepEqual(single.columns,['Referencia','Precio publicado','Día anterior · %\nBase: 2026-11-03']);
assert.deepEqual(single.rows,[['Cerdo',0,'→ 0 %'],['Producto de Estados Unidos · USDA',12,'↑ +2 %']]);
assert(single.note.includes('USD/kg') && single.note.includes('2026-11-04') && single.note.includes(fixture.note));
assert.deepEqual(multi.columns,mixed.columns,'Different units and dates must remain on individual rows');
assert.deepEqual(multi.rows.map(row=>row[0]),['México\nCerdo','Perú\nCerdo']);
assert(!multi.note.includes(fixture.note),'An identical methodological note appears once');
assert.strictEqual(unchanged,other,'Other reports and table types are untouched');
assert.equal(JSON.stringify([fixture,mixed,other]),original,'Canonical identities and evidence are immutable');
assert.equal(proteinPrintTables([{...fixture,rows:[fixture.rows[0]]}])[0].columns.length,fixture.columns.length,'A single-row table gains no redundant caption');

process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const require=createRequire(import.meta.url),{_test}=require('../backend/routes/export');
const report=JSON.parse(await fs.readFile('backend/cache/market_executive_reports.json','utf8')).reports.find(item=>item.key==='proteins');
const directory='output/proteinas-espacios-20261104';await fs.mkdir(directory,{recursive:true});
const compact=text=>String(text).replace(/\s+/g,'');
for(const [name,input] of [['diario',report],['semanal',{...report,analysisPeriod:'weekly'}]]){
 const model=weeklyReport(input),edition=executivePrintEdition(model,{rows:120,charts:4,selectPrices:true}),before=JSON.stringify(edition),tables=proteinPrintTables(edition.results);
 assert.equal(tables.reduce((sum,table)=>sum+table.rows.length,0),edition.results.reduce((sum,table)=>sum+table.rows.length,0),'Layout preserves every selected observation');
 for(const [index,table] of edition.results.entries())for(const row of table.rows)for(const value of row.slice(1)){
  for(const part of String(value).split('\n'))assert(compact([...tables[index].columns,...tables[index].rows.flat(),tables[index].note].join(' ')).includes(compact(part)),'Prices, dates, units and bases remain visible: '+part);
 }
 assert.equal(JSON.stringify(edition),before);
 const bytes=await _test.makeExecutivePdf(input.title,input),task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise;
 assert(pdf.numPages<=6,'All horizons fit the authorized six-page limit without shrinking text');
 const usage=[];let text='';
 for(let number=1;number<=pdf.numPages;number++){
  const page=await pdf.getPage(number),items=(await page.getTextContent()).items.filter(item=>item.str.trim());
  for(const item of items){assert(item.transform[4]>=24 && item.transform[4]+item.width<=page.view[2]-22,'No horizontal clipping');assert(item.transform[5]>=42,'No footer collision');}
  const body=items.filter(item=>item.transform[5]<760 && item.transform[5]>80 && !/^(PAGINA|USO INTERNO)/.test(item.str));
  const end=page.view[3]-Math.min(...body.map(item=>item.transform[5]));usage.push(Math.round((end-80)/(764-80)*100));
  assert(end>500,'No nearly empty final sheet');
  if(number>1){const lines=[...new Set(body.map(item=>Math.round(page.view[3]-item.transform[5])))].sort((a,b)=>a-b);assert(Math.max(...lines.slice(1).map((line,index)=>line-lines[index]))<85,'No large internal holes between tables');}
  text+=items.map(item=>item.str).join(' ')+' ';
 }
 for(const label of ['México','Estados Unidos','Canadá','Brasil','Argentina','Chile','Colombia','Perú','Mercolleida','USDA','CME','2020'])assert(text.includes(label),'Protected coverage retained: '+label);
 assert(usage.slice(0,-1).every(percent=>percent>=80),'Intermediate sheets use their body area: '+usage);
 await fs.writeFile(directory+'/'+name+'.pdf',bytes);await task.destroy();console.log(name+': '+pdf.numPages+' pages; body depth '+usage.join('/')+'%.');
}
console.log('Protein print layout: all rows, prices, dates, units, bases and zero values retained; shared facts printed once; immutable originals; no clipping or large internal holes.');
