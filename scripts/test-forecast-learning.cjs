'use strict';
const assert = require('node:assert/strict');
const { assessAdaptiveForecast, learnedPolicy, METHODS } = require('../backend/ml/adaptive-forecast');
const { createLearningStore, evaluateTrial, compatibleFeedback } = require('../backend/ml/forecast-learning-store');

const now = Date.parse('2026-10-06T21:00:00Z');
const options = { now, unit: 'USD', priceBasis: 'adjusted' };
const points = [{ date: '2026-10-01', value: 100 }, { date: '2026-10-02', value: 105 }, { date: '2026-10-05', value: 108 }, { date: '2026-10-06', value: 103 }];
const trial = { id: 'trial1', symbol: 'TSN', horizon: 1, cutoff_at: '2026-10-01', issued_at: '2026-10-01T22:00:00Z',
  status: 'pending', unit: 'USD', price_basis: 'adjusted', anchor_value: 100, predicted_value: 90, lower_bound: 87, upper_bound: 93,
  candidates: { last_value: 100, ridge_all: 90 }, assessment: { learning: { moveScale: 4, shadowEnsemble: 92 } } };

async function main() {
  assert.equal(evaluateTrial(trial, points.slice(0, 1), options), null, 'No evalúa sin el resultado');
  assert.equal(evaluateTrial(trial, points, { ...options, now: Date.parse('2026-10-01T23:00:00Z') }), null, 'No usa etiquetas futuras');
  const result = evaluateTrial(trial, points, options);
  assert.equal(result.actual_observed_at, '2026-10-02');
  assert.equal(result.outcome.signedError, 15);
  assert.equal(result.outcome.absoluteError, 15);
  assert.equal(result.outcome.baselineError, 5);
  assert.equal(result.outcome.directionCorrect, false);
  assert.equal(result.outcome.intervalCovered, false);
  assert.deepEqual(result.outcome.candidateErrors, { last_value: 5, ridge_all: 15 });
  assert.equal(result.outcome.policyErrors.ensemble, 13);
  assert.match(result.outcome.causalExplanation, /requiere evidencia adicional/);
  assert(result.outcome.diagnosis.some(text => text.includes('último precio')));
  assert.equal(evaluateTrial({ ...trial, horizon: 2 }, points, options).actual_observed_at, '2026-10-05', 'Cuenta sesiones observadas y salta el fin de semana');
  assert.equal(evaluateTrial({ ...trial, cutoff_at: '2026-09-30' }, points, options), null, 'No sustituye un corte ausente por otra fecha');
  assert.equal(evaluateTrial(trial, points, { ...options, priceBasis: 'revised' }).status, 'data_revised');
  assert.equal(evaluateTrial(trial, [{ ...points[0], value: 99 }, ...points.slice(1)], options).status, 'data_revised');
  const sameDay = { ...trial, cutoff_at: '2026-10-05', anchor_value: 108, issued_at: '2026-10-06T14:00:00Z',
    session_target_date: '2026-10-06', session_target_close_at: '2026-10-06T20:15:00Z' };
  assert.equal(evaluateTrial(sameDay, points, { ...options, now: Date.parse('2026-10-06T19:00:00Z') }), null);
  assert.equal(evaluateTrial(sameDay, points, options).status, 'evaluated', 'Sólo acepta el cierre del mismo día con horario confirmado');
  assert.equal(evaluateTrial({ ...sameDay, session_target_close_at: null }, points, options), null);
  assert.equal(evaluateTrial({ ...sameDay, issued_at: '2026-10-06T20:30:00Z' }, points, options), null, 'No aprende de una estimación emitida tras conocer el cierre');
  const evaluated = { ...trial, ...result, evaluated_at: '2026-10-03T00:00:00Z' };
  assert(compatibleFeedback(evaluated, points, options));
  assert(!compatibleFeedback(evaluated, points.map(point => ({ ...point, value: point.value + 1 })), options), 'Descarta resultados cuya base fue revisada');
  assert.equal(evaluateTrial(evaluated, points, options), null, 'Un resultado no se recalcula');

  const candidates = Object.fromEntries(METHODS.map(key => [key, 100]));
  const errors = Object.fromEntries(METHODS.map(key => [key, 10]));
  const warmup = learnedPolicy(candidates, Array.from({ length: 11 }, () => ({ errors })));
  assert(Object.values(warmup.corrections).every(value => value === 0));
  const learned = learnedPolicy(candidates, Array.from({ length: 12 }, () => ({ errors })));
  assert(Math.abs(learned.value - 102.5) < 1e-10, 'Corrige un sesgo positivo con reducción por muestra pequeña');
  assert(Object.values(learned.corrections).every(value => value === 2.5));
  assert(Math.abs(Object.values(learned.weights).reduce((sum, weight) => sum + weight, 0) - 1) < 1e-10);
  const series = Array.from({ length: 330 }, (_, index) => ({ date: new Date(Date.UTC(2025, 10, 1 + index)).toISOString().slice(0, 10), value: 100 + index * .4 + [0, 2, 1, -1, 3, 2, -2, -1][index % 8] }));
  const forecast = assessAdaptiveForecast(series, { horizon: 20, now });
  assert(forecast.eligible && forecast.evaluation.modelMae < forecast.evaluation.baselineMae);
  assert(forecast.evaluation.nonOverlapping.evaluationPoints >= 8);
  const limited = assessAdaptiveForecast(series.slice(-110), { horizon: 20, now });
  assert.equal(limited.eligible, false, 'No publica un mes de pronóstico apoyado en muchas ventanas solapadas de un histórico corto');
  assert.match(limited.reason, /sin solapamiento/);
  assert.equal(forecast.learning.realExamples, 0, 'La validación histórica no se presenta como experiencia real');
  const futureFeedback = Array.from({ length: 20 }, () => ({ status: 'evaluated', cutoff_at: '2026-09-10', actual_observed_at: '2026-10-07',
    issued_at: '2026-09-10T20:00:00Z', evaluated_at: '2026-10-08T00:00:00Z', outcome: { candidateErrors: errors, absoluteError: 100000, policyErrors: { ensemble: 99999 } } }));
  assert.deepEqual(assessAdaptiveForecast(series, { horizon: 20, now, feedback: futureFeedback }), forecast, 'Los resultados futuros no cambian pesos, rango ni evaluación');
  assert.throws(() => assessAdaptiveForecast([{ date: '2026-10-07', value: 100 }], { now }), TypeError);
  assert.throws(() => assessAdaptiveForecast(series, { horizon: 21, now }), RangeError);
  assert.equal(assessAdaptiveForecast(series.map(point => ({ ...point, value: 100 })), { now }).eligible, false, 'Se abstiene cuando no supera mantener el último valor');

  const rows = [];
  let completions = 0;
  const repo = { async list() { return structuredClone(rows); }, async save(row) {
    const existing = rows.find(saved => saved.trial_key === row.trial_key);
    if (existing) return structuredClone(existing);
    const saved = { ...structuredClone(row), id: 'saved-' + rows.length }; rows.push(saved); return structuredClone(saved);
  }, async complete(updates) {
    completions += 1;
    const changed = [];
    updates.forEach(update => { const existing = rows.find(row => row.id === update.id && row.status === 'pending');
      if (existing) { Object.assign(existing, update, { evaluated_at: new Date(now).toISOString() }); changed.push(existing.id); } });
    return changed;
  } };
  const store = createLearningStore(repo);
  const assessment = { eligible: true, forecast: { value: 110, lowerBound: 105, upperBound: 115 }, candidateForecasts: { last_value: 100 }, learning: { shadowEnsemble: 109 } };
  const original = await store.record('TSN', 1, points.slice(0, 1), assessment, { ...options, now: Date.parse(trial.issued_at) });
  const repeated = await store.record('TSN', 1, points.slice(0, 1), { ...assessment, forecast: { ...assessment.forecast, value: 120 } }, options);
  assert.deepEqual(repeated.assessment, original.assessment, 'La consulta repetida no reemplaza la estimación original');
  assert.equal(rows.length, 1);
  const readOnly = await store.review('TSN', 1, points, { ...options, persist: false });
  assert.equal(readOnly.feedback.length, 0);
  assert.equal(completions, 0, 'Una auditoría no escribe etiquetas ni historial');
  const review = await store.review('TSN', 1, points, options);
  assert.equal(review.summary.realEvaluations, 1);
  assert.equal(review.summary.realMae, 5);
  await store.review('TSN', 1, points, options);
  assert.equal(completions, 1, 'Cada resultado se evalúa una sola vez');
  const unavailable = createLearningStore({ async list() { throw { code: 'PGRST205' }; } });
  assert.equal((await unavailable.review('TSN', 1, points, options)).status, 'unavailable');
  console.log('Adaptive learning tests: OK · fechas, errores, sesgo, fuga temporal, revisiones, inmutabilidad y fallos de almacenamiento');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
