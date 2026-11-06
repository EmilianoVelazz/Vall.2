'use strict';
const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
require('./lib/tls-trust').configureSystemTrust();

try {
    require('ssl-root-cas').inject();
    process.env._TLS_STRICT = '1';
    console.log('  [TLS] ssl-root-cas inyectado — verificación TLS completa.');
} catch {
    process.env._TLS_STRICT = '1';
    console.warn('  [TLS] ssl-root-cas no disponible; en Windows puede haber errores de CA intermedia.');
}

const express      = require('express');
const compression  = require('compression');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');
const { originPolicy, securityHeaders, mutationOriginGuard, safeErrorHandler } = require('./lib/request-security');
const { anonymousKey } = require('./lib/resource-limits');
const legacyRoutes = require('../shared/legacy-routes.json');


// ── 4. Routers ────────────────────────────────────────────────────────────────
const  { router: authRouter, sessionClaims }         = require('./routes/auth');
const finanzasRouter                              = require('./routes/finanzas');
const { router: marketRouter, initCommodityWarmer, startMarketExecutiveReportsScheduler, refreshMarketExecutiveReports } = require('./routes/market');
const externalRouter                              = require('./routes/external');
const mercolleidaRouter                           = require('./routes/mercolleida');
const chatRouter                                  = require('./routes/chat');
const exportRouter                                = require('./routes/export');
const { router: attachmentsRouter }               = require('./routes/attachments');

const app  = express();
const PORT = process.env.PORT || 3101;
const isAllowedOrigin = originPolicy();
app.disable('x-powered-by');
// Detrás de un proxy propio (Traefik en Dokploy) req.ip sería la IP del proxy y
// todos los visitantes compartirían el mismo límite. Indicar cuántos saltos
// son de confianza; sin la variable no se confía en X-Forwarded-For.
if (process.env.TRUST_PROXY) {
    const saltos = Number(process.env.TRUST_PROXY);
    app.set('trust proxy', Number.isInteger(saltos) ? saltos : process.env.TRUST_PROXY);
}
app.use(securityHeaders);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3001')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

app.use(compression());
app.use(cors({
    origin(origin, callback) {
        if (isAllowedOrigin(origin)) return callback(null, true);
        callback(Object.assign(new Error('Origen no permitido.'), { status: 403 }));
    },
    credentials: true,
    methods:      ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'x-refresh-secret', 'Authorization'],
}));

app.use(cookieParser());
app.use('/api', mutationOriginGuard(isAllowedOrigin));
// Exportación admite imágenes de gráficas; usa un límite propio antes del
// parser global pequeño que protege al resto de las rutas.
// ── Rate limiter (300 req/min por IP) ─────────────────────────────────────────
// Una sola carga de Finanzas dispara ~40-50 peticiones; Inicio ~17.
const apiLimiter = rateLimit({
    keyGenerator(req) {
        // Verificar la firma antes de separar cuentas que comparten una IP.
        // Un Authorization falsificado sigue usando el límite por IP.
        try { return `user:${sessionClaims(req).sub}`; }
        catch { return anonymousKey(req); }
    },
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
// Este router autentica el análisis de proteínas antes de leer su JSON y usa
// su propio parser acotado. No anteponerle el parser global sin autenticación.
app.use('/api', externalRouter);
// Los documentos tienen su propio límite antes del parser global pequeño.
app.use('/api', require('./routes/user-reports'));
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
    ...(ORIGEN_SPA ? { '/': '/', '/login': '/login' } : {}),
    '/inicio': '/inicio',
    '/informes': '/informes',
    '/finanzas': '/finanzas',
    '/mercados': '/mercados',
    '/mexico': '/mexico',
    '/noticias': '/noticias',
    '/mercado-proteinas': '/mercado-proteinas',
    '/configuracion': '/configuracion',
    '/orion': '/orion',
    '/vall-ai': '/orion',
    // Compartido con React para que los marcadores antiguos también funcionen
    // en producción. La sesión se valida en la SPA y en cada API privada.
    ...legacyRoutes,
};

// Sin ORIGEN_SPA la redirección es relativa: '/inicio' → '/inicio' sería un
// bucle infinito cuando este mismo servidor entrega la SPA (Docker/Dokploy).
Object.entries(RUTAS_SPA).filter(([desde, hacia]) => ORIGEN_SPA || desde !== hacia).forEach(([desde, hacia]) => {
    app.get(desde, (req, res) => {
        // Una redirección cacheada sobrevive a los cambios de enrutado y deja al
        // navegador yendo a una URL que ya no sirve.
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
        const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
        res.redirect(302, `${ORIGEN_SPA}${hacia}${query}`);
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

// En un contenedor (Dokploy) no hay plataforma que entregue dist/: lo sirve
// Express con las mismas cabeceras de caché que vercel.json. En Vercel y en
// desarrollo esto queda apagado.
const DIST_DIR = path.join(__dirname, '..', 'dist');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');
const SIRVE_SPA = !EN_DESARROLLO && !process.env.VERCEL && fs.existsSync(DIST_INDEX);
if (SIRVE_SPA) {
    app.use(express.static(DIST_DIR, {
        setHeaders: (res, filePath) => {
            const relativo = path.relative(DIST_DIR, filePath).split(path.sep).join('/');
            if (relativo.startsWith('vn-app/')) {
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            } else if (/\.(?:html|css|js)$/i.test(relativo)) {
                res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
            }
        },
    }));
}




// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: Math.floor(process.uptime()) });
});

// ── Routers ───────────────────────────────────────────────────────────────────
app.use('/api', authRouter);
app.use('/api', finanzasRouter);
app.use('/api', marketRouter);
app.use('/api', mercolleidaRouter);
const {router:mexicoReportsRouter}=require('./routes/mexico-reports');
const {mexicoReports}=require('./services/mexico-executive-reports');
app.use('/api',mexicoReportsRouter);
app.use('/api',require('./routes/report-history').createReportHistoryRouter());
app.use('/api',require('./routes/report-library'));

// Vercel invoca esta ruta dos veces al día. CRON_SECRET viaja automáticamente
// como Bearer token. Finanzas y México conservan cortes a las 06:00 y 14:00;
// Mercados sólo renueva su edición cuando vence el corte del viernes a las 14:00.
app.get([
    '/api/executive-reports/refresh',
    '/api/executive-reports/refresh/morning',
    '/api/executive-reports/refresh/afternoon',
], async (req, res) => {
    const expected = process.env.CRON_SECRET;
    const authorization = String(req.headers.authorization || '');
    if (!expected || authorization !== `Bearer ${expected}`) {
        return res.status(401).json({ success: false, error: 'No autorizado.' });
    }
    try {
        const [finanzas, mercados, mexico] = await Promise.all([
            finanzasRouter.refreshExecutiveReports(),
            refreshMarketExecutiveReports(),
            mexicoReports.refresh(),
        ]);
        // Las ediciones que el usuario pidió “en cada corte” salen después de
        // preparar los cortes que corresponden a cada colección.
        // Esperar el envío antes de responder: Vercel puede suspender el trabajo
        // pendiente cuando finaliza la petición del cron.
        await exportRouter.runScheduledReportEmails?.().catch(error => {
            console.warn('[report-email-schedules] No se procesaron los envíos tras el corte:', error.message);
        });
        const forecastReview=await require('./ml/forecast-review-job').runForecastReview().catch(()=>({checked:0,failed:1,status:'unavailable'}));
        res.json({
            success: true,
            generatedAt: new Date().toISOString(),
            reports: { finanzas: finanzas.reports.length, mercados: mercados.reports.length, mexico:mexico.reports.length },
            forecastReview,
        });
    } catch (error) {
        console.error('/api/executive-reports/refresh:', error.message);
        res.status(502).json({ success: false, error: 'No se pudieron actualizar los informes programados.' });
    }
});

// Corte semanal de los complementos estatales: Vercel lo invoca los domingos
// a las 17:00 UTC, equivalentes a las 11:00 de Ciudad de México.
app.get('/api/livestock-prices/refresh', async (req, res) => {
    const expected = process.env.CRON_SECRET;
    const authorization = String(req.headers.authorization || '');
    if (!expected || authorization !== `Bearer ${expected}`) {
        return res.status(401).json({ success: false, error: 'No autorizado.' });
    }
    try {
        const { getWeeklyStateLivestockPrices } = require('./lib/weekly-state-livestock-service');
        const data = await getWeeklyStateLivestockPrices({ force: true });
        res.json({ success: true, retrievedAt: data.retrievedAt, expiresAt: data.expiresAt });
    } catch (error) {
        console.error('/api/livestock-prices/refresh:', error.message);
        res.status(502).json({ success: false, error: 'No se pudo actualizar el corte pecuario semanal.' });
    }
});

// ── Fallback de la SPA ────────────────────────────────────────────────────────
// React Router resuelve las rutas en el navegador; /api conserva su 404.
if (SIRVE_SPA) {
    app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
        res.set('Cache-Control', 'public, max-age=0, must-revalidate');
        res.sendFile(DIST_INDEX);
    });
}

// ── Error handler global ──────────────────────────────────────────────────────
 
app.use(safeErrorHandler);

// ── Commodity warmer ──────────────────────────────────────────────────────────
// Pasa true si server.js se ejecuta directamente (no como módulo serverless)
initCommodityWarmer(require.main === module);

// ── SNIIM warmer ──────────────────────────────────────────────────────────────
if (require.main === module) {
    finanzasRouter.startExecutiveReportsScheduler?.();
    startMarketExecutiveReportsScheduler?.();
    require('./lib/report-schedule').scheduleDailyReport(()=>mexicoReports.refresh(),'mexico-reports');
    require('./lib/report-schedule').scheduleDailyReport(()=>require('./ml/forecast-review-job').runForecastReview(),'orion-forecast-review');
    const { initSNIIMWarmer } = require('./lib/sniim-service');
    initSNIIMWarmer();
    const { initProteinSourceIngestion } = require('./lib/protein-source-ingestion');
    initProteinSourceIngestion(true);
    const { initGeminiWholesalePriceWarmer } = require('./lib/gemini-wholesale-price-service');
    initGeminiWholesalePriceWarmer();
    const { initWeeklyStateLivestockWarmer } = require('./lib/weekly-state-livestock-service');
    initWeeklyStateLivestockWarmer();
}

// ── Proyecto Loopus · aprendizaje continuo y control de integridad ────────────
if (require.main === module) {
    try {
        const brainWorker = require('./ai/brain-worker');
        brainWorker.startWorker(); // Inicia el ciclo de aprendizaje autónomo
    } catch (e) {
        console.warn('  [Loopus] No se pudo iniciar el worker supervisado:', e.message);
    }
    try {
        const mlWorker = require('./ai/ml-unsupervised');
        mlWorker.startMLWorker(6); // Inicia el pipeline no supervisado (cada 6h)
    } catch (e) {
        console.warn('  [Loopus] No se pudo iniciar el motor no supervisado:', e.message);
    }
}

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
        console.log(`   POST /api/chat               → ORION (Gemini)`);
        console.log(`   POST /api/ai-rich            → Respuesta estructurada ORION`);
        console.log(`   POST /api/ai-insight-stream  → Streaming SSE compatible/rico`);
        console.log(`   Orígenes CORS: ${allowedOrigins.join(', ')}\n`);
    });
    server.headersTimeout = 10000;
    server.requestTimeout = 30000;
    server.keepAliveTimeout = 5000;
    server.maxRequestsPerSocket = 1000;
}

module.exports = app;
