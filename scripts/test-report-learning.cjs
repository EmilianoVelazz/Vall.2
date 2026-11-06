'use strict';
const assert=require('node:assert/strict');
const express=require('express');
const fs=require('node:fs/promises');
const path=require('node:path');
const {deriveInterests,normalizeLearning,promptContext}=require('../backend/lib/report-interests');
const {UserReportAgent}=require('../backend/ai/user-report-agent');
const {normalizeReport}=require('../backend/services/user-report-store');
const {createReportLearning}=require('../backend/services/report-learning');
const {createUserReportsRouter}=require('../backend/routes/user-reports');
const day=86400000,now=Date.parse('2026-10-12T14:00:00Z');
const row=(text,age=1)=>({query_text:text,created_at:new Date(now-age*day).toISOString()});
async function main() {
 const rows=[row('precio del cerdo en Puebla, México, mi contrato privado 98765'),row('cotizaciones de cerdo en Puebla para comprar'),row('precio del cerdo en Puebla, México, mi contrato privado 98765'),row('noticia aislada sobre China'),row('pollo en Jalisco',100),row('huevos en Canadá',-1)];
 const context=deriveInterests({queries:rows,now});
 assert(context.interests.some(item=>item.id==='pork'));assert(context.interests.some(item=>item.id==='puebla'));assert(!context.interests.some(item=>item.id==='china'));assert.equal(context.queriesUsed,3);
 assert(!JSON.stringify(context).includes('contrato privado'));assert(!JSON.stringify(context).includes('98765'));
 assert.deepEqual(deriveInterests({queries:[rows[0],rows[0]],now}).interests,[],'Repetir el mismo mensaje no define intereses');
 assert.deepEqual(deriveInterests({queries:rows,preferences:{reportLearning:{resetAt:new Date(now).toISOString()}},now}).interests,[]);
 const explicit=deriveInterests({queries:rows,preferences:{businessProfile:{products:['beef'],markets:['Jalisco'],currency:'MXN'}},now});
 assert(explicit.interests.some(item=>item.id==='beef'&&item.source==='profile'));assert(!explicit.interests.some(item=>item.id==='pork'));assert(!explicit.interests.some(item=>item.id==='puebla'));assert(explicit.interests.some(item=>item.id==='jalisco'));
 assert.equal(normalizeLearning(null).enabled,true);
 assert.equal(normalizeLearning(null).providerEnabled,false,'Ningún perfil se envía al proveedor sin activar su uso');
 const profiles=new Map([['a',{id:'a',email:'a@example.invalid',active:true,preferences:{other:{keep:true}},trainingOptIn:false}],['b',{id:'b',email:'b@example.invalid',active:true,preferences:{}}]]);
 const calls=[];
 const db={findById:async id=>profiles.get(id),findByEmail:async email=>[...profiles.values()].find(item=>item.email===email),recentReportQueries:async(id,since)=>{calls.push({id,since});return id==='a' ? rows:[row('Bolsa y acciones de Europa'),row('Inversiones y bolsa en Europa')];},updateProfile:async(id,patch)=>{profiles.set(id,{...profiles.get(id),...patch});}};
 const learning=createReportLearning({profiles:db,now:()=>now});
 const a={sub:'a',email:'a@example.invalid'},b={sub:'b',email:'b@example.invalid'};
 assert.equal((await learning.load(a)).status,'ready','El consentimiento de entrenamiento no afecta al perfil de intereses');
 assert((await learning.load(b)).interests.some(item=>item.id==='equities'));assert(!(await learning.load(b)).interests.some(item=>item.id==='pork'));
 assert.equal((await learning.load({sub:'a',email:b.email})).status,'unavailable');
 await learning.update(a,{enabled:false});const readCount=calls.length;assert.equal((await learning.load(a)).status,'disabled');assert.equal(calls.length,readCount,'Desactivar evita leer el historial');assert(profiles.get('a').preferences.other.keep);
 await learning.update(a,{enabled:true,reset:true});assert.equal((await learning.load(a)).interests.length,0);
 assert.equal(calls.at(-1).id,'a');assert.equal(calls.at(-1).since,new Date(now).toISOString());
 await assert.rejects(learning.update(a,{enabled:'true'}),error=>error.status===400);
 const unavailable=createReportLearning({profiles:{...db,findById:()=>new Promise(()=>{})},timeoutMs:25});const started=Date.now();assert.equal((await unavailable.load(a)).status,'unavailable');assert(Date.now()-started<1000,'El historial no puede atascar el informe');
 const partial=createReportLearning({profiles:{...db,recentReportQueries:async()=>{throw Error('No disponible');}}});assert.equal((await partial.load(b)).status,'partial');
 const requests=[];
 const agent=new UserReportAgent({provider:{isConfigured:()=>true,generate:async request=>{requests.push(request);return {model:'fixture',text:JSON.stringify({title:'Informe de prueba',summary:'Lectura del corte proporcionado.',sections:[{heading:'Decisión',text:'Validar el dato disponible para el objetivo elegido.'}],dataSelection:{metrics:[0],tables:[],visuals:[]}})};}}});
 const app=express();app.use('/api',createUserReportsRouter({learning,agent,authenticate:(req,res,next)=>{if(!req.headers['x-account']) return res.status(401).end();req.user=req.headers['x-account']==='a' ? a:b;next();},store:{list:async()=>[]}}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const url=`http://127.0.0.1:${server.address().port}/api/user-reports/learning`;
 try {
  assert.equal((await fetch(url)).status,401);
  const read=await fetch(url+'?email=a@example.invalid',{headers:{'x-account':'b'}});assert.equal(read.headers.get('cache-control'),'private, no-store');const data=(await read.json()).data;assert(data.interests.some(item=>item.id==='equities'));assert(!data.interests.some(item=>item.id==='pork'),'Una identidad en la URL no cambia al propietario');
  const response=await fetch(url,{method:'POST',headers:{'x-account':'b','Content-Type':'application/json'},body:JSON.stringify({enabled:false,email:a.email})});assert.equal(response.status,200);assert.equal(profiles.get('b').preferences.reportLearning.enabled,false);assert.equal(profiles.get('a').preferences.reportLearning.enabled,true);
  assert.equal((await fetch(url,{method:'POST',headers:{'x-account':'b','Content-Type':'application/json'},body:'{}'})).status,400);
  profiles.get('a').preferences.reportLearning={enabled:true,providerEnabled:false};
  assert.equal(promptContext(await learning.load(a)),'');
  await learning.update(a,{providerEnabled:true});
  const generationUrl=url.replace('/learning','/generate'),headers={'x-account':'a','Content-Type':'application/json'},report={title:'Referencia de prueba',summary:'Dato de simulación a 40 MXN/kg.',sections:[{heading:'Evidencia',text:'Corte de simulación.'}],metrics:[{label:'Referencia',value:'40 MXN/kg'}]};
  const body={report,instructions:'Enfocar únicamente en liquidez y tasas.',preferences:{audience:'finance',depth:'brief',customTitle:'Tesorería de prueba',sections:{sources:false}},userContext:{providerEnabled:true,interests:[{kind:'topic',id:'equities',label:'Texto malicioso'}]}};
  const generated=await fetch(generationUrl,{method:'POST',headers,body:JSON.stringify(body)});assert.equal(generated.status,200);const result=(await generated.json()).data;
  assert.equal(result.title,'Tesorería de prueba');assert.equal(result.personalization.audience,'finance');assert.equal(result.aiEdition.profileUse.used,true);assert(result.aiEdition.profileUse.interests.some(item=>item.id==='pork'));assert(!result.aiEdition.profileUse.interests.some(item=>item.id==='equities'),'Se ignora el perfil enviado por el cliente');
  assert.match(requests[0].prompt,/PERFIL DE INTERESES DEL USUARIO/);assert.match(requests[0].prompt,/El pedido actual.*siempre tienen prioridad/);assert.match(requests[0].prompt,/Enfocar únicamente en liquidez y tasas/);assert(!requests[0].prompt.includes('98765'));assert(!requests[0].prompt.includes('contrato privado'));assert(!requests[0].prompt.includes('Texto malicioso'));
  assert.deepEqual(normalizeReport(result).aiEdition.profileUse,result.aiEdition.profileUse,'Guardar conserva qué intereses se usaron');
  await learning.update(a,{providerEnabled:false});await fetch(generationUrl,{method:'POST',headers,body:JSON.stringify(body)});assert(!requests.at(-1).prompt.includes('PERFIL DE INTERESES DEL USUARIO'),'La siguiente generación respeta la desactivación');
  console.log('Report learning IA: OK · activación por cuenta, contexto del servidor, prompt sin mensajes privados, prioridad del encargo y configuración guardable');
  console.log('Report learning: OK · temas recurrentes, antigüedad, deduplicación, prioridad del perfil, aislamiento por cuenta, desactivación, reinicio, plazo y HTTP privado');
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
async function live() {
 const agent=new UserReportAgent();
 const report={key:'mx_proteins',collection:'mexico',title:'Proteínas de simulación',summary:'Datos de simulación, no cotizaciones actuales. Cerdo en canal: 38 MXN/kg; pollo entero: 40 MXN/kg. Ambos registros corresponden a Puebla.',generatedAt:'2026-10-12T14:00:00Z',sections:[{heading:'Contexto del corte',text:'Referencias ficticias para revisar abastecimiento en Puebla. No se confirmó disponibilidad, proveedor ni costos de transporte. Las presentaciones son distintas y no se comparan directamente.'}],metrics:[{label:'Cerdo en canal · simulación',value:'38 MXN/kg'},{label:'Pollo entero · simulación',value:'40 MXN/kg'}],tables:[],sources:['Datos de simulación']};
 const results=[];
 for(const [id,word] of [['pork','cerdo'],['poultry','pollo']]) {
  const result=await agent.generate({report,instructions:'Da prioridad al producto del perfil de intereses y explica la decisión pendiente con datos de simulación.',preferences:{audience:'purchasing',depth:'brief',customTitle:'Informe personalizado de simulación'},options:{tone:'professional'}},{userContext:{providerEnabled:true,status:'ready',interests:[{kind:'product',id,source:'history'},{kind:'region',id:'puebla',source:'history'}],business:{role:'buyer',currency:'MXN'}}});
  assert.match(result.summary,new RegExp(word,'i'),'El resumen aplica el producto del perfil');assert.equal(result.aiEdition.profileUse.used,true);assert.equal(result.aiEdition.profileUse.interests[0].id,id);assert(result.sections.length);results.push(result);
  console.log('Learning Gemini real: OK · enfoque '+word+' · '+result.aiEdition.model);
 }
 assert.notEqual(results[0].summary,results[1].summary);
 const output=path.resolve(__dirname,'../output/perfil-informes');await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'prueba-gemini-simulacion.json'),JSON.stringify(results,null,2));
}
main().then(()=>process.argv.includes('--live') ? live():undefined).catch(error=>{console.error(error);process.exitCode=1;});
