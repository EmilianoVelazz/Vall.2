import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {compactPrintTables,splitPrintDateTables} from '../shared/report-print-tables.mjs';
import {mapReportText} from '../shared/report-localized-text.mjs';
const identity=value=>String(value ?? '').replace(/\r?\n/g,' · ');
function cellValue(table,row,header){
 const direct=table.columns.indexOf(header);if(direct>=0)return String(row[direct] ?? '');
 for(let index=0;index<table.columns.length;index++){
  const parts=table.columns[index].split('\n'),part=parts.indexOf(header);if(part<0)continue;
  const value=String(row[index] ?? '');
  if(/^20\d{2}$/.test(header) && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]))return value.includes('\n') || value==='—' ? value : value+'\n'+parts[1];
  return value.split('\n')[part];
 }
 return undefined;
}
function preserves(original,printed){
 assert.deepEqual(new Set(printed.flatMap(table=>table.rows.map(row=>identity(row[0])))),new Set(original.flatMap(table=>table.rows.map(row=>identity(row[0])))),'Every reference remains, without inventing a row identity');
 for(const table of original){
  for(const paragraph of String(table.note || '').split(/\n{2,}/).filter(Boolean))assert(printed.some(item=>String(item.note || '').includes(paragraph)),'All original conditions remain');
  for(const row of table.rows){
   const candidates=printed.flatMap(item=>item.rows.filter(other=>identity(other[0])===identity(row[0])).map(other=>({table:item,row:other})));
   for(let column=1;column<table.columns.length;column++){
    const header=table.columns[column],value=String(row[column] ?? '');
    assert(candidates.some(item=>cellValue(item.table,item.row,header)===value || /^Unidad(?: original)?$/.test(header) && item.table.title.endsWith(' · '+value)),`Keep the exact dated fact: ${row[0]} / ${header} / ${value}`);
   }
  }
 }
}
const price={printGroup:'market-levels',printTitle:'Precios',title:'Precios',columns:['Referencia','Unidad original','Cierre anterior','Fecha anterior','Último publicado','Fecha del dato','USD','MXN'],rows:[['Pollo\nBrasil','BRL/kg','1.00001','2026-10-21','1.00002','2026-10-22','0.20001','3.75001'],['Huevo\nMéxico','MXN/kg','29.12345','2026-10-21','30.12345','2026-10-22','1.60801','30.12345']],note:'Condiciones originales de precios.'};
const returns={printGroup:'market-returns',printTitle:'Variaciones',title:'Variaciones',columns:['Referencia','Día','Semana'],rows:[['Pollo\nBrasil','↑ +0.001 %','↓ -1.234 %'],['Huevo\nMéxico','↑ +3.429 %','—']],note:'Fechas base disponibles; no se estiman observaciones.'};
const fixture=[price,returns],snapshot=JSON.stringify(fixture),joined=compactPrintTables(fixture,{joinShortChanges:true,foldCurrencies:true,inlineLabels:true});
assert.equal(joined.length,1);assert.equal(joined[0].rows.length,2);assert(joined[0].columns.includes('USD\nMXN'));preserves(fixture,joined);assert.equal(JSON.stringify(fixture),snapshot);
const localized=mapReportText({indexBaseDate:'2020-01-31',indexEndDate:'2026-10-22',indexDateNote:'Base común de la gráfica.'},text=>'Traducido '+text);assert.equal(localized.indexBaseDate,'2020-01-31');assert.equal(localized.indexEndDate,'2026-10-22');assert(localized.indexDateNote.startsWith('Traducido '));
const ambiguous=compactPrintTables([{...price,rows:[...price.rows,price.rows[0]]},returns],{joinShortChanges:true});assert.equal(ambiguous.flatMap(table=>table.rows).filter(row=>identity(row[0])==='Pollo · Brasil').length,3,'Ambiguous references are never joined');
const reports=[];
for(const [collection,file] of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']])for(const report of JSON.parse(await fs.readFile('backend/cache/'+file+'.json','utf8')).reports)reports.push({...report,collection});
reports.push(...Object.values(JSON.parse(await fs.readFile('backend/cache/annual-report-library.json','utf8')).years).flat());reports.push(...reports.filter(report=>!report.reportYear && ['equities','fx','grains','energy_metals','proteins'].includes(report.key)).map(report=>({...report,analysisPeriod:'weekly'})));
let facts=0,dateGroups=0;
for(const report of reports){
 const tables=weeklyReport(report).results,before=JSON.stringify(tables);
 for(const options of [{inlineLabels:true},{columnDates:true,inlineLabels:true},{joinShortChanges:true,foldCurrencies:true,inlineLabels:true}])preserves(tables,compactPrintTables(tables,options));
 const split=tables.flatMap(table=>{const parts=splitPrintDateTables(table);if(parts.length>1)dateGroups++;return parts;});preserves(tables,compactPrintTables(split,{columnDates:true,inlineLabels:true}));
 assert.equal(JSON.stringify(tables),before,'Print changes never modify the reader, workbook or evidence');facts+=tables.reduce((sum,table)=>sum+table.rows.length*(table.columns.length-1),0);
}
const dated={title:'Calendarios publicados · simulación',printDateColumns:true,columns:['Referencia','2020','2021'],rows:Array.from({length:8},(_,index)=>['Serie '+index,(index+1)+'\n2020-12-'+(index<4 ? '30' : '31'),(index+2)+'\n2021-12-'+(index<4 ? '30' : '31')])};
const datedParts=splitPrintDateTables(dated);assert.equal(datedParts.length,2,'Different calendars are tested independently of the current cache');preserves([dated],compactPrintTables(datedParts,{columnDates:true}));
console.log(`Print preservation: OK · ${reports.length} models, ${facts} exact cells, ${dateGroups} cached date groups, dates and exceptions, units, currencies, precision, unique joins and immutable evidence.`);
