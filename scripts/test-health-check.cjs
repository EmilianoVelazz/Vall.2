'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {MODEL_VERSION} = require('../backend/ml/protein-forecast-policy');
const source = fs.readFileSync(path.resolve(__dirname, '../backend/lib/health-check.js'), 'utf8');
async function inspect({now = '2026-11-26T18:40:00Z', finance = '2026-11-26T12:00:00Z', ml = true, deep = false, restStatus = 200, emailFailure = false} = {}) {
    const time = Date.parse(now), files = {
        'finance_executive_reports.json': {generatedAt: finance, reports: [{}]},
        'market_executive_reports.json': {generatedAt: '2026-11-20T20:00:00Z', reports: [{}]},
        'mexico-executive-reports.json': {generatedAt: now, reports: [{}]},
        ...(ml ? {'protein-ml-forecasts.json': {version: MODEL_VERSION, generatedAt: now, forecasts: [{available: true}]}} : {}),
    };
    const fakeFs = {
        statSync(file) { if (!files[path.basename(file)]) throw Error('missing'); return {mtimeMs: time}; },
        readFileSync(file) { return JSON.stringify(files[path.basename(file)]); },
    };
    const module = {exports: {}};
    vm.runInNewContext(source, {module, __dirname: path.resolve(__dirname, '../backend/lib'),
        Date: class extends Date { constructor(...args) { super(...(args.length ? args : [time])); } static now() {return time;} },
        require: name => name === '../ml/protein-forecast-policy' ? {MODEL_VERSION}
            : name === 'fs' ? fakeFs : name === 'path' ? path : name === '../services/report-mailer'
            ? {mailAutomationEnabled: () => true, reportMailStatus: () => ({configured: true})}
            : name === './report-email-worker' ? {reportEmailWorkerStatus: () => ({active: true, lastCheckedAt: now,
                lastCompletedAt: now, lastFailureAt: emailFailure ? now : null})} : {
            databaseConfig: () => null, isMariaDbConfigured: () => false,
        }, process: {env: deep ? {SUPABASE_URL: 'https://storage.example.invalid/_data', SUPABASE_SERVICE_ROLE_KEY: 'fixture'} : {},
            uptime: () => 100, memoryUsage: () => ({rss: 0, heapUsed: 0, heapTotal: 0})},
        AbortSignal, fetch: async url => {
            assert.equal(new URL(url).searchParams.get('limit'), '0');
            assert(new URL(url).pathname.endsWith('/app_profiles'));
            return {ok: restStatus === 200, status: restStatus};
        },
    });
    return module.exports.buildHealthPayload({deep});
}
async function main() {
    const normal = await inspect();
    assert.equal(normal.status, 'ok');
    assert.equal(normal.checks.reports.markets.fresh, true, 'El corte semanal sigue vigente el jueves');
    const stale = await inspect({now: '2026-11-27T20:01:00Z', finance: '2026-11-27T12:00:00Z'});
    assert(stale.degradedReasons.includes('reports.markets:stale'), 'Un corte semanal vencido sí alerta');
    assert((await inspect({finance: '2026-11-24T12:00:00Z'})).degradedReasons.includes('reports.finance:stale'));
    assert((await inspect({ml: false})).degradedReasons.includes('proteinMl:missing'), 'No se oculta la falta de un modelo entrenado');
    assert.equal((await inspect({deep: true})).status, 'ok');
    for (const restStatus of [401, 403, 404, 500]) {
        assert((await inspect({deep: true, restStatus})).degradedReasons.includes('supabaseRest:unreachable'));
    }
    assert((await inspect({deep: true, emailFailure: true})).degradedReasons.includes('mail:recent_delivery_failure'));
    console.log('Health: cortes diarios/semanales, vencimientos y ausencia de modelos ML verificados sin tocar cachés reales.');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
