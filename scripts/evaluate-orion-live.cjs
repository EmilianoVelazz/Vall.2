'use strict';
// Explicit opt-in: two bounded provider calls (plus at most one repair per turn).
// All source material is synthetic and identified as such in every prompt.
const fs=require('node:fs/promises');
const path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../backend/.env'),quiet:true});
require('../backend/lib/tls-trust').configureSystemTrust();
const {GeminiProvider}=require('../backend/ai/providers/gemini-provider');
const {AIOrchestrator}=require('../backend/ai/orchestrator');
async function main() {
    if(!process.argv.includes('--live')) throw Error('Requiere --live; utiliza la API configurada y puede consumir cuota.');
    const provider=new GeminiProvider();
    if(!provider.isConfigured()) throw Error('Proveedor no configurado.');
    let calls=0;
    const requests=[];
    const run=(method,request)=>{calls++;requests.push({method,tier:request.tier,modelProfile:request.modelProfile,promptCharacters:request.prompt?.length,systemCharacters:request.systemInstruction?.length});return provider[method]({...request,tools:null,maxOutputTokens:4096,timeoutMs:60000});};
    const bounded={name:provider.name,isConfigured:()=>true,generate:request=>run('generate',request),stream:request=>run('stream',request)};
    const empty={context:'',citations:[],sourceCodes:[],evidenceCount:0,charts:[],evidenceRecords:[],retrievalStrategy:'isolated_evaluation'};
    const url='https://example.org/synthetic-agricultural-brief';
    const document={url,date:'2026-09-25',title:'Boletín agrícola de simulación',source:'Documento sintético de evaluación',verified:true,excerpts:['SIMULACIÓN: China y Estados Unidos anunciaron un compromiso de compra de soya. Se recomendó reducir un arancel 10%, pero la recomendación no entró en vigor. No se informa una fecha de aplicación ni volumen comprado.']};
    const evidence={...empty,available:true,context:'DATOS FICTICIOS DE EVALUACIÓN. No son noticias reales.\n'+JSON.stringify(document),citations:[{url,date:document.date,title:document.title,source:document.source,type:'verified_trade_document',verified:true}],tradeDocuments:[document],tradePeriod:{start:'2026-07-15',end:'2026-10-15',assumption:false}};
    const chat=new AIOrchestrator({provider:bounded,liveDataGrounder:async()=>evidence,forecastBuilder:async()=>null,statisticsBuilder:async()=>null,priceArchive:null,retriever:{retrieve:async()=>empty,recordQuery:async()=>null,recordEvidence:async()=>null}});
    const cases=[
        {id:'trade-status',method:'generateStructured',message:'Ejercicio con documentos sintéticos, no noticias reales: ¿qué acuerdos comerciales sobre proteínas entre China y Estados Unidos aparecen en los últimos tres meses? Distingue compromiso, recomendación y medida vigente. Usa sólo los documentos de simulación proporcionados.'},
        {id:'decision-conditional',method:'stream',message:'Ejercicio con documentos sintéticos, no noticias reales: soy comprador de soya. Analiza ese acuerdo comercial entre China y Estados Unidos en los últimos tres meses: ¿qué cambia para mi costo y qué debo verificar? No inventes compras ejecutadas ni fechas de aplicación.'},
    ];
    const results=[];
    for(const item of cases) {
        const started=Date.now();
        try {
            const answer=await chat[item.method]({message:item.message,history:[],tier:'flash',signal:AbortSignal.timeout(75000),onText(){}});
            const text=answer.text;
            results.push({id:item.id,status:'completed',latencyMs:Date.now()-started,model:answer.model,text,
                checks:{dated:/2026-09-25/.test(text),documentLinked:text.includes(url),noInvented99Percent:!text.includes('99%'),syntheticLabel:/simula|sint[eé]tic|fictici/i.test(text),mentionsNonEnactment:/no.{0,45}(?:vigor|aplicaci[oó]n|vigente)|sin.{0,25}(?:vigor|aplicaci[oó]n)|recomendaci[oó]n/i.test(text)},
                researchAudit:answer.response.meta.researchAudit,decisionBrief:answer.response.meta.decisionBrief,tools:answer.response.meta.toolExecution});
        } catch(error) {results.push({id:item.id,status:'unavailable',latencyMs:Date.now()-started,code:error.code || error.name});}
    }
    const report={generatedAt:new Date().toISOString(),scope:'Proveedor real; dos consultas, contexto sintético controlado; sin búsqueda externa, sin correo, sin persistencia de usuarios. Los controles automáticos no certifican verdad semántica ni precisión de pronósticos.',providerCalls:calls,requests,results};
    const directory=path.resolve(__dirname,'../output/analisis-inteligencia-orion');await fs.mkdir(directory,{recursive:true});
    await fs.writeFile(path.join(directory,'evaluacion-proveedor-real.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({providerCalls:calls,results:results.map(({id,status,latencyMs,model,checks,code,researchAudit})=>({id,status,latencyMs,model,checks,code,researchAudit}))},null,2));
}
main().catch(error=>{console.error(error.code || error.message);process.exitCode=1;});
