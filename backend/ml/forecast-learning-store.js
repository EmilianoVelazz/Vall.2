'use strict';

const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { MODEL_VERSION } = require('./adaptive-forecast');
const { journal } = require('./forecast-journal');

const TABLE = 'forecast_learning_trials';
const MAX_RECORDS = 120;
let client;

function getClient() {
    if (client) return client;
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw Object.assign(new Error('Almacén no configurado.'), { code: 'LEARNING_NOT_CONFIGURED' });
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
        fetch: (url, options = {}) => fetch(url, { ...options, signal: options.signal
            ? AbortSignal.any([options.signal, AbortSignal.timeout(2500)]) : AbortSignal.timeout(2500) }),
    } });
    return client;
}

const repository = {
    backend: 'supabase',
    async pending(limit = 12) {
        const { data, error } = await getClient().from(TABLE).select('symbol,horizon').eq('status','pending').order('issued_at',{ascending:true}).limit(Math.min(120,limit*5));
        if (error) throw error;
        return [...new Map((data || []).map(row=>[`${row.symbol}:${row.horizon}`,row])).values()].slice(0,limit);
    },
    async list(symbol, horizon) {
        const { data, error } = await getClient().from(TABLE).select('*').eq('symbol', symbol).eq('horizon', horizon)
            .order('issued_at', { ascending: false }).limit(MAX_RECORDS);
        if (error) throw error;
        return data || [];
    },
    async complete(updates) {
        if (!updates.length) return [];
        const { data, error } = await getClient().rpc('complete_forecast_learning_trials', { updates });
        if (error) throw error;
        return (data || []).map(row => row.id);
    },
    async save(trial) {
        const { data, error } = await getClient().from(TABLE).upsert(trial, { onConflict: 'trial_key', ignoreDuplicates: true }).select('*');
        if (error) throw error;
        if (data?.[0]) return data[0];
        const existing = await getClient().from(TABLE).select('*').eq('trial_key', trial.trial_key).single();
        if (existing.error) throw existing.error;
        return existing.data;
    },
};

function evaluateTrial(trial, points, { unit, priceBasis, now = Date.now() }) {
    if (trial.status !== 'pending' || Date.parse(trial.issued_at) > now) return null;
    const origin = points.findIndex(point => point.date === trial.cutoff_at);
    if (origin < 0) return null;
    const anchor = points[origin].value;
    const revised = trial.unit !== unit || trial.price_basis !== priceBasis
        || Math.abs(anchor - Number(trial.anchor_value)) > Math.max(1e-6, Math.abs(anchor) * 1e-6);
    if (revised) return { id: trial.id, status: 'data_revised', actual_observed_at: null,
        outcome: { diagnosis: ['El proveedor cambió la base histórica o la unidad. No se usa este caso para ajustar el modelo.'], causalExplanation: 'No se atribuye a un fallo del pronosticador.' } };
    const target = points[origin + trial.horizon];
    // Cuenta observaciones reales tras el corte: nunca usa una fecha aproximada
    // ni adelanta la etiqueta por fines de semana o festivos.
    const confirmedSameDay = target && trial.session_target_date === target.date
        && Date.parse(trial.issued_at) < Date.parse(trial.session_target_close_at)
        && Date.parse(trial.session_target_close_at) <= now;
    if (!target || target.date > new Date(now).toISOString().slice(0, 10)
        || Date.parse(trial.issued_at) >= Date.parse(`${target.date}T00:00:00Z`) && !confirmedSameDay) return null;
    const predicted = Number(trial.predicted_value);
    const actual = target.value;
    const signedError = actual - predicted;
    const absoluteError = Math.abs(signedError);
    const baselineError = Math.abs(actual - Number(trial.anchor_value));
    const covered = actual >= Number(trial.lower_bound) && actual <= Number(trial.upper_bound);
    const directionCorrect = Math.sign(actual - Number(trial.anchor_value)) === Math.sign(predicted - Number(trial.anchor_value));
    const diagnosis = [signedError > 0 ? 'La estimación quedó por debajo del resultado real.'
        : signedError < 0 ? 'La estimación quedó por encima del resultado real.' : 'La estimación coincidió con el resultado real.'];
    if (!directionCorrect) diagnosis.push('El movimiento no siguió la dirección estimada.');
    if (!covered) diagnosis.push('El movimiento quedó fuera del rango orientativo.');
    if (absoluteError > baselineError) diagnosis.push('Conservar el último precio habría producido menos error en este caso.');
    const moveScale = Number(trial.assessment?.learning?.moveScale);
    if (moveScale > 0 && Math.abs(actual - Number(trial.anchor_value)) > moveScale) diagnosis.push('El movimiento superó el tamaño observado en el 90% de los ejemplos históricos de ese horizonte. Es una señal de cambio, no una causa demostrada.');
    return { id: trial.id, status: 'evaluated', actual_observed_at: target.date,
        outcome: { actual, predicted, signedError, absoluteError, percentageError: absoluteError / actual * 100,
            baselineError, intervalCovered: covered, directionCorrect, diagnosis,
            causalExplanation: 'Estas observaciones describen el error. Una causa económica o una noticia concreta requiere evidencia adicional.',
            candidateErrors: Object.fromEntries(Object.entries(trial.candidates || {}).filter(([, value]) => Number.isFinite(value) && value > 0).map(([key, value]) => [key, actual - value])),
            policyErrors: Number.isFinite(trial.assessment?.learning?.shadowEnsemble) ? { ensemble: actual - trial.assessment.learning.shadowEnsemble } : {},
        } };
}

function compatibleFeedback(trial, points, options) {
    if (trial.status !== 'evaluated' || trial.unit !== options.unit || trial.price_basis !== options.priceBasis) return false;
    if (options.modelVersion && trial.model_version !== options.modelVersion) return false;
    const origin = points.find(point => point.date === trial.cutoff_at);
    const actual = points.find(point => point.date === trial.actual_observed_at);
    return origin && actual && Math.abs(origin.value - Number(trial.anchor_value)) <= Math.max(1e-6, origin.value * 1e-6)
        && Math.abs(actual.value - Number(trial.outcome?.actual)) <= Math.max(1e-6, actual.value * 1e-6);
}

const learningRepository = process.env.ORION_FORECAST_STORAGE === 'supabase' || process.env.VERCEL && process.env.ORION_FORECAST_STORAGE !== 'local' ? repository : journal;

function createLearningStore(repo = learningRepository) {
    return {
        async review(symbol, horizon, points, options) {
            try {
                let trials = (await repo.list(symbol, horizon)).filter(row => row.symbol === symbol && row.horizon === horizon).slice(0, MAX_RECORDS);
                const updates = trials.map(trial => evaluateTrial(trial, points, options)).filter(Boolean);
                if (updates.length && options.persist !== false) {
                    const changed = new Set(await repo.complete(updates));
                    const stamp = new Date(options.now ?? Date.now()).toISOString();
                    trials = trials.map(trial => changed.has(trial.id) ? { ...trial, ...updates.find(row => row.id === trial.id), evaluated_at: stamp } : trial);
                }
                const feedback = trials.filter(trial => compatibleFeedback(trial, points, options)).sort((a, b) => a.actual_observed_at.localeCompare(b.actual_observed_at));
                const resolved = feedback.slice(-32);
                const average = field => resolved.length ? resolved.reduce((sum, trial) => sum + trial.outcome[field], 0) / resolved.length : null;
                return { status: 'connected', feedback,
                    summary: { storageBackend: repo.backend || 'custom', realEvaluations: feedback.length, pending: trials.filter(trial => trial.status === 'pending').length,
                        dataRevisions: trials.filter(trial => trial.status === 'data_revised').length,
                        realMae: average('absoluteError'), baselineMae: average('baselineError'),
                        evaluatedWindow: resolved.length, meanSignedError: average('signedError'),
                        intervalCoverage: resolved.length ? resolved.filter(trial => trial.outcome.intervalCovered === true).length / resolved.length : null,
                        directionAccuracy: resolved.length ? resolved.filter(trial => trial.outcome.directionCorrect === true).length / resolved.length : null,
                        publishedEvaluations: feedback.filter(trial => trial.is_published).length,
                        shadowEvaluations: feedback.filter(trial => !trial.is_published).length,
                        publishedMae: resolved.some(trial=>trial.is_published) ? resolved.filter(trial=>trial.is_published).reduce((sum,trial)=>sum+trial.outcome.absoluteError,0)/resolved.filter(trial=>trial.is_published).length : null,
                        recentErrors: resolved.slice(-3).map(trial => ({ cutoff: trial.cutoff_at, resultDate: trial.actual_observed_at,
                            predicted: Number(trial.predicted_value), actual: trial.outcome.actual, absoluteError: trial.outcome.absoluteError,
                            baselineError: trial.outcome.baselineError, diagnosis: trial.outcome.diagnosis, published: trial.is_published })),
                    } };
            } catch (error) {
                return { status: 'unavailable', feedback: [], summary: { realEvaluations: 0, pending: 0 },
                    reason: error.code === 'PGRST205' ? 'Falta activar la tabla privada de aprendizaje.' : 'No se pudo verificar el historial persistente en esta consulta.' };
            }
        },
        async record(symbol, horizon, points, assessment, options) {
            if (options.persist === false || !assessment.forecast) return { status: 'not_recorded', assessment };
            const cutoff = points.at(-1);
            const modelVersion = options.modelVersion || MODEL_VERSION;
            const trialKey = crypto.createHash('sha256').update(JSON.stringify([symbol, horizon, cutoff.date, cutoff.value, options.unit, options.priceBasis, modelVersion])).digest('hex');
            const forecast = assessment.forecast;
            const trial = { trial_key: trialKey, symbol, horizon, cutoff_at: cutoff.date,
                issued_at: new Date(options.now ?? Date.now()).toISOString(), unit: options.unit, price_basis: options.priceBasis,
                anchor_value: cutoff.value, model_version: modelVersion, is_published: assessment.eligible,
                predicted_value: forecast.value, lower_bound: forecast.lowerBound, upper_bound: forecast.upperBound,
                candidates: assessment.candidateForecasts, assessment, status: 'pending',
                session_target_date: options.sessionTarget?.date || null,
                session_target_close_at: options.sessionTarget?.closesAt || null,
            };
            try {
                const saved = await repo.save(trial);
                // Conserva la primera estimación emitida para este corte. Una
                // segunda consulta no reemplaza el pronóstico que se evaluará.
                return { status: 'recorded', assessment: saved.assessment, trialKey: saved.trial_key };
            } catch { return { status: 'unavailable', assessment }; }
        },
    };
}

module.exports = { TABLE, MAX_RECORDS, createLearningStore, evaluateTrial, compatibleFeedback, learningRepository, learningStore: createLearningStore() };
