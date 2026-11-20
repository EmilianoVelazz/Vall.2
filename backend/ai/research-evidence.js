'use strict';
const { evidenceCoverage, sourceDate } = require('./evidence-coverage');

function canonicalUrl(value) {
    try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) return null; url.hash=''; return url.href; }
    catch { return null; }
}
const clean = value => String(value || '').replace(/<[^>]*>/g,' ').replace(/[|\r\n]/g,' ').replace(/\s+/g,' ').trim();
function researchLedger(plan, evidence, now = Date.now()) {
    const coverage = evidenceCoverage(plan,evidence,now);
    const citations = evidence.citations || [];
    const documents = [...(evidence.tradeDocuments || []),...(evidence.rabobankRecords || []),...(evidence.issuerDocuments || [])];
    const unique = new Map();
    for (const document of documents) {
        const url = canonicalUrl(document.url), date = sourceDate(document.date);
        const excerpts = Array.isArray(document.excerpts) ? document.excerpts.join(' ') : document.excerpts || document.excerpt;
        if (!url || !date || !document.verified || !excerpts || !citations.some(c=>canonicalUrl(c.url)===url&&sourceDate(c.date)===date)) continue;
        if (date>new Date(now).toISOString().slice(0,10)) continue;
        const inPeriod = !coverage.period || date>=coverage.period.start&&date<=coverage.period.end;
        unique.set(url,{ url,date,title:clean(document.title).slice(0,250),source:clean(document.source).slice(0,100),
            text:clean(excerpts).slice(0,2000),inPeriod,access:document.access || 'public_excerpt' });
    }
    return { kind:plan.needsTradeResearch?'trade':'research',period:coverage.period, records:[...unique.values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12) };
}
function researchInstructions(plan,evidence) {
    if (!plan.needsTradeResearch&&!plan.asksNews&&!plan.explicitRabobank) return '';
    const ledger=researchLedger(plan,evidence);
    return ['[EVIDENCIA LEÍDA Y FECHADA POR AFIRMACIÓN]',JSON.stringify(ledger),
        'REGLA DE PROVENIENCIA POR BLOQUE: todo párrafo, Conclusión o viñeta que mencione acuerdos, anuncios, aranceles, compras, volúmenes o precios debe incluir EN ESE MISMO PÁRRAFO O FILA la fecha exacta YYYY-MM-DD y el enlace Markdown [Título](url) tomado del registro. No separes el enlace al final. Sólo atribuye al documento lo respaldado por el extracto.',
        'Conserva las cifras literales y unidades exactas del extracto sin abreviar ni cambiar formato (p. ej. 1200 toneladas, no 1,200 t). Separa encabezados con doble salto de línea.',
        'Separa hechos de inferencias y escenarios (inicia escenarios con «Escenario:» o «Si »). No presentes una recomendación de aranceles como una medida vigente, ni compromiso como compra realizada. Si una cifra, producto, fecha de aplicación o alcance no aparece en los extractos, no lo completes de memoria ni agregues números externos.',
        'Un documento fuera de la ventana sólo puede usarse bajo el rótulo Antecedente en esa misma línea o párrafo. Si el respaldo es un resumen público, limita la atribución a ese resumen. No simules haber leído el PDF completo.'].join('\n');
}
function claimText(value) {
    return String(value || '').replace(/<[^>]*>/g, ' ')
        .replace(/^[ \t]*(?:#{1,6}\s*|>\s*)+/gm, '')
        .replace(/\*\*|__/g, '')
        .replace(/(^|\s)\*([^\s*][^*\n]*?)\*(?=\s|[.,:;!?)]|$)/g, '$1$2')
        .trim();
}
function numberKey(raw) {
    // A lone separator followed by three digits is locale-dependent. Keep its
    // literal value rather than equating 1.000 with either 1 or 1000 by guesswork.
    if (/^[+-]?\d+[.,]\d{3}$/.test(raw)) return 'literal:' + raw.replace(/^\+/, '');
    let value = raw;
    if (raw.includes(',') && raw.includes('.')) {
        const decimal = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? ',' : '.';
        value = raw.replace(decimal === ',' ? /\./g : /,/g, '').replace(',', '.');
    } else value = raw.replace(',', '.');
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(parsed) : raw;
}
function numericClaims(text) {
    const withoutLinks = text.replace(/https?:\/\/[^\s)]+/g, '')
        .replace(/^\s*\d+[.)]\s*/gm, '').replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');
    return [...withoutLinks.matchAll(/(?<![\p{L}\p{N}])([+\-−]?\d+(?:[.,]\d+)*)(?:[ \t]*(%|por ciento|percent))?(?![\p{L}\p{N}])/gu)]
        .map(match => numberKey(match[1].replace('−', '-')) + (match[2] ? ':percent' : ':number'));
}
const FACTUAL_CLAIM_VERB = /\b(?:acord[oó]|anunci[oó]|firm[oó]|aprob[oó]|aprobado|vigente|entr[oó]\s+en\s+vigor|public[oó]|compr[oó]|recibi[oó]|recomend[oó]|propus[oó]|report[oó]|inform[oó]|indic[oó]|señal[oó]|document[oó]|confirm[oó]|estableci[oó]|reduj[oó])\b/i;

function materialClaim(part) {
    const value = claimText(part);
    const plainBody = value.replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, '$1').trim();
    const isStandaloneBoldHeading = /^\s*(?:[-*•]\s*|\d+[.)]\s*)?(?:\*\*[^*\n]{2,80}\*\*|__[^_\n]{2,80}__)\s*$/.test(part);
    const isColonLeadIn = !/\d/.test(plainBody) && !FACTUAL_CLAIM_VERB.test(plainBody) && /:\s*$/.test(plainBody) && !/\.\s*$/.test(plainBody);
    if ((/^\s*(?:#{1,6}\s|<h[1-6]\b)/i.test(part) || isStandaloneBoldHeading || isColonLeadIn)
        && !/\d/.test(plainBody)
        && !FACTUAL_CLAIM_VERB.test(plainBody)
        && (isStandaloneBoldHeading || isColonLeadIn || !/\b(?:acord|anunci|firm|aprob|arancel|compr|export|import|ventas|margen|producci|demanda|oferta|precio)/i.test(plainBody))) {
        return null;
    }
    const listStripped = plainBody.replace(/^(?:[-*•]|\d+[.)])\s+/, '').trim();
    const strippedBody = listStripped
        .replace(/^(?:conclusi[oó]n|resumen)\s*[:.\n]\s*/i, '')
        .trim();
    const isNonClaimPreface = /^(?:si\b|inferencia\b|escenario\b|implicaci[oó]n\b|riesgo\b[^\n]{0,30}(?:y\s+señal)?\b|qu[eé]\s+verificar\b|ausencia\s+de\b|falta\s+de\b|evita\s+(?:ajustar|trasladar)\b|para\s+(?:efectos\s+de|evaluar|fines\s+de|operar)\b|no\s+(?:se\b|es\s+posible\b|puedo\b|pude\b|hay\b)|no\s+existe(?:n)?\s+evidencia\b.{0,90}\b(?:registr|document|simula|aportad))/i.test(strippedBody);
    const isAnalyticalMechanism = !/\d/.test(strippedBody)
        && !FACTUAL_CLAIM_VERB.test(strippedBody)
        && /\b(?:si\b|depende\s+de|no\s+depende|podr[ií]a|invalidar[ií]a|equivale\s+a|constituye\s+un|en\s+el\s+an[aá]lisis\s+de|cualquier\s+alteraci[oó]n|al\s+no\s+disponer|representa\s+[uú]nicamente|factor\s+a\s+(?:monitorear|vigilar)|se\s+requiere\s+conocer)\b/i.test(strippedBody);
    return value && !/^\|[\s|:-]+\|$/.test(value)
        && /\b(?:\d|acord|anunci|firm|aprobo|aprobó|arancel|compr|export|import|ventas|margen|informe|public|producci|demanda|oferta|precio)/i.test(plainBody)
        && !isNonClaimPreface
        && !isAnalyticalMechanism
        && !/^\|\s*(?:fecha|producto|medida|fuente|hecho|estado|mercado|anuncio)\b/i.test(value) ? value : null;
}
function isSupportedNumericClaim(token, supportedNumbers, supportingText) {
    if (supportedNumbers.has(token)) return true;
    const commaMatch = String(token || '').match(/^literal:([+-]?\d{1,3}(?:,\d{3})+):(number|percent)$/);
    if (commaMatch) {
        const normalized = commaMatch[1].replace(/,/g, '') + ':' + commaMatch[2];
        if (supportedNumbers.has(normalized) && !/\b\d+[.,]\d{1,2}\b/.test(supportingText)) return true;
    }
    return false;
}
function auditResearchAnswer(plan,evidence,text,now) {
    const ledger=researchLedger(plan,evidence,now);
    if ((!plan.needsTradeResearch&&!plan.asksNews&&!plan.explicitRabobank)||!ledger.records.length) return { needed:false, issues:[],ledger };
    const chunks=String(text || '').split(/\n\s*\n|\n(?=\s*(?:[-*]|\d+[.)]|\||#{1,6}\s|>))/);
    const datedUrlsInAnswer=new Set();
    for(const rawChunk of chunks.slice(0,40)) {
        const chunkLinks=[...rawChunk.matchAll(/\]\((https:\/\/[^\s)]+)\)/g)].map(match=>canonicalUrl(match[1]));
        for(const record of ledger.records) {
            if(chunkLinks.includes(record.url) && rawChunk.includes(record.date)) datedUrlsInAnswer.add(record.url);
        }
    }
    const material=chunks.map(materialClaim).filter(Boolean);
    const issues=material.length>40 ? ['claim_limit_exceeded'] : [];
    for(const part of material.slice(0,40)) {
        if(ledger.period && part===`Periodo revisado: ${ledger.period.start} a ${ledger.period.end}.`) continue;
        const links=[...part.matchAll(/\]\((https:\/\/[^\s)]+)\)/g)].map(match=>canonicalUrl(match[1]));
        const supporting=ledger.records.filter(record=>links.includes(record.url));
        if(!supporting.length) { issues.push('material_claim_without_read_source'); continue; }
        if(!supporting.some(record=>part.includes(record.date)) && !supporting.some(record=>datedUrlsInAnswer.has(record.url))) {
            issues.push('claim_without_publication_date');
        }
        if(supporting.every(record=>!record.inPeriod)&&!/antecedente|hist[oó]rico|fuera del periodo/i.test(part)) issues.push('background_presented_as_current');
        // Numeric claims must at least occur in the cited excerpt/date/title.
        // This is a provenance check, not a semantic truth classifier.
        const numbers=numericClaims(part);
        const support=supporting.map(record=>record.text+' '+record.title+' '+record.date.slice(0,4)).join(' ');
        const supportedNumbers=new Set(numericClaims(support));
        if(ledger.period?.start) supportedNumbers.add(ledger.period.start.slice(0,4)+':number');
        if(ledger.period?.end) supportedNumbers.add(ledger.period.end.slice(0,4)+':number');
        if(numbers.some(number=>!isSupportedNumericClaim(number, supportedNumbers, support))) issues.push('number_absent_from_cited_excerpt');
        const dates=[...part.replace(/https?:\/\/[^\s)]+/g,'').matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(match=>match[0]);
        if(dates.some(date=>!supporting.some(record=>record.date===date)&&!support.includes(date))) issues.push('date_absent_from_cited_excerpt');
    }
    return { needed:issues.length>0,issues:[...new Set(issues)],ledger,checkedClaims:material.length };
}
function verifiedResearchFallback(ledger) {
    const current=ledger.records.filter(record=>record.inPeriod);
    const background=ledger.records.filter(record=>!record.inPeriod);
    const lines=[current.length?'Estos documentos del periodo contienen la siguiente evidencia. Su cobertura es parcial; no completo los datos ausentes.':'No se pudo confirmar cobertura del periodo; los documentos leídos son antecedentes.'];
    if(ledger.period) lines.push('',`Periodo revisado: ${ledger.period.start} a ${ledger.period.end}.`,'');
    for(const [label,records] of [['Documentos del periodo',current],['Antecedentes',background]]) {
        if(!records.length) continue;
        lines.push(`### ${label}`,'| Fecha | Documento | Evidencia leída |','| --- | --- | --- |');
        for(const record of records.slice(0,6)) {
            const sentences=record.text.split(/(?<=[.!?])\s+(?=[\p{Lu}\d])/u).map((text,index)=>({text,index}));
            const negative=sentences.find(row=>/\b(?:no|not|todav[ií]a|a[uú]n)\b/i.test(row.text));
            const fact=sentences.find(row=>row!==negative&&/\d|\b(?:compromis|anunci|recomend|arancel|volumen|public)/i.test(row.text));
            const complement=negative || sentences.find(row=>row!==fact&&/\d|\b(?:compromis|anunci|recomend|arancel|volumen|public)/i.test(row.text));
            const selected=[...new Set([fact,complement].filter(Boolean))].sort((a,b)=>a.index-b.index).map(row=>row.text).join(' ') || sentences[0].text;
            const words=selected.split(/\s+/),negation=words.findIndex(word=>/^(?:no|not|todav[ií]a|a[uú]n)$/i.test(word));
            const start=words.length>20&&negation>=12 ? Math.max(0,negation-8) : 0;
            const excerpt=words.slice(start,start+20).join(' ');
            lines.push(`| ${record.date} | [${record.title.replaceAll('[','').replaceAll(']','')}](${record.url.replace(/[()]/g,encodeURIComponent)}) · ${record.source}${record.inPeriod?'':' · Antecedente'} | «${excerpt.replace(/[<>]/g,'')}…» |`);
        }
    }
    lines.push('','### Qué verificar para decidir',ledger.kind==='trade'?'Qué verificar: confirma en cada disposición la fecha de aplicación, los productos y países cubiertos y su estado de vigencia. Un compromiso o anuncio no acredita compras ejecutadas. Si se ejecuta, su efecto en costos y márgenes depende de las condiciones reales de compra y venta.':'Qué verificar: comprueba país, producto y horizonte de cada publicación. Distingue los datos observados de sus previsiones y contrástalos con una cotización comparable y tu costo puesto en destino antes de trasladarlos a compras o márgenes.');
    return lines.join('\n');
}
module.exports={researchLedger,researchInstructions,auditResearchAnswer,verifiedResearchFallback,canonicalUrl};
