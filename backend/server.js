'use strict';

// ── 1. Variables de entorno (debe ir PRIMERO, antes de cualquier require de lib/) ──
const path = require('path');
const fs   = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

// ── 2. Fix TLS en Windows ──────────────────────────────────────────────────────
// En Node moderno se combinan las CAs incluidas y las del sistema operativo.
// Esto admite certificados corporativos de Windows sin desactivar la validación.
// ssl-root-cas queda como fallback para versiones antiguas de Node.
try {
    const tls = require('tls');
    if (typeof tls.getCACertificates === 'function' && typeof tls.setDefaultCACertificates === 'function') {
        const roots = [...new Set([
            ...tls.getCACertificates('default'),
            ...tls.getCACertificates('system'),
        ])];
        tls.setDefaultCACertificates(roots);
        console.log(`  [TLS] Verificación activa con ${roots.length} CAs de Node + sistema.`);
    } else {
        require('ssl-root-cas').inject();
        console.log('  [TLS] Verificación activa con bundle adicional de CAs.');
    }
    process.env._TLS_STRICT = '1';
} catch (err) {
    process.env._TLS_STRICT = '0';
    console.warn(`[TLS] No se pudo ampliar el almacén de CAs (${err.message}); se mantiene la verificación estándar de Node.`);
}

// ── 3. Dependencias ───────────────────────────────────────────────────────────
const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');
const jwt          = require('jsonwebtoken');


// ── 4. Routers ────────────────────────────────────────────────────────────────
const { IS_VERCEL, IS_PROD, JWT_SECRET }           = require('./lib/config');
const { router: authRouter }                      = require('./routes/auth');
const finanzasRouter                              = require('./routes/finanzas');
const { router: marketRouter, initCommodityWarmer } = require('./routes/market');
const externalRouter                              = require('./routes/external');
const chatRouter                                  = require('./routes/chat');
const reportsRouter                               = require('./routes/reports');

// ── 5. App ────────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3001;

app.disable('x-powered-by');
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3001')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        if (origin === 'http://localhost' || origin === 'http://127.0.0.1') return callback(null, true);
        // URLs automáticas de Vercel (deployment URL y dominio de producción/custom)
        const vUrl  = process.env.VERCEL_URL;
        const vProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
        if (vUrl  && origin === `https://${vUrl}`)  return callback(null, true);
        if (vProd && origin === `https://${vProd}`) return callback(null, true);
        // Cualquier puerto de localhost / 127.0.0.1 en desarrollo
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
        // Dominio personalizado explícito (PRODUCTION_URL en variables de Vercel)
        const prodUrl = process.env.PRODUCTION_URL;
        if (prodUrl && origin === prodUrl) return callback(null, true);
        console.warn(`[CORS] Origen bloqueado: ${origin}`);
        callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    credentials: true,
    methods:      ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'x-refresh-secret', 'Authorization'],
}));

app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));

// ── Middleware: auth guard para páginas HTML protegidas ───────────────────────
// Solo aplica en Express local (desarrollo). En Vercel los estáticos van por CDN.
// Protege GET de archivos .html específicos sin tocar ninguna ruta /api/*.

const _JWT_SECRET_STATIC = JWT_SECRET;

// Nombres exactos de páginas protegidas
const PROTECTED_PAGES = new Set([
    '/inicio.html',
    '/finanzas/finanzas.html',
    '/mercados/mercados.html',
    '/geopolitica/geopolitica.html',
    '/mexico/mexico.html',
    '/mercado_proteinas/mercadoproteinas.html',
    '/configuracion/configuracion.html',
]);

app.use((req, res, next) => {
    // Nunca interceptar rutas API ni métodos no-GET
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api/')) return next();
    if (!PROTECTED_PAGES.has(req.path)) return next();

    const token = req.cookies?.vn_token
        || (req.headers.authorization || '').replace('Bearer ', '');

    if (!token) {
        console.warn(`[auth-guard] Sin token: ${req.path} → redirigiendo a /`);
        return res.redirect(302, '/');
    }
    try {
        jwt.verify(token, _JWT_SECRET_STATIC);
        return next();
    } catch {
        console.warn(`[auth-guard] Token inválido: ${req.path} → redirigiendo a /`);
        return res.redirect(302, '/');
    }
});

// Servir archivos estáticos desde public_html (directorio padre)
// El anti-caché solo aplica en desarrollo local: en producción mataría el cache
// del navegador en cada visita (recarga completa de html/css/js siempre).
const _IS_DEV = !IS_VERCEL && !IS_PROD;

// React es la interfaz principal tambien en el servidor local. Las paginas
// historicas se conservan solo como redirecciones para enlaces guardados; de
// este modo nunca se ejecutan dos implementaciones distintas de una pantalla.
const REACT_DIST_DIR = path.join(__dirname, '..', 'dist');
const REACT_INDEX = path.join(REACT_DIST_DIR, 'index.html');
const LEGACY_TO_REACT = new Map([
    ['/inicio.html', '/inicio'],
    ['/finanzas/finanzas.html', '/finanzas'],
    ['/mercados/mercados.html', '/mercados'],
    ['/geopolitica/geopolitica.html', '/geopolitica'],
    ['/mexico/mexico.html', '/mexico'],
    ['/mercado_proteinas/mercadoproteinas.html', '/mercado-proteinas'],
    ['/configuracion/configuracion.html', '/configuracion'],
]);
const REACT_ROUTES = [
    '/', '/inicio', '/finanzas', '/mercados', '/geopolitica',
    '/mexico', '/mercado-proteinas', '/configuracion',
];

app.get([...LEGACY_TO_REACT.keys()], (req, res) => {
    res.redirect(302, LEGACY_TO_REACT.get(req.path));
});

if (fs.existsSync(REACT_INDEX)) {
    app.use(express.static(REACT_DIST_DIR, {
        index: false,
        setHeaders: (res, filePath) => {
            if (_IS_DEV && (filePath.endsWith('.css') || filePath.endsWith('.js'))) {
                res.setHeader('Cache-Control', 'no-store');
            }
        },
    }));
    app.get(REACT_ROUTES, (_req, res) => res.sendFile(REACT_INDEX));
} else {
    console.warn('[React] dist/index.html no existe. Ejecuta `npm run build`.');
}

app.use(express.static(path.join(__dirname, '..'), {
    setHeaders: (res, filePath) => {
        if (_IS_DEV && (filePath.endsWith('.html') || filePath.endsWith('.css') || filePath.endsWith('.js'))) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));


// ── Rate limiter (300 req/min por IP) ─────────────────────────────────────────
// Una sola carga de finanzas.html dispara ~40-50 peticiones; inicio.html ~17
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiadas peticiones. Intenta en un momento.' },
});
app.use('/api', apiLimiter);

// ── Routers ───────────────────────────────────────────────────────────────────
app.use('/api/reports', reportsRouter);
app.use('/api', authRouter);
app.use('/api', finanzasRouter);
app.use('/api', marketRouter);
app.use('/api', externalRouter);
app.use('/api', chatRouter);

// ── Error handler global ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('Unhandled Express error:', err.message);
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    const message = status < 500 && err.message ? err.message : 'Error interno del servidor';
    res.status(status).json({ success: false, error: message });
});

// ── Commodity warmer ──────────────────────────────────────────────────────────
// Pasa true si server.js se ejecuta directamente (no como módulo serverless)
initCommodityWarmer(require.main === module);

// ── Inicio del servidor ───────────────────────────────────────────────────────
if (require.main === module) {
    const server = app.listen(PORT, () => {
        console.log(`\n  VALLNEWS Backend · http://localhost:${PORT}`);
        console.log(`   GET  /api/finanzas          → Datos Finanzas (caché 24h)`);
        console.log(`   POST /api/finanzas/refresh   → Forzar actualización (requiere x-refresh-secret)`);
        console.log(`   GET  /api/noticias           → Noticias genéricas`);
        console.log(`   GET  /api/bmv-market         → Datos BMV en tiempo real`);
        console.log(`   GET  /api/banxico/:serie     → Proxy BANXICO SIE (sin CORS)`);
        console.log(`   GET  /api/gdelt              → Proxy GDELT (sin CORS, caché 6h)`);
        console.log(`   GET  /api/stock-history      → Proxy Yahoo Finance (velas OHLC)`);
        console.log(`   GET  /api/bond-yields        → Rendimientos de bonos globales`);
        console.log(`   GET  /api/mx-rates           → Curva de tasas México`);
        console.log(`   POST /api/chat               → VALL-AI (Gemini)`);
        console.log(`   POST /api/reports/generate   → Generar reporte con Gemini + Word + Email`);
        console.log(`   GET  /api/reports/types      → Tipos de reportes disponibles`);
        console.log(`   Orígenes CORS: ${allowedOrigins.join(', ')}\n`);
    });

    // ── Manejo elegante de errores del servidor ────────────────────────────────
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`\n  ❌ El puerto ${PORT} ya está en uso.`);
            console.error(`     Probablemente hay otra instancia del servidor corriendo.\n`);
            console.error(`     Para liberarlo, ejecuta en PowerShell:`);
            console.error(`       Get-Process node | Stop-Process -Force`);
            console.error(`     O define otro puerto:  $env:PORT=3002; npm run dev\n`);
            process.exit(1);
        }
        console.error('  ❌ Error del servidor:', err.message);
        process.exit(1);
    });

    // Cierre limpio con Ctrl+C para no dejar el puerto ocupado
    process.on('SIGINT', () => {
        console.log('\n  Cerrando servidor VALLNEWS…');
        server.close(() => process.exit(0));
    });
}

module.exports = app;
