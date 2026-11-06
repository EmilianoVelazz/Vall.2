import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {weeklyReport} from '../shared/report-weekly.mjs';
import {reportDisplayTexts} from '../shared/report-localized-text.mjs';
const require=createRequire(import.meta.url);
const {createReportTranslator}=require('../backend/services/report-translation');
const {reportLabels}=require('../backend/lib/report-language');
const catalog=require('../shared/report-languages.json');
const {input,time}=require('./lib/mexico-report-fixture.cjs');
const mexico=require('../backend/services/mexico-executive-reports').buildMexicoReports(input,time);
const cache=JSON.parse(await fs.readFile('backend/cache/market_executive_reports.json','utf8'));
const reports=[...mexico,...cache.reports.filter(report=>['proteins','grains','energy_metals','market_news'].includes(report.key)).map(report=>({...report,collection:'markets'}))];
const letters=id=>id<26 ? String.fromCharCode(97+id) : letters(Math.floor(id/26)-1)+letters(id%26);
// Every requested phrase gets a unique, deterministic target string. Any source
// sentence left in the rendered model therefore exposes missing text coverage.
const provider={isConfigured:()=>true,generate:async request=>{
  const data=JSON.parse(request.prompt),prefix={en:'Translated passage',fr:'Texte traduit',it:'Testo tradotto',de:'Übersetzter Text',ja:'翻訳文'}[data.language];
  return {text:JSON.stringify({language:data.language,translations:data.translations.map(item=>({id:item.id,text:prefix+' '+letters(item.id)+' '+(item.text.match(/__VNT_\w+_\d+_\d+__/g)||[]).join(' ')}))})};
}};
const translator=createReportTranslator({provider});
const visible=model=>reportDisplayTexts({summary:model.summary,coverage:model.coverage,metrics:model.metrics,blocks:model.blocks,results:model.results,visuals:model.visuals,commentary:model.commentary,followup:model.followup,followupHeading:model.followupHeading,proteinSheets:model.proteinSheets,proteinCountries:model.proteinCountries});
for(const language of ['en','fr','it','de','ja'])for(const report of reports){
  const original=JSON.stringify(report),base=weeklyReport(report),localized=await translator.localize({report,language},{owner:'fixture@example.invalid'}),model=weeklyReport(localized.report,{t:reportLabels(language).t});
  assert.equal(JSON.stringify(report),original,'La traducción no modifica el corte original');
  assert.equal(model.references.length,base.references.length,report.key+': misma cobertura');
  assert.deepEqual(model.references.map(item=>item.points),base.references.map(item=>item.points),report.key+': mismas observaciones y fechas');
  assert.equal(model.results.reduce((sum,item)=>sum+item.rows.length,0),base.results.reduce((sum,item)=>sum+item.rows.length,0),report.key+': mismas filas');
  const shown=visible(model),remaining=[...new Set(visible(base))].filter(text=>{
    const expected=localized.report.causeText?.[text] || reportLabels(language).t(text);
    return expected!==text && shown.includes(text);
  });
  assert.deepEqual(remaining,[],language+' / '+report.key+': ningún fragmento traducible queda en español');
  const hybrids=shown.filter(text=>/\b(?:referencias con|conserva su|por entidad|al alza|a la baja|sin cambio|Las comparaciones|La comparación|El corte|Cada tabla|por contrastar)\b/.test(text));
  assert.deepEqual(hybrids,[],language+' / '+report.key+': sin frases reconstruidas con idiomas mezclados');
  if(report.key==='proteins')assert.equal(model.proteinSheets.length,base.proteinSheets.length,'La traducción conserva las siete familias');
}
const annual={...mexico[0],periodType:'annual',reportYear:2025};
assert.equal((await translator.localize({report:annual,language:'en'})).report.reportYear,2025,'La librería anual admite traducción sin anexo diario');
for(const text of ['Tablilla','Cobertura de América','Lectura del mercado','Pollo','Huevo','Estados Unidos','Canadá','Desliza la tablilla para ver todas las columnas.'])assert(catalog.labels[text]?.length===5,'Interfaz nativa completa: '+text);
let unchangedCalls=0;
const unchanged=createReportTranslator({provider:{isConfigured:()=>true,generate:async request=>{unchangedCalls++;const data=JSON.parse(request.prompt);return {text:JSON.stringify({language:data.language,translations:data.translations.map(item=>({id:item.id,text:item.text}))})};}}});
await assert.rejects(unchanged.localize({report:{title:'Prueba',summary:'Las referencias del informe conservan las fechas y las unidades de cada mercado para comparar con los valores anteriores.',generatedAt:time.toISOString(),tables:[],visuals:[],metrics:[],sections:[]},language:'en'}),error=>error.code==='REPORT_TRANSLATION_INVALID','No aceptar una traducción que conserva párrafos completos en español');
assert(unchangedCalls>=2,'Se intenta reparar el texto antes de rechazar una traducción parcial');
console.log('Traducción: OK · México y mercados en cinco idiomas, títulos, filas, gráficas, causas, familias y librería anual.');
