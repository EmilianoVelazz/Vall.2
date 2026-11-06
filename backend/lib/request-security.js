'use strict';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originPolicy(env = process.env) {
    const development = env.NODE_ENV !== 'production' && !env.VERCEL;
    const origins = new Set((env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
    for (const origin of [env.PRODUCTION_URL, env.SPA_ORIGIN,
        env.VERCEL_URL && `https://${env.VERCEL_URL}`,
        env.VERCEL_BRANCH_URL && `https://${env.VERCEL_BRANCH_URL}`,
        env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`]) {
        if (origin) origins.add(origin.replace(/\/$/, ''));
    }
    return origin => !origin || origins.has(origin)
        || (development && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
}

function securityHeaders(req, res, next) {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    });
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        res.set('Strict-Transport-Security', 'max-age=31536000');
    }
    next();
}

function mutationOriginGuard(isAllowed) {
    return (req, res, next) => {
        if (SAFE_METHODS.has(req.method)) return next();
        const origin = req.get('Origin');
        if ((origin && !isAllowed(origin))
            || (!origin && req.cookies?.vn_token && req.get('Sec-Fetch-Site') === 'cross-site')) {
            return res.status(403).json({ success: false, error: 'Origen no permitido.' });
        }
        next();
    };
}

function safeErrorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);
    let status = Number(err.status || err.statusCode);
    if (!Number.isInteger(status) || status < 400 || status > 599) status = 500;
    let message = 'Error interno del servidor.';
    if (status === 413) message = 'La solicitud es demasiado grande. Reduce el tamaño de los archivos.';
    else if (status === 403) message = 'Origen no permitido.';
    else if (status < 500) message = 'Solicitud inválida.';
    // No enviar detalles SQL, rutas locales ni mensajes de proveedores al cliente.
    if (status >= 500) console.error('[api] Fallo interno:', err.code || err.name || 'Error');
    res.status(status).json({ success: false, error: message });
}

module.exports = { originPolicy, securityHeaders, mutationOriginGuard, safeErrorHandler };
