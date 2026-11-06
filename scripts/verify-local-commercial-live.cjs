'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {proteinProfile,proteinPriceEvidence}=require('../backend/services/protein-market-intelligence');
const {mexicoPriceTable}=require('../backend/ai/protein-price-table');
const {fetchPublicPage}=require('../backend/services/mercolleida-public');
async function main() {
    if(process.argv.includes('--diagnose-cdmx')) {
        for(const code of ['0901','901']) {
            const url='https://qqp.profeco.gob.mx/api/precios?'+new URLSearchParams({clave_ciudad:code,busqueda:'pechuga'}),started=Date.now();
            try {
                const response=await fetchPublicPage(url,{headers:{Accept:'application/json',Authorization:'Basic '+Buffer.from('qqpweb:qqpweb').toString('base64')},signal:AbortSignal.timeout(6500)});
                const body=await response.text();let data;try {data=JSON.parse(body);} catch {data=null;}
                console.log(JSON.stringify({url,status:response.status,bytes:Buffer.byteLength(body),elapsed:Date.now()-started,success:data?.success,rows:data?.data?.productos?.length,sample:data?.data?.productos?.slice(0,1)},null,2));
            } catch(error) {console.log(JSON.stringify({url,elapsed:Date.now()-started,error:error.message}));}
        }
        return;
    }
    // Fixed public queries only: no conversation history, model call or order.
    const profile=proteinProfile('Precio de cerdo pollo huevo y res en Puebla México, mayoreo y venta al público');
    const evidence=await proteinPriceEvidence(profile);
    const output=path.resolve('output/proveedores-publicos');fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'ambas-etapas-real.json'),JSON.stringify({profile,...evidence},null,2));
    fs.writeFileSync(path.join(output,'ambas-etapas-real.md'),mexicoPriceTable({proteinProfile:profile},evidence));
    if(process.argv.includes('--regions')) {
        const summaries=[];
        for(const city of ['Guadalajara','Monterrey','CDMX']) {
            const regional=await proteinPriceEvidence(proteinProfile(`Precio de cerdo pollo huevo y res al público en ${city} México`));
            summaries.push({city,fetchedAt:regional.proteinPrices.fetchedAt,coverage:regional.proteinPrices.coverage,
                records:regional.proteinPriceRecords.filter(record=>record.commercialStage==='retail')});
        }
        fs.writeFileSync(path.join(output,'regiones-profeco-real.json'),JSON.stringify(summaries,null,2));
        console.log('Regiones PROFECO:',JSON.stringify(summaries.map(summary=>({city:summary.city,records:summary.records.length,
            states:[...new Set(summary.records.map(record=>record.stateCode))],dates:[...new Set(summary.records.map(record=>record.date))],coverage:summary.coverage.map(row=>({product:row.productId,status:row.status}))})),null,2));
    }
    console.log(JSON.stringify({fetchedAt:evidence.proteinPrices.fetchedAt,records:evidence.proteinPriceRecords.map(r=>({product:r.product,category:r.category,market:r.market,stage:r.commercialStage||r.priceBasis,value:r.value,unit:r.unit,date:r.date,dateBasis:r.dateBasis,minOrderKg:r.minOrderKg})),warnings:evidence.warnings},null,2));
    if(!['poultry','beef'].every(id=>evidence.proteinPriceRecords.some(r=>r.productId===id && r.commercialStage==='retail') && evidence.proteinPriceRecords.some(r=>r.productId===id && r.commercialStage==='wholesale'))) throw Error('No se recuperaron ambas etapas para pollo y res en esta lectura pública.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
