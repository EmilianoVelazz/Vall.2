'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'isolated-user-report-test-secret';
delete process.env.USER_PASSWORD;
const {createUserReportStore,normalizeReport} = require('../backend/services/user-report-store');
const {createUserReportsRouter} = require('../backend/routes/user-reports');
async function main() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(),'vall-editions-test-'));
    let server;
    try {
        const store = createUserReportStore({directory});
        const app = express(); app.use('/api',createUserReportsRouter({store}));
        server = await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
        const base = `http://127.0.0.1:${server.address().port}/api/user-reports`;
        const token = owner=>jwt.sign({sub:owner,email:owner},process.env.JWT_SECRET,{expiresIn:'1h'});
        async function request(owner, suffix='', body, method) {
            const response=await fetch(base+suffix,{method:method || (body ? 'POST' : 'GET'),headers:{...(owner ? {Authorization:'Bearer '+token(owner)} : {}),'Content-Type':'application/json'},...(body ? {body:JSON.stringify(body)} : {})});
            return {status:response.status,data:await response.json(),cache:response.headers.get('cache-control')};
        }
        const owner='ana@example.invalid',other='luis@example.invalid';
        const report={title:'Plan de compras',summary:'Texto escrito por Ana',sections:[{heading:'Decisión',text:'Comparar proveedores'}],tables:[{title:'Costos',columns:['Producto','Precio'],rows:[['Pollo','42']]}],sourceLinks:[{label:'Fuente',url:'https://example.org/datos'}]};
        assert.equal((await request(null)).status,401);
        assert.equal((await request(null,'',{report})).status,401);
        const result=await request(owner,'',{report,owner:other}); assert.equal(result.status,200); assert.match(result.cache,/no-store/);
        const saved=result.data.data; assert.equal(saved.editionVersion,1);
        assert.equal(result.data.accountEmail,owner);
        assert.equal((await request(owner)).data.accountEmail,owner);
        assert.equal((await request(owner,'/'+saved.editionId)).data.accountEmail,owner);
        for(const [suffix,body,method] of [['',{report,expectedOwner:other},'POST'],['/generate',{report,expectedOwner:other},'POST'],['/'+saved.editionId,{version:1,expectedOwner:other},'DELETE']]) {
            const mismatch=await request(owner,suffix,body,method);assert.equal(mismatch.status,409);assert.equal(mismatch.data.code,'REPORT_ACCOUNT_CHANGED');
        }
        assert.equal((await request(owner)).data.data.length,1,'Cambiar de cuenta no crea ni elimina un informe');
        assert.equal((await request(owner)).data.data.length,1);
        assert.equal((await request(other)).data.data.length,0,'El propietario sale del token, no del cuerpo');
        assert.equal((await request(other,'/'+saved.editionId)).status,404);
        assert.equal((await request(other,'',{id:saved.editionId,version:1,report})).status,404);
        assert.equal((await request(owner,'/not-a-valid-id')).status,400);
        const restarted=createUserReportStore({directory});
        assert.equal((await restarted.get(owner,saved.editionId)).summary,report.summary,'Conserva el documento después de reiniciar');
        const updated=await request(owner,'',{id:saved.editionId,version:1,report:{...report,summary:'Mi texto corregido'}});
        assert.equal(updated.data.data.editionVersion,2);
        assert.equal((await request(owner,'',{id:saved.editionId,version:1,report})).status,409,'Una pestaña antigua no sobrescribe la edición nueva');
        const races=await Promise.all([request(owner,'',{id:saved.editionId,version:2,report}),request(owner,'',{id:saved.editionId,version:2,report})]);
        assert.deepEqual(races.map(result=>result.status).sort(),[200,409]);
        for(const invalid of [{...report,title:''},{title:'Sin contenido'},{...report,sourceLinks:[{url:'javascript:alert(1)'}]},{...report,sections:[{text:'x'.repeat(8001)}]},{...report,visuals:[{bars:[{value:'invalid'}]}]}]) assert.equal((await request(owner,'',{report:invalid})).status,400);
        assert.equal(normalizeReport({...report,owner:other,password:'no guardar',metrics:[{label:'Cero',value:0}]}).metrics[0].value,'0');
        assert(!('password' in normalizeReport({...report,password:'no guardar'})));
        const baseReport={collection:'mexico',key:'mx_proteins',title:'Proteínas de México',generatedAt:'2026-10-12T14:00:00Z'};
        const withBase=await request(owner,'',{report:{...report,baseReport}});
        assert.equal(withBase.status,200);
        assert.equal((await restarted.get(owner,withBase.data.data.editionId)).baseReport.key,'mx_proteins','Conserva la base elegida después de guardar');
        assert.equal((await request(owner,'',{report:{...report,baseReport:{...baseReport,collection:'mine'}}})).status,400);
        assert.equal((await request(owner,'',{report:{...report,baseReport:{...baseReport,collection:'__proto__'}}})).status,400);
        const copy=await request(owner,'',{report}); assert.notEqual(copy.data.data.editionId,saved.editionId);
        const target=copy.data.data;
        assert.equal((await request(null,'/'+target.editionId,{version:1},'DELETE')).status,401);
        assert.equal((await request(other,'/'+target.editionId,{owner,version:1},'DELETE')).status,404,'El cuerpo no permite eliminar documentos de otra cuenta');
        assert(await restarted.get(owner,target.editionId));
        assert.equal((await request(owner,'/not-a-valid-id',{version:1},'DELETE')).status,400);
        assert.equal((await request(owner,'/'+target.editionId,{},'DELETE')).status,400);
        assert.equal((await request(owner,'/'+target.editionId,{version:2},'DELETE')).status,409,'No elimina una versión que no se revisó');
        const deletion=await request(owner,'/'+target.editionId,{version:1},'DELETE');assert.equal(deletion.status,200);assert.equal(deletion.data.data.editionId,target.editionId);
        assert.equal(await restarted.get(owner,target.editionId),null,'La eliminación persiste después de reiniciar');
        assert((await restarted.get(owner,saved.editionId)),'Conserva los otros informes');
        assert.equal((await request(owner,'',{id:target.editionId,version:1,report})).status,404,'Guardar una pestaña antigua no recrea un informe eliminado');
        const racing=(await request(owner,'',{report})).data.data;
        const removeAndSave=await Promise.all([request(owner,'/'+racing.editionId,{version:1},'DELETE'),request(owner,'',{id:racing.editionId,version:1,report})]);
        assert.equal(removeAndSave.filter(result=>result.status===200).length,1,'Sólo guardar o eliminar gana la carrera');
        assert(removeAndSave.some(result=>[404,409].includes(result.status)));
        console.log('User reports: OK · sesión, aislamiento, persistencia, edición, copia, conflictos, eliminación por propietario, validación y concurrencia');
    } finally {if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));} await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
