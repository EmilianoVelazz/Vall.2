(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    const state = {
        module: 'bolsa',
        period: '1mo',
        indicator: '^GSPC',
        compare: '',
        chartMode: 'area',
        mainChart: null,
        breakdownChart: null,
        contextChart: null,
        supplementChart: null,
        returnsChart: null,
        returnsHistoryChart: null,
        returnsCurve: 'us',
        returnsMode: 'level',
        returnsHistoryYears: 3,
        returnsHistoryCountry: 'us',
        returnsHistorySeries: '',
        returnsHistoryRequest: 0,
        returnsGlobalChart: null,
        returnsGlobalMode: 'sovereign',
        returnsGlobalData: [],
        returnsGlobalPromise: null,
        returnsReferenceCountry: 'DE',
        returnsTableSort: 'maturity',
        miniCharts: {},
        bondData: [],
        mxRates: null,
        bmvData: [],
        bmvTimestamp: null,
        quotes: {},
        quotesLoading: true,
        inflation: null,
        marketSeries: new Map(),
        detailRows: [],
        sort: { key: 'change', direction: -1 },
        breakdownDescending: true,
        news: [],
        newsIsDemo: false,
        newsFilter: 'all',
        newsArchiveQuery: '',
        newsArchiveSort: 'recent',
        newsArchiveLimit: 8,
        newsMeta: { generado: '', fuente: '', stale: false },
        newsOffset: 0,
        exchangeRanges: {},              // símbolo -> clave de periodo elegida en su tarjeta
        exchangeRangeLoading: new Set(), // peticiones en vuelo, para no duplicarlas
        supplementMarket: 'mx',          // bolsa elegida en "Lectura verificable de Bolsa"
    };

    /* Periodos por tarjeta de bolsa. Mismo criterio que el laboratorio de gráficas
       (IV_PARAMS en finanzas.html): '15m' y '1h' no son rangos nativos de Yahoo
       —range es la ventana total, no la granularidad— así que se piden velas de
       1 minuto del último día y se recortan en el cliente. */
    const EXCHANGE_RANGES = {
        '15m': { label: '15 minutos', interval: '1m',  range: '1d',  trim: 15 },
        '1h':  { label: '1 hora',     interval: '1m',  range: '1d',  trim: 60 },
        '1y':  { label: '1 año',      interval: '1d',  range: '1y'  },
        '3y':  { label: '3 años',     interval: '1wk', range: '3y'  },
        '5y':  { label: '5 años',     interval: '1wk', range: '5y'  },
        '10y': { label: '10 años',    interval: '1mo', range: '10y' },
    };
    const EXCHANGE_RANGE_DEFAULT = '1y';

    /* Bolsas consultables en el panel "Lectura verificable de Bolsa".
       México sale de /api/bmv-market (lista completa, una sola petición). El resto
       no tiene endpoint de constituyentes, así que se piden sus emisoras una a una
       a /api/stock-history y se cachean: ~7-10 peticiones la primera vez que se
       elige esa bolsa, ninguna después. Por eso las listas son cortas y de
       emisoras representativas, no índices completos. */
    const SUPPLEMENT_MARKETS = {
        mx: { label: 'México', market: 'Bolsa Mexicana', currency: 'MXN', native: true },
        us: { label: 'Estados Unidos', market: 'NYSE / Nasdaq', currency: 'USD', tickers: [
            ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'NVIDIA'], ['AMZN', 'Amazon'],
            ['GOOGL', 'Alphabet'], ['META', 'Meta'], ['TSLA', 'Tesla'], ['JPM', 'JPMorgan'],
            ['V', 'Visa'], ['WMT', 'Walmart'] ] },
        gb: { label: 'Reino Unido', market: 'London Stock Exchange', currency: 'GBp', tickers: [
            ['SHEL.L', 'Shell'], ['AZN.L', 'AstraZeneca'], ['HSBA.L', 'HSBC'], ['ULVR.L', 'Unilever'],
            ['BP.L', 'BP'], ['GSK.L', 'GSK'], ['RIO.L', 'Rio Tinto'] ] },
        de: { label: 'Alemania', market: 'XETRA · Frankfurt', currency: 'EUR', tickers: [
            ['SAP.DE', 'SAP'], ['SIE.DE', 'Siemens'], ['BMW.DE', 'BMW'], ['VOW3.DE', 'Volkswagen'],
            ['BAYN.DE', 'Bayer'], ['ADS.DE', 'Adidas'], ['DHER.DE', 'Delivery Hero'] ] },
        fr: { label: 'Francia', market: 'Euronext París', currency: 'EUR', tickers: [
            ['MC.PA', 'LVMH'], ['OR.PA', "L'Oréal"], ['TTE.PA', 'TotalEnergies'], ['AIR.PA', 'Airbus'],
            ['BNP.PA', 'BNP Paribas'], ['SAN.PA', 'Sanofi'] ] },
        jp: { label: 'Japón', market: 'Tokyo Stock Exchange', currency: 'JPY', tickers: [
            ['7203.T', 'Toyota'], ['6758.T', 'Sony'], ['9984.T', 'SoftBank'], ['6501.T', 'Hitachi'],
            ['7974.T', 'Nintendo'], ['9432.T', 'NTT'] ] },
        br: { label: 'Brasil', market: 'B3 · São Paulo', currency: 'BRL', tickers: [
            ['PETR4.SA', 'Petrobras'], ['VALE3.SA', 'Vale'], ['ITUB4.SA', 'Itaú Unibanco'],
            ['BBDC4.SA', 'Bradesco'], ['ABEV3.SA', 'Ambev'] ] },
    };

    /* Cotización con variación DIARIA real (último cierre frente al anterior).
       No se reutiliza fetchQuote() porque aquélla compara la última vela de 15
       minutos con la previa, que no es la variación de la sesión. */
    async function fetchDailyQuote(symbol, label) {
        const cacheKey = `day:${symbol}`;
        if (state.marketSeries.has(cacheKey)) return state.marketSeries.get(cacheKey);
        const data = await fetchJson(`/api/stock-history?ticker=${encodeURIComponent(symbol)}&range=5d&interval=1d`);
        const candles = Array.isArray(data?.candles) ? data.candles.filter(item => Number.isFinite(+item.close)) : [];
        if (!candles.length) throw new Error('Serie vacía');
        const last = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        const quote = {
            symbol,
            name: label || data?.meta?.longName || symbol,
            price: +last.close,
            changePct: prev && +prev.close ? (+last.close / +prev.close - 1) * 100 : null,
        };
        state.marketSeries.set(cacheKey, quote);
        return quote;
    }

    /* Devuelve las emisoras de la bolsa elegida, normalizadas. */
    async function loadSupplementMarket(key) {
        const cfg = SUPPLEMENT_MARKETS[key] || SUPPLEMENT_MARKETS.mx;
        if (cfg.native) {
            return state.bmvData
                .filter(item => item.type === 'stock' && isNumeric(item.change_pct))
                .map(item => ({ symbol: item.symbol, name: item.name || item.symbol, price: +item.price, changePct: +item.change_pct }));
        }
        const results = await Promise.allSettled(cfg.tickers.map(([t, n]) => fetchDailyQuote(t, n)));
        return results
            .filter(r => r.status === 'fulfilled' && isNumeric(r.value.changePct))
            .map(r => r.value);
    }

    const moduleConfig = {
        bolsa: {
            kicker: 'Bolsa · Evolución histórica',
            title: 'S&P 500',
            description: 'Comportamiento del índice y comparación contra referencias relevantes.',
            indicators: [
                ['^GSPC', 'S&P 500'], ['^NDX', 'Nasdaq 100'], ['^MXX', 'IPC BMV'], ['^VIX', 'VIX']
            ],
            insights: [
                ['Amplitud antes que euforia', 'Un avance respaldado por más índices y sectores suele ser más sólido que un movimiento concentrado.', 'positive'],
                ['Vigila la volatilidad', 'El VIX aporta contexto sobre el costo de protección y el apetito por riesgo.', 'warning'],
                ['Compara horizontes', 'La lectura diaria puede diferir de la tendencia mensual o anual.', '']
            ]
        },
        tasas: {
            kicker: 'Tasas · Política monetaria',
            title: 'Tasas de referencia',
            description: 'Compara tasas interbancarias, referencias monetarias y rendimientos soberanos sin mezclar sus definiciones.',
            indicators: [['mx', 'México · TIIE 28D'], ['us', 'Estados Unidos · Treasury 3M'], ['eu', 'Zona Euro · soberana 10Y'], ['gb', 'Reino Unido · tasa base'], ['jp', 'Japón · tasa objetivo'], ['cn', 'China · LPR 1Y'], ['br', 'Brasil · SELIC'], ['ca', 'Canadá · tasa objetivo']],
            insights: [
                ['Qué estás observando', 'Las tasas de referencia influyen en crédito, ahorro, divisas y valuaciones.', ''],
                ['Tasa real', 'Restar inflación a la tasa nominal ayuda a estimar qué tan restrictiva es la política.', 'positive'],
                ['Próximo catalizador', 'Comunicados, inflación y empleo pueden cambiar la trayectoria esperada.', 'warning']
            ]
        },
        bonos: {
            kicker: 'Bonos · Comparador soberano',
            title: 'Bonos soberanos',
            description: 'Rendimiento, vencimiento y movimiento reciente de instrumentos de deuda.',
            indicators: [['us10y', 'Treasury 10Y'], ['us5y', 'Treasury 5Y'], ['us30y', 'Treasury 30Y'], ['mx', 'México · TIIE 28D']],
            insights: [
                ['Precio y tasa se mueven al revés', 'Cuando sube el rendimiento exigido por el mercado, el precio de un bono existente suele bajar.', 'warning'],
                ['Duración', 'Los bonos de mayor plazo suelen reaccionar más a cambios en tasas.', ''],
                ['Riesgo relativo', 'Compara moneda, emisor, liquidez y vencimiento; no solo el rendimiento.', 'positive']
            ]
        },
        rendimientos: {
            kicker: 'Rendimientos · Curva y diferenciales',
            title: 'Curva del Tesoro',
            description: 'Estructura por plazo, lectura anterior y primas relativas.',
            indicators: [['curve', 'Curva de rendimientos'], ['spread', 'Pendiente 30Y–5Y'], ['carry', 'Diferencial México–EE.UU.'], ['real', 'Rendimiento real México']],
            insights: [
                ['Forma de la curva', 'Una curva ascendente suele compensar el plazo; una inversión puede reflejar expectativa de desaceleración.', ''],
                ['Rendimiento real', 'Descontar inflación permite comparar mejor el poder adquisitivo esperado.', 'positive'],
                ['No es una predicción', 'La curva resume expectativas y primas de riesgo, pero puede cambiar con cada dato macroeconómico.', 'warning']
            ]
        }
    };

    const colors = { blue: '#246bfe', cyan: '#40a6c7', navy: '#0c2d44', gold: '#c99745', green: '#16825d', red: '#c94a56', grid: 'rgba(16,32,46,.08)' };

    /* Paleta propia de las minigráficas de bolsas: vino y azul en lugar de rojo y
       verde. Deliberadamente separada de `colors`, que alimenta ~15 gráficas más
       de la página (barras, curvas, otros sparklines) y debe seguir igual. */
    const EXCHANGE_CHART_COLORS = { up: '#1d63b8', down: '#9b2a45' };

    function hexToRgba(hex, alpha) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!m) return hex;
        return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
    }
    const exchangeConfig = [
        { slug: 'sp500', symbol: '^GSPC', name: 'S&P 500', region: 'Estados Unidos', market: 'NYSE / Nasdaq' },
        { slug: 'nasdaq', symbol: '^NDX', name: 'Nasdaq 100', region: 'Estados Unidos', market: 'Tecnolog\u00eda' },
        { slug: 'ftse', symbol: '^FTSE', name: 'FTSE 100', region: 'Reino Unido', market: 'London Stock Exchange' },
        { slug: 'dax', symbol: '^GDAXI', name: 'DAX 40', region: 'Alemania', market: 'Frankfurt' },
        { slug: 'nikkei', symbol: '^N225', name: 'Nikkei 225', region: 'Jap\u00f3n', market: 'Tokyo Stock Exchange' },
        { slug: 'hangseng', symbol: '^HSI', name: 'Hang Seng', region: 'Hong Kong', market: 'HKEX' },
        { slug: 'bovespa', symbol: '^BVSP', name: 'Ibovespa', region: 'Brasil', market: 'B3' },
    ];
    const isNumeric = value => value !== null && value !== '' && Number.isFinite(Number(value));
    const formatNumber = (value, digits = 2) => isNumeric(value) ? (+value).toLocaleString('es-MX', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
    const formatPercent = (value, digits = 2) => isNumeric(value) ? `${+value >= 0 ? '+' : ''}${(+value).toFixed(digits)}%` : '—';
    const formatYield = value => isNumeric(value) ? `${(+value).toFixed(2)}%` : '—';
    const candleDate = value => new Date(typeof value === 'number' && value < 100000000000 ? value * 1000 : value);
    const safeDate = value => {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? 'Reciente' : d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    };

    function getReferenceRateItems() {
        const typeByKey = {
            us: 'Mercado monetario · proxy',
            eu: 'Soberana 10Y',
            mx: 'Interbancaria',
            jp: 'Política monetaria',
            gb: 'Política monetaria',
            cn: 'Referencia crediticia',
            br: 'Política monetaria',
            ca: 'Política monetaria',
        };
        const labelByKey = {
            us: 'Treasury 3M',
            eu: 'Zona Euro 10Y',
            mx: 'TIIE 28D',
            jp: 'Tasa objetivo',
            gb: 'Tasa base',
            cn: 'LPR 1 año',
            br: 'SELIC',
            ca: 'Tasa objetivo',
        };
        return state.bondData.map(entry => {
            const rate = entry.key === 'us'
                ? entry.bonds?.find(item => item.maturity === '3M')
                : entry.bonds?.[0];
            if (!rate || !isNumeric(rate.yield)) return null;
            return {
                key: entry.key,
                country: entry.country,
                label: labelByKey[entry.key] || rate.label || 'Referencia',
                yield: +rate.yield,
                prev: isNumeric(rate.prev) ? +rate.prev : null,
                source: entry.source || 'Fuente financiera',
                type: typeByKey[entry.key] || 'Referencia',
            };
        }).filter(Boolean);
    }

    function getMxRateItems() {
        const result = [];
        const add = (group, items, valueKey, type) => {
            (Array.isArray(items) ? items : []).forEach(item => {
                const value = item?.[valueKey];
                if (!isNumeric(value) || +value < 0 || +value > 30) return;
                result.push({
                    group,
                    label: item.label || '—',
                    maturity: item.maturity || item.label || '—',
                    yield: +value,
                    prev: isNumeric(item.prev) ? +item.prev : null,
                    type,
                });
            });
        };
        add('CETES', state.mxRates?.cetes, 'yield', 'Nominal');
        add('UDIBONOS', state.mxRates?.udibonos, 'realYield', 'Real');
        return result;
    }

    function getBondInstrumentItems() {
        const excluded = /TIIE|Tasa objetivo|Tasa base|LPR|SELIC/i;
        const sovereign = state.bondData.flatMap(entry => (entry.bonds || [])
            .filter(item => isNumeric(item.yield) && !excluded.test(item.label || ''))
            .map(item => ({
                group: entry.country,
                label: `${entry.country} · ${item.label}`,
                maturity: item.maturity || item.label,
                yield: +item.yield,
                prev: isNumeric(item.prev) ? +item.prev : null,
                type: 'Soberano nominal',
                source: entry.source || 'Fuente soberana',
            })));
        const mexico = getMxRateItems().map(item => ({
            ...item,
            label: `${item.group} · ${item.label}`,
            source: state.mxRates?.source === 'banxico' ? 'Banxico' : 'Fuente México',
        }));
        return [...sovereign, ...mexico];
    }

    function bond(key, maturity) {
        const country = state.bondData.find(item => item.key === key);
        return country?.bonds?.find(item => item.maturity === maturity || item.label === maturity) || null;
    }

    function returnsMaturityYears(value) {
        const label = String(value || '').trim().toUpperCase();
        const amount = Number.parseFloat(label.replace(',', '.'));
        if (!Number.isFinite(amount)) return null;
        if (/D|DÍA/.test(label)) return amount / 365;
        if (/M|MES/.test(label) && !/AÑO/.test(label)) return amount / 12;
        if (/Y|A|AÑO/.test(label)) return amount;
        return amount;
    }

    function getReturnsCurves() {
        const usEntry = state.bondData.find(item => item.key === 'us');
        const normalize = (items, config) => (Array.isArray(items) ? items : []).map(item => {
            const candidates = [item.maturity, item.label].filter(Boolean);
            const maturityLabel = candidates.find(candidate => Number.isFinite(returnsMaturityYears(candidate)));
            const label = maturityLabel || item.label || item.maturity || '—';
            const value = item[config.valueKey];
            return {
                label,
                x: returnsMaturityYears(maturityLabel),
                y: isNumeric(value) ? +value : null,
                prev: isNumeric(item.prev) ? +item.prev : null,
            };
        }).filter(item => Number.isFinite(item.x) && Number.isFinite(item.y)).sort((a, b) => a.x - b.x);
        return {
            us: {
                key: 'us',
                title: 'Treasury nominal de EE. UU.',
                short: 'Treasury',
                nature: 'Nominal',
                source: usEntry?.source || 'US Treasury · fuente conectada',
                points: normalize(usEntry?.bonds, { valueKey: 'yield' }),
            },
            cetes: {
                key: 'cetes',
                title: 'CETES nominal de México',
                short: 'CETES',
                nature: 'Nominal',
                source: state.mxRates?.source === 'banxico' ? 'Banxico SIE' : 'Fuente México conectada',
                points: normalize(state.mxRates?.cetes, { valueKey: 'yield' }),
            },
            udibonos: {
                key: 'udibonos',
                title: 'UDIBONOS reales de México',
                short: 'UDIBONOS',
                nature: 'Real',
                source: state.mxRates?.source === 'banxico' ? 'Banxico SIE' : 'Fuente México conectada',
                points: normalize(state.mxRates?.udibonos, { valueKey: 'realYield' }),
            },
        };
    }

    const RETURNS_HISTORY_SERIES = {
        us: [
            { id: '^IRX', label: 'Treasury 3 meses', source: 'US Treasury · Yahoo Finance' },
            { id: '^FVX', label: 'Treasury 5 años', source: 'US Treasury · Yahoo Finance' },
            { id: '^TNX', label: 'Treasury 10 años', source: 'US Treasury · Yahoo Finance', preferred: true },
            { id: '^TYX', label: 'Treasury 30 años', source: 'US Treasury · Yahoo Finance' },
        ],
        cetes: [
            { id: 'SF43936', label: 'CETES 28 días', source: 'Banxico SIE' },
            { id: 'SF43939', label: 'CETES 91 días', source: 'Banxico SIE' },
            { id: 'SF43942', label: 'CETES 182 días', source: 'Banxico SIE' },
            { id: 'SF43945', label: 'CETES 364 días', source: 'Banxico SIE', preferred: true },
        ],
        udibonos: [],
    };

    const RETURNS_GLOBAL_SOVEREIGNS = [
        ['DE','Alemania','🇩🇪'], ['FR','Francia','🇫🇷'], ['IT','Italia','🇮🇹'], ['ES','España','🇪🇸'],
        ['NL','Países Bajos','🇳🇱'], ['BE','Bélgica','🇧🇪'], ['AT','Austria','🇦🇹'], ['PT','Portugal','🇵🇹'],
        ['IE','Irlanda','🇮🇪'], ['GR','Grecia','🇬🇷'], ['FI','Finlandia','🇫🇮'], ['HR','Croacia','🇭🇷'],
    ].map(([area, country, flag]) => ({ area, country, flag, region: 'Europa' }));

    const RETURNS_HISTORY_COUNTRIES = {
        us: { label: 'Estados Unidos', flag: '🇺🇸', region: 'América', kind: 'yahoo', series: RETURNS_HISTORY_SERIES.us },
        mx: { label: 'México', flag: '🇲🇽', region: 'América', kind: 'banxico', series: RETURNS_HISTORY_SERIES.cetes },
        ...Object.fromEntries(RETURNS_GLOBAL_SOVEREIGNS.map(market => [market.area.toLowerCase(), {
            label: market.country,
            flag: market.flag,
            region: market.region,
            kind: 'ecb',
            series: [{ id: market.area, label: 'Soberano 10 años', source: 'Banco Central Europeo', preferred: true }],
        }])),
    };

    function syncReturnsHistoryCountryOptions() {
        const select = $('returns-history-country');
        if (!select) return;
        const fragment = document.createDocumentFragment();
        ['América', 'Europa'].forEach(region => {
            const group = document.createElement('optgroup'); group.label = region;
            Object.entries(RETURNS_HISTORY_COUNTRIES).filter(([, config]) => config.region === region).forEach(([key, config]) => {
                group.append(new Option(`${config.flag} ${config.label}`, key));
            });
            fragment.append(group);
        });
        select.replaceChildren(fragment);
        if (!RETURNS_HISTORY_COUNTRIES[state.returnsHistoryCountry]) state.returnsHistoryCountry = 'us';
        select.value = state.returnsHistoryCountry;
    }

    function setReturnsGlobalState(message, loading = false) {
        const host = $('returns-global-state');
        if (!host) return;
        host.classList.toggle('is-hidden', !message);
        host.classList.toggle('is-loading', loading);
        const copy = host.querySelector('p'); if (copy) copy.textContent = message || '';
    }

    function syncReturnsReferenceOptions() {
        const select = $('returns-reference-country');
        if (!select) return;
        const references = state.returnsGlobalData.filter(item => item.key !== 'US');
        if (!references.length) {
            select.replaceChildren(new Option('Cargando países…', ''));
            select.disabled = true;
            return;
        }
        const fragment = document.createDocumentFragment();
        fragment.append(new Option('Sin referencia internacional', ''));
        references.forEach(item => fragment.append(new Option(`${item.flag} ${item.country} · 10A`, item.key)));
        select.replaceChildren(fragment);
        if (state.returnsReferenceCountry && !references.some(item => item.key === state.returnsReferenceCountry)) {
            state.returnsReferenceCountry = references.find(item => item.key === 'DE')?.key || references[0]?.key || '';
        }
        select.value = state.returnsReferenceCountry;
        select.disabled = !references.length;
    }

    function getReturnsReference() {
        return state.returnsGlobalData.find(item => item.key === state.returnsReferenceCountry) || null;
    }

    async function loadReturnsGlobalData() {
        if (state.returnsGlobalData.length) { renderReturnsGlobal(); return; }
        if (state.returnsGlobalPromise) return state.returnsGlobalPromise;
        setReturnsGlobalState('Conectando mercados soberanos…', true);
        state.returnsGlobalPromise = (async () => {
            const us10 = bond('us', '10Y');
            const base = isNumeric(us10?.yield) ? [{
                key: 'US', country: 'Estados Unidos', flag: '🇺🇸', region: 'América',
                label: 'Treasury 10A', value: +us10.yield, prev: isNumeric(us10.prev) ? +us10.prev : null, source: 'US Treasury',
            }] : [];
            const results = await Promise.allSettled(RETURNS_GLOBAL_SOVEREIGNS.map(async market => {
                const data = await fetchJson(`/api/ecb/${market.area}/history?years=1`, 22000);
                const points = Array.isArray(data?.points) ? data.points.filter(point => isNumeric(point.value)) : [];
                if (!points.length) throw new Error('Sin observaciones');
                const last = points.at(-1), previous = points.length > 1 ? points.at(-2) : null;
                return { key: market.area, country: market.country, flag: market.flag, region: market.region, label: 'Soberano 10A', value: +last.value, prev: previous ? +previous.value : null, source: 'Banco Central Europeo' };
            }));
            state.returnsGlobalData = [...base, ...results.filter(result => result.status === 'fulfilled').map(result => result.value)];
            state.returnsGlobalPromise = null;
            syncReturnsReferenceOptions();
            renderReturnsGlobal();
            const activeCurve = getReturnsCurves()[state.returnsCurve];
            if (activeCurve) renderReturnsChart(activeCurve);
            if (state.returnsGlobalData.length) setReturnsGlobalState('', false);
            else setReturnsGlobalState('No fue posible obtener referencias soberanas internacionales.', false);
        })().catch(() => {
            state.returnsGlobalPromise = null;
            setReturnsGlobalState('No fue posible obtener referencias soberanas internacionales.', false);
        });
        return state.returnsGlobalPromise;
    }

    function getReturnsGlobalAnchors() {
        const region = { us: 'América', mx: 'América', br: 'América', ca: 'América', gb: 'Europa', jp: 'Asia', cn: 'Asia' };
        const type = {
            us: 'Treasury 3M · proxy monetario', mx: 'TIIE 28D · interbancaria', br: 'SELIC · política', ca: 'Objetivo · política',
            gb: 'Tasa base · política', jp: 'Objetivo · política', cn: 'LPR 1A · crédito',
        };
        return state.bondData.filter(entry => region[entry.key]).map(entry => {
            const item = entry.key === 'us' ? entry.bonds?.find(rate => rate.maturity === '3M') : entry.bonds?.[0];
            if (!item || !isNumeric(item.yield)) return null;
            return {
                key: entry.key.toUpperCase(), country: entry.country, flag: entry.flag || '•', region: region[entry.key],
                label: type[entry.key], value: +item.yield, prev: isNumeric(item.prev) ? +item.prev : null, source: entry.source,
            };
        }).filter(Boolean);
    }

    function renderReturnsGlobalChart(items) {
        const canvas = $('returns-global-chart');
        if (!canvas || typeof Chart === 'undefined') return;
        if (state.returnsGlobalChart) { state.returnsGlobalChart.destroy(); state.returnsGlobalChart = null; }
        if (!items.length) return;
        const ordered = [...items].sort((a, b) => a.value - b.value);
        const tones = { 'América': '#9b2945', 'Europa': '#bd8b3d', 'Asia': '#6f8979' };
        state.returnsGlobalChart = new Chart(canvas, {
            type: 'bar',
            data: { labels: ordered.map(item => item.country), datasets: [{
                data: ordered.map(item => item.value), backgroundColor: ordered.map(item => `${tones[item.region] || '#898781'}d9`),
                borderColor: ordered.map(item => tones[item.region] || '#898781'), borderWidth: 1, borderRadius: 6, borderSkipped: false, barThickness: items.length > 10 ? 12 : 18,
            }] },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                animation: { duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 760, easing: 'easeOutQuart' },
                plugins: { legend: { display: false }, tooltip: {
                    backgroundColor: '#071722', padding: 10, displayColors: false,
                    callbacks: { label: context => `${context.parsed.x.toFixed(2)}% anual` },
                } },
                scales: {
                    x: { grid: { color: 'rgba(23,39,55,.08)' }, border: { display: false }, ticks: { color: '#657787', callback: value => `${value}%`, font: { family: 'JetBrains Mono', size: 9 } } },
                    y: { grid: { display: false }, border: { display: false }, ticks: { color: '#304759', font: { family: 'Inter', size: 9, weight: '700' } } },
                },
            },
        });
    }

    function renderReturnsCountryGrid(items) {
        const host = $('returns-country-grid');
        if (!host) return;
        host.replaceChildren();
        items.forEach((item, index) => {
            const change = Number.isFinite(item.prev) ? (item.value - item.prev) * 100 : null;
            const card = document.createElement('article'); card.className = 'returns-country-card'; card.style.setProperty('--delay', `${Math.min(index, 12) * .035}s`);
            const flag = document.createElement('i'); flag.textContent = item.flag;
            const copy = document.createElement('div'); const country = document.createElement('span'); country.textContent = item.country; const label = document.createElement('small'); label.textContent = item.label; copy.append(country, label);
            const value = document.createElement('strong'); value.append(document.createTextNode(`${item.value.toFixed(2)}%`));
            const delta = document.createElement('em'); delta.className = change === null || Math.abs(change) < .05 ? 'is-flat' : change > 0 ? 'is-up' : 'is-down'; delta.textContent = change === null ? 'Sin previo' : `${change >= 0 ? '+' : ''}${change.toFixed(1)} pb`; value.append(delta);
            card.append(flag, copy, value); host.append(card);
        });
    }

    function renderReturnsGlobal() {
        const mode = state.returnsGlobalMode;
        const items = mode === 'sovereign' ? state.returnsGlobalData : getReturnsGlobalAnchors();
        document.querySelectorAll('[data-returns-global-mode]').forEach(button => {
            const active = button.dataset.returnsGlobalMode === mode; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
        });
        if (!items.length) {
            if (mode === 'sovereign' && state.returnsGlobalPromise) setReturnsGlobalState('Conectando mercados soberanos…', true);
            return;
        }
        const values = items.map(item => item.value).sort((a, b) => a - b);
        const middle = Math.floor(values.length / 2);
        const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
        const highest = items.reduce((best, item) => item.value > best.value ? item : best, items[0]);
        const changes = items.filter(item => Number.isFinite(item.prev)).map(item => item.value - item.prev);
        const rising = changes.filter(value => value > 0).length;
        if ($('returns-global-count')) $('returns-global-count').textContent = String(items.length);
        if ($('returns-global-count-note')) $('returns-global-count-note').textContent = `${new Set(items.map(item => item.region)).size} regiones representadas`;
        if ($('returns-global-median')) $('returns-global-median').textContent = `${median.toFixed(2)}%`;
        if ($('returns-global-high')) $('returns-global-high').textContent = `${highest.value.toFixed(2)}%`;
        if ($('returns-global-high-note')) $('returns-global-high-note').textContent = highest.country;
        if ($('returns-global-breadth')) $('returns-global-breadth').textContent = changes.length ? `${Math.round(rising / changes.length * 100)}%` : '—';
        if ($('returns-global-breadth-note')) $('returns-global-breadth-note').textContent = changes.length ? `${rising} de ${changes.length} al alza` : 'Sin lectura previa';
        if ($('returns-global-chart-title')) $('returns-global-chart-title').textContent = mode === 'sovereign' ? 'Rendimiento soberano a 10 años' : 'Tasas que anclan cada mercado';
        if ($('returns-global-region-count')) $('returns-global-region-count').textContent = `${items.length} mercados`;
        if ($('returns-global-source')) $('returns-global-source').textContent = mode === 'sovereign' ? 'BCE · US Treasury' : 'Bancos centrales · Banxico · mercado monetario';
        if ($('returns-global-note')) $('returns-global-note').textContent = mode === 'sovereign'
            ? 'Comparación homogénea de referencias soberanas a 10 años; el cambio europeo corresponde a la última publicación mensual.'
            : 'Las anclas monetarias no son bonos: se muestran aparte para explicar el entorno que condiciona las curvas de cada región.';
        renderReturnsGlobalChart(items);
        renderReturnsCountryGrid([...items].sort((a, b) => a.region.localeCompare(b.region) || b.value - a.value));
        setReturnsGlobalState('', false);
    }

    function setReturnsSpread(id, value, noteId = null) {
        const element = $(id);
        if (!element) return;
        element.classList.remove('is-ascending', 'is-inverted', 'is-flat');
        if (!Number.isFinite(value)) { element.textContent = '—'; if (noteId && $(noteId)) $(noteId).textContent = 'Sin tramos comparables'; return; }
        element.textContent = `${value >= 0 ? '+' : ''}${value.toFixed(2)} pp`;
        element.classList.add(value > .35 ? 'is-ascending' : value < -.35 ? 'is-inverted' : 'is-flat');
        if (noteId && $(noteId)) $(noteId).textContent = value > .35 ? 'Curva ascendente' : value < -.35 ? 'Curva invertida' : 'Curva plana';
    }

    function renderReturnsSpreads(curves) {
        const spread = points => points.length > 1 ? points.at(-1).y - points[0].y : null;
        const us = curves.us.points;
        const us5 = nearestReturnsPoint(us, 5);
        const us30 = nearestReturnsPoint(us, 30);
        setReturnsSpread('returns-spread-us', spread(us), 'returns-spread-us-note');
        setReturnsSpread('returns-spread-us-duration', us5 && us30 ? us30.y - us5.y : null);
        setReturnsSpread('returns-spread-cetes', spread(curves.cetes.points));
        setReturnsSpread('returns-spread-udi', spread(curves.udibonos.points));
    }

    function syncReturnsHistorySeries() {
        const select = $('returns-history-series');
        if (!select) return null;
        const available = RETURNS_HISTORY_COUNTRIES[state.returnsHistoryCountry]?.series || [];
        const previous = state.returnsHistorySeries;
        select.replaceChildren(...available.map(item => new Option(item.label, item.id)));
        const selected = available.find(item => item.id === previous) || available.find(item => item.preferred) || available[0] || null;
        state.returnsHistorySeries = selected?.id || '';
        select.value = state.returnsHistorySeries;
        select.disabled = !available.length;
        return selected;
    }

    function setReturnsHistoryState(message, loading = false) {
        const host = $('returns-history-state');
        if (!host) return;
        host.classList.toggle('is-hidden', !message);
        host.classList.toggle('is-loading', loading);
        const copy = host.querySelector('p'); if (copy) copy.textContent = message || '';
    }

    function parseReturnsBanxicoDate(value) {
        const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || '').trim());
        return match ? new Date(+match[3], +match[2] - 1, +match[1]) : null;
    }

    async function fetchReturnsHistory(countryKey, seriesId, years) {
        const country = RETURNS_HISTORY_COUNTRIES[countryKey];
        const cacheKey = `returns-history:${countryKey}:${seriesId}:${years}`;
        if (state.marketSeries.has(cacheKey)) return state.marketSeries.get(cacheKey);
        let points = [];
        if (country?.kind === 'yahoo') {
            const range = years <= 1 ? '1y' : years <= 3 ? '3y' : years <= 5 ? '5y' : '10y';
            const interval = years <= 1 ? '1d' : '1wk';
            const data = await fetchJson(`/api/stock-history?ticker=${encodeURIComponent(seriesId)}&range=${range}&interval=${interval}`, 18000);
            points = (Array.isArray(data?.candles) ? data.candles : []).map(item => ({
                date: new Date(typeof item.time === 'number' ? item.time * 1000 : `${item.time}T00:00:00`),
                value: +item.close,
            })).filter(item => !Number.isNaN(item.date.getTime()) && Number.isFinite(item.value));
        } else if (country?.kind === 'banxico') {
            const end = new Date(); const start = new Date(end.getFullYear() - years, end.getMonth(), end.getDate());
            const iso = date => date.toISOString().slice(0, 10);
            const data = await fetchJson(`/api/banxico/${encodeURIComponent(seriesId)}/history?start=${iso(start)}&end=${iso(end)}`, 18000);
            points = (data?.bmx?.series?.[0]?.datos || []).map(item => ({ date: parseReturnsBanxicoDate(item.fecha), value: Number.parseFloat(item.dato) }))
                .filter(item => item.date && Number.isFinite(item.value));
        } else if (country?.kind === 'ecb') {
            const data = await fetchJson(`/api/ecb/${encodeURIComponent(seriesId)}/history?years=${years}`, 22000);
            points = (Array.isArray(data?.points) ? data.points : []).map(item => ({
                date: new Date(`${item.date}-01T00:00:00`), value: +item.value,
            })).filter(item => !Number.isNaN(item.date.getTime()) && Number.isFinite(item.value));
        }
        points.sort((a, b) => a.date - b.date);
        state.marketSeries.set(cacheKey, points);
        return points;
    }

    function formatReturnsHistoryDate(date) {
        return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    }

    function renderReturnsHistoryChart(points, meta) {
        const canvas = $('returns-history-chart');
        if (!canvas || typeof Chart === 'undefined') return;
        if (state.returnsHistoryChart) { state.returnsHistoryChart.destroy(); state.returnsHistoryChart = null; }
        const maximumPoints = 520;
        const step = Math.max(1, Math.ceil(points.length / maximumPoints));
        const sampled = points.filter((_, index) => index % step === 0 || index === points.length - 1);
        const values = sampled.map(point => point.value);
        const lastValue = points.at(-1)?.value;
        const currentLine = {
            id: 'returnsCurrentLine',
            afterDatasetsDraw(chart) {
                if (!Number.isFinite(lastValue) || !chart.chartArea) return;
                const y = chart.scales.y.getPixelForValue(lastValue); const { left, right } = chart.chartArea; const ctx = chart.ctx;
                ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(153,111,47,.55)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); ctx.restore();
            },
        };
        state.returnsHistoryChart = new Chart(canvas, {
            type: 'line', plugins: [currentLine],
            data: { labels: sampled.map(point => point.date.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })), datasets: [{
                label: meta.label, data: values, borderColor: '#9b2945', borderWidth: 2.4, pointRadius: 0, pointHoverRadius: 5,
                pointHoverBackgroundColor: '#9b2945', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
                backgroundColor: context => {
                    const area = context.chart.chartArea; if (!area) return 'rgba(153,111,47,.14)';
                    const gradient = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                    gradient.addColorStop(0, 'rgba(153,111,47,.3)'); gradient.addColorStop(1, 'rgba(153,111,47,.015)'); return gradient;
                }, fill: true, tension: .22,
            }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                animation: { duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 720, easing: 'easeOutQuart' },
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: false }, tooltip: {
                    backgroundColor: '#142536', padding: 10, displayColors: false,
                    callbacks: { title: items => formatReturnsHistoryDate(sampled[items[0].dataIndex].date), label: item => `${item.parsed.y.toFixed(2)}%` },
                } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#667989', maxTicksLimit: 8, maxRotation: 0, font: { size: 9, weight: '600' } } },
                    y: { position: 'right', grid: { color: 'rgba(23,39,55,.07)' }, ticks: { color: '#667989', callback: value => `${Number(value).toFixed(1)}%`, font: { family: 'JetBrains Mono', size: 9 } } },
                },
            },
        });
    }

    async function loadReturnsHistory() {
        const countryKey = state.returnsHistoryCountry;
        const country = RETURNS_HISTORY_COUNTRIES[countryKey];
        const series = (country?.series || []).find(item => item.id === state.returnsHistorySeries);
        const request = ++state.returnsHistoryRequest;
        const ids = ['returns-history-last','returns-history-high','returns-history-low','returns-history-change'];
        const clearStats = () => {
            ids.forEach(id => { if ($(id)) { $(id).textContent = '—'; $(id).className = ''; } });
            ['returns-history-last-date','returns-history-high-date','returns-history-low-date'].forEach(id => { if ($(id)) $(id).textContent = 'Periodo'; });
            if ($('returns-history-observations')) $('returns-history-observations').textContent = 'Sin observaciones';
            if ($('returns-history-position')) $('returns-history-position').textContent = '—';
            if ($('returns-history-position-bar')) $('returns-history-position-bar').style.setProperty('--position', '0%');
        };
        if (!series) {
            clearStats();
            if ($('returns-history-title')) $('returns-history-title').textContent = 'Serie histórica no conectada';
            if ($('returns-history-subtitle')) $('returns-history-subtitle').textContent = 'La fuente actual no publica una serie histórica utilizable para este instrumento.';
            setReturnsHistoryState('No hay una serie histórica conectada para esta curva. La fotografía actual permanece disponible arriba.', false);
            if (state.returnsHistoryChart) { state.returnsHistoryChart.destroy(); state.returnsHistoryChart = null; }
            return;
        }
        if ($('returns-history-title')) $('returns-history-title').textContent = `${country.flag} ${country.label} · ${series.label}`;
        if ($('returns-history-subtitle')) $('returns-history-subtitle').textContent = `Evolución del rendimiento de ${country.label} durante ${state.returnsHistoryYears} ${state.returnsHistoryYears === 1 ? 'año' : 'años'}.`;
        if ($('returns-history-source')) $('returns-history-source').textContent = series.source;
        clearStats();
        setReturnsHistoryState('Cargando serie histórica…', true);
        try {
            const points = await fetchReturnsHistory(countryKey, series.id, state.returnsHistoryYears);
            if (request !== state.returnsHistoryRequest) return;
            if (points.length < 2) throw new Error('Serie insuficiente');
            const first = points[0], last = points.at(-1);
            const high = points.reduce((best, point) => point.value > best.value ? point : best, points[0]);
            const low = points.reduce((best, point) => point.value < best.value ? point : best, points[0]);
            const change = last.value - first.value;
            const position = high.value === low.value ? 50 : (last.value - low.value) / (high.value - low.value) * 100;
            if ($('returns-history-last')) $('returns-history-last').textContent = `${last.value.toFixed(2)}%`;
            if ($('returns-history-last-date')) $('returns-history-last-date').textContent = formatReturnsHistoryDate(last.date);
            if ($('returns-history-high')) $('returns-history-high').textContent = `${high.value.toFixed(2)}%`;
            if ($('returns-history-high-date')) $('returns-history-high-date').textContent = formatReturnsHistoryDate(high.date);
            if ($('returns-history-low')) $('returns-history-low').textContent = `${low.value.toFixed(2)}%`;
            if ($('returns-history-low-date')) $('returns-history-low-date').textContent = formatReturnsHistoryDate(low.date);
            if ($('returns-history-change')) { $('returns-history-change').textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)} pp`; $('returns-history-change').className = change > 0 ? 'returns-change-up' : change < 0 ? 'returns-change-down' : 'returns-change-flat'; }
            if ($('returns-history-observations')) $('returns-history-observations').textContent = `${points.length.toLocaleString('es-MX')} observaciones`;
            if ($('returns-history-position')) $('returns-history-position').textContent = `${position.toFixed(0)}%`;
            if ($('returns-history-position-bar')) $('returns-history-position-bar').style.setProperty('--position', `${Math.max(0, Math.min(100, position))}%`);
            renderReturnsHistoryChart(points, series);
            setReturnsHistoryState('', false);
        } catch (error) {
            if (request !== state.returnsHistoryRequest) return;
            setReturnsHistoryState('No fue posible cargar esta serie histórica. Conservamos la curva actual disponible.', false);
        }
    }

    function nearestReturnsPoint(points, years) {
        return points.reduce((best, point) => !best || Math.abs(point.x - years) < Math.abs(best.x - years) ? point : best, null);
    }

    function setReturnsMetric(id, value, { digits = 2, suffix = '', signed = false } = {}) {
        const element = $(id);
        if (!element) return;
        if (!Number.isFinite(value)) { element.textContent = '—'; return; }
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const format = number => `${signed && number > 0 ? '+' : ''}${number.toFixed(digits)}${suffix}`;
        if (reduced) { element.textContent = format(value); return; }
        const token = `${Date.now()}-${Math.random()}`;
        element.dataset.returnsAnimation = token;
        const start = performance.now();
        const duration = 520;
        const tick = now => {
            if (element.dataset.returnsAnimation !== token) return;
            const progress = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            element.textContent = format(value * eased);
            if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    function renderReturnsChart(curve) {
        const canvas = $('returns-curve-chart');
        const empty = $('returns-chart-empty');
        if (!canvas || typeof Chart === 'undefined') return;
        if (state.returnsChart) { state.returnsChart.destroy(); state.returnsChart = null; }
        if (curve.points.length < 2) {
            canvas.hidden = true;
            if (empty) empty.hidden = false;
            return;
        }
        canvas.hidden = false;
        if (empty) empty.hidden = true;
        const isChange = state.returnsMode === 'change';
        const reference = curve.nature === 'Nominal' ? getReturnsReference() : null;
        const hasPrevious = curve.points.some(point => Number.isFinite(point.prev));
        const labels = curve.points.map(point => point.label);
        const current = curve.points.map(point => point.y);
        const previous = curve.points.map(point => point.prev);
        const changes = curve.points.map(point => Number.isFinite(point.prev) ? (point.y - point.prev) * 100 : 0);
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const chartGuides = {
            id: 'returnsChartGuides',
            beforeTooltipDraw(chart) {
                const active = chart.tooltip?.getActiveElements?.() || [];
                if (!active.length) return;
                const x = active[0].element.x;
                const { ctx, chartArea } = chart;
                ctx.save();
                ctx.beginPath(); ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(35,60,79,.28)';
                ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke(); ctx.restore();
            },
            afterDatasetsDraw(chart) {
                if (isChange) return;
                const { ctx, chartArea } = chart;
                chart.data.datasets.forEach((dataset, datasetIndex) => {
                    if (datasetIndex === 1 && dataset.label === 'Anterior') return;
                    const meta = chart.getDatasetMeta(datasetIndex);
                    const point = meta.data.at(-1);
                    const value = dataset.data.at(-1);
                    if (!point || !Number.isFinite(value)) return;
                    const text = `${value.toFixed(2)}%`;
                    ctx.save(); ctx.font = "700 10px 'JetBrains Mono', monospace";
                    const width = ctx.measureText(text).width + 14;
                    const x = Math.min(point.x - width - 7, chartArea.right - width - 3);
                    const y = Math.max(chartArea.top + 3, Math.min(point.y - 13, chartArea.bottom - 25));
                    const radius = 6;
                    ctx.beginPath(); ctx.roundRect(x, y, width, 22, radius);
                    ctx.fillStyle = datasetIndex === 0 ? '#7d1f38' : '#b88635'; ctx.fill();
                    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 7, y + 11); ctx.restore();
                });
            },
        };
        const datasets = isChange ? [{
            label: 'Cambio', data: changes,
            backgroundColor: changes.map(value => value > .25 ? 'rgba(180,58,74,.84)' : value < -.25 ? 'rgba(8,116,86,.84)' : 'rgba(116,132,145,.72)'),
            hoverBackgroundColor: changes.map(value => value > .25 ? '#b3261e' : value < -.25 ? '#0b6e4f' : '#898781'),
            borderRadius: 9, borderSkipped: false, maxBarThickness: 38,
        }] : [{
            label: 'Actual', data: current, borderColor: '#8e213d',
            backgroundColor: context => {
                const area = context.chart.chartArea;
                if (!area) return 'rgba(142,33,61,.12)';
                const gradient = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                gradient.addColorStop(0, 'rgba(142,33,61,.24)'); gradient.addColorStop(.58, 'rgba(184,134,53,.08)'); gradient.addColorStop(1, 'rgba(142,33,61,0)');
                return gradient;
            },
            borderWidth: 3.5, pointRadius: 4.5, pointHoverRadius: 8, pointHitRadius: 16,
            pointBackgroundColor: '#fff', pointBorderColor: '#8e213d', pointBorderWidth: 2.5,
            fill: true, tension: .34, cubicInterpolationMode: 'monotone',
        }, ...(hasPrevious ? [{
            label: 'Anterior', data: previous, borderColor: '#898781', backgroundColor: 'transparent', borderDash: [6, 5],
            borderWidth: 2, pointRadius: 2.5, pointHoverRadius: 5, pointHitRadius: 12, tension: .3,
        }] : []), ...(reference ? [{
            label: `${reference.country} 10A`, data: curve.points.map(() => reference.value),
            borderColor: '#b88635', backgroundColor: 'transparent', borderDash: [4, 5],
            borderWidth: 2.25, pointRadius: 0, pointHoverRadius: 4, pointHitRadius: 12, fill: false, tension: 0,
        }] : [])];
        state.returnsChart = new Chart(canvas, {
            type: isChange ? 'bar' : 'line',
            data: { labels, datasets },
            plugins: [chartGuides],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 14, right: 10, bottom: 4, left: 4 } },
                animation: { duration: reducedMotion ? 0 : 1050, easing: 'easeOutQuart' },
                transitions: { active: { animation: { duration: reducedMotion ? 0 : 260 } } },
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(20,37,54,.96)', borderColor: 'rgba(255,255,255,.14)', borderWidth: 1,
                        cornerRadius: 10, padding: 12, displayColors: true, usePointStyle: true,
                        titleFont: { family: 'Inter', size: 11, weight: '700' }, bodyFont: { family: 'JetBrains Mono', size: 10, weight: '600' },
                        callbacks: {
                            title: items => `Vencimiento ${items[0]?.label || ''}`,
                            label: context => `${context.dataset.label}: ${isChange ? `${context.parsed.y >= 0 ? '+' : ''}${context.parsed.y.toFixed(1)} pb` : `${context.parsed.y.toFixed(2)}%`}`,
                            footer: items => {
                                if (isChange || !reference || !items.length) return '';
                                const spread = (current[items[0].dataIndex] - reference.value) * 100;
                                return `Diferencial vs ${reference.country}: ${spread >= 0 ? '+' : ''}${spread.toFixed(1)} pb`;
                            },
                        },
                    },
                },
                scales: {
                    x: { border: { display: false }, grid: { display: false }, ticks: { color: '#536b7d', padding: 9, font: { family: 'Inter', size: 10, weight: '700' } } },
                    y: {
                        border: { display: false }, grid: { color: 'rgba(23,39,55,.075)', drawTicks: false },
                        ticks: { color: '#637687', padding: 10, font: { family: 'JetBrains Mono', size: 9, weight: '600' }, callback: value => isChange ? `${value} pb` : `${value}%` },
                        title: { display: true, text: isChange ? 'Cambio en puntos base' : 'Rendimiento anual %', color: '#637687', font: { size: 10, weight: '700' } },
                    },
                },
            },
        });
        const legend = $('returns-legend');
        if (legend) legend.hidden = isChange;
        const referenceLegend = $('returns-reference-legend');
        if (referenceLegend) referenceLegend.hidden = isChange || !reference;
        if ($('returns-reference-legend-label')) $('returns-reference-legend-label').textContent = reference ? `${reference.flag} ${reference.country} 10A` : 'Referencia 10A';
        if ($('returns-chart-title')) $('returns-chart-title').textContent = isChange
            ? `Cambios por tramo · ${curve.title}`
            : reference ? `${curve.title} frente a ${reference.country} 10A` : curve.title;
        if ($('returns-chart-unit')) $('returns-chart-unit').textContent = isChange ? 'Cambio en puntos base' : 'Rendimiento anual %';
    }

    function renderReturnsHeatmap(curve) {
        const host = $('returns-heatmap');
        if (!host) return;
        host.replaceChildren();
        if (!curve.points.length) { const empty = document.createElement('span'); empty.textContent = 'Sin datos por tramo.'; host.append(empty); return; }
        curve.points.forEach((point, index) => {
            const change = Number.isFinite(point.prev) ? (point.y - point.prev) * 100 : null;
            const tone = change === null || Math.abs(change) < .25 ? '#898781' : change > 0 ? '#b3261e' : '#0b6e4f';
            const item = document.createElement('div'); item.className = 'returns-heatmap-item'; item.style.setProperty('--tone', tone); item.style.setProperty('--delay', `${index * .045}s`);
            const label = document.createElement('span'); label.textContent = point.label;
            const value = document.createElement('strong'); value.textContent = `${point.y.toFixed(2)}%`;
            const delta = document.createElement('small'); delta.textContent = change === null ? 'Sin lectura previa' : `${change >= 0 ? '+' : ''}${change.toFixed(1)} pb`;
            item.append(label, value, delta); host.append(item);
        });
    }

    function renderReturnsComparison(curves) {
        const host = $('returns-comparison');
        if (!host) return;
        const rows = Object.values(curves).map(curve => {
            const target = curve.key === 'cetes' ? curve.points.at(-1) : nearestReturnsPoint(curve.points, 10);
            return target ? { curve, target } : null;
        }).filter(Boolean);
        host.replaceChildren();
        if (!rows.length) { const empty = document.createElement('span'); empty.textContent = 'Sin referencias comparables.'; host.append(empty); return; }
        const maximum = Math.max(...rows.map(row => row.target.y), .01);
        const tones = { us: '#9b2945', cetes: '#bd8b3d', udibonos: '#6f8979' };
        rows.forEach((row, index) => {
            const item = document.createElement('div'); item.className = 'returns-comparison-row'; item.style.setProperty('--tone', tones[row.curve.key]); item.style.setProperty('--delay', `${index * .09}s`);
            const label = document.createElement('span'); label.textContent = `${row.curve.short} ${row.target.label}`;
            const track = document.createElement('div'); track.className = 'returns-comparison-track';
            const bar = document.createElement('i'); bar.style.setProperty('--width', `${Math.max(5, row.target.y / maximum * 100)}%`); track.append(bar);
            const value = document.createElement('strong'); value.textContent = `${row.target.y.toFixed(2)}%`;
            item.append(label, track, value); host.append(item);
        });
    }

    function renderReturnsTable(curve) {
        const body = $('returns-table-body');
        if (!body) return;
        body.replaceChildren();
        if (!curve.points.length) {
            const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 9; cell.textContent = 'No hay vencimientos disponibles para esta curva.'; row.append(cell); body.append(row); return;
        }
        const values = curve.points.map(point => point.y);
        const minimum = Math.min(...values), maximum = Math.max(...values);
        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        const orderedValues = [...values].sort((a, b) => a - b);
        const middle = Math.floor(orderedValues.length / 2);
        const median = orderedValues.length % 2 ? orderedValues[middle] : (orderedValues[middle - 1] + orderedValues[middle]) / 2;
        const deviation = Math.sqrt(values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length);
        const benchmark = nearestReturnsPoint(curve.points, 10) || curve.points.at(-1);
        const slope = curve.points.at(-1).y - curve.points[0].y;
        const biggest = curve.points.filter(point => Number.isFinite(point.prev)).reduce((best, point) => {
            if (!best) return point;
            return Math.abs(point.y - point.prev) > Math.abs(best.y - best.prev) ? point : best;
        }, null);
        if ($('returns-table-count')) $('returns-table-count').textContent = `${curve.points.length} tramos`;
        if ($('returns-table-average')) $('returns-table-average').textContent = `${average.toFixed(2)}%`;
        if ($('returns-table-median')) $('returns-table-median').textContent = `${median.toFixed(2)}%`;
        if ($('returns-table-range')) $('returns-table-range').textContent = `${(maximum - minimum).toFixed(2)} pp`;
        if ($('returns-table-deviation')) $('returns-table-deviation').textContent = `${deviation.toFixed(2)} pp`;
        if ($('returns-table-max-move')) {
            const move = biggest ? (biggest.y - biggest.prev) * 100 : null;
            $('returns-table-max-move').textContent = biggest ? `${biggest.label} · ${move >= 0 ? '+' : ''}${move.toFixed(1)} pb` : 'Sin previo';
        }
        if ($('returns-table-insight')) {
            const high = curve.points.reduce((best, point) => point.y > best.y ? point : best, curve.points[0]);
            const low = curve.points.reduce((best, point) => point.y < best.y ? point : best, curve.points[0]);
            const shape = slope > .35 ? 'ascendente' : slope < -.35 ? 'invertida' : 'prácticamente plana';
            $('returns-table-insight').textContent = `Curva ${shape}: máximo en ${high.label} (${high.y.toFixed(2)}%) y mínimo en ${low.label} (${low.y.toFixed(2)}%).`;
        }
        const maturityIndex = new Map(curve.points.map((point, index) => [point, index]));
        const rows = [...curve.points].sort((a, b) => {
            if (state.returnsTableSort === 'yield-desc') return b.y - a.y;
            if (state.returnsTableSort === 'move-desc') return Math.abs((b.y - (b.prev ?? b.y)) * 100) - Math.abs((a.y - (a.prev ?? a.y)) * 100);
            return maturityIndex.get(a) - maturityIndex.get(b);
        });
        const segmentFor = point => {
            const match = String(point.label).toUpperCase().match(/([\d.]+)\s*(D|M|Y|A)/);
            if (!match) return 'Referencia';
            const value = +match[1], unit = match[2];
            const years = unit === 'D' ? value / 365 : unit === 'M' ? value / 12 : value;
            return years <= 1 ? 'Corto plazo' : years <= 10 ? 'Tramo medio' : 'Largo plazo';
        };
        rows.forEach((point, rowIndex) => {
            const change = Number.isFinite(point.prev) ? (point.y - point.prev) * 100 : null;
            const spreadBenchmark = (point.y - benchmark.y) * 100;
            const spreadAverage = (point.y - average) * 100;
            const row = document.createElement('tr'); row.style.setProperty('--delay', `${rowIndex * .045}s`);
            if (point === benchmark) row.classList.add('is-benchmark');
            const reading = change === null ? 'Nivel actual sin lectura previa'
                : change > 1 ? 'Rendimiento sube · precio bajo presión'
                : change < -1 ? 'Rendimiento baja · precio favorecido'
                : 'Sin desplazamiento relevante';
            const maturity = document.createElement('td');
            const maturityLabel = document.createElement('strong'); maturityLabel.textContent = point.label; maturity.append(maturityLabel);
            if (point === benchmark) { const tag = document.createElement('small'); tag.textContent = 'REFERENCIA'; maturity.append(tag); }
            const segment = document.createElement('td');
            const segmentPill = document.createElement('span'); segmentPill.className = 'returns-nature-pill'; segmentPill.textContent = segmentFor(point); segment.append(segmentPill);
            const currentCell = document.createElement('td'); currentCell.textContent = `${point.y.toFixed(2)}%`;
            const previousCell = document.createElement('td'); previousCell.textContent = Number.isFinite(point.prev) ? `${point.prev.toFixed(2)}%` : '—';
            const changeCell = document.createElement('td'); changeCell.textContent = change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)} pb`;
            changeCell.className = change === null || Math.abs(change) <= 1 ? 'returns-change-flat' : change > 0 ? 'returns-change-up' : 'returns-change-down';
            const benchmarkCell = document.createElement('td'); benchmarkCell.textContent = `${spreadBenchmark >= 0 ? '+' : ''}${spreadBenchmark.toFixed(1)} pb`; benchmarkCell.className = Math.abs(spreadBenchmark) < .05 ? 'returns-change-flat' : spreadBenchmark > 0 ? 'returns-spread-positive' : 'returns-spread-negative';
            const averageCell = document.createElement('td'); averageCell.textContent = `${spreadAverage >= 0 ? '+' : ''}${spreadAverage.toFixed(1)} pb`; averageCell.className = spreadAverage >= 0 ? 'returns-spread-positive' : 'returns-spread-negative';
            const positionCell = document.createElement('td'); positionCell.className = 'returns-position-cell';
            const position = maximum === minimum ? 50 : ((point.y - minimum) / (maximum - minimum)) * 100;
            const positionLabel = document.createElement('span'); positionLabel.textContent = `${position.toFixed(0)}%`;
            const positionTrack = document.createElement('span'); positionTrack.className = 'returns-position-track';
            const positionBar = document.createElement('i'); positionBar.style.setProperty('--position', `${Math.max(4, position)}%`); positionTrack.append(positionBar);
            const positionWrap = document.createElement('div'); positionWrap.append(positionLabel, positionTrack); positionCell.append(positionWrap);
            const readingCell = document.createElement('td'); readingCell.textContent = reading;
            row.append(maturity, segment, currentCell, previousCell, changeCell, benchmarkCell, averageCell, positionCell, readingCell);
            body.append(row);
        });
    }

    function renderReturnsPanel() {
        const panel = $('returns-panel');
        if (!panel) return;
        const curves = getReturnsCurves();
        let curve = curves[state.returnsCurve];
        if (!curve?.points.length) curve = Object.values(curves).find(item => item.points.length) || curve;
        if (!curve) return;
        state.returnsCurve = curve.key;
        syncReturnsHistoryCountryOptions();
        syncReturnsHistorySeries();
        syncReturnsReferenceOptions();
        const referenceSelect = $('returns-reference-country');
        if (referenceSelect) referenceSelect.disabled = curve.nature !== 'Nominal' || !state.returnsGlobalData.some(item => item.key !== 'US');
        if ($('returns-reference-label')) $('returns-reference-label').textContent = curve.nature === 'Nominal'
            ? `Comparar ${curve.key === 'us' ? 'EE. UU.' : 'México'} contra`
            : 'No comparable con curva real';
        if ($('returns-base-legend')) $('returns-base-legend').textContent = curve.key === 'us' ? 'EE. UU.' : curve.key === 'cetes' ? 'México' : 'México real';
        document.querySelectorAll('[data-returns-curve]').forEach(button => {
            const active = button.dataset.returnsCurve === curve.key;
            button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
            button.disabled = !curves[button.dataset.returnsCurve]?.points.length;
        });
        document.querySelectorAll('[data-returns-mode]').forEach(button => {
            const active = button.dataset.returnsMode === state.returnsMode;
            button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
        });
        if ($('returns-chart-mode')) $('returns-chart-mode').value = state.returnsMode;
        const points = curve.points;
        const first = points[0], last = points.at(-1);
        const benchmark = curve.key === 'cetes' ? last : nearestReturnsPoint(points, 10);
        const slope = first && last && first !== last ? last.y - first.y : null;
        const moves = points.filter(point => Number.isFinite(point.prev)).map(point => (point.y - point.prev) * 100);
        const averageMove = moves.length ? moves.reduce((sum, value) => sum + value, 0) / moves.length : null;
        const range = points.length ? Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)) : null;
        setReturnsMetric('returns-kpi-benchmark', benchmark?.y, { suffix: '%' });
        setReturnsMetric('returns-kpi-slope', slope, { suffix: ' pp', signed: true });
        setReturnsMetric('returns-kpi-move', averageMove, { digits: 1, suffix: ' pb', signed: true });
        setReturnsMetric('returns-kpi-range', range, { suffix: ' pp' });
        if ($('returns-kpi-benchmark-note')) $('returns-kpi-benchmark-note').textContent = benchmark ? `${curve.short} ${benchmark.label}` : 'Sin referencia';
        if ($('returns-kpi-slope-note')) $('returns-kpi-slope-note').textContent = first && last ? `${last.label} menos ${first.label}` : 'Se requieren dos plazos';
        if ($('returns-kpi-move-note')) $('returns-kpi-move-note').textContent = moves.length ? `${moves.length} tramos con lectura previa` : 'Sin lectura anterior';
        if ($('returns-kpi-range-note')) $('returns-kpi-range-note').textContent = points.length ? `${points.length} vencimientos observados` : 'Sin vencimientos';
        if ($('returns-chart-title')) $('returns-chart-title').textContent = curve.title;
        if ($('returns-table-source')) $('returns-table-source').textContent = curve.source;
        if ($('returns-updated')) $('returns-updated').textContent = `Actualizado ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;

        const shape = !Number.isFinite(slope) ? { title: 'Sin clasificar', badge: '—', copy: 'Se requieren al menos dos vencimientos para interpretar la forma de la curva.' }
            : slope > .35 ? { title: 'Curva ascendente', badge: `+${slope.toFixed(2)} pp`, copy: 'El tramo largo ofrece mayor rendimiento que el corto. Esto puede reflejar compensación por plazo, inflación esperada y prima de riesgo.' }
            : slope < -.35 ? { title: 'Curva invertida', badge: `${slope.toFixed(2)} pp`, copy: 'El tramo corto rinde más que el largo. La inversión suele asociarse con política restrictiva y expectativas de menor crecimiento o inflación.' }
            : { title: 'Curva plana', badge: `${slope >= 0 ? '+' : ''}${slope.toFixed(2)} pp`, copy: 'La diferencia entre extremos es reducida. El mercado ofrece poca compensación adicional por extender el vencimiento.' };
        if ($('returns-shape-title')) $('returns-shape-title').textContent = shape.title;
        if ($('returns-shape-badge')) $('returns-shape-badge').textContent = shape.badge;
        if ($('returns-shape-copy')) $('returns-shape-copy').textContent = shape.copy;
        const high = points.reduce((best, point) => !best || point.y > best.y ? point : best, null);
        const low = points.reduce((best, point) => !best || point.y < best.y ? point : best, null);
        const biggest = points.filter(point => Number.isFinite(point.prev)).reduce((best, point) => !best || Math.abs(point.y - point.prev) > Math.abs(best.y - best.prev) ? point : best, null);
        if ($('returns-high-point')) $('returns-high-point').textContent = high ? `${high.label} · ${high.y.toFixed(2)}%` : '—';
        if ($('returns-low-point')) $('returns-low-point').textContent = low ? `${low.label} · ${low.y.toFixed(2)}%` : '—';
        if ($('returns-biggest-move')) $('returns-biggest-move').textContent = biggest ? `${biggest.label} · ${((biggest.y - biggest.prev) * 100) >= 0 ? '+' : ''}${((biggest.y - biggest.prev) * 100).toFixed(1)} pb` : 'Sin lectura previa';
        if ($('returns-nature-note')) $('returns-nature-note').textContent = curve.nature === 'Real'
            ? 'Esta curva expresa rendimiento real sobre inflación; no debe compararse directamente con una tasa nominal.'
            : 'Esta curva es nominal: incorpora inflación esperada y no equivale a rendimiento real.';
        renderReturnsChart(curve);
        renderReturnsSpreads(curves);
        renderReturnsHeatmap(curve);
        renderReturnsComparison(curves);
        renderReturnsTable(curve);
        renderReturnsGlobal();
        if (document.body.classList.contains('ff-detail-rendimientos')) {
            loadReturnsHistory();
            loadReturnsGlobalData();
        }
    }

    async function fetchJson(url, timeout = 12000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } finally {
            clearTimeout(timer);
        }
    }

    async function fetchSeries(symbol, range = state.period) {
        const interval = { '1d': '5m', '5d': '15m', '1mo': '1d', '3mo': '1d', '1y': '1wk' }[range] || '1d';
        const key = `${symbol}:${range}`;
        if (state.marketSeries.has(key)) return state.marketSeries.get(key);
        const data = await fetchJson(`/api/stock-history?ticker=${encodeURIComponent(symbol)}&range=${range}&interval=${interval}`);
        const candles = Array.isArray(data?.candles) ? data.candles.filter(item => Number.isFinite(+item.close)) : [];
        if (!candles.length) throw new Error('Serie vacía');
        state.marketSeries.set(key, candles);
        return candles;
    }

    /* Serie para la minigráfica de una tarjeta, según el periodo elegido.
       Prefijo 'ex:' en la clave de caché para no chocar con fetchSeries(), que
       usa `${symbol}:${range}` con otra granularidad para las mismas etiquetas. */
    async function fetchExchangeSeries(symbol, key) {
        const cfg = EXCHANGE_RANGES[key] || EXCHANGE_RANGES[EXCHANGE_RANGE_DEFAULT];
        const cacheKey = `ex:${symbol}:${key}`;
        if (state.marketSeries.has(cacheKey)) return state.marketSeries.get(cacheKey);
        const data = await fetchJson(`/api/stock-history?ticker=${encodeURIComponent(symbol)}&range=${cfg.range}&interval=${cfg.interval}`);
        let candles = Array.isArray(data?.candles) ? data.candles.filter(item => Number.isFinite(+item.close)) : [];
        if (cfg.trim) candles = candles.slice(-cfg.trim);
        if (!candles.length) throw new Error('Serie vacía');
        state.marketSeries.set(cacheKey, candles);
        return candles;
    }

    /* Color de la serie según su propio recorrido (primer vs. último cierre).
       Para 5 o 10 años la variación de 24 h del encabezado no dice nada útil. */
    function seriesIsUp(candles) {
        if (!candles?.length) return true;
        return +candles[candles.length - 1].close >= +candles[0].close;
    }

    async function fetchQuote(symbol) {
        const candles = await fetchSeries(symbol, '5d');
        const last = candles.at(-1), previous = candles.at(-2);
        const price = +last.close;
        const change = previous?.close ? (price / +previous.close - 1) * 100 : null;
        const quote = { symbol, price, change, candles };
        state.quotes[symbol] = quote;
        return quote;
    }

    function chartDefaults() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 380 },
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { labels: { color: '#687887', usePointStyle: true, pointStyle: 'circle', boxWidth: 7, font: { family: 'Inter', size: 10 } } },
                tooltip: { backgroundColor: '#071c2c', titleFont: { family: 'Inter', size: 11 }, bodyFont: { family: 'JetBrains Mono', size: 10 }, padding: 10, cornerRadius: 9 }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#7b8995', maxTicksLimit: 8, font: { family: 'Inter', size: 9 } } },
                y: { position: 'right', grid: { color: colors.grid }, ticks: { color: '#7b8995', font: { family: 'JetBrains Mono', size: 9 } } }
            }
        };
    }

    function setLoading(loading) {
        const el = $('ff-chart-loading');
        if (el) el.style.display = loading ? 'grid' : 'none';
    }

    function setChartError(show) {
        const el = $('ff-chart-error');
        if (el) el.hidden = !show;
    }

    function setMetric(value, change, suffix) {
        const valueEl = $('ff-main-value');
        const changeEl = $('ff-main-change');
        if (valueEl) valueEl.textContent = suffix === '%' ? formatYield(value) : formatNumber(value, value >= 1000 ? 2 : 2);
        if (changeEl) {
            changeEl.textContent = isNumeric(change) ? formatPercent(change) : 'Lectura actual';
            changeEl.className = isNumeric(change) ? (+change >= 0 ? 'ff-positive-text' : 'ff-negative-text') : 'ff-neutral-text';
        }
    }

    function updateRangeMetrics(values, labels, temporal) {
        const numeric = values.map(Number).filter(Number.isFinite);
        if (!numeric.length) return;
        const max = Math.max(...numeric), min = Math.min(...numeric);
        const maxIndex = values.findIndex(value => +value === max), minIndex = values.findIndex(value => +value === min);
        const change = temporal && numeric[0] !== 0 ? (numeric.at(-1) / numeric[0] - 1) * 100 : numeric.at(-1) - numeric[0];
        const positive = change >= 0;
        $('ff-period-high').textContent = temporal ? formatNumber(max, max >= 1000 ? 2 : 2) : formatYield(max);
        $('ff-period-low').textContent = temporal ? formatNumber(min, min >= 1000 ? 2 : 2) : formatYield(min);
        $('ff-period-high-date').textContent = labels[maxIndex] || 'Periodo';
        $('ff-period-low-date').textContent = labels[minIndex] || 'Periodo';
        $('ff-period-change').textContent = temporal ? formatPercent(change) : `${positive ? '+' : ''}${change.toFixed(2)} pp`;
        $('ff-period-change').className = positive ? 'ff-positive-text' : 'ff-negative-text';
        $('ff-period-trend').textContent = Math.abs(change) < .1 ? 'Estable' : positive ? (temporal ? 'Alcista' : 'Pendiente positiva') : (temporal ? 'Bajista' : 'Pendiente invertida');
        $('ff-period-trend').className = Math.abs(change) < .1 ? 'ff-neutral-text' : positive ? 'ff-positive-text' : 'ff-negative-text';
        $('ff-period-trend-note').textContent = temporal ? 'Inicio a cierre' : 'Primer tramo a último';
    }

    function lineDataset(label, data, color, fill) {
        return {
            label, data, borderColor: color, backgroundColor: fill ? `${color}16` : 'transparent',
            fill: !!fill, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .28
        };
    }

    async function renderMainChart() {
        if (typeof Chart === 'undefined') return;
        setLoading(true);
        setChartError(false);
        const canvas = $('ff-main-chart');
        if (!canvas) return;
        try {
            let labels = [], datasets = [], source = '', value = null, change = null, suffix = '';
            if (state.module === 'bolsa') {
                const selected = moduleConfig.bolsa.indicators.find(item => item[0] === state.indicator) || moduleConfig.bolsa.indicators[0];
                const candles = await fetchSeries(selected[0]);
                let filtered = candles;
                const from = $('ff-date-from')?.value;
                if (from) filtered = candles.filter(item => candleDate(item.time).getTime() >= new Date(from).getTime());
                if (!filtered.length) filtered = candles;
                labels = filtered.map(item => {
                    const d = candleDate(item.time);
                    return state.period === '1d' ? d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
                });
                const values = filtered.map(item => +item.close);
                const comparison = state.compare ? await fetchSeries(state.compare) : null;
                if (comparison?.length) {
                    const size = Math.min(values.length, comparison.length);
                    const primary = values.slice(-size);
                    const secondary = comparison.slice(-size).map(item => +item.close);
                    labels = labels.slice(-size);
                    const normalize = arr => arr.map(value => arr[0] ? value / arr[0] * 100 : value);
                    datasets.push(lineDataset(selected[1], normalize(primary), colors.blue, false));
                    const compareLabel = moduleConfig.bolsa.indicators.find(item => item[0] === state.compare)?.[1] || state.compare;
                    datasets.push(lineDataset(compareLabel, normalize(secondary), colors.gold, false));
                    source = 'Fuente: datos de mercado · comparación base 100';
                } else {
                datasets.push(lineDataset(selected[1], values, colors.blue, state.chartMode === 'area'));
                    source = 'Fuente: datos de mercado · último cierre disponible';
                }
                value = values.at(-1);
                change = values.length > 1 ? (values.at(-1) / values.at(-2) - 1) * 100 : null;
                updateRangeMetrics(values, labels, true);
            } else {
                const us = state.bondData.find(item => item.key === 'us');
                const current = [], previous = [];
                if (state.module === 'tasas') {
                    const rateItems = getReferenceRateItems();
                    labels = rateItems.map(item => item.country);
                    current.push(...rateItems.map(item => +item.yield));
                    previous.push(...rateItems.map(item => isNumeric(item.prev) ? +item.prev : null));
                    source = 'Fuente: referencias monetarias y soberanas · cada tipo está identificado';
                    const selected = rateItems.find(item => item.key === state.indicator) || rateItems[0];
                    value = selected?.yield;
                    change = isNumeric(selected?.prev) ? +selected.yield - +selected.prev : null;
                } else {
                    const bonds = (us?.bonds || []).filter(item => isNumeric(item.yield));
                    labels = bonds.map(item => item.maturity);
                    current.push(...bonds.map(item => +item.yield));
                    previous.push(...bonds.map(item => isNumeric(item.prev) ? +item.prev : null));
                    source = state.module === 'bonos' ? 'Fuente: US Treasury / Yahoo Finance · corte actual' : 'Fuente: curva soberana · lectura actual y anterior';
                    const selectedMap = { us5y: '5Y', us10y: '10Y', us30y: '30Y' };
                    const selectedBond = bonds.find(item => item.maturity === selectedMap[state.indicator]) || bonds.find(item => item.maturity === '10Y') || bonds[0];
                    value = selectedBond?.yield;
                    change = isNumeric(selectedBond?.prev) ? +selectedBond.yield - +selectedBond.prev : null;
                }
                datasets.push(lineDataset('Actual', current, colors.blue, true));
                if (previous.some(Number.isFinite)) datasets.push(lineDataset('Lectura anterior', previous, colors.gold, false));
                suffix = '%';
                updateRangeMetrics(current, labels, false);
            }
            const chartType = state.chartMode === 'bars' ? 'bar' : 'line';
            datasets.forEach((dataset, index) => {
                dataset.fill = state.chartMode === 'area' && index === 0;
                if (chartType === 'bar') {
                    dataset.backgroundColor = index === 0 ? `${colors.blue}cc` : `${colors.gold}99`;
                    dataset.borderWidth = 0;
                    dataset.borderRadius = 5;
                }
            });
            if (state.mainChart) state.mainChart.destroy();
            state.mainChart = new Chart(canvas, { type: chartType, data: { labels, datasets }, options: chartDefaults() });
            setMetric(value, change, suffix);
            $('ff-chart-source').textContent = source;
            setLoading(false);
        } catch (error) {
            console.warn('Favro main chart:', error);
            setLoading(false);
            setChartError(true);
            $('ff-chart-source').textContent = 'Fuente no disponible · se conserva la interfaz para reintentar';
        }
    }

    function renderMiniChart(id, values, color) {
        const canvas = $(id);
        if (!canvas || typeof Chart === 'undefined' || !values?.length) return;
        if (state.miniCharts[id]) state.miniCharts[id].destroy();
        
        const cType = window.finMiniChartType || 'line';
        let chartType = cType === 'bar' || cType === 'ohlc' || cType === 'candles' ? 'bar' : 'line';
        let fillArea = cType === 'area';
        
        state.miniCharts[id] = new Chart(canvas, {
            type: chartType,
            data: { labels: values.map((_, index) => index + 1), datasets: [{ 
                data: values, 
                borderColor: color, 
                backgroundColor: chartType === 'bar' ? color : (fillArea ? `${color}20` : 'transparent'), 
                fill: fillArea, 
                borderWidth: chartType === 'bar' ? 0 : 2, 
                borderRadius: chartType === 'bar' ? 2 : 0,
                tension: .32, 
                pointRadius: 0 
            }] },
            options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }
        });
    }

    function renderExchangeSpark(id, candles, color) {
        let container = $(id);
        if (!container || typeof LightweightCharts === 'undefined' || !candles?.length) return;
        
        if (container.tagName.toLowerCase() === 'canvas') {
            const div = document.createElement('div');
            div.id = id;
            div.style.width = '100%';
            div.style.height = '100%';
            container.parentNode.replaceChild(div, container);
            container = div;
        }

        const cType = window.finMiniChartType || 'line';
        
        /* Wait for DOM paint */
        requestAnimationFrame(() => {
            if (state.miniCharts[id]) {
                try { 
                    state.miniCharts[id].remove(); 
                } catch(e) {}
            }
            if (state.miniChartsObservers && state.miniChartsObservers[id]) {
                try {
                    state.miniChartsObservers[id].disconnect();
                } catch(e) {}
            }
            container.innerHTML = ''; /* Safe fallback to prevent duplicate DOM nodes */

            const chartWrapper = container.parentElement;
            /* El tamaño lo define el CSS (.ff-exchange-card-chart): medimos su caja de
               contenido descontando el padding, para que la gráfica quede centrada y
               no se desborde. Antes la altura estaba fija en 80px aquí, lo que ignoraba
               el CSS y dejaba la serie aplastada. */
            const box  = chartWrapper ? getComputedStyle(chartWrapper) : null;
            const padX = box ? (parseFloat(box.paddingLeft) || 0) + (parseFloat(box.paddingRight)  || 0) : 0;
            const padY = box ? (parseFloat(box.paddingTop)  || 0) + (parseFloat(box.paddingBottom) || 0) : 0;
            const w = Math.max(120, Math.round((chartWrapper?.clientWidth  || 220) - padX));
            const h = Math.max(70,  Math.round((chartWrapper?.clientHeight || 130) - padY));

            container.style.width  = w + 'px';
            container.style.height = h + 'px';
            container.style.margin = '0 auto';

            /* El resplandor de fondo debe seguir el color real de la serie. Las clases
               is-up/is-down de la tarjeta salen de la variación de 24 h, que en una
               gráfica de 5 o 10 años puede apuntar al lado contrario que el recorrido
               dibujado. setProperty con 'important' porque el CSS lo marca así. */
            const glow = chartWrapper?.querySelector('.ff-chart-glow');
            if (glow) glow.style.setProperty('background', hexToRgba(color, .1), 'important');
        
            /* Los candles del backend YA traen tiempo real (unix en segundos si el
               intervalo es intradía, 'YYYY-MM-DD' si es diario — ver market.js).
               Antes se usaba el índice del array como `time`, lo que hacía imposible
               mostrar un eje temporal con sentido. LightweightCharts exige orden
               ascendente y marcas únicas, así que ordenamos y deduplicamos. */
            const points = candles
                .map((c, i) => ({ ...c, t: c.time != null ? c.time : (c.date != null ? c.date : i) }))
                .sort((a, b) => (a.t > b.t ? 1 : a.t < b.t ? -1 : 0))
                .filter((c, i, arr) => i === 0 || c.t !== arr[i - 1].t);

            const axisInk  = '#64748b';
            const gridLine = 'rgba(15,42,64,.07)';

            const chart = LightweightCharts.createChart(container, {
                width: w,
                height: h,
                /* attributionLogo: en una minigráfica el logo de TradingView es ruido y
                   tapa la serie. Antes no se notaba porque el canvas salía recortado. */
                layout: {
                    background: { type: 'solid', color: 'transparent' },
                    textColor: axisInk,
                    attributionLogo: false,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                },
                grid: {
                    vertLines: { visible: true, color: gridLine, style: LightweightCharts.LineStyle.Dotted },
                    horzLines: { visible: true, color: gridLine, style: LightweightCharts.LineStyle.Dotted },
                },
                timeScale: {
                    visible: true,
                    borderVisible: false,
                    timeVisible: true,
                    secondsVisible: false,
                    fixLeftEdge: true,
                    fixRightEdge: true,
                },
                rightPriceScale: {
                    visible: true,
                    borderVisible: false,
                    autoScale: true,
                    entireTextOnly: true,
                },
                crosshair: {
                    mode: LightweightCharts.CrosshairMode.Magnet,
                    vertLine: { color: 'rgba(15,42,64,.32)', width: 1, style: LightweightCharts.LineStyle.Dashed, labelBackgroundColor: '#0c2d44' },
                    horzLine: { color: 'rgba(15,42,64,.32)', width: 1, style: LightweightCharts.LineStyle.Dashed, labelBackgroundColor: '#0c2d44' },
                },
                handleScroll: false,
                handleScale: false,
                localization: {
                    locale: 'es-MX',
                    priceFormatter: v => (+v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                },
            });

            /* Un respiro arriba y abajo: con 0.05 la línea (2px) y las mechas de las
               velas quedaban pegadas al borde y se recortaban visualmente. */
            chart.priceScale('right').applyOptions({
                scaleMargins: {
                    top: 0.14,
                    bottom: 0.14,
                },
            });

            const ohlcData = points.map(c => ({ time: c.t, open: +c.open, high: +c.high, low: +c.low, close: +c.close }));
            const lineData = points.map(c => ({ time: c.t, value: +c.close }));

            let series;
            const up = EXCHANGE_CHART_COLORS.up, down = EXCHANGE_CHART_COLORS.down;
            if (cType === 'candles') {
                series = chart.addCandlestickSeries({ upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down });
                series.setData(ohlcData);
            } else if (cType === 'ohlc') {
                series = chart.addBarSeries({ upColor: up, downColor: down });
                series.setData(ohlcData);
            } else if (cType === 'area') {
                series = chart.addAreaSeries({ lineColor: color, topColor: color + '40', bottomColor: 'transparent', lineWidth: 2 });
                series.setData(lineData);
            } else {
                series = chart.addLineSeries({ color: color, lineWidth: 2 });
                series.setData(lineData);
            }

            /* Línea de referencia del último cierre: ayuda a ver el nivel actual
               frente al recorrido. `axisLabelVisible: false` porque la serie ya
               dibuja su propia etiqueta de último valor y si no salen duplicadas. */
            const closes = lineData.map(p => p.value).filter(Number.isFinite);
            if (closes.length) {
                series.createPriceLine({
                    price: closes[closes.length - 1],
                    color,
                    lineWidth: 1,
                    lineStyle: LightweightCharts.LineStyle.Dotted,
                    axisLabelVisible: false,
                    title: '',
                });
            }

            chart.timeScale().fitContent();

            /* Tooltip: LightweightCharts no trae uno. Sin esto la gráfica no era
               consultable — el usuario no podía saber qué valor había en cada punto. */
            chartWrapper.querySelectorAll('.ff-spark-tip').forEach(node => node.remove());
            const tip = document.createElement('div');
            tip.className = 'ff-spark-tip';
            tip.style.display = 'none';
            chartWrapper.appendChild(tip);

            const fmtVal = v => (+v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const fmtWhen = t => {
                const d = typeof t === 'number' ? new Date(t * 1000) : new Date(String(t) + 'T00:00:00');
                if (isNaN(d.getTime())) return '';
                return typeof t === 'number'
                    ? d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                    : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
            };

            chart.subscribeCrosshairMove(param => {
                const datum = param.time && param.point ? param.seriesData.get(series) : null;
                if (!datum || param.point.x < 0 || param.point.y < 0) { tip.style.display = 'none'; return; }
                /* El valor va en <b class="ff-spark-tip-v"> y no como nodo de texto suelto:
                   así podemos fijarle color propio y no hereda el tono oscuro de la
                   tarjeta, que lo dejaba ilegible sobre el fondo del tooltip. */
                const row = (label, value) => `<span class="ff-spark-tip-row"><em>${label}</em><b class="ff-spark-tip-v">${fmtVal(value)}</b></span>`;
                tip.innerHTML = `<span class="ff-spark-tip-when">${fmtWhen(param.time)}</span>`
                    + (datum.open != null
                        ? row('Apert.', datum.open) + row('Máx.', datum.high) + row('Mín.', datum.low) + row('Cierre', datum.close)
                        : row('Cierre', datum.value));
                tip.style.display = 'block';
                /* param.point es relativo al contenedor del chart, que va centrado
                   dentro del wrapper: hay que sumar su offset. */
                const ox = container.offsetLeft, oy = container.offsetTop;
                let x = ox + param.point.x + 14;
                let y = oy + param.point.y - tip.offsetHeight - 10;
                if (x + tip.offsetWidth > chartWrapper.clientWidth) x = ox + param.point.x - tip.offsetWidth - 14;
                if (y < 0) y = oy + param.point.y + 16;
                /* Encajarlo dentro del wrapper: el de velas tiene 5 filas y, si el cursor
                   va bajo, se salía del recuadro y lo cortaba el overflow:hidden de la tarjeta. */
                const clamp = (v, max) => Math.max(0, Math.min(v, Math.max(0, max)));
                tip.style.left = clamp(x, chartWrapper.clientWidth  - tip.offsetWidth)  + 'px';
                tip.style.top  = clamp(y, chartWrapper.clientHeight - tip.offsetHeight) + 'px';
            });
            state.miniCharts[id] = chart;
            
            if (!state.miniChartsObservers) state.miniChartsObservers = {};

            /* Safe observer: strictly updates LightweightCharts without touching CSS to avoid loops */
            if (window.ResizeObserver && chartWrapper) {
                const ro = new ResizeObserver(entries => {
                    for (const entry of entries) {
                        /* contentRect ya excluye el padding, así que sirve tal cual.
                           Ajustamos también el alto: las media queries lo cambian
                           (150px ≥1600px, 130px base, 112px ≤1100px) y antes solo se
                           actualizaba el ancho, dejando la gráfica descuadrada. */
                        const cr = entry.contentRect;
                        if (cr.width > 0) {
                            try {
                                chart.applyOptions({
                                    width:  Math.floor(cr.width),
                                    height: Math.max(70, Math.floor(cr.height)),
                                });
                            } catch (e) {
                                // Ignore if chart is destroyed before disconnect
                            }
                        }
                    }
                });
                ro.observe(chartWrapper);
                state.miniChartsObservers[id] = ro;
            }
        });
    }

    function ensureExchangeCards() {
        const grid = $('ff-exchange-grid');
        if (!grid || grid.childElementCount) return;
        const fragment = document.createDocumentFragment();
        exchangeConfig.forEach(exchange => {
            /* ── Row wrapper: card (left) + data box (right) ── */
            const row = document.createElement('div');
            row.className = 'ff-exchange-row';

            /* ── Card (div instead of button for proper flex/grid sizing) ── */
            const card = document.createElement('div');
            card.className = 'ff-exchange-card is-loading';
            card.dataset.exchangeSymbol = exchange.symbol;
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.setAttribute('aria-pressed', 'false');
            card.setAttribute('aria-label', `Abrir ${exchange.name} en Finanzas y gráficas`);

            card.innerHTML = `
                <div class="ff-exchange-card-head">
                    <div class="ff-head-identity">
                        <strong>${exchange.name}</strong>
                        <small>${exchange.region}</small>
                    </div>
                    <em class="ff-badge">${exchange.symbol}</em>
                </div>
                <div class="ff-exchange-card-quote">
                    <strong id="ff-exchange-${exchange.slug}-value">Cargando…</strong>
                    <span id="ff-exchange-${exchange.slug}-delta" class="ff-delta-pill">Consultando mercado</span>
                    <select class="ff-range-select" data-range-for="${exchange.symbol}"
                            aria-label="Periodo de la gráfica de ${exchange.name}">
                        ${Object.entries(EXCHANGE_RANGES).map(([key, cfg]) =>
                            `<option value="${key}"${key === EXCHANGE_RANGE_DEFAULT ? ' selected' : ''}>${cfg.label}</option>`).join('')}
                    </select>
                </div>
                <div class="ff-exchange-card-chart">
                    <div class="ff-chart-glow"></div>
                    <canvas id="ff-exchange-${exchange.slug}-chart" role="img" aria-label="Evolución reciente de ${exchange.name}"></canvas>
                </div>
                <div class="ff-exchange-card-foot">
                    <span class="ff-market-name">${exchange.market}</span>
                    <span class="ff-action-hover">Analizar <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i></span>
                </div>
            `;

            card.addEventListener('click', event => {
                /* La tarjeta entera abre el laboratorio; el selector de periodo vive
                   dentro, así que hay que excluirlo o cambiar de rango lo dispararía. */
                if (event.target.closest('.ff-range-select')) return;
                openExchangeInLab(exchange.symbol, card);
            });

            const rangeSelect = card.querySelector('.ff-range-select');
            rangeSelect?.addEventListener('click', event => event.stopPropagation());
            rangeSelect?.addEventListener('change', event => {
                event.stopPropagation();
                applyExchangeRange(exchange, event.target.value, event.target);
            });

            /* ── Data box (separate element, to the right) ── */
            const dataBox = document.createElement('div');
            dataBox.className = 'ff-exchange-data-box';
            dataBox.innerHTML = `
                <h4 class="ff-data-box-title">${exchange.name}</h4>
                <ul class="ff-data-box-list">
                    <li><span class="ff-data-label">Región</span><span class="ff-data-value">${exchange.region}</span></li>
                    <li><span class="ff-data-label">Mercado</span><span class="ff-data-value">${exchange.market}</span></li>
                    <li><span class="ff-data-label">Último cierre</span><span class="ff-data-value ff-data-close-ext" id="ff-ext-close-${exchange.slug}">–</span></li>
                    <li><span class="ff-data-label">Variación 24h</span><span class="ff-data-value ff-data-delta-ext" id="ff-ext-delta-${exchange.slug}">–</span></li>
                    <li><span class="ff-data-label">Apertura</span><span class="ff-data-value ff-data-open-ext" id="ff-ext-open-${exchange.slug}">–</span></li>
                    <li><span class="ff-data-label">Máximo</span><span class="ff-data-value ff-data-high-ext" id="ff-ext-high-${exchange.slug}">–</span></li>
                    <li><span class="ff-data-label">Mínimo</span><span class="ff-data-value ff-data-low-ext" id="ff-ext-low-${exchange.slug}">–</span></li>
                    <li><span class="ff-data-label">Volumen</span><span class="ff-data-value ff-data-vol-ext" id="ff-ext-vol-${exchange.slug}">–</span></li>
                </ul>
            `;

            row.append(card);
            row.append(dataBox);
            fragment.append(row);
        });
        grid.append(fragment);
    }

    async function applyExchangeRange(exchange, key, selectEl) {
        const chartId = `ff-exchange-${exchange.slug}-chart`;
        state.exchangeRanges[exchange.symbol] = key;
        if (selectEl) selectEl.classList.add('is-busy');
        try {
            const candles = await fetchExchangeSeries(exchange.symbol, key);
            renderExchangeSpark(chartId, candles, seriesIsUp(candles) ? EXCHANGE_CHART_COLORS.up : EXCHANGE_CHART_COLORS.down);
        } catch (error) {
            console.warn(`Periodo ${key} de ${exchange.symbol}:`, error.message);
        } finally {
            if (selectEl) selectEl.classList.remove('is-busy');
        }
    }

    function markExchangeSelection(symbol) {
        document.querySelectorAll('[data-exchange-symbol]').forEach(card => {
            const selected = card.dataset.exchangeSymbol === symbol;
            card.classList.toggle('is-selected', selected);
            card.setAttribute('aria-pressed', String(selected));
        });
    }

    function openExchangeInLab(symbol, trigger) {
        const symbolSelect = $('bmv-symbol');
        const matchingOption = symbolSelect && Array.from(symbolSelect.options).find(option => option.value === symbol);
        if (matchingOption) {
            symbolSelect.value = symbol;
            symbolSelect.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            const custom = $('bmv-custom');
            if (custom) custom.value = symbol;
            $('bmv-custom-btn')?.click();
        }
        markExchangeSelection(symbol);
        trigger?.blur();
        requestAnimationFrame(() => $('bvmx-panel')?.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            block: 'start',
        }));
    }

    window.setMiniChartType = function(type) {
        window.finMiniChartType = type;
        renderExchangeBoard();
    };

    function renderExchangeBoard() {
        ensureExchangeCards();
        let available = 0;
        exchangeConfig.forEach(exchange => {
            const card = document.querySelector(`[data-exchange-symbol="${exchange.symbol}"]`);
            const value = $(`ff-exchange-${exchange.slug}-value`);
            const delta = $(`ff-exchange-${exchange.slug}-delta`);
            const chartId = `ff-exchange-${exchange.slug}-chart`;
            const quote = state.quotes[exchange.symbol];
            if (!card || !value || !delta) return;
            card.classList.remove('is-loading', 'is-up', 'is-down', 'is-unavailable');
            if (!quote || !isNumeric(quote.price)) {
                if (state.quotesLoading) {
                    card.classList.add('is-loading');
                    value.textContent = 'Cargando\u2026';
                    delta.textContent = 'Consultando mercado';
                    return;
                }
                card.classList.add('is-unavailable');
                value.textContent = 'Sin datos';
                delta.textContent = 'Selecciona para reintentar';
                if (state.miniCharts[chartId]) {
                    state.miniCharts[chartId].destroy();
                    delete state.miniCharts[chartId];
                }
                return;
            }
            available += 1;
            const isUp = isNumeric(quote.change) && +quote.change >= 0;
            card.classList.add(isUp ? 'is-up' : 'is-down');
            value.textContent = formatNumber(quote.price, 2);
            delta.textContent = isNumeric(quote.change) ? `${isUp ? '\u2197' : '\u2198'} ${formatPercent(quote.change)}` : 'Sin cambio comparable';
            card.setAttribute('aria-label', `${exchange.name}: ${value.textContent}, ${delta.textContent}. Abrir en Finanzas y gr\u00e1ficas`);
            /* Respeta el periodo elegido en la tarjeta: renderExchangeBoard() se
               vuelve a llamar al cambiar de tipo de gráfica o al refrescar, y sin
               esto la selección se perdería. Mientras su serie no está en caché
               dibujamos la del encabezado (5 d) para no dejar el hueco vacío. */
            const rangeKey  = state.exchangeRanges[exchange.symbol] || EXCHANGE_RANGE_DEFAULT;
            const inFlight  = `${exchange.symbol}:${rangeKey}`;
            const ranged    = state.marketSeries.get(`ex:${exchange.symbol}:${rangeKey}`);
            const drawn     = ranged || quote.candles;
            renderExchangeSpark(chartId, drawn, seriesIsUp(drawn) ? EXCHANGE_CHART_COLORS.up : EXCHANGE_CHART_COLORS.down);
            if (!ranged && !state.exchangeRangeLoading.has(inFlight)) {
                state.exchangeRangeLoading.add(inFlight);
                fetchExchangeSeries(exchange.symbol, rangeKey)
                    .then(candles => renderExchangeSpark(chartId, candles, seriesIsUp(candles) ? EXCHANGE_CHART_COLORS.up : EXCHANGE_CHART_COLORS.down))
                    .catch(error => console.warn(`Periodo ${rangeKey} de ${exchange.symbol}:`, error.message))
                    .finally(() => state.exchangeRangeLoading.delete(inFlight));
            }
        });
        const update = $('ff-exchange-update');
        if (update) {
            const isLoading = state.quotesLoading && !available;
            update.classList.toggle('is-partial', !isLoading && available < exchangeConfig.length);
            update.textContent = isLoading
                ? 'Consultando mercados\u2026'
                : available
                    ? `${available} de ${exchangeConfig.length} mercados \u00b7 consulta ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Mercados no disponibles \u00b7 puedes reintentar';
        }
    }

    function sourceValue(sourceId, targetId, fallback = '—') {
        const source = $(sourceId), target = $(targetId);
        if (target) target.textContent = source?.textContent?.trim() || fallback;
    }

    function copyDelta(sourceId, targetId) {
        const source = $(sourceId), target = $(targetId);
        if (!target || !source) return;
        target.textContent = source.textContent?.trim() || 'Sesión';
        const text = target.textContent;
        target.classList.toggle('up', /(\+|▲|avance)/i.test(text));
        target.classList.toggle('down', /(-|▼|retroceso)/i.test(text));
    }

    function syncLegacyValues() {
        [['hub-sp500','ff-card-sp500'],['hub-sp500','ff-q-sp500'],['hub-nasdaq','ff-card-nasdaq'],['hub-nasdaq','ff-q-nasdaq'],['hub-ipc','ff-card-ipc'],['hub-ipc','ff-q-ipc'],['hub-vix','ff-card-vix'],['hub-tiie','ff-card-tiie'],['hub-tiie','ff-q-tiie'],['hub-fed','ff-card-fed']].forEach(pair => sourceValue(pair[0], pair[1]));
        copyDelta('hub-sp500-pct', 'ff-card-sp500-delta');
        copyDelta('hub-sp500-pct', 'ff-q-sp500-delta');
        copyDelta('hub-nasdaq-pct', 'ff-q-nasdaq-delta');
        copyDelta('hub-ipc-pct', 'ff-q-ipc-delta');
        if (typeof CENTRAL_BANKS !== 'undefined') {
            if ($('ff-card-fed')) $('ff-card-fed').textContent = formatYield(CENTRAL_BANKS.fed);
            if ($('ff-card-bce')) $('ff-card-bce').textContent = formatYield(CENTRAL_BANKS.bce);
        }
        if (typeof _rds !== 'undefined') {
            if ($('ff-card-infl')) $('ff-card-infl').textContent = formatYield(_rds.infl);
            if ($('ff-card-move')) $('ff-card-move').textContent = formatNumber(_rds.move, 1);
        }
    }

    function updateMarketCards() {
        const mapping = [
            ['^GSPC', 'ff-card-sp500', 'ff-card-sp500-delta', 'ff-q-sp500', 'ff-q-sp500-delta'],
            ['^NDX', 'ff-card-nasdaq', null, 'ff-q-nasdaq', 'ff-q-nasdaq-delta'],
            ['^MXX', 'ff-card-ipc', null, 'ff-q-ipc', 'ff-q-ipc-delta'],
            ['^VIX', 'ff-card-vix', null, null, null],
        ];
        mapping.forEach(([symbol, cardId, cardDeltaId, quoteId, quoteDeltaId]) => {
            const quote = state.quotes[symbol];
            if (!quote) return;
            const value = formatNumber(quote.price, quote.price >= 1000 ? 2 : 2);
            const delta = formatPercent(quote.change);
            if ($(cardId)) $(cardId).textContent = value;
            if ($(cardDeltaId)) { $(cardDeltaId).textContent = delta; $(cardDeltaId).className = quote.change >= 0 ? 'up' : 'down'; }
            if ($(quoteId)) $(quoteId).textContent = value;
            if ($(quoteDeltaId)) { $(quoteDeltaId).textContent = delta; $(quoteDeltaId).className = quote.change >= 0 ? 'up' : 'down'; }
        });
        const sp = state.quotes['^GSPC'];
        if (sp?.candles?.length) renderMiniChart('ff-spark-bolsa', sp.candles.map(item => +item.close), sp.change >= 0 ? colors.green : colors.red);
        renderExchangeBoard();
        updateModuleTiles();
    }

    /* Dato en vivo de cada recuadro de la portada. No consulta nada nuevo: lee el
       mismo `state` que ya alimenta el resto del apartado, así que si el dato aún
       no ha llegado la baldosa se queda con su guion. */
    function updateModuleTiles() {
        const put = (id, value) => { const el = $(id); if (el) el.textContent = value; };

        const sp = state.quotes['^GSPC'];
        if (sp && isNumeric(sp.price)) {
            put('ff-tile-bolsa', formatNumber(sp.price, 2));
            const d = $('ff-tile-bolsa-delta');
            if (d && isNumeric(sp.change)) {
                d.textContent = formatPercent(sp.change);
                d.className = +sp.change >= 0 ? 'is-up' : 'is-down';
            }
        }

        const tiieApi = state.mxRates?.tiie?.find(item => item.label === '28D')?.yield;
        const tiie = isNumeric(tiieApi) ? +tiieApi : state.bondData.find(item => item.key === 'mx')?.bonds?.[0]?.yield;
        if (isNumeric(tiie)) put('ff-tile-tasas', (+tiie).toFixed(2) + '%');

        const us10 = bond('us', '10Y')?.yield;
        if (isNumeric(us10)) put('ff-tile-rendimientos', (+us10).toFixed(2) + '%');

        if (Array.isArray(state.news) && state.news.length) put('ff-tile-noticias', String(state.news.length));
    }

    function updateBondCards() {
        const us3 = bond('us', '3M'), us5 = bond('us', '5Y'), us10 = bond('us', '10Y'), us30 = bond('us', '30Y'), eu10 = bond('eu', '10Y'), mx = state.bondData.find(item => item.key === 'mx')?.bonds?.[0];
        const tiieApi = state.mxRates?.tiie?.find(item => item.label === '28D')?.yield;
        const tiie = isNumeric(tiieApi) ? +tiieApi : mx?.yield;
        const fed = us3?.yield;
        const infl = isNumeric(state.inflation) ? +state.inflation : (typeof _rds !== 'undefined' && isNumeric(_rds.infl) ? +_rds.infl : null);
        const curve = isNumeric(us30?.yield) && isNumeric(us5?.yield) ? +us30.yield - +us5.yield : null;
        const premium = isNumeric(tiie) && isNumeric(us10?.yield) ? +tiie - +us10.yield : null;
        const real = isNumeric(tiie) && isNumeric(infl) ? +tiie - infl : null;
        const carry = isNumeric(tiie) && isNumeric(fed) ? +tiie - +fed : null;
        if ($('ff-card-tiie')) $('ff-card-tiie').textContent = formatYield(tiie);
        if ($('ff-q-tiie')) $('ff-q-tiie').textContent = formatYield(tiie);
        if ($('ff-card-fed')) $('ff-card-fed').textContent = formatYield(fed);
        if ($('ff-card-bce')) $('ff-card-bce').textContent = formatYield(eu10?.yield);
        if ($('ff-card-infl')) $('ff-card-infl').textContent = formatYield(state.inflation);
        [['ff-card-us5y',us5?.yield],['ff-card-us10y',us10?.yield],['ff-q-us10y',us10?.yield],['ff-card-us30y',us30?.yield]].forEach(([id,value]) => {
            if ($(id)) $(id).textContent = formatYield(value);
        });
        if ($('ff-card-cetes91')) $('ff-card-cetes91').textContent = formatYield(state.mxRates?.cetes?.find(item => item.label === '91D')?.yield);
        if ($('ff-card-premium')) $('ff-card-premium').textContent = Number.isFinite(premium) ? `${premium >= 0 ? '+' : ''}${premium.toFixed(2)} pp` : '—';
        $('ff-card-curve').textContent = Number.isFinite(curve) ? `${curve >= 0 ? '+' : ''}${curve.toFixed(2)} pp` : '—';
        $('ff-q-curve').textContent = $('ff-card-curve').textContent;
        $('ff-card-real').textContent = Number.isFinite(real) ? `${real >= 0 ? '+' : ''}${real.toFixed(2)}%` : '—';
        $('ff-card-carry').textContent = Number.isFinite(carry) ? `${carry >= 0 ? '+' : ''}${carry.toFixed(2)} pp` : '—';
        $('ff-card-curve-state').textContent = !Number.isFinite(curve) ? 'Esperando curva' : curve < 0 ? 'Curva invertida' : curve < .35 ? 'Curva plana' : 'Curva positiva';
        const daily = isNumeric(us10?.prev) ? +us10.yield - +us10.prev : null;
        const dailyText = Number.isFinite(daily) ? `${daily >= 0 ? '+' : ''}${daily.toFixed(2)} pp vs. anterior` : 'Rendimiento actual';
        if ($('ff-card-us10y-delta')) $('ff-card-us10y-delta').textContent = dailyText;
        if ($('ff-q-us10y-delta')) $('ff-q-us10y-delta').textContent = dailyText;
        renderMiniChart('ff-spark-tasas', getReferenceRateItems().map(item => item.yield), colors.cyan);
        renderMiniChart('ff-spark-bonos', [us5, us10, us30].map(item => +item?.yield).filter(Number.isFinite), colors.gold);
        renderMiniChart('ff-spark-rendimientos', (state.bondData.find(item => item.key === 'us')?.bonds || []).map(item => +item.yield).filter(Number.isFinite), colors.green);
        updateModuleTiles();   // TIIE y US 10 años de las baldosas de la portada
    }

    function updateControls() {
        const cfg = moduleConfig[state.module];
        $('ff-workspace-kicker').textContent = cfg.kicker;
        $('ff-workspace-title').textContent = cfg.title;
        $('ff-workspace-description').textContent = cfg.description;
        const indicator = $('ff-indicator'), compare = $('ff-compare');
        indicator.replaceChildren(...cfg.indicators.map(([value,label]) => new Option(label, value)));
        compare.replaceChildren(new Option('Sin comparación', ''), ...cfg.indicators.map(([value,label]) => new Option(label, value)));
        state.indicator = cfg.indicators[0][0];
        state.compare = '';
        compare.disabled = state.module !== 'bolsa';
        $('ff-date-from').disabled = state.module !== 'bolsa';
        $('ff-date-from').value = '';
        document.querySelectorAll('#ff-periods button').forEach(button => {
            button.disabled = state.module !== 'bolsa';
            button.title = state.module === 'bolsa' ? `Ver periodo ${button.textContent}` : 'La fuente disponible ofrece corte actual y lectura anterior';
        });
        document.querySelectorAll('.ff-module').forEach(card => {
            const active = card.dataset.module === state.module;
            card.classList.toggle('is-active', active);
            card.setAttribute('aria-current', active ? 'true' : 'false');
        });
        renderInsights();
        renderBreakdown();
        renderDetailTable();
        renderMainChart();
    }

    function selectModule(name, scroll = true) {
        if (!moduleConfig[name]) return;
        state.module = name;
        updateControls();
        if (scroll) $('ff-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const detailConfig = {
        bolsa: {
            eyebrow: 'Mercados globales',
            title: 'Bolsa',
            description: 'Índices, acciones, factores, amplitud y el laboratorio histórico multiactivo en una vista completa.',
            legacySection: 'mercados',
        },
        tasas: {
            eyebrow: 'Política monetaria y renta fija',
            title: 'Tasas y bonos',
            description: 'Tasas monetarias, CETES, bonos soberanos, comparativos por plazo y agenda de próximas decisiones.',
            legacySection: 'bonos',
        },
        rendimientos: {
            eyebrow: 'Renta fija · análisis de curva',
            title: 'Rendimientos',
            description: 'Niveles, cambios en puntos base, pendiente y lectura por vencimiento de curvas soberanas nominales y reales.',
            legacySection: 'bonos',
        },
        noticias: {
            eyebrow: 'Noticiero financiero',
            title: 'Daily News',
            description: 'Noticia principal, titulares de última hora, impacto y mercados relacionados.',
            legacySection: 'noticias',
        },
    };

    const detailClasses = Object.keys(detailConfig).map(name => `ff-detail-${name}`);

    function updateDetailNavigation(name) {
        const cfg = detailConfig[name];
        $('ff-detail-eyebrow').textContent = cfg.eyebrow;
        $('ff-detail-title').textContent = cfg.title;
        $('ff-detail-description').textContent = cfg.description;
        document.querySelectorAll('[data-detail-module]').forEach(button => {
            const active = button.dataset.detailModule === name;
            button.classList.toggle('is-active', active);
            if (active) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
    }

    function updateDetailStatus(name) {
        const copy = {
            bolsa: ['Bolsa · Renta variable global', 'Índices, factores, emisoras y gráfica histórica multiactivo.'],
            tasas: ['Tasas y bonos', 'Referencias monetarias, instrumentos de deuda, curvas soberanas y próximas decisiones.'],
            rendimientos: ['Monitor de rendimientos', 'Curvas soberanas, cambios por tramo, pendiente y dispersión entre vencimientos.'],
            noticias: ['Daily News', 'Última hora, noticia principal, impacto y mercados relacionados.'],
        }[name];
        if (!copy) return;
        if ($('fin-section-status-title')) $('fin-section-status-title').textContent = copy[0];
        if ($('fin-section-status-message')) $('fin-section-status-message').textContent = copy[1];
    }

    function setLegacyBondView(name) {
        const presentation = {
            tasas: {
                eyebrow: 'Monitor monetario y de renta fija',
                title: 'Tasas y bonos',
                copy: 'Tasas de referencia, instrumentos soberanos, diferenciales, plazos y señales del ciclo financiero.',
                chartTitle: 'Tasas y rendimientos soberanos',
            },
            rendimientos: {
                eyebrow: 'Monitor de curvas y diferenciales',
                title: 'Curvas y rendimientos',
                copy: 'Pendiente de la curva, primas por plazo, rendimiento por vencimiento y señales del ciclo financiero.',
                chartTitle: 'Estructura global de rendimientos',
            },
        }[name];
        const panel = $('bonds-panel');
        if (panel && presentation) {
            const eyebrow = panel.querySelector('.debt-pro-eyebrow');
            const title = panel.querySelector('.debt-pro-hero h2');
            const copy = panel.querySelector('.debt-pro-hero p');
            const chartTitle = panel.querySelector('.debt-curve-block .debt-block-head h3');
            if (eyebrow) eyebrow.innerHTML = `<i class="fas fa-landmark" aria-hidden="true"></i> ${presentation.eyebrow}`;
            if (title) title.textContent = presentation.title;
            if (copy) copy.textContent = presentation.copy;
            if (chartTitle) chartTitle.textContent = presentation.chartTitle;
        }
        requestAnimationFrame(() => {
            if (name === 'bonos' && typeof setBondChartType === 'function') {
                const button = document.querySelector('[data-bond-chart="ranking"]');
                setBondChartType('ranking', button);
            }
            if (name === 'tasas' && typeof setBondChartType === 'function') {
                const button = document.querySelector('[data-bond-chart="columns"]');
                setBondChartType('columns', button);
            }
            if (name === 'rendimientos' && typeof setBondChartType === 'function') {
                const button = document.querySelector('[data-bond-chart="line"]');
                setBondChartType('line', button);
            }
            window.dispatchEvent(new Event('resize'));
        });
    }

    function prepareDailyNewsLayout() {
        const host = $('ff-news-detail-host');
        const newsroom = document.querySelector('.ff-newsroom');
        if (!host || !newsroom) return;
        host.hidden = false;
        host.append(newsroom);
    }

    function restoreDailyNewsLayout() {
        const host = $('ff-news-detail-host');
        const anchor = $('ff-newsroom-anchor');
        const newsroom = host?.querySelector('.ff-newsroom');
        if (anchor && newsroom) anchor.after(newsroom);
        if (host) host.hidden = true;
    }

    function prepareBolsaTopLayout() {
        const host = $('ff-bolsa-chart-host');
        const board = $('ff-exchange-board');
        const chartPanel = $('bvmx-panel');
        const fxPanel = $('fx-section');
        const wlPanel = $('watchlist-panel');
        if (host && chartPanel) {
            host.hidden = false;
            if (fxPanel) host.append(fxPanel);
            if (wlPanel) host.append(wlPanel);
            host.append(chartPanel);
            chartPanel.style.display = '';
            if (fxPanel && fxPanel.querySelector('#fxStrip')?.children.length) fxPanel.style.display = '';
            if (wlPanel) wlPanel.style.display = '';
        }
        if (board) board.hidden = false;
        renderExchangeBoard();
        markExchangeSelection($('bmv-symbol')?.value || '');
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }

    function restoreBolsaTopLayout() {
        const host = $('ff-bolsa-chart-host');
        const board = $('ff-exchange-board');
        if (host) host.hidden = true;
        if (board) board.hidden = true;
    }

    function openDetail(name, options = {}) {
        const cfg = detailConfig[name];
        if (!cfg) return;

        const isNews = name === 'noticias';
        if (name !== 'bolsa') restoreBolsaTopLayout();
        if (!isNews) {
            restoreDailyNewsLayout();
            state.module = name;
            updateControls();
        } else {
            document.querySelectorAll('.ff-module').forEach(card => {
                const active = card.dataset.module === name;
                card.classList.toggle('is-active', active);
                card.setAttribute('aria-current', active ? 'true' : 'false');
            });
        }
        document.body.classList.add('ff-detail-mode');
        document.body.classList.remove(...detailClasses);
        document.body.classList.add(`ff-detail-${name}`);
        updateDetailNavigation(name);

        const navigation = $('ff-detail-navigation');
        if (navigation) navigation.hidden = false;
        const supplement = $('ff-detail-supplement');
        if (isNews) {
            if (supplement) supplement.hidden = true;
        } else if (name === 'rendimientos') {
            if (supplement) supplement.hidden = true;
            renderReturnsPanel();
        } else {
            renderSupplement(name);
        }

        if (typeof finTab === 'function') {
            const legacyButton = document.querySelector(`.fin-tab-card[data-tab="${cfg.legacySection}"]`);
            finTab(cfg.legacySection, legacyButton, true, true);
        }
        if (name === 'bolsa') prepareBolsaTopLayout();
        if (isNews) {
            const legacyNews = $('news-pro-panel');
            if (legacyNews) legacyNews.style.display = 'none';
            const status = $('fin-section-status');
            if (status) status.hidden = true;
            prepareDailyNewsLayout();
            

            
            updateDetailStatus(name);
            loadNews();
        }
        updateDetailStatus(name);
        if (!isNews && typeof ensureFinanceSection === 'function') {
            ensureFinanceSection(cfg.legacySection, false).finally(() => {
                if (document.body.classList.contains(`ff-detail-${name}`)) updateDetailStatus(name);
            });
        }
        if (cfg.legacySection === 'bonos') setLegacyBondView(name);

        if (name === 'bolsa' && options.symbol) {
            requestAnimationFrame(() => {
                const symbolSelect = $('bmv-symbol');
                if (!symbolSelect || !Array.from(symbolSelect.options).some(option => option.value === options.symbol)) return;
                symbolSelect.value = options.symbol;
                symbolSelect.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }

        requestAnimationFrame(() => navigation?.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            block: 'start',
        }));
    }

    function closeDetail() {
        document.body.classList.remove('ff-detail-mode', ...detailClasses);
        restoreBolsaTopLayout();
        restoreDailyNewsLayout();
        const navigation = $('ff-detail-navigation');
        if (navigation) navigation.hidden = true;
        const supplement = $('ff-detail-supplement');
        if (supplement) supplement.hidden = true;
        if (typeof finTab === 'function') {
            const overviewButton = document.querySelector('.fin-tab-card[data-tab="general"]');
            finTab('general', overviewButton, true, true);
        }
        requestAnimationFrame(() => $('favro-finance')?.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            block: 'start',
        }));
    }

    function renderSupplementKpis(items) {
        const host = $('ff-supplement-kpis');
        if (!host) return;
        host.replaceChildren(...items.map(item => {
            const card = document.createElement('div');
            card.className = 'ff-supplement-kpi';
            const label = document.createElement('span');
            const value = document.createElement('strong');
            const note = document.createElement('em');
            label.textContent = item.label;
            value.textContent = item.value;
            note.textContent = item.note || '';
            if (item.tone) value.className = item.tone;
            card.append(label, value, note);
            return card;
        }));
    }

    function renderSupplementTable(headers, rows) {
        const head = $('ff-supplement-table-head');
        const body = $('ff-supplement-table-body');
        if (!head || !body) return;
        head.replaceChildren(...headers.map(label => {
            const th = document.createElement('th');
            th.textContent = label;
            return th;
        }));
        if (!rows.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = headers.length;
            td.className = 'ff-supplement-empty';
            td.textContent = 'No hay datos verificados disponibles para este bloque.';
            tr.append(td);
            body.replaceChildren(tr);
            return;
        }
        body.replaceChildren(...rows.map(row => {
            const tr = document.createElement('tr');
            row.forEach(value => {
                const td = document.createElement('td');
                td.textContent = value == null || value === '' ? '—' : String(value);
                tr.append(td);
            });
            return tr;
        }));
    }

    let lastSuppChartData = null;

    window.setSuppChartType = function(type) {
        if (!lastSuppChartData) return;
        state.suppChartType = type;
        renderSupplementChart(type, lastSuppChartData.labels, lastSuppChartData.datasets, lastSuppChartData.axisLabel);
    };

    function renderSupplementChart(type, labels, datasets, axisLabel) {
        lastSuppChartData = { labels, datasets, axisLabel };
        
        let actualType = state.suppChartType || type;
        let isHorizontal = actualType === 'horizontalBar';
        if (isHorizontal) actualType = 'bar';
        let isPie = actualType === 'doughnut';

        const canvas = $('ff-supplement-chart');
        if (!canvas || typeof Chart === 'undefined') return;
        if (state.supplementChart) state.supplementChart.destroy();
        
        const options = chartDefaults();
        options.animation.duration = 260;
        options.plugins.legend.display = isPie ? true : datasets.length > 1;
        options.plugins.legend.position = isPie ? 'right' : 'bottom';
        options.maintainAspectRatio = false;
        
        if (isPie) {
            options.scales.x = { display: false };
            options.scales.y = { display: false };
            
            datasets.forEach(d => {
                if (Array.isArray(d.data)) {
                    d.backgroundColor = d.data.map((_, i) => `hsl(${(i * 137.5) % 360}, 70%, 55%)`);
                    d.borderColor = '#ffffff';
                    d.borderWidth = 2;
                }
            });
        } else if (isHorizontal) {
            options.indexAxis = 'y';
            options.scales.x = { position: 'bottom', title: { display: true, text: axisLabel, color: '#687887', font: { size: 9 } } };
            options.scales.y = { position: 'left' };
        } else {
            options.indexAxis = 'x';
            options.scales.x = { position: 'bottom' };
            options.scales.y = { position: 'left', title: { display: true, text: axisLabel, color: '#687887', font: { size: 9 } } };
        }

        if (actualType === 'line') {
            datasets.forEach(d => {
                d.fill = true;
                d.tension = 0.35;
                if (!Array.isArray(d.backgroundColor)) {
                    d.backgroundColor = 'rgba(14, 165, 233, 0.15)';
                    d.borderColor = '#0ea5e9';
                } else {
                    d.backgroundColor = 'rgba(16, 185, 129, 0.15)';
                    d.borderColor = '#10b981';
                }
            });
        }
        
        if (type === 'scatter') {
            options.scales.x = {
                type: 'linear',
                min: 0,
                grid: { color: colors.grid },
                title: { display: true, text: 'Plazo aproximado (años)', color: '#687887', font: { size: 9 } },
                ticks: { color: '#7b8995', font: { size: 9 } },
            };
            options.interaction = { intersect: false, mode: 'nearest' };
        }
        
        state.supplementChart = new Chart(canvas, { type: actualType, data: { labels, datasets }, options });
    }

    function maturityInYears(value) {
        const text = String(value || '').toUpperCase();
        const amount = parseFloat(text.replace(',', '.'));
        if (!Number.isFinite(amount)) return null;
        if (text.includes('D')) return amount / 365;
        if (text.includes('M')) return amount / 12;
        return amount;
    }

    function setSupplementCopy(kicker, title, description, source, chartKicker, chartTitle, unit, tableTitle, note) {
        $('ff-supplement-kicker').textContent = kicker;
        $('ff-supplement-title').textContent = title;
        $('ff-supplement-description').textContent = description;
        $('ff-supplement-source').textContent = source;
        $('ff-supplement-chart-kicker').textContent = chartKicker;
        $('ff-supplement-chart-title').textContent = chartTitle;
        $('ff-supplement-chart-unit').textContent = unit;
        $('ff-supplement-table-title').textContent = tableTitle;
        $('ff-supplement-note').querySelector('p').textContent = note;
    }

    /* Contador de peticiones: si el usuario cambia de bolsa mientras la anterior
       sigue en vuelo, se descarta la respuesta vieja y no pisa a la nueva. */
    let _supplementReq = 0;

    async function renderBolsaSupplement() {
        const key = state.supplementMarket || 'mx';
        const cfg = SUPPLEMENT_MARKETS[key] || SUPPLEMENT_MARKETS.mx;
        const reqId = ++_supplementReq;
        const select = $('ff-supplement-market');
        if (select) select.disabled = true;

        setSupplementCopy(
            'Cobertura bursátil',
            'Lectura verificable de Bolsa',
            `Precios y variación de la sesión de las emisoras disponibles de ${cfg.label}.`,
            `${cfg.market} · consultando…`,
            'Variación diaria',
            `Emisoras · ${cfg.label}`,
            '% sesión',
            'Precio y movimiento',
            'La plataforma solo muestra los campos que entrega la fuente; los ausentes no se estiman.',
        );

        let rows = [];
        try {
            rows = await loadSupplementMarket(key);
        } catch (error) {
            console.warn('Suplemento de bolsa:', key, error.message);
        }
        if (reqId !== _supplementReq) return;
        if (select) select.disabled = false;

        if (!rows.length) {
            setSupplementCopy(
                'Cobertura bursátil',
                'Lectura verificable de Bolsa',
                `No hay cotizaciones disponibles ahora mismo para ${cfg.label}.`,
                `${cfg.market} · sin datos`,
                'Variación diaria',
                `Emisoras · ${cfg.label}`,
                '% sesión',
                'Precio y movimiento',
                'La fuente no devolvió cotizaciones para esta bolsa. Prueba con otra o vuelve a intentarlo más tarde.',
            );
            renderSupplementKpis([{ label: 'Emisoras', value: '—', note: 'Sin lectura disponible' }]);
            renderSupplementTable(['Emisora', 'Precio', 'Variación', 'Lectura'], []);
            return;
        }

        const ordered  = [...rows].sort((a, b) => b.changePct - a.changePct);
        const advances = rows.filter(item => item.changePct > 0).length;
        const declines = rows.filter(item => item.changePct < 0).length;
        const range    = Math.max(...rows.map(i => i.changePct)) - Math.min(...rows.map(i => i.changePct));
        const leader   = ordered[0];
        const fecha    = key === 'mx' && state.bmvTimestamp ? ` · ${safeDate(state.bmvTimestamp)}` : '';

        setSupplementCopy(
            'Cobertura bursátil',
            'Lectura verificable de Bolsa',
            `Precios y variación de la sesión de las emisoras disponibles de ${cfg.label}.`,
            `${cfg.market}${fecha}`,
            'Variación diaria',
            `Emisoras · ${cfg.label}`,
            '% sesión',
            'Precio y movimiento',
            'La plataforma solo muestra los campos que entrega la fuente; los ausentes no se estiman.',
        );
        renderSupplementKpis([
            { label: 'Emisoras', value: `${rows.length}`, note: `Disponibles en ${cfg.label}` },
            { label: 'Avances', value: String(advances), note: 'Variación positiva', tone: advances ? 'ff-positive-text' : '' },
            { label: 'Descensos', value: String(declines), note: 'Variación negativa', tone: declines ? 'ff-negative-text' : '' },
            { label: 'Liderazgo', value: leader ? formatPercent(leader.changePct) : '—', note: leader?.name || 'Sin lectura' },
        ]);
        renderSupplementChart('bar', rows.map(item => item.symbol), [{
            label: 'Variación diaria',
            data: rows.map(item => item.changePct),
            backgroundColor: rows.map(item => item.changePct >= 0 ? colors.green : colors.red),
            borderRadius: 5,
        }], 'Variación %');
        renderSupplementTable(
            ['Emisora', `Precio ${cfg.currency}`, 'Variación', 'Lectura'],
            ordered.map(item => [item.name, formatNumber(item.price, 2), formatPercent(item.changePct), item.changePct >= 0 ? 'Alza' : 'Baja']),
        );
        if (Number.isFinite(range)) $('ff-supplement-kpis')?.lastElementChild?.querySelector('em')?.setAttribute('title', `Rango de movimientos: ${range.toFixed(2)} pp`);
    }

    function renderSupplement(name) {
        const section = $('ff-detail-supplement');
        if (!section || !detailConfig[name]) return;
        section.hidden = false;

        const setCopy = setSupplementCopy;

        /* El selector de bolsa solo tiene sentido en el módulo Bolsa. */
        const marketWrap = $('ff-supplement-market-wrap');
        if (marketWrap) marketWrap.hidden = name !== 'bolsa';

        if (name === 'bolsa') {
            renderBolsaSupplement();
            return;
        }

        if (name === 'tasas') {
            const rates = getReferenceRateItems();
            const mx = rates.find(item => item.key === 'mx');
            const us10 = bond('us', '10Y');
            const cetes91 = state.mxRates?.cetes?.find(item => item.label === '91D');
            const instruments = getBondInstrumentItems();
            setCopy(
                'Política monetaria y deuda',
                'Mapa conjunto de tasas y bonos',
                'Integra tasas de referencia, condiciones monetarias, CETES, UDIBONOS y bonos soberanos sin mezclar sus definiciones.',
                `${rates.length} tasas · ${instruments.length} instrumentos`,
                'Nivel actual',
                'Tasas y referencias monetarias',
                '% anual',
                'Tasas e instrumentos disponibles',
                `Treasury 3M es un proxy de mercado, no la tasa oficial de la Fed. Zona Euro 10Y es un bono soberano, no tasa del BCE. ${isNumeric(state.inflation) ? `Inflación México disponible: ${formatYield(state.inflation)}.` : 'La inflación de México no está disponible; no se calcula una tasa real con un supuesto.'} Los datos indicativos no equivalen a cotizaciones en vivo.`,
            );
            renderSupplementKpis([
                { label: 'TIIE 28D', value: formatYield(mx?.yield), note: 'Interbancaria México' },
                { label: 'Treasury 10Y', value: formatYield(us10?.yield), note: 'Bono soberano EUA' },
                { label: 'CETES 91D', value: formatYield(cetes91?.yield), note: 'Gobierno de México' },
                { label: 'Instrumentos', value: String(instruments.length), note: 'Nominales y reales' },
            ]);
            renderSupplementChart('bar', rates.map(item => item.key.toUpperCase()), [{
                label: 'Nivel actual',
                data: rates.map(item => item.yield),
                backgroundColor: rates.map(item => item.type.includes('Política') ? colors.blue : item.key === 'mx' ? colors.green : colors.cyan),
                borderRadius: 5,
            }], 'Tasa / rendimiento %');
            renderSupplementTable(
                ['Tasa o instrumento', 'Rendimiento', 'Cambio', 'Tipo'],
                [
                    ...rates.filter(item => !['us','eu'].includes(item.key)).map(item => [
                        `${item.country} · ${item.label}`,
                        formatYield(item.yield),
                        isNumeric(item.prev) ? `${(item.yield - item.prev) * 100 >= 0 ? '+' : ''}${((item.yield - item.prev) * 100).toFixed(1)} pb` : '—',
                        item.type,
                    ]),
                    ...instruments.map(item => [
                        item.label,
                        formatYield(item.yield),
                        isNumeric(item.prev) ? `${(item.yield - item.prev) * 100 >= 0 ? '+' : ''}${((item.yield - item.prev) * 100).toFixed(1)} pb` : '—',
                        item.type,
                    ]),
                ],
            );
            return;
        }

        const instruments = getBondInstrumentItems();
        if (name === 'bonos') {
            const nominal = instruments.filter(item => item.type.includes('Nominal') || item.type.includes('nominal'));
            const real = instruments.filter(item => item.type === 'Real');
            const sources = new Set(instruments.map(item => item.source));
            setCopy(
                'Universo disponible',
                'Instrumentos de deuda con datos comprobables',
                'Treasuries, referencia soberana de Zona Euro, CETES y UDIBONOS organizados por tipo y plazo.',
                state.mxRates?.date ? `Mercado + Banxico · ${state.mxRates.date}` : 'Mercado soberano + Banxico',
                'Rendimiento observado',
                'Comparación de instrumentos disponibles',
                '% anual',
                'Instrumento, plazo y tipo',
                'Las fuentes conectadas no entregan precio limpio, cupón, duración, valor nominal ni calificación para todos los instrumentos. Esos campos no se estiman. El monitor ampliado identifica como REFERENCIA los datos indicativos y como DIRECTO los datos conectados.',
            );
            renderSupplementKpis([
                { label: 'Instrumentos', value: String(instruments.length), note: 'Con rendimiento disponible' },
                { label: 'Nominales', value: String(nominal.length), note: 'Tasa nominal' },
                { label: 'Reales', value: String(real.length), note: 'Protección inflacionaria' },
                { label: 'Fuentes', value: String(sources.size), note: 'Procedencias identificadas' },
            ]);
            renderSupplementChart('bar', instruments.slice(0, 12).map(item => item.label), [{
                label: 'Rendimiento',
                data: instruments.slice(0, 12).map(item => item.yield),
                backgroundColor: instruments.slice(0, 12).map(item => item.type === 'Real' ? colors.gold : item.group === 'CETES' ? colors.green : colors.blue),
                borderRadius: 5,
            }], 'Rendimiento %');
            renderSupplementTable(
                ['Instrumento', 'Plazo', 'Rendimiento', 'Tipo'],
                instruments.map(item => [item.label, item.maturity, formatYield(item.yield), item.type]),
            );
            return;
        }

        const usCurve = (state.bondData.find(item => item.key === 'us')?.bonds || [])
            .filter(item => isNumeric(item.yield))
            .map(item => ({ x: maturityInYears(item.maturity), y: +item.yield, label: item.maturity }))
            .filter(item => Number.isFinite(item.x));
        const mxItems = getMxRateItems();
        const cetesCurve = mxItems.filter(item => item.group === 'CETES').map(item => ({ x: maturityInYears(item.label), y: item.yield, label: item.label })).filter(item => Number.isFinite(item.x));
        const udiCurve = mxItems.filter(item => item.group === 'UDIBONOS').map(item => ({ x: maturityInYears(item.label), y: item.yield, label: item.label })).filter(item => Number.isFinite(item.x));
        const spreadOf = points => points.length > 1 ? points.at(-1).y - points[0].y : null;
        const usSpread = spreadOf(usCurve);
        const cetesSpread = spreadOf(cetesCurve);
        const udiSpread = spreadOf(udiCurve);
        setCopy(
            'Curvas por naturaleza',
            'Rendimientos nominales y reales',
            'Compara la forma de la curva estadounidense, CETES nominales y UDIBONOS reales sin tratarlos como instrumentos equivalentes.',
            state.mxRates?.date ? `US Treasury + Banxico · ${state.mxRates.date}` : 'US Treasury + Banxico',
            'Estructura por plazo',
            'Curvas disponibles',
            '% anual',
            'Tramos nominales y reales',
            'Los rendimientos de UDIBONOS son reales; Treasury y CETES son nominales. La diferencia no es una prima directa. Las series indicativas del monitor ampliado deben leerse como referencia, no como cotización en vivo.',
        );
        renderSupplementKpis([
            { label: 'US largo–corto', value: Number.isFinite(usSpread) ? `${usSpread >= 0 ? '+' : ''}${usSpread.toFixed(2)} pp` : '—', note: '30Y menos 3M' },
            { label: 'CETES 364–28D', value: Number.isFinite(cetesSpread) ? `${cetesSpread >= 0 ? '+' : ''}${cetesSpread.toFixed(2)} pp` : '—', note: 'Curva nominal México' },
            { label: 'UDIBONOS 30–3A', value: Number.isFinite(udiSpread) ? `${udiSpread >= 0 ? '+' : ''}${udiSpread.toFixed(2)} pp` : '—', note: 'Curva real México' },
            { label: 'Curvas disponibles', value: String([usCurve, cetesCurve, udiCurve].filter(curve => curve.length > 1).length), note: 'Con dos o más tramos' },
        ]);
        renderSupplementChart('scatter', [], [
            { label: 'US Treasury nominal', data: usCurve, showLine: true, borderColor: colors.blue, backgroundColor: colors.blue, pointRadius: 4, tension: .22 },
            { label: 'CETES nominal', data: cetesCurve, showLine: true, borderColor: colors.green, backgroundColor: colors.green, pointRadius: 4, tension: .22 },
            { label: 'UDIBONOS real', data: udiCurve, showLine: true, borderColor: colors.gold, backgroundColor: colors.gold, pointRadius: 4, tension: .22 },
        ].filter(dataset => dataset.data.length), 'Rendimiento %');
        renderSupplementTable(
            ['Curva', 'Plazo', 'Rendimiento', 'Naturaleza'],
            [
                ...usCurve.map(item => ['US Treasury', item.label, formatYield(item.y), 'Nominal']),
                ...cetesCurve.map(item => ['CETES', item.label, formatYield(item.y), 'Nominal']),
                ...udiCurve.map(item => ['UDIBONOS', item.label, formatYield(item.y), 'Real']),
            ],
        );
    }

    function tableData() {
        if (state.module === 'bolsa') {
            const indexNames = { '^GSPC': 'S&P 500', '^NDX': 'Nasdaq 100', '^MXX': 'IPC BMV', '^VIX': 'VIX' };
            const indexes = Object.values(state.quotes).filter(item => indexNames[item.symbol]).map(item => ({ name: indexNames[item.symbol], value: item.price, displayValue: formatNumber(item.price, 2), change: item.change, reading: item.symbol === '^VIX' ? 'Volatilidad' : item.symbol === '^MXX' ? 'México' : 'Estados Unidos' }));
            const stocks = state.bmvData.filter(item => item.type === 'stock').map(item => ({ name: item.name || item.symbol, value: +item.price, displayValue: formatNumber(item.price, 2), change: +item.change_pct, reading: `BMV · ${item.symbol}` }));
            return [...indexes, ...stocks];
        }
        if (state.module === 'tasas') {
            return getReferenceRateItems().map(rate => ({
                name: rate.country,
                value: rate.yield,
                displayValue: formatYield(rate.yield),
                change: isNumeric(rate.prev) ? rate.yield - rate.prev : null,
                reading: `${rate.label} · ${rate.type}`,
            }));
        }
        if (state.module === 'bonos') {
            return state.bondData.flatMap(item => (item.bonds || []).map(rate => ({ name: `${item.country} · ${rate.label}`, value: +rate.yield, displayValue: formatYield(rate.yield), change: isNumeric(rate.prev) ? +rate.yield - +rate.prev : null, reading: item.source || 'Soberano' })));
        }
        return (state.bondData.find(item => item.key === 'us')?.bonds || []).map(rate => ({ name: `Treasury ${rate.label}`, value: +rate.yield, displayValue: formatYield(rate.yield), change: isNumeric(rate.prev) ? +rate.yield - +rate.prev : null, reading: `Plazo ${rate.maturity}` }));
    }

    function renderDetailTable() {
        state.detailRows = tableData();
        const filter = $('ff-table-filter')?.value || 'all';
        const search = ($('ff-table-search')?.value || '').trim().toLowerCase();
        const rows = state.detailRows.filter(row => (filter === 'all' || (filter === 'positive' ? row.change >= 0 : row.change < 0)) && (!search || `${row.name} ${row.reading}`.toLowerCase().includes(search)));
        rows.sort((a,b) => {
            const key = state.sort.key;
            if (key === 'name') return a.name.localeCompare(b.name) * state.sort.direction;
            return ((Number.isFinite(a[key]) ? a[key] : -Infinity) - (Number.isFinite(b[key]) ? b[key] : -Infinity)) * state.sort.direction;
        });
        const tbody = $('ff-detail-rows');
        const headerLabels = {
            bolsa: ['Activo', 'Precio / valor', 'Variación', 'Mercado'],
            tasas: ['Institución', 'Tasa', 'Cambio', 'Referencia'],
            bonos: ['Bono / emisor', 'Rendimiento', 'Cambio', 'Fuente'],
            rendimientos: ['Tramo', 'Rendimiento', 'Cambio', 'Vencimiento'],
        }[state.module];
        const head = $('ff-detail-head');
        if (head) {
            const cells = [...head.children];
            headerLabels.forEach((label, index) => {
                const button = cells[index]?.querySelector('button');
                if (button) button.childNodes[0].textContent = `${label} `;
                else if (cells[index]) cells[index].textContent = label;
            });
        }
        if (!rows.length) {
            tbody.innerHTML = '<tr class="ff-empty-row"><td colspan="4">No hay datos para este filtro.</td></tr>';
            return;
        }
        tbody.replaceChildren(...rows.map(row => {
            const tr = document.createElement('tr');
            const direction = Number.isFinite(row.change) ? (row.change >= 0 ? 'ff-positive-text' : 'ff-negative-text') : 'ff-neutral-text';
            tr.innerHTML = `<td></td><td></td><td class="${direction}"></td><td></td>`;
            tr.children[0].textContent = row.name;
            tr.children[1].textContent = row.displayValue;
            tr.children[2].textContent = Number.isFinite(row.change) ? `${row.change >= 0 ? '+' : ''}${row.change.toFixed(2)}${state.module === 'bolsa' ? '%' : ' pp'}` : '—';
            tr.children[3].textContent = row.reading;
            return tr;
        }));
    }

    function renderBreakdown() {
        if (typeof Chart === 'undefined') return;
        const rows = tableData().filter(row => Number.isFinite(row.change));
        const ordered = rows.sort((a,b) => state.breakdownDescending ? b.change - a.change : a.change - b.change).slice(0, 8);
        $('ff-breakdown-title').textContent = { bolsa: 'Índices principales', tasas: 'Cambios en tasas', bonos: 'Movimientos de bonos', rendimientos: 'Cambios por plazo' }[state.module];
        $('ff-table-title').textContent = { bolsa: 'Movimientos relevantes', tasas: 'Referencias monetarias', bonos: 'Universo de bonos', rendimientos: 'Tramos de la curva' }[state.module];
        if (state.breakdownChart) state.breakdownChart.destroy();
        state.breakdownChart = new Chart($('ff-breakdown-chart'), {
            type: 'bar',
            data: { labels: ordered.map(row => row.name), datasets: [{ data: ordered.map(row => row.change), backgroundColor: ordered.map(row => row.change >= 0 ? colors.green : colors.red), borderRadius: 5, barThickness: 14 }] },
            options: { ...chartDefaults(), indexAxis: 'y', plugins: { legend: { display: false }, tooltip: chartDefaults().plugins.tooltip }, scales: { x: { grid: { color: colors.grid }, ticks: { color: '#7b8995', font: { size: 9 } } }, y: { grid: { display: false }, ticks: { color: '#526471', font: { family: 'Inter', size: 9 } } } } }
        });
        renderContextChart();
    }

    function renderContextChart() {
        if (typeof Chart === 'undefined' || !$('ff-context-chart')) return;
        let type = 'bar', labels = [], datasets = [], title = '', kicker = '', badge = '', note = '';
        if (state.module === 'bolsa') {
            const stocks = state.bmvData.filter(item => item.type === 'stock');
            labels = stocks.map(item => item.symbol);
            datasets = [{ label: 'Variación diaria', data: stocks.map(item => +item.change_pct), backgroundColor: stocks.map(item => +item.change_pct >= 0 ? colors.green : colors.red), borderRadius: 5 }];
            kicker = 'Emisoras'; title = 'Pulso de acciones mexicanas'; badge = 'Sesión'; note = 'Variación diaria de las emisoras disponibles; verde indica avance y rojo retroceso.';
        } else if (state.module === 'tasas') {
            const rates = getReferenceRateItems();
            labels = rates.map(item => item.key.toUpperCase());
            datasets = [{ label: 'Referencia actual', data: rates.map(item => item.yield), backgroundColor: `${colors.cyan}cc`, borderRadius: 5 }];
            if (isNumeric(state.inflation)) datasets.push({ label: 'Inflación México', data: rates.map(() => +state.inflation), type: 'line', borderColor: colors.gold, backgroundColor: colors.gold, borderWidth: 2, pointRadius: 0 });
            kicker = 'Comparación global'; title = 'Referencias monetarias y soberanas'; badge = 'Actual'; note = 'Cada dato identifica si corresponde a política monetaria, tasa interbancaria o rendimiento soberano.';
        } else if (state.module === 'bonos') {
            const us = state.bondData.find(item => item.key === 'us')?.bonds || [];
            const durations = { '3M': .25, '5Y': 5, '10Y': 10, '30Y': 30 };
            type = 'scatter';
            datasets = [{ label: 'Treasuries', data: us.map(item => ({ x: durations[item.maturity] || 0, y: +item.yield })), backgroundColor: colors.blue, pointRadius: 6, pointHoverRadius: 8 }];
            kicker = 'Riesgo de plazo'; title = 'Plazo frente a rendimiento'; badge = 'Treasury'; note = 'A mayor plazo, suele aumentar la sensibilidad del precio ante movimientos de tasas.';
        } else {
            const us = state.bondData.find(item => item.key === 'us')?.bonds || [];
            labels = us.map(item => item.maturity);
            datasets = [{ label: 'Diferencia vs lectura anterior', data: us.map(item => isNumeric(item.prev) ? +item.yield - +item.prev : 0), backgroundColor: us.map(item => isNumeric(item.prev) && (+item.yield - +item.prev) >= 0 ? colors.red : colors.green), borderRadius: 5 }];
            kicker = 'Movimiento de curva'; title = 'Cambio por tramo'; badge = 'Puntos porcentuales'; note = 'Un aumento del rendimiento suele implicar presión a la baja en el precio del bono.';
        }
        $('ff-context-kicker').textContent = kicker;
        $('ff-context-title').textContent = title;
        $('ff-context-badge').textContent = badge;
        $('ff-context-note').textContent = note;
        if (state.contextChart) state.contextChart.destroy();
        const options = chartDefaults();
        options.plugins.legend.labels.boxWidth = 6;
        if (type === 'scatter') {
            options.scales.x.title = { display: true, text: 'Plazo (años)', color: '#687887', font: { size: 9 } };
            options.scales.y.title = { display: true, text: 'Rendimiento %', color: '#687887', font: { size: 9 } };
        }
        state.contextChart = new Chart($('ff-context-chart'), { type, data: { labels, datasets }, options });
    }

    function renderInsights() {
        const host = $('ff-insights');
        host.replaceChildren(...moduleConfig[state.module].insights.map(([title,copy,tone]) => {
            const div = document.createElement('div');
            div.className = `ff-insight ${tone || ''}`;
            const strong = document.createElement('strong'), p = document.createElement('p');
            strong.textContent = title; p.textContent = copy; div.append(strong,p);
            return div;
        }));
        updateAutomaticConclusion();
    }

    function updateAutomaticConclusion() {
        let title = 'Lectura neutral mientras se completan los datos';
        let text = 'La plataforma conserva los últimos datos disponibles y evita convertir valores ausentes en señales.';
        let risk = 'Sin clasificar';
        if (state.module === 'bolsa') {
            const changes = Object.values(state.quotes).filter(item => item.symbol !== '^VIX' && Number.isFinite(item.change)).map(item => item.change);
            const average = changes.length ? changes.reduce((sum,value) => sum + value, 0) / changes.length : null;
            const vix = state.quotes['^VIX']?.price;
            if (Number.isFinite(average)) {
                title = average >= 0 ? 'Sesgo favorable, pendiente de amplitud' : 'Sesgo defensivo en los índices';
                text = `El promedio de los índices seguidos es ${formatPercent(average)}. ${Number.isFinite(vix) ? `El VIX se ubica en ${formatNumber(vix,1)}, por lo que la volatilidad debe leerse junto con la dirección.` : 'La volatilidad aún no está disponible.'}`;
                risk = Number.isFinite(vix) ? (vix < 15 ? 'Bajo' : vix < 25 ? 'Moderado' : 'Elevado') : 'Moderado';
            }
        } else if (state.module === 'tasas') {
            const mx = state.bondData.find(item => item.key === 'mx')?.bonds?.[0]?.yield;
            const us = state.bondData.find(item => item.key === 'us')?.bonds?.[0]?.yield;
            const real = isNumeric(mx) && isNumeric(state.inflation) ? +mx - +state.inflation : null;
            if (Number.isFinite(real)) {
                title = real > 2 ? 'Política monetaria todavía restrictiva' : 'Postura monetaria en normalización';
                text = `La tasa real aproximada es ${real >= 0 ? '+' : ''}${real.toFixed(2)}%. Inflación, actividad y comunicación de Banxico siguen siendo los catalizadores principales.`;
                risk = real > 4 ? 'Restrictivo' : 'Moderado';
            } else if (isNumeric(mx) && isNumeric(us)) {
                const spread = +mx - +us;
                title = spread > 2 ? 'México conserva una prima de tasa relevante' : 'Diferencial de tasas más contenido';
                text = `La referencia mexicana supera al tramo corto estadounidense en ${spread >= 0 ? '+' : ''}${spread.toFixed(2)} pp. Falta la lectura de inflación para calcular una tasa real confiable.`;
                risk = spread > 4 ? 'Restrictivo' : 'Moderado';
            }
        } else {
            const us5 = bond('us','5Y'), us30 = bond('us','30Y');
            const curve = isNumeric(us30?.yield) && isNumeric(us5?.yield) ? +us30.yield - +us5.yield : null;
            if (Number.isFinite(curve)) {
                title = curve < 0 ? 'La curva mantiene una señal defensiva' : curve < .35 ? 'Curva contenida, sin gran prima por plazo' : 'Curva positiva por plazo';
                text = `La pendiente 30Y–5Y es ${curve >= 0 ? '+' : ''}${curve.toFixed(2)} pp. Conviene revisar inflación, decisiones de la Fed y volatilidad de bonos antes de interpretar la señal.`;
                risk = curve < 0 ? 'Elevado' : curve < .35 ? 'Moderado' : 'Controlado';
            }
        }
        $('ff-conclusion-title').textContent = title;
        $('ff-conclusion-text').textContent = text;
        $('ff-risk-level').textContent = risk;
    }

    function classifyNews(item) {
        // Respeta la categoría asignada por el editor Favro (Gemini); si no viene,
        // cae al heurístico por texto.
        if (['rates', 'bonds', 'markets', 'fx', 'commodities'].includes(item.category)) return item.category;
        const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();
        if (/fed|banxico|rate|tasa|inflaci/.test(text)) return 'rates';
        if (/bond|bono|treasury|yield|debt/.test(text)) return 'bonds';
        if (/divisa|forex|dólar|dolar|euro|yen|peso|currency|exchange rate/.test(text)) return 'fx';
        if (/petróleo|petroleo|oil|gold|oro|cobre|commodity|commodit|materia prima/.test(text)) return 'commodities';
        return 'markets';
    }

    function impactFor(item) {
        // Prefiere el sentimiento editorial (Gemini); si no, heurístico por texto.
        if (item.sentiment === 'positive') return ['Positivo','ff-impact-positive'];
        if (item.sentiment === 'negative') return ['Negativo','ff-impact-negative'];
        if (item.sentiment === 'neutral')  return ['Neutral','ff-impact-neutral'];
        const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();
        if (/rise|gain|rally|growth|beat|sube|avance/.test(text)) return ['Positivo','ff-impact-positive'];
        if (/fall|drop|risk|war|miss|baja|cae|tensión/.test(text)) return ['Negativo','ff-impact-negative'];
        return ['Neutral','ff-impact-neutral'];
    }

    let newsReaderReturnFocus = null;

    function openNewsReader(item) {
        const reader = $('ff-news-reader');
        if (!reader || !item) return;
        const category = classifyNews(item);
        newsReaderReturnFocus = document.activeElement;
        $('ff-reader-category').textContent = _NEWS_CAT_ES[category] || 'Mercados';
        $('ff-reader-title').textContent = item.title || 'Detalle de la noticia';
        $('ff-reader-source').textContent = item.source || 'Fuente financiera';
        $('ff-reader-time').textContent = safeDate(item.publishedAt);
        $('ff-reader-impact').textContent = item.impact ? `Impacto ${item.impact}` : impactFor(item)[0];
        $('ff-reader-description').textContent = item.description || 'No hay un resumen ampliado disponible para este titular.';
        $('ff-reader-insight').textContent = item.insight || 'La mesa editorial recomienda seguir la fuente original y contrastar el movimiento con los datos de mercado.';
        $('ff-reader-related').textContent = item.related || (category === 'rates' ? 'Crédito, ahorro, divisas y renta fija' : category === 'bonds' ? 'Tasas, duración y costo de capital' : category === 'fx' ? 'Divisas, tasas y flujos internacionales' : category === 'commodities' ? 'Materias primas, inflación y cadenas de suministro' : 'Índices, sectores y volatilidad');
        const original = $('ff-reader-original');
        if (original) {
            original.hidden = !item.url;
            original.href = item.url || '#';
        }
        $('ff-reader-disclaimer').textContent = state.newsIsDemo ? 'Contenido demostrativo generado a partir de una fuente editorial interna. No se presenta como una noticia verificada ni como asesoría financiera.' : 'Resumen informativo; consulta la fuente original para conocer todos los detalles.';
        reader.hidden = false;
        document.body.style.overflow = 'hidden';
        reader.querySelector('.ff-reader-close')?.focus();
    }

    function closeNewsReader() {
        const reader = $('ff-news-reader');
        if (reader) reader.hidden = true;
        document.body.style.overflow = '';
        if (newsReaderReturnFocus instanceof HTMLElement) newsReaderReturnFocus.focus();
        newsReaderReturnFocus = null;
    }

    function updateNewsModuleCard() {
        updateModuleTiles();   // el contador de titulares de la baldosa Daily News
        const lead = state.news[0];
        const counts = state.news.reduce((summary, item) => {
            const key = classifyNews(item);
            summary[key] = (summary[key] || 0) + 1;
            return summary;
        }, { markets: 0, rates: 0, bonds: 0, fx: 0, commodities: 0 });
        if ($('ff-card-news-title')) $('ff-card-news-title').textContent = lead?.title || 'No hay titulares disponibles en este momento.';
        if ($('ff-card-news-source')) $('ff-card-news-source').textContent = state.newsIsDemo ? `${lead?.source || 'Mesa editorial'} · contenido demostrativo` : (lead?.source || 'Fuente financiera');
        if ($('ff-card-news-time')) $('ff-card-news-time').textContent = lead ? safeDate(lead.publishedAt) : 'Pendiente de actualización';
        if ($('ff-card-news-markets')) $('ff-card-news-markets').textContent = String(counts.markets);
        if ($('ff-card-news-rates')) $('ff-card-news-rates').textContent = String(counts.rates);
        if ($('ff-card-news-bonds')) $('ff-card-news-bonds').textContent = String(counts.bonds);
    }

    // ── Helpers del noticiero (blog Favro) ──────────────────────────────────
    const _NEWS_CAT_ES  = { rates: 'Tasas', bonds: 'Bonos', markets: 'Mercados', fx: 'Divisas', commodities: 'Commodities' };
    const _NEWS_ICON    = { rates: 'fa-percent', bonds: 'fa-landmark', markets: 'fa-chart-line', fx: 'fa-money-bill-transfer', commodities: 'fa-oil-well' };
    function _newsCatKey(it) {
        return ['rates', 'bonds', 'markets', 'fx', 'commodities'].includes(it.category) ? it.category : classifyNews(it);
    }
    function _newsCatLabel(it) { return it.categoryLabel || _NEWS_CAT_ES[_newsCatKey(it)] || 'Mercados'; }
    function _newsIcon(k) { return _NEWS_ICON[k] || 'fa-newspaper'; }
    function _isNewsImg(url) { return typeof url === 'string' && (/^https?:/.test(url) || url.startsWith('/api/')); }
    function _newsImpact(it) {
        if (['alto', 'medio', 'bajo'].includes((it.impact || '').toLowerCase())) return it.impact.toLowerCase();
        return it.sentiment === 'negative' ? 'alto' : it.sentiment === 'positive' ? 'bajo' : 'medio';
    }
    function _openNews(item) {
        openNewsReader(item);
    }
    function _newsFallback(cls, k) {
        const d = document.createElement('div'); d.className = cls; d.dataset.cat = k;
        const i = document.createElement('i'); i.className = 'fas ' + _newsIcon(k);
        d.appendChild(i); return d;
    }
    function _newsImage(url, onFallback) {
        const img = document.createElement('img');
        img.src = url; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => { img.remove(); onFallback(); });
        return img;
    }

    function buildNewsCard(item) {
        const k = _newsCatKey(item);
        const card = document.createElement('button');
        card.className = 'fnb-card'; card.type = 'button';

        const media = document.createElement('div'); media.className = 'fnb-card-media';
        if (_isNewsImg(item.image)) media.appendChild(_newsImage(item.image, () => media.prepend(_newsFallback('fnb-card-fallback', k))));
        else media.appendChild(_newsFallback('fnb-card-fallback', k));
        const cat = document.createElement('span'); cat.className = 'fnb-cat'; cat.dataset.cat = k; cat.textContent = _newsCatLabel(item);
        media.appendChild(cat);

        const body = document.createElement('div'); body.className = 'fnb-card-body';
        const h = document.createElement('h4'); h.textContent = item.title || '';
        const p = document.createElement('p'); p.textContent = item.description || item.insight || '';
        const meta = document.createElement('div'); meta.className = 'fnb-card-meta';
        const src = document.createElement('span'); src.className = 'fnb-src'; src.textContent = item.source || 'Fuente';
        const dot = document.createElement('span'); dot.className = 'fnb-dot';
        const time = document.createElement('span'); time.textContent = item.fecha || safeDate(item.publishedAt);
        const ik = _newsImpact(item); const imp = document.createElement('span'); imp.className = 'fnb-impact ' + ik; imp.textContent = ik;
        meta.append(src, dot, time, imp);
        body.append(h, p, meta);

        card.append(media, body);
        card.addEventListener('click', () => _openNews(item));
        return card;
    }

    function buildNewsStreamItem(item) {
        const k = _newsCatKey(item);
        const button = document.createElement('button');
        button.className = 'fnb-stream-item'; button.type = 'button';
        const time = document.createElement('span'); time.className = 'fnb-stream-time';
        const published = item.publishedAt ? new Date(item.publishedAt) : null;
        time.textContent = published && !Number.isNaN(published.getTime())
            ? published.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
            : 'Ahora';
        const copy = document.createElement('div'); copy.className = 'fnb-stream-copy'; copy.dataset.cat = k;
        const cat = document.createElement('span'); cat.textContent = _newsCatLabel(item);
        const title = document.createElement('h4'); title.textContent = item.title || '';
        const source = document.createElement('small'); source.textContent = `${item.source || 'Fuente'} · Impacto ${_newsImpact(item)}`;
        copy.append(cat, title, source); button.append(time, copy);
        button.addEventListener('click', () => _openNews(item));
        return button;
    }

    function updateNewsDesk(filtered) {
        const counts = filtered.reduce((summary, item) => {
            const key = _newsCatKey(item);
            summary[key] = (summary[key] || 0) + 1;
            return summary;
        }, {});
        const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'markets';
        if ($('fnb-story-count')) $('fnb-story-count').textContent = String(filtered.length);
        if ($('fnb-dominant-focus')) $('fnb-dominant-focus').textContent = _NEWS_CAT_ES[dominant] || 'Mercados';
        if ($('fnb-reading-time')) $('fnb-reading-time').textContent = `${Math.max(2, Math.ceil(filtered.length * .32))} min`;
        if ($('fnb-updated')) $('fnb-updated').textContent = state.newsMeta.generado || 'Edición actualizada';
        if ($('fnb-source')) $('fnb-source').textContent = state.newsIsDemo
            ? 'Respaldo editorial interno'
            : (state.newsMeta.fuente || 'Fuentes financieras verificadas');
    }

    function renderNewsTrending(items) {
        const host = $('fnb-trending-track');
        if (!host) return;
        const headlines = items.slice(0, 6);
        if (!headlines.length) {
            host.innerHTML = '<span>Sin temas en desarrollo.</span>';
            return;
        }
        host.replaceChildren(...headlines.map((item, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = `${index === 0 ? 'EN DESARROLLO: ' : ''}${item.title || ''}`;
            button.addEventListener('click', () => _openNews(item));
            return button;
        }));
    }

    function buildDepartmentLead(item) {
        const k = _newsCatKey(item);
        const button = document.createElement('button'); button.type = 'button'; button.className = 'fnb-department-lead';
        const media = document.createElement('div'); media.className = 'fnb-department-media'; media.dataset.cat = k;
        if (_isNewsImg(item.image)) media.appendChild(_newsImage(item.image, () => media.prepend(_newsFallback('fnb-card-fallback', k))));
        else media.appendChild(_newsFallback('fnb-card-fallback', k));
        const copy = document.createElement('div'); copy.className = 'fnb-department-copy'; copy.dataset.cat = k;
        const cat = document.createElement('span'); cat.textContent = _newsCatLabel(item);
        const title = document.createElement('h4'); title.textContent = item.title || '';
        const summary = document.createElement('p'); summary.textContent = item.description || item.insight || '';
        const meta = document.createElement('small'); meta.textContent = `${item.source || 'Fuente'} · ${item.fecha || safeDate(item.publishedAt)}`;
        copy.append(cat, title, summary, meta); button.append(media, copy);
        button.addEventListener('click', () => _openNews(item));
        return button;
    }

    function buildDepartment(definition, items) {
        const section = document.createElement('section'); section.className = 'fnb-department';
        const head = document.createElement('header'); head.className = 'fnb-department-head'; head.dataset.cat = definition.accent;
        const title = document.createElement('h3'); title.textContent = definition.title;
        const label = document.createElement('span'); label.textContent = `${items.length} historias`;
        head.append(title, label);
        const grid = document.createElement('div'); grid.className = 'fnb-department-grid';
        grid.appendChild(buildDepartmentLead(items[0]));
        const list = document.createElement('div'); list.className = 'fnb-department-list'; list.dataset.cat = definition.accent;
        items.slice(1, 5).forEach(item => {
            const button = document.createElement('button'); button.type = 'button';
            const wrap = document.createElement('div');
            const itemTitle = document.createElement('h4'); itemTitle.textContent = item.title || '';
            const meta = document.createElement('small'); meta.textContent = `${_newsCatLabel(item)} · ${item.source || 'Fuente'}`;
            wrap.append(itemTitle, meta); button.appendChild(wrap);
            button.addEventListener('click', () => _openNews(item)); list.appendChild(button);
        });
        grid.appendChild(list); section.append(head, grid);
        return section;
    }

    function renderNewsDepartments(items) {
        const host = $('fnb-department-host');
        if (!host) return;
        const definitions = [
            { title: 'Mercados globales', cats: ['markets'], accent: 'markets' },
            { title: 'Bancos centrales y renta fija', cats: ['rates', 'bonds'], accent: 'rates' },
            { title: 'Divisas y materias primas', cats: ['fx', 'commodities'], accent: 'fx' },
        ];
        const sections = definitions.map(definition => ({
            definition,
            items: items.filter(item => definition.cats.includes(_newsCatKey(item))).slice(0, 5),
        })).filter(group => group.items.length);
        if (!sections.length) {
            host.innerHTML = '<div class="fnb-empty">No hay bloques temáticos disponibles para este filtro.</div>';
            return;
        }
        host.replaceChildren(...sections.map(group => buildDepartment(group.definition, group.items)));
    }

    function renderNewsPriority(items) {
        const host = $('fnb-priority-list');
        if (!host) return;
        const weight = { alto: 3, medio: 2, bajo: 1 };
        const priority = [...items].sort((a, b) => {
            const impactDelta = (weight[_newsImpact(b)] || 0) - (weight[_newsImpact(a)] || 0);
            if (impactDelta) return impactDelta;
            return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
        }).slice(0, 5);
        host.replaceChildren(...priority.map((item, index) => {
            const li = document.createElement('li');
            const number = document.createElement('span'); number.textContent = String(index + 1).padStart(2, '0');
            const wrap = document.createElement('div');
            const button = document.createElement('button'); button.type = 'button'; button.textContent = item.title || '';
            const meta = document.createElement('small'); meta.textContent = `${_newsCatLabel(item)} · Impacto ${_newsImpact(item)}`;
            button.addEventListener('click', () => _openNews(item)); wrap.append(button, meta); li.append(number, wrap);
            return li;
        }));
    }

    function renderFavroPerspectives(items) {
        const host = $('fnb-perspectives-grid');
        if (!host) return;
        const selected = [...items]
            .sort((a, b) => Number(!!b.insight) - Number(!!a.insight))
            .slice(0, 3);
        if (!selected.length) {
            host.innerHTML = '<div class="fnb-empty">La mesa editorial está preparando las claves de esta edición.</div>';
            return;
        }
        host.replaceChildren(...selected.map(item => {
            const k = _newsCatKey(item);
            const article = document.createElement('article'); article.className = 'fnb-perspective'; article.dataset.cat = k;
            const category = document.createElement('span'); category.textContent = `${_newsCatLabel(item)} · Lectura editorial`;
            const title = document.createElement('h4'); title.textContent = item.title || '';
            const insight = document.createElement('blockquote'); insight.textContent = item.insight || item.description || 'Consulta la noticia para conocer el contexto completo.';
            const button = document.createElement('button'); button.type = 'button'; button.innerHTML = 'Profundizar <i class="fas fa-arrow-right"></i>';
            button.addEventListener('click', () => _openNews(item));
            article.append(category, title, insight, button);
            return article;
        }));
    }

    function buildCoverageCard(item) {
        const k = _newsCatKey(item);
        const button = document.createElement('button'); button.type = 'button'; button.className = 'fnb-coverage-card'; button.dataset.cat = k;
        if (_isNewsImg(item.image)) button.appendChild(_newsImage(item.image, () => button.prepend(_newsFallback('fnb-card-fallback', k))));
        else button.appendChild(_newsFallback('fnb-card-fallback', k));
        const copy = document.createElement('div'); copy.className = 'fnb-coverage-copy';
        const category = document.createElement('span'); category.textContent = _newsCatLabel(item);
        const title = document.createElement('h4'); title.textContent = item.title || '';
        const meta = document.createElement('small'); meta.textContent = `${item.source || 'Fuente'} · ${item.fecha || safeDate(item.publishedAt)}`;
        copy.append(category, title, meta); button.appendChild(copy);
        button.addEventListener('click', () => _openNews(item));
        return button;
    }

    function renderNewsCoverage(items) {
        const host = $('fnb-coverage-grid');
        if (!host) return;
        const selected = [...items]
            .sort((a, b) => Number(_isNewsImg(b.image)) - Number(_isNewsImg(a.image)))
            .slice(0, 6);
        if (!selected.length) {
            host.innerHTML = '<div class="fnb-empty">No hay cobertura visual disponible para este filtro.</div>';
            updateNewsCarouselUI();
            return;
        }
        host.replaceChildren(...selected.map(buildCoverageCard));
        host.scrollLeft = 0;
        requestAnimationFrame(updateNewsCarouselUI);
    }

    function buildArchiveItem(item, index = 0, featured = false) {
        const k = _newsCatKey(item), impact = _newsImpact(item);
        const button = document.createElement('button'); button.type = 'button'; button.className = 'fnb-archive-item'; button.dataset.cat = k;
        const hasImage = _isNewsImg(item.image);
        button.classList.toggle('has-image', hasImage);
        button.classList.toggle('is-editorial-lead', featured && hasImage);
        button.setAttribute('aria-label', `Abrir noticia: ${item.title || 'Noticia financiera'}`);
        const stamp = document.createElement('span'); stamp.className = 'fnb-archive-stamp'; stamp.dataset.cat = k;
        const rank = document.createElement('em'); rank.className = 'fnb-archive-rank'; rank.textContent = String(index + 1).padStart(2, '0');
        const category = document.createElement('strong');
        category.textContent = k === 'commodities' ? 'Materias primas' : _newsCatLabel(item);
        const published = item.publishedAt ? new Date(item.publishedAt) : null;
        const time = document.createElement('span'); time.textContent = published && !Number.isNaN(published.getTime())
            ? published.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : 'Ahora';
        stamp.append(rank, category, time);
        const copy = document.createElement('div'); copy.className = 'fnb-archive-copy';
        const title = document.createElement('h4'); title.textContent = item.title || '';
        const summary = document.createElement('p'); summary.textContent = item.description || item.insight || 'Abre la noticia para consultar el contexto editorial completo.';
        const source = document.createElement('small'); source.textContent = item.source || 'Fuente financiera';
        copy.append(title, summary, source);
        const media = document.createElement('span'); media.className = 'fnb-archive-thumb'; media.dataset.cat = k;
        if (hasImage) media.appendChild(_newsImage(item.image, () => media.appendChild(_newsFallback('fnb-card-fallback', k))));
        const badge = document.createElement('span'); badge.className = `fnb-archive-impact ${impact}`; badge.textContent = impact;
        const action = document.createElement('span'); action.className = 'fnb-archive-action';
        const arrow = document.createElement('i'); arrow.className = 'fas fa-arrow-right'; arrow.setAttribute('aria-hidden', 'true');
        action.append(badge, arrow);
        button.append(stamp);
        if (hasImage) button.append(media);
        button.append(copy, action); button.addEventListener('click', () => _openNews(item));
        return button;
    }

    function renderArchiveSpotlight(item, total = 0) {
        const host = $('fnb-archive-spotlight');
        if (!host) return;
        host.hidden = !item;
        if (!item) {
            host.replaceChildren();
            return;
        }
        const k = _newsCatKey(item), impact = _newsImpact(item);
        const article = document.createElement('article'); article.className = 'fnb-spotlight-card'; article.dataset.cat = k;
        const media = document.createElement('div'); media.className = 'fnb-spotlight-media';
        if (_isNewsImg(item.image)) media.appendChild(_newsImage(item.image, () => media.prepend(_newsFallback('fnb-card-fallback', k))));
        else media.appendChild(_newsFallback('fnb-card-fallback', k));
        const mediaLabel = document.createElement('span'); mediaLabel.className = 'fnb-spotlight-media-label'; mediaLabel.innerHTML = '<i class="fas fa-star" aria-hidden="true"></i> Historia de portada';
        media.appendChild(mediaLabel);

        const copy = document.createElement('div'); copy.className = 'fnb-spotlight-copy';
        const eyebrow = document.createElement('div'); eyebrow.className = 'fnb-spotlight-eyebrow';
        const category = document.createElement('span'); category.textContent = _newsCatLabel(item);
        const selection = document.createElement('span'); selection.textContent = `Empieza aquí · ${total} historias en la edición`;
        eyebrow.append(category, selection);
        const title = document.createElement('h4'); title.textContent = item.title || 'La historia que define la jornada';
        const description = document.createElement('p'); description.textContent = item.description || 'Una lectura esencial para comprender el movimiento de los mercados de hoy.';
        const insight = document.createElement('div'); insight.className = 'fnb-spotlight-insight';
        const insightIcon = document.createElement('i'); insightIcon.className = 'fas fa-lightbulb'; insightIcon.setAttribute('aria-hidden', 'true');
        const insightText = document.createElement('span'); insightText.textContent = item.insight || 'Conecta esta noticia con el contexto financiero de la jornada.';
        insight.append(insightIcon, insightText);
        const foot = document.createElement('div'); foot.className = 'fnb-spotlight-foot';
        const meta = document.createElement('div'); meta.className = 'fnb-spotlight-meta';
        const source = document.createElement('span'); source.textContent = item.source || 'Fuente financiera';
        const badge = document.createElement('span'); badge.className = `fnb-archive-impact ${impact}`; badge.textContent = `Impacto ${impact}`;
        meta.append(source, badge);
        const open = document.createElement('button'); open.type = 'button'; open.innerHTML = 'Entender esta historia <i class="fas fa-arrow-right" aria-hidden="true"></i>';
        open.addEventListener('click', () => _openNews(item));
        foot.append(meta, open);
        copy.append(eyebrow, title, description, insight, foot);
        article.append(media, copy);
        host.replaceChildren(article);
    }

    function renderNewsArchive(items) {
        const host = $('fnb-archive-list');
        if (!host) return;
        const query = state.newsArchiveQuery.trim().toLocaleLowerCase('es');
        const impactWeight = { alto: 3, medio: 2, bajo: 1 };
        const visible = items.filter(item => !query || [item.title, item.description, item.insight, item.source, _newsCatLabel(item)]
            .filter(Boolean).join(' ').toLocaleLowerCase('es').includes(query));
        visible.sort((a, b) => {
            if (state.newsArchiveSort === 'impact') return (impactWeight[_newsImpact(b)] || 0) - (impactWeight[_newsImpact(a)] || 0);
            return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
        });
        if ($('fnb-archive-count')) $('fnb-archive-count').textContent = String(visible.length);
        if ($('fnb-archive-summary')) $('fnb-archive-summary').textContent = query
            ? `${visible.length} coincidencias dentro de ${items.length} historias de la edición.`
            : `${visible.length} historias internacionales disponibles en esta selección.`;
        if (!visible.length) {
            renderArchiveSpotlight(null);
            if ($('fnb-archive-more')) $('fnb-archive-more').hidden = true;
            host.innerHTML = `<div class="fnb-empty fnb-archive-empty"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><strong>Sin coincidencias</strong><span>${query ? 'Prueba con otra empresa, mercado o palabra clave.' : 'No hay noticias archivadas para este filtro.'}</span></div>`;
            return;
        }
        const spotlight = visible.find(item => _isNewsImg(item.image)) || visible[0];
        renderArchiveSpotlight(spotlight, visible.length);
        const remaining = visible.filter(item => item !== spotlight);
        const shown = remaining.slice(0, state.newsArchiveLimit);
        const featuredIndex = shown.findIndex(item => _isNewsImg(item.image));
        if (shown.length) host.replaceChildren(...shown.map((item, index) => buildArchiveItem(item, index, index === featuredIndex)));
        else host.innerHTML = '<div class="fnb-empty fnb-archive-empty"><i class="fas fa-circle-check" aria-hidden="true"></i><strong>Lectura localizada</strong><span>La historia destacada es la única coincidencia disponible.</span></div>';
        const more = $('fnb-archive-more');
        const moreButton = $('fnb-archive-more-button');
        const moreLabel = $('fnb-archive-more-label');
        const moreProgress = $('fnb-archive-more-progress');
        const pending = Math.max(0, remaining.length - shown.length);
        if (more) more.hidden = remaining.length === 0;
        if (moreButton) {
            moreButton.hidden = pending === 0;
            const buttonLabel = moreButton.querySelector('span');
            if (buttonLabel) buttonLabel.textContent = pending ? `Descubrir ${Math.min(8, pending)} historias más` : 'Edición explorada';
        }
        if (moreLabel) moreLabel.textContent = `Has explorado ${Math.min(shown.length + 1, visible.length)} de ${visible.length} historias`;
        if (moreProgress) moreProgress.style.width = `${visible.length ? Math.min(100, ((shown.length + 1) / visible.length) * 100) : 0}%`;
    }

    function renderNews() {
        updateNewsModuleCard();
        const filtered = state.news.filter(item => state.newsFilter === 'all' || classifyNews(item) === state.newsFilter);
        updateNewsDesk(filtered);
        renderNewsTrending(filtered);
        renderNewsDepartments(filtered.slice(1));
        renderNewsPriority(filtered);
        renderFavroPerspectives(filtered);
        renderNewsCoverage(filtered.slice(1));
        renderNewsArchive(filtered);

        // ── Nota principal (hero) ──
        const lead = filtered[0] || state.news[0];
        const leadEl = $('fnb-lead');
        if (lead && leadEl) {
            const k = _newsCatKey(lead), impact = _newsImpact(lead);
            leadEl.replaceChildren();
            if (_isNewsImg(lead.image)) {
                const img = _newsImage(lead.image, () => leadEl.prepend(_newsFallback('fnb-lead-fallback', k)));
                img.className = 'fnb-lead-img';
                leadEl.appendChild(img);
            } else {
                leadEl.appendChild(_newsFallback('fnb-lead-fallback', k));
            }
            const body = document.createElement('div'); body.className = 'fnb-lead-body';
            const chips = document.createElement('div'); chips.className = 'fnb-chips';
            const cat = document.createElement('span'); cat.className = 'fnb-cat'; cat.dataset.cat = k; cat.textContent = _newsCatLabel(lead);
            const imp = document.createElement('span'); imp.className = 'fnb-impact ' + impact; imp.textContent = 'Impacto ' + impact;
            chips.append(cat, imp);
            const h = document.createElement('h3'); h.textContent = lead.title || '';
            const dek = document.createElement('p'); dek.className = 'fnb-lead-dek'; dek.textContent = lead.description || '';
            body.append(chips, h, dek);
            if (lead.insight) {
                const ins = document.createElement('div'); ins.className = 'fnb-insight';
                const i = document.createElement('i'); i.className = 'fas fa-lightbulb';
                const s = document.createElement('span'); s.textContent = lead.insight;
                ins.append(i, s); body.append(ins);
            }
            const meta = document.createElement('div'); meta.className = 'fnb-lead-meta';
            const src = document.createElement('span'); src.className = 'fnb-src'; src.textContent = lead.source || 'Mesa editorial';
            const time = document.createElement('span'); time.textContent = lead.fecha || safeDate(lead.publishedAt);
            const go = document.createElement('span'); go.className = 'fnb-go'; go.innerHTML = 'Leer <i class="fas fa-arrow-right"></i>';
            meta.append(src, time, go);
            body.append(meta);
            leadEl.appendChild(body);
            leadEl.onclick = () => _openNews(lead);
        }

        // ── Briefing "Lo que debes saber hoy" ──
        const briefList = $('fnb-brief-list');
        if (briefList && Array.isArray(state.briefing) && state.briefing.length) {
            briefList.replaceChildren(...state.briefing.slice(0, 3).map((txt, idx) => {
                const li = document.createElement('li');
                const num = document.createElement('span'); num.textContent = String(idx + 1).padStart(2, '0');
                const p = document.createElement('p'); p.textContent = txt;
                li.append(num, p);
                return li;
            }));
        }

        // ── Grid tipo blog ──
        const grid = $('fnb-grid'), stream = $('fnb-stream');
        if (!grid || !stream) return;
        const items = filtered.slice(1, 13);
        if (!items.length) {
            grid.innerHTML = '<div class="fnb-empty">No hay noticias para este filtro. Prueba con otra categoría.</div>';
            stream.innerHTML = '<div class="fnb-empty">Sin titulares adicionales.</div>';
            return;
        }
        const featured = items.slice(0, 4);
        const latest = items.slice(4);
        grid.replaceChildren(...featured.map(buildNewsCard));
        if (latest.length) stream.replaceChildren(...latest.map(buildNewsStreamItem));
        else stream.innerHTML = '<div class="fnb-empty">Esta edición no tiene más titulares.</div>';
    }

    async function loadNews() {
        const refresh = $('ff-open-news');
        const refreshLabel = refresh?.querySelector('span');
        let newsLoaded = false;
        refresh?.classList.add('is-loading');
        refresh?.classList.remove('is-success');
        if (refresh) refresh.disabled = true;
        if (refreshLabel) refreshLabel.textContent = 'Actualizando…';
        try {
            // Noticiero Favro: noticias reales de finanzas internacionales (Finnhub +
            // NewsAPI) con tratamiento editorial en español hecho por Gemini.
            const payload = await fetchJson('/api/daily-news', 45000);
            const data = payload?.data || payload;
            const items = Array.isArray(data?.noticias) ? data.noticias : [];
            if (!items.length) throw new Error('sin noticias');
            state.newsIsDemo = false;
            state.news = items.filter(item => item && item.title).map(item => ({
                title:         item.title,
                description:   item.description || '',
                insight:       item.insight || '',
                related:       item.insight || '',
                source:        item.source || 'Fuente financiera',
                url:           item.url || '',
                image:         item.image || '',
                publishedAt:   item.publishedAt || null,
                fecha:         item.fecha || '',
                category:      item.category || null,       // 'markets' | 'rates' | 'bonds'
                categoryLabel: item.categoryLabel || '',
                sentiment:     item.sentiment || null,      // 'positive' | 'negative' | 'neutral'
                impact:        item.impact || '',           // 'alto' | 'medio' | 'bajo'
            })).slice(0, 24);
            state.briefing = Array.isArray(data?.briefing) ? data.briefing : [];
            state.newsMeta = { generado: data?.generado || '', fuente: data?.fuente || '', stale: !!payload?.stale };
            renderNews();
            newsLoaded = true;
        } catch (error) {
            console.warn('Favro news (daily-news):', error);
            // Respaldo: fuente interna previa para no dejar el noticiero vacío.
            try {
                const financeFeed = await fetchJson('/api/finanzas');
                const generated = financeFeed?.data?.noticias || [];
                const items = generated.map(item => ({
                    title:       item.titulo,
                    description: item.descripcion,
                    insight:     item.ia_insight || '',
                    related:     item.ia_insight || '',
                    source:      item.fuente || 'VALL-AI',
                    publishedAt: item.fecha,
                    fecha:       item.fecha || '',
                    impact:      item.impacto || '',
                    url:         '',
                    image:       '',
                })).filter(item => item.title);
                if (items.length) {
                    state.news = items.slice(0, 24);
                    state.newsIsDemo = true;
                    state.briefing = [];
                    state.newsMeta = { generado: 'Lectura de respaldo', fuente: 'Mesa editorial', stale: true };
                    renderNews();
                    newsLoaded = true;
                    return;
                }
            } catch { /* sin respaldo */ }
            state.news = [];
            state.briefing = [];
            updateNewsModuleCard();
            const grid = $('fnb-grid');
            if (grid) grid.innerHTML = '<div class="fnb-empty">Sin conexión · no pudimos actualizar las noticias. Reintenta más tarde.</div>';
            const stream = $('fnb-stream');
            if (stream) stream.innerHTML = '<div class="fnb-empty">No hay titulares disponibles.</div>';
            if ($('fnb-updated')) $('fnb-updated').textContent = 'Actualización no disponible';
        } finally {
            refresh?.classList.remove('is-loading');
            if (refresh) refresh.disabled = false;
            if (newsLoaded) {
                refresh?.classList.add('is-success');
                if (refreshLabel) refreshLabel.textContent = 'Edición actualizada';
                window.setTimeout(() => {
                    refresh?.classList.remove('is-success');
                    if (refreshLabel) refreshLabel.textContent = 'Actualizar edición';
                }, 1800);
            } else if (refreshLabel) refreshLabel.textContent = 'Reintentar';
        }
    }

    async function loadCoreData() {
        const refresh = $('ff-refresh');
        refresh?.classList.add('is-loading');
        state.quotesLoading = true;
        try {
            const quoteSymbols = ['^GSPC','^NDX','^MXX','^VIX','^MOVE','^FTSE','^GDAXI','^N225','^HSI','^BVSP'];
            const [bonds, mxRates, spSeries, quotes, bmv] = await Promise.allSettled([
                fetchJson('/api/bond-yields'),
                fetchJson('/api/mx-rates'),
                fetchSeries('^GSPC','1mo'),
                Promise.allSettled(quoteSymbols.map(fetchQuote)),
                fetchJson('/api/bmv-market')
            ]);
            state.quotesLoading = false;
            if (bonds.status === 'fulfilled' && Array.isArray(bonds.value)) state.bondData = bonds.value;
            if (mxRates.status === 'fulfilled') state.mxRates = mxRates.value;
            if (bmv.status === 'fulfilled') {
                state.bmvData = Array.isArray(bmv.value?.bmv) ? bmv.value.bmv : [];
                state.bmvTimestamp = bmv.value?.timestamp || null;
            }
            if (spSeries.status === 'fulfilled') renderMiniChart('ff-spark-bolsa', spSeries.value.map(item => +item.close).slice(-24), colors.blue);
            syncLegacyValues();
            updateMarketCards();
            updateBondCards();
            renderReturnsPanel();
            renderBreakdown();
            renderDetailTable();
            renderInsights();
            if (document.body.classList.contains('ff-detail-mode') && !document.body.classList.contains('ff-detail-noticias') && state.module !== 'rendimientos') renderSupplement(state.module);
            await renderMainChart();
            $('ff-last-update').textContent = new Date().toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
            if (typeof VDS !== 'undefined' && VDS.banxico) {
                VDS.banxico('SP74660').then(value => {
                    if (!isNumeric(value)) return;
                    state.inflation = +value;
                    updateBondCards();
                    renderContextChart();
                    updateAutomaticConclusion();
                    if (document.body.classList.contains('ff-detail-mode') && !document.body.classList.contains('ff-detail-noticias') && state.module !== 'rendimientos') renderSupplement(state.module);
                }).catch(() => {});
            }
        } catch (error) {
            console.warn('Favro core data:', error);
            state.quotesLoading = false;
            renderExchangeBoard();
            $('ff-last-update').textContent = 'Última lectura disponible';
        } finally {
            refresh?.classList.remove('is-loading');
        }
    }

    function setupNativeNewsNavigation() {
        const buttons = [...document.querySelectorAll('[data-news-jump]')];
        const sections = buttons.map(button => ({ button, section: $(button.dataset.newsJump) })).filter(item => item.section);
        const current = $('fnb-native-current');
        const progress = $('fnb-native-progress');
        const activate = id => {
            buttons.forEach(button => {
                const active = button.dataset.newsJump === id;
                button.classList.toggle('is-active', active);
                if (active) button.setAttribute('aria-current', 'location');
                else button.removeAttribute('aria-current');
                if (active && current) current.textContent = button.querySelector('span')?.textContent || 'Daily News';
            });
        };
        buttons.forEach(button => button.addEventListener('click', () => {
            activate(button.dataset.newsJump);
            $(button.dataset.newsJump)?.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                block: 'start',
            });
        }));
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver(entries => {
                const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
                if (visible?.target?.id) activate(visible.target.id);
            }, { rootMargin: '-24% 0px -62% 0px', threshold: [0, .15, .35] });
            sections.forEach(item => observer.observe(item.section));
        }
        const updateProgress = () => {
            const newsroom = document.querySelector('.fnb-newsroom');
            if (!newsroom || !progress) return;
            const rect = newsroom.getBoundingClientRect();
            const distance = Math.max(1, rect.height - window.innerHeight);
            const value = Math.max(0, Math.min(1, -rect.top / distance));
            progress.style.width = `${(value * 100).toFixed(1)}%`;
        };
        window.addEventListener('scroll', updateProgress, { passive: true });
        window.addEventListener('resize', updateProgress, { passive: true });
        updateProgress();
    }

    function getNewsCarouselState() {
        const track = $('fnb-coverage-grid');
        const cards = track ? [...track.querySelectorAll('.fnb-coverage-card')] : [];
        if (!track || !cards.length) return { track, cards, index: 0 };
        const trackRect = track.getBoundingClientRect();
        const score = card => {
            const rect = card.getBoundingClientRect();
            const visible = Math.max(0, Math.min(rect.right, trackRect.right) - Math.max(rect.left, trackRect.left));
            const coverage = visible / Math.max(1, rect.width);
            const cardCenter = rect.left + rect.width / 2;
            const trackCenter = trackRect.left + trackRect.width / 2;
            const centerPenalty = Math.abs(cardCenter - trackCenter) / Math.max(1, trackRect.width);
            return coverage - centerPenalty * .16;
        };
        const index = cards.reduce((closest, card, current) => score(card) > score(cards[closest]) ? current : closest, 0);
        return { track, cards, index };
    }

    function scrollNewsCarouselToCard(track, card) {
        if (!track || !card) return;
        const centeredLeft = card.offsetLeft - Math.max(0, (track.clientWidth - card.offsetWidth) / 2);
        const maxLeft = Math.max(0, track.scrollWidth - track.clientWidth);
        track.scrollTo({
            left: Math.max(0, Math.min(maxLeft, centeredLeft)),
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
    }

    function syncNewsCarouselUI(forcedIndex = null) {
        const stateNow = getNewsCarouselState();
        const { track, cards } = stateNow;
        const index = Number.isInteger(forcedIndex) ? Math.max(0, Math.min(cards.length - 1, forcedIndex)) : stateNow.index;
        const count = $('fnb-carousel-count');
        const dots = [...document.querySelectorAll('#fnb-carousel-dots button')];
        if (track) track.dataset.carouselIndex = String(index);
        if (count) count.textContent = cards.length ? `${index + 1} / ${cards.length}` : '0 / 0';
        cards.forEach((card, cardIndex) => {
            const active = cardIndex === index;
            card.classList.toggle('is-active', active);
            if (active) card.setAttribute('aria-current', 'true');
            else card.removeAttribute('aria-current');
        });
        dots.forEach((dot, dotIndex) => {
            const active = dotIndex === index;
            dot.classList.toggle('is-active', active);
            dot.setAttribute('aria-current', active ? 'true' : 'false');
        });
        if ($('fnb-carousel-prev')) $('fnb-carousel-prev').disabled = cards.length < 2;
        if ($('fnb-carousel-next')) $('fnb-carousel-next').disabled = cards.length < 2;
    }

    function moveNewsCarousel(direction, wrap = false) {
        const carousel = getNewsCarouselState();
        const { track, cards } = carousel;
        if (!track || cards.length < 2) return;
        const storedIndex = Number.parseInt(track.dataset.carouselIndex, 10);
        const index = Number.isInteger(storedIndex) && storedIndex >= 0 && storedIndex < cards.length ? storedIndex : carousel.index;
        let next = index + direction;
        if (wrap) next = (next + cards.length) % cards.length;
        else next = Math.max(0, Math.min(cards.length - 1, next));
        syncNewsCarouselUI(next);
        scrollNewsCarouselToCard(track, cards[next]);
    }

    function updateNewsCarouselUI() {
        const { track, cards } = getNewsCarouselState();
        const dots = $('fnb-carousel-dots');
        if (!track || !dots) return;
        dots.replaceChildren(...cards.map((card, index) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.setAttribute('aria-label', `Ver noticia ${index + 1} de ${cards.length}`);
            dot.addEventListener('click', () => {
                syncNewsCarouselUI(index);
                scrollNewsCarouselToCard(track, card);
            });
            return dot;
        }));
        syncNewsCarouselUI();
    }

    function setupNewsCoverageCarousel() {
        const track = $('fnb-coverage-grid');
        if (!track || track.dataset.carouselBound === 'true') return;
        track.dataset.carouselBound = 'true';
        let scrollTimer = 0;
        let autoTimer = 0;
        let pointerStartX = 0;
        let pointerStartScroll = 0;
        let pointerDragging = false;
        let pointerHeld = false;
        let suppressCardClick = false;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const hoverCapable = window.matchMedia('(hover: hover)');
        const shell = track.closest('.fnb-carousel-shell');
        const stopAuto = () => {
            window.clearInterval(autoTimer);
            shell?.classList.add('is-paused');
        };
        const startAuto = () => {
            window.clearInterval(autoTimer);
            const shouldPause = reducedMotion.matches || document.hidden || pointerHeld
                || (hoverCapable.matches && !!shell?.matches(':hover'))
                || !!shell?.contains(document.activeElement);
            shell?.classList.toggle('is-paused', shouldPause);
            if (!shouldPause) autoTimer = window.setInterval(() => moveNewsCarousel(1, true), 6500);
        };
        $('fnb-carousel-prev')?.addEventListener('click', () => { moveNewsCarousel(-1, true); startAuto(); });
        $('fnb-carousel-next')?.addEventListener('click', () => { moveNewsCarousel(1, true); startAuto(); });
        track.addEventListener('keydown', event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            moveNewsCarousel(event.key === 'ArrowRight' ? 1 : -1, true);
            startAuto();
        });
        track.addEventListener('scroll', () => {
            window.clearTimeout(scrollTimer);
            scrollTimer = window.setTimeout(() => syncNewsCarouselUI(), 180);
        }, { passive: true });
        track.addEventListener('pointerdown', event => {
            pointerHeld = true;
            pointerStartX = event.clientX;
            pointerStartScroll = track.scrollLeft;
            pointerDragging = false;
            suppressCardClick = false;
            if (event.pointerType === 'mouse' && event.button === 0) track.setPointerCapture?.(event.pointerId);
        });
        track.addEventListener('pointermove', event => {
            if (event.pointerType === 'mouse' && !(event.buttons & 1)) return;
            const distance = event.clientX - pointerStartX;
            if (Math.abs(distance) > 6) {
                pointerDragging = true;
                suppressCardClick = true;
                if (event.pointerType === 'mouse') {
                    track.classList.add('is-dragging');
                    track.scrollLeft = pointerStartScroll - distance;
                }
            }
        });
        const finishPointerDrag = event => {
            pointerHeld = false;
            if (event?.pointerType === 'mouse' && track.hasPointerCapture?.(event.pointerId)) track.releasePointerCapture?.(event.pointerId);
            track.classList.remove('is-dragging');
            if (pointerDragging && event?.pointerType === 'mouse') {
                const settled = getNewsCarouselState();
                syncNewsCarouselUI(settled.index);
                scrollNewsCarouselToCard(track, settled.cards[settled.index]);
            }
            if (pointerDragging) window.setTimeout(() => { suppressCardClick = false; }, 80);
            pointerDragging = false;
            startAuto();
        };
        track.addEventListener('pointerup', finishPointerDrag);
        track.addEventListener('pointercancel', finishPointerDrag);
        track.addEventListener('click', event => {
            if (!suppressCardClick) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            suppressCardClick = false;
        }, true);
        shell?.addEventListener('mouseenter', stopAuto);
        shell?.addEventListener('mouseleave', startAuto);
        shell?.addEventListener('focusin', stopAuto);
        shell?.addEventListener('focusout', startAuto);
        shell?.addEventListener('pointerdown', stopAuto, { passive: true });
        window.addEventListener('resize', syncNewsCarouselUI, { passive: true });
        reducedMotion.addEventListener?.('change', startAuto);
        hoverCapable.addEventListener?.('change', startAuto);
        document.addEventListener('visibilitychange', () => document.hidden ? stopAuto() : startAuto());
        updateNewsCarouselUI();
        startAuto();
    }

    function bindEvents() {
        document.querySelectorAll('.ff-module').forEach(card => {
            card.addEventListener('click', event => { if (!event.target.closest('button')) openDetail(card.dataset.module); });
            card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail(card.dataset.module); } });
        });
        document.querySelectorAll('[data-open-module]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); openDetail(button.dataset.openModule); }));
        document.querySelectorAll('.ff-quote').forEach(button => button.addEventListener('click', () => {
            openDetail(button.dataset.module || 'bolsa', { symbol: button.dataset.symbol });
        }));
        $('bmv-symbol')?.addEventListener('change', event => markExchangeSelection(event.target.value));
        $('ff-supplement-market')?.addEventListener('change', event => {
            state.supplementMarket = event.target.value;
            renderBolsaSupplement();
        });
        document.querySelectorAll('[data-detail-module]').forEach(button => button.addEventListener('click', () => openDetail(button.dataset.detailModule)));
        document.querySelectorAll('[data-returns-curve]').forEach(button => button.addEventListener('click', () => {
            if (button.disabled) return;
            state.returnsCurve = button.dataset.returnsCurve;
            renderReturnsPanel();
        }));
        document.querySelectorAll('[data-returns-mode]').forEach(button => button.addEventListener('click', () => {
            state.returnsMode = button.dataset.returnsMode;
            renderReturnsPanel();
        }));
        $('returns-chart-mode')?.addEventListener('change', event => {
            state.returnsMode = event.target.value;
            renderReturnsPanel();
        });
        $('returns-table-sort')?.addEventListener('change', event => {
            state.returnsTableSort = event.target.value;
            const curve = getReturnsCurves()[state.returnsCurve];
            if (curve) renderReturnsTable(curve);
        });
        $('returns-reference-country')?.addEventListener('change', event => {
            state.returnsReferenceCountry = event.target.value;
            const curve = getReturnsCurves()[state.returnsCurve];
            if (curve) renderReturnsChart(curve);
        });
        document.querySelectorAll('[data-returns-global-mode]').forEach(button => button.addEventListener('click', () => {
            state.returnsGlobalMode = button.dataset.returnsGlobalMode;
            renderReturnsGlobal();
            if (state.returnsGlobalMode === 'sovereign') loadReturnsGlobalData();
        }));
        document.querySelectorAll('[data-returns-jump]').forEach(button => button.addEventListener('click', () => {
            $(button.dataset.returnsJump)?.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                block: 'start',
            });
        }));
        $('returns-history-series')?.addEventListener('change', event => {
            state.returnsHistorySeries = event.target.value;
            loadReturnsHistory();
        });
        $('returns-history-country')?.addEventListener('change', event => {
            state.returnsHistoryCountry = event.target.value;
            state.returnsHistorySeries = '';
            syncReturnsHistorySeries();
            loadReturnsHistory();
        });
        document.querySelectorAll('[data-returns-years]').forEach(button => button.addEventListener('click', () => {
            state.returnsHistoryYears = +button.dataset.returnsYears;
            document.querySelectorAll('[data-returns-years]').forEach(item => {
                const active = item === button; item.classList.toggle('is-active', active); item.setAttribute('aria-pressed', String(active));
            });
            loadReturnsHistory();
        }));
        $('ff-back-overview')?.addEventListener('click', closeDetail);
        $('ff-periods')?.addEventListener('click', event => {
            const button = event.target.closest('[data-period]');
            if (!button) return;
            state.period = button.dataset.period;
            document.querySelectorAll('#ff-periods button').forEach(item => item.classList.toggle('is-active', item === button));
            renderMainChart();
        });
        $('ff-indicator')?.addEventListener('change', event => { state.indicator = event.target.value; const label = event.target.selectedOptions[0]?.textContent; $('ff-workspace-title').textContent = label || moduleConfig[state.module].title; renderMainChart(); });
        $('ff-compare')?.addEventListener('change', event => { state.compare = event.target.value; renderMainChart(); });
        $('ff-date-from')?.addEventListener('change', renderMainChart);
        document.querySelectorAll('[data-chart-mode]').forEach(button => button.addEventListener('click', () => {
            state.chartMode = button.dataset.chartMode;
            document.querySelectorAll('[data-chart-mode]').forEach(item => {
                const active = item === button;
                item.classList.toggle('is-active', active);
                item.setAttribute('aria-pressed', String(active));
            });
            renderMainChart();
        }));
        $('ff-chart-retry')?.addEventListener('click', renderMainChart);
        $('ff-refresh')?.addEventListener('click', async () => { state.marketSeries.clear(); if (typeof refreshAll === 'function') refreshAll().catch(() => {}); await loadCoreData(); loadNews(); });
        $('ff-table-filter')?.addEventListener('change', renderDetailTable);
        $('ff-table-search')?.addEventListener('input', renderDetailTable);
        document.querySelectorAll('.ff-table-card th button[data-sort]').forEach(button => button.addEventListener('click', () => {
            const key = button.dataset.sort;
            state.sort.direction = state.sort.key === key ? state.sort.direction * -1 : -1;
            state.sort.key = key; renderDetailTable();
        }));
        $('ff-sort-breakdown')?.addEventListener('click', () => { state.breakdownDescending = !state.breakdownDescending; renderBreakdown(); });
        document.querySelectorAll('[data-news-filter]').forEach(button => button.addEventListener('click', () => {
            state.newsFilter = button.dataset.newsFilter;
            state.newsArchiveLimit = 8;
            document.querySelectorAll('[data-news-filter]').forEach(item => {
                const active = item === button;
                item.classList.toggle('is-active', active);
                item.setAttribute('aria-pressed', String(active));
            });
            const toolbar = button.closest('.fnb-toolbar');
            toolbar?.classList.remove('is-changing');
            if (toolbar) void toolbar.offsetWidth;
            toolbar?.classList.add('is-changing');
            renderNews();
            window.setTimeout(() => toolbar?.classList.remove('is-changing'), 520);
        }));
        const renderCurrentArchive = () => renderNewsArchive(state.news.filter(item => (
            state.newsFilter === 'all' || classifyNews(item) === state.newsFilter
        )));
        $('fnb-archive-search')?.addEventListener('input', event => {
            state.newsArchiveQuery = event.target.value || '';
            state.newsArchiveLimit = 8;
            renderCurrentArchive();
        });
        document.querySelectorAll('[data-archive-sort]').forEach(button => button.addEventListener('click', () => {
            state.newsArchiveSort = button.dataset.archiveSort;
            state.newsArchiveLimit = 8;
            document.querySelectorAll('[data-archive-sort]').forEach(item => {
                const active = item === button;
                item.classList.toggle('is-active', active);
                item.setAttribute('aria-pressed', String(active));
            });
            renderCurrentArchive();
        }));
        $('fnb-archive-more-button')?.addEventListener('click', () => {
            state.newsArchiveLimit += 8;
            renderCurrentArchive();
            window.requestAnimationFrame(() => $('fnb-archive-more-button')?.focus({ preventScroll: true }));
        });
        document.addEventListener('keydown', event => {
            if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase('es') !== 'k') return;
            const search = $('fnb-archive-search');
            if (!search || !document.querySelector('.fnb-newsroom')) return;
            event.preventDefault();
            search.focus();
            search.select();
            $('fnb-archive-section')?.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                block: 'start',
            });
        });
        const scrollTrack = (id, direction) => $(id)?.scrollBy({ left: direction * Math.min(330, $(id).clientWidth * .75), behavior: 'smooth' });
        $('ff-news-prev')?.addEventListener('click', () => scrollTrack('ff-headline-track', -1));
        $('ff-news-next')?.addEventListener('click', () => scrollTrack('ff-headline-track', 1));
        let railOffset = 0;
        const moveRail = direction => {
            const track = $('ff-market-track'), max = Math.max(0, track.scrollWidth - track.parentElement.clientWidth);
            railOffset = Math.max(0, Math.min(max, railOffset + direction * 175));
            track.style.transform = `translateX(-${railOffset}px)`;
        };
        $('ff-rail-prev')?.addEventListener('click', () => moveRail(-1));
        $('ff-rail-next')?.addEventListener('click', () => moveRail(1));
        $('ff-open-news')?.addEventListener('click', loadNews);
        document.querySelectorAll('[data-definition]').forEach(button => button.setAttribute('title', button.querySelector('small')?.textContent || 'Definición financiera'));
        document.querySelectorAll('[data-close-news-reader]').forEach(button => button.addEventListener('click', closeNewsReader));
        document.addEventListener('keydown', event => {
            const reader = $('ff-news-reader');
            if (!reader || reader.hidden) return;
            if (event.key === 'Escape') { closeNewsReader(); return; }
            if (event.key !== 'Tab') return;
            const focusable = [...reader.querySelectorAll('a[href]:not([hidden]),button:not([disabled])')];
            if (!focusable.length) return;
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        });
    }

    function init() {
        if (!$('favro-finance')) return;
        if ($('ff-table-search')) $('ff-table-search').value = '';
        if ($('ff-table-filter')) $('ff-table-filter').value = 'all';
        document.querySelectorAll('[data-chart-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.classList.contains('is-active'))));
        document.querySelectorAll('[data-returns-years]').forEach(button => button.setAttribute('aria-pressed', String(button.classList.contains('is-active'))));
        bindEvents();
        setupNativeNewsNavigation();
        setupNewsCoverageCarousel();
        renderInsights();
        updateControls();
        loadCoreData();
        loadNews();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();


function ncMove(dir) {
    _ncPage = Math.max(0, Math.min(_ncPages() - 1, _ncPage + dir));
    _ncApply();
}
function ncGoTo(pageIdx) { _ncPage = pageIdx; _ncApply(); }
function _ncApply() {
    const track = document.getElementById('ncTrack');
    const pages = _ncPages();
    if (track) track.style.transform = `translateY(-${_ncPage * NC_VISIBLE * NC_STEP}px)`;
    document.getElementById('ncBtnUp')?.toggleAttribute('disabled', _ncPage === 0);
    document.getElementById('ncBtnDown')?.toggleAttribute('disabled', _ncPage >= pages - 1);
}
function _ncAutoStart() {
    if (_ncTimer) clearInterval(_ncTimer);
    if (_ncPages() <= 1) return;
    _ncTimer = setInterval(() => {
        _ncPage = _ncPage >= _ncPages() - 1 ? 0 : _ncPage + 1;
        _ncApply();
    }, 5000);
}
function ncFilter(cat, el) {
    document.querySelectorAll('.fpill').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    _ncItems = cat === 'all' ? _ncAllItems : _ncAllItems.filter(n => catSlug(n.categoria || n.category || '') === cat);
    _ncPage = 0;
    _ncRenderTrack();
}
function _ncRenderTrack() {
    const track    = document.getElementById('ncTrack');
    const viewport = document.getElementById('ncViewport');
    if (!track) return;
    const riskCl = ['risk-alto', 'risk-medio', 'risk-bajo'];
    const riskLb = ['▲ ALTO', '◆ MEDIO', '● MON.'];
    const CATS   = ['Mercados Globales', 'Divisas y Commodities', 'Mercados Globales'];
    const now    = new Date();
    const fd     = now.toLocaleDateString('es-MX', { day:'2-digit', month:'short' }).toUpperCase()
                 + (_ncHora ? ' · ' + _ncHora : '');
    track.innerHTML = _ncItems.map((n, i) => {
        const titulo  = n.titulo   || n.title    || 'Noticia financiera';
        const desc    = n.descripcion || n.description || '';
        const cat     = n.categoria || CATS[i % CATS.length];
        const fuente  = (n.fuente  || n.source   || 'API').toUpperCase();
        const impact  = (n.impacto || '').toLowerCase();
        const ci      = impact === 'alto' ? 0 : impact === 'medio' ? 1 : 2;
        const fecha   = n.fecha    || fd;
        const imgSrc  = (n.image?.startsWith('http') ? n.image : null)
                     || (_fhImgPool[i]?.startsWith('http') ? _fhImgPool[i] : null)
                     || _ncThemeImg[i] || '';
        const safeUrl = n.url ? n.url.replace(/"/g, '%22') : '';
        const slug    = catSlug(cat);
        const tag     = safeUrl ? 'a' : 'div';
        const attrs   = safeUrl
            ? `href="${safeUrl}" target="_blank" rel="noopener"`
            : `onclick="openNewsDetail(_ncItems[${i}])" role="button" tabindex="0"`;
        return `<${tag} class="nc-card" data-cat="${slug}" ${attrs}>
            ${imgSrc ? `<img class="nc-img" src="${imgSrc}" loading="lazy" onerror="this.style.opacity='.08'">` : '<div class="nc-img"></div>'}
            <div class="nc-body">
                <div class="nc-meta">
                    <span class="nc-cat">${cat}</span>
                    <span class="tag-risk ${riskCl[ci]}" style="font-size:.48rem;">${riskLb[ci]}</span>
                </div>
                <h3 class="nc-title">${titulo}</h3>
                <p class="nc-desc">${desc}</p>
                <div class="nc-foot">
                    <span class="nc-src">${fuente}</span>
                    <span class="nc-date">${fecha}</span>
                </div>
            </div>
        </${tag}>`;
    }).join('');
    const vpH = NC_VISIBLE * NC_CARD_H + (NC_VISIBLE - 1) * NC_GAP;
    if (viewport) viewport.style.height = vpH + 'px';

    _ncPage = 0;
    track.style.transform = 'translateY(0)';
    _ncApply();
    _ncAutoStart();
}
function renderNewsGrid(noticias, hora) {
    _ncHora     = hora || '';
    _ncAllItems = noticias.slice(0, 9);
    _ncItems    = _ncAllItems.slice();
    const activePill = document.querySelector('.fpill.active');
    if (activePill) {
        const cat = activePill.getAttribute('onclick')?.match(/ncFilter\('(\w+)'/)?.[1] || 'all';
        if (cat !== 'all') _ncItems = _ncAllItems.filter(n => catSlug(n.categoria || n.category || '') === cat);
    }
    _ncPage = 0;
    _ncRenderTrack();
}
// Tasas de referencia de bancos centrales — se actualizan dinámicamente desde /api/bond-yields
// Valores de arranque (fallback) mientras carga la API
var CENTRAL_BANKS = window.CENTRAL_BANKS || { fed: 4.50, bce: 2.65, boe: 4.50, boj: 0.50 };

/**
 * Actualiza CENTRAL_BANKS con los datos reales recibidos de /api/bond-yields.
 * El API devuelve un array de objetos { key, bonds:[{ yield }] }.
 * Claves: 'us' (Fed ≈ corto plazo), 'eu' (BCE), 'gb' (BOE), 'jp' (BOJ).
 */
function _syncCentralBanksFromBondData(bondData) {
    if (!Array.isArray(bondData)) return;
    bondData.forEach(entry => {
        if (!entry || !Array.isArray(entry.bonds) || !entry.bonds.length) return;
        const rate = entry.bonds[0].yield;
        if (rate == null || isNaN(rate)) return;
        switch (entry.key) {
            case 'us': {
                // Tomamos el tramo corto (3M) como proxy de Fed Funds si disponible
                const shortBond = entry.bonds.find(b => b.maturity === '3M');
                const usRate = shortBond?.yield ?? rate;
                if (usRate != null && !isNaN(usRate)) CENTRAL_BANKS.fed = +usRate.toFixed(2);
                break;
            }
            case 'eu': CENTRAL_BANKS.bce = +rate.toFixed(2); break;
            case 'gb': CENTRAL_BANKS.boe = +rate.toFixed(2); break;
            case 'jp': CENTRAL_BANKS.boj = +rate.toFixed(2); break;
        }
    });
    // Actualizar tooltips y raw-data panel si ya están renderizados
    ['fed','bce','boe','boj'].forEach(k => {
        const el = document.querySelector(`[data-rds-key="${k}"] .rds-val`);
        if (el && CENTRAL_BANKS[k] != null) el.textContent = CENTRAL_BANKS[k].toFixed(2) + '%';
    });
}

var _rds = window._rds || {};

 var RDS2_META = [
    // Tasas
    { key:'tiie',         lbl:'TIIE 28D',     icon:'🏦', cat:'tasas', fmt:'pct2', bar:[2,12],   tip:'Tasa Interbancaria de Equilibrio a 28 días. Base para el crédito en México, fijada por Banxico.',          interp: v => v>9?'🔴 Muy restrictiva · crédito caro':v>7?'🟠 Restrictiva':v>5?'🟡 Moderada':'🟢 Expansiva' },
    // 'fix' (Tasa Fix) e 'infl' (Inflación MX) se quitaron: sus series de Banxico
    // (SF43718 / SP74660) no están respondiendo y la fila se mostraba siempre vacía.
    { key:'fed',          lbl:'Fed Funds',     icon:'🇺🇸', cat:'tasas', fmt:'pct2', bar:[0,7],   tip:'Tasa de fondos federales de la Fed. Ancla global del costo de capital. Alta = USD fuerte, presión en EM.', interp: v => v>=5?'🔴 Restrictiva · dólar fuerte':'🟡 Normalización', staticVal: CENTRAL_BANKS.fed },
    { key:'bce',          lbl:'BCE',           icon:'🇪🇺', cat:'tasas', fmt:'pct2', bar:[0,5],   tip:'Tasa de depósito del Banco Central Europeo. Mueve al EUR/MXN y flujos en bonos europeos.',                 interp: v => v>3?'🔴 Restrictiva':'🟢 Relativamente laxa', staticVal: CENTRAL_BANKS.bce },
    { key:'boe',          lbl:'BOE',           icon:'🇬🇧', cat:'tasas', fmt:'pct2', bar:[0,7],   tip:'Banco de Inglaterra. Inflación post-Brexit mantiene tasas elevadas. Impacta GBP/MXN.',                     interp: v => v>4?'🔴 Restrictiva':'🟡 Moderada', staticVal: CENTRAL_BANKS.boe },
    { key:'boj',          lbl:'BOJ',           icon:'🇯🇵', cat:'tasas', fmt:'pct2', bar:[0,2],   tip:'Banco de Japón, en normalización histórica. Cada alza mueve fuerte al JPY/MXN.',                           interp: v => v<1?'🟢 Ultra expansiva':'🟡 Normalizando', staticVal: CENTRAL_BANKS.boj },
    // Mercados
    { key:'ipc',          lbl:'IPC BMV',       icon:'🇲🇽', cat:'mkt',   fmt:'pts0',              tip:'Índice de Precios y Cotizaciones. Barómetro de la renta variable mexicana.',                               interp:(v,p)=>p==null?'📊 Referencia BMV':p>0?`🟢 Subiendo ${p.toFixed(2)}%`:`🔴 Bajando ${Math.abs(p).toFixed(2)}%`, pctKey:'ipcPct' },
    { key:'sp500',        lbl:'S&P 500',       icon:'🇺🇸', cat:'mkt',   fmt:'pts2',              tip:'S&P 500: las 500 mayores empresas de EE.UU. Referente global de renta variable.',                          interp:(v,p)=>p==null?'📊 Índice global':p>0?`🟢 +${p.toFixed(2)}% hoy`:`🔴 ${p.toFixed(2)}% hoy`, pctKey:'sp500Pct' },
    { key:'nasdaq',       lbl:'NASDAQ 100',    icon:'💻', cat:'mkt',    fmt:'pts2',              tip:'Las 100 principales empresas tecnológicas. Sensible a tasas de la Fed y sentimiento de riesgo.',             interp:(v,p)=>p==null?'📊 Índice tech':p>0?`🟢 +${p.toFixed(2)}% hoy`:`🔴 ${p.toFixed(2)}% hoy`, pctKey:'nasdaqPct' },
    { key:'gold',         lbl:'Oro / oz',      icon:'🥇', cat:'mkt',    fmt:'usd2',              tip:'Oro al contado (USD/oz troy). Refugio ante inflación, incertidumbre geopolítica y debilitamiento del USD.',  interp: v => v>2500?'🟡 Máximos históricos · hedge demandado':v>2000?'🟡 Precio elevado':'🟢 Rango histórico', pctKey:'goldPct' },
    { key:'btc',          lbl:'BTC / USD',     icon:'₿',  cat:'mkt',    fmt:'usd0',              tip:'Bitcoin en USD. Indicador de apetito por activos de riesgo y liquidez global.',                             interp: v => v>80000?'🟡 Euforia':v>50000?'🟡 Bull market':'🔴 Corrección', pctKey:'btcPct' },
    { key:'dxy',          lbl:'DXY',           icon:'💵', cat:'mkt',    fmt:'pts2', bar:[90,115], tip:'Índice del dólar vs cesta de 6 divisas. DXY alto = presión en EM, materias primas y el MXN.',              interp: v => v>105?'🔴 Dólar muy fuerte':v>100?'🟠 Dólar fuerte':'🟢 Moderado', pctKey:'dxyPct' },
    // Riesgo
    { key:'vix',          lbl:'VIX',           icon:'⚡', cat:'risk',   fmt:'pts1', bar:[10,45],  tip:'"Índice del miedo". Volatilidad implícita del S&P 500. Alto = pánico; bajo = calma.',                      interp: v => v>=30?'🔴 Pánico · buscar refugio':v>=20?'🟠 Nerviosismo':v>=15?'🟡 Moderado':'🟢 Calma · risk-on' },
    { key:'creditSpread', lbl:'Sprd. HY',      icon:'📉', cat:'risk',   fmt:'spread',             tip:'Diferencial HYG−LQD (retorno diario). Negativo = bonos basura bajo presión vs investment grade.',           interp: v => v<-0.5?'🔴 Estrés crediticio':v<0?'🟠 Ligera presión':'🟢 Condiciones estables' },
    { key:'wti',          lbl:'WTI / bbl',     icon:'🛢', cat:'risk',   fmt:'usd2', bar:[40,110], tip:'West Texas Intermediate. Impacta ingresos de Pemex, inflación y balanza de pagos de México.',              interp: v => v>100?'🔴 Alto · inflación energética':v>70?'🟡 Equilibrado':'🟢 Bajo', pctKey:'wtiPct' },
    { key:'brent',        lbl:'Brent / bbl',   icon:'⛽', cat:'risk',   fmt:'usd2', bar:[40,115], tip:'Petróleo Brent (referencia global). Correlacionado con WTI; referencia para gasolinas.',                   interp: v => v>105?'🔴 Alto':v>75?'🟡 Equilibrado':'🟢 Bajo', pctKey:'brentPct' },
    { key:'cds',          lbl:'CDS MX 5Y',     icon:'🛡', cat:'risk',   fmt:'static', staticStr:'~95 bps', tip:'Credit Default Swap soberano a 5Y. Mide el costo de asegurar deuda mexicana. Sube con riesgo fiscal o político.', interp: ()=>'🟡 Moderado · valor referencial, no tiempo real' },
];

function _rdsFmtVal(m) {
    if (m.fmt === 'static') return m.staticStr || '—';
    const raw = m.staticVal !== undefined ? m.staticVal : _rds[m.key];
    if (raw == null) return '<span class="rds-sk" style="width:40px;height:11px;display:inline-block;vertical-align:middle;margin-top:.1rem;"></span>';
    const v = parseFloat(raw);
    if (isNaN(v)) return '—';
    if (m.fmt === 'pct2')   return v.toFixed(2) + '%';
    if (m.fmt === 'pts0')   return v.toLocaleString('es-MX', {maximumFractionDigits:0});
    if (m.fmt === 'pts1')   return v.toFixed(1);
    if (m.fmt === 'pts2')   return v.toLocaleString('es-MX', {minimumFractionDigits:2,maximumFractionDigits:2});
    if (m.fmt === 'usd0')   return '$' + v.toLocaleString('es-MX', {maximumFractionDigits:0});
    if (m.fmt === 'usd2')   return '$' + v.toLocaleString('es-MX', {minimumFractionDigits:2,maximumFractionDigits:2});
    if (m.fmt === 'spread') return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
    return v.toFixed(2);
}

function _rdsPctBadge(m) {
    if (!m.pctKey) return '';
    const pct = _rds[m.pctKey];
    if (pct == null) return '';
    const up = pct >= 0;
    return `<span class="rds2-cpct ${up?'up':'dn'}">${up?'▲ +':'▼ '}${Math.abs(pct).toFixed(2)}%</span>`;
}
function _rdsBarHtml(m) {
    if (!m.bar) return '';
    const raw = m.staticVal !== undefined ? m.staticVal : _rds[m.key];
    if (raw == null) return '';
    const v = parseFloat(raw);
    const pct = Math.max(0, Math.min(100, (v - m.bar[0]) / (m.bar[1] - m.bar[0]) * 100));
    const col = pct > 68 ? '#ef4444' : pct > 38 ? '#f59e0b' : '#10b981';
    return `<div class="rds2-bar"><div style="width:${pct.toFixed(1)}%;background:${col};"></div></div>`;
}
function renderRawDataPanel() {
    const grid = document.getElementById('rds2-cards');
    if (!grid) return;
    const curTab = grid.dataset.activeTab || 'all';
    const isUpdate = grid.dataset.rendered === '1';
    const cats = [
        { id:'tasas', icon:'🏦', lbl:'Tasas Bancarias',  border:'#3b82f6' },
        { id:'mkt',   icon:'📈', lbl:'Mercados Clave',    border:'#10b981' },
        { id:'risk',  icon:'⚡', lbl:'Riesgo & Energía',  border:'#f59e0b' },
    ];
    function rowHtml(m, i) {
        const val  = _rdsFmtVal(m);
        const raw  = m.staticVal !== undefined ? m.staticVal : _rds[m.key];
        const v    = raw != null ? parseFloat(raw) : null;
        const pct  = m.pctKey ? _rds[m.pctKey] : null;
        const interpStr = (m.interp && v != null) ? m.interp(v, pct) : '';
        const dotCol = interpStr.startsWith('🔴') ? '#ef4444'
                     : interpStr.startsWith('🟠') ? '#f97316'
                     : interpStr.startsWith('🟡') ? '#f59e0b'
                     : interpStr.startsWith('🟢') ? '#10b981' : '#cbd5e1';
        let barHtml = '';
        if (m.bar && v != null) {
            const pBar = Math.max(0, Math.min(100, (v - m.bar[0]) / (m.bar[1] - m.bar[0]) * 100));
            const bCol = pBar > 68 ? '#ef4444' : pBar > 38 ? '#f59e0b' : '#10b981';
            barHtml = '<div class="rds3-bar" style="width:' + pBar.toFixed(1) + '%;background:' + bCol + ';"></div>';
        }
        let pctHtml = '<span class="rds3-pct"></span>';
        if (pct != null) {
            const up = pct >= 0;
            pctHtml = '<span class="rds3-pct ' + (up ? 'up' : 'dn') + '">' + (up ? '▲ +' : '▼ ') + Math.abs(pct).toFixed(2) + '%</span>';
        }
        const flash = isUpdate ? ' rds3-flash' : '';
        return '<div class="rds3-row report-card' + flash + '" data-idx="' + i + '" role="button" tabindex="0" title="Abrir reporte de ' + m.lbl + '" onclick="openRawMetricReport(' + i + ')" onkeydown="reportCardKey(event,()=>openRawMetricReport(' + i + '))">'
            + '<div class="rds3-dot" style="background:' + dotCol + ';"></div>'
            + '<span class="rds3-lbl">' + m.lbl + '</span>'
            + '<span class="rds3-val">' + val + '</span>'
            + pctHtml + barHtml + '</div>';
    }
    grid.innerHTML = cats.map(cat => {
        const metrics = RDS2_META.filter(m => m.cat === cat.id);
        const vis = (curTab !== 'all' && curTab !== cat.id) ? ' style="display:none"' : '';
        return '<div class="rds3-col" data-cat="' + cat.id + '"' + vis + '>'
            + '<div class="rds3-hdr" style="border-left:3px solid ' + cat.border + ';padding-left:.5rem;">' + cat.icon + ' ' + cat.lbl + '</div>'
            + metrics.map(m => rowHtml(m, RDS2_META.indexOf(m))).join('')
            + '</div>';
    }).join('');
    grid.dataset.rendered = '1';
    const updEl = document.getElementById('rds-upd');
    if (updEl && _rds.hora) updEl.textContent = 'Act. ' + _rds.hora;
}

function rdsSwitchTab(tab, btn) {
    document.querySelectorAll('.rds2-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const grid = document.getElementById('rds2-cards');
    if (!grid) return;
    grid.dataset.activeTab = tab;
    grid.querySelectorAll('.rds3-col').forEach(c => {
        c.style.display = (tab === 'all' || c.dataset.cat === tab) ? '' : 'none';
    });
    grid.querySelectorAll('.rds2-card').forEach(c => {
        c.classList.toggle('rds2-hidden', tab !== 'all' && c.dataset.cat !== tab);
    });
}
function rds2ShowTip(card, idx) {
    const m = RDS2_META[idx];
    if (!m) return;
    const tip = document.getElementById('rds2-tip-el');
    if (!tip) return;
    if (tip.dataset.openFor === String(idx) && tip.style.display !== 'none') {
        tip.style.display = 'none';
        tip.dataset.openFor = '';
        return;
    }
    const raw = m.staticVal !== undefined ? m.staticVal : _rds[m.key];
    const v   = raw != null ? parseFloat(raw) : null;
    const pct = m.pctKey ? _rds[m.pctKey] : null;
    const interpText = m.interp ? m.interp(v, pct) : '';
    tip.innerHTML = `<div class="rds2-tip-ttl">${m.icon} ${m.lbl}</div><div>${m.tip}</div>${interpText ? `<div class="rds2-tip-int">${interpText}</div>` : ''}`;
    tip.style.display = 'block';
    tip.dataset.openFor = String(idx);
    const r = card.getBoundingClientRect();
    const tipW = 232, tipH = tip.offsetHeight || 110;
    let left = r.left + window.scrollX;
    let top  = r.bottom + window.scrollY + 7;
    if (left + tipW > window.innerWidth - 8) left = window.innerWidth - tipW - 8;
    if (r.bottom + tipH + 14 > window.innerHeight) top = r.top + window.scrollY - tipH - 7;
    tip.style.left = Math.max(4, left) + 'px';
    tip.style.top  = top + 'px';
    setTimeout(() => document.addEventListener('click', function _d(e){ if(!card.contains(e.target)){tip.style.display='none';tip.dataset.openFor='';} document.removeEventListener('click',_d); }), 60);
}

function openRawMetricReport(idx) {
    const m = RDS2_META[idx];
    const overlay = document.getElementById('risk-modal-overlay');
    if (!m || !overlay) return;

    const raw = m.staticVal !== undefined ? m.staticVal : _rds[m.key];
    const numeric = raw != null ? parseFloat(raw) : null;
    const pct = m.pctKey ? _rds[m.pctKey] : null;
    const value = _rdsFmtVal(m).replace(/<[^>]+>/g, '').trim() || '—';
    const interpretation = m.interp ? m.interp(numeric, pct) : 'Lectura informativa';
    const cleanInterpretation = interpretation.replace(/^[🔴🟠🟡🟢📊]\s*/, '');
    const category = m.cat === 'tasas' ? 'Tasas bancarias' : m.cat === 'mkt' ? 'Mercados clave' : 'Riesgo y energía';
    const change = pct != null ? (pct >= 0 ? '+' : '') + Number(pct).toFixed(2) + '%' : 'Sin variación diaria disponible';
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'});
    const dateStr = now.toLocaleDateString('es-MX', {weekday:'long', year:'numeric', month:'long', day:'numeric'});
    const row = (label, val) => '<div class="bm-metric-row"><span class="bm-metric-lbl">' + label + '</span><span class="bm-metric-val">' + val + '</span></div>';
    const metrics = row('Categoría', category)
        + row('Valor actual', value)
        + row('Variación', change)
        + row('Lectura de mercado', cleanInterpretation)
        + row('Actualización', _rds.hora || timeStr);

    document.getElementById('rm-icon').textContent = m.icon;
    document.getElementById('rm-title').textContent = m.lbl;
    document.getElementById('rm-sub').textContent = category + ' · Resumen en tiempo real';
    document.getElementById('rm-val-big').textContent = value;
    const badge = document.getElementById('rm-level-badge');
    badge.textContent = cleanInterpretation;
    badge.style.background = 'rgba(255,255,255,.14)';
    badge.style.color = '#fff';
    document.getElementById('rm-upd').textContent = 'Act. ' + (_rds.hora || timeStr) + ' · VALL News';
    document.getElementById('rm-metrics').innerHTML = metrics;
    document.getElementById('rm-analysis').innerHTML = '<strong>Interpretación:</strong> ' + m.tip + '<br><br><strong>Lectura actual:</strong> ' + cleanInterpretation + '.';
    document.getElementById('rm-report').textContent = [
        '========================================',
        'REPORTE DE INDICADOR FINANCIERO',
        'VALL News -- Inteligencia Economica',
        '========================================',
        'Indicador:          ' + m.lbl,
        'Categoria:          ' + category,
        'Valor actual:       ' + value,
        'Variacion:          ' + change,
        'Lectura:            ' + cleanInterpretation,
        'Fecha:              ' + dateStr,
        'Hora:               ' + timeStr + ' (hora local)',
        '',
        '--- CONTEXTO ----------------------------',
        m.tip,
        '',
        '--- NOTAS -------------------------------',
        'Fuente: VALL News / proveedores de mercado.',
        'Este reporte es de caracter informativo.',
        'VALL News no ofrece asesoria de inversion.',
        '========================================'
    ].join('\n');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function renderFxStrip(fx) {
    const strip = document.getElementById('fxStrip');
    if (!strip || !fx) return;
    const pairs = [
        { pair:'USD/MXN', flag:'🇺🇸', val:fx.usdmxn, note:'Dólar EUA'         },
        { pair:'EUR/MXN', flag:'🇪🇺', val:fx.eurmxn, note:'Euro'               },
        { pair:'GBP/MXN', flag:'🇬🇧', val:fx.gbpmxn, note:'Libra Esterlina'    },
        { pair:'JPY/MXN', flag:'🇯🇵', val:fx.jpymxn, note:'Yen Japonés (×100)' },
        { pair:'BRL/MXN', flag:'🇧🇷', val:fx.brlmxn, note:'Real Brasileño'     },
        { pair:'CAD/MXN', flag:'🇨🇦', val:fx.cadmxn, note:'Dólar Canadiense'   },
    ].filter(p => p.val && isFinite(p.val));
    if (!pairs.length) return;
    strip.innerHTML = pairs.map(p => {
        const display = p.pair.startsWith('JPY') ? (p.val * 100).toFixed(4) : p.val.toFixed(2);
        return `<div class="fx-card">
            <span class="fx-flag">${p.flag}</span>
            <span class="fx-pair">${p.pair}</span>
            <span class="fx-val">$${display}</span>
            <span class="fx-note">${p.note}</span>
        </div>`;
    }).join('');
    strip.style.display = 'flex';
    const fxSec = document.getElementById('fx-section');
    if (fxSec) fxSec.style.display = '';
}
async function loadFxStrip() {
    const FX_PAIRS = [
        { ticker: 'USDMXN=X', flag: '🇺🇸', label: 'USD/MXN', note: 'Dólar EUA',        mode: 'direct'    },
        { ticker: 'EURUSD=X', flag: '🇪🇺', label: 'EUR/MXN', note: 'Euro',              mode: 'eur_cross' },
        { ticker: 'GBPUSD=X', flag: '🇬🇧', label: 'GBP/MXN', note: 'Libra Esterlina',  mode: 'gbp_cross' },
        { ticker: 'USDJPY=X', flag: '🇯🇵', label: 'JPY/MXN', note: 'Yen (×100)',        mode: 'jpy_cross' },
        { ticker: 'USDBRL=X', flag: '🇧🇷', label: 'BRL/MXN', note: 'Real Brasileño',   mode: 'brl_cross' },
        { ticker: 'USDCAD=X', flag: '🇨🇦', label: 'CAD/MXN', note: 'Dólar Canadiense', mode: 'cad_cross' },
        { ticker: 'USDCNY=X', flag: '🇨🇳', label: 'CNY/MXN', note: 'Yuan Chino',        mode: 'cny_cross' },
    ];
    try {
        const results  = await Promise.allSettled(FX_PAIRS.map(p => fetchAssetData(p.ticker)));
        const baseMeta = results[0].status === 'fulfilled' ? results[0].value?.meta : null;
        const usdmxn   = baseMeta?.regularMarketPrice;
        const usdmxnPct= baseMeta?.regularMarketChangePercent;
        if (!usdmxn) throw new Error('USD/MXN no disponible');

        const strip = document.getElementById('fxStrip');
        if (!strip) return;

        const items = FX_PAIRS.map((p, i) => {
            const meta    = results[i].status === 'fulfilled' ? results[i].value?.meta    : null;
            const candles = results[i].status === 'fulfilled' ? results[i].value?.candles : null;
            const rawPx   = meta?.regularMarketPrice;
            const rawPct  = meta?.regularMarketChangePercent;
            let price, pct;
            if      (p.mode === 'direct')    { price = rawPx; pct = rawPct; }
            else if (p.mode === 'eur_cross') { price = rawPx ? rawPx * usdmxn : null; pct = (rawPct != null && usdmxnPct != null) ? rawPct + usdmxnPct : null; }
            else if (p.mode === 'gbp_cross') { price = rawPx ? rawPx * usdmxn : null; pct = (rawPct != null && usdmxnPct != null) ? rawPct + usdmxnPct : null; }
            else if (p.mode === 'jpy_cross') { price = rawPx ? (usdmxn / rawPx) * 100 : null; pct = (rawPct != null && usdmxnPct != null) ? usdmxnPct - rawPct : null; }
            else                             { price = rawPx ? usdmxn / rawPx : null; pct = (rawPct != null && usdmxnPct != null) ? usdmxnPct - rawPct : null; }
            return { pair: p, meta, candles, price, pct, rawPx };
        });

        _fxData = items;

        const cards = items.map((it, i) => {
            if (!it.price) return '';
            const { pair: p, price, pct } = it;
            const isUp  = (pct ?? 0) >= 0;
            const disp  = p.mode === 'jpy_cross' ? price.toFixed(4) : price.toFixed(2);
            const pctHtml = pct != null
                ? `<span style="font-size:.55rem;font-weight:700;color:${isUp ? '#16a34a' : '#dc2626'};">${isUp ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%</span>` : '';
            return `<div class="fx-card" onclick="openFxDetail(${i})" style="cursor:pointer">
                <span class="fx-flag">${p.flag}</span>
                <span class="fx-pair">${p.label}</span>
                <span class="fx-val">$${disp}</span>
                ${pctHtml}
                <span class="fx-note">${p.note}</span>
            </div>`;
        }).filter(Boolean);

        if (cards.length) {
            strip.innerHTML = cards.join('');
            strip.style.display = 'flex';
            const fxSec = document.getElementById('fx-section');
            if (fxSec) fxSec.style.display = '';
        }
        renderFxProfessionalDashboard(items);
    } catch(e) {
        console.error('loadFxStrip error:', e);
        const references = [
            {ticker:'USDMXN=X',flag:'🇺🇸',label:'USD/MXN',note:'Dólar EUA',mode:'direct',price:17.85,pct:0.12},
            {ticker:'EURUSD=X',flag:'🇪🇺',label:'EUR/MXN',note:'Euro',mode:'eur_cross',price:20.91,pct:-0.08},
            {ticker:'GBPUSD=X',flag:'🇬🇧',label:'GBP/MXN',note:'Libra Esterlina',mode:'gbp_cross',price:24.17,pct:0.16},
            {ticker:'USDJPY=X',flag:'🇯🇵',label:'JPY/MXN',note:'Yen (×100)',mode:'jpy_cross',price:11.42,pct:-0.22},
            {ticker:'USDBRL=X',flag:'🇧🇷',label:'BRL/MXN',note:'Real Brasileño',mode:'brl_cross',price:3.32,pct:0.05},
            {ticker:'USDCAD=X',flag:'🇨🇦',label:'CAD/MXN',note:'Dólar Canadiense',mode:'cad_cross',price:13.02,pct:-0.04},
            {ticker:'USDCNY=X',flag:'🇨🇳',label:'CNY/MXN',note:'Yuan Chino',mode:'cny_cross',price:2.46,pct:0.09}
        ];
        const indicativeRaw = {
            'USDMXN=X':17.85,
            'EURUSD=X':20.91/17.85,
            'GBPUSD=X':24.17/17.85,
            'USDJPY=X':17.85/(11.42/100),
            'USDBRL=X':17.85/3.32,
            'USDCAD=X':17.85/13.02,
            'USDCNY=X':17.85/2.46
        };
        const referencesWithMeta = references.map(ref => {
            const rawPx = indicativeRaw[ref.ticker];
            return {pair:{ticker:ref.ticker,flag:ref.flag,label:ref.label,note:ref.note,mode:ref.mode},meta:{regularMarketPrice:rawPx,regularMarketChangePercent:ref.pct},candles:[],price:ref.price,pct:ref.pct,rawPx,indicative:true};
        });
        _fxData = referencesWithMeta;
        renderFxProfessionalDashboard(referencesWithMeta);
        const upd = document.getElementById('fx-pro-updated');
        if (upd) upd.textContent = 'Datos de referencia · fuente en vivo no disponible';
    }
}

var _internationalFxBoard = [];

function buildInternationalFxBoard(items) {
    const find = ticker => items.find(item => item?.pair?.ticker === ticker);
    const raw = ticker => {
        const item = find(ticker);
        return item ? {
            price: Number(item.rawPx ?? item.meta?.regularMarketPrice),
            pct: Number(item.meta?.regularMarketChangePercent),
            candles: item.candles || []
        } : null;
    };
    const usdMxn = raw('USDMXN=X');
    const eurUsd = raw('EURUSD=X');
    const gbpUsd = raw('GBPUSD=X');
    const usdJpy = raw('USDJPY=X');
    const usdBrl = raw('USDBRL=X');
    const usdCad = raw('USDCAD=X');
    const usdCny = raw('USDCNY=X');
    const valid = value => Number.isFinite(value) && value > 0;
    const pctSum = (...values) => values.every(Number.isFinite) ? values.reduce((sum,value) => sum + value,0) : null;
    const pctDiff = (a,b) => Number.isFinite(a) && Number.isFinite(b) ? a-b : null;
    const pair = (label, flag, note, price, pct, decimals, source, context, candles) => ({label,flag,note,price,pct,decimals,source,context,candles:candles||[]});
    return [
        pair('EUR/USD','🇪🇺🇺🇸','Euro frente al dólar',eurUsd?.price,eurUsd?.pct,4,'Yahoo Finance · EURUSD=X','Principal cruce mundial. Refleja el diferencial de crecimiento y política monetaria entre la zona euro y Estados Unidos.',eurUsd?.candles),
        pair('GBP/USD','🇬🇧🇺🇸','Libra frente al dólar',gbpUsd?.price,gbpUsd?.pct,4,'Yahoo Finance · GBPUSD=X','Cruce sensible a las decisiones del Banco de Inglaterra, la Fed y las expectativas de crecimiento del Reino Unido.',gbpUsd?.candles),
        pair('USD/JPY','🇺🇸🇯🇵','Dólar frente al yen',usdJpy?.price,usdJpy?.pct,2,'Yahoo Finance · USDJPY=X','Barómetro del diferencial de tasas entre la Fed y el Banco de Japón, además de la demanda global por activos refugio.',usdJpy?.candles),
        pair('EUR/GBP','🇪🇺🇬🇧','Euro frente a la libra',valid(eurUsd?.price)&&valid(gbpUsd?.price)?eurUsd.price/gbpUsd.price:null,pctDiff(eurUsd?.pct,gbpUsd?.pct),4,'Cross-rate EUR/USD ÷ GBP/USD','Compara directamente las perspectivas monetarias y económicas de la zona euro y el Reino Unido.'),
        pair('EUR/JPY','🇪🇺🇯🇵','Euro frente al yen',valid(eurUsd?.price)&&valid(usdJpy?.price)?eurUsd.price*usdJpy.price:null,pctSum(eurUsd?.pct,usdJpy?.pct),2,'Cross-rate EUR/USD × USD/JPY','Cruce de apetito por riesgo y diferencial de tasas entre Europa y Japón.'),
        pair('GBP/JPY','🇬🇧🇯🇵','Libra frente al yen',valid(gbpUsd?.price)&&valid(usdJpy?.price)?gbpUsd.price*usdJpy.price:null,pctSum(gbpUsd?.pct,usdJpy?.pct),2,'Cross-rate GBP/USD × USD/JPY','Cruce de alta sensibilidad al riesgo global, las tasas británicas y la política monetaria japonesa.'),
        pair('USD/CAD','🇺🇸🇨🇦','Dólar frente al canadiense',usdCad?.price,usdCad?.pct,4,'Yahoo Finance · USDCAD=X','Sensible al diferencial Fed–Banco de Canadá, al petróleo y al ciclo comercial norteamericano.',usdCad?.candles),
        pair('USD/BRL','🇺🇸🇧🇷','Dólar frente al real',usdBrl?.price,usdBrl?.pct,4,'Yahoo Finance · USDBRL=X','Referencia de riesgo latinoamericano, tasas brasileñas, materias primas y flujos hacia mercados emergentes.',usdBrl?.candles),
        pair('USD/CNY','🇺🇸🇨🇳','Dólar frente al yuan',usdCny?.price,usdCny?.pct,4,'Yahoo Finance · USDCNY=X','Indicador de la política cambiaria china, tensiones comerciales y competitividad manufacturera global.',usdCny?.candles),
        pair('USD/MXN','🇺🇸🇲🇽','Dólar frente al peso',usdMxn?.price,usdMxn?.pct,4,'Yahoo Finance · USDMXN=X','Cruce mexicano dentro del tablero global. Reacciona al carry, la relación comercial con EE.UU. y el apetito por riesgo.',usdMxn?.candles)
    ].filter(item => valid(item.price));
}

function renderFxProfessionalDashboard(items) {
    const panel = document.getElementById('fx-pro-panel');
    if (!panel) return;
    items = Array.isArray(items) ? items.map((item,sourceIndex) => item ? ({...item,_sourceIndex:sourceIndex}) : null).filter(item => item && item.price != null) : [];
    const set = (id, value) => { const el = document.getElementById(id); if (el && value != null) el.textContent = value; };
    const formatPrice = item => item ? '$' + (item.pair.mode === 'jpy_cross' ? Number(item.price).toFixed(4) : Number(item.price).toFixed(2)) : '—';
    const setChange = (id, pct, fallback) => {
        const el = document.getElementById(id); if (!el) return;
        if (pct == null || !Number.isFinite(+pct)) { el.textContent = fallback; el.className = ''; return; }
        const n = +pct;
        el.textContent = `${n >= 0 ? '▲ +' : '▼ '}${Math.abs(n).toFixed(2)}% · ${n > 0 ? 'presión MXN' : n < 0 ? 'fortaleza MXN' : 'sin cambio'}`;
        el.className = n > 0 ? 'down' : n < 0 ? 'up' : '';
    };
    const usd = items.find(item => item.pair.label === 'USD/MXN') || _fxData?.[0];
    const eur = items.find(item => item.pair.label === 'EUR/MXN') || _fxData?.[1];
    const gbp = items.find(item => item.pair.label === 'GBP/MXN') || _fxData?.[2];
    set('fx-pro-usdmxn',formatPrice(usd)); setChange('fx-pro-usdmxn-chg',usd?.pct,'Peso mexicano');
    set('fx-pro-eurmxn',formatPrice(eur)); setChange('fx-pro-eurmxn-chg',eur?.pct,'Cruce europeo');
    set('fx-pro-gbpmxn',formatPrice(gbp)); setChange('fx-pro-gbpmxn-chg',gbp?.pct,'Libra esterlina');
    set('fx-pro-dxy',_rds.dxy == null ? '—' : (+_rds.dxy).toFixed(2));
    setChange('fx-pro-dxy-chg',_rds.dxyPct,'Fortaleza del dólar');
    const carry = _rds.tiie == null ? null : +_rds.tiie - CENTRAL_BANKS.fed;
    set('fx-pro-carry',carry == null ? '—' : `${carry >= 0 ? '+' : ''}${carry.toFixed(2)} pp`);

    const availablePct = items.filter(item => Number.isFinite(+item.pct));
    const favorable = availablePct.filter(item => +item.pct <= 0).length;
    const breadth = availablePct.length ? Math.round(favorable / availablePct.length * 100) : null;
    set('fx-pro-breadth',breadth == null ? '—' : breadth + '%');
    set('fx-pro-breadth-note',availablePct.length ? `${favorable} de ${availablePct.length} cruces favorecen al MXN` : 'Cruces favorables');
    const internationalBoard = buildInternationalFxBoard(items);
    _internationalFxBoard = internationalBoard;
    const globalPct = internationalBoard.filter(item => Number.isFinite(+item.pct));
    set('fx-pro-board-status',`${internationalBoard.length || 0} cruces globales`);

    if (globalPct.length) {
        const byAbs = globalPct.slice().sort((a,b) => Math.abs(+b.pct)-Math.abs(+a.pct));
        const leader = globalPct.slice().sort((a,b) => +b.pct-(+a.pct))[0];
        const maxPct = Math.max(...globalPct.map(item => +item.pct));
        const minPct = Math.min(...globalPct.map(item => +item.pct));
        set('fx-pro-largest',`${byAbs[0].flag} ${byAbs[0].label} · ${Math.abs(+byAbs[0].pct).toFixed(2)}%`);
        set('fx-pro-pressure',`${leader.flag} ${leader.label} · ${+leader.pct >= 0 ? '+' : ''}${(+leader.pct).toFixed(2)}%`);
        set('fx-pro-dispersion',(maxPct-minPct).toFixed(2)+' pp');
    }

    const grid = document.getElementById('fx-pro-pair-grid');
    if (grid && internationalBoard.length) {
        const maxMove = Math.max(.1,...globalPct.map(item => Math.abs(+item.pct)));
        grid.innerHTML = internationalBoard.map((item,index) => {
            const pct = Number.isFinite(+item.pct) ? +item.pct : null;
            const tone = pct == null ? '#94a3b8' : pct > 0 ? '#059669' : pct < 0 ? '#dc2626' : '#64748b';
            const direction = pct == null ? 'Pendiente' : pct > 0 ? 'Base gana' : pct < 0 ? 'Base cede' : 'Estable';
            const width = pct == null ? 12 : Math.max(10,Math.min(100,Math.abs(pct)/maxMove*100));
            const quote = Number(item.price).toLocaleString('es-MX',{minimumFractionDigits:item.decimals,maximumFractionDigits:item.decimals});
            return `<article class="fx-pro-pair report-card" style="--pair-tone:${tone}" role="button" tabindex="0" title="Abrir reporte de ${item.label}" onclick="openInternationalFxReport(${index})" onkeydown="reportCardKey(event,()=>openInternationalFxReport(${index}))">
                <div class="fx-pro-pair-head"><div class="fx-pro-pair-name"><span class="fx-pro-pair-flag">${item.flag}</span><span><strong>${item.label}</strong><small>${item.note}</small></span></div><em class="${pct != null && pct > 0 ? 'down' : 'up'}">${direction}</em></div>
                <div class="fx-pro-pair-value"><strong>${quote}</strong><span>${pct == null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}</span></div>
                <div class="fx-pro-pair-track"><i style="width:${width}%"></i></div>
                <div class="fx-pro-pair-foot"><span>${item.source.startsWith('Cross-rate') ? 'Cross-rate calculado' : 'Cotización internacional'}</span><i class="fas fa-chevron-right"></i></div>
            </article>`;
        }).join('');
    }

    const usdPct = Number.isFinite(+usd?.pct) ? +usd.pct : 0;
    const dxy = Number.isFinite(+_rds.dxy) ? +_rds.dxy : 100;
    let score = 50 - usdPct * 34 - Math.max(-12,Math.min(12,(dxy-100)*2));
    if (carry != null) score += Math.max(-8,Math.min(14,(carry-2)*4));
    score = Math.round(Math.max(8,Math.min(92,score)));
    const regimePanel = document.getElementById('fx-pro-regime-panel');
    if (regimePanel) regimePanel.style.setProperty('--fx-score',score+'%');
    const marker = document.getElementById('fx-pro-regime-marker'); if (marker) marker.style.left = score+'%';
    set('fx-pro-score',score);
    const regime = score >= 65 ? 'Peso con sesgo de fortaleza' : score <= 35 ? 'Peso bajo presión' : 'Mercado cambiario equilibrado';
    const badge = score >= 65 ? 'Fortaleza relativa' : score <= 35 ? 'Presión cambiaria' : 'Rango neutral';
    const copy = score >= 65 ? 'El carry y la sesión favorecen al peso; conviene vigilar una reversión del apetito global por riesgo.' : score <= 35 ? 'El dólar global y el movimiento spot limitan al peso; la liquidez y volatilidad requieren mayor atención.' : 'Las señales de spot, dólar global y diferencial de tasas no muestran una dirección extrema.';
    set('fx-pro-regime-title',regime); set('fx-pro-regime-badge',badge); set('fx-pro-regime-copy',copy);
    set('fx-pro-signal-dollar',_rds.dxy == null ? 'Pendiente' : dxy > 105 ? 'Dólar muy fuerte' : dxy > 100 ? 'Dólar firme' : 'Dólar moderado');
    set('fx-pro-signal-carry',carry == null ? 'Pendiente' : `${carry >= 0 ? '+' : ''}${carry.toFixed(2)} pp`);
    set('fx-pro-signal-session',usd?.pct == null ? 'Pendiente' : usdPct > .15 ? 'Presión sobre MXN' : usdPct < -.15 ? 'MXN se fortalece' : 'Sesión estable');
    set('fx-catalyst-rates',carry == null ? 'Diferencial de tasas pendiente' : `${carry.toFixed(2)} pp favorecen el carry en MXN`);
    set('fx-catalyst-dollar',_rds.dxy == null ? 'Esperando DXY' : `DXY ${dxy.toFixed(2)} · ${dxy > 105 ? 'zona fuerte' : dxy > 100 ? 'zona firme' : 'zona moderada'}`);
    set('fx-catalyst-risk',_rds.vix == null ? 'Volatilidad bajo observación' : `VIX ${(+_rds.vix).toFixed(1)} · ${+_rds.vix < 15 ? 'calma' : +_rds.vix < 25 ? 'riesgo moderado' : 'estrés elevado'}`);
    set('fx-pro-thesis-title',regime);
    set('fx-pro-thesis-copy',`${copy} ${breadth == null ? '' : `El peso avanza en ${favorable} de ${availablePct.length} cruces disponibles.`}`.trim());
    set('fx-pro-updated','Actualizado '+new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}));
    set('sidebar-pulse-usdmxn',formatPrice(usd));
    set('sidebar-pulse-usdmxn-note',usd?.pct == null ? 'Tipo de cambio' : `${+usd.pct >= 0 ? '▲ +' : '▼ '}${Math.abs(+usd.pct).toFixed(2)}% sesión`);
    set('sidebar-pulse-dxy',_rds.dxy == null ? '—' : (+_rds.dxy).toFixed(2));
    set('sidebar-pulse-dxy-note',_rds.dxy == null ? 'Dólar global' : dxy > 105 ? 'Dólar muy fuerte' : dxy > 100 ? 'Dólar firme' : 'Dólar moderado');
    set('sidebar-pulse-vix',_rds.vix == null ? '—' : (+_rds.vix).toFixed(1));
    set('sidebar-pulse-vix-note',_rds.vix == null ? 'Volatilidad' : +_rds.vix < 15 ? 'Calma' : +_rds.vix < 25 ? 'Riesgo moderado' : 'Estrés elevado');
    set('sidebar-pulse-carry',carry == null ? '—' : `${carry >= 0 ? '+' : ''}${carry.toFixed(2)} pp`);
    set('sidebar-pulse-reading',`${regime}. ${breadth == null ? 'La amplitud cambiaria sigue en actualización.' : `${favorable} de ${availablePct.length} cruces disponibles favorecen al peso.`}`);
}

function openFxSectionReport(kind) {
    const text = id => (document.getElementById(id)?.textContent || '').trim();
    const score = Number(text('fx-pro-score'));
    const breadth = Number.parseFloat(text('fx-pro-breadth'));
    const carry = Number.parseFloat(text('fx-pro-carry'));
    const globalPairs = Array.isArray(_internationalFxBoard) ? _internationalFxBoard : [];
    const emergingPairs = globalPairs.filter(item => ['USD/MXN','USD/BRL','USD/CNY'].includes(item.label));
    const configs = {
        breadth: {
            label:'Amplitud del peso mexicano', sub:'CRUCES INTERNACIONALES FRENTE AL MXN', metricLabel:'Amplitud', value:Number.isFinite(breadth)?breadth:null, suffix:'%',
            context:`La amplitud resume cuántos cruces internacionales favorecen al peso. ${text('fx-pro-breadth-note') || 'La lectura compara dirección y consistencia entre las principales divisas.'}`
        },
        regime: {
            label:'Régimen cambiario del peso', sub:'MODELO DE FORTALEZA RELATIVA VALLNEWS', metricLabel:'Puntuación', value:Number.isFinite(score)?score:null, suffix:'/100',
            context:`${text('fx-pro-regime-title')}. ${text('fx-pro-regime-copy')} Señales: dólar global ${text('fx-pro-signal-dollar')}; diferencial ${text('fx-pro-signal-carry')}; sesión ${text('fx-pro-signal-session')}.`
        },
        catalysts: {
            label:'Catalizadores del mercado cambiario', sub:'TASAS · DÓLAR · FLUJOS · VOLATILIDAD', metricLabel:'Carry MX', value:Number.isFinite(carry)?carry:null, suffix:' pp',
            context:[...document.querySelectorAll('.fx-catalyst-list > div')].map(card => (card.textContent||'').trim().replace(/\s+/g,' ')).join(' · ')
        },
        emerging: {
            label:'Divisas emergentes frente al dólar', sub:'COMPARACIÓN REGIONAL DE MONEDAS', metricLabel:'Cruces', value:emergingPairs.length, suffix:' analizados',
            context:emergingPairs.length ? emergingPairs.map(item => `${item.label}: ${Number.isFinite(+item.pct)?(+item.pct>=0?'+':'')+(+item.pct).toFixed(2)+'%':'sin dato'}`).join(' · ') : 'La comparación regional evalúa la dirección diaria de monedas emergentes frente al dólar.'
        },
        thesis: {
            label:'Tesis cambiaria VALLNews', sub:'LECTURA INTEGRADA DE FOREX', metricLabel:'Fortaleza', value:Number.isFinite(score)?score:null, suffix:'/100',
            context:`${text('fx-pro-thesis-title')}. ${text('fx-pro-thesis-copy')}`
        }
    };
    const config = configs[kind];
    if (!config) return;
    openMktEntry({
        asset:{label:config.label,ticker:'MODELO FX',sub:config.sub,metricLabel:config.metricLabel,valueSuffix:config.suffix,context:config.context},
        meta:{regularMarketPrice:config.value,regularMarketChangePercent:null},
        candles:[]
    });
}

async function loadBitcoinDominance() {
    try {
        const r = await fetch('/api/crypto-global');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const { data } = await r.json();
        const btcDom = data?.market_cap_percentage?.btc;
        const totalCap = data?.total_market_cap?.usd;
        const capChg24 = data?.market_cap_change_percentage_24h_usd;
        const domEl    = document.getElementById('btc-dom');
        const noteEl   = document.getElementById('btc-dom-note');
        const capEl    = document.getElementById('crypto-cap');
        const capChgEl = document.getElementById('crypto-cap-chg');
        if (domEl && btcDom != null) {
            domEl.textContent  = btcDom.toFixed(1) + '%';
            domEl.style.color  = btcDom > 58 ? '#d97706' : btcDom < 48 ? '#6366f1' : '#0f172a';
            if (noteEl) noteEl.textContent = btcDom > 58 ? '▲ Mercado defensivo' : btcDom < 48 ? '▼ Alt season probable' : 'Mercado equilibrado';
        }
        if (capEl && totalCap != null) capEl.textContent = '$' + (totalCap / 1e12).toFixed(2) + 'T';
        if (capChgEl && capChg24 != null) {
            capChgEl.textContent = (capChg24 >= 0 ? '▲ +' : '▼ ') + capChg24.toFixed(2) + '% 24h';
            capChgEl.style.cssText = `color:${capChg24 >= 0 ? '#16a34a' : '#dc2626'};font-weight:700;font-size:.56rem;`;
        }
    } catch(e) { console.error('loadBitcoinDominance error:', e); }
}
async function toNoticia(n, cat, impacto) {
    const rawT = n.title  || n.titulo || '';
    const rawD = n.description || n.desc || n.summary || '';
    const [titulo, descripcion] = await Promise.all([
        VDS.translate(rawT, 'en', 'es').catch(() => rawT),
        rawD ? VDS.translate(rawD, 'en', 'es').catch(() => rawD) : Promise.resolve(''),
    ]);
    return {
        categoria:   cat,
        titulo,
        descripcion: descripcion || 'Información de mercados financieros actualizada.',
        fuente:      (n.source || n.domain || 'API').toUpperCase(),
        impacto,
        ia_insight:  `Dato en tiempo real. Fuente: ${n.source || 'API'}.`,
        image:       n.image || n.banner_image || n.socialimage || '',
        url:         n.url   || '',
    };
}
function buildFallback(tiieVal, rate, qqq, hora) {
    const fd = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' }).toUpperCase() + ' · ' + hora;
    const tiieStr = tiieVal?.toFixed(2) ?? '--';
    const rateStr = rate?.toFixed(2) ?? '--';
    const THEME_IMG = [
        'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=600&h=300&fit=crop',
        'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&h=300&fit=crop',
        'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=600&h=300&fit=crop',
        'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=600&h=300&fit=crop',
        'https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=600&h=300&fit=crop',
        'https://images.unsplash.com/photo-1541354329998-f4d9a9f9297f?w=600&h=300&fit=crop',
        'https://images.unsplash.com/photo-1473186578172-c141e6798cf4?w=600&h=300&fit=crop',
        'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&h=300&fit=crop',
        'https://images.unsplash.com/photo-1585338107529-13afc25c9b1a?w=600&h=300&fit=crop',
    ];
    const img = i => _fhImgPool[i] || THEME_IMG[i] || '';
    return [
        { categoria: 'Política Monetaria',       titulo: `Banxico mantiene TIIE en ${tiieStr}% · Perspectiva de tasas`,
          descripcion: `El Banco de México fijó la tasa interbancaria de equilibrio a 28 días en ${tiieStr}%. Los analistas siguen de cerca las decisiones de política monetaria ante un entorno inflacionario complejo y las señales de la Reserva Federal de EE.UU.`,
          fuente: 'BANXICO', impacto: 'alto',  image: img(0), url: '', fecha: fd },
        { categoria: 'Mercado Cambiario',        titulo: `USD/MXN cotiza en $${rateStr} · Presión en divisas emergentes`,
          descripcion: `El peso mexicano se ubica en ${rateStr} frente al dólar estadounidense. Las fluctuaciones reflejan el diferencial de tasas entre México y EE.UU., flujos de capital extranjero y la incertidumbre geopolítica que impacta a las monedas de mercados emergentes.`,
          fuente: 'FOREX',   impacto: 'medio', image: img(1), url: '', fecha: fd },
        { categoria: 'Mercados Financieros',     titulo: `Wall Street y BMV: claves de la sesión bursátil de hoy`,
          descripcion: 'Los principales índices bursátiles operan con volatilidad moderada. El S&P 500 y el NASDAQ reaccionan a reportes trimestrales de empresas tecnológicas, mientras el IPC de la BMV refleja el desempeño del sector financiero y de consumo en México.',
          fuente: 'BMV',     impacto: 'medio', image: img(2), url: '', fecha: fd },
        { categoria: 'Política Monetaria',       titulo: `Fed Funds en 4.50% · Expectativas de recorte en próximas reuniones`,
          descripcion: 'La Reserva Federal mantiene la tasa de fondos federales en el rango de 4.25%-4.50%. Los mercados de futuros descuentan posibles recortes para el segundo semestre del año, condicionados a la evolución de la inflación subyacente y el mercado laboral.',
          fuente: 'FED',     impacto: 'alto',  image: img(3), url: '', fecha: fd },
        { categoria: 'Riesgo y Volatilidad',     titulo: `Índice VIX y apetito de riesgo · Señales para inversionistas`,
          descripcion: 'El índice de volatilidad VIX del CBOE mide la expectativa de fluctuación del S&P 500 a 30 días. Niveles elevados señalan aversión al riesgo en los mercados globales, mientras que lecturas bajas sugieren confianza y mayor apetito por activos de renta variable.',
          fuente: 'CBOE',    impacto: 'medio', image: img(4), url: '', fecha: fd },
        { categoria: 'Banca Central Global',     titulo: `BCE, BOE y BOJ: panorama de tasas de interés a nivel mundial`,
          descripcion: 'El Banco Central Europeo mantiene su tasa en 2.65%, el Banco de Inglaterra en 4.50% y el Banco de Japón en 0.50%. Las divergencias en política monetaria global generan oportunidades y riesgos en mercados de renta fija, divisas y flujos de inversión.',
          fuente: 'BANCOS',  impacto: 'bajo',  image: img(5), url: '', fecha: fd },
        { categoria: 'Commodities',              titulo: `Petróleo, oro y materias primas: factores que mueven los precios`,
          descripcion: 'El crudo WTI y Brent reaccionan a las decisiones de la OPEP+ y la demanda de China. El oro se fortalece como refugio ante la inflación persistente, mientras el cobre y los granos reflejan tensiones en las cadenas globales de suministro y clima adverso.',
          fuente: 'COMMODITIES', impacto: 'medio', image: img(6), url: '', fecha: fd },
        { categoria: 'Cripto y Fintech',         titulo: `Bitcoin y activos digitales: regulación y tendencias del mercado`,
          descripcion: 'El mercado de criptomonedas continúa su evolución con Bitcoin liderando la capitalización. Los reguladores en EE.UU. y Europa avanzan en marcos normativos para exchanges y stablecoins, mientras las instituciones financieras tradicionales amplían su oferta de activos digitales.',
          fuente: 'CRYPTO',  impacto: 'medio', image: img(7), url: '', fecha: fd },
        { categoria: 'Economía México',          titulo: `PIB, empleo e inversión: radiografía de la economía mexicana`,
          descripcion: 'Los indicadores económicos de México muestran un panorama mixto. La inversión extranjera directa mantiene dinamismo impulsada por el nearshoring, mientras el consumo interno y las remesas familiares sostienen el crecimiento en un entorno de tasas de interés elevadas.',
          fuente: 'INEGI',   impacto: 'alto',  image: img(8), url: '', fecha: fd },
    ];
}
