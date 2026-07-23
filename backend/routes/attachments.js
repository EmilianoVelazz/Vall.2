'use strict';

const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyToken } = require('./auth');

const router = express.Router();
const attachments = new Map();
const TTL_MS = 30 * 60 * 1000;
const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf',
    'text/plain', 'text/csv', 'text/markdown', 'application/json',
]);

const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiados archivos. Intenta nuevamente en unos minutos.' },
});

function ownerKey(user) {
    return String(user?.email || user?.sub || user?.id || 'authenticated');
}

function safeName(value) {
    return String(value || 'archivo').replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim().slice(0, 120) || 'archivo';
}

function cleanupExpired() {
    const now = Date.now();
    for (const [id, item] of attachments) if (item.expiresAt <= now) attachments.delete(id);
}

router.post('/chat-attachments', express.json({ limit: '9mb' }), verifyToken, uploadLimiter, (req, res) => {
    cleanupExpired();
    const name = safeName(req.body?.name);
    const type = String(req.body?.type || '').toLowerCase().split(';')[0];
    const dataUrl = String(req.body?.dataUrl || '');
    const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!ALLOWED_TYPES.has(type) || !match || match[1].toLowerCase() !== type) {
        return res.status(400).json({ success: false, error: 'Tipo de archivo no permitido.' });
    }
    const base64 = match[2].replace(/\s/g, '');
    const bytes = Buffer.byteLength(base64, 'base64');
    if (!bytes || bytes > MAX_BYTES) {
        return res.status(413).json({ success: false, error: 'El archivo debe pesar menos de 6 MB.' });
    }
    const id = crypto.randomBytes(18).toString('hex');
    const item = { id, owner: ownerKey(req.user), name, type, size: bytes, base64, expiresAt: Date.now() + TTL_MS };
    attachments.set(id, item);
    res.status(201).json({ success: true, attachment: { id, name, type, size: bytes, expiresInMinutes: 30 } });
});

function getAttachments(ids, user) {
    cleanupExpired();
    const owner = ownerKey(user);
    return (Array.isArray(ids) ? ids : []).slice(0, 5).map(id => attachments.get(String(id)))
        .filter(item => item && item.owner === owner)
        .map(({ id, name, type, size, base64 }) => ({ id, name, type, size, base64 }));
}

module.exports = { router, getAttachments, ALLOWED_TYPES, MAX_BYTES };
