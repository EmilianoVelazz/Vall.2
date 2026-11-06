import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED='false';
const {_test}=require('../backend/routes/export');
const {equityHistoryPages}=require('../backend/lib/report-equity-history-pdf');
const {weeklyReport}=await import('../shared/report-weekly.mjs');
const {getDocument}=await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const country=['Estados Unidos','México','Brasil','Alemania','Japón'];
const equities=Array.from({length:41},(_,i)=>({label:['S&P 500','S&P/BMV IPC','Ibovespa','DAX 40'][i] || 'Índice '+i,symbol:['^GSPC','^MXX','^BVSP','^GDAXI'][i] || 'SYM'+i,market:country[i%country.length],region:i%5===3 ? 'Europa' : i%5===4 ? 'Asia' : 'América',currency:'USD',source:'Fuente de prueba',url:'https://example.invalid/indice',series:[{date:i===40 ? '2024-02-01' : '2020-01-02',value:100},{date:'2026-10-23',value:120+i},{date:'2026-10-26',value:i===1 ? 90 : 121+i}]}));
const report={key:'equities',collection:'finance',title:'Bolsa de prueba',generatedAt:'2026-10-27T12:00:00Z',sourceSnapshot:{equities}},before=JSON.stringify(report),model=weeklyReport(report),pages=equityHistoryPages(model.equityExecutive.globalHistory);
assert.equal(pages.length,1);assert.equal(pages[0].length,41);assert.equal(pages[0].find(item=>item.label==='Índice 40').points[0].date,'2024-02-01');
assert.deepEqual(equityHistoryPages(null),[]);assert.deepEqual(equityHistoryPages({series:[{label:'No válida',points:[{date:'2020-01-02',value:NaN}]}]}),[]);
assert.equal(equityHistoryPages({series:Array.from({length:96},(_,index)=>({...pages[0][0],label:String(index)}))}).length,1,'All histories share a single chart');
async function inspect(input){
 const buffer=await _test.makeExecutivePdf(input.title,_test.executivePayload(input)),task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true,isEvalSupported:false}),pdf=await task.promise,text=[];
 try{for(let index=1;index<=pdf.numPages;index++){const page=await pdf.getPage(index),items=(await page.getTextContent()).items.filter(item=>item.str.trim());for(const item of items){assert(item.transform[5]>=15,item.str);assert(item.transform[4]>=0 && item.transform[4]+item.width<=page.view[2]+1,item.str);}text.push(items.map(item=>item.str).join(' '));}return {pages:pdf.numPages,text};}finally{await task.destroy();}
}
for(const analysisPeriod of ['daily','weekly']){
 const result=await inspect({...report,analysisPeriod}),atlas=result.text.filter(page=>page.includes('Evolución de todas las bolsas'));
 assert(result.pages<=3);assert.equal(atlas.length,1,'The downloaded PDF itself must contain the complete historical atlas');
 for(const series of model.equityExecutive.globalHistory.series){assert(atlas[0].includes(series.label),series.label+' must be drawn in the PDF appendix');assert(atlas[0].includes(series.points[0].date));assert(atlas[0].includes(series.points.at(-1).date));}
 assert(atlas[0].includes('2024-02-01'));assert(!atlas[0].includes('NaN')&&!atlas[0].includes('Infinity'));assert(atlas[0].includes('Escala logarítmica común'));assert(!atlas[0].includes('su propia escala'));
}
const without=await inspect({...report,personalization:{sections:{charts:false}}});assert(without.pages<=2);assert(!without.text.some(page=>page.includes('Evolución de todas las bolsas')));
assert.equal(JSON.stringify(report),before);
console.log('Bolsa PDF: all 41 trajectories are included in the actual daily/weekly download, partial dates and scales retained, bounded pages, no clipping, charts flag respected and immutable evidence.');
