'use strict';
process.env.NODE_ENV='test';
process.env.VERCEL='1';
for(const key of ['SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DATABASE_URL','GEMINI_API_KEY'])process.env[key]='';
const assert=require('node:assert/strict');
const {scenarioRequest,calculateScenarios}=require('../backend/ai/commercial-scenarios');
const base={purchasedKg:1000,buyPricePerKg:70,sellPricePerKg:90,shrinkFraction:.05,freight:1000,currency:'MXN'};
const compare=(query,inputs=base)=>calculateScenarios(scenarioRequest(query),inputs);
const combined=compare('Simula escenarios si el costo sube 5% y el flete baja 10%');
assert(combined.available);assert.equal(combined.rows.length,4);
assert.equal(combined.rows.find(row=>row.patch.buyPricePerKg===73.5 && row.patch.freight===900).calculation.profit,11100);
assert.equal(base.freight,1000);assert.equal(base.buyPricePerKg,70);
const reversed=compare('Simula flete baja 10% y compra aumenta 5%');
assert(reversed.available);assert(reversed.rows.some(row=>row.calculation.profit===11100));
const alternatives=compare('Compara el costo sube 5% o 10%');
assert(alternatives.available);assert.deepEqual(alternatives.rows.map(row=>row.patch.buyPricePerKg),[70,73.5,77]);
assert.deepEqual(compare('Simula costo sube 5% o baja 10%').rows.map(row=>row.patch.buyPricePerKg),[70,73.5,63]);
assert.equal(compare('Simula compra aumenta 3,5%').rows[1].patch.buyPricePerKg,72.45);
const mixed=compare('Compara venta a 90 y 100 MXN/kg; flete baja 10%');
assert(mixed.available);assert.equal(mixed.rows.length,4);
assert(mixed.rows.some(row=>row.patch.sellPricePerKg===100 && row.patch.freight===900));
const perKg={...base,freightPerKg:1};delete perKg.freight;
assert.equal(compare('Simula flete baja 10%',perKg).rows[1].patch.freightPerKg,.9);
assert.equal(compare('Simula costo baja 110%').available,false);
assert(scenarioRequest('Simula costo sube 5%, flete baja 10% y venta sube 2%').reason);
assert(scenarioRequest('Simula costo sube 5% y compra baja 10%').reason);
assert(scenarioRequest('Simula merma sube 5%').reason);
async function main(){
 const {AIOrchestrator}=require('../backend/ai/orchestrator');
 const {prepareBusinessConversation}=require('../backend/ai/business-memory');
 const memory=prepareBusinessConversation({message:'Compro 1000 kg de cerdo a 70 MXN/kg, vendo a 90 MXN/kg, merma 5%, flete 1000 MXN.'}).conversationMemory;
 const chat=new AIOrchestrator({provider:{name:'offline',isConfigured:()=>false},retriever:{recordQuery:async()=>null,recordEvidence:async()=>null}});
 for(const method of ['generateStructured','stream']){
  const result=await chat[method]({message:'Simula escenarios si el costo sube 5% y el flete baja 10%',conversationMemory:memory,history:[]});
  const comparison=result.response.meta.scenarioComparison;
  assert(comparison.available);assert.equal(comparison.rows.length,4);
  assert(comparison.rows.some(row=>row.patch.buyPricePerKg===73.5 && row.patch.freight===900 && row.calculation.profit===11100));
  assert.equal(result.response.meta.conversationMemory.inputs.buyPricePerKg,70);
  assert.equal(result.response.meta.conversationMemory.inputs.freight,1000);
 }
 console.log('Escenarios relativos: dos variables completas, 11100 MXN, alternativas, decimales, listas mixtas, flete/kg, ambigüedad y ambos modos de chat sin proveedor OK.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
