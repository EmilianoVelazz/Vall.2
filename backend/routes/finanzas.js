'use strict';
const express = require('express');
const fs      = require('fs');
const path    = require('path');

const { genAI }     = require('../lib/gemini');
const { CACHE_DIR } = require('../lib/config');
const {
    generarDatosFinanzas,
    buildFallbackData,
    generateNoticias,
    generateScenarios,
} = require('../core/finanzas.service');

const router = express.Router();

const CACHE_FILE         = path.join(CACHE_DIR, 'finanzas.json');
const CACHE_TTL          =  6 * 60 * 60 * 1000; //  6 h
const FALLBACK_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 h (tras error Gemini — evita spam de cuota)

function sanitizeParam(str, maxLen = 60) {
    if (typeof str !== 'string') return '';
    return str.replace(/[^\p{L}\p{N}\s.,\-()]/gu, '').slice(0, maxLen).trim();
}

// ── Rutas ─────────────────────────────────────────────────────────────────────

router.get('/noticias', async (req, res) => {
    const categoria = sanitizeParam(req.query.categoria) || 'economía global';
    const region    = sanitizeParam(req.query.region)    || 'global';

    if (!categoria || !region)
        return res.status(400).json({ success: false, error: 'Parámetros inválidos.' });
    if (!genAI)
        return res.status(503).json({ success: false, error: 'IA no configurada.' });

    try {
        const data = await generateNoticias(categoria, region);
        res.json({ success: true, data });
    } catch (err) {
        console.error(' /api/noticias:', err.message);
        res.status(500).json({ success: false, error: 'Error al generar noticias.' });
    }
});

router.get('/finanzas', async (req, res) => {
    if (fs.existsSync(CACHE_FILE)) {
        try {
            const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            const edad  = Date.now() - cache.timestamp;
            const ttl   = cache.fallback ? FALLBACK_CACHE_TTL : CACHE_TTL;
            if (edad < ttl) {
                const horasRestantes = ((ttl - edad) / 3600000).toFixed(1);
                console.log(` Sirviendo desde caché${cache.fallback ? ' (fallback)' : ''} (expira en ${horasRestantes}h)`);
                return res.json({ success: true, data: cache.data, desde_cache: true });
            }
        } catch { /* caché corrupta, regenerar */ }
    }

    console.log('Generando datos frescos con Gemini...');
    try {
        const data = await generarDatosFinanzas();
        fs.writeFileSync(CACHE_FILE, JSON.stringify({ timestamp: Date.now(), data }, null, 2));
        console.log(' Datos generados y guardados en caché');
        res.json({ success: true, data, desde_cache: false });
    } catch (err) {
        const is429 = err.message?.includes('429');
        const kind  = is429                              ? '429-cuota'
                    : err.message?.includes('timeout')  ? 'timeout'
                    : err.message?.includes('JSON')     ? 'parse-error'
                    : 'desconocido';
        console.error(`Error Gemini /api/finanzas [${kind}]:`, err.message.slice(0, 220));

        let fallbackData = null;
        if (fs.existsSync(CACHE_FILE)) {
            try {
                const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
                fallbackData = cache.data;
                console.log(' Usando caché anterior como fallback');
            } catch { /* caché corrupta */ }
        }

        if (!fallbackData) {
            fallbackData = buildFallbackData();
            console.warn('[Gemini] No disponible — sirviendo datos de respaldo contextuales');
        }

        if (is429) {
            try {
                fs.writeFileSync(CACHE_FILE, JSON.stringify({ timestamp: Date.now(), data: fallbackData, fallback: true }, null, 2));
                console.log('[Gemini] Fallback guardado en caché por 12h (cuota agotada)');
            } catch { /* no crítico */ }
        }

        res.json({ success: true, data: fallbackData, desde_cache: false, fallback: true });
    }
});

router.post('/finanzas/refresh', (req, res, next) => {
    const secret = process.env.REFRESH_SECRET;
    if (!secret) return res.status(503).json({ success: false, error: 'Refresh no configurado en el servidor.' });
    const provided = req.headers['x-refresh-secret'];
    if (!provided || provided !== secret)
        return res.status(401).json({ success: false, error: 'No autorizado.' });
    next();
}, async (req, res) => {
    if (fs.existsSync(CACHE_FILE)) {
        try { fs.unlinkSync(CACHE_FILE); } catch (err) {
            console.error('Error eliminando caché:', err.message);
        }
    }
    res.redirect(303, '/api/finanzas');
});

// ── Escenarios Bull/Base/Bear con Gemini AI ───────────────────────────────────
// Cachea por 4 h en memoria, clave = TIIE+FED redondeados a cuartos
const _scenariosCache = new Map();
const SCENARIOS_TTL   = 4 * 60 * 60 * 1000;

router.get('/scenarios', async (req, res) => {
    if (!genAI) return res.status(503).json({ success: false, error: 'IA no configurada.' });

    const tiie   = parseFloat(req.query.tiie)   || 9.0;
    const fed    = parseFloat(req.query.fed)    || 4.5;
    const usdmxn = parseFloat(req.query.usdmxn) || 17.2;
    const vix    = parseFloat(req.query.vix)    || 18;
    const wti    = parseFloat(req.query.wti)    || 72;

    const cacheKey = `${Math.round(tiie * 4) / 4}_${Math.round(fed * 4) / 4}`;
    const hit = _scenariosCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < SCENARIOS_TTL)
        return res.json({ success: true, data: hit.data, desde_cache: true });

    try {
        const data = await generateScenarios({ tiie, fed, usdmxn, vix, wti });
        _scenariosCache.set(cacheKey, { ts: Date.now(), data });
        res.json({ success: true, data, desde_cache: false });
    } catch (err) {
        console.error('/api/scenarios error:', err.message);
        if (err.message?.includes('429') || err.message?.includes('quota'))
            return res.status(429).json({ success: false, error: 'Cuota de API agotada. Intenta más tarde.' });
        res.status(500).json({ success: false, error: 'Error al generar escenarios.' });
    }
});

module.exports = router;
