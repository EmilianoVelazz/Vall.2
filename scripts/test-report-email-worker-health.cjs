'use strict';
const assert = require('node:assert/strict');
const {startReportEmailWorker, reportEmailWorkerStatus} = require('../backend/lib/report-email-worker');
const flush = () => new Promise(resolve => setImmediate(resolve));
async function main() {
    const options = {now: () => Date.parse('2026-11-26T18:00:00Z'), setTimer: () => ({unref() {}}), clearTimer() {}, onError() {}};
    let stop = startReportEmailWorker(async () => ({errors: 1}), options);
    await flush();
    assert.equal(reportEmailWorkerStatus().lastFailureCode, 'REPORT_EMAIL_DELIVERY_FAILED');
    assert.equal(reportEmailWorkerStatus().lastCompletedAt, '2026-11-26T18:00:00.000Z');
    stop();
    stop = startReportEmailWorker(async () => {throw Error('private-account@example.invalid credential-fixture');}, options);
    await flush();
    assert.equal(reportEmailWorkerStatus().lastFailureCode, 'REPORT_EMAIL_WORKER_FAILED');
    assert(!JSON.stringify(reportEmailWorkerStatus()).includes('private-account'));
    stop();
    assert.equal(reportEmailWorkerStatus().active, false);
    console.log('Email worker health: fallos de entrega y ejecución observables, estados de cierre y ausencia de datos privados.');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
