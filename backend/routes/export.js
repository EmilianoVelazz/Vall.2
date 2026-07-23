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
        if (inCode && /^{|^\s*"(?:type|labels|datasets)"/.test(raw)) continue;
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
        const format = ['docx', 'pdf', 'html', 'markdown', 'txt', 'json'].includes(req.body?.format) ? req.body.format : 'docx';
        if (!content) return res.status(400).json({ success: false, error: 'El reporte está vacío.' });
        const images = imagesFrom(req.body);
        let buffer, mime, extension;
        if (format === 'docx') { buffer = await makeDocx(title, content, images); mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; extension = 'docx'; }
        else if (format === 'pdf') { buffer = await makePdf(title, content, images); mime = 'application/pdf'; extension = 'pdf'; }
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
module.exports._test = { makeDocx, makePdf, htmlReport, plain };
