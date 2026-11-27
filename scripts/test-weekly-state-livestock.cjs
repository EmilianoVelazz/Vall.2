'use strict';

const assert = require('assert');
const {
    parseAbasterosRows, nextSundayRefreshAt,
} = require('../backend/lib/weekly-state-livestock-service');

const html = [
    '<table>',
    '<tr><td>15/09/26</td><td>$51.70</td><td>Mercado Mayorista de Guadalajara Guadalajara</td><td>SNIIM</td></tr>',
    '<tr><td>15/09/26</td><td>$52.30</td><td>Mercado Mayorista de Tlaquepaque Guadalajara</td><td>SNIIM</td></tr>',
    '<tr><td>08/09/26</td><td>$49.00</td><td>Mercado Mayorista de Guadalajara Guadalajara</td><td>SNIIM</td></tr>',
    '<tr><td>15/09/26</td><td>$999.00</td><td>Mercado Mayorista de Puebla Puebla</td><td>Otra fuente</td></tr>',
    '</table>',
].join('');

const quotes = parseAbasterosRows(html, 'chicken');
assert.equal(quotes.length, 1);
assert.equal(quotes[0].stateCode, 'JAL');
assert.equal(quotes[0].price, 52);
assert.equal(quotes[0].date, '2026-09-15');
assert.equal(quotes[0].cadence, 'weekly-source');
const independent=parseAbasterosRows('<table><tr><td>26/11/26</td><td>$55.00</td><td>Rastro Municipal de Campeche Campeche</td><td>SNIIM</td></tr><tr><td>26/11/26</td><td>$57.00</td><td>Mercado Mayorista de Toluca Toluca</td><td>SNIIM</td></tr></table>','beef');
assert.deepEqual(independent.map(row=>row.stateCode).sort(),['CAM','MEX'],'La cobertura directa no depende del catálogo reducido de cerdo ni del respaldo de IA');
assert(independent.every(row=>row.unit==='MXN/kg vivo'&&row.sourceUrl.startsWith('https://')));

assert.equal(
    nextSundayRefreshAt(new Date('2026-09-23T17:00:00Z')).toISOString(),
    '2026-09-27T17:00:00.000Z',
);
assert.equal(
    nextSundayRefreshAt(new Date('2026-09-27T17:00:01Z')).toISOString(),
    '2026-10-04T17:00:00.000Z',
);

console.log('Weekly state livestock service tests: OK');
