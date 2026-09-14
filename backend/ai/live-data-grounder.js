'use strict';

const { externalGet } = require('../lib/http');
const { getCurrencyQuote, parseCurrencyPair } = require('./currency-converter');
const { searchTerms } = require('./rag-retriever');

const QUOTE_RULES = [
    { re: /\b(?:s&p|sp500|s&p 500)\b/i, symbol: '^GSPC', label: 'S&P 500', unit: 'puntos' },
    { re: /\b(?:nasdaq)\b/i, symbol: '^IXIC', label: 'Nasdaq Composite', unit: 'puntos' },
    { re: /\b(?:ipc|bmv|bolsa mexicana)\b/i, symbol: '^MXX', label: 'S&P/BMV IPC', unit: 'puntos' },
    { re: /\b(?:bitcoin|btc)\b/i, symbol: 'BTC-USD', label: 'Bitcoin', unit: 'USD' },
    { re: /\b(?:ethereum|ether|eth)\b/i, symbol: 'ETH-USD', label: 'Ethereum', unit: 'USD' },
    { re: /\b(?:walmex|walmart m[eé]xico)\b/i, symbol: 'WALMEX.MX', label: 'Walmex', unit: 'MXN' },
    { re: /\b(?:femsa)\b/i, symbol: 'FEMSAUBD.MX', label: 'FEMSA', unit: 'MXN' },
    { re: /\b(?:bimbo)\b/i, symbol: 'BIMBOA.MX', label: 'Bimbo', unit: 'MXN' },
    { re: /\b(?:gruma)\b/i, symbol: 'GRUMAB.MX', label: 'Gruma', unit: 'MXN' },
    { re: /\b(?:ma[ií]z|corn)\b/i, symbol: 'ZC=F', label: 'Maíz CME', unit: 'USD/bu' },
    { re: /\b(?:soya|soja)\b/i, symbol: 'ZS=F', label: 'Soya CBOT', unit: 'USD/bu' },
    { re: /\b(?:trigo|wheat)\b/i, symbol: 'ZW=F', label: 'Trigo CBOT', unit: 'USD/bu' },
    { re: /\b(?:cerdo|porcino|lean hog)\b/i, symbol: 'HE=F', label: 'Cerdo magro CME', unit: '¢ USD/lb' },
    { re: /\b(?:ganado|bovino|live cattle)\b/i, symbol: 'LE=F', label: 'Ganado vivo CME', unit: '¢ USD/lb' },
    { re: /\b(?:petr[oó]leo|wti|crudo)\b/i, symbol: 'CL=F', label: 'Petróleo WTI', unit: 'USD/bbl' },
    { re: /\b(?:gas natural)\b/i, symbol: 'NG=F', label: 'Gas natural', unit: 'USD/MMBtu' },
    { re: /\b(?:oro|gold)\b/i, symbol: 'GC=F', label: 'Oro', unit: 'USD/oz' },
    { re: /\b(?:cobre|copper)\b/i, symbol: 'HG=F', label: 'Cobre', unit: 'USD/lb' },
];

const BOND_RULES = [
    { re: /\b(?:10 a[nñ]os?|10y|treasury)\b/i, symbol: '^TNX', label: 'Treasury EE. UU. 10 años', unit: '%' },
    { re: /\b(?:3 meses|3m|letra del tesoro)\b/i, symbol: '^IRX', label: 'Treasury EE. UU. 3 meses', unit: '%' },
];

const CACHE_MS = 2 * 60 * 1000;
const quoteCache = new Map();

function formatted(value, digits = 4) {
    return Number(value).toLocaleString('en-US', { maximumFractionDigits: digits });
}

async function yahooQuote(rule, get = externalGet) {
    const cached = quoteCache.get(rule.symbol);
    if (cached && Date.now() - cached.savedAt < CACHE_MS) return cached.value;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(rule.symbol)}?range=5d&interval=1d`;
    const response = await get(url, { Accept: 'application/json' }, 7000);
    if (!response.ok) throw new Error(`Yahoo Finance no disponible (${response.status}).`);
    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const closes = (result?.indicators?.quote?.[0]?.close || []).filter(Number.isFinite);
    if (!closes.length) throw new Error('Yahoo Finance no devolvió un cierre verificable.');
    const value = closes.at(-1);
    const previous = closes.length > 1 ? closes.at(-2) : null;
    const change = Number.isFinite(previous) && previous !== 0 ? (value / previous - 1) * 100 : null;
    const timestamp = Array.isArray(result?.timestamp) ? result.timestamp.at(-1) : null;
    const quote = {
        ...rule, value, change,
        updatedAt: timestamp ? new Date(timestamp * 1000).toISOString() : null,
        source: 'Yahoo Finance',
    };
    quoteCache.set(rule.symbol, { savedAt: Date.now(), value: quote });
    return quote;
}

function rulesForMessage(message, plan) {
    const text = String(message || '');
    const rules = QUOTE_RULES.filter(rule => rule.re.test(text));
    if (plan.topic === 'bonds') rules.push(...BOND_RULES.filter(rule => rule.re.test(text)));
    // Una consulta general por bonos debe ofrecer una curva mínima comprobable.
    if (plan.topic === 'bonds' && !rules.length) rules.push(...BOND_RULES);
    return rules.slice(0, 3);
}

function quoteContext(quotes) {
    if (!quotes.length) return '';
    return '[DATOS EN VIVO VERIFICADOS]\n' + quotes.map((quote, index) => {
        const change = Number.isFinite(quote.change) ? `; variación frente al cierre previo: ${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)}%` : '';
        return `[L${index + 1}] ${quote.label}: ${formatted(quote.value)} ${quote.unit}${change}. Fuente: ${quote.source}; corte: ${quote.updatedAt || 'último dato devuelto por la fuente'}.`;
    }).join('\n');
}

function quoteCitations(quotes) {
    return quotes.map((quote, index) => ({
        id: `L${index + 1}`,
        title: quote.label,
        source: quote.source,
        date: quote.updatedAt || null,
        type: 'live_market_quote',
    }));
}

async function liveNews(message, get = externalGet) {
    if (!process.env.NEWSAPI_KEY) return [];
    const terms = searchTerms(message).split(' ').slice(0, 3).join(' ');
    if (!terms) return [];
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(terms)}&sortBy=publishedAt&language=es&pageSize=3&apiKey=${encodeURIComponent(process.env.NEWSAPI_KEY)}`;
    const response = await get(url, {}, 7000);
    if (!response.ok) throw new Error(`NewsAPI no disponible (${response.status}).`);
    const payload = await response.json();
    return Array.isArray(payload?.articles) ? payload.articles.filter(article => article?.title).slice(0, 3) : [];
}

function newsContext(articles, offset = 0) {
    if (!articles.length) return { context: '', citations: [] };
    return {
        context: '[NOTICIAS EN VIVO VERIFICADAS]\n' + articles.map((article, index) =>
            `[L${offset + index + 1}] ${article.title}\nFuente: ${article.source?.name || 'NewsAPI'}; fecha: ${article.publishedAt || 'sin fecha'}; URL: ${article.url || 'no disponible'}\nResumen: ${article.description || 'Sin resumen disponible.'}`
        ).join('\n\n'),
        citations: articles.map((article, index) => ({
            id: `L${offset + index + 1}`, title: article.title, source: article.source?.name || 'NewsAPI',
            date: article.publishedAt || null, url: article.url || null, type: 'live_news',
        })),
    };
}

async function groundLiveData(plan, message) {
    if (!plan.needsLiveQuote && !plan.needsLiveNews) return null;
    const contexts = [];
    const citations = [];
    const sourceCodes = [];
    let available = false;
    const warnings = [];

    if (plan.topic === 'fx' && plan.needsLiveQuote) {
        try {
            const pair = parseCurrencyPair(message) || { from: 'USD', to: 'MXN' };
            const quote = await getCurrencyQuote(pair.from, pair.to);
            if (quote) {
                available = true;
                sourceCodes.push('exchange_rate_api');
                contexts.push(`[DATOS EN VIVO VERIFICADOS]\n[L1] Tipo de cambio ${quote.from}/${quote.to}: 1 ${quote.from} = ${formatted(quote.rate, quote.to === 'MXN' ? 4 : 6)} ${quote.to}. Fuente: ${quote.source}; corte: ${quote.updatedAt || 'última actualización del proveedor'}.`);
                citations.push({ id: 'L1', title: `Tipo de cambio ${quote.from}/${quote.to}`, source: quote.source, date: quote.updatedAt || null, type: 'live_fx_quote' });
            }
        } catch (error) { warnings.push(`Divisas: ${error.message}`); }
    } else if (plan.needsLiveQuote) {
        const rules = rulesForMessage(message, plan);
        if (rules.length) {
            const settled = await Promise.allSettled(rules.map(rule => yahooQuote(rule)));
            const quotes = settled.filter(item => item.status === 'fulfilled').map(item => item.value);
            settled.filter(item => item.status === 'rejected').forEach(item => warnings.push(`Mercado: ${item.reason?.message || 'fuente no disponible'}`));
            if (quotes.length) {
                available = true;
                sourceCodes.push('yahoo_finance');
                contexts.push(quoteContext(quotes));
                citations.push(...quoteCitations(quotes));
            }
        } else {
            warnings.push('No se identificó un activo o instrumento concreto para cotización en vivo.');
        }
    }

    if (plan.needsLiveNews) {
        try {
            const articles = await liveNews(message);
            const news = newsContext(articles, citations.length);
            if (news.context) {
                available = true;
                sourceCodes.push('newsapi');
                contexts.push(news.context);
                citations.push(...news.citations);
            }
        } catch (error) { warnings.push(`Noticias: ${error.message}`); }
    }

    const unavailable = (plan.needsLiveQuote || plan.needsLiveNews) && !available;
    if (unavailable) contexts.push('[DATOS EN VIVO NO DISPONIBLES]\nNo se obtuvo una fuente vigente para esta consulta. No afirmes una cotización, precio, titular o valor actual; explica la limitación y pide el activo o periodo necesario si aplica.');
    return {
        context: contexts.join('\n\n'), citations, sourceCodes, available, warnings,
        strategy: available ? 'live_data_verified_v1' : 'live_data_unavailable_v1',
    };
}

module.exports = { groundLiveData, yahooQuote, rulesForMessage, quoteContext };
