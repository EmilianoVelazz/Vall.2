'use strict';

const { fitAutoregressive, MIN_IMPROVEMENT } = require('./autoregressive-forecast');
const { trainingPoints } = require('./temporal-training');
const { PROFILES, specialisedPredictions } = require('./market-profiles');

const MODEL_VERSION = '5.0.0';
const METHODS = ['last_value', 'ridge_all', 'ridge_recent60', 'damped_drift20', 'ridge_changes60'];
const MIN_FEEDBACK = 12;
const PRIOR = { last_value: .4, ridge_all: .15, ridge_recent60: .15, damped_drift20: .15, ridge_changes60: .15 };
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const quantile90 = values => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .9) - 1] || 0;

function candidatePredictions(values, horizon, profileId = 'general') {
    const last = values.at(-1);
    const recent = values.slice(-20);
    const predictions = {
        last_value: last,
        ridge_all: fitAutoregressive(values)?.predictSteps(horizon),
        ridge_recent60: fitAutoregressive(values.slice(-60))?.predictSteps(horizon),
        ridge_changes60: fitAutoregressive(values.slice(-60), { targetMode: 'change' })?.predictSteps(horizon),
        damped_drift20: last + .5 * horizon * (last - recent[0]) / (recent.length - 1),
        ...specialisedPredictions(values, horizon, profileId),
    };
    return Object.fromEntries(Object.entries(predictions).filter(([, value]) => Number.isFinite(value) && value > 0));
}

function learnedPolicy(candidates, samples) {
    const rows = samples.slice(-32);
    const weights = {}, corrections = {}, errors = {};
    const keys = Object.keys(candidates);
    const allErrors = rows.flatMap(row => keys.map(key => Math.abs(row.errors?.[key])).filter(Number.isFinite));
    const scale = allErrors.length ? Math.max(mean(allErrors) * .1, 1e-8) : 1;
    for (const key of keys) {
        const signed = rows.map(row => row.errors?.[key]).filter(Number.isFinite);
        const ready = signed.length >= MIN_FEEDBACK;
        const mae = signed.length ? mean(signed.map(Math.abs)) : null;
        const shrinkage = ready ? signed.length / (signed.length + MIN_FEEDBACK) : 0;
        const bias = ready ? Math.max(-mae * .5, Math.min(mae * .5, mean(signed))) * shrinkage : 0;
        corrections[key] = bias;
        errors[key] = { examples: signed.length, mae, meanSignedError: signed.length ? mean(signed) : null };
        const prior = PRIOR[key] ?? .1;
        weights[key] = ready ? shrinkage / (mae + scale) + (1 - shrinkage) * prior / scale : prior;
    }
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
    keys.forEach(key => { weights[key] /= total; });
    const value = keys.reduce((sum, key) => sum + weights[key] * Math.max(0, candidates[key] + corrections[key]), 0);
    return { value, weights, corrections, errors, examples: rows.length };
}

function realSamples(feedback, cutoff, knownAt) {
    return feedback.filter(row => row.status === 'evaluated' && row.actual_observed_at <= cutoff
        && Date.parse(row.evaluated_at) <= Date.parse(knownAt) && Date.parse(row.issued_at) < Date.parse(row.evaluated_at))
        .map(row => ({ cutoff: row.cutoff_at, actualDate: row.actual_observed_at,
            errors: row.outcome?.candidateErrors || {}, policyErrors: row.outcome?.policyErrors || {}, real: true }));
}

function selectPolicy(policy, candidates, samples) {
    const paired = samples.slice(-32).filter(row => Number.isFinite(row.policyErrors?.ensemble)
        && Number.isFinite(row.errors?.ridge_all) && Number.isFinite(row.errors?.last_value));
    const choices = paired.length < MIN_FEEDBACK ? [] : [
        { key: 'adaptive_ensemble', mae: mean(paired.map(row => Math.abs(row.policyErrors.ensemble))) },
        { key: 'ridge_all', mae: mean(paired.map(row => Math.abs(row.errors.ridge_all))) },
        { key: 'last_value', mae: mean(paired.map(row => Math.abs(row.errors.last_value))) },
    ].sort((a, b) => a.mae - b.mae);
    const best = choices[0];
    const current = choices.find(row => row.key === 'adaptive_ensemble');
    if (best && best.key !== 'adaptive_ensemble' && best.mae < current.mae * .98 && candidates[best.key]) return {
        ...policy, shadowEnsemble: policy.value, value: candidates[best.key], selectedStrategy: best.key,
        weights: Object.fromEntries(Object.keys(candidates).map(key => [key, key === best.key ? 1 : 0])),
        corrections: Object.fromEntries(Object.keys(candidates).map(key => [key, 0])),
    };
    return { ...policy, shadowEnsemble: policy.value, selectedStrategy: 'adaptive_ensemble' };
}

function mergeSamples(simulated, real) {
    // Una observación real y su simulación histórica no cuentan dos veces.
    const distinct = new Map();
    [...simulated, ...real].forEach(row => distinct.set(`${row.cutoff}:${row.actualDate}`, row));
    return [...distinct.values()].sort((a, b) => a.actualDate.localeCompare(b.actualDate) || a.cutoff.localeCompare(b.cutoff));
}

function assessAdaptiveForecast(points, { horizon = 1, feedback = [], now = Date.now(), profileId = 'general' } = {}) {
    if (!PROFILES[profileId]) throw new TypeError('Perfil de pronóstico no reconocido.');
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 20) throw new RangeError('Horizonte permitido: de 1 a 20 observaciones.');
    trainingPoints(points, now);
    const required = Math.max(PROFILES[profileId].minObservations, 50 + 2 * (horizon - 1));
    if (points.length < required) return { eligible: false, observations: points.length,
        reason: `Se requieren ${required} observaciones para aprender de errores previos y evaluar el ajuste a este horizonte.` };
    const values = points.map(point => point.value);
    const simulations = [], evaluations = [];
    const end = values.length - horizon + 1;
    // Long horizons need a longer evaluation history: twenty overlapping
    // forecasts do not provide twenty independent market outcomes.
    const start = Math.max(30, end - Math.max(64, horizon * 18 + MIN_FEEDBACK));
    for (let origin = start; origin < end; origin++) {
        const cutoff = points[origin - 1].date;
        const knownAt = `${cutoff}T23:59:59.999Z`;
        const samples = mergeSamples(simulations.filter(row => row.targetIndex < origin), realSamples(feedback, cutoff, knownAt));
        const candidates = candidatePredictions(values.slice(0, origin), horizon, profileId);
        const policy = selectPolicy(learnedPolicy(candidates, samples), candidates, samples);
        const targetIndex = origin + horizon - 1;
        const actual = values[targetIndex];
        const knownErrors = simulations.filter(row => row.targetIndex < origin).slice(-64).map(row => Math.abs(row.predictionError));
        const priorRange = knownErrors.length >= MIN_FEEDBACK ? quantile90(knownErrors) : null;
        if (samples.length >= MIN_FEEDBACK) evaluations.push({ origin, targetIndex, signedError: actual - policy.value,
            cutoff: points[origin - 1].date, resultDate: points[targetIndex].date,
            intervalCovered: priorRange === null ? null : Math.abs(actual - policy.value) <= priorRange,
            error: Math.abs(actual - policy.value), baseline: Math.abs(actual - values[origin - 1]),
            directionCorrect: Math.sign(policy.value - values[origin - 1]) === Math.sign(actual - values[origin - 1]) });
        simulations.push({ cutoff, targetIndex, actualDate: points[targetIndex].date,
            predictionError: actual - policy.value,
            policyErrors: { ensemble: actual - policy.shadowEnsemble },
            errors: Object.fromEntries(Object.entries(candidates).map(([key, predicted]) => [key, actual - predicted])) });
    }
    const heldOut = evaluations.slice(-24);
    if (heldOut.length < 8) return { eligible: false, observations: points.length, reason: 'Faltan ocho evaluaciones posteriores al aprendizaje inicial para verificar el ajuste.' };
    const real = realSamples(feedback, points.at(-1).date, new Date(now).toISOString());
    const samples = mergeSamples(simulations, real);
    const candidates = candidatePredictions(values, horizon, profileId);
    const policy = selectPolicy(learnedPolicy(candidates, samples), candidates, samples);
    const modelMae = mean(heldOut.map(row => row.error));
    const baselineMae = mean(heldOut.map(row => row.baseline));
    const improvement = baselineMae > 0 ? (baselineMae - modelMae) / baselineMae : 0;
    const nonOverlapping = [];
    for (const row of [...evaluations].reverse()) {
        if (!nonOverlapping.length || row.targetIndex < nonOverlapping.at(-1).origin) nonOverlapping.push(row);
        if (nonOverlapping.length >= 16) break;
    }
    nonOverlapping.reverse();
    const independentMae = mean(nonOverlapping.map(row => row.error));
    const independentBaseline = mean(nonOverlapping.map(row => row.baseline));
    const independentImprovement = independentBaseline > 0 ? (independentBaseline - independentMae) / independentBaseline : 0;
    const intervalChecks = evaluations.slice(-64).filter(row => row.intervalCovered !== null);
    const realErrors = feedback.filter(row => row.status === 'evaluated' && row.actual_observed_at <= points.at(-1).date
        && Date.parse(row.evaluated_at) <= now && Date.parse(row.issued_at) < Date.parse(row.evaluated_at))
        .map(row => row.outcome?.absoluteError).filter(Number.isFinite).slice(-32);
    const errorRange = Math.max(quantile90(simulations.slice(-64).map(row => Math.abs(row.predictionError))), realErrors.length >= MIN_FEEDBACK ? quantile90(realErrors) : 0);
    const sufficientWindows = nonOverlapping.length >= 8;
    const eligible = sufficientWindows && Number.isFinite(policy.value) && policy.value > 0
        && improvement >= MIN_IMPROVEMENT && independentImprovement >= MIN_IMPROVEMENT && policy.selectedStrategy !== 'last_value';
    return {
        eligible, observations: values.length,
        reason: eligible ? null : !sufficientWindows ? `Sólo hay ${nonOverlapping.length} ventanas sin solapamiento; se requieren ocho para publicar una estimación a este horizonte.`
            : 'El ajuste adaptativo no superó al baseline de último valor en ambas validaciones temporales.',
        evaluation: { horizon, evaluationPoints: heldOut.length, modelMae, baselineMae, improvement, errorRange,
            rmse: Math.sqrt(mean(heldOut.map(row => row.error ** 2))),
            baselineWins: heldOut.filter(row => row.error < row.baseline).length,
            directionAccuracy: mean(heldOut.map(row => Number(row.directionCorrect))),
            meanSignedError: mean(heldOut.map(row => row.signedError)),
            intervalChecks: intervalChecks.length,
            intervalCoverage: intervalChecks.length ? mean(intervalChecks.map(row => Number(row.intervalCovered))) : null,
            intervalProtocol: 'range_from_errors_known_before_each_origin',
            nonOverlapping: { evaluationPoints: nonOverlapping.length, modelMae: independentMae, baselineMae: independentBaseline,
                improvement: independentImprovement, windows: nonOverlapping.map(row => ({ cutoff: row.cutoff, resultDate: row.resultDate })) },
            eligible, protocol: 'prequential_delayed_feedback' },
        candidateForecasts: candidates,
        forecast: { horizon, value: policy.value, lowerBound: Math.max(0, policy.value - errorRange), upperBound: policy.value + errorRange,
            changePct: (policy.value - values.at(-1)) / values.at(-1) * 100, probabilityUp: null, rangeMethod: 'out_of_sample_absolute_errors' },
        learning: { modelVersion: MODEL_VERSION, marketProfile: profileId, profileName: PROFILES[profileId].name, methods: Object.keys(candidates), method: 'rolling_error_weights_and_shrunk_bias',
            weights: policy.weights, corrections: policy.corrections, candidateErrors: policy.errors,
            selectedStrategy: policy.selectedStrategy, shadowEnsemble: policy.shadowEnsemble,
            examplesUsed: policy.examples, simulatedExamples: simulations.length, realExamples: real.length,
            correctionRule: 'Sesgo limitado a la mitad del MAE y reducido según el tamaño de muestra.',
            moveScale: quantile90(simulations.map(row => Math.abs(values[row.targetIndex] - values[row.targetIndex - horizon]))),
        },
    };
}

module.exports = { MODEL_VERSION, METHODS, MIN_FEEDBACK, candidatePredictions, learnedPolicy, assessAdaptiveForecast };
