import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {reportCsv} from '../frontend/src/lib/reportCsv.js';
import {createReportDraft} from '../frontend/src/lib/reportCreation.js';
const require=createRequire(import.meta.url);process.env.NODE_ENV='test';
const {normalizeReport}=require('../backend/services/user-report-store');
const points=[{date:'2026-10-16',value:10},{date:'2026-10-19',value:11},{date:'2026-10-21',value:999}];
const references=[
 {label:'Pollo congelado · Brasil',category:'Pollo',unit:'BRL/kg',cadence:'daily',source:'CEPEA',points},
 {label:'Huevo M · Francia',category:'Huevo',unit:'EUR/100 piezas',cadence:'daily',source:'RNM',points},
 {label:'Huevo Dalian · China',unit:'CNY/500 kg',cadence:'daily',basis:'serie continua de futuros',points},
 {label:'Cerdo magro CME · EE. UU.',unit:'US¢/lb',cadence:'daily',basis:'serie continua de futuros',points},
 {label:'Ganado vivo CME · EE. UU.',unit:'US¢/lb',cadence:'daily',basis:'serie continua de futuros',points},
 {label:'Salmón fresco · Noruega',category:'Pescado',unit:'EUR/kg',cadence:'daily',source:'RNM',points},
 {label:'Surimi · Francia',category:'Procesados',unit:'EUR/kg',cadence:'weekly',source:'RNM',points:[{date:'2026-10-09',value:3},{date:'2026-10-16',value:4}]},
 {label:'Huevo líquido · Francia',category:'Procesados',unit:'EUR/kg',cadence:'monthly',source:'RNM',points:[{date:'2026-09-01',value:4},{date:'2026-10-01',value:5}]},
 {label:'Harina de soya · EE. UU.',unit:'USD/t corta',cadence:'daily',basis:'serie continua de futuros',points},
];
const report={collection:'markets',key:'proteins',title:'Proteínas - prueba',summary:'Datos sintéticos para comprobar el formato de las tablillas.',generatedAt:'2026-10-20T12:00:00Z',sessionObservations:references,metrics:[],visuals:[],tables:[],sections:[],sources:[],sourceLinks:[],watchlist:[]};
const before=JSON.stringify(report),model=weeklyReport(report);
assert(model.proteinBulletin);assert.equal(JSON.stringify(report),before);
assert.deepEqual(model.proteinSheets.map(sheet=>sheet.id),['chicken','eggs','pork','beef','fish','processed','feed']);
assert.equal(model.proteinSheets.find(sheet=>sheet.id==='eggs').tables.length,2,'Huevo físico y futuro se separan');
assert.equal(model.proteinSheets.find(sheet=>sheet.id==='processed').tables.length,2,'Publicaciones semanales y mensuales separadas');
assert.equal(model.results.reduce((sum,table)=>sum+table.rows.length,0),references.length,'Todas las referencias permanecen en las tablillas');
assert(model.visuals.filter(visual=>visual.sessionMovement).every(visual=>visual.bars.every(bar=>!bar.label.includes('Surimi') && !bar.label.includes('líquido'))));
assert(model.results.filter(table=>table.columns.length===5).every(table=>table.rows.every(row=>row[2].includes('2026-10-16') && row[3].includes('2026-10-19'))),'Conservar viernes contra lunes y ambas fechas');
assert(!JSON.stringify(model.results).includes('999'));
assert(model.commentary.some(item=>item.heading==='Huevo' && item.body.includes('ponedoras')));
assert(model.commentary.some(item=>item.heading==='Procesados y alternativas' && item.body.includes('Surimi')));
assert(model.commentary.some(item=>item.heading==='Alimentación animal' && item.body.includes('no equivale')));
assert(model.blocks.findIndex(item=>item.key==='sessionContext')>model.blocks.findIndex(item=>item.key==='comparisons'));assert(model.proteinSheets.every(sheet=>sheet.visuals.length>0),'Cada especie incluye una gráfica');assert(model.visuals.filter(visual=>visual.contextPrice).every(visual=>visual.unit!=='%'));
assert(!reportCsv(report).includes('2026-09-01'),'No convertir la publicación mensual en comparación diaria');
assert(reportCsv(report).includes('Tablillas')===false);assert(reportCsv(report).includes('Procesados y alternativas'));
const saved=normalizeReport(createReportDraft('markets',report).report);
assert.deepEqual(weeklyReport(saved).results,model.results);
const {_test}=require('../backend/routes/export'),exported=weeklyReport(_test.executivePayload(report));
assert.deepEqual(exported.results,model.results);assert.deepEqual(exported.visuals,model.visuals);
assert(!weeklyReport({...report,key:'grains'}).proteinBulletin,'Otros informes conservan su formato');
assert(!weeklyReport({...report,periodType:'annual',reportYear:2025}).proteinBulletin,'Las ediciones anuales conservan su periodo');
assert.equal(weeklyReport({...report,personalization:{sections:{tables:false,charts:false}}}).results.length,0);
const cache=JSON.parse(await fs.readFile('backend/cache/market_executive_reports.json','utf8')),actual=weeklyReport({...cache.reports.find(report=>report.key==='proteins'),collection:'markets'});
assert(actual.proteinBulletin);assert.equal(actual.proteinSheets.reduce((sum,sheet)=>sum+sheet.references,0),actual.references.length);
assert(actual.results.flatMap(table=>table.rows).some(row=>row.some(cell=>String(cell).includes('Surimi'))));
const actualReport={...cache.reports.find(report=>report.key==='proteins'),collection:'markets'},actualSaved=normalizeReport(createReportDraft('markets',actualReport).report);
assert.deepEqual(weeklyReport(actualSaved).results,actual.results,'La copia guardada conserva precios y evidencia multifuente');
assert.deepEqual(weeklyReport(actualSaved).visuals,actual.visuals,'La copia guardada conserva todas las gráficas');
const fullCut={...actualReport,metrics:actualReport.sourceSnapshot.proteins.map(item=>({label:item.label,value:String(item.value ?? ''),change:''}))};
assert.equal(weeklyReport(normalizeReport(createReportDraft('markets',fullCut).report)).references.length,actual.references.length,'Guardar un corte completo conserva todas las referencias aunque incluya más de 30 métricas originales');
assert.equal(actual.proteinCountries.length,8);assert(actual.proteinCountries.every(country=>country.count>0));
assert(actual.visuals.every(visual=>!visual.source));assert(!/Yahoo|Sina Finance|CEPEA|FranceAgriMer|DG AGRI|Mercolleida/.test(JSON.stringify({tables:actual.results,visuals:actual.visuals,commentary:actual.commentary})));assert(actual.references.some(item=>item.source.includes('CEPEA')),'Conservar procedencia interna');
console.log(`Boletín de proteínas: OK · ${actual.proteinSheets.length} familias, ${actual.references.length} referencias, fuentes y fechas, físico/futuros, frecuencias, causas, CSV, guardado y PDF coherentes.`);
