'use strict';
const path = require('path');
const fs   = require('fs');

const IS_VERCEL = !!process.env.VERCEL;
const IS_PROD   = process.env.NODE_ENV === 'production';
const CACHE_DIR = IS_VERCEL ? '/tmp' : path.join(__dirname, '..', 'cache');

// Asegurar que el directorio de caché exista
try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
} catch {}

// ── JWT_SECRET ─────────────────────────────────────────────────────────────
// En producción/Vercel es obligatorio: si falta, se detiene el arranque en vez
// de emitir tokens firmados con un secreto público conocido (falsificables).
// En local se permite un fallback de desarrollo, con advertencia explícita.
const _DEV_JWT_FALLBACK = 'cambia_este_secreto_jwt_ahora';
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    if (IS_VERCEL || IS_PROD) {
        throw new Error('JWT_SECRET no está definido. Configúralo en las variables de entorno antes de desplegar a producción.');
    }
    console.warn('  [auth] JWT_SECRET no definido — usando secreto de desarrollo inseguro (solo válido en local).');
    JWT_SECRET = _DEV_JWT_FALLBACK;
}

module.exports = { IS_VERCEL, IS_PROD, CACHE_DIR, JWT_SECRET };
