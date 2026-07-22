'use strict';
const path = require('path');
const fs   = require('fs');

const IS_VERCEL = !!process.env.VERCEL;
const CACHE_DIR = IS_VERCEL ? '/tmp' : path.join(__dirname, '..', 'cache');

// Asegurar que el directorio de caché exista
try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
} catch {}

module.exports = { IS_VERCEL, CACHE_DIR };
