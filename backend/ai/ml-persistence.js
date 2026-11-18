'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { configureSystemTrust } = require('../lib/tls-trust');

const PROPOSALS_CACHE_FILE = path.join(__dirname, '../cache/learning-proposals.json');

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
    configureSystemTrust();
    // Sin límite, una red caída deja colgado el ciclo de entrenamiento entero.
    client = createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (resource, options = {}) => fetch(resource, { ...options, signal: options.signal || AbortSignal.timeout(15000) }) },
    });
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

async function updateTrainingRunProgress(runId, { startedAt, attempts, proposalCount, errorCount }) {
    const supabase = getSupabase();
    if (!supabase || !runId) return;
    const durationSeconds = Math.max(0, Math.round((Date.now() - new Date(startedAt)) / 1000));
    const { error } = await supabase.from('ml_training_runs').update({
        status: 'running',
        duration_seconds: durationSeconds,
        attempts,
        proposal_count: proposalCount,
        error_count: errorCount,
        updated_at: new Date().toISOString(),
    }).eq('id', runId);
    if (error) throw error;
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

function formatProposalView(row) {
    if (!row || typeof row !== 'object') return null;
    const src = row.source && typeof row.source === 'object' ? row.source : {};
    const rawConf = Number(row.confidence_score);
    const normalizedConf = Number.isFinite(rawConf)
        ? (rawConf > 1 ? Math.min(1, rawConf / 100) : Math.max(0, rawConf))
        : 0;
    return {
        id: row.id,
        fingerprint: row.fingerprint || null,
        condition_trigger: row.condition_trigger,
        learned_rule: row.learned_rule,
        confidence_score: normalizedConf,
        topic: row.topic || src.topic || 'general',
        domain: row.domain || src.domain || 'both',
        audience: row.audience || src.audience || 'general',
        model: row.model || src.model || null,
        reasoning_chain: row.reasoning_chain || src.reasoning_chain || null,
        source_provider: row.source_provider || src.provider || 'loopus',
        status: row.status || 'pending_human_review',
        review_notes: row.review_notes ?? src.review_notes ?? null,
        reviewed_at: row.reviewed_at ?? src.reviewed_at ?? null,
        created_at: row.created_at || src.collected_at || null,
        source: src,
    };
}

function syncLocalProposalStatus({ fingerprint: fp, condition_trigger: cond, learned_rule: rule, status, reviewNotes, reviewedAt }) {
    try {
        if (!fs.existsSync(PROPOSALS_CACHE_FILE)) return;
        const parsed = JSON.parse(fs.readFileSync(PROPOSALS_CACHE_FILE, 'utf8'));
        if (!Array.isArray(parsed)) return;
        let changed = false;
        const updated = parsed.map(item => {
            const matchFp = fp && item.fingerprint && item.fingerprint === fp;
            const matchText = cond && rule && item.condition_trigger === cond && item.learned_rule === rule;
            if (!matchFp && !matchText) return item;
            changed = true;
            return {
                ...item,
                status,
                review_notes: reviewNotes || null,
                reviewed_at: reviewedAt,
                source: item.source && typeof item.source === 'object'
                    ? { ...item.source, review_notes: reviewNotes || null, reviewed_at: reviewedAt }
                    : item.source,
            };
        });
        if (changed) {
            fs.writeFileSync(PROPOSALS_CACHE_FILE, JSON.stringify(updated, null, 2), 'utf8');
        }
    } catch { /* caché local opcional */ }
}

async function getLoopusOverviewStats() {
    const supabase = getSupabase();
    if (!supabase) return null;
    try {
        const [{ data: rows, error }, { count: runsCount }, { count: eventsCount }, { count: reviewsCount }] = await Promise.all([
            supabase.from('ml_rule_proposals').select('status,confidence_score,source').limit(2000),
            supabase.from('ml_training_runs').select('*', { count: 'exact', head: true }),
            supabase.from('ml_training_events').select('*', { count: 'exact', head: true }),
            supabase.from('ml_market_reviews').select('*', { count: 'exact', head: true }),
        ]);
        if (error) throw error;
        const list = Array.isArray(rows) ? rows : [];
        const byStatus = { pending_human_review: 0, approved: 0, rejected: 0 };
        const byDomain = { chat: 0, reports: 0, both: 0 };
        let withChain = 0;
        let highConfidence = 0;
        for (const r of list) {
            const st = r?.status || 'pending_human_review';
            if (Object.hasOwn(byStatus, st)) byStatus[st] += 1;
            const d = r?.source?.domain || 'both';
            if (Object.hasOwn(byDomain, d)) byDomain[d] += 1;
            else byDomain.both += 1;
            if (r?.source?.reasoning_chain) withChain += 1;
            const c = Number(r?.confidence_score || 0);
            if ((c > 1 ? c / 100 : c) >= 0.82) highConfidence += 1;
        }
        return {
            total: list.length,
            byStatus,
            byDomain,
            withReasoningChain: withChain,
            highConfidence,
            runsCount: runsCount || 0,
            eventsCount: eventsCount || 0,
            reviewsCount: reviewsCount || 0,
        };
    } catch {
        return null;
    }
}

async function listRuleProposals({ status = null, domain = null, search = '', limit = 50 } = {}) {
    const supabase = getSupabase();
    if (!supabase) return [];
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const hasClientFilter = Boolean(domain || String(search || '').trim());
    let query = supabase.from('ml_rule_proposals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(hasClientFilter ? 400 : safeLimit);
    if (status && ['pending_human_review', 'approved', 'rejected'].includes(status)) {
        query = query.eq('status', status);
    }
    const { data, error } = await query;
    if (error) throw error;
    let formatted = (data || []).map(formatProposalView).filter(Boolean);
    if (domain && ['chat', 'reports', 'both'].includes(domain)) {
        formatted = formatted.filter(item => item.domain === domain);
    }
    const q = String(search || '').trim().toLowerCase();
    if (q) {
        formatted = formatted.filter(item =>
            `${item.topic} ${item.condition_trigger} ${item.learned_rule} ${item.reasoning_chain || ''}`
                .toLowerCase()
                .includes(q)
        );
    }
    return formatted.slice(0, safeLimit);
}

async function reviewRuleProposal(id, { status, reviewNotes = '' } = {}) {
    if (!['approved', 'rejected', 'pending_human_review'].includes(status)) {
        throw Object.assign(new Error('Estado de revisión no válido.'), { status: 400 });
    }
    const supabase = getSupabase();
    if (!supabase) throw Object.assign(new Error('Supabase no configurado.'), { status: 503 });
    const cleanId = String(id || '').trim();
    const { data: existing, error: fetchError } = await supabase.from('ml_rule_proposals')
        .select('*')
        .eq('id', cleanId)
        .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) throw Object.assign(new Error('Propuesta no encontrada.'), { status: 404 });

    const reviewedAt = new Date().toISOString();
    const notes = cleanText(reviewNotes, 500) || null;
    const nextSource = {
        ...(existing.source && typeof existing.source === 'object' ? existing.source : {}),
        review_notes: notes,
        reviewed_at: reviewedAt,
    };
    const { data, error } = await supabase.from('ml_rule_proposals')
        .update({ status, source: nextSource })
        .eq('id', cleanId)
        .select('*')
        .maybeSingle();
    if (error) throw error;
    if (!data) throw Object.assign(new Error('Propuesta no encontrada.'), { status: 404 });
    syncLocalProposalStatus({
        fingerprint: data.fingerprint,
        condition_trigger: data.condition_trigger,
        learned_rule: data.learned_rule,
        status,
        reviewNotes: notes,
        reviewedAt,
    });
    return formatProposalView(data);
}

async function persistProteinTrainingRun(summary) {
    const supabase = getSupabase();
    if (!supabase || !summary?.training_run_id) return false;
    const row = {
        id: String(summary.training_run_id),
        status: summary.status || 'running',
        started_at: new Date(summary.started_at || Date.now()).toISOString(),
        ended_at: summary.ended_at ? new Date(summary.ended_at).toISOString() : new Date().toISOString(),
        duration_minutes: Number(summary.duration_minutes) || 40,
        attempts: Number(summary.attempts) || 0,
        failures: Number(summary.failures) || 0,
        proposals_created: Number(summary.proposals_created) || 0,
        evidence_sources: Array.isArray(summary.evidence_sources) ? summary.evidence_sources : [],
        notice: summary.notice || null,
    };
    const { error } = await supabase.from('protein_training_runs').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    return true;
}

async function persistProteinSnapshots(snapshots, runId) {
    const supabase = getSupabase();
    if (!supabase || !Array.isArray(snapshots) || !snapshots.length || !runId) return 0;
    const rows = snapshots.map(item => ({
        snapshot_hash: item.snapshot_hash || fingerprint({ source_id: item.source_id, retrieved_at: item.retrieved_at, payload: item.payload }),
        training_run_id: String(runId),
        source_id: cleanText(item.source_id, 120),
        source_name: cleanText(item.source_name, 200),
        source_url: cleanText(item.source_url, 400),
        data_type: cleanText(item.data_type, 80),
        is_forecast: Boolean(item.is_forecast),
        data_vintage: item.data_vintage ? cleanText(item.data_vintage, 80) : null,
        retrieved_at: new Date(item.retrieved_at || Date.now()).toISOString(),
        payload: item.payload && typeof item.payload === 'object' ? item.payload : {},
    })).filter(r => r.source_id);
    if (!rows.length) return 0;
    const { error } = await supabase.from('protein_source_snapshots').upsert(rows, { onConflict: 'snapshot_hash', ignoreDuplicates: true });
    if (error) throw error;
    return rows.length;
}

async function persistProteinProposals(proposals, runId) {
    const supabase = getSupabase();
    if (!supabase || !Array.isArray(proposals) || !proposals.length || !runId) return 0;
    const rows = proposals.map(item => ({
        proposal_hash: item.proposal_id || fingerprint(item),
        training_run_id: String(runId),
        species: cleanText(item.species, 80),
        title: cleanText(item.title, 200),
        insight: cleanText(item.insight, 800),
        evidence_source_ids: Array.isArray(item.evidence_source_ids) ? item.evidence_source_ids : [],
        evidence_snapshot_hashes: Array.isArray(item.evidence_snapshot_hashes) ? item.evidence_snapshot_hashes : [],
        confidence_score: Math.min(100, Math.max(0, Number(item.confidence_score) || 0)),
        status: ['pending_human_review', 'approved', 'rejected'].includes(item.status) ? item.status : 'pending_human_review',
        created_at: new Date(item.created_at || Date.now()).toISOString(),
    })).filter(r => r.species && r.title && r.insight);
    if (!rows.length) return 0;
    const { error } = await supabase.from('protein_research_proposals').upsert(rows, { onConflict: 'proposal_hash', ignoreDuplicates: true });
    if (error) throw error;
    return rows.length;
}

module.exports = {
    createTrainingRun,
    updateTrainingRunProgress,
    finishTrainingRun,
    persistRuleProposals,
    persistTrainingEvent,
    persistMarketReview,
    persistProteinTrainingRun,
    persistProteinSnapshots,
    persistProteinProposals,
    listRuleProposals,
    getLoopusOverviewStats,
    reviewRuleProposal,
    normalizeProposal,
    formatProposalView,
    fingerprint,
};
