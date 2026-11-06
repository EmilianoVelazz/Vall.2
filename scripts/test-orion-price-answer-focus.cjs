'use strict';
const assert=require('node:assert/strict');
const {planQuery}=require('../backend/ai/query-planner');
const {guardProteinPrices}=require('../backend/ai/protein-price-quality');
const {guardForecastAnswer}=require('../backend/ai/forecast-analysis');
const {AIOrchestrator}=require('../backend/ai/orchestrator');
const {proteinPriceEvidence}=require('../backend/services/protein-market-intelligence');
const history=[{role:'user',content:'Pronostica el precio del cerdo en España para la próxima semana'},
    {role:'assistant',content:'Revisaré la serie disponible.'}];
const message='Ahora dame los precios actuales de cerdo, pollo, huevo y res en España';
const plan=planQuery({message,history});
assert.equal(plan.asksForecast,false,'La consulta de precios actuales termina el pronóstico anterior');
assert.equal(planQuery({message:'¿Y para la próxima semana?',history}).asksForecast,true,'Los seguimientos predictivos conservan su intención');
assert.equal(planQuery({message:'¿Cuánto subirá el cerdo mañana?',history}).asksForecast,true);
const records=[{verified:true,productId:'pork',product:'Cerdo',country:'España',countryCode:'ES',market:'España',
    category:'Canal clase E',value:180,currency:'EUR',unit:'EUR/100 kg',date:'2026-10-18',
    source:'Comisión Europea · DG AGRI',url:'https://api.tech.ec.europa.eu/agrifood/api/pigmeat/prices',priceBasis:'carcass'}];
const empty={context:'',citations:[],sourceCodes:[],evidenceCount:0,charts:[],evidenceRecords:[],retrievalStrategy:'fixture'};
async function main(){
    const live=await proteinPriceEvidence(plan.proteinProfile,{get:async()=>({records,missing:['Pollo','Huevo','Res'],warnings:[],period:{start:'2026-10-01',end:'2026-10-21'},fetchedAt:'2026-10-21T12:00:00Z'})});
    const invalid='Cerdo: 999 EUR/kg hoy. Pollo: 123 EUR/kg.';
    const guarded=guardProteinPrices(plan,live,invalid);
    assert.match(guarded.text,/180\.00 EUR\/100 kg/);
    assert.match(guarded.text,/2026-10-18/);
    assert.match(guarded.text,/Pollo.*Sin precio verificado/);
    assert.doesNotMatch(guarded.text,/999|123|No pude validar/);
    const noData=guardProteinPrices(plan,empty,invalid);
    assert(noData.blocked);assert.match(noData.text,/No pude validar/);assert.doesNotMatch(noData.text,/999|123/);
    const stripped=guardForecastAnswer(plan,'Precio pendiente.\n\n### Estado del pronóstico\nFalta definir el horizonte.\n\n### Observaciones\nLa unidad depende de la presentación.');
    assert(stripped.changed);assert.match(stripped.text,/Observaciones/);assert.doesNotMatch(stripped.text,/horizonte/);
    for(const method of ['generateStructured','stream']){
        let forecasts=0;
        const provider={name:'fixture',isConfigured:()=>true,generate:async()=>({text:invalid,model:'fixture'}),
            stream:async request=>{request.onText(invalid,invalid);return {text:invalid,model:'fixture'};}};
        const chat=new AIOrchestrator({provider,liveDataGrounder:async()=>live,forecastBuilder:async()=>{forecasts++;return null;},priceArchive:null,
            retriever:{retrieve:async()=>empty,recordQuery:async()=>null,recordEvidence:async()=>null}});
        const result=await chat[method]({message,history,tier:'flash',onText:()=>{}});
        assert.equal(forecasts,0);
        assert.match(result.response.markdown,/180\.00 EUR\/100 kg/);
        assert.doesNotMatch(result.response.markdown,/999|123|Estado del pronóstico|Fuentes de investigación web/);
        assert(result.response.meta.citations.length>0,'La fuente sigue disponible y enlazada junto al precio');
    }
    console.log('ORION: precios internacionales verificados, cobertura parcial, datos ausentes, contexto actual y dos rutas de respuesta OK.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
