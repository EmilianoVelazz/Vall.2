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
    return (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
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

function fitAutoregressive(values) {
    const series = finiteSeries(values);
    if (series.length < LAGS + 8) return null;
    const rawRows = [];
    const targets = [];
    for (let index = LAGS; index < series.length; index++) {
        rawRows.push(featureRow(series, index));
        targets.push(series[index]);
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
    for (let index = 1; index < dimensions; index++) gram[index][index] += RIDGE;
    const coefficients = solveLinearSystem(gram, cross);
    if (!coefficients) return null;
    const predict = input => {
        const row = [1, ...input.map((value, column) => (value - featureMeans[column]) / featureScales[column])];
        return row.reduce((sum, value, index) => sum + value * coefficients[index], 0);
    };
    const residuals = rawRows.map((row, index) => targets[index] - predict(row));
    return {
        algorithm: 'ridge_autoregression_lag3', lags: LAGS, ridge: RIDGE,
        coefficients, featureMeans, featureScales,
        residualStdDev: stdDev(residuals), trainingMae: mean(residuals.map(value => Math.abs(value))),
        predictNext() { return predict(featureRow(series, series.length)); },
    };
}

function walkForwardEvaluation(values, { minTrainingPoints = MIN_TRAINING_POINTS } = {}) {
    const series = finiteSeries(values);
    if (series.length < minTrainingPoints + MIN_EVALUATION_POINTS) return null;
    const startsAt = Math.max(minTrainingPoints, series.length - 24);
    const modelErrors = [];
    const baselineErrors = [];
    for (let index = startsAt; index < series.length; index++) {
        const model = fitAutoregressive(series.slice(0, index));
        if (!model) continue;
        const actual = series[index];
        modelErrors.push(Math.abs(actual - model.predictNext()));
        baselineErrors.push(Math.abs(actual - series[index - 1]));
    }
    if (modelErrors.length < MIN_EVALUATION_POINTS) return null;
    const modelMae = mean(modelErrors);
    const baselineMae = mean(baselineErrors);
    const improvement = baselineMae > 0 ? (baselineMae - modelMae) / baselineMae : 0;
    return {
        evaluationPoints: modelErrors.length,
        modelMae, baselineMae, improvement,
        eligible: Number.isFinite(improvement) && improvement >= MIN_IMPROVEMENT,
    };
}

function trainAndAssess(values) {
    const series = finiteSeries(values);
    const evaluation = walkForwardEvaluation(series);
    const model = fitAutoregressive(series);
    if (!evaluation || !model) return {
        eligible: false,
        reason: `Se requieren al menos ${MIN_TRAINING_POINTS + MIN_EVALUATION_POINTS} observaciones numéricas ordenadas para validar el modelo.`,
        observations: series.length,
    };
    if (!evaluation.eligible) return {
        eligible: false, reason: 'El modelo no superó al baseline de último valor en validación temporal.',
        observations: series.length, evaluation,
    };
    const forecast = model.predictNext();
    const interval = 1.96 * model.residualStdDev;
    const lastValue = series.at(-1);
    const relativeImprovement = Math.min(1, Math.max(0, evaluation.improvement / 0.2));
    const sampleStrength = Math.min(1, evaluation.evaluationPoints / 24);
    return {
        eligible: true, observations: series.length, evaluation, model,
        forecast: {
            value: forecast,
            lowerBound: forecast - interval,
            upperBound: forecast + interval,
            changePct: lastValue ? (forecast - lastValue) / lastValue * 100 : null,
            // No se publica una probabilidad direccional sin una calibración
            // independiente; el intervalo se estima con residuos históricos.
            probabilityUp: null,
            confidenceScore: Math.round((35 + relativeImprovement * 35 + sampleStrength * 30) * 100) / 100,
        },
    };
}

module.exports = {
    LAGS, MIN_TRAINING_POINTS, MIN_EVALUATION_POINTS, MIN_IMPROVEMENT,
    fitAutoregressive, walkForwardEvaluation, trainAndAssess,
};
