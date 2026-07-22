'use strict';

// ── 1. Variables de entorno (debe ir PRIMERO, antes de cualquier require de lib/) ──
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

// ── 2. Fix TLS en Windows ──────────────────────────────────────────────────────
// ssl-root-cas inyecta el bundle completo de CAs de Mozilla en el agente HTTPS
// global de Node.js, resolviendo UNABLE_TO_GET_ISSUER_CERT_LOCALLY en Windows.
// En Vercel (Linux) este paquete no hace nada extra; el bundle del sistema ya es correcto.
// Si el paquete no está instalado, lib/http.js usa rejectUnauthorized:false como fallback.
try {
    require('ssl-root-cas').inject();
    process.env._TLS_STRICT = '1';
    console.log('  [TLS] ssl-root-cas inyectado — verificación TLS completa.');
} catch {
    process.env._TLS_STRICT = '0';
    console.warn('  [TLS] ssl-root-cas no disponible; en Windows puede haber errores de CA intermedia.');
}

// ── 3. Dependencias ───────────────────────────────────────────────────────────
const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');
const jwt          = require('jsonwebtoken');


// ── 4. Routers ────────────────────────────────────────────────────────────────
const { router: authRouter }                      = require('./routes/auth');
const finanzasRouter                              = require('./routes/finanzas');
const { router: marketRouter, initCommodityWarmer } = require('./routes/market');
const externalRouter                              = require('./routes/external');
const chatRouter                                  = require('./routes/chat');

// ── 5. App ────────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3001')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
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

// Compatibilidad con enlaces guardados por versiones anteriores del frontend.
// Debe declararse antes de express.static para evitar un 404 persistente.
app.get('/finanzas/inicio.html', (req, res) => res.redirect(302, '/inicio.html'));

// Toda navegación al nombre histórico pasa por una URL versionada. Esto evita
// que una pestaña restaurada por el navegador conserve el DOM anterior.
app.get('/finanzas/finanzas.html', (req, res, next) => {
    if (req.query.ui === '31') return next();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.redirect(302, '/finanzas/finanzas.html?ui=31');
});

// Rutas limpias equivalentes a las redirecciones de Vercel. Express local no
// interpreta vercel.json, por lo que deben declararse también aquí.
const LOCAL_PAGE_ROUTES = {
    '/inicio': '/inicio.html',
    '/finanzas': '/finanzas/finanzas.html',
    '/mercados': '/mercados/mercados.html',
    '/geopolitica': '/geopolitica/geopolitica.html',
    '/mexico': '/mexico/mexico.html',
    '/mercado-proteinas': '/mercado_proteinas/mercadoproteinas.html',
    '/configuracion': '/configuracion/configuracion.html',
};
Object.entries(LOCAL_PAGE_ROUTES).forEach(([route, target]) => {
    app.get(route, (req, res) => {
        // Las redirecciones también pueden quedar almacenadas por el navegador.
        // Finanzas usa una versión explícita para que cada rediseño abra el HTML nuevo.
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
        const destination = route === '/finanzas' ? `${target}?ui=31` : target;
        res.redirect(302, destination);
    });
});

// Durante desarrollo, nunca reutilizar HTML/CSS/JS anteriores. Esto evita que
// el navegador mantenga una versión visual vieja después de un rediseño.
app.use((req, res, next) => {
    if (/\.(?:html|css|js)$/i.test(req.path)) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
    next();
});

// ── Middleware: auth guard para páginas HTML protegidas ───────────────────────
// Solo aplica en Express local (desarrollo). En Vercel los estáticos van por CDN.
// Protege GET de archivos .html específicos sin tocar ninguna ruta /api/*.

const _JWT_SECRET_STATIC = process.env.JWT_SECRET || 'cambia_este_secreto_jwt_ahora';

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
app.use(express.static(path.join(__dirname, '..')));


// ── Rate limiter (300 req/min por IP) ─────────────────────────────────────────
// Una sola carga de finanzas.html dispara ~40-50 peticiones; inicio.html ~17
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiadas peticiones. Intenta en un momento.' },
});
app.use('/api', apiLimiter);

// ── Routers ───────────────────────────────────────────────────────────────────
app.use('/api', authRouter);
app.use('/api', finanzasRouter);
app.use('/api', marketRouter);
app.use('/api', externalRouter);
app.use('/api', chatRouter);

// ── Error handler global ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('Unhandled Express error:', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message || 'Error interno del servidor' });
});

// ── Commodity warmer ──────────────────────────────────────────────────────────
// Pasa true si server.js se ejecuta directamente (no como módulo serverless)
initCommodityWarmer(require.main === module);

// ── Inicio del servidor ───────────────────────────────────────────────────────
if (require.main === module) {
    app.listen(PORT, () => {
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
        console.log(`   Orígenes CORS: ${allowedOrigins.join(', ')}\n`);
    });
}

module.exports = app;
