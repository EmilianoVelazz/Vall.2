import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {conciseReportModel} from '../shared/report-concision.mjs';
import {compactChartReadings} from '../shared/report-chart-layout.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {filteredReportModel} from '../shared/report-view-filters.mjs';
const table={title:'Precio publicado',columns:['Referencia','Fecha','Valor'],rows:[['Maíz','2026-10-22',10],['Maíz','2026-10-22',10]],unit:'USD/t',note:'Metodología común.'};
const chart={type:'line',title:'Tendencia',unit:'USD/t',series:[{label:'Maíz',points:[{date:'2026-10-21',value:9},{date:'2026-10-22',value:10}]}],reading:'Base común: 2026-10-21. No se rellenan días sin publicación.',note:'Base común: 2026-10-21. No se rellenan días sin publicación.'};
const fixture={focusedMarket:true,summary:'Hecho principal.',summaryPanels:[{heading:'Resumen',body:'Hecho principal.'},{heading:'Otra lectura',body:'Hecho principal.\n\nConsecuencia distinta.'}],followup:['Consecuencia distinta.','Verificar inventarios.','Verificar inventarios.'],results:[table,{...table,title:'La misma evidencia',columns:['Valor','Referencia','Fecha'],rows:[[10,'Maíz','2026-10-22']],note:'Condición adicional.'},{...table,title:'Otro día',rows:[['Maíz','2026-10-23',10]]},{...table,title:'Otra moneda',unit:'MXN/t',rows:[['Maíz','2026-10-22',10]]},{...table,title:'Otra fuente',source:'Publicación B',rows:[['Maíz','2026-10-22',10]]},{...table,title:'Otra precisión',rows:[['Maíz','2026-10-22',10.00001]]}],visuals:[chart,{...chart,title:'Otra copia'}],blocks:[{key:'session'},{key:'comparisons'},{key:'charts',count:2}]};
const original=JSON.stringify(fixture),clean=conciseReportModel(fixture);
assert.equal(JSON.stringify(fixture),original,'Presentation never mutates source data');
assert.equal(clean.results.length,5,'Only identical evidence collapses; date, currency, source and precision remain distinct');
assert.equal(clean.results[0].rows.length,1);assert(clean.results[0].note.includes('Condición adicional.'));
assert.equal(clean.results.filter(item=>item.note.includes('Metodología común.')).length,1);
assert.equal(clean.summaryPanels[1].body,'Hecho principal.\n\nConsecuencia distinta.','Different headings can identify different facts');assert.deepEqual(clean.followup,['Consecuencia distinta.','Verificar inventarios.']);
const repeated=conciseReportModel({...fixture,summaryPanels:[{heading:'Resumen',body:'Mismo párrafo.\n\nMismo párrafo.'},{heading:'Resumen',body:'Mismo párrafo.\n\nConsecuencia distinta.'}]});assert.equal(repeated.summaryPanels[0].body,'Mismo párrafo.');assert.equal(repeated.summaryPanels[1].body,'Consecuencia distinta.');
const countryFacts=conciseReportModel({...fixture,summaryPanels:[{heading:'México',body:'3.4 %'},{heading:'Estados Unidos',body:'3.4 %'},{heading:'Canadá',body:'La oferta es limitada.'},{heading:'Chile',body:'La oferta es limitada.'}]});assert.equal(countryFacts.summaryPanels.length,4,'A heading is part of the identity of a fact, even when values coincide');
assert.equal(clean.visuals.length,1);assert.equal(clean.blocks.find(item=>item.key==='charts').count,1);
const reading=compactChartReadings([chart]);assert.equal(reading.visuals[0].note,'');assert.equal(reading.visuals[0].reading,chart.reading,'Dates and methodology remain visible exactly once');
const filterable=conciseReportModel({...fixture,results:[{...table,rows:[['México','2026-10-22',10]]},{...table,rows:[['Brasil','2026-10-22',20]]}]});assert.equal(filterable.results[1].note,'');const filtered=filteredReportModel(filterable,{collection:'markets'},{query:'Brasil'});assert.equal(filtered.results[0].note,'Metodología común.','A country/product filter keeps one copy of the applicable conditions');
const contexts=conciseReportModel({...fixture,summaryPanels:[{heading:'Fuente A',source:'A',body:'Mismo texto publicado.'},{heading:'Fuente B',source:'B',body:'Mismo texto publicado.'}]});assert.equal(contexts.summaryPanels.length,2);
const reports=[];
for(const [collection,file]of [['finance','finance_executive_reports'],['markets','market_executive_reports'],['mexico','mexico-executive-reports']])for(const report of JSON.parse(await fs.readFile('backend/cache/'+file+'.json','utf8')).reports)reports.push({...report,collection});
reports.push(...Object.values(JSON.parse(await fs.readFile('backend/cache/annual-report-library.json','utf8')).years).flat());
const stats=reports.map(report=>{const model=weeklyReport(report);const notes=model.results.map(table=>table.note).filter(Boolean);assert.equal(new Set(notes).size,notes.length,'One copy of each table note: '+report.key);if(model.focusedMarket && ['equities','grains','energy_metals','proteins'].includes(report.key)){assert(model.visuals.filter(item=>item.type==='bar' && item.title.includes('interanual')).length<=1);const bars=model.visuals.filter(item=>item.type==='bar').map(item=>JSON.stringify([item.unit,item.source,item.bars]));assert.equal(new Set(bars).size,bars.length,'Las minigráficas conservan comparaciones distintas, sin copias de la misma evidencia');}return{id:report.collection+'-'+report.key+'-'+(report.reportYear||'diario'),chars:JSON.stringify({commentary:model.commentary,results:model.results.map(table=>({...table,methodologyNote:undefined})),visuals:model.visuals.map(visual=>({...visual,series:undefined,bars:undefined}))}).length,tables:model.results.length,rows:model.results.reduce((sum,table)=>sum+table.rows.length,0),charts:model.visuals.length};});
// La cobertura actual incluye más países y referencias que la captura antigua.
// El contrato se verifica por identidad de evidencia y notas, no por reducir el
// tamaño total frente a una edición con menos información.
await fs.mkdir('output/report-concision-20261023',{recursive:true});
await fs.writeFile('output/report-concision-20261023/after.json',JSON.stringify(stats,null,2));
console.log('Concision: OK · '+reports.length+' report models, original observations intact, repeated paragraphs/tables/notes/charts removed, distinct dates/currencies/sources/precision preserved.');
