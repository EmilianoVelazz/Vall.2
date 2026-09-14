'use strict';

const assert = require('node:assert/strict');
const { trainAndAssess, walkForwardEvaluation } = require('../backend/ml/autoregressive-forecast');

// Serie determinista, con estacionalidad y tendencia: permite comprobar que el
// modelo usa únicamente historia y puede superar al baseline ingenuo.
const seasonal = Array.from({ length: 72 }, (_, index) => 100 + index * 0.4 + [0, 5, 9, 6, 0, -5, -8, -5][index % 8]);
const trained = trainAndAssess(seasonal);
assert.equal(trained.eligible, true);
assert(trained.evaluation.modelMae < trained.evaluation.baselineMae);
assert(Number.isFinite(trained.forecast.value));
assert(trained.forecast.upperBound > trained.forecast.lowerBound);

const tooShort = trainAndAssess([10, 11, 12, 13]);
assert.equal(tooShort.eligible, false);
assert.match(tooShort.reason, /observaciones/i);

const noLeakage = walkForwardEvaluation(seasonal.slice(0, 48));
const withFuture = walkForwardEvaluation(seasonal);
assert(noLeakage && withFuture);
assert.equal(noLeakage.evaluationPoints, 18);
assert.equal(withFuture.evaluationPoints, 24);
console.log('Forecast model tests: OK');
