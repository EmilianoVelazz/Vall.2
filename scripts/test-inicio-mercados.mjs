import assert from 'node:assert/strict';
import { normalizarCotizacion, geometriaSerie, precio, porcentaje, ACTIVOS_INICIO } from '../frontend/src/lib/inicioMercados.js';

// Un valor ausente nunca debe publicarse como un precio cero.
for (const absent of [null, undefined, '', NaN]) {
  assert.equal(precio(absent), '—');
  assert.equal(porcentaje(absent), '—');
}
assert.equal(precio(0), '0.00');
assert.equal(porcentaje(0), '0.00%');
assert.equal(porcentaje(-2), '-2.00%');
assert.throws(() => normalizarCotizacion({ meta: { regularMarketPrice: null }, candles: [] }));

const quote = normalizarCotizacion({
  meta: { regularMarketPrice: null, regularMarketChangePercent: 0 },
  candles: [
    { time: '2026-09-29', open: 100, high: 105, low: 98, close: 103 },
    { time: '2026-09-28', open: 100, high: 100, low: 100, close: 100 },
    { time: '2026-09-30', open: null, high: 99, low: 90, close: 95 },
    { time: '2026-99-99', open: 1, high: 2, low: 0, close: 1 },
  ],
});
assert.equal(quote.price, 103);
assert.equal(quote.change, 0);
assert.equal(quote.candles.length, 2);
assert.equal(quote.candles[0].time, '2026-09-28');
assert.equal(quote.date, '2026-09-29');
assert.equal(normalizarCotizacion({ meta: { regularMarketPrice: 104 }, candles: quote.candles }).price, 104);
assert.equal(normalizarCotizacion({ meta: { regularMarketPrice: 0 } }).price, 0);

// Escalas constantes, cero, un único dato y mechas fuera del rango de cierres.
const flat = geometriaSerie([{ close: 0, open: 0, high: 0, low: 0 }], 180, 44);
assert(Number.isFinite(flat.x(0)) && Number.isFinite(flat.y(0)));
const geometry = geometriaSerie(quote.candles, 540, 178, 6, true);
assert(geometry.min < 98 && geometry.max > 105);
assert(geometry.y(105) < geometry.y(98));
assert(geometry.x(0) < geometry.x(1));
assert.equal(geometriaSerie([], 180, 44), null);
assert.equal(ACTIVOS_INICIO.find(asset => asset.ticker === 'ZC=F').unit, '¢ USD/bu');
assert.equal(ACTIVOS_INICIO.find(asset => asset.ticker === 'HE=F').unit, '¢ USD/lb');
assert.equal(new Set(ACTIVOS_INICIO.map(asset => asset.ticker)).size, ACTIVOS_INICIO.length);
console.log('Inicio: datos ausentes, precios de respaldo, fechas, unidades y geometría de las gráficas verificados.');
