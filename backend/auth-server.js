'use strict';

// Cuenta y preferencias no necesitan cargar IA, exportadores ni cotizaciones.
// Mantener este servidor pequeño evita que sus arranques dependan de mercados.
require('dotenv').config({ path: require('node:path').join(__dirname, '.env'), quiet: true });
require('./lib/tls-trust').configureSystemTrust();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { router, sessionClaims } = require('./routes/auth');
const { anonymousKey } = require('./lib/resource-limits');
const { originPolicy, securityHeaders, mutationOriginGuard, safeErrorHandler } = require('./lib/request-security');

const app = express();
const allowed = originPolicy();
app.disable('x-powered-by');
app.use(securityHeaders);
app.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
app.use(cors({
    origin(origin, callback) { callback(allowed(origin) ? null : Object.assign(new Error('Origen no permitido.'), { status: 403 }), allowed(origin)); },
    credentials: true, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(cookieParser());
app.use('/api', mutationOriginGuard(allowed));
app.use('/api', rateLimit({
    windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false,
    keyGenerator(req) { try { return `user:${sessionClaims(req).sub}`; } catch { return anonymousKey(req); } },
    message: { success: false, error: 'Demasiadas solicitudes de cuenta. Intenta en un momento.' },
}));
app.use(express.json({ limit: '16kb' }));
app.use('/api', router);
app.use((req, res) => res.status(404).json({ success: false, error: 'Ruta no encontrada.' }));
app.use(safeErrorHandler);
module.exports = app;
