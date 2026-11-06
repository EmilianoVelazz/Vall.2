import assert from 'node:assert/strict';
import {mexicoProductionObservations} from '../shared/report-mexico-export-data.mjs';
const report={collection:'mexico',key:'mx_production',generatedAt:'2026-10-27T20:00:00Z',sourceLinks:[{url:'https://nube.agricultura.gob.mx/datosAbiertos/Agricola.php'},{url:'https://www.sgm.gob.mx/productos/pdf/Anuario_2024_Edicion_2025.pdf'}],tables:[
 {title:'Granos por entidad · 2025',columns:['Estado','Maíz (t)','Trigo (t)','Sorgo (t)','Soya (t)'],rows:[['Ejemplo','0','Sin producción reportada','1,234.56','—']]},
 {title:'Valor minero por entidad · 2024',columns:['Estado','Valor (MXN)','Participación (%)'],rows:[['Ejemplo','76,200.03','0']]},
 {title:'Granos por entidad · 2027',columns:['Estado','Maíz (t)'],rows:[['Futuro','99']]},
]};
const before=JSON.stringify(report),values=mexicoProductionObservations(report);
assert.equal(values.length,3);assert.deepEqual(values.map(item=>item.value),[0,1234.56,76200.03]);
assert.deepEqual(values.map(item=>item.year),[2025,2025,2024]);assert(values.every(item=>item.cadence==='annual' && !('date' in item)));
assert.deepEqual(values.map(item=>item.unit),['t','t','MXN']);assert(values.every(item=>item.url.startsWith('https://')));
assert.equal(JSON.stringify(report),before);assert.deepEqual(mexicoProductionObservations({...report,collection:'markets'}),[]);
assert.deepEqual(mexicoProductionObservations({...report,key:'edition_test',collection:undefined,baseReport:{key:'mx_production',collection:'mexico'}}),values);
console.log('Annual export data: zero preserved, absence omitted, decimals exact, future period excluded, original year/frequency/unit and saved identity retained.');
