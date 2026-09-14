'use strict';

const { externalGet } = require('../lib/http');

// Las consultas sencillas de conversión no necesitan depender de la
// interpretación del modelo. Se detectan y se enriquecen con una referencia
// reciente, pero el modelo conserva el control cuando la pregunta añade
// contexto, escenarios o una explicación financiera.
const CACHE_MS = 60 * 60 * 1000;
let rateCache = null;

const CURRENCIES = [
    { code: 'USD', re: /\b(?:usd|d[oó]lar(?:es)?|d[oó]lar(?:es)? estadounidenses?)\b/gi },
    { code: 'MXN', re: /\b(?:mxn|peso(?:s)?(?: mexicano(?:s)?)?)\b/gi },
    { code: 'EUR', re: /\b(?:eur|euro(?:s)?)\b/gi },
    { code: 'CAD', re: /\b(?:cad|d[oó]lar(?:es)? canadiense(?:s)?)\b/gi },
    { code: 'GBP', re: /\b(?:gbp|libra(?:s)? esterlina(?:s)?)\b/gi },
];

function parseAmount(raw) {
    const compact = String(raw || '').replace(/\s/g, '');
    if (!compact) return null;
    const normalized = compact.includes(',') && compact.includes('.')
        ? compact.replace(/,/g, '')
        : compact.replace(',', '.');
    const amount = Number(normalized);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function findCurrencies(text) {
    const found = [];
    for (const currency of CURRENCIES) {
        currency.re.lastIndex = 0;
        let match;
        while ((match = currency.re.exec(text))) found.push({ code: currency.code, index: match.index });
    }
    return found.sort((a, b) => a.index - b.index);
}

function parseCurrencyPair(message) {
    const currencies = findCurrencies(String(message || '').toLowerCase());
    if (currencies.length >= 2 && currencies[0].code !== currencies[1].code) {
        return { from: currencies[0].code, to: currencies[1].code };
    }
    // En VALLNews el contexto principal es México. Una consulta genérica por
    // "el dólar" se interpreta como USD/MXN, pero sólo dentro del proveedor de
    // datos en vivo; no cambia solicitudes explícitas de otras divisas.
    if (currencies.some(currency => currency.code === 'USD')) return { from: 'USD', to: 'MXN' };
    return null;
}

function parseCurrencyConversion(message) {
    const text = String(message || '').toLowerCase();
    const amountMatch = text.match(/(?:^|\s|\$)(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?=\s|$|[a-záéíóú])/i);
    const amount = parseAmount(amountMatch?.[1]);
    const currencies = findCurrencies(text);
    if (!amount || currencies.length < 2) return null;
    const [from, to] = currencies;
    if (from.code === to.code) return null;
    // También acepta formas coloquiales o con errores de escritura como
    // “me conviertiera 216 dólares a pesos mexicanos”. Dos monedas unidas por
    // “a/en” son suficientes para dejar inequívoca la intención de convertir.
    const betweenCurrencies = text.slice(from.index, to.index);
    const explicitIntent = /\b(?:conviert[a-záéíóú]*|convert[a-záéíóú]*|conversi[oó]n|equivale?|cu[aá]nto(?:s)?|pas[a-záéíóú]*|son)\b/i.test(text);
    if (!explicitIntent && !/\b(?:a|en)\b/i.test(betweenCurrencies)) return null;
    return { amount, from: from.code, to: to.code };
}

function calculateConversion(request, rates) {
    const fromRate = request.from === 'USD' ? 1 : Number(rates?.[request.from]);
    const toRate = request.to === 'USD' ? 1 : Number(rates?.[request.to]);
    if (!Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) return null;
    const rate = toRate / fromRate;
    return { ...request, rate, result: request.amount * rate };
}

async function latestRates(get = externalGet) {
    if (rateCache && Date.now() - rateCache.savedAt < CACHE_MS) return rateCache.payload;
    if (typeof get !== 'function') return null;
    // Reutiliza el cliente HTTP de VALLNews. En desarrollo éste tolera la
    // cadena TLS que expone la red local; en Vercel conserva la validación
    // completa de certificados.
    const response = await get('https://open.er-api.com/v6/latest/USD', { Accept: 'application/json' }, 7000);
    if (!response.ok) throw new Error(`Proveedor de divisas no disponible (${response.status}).`);
    const payload = await response.json();
    if (!payload?.rates?.USD || !payload?.rates?.MXN) throw new Error('El proveedor no devolvió los tipos de cambio esperados.');
    rateCache = { savedAt: Date.now(), payload };
    return payload;
}

async function resolveCurrencyConversion(message, get) {
    const request = parseCurrencyConversion(message);
    if (!request) return null;
    try {
        const payload = await latestRates(get);
        const conversion = calculateConversion(request, payload?.rates);
        if (!conversion) return null;
        return {
            ...conversion,
            source: 'ExchangeRate-API (referencia de mercado)',
            updatedAt: payload.time_last_update_utc || payload.time_next_update_utc || null,
        };
    } catch (error) {
        console.warn('[currency] No se pudo obtener el tipo de cambio:', error.message);
        return null;
    }
}

async function getCurrencyQuote(from = 'USD', to = 'MXN', get) {
    try {
        const payload = await latestRates(get);
        const quote = calculateConversion({ amount: 1, from, to }, payload?.rates);
        if (!quote) return null;
        return {
            ...quote,
            source: 'ExchangeRate-API (referencia de mercado)',
            updatedAt: payload.time_last_update_utc || payload.time_next_update_utc || null,
        };
    } catch (error) {
        console.warn('[currency] No se pudo obtener la cotización:', error.message);
        return null;
    }
}

function conversionContext(conversion) {
    if (!conversion) return '';
    const decimals = conversion.to === 'MXN' ? 2 : 4;
    return `[CONVERSIÓN DE DIVISAS VERIFICADA]\nSolicitud: ${conversion.amount} ${conversion.from} a ${conversion.to}.\nResultado de referencia: ${conversion.result.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${conversion.to}.\nTipo usado: 1 ${conversion.from} = ${conversion.rate.toLocaleString('en-US', { maximumFractionDigits: decimals })} ${conversion.to}.\nFuente: ${conversion.source}${conversion.updatedAt ? `; actualización del proveedor: ${conversion.updatedAt}.` : ''}\nIndica primero este resultado y aclara que bancos, tarjetas y casas de cambio pueden aplicar un spread o comisión.`;
}

function isSimpleCurrencyConversion(message, conversion) {
    if (!conversion || String(message || '').length > 220) return false;
    // Estas señales indican que el usuario pide análisis, tendencia o un caso
    // operativo, donde Gemini debe conservar el control de la explicación.
    return !/\b(?:hist[oó]ric|tendencia|an[aá]lis|reporte|informe|escenario|riesgo|impacto|proyecci[oó]n|cobertura|spread|comisi[oó]n|por qu[eé])\b/i.test(message);
}

function conversionAnswer(conversion) {
    const amount = conversion.amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const result = conversion.result.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rate = conversion.rate.toLocaleString('en-US', { maximumFractionDigits: conversion.to === 'MXN' ? 4 : 6 });
    return `**${amount} ${conversion.from} = ${result} ${conversion.to}**\n\nCálculo: ${amount} × ${rate} = **${result} ${conversion.to}**.\n\nTipo de cambio de referencia: **1 ${conversion.from} = ${rate} ${conversion.to}**. Fuente: ${conversion.source}${conversion.updatedAt ? `; actualización del proveedor: ${conversion.updatedAt}.` : ''}\n\n> [!TIP] Bancos, tarjetas y casas de cambio pueden aplicar una comisión o spread distinto a esta referencia.`;
}

module.exports = { parseCurrencyConversion, parseCurrencyPair, calculateConversion, resolveCurrencyConversion, getCurrencyQuote, conversionContext, isSimpleCurrencyConversion, conversionAnswer };
