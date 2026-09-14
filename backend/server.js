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
const compression  = require('compression');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');
const jwt          = require('jsonwebtoken');


// ── 4. Routers ────────────────────────────────────────────────────────────────
const  { router: authRouter }                      = require('./routes/auth');
const finanzasRouter                              = require('./routes/finanzas');
const { router: marketRouter, initCommodityWarmer, startMarketExecutiveReportsScheduler, refreshMarketExecutiveReports } = require('./routes/market');
const externalRouter                              = require('./routes/external');
const mercolleidaRouter                           = require('./routes/mercolleida');
const chatRouter                                  = require('./routes/chat');
const exportRouter                                = require('./routes/export');
const { router: attachmentsRouter }               = require('./routes/attachments');

const app  = express();
const PORT = process.env.PORT || 3101;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3001')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

app.use(compression());
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

app.use('/api', exportRouter);
// Los adjuntos multimodales usan su propio límite y se conservan solo 30 minutos.
app.use('/api', attachmentsRouter);
// Chat usa un parser propio de 128 KB para historial y contexto. Debe montarse
// antes del parser global de 10 KB sin ampliar el resto de la API.
app.use('/api', chatRouter);
app.use(express.json({ limit: '10kb' }));

// ── Puentes hacia la SPA ──────────────────────────────────────────────────────
//
// Estas rutas redirigían a los .html de pages/, que desaparecieron al terminar
// la migración a React. Sin este puente, abrir /finanzas en este servidor daba
// "Cannot GET /pages/finanzas.html", y lo mismo cualquier enlace guardado.
//
// En desarrollo la app de React NO la sirve Express, sino Vite en su propio
// puerto (5273 por defecto; scripts/dev.mjs manda el real en SPA_ORIGIN), así
// que hay que mandar al usuario allí. En producción no se llega hasta aquí:
// vercel.json solo enruta /api a esta aplicación y el resto lo resuelve el
// index.html del bundle, de modo que ORIGEN_SPA queda vacío y la redirección
// es relativa.
const EN_DESARROLLO = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
const ORIGEN_SPA = process.env.SPA_ORIGIN || (EN_DESARROLLO ? 'http://localhost:5273' : '');

const RUTAS_SPA = {
    '/inicio': '/inicio',
    '/finanzas': '/finanzas',
    '/mercados': '/mercados',
    '/geopolitica': '/geopolitica',
    '/mexico': '/mexico',
    '/mercado-proteinas': '/mercado-proteinas',
    '/configuracion': '/configuracion',
    '/vall-ai': '/vall-ai',
    // Enlaces antiguos: los .html ya no existen, pero siguen en marcadores, en
    // la navegación de inicio.html y en enlaces compartidos.
    '/pages/finanzas.html': '/finanzas',
    '/pages/mercados.html': '/mercados',
    '/pages/geopolitica.html': '/geopolitica',
    '/pages/mexico.html': '/mexico',
    '/pages/mercadoproteinas.html': '/mercado-proteinas',
    '/pages/configuracion.html': '/configuracion',
    '/pages/vall-ai.html': '/vall-ai',
    '/finanzas/finanzas.html': '/finanzas',
    '/finanzas/inicio.html': '/inicio',
};

Object.entries(RUTAS_SPA).forEach(([desde, hacia]) => {
    app.get(desde, (req, res) => {
        // Una redirección cacheada sobrevive a los cambios de enrutado y deja al
        // navegador yendo a una URL que ya no sirve.
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.redirect(302, `${ORIGEN_SPA}${hacia}`);
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

// El process.exit condicional anterior solo corría al ejecutar este archivo
// directamente. Cargado como módulo desde api/index.js (Vercel) no se aplicaba,
// y el servidor arrancaba igual sin secreto. Lanzar aborta en ambos casos.
const _JWT_SECRET_STATIC = process.env.JWT_SECRET;
if (!_JWT_SECRET_STATIC) {
    throw new Error('JWT_SECRET no está configurado en backend/.env — el servidor no puede arrancar de forma segura.');
}

// Nombres exactos de páginas protegidas
// Solo queda inicio.html: las demás páginas se migraron a React y sus URLs se
// redirigen a la SPA más arriba, antes de llegar a este guard. Allí la sesión la
// vigila ProtectedRoute, y las rutas /api siguen protegidas por verifyToken.
const PROTECTED_PAGES = new Set([
    '/inicio.html',
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

// En desarrollo Vite reenvía /assets al backend. Limitar el directorio expuesto
// evita publicar por accidente el código del servidor, documentación y cachés.
app.use('/assets', express.static(path.join(__dirname, '..', 'assets'), {
    setHeaders: (res, pathPath) => {
        if (pathPath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));




// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: Math.floor(process.uptime()) });
});

// ── Routers ───────────────────────────────────────────────────────────────────
app.use('/api', authRouter);
app.use('/api', finanzasRouter);
app.use('/api', marketRouter);
app.use('/api', externalRouter);
app.use('/api', mercolleidaRouter);

// Vercel invoca esta ruta cada día. CRON_SECRET viaja automáticamente como
// Bearer token y ambos grupos comparten el mismo corte horario de las 09:00
// America/Mexico_City (15:00 UTC en la configuración actual).
app.get('/api/executive-reports/refresh', async (req, res) => {
    const expected = process.env.CRON_SECRET;
    const authorization = String(req.headers.authorization || '');
    if (!expected || authorization !== `Bearer ${expected}`) {
        return res.status(401).json({ success: false, error: 'No autorizado.' });
    }
    try {
        const [finanzas, mercados] = await Promise.all([
            finanzasRouter.refreshExecutiveReports(),
            refreshMarketExecutiveReports(),
        ]);
        res.json({
            success: true,
            generatedAt: new Date().toISOString(),
            reports: { finanzas: finanzas.reports.length, mercados: mercados.reports.length },
        });
    } catch (error) {
        console.error('/api/executive-reports/refresh:', error.message);
        res.status(502).json({ success: false, error: 'No se pudieron actualizar los informes programados.' });
    }
});

// ── Error handler global ──────────────────────────────────────────────────────
 
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

// ── SNIIM warmer ──────────────────────────────────────────────────────────────
if (require.main === module) {
    finanzasRouter.startExecutiveReportsScheduler?.();
    startMarketExecutiveReportsScheduler?.();
    const { initSNIIMWarmer } = require('./lib/sniim-service');
    initSNIIMWarmer();
    const { initGeminiWholesalePriceWarmer } = require('./lib/gemini-wholesale-price-service');
    initGeminiWholesalePriceWarmer();
}

// ── Cerebro Autodidacta y VALL-ML (Workers) ───────────────────────────────────
if (require.main === module) {
    try {
        const brainWorker = require('./ai/brain-worker');
        brainWorker.startWorker(); // Inicia el ciclo de aprendizaje autónomo
    } catch (e) {
        console.warn('  [Cerebro] No se pudo iniciar el worker supervisado:', e.message);
    }
    try {
        const mlWorker = require('./ai/ml-unsupervised');
        mlWorker.startMLWorker(6); // Inicia el pipeline no supervisado (cada 6h)
    } catch (e) {
        console.warn('  [VALL-ML] No se pudo iniciar el motor no supervisado:', e.message);
    }
}

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
