'use strict';

// Persistencia de pronósticos en Supabase. No depende de MariaDB/XAMPP.
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { externalGet, YF_UA } = require('../lib/http');
const { trainTemporalModel, VERSION } = require('./temporal-training');

dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const MODEL_NAME = 'VALL numeric market forecaster';
const MODEL_VERSION = VERSION;
const HISTORY_LIMIT = 3_000;
let supabaseClient = null;

function getSupabase() {
    if (supabaseClient) return supabaseClient;
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Falta SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. La clave publicable no permite guardar pronósticos privados con RLS activo.');
    supabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return supabaseClient;
}

function cleanSymbol(symbol) {
    const value = String(symbol || '').trim().toUpperCase();
    if (!/^[A-Z0-9.^=-]{1,20}$/i.test(value)) throw new Error('Símbolo inválido.');
    return value;
}

function dateOnly(value) { return new Date(value).toISOString().slice(0, 10); }

function targetDate(latestDate, intervalCode) {
    const next = new Date(`${latestDate}T00:00:00.000Z`);
    if (intervalCode === '1mo') next.setUTCMonth(next.getUTCMonth() + 1);
    else if (intervalCode === '1wk') next.setUTCDate(next.getUTCDate() + 7);
    else next.setUTCDate(next.getUTCDate() + 1);
    return dateOnly(next);
}

function chunks(values, size = 250) {
    const result = [];
    for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
    return result;
}

async function fetchYahooHistory(symbol, intervalCode, { get = externalGet, now = Date.now() } = {}) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(intervalCode)}&range=10y`;
    const response = await get(url, { 'User-Agent': YF_UA, Accept: 'application/json' }, 30_000);
    if (!response.ok) throw new Error(`Yahoo Finance respondió HTTP ${response.status}.`);
    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const timestamps = result?.timestamp || [];
    const rawCloses = result?.indicators?.quote?.[0]?.close || [];
    const adjusted = result?.indicators?.adjclose?.[0]?.adjclose;
    if (!Array.isArray(adjusted) && !/[=^]|-[A-Z]{3}$/.test(symbol)) throw new Error('Faltan cierres ajustados de la acción; no se entrena con saltos por splits o dividendos sin confirmar.');
    const closes = Array.isArray(adjusted) ? adjusted : rawCloses;
    const today = dateOnly(now), current = new Date(now);
    const monthStart = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1);
    const weekStart = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() - (current.getUTCDay() + 6) % 7);
    const end = result?.meta?.currentTradingPeriod?.regular?.end;
    const deduplicated = new Map();
    for (let index = 0; index < timestamps.length; index++) {
        const timestamp = Number(timestamps[index]) * 1000, raw = closes[index];
        if (raw == null || raw === '' || typeof raw === 'boolean' || !Number.isFinite(timestamp) || timestamp > now) continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value <= 0) continue;
        const date = dateOnly(timestamp);
        if (intervalCode === '1mo' && timestamp >= monthStart || intervalCode === '1wk' && timestamp >= weekStart
            || intervalCode === '1d' && date === today && (!Number.isFinite(end) || now < end * 1000 + 15 * 60000)) continue;
        if (deduplicated.has(date) && deduplicated.get(date) !== value) throw new Error('La fuente devolvió dos valores distintos para la misma observación.');
        deduplicated.set(date, value);
    }
    return [...deduplicated.entries()].map(([observed_at, value]) => ({ observed_at, value })).sort((left, right) => left.observed_at.localeCompare(right.observed_at));
}

async function persistObservations(supabase, symbol, intervalCode, observations) {
    const rows = observations.slice(-HISTORY_LIMIT).map(point => ({
        symbol, interval_code: intervalCode, observed_at: point.observed_at, value: point.value,
        quality_score: 90, source: { provider: 'yahoo_finance', symbol, interval: intervalCode },
    }));
    for (const batch of chunks(rows)) {
        const { error } = await supabase.from('forecast_observations').upsert(batch, { onConflict: 'symbol,interval_code,observed_at' });
        if (error) throw error;
    }
    return rows.length;
}

async function evaluateDuePredictions(supabase, symbol, intervalCode) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: predictions, error } = await supabase.from('forecast_predictions')
        .select('id, target_at, predicted_value, lower_bound, upper_bound')
        .eq('symbol', symbol).eq('interval_code', intervalCode).lte('target_at', today);
    if (error) throw error;
    let evaluated = 0;
    for (const prediction of predictions || []) {
        const { data: existing, error: existingError } = await supabase.from('forecast_evaluations').select('id').eq('prediction_id', prediction.id).maybeSingle();
        if (existingError) throw existingError;
        if (existing) continue;
        const { data: actualRow, error: actualError } = await supabase.from('forecast_observations')
            .select('value, observed_at').eq('symbol', symbol).eq('interval_code', intervalCode)
            .gte('observed_at', prediction.target_at).order('observed_at', { ascending: true }).limit(1).maybeSingle();
        if (actualError) throw actualError;
        const actual = Number(actualRow?.value);
        if (actualRow?.value == null || typeof actualRow.value === 'boolean' || !Number.isFinite(actual) || actual <= 0) continue;
        const predicted = Number(prediction.predicted_value);
        const absoluteError = Math.abs(actual - predicted);
        const percentageError = actual === 0 ? null : absoluteError / Math.abs(actual) * 100;
        const { error: insertError } = await supabase.from('forecast_evaluations').insert({
            prediction_id: prediction.id, actual_value: actual, absolute_error: absoluteError,
            percentage_error: percentageError,
            interval_covered: actual >= Number(prediction.lower_bound) && actual <= Number(prediction.upper_bound),
            evaluated_observation_at: actualRow.observed_at,
        });
        if (insertError) throw insertError;
        evaluated++;
    }
    return evaluated;
}

async function trainForSymbol(rawSymbol, { intervalCode = '1d', repository = null, historyLoader = fetchYahooHistory } = {}) {
    const symbol = cleanSymbol(rawSymbol);
    if (!['1d', '1wk', '1mo'].includes(intervalCode)) throw new Error('Intervalo no permitido; usa 1d, 1wk o 1mo.');
    const supabase = repository || getSupabase();
    const observations = await historyLoader(symbol, intervalCode);
    if (!observations.length) throw new Error(`Yahoo Finance no devolvió observaciones para ${symbol}.`);
    const persistedObservations = await persistObservations(supabase, symbol, intervalCode, observations);
    const evaluatedPredictions = await evaluateDuePredictions(supabase, symbol, intervalCode);
    const assessment = trainTemporalModel(observations.map(point => ({ date: point.observed_at, value: point.value })));
    const parameters = {
        validation: assessment.evaluation || null, selection: assessment.selection || null, observations: assessment.observations,
        publicationGate: 'Selección temporal separada; MAE de validación supera al último valor por al menos 2% y no empeora el modelo anterior.', reason: assessment.reason || null,
        modelArtifact: assessment.model ? {
            targetMode: assessment.model.targetMode, window: assessment.selection?.config.window, lags: assessment.model.lags, ridge: assessment.model.ridge, coefficients: assessment.model.coefficients,
            featureMeans: assessment.model.featureMeans, featureScales: assessment.model.featureScales,
            residualStdDev: assessment.model.residualStdDev, trainingMae: assessment.model.trainingMae,
        } : null,
    };
    const { data: run, error: runError } = await supabase.from('forecast_runs').insert({
        run_key: crypto.randomUUID(), symbol, interval_code: intervalCode, model_name: MODEL_NAME, model_version: MODEL_VERSION,
        training_start: observations[0].observed_at, training_end: observations.at(-1).observed_at,
        cutoff_at: observations.at(-1).observed_at, algorithm: assessment.model?.algorithm || 'baseline_last_value', parameters,
        status: assessment.eligible ? 'accepted' : 'rejected_baseline',
    }).select('id').single();
    if (runError) throw runError;
    if (!assessment.eligible) return { symbol, intervalCode, runId: run.id, persistedObservations, evaluatedPredictions, ...assessment };
    const forecast = assessment.forecast;
    const latest = observations.at(-1);
    const { data: prediction, error: predictionError } = await supabase.from('forecast_predictions').insert({
        forecast_run_id: run.id, symbol, interval_code: intervalCode, generated_at: new Date().toISOString(),
        target_at: targetDate(latest.observed_at, intervalCode), horizon_code: '1-step',
        predicted_value: forecast.value, predicted_change_pct: forecast.changePct,
        lower_bound: forecast.lowerBound, upper_bound: forecast.upperBound,
        probability_up: forecast.probabilityUp, confidence_score: forecast.confidenceScore,
        explanation: `Pronóstico de un paso con ${assessment.observations} observaciones; publicado porque supera al baseline.`,
        evidence: { latestObservedAt: latest.observed_at, walkForward: assessment.evaluation, rangeMethod: forecast.rangeMethod },
    }).select('id').single();
    if (predictionError) throw predictionError;
    return { symbol, intervalCode, runId: run.id, predictionId: prediction.id, persistedObservations,
        evaluatedPredictions, observations: assessment.observations, evaluation: assessment.evaluation, forecast };
}

async function getLatestAcceptedForecast(rawSymbol) {
    const symbol = cleanSymbol(rawSymbol);
    const supabase = getSupabase();
    const { data: predictions, error } = await supabase.from('forecast_predictions')
        .select('*, forecast_runs!inner(model_name, model_version, status, parameters)')
        .eq('symbol', symbol).eq('forecast_runs.status', 'accepted')
        .order('generated_at', { ascending: false }).limit(1);
    if (error) throw error;
    return predictions?.[0] || null;
}

module.exports = { MODEL_NAME, MODEL_VERSION, trainForSymbol, getLatestAcceptedForecast, fetchYahooHistory };
