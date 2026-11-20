'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { assessAdaptiveForecast, MODEL_VERSION: ADAPTIVE_VERSION } = require('./adaptive-forecast');
const { trainTemporalModel, VERSION: TEMPORAL_VERSION } = require('./temporal-training');
const { fetchYahooHistory, trainForSymbol } = require('./forecasting-service');
const { CACHE_DIR } = require('../lib/config');

const SHOWCASE_CACHE_FILE = path.resolve(__dirname, '../cache/ml-predictions-showcase.json');
const REPO_COMMODITY_CACHE_FILE = path.resolve(__dirname, '../cache/commodity-cache.json');
const COMMODITY_CACHE_FILE = fs.existsSync(path.join(CACHE_DIR, 'commodity-cache.json'))
    ? path.join(CACHE_DIR, 'commodity-cache.json')
    : REPO_COMMODITY_CACHE_FILE;

const LIVE_SHOWCASE_CATALOG = Object.freeze([
    { symbol: 'USDMXN=X', label: 'USD/MXN · Tipo de Cambio Spot', category: 'Divisas (FX)', profileId: 'fx', unit: 'MXN/USD', intervals: ['1wk', '1d'], horizons: [1, 3, 5, 10] },
    { symbol: 'EURUSD=X', label: 'EUR/USD · Euro / Dólar', category: 'Divisas (FX)', profileId: 'fx', unit: 'USD/EUR', intervals: ['1wk', '1d'], horizons: [1, 3, 5] },
    { symbol: 'ZC=F', label: 'Maíz CBOT · Futuros Continuos', category: 'Granos e Insumos', profileId: 'grains', unit: 'cUSD/bu', intervals: ['1d', '1wk'], horizons: [1, 3, 5, 10] },
    { symbol: 'ZS=F', label: 'Soya CBOT · Futuros Continuos', category: 'Granos e Insumos', profileId: 'grains', unit: 'cUSD/bu', intervals: ['1d', '1wk'], horizons: [1, 3, 5, 10] },
    { symbol: 'ZW=F', label: 'Trigo CBOT · Futuros Continuos', category: 'Granos e Insumos', profileId: 'grains', unit: 'cUSD/bu', intervals: ['1d', '1wk'], horizons: [1, 3, 5] },
    { symbol: 'HE=F', label: 'Cerdo CME Lean Hogs', category: 'Proteínas Pecuarias', profileId: 'protein_futures', unit: 'cUSD/lb', intervals: ['1d', '1mo', '1wk'], horizons: [1, 3, 5, 10] },
    { symbol: 'LE=F', label: 'Bovino CME Live Cattle', category: 'Proteínas Pecuarias', profileId: 'protein_futures', unit: 'cUSD/lb', intervals: ['1d', '1wk'], horizons: [1, 3, 5] },
    { symbol: 'CL=F', label: 'Petróleo WTI NYMEX', category: 'Energía y Logística', profileId: 'general', unit: 'USD/bbl', intervals: ['1wk', '1d'], horizons: [1, 3, 5] },
    { symbol: '^MXX', label: 'Índice S&P/BMV IPC México', category: 'Renta Variable', profileId: 'general', unit: 'pts MXN', intervals: ['1wk', '1d'], horizons: [1, 3, 5] },
    { symbol: 'GRUMAB.MX', label: 'Gruma (BMV) · Harina y Maíz', category: 'Renta Variable', profileId: 'general', unit: 'MXN/acción', intervals: ['1wk', '1d'], horizons: [1, 3, 5] },
]);

const LOCAL_COMMODITY_CATALOG = Object.freeze([
    { key: 'CORN', symbol: 'CORN-LOCAL', label: 'Maíz Global · Serie Mensual FMI/FRED', category: 'Granos e Insumos', profileId: 'grains', unit: 'USD/ton', horizons: [1, 3, 6] },
    { key: 'WHEAT', symbol: 'WHEAT-LOCAL', label: 'Trigo Global · Serie Mensual FMI/FRED', category: 'Granos e Insumos', profileId: 'grains', unit: 'USD/ton', horizons: [1, 3, 6] },
    { key: 'CRUDE_OIL', symbol: 'WTI-LOCAL', label: 'Crudo WTI · Serie Mensual Histórica', category: 'Energía y Logística', profileId: 'general', unit: 'USD/bbl', horizons: [1, 3, 6] },
    { key: 'COPPER', symbol: 'COPPER-LOCAL', label: 'Cobre Refinado · Serie Mensual Industrial', category: 'Energía y Logística', profileId: 'general', unit: 'USD/ton', horizons: [1, 3, 6] },
    { key: 'NATURAL_GAS', symbol: 'NATGAS-LOCAL', label: 'Gas Natural Henry Hub · Serie Mensual', category: 'Energía y Logística', profileId: 'general', unit: 'USD/MMBtu', horizons: [1, 3, 6] },
    { key: 'ALUMINUM', symbol: 'ALUMINUM-LOCAL', label: 'Aluminio Primario · Serie Mensual', category: 'Energía y Logística', profileId: 'general', unit: 'USD/ton', horizons: [1, 3, 6] },
]);

const mean = values => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0);
const stdDev = (values, avg = mean(values)) => {
    if (values.length < 2) return 0;
    return Math.sqrt(values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1));
};
const round = (value, digits = 4) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);

function computeRegimeDiagnostics(points) {
    if (!Array.isArray(points) || points.length < 25) return null;
    const values = points.map(p => p.value);
    const returns = [];
    for (let i = 1; i < values.length; i++) {
        if (values[i - 1] > 0) returns.push((values[i] - values[i - 1]) / values[i - 1]);
    }
    const recent20 = values.slice(-20);
    const recent60 = values.slice(-Math.min(60, values.length));
    const ret20 = returns.slice(-20);
    const ret60 = returns.slice(-Math.min(60, returns.length));

    const vol20 = stdDev(ret20) * 100;
    const vol60 = stdDev(ret60) * 100;
    const volRatio = vol60 > 1e-6 ? vol20 / vol60 : 1;

    const avg20 = mean(recent20);
    const sd20 = stdDev(recent20, avg20);
    const last = values.at(-1);
    const zScore20 = sd20 > 1e-9 ? (last - avg20) / sd20 : 0;
    const momentum20Pct = recent20[0] > 0 ? ((last - recent20[0]) / recent20[0]) * 100 : 0;

    // Autocorrelación de primer orden en retornos recientes
    let autocorr = 0;
    if (ret60.length >= 10) {
        const left = ret60.slice(0, -1);
        const right = ret60.slice(1);
        const mL = mean(left);
        const mR = mean(right);
        const denom = stdDev(left, mL) * stdDev(right, mR) * (left.length - 1);
        if (denom > 1e-12) {
            autocorr = left.reduce((acc, v, idx) => acc + (v - mL) * (right[idx] - mR), 0) / denom;
        }
    }

    const regimeLabel = volRatio >= 1.35
        ? 'Alta volatilidad / expansión de rango'
        : volRatio <= 0.78
            ? 'Baja volatilidad / compresión'
            : 'Régimen de volatilidad normal';

    const trendLabel = momentum20Pct >= 2.5
        ? 'Tendencia alcista activa'
        : momentum20Pct <= -2.5
            ? 'Tendencia bajista activa'
            : 'Lateral / reversión a la media';

    return {
        lastValue: round(last, 4),
        mean20: round(avg20, 4),
        mean60: round(mean(recent60), 4),
        volatility20Pct: round(vol20, 3),
        volatility60Pct: round(vol60, 3),
        volatilityRatio: round(volRatio, 2),
        zScore20: round(zScore20, 2),
        momentum20Pct: round(momentum20Pct, 2),
        returnAutocorrLag1: round(autocorr, 3),
        regimeLabel,
        trendLabel,
    };
}

function cleanMonthlyPoints(rows, now = Date.now()) {
    const points = new Map();
    const currentMonth = new Date(now).toISOString().slice(0, 7);
    for (const row of Array.isArray(rows) ? rows : []) {
        const raw = row?.value;
        const date = String(row?.date || '');
        if (raw == null || raw === '' || typeof raw === 'boolean') continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) continue;
        if (new Date(date).toISOString().slice(0, 10) !== date || date.slice(0, 7) >= currentMonth) continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value <= 0) continue;
        points.set(date, value);
    }
    const sorted = [...points].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
    let start = sorted.length - 1;
    while (start > 0) {
        const prior = new Date(sorted[start - 1].date);
        const current = new Date(sorted[start].date);
        if ((current.getUTCFullYear() - prior.getUTCFullYear()) * 12 + current.getUTCMonth() - prior.getUTCMonth() !== 1) break;
        start--;
    }
    return sorted.slice(Math.max(0, start));
}

function evaluateHorizonWithTrace(points, { horizon = 1, profileId = 'general', now = Date.now() } = {}) {
    let adaptive = null;
    let temporal = null;
    try {
        adaptive = assessAdaptiveForecast(points, { horizon, profileId, now });
    } catch { /* serie corta o inválida */ }
    try {
        temporal = trainTemporalModel(points, { horizon, now });
    } catch { /* serie corta o inválida */ }

    const adaptiveImpr = adaptive?.evaluation?.improvement ?? -Infinity;
    const temporalImpr = temporal?.evaluation?.improvement ?? -Infinity;

    // Selecciona el motor que esté elegible y tenga mayor mejora relativa sobre el baseline;
    // si ambos se abstienen, conserva el de mayor mejora para diagnóstico transparente.
    let engine = 'adaptive_ensemble';
    let chosen = adaptive;
    if (temporal?.eligible && (!adaptive?.eligible || temporalImpr > adaptiveImpr)) {
        engine = 'temporal_grid_ridge';
        chosen = temporal;
    } else if (!adaptive?.eligible && !temporal?.eligible && temporalImpr > adaptiveImpr) {
        engine = 'temporal_grid_ridge';
        chosen = temporal;
    }

    if (!chosen) return null;

    const evalObj = chosen.evaluation || {};
    const errRange = Number(evalObj.errorRange) || 0;
    const validationTrace = Array.isArray(temporal?.validation)
        ? temporal.validation.slice(-16).map(step => ({
            cutoff: step.cutoff,
            targetDate: step.targetDate,
            actual: round(step.actual, 4),
            predicted: round(step.value, 4),
            baseline: round(points.find(p => p.date === step.cutoff)?.value ?? step.actual, 4),
            lowerBound: round(Math.max(0, step.value - errRange), 4),
            upperBound: round(step.value + errRange, 4),
            absError: round(step.error, 4),
            baselineError: round(step.baseline, 4),
            beatsBaseline: step.error < step.baseline,
            directionCorrect: Boolean(step.directionCorrect),
        }))
        : [];

    const weights = adaptive?.learning?.weights
        ? Object.fromEntries(Object.entries(adaptive.learning.weights).map(([k, v]) => [k, round(v, 4)]))
        : null;
    const corrections = adaptive?.learning?.corrections
        ? Object.fromEntries(Object.entries(adaptive.learning.corrections).map(([k, v]) => [k, round(v, 4)]))
        : null;
    const candidateForecasts = adaptive?.candidateForecasts
        ? Object.fromEntries(Object.entries(adaptive.candidateForecasts).map(([k, v]) => [k, round(v, 4)]))
        : null;

    const forecast = chosen.forecast
        ? {
            horizon,
            value: round(chosen.forecast.value, 4),
            lowerBound: round(chosen.forecast.lowerBound, 4),
            upperBound: round(chosen.forecast.upperBound, 4),
            changePct: round(chosen.forecast.changePct, 2),
            confidenceScore: round(chosen.forecast.confidenceScore ?? (chosen.eligible ? Math.min(96, Math.round(58 + Math.max(0, (evalObj.improvement || 0) * 180))) : 42), 1),
            rangeMethod: chosen.forecast.rangeMethod,
        }
        : null;

    return {
        horizon,
        engine,
        modelVersion: engine === 'adaptive_ensemble' ? ADAPTIVE_VERSION : TEMPORAL_VERSION,
        selectedStrategy: adaptive?.learning?.selectedStrategy || temporal?.selection?.config?.key || engine,
        eligible: Boolean(chosen.eligible),
        reason: chosen.reason || null,
        observations: chosen.observations || points.length,
        cutoff: points.at(-1)?.date || null,
        lastValue: round(points.at(-1)?.value, 4),
        forecast,
        evaluation: {
            evaluationPoints: evalObj.evaluationPoints || 0,
            modelMae: round(evalObj.modelMae, 4),
            baselineMae: round(evalObj.baselineMae, 4),
            rmse: round(evalObj.rmse, 4),
            improvementPct: round((evalObj.improvement || 0) * 100, 2),
            directionAccuracyPct: round((evalObj.directionAccuracy || 0) * 100, 1),
            intervalCoveragePct: evalObj.intervalCoverage != null ? round(evalObj.intervalCoverage * 100, 1) : null,
            baselineWins: evalObj.baselineWins || 0,
            nonOverlappingWindows: evalObj.nonOverlapping?.evaluationPoints || null,
            nonOverlappingImprovementPct: evalObj.nonOverlapping?.improvement != null ? round(evalObj.nonOverlapping.improvement * 100, 2) : null,
        },
        ensembleWeights: weights,
        biasCorrections: corrections,
        candidateForecasts,
        validationTrace,
    };
}

function buildCrossAssetDemonstration(assetModels) {
    const findBest = sym => {
        const asset = assetModels.find(a => a.symbol === sym);
        if (!asset) return null;
        return asset.horizons.find(h => h.eligible) || asset.horizons[0] || null;
    };

    const fx = findBest('USDMXN=X');
    const corn = findBest('ZC=F') || findBest('CORN-LOCAL');
    const soy = findBest('ZS=F');
    const hogs = findBest('HE=F');

    const fxSpot = fx?.lastValue || 19.85;
    const fxPred = fx?.forecast?.value || fxSpot;
    const fxUpper = fx?.forecast?.upperBound || fxSpot * 1.03;

    // ZC=F cotiza en centavos USD/bushel (1 tonelada métrica ≈ 39.368 bushels)
    // Si viene de CORN-LOCAL ya está en USD/ton
    const cornIsCentsBu = (findBest('ZC=F') != null);
    const cornRawSpot = corn?.lastValue || 430;
    const cornRawPred = corn?.forecast?.value || cornRawSpot;
    const cornUsdTonSpot = cornIsCentsBu ? (cornRawSpot / 100) * 39.368 : cornRawSpot;
    const cornUsdTonPred = cornIsCentsBu ? (cornRawPred / 100) * 39.368 : cornRawPred;

    // ZS=F cotiza en centavos USD/bushel (1 tonelada métrica ≈ 36.7437 bushels)
    const soyRawSpot = soy?.lastValue || 1010;
    const soyRawPred = soy?.forecast?.value || soyRawSpot;
    const soyUsdTonSpot = (soyRawSpot / 100) * 36.7437;
    const soyUsdTonPred = (soyRawPred / 100) * 36.7437;

    // Ración pecuaria estándar: 70% maíz + 30% soya puesta en planta (MXN/ton)
    const feedMxnTonSpot = (0.7 * cornUsdTonSpot + 0.3 * soyUsdTonSpot) * fxSpot;
    const feedMxnTonPred = (0.7 * cornUsdTonPred + 0.3 * soyUsdTonPred) * fxPred;
    const feedMxnTonStress = (0.7 * cornUsdTonPred * 1.04 + 0.3 * soyUsdTonPred * 1.04) * fxUpper;
    const feedDeltaPct = feedMxnTonSpot > 0 ? ((feedMxnTonPred - feedMxnTonSpot) / feedMxnTonSpot) * 100 : 0;

    // Paridad de cerdo CME Lean Hogs (cUSD/lb -> MXN/kg: cUSD/100 * 2.20462 * USD/MXN)
    const hogSpotCentsLb = hogs?.lastValue || 82;
    const hogPredCentsLb = hogs?.forecast?.value || hogSpotCentsLb;
    const hogParityMxnKgSpot = (hogSpotCentsLb / 100) * 2.20462 * fxSpot;
    const hogParityMxnKgPred = (hogPredCentsLb / 100) * 2.20462 * fxPred;

    return {
        title: 'Transmisión Multivariable ML: Divisas + Granos CBOT → Costo de Alimento y Paridad Pecuaria en México',
        formula: 'Ración Balanceada Referencial (70% Maíz + 30% Soya) × Tipo de Cambio USD/MXN',
        inputs: {
            usdMxn: { spot: round(fxSpot, 4), predicted: round(fxPred, 4), upperBound: round(fxUpper, 4), horizon: fx?.horizon || 1, interval: fx?.interval || '1wk', eligible: Boolean(fx?.eligible) },
            cornUsdTon: { spot: round(cornUsdTonSpot, 2), predicted: round(cornUsdTonPred, 2), sourceSymbol: cornIsCentsBu ? 'ZC=F' : 'CORN-LOCAL', eligible: Boolean(corn?.eligible) },
            soyUsdTon: { spot: round(soyUsdTonSpot, 2), predicted: round(soyUsdTonPred, 2), sourceSymbol: 'ZS=F', eligible: Boolean(soy?.eligible) },
            hogsParityMxnKg: { spot: round(hogParityMxnKgSpot, 2), predicted: round(hogParityMxnKgPred, 2), sourceSymbol: 'HE=F', eligible: Boolean(hogs?.eligible) },
        },
        outputs: {
            feedCostMxnTonSpot: round(feedMxnTonSpot, 2),
            feedCostMxnTonPredicted: round(feedMxnTonPred, 2),
            feedCostMxnTonStressBand: round(feedMxnTonStress, 2),
            feedCostChangePct: round(feedDeltaPct, 2),
            estimatedPorkFeedCostMxnKgLive: round((feedMxnTonPred / 1000) * 2.85, 2), // FCR ~ 2.85 kg alimento / kg cerdo
            estimatedPoultryFeedCostMxnKgLive: round((feedMxnTonPred / 1000) * 1.72, 2), // FCR ~ 1.72 kg alimento / kg pollo
        },
        scenarios: [
            { name: 'Escenario Base ML (Ensamble)', feedMxnTon: round(feedMxnTonPred, 2), porkParityMxnKg: round(hogParityMxnKgPred, 2), driver: 'Proyección combinada walk-forward de granos y USD/MXN' },
            { name: 'Choque Cambiario (+5% USD/MXN)', feedMxnTon: round(feedMxnTonPred * 1.05, 2), porkParityMxnKg: round(hogParityMxnKgPred * 1.05, 2), driver: 'Depreciación del peso encarece importación de grano y paridad cárnica' },
            { name: 'Banda Superior Fuera de Muestra (P90)', feedMxnTon: round(feedMxnTonStress, 2), porkParityMxnKg: round(hogParityMxnKgPred * (fxUpper / fxSpot), 2), driver: 'Cobertura ante percentil 90 de error histórico fuera de muestra' },
        ],
    };
}

function distillPredictiveRulesFromShowcase(showcase) {
    if (!showcase?.assets?.length) return [];
    const rules = [];
    for (const asset of showcase.assets) {
        const best = asset.horizons.find(h => h.eligible);
        if (!best || !best.forecast) continue;
        const impr = best.evaluation.improvementPct;
        const dirAcc = best.evaluation.directionAccuracyPct;
        const regime = asset.regime?.regimeLabel || 'volatilidad normal';
        const trend = asset.regime?.trendLabel || 'reversión a la media';
        rules.push({
            domain: 'both',
            topic: `ml_prediction_${asset.symbol.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
            audience: asset.category.includes('Granos') || asset.category.includes('Proteínas') ? 'purchasing' : 'finance',
            condition_trigger: `Pronóstico cuantitativo o escenario de riesgo sobre ${asset.label} (${asset.symbol}) en horizonte de ${best.horizon} pasos (${asset.interval})`,
            learned_rule: `Priorizar el motor ${best.engine} (${best.selectedStrategy}) validado con mejora fuera de muestra de ${impr}% en MAE y precisión direccional de ${dirAcc}% bajo ${regime} (${trend}); acotar cualquier escenario al rango de error fuera de muestra sin declarar certeza puntual.`,
            reasoning_chain: `Validación Walk-Forward (${asset.symbol}) -> Mejora MAE vs Baseline -> Banda Fuera de Muestra -> Decisión de Cobertura`,
            confidence_score: Math.min(96, Math.max(84, Math.round(84 + impr * 0.5))),
        });
    }
    return rules;
}

async function buildPredictiveShowcase({ offlineOnly = false, persistSupabase = false, now = Date.now() } = {}) {
    const assets = [];
    const supabaseSynced = [];

    if (!offlineOnly) {
        for (const item of LIVE_SHOWCASE_CATALOG) {
            let bestInterval = null;
            let bestPoints = [];
            let bestHorizons = [];

            for (const intervalCode of item.intervals) {
                try {
                    const raw = await fetchYahooHistory(item.symbol, intervalCode, { now });
                    const points = raw.slice(-740).map(p => ({ date: p.observed_at, value: p.value }));
                    if (points.length < 65) continue;
                    const horizons = item.horizons
                        .map(h => evaluateHorizonWithTrace(points, { horizon: h, profileId: item.profileId, now }))
                        .filter(Boolean);
                    const eligibleList = horizons.filter(h => h.eligible);
                    const eligibleCount = eligibleList.length;
                    const bestEligibleList = bestHorizons.filter(h => h.eligible);
                    const bestEligibleCount = bestEligibleList.length;
                    const scoreSum = eligibleList.reduce((sum, h) => sum + (h.evaluation?.improvementPct || 0), 0);
                    const bestScoreSum = bestEligibleList.reduce((sum, h) => sum + (h.evaluation?.improvementPct || 0), 0);
                    if (!bestInterval || eligibleCount > bestEligibleCount || (eligibleCount === bestEligibleCount && scoreSum > bestScoreSum)) {
                        bestInterval = intervalCode;
                        bestPoints = points;
                        bestHorizons = horizons;
                    }
                    if (eligibleCount >= 2) break;
                } catch { /* intenta siguiente intervalo o continúa con local */ }
            }

            if (bestInterval && bestPoints.length) {
                const regime = computeRegimeDiagnostics(bestPoints);
                assets.push({
                    symbol: item.symbol,
                    label: item.label,
                    category: item.category,
                    profileId: item.profileId,
                    unit: item.unit,
                    source: `Yahoo Finance · serie histórica (${bestInterval})`,
                    interval: bestInterval,
                    observations: bestPoints.length,
                    cutoff: bestPoints.at(-1)?.date || null,
                    lastValue: round(bestPoints.at(-1)?.value, 4),
                    recentHistory: bestPoints.slice(-36).map(p => ({ date: p.date, value: round(p.value, 4) })),
                    regime,
                    horizons: bestHorizons,
                });

                if (persistSupabase) {
                    const winningTemporal = bestHorizons.find(h => h.eligible && h.engine === 'temporal_grid_ridge') || bestHorizons.find(h => h.eligible);
                    if (winningTemporal) {
                        try {
                            const synced = await trainForSymbol(item.symbol, { intervalCode: bestInterval, horizon: winningTemporal.horizon });
                            supabaseSynced.push({ symbol: item.symbol, intervalCode: bestInterval, horizon: winningTemporal.horizon, eligible: synced.eligible, predictionId: synced.predictionId || null });
                        } catch { /* Supabase opcional */ }
                    }
                }
            }
        }
    }

    // Siempre complementamos con las series históricas mensuales verificadas en caché local
    try {
        if (fs.existsSync(COMMODITY_CACHE_FILE)) {
            const cache = JSON.parse(fs.readFileSync(COMMODITY_CACHE_FILE, 'utf8'));
            for (const item of LOCAL_COMMODITY_CATALOG) {
                const rawRows = cache[item.key]?.data?.data || cache[item.key]?.data;
                const points = cleanMonthlyPoints(rawRows, now);
                if (points.length < 70) continue;
                const horizons = item.horizons
                    .map(h => evaluateHorizonWithTrace(points, { horizon: h, profileId: item.profileId, now }))
                    .filter(Boolean);
                assets.push({
                    symbol: item.symbol,
                    label: item.label,
                    category: item.category,
                    profileId: item.profileId,
                    unit: cache[item.key]?.data?.unit || item.unit,
                    source: 'VALLNews Commodity Cache · Histórico Mensual',
                    interval: '1mo',
                    observations: points.length,
                    cutoff: points.at(-1)?.date || null,
                    lastValue: round(points.at(-1)?.value, 4),
                    recentHistory: points.slice(-36).map(p => ({ date: p.date, value: round(p.value, 4) })),
                    regime: computeRegimeDiagnostics(points),
                    horizons,
                });
            }
        }
    } catch { /* caché local opcional */ }

    const allHorizons = assets.flatMap(a => a.horizons);
    const eligibleHorizons = allHorizons.filter(h => h.eligible);
    const avgImprovement = eligibleHorizons.length
        ? round(mean(eligibleHorizons.map(h => h.evaluation.improvementPct)), 2)
        : 0;
    const avgDirectionAccuracy = eligibleHorizons.length
        ? round(mean(eligibleHorizons.map(h => h.evaluation.directionAccuracyPct)), 1)
        : 0;
    const coverageValues = allHorizons.map(h => h.evaluation.intervalCoveragePct).filter(Number.isFinite);
    const avgCoverage = coverageValues.length ? round(mean(coverageValues), 1) : null;

    const crossAssetDemo = buildCrossAssetDemonstration(assets);
    const showcase = {
        generatedAt: new Date(now).toISOString(),
        adaptiveModelVersion: ADAPTIVE_VERSION,
        temporalModelVersion: TEMPORAL_VERSION,
        summary: {
            totalAssets: assets.length,
            totalModelsEvaluated: allHorizons.length,
            eligibleModelsCount: eligibleHorizons.length,
            abstainedModelsCount: allHorizons.length - eligibleHorizons.length,
            avgImprovementPct: avgImprovement,
            avgDirectionAccuracyPct: avgDirectionAccuracy,
            avgIntervalCoveragePct: avgCoverage,
            supabaseSyncedCount: supabaseSynced.filter(s => s.predictionId).length,
        },
        supabaseSynced,
        crossAssetDemo,
        assets,
    };

    try {
        if ((!offlineOnly && process.env.NODE_ENV !== 'test') || !fs.existsSync(SHOWCASE_CACHE_FILE)) {
            fs.mkdirSync(path.dirname(SHOWCASE_CACHE_FILE), { recursive: true });
            fs.writeFileSync(SHOWCASE_CACHE_FILE, JSON.stringify(showcase, null, 2), 'utf8');
        }
    } catch { /* escritura opcional en entornos read-only */ }

    return showcase;
}

function loadCachedPredictiveShowcase() {
    try {
        if (fs.existsSync(SHOWCASE_CACHE_FILE)) {
            return JSON.parse(fs.readFileSync(SHOWCASE_CACHE_FILE, 'utf8'));
        }
    } catch { /* recalcular */ }
    return null;
}

function getPredictiveContextForQuery(queryText = '', { stripNumbers = false } = {}) {
    const showcase = loadCachedPredictiveShowcase();
    if (!showcase?.assets?.length) return '';
    const folded = String(queryText || '').toLowerCase();
    const relevant = showcase.assets.filter(asset => {
        const sym = asset.symbol.toLowerCase();
        if (folded.includes(sym)) return true;
        if ((/d[oó]lar|usd|mxn|cambio|divisa/.test(folded)) && sym.includes('usdmxn')) return true;
        if ((/ma[ií]z|corn|grano|alimento/.test(folded)) && (sym.includes('zc=f') || sym.includes('corn'))) return true;
        if ((/soya|soja|oleaginosa/.test(folded)) && sym.includes('zs=f')) return true;
        if ((/trigo|wheat/.test(folded)) && (sym.includes('zw=f') || sym.includes('wheat'))) return true;
        if ((/cerdo|porcino|hog|prote[ií]na/.test(folded)) && sym.includes('he=f')) return true;
        if ((/res|bovino|cattle|ganado/.test(folded)) && sym.includes('le=f')) return true;
        if ((/petr[oó]leo|wti|crudo|energ[ií]a|gas/.test(folded)) && (sym.includes('cl=f') || sym.includes('wti') || sym.includes('natgas'))) return true;
        if ((/ipc|bolsa|bmv|acci[oó]n/.test(folded)) && sym.includes('mxx')) return true;
        return /pron[oó]stic|predicci|proyecci|escenario|futuro|tendencia/.test(folded);
    }).slice(0, 4);

    if (!relevant.length) return '';
    if (stripNumbers) {
        return [
            'METODOLOGÍA PREDICTIVA WALK-FORWARD (Proyecto Loopus ML):',
            ...relevant.map(a => {
                const best = a.horizons.find(h => h.eligible) || a.horizons[0];
                return `- [${a.label}]: Régimen ${a.regime?.regimeLabel || 'normal'} (${a.regime?.trendLabel || 'estable'}). Motor seleccionado: ${best?.selectedStrategy || 'ensamble adaptativo'} con validación temporal fuera de muestra y banda de incertidumbre empírica.`;
            }),
        ].join('\n');
    }

    const lines = [
        '[DEMOSTRACIÓN CUANTITATIVA Y PREDICCIONES ML · PROYECTO LOOPUS]',
        `Resumen del laboratorio predictivo (corte ${showcase.generatedAt.slice(0, 10)}): ${showcase.summary.eligibleModelsCount}/${showcase.summary.totalModelsEvaluated} horizontes superan al baseline fuera de muestra (mejora media MAE: +${showcase.summary.avgImprovementPct}%, precisión direccional media: ${showcase.summary.avgDirectionAccuracyPct}%).`,
    ];
    for (const asset of relevant) {
        const eligibleList = asset.horizons.filter(h => h.eligible);
        const top = eligibleList[0] || asset.horizons[0];
        if (!top) continue;
        if (top.eligible && top.forecast) {
            lines.push(`- ${asset.label} (${asset.symbol}, ${asset.interval}, corte ${asset.cutoff}): último=${asset.lastValue} ${asset.unit} -> pronóstico h=${top.horizon}: ${top.forecast.value} ${asset.unit} (${top.forecast.changePct >= 0 ? '+' : ''}${top.forecast.changePct}%, banda fuera de muestra: [${top.forecast.lowerBound}, ${top.forecast.upperBound}] ${asset.unit}). Motor: ${top.selectedStrategy} (MAE ${top.evaluation.modelMae} vs baseline ${top.evaluation.baselineMae}, mejora +${top.evaluation.improvementPct}%, dir. ${top.evaluation.directionAccuracyPct}%). Régimen: ${asset.regime?.regimeLabel}, ${asset.regime?.trendLabel}.`);
        } else {
            lines.push(`- ${asset.label} (${asset.symbol}, ${asset.interval}, corte ${asset.cutoff}): último=${asset.lastValue} ${asset.unit}. Régimen: ${asset.regime?.regimeLabel}, ${asset.regime?.trendLabel}. Abstención prudente en h=${top.horizon} (MAE ${top.evaluation.modelMae} vs baseline ${top.evaluation.baselineMae}).`);
        }
    }
    if (showcase.crossAssetDemo && /ma[ií]z|soya|cerdo|pollo|prote[ií]na|alimento|margen| raci[oó]n|costo/.test(folded)) {
        const d = showcase.crossAssetDemo;
        lines.push(`- Transmisión multivariable (Maíz + Soya + USD/MXN): costo estimado de ración balanceada=${d.outputs.feedCostMxnTonPredicted} MXN/ton (spot=${d.outputs.feedCostMxnTonSpot} MXN/ton, banda estrés P90=${d.outputs.feedCostMxnTonStressBand} MXN/ton); paridad porcina CME=${d.inputs.hogsParityMxnKg.predicted} MXN/kg.`);
    }
    return lines.join('\n');
}

function resolveShowcaseForecastForSymbol(rawSymbol) {
    const symbol = String(rawSymbol || '').trim().toUpperCase();
    const showcase = loadCachedPredictiveShowcase();
    const asset = showcase?.assets?.find(a => a.symbol.toUpperCase() === symbol);
    if (!asset) return { forecast: null, showcaseAsset: null };
    const best = asset.horizons.find(h => h.eligible) || null;
    const forecast = best?.forecast ? {
        symbol: asset.symbol,
        interval_code: asset.interval,
        generated_at: showcase.generatedAt,
        horizon_code: `${best.horizon}-step`,
        predicted_value: best.forecast.value,
        predicted_change_pct: best.forecast.changePct,
        lower_bound: best.forecast.lowerBound,
        upper_bound: best.forecast.upperBound,
        probability_up: null,
        confidence_score: best.forecast.confidenceScore,
        explanation: `Pronóstico validado por ${best.engine} (${best.selectedStrategy}) con ${asset.observations} observaciones y mejora de +${best.evaluation.improvementPct}% frente al baseline.`,
        evidence: {
            latestObservedAt: asset.cutoff,
            lastValue: asset.lastValue,
            unit: asset.unit,
            regime: asset.regime,
            walkForward: best.evaluation,
            ensembleWeights: best.ensembleWeights,
        },
    } : null;
    return { forecast, showcaseAsset: asset };
}

async function runPredictiveCurriculumBatch() {
    const { TRAINING_CURRICULUM, gatherTopicCorpus, localEvidence, saveRuleProposals } = require('../ai/ml-training-loop');
    const { GeminiProvider } = require('../ai/providers/gemini-provider');
    const { createTrainingRun, finishTrainingRun, persistRuleProposals, persistTrainingEvent, approveHighConfidenceProposals, getLoopusOverviewStats } = require('../ai/ml-persistence');
    const { updateReasoningPlaybook } = require('../ai/loopus-knowledge');

    const ai = new GeminiProvider();
    if (!ai.isConfigured()) return { trained: false, reason: 'Gemini no configurado' };

    const startedAt = Date.now();
    const runKey = `loopus-predictive-batch-${startedAt}`;
    let runId = null;
    try {
        runId = await createTrainingRun({
            runKey,
            startedAt,
            metadata: { project: 'Proyecto Loopus v3 Predictive Expansion', modules: 8 },
        });
    } catch { /* opcional */ }

    const ev = localEvidence();
    let totalRules = 0;
    let attempts = 0;
    let errors = 0;
    const systemInstruction = 'Devuelve JSON estricto: {"nuevas_reglas":[{"domain":"chat|reports|both","audience":"general|finance|purchasing|operations|commercial","condition_trigger":"situación o consulta observable","learned_rule":"protocolo analítico o predictivo sin fijar precios del día","reasoning_chain":"Paso 1 -> Paso 2 -> Paso 3 -> Validación","confidence_score":92}],"insight_mercado":"síntesis ejecutiva"}';

    for (const spec of TRAINING_CURRICULUM.slice(30)) {
        attempts += 1;
        try {
            const corpus = await gatherTopicCorpus(spec, ev);
            const resp = await ai.generate({
                prompt: `MÓDULO PREDICTIVO #${attempts}: ${spec.topic}\nGenera 4 reglas de raciocinio predictivo y cuantitativo basadas en este corpus walk-forward:\n${corpus.text}`,
                systemInstruction,
                tier: attempts % 2 === 0 ? 'report' : 'pro',
                json: true,
                timeoutMs: 40_000,
            });
            const cleanedText = String(resp.text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            const parsed = JSON.parse(cleanedText);
            const saved = saveRuleProposals(parsed?.nuevas_reglas, {
                provider: 'loopus-predictive-v3',
                model: resp.model || null,
                topic: spec.topic,
                collection: spec.collection,
                report_key: spec.reportKey,
                collected_at: new Date().toISOString(),
            });
            totalRules += saved.length;
            updateReasoningPlaybook(saved.map(x => ({ ...x, topic: `${spec.collection}_${spec.reportKey}` })));
            await persistRuleProposals(saved, runId).catch(() => {});
            await persistTrainingEvent({
                event_key: `${runKey}-${attempts}`,
                attempt_number: attempts,
                topic: spec.topic,
                status: 'completed',
                model: resp.model || null,
                sources: corpus.sourcesUsed,
                evidence: { collection: spec.collection, report_key: spec.reportKey },
                output: { proposals_saved: saved.length },
            }, runId).catch(() => {});
        } catch {
            errors += 1;
        }
    }

    await finishTrainingRun(runId, {
        status: 'completed',
        startedAt,
        endedAt: Date.now(),
        attempts,
        proposalCount: totalRules,
        errorCount: errors,
    }).catch(() => {});

    const approved = await approveHighConfidenceProposals({
        minConfidence: 88,
        limit: 50,
        reviewNotes: 'Aprobación automática lote predictivo walk-forward Loopus v3',
    }).catch(() => ({ approvedCount: 0 }));
    const stats = await getLoopusOverviewStats().catch(() => null);
    return { trained: true, attempts, totalRules, errors, approvedCount: approved.approvedCount, stats };
}

module.exports = {
    SHOWCASE_CACHE_FILE,
    LIVE_SHOWCASE_CATALOG,
    LOCAL_COMMODITY_CATALOG,
    computeRegimeDiagnostics,
    evaluateHorizonWithTrace,
    buildCrossAssetDemonstration,
    distillPredictiveRulesFromShowcase,
    buildPredictiveShowcase,
    loadCachedPredictiveShowcase,
    getPredictiveContextForQuery,
    resolveShowcaseForecastForSymbol,
    runPredictiveCurriculumBatch,
};
