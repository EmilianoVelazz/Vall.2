'use strict';

// Importador único para recuperar el caché existente. Reutiliza la conexión
// administrativa ya configurada localmente; nunca imprime credenciales.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function fingerprint(value) {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function getExistingConnection() {
    const source = fs.readFileSync(path.resolve(__dirname, 'create_supabase_tables.js'), 'utf8');
    const read = name => {
        const match = source.match(new RegExp(`${name}\\s*:\\s*(?:'([^']+)'|(\\d+))`));
        if (!match) throw new Error(`No se encontró ${name} en la configuración local de Supabase.`);
        return match[1] || match[2];
    };
    return {
        host: read('host'), port: Number(read('port')), database: read('database'),
        user: read('user'), password: read('password'), ssl: { rejectUnauthorized: false },
    };
}

async function connectToSupabase() {
    const config = getExistingConnection();
    const direct = new Client(config);
    try {
        await direct.connect();
        return direct;
    } catch (directError) {
        await direct.end().catch(() => {});
        const reference = config.host.match(/^db\.([^.]+)\.supabase\.co$/)?.[1];
        if (!reference) throw directError;
        const regions = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-south-1', 'sa-east-1', 'ca-central-1'];
        const attempts = await Promise.all(regions.map(async region => {
            const pooler = new Client({
                host: `aws-0-${region}.pooler.supabase.com`, port: 6543, database: config.database,
                user: `postgres.${reference}`, password: config.password, ssl: config.ssl, connectionTimeoutMillis: 8_000,
            });
            try { await pooler.connect(); return pooler; } catch { await pooler.end().catch(() => {}); return null; }
        }));
        const connected = attempts.find(Boolean);
        await Promise.all(attempts.filter(Boolean).filter(item => item !== connected).map(item => item.end()));
        if (!connected) throw directError;
        return connected;
    }
}

function readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

async function main() {
    const cacheDir = path.resolve(__dirname, '../backend/cache');
    const proposals = readJson(path.join(cacheDir, 'learning-proposals.json'), []);
    const review = readJson(path.join(cacheDir, 'market-review.json'), null);
    if (!Array.isArray(proposals)) throw new Error('learning-proposals.json no contiene una lista válida.');

    const client = await connectToSupabase();
    try {
        const migration = fs.readFileSync(path.resolve(__dirname, '../backend/db/migrations/005_ml_persistence_supabase.sql'), 'utf8');
        await client.query(migration);

        const dates = proposals.map(item => Date.parse(item.created_at)).filter(Number.isFinite);
        const startedAt = new Date(dates.length ? Math.min(...dates) : Date.now());
        const endedAt = new Date(dates.length ? Math.max(...dates) : startedAt);
        const runKey = `legacy-local-cache-${fingerprint(proposals).slice(0, 16)}`;
        const run = await client.query(
            `INSERT INTO ml_training_runs (run_key, status, started_at, ended_at, duration_seconds, attempts, proposal_count, error_count, metadata)
             VALUES ($1, 'imported', $2, $3, $4, 0, $5, 0, $6)
             ON CONFLICT (run_key) DO UPDATE SET ended_at = EXCLUDED.ended_at, proposal_count = EXCLUDED.proposal_count, updated_at = NOW()
             RETURNING id`,
            [runKey, startedAt, endedAt, Math.max(0, Math.round((endedAt - startedAt) / 1000)), proposals.length, JSON.stringify({ imported_from: 'backend/cache/learning-proposals.json' })],
        );

        let inserted = 0;
        for (const proposal of proposals) {
            const condition = String(proposal?.condition_trigger || '').trim().slice(0, 200);
            const rule = String(proposal?.learned_rule || '').trim().slice(0, 400);
            if (!condition || !rule) continue;
            const source = proposal?.source && typeof proposal.source === 'object' ? proposal.source : {};
            const result = await client.query(
                `INSERT INTO ml_rule_proposals (training_run_id, fingerprint, condition_trigger, learned_rule, confidence_score, status, source, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (fingerprint) DO NOTHING`,
                [run.rows[0].id, fingerprint({ condition, rule, source }), condition, rule,
                    Math.min(100, Math.max(0, Number(proposal.confidence_score) || 0)),
                    ['pending_human_review', 'approved', 'rejected'].includes(proposal.status) ? proposal.status : 'pending_human_review',
                    JSON.stringify(source), new Date(proposal.created_at || Date.now())],
            );
            inserted += result.rowCount;
        }

        let reviewInserted = 0;
        if (review) {
            const result = await client.query(
                `INSERT INTO ml_market_reviews (review_hash, review, review_status, source_name, source_timestamp, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (review_hash) DO NOTHING`,
                [fingerprint(review), JSON.stringify(review), String(review.status || 'unknown').slice(0, 50), review.source?.name || null,
                    Number.isFinite(Number(review.sourceTimestamp)) ? Number(review.sourceTimestamp) : null, new Date(review.createdAt || Date.now())],
            );
            reviewInserted = result.rowCount;
        }

        const counts = {};
        for (const table of ['ml_training_runs', 'ml_rule_proposals', 'ml_market_reviews']) {
            counts[table] = Number((await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count);
        }
        console.log(JSON.stringify({ inserted: { proposals: inserted, reviews: reviewInserted }, counts }));
    } finally {
        await client.end();
    }
}

if (require.main === module) {
    main().catch(error => { console.error('[ML-Persistence] Error:', error.message); process.exitCode = 1; });
}

module.exports = { connectToSupabase };
