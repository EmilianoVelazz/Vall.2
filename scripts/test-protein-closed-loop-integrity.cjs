'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {PROTEIN_ML_VERSION} = require('../backend/ml/protein-ml-engine');
const file = path.resolve(__dirname, '../backend/ml/protein-ml-closed-loop.js');
const realRequire = createRequire(file), moduleBox = {exports: {}};
let cached;
vm.runInNewContext(fs.readFileSync(file, 'utf8'), {module: moduleBox, __dirname: path.dirname(file), console,
    process: {env: {}}, Buffer, setTimeout, clearTimeout,
    require(name) {
        if (name === 'node:fs') return {mkdirSync() {}, writeFileSync(_file, data) {cached = JSON.parse(data);}};
        if (name === 'dotenv') return {config() {}};
        if (name === '../lib/tls-trust') return {configureSystemTrust() {}};
        if (name === './protein-ml-engine') return {PROTEIN_ML_VERSION};
        return realRequire(name);
    },
});
const good = {id: 'evaluation', actual_value: 110, percentage_error: 4, interval_covered: true,
    evaluated_observation_at: '2026-10-10', created_at: '2026-10-11T00:00:00Z',
    forecast_predictions: {symbol: 'SYNTHETIC', interval_code: '1wk', horizon_code: '1w',
        generated_at: '2026-10-01T12:00:00Z', target_at: '2026-10-10', predicted_value: 105,
        probability_up: .6, evidence: {lastValue: 100}, forecast_runs: {model_version: PROTEIN_ML_VERSION,
            created_at: '2026-10-01T12:00:00Z', parameters: {species: 'cerdo', region: 'MX'}}}};
const clone = () => JSON.parse(JSON.stringify(good));
const old = clone(); old.forecast_predictions.forecast_runs.model_version = 'marranas-ml-v6.0';
const audit = clone(); audit.forecast_predictions.forecast_runs.model_version += ':audit';
const late = clone(); late.forecast_predictions.forecast_runs.created_at = '2026-10-11';
const unknown = clone(); delete unknown.forecast_predictions.generated_at;
const undatedActual = clone(); delete undatedActual.evaluated_observation_at;
const prematureActual = clone(); prematureActual.evaluated_observation_at = '2026-10-09';
const prematureEvaluation = clone(); prematureEvaluation.created_at = '2026-10-09';
const rows = [old, audit, late, unknown, undatedActual, prematureActual, prematureEvaluation, good];
const query = {select() {return this;}, or() {return this;}, order() {return this;}, async limit() {return {data: rows, error: null};}};
async function main() {
    const result = await moduleBox.exports.buildClosedLoopAuditAndFeedback({supabase: {from() {return query;}}, now: Date.parse('2026-10-12')});
    assert.equal(result.summary.totalEvaluated, 1);
    assert.equal(result.summary.excludedUnverified, 7);
    assert.equal(result.summary.evaluationScope, 'prospective_current_model_only');
    assert.equal(result.feedbackBySymbol.SYNTHETIC.evaluations, 1);
    assert.equal(cached.summary.totalEvaluated, 1);
    console.log('Closed-loop: modelos anteriores, retrospectivas, predicciones tardías y fechas ausentes excluidos de las métricas prospectivas.');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
