'use strict';
// Read-only tokenizer call with public fixture text. No generation or debit.
require('dotenv').config({path:'.env.local',quiet:true});require('dotenv').config({path:'backend/.env',quiet:true});
const {countRequestTokens}=require('../backend/ai/providers/gemini-token-counter');
(async()=>{const result=await countRequestTokens({apiKey:process.env.GEMINI_API_KEY,model:'gemini-2.5-flash',contents:[{role:'user',parts:[{text:'Prueba de conteo de tokens.'}]}],systemInstruction:'Responde en español.',tools:[{googleSearch:{}}]});console.log(JSON.stringify({developerApiCounter:true,totalTokens:result.totalTokens,generation:false,userCharges:0}));})().catch(error=>{console.error('[token-counter-check]',error.code || error.status || error.name);process.exitCode=1;});
