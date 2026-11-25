'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {knowledgeDecision,validDate,provenanceHash,hasPrivateScope}=require('./knowledge-policy');
const { GeminiProvider, cosineSimilarity, normalizeVector } = require('./providers/gemini-provider');
const { bm25Scores, conceptualSimilarity } = require('./semantic-search');
const { getChatReasoningContext, listAllKnownRules } = (() => {
    try {
        const mod = require('./loopus-knowledge');
        return {
            getChatReasoningContext: mod.getChatReasoningContext,
            listAllKnownRules: typeof mod.loadApprovedAndPlaybookRules === 'function' ? mod.loadApprovedAndPlaybookRules : null,
        };
    } catch {
        return { getChatReasoningContext: null, listAllKnownRules: null };
    }
})();

const DEFAULT_CACHE_FILE = path.join(__dirname, '../cache/vector-knowledge-index.json');
const MAX_LOCAL_DOCS = 800;
const localIndexes=new Map();

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

function cleanText(value, max = 3200) {
    return String(value || '')
        .replace(/[\u0000-\u001f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

function normalizeDate(value) {
    if (!value) return null;
    const iso = String(value).slice(0, 10);
    return validDate(iso) ? iso : null;
}

function safeDocKey(input, fallbackPrefix = 'doc') {
    const raw = cleanText(input, 160);
    if (raw) return raw;
    return `${fallbackPrefix}-${crypto.randomBytes(6).toString('hex')}`;
}

function readLocalIndex(cacheFile = DEFAULT_CACHE_FILE) {
    try {
        if (!fs.existsSync(cacheFile)) return { version: 1, updatedAt: null, docs: [] };
        const stat=fs.statSync(cacheFile),version=[stat.ino,stat.mtimeMs,stat.ctimeMs,stat.size].join('|'),cached=localIndexes.get(cacheFile);
        if(cached?.version===version)return cached.index;
        const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        const docs = Array.isArray(parsed?.docs) ? parsed.docs : [];
        const index={version:1,updatedAt:parsed?.updatedAt||null,docs};
        if(localIndexes.size>=4)localIndexes.delete(localIndexes.keys().next().value);
        localIndexes.set(cacheFile,{version,index});return index;
    } catch {
        return { version: 1, updatedAt: null, docs: [] };
    }
}

function writeLocalIndex(index, cacheFile = DEFAULT_CACHE_FILE) {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    const payload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        docs: (index?.docs || []).slice(-MAX_LOCAL_DOCS),
    };
    const temporary=cacheFile+'.'+crypto.randomUUID()+'.tmp';
    try{fs.writeFileSync(temporary,JSON.stringify(payload,null,2),{flag:'wx',mode:0o600});fs.renameSync(temporary,cacheFile);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
    localIndexes.delete(cacheFile);
    return payload;
}

async function indexKnowledgeDocuments(docs, { provider = null, persistSupabase = true, cacheFile = DEFAULT_CACHE_FILE, generateEmbeddings = true } = {}) {
    const allowedKinds = new Set(['report', 'news', 'loopus_rule', 'few_shot_exemplar', 'market_snapshot', 'protein_benchmark']);
    const allowedDomains = new Set(['chat', 'reports', 'both']);
    const existing = readLocalIndex(cacheFile);
    const byKey = new Map(existing.docs.filter(doc=>knowledgeDecision(doc).allowed).map(doc => [doc.doc_key, doc]));

    const activeProvider = generateEmbeddings && provider ? provider : null;
    let embeddedCount = 0;
    let indexedCount = 0;
    let rejectedCount=0;

    for (const raw of Array.isArray(docs) ? docs : []) {
        if(!knowledgeDecision(raw).allowed){rejectedCount++;continue;}
        const title = cleanText(raw?.title, 240);
        const content = cleanText(raw?.content, 3600);
        if (!title || !content) continue;
        const docKey = safeDocKey(raw?.doc_key, 'kv');
        const sourceKind = allowedKinds.has(raw?.source_kind) ? raw.source_kind : 'report';
        const domain = allowedDomains.has(raw?.domain) ? raw.domain : 'both';
        const prev = byKey.get(docKey);
        const embeddingModel=raw.metadata?.embedding_model||process.env.GEMINI_EMBEDDING_MODEL||'gemini-embedding-001';
        const contentChanged = !prev || prev.content !== content || prev.title !== title || prev.metadata?.embedding_model!==embeddingModel;

        let embedding = Array.isArray(raw?.embedding) && raw.embedding.length
            ? normalizeVector(raw.embedding)
            : (!contentChanged && Array.isArray(prev?.embedding) ? prev.embedding : null);

        if (!embedding && activeProvider && typeof activeProvider.embed === 'function') {
            try {
                embedding = await activeProvider.embed({
                    text: `${title}\n${content}`,
                    taskType: 'RETRIEVAL_DOCUMENT',
                    outputDimensionality: 768,
                });
            } catch { /* embedding opcional */ }
        }
        if (embedding) embeddedCount++;

        const qualityRaw = Number(raw?.quality_score ?? prev?.quality_score ?? 82);
        const qualityScore = Number.isFinite(qualityRaw) ? Math.max(0, Math.min(100, qualityRaw)) : 82;

        byKey.set(docKey, {
            doc_key: docKey,
            source_kind: sourceKind,
            domain,
            title,
            content,
            metadata: {...raw.metadata,embedding_model:embeddingModel,content_sha256:provenanceHash({...raw,title,content})},
            quality_score: qualityScore,
            as_of_date: normalizeDate(raw?.as_of_date) || prev?.as_of_date || null,
            embedding: embedding || null,
            updated_at: new Date().toISOString(),
        });
        indexedCount++;
    }

    const nextDocs = [...byKey.values()]
        .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
        .slice(0, MAX_LOCAL_DOCS);

    const saved = writeLocalIndex({ docs: nextDocs }, cacheFile);

    let supabaseUpserted = 0;
    const supabase = persistSupabase ? getSupabase() : null;
    if (supabase && nextDocs.length) {
        try {
            const batch = nextDocs.slice(0, 120).map(doc => ({
                doc_key: doc.doc_key,
                source_kind: doc.source_kind,
                domain: doc.domain,
                title: doc.title,
                content: doc.content,
                metadata: doc.metadata || {},
                quality_score: doc.quality_score,
                as_of_date: doc.as_of_date,
                ...(Array.isArray(doc.embedding) ? { embedding: `[${doc.embedding.join(',')}]` } : {}),
                updated_at: new Date().toISOString(),
            }));
            const { error } = await supabase.from('orion_knowledge_vectors').upsert(batch, { onConflict: 'doc_key' });
            if (!error) supabaseUpserted = batch.length;
        } catch { /* Supabase es respaldo cloud no bloqueante */ }
    }

    return { indexedCount, embeddedCount,rejectedCount, totalDocs: saved.docs.length, supabaseUpserted, updatedAt: saved.updatedAt };
}

function buildDefaultKnowledgeCorpus({ rootDir = path.resolve(__dirname, '../..') } = {}) {
    const docs = [];
    const reportFiles = [
        ['finance', 'backend/cache/finance_executive_reports.json'],
        ['markets', 'backend/cache/market_executive_reports.json'],
        ['mexico', 'backend/cache/mexico-executive-reports.json'],
    ];

    for (const [collection, rel] of reportFiles) {
        const filePath = path.join(rootDir, rel);
        try {
            if (!fs.existsSync(filePath)) continue;
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const asOf = normalizeDate(parsed?.generatedAt);
            for (const report of Array.isArray(parsed?.reports) ? parsed.reports : []) {
                if(hasPrivateScope(parsed)||hasPrivateScope(report))continue;
                const secText = Array.isArray(report?.sections)
                    ? report.sections.slice(0, 4).map(s => `${s.heading || ''}: ${s.text || ''}`).join(' | ')
                    : '';
                const text = cleanText(`${report.summary || ''} ${secText}`, 2800);
                if (!text) continue;
                docs.push({
                    doc_key: `report:${collection}:${report.key}`,
                    source_kind: 'report',
                    domain: 'reports',
                    title: `${report.title || report.key} (${collection})`,
                    content: text,
                    quality_score: 90,
                    as_of_date: normalizeDate(report.generatedAt) || asOf,
                    metadata: { collection, reportKey: report.key, source: 'executive_report_cache' },
                });
            }
        } catch { /* reporte opcional */ }
    }

    try {
        if (typeof listAllKnownRules === 'function') {
            for (const rule of listAllKnownRules()) {
                if (!rule?.condition_trigger || !rule?.learned_rule) continue;
                if(!String(rule.id||'').startsWith('loopus-base-')&&rule.public_retrieval!==true)continue;
                const ruleHash = crypto.createHash('sha256').update(`${rule.condition_trigger}|${rule.learned_rule}`).digest('hex').slice(0, 12);
                const uniqueRuleKey = String(rule.id || '').startsWith('loopus-base-') ? rule.id : `${rule.id || 'rule'}-${ruleHash}`;
                docs.push({
                    doc_key: `rule:${uniqueRuleKey}`,
                    source_kind: 'loopus_rule',
                    domain: rule.domain || 'both',
                    title: rule.condition_trigger,
                    content: `${rule.learned_rule}${rule.reasoning_chain ? ` Cadena lógica: ${rule.reasoning_chain}` : ''}`,
                    quality_score: rule.status === 'approved' ? 95 : 85,
                    metadata: { topic: rule.topic || 'general', status: rule.status || 'playbook' },
                });
            }
        }
    } catch { /* reglas opcionales */ }

    try {
        const proteinFile = path.join(rootDir, 'backend/cache/protein-source-snapshots.json');
        if (fs.existsSync(proteinFile)) {
            const parsed = JSON.parse(fs.readFileSync(proteinFile, 'utf8'));
            const countries = Object.keys(parsed?.countries || {});
            const checkedDate = normalizeDate(parsed?.checkedAt || parsed?.updatedAt);
            if (countries.length) {
                docs.push({
                    doc_key: 'protein:snapshots:summary',
                    source_kind: 'protein_benchmark',
                    domain: 'both',
                    title: 'Cobertura internacional de precios físicos de proteínas',
                    content: `Países con referencias verificadas en caché: ${countries.join(', ')}. Fuentes: USDA, CEPEA, DG AGRI, Mercolleida, SNIIM y ODEPA.`,
                    quality_score: 88,
                    as_of_date: checkedDate,
                    metadata: { countries },
                });
            }
        }
    } catch { /* snapshots opcionales */ }

    try {
        const showcaseFile = path.join(rootDir, 'backend/cache/ml-predictions-showcase.json');
        if (fs.existsSync(showcaseFile)) {
            const showcase = JSON.parse(fs.readFileSync(showcaseFile, 'utf8'));
            for (const asset of Array.isArray(showcase?.assets) ? showcase.assets : []) {
                const best = (asset.horizons || []).find(h => h.eligible);
                const cutoffDate = normalizeDate(asset?.cutoff);
                if (!best?.forecast || !cutoffDate) continue;
                docs.push({
                    doc_key: `ml:showcase:${String(asset.symbol || '').toLowerCase().replace(/[^a-z0-9_-]/g, '')}`,
                    source_kind: 'market_snapshot',
                    domain: 'both',
                    title: `Pronóstico ML Walk-Forward · ${asset.label} (${asset.symbol})`,
                    content: `Activo: ${asset.label} (${asset.symbol}, frecuencia ${asset.interval}, corte ${cutoffDate}). Último valor observado: ${asset.lastValue} ${asset.unit}. Pronóstico validado a h=${best.horizon} pasos: ${best.forecast.value} ${asset.unit} (${best.forecast.changePct >= 0 ? '+' : ''}${best.forecast.changePct}%, banda fuera de muestra [${best.forecast.lowerBound}, ${best.forecast.upperBound}] ${asset.unit}). Motor ganador: ${best.selectedStrategy} con mejora MAE de +${best.evaluation?.improvementPct}% frente al baseline y precisión direccional de ${best.evaluation?.directionAccuracyPct}%. Régimen: ${asset.regime?.regimeLabel || 'normal'} (${asset.regime?.trendLabel || 'estable'}).`,
                    quality_score: 92,
                    as_of_date: cutoffDate,
                    metadata: { symbol: asset.symbol, interval: asset.interval, horizon: best.horizon, source: 'loopus_ml_walkforward' },
                });
            }
        }
    } catch { /* showcase opcional */ }

    return docs.map(doc=>({...doc,metadata:{...doc.metadata,visibility:'public',approved_for_retrieval:true}}));
}

function freshnessMultiplier(asOfDate, nowMs = Date.now()) {
    if (!asOfDate) return 1;
    const ms = Date.parse(asOfDate);
    if (!Number.isFinite(ms) || ms > nowMs) return 1;
    const ageDays = Math.max(0, (nowMs - ms) / 86_400_000);
    return 1 + 0.12 * Math.exp(-ageDays / 180);
}

async function hybridSearch(query, { provider = null, kinds = null, domain = null, limit = 6, rrfK = 60, cacheFile = DEFAULT_CACHE_FILE, queryEmbedding: precomputedEmbedding = null, allowRemote = true, now = Date.now() } = {}) {
    limit=Number.isFinite(Number(limit))?Math.max(1,Math.min(32,Math.floor(Number(limit)))):6;
    rrfK=Number.isFinite(Number(rrfK))?Math.max(1,Number(rrfK)):60;
    const cleanQuery = cleanText(query, 800);
    if (!cleanQuery) return { results: [], strategy: 'empty', vectorMatches: 0, lexicalMatches: 0 };

    let queryEmbedding = Array.isArray(precomputedEmbedding) ? normalizeVector(precomputedEmbedding) : null;
    const activeProvider = provider || (allowRemote && process.env.GEMINI_API_KEY && process.env.NODE_ENV !== 'test' ? new GeminiProvider() : null);
    if (!queryEmbedding && activeProvider && typeof activeProvider.embed === 'function') {
        try {
            queryEmbedding = await activeProvider.embed({
                text: cleanQuery,
                taskType: 'RETRIEVAL_QUERY',
                outputDimensionality: 768,
                timeoutMs: 3500,
            });
        } catch { /* degradar limpiamente a léxico + conceptual */ }
    }

    const supabase = allowRemote && cacheFile === DEFAULT_CACHE_FILE ? getSupabase() : null;
    if (supabase) {
        try {
            const { data, error } = await supabase.rpc('orion_hybrid_search', {
                query_text: cleanQuery,
                query_embedding: queryEmbedding ? `[${queryEmbedding.join(',')}]` : null,
                filter_kinds: Array.isArray(kinds) && kinds.length ? kinds : null,
                filter_domain: domain || null,
                match_count: limit,
                rrf_k: rrfK,
            });
            const allowed=Array.isArray(data)?data.filter(doc=>knowledgeDecision(doc,{now}).allowed&&(!domain||doc.domain==='both'||doc.domain===domain)&&(!kinds?.length||kinds.includes(doc.source_kind))).slice(0,limit):[];
            if (!error && allowed.length) {
                return {
                    results: allowed,
                    strategy: queryEmbedding ? 'supabase_pgvector_rrf' : 'supabase_tsvector_rrf',
                    vectorMatches: allowed.filter(r => Number(r.vector_score) > 0).length,
                    lexicalMatches: allowed.filter(r => Number(r.lexical_score) > 0).length,
                };
            }
        } catch { /* fallback a caché local */ }
    }

    const index = readLocalIndex(cacheFile);
    const kindSet = Array.isArray(kinds) && kinds.length ? new Set(kinds) : null;
    const candidates = index.docs.filter(doc => {
        if(!knowledgeDecision(doc,{now}).allowed)return false;
        if (kindSet && !kindSet.has(doc.source_kind)) return false;
        if (domain && doc.domain !== 'both' && doc.domain !== domain) return false;
        return true;
    });
    if (!candidates.length) return { results: [], strategy: 'empty_index', vectorMatches: 0, lexicalMatches: 0 };

    const texts = candidates.map(doc => `${doc.title} ${doc.content}`);
    const bm25 = bm25Scores(cleanQuery, texts);

    const scored = candidates.map((doc, idx) => {
        const lex = bm25[idx] || 0;
        const concept = conceptualSimilarity(cleanQuery, texts[idx]);
        const vec = Array.isArray(queryEmbedding) && Array.isArray(doc.embedding) && doc.embedding.length === queryEmbedding.length
            ? Math.max(0, cosineSimilarity(queryEmbedding, doc.embedding))
            : 0;
        return { doc, lex, concept, vec };
    });

    const lexRanked = [...scored].filter(x => x.lex > 0 || x.concept > 0).sort((a, b) => (b.lex + b.concept * 0.45) - (a.lex + a.concept * 0.45));
    const vecRanked = queryEmbedding ? [...scored].filter(x => x.vec > 0.15).sort((a, b) => b.vec - a.vec) : [];

    const lexRankMap = new Map(lexRanked.map((x, idx) => [x.doc.doc_key, idx + 1]));
    const vecRankMap = new Map(vecRanked.map((x, idx) => [x.doc.doc_key, idx + 1]));

    const fused = scored
        .map(item => {
            const vRank = vecRankMap.get(item.doc.doc_key);
            const lRank = lexRankMap.get(item.doc.doc_key);
            if (!vRank && !lRank) return null;
            const rrfBase = (vRank ? 1 / (rrfK + vRank) : 0) + (lRank ? 1 / (rrfK + lRank) : 0);
            const freshness = freshnessMultiplier(item.doc.as_of_date,now);
            const rrfScore = Number((rrfBase * freshness + (Number(item.doc.quality_score || 80) / 100) * 0.002).toFixed(6));
            return {
                doc_key: item.doc.doc_key,
                source_kind: item.doc.source_kind,
                domain: item.doc.domain,
                title: item.doc.title,
                content: item.doc.content,
                metadata: item.doc.metadata || {},
                quality_score: item.doc.quality_score,
                as_of_date: item.doc.as_of_date,
                vector_score: Number(item.vec.toFixed(4)),
                lexical_score: Number(item.lex.toFixed(4)),
                concept_score: Number(item.concept.toFixed(4)),
                rrf_score: rrfScore,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.rrf_score - a.rrf_score)
        .slice(0, Math.max(1, limit));

    return {
        results: fused,
        strategy: vecRanked.length ? 'local_hybrid_vector_bm25_rrf' : 'local_bm25_conceptual_rrf',
        vectorMatches: vecRanked.length,
        lexicalMatches: lexRanked.length,
    };
}

function stripStaleLiterals(text) {
    return cleanText(
        String(text || '')
            .replace(/\$?\b\d+(?:[.,]\d+)?\s*(?:MXN|USD|EUR|BRL|centavos?|cUSD|pts|%|kg|ton|lb|bu|bushel|docena)\b/gi, '[cifra]')
            .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, '[fecha]'),
        520
    );
}

async function getDynamicFewShotContext({ message = '', plan = {}, provider = null, limit = 2, cacheFile = DEFAULT_CACHE_FILE } = {}) {
    if (plan?.providedInputsOnly || !String(message || '').trim()) return '';
    const search = await hybridSearch(message, {
        provider,
        kinds: ['few_shot_exemplar'],
        domain: 'chat',
        limit,
        cacheFile,
        allowRemote: process.env.NODE_ENV !== 'test',
    });
    const useful = (search.results || []).filter(item => Number(item.rrf_score) > 0.008);
    if (!useful.length) return '';

    const lines = useful.map((item, idx) =>
        `[Ejemplar ${idx + 1}] Consulta afín: "${cleanText(item.title, 180)}"\nPatrón esperado: ${stripStaleLiterals(item.content)}`
    );
    return '[EJEMPLOS VERIFICADOS DE RAZONAMIENTO · FEW-SHOT DINÁMICO]\n'
        + 'Usa únicamente la estructura lógica y de presentación; jamás copies cifras o fechas literales de ejemplos previos.\n'
        + lines.join('\n\n');
}

function getVectorIndexStats({ cacheFile = DEFAULT_CACHE_FILE } = {}) {
    const index = readLocalIndex(cacheFile);
    const byKind = {};
    let withEmbedding = 0;
    for (const doc of index.docs) {
        byKind[doc.source_kind] = (byKind[doc.source_kind] || 0) + 1;
        if (Array.isArray(doc.embedding) && doc.embedding.length) withEmbedding++;
    }
    return {
        total: index.docs.length,
        withEmbedding,
        byKind,
        updatedAt: index.updatedAt,
        hasSupabase: Boolean(getSupabase()),
    };
}

module.exports = {
    DEFAULT_CACHE_FILE,
    indexKnowledgeDocuments,
    buildDefaultKnowledgeCorpus,
    hybridSearch,
    getDynamicFewShotContext,
    getVectorIndexStats,
    getChatReasoningContext,
};
