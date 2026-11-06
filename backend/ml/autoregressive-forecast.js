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

function fitAutoregressive(values, { targetMode = 'level', ridge = RIDGE } = {}) {
    if (!['level', 'change'].includes(targetMode) || !Number.isFinite(ridge) || ridge <= 0) throw new TypeError('Configuración autorregresiva inválida.');
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
        for (let left = 0; left < dimensions; left++) {
            cross[left] += rows[row][left] * targets[row];
            for (let right = 0; right < dimensions; right++) gram[left][right] += rows[row][left] * rows[row][right];
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
        algorithm: targetMode === 'change' ? 'ridge_change_autoregression_lag3' : 'ridge_autoregression_lag3', targetMode, lags: LAGS, ridge,
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
    fitAutoregressive, walkForwardEvaluation, trainAndAssess,
};
