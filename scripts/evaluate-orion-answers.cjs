'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const dataset = require('./lib/orion-evaluation-cases.json');
const { evaluateAnswer, summarizeEvaluation, DIMENSIONS } = require('../backend/ai/answer-evaluation');
const { planQuery } = require('../backend/ai/query-planner');
const NOW = Date.parse('2026-10-15T18:00:00Z');
const arg = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const urlFor = id => `https://example.org/orion-simulation/${id}`;
function itemUrls(item) {
    if (Array.isArray(item?.documents) && item.documents.length) {
        return item.documents.map((doc, idx) => urlFor(`${item.id}-${doc.id || idx + 1}`));
    }
    return [urlFor(item?.id || 'case')];
}
function format(value, item) {
    const urls = itemUrls(item);
    let out = String(value || '').replaceAll('{url}', urls[0]);
    urls.forEach((u, idx) => { out = out.replaceAll(`{url_${idx + 1}}`, u); });
    return out;
}
function caseContext(item) {
    const urls = itemUrls(item);
    const documents = Array.isArray(item?.documents) && item.documents.length
        ? item.documents.map((doc, idx) => ({
            url: urls[idx], date: doc.date, verified: true,
            title: doc.title || ('SIMULACIÓN · ' + item.id),
            source: doc.source || 'Documento ficticio de evaluación',
            excerpts: [doc.excerpt],
        }))
        : (item?.excerpt && item?.date ? [{
            url: urls[0], date: item.date, verified: true,
            title: 'SIMULACIÓN · ' + item.id,
            source: 'Documento ficticio de evaluación',
            excerpts: [item.excerpt],
        }] : []);
    const attachments = (Array.isArray(item?.attachments) ? item.attachments : []).map((att, idx) => ({
        id: `eval-${item.id}-${idx}`,
        name: att.name,
        type: att.type,
        base64: Buffer.from(String(att.content || ''), 'utf8').toString('base64'),
    }));
    const proteinRecords = Array.isArray(item?.proteinPriceRecords) ? item.proteinPriceRecords : [];
    const contextSections = [];
    if (documents.length) contextSections.push('DATOS FICTICIOS. No son noticias reales.\n' + documents.map(doc => JSON.stringify(doc)).join('\n'));
    if (proteinRecords.length) contextSections.push('[PRECIOS FÍSICOS VERIFICADOS DE EVALUACIÓN]\n' + JSON.stringify({ fxRates: item.fxRates || null, records: proteinRecords }));
    if (Array.isArray(item?.attachments) && item.attachments.length) {
        contextSections.push('[ARCHIVOS ADJUNTOS EN EVALUACIÓN]\n' + item.attachments.map(att => `### ${att.name} (${att.type})\n${att.content}`).join('\n\n'));
    }
    if (item?.extraContext) contextSections.push(String(item.extraContext));
    const charts = Array.isArray(item?.charts) ? item.charts : [];
    const citations = [
        ...documents.map(doc => ({ ...doc, type: 'verified_trade_document' })),
        ...proteinRecords.map(rec => ({ id: rec.id, url: rec.url, date: rec.date, title: `${rec.market} · ${rec.category}`, source: rec.source, market: rec.market, type: 'verified_protein_price' })),
    ];
    return {
        plan: planQuery({ message: item.question }),
        now: NOW,
        attachments,
        forecast: item?.forecast ? { ...item.forecast, context: item.extraContext || '' } : null,
        evidence: {
            context: contextSections.join('\n\n'),
            available: Boolean(contextSections.length || charts.length),
            citations,
            tradeDocuments: documents,
            tradePeriod: documents.length ? { start: '2026-09-01', end: '2026-09-30' } : undefined,
            proteinPrices: proteinRecords.length ? { available: true, fetchedAt: '2026-09-25T18:00:00Z', records: proteinRecords, coverage: [] } : undefined,
            proteinPriceRecords: proteinRecords,
            fxRates: item?.fxRates || null,
            charts,
            chartRequested: Boolean(item?.chartRequested),
            chartStatus: charts.length ? 'served' : 'not_requested',
            sourceCodes: [],
            evidenceCount: documents.length + proteinRecords.length + attachments.length + charts.length,
        },
    };
}
async function main() {
    const live = process.argv.includes('--live'), answersPath = arg('--answers'), reviewsPath = arg('--reviews');
    const selectedCase = arg('--case'), selectedCategory = arg('--category');
    const cases = dataset.cases.filter(item => (!selectedCase || item.id === selectedCase) && (!selectedCategory || item.category === selectedCategory));
    if (!cases.length) throw Error('Caso o categoría de evaluación desconocida.');
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
                liveDataGrounder: async () => context.evidence, forecastBuilder: async () => context.forecast || null, statisticsBuilder: async () => null, priceArchive: null,
            });
            const started = Date.now();
            try {
                const liveHint = context.attachments?.length ? ' Usa los datos y archivos ficticios proporcionados.' : ' Usa sólo los documentos ficticios proporcionados.';
                const response = await chat.generateStructured({ message: item.question + liveHint, history: [], attachments: context.attachments || [], tier: 'flash', signal: AbortSignal.timeout(35000) });
                answer = { text: response.text, response: response.response, latencyMs: Date.now() - started, fallbackUsed: response.response.meta?.researchAudit?.fallbackUsed === true };
            } catch { answer = { text: '', latencyMs: Date.now() - started, error: 'provider_unavailable' }; }
            liveAnswers.push({ id: item.id, category: item.category, ...answer });
            console.log(JSON.stringify({ case: item.id, category: item.category, completed: !answer.error, latencyMs: answer.latencyMs }));
        }
        const result = evaluateAnswer(item, answer, { ...context, format, review: reviewMap.get(item.id) });
        results.push(result);
        const excerptSummary = item.excerpt || (item.documents || []).map(d => `${d.source}: ${d.excerpt}`).join(' | ') || (item.attachments || []).map(a => `${a.name}: ${a.content}`).join(' | ') || item.extraContext || '';
        reviewPacket.push({ id: item.id, category: item.category || 'trade_research', question: item.question, excerpt: excerptSummary.slice(0, 1200), answerHash: result.answerHash,
            reviewer: '', reviewedAt: '', scores: Object.fromEntries(DIMENSIONS.map(field => [field, null])), notes: '' });
        if (!live && !answersPath) for (const text of item.mutations) {
            const mutated = evaluateAnswer(item, { text: format(text, item) }, { ...context, format });
            mutations.push({ case: item.id, rejected: !mutated.automaticPassed });
        }
    }
    const summary = summarizeEvaluation(results, { datasetVersion: dataset.version, datasetStatus: dataset.status, mode });
    const report = { ...summary, mutationControls: { total: mutations.length, rejected: mutations.filter(row => row.rejected).length }, results };
    const directory = path.resolve(__dirname, '../output/analisis-inteligencia-orion');
    await fs.mkdir(directory, { recursive: true });
    const scopeSuffix = (selectedCategory ? '-' + selectedCategory : '') + (selectedCase ? '-' + selectedCase : '');
    const suffix = (live ? 'live' : answersPath ? 'recorded' : 'controls') + scopeSuffix;
    await fs.writeFile(path.join(directory, `answer-evaluation-${suffix}.json`), JSON.stringify(report, null, 2));
    await fs.writeFile(path.join(directory, `human-review-${suffix}.json`), JSON.stringify(reviewPacket, null, 2));
    if (live) await fs.writeFile(path.join(directory, `synthetic-${suffix}-answers.json`), JSON.stringify(liveAnswers, null, 2));
    console.log(JSON.stringify({ ...summary, mutationControls: report.mutationControls }, null, 2));
    if (results.some(row => !row.automaticPassed) || mutations.some(row => !row.rejected)) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { caseContext, format };
