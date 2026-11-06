'use strict';
const assert=require('node:assert/strict');
const {parseProfeco,parseDspc,createLocalCommercialClient,requestedStages}=require('../backend/services/local-commercial-prices');
const {proteinProfile,proteinPriceEvidence,createProteinPriceClient}=require('../backend/services/protein-market-intelligence');
const {STATES}=require('../backend/services/mexico-price-scope');
const {mexicoPriceTable}=require('../backend/ai/protein-price-table');
const {quoteMatchesRecord,guardProteinPrices}=require('../backend/ai/protein-price-quality');
const {planQuery}=require('../backend/ai/query-planner');
const {AIOrchestrator}=require('../backend/ai/orchestrator');
const NOW=Date.parse('2026-10-08T22:30:00Z'),PERIOD={start:'2026-10-01',end:'2026-10-08'};
const SOURCE='https://qqp.profeco.gob.mx/results?city=2101&searchTerm=pechuga';
function row(overrides={}) {return {producto:'PECHUGA, S/M, 1 KG. GRANEL. PECHUGA. FILETE',tipo_producto:'PECHUGA',precio:169.9,
    fecha_observacion:'2026-10-06',establecimiento:'MEGA SORIANA PLAZA SAN PEDRO',municipio:'Puebla',entidad:'Puebla',...overrides};}
const payload=rows=>({data:{productos:rows}});
function catalogue({stamp='2026-10-08T22:00:00Z',unit='kg',href='/productos/pechuga-de-pollo-64'}={}) {
    return `<h1>Catálogo de mayoreo</h1><p>Entrega en Puebla</p><time id="sello-sync" datetime="${stamp}"></time>
    <table><tbody data-seccion="pollo"><tr data-producto="64"><th><a href="${href}">Pechuga de Pollo</a></th><td>${unit}</td><td>$143.00</td><td>143.00</td><td>1</td><td>Desde 15 kg · $98.00</td><td>Carrito</td></tr></tbody>
    <tbody data-seccion="res"><tr data-producto="109"><th><a href="/productos/bistec-norteno-109">Bistec Norteño de Res</a></th><td>kg</td><td>$208.00</td><td>208</td><td>1</td><td>—</td><td>Carrito</td></tr></tbody></table>`;
}
function profecoRows(term) {
    return term==='pechuga' ? [row()] : term==='bistec' ? [row({producto:'BISTEC DEL 0, S/M, 1 KG. GRANEL. BISTEC/CHULETA DEL 0',tipo_producto:'BISTEC DEL 0',precio:204})]
        : term==='chuleta' ? [row({producto:'CHULETA, S/M, 1 KG. GRANEL. CHULETA AHUMADA',tipo_producto:'CHULETA',precio:114})]
            : [row({producto:'HUEVO, EL CALVARIO, PAQUETE CON 12 BLANCO',tipo_producto:'HUEVO',precio:29})];
}
const ok=value=>({ok:true,status:200,text:async()=>typeof value==='string' ? value : JSON.stringify(value)});
const cities=[{clave_ciudad:'2101',ciudad:'Puebla'}];
function fixtureSource(options={}) {
    return createLocalCommercialClient({now:()=>NOW,fetchPage:async url=>{
        if(options.onFetch) options.onFetch(url);
        const u=new URL(url);
        if(u.hostname==='dspc.mx') return ok(catalogue());
        if(options.failed) return {ok:false,status:503,text:async()=>''};
        return ok(u.pathname==='/api/ciudades' ? {data:{ciudades:options.cities || cities}} : payload(profecoRows(u.searchParams.get('busqueda'))));
    }});
}
async function fixtureCommercialEvidence() {
    const profile=proteinProfile('Precio de cerdo pollo huevo y res en Puebla México, mayoreo y venta al público');
    const client=createProteinPriceClient({now:()=>NOW,localCommercialClient:fixtureSource(),
        mexicoClient:{get:async()=>[]},porciculturaClient:{get:async()=>[]}});
    return proteinPriceEvidence(profile,client);
}
async function main() {
    let groups=0;
    const parsed=parseProfeco(payload([row(),row(),row({fecha_observacion:'2026-10-05',precio:1}),
        row({fecha_observacion:'2026-10-09'}),row({fecha_observacion:'2026-02-30'}),row({entidad:'Desconocido'}),
        row({precio:-1}),row({precio:'169,90'}),row({producto:'PECHUGA SIN PESO'}),row({tipo_producto:'POLLO ROSTIZADO'})]),'poultry',SOURCE,PERIOD,'2026-10-08');
    assert.equal(parsed.length,1);assert.equal(parsed[0].date,'2026-10-06');assert.equal(parsed[0].value,169.9);assert.equal(parsed[0].priceBasis,'cut');
    assert.deepEqual(parseProfeco(payload([row(),row({precio:170})]),'poultry',SOURCE,PERIOD,'2026-10-08'),[],'Duplicados contradictorios no se publican');
    const eggs=parseProfeco(payload(profecoRows('huevo')),'eggs',SOURCE,PERIOD,'2026-10-08');
    assert.equal(eggs[0].unit,'MXN/paquete de 12 huevos');groups++;

    const wholesale=parseDspc(catalogue(),PERIOD,'2026-10-08');
    assert.equal(wholesale.length,3);assert.equal(wholesale[0].dateBasis,'catalog_update');
    assert.equal(wholesale[1].value,98);assert.equal(wholesale[1].minOrderKg,15);
    assert.equal(parseDspc(catalogue({unit:'pieza'}),PERIOD,'2026-10-08').filter(r=>r.productId==='poultry').length,0);
    assert.equal(parseDspc(catalogue({href:'javascript:alert(1)'}),PERIOD,'2026-10-08').filter(r=>r.productId==='poultry').length,0);
    assert.deepEqual(parseDspc(catalogue({stamp:'2026-10-09T00:00:00Z'}),PERIOD,'2026-10-08'),[]);groups++;

    let calls=0;const source=fixtureSource({onFetch:()=>calls++});
    const profile=proteinProfile('Precio de pollo y res en Puebla México, mayoreo y menudeo');
    assert.deepEqual(profile.commercialStages,['wholesale','retail']);assert.equal(profile.priceBasis,null);
    assert.equal(profile.specificPrice,false,'Pedir ambas etapas permite conservar SNIIM junto a catálogos');
    const [a,b]=await Promise.all([source.get(profile,PERIOD),source.get(profile,PERIOD)]);
    assert.equal(calls,4,'Catálogo, ciudades y dos especies se deduplican');assert.deepEqual(a.records,b.records);
    await source.get(profile,PERIOD);assert.equal(calls,4,'Caché sin repetición de consultas públicas');
    assert(a.records.some(r=>r.productId==='beef' && r.commercialStage==='retail'));
    for(const stage of ['mayoreo','venta al público']) {
        const records=(await source.get(proteinProfile('Precio de pollo en Puebla México '+stage),PERIOD)).records;
        assert(records.length);assert(records.every(r=>r.commercialStage===(stage==='mayoreo' ? 'wholesale' : 'retail')));
    }
    for(const term of ['al público','al detalle','minorista','supermercados']) assert.deepEqual(requestedStages(proteinProfile(`Precio del pollo en Puebla México ${term}`)),['retail']);
    const first=proteinProfile('Precio del pollo en Puebla México, mayoreo y menudeo');
    const next=proteinProfile('ahora en Guadalajara México','',first);assert.deepEqual(next.commercialStages,['wholesale','retail']);
    const answerBoth=planQuery({message:'Ambos, identificando cada etapa',history:[{role:'user',content:'Precio del pollo y la res en Puebla México'},{role:'assistant',content:'¿Mayoreo o venta al público?'}]});
    assert(answerBoth.needsProteinPrices);assert.deepEqual(answerBoth.proteinProfile.commercialStages,['wholesale','retail']);
    assert.deepEqual(answerBoth.proteinProfile.products,['poultry','beef']);
    assert.deepEqual(requestedStages(proteinProfile('Precio del pollo en México')),['wholesale','retail']);groups++;
    const changedProduct=proteinProfile('Precio de res en Puebla México','Precio de pechuga de pollo al menudeo en Puebla México');
    assert((await source.get(changedProduct,PERIOD)).records.some(r=>r.productId==='beef' && r.commercialStage==='wholesale'),'Cambiar de especie reinicia la presentación anterior');

    for(const query of ['Precio de pollo entero en Puebla México','Precio de muslo de pollo en Puebla México','Precio de pechuga de pollo deshuesada en Puebla México','Precio de huevo rojo en Puebla México','Precio del cerdo en pie en Puebla México',
        'Precio de res en canal en Puebla México','Precio de pollo congelado en Puebla México','Precio del pollo en Puebla México según SNIIM']) {
        assert.equal((await source.get(proteinProfile(query),PERIOD)).records.length,0,query);
    }
    const ribeye=await source.get(proteinProfile('Precio de ribeye de res al menudeo en Puebla México'),PERIOD);
    assert.equal(ribeye.records.length,0);assert(ribeye.coverage.every(r=>r.status!=='available'));
    assert.equal((await source.get(proteinProfile('Precio de huevo por docena en Puebla México'),PERIOD)).records[0].unit,'MXN/paquete de 12 huevos');
    assert.equal((await source.get(proteinProfile('Precio de huevo de 18 piezas en Puebla México'),PERIOD)).records.length,0);groups++;
    for(const [prefix,city,state,name] of [['0501','Saltillo','COA','Coahuila'],['0601','Colima','COL','Colima'],['0701','Tuxtla Gutiérrez','CHP','Chiapas'],['0901','Ciudad de México','CMX','Ciudad de México']]) {
        const mapped=createLocalCommercialClient({now:()=>NOW,fetchPage:async url=>ok(new URL(url).pathname==='/api/ciudades'
            ? {data:{ciudades:[{clave_ciudad:prefix,ciudad:city}]}} : payload([row({entidad:name,municipio:state==='CMX' ? 'Miguel Hidalgo' : city})]))});
        const result=await mapped.get(proteinProfile(`Precio del pollo al menudeo en ${state==='CMX' ? 'CDMX' : city} México`),PERIOD);
        assert.equal(result.records.length,1,city);assert.equal(result.records[0].stateCode,state);
    }groups++;

    const failed=await fixtureSource({failed:true}).get(proteinProfile('Precio de pollo en Puebla México'),PERIOD);
    assert(failed.records.some(r=>r.commercialStage==='wholesale'));assert(failed.coverage.some(r=>r.status==='source_error' && r.stage==='retail'));
    const unknown=await source.get({...profile,mexicoCities:[{name:'Cholula',stateCode:'PUE'}]},PERIOD);
    assert(!unknown.records.some(r=>r.commercialStage==='retail'));assert(unknown.coverage.some(r=>r.status==='no_city_records'));
    const allCities=STATES.map((state,i)=>({clave_ciudad:String(i+1).padStart(2,'0')+'01',ciudad:state.name}));
    let bounded=0;const national=await fixtureSource({cities:allCities,onFetch:()=>bounded++}).get(proteinProfile('Precio de proteínas por estado de México'),PERIOD);
    assert.equal(bounded,18,'Un catálogo + catálogo de ciudades + 4 ciudades × 4 productos');
    assert.equal(national.coverage.filter(r=>r.status==='not_queried').length,28*4);groups++;

    const evidence=await fixtureCommercialEvidence();const plan=planQuery({message:'Precio de cerdo pollo huevo y res en Puebla México, mayoreo y venta al público'});
    const table=mexicoPriceTable(plan,evidence);
    assert.match(table,/\| Etapa \|/);assert.match(table,/Mayoreo · proveedor/);assert.match(table,/Venta al público/);
    assert.match(table,/98\.00 MXN\/kg/);assert.match(table,/desde 15 kg/);assert.match(table,/2026-10-08 · catálogo/);
    assert.match(table,/2026-10-06 · levantamiento/);assert.match(table,/29\.00 MXN\/paquete de 12 huevos/);
    assert.doesNotMatch(table,/29\.00 \(frecuente\)|29\.00 MXN\/kg/);
    const retailTable=mexicoPriceTable(planQuery({message:'Precio del pollo al menudeo en Puebla México'}),evidence);
    assert.doesNotMatch(retailTable,/Mayoreo · proveedor|143\.00/);groups++;
    const fallback=guardProteinPrices({...plan,asksAnalysis:true},evidence,'Pollo: 999.00 MXN/kg al 2026-10-08.');
    assert(fallback.blocked);assert.doesNotMatch(fallback.text,/999\.00|Qué etapa comercial/);
    assert.match(fallback.text,/\| Etapa \|/);assert.match(fallback.text,/catálogo/);assert.match(fallback.text,/levantamiento/);

    const tier=wholesale[1];
    const good=`| Pollo · ${tier.category} | Mayoreo · proveedor | Puebla | 98.00 MXN/kg | 2026-10-08 · catálogo | [DSPC](${tier.url}) |`;
    assert(quoteMatchesRecord(good,tier,[]));
    for(const bad of [good.replace('desde 15 kg','oferta'),good.replace('catálogo','observación'),good.replace('Mayoreo · proveedor','Venta al público'),good.replace('Pechuga de Pollo','Muslo de Pollo')]) assert(!quoteMatchesRecord(bad,tier,[]),bad);
    const consumer=parsed[0];const retail=`| Pollo · ${consumer.category} | Venta al público | Puebla | 169.90 MXN/kg | 2026-10-06 | [PROFECO](${consumer.url}) |`;
    assert(quoteMatchesRecord(retail,consumer,[]));assert(!quoteMatchesRecord(retail.replace('Venta al público','Mayoreo'),consumer,[]));groups++;

    const empty={context:'',citations:[],sourceCodes:[],evidenceCount:0,charts:[],evidenceRecords:[],retrievalStrategy:'fixture'};
    for(const method of ['stream','generateStructured']) {
        const chat=new AIOrchestrator({provider:{name:'fixture',isConfigured:()=>true,generate:async()=>({text:'No tengo datos.',model:'fixture'}),stream:async()=>({text:'No tengo datos.',model:'fixture'})},
            liveDataGrounder:async()=>evidence,retriever:{retrieve:async()=>empty,recordQuery:async()=>null,recordEvidence:async()=>null}});
        const answer=await chat[method]({message:'Precio de cerdo pollo huevo y res en Puebla México, mayoreo y venta al público',history:[],tier:'flash'});
        assert.match(answer.text,/Venta al público/);assert.match(answer.text,/Mayoreo · proveedor/);assert.match(answer.text,/169\.90/);
        assert(answer.response.blocks.some(s=>s.type==='table' && s.headers.includes('Etapa')));
    }groups++;
    console.log(`Precios por etapa: ${groups} grupos OK (fechas, unidades, volumen, municipio, caché, errores, cobertura y dos rutas del chat).`);
}
module.exports={fixtureCommercialEvidence};
if(require.main===module) main().catch(error=>{console.error(error);process.exitCode=1;});
