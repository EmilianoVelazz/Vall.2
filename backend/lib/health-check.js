'use strict';

const fs = require('fs');
const path = require('path');
const { databaseConfig, connectDatabase, isMariaDbConfigured } = require('./database-connection');
const {MODEL_VERSION} = require('../ml/protein-forecast-policy');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
const REPORT_MAX_AGE_HOURS = 26;
const DEEP_PROBE_CACHE_MS = 30_000;
const DEEP_PROBE_TIMEOUT_MS = 2500;

let cachedDeepProbe = { at: 0, value: null };

function round1(value) {
    return Number.isFinite(value) ? Number(value.toFixed(1)) : null;
}

function inspectJsonCache(filename, { maxAgeHours = REPORT_MAX_AGE_HOURS, countFn = null } = {}) {
    const filePath = path.join(CACHE_DIR, filename);
    try {
        const stat = fs.statSync(filePath);
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        const rawTs = parsed?.generatedAt || parsed?.updatedAt || parsed?.timestamp || null;
        const tsMs = rawTs ? Date.parse(rawTs) : stat.mtimeMs;
        const effectiveMs = Number.isFinite(tsMs) ? tsMs : stat.mtimeMs;
        const ageHours = Math.max(0, (Date.now() - effectiveMs) / 3_600_000);
        const count = typeof countFn === 'function' ? countFn(parsed) : null;
        return {
            exists: true,
            fresh: ageHours <= maxAgeHours && effectiveMs <= Date.now() + 60000,
            generatedAt: new Date(effectiveMs).toISOString(),
            ageHours: round1(ageHours),
            ...(count !== null ? { count } : {}),
            ...(parsed?.model ? { model: String(parsed.model) } : {}),
            ...(parsed?.version ? { version: String(parsed.version) } : {}),
        };
    } catch {
        return {
            exists: false,
            fresh: false,
            generatedAt: null,
            ageHours: null,
        };
    }
}

async function probeStorageDeep() {
    const now = Date.now();
    if (cachedDeepProbe.value && (now - cachedDeepProbe.at) < DEEP_PROBE_CACHE_MS) {
        return cachedDeepProbe.value;
    }

    const result = { postgres: null, supabaseRest: null };

    if (databaseConfig()) {
        const start = Date.now();
        let db = null;
        try {
            db = await connectDatabase();
            if (db) {
                await db.query('SELECT 1');
                result.postgres = { ok: true, latencyMs: Date.now() - start };
            }
        } catch {
            result.postgres = { ok: false, latencyMs: Date.now() - start };
        } finally {
            await db?.end?.().catch(() => {});
        }
    }

    const baseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const apiKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
    if (baseUrl && apiKey) {
        const start = Date.now();
        try {
            const response = await fetch(`${baseUrl}/rest/v1/app_profiles?select=id&limit=0`, {
                method: 'GET',
                headers: {
                    apikey: apiKey,
                    Authorization: `Bearer ${apiKey}`,
                },
                signal: AbortSignal.timeout(DEEP_PROBE_TIMEOUT_MS),
            });
            // Consultar cero filas comprueba permiso y esquema sin leer perfiles.
            // Un 401/403/404 es una conexión inutilizable para la aplicación.
            result.supabaseRest = {
                ok: response.ok,
                statusCode: response.status,
                latencyMs: Date.now() - start,
            };
            await response.body?.cancel().catch(() => {});
        } catch {
            result.supabaseRest = { ok: false, statusCode: null, latencyMs: Date.now() - start };
        }
    }

    cachedDeepProbe = { at: now, value: result };
    return result;
}

async function buildHealthPayload({ deep = false } = {}) {
    const reports = {
        finance: inspectJsonCache('finance_executive_reports.json', {
            maxAgeHours: REPORT_MAX_AGE_HOURS,
            countFn: data => (Array.isArray(data?.reports) ? data.reports.length : 0),
        }),
        markets: inspectJsonCache('market_executive_reports.json', {
            // Mercados conserva el corte semanal de los viernes a las 14:00.
            maxAgeHours: 7 * 24,
            countFn: data => (Array.isArray(data?.reports) ? data.reports.length : 0),
        }),
        mexico: inspectJsonCache('mexico-executive-reports.json', {
            maxAgeHours: REPORT_MAX_AGE_HOURS,
            countFn: data => (Array.isArray(data?.reports) ? data.reports.length : 0),
        }),
    };

    const proteinMl = inspectJsonCache('protein-ml-forecasts.json', {
        maxAgeHours: REPORT_MAX_AGE_HOURS,
        countFn: data => {
            if (Array.isArray(data?.forecasts)) return data.forecasts.filter(item => item.available).length;
            if (data?.forecasts && typeof data.forecasts === 'object') return Object.keys(data.forecasts).length;
            return 0;
        },
    });

    const config = {
        postgresConfigured: Boolean(databaseConfig()),
        supabaseRestConfigured: Boolean(
            (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
            && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
        ),
        mariadbConfigured: isMariaDbConfigured(),
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
        backgroundJobsEnabled: String(process.env.RUN_BACKGROUND_JOBS || 'true').toLowerCase() !== 'false',
    };

    const degradedReasons = [];
    for (const [key, item] of Object.entries(reports)) {
        if (!item.exists) degradedReasons.push(`reports.${key}:missing`);
        else if (!item.fresh) degradedReasons.push(`reports.${key}:stale`);
        else if (item.count === 0) degradedReasons.push(`reports.${key}:empty`);
    }
    if (!proteinMl.exists) degradedReasons.push('proteinMl:missing');
    else if (proteinMl.version !== MODEL_VERSION) degradedReasons.push('proteinMl:requires_retraining');
    else if (!proteinMl.fresh) degradedReasons.push('proteinMl:stale');
    proteinMl.trainingState = !proteinMl.exists ? 'missing' : proteinMl.version !== MODEL_VERSION
        ? 'requires_retraining' : proteinMl.count ? 'ready' : 'abstained';

    let connectivity = null;
    let mail = null;
    if (deep) {
        connectivity = await probeStorageDeep();
        if (connectivity.postgres && !connectivity.postgres.ok) degradedReasons.push('postgres:unreachable');
        if (connectivity.supabaseRest && !connectivity.supabaseRest.ok) degradedReasons.push('supabaseRest:unreachable');
        const mailer = require('../services/report-mailer');
        if (config.backgroundJobsEnabled && mailer.mailAutomationEnabled()) {
            const worker = require('./report-email-worker').reportEmailWorkerStatus();
            const recentFailure = Number.isFinite(Date.parse(worker.lastFailureAt))
                && Date.now() - Date.parse(worker.lastFailureAt) <= 15 * 60_000;
            const heartbeatHealthy = worker.active && Number.isFinite(Date.parse(worker.lastCheckedAt))
                && Date.now() - Date.parse(worker.lastCheckedAt) <= 3 * 60_000;
            mail = {configured: mailer.reportMailStatus().configured, workerActive: worker.active,
                heartbeatHealthy: Boolean(heartbeatHealthy), recentFailure,
                lastCheckedAt: worker.lastCheckedAt, lastCompletedAt: worker.lastCompletedAt};
            if (!mail.configured) degradedReasons.push('mail:not_configured');
            if (recentFailure) degradedReasons.push('mail:recent_delivery_failure');
            if (process.uptime() > 180 && !heartbeatHealthy) degradedReasons.push('mail:worker_unresponsive');
        }
    }

    const mem = process.memoryUsage();
    const status = degradedReasons.length === 0 ? 'ok' : 'degraded';

    return {
        ok: status === 'ok',
        status,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        checks: {
            reports,
            proteinMl,
            config,
            ...(connectivity ? { connectivity } : {}),
            ...(mail ? { mail } : {}),
        },
        ...(degradedReasons.length ? { degradedReasons } : {}),
        memoryMb: {
            rss: round1(mem.rss / 1_048_576),
            heapUsed: round1(mem.heapUsed / 1_048_576),
            heapTotal: round1(mem.heapTotal / 1_048_576),
        },
    };
}

module.exports = { buildHealthPayload, inspectJsonCache };
