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
        'Para cada hallazgo importante escribe fecha ISO y enlace específico en el mismo párrafo o fila. Sólo atribuye al documento lo respaldado por el extracto. No cites una portada para demostrar un acuerdo específico.',
        'Separa hechos de inferencias y escenarios. No presentes una recomendación de aranceles como una medida vigente, ni compromiso como compra realizada. Si una cifra, producto, fecha de aplicación o alcance no aparece en los extractos, no lo completes de memoria.',
        'Un documento fuera de la ventana sólo puede usarse bajo el rótulo Antecedente. Si el respaldo es un resumen público, limita la atribución a ese resumen. No simules haber leído el PDF completo.'].join('\n');
}
function claimText(value) {
    return String(value || '').replace(/<[^>]*>/g, ' ')
        .replace(/^[ \t]*(?:#{1,6}\s*|>\s*)+/gm, '')
        .replace(/\*\*|__/g, '').trim();
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
function materialClaim(part) {
    const value = claimText(part);
    // A structural label such as «Informes revisados» is not itself a claim.
    // A headline asserting an approval, percentage or price is still audited.
    if (/^\s*(?:#{1,6}\s|<h[1-6]\b)/i.test(part)
        && !/\b(?:\d|acord|anunci|firm|aprob|arancel|compr|export|import|ventas|margen|producci|demanda|oferta|precio)/i.test(value)) return null;
    return value&&!/^\|[\s|:-]+\|$/.test(value)
        && /\b(?:\d|acord|anunci|firm|aprobo|aprobó|arancel|compr|export|import|ventas|margen|informe|public|producci|demanda|oferta|precio)/i.test(value)
        && !/^\s*(?:si\b|inferencia\b|escenario\b|implicaci[oó]n\b|qu[eé] verificar\b|no (?:se |puedo |pude |hay ))/i.test(value)
        && !/^\|\s*(?:fecha|producto|medida|fuente|hecho|estado|mercado|anuncio)\b/i.test(value) ? value : null;
}
function auditResearchAnswer(plan,evidence,text,now) {
    const ledger=researchLedger(plan,evidence,now);
    if ((!plan.needsTradeResearch&&!plan.asksNews&&!plan.explicitRabobank)||!ledger.records.length) return { needed:false, issues:[],ledger };
    const material=String(text || '').split(/\n\s*\n|\n(?=\s*(?:[-*]|\d+[.)]|\||#{1,6}\s|>))/).map(materialClaim).filter(Boolean);
    const issues=material.length>40 ? ['claim_limit_exceeded'] : [];
    for(const part of material.slice(0,40)) {
        if(ledger.period && part===`Periodo revisado: ${ledger.period.start} a ${ledger.period.end}.`) continue;
        const links=[...part.matchAll(/\]\((https:\/\/[^\s)]+)\)/g)].map(match=>canonicalUrl(match[1]));
        const supporting=ledger.records.filter(record=>links.includes(record.url));
        if(!supporting.length) { issues.push('material_claim_without_read_source'); continue; }
        if(!supporting.some(record=>part.includes(record.date))) issues.push('claim_without_publication_date');
        if(supporting.every(record=>!record.inPeriod)&&!/antecedente|hist[oó]rico|fuera del periodo/i.test(part)) issues.push('background_presented_as_current');
        // Numeric claims must at least occur in the cited excerpt/date/title.
        // This is a provenance check, not a semantic truth classifier.
        const numbers=numericClaims(part);
        const support=supporting.map(record=>record.text+' '+record.title).join(' ');
        const supportedNumbers=new Set(numericClaims(support));
        if(numbers.some(number=>!supportedNumbers.has(number))) issues.push('number_absent_from_cited_excerpt');
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
