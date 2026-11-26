'use strict';

// Motor cuantitativo multivariable sin fuga futura (cero lookahead bias):
// - Alineación estricta exog.date <= target.date
// - Regresión Ridge-ARX regularizada con rasgos cíclicos calendario
// - Conformal Prediction adaptativo por volatilidad rodante
// - Elasticidades cruzadas VAR(1) sobre retornos logarítmicos

const DAY_MS = 86_400_000;
const mean = values => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0);
const stdDev = (values, avg = mean(values)) => {
    if (values.length < 2) return 0;
    return Math.sqrt(values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1));
};
const round = (value, digits = 4) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);

function sanitizePoints(points, now = Date.now()) {
    const todayIso = new Date(now).toISOString().slice(0, 10);
    const byDate = new Map();
    for (const row of Array.isArray(points) ? points : []) {
        const date = String(row?.date || '').slice(0, 10);
        const value = Number(row?.value);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) continue;
        if (date > todayIso || !Number.isFinite(value) || value <= 0) continue;
        byDate.set(date, value);
    }
    return [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({ date, value }));
}

function solveLinearSystem(matrix, vector) {
    const size = vector.length;
    const aug = matrix.map((row, idx) => [...row, vector[idx]]);
    for (let pivot = 0; pivot < size; pivot++) {
        let best = pivot;
        for (let r = pivot + 1; r < size; r++) {
            if (Math.abs(aug[r][pivot]) > Math.abs(aug[best][pivot])) best = r;
        }
        if (Math.abs(aug[best][pivot]) < 1e-12) return null;
        [aug[pivot], aug[best]] = [aug[best], aug[pivot]];
        const div = aug[pivot][pivot];
        for (let c = pivot; c <= size; c++) aug[pivot][c] /= div;
        for (let r = 0; r < size; r++) {
            if (r === pivot) continue;
            const factor = aug[r][pivot];
            for (let c = pivot; c <= size; c++) aug[r][c] -= factor * aug[pivot][c];
        }
    }
    return aug.map(row => row[size]);
}

function alignMultivariateSeries(targetPoints, exogenousMap = {}, now = Date.now()) {
    const target = sanitizePoints(targetPoints, now);
    const entries = exogenousMap instanceof Map
        ? [...exogenousMap.entries()]
        : Object.entries(exogenousMap || {});
    const cleanExog = entries
        .map(([name, pts]) => [String(name), sanitizePoints(pts, now)])
        .filter(([, pts]) => pts.length >= 8);

    if (!target.length) return { target: [], exogNames: [], aligned: [] };
    const pointers = Object.fromEntries(cleanExog.map(([name]) => [name, -1]));
    const aligned = [];

    for (let i = 0; i < target.length; i++) {
        const pt = target[i];
        const exogAtDate = {};
        const prevExogAtDate = {};
        let complete = true;
        for (const [name, pts] of cleanExog) {
            while (pointers[name] + 1 < pts.length && pts[pointers[name] + 1].date <= pt.date) {
                pointers[name] += 1;
            }
            const idx = pointers[name];
            if (idx < 1) {
                complete = false;
                break;
            }
            exogAtDate[name] = pts[idx].value;
            prevExogAtDate[name] = pts[idx - 1].value;
        }
        if (!complete && cleanExog.length) continue;
        const month = Number(pt.date.slice(5, 7)) || 1;
        const angle = (2 * Math.PI * (month - 1)) / 12;
        aligned.push({
            date: pt.date,
            value: pt.value,
            exog: exogAtDate,
            prevExog: prevExogAtDate,
            sinMonth: Math.sin(angle),
            cosMonth: Math.cos(angle),
        });
    }

    return {
        target,
        exogNames: cleanExog.map(([name]) => name),
        aligned,
    };
}

function fitRidgeARX(rows, targets, { ridge = 0.8, decay = 0.985, featureNames = null } = {}) {
    if (!Array.isArray(rows) || !rows.length || rows.length !== targets.length) return null;
    const cols = rows[0]?.length || 0;
    if (!cols) return null;

    const means = Array.from({ length: cols }, (_, c) => mean(rows.map(r => r[c])));
    const scales = Array.from({ length: cols }, (_, c) => {
        const s = stdDev(rows.map(r => r[c]), means[c]);
        return s > 1e-9 ? s : 1;
    });

    const n = rows.length;
    const dims = cols + 1;
    const gram = Array.from({ length: dims }, () => Array(dims).fill(0));
    const cross = Array(dims).fill(0);

    for (let i = 0; i < n; i++) {
        const weight = Math.pow(decay, n - 1 - i);
        const x = [1, ...rows[i].map((v, c) => (v - means[c]) / scales[c])];
        const y = targets[i];
        for (let a = 0; a < dims; a++) {
            cross[a] += weight * x[a] * y;
            for (let b = 0; b < dims; b++) {
                gram[a][b] += weight * x[a] * x[b];
            }
        }
    }
    for (let d = 1; d < dims; d++) gram[d][d] += ridge;
    gram[0][0] += 1e-8;

    const weights = solveLinearSystem(gram, cross);
    if (!weights || weights.some(w => !Number.isFinite(w))) return null;

    const absSum = weights.slice(1).reduce((s, w) => s + Math.abs(w), 0) || 1;
    const names = Array.isArray(featureNames) && featureNames.length === cols
        ? featureNames
        : Array.from({ length: cols }, (_, c) => `f_${c + 1}`);

    const featureImportances = weights.slice(1).map((w, idx) => ({
        feature: names[idx],
        standardizedWeight: round(w, 4),
        importancePct: round((Math.abs(w) / absSum) * 100, 1),
        direction: w >= 0 ? 'positive' : 'negative',
    })).sort((a, b) => Math.abs(b.standardizedWeight) - Math.abs(a.standardizedWeight));

    return {
        weights,
        featureImportances,
        predict(vector) {
            if (!Array.isArray(vector) || vector.length !== cols) return null;
            let out = weights[0];
            for (let c = 0; c < cols; c++) {
                out += weights[c + 1] * ((vector[c] - means[c]) / scales[c]);
            }
            return Number.isFinite(out) ? out : null;
        },
    };
}

function computeConformalInterval(residuals, { alpha = 0.1, scales = null, currentScale = 1 } = {}) {
    const cleanRes = (Array.isArray(residuals) ? residuals : [])
        .map((v, i) => ({ err: Math.abs(Number(v)), sc: Math.max(1e-6, Number(scales?.[i] ?? 1) || 1) }))
        .filter(item => Number.isFinite(item.err));

    const targetCoverage = Number((1 - alpha).toFixed(2));
    if (cleanRes.length < 4) {
        return {
            radius: null,
            alpha,
            targetCoverage,
            empiricalCoverage: null,
            sampleCount: cleanRes.length,
            method: 'adaptive_conformal_v1',
        };
    }

    const n = cleanRes.length;
    const normalized = cleanRes.map(item => item.err / item.sc).sort((a, b) => a - b);
    const rankIndex = Math.min(n - 1, Math.max(0, Math.ceil((n + 1) * (1 - alpha)) - 1));
    const quantileScore = normalized[rankIndex];
    const safeScale = Math.max(1e-6, Number(currentScale) || 1);
    const radius = Math.max(0, quantileScore * safeScale);

    const covered = cleanRes.filter(item => item.err <= quantileScore * item.sc + 1e-12).length;
    return {
        radius: round(radius, 4),
        alpha,
        targetCoverage,
        empiricalCoverage: round(covered / n, 4),
        sampleCount: n,
        method: 'adaptive_conformal_v1',
    };
}

function buildDesignMatrix(aligned, exogNames, horizon = 1) {
    const samples = [];
    const lags = 3;
    const maxIdx = aligned.length - horizon;
    for (let t = lags; t < maxIdx; t++) {
        const current = aligned[t];
        const prev1 = aligned[t - 1];
        const prev2 = aligned[t - 2];
        const target = aligned[t + horizon];
        const retRecent = [];
        for (let k = Math.max(1, t - 10); k <= t; k++) {
            if (aligned[k - 1].value > 0) {
                retRecent.push(Math.abs(aligned[k].value - aligned[k - 1].value));
            }
        }
        const scale = Math.max(mean(retRecent), current.value * 0.004, 1e-6);

        const uniFeatures = [
            current.value,
            prev1.value,
            prev2.value,
            current.value - prev1.value,
            (current.value + prev1.value + prev2.value) / 3,
        ];
        const exogFeatures = [];
        for (const name of exogNames) {
            const xCurr = current.exog[name];
            const xPrev = prev1.exog?.[name] ?? current.prevExog[name] ?? xCurr;
            exogFeatures.push(xCurr, xCurr - xPrev);
        }
        const multiFeatures = [...uniFeatures, ...exogFeatures, current.sinMonth, current.cosMonth];

        samples.push({
            originIndex: t,
            cutoffDate: current.date,
            targetDate: target.date,
            currentValue: current.value,
            actualValue: target.value,
            scale,
            uniFeatures,
            multiFeatures,
        });
    }
    return samples;
}

function assessMultivariateForecast(targetPoints, exogenousMap = {}, { horizon = 1, now = Date.now(), labelMap = {} } = {}) {
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 20) {
        throw new RangeError('Horizonte permitido para Ridge-ARX: entre 1 y 20 pasos.');
    }
    const { target, exogNames, aligned } = alignMultivariateSeries(targetPoints, exogenousMap, now);
    if (!exogNames.length) {
        return { eligible: false, reason: 'Se requiere al menos una serie exógena alineada.', observations: target.length };
    }
    const samples = buildDesignMatrix(aligned, exogNames, horizon);
    const minSamples = 32;
    if (samples.length < minSamples) {
        return {
            eligible: false,
            reason: `Se requieren al menos ${minSamples} ventanas alineadas (disponibles: ${samples.length}).`,
            observations: aligned.length,
            exogenousUsed: exogNames,
        };
    }

    const multiNames = [
        'Nivel t', 'Rezago t-1', 'Rezago t-2', 'Cambio reciente', 'Media móvil 3',
        ...exogNames.flatMap(name => [`${labelMap[name] || name} (nivel)`, `${labelMap[name] || name} (cambio)`]),
        'Estacionalidad sin', 'Estacionalidad cos',
    ];

    const startEval = Math.max(20, samples.length - Math.max(24, horizon * 12));
    const multiEval = [];
    const uniEval = [];
    const residualsPast = [];
    const scalesPast = [];
    let c80Hits = 0;
    let c90Hits = 0;
    let conformalSamples = 0;

    for (let idx = startEval; idx < samples.length; idx += horizon) {
        // Estrictamente muestras cuyo targetDate ya es observable antes o igual a cutoffDate actual.
        const cutoffMs = Date.parse(samples[idx].cutoffDate);
        const trainRows = [];
        for (let k = 0; k < idx; k++) {
            const kTargetMs = Date.parse(samples[k].targetDate);
            if (Number.isFinite(kTargetMs) && Number.isFinite(cutoffMs) && kTargetMs <= cutoffMs) {
                trainRows.push(samples[k]);
            }
        }
        if (trainRows.length < 18) continue;

        const multiFit = fitRidgeARX(
            trainRows.map(r => r.multiFeatures),
            trainRows.map(r => r.actualValue - r.currentValue),
            { ridge: 1.4, decay: 0.985, featureNames: multiNames }
        );
        const uniFit = fitRidgeARX(
            trainRows.map(r => r.uniFeatures),
            trainRows.map(r => r.actualValue - r.currentValue),
            { ridge: 0.9, decay: 0.985 }
        );
        if (!multiFit || !uniFit) continue;

        const predMulti = Math.max(1e-6, samples[idx].currentValue + (multiFit.predict(samples[idx].multiFeatures) ?? 0));
        const predUni = Math.max(1e-6, samples[idx].currentValue + (uniFit.predict(samples[idx].uniFeatures) ?? 0));
        const actual = samples[idx].actualValue;
        const base = samples[idx].currentValue;
        const multiErr = Math.abs(actual - predMulti);
        const uniErr = Math.abs(actual - predUni);
        const naiveErr = Math.abs(actual - base);

        const matured = multiEval.map((row, index) => ({row, index}))
            .filter(({row}) => Date.parse(row.targetDate) <= cutoffMs);
        const knownResiduals = matured.map(({index}) => residualsPast[index]);
        const knownScales = matured.map(({index}) => scalesPast[index]);
        if (knownResiduals.length >= 8) {
            const conf80 = computeConformalInterval(knownResiduals, { alpha: 0.2, scales: knownScales, currentScale: samples[idx].scale });
            const conf90 = computeConformalInterval(knownResiduals, { alpha: 0.1, scales: knownScales, currentScale: samples[idx].scale });
            if (conf80.radius != null && multiErr <= conf80.radius) c80Hits++;
            if (conf90.radius != null && multiErr <= conf90.radius) c90Hits++;
            conformalSamples++;
        }

        residualsPast.push(actual - predMulti);
        scalesPast.push(samples[idx].scale);

        multiEval.push({
            cutoff: samples[idx].cutoffDate,
            targetDate: samples[idx].targetDate,
            actual,
            predicted: predMulti,
            baseline: base,
            error: multiErr,
            naiveError: naiveErr,
            directionCorrect: Math.sign(predMulti - base) === Math.sign(actual - base),
            latestTrainingTarget: trainRows.at(-1).targetDate,
            latestCalibrationTarget: matured.at(-1)?.row.targetDate || null,
        });
        uniEval.push({ error: uniErr, naiveError: naiveErr });
    }

    if (multiEval.length < 8) {
        return { eligible: false, reason: 'Evaluación walk-forward multivariable insuficiente.', observations: aligned.length, exogenousUsed: exogNames };
    }

    const multiMae = mean(multiEval.map(e => e.error));
    const uniMae = mean(uniEval.map(e => e.error));
    const naiveMae = mean(multiEval.map(e => e.naiveError));
    const multiRmse = Math.sqrt(mean(multiEval.map(e => e.error ** 2)));
    const improvementVsNaive = naiveMae > 0 ? (naiveMae - multiMae) / naiveMae : 0;
    const improvementVsUni = uniMae > 0 ? (uniMae - multiMae) / uniMae : 0;
    const directionAccuracy = mean(multiEval.map(e => (e.directionCorrect ? 1 : 0)));

    // Reajuste final con todas las observaciones disponibles hasta el corte actual para emitir predicción futura
    const lastAligned = aligned.at(-1);
    const prevAligned = aligned.at(-2);
    const prev2Aligned = aligned.at(-3);
    const fullFit = fitRidgeARX(
        samples.map(r => r.multiFeatures),
        samples.map(r => r.actualValue - r.currentValue),
        { ridge: 1.4, decay: 0.985, featureNames: multiNames }
    );
    if (!fullFit || !lastAligned || !prevAligned || !prev2Aligned) {
        return { eligible: false, reason: 'No se pudo ajustar el modelo multivariable final.', observations: aligned.length };
    }

    const latestExogFeatures = [];
    for (const name of exogNames) {
        const xCurr = lastAligned.exog[name];
        const xPrev = prevAligned.exog?.[name] ?? lastAligned.prevExog[name] ?? xCurr;
        latestExogFeatures.push(xCurr, xCurr - xPrev);
    }
    const liveVector = [
        lastAligned.value,
        prevAligned.value,
        prev2Aligned.value,
        lastAligned.value - prevAligned.value,
        (lastAligned.value + prevAligned.value + prev2Aligned.value) / 3,
        ...latestExogFeatures,
        lastAligned.sinMonth,
        lastAligned.cosMonth,
    ];
    const predictedDelta = fullFit.predict(liveVector) ?? 0;
    const predictedValue = Math.max(1e-6, lastAligned.value + predictedDelta);
    const recentDiffs = aligned.slice(-10).map((p, idx, arr) => (idx ? Math.abs(p.value - arr[idx - 1].value) : 0)).slice(1);
    const liveScale = Math.max(mean(recentDiffs), lastAligned.value * 0.004, 1e-6);

    const conf80 = computeConformalInterval(residualsPast, { alpha: 0.2, scales: scalesPast, currentScale: liveScale });
    const conf90 = computeConformalInterval(residualsPast, { alpha: 0.1, scales: scalesPast, currentScale: liveScale });
    const radius90 = conf90.radius ?? multiMae * 1.65;
    const radius80 = conf80.radius ?? multiMae * 1.28;

    return {
        eligible: improvementVsNaive > 0.01,
        beatsUnivariate: improvementVsUni > 0,
        method: 'ridge_arx_multivariate_v1',
        horizon,
        observations: aligned.length,
        cutoff: lastAligned.date,
        lastValue: round(lastAligned.value, 4),
        exogenousUsed: exogNames,
        forecast: {
            value: round(predictedValue, 4),
            changePct: round(((predictedValue - lastAligned.value) / lastAligned.value) * 100, 2),
            lowerBound: round(Math.max(0, predictedValue - radius90), 4),
            upperBound: round(predictedValue + radius90, 4),
            conformal80: {
                lowerBound: round(Math.max(0, predictedValue - radius80), 4),
                upperBound: round(predictedValue + radius80, 4),
                empiricalCoveragePct: conformalSamples ? round((c80Hits / conformalSamples) * 100, 1) : round((conf80.empiricalCoverage || 0) * 100, 1),
                targetCoveragePct: 80,
            },
            conformal90: {
                lowerBound: round(Math.max(0, predictedValue - radius90), 4),
                upperBound: round(predictedValue + radius90, 4),
                empiricalCoveragePct: conformalSamples ? round((c90Hits / conformalSamples) * 100, 1) : round((conf90.empiricalCoverage || 0) * 100, 1),
                targetCoveragePct: 90,
            },
        },
        evaluation: {
            protocol: 'purged_prequential_v1',
            nonOverlappingWindows: true,
            temporalWindows: multiEval.map(row => ({cutoff: row.cutoff, targetDate: row.targetDate,
                latestTrainingTarget: row.latestTrainingTarget, latestCalibrationTarget: row.latestCalibrationTarget})),
            evaluationPoints: multiEval.length,
            multivariateMae: round(multiMae, 4),
            univariateMae: round(uniMae, 4),
            baselineMae: round(naiveMae, 4),
            rmse: round(multiRmse, 4),
            improvementVsBaselinePct: round(improvementVsNaive * 100, 2),
            improvementVsUnivariatePct: round(improvementVsUni * 100, 2),
            directionAccuracyPct: round(directionAccuracy * 100, 1),
            conformal80CoveragePct: conformalSamples ? round((c80Hits / conformalSamples) * 100, 1) : null,
            conformal90CoveragePct: conformalSamples ? round((c90Hits / conformalSamples) * 100, 1) : null,
        },
        topDrivers: fullFit.featureImportances.slice(0, 6),
    };
}

function estimateCrossAssetElasticities(seriesMap, { minOverlap = 28 } = {}) {
    const entries = seriesMap instanceof Map
        ? [...seriesMap.entries()]
        : Object.entries(seriesMap || {});
    const clean = entries
        .map(([sym, pts]) => [String(sym), sanitizePoints(pts)])
        .filter(([, pts]) => pts.length >= minOverlap);
    if (clean.length < 2) return [];

    const results = [];
    for (const [targetSym, targetPts] of clean) {
        const otherMap = Object.fromEntries(clean.filter(([sym]) => sym !== targetSym));
        const { exogNames, aligned } = alignMultivariateSeries(targetPts, otherMap);
        if (!exogNames.length || aligned.length < minOverlap) continue;

        const retRows = [];
        const yReturns = [];
        for (let i = 1; i < aligned.length - 1; i++) {
            const prev = aligned[i - 1];
            const curr = aligned[i];
            const next = aligned[i + 1];
            const selfRet = (curr.value - prev.value) / prev.value;
            const targetNextRet = (next.value - curr.value) / curr.value;
            if (!Number.isFinite(selfRet) || !Number.isFinite(targetNextRet)) continue;
            const row = [selfRet];
            let valid = true;
            for (const ex of exogNames) {
                const xCurr = curr.exog[ex];
                const xPrev = prev.exog[ex];
                const xRet = xPrev > 0 ? (xCurr - xPrev) / xPrev : null;
                if (!Number.isFinite(xRet)) { valid = false; break; }
                row.push(xRet);
            }
            if (!valid) continue;
            retRows.push(row);
            yReturns.push(targetNextRet);
        }
        if (retRows.length < minOverlap - 4) continue;

        const names = [targetSym, ...exogNames];
        const fit = fitRidgeARX(retRows, yReturns, { ridge: 2.0, decay: 0.99, featureNames: names });
        if (!fit) continue;

        const yMean = mean(yReturns);
        const ssTot = yReturns.reduce((s, y) => s + (y - yMean) ** 2, 0) || 1e-12;
        const ssRes = retRows.reduce((s, row, idx) => {
            const pred = fit.predict(row) ?? yMean;
            return s + (yReturns[idx] - pred) ** 2;
        }, 0);
        const r2 = Math.max(0, 1 - ssRes / ssTot);

        for (let col = 1; col < names.length; col++) {
            const drv = names[col];
            const driverVals = retRows.map(r => r[col]);
            const drvSd = stdDev(driverVals) || 1;
            const ySd = stdDev(yReturns) || 1;
            const weight = fit.weights[col + 1];
            const elasticity = (weight / drvSd) * (ySd > 0 ? 1 : 0);
            results.push({
                target: targetSym,
                driver: drv,
                lag: 1,
                standardizedBeta: round(weight, 3),
                elasticity: round(elasticity, 3),
                r2: round(r2, 3),
                sampleCount: retRows.length,
            });
        }
    }

    return results
        .filter(item => item.standardizedBeta != null)
        .sort((a, b) => Math.abs(b.standardizedBeta) - Math.abs(a.standardizedBeta));
}

module.exports = {
    DAY_MS,
    alignMultivariateSeries,
    fitRidgeARX,
    computeConformalInterval,
    assessMultivariateForecast,
    estimateCrossAssetElasticities,
};
