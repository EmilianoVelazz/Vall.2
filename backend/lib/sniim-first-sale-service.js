'use strict';

/* Cotizaciones de primera comercialización del SNIIM.
 *
 * Cerdo y bovino se captan en rastros como ganado en pie (LAB rastro). Pollo y
 * huevo no se venden al rastro como animales: se publican como pollo entero y
 * huevo blanco al mayoreo. Se conservan esas diferencias en el payload para no
 * llamar "precio de rastro" a algo que no lo es. */
const { externalGet } = require('./http');

const BASE = 'https://www.economia-sniim.gob.mx/SNIIM-Pecuarios-Nacionales';
const TTL_MS = 30 * 60 * 1000;
let cache = null;

/* Compra habitual previa al rastro. No existe una API nacional diaria para el
   precio que paga el intermediario; se conserva como una referencia explícita
   de mercado, separada de la cotización SNIIM de rastro. El punto medio permite
   que los cálculos de margen sigan trabajando con un solo valor, mientras la UI
   presenta el rango completo al usuario. */
const CERDO_INTERMEDIARIO = Object.freeze({
    price: 35.00,
    displayPrice: '$34.50–$35.50 MXN/kg vivo',
    observations: 0,
    date: '2026-09-03',
    label: 'Cerdo vivo · intermediario',
    unit: 'MXN/kg vivo',
    level: 'Compra previa al rastro · rango de referencia',
    source: 'Referencia de compra de intermediario',
});

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

function number(value) {
    const parsed = Number(String(value || '').replace(/[$,]/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
}

function weightedAverage(values) {
    const usable = values.filter(({ value, weight }) => Number.isFinite(value) && value > 0 && Number.isFinite(weight) && weight > 0);
    if (!usable.length) return null;
    const totalWeight = usable.reduce((sum, item) => sum + item.weight, 0);
    return usable.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function mean(values) {
    const usable = values.filter((value) => Number.isFinite(value) && value > 0);
    return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function dayParams(date) {
    const two = (value) => String(value).padStart(2, '0');
    return { day: two(date.getDate()), month: two(date.getMonth() + 1), year: date.getFullYear() };
}

async function request(path) {
    const response = await externalGet(`${BASE}/${path}`, {}, 18000);
    if (!response.ok) throw new Error(`SNIIM HTTP ${response.status}`);
    return response.text();
}

function parseBeef(html) {
    const quotes = [];
    tableRows(html).forEach((cells) => {
        if (cells.length < 4 || !cells[0] || cells[0].toLowerCase() === 'origen') return;
        const heads = number(cells[1]) || 1;
        // El SNIIM publica novillo, novillona, vaca y toro en columnas. Se toma
        // el primer tipo cotizado de cada registro, sin mezclarlo con el peso.
        const price = cells.slice(3).map(number).find((value) => value != null && value > 0);
        if (price != null) quotes.push({ value: price, weight: heads });
    });
    return { price: weightedAverage(quotes), observations: quotes.length };
}

function parseChicken(html) {
    const prices = tableRows(html)
        .filter((cells) => cells.length === 6 && /^pollo entero$/i.test(cells[0]))
        .map((cells) => number(cells[5]));
    return { price: mean(prices), observations: prices.filter(Boolean).length };
}

function parseEgg(html) {
    const prices = tableRows(html)
        .filter((cells) => cells.length === 6 && /^huevo blanco$/i.test(cells[1]) && /^mayoreo$/i.test(cells[2]))
        .map((cells) => number(cells[3]));
    return { price: mean(prices), observations: prices.filter(Boolean).length };
}

async function forLatestDay(loader, parser, maxDays = 7) {
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    for (let offset = 0; offset < maxDays; offset += 1) {
        const date = new Date(start);
        date.setDate(start.getDate() - offset);
        const params = dayParams(date);
        try {
            const value = parser(await loader(params));
            if (value.price != null) return { ...value, date: `${params.year}-${params.month}-${params.day}` };
        } catch { /* se intenta el día hábil anterior */ }
    }
    return { price: null, observations: 0, date: null };
}

async function getFirstSalePrices() {
    if (cache && Date.now() - cache.ts < TTL_MS) return cache.data;

    const [beef, chicken, egg] = await Promise.all([
        forLatestDay(({ day, month, year }) => request(`e_Pie.asp?RegPag=1000&Var=Bov&al=${day}&anio=${year}&del=${day}&destino=0&mes=${month}&origen=0`), parseBeef),
        forLatestDay(({ day, month, year }) => request(`e_Ent.asp?RegPag=1000&al=${day}&anio=${year}&del=${day}&destino=0&mes=${month}&origen=0&pag=1&prod=0`), parseChicken),
        // Huevo se actualiza semanalmente. El valor de semana 1 incluye la
        // semana vigente en la consulta mensual y el bucle cubre el miércoles
        // previo si aún no se publicó la actual.
        forLatestDay(({ month, year }) => request(`e_Hue.asp?RegPag=1000&anio=${year}&destino=0&mes=${month}&prod=0&sem=1`), parseEgg, 1),
    ]);

    const data = {
        available: [CERDO_INTERMEDIARIO, beef, chicken, egg].some((item) => item.price != null),
        source: 'SNIIM + referencia de compra de intermediario',
        retrievedAt: new Date().toISOString(),
        prices: {
            pork: CERDO_INTERMEDIARIO,
            beef: { ...beef, label: 'Bovino vivo · rastro', unit: 'MXN/kg vivo', level: 'Ganado en pie; mezcla de tipos publicados' },
            chicken: { ...chicken, label: 'Pollo entero · mayoreo', unit: 'MXN/kg', level: 'No existe cotización de ave viva al rastro en esta fuente' },
            egg: { ...egg, label: 'Huevo blanco · mayoreo', unit: 'MXN/kg', level: 'El huevo no se comercializa en rastro' },
        },
    };
    cache = { ts: Date.now(), data };
    return data;
}

module.exports = { getFirstSalePrices };
