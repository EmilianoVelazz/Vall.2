'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createMexicoPriceClient,parseMexicoPrices}=require('../backend/services/mexico-protein-prices');
const {stateFromMarket}=require('../backend/services/mexico-price-scope');
const {createProteinPriceClient,proteinPriceEvidence,proteinProfile}=require('../backend/services/protein-market-intelligence');
const {planQuery}=require('../backend/ai/query-planner');
const {mexicoPriceTable}=require('../backend/ai/protein-price-table');
const NOW=Date.parse('2026-10-08T20:00:00Z'),period={start:'2026-10-01',end:'2026-10-08'};
const page=(title,rows)=>`<title>${title}</title><table>${rows.map(row=>'<tr>'+row.map(cell=>`<td>${cell}</td>`).join('')+'</tr>').join('')}</table>`;
const fixtures={
    pork:page('Porcinos : Carne en canal',[['Ags. : R.M. Aguascalientes'],['08/10/2026','Supremo','65','72','78','1','2']]),
    beef:page('Bovinos : Carne en canal',[['Ags. : R.M. Aguascalientes'],['Fecha:08/10/2026'],['Toros','450','40','100','110']]),
    poultry:page('Pollo entero',[['D.F. : Centro de distribución'],['08/10/2026','Pollo entero','Marca','Guanajuato','3.5','2.65','$58.70']]),
    eggs:page('Precio de Huevo',[['PUE: Central de Abasto de Puebla'],['07/10/2026','Huevo blanco','Mayoreo','$27.00','$27.00','$31.00'],['Q.R. Mercado de Chetumal, Quintana Roo'],['08/10/2026','Huevo blanco','Mayoreo','$31.00','-','-'],['XYZ: Plaza desconocida'],['08/10/2026','Huevo blanco','Mayoreo','$99.00','-','-']]),
};
function idFromUrl(url) {const u=new URL(url);return u.pathname.endsWith('e_Hue.asp') ? 'eggs' : u.pathname.endsWith('e_Ent.asp') ? 'poultry' : u.searchParams.get('Var') === 'Por' ? 'pork' : 'beef';}
function source(failedId=null) {return createMexicoPriceClient({now:()=>NOW,fetchPage:async url=>({ok:idFromUrl(url)!==failedId,status:idFromUrl(url)===failedId ? 503 : 200,text:async()=>fixtures[idFromUrl(url)]})});}
async function fixtureEvidence() {
    const client=createProteinPriceClient({now:()=>NOW,mexicoClient:source(),porciculturaClient:{get:async()=>[{verified:true,product:'Cerdo',productId:'pork',country:'México',countryCode:'MX',stateCode:'PUE',market:'Puebla',category:'Cerdo en pie · referencia estatal',priceBasis:'live',value:38,currency:'MXN',unit:'MXN/kg vivo',date:'2026-10-07',source:'Porcicultura.com',sourceCode:'porcicultura_live_pork_prices',url:'https://www.porcicultura.com/economia/precios-del-cerdo-en-pie-en-mexico'}]}});
    return proteinPriceEvidence(proteinProfile('Precio del cerdo, pollo, huevo y res en Puebla México'),client);
}
async function main() {
    assert.equal(stateFromMarket('Q.R. Mercado de Chetumal, Quintana Roo').code,'ROO');
    const rows=parseMexicoPrices(fixtures.eggs,'eggs','https://example.invalid/',period,'2026-10-08');
    assert.equal(rows.find(row=>row.stateCode==='PUE').value,27,'No atribuir la siguiente plaza a Puebla');
    assert.equal(rows.find(row=>row.stateCode==='PUE').date,'2026-10-07');
    assert.equal(rows.find(row=>row.stateCode==='ROO').value,31);
    assert.equal(rows.find(row=>row.value===99).stateCode,null);
    const profile=proteinProfile('Precio del cerdo, pollo, huevo y res en Puebla México');
    const detailed=await source().getDetailed(profile,period);
    assert.equal(detailed.coverage.find(row=>row.productId==='poultry').status,'no_state_records');
    assert.equal(detailed.coverage.find(row=>row.productId==='beef').status,'no_state_records');
    assert.equal(detailed.coverage.find(row=>row.productId==='eggs').status,'available');
    const evidence=await fixtureEvidence();
    assert.equal(evidence.proteinPriceRecords.length,2);
    const plan=planQuery({message:'Precio del cerdo, pollo, huevo y res en Puebla México'});
    const table=mexicoPriceTable(plan,evidence);
    assert.match(table,/Pollo \| Puebla \| No disponible \| — \| \[Ver reporte SNIIM\]/);
    assert.match(table,/Res \| Puebla \| No disponible \| — \| \[Ver reporte SNIIM\]/);
    assert.match(table,/otras plazas, pero no devolvió un registro local/);
    assert.match(table,/2026-08-27 a 2026-10-08/);
    assert.doesNotMatch(table,/58\.70|100\.00|110\.00|99\.00/,'No llenar Puebla con otras plazas');
    const failed=await source('poultry').getDetailed(profile,period);
    assert.equal(failed.coverage.find(row=>row.productId==='poultry').status,'source_error');
    const failureText=mexicoPriceTable(plan,{proteinPriceRecords:failed.records,proteinPrices:{coverage:failed.coverage}});
    assert.match(failureText,/Pollo en Puebla: el reporte no respondió/);
    const output=path.resolve('output/diagnostico-proteinas-puebla');fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'cobertura-simulada.json'),JSON.stringify({passed:true,coverage:evidence.proteinPrices.coverage,scope:'Fixtures controladas para separar cobertura, error de fuente y mezcla de plazas.'},null,2));
    console.log('Puebla: cobertura por especie/plaza, errores de fuente, enlaces y límites de mercados OK');
}
module.exports={fixtureEvidence};
if(require.main === module) main().catch(error=>{console.error(error);process.exitCode=1;});
