'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {STATES,CITY_STATES,stateFromMarket} = require('../backend/services/mexico-price-scope');
const {createMexicoPriceClient,parseMexicoPrices} = require('../backend/services/mexico-protein-prices');
const {createPorciculturaClient} = require('../backend/services/porcicultura-public');
const {PRODUCTS,COUNTRIES,proteinProfile,createProteinPriceClient,proteinPriceEvidence,parseEuPrices,parseUsPrices} = require('../backend/services/protein-market-intelligence');
const {planQuery} = require('../backend/ai/query-planner');
const {mexicoPriceTable} = require('../backend/ai/protein-price-table');
const {quoteMatchesRecord,guardProteinPrices} = require('../backend/ai/protein-price-quality');
const {AIOrchestrator} = require('../backend/ai/orchestrator');
const {markdownToRichResponse,validateRichResponse} = require('../backend/ai/response-schema');
const NOW = Date.parse('2026-10-08T20:00:00Z');
const PERIOD = {start:'2026-10-01',end:'2026-10-08'};
const TITLES = {pork:'Porcinos : Carne en canal',beef:'Bovinos : Carne en canal',poultry:'Pollo entero',eggs:'Precio de Huevo'};
const page = (id,rows) => `<title>${TITLES[id]}</title><table>${rows.map(row=>'<tr>'+row.map(cell=>`<td>${cell}</td>`).join('')+'</tr>').join('')}</table>`;
function observation(id,date,value) {
    return id === 'beef' ? [[`Fecha:${date}`],['Toros','450','40',String(value),String(value+5)]]
        : id === 'pork' ? [[date,'Supremo','65',String(value),String(value+5),'1','2']]
            : id === 'poultry' ? [[date,'Pollo entero','Marca','Origen','3','2',`$${value}`]]
                : [[date,'Huevo blanco','Mayoreo',`$${value}`,`$${value}`,`$${value+5}`]];
}
function idFrom(url) {const u=new URL(url);return u.pathname.endsWith('e_Hue.asp') ? 'eggs' : u.pathname.endsWith('e_Ent.asp') ? 'poultry' : u.searchParams.get('Var') === 'Por' ? 'pork' : 'beef';}
const fixtures = Object.fromEntries(PRODUCTS.map(product=>[product.id,page(product.id,STATES.flatMap((state,index)=>[
    [`${state.name}: Plaza ${index}`],...observation(product.id,index%2 ? '07/10/2026' : '08/10/2026',100+index),
]))]));
const results=[];
async function scenario(name,run) {await run();results.push(name);}
function client(fetchPage) {return createMexicoPriceClient({now:()=>NOW,fetchPage});}
const ok = html => ({ok:true,status:200,text:async()=>html});
async function fixtureGeneralEvidence() {
    const source=client(async url=>{
        const id=idFrom(url);
        return ok(id==='beef' ? page(id,[]) : id==='poultry' ? page(id,[['Ciudad de México: Plaza'],...observation(id,'08/10/2026',108)]) : fixtures[id]);
    });
    return proteinPriceEvidence(proteinProfile('Precio de res cerdo pollo y huevo por estado de México según SNIIM'),
        createProteinPriceClient({now:()=>NOW,mexicoClient:source,porciculturaClient:{get:async()=>[]}}));
}

async function main() {
    let calls=0;
    const source=client(async url=>{calls++;return ok(fixtures[idFrom(url)]);});
    await scenario('128 combinaciones: 32 entidades × 4 especies, valores y fechas aislados',async()=>{
        for (const [index,state] of STATES.entries()) for (const product of PRODUCTS) {
            const profile=proteinProfile(`Precio de ${product.name} en ${state.name} México según SNIIM`);
            const answer=await source.getDetailed(profile,PERIOD);
            assert.deepEqual(profile.mexicoStates,[state.code]);
            assert.equal(answer.records.length,1,`${product.name}/${state.name}`);
            assert.equal(answer.records[0].stateCode,state.code);
            assert.equal(answer.records[0].value,100+index);
            assert.equal(answer.records[0].date,index%2 ? '2026-10-07' : '2026-10-08');
            assert.equal(answer.coverage[0].status,'available');
        }
        assert.equal(calls,4,'Compartir reportes, no 128 descargas');
    });
    await scenario('Todas las entidades y consulta nacional conservan fechas por plaza',async()=>{
        const profile=proteinProfile('Precio de res cerdo pollo y huevo por estado de México según SNIIM');
        const answer=await source.getDetailed(profile,PERIOD);
        assert.equal(answer.records.length,128);
        assert.equal(answer.coverage.length,128);
        const national=await source.get(proteinProfile('Precio de huevo en México'),PERIOD);
        assert.equal(national.length,4);
        const mixed=client(async()=>ok(page('eggs',[
            ['Jalisco: Plaza'],...observation('eggs','08/10/2026',30),
            ['Puebla: Plaza'],...observation('eggs','07/10/2026',27),
        ])));
        const records=await mixed.get(proteinProfile('Precio de huevo en México'),PERIOD);
        assert.equal(records.length,2,'La fecha de Jalisco no elimina Puebla en consulta nacional');
    });
    await scenario(`${CITY_STATES.length} ciudades y ${COUNTRIES.length*4} combinaciones de país/producto`,async()=>{
        for (const [city,stateCode] of CITY_STATES) for (const product of PRODUCTS) {
            const profile=proteinProfile(`Precio de ${product.name} en ${city} México`);
            assert(profile.mexicoStates.includes(stateCode),city);
        }
        for (const country of COUNTRIES) for (const product of PRODUCTS) {
            const profile=proteinProfile(`Precio de ${product.name} en ${country.name}`);
            assert.deepEqual(profile.products,[product.id]);
            assert.deepEqual(profile.countries,[country.code],country.name);
        }
        for (const name of ['Brasil','España','China','Canadá','Japón']) {
            const profile=proteinProfile(`Precio del pollo en Tijuana ${name}`);
            assert.deepEqual(profile.mexicoStates,[],'País explícito manda sobre ciudad mexicana');
        }
    });
    await scenario('Cambio de país/estado en ambos caminos del chat sin contaminar el historial',async()=>{
        const empty={context:'',citations:[],sourceCodes:[],evidenceCount:0,charts:[],evidenceRecords:[]};
        const priceClient=createProteinPriceClient({now:()=>NOW,mexicoClient:source,porciculturaClient:{get:async()=>[]}});
        for (const method of ['stream','generateStructured']) {
            const chunks=[];
            const chat=new AIOrchestrator({provider:{name:'fixture',isConfigured:()=>true,generate:async()=>({text:'Puebla cuesta 999 MXN/kg.',model:'fixture'}),stream:async request=>{request.onText('Puebla cuesta 999 MXN/kg.');return {text:'Puebla cuesta 999 MXN/kg.',model:'fixture'};}},
                liveDataGrounder:async plan=>proteinPriceEvidence(plan.proteinProfile,priceClient),retriever:{retrieve:async()=>empty,recordQuery:async()=>null,recordEvidence:async()=>null}});
            const answer=await chat[method]({message:'¿Y en Jalisco?',history:[{role:'user',content:'Precio del huevo en Puebla México según SNIIM'}],tier:'flash',onText:part=>chunks.push(part)});
            assert.match(answer.text,/113\.00/);assert.doesNotMatch(answer.text,/Puebla|999/);
            assert.doesNotMatch(chunks.join(''),/999/,'La cifra inválida no debe salir por streaming');
            assert(answer.citations.every(citation=>/Jalisco/.test(citation.market)));
        }
        const foreign=planQuery({message:'¿Y en Brasil?',history:[{role:'user',content:'Precio del huevo en Puebla México'}]});
        assert.deepEqual(foreign.proteinProfile.countries,['BR']);assert.deepEqual(foreign.proteinProfile.mexicoStates,[]);
    });
    await scenario('Cruce de mes/año, caché por ventana, fallo mensual parcial y límites de petición',async()=>{
        let requests=0;
        const crossing=client(async url=>{
            requests++;const u=new URL(url),month=u.searchParams.get('mes');
            return ok(page('eggs',[['Jalisco: Plaza'],...observation('eggs',month==='09' ? '30/09/2026' : '07/10/2026',month==='09' ? 29 : 30),
                ...(month==='09' ? [['Puebla: Plaza'],...observation('eggs','30/09/2026',27)] : [])]));
        });
        const profile=proteinProfile('Precio del huevo en Puebla y Jalisco México');
        const previous=await crossing.getDetailed(profile,{start:'2026-09-28',end:'2026-10-08'});
        assert.equal(requests,2);assert.equal(previous.records.length,2);
        assert.equal(previous.records.find(record=>record.stateCode==='PUE').date,'2026-09-30');
        const october=await crossing.getDetailed(profile,PERIOD);
        assert.equal(october.records.length,1,'No reusar septiembre fuera del periodo');
        assert.equal(october.coverage.find(row=>row.stateCode==='PUE').status,'no_state_records');
        const january=client(async url=>{
            const u=new URL(url);return ok(page('eggs',[['Jalisco: Plaza'],...observation('eggs',u.searchParams.get('anio')==='2025' ? '31/12/2025' : '02/01/2026',25)]));
        });
        const newYear=await january.get(profile,{start:'2025-12-30',end:'2026-01-03'});
        assert.equal(newYear[0].date,'2026-01-02');
        const partial=client(async url=>new URL(url).searchParams.get('mes')==='10' ? {ok:false,status:503} : ok(page('eggs',[['Puebla: Plaza'],...observation('eggs','30/09/2026',27)])));
        const available=await partial.getDetailed(profile,{start:'2026-09-28',end:'2026-10-08'});
        assert.equal(available.records.length,1);assert.equal(available.coverage[0].failedReports,1);
        const text=mexicoPriceTable({proteinProfile:profile},{proteinPriceRecords:available.records,proteinPrices:{coverage:available.coverage}});
        assert.match(text,/Cobertura parcial/);assert.match(text,/2026-09-30/);
        assert.match(text,/cobertura quedó incompleta/);
        let bounded=0;
        await client(async()=>{bounded++;return ok('');}).get(proteinProfile('Precios de proteínas en México'),{start:'2000-01-01',end:'2026-10-08'});
        assert.equal(bounded,12,'Como máximo tres meses y cuatro especies');
        assert.deepEqual(await source.get(profile,{start:'2026-02-31',end:'2026-10-08'}),[]);
    });
    await scenario('Fechas imposibles/futuras, números inválidos, cambios de encabezado y duplicados contradictorios',async()=>{
        for (const state of STATES) {
            assert.equal(stateFromMarket(`${state.name}: Rastro`).code,state.code);
            assert.equal(stateFromMarket(`${state.name} Rastro`).code,state.code);
        }
        const malformed=page('eggs',[
            ['Puebla: Plaza'],...observation('eggs','08/10/2026',27),
            ['Plaza sin estado reconocido'],...observation('eggs','08/10/2026',99),
            ['Jalisco: Plaza'],...observation('eggs','31/02/2026',88),...observation('eggs','09/10/2026',90),
        ]);
        const records=parseMexicoPrices(malformed,'eggs','https://example.invalid/report',PERIOD,'2026-10-08');
        assert.equal(records.find(record=>record.stateCode==='PUE').value,27);
        assert.equal(records.find(record=>record.value===99).stateCode,null);
        assert(!records.some(record=>record.stateCode==='JAL'));
        for (const value of ['-1','0','NaN','Infinity','1e3','no reportado']) {
            const html=page('eggs',[['Puebla: Plaza'],['08/10/2026','Huevo blanco','Mayoreo',value,'-','-']]);
            assert.equal(parseMexicoPrices(html,'eggs','https://example.invalid/',PERIOD,'2026-10-08').length,0,value);
        }
        const contradictory=[['Puebla: Plaza'],...observation('eggs','08/10/2026',27),...observation('eggs','08/10/2026',28)];
        for (const rows of [contradictory,[contradictory[0],...contradictory.slice(1).reverse()]])
            assert.equal(parseMexicoPrices(page('eggs',rows),'eggs','https://example.invalid/',PERIOD,'2026-10-08').length,0);
    });
    await scenario('Porcicultura: estado sin cobertura, fuente caída y selección explícita de fuente',async()=>{
        const profile=proteinProfile('Precio del cerdo en Chihuahua según Porcicultura');
        const porci=createPorciculturaClient({now:()=>NOW,fetchPage:async()=>ok(JSON.stringify({data:[{fecha:'2026-10-07',estados:[{nombre:'Jalisco',precio:34}]}]}))});
        const missing=await porci.getDetailed(profile,PERIOD);
        assert.equal(missing.coverage[0].status,'no_state_records');assert.equal(missing.records.length,0);
        const failed=await createPorciculturaClient({now:()=>NOW,fetchPage:async()=>{throw Error('offline');}}).getDetailed(profile,PERIOD);
        assert.equal(failed.coverage[0].status,'source_error');
        const text=mexicoPriceTable({proteinProfile:profile},{proteinPriceRecords:[],proteinPrices:{coverage:failed.coverage}});
        assert.match(text,/Porcicultura.com/);assert.match(text,/no respondió/);
        assert.deepEqual(await porci.getDetailed(proteinProfile('Precio de canal de cerdo según SNIIM México'),PERIOD),{records:[],coverage:[]});
    });
    await scenario('Países sin conector: no reciben cotizaciones de México, UE o Estados Unidos',async()=>{
        const source=createProteinPriceClient({now:()=>NOW,fetchPage:async()=>{throw Error('No debería consultarse otra región');}});
        for (const country of COUNTRIES.filter(country=>!['MX','US','ES','DE','FR','PL','PT','IT','NL','BE','DK','IE','AT','RO','SE','BG','HR','CY','CZ','EE','FI','GR','HU','LV','LT','LU','MT','SK','SI'].includes(country.code))) {
            const answer=await source.get(proteinProfile(`Precios de proteínas en ${country.name}`));
            assert.equal(answer.records.length,0,country.name);assert.equal(answer.missing.length,4,country.name);
        }
    });
    await scenario('Presentaciones específicas, plurales, animales vivos y cajas no se sustituyen por canal/entero/kg',async()=>{
        for (const query of ['Precio de pechugas de pollo en México','Precio de muslos de pollo en México','Precio de tocino de cerdo en México','Precio de costillas de cerdo en México','Precio de pollos vivos en México','Precio de res viva en México','Precio del huevo por cartón en México','Precio del huevo por charola en México','Precio de huevo rojo en México','Precio de pollo congelado en México','Precio de pollo deshuesado en México']) {
            const profile=proteinProfile(query);
            assert(profile.specificPrice,query);
            assert.equal((await source.get(profile,PERIOD)).length,0,query);
            const stale=await source.get(proteinProfile('Precio del pollo en Jalisco México'),PERIOD);
            const plan=planQuery({message:query});
            const guarded=guardProteinPrices(plan,{proteinPriceRecords:stale},'| Pollo | México | 113.00 MXN/kg | 2026-10-07 | [Fuente]('+stale[0].url+') |');
            assert(guarded.blocked || guarded.changed && /No disponible/.test(guarded.text),query);
            assert.doesNotMatch(guarded.text,/113\.00/,query);
        }
    });
    await scenario('Unidades, moneda, categoría, país, estado, fecha y valor deben coincidir con evidencia',async()=>{
        const record={verified:true,productId:'poultry',product:'Pollo',countryCode:'MX',country:'México',stateCode:'JAL',category:'Pollo entero',priceBasis:'whole',value:50,currency:'MXN',unit:'MXN/kg',date:'2026-10-07',url:'https://example.invalid/report'};
        const line='| Pollo entero | Jalisco México | 50.00 MXN/kg | 2026-10-07 | [Fuente](https://example.invalid/report) |';
        assert(quoteMatchesRecord(line,record,[]));
        for (const invalid of [line.replace('50.00','51.00'),line.replace('MXN','USD'),line.replace('/kg','/docena'),line.replace('Jalisco','Puebla'),line.replace('México','Brasil'),line.replace('México','USA'),line.replace('México','México y Brasil'),line.replace('Jalisco','Jalisco y Puebla'),line.replace('2026-10-07','2026-10-08'),line.replace('Pollo entero','Pechuga de pollo'),line.replace('Pollo entero','Pollo por pieza'),line.replace('report)','other)')])
            assert(!quoteMatchesRecord(invalid,record,[]),invalid);
        const carcass={...record,productId:'pork',product:'Cerdo',priceBasis:'carcass'};
        assert(!quoteMatchesRecord(line.replace('Pollo entero','Cerdo').replace('/kg','/kg vivo'),carcass,[]));
        const eu=parseEuPrices([{memberStateCode:'ES',beginDate:'28/09/2026',endDate:'04/10/2026',price:'€170.70',unit:'100 KG',pigClass:'E'}],PRODUCTS[0],['ES'],{start:'2026-09-28',end:'2026-10-08'},NOW)[0];
        assert.equal(eu.priceBasis,'carcass');
        const euLine='| Cerdo clase E | España | 170.70 EUR/100 KG | 2026-10-04 | [Fuente]('+eu.url+') |';
        assert(quoteMatchesRecord(euLine,eu,[]));assert(!quoteMatchesRecord(euLine.replace('clase E','clase S'),eu,[]));
        const duplicate={memberStateCode:'ES',beginDate:'28/09/2026',endDate:'04/10/2026',price:'€170.70',unit:'100 KG',pigClass:'E'};
        assert.equal(parseEuPrices([duplicate,{...duplicate,price:'€171.00'}],PRODUCTS[0],['ES'],{start:'2026-09-28',end:'2026-10-08'},NOW).length,0);
        assert.equal(parseUsPrices({results:[{report_date:'10/07/2026',pork_carcass:98},{report_date:'10/07/2026',pork_carcass:99}]},PRODUCTS[0],PERIOD,NOW).length,0);
        const us=parseUsPrices({results:[{report_date:'10/09/2026',pork_carcass:98}]},PRODUCTS[0],{start:'2026-10-01',end:'2026-10-10'},NOW);
        assert.equal(us.length,0,'No aceptar registros futuros de USDA');
        assert.equal(parseUsPrices({results:[{report_date:'10/07/2026',choice_600_900_current:200}]},PRODUCTS[2],PERIOD,NOW).length,0,'No reinterpretar cutout bovino como huevo');
        const plan=planQuery({message:'Precio del pollo en Jalisco México y analiza el mercado'});
        assert(guardProteinPrices(plan,{proteinPriceRecords:[record]},line.replace('50.00','999.00')).blocked);
        for (const country of ['China','Japón','Canadá','Australia','India','Argentina','Colombia','Emiratos Árabes Unidos']) {
            const codes={China:'CNY',Japón:'JPY',Canadá:'CAD',Australia:'AUD',India:'INR',Argentina:'ARS',Colombia:'COP','Emiratos Árabes Unidos':'AED'};
            const foreignPlan=planQuery({message:`Precio de pollo en ${country}`});
            assert(guardProteinPrices(foreignPlan,{},`| Pollo | ${country} | 99 ${codes[country]}/kg | 2026-10-07 | [Fuente](https://example.invalid/precio) |`).blocked,country);
        }
        assert(guardProteinPrices(plan,{},'Pollo: 99 pesos/kg al 2026-10-07.').blocked);
    });
    await scenario('Cobertura nacional parcial legible y registros rezagados explícitos',async()=>{
        const profile=proteinProfile('Precio de proteínas por estado de México');
        const coverage=STATES.flatMap(state=>PRODUCTS.map(product=>({productId:product.id,stateCode:state.code,source:'SNIIM',url:'https://example.invalid/'+product.id,period:PERIOD,status:'no_state_records'})));
        const text=mexicoPriceTable({proteinProfile:profile},{proteinPriceRecords:[],proteinPrices:{coverage}});
        assert.equal(markdownToRichResponse(text).blocks.find(block=>block.type==='table').rows.length,128,'Conservar las 128 filas en la respuesta estructurada');
        assert.equal(validateRichResponse({blocks:[{type:'table',headers:['Dato'],rows:Array.from({length:700},()=>['Uno'])}]}).value.blocks[0].rows.length,600,'Conservar un límite de recursos');
        assert.equal((text.match(/Periodo consultado:/g)||[]).length,4,'Agrupar brechas por especie/fuente');
        assert.equal((text.match(/No disponible/g)||[]).length,128,'Conservar las 128 filas faltantes');
        const stale={...(await source.get(proteinProfile('Precio del huevo en Jalisco México'),PERIOD))[0],date:'2026-09-10'};
        const old=mexicoPriceTable({proteinProfile:proteinProfile('Precio del huevo en Jalisco México')},{proteinPriceRecords:[stale],proteinPrices:{fetchedAt:new Date(NOW).toISOString()}});
        assert.match(old,/2026-09-10 · dato rezagado/);
    });
    const output=path.resolve('output/revision-proteinas-general');fs.mkdirSync(output,{recursive:true});
    const report={passed:true,scenarios:results.length,stateSpeciesCombinations:128,citySpeciesCombinations:CITY_STATES.length*4,countrySpeciesCombinations:COUNTRIES.length*4,results,
        scope:'Lógica y orquestador reales con fuentes simuladas; no certifica cotizaciones reales ni cobertura completa mundial.'};
    fs.writeFileSync(path.join(output,'regresiones.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
}
module.exports={fixtureGeneralEvidence};
if (require.main===module) main().catch(error=>{console.error(error);process.exitCode=1;});
