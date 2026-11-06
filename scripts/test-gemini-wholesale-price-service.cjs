'use strict';

const assert = require('assert');
const {
    CACHE_SCHEMA, PUEBLA_MARKET, parseCommercialLines, normalizePrice, cacheIsFresh,
    extractAbasterosPueblaSniimQuote,
} = require('../backend/lib/gemini-wholesale-price-service');

const currentMexicoDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const payload = parseCommercialLines([
    'PRECIO_MXN_KG: 38.00',
    'RANGO_MXN_KG: 36.00 - 40.00',
    `FECHA_COTIZACION: ${currentMexicoDate}`,
    'MERCADO: Central de Abasto de Puebla, Puebla',
    'BASE: Cerdo vivo, productor a rastro',
].join('\n'));

assert.equal(payload.price, 38);
assert.equal(payload.market, 'Central de Abasto de Puebla, Puebla');

const sources = [{ url: 'https://www.economia-sniim.gob.mx/precios/puebla', title: 'SNIIM Puebla' }];
const local = normalizePrice('pork', payload, sources);
assert.equal(local.available, true);
assert.equal(local.price, 38);
assert.equal(local.market.includes('Puebla'), true);

assert.throws(() => normalizePrice('pork', { ...payload, market: 'Central de Abasto de Toluca' }, sources), /Puebla/);
assert.throws(() => normalizePrice('chicken', { ...payload, price: 50, rangeMin: 55, rangeMax: 66 }, sources), /no pertenece/);
assert.throws(() => normalizePrice('beef', payload, []), /fuentes web/);

const beefRow = extractAbasterosPueblaSniimQuote([
    '<table><tr><td>15/09/26</td><td>$53.51</td>',
    '<td>Mercado Mayorista de Puebla Puebla</td><td>SNIIM</td></tr></table>',
].join(''), 'bovino en pie');
assert.equal(beefRow.price, 53.51);
assert.equal(beefRow.quoteDate, '2026-09-15');
assert.throws(() => extractAbasterosPueblaSniimQuote('<table></table>', 'pollo en canal'), /Puebla/);

assert.equal(cacheIsFresh({
    schemaVersion: CACHE_SCHEMA, market: PUEBLA_MARKET, retrievedAt: new Date().toISOString(),
}), true);
assert.equal(cacheIsFresh({ retrievedAt: new Date().toISOString() }), false);

console.log('Gemini Puebla wholesale-price service tests: OK');
