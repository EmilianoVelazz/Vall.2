'use strict';
const assert = require('node:assert/strict');
const {checkOperations} = require('./check-production-operations.cjs');
const healthy = {timestamp: new Date().toISOString(), status: 'ok', checks: {reports: {},
    config: {geminiConfigured: true, supabaseRestConfigured: true, backgroundJobsEnabled: true}}};
function run(payload, ok = true) {
    return checkOperations('https://monitor.example.invalid', {fetchImpl: async () => ({ok, json: async () => payload})});
}
async function main() {
    assert.equal((await run(healthy)).ok, true);
    assert.equal((await run(healthy, false)).ok, false);
    assert.equal((await run({...healthy, status: 'degraded'})).ok, false);
    assert.equal((await run({...healthy, timestamp: '2020-01-01'})).ok, false);
    const result = await run({...healthy, status: 'degraded', degradedReasons: ['mail:recent_delivery_failure', 'private@example.invalid']});
    assert(result.issues.includes('mail:recent_delivery_failure'));
    assert(!JSON.stringify(result).includes('private@example.invalid'));
    assert.equal((await checkOperations('https://monitor.example.invalid', {fetchImpl: async () => {throw Error('private');}})).ok, false);
    await assert.rejects(checkOperations('http://monitor.example.invalid'), /invalid_monitor_url/);
    await assert.rejects(checkOperations('https://user:password@monitor.example.invalid'), /invalid_monitor_url/);
    console.log('Monitor externo: fallos HTTP, respuesta vencida, indisponibilidad y privacidad verificados.');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
