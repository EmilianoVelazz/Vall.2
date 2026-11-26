'use strict';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../backend/ml/protein-ml-engine');
const policy = require('../backend/ml/protein-forecast-policy');
const {assessMultivariateForecast} = require('../backend/ml/multivariate-forecast');
const points = Array.from({length: 180}, (_, i) => ({date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
    value: 100 + i * .1 + Math.sin(i / 5) * 3 + Math.cos(i / 11)}));
const aligned = points.map(point => ({...point, exog: {}, prevExog: {}, sinMonth: 0, cosMonth: 1}));
const options = {horizonSteps: 5, feedLag: 4, cadence: 'daily'};
const directional = engine.runWalkForwardMetaStack(aligned, options);
assert(directional.evaluationWindows.length >= 12);
for (const [index, row] of directional.evaluationWindows.entries()) {
    assert(row.latestTrainingTarget <= row.cutoff);
    assert(!row.latestWeightTarget || row.latestWeightTarget <= row.cutoff);
    if (index) assert(directional.evaluationWindows[index - 1].targetDate <= row.cutoff, 'Ventanas de evaluación independientes');
}
const cutoff = directional.evaluationWindows[3].cutoff;
const changed = aligned.map(row => row.date <= cutoff ? row : {...row, value: row.value * (1.5 + Math.sin(row.value))});
const compared = engine.runWalkForwardMetaStack(changed, options);
const prior = compared.evaluationWindows.find(row => row.cutoff === cutoff);
assert.equal(prior.probabilityUp, directional.evaluationWindows[3].probabilityUp, 'Cambiar valores futuros no altera la predicción pasada');

const definition = {symbol: 'SYNTHETIC', label: 'Serie ficticia', species: 'cerdo', region: 'MX', country: 'México', unit: 'MXN/kg', cadence: 'daily', points};
const now = Date.parse(points.at(-1).date + 'T23:00:00Z');
const panel = engine.buildSpeciesPanelPriors([definition], {}, now).cerdo;
const historicalPanel = panel.at(points[100].date);
const changedPanel = engine.buildSpeciesPanelPriors([{...definition, points: points.map((row, i) => i <= 100 ? row : {...row, value: row.value * 2})}], {}, now).cerdo.at(points[100].date);
assert(historicalPanel.trainedThrough.slice(0, 10) <= points[100].date);
assert.equal(historicalPanel.sampleSize, changedPanel.sampleSize);
assert.equal(historicalPanel.predictProba(Array(17).fill(.1)), changedPanel.predictProba(Array(17).fill(.1)));

const multi = assessMultivariateForecast(points, {driver: points.map((row, i) => ({date: row.date, value: 70 + i * .05 + Math.cos(i / 7) * 2}))}, {horizon: 5, cadence: 'daily', now});
assert(multi.evaluation?.temporalWindows?.length >= 8);
for (const row of multi.evaluation.temporalWindows) {
    assert(row.latestTrainingTarget <= row.cutoff);
    assert(!row.latestCalibrationTarget || row.latestCalibrationTarget <= row.cutoff);
}
const mapped = engine.extractPointForecast({forecast: {value: 100, conformal80: {empiricalCoverage: .8}}, evaluation: {improvement: .25}});
assert.equal(mapped.improvementPct, 25); assert.equal(mapped.calibration80CoveragePct, 80);
assert.equal(mapped.conformal80CoveragePct, null, 'La cobertura de calibración no se presenta como cobertura validada');

const valid = {point: {improvementPct: 15, evaluationPoints: 20}, directional: {available: true, validationProtocol: policy.VALIDATION_PROTOCOL,
    evalWindows: 20, directionalAccuracyPct: 65, baselineAccuracyPct: 55, brierSkillPct: 10},
    freshness: {fresh: true}, target: '2026-12-01', now: Date.parse('2026-11-26')};
assert.deepEqual(policy.publicationReasons(valid), []);
for (const [field, value] of [['evalWindows', 4], ['directionalAccuracyPct', 50], ['brierSkillPct', -2]]) {
    assert(policy.publicationReasons({...valid, directional: {...valid.directional, [field]: value}}).length);
}
assert(policy.publicationReasons({...valid, point: null}).includes('price_baseline_not_beaten'));
assert(policy.publicationReasons({...valid, target: '2026-11-25'}).includes('target_not_in_future'));
const short = engine.forecastProteinSeries({...definition, points: points.slice(-18)}, {}, {now});
assert.equal(short.available, false); assert.equal(short.primaryForecast, null);
const stale = engine.forecastProteinSeries(definition, {}, {now: now + 50 * 86400000});
assert.equal(stale.available, false); assert(stale.publicationReasons.includes('stale_observations'));
assert.equal(policy.targetDate('2026-11-20', 5, 'daily'), '2026-11-27');
assert.equal(policy.targetDate('2026-01-31', 1, 'monthly'), '2026-02-28');

const futureNews = {generatedAt: '2026-11-25T12:00:00Z', bySpecies: {}};
assert.equal(engine.nlpSnapshotAsOf(futureNews, Date.parse('2026-10-01')), null);
const bucket = {eventCount: 1, netPressure: 1, riskScore: 90, topHeadlines: [{title: 'Evento ficticio', publishedAt: '2026-11-25T12:00:00Z'}]};
const forecast = {available: true, species: 'cerdo', region: 'MX', primaryForecast: {code: '1m', probUpPct: 60}, horizons: [{code: '1m', probUpPct: 60}]};
const withNews = engine.applyNlpOverlayToForecast(forecast, {...futureNews, bySpecies: {cerdo: bucket}, bySpeciesRegion: {cerdo: {MX: bucket}}});
assert.equal(withNews.primaryForecast.probUpPct, 60); assert.equal(withNews.primaryForecast.nlpOverlay.appliedDeltaPts, 0);

const oldFile = path.resolve(__dirname, '../output/ml-hardening-20261126/legacy-artifact-fixture.json');
fs.mkdirSync(path.dirname(oldFile), {recursive: true});
fs.writeFileSync(oldFile, JSON.stringify({version: 'marranas-ml-v6.0-nlp-events', forecasts: []}));
assert.equal(engine.loadCachedProteinML(oldFile), null, 'Los artefactos con el protocolo anterior requieren reentrenamiento');
const report = {directionalWindows: directional.evalWindows, directionalLeaks: 0,
    conformalWindows: multi.evaluation.temporalWindows.length, conformalLeaks: 0,
    futureMutationInvariant: true, datedPanelInvariant: true, unsupportedPublicationBlocked: true,
    staleSeriesBlocked: true, nlpProbabilitiesUnchanged: true, legacyModelBlocked: true};
fs.writeFileSync(path.join(path.dirname(oldFile), 'temporal-integrity.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
