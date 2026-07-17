'use strict';

// ── Servicio de Mercados ─────────────────────────────────────────────────────
// Capa de síntesis que compone los *sources* compartidos. Los routers solo
// validan la petición HTTP, llaman aquí y presentan el resultado — nada de
// lógica de obtención/parseo de datos vive en las rutas.

const { fetchYahooChart } = require('./sources/yahoo');

// Historial OHLC normalizado para un instrumento. Devuelve { candles, meta }
// (meta incluye countryCode). La validación de ticker/interval/range y la caché
// son responsabilidad del router (preocupaciones de transporte).
async function getStockHistory({ ticker, interval, range }) {
    return fetchYahooChart({ ticker, interval, range });
}

module.exports = { getStockHistory };
