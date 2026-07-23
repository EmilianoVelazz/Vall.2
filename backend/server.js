'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

try {
    require('ssl-root-cas').inject();
    process.env._TLS_STRICT = '1';
    console.log('  [TLS] ssl-root-cas inyectado — verificación TLS completa.');
} catch {
    process.env._TLS_STRICT = '0';
    console.warn('  [TLS] ssl-root-cas no disponible; en Windows puede haber errores de CA intermedia.');
}

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
const exportRouter                                = require('./routes/export');
const { router: attachmentsRouter }               = require('./routes/attachments');

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
// Exportación admite imágenes de gráficas; usa un límite propio antes del
// parser global pequeño que protege al resto de las rutas.
app.use('/api', exportRouter);
// Los adjuntos multimodales usan su propio límite y se conservan solo 30 minutos.
app.use('/api', attachmentsRouter);
// Chat usa un parser propio de 128 KB para historial y contexto. Debe montarse
// antes del parser global de 10 KB sin ampliar el resto de la API.
app.use('/api', chatRouter);
app.use(express.json({ limit: '10kb' }));

// Compatibilidad con enlaces guardados por versiones anteriores del frontend.
// Debe declararse antes de express.static para evitar un 404 persistente.
app.get('/finanzas/inicio.html', (req, res) => res.redirect(302, '/inicio.html'));

// Toda navegación al nombre histórico pasa por una URL versionada. Esto evita
// que una pestaña restaurada por el navegador conserve el DOM anterior.
app.get('/finanzas/finanzas.html', (req, res, next) => {
    if (req.query.ui === '31') return next();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.redirect(302, '/pages/finanzas.html?ui=31');
});

app.get('/pages/finanzas.html', (req, res, next) => {
    if (req.query.ui === '31') return next();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.redirect(302, '/pages/finanzas.html?ui=31');
});

// Rutas limpias equivalentes a las redirecciones de Vercel. Express local no
// interpreta vercel.json, por lo que deben declararse también aquí.
const LOCAL_PAGE_ROUTES = {
    '/inicio': '/inicio.html',
    '/finanzas': '/pages/finanzas.html',
    '/mercados': '/pages/mercados.html',
    '/geopolitica': '/pages/geopolitica.html',
    '/mexico': '/pages/mexico.html',
    '/mercado-proteinas': '/pages/mercadoproteinas.html',
    '/configuracion': '/pages/configuracion.html',
    '/vall-ai': '/pages/vall-ai.html',
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

const _JWT_SECRET_STATIC = process.env.JWT_SECRET;
if (!_JWT_SECRET_STATIC) {
    console.error('  [FATAL] JWT_SECRET no está configurado en backend/.env — el servidor no puede arrancar de forma segura.');
    if (require.main === module) process.exit(1);
}

// Nombres exactos de páginas protegidas
const PROTECTED_PAGES = new Set([
    '/inicio.html',
    '/pages/finanzas.html',
    '/pages/mercados.html',
    '/pages/geopolitica.html',
    '/pages/mexico.html',
    '/pages/mercadoproteinas.html',
    '/pages/configuracion.html',
    '/pages/vall-ai.html',
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
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiadas peticiones. Intenta en un momento.' },
});
app.use('/api', apiLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: Math.floor(process.uptime()) });
});

// ── Routers ───────────────────────────────────────────────────────────────────
app.use('/api', authRouter);
app.use('/api', finanzasRouter);
app.use('/api', marketRouter);
app.use('/api', externalRouter);

// ── Error handler global ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('Unhandled Express error:', err.message);
    if (err.type === 'entity.too.large' || err.status === 413) {
        return res.status(413).json({ success: false, error: 'La solicitud es demasiado grande. Reduce el número o tamaño de los archivos e intenta nuevamente.' });
    }
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
        console.log(`   POST /api/ai-rich            → Respuesta estructurada VALL-AI`);
        console.log(`   POST /api/ai-insight-stream  → Streaming SSE compatible/rico`);
        console.log(`   Orígenes CORS: ${allowedOrigins.join(', ')}\n`);
    });
}

module.exports = app;
