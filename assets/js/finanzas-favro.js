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
        newsOffset: 0,
    };

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
    const exchangeConfig = [
        { slug: 'sp500', symbol: '^GSPC', name: 'S&P 500', region: 'Estados Unidos', market: 'NYSE / Nasdaq' },
        { slug: 'nasdaq', symbol: '^NDX', name: 'Nasdaq 100', region: 'Estados Unidos', market: 'Tecnolog\u00eda' },
        { slug: 'ipc', symbol: '^MXX', name: 'S&P/BMV IPC', region: 'M\u00e9xico', market: 'Bolsa Mexicana' },
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

        if (state.miniCharts[id]) {
            try { state.miniCharts[id].remove(); } catch(e) {}
        }
        
        const cType = window.finMiniChartType || 'line';
        
        const chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: container.clientHeight || 48,
            layout: { background: { type: 'solid', color: 'transparent' }, textColor: 'transparent' },
            grid: { vertLines: { visible: false }, horzLines: { visible: false } },
            timeScale: { visible: false },
            rightPriceScale: { visible: false },
            crosshair: { mode: LightweightCharts.CrosshairMode.Magnet },
            handleScroll: false,
            handleScale: false
        });
        
        let series;
        if (cType === 'candles') {
            series = chart.addCandlestickSeries({ upColor: '#10b981', downColor: '#ef4444', borderVisible: false, wickUpColor: '#10b981', wickDownColor: '#ef4444' });
            series.setData(candles.map((c, i) => ({ time: i, open: +c.open, high: +c.high, low: +c.low, close: +c.close })));
        } else if (cType === 'ohlc') {
            series = chart.addBarSeries({ upColor: '#10b981', downColor: '#ef4444' });
            series.setData(candles.map((c, i) => ({ time: i, open: +c.open, high: +c.high, low: +c.low, close: +c.close })));
        } else if (cType === 'area') {
            series = chart.addAreaSeries({ lineColor: color, topColor: color + '40', bottomColor: 'transparent', lineWidth: 2 });
            series.setData(candles.map((c, i) => ({ time: i, value: +c.close })));
        } else {
            series = chart.addLineSeries({ color: color, lineWidth: 2 });
            series.setData(candles.map((c, i) => ({ time: i, value: +c.close })));
        }
        
        chart.timeScale().fitContent();
        state.miniCharts[id] = chart;
    }

    function ensureExchangeCards() {
        const grid = $('ff-exchange-grid');
        if (!grid || grid.childElementCount) return;
        const fragment = document.createDocumentFragment();
        exchangeConfig.forEach(exchange => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'ff-exchange-card is-loading';
            card.dataset.exchangeSymbol = exchange.symbol;
            card.setAttribute('aria-pressed', 'false');
            card.setAttribute('aria-label', `Abrir ${exchange.name} en Finanzas y gráficas`);

            card.innerHTML = `
                <span class="ff-exchange-card-head">
                    <span class="ff-head-identity">
                        <strong>${exchange.name}</strong>
                        <small>${exchange.region}</small>
                    </span>
                    <em class="ff-badge">${exchange.symbol}</em>
                </span>
                <span class="ff-exchange-card-quote">
                    <strong id="ff-exchange-${exchange.slug}-value">Cargando…</strong>
                    <span id="ff-exchange-${exchange.slug}-delta" class="ff-delta-pill">Consultando mercado</span>
                </span>
                <span class="ff-exchange-card-chart">
                    <div class="ff-chart-glow"></div>
                    <canvas id="ff-exchange-${exchange.slug}-chart" role="img" aria-label="Evolución reciente de ${exchange.name}"></canvas>
                </span>
                <span class="ff-exchange-card-foot">
                    <span class="ff-market-name">${exchange.market}</span>
                    <span class="ff-action-hover">Analizar <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i></span>
                </span>
            `;

            card.addEventListener('click', () => openExchangeInLab(exchange.symbol, card));
            fragment.append(card);
        });
        grid.append(fragment);
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
            renderExchangeSpark(chartId, quote.candles, isUp ? colors.green : colors.red);
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
            eyebrow: 'Riesgo y retorno',
            title: 'Bonos y rendimientos',
            description: 'Curvas de rendimiento, tramos, primas por plazo y señales del ciclo de tasas.',
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
            rendimientos: ['Curvas y rendimientos', 'Pendiente, primas por plazo y estructura global de rendimientos.'],
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
        const wlPanel = $('watchlist-panel');
        if (host && chartPanel) {
            host.hidden = false;
            if (wlPanel) host.append(wlPanel);
            host.append(chartPanel);
            chartPanel.style.display = '';
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

    function renderSupplement(name) {
        const section = $('ff-detail-supplement');
        if (!section || !detailConfig[name]) return;
        section.hidden = false;

        const setCopy = (kicker, title, description, source, chartKicker, chartTitle, unit, tableTitle, note) => {
            $('ff-supplement-kicker').textContent = kicker;
            $('ff-supplement-title').textContent = title;
            $('ff-supplement-description').textContent = description;
            $('ff-supplement-source').textContent = source;
            $('ff-supplement-chart-kicker').textContent = chartKicker;
            $('ff-supplement-chart-title').textContent = chartTitle;
            $('ff-supplement-chart-unit').textContent = unit;
            $('ff-supplement-table-title').textContent = tableTitle;
            $('ff-supplement-note').querySelector('p').textContent = note;
        };

        if (name === 'bolsa') {
            const stocks = state.bmvData.filter(item => item.type === 'stock' && isNumeric(item.change_pct));
            const ordered = [...stocks].sort((a, b) => +b.change_pct - +a.change_pct);
            const advances = stocks.filter(item => +item.change_pct > 0).length;
            const declines = stocks.filter(item => +item.change_pct < 0).length;
            const range = stocks.length ? Math.max(...stocks.map(item => +item.change_pct)) - Math.min(...stocks.map(item => +item.change_pct)) : null;
            const leader = ordered[0];
            setCopy(
                'Cobertura bursátil',
                'Lectura verificable de Bolsa',
                'Precios y variaciones de las emisoras mexicanas disponibles, complementados por índices globales y volatilidad.',
                state.bmvTimestamp ? `BMV · ${safeDate(state.bmvTimestamp)}` : 'BMV y datos de mercado',
                'Variación diaria',
                'Emisoras mexicanas disponibles',
                '% sesión',
                'Precio y movimiento',
                'La fuente actual no entrega volumen de operación en este endpoint. Favro no lo estima: se conserva el laboratorio histórico para consultar precio, rango y tendencia.',
            );
            renderSupplementKpis([
                { label: 'Cobertura BMV', value: `${stocks.length} emisoras`, note: 'Disponibles en la fuente' },
                { label: 'Avances', value: String(advances), note: 'Variación positiva', tone: advances ? 'ff-positive-text' : '' },
                { label: 'Descensos', value: String(declines), note: 'Variación negativa', tone: declines ? 'ff-negative-text' : '' },
                { label: 'Liderazgo', value: leader ? formatPercent(leader.change_pct) : '—', note: leader?.name || 'Sin lectura' },
            ]);
            renderSupplementChart('bar', stocks.map(item => item.symbol), [{
                label: 'Variación diaria',
                data: stocks.map(item => +item.change_pct),
                backgroundColor: stocks.map(item => +item.change_pct >= 0 ? colors.green : colors.red),
                borderRadius: 5,
            }], 'Variación %');
            renderSupplementTable(
                ['Emisora', 'Precio MXN', 'Variación', 'Lectura'],
                ordered.map(item => [item.name || item.symbol, formatNumber(item.price, 2), formatPercent(item.change_pct), +item.change_pct >= 0 ? 'Alza' : 'Baja']),
            );
            if (Number.isFinite(range)) $('ff-supplement-kpis')?.lastElementChild?.querySelector('em')?.setAttribute('title', `Rango de movimientos: ${range.toFixed(2)} pp`);
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
                `Treasury 3M es un proxy de mercado, no la tasa oficial de la Fed. Zona Euro 10Y es un bono soberano, no tasa del BCE. ${isNumeric(state.inflation) ? `Inflación México disponible: ${formatYield(state.inflation)}.` : 'La inflación de México no está disponible; Favro no calcula una tasa real con un supuesto.'} Los datos indicativos no equivalen a cotizaciones en vivo.`,
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
            kicker = 'Emisoras'; title = 'Pulso de acciones mexicanas'; badge = 'Sesión'; note = 'Variación diaria de las emisoras disponibles en Favro; verde indica avance y rojo retroceso.';
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
        let text = 'Favro conserva los últimos datos disponibles y evita convertir valores ausentes en señales.';
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
        const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();
        if (/fed|banxico|rate|tasa|inflaci/.test(text)) return 'rates';
        if (/bond|bono|treasury|yield|debt/.test(text)) return 'bonds';
        return 'markets';
    }

    function impactFor(item) {
        const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();
        if (/rise|gain|rally|growth|beat|sube|avance/.test(text)) return ['Positivo','ff-impact-positive'];
        if (/fall|drop|risk|war|miss|baja|cae|tensión/.test(text)) return ['Negativo','ff-impact-negative'];
        return ['Neutral','ff-impact-neutral'];
    }

    function openNewsReader(item) {
        const reader = $('ff-news-reader');
        if (!reader || !item) return;
        $('ff-reader-category').textContent = classifyNews(item) === 'rates' ? 'Tasas' : classifyNews(item) === 'bonds' ? 'Bonos' : 'Mercados';
        $('ff-reader-title').textContent = item.title || 'Detalle de la noticia';
        $('ff-reader-source').textContent = item.source || 'Fuente financiera';
        $('ff-reader-time').textContent = safeDate(item.publishedAt);
        $('ff-reader-impact').textContent = item.impact ? `Impacto ${item.impact}` : impactFor(item)[0];
        $('ff-reader-description').textContent = item.description || 'No hay un resumen ampliado disponible para este titular.';
        $('ff-reader-related').textContent = item.related || (classifyNews(item) === 'rates' ? 'Crédito, ahorro, divisas y renta fija' : classifyNews(item) === 'bonds' ? 'Tasas, duración y costo de capital' : 'Índices, sectores y volatilidad');
        $('ff-reader-disclaimer').textContent = state.newsIsDemo ? 'Contenido demostrativo generado a partir de la fuente interna de Favro. No se presenta como una noticia verificada ni como asesoría financiera.' : 'Resumen informativo; consulta la fuente original para conocer todos los detalles.';
        reader.hidden = false;
        document.body.style.overflow = 'hidden';
        reader.querySelector('.ff-reader-close')?.focus();
    }

    function closeNewsReader() {
        const reader = $('ff-news-reader');
        if (reader) reader.hidden = true;
        document.body.style.overflow = '';
    }

    function updateNewsModuleCard() {
        const lead = state.news[0];
        const counts = state.news.reduce((summary, item) => {
            summary[classifyNews(item)] += 1;
            return summary;
        }, { markets: 0, rates: 0, bonds: 0 });
        if ($('ff-card-news-title')) $('ff-card-news-title').textContent = lead?.title || 'No hay titulares disponibles en este momento.';
        if ($('ff-card-news-source')) $('ff-card-news-source').textContent = state.newsIsDemo ? `${lead?.source || 'Favro'} · contenido demostrativo` : (lead?.source || 'Fuente financiera');
        if ($('ff-card-news-time')) $('ff-card-news-time').textContent = lead ? safeDate(lead.publishedAt) : 'Pendiente de actualización';
        if ($('ff-card-news-markets')) $('ff-card-news-markets').textContent = String(counts.markets);
        if ($('ff-card-news-rates')) $('ff-card-news-rates').textContent = String(counts.rates);
        if ($('ff-card-news-bonds')) $('ff-card-news-bonds').textContent = String(counts.bonds);
    }

    function renderNews() {
        updateNewsModuleCard();
        const filtered = state.news.filter(item => state.newsFilter === 'all' || classifyNews(item) === state.newsFilter);
        const lead = filtered[0] || state.news[0];
        if (lead) {
            const card = $('ff-lead-story');
            card.querySelector('.ff-story-meta span').textContent = state.newsIsDemo ? `${lead.source || 'VALL-AI'} · Resumen demostrativo` : (lead.source || 'Fuente financiera');
            card.querySelector('time').textContent = safeDate(lead.publishedAt);
            card.querySelector('h3').textContent = lead.title;
            card.querySelector('.ff-lead-copy > p').textContent = lead.description || 'Sigue el desarrollo y consulta los mercados relacionados.';
            const [impact, cls] = impactFor(lead);
            const badge = card.querySelector('.ff-story-impact span');
            badge.textContent = `Impacto ${impact.toLowerCase()}`;
            badge.className = cls;
            const relatedBadge = card.querySelector('.ff-story-impact em');
            if (relatedBadge) relatedBadge.textContent = classifyNews(lead) === 'rates' ? 'Tasas y crédito' : classifyNews(lead) === 'bonds' ? 'Renta fija' : 'Mercados globales';
            const visual = card.querySelector('.ff-lead-visual');
            const newsTag = card.querySelector('.ff-news-tag');
            if (newsTag) newsTag.textContent = state.newsIsDemo ? 'Contenido demostrativo' : 'En desarrollo';
            if (lead.image && /^https?:/.test(lead.image)) visual.style.backgroundImage = `linear-gradient(rgba(7,28,44,.28),rgba(7,28,44,.65)),url("${lead.image.replace(/"/g,'')}")`;
            visual.style.backgroundSize = 'cover';
            visual.style.backgroundPosition = 'center';
            if (lead.url) {
                const button = card.querySelector('.ff-lead-copy > button');
                button.textContent = 'Leer noticia completa ↗';
                button.onclick = () => window.open(lead.url, '_blank', 'noopener');
            } else {
                const button = card.querySelector('.ff-lead-copy > button');
                button.removeAttribute('data-open-module');
                button.textContent = 'Leer análisis completo →';
                button.onclick = () => openNewsReader(lead);
            }
        }
        const track = $('ff-headline-track');
        const items = filtered.slice(1, 10);
        if (!items.length) {
            track.innerHTML = '<article class="ff-headline"><span>Sin resultados</span><strong>No hay titulares para este filtro.</strong><em>Prueba otra categoría</em></article>';
            return;
        }
        track.replaceChildren(...items.map(item => {
            const a = document.createElement(item.url ? 'a' : 'button');
            a.className = 'ff-headline';
            if (item.url) { a.href = item.url; a.target = '_blank'; a.rel = 'noopener'; }
            else { a.type = 'button'; a.addEventListener('click', () => openNewsReader(item)); }
            const category = document.createElement('span'), title = document.createElement('strong'), meta = document.createElement('em');
            category.textContent = classifyNews(item) === 'rates' ? 'Tasas' : classifyNews(item) === 'bonds' ? 'Bonos' : 'Mercados';
            title.textContent = item.title;
            meta.textContent = `${item.source || 'Fuente'} · ${safeDate(item.publishedAt)}`;
            a.append(category,title,meta);
            return a;
        }));
        state.newsOffset = 0;
        track.scrollLeft = 0;
    }

    async function loadNews() {
        try {
            let items = typeof VDS !== 'undefined' && VDS.finnhubNews ? await VDS.finnhubNews('general') : null;
            state.newsIsDemo = false;
            if (!Array.isArray(items) || !items.length) {
                const financeFeed = await fetchJson('/api/finanzas');
                const generated = financeFeed?.data?.noticias || [];
                items = generated.map(item => ({
                    title: item.titulo,
                    description: item.descripcion,
                    source: item.fuente || 'VALL-AI',
                    publishedAt: item.fecha,
                    category: item.categoria,
                    impact: item.impacto,
                    related: item.ia_insight,
                    url: '',
                    image: ''
                }));
                state.newsIsDemo = true;
            }
            state.news = Array.isArray(items) ? items.filter(item => item?.title).slice(0, 14) : [];
            renderNews();
        } catch (error) {
            console.warn('Favro news:', error);
            state.news = [];
            updateNewsModuleCard();
            $('ff-headline-track').innerHTML = '<article class="ff-headline"><span>Sin conexión</span><strong>No pudimos actualizar los titulares.</strong><em>Reintenta más tarde</em></article>';
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
            renderBreakdown();
            renderDetailTable();
            renderInsights();
            if (document.body.classList.contains('ff-detail-mode') && !document.body.classList.contains('ff-detail-noticias')) renderSupplement(state.module);
            await renderMainChart();
            $('ff-last-update').textContent = new Date().toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
            if (typeof VDS !== 'undefined' && VDS.banxico) {
                VDS.banxico('SP74660').then(value => {
                    if (!isNumeric(value)) return;
                    state.inflation = +value;
                    updateBondCards();
                    renderContextChart();
                    updateAutomaticConclusion();
                    if (document.body.classList.contains('ff-detail-mode') && !document.body.classList.contains('ff-detail-noticias')) renderSupplement(state.module);
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
        document.querySelectorAll('[data-detail-module]').forEach(button => button.addEventListener('click', () => openDetail(button.dataset.detailModule)));
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
            document.querySelectorAll('[data-news-filter]').forEach(item => item.classList.toggle('is-active', item === button));
            renderNews();
        }));
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
        document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('ff-news-reader')?.hidden) closeNewsReader(); });
    }

    function init() {
        if (!$('favro-finance')) return;
        if ($('ff-table-search')) $('ff-table-search').value = '';
        if ($('ff-table-filter')) $('ff-table-filter').value = 'all';
        document.querySelectorAll('[data-chart-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.classList.contains('is-active'))));
        bindEvents();
        renderInsights();
        updateControls();
        loadCoreData();
        loadNews();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
