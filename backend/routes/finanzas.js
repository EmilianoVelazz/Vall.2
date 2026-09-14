'use strict';
const express = require('express');
const https   = require('https');
const http    = require('http');

const { genAI, MODEL } = require('../lib/gemini');
const { externalGet, gdeltFetch, REJECT_UNAUTHORIZED } = require('../lib/http');
const { getCurrencyQuote } = require('../ai/currency-converter');
const { verifyToken } = require('./auth');
const executiveReportStore = require('../services/finance-report-store');
const { executiveReportAgent } = require('../ai/executive-report-agent');
const { nextReportRefreshAt, scheduleDailyReport } = require('../lib/report-schedule');

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

router.get('/noticias', verifyToken, async (req, res) => {
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
        res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
        res.json({ success: true, data });
    } catch (err) {
        console.error(' /api/noticias:', err.message);
        res.status(500).json({ success: false, error: 'Error al generar noticias.' });
    }
});

router.get('/finanzas', verifyToken, async (req, res) => {
    if (_finanzasCache) {
        try {
            const cache = _finanzasCache;
            const edad  = Date.now() - cache.timestamp;
            const ttl   = cache.fallback ? FALLBACK_CACHE_TTL : CACHE_TTL;
            res.set('Cache-Control', `public, s-maxage=${Math.floor(ttl/1000)}, stale-while-revalidate=${Math.floor(ttl/1000)*2}`);
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
        res.set('Cache-Control', `public, s-maxage=${Math.floor(CACHE_TTL/1000)}, stale-while-revalidate=${Math.floor(CACHE_TTL/1000)*2}`);
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

        res.set('Cache-Control', `public, s-maxage=${Math.floor(FALLBACK_CACHE_TTL/1000)}, stale-while-revalidate=${Math.floor(FALLBACK_CACHE_TTL/1000)*2}`);
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

router.get('/scenarios', verifyToken, async (req, res) => {
    if (!genAI) return res.status(503).json({ success: false, error: 'IA no configurada.' });

    const tiie   = parseFloat(req.query.tiie)  || 9.0;
    const fed    = parseFloat(req.query.fed)   || 4.5;
    const usdmxn = parseFloat(req.query.usdmxn) || 17.2;
    const vix    = parseFloat(req.query.vix)   || 18;
    const wti    = parseFloat(req.query.wti)   || 72;

    const cacheKey = `${Math.round(tiie * 4) / 4}_${Math.round(fed * 4) / 4}`;
    const hit = _scenariosCache.get(cacheKey);
    res.set('Cache-Control', `public, s-maxage=${Math.floor(SCENARIOS_TTL/1000)}, stale-while-revalidate=${Math.floor(SCENARIOS_TTL/1000)*2}`);
    
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

function _gdeltIsoDate(value) {
    const text = String(value || '').trim();
    const compact = text.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
    if (compact) return new Date(`${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`).toISOString();
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Respaldo abierto para las ventanas en que NewsAPI o Finnhub no devuelven
// historias. La nota sigue mostrando el dominio original y su enlace.
async function _fetchGdeltFinancialNews() {
    const query = '(markets OR economy OR central bank OR inflation OR currency OR bonds)';
    try {
        const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&format=json&maxrecords=12&sort=HybridRel`;
        // En informes periódicos GDELT es respaldo, no un bloqueo. Una cola o
        // un 429 no debe gastar 20 segundos antes de dejar que las otras
        // fuentes publiquen el corte; por eso aquí usa un plazo corto.
        const response = await externalGet(url, { Accept: 'application/json', 'User-Agent': 'VALLNews/1.0' }, 7000);
        if (!response.ok) throw new Error(`GDELT HTTP ${response.status}`);
        const payload = await response.json();
        return (payload?.articles || []).filter(article => article?.title && article?.url).map(article => ({
            title: String(article.title).trim(),
            summary: _stripHtml(article.seentext || ''),
            source: article.domain || 'GDELT', url: article.url,
            image: article.socialimage || '', publishedAt: _gdeltIsoDate(article.seendate), origin: 'gdelt',
        }));
    } catch (error) {
        console.warn('[daily-news] GDELT:', error.message);
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
    const [fh, na, gdelt] = await Promise.all([_fetchFinnhubNews(), _fetchNewsApiBusiness(), _fetchGdeltFinancialNews()]);

    // Combinar y deduplicar por título normalizado, preferir con imagen.
    const seen = new Map();
    for (const art of [...na, ...fh, ...gdelt]) {
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
        fuente: [na.length ? 'NewsAPI' : null, fh.length ? 'Finnhub' : null, gdelt.length ? 'GDELT' : null, editorial ? 'Edición asistida (Gemini)' : null].filter(Boolean).join(' · '),
    };
}

router.get('/daily-news', async (req, res) => {
    const cache = _dailyNewsCache;
    if (cache.data) {
        const ttl = cache.data.editorial ? DAILY_NEWS_TTL : DAILY_NEWS_FB_TTL;
        res.set('Cache-Control', `public, s-maxage=${Math.floor(ttl/1000)}, stale-while-revalidate=${Math.floor(ttl/1000)*2}`);
        if (Date.now() - cache.ts < ttl) return res.json({ success: true, data: cache.data, desde_cache: true });
    }
    try {
        const data = await _buildDailyNews();
        _dailyNewsCache.ts = Date.now();
        _dailyNewsCache.data = data;
        const ttl = data.editorial ? DAILY_NEWS_TTL : DAILY_NEWS_FB_TTL;
        res.set('Cache-Control', `public, s-maxage=${Math.floor(ttl/1000)}, stale-while-revalidate=${Math.floor(ttl/1000)*2}`);
        res.json({ success: true, data, desde_cache: false });
    } catch (err) {
        console.error('/api/daily-news:', err.message);
        if (cache.data) return res.json({ success: true, data: cache.data, desde_cache: true, stale: true });
        res.status(502).json({ success: false, error: 'No se pudieron cargar las noticias en este momento.' });
    }
});

// ── Daily News Markets ─────────────────────────────────────────────

const _dailyNewsMktCache = { ts: 0, data: null, fallback: false };

const _MKT_CAT_MAP = { granos: 'granos', energia: 'energia', metales: 'metales', logistica: 'logistica', macro: 'macro' };
const _MKT_CAT_LABEL = { granos: 'Granos', energia: 'Energía', metales: 'Metales', logistica: 'Logística', macro: 'Macro' };

function _inferMarketCategory(article) {
    const text = `${article?.title || ''} ${article?.summary || ''}`.toLowerCase();
    if (/\b(?:corn|maiz|soybean|soja|wheat|trigo|grain|crop|harvest|cbot|usda)\b/.test(text)) return { key: 'granos', label: 'Granos' };
    if (/\b(?:oil|wti|brent|crude|gas|energy|diesel|opec|fuel)\b/.test(text)) return { key: 'energia', label: 'Energía' };
    if (/\b(?:copper|gold|silver|aluminum|steel|metal|mining|lme)\b/.test(text)) return { key: 'metales', label: 'Metales' };
    if (/\b(?:shipping|freight|logistics|port|container|supply chain|baltic)\b/.test(text)) return { key: 'logistica', label: 'Logística' };
    return { key: 'macro', label: 'Macro' };
}

async function _fetchGdeltCommodities() {
    const queries = ['soybean wheat grain', 'crude oil energy', 'copper aluminum metal'];
    
    const promises = queries.map(async (q) => {
        const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=ArtList&maxrecords=8&format=json`;
        const j = await gdeltFetch(url);
        return Array.isArray(j?.articles) ? j.articles : [];
    });

    const results = [];
    const settled = await Promise.allSettled(promises);
    
    for (const res of settled) {
        if (res.status === 'fulfilled') {
            for (const a of res.value) {
                if (!a.title || !a.url) continue;
                results.push({
                    title: a.title,
                    summary: _stripHtml(a.seentext || ''),
                    source: a.domain || 'GDELT',
                    url: a.url,
                    image: a.socialimage || '',
                    publishedAt: a.seendate || null,
                    origin: 'gdelt',
                });
            }
        }
    }
    return results;
}

async function _editorializeMarketNews(articles) {
    if (!genAI) throw new Error('GEMINI_API_KEY no configurada');
    const model = genAI.getGenerativeModel({
        model: MODEL,
        generationConfig: { responseMimeType: 'application/json', temperature: 0.45 },
    });
    const input = articles.map((a, i) => ({ i, title: a.title, summary: (a.summary || '').slice(0, 320), source: a.source }));

    const prompt = `Eres el editor de materias primas de VALLNEWS (marca editorial "Favro · Mercados"). Te entrego noticias REALES de commodities, energía y metales, la mayoría en inglés. Es CRÍTICO que NO inventes noticias, cifras ni fuentes: trabaja EXCLUSIVAMENTE con los artículos que te doy (identificados por "i").

Para cada artículo devuelve, en ESPAÑOL neutro y profesional:
- "titulo": titular editorial claro (traducido/reescrito, sin sensacionalismo)
- "resumen": máximo 2 oraciones concretas sobre el impacto en costos de insumos o cadenas de suministro
- "insight": una sola línea "Qué significa para el costo" con ángulo de materias primas (máx 16 palabras)
- "categoria": una de "granos" | "energia" | "metales" | "logistica" | "macro"
- "impacto": "alto" | "medio" | "bajo"
- "sentimiento": "positivo" | "negativo" | "neutral"

Además entrega:
- "briefing": 3 frases cortas con lo esencial del día para operaciones e insumos
- "lead": el índice "i" del artículo más importante para portada

Devuelve SOLO JSON puro:
{"items":[{"i":0,"titulo":"","resumen":"","insight":"","categoria":"granos","impacto":"medio","sentimiento":"neutral"}],"briefing":["","",""],"lead":0}

NOTICIAS (JSON):
${JSON.stringify(input)}`;

    const result  = await model.generateContent(prompt);
    const raw     = result.response.text().trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('Gemini no devolvió JSON válido en daily-news-markets');
        parsed = JSON.parse(match[0]);
    }
    return parsed;
}

async function _buildDailyMarketNews() {
    const [fh, na, gdelt] = await Promise.all([_fetchFinnhubNews(), _fetchNewsApiBusiness(), _fetchGdeltCommodities()]);

    const seen = new Map();
    for (const art of [...gdelt, ...na, ...fh]) {
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
        editorial = await _editorializeMarketNews(pool.slice(0, 14));
    } catch (e) {
        console.warn('[daily-news-markets] editorial Gemini falló:', e.message);
    }

    const editById = new Map();
    if (editorial?.items) for (const it of editorial.items) editById.set(Number(it.i), it);

    const noticias = pool.map((art, i) => {
        const ed = editById.get(i) || {};
        const catKey = (ed.categoria || '').toLowerCase();
        const inferred = _inferMarketCategory(art);
        return {
            title:       ed.titulo  || art.title,
            description: ed.resumen || art.summary || '',
            insight:     ed.insight || '',
            category:    _MKT_CAT_MAP[catKey] || inferred.key,
            categoryLabel: _MKT_CAT_LABEL[catKey] || inferred.label,
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
        fuente: [na.length ? 'NewsAPI' : null, fh.length ? 'Finnhub' : null, gdelt.length ? 'GDELT' : null, editorial ? 'Edición asistida (Gemini)' : null].filter(Boolean).join(' · '),
    };
}

router.get('/daily-news-markets', async (req, res) => {
    const cache = _dailyNewsMktCache;
    if (cache.data) {
        const ttl = cache.data.editorial ? DAILY_NEWS_TTL : DAILY_NEWS_FB_TTL;
        res.set('Cache-Control', `public, s-maxage=${Math.floor(ttl/1000)}, stale-while-revalidate=${Math.floor(ttl/1000)*2}`);
        if (Date.now() - cache.ts < ttl) return res.json({ success: true, data: cache.data, desde_cache: true });
    }
    try {
        const data = await _buildDailyMarketNews();
        _dailyNewsMktCache.ts = Date.now();
        _dailyNewsMktCache.data = data;
        const ttl = data.editorial ? DAILY_NEWS_TTL : DAILY_NEWS_FB_TTL;
        res.set('Cache-Control', `public, s-maxage=${Math.floor(ttl/1000)}, stale-while-revalidate=${Math.floor(ttl/1000)*2}`);
        res.json({ success: true, data, desde_cache: false });
    } catch (err) {
        console.error('/api/daily-news-markets:', err.message);
        if (cache.data) return res.json({ success: true, data: cache.data, desde_cache: true, stale: true });
        res.status(502).json({ success: false, error: 'No se pudieron cargar las noticias en este momento.' });
    }
});

// ── Informes ejecutivos de Finanzas ─────────────────────────────────────────
//
// Cinco cortes persistentes, calculados desde los mismos proveedores que ve la
// pantalla. No se solicita al modelo que "rellene" precios o noticias: Gemini
// sólo puede intervenir aguas arriba como edición de los titulares reales.
const EXECUTIVE_REPORT_TTL = 24 * 60 * 60 * 1000;
let _executiveReportMemory = null;
let _executiveReportRefresh = null;

function reportNumber(value, digits = 2) {
    return Number.isFinite(Number(value)) ? Number(value).toLocaleString('es-MX', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : 'Sin dato';
}

function reportChange(value, suffix = '%') {
    if (!Number.isFinite(Number(value))) return 'Sin comparación';
    const parsed = Number(value);
    return `${parsed >= 0 ? '+' : ''}${parsed.toFixed(2)}${suffix}`;
}

function percentageBetween(current, base) {
    return Number.isFinite(current) && Number.isFinite(base) && base !== 0 ? ((current - base) / base) * 100 : null;
}

function performanceWindow(points, sessions, current) {
    const base = points[Math.max(0, points.length - 1 - sessions)]?.value;
    return percentageBetween(current, base);
}

function ytdPerformance(points, current) {
    const year = new Date().getUTCFullYear();
    const first = points.find(point => new Date(point.date).getUTCFullYear() === year)?.value;
    return percentageBetween(current, first);
}

function compactSeries(points, limit = 42) {
    if (points.length <= limit) return points;
    const step = (points.length - 1) / (limit - 1);
    return Array.from({ length: limit }, (_, index) => points[Math.round(index * step)]);
}

async function reportYahoo(symbol, label) {
    // Un año de cierres permite separar un movimiento de sesión de la tendencia
    // semanal, mensual y YTD. Se comprime antes de enviarlo al navegador/PDF,
    // pero se calculan los porcentajes contra la serie completa.
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
    const response = await externalGet(url, { 'User-Agent': 'Mozilla/5.0 (compatible; VALLNews/1.0)', Accept: 'application/json' }, 12_000);
    if (!response.ok) throw new Error(`Yahoo ${symbol}: HTTP ${response.status}`);
    const result = (await response.json())?.chart?.result?.[0];
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const timestamps = result?.timestamp || [];
    const points = closes.map((value, index) => ({
        date: timestamps[index] ? new Date(timestamps[index] * 1000).toISOString().slice(0, 10) : null,
        value: Number(value),
    })).filter(point => point.date && Number.isFinite(point.value));
    const current = points.at(-1)?.value;
    const previous = points.at(-2)?.value;
    const change = percentageBetween(current, previous);
    return {
        label, symbol, value: current, previous, change,
        delta: Number.isFinite(current) && Number.isFinite(previous) ? current - previous : null,
        performance: {
            day: change,
            week: performanceWindow(points, 5, current),
            month: performanceWindow(points, 21, current),
            ytd: ytdPerformance(points, current),
        },
        series: compactSeries(points),
        source: 'Yahoo Finance · cierre diario más reciente',
    };
}

async function reportFxSnapshot() {
    const response = await externalGet('https://open.er-api.com/v6/latest/USD', { Accept: 'application/json' }, 12_000);
    if (!response.ok) throw new Error(`ExchangeRate-API: HTTP ${response.status}`);
    const rates = (await response.json())?.rates || {};
    return ['MXN', 'EUR', 'JPY', 'GBP', 'CAD'].map(code => ({
        label: `USD/${code}`, code, value: Number(rates[code]), source: 'ExchangeRate-API · tipo de cambio de referencia',
    })).filter(item => Number.isFinite(item.value));
}

async function financeExecutiveFxSnapshot() {
    // La primera lectura recupera el conjunto completo en una sola petición.
    // Si ésta falla de forma transitoria, el conversor comparte una caché local
    // de una hora y permite reconstruir los pares que usa la biblioteca.
    try {
        const rates = await reportFxSnapshot();
        if (rates.length) return rates;
    } catch (error) {
        console.warn('[finance-reports] Fuente principal de divisas no disponible:', error.message);
    }

    const codes = ['MXN', 'EUR', 'JPY', 'GBP', 'CAD'];
    const quotes = await Promise.all(codes.map(async code => ({ code, quote: await getCurrencyQuote('USD', code) })));
    return quotes.map(({ code, quote }) => quote && ({
        label: `USD/${code}`,
        code,
        value: quote.rate,
        source: `${quote.source} · caché de contingencia`,
        updatedAt: quote.updatedAt || null,
    })).filter(item => item && Number.isFinite(item.value));
}

function sourceList(items) {
    return [...new Set(items.filter(Boolean))];
}

function financeNewsHeadline(item) {
    return String(item?.title || '')
        .replace(/\s*-\s*(?:reuters|bloomberg|cnbc|financial times|wall street journal)\.com\s*$/i, '')
        .trim();
}

function financeNewsDescription(item) {
    const title = financeNewsHeadline(item);
    const comparable = value => String(value || '').toLowerCase()
        .replace(/[^a-z0-9áéíóúüñ]+/gi, ' ').trim();
    const titleComparable = comparable(title);
    const candidates = [item?.description, item?.insight]
        .map(value => String(value || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    // Conservamos el resumen publicado o enriquecido cuando realmente añade
    // información. Algunas sindicaciones devuelven el titular repetido como
    // descripción, y no aporta una lectura ejecutiva.
    const ownDescription = candidates.find(value => {
        const descriptionComparable = comparable(value);
        return value.length >= 60
            && descriptionComparable !== titleComparable
            && !descriptionComparable.includes(titleComparable);
    });
    if (ownDescription) return ownDescription;

    const text = `${title} ${candidates.join(' ')}`.toLowerCase();
    if (/fed|federal reserve|ecb|banxico|central bank|interest rate|inflation|cpi|employment|jobs|gdp/.test(text)) {
        return 'Trata un dato o decisión macroeconómica que puede cambiar las expectativas de tasas, inflación, crecimiento y la valuación de activos. Conviene confirmar la cifra, el periodo y la autoridad que la publicó.';
    }
    if (/treasury|bond|yield|debt|auction|spread|credit/.test(text)) {
        return 'Aborda tasas, deuda o crédito. Su relevancia depende del vencimiento, la moneda, el emisor y de si el movimiento altera realmente el costo de financiamiento o la valuación de una cartera.';
    }
    if (/dollar|peso|currency|forex|exchange rate|yen|euro|sterling/.test(text)) {
        return 'Se relaciona con divisas y puede afectar costos de importación, ingresos de exportación o deuda en moneda extranjera. Debe contrastarse con el par, el horizonte y el precio operable de la exposición.';
    }
    if (/stock|equity|share|earnings|results|profit|company|merger|acquisition/.test(text)) {
        return 'Trata una señal de renta variable o de empresa. Antes de extrapolarla, confirma el resultado, la guía, el sector y si el hecho cambia una exposición concreta del portafolio o negocio.';
    }
    if (/oil|crude|energy|opec|gas|metal|gold|copper|commodity/.test(text)) {
        return 'Aborda una materia prima o energía; el posible impacto debe contrastarse con inventarios, oferta, demanda, contratos, tipo de cambio y costos físicos antes de atribuirle un cambio de margen.';
    }
    if (/tariff|trade|sanction|shipping|freight|geopolit|war|conflict/.test(text)) {
        return 'Describe un hecho de comercio, logística o riesgo geopolítico que puede tocar rutas, disponibilidad, plazos y costos. La fuente original permite delimitar los países, productos y contratos expuestos.';
    }
    return `El titular se relaciona con ${String(item?.categoryLabel || 'mercados financieros').toLowerCase()}. Revisa la nota original para confirmar el activo, la región, la fecha y la magnitud del posible impacto.`;
}

function financeNewsDate(item) {
    return item?.publishedAt ? _formatFecha(item.publishedAt) : 'Sin fecha publicada';
}

function financeNewsSourceLinks(headlines = []) {
    return headlines.slice(0, 5).map(item => ({
        label: `${item.source || 'Fuente conectada'} · ${financeNewsDate(item)} · ${financeNewsHeadline(item).slice(0, 115)}`,
        url: item.url || '',
    }));
}

function financeNewsSources(provider, headlines = []) {
    return sourceList([
        provider,
        ...headlines.slice(0, 5).map(item => `${item.source || 'Fuente conectada'} · ${financeNewsDate(item)}${item.url ? ` · ${item.url}` : ''}`),
    ]);
}

function newsNarrative(headlines, briefing = []) {
    const verified = headlines.slice(0, 5);
    if (!verified.length) return [
        { heading: 'Cobertura no disponible', text: 'No se obtuvo ninguna noticia verificable durante este corte. El informe no sustituye esa ausencia con texto genérico; intenta actualizarlo más tarde o revisa las fuentes conectadas.' },
    ];
    const items = verified.map((item, index) => {
        return `${index + 1}. ${financeNewsHeadline(item)}\n${financeNewsDescription(item)}`;
    }).join('\n\n');
    const editorialBriefing = briefing.length
        ? briefing.slice(0, 3).map((line, index) => `${index + 1}. ${line}`).join('\n')
        : 'Las prioridades se derivan de los titulares anteriores; cada una debe confirmarse en el material original.';
    return [
        { heading: 'Qué pasó', text: items },
        { heading: 'Por qué importa', text: `${editorialBriefing}\n\nAntes de actuar, confirma el alcance geográfico, el activo afectado, la fecha de publicación y si el evento modifica una exposición real de la organización. Las fuentes y sus enlaces originales se reúnen al final del informe.` },
    ];
}

function fxNarrative(fx) {
    const mxn = fx.find(item => item.code === 'MXN');
    const referenceLines = fx.map(item => `${item.label}: ${reportNumber(item.value, 4)} unidades de ${item.code} por USD.`).join('\n');
    if (!fx.length) return [
        { heading: 'Corte de referencia no disponible', text: 'El proveedor no entregó pares verificables en esta actualización. El informe no sustituye esa ausencia con una estimación; se conserva el último corte válido cuando exista.' },
    ];
    return [
        {
            heading: 'Cotizaciones verificadas del corte',
            text: `${referenceLines}\n\nFuente: ${sourceList(fx.map(item => item.source)).join(' · ')}. Estos son tipos de referencia frente al dólar estadounidense y no precios operables de una mesa de cambios.`,
        },
        {
            heading: 'Lectura operativa para USD/MXN',
            text: mxn
                ? `El par de referencia USD/MXN fue ${reportNumber(mxn.value, 4)}. Para presupuestos, pagos a proveedores, deuda o importaciones, úsalo sólo como punto de partida: confirma el precio de ejecución, bid/ask, comisión, plazo de liquidación y contraparte antes de comprometer una cifra.`
                : 'La fuente no devolvió USD/MXN en este corte; no se infiere un valor a partir de otro par.',
        },
        {
            heading: 'Decisiones y alertas de seguimiento',
            text: 'Relaciona cada par con el flujo real que lo expone: cobros, compras, inventario importado, deuda, dividendos o coberturas. Vigila decisiones de bancos centrales, inflación, liquidez y eventos de riesgo; pueden cambiar el tipo de cambio sin que una sola cotización explique la causa. Si la exposición es material, documenta el nivel de referencia, horizonte y sensibilidad antes de ejecutar.',
        },
    ];
}

function normalizeExecutiveHeadlines(items = []) {
    const seen = new Map();
    for (const item of items) {
        const key = _normTitle(item?.title).slice(0, 120);
        if (!key || seen.has(key)) continue;
        const inferred = _inferNewsCategory(item);
        seen.set(key, {
            title: item.title, source: item.source || 'Fuente conectada', url: item.url || '',
            description: item.description || item.summary || '', insight: item.insight || '',
            category: item.category || inferred.key, categoryLabel: item.categoryLabel || inferred.label,
            impact: item.impact || 'medio', publishedAt: item.publishedAt || null,
        });
    }
    return [...seen.values()].sort((left, right) => new Date(right.publishedAt || 0) - new Date(left.publishedAt || 0));
}

function executiveNewsRelevance(item) {
    const text = `${item?.title || ''} ${item?.description || ''}`.toLowerCase();
    const highSignal = /\b(?:market|stock|equity|bond|yield|treasury|central bank|interest rate|inflation|fed|ecb|banxico|currency|forex|dollar|peso|trade|tariff|economy|economic|gdp|jobs|earnings|bank|oil|crude|energy|opec|commodity|shipping|freight|supply chain|sanction)\b/g;
    const lowSignal = /\b(?:kimmel|cramer|celebrity|actor|actress|movie|film|music|singer|sport|football|nba|recipe|fashion|royal)\b/g;
    const relevantTerms = text.match(highSignal)?.length || 0;
    const irrelevantTerms = text.match(lowSignal)?.length || 0;
    const sourceBonus = /reuters|bloomberg|financial times|wall street journal|cnbc|associated press/i.test(item?.source || '') ? 1 : 0;
    const impactBonus = item?.impact === 'alto' ? 2 : item?.impact === 'medio' ? 1 : 0;
    return relevantTerms * 3 + sourceBonus + impactBonus - irrelevantTerms * 8;
}

function selectExecutiveHeadlines(items = []) {
    return normalizeExecutiveHeadlines(items)
        .map((item, index) => ({ item, score: executiveNewsRelevance(item), index }))
        .filter(candidate => candidate.score > -2)
        .sort((left, right) => right.score - left.score || new Date(right.item.publishedAt || 0) - new Date(left.item.publishedAt || 0) || left.index - right.index)
        .slice(0, 5)
        .map(candidate => candidate.item);
}

async function financeExecutiveNewsSnapshot() {
    // El endpoint de Daily News puede haber resuelto ya el tratamiento
    // editorial. Reusar ese corte reduce latencia y evita que la biblioteca
    // publique vacío mientras la misma información ya existe en memoria.
    if (_dailyNewsCache.data?.noticias?.length) {
        return {
            noticias: selectExecutiveHeadlines(_dailyNewsCache.data.noticias),
            briefing: _dailyNewsCache.data.briefing || [], fuente: _dailyNewsCache.data.fuente || 'Corte de Daily News',
        };
    }
    // En un arranque en frío, arma el mismo corte editorial que consume la
    // sección Daily News. Así la biblioteca no pierde traducciones, resúmenes
    // ni clasificación por intentar construir otro feed en paralelo.
    try {
        const dailyCut = await _buildDailyNews();
        _dailyNewsCache.ts = Date.now();
        _dailyNewsCache.data = dailyCut;
        return {
            noticias: selectExecutiveHeadlines(dailyCut.noticias),
            briefing: dailyCut.briefing || [], fuente: dailyCut.fuente || 'Corte de Daily News',
        };
    } catch (error) {
        console.warn('[finance-reports] No se pudo usar el corte editorial de Daily News:', error.message);
    }
    // Si no existe un corte editorial aún, el informe sigue siendo útil con
    // las fuentes originales. Gemini mejora redacción en /daily-news, pero no
    // debe ser un requisito para que los hechos y enlaces aparezcan aquí.
    const [finnhub, newsApi, gdelt] = await Promise.all([
        _fetchFinnhubNews(), _fetchNewsApiBusiness(), _fetchGdeltFinancialNews(),
    ]);
    return {
        noticias: selectExecutiveHeadlines([...newsApi, ...finnhub, ...gdelt]), briefing: [],
        fuente: [newsApi.length ? 'NewsAPI' : null, finnhub.length ? 'Finnhub' : null, gdelt.length ? 'GDELT' : null].filter(Boolean).join(' · '),
    };
}

function performanceLabel(value) {
    return Number.isFinite(Number(value)) ? reportChange(value) : 'Sin serie comparable';
}

function bpsLabel(delta) {
    return Number.isFinite(Number(delta)) ? `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)} pb` : 'Sin comparación';
}

function indexedVisual(title, items, note) {
    const series = items.filter(item => item?.series?.length > 1).map(item => {
        const base = item.series[0]?.value;
        return {
            label: item.label,
            points: item.series.map(point => ({ date: point.date, value: Number.isFinite(base) && base !== 0 ? (point.value / base) * 100 : point.value })),
        };
    });
    return series.length ? { type: 'line', title, unit: 'Índice base 100', note, series } : null;
}

function levelsVisual(title, items, unit, note) {
    const series = items.filter(item => item?.series?.length > 1).map(item => ({ label: item.label, points: item.series }));
    return series.length ? { type: 'line', title, unit, note, series } : null;
}

function categoryVisual(title, headlines) {
    const totals = new Map();
    headlines.forEach(item => {
        const label = item.categoryLabel || item.category || 'Mercados';
        totals.set(label, (totals.get(label) || 0) + 1);
    });
    const bars = [...totals.entries()].map(([label, value]) => ({ label, value }));
    return bars.length ? { type: 'bar', title, unit: 'historias verificadas', note: 'Distribución de la selección de este corte; no mide relevancia por sí sola.', bars } : null;
}

function reportTable(title, columns, rows, note = '') {
    return { title, columns, rows: rows.filter(row => Array.isArray(row) && row.length), note };
}

async function legacyEnrichFinanceExecutiveReports(reports) {
    // Gemini no calcula indicadores ni añade hechos: recibe exclusivamente el
    // corte cuantitativo ya validado para convertirlo en una lectura directiva
    // breve. Si no responde, el reporte determinista sigue siendo completo.
    if (!genAI) return reports;
    const facts = reports.map(report => ({
        key: report.key,
        title: report.title,
        objective: report.objective,
        metrics: (report.metrics || []).map(metric => `${metric.label}: ${metric.value} ${metric.change || ''}`.trim()),
        takeaways: report.takeaways,
        watchlist: report.watchlist,
        headlines: (report.headlines || []).map(item => ({ title: item.title, source: item.source, description: item.description, impact: item.impact })),
    }));
    const prompt = `Eres editor ejecutivo de VALLNEWS. Redacta en español profesional y conciso una lectura para dirección usando ÚNICAMENTE los datos de este JSON. No agregues precios, fechas, causas, titulares, países, porcentajes ni eventos que no estén expresamente en los datos. No des recomendaciones de inversión.

Para cada key devuelve exactamente: hasta 4 conclusiones accionables (takeaways), hasta 3 puntos de monitoreo (watchlist) y un cierre de 2–3 oraciones (closing). Si la evidencia es insuficiente, dilo explícitamente; no la sustituyas con frases genéricas. Devuelve JSON puro: {"reports":[{"key":"","takeaways":[""],"watchlist":[""],"closing":""}]}.

DATOS VERIFICADOS:
${JSON.stringify(facts)}`;
    try {
        const model = genAI.getGenerativeModel({ model: MODEL, generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } });
        const result = await model.generateContent(prompt);
        const raw = result.response.text().trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        const parsed = JSON.parse(raw);
        const byKey = new Map((parsed?.reports || []).filter(item => item?.key).map(item => [item.key, item]));
        return reports.map(report => {
            const editorial = byKey.get(report.key);
            if (!editorial) return report;
            const takeaways = Array.isArray(editorial.takeaways) ? editorial.takeaways.map(value => String(value).trim()).filter(Boolean).slice(0, 4) : [];
            const watchlist = Array.isArray(editorial.watchlist) ? editorial.watchlist.map(value => String(value).trim()).filter(Boolean).slice(0, 3) : [];
            const closing = String(editorial.closing || '').trim().slice(0, 900);
            const aiReading = [
                takeaways.length && `Conclusiones de VALL AI:\n${takeaways.map((item, index) => `${index + 1}. ${item}`).join('\n')}`,
                watchlist.length && `\nContrastes sugeridos:\n${watchlist.map((item, index) => `${index + 1}. ${item}`).join('\n')}`,
                closing && `\nCierre editorial:\n${closing}`,
            ].filter(Boolean).join('\n');
            return {
                ...report,
                // Se mantiene la lista determinista del informe como fuente de
                // decisión. La IA añade contexto separado y trazable, en vez
                // de reemplazar alertas específicas por una paráfrasis genérica.
                sections: aiReading ? [...(report.sections || []), { heading: 'Lectura complementaria de VALL AI', text: aiReading }] : report.sections,
                aiBrief: { generated: true, label: 'Lectura complementaria de VALL AI' },
            };
        });
    } catch (error) {
        console.warn('[finance-reports] Edición ejecutiva Gemini no disponible:', error.message);
        return reports;
    }
}

// Conservamos la implementación anterior arriba como referencia durante la
// migración. El agente compartido se usa tanto en Finanzas como en Mercados y
// aplica el mismo contrato editorial y de trazabilidad.
async function enrichFinanceExecutiveReports(reports) {
    return executiveReportAgent.enrich(reports, { area: 'Finanzas' });
}

function executiveDocument(report) {
    const metrics = (report.metrics || []).map(metric => `- **${metric.label}:** ${metric.value}${metric.change ? ` (${metric.change})` : ''}`).join('\n');
    const takeaways = (report.takeaways || []).map((item, index) => `${index + 1}. ${item}`).join('\n');
    const watchlist = (report.watchlist || []).map((item, index) => `${index + 1}. ${item}`).join('\n');
    const tables = (report.tables || []).map(table => {
        const header = `| ${table.columns.join(' | ')} |\n| ${table.columns.map(() => '---').join(' | ')} |`;
        const rows = table.rows.map(row => `| ${row.map(value => String(value).replace(/\|/g, '/')).join(' | ')} |`).join('\n');
        return `## ${table.title}\n${header}\n${rows}${table.note ? `\n\nNota: ${table.note}` : ''}`;
    }).join('\n\n');
    const sections = (report.sections || []).map(section => `## ${section.heading}\n${section.text}`).join('\n\n');
    const context = {
        equities: 'La renta variable debe leerse separando una variación de sesión de una tendencia de inversión. Los índices reúnen compañías sensibles a resultados, tasas, crecimiento y flujos internacionales. La volatilidad implícita aporta contexto de incertidumbre, pero no es un pronóstico direccional. Para dirección, el valor del corte está en identificar qué referencias cambian, qué calendario puede explicarlo y si se requiere revisar exposición, liquidez o límites internos.',
        bonds: 'La curva de rendimientos resume expectativas sobre inflación, crecimiento, política monetaria y financiamiento soberano. La relación entre plazos cortos y largos es una señal de contexto, no una explicación suficiente de crédito, divisas o acciones. Los instrumentos de mayor duración suelen reaccionar más a cambios de tasas. Conviene vigilar inflación, empleo, subastas y decisiones de bancos centrales antes de convertir este corte en una decisión de deuda o cobertura.',
        fx: 'Los tipos de cambio de referencia describen precios relativos frente al dólar al momento del corte. No incluyen completamente spread, liquidez, hora de ejecución ni costos de cobertura; no son una oferta de compra o venta. La revisión ejecutiva debe relacionarlos con ingresos, compras, deuda y contratos. Diferenciales de tasas, inflación, flujos comerciales y eventos de riesgo pueden alterar los cruces con rapidez.',
        daily_news: 'Los titulares se presentan como agenda de verificación y no como evidencia concluyente. Cada nota debe revisarse en su fuente original para confirmar fecha, alcance y actualizaciones. En una reunión ejecutiva, la agenda sirve para asignar seguimiento: identificar exposición, dato de confirmación, escenario relevante y responsable de vigilarlo. El informe no convierte titulares en recomendaciones financieras.',
        overview: 'El panorama integrado evita leer cada mercado de forma aislada. La renta variable aporta una señal de apetito o cautela, los bonos muestran el contexto de tasas, las divisas reflejan precios relativos y las noticias identifican catalizadores que requieren validación. Estas capas pueden tener horarios de actualización distintos, por lo que una coincidencia temporal no implica causalidad. Su función es priorizar preguntas, exposición y seguimiento, no automatizar decisiones.',
    };
    return [
        `# VALLNEWS · Informe ejecutivo: ${report.title}`,
        `**Corte:** ${new Date(report.generatedAt).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })}`,
        `## Objetivo\n${report.objective || `Este documento presenta una lectura ejecutiva de ${report.eyebrow || report.title} a partir de fuentes conectadas.`} No constituye una recomendación de inversión ni una cotización operable.`,
        `## Indicadores del corte\n${metrics || 'No hubo indicadores verificables suficientes para este corte.'}`,
        `## Resumen ejecutivo\n${report.summary || 'No hay un resumen disponible para este corte.'}`,
        takeaways && `## Conclusiones clave\n${takeaways}`,
        tables,
        sections,
        watchlist && `## Qué monitorear\n${watchlist}`,
        `## Interpretación ejecutiva\n${context[report.key] || context.overview}\n\nEl uso recomendado es contrastar este corte con el horizonte, moneda funcional, exposición real y política de riesgo de la organización. Antes de ejecutar una operación deben validarse precios operables, contraparte, plazo, liquidez y límites aprobados.`,
        `## Riesgos y decisiones de seguimiento\nLos mercados pueden variar después de la hora de corte por publicaciones, eventos geopolíticos, liquidez o revisiones de los proveedores. Antes de circular una cifra, validar fecha, unidad, moneda y fuente primaria. Cuando exista exposición material, complementar esta lectura con escenarios, pruebas de sensibilidad, calendario de vencimientos y revisión de especialistas internos o asesores autorizados.`,
        `## Fuentes y trazabilidad\n${(report.sources || []).map(source => `- ${source}`).join('\n') || '- Sin fuente disponible en este corte.'}\n\nLos informes se actualizan en ciclos de doce horas. Las fuentes pueden reportar horarios distintos; cada indicador debe leerse junto con su proveedor y no como una serie perfectamente sincronizada.`,
        `## Conclusión\n${report.closing || 'El informe ofrece una base verificable para priorizar preguntas y acciones de seguimiento. La decisión apropiada depende de objetivos, plazos, restricciones y exposición específica de quien lo consulta.'}`,
    ].filter(Boolean).join('\n\n');
}

async function buildExecutiveReports() {
    const [equitySettled, bondSettled, fxResult, fxHistoryResult, newsResult] = await Promise.all([
        Promise.allSettled([
            reportYahoo('^GSPC', 'S&P 500'), reportYahoo('^IXIC', 'Nasdaq Composite'),
            reportYahoo('^DJI', 'Dow Jones'), reportYahoo('^MXX', 'S&P/BMV IPC'), reportYahoo('^VIX', 'VIX'),
        ]),
        Promise.allSettled([
            reportYahoo('^IRX', 'Treasury 3 meses'), reportYahoo('^TNX', 'Treasury 10 años'), reportYahoo('^TYX', 'Treasury 30 años'),
        ]),
        financeExecutiveFxSnapshot(),
        reportYahoo('MXN=X', 'USD/MXN').catch(error => {
            console.warn('[finance-reports] Serie histórica USD/MXN no disponible:', error.message);
            return null;
        }),
        financeExecutiveNewsSnapshot(),
    ]);

    const equities = equitySettled.filter(item => item.status === 'fulfilled').map(item => item.value);
    const bonds = bondSettled.filter(item => item.status === 'fulfilled').map(item => item.value);
    // Las dos primeras colecciones se resuelven por instrumento y pueden tener
    // fallas parciales. Divisas y Daily News ya devuelven arreglos/objetos
    // tolerantes a errores, así que aquí se consumen directamente; antes se
    // intentaba leerles `.status` y se descartaban datos válidos por completo.
    const fx = Array.isArray(fxResult) ? fxResult : [];
    const fxHistory = fxHistoryResult && typeof fxHistoryResult === 'object' ? fxHistoryResult : null;
    const news = newsResult && typeof newsResult === 'object' ? newsResult : { noticias: [], briefing: [], fuente: '' };
    const generatedAt = new Date().toISOString();
    const leaders = equities.filter(item => item.symbol !== '^VIX').sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity));
    const risk = equities.find(item => item.symbol === '^VIX');
    const short = bonds.find(item => item.symbol === '^IRX');
    const long = bonds.find(item => item.symbol === '^TNX');
    const curve = Number.isFinite(short?.value) && Number.isFinite(long?.value) ? long.value - short.value : null;
    const mxn = fx.find(item => item.code === 'MXN');
    const headlines = (news.noticias || []).slice(0, 5).map(item => ({
        title: item.title, source: item.source, url: item.url, impact: item.impact,
        description: item.description || '', insight: item.insight || '',
        category: item.category || '', categoryLabel: item.categoryLabel || '', publishedAt: item.publishedAt || null,
    }));
    const laggards = [...leaders].reverse();
    const equityVisual = indexedVisual('Índices: evolución relativa', equities.filter(item => item.symbol !== '^VIX'), 'Base 100 en el primer cierre del periodo mostrado; permite comparar direcciones, no niveles absolutos.');
    const bondVisual = levelsVisual('Curva Treasury: evolución de rendimientos', bonds, '%', 'Rendimientos de referencia; el movimiento diario se expresa en puntos base dentro de la tabla.');
    const fxVisual = fxHistory ? levelsVisual('USD/MXN: trayectoria reciente', [fxHistory], 'pesos por dólar', 'Serie diaria de Yahoo Finance; la cotización puntual del informe proviene de ExchangeRate-API.') : null;
    const newsVisual = categoryVisual('Agenda del corte por tema', headlines);

    const reports = [
        {
            key: 'equities', title: 'Bolsa', eyebrow: 'Renta variable global',
            objective: 'Dar a dirección una lectura ejecutiva de la renta variable de Estados Unidos y México: tendencia, dispersión entre índices, volatilidad implícita y los puntos que pueden alterar el tono de la semana.',
            summary: equities.length ? `Cinco referencias de renta variable muestran el cierre disponible. ${leaders[0] ? `${leaders[0].label} lidera la sesión (${performanceLabel(leaders[0].performance?.day)});` : ''}${laggards[0] ? ` ${laggards[0].label} registra la variación relativa más débil (${performanceLabel(laggards[0].performance?.day)}).` : ''}` : 'No hubo suficientes cotizaciones verificables para elaborar el corte de bolsa.',
            metrics: equities.map(item => ({ label: item.label, value: reportNumber(item.value), change: performanceLabel(item.performance?.day), tone: item.change >= 0 ? 'up' : 'down' })),
            takeaways: [
                leaders[0] && `${leaders[0].label} encabeza el movimiento diario (${performanceLabel(leaders[0].performance?.day)}), con ${performanceLabel(leaders[0].performance?.month)} acumulado en el último mes.`,
                laggards[0] && `${laggards[0].label} es la referencia más rezagada de la sesión (${performanceLabel(laggards[0].performance?.day)}); conviene diferenciar ese cierre de su lectura YTD (${performanceLabel(laggards[0].performance?.ytd)}).`,
                risk && `El VIX cerró en ${reportNumber(risk.value)} (${performanceLabel(risk.performance?.day)} diario). Es una medida de volatilidad implícita y no una proyección de dirección.`,
            ].filter(Boolean),
            watchlist: [
                'Publicaciones de inflación y empleo de Estados Unidos, por su efecto sobre tasas y valuaciones.',
                'Resultados corporativos y revisiones de utilidades en los índices que concentran mayor ponderación.',
                'Cambios simultáneos en VIX, Treasury y dólar que puedan confirmar o cuestionar el movimiento de las acciones.',
            ],
            closing: 'La lectura no muestra una “bolsa global” completa: concentra referencias estadounidenses y el IPC mexicano. Úsala para detectar dirección y volatilidad; cualquier exposición sectorial o geográfica debe contrastarse con sus índices y precios específicos.',
            tables: [reportTable('Tabla de desempeño por referencia', ['Referencia', 'Último', 'Día', '5 sesiones', '1 mes', 'YTD'], equities.map(item => [item.label, reportNumber(item.value), performanceLabel(item.performance?.day), performanceLabel(item.performance?.week), performanceLabel(item.performance?.month), performanceLabel(item.performance?.ytd)]), 'Porcentajes calculados con cierres diarios de Yahoo Finance. El VIX se muestra como contexto de volatilidad, no como índice de retorno.')],
            visuals: [equityVisual].filter(Boolean),
            sections: [
                { heading: 'Lectura de tendencia y dispersión', text: `La gráfica normaliza cada índice a 100 al inicio del periodo para hacer visible la diferencia de dirección entre referencias con niveles muy distintos. ${leaders[0] ? `${leaders[0].label} aporta la mejor señal diaria del grupo, mientras que ${laggards[0]?.label || 'la referencia más débil'} sirve como contraste.` : 'No hubo suficientes series comparables para medir dispersión.'}` },
                { heading: 'Volatilidad y participación', text: risk ? `El VIX en ${reportNumber(risk.value)} contextualiza la prima de incertidumbre implícita. No sustituye datos de volumen, amplitud de mercado ni resultados corporativos; esos indicadores deben revisarse en la fuente primaria antes de atribuir una causa al movimiento.` : 'La fuente no devolvió una lectura verificable de volatilidad para este corte.' },
                { heading: 'Pregunta para comité', text: '¿El movimiento de los índices cambia una exposición real o sólo modifica la valoración de corto plazo? Define el activo, el horizonte y la señal que confirmaría o invalidaría la hipótesis antes de actuar.' },
            ],
            sources: sourceList(equities.map(item => item.source)), sourceSnapshot: { equities }, generatedAt,
        },
        {
            key: 'bonds', title: 'Bonos', eyebrow: 'Curva soberana de EE. UU.',
            objective: 'Interpretar la evolución de tasas soberanas, la pendiente de la curva Treasury y la sensibilidad de duración para distinguir entre movimientos de corto plazo y cambios que requieren revisar financiamiento o valuación.',
            summary: bonds.length ? `La curva compara tres vencimientos Treasury. ${Number.isFinite(curve) ? `El diferencial 10 años–3 meses es ${curve.toFixed(2)} puntos porcentuales y la curva está ${curve >= 0 ? 'positiva' : 'invertida'}.` : ''}` : 'No hubo suficientes rendimientos verificables para construir la lectura de bonos.',
            metrics: bonds.map(item => ({ label: item.label, value: `${reportNumber(item.value)}%`, change: bpsLabel(item.delta), tone: item.delta <= 0 ? 'up' : 'down' })),
            takeaways: [
                Number.isFinite(curve) && `La pendiente 10 años–3 meses es de ${curve.toFixed(2)} pp; describe la relación entre plazos, no una predicción automática de crecimiento o recesión.`,
                long && `El Treasury a 10 años cerró en ${reportNumber(long.value)}%, con un cambio diario de ${bpsLabel(long.delta)} y variación mensual de ${performanceLabel(long.performance?.month)}.`,
                short && `El tramo a 3 meses se ubicó en ${reportNumber(short.value)}%; su comparación con el largo ayuda a dimensionar el costo relativo de duración.`,
            ].filter(Boolean),
            watchlist: [
                'Inflación, empleo y decisiones de bancos centrales que puedan mover expectativas de política monetaria.',
                'Subastas soberanas, demanda de duration y cambios en primas por plazo.',
                'Spreads de crédito corporativo y soberano: no se infieren de Treasury y requieren su propia fuente.',
            ],
            closing: 'Treasury es una referencia de tasa libre de riesgo estadounidense, no una cotización de deuda corporativa ni mexicana. Para deuda, crédito o cobertura, traduce esta señal a moneda, plazo, tasa fija/variable y sensibilidad específicos.',
            tables: [reportTable('Curva de rendimientos y variaciones', ['Vencimiento', 'Nivel', 'Día', '5 sesiones', '1 mes', 'YTD'], bonds.map(item => [item.label, `${reportNumber(item.value)}%`, bpsLabel(item.delta), performanceLabel(item.performance?.week), performanceLabel(item.performance?.month), performanceLabel(item.performance?.ytd)]), 'El cambio diario se expresa en puntos base; los demás cambios son porcentuales sobre el rendimiento publicado.')],
            visuals: [bondVisual].filter(Boolean),
            sections: [
                { heading: 'Curva, duración y riesgo de tasa', text: Number.isFinite(curve) ? `La relación entre el tramo largo y el corto es ${curve >= 0 ? 'positiva' : 'invertida'} en este corte. La gráfica conserva cada rendimiento en porcentaje para que se vea si el movimiento está concentrado en el tramo corto, medio o largo.` : 'No se pudo calcular la pendiente por falta de dos vencimientos comparables.' },
                { heading: 'Crédito y transmisión financiera', text: 'Los Treasury muestran la referencia soberana; no explican por sí solos el costo de crédito corporativo. Para una lectura de financiamiento completa deben añadirse spread de la contraparte, moneda, garantía, liquidez, plazo y condiciones de la emisión.' },
                { heading: 'Pregunta para comité', text: '¿Un cambio de tasas de esta magnitud altera el presupuesto financiero, la duración objetivo o la valuación de un activo? Si la respuesta es sí, cuantifica sensibilidad antes de modificar cobertura o fondeo.' },
            ],
            sources: sourceList(bonds.map(item => item.source)), sourceSnapshot: { bonds, curve10y3m: curve }, generatedAt,
        },
        {
            key: 'fx', title: 'Divisas', eyebrow: 'Tipos de cambio de referencia',
            objective: 'Identificar la referencia vigente del dólar frente a monedas clave, separar la cotización puntual de su trayectoria reciente y traducirla en preguntas para costos, compras, exportaciones, deuda y cobertura.',
            summary: fx.length ? `El corte presenta ${fx.length} equivalencias verificables frente al dólar estadounidense. ${mxn ? `USD/MXN se ubicó en ${reportNumber(mxn.value, 4)} según la referencia disponible.` : 'USD/MXN no fue devuelto por el proveedor en este corte.'}${fxHistory ? ` La serie diaria muestra ${performanceLabel(fxHistory.performance?.month)} en un mes y ${performanceLabel(fxHistory.performance?.ytd)} YTD para USD/MXN.` : ''}` : 'No hubo suficientes tipos de cambio verificables para elaborar la lectura de divisas.',
            metrics: fx.map(item => ({ label: item.label, value: reportNumber(item.value, 4), change: 'Referencia', tone: 'flat' })),
            takeaways: [
                mxn && `USD/MXN se ubica en ${reportNumber(mxn.value, 4)} como tipo de referencia; no equivale a un precio ejecutable de banco, tarjeta o mesa de cambios.`,
                fxHistory && `La serie USD/MXN acumula ${performanceLabel(fxHistory.performance?.week)} en 5 sesiones, ${performanceLabel(fxHistory.performance?.month)} en un mes y ${performanceLabel(fxHistory.performance?.ytd)} en el año.`,
                'EUR, JPY, GBP y CAD permiten observar el dólar frente a otras monedas, pero no sustituyen una medición de exposición neta por país, contrato o moneda funcional.',
            ].filter(Boolean),
            watchlist: [
                'Diferenciales de tasas, inflación y comunicados de bancos centrales relevantes para cada par.',
                'Flujos comerciales, materias primas y eventos de riesgo que puedan afectar costos de importación o competitividad exportadora.',
                'Precio operable, spread, fecha de liquidación y contraparte antes de usar una referencia en presupuesto o cobertura.',
            ],
            closing: 'Las divisas se deben leer contra el flujo que realmente expone a la organización. Una cotización de pantalla es un punto de partida: la decisión exige monto, horizonte, moneda funcional y precio de ejecución verificable.',
            tables: [reportTable('Cotizaciones de referencia frente al dólar', ['Par', 'Referencia', 'Uso de lectura'], fx.map(item => [item.label, reportNumber(item.value, 4), item.code === 'MXN' ? 'Costo, importaciones y flujos en pesos' : 'Comparativo internacional frente a USD']), 'Las cotizaciones provienen de ExchangeRate-API. USD/MXN añade una serie histórica separada de Yahoo Finance para el gráfico.')],
            visuals: [fxVisual].filter(Boolean),
            sections: [
                ...fxNarrative(fx),
                { heading: 'Trayectoria y sensibilidad de USD/MXN', text: fxHistory ? `La gráfica usa cierres diarios de USD/MXN para contextualizar la referencia actual. La variación de 5 sesiones es ${performanceLabel(fxHistory.performance?.week)}, la de un mes ${performanceLabel(fxHistory.performance?.month)} y la YTD ${performanceLabel(fxHistory.performance?.ytd)}. No atribuye causalidad: para hacerlo se necesitarían fechas, flujos y eventos confirmados.` : 'No se obtuvo una serie histórica verificable para USD/MXN en este corte; se mantiene la referencia puntual sin inferir una tendencia.' },
                { heading: 'Pregunta para comité', text: '¿Qué ingresos, compras, deuda o contratos están expuestos a cada moneda y desde qué nivel de tipo de cambio cambia el margen? Establece ese umbral antes de discutir una cobertura.' },
            ],
            sources: sourceList([...fx.map(item => item.source), fxHistory?.source]), sourceSnapshot: { fx, fxHistory }, generatedAt,
        },
        {
            key: 'daily_news', title: 'Daily News', eyebrow: 'Agenda financiera verificada',
            objective: 'Convertir cinco noticias verificadas en una agenda financiera: qué ocurrió, qué activo o variable puede tocar, qué debe confirmarse y qué señales conviene seguir, sin confundir titulares con evidencia concluyente.',
            summary: headlines.length ? `El corte reúne ${headlines.length} historias verificadas. Cada una presenta primero el titular y después el contexto disponible; las fuentes y enlaces originales se concentran al final del informe.` : 'No llegaron titulares verificables de las fuentes conectadas para este corte.',
            metrics: headlines.slice(0, 4).map(item => ({ label: item.categoryLabel || 'Mercados', value: 'Historia verificada', change: item.impact ? `Impacto ${item.impact}` : 'Validar alcance', tone: 'flat' })),
            takeaways: headlines.slice(0, 5).map((item, index) => `${index + 1}. ${financeNewsHeadline(item)} — ${financeNewsDescription(item)}`),
            watchlist: [
                'Confirmar desarrollo, fecha, alcance geográfico y activo afectado en el enlace original de cada noticia.',
                'Separar un titular de un cambio de precio confirmado; revisar mercado, tasas o divisas antes de asociar causalidad.',
                'Asignar responsable y señal de confirmación cuando una noticia afecte una exposición material de la organización.',
            ],
            closing: 'Este informe prioriza verificación y contexto. No convierte titulares en recomendación financiera ni presupone que un hecho publicado ya esté reflejado en los precios.',
            tables: [reportTable('Cinco noticias y frente de seguimiento', ['Titular', 'De qué trata', 'Tema', 'Qué confirmar'], headlines.map(item => [financeNewsHeadline(item), financeNewsDescription(item).slice(0, 260), item.categoryLabel || 'Mercados', `Impacto ${item.impact || 'medio'} · validar alcance`]), 'La tabla prioriza el hecho y su contexto. Las fuentes y enlaces originales se reúnen al final del informe para no interrumpir la lectura.')],
            visuals: [newsVisual].filter(Boolean),
            sections: [
                ...newsNarrative(headlines, news.briefing || []),
                { heading: 'Qué debemos vigilar', text: headlines.length ? 'El seguimiento parte de los cinco hechos listados y no añade eventos no confirmados. Para cada nota, vigila actualizaciones del medio, reacciones de los activos expuestos y datos oficiales que puedan confirmar o matizar el impacto.' : 'No se construye una agenda de eventos cuando no existen historias verificables.' },
                { heading: 'Pregunta para comité', text: '¿Cuál de estas historias toca una exposición concreta y qué dato adicional debe aparecer antes de escalarla como riesgo, oportunidad o decisión operativa?' },
            ],
            sourceLinks: financeNewsSourceLinks(headlines), headlines,
            sources: financeNewsSources(news.fuente, headlines), sourceSnapshot: { headlines, briefing: news.briefing || [] }, generatedAt,
        },
        {
            key: 'overview', title: 'Panorama general', eyebrow: 'Síntesis de los cuatro frentes',
            objective: 'Entregar a dirección una síntesis de bolsa, tasas, divisas y noticias sin repetir los informes especializados: cinco hechos, sus riesgos asociados y las prioridades de vigilancia del siguiente periodo.',
            summary: `Corte integrado de bolsa, bonos, divisas y noticias. ${leaders[0] ? `En renta variable destacó ${leaders[0].label} (${performanceLabel(leaders[0].performance?.day)}). ` : ''}${Number.isFinite(curve) ? `La pendiente Treasury 10A–3M fue ${curve.toFixed(2)} pp. ` : ''}${mxn ? `USD/MXN: ${reportNumber(mxn.value, 4)}.` : ''}`.trim(),
            metrics: [
                leaders[0] && { label: leaders[0].label, value: reportNumber(leaders[0].value), change: performanceLabel(leaders[0].performance?.day), tone: leaders[0].change >= 0 ? 'up' : 'down' },
                long && { label: 'Treasury 10 años', value: `${reportNumber(long.value)}%`, change: bpsLabel(long.delta), tone: long.delta <= 0 ? 'up' : 'down' },
                mxn && { label: 'USD/MXN', value: reportNumber(mxn.value, 4), change: 'Referencia', tone: 'flat' },
                headlines[0] && { label: 'Noticia líder', value: headlines[0].source || 'Fuente', change: headlines[0].impact || '', tone: 'flat' },
            ].filter(Boolean),
            takeaways: [
                leaders[0] && `Bolsa: ${leaders[0].label} lidera la variación diaria con ${performanceLabel(leaders[0].performance?.day)}; la comparación mensual es ${performanceLabel(leaders[0].performance?.month)}.`,
                long && `Tasas: Treasury a 10 años en ${reportNumber(long.value)}% (${bpsLabel(long.delta)} diario); la pendiente 10A–3M es ${Number.isFinite(curve) ? `${curve.toFixed(2)} pp` : 'no disponible'}.`,
                mxn && `Divisas: USD/MXN se ubica en ${reportNumber(mxn.value, 4)} como referencia de mercado; revisar precio operable si existe exposición material.`,
                headlines[0] && `Noticias: ${headlines[0].title} es el principal hecho del corte y debe validarse en ${headlines[0].source || 'la fuente original'}.`,
            ].filter(Boolean),
            watchlist: [
                'Inflación, empleo y bancos centrales, porque pueden conectar el movimiento de tasas con acciones y divisas.',
                'Volatilidad implícita, curva Treasury y USD/MXN en conjunto; ninguna referencia aislada explica el entorno completo.',
                'Las cinco historias verificadas y sus actualizaciones en la fuente primaria antes de escalar conclusiones.',
            ],
            closing: 'El panorama integra señales con horarios de corte distintos y no establece causalidad automática entre ellas. Sirve para priorizar preguntas y exposición; los informes especializados contienen el detalle de cada frente.',
            tables: [reportTable('Tablero ejecutivo del corte', ['Frente', 'Señal actual', 'Lectura', 'Qué vigilar'], [
                leaders[0] && ['Bolsa', `${leaders[0].label} ${performanceLabel(leaders[0].performance?.day)}`, `Mes: ${performanceLabel(leaders[0].performance?.month)}`, 'Volatilidad, resultados y datos macro'],
                long && ['Bonos', `10 años ${reportNumber(long.value)}%`, `Día: ${bpsLabel(long.delta)}`, 'Inflación, empleo y subastas'],
                mxn && ['Divisas', `USD/MXN ${reportNumber(mxn.value, 4)}`, fxHistory ? `Mes: ${performanceLabel(fxHistory.performance?.month)}` : 'Sin serie mensual', 'Precio operable y exposición neta'],
                headlines[0] && ['Noticias', headlines[0].categoryLabel || 'Mercados', headlines[0].source || 'Fuente conectada', 'Actualización de la fuente primaria'],
            ].filter(Boolean), 'El tablero condensa referencias; no reemplaza el detalle de los cuatro informes especializados.')],
            visuals: [equityVisual, bondVisual, fxVisual, newsVisual].filter(Boolean),
            sections: [
                { heading: 'Cinco hechos principales', text: 'El resumen superior reúne los hechos disponibles de acciones, tasas, divisas y noticias. La intención es identificar coincidencias o tensiones entre señales, no afirmar que una variable causó el movimiento de otra.' },
                { heading: 'Riesgos principales', text: 'El principal riesgo de interpretación es mezclar datos con distintas horas de corte o usar una referencia como precio ejecutable. Una tasa Treasury, un tipo de cambio de referencia y un titular requieren validación adicional antes de convertirlos en una decisión.' },
                { heading: 'Comparación temporal', text: `La tabla conserva cambios diarios, de cinco sesiones, mensuales y YTD cuando la fuente ofrece serie suficiente. Estos horizontes deben compararse con la exposición y el calendario propio; una diferencia de una sesión no equivale a un cambio estructural.${headlines.length ? ` La agenda informativa del corte contiene ${headlines.length} historias verificadas.` : ''}` },
                { heading: 'Pregunta para comité', text: '¿Qué combinación de bolsa, tasas, divisas y noticias modifica un supuesto del presupuesto, la liquidez o el riesgo operativo? Define la variable, el umbral y el responsable de seguimiento.' },
            ],
            sources: sourceList(['Yahoo Finance', 'ExchangeRate-API', news.fuente]), sourceSnapshot: { leader: leaders[0] || null, curve10y3m: curve, usdmxn: mxn || null, fxHistory, headline: headlines[0] || null }, generatedAt,
        },
    ];
    const enriched = await enrichFinanceExecutiveReports(reports);
    return { reports: enriched.map(report => ({ ...report, content: executiveDocument(report) })), generatedAt };
}

async function refreshExecutiveReports() {
    if (_executiveReportRefresh) return _executiveReportRefresh;
    _executiveReportRefresh = (async () => {
        const previous = _executiveReportMemory || await executiveReportStore.load().catch(() => null);
        const { reports, generatedAt } = await buildExecutiveReports();
        const daily = reports.find(report => report.key === 'daily_news');
        const priorDaily = previous?.reports?.find(report => report.key === 'daily_news');
        const fx = reports.find(report => report.key === 'fx');
        const priorFx = previous?.reports?.find(report => report.key === 'fx');
        // Una interrupción de los proveedores no debe borrar una biblioteca que
        // ya contenía historias. Se conserva el último corte útil, marcado con
        // su fecha, hasta que llegue evidencia nueva; nunca se hace pasar como
        // noticia recién confirmada.
        if (daily && !daily.headlines?.length && priorDaily?.headlines?.length) {
            daily.headlines = priorDaily.headlines;
            daily.summary = `Las fuentes no entregaron historias nuevas para este corte. Se conserva la última selección verificable del ${new Date(priorDaily.generatedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}; valida vigencia antes de usarla.`;
            daily.metrics = priorDaily.metrics || [];
            daily.takeaways = priorDaily.takeaways || priorDaily.headlines.slice(0, 5).map((item, index) => `${index + 1}. ${financeNewsHeadline(item)} — ${financeNewsDescription(item)}`);
            daily.watchlist = priorDaily.watchlist || daily.watchlist;
            daily.tables = priorDaily.tables || [];
            daily.visuals = priorDaily.visuals || [];
            daily.sections = priorDaily.sections || newsNarrative(priorDaily.headlines, []);
            daily.sourceLinks = priorDaily.sourceLinks || financeNewsSourceLinks(priorDaily.headlines);
            daily.sources = sourceList([...(priorDaily.sources || []), 'Último corte verificable conservado por indisponibilidad temporal de fuentes']);
            daily.sourceSnapshot = { ...(priorDaily.sourceSnapshot || {}), preservedFrom: priorDaily.generatedAt };
            daily.content = executiveDocument(daily);
        }
        // La cotización de referencia no se inventa cuando el proveedor está
        // intermitente. En ese caso se conserva el último corte utilizable y
        // se declara su hora de origen para que no parezca una tasa actual.
        if (fx && !fx.metrics?.length && priorFx?.metrics?.length) {
            const preservedFx = priorFx.sourceSnapshot?.fx || [];
            fx.metrics = priorFx.metrics;
            fx.summary = `El proveedor no entregó pares nuevos para este corte. Se conserva la última referencia verificable del ${new Date(priorFx.generatedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}; confirma el tipo de ejecución antes de usarlo.`;
            fx.sections = [
                ...fxNarrative(preservedFx),
                { heading: 'Estado de actualización', text: `Este contenido corresponde al corte anterior (${new Date(priorFx.generatedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}) porque la fuente de tipos de cambio no respondió en la actualización actual.` },
            ];
            fx.sources = sourceList([...(priorFx.sources || []), 'Último corte verificable conservado por indisponibilidad temporal de fuente']);
            fx.sourceSnapshot = { ...(priorFx.sourceSnapshot || {}), preservedFrom: priorFx.generatedAt };
            fx.content = executiveDocument(fx);
        }
        _executiveReportMemory = await executiveReportStore.save(reports, generatedAt).catch(error => {
            console.warn('[finance-reports] No se pudo persistir en Supabase:', error.message);
            return { reports, generatedAt, persistence: 'memory' };
        });
        return _executiveReportMemory;
    })().finally(() => { _executiveReportRefresh = null; });
    return _executiveReportRefresh;
}

function reportIsCurrent(snapshot) {
    return snapshot?.generatedAt && Date.now() - Date.parse(snapshot.generatedAt) < EXECUTIVE_REPORT_TTL;
}

router.get('/finance-executive-reports', verifyToken, async (req, res) => {
    try {
        let snapshot = _executiveReportMemory || await executiveReportStore.load().catch(() => null);
        // El cron de las 09:00 define el corte diario. Sólo se crea un primer
        // corte bajo demanda cuando aún no existe ninguno que mostrar.
        if (!snapshot?.reports?.length) snapshot = await refreshExecutiveReports();
        res.set('Cache-Control', 'private, no-store');
        res.json({ success: true, data: snapshot.reports, generatedAt: snapshot.generatedAt, nextRefreshAt: nextReportRefreshAt(snapshot.generatedAt).toISOString(), persistence: snapshot.persistence });
    } catch (error) {
        console.error('/api/finance-executive-reports:', error.message);
        res.status(502).json({ success: false, error: 'No se pudieron actualizar los informes ejecutivos.' });
    }
});

function allowsReportRefresh(req) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const expected = process.env.CRON_SECRET || process.env.REFRESH_SECRET;
    return Boolean(expected && token && token === expected);
}

router.get('/finance-executive-reports/refresh', async (req, res) => {
    if (!allowsReportRefresh(req)) return res.status(401).json({ success: false, error: 'No autorizado.' });
    try {
        const snapshot = await refreshExecutiveReports();
        res.json({ success: true, generatedAt: snapshot.generatedAt, reports: snapshot.reports.length, persistence: snapshot.persistence });
    } catch (error) {
        console.error('/api/finance-executive-reports/refresh:', error.message);
        res.status(502).json({ success: false, error: 'No se pudieron actualizar los informes.' });
    }
});

router.startExecutiveReportsScheduler = function startExecutiveReportsScheduler() {
    return scheduleDailyReport(refreshExecutiveReports, 'finance-reports');
};
router.refreshExecutiveReports = refreshExecutiveReports;

// ── Proxy de imágenes de noticias ─────────────────────────────────────────────
// Muchas fuentes (Reuters, etc.) bloquean el hotlinking cross-origin. Servimos la
// imagen desde nuestro propio origen para que cargue en el noticiero. Guarda
// anti-SSRF básica: solo http/https y hosts públicos; exige content-type image/*.
/* OJO con los corchetes: `new URL('http://[::1]/').hostname` devuelve '[::1]',
   CON corchetes. La versión anterior comparaba `h === '::1'`, así que nunca
   casaba y `http://[::1]:3101/...` y `http://[::ffff:127.0.0.1]/...` atravesaban
   la guarda y devolvían la imagen interna con un 200. Comprobado.

   Las formas decimal (2130706433) y hexadecimal (0x7f000001) NO hacen falta
   cubrirlas: `new URL()` las normaliza a 127.0.0.1 antes de llegar aquí, y ya
   se bloqueaban. Verificado también.

   Los literales IPv6 se rechazan ENTEROS y no rango por rango: ningún CDN de
   imágenes se direcciona por IPv6 literal —todos son nombres DNS—, así que no
   se pierde nada, y enumerar fc00::/7, fe80::/10 y las formas embebidas de IPv4
   deja siempre una variante fuera. Aquí la lista corta y tajante es la segura. */
function _isPrivateHost(host) {
    const h = (host || '').toLowerCase();
    if (h.startsWith('[')) return true;               // cualquier literal IPv6
    if (h.includes(':')) return true;                 // IPv6 sin corchetes, por si acaso
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
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
        /* Antes era `false` fijo, lo que anulaba la verificación TLS también en
           producción. REJECT_UNAUTHORIZED ya resuelve el caso real: falso solo
           en local/Windows, donde faltan CAs intermedias de algunos CDNs. */
        rejectUnauthorized: REJECT_UNAUTHORIZED,
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; VALLNews/1.0)',
            'Accept':     'image/avif,image/webp,image/*,*/*;q=0.8',
            'Referer':    `${u.protocol}//${u.hostname}/`,
        },
    }, up => {
        const type = up.headers['content-type'] || '';
        if (up.statusCode >= 400 || !/^image\//i.test(type)) { up.resume(); return res.status(502).end(); }
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=259200'); // 24 h edge, 3d stale
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        up.pipe(res);
    });
    upstream.setTimeout(8000, () => { upstream.destroy(); if (!res.headersSent) res.status(504).end(); });
    upstream.on('error', () => { if (!res.headersSent) res.status(502).end(); });
    upstream.end();
});

module.exports = router;

