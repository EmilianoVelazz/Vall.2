'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const dataset = require('./lib/orion-evaluation-cases.json');
const { evaluateAnswer, summarizeEvaluation, DIMENSIONS } = require('../backend/ai/answer-evaluation');
const { planQuery } = require('../backend/ai/query-planner');
const NOW = Date.parse('2026-10-15T18:00:00Z');
const arg = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const urlFor = id => `https://example.org/orion-simulation/${id}`;
const format = (value, item) => value.replaceAll('{url}', urlFor(item.id));
function caseContext(item) {
    const document = { url: urlFor(item.id), date: item.date, verified: true, title: 'SIMULACIÓN · ' + item.id,
        source: 'Documento ficticio de evaluación', excerpts: [item.excerpt] };
    return { plan: planQuery({ message: item.question }), now: NOW, evidence: {
        context: 'DATOS FICTICIOS. No son noticias reales.\n' + JSON.stringify(document), available: true,
        citations: [{ ...document, type: 'verified_trade_document' }], tradeDocuments: [document],
        tradePeriod: { start: '2026-09-01', end: '2026-09-30' }, charts: [], sourceCodes: [], evidenceCount: 1 } };
}
async function main() {
    const live = process.argv.includes('--live'), answersPath = arg('--answers'), reviewsPath = arg('--reviews');
    const selectedCase = arg('--case');
    const cases = selectedCase ? dataset.cases.filter(item => item.id === selectedCase) : dataset.cases;
    if (!cases.length) throw Error('Caso de evaluación desconocido.');
    if (live && answersPath) throw Error('Elige --live o --answers, no ambos.');
    const mode = live ? 'live_synthetic_sample' : answersPath ? 'recorded_answers' : 'reference_and_mutation_controls';
    const supplied = answersPath ? JSON.parse(await fs.readFile(path.resolve(answersPath), 'utf8')) : [];
    const reviews = reviewsPath ? JSON.parse(await fs.readFile(path.resolve(reviewsPath), 'utf8')) : [];
    if (!Array.isArray(supplied) || !Array.isArray(reviews)) throw Error('Respuestas y revisiones deben ser listas JSON.');
    const suppliedMap = new Map(supplied.map(row => [row.id, row]));
    const reviewMap = new Map(reviews.map(row => [row.id, row]));
    if (suppliedMap.size !== supplied.length || reviewMap.size !== reviews.length) throw Error('No se permiten identificadores duplicados.');
    const known = new Set(dataset.cases.map(row => row.id));
    if ([...suppliedMap.keys(), ...reviewMap.keys()].some(id => !known.has(id))) throw Error('Hay identificadores ajenos al conjunto evaluado.');
    let provider;
    if (live) {
        require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });
        require('dotenv').config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
        require('../backend/lib/tls-trust').configureSystemTrust();
        const { GeminiProvider } = require('../backend/ai/providers/gemini-provider');
        provider = new GeminiProvider();
        if (!provider.isConfigured()) throw Error('Proveedor no configurado.');
    }
    const results = [], mutations = [], reviewPacket = [], liveAnswers = [];
    for (const item of cases) {
        const context = caseContext(item);
        let answer = answersPath ? suppliedMap.get(item.id) || { text: '' } : { text: format(item.reference, item) };
        if (live) {
            const { AIOrchestrator } = require('../backend/ai/orchestrator');
            const empty = { context: '', citations: [], sourceCodes: [], charts: [], evidenceCount: 0 };
            const chat = new AIOrchestrator({
                provider: { name: provider.name, isConfigured: () => true,
                    generate: request => provider.generate({ ...request, tools: null, timeoutMs: Math.min(request.timeoutMs || 25000, 25000), maxOutputTokens: 3072 }) },
                retriever: { retrieve: async () => empty, recordQuery: async () => null, recordEvidence: async () => null },
                liveDataGrounder: async () => context.evidence, forecastBuilder: async () => null, statisticsBuilder: async () => null, priceArchive: null,
            });
            const started = Date.now();
            try {
                const response = await chat.generateStructured({ message: item.question + ' Usa sólo los documentos ficticios proporcionados.', history: [], tier: 'flash', signal: AbortSignal.timeout(35000) });
                answer = { text: response.text, latencyMs: Date.now() - started, fallbackUsed: response.response.meta.researchAudit?.fallbackUsed === true };
            } catch { answer = { text: '', latencyMs: Date.now() - started, error: 'provider_unavailable' }; }
            liveAnswers.push({ id: item.id, ...answer });
            console.log(JSON.stringify({ case: item.id, completed: !answer.error, latencyMs: answer.latencyMs }));
        }
        const result = evaluateAnswer(item, answer, { ...context, review: reviewMap.get(item.id) });
        results.push(result);
        reviewPacket.push({ id: item.id, question: item.question, excerpt: item.excerpt, answerHash: result.answerHash,
            reviewer: '', reviewedAt: '', scores: Object.fromEntries(DIMENSIONS.map(field => [field, null])), notes: '' });
        if (!live && !answersPath) for (const text of item.mutations) {
            const mutated = evaluateAnswer(item, { text: format(text, item) }, context);
            mutations.push({ case: item.id, rejected: !mutated.automaticPassed });
        }
    }
    const summary = summarizeEvaluation(results, { datasetVersion: dataset.version, datasetStatus: dataset.status, mode });
    const report = { ...summary, mutationControls: { total: mutations.length, rejected: mutations.filter(row => row.rejected).length }, results };
    const directory = path.resolve(__dirname, '../output/analisis-inteligencia-orion');
    await fs.mkdir(directory, { recursive: true });
    const suffix = (live ? 'live' : answersPath ? 'recorded' : 'controls') + (selectedCase ? '-' + selectedCase : '');
    await fs.writeFile(path.join(directory, `answer-evaluation-${suffix}.json`), JSON.stringify(report, null, 2));
    await fs.writeFile(path.join(directory, `human-review-${suffix}.json`), JSON.stringify(reviewPacket, null, 2));
    if (live) await fs.writeFile(path.join(directory, `synthetic-${suffix}-answers.json`), JSON.stringify(liveAnswers, null, 2));
    console.log(JSON.stringify({ ...summary, mutationControls: report.mutationControls }, null, 2));
    if (results.some(row => !row.automaticPassed) || mutations.some(row => !row.rejected)) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { caseContext, format };
