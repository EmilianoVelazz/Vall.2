'use strict';

const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyToken } = require('./auth');
const { accountKey, boundedJson } = require('../lib/resource-limits');
const { AttachmentCache } = require('../lib/attachment-cache');

const router = express.Router();
const attachments = new AttachmentCache();
const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf',
    'text/plain', 'text/csv', 'text/markdown', 'application/json',
    'audio/webm', 'audio/mp4', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mpeg', 'audio/aac'
]);

const uploadLimiter = rateLimit({
    keyGenerator: accountKey,
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiados archivos. Intenta nuevamente en unos minutos.' },
});
// calajo si esta medio raor todos esos datos la verdad es quue si se siente la diferencia
function ownerKey(user) {
    return String(user?.sub || user?.id || user?.email || '');
}

function safeName(value) {
    return String(value || 'archivo').replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim().slice(0, 120) || 'archivo';
}

router.post('/chat-attachments', verifyToken, uploadLimiter, boundedJson({ limit: '9mb' }), (req, res) => {
    const name = safeName(req.body?.name);
    const type = String(req.body?.type || '').toLowerCase().split(';')[0];
    const dataUrl = String(req.body?.dataUrl || '');
    const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!ALLOWED_TYPES.has(type) || !match || match[1].toLowerCase() !== type) {
        return res.status(400).json({ success: false, error: 'Tipo de archivo no permitido.' });
    }
    const base64 = match[2].replace(/\s/g, '');
    if (base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
        return res.status(400).json({ success: false, error: 'Contenido de archivo inválido.' });
    }
    const bytes = Buffer.byteLength(base64, 'base64');
    if (!bytes || bytes > MAX_BYTES) {
        return res.status(413).json({ success: false, error: 'El archivo debe pesar menos de 6 MB.' });
    }
    const id = crypto.randomBytes(18).toString('hex');
    const item = { id, owner: ownerKey(req.user), name, type, size: bytes, base64 };
    const rejected = attachments.put(item);
    if (rejected) {
        res.set('Retry-After', '60');
        return res.status(rejected === 'owner' ? 429 : 503).json({ success: false, error: 'Se alcanzó el límite temporal de adjuntos. Intenta más tarde.' });
    }
    res.status(201).json({ success: true, attachment: { id, name, type, size: bytes, expiresInMinutes: 30 } });
});

function getAttachments(ids, user) {
    const owner = ownerKey(user);
    if (!owner) return [];
    return (Array.isArray(ids) ? ids : []).slice(0, 5).map(id => attachments.get(String(id), owner))
        .filter(Boolean)
        .map(({ id, name, type, size, base64 }) => ({ id, name, type, size, base64 }));
}

module.exports = { router, getAttachments, ALLOWED_TYPES, MAX_BYTES };
