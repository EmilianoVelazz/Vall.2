'use strict';

const { researchPeriod, publicationScope } = require('../services/trade-research');

function sourceDate(value) {
    const iso = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const parsed = new Date(`${iso}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

function evidenceCoverage(plan = {}, evidence = {}, now = Date.now()) {
    const temporal = Boolean(plan.needsTradeResearch || plan.asksNews || plan.explicitRabobank);
    const query=plan.tradeResearchQuery || plan.rabobankQuery || plan.marketQuery || '';
    const publication=plan.explicitRabobank&&!plan.needsTradeResearch&&!plan.asksNews?publicationScope(query,now):null;
    const period = temporal ? evidence.tradePeriod || (publication?publication.period:researchPeriod(query, now)) : null;
    const today = new Date(now).toISOString().slice(0, 10);
    const sources = new Map();
    for (const citation of (evidence.citations || []).slice(0, 100)) {
        try {
            const url = new URL(citation.url);
            if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
            // Multiple dated observations can legitimately share a provider URL.
            const date = sourceDate(citation.date);
            const key = `${url.href}:${date || 'undated'}`;
            if (!sources.has(key)) sources.set(key, { date });
        } catch { /* A source without a usable link does not confirm coverage. */ }
    }
    const records = [...sources.values()];
    const dated = records.filter(record => record.date && record.date <= today);
    const inPeriod = period ? dated.filter(record => record.date >= period.start && record.date <= period.end) : dated;
    return { total: records.length, dated: dated.length, inPeriod: inPeriod.length,
        outsidePeriod: dated.length - inPeriod.length, undated: records.filter(record => !record.date).length,
        futureDated: records.filter(record => record.date > today).length,
        period, researchHorizonYear:publication?.horizonYear || null, oldest: dated.map(record => record.date).sort()[0] || null,
        latest: dated.map(record => record.date).sort().at(-1) || null,
        status: !records.length ? 'unavailable' : !dated.length ? 'dates_unconfirmed'
            : records.length !== inPeriod.length ? 'partial' : 'dated_sources',
        notice: 'La cobertura describe los documentos recuperados; no verifica automáticamente cada afirmación ni demuestra que no existan otros anuncios.',
    };
}

function coverageContext(plan, evidence, now) {
    if (!plan.needsTradeResearch && !plan.asksNews && !plan.explicitRabobank) return '';
    const coverage = evidenceCoverage(plan, evidence, now);
    return ['[COBERTURA TEMPORAL DE LAS FUENTES]', JSON.stringify(coverage),
        'Las publicaciones fuera del periodo son antecedentes: identifícalas con su fecha y no las presentes como novedades del periodo. La fecha de indexación o descarga no reemplaza la de publicación.',
        'Cada afirmación material debe enlazar el documento específico que la respalda. Un enlace sin fecha confirmada no acredita por sí solo un acuerdo reciente. No confundas anuncio, firma, entrada en vigor, autorización sanitaria y compra ejecutada.',
        'Si faltan documentos actuales, explica qué parte quedó pendiente y aprovecha los hallazgos verificados. No concluyas ausencia de acuerdos ni pidas al usuario investigar lo que ya está documentado en el contexto.'].join('\n');
}

module.exports = { sourceDate, evidenceCoverage, coverageContext };
