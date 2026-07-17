// Logica inline verbatim de finanzas.html (extraida). La usa Finanzas.jsx.

    (function () {
        const reduce  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const isTouch = window.matchMedia('(hover: none)').matches;
        const cards   = document.querySelectorAll('#pane-general .hub-grid .card');

        // Tilt 3D + reflejo especular (solo con mouse, no touch)
        if (!reduce && !isTouch) {
            const MAX_TILT = 6;
            cards.forEach(card => {
                let raf = null;
                card.addEventListener('mousemove', e => {
                    const r  = card.getBoundingClientRect();
                    const px = (e.clientX - r.left) / r.width;
                    const py = (e.clientY - r.top) / r.height;
                    if (raf) cancelAnimationFrame(raf);
                    raf = requestAnimationFrame(() => {
                        const rx = (0.5 - py) * MAX_TILT;
                        const ry = (px - 0.5) * MAX_TILT;
                        card.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-4px)`;
                        card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
                        card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
                    });
                });
                card.addEventListener('mouseleave', () => {
                    if (raf) cancelAnimationFrame(raf);
                    card.style.transform = '';
                });
            });
        }

        // Preparar longitud del trazo para animar las sparklines
        document.querySelectorAll('#pane-general .hub-grid .spark path.line').forEach(p => {
            p.style.setProperty('--len', p.getTotalLength());
        });

        // Dibujar sparkline la primera vez que el recuadro entra en viewport
        const io = new IntersectionObserver(entries => {
            entries.forEach(en => {
                if (en.isIntersecting) {
                    en.target.classList.add('inview');
                    io.unobserve(en.target);
                }
            });
        }, { threshold: 0.35 });
        document.querySelectorAll('#pane-general .hub-grid .card-wrap').forEach(w => io.observe(w));

        // Transiciones de entrada (mismo sistema .reveal-up/.reveal-scale que inicio.html)
        const revealEls = document.querySelectorAll('#pane-general .reveal-up, #pane-general .reveal-scale');
        if (revealEls.length) {
            const revealObserver = new IntersectionObserver(entries => {
                entries.forEach(en => { if (en.isIntersecting) en.target.classList.add('active'); });
            }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });
            revealEls.forEach(el => revealObserver.observe(el));
        }
    })();
    

/* ---- bloque ---- */


                            setTimeout(async () => {
                                // Funciones auxiliares
                                const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
                                const setPct = (id, pct, isBp=false) => {
                                    const el = document.getElementById(id);
                                    if (!el || isNaN(pct)) return;
                                    const val = isBp ? pct : pct;
                                    el.innerText = (val >= 0 ? '+' : '') + val.toFixed(2) + (isBp ? ' pb' : '%');
                                    el.className = 'p ' + (val >= 0 ? 'up' : 'down');
                                };

                                // Divisas
                                VDS.usdmxn().then(v => {
                                    if(v) setText('ms-usdmxn', v.toFixed(4));
                                });
                                // Tasas Banxico
                                const loadBanxico = async (serie, id) => {
                                    const v = await VDS.banxico(serie);
                                    if(v) setText(id, v.toFixed(2) + '%');
                                };
                                loadBanxico('SF43783', 'ms-tiie28');
                                loadBanxico('SF43878', 'ms-tiie91');
                                loadBanxico('SF43936', 'ms-cetes28');
                                loadBanxico('SF43939', 'ms-cetes91');
                                loadBanxico('SF43945', 'ms-cetes364');

                                // Mercados y Riesgo (Vía Gemini para evitar límite de AlphaVantage)
                                const prompt = `Proporciona el precio actual y el cambio porcentual de hoy para los siguientes activos financieros: IPC (BMV), S&P 500, NASDAQ 100, VIX, US T-Note 10A, Oro y Petróleo WTI. Responde ÚNICAMENTE en JSON con la siguiente estructura, sin texto adicional ni bloques de markdown:
{
  "ipc": { "price": numero, "pct": numero },
  "sp500": { "price": numero, "pct": numero },
  "nasdaq": { "price": numero, "pct": numero },
  "vix": { "price": numero, "pct": numero },
  "us10y": { "price": numero, "pct": numero },
  "gold": { "price": numero, "pct": numero },
  "wti": { "price": numero, "pct": numero }
}`;
                                VDS.gemini(prompt, 'mkt_summary_mx').then(data => {
                                    if(data) {
                                        if(data.ipc) { setText('ms-ipc', data.ipc.price.toFixed(2)); setPct('ms-ipc-p', data.ipc.pct); }
                                        if(data.sp500) { setText('ms-sp500', data.sp500.price.toFixed(2)); setPct('ms-sp500-p', data.sp500.pct); }
                                        if(data.nasdaq) { setText('ms-nasdaq', data.nasdaq.price.toFixed(2)); setPct('ms-nasdaq-p', data.nasdaq.pct); }
                                        if(data.vix) { setText('ms-vix', data.vix.price.toFixed(2)); setPct('ms-vix-p', data.vix.pct); }
                                        if(data.us10y) { setText('ms-us10y', data.us10y.price.toFixed(2) + '%'); setPct('ms-us10y-p', data.us10y.pct, true); }
                                        if(data.gold) { setText('ms-gold', data.gold.price.toFixed(2)); setPct('ms-gold-p', data.gold.pct); }
                                        if(data.wti) { setText('ms-wti', data.wti.price.toFixed(2)); setPct('ms-wti-p', data.wti.pct); }
                                    }
                                }).catch(err => console.error("Error cargando mercados:", err));
                            }, 100);
                        

/* ---- bloque ---- */


    function initBmvChartWorkbench() {
        const bar  = document.getElementById('bmv-bar');
        const card = document.getElementById('bmv-chart');
        // En la SPA estos elementos se destruyen y se crean de nuevo al salir y
        // regresar a Finanzas. El script permanece cargado, por lo que hay que
        // volver a conectar el controlador a los nodos actuales. El marcador
        // evita duplicar listeners cuando el mismo montaje se reinicializa.
        if (!bar || !card || bar.dataset.vnChartControllerReady === '1') return;
        bar.dataset.vnChartControllerReady = '1';

        // Instrumentos (mismos que antes), ahora como config del <vn-filter-bar>.
        // Una opción con `.options` se renderiza como <optgroup>.
        const INSTRUMENTS = [
            { label: '🇲🇽 México (BMV)', options: [
                { value: 'GFNORTEO.MX', label: 'Banorte' },
                { value: 'WALMEX.MX', label: 'Walmart México' },
                { value: 'AMXB.MX', label: 'América Móvil' },
                { value: 'FEMSAUBD.MX', label: 'FEMSA' },
                { value: 'BIMBOA.MX', label: 'Bimbo' },
                { value: 'CEMEXCPO.MX', label: 'Cemex' },
                { value: 'GMEXICOB.MX', label: 'Grupo México' },
                { value: 'GRUMAB.MX', label: 'Gruma' },
                { value: 'AC.MX', label: 'Arca Continental' },
                { value: 'ALSEA.MX', label: 'Alsea' },
                { value: 'KOFUBL.MX', label: 'Coca-Cola FEMSA' },
                { value: 'ASURB.MX', label: 'ASUR' },
                { value: 'GAPB.MX', label: 'GAP Aeropuertos' },
                { value: 'OMAB.MX', label: 'OMA' },
                { value: 'GENTERA.MX', label: 'Gentera' },
                { value: 'TLEVISACPO.MX', label: 'Televisa' },
                { value: '^MXX', label: 'IPC (Índice BMV)' },
            ] },
            { label: '🇺🇸 Estados Unidos (NYSE / NASDAQ)', options: [
                { value: 'AAPL', label: 'Apple' }, { value: 'MSFT', label: 'Microsoft' },
                { value: 'NVDA', label: 'NVIDIA' }, { value: 'AMZN', label: 'Amazon' },
                { value: 'GOOGL', label: 'Alphabet (Google)' }, { value: 'META', label: 'Meta' },
                { value: 'TSLA', label: 'Tesla' }, { value: 'BRK-B', label: 'Berkshire Hathaway' },
                { value: 'JPM', label: 'JPMorgan Chase' }, { value: 'V', label: 'Visa' },
                { value: 'UNH', label: 'UnitedHealth' }, { value: 'JNJ', label: 'Johnson & Johnson' },
                { value: 'XOM', label: 'ExxonMobil' }, { value: 'WMT', label: 'Walmart' },
                { value: 'BAC', label: 'Bank of America' }, { value: 'PG', label: 'Procter & Gamble' },
                { value: 'KO', label: 'Coca-Cola' }, { value: 'DIS', label: 'Disney' },
            ] },
            { label: '🇬🇧 Reino Unido (LSE)', options: [
                { value: 'SHEL.L', label: 'Shell' }, { value: 'AZN.L', label: 'AstraZeneca' },
                { value: 'HSBA.L', label: 'HSBC' }, { value: 'ULVR.L', label: 'Unilever' },
                { value: 'BP.L', label: 'BP' }, { value: 'GSK.L', label: 'GSK' },
                { value: 'RIO.L', label: 'Rio Tinto' },
            ] },
            { label: '🇩🇪 Alemania (XETRA)', options: [
                { value: 'SAP.DE', label: 'SAP' }, { value: 'SIE.DE', label: 'Siemens' },
                { value: 'BMW.DE', label: 'BMW' }, { value: 'VOW3.DE', label: 'Volkswagen' },
                { value: 'BAYN.DE', label: 'Bayer' }, { value: 'ADS.DE', label: 'Adidas' },
                { value: 'DHER.DE', label: 'Delivery Hero' },
            ] },
            { label: '🇫🇷 Francia (Euronext)', options: [
                { value: 'MC.PA', label: 'LVMH' }, { value: 'OR.PA', label: "L'Oréal" },
                { value: 'TTE.PA', label: 'TotalEnergies' }, { value: 'AIR.PA', label: 'Airbus' },
                { value: 'BNP.PA', label: 'BNP Paribas' }, { value: 'SAN.PA', label: 'Sanofi' },
            ] },
            { label: '🇨🇭 Suiza (SIX)', options: [
                { value: 'NESN.SW', label: 'Nestlé' }, { value: 'NOVN.SW', label: 'Novartis' },
                { value: 'ROG.SW', label: 'Roche' }, { value: 'UHR.SW', label: 'Swatch Group' },
            ] },
            { label: '🇯🇵 Japón (TSE)', options: [
                { value: '7203.T', label: 'Toyota' }, { value: '6758.T', label: 'Sony' },
                { value: '9984.T', label: 'SoftBank' }, { value: '6501.T', label: 'Hitachi' },
                { value: '7974.T', label: 'Nintendo' }, { value: '9432.T', label: 'NTT' },
            ] },
            { label: '🇰🇷 Corea del Sur (KRX)', options: [
                { value: '005930.KS', label: 'Samsung Electronics' }, { value: '000660.KS', label: 'SK Hynix' },
                { value: '035420.KS', label: 'NAVER' }, { value: '005380.KS', label: 'Hyundai Motor' },
            ] },
            { label: '🇨🇳 China / Hong Kong (HKEX)', options: [
                { value: '0700.HK', label: 'Tencent' }, { value: '9988.HK', label: 'Alibaba' },
                { value: '3690.HK', label: 'Meituan' }, { value: '9618.HK', label: 'JD.com' },
                { value: '2318.HK', label: 'Ping An' },
            ] },
            { label: '🇮🇳 India (NSE / BSE)', options: [
                { value: 'RELIANCE.NS', label: 'Reliance Industries' }, { value: 'TCS.NS', label: 'Tata Consultancy' },
                { value: 'INFY.NS', label: 'Infosys' }, { value: 'HDFCBANK.NS', label: 'HDFC Bank' },
                { value: 'WIPRO.NS', label: 'Wipro' },
            ] },
            { label: '🇧🇷 Brasil (B3)', options: [
                { value: 'PETR4.SA', label: 'Petrobras' }, { value: 'VALE3.SA', label: 'Vale' },
                { value: 'ITUB4.SA', label: 'Itaú Unibanco' }, { value: 'BBDC4.SA', label: 'Bradesco' },
                { value: 'ABEV3.SA', label: 'Ambev' },
            ] },
            { label: '📊 Índices Globales', options: [
                { value: '^GSPC', label: 'S&P 500 (EE.UU.)' }, { value: '^NDX', label: 'NASDAQ 100 (EE.UU.)' },
                { value: '^DJI', label: 'Dow Jones (EE.UU.)' }, { value: '^FTSE', label: 'FTSE 100 (UK)' },
                { value: '^GDAXI', label: 'DAX 40 (Alemania)' }, { value: '^FCHI', label: 'CAC 40 (Francia)' },
                { value: '^N225', label: 'Nikkei 225 (Japón)' }, { value: '^HSI', label: 'Hang Seng (HK)' },
                { value: '^BSESN', label: 'SENSEX (India)' }, { value: '^BVSP', label: 'Bovespa (Brasil)' },
            ] },
            { label: '🥇 Materias Primas', options: [
                { value: 'GC=F', label: 'Oro' }, { value: 'SI=F', label: 'Plata' },
                { value: 'CL=F', label: 'Petróleo WTI' }, { value: 'BZ=F', label: 'Petróleo Brent' },
                { value: 'NG=F', label: 'Gas Natural' }, { value: 'ZC=F', label: 'Maíz' },
                { value: 'ZW=F', label: 'Trigo' }, { value: 'ZS=F', label: 'Soya' },
                { value: 'HG=F', label: 'Cobre' },
            ] },
            { label: '₿ Criptomonedas', options: [
                { value: 'BTC-USD', label: 'Bitcoin (BTC)' }, { value: 'ETH-USD', label: 'Ethereum (ETH)' },
                { value: 'BNB-USD', label: 'BNB' }, { value: 'SOL-USD', label: 'Solana (SOL)' },
                { value: 'XRP-USD', label: 'XRP' },
            ] },
            { label: '💱 Divisas (Forex)', options: [
                { value: 'USDMXN=X', label: 'USD / MXN' }, { value: 'EURUSD=X', label: 'EUR / USD' },
                { value: 'GBPUSD=X', label: 'GBP / USD' }, { value: 'USDJPY=X', label: 'USD / JPY' },
                { value: 'USDCNY=X', label: 'USD / CNY' }, { value: 'USDBRL=X', label: 'USD / BRL' },
                { value: 'EURGBP=X', label: 'EUR / GBP' },
            ] },
        ];

        // Cada rango -> interval/range de Yahoo. '15m' y '1h' no son "range" nativos
        // (range = ventana total, no granularidad): se piden velas de 1 minuto del
        // último día y se recortan del lado del cliente a los últimos 15/60 minutos.
        const IV_PARAMS = {
            '15m': { interval: '1m',  range: '1d',  trim: 15 },
            '1h':  { interval: '1m',  range: '1d',  trim: 60 },
            '1mo': { interval: '1h',  range: '1mo' },
            '1y':  { interval: '1d',  range: '1y'  },
            '3y':  { interval: '1wk', range: '3y'  },
            '5y':  { interval: '1wk', range: '5y'  },
            '10y': { interval: '1mo', range: '10y' },
        };

        bar.filters = [
            { id: 'instrument', label: 'Instrumento', type: 'select', value: 'GFNORTEO.MX', options: INSTRUMENTS },
            { id: 'range', label: 'Rango', type: 'segmented', value: '1y', options: [
                { value: '15m', label: '15min' }, { value: '1h', label: '1H' }, { value: '1mo', label: 'Mes' },
                { value: '1y', label: '1A' }, { value: '3y', label: '3A' }, { value: '5y', label: '5A' },
                { value: '10y', label: '10A' },
            ] },
            { id: 'type', label: 'Tipo', type: 'segmented', value: 'candlestick', options: [
                { value: 'candlestick', label: 'Velas' }, { value: 'line', label: 'Línea' }, { value: 'area', label: 'Área' },
            ] },
            { id: 'ma', label: 'Media móvil', type: 'segmented', value: 'none', options: [
                { value: 'none', label: 'Ninguna' }, { value: 'sma20', label: 'SMA 20' },
                { value: 'sma50', label: 'SMA 50' }, { value: 'both', label: '20+50' },
            ] },
            { id: 'ticker', label: 'Cualquier ticker', type: 'search', value: '', placeholder: 'ej: AMZN', buttonLabel: 'Ver' },
        ];

        // Media móvil simple sobre los cierres — herramienta técnica estándar
        // para leer tendencia sin el ruido vela a vela.
        function computeSMA(candles, period) {
            if (!candles || candles.length < period) return [];
            const out = [];
            let sum = 0;
            for (let i = 0; i < candles.length; i++) {
                sum += candles[i].close;
                if (i >= period) sum -= candles[i - period].close;
                if (i >= period - 1) out.push({ time: candles[i].time, value: +(sum / period).toFixed(4) });
            }
            return out;
        }

        let _lastCandles = null;
        function applyMA(candles) {
            const mode = bar.values.ma || 'none';
            if (mode === 'sma20' || mode === 'both') card.setOverlay('sma20', computeSMA(candles, 20), { color: '#f59e0b' });
            else card.clearOverlay('sma20');
            if (mode === 'sma50' || mode === 'both') card.setOverlay('sma50', computeSMA(candles, 50), { color: '#7c3aed' });
            else card.clearOverlay('sma50');
        }

        // Volumen bajo el precio, coloreado según si esa vela cerró arriba o
        // abajo de su apertura — el complemento estándar de cualquier chart serio.
        function applyVolume(candles) {
            const points = candles
                .filter(c => c.volume != null)
                .map(c => ({ time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(22,163,74,.5)' : 'rgba(220,38,38,.5)' }));
            card.setVolume(points);
        }

        async function loadChart(ticker, rangeKey) {
            const { interval, range, trim } = IV_PARAMS[rangeKey] || IV_PARAMS['1y'];
            card.setState('loading', 'Cargando…');
            try {
                const r = await fetch(`/api/stock-history?ticker=${encodeURIComponent(ticker)}&interval=${interval}&range=${range}`);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const { candles: all, meta } = await r.json();
                if (!all || !all.length) throw new Error('Sin velas');
                // 15min/1H: recortar a las últimas N velas de 1 minuto de la sesión más reciente.
                const candles = trim ? all.slice(-trim) : all;
                _lastCandles = candles;
                card.setData(candles);
                card.setMeta({
                    name:     meta.longName || ticker,
                    price:    meta.regularMarketPrice,
                    pct:      meta.regularMarketChangePercent,
                    high:     meta.regularMarketDayHigh,
                    low:      meta.regularMarketDayLow,
                    currency: meta.currency,
                });
                applyMA(candles);
                applyVolume(candles);
            } catch (e) {
                console.error('Chart error:', e);
                card.setState('error', 'No se pudieron cargar los datos.');
            }
        }

        function reload() {
            const v = bar.values;
            loadChart(v.instrument, v.range);
        }

        // Una sola barra controla el gráfico: instrumento/rango recargan; el buscador
        // permite cualquier ticker libre.
        bar.addEventListener('vn-filter-change', (e) => {
            if (e.detail.id === 'ticker') {
                const t = (e.detail.value || '').trim().toUpperCase();
                if (t) loadChart(t, bar.values.range);
            } else if (e.detail.id === 'type') {
                card.setAttribute('chart-type', e.detail.value);
            } else if (e.detail.id === 'ma') {
                if (_lastCandles) applyMA(_lastCandles);
            } else {
                reload();
            }
        });

        // Permite que otras secciones (p.ej. la watchlist) carguen un ticker aquí.
        window.vnFinLoadTicker = function (ticker) {
            const t = (ticker || '').trim().toUpperCase();
            if (t) { bar.setValue('ticker', t); loadChart(t, bar.values.range); }
        };

        reload();
    }
    initBmvChartWorkbench();
    

/* ---- bloque ---- */


            (function() {
                const wrapper = document.getElementById('mexico-dense-wrapper');
                let parX = 0, parY = 0, tx = 0, ty = 0;
                window.addEventListener('mousemove', e => {
                    if (wrapper.style.display === 'none') return;
                    tx = (e.clientX / window.innerWidth - 0.5);
                    ty = (e.clientY / window.innerHeight - 0.5);
                });
                function tick() {
                    if (wrapper.style.display !== 'none') {
                        parX += (tx - parX) * 0.05;
                        parY += (ty - parY) * 0.05;
                        wrapper.style.setProperty('--par-x', parX);
                        wrapper.style.setProperty('--par-y', parY);
                    }
                    requestAnimationFrame(tick);
                }
                tick();

                // Observer for reveal
                const obs = new IntersectionObserver(es => {
                    es.forEach(e => {
                        if(e.isIntersecting) { e.target.classList.add('inview'); obs.unobserve(e.target); }
                    });
                }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });
                
                // Set up observer once wrapper is shown
                const mObs = new MutationObserver((m) => {
                    m.forEach((mut) => {
                        if (mut.attributeName === 'style' && wrapper.style.display !== 'none') {
                            wrapper.querySelectorAll('.reveal').forEach(el => obs.observe(el));
                        }
                    });
                });
                mObs.observe(wrapper, { attributes: true });
            })();
        

/* ---- bloque ---- */


            (function() {
                const wrapper = document.getElementById('global-dense-wrapper');
                let parX = 0, parY = 0, tx = 0, ty = 0;
                window.addEventListener('mousemove', e => {
                    if (wrapper.style.display === 'none') return;
                    tx = (e.clientX / window.innerWidth - 0.5);
                    ty = (e.clientY / window.innerHeight - 0.5);
                });
                function tick() {
                    if (wrapper.style.display !== 'none') {
                        parX += (tx - parX) * 0.05;
                        parY += (ty - parY) * 0.05;
                        wrapper.style.setProperty('--par-x', parX);
                        wrapper.style.setProperty('--par-y', parY);
                    }
                    requestAnimationFrame(tick);
                }
                tick();

                // Transplant real panels to ordered slots for a clean, minimalist layout
                const slots = {
                    'watchlist-panel': wrapper.querySelector('#slot-watchlist'),
                    'mkt-cap-panel': wrapper.querySelector('#slot-mkt-cap'),
                    'fx-emerging-panel': wrapper.querySelector('#slot-fx'),
                    'movers-panel': wrapper.querySelector('#slot-movers'),
                    'mx-news-panel': wrapper.querySelector('#slot-news-unified'),
                    'mx-summary-panel': wrapper.querySelector('#slot-mx-summary'),
                    'mx-chart-panel': wrapper.querySelector('#slot-mx-chart')
                };
                
                window.addEventListener('DOMContentLoaded', () => {
                    Object.keys(slots).forEach(id => {
                        const panel = document.getElementById(id);
                        const slot = slots[id];
                        if (panel && slot) {
                            slot.appendChild(panel);
                            // Apply minimalist glass styling
                            panel.classList.add('glass', 'reveal');
                            // We use CSS rules in finanzas-global-dense.css to override internal backgrounds
                        }
                    });
                    if (typeof _ncPositionStack === 'function') _ncPositionStack();
                });

                // Observer for reveal
                const obs = new IntersectionObserver(es => {
                    es.forEach(e => {
                        if(e.isIntersecting) { e.target.classList.add('inview'); obs.unobserve(e.target); }
                    });
                }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });
                
                // Set up observer once wrapper is shown
                const mObs = new MutationObserver((m) => {
                    m.forEach((mut) => {
                        if (mut.attributeName === 'style' && wrapper.style.display !== 'none') {
                            wrapper.querySelectorAll('.reveal').forEach(el => obs.observe(el));
                        }
                    });
                });
                mObs.observe(wrapper, { attributes: true });
            })();
        

/* ---- bloque ---- */


            (function() {
                const wrapper = document.getElementById('bonds-dense-wrapper');
                let parX = 0, parY = 0, tx = 0, ty = 0;
                window.addEventListener('mousemove', e => {
                    if (wrapper.style.display === 'none') return;
                    tx = (e.clientX / window.innerWidth - 0.5);
                    ty = (e.clientY / window.innerHeight - 0.5);
                });
                function tick() {
                    if (wrapper.style.display !== 'none') {
                        parX += (tx - parX) * 0.05;
                        parY += (ty - parY) * 0.05;
                        wrapper.style.setProperty('--par-x', parX);
                        wrapper.style.setProperty('--par-y', parY);
                    }
                    requestAnimationFrame(tick);
                }
                tick();

                const slots = {
                    'bonds-panel': wrapper.querySelector('#slot-bonds-top'),
                    'calendar-panel-main': wrapper.querySelector('#slot-calendar')
                };
                
                window.addEventListener('DOMContentLoaded', () => {
                    Object.keys(slots).forEach(id => {
                        const panel = document.getElementById(id);
                        const slot = slots[id];
                        if (panel && slot) {
                            slot.appendChild(panel);
                            panel.classList.remove('panel');
                            panel.classList.add('glass', 'reveal');
                        }
                    });
                    
                    // Interactive Monthly Calendar Logic
                    const calWidget = document.getElementById('monthly-calendar-widget');
                    const mcTitle = document.getElementById('mc-title');
                    const mcGrid = document.getElementById('mc-grid');
                    const mcPrev = document.getElementById('mc-prev');
                    const mcNext = document.getElementById('mc-next');
                    const mcReset = document.getElementById('mc-reset');
                    const allCards = document.querySelectorAll('#calendar-panel-main .cal-card');
                    
                    let currMonth = 6; // 0 = Jan, 6 = Jul
                    let currYear = 2026;
                    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
                    
                    const eventsMap = {};
                    allCards.forEach(card => {
                        const dStr = card.getAttribute('data-date');
                        if(!dStr) return;
                        if(!eventsMap[dStr]) eventsMap[dStr] = [];
                        eventsMap[dStr].push(card.classList.contains('high') ? 'high' : 'med');
                    });

                    let selectedDateStr = null;

                    function renderCalendar() {
                        mcTitle.textContent = `${monthNames[currMonth]} ${currYear}`;
                        mcGrid.innerHTML = '';
                        
                        const firstDay = new Date(currYear, currMonth, 1).getDay(); // 0 = Sun
                        const daysInMonth = new Date(currYear, currMonth + 1, 0).getDate();
                        
                        // Empty slots for previous month
                        for(let i=0; i<firstDay; i++) {
                            const empty = document.createElement('div');
                            empty.className = 'mc-day empty';
                            mcGrid.appendChild(empty);
                        }
                        
                        for(let d=1; d<=daysInMonth; d++) {
                            const cell = document.createElement('div');
                            cell.className = 'mc-day';
                            const mStr = String(currMonth + 1).padStart(2, '0');
                            const dStr = String(d).padStart(2, '0');
                            const fullDate = `${currYear}-${mStr}-${dStr}`;
                            
                            cell.textContent = d;
                            cell.dataset.full = fullDate;
                            
                            if (selectedDateStr === fullDate) cell.classList.add('active');
                            
                            if(eventsMap[fullDate]) {
                                cell.classList.add('has-event');
                                const dotWrap = document.createElement('div');
                                dotWrap.className = 'mc-dots';
                                eventsMap[fullDate].forEach(lvl => {
                                    const dot = document.createElement('span');
                                    dot.className = `mc-dot ${lvl}`;
                                    dotWrap.appendChild(dot);
                                });
                                cell.appendChild(dotWrap);
                            }
                            
                            cell.addEventListener('click', () => {
                                if(!eventsMap[fullDate]) return;
                                document.querySelectorAll('.mc-day').forEach(el => el.classList.remove('active'));
                                cell.classList.add('active');
                                selectedDateStr = fullDate;
                                
                                // Filter Feed Logic
                                const feedTitle = document.getElementById('cal-feed-title');
                                const allFeedCards = document.querySelectorAll('.cal-card');
                                let matchCount = 0;
                                
                                allFeedCards.forEach(c => {
                                    const cDate = c.getAttribute('data-date');
                                    if(cDate && cDate.trim() === fullDate) {
                                        c.style.display = 'flex';
                                        c.classList.remove('hidden-event');
                                        matchCount++;
                                    } else {
                                        c.style.display = 'none';
                                        c.classList.add('hidden-event');
                                    }
                                });
                                
                                if(feedTitle) {
                                    feedTitle.textContent = matchCount > 0 ? `Eventos del ${d} de ${monthNames[currMonth]} ${currYear}` : 'No hay eventos este día';
                                }
                                
                                const resetBtn = document.getElementById('cal-reset-filter');
                                if(resetBtn) resetBtn.style.display = 'inline-block';
                            });
                            
                            mcGrid.appendChild(cell);
                        }
                    }

                    if(mcPrev) {
                        mcPrev.addEventListener('click', () => {
                            currMonth--;
                            if(currMonth < 0) { currMonth = 11; currYear--; }
                            renderCalendar();
                        });
                        mcNext.addEventListener('click', () => {
                            currMonth++;
                            if(currMonth > 11) { currMonth = 0; currYear++; }
                            renderCalendar();
                        });
                        
                        const resetBtn = document.getElementById('cal-reset-filter');
                        if(resetBtn) {
                            resetBtn.addEventListener('click', () => {
                                document.querySelectorAll('.mc-day').forEach(el => el.classList.remove('active'));
                                selectedDateStr = null;
                                document.getElementById('cal-feed-title').textContent = '🏛️ Calendario de Renta Fija';
                                document.querySelectorAll('#cal-event-grid .cal-card').forEach(c => {
                                    c.style.display = 'flex';
                                    c.classList.remove('hidden-event');
                                });
                                resetBtn.style.display = 'none';
                            });
                        }
                        
                        renderCalendar();
                        // Estado inicial: mostrar todos los eventos (el calendario solo filtra)
                    }
                });

                const obs = new IntersectionObserver(es => {
                    es.forEach(e => {
                        if(e.isIntersecting) { e.target.classList.add('inview'); obs.unobserve(e.target); }
                    });
                }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });
                
                const mObs = new MutationObserver((m) => {
                    m.forEach((mut) => {
                        if (mut.attributeName === 'style' && wrapper.style.display !== 'none') {
                            wrapper.querySelectorAll('.reveal').forEach(el => obs.observe(el));
                        }
                    });
                });
                mObs.observe(wrapper, { attributes: true });
            })();
        

/* ---- bloque ---- */


                window.addEventListener('DOMContentLoaded', function () {
                    const bar = document.getElementById('bonds-curve-bar');
                    if (!bar || bar._vnInit) return;
                    bar._vnInit = true;
                    bar.filters = [
                        { id: 'format', label: 'Formato', type: 'segmented', value: 'pct', options: VN_FORMAT_OPTIONS },
                    ];
                    bar.addEventListener('vn-filter-change', () => {
                        if (_lastBondsCurveData) renderBondsCurveChart(_lastBondsCurveData, bar.values.format);
                    });
                });
                

/* ---- bloque ---- */


                function initMktCapFilters() {
                    const bar = document.getElementById('mkt-cap-bar');
                    if (!bar || bar._vnInit) return;
                    bar._vnInit = true;
                    bar.filters = [
                        { id: 'range', label: 'Periodo', type: 'segmented', value: '5d', options: VN_PERIOD_OPTIONS },
                        { id: 'format', label: 'Formato', type: 'segmented', value: 'pct', options: VN_FORMAT_OPTIONS },
                    ];
                    bar.addEventListener('vn-filter-change', () => {
                        const { range, format } = bar.values;
                        reloadMktCapVisual(range, format).catch(e => console.error('reloadMktCapVisual error:', e));
                    });
                }
                window.addEventListener('DOMContentLoaded', initMktCapFilters);
                

/* ---- bloque ---- */


                (function () {
                    const bar = document.getElementById('fx-em-bar');
                    if (!bar || bar._vnInit) return;
                    bar._vnInit = true;
                    bar.filters = [
                        { id: 'range', label: 'Periodo', type: 'segmented', value: '5d', options: [
                            { value: '1d', label: '1D' }, { value: '5d', label: '5D' }, { value: '1mo', label: '1M' },
                            { value: '3mo', label: '3M' }, { value: '6mo', label: '6M' }, { value: '1y', label: '1A' },
                        ] },
                        { id: 'format', label: 'Formato', type: 'segmented', value: 'pct', options: [
                            { value: 'pct', label: '%' }, { value: 'bps', label: 'PB' },
                        ] },
                    ];
                    bar.addEventListener('vn-filter-change', () => {
                        const { range, format } = bar.values;
                        loadEmergingFX(range, format).catch(e => console.error('loadEmergingFX error:', e));
                    });
                })();
                

/* ---- bloque ---- */


                window.addEventListener('DOMContentLoaded', function () {
                    const bar = document.getElementById('movers-bar');
                    if (!bar || bar._vnInit) return;
                    bar._vnInit = true;
                    bar.filters = [
                        { id: 'range', label: 'Periodo', type: 'segmented', value: '1d', options: VN_PERIOD_OPTIONS },
                        { id: 'format', label: 'Formato', type: 'segmented', value: 'pct', options: VN_FORMAT_OPTIONS },
                    ];
                    bar.addEventListener('vn-filter-change', () => {
                        const { range, format } = bar.values;
                        loadTopMovers(range, format).catch(e => console.error('loadTopMovers error:', e));
                    });
                });
                

/* ---- bloque ---- */


var _fxData = null; // declarado aquí (no en el bloque de más abajo): se lee de forma
                     // síncrona durante la carga inicial, antes de que ese bloque corra.
const $ = id => document.getElementById(id);
const tx = (id, v) => { const e = $(id); if (e) e.textContent = v; };
const at = (id, a, v) => { const e = $(id); if (e) e.setAttribute(a, v); };

const IMGS = ['../img/finanzas.webp', '../img/mercadoP.webp', '../img/mercados.webp'];

let _fhImgPool    = [];
const _assetDataCache = new Map();
function fetchAssetData(ticker) {
    if (_assetDataCache.has(ticker)) return _assetDataCache.get(ticker);
    const promise = fetch(`/api/stock-history?ticker=${encodeURIComponent(ticker)}&interval=1d&range=5d`)
        .then(r => r.ok ? r.json() : null).catch(() => null);
    _assetDataCache.set(ticker, promise);
    return promise;
}
function isCacheValid(stored) {
    if (!stored) return false;
    if (!Array.isArray(stored.noticias) || stored.noticias.length < 2) return false;
    if (!stored.bc || typeof stored.bc !== 'object') return false;
    if (!Array.isArray(stored.vai) || stored.vai.length < 4) return false;
    const conTitulo = stored.noticias.filter(n => n.titulo?.length > 5).length;
    return conTitulo >= 2;
}
function onImgError(el, fallback) {
    el.onerror = null;
    el.src = fallback;
}
async function loadPetroleo() {
    try {
        const [wtiR, brentR, gasR, mxnR] = await Promise.allSettled([
            fetchAssetData('CL=F'),
            fetchAssetData('BZ=F'),
            fetchAssetData('NG=F'),
            fetchAssetData('USDMXN=X'),
        ]);
        function setVal(idVal, idPct, data) {
            const meta = data?.status === 'fulfilled' ? data.value?.meta : null;
            const price = meta?.regularMarketPrice;
            const pct   = meta?.regularMarketChangePercent;
            const vEl = document.getElementById(idVal);
            const pEl = document.getElementById(idPct);
            if (vEl) vEl.textContent = price != null ? '$' + price.toFixed(2) : '--';
            if (pEl && pct != null) {
                pEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
                pEl.className = 'petro-pct ' + (pct >= 0 ? 'up' : 'down');
            }
        }
        setVal('p-wti',   'p-wti-pct',   wtiR);
        setVal('p-brent', 'p-brent-pct', brentR);
        setVal('p-gas',   'p-gas-pct',   gasR);
        setVal('p-mxn',   'p-mxn-pct',   mxnR);
        const wtiPrice   = wtiR.status   === 'fulfilled' ? wtiR.value?.meta?.regularMarketPrice   : null;
        const brentPrice = brentR.status === 'fulfilled' ? brentR.value?.meta?.regularMarketPrice : null;
        const gasPrice   = gasR.status   === 'fulfilled' ? gasR.value?.meta?.regularMarketPrice   : null;
        const gasPct     = gasR.status   === 'fulfilled' ? gasR.value?.meta?.regularMarketChangePercent : null;

        const spreadEl    = document.getElementById('p-spread');
        const spreadNote  = document.getElementById('p-spread-note');
        if (spreadEl && wtiPrice != null && brentPrice != null) {
            const spd = wtiPrice - brentPrice;
            spreadEl.textContent = (spd >= 0 ? '+' : '') + '$' + Math.abs(spd).toFixed(2);
            spreadEl.style.color = spd > 0 ? '#16a34a' : '#dc2626';
            if (spreadNote) spreadNote.textContent = spd < 0 ? 'WTI con descuento vs Brent' : 'WTI con prima vs Brent';
        }

        const getM = r => r.status === 'fulfilled' ? r.value?.meta : null;
        const wm = getM(wtiR), bm = getM(brentR);
        Object.assign(_rds, {
            wti:      wm?.regularMarketPrice,
            wtiPct:   wm?.regularMarketChangePercent,
            brent:    bm?.regularMarketPrice,
            brentPct: bm?.regularMarketChangePercent,
        });
        renderRawDataPanel();

        const wtiPct2  = wtiR.status === 'fulfilled' ? wtiR.value?.meta?.regularMarketChangePercent : null;
        const mxnPct2  = mxnR.status === 'fulfilled' ? mxnR.value?.meta?.regularMarketChangePercent : null;
        const noteEl = document.getElementById('petro-note');
        if (noteEl && wtiPct2 != null && mxnPct2 != null) {
            const sameDir = (wtiPct2 > 0 && mxnPct2 < 0) || (wtiPct2 < 0 && mxnPct2 > 0);
            noteEl.innerHTML = `<i class="fas fa-robot"></i> ${
                sameDir
                    ? `Correlación activa: WTI ${wtiPct2 >= 0 ? '▲' : '▼'}${Math.abs(wtiPct2).toFixed(2)}% y el peso ${mxnPct2 < 0 ? 'se fortalece' : 'se debilita'} (USD/MXN ${mxnPct2 >= 0 ? '▲' : '▼'}${Math.abs(mxnPct2).toFixed(2)}%), coherente con la correlación histórica Peso-Petróleo.`
                    : `WTI ${wtiPct2 >= 0 ? '▲' : '▼'}${Math.abs(wtiPct2).toFixed(2)}% · USD/MXN ${mxnPct2 >= 0 ? '▲' : '▼'}${Math.abs(mxnPct2).toFixed(2)}%. El peso mexicano tiene alta correlación con el petróleo por los ingresos de Pemex.`
            }`;
        }
        _petroData = {
            wti:      wtiR.status  === 'fulfilled' ? wtiR.value?.meta?.regularMarketPrice : null,
            wtiPct:   wtiR.status  === 'fulfilled' ? wtiR.value?.meta?.regularMarketChangePercent : null,
            brent:    brentR.status === 'fulfilled' ? brentR.value?.meta?.regularMarketPrice : null,
            brentPct: brentR.status === 'fulfilled' ? brentR.value?.meta?.regularMarketChangePercent : null,
            gas:      gasR.status  === 'fulfilled' ? gasR.value?.meta?.regularMarketPrice : null,
            gasPct:   gasR.status  === 'fulfilled' ? gasR.value?.meta?.regularMarketChangePercent : null,
            mxn:      mxnR.status  === 'fulfilled' ? mxnR.value?.meta?.regularMarketPrice : null,
            mxnPct:   mxnR.status  === 'fulfilled' ? mxnR.value?.meta?.regularMarketChangePercent : null,
        };
        const cdsEl = document.getElementById('rds-cds-val');
        if (cdsEl) {
            cdsEl.textContent = '~95 bps';
            cdsEl.style.color = '#d97706';
            cdsEl.style.fontSize = '';
        }
        const creditCds = document.getElementById('credit-cds');
        if (creditCds) {
            creditCds.textContent = '~95 bps (ref.)';
            creditCds.style.color = '#d97706';
        }
    } catch(e) {
        console.error('loadPetroleo error:', e);
    }
}
function updateForecastBanner(pred, verdict, alerta, asset) {
    const color  = pred >= 65 ? '#4ade80' : pred >= 45 ? '#fbbf24' : '#f87171';
    const offset = (251.2 * (1 - pred / 100)).toFixed(1);
    at('fc-arc', 'style', `stroke-dashoffset:${offset};stroke:${color}`);
    const numEl = $('fc-num');
    if (numEl) { numEl.textContent = pred + '%'; numEl.style.color = color; }
    const verdictEl = $('fc-verdict');
    if (verdictEl) { verdictEl.textContent = verdict || '--'; verdictEl.style.color = color; }
    tx('fc-note',  alerta || '--');
    tx('fc-asset', asset  || 'MERCADO MX');
}
function calcVAI(tiie, rate, infl, vix, creditSpread) {
    let score = 0, max = 0;
    if (tiie != null) { max += 30; score += tiie >= 11 ? 7.5  : tiie >= 9 ? 13.5 : tiie >= 7 ? 21 : tiie >= 5 ? 27 : 30; }
    if (rate != null) { max += 20; score += rate > 20 ? 4    : rate > 18.5 ? 8   : rate > 17.5 ? 14 : rate > 16.5 ? 18 : 20; }
    if (infl != null) { max += 15; score += infl > 6 ? 3     : infl > 5 ? 6     : infl > 4 ? 10 : infl > 3 ? 13 : 15; }
    if (vix  != null) { max += 20; score += vix > 30 ? 4      : vix > 25 ? 8     : vix > 20 ? 13 : vix > 15 ? 17 : 20; }
    if (creditSpread != null) { max += 15; score += creditSpread < -0.15 ? 3 : creditSpread < 0 ? 8 : creditSpread < 0.15 ? 12 : 15; }
    return max > 0 ? Math.max(20, Math.min(92, Math.round(score / max * 100))) : 55;
}
function catSlug(cat) {
    const c = (cat || '').toLowerCase();
    if (c.includes('divisa') || c.includes('commodit') || c.includes('forex')) return 'commodities';
    return 'globales';
}
async function loadBolsaNews() {
    const PULSE = [
        { t: '^VIX',  label: 'VIX',        sub: 'Índice de Miedo',      inverse: true  },
        { t: '^GSPC', label: 'S&P 500',     sub: 'Referencia Principal', inverse: false },
        { t: '^TNX',  label: 'Yield 10A',   sub: 'Bono EUA 10 años',     inverse: false },
        { t: 'GC=F',  label: 'Oro',         sub: 'Refugio / Cobertura',  inverse: false },
    ];
    const SECTORS = [
        { t: 'XLK',  label: 'Tecnología',      icon: '💻' },
        { t: 'XLE',  label: 'Energía',          icon: '⚡' },
        { t: 'XLF',  label: 'Finanzas',         icon: '🏦' },
        { t: 'XLV',  label: 'Salud',            icon: '🏥' },
        { t: 'XLI',  label: 'Industrial',       icon: '🏭' },
        { t: 'XLY',  label: 'Consumo Discr.',   icon: '🛍' },
        { t: 'XLP',  label: 'Consumo Básico',   icon: '🛒' },
        { t: 'XLC',  label: 'Comunicaciones',   icon: '📡' },
        { t: 'XLB',  label: 'Materiales',       icon: '⛏' },
        { t: 'XLU',  label: 'Utilities',        icon: '💡' },
        { t: 'XLRE', label: 'Inmobiliario',     icon: '🏢' },
    ];  
    const all = [...PULSE, ...SECTORS];
    const results = await Promise.allSettled(all.map(a => fetchAssetData(a.t)));
    const pulseEl = document.getElementById('mkt-pulse');
    if (pulseEl) {
        pulseEl.innerHTML = PULSE.map((a, i) => {
            const d   = results[i].status === 'fulfilled' ? results[i].value : null;
            const px  = d?.meta?.regularMarketPrice ?? null;
            const pct = d?.meta?.regularMarketChangePercent ?? null;
            const up  = a.inverse ? (pct ?? 0) < 0 : (pct ?? 0) >= 0;
            const clr = pct == null ? '#94a3b8' : up ? '#16a34a' : '#dc2626';
            const bg  = pct == null ? '#f8fafc' : up ? 'rgba(22,163,74,.06)' : 'rgba(220,38,38,.06)';
            const bdr = pct == null ? '#e2e8f0' : up ? 'rgba(22,163,74,.18)' : 'rgba(220,38,38,.18)';
            const pxStr  = px  != null ? (px >= 100 ? px.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}) : px.toFixed(2)) : '—';
            const pctStr = pct != null ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '—';
            return `<div style="background:${bg};border:1px solid ${bdr};border-radius:8px;padding:.6rem .75rem;">
                <div style="font-size:.57rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:.2rem;">${a.label}</div>
                <div style="font-family:'JetBrains Mono','Inter',monospace;font-size:1rem;font-weight:800;color:#0f172a;line-height:1.1;">${pxStr}</div>
                <div style="font-size:.65rem;font-weight:700;color:${clr};margin-top:.2rem;">${pctStr}</div>
                <div style="font-size:.54rem;color:#94a3b8;margin-top:.1rem;">${a.sub}</div>
            </div>`;
        }).join('');
    }
    const sectorEl = document.getElementById('sector-grid');
    if (sectorEl) {
        const sData = SECTORS.map((a, i) => {
            const d   = results[PULSE.length + i].status === 'fulfilled' ? results[PULSE.length + i].value : null;
            const pct = d?.meta?.regularMarketChangePercent ?? null;
            return { ...a, pct };
        }).sort((a, b) => (b.pct ?? -99) - (a.pct ?? -99));
        const maxAbs = Math.max(...sData.map(s => Math.abs(s.pct ?? 0)), 0.01);
        sectorEl.innerHTML = sData.map(s => {
            const up     = (s.pct ?? 0) >= 0;
            const clr    = s.pct == null ? '#94a3b8' : up ? '#16a34a' : '#dc2626';
            const bg     = s.pct == null ? '#f8fafc' : up ? 'rgba(22,163,74,.07)' : 'rgba(220,38,38,.07)';
            const bdr    = s.pct == null ? '#e2e8f0' : up ? 'rgba(22,163,74,.18)' : 'rgba(220,38,38,.18)';
            const barW   = s.pct != null ? (Math.abs(s.pct) / maxAbs * 100).toFixed(1) : 0;
            const pctStr = s.pct != null ? (s.pct >= 0 ? '+' : '') + s.pct.toFixed(2) + '%' : '—';
            return `<div style="background:${bg};border:1px solid ${bdr};border-radius:8px;padding:.55rem .65rem;position:relative;overflow:hidden;">
                <div style="font-size:.9rem;line-height:1;margin-bottom:.18rem;">${s.icon}</div>
                <div style="font-size:.66rem;font-weight:700;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.label}</div>
                <div style="font-size:.78rem;font-weight:800;color:${clr};margin-top:.18rem;font-family:'JetBrains Mono','Inter',monospace;">${pctStr}</div>
                <div style="position:absolute;bottom:0;left:0;height:3px;width:${barW}%;background:${clr};opacity:.45;"></div>
            </div>`;
        }).join('');
    }
}
let NC_VISIBLE = 4; // valor inicial; _ncComputeVisible() lo recalcula según el espacio real disponible
const NC_CARD_H  = 240;
const NC_GAP     = 6;
const NC_STEP    = NC_CARD_H + NC_GAP;
let _ncAllItems  = [];
let _ncItems     = [];
let _ncTimer     = null;
let _ncHora      = '';
const _ncThemeImg = [
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
let _ncPage = 0; // índice del primer item visible del grupo actual (paso de NC_VISIBLE)
const NC_ROW_H  = 122; // alto de cada escalón (tarjeta completa con foto, sin solaparse)
const NC_INDENT = 14;  // sangría horizontal por escalón (look "escalera")
let _ncResizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(_ncResizeTimer);
    _ncResizeTimer = setTimeout(() => { if (typeof _ncPositionStack === 'function') _ncPositionStack(); }, 200);
});
function ncMove(dir) {
    if (!_ncItems.length) return;
    ncGoTo(_ncPage + dir); // un paso a la vez — mismo grano que el arrastre
}
function ncGoTo(idx) {
    if (!_ncItems.length) return;
    _ncPage = Math.min(Math.max(idx, 0), Math.max(_ncItems.length - 1, 0));
    _ncPositionStack();
    _ncStartAuto();
}
// Recalcula cuántas tarjetas caben de verdad en el alto real de .nview (que
// ahora se estira para igualar la gráfica de BMV) — así el carrusel siempre
// aprovecha todo el espacio disponible en vez de un número fijo.
function _ncComputeVisible() {
    const nview = document.getElementById('ncTrack')?.closest('.nview');
    if (!nview) return;
    const h = nview.clientHeight;
    if (h > 40) NC_VISIBLE = Math.max(2, Math.floor(h / NC_ROW_H));
}

// Clic en cualquier tarjeta del stack (no solo la de enfrente) la trae al
// frente en vez de navegar/abrir el detalle — mejor interacción, no hace
// falta darle "siguiente" varias veces para llegar a la que te interesa.
// También avanza solo cada 7s (como el ticker de arriba) y se detiene con el
// mouse encima, para que el carrusel se sienta vivo sin estorbar la lectura.
function _ncBindTrackClicks(track) {
    if (track.dataset.ncBound) return;
    track.dataset.ncBound = '1';
    track.addEventListener('click', (e) => {
        if (track._ncDragged) { e.preventDefault(); e.stopPropagation(); return; } // el arrastre no debe abrir/navegar
        const card = e.target.closest('.nitem');
        if (!card) return;
        const idx = Array.from(track.children).indexOf(card);
        if (idx - _ncPage > 0) {
            e.preventDefault();
            e.stopPropagation();
            ncGoTo(idx);
        }
    });
    const nview = track.closest('.nview');
    if (nview) {
        nview.addEventListener('mouseenter', () => clearInterval(_ncTimer));
        nview.addEventListener('mouseleave', _ncStartAuto);
        _ncBindDrag(nview, track);
    }
    _ncStartAuto();
}
// Arrastrar (mouse o dedo) para cambiar de noticia — dispara exactamente el
// mismo ncGoTo()/animación que usan los botones de flecha (nada de mover la
// pila por su cuenta durante el arrastre: eso causaba un "salto" antes de que
// empezara la animación real). Arrastrar solo decide dirección y si se cruzó
// el umbral; la transición de las tarjetas es la de siempre.
function _ncBindDrag(nview, track) {
    let startY = 0, dy = 0, dragging = false, moved = false, pointerId = null;
    const THRESHOLD = 34;
    nview.style.touchAction = 'pan-x';
    nview.style.cursor = 'grab';

    nview.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        dragging = true; moved = false; dy = 0;
        startY = e.clientY;
        pointerId = e.pointerId;
        clearInterval(_ncTimer);
        nview.style.cursor = 'grabbing';
    });
    nview.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        dy = e.clientY - startY;
        if (!moved && Math.abs(dy) > 6) {
            moved = true;
            // Capturamos el puntero SOLO al confirmar que es un arrastre real
            // (no en pointerdown): capturar de entrada hace que Chrome
            // retargetee también el mouseup/click resultante hacia nview,
            // así que el onclick="openNewsDetail(...)" de la tarjeta jamás
            // se disparaba en un clic normal — este era el bug real detrás
            // de "las noticias ya no abren reporte".
            nview.setPointerCapture?.(pointerId);
        }
    });
    const endDrag = () => {
        if (!dragging) return;
        dragging = false;
        nview.style.cursor = 'grab';
        if (moved && Math.abs(dy) > THRESHOLD) {
            track._ncDragged = true;
            if (dy < 0) ncGoTo(_ncPage + 1); else ncGoTo(Math.max(_ncPage - 1, 0));
            setTimeout(() => { track._ncDragged = false; }, 50);
        } else {
            _ncStartAuto();
        }
        moved = false;
    };
    nview.addEventListener('pointerup', endDrag);
    nview.addEventListener('pointercancel', endDrag);
    // Nota: NO usar 'pointerleave' aquí — se dispara según la posición física
    // del cursor incluso con el puntero capturado (setPointerCapture no lo
    // suprime), así que cortaba el arrastre a medias en cuanto el cursor
    // rozaba el borde de la tarjeta. pointerup/pointercancel en window es la
    // red de seguridad real por si el navegador no soporta la captura.
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
}
function _ncStartAuto() {
    clearInterval(_ncTimer);
    _ncTimer = setInterval(() => {
        if (!_ncItems.length) return;
        // El panel de noticias vive dentro de global-dense-wrapper (pestaña
        // Mercados) y se traslada ahí por JS; si el usuario está en otra
        // pestaña el track queda con display:none en algún ancestro y
        // offsetParent es null. Sin este freno, el carrusel seguía avanzando
        // "a ciegas" de fondo y el usuario volvía a Mercados con la tarjeta
        // de enfrente ya desplazada — parecía que el clic no hacía nada.
        const track = document.getElementById('ncTrack');
        if (!track || track.offsetParent === null) return;
        const lastPage = Math.max(0, Math.ceil(_ncItems.length / NC_VISIBLE) - 1) * NC_VISIBLE;
        _ncPage = _ncPage >= lastPage ? 0 : Math.min(_ncPage + NC_VISIBLE, lastPage);
        _ncPositionStack();
    }, 7000);
}

// Carrusel "en escalera": muestra NC_VISIBLE tarjetas completas y legibles a la
// vez, escalonadas (cada una un paso abajo y ligeramente a la derecha de la
// anterior); ncMove() avanza/retrocede de grupo en grupo con animación.
function _ncPositionStack() {
    const track = document.getElementById('ncTrack');
    if (!track) return;
    _ncComputeVisible();
    _ncBindTrackClicks(track);
    const cards = Array.from(track.children);
    cards.forEach((card, i) => {
        const offset = i - _ncPage;
        const visible = offset >= 0 && offset < NC_VISIBLE;
        card.style.pointerEvents = visible ? 'auto' : 'none';
        if (offset < 0) {
            card.style.transform = 'translate(0, -40px) scale(.96)';
            card.style.opacity = '0';
            card.style.zIndex = '0';
        } else if (visible) {
            card.style.transform = `translate(${offset * NC_INDENT}px, ${offset * NC_ROW_H}px)`;
            card.style.opacity = '1';
            card.style.zIndex = String(NC_VISIBLE - offset);
        } else {
            card.style.transform = `translate(0, ${NC_VISIBLE * NC_ROW_H + 30}px) scale(.96)`;
            card.style.opacity = '0';
            card.style.zIndex = '0';
        }
    });
    const prevBtn = track.closest('.nview')?.parentElement?.querySelector('#ncPrev');
    const nextBtn = track.closest('.nview')?.parentElement?.querySelector('#ncNext');
    if (prevBtn) prevBtn.disabled = _ncPage <= 0;
    if (nextBtn) nextBtn.disabled = _ncPage >= _ncItems.length - 1;
    const countEl = track.closest('.news')?.querySelector('.ncount');
    if (countEl) {
        const shown = Math.min(_ncPage + NC_VISIBLE, _ncItems.length);
        countEl.textContent = _ncItems.length ? `${_ncPage + 1}–${shown} de ${_ncItems.length}` : '0 de 0';
    }
}
function ncFilter(cat, el) {
    document.querySelectorAll('.fpill').forEach(b => b.classList.remove('active', 'on'));
    if (el) el.classList.add('active', 'on');
    _ncItems = cat === 'all' ? _ncAllItems : _ncAllItems.filter(n => catSlug(n.categoria || n.category || '') === cat);
    _ncPage = 0;
    _ncRenderTrack();
}
function _finNewsEsc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function _finNewsUrl(value) {
    try {
        const parsed = new URL(String(value || ''), window.location.origin);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch {
        return '';
    }
}
function _ncRenderTrack() {
    const track = document.getElementById('ncTrack');
    if (!track) return;
    const prioCl = ['alto', 'med', 'bajo'];
    const prioLb = ['ALTO IMPACTO', 'MEDIO', 'BAJO'];
    const catColors = ['#E85D75', '#0EA96E', '#7C5CDB', '#E09B1F', '#2A7FE0'];
    const CATS   = ['Mercados', 'Divisas', 'Macro', 'Acciones'];
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
        const cCol    = catColors[i % catColors.length];
        const fecha   = n.fecha    || fd;
        const slug    = catSlug(cat);
        // Antes, las noticias sin URL abrían el reporte interno (VALL-AI,
        // copiar/imprimir/Word); las que sí traían URL se iban directo al
        // artículo externo y nunca mostraban el reporte. Ahora casi todas
        // traen URL (necesaria para la foto real de Finnhub), así que TODAS
        // abren primero el reporte interno; el link a la fuente original vive
        // dentro del modal (botón "Ver Fuente").
        const tag     = 'div';
        const attrs   = `onclick="openNewsDetail(_ncItems[${i}])" role="button" tabindex="0"`;
            
        const photo = _finNewsUrl(n.image || n.imagen || '');
        const photoHtml = photo
            ? `<div class="nphoto" style="background-image:url('${_finNewsEsc(photo)}')"></div>`
            : `<div class="nphoto nphoto-empty" style="--nc:${cCol}"><i class="fas fa-newspaper"></i></div>`;

        return `<${tag} class="nitem" data-cat="${slug}" ${attrs}>
            ${photoHtml}
            <div class="nbody">
                <div class="ntop">
                    <span class="ncat" style="--nc:${cCol}">${_finNewsEsc(cat.toUpperCase())}</span>
                    <span class="nprio ${prioCl[ci]}">${prioLb[ci]}</span>
                </div>
                <h5>${_finNewsEsc(titulo)}</h5>
                <div class="nmeta">
                    <span class="nsrc">${_finNewsEsc(fuente)}</span>
                    <span class="ndate">${_finNewsEsc(fecha)}</span>
                </div>
            </div>
        </${tag}>`;
    }).join('');
    _ncPage = 0;
    _ncPositionStack();
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
const CENTRAL_BANKS = { fed: 4.50, bce: 2.65, boe: 4.50, boj: 0.50 };

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

const _rds = {};

 const RDS2_META = [
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
        { id:'tasas', icon:'🏦', lbl:'Tasas Bancarias',  border:'#b8901f' },
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
        return '<div class="rds3-row' + flash + '" data-idx="' + i + '" onclick="rds2ShowTip(this,' + i + ')">'
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
        if (!usdmxn) return;

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
    } catch(e) { console.error('loadFxStrip error:', e); }
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
// Finnhub manda el mismo logo genérico de agencia (Reuters, AP, etc.) como
// "image" cuando el artículo de wire no trae foto propia — se ve como una caja
// negra rota en la tarjeta. Se detecta y se descarta para caer en el
// placeholder de categoría en vez de mostrar el logo recortado.
function isRealNewsPhoto(url) {
    return !!url && /^https?:\/\//.test(url) && !/finnhub\.io\/file\/finnhub\/logo\//i.test(url);
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
        image:       [n.image, n.banner_image, n.socialimage].find(isRealNewsPhoto) || '',
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
const FIN_CK = 'fin_v7';
async function cargarFinanzas() {
    const now  = new Date();
    const hora = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const stored  = VDS.load(FIN_CK, true);
    const expired = VDS.isExpired(FIN_CK);
    if (isCacheValid(stored)) {
        tx('ai-status', `${expired ? 'Actualizando…' : 'Actualizado:'} ${stored.hora}`);
        _fhImgPool = stored.imgPool;
        updateForecastBanner(...stored.vai);
        let cachedNews = stored.noticias;
        if (cachedNews.length < 9) {
            const fb = buildFallback(stored.tiie, stored.fix, null, stored.hora);
            cachedNews = cachedNews.concat(fb.slice(cachedNews.length));
        }
        renderNewsGrid(cachedNews, stored.hora);
        renderFxStrip(stored.fx || null);
        Object.assign(_rds, { tiie: stored.tiie, fix: stored.fix, infl: stored.infl, vix: stored.vix, creditSpread: stored.creditSpread, fx: stored.fx || null, hora: stored.hora });
        renderRawDataPanel();
        window.VNLoader?.hide();
        if (!expired) return;
        VDS.clear(FIN_CK); 
    } else {
        VDS.clear(FIN_CK);
    }
    tx('ai-status', `Cargando… · ${hora}`);
    const CATS_FIN = ['Mercados Globales', 'Divisas y Commodities', 'Mercados Globales', 'Economía Global', 'Divisas y Commodities', 'Mercados Globales', 'Commodities', 'Cripto y Fintech', 'Economía México'];
    const IMP_FIN  = ['alto', 'medio', 'bajo', 'medio', 'alto', 'bajo', 'medio', 'medio', 'alto'];
    const fhNewsPromise = fetch('/api/finnhub-news?category=general')
        .then(r => r.ok ? r.json() : []).catch(() => []);

    fhNewsPromise.then(fhRaw => {
        if (!Array.isArray(fhRaw) || !fhRaw.length) return;
        const seen = new Set();
        _fhImgPool = fhRaw.filter(a => {
            if (!isRealNewsPhoto(a.image) || seen.has(a.image)) return false;
            seen.add(a.image); return true;
        }).map(a => a.image);
        const fhForNews = fhRaw.filter(a => a.headline || a.summary).slice(0, 9);
        if (fhForNews.length < 3) return;
        let noticiasFast = fhForNews.map((a, i) => ({
            categoria: CATS_FIN[i % CATS_FIN.length], titulo: a.headline || a.summary || '',
            descripcion: a.summary || '', fuente: (a.source || 'FINNHUB').toUpperCase(),
            impacto: IMP_FIN[i % IMP_FIN.length], ia_insight: `Real-time data via ${a.source || 'Finnhub'}.`,
            image: isRealNewsPhoto(a.image) ? a.image : (_fhImgPool[i] || ''), url: a.url || '',
        }));
                if (noticiasFast.length < 9) {
            const fb = buildFallback(null, null, null, hora);
            noticiasFast = noticiasFast.concat(fb.slice(noticiasFast.length));
        }
        renderNewsGrid(noticiasFast, hora);
        window.VNLoader?.hide();
    });
    const [tiieR, fixR, inflR, vixR, hygR, lqdR, fxR] = await Promise.allSettled([
        VDS.banxico('SF61745'),
        VDS.banxico('SF43718'),
        VDS.banxico('SP74660'),
        fetchAssetData('^VIX'),
        fetchAssetData('HYG'),
        fetchAssetData('LQD'),
        fetch('/api/exchange-rates').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    const tiie = tiieR.status === 'fulfilled' ? tiieR.value : null;
    const fix  = fixR.status  === 'fulfilled' ? fixR.value  : null;
    const infl = inflR.status === 'fulfilled' ? inflR.value : null;

    const fxRaw   = fxR.status === 'fulfilled' ? fxR.value : null;
    const mxnRate = fxRaw?.rates?.MXN;
    const fx = mxnRate ? {
        usdmxn: mxnRate,
        eurmxn: mxnRate / fxRaw.rates.EUR,
        gbpmxn: mxnRate / fxRaw.rates.GBP,
        jpymxn: mxnRate / fxRaw.rates.JPY,
        brlmxn: mxnRate / fxRaw.rates.BRL,
        cadmxn: mxnRate / fxRaw.rates.CAD,
    } : null;
    renderFxStrip(fx);

    const vixVal = vixR.status === 'fulfilled' ? vixR.value?.meta?.regularMarketPrice : null;
    const hygPct = hygR.status === 'fulfilled' ? hygR.value?.meta?.regularMarketChangePercent : null;
    const lqdPct = lqdR.status === 'fulfilled' ? lqdR.value?.meta?.regularMarketChangePercent : null;
    const creditSpread = (typeof hygPct === 'number' && typeof lqdPct === 'number') ? hygPct - lqdPct : null;

    const tiieVal = tiie ?? 11.0;
    const vaiPred    = calcVAI(tiieVal, fix, infl, vixVal, creditSpread);
    const vaiVerdict = vaiPred >= 65 ? 'Alcista' : vaiPred >= 45 ? 'Neutral' : 'Bajista';
    const vaiAlerta  = `TIIE ${tiieVal.toFixed(2)}%${infl ? ' · Inflación ' + infl.toFixed(2) + '%' : ''}${vixVal != null ? ' · VIX ' + vixVal.toFixed(1) : ''}. Monitorear Banxico y apetito de riesgo global.`;
    updateForecastBanner(vaiPred, vaiVerdict, vaiAlerta, 'MERCADO MX');
    Object.assign(_rds, { tiie: tiieVal, fix, infl, vix: vixVal, creditSpread, fx, hora });
    renderRawDataPanel();
    const fhRaw = await fhNewsPromise;
    const seen2 = new Set();
    _fhImgPool = fhRaw.filter(a => {
        if (!isRealNewsPhoto(a.image) || seen2.has(a.image)) return false;
        seen2.add(a.image); return true;
    }).map(a => a.image);

    const fhForNews = fhRaw.filter(a => a.headline || a.summary).slice(0, 9);
    let noticiasFast = fhForNews.length >= 3
        ? fhForNews.map((a, i) => ({
            categoria:   CATS_FIN[i % CATS_FIN.length],
            titulo:      a.headline || a.summary || '',
            descripcion: a.summary  || '',
            fuente:      (a.source  || 'FINNHUB').toUpperCase(),
            impacto:     IMP_FIN[i % IMP_FIN.length],
            ia_insight:  `Real-time data via ${a.source || 'Finnhub'}.`,
            image:       isRealNewsPhoto(a.image) ? a.image : (_fhImgPool[i] || ''),
            url:         a.url   || '',
          }))
        : buildFallback(tiieVal, fix, null, hora);
    if (noticiasFast.length < 9) {
        const fb = buildFallback(tiieVal, fix, null, hora);
        noticiasFast = noticiasFast.concat(fb.slice(noticiasFast.length));
    }
    const bc = { banxico: tiieVal, ...CENTRAL_BANKS };
    let noticiasFinales = noticiasFast;
    try {
        const noticiasES = await Promise.all(
            noticiasFast.map(n => toNoticia(
                { title: n.titulo, source: n.fuente, url: n.url, description: n.descripcion, image: n.image },
                n.categoria, n.impacto
            ))
        );
        renderNewsGrid(noticiasES, hora);
        noticiasFinales = noticiasES;
    } catch {
        renderNewsGrid(noticiasFast, hora);
    }
    window.VNLoader?.hide();
    tx('ai-status', `Actualizado · ${hora}`);
    const obj = { hora, tiie: tiieVal, fix, infl, vix: vixVal, creditSpread, bc, vai: [vaiPred, vaiVerdict, vaiAlerta, 'MERCADO MX'], noticias: noticiasFinales, imgPool: _fhImgPool, fx };
    if (isCacheValid(obj)) VDS.save(FIN_CK, obj);
}
const MKT_CAP_ASSETS = [
    { ticker: '^MXX',     label: 'IPC',        sub: 'BOLSA MX'    },
    { ticker: '^GSPC',    label: 'S&P 500',    sub: 'EE.UU.'      },
    { ticker: 'QQQ',      label: 'NASDAQ 100', sub: 'TECH'        },
    { ticker: 'USDMXN=X', label: 'USD / MXN', sub: 'FOREX'       },
    { ticker: 'GC=F',     label: 'Oro',        sub: 'COMMODITIES' },
    { ticker: 'BTC-USD',  label: 'Bitcoin',    sub: 'CRYPTO'      },
    { ticker: 'DX-Y.NYB', label: 'DXY',        sub: 'USD INDEX'   },
];

const VN_MKT_CHART_STYLE_STORAGE = 'vn_fin_mkt_chart_styles_v1';
let _vnMktChartStyles = (() => {
    try { return JSON.parse(localStorage.getItem(VN_MKT_CHART_STYLE_STORAGE) || '{}'); }
    catch { return {}; }
})();
let _mktCapVisualState = null;

function _mcSparkSVG(candles, isUp, idx, style = 'area') {
    const W = 126, H = 40, PX = 5, PY = 5;
    if (!candles || candles.length < 2) {
        return `<line x1="${PX}" y1="${H/2}" x2="${W-PX}" y2="${H/2}" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="3,3"/>`;
    }
    const closes = candles.map(c => c.close);
    const mn  = Math.min(...closes);
    const mx  = Math.max(...closes);
    const rng = mx - mn || mn * 0.005 || 1;
    const pts = closes.map((c, i) => ({
        x: +(PX + (i / (closes.length - 1)) * (W - 2 * PX)).toFixed(1),
        y: +(PY + (1 - (c - mn) / rng) * (H - 2 * PY)).toFixed(1),
    }));
    const lineStr = pts.map(p => `${p.x},${p.y}`).join(' ');
    const areaStr = lineStr + ` ${pts[pts.length-1].x},${H} ${pts[0].x},${H}`;
    const col  = isUp ? '#16a34a' : '#dc2626';
    const gid  = `sg_mc_${idx}`;
    const lx   = pts[pts.length - 1].x;
    const ly   = pts[pts.length - 1].y;
    if (style === 'bar') {
        const gap = 1.35;
        const barW = Math.max(1.5, ((W - 2 * PX) / closes.length) - gap);
        return closes.map((close, i) => {
            const height = Math.max(2, ((close - mn) / rng) * (H - 2 * PY));
            const x = +(PX + i * ((W - 2 * PX) / closes.length)).toFixed(1);
            const y = +(H - PY - height).toFixed(1);
            return `<rect x="${x}" y="${y}" width="${barW.toFixed(1)}" height="${height.toFixed(1)}" rx="1.2" fill="${col}" opacity="${i === closes.length - 1 ? '.95' : '.42'}"/>`;
        }).join('');
    }

    const area = style === 'area' ? `<defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${col}" stop-opacity=".22"/>
            <stop offset="90%" stop-color="${col}" stop-opacity=".02"/>
        </linearGradient>
    </defs>
    <polygon points="${areaStr}" fill="url(#${gid})"/>` : '';
    return `${area}
    <polyline points="${lineStr}" stroke="${col}" stroke-width="${style === 'line' ? '2.25' : '1.8'}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lx}" cy="${ly}" r="5.5" fill="${col}" opacity=".18"/>
    <circle cx="${lx}" cy="${ly}" r="2.5" fill="${col}"/>`;
}

function vnSetMktCapChartStyle(index, style, event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!['line', 'area', 'bar'].includes(style)) return;
    const asset = MKT_CAP_ASSETS[index];
    if (!asset) return;
    _vnMktChartStyles[asset.ticker] = style;
    try { localStorage.setItem(VN_MKT_CHART_STYLE_STORAGE, JSON.stringify(_vnMktChartStyles)); } catch {}
    if (_mktCapVisualState) {
        _renderMktCapRows(_mktCapVisualState.assets, _mktCapVisualState.results, _mktCapVisualState.periodKey, _mktCapVisualState.fmt);
    }
}

// Las filas de Mercado de Capitales se reconstruyen cada vez que cambia el
// periodo o llegan datos nuevos. Delegar el clic al contenedor mantiene activos
// los selectores Línea/Área/Barras incluso después de cada re-render y al volver
// a Finanzas dentro de la SPA.
function initMktCapChartStyleControls() {
    const list = document.getElementById('mkt-cap-list');
    if (!list || list.dataset.vnChartStylesReady === '1') return;
    list.dataset.vnChartStylesReady = '1';
    list.addEventListener('click', event => {
        const button = event.target.closest('[data-mkt-chart-style]');
        if (!button || !list.contains(button)) return;
        const index = Number(button.dataset.mktChartIndex);
        vnSetMktCapChartStyle(index, button.dataset.mktChartStyle, event);
    }, true);
}

function _mcFmtPrice(p) {
    if (p == null) return '—';
    if (p >= 10000) return p.toLocaleString('es-MX', { maximumFractionDigits: 0 });
    if (p >= 1000)  return p.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 10)    return p.toFixed(2);
    return p.toFixed(4);
}

function _mcFmtRange(candles, periodLbl, dec, mult, suffix) {
    if (!candles || candles.length < 2) return '';
    const closes = candles.map(c => c.close);
    const lo = Math.min(...closes), hi = Math.max(...closes);
    return `${periodLbl}: ${(((hi - lo) / lo * 100) * mult).toFixed(dec)}${suffix}`;
}

// Dibuja las filas de la lista a partir de resultados ya obtenidos (usado tanto
// por la carga inicial —que además alimenta _rds— como por el filtro de
// periodo/formato, que solo re-renderiza la vista sin tocar _rds).
function _renderMktCapRows(assets, results, periodKey, fmt) {
    const list = document.getElementById('mkt-cap-list');
    if (!list) return;
    initMktCapChartStyleControls();
    _mktCapVisualState = { assets, results, periodKey, fmt };
    const periodLbl = VN_PERIOD_LABEL_SHORT[periodKey] || '5d';
    const mult   = fmt === 'bps' ? 100 : 1;
    const suffix = fmt === 'bps' ? ' pb' : '%';
    const dec    = fmt === 'bps' ? 0 : 2;

    list.innerHTML = assets.map((a, i) => {
        const data     = results[i].status === 'fulfilled' ? results[i].value : null;
        const meta     = data?.meta || {};
        const candles  = data?.candles || [];
        const price    = meta.regularMarketPrice;
        const rawPct   = meta.regularMarketChangePercent;
        const pct      = rawPct != null ? rawPct * mult : null;
        const isUp     = (rawPct ?? 0) >= 0;
        const pctStr   = pct != null ? (isUp ? '+' : '') + pct.toFixed(dec) + suffix : '—';
        const arrow    = pct == null ? '' : isUp ? '▲' : '▼';
        const badgeCls = pct == null ? 'flat' : isUp ? 'up' : 'down';
        const rowCls   = pct == null ? 'row-flat' : isUp ? 'row-up' : 'row-down';
        const range    = _mcFmtRange(candles, periodLbl, dec, mult, suffix);
        const chartStyle = _vnMktChartStyles[a.ticker] || 'area';
        const styleButtons = [
            ['line', 'fa-chart-line', 'Línea'],
            ['area', 'fa-chart-area', 'Área'],
            ['bar', 'fa-chart-column', 'Barras'],
        ].map(([value, icon, label]) => `<button type="button" class="mkt-chart-style-btn${chartStyle === value ? ' is-active' : ''}" data-mkt-chart-index="${i}" data-mkt-chart-style="${value}" aria-label="Ver ${a.label} como ${label}" aria-pressed="${chartStyle === value}" title="${label}"><i class="fas ${icon}" aria-hidden="true"></i></button>`).join('');
        return `<div class="mkt-row ${rowCls}" onclick="openMktDetail(${i})" style="cursor:pointer">
            <div>
                <div class="mkt-name">${a.label}</div>
                <div class="mkt-sub">${a.sub}</div>
            </div>
            <div class="mkt-chart-cell" data-chart-style="${chartStyle}">
                <svg class="sparkline" viewBox="0 0 126 40" preserveAspectRatio="none" fill="none">${_mcSparkSVG(candles, isUp, i, chartStyle)}</svg>
                <div class="mkt-chart-style-switch" role="group" aria-label="Estilo de gráfica para ${a.label}">${styleButtons}</div>
            </div>
            <div class="mkt-right">
                <span class="mkt-badge ${badgeCls}">${arrow} ${pctStr}</span>
                <div class="mkt-val">${_mcFmtPrice(price)}</div>
                ${range ? `<div class="mkt-range">${range}</div>` : ''}
            </div>
        </div>`;
    }).join('');
}

// Re-fetch + re-render solo visual, disparado por el filtro de periodo/formato.
// No toca _rds (eso sigue reflejando el dato "de hoy" que usan otras tarjetas).
async function reloadMktCapVisual(periodKey = '5d', fmt = 'pct') {
    const { interval, range } = VN_PERIOD_MAP[periodKey] || VN_PERIOD_MAP['5d'];
    const results = await Promise.allSettled(MKT_CAP_ASSETS.map(a =>
        fetch(`/api/stock-history?ticker=${encodeURIComponent(a.ticker)}&interval=${interval}&range=${range}`)
            .then(r => r.ok ? r.json() : null).catch(() => null)
    ));
    _renderMktCapRows(MKT_CAP_ASSETS, results, periodKey, fmt);
}

async function loadMktCap() {
    const ASSETS = MKT_CAP_ASSETS;
    const results = await Promise.allSettled(ASSETS.map(a => fetchAssetData(a.ticker)));

    _renderMktCapRows(ASSETS, results, '5d', 'pct');

    _mktCapData = ASSETS.map((a, i) => ({
        asset:   a,
        meta:    results[i]?.status === 'fulfilled' ? results[i].value?.meta    : null,
        candles: results[i]?.status === 'fulfilled' ? results[i].value?.candles : null,
    }));

    const getMeta = idx => results[idx]?.status === 'fulfilled' ? results[idx].value?.meta : null;
    const m0 = getMeta(0), m1 = getMeta(1), m2 = getMeta(2), m4 = getMeta(4), m5 = getMeta(5), m6 = getMeta(6);
    Object.assign(_rds, {
        ipc:       m0?.regularMarketPrice, ipcPct:    m0?.regularMarketChangePercent,
        sp500:     m1?.regularMarketPrice, sp500Pct:  m1?.regularMarketChangePercent,
        nasdaq:    m2?.regularMarketPrice, nasdaqPct: m2?.regularMarketChangePercent,
        gold:      m4?.regularMarketPrice, goldPct:   m4?.regularMarketChangePercent,
        btc:       m5?.regularMarketPrice, btcPct:    m5?.regularMarketChangePercent,
        dxy:       m6?.regularMarketPrice, dxyPct:    m6?.regularMarketChangePercent,
    });
    renderRawDataPanel();
}
async function updateTicker() {
    const track = document.getElementById('vnTrack');
    if (!track) return;
    const TICKER_ASSETS = [
        { s: 'IPC',      n: 'México',        t: '^MXX'      },
        { s: 'DOW',      n: 'EE.UU.',        t: '^DJI'      },
        { s: 'S&P 500',  n: 'EE.UU.',        t: '^GSPC'     },
        { s: 'NASDAQ',   n: 'EE.UU.',        t: '^IXIC'     },
        { s: 'BOVESPA',  n: 'Brasil',        t: '^BVSP'     },
        { s: 'FTSE 100', n: 'Reino Unido',   t: '^FTSE'     },
        { s: 'DAX',      n: 'Alemania',      t: '^GDAXI'    },
        { s: 'CAC 40',   n: 'Francia',       t: '^FCHI'     },
        { s: 'NIKKEI',   n: 'Japón',         t: '^N225'     },
        { s: 'HANG SENG', n: 'Hong Kong',    t: '^HSI'      },
        { s: 'SSE',      n: 'Shanghái',      t: '000001.SS' },
    ];
    const results = await Promise.allSettled(TICKER_ASSETS.map(a => fetchAssetData(a.t)));
    function fmt(p) {
        if (p == null || p === 0) return '—';
        return p >= 1000
            ? '$' + p.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : '$' + p.toFixed(2);
    }
    const items = TICKER_ASSETS.map((a, i) => {
        const data  = results[i].status === 'fulfilled' ? results[i].value : null;
        const price = data?.meta?.regularMarketPrice ?? null;
        const pct   = data?.meta?.regularMarketChangePercent ?? null;
        return { s: a.s, n: a.n, p: price, c: pct };
    });
    if (items.every(d => d.p === null && d.c === null)) return;
    const html = items.map(d => {
        const up  = (d.c ?? 0) >= 0;
        const arr = up ? '&#9650;' : '&#9660;';
        const chg = d.c != null ? (up ? '+' : '') + d.c.toFixed(2) + '%' : '—';
        return `<div class="vn-item"><span class="vn-sym">${d.s}</span><span class="vn-name">${d.n}</span><span class="vn-price">${fmt(d.p)}</span><div class="vn-chg ${up?'up':'down'}"><span>${d.c != null ? arr : ''}</span><span>${chg}</span></div></div><div class="vn-sep"></div>`;
    }).join('');

    track.style.animation = 'none';
    track.innerHTML = html + html;
    void track.offsetWidth; 
    track.style.removeProperty('animation'); 
}    
let _bondsCurveChart = null;
let _lastBondsCurveData = null;

const VN_BOND_VALUE_LABELS = {
    id: 'vnBondValueLabels',
    afterDatasetsDraw(chart) {
        const dataset = chart.data?.datasets?.[0];
        const meta = chart.getDatasetMeta?.(0);
        if (!dataset || !meta || meta.hidden) return;
        const inBps = /pb/i.test(chart.options?.scales?.y?.title?.text || '');
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = "700 10px 'JetBrains Mono', monospace";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#526684';
        meta.data.forEach((element, index) => {
            const value = Number(dataset.data[index]);
            if (!Number.isFinite(value)) return;
            const pos = element.tooltipPosition();
            const label = inBps ? `${value.toFixed(0)} pb` : `${value.toFixed(2)}%`;
            ctx.fillText(label, pos.x, Math.max(chart.chartArea.top + 12, pos.y - 8));
        });
        ctx.restore();
    },
};

// ─── Preferencias visuales de gráficas ──────────────────────────────────────
const VN_CHART_STYLE_STORAGE = 'vn_fin_chart_styles_v1';
const VN_CHART_STYLE_DEFAULTS = {
    'bmv-chart': 'candlestick',
    'bonds-curve-chart': 'line',
    'fx-emerging-chart': 'bar',
    'movers-chart': 'bar',
};
let _vnChartStyles = (() => {
    try { return { ...VN_CHART_STYLE_DEFAULTS, ...JSON.parse(localStorage.getItem(VN_CHART_STYLE_STORAGE) || '{}') }; }
    catch { return { ...VN_CHART_STYLE_DEFAULTS }; }
})();

function vnGetChartStyle(target) {
    return _vnChartStyles[target] || VN_CHART_STYLE_DEFAULTS[target] || 'line';
}

function vnChartParsedValue(ctx) {
    return ctx.chart?.options?.indexAxis === 'y' ? ctx.parsed.x : ctx.parsed.y;
}

function vnGetChartJsInstance(target) {
    if (target === 'bonds-curve-chart') return _bondsCurveChart;
    if (target === 'fx-emerging-chart') return _fxEmergingChart;
    if (target === 'movers-chart') return _moversChart;
    return null;
}

function vnSetChartJsInstance(target, chart) {
    if (target === 'bonds-curve-chart') _bondsCurveChart = chart;
    if (target === 'fx-emerging-chart') _fxEmergingChart = chart;
    if (target === 'movers-chart') _moversChart = chart;
}

function vnApplyChartJsStyle(target, chart, style, update = true) {
    if (!chart) return null;
    const isBar = style === 'bar';
    const isArea = style === 'area';
    const horizontal = isBar && target !== 'bonds-curve-chart';
    const type = isBar ? 'bar' : 'line';
    chart.config.type = type;
    chart.options.indexAxis = horizontal ? 'y' : 'x';

    chart.data.datasets.forEach((dataset, index) => {
        if (Array.isArray(dataset.backgroundColor)) dataset._vnColors = dataset.backgroundColor.slice();
        dataset.type = type;
        dataset.tension = isBar ? 0 : .34;
        dataset.fill = isArea && index === 0;
        dataset.borderRadius = isBar ? 5 : 0;
        dataset.pointRadius = isBar ? 0 : (target === 'bonds-curve-chart' ? (index === 0 ? 5 : 2.5) : 4);
        dataset.pointHoverRadius = isBar ? 0 : 6;
        if (target === 'bonds-curve-chart') {
            if (!dataset._vnBondBorder) dataset._vnBondBorder = dataset.borderColor;
            dataset.borderColor = isBar
                ? (index === 0 ? '#2563eb' : 'rgba(100,116,139,.55)')
                : dataset._vnBondBorder;
            dataset.backgroundColor = isBar
                ? (index === 0 ? 'rgba(37,99,235,.68)' : 'rgba(148,163,184,.22)')
                : (isArea && index === 0 ? 'rgba(37,99,235,.18)' : 'transparent');
            dataset.borderWidth = isBar ? 1.5 : (index === 0 ? 2.5 : 1.5);
            dataset.borderRadius = isBar ? 7 : 0;
            dataset.maxBarThickness = isBar ? 58 : undefined;
        } else {
            const colors = dataset._vnColors || ['#2563eb'];
            dataset.pointBackgroundColor = colors;
            dataset.pointBorderColor = '#fff';
            dataset.borderColor = isBar ? colors : '#2563eb';
            dataset.backgroundColor = isBar ? colors : (isArea ? 'rgba(37,99,235,.18)' : 'rgba(37,99,235,.05)');
            dataset.borderWidth = isBar ? 0 : 2.5;
        }
    });

    const scales = chart.options.scales || {};
    const numericTick = chart.$vnNumericTick || scales.x?.ticks?.callback || scales.y?.ticks?.callback;
    if (numericTick) chart.$vnNumericTick = numericTick;
    if (scales.x?.ticks) scales.x.ticks.callback = horizontal ? numericTick : undefined;
    if (scales.y?.ticks) scales.y.ticks.callback = horizontal ? undefined : numericTick;
    // La curva de bonos usa una escala categórica. Chart.js puede conservar el
    // callback numérico de una vista anterior al cambiar entre línea/área/barras,
    // mostrando 0,1,2,3 en lugar de 3M,5Y,10Y,30Y. Forzamos la etiqueta real.
    if (target === 'bonds-curve-chart' && scales.x?.ticks) {
        scales.x.ticks.callback = function(value) { return this.getLabelForValue(value); };
    }
    if (scales.x?.grid) scales.x.grid.display = horizontal;
    if (scales.y?.grid) scales.y.grid.display = !horizontal;
    if (!update) return chart;

    // Chart.js conserva el controlador del tipo original cuando solo se muta
    // config.type. Reconstruir la instancia garantiza que línea, área y barras
    // sean controladores reales y no una variación cosmética del mismo dibujo.
    const canvas = chart.canvas;
    // `chart.options` es el resolvedor interno de Chart.js. Reutilizarlo al
    // reconstruir una instancia puede dejar escalas y eventos enlazados al
    // controlador anterior. La configuración cruda conserva callbacks y
    // permite cambiar realmente entre línea, área y barras.
    const data = chart.config.data;
    const options = chart.config.options;
    const plugins = Array.from(chart.config.plugins || []);
    const savedNumericTick = chart.$vnNumericTick;
    chart.destroy();
    const rebuilt = new Chart(canvas.getContext('2d'), { type, data, options, plugins });
    rebuilt.$vnNumericTick = savedNumericTick;
    canvas.closest('.chart-canvas-shell')?.setAttribute('data-chart-style', style);
    return rebuilt;
}

function vnSetChartStyle(target, style, persist = true) {
    const allowed = target === 'bmv-chart'
        ? ['candlestick', 'line', 'area', 'bar']
        : ['line', 'area', 'bar'];
    if (!allowed.includes(style)) style = VN_CHART_STYLE_DEFAULTS[target] || allowed[0];
    _vnChartStyles[target] = style;
    if (persist) {
        try { localStorage.setItem(VN_CHART_STYLE_STORAGE, JSON.stringify(_vnChartStyles)); } catch {}
    }

    if (target === 'bmv-chart') {
        const card = document.getElementById(target);
        if (card) card.setAttribute('chart-type', style);
    } else {
        const current = vnGetChartJsInstance(target);
        if (current) vnSetChartJsInstance(target, vnApplyChartJsStyle(target, current, style));
    }

    document.querySelectorAll(`.chart-style-picker[data-chart-target="${target}"] select[data-chart-style-select]`).forEach(select => {
        select.value = style;
        const control = select.closest('.chart-style-picker');
        control?.setAttribute('data-active-style', style);
        control?.querySelectorAll('.chart-style-option').forEach(button => {
            const active = button.dataset.chartStyle === style;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-checked', String(active));
            button.tabIndex = active ? 0 : -1;
        });
        const activeLabel = select.options[select.selectedIndex]?.textContent?.trim() || style;
        const status = control?.querySelector('.chart-style-status');
        if (status) status.textContent = `Vista activa: ${activeLabel}`;
    });
    if (target === 'bmv-chart') {
        document.querySelectorAll('[data-chart-style-shortcut]').forEach(button => {
            const active = button.dataset.chartStyleShortcut === style;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }
}

const VN_CHART_STYLE_ICONS = {
    candlestick: 'fa-chart-column',
    line: 'fa-chart-line',
    area: 'fa-chart-area',
    bar: 'fa-bars-staggered',
};
const VN_CHART_STYLE_HINTS = {
    line: 'Lee la tendencia',
    area: 'Destaca el impulso',
    bar: 'Compara magnitudes',
};

function vnChartFocusPanel(control, target) {
    return control.closest('.chart-experience-main, .panel, .bonds-curve-wrap')
        || document.getElementById(target)?.closest('.panel')
        || document.getElementById(target);
}

function vnToggleChartFocus(panel, button, target, forceClose = false) {
    if (!panel) return;
    const willOpen = !forceClose && !panel.classList.contains('chart-focus-mode');
    document.querySelectorAll('.chart-focus-mode').forEach(openPanel => openPanel.classList.remove('chart-focus-mode'));
    document.querySelectorAll('.chart-expand-btn[aria-pressed="true"]').forEach(openButton => {
        openButton.setAttribute('aria-pressed', 'false');
        openButton.title = 'Ampliar gráfica';
        openButton.setAttribute('aria-label', 'Ampliar gráfica');
        openButton.querySelector('i')?.classList.replace('fa-compress', 'fa-expand');
    });
    document.body.classList.toggle('vn-chart-focus-open', willOpen);
    const customCard = target === 'bmv-chart' ? document.getElementById(target) : null;
    if (willOpen) {
        panel.classList.add('chart-focus-mode');
        if (customCard) {
            customCard.dataset.vnOriginalHeight = customCard.getAttribute('height') || '400';
            customCard.setAttribute('height', String(Math.max(430, window.innerHeight - 215)));
        }
        button?.setAttribute('aria-pressed', 'true');
        button && (button.title = 'Cerrar vista ampliada');
        button?.setAttribute('aria-label', 'Cerrar análisis completo');
        button?.querySelector('i')?.classList.replace('fa-expand', 'fa-compress');
    } else if (customCard?.dataset.vnOriginalHeight) {
        customCard.setAttribute('height', customCard.dataset.vnOriginalHeight);
        delete customCard.dataset.vnOriginalHeight;
    }
    requestAnimationFrame(() => {
        if (target === 'bmv-chart') {
            window.dispatchEvent(new Event('resize'));
        } else {
            vnGetChartJsInstance(target)?.resize();
        }
    });
}

function initChartStyleControls() {
    document.querySelectorAll('.chart-style-picker[data-chart-target]').forEach(control => {
        if (control.dataset.chartStyleReady === '1') return;
        control.dataset.chartStyleReady = '1';
        const target = control.dataset.chartTarget;
        const select = control.querySelector('select[data-chart-style-select]');
        if (!select) return;

        const group = document.createElement('div');
        group.className = 'chart-style-options';
        group.setAttribute('role', 'radiogroup');
        group.setAttribute('aria-label', select.getAttribute('aria-label') || 'Estilo de gráfica');
        Array.from(select.options).forEach(option => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'chart-style-option';
            button.dataset.chartStyle = option.value;
            button.setAttribute('role', 'radio');
            button.setAttribute('aria-checked', 'false');
            button.title = `Mostrar como ${option.textContent.trim()}`;
            const hint = VN_CHART_STYLE_HINTS[option.value] || '';
            button.innerHTML = `<i class="fas ${VN_CHART_STYLE_ICONS[option.value] || 'fa-chart-line'}" aria-hidden="true"></i><span>${option.textContent.trim()}</span>${hint ? `<small>${hint}</small>` : ''}`;
            button.addEventListener('click', () => vnSetChartStyle(target, option.value));
            button.addEventListener('keydown', event => {
                if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                event.preventDefault();
                const buttons = Array.from(group.querySelectorAll('.chart-style-option'));
                const step = event.key === 'ArrowRight' ? 1 : -1;
                const next = buttons[(buttons.indexOf(button) + step + buttons.length) % buttons.length];
                next.focus();
                vnSetChartStyle(target, next.dataset.chartStyle);
            });
            group.appendChild(button);
        });

        const expandButton = document.createElement('button');
        expandButton.type = 'button';
        expandButton.className = 'chart-expand-btn';
        expandButton.title = 'Ampliar gráfica';
        expandButton.setAttribute('aria-label', 'Ampliar gráfica');
        expandButton.setAttribute('aria-pressed', 'false');
        expandButton.innerHTML = '<i class="fas fa-expand" aria-hidden="true"></i>';
        expandButton.addEventListener('click', () => vnToggleChartFocus(vnChartFocusPanel(control, target), expandButton, target));

        const status = document.createElement('span');
        status.className = 'chart-style-status';
        status.setAttribute('aria-live', 'polite');

        control.append(group, expandButton, status);
        select?.addEventListener('change', () => vnSetChartStyle(target, select.value));
        vnSetChartStyle(target, vnGetChartStyle(target), false);
    });

    if (!document.body.dataset.chartFocusReady) {
        document.body.dataset.chartFocusReady = '1';
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            const panel = document.querySelector('.chart-focus-mode');
            if (!panel) return;
            const button = panel.querySelector('.chart-expand-btn[aria-pressed="true"]');
            const target = panel.querySelector('.chart-style-picker')?.dataset.chartTarget;
            vnToggleChartFocus(panel, button, target, true);
            button?.focus();
        });
    }

    document.querySelectorAll('[data-chart-jump]').forEach(button => {
        if (button.dataset.chartJumpReady === '1') return;
        button.dataset.chartJumpReady = '1';
        button.addEventListener('click', () => {
            const target = document.getElementById(button.dataset.chartJump);
            if (!target) return;
            document.querySelectorAll('[data-chart-jump]').forEach(item => item.classList.toggle('is-active', item === button));
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.remove('chart-jump-pulse');
            requestAnimationFrame(() => target.classList.add('chart-jump-pulse'));
            window.setTimeout(() => target.classList.remove('chart-jump-pulse'), 900);
        });
    });

    document.querySelectorAll('[data-chart-style-shortcut]').forEach(button => {
        if (button.dataset.shortcutReady === '1') return;
        button.dataset.shortcutReady = '1';
        button.setAttribute('aria-pressed', String(button.classList.contains('is-active')));
        button.addEventListener('click', () => vnSetChartStyle('bmv-chart', button.dataset.chartStyleShortcut));
    });

    document.querySelectorAll('[data-chart-open]').forEach(button => {
        if (button.dataset.chartOpenReady === '1') return;
        button.dataset.chartOpenReady = '1';
        button.addEventListener('click', () => {
            document.querySelector(`.chart-style-picker[data-chart-target="${button.dataset.chartOpen}"] .chart-expand-btn`)?.click();
        });
    });
}

function renderBondsCurveChart(bonds, fmt = 'pct') {
    const canvas = document.getElementById('bonds-curve-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_bondsCurveChart && _bondsCurveChart.canvas !== canvas) {
        try { _bondsCurveChart.destroy(); } catch {}
        _bondsCurveChart = null;
    }
    _lastBondsCurveData = bonds;

    const mult   = fmt === 'bps' ? 100 : 1;
    const suffix = fmt === 'bps' ? ' pb' : '%';
    const dec    = fmt === 'bps' ? 0 : 2;

    const labels     = bonds.map(b => b.maturity || b.label);
    const yields     = bonds.map(b => b.yield * mult);
    const prevYields = bonds.map(b => (b.prev != null ? b.prev : b.yield) * mult);
    const hasPrev    = bonds.some(b => b.prev != null && b.prev !== b.yield);
    const curveMin   = Math.min(...yields);
    const curveMax   = Math.max(...yields);
    const curvePad   = Math.max((curveMax - curveMin) * .22, fmt === 'bps' ? 15 : .15);

    // Detectar curva invertida: primer rendimiento > último rendimiento
    const isInverted = yields.length >= 2 && yields[0] > yields[yields.length - 1];
    const lineColor  = isInverted ? '#dc2626' : '#1d4ed8';
    const pointColor = isInverted ? '#b91c1c' : '#1e40af';

    // Badge de estado de curva
    const statusEl = document.getElementById('bonds-curve-status');
    if (statusEl) {
        if (isInverted) {
            statusEl.textContent  = '⚠ CURVA INVERTIDA';
            statusEl.style.background = 'rgba(220,38,38,.1)';
            statusEl.style.color = '#dc2626';
        } else {
            statusEl.textContent  = '✓ CURVA NORMAL';
            statusEl.style.background = 'rgba(22,163,74,.1)';
            statusEl.style.color = '#16a34a';
        }
    }

    // Crear gradiente de relleno
    function makeGradient(ctx) {
        const g = ctx.createLinearGradient(0, 0, 0, 190);
        if (isInverted) {
            g.addColorStop(0,   'rgba(220,38,38,.22)');
            g.addColorStop(0.6, 'rgba(220,38,38,.06)');
            g.addColorStop(1,   'rgba(220,38,38,.00)');
        } else {
            g.addColorStop(0,   'rgba(29,78,216,.18)');
            g.addColorStop(0.6, 'rgba(29,78,216,.05)');
            g.addColorStop(1,   'rgba(29,78,216,.00)');
        }
        return g;
    }

    const ctx2d = canvas.getContext('2d');

    // Tooltip: distingue la curva de hoy de la de referencia (día anterior)
    const tooltipLabel = ctx => {
        const tag = ctx.datasetIndex === 1 ? 'Anterior' : 'Hoy';
        return ` ${tag}: ${ctx.parsed.y?.toFixed(dec)}${suffix}`;
    };

    if (_bondsCurveChart) {
        _bondsCurveChart.data.labels = labels;
        _bondsCurveChart.data.datasets[0].data = yields;
        _bondsCurveChart.data.datasets[0].borderColor = lineColor;
        _bondsCurveChart.data.datasets[0]._vnBondBorder = lineColor;
        _bondsCurveChart.data.datasets[0].pointBackgroundColor = '#fff';
        _bondsCurveChart.data.datasets[0].pointBorderColor = pointColor;
        _bondsCurveChart.data.datasets[0].backgroundColor = makeGradient(ctx2d);
        _bondsCurveChart.data.datasets[1].data = prevYields;
        _bondsCurveChart.data.datasets[1].hidden = !hasPrev;
        _bondsCurveChart.options.plugins.tooltip.callbacks.label = tooltipLabel;
        _bondsCurveChart.options.plugins.tooltip.callbacks.afterBody = items => {
            const index = items?.[0]?.dataIndex;
            if (index == null || bonds[index]?.prev == null) return '';
            const changeBps = (bonds[index].yield - bonds[index].prev) * 100;
            return ` Variación diaria: ${changeBps >= 0 ? '+' : ''}${changeBps.toFixed(1)} pb`;
        };
        _bondsCurveChart.options.scales.y.ticks.callback = v => v.toFixed(dec) + suffix;
        if (_bondsCurveChart.options.scales.y.title) {
            _bondsCurveChart.options.scales.y.title.text = fmt === 'bps' ? 'Rendimiento (pb)' : 'Rendimiento (%)';
        }
        _bondsCurveChart.options.scales.y.suggestedMin = curveMin - curvePad;
        _bondsCurveChart.options.scales.y.suggestedMax = curveMax + curvePad;
        _bondsCurveChart.$vnNumericTick = _bondsCurveChart.options.scales.y.ticks.callback;
        vnApplyChartJsStyle('bonds-curve-chart', _bondsCurveChart, vnGetChartStyle('bonds-curve-chart'), false);
        _bondsCurveChart.update('active');
        return;
    }

    _bondsCurveChart = new Chart(ctx2d, {
        type: 'line',
        plugins: [VN_BOND_VALUE_LABELS],
        data: {
            labels,
            datasets: [{
                label: 'Hoy',
                data: yields,
                borderColor: lineColor,
                backgroundColor: makeGradient(ctx2d),
                borderWidth: 2.5,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointBackgroundColor: '#fff',
                pointBorderColor: pointColor,
                pointBorderWidth: 2,
                tension: 0.35,
                fill: true,
                order: 1,
            }, {
                // Curva de referencia (día anterior) — permite ver de un vistazo si
                // hubo aplanamiento, empinamiento o desplazamiento paralelo.
                label: 'Anterior',
                data: prevYields,
                hidden: !hasPrev,
                borderColor: 'rgba(100,116,139,.65)',
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                borderDash: [5, 4],
                pointRadius: 2.5,
                pointHoverRadius: 4,
                pointBackgroundColor: 'rgba(100,116,139,.65)',
                pointBorderColor: 'transparent',
                tension: 0.35,
                fill: false,
                order: 2,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        boxWidth: 14, boxHeight: 2, usePointStyle: false,
                        font: { size: 9.5, family: "'Inter', sans-serif", weight: '600' },
                        color: 'rgba(100,116,139,.9)',
                        padding: 8,
                    },
                },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: 'rgba(255,255,255,.55)',
                    bodyColor: '#fff',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        title: ctx => ctx[0].label,
                        label: tooltipLabel,
                        afterBody: items => {
                            const index = items?.[0]?.dataIndex;
                            if (index == null || bonds[index]?.prev == null) return '';
                            const changeBps = (bonds[index].yield - bonds[index].prev) * 100;
                            return ` Variación diaria: ${changeBps >= 0 ? '+' : ''}${changeBps.toFixed(1)} pb`;
                        },
                    },
                },
            },
            scales: {
                y: {
                    suggestedMin: curveMin - curvePad,
                    suggestedMax: curveMax + curvePad,
                    title: {
                        display: true,
                        text: fmt === 'bps' ? 'Rendimiento (pb)' : 'Rendimiento (%)',
                        color: 'rgba(100,116,139,.75)',
                        font: { size: 9, family: "'Inter', sans-serif", weight: '600' },
                    },
                    ticks: {
                        callback: v => v.toFixed(dec) + suffix,
                        font: { size: 9, family: "'JetBrains Mono', monospace" },
                        color: 'rgba(128,128,128,0.8)',
                        maxTicksLimit: 5,
                    },
                    grid: { color: 'rgba(128,128,128,0.15)', drawBorder: false },
                    border: { display: false },
                },
                x: {
                    title: {
                        display: true,
                        text: 'Vencimiento',
                        color: 'rgba(100,116,139,.75)',
                        font: { size: 9, family: "'Inter', sans-serif", weight: '600' },
                    },
                    ticks: {
                        callback: function(value) { return this.getLabelForValue(value); },
                        font: { size: 9, family: "'Inter', sans-serif", weight: '600' },
                        color: 'rgba(128,128,128,0.8)',
                    },
                    grid: { display: false },
                    border: { display: false },
                },
            },
        },
    });
    _bondsCurveChart.$vnNumericTick = _bondsCurveChart.options.scales.y.ticks.callback;
    _bondsCurveChart = vnApplyChartJsStyle('bonds-curve-chart', _bondsCurveChart, vnGetChartStyle('bonds-curve-chart'));
}

const _BOND_FB = [
    { key:'us', country:'Estados Unidos', flag:'🇺🇸', source:'US Treasury (referencia)', bonds:[
        { label:'3 meses', maturity:'3M',  yield:4.33, prev:4.35 },
        { label:'5 años',  maturity:'5Y',  yield:4.35, prev:4.38 },
        { label:'10 años', maturity:'10Y', yield:4.51, prev:4.48 },
        { label:'30 años', maturity:'30Y', yield:4.95, prev:4.92 }]},
    { key:'eu', country:'Zona Euro',    flag:'🇪🇺', source:'BCE (referencia)',    bonds:[{ label:'10 años',      maturity:'10Y', yield:2.65, prev:2.70 }]},
    { key:'mx', country:'México',        flag:'🇲🇽', source:'Banxico (referencia)',bonds:[{ label:'TIIE 28D',      maturity:'28D', yield:8.50, prev:9.00 }]},
    { key:'jp', country:'Japón',         flag:'🇯🇵', source:'BOJ (referencia)',    bonds:[{ label:'Tasa objetivo', maturity:'OVN', yield:0.50, prev:0.25 }]},
    { key:'gb', country:'Reino Unido',   flag:'🇬🇧', source:'BOE (referencia)',    bonds:[{ label:'Tasa base',     maturity:'OVN', yield:4.50, prev:4.75 }]},
    { key:'cn', country:'China',         flag:'🇨🇳', source:'PBOC (referencia)',   bonds:[{ label:'LPR 1 año',    maturity:'1Y',  yield:3.45, prev:3.65 }]},
    { key:'br', country:'Brasil',        flag:'🇧🇷', source:'BACEN (referencia)',  bonds:[{ label:'SELIC',         maturity:'OVN', yield:13.75,prev:14.75}]},
    { key:'ca', country:'Canadá',        flag:'🇨🇦', source:'BOC (referencia)',    bonds:[{ label:'Tasa objetivo', maturity:'OVN', yield:4.25, prev:4.50 }]}
];

function _renderBondsData(data, isRef) {
    const usEntry     = data.find(d => d.key === 'us');
    const globalEntry = data.filter(d => d.key !== 'us');
    const usEl        = document.getElementById('bonds-us');
    const globalEl    = document.getElementById('bonds-global');
    if (usEl && usEntry) {
        usEl.innerHTML = usEntry.bonds.map(b => {
            const yld  = b.yield != null ? b.yield.toFixed(2) + '%' : '—';
            const diff = (b.yield != null && b.prev != null) ? b.yield - b.prev : null;
            const cls  = diff == null ? 'flat' : diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
            // Para bonos: yield sube = malo (rojo); yield baja = bueno (verde)
            const trendCls = diff == null ? 'trend-flat' : diff > 0.005 ? 'trend-up' : diff < -0.005 ? 'trend-down' : 'trend-flat';
            const chg  = isRef ? 'ref.' : (diff != null ? (diff > 0 ? '▲' : '▼') + Math.abs(diff).toFixed(2) : '—');
            return `<div class="bond-pill ${trendCls}" title="Ver desglose ${b.label}" onclick="openBondDetail('us','${b.label}')">
                <span class="bp-mat">${b.label}</span>
                <span class="bp-yld">${yld}</span>
                <span class="bp-chg ${cls}">${chg}</span>
            </div>`;
        }).join('');
        if (!isRef) renderBondsCurveChart(usEntry.bonds);
        else {
            const statusEl = document.getElementById('bonds-curve-status');
            if (statusEl) { statusEl.textContent = 'REF. · en vivo N/D'; statusEl.style.background = 'rgba(245,158,11,.1)'; statusEl.style.color = '#d97706'; }
        }
    }
    if (globalEl) {
        globalEl.innerHTML = globalEntry.map(d => {
            const b    = d.bonds[0];
            const yld  = b.yield != null ? b.yield.toFixed(2) + '%' : '—';
            const diff = (b.yield != null && b.prev != null) ? b.yield - b.prev : null;
            const cls  = diff == null ? 'flat' : diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
            const chg  = isRef ? 'ref.' : (diff != null ? (diff > 0 ? '▲' : '▼') + Math.abs(diff).toFixed(2) : '—');
            // Escala común 0–15%: ahora la longitud de todas las barras sí es
            // comparable entre países. Antes cada mercado usaba un rango propio,
            // haciendo que 3% en Europa pareciera mayor que 6% en México.
            const barPct = b.yield != null ? Math.max(3, Math.min(100, (b.yield / 15) * 100)).toFixed(0) : 0;
            const barColor = b.yield != null && b.yield >= 8 ? '#dc2626' : b.yield >= 4 ? '#d97706' : '#29936f';
            const yldColor = b.yield != null && b.yield >= 8 ? '#dc2626' : b.yield >= 4 ? '#d97706' : '#38516f';
            return `<div class="bond-row" title="Ver desglose ${d.country}" onclick="openBondDetail('${d.key}','${b.label}')">
                <div class="bond-row-left" style="flex:1;min-width:0;">
                    <span class="bond-row-flag">${d.flag}</span>
                    <div style="flex:1;min-width:0;">
                        <div class="bond-row-name">${d.country} <span style="font-weight:400;color:#94a3b8;font-size:.6rem;">· ${b.label}</span></div>
                        <div class="bonds-global-rate-bar"><div class="bonds-global-rate-fill" style="width:${barPct}%;background:${barColor};"></div></div>
                    </div>
                </div>
                <div class="bond-row-right" style="flex-shrink:0;">
                    <span class="bond-row-yield" style="color:${yldColor};">${yld}</span>
                    <span class="bond-row-chg ${cls}">${chg}</span>
                    <i class="fas fa-chevron-right" style="font-size:.5rem;color:#cbd5e1;margin-left:.25rem;"></i>
                </div>
            </div>`;
        }).join('');
    }
    if (usEntry?.bonds && !isRef) {
        const b2  = usEntry.bonds.find(b => b.label === '2Y' || b.label === '2A');
        const b10 = usEntry.bonds.find(b => b.label === '10Y'|| b.label === '10A');
        const ycEl = document.getElementById('rp-yc');
        if (ycEl && b2?.yield != null && b10?.yield != null) {
            const spread = b10.yield - b2.yield;
            ycEl.textContent = (spread >= 0 ? '+' : '') + spread.toFixed(2) + ' pp';
            ycEl.style.color = spread >= 0 ? '#16a34a' : '#dc2626';
            ycEl.title = spread >= 0 ? 'Curva normal' : '⚠ Curva invertida · señal histórica de recesión';
        }
    }
}

async function loadBonds() {
    const loading = document.getElementById('bonds-loading');
    const ac  = new AbortController();
    const tmr = setTimeout(() => ac.abort(), 12000);
    try {
        const r = await fetch('/api/bond-yields', { signal: ac.signal });
        clearTimeout(tmr);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (loading) loading.style.display = 'none';
        _bondData = data;
        _syncCentralBanksFromBondData(data);
        _renderBondsData(data, false);
        const upd = document.getElementById('bonds-upd');
        if (upd) upd.textContent = 'Act. ' + new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        clearTimeout(tmr);
        console.error('loadBonds error:', e.message);
        _bondData = _BOND_FB;
        _renderBondsData(_BOND_FB, true);
        const upd = document.getElementById('bonds-upd');
        if (upd) upd.textContent = 'Referencia · en vivo no disponible';
        if (loading) { loading.style.display = 'block'; loading.textContent = '⚠ Usando tasas de referencia · datos en vivo no disponibles'; }
    }
}

async function loadRiskPanel() {
    try {
        const [vixR, tiieR, inflR, moveR, tnxR, irxR] = await Promise.allSettled([
            fetchAssetData('^VIX'),
            VDS.banxico('SF61745'),
            VDS.banxico('SP74660'),
            fetchAssetData('^MOVE'),
            fetchAssetData('^TNX'),
            fetchAssetData('^IRX'),
        ]);
        const vix  = vixR.status  === 'fulfilled' ? (vixR.value?.meta?.regularMarketPrice  ?? null) : null;
        const tiie = (tiieR.status === 'fulfilled' && tiieR.value != null) ? tiieR.value : 11.0;
        const infl = (inflR.status === 'fulfilled' && inflR.value != null) ? inflR.value : 4.5;
        const move = moveR.status === 'fulfilled' ? (moveR.value?.meta?.regularMarketPrice  ?? null) : null;
        const tnx  = tnxR.status  === 'fulfilled' ? (tnxR.value?.meta?.regularMarketPrice   ?? null) : null;
        const irx  = irxR.status  === 'fulfilled' ? (irxR.value?.meta?.regularMarketPrice   ?? null) : null;
        if (tnx != null) _rds.tnx = tnx;

        const fed = CENTRAL_BANKS.fed, spread = tiie - fed, realRate = tiie - infl;
        const vixLevel = vix == null ? null : vix < 15 ? 'Baja' : vix < 25 ? 'Moderada' : 'Alta';
        const vixColor = vix == null ? '#64748b' : vix < 15 ? '#16a34a' : vix < 25 ? '#d97706' : '#dc2626';

        tx('rp-spread', `+${spread.toFixed(2)} pp`);
        const vixEl = $('rp-vix');
        if (vixEl) { vixEl.textContent = vix != null ? `${vix.toFixed(2)} · ${vixLevel}` : '—'; vixEl.style.color = vixColor; }
        const realEl = $('rp-real');
        if (realEl) { realEl.textContent = `${realRate >= 0 ? '+' : ''}${realRate.toFixed(2)}%`; realEl.style.color = realRate >= 0 ? '#16a34a' : '#dc2626'; }

        // MOVE Index (volatilidad implícita bonos EE.UU.)
        const moveEl = $('rp-move');
        if (moveEl) {
            if (move != null) {
                moveEl.textContent = move.toFixed(1) + (move > 120 ? ' · Alta' : move > 90 ? ' · Mod.' : ' · Baja');
                moveEl.style.color = move > 120 ? '#dc2626' : move > 90 ? '#d97706' : '#16a34a';
            } else { moveEl.textContent = '—'; }
        }

        // Break-even inflación 10Y
        // Estimación: Nominal 10Y (^TNX) − rendimiento TIPS aproximado
        // El TIPS 10Y históricamente opera ~43-45% por debajo del nominal en ciclos normales.
        // Sin acceso a FRED T10YIE, usamos: be ≈ TNX × 0.565 como proxy razonable.
        const beEl = $('rp-breakeven');
        if (beEl) {
            if (tnx != null) {
                const beEst = +(tnx * 0.565).toFixed(2);
                beEl.textContent = beEst.toFixed(2) + '% est.';
                beEl.style.color = beEst > 2.5 ? '#dc2626' : beEst > 2.0 ? '#d97706' : '#16a34a';
                beEl.title = `Estimación: TNX ${tnx.toFixed(2)}% × 0.565 ≈ ${beEst.toFixed(2)}% · Proxy sin FRED T10YIE. Sobre 2.5% = expectativas desancladas.`;
            } else {
                beEl.textContent = '—';
                beEl.style.color = '#94a3b8';
                beEl.title = 'T-Note 10Y no disponible aún.';
            }
        }

        // OIS · Probabilidad de recorte Fed (proxy: Fed − T-Bill 3M)
        const oisEl = $('rp-ois');
        if (oisEl) {
            if (irx != null) {
                const cutProb = Math.max(0, Math.min(100, Math.round((fed - irx) / 0.25 * 100)));
                oisEl.textContent = cutProb + '% recorte';
                oisEl.style.color = cutProb >= 60 ? '#16a34a' : cutProb >= 30 ? '#d97706' : '#dc2626';
                oisEl.title = `T-Bill 3M: ${irx.toFixed(2)}% vs Fed: ${fed}% → proxy OIS`;
            } else { oisEl.textContent = '—'; }
        }

        const noteEl = $('rp-note');
        if (noteEl) {
            noteEl.innerHTML = `<i class="fas fa-robot"></i> ${
                spread > 5 ? `Carry trade atractivo (TIIE–Fed +${spread.toFixed(2)} pp). ` : `Diferencial TIIE–Fed: +${spread.toFixed(2)} pp. `
            }${realRate >= 0 ? `Tasa real: +${realRate.toFixed(2)}%.` : `Tasa real negativa: ${realRate.toFixed(2)}%.`
            }${vix != null ? ` VIX ${vix.toFixed(1)} (${vixLevel?.toLowerCase()}).` : ''
            }${move != null ? ` MOVE ${move.toFixed(0)}${move > 120 ? ' — tensión en bonos.' : '.'}` : ''}`;
        }
        // Guardar valores para el modal de detalle
        const be = tnx != null ? tnx - (tnx * 0.435) : null;
        const cutProb = irx != null ? Math.max(0, Math.min(100, Math.round((fed - irx) / 0.25 * 100))) : null;
        _rpData = { spread, vix, tiie, infl, fed, realRate, move, tnx, irx, be, cutProb };
    } catch (e) {
        console.error('loadRiskPanel error:', e);
    }
}

async function loadMarketForecasts() {
    const ASSETS = [
        { ticker: '^MXX',     label: '🇲🇽 IPC México' },
        { ticker: '^GSPC',    label: '🇺🇸 S&P 500'    },
        { ticker: 'USDMXN=X', label: '🇲🇽 USD/MXN'    },
        { ticker: 'EURUSD=X', label: '🇪🇺 EUR/USD'    },
        { ticker: 'GC=F',     label: '🥇 Oro'         },
        { ticker: 'BTC-USD',  label: '₿ Bitcoin'      },
    ];

    const results = await Promise.allSettled(ASSETS.map(a => fetchAssetData(a.ticker)));

    function fmtPrice(p) {
        if (p == null) return '—';
        if (p >= 1000) return p.toLocaleString('es-MX', { maximumFractionDigits: 0 });
        if (p >= 10)   return p.toFixed(2);
        return p.toFixed(4);
    }

    const cont = $('fc-markets');
    if (!cont) return;

    cont.innerHTML = ASSETS.map((a, i) => {
        const data = results[i].status === 'fulfilled' ? results[i].value : null;
        const meta = data?.meta || {};
        const price = meta.regularMarketPrice;
        const pct   = meta.regularMarketChangePercent;

        const trend = pct == null ? 'flat' : pct > 0.3 ? 'up' : pct < -0.3 ? 'down' : 'flat';
        const color = trend === 'up' ? '#4ade80' : trend === 'down' ? '#f87171' : '#94a3b8';
        const label = trend === 'up' ? 'Alcista' : trend === 'down' ? 'Bajista' : 'Neutral';
        const arrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '►';
        const pctStr = pct != null ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '—';

        return `<div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:.5rem .4rem;text-align:center;">
            <div style="font-size:.58rem;color:#6b7f9a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:.25rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.label}</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:.78rem;font-weight:700;color:#fff;">${fmtPrice(price)}</div>
            <div style="font-size:.66rem;font-weight:700;color:${color};margin-top:.2rem;">${arrow} ${pctStr}</div>
            <div style="font-size:.55rem;font-weight:700;color:${color};margin-top:.25rem;text-transform:uppercase;letter-spacing:.5px;">${label}</div>
        </div>`;
    }).join('');
}

async function loadCreditRisk() {
    try {
        const [hygR, lqdR] = await Promise.allSettled([fetchAssetData('HYG'), fetchAssetData('LQD')]);
        const hygPct = hygR.status === 'fulfilled' ? hygR.value?.meta?.regularMarketChangePercent : null;
        const lqdPct = lqdR.status === 'fulfilled' ? lqdR.value?.meta?.regularMarketChangePercent : null;

        const fmtPct = v => (typeof v === 'number') ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '--';
        function setChip(id, text, bg, color) {
            const el = $(id); if (!el) return;
            el.textContent = text; el.style.background = bg; el.style.color = color;
        }

        // HYG row
        const hygEl = $('credit-hyg');
        if (hygEl) { hygEl.textContent = fmtPct(hygPct); hygEl.style.color = typeof hygPct === 'number' ? (hygPct >= 0 ? '#16a34a' : '#dc2626') : '#0f172a'; }
        if (typeof hygPct === 'number') {
            const [bg,fc] = hygPct >= 0.1 ? ['rgba(22,163,74,.1)','#16a34a'] : hygPct >= -0.1 ? ['rgba(245,158,11,.1)','#d97706'] : ['rgba(220,38,38,.1)','#dc2626'];
            setChip('credit-hyg-chip', hygPct >= 0.1 ? 'DEMANDA ALTA' : hygPct >= -0.1 ? 'NEUTRAL' : 'VENTA', bg, fc);
        }

        // LQD row
        const lqdEl = $('credit-lqd');
        if (lqdEl) { lqdEl.textContent = fmtPct(lqdPct); lqdEl.style.color = typeof lqdPct === 'number' ? (lqdPct >= 0 ? '#16a34a' : '#dc2626') : '#0f172a'; }
        if (typeof lqdPct === 'number') {
            const [bg,fc] = lqdPct >= 0.1 ? ['rgba(22,163,74,.1)','#16a34a'] : lqdPct >= -0.1 ? ['rgba(245,158,11,.1)','#d97706'] : ['rgba(220,38,38,.1)','#dc2626'];
            setChip('credit-lqd-chip', lqdPct >= 0.1 ? 'REFUGIO ACTIVO' : lqdPct >= -0.1 ? 'ESTABLE' : 'SALIDA', bg, fc);
        }

        if (typeof hygPct === 'number' && typeof lqdPct === 'number') {
            const spread = hygPct - lqdPct;
            const fmtSpread = `${spread >= 0 ? '+' : ''}${spread.toFixed(2)} pp`;

            // Spread row
            const svEl = $('credit-spread-val');
            if (svEl) { svEl.textContent = fmtSpread; svEl.style.color = spread > 0 ? '#16a34a' : spread < -0.1 ? '#dc2626' : '#d97706'; }
            if (spread > 0.15)        setChip('credit-spread-chip', 'RISK-ON',    'rgba(22,163,74,.1)',  '#16a34a');
            else if (spread > -0.15)  setChip('credit-spread-chip', 'NEUTRAL',    'rgba(245,158,11,.1)','#d97706');
            else                      setChip('credit-spread-chip', 'RISK-OFF',   'rgba(220,38,38,.1)', '#dc2626');

            // Sentinel banner
            const dot    = $('credit-sentinel-dot');
            const lbl    = $('credit-verdict-lbl');
            const chip   = $('credit-verdict-chip');
            const desc   = $('credit-verdict-desc');
            if (spread > 0.15) {
                if (dot)  { dot.style.background = '#16a34a'; dot.style.boxShadow = '0 0 0 4px rgba(22,163,74,.18)'; }
                if (lbl)  lbl.textContent = 'Apetito de Riesgo — Los Inversores Están Arriesgando';
                if (chip) { chip.textContent = 'RISK-ON'; chip.style.background = 'rgba(22,163,74,.12)'; chip.style.color = '#16a34a'; }
                if (desc) desc.textContent = `Los bonos de riesgo (+${hygPct.toFixed(2)}%) superan hoy a los bonos seguros (+${lqdPct.toFixed(2)}%): señal de confianza y apetito por activos de mayor rendimiento.`;
            } else if (spread < -0.15) {
                if (dot)  { dot.style.background = '#dc2626'; dot.style.boxShadow = '0 0 0 4px rgba(220,38,38,.18)'; }
                if (lbl)  lbl.textContent = 'Aversión al Riesgo — Los Inversores Buscan Seguridad';
                if (chip) { chip.textContent = 'RISK-OFF'; chip.style.background = 'rgba(220,38,38,.12)'; chip.style.color = '#dc2626'; }
                if (desc) desc.textContent = `Los bonos seguros superan a los de riesgo: el mercado prefiere protegerse. Señal de cautela global — los inversores reducen exposición a activos de alto riesgo.`;
            } else {
                if (dot)  { dot.style.background = '#d97706'; dot.style.boxShadow = '0 0 0 4px rgba(245,158,11,.18)'; }
                if (lbl)  lbl.textContent = 'Sentimiento Neutral — Sin Tendencia Clara';
                if (chip) { chip.textContent = 'NEUTRAL'; chip.style.background = 'rgba(245,158,11,.12)'; chip.style.color = '#d97706'; }
                if (desc) desc.textContent = `El diferencial entre bonos de riesgo y bonos seguros es mínimo (${fmtSpread}). Los inversores no muestran preferencia clara entre activos seguros y de riesgo.`;
            }

            const noteEl = $('credit-note');
            if (noteEl) noteEl.innerHTML = `<i class="fas fa-robot"></i> ${
                spread > 0.15
                    ? 'Los bonos corporativos de alto rendimiento (HYG) superan hoy a los de grado de inversión (LQD): señal de apetito de riesgo activo en mercados globales.'
                    : spread < -0.15
                        ? 'Los bonos seguros (LQD) superan a los de alto riesgo (HYG): el mercado está en modo defensivo, reduciendo exposición a crédito de baja calidad.'
                        : 'Flujos equilibrados entre deuda de alto rendimiento y deuda segura. El mercado no envía señal clara de risk-on ni risk-off.'
            }`;
            _creditData = { hygPct, lqdPct, spread };
        }
    } catch (e) {
        console.error('loadCreditRisk error:', e);
    }
}

let _fxEmergingChart = null;

// Plugin de Chart.js reutilizable: dibuja una línea vertical punteada de
// referencia (p.ej. el promedio del universo muestreado) sobre un bar chart
// horizontal — da contexto de mercado ("¿esta divisa/emisora se mueve más o
// menos que el promedio del grupo?") sin depender del plugin oficial de
// anotaciones (que no está cargado en la página).
const vnAvgLinePlugin = {
    id: 'vnAvgLine',
    afterDraw(chart) {
        const opts = chart.options?.plugins?.vnAvgLine;
        if (!opts || opts.value == null) return;
        const { ctx, chartArea, scales } = chart;
        const horizontalBars = chart.options?.indexAxis === 'y';
        const valueScale = horizontalBars ? scales.x : scales.y;
        const valuePix = valueScale.getPixelForValue(opts.value);
        if (horizontalBars && (valuePix < chartArea.left || valuePix > chartArea.right)) return;
        if (!horizontalBars && (valuePix < chartArea.top || valuePix > chartArea.bottom)) return;
        ctx.save();
        ctx.strokeStyle = opts.color || 'rgba(100,116,139,.6)';
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        if (horizontalBars) {
            ctx.moveTo(valuePix, chartArea.top);
            ctx.lineTo(valuePix, chartArea.bottom);
        } else {
            ctx.moveTo(chartArea.left, valuePix);
            ctx.lineTo(chartArea.right, valuePix);
        }
        ctx.stroke();
        if (opts.label) {
            ctx.setLineDash([]);
            ctx.fillStyle = opts.color || 'rgba(100,116,139,.9)';
            ctx.font = '9px Inter, sans-serif';
            ctx.textAlign = horizontalBars ? 'center' : 'left';
            ctx.fillText(opts.label, horizontalBars ? valuePix : chartArea.left + 4, horizontalBars ? chartArea.top - 4 : valuePix - 5);
        }
        ctx.restore();
    },
};

const VN_PERIOD_MAP = {
    '1d':  { interval: '5m',  range: '1d'  },
    '5d':  { interval: '1d',  range: '5d'  },
    '1mo': { interval: '1d',  range: '1mo' },
    '3mo': { interval: '1d',  range: '3mo' },
    '6mo': { interval: '1wk', range: '6mo' },
    '1y':  { interval: '1wk', range: '1y'  },
};
const VN_PERIOD_LABEL = { '1d': 'hoy', '5d': 'en 5 días', '1mo': 'en 1 mes', '3mo': 'en 3 meses', '6mo': 'en 6 meses', '1y': 'en 1 año' };
const VN_PERIOD_LABEL_SHORT = { '1d': 'hoy', '5d': '5d', '1mo': '1m', '3mo': '3m', '6mo': '6m', '1y': '1a' };
const VN_PERIOD_OPTIONS = [
    { value: '1d', label: '1D' }, { value: '5d', label: '5D' }, { value: '1mo', label: '1M' },
    { value: '3mo', label: '3M' }, { value: '6mo', label: '6M' }, { value: '1y', label: '1A' },
];
const VN_FORMAT_OPTIONS = [
    { value: 'pct', label: '%' }, { value: 'bps', label: 'PB' },
];

function vnEnsureFxPanelUI() {
    const panel = document.getElementById('fx-emerging-panel');
    if (!panel) return null;
    panel.classList.add('fx-panel-redesigned');
    const identity = panel.querySelector('.chart-panel-identity');
    const identityTitle = identity?.querySelector('strong');
    const identityCopy = identity?.querySelector('div > span');
    if (identityTitle) identityTitle.textContent = 'Divisas emergentes';
    if (identityCopy) identityCopy.textContent = 'Fortaleza relativa de ocho monedas internacionales frente al dólar';
    const canvasShell = panel.querySelector('.chart-canvas-shell');
    const explainer = document.getElementById('fx-em-period-lbl')?.parentElement;
    explainer?.classList.add('fx-chart-explainer');

    let insights = panel.querySelector('.fx-insights');
    if (!insights) {
        insights = document.createElement('div');
        insights.className = 'fx-insights';
        insights.setAttribute('aria-live', 'polite');
        insights.innerHTML = `
            <article class="fx-insight-card is-loading"><span>Más fuerte</span><strong>Consultando…</strong><small>Frente al USD</small></article>
            <article class="fx-insight-card is-loading"><span>Promedio canasta</span><strong>—</strong><small>8 divisas emergentes</small></article>
            <article class="fx-insight-card is-loading"><span>Más débil</span><strong>Consultando…</strong><small>Frente al USD</small></article>`;
        canvasShell?.before(insights);
    }
    let interactionStatus = panel.querySelector('.fx-interaction-status');
    if (!interactionStatus) {
        interactionStatus = document.createElement('div');
        interactionStatus.className = 'fx-interaction-status';
        interactionStatus.setAttribute('role', 'status');
        interactionStatus.setAttribute('aria-live', 'polite');
        interactionStatus.innerHTML = '<i class="fas fa-hand-pointer" aria-hidden="true"></i><span>Selecciona una tarjeta, barra o punto para consultar una divisa.</span>';
        canvasShell?.before(interactionStatus);
    }
    return insights;
}

function vnFocusFxCurrency(label, sourceElement) {
    const chart = _fxEmergingChart;
    if (!chart) return;
    const labels = chart.data.labels || [];
    const index = label ? labels.indexOf(label) : -1;
    const panel = document.getElementById('fx-emerging-panel');
    panel?.querySelectorAll('.fx-insight-card.is-selected').forEach(card => card.classList.remove('is-selected'));
    if (!sourceElement && label) {
        sourceElement = Array.from(panel?.querySelectorAll('.fx-insight-card[data-fx-label]') || []).find(card => card.dataset.fxLabel === label);
    }
    sourceElement?.classList?.add('is-selected');

    if (index < 0) {
        chart.setActiveElements([]);
        chart.tooltip?.setActiveElements([], { x: 0, y: 0 });
        chart.update('none');
        const status = panel?.querySelector('.fx-interaction-status span');
        if (status) status.textContent = 'Vista general restaurada: compara las ocho divisas frente al dólar.';
        return;
    }

    const active = [{ datasetIndex: 0, index }];
    chart.setActiveElements(active);
    chart.tooltip?.setActiveElements(active, { x: chart.chartArea?.left || 0, y: chart.chartArea?.top || 0 });
    chart.update('active');
    const value = chart.data.datasets[0]?.data?.[index];
    const unit = chart.data.datasets[0]?.label?.includes('puntos base') ? ' pb' : '%';
    const status = panel?.querySelector('.fx-interaction-status span');
    if (status) status.textContent = `${label}: ${typeof value === 'number' && value >= 0 ? '+' : ''}${typeof value === 'number' ? value.toFixed(unit === '%' ? 2 : 0) + unit : '—'} en el periodo seleccionado.`;
}

function vnHandleFxChartClick(_event, elements, chart) {
    const index = elements?.[0]?.index;
    if (index == null) return;
    vnFocusFxCurrency(chart.data.labels?.[index]);
}

function vnUpdateFxInsights(rows, mult, suffix, dec) {
    const insights = vnEnsureFxPanelUI();
    if (!insights) return;
    const valid = rows.filter(row => typeof row.pct === 'number');
    if (!valid.length) {
        insights.innerHTML = `<article class="fx-insight-card is-empty"><span>Canasta emergente</span><strong>Sin datos</strong><small>Intenta actualizar el periodo</small></article>`;
        return;
    }
    const strongest = valid.reduce((best, row) => row.pct > best.pct ? row : best);
    const weakest = valid.reduce((worst, row) => row.pct < worst.pct ? row : worst);
    const average = valid.reduce((sum, row) => sum + row.pct, 0) / valid.length;
    const format = value => `${value >= 0 ? '+' : ''}${(value * mult).toFixed(dec)}${suffix}`;
    const shortName = label => label.replace(/^\S+\s/, '');
    const card = (eyebrow, row, footnote) => `<button type="button" class="fx-insight-card ${row.pct >= 0 ? 'is-positive' : 'is-negative'}" data-fx-label="${row.label}" onclick="vnFocusFxCurrency(this.dataset.fxLabel, this)" aria-label="Resaltar ${shortName(row.label)}, ${format(row.pct)}">
        <span>${eyebrow}</span><strong>${shortName(row.label)}</strong><b>${format(row.pct)}</b><small>${footnote}</small>
    </button>`;
    insights.innerHTML = [
        card('Más fuerte', strongest, 'Mejor desempeño del periodo'),
        `<button type="button" class="fx-insight-card ${average >= 0 ? 'is-positive' : 'is-negative'}" onclick="vnFocusFxCurrency(null, this)" aria-label="Restaurar vista general"><span>Promedio canasta</span><strong>${format(average)}</strong><b>${valid.filter(row => row.pct >= 0).length} de ${valid.length} avanzan</b><small>Pulsa para restaurar la vista general</small></button>`,
        card('Más débil', weakest, 'Menor desempeño del periodo'),
    ].join('');
}

async function loadEmergingFX(rangeKey = '5d', fmt = 'pct') {
    const canvas = document.getElementById('fx-emerging-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_fxEmergingChart && _fxEmergingChart.canvas !== canvas) {
        try { _fxEmergingChart.destroy(); } catch {}
        _fxEmergingChart = null;
    }
    vnEnsureFxPanelUI();

    const FX = [
        { ticker: 'USDMXN=X', label: '🇲🇽 Peso Mexicano' },
        { ticker: 'USDBRL=X', label: '🇧🇷 Real Brasileño' },
        { ticker: 'USDCOP=X', label: '🇨🇴 Peso Colombiano' },
        { ticker: 'USDCLP=X', label: '🇨🇱 Peso Chileno' },
        { ticker: 'USDINR=X', label: '🇮🇳 Rupia India' },
        { ticker: 'USDZAR=X', label: '🇿🇦 Rand Sudafricano' },
        { ticker: 'USDTRY=X', label: '🇹🇷 Lira Turca' },
        { ticker: 'USDIDR=X', label: '🇮🇩 Rupia Indonesia' },
    ];

    const { interval, range } = VN_PERIOD_MAP[rangeKey] || VN_PERIOD_MAP['5d'];
    const periodLbl = document.getElementById('fx-em-period-lbl');
    if (periodLbl) periodLbl.textContent = VN_PERIOD_LABEL[rangeKey] || VN_PERIOD_LABEL['5d'];

    const results = await Promise.allSettled(FX.map(f =>
        rangeKey === '1d'
            ? fetchAssetData(f.ticker)
            : fetch(`/api/stock-history?ticker=${encodeURIComponent(f.ticker)}&interval=${interval}&range=${range}`)
                .then(r => r.ok ? r.json() : null).catch(() => null)
    ));

    const rows = FX.map((f, i) => {
        const res = results[i].status === 'fulfilled' ? results[i].value : null;
        let pct = null;
        if (res) {
            if (rangeKey === '1d') {
                const p = res.meta?.regularMarketChangePercent;
                pct = (typeof p === 'number') ? -p : null;
            } else {
                const closes = (res.candles || []).map(c => c.close).filter(v => v != null);
                if (closes.length >= 2 && closes[0]) pct = -(((closes[closes.length - 1] - closes[0]) / closes[0]) * 100);
            }
        }
        return { label: f.label, pct };
    });
    // Ordenado por magnitud (como un mapa de calor FX profesional), no por país fijo:
    // la divisa que más se mueve —al alza o a la baja— siempre queda arriba/abajo.
    rows.sort((a, b) => (b.pct ?? -Infinity) - (a.pct ?? -Infinity));

    const mult   = fmt === 'bps' ? 100 : 1;
    const suffix = fmt === 'bps' ? ' pb' : '%';
    const dec    = fmt === 'bps' ? 0 : 2;
    const labels = rows.map(r => r.label);
    const data   = rows.map(r => r.pct == null ? null : r.pct * mult);
    const colors = data.map(v => v == null ? '#cbd5e1' : v >= 0 ? '#16a34a' : '#dc2626');
    const label  = `Variación frente al USD (${fmt === 'bps' ? 'puntos base' : '%'})`;
    vnUpdateFxInsights(rows, mult, suffix, dec);

    // Promedio de la canasta EM completa — permite ver si una divisa se mueve
    // más o menos que el conjunto (p.ej. "todas suben, pero el peso menos que el promedio").
    const validPct = rows.map(r => r.pct).filter(v => v != null);
    const avgPct   = validPct.length ? validPct.reduce((s, v) => s + v, 0) / validPct.length : null;
    const avgLine  = avgPct != null
        ? { value: avgPct * mult, label: `Promedio canasta (${(avgPct * mult >= 0 ? '+' : '') + (avgPct * mult).toFixed(dec)}${suffix})`, color: 'rgba(100,116,139,.7)' }
        : null;

    if (_fxEmergingChart) {
        _fxEmergingChart.data.labels = labels;
        _fxEmergingChart.data.datasets[0].data = data;
        _fxEmergingChart.data.datasets[0].backgroundColor = colors;
        _fxEmergingChart.data.datasets[0].label = label;
        _fxEmergingChart.options.plugins.tooltip.callbacks.label = ctx => { const v = vnChartParsedValue(ctx); return ` ${v >= 0 ? '+' : ''}${v?.toFixed(dec)}${suffix}`; };
        _fxEmergingChart.options.plugins.vnAvgLine = avgLine;
        _fxEmergingChart.options.onClick = vnHandleFxChartClick;
        _fxEmergingChart.options.scales.x.ticks.callback = v => (typeof v === 'number' ? v.toFixed(dec) : v) + suffix;
        _fxEmergingChart.$vnNumericTick = _fxEmergingChart.options.scales.x.ticks.callback;
        vnApplyChartJsStyle('fx-emerging-chart', _fxEmergingChart, vnGetChartStyle('fx-emerging-chart'), false);
        _fxEmergingChart.update();
        return;
    }

    _fxEmergingChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        plugins: [vnAvgLinePlugin],
        data: {
            labels,
            datasets: [{
                label,
                data,
                backgroundColor: colors,
                borderRadius: 5,
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            onClick: vnHandleFxChartClick,
            onHover: (event, elements) => { if (event.native?.target) event.native.target.style.cursor = elements.length ? 'pointer' : 'default'; },
            plugins: {
                legend: { display: false },
                vnAvgLine: avgLine,
                tooltip: { callbacks: { label: ctx => { const v = vnChartParsedValue(ctx); return ` ${v >= 0 ? '+' : ''}${v?.toFixed(dec)}${suffix}`; } } },
            },
            scales: {
                x: {
                    ticks: {
                        callback: v => (typeof v === 'number' ? v.toFixed(dec) : v) + suffix,
                        font: { size: 10 },
                        maxTicksLimit: 5,
                        autoSkip: true,
                        maxRotation: 0
                    },
                    grid: { color: 'rgba(128,128,128,0.15)' },
                },
                y: {
                    ticks: { font: { size: 10 } },
                    grid: { display: false },
                },
            },
        },
    });
    _fxEmergingChart.$vnNumericTick = _fxEmergingChart.options.scales.x.ticks.callback;
    _fxEmergingChart = vnApplyChartJsStyle('fx-emerging-chart', _fxEmergingChart, vnGetChartStyle('fx-emerging-chart'));
}

let _moversChart = null;

async function loadTopMovers(periodKey = '1d', fmt = 'pct') {
    const GLOBAL_TICKERS = [
        { ticker: 'GFNORTEO.MX', label: '🇲🇽 Banorte' },
        { ticker: 'AMXB.MX',     label: '🇲🇽 América Móvil' },
        { ticker: 'FEMSAUBD.MX', label: '🇲🇽 FEMSA' },
        { ticker: 'CEMEXCPO.MX', label: '🇲🇽 Cemex' },

        { ticker: 'AAPL',  label: '🇺🇸 Apple' },
        { ticker: 'MSFT',  label: '🇺🇸 Microsoft' },
        { ticker: 'NVDA',  label: '🇺🇸 NVIDIA' },
        { ticker: 'TSLA',  label: '🇺🇸 Tesla' },

        { ticker: 'SAP.DE',  label: '🇩🇪 SAP' },
        { ticker: 'SHEL.L',  label: '🇬🇧 Shell' },
        { ticker: 'MC.PA',   label: '🇫🇷 LVMH' },
        { ticker: 'AZN.L',   label: '🇬🇧 AstraZeneca' },

        { ticker: '7203.T',     label: '🇯🇵 Toyota' },
        { ticker: '0700.HK',    label: '🇭🇰 Tencent' },
        { ticker: '005930.KS',  label: '🇰🇷 Samsung' },
        { ticker: '9988.HK',    label: '🇭🇰 Alibaba' },

        { ticker: 'PETR4.SA',     label: '🇧🇷 Petrobras' },
        { ticker: 'VALE3.SA',     label: '🇧🇷 Vale' },
        { ticker: 'RELIANCE.NS',  label: '🇮🇳 Reliance' },
    ];

    const { interval, range } = VN_PERIOD_MAP[periodKey] || VN_PERIOD_MAP['1d'];
    const results = await Promise.allSettled(GLOBAL_TICKERS.map(a =>
        periodKey === '1d'
            ? fetchAssetData(a.ticker)
            : fetch(`/api/stock-history?ticker=${encodeURIComponent(a.ticker)}&interval=${interval}&range=${range}`)
                .then(r => r.ok ? r.json() : null).catch(() => null)
    ));

    const rows = GLOBAL_TICKERS.map((a, i) => {
        const res = results[i].status === 'fulfilled' ? results[i].value : null;
        let pct = null;
        if (res) {
            if (periodKey === '1d') {
                pct = res.meta?.regularMarketChangePercent;
            } else {
                const closes = (res.candles || []).map(c => c.close).filter(v => v != null);
                if (closes.length >= 2 && closes[0]) pct = ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
            }
        }
        return { label: a.label, pct: (typeof pct === 'number') ? pct : null };
    }).filter(r => r.pct != null);

    // Promedio del universo COMPLETO muestreado (19 emisoras), no solo de las
    // 8 mostradas — da contexto de si el mercado en general sube o baja.
    const avgPct = rows.length ? rows.reduce((s, r) => s + r.pct, 0) / rows.length : null;

    rows.sort((a, b) => b.pct - a.pct);
    const gainers = rows.slice(0, 4);
    const losers  = rows.slice(-4).reverse();
    const combined = [...gainers, ...losers.slice().reverse()];

    const canvas = document.getElementById('movers-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_moversChart && _moversChart.canvas !== canvas) {
        try { _moversChart.destroy(); } catch {}
        _moversChart = null;
    }

    const mult   = fmt === 'bps' ? 100 : 1;
    const suffix = fmt === 'bps' ? ' pb' : '%';
    const dec    = fmt === 'bps' ? 0 : 2;
    const periodLbl = VN_PERIOD_LABEL[periodKey] || VN_PERIOD_LABEL['1d'];

    const labels = combined.map(r => r.label);
    const data   = combined.map(r => r.pct * mult);
    const colors = data.map(v => v >= 0 ? '#16a34a' : '#dc2626');
    const legend = document.getElementById('movers-period-lbl');
    if (legend) legend.textContent = periodLbl;
    const avgLine = avgPct != null
        ? { value: avgPct * mult, label: `Promedio (${(avgPct * mult >= 0 ? '+' : '') + (avgPct * mult).toFixed(dec)}${suffix})`, color: 'rgba(100,116,139,.7)' }
        : null;

    if (_moversChart) {
        _moversChart.data.labels = labels;
        _moversChart.data.datasets[0].data = data;
        _moversChart.data.datasets[0].backgroundColor = colors;
        _moversChart.data.datasets[0].label = `Variación ${periodLbl} (${fmt === 'bps' ? 'puntos base' : '%'})`;
        _moversChart.options.plugins.tooltip.callbacks.label = ctx => { const v = vnChartParsedValue(ctx); return ` ${v >= 0 ? '+' : ''}${v?.toFixed(dec)}${suffix}`; };
        _moversChart.options.plugins.vnAvgLine = avgLine;
        _moversChart.options.scales.x.ticks.callback = v => (typeof v === 'number' ? v.toFixed(dec) : v) + suffix;
        _moversChart.$vnNumericTick = _moversChart.options.scales.x.ticks.callback;
        vnApplyChartJsStyle('movers-chart', _moversChart, vnGetChartStyle('movers-chart'), false);
        _moversChart.update();
        return;
    }

    _moversChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        plugins: [vnAvgLinePlugin],
        data: {
            labels,
            datasets: [{
                label: `Variación ${periodLbl} (${fmt === 'bps' ? 'puntos base' : '%'})`,
                data,
                backgroundColor: colors,
                borderRadius: 5,
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                vnAvgLine: avgLine,
                tooltip: { callbacks: { label: ctx => { const v = vnChartParsedValue(ctx); return ` ${v >= 0 ? '+' : ''}${v?.toFixed(dec)}${suffix}`; } } },
            },
            scales: {
                x: {
                    ticks: { callback: v => (typeof v === 'number' ? v.toFixed(dec) : v) + suffix, font: { size: 10 } },
                    grid: { color: 'rgba(128,128,128,0.15)' },
                },
                y: {
                    ticks: { font: { size: 10 } },
                    grid: { display: false },
                },
            },
        },
    });
    _moversChart.$vnNumericTick = _moversChart.options.scales.x.ticks.callback;
    _moversChart = vnApplyChartJsStyle('movers-chart', _moversChart, vnGetChartStyle('movers-chart'));
}

// ─── Sorpresa Económica en Calendario ────────────────────────────────────────
function initCalendarSurprise() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    document.querySelectorAll('.cal-card[data-date]').forEach(card => {
        const cardDate = new Date(card.dataset.date + 'T00:00:00');
        const realVal  = (card.dataset.real || '').trim();
        const estNum   = parseFloat(card.dataset.estNum);
        const better   = card.dataset.betterWhen;
        const meta     = card.querySelector('.cal-card-meta');
        if (!meta) return;

        meta.querySelectorAll('.cal-real, .cal-upcoming-badge, .cal-today-badge').forEach(e => e.remove());
        const imp = meta.querySelector('.cal-card-imp');

        if (cardDate < today) {
            card.classList.add('cal-past');
            const pill = document.createElement('span');
            if (realVal) {
                const realNum = parseFloat(realVal);
                let cls = 'meet';
                if (better && !isNaN(estNum) && !isNaN(realNum)) {
                    const diff = realNum - estNum;
                    const beat = better === 'lower' ? diff < -0.05 : diff > 0.05;
                    const miss = better === 'lower' ? diff >  0.05 : diff < -0.05;
                    cls = beat ? 'beat' : miss ? 'miss' : 'meet';
                }
                pill.className = `cal-real ${cls}`;
                const label = cls === 'beat' ? '✓ Real:' : cls === 'miss' ? '✗ Real:' : '— Real:';
                pill.textContent = `${label} ${realVal}`;
            } else {
                pill.className = 'cal-real pending';
                pill.textContent = 'Real: pendiente';
            }
            if (imp) meta.insertBefore(pill, imp); else meta.appendChild(pill);

        } else if (cardDate.getTime() === today.getTime()) {
            const badge = document.createElement('span');
            badge.className = 'cal-today-badge';
            badge.textContent = '⚡ HOY';
            card.querySelector('.cal-card-date')?.appendChild(badge);

        } else {
            const daysLeft = Math.ceil((cardDate - today) / 86400000);
            const badge = document.createElement('span');
            badge.className = 'cal-upcoming-badge';
            badge.textContent = daysLeft === 1 ? 'Mañana' : `en ${daysLeft}d`;
            if (imp) meta.insertBefore(badge, imp); else meta.appendChild(badge);
        }
    });
}

const WL_KEY = 'vn3_wl_v1';
function wlLoad() { try { return JSON.parse(localStorage.getItem(WL_KEY)) || []; } catch { return []; } }
function wlSave(arr) { localStorage.setItem(WL_KEY, JSON.stringify(arr)); }

async function wlAdd() {
    const input = document.getElementById('wl-input');
    const ticker = (input?.value || '').trim().toUpperCase().replace(/[^A-Z0-9\-\^\.=]/g, '');
    if (!ticker || ticker.length > 20) return;
    const list = wlLoad();
    if (list.find(i => i.ticker === ticker)) { if (input) input.value = ''; return; }
    list.push({ ticker, alertPrice: null, alertDir: 'above' });
    wlSave(list);
    if (input) input.value = '';
    await wlRender();
}

function wlRemove(idx) {
    const list = wlLoad();
    list.splice(idx, 1);
    wlSave(list);
    wlRender();
}

function wlSetAlert(idx, price, dir) {
    const list = wlLoad();
    if (!list[idx]) return;
    list[idx].alertPrice = price ? parseFloat(price) : null;
    list[idx].alertDir   = dir || 'above';
    wlSave(list);
    wlRender();
}

function wlLoadInChart(ticker) {
    if (window.vnFinLoadTicker) window.vnFinLoadTicker(ticker);
    document.getElementById('bmv-chart')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function wlRender() {
    const list = wlLoad();
    const el = document.getElementById('wl-list');
    if (!el) return;
    if (!list.length) {
        el.innerHTML = '<div style="color:#94a3b8;font-size:.74rem;grid-column:1/-1;text-align:center;padding:1rem;border:1px dashed #e2e8f0;border-radius:8px;">Sin tickers. Agrega cualquier símbolo bursátil, divisa o cripto arriba.</div>';
        return;
    }

    el.innerHTML = list.map(item =>
        `<div class="wl-item" style="opacity:.55;pointer-events:none;">
            <div style="flex:1;min-width:0;">
                <span class="wl-ticker">${item.ticker}</span>
                <div class="wl-name sk-line" style="height:7px;width:80px;margin-top:4px;border-radius:4px;background:#e2e8f0;"></div>
            </div>
            <div style="display:flex;gap:.3rem;align-items:center;">
                <span class="wl-price sk-line" style="height:14px;width:48px;border-radius:4px;background:#e2e8f0;display:inline-block;"></span>
            </div>
        </div>`
    ).join('');

    const results = await Promise.allSettled(list.map(i => fetchAssetData(i.ticker)));

    el.innerHTML = list.map((item, idx) => {
        const d     = results[idx].status === 'fulfilled' ? results[idx].value : null;
        const price = d?.meta?.regularMarketPrice;
        const pct   = d?.meta?.regularMarketChangePercent;
        const name  = d?.meta?.longName || '';
        const isUp  = (pct ?? 0) >= 0;
        const pctStr  = pct != null ? (isUp ? '+' : '') + pct.toFixed(2) + '%' : '—';
        const priceStr = price != null
            ? (price >= 10000 ? price.toLocaleString('es-MX', { maximumFractionDigits: 0 })
             : price >= 1000  ? price.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
             : price >= 10    ? price.toFixed(2)
             : price.toFixed(4)) : '—';

        const nameHtml = name
            ? `<div class="wl-name">${name}</div>`
            : (price == null ? `<div class="wl-name" style="color:#f59e0b;" title="Verifica el símbolo: usa GFNORTEO.MX para BMV, BTC-USD para cripto, USDMXN=X para divisas">⚠ símbolo no encontrado</div>` : '<div class="wl-name"></div>');

        const triggered = item.alertPrice != null && price != null &&
            (item.alertDir === 'above' ? price >= item.alertPrice : price <= item.alertPrice);
        const alertBadge = triggered
            ? `<span class="wl-alert-badge wl-alert-ok">🔔 ${item.alertDir === 'above' ? '▲' : '▼'} ${item.alertPrice}</span>`
            : item.alertPrice != null
                ? `<span class="wl-alert-badge">${item.alertDir === 'above' ? '▲' : '▼'} ${item.alertPrice}</span>`
                : '';

        return `<div class="wl-item" data-wl-idx="${idx}" onclick="wlLoadInChart('${item.ticker.replace(/'/g,"\\'")}')">
            <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:.35rem;flex-wrap:wrap;">
                    <span class="wl-ticker">${item.ticker}</span>${alertBadge}
                </div>
                ${nameHtml}
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.22rem;">
                <div style="display:flex;gap:.3rem;align-items:center;">
                    <span class="wl-price">${priceStr}</span>
                    <span class="wl-pct ${price != null ? (isUp ? 'up' : 'down') : ''}">${pctStr}</span>
                    <button class="wl-rm" data-wl-rm="${idx}" title="Eliminar" onclick="event.stopPropagation();wlRemove(${idx})">✕</button>
                </div>
                <div style="display:flex;gap:.2rem;align-items:center;" onclick="event.stopPropagation()">
                    <select data-wl-dir="${idx}" style="font-size:.58rem;border:1px solid #e2e8f0;border-radius:4px;padding:1px 3px;outline:none;cursor:pointer;" onchange="wlSetAlert(${idx}, document.querySelector('[data-wl-price=\\'${idx}\\']')?.value, this.value)">
                        <option value="above" ${item.alertDir !== 'below' ? 'selected' : ''}>▲ ≥</option>
                        <option value="below" ${item.alertDir === 'below' ? 'selected' : ''}>▼ ≤</option>
                    </select>
                    <input data-wl-price="${idx}" type="number" placeholder="precio" step="any" value="${item.alertPrice ?? ''}"
                        style="width:66px;font-size:.6rem;border:1px solid #e2e8f0;border-radius:4px;padding:2px 5px;outline:none;font-family:'JetBrains Mono',monospace;"
                        onchange="wlSetAlert(${idx}, this.value, document.querySelector('[data-wl-dir=\\'${idx}\\']')?.value)"/>
                </div>
            </div>
        </div>`;
    }).join('');
}

async function wlRefreshPrices() {
    _assetDataCache.clear();
    await wlRender();
}

// Watchlist operativa v3: acciones explícitas para la SPA, estados de carga,
// resumen, minigráficas, alertas y exportación.
const WL_MAX_V3 = 30;
let _wlRenderTokenV3 = 0;
const _wlLastDataV3 = new Map();

function wlEscapeV3(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}
function wlNormalizeTickerV3(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9\-\^\.=]/g, '').slice(0, 20);
}
function wlToastV3(message, type = 'info') {
    const el = document.getElementById('wl-feedback');
    if (!el) return;
    el.textContent = message;
    el.className = `wl-feedback show ${type}`;
    clearTimeout(wlToastV3.timer);
    wlToastV3.timer = setTimeout(() => { el.className = 'wl-feedback'; }, 3200);
}
function wlStatusV3(message, state = 'ready') {
    const el = document.getElementById('wl-status');
    if (!el) return;
    el.dataset.state = state;
    const label = el.querySelector('span');
    if (label) label.textContent = message;
}
function wlSummaryV3(list, rows = []) {
    const valid = rows.filter(row => row?.meta?.regularMarketPrice != null);
    const values = {
        'wl-count': list.length,
        'wl-up-count': valid.filter(row => Number(row.meta.regularMarketChangePercent) >= 0).length,
        'wl-down-count': valid.filter(row => Number(row.meta.regularMarketChangePercent) < 0).length,
        'wl-alert-count': list.filter(item => item.alertPrice != null).length,
    };
    Object.entries(values).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value; });
}
function wlPriceV3(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    return n >= 10000 ? n.toLocaleString('es-MX', { maximumFractionDigits: 0 })
        : n >= 1000 ? n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : n >= 10 ? n.toFixed(2) : n.toFixed(4);
}
function wlSparklineV3(candles, isUp) {
    const values = (Array.isArray(candles) ? candles : []).map(c => Number(c?.close)).filter(Number.isFinite);
    if (values.length < 2) return '<div class="wl-spark-empty">Sin historial</div>';
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const points = values.map((v, i) => `${(i / (values.length - 1) * 100).toFixed(1)},${(28 - ((v - min) / span * 24)).toFixed(1)}`).join(' ');
    return `<svg class="wl-spark ${isUp ? 'up' : 'down'}" viewBox="0 0 100 32" preserveAspectRatio="none" aria-label="Tendencia de cinco sesiones"><polyline points="${points}"/></svg>`;
}

wlAdd = async function wlAddV3(rawTicker) {
    const input = document.getElementById('wl-input');
    const ticker = wlNormalizeTickerV3(rawTicker ?? input?.value);
    if (!ticker) { wlToastV3('Escribe un ticker válido, por ejemplo AAPL o BTC-USD.', 'error'); input?.focus(); return; }
    const list = wlLoad();
    if (list.some(item => item.ticker === ticker)) { if (input) input.value = ''; wlToastV3(`${ticker} ya está en tu watchlist.`); return; }
    if (list.length >= WL_MAX_V3) { wlToastV3(`Puedes seguir hasta ${WL_MAX_V3} activos.`, 'error'); return; }
    list.push({ ticker, alertPrice: null, alertDir: 'above' });
    wlSave(list);
    if (input) input.value = '';
    wlToastV3(`${ticker} agregado. Consultando precio…`, 'success');
    await wlRender();
};
function wlAddPreset(ticker) { return wlAdd(ticker); }

wlRemove = function wlRemoveV3(idx) {
    const list = wlLoad();
    const removed = list[idx]?.ticker;
    if (!removed) return;
    list.splice(idx, 1);
    wlSave(list);
    _wlLastDataV3.delete(removed);
    wlToastV3(`${removed} eliminado.`);
    wlRender();
};
function wlClear() {
    const list = wlLoad();
    if (!list.length) { wlToastV3('La watchlist ya está vacía.'); return; }
    if (!window.confirm('¿Eliminar todos los activos de tu watchlist?')) return;
    wlSave([]);
    _wlLastDataV3.clear();
    wlToastV3('Watchlist vaciada.');
    wlRender();
}

wlSetAlert = function wlSetAlertV3(idx, price, dir) {
    const list = wlLoad();
    if (!list[idx]) return;
    const parsed = price === '' || price == null ? null : Number(price);
    list[idx].alertPrice = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    list[idx].alertDir = dir === 'below' ? 'below' : 'above';
    wlSave(list);
    wlToastV3(list[idx].alertPrice == null ? `Alerta de ${list[idx].ticker} desactivada.` : `Alerta de ${list[idx].ticker} guardada.`, 'success');
    wlRender();
};

wlLoadInChart = function wlLoadInChartV3(ticker) {
    if (typeof window.vnFinLoadTicker === 'function') {
        window.vnFinLoadTicker(ticker);
        document.getElementById('bmv-chart')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        wlToastV3(`${ticker} cargado en el gráfico.`, 'success');
    } else {
        wlToastV3(`Cotización de ${ticker} lista. El gráfico detallado aún está iniciando.`);
    }
};

function wlExportCsv() {
    const list = wlLoad();
    if (!list.length) { wlToastV3('Agrega activos antes de exportar.'); return; }
    const safe = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [['Ticker','Nombre','Precio','Moneda','Cambio %','Alerta','Condición']];
    list.forEach(item => {
        const data = _wlLastDataV3.get(item.ticker);
        rows.push([item.ticker, data?.meta?.longName || '', data?.meta?.regularMarketPrice ?? '', data?.meta?.currency || '', data?.meta?.regularMarketChangePercent ?? '', item.alertPrice ?? '', item.alertDir === 'below' ? 'Menor o igual' : 'Mayor o igual']);
    });
    const csv = '\uFEFF' + rows.map(row => row.map(safe).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `vallnews-watchlist-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    wlToastV3('Watchlist exportada a CSV.', 'success');
}

wlRender = async function wlRenderV3() {
    const token = ++_wlRenderTokenV3;
    const list = wlLoad();
    const el = document.getElementById('wl-list');
    if (!el) return;
    wlSummaryV3(list);
    if (!list.length) {
        wlStatusV3('Sin activos', 'empty');
        el.innerHTML = '<div class="wl-empty"><i class="fas fa-chart-line"></i><strong>Crea tu primera lista de seguimiento</strong><span>Usa el buscador o agrega rápidamente un índice, divisa, criptoactivo o materia prima.</span></div>';
        return;
    }

    wlStatusV3('Actualizando cotizaciones…', 'loading');
    el.setAttribute('aria-busy', 'true');
    el.innerHTML = list.map(item => `<div class="wl-item wl-loading"><div><span class="wl-ticker">${wlEscapeV3(item.ticker)}</span><div class="wl-name sk-line"></div></div><span class="wl-price sk-line"></span></div>`).join('');
    const results = await Promise.allSettled(list.map(item => fetchAssetData(item.ticker)));
    if (token !== _wlRenderTokenV3 || !document.body.contains(el)) return;
    const rows = results.map(result => result.status === 'fulfilled' ? result.value : null);
    rows.forEach((data, idx) => { if (data) _wlLastDataV3.set(list[idx].ticker, data); });
    wlSummaryV3(list, rows);

    el.innerHTML = list.map((item, idx) => {
        const data = rows[idx];
        const price = data?.meta?.regularMarketPrice;
        const pct = Number(data?.meta?.regularMarketChangePercent);
        const hasPct = Number.isFinite(pct);
        const isUp = !hasPct || pct >= 0;
        const name = data?.meta?.longName || (price == null ? 'Símbolo no encontrado' : item.ticker);
        const currency = data?.meta?.currency || '';
        const pctStr = hasPct ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '—';
        const triggered = item.alertPrice != null && price != null && (item.alertDir === 'above' ? price >= item.alertPrice : price <= item.alertPrice);
        const alertBadge = item.alertPrice == null ? '' : `<span class="wl-alert-badge ${triggered ? 'wl-alert-ok' : ''}">${triggered ? '<i class="fas fa-bell"></i>' : ''}${item.alertDir === 'above' ? '≥' : '≤'} ${wlPriceV3(item.alertPrice)}</span>`;
        const error = price == null;
        const safeTicker = wlEscapeV3(item.ticker);
        return `<article class="wl-item ${error ? 'wl-error' : ''}" data-wl-idx="${idx}" tabindex="0" role="button" aria-label="Abrir ${safeTicker} en el gráfico" onclick="wlLoadInChart('${safeTicker}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();wlLoadInChart('${safeTicker}')}">
            <div class="wl-card-main">
                <div class="wl-card-title"><span class="wl-ticker">${safeTicker}</span>${alertBadge}</div>
                <div class="wl-name">${error ? '<i class="fas fa-triangle-exclamation"></i> ' : ''}${wlEscapeV3(name)}</div>
                ${wlSparklineV3(data?.candles, isUp)}
            </div>
            <div class="wl-card-values">
                <div><span class="wl-price">${wlPriceV3(price)}</span><small>${wlEscapeV3(currency)}</small></div>
                <span class="wl-pct ${hasPct ? (isUp ? 'up' : 'down') : ''}">${pctStr}</span>
                <button class="wl-rm" type="button" title="Eliminar ${safeTicker}" onclick="event.stopPropagation();wlRemove(${idx})"><i class="fas fa-xmark"></i></button>
            </div>
            <div class="wl-alert-editor" onclick="event.stopPropagation()">
                <label><span>Avísame cuando</span><select data-wl-dir="${idx}" onchange="wlSetAlert(${idx},document.querySelector('[data-wl-price=\\'${idx}\\']')?.value,this.value)"><option value="above" ${item.alertDir !== 'below' ? 'selected' : ''}>suba a ≥</option><option value="below" ${item.alertDir === 'below' ? 'selected' : ''}>baje a ≤</option></select></label>
                <input data-wl-price="${idx}" aria-label="Precio de alerta para ${safeTicker}" type="number" min="0" step="any" placeholder="Precio" value="${item.alertPrice ?? ''}" onchange="wlSetAlert(${idx},this.value,document.querySelector('[data-wl-dir=\\'${idx}\\']')?.value)">
            </div>
        </article>`;
    }).join('');
    el.removeAttribute('aria-busy');
    const available = rows.filter(row => row?.meta?.regularMarketPrice != null).length;
    const now = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    wlStatusV3(`${available}/${list.length} cotizaciones · ${now}`, available ? 'ready' : 'error');
};

wlRefreshPrices = async function wlRefreshPricesV3() {
    const button = document.getElementById('wl-refresh-btn');
    button?.setAttribute('disabled', '');
    button?.classList.add('is-loading');
    _assetDataCache.clear();
    try { await wlRender(); wlToastV3('Cotizaciones actualizadas.', 'success'); }
    finally { button?.removeAttribute('disabled'); button?.classList.remove('is-loading'); }
};

Object.assign(window, { wlAdd, wlAddPreset, wlRemove, wlClear, wlSetAlert, wlLoadInChart, wlExportCsv, wlRefreshPrices, wlRender });

const REFRESH_MS = 20 * 60 * 1000;  
async function loadMacroMexico() {
    try {
        const [dxyR, tbillR] = await Promise.allSettled([
            fetch('/api/stock-history?ticker=DX-Y.NYB&interval=1d&range=5d').then(r => r.ok ? r.json() : null).catch(() => null),
            fetch('/api/stock-history?ticker=^IRX&interval=1d&range=5d').then(r => r.ok ? r.json() : null).catch(() => null),
        ]);

        // 1. DXY · Índice del Dólar
        const dxyData   = dxyR.status === 'fulfilled' ? dxyR.value : null;
        const dxyCurr   = dxyData?.meta?.regularMarketPrice ?? null;
        const dxyQuotes = dxyData?.quotes ?? [];
        const dxyPrev   = dxyQuotes.length >= 2 ? (dxyQuotes[dxyQuotes.length - 2]?.close ?? null) : null;

        const resEl    = document.getElementById('res-val');
        const resChgEl = document.getElementById('res-chg');
        if (resEl && dxyCurr != null) {
            resEl.textContent = dxyCurr.toFixed(2);
            if (resChgEl && dxyPrev != null) {
                const diff = dxyCurr - dxyPrev;
                const pct  = diff / dxyPrev * 100;
                resChgEl.textContent = (diff >= 0 ? '▲' : '▼') + ' ' + Math.abs(pct).toFixed(2) + '% vs ayer';
                resChgEl.className   = diff >= 0 ? 'up' : 'down';
            }
        }
        const tbillData   = tbillR.status === 'fulfilled' ? tbillR.value : null;
        const tbill4w     = tbillData?.meta?.regularMarketPrice ?? null;
        const tbillQuotes = tbillData?.quotes ?? [];
        const tbillPrev   = tbillQuotes.length >= 2 ? (tbillQuotes[tbillQuotes.length - 2]?.close ?? null) : null;
        const flujosEl    = document.getElementById('flujos-val');
        const flujosChgEl = document.getElementById('flujos-chg');
        if (flujosEl && tbill4w != null) {
            flujosEl.textContent = tbill4w.toFixed(2) + '%';
            if (flujosChgEl && tbillPrev != null) {
                const diff = tbill4w - tbillPrev;
                flujosChgEl.textContent      = (diff >= 0 ? '▲' : '▼') + ' ' + Math.abs(diff).toFixed(2) + 'pp vs ayer';
                flujosChgEl.className        = diff >= 0 ? 'up' : 'down';
                flujosChgEl.style.fontWeight = '700';
                flujosChgEl.style.fontSize   = '.62rem';
            }
        }
        // Leer tasas desde CENTRAL_BANKS (actualizado dinámicamente por _syncCentralBanksFromBondData)
        const euribor = CENTRAL_BANKS.bce;
        const boe     = CENTRAL_BANKS.boe;
        const boj     = CENTRAL_BANKS.boj;
        const compareEl = document.getElementById('tbill-compare');
        if (compareEl) {
            const items = [
                { label: '🇺🇸 T-Bill 4W',  val: tbill4w, note: 'EE.UU. · US Treasury' },
                { label: '🇪🇺 Euribor 3M', val: euribor, note: 'Zona Euro · BCE' },
                { label: '🇬🇧 BOE Rate',   val: boe,     note: 'Reino Unido · Bank of England' },
                { label: '🇯🇵 BOJ Rate',   val: boj,     note: 'Japón · Bank of Japan' },
            ].filter(i => i.val != null);

            const maxVal = Math.max(...items.map(i => i.val));
            compareEl.innerHTML = items.map(i => {
                const isWinner = i.val === maxVal;
                const barW = (i.val / maxVal * 100).toFixed(1);
                return `<div style="background:#f8fafc;border:1px solid ${isWinner ? 'rgba(22,163,74,.25)' : '#e2e8f0'};border-radius:7px;padding:.38rem .65rem;position:relative;overflow:hidden;">
                    <div style="position:absolute;bottom:0;left:0;height:3px;width:${barW}%;background:${isWinner ? '#16a34a' : '#00213a'};opacity:.5;"></div>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <div style="font-size:.7rem;font-weight:700;color:#1e293b;">${i.label} ${isWinner ? '<span style="font-size:.5rem;background:rgba(22,163,74,.15);color:#15803d;padding:1px 5px;border-radius:3px;font-weight:800;">MAYOR</span>' : ''}</div>
                            <div style="font-size:.56rem;color:#94a3b8;">${i.note}</div>
                        </div>
                        <span style="font-family:'JetBrains Mono',monospace;font-size:.88rem;font-weight:800;color:${isWinner ? '#15803d' : '#00213a'};">${i.val.toFixed(2)}%</span>
                    </div>
                </div>`;
            }).join('');
        }
        const noteEl = document.getElementById('reservas-note');
        if (noteEl) {
            const dxyNote  = dxyCurr != null
                ? `DXY en ${dxyCurr.toFixed(2)} — ${dxyCurr > 104 ? 'dólar fuerte, presión sobre commodities y emergentes' : dxyCurr > 100 ? 'dólar en zona neutral' : 'dólar débil, favorece activos de riesgo'}. `
                : '';
            const tbNote   = tbill4w != null ? `T-Bill 4W al ${tbill4w.toFixed(2)}% — ` : '';
            const diffNote = tbill4w != null
                ? `diferencial vs Euribor: ${(tbill4w - euribor) >= 0 ? '+' : ''}${(tbill4w - euribor).toFixed(2)}pp; vs BoE: ${(tbill4w - boe) >= 0 ? '+' : ''}${(tbill4w - boe).toFixed(2)}pp.`
                : 'Tasas de bancos centrales cargando…';
            noteEl.innerHTML = `<i class="fas fa-robot"></i> ${dxyNote}${tbNote}${diffNote}`;
        }
        _macroIntData = { dxyCurr, dxyPrev, tbill4w, tbillPrev, euribor, boe, boj };
    } catch (e) {
        console.error('loadMacroMexico error:', e);
    }
}


async function refreshAll() {
    _assetDataCache.clear();
    // VDS Banxico tiene TTL propio de 6h — no forzar clear aquí para evitar re-fetches innecesarios

    cargarFinanzas().catch(e => console.error('cargarFinanzas error:', e));
    loadMktCap().catch(e => console.error('loadMktCap error:', e));
    updateTicker().catch(e => console.error('updateTicker error:', e));
    loadBonds().catch(e => console.error('loadBonds error:', e));
    loadRiskPanel().then(updateGeneralKPIs).catch(e => console.error('loadRiskPanel error:', e));
    loadMarketForecasts().catch(e => console.error('loadMarketForecasts error:', e));
    loadTopMovers().catch(e => console.error('loadTopMovers error:', e));
    loadEmergingFX().catch(e => console.error('loadEmergingFX error:', e));
    loadCreditRisk().catch(e => console.error('loadCreditRisk error:', e));
    loadPetroleo().then(updateGeneralKPIs).catch(e => console.error('loadPetroleo error:', e));
    loadBolsaNews().then(updateGeneralKPIs).catch(e => console.error('loadBolsaNews error:', e));
    loadMacroMexico().catch(e => console.error('loadMacroMexico error:', e));
    loadFxStrip().then(updateGeneralKPIs).catch(e => console.error('loadFxStrip error:', e));
    loadBitcoinDominance().catch(e => console.error('loadBitcoinDominance error:', e));
}

function updateGeneralKPIs() {
    try {
        const safe = (v, s) => (v != null && !isNaN(+v)) ? (+v).toFixed(2) + (s || '') : '—';
        const g = id => document.getElementById(id);

        // Hub card metrics — México
        if (g('hub-tiie')) g('hub-tiie').textContent = safe(_rds.tiie, '%');
        if (g('hub-vix'))  g('hub-vix').textContent  = _rds.vix != null ? (+_rds.vix).toFixed(1) : '—';
        if (g('hub-fed'))  g('hub-fed').textContent  = safe(CENTRAL_BANKS.fed, '%');
        if (g('hub-bce'))  g('hub-bce').textContent  = safe(CENTRAL_BANKS.bce, '%');
        if (g('hub-boe'))  g('hub-boe').textContent  = safe(CENTRAL_BANKS.boe, '%');

        if (_fxData && _fxData[0]?.price) {
            const usdmxn = '$' + _fxData[0].price.toFixed(2);
            if (g('hub-usdmxn'))     g('hub-usdmxn').textContent     = usdmxn;
            if (g('hub-hdr-usdmxn')) g('hub-hdr-usdmxn').textContent = usdmxn;
        }
        if (g('hub-hdr-vix') && _rds.vix != null) {
            g('hub-hdr-vix').textContent = (+_rds.vix).toFixed(1);
        }
        if (g('hub-hdr-fed')) {
            g('hub-hdr-fed').textContent = CENTRAL_BANKS.fed.toFixed(2) + '%';
        }
        const wtiEl = g('p-wti');
        if (g('hub-wti') && wtiEl && wtiEl.textContent !== '--') {
            g('hub-wti').textContent = wtiEl.textContent;
        }

        // S&P 500 — mkt-pulse second card (^GSPC), price is children[1]
        const pulseCards = document.querySelectorAll('#mkt-pulse > div');
        if (pulseCards.length >= 2) {
            const v = pulseCards[1]?.children?.[1];
            if (v && v.textContent && v.textContent !== '—') {
                if (g('hub-sp500-chip')) g('hub-sp500-chip').textContent = v.textContent;
                if (g('hub-hdr-sp500'))  g('hub-hdr-sp500').textContent  = v.textContent;
            }
        }

        // Spread TIIE − Fed
        if (g('hub-spread') && _rds.tiie != null) {
            const sp = (+_rds.tiie - CENTRAL_BANKS.fed);
            g('hub-spread').textContent = (sp >= 0 ? '+' : '') + sp.toFixed(2) + '%';
        }

        // Bonos hub card
        const tnxVal = _rds.tnx ?? null;
        if (g('hub-hdr-us10y') && tnxVal != null) {
            g('hub-hdr-us10y').textContent = (+tnxVal).toFixed(2) + '%';
        }
        if (g('hub-bnd-tnx') && tnxVal != null) {
            g('hub-bnd-tnx').textContent = (+tnxVal).toFixed(2) + '%';
        }
        if (g('hub-bnd-premium') && _rds.tiie != null) {
            const ref  = tnxVal ?? CENTRAL_BANKS.fed;
            const prem = (+_rds.tiie - ref);
            g('hub-bnd-premium').textContent = (prem >= 0 ? '+' : '') + prem.toFixed(2) + ' pp';
        }
    } catch(e) { console.warn('updateGeneralKPIs:', e); }
}

function finTab(name, btnEl) {
    document.querySelectorAll('.fin-tab-card').forEach(b => b.classList.remove('active'));
    const activeBtn = btnEl || document.querySelector(`.fin-tab-card[data-tab="${name}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Hub = solo los 4 recuadros; secciones = mostrar barra de tabs para navegar
    const tabNav = document.querySelector('.fin-tabs-nav');
    if (tabNav) tabNav.style.display = name === 'general' ? 'none' : '';

    const g  = id => document.getElementById(id);
    const bg = g('fin-bottom-grid');

    // Reset: hide all content blocks
    ['pane-general','fin-layout-wrap','watchlist-panel','bolsa-news-panel','bonds-panel','calendar-panel-main', 'global-dense-wrapper', 'bonds-dense-wrapper'].forEach(id => {
        const el = g(id); if (el) el.style.display = 'none';
    });
    if (bg) { bg.style.display = 'none'; bg.classList.remove('only-left','only-right'); }

    // Reset all bottom-grid inner panels to visible (tab logic will re-hide as needed)
    ['petroleo-panel','mkt-cap-panel','fx-emerging-panel','reservas-panel','risk-panel','credit-panel','movers-panel'].forEach(id => {
        const el = g(id); if (el) el.style.display = '';
    });

    if (name === 'general') {
        const pg = g('pane-general'); if (pg) pg.style.display = '';
        updateGeneralKPIs();

    } else if (name === 'mercados') {
        const gdw = g('global-dense-wrapper'); if (gdw) gdw.style.display = '';
        if (bg) { bg.style.display = 'none'; }
        const wl = g('watchlist-panel'); if(wl) wl.style.display = '';
        // El chart BMV se crea mientras su contenedor está oculto; al mostrarlo
        // hay que forzar que recalcule tamaño y vuelva a dibujar las velas.
        setTimeout(() => {
            const bmv = g('bmv-chart');
            if (bmv && bmv.resize) bmv.resize();
            ['fx-emerging-chart', 'movers-chart'].forEach(id => {
                const chart = vnGetChartJsInstance(id);
                if (chart?.canvas?.isConnected) {
                    chart.resize();
                    chart.update('none');
                }
            });
        }, 60);
        // Igual el carrusel de noticias: recién visible es cuando .nview tiene
        // su alto real (estirado a la par de la gráfica BMV) para saber cuántas
        // tarjetas caben de verdad.
        setTimeout(() => { if (typeof _ncPositionStack === 'function') _ncPositionStack(); }, 80);

    } else if (name === 'bonos') {
        const bdw = g('bonds-dense-wrapper'); if (bdw) bdw.style.display = '';
        ['bonds-panel', 'calendar-panel-main'].forEach(id => {
            const el = g(id); if (el) el.style.display = '';
        });
        if (bg) bg.style.display = 'none';
        setTimeout(() => {
            if (_bondsCurveChart?.canvas?.isConnected) {
                _bondsCurveChart.resize();
                _bondsCurveChart.update('none');
            }
        }, 60);

    } else if (name === 'riesgo') {
        if (bg) { bg.style.display = 'grid'; bg.classList.add('only-right'); }
        ['petroleo-panel','mkt-cap-panel','fx-emerging-panel','movers-panel'].forEach(id => {
            const el = g(id); if (el) el.style.display = 'none';
        });
    }

    try { localStorage.setItem('fin_active_tab', name); } catch(e) {}
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

(async () => {
    // Restore last active tab (default: general)
    const saved = (() => { try { return localStorage.getItem('fin_active_tab'); } catch(e) { return null; } })();
    const startTab = ['general','mexico','mercados','bonos','riesgo'].includes(saved) ? saved : 'general';
    finTab(startTab, document.querySelector(`.fin-tab-card[data-tab="${startTab}"]`));
    initChartStyleControls();

    await refreshAll();
    initCalendarSurprise();
    wlRender();
    updateGeneralKPIs();

    setInterval(refreshAll, 15 * 60 * 1000);
    setInterval(() => VDS.clear(FIN_CK), REFRESH_MS);
    setInterval(updateGeneralKPIs, 5 * 60 * 1000);
})();

// React conserva los scripts legacy entre rutas. Cuando Finanzas vuelve a
// montarse, el HTML y los canvas sí son nuevos; esta entrada pública vuelve a
// enlazar controles y datos sin recargar todo el documento.
window.vnReinitializeFinanzasCharts = async function () {
    initBmvChartWorkbench();
    initMktCapFilters();
    initMktCapChartStyleControls();
    initChartStyleControls();
    await refreshAll();
    const saved = (() => { try { return localStorage.getItem('fin_active_tab'); } catch { return null; } })();
    const active = ['general','mercados','bonos','riesgo'].includes(saved) ? saved : 'general';
    finTab(active, document.querySelector(`.fin-tab-card[data-tab="${active}"]`));
};


/* ---- bloque ---- */


const CAL_PROFILES = {
  banxico: {
    icon:'🏦', category:'Politica Monetaria · Mexico',
    context:'La Junta de Gobierno de Banxico se reune cada 6 semanas para decidir la Tasa de Interes Interbancaria de Equilibrio (TIIE). Sus decisiones afectan directamente el costo de todos los creditos en Mexico y el atractivo del peso para inversores extranjeros via carry trade.',
    methodology:'Banxico vota por mayoria de 5 miembros. La lect    ura hawkish (pausa/alza) fortalece el peso; la dovish (recorte) lo debilita. El diferencial TIIE-Fed Funds determina el carry trade MXN-USD.',
    keyQuestions:['¿Se mantiene el diferencial con la Fed?','¿La inflacion converge a la meta del 3%?','¿Hay riesgos externos: USMCA, aranceles?','¿Comunicado mas hawkish o dovish vs reunion anterior?'],
    markets:[
      {a:'USD/MXN', beat:'Aprecia peso (carry atractivo)', miss:'Deprecia peso (menor carry)'},
      {a:'IPC BMV', beat:'Sube (menor costo de capital)', miss:'Baja (presion en valuaciones)'},
      {a:'Mbonos', beat:'Precios bajan (tasas suben)', miss:'Precios suben (tasas bajan)'},
      {a:'TIIE 28D', beat:'Alza si hawkish', miss:'Recorte si dovish'},
    ],
  },
  fomc: {
    icon:'🏛', category:'Politica Monetaria · EE.UU.',
    context:'El Comite Federal de Mercado Abierto (FOMC) se reune 8 veces al ano. Sus decisiones determinan el costo del dinero global. El lenguaje del comunicado y la conferencia de prensa de Powell tienen tanto peso como la decision en si.',
    methodology:'El FOMC vota por mayoria. El dot plot proyecta expectativas de tasas a futuro. El mercado descuenta probabilidades via futuros de Fed Funds (CME FedWatch Tool).',
    keyQuestions:['¿El dot plot cambio vs reunion anterior?','¿Powell fue hawkish (mas restriccion) o dovish (menos)?','¿Hay disidentes en el voto?','¿Se menciono el balance sheet (QT/QE)?'],
    markets:[
      {a:'DXY / Dolar', beat:'DXY s     ube (hawkish/alza)', miss:'DXY cae (dovish/recorte)'},
      {a:'S&P 500', beat:'Cae con hawkish', miss:'Sube con dovish/recorte'},
      {a:'T-Note 10Y', beat:'Rend. sube con hawkish', miss:'Rend. baja con dovish'},
      {a:'USD/MXN', beat:'Peso se deprecia', miss:'Peso se aprecia'},
      {a:'Oro (XAU/USD)', beat:'Baja con hawkish', miss:'Sube con dovish'},
    ],
  },
  pce: {
    icon:'📊', category:'Inflacion · EE.UU. (Favorito Fed)',
    context:'El PCE (Personal Consumption Expenditures) es el indicador de inflacion favorito de la Fed, mas amplio que el CPI. El PCE core (sin alimentos ni energia) es el que realmente guia las decisiones del FOMC. Un PCE elevado retrasa los recortes.',
    methodology:'Se publica mensualmente por la BEA. Un resultado mayor al estimado = inflacion persistente = Fed hawkish. Un resultado menor al estimado = camino libre para recortes.',
    keyQuestions:['¿PCE core mayor o menor a 2% meta de la Fed?','¿Presion en servicios o bienes?','¿Implicaciones para el siguiente FOMC?','¿Cambia el dot plot implicitamente?'],
    markets:[
      {a:'T-Note 10Y', beat:'Rend. sube (menos recortes)', miss:'Rend. baja (mas recortes)'},
      {a:'DXY / Dolar', beat:'Dolar sube', miss:'Dolar baja'},
      {a:'S&P 500', beat:'Cae (recortes mas lejanos)', miss:'Sube (recortes mas cercanos)'},
      {a:'USD/MXN', beat:'Peso se deprecia', miss:'Peso se aprecia'},
      {a:'Oro', beat:'Baja', miss:'Sube'},
    ],
  },
  cpi_us: {
    icon:'📈', category:'Inflacion · EE.UU.',
    context:'El Indice de Precios al Consumidor (CPI) de EE.UU. es el indicador de inflacion de mayor impacto de mercado. El CPI core (sin alimentos/energia) es lo que mas vigila el mercado. Un dato por encima del estimado aleja los recortes de tasas.',
    methodology:'Publicado por la BLS. Core CPI y Supercore (servicios ex-vivienda) son los componentes clave. Meta implicita de la Fed: ~2% en PCE (equivale a ~2.3% CPI).',
    keyQuestions:['¿Supercore CPI a la baja?','¿Componente de vivienda (shelter) cediendo?','¿Impacto de aranceles visible en bienes?','¿Cambia el pricing del FOMC?'],
    markets:[
      {a:'T-Note 10Y', beat:'Rend. sube', miss:'Rend. baja'},
      {a:'DXY', beat:'Sube', miss:'Baja'},
      {a:'S&P 500', beat:'Cae', miss:'Sube'},
      {a:'USD/MXN', beat:'Peso se deprecia', miss:'Peso se aprecia'},
      {a:'Cripto (BTC)', beat:'Baja (risk-off)', miss:'Sube (risk-on)'},
    ],
  },
  nfp: {
    icon:'💼', category:'Mercado Laboral · EE.UU.',
    context:'El Non-Farm Payrolls (NFP) es el reporte de empleo mas importante del mundo. Se publica el primer viernes de cada mes. Mueve simultaneamente al dolar, bonos, acciones y materias primas. Incluye la tasa de desempleo y el crecimiento salarial.',
    methodology:'Publicado por la BLS. Un NFP mayor al estimado = economia fuerte = Fed hawkish. Pero si los salarios tambien suben, aumenta la inflacion. El numero de revisiones del mes anterior tambien importa.',
    keyQuestions:['¿Crecimiento salarial (wage growth) mayor o menor a 3.5%?','¿Participacion laboral cambia?','¿El sector mas debil es manufactura o servicios?','¿Revision del mes anterior fue negativa?'],
    markets:[
      {a:'DXY / Dolar', beat:'Sube (economia solida)', miss:'Cae (economia debil)'},
      {a:'T-Note 10Y', beat:'Rend. sube (menos recortes)', miss:'Rend. baja (mas recortes)'},
      {a:'S&P 500', beat:'Mixto (bueno econ., malo para Fed)', miss:'Mixto (malo econ., bueno para Fed)'},
      {a:'USD/MXN', beat:'Peso puede debilitarse', miss:'Peso puede fortalecerse'},
      {a:'Petroleo WTI', beat:'Sube (demanda solida)', miss:'Baja (demanda debil)'},
    ],
  },
  inpc: {
    icon:'🛒', category:'Inflacion · Mexico',
    context:'El Indice Nacional de Precios al Consumidor (INPC) mide la inflacion en Mexico. La meta de Banxico es 3% +/- 1 punto porcentual. Un INPC por debajo del estimado da margen a Banxico para recortar la TIIE y apoyar el crecimiento.',
    methodology:'Publicado por INEGI quincenalmente y mensualmente. La inflacion subyacente (sin energia y agropecuarios) es la que mas vigila Banxico. Meta: 3% con intervalo 2%-4%.',
    keyQuestions:['¿Inflacion subyacente menor a 4%?','¿Presion en alimentos o servicios?','¿Da margen Banxico para continuar recortes?','¿Convergencia con meta del 3% en 2026?'],
    markets:[
      {a:'USD/MXN', beat:'Peso aprecia (mas recortes Banxico)', miss:'Peso deprecia (Banxico pausa)'},
      {a:'IPC BMV', beat:'Sube (menor costo capital)', miss:'Baja (tasas altas mas tiempo)'},
      {a:'Mbonos', beat:'Precios suben (rend. bajan)', miss:'Precios bajan (rend. suben)'},
      {a:'CETES 28D', beat:'Rendimiento baja', miss:'Rendimiento sube'},
    ],
  },
  gdp_mx: {
    icon:'📉', category:'Actividad Economica · Mexico',
    context:'El estimado preliminar del PIB de Mexico (IOAE) da la primera lectura del crecimiento trimestral. Mexico enfrenta headwinds por la debilidad de EE.UU., menor inversion publica y el nearshoring aun en fases tempranas.',
    methodology:'Publicado por INEGI. El PIB se desglosa en actividades primarias, secundarias (industria) y terciarias (servicios). El componente de manufacturera de exportacion es clave por su relacion con EE.UU.',
    keyQuestions:['¿Sector manufactura crece o contrae?','¿Consumo privado sigue siendo el motor?','¿Inversion fija bruta (nearshoring) acelera?','¿Riesgo de recesion tecnica (2 trimestres negativos)?'],
    markets:[
      {a:'USD/MXN', beat:'Peso aprecia', miss:'Peso deprecia'},
      {a:'IPC BMV', beat:'Sube (crecimiento)', miss:'Baja (riesgo soberano)'},
      {a:'CDS Mexico 5Y', beat:'Spread se comprime', miss:'Spread se amplia'},
      {a:'Mbonos', beat:'Precios suben', miss:'Precios bajan'},
    ],
  },
  unemployment_us: {
    icon:'📋', category:'Mercado Laboral · EE.UU.',
    context:'La tasa de desempleo de EE.UU. es el indicador laboral de referencia. La Fed tiene doble mandato: estabilidad de precios Y maximo empleo. Un desempleo al alza presiona a la Fed a recortar tasas incluso si la inflacion no llego a la meta.',
    methodology:'Publicado mensualmente junto con el NFP. La SAHM Rule dice que si el promedio movil de 3 meses del desempleo sube 0.5% vs el minimo del ano anterior, hay riesgo de recesion.',
    keyQuestions:['¿Tasa U-3 (desempleo oficial) mayor a 4.5%?','¿La SAHM Rule se activo?','¿Desempleo entre jovenes y minoras aumenta?','¿Es por menor demanda o mayor oferta laboral?'],
    markets:[
      {a:'DXY', beat:'Dolar baja (Fed dovish)', miss:'Dolar sube (Fed hawkish)'},
      {a:'S&P 500', beat:'Sube (recortes mas probables)', miss:'Baja (presion recesion)'},
      {a:'T-Note 10Y', beat:'Rend. baja', miss:'Rend. sube'},
      {a:'USD/MXN', beat:'Peso se aprecia', miss:'Peso se deprecia'},
    ],
  },
  bce: {
    icon:'🇪🇺', category:'Politica Monetaria · Eurozona',
    context:'El Banco Central Europeo (BCE) gestiona la politica monetaria para los 20 paises de la Eurozona. Sus decisiones mueven el EUR/USD, los bonos soberanos europeos y los flujos de capital hacia mercados emergentes.',
    methodology:'El Consejo de Gobierno del BCE vota la tasa de deposito, la principal de refinanciacion y la marginal de prestamo. La conferencia de prensa de Lagarde orienta las expectativas futuras.',
    keyQuestions:['¿El BCE diferencia su postura vs la Fed?','¿La inflacion de servicios en Europa cede?','¿Hay riesgo de fragmentacion en spreads perifericos?','¿El TPI (anti-fragmentacion) se menciona?'],
    markets:[
      {a:'EUR/USD', beat:'EUR sube (BCE hawkish)', miss:'EUR baja (BCE dovish)'},
      {a:'EUR/MXN', beat:'EUR/MXN sube', miss:'EUR/MXN baja'},
      {a:'Bund 10A', beat:'Rend. sube con alza', miss:'Rend. baja con recorte'},
      {a:'BTP-Bund Spread', beat:'Comprime (hawkish da credibilidad)', miss:'Amplia (dovish baja defensa)'},
    ],
  },
  boj: {
    icon:'🇯🇵', category:'Politica Monetaria · Japon',
    context:'El Banco de Japon (BOJ) es el ultimo gran banco central con tasas ultra-bajas. Su salida del YCC (Yield Curve Control) y la normalizacion de tasas genera movimientos masivos en el yen. El carry trade JPY es uno de los mas grandes del mundo.',
    methodology:'El BOJ se reune cada 6 semanas. Una sorpresa hawkish (alza o senales de alza) dispara el cierre del carry trade: el yen sube abruptamente y los activos de riesgo globales caen. Agosto 2024 fue un ejemplo historico.',
    keyQuestions:['¿Se ajusta el objetivo de JGB 10Y?','¿Sube la tasa de politica por encima de 0.5%?','¿El lenguaje señala mas alzas?','¿Impacto en USD/JPY y carry trade global?'],
    markets:[
      {a:'USD/JPY', beat:'JPY se aprecia (yen sube)', miss:'JPY se deprecia (yen baja)'},
      {a:'S&P 500', beat:'Cae (cierre de carry risk-off)', miss:'Sube (carry trade se mantiene)'},
      {a:'JGB 10A', beat:'Rend. sube', miss:'Rend. baja'},
      {a:'USD/MXN', beat:'Peso puede deprec. (risk-off)', miss:'Peso estable'},
      {a:'Oro', beat:'Volatil', miss:'Estable'},
    ],
  },
  boe: {
    icon:'🇬🇧', category:'Politica Monetaria · Reino Unido',
    context:'El Banco de Inglaterra (BOE) enfrenta el dilema de inflacion estructural post-Brexit vs desaceleracion economica. Sus decisiones mueven la libra esterlina (GBP) y los Gilts, con impacto en flujos hacia mercados emergentes.',
    methodology:'El Comite de Politica Monetaria (MPC) vota 9 miembros. Un voto dividido (ej. 5-4) genera mas volatilidad que un voto unanime.',
    keyQuestions:['¿El MPC esta dividido en el voto?','¿La inflacion en servicios UK sigue mayor a 5%?','¿La libra tiene presion de los Gilts?','¿Diferencial GBP vs EUR/USD?'],
    markets:[
      {a:'GBP/USD', beat:'GBP sube (hawkish)', miss:'GBP baja (dovish)'},
      {a:'Gilt 10A', beat:'Rend. sube', miss:'Rend. baja'},
      {a:'FTSE 100', beat:'Mixto', miss:'Mixto'},
      {a:'GBP/MXN', beat:'GBP/MXN sube', miss:'GBP/MXN baja'},
    ],
  },
  opec: {
    icon:'🛢', category:'Commodities · Energia',
    context:'La OPEP+ (OPEC y aliados incluyendo Rusia) controla ~40% de la produccion mundial de crudo. Sus decisiones sobre cuotas de produccion mueven el precio del WTI y el Brent. Dado que Mexico es exportador de crudo (Pemex), el precio del petroleo afecta directamente las finanzas publicas y el peso.',
    methodology:'Las decisiones son por consenso entre los 23 paises miembros. Un recorte de produccion eleva precios; un aumento los deprime. Arabia Saudita y Rusia son los swing producers clave.',
    keyQuestions:['¿Se recorta, mantiene o aumenta la produccion?','¿Arabia Saudita hace recortes unilaterales adicionales?','¿Hay incumplimiento de cuotas por Rusia/Iraq?','¿La decision es por 1 mes o multi-mes?'],
    markets:[
      {a:'WTI / Brent', beat:'Sube (recorte) / Baja (aumento)', miss:'Baja (aumento) / Sube (recorte)'},
      {a:'USD/MXN', beat:'Peso aprecia (mas ingr. Pemex)', miss:'Peso deprecia (menos ingr.)'},
      {a:'Gasolina', beat:'Sube en EE.UU.', miss:'Baja en EE.UU.'},
      {a:'Lineas aereas', beat:'Caen (mayor costo combustible)', miss:'Suben (menor costo)'},
    ],
  },
  eia: {
    icon:'⛽', category:'Inventarios de Crudo · EE.UU. (Semanal)',
    context:'El reporte semanal de inventarios de crudo del EIA (Energy Information Administration) se publica cada miercoles a las 10:30 EST. Una reduccion inesperada de inventarios implica mayor demanda o menor oferta, moviendo el WTI 1-3% en minutos. Es el evento mas volatil del mercado de energia.',
    methodology:'Se compara el cambio en inventarios vs el consenso de los analistas (Bloomberg/Reuters survey). La variacion en Cushing (hub de Oklahoma) y el cambio en produccion de EE.UU. tambien importan.',
    keyQuestions:['¿Bajan o suben mas de lo esperado?','¿Cambio en inventarios de gasolina?','¿Produccion de EE.UU. sigue en maximos historicos?','¿Cambio en inventarios de destilados (diesel)?'],
    markets:[
      {a:'WTI Crudo', beat:'Sube (bajan inv. mayor al est.)', miss:'Baja (suben inv. mayor al est.)'},
      {a:'Brent', beat:'Sube', miss:'Baja'},
      {a:'USD/MXN', beat:'Peso aprecia', miss:'Peso deprecia'},
      {a:'Gasolineras / Refinadoras', beat:'Mixto', miss:'Mixto'},
    ],
  },
  earnings: {
    icon:'💹', category:'Resultados Corporativos · Mega-Cap',
    context:'Los resultados de las empresas mega-cap tecnologicas (Apple, Microsoft, Meta, Alphabet, Nvidia) mueven el S&P 500 y el NASDAQ 100 de forma significativa. Representan hasta 30% del indice. Los resultados del IPC tambien son relevantes para el mercado mexicano.',
    methodology:'Se compara EPS (ganancia por accion) y Revenue vs consenso de analistas. El guidance (proyeccion futura) pesa tanto como el resultado historico. El after-hours es la primera lectura.',
    keyQuestions:['¿EPS y Revenue superan el consenso?','¿El guidance fue conservador o agresivo?','¿Margenes mejoran o deterioran?','¿La IA monetiza o sigue siendo capex puro?'],
    markets:[
      {a:'S&P 500 / NASDAQ', beat:'Sube (resultados solidos)', miss:'Baja (decepcion)'},
      {a:'IPC BMV', beat:'Puede subir por correlacion', miss:'Puede bajar'},
      {a:'USD/MXN', beat:'Risk-on: Peso aprecia', miss:'Risk-off: Peso deprecia'},
      {a:'Volatilidad (VIX)', beat:'Cae', miss:'Sube'},
    ],
  },
  earnings_finance: {
    icon:'🏦', category:'Resultados Bancarios · EE.UU.',
    context:'JPMorgan Chase abre la temporada de resultados del sector financiero. El sector bancario es el termometro de la salud del credito en EE.UU. Los resultados de JPM, Bank of America, Goldman y Citigroup marcan la pauta de apetito de riesgo global para el trimestre.',
    methodology:'Vigilar: NII (Net Interest Income), provision para creditos, trading revenue y comentarios sobre la economia. Los comentarios del CEO Jamie Dimon sobre condiciones economicas tienen impacto directo.',
    keyQuestions:['¿NII (margen de tasas) se mantiene con recortes en camino?','¿Provisions para creditos suben (riesgo consumidor)?','¿Trading revenues compensan?','¿Comentarios sobre economia de Jamie Dimon?'],
    markets:[
      {a:'S&P 500 / XLF (Bancos)', beat:'Sube', miss:'Baja'},
      {a:'IPC BMV', beat:'Correlacion positiva', miss:'Correlacion negativa'},
      {a:'USD/MXN', beat:'Risk-on, Peso aprecia', miss:'Risk-off, Peso deprecia'},
      {a:'T-Note 10Y', beat:'Rend. puede subir', miss:'Rend. puede bajar'},
    ],
  },
  default: {
    icon:'📅', category:'Evento Economico',
    context:'Este evento economico puede tener impacto en los mercados financieros globales y especialmente en activos mexicanos. Monitorear el resultado vs el estimado del consenso.',
    methodology:'Comparar el dato publicado vs el consenso de analistas. Una sorpresa positiva o negativa puede generar movimientos en divisas, bonos y acciones.',
    keyQuestions:['¿El resultado supero o decepciono al consenso?','¿Cambia las expectativas de politica monetaria?','¿Impacto en activos mexicanos (MXN, IPC)?'],
    markets:[
      {a:'USD/MXN', beat:'Posible apreciacion peso', miss:'Posible depreciacion peso'},
      {a:'IPC BMV', beat:'Reaccion positiva', miss:'Reaccion negativa'},
      {a:'Bonos MX', beat:'Mixto', miss:'Mixto'},
    ],
  },
};

function getCalProfile(title) {
  var t = (title||'').toLowerCase();
  if (t.includes('banxico')) return CAL_PROFILES.banxico;
  if (t.includes('fomc') || (t.includes('fed') && t.includes('decision'))) return CAL_PROFILES.fomc;
  if (t.includes('septiembre') && t.includes('fomc')) return CAL_PROFILES.fomc;
  if (t.includes('pce')) return CAL_PROFILES.pce;
  if (t.includes('nfp') || t.includes('nomina')) return CAL_PROFILES.nfp;
  if (t.includes('cpi') || (t.includes('inflacion') && (t.includes('ee.uu') || t.includes('julio') || t.includes('junio')))) return CAL_PROFILES.cpi_us;
  if (t.includes('inpc')) return CAL_PROFILES.inpc;
  if (t.includes('pib') || t.includes('gdp')) return CAL_PROFILES.gdp_mx;
  if (t.includes('desempleo')) return CAL_PROFILES.unemployment_us;
  if (t.includes('bce') || t.includes('banco central europeo')) return CAL_PROFILES.bce;
  if (t.includes('boj') || t.includes('japon') || t.includes('japón')) return CAL_PROFILES.boj;
  if (t.includes('boe') || t.includes('inglaterra')) return CAL_PROFILES.boe;
  if (t.includes('opep') || t.includes('opec') || t.includes('produccion')) return CAL_PROFILES.opec;
  if (t.includes('eia') || t.includes('inventarios')) return CAL_PROFILES.eia;
  if (t.includes('jpmorgan') || t.includes('temporada')) return CAL_PROFILES.earnings_finance;
  if (t.includes('apple') || t.includes('meta') || t.includes('microsoft') || t.includes('resultados') || t.includes('earnings')) return CAL_PROFILES.earnings;
  return CAL_PROFILES.default;
}

function openCalDetail(card) {
  var overlay = document.getElementById('cal-modal-overlay');
  if (!overlay) return;

  var dateAttr   = card.dataset.date || '';
  var realAttr   = (card.dataset.real || '').trim();
  var estNumAttr = (card.dataset.estNum || '').trim();
  var betterWhen = (card.dataset.betterWhen || '').trim();
  var impClass   = card.classList.contains('high') ? 'high' : card.classList.contains('med') ? 'med' : 'low';

  var flagEl    = card.querySelector('.cal-card-flag');
  var flag      = flagEl ? flagEl.textContent.trim() : '';
  var dateEl    = card.querySelector('.cal-card-date');
  var dateText  = dateEl ? dateEl.textContent.replace(flag,'').replace(/Hoy|Manana|en \d+d/g,'').trim() : '';
  var title     = (card.querySelector('.cal-card-title')||{}).textContent||'';
  var desc      = (card.querySelector('.cal-card-desc')||{}).textContent||'';
  var pills     = [].slice.call(card.querySelectorAll('.cal-card-pill')).map(function(p){return p.textContent.trim();}).filter(function(t){return t;});

  var profile = getCalProfile(title);

  /* Status */
  var today = new Date(); today.setHours(0,0,0,0);
  var cardDate = dateAttr ? new Date(dateAttr + 'T00:00:00') : null;
  var daysLeft = cardDate ? Math.ceil((cardDate - today) / 86400000) : null;
  var status = '';
  if (daysLeft === null) status = 'Evento recurrente';
  else if (daysLeft < 0) status = 'Ya ocurrio';
  else if (daysLeft === 0) status = '¡Hoy!';
  else if (daysLeft === 1) status = 'Manana';
  else status = 'En ' + daysLeft + ' dias';

  var statusColor = daysLeft === null ? '#64748b' : daysLeft <= 0 ? '#94a3b8' : daysLeft <= 3 ? '#dc2626' : daysLeft <= 7 ? '#d97706' : '#16a34a';

  var impColors = {high:{bg:'linear-gradient(135deg,#7f1d1d,#991b1b)',badge:'#fca5a5',text:'IMPACTO ALTO'},med:{bg:'linear-gradient(135deg,#78350f,#92400e)',badge:'#fde68a',text:'IMPACTO MEDIO'},low:{bg:'linear-gradient(135deg,#14532d,#166534)',badge:'#bbf7d0',text:'IMPACTO BAJO'}};
  var imp = impColors[impClass] || impColors.med;

  var realNum = realAttr ? parseFloat(realAttr) : NaN;
  var estNum  = estNumAttr ? parseFloat(estNumAttr) : NaN;
  var hasSurprise = !isNaN(realNum) && !isNaN(estNum) && betterWhen;
  var surpriseClass = '';
  var surpriseText  = '';
  if (hasSurprise) {
    var diff = realNum - estNum;
    var beat = betterWhen === 'lower' ? diff < -0.05 : diff > 0.05;
    var miss = betterWhen === 'lower' ? diff >  0.05 : diff < -0.05;
    surpriseClass = beat ? 'beat' : miss ? 'miss' : 'meet';
    var absDiff = Math.abs(diff).toFixed(2);
    surpriseText = beat ? ('Sorpresa POSITIVA: Real (' + realAttr + ') supero el estimado (' + estNumAttr + ') por ' + absDiff) : miss ? ('Sorpresa NEGATIVA: Real (' + realAttr + ') decepciono vs estimado (' + estNumAttr + ') por ' + absDiff) : ('En linea: Real (' + realAttr + ') igualó el estimado (' + estNumAttr + ')');
  }
  var hdr = document.getElementById('cm-header');
  if (hdr) hdr.style.background = imp.bg;
  document.getElementById('cm-flag').textContent = flag || profile.icon;
  document.getElementById('cm-title').textContent = title;
  document.getElementById('cm-category').textContent = profile.category;
  document.getElementById('cm-date').textContent = dateText;
  var ibadge = document.getElementById('cm-imp-badge');
  if (ibadge) { ibadge.textContent = imp.text; ibadge.style.background = 'rgba(255,255,255,.15)'; ibadge.style.color = imp.badge; }

  var statusEl = document.getElementById('cm-status');
  if (statusEl) statusEl.innerHTML = [
    '<div class="bm-metric-row"><span class="bm-metric-lbl">Estado</span><span class="bm-metric-val" style="color:'+statusColor+'">'+status+'</span></div>',
    cardDate ? '<div class="bm-metric-row"><span class="bm-metric-lbl">Fecha</span><span class="bm-metric-val">'+dateText+'</span></div>' : '',
    pills.length ? '<div class="bm-metric-row"><span class="bm-metric-lbl">Datos previos</span><span class="bm-metric-val" style="font-size:.62rem;">'+pills.join(' · ')+'</span></div>' : '',
    hasSurprise ? '<div class="bm-metric-row"><span class="bm-metric-lbl">Resultado</span><span class="bm-metric-val" style="color:'+(surpriseClass==='beat'?'#16a34a':surpriseClass==='miss'?'#dc2626':'#d97706')+';font-size:.63rem;">'+surpriseText+'</span></div>' : '',
    !hasSurprise && realAttr ? '<div class="bm-metric-row"><span class="bm-metric-lbl">Dato real publicado</span><span class="bm-metric-val">'+realAttr+'</span></div>' : '',
  ].join('');
  var mktsEl = document.getElementById('cm-markets');
  if (mktsEl && profile.markets && profile.markets.length) {
    var betterLabel = betterWhen === 'lower' ? 'Si dato menor al est. (positivo)' : betterWhen === 'higher' ? 'Si dato mayor al est. (positivo)' : 'Si hawkish / alcista';
    var worseLabel  = betterWhen === 'lower' ? 'Si dato mayor al est. (negativo)' : betterWhen === 'higher' ? 'Si dato menor al est. (negativo)' : 'Si dovish / bajista';
    var rows = profile.markets.map(function(m){
      return '<tr><td style="padding:.3rem .4rem;font-size:.65rem;font-weight:600;color:#1e293b;white-space:nowrap;">'+m.a+'</td><td style="padding:.3rem .4rem;font-size:.62rem;color:#16a34a;">'+m.beat+'</td><td style="padding:.3rem .4rem;font-size:.62rem;color:#dc2626;">'+m.miss+'</td></tr>';
    }).join('');
    mktsEl.innerHTML = '<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f1f5f9;"><th style="padding:.3rem .4rem;font-size:.55rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#64748b;text-align:left;">Activo</th><th style="padding:.3rem .4rem;font-size:.55rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#16a34a;text-align:left;">'+betterLabel+'</th><th style="padding:.3rem .4rem;font-size:.55rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#dc2626;text-align:left;">'+worseLabel+'</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }
  var kqEl = document.getElementById('cm-questions');
  if (kqEl && profile.keyQuestions && profile.keyQuestions.length) {
    kqEl.innerHTML = profile.keyQuestions.map(function(q,i){return '<div style="padding:.28rem 0;border-bottom:1px solid #f1f5f9;font-size:.67rem;color:#334155;"><span style="font-weight:700;color:#00213a;margin-right:.4rem;">'+(i+1)+'.</span>'+q+'</div>';}).join('');
  }
  var ctxEl = document.getElementById('cm-context');
  if (ctxEl) ctxEl.innerHTML = desc + '<br><br>' + profile.context + '<br><br><strong>Metodologia:</strong> ' + profile.methodology;

  
  document.getElementById('cm-report').textContent = buildCalReport(flag, title, dateText, pills, status, surpriseText, profile, desc, betterWhen, realAttr, estNumAttr);

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  loadGeminiCalAnalysis(title, flag, dateText, pills, status, surpriseText, betterWhen, realAttr, estNumAttr, profile);
}

function buildCalReport(flag, title, dateText, pills, status, surpriseText, profile, desc, betterWhen, real, est) {
  var now = new Date();
  var dateLong = now.toLocaleDateString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  var timeStr  = now.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  var mktLines = profile.markets ? profile.markets.map(function(m,i){return (i+1)+'. '+m.a+'\n   + '+m.beat+'\n   - '+m.miss;}).join('\n') : '';
  var kqLines  = profile.keyQuestions ? profile.keyQuestions.map(function(q,i){return (i+1)+'. '+q;}).join('\n') : '';
  return [
    '========================================',
    'REPORTE CALENDARIO ECONOMICO',
    'VALL News -- Inteligencia Economica',
    '========================================',
    'Evento:             '+flag+' '+title,
    'Fecha del evento:   '+dateText,
    'Estado:             '+status,
    'Reporte generado:   '+dateLong,
    'Hora:               '+timeStr,
    '',
    '--- DATOS DEL EVENTO -------------------',
    pills.join('\n'),
    real ? 'Dato real:          '+real : '',
    est  ? 'Estimado:           '+est  : '',
    surpriseText ? 'Resultado:          '+surpriseText : '',
    '',
    '--- DESCRIPCION ------------------------',
    desc,
    '',
    '--- CONTEXTO Y METODOLOGIA -------------',
    profile.context,
    '',
    profile.methodology,
    '',
    '--- IMPACTO EN MERCADOS ----------------',
    mktLines,
    '',
    '--- PREGUNTAS CLAVE A MONITOREAR -------',
    kqLines,
    '',
    '--- AVISO LEGAL ------------------------',
    'Reporte informativo. No es asesoria de',
    'inversion ni recomendacion financiera.',
    '========================================',
    'VALL News -- '+now.getFullYear()+' -- vallnews.mx',
    '========================================'
  ].filter(function(l){return l!=='' || true;}).join('\n');
}

async function loadGeminiCalAnalysis(title, flag, dateText, pills, status, surpriseText, betterWhen, real, est, profile) {
  var el = document.getElementById('cm-analysis');
  if (!el) return;
  var pillStr = pills.join(', ');
  var prompt = 'Eres analista economico institucional. Redacta un analisis conciso (150-200 palabras) del siguiente evento del calendario economico:\n\nEvento: '+flag+' '+title+'\nFecha: '+dateText+' ('+status+')\nDatos: '+pillStr+'\n'+(real?'Dato real: '+real+'\n':'')+(est?'Estimado: '+est+'\n':'')+(surpriseText?'Resultado: '+surpriseText+'\n':'')+'Mejor cuando: '+(betterWhen||'N/A')+'\n\nContexto del evento:\n'+profile.context+'\n\nIncluye: 1) Que implica este evento para Mexico, 2) Como puede moverse el peso (USD/MXN), 3) Perspectiva para inversores. Responde en espanol, sin asteriscos ni markdown, tono profesional conciso.';
  try {
    var text = await VDS.geminiChat(prompt, 'Eres un analista financiero institucional de VALL News. Responde en español, de forma concisa y profesional. Máximo 180 palabras.');
    if (text && el.isConnected) el.innerHTML = text.replace(/\n/g,'<br>');
  } catch(e) {
    if (el.isConnected) el.innerHTML = 'No se pudo conectar con VALL-AI. ' + (e.message || 'Verifica tu conexión.');
  }
}

function closeCalModal() {
  var ov = document.getElementById('cal-modal-overlay');
  if (ov) ov.classList.remove('open');
  document.body.style.overflow = '';
}

function copyCalReport() {
  var text = (document.getElementById('cm-report')||{}).textContent||'';
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(text).then(function(){
    var btn = document.querySelector('#cal-modal .bm-btn-primary');
    if (btn){var orig=btn.innerHTML;btn.innerHTML='<i class="fas fa-check"></i> Copiado';setTimeout(function(){btn.innerHTML=orig;},2000);}
  }).catch(function(){});
}

function printCalReport() {
  var text    = (document.getElementById('cm-report')||{}).textContent||'';
  var evtTitle = (document.getElementById('cm-title')||{}).textContent||'Evento';
  var w = window.open('','_blank','width=700,height=900');
  if (!w) return;
  w.document.write('<html><head><title>'+evtTitle+' - VALL News</title><style>body{font-family:Courier New,monospace;font-size:12px;padding:2cm;color:#1e293b;}pre{white-space:pre-wrap;line-height:1.75;}</style></head><body><pre>'+text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</pre></body></html>');
  w.document.close();w.focus();
  setTimeout(function(){w.print();w.close();},600);
}
document.addEventListener('DOMContentLoaded', function() {
  var grid = document.querySelector('#calendar-panel-main .cal-grid');
  if (!grid) return;
  grid.addEventListener('click', function(e) {
    var card = e.target.closest('.cal-card');
    if (card) openCalDetail(card);
  });
});


/* ---- bloque ---- */


var _bondData = null;
var _mktCapData = null;
var _rpData = {};
var _petroData = {};
var _macroIntData = {};
var _creditData = {};
const BOND_PROFILES = {
  us:{name:'EE.UU.',flag:'🇺🇸',currency:'USD',cb:'Reserva Federal (Fed)',policyRate:4.50,mats:{'3M':'T-Bill 3M','1Y':'T-Bill 1A','2Y':'T-Note 2A','5Y':'T-Note 5A','10Y':'T-Note 10A','30Y':'T-Bond 30A'},context:'El Tesoro de EE.UU. es el activo libre de riesgo de referencia mundial. Su rendimiento determina el costo de capital global y fija el piso de todas las primas de riesgo soberanas, corporativas e hipotecarias.',high:5.0,low:2.5,risks:['Politica Fed','Deficit fiscal EE.UU.','Inflacion PCE core','Indice Dolar DXY','Apetito riesgo global']},
  mx:{name:'Mexico',flag:'🇲🇽',currency:'MXN',cb:'Banxico',policyRate:8.50,mats:{'10Y':'Mbono 10A','30Y':'Mbono 30A'},context:'Los Mbonos son bonos de tasa fija del gobierno mexicano en pesos. Reflejan el riesgo soberano local, las expectativas inflacionarias y el ciclo de Banxico. Referencia para credito corporativo nacional y carry trade EM.',high:10.0,low:7.0,risks:['Decisiones Banxico','USD/MXN','Nearshoring y USMCA','Rating Baa2/BBB-','Precio petroleo y Pemex']},
  de:{name:'Alemania',flag:'🇩🇪',currency:'EUR',cb:'BCE',policyRate:2.65,mats:{'10Y':'Bund 10A'},context:'El Bund aleman es el activo libre de riesgo de la Eurozona. Su spread contra otros soberanos mide el riesgo de fragmentacion del bloque europeo.',high:3.2,low:-0.5,risks:['Politica BCE','Inflacion eurozona','Crisis energetica','Fragmentacion UE']},
  jp:{name:'Japon',flag:'🇯🇵',currency:'JPY',cb:'Banco de Japon (BOJ)',policyRate:0.50,mats:{'10Y':'JGB 10A'},context:'El JGB ha estado controlado por el BOJ via Yield Curve Control. Su normalizacion libera flujos masivos de carry trade y reconfigura el mercado global de renta fija.',high:2.0,low:-0.2,risks:['Politica BOJ y YCC','Yen carry trade','Deflacion estructural','Deuda >260% PIB']},
  gb:{name:'Reino Unido',flag:'🇬🇧',currency:'GBP',cb:'Banco de Inglaterra (BOE)',policyRate:4.50,mats:{'10Y':'Gilt 10A'},context:'El Gilt refleja la credibilidad fiscal post-Brexit. Enfrenta inflacion interna persistente y deficit corriente elevado.',high:5.2,low:0.2,risks:['Inflacion servicios UK','Politica BOE','Impacto Brexit','Deficit presupuestario']},
  it:{name:'Italia',flag:'🇮🇹',currency:'EUR',cb:'BCE',policyRate:2.65,mats:{'10Y':'BTP 10A'},context:'El BTP es el termometro del riesgo periferico europeo. Con deuda >140% PIB, el spread BTP-Bund amplifica cualquier incertidumbre politica. El BCE actua via TPI.',high:5.0,low:0.8,risks:['Spread BTP-Bund','Deuda/PIB ~142%','Politica fiscal Roma','Rating BBB/Baa3']},
  fr:{name:'Francia',flag:'🇫🇷',currency:'EUR',cb:'BCE',policyRate:2.65,mats:{'10Y':'OAT 10A'},context:'El OAT ha visto su spread vs Bund ampliarse por degradacion crediticia (AA- 2023) y deficit fiscal ~5% PIB. Francia es el segundo mayor deudor de la Eurozona.',high:3.8,low:-0.3,risks:['Deficit ~5% PIB','Incertidumbre politica','Rating AA- negativo']},
  es:{name:'Espana',flag:'🇪🇸',currency:'EUR',cb:'BCE',policyRate:2.65,mats:{'10Y':'Bono 10A'},context:'El bono espanol logro compresion de spread post-2012. El crecimiento robusto mejora la percepcion crediticia, aunque la deuda ~110% PIB y la fragmentacion politica son riesgos.',high:4.2,low:0.1,risks:['Dependencia turismo','Deuda regional CCAA','Inflacion servicios','Fragmentacion politica']},
  br:{name:'Brasil',flag:'🇧🇷',currency:'BRL',cb:'BACEN',policyRate:13.75,mats:{'10Y':'NTN-F 10A'},context:'Los NTN-F ofrecen primas elevadas por riesgo politico, fragilidad fiscal y volatilidad del real. La Selic a dos digitos ancla la curva en niveles historicamente altos.',high:14.5,low:8.5,risks:['Politica fiscal Lula','Inflacion IPCA','Real (BRL) volatil','Rating Ba2/BB']},
  ca:{name:'Canada',flag:'🇨🇦',currency:'CAD',cb:'Banco de Canada (BOC)',policyRate:4.25,mats:{'10Y':'GoC Bond 10A'},context:'Los GoC siguen de cerca a los T-Notes de EE.UU. por la integracion CUSMA. El diferente ciclo monetario y la exposicion al mercado inmobiliario generan divergencias.',high:4.5,low:0.5,risks:['Correlacion Fed/BOC','Mercado vivienda','Precio petroleo WCS']},
  au:{name:'Australia',flag:'🇦🇺',currency:'AUD',cb:'RBA',policyRate:4.35,mats:{'10Y':'ACGB 10A'},context:'Los ACGB reflejan la economia orientada a commodities y la relacion con China. La RBA mantiene tasas altas para contener inflacion en servicios.',high:5.0,low:0.5,risks:['Exposicion a China','Precios iron ore','Mercado vivienda','Inflacion servicios']},
  cn:{name:'China',flag:'🇨🇳',currency:'CNY',cb:'PBOC',policyRate:3.45,mats:{'10Y':'CGB 10A'},context:'Los CGB tienen rendimientos bajos por alto ahorro interno. El spread CGB-T-Note se invirtio en 2022. Crisis inmobiliaria y deflacion presionan los rendimientos a la baja.',high:3.5,low:1.5,risks:['Crisis inmobiliaria','Deflacion estructural','Tensiones EE.UU.-China','Control capitales CNY']},
};

function openBondDetail(key, label) {
  var overlay = document.getElementById('bond-modal-overlay');
  if (!overlay) return;
  if (!_bondData) { alert('Datos aun cargando, intenta en un momento.'); return; }
  var profile = BOND_PROFILES[key] || {name:key,flag:'',currency:'?',cb:'Banco Central',policyRate:0,mats:{},context:'Sin informacion.',high:10,low:0,risks:[]};
  var dataKey = key === 'de' ? 'eu' : key; // el backend agrupa Alemania (Bund) bajo la Zona Euro ('eu')
  var entry, bond;
  if (key === 'us') { entry = _bondData.find(function(d){return d.key==='us';}); bond = entry && entry.bonds && entry.bonds.find(function(b){return b.label===label || b.maturity===label;}); }
  else { entry = _bondData.find(function(d){return d.key===dataKey;}); bond = entry && entry.bonds && entry.bonds[0]; }
  if (!bond) { alert('No hay datos para este instrumento.'); return; }
  var yld = bond.yield, prev = bond.prev;
  var diff = (yld != null && prev != null) ? yld - prev : null;
  var yldStr = yld != null ? yld.toFixed(2) + '%' : '--';
  var matLabel = (profile.mats && (profile.mats[label] || profile.mats[bond.label])) || label;
  document.getElementById('bm-flag').textContent = profile.flag;
  document.getElementById('bm-country').textContent = profile.name;
  document.getElementById('bm-instrument').textContent = matLabel + ' · Bono Gubernamental';
  document.getElementById('bm-yield-big').textContent = yldStr;
  var badge = document.getElementById('bm-chg-badge');
  if (diff != null) { badge.textContent = (diff>0?'▲ +':'▼ ')+Math.abs(diff).toFixed(2)+' pp'; badge.style.background = diff>0?'rgba(220,38,38,.3)':'rgba(22,163,74,.3)'; badge.style.color = diff>0?'#fca5a5':'#86efac'; }
  else { badge.textContent = '--'; badge.style.background = 'rgba(255,255,255,.12)'; badge.style.color = '#fff'; }
  document.getElementById('bm-upd').textContent = 'Act. ' + new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}) + (entry && entry.source ? ' · ' + entry.source : ' · Yahoo Finance');
  var ycSpread = null;
  if (key === 'us') {
    var ue = _bondData.find(function(d){return d.key==='us';});
    var b2n = ue && ue.bonds && ue.bonds.find(function(b){return b.label==='2Y'||b.label==='2A';});
    var b10n = ue && ue.bonds && ue.bonds.find(function(b){return b.label==='10Y'||b.label==='10A';});
    if (b2n && b2n.yield != null && b10n && b10n.yield != null) ycSpread = b10n.yield - b2n.yield;
  }
  var spread = yld != null ? yld - profile.policyRate : null;
  var yldColor = yld==null?'#64748b':yld>=profile.high?'#dc2626':yld<=profile.low?'#16a34a':'#d97706';
  var level = yld==null?'--':yld>=profile.high?'ALTO – zona restrictiva':yld<=profile.low?'BAJO – zona expansiva':'NEUTRAL – equilibrado';
  var m = '<div class="bm-metric-row"><span class="bm-metric-lbl">Rendimiento actual</span><span class="bm-metric-val">'+yldStr+'</span></div>';
  m += '<div class="bm-metric-row"><span class="bm-metric-lbl">Variacion diaria</span><span class="bm-metric-val" style="color:'+(diff==null?'#64748b':diff>0?'#dc2626':'#16a34a')+'">'+(diff!=null?(diff>0?'▲ +':'▼ ')+Math.abs(diff).toFixed(2)+' pp':'--')+'</span></div>';
  m += '<div class="bm-metric-row"><span class="bm-metric-lbl">Tasa referencia '+profile.cb.split(' ')[0]+'</span><span class="bm-metric-val">'+profile.policyRate.toFixed(2)+'%</span></div>';
  m += '<div class="bm-metric-row"><span class="bm-metric-lbl">Spread bono − politica</span><span class="bm-metric-val" style="color:'+(spread==null?'#64748b':spread>0?'#16a34a':'#dc2626')+'">'+(spread!=null?(spread>=0?'+':'')+spread.toFixed(2)+' pp':'--')+'</span></div>';
  m += '<div class="bm-metric-row"><span class="bm-metric-lbl">Nivel de rendimiento</span><span class="bm-metric-val" style="color:'+yldColor+';font-size:.62rem;">'+level+'</span></div>';
  if (ycSpread !== null) m += '<div class="bm-metric-row"><span class="bm-metric-lbl">Curva 10Y − 2Y</span><span class="bm-metric-val" style="color:'+(ycSpread>=0?'#16a34a':'#dc2626')+'">'+(ycSpread>=0?'+':'')+ycSpread.toFixed(2)+' pp · '+(ycSpread<0?'⚠ Invertida':'Normal')+'</span></div>';
  document.getElementById('bm-metrics').innerHTML = m;
  document.getElementById('bm-risks').innerHTML = profile.risks.map(function(r){return '<span class="bm-risk-tag">'+r+'</span>';}).join('');
  document.getElementById('bm-analysis').innerHTML = buildStaticAnalysis(key, yld, diff, spread, ycSpread, profile);
  document.getElementById('bm-report').textContent = buildBondReport(profile, matLabel, yldStr, diff, spread, yld, ycSpread, entry && entry.source);
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  loadGeminiBondAnalysis(profile, matLabel, yldStr, diff, spread, yld);
}

function buildStaticAnalysis(key, yld, diff, spread, ycSpread, profile) {
  if (yld == null) return '<em>Sin datos disponibles en este momento.</em>';
  var t = '';
  if (yld >= profile.high) t += 'El rendimiento de <strong>'+yld.toFixed(2)+'%</strong> se ubica en <strong>zona alta (restrictiva)</strong>: el gobierno paga costo de deuda elevado y el credito privado se encarece. ';
  else if (yld <= profile.low) t += 'El rendimiento de <strong>'+yld.toFixed(2)+'%</strong> esta en <strong>zona baja (expansiva)</strong>: condiciones financieras laxas que favorecen la inversion, aunque pueden reflejar debil crecimiento. ';
  else t += 'El rendimiento de <strong>'+yld.toFixed(2)+'%</strong> se encuentra en <strong>zona neutral</strong>, coherente con una politica monetaria equilibrada. ';
  if (diff != null && Math.abs(diff) >= 0.08) t += 'El movimiento de <strong>'+(diff>0?'+':'')+diff.toFixed(2)+' pp</strong> en la sesion es significativo, indicando '+(diff>0?'presion vendedora (posibles datos solidos o prima de riesgo creciente)':'demanda de bonos como activo refugio o expectativas de recorte de tasas')+'. ';
  else if (diff != null) t += 'La variacion de '+(diff>0?'+':'')+diff.toFixed(2)+' pp es moderada, consistente con ajustes normales de liquidez. ';
  if (spread != null) { if (spread < 0) t += 'El bono cotiza <strong>'+Math.abs(spread).toFixed(2)+' pp por debajo de la tasa de referencia</strong>, senalizando que el mercado anticipa recortes futuros. '; else if (spread > 2) t += 'El spread amplio de <strong>'+spread.toFixed(2)+' pp</strong> sobre la tasa de politica refleja prima de liquidez y expectativas de politica restrictiva prolongada. '; else t += 'El spread de <strong>'+spread.toFixed(2)+' pp</strong> sobre la tasa de referencia es equilibrado. '; }
  if (key === 'us' && ycSpread !== null) { if (ycSpread < -0.25) t += '<br><br><strong>⚠ Curva invertida ('+ycSpread.toFixed(2)+' pp 10Y−2Y):</strong> historicamente ha precedido todas las recesiones de EE.UU. con 12–18 meses de adelanto. '; else if (ycSpread < 0) t += '<br><br>La curva esta ligeramente invertida ('+ycSpread.toFixed(2)+' pp), senal de cautela sobre el crecimiento. '; else t += '<br><br>La curva de rendimientos es positiva ('+ycSpread.toFixed(2)+' pp 10Y−2Y), indicando expectativas de expansion economica. '; }
  t += '<br><br>' + profile.context;
  return t;
}

function buildBondReport(profile, matLabel, yldStr, diff, spread, yld, ycSpread, source) {
  var now = new Date();
  var dateLong = now.toLocaleDateString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  var timeStr = now.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  var diffStr = diff!=null?(diff>0?'+':'')+diff.toFixed(2)+' pp':'N/D';
  var spdStr = spread!=null?(spread>=0?'+':'')+spread.toFixed(2)+' pp':'N/D';
  var level = yld==null?'N/D':yld>=profile.high?'ALTO (restrictivo)':yld<=profile.low?'BAJO (expansivo)':'NEUTRAL';
  var ycLine = ycSpread!==null?'\nCurva 10Y-2Y:       '+(ycSpread>=0?'+':'')+ycSpread.toFixed(2)+' pp'+(ycSpread<0?' [INVERTIDA]':' [NORMAL]'):'';
  return [
    '========================================',
    'REPORTE DE BONOS GUBERNAMENTALES',
    'VALL News -- Inteligencia Economica',
    '========================================',
    'Instrumento:        '+profile.flag+' '+profile.name+' -- '+matLabel,
    'Fecha:              '+dateLong,
    'Hora:               '+timeStr+' (hora local)',
    'Fuente:             '+(source||'Yahoo Finance'),
    '',
    '--- DATOS DE MERCADO -------------------',
    'Rendimiento:        '+yldStr,
    'Variacion diaria:   '+diffStr,
    'Tasa referencia:    '+profile.policyRate.toFixed(2)+'% ('+profile.cb+')',
    'Spread bono/pol.:   '+spdStr+ycLine,
    'Nivel:              '+level,
    '',
    '--- BANCO CENTRAL ----------------------',
    'Institucion:        '+profile.cb,
    'Tasa de politica:   '+profile.policyRate.toFixed(2)+'%',
    'Moneda:             '+profile.currency,
    '',
    '--- CONTEXTO DEL INSTRUMENTO -----------',
    profile.context,
    '',
    '--- FACTORES DE RIESGO -----------------',
    profile.risks.map(function(r,i){return (i+1)+'. '+r;}).join('\n'),
    '',
    '--- AVISO LEGAL ------------------------',
    'Reporte informativo. No es asesoria',
    'de inversion ni recomendacion financiera.',
    'Datos: Yahoo Finance / Banxico / ECB.',
    '========================================',
    'VALL News -- '+now.getFullYear()+' -- vallnews.mx',
    '========================================'
  ].join('\n');
}

async function loadGeminiBondAnalysis(profile, matLabel, yldStr, diff, spread) {
  var el = document.getElementById('bm-analysis');
  if (!el) return;
  var prompt = 'Eres analista de renta fija institucional. Redacta un analisis conciso (150-180 palabras) del siguiente bono gubernamental:\n\nPais: '+profile.name+'  Instrumento: '+matLabel+'\nRendimiento: '+yldStr+'  Variacion: '+(diff!=null?(diff>0?'+':'')+diff.toFixed(2)+' pp':'N/D')+'\nSpread vs politica ('+profile.cb+'): '+(spread!=null?(spread>=0?'+':'')+spread.toFixed(2)+' pp':'N/D')+'\nTasa referencia: '+profile.policyRate+'%\n\nIncluye: 1) Implicacion del nivel actual, 2) Factores que lo mueven, 3) Perspectiva de corto plazo. Responde en espanol, sin asteriscos ni markdown, tono profesional conciso.';
  try {
    var text = await VDS.geminiChat(prompt, 'Eres un analista financiero institucional de VALL News. Responde en español, de forma concisa y profesional. Máximo 180 palabras.');
    if (text && el.isConnected) el.innerHTML = text.replace(/\n/g,'<br>');
  } catch(e) {
    if (el.isConnected) el.innerHTML = 'No se pudo conectar con VALL-AI. ' + (e.message || 'Verifica tu conexión.');
  }
}

function closeBondModal() {
  var ov = document.getElementById('bond-modal-overlay');
  if (ov) ov.classList.remove('open');
  document.body.style.overflow = '';
}

function copyBondReport() {
  var text = (document.getElementById('bm-report')||{}).textContent||'';
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(text).then(function(){
    var btn = document.querySelector('.bm-btn-primary');
    if (btn){var orig=btn.innerHTML;btn.innerHTML='<i class="fas fa-check"></i> Copiado';setTimeout(function(){btn.innerHTML=orig;},2000);}
  }).catch(function(){});
}

function printBondReport() {
  var text = (document.getElementById('bm-report')||{}).textContent||'';
  var country = (document.getElementById('bm-country')||{}).textContent||'Bono';
  var w = window.open('','_blank','width=700,height=900');
  if (!w) return;
  w.document.write('<html><head><title>Reporte '+country+' - VALL News</title><style>body{font-family:Courier New,monospace;font-size:12px;padding:2cm;color:#1e293b;}pre{white-space:pre-wrap;line-height:1.75;}</style></head><body><pre>'+text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</pre></body></html>');
  w.document.close();w.focus();
  setTimeout(function(){w.print();w.close();},600);
}


/* ---- bloque ---- */


function _newsKeywords(text) {
  var t = (text||'').toLowerCase();
  var a = [];
  if (new RegExp('\\bfed\\b|federal reserve|fomc|powell').test(t))
    a.push({a:'USD/MXN',dir:'presion sobre el dolar'});
  if (new RegExp('\\bbanxico\\b|banco de mexico|tiie|cetes').test(t))
    a.push({a:'MXN / CETES',dir:'impacto en peso y tasas locales'});
  if (new RegExp('\\bpetroleo\\b|oil|crude|wti|brent|opec|pemex').test(t))
    a.push({a:'WTI Crudo',dir:'commodity energetico clave'});
  if (new RegExp('\\bbitcoin\\b|\\bbtc\\b|crypto|ethereum').test(t))
    a.push({a:'BTC / Cripto',dir:'activos digitales de riesgo'});
  if (new RegExp('inflacion|inflation|\\bcpi\\b|\\bpce\\b|\\bipc\\b').test(t))
    a.push({a:'Bonos Gubernamentales',dir:'expectativas de tasas'});
  if (new RegExp('\\bnfp\\b|empleo|employment|unemployment|payroll').test(t))
    a.push({a:'S&P 500 / Empleo EUA',dir:'sentimiento del mercado'});
  if (new RegExp('s&p|nasdaq|dow jones|bolsa|indices|equities').test(t))
    a.push({a:'Indices Accionarios',dir:'riesgo directo'});
  if (new RegExp('\\beur\\b|europa|\\becb\\b|\\bbce\\b|eurozona').test(t))
    a.push({a:'EUR/USD',dir:'presion sobre el euro'});
  if (new RegExp('\\bchina\\b|yuan|\\brmb\\b|\\bpboc\\b').test(t))
    a.push({a:'Commodities / Asia',dir:'demanda global'});
  if (new RegExp('trump|tariff|arancel|trade war|guerra comercial').test(t))
    a.push({a:'Activos de Riesgo Global',dir:'volatilidad por politica'});
  if (a.length === 0) a.push({a:'Mercados Globales',dir:'monitorear impacto'});
  return a;
}

var _nmCurrentUrl = '';
function openNewsDetail(item) {
  var titulo = item.titulo || item.title || 'Noticia financiera';
  var desc   = item.descripcion || item.description || '';
  var cat    = item.categoria || item.category || 'Mercados';
  var fuente = (item.fuente || item.source || 'API').toUpperCase();
  var impact = (item.impacto || '').toLowerCase();
  var fecha  = item.fecha || '';
  var imgSrc = _finNewsUrl(item.image || '');
  var url    = _finNewsUrl(item.url || '');
  _nmCurrentUrl = url;
  var srcBtn = document.getElementById('nm-source-btn');
  if (srcBtn) srcBtn.style.display = url ? '' : 'none';

  var impColor = impact === 'alto' ? '#dc2626' : impact === 'medio' ? '#d97706' : '#2563eb';
  var impLabel = impact === 'alto' ? 'IMPACTO ALTO' : impact === 'medio' ? 'IMPACTO MEDIO' : 'MONITOREO';

  var img = document.getElementById('nm-img');
  if (imgSrc) { img.src = imgSrc; img.style.display = 'block'; }
  else { img.style.display = 'none'; }

  var isEnglishDesc = /\b(the|and|for|with|that|this|from|have|are|was|were|will|said|would|could)\b/i.test(desc) && desc.length > 20;

  document.getElementById('nm-cat').textContent = cat;
  document.getElementById('nm-source').textContent = fuente + (fecha ? ' · ' + fecha : '');
  document.getElementById('nm-title').textContent = titulo;
  document.getElementById('nm-desc').textContent = isEnglishDesc ? 'Traduciendo al español con VALL-AI...' : desc;

  var badge = document.getElementById('nm-imp-badge');
  badge.textContent = impLabel;
  badge.style.background = impColor;


  var kw = _newsKeywords(titulo + ' ' + desc + ' ' + cat);
  document.getElementById('nm-related').innerHTML = kw.map(function(k) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:.3rem 0;border-bottom:1px solid #f1f5f9;">' +
      '<span style="font-size:.68rem;font-weight:700;color:#00213a;">' + k.a + '</span>' +
      '<span style="font-size:.62rem;color:#64748b;">' + k.dir + '</span></div>';
  }).join('');

  document.getElementById('nm-report').textContent = _buildNewsReport(titulo,cat,fuente,fecha,impact,desc,kw);
  document.getElementById('nm-analysis').textContent = 'Analizando con VALL-AI...';
  document.getElementById('news-modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  _loadGeminiNews(titulo, desc, cat, impact);
}

function _buildNewsReport(titulo,cat,fuente,fecha,impact,desc,kw) {
  var sep  = '─'.repeat(44);
  var sep2 = '═'.repeat(44);
  var impDesc = impact === 'alto'  ? 'ALTO — Monitoreo inmediato requerido'
              : impact === 'medio' ? 'MEDIO — Seguimiento recomendado'
              : 'BAJO / MONITOREO — Sin accion urgente';
  var assets = kw.map(function(k){ return '  • ' + k.a + ' — ' + k.dir; }).join('\n');
  return [
    sep2,
    'REPORTE DE NOTICIA FINANCIERA',
    'VALLNews Intelligence · ' + new Date().toLocaleString('es-MX'),
    sep2,
    '',
    'TITULAR',
    titulo,
    '',
    sep,
    'DETALLES',
    '  Categoria  : ' + cat,
    '  Fuente     : ' + fuente,
    '  Fecha      : ' + (fecha||'N/A'),
    '  Clasificacion de Impacto : ' + impDesc,
    sep,
    '',
    'DESCRIPCION COMPLETA',
    desc || '(sin descripcion disponible)',
    '',
    sep,
    'ACTIVOS Y MERCADOS RELACIONADOS',
    assets,
    '',
    sep,
    'ANALISIS VALL-AI',
    '(generando analisis inteligente...)',
    '',
    sep2,
    '© VALLNews · Informacion con fines educativos'
  ].join('\n');
}

function _loadGeminiNews(titulo, desc, cat, impact) {
  var prompt = 'Eres analista financiero experto. Analiza esta noticia en 3 puntos concisos: 1) Impacto inmediato en mercados, 2) Activos mas afectados, 3) Perspectiva para inversionistas mexicanos. NOTICIA: Titulo: ' + titulo + '. Categoria: ' + cat + '. Impacto: ' + (impact||'N/A') + '. Descripcion: ' + desc.slice(0,500);
  VDS.geminiChat(prompt, 'Eres un analista financiero institucional de VALL News. Responde en español, de forma concisa y profesional. Máximo 180 palabras.')
    .then(function(aiText){
      aiText = aiText || 'Analisis no disponible.';
      var el = document.getElementById('nm-analysis');
      if (el) el.textContent = aiText;
      var rep = document.getElementById('nm-report');
      if (rep) rep.textContent = rep.textContent.replace('(generando analisis inteligente...)', aiText);
    })
    .catch(function(e){
      var msg = 'No se pudo conectar con VALL-AI. ' + (e.message || '');
      var el = document.getElementById('nm-analysis');
      if (el) el.textContent = msg;
      var rep = document.getElementById('nm-report');
      if (rep) rep.textContent = rep.textContent.replace('(generando analisis inteligente...)', msg);
    });
}

function closeNewsModal() {
  document.getElementById('news-modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function copyNewsReport() {
  var text = document.getElementById('nm-report').textContent;
  navigator.clipboard.writeText(text).then(function(){
    var btn = document.querySelector('#news-modal .bm-btn-primary');
    if (btn) { btn.textContent = 'Copiado!'; setTimeout(function(){ btn.innerHTML = '✔ Copiado'; },1800); }
  });
}

function printNewsReport() {
  var report = document.getElementById('nm-report').textContent;
  var w = window.open('','_blank','width=700,height=900');
  if (!w) return;
  w.document.write('<html><head><title>Reporte Noticia VALL News</title><style>body{font-family:Courier New,monospace;font-size:12px;padding:2cm;color:#1e293b;}pre{white-space:pre-wrap;line-height:1.75;}</style></head><body><pre>' + report.replace(/[&]/g,'&amp;').replace(/[<]/g,'&lt;').replace(/[>]/g,'&gt;') + '</pre></body></html>');
  w.document.close(); w.focus();
  setTimeout(function(){ w.print(); w.close(); },600);
}

document.addEventListener('DOMContentLoaded', function() {
  document.addEventListener('click', function(e) {
    var card = e.target.closest('#ncTrack .nc-card');
    if (!card) return;
    e.preventDefault();
    var cards = Array.from(document.querySelectorAll('#ncTrack .nc-card'));
    var idx = cards.indexOf(card);
    if (idx >= 0 && typeof _ncItems !== 'undefined' && _ncItems[idx]) openNewsDetail(_ncItems[idx]);
  });
});


/* ---- bloque ---- */


const PULSE_PROFILES = {
  'VIX': {
    name: 'VIX — Indice de Volatilidad CBOE',
    ticker: '^VIX', unit: 'puntos',
    gradient: 'linear-gradient(135deg,#7f1d1d,#dc2626)',
    what: 'El VIX mide la volatilidad implicita esperada del S&P 500 durante los proximos 30 dias. Conocido como el "indice del miedo" — valores altos indican panico e incertidumbre, valores bajos indican complacencia. Se construye a partir de opciones del S&P 500.',
    interpretation: function(v) {
      var val = parseFloat((v||'').replace(/,/g,''));
      if (isNaN(val)) return {label:'SIN DATO',color:'#94a3b8',text:'No hay datos disponibles en este momento.'};
      if (val < 13) return {label:'COMPLACENCIA EXTREMA',color:'#16a34a',text:'Mercado muy tranquilo. La complacencia extrema puede ser un punto de vulnerabilidad — suele anteceder correcciones. Inversionistas bajan coberturas.'};
      if (val < 20) return {label:'CALMA — CONDICIONES NORMALES',color:'#65a30d',text:'VIX en zona de baja volatilidad. Condiciones favorables para activos de riesgo. Tipico de mercados en tendencia alcista sostenida.'};
      if (val < 25) return {label:'PRECAUCION — VOL ELEVANDOSE',color:'#d97706',text:'Volatilidad en aumento. Inversores empiezan a coberturarse. Monitorear flujos hacia bonos del Tesoro y dolar como activos de refugio.'};
      if (val < 35) return {label:'MIEDO ACTIVO — ALTA VOLATILIDAD',color:'#ea580c',text:'Zona de miedo activo. Spreads de credito amplios, posible "flight to quality" hacia bonos y dolar. Mercados de renta variable bajo presion.'};
      return {label:'MIEDO EXTREMO — CRISIS',color:'#dc2626',text:'Crisis o shock de mercado. Niveles historicamente asociados a eventos sistemicos. Bancos centrales suelen intervenir. Oportunidad contraria de largo plazo si fundamentals intactos.'};
    },
    watching: ['VIX mayor a 20 = zona de alerta','VIX mayor a 30 = crisis activa','VIX Futures — estructura temporal (contango/backwardation)','Correlacion VIX / DXY (dolar)','Put/Call Ratio del S&P 500','VVIX (volatilidad del VIX)'],
    impacts: [{a:'S&P 500',dir:'Correlacion inversa directa'},{a:'USD (DXY)',dir:'VIX alto lleva al dolar como refugio'},{a:'Bonos Tesoro EUA',dir:'VIX alto = bono sube (demanda refugio)'},{a:'Oro',dir:'Correlacion positiva en momentos de crisis'},{a:'USD/MXN',dir:'VIX alto = salida de EM = peso se debilita'},{a:'Criptomonedas',dir:'VIX alto = cripto vende primero'}],
    risks: ['Spike de VIX puede provocar margin calls en cascada','Estrategias short-volatilidad colapsan en spikes','Correlaciones entre activos sube en crisis','Liquidez se reduce drasticamente con VIX alto'],
    context: 'El VIX fue creado por el CBOE en 1993. Historicamente niveles sobre 40 coinciden con crisis sistemicas: 2008 (subprime), 2020 (COVID), 2010 (Flash Crash). El VIX promedio historico es ~19. Para Mexico, VIX alto usualmente implica salida de capitales de mercados emergentes, depreciacion del peso y presion sobre CETES. Es el indicador mas usado para medir el "apetito por riesgo" global.'
  },
  'S&P 500': {
    name: 'S&P 500 — Referencia Global de Renta Variable',
    ticker: '^GSPC', unit: 'puntos',
    gradient: 'linear-gradient(135deg,#0c4a6e,#0284c7)',
    what: 'El S&P 500 es el indice de las 500 empresas mas grandes de EE.UU. por capitalizacion de mercado. Es la referencia global de renta variable — lo que le pasa al S&P 500 se refleja en todos los mercados del mundo. Incluye Apple, Microsoft, NVIDIA, Amazon, Alphabet, Meta y otras compañias lideres.',
    interpretation: function(v) {
      return {label:'REFERENCIA GLOBAL PRINCIPAL',color:'#0284c7',text:'El S&P 500 es el termometro de los mercados globales. Su variacion diaria es la señal mas importante para todos los demas activos — un dia positivo en el S&P suele traducirse en risk-on global, y viceversa.'};
    },
    watching: ['Variacion % diaria vs promedio historico (+/-1%)','Amplitud del mercado (linea avance/descenso)','Niveles tecnicos: soportes y resistencias clave','Rotacion sectorial (tech vs defensivos)','Posicionamiento neto de futuros (COT Report)','P/E ratio forward del S&P vs historico'],
    impacts: [{a:'IPC Mexico (BMV)',dir:'Correlacion alta 0.70-0.85'},{a:'USD/MXN',dir:'S&P al alza = risk-on = peso firme'},{a:'Bonos Tesoro EUA',dir:'Rally S&P = presion en bonos (yield sube)'},{a:'Criptomonedas',dir:'Alta correlacion en fases de risk-on'},{a:'Commodities EM',dir:'S&P fuerte = demanda global activa'},{a:'VIX',dir:'Correlacion inversa directa'}],
    risks: ['Concentracion en Big Tech (mas del 30% del indice)','Valuaciones historicamente altas (P/E 22-25x)','Sensibilidad a cambios de politica Fed','Riesgo de correccion tecnica tras rallys prolongados','Dependencia de resultados corporativos'],
    context: 'Creado en 1957, el S&P 500 ha generado retornos anuales promedio de ~10.5% historico incluyendo dividendos. Para inversores mexicanos es el benchmark de renta variable global. ETFs como VOO y SPY replican este indice. Una correccion del S&P 500 mayor al 10% usualmente implica salida de capitales de mercados emergentes y depreciacion del peso. En 2022 cayo -19.4%; en 2023 subio +26.3%; en 2024 subio +23.3%.'
  },
  'Yield 10A': {
    name: 'T-Note 10 Anos EUA — Tasa Libre de Riesgo Global',
    ticker: '^TNX', unit: '%',
    gradient: 'linear-gradient(135deg,#1e3a5f,#1e40af)',
    what: 'El rendimiento del Bono del Tesoro de EE.UU. a 10 anos es la tasa de interes libre de riesgo de referencia mundial. Es el ancla del costo de capital global — determina el piso de valuaciones de acciones, bonos corporativos, hipotecas y deuda soberana en todo el mundo. Sube cuando hay expectativas de inflacion o crecimiento; baja cuando hay recesion o "flight to quality".',
    interpretation: function(v) {
      var val = parseFloat((v||'').replace(/,/g,''));
      if (isNaN(val)) return {label:'SIN DATO',color:'#94a3b8',text:'No hay datos disponibles.'};
      if (val < 3.0) return {label:'TASAS BAJAS — POLITICA LAXA',color:'#16a34a',text:'Condiciones financieras muy laxas. Favorable para acciones de crecimiento, credito y activos de riesgo. Puede señalar riesgo de recesion.'};
      if (val < 4.5) return {label:'ZONA NEUTRAL HISTORICA',color:'#d97706',text:'Tasas en rango neutral. Equilibrio entre crecimiento e inflacion. Compatible con expansion economica moderada.'};
      if (val < 5.5) return {label:'TASAS ALTAS — POLITICA RESTRICTIVA',color:'#ea580c',text:'Costo de capital elevado. Presion en valuaciones de acciones (especialmente growth) y paises emergentes. Carry trade en pesos atractivo.'};
      return {label:'TASAS MUY ALTAS — ZONA CRITICA',color:'#dc2626',text:'Nivel extremo de restriccion. Riesgo de recesion y crisis en segmentos de deuda. Ultima vez en estos niveles: 2006-2007.'};
    },
    watching: ['Curva 2s10s: inversion prolongada predice recesion','PCE e IPC EUA: determinan ruta de la Fed','Comunicados FOMC y dot plot','Subastas de T-bonds (demanda extranjera)','Diferencial Mbono 10A vs T-Note (carry MXN)','Rendimientos reales (yield - inflacion)'],
    impacts: [{a:'MXN / CETES',dir:'Yield 10A alto lleva al dolar, presiona al peso'},{a:'Bonos Corporativos',dir:'Correlacion directa (tasa base)'},{a:'S&P 500 / NASDAQ',dir:'Yield alto presiona valuaciones growth'},{a:'Oro',dir:'Correlacion inversa (yield real alto = oro bajo)'},{a:'USD / DXY',dir:'Yield alto EUA fortalece el dolar'},{a:'Mbono Mexico 10A',dir:'Determina spread soberano y carry'}],
    risks: ['Inversion de curva sostenida predice recesion con 12-18 meses de anticipacion','Refinanciamiento corporativo mas caro','Presion en hipotecas y credito al consumo en EUA','Costo de deuda federal EUA sube (deficit crece)'],
    context: 'Historicamente el T-Note 10A promedió ~4.5% (1970-2023). Entre 2012-2022 estuvo artificialmente bajo por QE. El ciclo de alzas 2022-2024 lo llevó a 5%+, nivel no visto desde 2006-2007. Para Mexico, el diferencial entre el Mbono 10A y el T-Note determina el atractivo del carry trade en pesos. Con T-Note alto, inversionistas extranjeros exigen mas rendimiento de los Mbonos para compensar el riesgo tipo de cambio.'
  },
  'Oro': {
    name: 'Oro — Reserva de Valor y Refugio Global',
    ticker: 'GC=F', unit: 'USD/oz',
    gradient: 'linear-gradient(135deg,#78350f,#b45309)',
    what: 'El oro es el activo de refugio y reserva de valor historica. No genera flujo de caja, pero preserva poder adquisitivo en periodos de inflacion, crisis sistemica e incertidumbre geopolitica. Los bancos centrales lo mantienen como reserva internacional. Su precio sube cuando el dolar se debilita, cuando la inflacion sube o cuando hay incertidumbre geopolitica.',
    interpretation: function(v) {
      var val = parseFloat((v||'').replace(/,/g,''));
      if (isNaN(val)) return {label:'SIN DATO',color:'#94a3b8',text:'No hay datos disponibles.'};
      if (val < 1800) return {label:'CORRECCION — ZONA DE ACUMULACION',color:'#16a34a',text:'Precio en zona de correccion. Historicamente ha sido zona de acumulacion de largo plazo para bancos centrales e inversores institucionales.'};
      if (val < 2400) return {label:'RANGO ALTO HISTORICO',color:'#d97706',text:'Oro en zona de precio elevado pero dentro de tendencia alcista post-2020. Refleja demanda estructural de bancos centrales.'};
      if (val < 3000) return {label:'MAXIMOS HISTORICOS — RALLY',color:'#ea580c',text:'Zona de maximos post-2024. Refleja alta demanda de bancos centrales (China, India), hedging de inflacion y diversificacion fuera del dolar.'};
      return {label:'TERRITORIO RECORD',color:'#dc2626',text:'Precio en niveles sin precedente. Señal de incertidumbre sistemica, diversificacion de reservas globales y posible debilitamiento estructural del dolar.'};
    },
    watching: ['Compras de bancos centrales (China, India, Turquia)','Yields reales T-Note (correlacion inversa fuerte)','Indice Dolar DXY','Tensiones geopoliticas y conflictos activos','ETF GLD: flujos de entrada y salida','Demanda fisica Asia: India (bodas) y China (festivos)'],
    impacts: [{a:'USD / DXY',dir:'Oro alto = dolar debil (correlacion inversa)'},{a:'Mineras (GDX)',dir:'Alta sensibilidad: sube mas que el oro'},{a:'T-Note EUA',dir:'Correlacion inversa con yields reales'},{a:'Plata (XAG)',dir:'Correlacion 0.8+ con oro'},{a:'Criptomonedas (BTC)',dir:'Narrativa de "oro digital" — correlacion ocasional'},{a:'USD/MXN',dir:'Oro alto = EM mejoran = peso firme'}],
    risks: ['No genera dividendo ni flujo de caja','Alta volatilidad en fases risk-on (caidas bruscas)','Sensible a cambios de politica Fed','Costo de almacenamiento y custodia','Posible correccion si bancos centrales reducen compras'],
    context: 'El oro rompio maximos historicos en 2024 superando los $2,500 y $3,000 USD/oz impulsado por compras masivas de bancos centrales que diversifican reservas fuera del dolar. China ha sido el mayor comprador institucional. Para Mexico, el oro en pesos (ajustado por USD/MXN) es relevante para portafolios de largo plazo. BANXICO mantiene ~120 toneladas en reservas internacionales.'
  }
};

const SECTOR_PROFILES = {
  'Tecnología': {
    name: 'Sector Tecnología — XLK',
    ticker: 'XLK', gradient: 'linear-gradient(135deg,#1e3a5f,#2563eb)',
    what: 'XLK incluye a Apple, Microsoft, NVIDIA y Broadcom. Es el sector de mayor capitalizacion del S&P 500 (mas del 30%). Su desempeño marca la direccion del mercado general. El ciclo de inteligencia artificial desde 2023 ha sido el principal driver.',
    watching: ['Resultados de Big Tech (Apple, MSFT, NVDA)','Tasas de interes (impactan valuaciones DCF)','Ciclo de IA y gasto en infraestructura cloud','Demanda de semiconductores','Regulacion antimonopolio EUA y UE','Capex en centros de datos'],
    impacts: [{a:'NASDAQ 100',dir:'Correlacion 0.95+'},{a:'Criptomonedas',dir:'Risk-on similar, alta beta'},{a:'USD/MXN',dir:'Tech fuerte = risk-on = peso firme'},{a:'Bonos',dir:'Tech alto = presion en bonos (yield sube)'},{a:'NVDA / AMD / TSMC',dir:'Nombres individuales amplifican el movimiento'}],
    context: 'NVIDIA (IA), Microsoft (cloud/IA/Azure) y Apple (consumo tech) dominan el indice. El ciclo de IA desde 2023 ha sido el principal driver del mercado. Para Mexico, el nearshoring en manufactura electronica y semiconductores crea nexos indirectos con este sector.'
  },
  'Energía': {
    name: 'Sector Energía — XLE',
    ticker: 'XLE', gradient: 'linear-gradient(135deg,#78350f,#d97706)',
    what: 'XLE incluye a ExxonMobil, Chevron y ConocoPhillips. Alta correlacion con el precio del petroleo WTI y Brent. Para Mexico es estrategico por el rol de PEMEX en los ingresos del gobierno federal.',
    watching: ['Precio WTI y Brent','Decisiones de produccion OPEC+','Demanda China e India','Inventarios EIA (miercoles)','Regulacion climatica y ESG','Capex de exploracion E&P'],
    impacts: [{a:'WTI Crudo',dir:'Correlacion directa 0.85+'},{a:'MXN / PEMEX',dir:'XLE alto = commodities fuertes = peso firme'},{a:'Canada (CAD)',dir:'Alta correlacion por oil sands'},{a:'Inflacion global',dir:'Energia cara = inflacion importada'},{a:'Bonos MX',dir:'Petroleo alto mejora ingresos fiscales MX'}],
    context: 'En 2022, XLE fue el unico sector positivo del S&P 500 con +58% durante el ciclo de alzas de petroleo. Para Mexico, el precio del petroleo impacta directamente los ingresos de PEMEX (mezcla mexicana) y las finanzas del gobierno federal a traves del FEIP (fondo de estabilizacion).'
  },
  'Finanzas': {
    name: 'Sector Financiero — XLF',
    ticker: 'XLF', gradient: 'linear-gradient(135deg,#164e63,#0891b2)',
    what: 'XLF incluye a JPMorgan, Berkshire Hathaway, Bank of America y Visa. Se beneficia de tasas de interes altas (spread NIM bancario) pero es vulnerable a recesiones y crisis de credito.',
    watching: ['Nivel de tasas Fed (spread NIM)','Calidad de la cartera crediticia (NPLs)','Resultados de grandes bancos (JPM, BAC, GS)','Curva de rendimientos 2s10s','Regulacion bancaria y capital','Spreads HY/IG de credito corporativo'],
    impacts: [{a:'T-Note 10A',dir:'Correlacion positiva con yields'},{a:'S&P 500 general',dir:'Finanzas lidera rallys o anticipa correcciones'},{a:'Credito Corporativo',dir:'Spreads HY/IG impactan valuaciones'},{a:'USD/MXN',dir:'Bancos fuertes = confianza en sistema'},{a:'CETES / Mbono',dir:'Ciclo de tasas afecta identicamente'}],
    context: 'En 2023, la crisis de bancos regionales (SVB, Signature Bank) causo volatilidad sistemica. JPMorgan es el mayor banco del mundo por activos. Para Mexico, los bancos locales (BBVA MX, Banorte, Santander MX) tienen alta correlacion con el ciclo de tasas de Banxico y con el sector financiero global.'
  },
  'Salud': {
    name: 'Sector Salud — XLV',
    ticker: 'XLV', gradient: 'linear-gradient(135deg,#14532d,#16a34a)',
    what: 'XLV incluye a UnitedHealth, Johnson & Johnson y Eli Lilly. Sector defensivo con demanda relativamente inelastica. Se destaca en fases de desaceleracion economica. El boom de GLP-1 (Ozempic, Wegovy) ha impulsado el sector desde 2023.',
    watching: ['Aprobaciones FDA de nuevos medicamentos','Pipeline de GLP-1 (diabetes/obesidad)','Precio de medicamentos y negociacion con Medicare','Resultados de grandes pharma y aseguradoras','Fusiones y adquisiciones farmaceuticas','Envejecimiento demografico EUA'],
    impacts: [{a:'Sectores defensivos (XLP)',dir:'Correlacion positiva en risk-off'},{a:'S&P 500 relativo',dir:'Outperformance en recesiones'},{a:'ETF XBI (biotech)',dir:'Beta alto, mayor volatilidad'},{a:'USD',dir:'Ingresos globales impactados por dolar'},{a:'Seguros salud MX',dir:'Tendencia global en prevencion/salud'}],
    context: 'Eli Lilly se convirtio en la empresa mas valiosa del sector salud impulsada por Mounjaro y Zepbound (GLP-1 para obesidad/diabetes). XLV es uno de los sectores mas estables del mercado — en las recesiones de 2001, 2008 y 2022 superó significativamente al S&P 500.'
  },
  'Industrial': {
    name: 'Sector Industrial — XLI',
    ticker: 'XLI', gradient: 'linear-gradient(135deg,#312e81,#6366f1)',
    what: 'XLI incluye a Boeing, Caterpillar, Honeywell y United Parcel Service. Indicador lider del ciclo economico — sube anticipando expansion, baja anticipando contraccion. Directamente relacionado con el nearshoring para Mexico.',
    watching: ['PMI manufacturero EUA e ISM','Gasto en infraestructura (Ley de Infraestructura EUA)','Ordenes de bienes duraderos','Backlog de Boeing y Airbus (aviacion)','Volumenes de transporte aereo y terrestre','Ciclo de capex corporativo'],
    impacts: [{a:'Mexico Nearshoring',dir:'XLI fuerte = mas manufactura hacia MX'},{a:'Commodities Industriales',dir:'Correlacion moderada-alta'},{a:'PMI Global',dir:'Indicador lider del sector'},{a:'CAD / AUD',dir:'Commodities industriales los afectan'},{a:'IPC Mexico (BMV)',dir:'Via exposicion manufacturera MX-EUA'}],
    context: 'XLI es el mejor barometro del nearshoring para Mexico. Caterpillar y Deere reflejan demanda de bienes de capital para manufactura. Con el USMCA y la relocalizacion de cadenas de suministro desde Asia, el sector industrial EUA y Mexico estan mas integrados que nunca. Un XLI fuerte suele preceder aumento de inversion extranjera directa en Mexico.'
  },
  'Consumo Discr.': {
    name: 'Consumo Discrecional — XLY',
    ticker: 'XLY', gradient: 'linear-gradient(135deg,#831843,#db2777)',
    what: 'XLY incluye a Amazon, Tesla y Home Depot. Mide la salud del consumidor estadounidense. Cae primero ante señales de recesion cuando el consumo no esencial se contrae. Amazon representa mas del 20% del ETF.',
    watching: ['Confianza del consumidor EUA (Conference Board)','Nivel de empleo y salarios reales','Tasa de ahorro personal','Precio del petroleo (gasto en gasolina)','Ventas minoristas EUA','Resultados de Amazon y Tesla'],
    impacts: [{a:'Retail Sales EUA',dir:'Indicador directo del sector'},{a:'USD/MXN',dir:'Consumo EUA fuerte = exportaciones MX activas'},{a:'PMI Servicios',dir:'Alta correlacion'},{a:'Remesas Mexico',dir:'Consumidor EUA fuerte = mas remesas'},{a:'Sector Manufacturero MX',dir:'Demanda de bienes de consumo EUA'}],
    context: 'Amazon representa ~20-25% del XLY, haciendo que el ETF sea parcialmente un proxy del e-commerce. Para Mexico, el consumo discrecional EUA es driver clave de las exportaciones manufactureras (autos, electronics), del turismo y de las remesas que enviaron migrantes mexicanos por ~65,000 millones de dolares en 2023.'
  },
  'Consumo Básico': {
    name: 'Consumo Básico (Defensivo) — XLP',
    ticker: 'XLP', gradient: 'linear-gradient(135deg,#365314,#65a30d)',
    what: 'XLP incluye a Procter & Gamble, Coca-Cola, PepsiCo y Costco. Sector defensivo por excelencia — la gente sigue comprando bienes esenciales sin importar el ciclo economico. Alternativa a los bonos en carteras conservadoras.',
    watching: ['Poder de fijacion de precios ante inflacion','Gasto de consumo en necesidades basicas','Dividendos y retorno al accionista','Fortaleza del dolar (ingresos globales)','Competencia de marcas propias (private label)','Margenes operativos y costos de insumos'],
    impacts: [{a:'Oro y Bonos',dir:'Correlacion defensiva en crisis'},{a:'Consumo Discr. (XLY)',dir:'Rotacion inversa en recesiones'},{a:'Inflacion',dir:'Empresas con alto poder de precio'},{a:'Dividendos DY',dir:'Atractivo vs bonos cuando tasas bajan'},{a:'Defensivos globales',dir:'Tendencia global de proteccion de capital'}],
    context: 'XLP es el refugio bursatil en recesiones. En 2022, con el S&P -19%, XLP cayo solo -3%. Sus empresas tienen marcas globales con historial de dividendos crecientes por decadas (Dividend Aristocrats). Para portafolios conservadores de largo plazo, XLP ofrece estabilidad con crecimiento moderado.'
  },
  'Comunicaciones': {
    name: 'Sector Comunicaciones — XLC',
    ticker: 'XLC', gradient: 'linear-gradient(135deg,#4c1d95,#7c3aed)',
    what: 'XLC incluye a Meta (Facebook/Instagram/WhatsApp), Alphabet (Google/YouTube) y Netflix. Es un sector hibrido entre tecnologia y medios digitales dominado por plataformas de publicidad digital y streaming.',
    watching: ['Ingresos por publicidad digital (Google, Meta)','Suscriptores y contenido (Netflix, Disney)','Regulacion de plataformas digitales','IA generativa en publicidad y busqueda','Gasto en infraestructura de datos','Crecimiento de usuarios activos MAU/DAU'],
    impacts: [{a:'Publicidad digital global',dir:'Meta y Alphabet son el mercado'},{a:'NASDAQ / Tech (XLK)',dir:'Correlacion 0.85+'},{a:'Consumo masivo',dir:'Plataformas siguen al consumidor'},{a:'IA (NVIDIA/MSFT)',dir:'Demanda de compute para IA'},{a:'Medios tradicionales',dir:'Sustitutos estructurales en declive'}],
    context: 'XLC fue creado en 2018 cuando Meta y Alphabet salieron de XLK. La IA generativa esta transformando modelos de negocio de publicidad digital, busqueda y creacion de contenido. Para Mexico, las plataformas de Meta y Alphabet son esenciales para el ecosistema de pequenas empresas y el comercio digital.'
  },
  'Materiales': {
    name: 'Sector Materiales — XLB',
    ticker: 'XLB', gradient: 'linear-gradient(135deg,#78350f,#92400e)',
    what: 'XLB incluye a Linde, Air Products, Freeport-McMoRan y Nucor. Mide el ciclo de materias primas industriales: metales, quimicos y mineria. Alta exposicion a la demanda industrial de China.',
    watching: ['Demanda industrial China (acero, cobre, aluminio)','Precio de metales industriales','PMI manufacturero global','Gasto en infraestructura global','Transicion energetica (cobre para EVs y redes)','Precio de litio y materiales de baterias'],
    impacts: [{a:'Cobre (HG=F)',dir:'Correlacion directa alta'},{a:'China GDP y PMI',dir:'Demanda China es el factor dominante'},{a:'Peso mexicano',dir:'Commodities fuertes = EM mejoran'},{a:'Grupo Mexico (GMEXICOB)',dir:'Empresa minera MX con alta correlacion'},{a:'Inflacion global',dir:'Materias primas son inputs de precios'}],
    context: 'XLB es el sector mas expuesto a China. Para Mexico, el precio de los metales impacta a Grupo Mexico (mineria de cobre, zinc y plata) y al sector exportador. La transicion a energias limpias crea demanda estructural de cobre, litio, niquel y cobalto, con potencial minero para Mexico que tiene reservas de plata y cobre.'
  },
  'Utilities': {
    name: 'Sector Utilidades (Servicios Publicos) — XLU',
    ticker: 'XLU', gradient: 'linear-gradient(135deg,#0e7490,#0891b2)',
    what: 'XLU incluye a NextEra Energy, Duke Energy y Southern Company. Sector defensivo y de alta rentabilidad por dividendo. Funciona como un bono de renta variable — sube cuando las tasas de interes bajan y viceversa.',
    watching: ['Nivel de tasas de interes (relacion inversa directa)','Regulacion de tarifas energeticas estatales','Inversion en energias renovables (solar/eolico)','Demanda de energia para centros de datos IA','Politica energetica federal EUA','Comparativo dividendo vs rendimiento T-Note'],
    impacts: [{a:'T-Note 10A EUA',dir:'Correlacion inversa directa muy fuerte'},{a:'Bonos de largo plazo (TLT)',dir:'Movimiento paralelo en ciclos de tasa'},{a:'Sectores defensivos (XLP, XLV)',dir:'Correlacion positiva en risk-off'},{a:'FIBRAS Mexico',dir:'Logica de tasas identica en mercado MX'},{a:'Dividendos',dir:'Atractivos en contextos de baja de tasas'}],
    context: 'XLU cayo mas del 20% en 2022-2023 con el ciclo de alzas de la Fed. Con expectativas de recortes, se ha recuperado. El boom de centros de datos para IA esta creando demanda electrica record — beneficia a utilities como NRG y Constellation Energy. En Mexico, las FIBRAS de infraestructura siguen la misma logica de sensibilidad a tasas Banxico.'
  },
  'Inmobiliario': {
    name: 'Sector Inmobiliario (REITs) — XLRE',
    ticker: 'XLRE', gradient: 'linear-gradient(135deg,#134e4a,#0f766e)',
    what: 'XLRE incluye a American Tower, Prologis y Crown Castle. Son REITs (fideicomisos de bienes raices) que distribuyen alto dividendo por ley. Son el sector mas sensible a las tasas de interes del S&P 500.',
    watching: ['Tasas de interes (costo de financiamiento y comparativo vs bono)','Demanda de data centers para IA','Mercado inmobiliario residencial y comercial EUA','Ocupacion y tasas de renta','Cap rates vs tasas de bonos','Inflacion (REITs con clausulas de ajuste CPI)'],
    impacts: [{a:'T-Note 10A',dir:'Correlacion inversa muy fuerte'},{a:'Utilidades (XLU)',dir:'Movimiento paralelo como activos de ingreso'},{a:'Bonos largo plazo (TLT)',dir:'Comportamiento similar'},{a:'FIBRAS Mexico',dir:'Equivalente local — misma logica de tasas'},{a:'Sector Construccion MX',dir:'Ciclos inmobiliarios vinculados'}],
    context: 'XLRE es el sector mas pequeño del S&P 500 y el mas sensible a las tasas. Cayo mas del 25% en 2022. Los data center REITs (Equinix, Digital Realty) son un driver unico por la demanda de IA. En Mexico, las FIBRAS (fideicomisos de bienes raices bursatiles) como FIBRA UNO y FIBRA Monterrey siguen la misma logica de sensibilidad a tasas de Banxico.'
  }
};

function openPulseDetail(card, isPulse) {
  var label, value, pct, sub;
  if (isPulse) {
    label = (card.children[0]||{textContent:''}).textContent.trim();
    value = (card.children[1]||{textContent:''}).textContent.trim();
    pct   = (card.children[2]||{textContent:''}).textContent.trim();
    sub   = (card.children[3]||{textContent:''}).textContent.trim();
  } else {
    label = (card.children[1]||{textContent:''}).textContent.trim();
    value = (card.children[2]||{textContent:''}).textContent.trim();
    pct   = null;
    sub   = (card.children[0]||{textContent:''}).textContent.trim();
  }

  var profile = isPulse ? PULSE_PROFILES[label] : SECTOR_PROFILES[label];
  if (!profile) return;

  var header = document.getElementById('pm-header');
  if (header) header.style.background = profile.gradient || 'linear-gradient(135deg,#001828,#003a5c)';

  document.getElementById('pm-ticker').textContent = (profile.ticker || label) + (profile.unit ? ' · ' + profile.unit : '');
  document.getElementById('pm-name').textContent = profile.name;
  document.getElementById('pm-value').textContent = value;

  var chgEl = document.getElementById('pm-chg');
  if (pct && isPulse) {
    chgEl.textContent = pct;
    chgEl.style.background = pct.startsWith('+') ? 'rgba(22,163,74,.28)' : 'rgba(220,38,38,.28)';
    chgEl.style.display = 'block';
  } else if (!isPulse) {
    chgEl.textContent = value;
    chgEl.style.background = value.startsWith('-') ? 'rgba(220,38,38,.28)' : value === '—' ? 'rgba(255,255,255,.12)' : 'rgba(22,163,74,.28)';
    chgEl.style.display = 'block';
  } else {
    chgEl.style.display = 'none';
  }

  var interpParsed = isPulse && profile.interpretation ? profile.interpretation(value)
    : { label: value.startsWith('-') ? 'SECTOR A LA BAJA HOY' : value === '—' ? 'SIN DATO' : 'SECTOR AL ALZA HOY',
        color:  value.startsWith('-') ? '#dc2626' : value === '—' ? '#94a3b8' : '#16a34a',
        text: 'Este sector del S&P 500 mueve flujos de capital global. Su desempeño diario refleja el sentimiento de riesgo para activos de renta variable.' };

  var interpEl = document.getElementById('pm-interp');
  interpEl.textContent = interpParsed.text;
  interpEl.style.background = interpParsed.color + '18';
  interpEl.style.borderLeft  = '4px solid ' + interpParsed.color;

  var interpTitle = document.querySelector('#pm-interp-section .bm-section-title');
  if (interpTitle) interpTitle.textContent = 'Lectura Actual: ' + interpParsed.label;

  document.getElementById('pm-what').textContent    = profile.what || '';
  document.getElementById('pm-context').textContent = profile.context || '';

  var watchList = profile.watching || profile.drivers || [];
  document.getElementById('pm-watching').innerHTML = watchList.map(function(w) {
    return '<div style="padding:.28rem 0;border-bottom:1px solid #f1f5f9;font-size:.67rem;color:#334155;display:flex;align-items:flex-start;gap:.35rem;"><span style="color:#00213a;font-weight:700;flex-shrink:0;">•</span>' + w + '</div>';
  }).join('');

  document.getElementById('pm-impacts').innerHTML = profile.impacts.map(function(im) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:.3rem 0;border-bottom:1px solid #f1f5f9;">' +
      '<span style="font-size:.68rem;font-weight:700;color:#00213a;">' + im.a + '</span>' +
      '<span style="font-size:.62rem;color:#64748b;">' + im.dir + '</span></div>';
  }).join('');

  var risksList = profile.risks || [];
  var risksEl = document.getElementById('pm-risks');
  if (risksEl) {
    if (risksList.length) {
      risksEl.parentElement.style.display = '';
      risksEl.innerHTML = risksList.map(function(r){ return '<span class="bm-risk-tag">' + r + '</span>'; }).join('');
    } else {
      risksEl.parentElement.style.display = 'none';
    }
  }

  document.getElementById('pm-report').textContent = _buildPulseReport(profile, label, value, pct, interpParsed.label);
  document.getElementById('pm-analysis').textContent = 'Analizando con VALL-AI...';
  document.getElementById('pulse-modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  _loadGeminiPulse(profile.name, label, value, pct, profile.what);
}

function _buildPulseReport(profile, label, value, pct, interpLabel) {
  var sep  = '─'.repeat(44);
  var sep2 = '═'.repeat(44);
  var watching = (profile.watching || profile.drivers || []).map(function(w){ return '  • ' + w; }).join('\n');
  var impacts  = profile.impacts.map(function(im){ return '  • ' + im.a + ' — ' + im.dir; }).join('\n');
  var risks    = (profile.risks||[]).map(function(r){ return '  ⚠ ' + r; }).join('\n');
  return [
    sep2,
    'REPORTE DE INDICADOR DE MERCADO',
    'VALLNews Intelligence · ' + new Date().toLocaleString('es-MX'),
    sep2,
    '',
    'INDICADOR : ' + (profile.name || label),
    'TICKER    : ' + (profile.ticker || label) + (profile.unit ? '  (' + profile.unit + ')' : ''),
    'VALOR HOY : ' + value + (pct ? '   VAR: ' + pct : ''),
    'LECTURA   : ' + (interpLabel || 'N/A'),
    sep,
    '',
    'DESCRIPCION',
    profile.what || '',
    '',
    sep,
    'QUE MONITOREAR',
    watching,
    '',
    sep,
    'IMPACTO EN OTROS ACTIVOS',
    impacts,
    risks ? '\n' + sep + '\nFACTORES DE RIESGO\n' + risks : '',
    '',
    sep,
    'CONTEXTO HISTORICO',
    profile.context || '',
    '',
    sep,
    'ANALISIS VALL-AI',
    '(generando analisis inteligente...)',
    '',
    sep2,
    '© VALLNews · Informacion con fines educativos'
  ].filter(Boolean).join('\n');
}

function _loadGeminiPulse(name, label, value, pct, what) {
  var prompt = 'Eres analista financiero experto. Analiza este indicador de mercado en 3 puntos concisos: 1) Que indica el nivel actual para los mercados globales, 2) Implicacion para activos de riesgo y carteras de inversion, 3) Perspectiva especifica para inversionistas mexicanos. INDICADOR: ' + name + '. Valor: ' + value + (pct ? ', Var: ' + pct : '') + '. Contexto: ' + what.slice(0,400);
  VDS.geminiChat(prompt, 'Eres un analista financiero institucional de VALL News. Responde en español, de forma concisa y profesional. Máximo 180 palabras.')
    .then(function(aiText){
      aiText = aiText || 'Analisis no disponible.';
      var el = document.getElementById('pm-analysis');
      if (el) el.textContent = aiText;
      var rep = document.getElementById('pm-report');
      if (rep) rep.textContent = rep.textContent.replace('(generando analisis inteligente...)', aiText);
    })
    .catch(function(e){
      var el = document.getElementById('pm-analysis');
      if (el) el.textContent = 'No se pudo conectar con VALL-AI. ' + (e.message || '');
    });
}

function closePulseModal() {
  document.getElementById('pulse-modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function copyPulseReport() {
  var text = document.getElementById('pm-report').textContent;
  navigator.clipboard.writeText(text).then(function(){
    var btn = document.querySelector('#pulse-modal .bm-btn-primary');
    if (btn) { btn.textContent = 'Copiado!'; setTimeout(function(){ btn.innerHTML = '<i class="fas fa-copy"></i> Copiar'; },1800); }
  });
}

function printPulseReport() {
  var report = document.getElementById('pm-report').textContent;
  var w = window.open('','_blank','width=700,height=900');
  if (!w) return;
  w.document.write('<html><head><title>Reporte Indicador VALL News</title><style>body{font-family:Courier New,monospace;font-size:12px;padding:2cm;color:#1e293b;}pre{white-space:pre-wrap;line-height:1.75;}</style></head><body><pre>' + report.replace(/[&]/g,'&amp;').replace(/[<]/g,'&lt;').replace(/[>]/g,'&gt;') + '</pre></body></html>');
  w.document.close(); w.focus();
  setTimeout(function(){ w.print(); w.close(); },600);
}

document.addEventListener('DOMContentLoaded', function() {
  document.addEventListener('click', function(e) {
    var pc = e.target.closest('#mkt-pulse > div');
    if (pc && !pc.classList.contains('sk-block')) { openPulseDetail(pc, true); return; }
    var sc = e.target.closest('#sector-grid > div');
    if (sc && !sc.classList.contains('sk-block')) { openPulseDetail(sc, false); return; }
  });
});


/* ---- bloque ---- */


const MKT_CAP_PROFILES = {
    'IPC': {
        gradient: 'linear-gradient(135deg,#001828,#006341)',
        fullName: 'Índice de Precios y Cotizaciones',
        exchange: 'Bolsa Mexicana de Valores',
        context: 'Principal benchmark de la renta variable mexicana. Representa las ~35 emisoras de mayor liquidez y capitalización del mercado bursátil de México.',
        monitors: ['Confianza consumidor MX','Tipo de cambio USD/MXN','Precio petróleo','Política Banxico','Remesas','Balanza comercial'],
        impacts: [
            { label:'USD/MXN',    desc:'Peso fuerte impulsa entradas de capital extranjero al IPC.' },
            { label:'FIBRAS',     desc:'Comparten flujos de inversión inmobiliaria local.' },
            { label:'Pemex / AMX',desc:'Las ponderaciones más altas mueven el índice significativamente.' },
            { label:'Bonos MX',   desc:'Tasas Banxico afectan el costo de capital de las emisoras.' },
        ],
    },
    'S&P 500': {
        gradient: 'linear-gradient(135deg,#0c4a6e,#1e40af)',
        fullName: 'Standard & Poor\'s 500',
        exchange: 'NYSE / NASDAQ',
        context: 'Benchmark de referencia global que agrupa las 500 empresas de mayor capitalización en EE.UU. Actúa como barómetro del ciclo económico estadounidense y es el índice más seguido del mundo.',
        monitors: ['Decisiones Fed (FOMC)','NFP y desempleo EE.UU.','IPC / PCE inflación','Earnings season','Tesoro 10Y','Confianza del consumidor'],
        impacts: [
            { label:'IPC México',  desc:'Alta correlación: caída del S&P arrastra flujos fuera de mercados emergentes.' },
            { label:'DXY',         desc:'Dólar fuerte reduce múltiplos del S&P vía efecto valuación.' },
            { label:'Bonos US 10Y',desc:'Tasas altas compiten con la renta variable, reducen el P/E.' },
            { label:'Oro',         desc:'Relación inversa en momentos de risk-off (fuga a activos seguros).' },
        ],
    },
    'NASDAQ 100': {
        gradient: 'linear-gradient(135deg,#1e1b4b,#4338ca)',
        fullName: 'NASDAQ-100 Index',
        exchange: 'NASDAQ',
        context: 'Índice de las 100 mayores empresas no financieras del NASDAQ, dominado por tecnología (Apple, Microsoft, Nvidia, Meta, Amazon). Amplifica los movimientos del S&P y es altamente sensible a tasas de interés.',
        monitors: ['Tasas Fed','Earnings Big Tech','IA / semiconductores (NVDA)','Rendimiento real 10Y','VIX','Regulación antitrust'],
        impacts: [
            { label:'S&P 500',        desc:'Correlación ~0.95; el NASDAQ lidera los movimientos del mercado amplio.' },
            { label:'Bitcoin',         desc:'Ambos activos comparten perfil de riesgo growth / especulativo.' },
            { label:'Bonos US',        desc:'Duration larga: muy sensible a subidas de tasas (efecto descuento DCF).' },
            { label:'Semiconductores', desc:'NVDA, AMD, Broadcom pesan fuerte; noticias de IA mueven el índice.' },
        ],
    },
    'USD / MXN': {
        gradient: 'linear-gradient(135deg,#003a2c,#065f46)',
        fullName: 'Dólar Americano / Peso Mexicano',
        exchange: 'FX OTC / FOREX',
        context: 'Par de divisas que refleja la fortaleza relativa del dólar versus el peso. Uno de los pares más líquidos de América Latina. Sensible al diferencial de tasas Banxico–Fed, al petróleo y a noticias geopolíticas México–EE.UU.',
        monitors: ['Diferencial tasa Banxico vs Fed','Precio petróleo WTI','Remesas (soporte al peso)','Nearshoring / IED','Riesgo político MX','Inflación bilateral'],
        impacts: [
            { label:'IPC',            desc:'Peso débil encarece importaciones y reduce márgenes de emisoras.' },
            { label:'Bonos MX',       desc:'Depreciación del peso presiona al Banxico a subir tasas → bonos caen.' },
            { label:'DXY',            desc:'MXN es proxy del DXY en emergentes: DXY sube → USD/MXN sube.' },
            { label:'Materias primas',desc:'México exporta petróleo y plata; precios bajos presionan al peso.' },
        ],
    },
    'Oro': {
        gradient: 'linear-gradient(135deg,#78350f,#b45309)',
        fullName: 'Oro Spot / Futuros (XAU/USD)',
        exchange: 'COMEX / OTC',
        context: 'Activo refugio por excelencia, denominado en dólares. Sube en entornos de incertidumbre, inflación o debilidad del dólar. Los bancos centrales son compradores estructurales importantes desde 2022.',
        monitors: ['Tasas reales EE.UU. (TIPS)','DXY','Inflación PCE / IPC','Compras bancos centrales','Tensiones geopolíticas','Flujos ETF GLD'],
        impacts: [
            { label:'Dólar (DXY)', desc:'Relación inversa estructural: DXY sube → Oro baja en términos nominales.' },
            { label:'Bonos US',    desc:'Tasa real negativa → Oro sube (no hay costo de oportunidad).' },
            { label:'Plata (XAG)', desc:'Correlación >0.85; la plata amplifica los movimientos del oro.' },
            { label:'S&P 500',     desc:'Relación mixta: sube en crashes pero cae en rallies prolongados.' },
        ],
    },
    'Bitcoin': {
        gradient: 'linear-gradient(135deg,#78350f,#c2410c)',
        fullName: 'Bitcoin / USD',
        exchange: 'Cripto OTC / Spot ETF',
        context: 'Principal criptoactivo por capitalización. Actúa como activo de riesgo en mercados alcistas y como reserva de valor alternativa en pérdida de confianza institucional. Desde los ETFs spot de 2024, tiene correlación creciente con flujos institucionales.',
        monitors: ['Flujos ETF spot BTC','Halvings','Regulación SEC / CFTC','Fear & Greed Index','Liquidez macro global','Narrativa IA / activos digitales'],
        impacts: [
            { label:'NASDAQ',  desc:'Perfil risk-on compartido: ambos caen en sell-offs macro.' },
            { label:'Ethereum',desc:'Correlación alta (>0.90); ETH amplifica los movimientos del BTC.' },
            { label:'Oro',     desc:'Narrativa "oro digital": en algunos contextos actúan como sustitutos.' },
            { label:'DXY',     desc:'Dólar fuerte presiona a BTC vía reducción de apetito por risk-on.' },
        ],
    },
    'DXY': {
        gradient: 'linear-gradient(135deg,#0f172a,#1e3a5f)',
        fullName: 'US Dollar Index',
        exchange: 'ICE Futures',
        context: 'Índice que mide la fortaleza del dólar frente a una canasta de 6 divisas principales (EUR 57.6%, JPY 13.6%, GBP 11.9%, CAD 9.1%, SEK 4.2%, CHF 3.6%). Barómetro del dólar a nivel global.',
        monitors: ['Decisiones Fed (FOMC)','Diferenciales de tasas G10','Inflación EE.UU.','Flujos a treasuries','Riesgo geopolítico global','EUR/USD (mayor ponderación)'],
        impacts: [
            { label:'Materias primas',desc:'DXY sube → Oro, Petróleo, Plata bajan (denominados en USD).' },
            { label:'Emergentes',     desc:'DXY alto presiona divisas EM, encarece deuda externa en dólares.' },
            { label:'USD/MXN',        desc:'Correlación directa: DXY sube → USD/MXN sube (peso se debilita).' },
            { label:'S&P 500',        desc:'Dólar muy fuerte reduce utilidades de multinacionales EE.UU. (efecto FX).' },
        ],
    },
};

function openMktDetail(idx) {
    if (!_mktCapData || !_mktCapData[idx]) return;
    const entry   = _mktCapData[idx];
    const profile = MKT_CAP_PROFILES[entry.asset.label];
    if (!profile) return;

    const meta    = entry.meta || {};
    const candles = entry.candles || [];
    const price   = meta.regularMarketPrice;
    const pct     = meta.regularMarketChangePercent;
    const high    = meta.regularMarketDayHigh;
    const low     = meta.regularMarketDayLow;

    const isUp = (pct ?? 0) >= 0;
    const arrow = pct == null ? '' : isUp ? '▲' : '▼';

    function fmtP(n) {
        if (n == null) return '—';
        if (n >= 10000) return n.toLocaleString('es-MX', { maximumFractionDigits: 0 });
        if (n >= 1)     return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return n.toFixed(4);
    }

    const priceStr = fmtP(price);
    const pctStr   = pct != null ? (isUp ? '+' : '') + pct.toFixed(2) + '%' : '—';
    const pctColor = pct == null ? '#64748b' : isUp ? '#86efac' : '#fca5a5';

    let fiveDPct = '';
    if (candles.length >= 2) {
        const closes = candles.map(c => c.close);
        const lo = Math.min(...closes), hi = Math.max(...closes);
        fiveDPct = ((hi - lo) / lo * 100).toFixed(1) + '%';
    }

    let absChange = '—';
    if (price != null && pct != null) {
        const prev = price / (1 + pct / 100);
        const diff = price - prev;
        absChange = (diff >= 0 ? '+' : '-') + fmtP(Math.abs(diff));
    }

    document.getElementById('mm-gradient').style.background = profile.gradient;
    document.getElementById('mm-label').textContent    = entry.asset.label;
    document.getElementById('mm-sub').textContent      = entry.asset.sub + ' · ' + profile.exchange;
    document.getElementById('mm-price').textContent    = priceStr;
    document.getElementById('mm-pct').textContent      = arrow + ' ' + pctStr;
    document.getElementById('mm-pct').style.color      = pctColor;
    document.getElementById('mm-fullname').textContent = profile.fullName;
    document.getElementById('mm-context').textContent  = profile.context;

    document.getElementById('mm-metrics').innerHTML = [
        ['Precio Actual',  priceStr,    null],
        ['Variación Día',  arrow + ' ' + pctStr + (absChange !== '—' ? ' (' + absChange + ')' : ''), pct == null ? '#64748b' : isUp ? '#16a34a' : '#dc2626'],
        ['Máximo Día',     fmtP(high),  null],
        ['Mínimo Día',     fmtP(low),   null],
        ['Rango 5 Días',   fiveDPct || '—', null],
    ].map(([l, v, c]) =>
        `<div class="bm-metric-row"><span class="bm-metric-lbl">${l}</span><span class="bm-metric-val"${c ? ` style="color:${c}"` : ''}>${v}</span></div>`
    ).join('');

    document.getElementById('mm-monitors').innerHTML = profile.monitors.map(m =>
        `<span class="bm-risk-tag" style="margin:.2rem .2rem .2rem 0">${m}</span>`
    ).join('');

    document.getElementById('mm-impacts').innerHTML = profile.impacts.map(imp =>
        `<div class="bm-metric-row" style="align-items:flex-start;gap:.5rem"><span class="bm-metric-lbl" style="flex:0 0 auto;min-width:90px;padding-top:.1rem">${imp.label}</span><span class="bm-metric-val" style="font-size:.77rem;color:#475569;font-family:inherit;font-weight:400;text-align:left;white-space:normal;line-height:1.5">${imp.desc}</span></div>`
    ).join('');

    document.getElementById('mm-ai-box').innerHTML = '<span class="bm-ai-badge">VALL-AI</span> <span style="color:#64748b;font-size:.8rem">Analizando con Gemini…</span>';
    document.getElementById('mm-report').textContent = '';
    document.getElementById('mm-report-section').style.display = 'none';

    document.getElementById('mkt-modal-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';

    loadGeminiMktAnalysis(profile, entry.asset.label, priceStr, pctStr, fiveDPct);
}

function closeMktModal() {
    document.getElementById('mkt-modal-overlay').classList.remove('open');
    document.body.style.overflow = '';
}

function copyMktReport() {
    var text = (document.getElementById('mm-report') || {}).textContent || '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(function () {
        var btn = document.querySelector('#mkt-modal .mm-copy-btn');
        if (btn) { var orig = btn.innerHTML; btn.innerHTML = '<i class="fas fa-check"></i> Copiado'; setTimeout(function () { btn.innerHTML = orig; }, 2000); }
    }).catch(function () {});
}

function printMktReport() {
    var text  = (document.getElementById('mm-report') || {}).textContent || '';
    var asset = (document.getElementById('mm-label') || {}).textContent || 'Activo';
    var w = window.open('', '_blank', 'width=700,height=900');
    if (!w) return;
    w.document.write('<html><head><title>Reporte ' + asset + ' - VALL News</title><style>body{font-family:Courier New,monospace;font-size:12px;padding:2cm;color:#1e293b;}pre{white-space:pre-wrap;line-height:1.75;}</style></head><body><pre>' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre></body></html>');
    w.document.close(); w.focus();
    setTimeout(function () { w.print(); w.close(); }, 600);
}

async function loadGeminiMktAnalysis(profile, label, priceStr, pctStr, fiveDPct) {
    const aiBox         = document.getElementById('mm-ai-box');
    const reportSection = document.getElementById('mm-report-section');
    const reportEl      = document.getElementById('mm-report');

    const prompt = `Eres VALL-AI, analista de mercados para VALL News. Analiza el siguiente activo y entrega un análisis profesional en ESPAÑOL.

ACTIVO: ${label} (${profile.fullName})
EXCHANGE: ${profile.exchange}
PRECIO ACTUAL: ${priceStr}
VARIACIÓN DÍA: ${pctStr}
RANGO 5 DÍAS: ${fiveDPct || 'N/D'}
CONTEXTO: ${profile.context}

Entrega exactamente estas 4 secciones:

1. ANÁLISIS DE LA SESIÓN (2-3 oraciones): interpreta la variación de hoy en contexto macro.
2. FACTORES CLAVE: 3 bullets concisos de qué está moviendo al activo ahora.
3. QUÉ VIGILAR: 2 catalizadores próximos que pueden mover el precio.
4. SESGO DE CORTO PLAZO: una oración con dirección probable (alcista/bajista/neutral) y por qué.

Sé directo, técnico y útil. Sin frases de apertura genéricas.`;

    try {
        const text = await VDS.geminiChat(prompt, 'Eres un analista financiero institucional de VALL News. Responde en español, de forma concisa y profesional. Máximo 180 palabras.');
        if (!text) throw new Error('respuesta vacía');

        aiBox.innerHTML = '<span class="bm-ai-badge">VALL-AI</span><div style="margin-top:.5rem;line-height:1.65;white-space:pre-wrap;font-size:.83rem;color:#1e293b">' +
            text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';

        const now = new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
        reportEl.textContent = `════════════════════════════════════════
REPORTE EJECUTIVO — ${label.toUpperCase()}
${profile.fullName}
${profile.exchange}
Generado: ${now}
════════════════════════════════════════

DATOS DE SESIÓN
  Precio Actual : ${priceStr}
  Variación Día : ${pctStr}
  Rango 5 Días  : ${fiveDPct || 'N/D'}

ANÁLISIS VALL-AI
${text}

════════════════════════════════════════
VALL News · Inteligencia Financiera
════════════════════════════════════════`;
        reportSection.style.display = 'block';
    } catch (e) {
        aiBox.innerHTML = '<span class="bm-ai-badge">VALL-AI</span> <span style="color:#ef4444;font-size:.8rem">No se pudo cargar el análisis · ' + e.message + '</span>';
    }
}


/* ---- bloque ---- */


/* ── FX Detail Modal Logic ───────────────────────────────── */
const FX_PROFILES = {
    'USD/MXN': {
        gradient: 'linear-gradient(135deg,#003a2c,#065f46)',
        fullName: 'Dolar Americano / Peso Mexicano',
        context: 'Par de divisas mas seguido en Mexico. Refleja la relacion economica directa entre EE.UU. y Mexico. Altamente sensible al diferencial de tasas Banxico-Fed, precio del petroleo y flujos de remesas.',
        monitors: ['Diferencial Banxico vs Fed','Precio WTI','Remesas (soporte peso)','IED / Nearshoring','NFP EE.UU.','Politica fiscal MX'],
        impacts: [
            { label:'IPC',         desc:'Peso debil encarece importaciones, presiona margenes de emisoras.' },
            { label:'Bonos MX',    desc:'Depreciacion presiona a Banxico a subir tasas - bonos caen de precio.' },
            { label:'DXY',         desc:'USD/MXN sigue de cerca al DXY: dolar global fuerte = MXN debil.' },
            { label:'Inflacion MX',desc:'Tipo de cambio alto importa inflacion via bienes transables.' },
        ],
    },
    'EUR/MXN': {
        gradient: 'linear-gradient(135deg,#003087,#0051a5)',
        fullName: 'Euro / Peso Mexicano',
        context: 'Par calculado (cross-rate) que refleja la fuerza del Euro frente al peso. Combina la dinamica del BCE (politica monetaria europea) con el entorno macroeconomico mexicano.',
        monitors: ['Decisiones BCE','EUR/USD','USD/MXN','Inflacion eurozona','Confianza empresarial alemana','Riesgo soberano EU'],
        impacts: [
            { label:'EUR/USD',       desc:'Driver principal del numerador; subida de tasas BCE fortalece el euro.' },
            { label:'USD/MXN',       desc:'La debilidad del peso amplifica los movimientos del cross.' },
            { label:'Comercio MX-EU',desc:'Mexico exporta manufactura a Europa; el tipo de cambio afecta competitividad.' },
            { label:'Turismo',       desc:'EUR/MXN alto encarece Mexico para turistas europeos.' },
        ],
    },
    'GBP/MXN': {
        gradient: 'linear-gradient(135deg,#1a237e,#283593)',
        fullName: 'Libra Esterlina / Peso Mexicano',
        context: 'Cross-rate entre la libra y el peso. Influenciado por la politica del Banco de Inglaterra, datos economicos del Reino Unido post-Brexit y el entorno del USD/MXN.',
        monitors: ['Decisiones BoE','GBP/USD','Inflacion UK','USD/MXN','PIB Reino Unido','Riesgo politico UK'],
        impacts: [
            { label:'GBP/USD',    desc:'La fortaleza de la libra vs dolar determina el numerador del cross.' },
            { label:'USD/MXN',    desc:'La debilidad del peso amplifica o reduce el efecto libra.' },
            { label:'Inflacion UK',desc:'Sorpresas inflacionarias mueven las expectativas de tasas del BoE.' },
            { label:'Brexit',     desc:'Incertidumbre comercial UK-EU puede presionar a la baja a GBP.' },
        ],
    },
    'JPY/MXN': {
        gradient: 'linear-gradient(135deg,#7f0000,#b71c1c)',
        fullName: 'Yen Japones / Peso Mexicano (x100)',
        context: 'Cross calculado como (USD/MXN div USD/JPY) x 100. El yen es moneda refugio que se aprecia en escenarios de risk-off global. Se muestra en unidades de 100 JPY por convencion.',
        monitors: ['Politica BoJ (YCC / tasas)','USD/JPY','Carry trade JPY','Apetito riesgo global','Inflacion Japon','USD/MXN'],
        impacts: [
            { label:'Carry trade',   desc:'JPY es divisa de financiamiento; liquidacion del carry lo fortalece.' },
            { label:'VIX / Risk-off',desc:'En panico de mercado el yen se aprecia (vuelo a calidad).' },
            { label:'USD/JPY',       desc:'Driver principal del denominador; BoJ controla tasas con YCC.' },
            { label:'USD/MXN',       desc:'El numerador del cross depende del peso vs dolar.' },
        ],
    },
    'BRL/MXN': {
        gradient: 'linear-gradient(135deg,#1b5e20,#2e7d32)',
        fullName: 'Real Brasileno / Peso Mexicano',
        context: 'Cross-rate entre las dos principales monedas emergentes de America Latina. Util para comparar competitividad regional. Ambas divisas son sensibles al apetito de riesgo global y precios de materias primas.',
        monitors: ['Selic (tasa BCB)','USD/BRL','USD/MXN','Precio de commodities','Riesgo politico Brasil','Flujos EM globales'],
        impacts: [
            { label:'Materias primas',desc:'Brasil exporta soya, hierro, petroleo; commodities altas fortalecen BRL.' },
            { label:'USD/BRL',        desc:'Driver directo del real; politica del Banco Central do Brasil.' },
            { label:'USD/MXN',        desc:'El peso mexicano define el denominador del cross.' },
            { label:'Riesgo politico',desc:'Ambas economias son sensibles a riesgo politico interno.' },
        ],
    },
    'CAD/MXN': {
        gradient: 'linear-gradient(135deg,#880000,#c62828)',
        fullName: 'Dolar Canadiense / Peso Mexicano',
        context: 'Cross-rate entre el loonie y el peso. Ambas economias estan integradas con EE.UU. y son exportadoras de petroleo. El T-MEC (USMCA) alinea los ciclos economicos de los tres paises.',
        monitors: ['Precio WTI / WCS','USD/CAD','Decisiones BoC','USD/MXN','PIB Canada','T-MEC / aranceles'],
        impacts: [
            { label:'Petroleo',desc:'Canada y Mexico exportan crudo; precio del WTI afecta a ambas divisas.' },
            { label:'USD/CAD', desc:'Driver principal del CAD; politica monetaria del Banco de Canada.' },
            { label:'T-MEC',   desc:'El tratado comercial alinea los ciclos economicos de ambos paises.' },
            { label:'USD/MXN', desc:'El peso define el denominador del cross.' },
        ],
    },
    'CNY/MXN': {
        gradient: 'linear-gradient(135deg,#7b0000,#ad1457)',
        fullName: 'Yuan Chino / Peso Mexicano',
        context: 'Cross-rate entre el yuan renminbi y el peso. Relevante por el creciente comercio bilateral y la competencia manufacturera China-Mexico. El yuan es parcialmente administrado por el PBoC.',
        monitors: ['Politica PBoC','USD/CNY (fijacion diaria)','USD/MXN','Balanza comercial China','Aranceles EE.UU.-China','Nearshoring'],
        impacts: [
            { label:'Aranceles EE.UU.',  desc:'Tensiones arancelarias vs China benefician al nearshoring en Mexico.' },
            { label:'PBoC / devaluacion',desc:'Devaluacion del yuan abarata exportaciones chinas vs mexicanas.' },
            { label:'USD/CNY',           desc:'El tipo de cambio oficial administrado define el driver del yuan.' },
            { label:'Manufactura',       desc:'CNY debil hace mas competitiva a China vs Mexico.' },
        ],
    },
};

function _fxChartSVG(candles, isUp, idx) {
    if (!candles || candles.length < 2) {
        return '<div style="display:flex;align-items:center;justify-content:center;height:160px;color:#94a3b8;font-size:.75rem;">Sin datos de grafica</div>';
    }
    var W = 500, H = 160;
    var PAD = { t: 16, r: 16, b: 36, l: 56 };
    var cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
    var closes = candles.map(function(c) { return c.close; });
    var minV = Math.min.apply(null, closes), maxV = Math.max.apply(null, closes);
    var range = maxV - minV || minV * 0.01;
    var padded = range * 0.15;
    var lo = minV - padded, hi = maxV + padded;
    function xOf(i) { return PAD.l + (i / (closes.length - 1)) * cW; }
    function yOf(v) { return PAD.t + (1 - (v - lo) / (hi - lo)) * cH; }
    var color  = isUp ? '#16a34a' : '#dc2626';
    var gradId = 'fxg' + idx;
    var pts    = closes.map(function(v, i) { return { x: xOf(i), y: yOf(v) }; });
    var d = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
    for (var i = 1; i < pts.length; i++) {
        var cp = ((pts[i-1].x + pts[i].x) / 2).toFixed(1);
        d += ' C ' + cp + ' ' + pts[i-1].y.toFixed(1) + ', ' + cp + ' ' + pts[i].y.toFixed(1) + ', ' + pts[i].x.toFixed(1) + ' ' + pts[i].y.toFixed(1);
    }
    var bottom = (PAD.t + cH).toFixed(1);
    var fillD  = d + ' L ' + xOf(closes.length - 1).toFixed(1) + ' ' + bottom + ' L ' + PAD.l.toFixed(1) + ' ' + bottom + ' Z';
    var yTicks = [0.1, 0.5, 0.9].map(function(f) {
        var v = lo + (hi - lo) * f;
        var y = yOf(v).toFixed(1);
        var lbl = v >= 100 ? v.toFixed(0) : v.toFixed(3);
        return '<line x1="' + PAD.l + '" y1="' + y + '" x2="' + (W - PAD.r) + '" y2="' + y + '" stroke="rgba(0,0,0,.07)" stroke-width="1"/>' +
               '<text x="' + (PAD.l - 6) + '" y="' + y + '" text-anchor="end" dominant-baseline="middle" font-size="9" fill="#94a3b8">' + lbl + '</text>';
    }).join('');
    function fmtDate(s) { var dt = new Date(s); return dt.toLocaleDateString('es-MX', { month:'short', day:'numeric' }); }
    var xLabels =
        '<text x="' + PAD.l + '" y="' + (H - 8) + '" text-anchor="start" font-size="9" fill="#94a3b8">' + fmtDate(candles[0].time) + '</text>' +
        '<text x="' + (W - PAD.r) + '" y="' + (H - 8) + '" text-anchor="end" font-size="9" fill="#94a3b8">' + fmtDate(candles[candles.length - 1].time) + '</text>';
    var lastX = xOf(closes.length - 1).toFixed(1);
    var lastY = yOf(closes[closes.length - 1]).toFixed(1);
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:160px;display:block;">' +
        '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="' + color + '" stop-opacity=".28"/>' +
            '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/>' +
        '</linearGradient></defs>' +
        yTicks +
        '<path d="' + fillD + '" fill="url(#' + gradId + ')"/>' +
        '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<circle cx="' + lastX + '" cy="' + lastY + '" r="4" fill="' + color + '" stroke="#fff" stroke-width="2"/>' +
        xLabels +
    '</svg>';
}

function openFxDetail(idx) {
    if (!_fxData || !_fxData[idx]) return;
    var it      = _fxData[idx];
    var profile = FX_PROFILES[it.pair.label];
    if (!profile || !it.price) return;
    var pair    = it.pair;
    var price   = it.price;
    var pct     = it.pct;
    var candles = it.candles;
    var isUp    = (pct == null ? 0 : pct) >= 0;
    var arrow   = pct == null ? '' : (isUp ? '▲' : '▼');
    var disp    = pair.mode === 'jpy_cross' ? price.toFixed(4) : price.toFixed(2);
    var pctStr  = pct != null ? (isUp ? '+' : '') + pct.toFixed(2) + '%' : '—';
    var pctColor = pct == null ? '#64748b' : (isUp ? '#86efac' : '#fca5a5');
    var range5d = '—';
    if (candles && candles.length >= 2) {
        var cls = candles.map(function(c) { return c.close; });
        var clo = Math.min.apply(null, cls), chi = Math.max.apply(null, cls);
        range5d = ((chi - clo) / clo * 100).toFixed(2) + '%';
    }
    var absChange = '—';
    if (pct != null) {
        var prev = price / (1 + pct / 100);
        var diff = price - prev;
        absChange = (diff >= 0 ? '+' : '') + Math.abs(diff).toFixed(pair.mode === 'jpy_cross' ? 4 : 2);
    }
    document.getElementById('fx-gradient').style.background = profile.gradient;
    document.getElementById('fm-flag').textContent   = pair.flag;
    document.getElementById('fm-label').textContent  = pair.label;
    document.getElementById('fm-note').textContent   = profile.fullName;
    document.getElementById('fm-price').textContent  = '$' + disp;
    document.getElementById('fm-pct').textContent    = arrow + ' ' + pctStr;
    document.getElementById('fm-pct').style.color    = pctColor;
    document.getElementById('fm-chart').innerHTML    = _fxChartSVG(candles, isUp, idx);
    document.getElementById('fm-metrics').innerHTML  = [
        ['Precio Actual', '$' + disp, null],
        ['Variacion Dia', arrow + ' ' + pctStr + (absChange !== '—' ? ' (' + absChange + ')' : ''), pct == null ? '#64748b' : isUp ? '#16a34a' : '#dc2626'],
        ['Rango 5 Dias',  range5d,    null],
        ['Par Origen',    pair.ticker, null],
        ['Calculo',       pair.mode === 'direct' ? 'Cotizacion directa' : 'Cross-rate calculado', '#64748b'],
    ].map(function(r) {
        return '<div class="bm-metric-row"><span class="bm-metric-lbl">' + r[0] + '</span><span class="bm-metric-val"' + (r[2] ? ' style="color:' + r[2] + '"' : '') + '>' + r[1] + '</span></div>';
    }).join('');
    document.getElementById('fm-context').textContent = profile.context;
    document.getElementById('fm-monitors').innerHTML = profile.monitors.map(function(m) {
        return '<span class="bm-risk-tag" style="margin:.2rem .2rem .2rem 0">' + m + '</span>';
    }).join('');
    document.getElementById('fm-impacts').innerHTML = profile.impacts.map(function(imp) {
        return '<div class="bm-metric-row" style="align-items:flex-start;gap:.5rem">' +
            '<span class="bm-metric-lbl" style="flex:0 0 auto;min-width:90px;padding-top:.1rem">' + imp.label + '</span>' +
            '<span class="bm-metric-val" style="font-size:.77rem;color:#475569;font-family:inherit;font-weight:400;text-align:left;white-space:normal;line-height:1.5">' + imp.desc + '</span></div>';
    }).join('');
    document.getElementById('fm-ai-box').innerHTML = '<span class="bm-ai-badge">VALL-AI</span> <span style="color:#64748b;font-size:.8rem">Analizando con Gemini…</span>';
    document.getElementById('fm-report').textContent = '';
    document.getElementById('fm-report-section').style.display = 'none';
    document.getElementById('fx-modal-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    loadGeminiFxAnalysis(profile, pair.label, disp, pctStr);
}

function closeFxModal() {
    document.getElementById('fx-modal-overlay').classList.remove('open');
    document.body.style.overflow = '';
}

function copyFxReport() {
    var text = (document.getElementById('fm-report') || {}).textContent || '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(function () {
        var btn = document.querySelector('#fx-modal .fm-copy-btn');
        if (btn) { var orig = btn.innerHTML; btn.innerHTML = '<i class="fas fa-check"></i> Copiado'; setTimeout(function () { btn.innerHTML = orig; }, 2000); }
    }).catch(function () {});
}

function printFxReport() {
    var text  = (document.getElementById('fm-report') || {}).textContent || '';
    var label = (document.getElementById('fm-label') || {}).textContent || 'Divisa';
    var w = window.open('', '_blank', 'width=700,height=900');
    if (!w) return;
    w.document.write('<html><head><title>Reporte ' + label + ' - VALL News</title><style>body{font-family:Courier New,monospace;font-size:12px;padding:2cm;color:#1e293b;}pre{white-space:pre-wrap;line-height:1.75;}</style></head><body><pre>' + text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</pre></body></html>');
    w.document.close(); w.focus();
    setTimeout(function () { w.print(); w.close(); }, 600);
}

async function loadGeminiFxAnalysis(profile, label, priceStr, pctStr) {
    var aiBox         = document.getElementById('fm-ai-box');
    var reportSection = document.getElementById('fm-report-section');
    var reportEl      = document.getElementById('fm-report');
    var prompt = 'Eres VALL-AI, analista de mercados cambiarios para VALL News. Analiza la siguiente divisa y entrega un analisis profesional en ESPANOL.\n\n' +
        'PAR: ' + label + ' (' + profile.fullName + ')\n' +
        'PRECIO ACTUAL: $' + priceStr + ' MXN\n' +
        'VARIACION DIA: ' + pctStr + '\n' +
        'CONTEXTO: ' + profile.context + '\n\n' +
        'Entrega exactamente estas 4 secciones:\n\n' +
        '1. ANALISIS DE LA SESION (2-3 oraciones): interpreta la variacion de hoy en contexto macro/cambiario.\n' +
        '2. FACTORES CLAVE: 3 bullets concisos de que esta moviendo al tipo de cambio ahora.\n' +
        '3. QUE VIGILAR: 2 catalizadores proximos que pueden mover el precio.\n' +
        '4. SESGO DE CORTO PLAZO: una oracion con direccion probable (apreciacion/depreciacion/lateral) y por que.\n\n' +
        'Se directo, tecnico y util. Sin frases de apertura genericas.';
    try {
        var text = await VDS.geminiChat(prompt, 'Eres un analista financiero institucional de VALL News. Responde en español, de forma concisa y profesional. Máximo 180 palabras.');
        if (!text) throw new Error('respuesta vacia');
        aiBox.innerHTML = '<span class="bm-ai-badge">VALL-AI</span><div style="margin-top:.5rem;line-height:1.65;white-space:pre-wrap;font-size:.83rem;color:#1e293b">' +
            text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>';
        var now = new Date().toLocaleString('es-MX', { dateStyle:'long', timeStyle:'short' });
        reportEl.textContent =
            '════════════════════════════════════════\n' +
            'REPORTE EJECUTIVO - ' + label + '\n' +
            profile.fullName + '\n' +
            'Generado: ' + now + '\n' +
            '════════════════════════════════════════\n\n' +
            'DATOS DE SESION\n' +
            '  Precio Actual : $' + priceStr + ' MXN\n' +
            '  Variacion Dia : ' + pctStr + '\n\n' +
            'ANALISIS VALL-AI\n' +
            text + '\n\n' +
            '════════════════════════════════════════\n' +
            'VALL News - Inteligencia Financiera\n' +
            '════════════════════════════════════════';
        reportSection.style.display = 'block';
    } catch (e) {
        aiBox.innerHTML = '<span class="bm-ai-badge">VALL-AI</span> <span style="color:#ef4444;font-size:.8rem">No se pudo cargar el analisis - ' + e.message + '</span>';
    }
}


/* ---- bloque ---- */


/* ── Apetito de Riesgo · Credit Detail Modal ───────────────────────── */
var _CREDIT_META = {
  hyg:    { icon:'📉', lbl:'Bonos de Alto Riesgo',        sub:'iShares iBoxx HYG · ETF High-Yield · Var. diaria'   },
  lqd:    { icon:'🛡',  lbl:'Bonos Seguros Corporativos',  sub:'iShares iBoxx LQD · ETF Inv. Grade · Var. diaria'   },
  spread: { icon:'📊', lbl:'Diferencial de Sentimiento',  sub:'HYG − LQD · Termómetro risk-on / risk-off'          },
  cds:    { icon:'🇲🇽', lbl:'Riesgo País México',           sub:'Credit Default Swap Soberano 5Y · bps'              },
};

function openCreditDetail(key) {
  var d = _creditData || {};
  var m = _CREDIT_META[key];
  if (!m) return;
  var overlay = document.getElementById('credit-modal-overlay');
  if (!overlay) return;
  var now = new Date();
  var timeStr = now.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  var dateStr = now.toLocaleDateString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  function row(lbl,v){ return '<div class="bm-metric-row"><span class="bm-metric-lbl">'+lbl+'</span><span class="bm-metric-val">'+v+'</span></div>'; }

  var valStr, chgStr, level, metrics, analysis, domain;

  var fmtPct = function(v){ return typeof v==='number'?(v>=0?'+':'')+v.toFixed(2)+'%':'--'; };
  var spr = (typeof d.hygPct==='number'&&typeof d.lqdPct==='number') ? d.hygPct - d.lqdPct : null;

  if (key === 'hyg') {
    valStr = fmtPct(d.hygPct);
    level  = d.hygPct==null?'--':d.hygPct>0.1?'DEMANDA ALTA':d.hygPct>-0.1?'NEUTRAL':'VENTA';
    chgStr = 'vs cierre anterior';
    metrics = row('Variación diaria HYG', valStr)
            + row('Variación diaria LQD', fmtPct(d.lqdPct))
            + row('Diferencial (HYG−LQD)', spr!=null?(spr>=0?'+':'')+spr.toFixed(2)+' pp':'--')
            + row('Nivel de apetito', level)
            + row('Componentes', 'Bonos corp. EE.UU. BB–B · vto. ~5 años');
    analysis = d.hygPct>0.1
      ? 'El ETF de bonos de alto rendimiento <strong>HYG sube '+valStr+'</strong> hoy. Cuando los bonos "basura" suben, los inversores están dispuestos a asumir riesgo de impago a cambio de mayor retorno — señal clásica de apetito de riesgo (risk-on). Esto generalmente acompaña subidas en bolsa y presión bajista sobre activos refugio como el oro o los bonos del Tesoro.'
      : d.hygPct<-0.1
      ? 'El ETF HYG <strong>cae '+valStr+'</strong> hoy, señal de que los inversores están saliendo de activos de crédito de baja calidad. Cuando la deuda de alto riesgo cae más que la deuda segura, el mercado está en modo defensivo — los inversores prefieren calidad y seguridad sobre rendimiento.'
      : 'HYG registra un movimiento mínimo hoy (<strong>'+valStr+'</strong>). Los flujos de capital en crédito corporativo de alto riesgo están en equilibrio — el mercado no envía señal clara de dirección. Este escenario suele preceder a movimientos más pronunciados.';
    domain = 'crédito corporativo de alto rendimiento y apetito de riesgo global';

  } else if (key === 'lqd') {
    valStr = fmtPct(d.lqdPct);
    level  = d.lqdPct==null?'--':d.lqdPct>0.1?'REFUGIO ACTIVO':d.lqdPct>-0.1?'ESTABLE':'SALIDA';
    chgStr = 'vs cierre anterior';
    metrics = row('Variación diaria LQD', valStr)
            + row('Variación diaria HYG', fmtPct(d.hygPct))
            + row('Diferencial (HYG−LQD)', spr!=null?(spr>=0?'+':'')+spr.toFixed(2)+' pp':'--')
            + row('Calidad crediticia', 'AAA a BBB (grado de inversión)')
            + row('Componentes', 'Bonos corp. EE.UU. alta calidad · ~10 años promedio');
    analysis = d.lqdPct>0.1
      ? 'El ETF de bonos seguros <strong>LQD sube '+valStr+'</strong>. Cuando los bonos de alta calidad crediticia atraen flujos de capital, los inversores están buscando seguridad — señal de cautela. Si LQD sube más que HYG, el mercado está en modo risk-off.'
      : d.lqdPct<-0.1
      ? '<strong>LQD cae '+valStr+'</strong> hoy. Las salidas de deuda de grado de inversión pueden indicar que los inversores están rotando hacia activos de mayor rendimiento (acciones, alto rendimiento) — señal de confianza y apetito de riesgo.'
      : 'LQD muestra estabilidad (<strong>'+valStr+'</strong>). Los bonos corporativos de alta calidad no registran movimientos de flujo relevantes. El mercado crediticio de grado de inversión opera en modo neutral.';
    domain = 'crédito corporativo de grado de inversión y mercados de renta fija';

  } else if (key === 'spread') {
    valStr = spr!=null?(spr>=0?'+':'')+spr.toFixed(2)+' pp':'--';
    level  = spr==null?'--':spr>0.15?'RISK-ON':spr>-0.15?'NEUTRAL':'RISK-OFF';
    chgStr = 'HYG vs LQD · hoy';
    metrics = row('HYG (alto riesgo)', fmtPct(d.hygPct))
            + row('LQD (inversión segura)', fmtPct(d.lqdPct))
            + row('Diferencial (HYG−LQD)', valStr)
            + row('Veredicto', level)
            + row('Umbral risk-on', '> +0.15 pp')
            + row('Umbral risk-off', '< −0.15 pp');
    analysis = spr>0.15
      ? 'El diferencial HYG−LQD es <strong>'+valStr+'</strong> hoy — señal de <strong>Risk-On</strong>. Los bonos de alto riesgo superan a los seguros: el mercado crediticio está en modo ofensivo. Los inversores globales están aceptando mayor riesgo de impago a cambio de más retorno. Históricamente, esto acompaña mercados de renta variable alcistas.'
      : spr<-0.15
      ? 'El diferencial HYG−LQD es <strong>'+valStr+'</strong> — señal de <strong>Risk-Off</strong>. Los bonos seguros superan a los de riesgo: el capital está huyendo hacia activos de calidad. Esto puede anticipar correcciones en bolsa, fortaleza del dólar y presión sobre mercados emergentes como México.'
      : 'El diferencial es <strong>'+valStr+'</strong> — mercado en modo <strong>Neutral</strong>. La diferencia entre los retornos de bonos de alto riesgo y bonos seguros es mínima. No hay señal direccional clara en los mercados de crédito global. Típicamente implica espera ante un catalizador (dato macro, Fed, geopolítica).';
    domain = 'apetito de riesgo global, mercados de crédito y sentimiento de inversores';

  } else if (key === 'cds') {
    valStr = '~95 bps';
    level  = 'MODERADO';
    chgStr = 'Valor de referencia · no tiempo real';
    metrics = row('CDS MX 5Y', '~95 bps')
            + row('Nivel histórico bajo', '~60 bps (2017)')
            + row('Nivel de estrés', '> 200 bps')
            + row('Contexto regional', 'Brasil ~150 bps · Colombia ~180 bps')
            + row('Fuente', 'Referencia institucional · no tiempo real');
    analysis = 'El CDS soberano de México a 5 años en <strong>~95 bps</strong> refleja un nivel de riesgo <strong>moderado</strong>. El Credit Default Swap es esencialmente el precio de asegurar contra el impago de deuda mexicana: a mayor CDS, más cara es esa "póliza" y mayor el riesgo percibido por el mercado. Con 95 bps, México se percibe con riesgo manejable en el contexto de mercados emergentes, aunque por encima de los mínimos históricos del sexenio anterior (~60 bps). Factores que pueden moverlo: tensión fiscal (deuda de Pemex, CFE), política monetaria de Banxico, el diferencial TIIE-Fed, y factores geopolíticos como aranceles o relación bilateral con EE.UU.';
    domain = 'riesgo soberano de México, deuda emergente y política fiscal';
  }

  document.getElementById('cm-icon').textContent  = m.icon;
  document.getElementById('cm-title').textContent = m.lbl;
  document.getElementById('cm-sub').textContent   = m.sub;
  document.getElementById('cm-val-big').textContent   = valStr;
  document.getElementById('cm-level-badge').textContent = level;
  document.getElementById('cm-upd').textContent   = 'Act. '+timeStr+' · iShares / referencia institucional';
  document.getElementById('cm-metrics').innerHTML = metrics || '';
  document.getElementById('cm-analysis').innerHTML = analysis || 'Sin datos disponibles.';
  document.getElementById('cm-report').textContent = buildGenReport(
    'APETITO DE RIESGO · CRÉDITO GLOBAL', m.lbl, m.sub, valStr, chgStr||'--', level||'--',
    (metrics||'').replace(/<[^>]+>/g,'').replace(/\n+/g,' ').trim(), dateStr, timeStr,
    key==='cds'?'Referencia institucional':'iShares ETF · Yahoo Finance'
  );
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  loadGeminiGenAnalysis('cm-analysis', m.lbl+' ('+m.sub+')', valStr, chgStr||'--', level||'--', domain);
}

function closeCreditModal() {
  var ov = document.getElementById('credit-modal-overlay');
  if (ov) ov.classList.remove('open');
  document.body.style.overflow = '';
}
function copyCreditReport()  { copyModalReport('cm-report',  '#credit-modal .bm-btn-primary'); }
function printCreditReport() { printModalReport('cm-report', (document.getElementById('cm-title')||{}).textContent||'Crédito'); }


/* ---- bloque ---- */


var _PETRO_META = {
  wti:      { icon:'🛢', lbl:'WTI Crudo',           sub:'NYMEX · CL=F · USD/barril' },
  brent:    { icon:'🛢', lbl:'Brent Crudo',          sub:'ICE · BZ=F · USD/barril'  },
  gas:      { icon:'🔥', lbl:'Gas Natural',           sub:'NYMEX · NG=F · USD/MMBtu' },
  mxn:      { icon:'🇲🇽', lbl:'USD/MXN · Tipo de Cambio', sub:'Forex · USD vs Peso Mexicano' },
  spread:   { icon:'📊', lbl:'Spread WTI−Brent',     sub:'Diferencial contango / backwardation' },
  henryhub: { icon:'⚡', lbl:'Gas Natural Henry Hub', sub:'NYMEX · NG=F · USD/MMBtu' },
};

function openPetroDetail(key) {
  var d = _petroData || {};
  var m = _PETRO_META[key];
  if (!m) return;
  var overlay = document.getElementById('petro-modal-overlay');
  if (!overlay) return;
  var now = new Date();
  var timeStr = now.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  var dateStr = now.toLocaleDateString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  function row(lbl, v) { return '<div class="bm-metric-row"><span class="bm-metric-lbl">'+lbl+'</span><span class="bm-metric-val">'+v+'</span></div>'; }

  var val, pct, valStr, chgStr, level, levelColor, metrics, analysis;

  if (key === 'wti') {
    val = d.wti; pct = d.wtiPct;
    valStr = val != null ? '$'+val.toFixed(2) : '--';
    chgStr = pct != null ? (pct>=0?'+':'')+pct.toFixed(2)+'%' : '--';
    level  = val==null?'--':val>90?'ALTO':val>70?'MODERADO':val>50?'BAJO':'MUY BAJO';
    levelColor = val==null?'#64748b':val>80?'#16a34a':val>60?'#d97706':'#dc2626';
    metrics = row('Precio actual', valStr)+row('Var. diaria', chgStr)+row('Referencia Brent', d.brent!=null?'$'+d.brent.toFixed(2):'--')+row('Spread WTI−Brent', d.wti!=null&&d.brent!=null?(d.wti-d.brent>=0?'+':'')+' $'+Math.abs(d.wti-d.brent).toFixed(2):'--')+row('Correlación USD/MXN', 'Alta — WTI sube → MXN se aprecia');
    analysis = val>85?'El WTI en <strong>'+valStr+'</strong> presiona los costos de energía globales. Para México, precios altos benefician los ingresos de Pemex y el presupuesto federal, aunque encarecen importaciones energéticas industriales.'
              :val>65?'Con WTI en <strong>'+valStr+'</strong>, el precio del crudo está en zona equilibrada. Pemex opera con margen, y la correlación peso-petróleo mantiene al MXN relativamente estable.'
              :'El WTI por debajo de los $65 (<strong>'+valStr+'</strong>) presiona los ingresos de Pemex y puede generar revisiones al alza del déficit fiscal de México. El peso suele depreciarse cuando el crudo cae.';
  } else if (key === 'brent') {
    val = d.brent; pct = d.brentPct;
    valStr = val != null ? '$'+val.toFixed(2) : '--';
    chgStr = pct != null ? (pct>=0?'+':'')+pct.toFixed(2)+'%' : '--';
    level  = val==null?'--':val>90?'ALTO':val>70?'MODERADO':'BAJO';
    levelColor = val==null?'#64748b':val>80?'#16a34a':val>60?'#d97706':'#dc2626';
    metrics = row('Precio actual', valStr)+row('Var. diaria', chgStr)+row('WTI (referencia)', d.wti!=null?'$'+d.wti.toFixed(2):'--')+row('Spread Brent−WTI', d.brent!=null&&d.wti!=null?(d.brent-d.wti>=0?'+':'')+' $'+Math.abs(d.brent-d.wti).toFixed(2):'--')+row('Uso principal', 'Referencia global · Europa / Asia');
    analysis = 'El Brent en <strong>'+valStr+'</strong> es la referencia del petróleo para Europa y Asia. Generalmente cotiza con prima respecto al WTI por diferencias de calidad y logística. '+(val>80?'Precios elevados presionan la inflación en economías importadoras de energía.':val>65?'Nivel equilibrado que refleja oferta y demanda global balanceada.':'Precios bajos benefician a importadores netos de crudo pero señalan debilidad de la demanda global.');
  } else if (key === 'gas' || key === 'henryhub') {
    val = d.gas; pct = d.gasPct;
    valStr = val != null ? '$'+val.toFixed(2)+' MMBtu' : '--';
    chgStr = pct != null ? (pct>=0?'+':'')+pct.toFixed(2)+'%' : '--';
    level  = val==null?'--':val>4?'ALTO':val>2.5?'MODERADO':'BAJO';
    levelColor = val==null?'#64748b':val>3.5?'#dc2626':val>2?'#d97706':'#16a34a';
    metrics = row('Precio Henry Hub', valStr)+row('Var. diaria', chgStr)+row('Umbral rentabilidad prod.', '~$2.50/MMBtu')+row('Relación WTI/Gas', d.wti!=null&&d.gas!=null?'Ratio '+(d.wti/d.gas).toFixed(1)+'x':'--')+row('Mercado principal', 'EE.UU. · Referencia LNG global');
    analysis = val>4?'El gas natural en <strong>'+valStr+'</strong> es una señal de tensión en el suministro. Esto presiona los costos industriales y la generación eléctrica, especialmente en Europa donde la dependencia del LNG americano es creciente.'
              :val>2.5?'Con gas en <strong>'+valStr+'</strong>, el mercado está en equilibrio. Los productores de esquisto operan con margen y los exportadores de LNG americanos mantienen contratos rentables.'
              :'El gas en <strong>'+valStr+'</strong> refleja sobreoferta o demanda débil. Señal positiva para energía industrial y generación eléctrica, aunque puede presionar a los productores de gas a recortar perforaciones.';
  } else if (key === 'mxn') {
    val = d.mxn; pct = d.mxnPct;
    valStr = val != null ? '$'+val.toFixed(4) : '--';
    chgStr = pct != null ? (pct>=0?'▲ MXN se debilita ':' ▼ MXN se aprecia ')+(pct>=0?'+':'')+pct.toFixed(2)+'%' : '--';
    level  = val==null?'--':val>20?'PESO DÉBIL':val>18?'NEUTRAL':val>16?'PESO FUERTE':'MUY FUERTE';
    levelColor = val==null?'#64748b':val>20?'#dc2626':val>18.5?'#d97706':'#16a34a';
    metrics = row('USD/MXN actual', valStr)+row('Var. diaria', chgStr)+row('WTI correlación', d.wti!=null?'WTI $'+d.wti.toFixed(2)+' — correlación positiva':'--')+row('Nivel de cambio', level)+row('Fuente', 'Yahoo Finance · spot');
    analysis = val>20?'El tipo de cambio en <strong>'+valStr+'</strong> refleja un peso débil. El costo de importaciones sube, lo que alimenta la inflación. Banxico puede verse presionado a mantener tasas altas para defender al MXN.'
              :val>18?'Con USD/MXN en <strong>'+valStr+'</strong>, el peso se encuentra en zona neutral. La alta tasa real y el diferencial TIIE–Fed sostienen la demanda de activos en MXN. Equilibrio entre carry atractivo y riesgos externos.'
              :'El peso está fuerte en <strong>'+valStr+'</strong>. Esto abarata importaciones y contiene la inflación, pero puede presionar la competitividad exportadora. Ingresos de Pemex en MXN se reducen al convertir dólares.';
  } else if (key === 'spread') {
    var spd = d.wti!=null&&d.brent!=null ? d.wti-d.brent : null;
    valStr = spd != null ? (spd>=0?'+':'')+' $'+Math.abs(spd).toFixed(2) : '--';
    chgStr = spd != null ? (spd<0?'WTI con descuento vs Brent':'WTI con prima vs Brent') : '--';
    level  = spd==null?'--':spd<-3?'BRENT PREMIUM':spd<0?'BRENT LEVE PREM.':spd<3?'PARIDAD':'WTI PREMIUM';
    levelColor = '#d97706';
    metrics = row('WTI', d.wti!=null?'$'+d.wti.toFixed(2):'--')+row('Brent', d.brent!=null?'$'+d.brent.toFixed(2):'--')+row('Spread WTI−Brent', valStr)+row('Estructura', chgStr)+row('Implicación', 'WTI descuento → exportación LTO más competitiva');
    analysis = spd<-2?'El Brent cotiza <strong>'+Math.abs(spd).toFixed(2)+'</strong> dólares sobre el WTI — spread amplio que refleja mayor demanda de crudo europeo o restricciones logísticas en EE.UU. Exportadores americanos de LTO enfrentan menor precio relativo.'
              :Math.abs(spd)<1?'El spread WTI−Brent es mínimo (<strong>'+valStr+'</strong>), señalando condiciones de mercado global integradas y flujos de exportación americanos que equiparan precios de referencia.'
              :'El WTI con prima sobre Brent (<strong>'+valStr+'</strong>) es inusual y puede reflejar interrupciones de suministro en EE.UU. o demanda interna elevada que compite con las exportaciones.';
  }
  document.getElementById('pm-icon').textContent = m.icon;
  document.getElementById('pm-title').textContent = m.lbl;
  document.getElementById('pm-sub').textContent   = m.sub;
  document.getElementById('pm-val-big').textContent  = valStr;
  var badge = document.getElementById('pm-chg-badge');
  badge.textContent = chgStr || level;
  badge.style.background = 'rgba(255,255,255,.12)';
  document.getElementById('pm-upd').textContent = 'Act. '+timeStr+' · Yahoo Finance';
  document.getElementById('pm-metrics').innerHTML = metrics || '';
  document.getElementById('pm-analysis').innerHTML = analysis || 'Sin datos disponibles.';
  document.getElementById('pm-report').textContent = buildGenReport('ENERGÍA Y DIVISAS', m.lbl, m.sub, valStr, chgStr||'--', level||'--', metrics||'', dateStr, timeStr, 'Yahoo Finance');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  loadGeminiGenAnalysis('pm-analysis', m.lbl+' ('+m.sub+')', valStr, chgStr||'--', level||'--', 'energía y divisas');
}
function closePetroModal() {
  var ov = document.getElementById('petro-modal-overlay');
  if (ov) ov.classList.remove('open');
  document.body.style.overflow = '';
}
function copyPetroReport() { copyModalReport('pm-report', '#petro-modal .bm-btn-primary'); }
function printPetroReport() { printModalReport('pm-report', document.getElementById('pm-title')?.textContent||'Energía'); }
function openMacroDetail(key) {
  var d = _macroIntData || {};
  var overlay = document.getElementById('macro-modal-overlay');
  if (!overlay) return;
  var now = new Date();
  var timeStr = now.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  var dateStr = now.toLocaleDateString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  function row(lbl, v) { return '<div class="bm-metric-row"><span class="bm-metric-lbl">'+lbl+'</span><span class="bm-metric-val">'+v+'</span></div>'; }

  var icon, title, sub, valStr, chgStr, level, levelColor, metrics, analysis;

  if (key === 'dxy') {
    icon = '💵'; title = 'DXY · Índice del Dólar'; sub = 'ICE · Cesta 6 divisas vs USD';
    var val = d.dxyCurr, prev = d.dxyPrev;
    valStr = val != null ? val.toFixed(2) : '--';
    var pct = val!=null&&prev!=null ? (val-prev)/prev*100 : null;
    chgStr = pct != null ? (pct>=0?'▲ +':'▼ ')+Math.abs(pct).toFixed(2)+'% vs ayer' : '--';
    level  = val==null?'--':val>104?'DÓLAR FUERTE':val>100?'NEUTRAL':val>96?'DÓLAR DÉBIL':'MUY DÉBIL';
    levelColor = val==null?'#64748b':val>104?'#dc2626':val>100?'#d97706':'#16a34a';
    metrics = row('DXY actual', valStr)+row('Var. vs ayer', chgStr)+row('Nivel', level)+row('EUR/USD (aprox.)', val!=null?'~'+(1.10-(val-100)*0.012).toFixed(3):'--')+row('Implicación EM', val>104?'Presión sobre emergentes y commodities':'Alivio para mercados emergentes');
    analysis = val>104?'El DXY en <strong>'+valStr+'</strong> refleja un dólar fuerte. Esto presiona a las economías emergentes — sus deudas en USD se encarecen, las materias primas denominadas en dólares caen, y los capitales tienden a migrar hacia activos estadounidenses.'
              :val>100?'El DXY en zona neutral (<strong>'+valStr+'</strong>). El dólar mantiene valor, sin presión extrema sobre emergentes. Los commodities se mantienen en niveles equilibrados y los flujos de capital entre regiones son relativamente estables.'
              :'Con DXY en <strong>'+valStr+'</strong>, el dólar es débil. Esto favorece activos de riesgo, commodities en USD y mercados emergentes — sus divisas se aprecian y el costo de servicio de deuda en dólares se reduce.';
  } else if (key === 'tbill') {
    icon = '🏦'; title = 'T-Bill 4W · EE.UU.'; sub = 'US Treasury · Tasa libre de riesgo';
    var val = d.tbill4w, prev = d.tbillPrev;
    valStr = val != null ? val.toFixed(2)+'%' : '--';
    var diff = val!=null&&prev!=null ? val-prev : null;
    chgStr = diff != null ? (diff>=0?'▲ +':'▼ ')+Math.abs(diff).toFixed(2)+'pp vs ayer' : '--';
    var euribor = d.euribor||2.65, boe = d.boe||4.25, boj = d.boj||0.50;
    level = val==null?'--':val>5?'MUY ALTA':val>4?'ALTA':val>2?'MODERADA':'BAJA';
    levelColor = val==null?'#64748b':val>4?'#dc2626':val>2?'#d97706':'#16a34a';
    metrics = row('T-Bill 4W', valStr)+row('Var. diaria', chgStr)+row('vs Euribor 3M', val!=null?((val-euribor)>=0?'+':'')+((val-euribor).toFixed(2))+'pp':'--')+row('vs BOE Rate', val!=null?((val-boe)>=0?'+':'')+((val-boe).toFixed(2))+'pp':'--')+row('vs BOJ Rate', val!=null?((val-boj)>=0?'+':'')+((val-boj).toFixed(2))+'pp':'--');
    analysis = val>4.5?'El T-Bill 4W en <strong>'+valStr+'</strong> representa una tasa libre de riesgo muy alta. Los inversores pueden obtener retornos elevados sin tomar riesgo, lo que compite directamente con la renta variable y los activos emergentes. El costo de oportunidad del capital es máximo.'
              :val>2.5?'Con T-Bill al <strong>'+valStr+'</strong>, la tasa libre de riesgo es moderada-alta. El diferencial frente a otros bancos centrales (Euribor '+euribor+'%, BoJ '+boj+'%) genera flujos hacia activos en USD.'
              :'T-Bill al <strong>'+valStr+'</strong> — tasa baja que favorece el apetito por activos de riesgo. Los inversores buscan mayor rendimiento en renta variable, crédito y mercados emergentes.';
  }

  document.getElementById('mm-icon').textContent = icon;
  document.getElementById('mm-title').textContent = title;
  document.getElementById('mm-sub').textContent   = sub;
  document.getElementById('mm-val-big').textContent  = valStr;
  var badge = document.getElementById('mm-level-badge');
  badge.textContent = level;
  badge.style.background = 'rgba(255,255,255,.12)';
  document.getElementById('mm-upd').textContent = 'Act. '+timeStr+' · Yahoo Finance';
  document.getElementById('mm-metrics').innerHTML = metrics || '';
  document.getElementById('mm-analysis').innerHTML = analysis || 'Sin datos disponibles.';
  document.getElementById('mm-report').textContent = buildGenReport('MACRO INTERNACIONAL', title, sub, valStr, chgStr||'--', level||'--', metrics||'', dateStr, timeStr, 'Yahoo Finance');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  loadGeminiGenAnalysis('mm-analysis', title+' ('+sub+')', valStr, chgStr||'--', level||'--', 'macro internacional y política monetaria global');
}

function closeMacroModal() {
  var ov = document.getElementById('macro-modal-overlay');
  if (ov) ov.classList.remove('open');
  document.body.style.overflow = '';
}
function copyMacroReport() { copyModalReport('mm-report', '#macro-modal .bm-btn-primary'); }
function printMacroReport() { printModalReport('mm-report', document.getElementById('mm-title')?.textContent||'Macro'); }

/* ── Helpers compartidos ───────────────────────────────────────────────── */
function buildGenReport(category, title, sub, valStr, chgStr, level, metrics, dateStr, timeStr, source) {
  var clean = metrics.replace(/<[^>]+>/g,'').replace(/\n+/g,' ').trim();
  return ['========================================','REPORTE '+category,'VALL News -- Inteligencia Economica','========================================',
    'Indicador:          '+title,'Descripcion:        '+sub,'Valor actual:       '+valStr,'Variacion:          '+chgStr,'Nivel:              '+level,
    'Fecha:              '+dateStr,'Hora:               '+timeStr+' (hora local)','Fuente:             '+source,'','--- CONTEXTO ----------------------------',clean,'',
    '--- NOTAS -------------------------------','Este reporte es de caracter informativo.','VALL News no ofrece asesoria de inversion.','========================================'].join('\n');
}

async function loadGeminiGenAnalysis(elId, indicator, valStr, chgStr, level, domain) {
  var el = document.getElementById(elId);
  if (!el) return;
  var prompt = 'Eres analista institucional especializado en '+domain+'. Redacta un análisis conciso (150-180 palabras) del siguiente indicador:\n\nIndicador: '+indicator+'\nValor: '+valStr+'\nVariación: '+chgStr+'\nNivel: '+level+'\n\nIncluye: 1) Qué mide y su importancia, 2) Implicación del valor actual para mercados globales, 3) Perspectiva de corto plazo. Responde en español, sin asteriscos ni markdown, tono profesional institucional.';
  try {
    var text = await VDS.geminiChat(prompt, 'Eres un analista financiero institucional de VALL News. Responde en español, de forma concisa y profesional. Máximo 180 palabras.');
    if (text && el.isConnected) el.innerHTML = text.replace(/\n/g,'<br>');
  } catch(e) {
    if (el.isConnected) el.innerHTML = 'No se pudo conectar con VALL-AI. ' + (e.message || 'Verifica tu conexión.');
  }
}

function downloadReportWord(reportId, filenamePrefix) {
  var text = (document.getElementById(reportId)||{}).textContent||'';
  if (!text || typeof VDS === 'undefined' || !VDS.downloadAsWord) return;
  var stamp = new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'}).replace(/\//g,'-');
  VDS.downloadAsWord(filenamePrefix + '_' + stamp, text);
}

function copyModalReport(reportId, btnSelector) {
  var text = (document.getElementById(reportId)||{}).textContent||'';
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(text).then(function(){
    var btn = document.querySelector(btnSelector);
    if (btn){var orig=btn.innerHTML;btn.innerHTML='<i class="fas fa-check"></i> Copiado';setTimeout(function(){btn.innerHTML=orig;},2000);}
  }).catch(function(){});
}

function printModalReport(reportId, title) {
  var text = (document.getElementById(reportId)||{}).textContent||'';
  var w = window.open('','_blank','width=700,height=900');
  if (!w) return;
  w.document.write('<html><head><title>'+title+' - VALL News</title><style>body{font-family:Courier New,monospace;font-size:12px;padding:2cm;color:#1e293b;}pre{white-space:pre-wrap;line-height:1.75;}</style></head><body><pre>'+text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</pre></body></html>');
  w.document.close();w.focus();setTimeout(function(){w.print();w.close();},600);
}


/* ---- bloque ---- */


/* ── Risk Detail Modal ─────────────────────────────────────────────────── */
var _RISK_META = {
  carry:     { icon:'💱', lbl:'Carry Trade',          sub:'TIIE − Tasa Fed',            unit:'pp' },
  vix:       { icon:'📊', lbl:'Volatilidad de Mercado',sub:'VIX · CBOE',                unit:''   },
  real:      { icon:'📈', lbl:'Tasa Real',             sub:'TIIE − Inflación',           unit:'%'  },
  yc:        { icon:'📉', lbl:'Curva de Rendimientos', sub:'UST 10Y − 2Y',              unit:'pp' },
  move:      { icon:'🔔', lbl:'MOVE Index',            sub:'Volatilidad implícita bonos',unit:''   },
  breakeven: { icon:'🎯', lbl:'Break-even 10Y',        sub:'Inflación implícita de mercado',unit:'%'},
  ois:       { icon:'🏦', lbl:'Probabilidad Recorte Fed',sub:'Proxy OIS (Fed − T-Bill)', unit:'%' },
};

function openRiskDetail(key) {
  var d = _rpData || {};
  var m = _RISK_META[key];
  if (!m) return;
  var overlay = document.getElementById('risk-modal-overlay');
  if (!overlay) return;

  var val, valStr, level, levelColor, metrics = '', analysis = '';
  var now = new Date();
  var timeStr = now.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  var dateStr = now.toLocaleDateString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  function row(lbl, v) { return '<div class="bm-metric-row"><span class="bm-metric-lbl">'+lbl+'</span><span class="bm-metric-val">'+v+'</span></div>'; }

  if (key === 'carry') {
    val = d.spread; valStr = val != null ? '+'+val.toFixed(2)+' pp' : '--';
    level = val == null ? '--' : val > 7 ? 'MUY ATRACTIVO' : val > 4 ? 'ATRACTIVO' : val > 2 ? 'MODERADO' : 'BAJO';
    levelColor = val == null ? '#64748b' : val > 4 ? '#16a34a' : val > 2 ? '#d97706' : '#dc2626';
    metrics = row('TIIE 28D', d.tiie != null ? d.tiie.toFixed(2)+'%' : '--')
            + row('Tasa Fed Funds', d.fed != null ? d.fed.toFixed(2)+'%' : '--')
            + row('Diferencial (carry)', valStr)
            + row('Atractivo carry trade', level);
    analysis = val > 6 ? 'El diferencial TIIE−Fed de <strong>'+valStr+'</strong> es muy atractivo para operaciones de carry trade: inversores extranjeros se ven incentivados a tomar deuda en USD para invertir en pesos y capturar el diferencial. Esto sostiene la demanda de pesos y bonos MX.'
              : val > 3 ? 'El diferencial de <strong>'+valStr+'</strong> ofrece atractivo moderado para carry trade. El flujo de capitales foráneos hacia instrumentos en MXN sigue positivo, aunque la volatilidad del tipo de cambio puede erosionar el retorno.'
              : 'Con un spread reducido de <strong>'+valStr+'</strong>, el carry trade pierde atractivo. La posición en pesos se vuelve menos rentable para inversores externos, lo que puede presionar la demanda de activos mexicanos.';
  } else if (key === 'vix') {
    val = d.vix; valStr = val != null ? val.toFixed(2) : '--';
    level = val == null ? '--' : val < 15 ? 'CALMA' : val < 25 ? 'MODERADA' : val < 35 ? 'ESTRÉS' : 'PÁNICO';
    levelColor = val == null ? '#64748b' : val < 15 ? '#16a34a' : val < 25 ? '#d97706' : '#dc2626';
    metrics = row('VIX actual', valStr)
            + row('Nivel de volatilidad', level)
            + row('Referencia calma (<15)', val != null ? (val < 15 ? '✅ Bajo umbral' : '⚠ Sobre umbral') : '--')
            + row('Señal de mercado', val != null ? (val < 20 ? 'Apetito de riesgo' : val < 30 ? 'Cautela' : 'Aversión al riesgo') : '--');
    analysis = val < 15 ? 'El VIX en <strong>'+valStr+'</strong> refleja un mercado en calma: los inversores no anticipan movimientos bruscos. Condiciones favorables para activos de riesgo (acciones, bonos EM, MXN).'
              : val < 25 ? 'El VIX en <strong>'+valStr+'</strong> señala volatilidad moderada. Los mercados procesan incertidumbre sin pánico. Recomendable mantener coberturas parciales en portafolios con exposición a renta variable.'
              : 'Con el VIX en <strong>'+valStr+'</strong>, el mercado entra en modo defensivo. Los inversores buscan activos refugio (USD, Treasuries, oro). Alta probabilidad de rotación desde emergentes hacia economías desarrolladas.';
  } else if (key === 'real') {
    val = d.realRate; valStr = val != null ? (val >= 0 ? '+' : '')+val.toFixed(2)+'%' : '--';
    level = val == null ? '--' : val > 3 ? 'MUY RESTRICTIVA' : val > 1 ? 'RESTRICTIVA' : val > 0 ? 'NEUTRAL' : 'EXPANSIVA';
    levelColor = val == null ? '#64748b' : val > 0 ? '#16a34a' : '#dc2626';
    metrics = row('TIIE 28D', d.tiie != null ? d.tiie.toFixed(2)+'%' : '--')
            + row('Inflación general', d.infl != null ? d.infl.toFixed(2)+'%' : '--')
            + row('Tasa real (TIIE − Infl.)', valStr)
            + row('Postura de política', level);
    analysis = val > 3 ? 'La tasa real de <strong>'+valStr+'</strong> implica una política monetaria muy restrictiva. Banxico tiene margen para continuar recortando tasas sin comprometer el ancla inflacionaria. Favorable para bonos de largo plazo.'
              : val > 0 ? 'Con una tasa real de <strong>'+valStr+'</strong>, la política monetaria es restrictiva pero moderada. La desinflación continúa avanzando. El ciclo de recortes de Banxico puede profundizarse si la inflación sigue cediendo.'
              : 'La tasa real negativa de <strong>'+valStr+'</strong> implica que la inflación supera la tasa de referencia. Esto reduce el atractivo de instrumentos en MXN y puede generar presión sobre el tipo de cambio.';
  } else if (key === 'yc') {
    var ycVal = document.getElementById('rp-yc') ? document.getElementById('rp-yc').textContent : '--';
    val = parseFloat(ycVal); valStr = ycVal;
    level = isNaN(val) ? '--' : val < -0.5 ? 'INVERTIDA' : val < 0 ? 'LEVE. INVERTIDA' : val < 0.5 ? 'PLANA' : 'NORMAL';
    levelColor = isNaN(val) ? '#64748b' : val < 0 ? '#dc2626' : val < 0.5 ? '#d97706' : '#16a34a';
    metrics = row('Spread UST 10Y − 2Y', valStr)
            + row('Forma de curva', level)
            + row('Señal histórica', val < 0 ? '⚠ Precedente de recesión' : '✅ Expansión esperada')
            + row('Implicación Fed', val < 0 ? 'Tasas largas vs cortas — mercado anticipa recortes' : 'Curva saludable');
    analysis = val < -0.5 ? 'La curva UST está <strong>invertida en '+valStr+'</strong>. Históricamente, esta configuración ha precedido todas las recesiones de EE.UU. con 12–18 meses de adelanto. Alta cautela en activos cíclicos.'
              : val < 0 ? 'La curva muestra leve inversión ('+valStr+'). El mercado de bonos anticipa que la Fed necesitará recortar tasas. Señal de desaceleración, aunque no necesariamente recesión.'
              : 'La curva UST es positiva ('+valStr+') — condiciones financieras favorables para el crecimiento. Los mercados no anticipan recesión en el corto plazo.';
  } else if (key === 'move') {
    val = d.move; valStr = val != null ? val.toFixed(1) : '--';
    level = val == null ? '--' : val < 70 ? 'CALMA' : val < 100 ? 'MODERADO' : val < 130 ? 'ELEVADO' : 'CRÍTICO';
    levelColor = val == null ? '#64748b' : val < 70 ? '#16a34a' : val < 100 ? '#d97706' : '#dc2626';
    metrics = row('MOVE Index', valStr)
            + row('Nivel', level)
            + row('Umbral estrés', val != null ? (val > 120 ? '⚠ Sobre umbral crítico' : '✅ Bajo umbral crítico') : '--')
            + row('Impacto en crédito', val != null ? (val > 100 ? 'Spreads de crédito se amplían' : 'Condiciones crediticias normales') : '--');
    analysis = val < 70 ? 'El MOVE Index en <strong>'+valStr+'</strong> señala baja volatilidad en el mercado de bonos. Los costos de cobertura son bajos y los spreads de crédito tienden a comprimirse. Ambiente favorable para renta fija.'
              : val < 120 ? 'El MOVE en <strong>'+valStr+'</strong> refleja volatilidad moderada en bonos. Los participantes del mercado están ajustando sus expectativas sobre la trayectoria de tasas. Monitorear de cerca.'
              : 'Con MOVE en <strong>'+valStr+'</strong>, la volatilidad implícita en bonos es crítica. Los spreads de crédito se amplían, aumentan los costos de financiamiento corporativo y hay presión sobre mercados emergentes.';
  } else if (key === 'breakeven') {
    val = d.be; valStr = val != null ? '~'+val.toFixed(2)+'%' : '--';
    level = val == null ? '--' : val < 1.5 ? 'DEFLACIÓN RISK' : val < 2.5 ? 'EN TARGET' : val < 3 ? 'SOBRE TARGET' : 'DESBORDADO';
    levelColor = val == null ? '#64748b' : val < 1.5 ? '#dc2626' : val < 2.5 ? '#16a34a' : val < 3 ? '#d97706' : '#dc2626';
    metrics = row('Break-even 10Y (est.)', valStr)
            + row('Target inflación Fed', '2.0%')
            + row('Nivel vs target', level)
            + row('Fuente', 'Aprox. TNX − TIPS yield estimado');
    analysis = val < 2 ? 'El break-even de inflación en <strong>'+valStr+'</strong> está cerca del target de 2% de la Fed. El mercado no anticipa presiones inflacionarias persistentes. Favorece el inicio o continuación de recortes de tasas.'
              : val < 2.7 ? 'Con break-even de <strong>'+valStr+'</strong>, el mercado descuenta inflación ligeramente sobre el target. La Fed mantiene vigilancia y puede postergar recortes adicionales si el dato confirma presión.'
              : 'El break-even de <strong>'+valStr+'</strong> indica que el mercado anticipa inflación significativamente sobre el objetivo de la Fed. Esto reduce la probabilidad de recortes y puede provocar un repunte en rendimientos.';
  } else if (key === 'ois') {
    val = d.cutProb; valStr = val != null ? val+'% recorte' : '--';
    level = val == null ? '--' : val >= 70 ? 'MUY PROBABLE' : val >= 40 ? 'PROBABLE' : val >= 20 ? 'POSIBLE' : 'IMPROBABLE';
    levelColor = val == null ? '#64748b' : val >= 60 ? '#16a34a' : val >= 30 ? '#d97706' : '#dc2626';
    metrics = row('P(Recorte) próx. reunión', valStr)
            + row('T-Bill 3M (proxy OIS)', d.irx != null ? d.irx.toFixed(2)+'%' : '--')
            + row('Tasa Fed Funds actual', d.fed != null ? d.fed.toFixed(2)+'%' : '--')
            + row('Expectativa mercado', level);
    analysis = val >= 70 ? 'Con una probabilidad de recorte de <strong>'+valStr+'</strong>, el mercado prácticamente descuenta una baja de tasas en la próxima reunión de la Fed. Positivo para bonos de largo plazo y activos de riesgo.'
              : val >= 40 ? 'Una probabilidad de <strong>'+valStr+'</strong> indica que el mercado está dividido. El dato de inflación y empleo de las próximas semanas será determinante para la decisión de la Fed.'
              : 'Con solo <strong>'+valStr+'</strong> de probabilidad de recorte, el mercado no anticipa un cambio en la política de la Fed a corto plazo. Las tasas pueden permanecer elevadas, presionando los múltiplos de valuación.';
  }

  document.getElementById('rm-icon').textContent = m.icon;
  document.getElementById('rm-title').textContent = m.lbl;
  document.getElementById('rm-sub').textContent   = m.sub;
  document.getElementById('rm-val-big').textContent  = valStr;
  var badge = document.getElementById('rm-level-badge');
  badge.textContent = level;
  badge.style.background = levelColor ? levelColor.replace('rgb','rgba').replace(')',',0.25)') : 'rgba(255,255,255,.12)';
  badge.style.color = '#fff';
  document.getElementById('rm-upd').textContent = 'Act. ' + timeStr + ' · VALL News';
  document.getElementById('rm-metrics').innerHTML = metrics;
  document.getElementById('rm-analysis').innerHTML = analysis;
  document.getElementById('rm-report').textContent = buildRiskReport(m, valStr, level, metrics, dateStr, timeStr);
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  loadGeminiRiskAnalysis(m, valStr, level, analysis);
}

function buildRiskReport(m, valStr, level, metrics, dateStr, timeStr) {
  var clean = metrics.replace(/<[^>]+>/g, '').replace(/\n+/g,' ').trim();
  return [
    '========================================',
    'REPORTE DE RIESGO FINANCIERO',
    'VALL News -- Inteligencia Economica',
    '========================================',
    'Indicador:          ' + m.lbl,
    'Descripcion:        ' + m.sub,
    'Valor actual:       ' + valStr,
    'Nivel:              ' + level,
    'Fecha:              ' + dateStr,
    'Hora:               ' + timeStr + ' (hora local)',
    '',
    '--- CONTEXTO ----------------------------',
    clean,
    '',
    '--- NOTAS -------------------------------',
    'Fuente: Yahoo Finance / Banxico SIE',
    'Este reporte es de caracter informativo.',
    'VALL News no ofrece asesoria de inversion.',
    '========================================',
  ].join('\n');
}

async function loadGeminiRiskAnalysis(m, valStr, level, staticAnalysis) {
  var el = document.getElementById('rm-analysis');
  if (!el) return;
  var prompt = 'Eres analista de riesgo financiero institucional. Redacta un análisis conciso (150-180 palabras) del siguiente indicador:\n\nIndicador: '+m.lbl+' ('+m.sub+')\nValor actual: '+valStr+'\nNivel: '+level+'\n\nIncluye: 1) Qué mide este indicador y su importancia, 2) Implicación del nivel actual para mercados y política monetaria, 3) Perspectiva de corto plazo. Responde en español, sin asteriscos ni markdown, tono profesional institucional.';
  try {
    var text = await VDS.geminiChat(prompt, 'Eres un analista financiero institucional de VALL News. Responde en español, de forma concisa y profesional. Máximo 180 palabras.');
    if (text && el.isConnected) el.innerHTML = text.replace(/\n/g,'<br>');
  } catch(e) {
    if (el.isConnected) el.innerHTML = 'No se pudo conectar con VALL-AI. ' + (e.message || 'Verifica tu conexión.');
  }
}

function closeRiskModal() {
  var ov = document.getElementById('risk-modal-overlay');
  if (ov) ov.classList.remove('open');
  document.body.style.overflow = '';
}

function copyRiskReport() {
  var text = (document.getElementById('rm-report')||{}).textContent||'';
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(text).then(function(){
    var btn = document.querySelector('#risk-modal .bm-btn-primary');
    if (btn){var orig=btn.innerHTML;btn.innerHTML='<i class="fas fa-check"></i> Copiado';setTimeout(function(){btn.innerHTML=orig;},2000);}
  }).catch(function(){});
}

function printRiskReport() {
  var text = (document.getElementById('rm-report')||{}).textContent||'';
  var title = (document.getElementById('rm-title')||{}).textContent||'Riesgo';
  var w = window.open('','_blank','width=700,height=900');
  if (!w) return;
  w.document.write('<html><head><title>'+title+' - VALL News</title><style>body{font-family:Courier New,monospace;font-size:12px;padding:2cm;color:#1e293b;}pre{white-space:pre-wrap;line-height:1.75;}</style></head><body><pre>'+text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</pre></body></html>');
  w.document.close();w.focus();
  setTimeout(function(){w.print();w.close();},600);
}


/* ---- bloque ---- */


  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.panel').forEach((el, i) => { el.setAttribute('data-aos', 'fade-up'); el.setAttribute('data-aos-delay', i * 100); });
    document.querySelectorAll('.rds3-col').forEach((el, i) => { el.setAttribute('data-aos', 'fade-up'); el.setAttribute('data-aos-delay', i * 150); });
    document.querySelectorAll('.cal-card').forEach((el, i) => { el.setAttribute('data-aos', 'fade-up'); el.setAttribute('data-aos-delay', (i % 4) * 100); });
    document.querySelectorAll('.mkt-row').forEach((el, i) => { el.setAttribute('data-aos', 'fade-left'); el.setAttribute('data-aos-delay', (i % 5) * 50); });
    document.querySelectorAll('.bond-pill').forEach((el, i) => { el.setAttribute('data-aos', 'zoom-in-up'); el.setAttribute('data-aos-delay', (i % 5) * 75); });
    document.querySelectorAll('.fx-card').forEach((el, i) => { el.setAttribute('data-aos', 'zoom-in'); el.setAttribute('data-aos-delay', (i % 5) * 50); });
    document.querySelectorAll('.rds2-card').forEach((el, i) => { el.setAttribute('data-aos', 'fade-up'); el.setAttribute('data-aos-delay', (i % 5) * 60); });
    
    AOS.init({
      duration: 700,
      easing: 'ease-out-cubic',
      once: true,
      offset: 30
    });
  });


/* ---- bloque ---- */


// Dark Mode Listener
const themeBtn = document.getElementById('themeToggleBtn');
if (themeBtn) {
    const setBtnIcon = () => {
        if(document.documentElement.getAttribute('data-theme') === 'dark') {
            themeBtn.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            themeBtn.innerHTML = '<i class="fas fa-moon"></i>';
        }
    };
    setBtnIcon();
    themeBtn.addEventListener('click', () => {
        if(document.documentElement.getAttribute('data-theme') === 'dark') {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('vn_theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('vn_theme', 'dark');
        }
        setBtnIcon();
    });
}


/* ---- bloque ---- */


(function () {
    const hamBtn = document.getElementById('hamBtn');
    const mainNav = document.getElementById('mainNav');
    if (!hamBtn || !mainNav || hamBtn.dataset.vnHeaderBound === '1') return;
    hamBtn.dataset.vnHeaderBound = '1';
    hamBtn.addEventListener('click', () => {
        hamBtn.classList.toggle('vn-ham-open');
        mainNav.classList.toggle('vn-nav-open');
    });
})();
