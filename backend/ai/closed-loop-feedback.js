'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_FEEDBACK_FILE = path.join(__dirname, '../cache/orion-feedback-events.json');
const PROPOSALS_FILE = path.join(__dirname, '../cache/learning-proposals.json');
const MAX_EVENTS = 500;

let supabaseClient = null;
function getSupabase() {
    if (process.env.NODE_ENV === 'test') return null;
    if (supabaseClient) return supabaseClient;
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    try {
        const { createServerClient } = require('../lib/supabase-connection');
        supabaseClient = createServerClient();
        return supabaseClient;
    } catch {
        return null;
    }
}

function cleanText(value, max = 4000) {
    return String(value || '')
        .replace(/[\u0000-\u001f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

function readEvents(cacheFile = DEFAULT_FEEDBACK_FILE) {
    try {
        if (!fs.existsSync(cacheFile)) return [];
        const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeEvents(events, cacheFile = DEFAULT_FEEDBACK_FILE) {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    const trimmed = (Array.isArray(events) ? events : []).slice(-MAX_EVENTS);
    fs.writeFileSync(cacheFile, JSON.stringify(trimmed, null, 2), 'utf8');
    return trimmed;
}

async function recordFeedbackEvent(event, { persistSupabase = true, cacheFile = DEFAULT_FEEDBACK_FILE } = {}) {
    const queryText = cleanText(event?.queryText || event?.query_text, 2000);
    if (!queryText) return null;

    const sourceKind = ['user_feedback', 'quality_guard', 'benchmark_gap'].includes(event?.sourceKind || event?.source_kind)
        ? (event?.sourceKind || event?.source_kind)
        : 'user_feedback';
    const responseText = cleanText(event?.responseText || event?.response_text, 6000);
    const correctionText = cleanText(event?.correctionText || event?.correction_text || event?.feedbackText || event?.feedback_text, 2000);
    const rawRating = event?.rating;
    const rating = rawRating != null && Number.isFinite(Number(rawRating))
        ? Math.max(-1, Math.min(5, Math.round(Number(rawRating))))
        : null;
    const isHelpful = typeof event?.isHelpful === 'boolean'
        ? event.isHelpful
        : (typeof event?.is_helpful === 'boolean' ? event.is_helpful : null);
    const category = cleanText(event?.category || 'general', 80) || 'general';
    const fingerprint = crypto
        .createHash('sha256')
        .update(JSON.stringify({ sourceKind, queryText, correctionText, category }))
        .digest('hex');

    const record = {
        fingerprint,
        user_key_hash: event?.userKeyHash ? cleanText(event.userKeyHash, 128) : null,
        query_text: queryText,
        response_text: responseText || null,
        rating,
        is_helpful: isHelpful,
        correction_text: correctionText || null,
        category,
        source_kind: sourceKind,
        evaluated_by_loopus: Boolean(event?.evaluated_by_loopus),
        promoted_to_few_shot: Boolean(event?.promoted_to_few_shot),
        metadata: event?.metadata && typeof event.metadata === 'object' ? event.metadata : {},
        created_at: new Date().toISOString(),
    };

    const existing = readEvents(cacheFile);
    const prevIdx = existing.findIndex(item => item.fingerprint === fingerprint);
    if (prevIdx >= 0) {
        existing[prevIdx] = {
            ...existing[prevIdx],
            ...record,
            evaluated_by_loopus: existing[prevIdx].evaluated_by_loopus && !correctionText,
        };
    } else {
        existing.push(record);
    }
    writeEvents(existing, cacheFile);

    const supabase = persistSupabase ? getSupabase() : null;
    if (supabase) {
        try {
            await supabase.from('orion_feedback_events').upsert({
                fingerprint: record.fingerprint,
                user_key_hash: record.user_key_hash,
                query_text: record.query_text,
                response_text: record.response_text,
                rating: record.rating,
                is_helpful: record.is_helpful,
                correction_text: record.correction_text,
                category: record.category,
                source_kind: record.source_kind,
                evaluated_by_loopus: record.evaluated_by_loopus,
                metadata: record.metadata,
                created_at: record.created_at,
            }, { onConflict: 'fingerprint' });
        } catch { /* Supabase opcional */ }
    }
    return record;
}

function listFeedbackEvents({ limit = 100, cacheFile = DEFAULT_FEEDBACK_FILE } = {}) {
    return readEvents(cacheFile).slice(-Math.max(1, limit)).reverse();
}

function isPositiveEvent(item) {
    if (!item) return false;
    if (item.correction_text && item.rating == null) return false;
    if (item.source_kind !== 'user_feedback') return false;
    return (item.rating != null && item.rating >= 4) || item.is_helpful === true;
}

function needsCorrectionProposal(item) {
    if (!item) return false;
    if (item.source_kind === 'quality_guard' || item.source_kind === 'benchmark_gap') return true;
    if (item.is_helpful === false) return true;
    if (item.rating != null && item.rating <= 2) return true;
    return Boolean(item.correction_text);
}

function getFeedbackStats({ cacheFile = DEFAULT_FEEDBACK_FILE } = {}) {
    const events = readEvents(cacheFile);
    return {
        total: events.length,
        positiveCount: events.filter(isPositiveEvent).length,
        negativeOrCorrectionCount: events.filter(needsCorrectionProposal).length,
        qualityGuardCount: events.filter(e => e.source_kind === 'quality_guard').length,
        pendingLoopusCount: events.filter(e => !e.evaluated_by_loopus).length,
        evaluatedCount: events.filter(e => e.evaluated_by_loopus).length,
        promotedExemplarCount: events.filter(e => e.promoted_to_few_shot).length,
    };
}

function buildDeterministicProposal(event) {
    const triggerPrefix = event.source_kind === 'quality_guard'
        ? 'Consultas donde el validador de calidad detectó brecha de evidencia o formato'
        : 'Consultas donde la persona corrigió el enfoque o precisión';
    const trigger = cleanText(`${triggerPrefix} (${event.category || 'general'}): ${event.query_text}`, 200);
    const correctionNote = event.correction_text || 'Exigir respaldo verificable con fechas, unidades originales y abstención explícita cuando falten fuentes.';
    const learnedRule = cleanText(
        `Aplicar verificación estricta antes de emitir síntesis sobre "${event.category || 'general'}": ${correctionNote} Distinguir siempre dato observado vs inferencia.`,
        400
    );
    const reasoningChain = cleanText(
        `Detección (${event.source_kind}) -> Verificación de evidencia y unidad -> Corrección aplicada -> Validación final antes de responder`,
        240
    );
    return {
        condition_trigger: trigger,
        learned_rule: learnedRule,
        reasoning_chain: reasoningChain,
        confidence_score: 86,
        domain: 'chat',
        audience: 'general',
        topic: `closed_loop_${cleanText(event.category || 'general', 32).replace(/[^a-z0-9_]/gi, '_')}`,
        status: 'pending_human_review',
        fingerprint: crypto.createHash('sha256').update(JSON.stringify({ trigger, learnedRule })).digest('hex'),
        created_at: new Date().toISOString(),
        source: {
            provider: 'loopus-closed-loop',
            source_kind: event.source_kind,
            category: event.category || 'general',
            reasoning_chain: reasoningChain,
            collected_at: new Date().toISOString(),
        },
    };
}

async function distillClosedLoopProposals({
    limit = 10,
    provider = null,
    cacheFile = DEFAULT_FEEDBACK_FILE,
    proposalsFile = PROPOSALS_FILE,
    persistSupabase = process.env.NODE_ENV !== 'test',
} = {}) {
    const events = readEvents(cacheFile);
    const pending = events.filter(e => !e.evaluated_by_loopus).slice(0, Math.max(1, limit));
    if (!pending.length) {
        return { processedCount: 0, proposalsCreated: 0, exemplarsPromoted: 0, proposals: [] };
    }

    const createdProposals = [];

    for (const ev of pending) {
        if (needsCorrectionProposal(ev)) {
            let proposal = buildDeterministicProposal(ev);
            if (provider && typeof provider.generate === 'function' && provider.isConfigured?.() && process.env.NODE_ENV !== 'test') {
                try {
                    const resp = await provider.generate({
                        prompt: `Analiza este fallo/corrección real de ORION y genera UNA regla metodológica generalizable sin precios fijos.\nConsulta: ${ev.query_text}\nCorrección/Alerta: ${ev.correction_text || ev.category}`,
                        systemInstruction: 'Responde JSON estricto: {"condition_trigger":"max 180 chars","learned_rule":"max 360 chars","reasoning_chain":"Paso 1 -> Paso 2 -> Paso 3 -> Validación","confidence_score":88}',
                        tier: 'flash',
                        json: true,
                        timeoutMs: 12_000,
                    });
                    const cleaned = String(resp?.text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
                    const parsed = JSON.parse(cleaned);
                    if (parsed?.condition_trigger && parsed?.learned_rule) {
                        proposal = {
                            ...proposal,
                            condition_trigger: cleanText(parsed.condition_trigger, 200),
                            learned_rule: cleanText(parsed.learned_rule, 400),
                            reasoning_chain: cleanText(parsed.reasoning_chain || proposal.reasoning_chain, 240),
                            confidence_score: Math.min(95, Math.max(70, Number(parsed.confidence_score) || 88)),
                            source: { ...proposal.source, reasoning_chain: cleanText(parsed.reasoning_chain || proposal.reasoning_chain, 240), model: resp.model || null },
                        };
                    }
                } catch { /* conserva propuesta determinista */ }
            }
            createdProposals.push(proposal);
            ev.evaluated_by_loopus = true;
        } else if (isPositiveEvent(ev)) {
            // A positive rating is feedback, not permission to publish a chat.
            // Keep it private and pending a separate publication review.
            ev.evaluated_by_loopus = true;
            ev.publication_status='requires_explicit_review';
        } else {
            ev.evaluated_by_loopus = true;
        }
    }

    writeEvents(events, cacheFile);

    if (createdProposals.length && proposalsFile) {
        let existingProps = [];
        try {
            if (fs.existsSync(proposalsFile)) {
                const parsed = JSON.parse(fs.readFileSync(proposalsFile, 'utf8'));
                if (Array.isArray(parsed)) existingProps = parsed;
            }
        } catch { existingProps = []; }
        const seen = new Set(existingProps.map(p => p.fingerprint || `${p.condition_trigger}|${p.learned_rule}`));
        const fresh = createdProposals.filter(p => !seen.has(p.fingerprint));
        if (fresh.length) {
            fs.mkdirSync(path.dirname(proposalsFile), { recursive: true });
            fs.writeFileSync(proposalsFile, JSON.stringify([...existingProps, ...fresh].slice(-400), null, 2), 'utf8');
        }
    }

    const exemplarsPromoted = 0;

    if (persistSupabase && createdProposals.length) {
        try {
            const { persistRuleProposals } = require('./ml-persistence');
            await persistRuleProposals(createdProposals, null);
        } catch { /* Supabase opcional */ }
    }

    return {
        processedCount: pending.length,
        proposalsCreated: createdProposals.length,
        exemplarsPromoted,
        proposals: createdProposals,
    };
}

module.exports = {
    DEFAULT_FEEDBACK_FILE,
    recordFeedbackEvent,
    listFeedbackEvents,
    getFeedbackStats,
    distillClosedLoopProposals,
};
