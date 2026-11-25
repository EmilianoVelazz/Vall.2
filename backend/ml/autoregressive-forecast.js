'use strict';

// Pronosticador numérico pequeño y auditable. No usa datos futuros: cada
// evaluación ajusta el modelo exclusivamente con observaciones anteriores al
// punto que intenta predecir.
const LAGS = 3;
const MIN_TRAINING_POINTS = 30;
const MIN_EVALUATION_POINTS = 8;
const MIN_IMPROVEMENT = 0.02;
const RIDGE = 0.35;

function finiteSeries(values) {
    return (Array.isArray(values) ? values : [])
        .filter(value => value !== null && value !== undefined && value !== '' && typeof value !== 'boolean')
        .map(Number).filter(Number.isFinite);
}

function checkedHorizon(horizon) {
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 20) throw new RangeError('Horizonte permitido: entre 1 y 20 observaciones.');
    return horizon;
}

function mean(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values, average = mean(values)) {
    if (values.length < 2) return 0;
    return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

function featureRow(values, index) {
    const latest = values[index - 1];
    const lag2 = values[index - 2];
    const lag3 = values[index - 3];
    return [latest, lag2, lag3, (latest + lag2 + lag3) / LAGS, latest - lag2];
}

function solveLinearSystem(matrix, vector) {
    const size = vector.length;
    const augmented = matrix.map((row, index) => [...row, vector[index]]);
    for (let pivot = 0; pivot < size; pivot++) {
        let best = pivot;
        for (let row = pivot + 1; row < size; row++) {
            if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row;
        }
        if (Math.abs(augmented[best][pivot]) < 1e-12) return null;
        [augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]];
        const divisor = augmented[pivot][pivot];
        for (let column = pivot; column <= size; column++) augmented[pivot][column] /= divisor;
        for (let row = 0; row < size; row++) {
            if (row === pivot) continue;
            const factor = augmented[row][pivot];
            for (let column = pivot; column <= size; column++) augmented[row][column] -= factor * augmented[pivot][column];
        }
    }
    return augmented.map(row => row[size]);
}

function fitAutoregressive(values, { targetMode = 'level', ridge = RIDGE, decay = 1 } = {}) {
    if (!['level', 'change'].includes(targetMode) || !Number.isFinite(ridge) || ridge <= 0 || !Number.isFinite(decay) || decay <= 0 || decay > 1) {
        throw new TypeError('Configuración autorregresiva inválida.');
    }
    const series = finiteSeries(values);
    if (series.length < LAGS + 8) return null;
    const rawRows = [];
    const targets = [];
    for (let index = LAGS; index < series.length; index++) {
        rawRows.push(featureRow(series, index));
        targets.push(targetMode === 'change' ? series[index] - series[index - 1] : series[index]);
    }
    const featureMeans = rawRows[0].map((_, column) => mean(rawRows.map(row => row[column])));
    const featureScales = rawRows[0].map((_, column) => {
        const scale = stdDev(rawRows.map(row => row[column]), featureMeans[column]);
        return scale > 1e-9 ? scale : 1;
    });
    const rows = rawRows.map(row => [1, ...row.map((value, column) => (value - featureMeans[column]) / featureScales[column])]);
    const dimensions = rows[0].length;
    const gram = Array.from({ length: dimensions }, () => Array(dimensions).fill(0));
    const cross = Array(dimensions).fill(0);
    for (let row = 0; row < rows.length; row++) {
        const w = decay < 1 ? Math.pow(decay, rows.length - 1 - row) : 1;
        for (let left = 0; left < dimensions; left++) {
            cross[left] += w * rows[row][left] * targets[row];
            for (let right = 0; right < dimensions; right++) gram[left][right] += w * rows[row][left] * rows[row][right];
        }
    }
    for (let index = 1; index < dimensions; index++) gram[index][index] += ridge;
    const coefficients = solveLinearSystem(gram, cross);
    if (!coefficients) return null;
    const predict = input => {
        const row = [1, ...input.map((value, column) => (value - featureMeans[column]) / featureScales[column])];
        const estimated = row.reduce((sum, value, index) => sum + value * coefficients[index], 0);
        return targetMode === 'change' ? input[0] + estimated : estimated;
    };
    const residuals = rawRows.map((row, index) => series[index + LAGS] - predict(row));
    return {
        algorithm: decay < 1 && targetMode === 'change' ? 'weighted_ridge_change_lag3' : targetMode === 'change' ? 'ridge_change_autoregression_lag3' : 'ridge_autoregression_lag3',
        targetMode, lags: LAGS, ridge, decay,
        coefficients, featureMeans, featureScales,
        residualStdDev: stdDev(residuals), trainingMae: mean(residuals.map(value => Math.abs(value))),
        predictNext() { return predict(featureRow(series, series.length)); },
        predictSteps(horizon = 1) {
            checkedHorizon(horizon);
            const projected = series.slice();
            for (let step = 0; step < horizon; step++) projected.push(predict(featureRow(projected, projected.length)));
            return projected.at(-1);
        },
    };
}

// Suavizamiento exponencial Holt con tendencia amortiguada (ajuste estrictamente causal)
function fitDampedHolt(values, { horizon = 1 } = {}) {
    checkedHorizon(horizon);
    const series = finiteSeries(values);
    if (series.length < 24) return null;
    let bestParams = null;
    let bestMse = Infinity;
    const fitWindow = series.slice(-90);
    for (const alpha of [0.18, 0.38]) {
        for (const beta of [0.05, 0.16]) {
            for (const phi of [0.58, 0.84]) {
                let level = fitWindow[0];
                let trend = (fitWindow[Math.min(4, fitWindow.length - 1)] - fitWindow[0]) / Math.max(1, Math.min(4, fitWindow.length - 1));
                const levels = [level];
                const trends = [trend];
                for (let t = 1; t < fitWindow.length; t++) {
                    const nextLevel = alpha * fitWindow[t] + (1 - alpha) * (level + phi * trend);
                    const nextTrend = beta * (nextLevel - level) + (1 - beta) * phi * trend;
                    level = nextLevel;
                    trend = nextTrend;
                    levels.push(level);
                    trends.push(trend);
                }
                let sse = 0;
                let count = 0;
                const phiFactor = phi === 1 ? horizon : (phi * (1 - Math.pow(phi, horizon))) / (1 - phi);
                for (let t = 8; t + horizon < fitWindow.length; t++) {
                    const pred = levels[t] + trends[t] * phiFactor;
                    const err = fitWindow[t + horizon] - pred;
                    sse += err * err;
                    count++;
                }
                const mse = count > 0 ? sse / count : Infinity;
                if (mse < bestMse) {
                    bestMse = mse;
                    bestParams = { alpha, beta, phi, level, trend };
                }
            }
        }
    }
    if (!bestParams) return null;
    const { alpha, beta, phi } = bestParams;
    let level = series[0];
    let trend = (series[Math.min(4, series.length - 1)] - series[0]) / Math.max(1, Math.min(4, series.length - 1));
    const residuals = [];
    for (let t = 1; t < series.length; t++) {
        const pred1 = level + phi * trend;
        if (t >= 8) residuals.push(series[t] - pred1);
        const nextLevel = alpha * series[t] + (1 - alpha) * pred1;
        const nextTrend = beta * (nextLevel - level) + (1 - beta) * phi * trend;
        level = nextLevel;
        trend = nextTrend;
    }
    const predictSteps = (steps = horizon) => {
        checkedHorizon(steps);
        const factor = phi === 1 ? steps : (phi * (1 - Math.pow(phi, steps))) / (1 - phi);
        return Math.max(1e-9, level + trend * factor);
    };
    return {
        algorithm: 'damped_holt_smoothing',
        targetMode: 'holt',
        lags: 2,
        ridge: null,
        coefficients: [alpha, beta, phi],
        featureMeans: [level],
        featureScales: [trend],
        residualStdDev: stdDev(residuals.length >= 2 ? residuals : [0, 0]),
        trainingMae: residuals.length ? mean(residuals.map(Math.abs)) : 0,
        predictNext() { return predictSteps(1); },
        predictSteps,
    };
}

// Reversión a la media y momentum en espacio logarítmico (Ornstein-Uhlenbeck discreto + Ridge)
function fitLogReturnReversion(values, { ridge = 1.0, horizon = 1, direct = false } = {}) {
    if (!Number.isFinite(ridge) || ridge <= 0) throw new TypeError('Ridge inválido.');
    const directHorizon = direct && horizon > 1 ? horizon : 1;
    if (direct && horizon > 1) checkedHorizon(horizon);
    const series = finiteSeries(values).filter(v => v > 0);
    if (series.length < 35 + directHorizon) return null;
    const logP = series.map(Math.log);
    const ema8 = [logP[0]];
    const ema24 = [logP[0]];
    const k8 = 2 / 9;
    const k24 = 2 / 25;
    for (let i = 1; i < logP.length; i++) {
        ema8.push(logP[i] * k8 + ema8[i - 1] * (1 - k8));
        ema24.push(logP[i] * k24 + ema24[i - 1] * (1 - k24));
    }
    const featureAt = (buf, tIdx, e8, e24) => {
        const r1 = buf[tIdx - 1] - buf[tIdx - 2];
        const r2 = buf[tIdx - 2] - buf[tIdx - 3];
        const spread8 = buf[tIdx - 1] - e8;
        const spread24 = buf[tIdx - 1] - e24;
        const recentRets = [];
        for (let j = Math.max(1, tIdx - 6); j < tIdx; j++) recentRets.push(buf[j] - buf[j - 1]);
        const vol = stdDev(recentRets.length >= 2 ? recentRets : [0, 0]);
        return [r1, r2, spread8, spread24, vol];
    };
    const rawRows = [];
    const targets = [];
    for (let t = 8; t + directHorizon - 1 < logP.length; t++) {
        rawRows.push(featureAt(logP, t, ema8[t - 1], ema24[t - 1]));
        targets.push(logP[t + directHorizon - 1] - logP[t - 1]);
    }
    if (rawRows.length < 20) return null;
    const featureMeans = rawRows[0].map((_, col) => mean(rawRows.map(row => row[col])));
    const featureScales = rawRows[0].map((_, col) => {
        const s = stdDev(rawRows.map(row => row[col]), featureMeans[col]);
        return s > 1e-9 ? s : 1;
    });
    const rows = rawRows.map(row => [1, ...row.map((val, col) => (val - featureMeans[col]) / featureScales[col])]);
    const dims = rows[0].length;
    const gram = Array.from({ length: dims }, () => Array(dims).fill(0));
    const cross = Array(dims).fill(0);
    for (let r = 0; r < rows.length; r++) {
        const w = Math.pow(0.992, rows.length - 1 - r);
        for (let i = 0; i < dims; i++) {
            cross[i] += w * rows[r][i] * targets[r];
            for (let j = 0; j < dims; j++) gram[i][j] += w * rows[r][i] * rows[r][j];
        }
    }
    for (let i = 1; i < dims; i++) gram[i][i] += ridge;
    const coefficients = solveLinearSystem(gram, cross);
    if (!coefficients) return null;
    const maxStepCap = 0.18 * Math.sqrt(directHorizon);
    const predictLogRet = feat => {
        const row = [1, ...feat.map((val, col) => (val - featureMeans[col]) / featureScales[col])];
        const ret = row.reduce((sum, val, idx) => sum + val * coefficients[idx], 0);
        return Math.max(-maxStepCap, Math.min(maxStepCap, ret));
    };
    const residuals = rawRows.map((row, idx) => Math.exp(logP[idx + 7] + targets[idx]) - Math.exp(logP[idx + 7] + predictLogRet(row)));
    return {
        algorithm: directHorizon > 1 ? `log_ou_direct_h${directHorizon}_ridge` : 'log_ou_mean_reversion_ridge',
        targetMode: directHorizon > 1 ? 'log_ou_direct' : 'log_ou',
        lags: 2,
        ridge,
        coefficients,
        featureMeans,
        featureScales,
        residualStdDev: stdDev(residuals),
        trainingMae: mean(residuals.map(Math.abs)),
        predictNext() { return this.predictSteps(directHorizon); },
        predictSteps(steps = 1) {
            checkedHorizon(steps);
            if (directHorizon > 1 && steps === directHorizon) {
                const feat = featureAt(logP, logP.length, ema8.at(-1), ema24.at(-1));
                return Math.exp(logP.at(-1) + predictLogRet(feat));
            }
            const projLog = logP.slice();
            let curEma8 = ema8.at(-1);
            let curEma24 = ema24.at(-1);
            for (let step = 0; step < steps; step++) {
                const feat = featureAt(projLog, projLog.length, curEma8, curEma24);
                const nextRet = predictLogRet(feat) / directHorizon;
                const nextL = projLog[projLog.length - 1] + nextRet;
                projLog.push(nextL);
                curEma8 = nextL * k8 + curEma8 * (1 - k8);
                curEma24 = nextL * k24 + curEma24 * (1 - k24);
            }
            return Math.exp(projLog.at(-1));
        },
    };
}

// Regresión autorregresiva directa multi-horizonte con encogimiento (James-Stein / Empirical Bayes)
// hacia el último valor observado y reversión EMA multiescala (estrictamente causal).
function fitDirectShrinkageAR(values, { horizon = 1, ridge = 1.5, shrinkage = 0.55, decay = 0.99 } = {}) {
    checkedHorizon(horizon);
    if (!Number.isFinite(ridge) || ridge <= 0 || !Number.isFinite(shrinkage) || shrinkage <= 0 || shrinkage > 1) {
        throw new TypeError('Configuración direct_shrink inválida.');
    }
    const series = finiteSeries(values);
    if (series.length < Math.max(32, 16 + horizon)) return null;

    const emaSpan = (arr, span) => {
        const k = 2 / (span + 1);
        const out = [arr[0]];
        for (let i = 1; i < arr.length; i++) out.push(arr[i] * k + out[i - 1] * (1 - k));
        return out;
    };
    const ema6 = emaSpan(series, 6);
    const ema18 = emaSpan(series, 18);
    const oldModel = fitAutoregressive(series, { targetMode: 'level', ridge: 0.35 });

    const featAt = idx => {
        const last = series[idx - 1];
        const d1 = last - series[idx - 2];
        const d3 = (last - series[Math.max(0, idx - 4)]) / 3;
        const rev6 = ema6[idx - 1] - last;
        const rev18 = ema18[idx - 1] - last;
        return [d1, d3, rev6, rev18];
    };

    const rawRows = [];
    const targets = [];
    const startIdx = 6;
    for (let t = startIdx; t + horizon - 1 < series.length; t++) {
        rawRows.push(featAt(t));
        targets.push(series[t + horizon - 1] - series[t - 1]);
    }
    if (rawRows.length < 14) return null;

    const featureMeans = rawRows[0].map((_, col) => mean(rawRows.map(row => row[col])));
    const featureScales = rawRows[0].map((_, col) => {
        const s = stdDev(rawRows.map(row => row[col]), featureMeans[col]);
        return s > 1e-9 ? s : 1;
    });
    const rows = rawRows.map(row => [1, ...row.map((val, col) => (val - featureMeans[col]) / featureScales[col])]);
    const dims = rows[0].length;
    const gram = Array.from({ length: dims }, () => Array(dims).fill(0));
    const cross = Array(dims).fill(0);
    for (let r = 0; r < rows.length; r++) {
        const w = decay < 1 ? Math.pow(decay, rows.length - 1 - r) : 1;
        for (let i = 0; i < dims; i++) {
            cross[i] += w * rows[r][i] * targets[r];
            for (let j = 0; j < dims; j++) gram[i][j] += w * rows[r][i] * rows[r][j];
        }
    }
    for (let i = 1; i < dims; i++) gram[i][i] += ridge;
    const coefficients = solveLinearSystem(gram, cross);
    if (!coefficients) return null;

    const absTargets = targets.map(Math.abs).sort((a, b) => a - b);
    const cap = (absTargets[Math.ceil(absTargets.length * 0.92) - 1] || Math.abs(series.at(-1)) * 0.15) * 1.15;

    const predictDelta = feat => {
        const row = [1, ...feat.map((val, col) => (val - featureMeans[col]) / featureScales[col])];
        const rawDelta = row.reduce((sum, val, idx) => sum + val * coefficients[idx], 0);
        const shrunk = rawDelta * shrinkage;
        return Math.max(-cap, Math.min(cap, shrunk));
    };

    const residuals = rawRows.map((row, idx) => targets[idx] - predictDelta(row));
    return {
        algorithm: `direct_shrinkage_ar_h${horizon}`,
        targetMode: 'direct_shrink',
        lags: 4,
        ridge,
        coefficients,
        featureMeans,
        featureScales,
        residualStdDev: stdDev(residuals),
        trainingMae: mean(residuals.map(Math.abs)),
        predictNext() { return this.predictSteps(horizon); },
        predictSteps(steps = horizon) {
            checkedHorizon(steps);
            const last = series.at(-1);
            const delta = predictDelta(featAt(series.length)) * (steps / horizon);
            const directPred = Math.max(1e-9, last + delta);
            if (oldModel) {
                const oldPred = oldModel.predictSteps(steps);
                if (Number.isFinite(oldPred) && oldPred > 0) {
                    return 0.5 * directPred + 0.5 * oldPred;
                }
            }
            return directPred;
        },
    };
}

function walkForwardEvaluation(values, { minTrainingPoints = MIN_TRAINING_POINTS, horizon = 1 } = {}) {
    checkedHorizon(horizon);
    const series = finiteSeries(values);
    if (series.length < minTrainingPoints + MIN_EVALUATION_POINTS + horizon - 1) return null;
    const endsAt = series.length - horizon + 1;
    const startsAt = Math.max(minTrainingPoints, endsAt - 24);
    const modelErrors = [];
    const baselineErrors = [];
    for (let index = startsAt; index < endsAt; index++) {
        const model = fitAutoregressive(series.slice(0, index));
        if (!model) continue;
        const actual = series[index + horizon - 1];
        modelErrors.push(Math.abs(actual - model.predictSteps(horizon)));
        baselineErrors.push(Math.abs(actual - series[index - 1]));
    }
    if (modelErrors.length < MIN_EVALUATION_POINTS) return null;
    const modelMae = mean(modelErrors);
    const baselineMae = mean(baselineErrors);
    const improvement = baselineMae > 0 ? (baselineMae - modelMae) / baselineMae : 0;
    return {
        horizon,
        evaluationPoints: modelErrors.length,
        modelMae, baselineMae, improvement,
        // Rango descriptivo de errores fuera de muestra para el mismo horizonte.
        // No equivale a una probabilidad calibrada ni garantiza cobertura futura.
        errorRange: [...modelErrors].sort((a, b) => a - b)[Math.ceil(modelErrors.length * .9) - 1],
        rmse: Math.sqrt(mean(modelErrors.map(error => error * error))),
        eligible: Number.isFinite(improvement) && improvement >= MIN_IMPROVEMENT,
    };
}

function trainAndAssess(values, { horizon = 1 } = {}) {
    checkedHorizon(horizon);
    const series = finiteSeries(values);
    const evaluation = walkForwardEvaluation(series, { horizon });
    const model = fitAutoregressive(series);
    if (!evaluation || !model) return {
        eligible: false,
        reason: `Se requieren al menos ${MIN_TRAINING_POINTS + MIN_EVALUATION_POINTS + horizon - 1} observaciones numéricas ordenadas para validar el modelo a este horizonte.`,
        observations: series.length,
    };
    if (!evaluation.eligible) return {
        eligible: false, reason: 'El modelo no superó al baseline de último valor en validación temporal.',
        observations: series.length, evaluation,
    };
    const forecast = model.predictSteps(horizon);
    const interval = evaluation.errorRange;
    const lastValue = series.at(-1);
    const relativeImprovement = Math.min(1, Math.max(0, evaluation.improvement / 0.2));
    const sampleStrength = Math.min(1, evaluation.evaluationPoints / 24);
    return {
        eligible: true, observations: series.length, evaluation, model,
        forecast: {
            horizon,
            value: forecast,
            lowerBound: forecast - interval,
            upperBound: forecast + interval,
            changePct: lastValue ? (forecast - lastValue) / lastValue * 100 : null,
            // No se publica una probabilidad direccional sin una calibración
            // independiente; el rango describe errores fuera de muestra.
            probabilityUp: null,
            rangeMethod: 'out_of_sample_absolute_errors',
            confidenceScore: Math.round((35 + relativeImprovement * 35 + sampleStrength * 30) * 100) / 100,
        },
    };
}

module.exports = {
    LAGS, MIN_TRAINING_POINTS, MIN_EVALUATION_POINTS, MIN_IMPROVEMENT,
    fitAutoregressive, fitDampedHolt, fitLogReturnReversion, fitDirectShrinkageAR, walkForwardEvaluation, trainAndAssess,
};
