'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),express=require('express');
const {createUserReportStore}=require('../backend/services/user-report-store');
const {createUserReportsRouter}=require('../backend/routes/user-reports');
async function main() {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vall-report-inputs-')),owner='fixture@example.invalid',store=createUserReportStore({directory});let server,cases=0;
 const report={title:'Prueba de límites',summary:'Datos de prueba',sections:[{heading:'Lectura',text:'Validar condiciones.'}]};
 try {
  const app=express();app.use('/api',createUserReportsRouter({store,authenticate:(req,res,next)=>{req.user={email:owner};next();}}));
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const request=async(body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/user-reports`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,...await response.json()};};
  for(const value of [[],[0],[42],{},null,true,false,'',' ', 'Infinity']) {
   const result=await request({report:{...report,visuals:[{type:'bar',bars:[{label:'Referencia',value}]}]}});assert.equal(result.status,400,'No convertir a precio un dato inválido: '+JSON.stringify(value));cases++;
  }
  for(const invalid of [null,[],{...report,title:{}},{...report,summary:[]},{...report,tables:[{rows:[[{precio:40}]]}]},{...report,sourceLinks:[{url:'javascript:alert(1)'}]},{...report,sourceLinks:[{url:'https://usuario:clave@example.invalid'}]},{...report,sections:Array(21).fill({text:'Texto'})},{...report,sections:[{text:'x'.repeat(8001)}]}]) {assert.equal((await request({report:invalid})).status,400);cases++;}
  assert.equal((await store.list(owner)).length,0,'Los rechazos no dejan informes a medias');
  for(const value of [0,-2,42.5,'42.5']) {assert.equal((await request({report:{...report,visuals:[{type:'bar',bars:[{label:'Referencia',value}]}]}})).status,200);cases++;}
  assert.equal((await store.list(owner)).length,4,'Conserva ceros reales, negativos y decimales');
  console.log(`Report input abuse: OK · ${cases} límites y estructuras inválidas mediante HTTP real`);
 } finally {if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
