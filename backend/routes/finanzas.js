'use strict';
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const http    = require('http');

const { genAI, MODEL } = require('../lib/gemini');
const { CACHE_DIR }    = require('../lib/config');
const { externalGet }  = require('../lib/http');

const router = express.Router();

let _finanzasCache       = null;
const CACHE_TTL          =  6 * 60 * 60 * 1000; //  6 h
const FALLBACK_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 h (tras error Gemini — evita spam de cuota)

function sanitizeParam(str, maxLen = 60) {
    if (typeof str !== 'string') return '';
    return str.replace(/[^\p{L}\p{N}\s.,\-()]/gu, '').slice(0, maxLen).trim();
}

// ── Generador de datos financieros con Gemini ─────────────────────────────────

async function generarDatosFinanzas() {
    if (!genAI) throw new Error('GEMINI_API_KEY no configurada');
    const model = genAI.getGenerativeModel({ model: MODEL });

    const ahora    = new Date();
    const fechaStr = ahora.toLocaleDateString('es-MX', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const horaStr = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    const prompt = `
Eres un analista financiero senior de VALLNEWS. Hoy es ${fechaStr}, ${horaStr} (hora CDMX).

Genera datos financieros realistas para la sección Finanzas de un portal de inteligencia económica mexicana especializado en el sector agropecuario y empresarial.

Devuelve ÚNICAMENTE el siguiente JSON (sin bloques de código, sin comillas extra, sin texto antes o después):

{
  "generado": "${horaStr} · ${ahora.toLocaleDateString('es-MX', {day:'2-digit', month:'short', year:'numeric'}).toUpperCase()}",
  "noticias": [
    {
      "categoria": "Política Monetaria",
      "fecha": "DD MES AAAA · HH:MM",
      "titulo": "Título noticia 1 (real, relevante, profesional)",
      "descripcion": "Descripción de 2 oraciones máximo. Concreta y con datos.",
      "fuente": "BLOOMBERG",
      "impacto": "alto",
      "ia_insight": "Impacto directo en costos o márgenes del sector agropecuario o empresarial. Máx 15 palabras."
    },
    {
      "categoria": "Mercados Globales",
      "fecha": "DD MES AAAA · HH:MM",
      "titulo": "Título noticia 2",
      "descripcion": "Descripción corta.",
      "fuente": "REUTERS",
      "impacto": "medio",
      "ia_insight": "Insight breve."
    },
    {
      "categoria": "Divisas y Commodities",
      "fecha": "DD MES AAAA · HH:MM",
      "titulo": "Título noticia 3",
      "descripcion": "Descripción corta.",
      "fuente": "EL ECONOMISTA",
      "impacto": "bajo",
      "ia_insight": "Insight breve."
    }
  ],
  "bancos_centrales": {
    "banxico": 11.0,
    "fed": 5.25,
    "bce": 4.25,
    "boe": 5.25,
    "boj": 0.1
  },
  "mercados": {
    "nasdaq": { "valor": 18450.5, "cambio_pct": 0.85 },
    "usdmxn": { "valor": 17.15, "cambio_pct": -0.22 }
  },
  "tiie": 11.25,
  "vai": {
    "asset": "BONOS 10Y MX",
    "prediccion": 72,
    "veredicto": "Bajista",
    "alerta": "Diferencial de tasas MX-US presiona rendimientos reales."
  }
}

Reglas:
- banxico entre 10.5 y 11.5, fed entre 4.75 y 5.5, bce entre 3.75 y 4.5, boe entre 4.75 y 5.5, boj entre 0 y 0.25
- nasdaq entre 17000 y 20000, usdmxn entre 16.5 y 18.0
- tiie siempre 0.25 puntos por encima de banxico
- impacto solo puede ser: "alto", "medio" o "bajo"
- prediccion entre 45 y 92 (entero)
- veredicto: "Alcista", "Bajista" o "Neutral"
- fuente: una de BLOOMBERG / REUTERS / WSJ / EL ECONOMISTA / BANXICO / INEGI / FMI / FORBES
- Los titulos deben sonar como noticias reales del día de hoy
- No incluyas comentarios, solo JSON puro
`;

    const result  = await model.generateContent(prompt);
    const raw     = result.response.text().trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Gemini no devolvió JSON válido');
        return JSON.parse(jsonMatch[0]);
    }
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
        const model  = genAI.getGenerativeModel({ model: MODEL });
        const prompt = `
Actúa como periodista económico. Genera las 5 noticias más importantes sobre ${categoria} en ${region}.
Usa fuentes serias: Bloomberg, Reuters, Financial Times, El Economista.
Devuelve un JSON array sin texto adicional fuera del JSON:
[{ "titulo": "...", "resumen": "...", "fuente": "...", "impacto": "Alto|Medio|Bajo" }]`;
        const result  = await model.generateContent(prompt);
        const raw     = result.response.text().trim();
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        let data;
        try {
            data = JSON.parse(cleaned);
        } catch {
            const match = cleaned.match(/\[[\s\S]*\]/);
            if (!match) throw new Error('No se encontró JSON en respuesta');
            data = JSON.parse(match[0]);
        }
        res.json({ success: true, data });
    } catch (err) {
        console.error(' /api/noticias:', err.message);
        res.status(500).json({ success: false, error: 'Error al generar noticias.' });
    }
});

router.get('/finanzas', async (req, res) => {
    if (_finanzasCache) {
        try {
            const cache = _finanzasCache;
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
        _finanzasCache = { timestamp: Date.now(), data };
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
        if (_finanzasCache) {
            try {
                fallbackData = _finanzasCache.data;
                console.log(' Usando caché anterior como fallback');
            } catch { /* caché corrupta */ }
        }

        if (!fallbackData) {
            const ahora = new Date();
            const hora  = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
            const fecha = ahora.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
            fallbackData = {
                generado: `${hora} · ${fecha}`,
                noticias: [
                    { categoria: 'Política Monetaria', fecha: `${fecha} · ${hora}`, titulo: 'Banxico recorta TIIE a 8.50% ante desaceleración inflacionaria', descripcion: 'El Banco de México continuó con su ciclo de relajamiento monetario, reduciendo la tasa de referencia ante señales de moderación en la inflación y un entorno externo más favorable.', fuente: 'BANXICO', impacto: 'alto', ia_insight: 'Recorte favorece crédito empresarial y costos de financiamiento.' },
                    { categoria: 'Mercados Globales', fecha: `${fecha} · ${hora}`, titulo: 'S&P 500 supera 7,300 puntos impulsado por tecnología y resiliencia económica', descripcion: 'Los mercados de renta variable en Estados Unidos mantienen tendencia alcista apoyados en resultados corporativos sólidos y expectativas de recortes adicionales de la Fed en el segundo semestre.', fuente: 'REUTERS', impacto: 'medio', ia_insight: 'Mercados globales en modo expansivo favorecen flujos a emergentes.' },
                    { categoria: 'Divisas y Commodities', fecha: `${fecha} · ${hora}`, titulo: 'Peso mexicano cotiza en $17.50 ante flujos de nearshoring e IED', descripcion: 'El tipo de cambio USD/MXN se mantiene en rangos relativamente estables respaldado por el diferencial de tasas México-EU, remesas en máximos históricos e inversión extranjera directa por nearshoring.', fuente: 'BANXICO', impacto: 'medio', ia_insight: 'Nearshoring sostiene demanda estructural de pesos mexicanos.' },
                    { categoria: 'Commodities', fecha: `${fecha} · ${hora}`, titulo: 'Oro alcanza máximos históricos por encima de $4,100 dólares por onza', descripcion: 'El metal precioso mantiene su rally impulsado por la demanda de bancos centrales, tensiones geopolíticas y expectativas de política monetaria más laxa en los países desarrollados.', fuente: 'BLOOMBERG', impacto: 'medio', ia_insight: 'Oro como cobertura ante volatilidad global favorece activos alternativos.' },
                    { categoria: 'Economía México', fecha: `${fecha} · ${hora}`, titulo: 'Remesas a México acumulan cifra récord en el año', descripcion: 'Los envíos de dinero de mexicanos en el exterior continúan en niveles históricos, aportando divisas que fortalecen la cuenta corriente y la estabilidad del tipo de cambio.', fuente: 'BANXICO', impacto: 'bajo', ia_insight: 'Flujo de remesas reduce presión sobre reservas internacionales.' },
                ],
                bancos_centrales: { banxico: 8.50, fed: 4.50, bce: 2.65, boe: 4.50, boj: 0.50 },
                mercados: { nasdaq: { valor: 21800, cambio_pct: 0.6 }, usdmxn: { valor: 17.50, cambio_pct: -0.1 } },
                tiie: 8.50,
                vai: { asset: 'BONOS 10Y MX', prediccion: 62, veredicto: 'Neutral', alerta: 'Monitorear diferencial de tasas MX-EU y próximas decisiones de Banxico.' },
            };
            console.warn('[Gemini] No disponible — sirviendo datos de respaldo contextuales');
        }

        if (is429) {
            try {
                _finanzasCache = { timestamp: Date.now(), data: fallbackData, fallback: true };
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
    _finanzasCache = null;
    res.redirect(303, '/api/finanzas');
});

// ── Escenarios Bull/Base/Bear con Gemini AI ───────────────────────────────────
// Cachea por 4 h en memoria, clave = TIIE+FED redondeados a cuartos
const _scenariosCache = new Map();
const SCENARIOS_TTL   = 4 * 60 * 60 * 1000;

router.get('/scenarios', async (req, res) => {
    if (!genAI) return res.status(503).json({ success: false, error: 'IA no configurada.' });

    const tiie   = parseFloat(req.query.tiie)  || 9.0;
    const fed    = parseFloat(req.query.fed)   || 4.5;
    const usdmxn = parseFloat(req.query.usdmxn) || 17.2;
    const vix    = parseFloat(req.query.vix)   || 18;
    const wti    = parseFloat(req.query.wti)   || 72;

    const cacheKey = `${Math.round(tiie * 4) / 4}_${Math.round(fed * 4) / 4}`;
    const hit = _scenariosCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < SCENARIOS_TTL)
        return res.json({ success: true, data: hit.data, desde_cache: true });

    try {
        const model = genAI.getGenerativeModel({ model: MODEL });
        const prompt = `
Eres un estratega de mercados senior. Datos actuales: TIIE=${tiie.toFixed(2)}%, Fed=${fed.toFixed(2)}%, USD/MXN=${usdmxn.toFixed(2)}, VIX=${vix.toFixed(1)}, WTI=$${wti.toFixed(2)}.

Genera exactamente 3 escenarios para los próximos 90 días para México. Responde SOLO con JSON puro, sin bloques de código:

{
  "bull": {
    "titulo": "Escenario Alcista",
    "probabilidad": 30,
    "driver": "Catalizador principal en máx 8 palabras",
    "peso": "+X.XX (fortalecimiento)",
    "ipc": "+X.X% ganancia estimada IPC",
    "tasa": "Banxico baja/mantiene a X.XX%",
    "descripcion": "2 oraciones concretas. Qué ocurre, por qué y cómo impacta al sector agropecuario y empresarial mexicano.",
    "acciones": ["Acción concreta 1", "Acción concreta 2"]
  },
  "base": {
    "titulo": "Escenario Base",
    "probabilidad": 50,
    "driver": "Catalizador principal en máx 8 palabras",
    "peso": "±X.XX (rango lateral)",
    "ipc": "±X.X% variación esperada IPC",
    "tasa": "Banxico mantiene en X.XX%",
    "descripcion": "2 oraciones concretas.",
    "acciones": ["Acción concreta 1", "Acción concreta 2"]
  },
  "bear": {
    "titulo": "Escenario Bajista",
    "probabilidad": 20,
    "driver": "Catalizador principal en máx 8 palabras",
    "peso": "-X.XX (depreciación)",
    "ipc": "-X.X% pérdida estimada IPC",
    "tasa": "Banxico pausa en X.XX%",
    "descripcion": "2 oraciones concretas.",
    "acciones": ["Acción concreta 1", "Acción concreta 2"]
  },
  "consenso": "Frase de 15 palabras máximo describiendo el sesgo del mercado MX hoy."
}

Reglas: probabilidades deben sumar 100. Usa datos realistas, no ficticios. Solo JSON.`;

        const result  = await model.generateContent(prompt);
        const raw     = result.response.text().trim();
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        let data;
        try { data = JSON.parse(cleaned); }
        catch {
            const match = cleaned.match(/\{[\s\S]*\}/);
            if (!match) throw new Error('Gemini no devolvió JSON válido en /api/scenarios');
            data = JSON.parse(match[0]);
        }
        _scenariosCache.set(cacheKey, { ts: Date.now(), data });
        res.json({ success: true, data, desde_cache: false });
    } catch (err) {
        console.error('/api/scenarios error:', err.message);
        if (err.message?.includes('429') || err.message?.includes('quota'))
            return res.status(429).json({ success: false, error: 'Cuota de API agotada. Intenta más tarde.' });
        res.status(500).json({ success: false, error: 'Error al generar escenarios.' });
    }
});

// ── Daily News: noticias REALES + tratamiento editorial "Favro" (Gemini) ──────
// Trae titulares reales de finanzas internacionales (Finnhub + NewsAPI) y usa
// Gemini SOLO para el trabajo editorial: traducir al español, resumir con voz
// Favro, clasificar categoría/impacto y armar el briefing del día. NUNCA inventa
// noticias: el modelo trabaja únicamente sobre los artículos reales recibidos.
const FINNHUB_TOKEN = process.env.FINNHUB_TOKEN || '';
const NEWSAPI_KEY   = process.env.NEWSAPI_KEY   || '';

const _dailyNewsCache = { ts: 0, data: null, fallback: false };
const DAILY_NEWS_TTL      = 40 * 60 * 1000; // 40 min (frescura razonable, controla costo Gemini)
const DAILY_NEWS_FB_TTL   = 15 * 60 * 1000; // 15 min si servimos sin editorial

function _stripHtml(s) {
    return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function _normTitle(t) {
    return String(t || '').toLowerCase().replace(/[^a-z0-9áéíóúñ ]/gi, '').replace(/\s+/g, ' ').trim();
}

async function _fetchFinnhubNews() {
    if (!FINNHUB_TOKEN) return [];
    try {
        const r = await externalGet(`https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_TOKEN}`, {}, 9000);
        if (!r.ok) return [];
        const arr = await r.json();
        if (!Array.isArray(arr)) return [];
        return arr.filter(a => a && a.headline && a.url).map(a => ({
            title: a.headline,
            summary: _stripHtml(a.summary),
            source: a.source || 'Finnhub',
            url: a.url,
            image: a.image || '',
            publishedAt: a.datetime ? new Date(a.datetime * 1000).toISOString() : null,
            origin: 'finnhub',
        }));
    } catch (e) {
        console.warn('[daily-news] Finnhub:', e.message);
        return [];
    }
}

async function _fetchNewsApiBusiness() {
    if (!NEWSAPI_KEY) return [];
    try {
        const url = `https://newsapi.org/v2/top-headlines?category=business&language=en&pageSize=40&apiKey=${NEWSAPI_KEY}`;
        const r = await externalGet(url, { 'X-Api-Key': NEWSAPI_KEY }, 9000);
        if (!r.ok) return [];
        const j = await r.json();
        const arts = Array.isArray(j?.articles) ? j.articles : [];
        return arts.filter(a => a && a.title && a.url && a.title !== '[Removed]').map(a => ({
            title: a.title,
            summary: _stripHtml(a.description || a.content),
            source: a.source?.name || 'NewsAPI',
            url: a.url,
            image: a.urlToImage || '',
            publishedAt: a.publishedAt || null,
            origin: 'newsapi',
        }));
    } catch (e) {
        console.warn('[daily-news] NewsAPI:', e.message);
        return [];
    }
}

// Mapea las etiquetas en español del editor a los buckets que usa el frontend.
const _CAT_MAP = { mercados: 'markets', tasas: 'rates', bonos: 'bonds', divisas: 'fx', commodities: 'commodities' };
const _CAT_LABEL = { mercados: 'Mercados', tasas: 'Tasas', bonos: 'Bonos', divisas: 'Divisas', commodities: 'Commodities' };
const _SENT_MAP = { positivo: 'positive', negativo: 'negative', neutral: 'neutral' };

function _inferNewsCategory(article) {
    const text = `${article?.title || ''} ${article?.summary || ''}`.toLowerCase();
    if (/\b(?:fed|banxico|central bank|interest rate|inflation|tasa|inflación)\b/.test(text)) return { key: 'rates', label: 'Tasas' };
    if (/\b(?:bond|bonds|treasury|yield|debt|bono|bonos|deuda)\b/.test(text)) return { key: 'bonds', label: 'Bonos' };
    if (/\b(?:currency|currencies|forex|dollar|euro|yen|peso|divisa|dólar)\b/.test(text)) return { key: 'fx', label: 'Divisas' };
    if (/\b(?:oil|crude|gold|copper|commodity|commodities|petróleo|oro|cobre)\b/.test(text)) return { key: 'commodities', label: 'Commodities' };
    return { key: 'markets', label: 'Mercados' };
}

async function _editorializeNews(articles) {
    if (!genAI) throw new Error('GEMINI_API_KEY no configurada');
    // responseMimeType JSON obliga a Gemini a devolver JSON estricto (evita comillas
    // sin escapar y otros errores de parseo que rompían el editorial).
    const model = genAI.getGenerativeModel({
        model: MODEL,
        generationConfig: { responseMimeType: 'application/json', temperature: 0.45 },
    });
    const input = articles.map((a, i) => ({ i, title: a.title, summary: (a.summary || '').slice(0, 320), source: a.source }));

    const prompt = `Eres el editor financiero de VALLNEWS (marca editorial "Favro"). Te entrego noticias REALES de finanzas internacionales, la mayoría en inglés. Es CRÍTICO que NO inventes noticias, cifras ni fuentes: trabaja EXCLUSIVAMENTE con los artículos que te doy (identificados por "i").

Para cada artículo devuelve, en ESPAÑOL neutro y profesional:
- "titulo": titular editorial claro (traducido/reescrito, sin sensacionalismo ni clickbait)
- "resumen": máximo 2 oraciones concretas que expliquen la noticia con base en lo dado
- "insight": una sola línea "Qué significa" con el ángulo Favro para inversionistas/empresas (máx 16 palabras)
- "categoria": una de "mercados" | "tasas" | "bonos" | "divisas" | "commodities"
- "impacto": "alto" | "medio" | "bajo"
- "sentimiento": "positivo" | "negativo" | "neutral"

Además entrega:
- "briefing": 3 frases cortas con lo esencial del día (una por punto)
- "lead": el índice "i" del artículo más importante para portada

Devuelve SOLO JSON puro, sin bloques de código ni texto extra:
{"items":[{"i":0,"titulo":"","resumen":"","insight":"","categoria":"mercados","impacto":"medio","sentimiento":"neutral"}],"briefing":["","",""],"lead":0}

NOTICIAS (JSON):
${JSON.stringify(input)}`;

    const result  = await model.generateContent(prompt);
    const raw     = result.response.text().trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('Gemini no devolvió JSON válido en daily-news');
        parsed = JSON.parse(match[0]);
    }
    return parsed;
}

function _formatFecha(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).toUpperCase()
        + ' · ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

async function _buildDailyNews() {
    const [fh, na] = await Promise.all([_fetchFinnhubNews(), _fetchNewsApiBusiness()]);

    // Combinar y deduplicar por título normalizado, preferir con imagen.
    const seen = new Map();
    for (const art of [...na, ...fh]) {
        const k = _normTitle(art.title).slice(0, 60);
        if (!k) continue;
        const prev = seen.get(k);
        if (!prev || (!prev.image && art.image)) seen.set(k, art);
    }
    let pool = [...seen.values()]
        .filter(a => (a.summary || '').length > 0 || a.image)
        .sort((x, y) => new Date(y.publishedAt || 0) - new Date(x.publishedAt || 0))
        .slice(0, 24);

    if (!pool.length) throw new Error('sin noticias reales disponibles');

    let editorial = null;
    try {
        // La portada conserva hasta 24 historias, pero la edición generativa se
        // limita a las 14 principales para mantener una carga rápida y estable.
        editorial = await _editorializeNews(pool.slice(0, 14));
    } catch (e) {
        console.warn('[daily-news] editorial Gemini falló:', e.message);
    }

    const editById = new Map();
    if (editorial?.items) for (const it of editorial.items) editById.set(Number(it.i), it);

    const noticias = pool.map((art, i) => {
        const ed = editById.get(i) || {};
        const catKey = (ed.categoria || '').toLowerCase();
        const inferred = _inferNewsCategory(art);
        return {
            title:       ed.titulo  || art.title,
            description: ed.resumen || art.summary || '',
            insight:     ed.insight || '',
            category:    _CAT_MAP[catKey] || inferred.key,
            categoryLabel: _CAT_LABEL[catKey] || inferred.label,
            sentiment:   _SENT_MAP[(ed.sentimiento || '').toLowerCase()] || 'neutral',
            impact:      ['alto', 'medio', 'bajo'].includes((ed.impacto || '').toLowerCase()) ? ed.impacto.toLowerCase() : 'medio',
            source:      art.source,
            url:         art.url,
            image:       art.image ? `/api/img?u=${encodeURIComponent(art.image)}` : '',
            imageRaw:    art.image || '',
            publishedAt: art.publishedAt,
            fecha:       _formatFecha(art.publishedAt),
        };
    });

    // Ordenar dejando primero el "lead" que eligió el editor.
    const leadIdx = Number.isInteger(editorial?.lead) && editorial.lead >= 0 && editorial.lead < noticias.length ? editorial.lead : 0;
    if (leadIdx > 0) noticias.unshift(noticias.splice(leadIdx, 1)[0]);

    const briefing = Array.isArray(editorial?.briefing) && editorial.briefing.length
        ? editorial.briefing.slice(0, 3).map(s => String(s).trim()).filter(Boolean)
        : [];

    const ahora = new Date();
    return {
        generado: ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
            + ' · ' + ahora.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase(),
        noticias,
        briefing,
        editorial: !!editorial,
        fuente: [na.length ? 'NewsAPI' : null, fh.length ? 'Finnhub' : null, editorial ? 'Edición asistida (Gemini)' : null].filter(Boolean).join(' · '),
    };
}

router.get('/daily-news', async (req, res) => {
    const cache = _dailyNewsCache;
    if (cache.data) {
        const ttl = cache.data.editorial ? DAILY_NEWS_TTL : DAILY_NEWS_FB_TTL;
        if (Date.now() - cache.ts < ttl) return res.json({ success: true, data: cache.data, desde_cache: true });
    }
    try {
        const data = await _buildDailyNews();
        _dailyNewsCache.ts = Date.now();
        _dailyNewsCache.data = data;
        res.json({ success: true, data, desde_cache: false });
    } catch (err) {
        console.error('/api/daily-news:', err.message);
        if (cache.data) return res.json({ success: true, data: cache.data, desde_cache: true, stale: true });
        res.status(502).json({ success: false, error: 'No se pudieron cargar las noticias en este momento.' });
    }
});

// ── Proxy de imágenes de noticias ─────────────────────────────────────────────
// Muchas fuentes (Reuters, etc.) bloquean el hotlinking cross-origin. Servimos la
// imagen desde nuestro propio origen para que cargue en el noticiero. Guarda
// anti-SSRF básica: solo http/https y hosts públicos; exige content-type image/*.
function _isPrivateHost(host) {
    const h = (host || '').toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h === '::1') return true;
    if (/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
    const m = h.match(/^172\.(\d+)\./);
    if (m && +m[1] >= 16 && +m[1] <= 31) return true;
    return false;
}

router.get('/img', (req, res) => {
    const raw = req.query.u;
    if (!raw || typeof raw !== 'string') return res.status(400).end();
    let u;
    try { u = new URL(raw); } catch { return res.status(400).end(); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return res.status(400).end();
    if (_isPrivateHost(u.hostname)) return res.status(403).end();

    const lib = u.protocol === 'http:' ? http : https;
    const upstream = lib.request({
        hostname: u.hostname,
        port:     u.port || (u.protocol === 'http:' ? 80 : 443),
        path:     u.pathname + u.search,
        method:   'GET',
        rejectUnauthorized: false, // en local (Windows) faltan CAs intermedias de algunos CDNs
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; VALLNews/1.0)',
            'Accept':     'image/avif,image/webp,image/*,*/*;q=0.8',
            'Referer':    `${u.protocol}//${u.hostname}/`,
        },
    }, up => {
        const type = up.headers['content-type'] || '';
        if (up.statusCode >= 400 || !/^image\//i.test(type)) { up.resume(); return res.status(502).end(); }
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 h
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        up.pipe(res);
    });
    upstream.setTimeout(8000, () => { upstream.destroy(); if (!res.headersSent) res.status(504).end(); });
    upstream.on('error', () => { if (!res.headersSent) res.status(502).end(); });
    upstream.end();
});

module.exports = router;

