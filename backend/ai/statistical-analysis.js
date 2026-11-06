'use strict';

/*
 * Modelos estadísticos reproducibles para VALL AI.
 *
 * La IA puede interpretar los resultados, pero nunca calcula sus coeficientes:
 * esta capa obtiene la serie, ejecuta OLS de forma determinista y adjunta el
 * resultado a la respuesta rica. Así R², pendiente y ajuste son auditables.
 */

const { externalGet, YF_UA } = require('../lib/http');
const { PROTEIN_ISSUERS } = require('../services/protein-equities');

// Incluye la variante frecuente «regreción/regrecion». El clasificador no
// debe dejar fuera un cálculo OLS sólo por ese error de teclado.
const REQUEST_RE = /\b(?:regre[sc]i[oó]n(?:es)?|modelo\s+lineal|m[ií]nimos\s+cuadrados|\bols\b|an[aá]lisis\s+estad[ií]stic[oa]|estad[ií]stic[oa]\s+(?:del|de la|de los)|tendencia\s+lineal)\b/i;
const MIN_OBSERVATIONS = 8;
const SERIES_TTL = 15 * 60 * 1000;
const MAX_SERIES_CACHE = 40;
const seriesCache = new Map();

// Los símbolos se limitan a instrumentos que forman parte del alcance de
// VALLNews. Esto evita transformar el chat en un proxy abierto de Yahoo.
const INSTRUMENTS = Object.freeze([
    { key: 'USDMXN=X', ticker: 'USDMXN=X', name: 'USD/MXN', unit: 'MXN por USD', re: /\b(?:usd\s*\/?\s*mxn|d[oó]lar(?:es)?(?: estadounidense)?|tipo de cambio|peso mexicano)\b/i },
    { key: 'AUDUSD=X', ticker: 'AUDUSD=X', name: 'AUD/USD', unit: 'USD por AUD', re: /\b(?:aud\s*\/?\s*usd|d[oó]lar australiano)\b/i },
    { key: 'EURUSD=X', ticker: 'EURUSD=X', name: 'EUR/USD', unit: 'USD por EUR', re: /\b(?:eur\s*\/?\s*usd|euro(?: frente al)? d[oó]lar)\b/i },
    { key: 'GBPUSD=X', ticker: 'GBPUSD=X', name: 'GBP/USD', unit: 'USD por GBP', re: /\b(?:gbp\s*\/?\s*usd|libra esterlina)\b/i },
    { key: 'USDJPY=X', ticker: 'USDJPY=X', name: 'USD/JPY', unit: 'JPY por USD', re: /\b(?:usd\s*\/?\s*jpy|yen(?: japon[eé]s)?)\b/i },
    { key: 'USDCAD=X', ticker: 'USDCAD=X', name: 'USD/CAD', unit: 'CAD por USD', re: /\b(?:usd\s*\/?\s*cad|d[oó]lar canadiense)\b/i },
    { key: 'USDBRL=X', ticker: 'USDBRL=X', name: 'USD/BRL', unit: 'BRL por USD', re: /\b(?:usd\s*\/?\s*brl|real brasile[nñ]o)\b/i },
    { key: 'USDINR=X', ticker: 'USDINR=X', name: 'USD/INR', unit: 'INR por USD', re: /\b(?:usd\s*\/?\s*inr|rupia india)\b/i },
    { key: '^MXX', ticker: '^MXX', name: 'S&P/BMV IPC', unit: 'puntos', re: /\b(?:ipc|bmv|bolsa mexicana)\b/i },
    { key: '^GSPC', ticker: '^GSPC', name: 'S&P 500', unit: 'puntos', re: /\b(?:s\s*(?:&\s*)?p\s*(?:&\s*)?500|sp500|s&p)\b/i },
    { key: '^IXIC', ticker: '^IXIC', name: 'Nasdaq Composite', unit: 'puntos', re: /\b(?:nasdaq)\b/i },
    { key: '^DJI', ticker: '^DJI', name: 'Dow Jones Industrial Average', unit: 'puntos', re: /\b(?:dow\s*jones|djia)\b/i },
    { key: '^AXJO', ticker: '^AXJO', name: 'S&P/ASX 200 Australia', unit: 'puntos', re: /\b(?:asx\s*200|s&p\s*\/?\s*asx|bolsa australiana|[ií]ndice australiano)\b/i },
    { key: '^FTSE', ticker: '^FTSE', name: 'FTSE 100 Reino Unido', unit: 'puntos', re: /\b(?:ftse\s*100|bolsa londinense|bolsa de londres)\b/i },
    { key: '^GDAXI', ticker: '^GDAXI', name: 'DAX Alemania', unit: 'puntos', re: /\b(?:\bdax\b|bolsa alemana|fr[aá]ncfort)\b/i },
    { key: '^FCHI', ticker: '^FCHI', name: 'CAC 40 Francia', unit: 'puntos', re: /\b(?:cac\s*40|bolsa francesa|par[ií]s)\b/i },
    { key: '^N225', ticker: '^N225', name: 'Nikkei 225 Japón', unit: 'puntos', re: /\b(?:nikkei|bolsa japonesa|tokio)\b/i },
    { key: '^HSI', ticker: '^HSI', name: 'Hang Seng Hong Kong', unit: 'puntos', re: /\b(?:hang seng|bolsa de hong kong)\b/i },
    { key: '^NSEI', ticker: '^NSEI', name: 'NIFTY 50 India', unit: 'puntos', re: /\b(?:nifty\s*50|bolsa india)\b/i },
    { key: '^BVSP', ticker: '^BVSP', name: 'Ibovespa Brasil', unit: 'puntos', re: /\b(?:ibovespa|bolsa brasile[nñ]a)\b/i },
    { key: '^GSPTSE', ticker: '^GSPTSE', name: 'S&P/TSX Canadá', unit: 'puntos', re: /\b(?:s&p\s*\/?\s*tsx|bolsa canadiense)\b/i },
    { key: '^KS11', ticker: '^KS11', name: 'KOSPI Corea del Sur', unit: 'puntos', re: /\b(?:kospi|bolsa coreana)\b/i },
    { key: '^TWII', ticker: '^TWII', name: 'TAIEX Taiwán', unit: 'puntos', re: /\b(?:taiex|bolsa taiwanesa|bolsa de taiw[aá]n)\b/i },
    { key: '^J203.JO', ticker: '^J203.JO', name: 'FTSE/JSE Top 40 Sudáfrica', unit: 'puntos', re: /\b(?:jse|bolsa sudafricana|sud[aá]frica)\b/i },
    { key: '^IBEX', ticker: '^IBEX', name: 'IBEX 35 España', unit: 'puntos', re: /\b(?:ibex\s*35|bolsa espa[nñ]ola)\b/i },
    { key: 'BTC-USD', ticker: 'BTC-USD', name: 'Bitcoin', unit: 'USD', re: /\b(?:bitcoin|btc)\b/i },
    { key: 'ETH-USD', ticker: 'ETH-USD', name: 'Ethereum', unit: 'USD', re: /\b(?:ethereum|ether|eth)\b/i },
    { key: 'WALMEX.MX', ticker: 'WALMEX.MX', name: 'Walmex', unit: 'MXN', re: /\b(?:walmex|walmart m[eé]xico)\b/i },
    { key: 'FEMSAUBD.MX', ticker: 'FEMSAUBD.MX', name: 'FEMSA', unit: 'MXN', re: /\b(?:femsa)\b/i },
    { key: 'BIMBOA.MX', ticker: 'BIMBOA.MX', name: 'Bimbo', unit: 'MXN', re: /\b(?:bimbo)\b/i },
    { key: 'GRUMAB.MX', ticker: 'GRUMAB.MX', name: 'Gruma', unit: 'MXN', re: /\b(?:gruma)\b/i },
    ...PROTEIN_ISSUERS.map(issuer => ({ key: issuer.ticker, ticker: issuer.ticker, name: issuer.name, unit: issuer.unit, re: issuer.re, assetClass: 'equity' })),
    { key: 'ZC=F', ticker: 'ZC=F', name: 'Maíz CME', unit: '¢ USD/bu', re: /\b(?:ma[ií]z|corn)\b/i },
    { key: 'ZW=F', ticker: 'ZW=F', name: 'Trigo CBOT', unit: '¢ USD/bu', re: /\b(?:trigo|wheat)\b/i },
    { key: 'ZS=F', ticker: 'ZS=F', name: 'Soya CBOT', unit: '¢ USD/bu', re: /\b(?:soya|soja)(?!\s+(?:molida|en\s+harina|en\s+aceite))\b/i },
    { key: 'ZM=F', ticker: 'ZM=F', name: 'Harina de soya CBOT', unit: 'USD/t corta', re: /\b(?:harina de soya|soybean meal)\b/i },
    { key: 'ZL=F', ticker: 'ZL=F', name: 'Aceite de soya CBOT', unit: '¢ USD/lb', re: /\b(?:aceite de soya|soybean oil)\b/i },
    { key: 'ZO=F', ticker: 'ZO=F', name: 'Avena CBOT', unit: '¢ USD/bu', re: /\b(?:avena|oats)\b/i },
    { key: 'KC=F', ticker: 'KC=F', name: 'Café arábica ICE', unit: '¢ USD/lb', re: /(?:\bcafe\b|\bcaf[eé](?=\s|$|[.,;:!?])|\bcoffee\b)/i },
    { key: 'SB=F', ticker: 'SB=F', name: 'Azúcar ICE', unit: '¢ USD/lb', re: /\b(?:az[uú]car|sugar)\b/i },
    { key: 'CT=F', ticker: 'CT=F', name: 'Algodón ICE', unit: '¢ USD/lb', re: /\b(?:algod[oó]n|cotton)\b/i },
    { key: 'CC=F', ticker: 'CC=F', name: 'Cacao ICE', unit: 'USD/t', re: /\b(?:cacao|cocoa)\b/i },
    { key: 'HE=F', ticker: 'HE=F', name: 'Cerdo magro CME', unit: '¢ USD/lb', re: /\b(?:cerdo|porcino|lean hog)\b/i },
    { key: 'LE=F', ticker: 'LE=F', name: 'Ganado vivo CME', unit: '¢ USD/lb', re: /\b(?:ganado|bovino|res|beef|live cattle)\b/i },
    { key: 'HRC=F', ticker: 'HRC=F', name: 'Acero laminado en caliente CME', unit: 'USD/t corta', re: /\b(?:acero|steel|hot[-\s]?rolled(?:\s+coil)?|bobina laminada en caliente|hrc)\b/i },
    { key: 'CL=F', ticker: 'CL=F', name: 'Petróleo WTI', unit: 'USD/bbl', re: /\b(?:wti|crudo(?:\s+wti)?|petr[oó]leo(?!\s+brent))\b/i },
    { key: 'BZ=F', ticker: 'BZ=F', name: 'Petróleo Brent', unit: 'USD/bbl', re: /\b(?:brent)\b/i },
    { key: 'NG=F', ticker: 'NG=F', name: 'Gas natural', unit: 'USD/MMBtu', re: /\b(?:gas natural)\b/i },
    { key: 'RB=F', ticker: 'RB=F', name: 'Gasolina RBOB', unit: 'USD/galón', re: /\b(?:gasolina|rbob)\b/i },
    { key: 'HO=F', ticker: 'HO=F', name: 'Fuel oil de calefacción', unit: 'USD/galón', re: /\b(?:fuel oil|heating oil|combust[oó]leo)\b/i },
    { key: 'GC=F', ticker: 'GC=F', name: 'Oro', unit: 'USD/oz', re: /\b(?:oro|gold)\b/i },
    { key: 'SI=F', ticker: 'SI=F', name: 'Plata', unit: 'USD/oz', re: /\b(?:plata|silver)\b/i },
    { key: 'PL=F', ticker: 'PL=F', name: 'Platino', unit: 'USD/oz', re: /\b(?:platino|platinum)\b/i },
    { key: 'PA=F', ticker: 'PA=F', name: 'Paladio', unit: 'USD/oz', re: /\b(?:paladio|palladium)\b/i },
    { key: 'HG=F', ticker: 'HG=F', name: 'Cobre', unit: 'USD/lb', re: /\b(?:cobre|copper)\b/i },
    { key: '^IRX', ticker: '^IRX', name: 'Treasury EE. UU. 3 meses', unit: '%', re: /\b(?:treasury\s*3\s*meses|letra del tesoro|t-?bill)\b/i },
    { key: '^TNX', ticker: '^TNX', name: 'Treasury EE. UU. 10 años', unit: '%', re: /\b(?:treasury(?!\s*3\s*meses)|bono(?:s)?(?: de)? ee\.?\s?uu\.?|10\s*(?:a[nñ]os?|y))\b/i },
]);

// Un nombre de índice ya determina su mercado. Esta capa impide que una frase
// como “ASX 200 de España” se convierta silenciosamente en datos de Australia.
// Sólo se activa con un instrumento único: las comparaciones internacionales
// pueden mencionar varios países de forma válida.
const INDEX_MARKETS = Object.freeze({
    '^MXX': { id: 'mexico', label: 'México' },
    '^GSPC': { id: 'united_states', label: 'Estados Unidos' },
    '^IXIC': { id: 'united_states', label: 'Estados Unidos' },
    '^DJI': { id: 'united_states', label: 'Estados Unidos' },
    '^AXJO': { id: 'australia', label: 'Australia' },
    '^FTSE': { id: 'united_kingdom', label: 'Reino Unido' },
    '^GDAXI': { id: 'germany', label: 'Alemania' },
    '^FCHI': { id: 'france', label: 'Francia' },
    '^N225': { id: 'japan', label: 'Japón' },
    '^HSI': { id: 'hong_kong', label: 'Hong Kong' },
    '^NSEI': { id: 'india', label: 'India' },
    '^BVSP': { id: 'brazil', label: 'Brasil' },
    '^GSPTSE': { id: 'canada', label: 'Canadá' },
    '^KS11': { id: 'south_korea', label: 'Corea del Sur' },
    '^TWII': { id: 'taiwan', label: 'Taiwán' },
    '^J203.JO': { id: 'south_africa', label: 'Sudáfrica' },
    '^IBEX': { id: 'spain', label: 'España' },
});

const COUNTRY_TERMS = Object.freeze([
    { id: 'mexico', label: 'México', re: /\b(?:m[eé]xico|mexican[oa]s?)\b/i },
    { id: 'united_states', label: 'Estados Unidos', re: /\b(?:estados?\s+unidos|ee\.?\s*uu\.?|american[oa]s?)\b/i },
    { id: 'australia', label: 'Australia', re: /\b(?:australia|australian[oa]s?)\b/i },
    { id: 'united_kingdom', label: 'Reino Unido', re: /\b(?:reino\s+unido|inglaterra|brit[aá]nic[oa]s?)\b/i },
    { id: 'germany', label: 'Alemania', re: /\b(?:alemania|alem[aá]n|german[oa]s?)\b/i },
    { id: 'france', label: 'Francia', re: /\b(?:francia|franc[eé]s|francesa)\b/i },
    { id: 'japan', label: 'Japón', re: /\b(?:jap[oó]n|japon[eé]s)\b/i },
    { id: 'hong_kong', label: 'Hong Kong', re: /\b(?:hong\s+kong)\b/i },
    { id: 'india', label: 'India', re: /\b(?:india|indio|india)\b/i },
    { id: 'brazil', label: 'Brasil', re: /\b(?:brasil|brasile[nñ][oa]s?)\b/i },
    { id: 'canada', label: 'Canadá', re: /\b(?:canad[aá]|canadiens[ea]s?)\b/i },
    { id: 'south_korea', label: 'Corea del Sur', re: /\b(?:corea(?:\s+del\s+sur)?|surcorea)\b/i },
    { id: 'taiwan', label: 'Taiwán', re: /\b(?:taiw[aá]n|taiwan[eé]s)\b/i },
    { id: 'south_africa', label: 'Sudáfrica', re: /\b(?:sud[aá]frica|sudafrican[oa]s?)\b/i },
    { id: 'spain', label: 'España', re: /\b(?:espa[nñ]a|espa[nñ]ol[ae]s?)\b/i },
]);

function wantsStatisticalAnalysis(message) {
    return REQUEST_RE.test(String(message || ''));
}

function requestedRange(message) {
    const text = String(message || '').toLowerCase();
    // Un año calendario pide una ventana cerrada, no "el último año". Así una
    // consulta de 2023 sigue obteniendo enero-diciembre de 2023 aun años después.
    const year = text.match(/\b(?:a[nñ]o(?:\s+de)?|en(?:\s+el)?(?:\s+a[nñ]o)?|durante\s+(?:el\s+)?a[nñ]o)\s+(20\d{2})\b/);
    const requestedYear = Number(year?.[1]);
    if (Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= new Date().getUTCFullYear()) {
        return `year:${requestedYear}`;
    }
    if (/\b(?:5\s*a[nñ]os?|cinco\s*a[nñ]os?)\b/.test(text)) return '5y';
    if (/\b(?:3\s*a[nñ]os?|tres\s*a[nñ]os?)\b/.test(text)) return '3y';
    if (/\b(?:2\s*a[nñ]os?|dos\s*a[nñ]os?)\b/.test(text)) return '2y';
    if (/\b(?:6\s*meses?|seis\s*meses?)\b/.test(text)) return '6mo';
    if (/\b(?:3\s*meses?|tres\s*meses?)\b/.test(text)) return '3mo';
    if (/\b(?:1\s*mes|un\s*mes|30\s*d[ií]as?)\b/.test(text)) return '1mo';
    return '1y';
}

function requestedInstruments(message, { limit = 2 } = {}) {
    const text = String(message || '');
    const matches = INSTRUMENTS.map(instrument => {
        const match = text.match(instrument.re);
        return match ? { instrument, index: match.index ?? 0, length: match[0].length } : null;
    }).filter(Boolean).sort((left, right) => left.index - right.index || right.length - left.length);
    // "Harina de soya" contiene "soya", igual que "Petróleo Brent" puede
    // contener "petróleo". Cuando un nombre específico cubre un alias corto,
    // retenemos sólo el específico y evitamos crear una regresión entre dos
    // contratos por accidente.
    const distinctMatches = matches.filter(candidate => !matches.some(other =>
        other !== candidate
        && other.length > candidate.length
        && other.index <= candidate.index
        && other.index + other.length >= candidate.index + candidate.length
    ));
    const instruments = [...new Map(distinctMatches.map(item => [item.instrument.key, item.instrument])).values()];
    const ticker = explicitTicker(text);
    if (ticker && !instruments.some(instrument => instrument.ticker === ticker)) {
        instruments.push({ key: ticker, ticker, name: ticker, unit: null, dynamic: true });
    }
    return instruments.slice(0, Math.max(1, Math.min(8, limit)));
}

function explicitTicker(message) {
    const text = String(message || '');
    const named = text.match(/\b(?:ticker|s[ií]mbolo|symbol)\s*[:#=]?\s*([A-Z0-9^.-]{1,16}(?:=[A-Z])?)/i)?.[1];
    const formatted = text.match(/\b(?:[A-Z0-9]{1,8}\.(?:AX|L|TO|HK|PA|DE|MI|MC|SW|T|KS|SS|SZ|JO|SA|TA|IS)|[A-Z]{1,8}=(?:F|X)|[A-Z0-9]{2,12}-[A-Z]{3})\b/i)?.[0];
    const ticker = String(named || formatted || '').toUpperCase();
    return /^(?:\^?[A-Z0-9]{1,12}(?:\.[A-Z0-9]{1,5})?|[A-Z0-9]{1,12}=[FX]|[A-Z0-9]{2,12}-[A-Z]{3})$/.test(ticker) ? ticker : null;
}

function unsupportedRegionalSeries(message, instruments) {
    const text = String(message || '');
    const asksAustralia = /\b(?:australia|australian[oa]s?)\b/i.test(text);
    const asksPork = instruments.some(instrument => instrument.key === 'HE=F');
    if (asksAustralia && asksPork) {
        return {
            unavailable: true,
            // No existe aún una serie descargada y normalizada para OLS, pero
            // eso no debe borrar el análisis contextual que Gemini puede
            // investigar en fuentes australianas como APL, ABARES o ABS.
            // La instrucción del sistema prohíbe sustituirla por CME de EE. UU.
            strict: false,
            reason: 'No se generó una regresión OLS porque VALL aún no tiene una serie australiana completa y normalizada de precio de cerdo para 2023. El análisis contextual debe conservar sólo evidencia australiana; el contrato Cerdo Magro CME de Estados Unidos no es un sustituto.',
        };
    }
    const regionalMarket = text.match(/\b(?:m[eé]xico|puebla|canad[aá]|argentina|brasil|chile|colombia|per[uú]|ecuador|uruguay|paraguay|bolivia|guatemala|honduras|el\s+salvador|costa\s+rica|panam[aá]|espa[nñ]a|francia|alemania|italia|reino\s+unido|portugal|jap[oó]n|china|india|corea|sud[aá]frica|nueva\s+zelanda)\b/i)?.[0];
    const asksPhysicalPrice = /\b(?:precio|cotizaci[oó]n|mayoreo|menudeo|rastro|mercado\s+f[ií]sico|productor|acopio|central de abasto|granja|canal)\b/i.test(text);
    const usReference = instruments.find(instrument => ['HE=F', 'LE=F', 'HRC=F'].includes(instrument.key));
    if (regionalMarket && asksPhysicalPrice && usReference) {
        return {
            unavailable: true,
            strict: false,
            reason: `No se generó una regresión OLS porque VALL aún no tiene una serie completa y normalizada del precio físico en ${regionalMarket}. ${usReference.name} es una referencia internacional y no sustituye la cotización local solicitada. Se conserva la investigación contextual con fuentes del país pedido.`,
        };
    }
    return null;
}

function marketCountryConflict(message, instruments) {
    if (!Array.isArray(instruments) || instruments.length !== 1) return null;
    const market = INDEX_MARKETS[instruments[0]?.key];
    if (!market) return null;
    const requestedCountry = COUNTRY_TERMS.find(country => country.re.test(String(message || '')));
    if (!requestedCountry || requestedCountry.id === market.id) return null;
    const alternative = requestedCountry.id === 'spain' ? ' Para España, el índice de referencia es el IBEX 35.' : '';
    return {
        unavailable: true,
        strict: true,
        reason: `La consulta mezcla mercados distintos: ${instruments[0].name} corresponde a ${market.label}, no a ${requestedCountry.label}.${alternative} Confirma si deseas calcular ${instruments[0].name} para ${market.label} o el índice de ${requestedCountry.label}.`,
    };
}

function boundedCacheSet(key, value) {
    if (seriesCache.size >= MAX_SERIES_CACHE) seriesCache.delete(seriesCache.keys().next().value);
    seriesCache.set(key, value);
}

async function yahooSeries(instrument, range, get = externalGet) {
    const cacheKey = `${instrument.ticker}:${range}`;
    const cached = seriesCache.get(cacheKey);
    if (cached && Date.now() - cached.savedAt < SERIES_TTL) return cached.value;

    const year = /^year:(20\d{2})$/.exec(String(range));
    const query = year
        ? `interval=1d&period1=${Date.UTC(Number(year[1]), 0, 1) / 1000}&period2=${Date.UTC(Number(year[1]) + 1, 0, 1) / 1000}`
        : `interval=1d&range=${encodeURIComponent(range)}`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(instrument.ticker)}?${query}`;
    const response = await get(url, {
        Accept: 'application/json',
        'User-Agent': YF_UA,
        'Accept-Language': 'en-US,en;q=0.9',
    }, 9_000);
    if (!response.ok) throw new Error(`Yahoo Finance no disponible (${response.status}).`);
    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const points = timestamps.map((timestamp, index) => ({
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        value: Number(closes[index]),
    // Yahoo puede emitir `0` en jornadas sin mercado para algunos futuros. No es
    // un precio negociado y distorsiona volatilidad, percentiles y regresión.
    })).filter(point => Number.isFinite(point.value) && point.value > 0);
    if (points.length < MIN_OBSERVATIONS) throw new Error('La fuente no devolvió suficientes observaciones para una regresión.');

    const metadata = result?.meta || {};
    const resolvedInstrument = instrument.dynamic ? {
        ...instrument,
        name: metadata.longName || metadata.shortName || instrument.ticker,
        unit: metadata.currency || 'moneda de cotización',
    } : instrument;
    const value = { instrument: resolvedInstrument, range, points, source: 'Yahoo Finance', updatedAt: points.at(-1)?.date || null };
    boundedCacheSet(cacheKey, { savedAt: Date.now(), value });
    return value;
}

function ordinaryLeastSquares(rows) {
    const valid = rows.filter(row => Number.isFinite(row.x) && Number.isFinite(row.y));
    const n = valid.length;
    if (n < MIN_OBSERVATIONS) return null;
    const meanX = valid.reduce((sum, row) => sum + row.x, 0) / n;
    const meanY = valid.reduce((sum, row) => sum + row.y, 0) / n;
    let sxx = 0; let syy = 0; let sxy = 0;
    for (const row of valid) {
        const dx = row.x - meanX;
        const dy = row.y - meanY;
        sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    if (sxx <= Number.EPSILON || syy <= Number.EPSILON) return null;
    const slope = sxy / sxx;
    const intercept = meanY - slope * meanX;
    const fitted = valid.map(row => ({ ...row, fitted: intercept + slope * row.x }));
    const sse = fitted.reduce((sum, row) => sum + (row.y - row.fitted) ** 2, 0);
    const rSquared = Math.max(0, Math.min(1, 1 - sse / syy));
    const residualStdError = Math.sqrt(sse / Math.max(1, n - 2));
    const standardErrorSlope = residualStdError / Math.sqrt(sxx);
    const tStatistic = standardErrorSlope > 0 ? slope / standardErrorSlope : null;
    const correlation = sxy / Math.sqrt(sxx * syy);
    return {
        n, slope, intercept, rSquared, residualStdError, standardErrorSlope, tStatistic,
        correlation, slopeCi95: [slope - 1.96 * standardErrorSlope, slope + 1.96 * standardErrorSlope], fitted,
    };
}

function round(value, digits = 4) {
    return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function numberText(value, digits = 4) {
    return Number.isFinite(value) ? value.toLocaleString('es-MX', { maximumFractionDigits: digits }) : '—';
}

function sampled(points, max = 24) {
    if (points.length <= max) return points;
    const step = (points.length - 1) / (max - 1);
    return Array.from({ length: max }, (_, index) => points[Math.round(index * step)]);
}

function quantile(sorted, percentile) {
    if (!sorted.length) return null;
    const position = (sorted.length - 1) * percentile;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function descriptiveStatistics(values) {
    const clean = values.filter(Number.isFinite);
    if (clean.length < 2) return null;
    const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
    const variance = clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (clean.length - 1);
    const sorted = [...clean].sort((left, right) => left - right);
    const returns = clean.slice(1).map((value, index) => value / clean[index] - 1).filter(Number.isFinite);
    const meanReturn = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : null;
    const returnVariance = returns.length > 1
        ? returns.reduce((sum, value) => sum + (value - meanReturn) ** 2, 0) / (returns.length - 1)
        : null;
    return {
        n: clean.length, mean, standardDeviation: Math.sqrt(variance), min: sorted[0], max: sorted.at(-1),
        median: quantile(sorted, 0.5), p05: quantile(sorted, 0.05), p25: quantile(sorted, 0.25),
        p75: quantile(sorted, 0.75), p95: quantile(sorted, 0.95),
        meanDailyReturn: meanReturn == null ? null : meanReturn * 100,
        annualizedVolatility: returnVariance == null ? null : Math.sqrt(returnVariance) * Math.sqrt(252) * 100,
    };
}

function fitStrength(rSquared) {
    if (rSquared >= 0.7) return 'ajuste alto';
    if (rSquared >= 0.4) return 'ajuste moderado';
    if (rSquared >= 0.15) return 'ajuste bajo';
    return 'ajuste muy bajo';
}

function buildTimeTrend(series) {
    const rows = series.points.map((point, index) => ({ x: index + 1, y: point.value, date: point.date }));
    const regression = ordinaryLeastSquares(rows);
    if (!regression) return null;
    const plotted = sampled(regression.fitted);
    const direction = regression.slope > 0 ? 'ascendente' : regression.slope < 0 ? 'descendente' : 'plana';
    const variable = series.instrument.name;
    const equation = `${variable} = ${numberText(regression.intercept, 6)} ${regression.slope >= 0 ? '+' : '−'} ${numberText(Math.abs(regression.slope), 6)} · t`;
    return {
        kind: 'time_trend', title: `Regresión lineal: tendencia de ${variable}`,
        subtitle: `${series.points.length} cierres diarios · ${series.points[0].date} a ${series.points.at(-1).date}`,
        variable, dependent: variable, independent: 't (sesión de mercado)', unit: series.instrument.unit,
        source: series.source, updatedAt: series.updatedAt, equation, direction, regression,
        statistics: descriptiveStatistics(series.points.map(point => point.value)),
        chart: {
            type: 'line', title: `Tendencia lineal de ${variable}`,
            subtitle: `${series.points.length} observaciones diarias; la visualización muestra una muestra de hasta 24 puntos.`,
            insight: `La pendiente es ${direction} y el modelo tiene ${fitStrength(regression.rSquared)} (R² = ${numberText(regression.rSquared, 3)}).`,
            unit: series.instrument.unit, source: `${series.source} · cálculo OLS de VALL AI`,
            labels: plotted.map(point => point.date),
            datasets: [
                { label: `${variable} observado`, data: plotted.map(point => round(point.y, 6)) },
                { label: 'Ajuste lineal OLS', data: plotted.map(point => round(point.fitted, 6)) },
            ],
        },
    };
}

function alignedRows(dependent, independent) {
    const xByDate = new Map(independent.points.map(point => [point.date, point.value]));
    return dependent.points.map(point => ({ date: point.date, x: xByDate.get(point.date), y: point.value }))
        .filter(row => Number.isFinite(row.x) && Number.isFinite(row.y));
}

function buildPairRegression(dependent, independent) {
    const aligned = alignedRows(dependent, independent);
    const regression = ordinaryLeastSquares(aligned);
    if (!regression) return null;
    const plotted = sampled(regression.fitted);
    const direction = regression.slope > 0 ? 'positiva' : regression.slope < 0 ? 'negativa' : 'nula';
    const equation = `${dependent.instrument.name} = ${numberText(regression.intercept, 6)} ${regression.slope >= 0 ? '+' : '−'} ${numberText(Math.abs(regression.slope), 6)} · ${independent.instrument.name}`;
    return {
        kind: 'pair_regression', title: `Regresión lineal: ${dependent.instrument.name} frente a ${independent.instrument.name}`,
        subtitle: `${regression.n} cierres diarios coincidentes · variable dependiente: ${dependent.instrument.name}`,
        variable: dependent.instrument.name, dependent: dependent.instrument.name, independent: independent.instrument.name,
        unit: dependent.instrument.unit, source: `${dependent.source} · ${independent.source}`,
        updatedAt: [dependent.updatedAt, independent.updatedAt].filter(Boolean).sort().at(-1) || null,
        equation, direction, regression, statistics: descriptiveStatistics(aligned.map(row => row.y)),
        chart: {
            type: 'line', title: `Observado vs. ajuste: ${dependent.instrument.name}`,
            subtitle: `Modelo OLS con ${independent.instrument.name} como variable explicativa; ${regression.n} observaciones alineadas.`,
            insight: `La relación estimada es ${direction}; R² = ${numberText(regression.rSquared, 3)}. No demuestra causalidad.`,
            unit: dependent.instrument.unit, source: `${dependent.source} · cálculo OLS de VALL AI`,
            labels: plotted.map(point => point.date),
            datasets: [
                { label: `${dependent.instrument.name} observado`, data: plotted.map(point => round(point.y, 6)) },
                { label: `Estimado por ${independent.instrument.name}`, data: plotted.map(point => round(point.fitted, 6)) },
            ],
        },
    };
}

function modelBlocks(model) {
    const { regression } = model;
    const statistics = model.statistics;
    const ci = `${numberText(regression.slopeCi95[0], 6)} a ${numberText(regression.slopeCi95[1], 6)}`;
    const interpretation = model.kind === 'time_trend'
        ? `La tendencia estimada es ${model.direction}. R² resume cuánta variación de la serie explica una recta en el tiempo; no es una predicción de precio.`
        : `La asociación lineal estimada es ${model.direction}. La regresión mide co-movimiento estadístico; no prueba que ${model.independent} cause cambios en ${model.dependent}.`;
    return [
        { type: 'heading', level: 2, content: model.title },
        { type: 'table', title: 'Resultados estadísticos (OLS)', headers: ['Métrica', 'Resultado'], rows: [
            ['Modelo', model.kind === 'time_trend' ? 'Tendencia lineal temporal' : 'Regresión lineal simple entre series'],
            ['Observaciones', String(regression.n)],
            ['Ecuación', model.equation],
            ['R²', numberText(regression.rSquared, 4)],
            ['Pendiente', `${numberText(regression.slope, 6)} ${model.unit} por unidad de X`],
            ['IC 95% de pendiente', ci],
            ['Error estándar residual', `${numberText(regression.residualStdError, 6)} ${model.unit}`],
            ['Estadístico t de pendiente', numberText(regression.tStatistic, 3)],
            ['Correlación de Pearson', numberText(regression.correlation, 4)],
        ] },
        ...(statistics ? [{ type: 'table', title: `Estadística descriptiva: ${model.dependent}`, headers: ['Métrica', 'Resultado'], rows: [
            ['Media', `${numberText(statistics.mean, 4)} ${model.unit}`],
            ['Desviación estándar', `${numberText(statistics.standardDeviation, 4)} ${model.unit}`],
            ['Mínimo / máximo', `${numberText(statistics.min, 4)} / ${numberText(statistics.max, 4)} ${model.unit}`],
            ['Mediana', `${numberText(statistics.median, 4)} ${model.unit}`],
            ['Percentil 5 / 95', `${numberText(statistics.p05, 4)} / ${numberText(statistics.p95, 4)} ${model.unit}`],
            ['Volatilidad histórica anualizada', statistics.annualizedVolatility == null ? '—' : `${numberText(statistics.annualizedVolatility, 2)}%`],
            ['Retorno diario promedio', statistics.meanDailyReturn == null ? '—' : `${numberText(statistics.meanDailyReturn, 4)}%`],
        ] }] : []),
        { type: 'formula', content: model.equation, description: `Variable dependiente: ${model.dependent}. Variable independiente: ${model.independent}.` },
        { type: 'chart', spec: model.chart },
        { type: 'alert', severity: 'info', title: 'Lectura estadística', content: interpretation },
        { type: 'alert', severity: 'warning', title: 'Límite del modelo', content: 'Es un ajuste OLS exploratorio sobre cierres históricos. No incorpora estacionalidad, volatilidad, choques externos ni causalidad; no debe usarse como recomendación de inversión ni como pronóstico.' },
    ];
}

function modelMarkdown(model) {
    const { regression } = model;
    const statistics = model.statistics;
    const ci = `${numberText(regression.slopeCi95[0], 6)} a ${numberText(regression.slopeCi95[1], 6)}`;
    return [
        `## ${model.title}`,
        model.subtitle,
        '',
        '| Métrica | Resultado |',
        '| --- | --- |',
        `| Modelo | ${model.kind === 'time_trend' ? 'Tendencia lineal temporal' : 'Regresión lineal simple entre series'} |`,
        `| Observaciones | ${regression.n} |`,
        `| Ecuación | ${model.equation} |`,
        `| R² | ${numberText(regression.rSquared, 4)} |`,
        `| Pendiente | ${numberText(regression.slope, 6)} ${model.unit} por unidad de X |`,
        `| IC 95% de pendiente | ${ci} |`,
        `| Error estándar residual | ${numberText(regression.residualStdError, 6)} ${model.unit} |`,
        `| Estadístico t | ${numberText(regression.tStatistic, 3)} |`,
        `| Correlación de Pearson | ${numberText(regression.correlation, 4)} |`,
        '',
        ...(statistics ? [
            `### Estadística descriptiva: ${model.dependent}`,
            '',
            '| Métrica | Resultado |',
            '| --- | --- |',
            `| Media | ${numberText(statistics.mean, 4)} ${model.unit} |`,
            `| Desviación estándar | ${numberText(statistics.standardDeviation, 4)} ${model.unit} |`,
            `| Mínimo / máximo | ${numberText(statistics.min, 4)} / ${numberText(statistics.max, 4)} ${model.unit} |`,
            `| Mediana | ${numberText(statistics.median, 4)} ${model.unit} |`,
            `| Percentil 5 / 95 | ${numberText(statistics.p05, 4)} / ${numberText(statistics.p95, 4)} ${model.unit} |`,
            `| Volatilidad histórica anualizada | ${statistics.annualizedVolatility == null ? '—' : `${numberText(statistics.annualizedVolatility, 2)}%`} |`,
            `| Retorno diario promedio | ${statistics.meanDailyReturn == null ? '—' : `${numberText(statistics.meanDailyReturn, 4)}%`} |`,
            '',
        ] : []),
        `$$\n${model.equation}\n$$`,
        '',
        '```chart', JSON.stringify(model.chart), '```',
        '',
        `> **Límite del modelo:** Es un ajuste OLS exploratorio sobre cierres históricos. No demuestra causalidad ni es un pronóstico o recomendación de inversión.`,
    ].join('\n');
}

function evidenceFor(model) {
    const statistics = model.statistics;
    return {
        context: `[MODELO ESTADÍSTICO DETERMINISTA — OLS]\n${model.title}.\nMuestra: ${model.regression.n} observaciones.\nEcuación: ${model.equation}.\nR²: ${round(model.regression.rSquared, 6)}. Pendiente: ${round(model.regression.slope, 8)}. Error estándar residual: ${round(model.regression.residualStdError, 8)}.${statistics ? `\nMedia: ${round(statistics.mean, 6)}; desviación estándar: ${round(statistics.standardDeviation, 6)}; percentil 5: ${round(statistics.p05, 6)}; percentil 95: ${round(statistics.p95, 6)}; volatilidad anualizada: ${round(statistics.annualizedVolatility, 4)}%.` : ''}\nLa interpretación debe respetar estos coeficientes; no inventes otros ni lo presentes como causalidad o pronóstico.`,
        citations: [{
            id: 'S1', title: model.title, source: model.source, date: model.updatedAt,
            type: 'linear_regression_ols', method: 'OLS sobre cierres diarios históricos',
        }],
        sourceCodes: ['yahoo_finance_ols'],
    };
}

async function buildStatisticalModel(message, { get = externalGet } = {}) {
    if (!wantsStatisticalAnalysis(message)) return null;
    const instruments = requestedInstruments(message);
    if (!instruments.length) {
        return {
            unavailable: true,
            reason: 'Para calcular una regresión verificable necesito un activo o par concreto, por ejemplo USD/MXN, IPC, S&P 500, Bitcoin, maíz, trigo, petróleo, oro o una acción cubierta.',
        };
    }
    const countryConflict = marketCountryConflict(message, instruments);
    if (countryConflict) return countryConflict;
    const regionalRestriction = unsupportedRegionalSeries(message, instruments);
    if (regionalRestriction) return regionalRestriction;
    try {
        const range = requestedRange(message);
        const series = await Promise.all(instruments.map(instrument => yahooSeries(instrument, range, get)));
        const model = series.length >= 2 ? buildPairRegression(series[0], series[1]) : buildTimeTrend(series[0]);
        if (!model) return { unavailable: true, reason: 'No hay suficientes variaciones en la serie para estimar una regresión lineal fiable.' };
        return { ...model, blocks: modelBlocks(model), markdown: modelMarkdown(model), evidence: evidenceFor(model) };
    } catch (error) {
        console.warn('[statistics] No se pudo calcular la regresión:', error.message);
        return { unavailable: true, reason: 'No fue posible obtener una serie histórica verificable para calcular la regresión en este momento.' };
    }
}

function mergeStatisticalEvidence(evidence, model) {
    if (!model?.evidence) return evidence;
    return {
        ...evidence,
        context: [model.evidence.context, evidence.context].filter(Boolean).join('\n\n'),
        citations: [...model.evidence.citations, ...(evidence.citations || [])],
        sourceCodes: [...new Set([...(model.evidence.sourceCodes || []), ...(evidence.sourceCodes || [])])],
        evidenceCount: (evidence.evidenceCount || 0) + 1,
        retrievalStrategy: `${evidence.retrievalStrategy || 'rag'}+linear_regression_ols_v1`,
    };
}

function attachStatisticalModel(response, model) {
    if (!response || !model) return response;
    if (model.unavailable) {
        const content = model.reason || 'No se pudo construir un modelo estadístico verificable para esta consulta.';
        const alert = {
            type: 'alert',
            severity: 'warning',
            title: model.strict ? 'Consulta por confirmar' : 'Modelo estadístico no generado',
            content,
        };
        response.blocks = model.strict ? [alert] : [alert, ...(response.blocks || [])];
        response.markdown = model.strict
            ? `> **Modelo estadístico no generado:** ${content}`
            : [`> **Modelo estadístico no generado:** ${content}`, response.markdown].filter(Boolean).join('\n\n');
        if (model.strict) {
            // El alert ya expresa la corrección. Dejarlo también como resumen
            // produciría la misma advertencia dos veces en la interfaz rica.
            response.title = 'Consulta por confirmar';
            response.summary = '';
        }
        response.meta = response.meta || {};
        response.meta.statisticalModel = { available: false, strict: model.strict === true };
        return response;
    }
    if (!model.blocks) return response;
    response.blocks = [...model.blocks, ...(response.blocks || [])];
    response.markdown = [model.markdown, response.markdown].filter(Boolean).join('\n\n');
    response.meta = response.meta || {};
    response.meta.statisticalModel = {
        available: true, kind: model.kind, observations: model.regression.n, rSquared: round(model.regression.rSquared, 6),
        source: model.source, updatedAt: model.updatedAt,
        annualizedVolatility: round(model.statistics?.annualizedVolatility, 4),
    };
    return response;
}

// No interviene un modelo generativo: es el respaldo para una conexión SSE
// interrumpida, de modo que el chat no conserve texto genérico sin sus cálculos.
function statisticalResponse(model) {
    const result = model || {
        unavailable: true,
        reason: 'No se pudo construir un modelo estadístico verificable para esta consulta.',
    };
    const response = {
        type: 'rich_response',
        version: '1.0',
        title: result.unavailable ? 'Análisis estadístico' : result.title,
        summary: result.unavailable
            ? result.reason
            : `Modelo OLS calculado con ${result.regression.n} observaciones históricas verificables.`,
        mode: 'technical',
        blocks: [],
        markdown: '',
        meta: { provider: 'vall-statistics', calculation: 'ols-v1' },
    };
    attachStatisticalModel(response, result);
    if (result.evidence?.citations) response.meta.citations = result.evidence.citations;
    return response;
}

module.exports = {
    INSTRUMENTS, INDEX_MARKETS, wantsStatisticalAnalysis, requestedRange, requestedInstruments, explicitTicker, ordinaryLeastSquares, marketCountryConflict,
    buildStatisticalModel, mergeStatisticalEvidence, attachStatisticalModel, statisticalResponse,
};
