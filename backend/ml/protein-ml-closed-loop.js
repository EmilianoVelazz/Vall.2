'use strict';

// ============================================================================
// Servicio Closed-Loop para el Motor ML de Proteínas (VALLNews / Dokploy DB)
//
// Responsabilidades:
//  1) Auditar pronósticos vencidos (target_at <= hoy) en Dokploy PostgreSQL
//     comparándolos contra el precio real observado en `forecast_observations`
//     y guardando los resultados inmutables en `forecast_evaluations`.
//  2) Calcular métricas reales de desempeño en producción (tasa de acierto
//     direccional, cobertura empírica Conformal P80, Brier real, MAPE real)
//     por símbolo, especie y región.
//  3) Generar factores de calibración adaptativa (liveShrinkage y bandScale)
//     que retroalimentan a `protein-ml-engine.js` en cada reentrenamiento.
//  4) Ejecutar el ciclo automático completo (ingesta -> auditoría -> calibración
//     -> reentrenamiento -> persistencia) con bloqueo anti-concurrencia.
// ============================================================================

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local'), quiet: true });
require('../lib/tls-trust').configureSystemTrust();

const AUDIT_CACHE_FILE = path.resolve(__dirname, '../cache/protein-ml-closed-loop-audit.json');
const DAY_MS = 86_400_000;

let cachedClient = null;
let runningCycle = null;

function getDokployClient() {
    if (cachedClient) return cachedClient;
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    cachedClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (u, opts = {}) => fetch(u, { ...opts, signal: opts.signal || AbortSignal.timeout(20000) }) },
    });
    return cachedClient;
}

const round = (v, d = 2) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);
const mean = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

function maxLagDaysForInterval(intervalCode) {
    if (intervalCode === '1d') return 10;
    if (intervalCode === '1wk') return 16;
    return 45;
}

// ── 1. Auditar pronósticos vencidos contra observaciones reales ────────────
async function evaluateDueProteinPredictions({ supabase = getDokployClient(), now = Date.now(), limit = 400 } = {}) {
    if (!supabase) return { status: 'disabled', evaluated: 0, skipped: 0, pendingDue: 0 };
    const todayIso = new Date(now).toISOString().slice(0, 10);

    // Fetch matured predictions from MARRANAS (including legacy protein-ml% runs for continuity)
    const { data: preds, error: predErr } = await supabase
        .from('forecast_predictions')
        .select('id, forecast_run_id, symbol, interval_code, generated_at, target_at, horizon_code, predicted_value, predicted_change_pct, lower_bound, upper_bound, probability_up, evidence, forecast_runs!inner(model_name, model_version, parameters)')
        .lte('target_at', todayIso)
        .or('model_version.ilike.marranas-ml%,model_version.ilike.protein-ml%', { foreignTable: 'forecast_runs' })
        .order('target_at', { ascending: false })
        .limit(limit);

    if (predErr) throw predErr;
    const rows = Array.isArray(preds) ? preds : [];
    if (!rows.length) {
        return { status: 'connected', evaluated: 0, skipped: 0, pendingDue: 0 };
    }

    // Check which prediction_ids are already evaluated
    const predIds = rows.map(r => r.id);
    const existingSet = new Set();
    for (let i = 0; i < predIds.length; i += 100) {
        const { data: ex, error: exErr } = await supabase
            .from('forecast_evaluations')
            .select('prediction_id')
            .in('prediction_id', predIds.slice(i, i + 100));
        if (exErr) throw exErr;
        for (const row of ex || []) existingSet.add(row.prediction_id);
    }

    const due = rows.filter(r => !existingSet.has(r.id));
    let evaluated = 0;
    let skipped = 0;

    for (const pred of due) {
        const maxDate = new Date(Date.parse(pred.target_at + 'T00:00:00Z') + maxLagDaysForInterval(pred.interval_code) * DAY_MS)
            .toISOString()
            .slice(0, 10);

        const { data: obsRow, error: obsErr } = await supabase
            .from('forecast_observations')
            .select('value, observed_at')
            .eq('symbol', pred.symbol)
            .eq('interval_code', pred.interval_code)
            .gte('observed_at', pred.target_at)
            .lte('observed_at', maxDate)
            .order('observed_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (obsErr || !obsRow || !Number.isFinite(Number(obsRow.value)) || Number(obsRow.value) <= 0) {
            skipped += 1;
            continue;
        }

        const actual = Number(obsRow.value);
        const predicted = Number(pred.predicted_value);
        const absErr = Math.abs(actual - predicted);
        const pctErr = actual > 0 ? (absErr / actual) * 100 : null;
        const covered = actual >= Number(pred.lower_bound) && actual <= Number(pred.upper_bound);

        const { error: insErr } = await supabase.from('forecast_evaluations').upsert({
            prediction_id: pred.id,
            actual_value: actual,
            absolute_error: Number(absErr.toFixed(6)),
            percentage_error: pctErr != null ? Number(pctErr.toFixed(4)) : null,
            interval_covered: covered,
            evaluated_observation_at: obsRow.observed_at,
        }, { onConflict: 'prediction_id', ignoreDuplicates: true });

        if (!insErr) evaluated += 1;
        else skipped += 1;
    }

    return {
        status: 'connected',
        checked: rows.length,
        pendingDue: due.length,
        evaluated,
        skipped,
        evaluatedAt: new Date(now).toISOString(),
    };
}

// ── 2. Cargar auditoría real desde Dokploy y derivar calibración adaptativa ─
async function buildClosedLoopAuditAndFeedback({ supabase = getDokployClient(), now = Date.now(), limit = 600 } = {}) {
    if (!supabase) {
        return {
            status: 'disabled',
            generatedAt: new Date(now).toISOString(),
            summary: { totalEvaluated: 0 },
            feedbackBySymbol: {},
            feedbackBySpecies: {},
        };
    }

    const { data, error } = await supabase
        .from('forecast_evaluations')
        .select(`
            id, actual_value, absolute_error, percentage_error, interval_covered, evaluated_observation_at, created_at,
            forecast_predictions!inner(
                id, symbol, interval_code, horizon_code, target_at, predicted_value, predicted_change_pct,
                lower_bound, upper_bound, probability_up, evidence,
                forecast_runs!inner(model_name, model_version, parameters)
            )
        `)
        .or('model_version.ilike.marranas-ml%,model_version.ilike.protein-ml%', { foreignTable: 'forecast_predictions.forecast_runs' })
        .order('evaluated_observation_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];

    const FLAT_ACTUAL_THRESHOLD = 0.0005; // < 0.05% es precio plano: no es alza ni baja
    const seenWindows = new Set();
    let duplicatesRemoved = 0;
    const records = [];
    for (const row of rows) {
        const pred = row.forecast_predictions;
        const run = pred?.forecast_runs;
        const params = run?.parameters && typeof run.parameters === 'object' ? run.parameters : {};
        const ev = pred?.evidence && typeof pred.evidence === 'object' ? pred.evidence : {};

        const targetDay = String(pred?.target_at || '').slice(0, 10);
        const dedupeKey = `${pred?.symbol || ''}|${targetDay}|${pred?.horizon_code || ''}`;
        if (seenWindows.has(dedupeKey)) {
            duplicatesRemoved++;
            continue;
        }
        seenWindows.add(dedupeKey);

        const actual = Number(row.actual_value);
        const lastVal = Number(ev.lastValue);
        const probUp = pred?.probability_up != null ? Number(pred.probability_up) : null;
        const pctErr = row.percentage_error != null ? Number(row.percentage_error) : null;
        const covered = Boolean(row.interval_covered);

        let actualUp = null;
        let dirHit = null;
        let brier = null;
        let flatActual = false;
        if (Number.isFinite(lastVal) && lastVal > 0 && Number.isFinite(actual) && actual > 0) {
            const relDiff = (actual - lastVal) / lastVal;
            if (Math.abs(relDiff) < FLAT_ACTUAL_THRESHOLD) {
                // Precio plano: se excluye del acierto direccional y Brier para evitar falsos positivos bajistas
                flatActual = true;
            } else {
                actualUp = relDiff > 0 ? 1 : 0;
                if (probUp != null && Number.isFinite(probUp)) {
                    const predUp = probUp >= 0.5 ? 1 : 0;
                    dirHit = predUp === actualUp ? 1 : 0;
                    brier = (probUp - actualUp) ** 2;
                }
            }
        }

        records.push({
            symbol: pred.symbol,
            species: params.species || 'desconocida',
            region: params.region || 'GLOBAL',
            country: params.country || '',
            horizonCode: pred.horizon_code,
            targetAt: pred.target_at,
            evaluatedAt: row.evaluated_observation_at,
            lastValue: Number.isFinite(lastVal) ? lastVal : null,
            predictedValue: Number(pred.predicted_value),
            actualValue: actual,
            percentageError: pctErr,
            intervalCovered: covered,
            probabilityUp: probUp,
            directionalHit: dirHit,
            flatActual,
            brier,
            modelVersion: run?.model_version || null,
        });
    }

    const summarize = list => {
        if (!list.length) return null;
        const hits = list.map(r => r.directionalHit).filter(v => v === 0 || v === 1);
        const flatExcluded = list.filter(r => r.flatActual).length;
        const briers = list.map(r => r.brier).filter(Number.isFinite);
        const mapes = list.map(r => r.percentageError).filter(Number.isFinite);
        const covs = list.map(r => (r.intervalCovered ? 1 : 0));

        const hitRatePct = hits.length ? round(mean(hits) * 100, 1) : null;
        const avgBrier = briers.length ? round(mean(briers), 4) : null;
        const avgMapePct = mapes.length ? round(mean(mapes), 2) : null;
        const coveragePct = round(mean(covs) * 100, 1);

        // Adaptive closed-loop calibration factors (bounded strictly for stability)
        // 1) If empirical P80 coverage is too narrow (<72%), widen bands; if overly wide (>94%), tighten slightly
        let bandScale = 1.0;
        if (list.length >= 2) {
            if (coveragePct < 60) bandScale = 1.25;
            else if (coveragePct < 74) bandScale = 1.12;
            else if (coveragePct > 94 && list.length >= 6) bandScale = 0.94;
        }
        // 2) If realized Brier is noisy (>0.24), apply mild probability shrinkage toward 50%
        let probShrinkage = 0.0;
        if (avgBrier != null && briers.length >= 2) {
            if (avgBrier > 0.28) probShrinkage = 0.22;
            else if (avgBrier > 0.23) probShrinkage = 0.12;
        }

        return {
            evaluations: list.length,
            directionalEvaluations: hits.length,
            flatExcluded,
            directionalHitRatePct: hitRatePct,
            conformal80CoveragePct: coveragePct,
            avgBrierScore: avgBrier,
            avgMapePct,
            calibration: { bandScale, probShrinkage },
        };
    };

    const feedbackBySymbol = {};
    const feedbackBySpecies = {};
    const feedbackByRegion = {};

    const symGroups = new Map();
    const spGroups = new Map();
    const regGroups = new Map();
    for (const r of records) {
        if (!symGroups.has(r.symbol)) symGroups.set(r.symbol, []);
        symGroups.get(r.symbol).push(r);
        if (!spGroups.has(r.species)) spGroups.set(r.species, []);
        spGroups.get(r.species).push(r);
        if (!regGroups.has(r.region)) regGroups.set(r.region, []);
        regGroups.get(r.region).push(r);
    }

    for (const [k, list] of symGroups.entries()) feedbackBySymbol[k] = summarize(list);
    for (const [k, list] of spGroups.entries()) feedbackBySpecies[k] = summarize(list);
    for (const [k, list] of regGroups.entries()) feedbackByRegion[k] = summarize(list);

    const overall = summarize(records) || {
        evaluations: 0,
        directionalHitRatePct: null,
        conformal80CoveragePct: null,
        avgBrierScore: null,
        avgMapePct: null,
        calibration: { bandScale: 1, probShrinkage: 0 },
    };

    const audit = {
        status: 'connected',
        generatedAt: new Date(now).toISOString(),
        summary: {
            totalEvaluated: records.length,
            rawEvaluations: rows.length,
            duplicatesRemoved,
            uniqueSymbolsEvaluated: symGroups.size,
            ...overall,
        },
        bySpecies: feedbackBySpecies,
        byRegion: feedbackByRegion,
        feedbackBySymbol,
        recentEvaluations: records.slice(0, 25),
    };

    fs.mkdirSync(path.dirname(AUDIT_CACHE_FILE), { recursive: true });
    fs.writeFileSync(AUDIT_CACHE_FILE, JSON.stringify(audit, null, 2), 'utf8');
    return audit;
}

// ── 3. Sembrar puntos de control históricos reales (out-of-time 30 días atrás)
// Permite auditar inmediatamente el desempeño real fuera de muestra usando
// datos truncados estrictamente a `cutoffDate` (cero fuga futura) y evaluarlos
// contra los precios reales observados un mes después en Dokploy PostgreSQL.
async function runStrictOutOfTimeBacktestAudit({
    seriesCatalog = [],
    exogenousPools = {},
    supabase = getDokployClient(),
    cutoffDaysAgo = 32,
    now = Date.now(),
} = {}) {
    if (!supabase || !seriesCatalog.length) return { seededRuns: 0, seededPredictions: 0 };
    const { buildProteinMLReport, PROTEIN_ML_VERSION } = require('./protein-ml-engine');

    const cutoffMs = now - cutoffDaysAgo * DAY_MS;
    const cutoffIso = new Date(cutoffMs).toISOString().slice(0, 10);

    const truncatedCatalog = seriesCatalog
        .map(s => ({
            ...s,
            points: (s.points || []).filter(pt => pt?.date && pt.date <= cutoffIso),
        }))
        .filter(s => s.points.length >= 14);

    const truncatedExog = {};
    for (const [k, pts] of Object.entries(exogenousPools || {})) {
        const cut = (pts || []).filter(pt => pt?.date && pt.date <= cutoffIso);
        if (cut.length >= 12) truncatedExog[k] = cut;
    }

    const pastArtifact = buildProteinMLReport({
        seriesCatalog: truncatedCatalog,
        exogenousPools: truncatedExog,
        now: cutoffMs,
    });

    // Avoid duplicate seeding for the same cutoff date
    const { data: existingPast } = await supabase
        .from('forecast_runs')
        .select('symbol')
        .eq('cutoff_at', cutoffIso)
        .ilike('model_version', 'protein-ml%');
    const alreadySeeded = new Set((existingPast || []).map(r => r.symbol));

    let seededRuns = 0;
    let seededPredictions = 0;
    const active = (pastArtifact.forecasts || []).filter(f => f.available && f.primaryForecast);

    for (const f of active) {
        const symCode = f.symbol.slice(0, 40);
        if (alreadySeeded.has(symCode)) continue;
        const p = f.primaryForecast;
        const intervalCode = f.cadence === 'daily' ? '1d' : f.cadence === 'weekly' ? '1wk' : '1mo';
        const runRow = {
            run_key: crypto.randomUUID(),
            symbol: symCode,
            interval_code: intervalCode,
            model_name: `MARRANAS ML Audit (${f.species} · ${f.region})`,
            model_version: `${PROTEIN_ML_VERSION}:audit`,
            training_start: f.dateRange?.start || f.lastDate,
            training_end: f.lastDate,
            cutoff_at: cutoffIso,
            algorithm: p.modelUsed,
            status: p.confidence === 'Cautela' ? 'rejected_baseline' : 'accepted',
            parameters: {
                auditCheckpoint: true,
                species: f.species,
                region: f.region,
                country: f.country,
                unit: f.unit,
                direction: p.direction,
                probUpPct: p.probUpPct,
                probDownPct: p.probDownPct,
                confidence: p.confidence,
            },
        };
        const { data: runData, error: runErr } = await supabase.from('forecast_runs').insert(runRow).select('id').single();
        if (runErr) continue;
        seededRuns += 1;

        const targetDate = new Date(Date.parse(f.lastDate + 'T00:00:00Z') + (
            f.cadence === 'daily' ? Math.round(p.steps * 1.4) * DAY_MS
                : f.cadence === 'weekly' ? p.steps * 7 * DAY_MS
                    : p.steps * 30 * DAY_MS
        )).toISOString().slice(0, 10);

        // Only insert predictions whose target date has already matured by today
        const todayIso = new Date(now).toISOString().slice(0, 10);
        if (targetDate > todayIso) continue;

        const predRow = {
            forecast_run_id: runData.id,
            symbol: symCode,
            interval_code: intervalCode,
            generated_at: new Date(cutoffMs).toISOString(),
            target_at: targetDate,
            horizon_code: p.code || `${p.steps}-step`,
            predicted_value: p.projectedValue,
            predicted_change_pct: p.expectedChangePct,
            lower_bound: p.low80,
            upper_bound: p.high80,
            probability_up: Number((p.probUpPct / 100).toFixed(4)),
            confidence_score: p.confidence === 'Alta' ? 88 : p.confidence === 'Media' ? 74 : 58,
            explanation: `[Audit ${cutoffIso}] ${f.species.toUpperCase()} ${f.country}: ${p.direction} (${p.probUpPct}% subida) a ${p.horizonLabel}.`,
            evidence: {
                auditCheckpoint: true,
                latestObservedAt: f.lastDate,
                lastValue: f.lastValue,
                unit: f.unit,
                direction: p.direction,
            },
        };
        const { error: pErr } = await supabase.from('forecast_predictions').insert(predRow);
        if (!pErr) seededPredictions += 1;
    }

    return { cutoffIso, seededRuns, seededPredictions };
}

function loadCachedClosedLoopAudit() {
    try {
        if (!fs.existsSync(AUDIT_CACHE_FILE)) return null;
        return JSON.parse(fs.readFileSync(AUDIT_CACHE_FILE, 'utf8'));
    } catch {
        return null;
    }
}

// ── 4. Orquestador Completo del Ciclo Cerrado (Auto-Retrain + Auditoría) ───
async function runProteinClosedLoopCycle({ retrain = true, seedAuditIfEmpty = false, now = Date.now() } = {}) {
    if (runningCycle) return runningCycle;
    runningCycle = (async () => {
        const startedAt = Date.now();
        const supabase = getDokployClient();

        // Paso 1: Evaluar pronósticos ya vencidos en Dokploy
        const evalBefore = await evaluateDueProteinPredictions({ supabase, now }).catch(err => ({ status: 'error', error: err.message, evaluated: 0 }));

        // Paso 2: Construir mapa de retroalimentación real desde forecast_evaluations
        let audit = await buildClosedLoopAuditAndFeedback({ supabase, now }).catch(() => loadCachedClosedLoopAudit());

        // Paso 3: Si se solicita reentrenamiento completo, ejecutar pipeline con feedbackMap real
        let trainingResult = null;
        if (retrain) {
            const { runProteinTrainingPipeline } = require('../../scripts/train-protein-ml.cjs');
            trainingResult = await runProteinTrainingPipeline({
                closedLoopFeedback: audit || null,
                seedOutOfTimeAudit: seedAuditIfEmpty && (audit?.summary?.totalEvaluated || 0) < 10,
                now,
            });
            // Re-auditar después de ingestar nuevas observaciones frescas!
            const evalAfter = await evaluateDueProteinPredictions({ supabase, now }).catch(() => ({ evaluated: 0 }));
            audit = await buildClosedLoopAuditAndFeedback({ supabase, now }).catch(() => audit);
            trainingResult.evalAfter = evalAfter;
        }

        const elapsedSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(1));
        return {
            ok: true,
            elapsedSeconds,
            evalBefore,
            auditSummary: audit?.summary || null,
            retrained: Boolean(retrain),
            trainingSummary: trainingResult ? {
                version: trainingResult.artifact?.version,
                activeModels: trainingResult.artifact?.stats?.activeModels,
                avgWalkForwardDirectionalAccuracyPct: trainingResult.artifact?.stats?.avgWalkForwardDirectionalAccuracyPct,
                avgBrierScore: trainingResult.artifact?.stats?.avgBrierScore,
                dokployPersistence: trainingResult.artifact?.stats?.dokployPersistence,
                evalAfter: trainingResult.evalAfter || null,
            } : null,
            completedAt: new Date().toISOString(),
        };
    })().finally(() => {
        runningCycle = null;
    });
    return runningCycle;
}

module.exports = {
    AUDIT_CACHE_FILE,
    evaluateDueProteinPredictions,
    buildClosedLoopAuditAndFeedback,
    runStrictOutOfTimeBacktestAudit,
    loadCachedClosedLoopAudit,
    runProteinClosedLoopCycle,
};
