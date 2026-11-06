'use strict';
const assert = require('node:assert/strict');
const { STATES } = require('../backend/services/mexico-price-scope');
const { planQuery } = require('../backend/ai/query-planner');
const { createPorciculturaClient } = require('../backend/services/porcicultura-public');
const { createMexicoPriceClient } = require('../backend/services/mexico-protein-prices');
const { createProteinPriceClient, proteinPriceEvidence } = require('../backend/services/protein-market-intelligence');
const { guardProteinPrices } = require('../backend/ai/protein-price-quality');
const { AIOrchestrator } = require('../backend/ai/orchestrator');
const NOW = Date.parse('2026-10-08T18:00:00Z');
const period = {start:'2026-10-01',end:'2026-10-08'};
const payload = {data:[{fecha:'2026-10-07',estados:[{nombre:'Jalisco',precio:34.17},{nombre:'Puebla',precio:38}]}]};
const empty = {context:'',citations:[],sourceCodes:[],evidenceCount:0,charts:[],evidenceRecords:[],retrievalStrategy:'fixture'};
async function main() {
    let requests=0;
    const porci=createPorciculturaClient({now:()=>NOW,fetchPage:async()=>{requests++;return {ok:true,text:async()=>JSON.stringify(payload)};}});
    const priceClient=createProteinPriceClient({now:()=>NOW,porciculturaClient:porci,mexicoClient:{get:async()=>[]}});
    for(const state of STATES) {
        const plan=planQuery({message:`Precio del cerdo en ${state.name}`});
        assert.deepEqual(plan.proteinProfile.mexicoStates,[state.code],state.name);
        assert.deepEqual(plan.proteinProfile.countries,['MX'],state.name);assert(plan.needsProteinPrices,state.name);
        const evidence=await proteinPriceEvidence(plan.proteinProfile,priceClient);
        const table=guardProteinPrices(plan,evidence,'No disponible').text;
        assert(table.includes(state.name),state.name);
        if(['JAL','PUE'].includes(state.code)) assert.match(table,/\d+\.\d{2} MXN\/kg vivo/,state.name);
        else assert.match(table,/No disponible/,state.name);
        assert(evidence.proteinPriceRecords.every(row=>row.stateCode===state.code),'No prestar cotizaciones de otro estado');
    }
    assert.equal(requests,1,'Una consulta pública compartida entre estados');
    const all=planQuery({message:'Precio del cerdo en pie por estado de México'});
    assert.equal(all.proteinProfile.mexicoStates.length,32);
    const allEvidence=await proteinPriceEvidence(all.proteinProfile,priceClient);
    const table=guardProteinPrices(all,allEvidence,'').text;
    assert.equal(table.split('\n').filter(line=>/^\| /.test(line)).length-2,32,'Mantener las 32 filas');
    assert.equal((table.match(/No disponible/g)||[]).length,30,'Cobertura parcial visible');
    const guad=planQuery({message:'dame el precio del cerdo en guadalajara mexico'});
    assert.deepEqual(guad.proteinProfile.mexicoStates,['JAL']);
    const evidence=await proteinPriceEvidence(guad.proteinProfile,priceClient);
    const guadText=guardProteinPrices(guad,evidence,'').text;
    assert.match(guadText,/34\.17 MXN\/kg vivo/);assert.match(guadText,/Guadalajara, Jalisco/);assert.match(guadText,/no es una cotizaci[oó]n municipal/);
    const switched=planQuery({message:'¿Y en Puebla?',history:[{role:'user',content:'Precio del cerdo en Guadalajara México'}]});
    assert.deepEqual(switched.proteinProfile.mexicoStates,['PUE']);assert.deepEqual(switched.proteinProfile.mexicoCities,[],'Eliminar la ciudad anterior');
    const html='<title>Porcinos : Carne en canal</title><table><tr><td>Ags. : R.M. Aguascalientes</td></tr><tr><td>08/10/2026</td><td>Supremo</td><td>65</td><td>72</td><td>78</td><td>1</td><td>2</td></tr><tr><td>Pue. : Rastro Puebla</td></tr><tr><td>07/10/2026</td><td>Supremo</td><td>65</td><td>73</td><td>79</td><td>1</td><td>2</td></tr></table>';
    const sniim=createMexicoPriceClient({now:()=>NOW,fetchPage:async()=>({ok:true,text:async()=>html})});
    const comparison=planQuery({message:'Precios de canal de cerdo en Aguascalientes y Puebla'});
    const local=await sniim.get(comparison.proteinProfile,period);
    assert.equal(local.length,2,'La plaza del día anterior no desaparece ante otra más reciente');
    assert(local.some(row=>row.stateCode==='PUE'&&row.date==='2026-10-07'));
    const noData=planQuery({message:'Precio del cerdo en Chihuahua'});
    const noEvidence=await proteinPriceEvidence(noData.proteinProfile,priceClient);
    const withNoise={...evidence,citations:[...evidence.citations,{id:'G1',type:'google_search_grounding',url:'https://facebook.com/',source:'Facebook',title:'Otro mercado'}]};
    for(const method of ['stream','generateStructured']) for(const [plan,grounded,hasData] of [[guad,withNoise,true],[noData,{...noEvidence,citations:withNoise.citations},false]]) {
        const provider={name:'fixture',isConfigured:()=>true,generate:async()=>({text:'No disponible. Facebook tiene 78 MXN/kg.',model:'fixture'}),stream:async r=>{r.onText('No disponible. Facebook tiene 78 MXN/kg.');return {text:'No disponible. Facebook tiene 78 MXN/kg.',model:'fixture'};}};
        const chat=new AIOrchestrator({provider,liveDataGrounder:async()=>grounded,retriever:{retrieve:async()=>empty,recordQuery:async()=>null,recordEvidence:async()=>null}});
        const reply=await chat[method]({message:plan.proteinProfile.query,tier:'flash'});
        assert(!reply.citations.some(c=>c.url==='https://facebook.com/'));
        if(hasData) {assert.match(reply.text,/34\.17 MXN\/kg vivo/);assert.equal(reply.citations.length,1);}
        else {assert.match(reply.text,/Chihuahua \| No disponible/);assert.equal(reply.citations.length,0,'Fuentes ajenas no acreditan una fila vacía');}
    }
    console.log('State prices: 32 entities, Guadalajara/Jalisco, state changes, partial coverage, local dates, relevant citations and both chat paths OK');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
