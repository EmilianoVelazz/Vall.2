'use strict';

const { externalGet } = require('../lib/http');
const { findCurrencyMentions } = require('./currency-catalog');

// Las consultas sencillas de conversión no necesitan depender de la
// interpretación del modelo. Se detectan y se enriquecen con una referencia
// reciente, pero el modelo conserva el control cuando la pregunta añade
// contexto, escenarios o una explicación financiera.
const CACHE_MS = 60 * 60 * 1000;
let rateCache = null;

function parseAmount(raw) {
    const compact = String(raw || '').replace(/\s/g, '');
    if (!compact) return null;
    const normalized = /^\d{1,3}(?:,\d{3})+$/.test(compact)
        ? compact.replace(/,/g, '')
        : compact.includes(',') && compact.includes('.')
            ? (compact.lastIndexOf(',') > compact.lastIndexOf('.') ? compact.replace(/\./g, '').replace(',', '.') : compact.replace(/,/g, ''))
            : compact.replace(',', '.');
    const amount = Number(normalized);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function findCurrencies(text) {
    return findCurrencyMentions(text).map(currency => ({ code: currency.code, index: currency.index }));
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

const UNIT_KG = Object.freeze({
    cwt: 45.359237,
    lb: 0.45359237,
    kg: 1,
    ton: 1000,
    arroba: 15,
});

function parseWeightUnit(raw) {
    const u = String(raw || '').toLowerCase();
    if (/^cwt$/.test(u)) return 'cwt';
    if (/^(?:lb|lbs|libra|libras)$/.test(u)) return 'lb';
    if (/^(?:kg|kilo|kilos|kilogramo|kilogramos)$/.test(u)) return 'kg';
    if (/^(?:ton|t|tonelada|toneladas)$/.test(u)) return 'ton';
    if (/^arroba$/.test(u)) return 'arroba';
    return null;
}

function parseUnitPair(text) {
    const matches = [...String(text || '').matchAll(/\/\s*(cwt|lbs?|libras?|kg|kilos?|kilogramos?|ton(?:eladas?)?|arroba)\b/gi)]
        .map(m => parseWeightUnit(m[1]))
        .filter(Boolean);
    if (matches.length >= 2) return { fromUnit: matches[0], toUnit: matches[1] };
    return null;
}

function parseCurrencyConversion(message) {
    const text = String(message || '').toLowerCase();
    // Ignorar números que claramente son plazos o porcentajes ("30 días", "5%", "12 meses")
    const amountMatches = [...text.matchAll(/(?:^|\s|\$)(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?=\s|$|[a-záéíóú%])/gi)];
    const validAmountMatch = amountMatches.find(m => {
        const after = text.slice(m.index + m[0].length);
        return !/^\s*(?:%|por\s+ciento|d[ií]as?|semanas?|mes(?:es)?|a[nñ]os?|horas?|minutos?)\b/i.test(after);
    });
    const amount = parseAmount(validAmountMatch?.[1]);
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
    const units = parseUnitPair(text);
    return units ? { amount, from: from.code, to: to.code, ...units } : { amount, from: from.code, to: to.code };
}

function calculateConversion(request, rates) {
    const fromRate = request.from === 'USD' ? 1 : Number(rates?.[request.from]);
    const toRate = request.to === 'USD' ? 1 : Number(rates?.[request.to]);
    if (!Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) return null;
    const rate = toRate / fromRate;
    const baseResult = request.amount * rate;
    if (request.fromUnit && request.toUnit && UNIT_KG[request.fromUnit] && UNIT_KG[request.toUnit]) {
        const kgFactor = UNIT_KG[request.toUnit] / UNIT_KG[request.fromUnit];
        const unitResult = baseResult * kgFactor;
        const unitUsd = request.from === 'USD' ? request.amount * kgFactor : (request.amount / fromRate) * kgFactor;
        return { ...request, rate, result: unitResult, rawCurrencyResult: baseResult, kgFactor, fromUnitKg: UNIT_KG[request.fromUnit], toUnitKg: UNIT_KG[request.toUnit], unitUsd };
    }
    return { ...request, rate, result: baseResult };
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
    if (conversion.fromUnit && conversion.toUnit) {
        return `[CONVERSIÓN DE DIVISAS Y UNIDAD VERIFICADA]\nSolicitud: ${conversion.amount} ${conversion.from}/${conversion.fromUnit} a ${conversion.to}/${conversion.toUnit}.\nEquivalencia de masa: 1 ${conversion.fromUnit} = ${conversion.fromUnitKg} kg; 1 ${conversion.toUnit} = ${conversion.toUnitKg} kg.\nResultado de referencia: ${conversion.result.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${conversion.to}/${conversion.toUnit} (${conversion.unitUsd.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} USD/${conversion.toUnit}).\nTipo usado: 1 ${conversion.from} = ${conversion.rate.toLocaleString('en-US', { maximumFractionDigits: decimals })} ${conversion.to}.\nFuente: ${conversion.source}${conversion.updatedAt ? `; actualización del proveedor: ${conversion.updatedAt}.` : ''}\nIndica primero este resultado exacto por ${conversion.toUnit} y aclara que flete, aranceles y spread bancario no están incluidos.`;
    }
    return `[CONVERSIÓN DE DIVISAS VERIFICADA]\nSolicitud: ${conversion.amount} ${conversion.from} a ${conversion.to}.\nResultado de referencia: ${conversion.result.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${conversion.to}.\nTipo usado: 1 ${conversion.from} = ${conversion.rate.toLocaleString('en-US', { maximumFractionDigits: decimals })} ${conversion.to}.\nFuente: ${conversion.source}${conversion.updatedAt ? `; actualización del proveedor: ${conversion.updatedAt}.` : ''}\nIndica primero este resultado y aclara que bancos, tarjetas y casas de cambio pueden aplicar un spread o comisión.`;
}

function isSimpleCurrencyConversion(message, conversion) {
    if (!conversion || String(message || '').length > 220) return false;
    // Si la pregunta incluye unidades de peso/mercancía sin par de unidades resuelto,
    // no usar respuesta corta de divisas puras.
    if (!conversion.fromUnit && /\b(?:cwt|lbs?|kg|kilos?|kilogramos?|toneladas?|cutout|canal|por\s+100\s+libras?)\b|\/(?:cwt|lb|kg|ton)\b/i.test(message)) return false;
    // Si es una consulta larga sin conversión explícita de unidad comercial, no secuestrarla.
    if (!conversion.fromUnit && String(message || '').trim().split(/\s+/).length > 16) return false;
    // Estas señales indican que el usuario pide análisis, pronóstico, ML, paridad,
    // proteínas, escenarios o un caso operativo, donde ORION debe conservar el control.
    return !/\b(?:hist[oó]ric|tendencia|an[aá]lis|reporte|informe|escenario|riesgo|impacto|proyecci[oó]n|pron[oó]stic|paridad|importaci[oó]n|arbitraje|cobertura|spread|comisi[oó]n|por qu[eé]|ml|machine learning|marranas|sanitari|h5n1|influenza|ma[ií]z|soya|cetes|treasury|bolsa|ipc|s&p|flete|merma|costo|margen)\b|\b\d+\s*(?:%|por\s+ciento|d[ií]as?|semanas?|mes(?:es)?|a[nñ]os?)\b/i.test(message)
        && (Boolean(conversion.fromUnit) || !/\b(?:cerdos?|pollos?|huevos?|res|bovinos?|prote[ií]nas?)\b/i.test(message));
}

function conversionAnswer(conversion) {
    const amount = conversion.amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const result = conversion.result.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rate = conversion.rate.toLocaleString('en-US', { maximumFractionDigits: conversion.to === 'MXN' ? 4 : 6 });
    if (conversion.fromUnit && conversion.toUnit) {
        const unitUsd = conversion.unitUsd.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
        return `**${amount} ${conversion.from}/${conversion.fromUnit} = ${result} ${conversion.to}/${conversion.toUnit}**\n\nCálculo:\n- Conversión de masa: ${amount} ${conversion.from}/${conversion.fromUnit} ÷ ${conversion.fromUnitKg} kg/${conversion.fromUnit} = **${unitUsd} USD/${conversion.toUnit}** (base 1 ${conversion.fromUnit} = ${conversion.fromUnitKg} kg).\n- Conversión cambiaria: ${unitUsd} × ${rate} = **${result} ${conversion.to}/${conversion.toUnit}**.\n\nTipo de cambio de referencia: **1 ${conversion.from} = ${rate} ${conversion.to}**. Fuente: ${conversion.source}${conversion.updatedAt ? `; actualización del proveedor: ${conversion.updatedAt}.` : ''}\n\n> [!TIP] Es una equivalencia directa de precio base; no incluye flete, aranceles, mermas ni spread bancario.`;
    }
    return `**${amount} ${conversion.from} = ${result} ${conversion.to}**\n\nCálculo: ${amount} × ${rate} = **${result} ${conversion.to}**.\n\nTipo de cambio de referencia: **1 ${conversion.from} = ${rate} ${conversion.to}**. Fuente: ${conversion.source}${conversion.updatedAt ? `; actualización del proveedor: ${conversion.updatedAt}.` : ''}\n\n> [!TIP] Bancos, tarjetas y casas de cambio pueden aplicar una comisión o spread distinto a esta referencia.`;
}

module.exports = { parseCurrencyConversion, parseCurrencyPair, calculateConversion, resolveCurrencyConversion, getCurrencyQuote, conversionContext, isSimpleCurrencyConversion, conversionAnswer, latestRates };
