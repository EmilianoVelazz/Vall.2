'use strict';
const crypto = require('node:crypto');
const { auditResearchAnswer } = require('./research-evidence');
const DIMENSIONS = ['factualCorrectness', 'periodCoverage', 'sourceSupport', 'decisionUsefulness', 'conversationQuality'];
const fingerprint = text => crypto.createHash('sha256').update(String(text)).digest('hex');
function evaluateAnswer(item, answer, { evidence, plan, now, review } = {}) {
    const text = String(answer?.text || '');
    const checks = [
        { id: 'nonempty', passed: Boolean(text.trim()) },
        ...(item.required || []).map(rule => ({ id: rule.id, passed: new RegExp(rule.pattern, 'isu').test(text) })),
        ...(item.forbidden || []).map(rule => ({ id: rule.id, passed: !new RegExp(rule.pattern, 'isu').test(text) })),
    ];
    const audit = auditResearchAnswer(plan, evidence, text, now);
    checks.push({ id: 'dated-excerpt-provenance', passed: !audit.needed });
    const answerHash = fingerprint(text);
    const reviewValid = review?.answerHash === answerHash && typeof review.reviewer === 'string' && review.reviewer.trim()
        && Number.isFinite(Date.parse(review.reviewedAt)) && DIMENSIONS.every(field => Number.isInteger(review.scores?.[field]) && review.scores[field] >= 0 && review.scores[field] <= 2);
    return { id: item.id, answerHash, automaticPassed: checks.every(row => row.passed), checks,
        issues: audit.issues, humanReview: reviewValid ? { status: 'recorded', scores: review.scores } : { status: review ? 'invalid_or_stale' : 'pending' },
        latencyMs: Number.isFinite(answer?.latencyMs) && answer.latencyMs >= 0 ? answer.latencyMs : null,
        fallbackUsed: answer?.fallbackUsed === true };
}
function summarizeEvaluation(results, { datasetVersion, mode, datasetStatus } = {}) {
    const latencies = results.map(row => row.latencyMs).filter(Number.isFinite).sort((a, b) => a - b);
    const percentile = fraction => latencies.length ? latencies[Math.max(0, Math.ceil(latencies.length * fraction) - 1)] : null;
    const reviewed = results.filter(row => row.humanReview.status === 'recorded');
    return { datasetVersion, datasetStatus, mode, cases: results.length, automaticPassed: results.filter(row => row.automaticPassed).length,
        humanReviewed: reviewed.length, humanScores: Object.fromEntries(DIMENSIONS.map(field => [field,
            reviewed.length ? reviewed.reduce((sum, row) => sum + row.humanReview.scores[field], 0) / reviewed.length : null])),
        latency: { samples: latencies.length, p50Ms: percentile(.5), p95Ms: percentile(.95) },
        fallbackCount: results.filter(row => row.fallbackUsed).length,
        notice: 'Controles automáticos y muestra de diagnóstico. Una coincidencia de patrones no certifica verdad semántica. La revisión humana sólo cuenta para el texto exacto revisado.' };
}
module.exports = { evaluateAnswer, summarizeEvaluation, fingerprint, DIMENSIONS };
