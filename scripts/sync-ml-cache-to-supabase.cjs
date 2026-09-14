'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { createTrainingRun, finishTrainingRun, persistRuleProposals, persistMarketReview, fingerprint } = require('../backend/ai/ml-persistence');

function readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

async function main() {
    const cacheDir = path.resolve(__dirname, '../backend/cache');
    const proposals = readJson(path.join(cacheDir, 'learning-proposals.json'), []);
    const review = readJson(path.join(cacheDir, 'market-review.json'), null);
    const created = Array.isArray(proposals) && proposals.length ? proposals.map(item => Date.parse(item.created_at)).filter(Number.isFinite) : [];
    const startedAt = created.length ? new Date(Math.min(...created)) : new Date();
    const endedAt = created.length ? new Date(Math.max(...created)) : startedAt;
    const runKey = `legacy-local-cache-${fingerprint(proposals).slice(0, 16)}`;
    const runId = await createTrainingRun({ runKey, startedAt, metadata: { imported_from: 'backend/cache/learning-proposals.json' } });
    if (!runId) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY; no se sincronizó ningún dato.');
    const persisted = await persistRuleProposals(proposals, runId);
    if (review) await persistMarketReview(review);
    await finishTrainingRun(runId, { status: 'imported', startedAt, endedAt, attempts: 0, proposalCount: persisted, errorCount: 0 });
    console.log(`Sincronización completa: ${persisted} propuestas y ${review ? 1 : 0} dictamen de mercado.`);
}

main().catch(error => { console.error('[ML-Persistence] Error:', error.message); process.exitCode = 1; });
