'use strict';
const assert = require('node:assert/strict');
const { trainTemporalModel, trainingPoints } = require('../backend/ml/temporal-training');
const { fitAutoregressive } = require('../backend/ml/autoregressive-forecast');
const { assessAdaptiveForecast, candidatePredictions } = require('../backend/ml/adaptive-forecast');
const { fetchYahooHistory, trainForSymbol } = require('../backend/ml/forecasting-service');
const { dataPoints } = require('./train-forecast-local.cjs');
const now = Date.parse('2026-10-14T15:00:00Z');
const points = Array.from({ length: 150 }, (_, i) => ({ date: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10), value: 100 + i * .4 + [0, 5, 9, 6, 0, -5, -8, -5][i % 8] }));
(async () => {
    const trained = trainTemporalModel(points, { now });
    assert(trained.eligible);
    assert(trained.evaluation.modelMae < trained.evaluation.baselineMae);
    assert(trained.selection.tuningEnd < trained.selection.validationStart);
    assert.equal(trained.evaluation.evaluationPoints, 24);
    assert.equal(trained.forecast.probabilityUp, null);
    const poisoned = points.map(point => point.date >= trained.selection.validationStart ? { ...point, value: point.value + 5000 } : point);
    const future = trainTemporalModel(poisoned, { now });
    assert.deepEqual(future.selection, trained.selection, 'Las etiquetas de validación no cambian los hiperparámetros elegidos');
    assert.equal(future.eligible, false, 'Una mejora solo aparente en entrenamiento no se publica');
    assert.equal(trainTemporalModel(points.slice(0, 35), { now }).eligible, false);
    assert.equal(trainTemporalModel(points.map(row => ({ ...row, value: 100 })), { now }).eligible, false);
    for (const horizon of [3, 6, 20]) {
        const result = trainTemporalModel(points, { now, horizon });
        assert(result.selection.tuningEnd < result.selection.validationStart);
        assert(result.validation.every(row => row.cutoff < row.targetDate));
        assert.equal(result.forecast.horizon, horizon);
    }
    for (const invalid of [[{ date: '2026-02-30', value: 100 }], [{ date: '2026-10-15', value: 100 }], [{ date: '2026-01-01', value: null }], [points[1], points[0]], [points[0], points[0]]]) {
        assert.throws(() => trainingPoints(invalid, now), TypeError);
        assert.throws(() => assessAdaptiveForecast(invalid, { now }), TypeError);
    }
    const changes = fitAutoregressive(points.map(row => row.value), { targetMode: 'change' });
    assert.equal(changes.targetMode, 'change');
    assert(Number.isFinite(changes.predictSteps(6)));
    assert(Number.isFinite(candidatePredictions(points.map(row => row.value), 3).ridge_changes60));
    assert.throws(() => fitAutoregressive([1, 2], { ridge: -1 }), TypeError);
    const cleaned = dataPoints([{ date: '2026-05-01', value: '20' }, { date: '2026-04-01', value: '.' },
        { date: '2026-03-01', value: '10' }, { date: '2026-02-01', value: false }, { date: '2026-11-01', value: 1 }], now);
    assert.deepEqual(cleaned.points, [{ date: '2026-05-01', value: 20 }], 'No convierte meses separados por un hueco en pasos consecutivos');
    assert.equal(cleaned.excluded, 3);
    assert.throws(() => dataPoints([{ date: '2026-05-01', value: 20 }, { date: '2026-05-01', value: 21 }], now));

    function getResult(timestamps, closes, adjusted, regular = null) {
        return async () => ({ ok: true, json: async () => ({ chart: { result: [{ timestamp: timestamps.map(date => Date.parse(date) / 1000),
            indicators: { quote: [{ close: closes }], ...(adjusted ? { adjclose: [{ adjclose: adjusted }] } : {}) },
            meta: { currentTradingPeriod: { regular } } }] } }) });
    }
    const dates = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-14', '2026-10-15'];
    const valid = await fetchYahooHistory('TSN', '1d', { now, get: getResult(dates, [100, null, false, 110, 120], [90, null, false, 99, 108]) });
    assert.deepEqual(valid, [{ observed_at: '2026-10-01', value: 90 }], 'Ajustes, nulos, booleanos, cierre abierto y futuro');
    await assert.rejects(fetchYahooHistory('TSN', '1d', { now, get: getResult(dates, [100, 100, 100, 100, 100]) }), /ajustados/);
    const monthly = await fetchYahooHistory('USDMXN=X', '1mo', { now, get: getResult(['2026-09-01', '2026-10-01'], [20, 21]) });
    assert.deepEqual(monthly, [{ observed_at: '2026-09-01', value: 20 }]);
    const weekly = await fetchYahooHistory('USDMXN=X', '1wk', { now, get: getResult(['2026-10-05', '2026-10-12'], [20, 21]) });
    assert.deepEqual(weekly, [{ observed_at: '2026-10-05', value: 20 }]);
    const end = Date.parse('2026-10-14T14:00:00Z') / 1000;
    const closed = await fetchYahooHistory('USDMXN=X', '1d', { now, get: getResult(['2026-10-14'], [20], null, { end }) });
    assert.equal(closed.length, 1);
    await assert.rejects(fetchYahooHistory('USDMXN=X', '1d', { now, get: getResult(['2026-10-01', '2026-10-01'], [20, 21]) }), /dos valores/);
    function repository(writes) {
        return { from(table) { let inserted = null; return {
            upsert: async rows => { writes.push({ table, type: 'observations', rows }); return { error: null }; },
            insert(row) { inserted = row; writes.push({ table, type: 'insert', row }); return this; },
            select() { return this; }, eq() { return this; }, lte() { return this; },
            async single() { return { data: { id: table + '-fixture' }, error: null }; },
            then(resolve, reject) { return Promise.resolve({ data: inserted ? [inserted] : [], error: null }).then(resolve, reject); },
        }; } };
    }
    const acceptedWrites = [];
    const accepted = await trainForSymbol('TSN', { repository: repository(acceptedWrites), historyLoader: async () => points.map(row => ({ observed_at: row.date, value: row.value })) });
    assert(accepted.predictionId);
    const acceptedRun = acceptedWrites.find(row => row.table === 'forecast_runs').row;
    assert.equal(acceptedRun.model_version, '3.0.0');
    assert.equal(acceptedRun.status, 'accepted');
    assert(acceptedRun.parameters.selection.tuningEnd < acceptedRun.parameters.selection.validationStart);
    const prediction = acceptedWrites.find(row => row.table === 'forecast_predictions').row;
    assert.equal(prediction.probability_up, null);
    assert(Number.isFinite(prediction.confidence_score) && prediction.confidence_score >= 0 && prediction.confidence_score <= 100);
    assert(prediction.lower_bound <= prediction.predicted_value && prediction.upper_bound >= prediction.predicted_value);
    const rejectedWrites = [];
    const rejected = await trainForSymbol('TSN', { repository: repository(rejectedWrites), historyLoader: async () => points.map(row => ({ observed_at: row.date, value: 100 })) });
    assert.equal(rejected.eligible, false);
    assert(!rejectedWrites.some(row => row.table === 'forecast_predictions'), 'Un entrenamiento rechazado no publica objetivos');
    assert.equal(rejectedWrites.find(row => row.table === 'forecast_runs').row.status, 'rejected_baseline');
    console.log('ML temporal training: OK · selección/validación separadas, no fuga temporal, cinco métodos, abstención, revisiones, fechas, ajustes y velas abiertas');
})().catch(error => { console.error(error); process.exitCode = 1; });