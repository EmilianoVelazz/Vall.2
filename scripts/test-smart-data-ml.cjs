'use strict';
process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SemanticSearch, bm25Scores } = require('../backend/ai/semantic-search');
const { cosineSimilarity, normalizeVector } = require('../backend/ai/providers/gemini-provider');
const { indexKnowledgeDocuments, hybridSearch, getDynamicFewShotContext, getVectorIndexStats } = require('../backend/ai/vector-knowledge');
const { alignMultivariateSeries, computeConformalInterval, assessMultivariateForecast, estimateCrossAssetElasticities } = require('../backend/ml/multivariate-forecast');
const { robustMadZScores, IsolationForest, clusterMarketRegimes } = require('../backend/ml/anomaly-detector');
const { buildDeterministicReview } = require('../backend/ai/ml-unsupervised');
const { recordFeedbackEvent, getFeedbackStats, distillClosedLoopProposals } = require('../backend/ai/closed-loop-feedback');
const { sanitizePii, buildSftDataset } = require('../backend/ai/sft-dataset-builder');

function isoDateOffset(startMs, days) {
    return new Date(startMs + days * 86_400_000).toISOString().slice(0, 10);
}

async function runVectorAndBm25Tests(tmpDir) {
    const cacheFile = path.join(tmpDir, 'vector-index.json');
    const qEmb = normalizeVector([1, 0.2, 0.05, ...Array(13).fill(0)]);
    const matchEmb = normalizeVector([0.96, 0.25, 0.04, ...Array(13).fill(0)]);
    const offTopicEmb = normalizeVector([0, 0.1, 0.99, ...Array(13).fill(0)]);

    const bm = bm25Scores('costo maíz ración porcina', [
        'Política monetaria tasas CETES México',
        'Transmisión de costo de maíz y soya en ración porcina',
        'Precio aluminio industrial Londres',
    ]);
    assert(bm[1] > bm[0] && bm[1] > bm[2], 'BM25 debe priorizar el documento con términos de maíz y ración porcina');
    assert(cosineSimilarity(qEmb, matchEmb) > 0.9 && cosineSimilarity(qEmb, offTopicEmb) < 0.2);

    const sem = new SemanticSearch();
    const ranked = await sem.rank('ración maíz cerdo', [
        { title: 'Aluminio', content: 'mercado metales', embedding: offTopicEmb },
        { title: 'Ración cerdo', content: 'maíz y soya para porcicultura', embedding: matchEmb },
    ], { queryEmbedding: qEmb });
    assert.equal(ranked[1].retrieval_mode, 'hybrid_vector_bm25');
    assert(ranked[1].semantic_score > ranked[0].semantic_score);

    const idxRes = await indexKnowledgeDocuments([
        {
            doc_key: 'doc-pork-ration',
            source_kind: 'report',
            domain: 'both',
            title: 'Impacto del maíz amarillo en margen porcino MX',
            content: 'El maíz amarillo representa 70% de la ración pecuaria en granjas mexicanas y responde al tipo de cambio USD/MXN.',
            as_of_date: '2026-11-15',
            embedding: matchEmb,
        },
        {
            doc_key: 'doc-copper-off',
            source_kind: 'report',
            domain: 'both',
            title: 'Cobre refinado en LME',
            content: 'Inventarios de cobre industrial en Shanghái y demanda eléctrica.',
            as_of_date: '2025-05-01',
            embedding: offTopicEmb,
        },
        {
            doc_key: 'ex-pork-1',
            source_kind: 'few_shot_exemplar',
            domain: 'chat',
            title: 'Calcula el margen de ración porcina con maíz importado',
            content: 'Protocolo válido: separar costo spot en USD/ton vs flete México, evitando citar precios de 420 USD o 2025-11-01 sin fuente.',
            as_of_date: '2026-11-18',
            embedding: matchEmb,
        },
    ].map(doc=>({...doc,quality_score:90,metadata:{visibility:'public',approved_for_retrieval:true}})), { persistSupabase: false, cacheFile, generateEmbeddings: false });

    assert.equal(idxRes.totalDocs, 3);
    const search = await hybridSearch('margen porcino maíz México tipo de cambio', {
        cacheFile,
        kinds: ['report'],
        queryEmbedding: qEmb,
        allowRemote: false,
    });
    assert.equal(search.results[0].doc_key, 'doc-pork-ration');
    assert.equal(search.strategy, 'local_hybrid_vector_bm25_rrf');

    const fsCtx = await getDynamicFewShotContext({
        message: 'margen ración porcina maíz importado',
        plan: {},
        cacheFile,
    });
    assert(fsCtx.includes('[EJEMPLOS VERIFICADOS DE RAZONAMIENTO · FEW-SHOT DINÁMICO]'));
    assert(!fsCtx.includes('420 USD'), 'Few-shot no debe inyectar precios literales obsoletos');
    assert(!fsCtx.includes('2025-11-01'), 'Few-shot no debe inyectar fechas literales obsoletas');
    assert.equal(getVectorIndexStats({ cacheFile }).total, 3);
}

function runMultivariateAndConformalTests() {
    const startMs = Date.parse('2025-01-01T00:00:00Z');
    const n = 120;
    const xSeries = [];
    const ySeries = [];
    let y = 100;
    let x = 50;

    for (let t = 0; t < n; t++) {
        // Serie exógena determinista con ciclos marcados
        x = 50 + 6 * Math.sin(t / 3.5) + 2.5 * Math.cos(t / 7) + 0.08 * t;
        xSeries.push({ date: isoDateOffset(startMs, t), value: x });
    }
    for (let t = 0; t < n; t++) {
        if (t > 0) {
            const dxPrev = xSeries[t - 1].value - (t >= 2 ? xSeries[t - 2].value : xSeries[t - 1].value);
            y = 100 + 0.35 * (y - 100) + 1.45 * dxPrev + 0.8 * Math.sin(t / 5) + 0.06 * t;
        }
        ySeries.push({ date: isoDateOffset(startMs, t), value: y });
    }

    // Cero fuga futura: un driver fechado mañana no entra en la alineación hasta mañana
    const futureDriver = [...xSeries, { date: isoDateOffset(startMs, n + 5), value: 9999 }];
    const alignedCheck = alignMultivariateSeries(ySeries, { X: futureDriver }, Date.parse(isoDateOffset(startMs, n + 10)));
    assert(alignedCheck.aligned.every(row => row.exog.X < 5000), 'alignMultivariateSeries jamás usa exógenas con fecha futura');

    const mv = assessMultivariateForecast(ySeries, { X: xSeries }, {
        horizon: 1,
        now: Date.parse(isoDateOffset(startMs, n)) + 3_600_000,
        featureNames: null,
    });
    assert.equal(mv.eligible, true, 'Modelo multivariable ARX debe superar baseline');
    assert(mv.evaluation.multivariateMae < mv.evaluation.univariateMae,
        `Ridge-ARX MAE (${mv.evaluation.multivariateMae}) debe superar a Ridge Univariado MAE (${mv.evaluation.univariateMae})`);
    assert(mv.evaluation.multivariateMae < mv.evaluation.baselineMae,
        'Ridge-ARX debe superar al baseline ingenuo');
    assert(mv.forecast.conformal90 && mv.forecast.conformal80);

    // Conformal Prediction coverage check sobre residuos sintéticos ordenados deterministas
    const synthRes = Array.from({ length: 100 }, (_, i) => ((i % 20) + 1) * 0.5);
    const conf = computeConformalInterval(synthRes, { alpha: 0.1 });
    assert(conf.empiricalCoverage >= 0.88 && conf.empiricalCoverage <= 0.96, `Cobertura conformal ~90%: ${conf.empiricalCoverage}`);

    const elast = estimateCrossAssetElasticities({ Y: ySeries, X: xSeries });
    assert(elast.length >= 2 && elast.some(e => e.target === 'Y' && e.driver === 'X'));
}

function runAnomalyAndRegimeTests() {
    const base = [50.1, 50.3, 49.9, 50.0, 50.2, 49.8, 50.1, 50.4, 49.95, 50.05];
    const withOutlier = [...base, 92.5];
    const mad = robustMadZScores(withOutlier);
    assert(Math.abs(mad.scores.at(-1)) > 5, 'MAD Z-score debe marcar fuertemente un outlier extremo');

    const normalVecs = Array.from({ length: 48 }, (_, i) => [50 + Math.sin(i) * 0.4, 1 + Math.cos(i) * 0.1]);
    const allVecs = [...normalVecs, [120, 25]];
    const iso = new IsolationForest({ nTrees: 64, sampleSize: 48 }).fit(allVecs);
    const scores = iso.score(allVecs);
    assert(scores.at(-1) >= 0.62, `IsolationForest debe detectar el punto anómalo (${scores.at(-1)})`);
    assert(scores.at(-1) > scores[0] + 0.12);

    const calmStart = Date.parse('2025-06-01T00:00:00Z');
    const calmPart = Array.from({ length: 42 }, (_, i) => ({
        date: isoDateOffset(calmStart, i),
        value: 100 + Math.sin(i / 2) * 0.4,
    }));
    const shockPart = Array.from({ length: 10 }, (_, i) => ({
        date: isoDateOffset(calmStart, 42 + i),
        value: 100 + (i % 2 === 0 ? 11 : -9) + i * 0.3,
    }));
    const regimes = clusterMarketRegimes([...calmPart, ...shockPart]);
    assert(regimes && regimes.clusters.length === 3);
    assert.equal(regimes.currentRegime, 'Estrés / Choque de Volatilidad');
    assert.equal(regimes.regimeShift, true);

    const review = buildDeterministicReview({
        sniim: {
            ts: Date.now(),
            cerdo: { norte: 48, centro: 46, sur: 47 },
            res: { norte: 112, centro: 110, sur: 111 },
            pollo: { norte: 41, centro: 39, sur: 40 },
            huevo: { norte: 34, centro: 33, sur: 118 },
            _meta: { source: 'SNIIM', real_time: false, type: 'STATIC_REFERENCE' },
        },
        commodities: {},
    });
    assert.equal(review.status, 'review_required');
    assert(review.unsupervised && review.unsupervised.method.includes('isolation_forest'));
    assert(review.unsupervised.anomalyCount >= 1);
}

async function runClosedLoopAndSftTests(tmpDir) {
    const fbFile = path.join(tmpDir, 'feedback-events.json');
    const propFile = path.join(tmpDir, 'proposals.json');
    const vecFile = path.join(tmpDir, 'vector-sft.json');

    await recordFeedbackEvent({
        queryText: 'Compara cerdo vivo contra carne en canal en Guadalajara',
        responseText: 'El precio promedio fue 45 MXN.',
        rating: 2,
        isHelpful: false,
        correctionText: 'No mezclar cerdo en pie con canal sin aclarar rendimiento ni merma',
        category: 'protein_comparison',
        sourceKind: 'user_feedback',
    }, { persistSupabase: false, cacheFile: fbFile });

    await recordFeedbackEvent({
        queryText: 'Analiza sensibilidad de ración balanceada con USD/MXN a 20.5',
        responseText: 'Un incremento cambiario de 5% eleva el componente importado de maíz y soya en la ración proporcionalmente al contenido en USD.',
        rating: 5,
        isHelpful: true,
        category: 'fx_agribusiness',
        sourceKind: 'user_feedback',
    }, { persistSupabase: false, cacheFile: fbFile });

    assert.equal(getFeedbackStats({ cacheFile: fbFile }).pendingLoopusCount, 2);

    const distilled = await distillClosedLoopProposals({
        limit: 10,
        provider: null,
        cacheFile: fbFile,
        proposalsFile: propFile,
        vectorCacheFile: vecFile,
        persistSupabase: false,
    });
    assert.equal(distilled.proposalsCreated, 1);
    assert.equal(distilled.proposals[0].status, 'pending_human_review');
    assert.equal(distilled.exemplarsPromoted, 0,'Private feedback is never published automatically');
    assert.equal(getFeedbackStats({ cacheFile: fbFile }).pendingLoopusCount, 0);

    // Prueba redacción de PII en SFT Dataset Builder
    const piiCheck = sanitizePii('Contacta a juan.perez@empresa.mx o al 5512345678 con Bearer eyJhbGciOiJIUzI1NiJ9.abcdefghijkl.mnop');
    assert(!piiCheck.text.includes('juan.perez@empresa.mx'));
    assert(!piiCheck.text.includes('5512345678'));
    assert(!piiCheck.text.includes('eyJhbGci'));
    assert(piiCheck.redactions >= 3);

    fs.writeFileSync(propFile, JSON.stringify([{
        status: 'approved',public_retrieval:true,
        domain: 'chat',
        topic: 'test_sft',
        condition_trigger: 'Contacto comercial cliente@test.com teléfono +52 55 9876 5432',
        learned_rule: 'Nunca mezclar unidades sin factor documentado.',
        reasoning_chain: 'Unidad -> Factor -> Validación',
        confidence_score: 95,
    }]), 'utf8');

    const geminiSft = buildSftDataset({
        format: 'gemini',
        includeRules: true,
        includeBenchmarks: true,
        includeFeedback: true,
        cacheFiles: { proposalsFile: propFile, feedbackFile: fbFile },
    });
    assert.equal(geminiSft.count,1,'Only explicitly approved public rules enter SFT; benchmarks and private feedback stay out');
    assert(geminiSft.stats.piiRedacted >= 2);
    const parsedGemini = geminiSft.jsonl.split('\n').filter(Boolean).map(line => JSON.parse(line));
    assert(parsedGemini.every(row => row.systemInstruction && Array.isArray(row.contents) && row.contents.length === 2));

    const openAiSft = buildSftDataset({
        format: 'openai_chat',
        includeRules: true,
        includeBenchmarks: true,
        includeFeedback: true,
        cacheFiles: { proposalsFile: propFile, feedbackFile: fbFile },
    });
    assert.equal(openAiSft.count, geminiSft.count);
    const parsedOpenAi = openAiSft.jsonl.split('\n').filter(Boolean).map(line => JSON.parse(line));
    assert(parsedOpenAi.every(row => Array.isArray(row.messages) && row.messages.length === 3));
}

async function main() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vallnews-smart-ml-'));
    try {
        await runVectorAndBm25Tests(tmpDir);
        runMultivariateAndConformalTests();
        runAnomalyAndRegimeTests();
        await runClosedLoopAndSftTests(tmpDir);
        console.log('Smart Data & ML suite: OK (vector/BM25 RRF, few-shot sin fuga, Ridge-ARX multivariable, Conformal P80/P90, VAR-1, MAD/IsolationForest/K-Means, Closed-Loop y SFT JSONL).');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

main().catch(err => {
    console.error(err);
    process.exitCode = 1;
});
