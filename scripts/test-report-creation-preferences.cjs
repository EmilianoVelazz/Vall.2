'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {UserReportAgent}=require('../backend/ai/user-report-agent');
const {createUserReportStore}=require('../backend/services/user-report-store');
const {normalizePreferenceOverrides}=require('../backend/lib/report-preference-overrides');
const {normalizeAiCustomization,createScheduledReportDelivery}=require('../backend/services/report-scheduled-delivery');
const fields=require('../shared/report-creation-fields.json');

async function main() {
 const report={title:'Material de simulación',summary:'Referencia de 40 MXN/kg.',sections:[{heading:'Referencia',text:'Dato proporcionado para pruebas.'}],metrics:[{label:'Pollo',value:'40 MXN/kg'}],tables:[{title:'Precios de simulación',columns:['Producto','Referencia'],rows:[['Pollo','40 MXN/kg']]}],visuals:[{type:'bar',title:'Referencia visual',unit:'MXN/kg',bars:[{label:'Pollo',value:40}]}],sourceLinks:[{label:'Fuente de simulación',url:'https://example.invalid/datos'}]};
 const original=JSON.stringify(report),blocks=['indicators','charts','tables','risks','sources'];let prompt;
 const inferred={audience:'general',depth:'standard',decisionHorizon:'current',customTitle:'Propuesta automática',recipientName:'',organization:'',objective:'',confidentiality:'internal',sections:Object.fromEntries(blocks.map(key=>[key,true]))};
 const agent=new UserReportAgent({provider:{isConfigured:()=>true,generate:async options=>{
  prompt=options.prompt;return {model:'fixture',text:JSON.stringify({title:'Propuesta automática',summary:'Referencia disponible: 40 MXN/kg.',sections:[{heading:'Validación',text:'Confirmar las condiciones antes de decidir.'}],watchlist:['Verificar la vigencia de la referencia.'],preferences:inferred,tone:'professional',dataSelection:{metrics:[],tables:[],visuals:[]}})};
 }}});
 let generated;
 for(let mask=0;mask<32;mask++) {
  const sections=Object.fromEntries(blocks.map((key,index)=>[key,Boolean(mask&(1<<index))]));
  const preferences={...inferred,audience:'purchasing',depth:'detailed',decisionHorizon:'quarter',customTitle:'Plan solicitado',recipientName:'Jefatura',organization:'Empresa de simulación',objective:'Preparar el abastecimiento',confidentiality:'confidential',sections};
  generated=await agent.generate({report,preferences,instructions:'Hazlo sencillo y propón el formato que consideres.',options:{mode:'instructions',preferenceOverrides:fields}});
  assert.match(prompt,/ELECCIONES EXPLÍCITAS DEL USUARIO/);assert.match(prompt,/Preparar el abastecimiento/);
  for(const key of fields.filter(key=>!key.startsWith('sections.'))) assert.equal(generated.personalization[key],preferences[key],'Respetar '+key+' aunque el modelo sugiera otra opción');
  for(const [key,field] of [['indicators','metrics'],['charts','visuals'],['tables','tables'],['sources','sourceLinks']]) {
   assert.equal(generated[field].length,sections[key] ? 1 : 0,'Selección explícita de '+key+' con máscara '+mask);
   if(sections[key]) assert.deepEqual(generated[field],require('../backend/ai/user-report-agent').sourceReport(report)[field],'Conservar la evidencia completa');
  }
  assert.equal(generated.watchlist.length,sections.risks ? 1 : 0);assert.deepEqual(generated.aiEdition.preferenceOverrides,fields);
 }
 assert.equal(JSON.stringify(report),original,'La selección no modifica el material base');
 const automatic=await agent.generate({report,instructions:'Propón el formato',options:{mode:'instructions'}});assert.equal(automatic.title,'Propuesta automática');assert.equal(automatic.aiEdition.preferenceOverrides,undefined,'Los pedidos libres mantienen su interpretación');
 for(const value of [['__proto__'],['sections.desconocido'],'audience',{},[...fields,'audience']]) assert.throws(()=>normalizePreferenceOverrides(value),error=>error.status===400);
 assert.deepEqual(normalizePreferenceOverrides(['depth','depth']),['depth']);
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-creation-preferences-'));
 try {
  const store=createUserReportStore({directory}),owner='fixture@example.invalid';const saved=await store.save(owner,{report:generated});
  assert.deepEqual((await store.get(owner,saved.editionId)).aiEdition.preferenceOverrides,fields,'El guardado y la recarga conservan las elecciones');
  const ai=normalizeAiCustomization({enabled:true,mode:'instructions',instructions:'Conserva mi enfoque',preferenceOverrides:fields});let next;
  await createScheduledReportDelivery({store:{due:async()=>[{id:'fixture',area:'markets',reportKey:'proteins',ownerEmail:owner,preferences:{...generated.personalization,aiCustomization:ai},delivery:{frequency:'daily',time:'08:00'}}],record:async()=>{}},collections:require('../shared/report-collections.json'),loadSnapshot:async()=>({reports:[{...report,key:'proteins'}]}),generate:async request=>{next=request;return generated;},prepare:value=>value,deliver:async()=>{}})();
  assert.deepEqual(next.options.preferenceOverrides,fields,'Las entregas simuladas usan las mismas elecciones');
 } finally {await fs.rm(directory,{recursive:true,force:true});}
 console.log('Report creation preferences: OK · 32 combinaciones, preferencias explícitas, respaldo completo, petición libre, validación, guardado, recarga y entrega simulada');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
