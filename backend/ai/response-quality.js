'use strict';

function sourceNames(citations = []) {
    return [...new Set(citations.map(item => String(item?.source || '').trim()).filter(Boolean))];
}

function textMentionsSource(text, citations = []) {
    const lower = String(text || '').toLowerCase();
    return sourceNames(citations).some(source => lower.includes(source.toLowerCase()));
}

function citationDisclosure(citations = []) {
    const sources = citations.slice(0, 4).map(item => {
        const date = item.date ? ` · corte: ${item.date}` : '';
        return `${item.title} (${item.source || 'fuente verificada'}${date})`;
    });
    return sources.length ? `**Fuentes de verificación:** ${sources.join('; ')}.` : '';
}

// Este control no intenta "adivinar" si una afirmación económica es cierta;
// obliga a transparentar la procedencia de las consultas sensibles y bloquea
// que una falla de proveedor se presente como un dato de mercado actual.
function auditResponse({ text = '', plan = {}, liveData = null, evidence = {} } = {}) {
    const warnings = [];
    let disclosure = '';
    const citations = evidence.citations || [];
    if ((plan.needsLiveQuote || plan.needsLiveNews) && !liveData?.available) {
        warnings.push('No hubo una fuente en vivo disponible para validar la consulta actual.');
        disclosure = '> [!WARNING] **Dato actual sin confirmar:** la fuente en vivo no estuvo disponible durante esta consulta. No uses cifras de esta respuesta como cotización o titular vigente sin verificarlas.';
    } else if (plan.needsSources && citations.length && !textMentionsSource(text, citations)) {
        warnings.push('Se añadió la procedencia de la evidencia para hacer verificable la respuesta.');
        disclosure = citationDisclosure(citations);
    }
    return { warnings, disclosure };
}

function appendDisclosure(text, audit) {
    if (!audit?.disclosure || String(text || '').includes(audit.disclosure)) return String(text || '');
    return `${String(text || '').trim()}\n\n${audit.disclosure}`.trim();
}

module.exports = { auditResponse, appendDisclosure, citationDisclosure, textMentionsSource };
