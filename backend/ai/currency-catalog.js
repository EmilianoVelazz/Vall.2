'use strict';

// Catálogo compartido de divisas. Intl mantiene los códigos ISO 4217 y sus
// nombres localizados sin obligarnos a conservar una lista manual que quede
// obsoleta cada vez que el usuario solicita una moneda nueva.
const FALLBACK_CODES = [
    'AED', 'ARS', 'AUD', 'BRL', 'CAD', 'CHF', 'CLP', 'CNY', 'COP', 'CZK',
    'DKK', 'EGP', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'JPY',
    'KRW', 'MXN', 'MYR', 'NGN', 'NOK', 'NZD', 'PEN', 'PHP', 'PLN', 'QAR',
    'RON', 'RUB', 'SAR', 'SEK', 'SGD', 'THB', 'TRY', 'TWD', 'USD', 'VND',
    'ZAR',
];

const COMMON_LOWERCASE_CODES = new Set([
    'USD', 'EUR', 'GBP', 'MXN', 'ARS', 'CAD', 'AUD', 'JPY', 'CNY', 'CHF',
    'BRL', 'COP', 'CLP', 'PEN', 'INR', 'KRW', 'RUB', 'TRY', 'NZD', 'ZAR',
]);

const EXTRA_ALIASES = Object.freeze({
    USD: ['dolar', 'dolares', 'dolar americano', 'dolares americanos', 'dolar estadounidense', 'dolares estadounidenses'],
    EUR: ['euro', 'euros'],
    GBP: ['libra', 'libras', 'libra britanica', 'libras britanicas', 'libra esterlina', 'libras esterlinas'],
    MXN: ['peso mexicano', 'pesos mexicanos'],
    ARS: ['peso argentino', 'pesos argentinos'],
    JPY: ['yen', 'yenes', 'yem', 'yem japones', 'yen japones', 'yenes japoneses'],
    CNY: ['yuan', 'yuanes', 'yuan chino', 'yuanes chinos', 'renminbi'],
    CHF: ['franco suizo', 'francos suizos'],
    CAD: ['dolar canadiense', 'dolares canadienses'],
    AUD: ['dolar australiano', 'dolares australianos'],
    NZD: ['dolar neozelandes', 'dolares neozelandeses'],
    BRL: ['real brasileno', 'reales brasilenos'],
    COP: ['peso colombiano', 'pesos colombianos'],
    CLP: ['peso chileno', 'pesos chilenos'],
    PEN: ['sol peruano', 'soles peruanos'],
    INR: ['rupia india', 'rupias indias'],
    KRW: ['won surcoreano', 'wones surcoreanos'],
    RUB: ['rublo ruso', 'rublos rusos'],
    TRY: ['lira turca', 'liras turcas'],
});

function normalizeCurrencyText(value) {
    return String(value || '').toLowerCase().normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function titleCase(value) {
    const text = String(value || '').trim();
    return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

function supportedCurrencyCodes() {
    try {
        const codes = Intl.supportedValuesOf('currency');
        if (Array.isArray(codes) && codes.length) return codes;
    } catch (_) { /* Runtime antiguo: se usa la selección de respaldo. */ }
    return FALLBACK_CODES;
}

function displayName(code) {
    try {
        const names = new Intl.DisplayNames(['es-MX', 'es'], { type: 'currency', fallback: 'code' });
        return titleCase(names.of(code) || code);
    } catch (_) {
        return code;
    }
}

const CURRENCY_CATALOG = Object.freeze(supportedCurrencyCodes().map(code => {
    const name = displayName(code);
    const aliases = new Set([normalizeCurrencyText(name), ...(EXTRA_ALIASES[code] || [])]);
    return Object.freeze({ code, name, aliases: Object.freeze([...aliases].filter(Boolean)) });
}));

const CURRENCY_BY_CODE = new Map(CURRENCY_CATALOG.map(currency => [currency.code, currency]));
const MENTION_CACHE = new Map();
const MENTION_CACHE_LIMIT = 300;
const STRONG_CURRENCY_CONTEXT = /\b(?:monedas?|divisas?|forex|tipo de cambio|cotizaci[oó]n(?:es)?|convertir|convierte|conversi[oó]n)\b|\b[a-z]{3}\s*(?:vs\.?|versus|contra|frente a|\/)\s*[a-z]{3}\b/i;

function levenshtein(left, right) {
    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let row = 1; row <= left.length; row++) {
        const current = [row];
        for (let column = 1; column <= right.length; column++) {
            current[column] = Math.min(
                current[column - 1] + 1,
                previous[column] + 1,
                previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
            );
        }
        previous = current;
    }
    return previous[right.length];
}

function exactAliasCandidates(normalized) {
    const padded = ` ${normalized} `;
    const candidates = [];
    for (const currency of CURRENCY_CATALOG) {
        for (const alias of currency.aliases) {
            let offset = 0;
            const needle = ` ${alias} `;
            while ((offset = padded.indexOf(needle, offset)) >= 0) {
                candidates.push({ code: currency.code, index: Math.max(0, offset - 1), length: alias.length, distance: 0 });
                offset += needle.length - 1;
            }
        }
    }
    return candidates;
}

function codeCandidates(rawText) {
    const candidates = [];
    const allowsLowercaseIso = STRONG_CURRENCY_CONTEXT.test(rawText);
    for (const currency of CURRENCY_CATALOG) {
        const expression = new RegExp(`\\b${currency.code}\\b`, 'gi');
        let match;
        while ((match = expression.exec(rawText))) {
            const explicitlyUppercase = match[0] === currency.code;
            if (!explicitlyUppercase && !COMMON_LOWERCASE_CODES.has(currency.code) && !allowsLowercaseIso) continue;
            candidates.push({ code: currency.code, index: match.index, length: currency.code.length, distance: 0 });
        }
    }
    return candidates;
}

function fuzzyAliasCandidates(normalized) {
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const positions = [];
    let cursor = 0;
    for (const token of tokens) {
        const index = normalized.indexOf(token, cursor);
        positions.push(index);
        cursor = index + token.length;
    }
    const candidates = [];
    for (const currency of CURRENCY_CATALOG) {
        let best = null;
        for (const alias of currency.aliases) {
            if (alias.length < 8) continue;
            const targetWords = alias.split(' ').length;
            for (let size = Math.max(1, targetWords - 1); size <= Math.min(5, targetWords + 1); size++) {
                for (let start = 0; start + size <= tokens.length; start++) {
                    const phrase = tokens.slice(start, start + size).join(' ');
                    const threshold = Math.max(1, Math.floor(alias.length * 0.12));
                    if (Math.abs(phrase.length - alias.length) > threshold) continue;
                    const distance = levenshtein(phrase, alias);
                    if (distance > threshold) continue;
                    const candidate = { code: currency.code, index: positions[start], length: phrase.length, distance };
                    if (!best || distance < best.distance || (distance === best.distance && phrase.length > best.length)) best = candidate;
                }
            }
        }
        if (best) candidates.push(best);
    }
    return candidates;
}

function overlaps(left, right) {
    return left.index < right.index + right.length && right.index < left.index + left.length;
}

function findCurrencyMentions(message) {
    const raw = String(message || '');
    if (MENTION_CACHE.has(raw)) return MENTION_CACHE.get(raw);
    const normalized = normalizeCurrencyText(raw);
    if (!normalized) return [];
    const exact = [...exactAliasCandidates(normalized), ...codeCandidates(raw)];
    const candidates = [...exact, ...fuzzyAliasCandidates(normalized)]
        .sort((left, right) => left.index - right.index
            || left.distance - right.distance
            || right.length - left.length);
    const accepted = [];
    for (const candidate of candidates) {
        const conflict = accepted.find(item => overlaps(item, candidate));
        if (conflict) {
            const better = candidate.distance < conflict.distance
                || (candidate.distance === conflict.distance && candidate.length > conflict.length);
            if (!better) continue;
            accepted.splice(accepted.indexOf(conflict), 1, candidate);
            continue;
        }
        accepted.push(candidate);
    }
    const seen = new Set();
    const result = accepted.sort((left, right) => left.index - right.index).filter(candidate => {
        if (seen.has(candidate.code)) return false;
        seen.add(candidate.code);
        return true;
    }).map(candidate => Object.freeze({ ...candidate, name: CURRENCY_BY_CODE.get(candidate.code)?.name || candidate.code }));
    const frozen = Object.freeze(result);
    MENTION_CACHE.set(raw, frozen);
    if (MENTION_CACHE.size > MENTION_CACHE_LIMIT) MENTION_CACHE.delete(MENTION_CACHE.keys().next().value);
    return frozen;
}

function currencyToYahooSymbol(code) {
    return code === 'USD' ? 'USD-BASE' : `${code}=X`;
}

function currencyCodeFromSymbol(symbol) {
    if (symbol === 'USD-BASE') return 'USD';
    const match = String(symbol || '').match(/^([A-Z]{3})=X$/);
    return match?.[1] || null;
}

function isCurrencyComparisonSymbol(symbol) {
    const code = currencyCodeFromSymbol(symbol);
    return Boolean(code && CURRENCY_BY_CODE.has(code));
}

function currencyNameFromSymbol(symbol) {
    const code = currencyCodeFromSymbol(symbol);
    return code ? (CURRENCY_BY_CODE.get(code)?.name || code) : symbol;
}

module.exports = {
    CURRENCY_CATALOG,
    CURRENCY_BY_CODE,
    normalizeCurrencyText,
    findCurrencyMentions,
    currencyToYahooSymbol,
    currencyCodeFromSymbol,
    isCurrencyComparisonSymbol,
    currencyNameFromSymbol,
};
