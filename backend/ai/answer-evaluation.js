'use strict';
const crypto = require('node:crypto');
const { auditResearchAnswer } = require('./research-evidence');
const DIMENSIONS = ['factualCorrectness', 'periodCoverage', 'sourceSupport', 'decisionUsefulness', 'conversationQuality'];
const fingerprint = text => crypto.createHash('sha256').update(String(text)).digest('hex');

function extractChartSpecs(text, responseBlocks = []) {
    const specs = [];
    for (const block of Array.isArray(responseBlocks) ? responseBlocks : []) {
        if (block?.type === 'chart' && block.spec && typeof block.spec === 'object') specs.push(block.spec);
    }
    const fenceRegex = /```chart\s*\n([\s\S]*?)```/gi;
    let match;
    while ((match = fenceRegex.exec(String(text || ''))) !== null) {
        try {
            const parsed = JSON.parse(match[1].trim());
            if (parsed && typeof parsed === 'object') specs.push(parsed);
        } catch {
            specs.push({ __parseError: true });
        }
    }
    return specs;
}

function hasValidChartSpec(specs, { minLabels = 2, minSeries = 1 } = {}) {
    return specs.some(spec => {
        if (!spec || spec.__parseError) return false;
        const labels = Array.isArray(spec.labels) ? spec.labels : [];
        const datasets = Array.isArray(spec.datasets) ? spec.datasets : [];
        if (labels.length < minLabels || datasets.length < minSeries) return false;
        return datasets.some(ds => Array.isArray(ds?.data)
            && ds.data.length === labels.length
            && ds.data.every(value => value === null || Number.isFinite(Number(value))));
    });
}

function hasMarkdownOrBlockTable(text, responseBlocks = []) {
    if (Array.isArray(responseBlocks) && responseBlocks.some(block => block?.type === 'table' && block.rows?.length >= 1)) {
        return true;
    }
    return /(?:^|\n)\s*\|?.+\|.+\|\s*\n\s*\|?\s*:?-{2,}.*\|/m.test(String(text || ''));
}

function evaluateAnswer(item, answer, { evidence, plan, now, review, format = (v => v) } = {}) {
    const text = String(answer?.text || '');
    const blocks = answer?.response?.blocks || [];
    const structural = item.structuralChecks || {};
    const checks = [
        { id: 'nonempty', passed: Boolean(text.trim()) },
        ...(item.required || []).map(rule => ({ id: rule.id, passed: new RegExp(rule.pattern, 'isu').test(text) })),
        ...(item.forbidden || []).map(rule => ({ id: rule.id, passed: !new RegExp(rule.pattern, 'isu').test(text) })),
    ];
    if (structural.requiresChart) {
        const specs = extractChartSpecs(text, blocks);
        checks.push({
            id: 'valid-chart-spec',
            passed: hasValidChartSpec(specs, {
                minLabels: Number(structural.minChartLabels || 2),
                minSeries: Number(structural.chartSeriesCount || 1),
            }),
        });
    }
    if (structural.requiresTable) {
        checks.push({ id: 'valid-markdown-table', passed: hasMarkdownOrBlockTable(text, blocks) });
    }
    if (Array.isArray(structural.requiredUrls) && structural.requiredUrls.length) {
        checks.push({
            id: 'required-source-urls',
            passed: structural.requiredUrls.every(rawUrl => text.includes(format(rawUrl, item))),
        });
    }
    const audit = auditResearchAnswer(plan, evidence, text, now);
    checks.push({ id: 'dated-excerpt-provenance', passed: !audit.needed });
    const answerHash = fingerprint(text);
    const reviewValid = review?.answerHash === answerHash && typeof review.reviewer === 'string' && review.reviewer.trim()
        && Number.isFinite(Date.parse(review.reviewedAt)) && DIMENSIONS.every(field => Number.isInteger(review.scores?.[field]) && review.scores[field] >= 0 && review.scores[field] <= 2);
    return { id: item.id, category: item.category || 'trade_research', answerHash, automaticPassed: checks.every(row => row.passed), checks,
        issues: audit.issues, humanReview: reviewValid ? { status: 'recorded', scores: review.scores } : { status: review ? 'invalid_or_stale' : 'pending' },
        latencyMs: Number.isFinite(answer?.latencyMs) && answer.latencyMs >= 0 ? answer.latencyMs : null,
        fallbackUsed: answer?.fallbackUsed === true };
}
function summarizeEvaluation(results, { datasetVersion, mode, datasetStatus } = {}) {
    const latencies = results.map(row => row.latencyMs).filter(Number.isFinite).sort((a, b) => a - b);
    const percentile = fraction => latencies.length ? latencies[Math.max(0, Math.ceil(latencies.length * fraction) - 1)] : null;
    const reviewed = results.filter(row => row.humanReview.status === 'recorded');
    const categories = new Map();
    for (const row of results) {
        const key = row.category || 'trade_research';
        const bucket = categories.get(key) || { total: 0, passed: 0 };
        bucket.total += 1;
        if (row.automaticPassed) bucket.passed += 1;
        categories.set(key, bucket);
    }
    return { datasetVersion, datasetStatus, mode, cases: results.length, automaticPassed: results.filter(row => row.automaticPassed).length,
        byCategory: Object.fromEntries(categories),
        humanReviewed: reviewed.length, humanScores: Object.fromEntries(DIMENSIONS.map(field => [field,
            reviewed.length ? reviewed.reduce((sum, row) => sum + row.humanReview.scores[field], 0) / reviewed.length : null])),
        latency: { samples: latencies.length, p50Ms: percentile(.5), p95Ms: percentile(.95) },
        fallbackCount: results.filter(row => row.fallbackUsed).length,
        notice: 'Controles automáticos y muestra de diagnóstico. Una coincidencia de patrones no certifica verdad semántica. La revisión humana sólo cuenta para el texto exacto revisado.' };
}
module.exports = { evaluateAnswer, summarizeEvaluation, fingerprint, DIMENSIONS, extractChartSpecs, hasValidChartSpec, hasMarkdownOrBlockTable };
