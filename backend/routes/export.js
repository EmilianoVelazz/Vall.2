'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('node:crypto');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, AlignmentType } = require('docx');
const { verifyToken } = require('./auth');

const router = express.Router();
const files = new Map();
const TTL = 10 * 60 * 1000;
const MAX_FILES = 80;

// Limpieza periódica de archivos expirados (evita acumulación en memoria)
setInterval(() => {
    const now = Date.now();
    for (const [key, file] of files) if (file.expires < now) files.delete(key);
}, 60_000);

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

function clean(value, max = 120000) { return String(value == null ? '' : value).replace(/\0/g, '').trim().slice(0, max); }
function filename(value) { return clean(value, 100).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'reporte-vall-ai'; }
function plain(value) { return clean(value).replace(/```[\s\S]*?```/g, '').replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/^>\s?/gm, '').replace(/\|/g, ' ').trim(); }
function imagesFrom(body) {
    return (Array.isArray(body?.chartImages) ? body.chartImages : []).slice(0, 8).map(value => {
        const match = String(value).match(/^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/=]+)$/i);
        if (!match) return null;
        const buffer = Buffer.from(match[1], 'base64');
        return buffer.length <= 2_500_000 ? buffer : null;
    }).filter(Boolean);
}

function docxParagraphs(content) {
    const paragraphs = [];
    let inCode = false;
    for (const raw of clean(content).split(/\r?\n/)) {
        if (/^```/.test(raw.trim())) { inCode = !inCode; continue; }
        if (inCode) continue;
        const heading = raw.match(/^(#{1,4})\s+(.+)/);
        if (heading) {
            const levels = [HeadingLevel.TITLE, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
            paragraphs.push(new Paragraph({ text: plain(heading[2]), heading: levels[Math.min(heading[1].length - 1, 3)], spacing: { before: 220, after: 100 } }));
            continue;
        }
        const bullet = raw.match(/^\s*[-•]\s+(.+)/);
        const ordered = raw.match(/^\s*\d+\.\s+(.+)/);
        if (bullet || ordered) {
            paragraphs.push(new Paragraph({ text: plain((bullet || ordered)[1]), bullet: { level: 0 }, spacing: { after: 60 } }));
            continue;
        }
        if (!raw.trim()) { paragraphs.push(new Paragraph('')); continue; }
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: plain(raw), size: 22 })], spacing: { after: 100 } }));
    }
    return paragraphs;
}

async function makeDocx(title, content, images) {
    const children = [
        new Paragraph({ text: 'VALLNEWS · INTELIGENCIA ECONÓMICA', heading: HeadingLevel.HEADING_2, spacing: { after: 100 } }),
        new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: 100 } }),
        new Paragraph({ text: `Generado por VALL AI · ${new Date().toLocaleDateString('es-MX')}`, spacing: { after: 300 } }),
        ...docxParagraphs(content),
    ];
    images.forEach((data, index) => {
        children.push(new Paragraph({ text: `Gráfica ${index + 1}`, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 } }));
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data, transformation: { width: 620, height: 340 } })] }));
    });
    children.push(new Paragraph({ text: 'Documento informativo. Verifique las cifras antes de tomar decisiones.', spacing: { before: 300 } }));
    const document = new Document({ sections: [{ properties: {}, children }] });
    return Packer.toBuffer(document);
}

function executivePayload(input) {
    if (!input || typeof input !== 'object') return null;
    // El PDF usa las fuentes nativas de PDFKit. Normalizar los guiones evita
    // sustituciones tipográficas distintas entre lectores de PDF.
    const text = (value, max = 1600) => plain(String(value || '')).replace(/[\u2013\u2014\u2212]/g, '-').slice(0, max);
    const rows = value => Array.isArray(value) ? value.slice(0, 24).map(row => Array.isArray(row) ? row.slice(0, 7).map(cell => text(cell, 250)) : []).filter(row => row.length) : [];
    const visuals = Array.isArray(input.visuals) ? input.visuals.slice(0, 4).map(visual => ({
        type: visual?.type === 'bar' ? 'bar' : 'line', title: text(visual?.title, 120), unit: text(visual?.unit, 70), note: text(visual?.note, 340),
        bars: Array.isArray(visual?.bars) ? visual.bars.slice(0, 10).map(item => ({ label: text(item?.label, 60), value: Number(item?.value) })).filter(item => Number.isFinite(item.value)) : [],
        series: Array.isArray(visual?.series) ? visual.series.slice(0, 5).map(series => ({ label: text(series?.label, 60), points: Array.isArray(series?.points) ? series.points.slice(-48).map(point => ({ date: text(point?.date, 18), value: Number(point?.value) })).filter(point => Number.isFinite(point.value)) : [] })).filter(series => series.points.length > 1) : [],
    })).filter(visual => visual.title && (visual.bars.length || visual.series.length)) : [];
    const comparisonRows = [];
    const visited = new Set();
    const visitSnapshot = (value, depth = 0) => {
        if (!value || typeof value !== 'object' || depth > 5 || visited.has(value)) return;
        visited.add(value);
        if (Array.isArray(value)) { value.forEach(item => visitSnapshot(item, depth + 1)); return; }
        const current = Number(value.value);
        const previous = Number(value.previous);
        if (typeof value.label === 'string' && Number.isFinite(current) && Number.isFinite(previous) && previous !== 0) {
            const calculated = ((current - previous) / previous) * 100;
            const supplied = Number(value.change);
            comparisonRows.push({ label: text(value.label, 65), previous, current, change: Number.isFinite(supplied) ? supplied : calculated, unit: text(value.unit, 24) });
        }
        Object.values(value).forEach(item => visitSnapshot(item, depth + 1));
    };
    visitSnapshot(input.sourceSnapshot);
    const comparisons = [...new Map(comparisonRows.map(item => [item.label, item])).values()].slice(0, 4);
    const briefInput = input.executiveBrief && typeof input.executiveBrief === 'object' ? input.executiveBrief : {
        mode: 'deterministic', agent: 'VALL Executive Desk', headline: input.title, context: input.objective, thesis: input.summary,
        drivers: input.takeaways, risks: input.watchlist,
        committeeQuestion: '¿Qué dato de las fuentes del corte confirmaría o cambiaría esta lectura antes de tomar una decisión?',
        evidenceNote: 'Síntesis determinista construida con los indicadores y fuentes verificables ya incluidos en este informe; no es una respuesta generada por IA.',
    };
    const executiveBrief = briefInput ? {
        mode: briefInput.mode === 'ai' ? 'ai' : 'deterministic', agent: text(briefInput.agent || 'VALL Executive Desk', 80), headline: text(briefInput.headline, 140), context: text(briefInput.context, 360), thesis: text(briefInput.thesis, 500),
        drivers: Array.isArray(briefInput.drivers) ? briefInput.drivers.slice(0, 3).map(item => text(item, 300)).filter(Boolean) : [],
        risks: Array.isArray(briefInput.risks) ? briefInput.risks.slice(0, 3).map(item => text(item, 300)).filter(Boolean) : [],
        committeeQuestion: text(briefInput.committeeQuestion, 320), evidenceNote: text(briefInput.evidenceNote, 500),
    } : null;
    return {
        title: text(input.title, 140), eyebrow: text(input.eyebrow, 100), objective: text(input.objective, 1100), summary: text(input.summary, 1500), closing: text(input.closing, 1200),
        generatedAt: text(input.generatedAt, 80),
        metrics: Array.isArray(input.metrics) ? input.metrics.slice(0, 8).map(item => ({ label: text(item?.label, 55), value: text(item?.value, 70), change: text(item?.change, 45) })) : [],
        takeaways: Array.isArray(input.takeaways) ? input.takeaways.slice(0, 5).map(item => text(item, 700)).filter(Boolean) : [],
        watchlist: Array.isArray(input.watchlist) ? input.watchlist.slice(0, 4).map(item => text(item, 500)).filter(Boolean) : [],
        sections: Array.isArray(input.sections) ? input.sections.slice(0, 10).map(item => ({ heading: text(item?.heading, 100), text: text(item?.text, 2500) })).filter(item => item.heading && item.text) : [],
        tables: Array.isArray(input.tables) ? input.tables.slice(0, 3).map(table => ({ title: text(table?.title, 120), note: text(table?.note, 400), columns: Array.isArray(table?.columns) ? table.columns.slice(0, 7).map(column => text(column, 80)) : [], rows: rows(table?.rows) })).filter(table => table.title && table.columns.length && table.rows.length) : [],
        visuals, comparisons, executiveBrief,
        sources: Array.isArray(input.sources) ? input.sources.slice(0, 12).map(item => text(item, 180)).filter(Boolean) : [],
    };
}

const PDF_COLORS = { navy: '#082c42', blue: '#116487', cyan: '#55c9df', ink: '#1f3440', muted: '#627b89', pale: '#eef8fb', line: '#c8dde5', grid: '#d9e9ee' };

function pdfCutLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? 'fecha no disponible'
        : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function pdfResetFlow(document, y = document.y) {
    document.x = document.page.margins.left;
    document.y = Math.max(document.page.margins.top, y);
}

function pdfPageHeader(document, label = 'INFORME EJECUTIVO') {
    const x = document.page.margins.left;
    const y = document.page.margins.top;
    const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    // En las páginas interiores el título de sección funciona como cabecera
    // minimalista. La marca queda reservada para la portada editorial.
    document.fillColor(PDF_COLORS.muted).font('Helvetica-Bold').fontSize(6.7).text(label, x, y, { width: contentWidth, align: 'right', characterSpacing: .45 });
    document.strokeColor(PDF_COLORS.line).lineWidth(.7).moveTo(x, y + 17).lineTo(x + contentWidth, y + 17).stroke();
    pdfResetFlow(document, y + 29);
}

function pdfAddPage(document, layout = 'portrait', label = 'INFORME EJECUTIVO') {
    const margin = layout === 'landscape' ? 42 : 48;
    document._vallPdfPageLabel = label;
    document.addPage({ size: 'A4', layout, margin });
}

function ensurePdfSpace(document, needed = 70, layout = 'portrait', label = 'INFORME EJECUTIVO') {
    const bottom = document.page.height - document.page.margins.bottom;
    if (document.y + needed > bottom) pdfAddPage(document, layout, label);
    else pdfResetFlow(document);
}

function pdfSection(document, heading, text) {
    if (!text) return;
    ensurePdfSpace(document, 60);
    const x = document.page.margins.left;
    document.fillColor(PDF_COLORS.blue).font('Helvetica-Bold').fontSize(10.8).text(heading, x, document.y, { characterSpacing: .28 });
    document.moveDown(.16).fillColor(PDF_COLORS.ink).font('Helvetica').fontSize(9.35).text(text, x, document.y, { lineGap: 2.25 });
    pdfResetFlow(document, document.y + 7);
}

function pdfMetricGrid(document, metrics) {
    if (!metrics?.length) return;
    const items = metrics.slice(0, 4);
    const gap = 10; const columns = 2;
    const width = (document.page.width - document.page.margins.left - document.page.margins.right - gap) / columns;
    const height = 62; const rows = Math.ceil(items.length / columns);
    ensurePdfSpace(document, rows * height + Math.max(0, rows - 1) * gap + 15);
    const startY = document.y;
    items.forEach((metric, index) => {
        const column = index % columns; const row = Math.floor(index / columns);
        const x = document.page.margins.left + column * (width + gap); const y = startY + row * (height + gap);
        document.roundedRect(x, y, width, height, 7).fillAndStroke(PDF_COLORS.pale, '#b7deea');
        document.rect(x, y, 4, height).fill(index % 2 ? PDF_COLORS.cyan : PDF_COLORS.blue);
        document.fillColor('#457184').font('Helvetica-Bold').fontSize(7).text(metric.label, x + 12, y + 10, { width: width - 24, ellipsis: true });
        document.fillColor(PDF_COLORS.navy).font('Helvetica-Bold').fontSize(13).text(metric.value, x + 12, y + 25, { width: width - 24, ellipsis: true });
        if (metric.change) document.fillColor('#51798b').font('Helvetica').fontSize(7.2).text(metric.change, x + 12, y + 45, { width: width - 24, ellipsis: true });
    });
    pdfResetFlow(document, startY + rows * height + Math.max(0, rows - 1) * gap + 16);
}

function pdfValue(value) {
    return Number(value).toLocaleString('es-MX', { maximumFractionDigits: Math.abs(Number(value)) >= 100 ? 2 : 4 });
}

function pdfBeforeAfter(document, rows) {
    if (!rows?.length) return;
    const x = document.page.margins.left;
    const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const gap = 10; const columns = 2; const width = (contentWidth - gap) / columns; const height = 82;
    const count = Math.min(rows.length, 4); const rowCount = Math.ceil(count / columns);
    ensurePdfSpace(document, 31 + rowCount * height + Math.max(0, rowCount - 1) * gap + 16);
    document.fillColor(PDF_COLORS.blue).font('Helvetica-Bold').fontSize(10.8).text('ANTES VS. AHORA', x, document.y, { characterSpacing: .28 });
    document.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7.1).text('Cierre previo verificable frente al corte actual de la misma serie.', x, document.y + 15, { width: contentWidth });
    const startY = document.y + 30;
    rows.slice(0, count).forEach((item, index) => {
        const column = index % columns; const row = Math.floor(index / columns);
        const cardX = x + column * (width + gap); const cardY = startY + row * (height + gap);
        const positive = item.change >= 0;
        const accent = positive ? '#269b79' : '#b04772';
        document.roundedRect(cardX, cardY, width, height, 7).fillAndStroke('#f4faf8', '#c9e2d9');
        document.rect(cardX, cardY, 4, height).fill(accent);
        document.fillColor(PDF_COLORS.navy).font('Helvetica-Bold').fontSize(7.4).text(item.label, cardX + 12, cardY + 9, { width: width - 24, ellipsis: true });
        document.fillColor('#5c7c70').font('Helvetica-Bold').fontSize(5.9).text('ANTES', cardX + 12, cardY + 29);
        document.fillColor(PDF_COLORS.ink).font('Helvetica-Bold').fontSize(9).text(`${pdfValue(item.previous)}${item.unit ? ` ${item.unit}` : ''}`, cardX + 12, cardY + 38, { width: width * .43, ellipsis: true });
        document.fillColor('#5c7c70').font('Helvetica-Bold').fontSize(5.9).text('AHORA', cardX + width * .52, cardY + 29);
        document.fillColor(PDF_COLORS.ink).font('Helvetica-Bold').fontSize(9).text(`${pdfValue(item.current)}${item.unit ? ` ${item.unit}` : ''}`, cardX + width * .52, cardY + 38, { width: width * .35, ellipsis: true });
        document.fillColor(accent).font('Helvetica-Bold').fontSize(7.2).text(`${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)}%`, cardX + 12, cardY + 62, { width: width - 24, align: 'right' });
    });
    pdfResetFlow(document, startY + rowCount * height + Math.max(0, rowCount - 1) * gap + 16);
}

function pdfExecutiveDesk(document, brief) {
    if (!brief || (!brief.thesis && !brief.drivers?.length && !brief.risks?.length && !brief.committeeQuestion)) return;
    const x = document.page.margins.left;
    const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const body = [
        brief.context && `Contexto: ${brief.context}`,
        brief.thesis && `Tesis: ${brief.thesis}`,
        brief.committeeQuestion && `Pregunta para comité: ${brief.committeeQuestion}`,
    ].filter(Boolean).join('\n\n');
    ensurePdfSpace(document, 110);
    const heading = brief.mode === 'ai' ? 'VALL EXECUTIVE DESK · LECTURA CON IA' : 'VALL EXECUTIVE DESK · SÍNTESIS DEL CORTE';
    document.fillColor('#8a641b').font('Helvetica-Bold').fontSize(10.8).text(heading, x, document.y, { characterSpacing: .28 });
    if (body) {
        document.moveDown(.18).fillColor(PDF_COLORS.ink).font('Helvetica').fontSize(9.15).text(body, x, document.y, { width: contentWidth, lineGap: 2.1 });
        pdfResetFlow(document, document.y + 7);
    }
    if (brief.drivers?.length) pdfKeyPoints(document, 'IMPULSORES VISIBLES', brief.drivers, '#b27a22');
    if (brief.risks?.length) pdfKeyPoints(document, 'RIESGOS A CONTRASTAR', brief.risks, '#b04772');
    if (brief.evidenceNote) {
        ensurePdfSpace(document, 30);
        document.fillColor(PDF_COLORS.muted).font('Helvetica-Oblique').fontSize(6.8).text(brief.evidenceNote, x, document.y, { width: contentWidth, lineGap: 1.8 });
        pdfResetFlow(document, document.y + 9);
    }
}

function pdfExecutiveCover(document, title, report) {
    const brief = report.executiveBrief || {};
    const x = document.page.margins.left;
    const width = document.page.width;
    const height = document.page.height;
    const contentWidth = width - document.page.margins.left - document.page.margins.right;
    const aiReading = brief.mode === 'ai';
    const status = aiReading ? 'LECTURA CON IA · DATOS DEL CORTE' : 'SÍNTESIS DEL CORTE · DATOS VERIFICABLES';
    const accent = aiReading ? '#e8b65b' : '#64d4b0';
    const thesis = brief.thesis || report.summary || 'No hubo evidencia suficiente para elaborar una tesis adicional en este corte.';

    // Esta portada no es decorativa: cambia el orden de lectura del PDF para
    // que comité vea primero la tesis y su pregunta, antes de las tablas.
    document.rect(0, 0, width, height).fill('#071d2c');
    document.rect(0, 0, width, 13).fill(accent);
    document.rect(width - 126, 13, 126, height - 13).fill('#0b2b3e');
    document.fillColor(accent).font('Helvetica-Bold').fontSize(8.2).text('VALLNEWS / EXECUTIVE BRIEF', x, 58, { characterSpacing: 1.25 });
    document.fillColor('#b9d3dc').font('Helvetica-Bold').fontSize(6.8).text(status, x, 78, { characterSpacing: .9 });
    const headline = brief.headline || report.title || title;
    const titleY = 106;
    const titleWidth = contentWidth * .79;
    document.font('Helvetica-Bold').fontSize(24);
    const titleHeight = Math.min(88, document.heightOfString(headline, { width: titleWidth, lineGap: 2 }));
    document.fillColor('#ffffff').text(headline, x, titleY, { width: titleWidth, height: titleHeight, lineGap: 2, ellipsis: true });
    const metadataY = titleY + titleHeight + 12;
    document.fillColor('#a9c6d1').font('Helvetica').fontSize(8.4).text(`${report.eyebrow || 'Informe ejecutivo'}  |  Corte ${pdfCutLabel(report.generatedAt)}`, x, metadataY, { width: contentWidth * .8 });

    const cardY = Math.max(231, metadataY + 36); const cardHeight = 154;
    document.roundedRect(x, cardY, contentWidth * .77, cardHeight, 10).fillAndStroke('#10364a', '#286077');
    document.fillColor(accent).font('Helvetica-Bold').fontSize(7.2).text('LA TESIS DEL CORTE', x + 20, cardY + 19, { characterSpacing: .8 });
    document.fillColor('#eff8fa').font('Helvetica').fontSize(12.2).text(thesis, x + 20, cardY + 39, { width: contentWidth * .77 - 40, height: 78, lineGap: 3, ellipsis: true });
    document.fillColor('#91b3bf').font('Helvetica').fontSize(6.8).text(brief.evidenceNote || 'Lectura basada en los datos y fuentes del corte.', x + 20, cardY + 126, { width: contentWidth * .77 - 40, lineGap: 1.8, ellipsis: true });

    const questionY = cardY + 196;
    document.fillColor('#74a0af').font('Helvetica-Bold').fontSize(6.8).text('PREGUNTA PARA COMITÉ', x, questionY, { characterSpacing: .75 });
    document.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text(brief.committeeQuestion || '¿Qué dato verificable debe confirmar el comité antes de decidir?', x, questionY + 18, { width: contentWidth * .77, lineGap: 2.5 });

    document.strokeColor('#2a5264').lineWidth(.7).moveTo(x, 548).lineTo(x + contentWidth * .77, 548).stroke();
    document.fillColor('#9fc1cb').font('Helvetica').fontSize(7.2).text('El detalle de indicadores, comparativos, riesgos, tablas y fuentes comienza en la página siguiente.', x, 562, { width: contentWidth * .77, lineGap: 2 });
    document.fillColor('#8ab5c2').font('Helvetica-Bold').fontSize(6.8).text('VALLNEWS · INTELIGENCIA ECONÓMICA', x, height - 69, { characterSpacing: .9 });
}

function pdfKeyPoints(document, heading, points, accent = PDF_COLORS.blue) {
    if (!points?.length) return;
    ensurePdfSpace(document, 80);
    const x = document.page.margins.left; const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    document.fillColor(PDF_COLORS.blue).font('Helvetica-Bold').fontSize(10.8).text(heading, x, document.y, { characterSpacing: .28 });
    document.moveDown(.32);
    points.forEach((point, index) => {
        document.font('Helvetica').fontSize(9.15);
        const height = Math.max(31, document.heightOfString(point, { width: contentWidth - 48, lineGap: 2 }) + 12);
        ensurePdfSpace(document, height + 4);
        const y = document.y;
        document.roundedRect(x, y, contentWidth, height, 6).fillAndStroke('#f7fbfc', '#d3e4ea');
        document.circle(x + 16, y + 16, 9).fill(accent);
        document.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.2).text(String(index + 1), x + 11, y + 12, { width: 10, align: 'center' });
        document.fillColor(PDF_COLORS.ink).font('Helvetica').fontSize(9.15).text(point, x + 33, y + 9, { width: contentWidth - 45, lineGap: 2 });
        pdfResetFlow(document, y + height + 4);
    });
    document.moveDown(.08);
}

function pdfTableHeading(document, table) {
    const x = document.page.margins.left; const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    document.fillColor(PDF_COLORS.navy).font('Helvetica-Bold').fontSize(12.2).text(table.title, x, document.y);
    if (table.note) {
        document.moveDown(.18).fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7.6).text(table.note, x, document.y, { width: contentWidth, lineGap: 2 });
    }
    pdfResetFlow(document, document.y + 9);
}

function pdfCompactTable(document, table) {
    ensurePdfSpace(document, 115, 'portrait', 'DATOS DEL CORTE');
    pdfTableHeading(document, table);
    const x = document.page.margins.left; const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const cols = table.columns.slice(0, 6);
    const widths = cols.map((_, index) => index === 0 ? contentWidth * .25 : (contentWidth * .75) / Math.max(cols.length - 1, 1));
    const rowHeight = (cells, header = false) => {
        document.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 7.1 : 7.45);
        return Math.max(header ? 21 : 23, ...cols.map((_, index) => document.heightOfString(String(cells[index] || ''), { width: widths[index] - 10, lineGap: 1.5 }) + 9));
    };
    const drawRow = (cells, header = false) => {
        const height = rowHeight(cells, header); const y = document.y; let cursor = x;
        cols.forEach((_, index) => { document.rect(cursor, y, widths[index], height).fillAndStroke(header ? '#d8edf3' : '#f8fbfc', '#c3dbe4'); cursor += widths[index]; });
        cursor = x;
        cols.forEach((_, index) => {
            document.fillColor(header ? '#104f69' : PDF_COLORS.ink).font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 7.1 : 7.45)
                .text(String(cells[index] || ''), cursor + 5, y + 5, { width: widths[index] - 10, lineGap: 1.5, ellipsis: true });
            cursor += widths[index];
        });
        pdfResetFlow(document, y + height);
    };
    const drawHeader = () => drawRow(cols, true);
    drawHeader();
    table.rows.forEach(row => {
        const height = rowHeight(row);
        if (document.y + height > document.page.height - document.page.margins.bottom) {
            pdfAddPage(document, 'portrait', 'DATOS DEL CORTE');
            drawHeader();
        }
        drawRow(row);
    });
    pdfResetFlow(document, document.y + 9);
}

function pdfDataCards(document, table) {
    ensurePdfSpace(document, 115, 'portrait', 'DATOS DEL CORTE');
    pdfTableHeading(document, table);
    const x = document.page.margins.left; const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const columns = table.columns.slice(0, 6); const dataColumns = columns.slice(1); const cardGap = 8; const dataGap = 7; const dataWidth = (contentWidth - dataGap * 2) / 3;
    table.rows.forEach((row, rowIndex) => {
        const fields = dataColumns.map((column, index) => ({ label: column, value: String(row[index + 1] || '') }));
        const fieldRows = Math.ceil(fields.length / 3);
        const labelHeight = document.font('Helvetica-Bold').fontSize(6.25).heightOfString(String(row[0] || ''), { width: contentWidth - 26, lineGap: 1 });
        const gridHeights = Array.from({ length: fieldRows }, (_, rowIndex) => Math.max(...fields.slice(rowIndex * 3, rowIndex * 3 + 3).map(field => {
            document.font('Helvetica').fontSize(7.1);
            return document.heightOfString(`${field.label}\n${field.value}`, { width: dataWidth - 10, lineGap: 1.4 }) + 4;
        })));
        const height = Math.max(48, 19 + labelHeight + gridHeights.reduce((sum, value) => sum + value, 0) + 10);
        if (document.y + height > document.page.height - document.page.margins.bottom) {
            pdfAddPage(document, 'portrait', 'DATOS DEL CORTE');
        }
        const y = document.y;
        document.roundedRect(x, y, contentWidth, height, 6).fillAndStroke(rowIndex % 2 ? '#f8fbfc' : '#f1f8fa', '#c6dee6');
        document.rect(x, y, 4, height).fill(rowIndex % 2 ? PDF_COLORS.cyan : PDF_COLORS.blue);
        document.fillColor(PDF_COLORS.navy).font('Helvetica-Bold').fontSize(7.1).text(String(row[0] || ''), x + 12, y + 8, { width: contentWidth - 24, lineGap: 1, ellipsis: true });
        let fieldY = y + 11 + labelHeight;
        fields.forEach((field, index) => {
            const fieldColumn = index % 3; const fieldRow = Math.floor(index / 3);
            const previousRowsHeight = gridHeights.slice(0, fieldRow).reduce((sum, value) => sum + value, 0);
            const fieldX = x + 12 + fieldColumn * (dataWidth + dataGap);
            const rowY = fieldY + previousRowsHeight;
            document.fillColor('#587887').font('Helvetica-Bold').fontSize(5.7).text(field.label, fieldX, rowY, { width: dataWidth - 10, ellipsis: true });
            document.fillColor(PDF_COLORS.ink).font('Helvetica').fontSize(7.1).text(field.value, fieldX, rowY + 8, { width: dataWidth - 10, lineGap: 1.4, ellipsis: true });
        });
        pdfResetFlow(document, y + height + cardGap);
    });
    pdfResetFlow(document, document.y + 2);
}

function pdfTable(document, table) {
    // Las tablas cortas permanecen junto a sus gráficas; las de muchas columnas
    // se vuelven fichas ejecutivas legibles en vez de abrir una página horizontal vacía.
    if ((table.columns || []).length <= 4) pdfCompactTable(document, table);
    else pdfDataCards(document, table);
}

function pdfLineChart(document, visual) {
    const series = (visual.series || []).filter(item => item.points?.length > 1);
    if (!series.length) return;
    ensurePdfSpace(document, 300, 'portrait', 'SEÑALES DEL MERCADO');
    const x = document.page.margins.left;
    document.fillColor(PDF_COLORS.navy).font('Helvetica-Bold').fontSize(14).text(visual.title, x, document.y);
    document.moveDown(.2).fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7.7).text(`${visual.unit || ''}${visual.note ? ` · ${visual.note}` : ''}`, x, document.y);
    pdfResetFlow(document, document.y + 14);
    const x0 = x + 39; const y0 = document.y; const chartWidth = document.page.width - document.page.margins.left - document.page.margins.right - 47; const chartHeight = 142;
    const values = series.flatMap(item => item.points.map(point => point.value)); const rawMin = Math.min(...values); const rawMax = Math.max(...values); const gap = (rawMax - rawMin) || Math.max(Math.abs(rawMax) * .04, 1); const min = rawMin - gap * .12; const max = rawMax + gap * .12;
    [0, .5, 1].forEach(position => {
        const y = y0 + chartHeight * position; const value = max - ((max - min) * position);
        document.strokeColor(PDF_COLORS.grid).lineWidth(.55).moveTo(x0, y).lineTo(x0 + chartWidth, y).stroke();
        document.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(6.7).text(value.toLocaleString('es-MX', { maximumFractionDigits: 2 }), x, y - 3, { width: 31, align: 'right' });
    });
    const colors = ['#167b9e', '#d07a2a', '#2f916c', '#b04772', '#7258ad'];
    series.forEach((item, seriesIndex) => {
        const points = item.points; document.strokeColor(colors[seriesIndex % colors.length]).lineWidth(1.7);
        points.forEach((point, index) => {
            const pointX = x0 + (index / Math.max(points.length - 1, 1)) * chartWidth;
            const pointY = y0 + chartHeight - ((point.value - min) / (max - min)) * chartHeight;
            if (index === 0) document.moveTo(pointX, pointY); else document.lineTo(pointX, pointY);
        });
        document.stroke();
    });
    document.fillColor('#385e70').font('Helvetica').fontSize(7.3).text(series.map(item => item.label).join('   ·   '), x, y0 + chartHeight + 12, { width: chartWidth + 39 });
    pdfResetFlow(document, y0 + chartHeight + 33);
}

function pdfBarChart(document, visual) {
    const bars = visual.bars || []; if (!bars.length) return;
    ensurePdfSpace(document, 185, 'portrait', 'SEÑALES DEL MERCADO');
    const x = document.page.margins.left; const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    document.fillColor(PDF_COLORS.navy).font('Helvetica-Bold').fontSize(14).text(visual.title, x, document.y);
    if (visual.note) document.moveDown(.2).fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7.7).text(visual.note, x, document.y, { width: contentWidth });
    pdfResetFlow(document, document.y + 15);
    const max = Math.max(...bars.map(bar => bar.value), 1); const labelWidth = 112; const valueWidth = 32; const barX = x + labelWidth + 12; const barWidth = contentWidth - labelWidth - valueWidth - 22;
    bars.forEach((bar, index) => {
        const y = document.y;
        if (y + 22 > document.page.height - document.page.margins.bottom) pdfAddPage(document, 'portrait', 'SEÑALES DEL MERCADO');
        const rowY = document.y;
        document.fillColor(PDF_COLORS.ink).font('Helvetica').fontSize(8.3).text(bar.label, x, rowY + 2, { width: labelWidth, ellipsis: true });
        document.roundedRect(barX, rowY + 4, barWidth, 9, 4).fill('#e5f0f3');
        document.roundedRect(barX, rowY + 4, Math.max(5, barWidth * bar.value / max), 9, 4).fill(['#167b9e', '#d07a2a', '#2f916c', '#b04772'][index % 4]);
        document.fillColor(PDF_COLORS.ink).font('Helvetica-Bold').fontSize(8.3).text(String(bar.value), barX + barWidth + 6, rowY + 2, { width: valueWidth - 2, align: 'right' });
        pdfResetFlow(document, rowY + 22);
    });
    document.moveDown(.25);
}

function pdfSourcesAtEnd(document, sources) {
    if (!sources?.length) return;
    const x = document.page.margins.left;
    const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const sourceText = sources.map(source => `- ${source}`).join('\n');
    document.font('Helvetica').fontSize(8.25);
    const sourceTextHeight = document.heightOfString(sourceText, { width: contentWidth, lineGap: 3 });
    const blockHeight = 19 + sourceTextHeight + 15;
    const footerHeight = 38;

    // Las fuentes son el último bloque del informe. Se dejan inmediatamente
    // después del cierre para evitar huecos artificiales; sólo crean una página
    // final cuando el bloque completo no cabe con su nota informativa.
    if (document.y + blockHeight + footerHeight > document.page.height - document.page.margins.bottom) {
        pdfAddPage(document, 'portrait', 'FUENTES Y TRAZABILIDAD');
    }
    const startY = document.y + 4;
    pdfResetFlow(document, startY);
    document.strokeColor(PDF_COLORS.line).lineWidth(.7).moveTo(x, startY - 8).lineTo(x + contentWidth, startY - 8).stroke();
    document.fillColor(PDF_COLORS.blue).font('Helvetica-Bold').fontSize(10.8).text('FUENTES Y TRAZABILIDAD', x, document.y, { characterSpacing: .28 });
    document.moveDown(.2).fillColor(PDF_COLORS.ink).font('Helvetica').fontSize(8.25).text(sourceText, x, document.y, { width: contentWidth, lineGap: 3 });
    pdfResetFlow(document, document.y + 5);
}

function makeExecutivePdf(title, report) {
    return new Promise((resolve, reject) => {
        const document = new PDFDocument({ size: 'A4', margin: 48, info: { Title: title, Author: 'VALLNEWS' } }); const chunks = [];
        document.on('data', chunk => chunks.push(chunk)); document.on('error', reject); document.on('end', () => resolve(Buffer.concat(chunks)));
        // Cubre tanto las páginas abiertas por el layout como los saltos
        // automáticos de PDFKit; de ese modo ninguna página interior pierde su cabecera.
        document._vallPdfPageLabel = 'INFORME EJECUTIVO';
        document.on('pageAdded', () => pdfPageHeader(document, document._vallPdfPageLabel));
        const x = document.page.margins.left; const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
        pdfExecutiveCover(document, title, report);
        pdfAddPage(document, 'portrait', 'SEÑALES Y DATOS DEL CORTE');
        pdfSection(document, 'OBJETIVO', report.objective);
        pdfSection(document, 'QUÉ CAMBIÓ Y POR QUÉ IMPORTA', report.summary);
        pdfMetricGrid(document, report.metrics);
        pdfBeforeAfter(document, report.comparisons);
        pdfExecutiveDesk(document, report.executiveBrief);
        if (report.takeaways.length) pdfKeyPoints(document, 'CONCLUSIONES CLAVE', report.takeaways, PDF_COLORS.blue);
        if (report.visuals.length) {
            // Dos visualizaciones por página conservan una lectura ágil y evitan
            // páginas vacías sin comprimir las series ni sus leyendas.
            pdfAddPage(document, 'portrait', 'SEÑALES DEL MERCADO');
            report.visuals.forEach(visual => {
                if (visual.type === 'bar') pdfBarChart(document, visual); else pdfLineChart(document, visual);
            });
        }
        report.tables.forEach(table => pdfTable(document, table));
        // La lectura de VALL AI resume conclusiones, contrastes y cierre ya
        // representados por las secciones deterministas, los puntos clave y el
        // cierre editorial. Omitir esa repetición mantiene cada página útil.
        const reportSections = report.sections.filter(section => !/^lectura complementaria de vall ai$/i.test(String(section.heading || '').trim()));
        if (reportSections.length || report.watchlist.length || report.closing) pdfAddPage(document, 'portrait', 'LECTURA Y SEGUIMIENTO');
        reportSections.forEach(section => pdfSection(document, section.heading.toUpperCase(), section.text));
        if (report.watchlist.length) pdfKeyPoints(document, 'QUÉ MONITOREAR', report.watchlist, '#b04772');
        pdfSection(document, 'CONCLUSIÓN', report.closing);
        pdfSourcesAtEnd(document, report.sources);
        ensurePdfSpace(document, 34);
        document.strokeColor(PDF_COLORS.line).lineWidth(.6).moveTo(x, document.y).lineTo(x + contentWidth, document.y).stroke();
        document.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7).text('Documento informativo. Las referencias de mercado pueden cambiar después de la hora de corte; verifica precio, fecha y fuente primaria antes de tomar decisiones.', x, document.y + 8, { width: contentWidth, align: 'center' });
        document.end();
    });
}

function makePdf(title, content, images) {
    return new Promise((resolve, reject) => {
        const document = new PDFDocument({ size: 'A4', margin: 52, info: { Title: title, Author: 'VALL AI' } });
        const chunks = [];
        document.on('data', chunk => chunks.push(chunk)); document.on('error', reject); document.on('end', () => resolve(Buffer.concat(chunks)));
        document.fillColor('#9a762d').fontSize(9).text('VALLNEWS · INTELIGENCIA ECONÓMICA', { characterSpacing: 1.3 });
        document.moveDown(.4).fillColor('#0b2b44').fontSize(22).text(title);
        document.moveDown(.3).fillColor('#6b7d8c').fontSize(9).text(`Generado por VALL AI · ${new Date().toLocaleDateString('es-MX')}`);
        document.moveDown(1).fillColor('#1c2d3a').fontSize(10.5).text(plain(content), { lineGap: 3 });
        images.forEach((data, index) => {
            document.addPage(); document.fillColor('#0b2b44').fontSize(14).text(`Gráfica ${index + 1}`); document.moveDown(.7);
            try { document.image(data, { fit: [490, 590], align: 'center' }); } catch { document.fontSize(9).text('No fue posible incrustar esta gráfica.'); }
        });
        document.end();
    });
}

function htmlReport(title, content, images) {
    const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return Buffer.from(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{max-width:820px;margin:40px auto;padding:0 28px;font:15px/1.65 Arial;color:#1c2d3a}h1{color:#0b2b44;border-bottom:4px solid #0b2b44;padding-bottom:12px}pre{white-space:pre-wrap}.chart{max-width:100%;margin:20px 0;border:1px solid #dbe3e8}</style></head><body><h1>${esc(title)}</h1><pre>${esc(content)}</pre>${images.map(data => `<img class="chart" src="data:image/png;base64,${data.toString('base64')}">`).join('')}</body></html>`, 'utf8');
}

router.post('/report-export', express.json({ limit: '7mb' }), verifyToken, limiter, async (req, res) => {
    try {
        const title = clean(req.body?.title || 'Reporte VALL AI', 140);
        const content = clean(req.body?.content, 180000);
        const executive = executivePayload(req.body?.executiveReport);
        const format = ['docx', 'pdf', 'html', 'markdown', 'txt', 'json'].includes(req.body?.format) ? req.body.format : 'docx';
        if (!content) return res.status(400).json({ success: false, error: 'El reporte está vacío.' });
        const images = imagesFrom(req.body);
        let buffer, mime, extension;
        if (format === 'docx') { buffer = await makeDocx(title, content, images); mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; extension = 'docx'; }
        else if (format === 'pdf') { buffer = executive ? await makeExecutivePdf(title, executive) : await makePdf(title, content, images); mime = 'application/pdf'; extension = 'pdf'; }
        else if (format === 'html') { buffer = htmlReport(title, content, images); mime = 'text/html; charset=utf-8'; extension = 'html'; }
        else if (format === 'markdown') { buffer = Buffer.from(content, 'utf8'); mime = 'text/markdown; charset=utf-8'; extension = 'md'; }
        else if (format === 'txt') { buffer = Buffer.from(plain(content), 'utf8'); mime = 'text/plain; charset=utf-8'; extension = 'txt'; }
        else { buffer = Buffer.from(JSON.stringify({ title, generatedAt: new Date().toISOString(), content }, null, 2), 'utf8'); mime = 'application/json; charset=utf-8'; extension = 'json'; }
        if (files.size >= MAX_FILES) {
            // Limpiar expirados primero
            const now = Date.now();
            for (const [key, file] of files) if (file.expires < now) files.delete(key);
            // Si sigue lleno, rechazar
            if (files.size >= MAX_FILES) {
                return res.status(503).json({ success: false, error: 'Demasiados reportes pendientes. Descarga los anteriores o espera unos minutos.' });
            }
        }
        const token = crypto.randomBytes(24).toString('hex');
        files.set(token, { buffer, mime, name: `${filename(title)}.${extension}`, owner: req.user?.email || '', expires: Date.now() + TTL });
        for (const [key, file] of files) if (file.expires < Date.now()) files.delete(key);
        res.json({ success: true, downloadUrl: `/api/report-download/${token}`, filename: `${filename(title)}.${extension}`, size: buffer.length });
    } catch (error) {
        console.error('/api/report-export error:', error.message);
        res.status(500).json({ success: false, error: 'No se pudo generar el documento.' });
    }
});

router.get('/report-download/:token', verifyToken, (req, res) => {
    const file = files.get(req.params.token);
    if (!file || file.expires < Date.now() || file.owner !== (req.user?.email || '')) return res.status(404).json({ success: false, error: 'El archivo expiró o no existe.' });
    files.delete(req.params.token);
    res.setHeader('Content-Type', file.mime); res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`); res.setHeader('Content-Length', file.buffer.length); res.send(file.buffer);
});

module.exports = router;
module.exports._test = { makeDocx, makePdf, makeExecutivePdf, executivePayload, htmlReport, plain };
