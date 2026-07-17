'use strict';

// ── <vn-chart-card> ──────────────────────────────────────────────────────────
// Contenedor de gráfico reutilizable, estandarizado en LightweightCharts.
// Estética "Liquid Glass" alineada a inicio.html: consume los tokens --clr-* y
// --font-* de css/base.css (glassmorphism + modo oscuro por [data-theme]).
// Si esos tokens no existen, usa fallbacks claros para funcionar aislado.
//
// Atributos:
//   card-title   → etiqueta de la cabecera
//   height       → alto del área de gráfico en px (default 320)
//   chart-type   → 'candlestick' (default) | 'line' | 'area' | 'bar'
// Slots:
//   [slot="actions"] → zona de la cabecera para controles
// Métodos:
//   setData(points) · setMeta({name,price,pct,high,low,currency}) · setState(state,msg)
//
// Requiere window.LightweightCharts en la página anfitriona.

const VN_CHART_STYLE = `
  :host {
    --s:      var(--clr-surface, linear-gradient(135deg, rgba(255,255,255,.6), rgba(255,255,255,.25)));
    --plot:   var(--clr-bg, #ffffff);
    --ink:    var(--clr-primary, #00213a);
    --ink-main: var(--clr-text-main, #0f172a);
    --mut:    var(--clr-text-mut, #64748b);
    --acc:    var(--clr-accent, #2563eb);
    --up:     var(--clr-success, #10b981);
    --dn:     var(--clr-danger, #ef4444);
    --bd:     var(--bdr-soft, rgba(0,33,58,.08));
    --bd2:    var(--bdr-hard, rgba(0,33,58,.10));
    --sh:     var(--shadow-md, 0 12px 32px rgba(0,33,58,.06));
    --mono:   var(--font-mono, 'JetBrains Mono', monospace);
    --sans:   var(--font-sans, 'Inter', system-ui, sans-serif);
    display: block;
    font-family: var(--sans);
  }
  .card {
    position: relative;
    background: var(--s);
    backdrop-filter: blur(32px) saturate(180%);
    -webkit-backdrop-filter: blur(32px) saturate(180%);
    border: 1px solid color-mix(in srgb, var(--acc) 13%, var(--bd));
    border-radius: 22px;
    box-shadow: 0 22px 50px rgba(15,23,42,.08), 0 4px 14px rgba(15,23,42,.04), inset 0 1px 1px rgba(255,255,255,.34);
    overflow: hidden;
  }
  .card::before {
    content: ''; position: absolute; z-index: 2; left: 0; top: 0; bottom: 0; width: 3px;
    background: linear-gradient(180deg, var(--acc), color-mix(in srgb, var(--up) 78%, var(--acc)));
    opacity: .88; pointer-events: none;
  }
  .head {
    position: relative;
    display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
    padding: 1rem 1.15rem 1rem 1.3rem;
    border-bottom: 1px solid var(--bd);
    background:
      radial-gradient(circle at 88% -20%, color-mix(in srgb, var(--acc) 10%, transparent), transparent 42%),
      linear-gradient(135deg, rgba(255,255,255,.24), transparent 68%);
  }
  .titles { display: flex; flex-direction: column; gap: .15rem; min-width: 0; }
  .title { font-size: 1rem; font-weight: 800; color: var(--ink); letter-spacing: -.025em; }
  .sub   { font-family: var(--mono); font-size: .72rem; color: var(--mut);
           font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .readout { display: flex; align-items: baseline; gap: .55rem; margin-left: auto; }
  .price { font-family: var(--mono); font-size: 1.42rem; font-weight: 850; color: var(--ink);
           font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
  .pct { font-family: var(--mono); font-size: .78rem; font-weight: 700;
         font-variant-numeric: tabular-nums; padding: .12rem .45rem; border-radius: 999px; }
  .pct.up   { color: var(--up); background: color-mix(in srgb, var(--up) 14%, transparent); }
  .pct.down { color: var(--dn); background: color-mix(in srgb, var(--dn) 14%, transparent); }
  .actions { display: flex; align-items: center; justify-content: flex-end; gap: .5rem; }
  .actions:empty { display: none; }
  .plot-wrap {
    position: relative;
    background:
      radial-gradient(circle at 10% 8%, color-mix(in srgb, var(--acc) 6%, transparent), transparent 34%),
      linear-gradient(180deg, color-mix(in srgb, var(--plot) 96%, var(--acc)), var(--plot));
  }
  .plot-wrap::after {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    box-shadow: inset 0 1px rgba(255,255,255,.34), inset 0 -18px 40px rgba(15,23,42,.018);
  }
  .plot { width: 100%; }
  .overlay {
    position: absolute; inset: 0; display: none;
    align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--plot) 80%, transparent);
    color: var(--mut); font-size: .85rem; text-align: center; padding: 1rem;
  }
  :host([data-state="loading"]) .overlay,
  :host([data-state="error"])   .overlay,
  :host([data-state="empty"])   .overlay { display: flex; }
  :host([data-state="error"]) .overlay { color: var(--dn); }
  .spinner {
    width: 20px; height: 20px; border-radius: 50%;
    border: 2px solid var(--bd2); border-top-color: var(--acc);
    animation: vn-spin .8s linear infinite; margin-right: .5rem;
  }
  @keyframes vn-spin { to { transform: rotate(360deg); } }
  @media (max-width: 680px) {
    .card { border-radius: 17px; }
    .head { gap: .65rem; padding: .85rem .9rem .85rem 1rem; }
    .price { font-size: 1.18rem; }
    .actions { flex-basis: 100%; }
  }
`;

class VnChartCard extends HTMLElement {
    static get observedAttributes() { return ['card-title', 'height', 'chart-type']; }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._chart = null;
        this._series = null;
        this._ro = null;
        this._lastPoints = null;
    }

    connectedCallback() {
        if (!this._built) this._build();
        this._initChart();
    }
    disconnectedCallback() {
        this._ro?.disconnect();
        try { this._chart?.remove(); } catch {}
        this._chart = this._series = null;
        this._overlays = null;
        this._volumeSeries = null;
    }

    // Series auxiliares (p.ej. medias móviles) superpuestas a la serie principal.
    // id identifica cada overlay para poder actualizarlo o quitarlo por separado.
    setOverlay(id, points, opts = {}) {
        this._initChart();
        if (!this._chart) return;
        if (!this._overlays) this._overlays = new Map();
        let series = this._overlays.get(id);
        if (!series) {
            series = this._chart.addLineSeries({
                color: opts.color || '#f59e0b',
                lineWidth: opts.lineWidth || 1.5,
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: false,
            });
            this._overlays.set(id, series);
        }
        series.setData(points || []);
    }

    clearOverlay(id) {
        if (!this._overlays?.has(id)) return;
        try { this._chart.removeSeries(this._overlays.get(id)); } catch {}
        this._overlays.delete(id);
    }

    // Histograma de volumen anclado al 18% inferior del panel, en su propia
    // escala de precio para no interferir con la escala de la serie principal.
    setVolume(points) {
        this._initChart();
        if (!this._chart) return;
        if (!this._volumeSeries) {
            this._volumeSeries = this._chart.addHistogramSeries({
                priceFormat: { type: 'volume' },
                priceScaleId: 'vn-volume',
            });
            this._volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        }
        this._volumeSeries.setData(points || []);
    }
    attributeChangedCallback(name, oldVal, newVal) {
        if (!this._built) return;
        if (name === 'chart-type' && this._chart && oldVal != null && oldVal !== newVal) {
            // Cambiar de velas/línea/área requiere recrear la serie (Lightweight
            // Charts no permite mutar el tipo de una serie existente).
            try { this._chart.removeSeries(this._series); } catch {}
            this._addSeries();
            if (this._lastPoints) this._applyData(this._lastPoints);
            return;
        }
        this._reflectAttrs();
    }

    _build() {
        this.shadowRoot.innerHTML = `
            <style>${VN_CHART_STYLE}</style>
            <div class="card">
              <div class="head">
                <div class="titles">
                  <span class="title"></span>
                  <span class="sub"></span>
                </div>
                <div class="readout">
                  <span class="price"></span>
                  <span class="pct"></span>
                </div>
                <div class="actions"><slot name="actions"></slot></div>
              </div>
              <div class="plot-wrap">
                <div class="plot"></div>
                <div class="overlay"></div>
              </div>
            </div>`;
        this._built = true;
        this._reflectAttrs();
        this.setState('empty', 'Sin datos');
    }

    _reflectAttrs() {
        const t = this.getAttribute('card-title') || '';
        this.shadowRoot.querySelector('.title').textContent = t;
        const h = parseInt(this.getAttribute('height'), 10) || 320;
        this.shadowRoot.querySelector('.plot').style.height = h + 'px';
        this.shadowRoot.querySelector('.overlay').style.height = h + 'px';
    }

    _themeOpts() {
        const cs = getComputedStyle(this);
        const g = (n, fb) => (cs.getPropertyValue(n).trim() || fb);
        return {
            layout: { background: { type: 'solid', color: g('--clr-bg', '#ffffff') }, textColor: g('--clr-text-mut', '#64748b') },
            grid:   { vertLines: { color: g('--bdr-soft', 'rgba(0,33,58,.045)') }, horzLines: { color: g('--bdr-hard', 'rgba(0,33,58,.075)') } },
            rightPriceScale: { borderColor: g('--bdr-hard', 'rgba(0,33,58,.1)') },
            timeScale:       { borderColor: g('--bdr-hard', 'rgba(0,33,58,.1)') },
            crosshair: { mode: window.LightweightCharts.CrosshairMode.Normal },
        };
    }

    _initChart() {
        if (this._chart || !window.LightweightCharts) return;
        const plot = this.shadowRoot.querySelector('.plot');
        const h = parseInt(this.getAttribute('height'), 10) || 320;
        this._chart = window.LightweightCharts.createChart(plot, {
            width: plot.clientWidth || 600, height: h, ...this._themeOpts(),
        });
        this._addSeries();
        this._ro = new ResizeObserver(() => {
            if (plot.clientWidth) this._chart.applyOptions({ width: plot.clientWidth });
        });
        this._ro.observe(plot);
    }

    _addSeries() {
        const cs = getComputedStyle(this);
        const up = (cs.getPropertyValue('--clr-success').trim() || '#10b981');
        const dn = (cs.getPropertyValue('--clr-danger').trim() || '#ef4444');
        const type = (this.getAttribute('chart-type') || 'candlestick').toLowerCase();
        if (type === 'line') {
            this._series = this._chart.addLineSeries({ color: up, lineWidth: 2 });
        } else if (type === 'area') {
            this._series = this._chart.addAreaSeries({ lineColor: up, topColor: up + '55', bottomColor: up + '05', lineWidth: 2 });
        } else if (type === 'bar') {
            this._series = this._chart.addHistogramSeries({
                color: up,
                priceFormat: { type: 'price' },
                priceLineVisible: true,
            });
        } else {
            this._series = this._chart.addCandlestickSeries({
                upColor: up, downColor: dn, borderUpColor: up, borderDownColor: dn,
                wickUpColor: up, wickDownColor: dn,
            });
        }
    }

    setData(points) {
        this._initChart();
        if (!this._series) return;
        if (!points || !points.length) { this.setState('empty', 'Sin datos'); return; }
        this._lastPoints = points; // siempre en forma OHLC, independiente del chart-type activo
        this._applyData(points);
        this.setState('ready');
    }

    // Aplica los puntos a la serie actual, adaptando la forma de los datos:
    // velas usan OHLC completo, línea/área solo necesitan {time, value}.
    _applyData(points) {
        const type = (this.getAttribute('chart-type') || 'candlestick').toLowerCase();
        const data = type === 'candlestick' ? points : points.map(p => ({
            time: p.time,
            value: p.close ?? p.value,
            ...(type === 'bar' ? { color: (p.close ?? p.value) >= (p.open ?? p.close ?? p.value) ? '#10b981' : '#ef4444' } : {}),
        }));
        this._series.setData(data);
        this._chart.timeScale().fitContent();
    }

    setMeta({ name, price, pct, currency, high, low } = {}) {
        const sub = this.shadowRoot.querySelector('.sub');
        const priceEl = this.shadowRoot.querySelector('.price');
        const pctEl = this.shadowRoot.querySelector('.pct');
        if (name != null) {
            const nf = v => Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const parts = [name];
            if (high != null) parts.push(`Máx ${nf(high)}`);
            if (low  != null) parts.push(`Mín ${nf(low)}`);
            if (currency) parts.push(currency);
            sub.textContent = parts.join(' · ');
        }
        priceEl.textContent = price != null
            ? Number(price).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '';
        if (pct != null) {
            const up = pct >= 0;
            pctEl.textContent = (up ? '▲ +' : '▼ ') + Math.abs(pct).toFixed(2) + '%';
            pctEl.className = 'pct ' + (up ? 'up' : 'down');
        } else {
            pctEl.textContent = ''; pctEl.className = 'pct';
        }
    }

    // Fuerza un re-cálculo de tamaño y re-dibujado; necesario cuando el card se
    // creó mientras su contenedor estaba oculto (display:none) y luego se muestra.
    resize() {
        if (!this._chart) return;
        const plot = this.shadowRoot.querySelector('.plot');
        if (plot.clientWidth) this._chart.applyOptions({ width: plot.clientWidth });
        this._chart.timeScale().fitContent();
    }

    setState(state, msg) {
        this.dataset.state = state;
        const ov = this.shadowRoot?.querySelector('.overlay');
        if (!ov) return;
        if (state === 'loading') ov.innerHTML = `<span class="spinner"></span>${msg || 'Cargando…'}`;
        else ov.textContent = msg || '';
    }
}

customElements.define('vn-chart-card', VnChartCard);
