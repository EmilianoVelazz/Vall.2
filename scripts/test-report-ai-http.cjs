'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
async function main() {
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-ai-edition-http-'));process.env.VALL_REPORT_EDITIONS_DIR=directory;
    const {start}=require('./lib/security-fixture.cjs');const fixture=await start();
    try {
        const report={title:'Informe largo',sections:Array.from({length:3},(_,i)=>({heading:'Sección '+i,text:'Texto de prueba. '.repeat(400)}))};
        const headers={Authorization:fixture.authorization(),'Content-Type':'application/json',Origin:'https://app.example.test'};
        const saved=await fetch(fixture.url+'/api/user-reports',{method:'POST',headers,body:JSON.stringify({report})});assert.equal(saved.status,200,'El servidor completo acepta informes mayores de diez kilobytes');
        const generated=await fetch(fixture.url+'/api/user-reports/generate',{method:'POST',headers,body:JSON.stringify({report,instructions:'Resumir'})});assert.equal(generated.status,503,'El parser admite el informe; la IA sin credenciales responde de forma explícita');
        assert.match((await generated.json()).error,/no está configurada/);
        const oversized=await fetch(fixture.url+'/api/user-reports/generate',{method:'POST',headers,body:JSON.stringify({report,instructions:'x'.repeat(600000)})});assert.equal(oversized.status,413);
        console.log('Report AI HTTP: OK · servidor completo, límite propio, disponibilidad de IA y tamaño máximo');
    } finally {await fixture.close();await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
