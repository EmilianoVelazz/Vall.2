/**
 * Lógica de la página de Finanzas.
 *
 * Sale de los dos <script> inline de pages/finanzas.html (17 KB y 246 KB) sin
 * cambiarle una coma a la lógica: solo lo justo para poder montarla y
 * desmontarla dentro de la SPA de React.
 *
 * POR QUÉ SIGUE SIENDO ÁMBITO GLOBAL (y no un IIFE como finanzas-favro.js):
 * el marcado invoca ~26 funciones por nombre (finTab, openBondDetail,
 * setFinInt…) y finanzas-favro.js depende de otras 8 (CENTRAL_BANKS, _rds,
 * ensureFinanceSection, finTab, loadSectorBoard, refreshAll,
 * setBondChartType, updateDebtDashboard). En un script clásico, var y function
 * de nivel superior SÍ se cuelgan de window; const y let NO. Por eso los
 * const/let de nivel superior se convirtieron a var: así el JSX puede llamar
 * window.finTab(...) sin mantener una lista de exportaciones, y reejecutar el
 * archivo al volver a la sección no lanza "Identifier already declared".
 *
 * Lo que registra limpieza: 4 intervalos, 2 observadores y los listeners
 * colgados de document. Los listeners sobre nodos de la propia sección no
 * hacen falta — mueren con su nodo cuando React lo desmonta.
 *
 * Generado a partir del HTML; ver el commit que lo introdujo.
 */

/* Una ejecución previa se desmonta antes de que arranque la nueva. */
if (window.VNFinanzas && window.VNFinanzas.desmontar) window.VNFinanzas.desmontar();

var _vnFinLimpieza = [];

function _vnFinIntervalo(fn, ms) {
    var id = window.setInterval(fn, ms);
    _vnFinLimpieza.push(function () { window.clearInterval(id); });
    return id;
}

function _vnFinEscuchar(destino, evento, fn, opciones) {
    destino.addEventListener(evento, fn, opciones);
    _vnFinLimpieza.push(function () { destino.removeEventListener(evento, fn, opciones); });
}

function _vnFinObservar(observador) {
    _vnFinLimpieza.push(function () { try { observador.disconnect(); } catch (e) { /* ya suelto */ } });
    return observador;
}

/* ══════════ Bloque 1: panel de gráfica (venía en finanzas.html L2368) ══════════ */

    (function(){
        let _chart = null, _series = null;
        let _currentFinInt = '1y';
        // El grupo de la Bolsa Mexicana se retiró del selector de instrumentos,
        // así que el ticker inicial ya no puede ser GFNORTEO.MX: apuntaría a una
        // opción inexistente y el panel abriría con el selector desincronizado.
        let _currentTicker = 'AAPL';
        let _lastCandles = [];
        let _loadController = null;
        let _loadSequence = 0;
        const CHART_TYPES = {
            candles: { title: 'Velas japonesas', note: 'Apertura, máximo, mínimo y cierre para lectura técnica del precio.' },
            line:     { title: 'Línea de cierre', note: 'Lectura limpia de la dirección y continuidad del precio.' },
            area:     { title: 'Área de tendencia', note: 'Evolución del cierre con énfasis visual en magnitud y tendencia.' },
            ohlc:     { title: 'Barras OHLC', note: 'Apertura, máximo, mínimo y cierre con una presentación profesional compacta.' },
        };
        let _currentChartType = (() => {
            try {
                const saved = localStorage.getItem('vn_fin_chart_type');
                return CHART_TYPES[saved] ? saved : 'candles';
            } catch { return 'candles'; }
        })();
        // '15m' y '1h' no son "range" nativos de Yahoo (range = ventana total, no
        // granularidad) — se piden velas de 1 minuto del último día y se recortan
        // del lado del cliente a los últimos 15/60 minutos de operación.
        const IV_PARAMS = {
            '15m': { interval: '1m',  range: '1d',  trim: 15 },
            '1h':  { interval: '1m',  range: '1d',  trim: 60 },
            '1mo': { interval: '1h',  range: '1mo' },
            '1y':  { interval: '1d',  range: '1y'  },
            '3y':  { interval: '1wk', range: '3y'  },
            '5y':  { interval: '1wk', range: '5y'  },
            '10y': { interval: '1mo', range: '10y' },
            // Yahoo no acepta range=20y (sus rangos son 1d/5d/1mo/3mo/6mo/1y/2y/
            // 5y/10y/ytd/max), así que se pide el histórico completo y se acota
            // por fecha en loadChart. Si la emisora cotiza desde hace menos de
            // 20 años, se muestra todo lo disponible.
            '20y': { interval: '1mo', range: 'max', sinceYears: 20 },
        };

        window.setFinInt = function(rangeKey, btn) {
            _currentFinInt = rangeKey;
            const container = btn.closest('.chart-intervals');
            if (container) {
                container.querySelectorAll('.chart-int-btn').forEach(b => {
                    const active = b === btn;
                    b.classList.toggle('active', active);
                    b.setAttribute('aria-pressed', String(active));
                });
            }
            reload();
        };

        function syncChartTypeUI() {
            document.querySelectorAll('#chart-type-switch .chart-type-btn').forEach(btn => {
                const active = btn.dataset.chartType === _currentChartType;
                btn.classList.toggle('active', active);
                btn.setAttribute('aria-pressed', String(active));
            });
            const copy = CHART_TYPES[_currentChartType];
            document.getElementById('chart-type-title').textContent = copy.title;
            document.getElementById('chart-type-note').textContent = copy.note;
            const chartRegion = document.getElementById('ch-wrapper');
            const instrument = document.getElementById('ch-name')?.textContent || 'instrumento seleccionado';
            const period = document.querySelector('#bmv-intervals .chart-int-btn.active')?.textContent || 'periodo seleccionado';
            if (chartRegion) chartRegion.setAttribute('aria-label', `${copy.title} de ${instrument}, ${period}`);
        }

        function renderChartSeries(candles) {
            if (!_chart || !candles?.length) return;
            if (_series) _chart.removeSeries(_series);

            if (_currentChartType === 'line') {
                _series = _chart.addLineSeries({
                    color: '#2563eb', lineWidth: 2,
                    crosshairMarkerBackgroundColor: '#2563eb',
                    crosshairMarkerBorderColor: '#fff',
                    priceLineColor: 'rgba(37,99,235,.35)',
                });
                _series.setData(candles.map(c => ({ time: c.time, value: c.close })));
            } else if (_currentChartType === 'area') {
                _series = _chart.addAreaSeries({
                    lineColor: '#0891b2', lineWidth: 2,
                    topColor: 'rgba(8,145,178,.34)',
                    bottomColor: 'rgba(8,145,178,.025)',
                    crosshairMarkerBackgroundColor: '#0891b2',
                    priceLineColor: 'rgba(8,145,178,.35)',
                });
                _series.setData(candles.map(c => ({ time: c.time, value: c.close })));
            } else if (_currentChartType === 'ohlc') {
                _series = _chart.addBarSeries({
                    upColor:'#0e7a40',downColor:'#c0392b',thinBars:false,
                });
                _series.setData(candles);
            } else {
                _series = _chart.addCandlestickSeries({
                    upColor: '#0e7a40', downColor: '#c0392b',
                    borderUpColor: '#0e7a40', borderDownColor: '#c0392b',
                    wickUpColor: '#0e7a40', wickDownColor: '#c0392b',
                });
                _series.setData(candles);
            }
            _chart.timeScale().fitContent();
        }

        window.setFinChartType = function(type) {
            if (!CHART_TYPES[type] || type === _currentChartType) return;
            _currentChartType = type;
            try { localStorage.setItem('vn_fin_chart_type', type); } catch(e) {}
            syncChartTypeUI();
            if (_lastCandles.length) renderChartSeries(_lastCandles);
            else reload();
        };

        function formatChartNumber(value, digits = 2) {
            return Number.isFinite(Number(value))
                ? Number(value).toLocaleString('es-MX', { minimumFractionDigits: digits, maximumFractionDigits: digits })
                : '—';
        }

        function setChartLoadingState(state, message) {
            const wrapper = document.getElementById('ch-wrapper');
            const overlay = document.getElementById('ch-loading');
            const icon = document.getElementById('ch-loading-icon');
            const text = document.getElementById('ch-loading-text');
            const retry = document.getElementById('ch-retry');
            if (!wrapper || !overlay) return;
            wrapper.setAttribute('aria-busy', String(state === 'loading'));
            overlay.style.display = state === 'ready' ? 'none' : 'flex';
            if (text) text.textContent = message || (state === 'loading' ? 'Cargando datos del mercado…' : '');
            if (retry) retry.hidden = state !== 'error';
            if (icon) {
                icon.className = state === 'error'
                    ? 'fas fa-triangle-exclamation'
                    : 'fas fa-circle-notch fa-spin';
            }
            overlay.classList.toggle('is-error', state === 'error');
        }

        function renderPeriodReading(candles) {
            const closes = candles.map(candle => Number(candle.close)).filter(Number.isFinite);
            const highs = candles.map(candle => Number(candle.high)).filter(Number.isFinite);
            const lows = candles.map(candle => Number(candle.low)).filter(Number.isFinite);
            const first = closes[0], last = closes[closes.length - 1];
            const change = Number.isFinite(first) && first !== 0 && Number.isFinite(last) ? ((last / first) - 1) * 100 : null;
            const high = highs.length ? Math.max(...highs) : null;
            const low = lows.length ? Math.min(...lows) : null;
            const amplitude = Number.isFinite(high) && Number.isFinite(low) && low !== 0 ? ((high - low) / low) * 100 : null;
            const changeEl = document.getElementById('ch-period-change');
            const rangeEl = document.getElementById('ch-period-range');
            const observationsEl = document.getElementById('ch-observations');
            const trendEl = document.getElementById('ch-trend');
            const trendNoteEl = document.getElementById('ch-trend-note');
            if (changeEl) {
                changeEl.textContent = Number.isFinite(change) ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—';
                changeEl.className = !Number.isFinite(change) ? '' : change >= 0 ? 'is-positive' : 'is-negative';
            }
            if (rangeEl) rangeEl.textContent = Number.isFinite(amplitude) ? `${amplitude.toFixed(2)}%` : '—';
            if (observationsEl) observationsEl.textContent = closes.length.toLocaleString('es-MX');
            if (trendEl && trendNoteEl) {
                const direction = !Number.isFinite(change) ? 'Sin lectura' : change > .5 ? 'Alcista' : change < -.5 ? 'Bajista' : 'Lateral';
                trendEl.textContent = direction;
                trendEl.className = direction === 'Alcista' ? 'is-positive' : direction === 'Bajista' ? 'is-negative' : '';
                trendNoteEl.textContent = direction === 'Alcista'
                    ? 'El cierre avanzó en el periodo'
                    : direction === 'Bajista'
                        ? 'El cierre retrocedió en el periodo'
                        : direction === 'Lateral'
                            ? 'Cambio menor a ±0.5%'
                            : 'Información insuficiente';
            }
        }

        async function loadChart(ticker, iv) {
            const { interval, range, trim, sinceYears } = IV_PARAMS[iv] || IV_PARAMS['1y'];
            const requestId = ++_loadSequence;
            if (_loadController) _loadController.abort();
            _loadController = new AbortController();
            document.getElementById('ch-price').textContent = '…';
            document.getElementById('ch-updated').textContent = 'Consultando mercado…';
            setChartLoadingState('loading', `Cargando ${ticker}…`);
            try {
                const r = await fetch(
                    `/api/stock-history?ticker=${encodeURIComponent(ticker)}&interval=${interval}&range=${range}`,
                    { signal: _loadController.signal }
                );
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const { candles: allCandles, meta = {} } = await r.json();
                if (requestId !== _loadSequence) return;
                if (!allCandles?.length) throw new Error('Sin velas');
                // 15min/1H: recortar a las últimas N velas de 1 minuto de la sesión más reciente.
                let candles = trim ? allCandles.slice(-trim) : allCandles;

                // 20 años: Yahoo no tiene range=20y, así que se pide `max` y se
                // recorta aquí. El recorte es POR FECHA, no por número de velas:
                // en `max` el espaciado es irregular (trimestral en los años
                // viejos, mensual en los recientes), de modo que contar velas
                // daría un periodo equivocado.
                if (sinceYears) {
                    const cutoff = new Date();
                    cutoff.setFullYear(cutoff.getFullYear() - sinceYears);
                    const toDate = value => new Date(typeof value === 'number'
                        ? (value < 1e11 ? value * 1000 : value)
                        : value);
                    const windowed = candles.filter(c => toDate(c.time) >= cutoff);
                    if (windowed.length > 1) candles = windowed;
                }

                const price = meta.regularMarketPrice ?? candles[candles.length - 1]?.close;
                const pct   = meta.regularMarketChangePercent;
                document.getElementById('ch-name').textContent  = meta.longName || ticker;
                document.getElementById('ch-wrapper').setAttribute(
                    'aria-label',
                    `${CHART_TYPES[_currentChartType].title} de ${meta.longName || ticker}, ${document.querySelector('#bmv-intervals .chart-int-btn.active')?.textContent || 'periodo seleccionado'}`
                );
                document.getElementById('ch-price').textContent = formatChartNumber(price, Number(price) < 1 ? 4 : 2);
                const pctElement = document.getElementById('ch-pct');
                pctElement.textContent = pct != null ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '—';
                pctElement.style.color = pct == null ? '#71838f' : pct >= 0 ? '#0e7a40' : '#c0392b';
                document.getElementById('ch-high').textContent  = formatChartNumber(meta.regularMarketDayHigh ?? candles[candles.length - 1]?.high);
                document.getElementById('ch-low').textContent   = formatChartNumber(meta.regularMarketDayLow ?? candles[candles.length - 1]?.low);
                document.getElementById('ch-cur').textContent   = meta.currency || 'Moneda no indicada';
                document.getElementById('ch-updated').textContent = `Consulta ${new Date().toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' })}`;
                const wrapper = document.getElementById('ch-wrapper');
                const showTime = !['1d','1wk','1mo'].includes(interval);
                if (!_chart) {
                    const darkFinance = document.body.classList.contains('vn-dark-finanzas');
                    const bolsaSurface = getComputedStyle(document.body).getPropertyValue('--bolsa-base').trim();
                    const chartSurface = darkFinance ? (bolsaSurface || '#35536b') : '#fbfdfe';
                    const chartText = darkFinance ? '#acbbc7' : '#536675';
                    const chartGrid = darkFinance ? 'rgba(172,187,199,.14)' : '#edf2f5';
                    const chartBorder = darkFinance ? '#4c5f70' : '#dce5ea';
                    _chart = LightweightCharts.createChart(wrapper, {
                        width:  wrapper.clientWidth,
                        height: wrapper.clientHeight || 440,
                        layout: { background: { type: 'solid', color: chartSurface }, textColor: chartText, fontFamily: 'Inter, sans-serif', fontSize: 11 },
                        grid:   { vertLines: { color: chartGrid }, horzLines: { color: chartGrid } },
                        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
                        rightPriceScale: { borderColor: chartBorder, scaleMargins: { top:.1, bottom:.12 } },
                        timeScale: { borderColor: chartBorder, timeVisible: showTime, rightOffset: 3, barSpacing: 8 },
                    });
                    let _lastChartWidth = wrapper.clientWidth;
                    _vnFinObservar(new ResizeObserver(() => {
                        const w = wrapper.clientWidth;
                        _chart.applyOptions({ width: w, height: wrapper.clientHeight || 440 });
                        /* Reajustar al nuevo ancho. El panel se construye oculto, así que
                           clientWidth vale ~0 y el fitContent() inicial calcula el espaciado
                           de barras para esa anchura. Al abrirse y ensancharse, la librería
                           conserva ese espaciado y ancla la serie al borde derecho: las velas
                           quedaban apelotonadas en un tercio y el resto en blanco. */
                        if (w !== _lastChartWidth) {
                            _lastChartWidth = w;
                            _chart.timeScale().fitContent();
                        }
                    })).observe(wrapper);
                } else {
                    _chart.applyOptions({ timeScale: { timeVisible: showTime } });
                }

                _lastCandles = candles;
                renderChartSeries(candles);
                renderPeriodReading(candles);
                setChartLoadingState('ready');

            } catch (e) {
                if (e.name === 'AbortError') return;
                console.error('Chart error:', e);
                document.getElementById('ch-price').textContent = '—';
                document.getElementById('ch-updated').textContent = 'Consulta no disponible';
                setChartLoadingState('error', 'No se pudieron cargar los datos de este instrumento.');
            }
        }
        function reload() {
            loadChart(_currentTicker, _currentFinInt);
        }
        document.getElementById('bmv-symbol').addEventListener('change', function(event) {
            _currentTicker = event.target.value;
            document.getElementById('bmv-custom').value = '';
            reload();
        });

        document.getElementById('bmv-custom-btn').addEventListener('click', function(){
            const t = document.getElementById('bmv-custom').value.trim().toUpperCase();
            if (t) { _currentTicker = t; loadChart(t, _currentFinInt); }
        });
        document.getElementById('bmv-custom').addEventListener('keydown', function(e){
            if (e.key === 'Enter') document.getElementById('bmv-custom-btn').click();
        });
        document.getElementById('ch-retry').addEventListener('click', reload);
        syncChartTypeUI();
        reload();
    })();
    

/* ══════════ Bloque 2: el resto de la página (venía en L3209) ══════════ */

var _fxData = null; // declarado aquí (no en el bloque de más abajo): se lee de forma
                     // síncrona durante la carga inicial, antes de que ese bloque corra.
var $ = id => document.getElementById(id);
var tx = (id, v) => { const e = $(id); if (e) e.textContent = v; };
var at = (id, a, v) => { const e = $(id); if (e) e.setAttribute(a, v); };

/* Piso de legibilidad para el terminal financiero. Conserva cualquier tamaño
   que ya sea mayor y corrige únicamente microtexto heredado o generado. */
var _financeTypographyFrame = 0;
function applyFinanceTypographyFloor(root) {
    const host = root?.querySelectorAll ? root : document;
    const floors = { SMALL:11, EM:11, P:12, LABEL:11, BUTTON:11, SPAN:11, STRONG:12, TD:11, TH:11 };
    host.querySelectorAll('.container small,.container em,.container p,.container label,.container button,.container span,.container strong,.container td,.container th').forEach(el => {
        if (el.matches('.fas,.far,.fab,.fa,[class*="-icon"],[class*="-flag"],.sparkline *,#fin-section-status button')) return;
        const ownText = Array.from(el.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        if (!ownText) return;
        const floor = floors[el.tagName] || 11;
        const style = getComputedStyle(el);
        const current = Number.parseFloat(style.fontSize);
        if (Number.isFinite(current) && current < floor) el.style.setProperty('font-size', floor + 'px', 'important');
        const lineHeight = Number.parseFloat(style.lineHeight);
        if (Number.isFinite(lineHeight) && lineHeight < floor * 1.3) el.style.setProperty('line-height', '1.35', 'important');
    });
}
function scheduleFinanceTypography(root) {
    cancelAnimationFrame(_financeTypographyFrame);
    _financeTypographyFrame = requestAnimationFrame(() => applyFinanceTypographyFloor(root || document));
}
var _financeTypographyHost = document.querySelector('.container');
if (_financeTypographyHost) {
    _vnFinObservar(new MutationObserver(records => {
        const added = records.find(record => record.addedNodes.length)?.target || _financeTypographyHost;
        scheduleFinanceTypography(added.closest?.('.container') || _financeTypographyHost);
    })).observe(_financeTypographyHost,{childList:true,subtree:true});
    scheduleFinanceTypography(_financeTypographyHost);
}

var IMGS = ['/assets/img/finanzas.webp', '/assets/img/mercadoP.webp', '/assets/img/mercados.webp'];

var _fhImgPool    = [];
var _assetDataCache = new Map();
function fetchAssetData(ticker) {
    if (_assetDataCache.has(ticker)) return _assetDataCache.get(ticker);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const promise = fetch(`/api/stock-history?ticker=${encodeURIComponent(ticker)}&interval=1d&range=5d`, { signal:controller.signal })
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(data => data?.meta ? data : null)
        .catch(() => null)
        .finally(() => clearTimeout(timeout));
    _assetDataCache.set(ticker, promise);
    promise.then(data => { if (!data) _assetDataCache.delete(ticker); });
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
            gas:      gasPrice,
            gasPct:   gasPct,
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
        syncEnergyDashboard();
    } catch(e) {
        console.error('loadPetroleo error:', e);
    }
}

function syncEnergyDashboard() {
    const set = (id,value) => { const el=document.getElementById(id); if(el&&value!=null) el.textContent=value; };
    const setMove = (id,pct,fallback) => {
        const el=document.getElementById(id); if(!el) return;
        if(pct==null||!Number.isFinite(+pct)){el.textContent=fallback;el.className='';return;}
        const n=+pct; el.textContent=`${n>=0?'▲ +':'▼ '}${Math.abs(n).toFixed(2)}% sesión`; el.className=n>=0?'up':'down';
    };
    const data = _petroData || {};
    const money = value => value==null||!Number.isFinite(+value)?'—':'$'+Number(value).toFixed(2);
    set('energy-kpi-wti',money(data.wti)); setMove('energy-kpi-wti-pct',data.wtiPct,'Referencia estadounidense');
    set('energy-kpi-brent',money(data.brent)); setMove('energy-kpi-brent-pct',data.brentPct,'Referencia internacional');
    set('energy-kpi-gas',money(data.gas)); setMove('energy-kpi-gas-pct',data.gasPct,'Henry Hub');
    if(data.wti!=null&&data.brent!=null){
        const spread=Number(data.wti)-Number(data.brent);
        set('energy-kpi-spread',(spread>=0?'+':'−')+'$'+Math.abs(spread).toFixed(2));
        set('energy-kpi-spread-note',spread<0?'WTI con descuento':'WTI con prima');
    }
    const vix = _rpData?.vix ?? _rds.vix;
    const dxy = _macroIntData?.dxyCurr ?? _rds.dxy;
    set('energy-kpi-vix',vix==null?'—':Number(vix).toFixed(1));
    set('energy-kpi-vix-note',vix==null?'Apetito global por riesgo':+vix<15?'Calma de mercado':+vix<25?'Riesgo moderado':'Estrés elevado');
    set('energy-kpi-dxy',dxy==null?'—':Number(dxy).toFixed(2));
    set('energy-kpi-dxy-note',dxy==null?'Condición financiera global':+dxy>105?'Dólar muy fuerte':+dxy>100?'Dólar firme':'Dólar moderado');
    const energyMoves=[data.wtiPct,data.brentPct,data.gasPct].filter(value=>value!=null&&Number.isFinite(+value)).map(Number);
    const avgMove=energyMoves.length?energyMoves.reduce((sum,value)=>sum+value,0)/energyMoves.length:null;
    let title='Mercado energético equilibrado';
    let copy='Las referencias energéticas no muestran una presión direccional extrema.';
    if(avgMove!=null&&avgMove>=1){title='Impulso alcista en energía';copy='El avance conjunto de petróleo y gas puede trasladarse a inflación, costos logísticos y expectativas de tasas.';}
    else if(avgMove!=null&&avgMove<=-1){title='Corrección en materias primas energéticas';copy='La caída conjunta reduce presión inflacionaria, aunque puede reflejar menor expectativa de demanda global.';}
    else if(vix!=null&&+vix>=25){title='Energía bajo régimen de alta volatilidad';copy='La tensión financiera puede dominar temporalmente los fundamentales de oferta y demanda.';}
    set('energy-regime-title',title); set('energy-regime-copy',copy);
    set('energy-pro-updated','Actualizado '+new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}));
    loadCommodityExplorer();
}

/* Panorama macro internacional (DXY, T-bill, euríbor…). Solo lo RELLENA
   loadMacroMexico, pero syncEnergyDashboard lo LEE antes: refreshAll corre
   loadPetroleo en la primera fase y loadMacroMexico en la segunda.
   Sin esta declaración era un ReferenceError, y el `?.` no protege de eso —
   el encadenamiento opcional evita leer sobre null, no sobre un identificador
   que no existe. La excepción abortaba syncEnergyDashboard a medias y se
   llevaba por delante los KPIs de VIX y DXY, el régimen energético y la
   llamada a loadCommodityExplorer(). */
var _macroIntData = {};

var _commodityExplorerData = {};
var _commodityExplorerPromise = null;
var _commodityChartType = (()=>{try{return ['line','area','bars'].includes(localStorage.getItem('vn_commodity_chart_type'))?localStorage.getItem('vn_commodity_chart_type'):'line';}catch(e){return 'line';}})();
var _commodityFallbackHistory = {wti:[20,18,19,13,15,8],brent:[19,17,18,12,14,7],gas:[10,16,12,20,15,18],gold:[22,18,19,13,10,7],copper:[18,15,20,14,12,9],aluminum:[17,19,15,16,11,13],corn:[13,17,14,19,16,12],wheat:[19,15,17,12,16,14],soybeans:[16,13,18,15,11,10]};
var _COMMODITY_EXPLORER_META = {
    wti:{label:'WTI',icon:'🛢️',unit:'USD/barril',source:'Yahoo Finance',group:'Energía',context:'Referencia de crudo en Estados Unidos. Incide en combustibles, expectativas de inflación y el complejo energético norteamericano.'},
    brent:{label:'Brent',icon:'🌊',unit:'USD/barril',source:'Yahoo Finance',group:'Energía',context:'Referencia internacional del petróleo. Su prima frente al WTI recoge logística, calidad y tensiones del mercado global.'},
    gas:{label:'Gas natural',icon:'🔥',unit:'USD/MMBtu',source:'Yahoo Finance',group:'Energía',context:'Insumo crítico para electricidad, calefacción, fertilizantes e industria. Presenta alta sensibilidad al clima y los inventarios.'},
    gold:{label:'Oro',icon:'🥇',unit:'USD/onza',source:'Yahoo Finance',group:'Metales',context:'Activo monetario y refugio. Responde al dólar, tasas reales, compras de bancos centrales y riesgo geopolítico.'},
    copper:{label:'Cobre',icon:'🔶',unit:'USD/libra',source:'Alpha Vantage',group:'Metales',context:'Barómetro de actividad industrial, construcción, redes eléctricas y transición energética, con China como centro de demanda.'},
    aluminum:{label:'Aluminio',icon:'⬡',unit:'USD/tonelada',source:'Alpha Vantage',group:'Metales',context:'Metal intensivo en energía usado en transporte, envases y manufactura. Sensible a electricidad y capacidad de fundición.'},
    corn:{label:'Maíz',icon:'🌽',unit:'USD/bushel',source:'Alpha Vantage',group:'Agricultura',context:'Grano clave para alimentos, forraje y etanol. Clima, inventarios y cosechas de Estados Unidos y Sudamérica dominan su balance.'},
    wheat:{label:'Trigo',icon:'🌾',unit:'USD/bushel',source:'Alpha Vantage',group:'Agricultura',context:'Commodity alimentario global con alta exposición a clima, exportaciones del Mar Negro y restricciones comerciales.'},
    soybeans:{label:'Soya',icon:'🫘',unit:'USD/tonelada',source:'Alpha Vantage',group:'Agricultura',context:'Complejo agrícola ligado a China, proteína animal, aceite vegetal y cosechas de Brasil, Argentina y Estados Unidos.'}
};

function commodityExplorerCoreData() {
    return {
        wti:{price:_petroData?.wti,pct:_petroData?.wtiPct},
        brent:{price:_petroData?.brent,pct:_petroData?.brentPct},
        gas:{price:_petroData?.gas,pct:_petroData?.gasPct},
        gold:{price:_rds?.gold,pct:_rds?.goldPct}
    };
}

function commodityExplorerPrice(key,value) {
    if(value==null||!Number.isFinite(+value)) return '—';
    var n=Number(value), digits=(key==='copper'||key==='corn'||key==='wheat')?2:(key==='aluminum'||key==='soybeans'?0:2);
    return '$'+n.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
}

function commoditySparkPath(history) {
    if(!Array.isArray(history)||history.length<2) return null;
    var values=history.map(Number).filter(Number.isFinite); if(values.length<2) return null;
    var lo=Math.min.apply(null,values),hi=Math.max.apply(null,values),span=hi-lo||1;
    return values.map(function(value,index){var x=2+(84*index/(values.length-1));var y=25-((value-lo)/span*21);return (index?'L':'M')+x.toFixed(1)+' '+y.toFixed(1);}).join(' ');
}

function commoditySparkMarkup(history) {
    var path=commoditySparkPath(history);if(!path)return '';
    if(_commodityChartType==='area')return '<path class="commodity-spark-area" d="'+path+' L86 26 L2 26 Z"></path><path d="'+path+'"></path>';
    if(_commodityChartType==='bars'){
        var values=history.map(Number).filter(Number.isFinite),lo=Math.min.apply(null,values),hi=Math.max.apply(null,values),span=hi-lo||1;
        return values.map(function(value,index){var x=5+(78*index/Math.max(1,values.length-1)),y=25-((value-lo)/span*20);return '<line class="commodity-spark-bar" x1="'+x.toFixed(1)+'" y1="25" x2="'+x.toFixed(1)+'" y2="'+y.toFixed(1)+'"></line>';}).join('');
    }
    return '<path d="'+path+'"></path>';
}

function renderCommodityExplorer() {
    var combined=Object.assign({},commodityExplorerCoreData(),_commodityExplorerData);
    Object.keys(_COMMODITY_EXPLORER_META).forEach(function(key){
        var data=combined[key]||{},valueEl=document.getElementById('cx-'+key),pctEl=document.getElementById('cx-'+key+'-pct');
        if(valueEl) valueEl.textContent=commodityExplorerPrice(key,data.price);
        if(pctEl){
            if(data.pct!=null&&Number.isFinite(+data.pct)){var p=Number(data.pct);pctEl.textContent=(p>=0?'▲ +':'▼ ')+Math.abs(p).toFixed(2)+'% último dato';pctEl.className=p>=0?'up':'down';}
            else {pctEl.textContent=_COMMODITY_EXPLORER_META[key].unit;pctEl.className='';}
        }
        var tile=document.querySelector('[data-commodity-key="'+key+'"]');
        var spark=tile?.querySelector('svg');if(spark)spark.innerHTML=commoditySparkMarkup(data.history||_commodityFallbackHistory[key]);
        if(tile&&data.pct!=null) tile.style.setProperty('--tile-color',Number(data.pct)>=0?'#15803d':'#dc2626');
    });
    document.querySelectorAll('[data-commodity-chart]').forEach(function(btn){var active=btn.dataset.commodityChart===_commodityChartType;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));});
}



function loadCommodityExplorer(force) {
    renderCommodityExplorer();
    if(_commodityExplorerPromise&&!force) return _commodityExplorerPromise;
    if(typeof VDS==='undefined'||typeof VDS.commodityWithPct!=='function') return Promise.resolve();
    var requests=[['copper','COPPER'],['aluminum','ALUMINUM'],['corn','CORN'],['wheat','WHEAT'],['soybeans','SOYBEANS']];
    var loaders=requests.map(function(item){return VDS.commodityWithPct(item[1]);});
    if(typeof fetchAssetData==='function'){loaders.push(fetchAssetData('GC=F'));loaders.push(fetchAssetData('ZS=F'));}
    _commodityExplorerPromise=Promise.allSettled(loaders).then(function(results){
        results.slice(0,requests.length).forEach(function(result,index){if(result.status==='fulfilled'&&result.value)_commodityExplorerData[requests[index][0]]=result.value;});
        var goldResult=results[requests.length];
        if(goldResult?.status==='fulfilled'&&goldResult.value?.meta)_commodityExplorerData.gold={price:goldResult.value.meta.regularMarketPrice,pct:goldResult.value.meta.regularMarketChangePercent,history:(goldResult.value.candles||[]).slice(-24).map(function(c){return c.close;})};
        var soyResult=results[requests.length+1];
        if(!_commodityExplorerData.soybeans&&soyResult?.status==='fulfilled'&&soyResult.value?.meta)_commodityExplorerData.soybeans={price:soyResult.value.meta.regularMarketPrice,pct:soyResult.value.meta.regularMarketChangePercent,history:(soyResult.value.candles||[]).slice(-24).map(function(c){return c.close;})};
        renderCommodityExplorer();
        return _commodityExplorerData;
    }).catch(function(){renderCommodityExplorer();return _commodityExplorerData;});
    return _commodityExplorerPromise;
}





function updateEnergyScenario(value) {
    var shock=Number(value)||0,output=document.getElementById('energy-shock-output'); if(output)output.textContent=(shock>0?'+':'')+shock+'%';
    var inflation=shock*.035,logistics=shock*.42;
    var inflText=Math.abs(shock)<2?'Sin presión adicional':(inflation>0?'+':'')+inflation.toFixed(2)+' pp estimados';
    var logText=Math.abs(shock)<2?'Estables':(logistics>0?'+':'')+logistics.toFixed(1)+'% potencial';
    var mxnText=Math.abs(shock)<2?'Neutral':shock>0?'Sesgo de apreciación':'Sesgo de depreciación';
    var set=function(id,text){var el=document.getElementById(id);if(el)el.textContent=text;};set('energy-scenario-inflation',inflText);set('energy-scenario-logistics',logText);set('energy-scenario-mxn',mxnText);
    document.querySelectorAll('.scenario-results > div').forEach(function(card,index){card.className=Math.abs(shock)<2?'':(index===2?(shock>0?'positive':'negative'):(shock>0?'caution':'positive'));});
}

var _ENERGY_DRIVERS = {
    supply:{icon:'fa-industry',kicker:'OFERTA GLOBAL',title:'OPEP+, producción y riesgo geopolítico',copy:'Los cambios en cuotas, interrupciones y capacidad ociosa alteran el balance físico y la prima de riesgo del crudo.',monitor:'Cuotas OPEP+ · producción no OPEP',signal:'Menor oferta → presión alcista'},
    inventory:{icon:'fa-warehouse',kicker:'BALANCE FÍSICO',title:'Inventarios comerciales y capacidad de almacenamiento',copy:'Las sorpresas semanales en crudo y productos refinados revelan si la oferta está superando o quedándose detrás de la demanda.',monitor:'EIA semanal · Cushing · gasolina',signal:'Caída de inventarios → mercado más ajustado'},
    demand:{icon:'fa-globe-asia',kicker:'DEMANDA MUNDIAL',title:'China, manufactura, transporte y estacionalidad',copy:'La actividad industrial, los viajes y las importaciones asiáticas determinan el pulso del consumo marginal de energía y metales.',monitor:'PMI China · tráfico aéreo · refinerías',signal:'Demanda firme → soporte para precios'},
    dollar:{icon:'fa-dollar-sign',kicker:'CONDICIONES FINANCIERAS',title:'Dólar, tasas reales y apetito por riesgo',copy:'Como las materias primas cotizan en dólares, un DXY fuerte encarece su compra fuera de Estados Unidos y suele moderar la demanda.',monitor:'DXY · Treasury real 10A · VIX',signal:'Dólar débil → viento a favor para commodities'}
};
function setEnergyDriver(key,button) {
    var driver=_ENERGY_DRIVERS[key];if(!driver)return;
    document.querySelectorAll('.energy-drivers-nav [role="tab"]').forEach(function(btn){var active=btn===button;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',active?'true':'false');});
    var icon=document.getElementById('energy-driver-icon');if(icon)icon.className='fas '+driver.icon;
    [['energy-driver-kicker','kicker'],['energy-driver-title','title'],['energy-driver-copy','copy'],['energy-driver-monitor','monitor'],['energy-driver-signal','signal']].forEach(function(pair){var el=document.getElementById(pair[0]);if(el)el.textContent=driver[pair[1]];});
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
        updateEquitySectorSnapshot(sData);
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
var NC_VISIBLE = 3;
var NC_CARD_H  = 240;
var NC_GAP     = 6;
var NC_STEP    = NC_CARD_H + NC_GAP;
var _ncAllItems  = [];
var _ncItems     = [];
var _ncPage      = 0;
var _ncTimer     = null;
var _ncHora      = '';
var _ncThemeImg = [
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
function _ncPages() { return Math.max(1, Math.ceil(_ncItems.length / NC_VISIBLE)); }
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
    _ncTimer = _vnFinIntervalo(() => {
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
// NOTA: usar var (no const) — finanzas-favro.js también declara este global.
// Con const, el segundo script lanza "Identifier already declared" y aborta finanzas-favro.js.
var CENTRAL_BANKS = window.CENTRAL_BANKS || { fed: 4.50, bce: 2.65, boe: 4.50, boj: 0.50 };
window.CENTRAL_BANKS = CENTRAL_BANKS;

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
                if (usRate != null && !isNaN(usRate)) CENTRAL_BANKS.fed = +(+usRate).toFixed(2);
                break;
            }
            case 'eu': CENTRAL_BANKS.bce = +(+rate).toFixed(2); break;
            case 'gb': CENTRAL_BANKS.boe = +(+rate).toFixed(2); break;
            case 'jp': CENTRAL_BANKS.boj = +(+rate).toFixed(2); break;
        }
    });
    // Actualizar tooltips y raw-data panel si ya están renderizados
    ['fed','bce','boe','boj'].forEach(k => {
        const el = document.querySelector(`[data-rds-key="${k}"] .rds-val`);
        if (el && CENTRAL_BANKS[k] != null) el.textContent = CENTRAL_BANKS[k].toFixed(2) + '%';
    });
}

var _rds = window._rds || {};
window._rds = _rds;

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
    setTimeout(() => _vnFinEscuchar(document, 'click', function _d(e){ if(!card.contains(e.target)){tip.style.display='none';tip.dataset.openFor='';} document.removeEventListener('click',_d); }), 60);
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
    /* El flag `u` NO es decorativo: sin él, la clase de caracteres se interpreta
       en unidades UTF-16, y cada emoji son DOS. La clase pasaba a contener
       mitades sueltas de surrogate, así que borraba la mitad alta y dejaba la
       baja huérfana: «🔴 Riesgo alto» salía como «� Riesgo alto» en el modal. */
    const cleanInterpretation = interpretation.replace(/^[🔴🟠🟡🟢📊]\s*/u, '');
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
    strip.style.display = 'grid';
    const fxSec = document.getElementById('fx-section');
    if (fxSec) fxSec.style.display = '';
}
async function loadFxStrip() {
    const FX_PAIRS = [
        { ticker: 'EURUSD=X', flag: '🇪🇺🇺🇸', label: 'EUR/USD', note: 'Euro frente al dólar', mode: 'direct' },
        { ticker: 'GBPUSD=X', flag: '🇬🇧🇺🇸', label: 'GBP/USD', note: 'Libra frente al dólar', mode: 'direct' },
        { ticker: 'USDJPY=X', flag: '🇺🇸🇯🇵', label: 'USD/JPY', note: 'Dólar frente al yen', mode: 'direct' },
        { ticker: 'USDCAD=X', flag: '🇺🇸🇨🇦', label: 'USD/CAD', note: 'Dólar frente al canadiense', mode: 'direct' },
        { ticker: 'USDCHF=X', flag: '🇺🇸🇨🇭', label: 'USD/CHF', note: 'Dólar frente al franco', mode: 'direct' },
        { ticker: 'AUDUSD=X', flag: '🇦🇺🇺🇸', label: 'AUD/USD', note: 'Australiano frente al dólar', mode: 'direct' },
        { ticker: 'NZDUSD=X', flag: '🇳🇿🇺🇸', label: 'NZD/USD', note: 'Neozelandés frente al dólar', mode: 'direct' },
        { ticker: 'USDBRL=X', flag: '🇺🇸🇧🇷', label: 'USD/BRL', note: 'Dólar frente al real', mode: 'direct' },
        { ticker: 'USDCNY=X', flag: '🇺🇸🇨🇳', label: 'USD/CNY', note: 'Dólar frente al yuan', mode: 'direct' },
        { ticker: 'USDINR=X', flag: '🇺🇸🇮🇳', label: 'USD/INR', note: 'Dólar frente a la rupia', mode: 'direct' },
    ];
    try {
        const results  = await Promise.allSettled(FX_PAIRS.map(p => fetchAssetData(p.ticker)));

        /* La tira "Tipo de Cambio · Tiempo Real" se retiró de Bolsa, así que
           #fxStrip ya no existe. Antes había aquí un `return` que salía en ese
           caso y dejaba sin pintar el tablero profesional de divisas
           (#fx-pro-panel), que se arma más abajo con estos mismos datos. */
        const strip = document.getElementById('fxStrip');

        const items = FX_PAIRS.map((p, i) => {
            const meta    = results[i].status === 'fulfilled' ? results[i].value?.meta    : null;
            const candles = results[i].status === 'fulfilled' ? results[i].value?.candles : null;
            const rawPx   = meta?.regularMarketPrice;
            const rawPct  = meta?.regularMarketChangePercent;
            const price = rawPx;
            const pct = rawPct;
            return { pair: p, meta, candles, price, pct, rawPx };
        });

        _fxData = items;

        const cards = items.map((it, i) => {
            if (!it.price) return '';
            const { pair: p, price, pct } = it;
            const isUp  = (pct ?? 0) >= 0;
            const disp  = price >= 100 ? price.toFixed(2) : price.toFixed(4);
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

        if (strip && cards.length) {
            strip.innerHTML = cards.join('');
            strip.style.display = 'grid';
            const fxSec = document.getElementById('fx-section');
            if (fxSec) fxSec.style.display = '';
        }
        renderFxProfessionalDashboard(items);
        renderFxOverviewTile(items);
        if (document.body.classList.contains('ff-detail-divisas')) loadFxHistoricalLab();
    } catch(e) {
        console.error('loadFxStrip error:', e);
        const references = [
            {ticker:'EURUSD=X',flag:'🇪🇺🇺🇸',label:'EUR/USD',note:'Euro frente al dólar',mode:'direct',price:1.1684,pct:-0.08},
            {ticker:'GBPUSD=X',flag:'🇬🇧🇺🇸',label:'GBP/USD',note:'Libra frente al dólar',mode:'direct',price:1.3539,pct:0.16},
            {ticker:'USDJPY=X',flag:'🇺🇸🇯🇵',label:'USD/JPY',note:'Dólar frente al yen',mode:'direct',price:156.30,pct:0.22},
            {ticker:'USDCAD=X',flag:'🇺🇸🇨🇦',label:'USD/CAD',note:'Dólar frente al canadiense',mode:'direct',price:1.3710,pct:0.04},
            {ticker:'USDCHF=X',flag:'🇺🇸🇨🇭',label:'USD/CHF',note:'Dólar frente al franco',mode:'direct',price:0.8040,pct:-0.05},
            {ticker:'AUDUSD=X',flag:'🇦🇺🇺🇸',label:'AUD/USD',note:'Australiano frente al dólar',mode:'direct',price:0.6510,pct:0.09},
            {ticker:'NZDUSD=X',flag:'🇳🇿🇺🇸',label:'NZD/USD',note:'Neozelandés frente al dólar',mode:'direct',price:0.6030,pct:-0.03},
            {ticker:'USDBRL=X',flag:'🇺🇸🇧🇷',label:'USD/BRL',note:'Dólar frente al real',mode:'direct',price:5.3765,pct:-0.05},
            {ticker:'USDCNY=X',flag:'🇺🇸🇨🇳',label:'USD/CNY',note:'Dólar frente al yuan',mode:'direct',price:7.2561,pct:0.09},
            {ticker:'USDINR=X',flag:'🇺🇸🇮🇳',label:'USD/INR',note:'Dólar frente a la rupia',mode:'direct',price:86.54,pct:0.07}
        ];
        const referencesWithMeta = references.map(ref => {
            const rawPx = ref.price;
            return {pair:{ticker:ref.ticker,flag:ref.flag,label:ref.label,note:ref.note,mode:ref.mode},meta:{regularMarketPrice:rawPx,regularMarketChangePercent:ref.pct},candles:[],price:ref.price,pct:ref.pct,rawPx,indicative:true};
        });
        _fxData = referencesWithMeta;
        renderFxProfessionalDashboard(referencesWithMeta);
        renderFxOverviewTile(referencesWithMeta);
        if (document.body.classList.contains('ff-detail-divisas')) loadFxHistoricalLab();
        const upd = document.getElementById('fx-pro-updated');
        if (upd) upd.textContent = 'Datos de referencia · fuente en vivo no disponible';
    }
}

var FX_HISTORY_CONFIG = {
    'DX-Y.NYB': { label:'Índice DXY', color:'#56c9b0', decimals:2 },
    'EURUSD=X': { label:'EUR / USD', color:'#4d6478', decimals:4 },
    'GBPUSD=X': { label:'GBP / USD', color:'#766087', decimals:4 },
    'USDJPY=X': { label:'USD / JPY', color:'#ad7629', decimals:2 },
    'USDCAD=X': { label:'USD / CAD', color:'#a34b55', decimals:4 },
    'USDBRL=X': { label:'USD / BRL', color:'#527565', decimals:4 },
    'USDCNY=X': { label:'USD / CNY', color:'#8a7045', decimals:4 },
    'USDCHF=X': { label:'USD / CHF', color:'#68717d', decimals:4 },
    'AUDUSD=X': { label:'AUD / USD', color:'#55757b', decimals:4 },
    'NZDUSD=X': { label:'NZD / USD', color:'#687c5b', decimals:4 },
    'USDINR=X': { label:'USD / INR', color:'#9a6b45', decimals:4 }
};
var FX_HISTORY_PERIODS = {
    '5d':  { range:'5d',  interval:'1h' },
    '1mo': { range:'1mo', interval:'1d' },
    '3mo': { range:'3mo', interval:'1d' },
    '1y':  { range:'1y',  interval:'1d' },
    '5y':  { range:'5y',  interval:'1wk' }
};
var _fxHistoryChart = null;
var _fxOverviewChart = null;
var _fxHistoryRequest = 0;
var _fxHistoryState = { primary:'EURUSD=X', comparisons:['GBPUSD=X','USDJPY=X'], period:'1y', mode:'relative' };
var _fxHistoryCardSelection = 'EURUSD=X';

function renderFxOverviewTile(items) {
    const usd = Array.isArray(items) ? items.find(item => item?.pair?.ticker === 'EURUSD=X') : null;
    const value = document.getElementById('ff-tile-divisas');
    const delta = document.getElementById('ff-tile-divisas-delta');
    if (value && Number.isFinite(+usd?.price)) value.textContent = Number(usd.price).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:4});
    if (delta && Number.isFinite(+usd?.pct)) {
        const pct = +usd.pct;
        delta.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
        delta.className = pct >= 0 ? 'is-up' : 'is-down';
    }
    const canvas = document.getElementById('ff-spark-divisas');
    const closes = (usd?.candles || []).map(item => Number(item.close)).filter(Number.isFinite).slice(-40);
    if (!canvas || closes.length < 2 || typeof Chart === 'undefined') return;
    if (_fxOverviewChart) _fxOverviewChart.destroy();
    _fxOverviewChart = new Chart(canvas.getContext('2d'), {
        type:'line',
        data:{ labels:closes.map((_,i)=>i+1), datasets:[{ data:closes, borderColor:'#67e8c7', backgroundColor:'rgba(15,138,120,.2)', borderWidth:2, pointRadius:0, fill:true, tension:.28 }] },
        options:{ responsive:true, maintainAspectRatio:false, animation:{duration:500}, plugins:{legend:{display:false},tooltip:{enabled:false}}, scales:{x:{display:false},y:{display:false}} }
    });
}

function fxHistoryTime(value) {
    const parsed = typeof value === 'number' ? new Date(value < 1e11 ? value * 1000 : value) : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function fxHistoryKey(value) {
    const date = fxHistoryTime(value);
    return date ? date.toISOString() : String(value);
}

function fxHistoryFormat(value, ticker) {
    const cfg = FX_HISTORY_CONFIG[ticker] || { decimals:4 };
    return Number.isFinite(+value)
        ? Number(value).toLocaleString('es-MX',{minimumFractionDigits:cfg.decimals,maximumFractionDigits:cfg.decimals})
        : '—';
}

function fxHistoryMetrics(candles) {
    const closes = (candles || []).map(item => Number(item.close)).filter(value => Number.isFinite(value) && value > 0);
    if (!closes.length) return { first:null,last:null,change:null,high:null,low:null,vol:null,count:0 };
    const returns = closes.slice(1).map((value,index) => Math.log(value / closes[index])).filter(Number.isFinite);
    const mean = returns.length ? returns.reduce((sum,value)=>sum+value,0) / returns.length : 0;
    const variance = returns.length > 1 ? returns.reduce((sum,value)=>sum+Math.pow(value-mean,2),0)/(returns.length-1) : 0;
    return {
        first:closes[0], last:closes[closes.length-1],
        change:closes[0] ? (closes[closes.length-1]/closes[0]-1)*100 : null,
        high:Math.max(...closes), low:Math.min(...closes),
        vol:returns.length > 1 ? Math.sqrt(variance) * Math.sqrt(_fxHistoryState.period === '5d' ? 24*252 : 252) * 100 : null,
        count:closes.length
    };
}

function setFxHistoryLoading(kind, message) {
    const state = document.getElementById('fx-history-state');
    const lab = document.getElementById('fx-history-lab');
    if (lab) lab.setAttribute('aria-busy', String(kind === 'loading'));
    if (!state) return;
    state.classList.toggle('is-off', kind === 'ready');
    state.classList.toggle('is-error', kind === 'error');
    state.innerHTML = kind === 'error'
        ? `<i class="fas fa-triangle-exclamation" aria-hidden="true"></i><span>${message || 'No se pudieron cargar las series cambiarias.'}</span>`
        : `<i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i><span>${message || 'Cargando series cambiarias…'}</span>`;
}

/* var, NO let: este archivo se reejecuta en cada montaje de la sección, y un
   let de nivel superior deja su enlace en el ámbito léxico global —que no se
   borra al desmontar—, así que la segunda ejecución lanza "already declared" y
   aborta el archivo ENTERO. El síntoma engaña: finTab y compañía siguen ahí de
   la primera vez, la página parece funcionar y solo faltan las gráficas. */
var _fxHistoryNoteTimer = null;
function updateFxHistoryModeNote(message, warning = false, temporary = false) {
    const note = document.getElementById('fx-history-mode-note');
    if (!note) return;
    const fallback = _fxHistoryState.mode === 'quote'
        ? 'Cotización muestra el nivel nominal del cruce principal. Activa Base 100 para comparar monedas distintas.'
        : 'Base 100 muestra el rendimiento relativo de todas las monedas desde un mismo punto de partida.';
    note.classList.toggle('is-warning', warning);
    note.innerHTML = `<i class="fas ${warning ? 'fa-triangle-exclamation' : 'fa-circle-info'}" aria-hidden="true"></i>${message || fallback}`;
    if (_fxHistoryNoteTimer) clearTimeout(_fxHistoryNoteTimer);
    if (temporary) {
        _fxHistoryNoteTimer = setTimeout(() => updateFxHistoryModeNote(), 2800);
    }
}

async function fetchFxHistory(ticker) {
    const params = FX_HISTORY_PERIODS[_fxHistoryState.period] || FX_HISTORY_PERIODS['1y'];
    const response = await fetch(`/api/stock-history?ticker=${encodeURIComponent(ticker)}&range=${params.range}&interval=${params.interval}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const candles = Array.isArray(data?.candles) ? data.candles.filter(item => Number.isFinite(+item.close)) : [];
    if (candles.length < 2) throw new Error('Serie insuficiente');
    return { ticker, candles, meta:data?.meta || {}, metrics:fxHistoryMetrics(candles) };
}

function syncFxHistoryControls() {
    const primary = document.getElementById('fx-history-primary');
    if (primary) primary.value = _fxHistoryState.primary;
    document.querySelectorAll('[data-fx-period]').forEach(button => {
        const active = button.dataset.fxPeriod === _fxHistoryState.period;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-fx-mode]').forEach(button => {
        const active = button.dataset.fxMode === _fxHistoryState.mode;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-fx-compare]').forEach(button => {
        const ticker = button.dataset.fxCompare;
        const active = _fxHistoryState.comparisons.includes(ticker);
        button.disabled = ticker === _fxHistoryState.primary;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-fx-history-card]').forEach(card => {
        const active = card.dataset.fxHistoryCard === _fxHistoryCardSelection;
        card.classList.toggle('is-chart-active', active);
        card.setAttribute('aria-pressed', String(active));
    });
    const periodLabels = {'5d':'5 d\u00edas','1mo':'1 mes','3mo':'3 meses','1y':'1 a\u00f1o','5y':'5 a\u00f1os'};
    const viewLabel = document.getElementById('fx-history-view-label');
    const seriesCount = document.getElementById('fx-history-series-count');
    const comparisonCount = _fxHistoryState.comparisons.filter(ticker => ticker !== _fxHistoryState.primary).length;
    if (viewLabel) viewLabel.textContent = `${FX_HISTORY_CONFIG[_fxHistoryState.primary]?.label || _fxHistoryState.primary} \u00b7 ${periodLabels[_fxHistoryState.period] || _fxHistoryState.period} \u00b7 ${_fxHistoryState.mode === 'relative' ? 'Base 100' : 'Cotizaci\u00f3n'}`;
    if (seriesCount) seriesCount.textContent = String(1 + comparisonCount);
    updateFxHistoryModeNote();
}

function bindFxHistoryLab() {
    const lab = document.getElementById('fx-history-lab');
    if (!lab || lab.dataset.bound === 'true') return;
    lab.dataset.bound = 'true';
    document.getElementById('fx-history-primary')?.addEventListener('change', event => {
        _fxHistoryState.primary = event.target.value;
        _fxHistoryCardSelection = _fxHistoryState.primary;
        _fxHistoryState.comparisons = _fxHistoryState.comparisons.filter(ticker => ticker !== _fxHistoryState.primary);
        syncFxHistoryControls();
        loadFxHistoricalLab();
    });
    document.querySelectorAll('[data-fx-period]').forEach(button => button.addEventListener('click', () => {
        _fxHistoryState.period = button.dataset.fxPeriod;
        syncFxHistoryControls();
        loadFxHistoricalLab();
    }));
    document.querySelectorAll('[data-fx-mode]').forEach(button => button.addEventListener('click', () => {
        _fxHistoryState.mode = button.dataset.fxMode;
        if (_fxHistoryState.mode === 'quote') _fxHistoryState.comparisons = [];
        syncFxHistoryControls();
        loadFxHistoricalLab();
    }));
    document.querySelectorAll('[data-fx-compare]').forEach(button => button.addEventListener('click', () => {
        if (button.disabled) return;
        const ticker = button.dataset.fxCompare;
        _fxHistoryCardSelection = _fxHistoryState.primary;
        if (_fxHistoryState.comparisons.includes(ticker)) {
            _fxHistoryState.comparisons = _fxHistoryState.comparisons.filter(item => item !== ticker);
        } else if (_fxHistoryState.comparisons.length < 3) {
            _fxHistoryState.comparisons.push(ticker);
            _fxHistoryState.mode = 'relative';
        } else {
            updateFxHistoryModeNote('Puedes comparar hasta tres cruces adicionales. Desactiva uno para elegir otra moneda.', true, true);
            return;
        }
        syncFxHistoryControls();
        loadFxHistoricalLab();
    }));
    syncFxHistoryControls();
}

function renderFxHistoryResults(series) {
    const primary = series.find(item => item.ticker === _fxHistoryState.primary) || series[0];
    if (!primary || typeof Chart === 'undefined') throw new Error('Gráfica no disponible');
    const metric = primary.metrics;
    const set = (id,value) => { const element=document.getElementById(id); if(element) element.textContent=value; };
    set('fx-history-last', fxHistoryFormat(metric.last,primary.ticker));
    set('fx-history-last-label', FX_HISTORY_CONFIG[primary.ticker]?.label || primary.ticker);
    set('fx-history-change', Number.isFinite(metric.change) ? `${metric.change>=0?'+':''}${metric.change.toFixed(2)}%` : '—');
    set('fx-history-high', fxHistoryFormat(metric.high,primary.ticker));
    set('fx-history-low', fxHistoryFormat(metric.low,primary.ticker));
    set('fx-history-vol', Number.isFinite(metric.vol) ? `${metric.vol.toFixed(2)}%` : '—');
    const changeElement = document.getElementById('fx-history-change');
    if (changeElement) changeElement.className = !Number.isFinite(metric.change) ? '' : metric.change >= 0 ? 'is-up' : 'is-down';

    const allKeys = [...new Set(series.flatMap(item => item.candles.map(candle => fxHistoryKey(candle.time))))]
        .sort((a,b) => new Date(a) - new Date(b));
    const relative = _fxHistoryState.mode === 'relative' || series.length > 1;
    const visualTitle = document.getElementById('fx-history-visual-title');
    if (visualTitle) visualTitle.textContent = relative ? `Rendimiento relativo \u00b7 ${series.length} ${series.length === 1 ? 'serie' : 'series'}` : `${FX_HISTORY_CONFIG[primary.ticker]?.label || primary.ticker} \u00b7 cotizaci\u00f3n hist\u00f3rica`;
    const datasets = series.map(item => {
        const cfg = FX_HISTORY_CONFIG[item.ticker] || { label:item.ticker,color:'#64748b' };
        const values = new Map(item.candles.map(candle => [fxHistoryKey(candle.time),Number(candle.close)]));
        const first = item.metrics.first;
        return {
            label:cfg.label,
            data:allKeys.map(key => {
                const value=values.get(key);
                return Number.isFinite(value) ? (relative && first ? value/first*100 : value) : null;
            }),
            borderColor:cfg.color,
            backgroundColor:`${cfg.color}18`,
            borderWidth:item.ticker === _fxHistoryState.primary ? 2.6 : 1.8,
            pointRadius:0,
            pointHoverRadius:4,
            spanGaps:true,
            tension:.22,
            fill:false
        };
    });
    const labels = allKeys.map(key => {
        const date = new Date(key);
        return Number.isNaN(date.getTime()) ? key : date.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:_fxHistoryState.period==='5y'?'2-digit':undefined});
    });
    if (_fxHistoryChart) _fxHistoryChart.destroy();
    const canvas = document.getElementById('fx-history-chart');
    const darkFxTheme = document.body.classList.contains('vn-dark-finanzas');
    const fxChartInk = darkFxTheme ? '#aebdc9' : '#71838a';
    const fxChartGrid = darkFxTheme ? 'rgba(169,191,207,.14)' : 'rgba(16,45,55,.07)';
    _fxHistoryChart = new Chart(canvas.getContext('2d'), {
        type:'line', data:{labels,datasets},
        options:{
            responsive:true, maintainAspectRatio:false, animation:{duration:450}, normalized:true,
            interaction:{mode:'index',intersect:false},
            plugins:{
                legend:{display:false},
                tooltip:{callbacks:{label:context => ` ${context.dataset.label}: ${relative ? Number(context.parsed.y).toFixed(2)+' base' : Number(context.parsed.y).toFixed(FX_HISTORY_CONFIG[series[context.datasetIndex].ticker]?.decimals || 4)}`}}
            },
            scales:{
                x:{grid:{display:false},ticks:{color:fxChartInk,font:{size:10},maxTicksLimit:8,maxRotation:0}},
                y:{grid:{color:fxChartGrid},border:{display:false},ticks:{color:fxChartInk,font:{size:10},callback:value=>relative?Number(value).toFixed(1):Number(value).toFixed(2)}}
            }
        }
    });

    const legend = document.getElementById('fx-history-legend');
    if (legend) legend.innerHTML = series.map(item => `<span><i style="background:${FX_HISTORY_CONFIG[item.ticker]?.color || '#64748b'}"></i>${FX_HISTORY_CONFIG[item.ticker]?.label || item.ticker}</span>`).join('');
    const body = document.getElementById('fx-history-table-body');
    if (body) body.innerHTML = series.map(item => {
        const m=item.metrics, change=Number.isFinite(m.change)?`${m.change>=0?'+':''}${m.change.toFixed(2)}%`:'—';
        return `<tr><td>${FX_HISTORY_CONFIG[item.ticker]?.label || item.ticker}</td><td>${fxHistoryFormat(m.last,item.ticker)}</td><td class="${m.change>=0?'is-up':'is-down'}">${change}</td><td>${fxHistoryFormat(m.high,item.ticker)}</td><td>${fxHistoryFormat(m.low,item.ticker)}</td><td>${m.count.toLocaleString('es-MX')}</td></tr>`;
    }).join('');
    const updated = document.getElementById('fx-history-updated');
    if (updated) updated.innerHTML = `<i></i> Actualizado ${new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}`;
    canvas.setAttribute('aria-label', `${relative ? 'Comparación base 100' : 'Cotización histórica'} de ${series.map(item=>FX_HISTORY_CONFIG[item.ticker]?.label || item.ticker).join(', ')}`);
}

async function loadFxHistoricalLab() {
    const lab = document.getElementById('fx-history-lab');
    if (!lab) return;
    bindFxHistoryLab();
    const requestId = ++_fxHistoryRequest;
    const tickers = [_fxHistoryState.primary, ..._fxHistoryState.comparisons.filter(ticker=>ticker!==_fxHistoryState.primary)].slice(0,4);
    setFxHistoryLoading('loading', `Cargando ${tickers.length} ${tickers.length===1?'serie':'series'} cambiarias…`);
    try {
        const results = await Promise.allSettled(tickers.map(fetchFxHistory));
        if (requestId !== _fxHistoryRequest) return;
        const series = results.filter(result=>result.status==='fulfilled').map(result=>result.value);
        if (!series.some(item=>item.ticker===_fxHistoryState.primary)) throw new Error('El cruce principal no devolvió datos');
        renderFxHistoryResults(series);
        setFxHistoryLoading('ready');
    } catch (error) {
        if (requestId !== _fxHistoryRequest) return;
        console.error('FX history:',error);
        setFxHistoryLoading('error','No se pudieron cargar los históricos. Intenta otro periodo.');
    }
}

function selectFxHistoryCard(ticker) {
    const lab = document.getElementById('fx-history-lab');
    if (!lab) return;

    const isBreadth = ticker === 'breadth';
    if (isBreadth) {
        _fxHistoryState.primary = 'EURUSD=X';
        _fxHistoryState.comparisons = ['GBPUSD=X', 'USDJPY=X', 'USDCNY=X'];
        _fxHistoryState.mode = 'relative';
    } else if (FX_HISTORY_CONFIG[ticker]) {
        _fxHistoryState.primary = ticker;
        _fxHistoryState.comparisons = _fxHistoryState.comparisons.filter(item => item !== ticker);
        if (!_fxHistoryState.comparisons.length && ticker !== 'EURUSD=X') {
            _fxHistoryState.comparisons = ['EURUSD=X'];
        }
        _fxHistoryState.mode = 'relative';
    } else {
        return;
    }

    _fxHistoryCardSelection = ticker;
    syncFxHistoryControls();
    if (isBreadth) updateFxHistoryModeNote('Amplitud global: cuatro cruces normalizados en Base 100 para comparar la dirección del dólar.', false, true);
    loadFxHistoricalLab();
    lab.classList.remove('is-card-target');
    void lab.offsetWidth;
    lab.classList.add('is-card-target');
    window.setTimeout(() => lab.classList.remove('is-card-target'), 900);
    lab.scrollIntoView({ behavior:'smooth', block:'start' });
}

function openFxDetail(index) {
    const item = Array.isArray(_fxData) ? _fxData[index] : null;
    if (!item) return;
    openMktEntry({
        asset:{label:item.pair.label,ticker:item.pair.ticker,sub:'TIPO DE CAMBIO INTERNACIONAL',metricLabel:'Cotización',context:`${item.pair.note}. Selecciona el cruce en el comparador histórico para estudiar su evolución.`},
        meta:{regularMarketPrice:item.price,regularMarketChangePercent:item.pct},
        candles:item.candles || []
    });
}

function openInternationalFxReport(index) {
    const item = Array.isArray(_internationalFxBoard) ? _internationalFxBoard[index] : null;
    if (!item) return;
    openMktEntry({
        asset:{label:item.label,ticker:item.label.replace('/',''),sub:'MERCADO FOREX GLOBAL',metricLabel:'Cotización',context:item.context},
        meta:{regularMarketPrice:item.price,regularMarketChangePercent:item.pct},
        candles:item.candles || []
    });
}

var _internationalFxBoard = [];
var _fxMarketSegment = 'all';

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
    const eurUsd = raw('EURUSD=X');
    const gbpUsd = raw('GBPUSD=X');
    const usdJpy = raw('USDJPY=X');
    const usdBrl = raw('USDBRL=X');
    const usdCad = raw('USDCAD=X');
    const usdCny = raw('USDCNY=X');
    const usdChf = raw('USDCHF=X');
    const audUsd = raw('AUDUSD=X');
    const nzdUsd = raw('NZDUSD=X');
    const usdInr = raw('USDINR=X');
    const valid = value => Number.isFinite(value) && value > 0;
    const pair = (label, flag, note, price, pct, decimals, source, context, candles, search) => ({label,flag,note,price,pct,decimals,source,context,candles:candles||[],search:search||''});
    return [
        pair('EUR/USD','🇪🇺🇺🇸','Euro frente al dólar',eurUsd?.price,eurUsd?.pct,4,'Yahoo Finance · EURUSD=X','Principal cruce mundial. Refleja el diferencial de crecimiento y política monetaria entre la zona euro y Estados Unidos.',eurUsd?.candles,'euro dolar estados unidos europa zona euro eur usd'),
        pair('GBP/USD','🇬🇧🇺🇸','Libra frente al dólar',gbpUsd?.price,gbpUsd?.pct,4,'Yahoo Finance · GBPUSD=X','Cruce líquido sensible a las decisiones del Banco de Inglaterra y la Fed.',gbpUsd?.candles,'libra esterlina dolar reino unido inglaterra estados unidos gbp usd'),
        pair('USD/JPY','🇺🇸🇯🇵','Dólar frente al yen',usdJpy?.price,usdJpy?.pct,2,'Yahoo Finance · USDJPY=X','Barómetro del diferencial de tasas entre la Fed y el Banco de Japón y de la demanda por refugio.',usdJpy?.candles,'dolar yen japon estados unidos usd jpy'),
        pair('USD/CAD','🇺🇸🇨🇦','Dólar frente al canadiense',usdCad?.price,usdCad?.pct,4,'Yahoo Finance · USDCAD=X','Sensible al petróleo y al ciclo comercial de Norteamérica.',usdCad?.candles,'dolar canadiense canada estados unidos norteamerica usd cad'),
        pair('USD/CHF','🇺🇸🇨🇭','Dólar frente al franco',usdChf?.price,usdChf?.pct,4,'Yahoo Finance · USDCHF=X','Cruce de refugio que contrasta la demanda por dólares y francos suizos.',usdChf?.candles,'dolar franco suizo suiza estados unidos usd chf'),
        pair('AUD/USD','🇦🇺🇺🇸','Australiano frente al dólar',audUsd?.price,audUsd?.pct,4,'Yahoo Finance · AUDUSD=X','Cruce sensible al ciclo de materias primas, China y apetito global por riesgo.',audUsd?.candles,'dolar australiano australia estados unidos aud usd'),
        pair('NZD/USD','🇳🇿🇺🇸','Neozelandés frente al dólar',nzdUsd?.price,nzdUsd?.pct,4,'Yahoo Finance · NZDUSD=X','Referencia de liquidez del Pacífico y expectativas del banco central de Nueva Zelanda.',nzdUsd?.candles,'dolar neozelandes nueva zelanda estados unidos nzd usd'),
        pair('USD/BRL','🇺🇸🇧🇷','Dólar frente al real',usdBrl?.price,usdBrl?.pct,4,'Yahoo Finance · USDBRL=X','Referencia líquida de riesgo latinoamericano, tasas y materias primas.',usdBrl?.candles,'dolar real brasil latinoamerica emergentes usd brl'),
        pair('USD/CNY','🇺🇸🇨🇳','Dólar frente al yuan',usdCny?.price,usdCny?.pct,4,'Yahoo Finance · USDCNY=X','Indicador de política cambiaria, comercio y competitividad manufacturera china.',usdCny?.candles,'dolar yuan renminbi china estados unidos asia usd cny'),
        pair('USD/INR','🇺🇸🇮🇳','Dólar frente a la rupia',usdInr?.price,usdInr?.pct,4,'Yahoo Finance · USDINR=X','Cruce emergente sensible a energía, flujos de capital y política del Banco de la Reserva de India.',usdInr?.candles,'dolar rupia india estados unidos asia usd inr')
    ].filter(item => valid(item.price));
}

function normalizeFxSearch(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}

/* Este archivo se vuelve a ejecutar cada vez que React monta /finanzas.
   Debe ser `var`, igual que el resto de sus globales reentrantes: un `const`
   permanece en el entorno léxico de la SPA aunque se retire la etiqueta script
   y hace que la siguiente visita aborte con "Identifier already declared". */
var FX_MATRIX_META = {
    USD:{name:'Dólar estadounidense',country:'Estados Unidos',flag:'us',segments:['g10']},
    EUR:{name:'Euro',country:'Eurozona Europa',flag:'eu',segments:['g10']},
    GBP:{name:'Libra esterlina',country:'Reino Unido',flag:'gb',segments:['g10']},
    JPY:{name:'Yen japonés',country:'Japón',flag:'jp',segments:['g10','asia']},
    CHF:{name:'Franco suizo',country:'Suiza',flag:'ch',segments:['g10']},
    CAD:{name:'Dólar canadiense',country:'Canadá',flag:'ca',segments:['g10']},
    AUD:{name:'Dólar australiano',country:'Australia',flag:'au',segments:['g10']},
    NZD:{name:'Dólar neozelandés',country:'Nueva Zelanda',flag:'nz',segments:['g10']},
    BRL:{name:'Real brasileño',country:'Brasil',flag:'br',segments:['emerging']},
    CNY:{name:'Yuan chino',country:'China',flag:'cn',segments:['asia','emerging']},
    INR:{name:'Rupia india',country:'India',flag:'in',segments:['asia','emerging']}
};

function fxMatrixCurrencyMatches(code, segment) {
    if (code === 'USD' || segment === 'all') return true;
    return FX_MATRIX_META[code]?.segments?.includes(segment) || false;
}

function filterFxMarketBoard() {
    const input = document.getElementById('fx-market-search-input');
    const grid = document.getElementById('fx-pro-pair-grid');
    if (!input || !grid) return;
    const query = normalizeFxSearch(input.value);
    const currencies = [...grid.querySelectorAll('.fx-matrix-colhead[data-fx-code]')].map(cell => cell.dataset.fxCode);
    const queryTokens = query.split(/[^a-z0-9]+/).filter(Boolean);
    const queryCodes = currencies.filter(code => {
        if (!query) return true;
        const haystack = normalizeFxSearch(`${code} ${FX_MATRIX_META[code]?.name || ''} ${FX_MATRIX_META[code]?.country || ''}`);
        return haystack.includes(query) || queryTokens.some(token => haystack.includes(token));
    });
    let visibleCodes = currencies.filter(code => fxMatrixCurrencyMatches(code,_fxMarketSegment) && (!query || queryCodes.includes(code)));
    if (query && visibleCodes.length && !visibleCodes.includes('USD')) visibleCodes.unshift('USD');
    const visibleSet = new Set(visibleCodes);
    grid.querySelectorAll('[data-fx-code]').forEach(cell => { cell.hidden = !visibleSet.has(cell.dataset.fxCode); });
    grid.querySelectorAll('[data-fx-row]').forEach(row => {
        const visible = visibleSet.has(row.dataset.fxRow);
        row.hidden = !visible;
        if (visible) row.style.setProperty('--fx-visible-currencies',visibleCodes.length);
    });
    grid.querySelector('.fx-matrix-header')?.style.setProperty('--fx-visible-currencies',visibleCodes.length);
    const status = document.getElementById('fx-market-search-status');
    const empty = document.getElementById('fx-market-search-empty');
    const clear = document.getElementById('fx-market-search-clear');
    const segmentLabel = _fxMarketSegment === 'all' ? 'todos los segmentos' : _fxMarketSegment === 'g10' ? 'G10' : _fxMarketSegment === 'asia' ? 'Asia' : 'emergentes';
    const crossCount = Math.max(0,visibleCodes.length * (visibleCodes.length - 1));
    if (status) status.textContent = query ? `${visibleCodes.length} monedas · ${crossCount} equivalencias para "${input.value.trim()}"` : `${visibleCodes.length} monedas · ${crossCount} equivalencias · ${segmentLabel}`;
    if (empty) empty.hidden = visibleCodes.length !== 0;
    if (clear) clear.hidden = !query;
}

function bindFxMarketSearch() {
    const input = document.getElementById('fx-market-search-input');
    const filterbar = document.getElementById('fx-market-filterbar');
    if (filterbar && filterbar.dataset.bound !== 'true') {
        filterbar.dataset.bound = 'true';
        filterbar.addEventListener('click', event => {
            const button = event.target.closest('[data-fx-segment]');
            if (!button) return;
            _fxMarketSegment = button.dataset.fxSegment || 'all';
            filterbar.querySelectorAll('[data-fx-segment]').forEach(item => {
                const active = item === button;
                item.classList.toggle('is-active', active);
                item.setAttribute('aria-pressed', String(active));
            });
            filterFxMarketBoard();
        });
    }
    if (!input || input.dataset.bound === 'true') return;
    input.dataset.bound = 'true';
    input.addEventListener('input', filterFxMarketBoard);
    document.getElementById('fx-market-search-clear')?.addEventListener('click', () => {
        input.value = '';
        filterFxMarketBoard();
        input.focus();
    });
    document.addEventListener('keydown', event => {
        if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
        if (/input|textarea|select/i.test(document.activeElement?.tagName || '')) return;
        if (!document.body.classList.contains('ff-detail-divisas')) return;
        event.preventDefault();
        input.focus();
    });
}

function openInternationalFxHistory(index) {
    const item = Array.isArray(_internationalFxBoard) ? _internationalFxBoard[index] : null;
    if (!item) return;
    selectFxHistoryCard(`${item.label.replace('/', '')}=X`);
}

function renderFxProfessionalDashboard(items) {
    const panel = document.getElementById('fx-pro-panel');
    if (!panel) return;
    items = Array.isArray(items) ? items.map((item,sourceIndex) => item ? ({...item,_sourceIndex:sourceIndex}) : null).filter(item => item && item.price != null) : [];
    const set = (id, value) => { const el = document.getElementById(id); if (el && value != null) el.textContent = value; };
    const formatPrice = item => item ? Number(item.price).toLocaleString('es-MX',{minimumFractionDigits:Number(item.price)>=100?2:4,maximumFractionDigits:Number(item.price)>=100?2:4}) : '—';
    const setChange = (id, pct, fallback) => {
        const el = document.getElementById(id); if (!el) return;
        if (pct == null || !Number.isFinite(+pct)) { el.textContent = fallback; el.className = ''; return; }
        const n = +pct;
        el.textContent = `${n >= 0 ? '▲ +' : '▼ '}${Math.abs(n).toFixed(2)}% · sesión`;
        el.className = n > 0 ? 'up' : n < 0 ? 'down' : '';
    };
    const eur = items.find(item => item.pair.label === 'EUR/USD') || _fxData?.[0];
    const gbp = items.find(item => item.pair.label === 'GBP/USD') || _fxData?.[1];
    const jpy = items.find(item => item.pair.label === 'USD/JPY') || _fxData?.[2];
    const chf = items.find(item => item.pair.label === 'USD/CHF') || _fxData?.[4];
    set('fx-pro-eurusd',formatPrice(eur)); setChange('fx-pro-eurusd-chg',eur?.pct,'Euro frente al dólar');
    set('fx-pro-gbpusd',formatPrice(gbp)); setChange('fx-pro-gbpusd-chg',gbp?.pct,'Libra frente al dólar');
    set('fx-pro-usdjpy',formatPrice(jpy)); setChange('fx-pro-usdjpy-chg',jpy?.pct,'Dólar frente al yen');
    set('fx-pro-dxy',_rds.dxy == null ? '—' : (+_rds.dxy).toFixed(2));
    setChange('fx-pro-dxy-chg',_rds.dxyPct,'Fortaleza del dólar');
    set('fx-pro-usdchf',formatPrice(chf)); setChange('fx-pro-usdchf-chg',chf?.pct,'Dólar frente al franco');

    const availablePct = items.filter(item => Number.isFinite(+item.pct));
    const usdMove = item => String(item.pair.ticker).startsWith('USD') ? +item.pct : -(+item.pct);
    const favorable = availablePct.filter(item => usdMove(item) >= 0).length;
    const breadth = availablePct.length ? Math.round(favorable / availablePct.length * 100) : null;
    set('fx-pro-breadth',breadth == null ? '—' : breadth + '%');
    set('fx-pro-breadth-note',availablePct.length ? `${favorable} de ${availablePct.length} cruces favorecen al USD` : 'Cruces frente al dólar');
    const internationalBoard = buildInternationalFxBoard(items);
    _internationalFxBoard = internationalBoard;
    const globalPct = internationalBoard.filter(item => Number.isFinite(+item.pct));
    set('fx-pro-board-status',`${internationalBoard.length || 0} cruces globales`);

    if (globalPct.length) {
        const byAbs = globalPct.slice().sort((a,b) => Math.abs(+b.pct)-Math.abs(+a.pct));
        const leader = globalPct.slice().sort((a,b) => +b.pct-(+a.pct))[0];
        const maxPct = Math.max(...globalPct.map(item => +item.pct));
        const minPct = Math.min(...globalPct.map(item => +item.pct));
        set('fx-pro-largest',`${byAbs[0].label} · ${Math.abs(+byAbs[0].pct).toFixed(2)}%`);
        set('fx-pro-pressure',`${leader.label} · ${+leader.pct >= 0 ? '+' : ''}${(+leader.pct).toFixed(2)}%`);
        set('fx-pro-dispersion',(maxPct-minPct).toFixed(2)+' pp');
    }

    const grid = document.getElementById('fx-pro-pair-grid');
    if (grid && internationalBoard.length) {
        const unitsPerUsd = {USD:1};
        const strengthVsUsd = {USD:0};
        const sourceIndex = {};
        internationalBoard.forEach((item,index) => {
            const [base,quote] = item.label.split('/');
            const price = +item.price;
            if (!Number.isFinite(price) || price <= 0) return;
            if (base === 'USD') {
                unitsPerUsd[quote] = price;
                strengthVsUsd[quote] = Number.isFinite(+item.pct) ? -(+item.pct) : null;
                sourceIndex[quote] = index;
            } else if (quote === 'USD') {
                unitsPerUsd[base] = 1 / price;
                strengthVsUsd[base] = Number.isFinite(+item.pct) ? +item.pct : null;
                sourceIndex[base] = index;
            }
        });
        const currencies = Object.keys(FX_MATRIX_META).filter(code => Number.isFinite(unitsPerUsd[code]));
        const formatCross = value => {
            if (!Number.isFinite(value)) return '—';
            const digits = value >= 100 ? 2 : value >= 10 ? 3 : value >= 1 ? 4 : value >= .01 ? 5 : 6;
            return value.toLocaleString('es-MX',{minimumFractionDigits:Math.min(2,digits),maximumFractionDigits:digits});
        };
        set('fx-pro-board-status',`${currencies.length} monedas · ${currencies.length * (currencies.length - 1)} equivalencias`);
        const currencyLabel = code => `<span class="fx-matrix-currency"><span class="fx-matrix-flag" data-country="${FX_MATRIX_META[code].flag.toUpperCase()}"><img src="https://flagcdn.com/w40/${FX_MATRIX_META[code].flag}.png" alt="Bandera de ${FX_MATRIX_META[code].country}" loading="lazy" onerror="this.parentElement.classList.add('is-fallback');this.remove()"></span><span><strong>${code}</strong><small>${FX_MATRIX_META[code].name}</small></span></span>`;
        const header = `<div class="fx-matrix-header" style="--fx-visible-currencies:${currencies.length}"><div class="fx-matrix-corner"><span>De</span><i class="fas fa-arrow-right"></i><span>A</span></div>${currencies.map(code=>`<div class="fx-matrix-colhead" data-fx-code="${code}">${currencyLabel(code)}</div>`).join('')}</div>`;
        const rows = currencies.map(base => {
            const cells = currencies.map(quote => {
                if (base === quote) return `<div class="fx-matrix-cell is-diagonal" data-fx-code="${quote}" aria-label="${base} frente a ${quote}"><span>—</span><small>Misma moneda</small></div>`;
                const rate = unitsPerUsd[quote] / unitsPerUsd[base];
                const baseMove = strengthVsUsd[base];
                const quoteMove = strengthVsUsd[quote];
                const move = Number.isFinite(baseMove) && Number.isFinite(quoteMove) ? baseMove - quoteMove : null;
                const state = move == null || Math.abs(move) < .005 ? 'is-flat' : move > 0 ? 'is-up' : 'is-down';
                const moveText = move == null ? 'Variación pendiente' : `${move >= 0 ? '+' : ''}${move.toFixed(2)}% diario`;
                const directCode = base === 'USD' ? quote : quote === 'USD' ? base : null;
                const directIndex = directCode ? sourceIndex[directCode] : null;
                const action = Number.isInteger(directIndex) ? ` role="button" tabindex="0" onclick="openInternationalFxHistory(${directIndex})" onkeydown="reportCardKey(event,()=>openInternationalFxHistory(${directIndex}))"` : '';
                return `<div class="fx-matrix-cell ${state}${Number.isInteger(directIndex)?' is-actionable':''}" data-fx-code="${quote}"${action} title="1 ${base} = ${formatCross(rate)} ${quote} · ${moveText}"><strong>${formatCross(rate)}</strong><small>${moveText}</small></div>`;
            }).join('');
            return `<div class="fx-matrix-row" data-fx-row="${base}" style="--fx-visible-currencies:${currencies.length}"><div class="fx-matrix-rowhead" data-fx-code="${base}">${currencyLabel(base)}</div>${cells}</div>`;
        }).join('');
        grid.innerHTML = `<div class="fx-matrix-scroll">${header}${rows}</div>`;
        bindFxMarketSearch();
        filterFxMarketBoard();
    }

    const dxy = Number.isFinite(+_rds.dxy) ? +_rds.dxy : 100;
    const avgUsdMove = availablePct.length ? availablePct.reduce((sum,item)=>sum+usdMove(item),0)/availablePct.length : 0;
    let score = 50 + avgUsdMove * 28 + Math.max(-18,Math.min(18,(dxy-100)*2.4)) + (breadth == null ? 0 : (breadth-50)*.22);
    score = Math.round(Math.max(8,Math.min(92,score)));
    const regimePanel = document.getElementById('fx-pro-regime-panel');
    if (regimePanel) regimePanel.style.setProperty('--fx-score',score+'%');
    const marker = document.getElementById('fx-pro-regime-marker'); if (marker) marker.style.left = score+'%';
    set('fx-pro-score',score);
    const regime = score >= 65 ? 'Dólar con sesgo de fortaleza' : score <= 35 ? 'Dólar con sesgo de debilidad' : 'Dólar en rango equilibrado';
    const badge = score >= 65 ? 'USD dominante' : score <= 35 ? 'USD defensivo' : 'Rango neutral';
    const copy = score >= 65 ? 'El DXY y la amplitud de los cruces confirman fortaleza general del dólar frente a monedas desarrolladas y emergentes.' : score <= 35 ? 'La mayoría de los cruces muestra una pérdida de impulso del dólar; conviene vigilar tasas, liquidez y apetito por riesgo.' : 'El DXY, la amplitud y el movimiento spot no muestran una dirección extrema para el dólar.';
    set('fx-pro-regime-title',regime); set('fx-pro-regime-badge',badge); set('fx-pro-regime-copy',copy);
    set('fx-pro-signal-dollar',_rds.dxy == null ? 'Pendiente' : dxy > 105 ? 'Dólar muy fuerte' : dxy > 100 ? 'Dólar firme' : 'Dólar moderado');
    set('fx-pro-signal-breadth',breadth == null ? 'Pendiente' : `${breadth}% favorece al USD`);
    set('fx-pro-signal-session',availablePct.length ? `${avgUsdMove >= 0 ? '+' : ''}${avgUsdMove.toFixed(2)}% USD medio` : 'Pendiente');
    set('fx-catalyst-rates',`Fed ${CENTRAL_BANKS.fed.toFixed(2)}% · diferenciales globales`);
    set('fx-catalyst-dollar',_rds.dxy == null ? 'Esperando DXY' : `DXY ${dxy.toFixed(2)} · ${dxy > 105 ? 'zona fuerte' : dxy > 100 ? 'zona firme' : 'zona moderada'}`);
    set('fx-catalyst-risk',_rds.vix == null ? 'Volatilidad bajo observación' : `VIX ${(+_rds.vix).toFixed(1)} · ${+_rds.vix < 15 ? 'calma' : +_rds.vix < 25 ? 'riesgo moderado' : 'estrés elevado'}`);
    set('fx-pro-thesis-title',regime);
    set('fx-pro-thesis-copy',`${copy} ${breadth == null ? '' : `El dólar avanza en ${favorable} de ${availablePct.length} cruces disponibles.`}`.trim());
    set('fx-pro-updated','Actualizado '+new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}));
    set('sidebar-pulse-eurusd',formatPrice(eur));
    set('sidebar-pulse-eurusd-note',eur?.pct == null ? 'Tipo de cambio' : `${+eur.pct >= 0 ? '▲ +' : '▼ '}${Math.abs(+eur.pct).toFixed(2)}% sesión`);
    set('sidebar-pulse-dxy',_rds.dxy == null ? '—' : (+_rds.dxy).toFixed(2));
    set('sidebar-pulse-dxy-note',_rds.dxy == null ? 'Dólar global' : dxy > 105 ? 'Dólar muy fuerte' : dxy > 100 ? 'Dólar firme' : 'Dólar moderado');
    set('sidebar-pulse-vix',_rds.vix == null ? '—' : (+_rds.vix).toFixed(1));
    set('sidebar-pulse-vix-note',_rds.vix == null ? 'Volatilidad' : +_rds.vix < 15 ? 'Calma' : +_rds.vix < 25 ? 'Riesgo moderado' : 'Estrés elevado');
    set('sidebar-pulse-carry',breadth == null ? '—' : `${breadth}%`);
    set('sidebar-pulse-reading',`${regime}. ${breadth == null ? 'La amplitud cambiaria sigue en actualización.' : `${favorable} de ${availablePct.length} cruces disponibles favorecen al dólar.`}`);
}

function openFxSectionReport(kind) {
    const text = id => (document.getElementById(id)?.textContent || '').trim();
    const score = Number(text('fx-pro-score'));
    const breadth = Number.parseFloat(text('fx-pro-breadth'));
    const globalPairs = Array.isArray(_internationalFxBoard) ? _internationalFxBoard : [];
    const emergingPairs = globalPairs.filter(item => ['USD/BRL','USD/CNY','USD/INR'].includes(item.label));
    const configs = {
        breadth: {
            label:'Amplitud global del dólar', sub:'MONEDAS INTERNACIONALES FRENTE AL USD', metricLabel:'Amplitud', value:Number.isFinite(breadth)?breadth:null, suffix:'%',
            context:`La amplitud resume cuántos cruces internacionales favorecen al dólar. ${text('fx-pro-breadth-note') || 'La lectura compara dirección y consistencia entre las principales divisas.'}`
        },
        regime: {
            label:'Régimen global del dólar', sub:'MODELO DE FORTALEZA RELATIVA VALLNEWS', metricLabel:'Puntuación', value:Number.isFinite(score)?score:null, suffix:'/100',
            context:`${text('fx-pro-regime-title')}. ${text('fx-pro-regime-copy')} Señales: dólar global ${text('fx-pro-signal-dollar')}; amplitud ${text('fx-pro-signal-breadth')}; sesión ${text('fx-pro-signal-session')}.`
        },
        catalysts: {
            label:'Catalizadores del mercado cambiario', sub:'TASAS · DÓLAR · FLUJOS · VOLATILIDAD', metricLabel:'Amplitud USD', value:Number.isFinite(breadth)?breadth:null, suffix:'%',
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
var FIN_CK = 'fin_v7';
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
    // Carrusel lateral "Noticias Financieras": ahora usa el MISMO noticiero real y
    // editorial (/api/daily-news, Finnhub+NewsAPI+Gemini) que el módulo Daily News.
    // Ya viene en español, así que no se traduce con mymemory (evita los 429).
    const dailyNewsPromise = fetch('/api/daily-news')
        .then(r => r.ok ? r.json() : null)
        .then(j => (Array.isArray(j?.data?.noticias) ? j.data.noticias : []).map(n => ({
            categoria:   n.categoryLabel || 'Mercados',
            titulo:      n.title || '',
            descripcion: n.description || '',
            fuente:      (n.source || 'MESA EDITORIAL').toUpperCase(),
            impacto:     n.impact || 'medio',
            ia_insight:  n.insight || '',
            image:       n.image || '',
            url:         n.url || '',
            fecha:       n.fecha || '',
        })))
        .catch(() => []);

    dailyNewsPromise.then(noticias => {
        if (!Array.isArray(noticias) || noticias.length < 3) return;
        _fhImgPool = noticias.filter(n => n.image && n.image.startsWith('http')).map(n => n.image);
        let list = noticias.slice(0, 9);
        if (list.length < 9) list = list.concat(buildFallback(null, null, null, hora).slice(list.length));
        renderNewsGrid(list, hora);
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
    const dailyNews = await dailyNewsPromise;
    _fhImgPool = dailyNews.filter(n => n.image && n.image.startsWith('http')).map(n => n.image);
    let noticiasFinales = dailyNews.slice(0, 9);
    if (noticiasFinales.length < 9) {
        noticiasFinales = noticiasFinales.concat(buildFallback(tiieVal, fix, null, hora).slice(noticiasFinales.length));
    }
    const bc = { banxico: tiieVal, ...CENTRAL_BANKS };
    renderNewsGrid(noticiasFinales, hora);
    window.VNLoader?.hide();
    tx('ai-status', `Actualizado · ${hora}`);
    const obj = { hora, tiie: tiieVal, fix, infl, vix: vixVal, creditSpread, bc, vai: [vaiPred, vaiVerdict, vaiAlerta, 'MERCADO MX'], noticias: noticiasFinales, imgPool: _fhImgPool, fx };
    if (isCacheValid(obj)) VDS.save(FIN_CK, obj);
}
var _capitalView = (() => {
    try {
        const saved = localStorage.getItem('vn_capital_view');
        return ['spark','bars','heat'].includes(saved) ? saved : 'spark';
    } catch { return 'spark'; }
})();

function syncCapitalView() {
    const panel = document.getElementById('mkt-cap-panel');
    if (panel) panel.dataset.capitalView = _capitalView;
    document.querySelectorAll('[data-capital-view]').forEach(btn => {
        const active = btn.dataset.capitalView === _capitalView;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
}

function setCapitalView(view) {
    if (!['spark','bars','heat'].includes(view)) return;
    _capitalView = view;
    try { localStorage.setItem('vn_capital_view', view); } catch(e) {}
    syncCapitalView();
}

async function loadMktCap() {
    const ASSETS = [
        { ticker: '^MXX',     label: 'IPC',        sub: 'Bolsa México', icon: 'fa-landmark',          tone: 'mx'     },
        { ticker: '^GSPC',    label: 'S&P 500',    sub: 'Estados Unidos', icon: 'fa-chart-line',      tone: 'us'     },
        { ticker: 'QQQ',      label: 'NASDAQ 100', sub: 'Tecnología', icon: 'fa-microchip',          tone: 'tech'   },
        { ticker: 'USDMXN=X', label: 'USD / MXN', sub: 'Mercado cambiario', icon: 'fa-right-left',    tone: 'fx'     },
        { ticker: 'GC=F',     label: 'Oro',        sub: 'Commodities', icon: 'fa-coins',              tone: 'gold'   },
        { ticker: 'BTC-USD',  label: 'Bitcoin',    sub: 'Criptoactivo', icon: 'fa-bitcoin',           tone: 'crypto', brand: true },
        { ticker: 'DX-Y.NYB', label: 'DXY',        sub: 'Índice dólar', icon: 'fa-dollar-sign',       tone: 'dollar' },
    ];
    const results = await Promise.allSettled(ASSETS.map(a => fetchAssetData(a.ticker)));

    function sparkSVG(candles, isUp, idx) {
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
        return `<defs>
            <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${col}" stop-opacity=".22"/>
                <stop offset="90%" stop-color="${col}" stop-opacity=".02"/>
            </linearGradient>
        </defs>
        <polygon points="${areaStr}" fill="url(#${gid})"/>
        <polyline points="${lineStr}" stroke="${col}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${lx}" cy="${ly}" r="5.5" fill="${col}" opacity=".18"/>
        <circle cx="${lx}" cy="${ly}" r="2.5" fill="${col}"/>`;
    }

    function fmtPrice(p) {
        if (p == null) return '—';
        if (p >= 10000) return p.toLocaleString('es-MX', { maximumFractionDigits: 0 });
        if (p >= 1000)  return p.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (p >= 10)    return p.toFixed(2);
        return p.toFixed(4);
    }

    function fmtRange(candles) {
        if (!candles || candles.length < 2) return '';
        const closes = candles.map(c => c.close);
        const lo = Math.min(...closes), hi = Math.max(...closes);
        return `5d: ${((hi - lo) / lo * 100).toFixed(1)}%`;
    }

    const list = document.getElementById('mkt-cap-list');
    if (!list) return;
    list.innerHTML = ASSETS.map((a, i) => {
        const data     = results[i].status === 'fulfilled' ? results[i].value : null;
        const meta     = data?.meta || {};
        const candles  = data?.candles || [];
        const price    = meta.regularMarketPrice;
        const pct      = meta.regularMarketChangePercent;
        const isUp     = (pct ?? 0) >= 0;
        const pctStr   = pct != null ? (isUp ? '+' : '') + pct.toFixed(2) + '%' : '—';
        const arrow    = pct == null ? '' : isUp ? '▲' : '▼';
        const badgeCls = pct == null ? 'flat' : isUp ? 'up' : 'down';
        const rowCls   = pct == null ? 'row-flat' : isUp ? 'row-up' : 'row-down';
        const range    = fmtRange(candles);
        return `<div class="mkt-row ${rowCls}" onclick="openMktDetail(${i})" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openMktDetail(${i})}">
            <div class="mkt-identity">
                <span class="mkt-icon tone-${a.tone}"><i class="${a.brand ? 'fab' : 'fas'} ${a.icon}"></i></span>
                <div>
                    <div class="mkt-name">${a.label}</div>
                    <div class="mkt-sub">${a.sub}</div>
                </div>
            </div>
            <svg class="sparkline" viewBox="0 0 126 40" preserveAspectRatio="none" fill="none">${sparkSVG(candles, isUp, i)}</svg>
            <div class="mkt-daily-bar ${badgeCls}"><div><span style="width:${pct == null ? 0 : Math.min(100,Math.max(8,Math.abs(pct)*18))}%"></span></div><small>Movimiento diario</small></div>
            <div class="mkt-right">
                <span class="mkt-badge ${badgeCls}">${arrow} ${pctStr}</span>
                <div class="mkt-val">${fmtPrice(price)}</div>
                ${range ? `<div class="mkt-range">Rango ${range.replace('5d: ','5D · ')}</div>` : ''}
            </div>
        </div>`;
    }).join('');

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
    updateGeneralKPIs();
    syncCapitalView();
}
async function updateTicker() {
    const track = document.getElementById('vnTrack');
    if (!track) return;
    const TICKER_ASSETS = [
        { s: 'GFNORTEO', n: 'Banorte',       t: 'GFNORTEO.MX' },
        { s: 'WALMEX',   n: 'Walmart MX',    t: 'WALMEX.MX'   },
        { s: 'FEMSA',    n: 'FEMSA',          t: 'FEMSAUBD.MX' },
        { s: 'AMXB',     n: 'América Móvil', t: 'AMXB.MX'     },
        { s: 'BIMBOA',   n: 'Bimbo',         t: 'BIMBOA.MX'   },
        { s: 'CEMEXCPO', n: 'Cemex',         t: 'CEMEXCPO.MX' },
        { s: 'GMEXICOB', n: 'Grupo México',  t: 'GMEXICOB.MX' },
        { s: 'CL=F',     n: 'Petróleo WTI',  t: 'CL=F'        },
        { s: 'GC=F',     n: 'Oro',           t: 'GC=F'        },
        { s: 'ZC=F',     n: 'Maíz CME',      t: 'ZC=F'        },
        { s: 'ZS=F',     n: 'Soya CME',      t: 'ZS=F'        },
        { s: 'BTC',      n: 'Bitcoin',       t: 'BTC-USD'     },
        { s: 'DXY',      n: 'USD Index',     t: 'DX-Y.NYB'    },
        { s: 'MOVE',     n: 'Vol. Bonos',    t: '^MOVE'       },
    ];
    const placeholderHtml = TICKER_ASSETS.map(a => `<div class="vn-item"><span class="vn-sym">${a.s}</span><span class="vn-name">${a.n}</span><span class="vn-price">—</span><div class="vn-chg"><span>—</span></div></div><div class="vn-sep"></div>`).join('');
    track.innerHTML = placeholderHtml + placeholderHtml;
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
var _bondsCurveChart = null;
var _bondChartType = (()=>{try{return ['ranking','columns','line','radar'].includes(localStorage.getItem('vn_bond_chart_type'))?localStorage.getItem('vn_bond_chart_type'):'ranking';}catch(e){return 'ranking';}})();
function setBondChartType(type, button) {
    if(!['ranking','columns','line','radar'].includes(type)||type===_bondChartType)return;
    _bondChartType=type;try{localStorage.setItem('vn_bond_chart_type',type);}catch(e){}
    document.querySelectorAll('[data-bond-chart]').forEach(btn=>{const active=btn.dataset.bondChart===type;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));});
    const labels={ranking:'Ranking horizontal',columns:'Columnas comparativas',line:'Línea de rendimientos',radar:'Radar soberano'};
    const label=document.getElementById('bond-chart-type-label');if(label)label.textContent=labels[type];
    if(_globalBondData.length)renderBondsCurveChart(_globalBondData,false);
}
function renderBondsCurveChart(data, isRef = false) {
    const canvas = document.getElementById('bonds-curve-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const shortCountry = { us:'EE. UU.', eu:'Zona Euro', mx:'México', jp:'Japón', gb:'Reino Unido', cn:'China', br:'Brasil', ca:'Canadá', de:'Alemania', fr:'Francia', it:'Italia', es:'España', au:'Australia', kr:'Corea del Sur', in:'India', za:'Sudáfrica', cl:'Chile', id:'Indonesia', ch:'Suiza', nz:'Nueva Zelanda', pl:'Polonia' };
    const colors = { us:'#2563eb', eu:'#6366f1', mx:'#059669', jp:'#e11d48', gb:'#7c3aed', cn:'#dc2626', br:'#d97706', ca:'#0891b2', de:'#334155', fr:'#3b82f6', it:'#10b981', es:'#f59e0b', au:'#0ea5e9', kr:'#8b5cf6', in:'#f97316', za:'#ca8a04', cl:'#14b8a6', id:'#ef4444', ch:'#64748b', nz:'#06b6d4', pl:'#be123c' };
    const points = data.map(entry => {
        const bond = entry.bonds?.find(item => item.maturity === _globalBondMaturity && !/TIIE|Tasa objetivo|Tasa base|LPR|SELIC/i.test(item.label || ''));
        return bond?.yield == null ? null : {
            key: entry.key,
            country: shortCountry[entry.key] || entry.country,
            flag: entry.flag || '',
            label: bond.label,
            maturity: bond.maturity || '',
            yield: Number(bond.yield),
            prev: bond.prev,
            source: bond.indicative ? 'Referencia soberana indicativa' : (entry.source || ''),
            indicative: !!bond.indicative,
            color: colors[entry.key] || '#64748b',
        };
    }).filter(Boolean).sort((a, b) => b.yield - a.yield);
    if (!points.length) return;

    const statusEl = document.getElementById('bonds-curve-status');
    if (statusEl) {
        const maturityLabel = _globalBondMaturity === '1Y' ? '1 AÑO' : _globalBondMaturity.replace('Y',' AÑOS');
        statusEl.textContent = `${points.length} ${points.length === 1 ? 'país' : 'países'} · ${maturityLabel}`;
        statusEl.style.background = 'rgba(2,132,199,.1)';
        statusEl.style.color = '#0369a1';
    }
    const coverage = document.getElementById('debt-global-coverage');
    if (coverage) coverage.textContent = `${points.length} ${points.length === 1 ? 'mercado' : 'mercados'} con información para este plazo`;
    const ctx2d = canvas.getContext('2d');
    if (_bondsCurveChart) _bondsCurveChart.destroy();
    const isRanking=_bondChartType==='ranking',isLine=_bondChartType==='line',isRadar=_bondChartType==='radar';
    const chartKind=isLine?'line':isRadar?'radar':'bar';
    const valueAxis={beginAtZero:true,ticks:{callback:v=>Number(v).toFixed(1)+'%',font:{size:9,family:"'JetBrains Mono', monospace"},color:'#94a3b8',maxTicksLimit:6},grid:{color:'rgba(15,23,42,.055)',drawBorder:false},border:{display:false}};
    const categoryAxis={ticks:{font:{size:9,family:"'Inter', sans-serif",weight:'700'},color:'#334155',autoSkip:false},grid:{display:false},border:{display:false}};
    const chartScales=isRadar?{r:{beginAtZero:true,angleLines:{color:'rgba(15,23,42,.08)'},grid:{color:'rgba(15,23,42,.07)'},pointLabels:{font:{size:8,family:"'Inter', sans-serif"},color:'#475569'},ticks:{display:false}}}:isRanking?{x:valueAxis,y:categoryAxis}:{x:categoryAxis,y:valueAxis};
    _bondsCurveChart = new Chart(ctx2d, {
        type: chartKind,
        data: {
            labels: points.map(point => `${point.flag} ${point.country}`),
            datasets: [{
                label: 'Rendimiento / tasa',
                data: points.map(point => point.yield),
                backgroundColor: isLine?'rgba(37,99,235,.12)':isRadar?'rgba(37,99,235,.18)':points.map(point => point.color + 'D9'),
                borderColor: isLine||isRadar?'#2563eb':points.map(point => point.color),
                borderWidth: isLine||isRadar?2:1,
                borderRadius: 6,
                borderSkipped: false,
                barThickness: isLine||isRadar?undefined:(points.length > 14 ? 11 : points.length > 8 ? 14 : 17),
                fill:isLine||isRadar,
                tension:.28,
                pointRadius:isLine?3:isRadar?2:0,
                pointBackgroundColor:points.map(point=>point.color),
            }],
        },
        options: {
            indexAxis: isRanking?'y':'x',
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', intersect: true },
            onHover: (event, elements) => { event.native.target.style.cursor = elements.length ? 'pointer' : 'default'; },
            onClick: (_, elements) => {
                if (!elements.length) return;
                const point = points[elements[0].index];
                if (point && typeof openBondDetail === 'function') openBondDetail(point.key, point.label);
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: 'rgba(255,255,255,.55)',
                    bodyColor: '#fff',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        title: context => context[0].label,
                        label: context => {
                            const point = points[context.dataIndex];
                            return ` ${point.label}${point.maturity ? ` · ${point.maturity}` : ''}: ${point.yield.toFixed(2)}%`;
                        },
                        afterLabel: context => {
                            const point = points[context.dataIndex];
                            return point.source ? ` ${point.indicative ? 'Dato:' : 'Fuente:'} ${point.source}` : '';
                        },
                    },
                },
            },
            scales: chartScales,
        },
    });

    document.querySelectorAll('[data-bond-chart]').forEach(btn=>{const active=btn.dataset.bondChart===_bondChartType;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));});
    const typeLabel=document.getElementById('bond-chart-type-label');if(typeLabel)typeLabel.textContent={ranking:'Ranking horizontal',columns:'Columnas comparativas',line:'Línea de rendimientos',radar:'Radar soberano'}[_bondChartType];

    const high = points[0];
    const low = points[points.length - 1];
    const setSummary = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setSummary('debt-global-high', `${high.flag} ${high.country} · ${high.yield.toFixed(2)}%`);
    setSummary('debt-global-low', `${low.flag} ${low.country} · ${low.yield.toFixed(2)}%`);
    setSummary('debt-global-range', `${(high.yield - low.yield).toFixed(2)} pp`);
}

var _BOND_FB = [
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

var GLOBAL_SOVEREIGN_REFERENCES = [
    { key:'us', country:'Estados Unidos', flag:'🇺🇸', bonds:[{label:'Treasury 1Y',maturity:'1Y',yield:3.82,prev:3.80},{label:'Treasury 2Y',maturity:'2Y',yield:3.94,prev:3.91}] },
    { key:'mx', country:'México', flag:'🇲🇽', bonds:[{label:'Mbono 10Y',maturity:'10Y',yield:9.20,prev:9.18}] },
    { key:'jp', country:'Japón', flag:'🇯🇵', bonds:[{label:'JGB 10Y',maturity:'10Y',yield:1.55,prev:1.53}] },
    { key:'gb', country:'Reino Unido', flag:'🇬🇧', bonds:[{label:'Gilt 10Y',maturity:'10Y',yield:4.65,prev:4.62}] },
    { key:'cn', country:'China', flag:'🇨🇳', bonds:[{label:'CGB 10Y',maturity:'10Y',yield:1.85,prev:1.86}] },
    { key:'br', country:'Brasil', flag:'🇧🇷', bonds:[{label:'NTN-F 10Y',maturity:'10Y',yield:13.20,prev:13.16}] },
    { key:'ca', country:'Canadá', flag:'🇨🇦', bonds:[{label:'GoC 10Y',maturity:'10Y',yield:3.35,prev:3.32}] },
    { key:'de', country:'Alemania', flag:'🇩🇪', bonds:[{label:'Bund 10Y',maturity:'10Y',yield:3.01,prev:2.99}] },
    { key:'fr', country:'Francia', flag:'🇫🇷', bonds:[{label:'OAT 10Y',maturity:'10Y',yield:3.60,prev:3.57}] },
    { key:'it', country:'Italia', flag:'🇮🇹', bonds:[{label:'BTP 10Y',maturity:'10Y',yield:4.05,prev:4.01}] },
    { key:'es', country:'España', flag:'🇪🇸', bonds:[{label:'Bono 10Y',maturity:'10Y',yield:3.45,prev:3.42}] },
    { key:'au', country:'Australia', flag:'🇦🇺', bonds:[{label:'ACGB 10Y',maturity:'10Y',yield:4.55,prev:4.51}] },
    { key:'kr', country:'Corea del Sur', flag:'🇰🇷', bonds:[{label:'KTB 10Y',maturity:'10Y',yield:3.25,prev:3.23}] },
    { key:'in', country:'India', flag:'🇮🇳', bonds:[{label:'G-Sec 10Y',maturity:'10Y',yield:6.35,prev:6.36}] },
    { key:'za', country:'Sudáfrica', flag:'🇿🇦', bonds:[{label:'SAGB 10Y',maturity:'10Y',yield:9.10,prev:9.06}] },
    { key:'cl', country:'Chile', flag:'🇨🇱', bonds:[{label:'BTP Chile 10Y',maturity:'10Y',yield:5.80,prev:5.77}] },
    { key:'id', country:'Indonesia', flag:'🇮🇩', bonds:[{label:'INDOGB 10Y',maturity:'10Y',yield:6.75,prev:6.72}] },
    { key:'ch', country:'Suiza', flag:'🇨🇭', bonds:[{label:'Confederación 10Y',maturity:'10Y',yield:0.65,prev:0.63}] },
    { key:'nz', country:'Nueva Zelanda', flag:'🇳🇿', bonds:[{label:'NZGB 10Y',maturity:'10Y',yield:4.55,prev:4.52}] },
    { key:'pl', country:'Polonia', flag:'🇵🇱', bonds:[{label:'PGB 10Y',maturity:'10Y',yield:5.55,prev:5.52}] }
];

function enrichGlobalBondData(data) {
    const merged = (Array.isArray(data) ? data : []).map(entry => ({ ...entry, bonds:(entry.bonds || []).map(bond => ({ ...bond })) }));
    GLOBAL_SOVEREIGN_REFERENCES.forEach(reference => {
        let entry = merged.find(item => item.key === reference.key);
        if (!entry) {
            entry = { key:reference.key, country:reference.country, flag:reference.flag, source:'Referencia soberana indicativa', bonds:[] };
            merged.push(entry);
        }
        reference.bonds.forEach(bond => {
            if (!entry.bonds.some(item => item.maturity === bond.maturity)) entry.bonds.push({ ...bond, indicative:true });
        });
    });
    return merged;
}

var _globalBondData = [];
var _globalBondMaturity = '10Y';
var _globalBondRegion = 'all';

var GLOBAL_BOND_REGIONS = {
    us:'americas', mx:'americas', ca:'americas', br:'americas', cl:'americas',
    eu:'europe', de:'europe', fr:'europe', it:'europe', es:'europe', gb:'europe', ch:'europe', pl:'europe',
    jp:'asia', cn:'asia', au:'asia', kr:'asia', in:'asia', id:'asia', nz:'asia', za:'emerging'
};
var GLOBAL_BOND_EMERGING = new Set(['mx','br','cn','in','za','cl','id','pl']);



function setGlobalBondRegion(region, button) {
    _globalBondRegion = region;
    document.querySelectorAll('.sovereign-region-filter button').forEach(item => item.classList.toggle('active', item.dataset.region === region));
    renderGlobalBondBoard(_globalBondData);
}

/* ── Ficha por país ──────────────────────────────────────────────────────────
   Expone los valores crudos del mercado seleccionado. No calcula nada nuevo:
   lee exactamente los mismos bonos que alimentan la tabla y la curva. */
var _cfCountry = 'mx';

function setCountryFactsheet(key) {
    _cfCountry = key;
    renderCountryFactsheet(_globalBondData);
}

function renderCountryFactsheet(data) {
    const select = document.getElementById('cf-country');
    const hero = document.getElementById('cf-hero');
    const position = document.getElementById('cf-position');
    const neighbors = document.getElementById('cf-neighbors');
    const host = document.getElementById('cf-instruments');
    const context = document.getElementById('cf-context');
    if (!select || !host || !hero || !position || !neighbors || !context) return;

    const list = (Array.isArray(data) ? data : []).filter(entry => (entry.bonds || []).some(bond => bond.yield != null));
    if (!list.length) return;

    // El <select> sólo se reconstruye si cambió el conjunto de países: si no,
    // cada refresco de datos borraría la selección del usuario.
    const signature = list.map(entry => entry.key).join(',');
    if (select.dataset.signature !== signature) {
        select.dataset.signature = signature;
        select.innerHTML = [...list]
            .sort((a, b) => String(a.country).localeCompare(String(b.country), 'es'))
            // Sin bandera: Windows no renderiza los indicadores regionales como
            // bandera y salen dos letras minúsculas que parecen una errata.
            .map(entry => `<option value="${entry.key}">${entry.country}</option>`)
            .join('');
    }
    if (!list.some(entry => entry.key === _cfCountry)) _cfCountry = list[0].key;
    select.value = _cfCountry;

    const entry = list.find(item => item.key === _cfCountry);
    const bonds = (entry.bonds || []).filter(bond => bond.yield != null);

    // El distintivo va por instrumento, no por país: EE. UU. trae cuatro tramos
    // en vivo más 1Y/2Y de referencia, y México TIIE en vivo más Mbono estático.
    // Marcar el país entero por `some(indicative)` etiquetaba de referencia a
    // datos que sí son en vivo.
    const refCount = bonds.filter(bond => bond.indicative).length;
    const badge = refCount === 0 ? { cls:'is-live', txt:'Todo en vivo' }
        : refCount === bonds.length ? { cls:'is-ref', txt:'Todo referencia' }
        : { cls:'is-mixed', txt:`${bonds.length - refCount} en vivo · ${refCount} referencia` };

    // Universo comparable: se calcula antes que nada porque el número principal,
    // la barra de posición y los vecinos del ranking dependen de él.
    const excludedRates = /TIIE|Tasa objetivo|Tasa base|LPR|SELIC/i;
    const universe = list.map(item => {
        const bond = (item.bonds || []).find(b => b.maturity === _globalBondMaturity && !excludedRates.test(b.label || ''));
        return bond?.yield == null ? null : { key:item.key, country:item.country, flag:item.flag || '🌐', yield:Number(bond.yield) };
    }).filter(Boolean).sort((a, b) => b.yield - a.yield);

    const regionNames = { americas:'Américas', europe:'Europa', asia:'Asia–Pacífico', emerging:'Emergentes' };
    const regionKey = GLOBAL_BOND_REGIONS[_cfCountry] || 'emerging';
    const rank = universe.findIndex(item => item.key === _cfCountry);
    const sortedValues = universe.map(item => item.yield).sort((a, b) => a - b);
    const mid = Math.floor(sortedValues.length / 2);
    const median = sortedValues.length ? (sortedValues.length % 2 ? sortedValues[mid] : (sortedValues[mid - 1] + sortedValues[mid]) / 2) : null;
    const axisMax = sortedValues.length ? sortedValues[sortedValues.length - 1] : null;

    // Número principal del bloque: el instrumento comparable del país (10Y) o,
    // si no cotiza a ese plazo, su primer instrumento disponible.
    const heroBond = bonds.find(bond => bond.maturity === _globalBondMaturity && !excludedRates.test(bond.label || '')) || bonds[0];
    const heroMove = heroBond?.prev == null ? null : (Number(heroBond.yield) - Number(heroBond.prev)) * 100;
    const heroCls = heroMove == null ? 'flat' : heroMove > 0.5 ? 'up' : heroMove < -0.5 ? 'down' : 'flat';
    const heroTone = rank === -1 || median == null ? 'mid'
        : (Number(heroBond.yield) - median) > 1.5 ? 'high'
        : (Number(heroBond.yield) - median) < -1 ? 'low' : 'mid';

    hero.className = 'cf-hero tone-' + heroTone;
    hero.innerHTML = `
        <div class="cf-hero-id">
            <span class="cf-flag">${entry.flag || '🌐'}</span>
            <div class="cf-identity-txt">
                <strong>${entry.country}</strong>
                <small>${entry.source || 'Fuente no declarada'}</small>
            </div>
        </div>
        <div class="cf-hero-figure">
            <span class="cf-hero-value">${heroBond ? Number(heroBond.yield).toFixed(2) + '%' : '—'}</span>
            <span class="cf-hero-delta ${heroCls}">${heroMove == null ? 'Sin cierre previo' : `${heroMove > 0 ? '▲ +' : heroMove < 0 ? '▼ ' : '• '}${Math.abs(heroMove).toFixed(0)} pb sesión`}</span>
        </div>
        <div class="cf-hero-meta">
            <div><span>Cierre previo</span><b>${heroBond?.prev == null ? '—' : Number(heroBond.prev).toFixed(2) + '%'}</b></div>
            <div><span>Región</span><b>${regionNames[regionKey]}</b></div>
            <div><span>Plazo</span><b>${heroBond?.maturity || '—'}</b></div>
        </div>
        <div class="cf-hero-foot">
            <span class="cf-hero-inst">${heroBond ? heroBond.label : '—'}</span>
            <em class="${badge.cls}">${badge.txt}</em>
        </div>`;

    // Barra de posición: mismo eje y misma paleta divergente que la Mesa, para
    // que el usuario reconozca la escala sin tener que releerla.
    if (rank === -1 || axisMax == null) {
        position.innerHTML = `<div class="cf-pos-empty"><i class="fas fa-circle-info"></i><span>Este mercado no cotiza bono soberano a 10 años en el panel, así que no entra en la comparación global.</span></div>`;
    } else {
        const pct = value => Math.max(0.8, Math.min(100, (value / axisMax) * 100));
        const spread = universe[rank].yield - median;
        position.innerHTML = `
            <div class="cf-pos-head"><span>Posición en el universo global</span><b>#${rank + 1} de ${universe.length}</b></div>
            <div class="cf-pos-track tone-${heroTone}" style="--cf-median:${pct(median).toFixed(2)}%">
                <i style="width:${pct(universe[rank].yield).toFixed(2)}%"></i>
            </div>
            <div class="cf-pos-scale"><small>0%</small><small>mediana ${median.toFixed(2)}%</small><small>${axisMax.toFixed(2)}%</small></div>
            <p class="cf-pos-copy">Paga <strong>${spread >= 0 ? '+' : ''}${spread.toFixed(2)} pp</strong> frente a la mediana global y más que <strong>${universe.length - rank - 1}</strong> de los ${universe.length - 1} mercados restantes.</p>`;
    }

    // Vecinos inmediatos del ranking: da escala sin obligar a volver a la tabla.
    if (rank === -1) {
        neighbors.innerHTML = '';
        neighbors.hidden = true;
    } else {
        neighbors.hidden = false;
        const slice = universe.slice(Math.max(0, rank - 1), Math.min(universe.length, rank + 2));
        neighbors.innerHTML = `
            <div class="cf-nb-head">Vecinos en el ranking</div>
            ${slice.map(item => {
                const itemRank = universe.indexOf(item);
                const current = item.key === _cfCountry;
                return `<div class="cf-nb${current ? ' is-current' : ''}">
                    <span>#${itemRank + 1}</span>
                    <b>${item.country}</b>
                    <em>${item.yield.toFixed(2)}%</em>
                </div>`;
            }).join('')}`;
    }

    const countEl = document.getElementById('cf-inst-count');
    if (countEl) countEl.textContent = `${bonds.length} ${bonds.length === 1 ? 'instrumento' : 'instrumentos'}`;

    host.innerHTML = bonds.map(bond => {
        const move = bond.prev == null ? null : (Number(bond.yield) - Number(bond.prev)) * 100;
        const cls = move == null ? 'flat' : move > 0.5 ? 'up' : move < -0.5 ? 'down' : 'flat';
        return `<div class="cf-row">
            <span class="cf-inst">${bond.label}${bond.indicative ? '<b class="cf-ref" title="Valor de referencia fijo: no proviene de una fuente en vivo">ref.</b>' : ''}</span>
            <span class="cf-mat">${bond.maturity || '—'}</span>
            <span class="cf-yld">${Number(bond.yield).toFixed(2)}%</span>
            <span class="cf-prev">${bond.prev == null ? '—' : Number(bond.prev).toFixed(2) + '%'}</span>
            <span class="cf-chg ${cls}">${move == null ? '—' : `${move > 0 ? '+' : ''}${move.toFixed(0)} pb`}</span>
        </div>`;
    }).join('');

    // Contexto: se compara contra su propia región, no sólo contra la mediana
    // global, que es la lectura que faltaba.
    //colometria menor a los colores tna bribnates que se tienen en el//apartadp
    const peers = universe.filter(item => (GLOBAL_BOND_REGIONS[item.key] || 'emerging') === regionKey);
    const liveCount = bonds.length - refCount;

    const tiles = [];
    if (rank !== -1 && peers.length > 1) {
        const peerValues = peers.map(item => item.yield).sort((a, b) => a - b);
        const peerMid = Math.floor(peerValues.length / 2);
        const peerMedian = peerValues.length % 2 ? peerValues[peerMid] : (peerValues[peerMid - 1] + peerValues[peerMid]) / 2;
        const peerDelta = universe[rank].yield - peerMedian;
        tiles.push(`<div><span>Frente a su región</span><strong>${peerDelta >= 0 ? '+' : ''}${peerDelta.toFixed(2)} pp</strong><small>${regionNames[regionKey]} · mediana ${peerMedian.toFixed(2)}%</small></div>`);
    }
    if (axisMax != null) {
        tiles.push(`<div><span>Rango del panel</span><strong>${sortedValues[0].toFixed(2)}–${axisMax.toFixed(2)}%</strong><small>${universe.length} mercados a 10 años</small></div>`);
    }
    tiles.push(`<div><span>Trazabilidad</span><strong>${liveCount} de ${bonds.length}</strong><small>${liveCount === bonds.length ? 'Todos con fuente en vivo' : 'Instrumentos con fuente en vivo'}</small></div>`);
    if (rank === -1) {
        tiles.push(`<div class="cf-note"><i class="fas fa-circle-info"></i><span>Este mercado no cotiza bono soberano a 10 años dentro del panel: se sigue por su tasa de referencia, por eso no entra en el ranking global.</span></div>`);
    }
    context.innerHTML = tiles.join('');
}

function renderGlobalBondBoard(data) {
    const board = document.getElementById('bonds-global');
    if (!board) return;
    const excluded = /TIIE|Tasa objetivo|Tasa base|LPR|SELIC/i;
    const points = (Array.isArray(data) ? data : []).map(entry => {
        const bond = entry.bonds?.find(item => item.maturity === _globalBondMaturity && !excluded.test(item.label || ''));
        if (!bond || bond.yield == null) return null;
        return {
            key:entry.key, country:entry.country, flag:entry.flag || '🌐', bond,
            yield:Number(bond.yield), prev:bond.prev == null ? null : Number(bond.prev),
            indicative:!!bond.indicative, region:GLOBAL_BOND_REGIONS[entry.key] || 'emerging'
        };
    }).filter(Boolean).sort((a,b) => b.yield - a.yield);

    if (!points.length) {
        board.innerHTML = '<div class="sovereign-board-empty"><i class="far fa-calendar-xmark"></i><strong>Sin datos para este plazo</strong><span>Selecciona otro vencimiento para ampliar la cobertura.</span></div>';
        return;
    }
    const values = points.map(point => point.yield).sort((a,b) => a-b);
    const middle = Math.floor(values.length / 2);
    const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    const average = values.reduce((sum,value) => sum + value,0) / values.length;
    const min = values[0];
    const max = values[values.length - 1];
    const filtered = points.filter(point => _globalBondRegion === 'all' || (_globalBondRegion === 'emerging' ? GLOBAL_BOND_EMERGING.has(point.key) : point.region === _globalBondRegion));
    const maturityLabel = _globalBondMaturity === '1Y' ? '1 año' : _globalBondMaturity.replace('Y',' años');
    const setBoard = (id,value) => { const el=document.getElementById(id); if(el) el.textContent=value; };
    setBoard('debt-board-coverage', `${points.length} ${points.length === 1 ? 'país' : 'países'}`);
    setBoard('debt-board-maturity', `Bonos soberanos · ${maturityLabel}`);
    setBoard('debt-board-average', average.toFixed(2) + '%');
    setBoard('debt-board-median', median.toFixed(2) + '%');
    setBoard('debt-board-dispersion', (max - min).toFixed(2) + ' pp');
    setBoard('debt-board-status', `${filtered.length} de ${points.length} ${points.length === 1 ? 'mercado' : 'mercados'}`);

    const highest = points[0];
    const lowest = points[points.length - 1];
    const movers = points
        .filter(point => point.prev != null)
        .map(point => ({ ...point, move:(point.yield - point.prev) * 100 }))
        .sort((a,b) => Math.abs(b.move) - Math.abs(a.move));
    const biggestMover = movers[0];
    setBoard('sov-high-country', highest?.country || '—');
    setBoard('sov-high-value', highest ? `${highest.yield.toFixed(2)}% · ${highest.bond.label}` : 'Sin dato');
    setBoard('sov-low-country', lowest?.country || '—');
    setBoard('sov-low-value', lowest ? `${lowest.yield.toFixed(2)}% · ${lowest.bond.label}` : 'Sin dato');
    setBoard('sov-move-country', biggestMover?.country || '—');
    setBoard('sov-move-value', biggestMover ? `${biggestMover.move > 0 ? '+' : ''}${biggestMover.move.toFixed(0)} pb en la sesión` : 'Sin cambio disponible');

    const regionLabels = { all:'Global', americas:'Américas', europe:'Europa', asia:'Asia–Pacífico', emerging:'Emergente' };

    // Eje común para todas las filas: la longitud de cada barra sólo es comparable
    // si todas se miden contra la misma escala y arrancan de cero. El diseño
    // anterior normalizaba min–max por tarjeta, lo que exageraba las diferencias.
    const axisMax = Math.max(max, 0.01);
    const pct = value => Math.max(0.8, Math.min(100, (value / axisMax) * 100));
    board.style.setProperty('--sov-median', pct(median).toFixed(2) + '%');
    const axisNote = document.getElementById('sov-axis-note');
    if (axisNote) axisNote.textContent = `— eje 0 % a ${axisMax.toFixed(2)} % · línea = mediana ${median.toFixed(2)} %`;

    // Desagregación por región sobre el universo completo (points), no sobre el
    // filtrado: la comparación entre bloques debe ser estable al cambiar filtro. ju8mmping on me caliente
    const regionsHost = document.getElementById('sov-regions');
    if (regionsHost) {
        const groups = [
            { id:'americas', name:'Américas' },
            { id:'europe',   name:'Europa' },
            { id:'asia',     name:'Asia–Pacífico' },
            { id:'emerging', name:'Emergentes' },
        ].map(group => {
            const members = points.filter(point => group.id === 'emerging'
                ? GLOBAL_BOND_EMERGING.has(point.key)
                : point.region === group.id);
            if (!members.length) return { ...group, n:0 };
            const sorted = members.map(item => item.yield).sort((a,b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
            return { ...group, n:members.length, median:med, min:sorted[0], max:sorted[sorted.length - 1] };
        }).filter(group => group.n > 0);

        regionsHost.innerHTML = groups.map(group => {
            const delta = group.median - median;
            const tone = delta > 1.5 ? 'high' : delta < -1 ? 'low' : 'mid';
            return `<div class="sov-region tone-${tone}">
                <span class="sov-region-name">${group.name}</span>
                <strong>${group.median.toFixed(2)}%</strong>
                <small>${group.n} ${group.n === 1 ? 'mercado' : 'mercados'} · rango ${group.min.toFixed(2)}–${group.max.toFixed(2)}%</small>
                <em>${delta >= 0 ? '+' : ''}${delta.toFixed(2)} pp vs mediana global</em>
            </div>`;
        }).join('');
    }

    board.classList.add('sov-matrix');
    const yieldRange = Math.max(max - min, .01);
    const maxMoveAbs = Math.max(...movers.map(point => Math.abs(point.move)), 1);
    board.innerHTML = filtered.map(point => {
        const change = point.prev == null ? null : (point.yield - point.prev) * 100;
        const spread = point.yield - median;
        const tone = spread > 1.5 ? 'high' : spread < -1 ? 'low' : 'mid';
        const changeClass = change == null ? 'flat' : change > .5 ? 'up' : change < -.5 ? 'down' : 'flat';
        const changeText = change == null ? '—' : `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change).toFixed(0)} pb`;
        const tierLabel = tone === 'high' ? 'Prima alta' : tone === 'low' ? 'Prima baja' : 'Zona media';
        const safeLabel = String(point.bond.label).replace(/'/g, "\\'");
        const yieldIntensity = .16 + ((point.yield - min) / yieldRange) * .24;
        const yieldColor = tone === 'high' ? `rgba(177,75,89,${yieldIntensity.toFixed(2)})` : tone === 'low' ? `rgba(63,119,157,${yieldIntensity.toFixed(2)})` : 'rgba(124,139,150,.16)';
        const moveIntensity = change == null ? .08 : .14 + Math.min(1, Math.abs(change) / maxMoveAbs) * .3;
        const moveColor = change == null ? 'rgba(124,139,150,.08)' : change > 0 ? `rgba(177,75,89,${moveIntensity.toFixed(2)})` : change < 0 ? `rgba(48,137,108,${moveIntensity.toFixed(2)})` : 'rgba(124,139,150,.12)';
        const spreadIntensity = .14 + Math.min(1, Math.abs(spread) / Math.max(max - median, median - min, .01)) * .28;
        const spreadColor = spread > 0 ? `rgba(177,75,89,${spreadIntensity.toFixed(2)})` : spread < 0 ? `rgba(63,119,157,${spreadIntensity.toFixed(2)})` : 'rgba(124,139,150,.12)';
        const globalRank = points.findIndex(item => item.key === point.key) + 1;
        return `<article class="sov-matrix-row tone-${tone}" role="button" tabindex="0" aria-label="${point.country}, rendimiento ${point.yield.toFixed(2)} por ciento" onclick="openBondDetail('${point.key}','${safeLabel}')" onkeydown="reportCardKey(event,()=>openBondDetail('${point.key}','${safeLabel}'))">
            <span class="sov-mx-country"><i>${point.flag}</i><span><strong>${point.country}</strong><small>${regionLabels[point.region] || 'Global'} · ${point.bond.label}</small></span></span>
            <span class="sov-mx-cell" style="--sov-cell:${yieldColor}"><strong>${point.yield.toFixed(2)}%</strong><small>${tierLabel}</small></span>
            <span class="sov-mx-cell is-neutral"><strong>${point.prev == null ? '—' : point.prev.toFixed(2) + '%'}</strong><small>Referencia anterior</small></span>
            <span class="sov-mx-cell is-${changeClass}" style="--sov-cell:${moveColor}"><strong>${changeText}</strong><small>${change == null ? 'Sin comparación' : change > 0 ? 'Rendimiento sube' : change < 0 ? 'Rendimiento baja' : 'Sin cambio'}</small></span>
            <span class="sov-mx-cell" style="--sov-cell:${spreadColor}"><strong>${spread >= 0 ? '+' : ''}${spread.toFixed(2)} pp</strong><small>${tierLabel}</small></span>
            <span class="sov-mx-rank"><strong>#${globalRank}</strong><small>de ${points.length}</small></span>
        </article>`;
    }).join('') || '<div class="sovereign-board-empty"><i class="fas fa-filter-circle-xmark"></i><strong>Sin países en este filtro</strong><span>Selecciona otra región para continuar.</span></div>';
}

function _renderBondsData(data, isRef) {
    data = enrichGlobalBondData(data);
    _globalBondData = data;
    _bondData = data;
    window.__VN_BOND_DATA = data;
    window.__VN_BOND_DATA_META = { isReferenceFallback: !!isRef };
    window.dispatchEvent(new CustomEvent('vn:bond-data', { detail: { data, isReferenceFallback: !!isRef } }));
    const usEntry     = data.find(d => d.key === 'us');
    const usEl        = document.getElementById('bonds-us');
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
    renderBondsCurveChart(data, isRef);
    // La Mesa internacional se renderizaba desde dentro de renderBondsCurveChart,
    // que sale temprano si no encuentra su canvas. Al retirar el comparativo
    // internacional ese canvas ya no existe, así que el tablero se llama aquí.
    renderGlobalBondBoard(data);
    renderCountryFactsheet(data);
    updateDebtDashboard(data, isRef);
}

function updateDebtDashboard(data, isRef) {
    const us = data.find(d => d.key === 'us');
    const mx = data.find(d => d.key === 'mx');
    const findUs = maturity => us?.bonds?.find(b => b.maturity === maturity || b.label === maturity);
    const us3m = findUs('3M');
    const us5 = findUs('5Y');
    const us10 = findUs('10Y');
    const us30 = findUs('30Y');
    const tiie = mx?.bonds?.[0];
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    const rate = value => value == null ? '—' : Number(value).toFixed(2) + '%';
    const spreadText = value => value == null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)} pp`;
    const change = bond => {
        if (isRef || bond?.yield == null || bond?.prev == null) return isRef ? 'Dato de referencia' : 'Cambio pendiente';
        const diff = bond.yield - bond.prev;
        return `${diff > 0 ? '▲ +' : diff < 0 ? '▼ ' : ''}${Math.abs(diff).toFixed(2)} pp sesión`;
    };
    const setSignal = (id, value, tone = '') => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = value;
        el.className = tone;
    };

    // `state` es privado del IIFE de finanzas-favro.js: aquí no existe y lanzaba
    // "state is not defined", abortando updateDebtDashboard en esta misma línea.
    // Todo lo que va debajo se quedaba en "—". Se usa findUs, como el resto.
    // La tarjeta era "US Treasury 2Y", pero /api solo entrega 3M, 5Y, 10Y y 30Y
    // para EE.UU.: findUs('2Y') devolvía undefined y la tarjeta quedaba en "—"
    // en cuanto llegaban los datos en vivo. Se usa el 5Y, que sí tiene fuente.

    // Estos cuatro NO vienen de ninguna API: son constantes escritas a mano.
    // Se muestran con el distintivo "est." en la tarjeta para no presentarlos
    // como lectura de mercado. Ver nota en el reporte al usuario.
    const usig = { yield: 5.65, prev: 5.68 };
    const ushy = { yield: 7.85, prev: 7.90 };
    const ustips = { yield: 2.15, prev: 2.18 };
    const usbk = { yield: 2.35, prev: 2.34 };

    set('debt-kpi-us3m', rate(us3m?.yield)); set('debt-kpi-us3m-chg', change(us3m));
    set('debt-kpi-us5', rate(us5?.yield)); set('debt-kpi-us5-chg', change(us5));
    set('debt-kpi-us10', rate(us10?.yield)); set('debt-kpi-us10-chg', change(us10));
    set('debt-kpi-us30', rate(us30?.yield)); set('debt-kpi-us30-chg', change(us30));
    
    set('debt-kpi-ig', rate(usig?.yield)); set('debt-kpi-ig-chg', change(usig));
    set('debt-kpi-hy', rate(ushy?.yield)); set('debt-kpi-hy-chg', change(ushy));
    set('debt-kpi-tips', rate(ustips?.yield)); set('debt-kpi-tips-chg', change(ustips));
    set('debt-kpi-bk', rate(usbk?.yield)); set('debt-kpi-bk-chg', change(usbk));
    
    set('debt-kpi-tiie', rate(tiie?.yield)); set('debt-kpi-tiie-chg', change(tiie));


    const curve = us30?.yield != null && us5?.yield != null ? us30.yield - us5.yield : null;
    const front = us5?.yield != null && us3m?.yield != null ? us5.yield - us3m.yield : null;
    const longPremium = us30?.yield != null && us10?.yield != null ? us30.yield - us10.yield : null;
    const curveText = spreadText(curve);

    set('debt-kpi-curve', curveText);
    set('debt-kpi-curve-state', curve == null ? 'Estructura pendiente' : curve >= 0 ? 'Curva positiva' : 'Curva invertida');
    const carry = tiie?.yield != null && us10?.yield != null ? tiie.yield - us10.yield : null;
    set('debt-kpi-carry', spreadText(carry));
    set('debt-kpi-carry-state', carry == null ? 'Diferencial pendiente' : carry >= 2 ? 'Prima elevada en MXN' : 'Prima moderada');

    set('debt-ctx-3m', rate(us3m?.yield));
    set('debt-ctx-10y', rate(us10?.yield));
    set('debt-ctx-30y', rate(us30?.yield));
    set('debt-ctx-tiie', rate(tiie?.yield));
    set('debt-ctx-carry', spreadText(carry));
    set('debt-snapshot-front', front == null ? 'Pendiente' : spreadText(front));
    set('debt-snapshot-long', longPremium == null ? 'Pendiente' : spreadText(longPremium));
    set('debt-snapshot-mx', carry == null ? 'Pendiente' : spreadText(carry));
    set('debt-snapshot-front-note', front == null ? 'Política monetaria' : front < 0 ? 'Restricción en corto' : 'Normalización gradual');
    set('debt-snapshot-long-note', longPremium == null ? 'Riesgo de duración' : longPremium > .2 ? 'Prima exigente' : 'Prima contenida');
    set('debt-snapshot-mx-note', carry == null ? 'Carry relativo' : carry >= 2 ? 'Diferencial atractivo' : 'Prima moderada');

    // Los indicadores de CETES y TIIE se escriben desde finanzas-favro.js: los
    // datos de /api/mx-rates viven en el estado de ese módulo, no aquí.

    // Bund alemán y su diferencial contra el Treasury. El dato lo publica la tabla
    // de diferenciales en window.__vnBundYield, que puede llegar antes o después
    // que este panel; por eso allí también se escriben ambas tarjetas.
    // isNumeric() vive dentro del IIFE de finanzas-favro.js y no llega hasta aquí:
    // usarla lanzaba un ReferenceError que abortaba el resto de loadBonds().
    const bund = window.__vnBundYield;
    if (Number.isFinite(bund)) {
        set('debt-kpi-bund', rate(bund));
        const usBund = us10?.yield != null ? +us10.yield - +bund : null;
        set('debt-kpi-usbund', spreadText(usBund));
        set('debt-kpi-usbund-chg', usBund == null ? 'Prima transatlántica'
            : usBund > 0 ? 'EE.UU. paga más que Alemania' : 'Alemania paga más que EE.UU.');
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
        updateGeneralKPIs();
        const upd = document.getElementById('bonds-upd');
        if (upd) upd.textContent = 'Act. ' + new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        clearTimeout(tmr);
        console.error('loadBonds error:', e.message);
        _bondData = _BOND_FB;
        _renderBondsData(_BOND_FB, true);
        updateGeneralKPIs();
        const upd = document.getElementById('bonds-upd');
        if (upd) upd.textContent = 'Referencia · en vivo no disponible';
        if (loading) { loading.style.display = 'block'; loading.textContent = '⚠ Usando tasas de referencia · datos en vivo no disponibles'; }
    }
}

/* ── Línea del tiempo de tasas y bonos ─────────────────────────────────────────
   21 mercados con serie histórica real y cuatro fuentes:
     · EE.UU.      índices ^IRX/^FVX/^TNX/^TYX vía Yahoo (curva completa)
     · 18 europeos BCE, tasa de convergencia de Maastricht: rendimiento del bono
                   soberano a 10 años, mensual y homogénea entre países
     · Japón       OCDE, bono soberano a 10 años mensual
     · China       ChinaBond / CCDC, curva soberana oficial diaria a 10 años
   Ningún mercado aparece aquí sin serie publicada: no se interpola ni se rellena. */
(function () {
    /* Genera la ficha de un país europeo servido por el BCE. */
    const bce = (area, label) => ({
        label, kind: 'ecb', area,
        source: `BCE · rendimiento del bono a 10 años (${label})`,
        series: [{ id: area, label: 'Bono soberano 10 años' }],
    });

    const CFG = {
        us: {
            label: 'Estados Unidos',
            kind: 'yahoo',
            source: 'US Treasury · índices vía Yahoo Finance',
            series: [
                { id: '^IRX', label: 'Treasury 3 meses' },
                { id: '^FVX', label: 'Treasury 5 años' },
                { id: '^TNX', label: 'Treasury 10 años' },
                { id: '^TYX', label: 'Treasury 30 años' },
            ],
        },
        cn: {
            label: 'China', kind: 'chinabond', source: 'ChinaBond · CCDC · China',
            series: [{ id: 'CGB10Y', label: 'Bono soberano 10 años' }],
        },
        jp: {
            label: 'Japón', kind: 'oecd', maxYears: 5, source: 'OCDE · Financial Markets · Japón',
            series: [{ id: 'IRLTLT01JPM156N', label: 'Bono soberano 10 años' }],
        },
        de: bce('DE', 'Alemania'),
        fr: bce('FR', 'Francia'),
        it: bce('IT', 'Italia'),
        es: bce('ES', 'España'),
        nl: bce('NL', 'Países Bajos'),
        be: bce('BE', 'Bélgica'),
        at: bce('AT', 'Austria'),
        pt: bce('PT', 'Portugal'),
        ie: bce('IE', 'Irlanda'),
        gr: bce('GR', 'Grecia'),
        fi: bce('FI', 'Finlandia'),
        bg: bce('BG', 'Bulgaria'),
        hr: bce('HR', 'Croacia'),
        sk: bce('SK', 'Eslovaquia'),
        si: bce('SI', 'Eslovenia'),
        lt: bce('LT', 'Lituania'),
        lv: bce('LV', 'Letonia'),
        ee: bce('EE', 'Estonia'),
    };

    /* Agrupación para los desplegables. */
    const REGIONES = [
        { label: 'América', paises: ['us'] },
        { label: 'Asia', paises: ['cn', 'jp'] },
        { label: 'Europa',  paises: ['de', 'fr', 'it', 'es', 'nl', 'be', 'at', 'pt', 'ie', 'gr', 'fi', 'bg', 'hr', 'sk', 'si', 'lt', 'lv', 'ee'] },
    ];

    let chart = null;
    let years = 5;
    let reqId = 0;
    const MAX_COUNTRIES = 5;
    let comparisons = [];

    /* La gráfica vive dentro de este IIFE, por lo que el desmontaje general no
       podía verla. Se registra aquí para liberar el canvas al salir de Bonos o
       al volver a ejecutar el script durante la navegación de la SPA. */
    _vnFinLimpieza.push(function () {
        reqId++;
        if (chart) { try { chart.destroy(); } catch (e) { /* ya destruida */ } }
        chart = null;
    });

    const $$ = id => document.getElementById(id);
    /* Nombre con el que se anuncia una serie en leyendas, subtítulo y desplegables.
       Los europeos publican un solo plazo, así que el país ya la identifica; en
       EE.UU. hace falta el plazo para distinguir los vencimientos Treasury. */
    const etiquetaSerie = (code, serieId) => {
        const cfg = CFG[code];
        if (!cfg) return serieId;
        if (cfg.series.length < 2) return cfg.label;
        const s = cfg.series.find(x => x.id === serieId);
        return `${cfg.label} · ${s ? s.label : serieId}`;
    };
    const fmtPct = v => (v == null || !isFinite(v)) ? '—' : (+v).toFixed(2) + '%';
    const fmtDate = d => d instanceof Date && !isNaN(d)
        ? d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    /* Se alterna por clase, no por style.display: la regla de la hoja lleva
       !important y ganaba al display en línea, dejando el velo blanco sobre el
       gráfico y haciendo que la serie se viera descolorida. */
    function setState(msg) {
        const el = $$('rtl-state');
        if (!el) return;
        el.textContent = msg || '';
        el.classList.toggle('is-off', !msg);
        $$('rate-timeline')?.setAttribute('aria-busy', msg?.startsWith('Cargando') ? 'true' : 'false');
    }

    function clearTimelineReading(countryLabel) {
        ['rtl-last','rtl-max','rtl-min','rtl-chg','rtl-spread','rtl-slope'].forEach(id => {
            const el = $$(id);
            if (el) { el.textContent = '—'; el.className = ''; }
        });
        ['rtl-last-date','rtl-max-date','rtl-min-date'].forEach(id => {
            const el = $$(id);
            if (el) el.textContent = 'Actualizando';
        });
        const slopeLabel = $$('rtl-slope-label');
        if (slopeLabel) slopeLabel.textContent = `Pendiente · ${countryLabel || 'serie principal'}`;
        const slopeNote = $$('rtl-slope-note');
        if (slopeNote) slopeNote.textContent = 'Calculando con el periodo seleccionado';
        const spreadNote = $$('rtl-spread-note');
        if (spreadNote) spreadNote.textContent = 'Actualizando comparación';
        const count = $$('rtl-count');
        if (count) count.textContent = 'Actualizando observaciones…';
    }

    async function fetchTimelineJson(url) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 18000);
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            if (error?.name === 'AbortError') throw new Error('La fuente tardó demasiado en responder');
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    /* Mercados con histórico verificable, agrupados por región. */
    function fillCountrySelect() {
        const sel = $$('rtl-country');
        if (!sel) return;
        const frag = document.createDocumentFragment();
        REGIONES.forEach(r => {
            const g = document.createElement('optgroup');
            g.label = r.label;
            r.paises.forEach(code => g.appendChild(new Option(CFG[code].label, code)));
            frag.appendChild(g);
        });
        sel.replaceChildren(frag);
        sel.value = 'us';
    }

    function fillSeriesSelect() {
        const country = $$('rtl-country').value;
        const cfg = CFG[country];
        const sel = $$('rtl-series');
        sel.replaceChildren(...cfg.series.map(s => new Option(s.label, s.id)));
        sel.value = country === 'us' ? '^TNX' : cfg.series[0].id;
        // Con un solo plazo publicado el selector no aporta nada.
        sel.closest('.rtl-field').hidden = cfg.series.length < 2;
        const maxYears = cfg.maxYears || 10;
        if (years > maxYears) years = maxYears;
        $$('rtl-periods')?.querySelectorAll('button[data-years]').forEach(button => {
            const value = Number(button.dataset.years);
            button.disabled = value > maxYears;
            button.title = button.disabled ? `La fuente de ${cfg.label} ofrece hasta ${maxYears} años` : '';
            button.classList.toggle('is-active', value === years);
        });
        syncComparisonControls();
    }

    /* Comparación inicial por región: Treasury frente a China, los asiáticos
       frente a un vecino y la zona euro frente al Bund alemán. */
    function sugerirComparacion(country) {
        const kind = CFG[country]?.kind;
        if (kind === 'yahoo') return 'cn:CGB10Y';
        if (kind === 'chinabond') return 'us:^TNX';
        if (kind === 'oecd') return 'cn:CGB10Y';
        return country === 'de' ? 'it:IT' : 'de:DE';
    }

    /* El país principal cuenta como el primero. El usuario puede sumar cuatro
       referencias más, para un máximo de cinco países visibles a la vez. */
    function syncComparisonControls() {
        const sel = $$('rtl-compare-picker');
        if (!sel) return;
        const mainCountry = $$('rtl-country').value;
        const mainSerie = $$('rtl-series').value;
        const usedCountries = new Set([mainCountry]);
        comparisons = [...new Set(comparisons)].filter(key => {
            const code = key.split(':')[0];
            if (!CFG[code] || usedCountries.has(code)) return false;
            usedCountries.add(code);
            return true;
        }).slice(0, MAX_COUNTRIES - 1);

        const frag = document.createDocumentFragment();
        frag.appendChild(new Option(comparisons.length >= MAX_COUNTRIES - 1 ? 'Límite de 5 países alcanzado' : 'Selecciona un país…', ''));
        REGIONES.forEach(region => {
            const grupo = document.createElement('optgroup');
            grupo.label = region.label;
            region.paises.forEach(code => {
                if (usedCountries.has(code)) return;
                CFG[code].series.forEach(s => {
                    const key = `${code}:${s.id}`;
                    grupo.appendChild(new Option(etiquetaSerie(code, s.id), key));
                });
            });
            if (grupo.children.length) frag.appendChild(grupo);
        });
        sel.replaceChildren(frag);
        sel.disabled = comparisons.length >= MAX_COUNTRIES - 1;
        const add = $$('rtl-add-compare');
        if (add) add.disabled = sel.disabled || !sel.value;

        const chips = $$('rtl-comparisons');
        if (chips) {
            chips.replaceChildren(...comparisons.map(key => {
                const [code, id] = key.split(':');
                const chip = document.createElement('span');
                chip.className = 'rtl-comparison-chip';
                const label = document.createElement('b');
                label.textContent = etiquetaSerie(code, id);
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.dataset.key = key;
                remove.setAttribute('aria-label', `Quitar ${label.textContent}`);
                remove.innerHTML = '<i class="fas fa-xmark" aria-hidden="true"></i>';
                chip.append(label, remove);
                return chip;
            }));
        }
        const count = $$('rtl-compare-count');
        if (count) count.textContent = `${comparisons.length + 1} / ${MAX_COUNTRIES} países`;
    }

    function resetSuggestedComparison() {
        const suggested = sugerirComparacion($$('rtl-country').value);
        comparisons = suggested ? [suggested] : [];
        syncComparisonControls();
    }

    function addComparison() {
        const sel = $$('rtl-compare-picker');
        const key = sel?.value || '';
        if (!key || comparisons.includes(key) || comparisons.length >= MAX_COUNTRIES - 1) return;
        comparisons.push(key);
        syncComparisonControls();
        refresh();
    }

    function syncShortcutState() {
        const active = $$('rtl-country')?.value;
        document.querySelectorAll('.debt-country-card[data-bond-country]').forEach(card => {
            const selected = card.dataset.bondCountry === active;
            card.classList.toggle('is-active', selected);
            card.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
    }

    function updateShortcutYield(country, points) {
        const value = points?.length ? points[points.length - 1]?.value : null;
        const el = $$(`bond-shortcut-${country}-value`);
        if (!el || !isFinite(value)) return;
        el.textContent = fmtPct(value);
        el.closest('.debt-country-card')?.classList.add('has-value');
    }

    function selectTimelineCountry(country, seriesId, shouldScroll = true) {
        const cfg = CFG[country];
        const countrySelect = $$('rtl-country');
        if (!cfg || !countrySelect) return;
        comparisons = [];
        countrySelect.value = country;
        fillSeriesSelect();
        const seriesSelect = $$('rtl-series');
        if (seriesId && cfg.series.some(series => series.id === seriesId)) seriesSelect.value = seriesId;
        resetSuggestedComparison();
        syncShortcutState();
        refresh();
        if (shouldScroll) {
            const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
            setTimeout(() => $$('rate-timeline')?.scrollIntoView({ behavior, block: 'start' }), 40);
        }
    }

    window.selectBondTimelineCountry = selectTimelineCountry;

    /* El BCE publica mensual: la fecha llega como "AAAA-MM". */
    async function loadEcb(area) {
        const j = await fetchTimelineJson(`/api/ecb/${encodeURIComponent(area)}/history?years=${years}`);
        return (j?.points || [])
            .map(p => ({ date: new Date(p.date + '-01T00:00:00'), value: +p.value }))
            .filter(p => !isNaN(p.date) && isFinite(p.value));
    }

    async function loadFred(series) {
        const j = await fetchTimelineJson(`/api/fred/${encodeURIComponent(series)}/history?years=${years}`);
        return (j?.points || [])
            .map(p => ({ date: new Date(`${p.date}T00:00:00`), value: +p.value }))
            .filter(p => !isNaN(p.date) && isFinite(p.value));
    }

    async function loadChinaBond() {
        const j = await fetchTimelineJson(`/api/chinabond/history?years=${years}`);
        return (j?.points || [])
            .map(p => ({ date: new Date(`${p.date}T00:00:00`), value: +p.value }))
            .filter(p => !isNaN(p.date) && isFinite(p.value));
    }

    function loadSeries(country, id) {
        const kind = CFG[country]?.kind;
        if (kind === 'yahoo') return loadUs(id);
        if (kind === 'oecd') return loadFred(id);
        if (kind === 'chinabond') return loadChinaBond();
        return loadEcb(CFG[country].area);
    }

    /* Las fuentes tienen frecuencias distintas (diaria, semanal y mensual).
       Se proyecta la serie de comparación sobre las fechas de la
       principal arrastrando el último valor conocido: nunca se interpola ni se
       inventa un punto que la fuente no publicó. */
    function alinear(base, otra) {
        const orden = [...otra].sort((a, b) => a.date - b.date);
        let i = 0, ultimo = null;
        return base.map(p => {
            while (i < orden.length && orden[i].date <= p.date) { ultimo = orden[i].value; i++; }
            return ultimo;
        });
    }

    async function loadUs(ticker) {
        const range = years <= 1 ? '1y' : years <= 3 ? '3y' : years <= 5 ? '5y' : '10y';
        const interval = years <= 1 ? '1d' : '1wk';
        const j = await fetchTimelineJson(`/api/stock-history?ticker=${encodeURIComponent(ticker)}&range=${range}&interval=${interval}`);
        return (j?.candles || [])
            .map(c => ({ date: new Date(typeof c.time === 'number' ? c.time * 1000 : c.time + 'T00:00:00'), value: +c.close }))
            .filter(p => !isNaN(p.date) && isFinite(p.value));
    }

    function render(points, meta) {
        const canvas = $$('rtl-canvas');
        if (!canvas || typeof Chart === 'undefined') return;
        if (chart) { chart.destroy(); chart = null; }
        /* Cubre también una instancia huérfana dejada por una ejecución
           anterior del script (por ejemplo, tras una actualización en caliente). */
        const orphan = typeof Chart.getChart === 'function' ? Chart.getChart(canvas) : null;
        if (orphan) orphan.destroy();
        const darkTheme = document.body.classList.contains('vn-dark-finanzas');
        const chartInk = darkTheme ? '#aebdc9' : '#5b6f7e';
        const chartLine = darkTheme ? '#4c5f70' : '#e2eaef';
        const chartGrid = darkTheme ? 'rgba(172,193,209,.14)' : 'rgba(16,32,46,.06)';
        const pointRing = darkTheme ? '#1a2b3b' : '#ffffff';
        const comparisonPalette = darkTheme
            ? ['#e1ae52', '#ff7fa7', '#79a9ff', '#b694ff']
            : ['#b7791f', '#b83d68', '#376fc5', '#7651b5'];
        const comparisonDashes = [[7, 4], [3, 3], [10, 3, 2, 3], [2, 3]];
        const compared = Array.isArray(meta.comparisons) ? meta.comparisons : [];

        const values = points.map(p => p.value);
        const last = points[points.length - 1];
        const first = points[0];
        let maxP = points[0], minP = points[0];
        points.forEach(p => { if (p.value > maxP.value) maxP = p; if (p.value < minP.value) minP = p; });
        const diff = last.value - first.value;
        const sube = diff >= 0;
        const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
        const slopeX = points.map(point => (point.date - first.date) / YEAR_MS);
        const meanX = slopeX.reduce((sum, value) => sum + value, 0) / slopeX.length;
        const meanY = values.reduce((sum, value) => sum + value, 0) / values.length;
        const slopeDenominator = slopeX.reduce((sum, value) => sum + Math.pow(value - meanX, 2), 0);
        const slope = slopeDenominator > 0
            ? slopeX.reduce((sum, value, index) => sum + (value - meanX) * (values[index] - meanY), 0) / slopeDenominator
            : null;
        const slopeIntercept = Number.isFinite(slope) ? meanY - slope * meanX : null;
        const trendValues = Number.isFinite(slope)
            ? slopeX.map(value => slopeIntercept + slope * value)
            : values.map(() => null);

        $$('rtl-last').textContent = fmtPct(last.value);
        $$('rtl-last-date').textContent = fmtDate(last.date);
        $$('rtl-max').textContent = fmtPct(maxP.value);
        $$('rtl-max-date').textContent = fmtDate(maxP.date);
        $$('rtl-min').textContent = fmtPct(minP.value);
        $$('rtl-min-date').textContent = fmtDate(minP.date);
        const chg = $$('rtl-chg');
        chg.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} pp`;
        chg.className = sube ? 'is-up' : 'is-down';
        const slopeElement = $$('rtl-slope');
        const slopeLabel = $$('rtl-slope-label');
        const slopeNote = $$('rtl-slope-note');
        if (slopeLabel) slopeLabel.textContent = `Pendiente · ${meta.countryLabel || 'serie principal'}`;
        if (slopeElement) {
            slopeElement.textContent = Number.isFinite(slope) ? `${slope >= 0 ? '+' : ''}${slope.toFixed(2)} pp/año` : '—';
            slopeElement.className = !Number.isFinite(slope) || Math.abs(slope) < .02 ? '' : slope > 0 ? 'is-up' : 'is-down';
        }
        if (slopeNote) slopeNote.textContent = !Number.isFinite(slope) ? 'Serie principal · sin datos suficientes'
            : Math.abs(slope) < .02 ? 'Serie principal · tendencia estable'
            : slope > 0 ? 'Serie principal · tendencia ascendente' : 'Serie principal · tendencia descendente';
        $$('rtl-source').textContent = meta.source;
        $$('rtl-count').textContent = `${points.length} observaciones · ${compared.length + 1} países · ${fmtDate(first.date)} → ${fmtDate(last.date)}`;

        /* Diferenciales actuales contra cada referencia seleccionada. */
        const celdaSpread = $$('rtl-spread-cell');
        const leyenda = $$('rtl-legend');
        const spreadList = $$('rtl-spread-list');
        if (compared.length) {
            const primaryComparison = compared[0];
            const ultimoComp = [...primaryComparison.values].reverse().find(v => v != null);
            const spread = ultimoComp == null ? null : last.value - ultimoComp;
            const spreadPairs = primaryComparison.values.flatMap((value, index) => value == null
                ? []
                : [{ x:slopeX[index], y:values[index] - value }]);
            const spreadMeanX = spreadPairs.length ? spreadPairs.reduce((sum, point) => sum + point.x, 0) / spreadPairs.length : null;
            const spreadMeanY = spreadPairs.length ? spreadPairs.reduce((sum, point) => sum + point.y, 0) / spreadPairs.length : null;
            const spreadDenominator = spreadPairs.reduce((sum, point) => sum + Math.pow(point.x - spreadMeanX, 2), 0);
            const spreadSlope = spreadDenominator > 0
                ? spreadPairs.reduce((sum, point) => sum + (point.x - spreadMeanX) * (point.y - spreadMeanY), 0) / spreadDenominator
                : null;
            const spreadSlopeText = Number.isFinite(spreadSlope)
                ? ` · pendiente ${spreadSlope >= 0 ? '+' : ''}${spreadSlope.toFixed(2)} pp/año`
                : '';
            celdaSpread.hidden = false;
            const el = $$('rtl-spread');
            el.textContent = spread == null ? '—' : `${spread >= 0 ? '+' : ''}${spread.toFixed(2)} pp`;
            el.className = spread == null ? '' : spread >= 0 ? 'is-up' : 'is-down';
            $$('rtl-spread-note').textContent = spread == null ? 'Sin dato comparable'
                : `vs ${primaryComparison.label}${spreadSlopeText}`;

            spreadList.hidden = false;
            spreadList.replaceChildren(...compared.map((comparison, index) => {
                const current = [...comparison.values].reverse().find(v => v != null);
                const value = current == null ? null : last.value - current;
                const item = document.createElement('span');
                item.className = 'rtl-spread-item';
                item.style.setProperty('--rtl-series-color', comparisonPalette[index]);
                const name = document.createElement('b');
                name.textContent = `vs ${comparison.label}`;
                const amount = document.createElement('strong');
                amount.textContent = value == null ? 'Sin dato' : `${value >= 0 ? '+' : ''}${value.toFixed(2)} pp`;
                amount.className = value == null ? '' : value >= 0 ? 'is-up' : 'is-down';
                item.append(name, amount);
                return item;
            }));

            leyenda.hidden = false;
            const legendData = [{ label: meta.seriesLabel, color: darkTheme ? '#56c9b0' : '#0d6d8c', dash: false },
                ...compared.map((comparison, index) => ({ label: comparison.label, color: comparisonPalette[index], dash: true }))];
            leyenda.replaceChildren(...legendData.map(item => {
                const entry = document.createElement('span');
                entry.className = `rtl-lg${item.dash ? ' is-dashed' : ''}`;
                entry.style.setProperty('--rtl-series-color', item.color);
                const marker = document.createElement('i');
                const label = document.createElement('b');
                label.textContent = item.label;
                entry.append(marker, label);
                return entry;
            }));
        } else {
            celdaSpread.hidden = true;
            spreadList.hidden = true;
            spreadList.replaceChildren();
            leyenda.hidden = true;
            leyenda.replaceChildren();
        }

        if (Number.isFinite(slope)) {
            leyenda.hidden = false;
            const trendEntry = document.createElement('span');
            trendEntry.className = 'rtl-lg is-dashed rtl-trend-legend';
            trendEntry.style.setProperty('--rtl-series-color', darkTheme ? '#ff7fa7' : '#b83d68');
            const marker = document.createElement('i');
            const label = document.createElement('b');
            label.textContent = `Pendiente ${meta.countryLabel || 'principal'} ${slope >= 0 ? '+' : ''}${slope.toFixed(2)} pp/año`;
            trendEntry.append(marker, label);
            leyenda.append(trendEntry);
        }

        /* Colorimetría: la serie va siempre en el teal de Favro. El rojo y el
           verde se reservan para lo que sí es direccional —la variación y los
           extremos—, así el color significa una sola cosa en toda la vista. */
        const TEAL = darkTheme ? '#56c9b0' : '#0d6d8c';
        const maxIdx = points.indexOf(maxP);
        const minIdx = points.indexOf(minP);

        /* Línea punteada al nivel actual: ancla la cifra "Último" a la curva. */
        const nivelActual = {
            id: 'nivelActual',
            afterDatasetsDraw(c) {
                if (!c.chartArea) return;
                const y = c.scales.y.getPixelForValue(last.value);
                const { left, right } = c.chartArea;
                const g = c.ctx;
                g.save();
                g.setLineDash([5, 5]);
                g.strokeStyle = darkTheme ? 'rgba(86,201,176,.58)' : 'rgba(13,109,140,.5)';
                g.lineWidth = 1;
                g.beginPath(); g.moveTo(left, y); g.lineTo(right, y); g.stroke();
                g.restore();
            },
        };

        chart = new Chart(canvas, {
            type: 'line',
            plugins: [nivelActual],
            data: {
                // Etiquetas ya formateadas: el bundle de Chart.js del proyecto no
                // incluye adaptador de fechas, así que `scales.x.type: 'time'` no
                // funcionaría. Con categorías se consigue lo mismo sin dependencia.
                labels: points.map(p => p.date.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })),
                datasets: [{
                    data: values,
                    borderColor: TEAL,
                    /* Sin comparación: degradado vertical hacia la base. Con
                       varias referencias se omite el relleno para no mezclar
                       áreas y conservar una lectura limpia de las cinco líneas. */
                    backgroundColor: compared.length
                        ? undefined
                        : ctx => {
                            const area = ctx.chart.chartArea;
                            if (!area) return darkTheme ? 'rgba(86,201,176,.14)' : 'rgba(13,109,140,.14)';
                            const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                            g.addColorStop(0, darkTheme ? 'rgba(86,201,176,.30)' : 'rgba(13,109,140,.30)');
                            g.addColorStop(1, darkTheme ? 'rgba(86,201,176,.02)' : 'rgba(13,109,140,.02)');
                            return g;
                        },
                    borderWidth: 2.2,
                    fill: !compared.length,
                    tension: .25,
                    /* Solo se marcan el máximo y el mínimo: son las dos cifras del
                       resumen, y así el ojo las localiza sobre la curva. */
                    pointRadius: points.map((_, i) => (i === maxIdx || i === minIdx) ? 5 : 0),
                    pointBackgroundColor: points.map((_, i) => i === maxIdx ? (darkTheme ? '#ff7b88' : '#b3261e') : i === minIdx ? (darkTheme ? '#51d3a8' : '#0e7a40') : 'transparent'),
                    pointBorderColor: pointRing,
                    pointBorderWidth: 2,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: TEAL,
                    pointHoverBorderColor: pointRing,
                    label: meta.seriesLabel,
                },
                ...compared.map((comparison, index) => ({
                    data: comparison.values,
                    label: comparison.label,
                    borderColor: comparisonPalette[index],
                    borderWidth: 2,
                    borderDash: comparisonDashes[index],
                    fill: false,
                    tension: .25,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: comparisonPalette[index],
                    pointHoverBorderColor: pointRing,
                    spanGaps: true,
                })),
                {
                    data: trendValues,
                    label: 'Pendiente anualizada',
                    borderColor: darkTheme ? '#ff7fa7' : '#b83d68',
                    borderWidth: 1.6,
                    borderDash: [3, 5],
                    fill: false,
                    tension: 0,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    isTrend: true,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 420 },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#071c2c', padding: 10, cornerRadius: 9,
                        displayColors: !!compared.length, boxWidth: 8, boxHeight: 8, usePointStyle: true,
                        filter: item => !item.dataset.isTrend,
                        titleFont: { family: 'Inter', size: 11 }, bodyFont: { family: 'JetBrains Mono', size: 12 },
                        callbacks: {
                            title: it => fmtDate(points[it[0].dataIndex].date),
                            label: it => compared.length
                                ? `${it.dataset.label}  ${fmtPct(it.parsed.y)}`
                                : fmtPct(it.parsed.y),
                            /* Cierra el tooltip con todos los diferenciales del día. */
                            footer: it => {
                                if (!compared.length || it.length < 2) return '';
                                const main = it.find(item => item.datasetIndex === 0);
                                if (!main) return '';
                                return it.filter(item => item.datasetIndex > 0).map(item => {
                                    const d = main.parsed.y - item.parsed.y;
                                    return `vs ${item.dataset.label}  ${d >= 0 ? '+' : ''}${d.toFixed(2)} pp`;
                                });
                            },
                        },
                        footerFont: { family: 'JetBrains Mono', size: 11 },
                        footerColor: '#9fd0e8',
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        border: { color: chartLine },
                        ticks: {
                            color: chartInk, font: { family: 'Inter', size: 11, weight: '600' },
                            maxTicksLimit: 8, autoSkip: true, maxRotation: 0, padding: 6,
                        },
                    },
                    y: {
                        position: 'right',
                        grid: { color: chartGrid, drawTicks: false },
                        border: { display: false },
                        ticks: {
                            color: chartInk, font: { family: 'JetBrains Mono', size: 11 },
                            padding: 10, maxTicksLimit: 6,
                            callback: v => v.toFixed(1) + '%',
                        },
                    },
                },
            },
        });
    }

    async function refresh() {
        const mine = ++reqId;
        const country = $$('rtl-country')?.value;
        const serie = $$('rtl-series')?.value;
        if (!country || !serie) return;
        const cfg = CFG[country];
        const seriesLabel = etiquetaSerie(country, serie);
        const selected = comparisons.map(key => {
            const [compCountry, compSerie] = key.split(':');
            return { key, country: compCountry, series: compSerie };
        });

        clearTimelineReading(cfg.label);
        setState('Cargando serie histórica…');
        try {
            const results = await Promise.allSettled([
                loadSeries(country, serie),
                ...selected.map(item => loadSeries(item.country, item.series)),
            ]);
            if (mine !== reqId) return;
            if (results[0].status !== 'fulfilled') throw results[0].reason;
            const points = results[0].value;
            if (!points.length) { setState('La fuente no devolvió observaciones para este periodo.'); return; }
            updateShortcutYield(country, points);
            setState('');
            const loadedComparisons = selected.flatMap((item, index) => {
                const result = results[index + 1];
                if (result.status !== 'fulfilled' || !result.value.length) {
                    console.warn(`Comparación ${item.key}:`, result.status === 'rejected' ? result.reason?.message : 'sin observaciones');
                    return [];
                }
                updateShortcutYield(item.country, result.value);
                return [{
                    country: item.country,
                    label: etiquetaSerie(item.country, item.series),
                    values: alinear(points, result.value),
                    source: CFG[item.country].source,
                }];
            });
            const fuentes = [...new Set([cfg.source, ...loadedComparisons.map(item => item.source)])];
            render(points, {
                source: fuentes.join(' · '),
                seriesLabel,
                countryLabel: cfg.label,
                comparisons: loadedComparisons,
            });
        } catch (e) {
            if (mine !== reqId) return;
            console.warn('Línea del tiempo:', e.message);
            setState('No se pudo cargar la serie. Inténtalo de nuevo más tarde.');
        }
    }

    function init() {
        if (!$$('rate-timeline')) return;
        fillCountrySelect();
        fillSeriesSelect();
        resetSuggestedComparison();
        syncShortcutState();
        $$('rtl-country').addEventListener('change', () => {
            comparisons = [];
            fillSeriesSelect();
            resetSuggestedComparison();
            syncShortcutState();
            refresh();
        });
        $$('rtl-series').addEventListener('change', () => { syncComparisonControls(); refresh(); });
        $$('rtl-compare-picker').addEventListener('change', e => {
            $$('rtl-add-compare').disabled = !e.target.value || comparisons.length >= MAX_COUNTRIES - 1;
        });
        $$('rtl-add-compare').addEventListener('click', addComparison);
        $$('rtl-comparisons').addEventListener('click', e => {
            const button = e.target.closest('button[data-key]');
            if (!button) return;
            comparisons = comparisons.filter(key => key !== button.dataset.key);
            syncComparisonControls();
            refresh();
        });
        $$('rtl-periods').addEventListener('click', e => {
            const b = e.target.closest('button[data-years]');
            if (!b) return;
            years = +b.dataset.years;
            $$('rtl-periods').querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b));
            refresh();
        });
        refresh();
    }

    if (document.readyState === 'loading') _vnFinEscuchar(document, 'DOMContentLoaded', init, { once: true });
    else init();
})();

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

var _fxEmergingChart = null;
var _fxChartSnapshot = null;
var _fxChartType = (()=>{try{return ['ranking','columns','line','radar'].includes(localStorage.getItem('vn_fx_chart_type'))?localStorage.getItem('vn_fx_chart_type'):'ranking';}catch(e){return 'ranking';}})();

function syncFxChartTypeUI() {
    const names={ranking:'Ranking horizontal',columns:'Columnas comparativas',line:'Línea de dispersión',radar:'Radar de divisas'};
    document.querySelectorAll('[data-fx-chart]').forEach(btn=>{const active=btn.dataset.fxChart===_fxChartType;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));});
    const label=document.getElementById('fx-chart-type-label');if(label)label.textContent=names[_fxChartType];
}

function renderEmergingFXChart(labels,data) {
    const canvas=document.getElementById('fx-pro-emerging-chart')||document.getElementById('fx-emerging-chart');if(!canvas||typeof Chart==='undefined')return;
    if(_fxEmergingChart)_fxEmergingChart.destroy();
    const darkFxTheme=document.body.classList.contains('vn-dark-finanzas');
    const colors=data.map(v=>v==null?(darkFxTheme?'#7d8d9a':'#a9b7bf'):v>=0?(darkFxTheme?'rgba(86,201,176,.86)':'rgba(24,136,117,.82)'):(darkFxTheme?'rgba(233,106,121,.88)':'rgba(196,69,84,.82)'));
    const isRanking=_fxChartType==='ranking',isLine=_fxChartType==='line',isRadar=_fxChartType==='radar';
    const kind=isLine?'line':isRadar?'radar':'bar';
    const chartInk=darkFxTheme?'#c4d0d9':'#50666d',chartGrid=darkFxTheme?'rgba(169,191,207,.14)':'rgba(58,92,88,.08)',chartLine=darkFxTheme?'#56c9b0':'#188875';
    const valueAxis={ticks:{color:chartInk,callback:v=>(typeof v==='number'?v.toFixed(1):v)+'%',font:{size:10,weight:'600'},maxTicksLimit:6,autoSkip:true,maxRotation:0},grid:{color:ctx=>ctx.tick?.value===0?(darkFxTheme?'rgba(112,216,192,.56)':'rgba(24,136,117,.42)'):chartGrid,lineWidth:ctx=>ctx.tick?.value===0?2:1},border:{display:false}};
    const categoryAxis={ticks:{color:chartInk,font:{size:10,weight:'600'},autoSkip:false,padding:8},grid:{display:false},border:{display:false}};
    const scales=isRadar?{r:{angleLines:{color:chartGrid},grid:{color:chartGrid},pointLabels:{color:chartInk,font:{size:9}},ticks:{display:false}}}:isRanking?{x:valueAxis,y:categoryAxis}:{x:categoryAxis,y:valueAxis};
    _fxEmergingChart=new Chart(canvas.getContext('2d'),{type:kind,data:{labels,datasets:[{label:'Variación frente al USD (%)',data,backgroundColor:isLine?(darkFxTheme?'rgba(86,201,176,.12)':'rgba(24,136,117,.12)'):isRadar?(darkFxTheme?'rgba(86,201,176,.16)':'rgba(24,136,117,.16)'):colors,borderColor:isLine||isRadar?chartLine:colors,borderWidth:isLine||isRadar?2:1,borderRadius:7,borderSkipped:false,fill:isLine||isRadar,tension:.28,pointRadius:isLine?4:isRadar?3:0,pointHoverRadius:isLine?6:isRadar?5:0,pointBackgroundColor:colors}]},options:{indexAxis:isRanking?'y':'x',responsive:true,maintainAspectRatio:false,animation:{duration:520,easing:'easeOutQuart'},interaction:{mode:'nearest',intersect:true},plugins:{legend:{display:false},tooltip:{backgroundColor:darkFxTheme?'#142738':'#17312d',borderColor:darkFxTheme?'#627e71':'#4b796f',borderWidth:1,padding:11,titleColor:'#fff',bodyColor:'#fff',displayColors:false,callbacks:{label:ctx=>{const value=isRanking?ctx.parsed.x:(ctx.parsed.r??ctx.parsed.y??ctx.raw);return `Movimiento: ${value>=0?'+':''}${Number(value).toFixed(2)}% frente al USD`;}}}},scales}});
    syncFxChartTypeUI();
}

function setFxChartType(type,button) {
    if(!['ranking','columns','line','radar'].includes(type)||type===_fxChartType)return;
    _fxChartType=type;try{localStorage.setItem('vn_fx_chart_type',type);}catch(e){}
    syncFxChartTypeUI();if(_fxChartSnapshot)renderEmergingFXChart(_fxChartSnapshot.labels,_fxChartSnapshot.data);
}

async function loadEmergingFX() {
    const canvas = document.getElementById('fx-pro-emerging-chart') || document.getElementById('fx-emerging-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const FX = [
        { ticker: 'USDBRL=X', code:'BR', label: 'BR · Real brasileño' },
        { ticker: 'USDCOP=X', code:'CO', label: 'CO · Peso colombiano' },
        { ticker: 'USDCLP=X', code:'CL', label: 'CL · Peso chileno' },
        { ticker: 'USDINR=X', code:'IN', label: 'IN · Rupia india' },
        { ticker: 'USDZAR=X', code:'ZA', label: 'ZA · Rand sudafricano' },
        { ticker: 'USDTRY=X', code:'TR', label: 'TR · Lira turca' },
        { ticker: 'USDIDR=X', code:'ID', label: 'ID · Rupia indonesia' },
        { ticker: 'USDKRW=X', code:'KR', label: 'KR · Won surcoreano' },
    ];

    const results = await Promise.allSettled(FX.map(f => fetchAssetData(f.ticker)));
    const labels = FX.map(f => f.label);
    const data = FX.map((f, i) => {
        const meta = results[i].status === 'fulfilled' ? results[i].value?.meta : null;
        const pct  = meta?.regularMarketChangePercent;
        return (typeof pct === 'number') ? -pct : null;
    });
    const valid = data.map((value,index)=>({value,index})).filter(item=>Number.isFinite(item.value));
    const setText=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
    setText('fx-emerging-coverage',`${valid.length} de ${FX.length} mercados`);
    if(valid.length){
        const strongest=valid.slice().sort((a,b)=>b.value-a.value)[0];
        const weakest=valid.slice().sort((a,b)=>a.value-b.value)[0];
        const dispersion=strongest.value-weakest.value;
        setText('fx-emerging-strongest',`${FX[strongest.index].code} · +${strongest.value.toFixed(2)}%`);
        setText('fx-emerging-weakest',`${FX[weakest.index].code} · ${weakest.value>=0?'+':''}${weakest.value.toFixed(2)}%`);
        setText('fx-emerging-dispersion',`${dispersion.toFixed(2)} pp`);
    }
    _fxChartSnapshot={labels,data};
    renderEmergingFXChart(labels,data);
}

var _moversChart = null;
var _moversReportData = [];

/* ── Renta variable global por sector ────────────────────────────────────────
   El sector NO viene de la API: /api/stock-history usa el endpoint `chart` de
   Yahoo, que devuelve símbolo, precio, máximo, mínimo y variación, pero no la
   clasificación sectorial (esa vive en `quoteSummary`, otro endpoint que exige
   cookie+crumb y es inestable). Se resuelve con este mapa fijo, que además no
   cuesta ninguna petición extra: los sectores no cambian de un día a otro. */
var SECTOR_UNIVERSE = [
    { t: 'AAPL',        n: 'Apple',              s: 'Tecnología',     f: '🇺🇸' },
    { t: 'MSFT',        n: 'Microsoft',          s: 'Tecnología',     f: '🇺🇸' },
    { t: 'NVDA',        n: 'NVIDIA',             s: 'Tecnología',     f: '🇺🇸' },
    { t: 'SAP.DE',      n: 'SAP',                s: 'Tecnología',     f: '🇩🇪' },
    { t: '005930.KS',   n: 'Samsung Electronics',s: 'Tecnología',     f: '🇰🇷' },
    { t: '6758.T',      n: 'Sony',               s: 'Tecnología',     f: '🇯🇵' },

    { t: 'GOOGL',       n: 'Alphabet',           s: 'Comunicaciones', f: '🇺🇸' },
    { t: 'META',        n: 'Meta',               s: 'Comunicaciones', f: '🇺🇸' },
    { t: '0700.HK',     n: 'Tencent',            s: 'Comunicaciones', f: '🇭🇰' },
    { t: '9432.T',      n: 'NTT',                s: 'Comunicaciones', f: '🇯🇵' },

    { t: 'UNH',         n: 'UnitedHealth',       s: 'Salud',          f: '🇺🇸' },
    { t: 'JNJ',         n: 'Johnson & Johnson',  s: 'Salud',          f: '🇺🇸' },
    { t: 'AZN.L',       n: 'AstraZeneca',        s: 'Salud',          f: '🇬🇧' },
    { t: 'SAN.PA',      n: 'Sanofi',             s: 'Salud',          f: '🇫🇷' },
    { t: 'ROG.SW',      n: 'Roche',              s: 'Salud',          f: '🇨🇭' },

    { t: 'JPM',         n: 'JPMorgan Chase',     s: 'Finanzas',       f: '🇺🇸' },
    { t: 'V',           n: 'Visa',               s: 'Finanzas',       f: '🇺🇸' },
    { t: 'BAC',         n: 'Bank of America',    s: 'Finanzas',       f: '🇺🇸' },
    { t: 'HSBA.L',      n: 'HSBC',               s: 'Finanzas',       f: '🇬🇧' },
    { t: 'BNP.PA',      n: 'BNP Paribas',        s: 'Finanzas',       f: '🇫🇷' },

    { t: 'AMZN',        n: 'Amazon',             s: 'Consumo',        f: '🇺🇸' },
    { t: 'TSLA',        n: 'Tesla',              s: 'Consumo',        f: '🇺🇸' },
    { t: 'WMT',         n: 'Walmart',            s: 'Consumo',        f: '🇺🇸' },
    { t: 'KO',          n: 'Coca-Cola',          s: 'Consumo',        f: '🇺🇸' },
    { t: 'MC.PA',       n: 'LVMH',               s: 'Consumo',        f: '🇫🇷' },
    { t: 'NESN.SW',     n: 'Nestlé',             s: 'Consumo',        f: '🇨🇭' },
    { t: '7203.T',      n: 'Toyota',             s: 'Consumo',        f: '🇯🇵' },

    { t: 'SIE.DE',      n: 'Siemens',            s: 'Industria',      f: '🇩🇪' },
    { t: 'AIR.PA',      n: 'Airbus',             s: 'Industria',      f: '🇫🇷' },
    { t: '6501.T',      n: 'Hitachi',            s: 'Industria',      f: '🇯🇵' },

    { t: 'XOM',         n: 'ExxonMobil',         s: 'Energía',        f: '🇺🇸' },
    { t: 'SHEL.L',      n: 'Shell',              s: 'Energía',        f: '🇬🇧' },
    { t: 'TTE.PA',      n: 'TotalEnergies',      s: 'Energía',        f: '🇫🇷' },
    { t: 'RELIANCE.NS', n: 'Reliance',           s: 'Energía',        f: '🇮🇳' },

    { t: 'RIO.L',       n: 'Rio Tinto',          s: 'Materiales',     f: '🇬🇧' },
    { t: 'VALE3.SA',    n: 'Vale',               s: 'Materiales',     f: '🇧🇷' },
];

var _sectorRows = [];
var _sectorFilter = 'all';
var _sectorBoardLoading = null;
var _sectorBoardStale = false;

function setSectorFilter(sector) {
    _sectorFilter = sector;
    paintSectorBoard();
}

/* Abre la emisora en el laboratorio reutilizando el campo de ticker libre, que
   acepta cualquier símbolo aunque no esté en el selector. */
function openTickerInLab(ticker) {
    const custom = document.getElementById('bmv-custom');
    if (custom) custom.value = ticker;
    document.getElementById('bmv-custom-btn')?.click();
    document.getElementById('bvmx-panel')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
    });
}

async function loadSectorBoard() {
    if (!document.getElementById('sectors-panel')) return;
    if (_sectorBoardLoading) return _sectorBoardLoading;
    _sectorBoardLoading = (async () => {
        const cacheKey = 'vn_sector_board_v2';
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(cacheKey)); } catch {}
        if (Array.isArray(cached?.rows) && cached.rows.length) {
            _sectorRows = cached.rows;
            _sectorBoardStale = Date.now() - Number(cached.ts || 0) > 15 * 60 * 1000;
            paintSectorBoard();
            if (!_sectorBoardStale) return;
        }

        const fetched = [];
        for (let start = 0; start < SECTOR_UNIVERSE.length; start += 4) {
            const batch = SECTOR_UNIVERSE.slice(start, start + 4);
            const results = await Promise.allSettled(batch.map(asset => fetchAssetData(asset.t)));
            batch.forEach((asset, index) => {
                const data = results[index].status === 'fulfilled' ? results[index].value : null;
                const pct = data?.meta?.regularMarketChangePercent;
                if (typeof pct === 'number') fetched.push({ ...asset, pct });
            });
            if (start + 4 < SECTOR_UNIVERSE.length) await new Promise(resolve => setTimeout(resolve, 240));
        }

        if (fetched.length) {
            const byTicker = new Map((cached?.rows || []).map(row => [row.t, row]));
            fetched.forEach(row => byTicker.set(row.t, row));
            _sectorRows = SECTOR_UNIVERSE.map(asset => byTicker.get(asset.t)).filter(Boolean);
            _sectorBoardStale = fetched.length < Math.ceil(SECTOR_UNIVERSE.length * .6);
            try { localStorage.setItem(cacheKey, JSON.stringify({ ts:Date.now(), rows:_sectorRows })); } catch {}
        }
        paintSectorBoard();
    })().finally(() => { _sectorBoardLoading = null; });
    return _sectorBoardLoading;
}

function paintSectorBoard() {
    const rows = _sectorRows;
    const statusEl = document.getElementById('sb-status');
    const setHTML = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    if (!rows.length) {
        if (statusEl) { statusEl.textContent = 'Sin datos'; statusEl.className = 'sb-status is-off'; }
        setHTML('sb-sectors', '<div class="sb-empty">No se pudieron obtener cotizaciones en este momento.</div>');
        setHTML('sb-donut', '<div class="sb-empty">Sin composición disponible</div>');
        setHTML('sb-heatmap', '<div class="sb-empty">Sin desempeño disponible</div>');
        return;
    }

    // ── Agregado por sector: media simple de las emisoras del grupo ──────────
    const bySector = {};
    rows.forEach(r => { (bySector[r.s] = bySector[r.s] || []).push(r); });
    const sectors = Object.entries(bySector).map(([name, items]) => ({
        name,
        n: items.length,
        avg: items.reduce((sum, it) => sum + it.pct, 0) / items.length,
        items: [...items].sort((a, b) => b.pct - a.pct),
    })).sort((a, b) => b.avg - a.avg);

    // ── 1. Indicadores clave ────────────────────────────────────────────────
    const up = rows.filter(r => r.pct > 0).length;
    const breadth = Math.round(up / rows.length * 100);
    const best = sectors[0];
    const worst = sectors[sectors.length - 1];
    const sorted = [...rows].sort((a, b) => b.pct - a.pct);
    const dispersion = sorted[0].pct - sorted[sorted.length - 1].pct;
    const tone = v => v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'flat';
    const sign = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
    const palette = ['#5d9fa0','#718ea5','#7d8f73','#9a7d8c','#a3906d','#678aa1','#806f94','#769581'];

    setHTML('sb-kpis', `
        <div class="sb-summary ${breadth >= 60 ? 'up' : breadth <= 40 ? 'down' : ''}">
            <span>Amplitud</span><strong>${breadth}% al alza</strong><small>${up} de ${rows.length} emisoras</small></div>
        <div class="sb-summary ${tone(best.avg)}">
            <span>Liderazgo sectorial</span><strong>${best.name} · ${sign(best.avg)}</strong><small>Rezagado: ${worst.name} · ${sign(worst.avg)}</small></div>
        <div class="sb-summary">
            <span>Dispersión de la sesión</span><strong>${dispersion.toFixed(2)} pp</strong><small>${sorted[0].n} frente a ${sorted[sorted.length - 1].n}</small></div>`);

    if (statusEl) {
        statusEl.textContent = `${rows.length} emisoras · ${sectors.length} sectores${_sectorBoardStale ? ' · última lectura' : ''}`;
        statusEl.className = 'sb-status ' + (breadth >= 60 ? 'is-on' : breadth <= 40 ? 'is-off' : '');
    }

    let cursor = 0;
    const stops = sectors.map((sector, index) => {
        const start = cursor;
        cursor += sector.n / rows.length * 100;
        return `${palette[index % palette.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    }).join(',');
    setHTML('sb-donut', `
        <div class="sb-donut" style="background:conic-gradient(${stops})" role="img" aria-label="Distribución de ${rows.length} emisoras entre ${sectors.length} sectores">
            <div class="sb-donut-center"><strong>${rows.length}</strong><small>emisoras</small></div>
        </div>
        <div class="sb-legend">${sectors.map((sector, index) => `
            <button type="button" class="${_sectorFilter === sector.name ? 'is-active' : ''}" style="--sb-sector-color:${palette[index % palette.length]}"
                    onclick="setSectorFilter('${_sectorFilter === sector.name ? 'all' : sector.name}')" aria-pressed="${_sectorFilter === sector.name}">
                <i aria-hidden="true"></i><em>${sector.name}</em><strong>${(sector.n / rows.length * 100).toFixed(0)}%</strong>
            </button>`).join('')}</div>`);

    // ── 2. Sectores. La barra crece desde el cero, no desde el mínimo, para
    //      que el signo y la magnitud se lean sin traducir. ──────────────────
    const maxAbs = Math.max(...sectors.map(s => Math.abs(s.avg)), 0.01);
    setHTML('sb-sectors', sectors.map(sector => {
        const width = Math.max(2, Math.abs(sector.avg) / maxAbs * 50);
        const dir = sector.avg >= 0 ? 'up' : 'down';
        return `<div class="sb-sector ${tone(sector.avg)}${_sectorFilter === sector.name ? ' is-active' : ''}"
                     role="button" tabindex="0"
                     onclick="setSectorFilter('${_sectorFilter === sector.name ? 'all' : sector.name}')"
                     onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();setSectorFilter('${_sectorFilter === sector.name ? 'all' : sector.name}')}">
            <span class="sb-sector-name">${sector.name}</span>
            <span class="sb-sector-track"><i class="${dir}" style="width:${width.toFixed(2)}%"></i></span>
            <span class="sb-sector-pct">${sign(sector.avg)}</span>
        </div>`;
    }).join('') + `<div class="sb-axis"><span>−${maxAbs.toFixed(1)}%</span><span>0</span><span>+${maxAbs.toFixed(1)}%</span></div>`);

    const matrixSectors = _sectorFilter === 'all' ? sectors : sectors.filter(s => s.name === _sectorFilter);
    const maxColumns = Math.min(7, Math.max(...matrixSectors.map(s => s.items.length), 1));
    const header = Array.from({ length:maxColumns }, (_, i) => `<span>#${i + 1}</span>`).join('');
    const matrixRows = matrixSectors.map(sector => {
        const cells = Array.from({ length:maxColumns }, (_, index) => {
            const item = sector.items[index];
            if (!item) return '<span class="sb-cell-empty">—</span>';
            const strength = (.38 + Math.min(1, Math.abs(item.pct) / Math.max(dispersion, .01)) * .48).toFixed(2);
            return `<button type="button" class="sb-cell ${tone(item.pct)}" style="--sb-strength:${strength}"
                    onclick="openTickerInLab('${item.t}')" title="${item.n} · ${item.t} · ${sign(item.pct)}"
                    aria-label="Abrir ${item.n}, ${item.t}, variación ${sign(item.pct)}">
                <strong>${sign(item.pct)}</strong><small>${item.t}</small></button>`;
        }).join('');
        return `<div class="sb-matrix-row"><span class="sb-matrix-label">${sector.name}</span>${cells}</div>`;
    }).join('');
    setHTML('sb-heatmap', `<div class="sb-matrix" style="--sb-columns:${maxColumns}">
        <div class="sb-matrix-row sb-matrix-head"><span>Sector</span>${header}</div>${matrixRows}</div>`);

    const reset = document.getElementById('sb-reset');
    if (reset) reset.hidden = _sectorFilter === 'all';
}

async function loadTopMovers() {
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

    const results = await Promise.allSettled(GLOBAL_TICKERS.map(a => fetchAssetData(a.ticker)));

    const rows = GLOBAL_TICKERS.map((a, i) => {
        const data = results[i].status === 'fulfilled' ? results[i].value : null;
        const pct  = data?.meta?.regularMarketChangePercent;
        return {
            label: a.label,
            ticker: a.ticker,
            pct: (typeof pct === 'number') ? pct : null,
            meta: data?.meta || null,
            candles: data?.candles || [],
        };
    }).filter(r => r.pct != null);

    rows.sort((a, b) => b.pct - a.pct);
    rows.forEach((row, index) => { row.reportIndex = index; });
    _moversReportData = rows.map(row => {
        const firstSpace = row.label.indexOf(' ');
        const flag = firstSpace > -1 ? row.label.slice(0, firstSpace) : '🌐';
        const name = firstSpace > -1 ? row.label.slice(firstSpace + 1) : row.label;
        return {
            asset: { label: name, sub: `${flag} RENTA VARIABLE · ${row.ticker}`, ticker: row.ticker, isMover: true },
            meta: row.meta,
            candles: row.candles,
        };
    });
    const gainers = rows.slice(0, 4);
    const losers  = rows.slice(-4).reverse();

    const positiveCount = rows.filter(row => row.pct >= 0).length;
    const sessionSpread = rows.length > 1 ? rows[0].pct - rows[rows.length - 1].pct : 0;
    equitySetValue('movers-breadth', rows.length ? `${positiveCount}/${rows.length}` : '—');
    equitySetValue('movers-spread', rows.length ? `${sessionSpread.toFixed(2)}%` : '—');
    equitySetValue('movers-universe', rows.length || GLOBAL_TICKERS.length);
    const sessionTitle = document.getElementById('movers-session-title');
    const sessionCopy = document.getElementById('movers-session-copy');
    const sessionChip = document.getElementById('movers-session-chip');
    if (rows.length) {
        const breadthPct = Math.round(positiveCount / rows.length * 100);
        const leaderName = rows[0].label.replace(/^\S+\s+/, '');
        const laggardName = rows[rows.length - 1].label.replace(/^\S+\s+/, '');
        const tone = breadthPct >= 60 ? 'positive' : breadthPct <= 40 ? 'negative' : 'neutral';
        if (sessionTitle) sessionTitle.textContent = breadthPct >= 60 ? 'Impulso comprador amplio' : breadthPct <= 40 ? 'Presión vendedora dominante' : 'Sesión de participación mixta';
        if (sessionCopy) sessionCopy.textContent = `${leaderName} lidera con ${rows[0].pct >= 0 ? '+' : ''}${rows[0].pct.toFixed(2)}%; ${laggardName} rezaga con ${rows[rows.length - 1].pct.toFixed(2)}%. La amplitud positiva alcanza ${breadthPct}%.`;
        if (sessionChip) { sessionChip.textContent = breadthPct >= 60 ? 'RISK-ON' : breadthPct <= 40 ? 'RISK-OFF' : 'MIXTO'; sessionChip.className = tone; }
    }

    function renderRanking(targetId, items, direction) {
        const target = document.getElementById(targetId);
        if (!target) return;
        if (!items.length) {
            target.innerHTML = '<div class="movers-empty">Datos de sesión no disponibles</div>';
            return;
        }
        const maxMove = Math.max(...items.map(item => Math.abs(item.pct)), .01);
        target.innerHTML = items.map((item, index) => {
            const firstSpace = item.label.indexOf(' ');
            const flag = firstSpace > -1 ? item.label.slice(0, firstSpace) : '🌐';
            const name = firstSpace > -1 ? item.label.slice(firstSpace + 1) : item.label;
            const width = Math.max(18, Math.round(Math.abs(item.pct) / maxMove * 100));
            const sign = item.pct >= 0 ? '+' : '';
            return `<div class="mover-rank-row ${direction}" style="--mover-width:${width}%" onclick="openMoverReport(${item.reportIndex})" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openMoverReport(${item.reportIndex})}">
                <span class="mover-position">${index + 1}</span>
                <span class="mover-flag">${flag}</span>
                <div class="mover-company"><strong>${name}</strong><span><i></i>${direction === 'up' ? 'Impulso comprador' : 'Presión vendedora'} · Ver reporte</span></div>
                <strong class="mover-change">${sign}${item.pct.toFixed(2)}%</strong>
            </div>`;
        }).join('');
    }
    renderRanking('movers-gainers-list', gainers, 'up');
    renderRanking('movers-losers-list', losers, 'down');

    if (_moversChart) {
        _moversChart.destroy();
        _moversChart = null;
    }
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
    initEconomicCalendar();
}

var _calendarViewDate = null;

function calendarCards() {
    return Array.from(document.querySelectorAll('#calendar-panel-main .calendar-agenda-list .cal-card[data-date]'));
}

function calendarMonthName(date, withYear) {
    const options = withYear ? { month: 'long', year: 'numeric' } : { month: 'long' };
    const label = date.toLocaleDateString('es-MX', options);
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function initEconomicCalendar() {
    const calendarPanel = document.getElementById('calendar-panel-main');
    const debtMainGrid = document.querySelector('#bonds-panel .debt-main-grid');
    if (calendarPanel && debtMainGrid && calendarPanel.parentElement !== debtMainGrid.parentElement) {
        debtMainGrid.parentElement.insertBefore(calendarPanel, debtMainGrid);
    }
    const cards = calendarCards();
    const grid = document.getElementById('calendar-month-grid');
    if (!cards.length || !grid) return;

    cards.forEach((card, index) => { card.dataset.calendarIndex = String(index); });
    cards.sort((a, b) => a.dataset.date.localeCompare(b.dataset.date));
    const agenda = document.querySelector('#calendar-panel-main .calendar-agenda-list');
    cards.forEach(card => agenda.appendChild(card));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const first = new Date(cards[0].dataset.date + 'T00:00:00');
    const last = new Date(cards[cards.length - 1].dataset.date + 'T00:00:00');
    const initial = today >= first && today <= last ? today : (cards.find(card => new Date(card.dataset.date + 'T00:00:00') >= today) ? new Date(cards.find(card => new Date(card.dataset.date + 'T00:00:00') >= today).dataset.date + 'T00:00:00') : last);
    _calendarViewDate = new Date(initial.getFullYear(), initial.getMonth(), 1);

    const highCount = cards.filter(card => card.classList.contains('high')).length;
    const nextCard = cards.find(card => new Date(card.dataset.date + 'T00:00:00') >= today);
    document.getElementById('calendar-total-events').textContent = String(cards.length);
    document.getElementById('calendar-high-events').textContent = String(highCount);
    document.getElementById('calendar-next-event').textContent = nextCard
        ? new Date(nextCard.dataset.date + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).replace('.', '')
        : 'Sin pendientes';
    renderEconomicCalendar();
}





function calendarOpenEvent(index) {
    const card = document.querySelector('#calendar-panel-main .cal-card[data-calendar-index="' + index + '"]');
    if (card && typeof openCalDetail === 'function') openCalDetail(card);
}

function renderEconomicCalendar() {
    const grid = document.getElementById('calendar-month-grid');
    if (!grid || !_calendarViewDate) return;
    const cards = calendarCards();
    const year = _calendarViewDate.getFullYear();
    const month = _calendarViewDate.getMonth();
    const monthKey = year + '-' + String(month + 1).padStart(2, '0');
    const monthLabel = calendarMonthName(_calendarViewDate, true);
    const monthCards = cards.filter(card => card.dataset.date.slice(0, 7) === monthKey);
    const eventsByDay = {};
    monthCards.forEach(card => {
        const day = Number(card.dataset.date.slice(8, 10));
        (eventsByDay[day] ||= []).push(card);
        card.hidden = false;
    });
    cards.filter(card => card.dataset.date.slice(0, 7) !== monthKey).forEach(card => { card.hidden = true; });

    document.getElementById('calendar-month-label').textContent = monthLabel;
    document.getElementById('calendar-agenda-title').textContent = monthLabel;
    document.getElementById('calendar-agenda-count').textContent = monthCards.length + (monthCards.length === 1 ? ' evento' : ' eventos');
    document.getElementById('calendar-agenda-empty').hidden = monthCards.length !== 0;

    grid.replaceChildren();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let cellIndex = 0; cellIndex < cells; cellIndex++) {
        const dayDate = new Date(year, month, cellIndex - firstWeekday + 1);
        const inMonth = dayDate.getMonth() === month;
        const dayNumber = dayDate.getDate();
        const cell = document.createElement('div');
        cell.className = 'calendar-day' + (inMonth ? '' : ' is-outside') + (dayDate.getTime() === today.getTime() ? ' is-today' : '');
        const number = document.createElement('span');
        number.className = 'calendar-day-number';
        number.textContent = String(dayNumber);
        cell.appendChild(number);

        if (inMonth) {
            const dayEvents = eventsByDay[dayNumber] || [];
            dayEvents.slice(0, 2).forEach(card => {
                const button = document.createElement('button');
                const impact = card.classList.contains('high') ? 'high' : card.classList.contains('med') ? 'med' : 'low';
                const title = (card.querySelector('.cal-card-title') || {}).textContent || 'Evento económico';
                const flag = (card.querySelector('.cal-card-flag') || {}).textContent || '';
                button.type = 'button';
                button.className = 'calendar-event ' + impact;
                button.dataset.eventIndex = card.dataset.calendarIndex;
                button.title = title;
                button.setAttribute('aria-label', title);
                button.addEventListener('click', () => calendarOpenEvent(card.dataset.calendarIndex));
                const flagSpan = document.createElement('span');
                flagSpan.textContent = flag;
                const titleSpan = document.createElement('strong');
                titleSpan.textContent = title;
                button.append(flagSpan, titleSpan);
                cell.appendChild(button);
            });
            if (dayEvents.length > 2) {
                const more = document.createElement('small');
                more.className = 'calendar-more-events';
                more.textContent = '+' + (dayEvents.length - 2) + ' eventos';
                cell.appendChild(more);
            }
        }
        grid.appendChild(cell);
    }
}

var REFRESH_MS = 20 * 60 * 1000;  
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
        const spreadSignalEl = document.getElementById('energy-macro-spread');
        const spreadSignalNoteEl = document.getElementById('energy-macro-spread-note');
        const dollarRegimeEl = document.getElementById('energy-dollar-regime');
        const dollarRegimeNoteEl = document.getElementById('energy-dollar-regime-note');
        if (spreadSignalEl && tbill4w != null) {
            const usEuSpread = tbill4w - euribor;
            spreadSignalEl.textContent = `${usEuSpread >= 0 ? '+' : ''}${usEuSpread.toFixed(2)} pp`;
            if (spreadSignalNoteEl) spreadSignalNoteEl.textContent = usEuSpread > .75 ? 'Ventaja de rendimiento para USD' : usEuSpread < -.25 ? 'Ventaja relativa para EUR' : 'Diferencial equilibrado';
        }
        if (dollarRegimeEl && dxyCurr != null) {
            const dollarRegime = dxyCurr > 104 ? 'Fuerte' : dxyCurr > 100 ? 'Neutral' : 'Débil';
            dollarRegimeEl.textContent = dollarRegime;
            if (dollarRegimeNoteEl) dollarRegimeNoteEl.textContent = dxyCurr > 104 ? 'Presión para commodities' : dxyCurr > 100 ? 'Impacto acotado' : 'Viento a favor para commodities';
        }
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


var _equitySectorData = [];
var _equityInstitutionalData = null;

function updateEquitySectorSnapshot(sectors) {
    if (Array.isArray(sectors)) _equitySectorData = sectors.filter(s => s.pct != null);
    if (!_equitySectorData.length) return;
    const sorted = [..._equitySectorData].sort((a,b) => b.pct - a.pct);
    const positive = sorted.filter(s => s.pct >= 0).length;
    const breadth = Math.round(positive / sorted.length * 100);
    const set = (id,value) => { const el=document.getElementById(id); if(el) el.textContent=value; };
    set('eq-sector-breadth', `${breadth}% · ${positive}/${sorted.length}`);
    set('eq-sector-leader', `${sorted[0].label} ${sorted[0].pct >= 0 ? '+' : ''}${sorted[0].pct.toFixed(2)}%`);
    const lag = sorted[sorted.length - 1];
    set('eq-sector-laggard', `${lag.label} ${lag.pct >= 0 ? '+' : ''}${lag.pct.toFixed(2)}%`);
}

function equityFormatPrice(value) {
    if (value == null || !isFinite(value)) return '—';
    if (Math.abs(value) >= 1000) return value.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
    return value.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
}

function equitySetValue(id, value) {
    const el = document.getElementById(id); if (el) el.textContent = value;
}

function reportCardKey(event, action) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    action();
}

function equitySetChange(id, pct, fallback) {
    const el = document.getElementById(id); if (!el) return;
    if (pct == null || !isFinite(pct)) { el.textContent = fallback || 'Dato pendiente'; el.className = ''; return; }
    el.textContent = `${pct >= 0 ? '▲ +' : '▼ '}${Math.abs(pct).toFixed(2)}% sesión`;
    el.className = pct >= 0 ? 'up' : 'down';
}

var _equityFactorRows = [];
var _factorView = (() => {
    try {
        const saved = localStorage.getItem('vn_factor_view');
        return ['bars','heat','ranking'].includes(saved) ? saved : 'bars';
    } catch { return 'bars'; }
})();

function renderEquityFactorView() {
    const factorTable = document.getElementById('eq-factor-table');
    if (!factorTable || !_equityFactorRows.length) return;
    factorTable.className = `eq-factor-table view-${_factorView}`;
    const maxRel = Math.max(..._equityFactorRows.map(f => Math.abs(f.relative ?? 0)),.1);
    const pctText = item => item.pct == null ? '—' : `${item.pct >= 0 ? '+' : ''}${item.pct.toFixed(2)}%`;
    const relText = item => item.relative == null ? '—' : `${item.relative >= 0 ? '+' : ''}${item.relative.toFixed(2)} pp`;

    if (_factorView === 'heat') {
        factorTable.innerHTML = _equityFactorRows.map(item => {
            const rel = item.relative;
            const tone = rel == null ? 'flat' : rel >= 0 ? 'up' : 'down';
            const strength = rel == null ? 0 : Math.round(Math.min(1,Math.abs(rel)/maxRel)*100);
            return `<div class="eq-factor-heat-card ${tone} report-card" style="--factor-strength:${strength}%" role="button" tabindex="0" title="Abrir reporte de ${item.label}" onclick="openEquityInstitutionalReport('factors',${item._reportIndex})" onkeydown="reportCardKey(event,()=>openEquityInstitutionalReport('factors',${item._reportIndex}))">
                <div><small>${item.ticker}</small><strong>${item.label}</strong><span>${item.note}</span></div>
                <div class="eq-factor-heat-value"><strong>${pctText(item)}</strong><span>${relText(item)} vs SPY</span></div>
                <i></i>
            </div>`;
        }).join('');
    } else if (_factorView === 'ranking') {
        const sorted = [..._equityFactorRows].sort((a,b) => (b.relative ?? -Infinity) - (a.relative ?? -Infinity));
        factorTable.innerHTML = sorted.map((item,index) => {
            const tone = item.relative == null ? 'flat' : item.relative >= 0 ? 'up' : 'down';
            return `<div class="eq-factor-rank-row ${tone} report-card" role="button" tabindex="0" title="Abrir reporte de ${item.label}" onclick="openEquityInstitutionalReport('factors',${item._reportIndex})" onkeydown="reportCardKey(event,()=>openEquityInstitutionalReport('factors',${item._reportIndex}))">
                <span class="eq-factor-position">${index + 1}</span>
                <div class="eq-factor-name"><strong>${item.label}</strong><small>${item.ticker} · ${item.note}</small></div>
                <strong>${pctText(item)}</strong><span>${relText(item)}</span>
            </div>`;
        }).join('');
    } else {
        factorTable.innerHTML = _equityFactorRows.map(item => {
            const rel = item.relative;
            const width = rel == null ? 0 : Math.min(50,Math.abs(rel)/maxRel*50);
            const left = rel != null && rel < 0 ? 50-width : 50;
            const color = rel == null ? '#94a3b8' : rel >= 0 ? '#059669' : '#dc2626';
            return `<div class="eq-factor-row report-card" role="button" tabindex="0" title="Abrir reporte de ${item.label}" onclick="openEquityInstitutionalReport('factors',${item._reportIndex})" onkeydown="reportCardKey(event,()=>openEquityInstitutionalReport('factors',${item._reportIndex}))"><div class="eq-factor-name"><strong>${item.label}</strong><small>${item.ticker} · ${item.note}</small></div><div class="eq-factor-bar"><span style="margin-left:${left}%;width:${width}%;background:${color}"></span></div><strong>${pctText(item)}</strong><span class="${rel != null && rel >= 0 ? 'up' : 'down'}">${relText(item)}</span></div>`;
        }).join('');
    }
}

function syncFactorView() {
    document.querySelectorAll('[data-factor-view]').forEach(btn => {
        const active = btn.dataset.factorView === _factorView;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
}



async function loadEquityInstitutional() {
    const REGIONS = [
        { ticker:'^GSPC', label:'S&P 500', region:'Estados Unidos', flag:'🇺🇸' },
        { ticker:'^IXIC', label:'Nasdaq', region:'Estados Unidos', flag:'🇺🇸' },
        { ticker:'^RUT', label:'Russell 2000', region:'Small Caps EUA', flag:'🇺🇸' },
        { ticker:'^STOXX50E', label:'Euro Stoxx 50', region:'Zona Euro', flag:'🇪🇺' },
        { ticker:'^FTSE', label:'FTSE 100', region:'Reino Unido', flag:'🇬🇧' },
        { ticker:'^N225', label:'Nikkei 225', region:'Japón', flag:'🇯🇵' },
        { ticker:'^HSI', label:'Hang Seng', region:'Hong Kong', flag:'🇭🇰' },
        { ticker:'^MXX', label:'IPC', region:'México', flag:'🇲🇽' },
        { ticker:'^BVSP', label:'Bovespa', region:'Brasil', flag:'🇧🇷' },
    ];
    const FACTORS = [
        { ticker:'SPY', label:'Mercado amplio', note:'S&P 500' },
        { ticker:'QQQ', label:'Crecimiento / Tech', note:'Nasdaq 100' },
        { ticker:'RSP', label:'Equal Weight', note:'Participación amplia' },
        { ticker:'IWM', label:'Small Caps', note:'Russell 2000' },
        { ticker:'VTV', label:'Value', note:'Acciones de valor' },
        { ticker:'MTUM', label:'Momentum', note:'Tendencia' },
        { ticker:'QUAL', label:'Quality', note:'Calidad financiera' },
        { ticker:'USMV', label:'Minimum Volatility', note:'Perfil defensivo' },
    ];
    const CONTEXT = [
        { ticker:'^TNX',     key:'tnx',  label:'Treasury 10Y' },
        { ticker:'DX-Y.NYB', key:'dxy',  label:'DXY' },
        { ticker:'^VIX',     key:'vix',  label:'VIX' },
        { ticker:'GC=F',     key:'gold', label:'Oro' },
    ];

    // El HTML ya contiene la última lectura válida. Se conserva visible hasta
    // que termine esta actualización para evitar esqueletos o saltos vacíos.
    const regionGrid = document.getElementById('eq-region-grid');

    const universe = [...REGIONS,...FACTORS,...CONTEXT];
    const fetchWithDeadline = asset => Promise.race([
        fetchAssetData(asset.ticker),
        new Promise(resolve => setTimeout(() => resolve(null), 10000)),
    ]);
    const results = await Promise.allSettled(universe.map(fetchWithDeadline));
    const read = (asset,index) => {
        const data = results[index]?.status === 'fulfilled' ? results[index].value : null;
        return { ...asset, price:data?.meta?.regularMarketPrice ?? null, pct:data?.meta?.regularMarketChangePercent ?? null, meta:data?.meta || null, candles:data?.candles || [] };
    };
    const regions = REGIONS.map((asset,index) => read(asset,index));
    const factors = FACTORS.map((asset,index) => read(asset,REGIONS.length + index));
    const contextOffset = REGIONS.length + FACTORS.length;
    const context = CONTEXT.map((asset,index) => read(asset,contextOffset + index));
    context.forEach(item => {
        if (item.price != null) _rds[item.key] = item.price;
        if (item.pct != null) _rds[item.key + 'Pct'] = item.pct;
    });
    _equityInstitutionalData = { regions, factors, context, timestamp:Date.now() };

    if (regionGrid && regions.some(item => item.price != null || item.pct != null)) {
        regionGrid.innerHTML = regions.map((item, index) => {
            const color = item.pct == null ? '#94a3b8' : item.pct >= 0 ? '#059669' : '#dc2626';
            const pct = item.pct == null ? 'Dato pendiente' : `${item.pct >= 0 ? '+' : ''}${item.pct.toFixed(2)}%`;
            // La clase is-up / is-down permite dar al porcentaje un tono con contraste
            // suficiente sobre fondo claro; --eq-color queda para el filete decorativo.
            const tone = item.pct == null ? 'is-flat' : item.pct >= 0 ? 'is-up' : 'is-down';
            return `<div class="eq-region-card report-card ${tone}" style="--eq-color:${color}" role="button" tabindex="0" title="Abrir reporte de ${item.label}" onclick="openEquityInstitutionalReport('regions',${index})" onkeydown="reportCardKey(event,()=>openEquityInstitutionalReport('regions',${index}))"><small>${item.flag} ${item.label} · ${item.region}</small><strong>${equityFormatPrice(item.price)}</strong><span>${pct}</span></div>`;
        }).join('');
    }

    const spyPct = factors.find(f => f.ticker === 'SPY')?.pct ?? regions.find(r => r.ticker === '^GSPC')?.pct ?? null;
    const relatives = factors.map((f,index) => ({ ...f, _reportIndex:index, relative:f.pct != null && spyPct != null ? f.pct - spyPct : null }));
    if (relatives.some(item => item.price != null || item.pct != null)) {
        _equityFactorRows = relatives;
        syncFactorView();
        renderEquityFactorView();
    }

    const availableRegions = regions.filter(r => r.pct != null);
    const positiveRegions = availableRegions.filter(r => r.pct >= 0).length;
    const breadth = availableRegions.length ? Math.round(positiveRegions/availableRegions.length*100) : null;
    const sp500 = regions.find(r => r.ticker === '^GSPC');
    const nasdaq = regions.find(r => r.ticker === '^IXIC');
    const ipc = regions.find(r => r.ticker === '^MXX');
    const qqqRel = relatives.find(f => f.ticker === 'QQQ')?.relative ?? null;
    const rspRel = relatives.find(f => f.ticker === 'RSP')?.relative ?? null;
    const iwmRel = relatives.find(f => f.ticker === 'IWM')?.relative ?? null;
    const vix = _rds.vix ?? null;

    equitySetValue('eq-sp500',equityFormatPrice(sp500?.price)); equitySetChange('eq-sp500-pct',sp500?.pct,'Mercado amplio EUA');
    equitySetValue('eq-nasdaq',equityFormatPrice(nasdaq?.price)); equitySetChange('eq-nasdaq-pct',nasdaq?.pct,'Tecnología y crecimiento');
    equitySetValue('eq-ipc',equityFormatPrice(ipc?.price)); equitySetChange('eq-ipc-pct',ipc?.pct,'Renta variable local');
    equitySetValue('eq-vix',vix != null ? (+vix).toFixed(1) : '—');
    equitySetValue('eq-vix-state',vix == null ? 'Régimen pendiente' : vix < 15 ? 'Calma · riesgo complaciente' : vix < 25 ? 'Volatilidad moderada' : 'Estrés elevado');
    equitySetValue('eq-breadth',breadth == null ? '—' : breadth+'%');
    equitySetValue('eq-breadth-note',breadth == null ? 'Esperando índices' : `${positiveRegions} de ${availableRegions.length} índices positivos`);

    let score = 50;
    if (sp500?.pct != null) score += sp500.pct >= 0 ? 10 : -10;
    if (breadth != null) score += breadth >= 67 ? 15 : breadth < 45 ? -15 : 0;
    if (vix != null) score += vix < 18 ? 12 : vix > 25 ? -18 : 0;
    if (rspRel != null) score += rspRel >= 0 ? 8 : -6;
    if (iwmRel != null) score += iwmRel >= 0 ? 5 : -4;
    score = Math.max(0,Math.min(100,Math.round(score)));
    const regime = score >= 72 ? 'Apetito por riesgo amplio' : score >= 58 ? 'Apetito por riesgo selectivo' : score >= 42 ? 'Mercado neutral / en rotación' : score >= 28 ? 'Postura defensiva' : 'Estrés de mercado';
    const regimeDesc = score >= 72 ? 'Tendencia y participación confirman apetito por riesgo.' : score >= 58 ? 'Índices firmes, pero el liderazgo permanece concentrado.' : score >= 42 ? 'Señales mixtas; priorizar selectividad y control de exposición.' : 'Volatilidad y amplitud aconsejan una postura más defensiva.';
    equitySetValue('eq-regime',regime); equitySetValue('eq-regime-note',`Puntuación ${score}/100`);
    equitySetValue('eq-score',String(score)); equitySetValue('eq-score-label',regime); equitySetValue('eq-score-desc',regimeDesc);
    const ring = document.getElementById('eq-score-ring'); if (ring) ring.style.setProperty('--eq-score',score);

    const setSignal = (id,value) => { const el=document.getElementById(id); if(!el)return; el.textContent=value.text; el.className=value.up?'up':'down'; };
    setSignal('eq-signal-breadth',{text:breadth == null?'—':`${breadth}% positivo`,up:(breadth??0)>=55});
    setSignal('eq-signal-tech',{text:qqqRel == null?'—':`${qqqRel>=0?'+':''}${qqqRel.toFixed(2)} pp`,up:(qqqRel??-1)>=0});
    setSignal('eq-signal-equal',{text:rspRel == null?'—':`${rspRel>=0?'+':''}${rspRel.toFixed(2)} pp`,up:(rspRel??-1)>=0});
    setSignal('eq-signal-small',{text:iwmRel == null?'—':`${iwmRel>=0?'+':''}${iwmRel.toFixed(2)} pp`,up:(iwmRel??-1)>=0});

    if (_rds.tnx != null) equitySetValue('eq-ctx-tnx',(+_rds.tnx).toFixed(2)+'%');
    if (_rds.dxy != null) equitySetValue('eq-ctx-dxy',(+_rds.dxy).toFixed(2));
    if (vix != null) equitySetValue('eq-ctx-vix',(+vix).toFixed(1));
    if (_rds.gold != null) equitySetValue('eq-ctx-gold','$'+equityFormatPrice(+_rds.gold));
    equitySetValue('eq-ctx-fed',CENTRAL_BANKS.fed.toFixed(2)+'%');
    if (_rds.tiie != null) {
        equitySetValue('eq-ctx-tiie',(+_rds.tiie).toFixed(2)+'%');
        const carry = +_rds.tiie - CENTRAL_BANKS.fed;
        equitySetValue('eq-ctx-carry',(carry >= 0 ? '+' : '')+carry.toFixed(2)+' pp');
    }
    if (breadth != null) equitySetValue('eq-ctx-breadth',breadth+'%');

    const ranked = availableRegions.sort((a,b) => b.pct-a.pct);
    const leader = ranked[0], laggard = ranked[ranked.length-1];
    equitySetValue('eq-thesis-title',`${regime}: ${leader ? leader.label+' lidera la sesión' : 'mercado en evaluación'}`);
    equitySetValue('eq-thesis-text',leader && laggard
        ? `La amplitud global se ubica en ${breadth}% y ${leader.label} encabeza con ${leader.pct>=0?'+':''}${leader.pct.toFixed(2)}%, mientras ${laggard.label} registra ${laggard.pct>=0?'+':''}${laggard.pct.toFixed(2)}%. ${rspRel != null && rspRel < 0 ? 'La ponderación equitativa rezaga al S&P 500, señal de concentración.' : 'La participación fuera de mega-capitalización acompaña al índice.'} ${vix != null ? 'VIX en '+(+vix).toFixed(1)+'.' : ''}`
        : 'La tesis se completará cuando estén disponibles los índices regionales y factores de estilo.');
    equitySetValue('eq-updated','Actualizado '+new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})+' · '+availableRegions.length+' índices · '+factors.filter(f=>f.pct!=null).length+' factores');
    updateEquitySectorSnapshot();
}

var FIN_SECTION_INFO = {
    mexico:   { title:'Mercado Cambiario Internacional', message:'Forex, DXY, carry mexicano, tasas y contexto local.' },
    mercados: { title:'Renta Variable Global', message:'S&P 500, Nasdaq, IPC, sectores y movimientos de capital.' },
    bonos:    { title:'Deuda & Bonos Soberanos', message:'Treasury, curva de rendimientos, TIIE y bancos centrales.' },
    riesgo:   { title:'Commodities, Energía & Macro', message:'WTI, Brent, gas, oro, volatilidad y riesgo crediticio.' },
};
var _finSectionLoadedAt = {};
var _refreshAllPromise = null;

function setFinanceSectionStatus(name, state, customMessage) {
    const bar = document.getElementById('fin-section-status');
    if (!bar) return;
    if (!name || name === 'general') { bar.hidden = true; bar.dataset.section = ''; return; }
    const info = FIN_SECTION_INFO[name] || { title:'Información financiera', message:'' };
    /* Divisas prescinde de esta barra: su propia cabecera ya identifica la
       sección. Se conserva dataset.section para que el refresco siga sabiendo
       qué cargar aunque la barra no se vea. */
    bar.hidden = document.body.classList.contains('ff-detail-divisas');
    bar.dataset.section = name;
    bar.className = 'fin-section-status ' + state;
    const title = document.getElementById('fin-section-status-title');
    const message = document.getElementById('fin-section-status-message');
    const time = document.getElementById('fin-section-status-time');
    const icon = bar.querySelector('.fin-section-status-icon i');
    if (title) title.textContent = info.title;
    if (message) message.textContent = customMessage || (state === 'loading' ? 'Actualizando: ' + info.message : info.message);
    if (time) time.textContent = state === 'loading' ? 'Consultando fuentes…' : 'Actualizado ' + new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
    if (icon) icon.className = state === 'loading' ? 'fas fa-arrows-rotate' : state === 'partial' ? 'fas fa-triangle-exclamation' : 'fas fa-circle-check';
}

function financeSectionQuality(name) {
    const ids = {
        mexico:   ['hub-usdmxn','hub-eurmxn','hub-dxy','hub-tiie'],
        mercados: ['hub-sp500','hub-nasdaq','hub-ipc','hub-vix'],
        bonos:    ['hub-bnd-tnx','hub-fed','hub-tiie','hub-bnd-premium'],
        riesgo:   ['hub-commodity-wti','hub-commodity-brent','hub-commodity-gas','hub-gold'],
    }[name] || [];
    return ids.reduce((count,id) => {
        const value = document.getElementById(id)?.textContent?.trim();
        return count + (value && value !== '—' && value !== '--' ? 1 : 0);
    }, 0);
}

function finishFinanceSectionStatus(name) {
    const quality = financeSectionQuality(name);
    if (quality >= 2) {
        setFinanceSectionStatus(name, 'ready');
    } else {
        setFinanceSectionStatus(name, 'partial', 'Algunas fuentes están tardando; se muestran los últimos datos disponibles y puedes volver a actualizar.');
    }
}

async function refreshAll() {
    if (_refreshAllPromise) return _refreshAllPromise;
    const activeName = document.querySelector('.fin-tab-card.active')?.dataset?.tab;
    if (activeName && activeName !== 'general') setFinanceSectionStatus(activeName, 'loading');

    const run = (async () => {
        // El mapa global, los factores y el contexto transversal arrancan en
        // la primera fase para que no dependan de noticias u otras fuentes lentas.
        await Promise.allSettled([
            cargarFinanzas(), loadMktCap(), loadBonds(), loadRiskPanel(),
            loadPetroleo(), loadFxStrip(), loadEquityInstitutional(),
        ]);
        updateGeneralKPIs();

        // Después completa análisis secundarios y noticias para evitar paneles a medias.
        await Promise.allSettled([
            updateTicker(), loadMarketForecasts(), loadTopMovers(), loadEmergingFX(),
            loadCreditRisk(), loadBolsaNews(), loadMacroMexico(), loadBitcoinDominance(),
        ]);
        updateGeneralKPIs();
        const now = Date.now();
        Object.keys(FIN_SECTION_INFO).forEach(name => { _finSectionLoadedAt[name] = now; });
        if (activeName && activeName !== 'general') finishFinanceSectionStatus(activeName);
    })();

    _refreshAllPromise = run;
    try { return await run; }
    finally { _refreshAllPromise = null; }
}

async function ensureFinanceSection(name, force) {
    if (!name || name === 'general') { setFinanceSectionStatus('general'); return; }
    setFinanceSectionStatus(name, 'loading');

    if (_refreshAllPromise) {
        await _refreshAllPromise;
        finishFinanceSectionStatus(name);
        return;
    }

    const isFresh = Date.now() - (_finSectionLoadedAt[name] || 0) < 2 * 60 * 1000;
    if (!force && isFresh) { if(name==='riesgo') syncEnergyDashboard(); finishFinanceSectionStatus(name); return; }

    const criticalLoaders = {
        mexico:   [loadFxStrip, cargarFinanzas],
        mercados: [loadEquityInstitutional, loadMktCap],
        bonos:    [loadBonds, loadRiskPanel],
        riesgo:   [loadPetroleo, loadRiskPanel],
    }[name] || [];
    const secondaryLoaders = {
        mexico:   [loadMacroMexico, loadEmergingFX, loadRiskPanel],
        mercados: [loadBolsaNews, loadTopMovers, loadBitcoinDominance],
        bonos:    [loadMarketForecasts],
        riesgo:   [loadCreditRisk, loadMacroMexico],
    }[name] || [];
    await Promise.allSettled(criticalLoaders.map(load => load()));
    updateGeneralKPIs();
    if(name==='riesgo') syncEnergyDashboard();
    _finSectionLoadedAt[name] = Date.now();
    finishFinanceSectionStatus(name);
    setTimeout(() => {
        Promise.allSettled(secondaryLoaders.map(load => load())).then(() => { updateGeneralKPIs(); if(name==='riesgo') syncEnergyDashboard(); });
    }, 80);
}

function refreshCurrentFinanceSection() {
    const name = document.getElementById('fin-section-status')?.dataset?.section;
    if (name) ensureFinanceSection(name, true).catch(e => console.error('section refresh:', e));
}

function openFinanceSection(name) {
    const tabButton = document.querySelector(`.fin-tab-card[data-tab="${name}"]`);
    finTab(name, tabButton);
}



function updateGeneralKPIs() {
    try {
        const safe = (v, s) => (v != null && !isNaN(+v)) ? (+v).toFixed(2) + (s || '') : '—';
        const g = id => document.getElementById(id);
        const set = (id, value) => { const el = g(id); if (el && value != null) el.textContent = value; };
        const marketNumber = (v, digits = 2, currency = false) => {
            if (v == null || isNaN(+v)) return '—';
            const n = +v;
            const text = n.toLocaleString('es-MX', { minimumFractionDigits: digits, maximumFractionDigits: digits });
            return (currency ? '$' : '') + text;
        };
        const setDelta = (id, pct, fallback) => {
            const el = g(id); if (!el) return;
            if (pct == null || isNaN(+pct)) { el.textContent = fallback || 'Variación no disponible'; el.className = 'hub-m-delta'; return; }
            const n = +pct;
            el.textContent = (n >= 0 ? '▲ +' : '▼ ') + Math.abs(n).toFixed(2) + '% hoy';
            el.className = 'hub-m-delta ' + (n >= 0 ? 'up' : 'down');
        };
        const setInsight = (id, tone, text) => {
            const el = g(id); if (!el || !text) return;
            el.className = 'hub-insight ' + (tone || 'neutral');
            const span = el.querySelector('span');
            if (span) span.textContent = text;
        };

        // Tasas y riesgo compartidos por varias tarjetas.
        if (g('hub-tiie')) g('hub-tiie').textContent = safe(_rds.tiie, '%');
        if (g('hub-vix'))  g('hub-vix').textContent  = _rds.vix != null ? (+_rds.vix).toFixed(1) : '—';
        if (g('hub-fed'))  g('hub-fed').textContent  = safe(CENTRAL_BANKS.fed, '%');
        if (g('hub-bce'))  g('hub-bce').textContent  = safe(CENTRAL_BANKS.bce, '%');
        if (g('hub-boe'))  g('hub-boe').textContent  = safe(CENTRAL_BANKS.boe, '%');

        // Mercado cambiario: reutiliza la tira Forex y el índice DXY.
        const usdFx = _fxData?.[0] || null;
        const eurFx = _fxData?.[1] || null;
        const usdMxnPrice = usdFx?.price ?? _rds.fx?.usdmxn ?? null;
        const eurMxnPrice = eurFx?.price ?? _rds.fx?.eurmxn ?? null;
        if (usdMxnPrice != null) {
            const usdmxn = marketNumber(usdMxnPrice, 2, true);
            if (g('hub-usdmxn'))     g('hub-usdmxn').textContent     = usdmxn;
            if (g('hub-hdr-usdmxn')) g('hub-hdr-usdmxn').textContent = usdmxn;
        }
        set('hub-eurmxn', marketNumber(eurMxnPrice, 2, true));
        set('hub-dxy', marketNumber(_rds.dxy, 2));
        setDelta('hub-usdmxn-pct', usdFx?.pct, 'Mercado spot');
        setDelta('hub-eurmxn-pct', eurFx?.pct, 'Cruce europeo');
        setDelta('hub-dxy-pct', _rds.dxyPct, 'Índice dólar');
        if (_rds.dxy != null) set('hub-detail-dxy', (+_rds.dxy > 105 ? 'Dólar muy fuerte' : +_rds.dxy > 100 ? 'Dólar firme' : 'Dólar moderado') + ` · ${(+_rds.dxy).toFixed(2)} pts`);
        if (usdMxnPrice != null) {
            const mxnMove = usdFx?.pct == null ? 'En observación' : (+usdFx.pct > 0 ? 'Peso se deprecia' : +usdFx.pct < 0 ? 'Peso se aprecia' : 'Peso estable');
            set('hub-detail-mxn', `${mxnMove} · ${marketNumber(usdMxnPrice, 2, true)}`);
        }
        if (_rds.tiie != null) {
            const carry = (+_rds.tiie - CENTRAL_BANKS.fed);
            set('hub-fx-carry', (carry >= 0 ? '+' : '') + carry.toFixed(2) + ' pp');
            set('hub-detail-carry', `${carry >= 0 ? 'Prima favorable' : 'Prima negativa'} · ${carry.toFixed(2)} pp`);
            const dxyText = _rds.dxy == null ? 'DXY pendiente' : (+_rds.dxy > 105 ? 'dólar global fuerte' : +_rds.dxy > 100 ? 'dólar global firme' : 'dólar global moderado');
            const pesoText = usdFx?.pct == null ? 'peso en monitoreo' : (+usdFx.pct > 0 ? 'presión sobre el peso' : 'fortaleza del peso');
            setInsight('hub-fx-insight', +usdFx?.pct <= 0 ? 'positive' : 'warning', `Carry mexicano de ${carry.toFixed(2)} pp; ${dxyText} y ${pesoText}.`);
        }

        // Renta variable: índices globales, bolsa mexicana y volatilidad.
        set('hub-sp500', marketNumber(_rds.sp500, 2));
        set('hub-nasdaq', marketNumber(_rds.nasdaq, 2));
        set('hub-ipc', marketNumber(_rds.ipc, 0));
        setDelta('hub-sp500-pct', _rds.sp500Pct, 'Sesión');
        setDelta('hub-nasdaq-pct', _rds.nasdaqPct, 'Tecnología');
        setDelta('hub-ipc-pct', _rds.ipcPct, 'México');
        if (_rds.sp500Pct != null) set('hub-detail-sp500', `${+_rds.sp500Pct >= 0 ? 'Avance' : 'Retroceso'} de ${Math.abs(+_rds.sp500Pct).toFixed(2)}%`);
        if (_rds.nasdaqPct != null) {
            const techLead = _rds.sp500Pct == null ? +_rds.nasdaqPct : (+_rds.nasdaqPct - +_rds.sp500Pct);
            set('hub-detail-tech', `${techLead >= 0 ? 'Tecnología lidera' : 'Tecnología rezagada'} · ${techLead >= 0 ? '+' : ''}${techLead.toFixed(2)} pp`);
        }
        if (_rds.vix != null) {
            const vix = +_rds.vix;
            const vixLevel = vix < 15 ? 'Calma · risk-on' : vix < 25 ? 'Volatilidad moderada' : 'Estrés elevado';
            const vixEl = g('hub-vix-level');
            if (vixEl) { vixEl.textContent = vixLevel; vixEl.className = 'hub-m-delta ' + (vix < 15 ? 'up' : vix < 25 ? '' : 'down'); }
            set('hub-detail-vix', `${vixLevel} · ${vix.toFixed(1)} pts`);
            if (_rds.sp500Pct != null) {
                const up = +_rds.sp500Pct >= 0;
                const tone = vix >= 25 ? 'danger' : up ? 'positive' : 'warning';
                const context = vix >= 25 ? 'aversión al riesgo y volatilidad elevada' : up ? 'sesgo comprador con volatilidad contenida' : 'toma de utilidades con riesgo aún controlado';
                setInsight('hub-equity-insight', tone, `S&P 500 ${up ? 'avanza' : 'retrocede'} ${Math.abs(+_rds.sp500Pct).toFixed(2)}%; ${context}.`);
            }
        }
        if (g('hub-hdr-vix') && _rds.vix != null) {
            g('hub-hdr-vix').textContent = (+_rds.vix).toFixed(1);
        }
        if (g('hub-hdr-fed')) {
            g('hub-hdr-fed').textContent = CENTRAL_BANKS.fed.toFixed(2) + '%';
        }
        // Energía y commodities: precio, variación y spread entre crudos.
        const wtiEl = g('p-wti');
        if (g('hub-wti') && wtiEl && wtiEl.textContent !== '--') {
            g('hub-wti').textContent = wtiEl.textContent;
        }
        set('hub-commodity-wti', marketNumber(_rds.wti, 2, true));
        set('hub-commodity-brent', marketNumber(_rds.brent, 2, true));
        set('hub-commodity-gas', marketNumber(_rds.gas, 2, true));
        set('hub-gold', marketNumber(_rds.gold, 2, true));
        setDelta('hub-wti-pct', _rds.wtiPct, 'Crudo EUA');
        setDelta('hub-brent-pct', _rds.brentPct, 'Referencia global');
        setDelta('hub-gas-pct', _rds.gasPct, 'Henry Hub');
        setDelta('hub-gold-pct', _rds.goldPct, 'Activo refugio');
        if (_rds.wti != null && _rds.brent != null) {
            const oilSpread = (+_rds.brent - +_rds.wti);
            const energyTone = +_rds.wtiPct > 1 ? 'warning' : +_rds.wtiPct < -1 ? 'positive' : 'neutral';
            const oilMove = _rds.wtiPct == null ? 'estable' : (+_rds.wtiPct >= 0 ? 'al alza' : 'a la baja');
            setInsight('hub-energy-insight', energyTone, `WTI ${oilMove}; Brent mantiene una prima de $${oilSpread.toFixed(2)} por barril. Oro ${+(_rds.goldPct || 0) >= 0 ? 'firme' : 'cede'}.`);
            set('hub-detail-oil-spread', `Brent sobre WTI · $${oilSpread.toFixed(2)}`);
            const energyPct = _rds.wtiPct == null ? 0 : +_rds.wtiPct;
            set('hub-detail-energy', `${energyPct > 1 ? 'Presión alcista' : energyPct < -1 ? 'Presión bajista' : 'Mercado equilibrado'} · ${energyPct >= 0 ? '+' : ''}${energyPct.toFixed(2)}%`);
        }
        if (_rds.gold != null) set('hub-detail-gold', `${+(_rds.goldPct || 0) >= 0 ? 'Demanda firme' : 'Demanda cede'} · ${marketNumber(_rds.gold, 2, true)}`);

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
            set('hub-detail-us10y', `${+tnxVal > 4.5 ? 'Costo elevado' : 'Costo moderado'} · ${(+tnxVal).toFixed(2)}%`);
        }
        set('hub-detail-fed', `${CENTRAL_BANKS.fed >= 4.5 ? 'Postura restrictiva' : 'Postura en normalización'} · ${CENTRAL_BANKS.fed.toFixed(2)}%`);
        if (g('hub-bnd-premium') && _rds.tiie != null) {
            const ref  = tnxVal ?? CENTRAL_BANKS.fed;
            const prem = (+_rds.tiie - ref);
            g('hub-bnd-premium').textContent = (prem >= 0 ? '+' : '') + prem.toFixed(2) + ' pp';
            set('hub-detail-premium', `${prem >= 0 ? 'Prima positiva' : 'Prima negativa'} · ${prem.toFixed(2)} pp`);
            const tone = tnxVal != null && +tnxVal > 4.5 ? 'warning' : 'neutral';
            const rateText = tnxVal == null ? 'Treasury 10Y pendiente' : `Treasury 10Y en ${(+tnxVal).toFixed(2)}%`;
            setInsight('hub-bonds-insight', tone, `${rateText}; México ofrece una prima aproximada de ${prem.toFixed(2)} pp frente a la referencia.`);
        }
        renderFxProfessionalDashboard(_fxData || []);
    } catch(e) { console.warn('updateGeneralKPIs:', e); }
}



function restoreEquityLayout() {
    const anchor = document.getElementById('bvmx-panel-anchor');
    const chartPanel = document.getElementById('bvmx-panel');
    // Antes el panel de watchlist se intercalaba entre el ancla y la gráfica;
    // retirado ese panel, la gráfica va directamente después del ancla.
    if (anchor && chartPanel) anchor.after(chartPanel);
}

function finTab(name, btnEl, skipLoad, skipScroll) {
    document.querySelectorAll('.fin-tab-card').forEach(b => b.classList.remove('active'));
    const activeBtn = btnEl || document.querySelector(`.fin-tab-card[data-tab="${name}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    document.body.classList.toggle('equity-mode', name === 'mercados');
    document.body.classList.toggle('energy-mode', name === 'riesgo');
    if (name !== 'mercados') restoreEquityLayout();

    // Navegación principal: la portada muestra los recuadros y cada selección
    // abre el panel completo que utilizaban los apartados anteriores.
    const tabNav = document.querySelector('.fin-tabs-nav');
    if (tabNav) tabNav.style.display = '';

    const g  = id => document.getElementById(id);
    const bg = g('fin-bottom-grid');

    // Reset: hide all content blocks
    ['fin-layout-wrap','fx-pro-panel','news-pro-panel','bvmx-panel','bolsa-news-panel','bonds-panel'].forEach(id => {
        const el = g(id); if (el) el.style.display = 'none';
    });
    const pg = g('pane-general'); if (pg) pg.style.display = '';
    /* Hide/show the Favro overview shell and hub sections (not the whole pane) */
    const favroShell = g('favro-finance');
    if (favroShell) favroShell.style.display = name === 'general' ? '' : 'none';
    document.querySelectorAll('.hub-hero, .hub-grid, .fin-exec-strip').forEach(el => {
        el.style.display = name === 'general' ? '' : 'none';
    });

    if (bg) { bg.style.display = 'none'; bg.classList.remove('only-left','only-right'); }

    // Reset all bottom-grid inner panels to visible (tab logic will re-hide as needed)
    ['petroleo-panel','mkt-cap-panel','fx-emerging-panel','reservas-panel','risk-panel','credit-panel','movers-panel'].forEach(id => {
        const el = g(id); if (el) el.style.display = '';
    });

    if (name === 'general') {
        updateGeneralKPIs();

    } else if (name === 'mexico') {
        const fxPanel = g('fx-pro-panel'); if (fxPanel) fxPanel.style.display = '';
        if (bg) bg.style.display = 'none';
        renderFxProfessionalDashboard(_fxData || []);
        loadFxHistoricalLab();
        requestAnimationFrame(() => { if (_fxEmergingChart) _fxEmergingChart.resize(); });

    } else if (name === 'mercados') {
        const marketLayout = g('fin-layout-wrap'); if (marketLayout) marketLayout.style.display = '';
        ['bvmx-panel','bolsa-news-panel'].forEach(id => {
            const el = g(id); if (el) el.style.display = '';
        });
        if (bg) bg.style.display = 'none';
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));

    } else if (name === 'bonos') {
        const bondsPanel = g('bonds-panel'); if (bondsPanel) bondsPanel.style.display = '';
        if (bg) bg.style.display = 'none';
        requestAnimationFrame(() => {
            if (_bondsCurveChart) _bondsCurveChart.resize();
        });

    } else if (name === 'noticias') {
        const newsPanel = g('news-pro-panel'); if (newsPanel) newsPanel.style.display = '';
        if (bg) bg.style.display = 'none';
        if (typeof ensureNewsSection === 'function') ensureNewsSection(); const cal = g('calendar-panel-main'); if (newsPanel && cal) { cal.style.display = 'block'; cal.style.marginBottom = '2rem'; newsPanel.prepend(cal); }
    }

    try { localStorage.setItem('fin_active_tab', name); } catch(e) {}
    if (name === 'general') setFinanceSectionStatus('general');
    else if (!skipLoad) ensureFinanceSection(name, false).catch(e => {
        console.error('ensureFinanceSection:', e);
        setFinanceSectionStatus(name, 'partial', 'No se completó la actualización. Se conservan los últimos datos disponibles.');
    });
    const sectionTargets = {
        general:   'pane-general',
        mexico:    'fx-pro-panel',
        mercados:  'bvmx-panel-anchor',
        bonos:     'bonds-panel',
        noticias:  'news-pro-panel',
    };
    const destination = g(sectionTargets[name]);
    if (destination && !skipScroll) requestAnimationFrame(() => destination.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

(async () => {
    // Abrir siempre en la portada ejecutiva para mostrar los cuatro recuadros.
    try { localStorage.removeItem('fin_active_tab'); } catch(e) {}
    const requestedTab = new URLSearchParams(window.location.search).get('section');
    const startTab = ['general','mexico','mercados','bonos','noticias'].includes(requestedTab) ? requestedTab : 'general';
    finTab(startTab, document.querySelector(`.fin-tab-card[data-tab="${startTab}"]`), true);
    initCalendarSurprise();
    updateGeneralKPIs();

    // Permitir que el navegador pinte la información incluida en el HTML antes
    // de iniciar red. Solo se carga la sección visible; el resto espera al clic.
    setTimeout(() => {
        if (startTab === 'general') {
            Promise.allSettled([cargarFinanzas(), loadFxStrip(), loadBonds(), loadPetroleo(), updateTicker()])
                .then(() => { updateGeneralKPIs(); });
        } else {
            ensureFinanceSection(startTab, false).catch(e => console.error('initial section:', e));
        }
    }, 120);

    _vnFinIntervalo(refreshAll, 15 * 60 * 1000);
    _vnFinIntervalo(() => VDS.clear(FIN_CK), REFRESH_MS);
    _vnFinIntervalo(updateGeneralKPIs, 5 * 60 * 1000);
})();


/* ── Fin del código extraído ─────────────────────────────────────────────── */

function _vnFinDesmontar() {
    var pendientes = _vnFinLimpieza;
    _vnFinLimpieza = [];
    pendientes.forEach(function (soltar) {
        try { soltar(); } catch (e) { /* el nodo ya no existe */ }
    });
    /* El carrusel de noticias guarda su intervalo aparte. */
    if (typeof _ncTimer !== 'undefined' && _ncTimer) { clearInterval(_ncTimer); _ncTimer = null; }
    if (_fxHistoryChart) { _fxHistoryChart.destroy(); _fxHistoryChart = null; }
    if (_fxOverviewChart) { _fxOverviewChart.destroy(); _fxOverviewChart = null; }

    /* Se retira la marca para que desde fuera se note que la sección ya no está
       montada; si no, quedaría un VNFinanzas vivo apuntando a nada. Es lo mismo
       que hace finanzas-favro.js. La comparación evita que el desmontaje del
       montaje anterior borre la marca del que acaba de instalarse. */
    if (window.VNFinanzas && window.VNFinanzas.desmontar === _vnFinDesmontar) delete window.VNFinanzas;
}

window.VNFinanzas = { desmontar: _vnFinDesmontar };
