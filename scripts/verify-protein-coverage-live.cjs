'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {proteinProfile,createProteinPriceClient,PRODUCTS}=require('../backend/services/protein-market-intelligence');
const {STATES}=require('../backend/services/mexico-price-scope');
async function main() {
    // Only fixed public market queries; no user history, credentials or model calls.
    const client=createProteinPriceClient();
    const result=await client.get(proteinProfile('Precios de res cerdo pollo y huevo por estado de México'));
    const byProduct=PRODUCTS.map(product=>({product:product.name,records:result.records.filter(record=>record.productId===product.id).length,
        states:STATES.filter(state=>result.records.some(record=>record.productId===product.id && record.stateCode===state.code)).map(state=>state.name),
        dates:[...new Set(result.records.filter(record=>record.productId===product.id).map(record=>record.date))].sort()}));
    const report={fetchedAt:result.fetchedAt,period:result.period,scope:'Lectura real de reportes públicos SNIIM y Porcicultura. Cobertura de la consulta, no validación de ofertas comerciales.',
        byProduct,warnings:result.warnings,coverage:result.coverage,records:result.records};
    const output=path.resolve('output/revision-proteinas-general');fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'cobertura-publica-real.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({fetchedAt:report.fetchedAt,period:report.period,byProduct,warnings:report.warnings},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
