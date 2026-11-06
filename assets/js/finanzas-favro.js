(function () {
    'use strict';

    /* ── Ciclo de vida en la SPA ───────────────────────────────────────────────
       Este archivo nació para una página que se recargaba entera: nada de lo que
       engancha se soltaba nunca, porque el navegador se llevaba todo por delante
       al navegar. En React la sección se monta y se desmonta, así que cada
       observador, intervalo y listener global tiene que poder retirarse.

       Todo lo que sobrevive al nodo que lo originó —`window`, `document`,
       MediaQueryList, ResizeObserver e intervalos— se registra aquí y se libera
       en `desmontar()`. Los listeners colgados de nodos propios de la sección no
       hacen falta: mueren con su nodo cuando React lo quita.

       Una ejecución previa se desmonta antes de que arranque la nueva, para que
       recargar el script no duplique nada. */
    window.VNFavro?.desmontar?.();

    const _limpieza = [];

    const escuchar = (destino, evento, fn, opciones) => {
        destino.addEventListener(evento, fn, opciones);
        _limpieza.push(() => destino.removeEventListener(evento, fn, opciones));
    };

    const observar = (observador) => {
        _limpieza.push(() => { try { observador.disconnect(); } catch { /* ya suelto */ } });
        return observador;
    };

    const intervalo = (fn, ms) => {
        const id = window.setInterval(fn, ms);
        _limpieza.push(() => window.clearInterval(id));
        return id;
    };

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
        supplementMarket: 'us',          // bolsa elegida en "Lectura verificable de Bolsa"
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
    /* México se retiró del selector a petición del área: la Bolsa Mexicana ya no
       aparece como opción. La rama `native` de loadSupplementMarket se conserva
       porque no estorba y deja el camino abierto si se decide reincorporarla. */
    const SUPPLEMENT_MARKETS = {
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
        es: { label: 'España', market: 'BME · Madrid', currency: 'EUR', tickers: [
            ['SAN.MC', 'Banco Santander'], ['IBE.MC', 'Iberdrola'], ['ITX.MC', 'Inditex'],
            ['BBVA.MC', 'BBVA'], ['TEF.MC', 'Telefónica'], ['REP.MC', 'Repsol'],
            ['FER.MC', 'Ferrovial'], ['AMS.MC', 'Amadeus'] ] },
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
        const cfg = SUPPLEMENT_MARKETS[key] || SUPPLEMENT_MARKETS.us;
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

    /* Azul marino para la interfaz; verde y rojo quedan reservados para la
       lectura financiera (alza/baja). No se usan grises como sustituto de
       dirección, porque vuelven ambiguas las gráficas. */
    const colors = {
        blue: '#4D91C2',
        cyan: '#65A8D7',
        navy: '#1D2837',
        gold: '#C9A76B',
        green: '#59D2AA',
        red: '#FF7F91',
        grid: 'rgba(117,165,202,.18)'
    };

    /* En Bolsa, verde y rojo se reservan para la dirección del recorrido:
       coinciden con el mapa y no se usan como color decorativo de la interfaz. */
    const EXCHANGE_CHART_COLORS = { up: '#59D2AA', down: '#FF7F91' };

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
        { slug: 'ibex', symbol: '^IBEX', name: 'IBEX 35', region: 'Espa\u00f1a', market: 'BME \u00b7 Madrid' },
        { slug: 'nikkei', symbol: '^N225', name: 'Nikkei 225', region: 'Jap\u00f3n', market: 'Tokyo Stock Exchange' },
        { slug: 'hangseng', symbol: '^HSI', name: 'Hang Seng', region: 'Hong Kong', market: 'HKEX' },
        { slug: 'bovespa', symbol: '^BVSP', name: 'Ibovespa', region: 'Brasil', market: 'B3' },
        /* Sudamérica. De los cuatro, SOLO Argentina publica su índice en la
           fuente: se probaron ocho variantes de ticker para el IPSA, el COLCAP y
           el S&P/BVL y ninguna devuelve datos. Los otros tres se cubren con un
           ETF y el pie de la tarjeta dice cuál es, para que nadie lea el número
           como si fuera el índice del país.

           Colombia va en pesos y cotiza en la propia bvc. Chile y Perú van con
           ETF neoyorquinos en dólares: su variación diaria mezcla el movimiento
           del mercado con el del tipo de cambio, así que NO son equivalentes al
           IPSA ni al S&P/BVL. Por eso tampoco colorean esos países en el mapa
           mundial; ver la nota de cobertura en assets/js/world-exchanges.js. */
        { slug: 'merval', symbol: '^MERV', name: 'S&P Merval', region: 'Argentina', market: 'BYMA · Buenos Aires' },
        { slug: 'colcap', symbol: 'ICOLCAP.CL', name: 'COLCAP', region: 'Colombia', market: 'ETF iShares en la bvc · en pesos colombianos' },
        { slug: 'ipsa', symbol: 'ECH', name: 'MSCI Chile', region: 'Chile', market: 'ETF en Nueva York · en dólares, no es el IPSA' },
        { slug: 'bvl', symbol: 'EPU', name: 'MSCI Perú', region: 'Perú', market: 'ETF en Nueva York · en dólares, no es el S&P/BVL' },
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
                legend: { labels: { color: '#a9b8c9', usePointStyle: true, pointStyle: 'circle', boxWidth: 7, font: { family: 'Inter', size: 10 } } },
                tooltip: { backgroundColor: '#17263D', titleFont: { family: 'Inter', size: 11 }, bodyFont: { family: 'JetBrains Mono', size: 10 }, padding: 10, cornerRadius: 9 }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#a9b8c9', maxTicksLimit: 8, font: { family: 'Inter', size: 9 } } },
                y: { position: 'right', grid: { color: colors.grid }, ticks: { color: '#a9b8c9', font: { family: 'JetBrains Mono', size: 9 } } }
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
                if (esRentaFija(state.module)) {
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

    function releaseExchangeChart(id) {
        const previous = state.miniCharts?.[id];
        if (previous) {
            try {
                if (typeof previous.remove === 'function') previous.remove();
                else if (typeof previous.destroy === 'function') previous.destroy();
            } catch (e) { /* La instancia ya pudo haberse desmontado. */ }
        }
        delete state.miniCharts?.[id];
        if (state.miniChartsObservers?.[id]) {
            try { state.miniChartsObservers[id].disconnect(); } catch (e) { /* ya desconectado */ }
            delete state.miniChartsObservers[id];
        }
    }

    /* Si Lightweight Charts no carga o rechaza una serie, la tarjeta no debe
       quedarse vacía. Chart.js ya forma parte de Finanzas y permite conservar
       una lectura clara del recorrido hasta el siguiente refresco. */
    function renderExchangeFallback(id, container, candles, color) {
        if (!container || typeof Chart === 'undefined') return;
        releaseExchangeChart(id);

        let canvas = container;
        if (canvas.tagName.toLowerCase() !== 'canvas') {
            canvas = document.createElement('canvas');
            canvas.className = 'ff-exchange-fallback-canvas';
            canvas.setAttribute('aria-label', 'Evolución reciente del mercado');
            container.replaceChildren(canvas);
        }
        canvas.style.position = 'relative';
        canvas.style.zIndex = '1';
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = '100%';

        const values = candles.map(c => Number(c.close)).filter(Number.isFinite);
        if (!values.length) return;
        const darkFinance = document.body.classList.contains('vn-dark-finanzas');
        const gridLine = darkFinance ? 'rgba(156,163,175,.14)' : 'rgba(15,42,64,.07)';

        state.miniCharts[id] = new Chart(canvas, {
            type: 'line',
            data: {
                labels: values.map((_, index) => index + 1),
                datasets: [{
                    data: values,
                    borderColor: color,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: .28,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: {
                    x: { display: false, grid: { display: false } },
                    y: { display: false, grid: { color: gridLine } },
                },
            },
        });
    }

    /* Mini gráfica propia: evita que una jerarquía interna de canvas o un cambio
       de la librería externa deje tarjetas sin serie. El SVG se escala con la
       tarjeta, no depende de medirla antes de que el panel salga de hidden y
       conserva los cuatro modos que el usuario puede elegir. */
    function renderExchangeNativeSpark(id, candles, color) {
        let container = $(id);
        if (!container || !Array.isArray(candles) || !candles.length) return false;

        if (container.tagName.toLowerCase() === 'canvas') {
            const div = document.createElement('div');
            div.id = id;
            div.className = 'ff-exchange-chart-host';
            container.parentNode.replaceChild(div, container);
            container = div;
        }

        const rows = candles.map((c, index) => {
            const close = Number(c.close);
            const open = Number.isFinite(Number(c.open)) ? Number(c.open) : close;
            const high = Number.isFinite(Number(c.high)) ? Number(c.high) : Math.max(open, close);
            const low = Number.isFinite(Number(c.low)) ? Number(c.low) : Math.min(open, close);
            return { index, open, high, low, close };
        }).filter(c => Number.isFinite(c.close) && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low));
        if (!rows.length) return false;

        releaseExchangeChart(id);
        container.replaceChildren();
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.margin = '0';

        const wrapper = container.parentElement;
        const glow = wrapper?.querySelector('.ff-chart-glow');
        if (glow) glow.style.setProperty('background', hexToRgba(color, .1), 'important');

        const width = 640, height = 184, pad = { top: 14, right: 15, bottom: 20, left: 15 };
        const plotWidth = width - pad.left - pad.right;
        const plotHeight = height - pad.top - pad.bottom;
        const low = Math.min(...rows.map(c => c.low));
        const high = Math.max(...rows.map(c => c.high));
        const range = Math.max(high - low, Math.abs(high) * .01, 1);
        const floor = low - range * .08;
        const ceiling = high + range * .08;
        const y = value => pad.top + ((ceiling - value) / (ceiling - floor)) * plotHeight;
        const x = index => rows.length === 1 ? width / 2 : pad.left + (index / (rows.length - 1)) * plotWidth;
        const element = (name, attrs) => {
            const node = document.createElementNS('http://www.w3.org/2000/svg', name);
            Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
            return node;
        };
        const svg = element('svg', {
            class: 'ff-exchange-native-chart', viewBox: `0 0 ${width} ${height}`,
            preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Evolución reciente del mercado',
        });
        const title = element('title', {});
        title.textContent = 'Evolución reciente del mercado';
        svg.append(title);

        for (let row = 1; row < 4; row += 1) {
            const gy = pad.top + (plotHeight / 4) * row;
            svg.append(element('line', { x1: pad.left, y1: gy, x2: width - pad.right, y2: gy, stroke: 'rgba(156,163,175,.18)', 'stroke-width': 1 }));
        }

        const chartType = window.finMiniChartType || 'line';
        const green = '#59D2AA', red = '#FF7F91';
        if (chartType === 'candles' || chartType === 'ohlc') {
            const slot = plotWidth / Math.max(rows.length, 2);
            const bodyWidth = Math.max(2, Math.min(10, slot * .58));
            rows.forEach((c, index) => {
                const cx = x(index);
                const rising = c.close >= c.open;
                const tone = rising ? green : red;
                svg.append(element('line', { x1: cx, y1: y(c.high), x2: cx, y2: y(c.low), stroke: tone, 'stroke-width': 1.4, 'stroke-linecap': 'round' }));
                if (chartType === 'candles') {
                    const top = Math.min(y(c.open), y(c.close));
                    const bodyHeight = Math.max(1.8, Math.abs(y(c.open) - y(c.close)));
                    svg.append(element('rect', { x: cx - bodyWidth / 2, y: top, width: bodyWidth, height: bodyHeight, rx: 1, fill: tone }));
                } else {
                    svg.append(element('line', { x1: cx - bodyWidth / 2, y1: y(c.open), x2: cx, y2: y(c.open), stroke: tone, 'stroke-width': 1.4 }));
                    svg.append(element('line', { x1: cx, y1: y(c.close), x2: cx + bodyWidth / 2, y2: y(c.close), stroke: tone, 'stroke-width': 1.4 }));
                }
            });
        } else {
            const points = rows.map((c, index) => `${x(index).toFixed(2)},${y(c.close).toFixed(2)}`);
            if (chartType === 'area') {
                const area = [`M ${points[0]}`, ...points.slice(1).map(point => `L ${point}`), `L ${x(rows.length - 1).toFixed(2)},${(height - pad.bottom).toFixed(2)}`, `L ${x(0).toFixed(2)},${(height - pad.bottom).toFixed(2)} Z`].join(' ');
                svg.append(element('path', { d: area, fill: hexToRgba(color, .22) }));
            }
            svg.append(element('polyline', { points: points.join(' '), fill: 'none', stroke: color, 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }));
            const last = rows.at(-1);
            svg.append(element('circle', { cx: x(rows.length - 1), cy: y(last.close), r: 3.2, fill: color, stroke: '#1D2837', 'stroke-width': 1.5 }));
        }

        container.append(svg);
        container.dispatchEvent(new CustomEvent('vn:bolsa-chart', { bubbles: true }));
        return true;
    }

    function renderExchangeSpark(id, candles, color) {
        if (!renderExchangeNativeSpark(id, candles, color)) {
            renderExchangeLightweightSpark(id, candles, color);
        }
    }

    function renderExchangeLightweightSpark(id, candles, color) {
        let container = $(id);
        if (!container || !candles?.length) return;
        if (typeof LightweightCharts === 'undefined') {
            renderExchangeFallback(id, container, candles, color);
            return;
        }
        
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
            releaseExchangeChart(id);
            container.innerHTML = ''; /* Safe fallback to prevent duplicate DOM nodes */

            try {

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

            const darkFinance = document.body.classList.contains('vn-dark-finanzas');
            const axisInk  = darkFinance ? '#9ca3af' : '#64748b';
            const gridLine = darkFinance ? 'rgba(156,163,175,.14)' : 'rgba(15,42,64,.07)';
            const crosshairLine = darkFinance ? 'rgba(156,163,175,.34)' : 'rgba(15,42,64,.32)';
            const crosshairLabel = darkFinance ? '#4b5563' : '#111827';

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
                    vertLine: { color: crosshairLine, width: 1, style: LightweightCharts.LineStyle.Dashed, labelBackgroundColor: crosshairLabel },
                    horzLine: { color: crosshairLine, width: 1, style: LightweightCharts.LineStyle.Dashed, labelBackgroundColor: crosshairLabel },
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
                const ro = observar(new ResizeObserver(entries => {
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
                }));
                ro.observe(chartWrapper);
                state.miniChartsObservers[id] = ro;
            }
            } catch (error) {
                console.warn('Finanzas: se usó la gráfica de respaldo para ' + id, error);
                renderExchangeFallback(id, container, candles, color);
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
                <div class="ff-data-box-title"><span>Datos de sesión</span><strong>${exchange.name}</strong></div>
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

        /* Los recuadros piden sus datos en cuanto existen, sin esperar a las
           cotizaciones de las tarjetas: son series distintas y hacerlos depender
           de aquéllas retrasaba (o impedía) que se llenaran. */
        exchangeConfig.forEach(exchange => renderExchangeDataBox(exchange, state.quotes[exchange.symbol], true));
        startExchangeDataBoxAutoRefresh();
    }

    /* Refresco automático de los recuadros.
       Sin esto las cifras se quedaban congeladas en la sesión que se cargó al
       abrir la página. El backend cachea /api/stock-history 15 minutos, así que
       este sondeo no golpea a Yahoo: sirve para recoger la sesión nueva en
       cuanto esa caché expira. Se detiene si la pestaña no está a la vista o si
       el panel de bolsas está oculto. */
    const EXCHANGE_DATABOX_REFRESH_MS = 60 * 1000;
    let _dataBoxTimer = null;
    function startExchangeDataBoxAutoRefresh() {
        if (_dataBoxTimer) return;
        _dataBoxTimer = intervalo(() => {
            if (document.hidden) return;
            const board = $('ff-exchange-board');
            if (!board || board.hidden || !board.isConnected) return;
            exchangeConfig.forEach(exchange => {
                // Se invalida la serie cacheada para que la próxima lectura sea nueva.
                state.marketSeries.delete(`daybox:${exchange.symbol}`);
                renderExchangeDataBox(exchange, state.quotes[exchange.symbol], false);
            });
        }, EXCHANGE_DATABOX_REFRESH_MS);
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

    /* Puente de solo lectura hacia el mapa mundial (finanzas-world-map.js), que
       vive fuera de este IIFE y necesita las cotizaciones ya descargadas.
       Devuelve una copia plana: sin velas, y sin que nadie pueda escribir sobre
       `state` desde fuera. Si el símbolo no está en exchangeConfig no habrá
       entrada, y el mapa lo muestra como ficha sin cotización. */
    window.VNBolsaCotizacion = function (symbol) {
        const quote = state.quotes[symbol];
        return quote ? { price: quote.price, change: quote.change } : null;
    };

    function renderExchangeBoard() {
        ensureExchangeCards();
        const typeSelect = $('vn-chart-type-global');
        if (typeSelect) typeSelect.value = window.finMiniChartType || 'line';
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
                    renderExchangeDataBox(exchange, null, true);
                    return;
                }
                card.classList.add('is-unavailable');
                value.textContent = 'Sin datos';
                delta.textContent = 'Selecciona para reintentar';
                renderExchangeDataBox(exchange, null, false);
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
            renderExchangeDataBox(exchange, quote, false);
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

    /* Volumen en notación corta: los mercados devuelven cifras de nueve o diez
       dígitos que, escritas enteras, desbordan la fila del recuadro. */
    function formatCompactVolume(value) {
        if (!isNumeric(value) || +value <= 0) return null;
        const n = +value;
        const escalas = [[1e12, 'B'], [1e9, 'MM'], [1e6, 'M'], [1e3, 'K']];
        for (const [umbral, sufijo] of escalas) {
            if (n >= umbral) return `${formatNumber(n / umbral, n / umbral >= 100 ? 0 : 1)} ${sufijo}`;
        }
        return formatNumber(n, 0);
    }

    /* Última vela DIARIA de un índice, para el recuadro de datos.
       No sirve la serie de state.quotes: fetchQuote() pide velas de 15 minutos,
       y en una vela de ese tamaño apertura, máximo, mínimo y cierre suelen
       coincidir. Aquí hace falta la sesión completa, así que se pide con
       interval=1d igual que hace fetchDailyQuote() para el suplemento. */
    function fetchExchangeDailyCandles(symbol) {
        const cacheKey = `daybox:${symbol}`;
        if (state.marketSeries.has(cacheKey)) return state.marketSeries.get(cacheKey);
        const promesa = fetchJson(`/api/stock-history?ticker=${encodeURIComponent(symbol)}&range=5d&interval=1d`)
            .then(data => (Array.isArray(data?.candles) ? data.candles : []).filter(c => Number.isFinite(+c.close)))
            .catch(error => {
                console.warn(`Recuadro de ${symbol}:`, error.message);
                state.marketSeries.delete(cacheKey); // permite reintentar
                return [];
            });
        state.marketSeries.set(cacheKey, promesa);
        return promesa;
    }

    /* Recuadro de datos a la derecha de cada tarjeta de bolsa.
       ensureExchangeCards() creaba estos campos con un guion de marcador, pero
       nunca se escribió el código que los rellenaba: por eso Región y Mercado
       (que se pintan directo del config) mostraban valor y las seis filas
       restantes se quedaban vacías para siempre. */
    function renderExchangeDataBox(exchange, quote, cargando) {
        const campo = sufijo => $(`ff-ext-${sufijo}-${exchange.slug}`);
        const marcador = cargando ? '…' : '–';
        const poner = (sufijo, texto, clase) => {
            const el = campo(sufijo);
            if (!el) return;
            el.textContent = texto == null ? marcador : texto;
            el.classList.remove('ff-positive-text', 'ff-negative-text');
            if (clase && texto != null) el.classList.add(clase);
        };

        /* El recuadro NO depende de que la cotización de la tarjeta haya llegado:
           sus cifras salen de su propia serie diaria. Antes se limpiaba a guiones
           mientras `quote` no estuviera lista, así que si esa petición tardaba o
           fallaba el recuadro se quedaba vacío pese a haber datos disponibles.
           `quote` solo se usa como respaldo para la variación. */

        /* En la primera carga se marcan como "en curso"; en los refrescos
           automáticos no se tocan, para no parpadear a guiones cada minuto. */
        if (cargando) ['close', 'delta', 'open', 'high', 'low', 'vol'].forEach(s => poner(s, null));

        fetchExchangeDailyCandles(exchange.symbol).then(velas => {
            const ultima = velas.length ? velas[velas.length - 1] : null;
            if (!ultima) {
                ['close', 'delta', 'open', 'high', 'low', 'vol'].forEach(s => poner(s, null));
                return;
            }

            /* Las cinco filas salen de la MISMA vela diaria, así que todas
               describen la misma sesión. Se prefiere el cierre de la vela al
               precio en vivo por esa coherencia. */
            poner('close', isNumeric(ultima.close) ? formatNumber(ultima.close, 2) : null);
            poner('open',  isNumeric(ultima.open)  ? formatNumber(ultima.open, 2)  : null);
            poner('high',  isNumeric(ultima.high)  ? formatNumber(ultima.high, 2)  : null);
            poner('low',   isNumeric(ultima.low)   ? formatNumber(ultima.low, 2)   : null);

            /* Volumen: varios índices (FTSE, DAX, Hang Seng, Ibovespa) traen 0 en
               la vela del día en curso y solo lo publican al cerrar la sesión.
               Dejar un guion daría la impresión de que el recuadro está roto, así
               que se muestra el último volumen realmente publicado y se indica en
               el title de qué sesión procede: el dato es real y trazable, no una
               estimación. */
            const conVolumen = [...velas].reverse().find(c => isNumeric(c.volume) && +c.volume > 0);
            poner('vol', conVolumen ? formatCompactVolume(conVolumen.volume) : null);
            const elVol = campo('vol');
            if (elVol) {
                elVol.removeAttribute('title');
                if (conVolumen && conVolumen !== ultima) {
                    elVol.title = `Último volumen publicado (sesión del ${conVolumen.time}). `
                        + 'Este mercado aún no reporta volumen para la sesión en curso.';
                } else if (conVolumen) {
                    elVol.title = `Volumen de la sesión del ${conVolumen.time}.`;
                }
            }

            /* Variación de la sesión: cierre de hoy contra el cierre anterior.
               Si no hay vela previa se deja vacío en vez de estimarla. */
            let cambio = null;
            const previa = velas.length >= 2 ? velas[velas.length - 2] : null;
            if (isNumeric(previa?.close) && +previa.close !== 0) {
                cambio = (+ultima.close / +previa.close - 1) * 100;
            } else if (isNumeric(quote?.change)) {
                cambio = +quote.change;
            }
            poner(
                'delta',
                cambio == null ? null : formatPercent(cambio),
                cambio == null ? null : (cambio >= 0 ? 'ff-positive-text' : 'ff-negative-text'),
            );
        });
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
        /* El mapa mundial pinta las cotizaciones del país seleccionado y no
           tiene forma de saber cuándo llegan. Se avisa aquí, que es el punto
           donde el resto de la vista ya se repintó con datos nuevos. */
        window.dispatchEvent(new CustomEvent('vn:cotizaciones'));
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
        /* Indicadores de la sección "Tasas y bonos". Se escriben aquí y no en el
           script en línea de finanzas.html porque los datos de /api/mx-rates viven
           en este estado. `tiie` ya prefiere la serie de Banxico sobre el valor de
           respaldo de /api/bond-yields, que es fijo. */
        const escribir = (id, texto) => { const el = $(id); if (el) el.textContent = texto; };
        const cete = plazo => state.mxRates?.cetes?.find(item => item.label === plazo)?.yield;
        const c28 = cete('28D'), c91 = cete('91D'), c364 = cete('364D');
        escribir('debt-kpi-tiie', formatYield(tiie));
        escribir('debt-kpi-cetes28', formatYield(c28));
        escribir('debt-kpi-cetes91', formatYield(c91));
        escribir('debt-kpi-cetes364', formatYield(c364));
        const pendienteCetes = isNumeric(c364) && isNumeric(c28) ? +c364 - +c28 : null;
        escribir('debt-kpi-cetes-curve', pendienteCetes == null ? '—'
            : `${pendienteCetes >= 0 ? '+' : ''}${pendienteCetes.toFixed(2)} pp`);
        escribir('debt-kpi-cetes-curve-state', pendienteCetes == null ? 'Pendiente sin dato'
            : pendienteCetes >= 0 ? 'Mercado descuenta alzas' : 'Mercado descuenta recortes');

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
        const curveText = Number.isFinite(curve) ? `${curve >= 0 ? '+' : ''}${curve.toFixed(2)} pp` : '—';
        escribir('ff-card-curve', curveText);
        escribir('ff-q-curve', curveText);
        escribir('ff-card-real', Number.isFinite(real) ? `${real >= 0 ? '+' : ''}${real.toFixed(2)}%` : '—');
        escribir('ff-card-carry', Number.isFinite(carry) ? `${carry >= 0 ? '+' : ''}${carry.toFixed(2)} pp` : '—');
        escribir('ff-card-curve-state', !Number.isFinite(curve) ? 'Esperando curva' : curve < 0 ? 'Curva invertida' : curve < .35 ? 'Curva plana' : 'Curva positiva');
        const daily = isNumeric(us10?.prev) ? +us10.yield - +us10.prev : null;
        const dailyText = Number.isFinite(daily) ? `${daily >= 0 ? '+' : ''}${daily.toFixed(2)} pp vs. anterior` : 'Rendimiento actual';
        if ($('ff-card-us10y-delta')) $('ff-card-us10y-delta').textContent = dailyText;
        if ($('ff-q-us10y-delta')) $('ff-q-us10y-delta').textContent = dailyText;
        renderMiniChart('ff-spark-bonos', [us5, us10, us30].map(item => +item?.yield).filter(Number.isFinite), colors.gold);
        renderMiniChart('ff-spark-tasas', getReferenceRateItems().map(item => item.yield), colors.cyan);
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



    const detailConfig = {
        bolsa: {
            eyebrow: 'Mercados globales',
            title: 'Bolsa',
            description: 'Índices, acciones, factores, amplitud y el laboratorio histórico multiactivo en una vista completa.',
            legacySection: 'mercados',
        },
        /* La clave sigue siendo "rendimientos" aunque la sección se llame Bonos:
           ya existe un módulo heredado con la clave "bonos" (legacySection) y
           renombrarla aquí haría que ambos colisionaran. */
        rendimientos: {
            eyebrow: 'Renta fija',
            title: 'Bonos y Tasas',
            description: '',
            legacySection: 'bonos',
        },
        divisas: {
            eyebrow: 'Mercado global',
            title: 'Divisas',
            description: 'Tipos de cambio en tiempo real, series históricas y comparación relativa entre monedas internacionales.',
            legacySection: 'mexico',
        },
    };

    const detailClasses = Object.keys(detailConfig).map(name => `ff-detail-${name}`);

    const MODULOS_RENTA_FIJA = ['rendimientos'];
    const esRentaFija = nombre => MODULOS_RENTA_FIJA.includes(nombre);

    function updateDetailNavigation(name) {
        const cfg = detailConfig[name];
        $('ff-detail-eyebrow').textContent = cfg.eyebrow;
        $('ff-detail-title').textContent = cfg.title;
        /* Bonos ya no lleva bajada: sin ocultar el <p>, el vacío seguiría
           reservando su margen bajo el título. */
        const detalle = $('ff-detail-description');
        detalle.textContent = cfg.description;
        detalle.hidden = !cfg.description;
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
            rendimientos: ['Monitor de bonos', 'Curvas soberanas, cambios por tramo, pendiente y dispersión entre vencimientos.'],
            divisas: ['Divisas · Mercado cambiario', 'Cotizaciones internacionales, histórico y comparación de monedas.'],
            noticias: ['Daily News', 'Última hora, noticia principal, impacto y mercados relacionados.'],
        }[name];
        if (!copy) return;
        if ($('fin-section-status-title')) $('fin-section-status-title').textContent = copy[0];
        if ($('fin-section-status-message')) $('fin-section-status-message').textContent = copy[1];
    }

    function setLegacyBondView(name) {
        const presentation = {
            rendimientos: {
                eyebrow: 'Renta fija',
                title: 'Bonos',
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
            // Rendimientos hereda el comportamiento de la antigua sección "Tasas y
            // bonos", así que abre con la vista de columnas. La variante de línea
            // pertenecía al panel de curvas propio, que ya no existe.
            if (esRentaFija(name) && typeof setBondChartType === 'function') {
                const button = document.querySelector('[data-bond-chart="columns"]');
                setBondChartType('columns', button);
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
        if (host && chartPanel) {
            host.hidden = false;
            if (fxPanel) host.append(fxPanel);
            host.append(chartPanel);
            chartPanel.style.display = '';
            if (fxPanel && fxPanel.querySelector('#fxStrip')?.children.length) fxPanel.style.display = '';
        }
        if (board) board.hidden = false;
        const mapa = $('ff-world-map');
        if (mapa) mapa.hidden = false;
        renderExchangeBoard();
        markExchangeSelection($('bmv-symbol')?.value || '');
        requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
            /* En este punto el panel ya dejó de estar oculto; se vuelve a medir
               el lienzo principal para que Lightweight Charts no conserve el
               ancho cero con el que Finanzas se montó inicialmente. */
            window.refreshMarketChart?.();
            renderExchangeBoard();
        });
    }

    function restoreBolsaTopLayout() {
        const host = $('ff-bolsa-chart-host');
        const board = $('ff-exchange-board');
        const mapa = $('ff-world-map');
        if (host) host.hidden = true;
        if (board) board.hidden = true;
        if (mapa) mapa.hidden = true;
    }

    function openDetail(name, options = {}) {
        // Compatibilidad con enlaces antiguos: la sección independiente de Tasas
        // ahora forma parte de Bonos.
        if (name === 'tasas') name = 'rendimientos';
        const cfg = detailConfig[name];
        if (!cfg) return;

        const isNews = name === 'noticias';
        const isFx = name === 'divisas';
        if (name !== 'bolsa') restoreBolsaTopLayout();
        if (!isNews && !isFx) {
            restoreDailyNewsLayout();
            state.module = name;
            updateControls();
        } else {
            if (isFx) restoreDailyNewsLayout();
            document.querySelectorAll('.ff-module').forEach(card => {
                const active = card.dataset.module === name;
                card.classList.toggle('is-active', active);
                card.setAttribute('aria-current', active ? 'true' : 'false');
            });
        }
        document.body.classList.add('ff-detail-mode');
        document.body.classList.remove(...detailClasses, 'ff-detail-rentafija');
        document.body.classList.add(`ff-detail-${name}`);
        /* Tasas y bonos y Rendimientos comparten toda su presentación. En vez de
           duplicar los treinta selectores de cada estilo, ambos reciben esta clase
           común y el CSS se escribe una sola vez contra ella. */
        if (esRentaFija(name)) document.body.classList.add('ff-detail-rentafija');
        updateDetailNavigation(name);

        const navigation = $('ff-detail-navigation');
        if (navigation) navigation.hidden = false;
        const supplement = $('ff-detail-supplement');
        if (isNews || isFx) {
            if (supplement) supplement.hidden = true;
        } else {
            // Rendimientos ya no tiene su propio panel de curvas: pasa por el mismo
            // camino que el resto y muestra el contenido de renta fija.
            renderSupplement(name);
        }

        if (typeof finTab === 'function') {
            const legacyButton = document.querySelector(`.fin-tab-card[data-tab="${cfg.legacySection}"]`);
            finTab(cfg.legacySection, legacyButton, true, true);
        }
        if (name === 'bolsa') prepareBolsaTopLayout();
        if (isFx) {
            const legacyLayout = $('fin-layout-wrap');
            const equityChart = $('bvmx-panel');
            const fxPanel = $('fx-pro-panel');
            if (legacyLayout) legacyLayout.style.display = 'none';
            if (equityChart) equityChart.style.display = 'none';
            if (fxPanel) fxPanel.style.display = '';
            /* Igual que Daily News, Divisas no muestra la barra de estado; se
               oculta ya aquí para que no parpadee con el texto de la sección
               anterior antes de que setFinanceSectionStatus la reevalúe. */
            const fxStatus = $('fin-section-status');
            if (fxStatus) fxStatus.hidden = true;
            if (typeof window.loadFxHistoricalLab === 'function') window.loadFxHistoricalLab();
        }
        // El tablero por sector vive en el script en línea de finanzas.html, así
        // que se invoca desde el objeto global y sólo si ya está definido.
        if (name === 'bolsa' && typeof window.loadSectorBoard === 'function') window.loadSectorBoard();
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

        /* Se trabaja sobre una copia. Los ajustes de abajo (colores del anillo,
           relleno de la línea) modificaban los objetos recibidos, que son los
           mismos que guarda lastSuppChartData; al volver a barras, los colores
           del anillo seguían puestos y las alzas se pintaban de morado o amarillo
           en vez de verde. En datos financieros el verde/rojo es semántico. */
        datasets = datasets.map(d => ({ ...d }));

        let actualType = state.suppChartType || type;
        let isHorizontal = actualType === 'horizontalBar';
        if (isHorizontal) actualType = 'bar';
        let isPie = actualType === 'doughnut';

        const canvas = $('ff-supplement-chart');
        if (!canvas || typeof Chart === 'undefined') return;
        if (state.supplementChart) state.supplementChart.destroy();
        
        const options = chartDefaults();
        const darkFinance = document.body.classList.contains('vn-dark-finanzas');
        const supplementAxis = darkFinance ? '#A9B8C9' : '#687887';
        const supplementGrid = darkFinance ? 'rgba(143,170,194,.18)' : colors.grid;
        options.animation.duration = 260;
        options.plugins.legend.display = isPie ? true : datasets.length > 1;
        options.plugins.legend.position = isPie ? 'right' : 'bottom';
        options.maintainAspectRatio = false;
        
        if (isPie) {
            options.scales.x = { display: false };
            options.scales.y = { display: false };
            
            datasets.forEach(d => {
                if (Array.isArray(d.data)) {
                    if (!Array.isArray(d.backgroundColor)) {
                        const tonos = ['#8FAAC2', '#6CBAD8', '#C9A76B', '#46617D'];
                        d.backgroundColor = d.data.map((_, i) => tonos[i % tonos.length]);
                    }
                    d.borderColor = darkFinance ? '#4A6079' : '#ffffff';
                    d.borderWidth = 2;
                }
            });
        } else if (isHorizontal) {
            options.indexAxis = 'y';
            options.scales.x = { position: 'bottom', title: { display: true, text: axisLabel, color: supplementAxis, font: { size: 9 } } };
            options.scales.y = { position: 'left' };
        } else {
            options.indexAxis = 'x';
            options.scales.x = { position: 'bottom' };
            options.scales.y = { position: 'left', title: { display: true, text: axisLabel, color: supplementAxis, font: { size: 9 } } };
        }

        if (actualType === 'line') {
            datasets.forEach(d => {
                d.fill = true;
                d.tension = 0.35;
                d.backgroundColor = 'rgba(143, 170, 194, 0.18)';
                d.borderColor = colors.blue;
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
        if (!isPie) {
            Object.values(options.scales).forEach(scale => {
                scale.ticks = { ...(scale.ticks || {}), color: supplementAxis };
                scale.grid = { ...(scale.grid || {}), color: supplementGrid };
                scale.border = { ...(scale.border || {}), color: supplementGrid };
                if (scale.title) scale.title.color = supplementAxis;
            });
        }
        if (options.plugins.legend?.labels) options.plugins.legend.labels.color = supplementAxis;
        
        state.supplementChart = new Chart(canvas, { type: actualType, data: { labels, datasets }, options });
        observeSupplementChartSize(canvas);
    }

    /* La gráfica se crea mientras #ff-detail-supplement todavía está cambiando de
       tamaño: la sección arranca con hidden y se muestra en el mismo ciclo en que
       Chart.js mide el contenedor. Con maintainAspectRatio:false eso deja el lienzo
       con el ancho equivocado, y el resultado eran barras desplazadas respecto a
       sus etiquetas (las últimas emisoras se salían del área visible) o, si medía
       cero, una tarjeta en blanco.

       Chart.js solo se re-mide ante un resize de ventana, que aquí nunca ocurre,
       así que se vigila el contenedor y se le pide recalcular cuando cambia. */
    let _supplementResizeObserver = null;
    function observeSupplementChartSize(canvas) {
        const contenedor = canvas.parentElement;
        if (!contenedor || typeof ResizeObserver === 'undefined') return;

        _supplementResizeObserver?.disconnect();
        _supplementResizeObserver = observar(new ResizeObserver(() => {
            const chart = state.supplementChart;
            // Un contenedor de alto o ancho cero significa que la sección aún está
            // oculta; redimensionar ahí volvería a fijar un lienzo inservible.
            if (!chart || !contenedor.clientWidth || !contenedor.clientHeight) return;
            chart.resize();
        }));
        _supplementResizeObserver.observe(contenedor);

        // Primer ajuste tras el pintado inicial, por si el contenedor ya alcanzó
        // su tamaño definitivo antes de que el observador entre en acción.
        requestAnimationFrame(() => {
            if (state.supplementChart && contenedor.clientWidth) state.supplementChart.resize();
        });
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
        const key = state.supplementMarket || 'us';
        const cfg = SUPPLEMENT_MARKETS[key] || SUPPLEMENT_MARKETS.us;
        const reqId = ++_supplementReq;
        const select = $('ff-supplement-market');
        if (select) select.disabled = true;

        setSupplementCopy(
            'Mercados globales',
            'Desempe\u00f1o por Mercado',
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
                'Mercados globales',
                'Desempe\u00f1o por Mercado',
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
            'Mercados globales',
            'Desempe\u00f1o por Mercado',
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

    /* ── Diferenciales soberanos a 10 años ────────────────────────────────────
       Tabla al estilo World Government Bonds: el rendimiento a 10 años de cada
       país y su distancia en puntos base frente a varias referencias.

       Los datos vienen de /api/bond-spreads (portal del BCE para los países
       europeos, Yahoo ^TNX para Estados Unidos). Los diferenciales se calculan
       aquí porque son una resta: pedirlos al servidor obligaría a rehacer la
       petición cada vez que se cambia de referencia. */
    const SPREAD_REFS_POR_DEFECTO = ['DE', 'US', 'CN', 'IT'];
    let _spreads = null;
    let _spreadRef = 'DE';
    let _spreadSort = { campo: 'yield', asc: true };

    async function renderSpreadsBoard() {
        const board = $('ff-spreads-board');
        if (!board) return;

        if (!_spreads) {
            try {
                const data = await fetchJson('/api/bond-spreads', 20000);
                _spreads = Array.isArray(data?.countries) ? data : null;
                if (_spreads) {
                    if (!_spreads.countries.some(country => country.code === _spreadRef)) {
                        _spreadRef = _spreads.countries[0]?.code || 'CN';
                    }
                    /* El Bund alemán alimenta dos tarjetas del panel de indicadores.
                       Se escriben aquí en lugar de pedir a updateDebtDashboard() que
                       repinte: esa función recibe los datos por parámetro y llamarla
                       sin ellos borraría el resto del panel. */
                    const bund = data.countries.find(c => c.code === 'DE');
                    if (bund && Number.isFinite(bund.yield)) {
                        window.__vnBundYield = bund.yield;
                        const elBund = $('debt-kpi-bund');
                        if (elBund) elBund.textContent = `${bund.yield.toFixed(2)}%`;
                        // El Treasury 10Y ya está pintado en su tarjeta; se lee de ahí
                        // para no depender del orden en que terminan las dos peticiones.
                        const us10Txt = $('debt-kpi-us10')?.textContent || '';
                        const us10 = parseFloat(us10Txt);
                        const elDif = $('debt-kpi-usbund');
                        if (elDif && Number.isFinite(us10)) {
                            const dif = us10 - bund.yield;
                            elDif.textContent = `${dif >= 0 ? '+' : ''}${dif.toFixed(2)} pp`;
                            const nota = $('debt-kpi-usbund-chg');
                            if (nota) nota.textContent = dif > 0 ? 'EE.UU. paga más que Alemania' : 'Alemania paga más que EE.UU.';
                        }
                    }
                    const asOf = $('ff-spreads-asof');
                    if (asOf) asOf.textContent = `Corte ${data.asOf || 'reciente'} · ${data.countries.length} países`;
                    const nota = $('ff-spreads-note')?.querySelector('p');
                    if (nota) nota.textContent = data.note || '';
                    llenarSelectorReferencia();
                }
            } catch (error) {
                console.warn('Diferenciales soberanos:', error.message);
            }
        }

        const cuerpo = $('ff-spreads-body');
        if (!cuerpo) return;
        if (!_spreads) {
            cuerpo.innerHTML = '<tr><td colspan="7">No se pudieron obtener los diferenciales ahora mismo.</td></tr>';
            return;
        }
        pintarTablaSpreads();
    }

    function llenarSelectorReferencia() {
        const sel = $('ff-spreads-ref');
        if (!sel || sel.childElementCount) return;
        sel.innerHTML = _spreads.countries
            .map(c => `<option value="${c.code}"${c.code === _spreadRef ? ' selected' : ''}>${c.name}</option>`)
            .join('');
        sel.addEventListener('change', event => {
            _spreadRef = event.target.value;
            pintarTablaSpreads();
        });
        document.querySelectorAll('[data-spread-sort]').forEach(boton => {
            boton.addEventListener('click', () => {
                const campo = boton.dataset.spreadSort;
                _spreadSort = { campo, asc: _spreadSort.campo === campo ? !_spreadSort.asc : true };
                pintarTablaSpreads();
            });
        });
    }

    function pintarTablaSpreads() {
        const cuerpo = $('ff-spreads-body');
        if (!cuerpo || !_spreads) return;

        const porCodigo = new Map(_spreads.countries.map(c => [c.code, c]));
        const refPais = porCodigo.get(_spreadRef) || _spreads.countries[0];

        /* Cuatro columnas: la referencia elegida primero y luego las habituales,
           sin repetirla si ya está entre ellas. */
        const refs = [_spreadRef, ...SPREAD_REFS_POR_DEFECTO.filter(c => c !== _spreadRef)]
            .filter(c => porCodigo.has(c))
            .slice(0, 4);

        refs.forEach((codigo, i) => {
            const th = $(`ff-sp-h${i + 1}`);
            if (th) th.textContent = `vs ${porCodigo.get(codigo).name}`;
        });
        for (let i = refs.length; i < 4; i++) { const th = $(`ff-sp-h${i + 1}`); if (th) th.textContent = ''; }

        const filas = [..._spreads.countries];
        const { campo, asc } = _spreadSort;
        filas.sort((a, b) => {
            let d;
            if (campo === 'name') d = a.name.localeCompare(b.name, 'es');
            else if (campo === 'chg') d = variacion(a) - variacion(b);
            else d = a.yield - b.yield;
            return asc ? d : -d;
        });

        document.querySelectorAll('[data-spread-sort]').forEach(b =>
            b.classList.toggle('is-sorted', b.dataset.spreadSort === campo));

        const candidatos = _spreads.countries.filter(pais => pais.code !== refPais.code);
        const mayor = _spreads.countries.reduce((best, pais) => !best || pais.yield > best.yield ? pais : best, null);
        const cercano = candidatos.reduce((best, pais) => {
            const spread = pais.yield - refPais.yield;
            return !best || Math.abs(spread) < Math.abs(best.spread) ? { pais, spread } : best;
        }, null);
        const amplio = candidatos.reduce((best, pais) => {
            const spread = pais.yield - refPais.yield;
            return !best || spread > best.spread ? { pais, spread } : best;
        }, null);
        const setSummary = (id, value) => { const element = $(id); if (element) element.textContent = value; };
        const fmtBp = value => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)} bp`;
        setSummary('ff-spreads-universe', `${_spreads.countries.length} países`);
        setSummary('ff-spreads-high', mayor ? `${mayor.yield.toFixed(2)}%` : '—');
        setSummary('ff-spreads-high-note', mayor ? mayor.name : 'Dentro del universo');
        setSummary('ff-spreads-tight', cercano ? fmtBp(cercano.spread) : '—');
        setSummary('ff-spreads-tight-note', cercano ? `${cercano.pais.name} vs ${refPais.name}` : 'Frente a la referencia');
        setSummary('ff-spreads-wide', amplio ? fmtBp(amplio.spread) : '—');
        setSummary('ff-spreads-wide-note', amplio ? `${amplio.pais.name} vs ${refPais.name}` : 'Frente a la referencia');

        cuerpo.innerHTML = filas.map(pais => {
            const celdas = refs.map(codigo => celdaSpread(pais.yield - porCodigo.get(codigo).yield)).join('');
            const relleno = '<td class="ff-sp-num"></td>'.repeat(4 - refs.length);
            const chg = variacion(pais);
            return `<tr class="${pais.code === refPais.code ? 'is-ref' : ''}" title="${escaparHtml(pais.source || '')}">
                <td class="ff-sp-country"><span class="ff-sp-iso">${escaparHtml(pais.code)}</span>${escaparHtml(pais.name)}</td>
                <td class="ff-sp-num">${pais.yield.toFixed(3)}%</td>
                <td class="ff-sp-num ${chg == null ? 'ff-sp-zero' : chg >= 0 ? 'ff-sp-pos' : 'ff-sp-neg'}"
                    title="${pais.code === 'US' ? 'Frente a la sesión anterior' : 'Frente al mes anterior'} · corte ${escaparHtml(pais.period || 's/d')}">${
                    chg == null ? '—' : `${chg >= 0 ? '+' : ''}${(chg * 100).toFixed(1)} bp`}</td>
                ${celdas}${relleno}
            </tr>`;
        }).join('');
    }

    /* Variación frente a la observación anterior, en puntos porcentuales. */
    function variacion(pais) {
        return isNumeric(pais.prev) ? pais.yield - pais.prev : null;
    }

    function celdaSpread(diferencia) {
        const bp = diferencia * 100;
        // Un diferencial positivo significa que ese país paga más que la
        // referencia: se marca en rojo porque implica mayor prima de riesgo.
        const clase = Math.abs(bp) < 0.05 ? 'ff-sp-zero' : bp > 0 ? 'ff-sp-pos' : 'ff-sp-neg';
        const texto = Math.abs(bp) < 0.05 ? '0 bp' : `${bp > 0 ? '+' : ''}${bp.toFixed(1)} bp`;
        return `<td class="ff-sp-num ${clase}">${texto}</td>`;
    }

    function escaparHtml(texto) {
        return String(texto).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    function renderSupplement(name) {
        const section = $('ff-detail-supplement');
        if (!section || !detailConfig[name]) return;
        if (document.body.classList.contains('ff-detail-divisas')) {
            section.hidden = true;
            return;
        }
        section.hidden = false;

        /* La tabla de diferenciales solo tiene sentido donde se habla de deuda. */
        const spreadsBoard = $('ff-spreads-board');
        if (spreadsBoard) {
            const procede = name === 'bonos' || esRentaFija(name);
            spreadsBoard.hidden = !procede;
            if (procede) renderSpreadsBoard();
        }

        const setCopy = setSupplementCopy;

        /* El selector de bolsa solo tiene sentido en el módulo Bolsa. */
        const marketWrap = $('ff-supplement-market-wrap');
        if (marketWrap) marketWrap.hidden = name !== 'bolsa';

        if (name === 'bolsa') {
            renderBolsaSupplement();
            return;
        }

        if (esRentaFija(name)) {
            // El bloque "Mapa conjunto de tasas y bonos" (indicadores, grafica y
            // tabla de instrumentos) se retiro a peticion del usuario.
            // Este contenedor lo comparte con Bolsa y Bonos, asi que no se elimina:
            // se oculta solo para este modulo, que conserva sus propios paneles y
            // la tabla de diferenciales soberanos a 10 anos.
            section.hidden = true;
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
        if (esRentaFija(state.module)) {
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
        } else if (esRentaFija(state.module)) {
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
        } else if (esRentaFija(state.module)) {
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

    function buildNewsCard(item, index = 0) {
        const k = _newsCatKey(item);
        const card = document.createElement('button');
        card.className = `fnb-card${index === 0 ? ' is-radar-lead' : ''}`; card.type = 'button';
        card.dataset.radarRank = String(index + 1).padStart(2, '0');

        const media = document.createElement('div'); media.className = 'fnb-card-media';
        if (_isNewsImg(item.image)) media.appendChild(_newsImage(item.image, () => media.prepend(_newsFallback('fnb-card-fallback', k))));
        else media.appendChild(_newsFallback('fnb-card-fallback', k));
        const cat = document.createElement('span'); cat.className = 'fnb-cat'; cat.dataset.cat = k; cat.textContent = _newsCatLabel(item);
        const rank = document.createElement('span'); rank.className = 'fnb-card-rank'; rank.textContent = `Señal ${String(index + 1).padStart(2, '0')}`;
        media.append(cat, rank);

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
        const action = document.createElement('span'); action.className = 'fnb-department-lead-action'; action.innerHTML = 'Abrir historia <i class="fas fa-arrow-right" aria-hidden="true"></i>';
        copy.append(cat, title, summary, meta, action); button.append(media, copy);
        button.addEventListener('click', () => _openNews(item));
        return button;
    }

    function buildDepartment(definition, items, index = 0) {
        const section = document.createElement('section'); section.className = 'fnb-department';
        section.id = `fnb-department-${definition.accent}`;
        section.dataset.threadIndex = String(index + 1).padStart(2, '0');
        const head = document.createElement('header'); head.className = 'fnb-department-head'; head.dataset.cat = definition.accent;
        const titleWrap = document.createElement('div'); titleWrap.className = 'fnb-department-title';
        const eyebrow = document.createElement('span'); eyebrow.className = 'fnb-department-eyebrow'; eyebrow.textContent = `Dossier ${String(index + 1).padStart(2, '0')}`;
        const title = document.createElement('h3'); title.textContent = definition.title;
        const label = document.createElement('span'); label.className = 'fnb-department-count'; label.textContent = `${items.length} historias conectadas`;
        titleWrap.append(eyebrow, title); head.append(titleWrap, label);
        const grid = document.createElement('div'); grid.className = 'fnb-department-grid';
        grid.appendChild(buildDepartmentLead(items[0]));
        const list = document.createElement('div'); list.className = 'fnb-department-list'; list.dataset.cat = definition.accent;
        items.slice(1, 5).forEach((item, itemIndex) => {
            const button = document.createElement('button'); button.type = 'button';
            const rank = document.createElement('span'); rank.className = 'fnb-department-list-index'; rank.textContent = String(itemIndex + 2).padStart(2, '0');
            const wrap = document.createElement('div');
            const itemTitle = document.createElement('h4'); itemTitle.textContent = item.title || '';
            const meta = document.createElement('small'); meta.textContent = `${_newsCatLabel(item)} · ${item.source || 'Fuente'}`;
            wrap.append(itemTitle, meta); button.append(rank, wrap);
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
        host.replaceChildren(...sections.map((group, index) => buildDepartment(group.definition, group.items, index)));
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
            li.dataset.impact = _newsImpact(item);
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
        if ($('fnb-insight-count')) $('fnb-insight-count').textContent = String(selected.length).padStart(2, '0');
        host.replaceChildren(...selected.map((item, index) => {
            const k = _newsCatKey(item);
            const impact = _newsImpact(item);
            const article = document.createElement('article'); article.className = `fnb-perspective${index === 0 ? ' is-primary' : ''}`; article.dataset.cat = k; article.dataset.insightRank = String(index + 1).padStart(2, '0');
            const top = document.createElement('div'); top.className = 'fnb-perspective-top';
            const rank = document.createElement('span'); rank.className = 'fnb-perspective-rank'; rank.textContent = String(index + 1).padStart(2, '0');
            const category = document.createElement('span'); category.textContent = `${_newsCatLabel(item)} · Lectura editorial`;
            category.className = 'fnb-perspective-category';
            const strength = document.createElement('span'); strength.className = `fnb-insight-strength ${impact}`; strength.setAttribute('aria-label', `Impacto ${impact}`); strength.innerHTML = '<i></i><i></i><i></i>';
            top.append(rank, category, strength);
            const title = document.createElement('h4'); title.textContent = item.title || '';
            const insight = document.createElement('blockquote'); insight.textContent = item.insight || item.description || 'Consulta la noticia para conocer el contexto completo.';
            const insightWrap = document.createElement('div'); insightWrap.className = 'fnb-perspective-thesis';
            const insightLabel = document.createElement('span'); insightLabel.textContent = index === 0 ? 'Tesis principal' : 'Lectura complementaria';
            insightWrap.append(insightLabel, insight);
            const foot = document.createElement('footer'); foot.className = 'fnb-perspective-foot';
            const source = document.createElement('small'); source.textContent = item.source || 'Mesa editorial';
            const button = document.createElement('button'); button.type = 'button'; button.innerHTML = 'Profundizar <i class="fas fa-arrow-right"></i>';
            button.addEventListener('click', () => _openNews(item));
            foot.append(source, button); article.append(top, title, insightWrap, foot);
            return article;
        }));
    }

    function buildCoverageCard(item, index = 0) {
        const k = _newsCatKey(item);
        const button = document.createElement('button'); button.type = 'button'; button.className = 'fnb-coverage-card'; button.dataset.cat = k;
        button.setAttribute('aria-label', `Abrir historia ${index + 1}: ${item.title || 'Noticia financiera internacional'}`);
        if (_isNewsImg(item.image)) button.appendChild(_newsImage(item.image, () => button.prepend(_newsFallback('fnb-card-fallback', k))));
        else button.appendChild(_newsFallback('fnb-card-fallback', k));
        const state = document.createElement('span'); state.className = 'fnb-coverage-state'; state.textContent = `Historia ${String(index + 1).padStart(2, '0')}`;
        const copy = document.createElement('div'); copy.className = 'fnb-coverage-copy';
        const category = document.createElement('span'); category.textContent = _newsCatLabel(item);
        const title = document.createElement('h4'); title.textContent = item.title || '';
        const summary = document.createElement('p'); summary.className = 'fnb-coverage-summary'; summary.textContent = item.description || item.insight || 'Abre la historia para consultar el contexto editorial completo.';
        const meta = document.createElement('small'); meta.textContent = `${item.source || 'Fuente'} · ${item.fecha || safeDate(item.publishedAt)}`;
        const foot = document.createElement('div'); foot.className = 'fnb-coverage-foot';
        const action = document.createElement('span'); action.className = 'fnb-coverage-open'; action.innerHTML = 'Leer historia <i class="fas fa-arrow-right" aria-hidden="true"></i>';
        foot.append(meta, action); copy.append(category, title, summary, foot); button.append(state, copy);
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
        host.replaceChildren(...selected.map((item, index) => buildCoverageCard(item, index)));
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

    /* ── El pulso del día ─────────────────────────────────────────────────────
       La edición completa dibujada como un solo campo: eje X la hora real de
       publicación, eje Y el impacto editorial, color el sentimiento. Debajo, una
       curva de intensidad acumulada — la "onda" de la jornada — que es lo que
       hace legible de un golpe si el día fue plano o si hubo un pico.

       Se dibuja en SVG y no en canvas a propósito: cada punto tiene que ser
       enfocable con el tabulador y anunciable por un lector de pantalla, cosa
       imposible en un lienzo. */
    const _PULSE_VB_W = 1000, _PULSE_VB_H = 320;
    /* `abajo` reserva la franja inferior para dos cosas distintas: el rótulo de
       horas y, más abajo, la onda de intensidad. Cuando compartían banda, la
       curva cruzaba por encima de las horas y no se leía ninguna de las dos. */
    const _PULSE_PAD = { izq: 78, der: 26, arriba: 26, abajo: 94 };
    const _PULSE_ONDA_BASE = _PULSE_VB_H - 6, _PULSE_ONDA_ALTO = 42;
    const _PULSE_BANDAS = [
        { key: 'alto',  etiqueta: 'Alto',  radio: 10 },
        { key: 'medio', etiqueta: 'Medio', radio: 7.5 },
        { key: 'bajo',  etiqueta: 'Bajo',  radio: 5.5 },
    ];
    const _PULSE_PESO = { alto: 3, medio: 2, bajo: 1 };
    const _SVG = 'http://www.w3.org/2000/svg';
    const _svg = (nombre, atributos = {}) => {
        const nodo = document.createElementNS(_SVG, nombre);
        for (const [k, v] of Object.entries(atributos)) nodo.setAttribute(k, v);
        return nodo;
    };
    /* Reloj de 24 h: en el eje, "02:11 a.m." ocupa el doble y obliga a quitar
       marcas. Además es el formato que usa el resto del terminal. */
    const _pulseHora = (t) => new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });

    function _pulseSentimiento(item) {
        if (['positive', 'negative', 'neutral'].includes(item.sentiment)) return item.sentiment;
        const [etiqueta] = impactFor(item);
        return etiqueta === 'Positivo' ? 'positive' : etiqueta === 'Negativo' ? 'negative' : 'neutral';
    }

    /** Marcas de tiempo utilizables; si la fuente no trae hora, se reparten sobre
     *  la ventana para que el orden editorial siga siendo legible. */
    function _pulseMarcas(items) {
        const crudas = items.map((item) => {
            const t = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
            return Number.isFinite(t) ? t : null;
        });
        const validas = crudas.filter((t) => t !== null);
        const ahora = Date.now();
        let min = validas.length ? Math.min(...validas) : ahora - 8 * 36e5;
        let max = validas.length ? Math.max(...validas) : ahora;
        if (max - min < 36e5) { min -= 18e5; max += 18e5; }
        return {
            min, max,
            marcas: crudas.map((t, i) => t !== null ? t : min + ((i + 0.5) / crudas.length) * (max - min)),
            conHora: validas.length,
        };
    }

    function renderNewsPulse(items) {
        const lienzo = $('fnb-pulse-plot');
        const detalle = $('fnb-pulse-detail');
        if (!lienzo) return;

        const lista = (items || []).filter(Boolean);
        lienzo.replaceChildren();
        if (!lista.length) {
            const vacio = document.createElement('p');
            vacio.className = 'fnb-pulse-empty';
            vacio.textContent = 'Todavía no hay historias en esta selección.';
            lienzo.appendChild(vacio);
            if (detalle) detalle.replaceChildren(vacio.cloneNode(true));
            return;
        }

        const { min, max, marcas } = _pulseMarcas(lista);
        const ancho = _PULSE_VB_W - _PULSE_PAD.izq - _PULSE_PAD.der;
        const alto = _PULSE_VB_H - _PULSE_PAD.arriba - _PULSE_PAD.abajo;
        const x = (t) => _PULSE_PAD.izq + ((t - min) / (max - min || 1)) * ancho;
        const yBanda = (i) => _PULSE_PAD.arriba + (alto / _PULSE_BANDAS.length) * (i + 0.5);

        const puntos = lista.map((item, i) => {
            const impacto = _newsImpact(item);
            const banda = Math.max(0, _PULSE_BANDAS.findIndex((b) => b.key === impacto));
            return {
                item, impacto, banda,
                t: marcas[i],
                x: x(marcas[i]),
                y: yBanda(banda),
                r: _PULSE_BANDAS[banda].radio,
                sentimiento: _pulseSentimiento(item),
                categoria: _newsCatKey(item),
            };
        });

        /* Reparto horizontal: dos noticias del mismo minuto y del mismo impacto se
           taparían por completo. Se separan lo justo dentro de su banda. */
        _PULSE_BANDAS.forEach((_, banda) => {
            const fila = puntos.filter((p) => p.banda === banda).sort((a, b) => a.x - b.x);
            fila.forEach((p, i) => {
                if (!i) return;
                const previo = fila[i - 1];
                const minima = previo.r + p.r + 3;
                if (p.x - previo.x < minima) p.x = previo.x + minima;
            });
            const desborde = fila.length ? fila[fila.length - 1].x - (_PULSE_VB_W - _PULSE_PAD.der) : 0;
            if (desborde > 0) fila.forEach((p) => { p.x -= desborde; });
        });

        const svg = _svg('svg', {
            class: 'fnb-pulse-svg',
            viewBox: `0 0 ${_PULSE_VB_W} ${_PULSE_VB_H}`,
            preserveAspectRatio: 'xMidYMid meet',
            role: 'group',
            'aria-label': `Mapa de ${puntos.length} historias por hora e impacto`,
        });

        const defs = _svg('defs');
        const grad = _svg('linearGradient', { id: 'fnb-pulse-grad', x1: '0', y1: '0', x2: '0', y2: '1' });
        grad.append(
            _svg('stop', { offset: '0%', 'stop-color': 'var(--fnb-pulse-wave)', 'stop-opacity': '.42' }),
            _svg('stop', { offset: '100%', 'stop-color': 'var(--fnb-pulse-wave)', 'stop-opacity': '0' }),
        );
        defs.appendChild(grad);
        svg.appendChild(defs);

        // Bandas de impacto y su rótulo.
        const rejilla = _svg('g', { class: 'fnb-pulse-grid' });
        _PULSE_BANDAS.forEach((banda, i) => {
            const y = yBanda(i);
            rejilla.appendChild(_svg('line', { x1: _PULSE_PAD.izq - 12, y1: y, x2: _PULSE_VB_W - _PULSE_PAD.der, y2: y }));
            const texto = _svg('text', { x: _PULSE_PAD.izq - 22, y: y + 4, class: 'fnb-pulse-band-label' });
            texto.textContent = banda.etiqueta.toUpperCase();
            rejilla.appendChild(texto);
        });
        svg.appendChild(rejilla);

        /* Onda de intensidad: cada historia reparte su peso sobre las cubetas
           vecinas, de modo que varias noticias fuertes en la misma hora levantan
           un pico visible en lugar de un escalón. */
        const CUBETAS = 64;
        const cubetas = new Array(CUBETAS).fill(0);
        puntos.forEach((p) => {
            const centro = ((p.x - _PULSE_PAD.izq) / ancho) * (CUBETAS - 1);
            for (let i = 0; i < CUBETAS; i++) {
                const d = (i - centro) / 3.2;
                cubetas[i] += (_PULSE_PESO[p.impacto] || 1) * Math.exp(-d * d);
            }
        });
        const tope = Math.max(...cubetas, 1);
        const baseOnda = _PULSE_ONDA_BASE;
        const alturaOnda = _PULSE_ONDA_ALTO;
        const puntosOnda = cubetas.map((v, i) => [
            _PULSE_PAD.izq + (i / (CUBETAS - 1)) * ancho,
            baseOnda - (v / tope) * alturaOnda,
        ]);
        const d = puntosOnda.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
        svg.appendChild(_svg('path', {
            class: 'fnb-pulse-wave-fill',
            d: `${d} L${_PULSE_VB_W - _PULSE_PAD.der},${baseOnda} L${_PULSE_PAD.izq},${baseOnda} Z`,
            fill: 'url(#fnb-pulse-grad)',
        }));
        svg.appendChild(_svg('path', { class: 'fnb-pulse-wave-line', d }));

        // Eje de horas.
        const ejes = _svg('g', { class: 'fnb-pulse-axis' });
        const TICKS = 6;
        for (let i = 0; i < TICKS; i++) {
            const t = min + ((max - min) * i) / (TICKS - 1);
            const px = x(t);
            ejes.appendChild(_svg('line', { x1: px, y1: _PULSE_PAD.arriba - 8, x2: px, y2: _PULSE_VB_H - _PULSE_PAD.abajo + 6, class: 'fnb-pulse-tick' }));
            const rotulo = _svg('text', { x: px, y: _PULSE_VB_H - _PULSE_PAD.abajo + 26, class: 'fnb-pulse-tick-label' });
            rotulo.textContent = _pulseHora(t);
            ejes.appendChild(rotulo);
        }
        svg.appendChild(ejes);

        // Puntos.
        const capa = _svg('g', { class: 'fnb-pulse-nodes' });
        const seleccionar = (punto, nodo) => {
            capa.querySelectorAll('.is-active').forEach((n) => n.classList.remove('is-active'));
            nodo.classList.add('is-active');
            _pulseDetalle(punto);
        };
        puntos
            .slice()
            .sort((a, b) => a.t - b.t)
            .forEach((punto, orden) => {
                const nodo = _svg('g', {
                    class: `fnb-pulse-node s-${punto.sentimiento} i-${punto.impacto}`,
                    'data-cat': punto.categoria,
                    tabindex: '0',
                    role: 'button',
                    'aria-label': `${_pulseHora(punto.t)}, ${_newsCatLabel(punto.item)}, impacto ${punto.impacto}: ${punto.item.title || 'historia'}`,
                });
                nodo.style.setProperty('--fnb-pulse-delay', `${Math.min(orden * 45, 1400)}ms`);
                nodo.appendChild(_svg('circle', { class: 'fnb-pulse-halo', cx: punto.x, cy: punto.y, r: punto.r + 7 }));
                nodo.appendChild(_svg('circle', { class: 'fnb-pulse-dot', cx: punto.x, cy: punto.y, r: punto.r }));
                nodo.addEventListener('mouseenter', () => seleccionar(punto, nodo));
                nodo.addEventListener('focus', () => seleccionar(punto, nodo));
                nodo.addEventListener('click', () => _openNews(punto.item));
                nodo.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _openNews(punto.item); }
                });
                capa.appendChild(nodo);
            });
        svg.appendChild(capa);
        lienzo.appendChild(svg);

        // Resumen de cabecera.
        const altos = puntos.filter((p) => p.impacto === 'alto').length;
        const alza = puntos.filter((p) => p.sentimiento === 'positive').length;
        const baja = puntos.filter((p) => p.sentimiento === 'negative').length;
        const fijar = (id, valor) => { const n = $(id); if (n) n.textContent = valor; };
        fijar('fnb-pulse-total', String(puntos.length));
        fijar('fnb-pulse-high', `${altos} de ${puntos.length}`);
        fijar('fnb-pulse-bias', alza === baja ? 'Equilibrado' : alza > baja ? 'Al alza' : 'A la baja');
        fijar('fnb-pulse-window', `${_pulseHora(min)} – ${_pulseHora(max)}`);

        // Arranca sobre la historia más fuerte del día, no sobre la primera.
        const destacada = puntos.slice().sort((a, b) =>
            (_PULSE_PESO[b.impacto] - _PULSE_PESO[a.impacto]) || (b.t - a.t))[0];
        const nodoDestacado = [...capa.children].find((n) => n.getAttribute('aria-label')?.includes(destacada.item.title || ''));
        if (nodoDestacado) nodoDestacado.classList.add('is-active');
        _pulseDetalle(destacada);
    }

    function _pulseDetalle(punto) {
        const caja = $('fnb-pulse-detail');
        if (!caja || !punto) return;
        const { item } = punto;
        caja.dataset.cat = punto.categoria;
        caja.dataset.sent = punto.sentimiento;

        const meta = document.createElement('div');
        meta.className = 'fnb-pulse-detail-meta';
        const hora = document.createElement('time'); hora.textContent = _pulseHora(punto.t);
        const cat = document.createElement('span'); cat.className = 'fnb-pulse-detail-cat'; cat.textContent = _newsCatLabel(item);
        const imp = document.createElement('span'); imp.className = `fnb-pulse-detail-impact ${punto.impacto}`; imp.textContent = `Impacto ${punto.impacto}`;
        meta.append(hora, cat, imp);

        const titulo = document.createElement('h4');
        titulo.textContent = item.title || 'Historia de la edición';

        const insight = document.createElement('p');
        insight.className = 'fnb-pulse-detail-insight';
        const etiqueta = document.createElement('span'); etiqueta.textContent = 'Qué significa';
        const cuerpo = document.createTextNode(item.insight || item.description || 'Consulta la ficha completa para el detalle de esta historia.');
        insight.append(etiqueta, cuerpo);

        const pie = document.createElement('div');
        pie.className = 'fnb-pulse-detail-foot';
        const fuente = document.createElement('small'); fuente.textContent = item.source || 'Fuente financiera';
        const leer = document.createElement('button');
        leer.type = 'button';
        leer.className = 'fnb-pulse-detail-read';
        leer.textContent = 'Leer la historia';
        leer.addEventListener('click', () => _openNews(item));
        pie.append(fuente, leer);

        caja.replaceChildren(meta, titulo, insight, pie);
    }

    function renderNews() {
        updateNewsModuleCard();
        const filtered = state.news.filter(item => state.newsFilter === 'all' || classifyNews(item) === state.newsFilter);
        updateNewsDesk(filtered);
        renderNewsPulse(filtered);
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
        if ($('fnb-radar-signal-count')) $('fnb-radar-signal-count').textContent = String(featured.length).padStart(2, '0');
        if ($('fnb-radar-live-count')) $('fnb-radar-live-count').textContent = String(latest.length).padStart(2, '0');
        grid.replaceChildren(...featured.map((item, index) => buildNewsCard(item, index)));
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
                    source:      item.fuente || 'ORION',
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
            /* Se deriva de exchangeConfig en vez de repetir los símbolos a mano:
               las tarjetas se dibujaban desde una lista y el dato se pedía desde
               otra, así que añadir una bolsa dejaba su tarjeta en "Sin datos"
               hasta que alguien recordara actualizar también este arreglo.
               Los tres extra no son bolsas: alimentan otros indicadores. */
            const quoteSymbols = [...new Set([
                ...exchangeConfig.map(exchange => exchange.symbol),
                '^MXX', '^VIX', '^MOVE',
            ])];
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
            renderBreakdown();
            renderDetailTable();
            renderInsights();
            if (document.body.classList.contains('ff-detail-mode') && !document.body.classList.contains('ff-detail-noticias') && state.module !== 'rendimientos') renderSupplement(state.module);
            await renderMainChart();
            $('ff-last-update').textContent = new Date().toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
            if (typeof VDS !== 'undefined' && VDS.banxico) {
                VDS.banxico('SP30578').then(value => {
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
            const observer = observar(new IntersectionObserver(entries => {
                const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
                if (visible?.target?.id) activate(visible.target.id);
            }, { rootMargin: '-24% 0px -62% 0px', threshold: [0, .15, .35] }));
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
        escuchar(window, 'scroll', updateProgress, { passive: true });
        escuchar(window, 'resize', updateProgress, { passive: true });
        updateProgress();
    }

    function setupDailyNewsExperience() {
        const newsroom = document.querySelector('.fnb-newsroom');
        const cover = newsroom?.querySelector('.fnb-masthead');
        if (!newsroom || newsroom.dataset.experienceBound === 'true') return;
        newsroom.dataset.experienceBound = 'true';

        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (cover && !reducedMotion.matches) {
            let frame = 0;
            escuchar(cover, 'pointermove', event => {
                window.cancelAnimationFrame(frame);
                frame = window.requestAnimationFrame(() => {
                    const rect = cover.getBoundingClientRect();
                    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100));
                    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100));
                    cover.style.setProperty('--fnb-pointer-x', `${x.toFixed(1)}%`);
                    cover.style.setProperty('--fnb-pointer-y', `${y.toFixed(1)}%`);
                });
            }, { passive: true });
            escuchar(cover, 'pointerleave', () => {
                cover.style.setProperty('--fnb-pointer-x', '72%');
                cover.style.setProperty('--fnb-pointer-y', '24%');
            }, { passive: true });
            _limpieza.push(() => window.cancelAnimationFrame(frame));
        }

        newsroom.querySelectorAll('[data-thread-jump]').forEach(button => {
            escuchar(button, 'click', () => {
                const target = document.getElementById(`fnb-department-${button.dataset.threadJump}`);
                if (!target) return;
                newsroom.querySelectorAll('[data-thread-jump]').forEach(item => {
                    const active = item === button;
                    item.classList.toggle('is-active', active);
                    if (active) item.setAttribute('aria-current', 'true');
                    else item.removeAttribute('aria-current');
                });
                target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
            });
        });

        const revealables = [...newsroom.querySelectorAll([
            '.fnb-reading-route', '.fnb-radar', '.fnb-departments',
            '.fnb-perspectives', '.fnb-coverage', '.fnb-archive',
        ].join(','))];
        revealables.forEach(node => node.classList.add('fnb-reveal'));
        if (!('IntersectionObserver' in window) || reducedMotion.matches) {
            revealables.forEach(node => node.classList.add('is-visible'));
            return;
        }
        const revealObserver = observar(new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                revealObserver.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -12% 0px', threshold: .08 }));
        revealables.forEach(node => revealObserver.observe(node));
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
        const activeTitle = $('fnb-coverage-active-title');
        const progress = $('fnb-coverage-progress');
        if (activeTitle) activeTitle.textContent = cards[index]?.querySelector('h4')?.textContent || 'Cobertura internacional';
        if (progress) progress.style.width = cards.length ? `${((index + 1) / cards.length) * 100}%` : '0%';
        cards.forEach((card, cardIndex) => {
            const active = cardIndex === index;
            card.classList.toggle('is-active', active);
            const state = card.querySelector('.fnb-coverage-state');
            if (state) state.textContent = active ? `En foco · ${String(cardIndex + 1).padStart(2, '0')}` : `Historia ${String(cardIndex + 1).padStart(2, '0')}`;
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
            if (!shouldPause) autoTimer = intervalo(() => moveNewsCarousel(1, true), 6500);
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
        escuchar(window, 'resize', syncNewsCarouselUI, { passive: true });
        // Las MediaQueryList también sobreviven al desmontaje: van al registro.
        if (reducedMotion.addEventListener) escuchar(reducedMotion, 'change', startAuto);
        if (hoverCapable.addEventListener) escuchar(hoverCapable, 'change', startAuto);
        escuchar(document, 'visibilitychange', () => (document.hidden ? stopAuto() : startAuto()));
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
            // El ranking tambien marca el pais comparado, asi que hay que
            // repintarlo: sin esto el resaltado se quedaba en el anterior.
            //
            // Se llama a renderReturnsGlobal() y no directamente al grafico
            // porque en el modo "Anclas monetarias" los datos son otros
            // (getReturnsGlobalAnchors), y pasar returnsGlobalData a pelo
            // pintaria el conjunto equivocado.
            renderReturnsGlobal();
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
        escuchar(document, 'keydown', event => {
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
        escuchar(document, 'keydown', event => {
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

    let executiveReports = [];
    let executiveReportsLoaded = false;
    let activeExecutiveReport = null;
    let executiveLiveReader = null;

    function execElement(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = String(text);
        return node;
    }

    function formatExecutiveTime(value) {
        const time = new Date(value);
        if (Number.isNaN(time.getTime())) return 'Corte disponible';
        return `Corte ${time.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}`;
    }

    function renderExecutiveReport(report) {
        const host = $('fin-exec-report');
        if (!host || !report) return;
        activeExecutiveReport = report;
        host.replaceChildren();
        host.append(execElement('p', 'fin-exec-selection', `${report.title} seleccionado · ${formatExecutiveTime(report.generatedAt)}`));
        const actions = execElement('div', 'fin-exec-actions');
        const download = execElement('button', '', 'Descargar DOCX');
        download.type = 'button'; download.innerHTML = '<i class="fas fa-file-word" aria-hidden="true"></i> Descargar DOCX';
        download.addEventListener('click', () => downloadExecutiveReport(download));
        const listen = execElement('button', '', 'Escuchar con ORION');
        listen.type = 'button'; listen.innerHTML = '<i class="fas fa-headphones" aria-hidden="true"></i> Escuchar con ORION';
        listen.addEventListener('click', () => toggleExecutiveReading(listen));
        actions.append(download, listen);
        host.append(actions, execElement('p', 'fin-exec-live-status', 'El contenido completo sólo se entrega al descargarlo o escucharlo.'));
    }

    function executiveText(report) {
        if (report?.content) return String(report.content).slice(0, 11_500);
        const lines = [`# ${report.title}`, report.eyebrow || '', report.summary || ''];
        (report.metrics || []).forEach(metric => lines.push(`- ${metric.label}: ${metric.value}${metric.change ? ` (${metric.change})` : ''}`));
        (report.sections || []).forEach(section => lines.push(`## ${section.heading}\n${section.text}`));
        lines.push(`Fuentes: ${(report.sources || []).join(', ') || 'sin fuente disponible'}.`);
        lines.push('Documento informativo. No constituye una recomendación de inversión.');
        return lines.filter(Boolean).join('\n\n').slice(0, 11_500);
    }

    function executiveStatus(message) {
        const status = document.querySelector('#fin-exec-report .fin-exec-live-status');
        if (status) status.textContent = message;
    }

    async function downloadExecutiveReport(button) {
        if (!activeExecutiveReport || button.disabled) return;
        button.disabled = true;
        executiveStatus('Preparando documento Word…');
        try {
            const response = await fetch('/api/report-export', {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: `VALLNEWS · ${activeExecutiveReport.title}`, content: executiveText(activeExecutiveReport),language:window.VNReportArtifacts?.selectedLanguage?.() || document.documentElement.lang || 'es',format: 'docx' }),
            });
            const data = await response.json();
            if (!response.ok || !data.downloadUrl) throw new Error(data.error || 'No se pudo generar el documento.');
            const link = document.createElement('a');
            link.href = data.downloadUrl; link.download = data.filename || `${activeExecutiveReport.key}.docx`;
            document.body.append(link); link.click(); link.remove();
            executiveStatus('Documento DOCX listo para descargar.');
        } catch (error) {
            executiveStatus(error.message || 'No se pudo descargar el documento.');
        } finally { button.disabled = false; }
    }

    async function stopExecutiveReading() {
        const reader = executiveLiveReader;
        executiveLiveReader = null;
        await reader?.stop?.().catch(() => {});
        executiveStatus('Lectura detenida.');
        document.querySelector('#fin-exec-report [data-fin-exec-listen]')?.replaceChildren(Object.assign(document.createElement('i'), { className: 'fas fa-headphones', ariaHidden: 'true' }), document.createTextNode(' Escuchar con ORION'));
    }

    async function toggleExecutiveReading(button) {
        if (executiveLiveReader) return stopExecutiveReading();
        const bridge = window.VNFinanceGeminiLive;
        if (!activeExecutiveReport || !bridge?.isSupported?.()) {
            executiveStatus('La lectura con ORION requiere una conexión segura (HTTPS) y un navegador compatible.');
            return;
        }
        button.disabled = true;
        button.dataset.finExecListen = 'true';
        executiveStatus('Conectando con ORION…');
        try {
            const reader = await bridge.start({
                captureMicrophone: false,
                onState: state => executiveStatus({ connecting: 'Conectando con ORION…', listening: 'ORION está listo para leer el informe.', speaking: 'ORION está leyendo el informe…' }[state] || 'Lectura finalizada.'),
                onError: message => { executiveLiveReader = null; executiveStatus(`Lectura no disponible: ${message}`); },
            });
            executiveLiveReader = reader;
            button.innerHTML = '<i class="fas fa-stop" aria-hidden="true"></i> Detener lectura';
            reader.speak(`Lee en voz alta este informe financiero de forma clara, natural y profesional. No agregues cifras, fuentes ni consejos que no estén en el texto. ${executiveText(activeExecutiveReport)}`);
        } catch (error) {
            executiveStatus(error.message || 'No se pudo iniciar ORION.');
        } finally { button.disabled = false; }
    }

    function renderExecutiveReports(payload) {
        executiveReports = Array.isArray(payload?.data) ? payload.data : [];
        const list = $('fin-exec-list');
        if (!list) return;
        list.replaceChildren();
        if (!executiveReports.length) {
            list.append(execElement('p', '', 'No hay informes disponibles en este momento.'));
            return;
        }
        executiveReports.forEach(report => {
            const button = execElement('button', '', report.title);
            button.type = 'button';
            button.dataset.finExecKey = report.key;
            button.addEventListener('click', () => {
                list.querySelectorAll('button').forEach(item => item.classList.toggle('is-active', item === button));
                renderExecutiveReport(report);
            });
            list.append(button);
        });
        const overview = executiveReports.find(report => report.key === 'overview') || executiveReports[0];
        list.querySelector(`[data-fin-exec-key="${overview.key}"]`)?.classList.add('is-active');
        renderExecutiveReport(overview);
    }

    async function loadExecutiveReports() {
        if (executiveReportsLoaded) return;
        try {
            const response = await fetch('/api/finance-executive-reports', { credentials: 'include' });
            const payload = await response.json();
            if (!response.ok || !payload.success) throw new Error(payload.error || 'No disponible');
            executiveReportsLoaded = true;
            renderExecutiveReports(payload);
        } catch (error) {
            const host = $('fin-exec-report');
            if (host) host.replaceChildren(execElement('p', '', 'No fue posible cargar el último corte. Puedes continuar usando los tableros de Finanzas.'));
        }
    }

    function bindExecutiveReports() {
        const toggle = $('fin-exec-toggle');
        const popover = $('fin-exec-popover');
        const close = $('fin-exec-close');
        if (!toggle || !popover) return;
        const setOpen = open => {
            toggle.setAttribute('aria-expanded', String(open));
            popover.hidden = !open;
            if (open) loadExecutiveReports();
        };
        toggle.addEventListener('click', () => setOpen(popover.hidden));
        close?.addEventListener('click', () => setOpen(false));
        escuchar(document, 'keydown', event => { if (event.key === 'Escape' && !popover.hidden) setOpen(false); });
    }

    function init() {
        if (!$('favro-finance')) return;
        if ($('ff-table-search')) $('ff-table-search').value = '';
        if ($('ff-table-filter')) $('ff-table-filter').value = 'all';
        document.querySelectorAll('[data-chart-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.classList.contains('is-active'))));
        document.querySelectorAll('[data-returns-years]').forEach(button => button.setAttribute('aria-pressed', String(button.classList.contains('is-active'))));
        bindEvents();
        setupNativeNewsNavigation();
        setupDailyNewsExperience();
        setupNewsCoverageCarousel();
        renderInsights();
        updateControls();
        loadCoreData();
        loadNews();
    }

    /* Suelta todo lo registrado y devuelve la sección a estado limpio. React lo
       llama al desmontar /finanzas; también corre solo si el script se vuelve a
       ejecutar (ver la llamada a VNFavro?.desmontar del principio).

       Las gráficas se destruyen aparte: LightweightCharts y Chart.js reservan
       lienzos y sus propios observadores, y dejarlos vivos retiene memoria del
       tamaño de la serie. */
    function desmontar() {
        stopExecutiveReading();
        _limpieza.splice(0).forEach((soltar) => { try { soltar(); } catch { /* ya suelto */ } });

        Object.values(state.miniCharts || {}).forEach((c) => {
            try {
                if (typeof c.remove === 'function') c.remove();
                else if (typeof c.destroy === 'function') c.destroy();
            } catch { /* ya destruida */ }
        });
        state.miniCharts = {};
        ['mainChart', 'breakdownChart', 'contextChart', 'supplementChart',
            'returnsChart', 'returnsHistoryChart', 'returnsGlobalChart'].forEach((clave) => {
            try { state[clave]?.destroy?.(); } catch { /* ya destruida */ }
            state[clave] = null;
        });

        if (window.VNFavro?.desmontar === desmontar) delete window.VNFavro;
    }

    window.VNFavro = { init, desmontar };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
/* Aquí terminaba una copia de 724 líneas del <script> inline de finanzas.html:
   26 declaraciones, ninguna propia. Como este archivo es defer, sus copias
   corrían DESPUÉS y pisaban a las del HTML — incluida una corrección que el
   HTML ya tenía y que por eso nunca surtía efecto (+(+usRate).toFixed(2) frente
   a +usRate.toFixed(2), que revienta si el dato llega como texto).
   El original vive ahora en assets/js/finanzas-page.js. */
