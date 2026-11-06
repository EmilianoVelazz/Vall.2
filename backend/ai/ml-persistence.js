'use strict';

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

let client;
let unavailableLogged = false;

function getSupabase() {
    if (client) return client;
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
        if (!unavailableLogged) {
            unavailableLogged = true;
            console.warn('[ML-Persistence] Supabase no configurado para escritura segura: define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
        }
        return null;
    }
    client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    return client;
}

function fingerprint(value) {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function cleanText(value, max) {
    return String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function normalizeProposal(proposal, trainingRunId) {
    const source = proposal?.source && typeof proposal.source === 'object' ? proposal.source : {};
    const condition = cleanText(proposal?.condition_trigger, 200);
    const rule = cleanText(proposal?.learned_rule, 400);
    const createdAt = new Date(proposal?.created_at || Date.now()).toISOString();
    return {
        training_run_id: trainingRunId || null,
        fingerprint: fingerprint({ condition, rule, source }),
        condition_trigger: condition,
        learned_rule: rule,
        confidence_score: Math.min(100, Math.max(0, Number(proposal?.confidence_score) || 0)),
        status: ['pending_human_review', 'approved', 'rejected'].includes(proposal?.status) ? proposal.status : 'pending_human_review',
        source,
        created_at: createdAt,
    };
}

async function createTrainingRun({ runKey, startedAt, metadata = {} }) {
    const supabase = getSupabase();
    if (!supabase) return null;
    const row = { run_key: runKey, status: 'running', started_at: new Date(startedAt).toISOString(), metadata };
    const { data, error } = await supabase.from('ml_training_runs').upsert(row, { onConflict: 'run_key' }).select('id').single();
    if (error) throw error;
    return data.id;
}

async function finishTrainingRun(runId, { status = 'completed', startedAt, endedAt, attempts, proposalCount, errorCount }) {
    const supabase = getSupabase();
    if (!supabase || !runId) return;
    const durationSeconds = Math.max(0, Math.round((new Date(endedAt) - new Date(startedAt)) / 1000));
    const { error } = await supabase.from('ml_training_runs').update({
        status, ended_at: new Date(endedAt).toISOString(), duration_seconds: durationSeconds,
        attempts, proposal_count: proposalCount, error_count: errorCount, updated_at: new Date().toISOString(),
    }).eq('id', runId);
    if (error) throw error;
}

async function persistRuleProposals(proposals, trainingRunId) {
    if (!Array.isArray(proposals) || !proposals.length) return 0;
    const supabase = getSupabase();
    if (!supabase) return 0;
    const rows = proposals.map(proposal => normalizeProposal(proposal, trainingRunId)).filter(row => row.condition_trigger && row.learned_rule);
    if (!rows.length) return 0;
    const { error } = await supabase.from('ml_rule_proposals').upsert(rows, { onConflict: 'fingerprint', ignoreDuplicates: true });
    if (error) throw error;
    return rows.length;
}

async function persistTrainingEvent(event, trainingRunId) {
    const supabase = getSupabase();
    if (!supabase || !trainingRunId || !event?.event_key) return false;
    const row = {
        training_run_id: trainingRunId,
        event_key: cleanText(event.event_key, 180),
        attempt_number: Math.max(1, Number(event.attempt_number) || 1),
        topic: cleanText(event.topic, 200),
        status: event.status === 'failed' ? 'failed' : 'completed',
        model: cleanText(event.model, 120) || null,
        sources: Array.isArray(event.sources) ? event.sources : [],
        evidence: event.evidence && typeof event.evidence === 'object' ? event.evidence : {},
        output: event.output && typeof event.output === 'object' ? event.output : null,
        error_code: cleanText(event.error_code, 120) || null,
        started_at: new Date(event.started_at || Date.now()).toISOString(),
        ended_at: new Date(event.ended_at || Date.now()).toISOString(),
    };
    const { error } = await supabase.from('ml_training_events').upsert(row, { onConflict: 'event_key' });
    if (error) throw error;
    return true;
}

async function persistMarketReview(review) {
    const supabase = getSupabase();
    if (!supabase || !review) return false;
    const row = {
        review_hash: fingerprint(review), review, review_status: cleanText(review.status, 50) || 'unknown',
        source_name: cleanText(review.source?.name, 120) || null,
        source_timestamp: Number.isFinite(Number(review.sourceTimestamp)) ? Number(review.sourceTimestamp) : null,
        created_at: new Date(review.createdAt || Date.now()).toISOString(),
    };
    const { error } = await supabase.from('ml_market_reviews').upsert(row, { onConflict: 'review_hash', ignoreDuplicates: true });
    if (error) throw error;
    return true;
}

module.exports = { createTrainingRun, finishTrainingRun, persistRuleProposals, persistTrainingEvent, persistMarketReview, normalizeProposal, fingerprint };
