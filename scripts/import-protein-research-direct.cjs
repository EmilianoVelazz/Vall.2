'use strict';

// Carga los resultados del ciclo de 40 minutos después de aplicar la migración
// 006. Las propuestas siguen en revisión humana; la página puede usar sólo las
// observaciones y los registros aprobados.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { connectToSupabase } = require('./import-ml-cache-direct.cjs');

const CACHE_DIR = path.resolve(__dirname, '../backend/cache');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };

async function main() {
    const summary = read(path.join(CACHE_DIR, 'protein-training-summary.json'), null);
    if (!summary?.training_run_id) throw new Error('No existe un resumen válido del entrenamiento de proteínas.');
    const snapshots = read(path.join(CACHE_DIR, 'protein-source-snapshots.json'), []).filter(item => item.training_run_id === summary.training_run_id);
    const proposals = read(path.join(CACHE_DIR, 'protein-research-proposals.json'), []).filter(item => item.training_run_id === summary.training_run_id);
    const client = await connectToSupabase();
    try {
        await client.query(fs.readFileSync(path.resolve(__dirname, '../backend/db/migrations/006_protein_research_persistence.sql'), 'utf8'));
        await client.query(
            `INSERT INTO protein_training_runs (id, status, started_at, ended_at, duration_minutes, attempts, failures, proposals_created, evidence_sources, notice)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, ended_at = EXCLUDED.ended_at, attempts = EXCLUDED.attempts,
                 failures = EXCLUDED.failures, proposals_created = EXCLUDED.proposals_created, evidence_sources = EXCLUDED.evidence_sources, notice = EXCLUDED.notice`,
            [summary.training_run_id, summary.status || 'completed', new Date(summary.started_at), new Date(summary.ended_at),
                Number(summary.duration_minutes) || 40, Number(summary.attempts) || 0, Number(summary.failures) || 0,
                Number(summary.proposals_created) || 0, summary.evidence_sources || [], summary.notice || null],
        );
        let snapshotRows = 0;
        for (const item of snapshots) {
            const result = await client.query(
                `INSERT INTO protein_source_snapshots (snapshot_hash, training_run_id, source_id, source_name, source_url, data_type, is_forecast, data_vintage, retrieved_at, payload)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (snapshot_hash) DO NOTHING`,
                [hash({ source_id: item.source_id, retrieved_at: item.retrieved_at, payload: item.payload }), summary.training_run_id,
                    item.source_id, item.source_name, item.source_url, item.data_type, Boolean(item.is_forecast), item.data_vintage || null,
                    new Date(item.retrieved_at), JSON.stringify(item.payload)],
            );
            snapshotRows += result.rowCount;
        }
        let proposalRows = 0;
        for (const item of proposals) {
            const result = await client.query(
                `INSERT INTO protein_research_proposals (proposal_hash, training_run_id, species, title, insight, evidence_source_ids, evidence_snapshot_hashes, confidence_score, status, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (proposal_hash) DO NOTHING`,
                [item.proposal_id || hash(item), summary.training_run_id, item.species, item.title, item.insight,
                    item.evidence_source_ids, item.evidence_snapshot_hashes || [], Math.min(100, Math.max(0, Number(item.confidence_score) || 0)), item.status,
                    new Date(item.created_at)],
            );
            proposalRows += result.rowCount;
        }
        const counts = {};
        for (const table of ['protein_training_runs', 'protein_source_snapshots', 'protein_research_proposals']) {
            counts[table] = Number((await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count);
        }
        console.log(JSON.stringify({ inserted: { snapshots: snapshotRows, proposals: proposalRows }, counts }));
    } finally {
        await client.end();
    }
}

if (require.main === module) main().catch(error => { console.error('[Protein-Persistence] Error:', error.message); process.exitCode = 1; });

module.exports = { main };
