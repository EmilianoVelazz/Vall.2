'use strict';

// ============================================================================
// Motor ML Especializado en Proteínas Animales v3.0 (Quant Pro)
// (Cerdo, Res, Pollo, Huevo) · México, EE. UU., Europa, Latinoamérica y Global
//
// Arquitectura cuantitativa v3.0 sin fuga futura (cero lookahead bias):
//  1) Motor de Nivel y Bandas Conformal P80/P90:
//     - Multivariable Ridge-ARX (`assessMultivariateForecast`) con cobertura
//       empírica Conformal P80/P90 y mejora MAE verificada vs baseline
//     - Univariable Adaptativo (`assessAdaptiveForecast`) con perfiles reales
//       (`protein_futures`, `protein_daily`, `protein_weekly`, `general`)
//  2) Rasgos Fundamentales Pecuarios y de Cadena de Suministro:
//     - Índice Compuesto de Ración (65% Maíz + 35% Pasta de Soya) en moneda local
//     - Ratio de Margen Proteína/Ración (Z-Score) con rezago biológico por especie
//     - Transmisión aguas arriba -> aguas abajo (Feeder->Live Cattle, Cutouts/PPI->Retail)
//     - Estacionalidad calendario causal (tasa histórica del mismo mes en años previos)
//     - Momento interanual (YoY), Energía/Cadena de frío (Diésel, Gas Natural, WTI),
//       Índice Dólar (DXY) e Inflación Alimentaria (US Food CPI)
//  3) Meta-Stacking Direccional con Poda Causal por Brier Score:
//     - L2-Logit Walk-Forward + GBDT Decision Stumps + Transfer Learning por Especie
//       calibrado a tasa base local + Tendencia/Reversión local + Señal ARX
//     - Poda exponencial de submodelos ruidosos (evita sobreajuste en series cortas)
// ============================================================================

const fs = require('node:fs');
const path = require('node:path');
const { assessAdaptiveForecast } = require('./adaptive-forecast');
const { assessMultivariateForecast, alignMultivariateSeries, estimateCrossAssetElasticities } = require('./multivariate-forecast');
const { analyzeMarketAnomalies } = require('./anomaly-detector');
const { loadCachedNlpEvents, computeNlpEventOverlay } = require('./protein-nlp-events');

const PROTEIN_ML_BRAND = 'MARRANAS';
const PROTEIN_ML_VERSION = 'marranas-ml-v6.0-nlp-events';
const PROTEIN_ML_CACHE_FILE = path.resolve(__dirname, '../cache/protein-ml-forecasts.json');

const SPECIES_META = Object.freeze({
    cerdo: {
        id: 'cerdo',
        label: 'Cerdo (Porcino)',
        biologicalCycle: 'Ciclo porcino medio (granja a sacrificio)',
        feedLagSteps: { daily: 20, weekly: 8, monthly: 3 },
        cotDriver: 'COT_HOGS',
        supplySpreadDriver: 'AMS_PORK_SPREAD',
        ibgeSupplyDriver: 'IBGE_PORK_SUPPLY',
        defaultExog: ['FEED_INDEX', 'DIESEL', 'DXY', 'HE_F', 'COT_HOGS', 'AMS_PORK_SPREAD'],
        upstreamMap: {
            retail: ['US_PPI_PORK', 'AMS_PORK', 'HE_F'],
            wholesale: ['AMS_PORK', 'HE_F', 'US_FOOD_CPI'],
            carcass: ['HE_F', 'AMS_PORK_SPREAD', 'FEED_INDEX'],
            futures: ['COT_HOGS', 'AMS_PORK_SPREAD', 'FEED_INDEX', 'DXY'],
        },
    },
    res: {
        id: 'res',
        label: 'Res (Bovino / Vacuno)',
        biologicalCycle: 'Ciclo bovino largo (engorda y retención)',
        feedLagSteps: { daily: 25, weekly: 12, monthly: 4 },
        cotDriver: 'COT_CATTLE',
        supplySpreadDriver: 'AMS_BEEF_SPREAD',
        ibgeSupplyDriver: 'IBGE_BEEF_SUPPLY',
        defaultExog: ['FEED_INDEX', 'DIESEL', 'DXY', 'GF_F', 'LE_F', 'COT_CATTLE', 'AMS_BEEF_SPREAD'],
        upstreamMap: {
            retail: ['US_PPI_BEEF', 'AMS_BEEF', 'LE_F'],
            wholesale: ['AMS_BEEF', 'LE_F', 'GF_F', 'US_FOOD_CPI'],
            carcass: ['LE_F', 'GF_F', 'AMS_BEEF_SPREAD', 'FEED_INDEX'],
            futures: ['COT_CATTLE', 'GF_F', 'AMS_BEEF_SPREAD', 'FEED_INDEX', 'DXY'],
        },
    },
    pollo: {
        id: 'pollo',
        label: 'Pollo (Avícola / Broiler)',
        biologicalCycle: 'Ciclo avícola rápido (conversión alimenticia)',
        feedLagSteps: { daily: 10, weekly: 4, monthly: 2 },
        cotDriver: 'COT_CORN',
        supplySpreadDriver: 'IBGE_CHICKEN_SUPPLY',
        ibgeSupplyDriver: 'IBGE_CHICKEN_SUPPLY',
        defaultExog: ['FEED_INDEX', 'NATGAS', 'DIESEL', 'DXY', 'COT_CORN'],
        upstreamMap: {
            retail: ['US_PPI_POULTRY', 'US_FOOD_CPI', 'FEED_INDEX'],
            wholesale: ['FEED_INDEX', 'NATGAS', 'US_FOOD_CPI'],
            whole: ['FEED_INDEX', 'NATGAS', 'DIESEL'],
            carcass: ['FEED_INDEX', 'NATGAS', 'DIESEL'],
        },
    },
    huevo: {
        id: 'huevo',
        label: 'Huevo (Postura)',
        biologicalCycle: 'Ciclo de postura sensible a ración y sanidad aviar',
        feedLagSteps: { daily: 10, weekly: 4, monthly: 2 },
        cotDriver: 'COT_CORN',
        supplySpreadDriver: 'US_FOOD_CPI',
        ibgeSupplyDriver: null,
        defaultExog: ['FEED_INDEX', 'NATGAS', 'DIESEL', 'US_FOOD_CPI', 'COT_CORN'],
        upstreamMap: {
            retail: ['US_PPI_EGGS', 'US_FOOD_CPI', 'FEED_INDEX'],
            wholesale: ['FEED_INDEX', 'NATGAS', 'US_FOOD_CPI'],
        },
    },
});

const REGION_META = Object.freeze({
    MX: { id: 'MX', label: 'México', fxDriver: 'USDMXN', fxInvert: false },
    US: { id: 'US', label: 'Estados Unidos', fxDriver: null, fxInvert: false },
    EU: { id: 'EU', label: 'Europa (UE)', fxDriver: 'EURUSD', fxInvert: true },
    LATAM: { id: 'LATAM', label: 'Latinoamérica', fxDriver: 'USDBRL', fxInvert: false },
    GLOBAL: { id: 'GLOBAL', label: 'Global / Asia / Norteamérica', fxDriver: 'DXY', fxInvert: false },
});

const mean = values => (values.length ? values.reduce((acc, v) => acc + v, 0) / values.length : 0);
const stdDev = (values, avg = mean(values)) => {
    if (values.length < 2) return 0;
    return Math.sqrt(values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / (values.length - 1));
};
const round = (value, digits = 3) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const sigmoid = z => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

function foldText(text) {
    return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function sanitizeSeries(points, now = Date.now()) {
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

function horizonsForCadence(cadence) {
    if (cadence === 'daily') {
        return [
            { steps: 5, code: '1w', label: '1 semana (5 sesiones)' },
            { steps: 20, code: '1m', label: '1 mes (20 sesiones)' },
        ];
    }
    if (cadence === 'weekly') {
        return [
            { steps: 1, code: '1w', label: '1 semana' },
            { steps: 4, code: '1m', label: '1 mes (4 semanas)' },
            { steps: 12, code: '3m', label: '1 trimestre (12 semanas)' },
        ];
    }
    return [
        { steps: 1, code: '1m', label: '1 mes' },
        { steps: 3, code: '3m', label: '3 meses' },
        { steps: 6, code: '6m', label: '6 meses' },
    ];
}

// ── Índice de Paridad de Importación en MXN/kg (Benchmark USD/EUR × FX) ────
function buildImportParitySeries(benchmarkPts = [], fxPts = [], divisor = 1, now = Date.now()) {
    const bm = sanitizeSeries(benchmarkPts, now);
    const fx = sanitizeSeries(fxPts, now);
    if (bm.length < 12 || fx.length < 12) return [];
    const out = [];
    let fPtr = -1;
    for (const pt of bm) {
        while (fPtr + 1 < fx.length && fx[fPtr + 1].date <= pt.date) fPtr += 1;
        if (fPtr < 0) continue;
        const mxnKg = (pt.value / divisor) * fx[fPtr].value;
        if (Number.isFinite(mxnKg) && mxnKg > 0) {
            out.push({ date: pt.date, value: Number(mxnKg.toFixed(4)) });
        }
    }
    return out;
}

// ── Índice Compuesto de Alimento Balanceado (65% Maíz + 35% Pasta de Soya) ─
function buildCompositeFeedSeries(exogenousPools = {}, now = Date.now()) {
    const corn = sanitizeSeries(exogenousPools.CORN || [], now);
    const soy = sanitizeSeries(exogenousPools.SOYMEAL || exogenousPools.SOYBEANS || [], now);
    if (corn.length < 15 || soy.length < 15) return corn.length ? corn : soy;

    const cBase = corn[0].value;
    const sBase = soy[0].value;
    const out = [];
    let sPtr = -1;
    for (const cPt of corn) {
        while (sPtr + 1 < soy.length && soy[sPtr + 1].date <= cPt.date) sPtr += 1;
        if (sPtr < 0) continue;
        const idxVal = 100 * (0.65 * (cPt.value / cBase) + 0.35 * (soy[sPtr].value / sBase));
        if (Number.isFinite(idxVal) && idxVal > 0) out.push({ date: cPt.date, value: Number(idxVal.toFixed(4)) });
    }
    return out;
}

// ── Clasificador 1: Regresión Logística Regularizada L2 (Recency-Weighted) ─
function fitLogisticL2(rows, labels, { lambda = 1.8, decay = 0.988, iterations = 36, lr = 0.22 } = {}) {
    if (!rows.length || rows.length !== labels.length) return null;
    const cols = rows[0].length;
    const means = Array.from({ length: cols }, (_, c) => mean(rows.map(r => r[c])));
    const scales = Array.from({ length: cols }, (_, c) => {
        const sd = stdDev(rows.map(r => r[c]), means[c]);
        return sd > 1e-8 ? sd : 1;
    });

    const n = rows.length;
    const weights = Array(cols + 1).fill(0);
    const stdRows = rows.map(r => r.map((v, c) => clamp((v - means[c]) / scales[c], -4, 4)));
    const sampleWeights = Array.from({ length: n }, (_, i) => Math.pow(decay, n - 1 - i));
    const totalW = sampleWeights.reduce((a, b) => a + b, 0) || 1;

    for (let iter = 0; iter < iterations; iter++) {
        const grad = Array(cols + 1).fill(0);
        for (let i = 0; i < n; i++) {
            const w = sampleWeights[i] / totalW;
            let z = weights[0];
            for (let c = 0; c < cols; c++) z += weights[c + 1] * stdRows[i][c];
            const err = sigmoid(z) - labels[i];
            grad[0] += w * err;
            for (let c = 0; c < cols; c++) grad[c + 1] += w * err * stdRows[i][c];
        }
        weights[0] -= lr * grad[0];
        for (let c = 0; c < cols; c++) {
            const reg = (lambda / Math.max(8, n)) * weights[c + 1];
            weights[c + 1] -= lr * (grad[c + 1] + reg);
        }
    }

    return {
        means,
        scales,
        weights,
        predictProba(rawFeatures) {
            let z = weights[0];
            for (let c = 0; c < cols; c++) {
                const x = clamp((rawFeatures[c] - means[c]) / scales[c], -4, 4);
                z += weights[c + 1] * x;
            }
            return clamp(sigmoid(z), 0.08, 0.92);
        },
        explainLogOdds(rawFeatures) {
            const contribs = Array.from({ length: cols }, (_, c) => {
                const x = clamp((rawFeatures[c] - means[c]) / scales[c], -4, 4);
                return weights[c + 1] * x;
            });
            return { baseLogOdds: weights[0], contribs };
        },
    };
}

// ── Clasificador 2: GBDT Decision Stumps Log-Loss (No lineal, regularizado) ─
function fitBoostedStumps(rows, labels, { nTrees = 10, lr = 0.13, decay = 0.99, l2Leaf = 6.5 } = {}) {
    const n = rows.length;
    if (n < 18 || n !== labels.length) return null;
    const cols = rows[0].length;
    const sampleWeights = Array.from({ length: n }, (_, i) => Math.pow(decay, n - 1 - i));
    const totalW = sampleWeights.reduce((a, b) => a + b, 0) || 1;
    const normW = sampleWeights.map(w => w / totalW);

    let posW = 0;
    for (let i = 0; i < n; i++) if (labels[i] === 1) posW += normW[i];
    const baseRate = clamp(posW, 0.15, 0.85);
    const baseScore = Math.log(baseRate / (1 - baseRate));
    const scores = Array(n).fill(baseScore);
    const trees = [];

    const thresholds = Array.from({ length: cols }, (_, c) => {
        const vals = rows.map(r => r[c]).sort((a, b) => a - b);
        const picks = [0.2, 0.35, 0.5, 0.65, 0.8].map(q => vals[Math.min(n - 1, Math.floor(q * n))]);
        return [...new Set(picks)];
    });

    for (let t = 0; t < nTrees; t++) {
        const grad = new Array(n);
        const hess = new Array(n);
        for (let i = 0; i < n; i++) {
            const p = sigmoid(scores[i]);
            grad[i] = normW[i] * (p - labels[i]);
            hess[i] = normW[i] * Math.max(0.05, p * (1 - p));
        }

        let best = { gain: 0, feature: -1, threshold: 0, leftVal: 0, rightVal: 0 };
        const totalG = grad.reduce((a, b) => a + b, 0);
        const totalH = hess.reduce((a, b) => a + b, 0);
        const parentScore = (totalG * totalG) / (totalH + l2Leaf);

        for (let c = 0; c < cols; c++) {
            for (const thr of thresholds[c]) {
                let gL = 0, hL = 0, cntL = 0;
                for (let i = 0; i < n; i++) {
                    if (rows[i][c] <= thr) {
                        gL += grad[i];
                        hL += hess[i];
                        cntL += 1;
                    }
                }
                if (cntL < 4 || n - cntL < 4) continue;
                const gR = totalG - gL;
                const hR = totalH - hL;
                const gain = (gL * gL) / (hL + l2Leaf) + (gR * gR) / (hR + l2Leaf) - parentScore;
                if (gain > best.gain) {
                    best = {
                        gain,
                        feature: c,
                        threshold: thr,
                        leftProb: cntL / n,
                        leftVal: clamp(-gL / (hL + l2Leaf), -1.6, 1.6),
                        rightVal: clamp(-gR / (hR + l2Leaf), -1.6, 1.6),
                    };
                }
            }
        }

        if (best.feature < 0 || best.gain < 1e-6) break;
        trees.push(best);
        for (let i = 0; i < n; i++) {
            scores[i] += lr * (rows[i][best.feature] <= best.threshold ? best.leftVal : best.rightVal);
        }
    }

    return {
        baseScore,
        lr,
        trees,
        predictProba(rawFeatures) {
            let z = baseScore;
            for (const tree of trees) {
                z += lr * (rawFeatures[tree.feature] <= tree.threshold ? tree.leftVal : tree.rightVal);
            }
            return clamp(sigmoid(z), 0.08, 0.92);
        },
        // Exact analytical TreeSHAP for depth-1 decision stumps: phi_f = sum lr * (leaf(x) - E[leaf])
        explainLogOdds(rawFeatures) {
            const contribs = Array(cols).fill(0);
            let adjBase = baseScore;
            for (const tree of trees) {
                const pL = Number.isFinite(tree.leftProb) ? tree.leftProb : 0.5;
                const expectedLeaf = pL * tree.leftVal + (1 - pL) * tree.rightVal;
                const actualLeaf = rawFeatures[tree.feature] <= tree.threshold ? tree.leftVal : tree.rightVal;
                adjBase += lr * expectedLeaf;
                contribs[tree.feature] += lr * (actualLeaf - expectedLeaf);
            }
            return { baseLogOdds: adjBase, contribs };
        },
        featureImportances(featureNames) {
            const counts = new Map();
            for (const tree of trees) {
                const name = featureNames[tree.feature] || `f${tree.feature}`;
                counts.set(name, (counts.get(name) || 0) + tree.gain);
            }
            return [...counts.entries()]
                .map(([feature, gain]) => ({ feature, weight: round(gain * 100, 3), absWeight: gain }))
                .sort((a, b) => b.absWeight - a.absWeight);
        },
    };
}

// ── Extractor de Rasgos v3.0 (Cadena de suministro + Estacionalidad causal) ─
const PANEL_FEATURE_NAMES = Object.freeze([
    'Momentum 1p',
    'Momentum 3p',
    'Momentum 6p',
    'Tendencia Interanual (YoY)',
    'Reversión Z-20',
    'Volatilidad relativa',
    'Estacionalidad Sen',
    'Estacionalidad Cos',
    'Estacionalidad Histórica Mes',
    'Impulso Ración (Maíz+Soya)',
    'Ratio Margen Proteína/Ración (Z)',
    'Impulso Energía/Cadena de Frío',
    'Impulso Divisa / DXY',
    'Transmisión Aguas Arriba (Mayoreo/Futuros)',
    'Posicionamiento Especulativo CFTC COT (Z)',
    'Spread Cortes Primarios / Oferta IBGE',
    'Spread Paridad de Importación MXN (Z)',
]);

function buildUnifiedFeatures(aligned, idx, { feedLag = 4, cadence = 'weekly', fxDriver = null, fxInvert = false, upstreamKey = null, cotKey = null, spreadKey = null, parityKey = null } = {}) {
    const val = aligned[idx].value;
    const p1 = aligned[Math.max(0, idx - 1)].value;
    const p3 = aligned[Math.max(0, idx - 3)].value;
    const p6 = aligned[Math.max(0, idx - 6)].value;
    const yoyLag = cadence === 'monthly' ? 12 : cadence === 'weekly' ? 52 : 200;
    const pYoy = aligned[Math.max(0, idx - yoyLag)].value;

    const ret1 = p1 > 0 ? clamp(Math.log(val / p1), -0.35, 0.35) : 0;
    const ret3 = p3 > 0 ? clamp(Math.log(val / p3), -0.45, 0.45) : 0;
    const ret6 = p6 > 0 ? clamp(Math.log(val / p6), -0.55, 0.55) : 0;
    const retYoy = idx >= Math.min(12, yoyLag) && pYoy > 0 ? clamp(Math.log(val / pYoy), -0.65, 0.65) : ret6;

    const winStart = Math.max(0, idx - 19);
    const winVals = aligned.slice(winStart, idx + 1).map(p => p.value);
    const avg20 = mean(winVals);
    const sd20 = stdDev(winVals, avg20);
    const zMean = sd20 > 1e-9 ? clamp((val - avg20) / sd20, -3.5, 3.5) : 0;

    // Rolling volatility ratio
    const shortRets = [];
    const longRets = [];
    for (let k = Math.max(1, idx - 19); k <= idx; k++) {
        const prev = aligned[k - 1].value;
        const cur = aligned[k].value;
        if (prev > 0 && cur > 0) {
            const r = Math.log(cur / prev);
            longRets.push(r);
            if (k >= idx - 5) shortRets.push(r);
        }
    }
    const volShort = stdDev(shortRets);
    const volLong = stdDev(longRets);
    const volRatio = volLong > 1e-6 ? clamp(volShort / volLong - 1, -1.5, 2.5) : 0;

    // Causal Calendar-Month Historical Return Bias (strictly prior years only!)
    const curMonth = aligned[idx].date.slice(5, 7);
    const curYear = aligned[idx].date.slice(0, 4);
    let mUp = 0;
    let mCnt = 0;
    for (let k = 1; k < idx; k++) {
        if (aligned[k].date.slice(5, 7) === curMonth && aligned[k].date.slice(0, 4) < curYear) {
            if (aligned[k].value > aligned[k - 1].value) mUp += 1;
            mCnt += 1;
        }
    }
    // Smoothed toward 0 (neutral) when fewer than 3 prior calendar occurrences
    const causalMonthBias = mCnt >= 2 ? clamp(((mUp + 1) / (mCnt + 2)) - 0.5, -0.4, 0.4) * 2 : 0;

    // Biological-lagged Feed Cost Impulse & Margin Ratio Z-Score
    const lagIdx = Math.max(0, idx - feedLag);
    const feedNow = aligned[idx].exog?.FEED_INDEX || aligned[idx].exog?.CORN || null;
    const feedLagVal = aligned[lagIdx].exog?.FEED_INDEX || aligned[lagIdx].exog?.CORN || null;
    const feedImp = feedNow > 0 && feedLagVal > 0 ? clamp(Math.log(feedNow / feedLagVal), -0.4, 0.4) : 0;

    const getLandedFeed = k => {
        const f = aligned[k].exog?.FEED_INDEX || aligned[k].exog?.CORN;
        if (!(f > 0)) return null;
        if (!fxDriver) return f;
        const fx = aligned[k].exog?.[fxDriver];
        if (!(fx > 0)) return f;
        return fxInvert ? f / fx : f * fx;
    };
    const marginSeries = [];
    for (let k = Math.max(0, idx - 23); k <= idx; k++) {
        const lf = getLandedFeed(k);
        if (lf > 0 && aligned[k].value > 0) marginSeries.push(Math.log(aligned[k].value / lf));
    }
    let marginZ = 0;
    if (marginSeries.length >= 6) {
        const mAvg = mean(marginSeries);
        const mSd = stdDev(marginSeries, mAvg);
        marginZ = mSd > 1e-8 ? clamp((marginSeries.at(-1) - mAvg) / mSd, -3.5, 3.5) : 0;
    }

    // Energy / Cold-Chain impulse
    const energyKey = aligned[idx].exog?.DIESEL ? 'DIESEL' : aligned[idx].exog?.WTI ? 'WTI' : 'NATGAS';
    const eNow = aligned[idx].exog?.[energyKey];
    const ePrev = aligned[Math.max(0, idx - 3)].exog?.[energyKey];
    const energyImp = eNow > 0 && ePrev > 0 ? clamp(Math.log(eNow / ePrev), -0.4, 0.4) : 0;

    // Regional FX / DXY impulse
    let fxImp = 0;
    const activeFxKey = fxDriver || (aligned[idx].exog?.DXY ? 'DXY' : null);
    if (activeFxKey) {
        const fxNow = aligned[idx].exog?.[activeFxKey];
        const fxPrev = aligned[Math.max(0, idx - 3)].exog?.[activeFxKey];
        if (fxNow > 0 && fxPrev > 0) {
            const rawFx = Math.log(fxNow / fxPrev);
            fxImp = clamp(fxInvert ? -rawFx : rawFx, -0.3, 0.3);
        }
    }

    // Upstream Supply-Chain Pass-Through Lead (e.g. PPI/AMS/Futures -> Retail/Local)
    let upstreamImp = 0;
    if (upstreamKey) {
        const uNow = aligned[idx].exog?.[upstreamKey];
        const uPrev = aligned[Math.max(0, idx - 2)].exog?.[upstreamKey];
        if (uNow > 0 && uPrev > 0) {
            upstreamImp = clamp(Math.log(uNow / uPrev), -0.4, 0.4);
        }
    }

    // CFTC COT Speculative Positioning Z-Score (rolling causal 26-period window)
    let cotNetZ = 0;
    if (cotKey && aligned[idx].exog?.[cotKey] > 0) {
        const cotWin = [];
        for (let k = Math.max(0, idx - 25); k <= idx; k++) {
            const v = aligned[k].exog?.[cotKey];
            if (v > 0) cotWin.push(v);
        }
        if (cotWin.length >= 6) {
            const cAvg = mean(cotWin);
            const cSd = stdDev(cotWin, cAvg);
            cotNetZ = cSd > 1e-6 ? clamp((cotWin.at(-1) - cAvg) / cSd, -3.5, 3.5) : 0;
        }
    }

    // USDA Primal Spread (Choice/Select or Belly/Carcass) or IBGE Slaughter Supply impulse
    let primalSupplyImp = 0;
    if (spreadKey) {
        const sNow = aligned[idx].exog?.[spreadKey];
        const sPrev = aligned[Math.max(0, idx - 3)].exog?.[spreadKey];
        if (sNow > 0 && sPrev > 0) {
            primalSupplyImp = clamp(Math.log(sNow / sPrev), -0.35, 0.35);
        }
    }

    // Import Parity Spread Z-Score: log(LocalPrice / ImportParityMXN) — high Z = local expensive vs import parity (bearish ceiling)
    let paritySpreadZ = 0;
    if (parityKey && aligned[idx].exog?.[parityKey] > 0) {
        const spreadWin = [];
        for (let k = Math.max(0, idx - 23); k <= idx; k++) {
            const par = aligned[k].exog?.[parityKey];
            if (par > 0 && aligned[k].value > 0) spreadWin.push(Math.log(aligned[k].value / par));
        }
        if (spreadWin.length >= 6) {
            const pAvg = mean(spreadWin);
            const pSd = stdDev(spreadWin, pAvg);
            paritySpreadZ = pSd > 1e-8 ? clamp((spreadWin.at(-1) - pAvg) / pSd, -3.5, 3.5) : 0;
        }
    }

    return {
        vector: [
            ret1,
            ret3,
            ret6,
            retYoy,
            zMean,
            volRatio,
            aligned[idx].sinMonth || 0,
            aligned[idx].cosMonth || 0,
            causalMonthBias,
            feedImp,
            marginZ,
            energyImp,
            fxImp,
            upstreamImp,
            cotNetZ,
            primalSupplyImp,
            paritySpreadZ,
        ],
        marginZ: round(marginZ, 2),
        feedImpPct: round(feedImp * 100, 2),
        cotNetZ: round(cotNetZ, 2),
        paritySpreadZ: round(paritySpreadZ, 2),
    };
}

function selectExogenousForSeries(seriesDef, exogenousPools = {}) {
    const speciesMeta = SPECIES_META[seriesDef.species] || SPECIES_META.cerdo;
    const regionMeta = REGION_META[seriesDef.region] || REGION_META.GLOBAL;
    const upstreamList = speciesMeta.upstreamMap?.[seriesDef.priceBasis] || [];
    const parityBySpecies = {
        cerdo: 'PARITY_PORK_MXN',
        res: 'PARITY_BEEF_MXN',
        pollo: 'PARITY_POULTRY_MXN',
        huevo: 'PARITY_EGG_MXN',
    };
    const parityCandidate = seriesDef.region === 'MX' ? parityBySpecies[seriesDef.species] : null;
    const wanted = [...upstreamList, parityCandidate, speciesMeta.cotDriver, speciesMeta.supplySpreadDriver, speciesMeta.ibgeSupplyDriver, ...speciesMeta.defaultExog, 'CORN', 'SOYMEAL'];
    if (regionMeta.fxDriver) wanted.push(regionMeta.fxDriver);

    const ownKey = String(seriesDef.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const selected = {};
    let primaryUpstream = null;

    for (const key of wanted) {
        if (!key || selected[key] || key === ownKey) continue;
        if (seriesDef.symbol === 'HE=F' && key === 'HE_F') continue;
        if (seriesDef.symbol === 'LE=F' && key === 'LE_F') continue;
        if (seriesDef.symbol === 'GF=F' && key === 'GF_F') continue;
        if (seriesDef.symbol === 'US-AMS-PORK-CUTOUT' && key === 'AMS_PORK') continue;
        if (seriesDef.symbol === 'US-AMS-BEEF-CHOICE' && key === 'AMS_BEEF') continue;
        if (seriesDef.symbol.startsWith('US-PPI-') && key.startsWith('US_PPI_')) continue;
        const pts = exogenousPools[key];
        if (Array.isArray(pts) && pts.length >= 10) {
            selected[key] = pts;
            if (!primaryUpstream && upstreamList.includes(key)) primaryUpstream = key;
        }
    }
    const cotKey = selected[speciesMeta.cotDriver] ? speciesMeta.cotDriver : null;
    const parityKey = parityCandidate && selected[parityCandidate] ? parityCandidate : null;
    const spreadKey = (seriesDef.region === 'LATAM' && selected[speciesMeta.ibgeSupplyDriver])
        ? speciesMeta.ibgeSupplyDriver
        : (selected[speciesMeta.supplySpreadDriver] ? speciesMeta.supplySpreadDriver : (selected[speciesMeta.ibgeSupplyDriver] ? speciesMeta.ibgeSupplyDriver : null));
    return { selected, primaryUpstream, cotKey, spreadKey, parityKey };
}

// ── Transfer Learning: Panel Global por Especie (De-biased Local Intercept) ─
function buildSpeciesPanelPriors(seriesCatalog = [], enrichedExog = {}, now = Date.now()) {
    const priors = {};
    for (const sp of Object.keys(SPECIES_META)) {
        const rows = [];
        const labels = [];
        const spMeta = SPECIES_META[sp];
        const spSeries = seriesCatalog.filter(s => s.species === sp && Array.isArray(s.points) && s.points.length >= 35);

        for (const def of spSeries) {
            const pts = sanitizeSeries(def.points, now);
            if (pts.length < 35) continue;
            const regMeta = REGION_META[def.region] || REGION_META.GLOBAL;
            const { selected: exogMap, primaryUpstream, cotKey, spreadKey, parityKey } = selectExogenousForSeries(def, enrichedExog);
            const { aligned } = alignMultivariateSeries(pts, exogMap, now);
            const seq = aligned.length >= 30 ? aligned : pts.map(pt => {
                const m = Number(pt.date.slice(5, 7)) || 1;
                const a = (2 * Math.PI * (m - 1)) / 12;
                return { date: pt.date, value: pt.value, exog: {}, prevExog: {}, sinMonth: Math.sin(a), cosMonth: Math.cos(a) };
            });

            const hSteps = def.cadence === 'daily' ? 20 : def.cadence === 'weekly' ? 4 : 1;
            const feedLag = spMeta.feedLagSteps[def.cadence] || 4;
            const start = Math.max(8, seq.length - 120);
            for (let t = start; t < seq.length - hSteps; t++) {
                const cur = seq[t].value;
                const fut = seq[t + hSteps].value;
                if (!(cur > 0 && fut > 0)) continue;
                const { vector } = buildUnifiedFeatures(seq, t, {
                    feedLag,
                    cadence: def.cadence,
                    fxDriver: regMeta.fxDriver,
                    fxInvert: regMeta.fxInvert,
                    upstreamKey: primaryUpstream,
                    cotKey,
                    spreadKey,
                    parityKey,
                });
                rows.push(vector);
                labels.push(fut > cur ? 1 : 0);
            }
        }

        if (rows.length >= 40) {
            const logitPrior = fitLogisticL2(rows, labels, { lambda: 5.0, decay: 0.996, iterations: 40 });
            const gbdtPrior = fitBoostedStumps(rows, labels, { nTrees: 12, lr: 0.12, decay: 0.996, l2Leaf: 8.5 });
            const panelBaseRate = clamp(mean(labels), 0.15, 0.85);
            const panelBaseLogit = Math.log(panelBaseRate / (1 - panelBaseRate));
            priors[sp] = {
                sampleSize: rows.length,
                sourceSeries: spSeries.length,
                predictProba(vector, localBaseRate = 0.5) {
                    const pL = logitPrior ? logitPrior.predictProba(vector) : 0.5;
                    const pG = gbdtPrior ? gbdtPrior.predictProba(vector) : 0.5;
                    const pRaw = clamp(0.55 * pL + 0.45 * pG, 0.08, 0.92);
                    const rawLogit = Math.log(pRaw / (1 - pRaw));
                    const localRate = clamp(localBaseRate, 0.2, 0.8);
                    const localLogit = Math.log(localRate / (1 - localRate));
                    const adjustedLogit = (rawLogit - panelBaseLogit) * 0.72 + localLogit;
                    return clamp(sigmoid(adjustedLogit), 0.1, 0.9);
                },
                explainLogOdds(vector, localBaseRate = 0.5) {
                    const eL = logitPrior ? logitPrior.explainLogOdds(vector) : { baseLogOdds: 0, contribs: Array(vector.length).fill(0) };
                    const eG = gbdtPrior ? gbdtPrior.explainLogOdds(vector) : { baseLogOdds: 0, contribs: Array(vector.length).fill(0) };
                    const localRate = clamp(localBaseRate, 0.2, 0.8);
                    const localLogit = Math.log(localRate / (1 - localRate));
                    const contribs = vector.map((_, idx) => (0.55 * (eL.contribs[idx] || 0) + 0.45 * (eG.contribs[idx] || 0)) * 0.72);
                    const baseLogOdds = localLogit + ((0.55 * eL.baseLogOdds + 0.45 * eG.baseLogOdds) - panelBaseLogit) * 0.72;
                    return { baseLogOdds, contribs };
                },
            };
        }
    }
    return priors;
}

// ── Motor de Explicabilidad Causal (SHAP / Log-Odds Aditivo por Factor) ───
const FACTOR_GROUPS = Object.freeze([
    { id: 'momentum_trend', label: 'Tendencia, Momentum y Reversión', indices: [0, 1, 2, 3, 4, 5] },
    { id: 'seasonality', label: 'Estacionalidad Biológica y Calendario', indices: [6, 7, 8] },
    { id: 'feed_margin', label: 'Ración Maíz+Soya y Margen Pecuario', indices: [9, 10] },
    { id: 'supply_spread', label: 'Cadena Mayoreo / Spreads / Oferta IBGE', indices: [13, 15] },
    { id: 'cftc_cot', label: 'Posicionamiento Institucional CFTC COT', indices: [14] },
    { id: 'import_parity', label: 'Paridad de Importación / Arbitraje MXN', indices: [16] },
    { id: 'energy_fx', label: 'Energía, Flete Diésel y Divisa / DXY', indices: [11, 12] },
]);

function buildCausalExplanation({ featureContribs = [], baseLogOdds = 0, probUpPct = 50, direction = 'LATERAL' } = {}) {
    const rawGroups = FACTOR_GROUPS.map(grp => ({
        id: grp.id,
        label: grp.label,
        logOdds: grp.indices.reduce((sum, idx) => sum + (Number(featureContribs[idx]) || 0), 0),
    }));
    rawGroups.push({
        id: 'base_regime',
        label: 'Tasa Base y Régimen Histórico Local',
        logOdds: Number(baseLogOdds) || 0,
    });

    // Exact additive mapping from log-odds to percentage points summing to (probUpPct - 50)
    const netDeltaPts = round(probUpPct - 50, 1);
    const totalLogOdds = rawGroups.reduce((sum, g) => sum + g.logOdds, 0);
    const absLogOdds = rawGroups.reduce((sum, g) => sum + Math.abs(g.logOdds), 0);

    let factors;
    if (Math.abs(totalLogOdds) > 1e-4 && Math.abs(netDeltaPts) > 0.1) {
        const scale = netDeltaPts / totalLogOdds;
        factors = rawGroups.map(g => {
            const pts = clamp(g.logOdds * scale, -42, 42);
            return { id: g.id, label: g.label, impactPctPts: round(pts, 1) };
        });
        // Reconcile rounding drift on the largest factor so sum === netDeltaPts cleanly
        const sumPts = factors.reduce((s, f) => s + f.impactPctPts, 0);
        const residual = round(netDeltaPts - sumPts, 1);
        if (Math.abs(residual) >= 0.1 && factors.length) {
            const topIdx = factors.reduce((best, f, idx, arr) => (Math.abs(f.impactPctPts) > Math.abs(arr[best].impactPctPts) ? idx : best), 0);
            factors[topIdx].impactPctPts = round(factors[topIdx].impactPctPts + residual, 1);
        }
    } else if (absLogOdds > 1e-4) {
        // Near-neutral 50% case: preserve relative sign/magnitude around 0 with ~12 pts/logit sensitivity
        factors = rawGroups.map(g => ({
            id: g.id,
            label: g.label,
            impactPctPts: round(clamp(g.logOdds * 18, -18, 18), 1),
        }));
    } else {
        factors = rawGroups.map(g => ({ id: g.id, label: g.label, impactPctPts: 0 }));
    }

    const cleanFactors = factors
        .map(f => ({
            ...f,
            direction: f.impactPctPts > 0.2 ? 'ALZA' : f.impactPctPts < -0.2 ? 'BAJA' : 'NEUTRO',
        }))
        .filter(f => Math.abs(f.impactPctPts) >= 0.2)
        .sort((a, b) => Math.abs(b.impactPctPts) - Math.abs(a.impactPctPts));

    const bullish = cleanFactors.filter(f => f.impactPctPts > 0.2).slice(0, 2);
    const bearish = cleanFactors.filter(f => f.impactPctPts < -0.2).slice(0, 2);
    const fmtList = list => list.map(f => `${f.label} (${f.impactPctPts > 0 ? '+' : ''}${f.impactPctPts} pts)`).join(' y ');

    let narrative;
    if (direction === 'ALZA' && bullish.length) {
        narrative = `Sesgo ALZA (${probUpPct}% subida): impulsan al alza ${fmtList(bullish)}${bearish.length ? `; modera ${fmtList(bearish.slice(0, 1))}` : ''}.`;
    } else if (direction === 'BAJA' && bearish.length) {
        narrative = `Sesgo BAJA (${round(100 - probUpPct, 1)}% baja): presionan a la baja ${fmtList(bearish)}${bullish.length ? `; compensa parcialmente ${fmtList(bullish.slice(0, 1))}` : ''}.`;
    } else {
        narrative = `Equilibrio LATERAL (${probUpPct}% subida): fuerzas contrapuestas entre ${cleanFactors.slice(0, 2).map(f => `${f.label} (${f.impactPctPts > 0 ? '+' : ''}${f.impactPctPts} pts)`).join(' y ') || 'tendencia histórica y estacionalidad'}.`;
    }

    return {
        method: 'additive_logit_treeshap_v4.1',
        neutralBaselinePct: 50,
        finalProbUpPct: probUpPct,
        netDeltaPts,
        narrative,
        factors: cleanFactors.slice(0, 6),
    };
}

// ── Meta-Stacking Direccional v5.0 con Poda Causal Brier (6 candidatos + Paridad)
function runWalkForwardMetaStack(aligned, { horizonSteps, feedLag, cadence, fxDriver, fxInvert, upstreamKey, cotKey = null, spreadKey = null, parityKey = null, panelPrior = null }) {
    const n = aligned.length;
    const startIdx = 6;
    const allX = [];
    const allY = [];

    for (let t = startIdx; t < n - horizonSteps; t++) {
        const cur = aligned[t].value;
        const fut = aligned[t + horizonSteps].value;
        if (!(cur > 0 && fut > 0)) continue;
        const { vector } = buildUnifiedFeatures(aligned, t, { feedLag, cadence, fxDriver, fxInvert, upstreamKey, cotKey, spreadKey, parityKey });
        allX.push(vector);
        allY.push(fut > cur ? 1 : 0);
    }

    const latestFeat = buildUnifiedFeatures(aligned, n - 1, { feedLag, cadence, fxDriver, fxInvert, upstreamKey, cotKey, spreadKey, parityKey });
    const latestX = latestFeat.vector;

    // Anti-overfitting guard: series with < 28 causal samples (e.g. CEPEA 26d, LatAm 17w)
    // MUST use the de-biased Species Panel Transfer + Local Causal Recency blend instead of fitting 14 weights on ~10 rows!
    if (allX.length < 28) {
        if (!panelPrior || allX.length < 4) {
            return {
                available: false,
                reason: 'Serie corta sin suficientes ventanas causales',
                marginZ: latestFeat.marginZ,
                feedImpPct: latestFeat.feedImpPct,
            };
        }
        let hits = 0;
        let brierSum = 0;
        let upCount = 0;
        let evalN = 0;
        const evalFrom = Math.max(2, Math.floor(allX.length * 0.35));
        for (let i = evalFrom; i < allX.length; i++) {
            const prevY = allY.slice(0, i);
            const causalBase = (prevY.reduce((a, b) => a + b, 0) + 1.5) / (prevY.length + 3);
            const pPanel = panelPrior.predictProba(allX[i], causalBase);
            // Smooth 65% calibrated panel + 35% smoothed causal local base rate
            const p = clamp(0.65 * pPanel + 0.35 * causalBase, 0.12, 0.88);
            if ((p >= 0.5 ? 1 : 0) === allY[i]) hits += 1;
            brierSum += (p - allY[i]) ** 2;
            if (allY[i] === 1) upCount += 1;
            evalN += 1;
        }
        const finalLocalBase = (allY.reduce((a, b) => a + b, 0) + 1.5) / (allY.length + 3);
        const pPanelFinal = panelPrior.predictProba(latestX, finalLocalBase);
        const probUp = clamp(0.65 * pPanelFinal + 0.35 * finalLocalBase, 0.12, 0.88);
        const pExplain = panelPrior.explainLogOdds
            ? panelPrior.explainLogOdds(latestX, finalLocalBase)
            : { baseLogOdds: Math.log(finalLocalBase / (1 - finalLocalBase)), contribs: Array(latestX.length).fill(0) };
        const localBaseLogit = Math.log(clamp(finalLocalBase, 0.15, 0.85) / (1 - clamp(finalLocalBase, 0.15, 0.85)));
        const shortBaseLogOdds = 0.65 * pExplain.baseLogOdds + 0.35 * localBaseLogit;
        const shortContribs = pExplain.contribs.map(v => 0.65 * v);
        const brier = brierSum / Math.max(1, evalN);
        const baseRate = Math.max(upCount / Math.max(1, evalN), 1 - upCount / Math.max(1, evalN));
        const climBrier = Math.max(0.05, (upCount / Math.max(1, evalN)) * (1 - upCount / Math.max(1, evalN)));
        return {
            available: true,
            mode: 'panel_transfer_calibrated',
            probUp: round(probUp, 4),
            probUpPct: round(probUp * 100, 1),
            probDownPct: round((1 - probUp) * 100, 1),
            directionalAccuracyPct: round((hits / Math.max(1, evalN)) * 100, 1),
            baselineAccuracyPct: round(baseRate * 100, 1),
            brierScore: round(brier, 4),
            brierSkillPct: round((1 - brier / climBrier) * 100, 1),
            evalWindows: evalN,
            modelWeights: { logit: 0, gbdt: 0, panelPrior: 0.65, recencyBase: 0.35 },
            marginZ: latestFeat.marginZ,
            feedImpPct: latestFeat.feedImpPct,
            logOddsAttribution: { baseLogOdds: shortBaseLogOdds, contribs: shortContribs },
            topSignals: [
                { feature: 'Transfer Learning Panel Especie (calibrado local)', weight: 0.65, absWeight: 0.65 },
                { feature: 'Tasa Base Causal Local', weight: 0.35, absWeight: 0.35 },
            ],
        };
    }

    const minTrain = Math.max(20, Math.min(36, Math.floor(allX.length * 0.52)));
    const maxEval = Math.min(64, allX.length - minTrain);
    const evalStart = allX.length - maxEval;
    const shrinkLocal = allX.length / (allX.length + 42);

    // Compact 5-feature slice (cadence-aware: monthly prioritizes YoY + seasonality + upstream)
    const compactSlice = v => (cadence === 'monthly'
        ? [v[1], v[3], v[4], v[8], v[13] !== 0 ? v[13] : v[9]]
        : [v[0], v[1], v[4], v[8], v[13] !== 0 ? v[13] : v[9]]);

    // Candidate #6: Fundamental Supply-Chain + Seasonality + CFTC COT + Primal Spread + Import Parity slice
    const supplySeasonalSlice = v => [v[3], v[6], v[7], v[8], v[9], v[10], v[13], v[14], v[15], v[16]];

    const predictRecencyBase = (subY, vec) => {
        const nS = subY.length;
        let wSum = 0, ySum = 0;
        for (let k = 0; k < nS; k++) {
            const w = Math.pow(0.955, nS - 1 - k);
            wSum += w;
            ySum += w * subY[k];
        }
        const rate = clamp((ySum + 1.2) / (wSum + 2.4), 0.18, 0.82);
        const baseLogit = Math.log(rate / (1 - rate));
        const tilt = clamp(vec[1] * 1.3 + vec[8] * 0.85 + vec[13] * 1.1 + vec[15] * 0.8 - vec[4] * 0.12 - vec[14] * 0.08, -0.65, 0.65);
        return clamp(sigmoid(baseLogit + tilt), 0.1, 0.9);
    };

    const candidates = ['logitFull', 'logitCompact', 'supplySeasonal', 'gbdt', 'panel', 'recency'];
    const brierSums = Object.fromEntries(candidates.map(c => [c, 0]));
    const hitSums = Object.fromEntries(candidates.map(c => [c, 0]));
    const runBrier = Object.fromEntries(candidates.map(c => [c, 0.24]));
    let brierStack = 0;
    let hitsStack = 0;
    let upCount = 0;
    let evalCount = 0;

    // Helper: exponential causal Brier-pruned softmax weights
    const computeCausalWeights = (bMap, hasGbdt, hasPanel) => {
        const active = candidates.filter(c => (c !== 'gbdt' || hasGbdt) && (c !== 'panel' || hasPanel));
        const minB = Math.min(...active.map(c => bMap[c]));
        const raw = {};
        let sum = 0;
        for (const c of active) {
            const excess = Math.max(0, bMap[c] - minB);
            let w = Math.exp(-34 * excess);
            if (c === 'panel') w *= (1 - shrinkLocal * 0.35);
            raw[c] = w;
            sum += w;
        }
        const norm = Object.fromEntries(candidates.map(c => [c, 0]));
        for (const c of active) norm[c] = raw[c] / (sum || 1);
        return norm;
    };

    for (let i = evalStart; i < allX.length; i++) {
        const subX = allX.slice(0, i);
        const subY = allY.slice(0, i);
        const localRate = (subY.reduce((a, b) => a + b, 0) + 1.5) / (subY.length + 3);
        const logitFullM = fitLogisticL2(subX, subY, { lambda: 2.4 });
        const logitCompactM = fitLogisticL2(subX.map(compactSlice), subY, { lambda: 1.6 });
        const supplyM = fitLogisticL2(subX.map(supplySeasonalSlice), subY, { lambda: 2.6 });
        const gbdtM = subX.length >= 24 ? fitBoostedStumps(subX, subY) : null;

        const preds = {
            logitFull: logitFullM ? logitFullM.predictProba(allX[i]) : localRate,
            logitCompact: logitCompactM ? logitCompactM.predictProba(compactSlice(allX[i])) : localRate,
            supplySeasonal: supplyM ? supplyM.predictProba(supplySeasonalSlice(allX[i])) : localRate,
            gbdt: gbdtM ? gbdtM.predictProba(allX[i]) : localRate,
            panel: panelPrior ? panelPrior.predictProba(allX[i], localRate) : localRate,
            recency: predictRecencyBase(subY, allX[i]),
        };

        const w = computeCausalWeights(runBrier, Boolean(gbdtM), Boolean(panelPrior));
        let pStack = 0;
        for (const c of candidates) pStack += w[c] * preds[c];
        pStack = clamp(pStack, 0.08, 0.92);

        const y = allY[i];
        for (const c of candidates) {
            brierSums[c] += (preds[c] - y) ** 2;
            if ((preds[c] >= 0.5 ? 1 : 0) === y) hitSums[c] += 1;
        }
        brierStack += (pStack - y) ** 2;
        if ((pStack >= 0.5 ? 1 : 0) === y) hitsStack += 1;
        if (y === 1) upCount += 1;
        evalCount += 1;

        for (const c of candidates) runBrier[c] = brierSums[c] / evalCount;
    }

    if (evalCount < 3) {
        return { available: false, reason: 'Pocas ventanas walk-forward', marginZ: latestFeat.marginZ, feedImpPct: latestFeat.feedImpPct };
    }

    const avgBrier = Object.fromEntries(candidates.map(c => [c, brierSums[c] / evalCount]));
    const avgBS = brierStack / evalCount;

    const finalLocalRate = (allY.reduce((a, b) => a + b, 0) + 1.5) / (allY.length + 3);
    const finalLogitFull = fitLogisticL2(allX, allY, { lambda: 2.4 });
    const finalLogitCompact = fitLogisticL2(allX.map(compactSlice), allY, { lambda: 1.6 });
    const finalSupply = fitLogisticL2(allX.map(supplySeasonalSlice), allY, { lambda: 2.6 });
    const finalGbdt = allX.length >= 24 ? fitBoostedStumps(allX, allY) : null;

    const finalPreds = {
        logitFull: finalLogitFull ? finalLogitFull.predictProba(latestX) : finalLocalRate,
        logitCompact: finalLogitCompact ? finalLogitCompact.predictProba(compactSlice(latestX)) : finalLocalRate,
        supplySeasonal: finalSupply ? finalSupply.predictProba(supplySeasonalSlice(latestX)) : finalLocalRate,
        gbdt: finalGbdt ? finalGbdt.predictProba(latestX) : finalLocalRate,
        panel: panelPrior ? panelPrior.predictProba(latestX, finalLocalRate) : finalLocalRate,
        recency: predictRecencyBase(allY, latestX),
    };

    const finalW = computeCausalWeights(avgBrier, Boolean(finalGbdt), Boolean(panelPrior));
    let probUp = 0;
    for (const c of candidates) probUp += finalW[c] * finalPreds[c];
    probUp = clamp(probUp, 0.08, 0.92);

    // Combine exact Log-Odds + TreeSHAP attributions across all 6 Meta-Stack candidates using finalW
    const numFeats = latestX.length;
    const stackedContribs = Array(numFeats).fill(0);
    let stackedBase = 0;

    if (finalLogitFull && finalW.logitFull > 0) {
        const ex = finalLogitFull.explainLogOdds(latestX);
        stackedBase += finalW.logitFull * ex.baseLogOdds;
        for (let f = 0; f < numFeats; f++) stackedContribs[f] += finalW.logitFull * (ex.contribs[f] || 0);
    }
    if (finalLogitCompact && finalW.logitCompact > 0) {
        const ex = finalLogitCompact.explainLogOdds(compactSlice(latestX));
        const compactIdx = cadence === 'monthly'
            ? [1, 3, 4, 8, latestX[13] !== 0 ? 13 : 9]
            : [0, 1, 4, 8, latestX[13] !== 0 ? 13 : 9];
        stackedBase += finalW.logitCompact * ex.baseLogOdds;
        compactIdx.forEach((origIdx, pos) => { stackedContribs[origIdx] += finalW.logitCompact * (ex.contribs[pos] || 0); });
    }
    if (finalSupply && finalW.supplySeasonal > 0) {
        const ex = finalSupply.explainLogOdds(supplySeasonalSlice(latestX));
        const supIdx = [3, 6, 7, 8, 9, 10, 13, 14, 15, 16];
        stackedBase += finalW.supplySeasonal * ex.baseLogOdds;
        supIdx.forEach((origIdx, pos) => { stackedContribs[origIdx] += finalW.supplySeasonal * (ex.contribs[pos] || 0); });
    }
    if (finalGbdt && finalW.gbdt > 0) {
        const ex = finalGbdt.explainLogOdds(latestX);
        stackedBase += finalW.gbdt * ex.baseLogOdds;
        for (let f = 0; f < numFeats; f++) stackedContribs[f] += finalW.gbdt * (ex.contribs[f] || 0);
    }
    if (panelPrior && panelPrior.explainLogOdds && finalW.panel > 0) {
        const ex = panelPrior.explainLogOdds(latestX, finalLocalRate);
        stackedBase += finalW.panel * ex.baseLogOdds;
        for (let f = 0; f < numFeats; f++) stackedContribs[f] += finalW.panel * (ex.contribs[f] || 0);
    }
    if (finalW.recency > 0) {
        const nS = allY.length;
        let wSum = 0, ySum = 0;
        for (let k = 0; k < nS; k++) { const wt = Math.pow(0.955, nS - 1 - k); wSum += wt; ySum += wt * allY[k]; }
        const recRate = clamp((ySum + 1.2) / (wSum + 2.4), 0.18, 0.82);
        stackedBase += finalW.recency * Math.log(recRate / (1 - recRate));
        stackedContribs[1] += finalW.recency * latestX[1] * 1.3;
        stackedContribs[8] += finalW.recency * latestX[8] * 0.85;
        stackedContribs[13] += finalW.recency * latestX[13] * 1.1;
        stackedContribs[15] += finalW.recency * latestX[15] * 0.8;
        stackedContribs[4] += finalW.recency * (-latestX[4] * 0.12);
        stackedContribs[14] += finalW.recency * (-latestX[14] * 0.08);
    }

    const stackAcc = hitsStack / evalCount;
    const baseRate = Math.max(upCount / evalCount, 1 - upCount / evalCount);
    const climBrier = Math.max(0.05, (upCount / evalCount) * (1 - upCount / evalCount));

    const topSignals = finalGbdt && finalW.gbdt >= 0.15
        ? finalGbdt.featureImportances(PANEL_FEATURE_NAMES).slice(0, 4)
        : (finalLogitFull?.weights || []).slice(1).map((wt, idx) => ({
            feature: PANEL_FEATURE_NAMES[idx] || `f${idx}`,
            weight: round(wt, 3),
            absWeight: Math.abs(wt),
        })).sort((a, b) => b.absWeight - a.absWeight).slice(0, 4);

    return {
        available: true,
        mode: finalGbdt ? 'brier_pruned_v4_cot_supply_gbdt_stack' : 'brier_pruned_v4_cot_supply_stack',
        probUp: round(probUp, 4),
        probUpPct: round(probUp * 100, 1),
        probDownPct: round((1 - probUp) * 100, 1),
        directionalAccuracyPct: round(stackAcc * 100, 1),
        baselineAccuracyPct: round(baseRate * 100, 1),
        brierScore: round(avgBS, 4),
        brierSkillPct: round((1 - avgBS / climBrier) * 100, 1),
        evalWindows: evalCount,
        modelWeights: {
            logitFull: round(finalW.logitFull, 2),
            logitCompact: round(finalW.logitCompact, 2),
            supplySeasonal: round(finalW.supplySeasonal, 2),
            gbdt: round(finalW.gbdt, 2),
            panelPrior: round(finalW.panel, 2),
            recencyBase: round(finalW.recency, 2),
        },
        marginZ: latestFeat.marginZ,
        feedImpPct: latestFeat.feedImpPct,
        cotNetZ: latestFeat.cotNetZ ?? null,
        logOddsAttribution: { baseLogOdds: stackedBase, contribs: stackedContribs },
        topSignals,
    };
}

function computeSeriesRegime(points) {
    if (!points.length) return null;
    const values = points.map(p => p.value);
    const last = values.at(-1);
    const prev1 = values.at(-2) ?? last;
    const prev4 = values.at(-Math.min(5, values.length)) ?? values[0];
    const prev12 = values.at(-Math.min(13, values.length)) ?? values[0];

    const rets = [];
    for (let i = 1; i < values.length; i++) {
        if (values[i - 1] > 0) rets.push((values[i] - values[i - 1]) / values[i - 1]);
    }
    const winShort = Math.min(12, values.length);
    const avgShort = mean(values.slice(-winShort));
    const sdShort = stdDev(values.slice(-winShort), avgShort);
    const zScore = sdShort > 1e-9 ? (last - avgShort) / sdShort : 0;

    const volShort = stdDev(rets.slice(-Math.min(12, rets.length))) * 100;
    const volLong = stdDev(rets.slice(-Math.min(36, rets.length))) * 100;
    const volRatio = volLong > 1e-6 ? volShort / volLong : 1;

    const chg1Pct = prev1 > 0 ? ((last - prev1) / prev1) * 100 : 0;
    const chg4Pct = prev4 > 0 ? ((last - prev4) / prev4) * 100 : 0;
    const chg12Pct = prev12 > 0 ? ((last - prev12) / prev12) * 100 : 0;

    const volatilityRegime = volRatio >= 1.35
        ? 'Alta volatilidad / choque activo'
        : volRatio <= 0.78
            ? 'Baja volatilidad / compresión'
            : 'Volatilidad normal';

    const trendRegime = chg4Pct >= 3.0
        ? 'Tendencia alcista reciente'
        : chg4Pct <= -3.0
            ? 'Tendencia bajista reciente'
            : 'Rango lateral';

    return {
        lastValue: round(last, 4),
        change1Pct: round(chg1Pct, 2),
        change4Pct: round(chg4Pct, 2),
        change12Pct: round(chg12Pct, 2),
        zScore: round(zScore, 2),
        volatilityShortPct: round(volShort, 2),
        volatilityRatio: round(volRatio, 2),
        volatilityRegime,
        trendRegime,
    };
}

function classifyDirectionCoherent(probUpPct, expectedChangePct) {
    if (probUpPct >= 58) return 'ALZA';
    if (probUpPct <= 42) return 'BAJA';
    if (probUpPct >= 54 && expectedChangePct >= 0.8) return 'ALZA';
    if (probUpPct <= 46 && expectedChangePct <= -0.8) return 'BAJA';
    return 'LATERAL';
}

function chooseAdaptiveProfile(seriesDef, obsCount) {
    if (seriesDef.priceBasis === 'futures' && obsCount >= 100) return 'protein_futures';
    if (seriesDef.cadence === 'daily' && obsCount >= 80) return 'protein_daily';
    if (seriesDef.cadence !== 'daily' && obsCount >= 60) return 'protein_weekly';
    if (obsCount >= 50) return 'general';
    return null;
}

function extractPointForecast(res, isArx = false) {
    const f = res?.forecast;
    if (!f) return null;
    const val = Number(f.value ?? f.predictedValue);
    if (!Number.isFinite(val) || val <= 0) return null;
    const low80 = Number(f.conformal80?.lowerBound ?? f.low80 ?? f.lowerBound ?? f.low);
    const high80 = Number(f.conformal80?.upperBound ?? f.high80 ?? f.upperBound ?? f.high);
    const low90 = Number(f.conformal90?.lowerBound ?? f.low90 ?? low80);
    const high90 = Number(f.conformal90?.upperBound ?? f.high90 ?? high80);
    const imp = isArx
        ? Number(res?.evaluation?.improvementVsBaselinePct)
        : Number(res?.evaluation?.improvementPct);
    const cov80 = Number(f.conformal80?.empiricalCoveragePct ?? res?.evaluation?.conformal80CoveragePct);
    return {
        value: val,
        low80: Number.isFinite(low80) && low80 > 0 ? low80 : null,
        high80: Number.isFinite(high80) && high80 > 0 ? high80 : null,
        low90: Number.isFinite(low90) && low90 > 0 ? low90 : null,
        high90: Number.isFinite(high90) && high90 > 0 ? high90 : null,
        improvementPct: Number.isFinite(imp) ? imp : null,
        conformal80CoveragePct: Number.isFinite(cov80) ? cov80 : null,
    };
}

function forecastProteinSeries(seriesDef, exogenousPools = {}, { now = Date.now(), panelPrior = null, feedback = null } = {}) {
    const points = sanitizeSeries(seriesDef.points, now);
    if (points.length < 10) {
        return {
            symbol: seriesDef.symbol,
            label: seriesDef.label,
            species: seriesDef.species,
            region: seriesDef.region,
            country: seriesDef.country,
            unit: seriesDef.unit,
            cadence: seriesDef.cadence,
            source: seriesDef.source,
            observations: points.length,
            available: false,
            reason: `Serie insuficiente (${points.length} observaciones; mínimo 10).`,
        };
    }

    const enrichedExog = exogenousPools.FEED_INDEX
        ? exogenousPools
        : { ...exogenousPools, FEED_INDEX: buildCompositeFeedSeries(exogenousPools, now) };

    const last = points.at(-1);
    const first = points[0];
    const regime = computeSeriesRegime(points);
    const speciesMeta = SPECIES_META[seriesDef.species] || SPECIES_META.cerdo;
    const regionMeta = REGION_META[seriesDef.region] || REGION_META.GLOBAL;
    const feedLag = speciesMeta.feedLagSteps[seriesDef.cadence] || 4;

    const { selected: exogMap, primaryUpstream, cotKey, spreadKey, parityKey } = selectExogenousForSeries(seriesDef, enrichedExog);
    const { aligned, exogNames } = alignMultivariateSeries(points, exogMap, now);
    const effectiveAligned = aligned.length >= 14
        ? aligned
        : points.map(pt => {
            const month = Number(pt.date.slice(5, 7)) || 1;
            const angle = (2 * Math.PI * (month - 1)) / 12;
            return { date: pt.date, value: pt.value, exog: {}, prevExog: {}, sinMonth: Math.sin(angle), cosMonth: Math.cos(angle) };
        });
    const activeExogNames = aligned.length >= 14 ? exogNames : [];

    // Select top 4 non-redundant exogenous drivers for Ridge-ARX level forecaster
    const arxExogMap = {};
    for (const k of [primaryUpstream, 'FEED_INDEX', regionMeta.fxDriver, 'DIESEL', 'WTI', 'HE_F', 'LE_F'].filter(Boolean)) {
        if (exogMap[k] && Object.keys(arxExogMap).length < 4) arxExogMap[k] = exogMap[k];
    }

    const adaptiveProfileId = chooseAdaptiveProfile(seriesDef, points.length);
    const horizonsSpec = horizonsForCadence(seriesDef.cadence);
    const horizonForecasts = [];

    for (const hSpec of horizonsSpec) {
        if (points.length < hSpec.steps + 10) continue;

        // 1) Adaptive Univariate Forecaster (with valid profileId!)
        let adaptive = null;
        if (adaptiveProfileId) {
            try {
                adaptive = assessAdaptiveForecast(points, {
                    horizon: hSpec.steps,
                    profileId: adaptiveProfileId,
                    now,
                });
            } catch { adaptive = null; }
        }

        // 2) Multivariate Ridge-ARX Forecaster with Conformal P80/P90
        let arx = null;
        if (Object.keys(arxExogMap).length && effectiveAligned.length >= hSpec.steps + 18) {
            try {
                arx = assessMultivariateForecast(points, arxExogMap, {
                    horizon: hSpec.steps,
                    cadence: seriesDef.cadence,
                    now,
                });
            } catch { arx = null; }
        }

        // 3) Walk-Forward Brier-Pruned Meta-Stack (GBDT + L2-Logit + Compact Logit + Panel Transfer + Recency)
        const meta = runWalkForwardMetaStack(effectiveAligned, {
            horizonSteps: hSpec.steps,
            feedLag,
            cadence: seriesDef.cadence,
            fxDriver: regionMeta.fxDriver,
            fxInvert: regionMeta.fxInvert,
            upstreamKey: primaryUpstream,
            cotKey,
            spreadKey,
            parityKey,
            panelPrior,
        });

        const arxPt = arx?.eligible ? extractPointForecast(arx, true) : null;
        const arxAny = extractPointForecast(arx, true);
        const adapPt = adaptive?.eligible ? extractPointForecast(adaptive, false) : null;
        const adapAny = extractPointForecast(adaptive, false);

        let predictedValue = last.value;
        let low80 = null;
        let high80 = null;
        let low90 = null;
        let high90 = null;
        let modelUsed = 'damped_regime_panel';
        let maeImprovementPct = null;
        let conformal80CoveragePct = null;

        if (arxPt && adapPt) {
            const wArx = (arxPt.improvementPct ?? 0) >= (adapPt.improvementPct ?? 0) ? 0.65 : 0.45;
            predictedValue = wArx * arxPt.value + (1 - wArx) * adapPt.value;
            low80 = arxPt.low80 ?? adapPt.low80;
            high80 = arxPt.high80 ?? adapPt.high80;
            low90 = arxPt.low90 ?? adapPt.low90;
            high90 = arxPt.high90 ?? adapPt.high90;
            modelUsed = 'ridge_arx_adaptive_conformal';
            maeImprovementPct = round(Math.max(arxPt.improvementPct ?? 0, adapPt.improvementPct ?? 0), 2);
            conformal80CoveragePct = round(arxPt.conformal80CoveragePct, 1);
        } else if (arxPt) {
            predictedValue = arxPt.value;
            low80 = arxPt.low80;
            high80 = arxPt.high80;
            low90 = arxPt.low90;
            high90 = arxPt.high90;
            modelUsed = 'ridge_arx_conformal';
            maeImprovementPct = round(arxPt.improvementPct, 2);
            conformal80CoveragePct = round(arxPt.conformal80CoveragePct, 1);
        } else if (adapPt) {
            predictedValue = adapPt.value;
            low80 = adapPt.low80;
            high80 = adapPt.high80;
            low90 = adapPt.low90;
            high90 = adapPt.high90;
            modelUsed = `adaptive_${adaptive.selectedStrategy || 'ensemble'}`;
            maeImprovementPct = round(adapPt.improvementPct, 2);
        } else if (arxAny || adapAny) {
            const src = arxAny || adapAny;
            // Cautious shrinkage toward last observed level when neither beats random-walk MAE cleanly
            predictedValue = 0.55 * src.value + 0.45 * last.value;
            low80 = src.low80;
            high80 = src.high80;
            low90 = src.low90;
            high90 = src.high90;
            modelUsed = arxAny ? 'ridge_arx_cautious_conformal' : 'adaptive_cautious';
            maeImprovementPct = null;
            conformal80CoveragePct = round(src.conformal80CoveragePct, 1);
        } else {
            const recentChg = clamp((regime?.change4Pct || 0) / 100, -0.07, 0.07) * 0.3;
            predictedValue = last.value * (1 + recentChg);
            const band = Math.max(0.025, ((regime?.volatilityShortPct || 3) / 100) * Math.sqrt(hSpec.steps) * 1.15);
            low80 = predictedValue * (1 - band);
            high80 = predictedValue * (1 + band);
            low90 = predictedValue * (1 - band * 1.35);
            high90 = predictedValue * (1 + band * 1.35);
        }

        predictedValue = clamp(predictedValue, last.value * 0.68, last.value * 1.42);
        let expectedChangePct = ((predictedValue - last.value) / last.value) * 100;

        // Combine Brier-Pruned Meta-Stack probability with continuous ARX/Adaptive Z-signal
        const volScale = Math.max(1.2, (regime?.volatilityShortPct || 2.5) * Math.sqrt(Math.min(6, hSpec.steps)));
        const continuousProbUp = sigmoid((expectedChangePct / volScale) * 1.2) * 100;
        let probUpPct = continuousProbUp;
        if (meta.available) {
            const wMeta = meta.directionalAccuracyPct >= 62 ? 0.82 : meta.directionalAccuracyPct >= 54 ? 0.7 : 0.56;
            probUpPct = wMeta * meta.probUpPct + (1 - wMeta) * continuousProbUp;
        }
        probUpPct = round(clamp(probUpPct, 10, 90), 1);
        // Closed-loop real-world probability calibration when live realized Brier was noisy
        const liveShrink = Number(feedback?.calibration?.probShrinkage || 0);
        if (liveShrink > 0 && liveShrink <= 0.3) {
            probUpPct = round(clamp(50 + (probUpPct - 50) * (1 - liveShrink), 12, 88), 1);
        }
        const probDownPct = round(100 - probUpPct, 1);
        const direction = classifyDirectionCoherent(probUpPct, expectedChangePct);

        if (direction === 'BAJA' && expectedChangePct > 0 && expectedChangePct < 0.8 && probUpPct <= 38) {
            const tilt = -Math.min(1.2, ((50 - probUpPct) / 50) * (regime?.volatilityShortPct || 1.5) * 0.45);
            expectedChangePct = tilt;
            predictedValue = last.value * (1 + tilt / 100);
        } else if (direction === 'ALZA' && expectedChangePct < 0 && expectedChangePct > -0.8 && probUpPct >= 62) {
            const tilt = Math.min(1.2, ((probUpPct - 50) / 50) * (regime?.volatilityShortPct || 1.5) * 0.45);
            expectedChangePct = tilt;
            predictedValue = last.value * (1 + tilt / 100);
        }

        const dirAcc = meta.available ? meta.directionalAccuracyPct : (adaptive?.evaluation?.directionAccuracyPct ?? null);
        const brierSkill = meta.available ? meta.brierSkillPct : null;
        const confidence = (points.length >= 35 && dirAcc != null && dirAcc >= 62 && (brierSkill == null || brierSkill >= -4))
            ? 'Alta'
            : (points.length >= 16 && (dirAcc == null || dirAcc >= 54) ? 'Media' : 'Cautela');

        const marginState = meta.marginZ != null
            ? (meta.marginZ <= -1.0 ? 'Margen comprimido vs ración (presión alcista futura)'
                : meta.marginZ >= 1.0 ? 'Margen holgado vs ración (incentivo de oferta)'
                    : 'Margen equilibrado vs ración')
            : null;

        const liveBandScale = clamp(Number(feedback?.calibration?.bandScale || 1), 0.9, 1.35);
        const baseLow80 = Number.isFinite(low80) && low80 > 0 ? Math.min(low80, predictedValue * 0.995) : predictedValue * 0.95;
        const baseHigh80 = Number.isFinite(high80) && high80 > 0 ? Math.max(high80, predictedValue * 1.005) : predictedValue * 1.05;
        const safeLow80 = predictedValue - (predictedValue - baseLow80) * liveBandScale;
        const safeHigh80 = predictedValue + (baseHigh80 - predictedValue) * liveBandScale;
        const baseLow90 = Number.isFinite(low90) && low90 > 0 ? Math.min(low90, baseLow80) : baseLow80 * 0.97;
        const baseHigh90 = Number.isFinite(high90) && high90 > 0 ? Math.max(high90, baseHigh80) : baseHigh80 * 1.03;
        const safeLow90 = predictedValue - (predictedValue - baseLow90) * liveBandScale;
        const safeHigh90 = predictedValue + (baseHigh90 - predictedValue) * liveBandScale;

        const explainability = buildCausalExplanation({
            featureContribs: meta.logOddsAttribution?.contribs || [],
            baseLogOdds: meta.logOddsAttribution?.baseLogOdds ?? Math.log(clamp(probUpPct / 100, 0.1, 0.9) / (1 - clamp(probUpPct / 100, 0.1, 0.9))),
            probUpPct,
            direction,
        });

        horizonForecasts.push({
            code: hSpec.code,
            horizonLabel: hSpec.label,
            steps: hSpec.steps,
            direction,
            probUpPct,
            probDownPct,
            expectedChangePct: round(expectedChangePct, 2),
            projectedValue: round(predictedValue, 4),
            low80: round(Math.max(0.01, safeLow80), 4),
            high80: round(safeHigh80, 4),
            low90: round(Math.max(0.01, safeLow90), 4),
            high90: round(safeHigh90, 4),
            modelUsed,
            stackMode: meta.mode || 'continuous_only',
            modelWeights: meta.modelWeights || null,
            confidence,
            feedMarginZScore: meta.marginZ ?? null,
            feedMarginState: marginState,
            explainability,
            validation: {
                walkForwardDirectionalAccuracyPct: dirAcc,
                baselineAccuracyPct: meta.available ? meta.baselineAccuracyPct : null,
                brierScore: meta.available ? meta.brierScore : null,
                brierSkillPct: brierSkill,
                maeImprovementPct,
                conformal80CoveragePct,
                evalWindows: meta.available ? meta.evalWindows : (adaptive?.evaluation?.windows || null),
            },
            drivers: (meta.topSignals?.length ? meta.topSignals : arx?.drivers || []).slice(0, 4),
        });
    }

    let anomaly = null;
    try {
        const res = analyzeMarketAnomalies({ [seriesDef.symbol]: points });
        anomaly = res?.assets?.[seriesDef.symbol] || null;
    } catch { anomaly = null; }

    const primary = horizonForecasts.find(h => h.code === '1m') || horizonForecasts[0] || null;

    return {
        symbol: seriesDef.symbol,
        label: seriesDef.label,
        species: seriesDef.species,
        speciesLabel: speciesMeta.label,
        region: seriesDef.region,
        regionLabel: regionMeta.label,
        country: seriesDef.country,
        market: seriesDef.market || seriesDef.country,
        unit: seriesDef.unit,
        currency: seriesDef.currency || '',
        cadence: seriesDef.cadence,
        basis: seriesDef.basis || '',
        source: seriesDef.source,
        sourceUrl: seriesDef.url || null,
        available: Boolean(primary),
        observations: points.length,
        dateRange: { start: first.date, end: last.date },
        lastDate: last.date,
        lastValue: round(last.value, 4),
        exogenousDriversUsed: activeExogNames,
        primaryUpstreamLead: primaryUpstream,
        regime,
        anomaly: anomaly ? {
            status: anomaly.status || 'normal',
            isAnomaly: Boolean(anomaly.isAnomaly),
            madZScore: round(anomaly.madZScore, 2),
            regimeShift: Boolean(anomaly.regimeShift),
            summary: anomaly.summary || null,
        } : null,
        primaryForecast: primary,
        horizons: horizonForecasts,
        closedLoopFeedback: feedback ? {
            evaluations: feedback.evaluations,
            directionalHitRatePct: feedback.directionalHitRatePct,
            conformal80CoveragePct: feedback.conformal80CoveragePct,
            avgMapePct: feedback.avgMapePct,
            calibration: feedback.calibration,
        } : null,
    };
}

function buildSpeciesRegionSummary(seriesResults = []) {
    const valid = seriesResults.filter(s => s.available && s.primaryForecast);
    const bySpecies = {};
    const byRegion = {};
    const matrix = {};

    const summarizeGroup = items => {
        if (!items.length) return null;
        const avgProbUp = round(mean(items.map(i => i.primaryForecast.probUpPct)), 1);
        const avgChangePct = round(mean(items.map(i => i.primaryForecast.expectedChangePct)), 2);
        const alza = items.filter(i => i.primaryForecast.direction === 'ALZA').length;
        const baja = items.filter(i => i.primaryForecast.direction === 'BAJA').length;
        const lateral = items.filter(i => i.primaryForecast.direction === 'LATERAL').length;
        const accs = items.map(i => i.primaryForecast.validation?.walkForwardDirectionalAccuracyPct).filter(Number.isFinite);
        const briers = items.map(i => i.primaryForecast.validation?.brierScore).filter(Number.isFinite);
        const consensus = classifyDirectionCoherent(avgProbUp, avgChangePct);
        return {
            seriesCount: items.length,
            consensusDirection: consensus,
            avgProbUpPct: avgProbUp,
            avgProbDownPct: round(100 - avgProbUp, 1),
            avgExpectedChangePct: avgChangePct,
            avgDirectionalAccuracyPct: accs.length ? round(mean(accs), 1) : null,
            avgBrierScore: briers.length ? round(mean(briers), 4) : null,
            counts: { alza, baja, lateral },
            topDrivers: [...new Set(items.flatMap(i => i.exogenousDriversUsed || []))].slice(0, 5),
        };
    };

    for (const sp of Object.keys(SPECIES_META)) {
        bySpecies[sp] = {
            ...SPECIES_META[sp],
            ...(summarizeGroup(valid.filter(s => s.species === sp)) || { seriesCount: 0, consensusDirection: 'SIN_DATOS' }),
        };
        matrix[sp] = {};
        for (const reg of Object.keys(REGION_META)) {
            matrix[sp][reg] = summarizeGroup(valid.filter(s => s.species === sp && s.region === reg));
        }
    }

    for (const reg of Object.keys(REGION_META)) {
        byRegion[reg] = {
            ...REGION_META[reg],
            ...(summarizeGroup(valid.filter(s => s.region === reg)) || { seriesCount: 0, consensusDirection: 'SIN_DATOS' }),
        };
    }

    return { bySpecies, byRegion, matrix };
}

function computeProteinTransmissionMatrix(seriesCatalog = [], exogenousPools = {}) {
    const namedSeries = {};
    for (const [k, pts] of Object.entries(exogenousPools)) {
        if (Array.isArray(pts) && pts.length >= 25) namedSeries[k] = pts;
    }
    const anchorIds = [
        'HE=F', 'LE=F', 'GF=F', 'US-AMS-PORK', 'US-AMS-BEEF',
        'GLOBAL-IMF-PORK', 'GLOBAL-IMF-BEEF', 'GLOBAL-IMF-POULTRY',
        'EU-DGAGRI-PORK-ES', 'EU-DGAGRI-POULTRY-FR', 'EU-DGAGRI-EGG-ES',
        'MX-SNIIM-CERDO', 'MX-SNIIM-RES', 'MX-SNIIM-POLLO', 'MX-SNIIM-HUEVO',
    ];
    for (const s of seriesCatalog) {
        if (anchorIds.some(prefix => String(s.symbol).startsWith(prefix)) && Array.isArray(s.points) && s.points.length >= 20) {
            namedSeries[s.symbol] = s.points;
        }
    }
    try {
        return estimateCrossAssetElasticities(namedSeries);
    } catch {
        return { pairs: [], matrix: {} };
    }
}

// ── Motor de Paridad de Importación y Arbitraje Internacional (→ México MXN/kg)
function computeImportParityDashboard(seriesCatalog = [], enrichedExog = {}, now = Date.now()) {
    const usdMxnPts = sanitizeSeries(enrichedExog.USDMXN || [], now);
    const usdBrlPts = sanitizeSeries(enrichedExog.USDBRL || [], now);
    const eurUsdPts = sanitizeSeries(enrichedExog.EURUSD || [], now);

    const usdMxn = usdMxnPts.at(-1)?.value || null;
    const usdBrl = usdBrlPts.at(-1)?.value || null;
    const eurUsd = eurUsdPts.at(-1)?.value || null;
    if (!usdMxn) return null;

    const brlMxn = usdBrl > 0 ? usdMxn / usdBrl : null;
    const eurMxn = eurUsd > 0 ? eurUsd * usdMxn : null;
    const fxRates = {
        usdMxn: round(usdMxn, 4),
        usdMxnDate: usdMxnPts.at(-1)?.date || null,
        brlMxn: brlMxn ? round(brlMxn, 4) : null,
        eurMxn: eurMxn ? round(eurMxn, 4) : null,
    };

    const bySym = new Map();
    for (const s of seriesCatalog) {
        const pts = sanitizeSeries(s.points || [], now);
        if (pts.length) bySym.set(s.symbol, { ...s, last: pts.at(-1) });
    }

    const findBestMx = species => {
        const sniim = [...bySym.values()]
            .filter(s => s.region === 'MX' && s.species === species && s.currency === 'MXN' && String(s.symbol).startsWith('MX-SNIIM-'))
            .filter(s => Number.isFinite(s.last?.value) && s.last.value > 0);
        const pool = sniim.length
            ? sniim
            : [...bySym.values()].filter(s => s.region === 'MX' && s.species === species && s.currency === 'MXN' && !String(s.unit || '').toLowerCase().includes('vivo'));
        if (!pool.length) return null;
        const vals = pool.map(s => s.last.value).sort((a, b) => a - b);
        const mid = Math.floor(vals.length / 2);
        const med = vals.length % 2 === 1 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
        const latestDate = pool.map(s => s.last.date).sort().at(-1);
        return {
            symbol: `MX-SNIIM-MEDIAN-${species.toUpperCase()}`,
            label: `Mediana Nacional SNIIM (${pool.length} plazas · ${SPECIES_META[species]?.label || species})`,
            source: 'SNIIM Economía MX',
            plazasCount: pool.length,
            minMxnKg: round(vals[0], 2),
            maxMxnKg: round(vals.at(-1), 2),
            last: { value: med, date: latestDate },
        };
    };

    // Transparent logistics reference add-ons in USD/kg (explicitly flagged as reference, not firm customs quote)
    const FREIGHT_USD_KG = { US: 0.18, BR: 0.34, EU: 0.38 };

    const toMxnKg = (entry, originType) => {
        if (!entry?.last?.value) return null;
        const v = entry.last.value;
        const u = String(entry.unit || '').toLowerCase();
        let fobMxnKg = null;
        let convNote = '';

        if (u.includes('usd/100 lb')) {
            fobMxnKg = (v / 45.359237) * usdMxn;
            convNote = 'USD/100 lb ÷ 45.359 kg × USD/MXN';
        } else if (u.includes('us¢/lb') || u.includes('cusd/lb')) {
            fobMxnKg = (v / 100 / 0.45359237) * usdMxn;
            convNote = 'US¢/lb ÷ 100 ÷ 0.4536 kg × USD/MXN';
        } else if (u.includes('usd/lb')) {
            fobMxnKg = (v / 0.45359237) * usdMxn;
            convNote = 'USD/lb ÷ 0.4536 kg × USD/MXN';
        } else if (u.includes('usd/docena')) {
            fobMxnKg = (v / 0.72) * usdMxn;
            convNote = 'USD/docena ÷ 0.72 kg aprox. × USD/MXN';
        } else if (u.includes('eur/100 kg') && eurMxn) {
            fobMxnKg = (v / 100) * eurMxn;
            convNote = 'EUR/100 kg ÷ 100 × EUR/MXN';
        } else if (u.includes('brl/kg') && brlMxn) {
            fobMxnKg = v * brlMxn;
            convNote = 'BRL/kg × BRL/MXN';
        } else if (u.includes('arroba') && brlMxn) {
            fobMxnKg = (v / 15) * brlMxn;
            convNote = 'BRL/arroba (15 kg) ÷ 15 × BRL/MXN';
        }
        if (!Number.isFinite(fobMxnKg) || fobMxnKg <= 0) return null;
        const freightMxnKg = (FREIGHT_USD_KG[originType] || 0.25) * usdMxn;
        const landedMxnKg = fobMxnKg + freightMxnKg;
        return {
            symbol: entry.symbol,
            label: entry.label,
            originCountry: entry.country,
            originType,
            rawPrice: round(v, 2),
            rawUnit: entry.unit,
            observedAt: entry.last.date,
            fobMxnKg: round(fobMxnKg, 2),
            freightRefMxnKg: round(freightMxnKg, 2),
            landedMxnKg: round(landedMxnKg, 2),
            conversionFormula: convNote,
        };
    };

    const speciesOrigins = {
        cerdo: [
            { sym: 'US-AMS-PORK-CUTOUT', origin: 'US' },
            { sym: 'HE=F', origin: 'US' },
            { sym: 'MERCO-BR-SP-CARCASS', origin: 'BR' },
            { sym: 'EU-DGAGRI-PORK-ES', origin: 'EU' },
        ],
        res: [
            { sym: 'US-AMS-BEEF-CHOICE', origin: 'US' },
            { sym: 'US-AMS-BEEF-SELECT', origin: 'US' },
            { sym: 'MERCO-BR-CEPEA-BEEF', origin: 'BR' },
            { sym: 'EU-DGAGRI-BEEF-ES', origin: 'EU' },
        ],
        pollo: [
            { sym: 'GLOBAL-IMF-POULTRY', origin: 'US' },
            { sym: 'CEPEA-181', origin: 'BR' },
            { sym: 'EU-DGAGRI-POULTRY-ES', origin: 'EU' },
        ],
        huevo: [
            { sym: 'US-BLS-EGGS-RETAIL', origin: 'US' },
            { sym: 'EU-DGAGRI-EGG-ES', origin: 'EU' },
        ],
    };

    const bySpecies = {};
    for (const [sp, origList] of Object.entries(speciesOrigins)) {
        const mx = findBestMx(sp);
        if (!mx) continue;
        const mxPrice = round(mx.last.value, 2);
        const comparisons = origList
            .map(({ sym, origin }) => toMxnKg(bySym.get(sym), origin))
            .filter(Boolean)
            .map(comp => {
                const spreadMxnKg = round(mxPrice - comp.landedMxnKg, 2);
                const spreadPct = round(((mxPrice - comp.landedMxnKg) / comp.landedMxnKg) * 100, 1);
                const signal = spreadPct >= 12
                    ? 'TECHO_IMPORTACION'
                    : spreadPct <= -12
                        ? 'DESCUENTO_MX'
                        : 'EQUILIBRIO';
                return { ...comp, spreadMxnKg, spreadPct, signal };
            });

        const primaryComp = comparisons[0] || null;
        bySpecies[sp] = {
            species: sp,
            speciesLabel: SPECIES_META[sp]?.label || sp,
            mexicoBenchmark: {
                symbol: mx.symbol,
                label: mx.label,
                priceMxnKg: mxPrice,
                plazasCount: mx.plazasCount || 1,
                minMxnKg: mx.minMxnKg ?? mxPrice,
                maxMxnKg: mx.maxMxnKg ?? mxPrice,
                observedAt: mx.last.date,
                source: mx.source,
            },
            primaryParity: primaryComp,
            origins: comparisons,
        };
    }

    return {
        generatedAt: new Date(now).toISOString(),
        fxRates,
        freightAssumptionsUsdKg: FREIGHT_USD_KG,
        disclaimer: 'Paridad calculada con tipos de cambio oficiales y referencia logística de internación (no es cotización aduanal ni arancelaria en firme).',
        bySpecies,
    };
}

function applyNlpOverlayToForecast(item, nlpEvents) {
    if (!item?.available || !nlpEvents) return item;
    const overlay = computeNlpEventOverlay(nlpEvents, item.species, item.region);
    if (!overlay || Math.abs(overlay.probDeltaPts) < 0.3) return item;

    const patchHorizon = h => {
        if (!h) return h;
        const baseProb = Number(h.probUpPct);
        if (!Number.isFinite(baseProb)) return h;
        const nextProb = round(clamp(baseProb + overlay.probDeltaPts, 12, 88), 1);
        const appliedDelta = round(nextProb - baseProb, 1);
        if (Math.abs(appliedDelta) < 0.1) return h;
        const nextDown = round(100 - nextProb, 1);
        const nextDir = nextProb >= 55 ? 'ALZA' : nextProb <= 45 ? 'BAJA' : 'LATERAL';

        let explainability = h.explainability;
        if (explainability && Array.isArray(explainability.factors)) {
            const nlpFactor = {
                id: 'nlp_sanitary_trade',
                label: 'Eventos Sanitarios / Comercio (NLP)',
                impactPctPts: appliedDelta,
                direction: appliedDelta >= 0 ? 'ALZA' : 'BAJA',
                headline: overlay.leadHeadline?.title || null,
            };
            const factors = [...explainability.factors.filter(f => f.id !== 'nlp_sanitary_trade'), nlpFactor]
                .sort((a, b) => Math.abs(b.impactPctPts) - Math.abs(a.impactPctPts));
            const topPos = factors.filter(f => f.impactPctPts > 0.4).slice(0, 2);
            const topNeg = factors.filter(f => f.impactPctPts < -0.4).slice(0, 2);
            const posTxt = topPos.length ? `impulsado al alza por ${topPos.map(f => `${f.label.toLowerCase()} (+${f.impactPctPts} pts)`).join(' y ')}` : '';
            const negTxt = topNeg.length ? `presionado a la baja por ${topNeg.map(f => `${f.label.toLowerCase()} (${f.impactPctPts} pts)`).join(' y ')}` : '';
            const narrative = posTxt && negTxt
                ? `Probabilidad de subida ${nextProb}% (base neutra 50%): ${posTxt}, contrarrestado por ${negTxt}.`
                : posTxt
                    ? `Probabilidad de subida ${nextProb}% (base neutra 50%): ${posTxt}.`
                    : negTxt
                        ? `Probabilidad de subida ${nextProb}% (base neutra 50%): ${negTxt}.`
                        : explainability.narrative;
            explainability = {
                ...explainability,
                finalProbUpPct: nextProb,
                netDeltaPts: round(nextProb - 50, 1),
                narrative,
                factors,
            };
        }

        return {
            ...h,
            probUpPct: nextProb,
            probDownPct: nextDown,
            direction: nextDir,
            nlpOverlay: { ...overlay, appliedDeltaPts: appliedDelta },
            explainability,
        };
    };

    const horizons = Array.isArray(item.horizons) ? item.horizons.map(patchHorizon) : item.horizons;
    const primaryCode = item.primaryForecast?.code;
    const primaryForecast = (Array.isArray(horizons) && primaryCode && horizons.find(h => h.code === primaryCode))
        || patchHorizon(item.primaryForecast);
    return {
        ...item,
        nlpRisk: overlay,
        primaryForecast,
        horizons,
    };
}

function buildProteinMLReport({ seriesCatalog = [], exogenousPools = {}, ingestionStats = {}, closedLoopFeedback = null, nlpEvents = null, now = Date.now() } = {}) {
    const feedComposite = buildCompositeFeedSeries(exogenousPools, now);
    const enrichedExog = {
        ...exogenousPools,
        ...(feedComposite.length >= 15 ? { FEED_INDEX: feedComposite } : {}),
    };

    // Promote upstream wholesale/cutout series from seriesCatalog into exogenousPools so downstream retail/local models can learn supply-chain pass-through!
    const upstreamPromotions = [
        ['US-AMS-PORK-CUTOUT', 'AMS_PORK'],
        ['US-AMS-BEEF-CHOICE', 'AMS_BEEF'],
        ['US-PPI-PORK-WHOLESALE', 'US_PPI_PORK'],
        ['US-PPI-BEEF-WHOLESALE', 'US_PPI_BEEF'],
        ['US-PPI-POULTRY-WHOLESALE', 'US_PPI_POULTRY'],
        ['US-PPI-EGGS-FARM', 'US_PPI_EGGS'],
    ];
    for (const [sym, alias] of upstreamPromotions) {
        if (!enrichedExog[alias]) {
            const hit = seriesCatalog.find(s => s.symbol === sym);
            if (hit?.points?.length >= 20) enrichedExog[alias] = sanitizeSeries(hit.points, now);
        }
    }

    // Build historical MXN/kg Import Parity series to feed directly into Mexican MARRANAS models!
    const usdMxn = enrichedExog.USDMXN || [];
    const globalPoultry = seriesCatalog.find(s => s.symbol === 'GLOBAL-IMF-POULTRY')?.points || [];
    const usEggs = seriesCatalog.find(s => s.symbol === 'US-BLS-EGGS-RETAIL')?.points || [];
    const paritySpecs = [
        ['PARITY_PORK_MXN', enrichedExog.AMS_PORK || enrichedExog.HE_F, enrichedExog.AMS_PORK ? 45.359237 : 45.359237],
        ['PARITY_BEEF_MXN', enrichedExog.AMS_BEEF || enrichedExog.LE_F, 45.359237],
        ['PARITY_POULTRY_MXN', globalPoultry, 45.359237],
        ['PARITY_EGG_MXN', usEggs, 0.72],
    ];
    for (const [key, bmPts, div] of paritySpecs) {
        const ser = buildImportParitySeries(bmPts, usdMxn, div, now);
        if (ser.length >= 12) enrichedExog[key] = ser;
    }

    const importParity = computeImportParityDashboard(seriesCatalog, enrichedExog, now);

    const panelPriors = buildSpeciesPanelPriors(seriesCatalog, enrichedExog, now);

    const activeNlpEvents = nlpEvents || loadCachedNlpEvents() || null;

    const fbBySym = closedLoopFeedback?.feedbackBySymbol || {};
    const fbBySp = closedLoopFeedback?.bySpecies || {};
    const results = seriesCatalog.map(def => {
        const raw = forecastProteinSeries(def, enrichedExog, {
            now,
            panelPrior: panelPriors[def.species] || null,
            feedback: fbBySym[def.symbol] || fbBySp[def.species] || null,
        });
        return applyNlpOverlayToForecast(raw, activeNlpEvents);
    });
    const valid = results.filter(r => r.available);
    const summary = buildSpeciesRegionSummary(results);
    const transmission = computeProteinTransmissionMatrix(seriesCatalog, enrichedExog);

    const accs = valid.map(r => r.primaryForecast?.validation?.walkForwardDirectionalAccuracyPct).filter(Number.isFinite);
    const briers = valid.map(r => r.primaryForecast?.validation?.brierScore).filter(Number.isFinite);
    const maeImps = valid.map(r => r.primaryForecast?.validation?.maeImprovementPct).filter(Number.isFinite);
    const conformalModels = valid.filter(r => String(r.primaryForecast?.modelUsed || '').includes('conformal') || String(r.primaryForecast?.modelUsed || '').includes('adaptive')).length;
    const totalObservations = seriesCatalog.reduce((sum, s) => sum + (s.points?.length || 0), 0);

    return {
        model: PROTEIN_ML_BRAND,
        displayName: 'MARRANAS · Motor ML de Proteínas',
        version: PROTEIN_ML_VERSION,
        generatedAt: new Date(now).toISOString(),
        stats: {
            totalSeriesEvaluated: seriesCatalog.length,
            activeModels: valid.length,
            conformalAndAdaptiveModels: conformalModels,
            totalObservationsIngested: totalObservations,
            exogenousDriverSeries: Object.keys(enrichedExog).length,
            avgWalkForwardDirectionalAccuracyPct: accs.length ? round(mean(accs), 1) : null,
            avgBrierScore: briers.length ? round(mean(briers), 4) : null,
            avgMaeImprovementPct: maeImps.length ? round(mean(maeImps), 2) : null,
            speciesPanelSamples: Object.fromEntries(Object.entries(panelPriors).map(([k, v]) => [k, v.sampleSize])),
            speciesCovered: Object.keys(SPECIES_META).filter(sp => (summary.bySpecies[sp]?.seriesCount || 0) > 0),
            regionsCovered: Object.keys(REGION_META).filter(reg => (summary.byRegion[reg]?.seriesCount || 0) > 0),
            ingestion: ingestionStats,
            closedLoopAudit: closedLoopFeedback?.summary || null,
            nlpEventsStats: activeNlpEvents?.stats || null,
        },
        summary,
        importParity,
        nlpEvents: activeNlpEvents,
        transmission: {
            topElasticities: (transmission?.pairs || []).slice(0, 20),
        },
        forecasts: results,
    };
}

function saveProteinMLArtifact(artifact, filePath = PROTEIN_ML_CACHE_FILE) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2), 'utf8');
    return filePath;
}

let cachedArtifact = null;
let cachedMtime = 0;

function loadCachedProteinML(filePath = PROTEIN_ML_CACHE_FILE) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const stat = fs.statSync(filePath);
        if (cachedArtifact && stat.mtimeMs === cachedMtime) return cachedArtifact;
        cachedArtifact = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        cachedMtime = stat.mtimeMs;
        return cachedArtifact;
    } catch {
        return null;
    }
}

function getProteinMLContextForQuery(queryText = '', { stripNumbers = false, limit = 8 } = {}) {
    const artifact = loadCachedProteinML();
    if (!artifact || !Array.isArray(artifact.forecasts) || !artifact.forecasts.length) return '';

    const q = foldText(queryText);
    const isProteinQuery = /marrana|paridad|importaci|arbitraje|h5n1|influenza aviar|gripe aviar|peste porcina|barrenador|screwworm|sanidad|brote|senasica|protein|cerdo|porcin|pork|hog|res|bovin|vacun|beef|cattle|pollo|avicol|chicken|broiler|huevo|egg|carne|pecuar|rastro|sniim|mercolleida|cepea|dg agri|usda|canal|granja/.test(q);
    if (!isProteinQuery) return '';

    const wantedSpecies = [];
    if (/cerdo|porcin|pork|hog|lechon/.test(q)) wantedSpecies.push('cerdo');
    if (/\bres\b|bovin|vacun|beef|cattle|novill|toro|ternera|ganado/.test(q)) wantedSpecies.push('res');
    if (/pollo|avicol|chicken|broiler|pechuga|frango/.test(q)) wantedSpecies.push('pollo');
    if (/huevo|egg|postura/.test(q)) wantedSpecies.push('huevo');

    const wantedRegions = [];
    if (/mexico|mx|sniim|jalisco|sonora|cdmx|aguascalientes|puebla|nuevo leon|monterrey|guadalajara/.test(q)) wantedRegions.push('MX');
    if (/ee\.\s*uu|estados unidos|usa|\bus\b|usda|cme|chicago|midwest/.test(q)) wantedRegions.push('US');
    if (/europa|\beu\b|\bue\b|espana|alemania|francia|polonia|holanda|paises bajos|italia|dinamarca|mercolleida|dg agri|rnm/.test(q)) wantedRegions.push('EU');
    if (/latinoamerica|latam|brasil|cepea|chile|odepa|argentina|canuelas|colombia|dane|peru|midagri|sudamerica/.test(q)) wantedRegions.push('LATAM');
    if (/global|mundo|mundial|internacional|china|dalian|canada|quebec|fao|fmi/.test(q)) wantedRegions.push('GLOBAL');

    let pool = artifact.forecasts.filter(f => f.available && f.primaryForecast);
    if (wantedSpecies.length) pool = pool.filter(f => wantedSpecies.includes(f.species));
    if (wantedRegions.length) {
        const regFiltered = pool.filter(f => wantedRegions.includes(f.region));
        if (regFiltered.length) pool = regFiltered;
    }

    const scoreItem = item => {
        let s = Math.min(40, (item.observations || 0) / 6);
        if (item.primaryForecast.confidence === 'Alta') s += 16;
        else if (item.primaryForecast.confidence === 'Media') s += 8;
        if (item.region === 'MX') s += 6;
        if ((item.primaryForecast.validation?.walkForwardDirectionalAccuracyPct || 0) >= 65) s += 8;
        return s;
    };
    const sorted = [...pool].sort((a, b) => scoreItem(b) - scoreItem(a));

    const picked = [];
    const seenBucket = new Map();
    for (const item of sorted) {
        const bucket = `${item.species}:${item.region}`;
        const count = seenBucket.get(bucket) || 0;
        if (count >= 2 && sorted.length > limit) continue;
        seenBucket.set(bucket, count + 1);
        picked.push(item);
        if (picked.length >= limit) break;
    }
    if (!picked.length) return '';

    if (stripNumbers) {
        const cleanQual = txt => String(txt || '')
            .replace(/H5N1/gi, 'influenza aviar')
            .replace(/\d+(?:[.,–-]\d+)?%?/g, '')
            .replace(/\(\s*\)/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
        const lines = [
            'MARRANAS · RADAR ML ESPECIALIZADO EN PROTEÍNAS (SEÑALES CUALITATIVAS DE DIRECCIÓN, MARGEN RACIÓN Y RÉGIMEN, SIN CIFRAS AJENAS):',
        ];
        for (const sp of (wantedSpecies.length ? wantedSpecies : Object.keys(SPECIES_META))) {
            const sum = artifact.summary?.bySpecies?.[sp];
            if (!sum || !sum.seriesCount) continue;
            const bias = sum.consensusDirection === 'ALZA'
                ? 'sesgo alcista condicional'
                : sum.consensusDirection === 'BAJA'
                    ? 'sesgo bajista condicional'
                    : 'equilibrio lateral con vigilancia';
            lines.push(cleanQual(`- ${sum.label}: consenso global de ${bias}; ciclo biológico activo; impulsores dominantes: ${(sum.topDrivers || []).join(', ') || 'insumos, flete y estacionalidad'}.`));
        }
        if (artifact.importParity?.bySpecies && /paridad|importaci|arbitraje|mexico|mx|ee\.\s*uu|brasil|europa|frontera/.test(q)) {
            for (const sp of (wantedSpecies.length ? wantedSpecies : Object.keys(SPECIES_META))) {
                const pSp = artifact.importParity.bySpecies[sp];
                if (!pSp?.primaryParity) continue;
                const sigTxt = pSp.primaryParity.signal === 'TECHO_IMPORTACION'
                    ? 'techo de importación (precio local por encima de la paridad internacional)'
                    : pSp.primaryParity.signal === 'DESCUENTO_MX'
                        ? 'descuento competitivo local frente a la paridad internacional'
                        : 'equilibrio comercial frente a la paridad internacional';
                lines.push(cleanQual(`- Paridad internacional ${pSp.speciesLabel} (${pSp.primaryParity.originCountry} hacia México): ${sigTxt}.`));
            }
        }
        const nlpQual = artifact.nlpEvents || loadCachedNlpEvents();
        if (nlpQual?.bySpecies) {
            for (const sp of (wantedSpecies.length ? wantedSpecies : Object.keys(SPECIES_META))) {
                const ev = nlpQual.bySpecies[sp];
                if (!ev || ev.riskScore < 20) continue;
                lines.push(cleanQual(`- Radar NLP sanitario/comercial (${SPECIES_META[sp]?.label || sp}): riesgo ${ev.riskLevel.toLowerCase()} con sesgo ${ev.bias.toLowerCase()} por ${ev.dominantType || 'eventos sanitarios y comerciales activos'}.`));
            }
        }
        for (const item of picked.slice(0, 6)) {
            const p = item.primaryForecast;
            const dirTxt = p.direction === 'ALZA' ? 'presión alcista' : p.direction === 'BAJA' ? 'presión bajista' : 'estabilidad lateral';
            const marginNote = p.feedMarginState ? `; ${p.feedMarginState}` : '';
            const topCauses = (p.explainability?.factors || []).slice(0, 2).map(f => f.label).join(' y ');
            const causeNote = topCauses ? `; factores principales: ${topCauses}` : '';
            lines.push(cleanQual(`- ${item.label} (${item.regionLabel}): señal ML de ${dirTxt} (${item.regime?.volatilityRegime || 'volatilidad normal'}${marginNote}${causeNote}).`));
        }
        return lines.join('\n');
    }

    const lines = [
        `[MARRANAS · MOTOR ML DEDICADO DE PROTEÍNAS · ${artifact.version} · Corte ${artifact.generatedAt.slice(0, 10)} · ${artifact.stats.activeModels} modelos activos (${artifact.stats.conformalAndAdaptiveModels} con Ridge-ARX/Conformal) · ${artifact.stats.totalObservationsIngested} obs reales · Exactitud WF ${artifact.stats.avgWalkForwardDirectionalAccuracyPct}% · Brier ${artifact.stats.avgBrierScore}]:`,
        'Usa estas probabilidades de SUBIDA/BAJA de MARRANAS (modelo independiente de Loopus) calibradas por Meta-Stacking con poda causal Brier (GBDT + L2-Logit + Transfer Learning por especie + Ridge-ARX Conformal P80) como señal estadística (nunca certeza absoluta):',
    ];

    for (const sp of (wantedSpecies.length ? wantedSpecies : Object.keys(SPECIES_META))) {
        const sum = artifact.summary?.bySpecies?.[sp];
        if (!sum || !sum.seriesCount) continue;
        lines.push(`* Consenso ${sum.label}: ${sum.consensusDirection} (Prob. Subida ${sum.avgProbUpPct}% / Baja ${sum.avgProbDownPct}%, cambio medio ${sum.avgExpectedChangePct > 0 ? '+' : ''}${sum.avgExpectedChangePct}% en ${sum.seriesCount} mercados, Exactitud WF ${sum.avgDirectionalAccuracyPct}%; Alza: ${sum.counts.alza}, Baja: ${sum.counts.baja}, Lateral: ${sum.counts.lateral}).`);
    }

    if (artifact.importParity?.bySpecies && /paridad|importaci|arbitraje|mexico|mx|ee\.\s*uu|brasil|europa|frontera/.test(q)) {
        lines.push(`* Paridad de Importación → México (USD/MXN=${artifact.importParity.fxRates?.usdMxn}, EUR/MXN=${artifact.importParity.fxRates?.eurMxn}, BRL/MXN=${artifact.importParity.fxRates?.brlMxn}):`);
        for (const sp of (wantedSpecies.length ? wantedSpecies : Object.keys(SPECIES_META))) {
            const pSp = artifact.importParity.bySpecies[sp];
            if (!pSp?.primaryParity) continue;
            const c = pSp.primaryParity;
            lines.push(`  - ${pSp.speciesLabel}: México SNIIM=${pSp.mexicoBenchmark.priceMxnKg} MXN/kg vs Paridad puesta ${c.originCountry}=${c.landedMxnKg} MXN/kg (diferencial ${c.spreadPct > 0 ? '+' : ''}${c.spreadPct}%, señal ${c.signal}).`);
        }
    }

    if (/margen|raci[oó]n|alimento|compr|cobertura|conviene|percentil|barato|caro|paridad|importaci|arbitraje|m[eé]xico|mx/.test(q)) {
        try {
            const { buildLivestockMarginReport } = require('../services/livestock-margin-engine');
            const margins = buildLivestockMarginReport({ proteinArtifact: artifact });
            if (margins?.available) {
                lines.push(`* Motor de Margen Ganadero y Playbook de Compra México (Maíz=$${margins.inputs.cornUsdTon}/t, Soya=$${margins.inputs.soyUsdTon}/t, USD/MXN=${margins.inputs.usdMxn}):`);
                for (const sp of (wantedSpecies.length ? wantedSpecies : Object.keys(SPECIES_META))) {
                    const m = margins.bySpecies[sp];
                    if (!m) continue;
                    lines.push(`  - ${m.label}: SNIIM=$${m.mexicoPriceMxnKg}/kg | Alimento/kg=$${m.feedCostPerKgMeatMxn} (${m.feedFormula}) | Margen s/alimento=$${m.grossMarginOverFeedMxnKg}/kg (${m.marginOverFeedPct}%, ratio ${m.feedToMeatRatio}x) | Percentil ${m.range52w.percentile52w} (${m.range52w.zone}, rango $${m.range52w.min52w}-$${m.range52w.max52w}) | Postura: ${m.playbook.label}.`);
                }
            }
        } catch {
            // Degradación silenciosa si faltan insumos
        }
    }

    const activeNlp = artifact.nlpEvents || loadCachedNlpEvents();
    if (activeNlp?.bySpecies) {
        const nlpLines = [];
        for (const sp of (wantedSpecies.length ? wantedSpecies : Object.keys(SPECIES_META))) {
            const ev = activeNlp.bySpecies[sp];
            if (!ev || ev.riskScore < 20) continue;
            const lead = ev.topHeadlines?.[0];
            const headTxt = lead ? ` | Titular clave (${lead.publishedAt?.slice(0, 10)}, ${lead.source}): "${lead.title}"` : '';
            nlpLines.push(`  - ${SPECIES_META[sp]?.label || sp}: Riesgo NLP ${ev.riskScore}/100 (${ev.riskLevel}), sesgo ${ev.bias} (${ev.dominantType || 'eventos activos'}, ${ev.eventCount} noticias)${headTxt}`);
        }
        if (nlpLines.length) {
            lines.push(`* Radar NLP de Eventos Sanitarios y Comerciales (corte ${activeNlp.generatedAt?.slice(0, 10)}):`);
            lines.push(...nlpLines);
        }
    }

    for (const item of picked) {
        const p = item.primaryForecast;
        const accTxt = p.validation?.walkForwardDirectionalAccuracyPct != null ? ` | WF: ${p.validation.walkForwardDirectionalAccuracyPct}% (Brier ${p.validation.brierScore ?? '—'})` : '';
        const maeTxt = p.validation?.maeImprovementPct != null ? ` | MAE vs baseline: ${p.validation.maeImprovementPct > 0 ? '+' : ''}${p.validation.maeImprovementPct}%` : '';
        const marginTxt = p.feedMarginState ? ` | ${p.feedMarginState}` : '';
        const shockTxt = item.anomaly?.isAnomaly ? ' | ALERTA CHOQUE ACTIVO' : '';
        const shapTxt = p.explainability?.narrative ? ` | Explicación SHAP: ${p.explainability.narrative}` : '';
        lines.push(
            `- ${item.label} [${item.regionLabel} · ${item.species}]: último=${item.lastValue} ${item.unit} (${item.lastDate}) -> ${p.horizonLabel}: ${p.direction} (Subida ${p.probUpPct}% vs Baja ${p.probDownPct}%, objetivo ${p.projectedValue} ${item.unit}, ${p.expectedChangePct > 0 ? '+' : ''}${p.expectedChangePct}%, P80 [${p.low80}, ${p.high80}])${accTxt}${maeTxt}${marginTxt}${shockTxt}${shapTxt}`
        );
    }

    return lines.join('\n');
}

function buildMarranasAlerts(artifact = loadCachedProteinML(), { species = null, region = null, limit = 24 } = {}) {
    if (!artifact || !Array.isArray(artifact.forecasts)) return [];
    const alerts = [];
    for (const item of artifact.forecasts) {
        if (!item?.available || !item.primaryForecast) continue;
        if (species && species !== 'all' && item.species !== species) continue;
        if (region && region !== 'ALL' && item.region !== region) continue;

        const p = item.primaryForecast;
        const wfAcc = p.validation?.walkForwardDirectionalAccuracyPct ?? null;
        const isShock = Boolean(item.anomaly?.isAnomaly || (item.regime?.volatilityRatio >= 1.45));
        const marginSqueeze = p.feedMarginZScore != null && p.feedMarginZScore <= -1.2;

        if (isShock) {
            alerts.push({
                id: `${item.symbol}-shock`,
                type: 'CHOQUE_VOLATILIDAD',
                severity: 'CRÍTICA',
                priority: 100 + (item.regime?.volatilityRatio || 1) * 10,
                symbol: item.symbol,
                label: item.label,
                species: item.species,
                region: item.region,
                country: item.country,
                unit: item.unit,
                lastValue: item.lastValue,
                lastDate: item.lastDate,
                direction: p.direction,
                probUpPct: p.probUpPct,
                probDownPct: p.probDownPct,
                title: `Choque de volatilidad / anomalía activa en ${item.speciesLabel}`,
                detail: `${item.label} registra expansión de rango (ratio vol ${item.regime?.volatilityRatio ?? '—'}x, MAD z=${item.anomaly?.madZScore ?? '—'}). Validar brotes sanitarios (H5N1/PPA) o disrupción de oferta antes de fijar precio.`,
            });
        }

        if (p.direction === 'ALZA' && (p.probUpPct >= 70 || (p.probUpPct >= 65 && p.confidence === 'Alta'))) {
            alerts.push({
                id: `${item.symbol}-alza`,
                type: 'ALZA_FUERTE',
                severity: p.probUpPct >= 78 ? 'CRÍTICA' : 'ALTA',
                priority: p.probUpPct + (p.confidence === 'Alta' ? 12 : 0) + (item.region === 'MX' ? 6 : 0),
                symbol: item.symbol,
                label: item.label,
                species: item.species,
                region: item.region,
                country: item.country,
                unit: item.unit,
                lastValue: item.lastValue,
                lastDate: item.lastDate,
                direction: p.direction,
                probUpPct: p.probUpPct,
                probDownPct: p.probDownPct,
                projectedValue: p.projectedValue,
                expectedChangePct: p.expectedChangePct,
                title: `Presión alcista (${p.probUpPct}% prob. subida) · ${item.country}`,
                detail: `${item.label}: corte ${item.lastValue} ${item.unit} → objetivo ${p.projectedValue} ${item.unit} (${p.expectedChangePct > 0 ? '+' : ''}${p.expectedChangePct}%, P80 [${p.low80}–${p.high80}])${wfAcc != null ? ` · WF ${wfAcc}%` : ''}. Evaluar cobertura anticipada.`,
            });
        } else if (p.direction === 'BAJA' && (p.probDownPct >= 70 || (p.probDownPct >= 65 && p.confidence === 'Alta'))) {
            alerts.push({
                id: `${item.symbol}-baja`,
                type: 'BAJA_FUERTE',
                severity: p.probDownPct >= 78 ? 'ALTA' : 'VIGILANCIA',
                priority: p.probDownPct + (p.confidence === 'Alta' ? 10 : 0) + (item.region === 'MX' ? 5 : 0),
                symbol: item.symbol,
                label: item.label,
                species: item.species,
                region: item.region,
                country: item.country,
                unit: item.unit,
                lastValue: item.lastValue,
                lastDate: item.lastDate,
                direction: p.direction,
                probUpPct: p.probUpPct,
                probDownPct: p.probDownPct,
                projectedValue: p.projectedValue,
                expectedChangePct: p.expectedChangePct,
                title: `Sesgo bajista / ventana de compra (${p.probDownPct}% prob. baja) · ${item.country}`,
                detail: `${item.label}: corte ${item.lastValue} ${item.unit} → objetivo ${p.projectedValue} ${item.unit} (${p.expectedChangePct > 0 ? '+' : ''}${p.expectedChangePct}%, P80 [${p.low80}–${p.high80}])${wfAcc != null ? ` · WF ${wfAcc}%` : ''}. Evitar sobre-inventario caro.`,
            });
        }

        if (marginSqueeze) {
            alerts.push({
                id: `${item.symbol}-margin`,
                type: 'MARGEN_COMPRIMIDO',
                severity: p.feedMarginZScore <= -1.8 ? 'ALTA' : 'VIGILANCIA',
                priority: 65 + Math.abs(p.feedMarginZScore) * 10,
                symbol: item.symbol,
                label: item.label,
                species: item.species,
                region: item.region,
                country: item.country,
                unit: item.unit,
                lastValue: item.lastValue,
                lastDate: item.lastDate,
                direction: p.direction,
                probUpPct: p.probUpPct,
                probDownPct: p.probDownPct,
                feedMarginZScore: p.feedMarginZScore,
                title: `Compresión de margen frente a ración (Z=${p.feedMarginZScore})`,
                detail: `${item.label}: el ratio precio/ración cayó a Z=${p.feedMarginZScore}. Históricamente anticipa menor encasetamiento/retención y presión alcista en el siguiente ciclo biológico.`,
            });
        }
    }

    // Add International Import Parity Arbitrage Alerts (MX vs Landed US/BR/EU parity >= 18% spread)
    if (artifact.importParity?.bySpecies && (!region || region === 'ALL' || region === 'MX')) {
        for (const [sp, spData] of Object.entries(artifact.importParity.bySpecies)) {
            if (species && species !== 'all' && sp !== species) continue;
            const c = spData?.primaryParity;
            if (!c || !Number.isFinite(c.spreadPct) || Math.abs(c.spreadPct) < 18) continue;
            const isExpensiveMx = c.spreadPct > 0;
            alerts.push({
                id: `PARITY-${sp}-${c.symbol}`,
                type: 'ARBITRAJE_IMPORTACION',
                severity: Math.abs(c.spreadPct) >= 30 ? 'ALTA' : 'VIGILANCIA',
                priority: 72 + Math.min(25, Math.abs(c.spreadPct) * 0.5),
                symbol: spData.mexicoBenchmark.symbol,
                label: spData.mexicoBenchmark.label,
                species: sp,
                region: 'MX',
                country: 'México',
                unit: 'MXN/kg',
                lastValue: spData.mexicoBenchmark.priceMxnKg,
                lastDate: spData.mexicoBenchmark.observedAt,
                direction: isExpensiveMx ? 'BAJA' : 'ALZA',
                probUpPct: isExpensiveMx ? 35 : 65,
                probDownPct: isExpensiveMx ? 65 : 35,
                title: isExpensiveMx
                    ? `Paridad de importación: México +${c.spreadPct}% arriba de ${c.originCountry}`
                    : `Paridad de importación: México ${c.spreadPct}% debajo de ${c.originCountry}`,
                detail: `SNIIM México ${spData.mexicoBenchmark.priceMxnKg} MXN/kg vs paridad puesta ${c.originCountry} ${c.landedMxnKg} MXN/kg (${c.conversionFormula}). ${isExpensiveMx ? 'Incentivo de importación puede actuar como techo de precio.' : 'Descuento mexicano frente a paridad externa da soporte al mercado local.'}`,
            });
        }
    }

    // Add Active Sanitary & Trade NLP Event Alerts (H5N1, PPA, Gusano Barrenador, Aranceles/Fronteras)
    const activeNlpAlerts = artifact.nlpEvents || loadCachedNlpEvents();
    if (activeNlpAlerts?.bySpecies) {
        for (const [sp, ev] of Object.entries(activeNlpAlerts.bySpecies)) {
            if (species && species !== 'all' && sp !== species) continue;
            if (!ev || ev.riskScore < 35) continue;
            const regBucket = region && region !== 'ALL' ? activeNlpAlerts.bySpeciesRegion?.[sp]?.[region] : null;
            const target = regBucket && regBucket.eventCount > 0 ? regBucket : ev;
            if (region && region !== 'ALL' && (!regBucket || regBucket.riskScore < 25)) continue;
            const lead = target.topHeadlines?.[0];
            if (!lead) continue;
            alerts.push({
                id: `NLP-${sp}-${region || 'GLOBAL'}`,
                type: 'EVENTO_SANITARIO_NLP',
                severity: target.riskScore >= 70 ? 'CRÍTICA' : target.riskScore >= 45 ? 'ALTA' : 'VIGILANCIA',
                priority: 76 + target.riskScore * 0.35,
                symbol: `NLP-${sp.toUpperCase()}`,
                label: SPECIES_META[sp]?.label || sp,
                species: sp,
                region: (region && region !== 'ALL') ? region : (lead.regions?.[0] || 'GLOBAL'),
                country: lead.source || 'Prensa internacional',
                unit: 'Índice NLP 0-100',
                lastValue: target.riskScore,
                lastDate: lead.publishedAt?.slice(0, 10) || activeNlpAlerts.generatedAt?.slice(0, 10),
                direction: target.bias === 'ALCISTA' ? 'ALZA' : target.bias === 'BAJISTA' ? 'BAJA' : 'LATERAL',
                probUpPct: target.bias === 'ALCISTA' ? 62 : target.bias === 'BAJISTA' ? 38 : 50,
                probDownPct: target.bias === 'ALCISTA' ? 38 : target.bias === 'BAJISTA' ? 62 : 50,
                title: `${target.dominantType || 'Evento Sanitario/Comercial'} (Riesgo NLP ${target.riskScore}/100 · ${target.bias})`,
                detail: `${lead.title} (${lead.source}, ${lead.publishedAt?.slice(0, 10)}). ${target.eventCount} noticias recientes detectadas en ventana de ${activeNlpAlerts.windowDays || 35} días.`,
                url: lead.url,
            });
        }
    }

    return alerts
        .sort((a, b) => b.priority - a.priority)
        .slice(0, limit);
}

module.exports = {
    PROTEIN_ML_BRAND,
    PROTEIN_ML_VERSION,
    PROTEIN_ML_CACHE_FILE,
    SPECIES_META,
    REGION_META,
    buildCompositeFeedSeries,
    buildSpeciesPanelPriors,
    forecastProteinSeries,
    buildProteinMLReport,
    saveProteinMLArtifact,
    loadCachedProteinML,
    getProteinMLContextForQuery,
    runWalkForwardMetaStack,
    buildCausalExplanation,
    buildMarranasAlerts,
};
