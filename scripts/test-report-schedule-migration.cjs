'use strict';
const assert=require('node:assert/strict');
const {applyScheduleMigrations}=require('./apply-report-email-schedules-migration.cjs');
(async()=>{
    const queries=[];let closed=0;
    const result=await applyScheduleMigrations({connect:async()=>({query:async sql=>{queries.push(sql);},end:async()=>{closed++;}})});
    assert.equal(queries[0],'BEGIN');assert.equal(queries.at(-1),'COMMIT');assert.equal(closed,1);
    assert(queries.some(sql=>sql.includes('interval_hours IN (12, 24, 168)')),'La migración admite días y semanas');
    assert(queries.some(sql=>sql.includes("'mexico'")),'La migración incluye México');
    assert.equal(result.migrations.length,3);
    queries.length=0;
    await assert.rejects(applyScheduleMigrations({connect:async()=>({query:async sql=>{queries.push(sql);if(sql.includes('interval_hours IN'))throw Error('fixture');},end:async()=>{closed++;}})}),/fixture/);
    assert.equal(queries.at(-1),'ROLLBACK');assert.equal(closed,2);
    console.log('Migración de programaciones: tres cambios, transacción, reversión y liberación de conexión OK; base simulada, TLS centralizado.');
})().catch(error=>{console.error(error);process.exitCode=1;});
