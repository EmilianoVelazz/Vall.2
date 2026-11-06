'use strict';
const assert=require('node:assert/strict');
const express=require('express');
const jwt=require('jsonwebtoken');
if(process.argv.includes('--live')) {require('dotenv').config({path:'backend/.env',quiet:true});require('../backend/lib/tls-trust').configureSystemTrust();}
const {UserReportAgent,outputReport,sourceReport}=require('../backend/ai/user-report-agent');
const report={title:'Informe de prueba',summary:'Referencia de prueba: pollo a 40 MXN/kg.',generatedAt:'2026-10-08T12:00:00Z',sections:[{heading:'Abastecimiento',text:'Dato proporcionado para una simulación.'}],metrics:[{label:'Pollo',value:'40 MXN/kg'}],tables:[{title:'Precio de prueba',columns:['Producto','Referencia'],rows:[['Pollo','40 MXN/kg']]}],sourceLinks:[{label:'Fuente de prueba',url:'https://example.org/prueba'}],personalization:{recipientName:'Dato privado que no se necesita',organization:'Empresa privada'}};
const edition={title:'Plan de compras',summary:'La referencia proporcionada es 40 MXN/kg.',objective:'Preparar decisiones de abastecimiento',sections:[{heading:'Compras',text:'Contrastar disponibilidad y condiciones del proveedor antes de comprar.'}],closing:'Solicitar una cotización vigente.',takeaways:['Mantener trazabilidad del dato'],watchlist:['La referencia es un dato de prueba'],dataSelection:{metrics:[0],tables:[0],visuals:[]}};
async function tests() {
    let calls=0,prompt;
    const provider={isConfigured:()=>true,generate:async options=>{calls++;prompt=options.prompt;assert.equal(options.json,true);assert(options.signal);assert.match(options.systemInstruction,/CALIDAD EJECUTIVA/);assert.match(options.systemInstruction,/evidencia observada, implicación para el negocio y seguimiento/);assert.match(options.systemInstruction,/No inventes probabilidades/);return {text:JSON.stringify({...edition,...(options.prompt.includes('Crea un plan general') ? {summary:'Plan general sin cotizaciones',dataSelection:{metrics:[],tables:[],visuals:[]}} : {}),metrics:[{value:'99999'}],sourceLinks:[{url:'https://evil.example'}]}),model:'fixture'};}};
    const agent=new UserReportAgent({provider});
    const generated=await agent.generate({report,instructions:'Adáptalo a compras de proteínas para mi jefe',options:{audience:'purchasing',tone:'simple',length:'brief'}});
    assert.match(prompt,/compras de proteínas para mi jefe/);assert.match(prompt,/Compras y abastecimiento/);assert.match(prompt,/Claro y sencillo/);
    assert(!prompt.includes(report.personalization.recipientName),'No enviar los metadatos del destinatario');
    assert.deepEqual(generated.metrics,sourceReport(report).metrics);assert.deepEqual(generated.tables,sourceReport(report).tables);assert.deepEqual(generated.sourceLinks,report.sourceLinks);
    assert.equal(generated.aiEdition.model,'fixture');assert.equal(calls,1);
    assert.equal(report.title,'Informe de prueba','La base no se modifica');
    const interpretedPreferences={audience:'purchasing',depth:'brief',decisionHorizon:'month',customTitle:'Plan solicitado',recipientName:'Jefatura',organization:'',objective:'Revisar abastecimiento',confidentiality:'internal',sections:{indicators:true,charts:true,tables:false,risks:true,sources:true}};
    let instructionPrompt,instructionSystem;
    const interpreting=new UserReportAgent({provider:{isConfigured:()=>true,generate:async options=>{instructionPrompt=options.prompt;instructionSystem=options.systemInstruction;return {text:JSON.stringify({...edition,title:'Plan solicitado',preferences:interpretedPreferences,tone:'simple'})};}}});
    const interpreted=await interpreting.generate({report,instructions:'Titúlalo Plan solicitado. Hazlo breve para compras y Jefatura, a 30 días. No incluyas tablas. Conserva gráficas y fuentes.',preferences:{customTitle:'Título anterior',audience:'finance',depth:'detailed',decisionHorizon:'year',sections:{charts:false}},options:{mode:'instructions'}});
    assert.equal(interpreted.title,'Plan solicitado','El título interpretado sustituye el ajuste anterior');assert.equal(interpreted.aiEdition.preferences.audience,'purchasing');assert.equal(interpreted.aiEdition.preferences.depth,'brief');assert.equal(interpreted.aiEdition.tone,'simple');assert.equal(interpreted.aiEdition.mode,'instructions');assert.equal(interpreted.personalization.sections.charts,true);assert.deepEqual(interpreted.tables,[]);assert.deepEqual(interpreted.sourceLinks,report.sourceLinks);
    assert.match(instructionPrompt,/sólo valores por defecto/);assert.match(instructionSystem,/respeta negaciones/i);assert(!instructionPrompt.includes('usa un resumen de dos párrafos'),'Un ajuste detallado anterior no impone la extensión');
    await assert.rejects(interpreting.generate({report,instructions:' ',preferences:{},options:{mode:'instructions'}}),error=>error.status===400);
    await assert.rejects(new UserReportAgent({provider:{isConfigured:()=>true,generate:async()=>({text:JSON.stringify({...edition,preferences:{...interpretedPreferences,objective:'Ganar 99999999'},tone:'simple'})})}}).generate({report,instructions:'Para compras',options:{mode:'instructions'}}),/añadió cifras/,'Los metadatos interpretados también requieren respaldo');
    const settings={audience:'finance',depth:'detailed',decisionHorizon:'year',objective:'Evaluar liquidez',customTitle:'Plan de tesorería',recipientName:'Destinatario elegido',organization:'Empresa elegida',confidentiality:'confidential',sections:{indicators:false,charts:false,tables:false,risks:false,sources:false}};
    const configured=await agent.generate({report,preferences:settings,instructions:''});
    assert.equal(configured.title,settings.customTitle,'Se respeta el título aunque el modelo proponga otro');
    assert.match(prompt,/Finanzas y tesorería/);assert.match(prompt,/Detallado con evidencia/);assert.match(prompt,/Próximos 12 meses/);assert.match(prompt,/Evaluar liquidez/);assert.match(prompt,/Destinatario elegido/);assert.match(prompt,/Empresa elegida/);assert.match(prompt,/confidential/);
    assert.deepEqual(configured.personalization.sections,settings.sections);assert.equal(configured.personalization.recipientName,settings.recipientName);assert.equal(configured.aiEdition.preferences.decisionHorizon,'year');
    for(const key of ['metrics','visuals','tables','watchlist','sources','sourceLinks']) assert.deepEqual(configured[key],[],'La IA no puede reintroducir '+key+' excluidos');
    for(let mask=0;mask<32;mask++) {
        const blocks=Object.fromEntries(['indicators','charts','tables','risks','sources'].map((key,index)=>[key,Boolean(mask&(1<<index))]));
        const result=await agent.generate({report,preferences:{sections:blocks}});
        for(const [key,field] of [['indicators','metrics'],['charts','visuals'],['tables','tables'],['risks','watchlist'],['sources','sourceLinks']]) if(!blocks[key]) assert.deepEqual(result[field],[]);
    }
    for(const audience of ['general','finance','purchasing','operations','commercial']) for(const depth of ['standard','brief','detailed']) for(const decisionHorizon of ['current','month','quarter','year']) {
        const result=await agent.generate({report,preferences:{audience,depth,decisionHorizon}});assert.equal(result.aiEdition.preferences.audience,audience);assert.equal(result.aiEdition.preferences.depth,depth);assert.equal(result.aiEdition.preferences.decisionHorizon,decisionHorizon);
    }
    const newDocument=await agent.generate({report:{title:'Mi informe',sections:[]},instructions:'Crea un plan general de compras, sin cifras'});
    assert(newDocument.sections.length,'También genera desde un documento vacío');
    await assert.rejects(agent.generate({report,instructions:''}),error=>error.status===400);
    await assert.rejects(agent.generate({report,instructions:'x'.repeat(4001)}),error=>error.status===400);
    await assert.rejects(new UserReportAgent({provider:{isConfigured:()=>false}}).generate({report,instructions:'Adaptar'}),error=>error.status===503);
    assert.throws(()=>outputReport(JSON.stringify({...edition,summary:'Precio 99999 MXN/kg'}),sourceReport(report),'Adaptar'),/añadió cifras/);
    assert.throws(()=>outputReport(JSON.stringify({...edition,dataSelection:{tables:[999]}}),sourceReport(report),'Adaptar'),/selección/);
    const synthesized=outputReport(JSON.stringify({...edition,tables:[{title:'Resumen de compras',columns:['Dato','Referencia'],rows:[['Pollo','40 MXN/kg']]}]}),sourceReport(report),'Crear tabla');assert.equal(synthesized.tables[0].title,'Resumen de compras');
    assert.throws(()=>outputReport(JSON.stringify({...edition,tables:[{columns:['Dato'],rows:[['99999']]}]}),sourceReport(report),'Crear tabla'),/añadió cifras/);
    let attempts=0;
    const repairing=new UserReportAgent({provider:{isConfigured:()=>true,generate:async()=>({text:++attempts===1 ? 'JSON incompleto' : JSON.stringify(edition),model:'fixture'})}});
    await repairing.generate({report,instructions:'Para compras'});assert.equal(attempts,2,'Un reintento acotado corrige la respuesta inválida');
    const cancelled=new AbortController();cancelled.abort();
    await assert.rejects(agent.generate({report,instructions:'Adaptar'},{signal:cancelled.signal}),error=>error.status===504);
    const hung=new UserReportAgent({provider:{isConfigured:()=>true,generate:()=>new Promise(()=>{})},timeoutMs:30});
    const keepAlive=setTimeout(()=>{},2000);
    try {
        await assert.rejects(hung.generate({report,instructions:'Adaptar'}),error=>error.status===504,'Un proveedor que no responde tampoco bloquea el controlador');
        const controller=new AbortController(),pending=hung.generate({report,instructions:'Adaptar'},{signal:controller.signal});
        controller.abort();await assert.rejects(pending,error=>error.status===504,'Cancelar funciona aunque el proveedor ignore la señal');
    } finally {clearTimeout(keepAlive);}
    let truncatedCalls=0;
    const truncated=new UserReportAgent({provider:{isConfigured:()=>true,generate:async()=>({text:JSON.stringify(edition),model:'fixture',finishReason:++truncatedCalls===1 ? 'MAX_TOKENS' : 'STOP'})}});
    await truncated.generate({report,instructions:'Adaptar'});assert.equal(truncatedCalls,2,'Una respuesta truncada se repara antes de aceptarla');
    await assert.rejects(new UserReportAgent({provider:{isConfigured:()=>true,generate:async()=>({text:JSON.stringify(edition),finishReason:'MAX_TOKENS'})}}).generate({report,instructions:'Adaptar'}),/no terminó/,'Una respuesta cortada nunca sustituye el informe');
    assert.equal(sourceReport({title:'Anterior',content:'Texto anterior completo'}).sections[0].text,'Texto anterior completo','La IA recibe el contenido de documentos anteriores');

    process.env.JWT_SECRET='isolated-report-ai-http-secret';delete process.env.USER_PASSWORD;
    const {createUserReportsRouter}=require('../backend/routes/user-reports');
    const app=express();let saves=0;
    const learning={load:async()=>({status:'empty',historyEnabled:true,providerEnabled:false,interests:[]})};
    app.use('/api',createUserReportsRouter({agent,learning,store:{list:async()=>[],save:async()=>{saves++;}}}));
    app.use('/hung',createUserReportsRouter({agent:hung,learning,store:{list:async()=>[]}}));
    const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
    try {
        const url=`http://127.0.0.1:${server.address().port}/api/user-reports/generate`,body=JSON.stringify({report,instructions:'Para compras'});
        const token=jwt.sign({sub:'fixture',email:'fixture@example.invalid'},process.env.JWT_SECRET);
        assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body})).status,401);
        const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body});
        assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert((await response.json()).data.aiEdition);
        assert.equal(saves,0,'Generar no guarda ni sobrescribe documentos');
        const hungUrl=`http://127.0.0.1:${server.address().port}/hung/user-reports/generate`;
        for(let i=0;i<2;i++) assert.equal((await fetch(hungUrl,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body})).status,504,'El plazo libera el cupo y permite otro intento');
    } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    console.log('Report AI: OK · instrucciones, preferencias, datos, fuentes, privacidad, documentos nuevos, validación, reparación, sesión y borrador');
}
async function live() {
    require('dotenv').config({path:'backend/.env',quiet:true});
    const {GeminiProvider}=require('../backend/ai/providers/gemini-provider');
    const agent=new UserReportAgent({provider:new GeminiProvider()});
    const result=await agent.generate({report,instructions:'Aclara que la referencia de 40 MXN/kg es una simulación, no una cotización actual. Crea una tabla cualitativa con columnas Riesgo y Acción sugerida, sin cifras nuevas.',preferences:{audience:'purchasing',depth:'brief',decisionHorizon:'month',objective:'Decidir abastecimiento de pollo',customTitle:'Plan de compras de prueba',recipientName:'Jefatura de compras de prueba',organization:'Empresa de simulación',confidentiality:'confidential'},options:{tone:'simple'}});
    assert(result.aiEdition.model);assert(result.sections.length);assert.deepEqual(result.metrics,sourceReport(report).metrics);assert.deepEqual(result.sourceLinks,report.sourceLinks);assert(result.tables.some(table=>table.columns.length>=2 && table.rows.length),'La IA genera la tabla solicitada');
    assert.equal(result.title,'Plan de compras de prueba');assert.equal(result.personalization.recipientName,'Jefatura de compras de prueba');assert.equal(result.aiEdition.preferences.decisionHorizon,'month');
    const financeSettings={audience:'finance',depth:'detailed',decisionHorizon:'year',objective:'Revisar liquidez y exposición cambiaria',customTitle:'Tesorería de simulación',recipientName:'Comité de prueba',organization:'Empresa de simulación',confidentiality:'shareable',sections:{indicators:false,charts:false,tables:false,risks:false,sources:false}};
    const finance=await agent.generate({report,instructions:'Explica qué información financiera falta para tomar decisiones y organiza el seguimiento, sin estimar cifras.',preferences:financeSettings,options:{tone:'technical'}});
    assert.equal(finance.title,financeSettings.customTitle);assert.equal(finance.personalization.confidentiality,'shareable');assert.equal(finance.aiEdition.preferences.decisionHorizon,'year');assert.equal(finance.aiEdition.tone,'technical');
    for(const key of ['metrics','visuals','tables','watchlist','sourceLinks','sources']) assert.deepEqual(finance[key],[]);
    assert.match(JSON.stringify(finance.sections),/liquidez|cambiari|tesorer/i,'La lectura financiera responde al nuevo enfoque');assert.notEqual(finance.summary,result.summary,'Cambiar el enfoque produce otra redacción con el proveedor real');
    console.log(JSON.stringify({live:'OK',model:result.aiEdition.model,title:result.title,summary:result.summary,sections:result.sections.length,tables:result.tables.map(table=>({title:table.title,columns:table.columns,rows:table.rows.length}))}));
    console.log(JSON.stringify({live:'OK',model:finance.aiEdition.model,title:finance.title,audience:finance.aiEdition.preferences.audience,depth:finance.aiEdition.preferences.depth,horizon:finance.aiEdition.preferences.decisionHorizon,classification:finance.personalization.confidentiality,excludedBlocks:'todos',sections:finance.sections.length}));
}
(process.argv.includes('--live') ? live() : tests()).catch(error=>{console.error(error);process.exitCode=1;});
