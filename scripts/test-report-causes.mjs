import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {reportOutline} from '../frontend/src/lib/reportOutline.js';

const require=createRequire(import.meta.url);
process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-causes-test';
const {_test}=require('../backend/routes/export');
const {normalizeReport}=require('../backend/services/user-report-store');
const {createReportTranslator}=require('../backend/services/report-translation');
const {reportLabels}=require('../backend/lib/report-language');
const {reportExportContent}=require('../backend/lib/report-export-content');
const base={collection:'markets',key:'grains',title:'Granos · simulación del anexo',generatedAt:'2026-10-16T18:00:00Z',summary:'EXPLICACION_ANTERIOR_OCULTA',sections:[],metrics:[],tables:[],visuals:[],dailyReferences:[{label:'Maíz',unit:'USD/t',points:[{date:'2026-10-15',value:100},{date:'2026-10-16',value:110}]}]};
const before=JSON.stringify(base),model=weeklyReport(base),annex=model.causes;
assert.equal(JSON.stringify(base),before,'La vista no reescribe el informe ni sus datos');
assert.equal(model.blocks.at(-1).key,'sessionContext');assert.equal(reportOutline(base).at(-1).label,'Causas y consecuencias');
assert.match(annex.status,/no confirmada/);assert.match(annex.groups[0].factors,/Contrastar cosecha/);
assert.match(annex.groups[0].rows[0].movement,/Alza · \+10 USD\/t \(\+10 %\)/);
assert.match(annex.groups[0].rows[0].impact,/elevar el costo de grano/);
assert.equal(annex.period,'2026-10-15 / 2026-10-16');
assert(!JSON.stringify(annex).includes('EXPLICACION_ANTERIOR_OCULTA'),'No recicla narrativa como causa documentada');
const variant=(previous,current,patch={})=>weeklyReport({...base,...patch,dailyReferences:[{label:'Maíz',unit:'USD/t',points:[{date:'2026-10-15',value:previous},{date:'2026-10-16',value:current}]}]}).causes;
assert.match(variant(110,100).groups[0].rows[0].impact,/reducir el costo/);
assert.equal(variant(100,100).groups.length,0);assert.match(variant(100,100).status,/no presentan cambio/);
for(const [previous,current] of [[null,110],[100,null],[false,110],[100,Infinity],[-Number.MAX_VALUE,Number.MAX_VALUE]]) assert.equal(variant(previous,current).groups.length,0,'No atribuir un movimiento sin cifras válidas');
assert(!JSON.stringify(variant(0,100)).includes('Infinity'),'Base cero conserva el cambio absoluto sin porcentaje infinito');
const missing=weeklyReport({...base,dailyReferences:[{label:'Maíz',unit:'USD/t',points:[{date:'2026-10-14',value:100},{date:'2026-10-16',value:110},{date:'2026-10-17',value:120}]}]}).causes;
assert.equal(missing.groups.length,0);assert.match(missing.status,/dos observaciones/);
assert(!JSON.stringify(missing).includes('2026-10-14') && !JSON.stringify(missing).includes('2026-10-17'));
const conflicts=structuredClone(base);conflicts.dailyReferences[0].points.push({date:'2026-10-16',value:999});
assert.equal(weeklyReport(conflicts).causes.groups.length,0,'No explicar una variación basada en observaciones contradictorias');
const units=weeklyReport({...base,dailyReferences:[{label:'Maíz',unit:'USD/t',points:[{date:'2026-10-15',value:100}]},{label:'Maíz',unit:'MXN/t',points:[{date:'2026-10-16',value:110}]}]});
assert.equal(units.causes.groups.length,0,'No confundir un cambio de unidad con un movimiento de mercado');
const fx={...base,collection:'finance',key:'fx',dailyReferences:[{label:'USD/MXN · Peso mexicano',unit:'MXN por 1 USD',points:[{date:'2026-10-15',value:18},{date:'2026-10-16',value:19}]}]};
assert.equal(weeklyReport(fx).visuals.length,1,'El anexo conserva las dos gráficas de divisas');
assert.match(weeklyReport(fx).causes.groups[0].rows[0].impact,/más unidades/);
const lower=structuredClone(fx);lower.dailyReferences[0].points[1].value=17;
assert.match(weeklyReport(lower).causes.groups[0].rows[0].impact,/menos unidades/);
lower.dailyReferences[0].points[1].value=0;assert.equal(weeklyReport(lower).causes.groups.length,0,'Cero no es una cotización cambiaria válida');
const rates={...base,collection:'finance',key:'bonds',dailyReferences:[{label:'Treasury 10 años',unit:'%',points:[{date:'2026-10-15',value:4},{date:'2026-10-16',value:4.5}]}]};
assert.match(weeklyReport(rates).causes.groups[0].rows[0].movement,/0.5 p. p./);
assert.match(weeklyReport(rates).causes.groups[0].rows[0].impact,/reducir el precio de bonos/);
const production={...base,collection:'mexico',key:'mx_production',dailyReferences:[{label:'Maíz',unit:'t',points:base.dailyReferences[0].points}]};
assert.match(weeklyReport(production).causes.groups[0].rows[0].impact,/no se infiere un costo/,'El volumen producido no es un precio');
const vix={...base,collection:'finance',key:'equities',dailyReferences:[{label:'VIX',unit:'puntos',points:base.dailyReferences[0].points}]};
assert.match(weeklyReport(vix).causes.groups[0].rows[0].impact,/no se infiere un costo/);
const excluded=weeklyReport({...base,personalization:{sections:{sources:false,charts:false,tables:false,indicators:false}}});
assert(excluded.blocks.some(block=>block.key==='sessionContext'));assert.equal(excluded.causes.groups[0].link,null,'Respetar enlaces excluidos');
const many=weeklyReport({...base,dailyReferences:Array.from({length:15},(_,i)=>({...base.dailyReferences[0],label:'Contrato '+i}))}).causes;
assert.equal(many.groups[0].rows.length,9);assert.match(many.coverage,/9 \/ 15/,'Se declara el alcance del anexo, conservando todas las filas originales en tablas');
const owned=normalizeReport({...base,userEdition:true,baseReport:{collection:base.collection,key:base.key,title:base.title,generatedAt:base.generatedAt}});
assert.deepEqual(weeklyReport(owned).causes,annex,'Una edición guardada conserva el anexo a partir de sus datos');
const prepared=_test.executivePayload(base);
assert.deepEqual(weeklyReport(prepared).causes,annex,'PDF y lectura usan el mismo corte y cálculo');
const text=await reportExportContent(prepared);assert(text.includes('## 3 · Causas y consecuencias') && text.includes('Revisar clima') && !text.includes('EXPLICACION_ANTERIOR_OCULTA'));
const news={...base,key:'market_news'};assert.equal(reportOutline(news).at(-1).key,'sessionContext');assert((await reportExportContent(news)).includes('Causas y consecuencias'));

let calls=0;
const translator=createReportTranslator({provider:{isConfigured:()=>true,generate:async request=>{
  calls++;assert(!request.tools,'La prueba no investiga ni llama a servicios externos');const payload=JSON.parse(request.prompt);
  return {text:JSON.stringify({language:payload.language,translations:payload.translations.map(item=>({id:item.id,text:'Translated: '+item.text}))})};
}}});
const localized=await translator.localize({report:prepared,language:'en'});
assert(calls>0);assert(!base.causeText && !prepared.causeText,'El glosario traducido no altera ni sustituye los datos guardados');
assert.match(weeklyReport(localized.report,{t:reportLabels('en').t,source:localized.source}).causes.groups[0].factors,/^Translated:/);
// The browser has translated data but no server-side reverse lookup.
const browserModel=weeklyReport(localized.report,{t:reportLabels('en').t});
assert.match(browserModel.causes.groups[0].rows[0].impact,/^Translated:/);
assert.equal(browserModel.causes.title,'Causes and consequences');
const translatedFx=await translator.localize({report:_test.executivePayload(fx),language:'en'});
const translatedFxModel=weeklyReport(translatedFx.report,{t:reportLabels('en').t});
assert.equal(translatedFxModel.visuals.length,1,'Las unidades traducidas conservan las dos gráficas agrupadas');
assert.match(translatedFxModel.causes.groups[0].rows[0].impact,/^Translated:/);

const {getDocument}=await import('../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const bytes=await _test.makeExecutivePdf(base.title,prepared),task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true}),pdf=await task.promise;
assert(pdf.numPages<=2,'El corte corto y su anexo conservan un tamaño acotado con las gráficas legibles');
let pdfText='';
for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++) {
  const page=await pdf.getPage(pageNumber),items=(await page.getTextContent()).items;
  if(pdf.numPages>1 && pageNumber===pdf.numPages) {const lastText=items.map(item=>item.str).join(' ');assert(/Cómo se transmite|Qué repercusiones|Qué falta confirmar/.test(lastText),'La última hoja contiene datos del anexo, no sólo una cita aislada');}
  for(const item of items.filter(item=>item.str.trim() && item.transform[5]>60 && item.transform[5]<775)) assert(item.transform[4]>=35 && item.transform[4]+item.width<=577,'Anexo dentro de los márgenes de impresión');
  pdfText+=items.map(item=>item.str).join(' ')+'\n';
}
assert(pdfText.includes('CAUSAS Y CONSECUENCIAS') && pdfText.includes('Revisar clima') && pdfText.includes('2026-10-15'));
assert(!pdfText.includes('EXPLICACION_ANTERIOR_OCULTA'));
await task.destroy();
if(process.argv.includes('--preview')) {await fs.mkdir('output/causas-consecuencias',{recursive:true});await fs.writeFile('output/causas-consecuencias/anexo-granos-simulacion.pdf',bytes);}
console.log('Causas y consecuencias: alzas/bajas, origen, impactos por mercado, límites de evidencia, guardado, traducción y PDF OK');
