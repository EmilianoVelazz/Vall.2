'use strict';

// ── <vn-filter-bar> ──────────────────────────────────────────────────────────
// Barra de filtros reutilizable — MISMA API en Finanzas, Mercados y (futuro)
// México. Estética "Liquid Glass" de inicio.html: consume tokens --clr-* /
// --font-* de css/base.css. El control segmentado usa la CÁPSULA DESLIZANTE
// estilo Apple (idéntica al .nav-indicator del header de inicio): una píldora de
// cristal que se desliza tras la opción activa con easing de resorte.
//
//   el.filters = [
//     { id:'instrument', type:'select',    value:'AAPL', options:[...] },   // admite <optgroup>
//     { id:'range',      type:'segmented', value:'1y',   options:[...] },
//     { id:'country',    type:'select',    value:'ALL',  options:[...] },
//     { id:'ticker',     type:'search',    value:'',      placeholder:'NVDA' },
//   ];
// Evento: 'vn-filter-change' → detail = { id, value, values }.  Estado: el.values

const VN_FILTER_STYLE = `
  :host {
    --s:    var(--clr-surface, linear-gradient(135deg, rgba(255,255,255,.6), rgba(255,255,255,.25)));
    --s2:   var(--clr-bg, #f4f7fb);
    --ink:  var(--clr-primary, #00213a);
    --mut:  var(--clr-text-mut, #64748b);
    --acc:  var(--clr-accent, #2563eb);
    --bd:   var(--bdr-soft, rgba(0,33,58,.08));
    --sh:   var(--shadow-md, 0 12px 32px rgba(0,33,58,.06));
    --mono: var(--font-mono, 'JetBrains Mono', monospace);
    --sans: var(--font-sans, 'Inter', system-ui, sans-serif);
    display: block;
    font-family: var(--sans);
  }
  .bar {
    display: flex; flex-wrap: wrap; gap: .7rem 1.1rem; align-items: flex-end;
    padding: .85rem 1.1rem;
    background: var(--s);
    backdrop-filter: blur(32px) saturate(180%);
    -webkit-backdrop-filter: blur(32px) saturate(180%);
    border: 1px solid var(--bd);
    border-radius: 20px;
    box-shadow: var(--sh), inset 0 1px 1px rgba(255,255,255,.25);
  }
  .field { display: flex; flex-direction: column; gap: .35rem; }
  .field > label {
    font-size: .6rem; font-weight: 700; letter-spacing: .08em;
    text-transform: uppercase; color: var(--mut);
  }
  select, input {
    font: inherit; font-size: .84rem; color: var(--ink);
    background: color-mix(in srgb, var(--s2) 70%, transparent);
    border: 1px solid var(--bd); border-radius: 12px;
    padding: .5rem .7rem; min-width: 8.5rem;
    transition: border-color .2s, box-shadow .2s;
  }
  select:focus, input:focus { outline: none; border-color: var(--acc);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 20%, transparent); }
  input::placeholder { color: var(--mut); opacity: .7; }

  /* ── Segmentado con cápsula Liquid Glass deslizante (estilo Apple) ── */
  .seg { position: relative; display: inline-flex; padding: 3px;
         background: color-mix(in srgb, var(--s2) 70%, transparent);
         border: 1px solid var(--bd); border-radius: 999px; }
  .seg-ind {
    position: absolute; top: 3px; bottom: 3px; left: 0; width: 0;
    border-radius: 999px; z-index: 0; pointer-events: none; opacity: 0;
    background: var(--s);
    backdrop-filter: blur(16px) saturate(180%); -webkit-backdrop-filter: blur(16px) saturate(180%);
    box-shadow: 0 4px 12px rgba(0,0,0,.12), inset 0 1px 1px rgba(255,255,255,.4);
    /* El "resorte mágico": mismo easing que el .nav-indicator de inicio */
    transition: transform .45s cubic-bezier(0.34, 1.56, 0.64, 1),
                width .45s cubic-bezier(0.34, 1.56, 0.64, 1),
                opacity .3s ease;
  }
  .seg button {
    position: relative; z-index: 1;
    font-family: var(--mono); font-size: .74rem; font-weight: 700; color: var(--mut);
    background: transparent; border: 0; border-radius: 999px;
    padding: .4rem .8rem; cursor: pointer; transition: color .3s ease;
  }
  .seg button:hover { color: var(--ink); }
  .seg button[aria-pressed="true"] { color: var(--acc); }

  .search { display: flex; gap: .35rem; }
  .search input { font-family: var(--mono); }
  .search button {
    font: inherit; font-size: .8rem; font-weight: 700; color: #fff; background: var(--acc);
    border: 0; border-radius: 12px; padding: 0 .9rem; cursor: pointer;
    box-shadow: 0 4px 12px color-mix(in srgb, var(--acc) 35%, transparent);
  }
`;

class VnFilterBar extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._filters = [];
        this._values = {};
    }

    set filters(list) {
        this._filters = Array.isArray(list) ? list : [];
        this._values = {};
        for (const f of this._filters) this._values[f.id] = f.value ?? '';
        this._render();
    }
    get filters() { return this._filters; }

    get values() { return { ...this._values }; }

    setValue(id, value, { emit = false } = {}) {
        if (!(id in this._values)) return;
        this._values[id] = value;
        this._syncControl(id, value);
        if (emit) this._emit(id, value);
    }

    _emit(id, value) {
        this.dispatchEvent(new CustomEvent('vn-filter-change', {
            bubbles: true, composed: true,
            detail: { id, value, values: this.values },
        }));
    }

    // Desliza la cápsula de cristal bajo la opción activa del segmentado.
    _positionSeg(seg) {
        const active = seg.querySelector('button[aria-pressed="true"]');
        const ind = seg.querySelector('.seg-ind');
        if (!ind) return;
        if (!active) { ind.style.opacity = '0'; return; }
        ind.style.opacity = '1';
        ind.style.width = active.offsetWidth + 'px';
        ind.style.transform = `translateX(${active.offsetLeft}px)`;
    }

    _syncControl(id, value) {
        const root = this.shadowRoot;
        const sel = root.querySelector(`[data-id="${id}"]`);
        if (!sel) return;
        if (sel.classList.contains('seg')) {
            sel.querySelectorAll('button').forEach(b =>
                b.setAttribute('aria-pressed', String(b.dataset.value === value)));
            this._positionSeg(sel);
        } else if (sel.tagName === 'SELECT' || sel.tagName === 'INPUT') {
            sel.value = value;
        }
    }

    _render() {
        const root = this.shadowRoot;
        root.innerHTML = `<style>${VN_FILTER_STYLE}</style><div class="bar"></div>`;
        const bar = root.querySelector('.bar');

        for (const f of this._filters) {
            const field = document.createElement('div');
            field.className = 'field';
            if (f.label) {
                const lbl = document.createElement('label');
                lbl.textContent = f.label;
                field.appendChild(lbl);
            }

            if (f.type === 'segmented') {
                const seg = document.createElement('div');
                seg.className = 'seg'; seg.dataset.id = f.id;
                const ind = document.createElement('span');
                ind.className = 'seg-ind';
                seg.appendChild(ind);
                for (const o of f.options || []) {
                    const b = document.createElement('button');
                    b.type = 'button'; b.textContent = o.label; b.dataset.value = o.value;
                    b.setAttribute('aria-pressed', String(o.value === this._values[f.id]));
                    b.addEventListener('click', () => {
                        this._values[f.id] = o.value;
                        this._syncControl(f.id, o.value);
                        this._emit(f.id, o.value);
                    });
                    // Hover: la cápsula sigue al botón bajo el cursor (como el navbar de inicio)
                    b.addEventListener('mouseenter', () => this._slideIndTo(seg, b));
                    seg.appendChild(b);
                }
                seg.addEventListener('mouseleave', () => this._positionSeg(seg));
                field.appendChild(seg);
                requestAnimationFrame(() => this._positionSeg(seg));
                new ResizeObserver(() => this._positionSeg(seg)).observe(seg);

            } else if (f.type === 'search') {
                const wrap = document.createElement('div');
                wrap.className = 'search';
                const input = document.createElement('input');
                input.type = 'text'; input.dataset.id = f.id;
                input.placeholder = f.placeholder || '';
                input.value = this._values[f.id] || '';
                const btn = document.createElement('button');
                btn.type = 'button'; btn.textContent = f.buttonLabel || 'Ir';
                const fire = () => {
                    const v = input.value.trim();
                    this._values[f.id] = v;
                    this._emit(f.id, v);
                };
                btn.addEventListener('click', fire);
                input.addEventListener('keydown', e => { if (e.key === 'Enter') fire(); });
                wrap.append(input, btn);
                field.appendChild(wrap);

            } else { // 'select' (por defecto), sirve también para 'country'
                const sel = document.createElement('select');
                sel.dataset.id = f.id;
                const addOpt = (o, parent) => {
                    const opt = document.createElement('option');
                    opt.value = o.value; opt.textContent = o.label;
                    if (o.value === this._values[f.id]) opt.selected = true;
                    parent.appendChild(opt);
                };
                for (const o of f.options || []) {
                    if (Array.isArray(o.options)) {
                        const og = document.createElement('optgroup');
                        og.label = o.label;
                        o.options.forEach(sub => addOpt(sub, og));
                        sel.appendChild(og);
                    } else {
                        addOpt(o, sel);
                    }
                }
                sel.addEventListener('change', () => {
                    this._values[f.id] = sel.value;
                    this._emit(f.id, sel.value);
                });
                field.appendChild(sel);
            }

            bar.appendChild(field);
        }
    }

    // Desliza la cápsula a un botón concreto (usado en hover).
    _slideIndTo(seg, btn) {
        const ind = seg.querySelector('.seg-ind');
        if (!ind || !btn) return;
        ind.style.opacity = '1';
        ind.style.width = btn.offsetWidth + 'px';
        ind.style.transform = `translateX(${btn.offsetLeft}px)`;
    }
}

customElements.define('vn-filter-bar', VnFilterBar);
