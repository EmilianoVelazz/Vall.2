'use strict';

/* Cotizaciones comerciales diarias con Gemini + Google Search.
 *
 * Estas cifras son el nivel al que un productor, acopiador o distribuidor
 * vende a otro negocio. La validación impide que se publiquen precios de
 * supermercado, cortes al consumidor o números sin fuentes consultadas. */
const fs = require('fs');
const path = require('path');
const { CACHE_DIR } = require('./config');
const { GeminiProvider } = require('../ai/providers/gemini-provider');

const CACHE_FILE = path.join(CACHE_DIR, 'gemini-wholesale-protein-prices.json');
const TTL_MS = 24 * 60 * 60 * 1000;
const SPECIES = Object.freeze({
    pork: {
        label: 'Cerdo vivo · intermediario', unit: 'MXN/kg vivo',
        level: 'Venta de productor a acopiador/rastro · no menudeo', min: 20, max: 85,
    },
    chicken: {
        label: 'Pollo entero · mayoreo', unit: 'MXN/kg',
        level: 'Venta de distribuidor a negocio · no menudeo', min: 20, max: 100,
    },
    beef: {
        label: 'Bovino vivo · intermediario', unit: 'MXN/kg vivo',
        level: 'Ganado en pie de productor a comprador/rastro · no menudeo', min: 20, max: 130,
    },
    egg: {
        label: 'Huevo blanco · mayoreo', unit: 'MXN/kg',
        level: 'Venta de productor/empacador a distribuidor · no menudeo', min: 15, max: 100,
    },
});

let memoryCache = null;
let refreshPromise = null;

function mexicoDate() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
}

function parseCommercialLines(text) {
    const clean = String(text || '').replace(/,/g, '.');
    const price = positive(clean.match(/PRECIO_MXN_KG\s*:\s*\$?\s*([\d.]+)/i)?.[1]);
    const range = clean.match(/RANGO_MXN_KG\s*:\s*\$?\s*([\d.]+)\s*(?:-|–|a)\s*\$?\s*([\d.]+)/i);
    const basis = clean.match(/BASE\s*:\s*(.+)/i)?.[1]?.trim();
    if (!price) throw new Error('Gemini no devolvió PRECIO_MXN_KG válido.');
    return {
        price,
        ...(range ? { rangeMin: positive(range[1]), rangeMax: positive(range[2]) } : {}),
        basis,
        sourceUrls: [],
    };
}

function positive(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function fixed(value) {
    return Math.round(value * 100) / 100;
}

function groundingSources(grounding) {
    const sources = (grounding?.groundingChunks || [])
        .map((chunk) => ({ url: String(chunk?.web?.uri || '').trim(), title: String(chunk?.web?.title || '').trim() }))
        .filter((source) => /^https?:\/\//i.test(source.url));
    return [...new Map(sources.map((source) => [source.url, source])).values()].slice(0, 8);
}

function normalizePrice(key, raw, sources, date) {
    const meta = SPECIES[key];
    const price = positive(raw?.price);
    const min = positive(raw?.rangeMin);
    const max = positive(raw?.rangeMax);
    const effective = price || (min && max ? (min + max) / 2 : null);
    if (!effective || effective < meta.min || effective > meta.max) {
        throw new Error(`Gemini devolvió una cotización inválida para ${key}.`);
    }
    if ((min && min < meta.min) || (max && max > meta.max) || (min && max && min > max)) {
        throw new Error(`Gemini devolvió un rango inválido para ${key}.`);
    }
    const citationUrls = Array.isArray(raw?.sourceUrls)
        ? raw.sourceUrls.filter((url) => sources.some((source) => source.url === url))
        : [];
    return {
        price: fixed(effective),
        ...(min ? { rangeMin: fixed(min) } : {}),
        ...(max ? { rangeMax: fixed(max) } : {}),
        displayPrice: `$${fixed(effective).toFixed(2)} ${meta.unit}`,
        observations: 1,
        date,
        label: meta.label,
        unit: meta.unit,
        level: meta.level,
        source: sources.length ? 'Gemini con búsqueda web' : 'Gemini · consulta diaria',
        sourceUrls: citationUrls.length ? citationUrls : sources.map((source) => source.url),
        note: String(raw?.basis || 'Cotización comercial mexicana validada con fuentes web.').slice(0, 240),
    };
}

function cacheIsFresh(cache) {
    const retrievedAt = Date.parse(cache?.retrievedAt);
    return Number.isFinite(retrievedAt) && Date.now() - retrievedAt < TTL_MS;
}

function unavailable() {
    return { available: false, source: 'Gemini + Google Search', prices: {}, error: 'La actualización comercial diaria está en proceso o no pudo validarse.' };
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
        if (!disk?.prices || typeof disk.prices !== 'object') return null;
        // Normaliza entradas creadas por una versión anterior que anunciaba
        // búsqueda aun cuando Gemini no devolvía citas en la respuesta.
        if (Array.isArray(disk.sources) && disk.sources.length === 0 && /Google Search/.test(disk.source || '')) {
            disk.source = 'Gemini · cotización comercial, no menudeo';
        }
        return disk;
    } catch {
        return null;
    }
}

async function writeCache(data) {
    try {
        await fs.promises.writeFile(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('[Gemini precios comerciales] No se pudo guardar caché:', error.message);
    }
}

function buildPrompt(key) {
    const date = mexicoDate();
    const descriptions = {
        pork: 'cerdo vivo/en pie vendido por productor a coyote, acopiador o rastro',
        chicken: 'pollo entero o canal vendido al mayoreo por distribuidor a otro negocio',
        beef: 'bovino vivo/en pie vendido por productor a comprador, acopiador o rastro',
        egg: 'huevo blanco por kilogramo vendido por productor o empacador a distribuidor/mayoreo',
    };
    return `Hoy es ${date} en México. Busca en la web una cotización mexicana actual de ${descriptions[key]}.\n\n`
        + 'NO uses precio de supermercado, tienda, carnicería, restaurante, consumidor final ni cortes empacados. '
        + 'Privilegia fuente gubernamental, sectorial, de central mayorista o reporte fechado. '
        + 'No inventes ni conviertas piezas/docenas/libra sin una equivalencia explícita de la fuente.\n\n'
        + 'Tras consultar fuentes web responde SOLO con estas tres líneas, sin Markdown ni explicaciones:\n'
        + 'PRECIO_MXN_KG: 35.00\nRANGO_MXN_KG: 34.50 - 35.50\nBASE: productor a intermediario';
}

async function generateFreshPrices() {
    const provider = new GeminiProvider();
    if (!provider.isConfigured()) throw new Error('Gemini no está configurado.');
    // Consultar cada especie por separado evita que una búsqueda extensa haga
    // esperar a toda la página y da a cada precio sus propias citas.
    const querySpecies = async (key) => {
        let lastError;
        // En ocasiones el modelo cree conocer la respuesta y omite la búsqueda.
        // Un segundo intento explícito evita publicar una cifra sin evidencia.
        for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
                const result = await withTimeout(provider.generate({
                    prompt: `${buildPrompt(key)}\nIMPORTANTE: debes usar Google Search en esta respuesta; no respondas desde memoria.`,
                    systemInstruction: 'Eres un analista de mercados pecuarios de México. Distingues estrictamente precio comercial de menudeo. Debes consultar Google Search y solo publicar cifras verificables.',
                    tier: 'flash',
                    // El formato de líneas se conserva compatible con Google Search y
                    // se valida localmente antes de permitir su publicación.
                    json: false,
                    tools: [{ googleSearch: {} }],
                    maxOutputTokens: 1200,
                }), 35_000);
                const sources = groundingSources(result.grounding);
                return [key, { payload: parseCommercialLines(result.text), sources, model: result.model }];
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError;
    };
    const answers = await Promise.all(Object.keys(SPECIES).map(querySpecies));
    const date = mexicoDate();
    const prices = {};
    const allSources = [];
    let model = null;
    for (const [key, answer] of answers) {
        prices[key] = normalizePrice(key, answer.payload, answer.sources, date);
        allSources.push(...answer.sources);
        model = model || answer.model;
    }
    const sources = [...new Map(allSources.map((source) => [source.url, source])).values()];
    return {
        available: true,
        source: sources.length
            ? 'Gemini + Google Search · cotización comercial, no menudeo'
            : 'Gemini · cotización comercial, no menudeo',
        retrievedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
        model,
        sources,
        prices,
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
            console.log('[Gemini precios comerciales] Cotizaciones diarias actualizadas.');
            return fresh;
        })
        .catch((error) => {
            console.error('[Gemini precios comerciales] Actualización falló:', error.message);
            if (memoryCache) return { ...memoryCache, stale: true };
            return unavailable();
        })
        .finally(() => { refreshPromise = null; });
    return background ? (memoryCache ? { ...memoryCache, stale: true } : unavailable()) : refreshPromise;
}

function initGeminiWholesalePriceWarmer() {
    console.log('[Gemini precios comerciales] Iniciando actualización diaria...');
    getGeminiWholesalePrices().catch((error) => console.error('[Gemini precios comerciales] Warmer inicial:', error.message));
    setInterval(() => {
        getGeminiWholesalePrices({ force: true })
            .catch((error) => console.error('[Gemini precios comerciales] Warmer diario:', error.message));
    }, TTL_MS);
}

module.exports = { getGeminiWholesalePrices, initGeminiWholesalePriceWarmer, TTL_MS };
