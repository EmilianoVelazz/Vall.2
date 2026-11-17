import assert from 'node:assert/strict';
import fs from 'node:fs';
import {safeFinancialNews} from '../shared/report-financial-news.mjs';
import {safeMarketNews} from '../shared/report-market-news.mjs';
import {marketPeriods} from '../shared/report-market-analysis.mjs';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {equityHistoryChart} from '../shared/report-equity-history-chart.mjs';
const cutoff='2026-11-05T18:00:00Z',story=(title,id)=>({title,source:'Medio '+id,url:'https://example.invalid/'+id,publishedAt:'2026-11-05T15:00:00Z'});
const duplicates=[story('Banxico sorprende y baja tasa de interés 25 puntos base; queda en 6.25%',1),story('Contra todo pronóstico, Banxico recorta la tasa de interés al 6.25 %',2),story('El Banco de Inglaterra sube los tipos de interés hasta el 4%',3)];
const grouped=safeFinancialNews(duplicates,cutoff);assert.equal(grouped.length,2);assert.equal(grouped.find(item=>item.title.startsWith('Banxico')).corroboratingSources.length,1);assert.equal(safeFinancialNews(grouped,cutoff).length,2,'Grouping is stable on save and reload');
assert.equal(safeFinancialNews([...duplicates,story('Banxico baja tasa de interés a 6.00%',4)],cutoff).length,3,'Different announced levels must not be merged');
const title='Dcoop y Acesur presentan oferta por Deoleo',oil=safeMarketNews([{...story(title,5),description:'Información de proteínas, pollo y ganado.'}],cutoff);assert.equal(oil[0].topic,'food_oils','The actual company/product in the headline outranks unrelated description keywords');
assert.equal(safeMarketNews([story('La nueva pantalla universal G5e de John Deere llega a la agricultura de precisión',6)],cutoff).length,0);
assert.equal(safeMarketNews([story('Brote de influenza aviar afecta a granjas de pollo',7)],cutoff)[0].topic,'health');
assert.equal(marketPeriods([{date:'2026-10-18',value:60},{date:'2026-11-01',value:20}],'weekly').week,null,'A 14-day publication change is not a weekly return');
assert.equal(marketPeriods([{date:'2026-10-25',value:60},{date:'2026-11-01',value:20}],'weekly').week.baseDate,'2026-10-25');
assert.equal(safeFinancialNews([{...story('Banxico recorta la tasa de interés al 6.25%',8),publishedAt:'2026-11-02T12:00:00Z'}],cutoff).length,0);
assert.equal(safeFinancialNews([{...story('Banxico recorta la tasa de interés al 6.25%',8),publishedAt:'2026-11-02T12:00:00Z'}],cutoff,{lookbackDays:7}).length,1,'Weekly news keeps original publication dates');
const series=Array.from({length:12},(_,i)=>({label:i===0 ? 'S&P 500' : i===1 ? 'IPC' : i===2 ? 'Ibovespa' : 'Mercado '+i,country:i===1 ? 'México' : i===2 ? 'Brasil' : '',points:[{date:'2020-01-02',value:100},{date:'2026-11-05',value:120+i}]})),chart=equityHistoryChart({series});assert.equal(chart.series.length,12);assert.equal(chart.series.filter(item=>item.highlighted).length,12,'Default comparison retains every market in its own color');assert.deepEqual(chart.series.map(item=>item.points),series.map(item=>item.points));
const annual=JSON.parse(fs.readFileSync('backend/data/annual-report-library.json')),before=JSON.stringify(annual);
for(const [year,reports] of Object.entries(annual.years)){
 for(const report of reports){const model=weeklyReport(report);assert.equal(model.metrics.length,0);assert(model.summary && !/^Informe anual \d+: \d+ referencias/.test(model.summary));for(const event of model.annualEditorial.events){assert(event.date.startsWith(year));assert(/^https:\/\//.test(event.url));assert(event.quarter>=1 && event.quarter<=4);}}
 const finance=weeklyReport(reports.find(item=>item.collection==='finance' && item.key==='daily_news')),market=weeklyReport(reports.find(item=>item.collection==='markets' && item.key==='market_news'));assert.notDeepEqual(finance.annualEditorial.events.map(item=>item.title),market.annualEditorial.events.map(item=>item.title),'Annual news is specific to its audience');assert(market.annualEditorial.events.length>=3);
}
assert.equal(JSON.stringify(annual),before,'Editorial formatting preserves all original annual evidence');
console.log('Editorial: event grouping, classification, comparable windows, weekly news, 12 retained chart series, and 56 annual editions verified.');
