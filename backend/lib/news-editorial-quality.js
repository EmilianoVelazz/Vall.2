'use strict';
function materialNumbers(text) {
    const found = String(text || '').match(/\d+(?:[.,]\d+)*(?:\s*%)?/g) || [];
    return new Set(found.map(value => value.trim().replace(/\s+/g, '').replace(/,(?=\d{1,2}(?:%|$))/g, '.')));
}
function materialUnits(text) {
    const normalized = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\bmil millones\b/g, 'billion');
    const groups = {
        USD: /\b(?:usd|us dollars?|dolares? estadounidenses?)\b/, MXN: /\b(?:mxn|pesos? mexicanos?|mexican pesos?)\b/,
        EUR: /\b(?:eur|euros?)\b|€/, DOLLAR: /\b(?:dollars?|dolares?)\b|\$/,
        KG: /\b(?:kg|kilograms?|kilogramos?)\b/, TONNE: /\b(?:tonnes?|toneladas?|metric tons?)\b/,
        MILLION: /\b(?:millions?|millones|millon)\b/, BILLION: /\b(?:billions?|mil millones)\b/,
        TRILLION: /\b(?:trillions?|billones|billon)\b/, THOUSAND: /\b(?:thousands?|miles)\b/,
    };
    const found = new Set(Object.entries(groups).filter(([, expression]) => expression.test(normalized)).map(([unit]) => unit));
    if (found.has('USD')) found.add('DOLLAR');
    return found;
}
function supportedText(value, original, max) {
    if (value == null || value === '') return '';
    if (typeof value !== 'string' || value.length > max) return null;
    const available = materialNumbers(original);
    const units = materialUnits(original);
    if ([...materialUnits(value)].some(unit => !units.has(unit))) return null;
    if ([...materialNumbers(value)].some(number => !available.has(number))) return null;
    return value.trim();
}
// El índice del artículo y las cifras deben seguir perteneciendo a la fuente.
// Esto es un control de consistencia, no una verificación completa de hechos.
function editorialIndex(editorial, articles) {
    const rows = Array.isArray(editorial?.items) ? editorial.items : [];
    const duplicate = new Set(), seen = new Set();
    for (const row of rows) { if (seen.has(row?.i)) duplicate.add(row.i); seen.add(row?.i); }
    const result = new Map();
    for (const row of rows.slice(0, 24)) {
        if (!Number.isInteger(row?.i) || row.i < 0 || row.i >= articles.length || duplicate.has(row.i)) continue;
        const original = `${articles[row.i]?.title || ''} ${articles[row.i]?.summary || ''}`;
        const titulo = supportedText(row.titulo, original, 300);
        const resumen = supportedText(row.resumen, original, 800);
        const insight = supportedText(row.insight, original, 240);
        if ([titulo, resumen, insight].includes(null) || !titulo && !resumen && !insight) continue;
        const clean = value => typeof value === 'string' ? value.toLowerCase().slice(0, 40) : '';
        result.set(row.i, { titulo, resumen, insight, categoria: clean(row.categoria),
            impacto: ['alto', 'medio', 'bajo'].includes(row.impacto) ? row.impacto : null,
            sentimiento: clean(row.sentimiento) });
    }
    return result;
}
function supportedBriefing(editorial, articles) {
    const original = articles.map(article => `${article.title || ''} ${article.summary || ''}`).join('\n');
    return (Array.isArray(editorial?.briefing) ? editorial.briefing : []).slice(0, 3)
        .map(value => supportedText(value, original, 400)).filter(Boolean);
}
function newsCoverageKey(article) {
    try {
        if (typeof article?.url !== 'string' || article.url.length > 2048) return '';
        const url = new URL(article.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
        url.hash = '';
        for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
        return url.href;
    } catch { return ''; }
}
function nonFuturePublication(article, now = Date.now()) {
    const timestamp = Date.parse(article?.publishedAt);
    return !Number.isFinite(timestamp) || timestamp <= now;
}
module.exports = { newsCoverageKey, nonFuturePublication, editorialIndex, supportedBriefing, materialNumbers };