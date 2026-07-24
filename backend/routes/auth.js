'use strict';
const express   = require('express');
const crypto    = require('crypto');
const fs        = require('fs');
const path      = require('path');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Protección brute-force: máximo 8 intentos por 15 minutos por IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiados intentos de login. Espera 15 minutos.' },
});

const JWT_SECRET  = process.env.JWT_SECRET || 'cambia_este_secreto_jwt_ahora';
const JWT_EXPIRES = '8h';
const ENV_PATH    = path.join(__dirname, '..', '.env');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Comparación en tiempo constante para strings — normaliza longitud para evitar timing attack */
function safeCompare(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    const len  = Math.max(bufA.length, bufB.length);
    const padA = Buffer.concat([bufA, Buffer.alloc(len - bufA.length)]);
    const padB = Buffer.concat([bufB, Buffer.alloc(len - bufB.length)]);
    return crypto.timingSafeEqual(padA, padB) && bufA.length === bufB.length;
}

/** Detecta si un string ya es un hash bcrypt */
function isBcryptHash(str) {
    return typeof str === 'string' && str.startsWith('$2');
}

/** Mutex simple para escrituras concurrentes al .env */
let _envWriting = false;

/** Actualiza USER_PASSWORD en el .env y en process.env */
function updateEnvPassword(newValue) {
    if (_envWriting) return;
    _envWriting = true;
    try {
        let envContent = '';
        try { envContent = fs.readFileSync(ENV_PATH, 'utf8'); } catch { /* .env puede no existir */ }

        if (/^USER_PASSWORD=.*/m.test(envContent)) {
            envContent = envContent.replace(/^USER_PASSWORD=.*/m, `USER_PASSWORD=${newValue}`);
        } else {
            envContent += `\nUSER_PASSWORD=${newValue}`;
        }
        fs.writeFileSync(ENV_PATH, envContent, 'utf8');
        process.env.USER_PASSWORD = newValue;
    } finally {
        _envWriting = false;
    }
}

/**
 * Migra la contraseña de texto plano a hash bcrypt.
 * Se llama al arrancar el servidor y después de un login exitoso con contraseña en plano.
 * En Vercel, .env no es un archivo editable → se omite silenciosamente.
 */
async function migratePasswordIfNeeded(storedPassword) {
    if (!storedPassword || isBcryptHash(storedPassword)) return;
    if (!!process.env.VERCEL) return; // Vercel usa env vars del dashboard, no archivo .env
    try {
        const hashed = await bcrypt.hash(storedPassword, 10);
        updateEnvPassword(hashed);
        console.log('  [auth] Contraseña migrada a bcrypt hash correctamente.');
    } catch (e) {
        console.error('  [auth] Error al migrar contraseña:', e.message);
    }
}

/** Verifica una contraseña contra el valor almacenado (hash o texto plano legacy) */
async function verifyPassword(input, stored) {
    if (!stored) return false;
    if (isBcryptHash(stored)) return bcrypt.compare(input, stored);
    // Fallback texto plano (se migrará tras el primer login exitoso)
    return safeCompare(input, stored);
}

// ── Middleware: verificar JWT ──────────────────────────────────────────────────

function verifyToken(req, res, next) {
    const token = req.cookies?.vn_token
        || (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No autenticado' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    }
}

// Migración automática al arrancar (no bloquea el startup)
setImmediate(() => migratePasswordIfNeeded(process.env.USER_PASSWORD));

// ── Rutas ─────────────────────────────────────────────────────────────────────

router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password)
            return res.status(400).json({ success: false, error: 'Credenciales requeridas.' });

        const validEmail    = process.env.USER_EMAIL    || '';
        const validPassword = process.env.USER_PASSWORD || '';

        if (!validEmail || !validPassword)
            return res.status(503).json({ success: false, error: 'Autenticación no configurada.' });

        const emailOk = safeCompare(email.toLowerCase(), validEmail.toLowerCase());
        const passOk  = await verifyPassword(password, validPassword);

        if (!emailOk || !passOk)
            return res.status(401).json({ success: false, error: 'Correo o contraseña incorrectos.' });

        // Si la contraseña aún está en plano, migrarla ahora (no bloquea la respuesta)
        if (!isBcryptHash(validPassword)) {
            migratePasswordIfNeeded(validPassword).catch(() => {});
        }

        const token = jwt.sign({ email: validEmail }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
        res.cookie('vn_token', token, {
            httpOnly: true,
            secure:   req.secure || req.headers['x-forwarded-proto'] === 'https',
            sameSite: 'lax',
            path:     '/',
            maxAge:   8 * 60 * 60 * 1000,
        });
        res.json({ success: true, token });
    } catch (err) {
        console.error('/api/login error:', err.message);
        res.status(500).json({ success: false, error: 'Error interno del servidor.' });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie('vn_token');
    res.json({ success: true });
});

router.get('/verify-token', verifyToken, (req, res) => {
    res.json({ success: true, email: req.user.email });
});

router.post('/change-password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body || {};
        if (!currentPassword || !newPassword)
            return res.status(400).json({ success: false, error: 'Faltan campos requeridos.' });
        if (newPassword.length < 6)
            return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres.' });

        const storedPassword = process.env.USER_PASSWORD || '';
        const valid = await verifyPassword(currentPassword, storedPassword);
        if (!valid)
            return res.status(401).json({ success: false, error: 'La contraseña actual es incorrecta.' });

        // Siempre guardar la nueva contraseña como hash bcrypt
        const hashed = await bcrypt.hash(newPassword, 10);
        updateEnvPassword(hashed);

        res.json({ success: true });
    } catch (err) {
        console.error('/api/change-password error:', err.message);
        res.status(500).json({ success: false, error: 'Error interno al cambiar la contraseña.' });
    }
});

module.exports = { router, verifyToken };
