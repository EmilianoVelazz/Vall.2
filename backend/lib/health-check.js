'use strict';

const fs = require('fs');
const path = require('path');
const { databaseConfig, connectDatabase, isMariaDbConfigured } = require('./database-connection');

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
            fresh: ageHours <= maxAgeHours,
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
            const response = await fetch(`${baseUrl}/rest/v1/`, {
                method: 'HEAD',
                headers: {
                    apikey: apiKey,
                    Authorization: `Bearer ${apiKey}`,
                },
                signal: AbortSignal.timeout(DEEP_PROBE_TIMEOUT_MS),
            });
            // PostgREST responde 200 con Bearer válido (o 401/404 según esquema); cualquier 2xx-4xx confirma conectividad.
            result.supabaseRest = {
                ok: response.status >= 200 && response.status < 500,
                statusCode: response.status,
                latencyMs: Date.now() - start,
            };
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
            maxAgeHours: REPORT_MAX_AGE_HOURS,
            countFn: data => (Array.isArray(data?.reports) ? data.reports.length : 0),
        }),
        mexico: inspectJsonCache('mexico-executive-reports.json', {
            maxAgeHours: REPORT_MAX_AGE_HOURS,
            countFn: data => (Array.isArray(data?.reports) ? data.reports.length : 0),
        }),
    };

    const proteinMl = inspectJsonCache('protein-ml-forecasts.json', {
        maxAgeHours: 168,
        countFn: data => {
            if (Array.isArray(data?.forecasts)) return data.forecasts.length;
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
    }
    if (!proteinMl.exists) degradedReasons.push('proteinMl:missing');

    let connectivity = null;
    if (deep) {
        connectivity = await probeStorageDeep();
        if (connectivity.postgres && !connectivity.postgres.ok) degradedReasons.push('postgres:unreachable');
        if (connectivity.supabaseRest && !connectivity.supabaseRest.ok) degradedReasons.push('supabaseRest:unreachable');
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
