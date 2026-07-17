'use strict';

// ── Dimensión región/país compartida ────────────────────────────────────────
// Preparación para el futuro apartado "México" (Finanzas + Mercados filtrado a MX).
// Al normalizar aquí, ese filtro será `items.filter(i => i.countryCode === 'MX')`
// sin migraciones ni reescritura de lógica.
//
// countryCode sigue ISO-3166 alpha-2, con dos valores especiales:
//   'EU'     → Zona Euro (agregado supranacional)
//   'GLOBAL' → instrumento sin país específico (oro, cripto, commodities)

// Bloques de /bond-yields — su `key` ya identifica al emisor soberano.
const COUNTRY_BY_BOND_KEY = {
    us: 'US', eu: 'EU', mx: 'MX', jp: 'JP', gb: 'GB', cn: 'CN', br: 'BR', ca: 'CA',
};

// Mapa explícito ticker (Yahoo Finance) → país, para instrumentos conocidos.
const COUNTRY_BY_TICKER = {
    '^MXX': 'MX', '^MEXBOL': 'MX', 'MXN=X': 'MX', 'USDMXN=X': 'MX',
    '^GSPC': 'US', '^IXIC': 'US', '^DJI': 'US', '^NDX': 'US', '^VIX': 'US',
    '^IRX': 'US', '^FVX': 'US', '^TNX': 'US', '^TYX': 'US', 'QQQ': 'US',
    '^FCHI': 'EU', '^GDAXI': 'EU', '^STOXX50E': 'EU',
    '^FTSE': 'GB', '^N225': 'JP', '^BVSP': 'BR', '^GSPTSE': 'CA', '^HSI': 'CN',
};

// Fallback por divisa cuando el ticker no está mapeado explícitamente.
const CURRENCY_TO_COUNTRY = {
    MXN: 'MX', USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP', BRL: 'BR', CAD: 'CA', CNY: 'CN',
};

function countryForBondKey(key) {
    return COUNTRY_BY_BOND_KEY[key] || 'GLOBAL';
}

// Deriva el país de un instrumento: mapa explícito → divisa → GLOBAL.
function countryForTicker(ticker, currency) {
    if (ticker) {
        const t = String(ticker).toUpperCase();
        if (COUNTRY_BY_TICKER[t]) return COUNTRY_BY_TICKER[t];
    }
    if (currency) {
        const c = String(currency).toUpperCase();
        if (CURRENCY_TO_COUNTRY[c]) return CURRENCY_TO_COUNTRY[c];
    }
    return 'GLOBAL';
}

module.exports = {
    COUNTRY_BY_BOND_KEY,
    COUNTRY_BY_TICKER,
    CURRENCY_TO_COUNTRY,
    countryForBondKey,
    countryForTicker,
};
