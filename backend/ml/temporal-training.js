'use strict';
const { fitAutoregressive, fitDampedHolt, fitLogReturnReversion, fitDirectShrinkageAR, MIN_IMPROVEMENT } = require('./autoregressive-forecast');
const VERSION = '3.0.0';
const GRID = Object.freeze([
    { key: 'last_value', window: null, targetMode: 'baseline', ridge: null },
    ...['level', 'change'].flatMap(targetMode => [null, 60].flatMap(window => [.05, .35, 2].map(ridge => ({
        key: `${targetMode}_${window || 'all'}_ridge${ridge}`, window, targetMode, ridge,
    })))),
    { key: 'damped_holt', window: null, targetMode: 'holt', ridge: null },
    { key: 'log_ou_all_ridge1', window: null, targetMode: 'log_ou', ridge: 1.0 },
    { key: 'log_ou_120_ridge1.5', window: 120, targetMode: 'log_ou', ridge: 1.5 },
    { key: 'log_ou_direct_ridge2.5', window: null, targetMode: 'log_ou_direct', ridge: 2.5 },
    { key: 'change_weighted_120', window: 120, targetMode: 'change', ridge: 0.75, decay: 0.985 },
    { key: 'direct_shrink_all_r1.5', window: null, targetMode: 'direct_shrink', ridge: 1.5, shrinkage: 0.55 },
    { key: 'direct_shrink_120_r2', window: 120, targetMode: 'direct_shrink', ridge: 2.0, shrinkage: 0.45 },
    { key: 'level_damped_all_r0.35_s0.65', window: null, targetMode: 'level_damped', ridge: 0.35, shrinkage: 0.65 },
    { key: 'level_damped_all_r0.35_s0.35', window: null, targetMode: 'level_damped', ridge: 0.35, shrinkage: 0.35 },
]);
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
function fit(values, config, horizon = 1) {
    if (config.targetMode === 'baseline') return null;
    const slice = config.window ? values.slice(-config.window) : values;
    if (config.targetMode === 'holt') return fitDampedHolt(slice, { horizon });
    if (config.targetMode === 'log_ou') return fitLogReturnReversion(slice, { ridge: config.ridge });
    if (config.targetMode === 'log_ou_direct') return fitLogReturnReversion(slice, { ridge: config.ridge, horizon, direct: true });
    if (config.targetMode === 'direct_shrink') return fitDirectShrinkageAR(slice, { horizon, ridge: config.ridge, shrinkage: config.shrinkage });
    if (config.targetMode === 'level_damped') {
        const baseModel = fitAutoregressive(slice, { targetMode: 'level', ridge: config.ridge || 0.35 });
        if (!baseModel) return null;
        const s = config.shrinkage ?? 0.5;
        const last = slice.at(-1);
        return {
            ...baseModel,
            algorithm: `damped_ridge_level_s${Math.round(s * 100)}`,
            targetMode: 'level_damped',
            predictNext() { return s * baseModel.predictNext() + (1 - s) * last; },
            predictSteps(steps = 1) { return s * baseModel.predictSteps(steps) + (1 - s) * last; },
        };
    }
    return fitAutoregressive(slice, { targetMode: config.targetMode, ridge: config.ridge, decay: config.decay || 1 });
}
function predict(values, config, horizon) {
    return config.targetMode === 'baseline' ? values.at(-1) : fit(values, config, horizon)?.predictSteps(horizon);
}
function trainingPoints(points, now = Date.now()) {
    if (!Array.isArray(points)) throw new TypeError('La serie debe ser una lista de observaciones.');
    const today = new Date(now).toISOString().slice(0, 10);
    for (let index = 0; index < points.length; index++) {
        const point = points[index];
        if (!point || !Number.isFinite(point.value) || point.value <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(point.date)
            || !Number.isFinite(Date.parse(`${point.date}T00:00:00Z`))
            || new Date(`${point.date}T00:00:00Z`).toISOString().slice(0, 10) !== point.date
            || point.date > today || index > 0 && points[index - 1].date >= point.date) {
            throw new TypeError('Observaciones positivas, con fechas válidas, únicas, ordenadas y sin futuro.');
        }
    }
    return points;
}
function trainTemporalModel(points, { horizon = 1, now = Date.now() } = {}) {
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 20) throw new RangeError('Horizonte permitido: 1 a 20 observaciones.');
    trainingPoints(points, now);
    const required = 30 + 16 + 16 + 2 * (horizon - 1);
    if (points.length < required) return { eligible: false, observations: points.length, reason: `Se requieren ${required} observaciones para seleccionar y validar el modelo por separado.` };
    const values = points.map(point => point.value);
    const holdoutPoints = Math.min(24, Math.floor((points.length - 30 - 2 * (horizon - 1)) / 2));
    const split = points.length - holdoutPoints - horizon + 1;
    const tuningEnd = split - horizon + 1;
    const tuningStart = Math.max(30, tuningEnd - 72);
    const scores = GRID.map(config => {
        const errors = [];
        for (let origin = tuningStart; origin < tuningEnd; origin++) {
            const value = predict(values.slice(0, origin), config, horizon);
            if (!Number.isFinite(value) || value <= 0) return { config, mae: null, observations: errors.length };
            errors.push(Math.abs(values[origin + horizon - 1] - value));
        }
        return { config, mae: mean(errors), observations: errors.length };
    });
    const nonBaselineScores = scores.filter(row => Number.isFinite(row.mae) && row.config.targetMode !== 'baseline');
    const defaultPrior = nonBaselineScores.find(row => row.config.key === 'level_all_ridge0.35');
    const regPenalty = cfg => (cfg.key === 'level_all_ridge0.35' ? 0.965 : cfg.ridge === 0.05 ? 1.025 : cfg.window === 60 ? 1.015 : 1);
    const ranked = (nonBaselineScores.length ? nonBaselineScores : scores.filter(row => Number.isFinite(row.mae)))
        .sort((a, b) => (a.mae * regPenalty(a.config)) - (b.mae * regPenalty(b.config)));
    const selected = (defaultPrior && ranked[0] && ranked[0].mae >= defaultPrior.mae * 0.965) ? defaultPrior : ranked[0];
    const selection = { config: selected.config, tuningStart: points[tuningStart - 1].date,
        tuningEnd: points[split - 1].date, validationStart: points[split + horizon - 1].date,
        validationEnd: points.at(-1).date, candidates: scores, protocol: 'chronological_selection_then_unseen_walk_forward' };
    const validation = [];
    const oldConfig = { targetMode: 'level', ridge: .35, window: null };
    for (let origin = split; origin + horizon <= values.length; origin++) {
        const previous = values[origin - 1], actual = values[origin + horizon - 1];
        const value = predict(values.slice(0, origin), selected.config, horizon);
        const old = predict(values.slice(0, origin), oldConfig, horizon);
        if (!Number.isFinite(value) || value <= 0) return { eligible: false, observations: values.length, selection, reason: 'El modelo seleccionado produjo un pronóstico inestable en validación.' };
        validation.push({ cutoff: points[origin - 1].date, targetDate: points[origin + horizon - 1].date,
            actual, value, error: Math.abs(actual - value), baseline: Math.abs(actual - previous),
            previousModelError: Math.abs(actual - old),
            directionCorrect: Math.sign(value - previous) === Math.sign(actual - previous),
        });
    }
    const modelMae = mean(validation.map(row => row.error)), baselineMae = mean(validation.map(row => row.baseline));
    const previousModelMae = mean(validation.map(row => row.previousModelError));
    const improvement = baselineMae > 0 ? (baselineMae - modelMae) / baselineMae : 0;
    const sorted = validation.map(row => row.error).sort((a, b) => a - b);
    const errorRange = sorted[Math.ceil(sorted.length * .9) - 1];
    const eligible = selected.config.targetMode !== 'baseline' && improvement >= MIN_IMPROVEMENT
        && modelMae <= previousModelMae;
    const model = fit(values, selected.config, horizon), value = predict(values, selected.config, horizon);
    const stable = Number.isFinite(value) && value > 0;
    return {
        eligible: eligible && stable, observations: values.length,
        reason: eligible && stable ? null : 'No supera al último valor y al modelo anterior en el tramo de validación separado.',
        selection,
        evaluation: { horizon, evaluationPoints: validation.length, modelMae, baselineMae, previousModelMae,
            improvement, errorRange, rmse: Math.sqrt(mean(validation.map(row => row.error ** 2))),
            baselineWins: validation.filter(row => row.error < row.baseline).length,
            directionAccuracy: mean(validation.map(row => Number(row.directionCorrect))), eligible: eligible && stable },
        validation, model,
        forecast: stable ? { horizon, value, lowerBound: Math.max(0, value - errorRange), upperBound: value + errorRange,
            changePct: (value - values.at(-1)) / values.at(-1) * 100, probabilityUp: null,
            rangeMethod: 'unseen_walk_forward_absolute_errors',
            confidenceScore: Math.round((35 + Math.min(1, Math.max(0, improvement / .2)) * 35 + Math.min(1, validation.length / 24) * 30) * 100) / 100,
        } : null,
    };
}
module.exports = { VERSION, GRID, trainingPoints, trainTemporalModel };