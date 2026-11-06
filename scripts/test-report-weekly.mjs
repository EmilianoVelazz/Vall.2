import assert from 'node:assert/strict';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {reportLayout} from '../frontend/src/lib/reportLayout.js';
import {reportOutline} from '../frontend/src/lib/reportOutline.js';
import {sectorSessionReport} from '../shared/report-sector-session.mjs';
// La capa común sigue calculando sesiones y datos estructurales. El informe
// ejecutivo de materias primas agrega validaciones y su propia estructura.
const session=report=>sectorSessionReport(report,weeklyReport(report,{equitySession:false}));
const dates=['2026-10-12','2026-10-13','2026-10-14'];
const report={collection:'markets',key:'grains',title:'Granos · prueba',generatedAt:'2026-10-14T14:00:00Z',summary:'Texto previo no usado como causalidad',metrics:[],sections:[],tables:[],visuals:[{type:'line',title:'Maíz',unit:'USD/t',series:[{label:'Contrato A',points:dates.map((date,i)=>({date,value:100+i*10}))}]}]};
const before=JSON.stringify(report),model=session(report);
assert.equal(JSON.stringify(report),before);assert(model.sessionReport && model.sectorSession);
assert.deepEqual(model.blocks.map(block=>block.key),['session','results','comparisons','charts','sessionContext']);assert(reportOutline(report).some(block=>block.label==='Lectura ejecutiva'));
assert.equal(model.references[0].previous.value,110);assert.equal(model.references[0].last.value,120);assert.equal(model.references[0].delta,10);assert.equal(model.references[0].previous.date,dates[1]);
assert.deepEqual(model.visuals[0].series[0].points.map(point=>point.date),dates.slice(-2));assert(model.visuals[0].reading.includes('120 USD/t'));assert(model.results[0].note.includes('última sesión'));
const bars=session({...report,visuals:[{type:'bar',title:'Producción anual',unit:'t',bars:[{label:'2024',value:0},{label:'2025',value:42},{label:'2027',value:999}]}]});assert.deepEqual(bars.visuals[0].bars,[{label:'2025',value:42}]);assert(bars.visuals[0].reading.includes('no demuestra un cambio diario'));
const states=session({...report,visuals:[{type:'bar',title:'Referencias por estado',unit:'MXN/kg',bars:[{label:'Puebla',value:0},{label:'Jalisco',value:40}]}]});assert.equal(states.visuals[0].bars.length,2);assert.equal(states.visuals[0].bars[0].value,0,'El cero publicado se conserva sin inventar una fecha');
const hidden=session({...report,personalization:{sections:{charts:false,tables:false,indicators:false,risks:false}}});for(const key of ['visuals','results','metrics','followup'])assert.deepEqual(hidden[key],[]);assert(!hidden.blocks.some(item=>item.key==='charts'));
const qualified={...report,visuals:[],sourceSnapshot:{grains:[{label:'Maíz CBOT · Estados Unidos',market:'Estados Unidos',symbol:'ZC=F',unit:'US¢/bu',source:'SIMULACIÓN',url:'https://example.invalid/corn',cadence:'daily',basis:'Contrato de prueba',series:dates.map((date,i)=>({date,value:100+i*10}))}]}};
const executive=weeklyReport(qualified);assert(executive.commodityExecutive);assert.equal(executive.references[0].previous.date,dates[1]);assert.equal(executive.references[0].last.date,dates[2]);assert.equal(executive.references[0].delta,10);assert.equal(executive.references[0].periods.month,null,'No se inventa un horizonte mensual con tres observaciones');assert(executive.results.length>0);assert(executive.visuals.some(visual=>visual.unit==='US¢/bu'));assert.equal(weeklyReport(report).references.length,0,'La gráfica heredada sin identidad comercial no se publica como cotización verificada');
for(const [collection,key]of [['finance','daily_news'],['markets','market_news']])assert.equal(reportLayout({collection,key}).composition,'weekly-sheet');assert.equal(reportLayout({userEdition:true,key:'draft',baseReport:{collection:'finance',key:'daily_news'}}).composition,'weekly-sheet');
assert.equal(reportLayout({userEdition:true,key:'draft'}).composition,'company-dashboard');
console.log('Formato común: OK · resumen, indicadores, fechas, dos sesiones, datos estructurales, exclusiones, noticias y causas al final');
