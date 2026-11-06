import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {reportSectorFormat} from '../frontend/src/lib/reportSectorFormat.js';
const require=createRequire(import.meta.url);
const formats=require('../shared/report-sector-formats.json');
const collections=require('../shared/report-collections.json');
const {sectorFormat,enrichSectorReport}=require('../backend/lib/report-sector-format');
const {normalizeReport}=require('../backend/services/user-report-store');
const {UserReportAgent}=require('../backend/ai/user-report-agent');
const {ExecutiveReportAgent}=require('../backend/ai/executive-report-agent');
const {buildMexicoReports,createMexicoReports}=require('../backend/services/mexico-executive-reports');
const {input,time}=require('./lib/mexico-report-fixture.cjs');
const audiences={general:'Comité directivo',finance:'Finanzas y tesorería',purchasing:'Compras y abastecimiento',operations:'Operaciones',commercial:'Dirección comercial'};

async function tests() {
  let count=0,prompt='';
  const agent=new UserReportAgent({provider:{isConfigured:()=>true,generate:async request=>{
    prompt=request.prompt;assert.match(request.systemInstruction,/COBERTURA SECTORIAL/);assert.match(request.systemInstruction,/no transcribas sus filas/);
    return {model:'fixture',text:JSON.stringify({title:'Edición sectorial',summary:'Análisis basado en el corte de prueba.',sections:[{heading:'Datos pendientes',text:'Contrastar la evidencia con el inventario interno.'}],dataSelection:{metrics:[0],visuals:[],tables:[0,1]}})};
  }}});
  for(const [collection,items] of Object.entries(formats)) {
    assert.deepEqual(Object.keys(items).sort(),[...collections[collection].reportKeys].sort());
    for(const [key,definition] of Object.entries(items)) {
      count++;assert(definition.topics.length>=4 && definition.topics.length<=6);
      assert(definition.topics.every(topic=>topic.heading && topic.question && topic.inputs));
      const base={key,collection,title:definition.label,generatedAt:time.toISOString(),summary:'Precio de prueba: 40 MXN/kg.',sections:[{heading:'Referencia',text:'Material de simulación'}],metrics:[{label:'Referencia',value:'40 MXN/kg'}],tables:[{title:'Datos originales',columns:['Dato'],rows:[['40 MXN/kg']]}]};
      const before=JSON.stringify(base),expanded=enrichSectorReport(base,collection);
      assert.equal(JSON.stringify(base),before,'Enriquecer no cambia el informe base');
      assert.equal(expanded.tables[0],base.tables[0],'Conservar la evidencia');assert.equal(expanded.tables[1].kind,'guide');
      assert.match(expanded.tables[1].note,/no acredita/);
      assert.strictEqual(enrichSectorReport(expanded,collection),expanded,'No duplicar la guía');
      assert.equal(normalizeReport(expanded).tables[1].kind,'guide','La distinción sobrevive al guardado y al PDF');
      assert.deepEqual(reportSectorFormat(base),sectorFormat(base),'Pantalla e IA utilizan el mismo formato');
      for(const [audience,label] of Object.entries(audiences)) {
        const result=await agent.generate({report:expanded,preferences:{audience,depth:'detailed'},instructions:'Desarrolla el sector con los datos disponibles.'});
        assert(prompt.includes(label));for(const topic of definition.topics) assert(prompt.includes(topic.heading));
        assert.deepEqual(result.metrics,normalizeReport(expanded).metrics);assert.deepEqual(result.tables,normalizeReport(expanded).tables);
        assert.equal(result.baseReport.collection,collection);assert.equal(result.baseReport.key,key);
      }
    }
  }
  assert.equal(count,14);
  assert.equal(sectorFormat({key:'overview'}),null,'No confundir Finanzas y Mercados');
  assert.equal(sectorFormat({key:'overview',collection:'other'}),null);
  assert.equal(sectorFormat({key:'manual',title:'Proteínas'}),null,'El título no impone un sector');
  const owned={key:'draft',baseReport:{collection:'mexico',key:'mx_proteins'}};assert.equal(reportSectorFormat(owned).label,formats.mexico.mx_proteins.label);
  const evidence=enrichSectorReport({key:'proteins',collection:'markets',title:'Proteínas',summary:'Referencia de simulación: 40 MXN/kg.',metrics:[{label:'Dato original',value:'40 MXN/kg'}],tables:[{title:'Detalle original',columns:['Dato'],rows:[['40 MXN/kg']]}]},'markets');
  const synthesize=new UserReportAgent({provider:{isConfigured:()=>true,generate:async()=>({text:JSON.stringify({title:'Síntesis',summary:'Lectura del corte.',sections:[{heading:'Análisis',text:'Validar disponibilidad.'}],tables:[{title:'Tabla de síntesis',columns:['Validación'],rows:[['Cotización del proveedor']]}],dataSelection:{metrics:[],tables:[],visuals:[]}})})}});
  const full=await synthesize.generate({report:evidence,preferences:{depth:'detailed'}});
  assert.deepEqual(full.tables.slice(0,2),normalizeReport(evidence).tables,'Una síntesis no reemplaza el respaldo del formato completo');
  assert.deepEqual(full.metrics,normalizeReport(evidence).metrics);assert.equal(full.tables[2].title,'Tabla de síntesis');
  const excluded=await synthesize.generate({report:evidence,preferences:{depth:'detailed',sections:{tables:false,indicators:false}}});
  assert.deepEqual(excluded.tables,[]);assert.deepEqual(excluded.metrics,[],'Las exclusiones conservan prioridad sobre el respaldo');
  let repairs=0;
  const retry=new UserReportAgent({provider:{isConfigured:()=>true,generate:async options=>{
    if(repairs++) assert.match(options.prompt,/Elimina las cifras no proporcionadas: 31/);
    return {text:JSON.stringify({title:'Revisión',summary:repairs===1 ? '31 entidades pendientes.' : 'Hay entidades pendientes.',sections:[{heading:'Cobertura',text:'No extrapolar datos de otras plazas.'}]})};
  }}});
  await retry.generate({report:evidence,preferences:{depth:'detailed'}});assert.equal(repairs,2,'El reintento identifica y elimina las cifras nuevas');
  const editorial=new ExecutiveReportAgent({provider:{isConfigured:()=>false}});
  const executive=await editorial.enrich([{key:'fx',title:'Divisas',summary:'Referencia'}],{area:'Finanzas'});
  assert.equal(executive[0].tables[0].kind,'guide','La guía existe aunque no esté disponible la IA');
  for(const report of buildMexicoReports(input,time)) assert.equal(report.tables.at(-1).kind,'guide');
  const oldSnapshot={reports:[{key:'mx_proteins',summary:'Corte anterior'}],generatedAt:time.toISOString(),expiresAt:new Date(time.getTime()+60000).toISOString()};
  const cached=createMexicoReports({reportStore:{load:async()=>oldSnapshot},now:()=>time,loaders:{macro:()=>{throw Error('No debe actualizar el corte para aplicar el formato');}}});
  const visible=await cached.get();assert.equal(visible.reports[0].tables[0].kind,'guide');assert.equal(visible.generatedAt,oldSnapshot.generatedAt);assert.equal(oldSnapshot.reports[0].tables,undefined);
  console.log('Sector formats: OK · 14 perfiles, cinco audiencias, evidencia intacta, guía diferenciada, IA, guardado y origen');
}
async function live() {
  require('dotenv').config({path:'backend/.env',quiet:true});require('../backend/lib/tls-trust').configureSystemTrust();
  const {GeminiProvider}=require('../backend/ai/providers/gemini-provider');
  const provider=new GeminiProvider();let response;
  const agent=new UserReportAgent({provider:{isConfigured:()=>provider.isConfigured(),generate:async options=>{response=await provider.generate(options);return response;}}});
  const report=buildMexicoReports(input,time).find(item=>item.key==='mx_proteins');
  const instructions='Informe completo para una empresa de res, cerdo, huevo y pollo. Usa únicamente estos datos de simulación, conserva todos los datos originales y desarrolla los frentes pertinentes del formato sectorial. Señala qué información comercial, operativa y de sanidad falta, sin cotizaciones ni hechos actuales nuevos.';
  let result;
  try {result=await agent.generate({report,preferences:{audience:'purchasing',depth:'detailed',decisionHorizon:'month'},instructions});}
  catch(error) {const fs=require('node:fs/promises');await fs.mkdir('output/reportes-sectoriales',{recursive:true});await fs.writeFile('output/reportes-sectoriales/fixture-ia-diagnostico.json',response?.text || 'Sin respuesta');throw error;}
  assert(result.sections.length>=5,'El modo completo desarrolla varias dimensiones');
  assert(result.tables.length>=report.tables.length,'Conserva el respaldo completo');
  assert.deepEqual(result.tables.slice(0,report.tables.length),normalizeReport(report).tables);
  assert.deepEqual(result.metrics,normalizeReport(report).metrics);
  assert.equal(result.baseReport.key,'mx_proteins');
  const narrative=JSON.stringify(result.sections);
  for(const pattern of [/log[ií]stic|flete|fr[ií]o/i,/sanidad|sanitari/i,/margen|merma|rendimiento/i,/demanda|consumo/i]) assert.match(narrative,pattern);
  console.log(JSON.stringify({live:'OK',model:result.aiEdition.model,sections:result.sections.map(section=>section.heading),tables:result.tables.length,metrics:result.metrics.length,origin:result.baseReport.key}));
}
await (process.argv.includes('--live') ? live() : tests());
