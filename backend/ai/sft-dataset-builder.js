'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { loadApprovedAndPlaybookRules } = require('./loopus-knowledge');
const { DEFAULT_FEEDBACK_FILE } = require('./closed-loop-feedback');
const {isPublicRule}=require('./knowledge-policy');

const DEFAULT_SYSTEM_PROMPT = 'Eres ORION, el asistente de inteligencia económica y agroindustrial de VALLNews. Responde en español con rigor cuantitativo, distingue datos verificados vs inferencias, conserva unidades/fechas/fuentes originales y abstente si falta evidencia comprobable.';

function sanitizePii(text) {
    let redactions = 0;
    let out = String(text || '');
    const replaceWithCount = (pattern, token) => {
        out = out.replace(pattern, () => {
            redactions += 1;
            return token;
        });
    };
    replaceWithCount(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL_REDACTED]');
    replaceWithCount(/\b(?:Bearer\s+)?eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+)?\b/g, '[TOKEN_REDACTED]');
    replaceWithCount(/\b(?:AIza[0-9A-Za-z_-]{20,}|sb_secret_[0-9A-Za-z_-]{12,}|sk-[0-9A-Za-z_-]{16,})\b/g, '[TOKEN_REDACTED]');
    replaceWithCount(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,}\d{3,4}(?=\b)/g, (match) => {
        const digits = match.replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 15 && !/^\d{4}-\d{2}-\d{2}$/.test(match)) {
            redactions += 1;
            return '[PHONE_REDACTED]';
        }
        return match;
    });
    return { text: out.trim(), redactions };
}

function readJsonSafe(filePath, fallback) {
    try {
        if (!filePath || !fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

function buildSftDataset({
    format = 'gemini',
    includeRules = true,
    includeBenchmarks = false,
    includeFeedback = false,
    cacheFiles = {},
} = {}) {
    const resolvedFormat = format === 'openai_chat' ? 'openai_chat' : 'gemini';
    const candidates = [];

    if (includeRules) {
        let rules = [];
        if (cacheFiles.proposalsFile) {
            const raw = readJsonSafe(cacheFiles.proposalsFile, []);
            rules = (Array.isArray(raw) ? raw : []).filter(r => r?.status === 'approved' && isPublicRule(r));
        } else {
            try { rules = loadApprovedAndPlaybookRules(); } catch { rules = []; }
        }
        for (const rule of rules) {
            if (!rule?.condition_trigger || !rule?.learned_rule || (!String(rule.id||'').startsWith('loopus-base-')&&rule.public_retrieval!==true)) continue;
            const userPrompt = `Caso analítico (${rule.topic || 'general'}): ¿Cómo debes abordar una consulta sobre ${rule.condition_trigger.toLowerCase()}?`;
            const modelAnswer = [
                `Para este tipo de consulta (${rule.domain || 'both'}), sigue este protocolo metodológico:`,
                `- **Regla principal:** ${rule.learned_rule}`,
                rule.reasoning_chain ? `- **Cadena lógica:** ${rule.reasoning_chain}` : null,
                '- **Disciplina de evidencia:** Conserva fechas, unidades y fuentes exactas sin extrapolar cifras fuera de corte.',
            ].filter(Boolean).join('\n');
            candidates.push({
                user: userPrompt,
                assistant: modelAnswer,
                source: rule.status === 'approved' ? 'loopus_approved_rule' : 'loopus_playbook_rule',
                domain: rule.domain || 'both',
            });
        }
    }

    // Held-out evaluations never become training examples, even when requested.
    if (includeFeedback) {
        const fbFile = cacheFiles.feedbackFile || DEFAULT_FEEDBACK_FILE;
        const events = readJsonSafe(fbFile, []);
        for (const ev of Array.isArray(events) ? events : []) {
            const positive = (ev?.rating != null && ev.rating >= 4) || ev?.is_helpful === true;
            if (ev?.metadata?.trainingConsent!==true || ev?.metadata?.publicationApproved!==true || !ev?.metadata?.reviewedBy || !Number.isFinite(Date.parse(ev?.metadata?.reviewedAt)) || !positive || ev?.correction_text || !ev?.query_text || String(ev?.response_text || '').trim().length < 40) continue;
            candidates.push({
                user: ev.query_text,
                assistant: ev.response_text,
                source: 'positive_feedback',
                domain: 'chat',
            });
        }
    }

    const seen = new Set();
    const bySource = {};
    const byDomain = {};
    let totalRedactions = 0;
    let totalWords = 0;
    const rows = [];

    for (const item of candidates) {
        const cleanUser = sanitizePii(item.user);
        const cleanAssistant = sanitizePii(item.assistant);
        const cleanSystem = sanitizePii(DEFAULT_SYSTEM_PROMPT);
        totalRedactions += cleanUser.redactions + cleanAssistant.redactions + cleanSystem.redactions;

        if (!cleanUser.text || !cleanAssistant.text) continue;
        const hash = crypto.createHash('sha256').update(`${cleanUser.text}\0${cleanAssistant.text}`).digest('hex');
        if (seen.has(hash)) continue;
        seen.add(hash);

        const words = cleanAssistant.text.split(/\s+/).filter(Boolean).length;
        totalWords += words;
        bySource[item.source] = (bySource[item.source] || 0) + 1;
        byDomain[item.domain] = (byDomain[item.domain] || 0) + 1;

        if (resolvedFormat === 'openai_chat') {
            rows.push({
                messages: [
                    { role: 'system', content: cleanSystem.text },
                    { role: 'user', content: cleanUser.text },
                    { role: 'assistant', content: cleanAssistant.text },
                ],
                meta: { source: item.source, domain: item.domain },
            });
        } else {
            rows.push({
                systemInstruction: { parts: [{ text: cleanSystem.text }] },
                contents: [
                    { role: 'user', parts: [{ text: cleanUser.text }] },
                    { role: 'model', parts: [{ text: cleanAssistant.text }] },
                ],
                meta: { source: item.source, domain: item.domain },
            });
        }
    }

    const jsonl = rows.map(row => JSON.stringify(row)).join('\n');
    return {
        policy: {heldOutBenchmarksExcluded:true,benchmarkInclusionRequested:includeBenchmarks,privateFeedbackRequiresConsentAndReview:true},
        format: resolvedFormat,
        count: rows.length,
        jsonl,
        stats: {
            bySource,
            byDomain,
            piiRedacted: totalRedactions,
            avgOutputWords: rows.length ? Math.round(totalWords / rows.length) : 0,
        },
    };
}

module.exports = {
    sanitizePii,
    buildSftDataset,
};
