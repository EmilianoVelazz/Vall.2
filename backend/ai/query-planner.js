'use strict';

// El modelo no debe decidir por sí solo qué tan actual es una pregunta ni qué
// tipo de evidencia necesita. Este plan es deliberadamente determinista para
// que la misma consulta se trate igual en chat, reportes y voz.
const TOPICS = Object.freeze({
    fx: /\b(?:usd|mxn|eur|gbp|cad|d[oó]lar(?:es)?|peso(?:s)?|divisa(?:s)?|tipo de cambio|forex)\b/i,
    equities: /\b(?:bolsa|acciones?|acci[oó]n|s&p|nasdaq|dow|bmv|ipc|walmex|femsa|bimbo|gruma|bitcoin|btc|ethereum|eth)\b/i,
    bonds: /\b(?:bonos?|treasury|tesoro|yield|rendimiento|curva de tasas?|deuda soberana)\b/i,
    commodities: /\b(?:commodity|materias? primas?|ma[ií]z|trigo|soya|soja|forraje|cerdo|porcino|ganado|prote[ií]na|petr[oó]leo|wti|gas natural|oro|cobre|metal(?:es)?)\b/i,
    macro: /\b(?:inflaci[oó]n|inpc|tiie|cetes?|banxico|tasa de inter[eé]s|pol[ií]tica monetaria|pib|empleo)\b/i,
    news: /\b(?:noticias?|titulares?|qu[eé] pas[oó]|[uú]ltima hora|actualidad|evento(?:s)?)\b/i,
});

const FRESHNESS = /\b(?:hoy|ahora|actual(?:es)?|actualizad[oa]s?|en vivo|[uú]ltim[oa]s?|reciente(?:s)?|cierre|cotiza(?:ci[oó]n)?|precio(?:s)?|cu[aá]nto (?:vale|est[aá]|equivale))\b/i;
const COMPLEX = /\b(?:informe|reporte|escenario(?:s)?|estrategia|recomendaci[oó]n|riesgo(?:s)?|compar(?:a|aci[oó]n)|proyecci[oó]n|impacto|cobertura)\b/i;

function normalizeMessage(message) {
    return String(message || '').replace(/\s+/g, ' ').trim();
}

function topicMatches(text) {
    return Object.entries(TOPICS)
        .filter(([, expression]) => expression.test(text))
        .map(([topic]) => topic);
}

function primaryTopic(matches) {
    // Noticias es una cualidad de la consulta; si además hay un activo, la
    // fuente de mercado debe seguir siendo la principal.
    return matches.find(topic => topic !== 'news') || matches[0] || 'general';
}

function planQuery({ message = '', history = [], mode = 'auto' } = {}) {
    const text = normalizeMessage(message);
    const topics = topicMatches(text);
    const topic = primaryTopic(topics);
    const asksCurrentData = FRESHNESS.test(text);
    const asksAnalysis = COMPLEX.test(text) || text.length > 420;
    const asksNews = topics.includes('news');
    const needsLiveQuote = asksCurrentData && ['fx', 'equities', 'bonds', 'commodities'].includes(topic);
    const needsLiveNews = asksNews && (asksCurrentData || topics.length === 1);
    const usesVerifiedRepository = ['macro', 'bonds', 'equities', 'commodities'].includes(topic);
    const needsSources = needsLiveQuote || needsLiveNews || asksAnalysis || ['macro', 'bonds'].includes(topic);
    const recommendedTier = asksAnalysis || mode === 'executive' || mode === 'technical' ? 'pro' : 'flash';

    return {
        topic,
        topics,
        asksCurrentData,
        asksAnalysis,
        asksNews,
        needsLiveQuote,
        needsLiveNews,
        usesVerifiedRepository,
        needsSources,
        recommendedTier,
        historyTurns: Array.isArray(history) ? history.length : 0,
    };
}

function planContext(plan) {
    const obligations = [
        '[PLAN DE RESPUESTA VERIFICABLE]',
        `Tema principal detectado: ${plan.topic}.`,
        'Responde primero la pregunta concreta; no sustituyas un dato por una explicación general.',
    ];
    if (plan.needsLiveQuote) {
        obligations.push('La consulta pide una cotización actual. Usa exclusivamente la sección [DATOS EN VIVO VERIFICADOS] si está disponible; conserva su fuente, hora de corte, activo y unidad. Si esa sección no está disponible, di que no hay cotización verificable en este momento.');
    }
    if (plan.needsLiveNews) {
        obligations.push('La consulta pide actualidad. Distingue cada titular de los hechos confirmados y menciona fuente y fecha; no presentes un titular como conclusión definitiva.');
    }
    if (plan.usesVerifiedRepository) {
        obligations.push('Para indicadores, series e históricos usa primero la evidencia verificada de VALL. No mezcles periodos, unidades ni fuentes sin explicarlo.');
    }
    if (plan.needsSources) {
        obligations.push('Toda cifra material debe indicar fuente y periodo/corte. Si haces una inferencia, etiquétala como inferencia y explica el supuesto.');
    }
    obligations.push('Antes de finalizar comprueba: activo correcto, unidad correcta, fecha compatible y respuesta directa a la solicitud.');
    return obligations.join('\n');
}

function mergeEvidence(evidence, live = null) {
    if (!live?.context) return evidence;
    const citations = [...(live.citations || []), ...(evidence.citations || [])];
    return {
        ...evidence,
        context: [live.context, evidence.context].filter(Boolean).join('\n\n'),
        citations,
        sourceCodes: [...new Set([...(live.sourceCodes || []), ...(evidence.sourceCodes || [])])],
        evidenceCount: (evidence.evidenceCount || 0) + (live.citations?.length || 0),
        retrievalStrategy: `${evidence.retrievalStrategy || 'rag'}+${live.strategy || 'live_data_v1'}`,
    };
}

module.exports = { planQuery, planContext, mergeEvidence, normalizeMessage };
