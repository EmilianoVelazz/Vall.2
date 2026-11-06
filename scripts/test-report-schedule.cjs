'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { REPORT_HOURS, REPORT_TIME_ZONE, nextReportRefreshAt } = require('../backend/lib/report-schedule');

assert.deepEqual(REPORT_HOURS, [6, 14]);
assert.equal(REPORT_TIME_ZONE, 'America/Mexico_City');

const cases = [
    ['2026-09-24T11:59:59.999Z', '2026-09-24T12:00:00.000Z'], // justo antes de 06:00
    ['2026-09-24T12:00:00.000Z', '2026-09-24T20:00:00.000Z'], // 06:00 -> 14:00
    ['2026-09-24T13:30:00.000Z', '2026-09-24T20:00:00.000Z'], // 07:30 -> 14:00
    ['2026-09-24T18:15:00.000Z', '2026-09-24T20:00:00.000Z'], // 12:15 -> 14:00
    ['2026-09-24T20:00:00.000Z', '2026-09-25T12:00:00.000Z'], // 14:00 -> 06:00 siguiente
    ['2026-09-25T20:00:00.000Z', '2026-09-26T12:00:00.000Z'], // también fines de semana
    ['2026-01-31T20:00:00.000Z', '2026-02-01T12:00:00.000Z'],
    ['2026-12-31T20:00:00.000Z', '2027-01-01T12:00:00.000Z'],
    ['2028-02-28T20:00:00.000Z', '2028-02-29T12:00:00.000Z'],
    ['2028-02-29T20:00:00.000Z', '2028-03-01T12:00:00.000Z'],
];

cases.forEach(([from, expected]) => {
    assert.equal(nextReportRefreshAt(new Date(from)).toISOString(), expected);
});

const deployment = require('../vercel.json');
const morning = deployment.crons.find(item => item.path === '/api/executive-reports/refresh/morning');
const afternoon = deployment.crons.find(item => item.path === '/api/executive-reports/refresh/afternoon');
assert.equal(morning.schedule, '0 12 * * *');
assert.equal(afternoon.schedule, '0 20 * * *');
assert.equal(new Intl.DateTimeFormat('en', { timeZone: REPORT_TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(new Date('2026-10-15T12:00:00Z')), '06');
const labels = require('../shared/report-languages.json').labels;
for (const label of ['Con cada corte disponible (06:00 y 14:00)', 'Se prepara una edición nueva al terminar cada corte: 06:00 y 14:00.', 'Cortes 06:00 · 14:00']) {
    assert(labels[label].every(text => text.includes('06:00') && text.includes('14:00') && !text.includes('08:00')));
}

(async () => {
    // Reloj simulado: se ejecutan los temporizadores reales del módulo para
    // tres tareas diarias sintéticas, sin consultar fuentes o correo.
    let time = Date.parse('2026-10-15T11:59:30Z');
    class Clock extends Date {
        constructor(...args) { super(...(args.length ? args : [time])); }
        static now() { return time; }
    }
    const timers = [], cleared = [], runs = [], warnings = [];
    const sandbox = { module: { exports: {} }, require:require('node:module').createRequire(path.join(__dirname,'../backend/lib/report-schedule.js')),Date: Clock, Intl,
        console: { log() {}, warn: (...values) => warnings.push(values) },
        setTimeout: (callback, delay) => { const timer = { callback, delay, unref() {} }; timers.push(timer); return timer; },
        clearTimeout: timer => cleared.push(timer),
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../backend/lib/report-schedule.js'), 'utf8'), sandbox);
    const cancel = ['finance', 'daily-fixture', 'mexico'].map(area => sandbox.module.exports.scheduleDailyReport(async () => {
        runs.push([area, time]);
        if (area === 'finance' && time === Date.parse('2026-10-15T20:00:00Z')) throw Error('Fallo de fuente simulado');
    }, area));
    assert(timers.slice(0, 3).every(timer => timer.delay === 30000));
    time = Date.parse('2026-10-15T12:00:00Z');
    for (const timer of timers.slice(0, 3)) await timer.callback();
    assert.equal(runs.length, 3);
    assert(timers.slice(3, 6).every(timer => timer.delay === 8 * 3600000));
    time = Date.parse('2026-10-15T20:00:00Z');
    for (const timer of timers.slice(3, 6)) await timer.callback();
    assert.equal(runs.length, 6);
    assert.equal(warnings.length, 1);
    assert(timers.slice(6, 9).every(timer => timer.delay === 16 * 3600000), 'Un fallo no cancela el corte del día siguiente');
    cancel.forEach(stop => stop());
    assert.equal(cleared.length, 3);
    console.log('Report refresh schedule: OK · motor diario 06:00/14:00 CDMX, cron UTC, seis idiomas, límites de calendario y continuidad tras fallos');
})().catch(error => { console.error(error); process.exitCode = 1; });
