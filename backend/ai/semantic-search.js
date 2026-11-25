'use strict';
const { normalizeForIntent } = require('./conversation-context');
const { cosineSimilarity } = require('./providers/gemini-provider');

// Índice conceptual local y puntuación BM25/vectorial en memoria:
// agrupa sinónimos ES/EN y combina coincidencia léxica BM25 con similitud coseno
// cuando existen embeddings densos, degradando limpiamente offline.
const CONCEPTS = [
    ['pork','cerdo','cerdos','porcino','porcina','porcinos','porcicultura','swine','pig','pigs','hog','hogs'],
    ['beef','res','bovino','bovina','bovinos','vacuno','cattle','bovine'],
    ['poultry','pollo','pollos','avicola','aves','chicken','broiler'],
    ['eggs','egg','huevo','huevos','ovoproductos','ponedoras','laying'],
    ['trade','comercio','importacion','importaciones','importar','exportacion','exportaciones','exportar','imports','exports'],
    ['tariff','tariffs','arancel','aranceles','impuesto','impuestos','gravamen','aduana','aduanas','customs','duty','duties'],
    ['health','sanidad','sanitario','sanitaria','salud','enfermedad','disease','outbreak','brote','brotes','epizootia'],
    ['avian influenza','influenza aviar','gripe aviar','h5n1','h5n8'],
    ['african swine fever','peste porcina africana','ppa','asf'],
    ['logistics','logistica','flete','freight','transporte','transport','shipping','shipment','embarque'],
    ['cold chain','cadena de frio','refrigeracion','refrigerado','congelado','frozen','chilled','cold storage'],
    ['profit','margin','margen','margenes','rentabilidad','ganancia','utilidad'],
    ['price','prices','precio','precios','cotizacion','cotizaciones','quotation'],
    ['supply','oferta','abasto','abastecimiento','produccion','production'],
    ['demand','demanda','consumo','consumption','consumidor','consumers'],
    ['agreement','treaty','tratado','tratados','acuerdo','acuerdos','tmec','usmca'],
];
function concepts(value) {
    const text=' '+normalizeForIntent(value).replace(/[^\p{L}\p{N}\s]/gu,' ')+' ';
    const result = new Set(CONCEPTS.map((aliases,index)=>aliases.some(alias=>text.includes(' '+alias+' ')) ? index : -1).filter(index=>index >= 0));
    if (result.has(8)) { result.add(0); result.add(6); }
    if (result.has(7)) { result.add(2); result.add(6); }
    return result;
}
function conceptualSimilarity(query,document) {
    const a=concepts(query),b=concepts(document);
    const overlap=[...a].filter(concept=>b.has(concept)).length;
    return a.size && b.size ? overlap/Math.sqrt(a.size*b.size) : 0;
}
const STOP_WORDS = new Set([
    'para', 'como', 'esta', 'este', 'estos', 'estas', 'contra', 'sobre', 'puedes',
    'entre', 'desde', 'hasta', 'donde', 'cuando', 'porque', 'pero', 'cual', 'cuales',
    'datos', 'informe', 'consulta', 'del', 'las', 'los', 'una', 'unos', 'unas', 'con',
]);

function tokenizeForBm25(text) {
    return normalizeForIntent(text)
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(term => term.length >= 2 && !STOP_WORDS.has(term));
}

function bm25Scores(query, documents, { k1 = 1.4, b = 0.72 } = {}) {
    const qTerms = [...new Set(tokenizeForBm25(query))];
    if (!qTerms.length || !Array.isArray(documents) || !documents.length) {
        return new Array(documents?.length || 0).fill(0);
    }
    const tokenizedDocs = documents.map(doc => tokenizeForBm25(doc));
    const docCount = tokenizedDocs.length;
    const avgLen = Math.max(1, tokenizedDocs.reduce((sum, tokens) => sum + tokens.length, 0) / docCount);
    const df = new Map();
    for (const tokens of tokenizedDocs) {
        for (const uniqueTerm of new Set(tokens)) {
            df.set(uniqueTerm, (df.get(uniqueTerm) || 0) + 1);
        }
    }
    const raw = tokenizedDocs.map(tokens => {
        if (!tokens.length) return 0;
        const tf = new Map();
        for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
        let score = 0;
        for (const term of qTerms) {
            const freq = tf.get(term) || 0;
            if (!freq) continue;
            const n = df.get(term) || 0;
            const idf = Math.log(1 + (docCount - n + 0.5) / (n + 0.5));
            const denom = freq + k1 * (1 - b + b * (tokens.length / avgLen));
            score += idf * ((freq * (k1 + 1)) / denom);
        }
        return score;
    });
    const maxScore = Math.max(0, ...raw);
    return maxScore > 0 ? raw.map(v => v / maxScore) : raw;
}

class SemanticSearch {
    available() { return true; }
    async rank(message, rows, { queryEmbedding = null } = {}) {
        const list = Array.isArray(rows) ? rows : [];
        const docTexts = list.map(row => `${row.title || ''} ${row.heading_path || ''} ${row.tags || ''} ${row.content || ''}`);
        const bm25 = bm25Scores(message, docTexts);
        const hasVectors = Array.isArray(queryEmbedding) && queryEmbedding.length > 0;
        return list.map((row, idx) => {
            const conceptScore = conceptualSimilarity(message, docTexts[idx]);
            const lexicalScore = bm25[idx] || 0;
            const vectorScore = hasVectors && Array.isArray(row?.embedding) && row.embedding.length === queryEmbedding.length
                ? Math.max(0, cosineSimilarity(queryEmbedding, row.embedding))
                : null;
            const semanticScore = vectorScore !== null
                ? Number((0.52 * vectorScore + 0.30 * lexicalScore + 0.18 * conceptScore).toFixed(6))
                : Number((0.55 * conceptScore + 0.45 * lexicalScore).toFixed(6));
            return {
                ...row,
                concept_score: conceptScore,
                bm25_score: lexicalScore,
                ...(vectorScore !== null ? { vector_score: vectorScore } : {}),
                semantic_score: semanticScore,
                retrieval_mode: vectorScore !== null ? 'hybrid_vector_bm25' : 'hybrid_conceptual',
            };
        });
    }
}

module.exports = { SemanticSearch, conceptualSimilarity, concepts, bm25Scores, tokenizeForBm25 };
