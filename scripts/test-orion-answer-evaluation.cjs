'use strict';
const assert = require('node:assert/strict');
const dataset = require('./lib/orion-evaluation-cases.json');
const { evaluateAnswer, summarizeEvaluation, DIMENSIONS } = require('../backend/ai/answer-evaluation');
const { caseContext, format } = require('./evaluate-orion-answers.cjs');
const { researchLedger, verifiedResearchFallback, auditResearchAnswer } = require('../backend/ai/research-evidence');
const { groundingSourcesMarkdown, AIOrchestrator } = require('../backend/ai/orchestrator');
let rejected = 0;
const results = dataset.cases.map(item => {
    const answer = { text: format(item.reference, item) };
    const result = evaluateAnswer(item, answer, caseContext(item));
    const context = caseContext(item);
    assert.equal(context.plan.needsTradeResearch, true, item.id + ': recupera medidas y anuncios comerciales');
    const fallback = verifiedResearchFallback(researchLedger(context.plan, context.evidence, context.now));
    assert.equal(auditResearchAnswer(context.plan, context.evidence, fallback, context.now).needed, false, item.id + ': el respaldo conserva procedencia');
    const withSources = fallback + '\n\n' + groundingSourcesMarkdown(context.evidence.citations, context.evidence.tradePeriod);
    assert.equal(auditResearchAnswer(context.plan, context.evidence, withSources, context.now).needed, false, item.id + ': la bibliografía también identifica antecedentes');
    if (['commitment-not-execution', 'proposal-not-enacted', 'publication-and-effective-date', 'quantity-with-unit', 'conditional-financial-effect'].includes(item.id)) {
        assert(evaluateAnswer(item, { text: fallback }, context).automaticPassed, item.id + ': el respaldo conserva la información decisiva');
    }
    assert(result.automaticPassed, JSON.stringify({ id: item.id, result }));
    assert.equal(result.humanReview.status, 'pending');
    for (const text of item.mutations) {
        const invalid = evaluateAnswer(item, { text: format(text, item) }, caseContext(item));
        assert(!invalid.automaticPassed, item.id + ': ' + text); rejected++;
    }
    const review = { answerHash: result.answerHash, reviewer: 'Test reviewer', reviewedAt: '2026-10-15T18:00:00Z', scores: Object.fromEntries(DIMENSIONS.map(key => [key, 2])) };
    assert.equal(evaluateAnswer(item, answer, { ...caseContext(item), review }).humanReview.status, 'recorded');
    assert.equal(evaluateAnswer(item, { text: answer.text + ' modified' }, { ...caseContext(item), review }).humanReview.status, 'invalid_or_stale');
    assert.equal(evaluateAnswer(item, answer, { ...caseContext(item), review: { ...review, scores: { ...review.scores, sourceSupport: 10 } } }).humanReview.status, 'invalid_or_stale');
    return result;
});
const summary = summarizeEvaluation(results, { datasetStatus: dataset.status });
assert.equal(summary.humanReviewed, 0); assert.equal(summary.humanScores.sourceSupport, null);
assert.equal(summary.latency.p95Ms, null, 'No inventar latencia a partir de respuestas de referencia');
const timed = summarizeEvaluation([10, 50, 100].map(latencyMs => ({ ...results[0], latencyMs })));
assert.equal(timed.latency.p50Ms, 50); assert.equal(timed.latency.p95Ms, 100);
(async () => {
    for (const id of ['conditional-financial-effect', 'background-not-current']) {
        const item = dataset.cases.find(row => row.id === id), context = caseContext(item);
        let generations = 0;
        const chat = new AIOrchestrator({
            provider: { name: 'fixture', isConfigured: () => true, generate: async () => {
                generations++; return { text: id === 'background-not-current' ? 'Arancel aprobado 99%.' : format(item.reference, item), model: 'fixture' };
            } },
            liveDataGrounder: async () => context.evidence, forecastBuilder: async () => null, statisticsBuilder: async () => null, priceArchive: null,
            retriever: { retrieve: async () => ({ context: '', citations: [], sourceCodes: [] }), recordQuery: async () => null, recordEvidence: async () => null },
        });
        const response = await chat.generateStructured({ message: item.question, history: [] });
        assert(generations > 0, 'La pregunta sobre un acuerdo no se desvía a una calculadora sin datos');
        assert.equal(response.response.meta.calculation, undefined);
        assert(response.text.includes(context.evidence.tradeDocuments[0].url));
        const checked = auditResearchAnswer(context.plan, context.evidence, response.text, context.now);
        assert.equal(checked.needed, false, JSON.stringify({ id, issues: checked.issues, text: response.text }));
        if (id === 'background-not-current') {
            assert(response.response.meta.researchAudit.fallbackUsed); assert.doesNotMatch(response.text, /99%/);
        }
    }
    console.log(`ORION evaluation: ${results.length} referencias válidas, ${rejected} errores detectados, revisión humana y métricas independientes; integración de investigación/respaldo OK`);
})().catch(error => { console.error(error); process.exitCode = 1; });
