'use strict';

const { guardProteinPrices } = require('./protein-price-quality');
const { matchingProteinRecords } = require('./protein-price-table');

function sourceNames(citations = []) {
    return [...new Set(citations.map(item => String(item?.source || '').trim()).filter(Boolean))];
}

function textMentionsSource(text, citations = []) {
    const lower = String(text || '').toLowerCase();
    return sourceNames(citations).some(source => lower.includes(source.toLowerCase())
        || lower.includes(source.split(' · ')[0].toLowerCase()));
}

function citationDisclosure(citations = []) {
    const sources = citations.slice(0, 4).map(item => {
        const date = item.date ? ` · corte: ${item.date}` : '';
        const label = `${item.title} (${item.source || 'fuente verificada'}${date})`.replaceAll('[', ' ').replaceAll(']', ' ').replace(/[\r\n]/g, ' ');
        try {
            const url = new URL(item.url);
            if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
                return `[${label}](${url.href.replace(/[<>"()\s]/g, character => encodeURIComponent(character))})`;
            }
        } catch { /* Sin enlace válido se conserva la referencia textual. */ }
        return label;
    });
    return sources.length ? `**Fuentes de verificación:** ${sources.join('; ')}.` : '';
}

function hasTradeResearchSources(evidence = {}) {
    // La portada de Mercolleida, una cotización y el RAG local no prueban
    // anuncios comerciales de meses anteriores. Exigimos búsqueda externa.
    return (evidence.citations || []).some(item => /^https:\/\//i.test(String(item?.url || ''))
        && (item.type === 'google_search_grounding' || (item.type === 'verified_trade_document'
            && (evidence.tradeDocuments || []).some(record => record.verified && record.url === item.url
                && record.date === item.date && record.excerpts?.length))));
}

function scopeTradeEvidence(plan, evidence) {
    if (!plan.needsTradeResearch) return evidence;
    const seen = new Set();
    const allowedTypes = ['google_search_grounding', 'verified_trade_document', ...(hasTradeResearchSources(evidence) ? ['rabobank_public_research'] : []),
        ...(plan.needsProteinPrices ? ['verified_protein_price'] : []), ...(plan.asksNews ? ['live_news'] : []),
        ...(plan.needsLiveQuote ? ['live_market_quote', 'live_fx_quote'] : []), ...(plan.needsIssuerResearch ? ['verified_issuer_document'] : [])];
    const citations = (evidence.citations || []).filter(item => {
        const key = item?.type === 'verified_protein_price' ? `${item.url}:${item.id}:${item.date}` : item?.url;
        if (!allowedTypes.includes(item?.type)
            || !/^https:\/\//i.test(String(item.url || '')) || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return { ...evidence, citations, evidenceCount: citations.length };
}

function guardTradeResearch(plan = {}, evidence = {}, text = '') {
    if (!plan.needsTradeResearch) return { text, blocked: false };
    if (hasTradeResearchSources(evidence)) {
        const opening = String(text).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().slice(0,800);
        const denial = /\bno (?:se )?(?:(?:ha|han|habia|habian) )?(?:informado|anunciado|firmado|acordado|reportado|registrado|documentado)\b[^.!?\n]{0,160}\b(?:acuerdos?|tratados?|pactos?|marcos?)\b|\bno (?:hay|hubo|existen?|se conocen)\b[^.!?\n]{0,90}\b(?:acuerdos?|tratados?|pactos?)\b/.test(opening);
        const documents = (evidence.tradeDocuments || []).filter(record => record.verified && record.excerpts?.length
            && (evidence.citations || []).some(citation => citation.type === 'verified_trade_document' && citation.url === record.url && citation.date === record.date));
        if (!denial || !documents.length) return { text, blocked: false };
        // Evita transmitir una negación que contradice documentos recuperados.
        // El orquestador intenta una revisión; este texto conserva trazabilidad
        // si el modelo falla o insiste en reducir acuerdos a tratados formales.
        return { blocked: false, needsRevision: true,
            text: 'Identifiqué anuncios y documentos oficiales dentro del periodo solicitado. La evidencia recuperada no permite concluir que no hubo acuerdos por no tratarse de un nuevo tratado estructural.\n\n'
                + documents.map(record => `- ${record.date} · ${record.source}: ${record.title}.`).join('\n')
                + '\n\nLas fuentes enlazadas distinguen anuncios, recomendaciones, compromisos y aplicación efectiva. Hace falta revisar cada disposición antes de atribuirle un arancel vigente o una compra ejecutada.' };
    }
    const cell = value => String(value ?? '').replace(/[|\r\n]/g, ' ');
    const prices = plan.needsProteinPrices ? (evidence.proteinPriceRecords || []).filter(record => record.verified) : [];
    const priceText = prices.length ? 'Sí se recuperaron estas referencias físicas. Cada dato conserva su categoría y unidad; no representa un precio mundial ni acredita acuerdos comerciales.\n\n'
        + '| Producto · categoría | Mercado | Precio | Fecha | Fuente |\n| --- | --- | --- | --- | --- |\n'
        + prices.map(record => `| ${cell(record.product)} · ${cell(record.category)} | ${cell(record.country)} | ${cell(record.value)} ${cell(record.currency)} · ${cell(record.unit)} | ${cell(record.date)} | ${cell(record.source)} |`).join('\n')
        + '\n\n' : '';
    return {
        blocked: true,
        text: priceText + 'No pude verificar anuncios comerciales del periodo solicitado en las fuentes consultadas. Esto no demuestra que no existan acuerdos.\n\nLa revisión debe distinguir compromisos de compra, cambios arancelarios y permisos sanitarios, porque cada medida afecta de forma distinta las exportaciones y los márgenes. En esta consulta no tengo documentos suficientes para atribuir una medida concreta a esos países ni confirmar su entrada en vigor. Puedes reintentar la consulta con un periodo explícito para acotar la búsqueda.',
    };
}

// Este control no intenta "adivinar" si una afirmación económica es cierta;
// obliga a transparentar la procedencia de las consultas sensibles y bloquea
// que una falla de proveedor se presente como un dato de mercado actual.
function auditResponse({ text = '', plan = {}, liveData = null, evidence = {} } = {}) {
    const warnings = [];
    const priceCheck = guardProteinPrices(plan, evidence, text);
    if (priceCheck.changed) {
        const records = matchingProteinRecords(plan.proteinProfile,evidence);
        const priceCitations = (evidence.citations || []).filter(citation => citation.type === 'verified_protein_price'
            && records.some(record => record.url === citation.url && record.date === citation.date && (!citation.market || citation.market === record.market)));
        return { warnings: [], replacement: priceCheck.text, priceCitations, disclosure: '' };
    }
    if (priceCheck.blocked) return { warnings: ['Se retiraron cotizaciones sin fecha de observación y fuente trazable.'], replacement: priceCheck.text, disclosure: '> Las cifras sin trazabilidad quedaron excluidas de esta respuesta.' };
    let disclosure = '';
    const citations = evidence.citations || [];
    const mercolleida = liveData?.mercolleida || liveData;
    if (plan.needsProteinPrices && !liveData?.proteinPrices?.available && !citations.some(item => item.type === 'google_search_grounding')) {
        warnings.push('No se obtuvo un precio físico verificable para el producto y mercado solicitado.');
        disclosure = '> **Precios físicos:** no se recuperó una cotización verificable para el mercado solicitado. No se sustituyó por futuros ni por precios de otro país. Las noticias y los pronósticos no acreditan un precio vigente.';
    } else if (plan.needsMercolleida && !plan.needsTradeResearch && (!mercolleida?.available || mercolleida?.stale)) {
        warnings.push('La información pública de Mercolleida no se pudo actualizar durante la consulta.');
        disclosure = '> **Mercolleida:** no se pudo confirmar una nueva actualización. Consulta las fechas indicadas y la [fuente oficial](https://www.mercolleida.com/). Las cotizaciones completas no están incluidas en esta conexión pública.';
    } else if (plan.needsLiveNews && !plan.needsLiveQuote && !(liveData?.newsAvailable ?? liveData?.marketDataAvailable ?? liveData?.available)
        && !citations.some(item => item.type === 'google_search_grounding')) {
        warnings.push('El conector de noticias no devolvió titulares verificables durante la consulta.');
        disclosure = '> **Noticias:** no se recuperaron titulares verificables del conector durante esta consulta. Los precios y análisis de otras fuentes conservan sus fechas y cobertura; no acreditan una noticia de hoy.';
    } else if (plan.needsLiveQuote && !(liveData?.quotesAvailable ?? liveData?.marketDataAvailable ?? liveData?.available)) {
        warnings.push('No hubo una fuente en vivo disponible para validar la consulta actual.');
        disclosure = '> [!WARNING] **Cotización sin confirmar:** no se recuperó una cotización financiera fechada. Las noticias y comunicados conservan sus propias fuentes y fechas; no acreditan el precio bursátil actual.';
    } else if (plan.explicitRabobank && (!liveData?.rabobank?.available || liveData?.rabobank?.stale)) {
        warnings.push('Rabobank: no se confirmó una actualización pertinente para la consulta.');
        disclosure = liveData?.rabobank?.stale
            ? '> **Rabobank:** se usó el caché anterior; consulta las fechas publicadas. No se confirmó una nueva actualización.'
            : '> **Rabobank:** el canal público consultado no aportó publicaciones verificables para este producto, país o periodo. La cobertura es parcial; esto no significa que el banco no haya publicado otros análisis.';
    } else if (plan.needsSources && citations.length && !textMentionsSource(text, citations)) {
        warnings.push('Se añadió la procedencia de la evidencia para hacer verificable la respuesta.');
        disclosure = citationDisclosure(citations);
    }
    const snapshots = (evidence.issuerDocuments || []).filter(doc => doc.reviewedAt);
    if (snapshots.length) {
        const note = '> **Comunicados de empresas:** para ' + snapshots.map(doc => `${doc.ticker} (revisión ${doc.reviewedAt.slice(0, 10)})`).join(', ')
            + ' se usaron resúmenes de publicaciones oficiales contrastadas previamente. No se confirmó una nueva actualización de esos portales durante esta consulta; conserva las fechas originales de los resultados.';
        disclosure = [disclosure, note].filter(Boolean).join('\n\n');
        warnings.push('Se usaron resúmenes públicos revisados y fechados como respaldo de portales no disponibles.');
    }
    return { warnings, disclosure };
}

function guardNewsCoverage(plan, text) {
    if (!plan.asksNews) return { text: String(text || ''), changed: false };
    let changed = false;
    const corrected = String(text || '').split('\n').map(line => {
        // Missing results can establish a gap in this retrieval, never prove
        // that no issuer/regulator anywhere published news in the period.
        if (!/\b(?:el [uú]nico hecho|no (?:existen|hay|se registraron|se han publicado|se publicaron|se emitieron|se reportaron))\b/i.test(line)
            || !/\b(?:noticias?|comunicados|anuncios|corporativo|regulatorios|hecho)\b/i.test(line)) return line;
        changed = true;
        return 'La cobertura de esta consulta es parcial. Los hallazgos documentados aparecen abajo con sus fechas; la falta de resultados para una empresa o proteína no demuestra que no se hayan publicado otras noticias dentro del periodo solicitado.';
    }).join('\n');
    return { text: corrected, changed };
}

function appendDisclosure(text, audit) {
    if (audit?.replacement) text = audit.replacement;
    if (!audit?.disclosure || String(text || '').includes(audit.disclosure)) return String(text || '');
    return `${String(text || '').trim()}\n\n${audit.disclosure}`.trim();
}

module.exports = { auditResponse, appendDisclosure, citationDisclosure, textMentionsSource, hasTradeResearchSources, guardTradeResearch, scopeTradeEvidence, guardNewsCoverage };
