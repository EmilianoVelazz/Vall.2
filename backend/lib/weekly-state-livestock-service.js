'use strict';

/* Complemento semanal para la tabla pecuaria estatal.
 *
 * La fuente primaria sigue siendo SNIIM/Porcicultura. Este servicio sólo cubre
 * huecos de bovino y pollo en los estados donde sí existe cerdo estatal. Primero
 * lee las filas SNIIM publicadas por Abasteros y únicamente recurre a Gemini con
 * Google Search cuando esa evidencia estructurada no contiene una plaza.
 */
const fs = require('fs');
const path = require('path');
const { CACHE_DIR } = require('./config');
const { externalGet } = require('./http');
const { GeminiProvider } = require('../ai/providers/gemini-provider');

const CACHE_FILE = path.join(CACHE_DIR, 'weekly-state-livestock-prices.json');
const CACHE_SCHEMA = 1;
const TIME_ZONE = 'America/Mexico_City';
const TARGET_STATES = Object.freeze({
    SON: { state: 'Sonora', aliases: ['Hermosillo', 'Ciudad Obregón', 'Sonora'] },
    NLE: { state: 'Nuevo León', aliases: ['Monterrey', 'Nuevo León'] },
    JAL: { state: 'Jalisco', aliases: ['Guadalajara', 'Tlaquepaque', 'Jalisco'] },
    GUA: { state: 'Guanajuato', aliases: ['León', 'Irapuato', 'Celaya', 'Guanajuato'] },
    QUE: { state: 'Querétaro', aliases: ['Querétaro'] },
    MIC: { state: 'Michoacán', aliases: ['Morelia', 'Michoacán'] },
    PUE: { state: 'Puebla', aliases: ['Puebla'] },
    YUC: { state: 'Yucatán', aliases: ['Mérida', 'Yucatán'] },
    VER: { state: 'Veracruz', aliases: ['Veracruz', 'Xalapa'] },
});
const PRODUCTS = Object.freeze({
    beef: { label: 'Bovino vivo', min: 20, max: 130, url: 'https://abasteros.com/products/91', basis: 'Ganado bovino en pie · mercado mayorista' },
    chicken: { label: 'Pollo mayoreo', min: 20, max: 110, url: 'https://abasteros.com/products/87', basis: 'Pollo físico · mercado mayorista' },
});

let memoryCache = null;
let refreshPromise = null;
let timer = null;

function partsAt(date) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
        weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    return Object.fromEntries(formatter.formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, /^\d+$/.test(part.value) ? Number(part.value) : part.value]));
}

function offsetAt(date) {
    const p = partsAt(date);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}

function atMexicoTime(year, month, day, hour) {
    const wallClock = Date.UTC(year, month - 1, day, hour, 0, 0);
    let instant = wallClock;
    for (let index = 0; index < 2; index += 1) instant = wallClock - offsetAt(new Date(instant));
    return new Date(instant);
}

function nextSundayRefreshAt(from = new Date()) {
    const now = from instanceof Date ? from : new Date(from);
    const here = partsAt(now);
    const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[here.weekday];
    let days = (7 - weekday) % 7;
    let calendar = new Date(Date.UTC(here.year, here.month - 1, here.day + days));
    let candidate = atMexicoTime(calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, calendar.getUTCDate(), 11);
    if (candidate.getTime() <= now.getTime()) {
        calendar = new Date(Date.UTC(here.year, here.month - 1, here.day + days + 7));
        candidate = atMexicoTime(calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, calendar.getUTCDate(), 11);
    }
    return candidate;
}

function textFromHtml(value) {
    return String(value || '').replace(/<br\s*\/?>/gi, ' ').replace(/&nbsp;/gi, ' ')
        .replace(/&#(?:x)?[0-9a-f]+;/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tableRows(html) {
    return [...String(html || '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
        .map((match) => [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => textFromHtml(cell[1])))
        .filter((cells) => cells.length >= 4);
}

function parseShortDate(value) {
    const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
    if (!match) return null;
    return `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${match[2]}-${match[1]}`;
}

function stateForMarket(market) {
    const clean = String(market || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return Object.entries(TARGET_STATES).find(([, meta]) => meta.aliases.some((alias) => clean.includes(alias.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())))?.[0] || null;
}

function parseAbasterosRows(html, product) {
    const meta = PRODUCTS[product];
    const rows = tableRows(html).map((cells) => {
        if (!/^SNIIM$/i.test(cells[3])) return null;
        const stateCode = stateForMarket(cells[2]);
        const price = Number(String(cells[1] || '').replace(/[$,]/g, ''));
        const date = parseShortDate(cells[0]);
        if (!stateCode || !date || !Number.isFinite(price) || price < meta.min || price > meta.max) return null;
        return { stateCode, state: TARGET_STATES[stateCode].state, price, date, market: cells[2] };
    }).filter(Boolean);
    const grouped = new Map();
    rows.forEach((row) => {
        const existing = grouped.get(row.stateCode) || [];
        existing.push(row);
        grouped.set(row.stateCode, existing);
    });
    return [...grouped.entries()].map(([stateCode, stateRows]) => {
        const latest = stateRows.map((row) => row.date).sort().at(-1);
        const current = stateRows.filter((row) => row.date === latest);
        return {
            stateCode,
            state: TARGET_STATES[stateCode].state,
            price: Math.round((current.reduce((sum, row) => sum + row.price, 0) / current.length) * 100) / 100,
            observations: current.length,
            markets: current.map((row) => row.market).slice(0, 4),
            date: latest,
            cadence: 'weekly-source',
            source: 'SNIIM · publicado por Abasteros',
            sourceUrl: meta.url,
            level: meta.basis,
        };
    });
}

function groundingSources(grounding) {
    return [...new Map((grounding?.groundingChunks || []).map((chunk) => chunk?.web)
        .filter((web) => /^https?:\/\//i.test(web?.uri || '')).map((web) => [web.uri, { url: web.uri, title: web.title || 'Fuente web' }])).values()].slice(0, 8);
}

function line(text, name) {
    return String(text || '').match(new RegExp(`^${name}\\s*:\\s*(.+)$`, 'im'))?.[1]?.trim() || '';
}

async function queryGemini(provider, stateCode, product) {
    const state = TARGET_STATES[stateCode].state;
    const meta = PRODUCTS[product];
    const result = await provider.generate({
        prompt: `Investiga una cotización física reciente de ${meta.label} en el estado de ${state}, México. Debe ser precio por kilogramo en primera venta, rastro o mayoreo; no uses supermercado, consumidor final, futuros, promedios nacionales ni otro estado. Privilegia SNIIM, centrales de abasto, rastros o fuentes sectoriales fechadas. Si no hay evidencia suficiente, responde NO_DISPONIBLE.\n\nResponde sólo:\nPRECIO_MXN_KG: 00.00\nFECHA_COTIZACION: AAAA-MM-DD\nMERCADO: plaza y estado\nBASE: nivel comercial`,
        systemInstruction: 'Eres un verificador de precios pecuarios estatales. No estimas ni inventas cifras: cada precio debe tener evidencia web localizada, fecha y nivel comercial.',
        tier: 'flash', json: false, tools: [{ googleSearch: {} }], maxOutputTokens: 700,
    });
    if (/NO_DISPONIBLE/i.test(result.text)) throw new Error(`Sin evidencia Gemini para ${state} / ${product}.`);
    const price = Number(line(result.text, 'PRECIO_MXN_KG').replace(/[^\d.]/g, ''));
    const date = line(result.text, 'FECHA_COTIZACION');
    const market = line(result.text, 'MERCADO');
    const basis = line(result.text, 'BASE');
    const sources = groundingSources(result.grounding);
    if (!Number.isFinite(price) || price < meta.min || price > meta.max || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !market || !basis || !sources.length) {
        throw new Error(`Gemini no devolvió evidencia auditable para ${state} / ${product}.`);
    }
    return {
        stateCode, state, price: Math.round(price * 100) / 100, observations: 1,
        markets: [market], date, cadence: 'weekly-ai', source: 'Gemini + Google Search',
        sourceUrls: sources.map((source) => source.url), level: basis,
    };
}

async function generateFresh() {
    const entries = await Promise.all(Object.entries(PRODUCTS).map(async ([product, meta]) => {
        try {
            const response = await externalGet(meta.url, {}, 18_000);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return [product, parseAbasterosRows(await response.text(), product)];
        } catch {
            return [product, []];
        }
    }));
    const prices = Object.fromEntries(entries);
    const provider = new GeminiProvider();
    const missing = Object.keys(PRODUCTS).flatMap((product) => Object.keys(TARGET_STATES)
        .filter((stateCode) => !prices[product].some((quote) => quote.stateCode === stateCode))
        .map((stateCode) => ({ product, stateCode })));
    if (missing.length && provider.isConfigured()) {
        const resolved = await Promise.allSettled(missing.map(({ stateCode, product }) => queryGemini(provider, stateCode, product)));
        resolved.forEach((result, index) => {
            if (result.status === 'fulfilled') prices[missing[index].product].push(result.value);
        });
    }
    const retrievedAt = new Date();
    return {
        schemaVersion: CACHE_SCHEMA,
        retrievedAt: retrievedAt.toISOString(),
        expiresAt: nextSundayRefreshAt(retrievedAt).toISOString(),
        refreshSchedule: 'Domingos · 11:00 · America/Mexico_City',
        prices,
    };
}

async function readCache() {
    try {
        const value = JSON.parse(await fs.promises.readFile(CACHE_FILE, 'utf8'));
        return value?.schemaVersion === CACHE_SCHEMA ? value : null;
    } catch { return null; }
}

async function writeCache(value) {
    try { await fs.promises.writeFile(CACHE_FILE, JSON.stringify(value, null, 2), 'utf8'); }
    catch (error) { console.error('[Precios estatales semanales] No se guardó caché:', error.message); }
}

function cacheIsFresh(value) {
    return value?.schemaVersion === CACHE_SCHEMA && Date.parse(value.expiresAt) > Date.now();
}

async function getWeeklyStateLivestockPrices({ force = false } = {}) {
    if (!memoryCache) memoryCache = await readCache();
    if (!force && cacheIsFresh(memoryCache)) return memoryCache;
    if (refreshPromise) return refreshPromise;
    refreshPromise = generateFresh().then(async (fresh) => {
        memoryCache = fresh;
        await writeCache(fresh);
        console.log('[Precios estatales semanales] Corte actualizado; próximo domingo 11:00.');
        return fresh;
    }).catch((error) => {
        console.error('[Precios estatales semanales] Actualización falló:', error.message);
        if (memoryCache) return { ...memoryCache, stale: true };
        return { schemaVersion: CACHE_SCHEMA, prices: { beef: [], chicken: [] }, error: error.message };
    }).finally(() => { refreshPromise = null; });
    return refreshPromise;
}

function initWeeklyStateLivestockWarmer() {
    getWeeklyStateLivestockPrices().catch(() => {});
    const arm = () => {
        const next = nextSundayRefreshAt();
        timer = setTimeout(async () => {
            try { await getWeeklyStateLivestockPrices({ force: true }); }
            finally { arm(); }
        }, Math.max(1_000, next.getTime() - Date.now()));
        timer.unref?.();
    };
    arm();
}

module.exports = {
    getWeeklyStateLivestockPrices, initWeeklyStateLivestockWarmer, nextSundayRefreshAt,
    parseAbasterosRows, TARGET_STATES, PRODUCTS, CACHE_SCHEMA,
};
