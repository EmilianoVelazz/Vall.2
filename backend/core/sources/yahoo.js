'use strict';

// ── Source: Yahoo Finance ────────────────────────────────────────────────────
// Única fuente de verdad para acceder a Yahoo. Antes la lógica de descarga y
// parseo estaba duplicada entre routes/external.js (fetchYahooYield, usada por
// /bond-yields) y routes/market.js (parseo de velas OHLC de /stock-history).
// Usa la cola con throttling de lib/http (yahooFetch) para respetar el
// rate-limit de Yahoo cuando la página dispara ~40 tickers a la vez.

const { yahooFetch, YF_UA } = require('../../lib/http');
const { countryForTicker }  = require('../shape');

// Rendimiento puntual de un índice/bono: { yield, prev }.
async function fetchYahooYield(ticker) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const r = await yahooFetch(url, {
        headers: { 'User-Agent': YF_UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) throw new Error(`Yahoo ${r.status}`);
    const json   = await r.json();
    const result = json?.chart?.result?.[0];
    const meta   = result?.meta;
    if (!meta?.regularMarketPrice) throw new Error('sin precio');
    const closes = result?.indicators?.quote?.[0]?.close?.filter(v => v != null) || [];
    const prev   = closes.length >= 2 ? closes[closes.length - 2] : null;
    return { yield: meta.regularMarketPrice, prev };
}

// Descarga y NORMALIZA velas OHLC + meta. Devuelve exactamente { candles, meta },
// la misma forma que servía /api/stock-history, más `meta.countryCode` (aditivo).
async function fetchYahooChart({ ticker, interval, range }) {
    let url;
    // 3y y 4y no son rangos nativos de Yahoo → se calculan con period1/period2.
    if (range === '3y' || range === '4y') {
        const years   = range === '3y' ? 3 : 4;
        const period2 = Math.floor(Date.now() / 1000);
        const period1 = Math.floor(period2 - years * 365.25 * 24 * 3600);
        url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&period1=${period1}&period2=${period2}`;
    } else {
        url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
    }

    const r = await yahooFetch(url, {
        headers: {
            'User-Agent':      YF_UA,
            'Accept':          'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
        },
    });
    if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
    const json = await r.json();

    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('Sin datos en respuesta');

    const tss   = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const isIntraday = ['1m', '5m', '15m', '30m', '1h'].includes(interval);

    const candles = tss.map((t, i) => {
        const o = quote.open?.[i], h = quote.high?.[i],
              l = quote.low?.[i],  c = quote.close?.[i];
        const v = quote.volume?.[i];
        if (o == null || h == null || l == null || c == null) return null;
        if (isIntraday) return { time: t, open: o, high: h, low: l, close: c, volume: v ?? null };
        const d  = new Date(t * 1000);
        const ds = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        return { time: ds, open: o, high: h, low: l, close: c, volume: v ?? null };
    }).filter(Boolean);

    const meta = result.meta || {};
    return {
        candles,
        meta: {
            symbol:                     meta.symbol,
            currency:                   meta.currency,
            regularMarketPrice:         meta.regularMarketPrice,
            regularMarketDayHigh:       meta.regularMarketDayHigh,
            regularMarketDayLow:        meta.regularMarketDayLow,
            regularMarketChangePercent: (() => {
                if (meta.regularMarketChangePercent != null) return meta.regularMarketChangePercent;
                if (meta.regularMarketChange != null && meta.regularMarketPrice != null) {
                    const prev = meta.regularMarketPrice - meta.regularMarketChange;
                    return prev !== 0 ? (meta.regularMarketChange / prev) * 100 : null;
                }
                if (candles.length >= 2) {
                    const last = candles[candles.length - 1].close;
                    const prev = candles[candles.length - 2].close;
                    return prev > 0 ? ((last - prev) / prev) * 100 : null;
                }
                return null;
            })(),
            longName: meta.longName || meta.shortName || '',
            // Dimensión país/región (aditivo — prep. para el futuro apartado "México")
            countryCode: countryForTicker(meta.symbol || ticker, meta.currency),
        },
    };
}

module.exports = { fetchYahooYield, fetchYahooChart };
