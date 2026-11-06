'use strict';

/* Cotizaciones físicas de Puebla con Gemini + Google Search.
 *
 * Esta fuente sirve exclusivamente a la tarjeta principal de Mercado
 * Proteínas. No publica futuros de EE.UU., precios nacionales sin ciudad ni
 * menudeo como si fueran una cotización local. Gemini investiga cada especie;
 * el servidor sólo conserva la respuesta si trae mercado, fecha, unidad y al
 * menos una cita de la búsqueda web.
 */
const fs = require('fs');
const path = require('path');
const { CACHE_DIR } = require('./config');
const { externalGet } = require('./http');
const { GeminiProvider } = require('../ai/providers/gemini-provider');

const CACHE_FILE = path.join(CACHE_DIR, 'gemini-wholesale-protein-prices.json');
const TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_SCHEMA = 4;
const MAX_QUOTE_AGE_DAYS = 14;
const ABASTEROS_PUEBLA_BEEF_URL = 'https://abasteros.com/products/91';
const ABASTEROS_PUEBLA_CHICKEN_URL = 'https://abasteros.com/products/87';
const PUEBLA_MARKET = Object.freeze({
    id: 'puebla-puebla', city: 'Puebla, Puebla', country: 'México',
    label: 'Puebla, Puebla · mercado físico',
});

const SPECIES = Object.freeze({
    pork: {
        label: 'Cerdo vivo', unit: 'MXN/kg vivo',
        level: 'Productor a acopiador, rastro o intermediario · no menudeo', min: 20, max: 85,
        query: 'cerdo vivo/en pie vendido por productor a acopiador, rastro o intermediario',
    },
    chicken: {
        label: 'Pollo en canal', unit: 'MXN/kg canal',
        level: 'Mercado mayorista de pollo en canal · no menudeo', min: 20, max: 100,
        query: 'pollo en canal cotizado en un mercado mayorista',
    },
    beef: {
        label: 'Bovino vivo', unit: 'MXN/kg vivo',
        level: 'Mercado mayorista de ganado en pie · no menudeo', min: 20, max: 130,
        query: 'bovino vivo/en pie cotizado en un mercado mayorista',
    },
    egg: {
        label: 'Huevo blanco', unit: 'MXN/kg',
        level: 'Productor/empacador a distribuidor o mayoreo · no menudeo', min: 15, max: 100,
        query: 'huevo blanco por kilogramo vendido por productor o empacador a distribuidor/mayoreo',
    },
});

let memoryCache = null;
let refreshPromise = null;

function mexicoDate() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
}

function positive(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function fixed(value) {
    return Math.round(value * 100) / 100;
}

function normalizedLine(text, name) {
    const match = String(text || '').match(new RegExp(`^${name}\\s*:\\s*(.+)$`, 'im'));
    return match?.[1]?.trim() || '';
}

function parseCommercialLines(text) {
    // Sólo normalizamos coma decimal; no alteramos "Puebla, Puebla" ni la
    // descripción comercial que se muestra al usuario.
    const clean = String(text || '').replace(/(\d),(\d)/g, '$1.$2');
    const price = positive(normalizedLine(clean, 'PRECIO_MXN_KG').replace(/[^\d.]/g, ''));
    const rangeText = normalizedLine(clean, 'RANGO_MXN_KG');
    const range = rangeText.match(/\$?\s*([\d.]+)\s*(?:-|–|a)\s*\$?\s*([\d.]+)/i);
    const quoteDate = normalizedLine(clean, 'FECHA_COTIZACION');
    const market = normalizedLine(clean, 'MERCADO');
    const basis = normalizedLine(clean, 'BASE');
    if (!price || !/^\d{4}-\d{2}-\d{2}$/.test(quoteDate) || !market || !basis) {
        throw new Error('Gemini no devolvió precio, fecha, mercado y base auditables.');
    }
    return {
        price,
        ...(range ? { rangeMin: positive(range[1]), rangeMax: positive(range[2]) } : {}),
        quoteDate,
        market,
        basis,
    };
}

function groundingSources(grounding) {
    const sources = (grounding?.groundingChunks || [])
        .map((chunk) => ({ url: String(chunk?.web?.uri || '').trim(), title: String(chunk?.web?.title || '').trim() }))
        .filter((source) => /^https?:\/\//i.test(source.url));
    return [...new Map(sources.map((source) => [source.url, source])).values()].slice(0, 8);
}

function textFromHtml(value) {
    return String(value || '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#(?:x)?[0-9a-f]+;/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tableRows(html) {
    return [...String(html || '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
        .map((match) => [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => textFromHtml(cell[1])))
        .filter((cells) => cells.length > 0);
}

function parseSniimDate(value) {
    const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function parseShortMexicoDate(value) {
    const match = String(value || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
    if (!match) return null;
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[2]}-${match[1]}`;
}

function quoteAgeDays(quoteDate) {
    const today = Date.parse(`${mexicoDate()}T00:00:00Z`);
    const quote = Date.parse(`${quoteDate}T00:00:00Z`);
    return Number.isFinite(today) && Number.isFinite(quote) ? Math.round((today - quote) / 86_400_000) : null;
}

async function fetchSniimPueblaEgg() {
    const [year, month, day] = mexicoDate().split('-').map(Number);
    const weeks = [Math.ceil(day / 7), Math.max(1, Math.ceil(day / 7) - 1)];
    let lastError;
    for (const week of [...new Set(weeks)]) {
        const params = new URLSearchParams({
            prod: 'H01', destino: '210', sem: String(week), mes: String(month).padStart(2, '0'),
            anio: String(year), RegPag: '100',
        });
        // Hue.asp redirige con 302 a e_Hue.asp y nuestro cliente HTTP no sigue
        // redirecciones a propósito. Consultamos el endpoint final de SNIIM.
        const url = `https://www.economia-sniim.gob.mx/SNIIM-Pecuarios-Nacionales/e_Hue.asp?${params}`;
        try {
            const response = await externalGet(url, {}, 18_000);
            if (!response.ok) throw new Error(`SNIIM respondió HTTP ${response.status}.`);
            const rows = tableRows(await response.text());
            let isPuebla = false;
            for (const cells of rows) {
                if (cells.length === 1 && /PUE:\s*Central de Abasto de Puebla/i.test(cells[0])) {
                    isPuebla = true;
                    continue;
                }
                if (!isPuebla || !/^Huevo blanco$/i.test(cells[1]) || !/^Mayoreo$/i.test(cells[2])) continue;
                const price = positive(String(cells[3] || '').replace(/[$,]/g, ''));
                const rangeMin = positive(String(cells[4] || '').replace(/[$,]/g, ''));
                const rangeMax = positive(String(cells[5] || '').replace(/[$,]/g, ''));
                const quoteDate = parseSniimDate(cells[0]);
                if (price && quoteDate) {
                    return {
                        payload: {
                            price, rangeMin, rangeMax, quoteDate,
                            market: 'Central de Abasto de Puebla, Puebla',
                            basis: 'Huevo blanco · mayoreo · SNIIM',
                        },
                        sources: [{ url, title: 'SNIIM · Huevo blanco mayoreo · Central de Abasto de Puebla' }],
                        model: 'SNIIM',
                        origin: 'SNIIM · dato oficial Puebla',
                    };
                }
            }
            throw new Error('SNIIM no devolvió huevo blanco mayoreo para Puebla.');
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('No se encontró cotización SNIIM de huevo para Puebla.');
}

/* SNIIM no expone actualmente el registro de bovino en pie de Puebla en su
 * formulario público, aunque el dato sí se publica como una fila SNIIM en el
 * historial abierto de Abasteros. Esta segunda fuente no se hace pasar por
 * consulta directa: queda identificada en `source` y sólo se acepta la fila
 * que conserva tanto el mercado de Puebla como la atribución SNIIM. */
function extractAbasterosPueblaSniimQuote(html, product) {
    const row = tableRows(html).find((cells) => (
        cells.length >= 4
        && /^Mercado Mayorista de Puebla\s+Puebla$/i.test(cells[2])
        && /^SNIIM$/i.test(cells[3])
    ));
    if (!row) throw new Error(`Abasteros no devolvió la fila SNIIM de ${product} para Puebla.`);

    const price = positive(String(row[1] || '').replace(/[$,]/g, ''));
    const quoteDate = parseShortMexicoDate(row[0]);
    if (!price || !quoteDate) throw new Error(`La fila de ${product} de Puebla no contiene precio y fecha auditables.`);
    return { price, quoteDate };
}

async function fetchAbasterosPueblaBeef() {
    const response = await externalGet(ABASTEROS_PUEBLA_BEEF_URL, {}, 18_000);
    if (!response.ok) throw new Error(`Abasteros respondió HTTP ${response.status}.`);
    const { price, quoteDate } = extractAbasterosPueblaSniimQuote(await response.text(), 'bovino en pie');
    return {
        payload: {
            price,
            quoteDate,
            market: 'Mercado Mayorista de Puebla, Puebla',
            basis: 'Bovino en pie · mercado mayorista · SNIIM, publicado por Abasteros',
        },
        sources: [{
            url: ABASTEROS_PUEBLA_BEEF_URL,
            title: 'Abasteros · Ganado bovino en pie · Mercado Mayorista de Puebla · fuente SNIIM',
        }],
        model: 'SNIIM vía Abasteros',
        origin: 'SNIIM · Mercado Mayorista de Puebla (publicado por Abasteros)',
    };
}

async function fetchAbasterosPueblaChicken() {
    const response = await externalGet(ABASTEROS_PUEBLA_CHICKEN_URL, {}, 18_000);
    if (!response.ok) throw new Error(`Abasteros respondió HTTP ${response.status}.`);
    const { price, quoteDate } = extractAbasterosPueblaSniimQuote(await response.text(), 'pollo en canal');
    return {
        payload: {
            price,
            quoteDate,
            market: 'Mercado Mayorista de Puebla, Puebla',
            basis: 'Pollo en canal · mercado mayorista · SNIIM, publicado por Abasteros',
        },
        sources: [{
            url: ABASTEROS_PUEBLA_CHICKEN_URL,
            title: 'Abasteros · Pollo en canal · Mercado Mayorista de Puebla · fuente SNIIM',
        }],
        model: 'SNIIM vía Abasteros',
        origin: 'SNIIM · Mercado Mayorista de Puebla (publicado por Abasteros)',
    };
}

function unavailablePrice(key, reason) {
    const meta = SPECIES[key];
    return {
        available: false,
        label: meta.label,
        unit: meta.unit,
        level: meta.level,
        market: PUEBLA_MARKET.label,
        error: String(reason || 'No se pudo verificar una cotización local.').slice(0, 240),
        sourceUrls: [],
    };
}

function normalizePrice(key, raw, sources, origin = 'Gemini + Google Search · evidencia local') {
    const meta = SPECIES[key];
    const price = positive(raw?.price);
    const min = positive(raw?.rangeMin);
    const max = positive(raw?.rangeMax);
    const market = String(raw?.market || '').replace(/\s+/g, ' ').trim();
    const quoteDate = String(raw?.quoteDate || '').trim();
    if (!price || price < meta.min || price > meta.max) {
        throw new Error(`La cotización de ${key} está fuera del rango permitido.`);
    }
    if ((min && min < meta.min) || (max && max > meta.max) || (min && max && min > max)) {
        throw new Error(`El rango de ${key} es inválido.`);
    }
    if (min && max && (price < min || price > max)) {
        throw new Error(`El precio de ${key} no pertenece a su rango declarado.`);
    }
    if (!/puebla/i.test(market)) {
        throw new Error(`La respuesta de ${key} no identifica un mercado de Puebla.`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(quoteDate)) {
        throw new Error(`La cotización de ${key} no trae fecha ISO verificable.`);
    }
    const ageDays = quoteAgeDays(quoteDate);
    if (ageDays == null || ageDays < -1 || ageDays > MAX_QUOTE_AGE_DAYS) {
        throw new Error(`La cotización de ${key} no es reciente (máximo ${MAX_QUOTE_AGE_DAYS} días).`);
    }
    if (!sources.length) throw new Error(`La cotización de ${key} no trae fuentes web.`);

    return {
        available: true,
        price: fixed(price),
        ...(min ? { rangeMin: fixed(min) } : {}),
        ...(max ? { rangeMax: fixed(max) } : {}),
        displayPrice: `$${fixed(price).toFixed(2)} ${meta.unit}`,
        observations: 1,
        date: quoteDate,
        market,
        label: meta.label,
        unit: meta.unit,
        level: meta.level,
        source: origin,
        sourceUrls: sources.map((source) => source.url),
        note: String(raw?.basis || '').slice(0, 240),
    };
}

function cacheIsFresh(cache) {
    const retrievedAt = Date.parse(cache?.retrievedAt);
    return cache?.schemaVersion === CACHE_SCHEMA
        && cache?.market?.id === PUEBLA_MARKET.id
        && Number.isFinite(retrievedAt)
        && Date.now() - retrievedAt < TTL_MS;
}

function unavailable(error = 'La actualización de Puebla está en proceso o no pudo validarse.') {
    return {
        available: false,
        schemaVersion: CACHE_SCHEMA,
        market: PUEBLA_MARKET,
        refreshHours: 12,
        source: 'Gemini + Google Search · Puebla',
        prices: Object.fromEntries(Object.keys(SPECIES).map((key) => [key, unavailablePrice(key, error)])),
        error,
    };
}

function withTimeout(promise, milliseconds) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Gemini excedió el tiempo máximo de actualización.')), milliseconds);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function readDiskCache() {
    try {
        const disk = JSON.parse(await fs.promises.readFile(CACHE_FILE, 'utf8'));
        return disk?.schemaVersion === CACHE_SCHEMA && disk?.market?.id === PUEBLA_MARKET.id ? disk : null;
    } catch {
        return null;
    }
}

async function writeCache(data) {
    try {
        await fs.promises.writeFile(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('[Gemini precios Puebla] No se pudo guardar caché:', error.message);
    }
}

function buildPrompt(key) {
    const meta = SPECIES[key];
    return `Hoy es ${mexicoDate()} en México. Investiga una cotización física actual de ${meta.query} EN PUEBLA, PUEBLA, MÉXICO.\n\n`
        + 'El punto geográfico no es negociable: usa Central de Abasto de Puebla, rastro, mercado ganadero o un proveedor/localizador comercial de Puebla que indique expresamente Puebla. '
        + 'No uses una cifra nacional, de otro estado, de Estados Unidos, de futuros, de supermercado, de carnicería ni de consumidor final. '
        + 'Privilegia SNIIM/Secretaría de Economía, una central de abasto o un boletín sectorial fechado. '
        + 'Si sólo encuentras precio por pieza, docena o libra, no lo conviertas sin que la fuente ofrezca la equivalencia.\n\n'
        + `La cotización debe corresponder al nivel: ${meta.level}.\n\n`
        + 'Tras buscar, responde SÓLO estas cinco líneas, sin Markdown ni texto adicional:\n'
        + 'PRECIO_MXN_KG: 38.00\nRANGO_MXN_KG: 36.00 - 40.00\nFECHA_COTIZACION: 2026-09-17\nMERCADO: Central de Abasto de Puebla, Puebla\nBASE: descripción exacta del nivel comercial';
}

async function querySpecies(provider, key) {
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
            const result = await withTimeout(provider.generate({
                prompt: `${buildPrompt(key)}\nIMPORTANTE: usa Google Search; no respondas desde memoria.`,
                systemInstruction: 'Eres un verificador de precios pecuarios. Publicas sólo una cotización física localizada en Puebla, Puebla, con fecha, unidad, nivel comercial y evidencia web. Si no hay evidencia local suficiente, no inventes datos.',
                tier: 'flash',
                json: false,
                tools: [{ googleSearch: {} }],
                maxOutputTokens: 900,
            }), 35_000);
            const sources = groundingSources(result.grounding);
            const payload = parseCommercialLines(result.text);
            return { payload, sources, model: result.model };
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}

async function generateFreshPrices() {
    const provider = new GeminiProvider();
    if (!provider.isConfigured()) throw new Error('Gemini no está configurado.');
    const keys = Object.keys(SPECIES);
    const results = await Promise.allSettled(keys.map(async (key) => [
        key,
        key === 'egg' ? await fetchSniimPueblaEgg()
            : key === 'beef' ? await fetchAbasterosPueblaBeef()
                : key === 'chicken' ? await fetchAbasterosPueblaChicken()
                    : await querySpecies(provider, key),
    ]));
    const prices = {};
    const allSources = [];
    const errors = {};
    let model = null;
    results.forEach((result, index) => {
        const key = keys[index];
        if (result.status !== 'fulfilled') {
            errors[key] = result.reason?.message || 'No se obtuvo evidencia local.';
            prices[key] = unavailablePrice(key, errors[key]);
            return;
        }
        try {
            const answer = result.value[1];
            prices[key] = normalizePrice(key, answer.payload, answer.sources, answer.origin);
            allSources.push(...answer.sources);
            model = model || answer.model;
        } catch (error) {
            errors[key] = error.message;
            prices[key] = unavailablePrice(key, error.message);
        }
    });
    const sources = [...new Map(allSources.map((source) => [source.url, source])).values()];
    const available = Object.values(prices).some((price) => price.available);
    if (!available) throw new Error('Gemini no encontró cotizaciones locales de Puebla suficientemente verificables.');
    return {
        available,
        schemaVersion: CACHE_SCHEMA,
        market: PUEBLA_MARKET,
        refreshHours: 12,
        source: 'Gemini + Google Search y SNIIM · Puebla · cotización física, no menudeo',
        retrievedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
        model,
        sources,
        prices,
        ...(Object.keys(errors).length ? { errors } : {}),
    };
}

async function getGeminiWholesalePrices({ force = false, background = false } = {}) {
    if (!force && memoryCache && cacheIsFresh(memoryCache)) return memoryCache;
    if (!memoryCache) memoryCache = await readDiskCache();
    if (!force && memoryCache && cacheIsFresh(memoryCache)) return memoryCache;
    if (refreshPromise) return background ? (memoryCache ? { ...memoryCache, stale: true } : unavailable()) : refreshPromise;

    refreshPromise = generateFreshPrices()
        .then(async (fresh) => {
            memoryCache = fresh;
            await writeCache(fresh);
            console.log('[Gemini precios Puebla] Cotizaciones actualizadas.');
            return fresh;
        })
        .catch((error) => {
            console.error('[Gemini precios Puebla] Actualización falló:', error.message);
            if (memoryCache) return { ...memoryCache, stale: true };
            return unavailable(error.message);
        })
        .finally(() => { refreshPromise = null; });
    return background ? (memoryCache ? { ...memoryCache, stale: true } : unavailable()) : refreshPromise;
}

function initGeminiWholesalePriceWarmer() {
    console.log('[Gemini precios Puebla] Iniciando actualización cada 12 horas...');
    getGeminiWholesalePrices().catch((error) => console.error('[Gemini precios Puebla] Warmer inicial:', error.message));
    setInterval(() => {
        getGeminiWholesalePrices({ force: true })
            .catch((error) => console.error('[Gemini precios Puebla] Warmer 12 h:', error.message));
    }, TTL_MS);
}

module.exports = {
    getGeminiWholesalePrices, initGeminiWholesalePriceWarmer, TTL_MS, CACHE_SCHEMA,
    PUEBLA_MARKET, SPECIES, parseCommercialLines, normalizePrice, cacheIsFresh,
    extractAbasterosPueblaSniimQuote, parseShortMexicoDate,
};
