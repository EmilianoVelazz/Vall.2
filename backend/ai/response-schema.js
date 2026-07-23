'use strict';

const RESPONSE_VERSION = '1.0';
const BLOCK_TYPES = new Set([
    'text', 'heading', 'markdown', 'code', 'table', 'diagram', 'chart', 'image',
    'quote', 'alert', 'steps', 'checklist', 'comparison', 'formula', 'document', 'download',
]);
const MODES = new Set(['quick', 'normal', 'detailed', 'technical', 'executive']);
const SEVERITIES = new Set(['info', 'success', 'warning', 'danger']);
const CHART_TYPES = new Set(['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea']);
const MERMAID_START = /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|requirementDiagram|gitGraph|C4Context)\b/;

function cleanString(value, max = 12000) {
    return String(value == null ? '' : value)
        .replace(/\u0000/g, '')
        .replace(/\r\n?/g, '\n')
        .trim()
        .slice(0, max);
}

function safeUrl(value) {
    const url = cleanString(value, 1800);
    if (!url) return '';
    if (/^(?:https?:\/\/|\/)/i.test(url) && !/^\/\//.test(url)) return url;
    return '';
}

function validateMermaid(value) {
    const content = cleanString(value, 12000);
    const first = content.split('\n').find(line => line.trim() && !line.trim().startsWith('%%'))?.trim() || '';
    if (!MERMAID_START.test(first)) return { valid: false, content: '', error: 'Tipo de diagrama Mermaid no permitido.' };
    if (/\b(?:click|href)\b|javascript:|<script|<iframe/i.test(content)) {
        return { valid: false, content: '', error: 'El diagrama contiene directivas no permitidas.' };
    }
    return { valid: true, content };
}

function normalizeChartSpec(value) {
    const spec = value && typeof value === 'object' ? value : {};
    const type = CHART_TYPES.has(spec.type) ? spec.type : 'bar';
    const sourceLabels = Array.isArray(spec.labels) ? spec.labels : (spec.data && Array.isArray(spec.data.labels) ? spec.data.labels : []);
    const sourceDatasets = Array.isArray(spec.datasets) ? spec.datasets : (spec.data && Array.isArray(spec.data.datasets) ? spec.data.datasets : []);
    
    const labels = sourceLabels.slice(0, 24).map(v => cleanString(v, 80));
    const datasets = sourceDatasets.slice(0, 6).map((set, index) => ({
        label: cleanString(set?.label || `Serie ${index + 1}`, 80),
        type: CHART_TYPES.has(set?.type) ? set.type : undefined,
        data: Array.isArray(set?.data)
            ? set.data.slice(0, labels.length || 24).map(v => Number.isFinite(Number(v)) ? Number(v) : null)
            : [],
    })).filter(set => set.data.length);
    if (!labels.length || !datasets.length) return null;
    return {
        type,
        title: cleanString(spec.title, 140),
        subtitle: cleanString(spec.subtitle, 280),
        insight: cleanString(spec.insight, 360),
        unit: cleanString(spec.unit, 40),
        source: cleanString(spec.source, 180),
        indexAxis: spec.indexAxis === 'y' ? 'y' : 'x',
        stacked: Boolean(spec.stacked),
        beginAtZero: Boolean(spec.beginAtZero),
        labels,
        datasets,
    };
}

function normalizeStringArray(value, maxItems = 30, maxLength = 600) {
    return Array.isArray(value)
        ? value.slice(0, maxItems).map(v => cleanString(v, maxLength)).filter(Boolean)
        : [];
}

function chartFromResponse(response, question = '') {
    if (!/\b(gr[aá]fica|gr[aá]fico|graficar|chart|visualiza)/i.test(String(question))) return null;
    if (response?.blocks?.some(block => block.type === 'chart')) return null;
    const table = response?.blocks?.find(block => block.type === 'table' && block.headers?.length >= 2 && block.rows?.length >= 2);
    if (table) {
        const datasets = table.headers.slice(1).map((header, column) => ({
            label: header,
            data: table.rows.map(row => {
                const value = Number(String(row[column + 1] ?? '').replace(/[%$€£\s,]/g, ''));
                return Number.isFinite(value) ? value : null;
            }),
        })).filter(dataset => dataset.data.filter(value => value != null).length >= 2);
        if (datasets.length) return normalizeChartSpec({
            type: /mixta|combinad/i.test(question) ? 'bar' : 'line', title: 'Visualización de los datos analizados',
            subtitle: 'Generada automáticamente a partir de la tabla de la respuesta', unit: /%|porcentaje/i.test(question) ? '%' : '',
            source: 'Tabla incluida en la respuesta de VALL AI', labels: table.rows.map(row => row[0]), datasets,
        });
    }
    const segments = String(question).split(';').map(value => value.trim()).filter(Boolean);
    const labelSegment = segments.find(value => /\b(?:meses|periodos|a[nñ]os|categor[ií]as)\b/i.test(value));
    if (!labelSegment) return null;
    const labels = labelSegment.replace(/^.*?\b(?:meses|periodos|a[nñ]os|categor[ií]as)\s*:?\s*/i, '').split(',').map(value => value.trim()).filter(Boolean);
    if (labels.length < 2) return null;
    const datasets = [];
    for (const segment of segments) {
        if (segment === labelSegment) continue;
        const values = segment.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
        if (values.length !== labels.length) continue;
        const start = segment.search(/-?\d/);
        const label = segment.slice(0, start).replace(/[:,-]+$/g, '').trim();
        if (label) datasets.push({ label, data: values });
    }
    if (!datasets.length) return null;
    const mixed = /mixta|combinad/i.test(question);
    if (mixed) datasets.forEach((dataset, index) => { dataset.type = index % 2 ? 'line' : 'bar'; });
    return normalizeChartSpec({ type: mixed ? 'bar' : 'line', title: 'Gráfica solicitada por el usuario', subtitle: 'Construida con los valores proporcionados en la consulta', unit: /%|porcentaje/i.test(question) ? '%' : '', source: 'Datos proporcionados por el usuario', labels, datasets });
}

function ensureRequestedChart(response, question = '') {
    const spec = chartFromResponse(response, question);
    if (!spec) return response;
    response.blocks.push({ type: 'chart', spec });
    response.markdown = String(response.markdown || '').trim() + `\n\n## Gráfica interactiva\n\n\`\`\`chart\n${JSON.stringify(spec)}\n\`\`\``;
    return response;
}

function ensureRequestedTable(response, question = '') {
    if (!/\b(tabla|tabular|cuadro comparativo)\b/i.test(String(question))) return response;
    if (response?.blocks?.some(block => block.type === 'table')) return response;
    const chart = response?.blocks?.find(block => block.type === 'chart' && block.spec?.labels?.length && block.spec?.datasets?.length);
    if (!chart) return response;
    const headers = ['Categoría', ...chart.spec.datasets.map(dataset => dataset.label || 'Serie')];
    const rows = chart.spec.labels.map((label, index) => [label, ...chart.spec.datasets.map(dataset => {
        const value = dataset.data?.[index];
        return value == null ? '—' : `${value}${chart.spec.unit || ''}`;
    })]);
    response.blocks.push({ type: 'table', title: chart.spec.title || 'Tabla de datos', headers, rows });
    response.markdown = String(response.markdown || '').trim() + `\n\n## Tabla de datos\n\n| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map(row => `| ${row.join(' | ')} |`).join('\n')}`;
    return response;
}

function normalizeBlock(raw, index, errors) {
    if (!raw || typeof raw !== 'object') {
        errors.push(`Bloque ${index}: debe ser un objeto.`);
        return null;
    }
    const type = BLOCK_TYPES.has(raw.type) ? raw.type : null;
    if (!type) {
        errors.push(`Bloque ${index}: tipo no soportado.`);
        return null;
    }
    const base = { type };

    if (type === 'heading') {
        const content = cleanString(raw.content || raw.title, 300);
        return content ? { ...base, level: Math.min(4, Math.max(1, Number(raw.level) || 2)), content } : null;
    }
    if (type === 'text' || type === 'markdown') {
        const content = cleanString(raw.content, 24000);
        return content ? { ...base, content } : null;
    }
    if (type === 'code') {
        const content = cleanString(raw.content, 30000);
        return content ? { ...base, language: cleanString(raw.language || 'text', 40), filename: cleanString(raw.filename, 180), content } : null;
    }
    if (type === 'table') {
        const headers = normalizeStringArray(raw.headers, 12, 180);
        const rows = Array.isArray(raw.rows) ? raw.rows.slice(0, 50).map(row =>
            Array.isArray(row) ? row.slice(0, headers.length || 12).map(cell => cleanString(cell, 600)) : []
        ).filter(row => row.length) : [];
        return headers.length && rows.length ? { ...base, title: cleanString(raw.title, 180), headers, rows } : null;
    }
    if (type === 'diagram') {
        const checked = validateMermaid(raw.content);
        if (!checked.valid) { errors.push(`Bloque ${index}: ${checked.error}`); return null; }
        return { ...base, format: 'mermaid', title: cleanString(raw.title, 180), content: checked.content };
    }
    if (type === 'chart') {
        const spec = normalizeChartSpec(raw.spec || raw);
        return spec ? { ...base, spec } : null;
    }
    if (type === 'image') {
        const url = safeUrl(raw.url || raw.src);
        return url ? { ...base, url, alt: cleanString(raw.alt, 240), caption: cleanString(raw.caption, 500) } : null;
    }
    if (type === 'quote') {
        const content = cleanString(raw.content, 5000);
        return content ? { ...base, content, source: cleanString(raw.source, 300) } : null;
    }
    if (type === 'alert') {
        const content = cleanString(raw.content, 5000);
        return content ? { ...base, severity: SEVERITIES.has(raw.severity) ? raw.severity : 'info', title: cleanString(raw.title, 180), content } : null;
    }
    if (type === 'steps' || type === 'checklist') {
        const source = raw.items || raw.steps;
        const items = Array.isArray(source) ? source.slice(0, 30).map(item => {
            if (typeof item === 'string') return { text: cleanString(item, 800), checked: false };
            return { text: cleanString(item?.text || item?.content, 800), checked: Boolean(item?.checked) };
        }).filter(item => item.text) : [];
        return items.length ? { ...base, title: cleanString(raw.title, 180), items } : null;
    }
    if (type === 'comparison') {
        const items = Array.isArray(raw.items) ? raw.items.slice(0, 8).map(item => ({
            title: cleanString(item?.title || item?.name, 160),
            content: cleanString(item?.content || item?.description, 2500),
            pros: normalizeStringArray(item?.pros, 12, 500),
            cons: normalizeStringArray(item?.cons, 12, 500),
        })).filter(item => item.title || item.content) : [];
        return items.length ? { ...base, title: cleanString(raw.title, 180), items } : null;
    }
    if (type === 'formula') {
        const content = cleanString(raw.content || raw.latex, 3000);
        return content ? { ...base, content, description: cleanString(raw.description, 1200) } : null;
    }
    if (type === 'document') {
        const sections = Array.isArray(raw.sections) ? raw.sections.slice(0, 30).map(section => ({
            title: cleanString(section?.title, 240), content: cleanString(section?.content, 12000),
        })).filter(section => section.title || section.content) : [];
        return sections.length ? { ...base, title: cleanString(raw.title, 240), sections } : null;
    }
    if (type === 'download') {
        const content = cleanString(raw.content, 30000);
        return content ? { ...base, label: cleanString(raw.label || 'Descargar', 120), filename: cleanString(raw.filename || 'documento.txt', 180), mimeType: cleanString(raw.mimeType || 'text/plain', 100), content } : null;
    }
    return null;
}

function validateRichResponse(payload, defaults = {}) {
    const errors = [];
    const raw = payload && typeof payload === 'object' ? payload : {};
    const blocks = Array.isArray(raw.blocks)
        ? raw.blocks.map((block, index) => normalizeBlock(block, index, errors)).filter(Boolean).slice(0, 40)
        : [];
    if (!blocks.length) errors.push('La respuesta no contiene bloques válidos.');
    const value = {
        type: 'rich_response',
        version: RESPONSE_VERSION,
        title: cleanString(raw.title || defaults.title || 'Respuesta VALL-AI', 240),
        summary: cleanString(raw.summary || defaults.summary, 1600),
        mode: MODES.has(raw.mode) ? raw.mode : (MODES.has(defaults.mode) ? defaults.mode : 'normal'),
        blocks,
        markdown: cleanString(raw.markdown || defaults.markdown, 50000),
        meta: {
            provider: cleanString(defaults.provider || raw.meta?.provider || 'gemini', 60),
            model: cleanString(defaults.model || raw.meta?.model, 120),
            taskType: cleanString(defaults.taskType || raw.meta?.taskType, 80),
            generatedAt: new Date().toISOString(),
            latencyMs: Number(defaults.latencyMs) || 0,
            warnings: [...errors, ...normalizeStringArray(defaults.warnings, 20, 300)],
        },
    };
    return { valid: blocks.length > 0, value, errors };
}

function parseTable(lines, start) {
    const separator = /^\s*\|?\s*:?-{2,}/;
    if (!lines[start]?.includes('|')) return null;
    let separatorIndex = start + 1;
    while (separatorIndex < lines.length && !lines[separatorIndex].trim()) separatorIndex++;
    if (!separator.test(lines[separatorIndex] || '')) return null;
    const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(v => cleanString(v, 500));
    const headers = cells(lines[start]);
    const rows = [];
    let index = separatorIndex + 1;
    while (index < lines.length) {
        if (!lines[index].trim()) { index++; continue; }
        if (!lines[index].includes('|')) break;
        rows.push(cells(lines[index])); index++;
    }
    return rows.length ? { block: { type: 'table', headers, rows }, next: index } : null;
}

function parseMarkdownSegment(segment) {
    const lines = cleanString(segment, 50000).split('\n');
    const blocks = [];
    let buffer = [];
    const flush = () => {
        const content = buffer.join('\n').trim();
        if (content) blocks.push({ type: 'markdown', content });
        buffer = [];
    };
    for (let i = 0; i < lines.length;) {
        const line = lines[i];
        const heading = line.match(/^(#{1,4})\s+(.+)/);
        if (heading) { flush(); blocks.push({ type: 'heading', level: heading[1].length, content: heading[2] }); i++; continue; }
        const table = parseTable(lines, i);
        if (table) { flush(); blocks.push(table.block); i = table.next; continue; }
        const alert = line.match(/^>\s*\[!(INFO|NOTE|TIP|WARNING|CAUTION|DANGER)\]\s*(.*)/i);
        if (alert) {
            flush(); const body = []; i++;
            while (i < lines.length && /^>/.test(lines[i])) { body.push(lines[i].replace(/^>\s?/, '')); i++; }
            const map = { note: 'info', tip: 'success', caution: 'warning', warning: 'warning', danger: 'danger', info: 'info' };
            blocks.push({ type: 'alert', severity: map[alert[1].toLowerCase()] || 'info', title: alert[2], content: body.join('\n') });
            continue;
        }
        if (/^-\s+\[[ xX]\]\s+/.test(line)) {
            flush(); const items = [];
            while (i < lines.length) { const m = lines[i].match(/^-\s+\[([ xX])\]\s+(.+)/); if (!m) break; items.push({ checked: m[1].toLowerCase() === 'x', text: m[2] }); i++; }
            blocks.push({ type: 'checklist', items }); continue;
        }
        if (/^\d+\.\s+/.test(line)) {
            flush(); const items = [];
            while (i < lines.length) { const m = lines[i].match(/^\d+\.\s+(.+)/); if (!m) break; items.push({ text: m[1] }); i++; }
            blocks.push({ type: 'steps', items }); continue;
        }
        if (/^\$\$/.test(line)) {
            flush(); const formula = [line.replace(/^\$\$/, '')]; i++;
            while (i < lines.length && !/\$\$$/.test(lines[i])) { formula.push(lines[i]); i++; }
            if (i < lines.length) { formula.push(lines[i].replace(/\$\$$/, '')); i++; }
            blocks.push({ type: 'formula', content: formula.join('\n').trim() }); continue;
        }
        buffer.push(line); i++;
    }
    flush();
    return blocks;
}

function markdownToRichResponse(markdown, defaults = {}) {
    const source = cleanString(markdown, 50000);
    const blocks = [];
    
    // Rescue raw JSON chart generated without rich_response wrapper
    if (source.startsWith('{') && source.endsWith('}')) {
        try {
            const rawJson = JSON.parse(source);
            if (rawJson.chart || rawJson.spec || rawJson.datasets || rawJson.type === 'bar' || rawJson.type === 'line' || rawJson.type === 'pie') {
                const specSource = rawJson.chart?.spec || rawJson.chart || rawJson.spec || rawJson;
                blocks.push({ type: 'chart', spec: specSource });
            }
        } catch (e) {
            // Not a valid JSON or failed to parse, continue as markdown
        }
    }

    if (blocks.length === 0) {
        let last = 0;
        const fence = /```([\w+-]*)\s*\n([\s\S]*?)```/g;
        let match;
        while ((match = fence.exec(source))) {
            blocks.push(...parseMarkdownSegment(source.slice(last, match.index)));
            const language = cleanString(match[1] || 'text', 40).toLowerCase();
            const content = cleanString(match[2], 30000);
            if (language === 'mermaid') blocks.push({ type: 'diagram', format: 'mermaid', content });
            else if (language === 'chart') {
                try { blocks.push({ type: 'chart', spec: JSON.parse(content) }); }
                catch { blocks.push({ type: 'code', language: 'json', content }); }
            } else blocks.push({ type: 'code', language, content });
            last = fence.lastIndex;
        }
        blocks.push(...parseMarkdownSegment(source.slice(last)));
    }

    const titleBlock = blocks.find(block => block.type === 'heading');
    return validateRichResponse({
        title: defaults.title || titleBlock?.content || 'Respuesta VALL-AI',
        summary: defaults.summary || '', mode: defaults.mode, blocks, markdown: source,
    }, defaults).value;
}

function toLegacyMarkdown(response) {
    if (response?.markdown) return response.markdown;
    return (response?.blocks || []).map(block => {
        if (block.type === 'heading') return `${'#'.repeat(block.level || 2)} ${block.content}`;
        if (block.type === 'text' || block.type === 'markdown') return block.content;
        if (block.type === 'code') return `\`\`\`${block.language || ''}\n${block.content}\n\`\`\``;
        if (block.type === 'diagram') return `\`\`\`mermaid\n${block.content}\n\`\`\``;
        if (block.type === 'chart') return `\`\`\`chart\n${JSON.stringify(block.spec)}\n\`\`\``;
        if (block.type === 'table') return `| ${block.headers.join(' | ')} |\n| ${block.headers.map(() => '---').join(' | ')} |\n${block.rows.map(row => `| ${row.join(' | ')} |`).join('\n')}`;
        if (block.type === 'alert') return `> **${block.title || 'Nota'}:** ${block.content}`;
        if (block.type === 'quote') return `> ${block.content}${block.source ? `\n> — ${block.source}` : ''}`;
        if (block.type === 'steps') return block.items.map((item, i) => `${i + 1}. ${item.text}`).join('\n');
        if (block.type === 'checklist') return block.items.map(item => `- [${item.checked ? 'x' : ' '}] ${item.text}`).join('\n');
        if (block.type === 'formula') return `$$\n${block.content}\n$$`;
        if (block.type === 'document') return block.sections.map(section => `## ${section.title}\n${section.content}`).join('\n\n');
        return '';
    }).filter(Boolean).join('\n\n');
}

module.exports = {
    BLOCK_TYPES, MODES, RESPONSE_VERSION, cleanString, validateMermaid, normalizeChartSpec,
    validateRichResponse, markdownToRichResponse, toLegacyMarkdown, chartFromResponse, ensureRequestedChart, ensureRequestedTable,
};
