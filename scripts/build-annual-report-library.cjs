'use strict';
process.env.NODE_ENV='test';
const fs=require('node:fs/promises');
require('dotenv').config({path:'backend/.env',quiet:true});
const {loadAnnualData}=require('../backend/lib/report-annual-data');
const {createAnnualLibrary}=require('../backend/services/annual-report-library');
const rawFile='backend/cache/annual-history-data.json';
(async()=>{
    let raw;try{raw=JSON.parse(await fs.readFile(rawFile,'utf8'));}catch { /* Initial historical import. */ }
    if(!raw || process.argv.includes('--refresh')){
        raw=await loadAnnualData({previous:raw,onProgress:(done,total)=>{if(done%20===0 || done===total)console.log('Fuentes históricas: '+done+'/'+total);}});
        await fs.mkdir('backend/cache',{recursive:true});await fs.writeFile(rawFile,JSON.stringify(raw));
    }
    const library=await createAnnualLibrary({load:async()=>raw}).get({refresh:true});
    const audit=Object.entries(library.years).map(([year,reports])=>({year,reports:reports.map(report=>({collection:report.collection,key:report.key,...report.annualCoverage,tables:report.tables.length,charts:report.visuals.length}))}));
    await fs.mkdir('output/otros-informes',{recursive:true});await fs.writeFile('output/otros-informes/auditoria-libreria-anual.json',JSON.stringify({generatedAt:library.generatedAt,years:audit,unavailableSources:raw.errors},null,2));
    console.log('Librería anual preparada: '+Object.keys(library.years).length+' años, '+Object.values(library.years).flat().length+' informes.');
    console.log(JSON.stringify(audit));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
