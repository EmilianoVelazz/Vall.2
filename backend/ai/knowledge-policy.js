'use strict';

const crypto = require('node:crypto');
const KINDS = new Set(['report', 'news', 'loopus_rule', 'few_shot_exemplar', 'market_snapshot', 'protein_benchmark']);
const DATED_KINDS = new Set(['report', 'news', 'market_snapshot', 'protein_benchmark']);
const PRIVATE_FIELDS = ['owner', 'owner_id', 'ownerEmail', 'owner_email', 'user_id', 'userId', 'user_key_hash', 'tenant_id'];

function hasPrivateScope(doc) {
    return [doc, doc?.metadata, doc?.source].some(scope => scope && typeof scope === 'object'
        && (PRIVATE_FIELDS.some(key => scope[key] != null) || scope.userEdition === true));
}

function isPublicRule(rule) {
    return !hasPrivateScope(rule) && (rule?.public_retrieval === true || rule?.source?.public_retrieval === true);
}

function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function knowledgeDecision(doc, { now = Date.now() } = {}) {
    if (!doc || typeof doc !== 'object' || !KINDS.has(doc.source_kind)) return { allowed: false, reason: 'invalid_kind' };
    if (!['chat', 'reports', 'both'].includes(doc.domain)) return { allowed: false, reason: 'invalid_domain' };
    const meta = doc.metadata;
    if (!meta || meta.visibility !== 'public' || meta.approved_for_retrieval !== true) {
        return { allowed: false, reason: 'publication_not_approved' };
    }
    if (hasPrivateScope(doc)) return { allowed: false, reason: 'private_scope' };
    if (/benchmark|evaluation|positive_user_feedback/i.test(String(meta.origin || ''))
        || /^exemplar:(?:bench|feedback):/.test(doc.doc_key || '')) {
        return { allowed: false, reason: 'evaluation_or_private_feedback' };
    }
    if (doc.as_of_date != null && (!validDate(doc.as_of_date) || Date.parse(doc.as_of_date) > now)) {
        return { allowed: false, reason: 'invalid_or_future_date' };
    }
    if (DATED_KINDS.has(doc.source_kind) && !doc.as_of_date) return { allowed: false, reason: 'missing_date' };
    if (!Number.isFinite(Number(doc.quality_score)) || Number(doc.quality_score) < 60) {
        return { allowed: false, reason: 'insufficient_quality' };
    }
    return { allowed: true, reason: 'approved_public' };
}

function provenanceHash(doc) {
    return crypto.createHash('sha256')
        .update(JSON.stringify([doc.title, doc.content, doc.as_of_date, doc.source_kind, doc.metadata?.source || '']))
        .digest('hex');
}

module.exports = { knowledgeDecision, validDate, provenanceHash, hasPrivateScope, isPublicRule };
