'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../backend/lib/health-check.js'), 'utf8');
async function inspect({now = '2026-11-26T18:40:00Z', finance = '2026-11-26T12:00:00Z', ml = true} = {}) {
    const time = Date.parse(now), files = {
        'finance_executive_reports.json': {generatedAt: finance, reports: [{}]},
        'market_executive_reports.json': {generatedAt: '2026-11-20T20:00:00Z', reports: [{}]},
        'mexico-executive-reports.json': {generatedAt: now, reports: [{}]},
        ...(ml ? {'protein-ml-forecasts.json': {generatedAt: now, forecasts: [{}]}} : {}),
    };
    const fakeFs = {
        statSync(file) { if (!files[path.basename(file)]) throw Error('missing'); return {mtimeMs: time}; },
        readFileSync(file) { return JSON.stringify(files[path.basename(file)]); },
    };
    const module = {exports: {}};
    vm.runInNewContext(source, {module, __dirname: path.resolve(__dirname, '../backend/lib'),
        Date: class extends Date { constructor(...args) { super(...(args.length ? args : [time])); } static now() {return time;} },
        require: name => name === 'fs' ? fakeFs : name === 'path' ? path : {
            databaseConfig: () => null, isMariaDbConfigured: () => false,
        }, process: {env: {}, uptime: () => 100, memoryUsage: () => ({rss: 0, heapUsed: 0, heapTotal: 0})},
    });
    return module.exports.buildHealthPayload();
}
async function main() {
    const normal = await inspect();
    assert.equal(normal.status, 'ok');
    assert.equal(normal.checks.reports.markets.fresh, true, 'El corte semanal sigue vigente el jueves');
    const stale = await inspect({now: '2026-11-27T20:01:00Z', finance: '2026-11-27T12:00:00Z'});
    assert(stale.degradedReasons.includes('reports.markets:stale'), 'Un corte semanal vencido sí alerta');
    assert((await inspect({finance: '2026-11-24T12:00:00Z'})).degradedReasons.includes('reports.finance:stale'));
    assert((await inspect({ml: false})).degradedReasons.includes('proteinMl:missing'), 'No se oculta la falta de un modelo entrenado');
    console.log('Health: cortes diarios/semanales, vencimientos y ausencia de modelos ML verificados sin tocar cachés reales.');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
