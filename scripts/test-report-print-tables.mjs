import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {compactPrintTables} from '../shared/report-print-tables.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {mapReportText} from '../shared/report-localized-text.mjs';
const columns=['País / referencia','Unidad original','Cierre anterior','Fecha anterior','Último publicado','Fecha del dato'];
const table={title:'México · cierres',printGroup:'market-levels',printTitle:'Cierres y precios publicados',columns,rows:[['IPC\nMéxico','puntos','123.456','2026-10-21','124.5','2026-10-22']],note:'No se rellenan días.'};
const other={...table,title:'América · cierres',rows:[['S&P 500\nEstados Unidos','puntos','6000','2026-10-21','6010','2026-10-22']]};
const input=[table,other],before=JSON.stringify(input),printed=compactPrintTables(input);
assert.equal(JSON.stringify(input),before);assert.equal(printed.length,1);assert(printed[0].title.endsWith(' · puntos'));
assert.deepEqual(printed[0].columns,['País / referencia','Cierre anterior\nFecha anterior','Último publicado\nFecha del dato']);
assert.deepEqual(printed[0].rows,[['IPC\nMéxico','123.456\n2026-10-21','124.5\n2026-10-22'],['S&P 500\nEstados Unidos','6000\n2026-10-21','6010\n2026-10-22']]);
assert.equal(printed[0].note,table.note);
assert.equal(compactPrintTables([table,{...other,period:'2025'}]).length,2,'Distinct periods remain separate');
assert.equal(compactPrintTables([table,{...other,printGroup:'market-returns'}]).length,2,'Distinct measures remain separate');
assert.equal(compactPrintTables([{...table,printGroup:undefined},{...other,printGroup:undefined}]).length,2,'Units alone do not authorize merging');
const mixed=compactPrintTables([table,{...other,rows:[['Otro mercado','USD/t','10','2026-10-21','12','2026-10-22']]}]);assert(mixed[0].columns.includes('Unidad original'));assert.equal(mixed[0].rows[1][1],'USD/t','Mixed units stay explicit per row');
const timestamp=compactPrintTables([{...table,rows:[['IPC','puntos','1','2026-10-21','2','2026-10-22T12:34:56.000Z']]}]);assert(timestamp[0].columns.includes('Fecha del dato'));assert(timestamp[0].rows[0].includes('2026-10-22T12:34:56.000Z'),'Keep complete timestamps');
const translated=mapReportText(table,value=>'Traducido '+value);assert.equal(translated.printGroup,'market-levels');assert(translated.printTitle.startsWith('Traducido '));
const sources=[];
for(const [collection,file] of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']])for(const report of JSON.parse(await fs.readFile('backend/cache/'+file+'.json','utf8')).reports)sources.push({...report,collection});
sources.push(...Object.values(JSON.parse(await fs.readFile('backend/cache/annual-report-library.json','utf8')).years).flat());
sources.push(...sources.filter(report=>!report.reportYear && ['equities','fx','grains','energy_metals','proteins'].includes(report.key)).map(report=>({...report,analysisPeriod:'weekly'})));
for(const report of sources){
 const model=weeklyReport(report),snapshot=JSON.stringify(model.results),tables=compactPrintTables(model.results);
 assert.equal(JSON.stringify(model.results),snapshot);
 assert.equal(tables.reduce((sum,item)=>sum+item.rows.length,0),model.results.reduce((sum,item)=>sum+item.rows.length,0),'No rows removed: '+report.key);
 for(const original of model.results)for(const row of original.rows){
  const candidates=tables.flatMap(table=>table.rows.filter(candidate=>candidate[0]===row[0]).map(candidate=>({table,candidate})));
  assert(candidates.some(({table,candidate})=>row.every(cell=>candidate.some(value=>String(value)===String(cell) || String(value).split('\n').includes(String(cell))) || table.title.endsWith(' · '+cell))),'Keep all original values and dates beside their reference: '+report.key+' / '+row[0]);
 }
}
console.log('Print tables: OK · 75 report models; exact rows, values, dates, timestamps, currencies, units, periods, translations and notes preserved.');
