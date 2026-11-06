'use strict';

const assert = require('node:assert/strict');
const { parseMexicoPrices, createMexicoPriceClient } = require('../backend/services/mexico-protein-prices');
const { proteinProfile, proteinPriceEvidence, createProteinPriceClient } = require('../backend/services/protein-market-intelligence');
const { planQuery } = require('../backend/ai/query-planner');
const { guardProteinPrices } = require('../backend/ai/protein-price-quality');
const { AIOrchestrator } = require('../backend/ai/orchestrator');
const NOW = Date.parse('2026-10-08T16:00:00Z');
const period = { start: '2026-10-01', end: '2026-10-08' };
const url = 'https://www.economia-sniim.gob.mx/SNIIM-Pecuarios-Nacionales/e_Hue.asp?anio=2026';
const page = (title, rows) => `<title>${title}</title><table>${rows.map(row => '<tr>' + row.map(cell => `<td>${cell}</td>`).join('') + '</tr>').join('')}</table>`;
const fixtures = {
    pork: page('Porcinos : Carne en canal', [['Ags. : R.M. Aguascalientes'], ['08/10/2026','Supremo','65','72','78','1','2']]),
    beef: page('Bovinos : Carne en canal', [['Ags. : R.M. Aguascalientes'], ['Fecha:08/10/2026','Canales vendidos:100'], ['Toros','450','40','100','110'], ['Total','','100'], ['Chis. : TIF 78'], ['Toros','450','40','200','210']]),
    poultry: page('Pollo entero', [['D.F. : Centro de distribución Rayón'], ['08/10/2026','Pollo entero','Bachoco','Guanajuato','3.5','2.65','$58.70'], ['08/10/2026','Gallina','Bachoco','Guanajuato','3.5','2.65','$45']]),
    eggs: page('Precio de Huevo', [['AGS: Central de Abasto de Aguascalientes'], ['07/10/2026','Huevo blanco','Mayoreo','$27.60','$27.60','$28.10'], ['07/10/2026','Huevo blanco','Menudeo','$30','$30','$31'], ['07/10/2026','Huevo blanco','Medio Mayoreo','$29','$29','$30'], ['09/10/2026','Huevo blanco','Mayoreo','$99','$99','$100'], ['31/02/2026','Huevo blanco','Mayoreo','$50','$50','$60']]),
};
const record = id => parseMexicoPrices(fixtures[id],id,url,period,'2026-10-08');
for (const id of Object.keys(fixtures)) assert.equal(record(id).length,1,id);
assert.equal(record('pork')[0].priceType,'reported_range');
assert.equal(record('pork')[0].rangeMin,72);
assert.equal(record('pork')[0].rangeMax,78);
assert.equal(record('beef')[0].market,'Ags. : R.M. Aguascalientes','No heredar fecha entre rastros');
assert.equal(record('poultry')[0].value,58.7);
assert.equal(record('eggs')[0].date,'2026-10-07','Conservar la fecha semanal real');
assert.equal(record('eggs')[0].value,27.6);
assert.equal(parseMexicoPrices(fixtures.pork,'beef',url,period).length,0,'No reinterpretar especie');
assert.equal(parseMexicoPrices(fixtures.eggs.replace('$27.60','$99'),'eggs',url,period).length,0,'Precio frecuente fuera del rango');
const history = [{role:'user',content:'Haz una tabla de precios de cerdo, pollo, huevo y res en Europa y Estados Unidos'}];
const plan = planQuery({message:'haz esa tabla pero d emexico',history});
assert.equal(plan.needsProteinPrices,true);
assert.deepEqual(plan.proteinProfile.countries,['MX']);
const misleadingHistory = [...history, {role:'assistant',content:'No tengo acceso a México. Referencias internacionales de futuros CME: lean hogs y live cattle.'}];
const followUps = ['ahora de mexico e favor', 'ahora de México por favor', 'ahora en México', 'ahora para México', 'ahora México', 'de México por favor', 'en México', 'para México', 'solo México', 'solamente de México', '¿Y de México?'];
for (const message of followUps) {
    const next = planQuery({message,history:misleadingHistory});
    assert(next.followsThread,message);
    assert(next.needsProteinPrices,message);
    assert(next.localPhysicalPrice,message);
    assert.equal(next.proteinProfile.futures,false,message);
    assert.deepEqual(next.proteinProfile.countries,['MX'],message);
    assert.deepEqual(next.proteinProfile.products,['pork','poultry','eggs','beef'],message);
}
const empty = {context:'',citations:[],sourceCodes:[],evidenceCount:0,charts:[],evidenceRecords:[],retrievalStrategy:'fixture'};
async function main() {
    let calls=0;
    const fetchPage = async (link,options) => {
        calls++;
        assert.equal(options.encoding,'latin1');
        const query = new URL(link);
        const id = query.pathname.endsWith('e_Hue.asp') ? 'eggs' : query.pathname.endsWith('e_Ent.asp') ? 'poultry' : query.searchParams.get('Var') === 'Por' ? 'pork' : 'beef';
        return {ok:true,status:200,text:async()=>fixtures[id]};
    };
    const source = createMexicoPriceClient({fetchPage,now:()=>NOW});
    const profile = proteinProfile('Tabla de precios de proteínas en México');
    const values = await Promise.all([source.get(profile,period),source.get(profile,period)]);
    assert.equal(calls,4,'Deduplicar cuatro fuentes concurrentes');
    assert(values.every(value=>value.length===4));
    await source.get(profile,period);assert.equal(calls,4,'Caché vigente');
    assert.deepEqual(await source.get(proteinProfile('Huevo por docena en México'),period),[]);
    assert.deepEqual(await source.get(proteinProfile('Pechuga en México'),period),[]);
    assert.deepEqual(await source.get(proteinProfile('Res en pie en México'),period),[]);
    const partialSource = createMexicoPriceClient({now:()=>NOW,fetchPage:async(link,options)=>link.includes('e_Hue.asp')?{ok:false,status:503}:fetchPage(link,options)});
    const partial = await partialSource.get(profile,period);
    assert.equal(partial.length,3,'Una falla no elimina otras especies');
    const evidence = await proteinPriceEvidence(profile,createProteinPriceClient({mexicoClient:source,porciculturaClient:{get:async()=>[]},now:()=>NOW}));
    assert(evidence.sourceCodes.includes('sniim_mexico_protein_prices'));
    assert.equal(evidence.proteinPriceRecords.length,4);
    const guarded = guardProteinPrices(plan,evidence,'No pude validar nada. ¿Qué etapa necesitas?');
    assert(guarded.changed);
    assert.match(guarded.text,/72\.00–78\.00/);
    assert.match(guarded.text,/2026-10-07/);
    assert.doesNotMatch(guarded.text,/¿Qué etapa/);
    assert.match(guardProteinPrices(plan,{proteinPriceRecords:partial},'').text,/Huevo \| No recuperada \| No disponible/);
    const noTablePlan = planQuery({message:'ahora de mexico e favor',history:[{role:'user',content:'Dame precios físicos de cerdo, pollo, huevo y res en Estados Unidos'},...misleadingHistory.slice(-1)]});
    assert(guardProteinPrices(noTablePlan,evidence,'No tengo acceso a cotizaciones locales. Sólo futuros CME.').changed,'Presentar referencias recuperadas aunque no se haya pedido tabla explícita');
    for (const message of ['haz esa tabla pero d emexico', 'ahora de mexico e favor']) for (const method of ['stream','generateStructured']) {
        const chunks=[];
        const rejection='No tengo acceso a cotizaciones locales de México. Sólo futuros CME.';
        const provider={name:'fixture',isConfigured:()=>true,generate:async()=>({text:rejection,model:'fixture'}),stream:async request=>{request.onText(rejection);return {text:rejection,model:'fixture'};}};
        const chat=new AIOrchestrator({provider,liveDataGrounder:async()=>evidence,retriever:{retrieve:async()=>empty,recordQuery:async()=>null,recordEvidence:async()=>null}});
        const answer=await chat[method]({message,history:misleadingHistory,tier:'flash',onText:part=>chunks.push(part)});
        assert.match(answer.text,/72\.00–78\.00/);
        assert.match(answer.text,/27\.60/);
        assert.doesNotMatch(answer.text,/No tengo acceso|Sólo futuros CME/,'No sustituir cotizaciones locales por futuros');
        assert.doesNotMatch(chunks.join(''),/No tengo acceso|Sólo futuros CME/,'No transmitir negación incompatible');
        assert(answer.citations.some(citation=>citation.type==='verified_protein_price'));
    }
    console.log('Mexico prices: four species, market/date/unit/range, partial failure, deduplication, inherited table and both orchestrator paths OK');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
