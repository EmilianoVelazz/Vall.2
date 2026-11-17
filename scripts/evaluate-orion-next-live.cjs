'use strict';
if(!process.argv.includes('--run')){console.log('Usa --run para evaluar tres preguntas ficticias con el proveedor configurado.');process.exitCode=1;}
else{
 const fs=require('node:fs/promises'),path=require('node:path');
 require('dotenv').config({path:path.resolve(__dirname,'../backend/.env'),quiet:true});
 require('../backend/lib/tls-trust').configureSystemTrust();
 const {GeminiProvider}=require('../backend/ai/providers/gemini-provider'),{buildPrompt}=require('../backend/ai/prompt-builder'),{answerWordCount}=require('../backend/ai/answer-format');
 const {prepareBusinessConversation}=require('../backend/ai/business-memory'),{scenarioRequest,calculateScenarios}=require('../backend/ai/commercial-scenarios'),{parseCommercialInputs}=require('../backend/ai/commercial-calculator');
 (async()=>{
  const provider=new GeminiProvider();if(!provider.isConfigured())throw Error('Proveedor no configurado.');
  const financial=prepareBusinessConversation({message:'Compara bonos de México y Alemania desde 2020 hasta hoy, para conservar liquidez en 90 días.'});
  const next=prepareBusinessConversation({message:'Ahora en tabla: qué debo verificar antes de comparar esas alternativas. Máximo 90 palabras.',history:[],conversationMemory:financial.conversationMemory});
  const base=parseCommercialInputs('Compro 1000 kg de cerdo a 80 MXN/kg, vendo a 110 MXN/kg, merma 8%, flete 5000 MXN.'),scenarios=calculateScenarios(scenarioRequest('Compara venta a 90, 100 y 110 MXN/kg'),base);
  const cases=[{id:'financial-memory',message:next.message,history:next.history,context:next.context+'\nEJERCICIO FICTICIO. No hay rendimientos observados, curvas históricas ni cotizaciones disponibles. No introduzcas números de mercado.',check:text=>/mexico/i.test(text.normalize('NFD').replace(/\p{Diacritic}/gu,'')) && /alemania/i.test(text) && text.includes('|') && !/\d+(?:[.,]\d+)?\s*%/.test(text)},
   {id:'verified-scenarios',message:'Explica los resultados de los tres escenarios y qué condición falta verificar antes de elegir un precio. Máximo 100 palabras. Conserva las cifras y no asumas que todo se venderá a ese precio.',history:[],context:'EJERCICIO FICTICIO. RESULTADOS CALCULADOS POR EL SERVIDOR:\n'+JSON.stringify(scenarios),check:text=>/2[,.\s]?200/.test(text) && /7[,.\s]?000/.test(text) && /16[,.\s]?200/.test(text)},
   {id:'selective-question',message:'¿Puedes asegurar que un forward garantiza una ganancia? Explica el concepto en máximo 80 palabras. No estoy pidiendo una recomendación personal.',history:[],context:'Pregunta conceptual. No hay cotizaciones ni una operación individual que calcular.',check:text=>!/\?|¿/.test(text) && /no|tampoco|ningun/i.test(text)},
  ];
  const results=[];for(const item of cases){const built=buildPrompt({...item,mode:'normal',plan:{providedInputsOnly:true}}),started=Date.now();try{const response=await provider.generate({...built,tier:'flash',tools:null,maxOutputTokens:1800,timeoutMs:30000});const words=answerWordCount(response.text),passed=response.finishReason==='STOP' && words<=built.responseLength.maxWords && item.check(response.text);results.push({id:item.id,text:response.text,words,maxWords:built.responseLength.maxWords,passed,model:response.model,latencyMs:Date.now()-started});}catch(error){results.push({id:item.id,passed:false,error:error.code || 'provider_unavailable'});}console.log(JSON.stringify({id:item.id,...Object.fromEntries(Object.entries(results.at(-1)).filter(([key])=>['passed','words','maxWords','latencyMs','error'].includes(key)))}));}
  const directory=path.resolve(__dirname,'../output/orion-mejoras-20261110');await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'live-samples.json'),JSON.stringify({generatedAt:new Date().toISOString(),syntheticInputs:true,actualProvider:true,sourceSearchUsed:false,notGeneralTruthCertification:true,results},null,2));if(results.some(item=>!item.passed))process.exitCode=1;
 })().catch(error=>{console.error(error.code || error.message);process.exitCode=1;});
}
