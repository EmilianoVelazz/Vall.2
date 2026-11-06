import assert from 'node:assert/strict';
import {sectorSessionReport} from '../shared/report-sector-session.mjs';

const generatedAt='2026-10-27T18:00:00Z';
const base={collection:'mexico',key:'mx_bolsa',title:'Simulación ejecutiva',generatedAt,metrics:[],tables:[],visuals:[],dailyReferences:[],watchlist:[]};
const model=report=>{
  const before=JSON.stringify(report),result=sectorSessionReport(report,{});
  assert.equal(JSON.stringify(report),before,'La selección editorial no altera datos ni el orden original.');
  assert(result.commentary.every(panel=>panel.body!==result.summary),'El análisis no vuelve a imprimir la apertura.');
  assert(!result.commentary.some(panel=>['Qué muestra el corte','Fecha y cobertura','Qué cambió y en qué periodo'].includes(panel.heading)));
  return result;
};
const points=(previous,last)=>[{date:'2026-10-26',value:previous},{date:'2026-10-27',value:last}];
const quotes=model({...base,dailyReferences:[{label:'Emisora al alza',unit:'MXN por acción',points:points(100,104)},{label:'Emisora a la baja',unit:'MXN por acción',points:points(50,45)},{label:'Emisora sin cambio',unit:'MXN por acción',points:points(10,10)}]});
assert.match(quotes.summary,/Emisora al alza: 104 MXN por acción; ↑ \+4 %/u);
assert.match(quotes.summary,/Emisora a la baja: 45 MXN por acción; ↓ -10 %/u);
assert.match(quotes.summary,/2026-10-26 \/ 2026-10-27/u);
assert(!/referencias con|permiten comparar|tablas y|gráficas de/u.test(quotes.summary));
assert.equal(quotes.references.length,3);
const single=model({...base,dailyReferences:[{label:'Precio observado',unit:'MXN/kg',points:[{date:'2026-10-27',value:0}]}]});
assert.match(single.summary,/Precio observado: 0 MXN\/kg/u);
assert.match(single.summary,/No hay una base reciente comparable/u);
const stale=model({...base,dailyReferences:[{label:'Dato histórico',unit:'MXN/kg',points:[{date:'2020-10-26',value:2},{date:'2020-10-27',value:4}]}]});
assert(!stale.summary.includes('↑'),'Un dato antiguo no produce un movimiento de sesión.');
const rate=model({...base,dailyReferences:[{label:'Tasa',unit:'%',points:points(8,8.25)}]});
assert.match(rate.summary,/↑ \+0.25 p. p./u,'Las tasas no confunden puntos porcentuales con porcentajes.');
const stories=[{title:'Aumenta la oferta de maíz',source:'Fuente de prueba',publishedAt:'2026-10-27T16:00:00Z',url:'https://example.invalid/1'},{title:'Duplicado excluido',publishedAt:'2026-10-27T16:00:00Z',url:'https://example.invalid/1'},{title:'Se modifica una ruta logística',publishedAt:'2026-10-27T15:00:00Z',url:'https://example.invalid/2'},{title:'Titular futuro excluido',publishedAt:'2026-10-28T00:00:00Z'},{title:'Titular sin fecha excluido'}];
for(const [collection,key] of [['finance','daily_news'],['markets','market_news']]){
  const news=model({...base,collection,key,headlines:stories});
  assert.match(news.summary,/Aumenta la oferta de maíz/u);
  assert.match(news.summary,/Fuente de prueba · 2026-10-27/u);
  assert.match(news.summary,/Se modifica una ruta logística/u);
  assert(!/Duplicado|futuro excluido|sin fecha excluido/u.test(JSON.stringify(news)));
  assert(!news.commentary.some(panel=>panel.body.includes('Aumenta la oferta de maíz')),'Los titulares se narran una vez y su respaldo queda en las tablas.');
  assert.equal(news.results[0].rows.length,2);
}
const macro=model({...base,key:'mx_overview',tables:[{title:'Indicadores estructurales',columns:['Indicador','Valor','Unidad','Periodo','Fuente'],rows:[['Crecimiento del PIB','1.5','%','2025','Fuente de prueba'],['Inflación','0','%','2024','Fuente de prueba'],['Sin valor','Sin dato','%','2025','Fuente de prueba']]}]});
assert.match(macro.summary,/Crecimiento del PIB: 1.5 % \(2025\)/u);
assert.match(macro.summary,/Inflación: 0 % \(2024\)/u);
assert.match(macro.summary,/no cambios de la sesión/u);
assert.equal(macro.results[0].rows.length,3,'La selección de hechos no recorta tablas de respaldo.');
const production=model({...base,key:'mx_production',tables:[{title:'Granos por entidad · 2025',columns:['Estado','Maíz (t)','Trigo (t)'],rows:[['Estado A','900','0'],['Estado B','1,200','20'],['Estado C','Sin producción reportada','30']]}]});
assert.match(production.summary,/Estado B registra 1,200 en Maíz \(t\)/u);
assert.match(production.summary,/2025/u);
assert.match(production.summary,/no inventario comercial actual/u);
const empty=model(base);
assert.match(empty.summary,/No hay una observación numérica/u);
assert(!/0 tablas|0 gráficas/u.test(empty.summary));
console.log('Resumen ejecutivo sectorial: OK · hechos y fechas, alzas/bajas, puntos porcentuales, noticias deduplicadas, contexto estructural y datos inmutables.');
