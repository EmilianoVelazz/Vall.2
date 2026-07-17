'use strict';

// ── <vn-data-grid> ───────────────────────────────────────────────────────────
// Rejilla de tiles de métricas (KPIs) reutilizable. Estética "spark-card" de
// inicio.html: glassmorphism, hover lift, número monoespaciado. Consume tokens
// --clr-* / --font-* de css/base.css (glass + modo oscuro por [data-theme]).
// El signo se codifica con FLECHA + color (accesible / daltonismo).
//
//   el.items = [{ label, value, pct, sub, countryCode }, ...]
// Atributos:
//   min-tile        → ancho mínimo de tile en px (default 170)
//   filter-country  → si se define (p.ej. "MX"), solo muestra items de ese país.

const VN_GRID_STYLE = `
  :host {
    --s:    var(--clr-surface, linear-gradient(135deg, rgba(255,255,255,.6), rgba(255,255,255,.25)));
    --ink:  var(--clr-primary, #00213a);
    --mut:  var(--clr-text-mut, #64748b);
    --acc:  var(--clr-accent, #2563eb);
    --up:   var(--clr-success, #10b981);
    --dn:   var(--clr-danger, #ef4444);
    --bd:   var(--bdr-soft, rgba(0,33,58,.08));
    --sh:   var(--shadow-sm, 0 4px 12px rgba(0,33,58,.04));
    --sh2:  var(--shadow-md, 0 12px 32px rgba(0,33,58,.06));
    --mono: var(--font-mono, 'JetBrains Mono', monospace);
    --sans: var(--font-sans, 'Inter', system-ui, sans-serif);
    display: block;
    font-family: var(--sans);
  }
  .grid {
    display: grid; gap: 1rem;
    grid-template-columns: repeat(auto-fill, minmax(var(--min-tile, 170px), 1fr));
  }
  .tile {
    background: var(--s);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid var(--bd);
    border-radius: 18px; padding: 1.05rem 1.1rem;
    box-shadow: var(--sh), inset 0 1px 1px rgba(255,255,255,.25);
    display: flex; flex-direction: column; gap: .4rem;
    transition: transform .35s cubic-bezier(0.34,1.56,0.64,1), box-shadow .35s;
  }
  .tile:hover { transform: translateY(-5px); box-shadow: var(--sh2); }
  .top { display: flex; align-items: center; gap: .4rem; }
  .label {
    font-size: .68rem; font-weight: 700; color: var(--mut); letter-spacing: .01em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .flag {
    font-family: var(--mono); font-size: .55rem; font-weight: 700; color: var(--mut);
    border: 1px solid var(--bd); border-radius: 999px; padding: .05rem .4rem;
    margin-left: auto; letter-spacing: .03em;
  }
  .value { font-family: var(--mono); font-size: 1.45rem; font-weight: 800; color: var(--ink);
           font-variant-numeric: tabular-nums; letter-spacing: -.02em; line-height: 1.05; }
  .foot { display: flex; align-items: center; gap: .5rem; }
  .pct { font-family: var(--mono); font-size: .74rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .pct.up   { color: var(--up); }
  .pct.down { color: var(--dn); }
  .sub { font-size: .66rem; color: var(--mut);
         white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .empty { color: var(--mut); font-size: .85rem; padding: 1.2rem; font-family: var(--mono); }
`;

class VnDataGrid extends HTMLElement {
    static get observedAttributes() { return ['min-tile', 'filter-country']; }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._items = [];
    }

    set items(list) { this._items = Array.isArray(list) ? list : []; this._render(); }
    get items() { return this._items; }

    attributeChangedCallback() { this._render(); }
    connectedCallback() { this._render(); }

    _visibleItems() {
        const cc = (this.getAttribute('filter-country') || '').toUpperCase();
        if (!cc || cc === 'ALL') return this._items;
        return this._items.filter(i => (i.countryCode || '').toUpperCase() === cc);
    }

    _render() {
        const root = this.shadowRoot;
        const minTile = parseInt(this.getAttribute('min-tile'), 10) || 170;
        const items = this._visibleItems();

        if (!items.length) {
            root.innerHTML = `<style>${VN_GRID_STYLE}</style><div class="empty">Sin datos para mostrar.</div>`;
            return;
        }

        const tiles = items.map(it => {
            let pctHtml = '';
            if (it.pct != null && !Number.isNaN(Number(it.pct))) {
                const p = Number(it.pct);
                const up = p >= 0;
                // Flecha = codificación secundaria del signo (no depende del color)
                pctHtml = `<span class="pct ${up ? 'up' : 'down'}">${up ? '▲ +' : '▼ '}${Math.abs(p).toFixed(2)}%</span>`;
            }
            const sub  = it.sub ? `<span class="sub">${_esc(it.sub)}</span>` : '';
            const flag = it.countryCode ? `<span class="flag">${_esc(it.countryCode)}</span>` : '';
            const foot = (pctHtml || sub)
                ? `<div class="foot">${pctHtml}${sub}</div>` : '';
            return `<div class="tile">
                <div class="top"><span class="label">${_esc(it.label ?? '')}</span>${flag}</div>
                <span class="value">${_esc(it.value ?? '—')}</span>
                ${foot}
            </div>`;
        }).join('');

        root.innerHTML = `<style>${VN_GRID_STYLE}</style>
            <div class="grid" style="--min-tile:${minTile}px">${tiles}</div>`;
    }
}

function _esc(s) {
    return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

customElements.define('vn-data-grid', VnDataGrid);
