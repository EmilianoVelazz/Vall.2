/* finanzas.html — JS extraído automáticamente */


/* === Script bloque lineas 706-796 === */
    (function(){
        let _chart = null, _series = null;
        const IV_PARAMS = {
            '15m': { interval: '15m', range: '5d'  },
            '1h':  { interval: '1h',  range: '1mo' },
            '1d':  { interval: '1d',  range: '1y'  },
            '1wk': { interval: '1wk', range: '5y'  },
            '1mo': { interval: '1mo', range: '10y' },
            'yr1': { interval: '1d',  range: '1y'  },
            'yr2': { interval: '1wk', range: '2y'  },
            'yr3': { interval: '1wk', range: '3y'  },
            'yr4': { interval: '1wk', range: '4y'  },
            'yr5': { interval: '1wk', range: '5y'  },
        };
        async function loadChart(ticker, iv) {
            const { interval, range } = IV_PARAMS[iv] || IV_PARAMS['1d'];
            document.getElementById('ch-price').textContent = '�';
            document.getElementById('ch-loading').style.display = 'flex';
            try {
                const r = await fetch(
                    `/api/stock-history?ticker=${encodeURIComponent(ticker)}&interval=${interval}&range=${range}`
                );
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const { candles, meta } = await r.json();
                if (!candles?.length) throw new Error('Sin velas');

                const price = meta.regularMarketPrice;
                const pct   = meta.regularMarketChangePercent;
                document.getElementById('ch-name').textContent  = meta.longName || ticker;
                document.getElementById('ch-price').textContent = price != null
                    ? price.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '�';
                document.getElementById('ch-pct').textContent   = pct != null
                    ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '�';
                document.getElementById('ch-pct').style.color   = pct >= 0 ? '#0e7a40' : '#c0392b';
                document.getElementById('ch-high').textContent  =
                    meta.regularMarketDayHigh?.toLocaleString('es-MX', { minimumFractionDigits: 2 }) || '�';
                document.getElementById('ch-low').textContent   =
                    meta.regularMarketDayLow?.toLocaleString('es-MX', { minimumFractionDigits: 2 }) || '�';
                document.getElementById('ch-cur').textContent   = meta.currency || '';
                const wrapper = document.getElementById('ch-wrapper');
                const showTime = !['1d','1wk','1mo'].includes(interval);
                if (!_chart) {
                    _chart = LightweightCharts.createChart(wrapper, {
                        width:  wrapper.clientWidth,
                        height: 400,
                        layout: { background: { type: 'solid', color: '#ffffff' }, textColor: '#334' },
                        grid:   { vertLines: { color: '#f0f3f7' }, horzLines: { color: '#f0f3f7' } },
                        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
                        rightPriceScale: { borderColor: '#dde2ea' },
                        timeScale: { borderColor: '#dde2ea', timeVisible: showTime },
                    });
                    _series = _chart.addCandlestickSeries({
                        upColor:       '#0e7a40', downColor:       '#c0392b',
                        borderUpColor: '#0e7a40', borderDownColor: '#c0392b',
                        wickUpColor:   '#0e7a40', wickDownColor:   '#c0392b',
                    });
                    new ResizeObserver(() => {
                        _chart.applyOptions({ width: wrapper.clientWidth });
                    }).observe(wrapper);
                } else {
                    _chart.applyOptions({ timeScale: { timeVisible: showTime } });
                }

                _series.setData(candles);
                _chart.timeScale().fitContent();
                document.getElementById('ch-loading').style.display = 'none';

            } catch (e) {
                console.error('Chart error:', e);
                document.getElementById('ch-price').textContent = '�';
                document.getElementById('ch-loading').textContent = 'No se pudieron cargar los datos.';
            }
        }
        function reload() {
            loadChart(
                document.getElementById('bmv-symbol').value,
                document.getElementById('bmv-interval').value
            );
        }
        document.getElementById('bmv-symbol').addEventListener('change', reload);
        document.getElementById('bmv-interval').addEventListener('change', reload);

        document.getElementById('bmv-custom-btn').addEventListener('click', function(){
            const t = document.getElementById('bmv-custom').value.trim().toUpperCase();
            if (t) loadChart(t, document.getElementById('bmv-interval').value);
        });
        document.getElementById('bmv-custom').addEventListener('keydown', function(e){
            if (e.key === 'Enter') document.getElementById('bmv-custom-btn').click();
        });
        reload();
    })();

/* === Script bloque lineas 1200-2905 === */
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

        const ttfEl  = document.getElementById('p-ttf');
        const ttfPct = document.getElementById('p-ttf-pct');
        if (ttfEl && gasPrice != null) {
            ttfEl.textContent = '$' + gasPrice.toFixed(2);
            if (ttfPct && gasPct != null) {
                ttfPct.textContent = (gasPct >= 0 ? '+' : '') + gasPct.toFixed(2) + '%';
                ttfPct.className = 'petro-pct ' + (gasPct >= 0 ? 'up' : 'down');
            }
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
                    ? `Correlaci�n activa: WTI ${wtiPct2 >= 0 ? '?' : '?'}${Math.abs(wtiPct2).toFixed(2)}% y el peso ${mxnPct2 < 0 ? 'se fortalece' : 'se debilita'} (USD/MXN ${mxnPct2 >= 0 ? '?' : '?'}${Math.abs(mxnPct2).toFixed(2)}%), coherente con la correlaci�n hist�rica Peso-Petr�leo.`
                    : `WTI ${wtiPct2 >= 0 ? '?' : '?'}${Math.abs(wtiPct2).toFixed(2)}% � USD/MXN ${mxnPct2 >= 0 ? '?' : '?'}${Math.abs(mxnPct2).toFixed(2)}%. El peso mexicano tiene alta correlaci�n con el petr�leo por los ingresos de Pemex.`
            }`;
        }
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
        { t: '^VIX',  label: 'VIX',        sub: '�ndice de Miedo',      inverse: true  },
        { t: '^GSPC', label: 'S&P 500',     sub: 'Referencia Principal', inverse: false },
        { t: '^TNX',  label: 'Yield 10A',   sub: 'Bono EUA 10 a�os',     inverse: false },
        { t: 'GC=F',  label: 'Oro',         sub: 'Refugio / Cobertura',  inverse: false },
    ];
    const SECTORS = [
        { t: 'XLK',  label: 'Tecnolog�a',      icon: '??' },
        { t: 'XLE',  label: 'Energ�a',          icon: '?' },
        { t: 'XLF',  label: 'Finanzas',         icon: '??' },
        { t: 'XLV',  label: 'Salud',            icon: '??' },
        { t: 'XLI',  label: 'Industrial',       icon: '??' },
        { t: 'XLY',  label: 'Consumo Discr.',   icon: '??' },
        { t: 'XLP',  label: 'Consumo B�sico',   icon: '??' },
        { t: 'XLC',  label: 'Comunicaciones',   icon: '??' },
        { t: 'XLB',  label: 'Materiales',       icon: '?' },
        { t: 'XLU',  label: 'Utilities',        icon: '??' },
        { t: 'XLRE', label: 'Inmobiliario',     icon: '??' },
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
            const pxStr  = px  != null ? (px >= 100 ? px.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}) : px.toFixed(2)) : '�';
            const pctStr = pct != null ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '�';
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
            const pctStr = s.pct != null ? (s.pct >= 0 ? '+' : '') + s.pct.toFixed(2) + '%' : '�';
            return `<div style="background:${bg};border:1px solid ${bdr};border-radius:8px;padding:.55rem .65rem;position:relative;overflow:hidden;">
                <div style="font-size:.9rem;line-height:1;margin-bottom:.18rem;">${s.icon}</div>
                <div style="font-size:.66rem;font-weight:700;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.label}</div>
                <div style="font-size:.78rem;font-weight:800;color:${clr};margin-top:.18rem;font-family:'JetBrains Mono','Inter',monospace;">${pctStr}</div>
                <div style="position:absolute;bottom:0;left:0;height:3px;width:${barW}%;background:${clr};opacity:.45;"></div>
            </div>`;
        }).join('');
    }
}
const NC_VISIBLE = 3;
const NC_CARD_H  = 240;
const NC_GAP     = 6;
const NC_STEP    = NC_CARD_H + NC_GAP;
let _ncAllItems  = [];
let _ncItems     = [];
let _ncPage      = 0;
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
    const riskLb = ['? ALTO', '? MEDIO', '? MON.'];
    const CATS   = ['Mercados Globales', 'Divisas y Commodities', 'Mercados Globales'];
    const now    = new Date();
    const fd     = now.toLocaleDateString('es-MX', { day:'2-digit', month:'short' }).toUpperCase()
                 + (_ncHora ? ' � ' + _ncHora : '');
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
        const href    = safeUrl ? `href="${safeUrl}" target="_blank" rel="noopener"` : '';
        return `<${tag} class="nc-card" data-cat="${slug}" ${href}>
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
const _rds = {};

 const RDS2_META = [
    // Tasas
    { key:'tiie',         lbl:'TIIE 28D',     icon:'??', cat:'tasas', fmt:'pct2', bar:[2,12],   tip:'Tasa Interbancaria de Equilibrio a 28 d�as. Base para el cr�dito en M�xico, fijada por Banxico.',          interp: v => v>9?'?? Muy restrictiva � cr�dito caro':v>7?'?? Restrictiva':v>5?'?? Moderada':'?? Expansiva' },
    { key:'fix',          lbl:'Tasa Fix',      icon:'??', cat:'tasas', fmt:'pct2', bar:[2,12],   tip:'Tasa de fondeo overnight de Banxico. Referencia para derivados y el mercado de dinero.',                    interp: v => v>8?'?? Alta':'?? Moderada' },
    { key:'infl',         lbl:'Inflaci�n MX',  icon:'??', cat:'tasas', fmt:'pct2', bar:[0,10],   tip:'INPC mensual anualizado. Meta de Banxico: 3% �1 pp. Impacta poder adquisitivo y pol�tica monetaria.',      interp: v => v>5?'?? Sobre meta � hawkish':v>4?'?? Elevada':v<2?'?? Bajo meta':'?? Cerca de meta' },
    { key:'fed',          lbl:'Fed Funds',     icon:'????', cat:'tasas', fmt:'pct2', bar:[0,7],   tip:'Tasa de fondos federales de la Fed. Ancla global del costo de capital. Alta = USD fuerte, presi�n en EM.', interp: v => v>=5?'?? Restrictiva � d�lar fuerte':'?? Normalizaci�n', staticVal:4.50 },
    { key:'bce',          lbl:'BCE',           icon:'????', cat:'tasas', fmt:'pct2', bar:[0,5],   tip:'Tasa de dep�sito del Banco Central Europeo. Mueve al EUR/MXN y flujos en bonos europeos.',                 interp: v => v>3?'?? Restrictiva':'?? Relativamente laxa', staticVal:2.65 },
    { key:'boe',          lbl:'BOE',           icon:'????', cat:'tasas', fmt:'pct2', bar:[0,7],   tip:'Banco de Inglaterra. Inflaci�n post-Brexit mantiene tasas elevadas. Impacta GBP/MXN.',                     interp: v => v>4?'?? Restrictiva':'?? Moderada', staticVal:4.50 },
    { key:'boj',          lbl:'BOJ',           icon:'????', cat:'tasas', fmt:'pct2', bar:[0,2],   tip:'Banco de Jap�n, en normalizaci�n hist�rica. Cada alza mueve fuerte al JPY/MXN.',                           interp: v => v<1?'?? Ultra expansiva':'?? Normalizando', staticVal:0.50 },
    // Mercados
    { key:'ipc',          lbl:'IPC BMV',       icon:'????', cat:'mkt',   fmt:'pts0',              tip:'�ndice de Precios y Cotizaciones. Bar�metro de la renta variable mexicana.',                               interp:(v,p)=>p==null?'?? Referencia BMV':p>0?`?? Subiendo ${p.toFixed(2)}%`:`?? Bajando ${Math.abs(p).toFixed(2)}%`, pctKey:'ipcPct' },
    { key:'sp500',        lbl:'S&P 500',       icon:'????', cat:'mkt',   fmt:'pts2',              tip:'S&P 500: las 500 mayores empresas de EE.UU. Referente global de renta variable.',                          interp:(v,p)=>p==null?'?? �ndice global':p>0?`?? +${p.toFixed(2)}% hoy`:`?? ${p.toFixed(2)}% hoy`, pctKey:'sp500Pct' },
    { key:'nasdaq',       lbl:'NASDAQ 100',    icon:'??', cat:'mkt',    fmt:'pts2',              tip:'Las 100 principales empresas tecnol�gicas. Sensible a tasas de la Fed y sentimiento de riesgo.',             interp:(v,p)=>p==null?'?? �ndice tech':p>0?`?? +${p.toFixed(2)}% hoy`:`?? ${p.toFixed(2)}% hoy`, pctKey:'nasdaqPct' },
    { key:'gold',         lbl:'Oro / oz',      icon:'??', cat:'mkt',    fmt:'usd2',              tip:'Oro al contado (USD/oz troy). Refugio ante inflaci�n, incertidumbre geopol�tica y debilitamiento del USD.',  interp: v => v>2500?'?? M�ximos hist�ricos � hedge demandado':v>2000?'?? Precio elevado':'?? Rango hist�rico', pctKey:'goldPct' },
    { key:'btc',          lbl:'BTC / USD',     icon:'?',  cat:'mkt',    fmt:'usd0',              tip:'Bitcoin en USD. Indicador de apetito por activos de riesgo y liquidez global.',                             interp: v => v>80000?'?? Euforia':v>50000?'?? Bull market':'?? Correcci�n', pctKey:'btcPct' },
    { key:'dxy',          lbl:'DXY',           icon:'??', cat:'mkt',    fmt:'pts2', bar:[90,115], tip:'�ndice del d�lar vs cesta de 6 divisas. DXY alto = presi�n en EM, materias primas y el MXN.',              interp: v => v>105?'?? D�lar muy fuerte':v>100?'?? D�lar fuerte':'?? Moderado', pctKey:'dxyPct' },
    // Riesgo
    { key:'vix',          lbl:'VIX',           icon:'?', cat:'risk',   fmt:'pts1', bar:[10,45],  tip:'"�ndice del miedo". Volatilidad impl�cita del S&P 500. Alto = p�nico; bajo = calma.',                      interp: v => v>=30?'?? P�nico � buscar refugio':v>=20?'?? Nerviosismo':v>=15?'?? Moderado':'?? Calma � risk-on' },
    { key:'creditSpread', lbl:'Sprd. HY',      icon:'??', cat:'risk',   fmt:'spread',             tip:'Diferencial HYG-LQD (retorno diario). Negativo = bonos basura bajo presi�n vs investment grade.',           interp: v => v<-0.5?'?? Estr�s crediticio':v<0?'?? Ligera presi�n':'?? Condiciones estables' },
    { key:'wti',          lbl:'WTI / bbl',     icon:'??', cat:'risk',   fmt:'usd2', bar:[40,110], tip:'West Texas Intermediate. Impacta ingresos de Pemex, inflaci�n y balanza de pagos de M�xico.',              interp: v => v>100?'?? Alto � inflaci�n energ�tica':v>70?'?? Equilibrado':'?? Bajo', pctKey:'wtiPct' },
    { key:'brent',        lbl:'Brent / bbl',   icon:'?', cat:'risk',   fmt:'usd2', bar:[40,115], tip:'Petr�leo Brent (referencia global). Correlacionado con WTI; referencia para gasolinas.',                   interp: v => v>105?'?? Alto':v>75?'?? Equilibrado':'?? Bajo', pctKey:'brentPct' },
    { key:'cds',          lbl:'CDS MX 5Y',     icon:'??', cat:'risk',   fmt:'static', staticStr:'~95 bps', tip:'Credit Default Swap soberano a 5Y. Mide el costo de asegurar deuda mexicana. Sube con riesgo fiscal o pol�tico.', interp: ()=>'?? Moderado � valor referencial, no tiempo real' },
];

function _rdsFmtVal(m) {
    if (m.fmt === 'static') return m.staticStr || '�';
    const raw = m.staticVal !== undefined ? m.staticVal : _rds[m.key];
    if (raw == null) return '<span class="rds-sk" style="width:40px;height:11px;display:inline-block;vertical-align:middle;margin-top:.1rem;"></span>';
    const v = parseFloat(raw);
    if (isNaN(v)) return '�';
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
    return `<span class="rds2-cpct ${up?'up':'dn'}">${up?'? +':'? '}${Math.abs(pct).toFixed(2)}%</span>`;
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
        { id:'tasas', icon:'??', lbl:'Tasas Bancarias',  border:'#3b82f6' },
        { id:'mkt',   icon:'??', lbl:'Mercados Clave',    border:'#10b981' },
        { id:'risk',  icon:'?', lbl:'Riesgo & Energ�a',  border:'#f59e0b' },
    ];
    function rowHtml(m, i) {
        const val  = _rdsFmtVal(m);
        const raw  = m.staticVal !== undefined ? m.staticVal : _rds[m.key];
        const v    = raw != null ? parseFloat(raw) : null;
        const pct  = m.pctKey ? _rds[m.pctKey] : null;
        const interpStr = (m.interp && v != null) ? m.interp(v, pct) : '';
        const dotCol = interpStr.startsWith('??') ? '#ef4444'
                     : interpStr.startsWith('??') ? '#f97316'
                     : interpStr.startsWith('??') ? '#f59e0b'
                     : interpStr.startsWith('??') ? '#10b981' : '#cbd5e1';
        let barHtml = '';
        if (m.bar && v != null) {
            const pBar = Math.max(0, Math.min(100, (v - m.bar[0]) / (m.bar[1] - m.bar[0]) * 100));
            const bCol = pBar > 68 ? '#ef4444' : pBar > 38 ? '#f59e0b' : '#10b981';
            barHtml = '<div class="rds3-bar" style="width:' + pBar.toFixed(1) + '%;background:' + bCol + ';"></div>';
        }
        let pctHtml = '<span class="rds3-pct"></span>';
        if (pct != null) {
            const up = pct >= 0;
            pctHtml = '<span class="rds3-pct ' + (up ? 'up' : 'dn') + '">' + (up ? '? +' : '? ') + Math.abs(pct).toFixed(2) + '%</span>';
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
        { pair:'USD/MXN', flag:'????', val:fx.usdmxn, note:'D�lar EUA'         },
        { pair:'EUR/MXN', flag:'????', val:fx.eurmxn, note:'Euro'               },
        { pair:'GBP/MXN', flag:'????', val:fx.gbpmxn, note:'Libra Esterlina'    },
        { pair:'JPY/MXN', flag:'????', val:fx.jpymxn, note:'Yen Japon�s (�100)' },
        { pair:'BRL/MXN', flag:'????', val:fx.brlmxn, note:'Real Brasile�o'     },
        { pair:'CAD/MXN', flag:'????', val:fx.cadmxn, note:'D�lar Canadiense'   },
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
        { ticker: 'USDMXN=X', flag: '????', label: 'USD/MXN', note: 'D�lar EUA',        mode: 'direct'    },
        { ticker: 'EURUSD=X', flag: '????', label: 'EUR/MXN', note: 'Euro',              mode: 'eur_cross' },
        { ticker: 'GBPUSD=X', flag: '????', label: 'GBP/MXN', note: 'Libra Esterlina',  mode: 'gbp_cross' },
        { ticker: 'USDJPY=X', flag: '????', label: 'JPY/MXN', note: 'Yen (�100)',        mode: 'jpy_cross' },
        { ticker: 'USDBRL=X', flag: '????', label: 'BRL/MXN', note: 'Real Brasile�o',   mode: 'brl_cross' },
        { ticker: 'USDCAD=X', flag: '????', label: 'CAD/MXN', note: 'D�lar Canadiense', mode: 'cad_cross' },
        { ticker: 'USDCNY=X', flag: '????', label: 'CNY/MXN', note: 'Yuan Chino',        mode: 'cny_cross' },
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
                ? `<span style="font-size:.55rem;font-weight:700;color:${isUp ? '#16a34a' : '#dc2626'};">${isUp ? '?' : '?'} ${Math.abs(pct).toFixed(2)}%</span>` : '';
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

function computeFearGreed() {
    const vix = _rds.vix, sp500Pct = _rds.sp500Pct, creditSpread = _rds.creditSpread, dxy = _rds.dxy;
    const vixScore  = vix  == null ? 50 : vix  < 12 ? 90 : vix  < 15 ? 75 : vix  < 20 ? 57 : vix  < 25 ? 38 : vix  < 30 ? 20 : 8;
    const momScore  = sp500Pct == null ? 50 : sp500Pct > 1 ? 80 : sp500Pct > 0.3 ? 64 : sp500Pct > -0.3 ? 50 : sp500Pct > -1 ? 32 : 14;
    const credScore = creditSpread == null ? 50 : creditSpread > 0.2 ? 72 : creditSpread > 0 ? 58 : creditSpread > -0.2 ? 42 : 24;
    const dxyScore  = dxy  == null ? 50 : dxy  < 100 ? 65 : dxy  < 103 ? 50 : dxy  < 106 ? 35 : 20;
    const score = Math.round(vixScore * 0.35 + momScore * 0.30 + credScore * 0.20 + dxyScore * 0.15);
    return { score: Math.max(5, Math.min(95, score)), vixScore, momScore, credScore, dxyScore };
}

async function loadFearGreed() {
    const { score, vixScore, momScore, credScore, dxyScore } = computeFearGreed();
    const label = score >= 80 ? 'Codicia Extrema' : score >= 60 ? 'Codicia' : score >= 40 ? 'Neutral' : score >= 20 ? 'Miedo' : 'Miedo Extremo';
    const color = score >= 80 ? '#16a34a' : score >= 60 ? '#22c55e' : score >= 40 ? '#d97706' : score >= 20 ? '#f87171' : '#dc2626';
    const arcEl = document.getElementById('fg-arc'), numEl = document.getElementById('fg-num');
    const labelEl = document.getElementById('fg-label'), markerEl = document.getElementById('fg-marker');
    const compEl  = document.getElementById('fg-components'), insightEl = document.getElementById('fg-insight');
    if (arcEl)    { arcEl.style.strokeDashoffset = (251.2 * (1 - score / 100)).toFixed(1); arcEl.style.stroke = color; }
    if (numEl)    { numEl.textContent = score; numEl.style.color = color; }
    if (labelEl)  { labelEl.textContent = label; labelEl.style.color = color; }
    if (markerEl) markerEl.style.left = score + '%';
    if (compEl) compEl.innerHTML = [
        { label: 'VIX', s: vixScore }, { label: 'S&P', s: momScore },
        { label: 'Cr�dito', s: credScore }, { label: 'DXY', s: dxyScore },
    ].map(c => {
        const col = c.s >= 60 ? '#16a34a' : c.s >= 40 ? '#d97706' : '#dc2626';
        return `<span class="fg-comp" style="background:${col}18;color:${col};">${c.label}: ${c.s}</span>`;
    }).join('');
    if (insightEl) {
        const vix = _rds.vix; const sp = _rds.sp500Pct;
        const txt = score >= 80 ? 'codicia extrema � se�al contrarian de cautela hist�rica.'
            : score >= 60 ? 'codicia dominante; inversores asumen riesgo activamente.'
            : score >= 40 ? 'sentimiento neutral; sin sesgo claro.'
            : score >= 20 ? 'el miedo domina � presi�n vendedora generalizada.'
            : 'miedo extremo � hist�ricamente oportunidades de entrada para largo plazo.';
        insightEl.innerHTML = `<i class="fas fa-robot"></i> �ndice ${score}/100 � ${txt}${vix != null ? ` VIX ${vix.toFixed(1)}.` : ''}${sp != null ? ` S&P ${sp >= 0 ? '+' : ''}${sp.toFixed(2)}% hoy.` : ''}`;
    }
}
async function loadBitcoinDominance() {
    try {
        const r = await fetch('https://api.coingecko.com/api/v3/global', { headers: { Accept: 'application/json' } });
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
            if (noteEl) noteEl.textContent = btcDom > 58 ? '? Mercado defensivo' : btcDom < 48 ? '? Alt season probable' : 'Mercado equilibrado';
        }
        if (capEl && totalCap != null) capEl.textContent = '$' + (totalCap / 1e12).toFixed(2) + 'T';
        if (capChgEl && capChg24 != null) {
            capChgEl.textContent = (capChg24 >= 0 ? '? +' : '? ') + capChg24.toFixed(2) + '% 24h';
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
        descripcion: descripcion || 'Informaci�n de mercados financieros actualizada.',
        fuente:      (n.source || n.domain || 'API').toUpperCase(),
        impacto,
        ia_insight:  `Dato en tiempo real. Fuente: ${n.source || 'API'}.`,
        image:       n.image || n.banner_image || n.socialimage || '',
        url:         n.url   || '',
    };
}

function buildFallback(tiieVal, rate, qqq, hora) {
    const fd = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' }).toUpperCase() + ' � ' + hora;
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
        { categoria: 'Pol�tica Monetaria',       titulo: `Banxico mantiene TIIE en ${tiieStr}% � Perspectiva de tasas`,
          descripcion: `El Banco de M�xico fij� la tasa interbancaria de equilibrio a 28 d�as en ${tiieStr}%. Los analistas siguen de cerca las decisiones de pol�tica monetaria ante un entorno inflacionario complejo y las se�ales de la Reserva Federal de EE.UU.`,
          fuente: 'BANXICO', impacto: 'alto',  image: img(0), url: '', fecha: fd },
        { categoria: 'Mercado Cambiario',        titulo: `USD/MXN cotiza en $${rateStr} � Presi�n en divisas emergentes`,
          descripcion: `El peso mexicano se ubica en ${rateStr} frente al d�lar estadounidense. Las fluctuaciones reflejan el diferencial de tasas entre M�xico y EE.UU., flujos de capital extranjero y la incertidumbre geopol�tica que impacta a las monedas de mercados emergentes.`,
          fuente: 'FOREX',   impacto: 'medio', image: img(1), url: '', fecha: fd },
        { categoria: 'Mercados Financieros',     titulo: `Wall Street y BMV: claves de la sesi�n burs�til de hoy`,
          descripcion: 'Los principales �ndices burs�tiles operan con volatilidad moderada. El S&P 500 y el NASDAQ reaccionan a reportes trimestrales de empresas tecnol�gicas, mientras el IPC de la BMV refleja el desempe�o del sector financiero y de consumo en M�xico.',
          fuente: 'BMV',     impacto: 'medio', image: img(2), url: '', fecha: fd },
        { categoria: 'Pol�tica Monetaria',       titulo: `Fed Funds en 4.50% � Expectativas de recorte en pr�ximas reuniones`,
          descripcion: 'La Reserva Federal mantiene la tasa de fondos federales en el rango de 4.25%-4.50%. Los mercados de futuros descuentan posibles recortes para el segundo semestre del a�o, condicionados a la evoluci�n de la inflaci�n subyacente y el mercado laboral.',
          fuente: 'FED',     impacto: 'alto',  image: img(3), url: '', fecha: fd },
        { categoria: 'Riesgo y Volatilidad',     titulo: `�ndice VIX y apetito de riesgo � Se�ales para inversionistas`,
          descripcion: 'El �ndice de volatilidad VIX del CBOE mide la expectativa de fluctuaci�n del S&P 500 a 30 d�as. Niveles elevados se�alan aversi�n al riesgo en los mercados globales, mientras que lecturas bajas sugieren confianza y mayor apetito por activos de renta variable.',
          fuente: 'CBOE',    impacto: 'medio', image: img(4), url: '', fecha: fd },
        { categoria: 'Banca Central Global',     titulo: `BCE, BOE y BOJ: panorama de tasas de inter�s a nivel mundial`,
          descripcion: 'El Banco Central Europeo mantiene su tasa en 2.65%, el Banco de Inglaterra en 4.50% y el Banco de Jap�n en 0.50%. Las divergencias en pol�tica monetaria global generan oportunidades y riesgos en mercados de renta fija, divisas y flujos de inversi�n.',
          fuente: 'BANCOS',  impacto: 'bajo',  image: img(5), url: '', fecha: fd },
        { categoria: 'Commodities',              titulo: `Petr�leo, oro y materias primas: factores que mueven los precios`,
          descripcion: 'El crudo WTI y Brent reaccionan a las decisiones de la OPEP+ y la demanda de China. El oro se fortalece como refugio ante la inflaci�n persistente, mientras el cobre y los granos reflejan tensiones en las cadenas globales de suministro y clima adverso.',
          fuente: 'COMMODITIES', impacto: 'medio', image: img(6), url: '', fecha: fd },
        { categoria: 'Cripto y Fintech',         titulo: `Bitcoin y activos digitales: regulaci�n y tendencias del mercado`,
          descripcion: 'El mercado de criptomonedas contin�a su evoluci�n con Bitcoin liderando la capitalizaci�n. Los reguladores en EE.UU. y Europa avanzan en marcos normativos para exchanges y stablecoins, mientras las instituciones financieras tradicionales ampl�an su oferta de activos digitales.',
          fuente: 'CRYPTO',  impacto: 'medio', image: img(7), url: '', fecha: fd },
        { categoria: 'Econom�a M�xico',          titulo: `PIB, empleo e inversi�n: radiograf�a de la econom�a mexicana`,
          descripcion: 'Los indicadores econ�micos de M�xico muestran un panorama mixto. La inversi�n extranjera directa mantiene dinamismo impulsada por el nearshoring, mientras el consumo interno y las remesas familiares sostienen el crecimiento en un entorno de tasas de inter�s elevadas.',
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
        tx('ai-status', `${expired ? 'Actualizando�' : 'Actualizado:'} ${stored.hora}`);
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
    tx('ai-status', `Cargando� � ${hora}`);
    const CATS_FIN = ['Mercados Globales', 'Divisas y Commodities', 'Mercados Globales', 'Econom�a Global', 'Divisas y Commodities', 'Mercados Globales', 'Commodities', 'Cripto y Fintech', 'Econom�a M�xico'];
    const IMP_FIN  = ['alto', 'medio', 'bajo', 'medio', 'alto', 'bajo', 'medio', 'medio', 'alto'];
    const fhNewsPromise = fetch('/api/finnhub-news?category=general')
        .then(r => r.ok ? r.json() : []).catch(() => []);

    fhNewsPromise.then(fhRaw => {
        if (!Array.isArray(fhRaw) || !fhRaw.length) return;
        const seen = new Set();
        _fhImgPool = fhRaw.filter(a => {
            if (!a.image?.startsWith('http') || seen.has(a.image)) return false;
            seen.add(a.image); return true;
        }).map(a => a.image);
        const fhForNews = fhRaw.filter(a => a.headline || a.summary).slice(0, 9);
        if (fhForNews.length < 3) return;
        let noticiasFast = fhForNews.map((a, i) => ({
            categoria: CATS_FIN[i % CATS_FIN.length], titulo: a.headline || a.summary || '',
            descripcion: a.summary || '', fuente: (a.source || 'FINNHUB').toUpperCase(),
            impacto: IMP_FIN[i % IMP_FIN.length], ia_insight: `Real-time data via ${a.source || 'Finnhub'}.`,
            image: a.image?.startsWith('http') ? a.image : (_fhImgPool[i] || ''), url: a.url || '',
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
        fetch('https://open.er-api.com/v6/latest/USD').then(r => r.json()).catch(() => null),
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
    const vaiAlerta  = `TIIE ${tiieVal.toFixed(2)}%${infl ? ' � Inflaci�n ' + infl.toFixed(2) + '%' : ''}${vixVal != null ? ' � VIX ' + vixVal.toFixed(1) : ''}. Monitorear Banxico y apetito de riesgo global.`;
    updateForecastBanner(vaiPred, vaiVerdict, vaiAlerta, 'MERCADO MX');
    Object.assign(_rds, { tiie: tiieVal, fix, infl, vix: vixVal, creditSpread, fx, hora });
    renderRawDataPanel();
    const fhRaw = await fhNewsPromise;
    const seen2 = new Set();
    _fhImgPool = fhRaw.filter(a => {
        if (!a.image?.startsWith('http') || seen2.has(a.image)) return false;
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
            image:       a.image?.startsWith('http') ? a.image : (_fhImgPool[i] || ''),
            url:         a.url   || '',
          }))
        : buildFallback(tiieVal, fix, null, hora);
    if (noticiasFast.length < 9) {
        const fb = buildFallback(tiieVal, fix, null, hora);
        noticiasFast = noticiasFast.concat(fb.slice(noticiasFast.length));
    }
    const bc = { banxico: tiieVal, fed: 4.50, bce: 3.65, boe: 4.50, boj: 0.50 };
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
    tx('ai-status', `Actualizado � ${hora}`);
    const obj = { hora, tiie: tiieVal, fix, infl, vix: vixVal, creditSpread, bc, vai: [vaiPred, vaiVerdict, vaiAlerta, 'MERCADO MX'], noticias: noticiasFinales, imgPool: _fhImgPool, fx };
    if (isCacheValid(obj)) VDS.save(FIN_CK, obj);
}
async function loadMktCap() {
    const ASSETS = [
        { ticker: '^MXX',     label: 'IPC',        sub: 'BOLSA MX'    },
        { ticker: '^GSPC',    label: 'S&P 500',    sub: 'EE.UU.'      },
        { ticker: 'QQQ',      label: 'NASDAQ 100', sub: 'TECH'        },
        { ticker: 'USDMXN=X', label: 'USD / MXN', sub: 'FOREX'       },
        { ticker: 'GC=F',     label: 'Oro',        sub: 'COMMODITIES' },
        { ticker: 'BTC-USD',  label: 'Bitcoin',    sub: 'CRYPTO'      },
        { ticker: 'DX-Y.NYB', label: 'DXY',        sub: 'USD INDEX'   },
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
        if (p == null) return '�';
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
        const pctStr   = pct != null ? (isUp ? '+' : '') + pct.toFixed(2) + '%' : '�';
        const arrow    = pct == null ? '' : isUp ? '?' : '?';
        const badgeCls = pct == null ? 'flat' : isUp ? 'up' : 'down';
        const rowCls   = pct == null ? 'row-flat' : isUp ? 'row-up' : 'row-down';
        const range    = fmtRange(candles);
        return `<div class="mkt-row ${rowCls}" onclick="openMktDetail(${i})" style="cursor:pointer">
            <div>
                <div class="mkt-name">${a.label}</div>
                <div class="mkt-sub">${a.sub}</div>
            </div>
            <svg class="sparkline" viewBox="0 0 126 40" preserveAspectRatio="none" fill="none">${sparkSVG(candles, isUp, i)}</svg>
            <div class="mkt-right">
                <span class="mkt-badge ${badgeCls}">${arrow} ${pctStr}</span>
                <div class="mkt-val">${fmtPrice(price)}</div>
                ${range ? `<div class="mkt-range">${range}</div>` : ''}
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
}
async function updateTicker() {
    const track = document.getElementById('vnTrack');
    if (!track) return;
    const TICKER_ASSETS = [
        { s: 'GFNORTEO', n: 'Banorte',       t: 'GFNORTEO.MX' },
        { s: 'WALMEX',   n: 'Walmart MX',    t: 'WALMEX.MX'   },
        { s: 'FEMSA',    n: 'FEMSA',          t: 'FEMSAUBD.MX' },
        { s: 'AMXB',     n: 'Am�rica M�vil', t: 'AMXB.MX'     },
        { s: 'BIMBOA',   n: 'Bimbo',         t: 'BIMBOA.MX'   },
        { s: 'CEMEXCPO', n: 'Cemex',         t: 'CEMEXCPO.MX' },
        { s: 'GMEXICOB', n: 'Grupo M�xico',  t: 'GMEXICOB.MX' },
        { s: 'USD/MXN',  n: 'Tipo Cambio',   t: 'USDMXN=X'    },
        { s: 'CL=F',     n: 'Petr�leo WTI',  t: 'CL=F'        },
        { s: 'GC=F',     n: 'Oro',           t: 'GC=F'        },
        { s: 'ZC=F',     n: 'Ma�z CME',      t: 'ZC=F'        },
        { s: 'ZS=F',     n: 'Soya CME',      t: 'ZS=F'        },
        { s: 'BTC',      n: 'Bitcoin',       t: 'BTC-USD'     },
        { s: 'DXY',      n: 'USD Index',     t: 'DX-Y.NYB'    },
        { s: 'MOVE',     n: 'Vol. Bonos',    t: '^MOVE'       },
    ];
    const results = await Promise.allSettled(TICKER_ASSETS.map(a => fetchAssetData(a.t)));
    function fmt(p) {
        if (p == null || p === 0) return '�';
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
        const chg = d.c != null ? (up ? '+' : '') + d.c.toFixed(2) + '%' : '�';
        return `<div class="vn-item"><span class="vn-sym">${d.s}</span><span class="vn-name">${d.n}</span><span class="vn-price">${fmt(d.p)}</span><div class="vn-chg ${up?'up':'down'}"><span>${d.c != null ? arr : ''}</span><span>${chg}</span></div></div><div class="vn-sep"></div>`;
    }).join('');

    track.style.animation = 'none';
    track.innerHTML = html + html;
    void track.offsetWidth; 
    track.style.removeProperty('animation'); 
}    
let _bondsCurveChart = null;
function renderBondsCurveChart(bonds) {
    const canvas = document.getElementById('bonds-curve-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = bonds.map(b => b.maturity || b.label);
    const yields = bonds.map(b => b.yield);

    if (_bondsCurveChart) {
        _bondsCurveChart.data.labels = labels;
        _bondsCurveChart.data.datasets[0].data = yields;
        _bondsCurveChart.update();
        return;
    }

    _bondsCurveChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Rendimiento (%)',
                data: yields,
                borderColor: '#00213a',
                backgroundColor: 'rgba(0,33,58,0.08)',
                borderWidth: 2,
                pointRadius: 4,
                pointBackgroundColor: '#00213a',
                tension: 0.3,
                fill: true,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y?.toFixed(2)}%` } },
            },
            scales: {
                y: {
                    ticks: { callback: v => v + '%', font: { size: 10 } },
                    grid: { color: 'rgba(0,0,0,0.05)' },
                },
                x: {
                    ticks: { font: { size: 10 } },
                    grid: { display: false },
                },
            },
        },
    });
}

const _BOND_FB = [
    { key:'us', country:'Estados Unidos', flag:'????', source:'US Treasury (referencia)', bonds:[
        { label:'3 meses', maturity:'3M',  yield:4.33, prev:4.35 },
        { label:'5 a�os',  maturity:'5Y',  yield:4.35, prev:4.38 },
        { label:'10 a�os', maturity:'10Y', yield:4.51, prev:4.48 },
        { label:'30 a�os', maturity:'30Y', yield:4.95, prev:4.92 }]},
    { key:'eu', country:'Zona Euro',    flag:'????', source:'BCE (referencia)',    bonds:[{ label:'10 a�os',      maturity:'10Y', yield:2.65, prev:2.70 }]},
    { key:'mx', country:'M�xico',        flag:'????', source:'Banxico (referencia)',bonds:[{ label:'TIIE 28D',      maturity:'28D', yield:8.50, prev:9.00 }]},
    { key:'jp', country:'Jap�n',         flag:'????', source:'BOJ (referencia)',    bonds:[{ label:'Tasa objetivo', maturity:'OVN', yield:0.50, prev:0.25 }]},
    { key:'gb', country:'Reino Unido',   flag:'????', source:'BOE (referencia)',    bonds:[{ label:'Tasa base',     maturity:'OVN', yield:4.50, prev:4.75 }]},
    { key:'cn', country:'China',         flag:'????', source:'PBOC (referencia)',   bonds:[{ label:'LPR 1 a�o',    maturity:'1Y',  yield:3.45, prev:3.65 }]},
    { key:'br', country:'Brasil',        flag:'????', source:'BACEN (referencia)',  bonds:[{ label:'SELIC',         maturity:'OVN', yield:13.75,prev:14.75}]},
    { key:'ca', country:'Canad�',        flag:'????', source:'BOC (referencia)',    bonds:[{ label:'Tasa objetivo', maturity:'OVN', yield:4.25, prev:4.50 }]}
];

function _renderBondsData(data, isRef) {
    const usEntry     = data.find(d => d.key === 'us');
    const globalEntry = data.filter(d => d.key !== 'us');
    const usEl        = document.getElementById('bonds-us');
    const globalEl    = document.getElementById('bonds-global');
    if (usEl && usEntry) {
        usEl.innerHTML = usEntry.bonds.map(b => {
            const yld  = b.yield != null ? b.yield.toFixed(2) + '%' : '�';
            const diff = (b.yield != null && b.prev != null) ? b.yield - b.prev : null;
            const cls  = diff == null ? 'flat' : diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
            const chg  = isRef ? 'ref.' : (diff != null ? (diff > 0 ? '?' : '?') + Math.abs(diff).toFixed(2) : '�');
            return `<div class="bond-pill" title="Ver desglose ${b.label}" onclick="openBondDetail('us','${b.label}')">
                <span class="bp-mat">${b.label}</span>
                <span class="bp-yld">${yld}</span>
                <span class="bp-chg ${cls}">${chg}</span>
            </div>`;
        }).join('');
        if (!isRef) renderBondsCurveChart(usEntry.bonds);
    }
    if (globalEl) {
        globalEl.innerHTML = globalEntry.map(d => {
            const b    = d.bonds[0];
            const yld  = b.yield != null ? b.yield.toFixed(2) + '%' : '�';
            const diff = (b.yield != null && b.prev != null) ? b.yield - b.prev : null;
            const cls  = diff == null ? 'flat' : diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
            const chg  = isRef ? 'ref.' : (diff != null ? (diff > 0 ? '?' : '?') + Math.abs(diff).toFixed(2) : '�');
            const src  = d.source ? `<span class="bond-row-type">${d.source}</span>` : '';
            return `<div class="bond-row" title="Ver desglose ${d.country}" onclick="openBondDetail('${d.key}','${b.label}')">
                <div class="bond-row-left">
                    <span class="bond-row-flag">${d.flag}</span>
                    <div>
                        <div class="bond-row-name">${d.country} <span style="font-weight:400;color:#94a3b8;font-size:.62rem;">� ${b.label}</span></div>
                        ${src}
                    </div>
                </div>
                <div class="bond-row-right">
                    <span class="bond-row-yield">${yld}</span>
                    <span class="bond-row-chg ${cls}">${chg}</span>
                    <i class="fas fa-chevron-right" style="font-size:.55rem;color:#cbd5e1;margin-left:.3rem;"></i>
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
            ycEl.title = spread >= 0 ? 'Curva normal' : '? Curva invertida � se�al hist�rica de recesi�n';
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
        _renderBondsData(data, false);
        const upd = document.getElementById('bonds-upd');
        if (upd) upd.textContent = 'Act. ' + new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        clearTimeout(tmr);
        console.error('loadBonds error:', e.message);
        _bondData = _BOND_FB;
        _renderBondsData(_BOND_FB, true);
        const upd = document.getElementById('bonds-upd');
        if (upd) upd.textContent = 'Referencia � en vivo no disponible';
        if (loading) { loading.style.display = 'block'; loading.textContent = '? Usando tasas de referencia � datos en vivo no disponibles'; }
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

        const fed = 4.50, spread = tiie - fed, realRate = tiie - infl;
        const vixLevel = vix == null ? null : vix < 15 ? 'Baja' : vix < 25 ? 'Moderada' : 'Alta';
        const vixColor = vix == null ? '#64748b' : vix < 15 ? '#16a34a' : vix < 25 ? '#d97706' : '#dc2626';

        tx('rp-spread', `+${spread.toFixed(2)} pp`);
        const vixEl = $('rp-vix');
        if (vixEl) { vixEl.textContent = vix != null ? `${vix.toFixed(2)} � ${vixLevel}` : '�'; vixEl.style.color = vixColor; }
        const realEl = $('rp-real');
        if (realEl) { realEl.textContent = `${realRate >= 0 ? '+' : ''}${realRate.toFixed(2)}%`; realEl.style.color = realRate >= 0 ? '#16a34a' : '#dc2626'; }

        // MOVE Index (volatilidad impl�cita bonos EE.UU.)
        const moveEl = $('rp-move');
        if (moveEl) {
            if (move != null) {
                moveEl.textContent = move.toFixed(1) + (move > 120 ? ' � Alta' : move > 90 ? ' � Mod.' : ' � Baja');
                moveEl.style.color = move > 120 ? '#dc2626' : move > 90 ? '#d97706' : '#16a34a';
            } else { moveEl.textContent = '�'; }
        }

        // Break-even inflaci�n 10Y (aprox. TNX - TIPS yield estimado)
        const beEl = $('rp-breakeven');
        if (beEl) {
            if (tnx != null) {
                const be = tnx - (tnx * 0.435);
                beEl.textContent = '~' + be.toFixed(2) + '% (est.)';
                beEl.style.color = be > 2.5 ? '#dc2626' : be > 2.0 ? '#d97706' : '#16a34a';
                beEl.title = 'Aprox. TNX - TIPS yield est. Dato exacto: FRED T10YIE';
            } else { beEl.textContent = '�'; }
        }

        // OIS � Probabilidad de recorte Fed (proxy: Fed - T-Bill 3M)
        const oisEl = $('rp-ois');
        if (oisEl) {
            if (irx != null) {
                const cutProb = Math.max(0, Math.min(100, Math.round((fed - irx) / 0.25 * 100)));
                oisEl.textContent = cutProb + '% recorte';
                oisEl.style.color = cutProb >= 60 ? '#16a34a' : cutProb >= 30 ? '#d97706' : '#dc2626';
                oisEl.title = `T-Bill 3M: ${irx.toFixed(2)}% vs Fed: ${fed}% ? proxy OIS`;
            } else { oisEl.textContent = '�'; }
        }

        const noteEl = $('rp-note');
        if (noteEl) {
            noteEl.innerHTML = `<i class="fas fa-robot"></i> ${
                spread > 5 ? `Carry trade atractivo (TIIE�Fed +${spread.toFixed(2)} pp). ` : `Diferencial TIIE�Fed: +${spread.toFixed(2)} pp. `
            }${realRate >= 0 ? `Tasa real: +${realRate.toFixed(2)}%.` : `Tasa real negativa: ${realRate.toFixed(2)}%.`
            }${vix != null ? ` VIX ${vix.toFixed(1)} (${vixLevel?.toLowerCase()}).` : ''
            }${move != null ? ` MOVE ${move.toFixed(0)}${move > 120 ? ' � tensi�n en bonos.' : '.'}` : ''}`;
        }
    } catch (e) {
        console.error('loadRiskPanel error:', e);
    }
}

async function loadMarketForecasts() {
    const ASSETS = [
        { ticker: '^MXX',     label: '???? IPC M�xico' },
        { ticker: '^GSPC',    label: '???? S&P 500'    },
        { ticker: 'USDMXN=X', label: '???? USD/MXN'    },
        { ticker: 'EURUSD=X', label: '???? EUR/USD'    },
        { ticker: 'GC=F',     label: '?? Oro'         },
        { ticker: 'BTC-USD',  label: '? Bitcoin'      },
    ];

    const results = await Promise.allSettled(ASSETS.map(a => fetchAssetData(a.ticker)));

    function fmtPrice(p) {
        if (p == null) return '�';
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
        const arrow = trend === 'up' ? '?' : trend === 'down' ? '?' : '?';
        const pctStr = pct != null ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '�';

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

        const hygEl = $('credit-hyg');
        if (hygEl) { hygEl.textContent = fmtPct(hygPct); hygEl.style.color = (typeof hygPct === 'number') ? (hygPct >= 0 ? '#16a34a' : '#dc2626') : '#0f172a'; }
        const lqdEl = $('credit-lqd');
        if (lqdEl) { lqdEl.textContent = fmtPct(lqdPct); lqdEl.style.color = (typeof lqdPct === 'number') ? (lqdPct >= 0 ? '#16a34a' : '#dc2626') : '#0f172a'; }

        const noteEl = $('credit-note');
        if (noteEl && typeof hygPct === 'number' && typeof lqdPct === 'number') {
            const spread = hygPct - lqdPct;
            noteEl.innerHTML = `<i class="fas fa-robot"></i> ${
                spread > 0.15
                    ? 'El cr�dito de alto rendimiento supera al de grado de inversi�n: apetito de riesgo global en modo "risk-on".'
                    : spread < -0.15
                        ? 'El cr�dito de grado de inversi�n supera al de alto rendimiento: se�al de aversi�n al riesgo ("risk-off") en mercados globales.'
                        : 'Apetito de riesgo crediticio global equilibrado entre deuda de alto rendimiento y grado de inversi�n.'
            }`;
        }
    } catch (e) {
        console.error('loadCreditRisk error:', e);
    }
}

let _fxEmergingChart = null;

async function loadEmergingFX() {
    const canvas = document.getElementById('fx-emerging-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const FX = [
        { ticker: 'USDMXN=X', label: '???? Peso Mexicano' },
        { ticker: 'USDBRL=X', label: '???? Real Brasile�o' },
        { ticker: 'USDCOP=X', label: '???? Peso Colombiano' },
        { ticker: 'USDCLP=X', label: '???? Peso Chileno' },
        { ticker: 'USDINR=X', label: '???? Rupia India' },
        { ticker: 'USDZAR=X', label: '???? Rand Sudafricano' },
        { ticker: 'USDTRY=X', label: '???? Lira Turca' },
        { ticker: 'USDIDR=X', label: '???? Rupia Indonesia' },
    ];

    const results = await Promise.allSettled(FX.map(f => fetchAssetData(f.ticker)));
    const labels = FX.map(f => f.label);
    const data = FX.map((f, i) => {
        const meta = results[i].status === 'fulfilled' ? results[i].value?.meta : null;
        const pct  = meta?.regularMarketChangePercent;
        return (typeof pct === 'number') ? -pct : null;
    });
    const colors = data.map(v => v == null ? '#cbd5e1' : v >= 0 ? '#16a34a' : '#dc2626');

    if (_fxEmergingChart) {
        _fxEmergingChart.data.datasets[0].data = data;
        _fxEmergingChart.data.datasets[0].backgroundColor = colors;
        _fxEmergingChart.update();
        return;
    }

    _fxEmergingChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Variaci�n frente al USD (%)',
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
                tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x >= 0 ? '+' : ''}${ctx.parsed.x?.toFixed(2)}%` } },
            },
            scales: {
                x: {
                    ticks: { callback: v => v + '%', font: { size: 10 } },
                    grid: { color: 'rgba(0,0,0,0.05)' },
                },
                y: {
                    ticks: { font: { size: 10 } },
                    grid: { display: false },
                },
            },
        },
    });
}

let _moversChart = null;

async function loadTopMovers() {
    const GLOBAL_TICKERS = [
        { ticker: 'GFNORTEO.MX', label: '???? Banorte' },
        { ticker: 'AMXB.MX',     label: '???? Am�rica M�vil' },
        { ticker: 'FEMSAUBD.MX', label: '???? FEMSA' },
        { ticker: 'CEMEXCPO.MX', label: '???? Cemex' },

        { ticker: 'AAPL',  label: '???? Apple' },
        { ticker: 'MSFT',  label: '???? Microsoft' },
        { ticker: 'NVDA',  label: '???? NVIDIA' },
        { ticker: 'TSLA',  label: '???? Tesla' },

        { ticker: 'SAP.DE',  label: '???? SAP' },
        { ticker: 'SHEL.L',  label: '???? Shell' },
        { ticker: 'MC.PA',   label: '???? LVMH' },
        { ticker: 'AZN.L',   label: '???? AstraZeneca' },

        { ticker: '7203.T',     label: '???? Toyota' },
        { ticker: '0700.HK',    label: '???? Tencent' },
        { ticker: '005930.KS',  label: '???? Samsung' },
        { ticker: '9988.HK',    label: '???? Alibaba' },

        { ticker: 'PETR4.SA',     label: '???? Petrobras' },
        { ticker: 'VALE3.SA',     label: '???? Vale' },
        { ticker: 'RELIANCE.NS',  label: '???? Reliance' },
    ];

    const results = await Promise.allSettled(GLOBAL_TICKERS.map(a => fetchAssetData(a.ticker)));

    const rows = GLOBAL_TICKERS.map((a, i) => {
        const data = results[i].status === 'fulfilled' ? results[i].value : null;
        const pct  = data?.meta?.regularMarketChangePercent;
        return { label: a.label, pct: (typeof pct === 'number') ? pct : null };
    }).filter(r => r.pct != null);

    rows.sort((a, b) => b.pct - a.pct);
    const gainers = rows.slice(0, 4);
    const losers  = rows.slice(-4).reverse();
    const combined = [...gainers, ...losers.slice().reverse()]; 

    const canvas = document.getElementById('movers-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = combined.map(r => r.label);
    const data   = combined.map(r => r.pct);
    const colors = data.map(v => v >= 0 ? '#16a34a' : '#dc2626');

    if (_moversChart) {
        _moversChart.data.labels = labels;
        _moversChart.data.datasets[0].data = data;
        _moversChart.data.datasets[0].backgroundColor = colors;
        _moversChart.update();
        return;
    }

    _moversChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Variaci�n diaria (%)',
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
                tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x >= 0 ? '+' : ''}${ctx.parsed.x?.toFixed(2)}%` } },
            },
            scales: {
                x: {
                    ticks: { callback: v => v + '%', font: { size: 10 } },
                    grid: { color: 'rgba(0,0,0,0.05)' },
                },
                y: {
                    ticks: { font: { size: 10 } },
                    grid: { display: false },
                },
            },
        },
    });
}

// --- Sorpresa Econ�mica en Calendario ----------------------------------------
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
                const label = cls === 'beat' ? '? Real:' : cls === 'miss' ? '? Real:' : '� Real:';
                pill.textContent = `${label} ${realVal}`;
            } else {
                pill.className = 'cal-real pending';
                pill.textContent = 'Real: pendiente';
            }
            if (imp) meta.insertBefore(pill, imp); else meta.appendChild(pill);

        } else if (cardDate.getTime() === today.getTime()) {
            const badge = document.createElement('span');
            badge.className = 'cal-today-badge';
            badge.textContent = '? HOY';
            card.querySelector('.cal-card-date')?.appendChild(badge);

        } else {
            const daysLeft = Math.ceil((cardDate - today) / 86400000);
            const badge = document.createElement('span');
            badge.className = 'cal-upcoming-badge';
            badge.textContent = daysLeft === 1 ? 'Ma�ana' : `en ${daysLeft}d`;
            if (imp) meta.insertBefore(badge, imp); else meta.appendChild(badge);
        }
    });
}

// --- Watchlist Personalizable -------------------------------------------------
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
    const customEl  = document.getElementById('bmv-custom');
    const customBtn = document.getElementById('bmv-custom-btn');
    if (customEl && customBtn) { customEl.value = ticker; customBtn.click(); }
    document.getElementById('ch-wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function wlRender() {
    const list = wlLoad();
    const el = document.getElementById('wl-list');
    if (!el) return;
    if (!list.length) {
        el.innerHTML = '<div style="color:#94a3b8;font-size:.74rem;grid-column:1/-1;text-align:center;padding:1rem;border:1px dashed #e2e8f0;border-radius:8px;">Sin tickers. Agrega cualquier s�mbolo burs�til, divisa o cripto arriba.</div>';
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
        const pctStr  = pct != null ? (isUp ? '+' : '') + pct.toFixed(2) + '%' : '�';
        const priceStr = price != null
            ? (price >= 10000 ? price.toLocaleString('es-MX', { maximumFractionDigits: 0 })
             : price >= 1000  ? price.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
             : price >= 10    ? price.toFixed(2)
             : price.toFixed(4)) : '�';

        const nameHtml = name
            ? `<div class="wl-name">${name}</div>`
            : (price == null ? `<div class="wl-name" style="color:#f59e0b;" title="Verifica el s�mbolo: usa GFNORTEO.MX para BMV, BTC-USD para cripto, USDMXN=X para divisas">? s�mbolo no encontrado</div>` : '<div class="wl-name"></div>');

        const triggered = item.alertPrice != null && price != null &&
            (item.alertDir === 'above' ? price >= item.alertPrice : price <= item.alertPrice);
        const alertBadge = triggered
            ? `<span class="wl-alert-badge wl-alert-ok">?? ${item.alertDir === 'above' ? '?' : '?'} ${item.alertPrice}</span>`
            : item.alertPrice != null
                ? `<span class="wl-alert-badge">${item.alertDir === 'above' ? '?' : '?'} ${item.alertPrice}</span>`
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
                    <button class="wl-rm" data-wl-rm="${idx}" title="Eliminar" onclick="event.stopPropagation();wlRemove(${idx})">?</button>
                </div>
                <div style="display:flex;gap:.2rem;align-items:center;" onclick="event.stopPropagation()">
                    <select data-wl-dir="${idx}" style="font-size:.58rem;border:1px solid #e2e8f0;border-radius:4px;padding:1px 3px;outline:none;cursor:pointer;" onchange="wlSetAlert(${idx}, document.querySelector('[data-wl-price=\\'${idx}\\']')?.value, this.value)">
                        <option value="above" ${item.alertDir !== 'below' ? 'selected' : ''}>? =</option>
                        <option value="below" ${item.alertDir === 'below' ? 'selected' : ''}>? =</option>
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

const REFRESH_MS = 20 * 60 * 1000; // 20 min � refresco de datos financieros

// --- Reservas Internacionales + CETES vs T-Bill ----------------------------
async function loadMacroMexico() {
    try {
        // 1. Reservas internacionales (SF290383)
        const resR = await fetch('/api/banxico/SF290383').then(r => r.ok ? r.json() : null).catch(() => null);
        const resDatos = resR?.bmx?.series?.[0]?.datos || [];
        const resVals  = resDatos.map(d => parseFloat(d.dato)).filter(v => !isNaN(v));
        const resCurr  = resVals[resVals.length - 1] ?? null;
        const resPrev  = resVals[resVals.length - 2] ?? null;

        const resEl = document.getElementById('res-val');
        const resChgEl = document.getElementById('res-chg');
        if (resEl && resCurr != null) {
            resEl.textContent = '$' + resCurr.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MDD';
            if (resChgEl && resPrev != null) {
                const diff = resCurr - resPrev;
                resChgEl.textContent = (diff >= 0 ? '?' : '?') + ' ' + Math.abs(diff).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MDD vs sem. ant.';
                resChgEl.className = diff >= 0 ? 'up' : 'down';
            }
        }
        const flujosR = await fetch('/api/banxico/SF43883').then(r => r.ok ? r.json() : null).catch(() => null);
        const flujosDatos = flujosR?.bmx?.series?.[0]?.datos || [];
        const flujosVals  = flujosDatos.map(d => parseFloat(d.dato)).filter(v => !isNaN(v));
        const flujosCurr  = flujosVals[flujosVals.length - 1] ?? null;
        const flujosPrev  = flujosVals[flujosVals.length - 2] ?? null;

        const flujosEl    = document.getElementById('flujos-val');
        const flujosChgEl = document.getElementById('flujos-chg');
        if (flujosEl && flujosCurr != null) {
            flujosEl.textContent = '$' + flujosCurr.toLocaleString('es-MX', { maximumFractionDigits: 1 }) + ' mmdp';
            if (flujosChgEl && flujosPrev != null) {
                const diff = flujosCurr - flujosPrev;
                flujosChgEl.textContent = (diff >= 0 ? '? Entrada ' : '? Salida ') + Math.abs(diff).toLocaleString('es-MX', { maximumFractionDigits: 1 }) + ' mmdp';
                flujosChgEl.className = diff >= 0 ? 'up' : 'down';
                flujosChgEl.style.fontWeight = '700';
                flujosChgEl.style.fontSize = '.62rem';
            }
        }
        const [cetesR, tbillR] = await Promise.allSettled([
            fetch('/api/banxico/SF43936').then(r => r.ok ? r.json() : null).catch(() => null),
            fetch('/api/stock-history?ticker=^IRX&interval=1d&range=5d').then(r => r.ok ? r.json() : null).catch(() => null),
        ]);

        const cetesData = cetesR.status === 'fulfilled' ? cetesR.value?.bmx?.series?.[0]?.datos || [] : [];
        const cetesVals = cetesData.map(d => parseFloat(d.dato)).filter(v => !isNaN(v));
        const cetes28   = cetesVals[cetesVals.length - 1] ?? null;

        const tbill4w = tbillR.status === 'fulfilled' ? (tbillR.value?.meta?.regularMarketPrice ?? null) : null;
        const euribor = 2.65; // ECB reference rate (approximated)

        const compareEl = document.getElementById('tbill-compare');
        if (compareEl) {
            const items = [
                { label: '???? CETES 28D',   val: cetes28,  note: 'M�xico � Banxico SIE', winner: true },
                { label: '???? T-Bill 4W',   val: tbill4w,  note: 'EE.UU. � US Treasury' },
                { label: '???? Euribor ref.', val: euribor,  note: 'Zona Euro � BCE (aprox.)' },
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

        // Note
        const noteEl = document.getElementById('reservas-note');
        if (noteEl) {
            const resNote = resCurr != null ? `Reservas internacionales en $${resCurr.toLocaleString('es-MX', { maximumFractionDigits: 1 })} MDD. ` : '';
            const flujoNote = flujosCurr != null && flujosPrev != null
                ? `Flujo de capital extranjero en bonos MX: ${(flujosCurr - flujosPrev) >= 0 ? 'entrada' : 'salida'} de capitales. `
                : '';
            const carryNote = cetes28 != null && tbill4w != null
                ? `Diferencial carry CETES-TBill: +${(cetes28 - tbill4w).toFixed(2)}pp � atractivo para inversi�n extranjera en deuda mexicana.`
                : 'Comparativa de tasas cargando�';
            noteEl.innerHTML = `<i class="fas fa-robot"></i> ${resNote}${flujoNote}${carryNote}`;
        }
    } catch (e) {
        console.error('loadMacroMexico error:', e);
    }
}


async function refreshAll() {
    _assetDataCache.clear();
    ['SF61745', 'SF43718', 'SP74660'].forEach(s => VDS.clear('bnx_' + s));

    cargarFinanzas().catch(e => console.error('cargarFinanzas error:', e));
    loadMktCap().catch(e => console.error('loadMktCap error:', e));
    updateTicker().catch(e => console.error('updateTicker error:', e));
    loadBonds().catch(e => console.error('loadBonds error:', e));
    loadRiskPanel().catch(e => console.error('loadRiskPanel error:', e));
    loadMarketForecasts().catch(e => console.error('loadMarketForecasts error:', e));
    loadTopMovers().catch(e => console.error('loadTopMovers error:', e));
    loadEmergingFX().catch(e => console.error('loadEmergingFX error:', e));
    loadCreditRisk().catch(e => console.error('loadCreditRisk error:', e));
    loadPetroleo().catch(e => console.error('loadPetroleo error:', e));
    loadBolsaNews().catch(e => console.error('loadBolsaNews error:', e));
    loadMacroMexico().catch(e => console.error('loadMacroMexico error:', e));
    // Nuevas funciones
    loadFxStrip().catch(e => console.error('loadFxStrip error:', e));
    loadBitcoinDominance().catch(e => console.error('loadBitcoinDominance error:', e));
    // Fear & Greed requiere que _rds tenga datos; se carga con delay corto
    setTimeout(() => loadFearGreed().catch(e => console.error('loadFearGreed error:', e)), 2000);
}

(async () => {
    await refreshAll();
    initCalendarSurprise();
    wlRender();

    setInterval(refreshAll, 5 * 60 * 1000);
    setInterval(() => VDS.clear(FIN_CK), REFRESH_MS);
})();

/* === Script bloque lineas 2911-3328 === */
const CAL_PROFILES = {
  banxico: {
    icon:'??', category:'Politica Monetaria � Mexico',
    context:'La Junta de Gobierno de Banxico se reune cada 6 semanas para decidir la Tasa de Interes Interbancaria de Equilibrio (TIIE). Sus decisiones afectan directamente el costo de todos los creditos en Mexico y el atractivo del peso para inversores extranjeros via carry trade.',
    methodology:'Banxico vota por mayoria de 5 miembros. La lect    ura hawkish (pausa/alza) fortalece el peso; la dovish (recorte) lo debilita. El diferencial TIIE-Fed Funds determina el carry trade MXN-USD.',
    keyQuestions:['�Se mantiene el diferencial con la Fed?','�La inflacion converge a la meta del 3%?','�Hay riesgos externos: USMCA, aranceles?','�Comunicado mas hawkish o dovish vs reunion anterior?'],
    markets:[
      {a:'USD/MXN', beat:'Aprecia peso (carry atractivo)', miss:'Deprecia peso (menor carry)'},
      {a:'IPC BMV', beat:'Sube (menor costo de capital)', miss:'Baja (presion en valuaciones)'},
      {a:'Mbonos', beat:'Precios bajan (tasas suben)', miss:'Precios suben (tasas bajan)'},
      {a:'TIIE 28D', beat:'Alza si hawkish', miss:'Recorte si dovish'},
    ],
  },
  fomc: {
    icon:'??', category:'Politica Monetaria � EE.UU.',
    context:'El Comite Federal de Mercado Abierto (FOMC) se reune 8 veces al ano. Sus decisiones determinan el costo del dinero global. El lenguaje del comunicado y la conferencia de prensa de Powell tienen tanto peso como la decision en si.',
    methodology:'El FOMC vota por mayoria. El dot plot proyecta expectativas de tasas a futuro. El mercado descuenta probabilidades via futuros de Fed Funds (CME FedWatch Tool).',
    keyQuestions:['�El dot plot cambio vs reunion anterior?','�Powell fue hawkish (mas restriccion) o dovish (menos)?','�Hay disidentes en el voto?','�Se menciono el balance sheet (QT/QE)?'],
    markets:[
      {a:'DXY / Dolar', beat:'DXY s     ube (hawkish/alza)', miss:'DXY cae (dovish/recorte)'},
      {a:'S&P 500', beat:'Cae con hawkish', miss:'Sube con dovish/recorte'},
      {a:'T-Note 10Y', beat:'Rend. sube con hawkish', miss:'Rend. baja con dovish'},
      {a:'USD/MXN', beat:'Peso se deprecia', miss:'Peso se aprecia'},
      {a:'Oro (XAU/USD)', beat:'Baja con hawkish', miss:'Sube con dovish'},
    ],
  },
  pce: {
    icon:'??', category:'Inflacion � EE.UU. (Favorito Fed)',
    context:'El PCE (Personal Consumption Expenditures) es el indicador de inflacion favorito de la Fed, mas amplio que el CPI. El PCE core (sin alimentos ni energia) es el que realmente guia las decisiones del FOMC. Un PCE elevado retrasa los recortes.',
    methodology:'Se publica mensualmente por la BEA. Un resultado mayor al estimado = inflacion persistente = Fed hawkish. Un resultado menor al estimado = camino libre para recortes.',
    keyQuestions:['�PCE core mayor o menor a 2% meta de la Fed?','�Presion en servicios o bienes?','�Implicaciones para el siguiente FOMC?','�Cambia el dot plot implicitamente?'],
    markets:[
      {a:'T-Note 10Y', beat:'Rend. sube (menos recortes)', miss:'Rend. baja (mas recortes)'},
      {a:'DXY / Dolar', beat:'Dolar sube', miss:'Dolar baja'},
      {a:'S&P 500', beat:'Cae (recortes mas lejanos)', miss:'Sube (recortes mas cercanos)'},
      {a:'USD/MXN', beat:'Peso se deprecia', miss:'Peso se aprecia'},
      {a:'Oro', beat:'Baja', miss:'Sube'},
    ],
  },
  cpi_us: {
    icon:'??', category:'Inflacion � EE.UU.',
    context:'El Indice de Precios al Consumidor (CPI) de EE.UU. es el indicador de inflacion de mayor impacto de mercado. El CPI core (sin alimentos/energia) es lo que mas vigila el mercado. Un dato por encima del estimado aleja los recortes de tasas.',
    methodology:'Publicado por la BLS. Core CPI y Supercore (servicios ex-vivienda) son los componentes clave. Meta implicita de la Fed: ~2% en PCE (equivale a ~2.3% CPI).',
    keyQuestions:['�Supercore CPI a la baja?','�Componente de vivienda (shelter) cediendo?','�Impacto de aranceles visible en bienes?','�Cambia el pricing del FOMC?'],
    markets:[
      {a:'T-Note 10Y', beat:'Rend. sube', miss:'Rend. baja'},
      {a:'DXY', beat:'Sube', miss:'Baja'},
      {a:'S&P 500', beat:'Cae', miss:'Sube'},
      {a:'USD/MXN', beat:'Peso se deprecia', miss:'Peso se aprecia'},
      {a:'Cripto (BTC)', beat:'Baja (risk-off)', miss:'Sube (risk-on)'},
    ],
  },
  nfp: {
    icon:'??', category:'Mercado Laboral � EE.UU.',
    context:'El Non-Farm Payrolls (NFP) es el reporte de empleo mas importante del mundo. Se publica el primer viernes de cada mes. Mueve simultaneamente al dolar, bonos, acciones y materias primas. Incluye la tasa de desempleo y el crecimiento salarial.',
    methodology:'Publicado por la BLS. Un NFP mayor al estimado = economia fuerte = Fed hawkish. Pero si los salarios tambien suben, aumenta la inflacion. El numero de revisiones del mes anterior tambien importa.',
    keyQuestions:['�Crecimiento salarial (wage growth) mayor o menor a 3.5%?','�Participacion laboral cambia?','�El sector mas debil es manufactura o servicios?','�Revision del mes anterior fue negativa?'],
    markets:[
      {a:'DXY / Dolar', beat:'Sube (economia solida)', miss:'Cae (economia debil)'},
      {a:'T-Note 10Y', beat:'Rend. sube (menos recortes)', miss:'Rend. baja (mas recortes)'},
      {a:'S&P 500', beat:'Mixto (bueno econ., malo para Fed)', miss:'Mixto (malo econ., bueno para Fed)'},
      {a:'USD/MXN', beat:'Peso puede debilitarse', miss:'Peso puede fortalecerse'},
      {a:'Petroleo WTI', beat:'Sube (demanda solida)', miss:'Baja (demanda debil)'},
    ],
  },
  inpc: {
    icon:'??', category:'Inflacion � Mexico',
    context:'El Indice Nacional de Precios al Consumidor (INPC) mide la inflacion en Mexico. La meta de Banxico es 3% +/- 1 punto porcentual. Un INPC por debajo del estimado da margen a Banxico para recortar la TIIE y apoyar el crecimiento.',
    methodology:'Publicado por INEGI quincenalmente y mensualmente. La inflacion subyacente (sin energia y agropecuarios) es la que mas vigila Banxico. Meta: 3% con intervalo 2%-4%.',
    keyQuestions:['�Inflacion subyacente menor a 4%?','�Presion en alimentos o servicios?','�Da margen Banxico para continuar recortes?','�Convergencia con meta del 3% en 2026?'],
    markets:[
      {a:'USD/MXN', beat:'Peso aprecia (mas recortes Banxico)', miss:'Peso deprecia (Banxico pausa)'},
      {a:'IPC BMV', beat:'Sube (menor costo capital)', miss:'Baja (tasas altas mas tiempo)'},
      {a:'Mbonos', beat:'Precios suben (rend. bajan)', miss:'Precios bajan (rend. suben)'},
      {a:'CETES 28D', beat:'Rendimiento baja', miss:'Rendimiento sube'},
    ],
  },
  gdp_mx: {
    icon:'??', category:'Actividad Economica � Mexico',
    context:'El estimado preliminar del PIB de Mexico (IOAE) da la primera lectura del crecimiento trimestral. Mexico enfrenta headwinds por la debilidad de EE.UU., menor inversion publica y el nearshoring aun en fases tempranas.',
    methodology:'Publicado por INEGI. El PIB se desglosa en actividades primarias, secundarias (industria) y terciarias (servicios). El componente de manufacturera de exportacion es clave por su relacion con EE.UU.',
    keyQuestions:['�Sector manufactura crece o contrae?','�Consumo privado sigue siendo el motor?','�Inversion fija bruta (nearshoring) acelera?','�Riesgo de recesion tecnica (2 trimestres negativos)?'],
    markets:[
      {a:'USD/MXN', beat:'Peso aprecia', miss:'Peso deprecia'},
      {a:'IPC BMV', beat:'Sube (crecimiento)', miss:'Baja (riesgo soberano)'},
      {a:'CDS Mexico 5Y', beat:'Spread se comprime', miss:'Spread se amplia'},
      {a:'Mbonos', beat:'Precios suben', miss:'Precios bajan'},
    ],
  },
  unemployment_us: {
    icon:'??', category:'Mercado Laboral � EE.UU.',
    context:'La tasa de desempleo de EE.UU. es el indicador laboral de referencia. La Fed tiene doble mandato: estabilidad de precios Y maximo empleo. Un desempleo al alza presiona a la Fed a recortar tasas incluso si la inflacion no llego a la meta.',
    methodology:'Publicado mensualmente junto con el NFP. La SAHM Rule dice que si el promedio movil de 3 meses del desempleo sube 0.5% vs el minimo del ano anterior, hay riesgo de recesion.',
    keyQuestions:['�Tasa U-3 (desempleo oficial) mayor a 4.5%?','�La SAHM Rule se activo?','�Desempleo entre jovenes y minoras aumenta?','�Es por menor demanda o mayor oferta laboral?'],
    markets:[
      {a:'DXY', beat:'Dolar baja (Fed dovish)', miss:'Dolar sube (Fed hawkish)'},
      {a:'S&P 500', beat:'Sube (recortes mas probables)', miss:'Baja (presion recesion)'},
      {a:'T-Note 10Y', beat:'Rend. baja', miss:'Rend. sube'},
      {a:'USD/MXN', beat:'Peso se aprecia', miss:'Peso se deprecia'},
    ],
  },
  bce: {
    icon:'????', category:'Politica Monetaria � Eurozona',
    context:'El Banco Central Europeo (BCE) gestiona la politica monetaria para los 20 paises de la Eurozona. Sus decisiones mueven el EUR/USD, los bonos soberanos europeos y los flujos de capital hacia mercados emergentes.',
    methodology:'El Consejo de Gobierno del BCE vota la tasa de deposito, la principal de refinanciacion y la marginal de prestamo. La conferencia de prensa de Lagarde orienta las expectativas futuras.',
    keyQuestions:['�El BCE diferencia su postura vs la Fed?','�La inflacion de servicios en Europa cede?','�Hay riesgo de fragmentacion en spreads perifericos?','�El TPI (anti-fragmentacion) se menciona?'],
    markets:[
      {a:'EUR/USD', beat:'EUR sube (BCE hawkish)', miss:'EUR baja (BCE dovish)'},
      {a:'EUR/MXN', beat:'EUR/MXN sube', miss:'EUR/MXN baja'},
      {a:'Bund 10A', beat:'Rend. sube con alza', miss:'Rend. baja con recorte'},
      {a:'BTP-Bund Spread', beat:'Comprime (hawkish da credibilidad)', miss:'Amplia (dovish baja defensa)'},
    ],
  },
  boj: {
    icon:'????', category:'Politica Monetaria � Japon',
    context:'El Banco de Japon (BOJ) es el ultimo gran banco central con tasas ultra-bajas. Su salida del YCC (Yield Curve Control) y la normalizacion de tasas genera movimientos masivos en el yen. El carry trade JPY es uno de los mas grandes del mundo.',
    methodology:'El BOJ se reune cada 6 semanas. Una sorpresa hawkish (alza o senales de alza) dispara el cierre del carry trade: el yen sube abruptamente y los activos de riesgo globales caen. Agosto 2024 fue un ejemplo historico.',
    keyQuestions:['�Se ajusta el objetivo de JGB 10Y?','�Sube la tasa de politica por encima de 0.5%?','�El lenguaje se�ala mas alzas?','�Impacto en USD/JPY y carry trade global?'],
    markets:[
      {a:'USD/JPY', beat:'JPY se aprecia (yen sube)', miss:'JPY se deprecia (yen baja)'},
      {a:'S&P 500', beat:'Cae (cierre de carry risk-off)', miss:'Sube (carry trade se mantiene)'},
      {a:'JGB 10A', beat:'Rend. sube', miss:'Rend. baja'},
      {a:'USD/MXN', beat:'Peso puede deprec. (risk-off)', miss:'Peso estable'},
      {a:'Oro', beat:'Volatil', miss:'Estable'},
    ],
  },
  boe: {
    icon:'????', category:'Politica Monetaria � Reino Unido',
    context:'El Banco de Inglaterra (BOE) enfrenta el dilema de inflacion estructural post-Brexit vs desaceleracion economica. Sus decisiones mueven la libra esterlina (GBP) y los Gilts, con impacto en flujos hacia mercados emergentes.',
    methodology:'El Comite de Politica Monetaria (MPC) vota 9 miembros. Un voto dividido (ej. 5-4) genera mas volatilidad que un voto unanime.',
    keyQuestions:['�El MPC esta dividido en el voto?','�La inflacion en servicios UK sigue mayor a 5%?','�La libra tiene presion de los Gilts?','�Diferencial GBP vs EUR/USD?'],
    markets:[
      {a:'GBP/USD', beat:'GBP sube (hawkish)', miss:'GBP baja (dovish)'},
      {a:'Gilt 10A', beat:'Rend. sube', miss:'Rend. baja'},
      {a:'FTSE 100', beat:'Mixto', miss:'Mixto'},
      {a:'GBP/MXN', beat:'GBP/MXN sube', miss:'GBP/MXN baja'},
    ],
  },
  opec: {
    icon:'??', category:'Commodities � Energia',
    context:'La OPEP+ (OPEC y aliados incluyendo Rusia) controla ~40% de la produccion mundial de crudo. Sus decisiones sobre cuotas de produccion mueven el precio del WTI y el Brent. Dado que Mexico es exportador de crudo (Pemex), el precio del petroleo afecta directamente las finanzas publicas y el peso.',
    methodology:'Las decisiones son por consenso entre los 23 paises miembros. Un recorte de produccion eleva precios; un aumento los deprime. Arabia Saudita y Rusia son los swing producers clave.',
    keyQuestions:['�Se recorta, mantiene o aumenta la produccion?','�Arabia Saudita hace recortes unilaterales adicionales?','�Hay incumplimiento de cuotas por Rusia/Iraq?','�La decision es por 1 mes o multi-mes?'],
    markets:[
      {a:'WTI / Brent', beat:'Sube (recorte) / Baja (aumento)', miss:'Baja (aumento) / Sube (recorte)'},
      {a:'USD/MXN', beat:'Peso aprecia (mas ingr. Pemex)', miss:'Peso deprecia (menos ingr.)'},
      {a:'Gasolina', beat:'Sube en EE.UU.', miss:'Baja en EE.UU.'},
      {a:'Lineas aereas', beat:'Caen (mayor costo combustible)', miss:'Suben (menor costo)'},
    ],
  },
  eia: {
    icon:'?', category:'Inventarios de Crudo � EE.UU. (Semanal)',
    context:'El reporte semanal de inventarios de crudo del EIA (Energy Information Administration) se publica cada miercoles a las 10:30 EST. Una reduccion inesperada de inventarios implica mayor demanda o menor oferta, moviendo el WTI 1-3% en minutos. Es el evento mas volatil del mercado de energia.',
    methodology:'Se compara el cambio en inventarios vs el consenso de los analistas (Bloomberg/Reuters survey). La variacion en Cushing (hub de Oklahoma) y el cambio en produccion de EE.UU. tambien importan.',
    keyQuestions:['�Bajan o suben mas de lo esperado?','�Cambio en inventarios de gasolina?','�Produccion de EE.UU. sigue en maximos historicos?','�Cambio en inventarios de destilados (diesel)?'],
    markets:[
      {a:'WTI Crudo', beat:'Sube (bajan inv. mayor al est.)', miss:'Baja (suben inv. mayor al est.)'},
      {a:'Brent', beat:'Sube', miss:'Baja'},
      {a:'USD/MXN', beat:'Peso aprecia', miss:'Peso deprecia'},
      {a:'Gasolineras / Refinadoras', beat:'Mixto', miss:'Mixto'},
    ],
  },
  earnings: {
    icon:'??', category:'Resultados Corporativos � Mega-Cap',
    context:'Los resultados de las empresas mega-cap tecnologicas (Apple, Microsoft, Meta, Alphabet, Nvidia) mueven el S&P 500 y el NASDAQ 100 de forma significativa. Representan hasta 30% del indice. Los resultados del IPC tambien son relevantes para el mercado mexicano.',
    methodology:'Se compara EPS (ganancia por accion) y Revenue vs consenso de analistas. El guidance (proyeccion futura) pesa tanto como el resultado historico. El after-hours es la primera lectura.',
    keyQuestions:['�EPS y Revenue superan el consenso?','�El guidance fue conservador o agresivo?','�Margenes mejoran o deterioran?','�La IA monetiza o sigue siendo capex puro?'],
    markets:[
      {a:'S&P 500 / NASDAQ', beat:'Sube (resultados solidos)', miss:'Baja (decepcion)'},
      {a:'IPC BMV', beat:'Puede subir por correlacion', miss:'Puede bajar'},
      {a:'USD/MXN', beat:'Risk-on: Peso aprecia', miss:'Risk-off: Peso deprecia'},
      {a:'Volatilidad (VIX)', beat:'Cae', miss:'Sube'},
    ],
  },
  earnings_finance: {
    icon:'??', category:'Resultados Bancarios � EE.UU.',
    context:'JPMorgan Chase abre la temporada de resultados del sector financiero. El sector bancario es el termometro de la salud del credito en EE.UU. Los resultados de JPM, Bank of America, Goldman y Citigroup marcan la pauta de apetito de riesgo global para el trimestre.',
    methodology:'Vigilar: NII (Net Interest Income), provision para creditos, trading revenue y comentarios sobre la economia. Los comentarios del CEO Jamie Dimon sobre condiciones economicas tienen impacto directo.',
    keyQuestions:['�NII (margen de tasas) se mantiene con recortes en camino?','�Provisions para creditos suben (riesgo consumidor)?','�Trading revenues compensan?','�Comentarios sobre economia de Jamie Dimon?'],
    markets:[
      {a:'S&P 500 / XLF (Bancos)', beat:'Sube', miss:'Baja'},
      {a:'IPC BMV', beat:'Correlacion positiva', miss:'Correlacion negativa'},
      {a:'USD/MXN', beat:'Risk-on, Peso aprecia', miss:'Risk-off, Peso deprecia'},
      {a:'T-Note 10Y', beat:'Rend. puede subir', miss:'Rend. puede bajar'},
    ],
  },
  default: {
    icon:'??', category:'Evento Economico',
    context:'Este evento economico puede tener impacto en los mercados financieros globales y especialmente en activos mexicanos. Monitorear el resultado vs el estimado del consenso.',
    methodology:'Comparar el dato publicado vs el consenso de analistas. Una sorpresa positiva o negativa puede generar movimientos en divisas, bonos y acciones.',
    keyQuestions:['�El resultado supero o decepciono al consenso?','�Cambia las expectativas de politica monetaria?','�Impacto en activos mexicanos (MXN, IPC)?'],
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
  if (t.includes('boj') || t.includes('japon') || t.includes('jap�n')) return CAL_PROFILES.boj;
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
  else if (daysLeft === 0) status = '�Hoy!';
  else if (daysLeft === 1) status = 'Manana';
  else status = 'En ' + daysLeft + ' dias';

  var statusColor = daysLeft === null ? '#64748b' : daysLeft <= 0 ? '#94a3b8' : daysLeft <= 3 ? '#dc2626' : daysLeft <= 7 ? '#d97706' : '#16a34a';

  /* Importance */
  var impColors = {high:{bg:'linear-gradient(135deg,#7f1d1d,#991b1b)',badge:'#fca5a5',text:'IMPACTO ALTO'},med:{bg:'linear-gradient(135deg,#78350f,#92400e)',badge:'#fde68a',text:'IMPACTO MEDIO'},low:{bg:'linear-gradient(135deg,#14532d,#166534)',badge:'#bbf7d0',text:'IMPACTO BAJO'}};
  var imp = impColors[impClass] || impColors.med;

  /* Surprise analysis */
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
    surpriseText = beat ? ('Sorpresa POSITIVA: Real (' + realAttr + ') supero el estimado (' + estNumAttr + ') por ' + absDiff) : miss ? ('Sorpresa NEGATIVA: Real (' + realAttr + ') decepciono vs estimado (' + estNumAttr + ') por ' + absDiff) : ('En linea: Real (' + realAttr + ') igual� el estimado (' + estNumAttr + ')');
  }

  /* Header */
  var hdr = document.getElementById('cm-header');
  if (hdr) hdr.style.background = imp.bg;
  document.getElementById('cm-flag').textContent = flag || profile.icon;
  document.getElementById('cm-title').textContent = title;
  document.getElementById('cm-category').textContent = profile.category;
  document.getElementById('cm-date').textContent = dateText;
  var ibadge = document.getElementById('cm-imp-badge');
  if (ibadge) { ibadge.textContent = imp.text; ibadge.style.background = 'rgba(255,255,255,.15)'; ibadge.style.color = imp.badge; }

  /* Status section */
  var statusEl = document.getElementById('cm-status');
  if (statusEl) statusEl.innerHTML = [
    '<div class="bm-metric-row"><span class="bm-metric-lbl">Estado</span><span class="bm-metric-val" style="color:'+statusColor+'">'+status+'</span></div>',
    cardDate ? '<div class="bm-metric-row"><span class="bm-metric-lbl">Fecha</span><span class="bm-metric-val">'+dateText+'</span></div>' : '',
    pills.length ? '<div class="bm-metric-row"><span class="bm-metric-lbl">Datos previos</span><span class="bm-metric-val" style="font-size:.62rem;">'+pills.join(' � ')+'</span></div>' : '',
    hasSurprise ? '<div class="bm-metric-row"><span class="bm-metric-lbl">Resultado</span><span class="bm-metric-val" style="color:'+(surpriseClass==='beat'?'#16a34a':surpriseClass==='miss'?'#dc2626':'#d97706')+';font-size:.63rem;">'+surpriseText+'</span></div>' : '',
    !hasSurprise && realAttr ? '<div class="bm-metric-row"><span class="bm-metric-lbl">Dato real publicado</span><span class="bm-metric-val">'+realAttr+'</span></div>' : '',
  ].join('');

  /* Market impact table */
  var mktsEl = document.getElementById('cm-markets');
  if (mktsEl && profile.markets && profile.markets.length) {
    var betterLabel = betterWhen === 'lower' ? 'Si dato menor al est. (positivo)' : betterWhen === 'higher' ? 'Si dato mayor al est. (positivo)' : 'Si hawkish / alcista';
    var worseLabel  = betterWhen === 'lower' ? 'Si dato mayor al est. (negativo)' : betterWhen === 'higher' ? 'Si dato menor al est. (negativo)' : 'Si dovish / bajista';
    var rows = profile.markets.map(function(m){
      return '<tr><td style="padding:.3rem .4rem;font-size:.65rem;font-weight:600;color:#1e293b;white-space:nowrap;">'+m.a+'</td><td style="padding:.3rem .4rem;font-size:.62rem;color:#16a34a;">'+m.beat+'</td><td style="padding:.3rem .4rem;font-size:.62rem;color:#dc2626;">'+m.miss+'</td></tr>';
    }).join('');
    mktsEl.innerHTML = '<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f1f5f9;"><th style="padding:.3rem .4rem;font-size:.55rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#64748b;text-align:left;">Activo</th><th style="padding:.3rem .4rem;font-size:.55rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#16a34a;text-align:left;">'+betterLabel+'</th><th style="padding:.3rem .4rem;font-size:.55rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#dc2626;text-align:left;">'+worseLabel+'</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }

  /* Key questions */
  var kqEl = document.getElementById('cm-questions');
  if (kqEl && profile.keyQuestions && profile.keyQuestions.length) {
    kqEl.innerHTML = profile.keyQuestions.map(function(q,i){return '<div style="padding:.28rem 0;border-bottom:1px solid #f1f5f9;font-size:.67rem;color:#334155;"><span style="font-weight:700;color:#00213a;margin-right:.4rem;">'+(i+1)+'.</span>'+q+'</div>';}).join('');
  }

  /* Context */
  var ctxEl = document.getElementById('cm-context');
  if (ctxEl) ctxEl.innerHTML = desc + '<br><br>' + profile.context + '<br><br><strong>Metodologia:</strong> ' + profile.methodology;

  /* Report */
  document.getElementById('cm-report').textContent = buildCalReport(flag, title, dateText, pills, status, surpriseText, profile, desc, betterWhen, realAttr, estNumAttr);

  /* Open */
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  /* Gemini */
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
    var r = await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:prompt})});
    if (!r.ok) return;
    var d = await r.json();
    var text = d.reply || d.response || d.message || '';
    if (text && el.isConnected) el.innerHTML = text.replace(/\n/g,'<br>');
  } catch(e) {}
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

/* Init: add cursor + click handler to all cal-cards via delegation */
document.addEventListener('DOMContentLoaded', function() {
  var grid = document.querySelector('#calendar-panel-main .cal-grid');
  if (!grid) return;
  grid.addEventListener('click', function(e) {
    var card = e.target.closest('.cal-card');
    if (card) openCalDetail(card);
  });
});

/* === Script bloque lineas 3333-3494 === */
/* Bond Detail Modal Logic */
let _bondData = null;
let _mktCapData = null;
let _fxData = null;
const BOND_PROFILES = {
  us:{name:'EE.UU.',flag:'????',currency:'USD',cb:'Reserva Federal (Fed)',policyRate:4.50,mats:{'3M':'T-Bill 3M','1Y':'T-Bill 1A','2Y':'T-Note 2A','5Y':'T-Note 5A','10Y':'T-Note 10A','30Y':'T-Bond 30A'},context:'El Tesoro de EE.UU. es el activo libre de riesgo de referencia mundial. Su rendimiento determina el costo de capital global y fija el piso de todas las primas de riesgo soberanas, corporativas e hipotecarias.',high:5.0,low:2.5,risks:['Politica Fed','Deficit fiscal EE.UU.','Inflacion PCE core','Indice Dolar DXY','Apetito riesgo global']},
  mx:{name:'Mexico',flag:'????',currency:'MXN',cb:'Banxico',policyRate:8.50,mats:{'10Y':'Mbono 10A','30Y':'Mbono 30A'},context:'Los Mbonos son bonos de tasa fija del gobierno mexicano en pesos. Reflejan el riesgo soberano local, las expectativas inflacionarias y el ciclo de Banxico. Referencia para credito corporativo nacional y carry trade EM.',high:10.0,low:7.0,risks:['Decisiones Banxico','USD/MXN','Nearshoring y USMCA','Rating Baa2/BBB-','Precio petroleo y Pemex']},
  de:{name:'Alemania',flag:'????',currency:'EUR',cb:'BCE',policyRate:2.65,mats:{'10Y':'Bund 10A'},context:'El Bund aleman es el activo libre de riesgo de la Eurozona. Su spread contra otros soberanos mide el riesgo de fragmentacion del bloque europeo.',high:3.2,low:-0.5,risks:['Politica BCE','Inflacion eurozona','Crisis energetica','Fragmentacion UE']},
  jp:{name:'Japon',flag:'????',currency:'JPY',cb:'Banco de Japon (BOJ)',policyRate:0.50,mats:{'10Y':'JGB 10A'},context:'El JGB ha estado controlado por el BOJ via Yield Curve Control. Su normalizacion libera flujos masivos de carry trade y reconfigura el mercado global de renta fija.',high:2.0,low:-0.2,risks:['Politica BOJ y YCC','Yen carry trade','Deflacion estructural','Deuda >260% PIB']},
  gb:{name:'Reino Unido',flag:'????',currency:'GBP',cb:'Banco de Inglaterra (BOE)',policyRate:4.50,mats:{'10Y':'Gilt 10A'},context:'El Gilt refleja la credibilidad fiscal post-Brexit. Enfrenta inflacion interna persistente y deficit corriente elevado.',high:5.2,low:0.2,risks:['Inflacion servicios UK','Politica BOE','Impacto Brexit','Deficit presupuestario']},
  it:{name:'Italia',flag:'????',currency:'EUR',cb:'BCE',policyRate:2.65,mats:{'10Y':'BTP 10A'},context:'El BTP es el termometro del riesgo periferico europeo. Con deuda >140% PIB, el spread BTP-Bund amplifica cualquier incertidumbre politica. El BCE actua via TPI.',high:5.0,low:0.8,risks:['Spread BTP-Bund','Deuda/PIB ~142%','Politica fiscal Roma','Rating BBB/Baa3']},
  fr:{name:'Francia',flag:'????',currency:'EUR',cb:'BCE',policyRate:2.65,mats:{'10Y':'OAT 10A'},context:'El OAT ha visto su spread vs Bund ampliarse por degradacion crediticia (AA- 2023) y deficit fiscal ~5% PIB. Francia es el segundo mayor deudor de la Eurozona.',high:3.8,low:-0.3,risks:['Deficit ~5% PIB','Incertidumbre politica','Rating AA- negativo']},
  es:{name:'Espana',flag:'????',currency:'EUR',cb:'BCE',policyRate:2.65,mats:{'10Y':'Bono 10A'},context:'El bono espanol logro compresion de spread post-2012. El crecimiento robusto mejora la percepcion crediticia, aunque la deuda ~110% PIB y la fragmentacion politica son riesgos.',high:4.2,low:0.1,risks:['Dependencia turismo','Deuda regional CCAA','Inflacion servicios','Fragmentacion politica']},
  br:{name:'Brasil',flag:'????',currency:'BRL',cb:'BACEN',policyRate:13.75,mats:{'10Y':'NTN-F 10A'},context:'Los NTN-F ofrecen primas elevadas por riesgo politico, fragilidad fiscal y volatilidad del real. La Selic a dos digitos ancla la curva en niveles historicamente altos.',high:14.5,low:8.5,risks:['Politica fiscal Lula','Inflacion IPCA','Real (BRL) volatil','Rating Ba2/BB']},
  ca:{name:'Canada',flag:'????',currency:'CAD',cb:'Banco de Canada (BOC)',policyRate:4.25,mats:{'10Y':'GoC Bond 10A'},context:'Los GoC siguen de cerca a los T-Notes de EE.UU. por la integracion CUSMA. El diferente ciclo monetario y la exposicion al mercado inmobiliario generan divergencias.',high:4.5,low:0.5,risks:['Correlacion Fed/BOC','Mercado vivienda','Precio petroleo WCS']},
  au:{name:'Australia',flag:'????',currency:'AUD',cb:'RBA',policyRate:4.35,mats:{'10Y':'ACGB 10A'},context:'Los ACGB reflejan la economia orientada a commodities y la relacion con China. La RBA mantiene tasas altas para contener inflacion en servicios.',high:5.0,low:0.5,risks:['Exposicion a China','Precios iron ore','Mercado vivienda','Inflacion servicios']},
  cn:{name:'China',flag:'????',currency:'CNY',cb:'PBOC',policyRate:3.45,mats:{'10Y':'CGB 10A'},context:'Los CGB tienen rendimientos bajos por alto ahorro interno. El spread CGB-T-Note se invirtio en 2022. Crisis inmobiliaria y deflacion presionan los rendimientos a la baja.',high:3.5,low:1.5,risks:['Crisis inmobiliaria','Deflacion estructural','Tensiones EE.UU.-China','Control capitales CNY']},
};

function openBondDetail(key, label) {
  var overlay = document.getElementById('bond-modal-overlay');
  if (!overlay) return;
  if (!_bondData) { alert('Datos aun cargando, intenta en un momento.'); return; }
  var profile = BOND_PROFILES[key] || {name:key,flag:'',currency:'?',cb:'Banco Central',policyRate:0,mats:{},context:'Sin informacion.',high:10,low:0,risks:[]};
  var entry, bond;
  if (key === 'us') { entry = _bondData.find(function(d){return d.key==='us';}); bond = entry && entry.bonds && entry.bonds.find(function(b){return b.label===label;}); }
  else { entry = _bondData.find(function(d){return d.key===key;}); bond = entry && entry.bonds && entry.bonds[0]; }
  if (!bond) { alert('No hay datos para este instrumento.'); return; }
  var yld = bond.yield, prev = bond.prev;
  var diff = (yld != null && prev != null) ? yld - prev : null;
  var yldStr = yld != null ? yld.toFixed(2) + '%' : '--';
  var matLabel = (profile.mats && (profile.mats[label] || profile.mats[bond.label])) || label;
  document.getElementById('bm-flag').textContent = profile.flag;
  document.getElementById('bm-country').textContent = profile.name;
  document.getElementById('bm-instrument').textContent = matLabel + ' � Bono Gubernamental';
  document.getElementById('bm-yield-big').textContent = yldStr;
  var badge = document.getElementById('bm-chg-badge');
  if (diff != null) { badge.textContent = (diff>0?'? +':'? ')+Math.abs(diff).toFixed(2)+' pp'; badge.style.background = diff>0?'rgba(220,38,38,.3)':'rgba(22,163,74,.3)'; badge.style.color = diff>0?'#fca5a5':'#86efac'; }
  else { badge.textContent = '--'; badge.style.background = 'rgba(255,255,255,.12)'; badge.style.color = '#fff'; }
  document.getElementById('bm-upd').textContent = 'Act. ' + new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}) + (entry && entry.source ? ' � ' + entry.source : ' � Yahoo Finance');
  var ycSpread = null;
  if (key === 'us') {
    var ue = _bondData.find(function(d){return d.key==='us';});
    var b2n = ue && ue.bonds && ue.bonds.find(function(b){return b.label==='2Y'||b.label==='2A';});
    var b10n = ue && ue.bonds && ue.bonds.find(function(b){return b.label==='10Y'||b.label==='10A';});
    if (b2n && b2n.yield != null && b10n && b10n.yield != null) ycSpread = b10n.yield - b2n.yield;
  }
  var spread = yld != null ? yld - profile.policyRate : null;
  var yldColor = yld==null?'#64748b':yld>=profile.high?'#dc2626':yld<=profile.low?'#16a34a':'#d97706';
  var level = yld==null?'--':yld>=profile.high?'ALTO � zona restrictiva':yld<=profile.low?'BAJO � zona expansiva':'NEUTRAL � equilibrado';
  var m = '<div class="bm-metric-row"><span class="bm-metric-lbl">Rendimiento actual</span><span class="bm-metric-val">'+yldStr+'</span></div>';
  m += '<div class="bm-metric-row"><span class="bm-metric-lbl">Variacion diaria</span><span class="bm-metric-val" style="color:'+(diff==null?'#64748b':diff>0?'#dc2626':'#16a34a')+'">'+(diff!=null?(diff>0?'? +':'? ')+Math.abs(diff).toFixed(2)+' pp':'--')+'</span></div>';
  m += '<div class="bm-metric-row"><span class="bm-metric-lbl">Tasa referencia '+profile.cb.split(' ')[0]+'</span><span class="bm-metric-val">'+profile.policyRate.toFixed(2)+'%</span></div>';
  m += '<div class="bm-metric-row"><span class="bm-metric-lbl">Spread bono - politica</span><span class="bm-metric-val" style="color:'+(spread==null?'#64748b':spread>0?'#16a34a':'#dc2626')+'">'+(spread!=null?(spread>=0?'+':'')+spread.toFixed(2)+' pp':'--')+'</span></div>';
  m += '<div class="bm-metric-row"><span class="bm-metric-lbl">Nivel de rendimiento</span><span class="bm-metric-val" style="color:'+yldColor+';font-size:.62rem;">'+level+'</span></div>';
  if (ycSpread !== null) m += '<div class="bm-metric-row"><span class="bm-metric-lbl">Curva 10Y - 2Y</span><span class="bm-metric-val" style="color:'+(ycSpread>=0?'#16a34a':'#dc2626')+'">'+(ycSpread>=0?'+':'')+ycSpread.toFixed(2)+' pp � '+(ycSpread<0?'? Invertida':'Normal')+'</span></div>';
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
  if (key === 'us' && ycSpread !== null) { if (ycSpread < -0.25) t += '<br><br><strong>? Curva invertida ('+ycSpread.toFixed(2)+' pp 10Y-2Y):</strong> historicamente ha precedido todas las recesiones de EE.UU. con 12�18 meses de adelanto. '; else if (ycSpread < 0) t += '<br><br>La curva esta ligeramente invertida ('+ycSpread.toFixed(2)+' pp), senal de cautela sobre el crecimiento. '; else t += '<br><br>La curva de rendimientos es positiva ('+ycSpread.toFixed(2)+' pp 10Y-2Y), indicando expectativas de expansion economica. '; }
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
    var r = await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:prompt})});
    if (!r.ok) return;
    var d = await r.json();
    var text = d.reply || d.response || d.message || '';
    if (text && el.isConnected) el.innerHTML = text.replace(/\n/g,'<br>');
  } catch(e) {}
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

/* === Script bloque lineas 3498-3658 === */
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

function openNewsDetail(item) {
  var titulo = item.titulo || item.title || 'Noticia financiera';
  var desc   = item.descripcion || item.description || '';
  var cat    = item.categoria || item.category || 'Mercados';
  var fuente = (item.fuente || item.source || 'API').toUpperCase();
  var impact = (item.impacto || '').toLowerCase();
  var fecha  = item.fecha || '';
  var imgSrc = (item.image && item.image.startsWith('http')) ? item.image : '';
  var url    = item.url || '';

  var impColor = impact === 'alto' ? '#dc2626' : impact === 'medio' ? '#d97706' : '#2563eb';
  var impLabel = impact === 'alto' ? 'IMPACTO ALTO' : impact === 'medio' ? 'IMPACTO MEDIO' : 'MONITOREO';

  var img = document.getElementById('nm-img');
  if (imgSrc) { img.src = imgSrc; img.style.display = 'block'; }
  else { img.style.display = 'none'; }

  var isEnglishDesc = /\b(the|and|for|with|that|this|from|have|are|was|were|will|said|would|could)\b/i.test(desc) && desc.length > 20;

  document.getElementById('nm-cat').textContent = cat;
  document.getElementById('nm-source').textContent = fuente + (fecha ? ' � ' + fecha : '');
  document.getElementById('nm-title').textContent = titulo;
  document.getElementById('nm-desc').textContent = isEnglishDesc ? 'Traduciendo al espa�ol con VALL-AI...' : desc;

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
  var sep  = '-'.repeat(44);
  var sep2 = '-'.repeat(44);
  var impDesc = impact === 'alto'  ? 'ALTO � Monitoreo inmediato requerido'
              : impact === 'medio' ? 'MEDIO � Seguimiento recomendado'
              : 'BAJO / MONITOREO � Sin accion urgente';
  var assets = kw.map(function(k){ return '  � ' + k.a + ' � ' + k.dir; }).join('\n');
  return [
    sep2,
    'REPORTE DE NOTICIA FINANCIERA',
    'VALLNews Intelligence � ' + new Date().toLocaleString('es-MX'),
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
    '� VALLNews � Informacion con fines educativos'
  ].join('\n');
}

function _loadGeminiNews(titulo, desc, cat, impact) {
  var prompt = 'Eres analista financiero experto. Analiza esta noticia en 3 puntos concisos: 1) Impacto inmediato en mercados, 2) Activos mas afectados, 3) Perspectiva para inversionistas mexicanos. NOTICIA: Titulo: ' + titulo + '. Categoria: ' + cat + '. Impacto: ' + (impact||'N/A') + '. Descripcion: ' + desc.slice(0,500);
  fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:prompt})})
    .then(function(r){return r.json();})
    .then(function(d){
      var aiText = d.reply || d.response || d.message || 'Analisis no disponible.';
      var el = document.getElementById('nm-analysis');
      if (el) el.textContent = aiText;
      var rep = document.getElementById('nm-report');
      if (rep) rep.textContent = rep.textContent.replace('(generando analisis inteligente...)', aiText);
    })
    .catch(function(){
      var el = document.getElementById('nm-analysis');
      if (el) el.textContent = 'No se pudo conectar con VALL-AI.';
      var rep = document.getElementById('nm-report');
      if (rep) rep.textContent = rep.textContent.replace('(generando analisis inteligente...)', 'No se pudo conectar con VALL-AI.');
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
    if (btn) { btn.textContent = 'Copiado!'; setTimeout(function(){ btn.innerHTML = '? Copiado'; },1800); }
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

/* === Script bloque lineas 3661-3995 === */
const PULSE_PROFILES = {
  'VIX': {
    name: 'VIX � Indice de Volatilidad CBOE',
    ticker: '^VIX', unit: 'puntos',
    gradient: 'linear-gradient(135deg,#7f1d1d,#dc2626)',
    what: 'El VIX mide la volatilidad implicita esperada del S&P 500 durante los proximos 30 dias. Conocido como el "indice del miedo" � valores altos indican panico e incertidumbre, valores bajos indican complacencia. Se construye a partir de opciones del S&P 500.',
    interpretation: function(v) {
      var val = parseFloat((v||'').replace(/,/g,''));
      if (isNaN(val)) return {label:'SIN DATO',color:'#94a3b8',text:'No hay datos disponibles en este momento.'};
      if (val < 13) return {label:'COMPLACENCIA EXTREMA',color:'#16a34a',text:'Mercado muy tranquilo. La complacencia extrema puede ser un punto de vulnerabilidad � suele anteceder correcciones. Inversionistas bajan coberturas.'};
      if (val < 20) return {label:'CALMA � CONDICIONES NORMALES',color:'#65a30d',text:'VIX en zona de baja volatilidad. Condiciones favorables para activos de riesgo. Tipico de mercados en tendencia alcista sostenida.'};
      if (val < 25) return {label:'PRECAUCION � VOL ELEVANDOSE',color:'#d97706',text:'Volatilidad en aumento. Inversores empiezan a coberturarse. Monitorear flujos hacia bonos del Tesoro y dolar como activos de refugio.'};
      if (val < 35) return {label:'MIEDO ACTIVO � ALTA VOLATILIDAD',color:'#ea580c',text:'Zona de miedo activo. Spreads de credito amplios, posible "flight to quality" hacia bonos y dolar. Mercados de renta variable bajo presion.'};
      return {label:'MIEDO EXTREMO � CRISIS',color:'#dc2626',text:'Crisis o shock de mercado. Niveles historicamente asociados a eventos sistemicos. Bancos centrales suelen intervenir. Oportunidad contraria de largo plazo si fundamentals intactos.'};
    },
    watching: ['VIX mayor a 20 = zona de alerta','VIX mayor a 30 = crisis activa','VIX Futures � estructura temporal (contango/backwardation)','Correlacion VIX / DXY (dolar)','Put/Call Ratio del S&P 500','VVIX (volatilidad del VIX)'],
    impacts: [{a:'S&P 500',dir:'Correlacion inversa directa'},{a:'USD (DXY)',dir:'VIX alto lleva al dolar como refugio'},{a:'Bonos Tesoro EUA',dir:'VIX alto = bono sube (demanda refugio)'},{a:'Oro',dir:'Correlacion positiva en momentos de crisis'},{a:'USD/MXN',dir:'VIX alto = salida de EM = peso se debilita'},{a:'Criptomonedas',dir:'VIX alto = cripto vende primero'}],
    risks: ['Spike de VIX puede provocar margin calls en cascada','Estrategias short-volatilidad colapsan en spikes','Correlaciones entre activos sube en crisis','Liquidez se reduce drasticamente con VIX alto'],
    context: 'El VIX fue creado por el CBOE en 1993. Historicamente niveles sobre 40 coinciden con crisis sistemicas: 2008 (subprime), 2020 (COVID), 2010 (Flash Crash). El VIX promedio historico es ~19. Para Mexico, VIX alto usualmente implica salida de capitales de mercados emergentes, depreciacion del peso y presion sobre CETES. Es el indicador mas usado para medir el "apetito por riesgo" global.'
  },
  'S&P 500': {
    name: 'S&P 500 � Referencia Global de Renta Variable',
    ticker: '^GSPC', unit: 'puntos',
    gradient: 'linear-gradient(135deg,#0c4a6e,#0284c7)',
    what: 'El S&P 500 es el indice de las 500 empresas mas grandes de EE.UU. por capitalizacion de mercado. Es la referencia global de renta variable � lo que le pasa al S&P 500 se refleja en todos los mercados del mundo. Incluye Apple, Microsoft, NVIDIA, Amazon, Alphabet, Meta y otras compa�ias lideres.',
    interpretation: function(v) {
      return {label:'REFERENCIA GLOBAL PRINCIPAL',color:'#0284c7',text:'El S&P 500 es el termometro de los mercados globales. Su variacion diaria es la se�al mas importante para todos los demas activos � un dia positivo en el S&P suele traducirse en risk-on global, y viceversa.'};
    },
    watching: ['Variacion % diaria vs promedio historico (+/-1%)','Amplitud del mercado (linea avance/descenso)','Niveles tecnicos: soportes y resistencias clave','Rotacion sectorial (tech vs defensivos)','Posicionamiento neto de futuros (COT Report)','P/E ratio forward del S&P vs historico'],
    impacts: [{a:'IPC Mexico (BMV)',dir:'Correlacion alta 0.70-0.85'},{a:'USD/MXN',dir:'S&P al alza = risk-on = peso firme'},{a:'Bonos Tesoro EUA',dir:'Rally S&P = presion en bonos (yield sube)'},{a:'Criptomonedas',dir:'Alta correlacion en fases de risk-on'},{a:'Commodities EM',dir:'S&P fuerte = demanda global activa'},{a:'VIX',dir:'Correlacion inversa directa'}],
    risks: ['Concentracion en Big Tech (mas del 30% del indice)','Valuaciones historicamente altas (P/E 22-25x)','Sensibilidad a cambios de politica Fed','Riesgo de correccion tecnica tras rallys prolongados','Dependencia de resultados corporativos'],
    context: 'Creado en 1957, el S&P 500 ha generado retornos anuales promedio de ~10.5% historico incluyendo dividendos. Para inversores mexicanos es el benchmark de renta variable global. ETFs como VOO y SPY replican este indice. Una correccion del S&P 500 mayor al 10% usualmente implica salida de capitales de mercados emergentes y depreciacion del peso. En 2022 cayo -19.4%; en 2023 subio +26.3%; en 2024 subio +23.3%.'
  },
  'Yield 10A': {
    name: 'T-Note 10 Anos EUA � Tasa Libre de Riesgo Global',
    ticker: '^TNX', unit: '%',
    gradient: 'linear-gradient(135deg,#1e3a5f,#1e40af)',
    what: 'El rendimiento del Bono del Tesoro de EE.UU. a 10 anos es la tasa de interes libre de riesgo de referencia mundial. Es el ancla del costo de capital global � determina el piso de valuaciones de acciones, bonos corporativos, hipotecas y deuda soberana en todo el mundo. Sube cuando hay expectativas de inflacion o crecimiento; baja cuando hay recesion o "flight to quality".',
    interpretation: function(v) {
      var val = parseFloat((v||'').replace(/,/g,''));
      if (isNaN(val)) return {label:'SIN DATO',color:'#94a3b8',text:'No hay datos disponibles.'};
      if (val < 3.0) return {label:'TASAS BAJAS � POLITICA LAXA',color:'#16a34a',text:'Condiciones financieras muy laxas. Favorable para acciones de crecimiento, credito y activos de riesgo. Puede se�alar riesgo de recesion.'};
      if (val < 4.5) return {label:'ZONA NEUTRAL HISTORICA',color:'#d97706',text:'Tasas en rango neutral. Equilibrio entre crecimiento e inflacion. Compatible con expansion economica moderada.'};
      if (val < 5.5) return {label:'TASAS ALTAS � POLITICA RESTRICTIVA',color:'#ea580c',text:'Costo de capital elevado. Presion en valuaciones de acciones (especialmente growth) y paises emergentes. Carry trade en pesos atractivo.'};
      return {label:'TASAS MUY ALTAS � ZONA CRITICA',color:'#dc2626',text:'Nivel extremo de restriccion. Riesgo de recesion y crisis en segmentos de deuda. Ultima vez en estos niveles: 2006-2007.'};
    },
    watching: ['Curva 2s10s: inversion prolongada predice recesion','PCE e IPC EUA: determinan ruta de la Fed','Comunicados FOMC y dot plot','Subastas de T-bonds (demanda extranjera)','Diferencial Mbono 10A vs T-Note (carry MXN)','Rendimientos reales (yield - inflacion)'],
    impacts: [{a:'MXN / CETES',dir:'Yield 10A alto lleva al dolar, presiona al peso'},{a:'Bonos Corporativos',dir:'Correlacion directa (tasa base)'},{a:'S&P 500 / NASDAQ',dir:'Yield alto presiona valuaciones growth'},{a:'Oro',dir:'Correlacion inversa (yield real alto = oro bajo)'},{a:'USD / DXY',dir:'Yield alto EUA fortalece el dolar'},{a:'Mbono Mexico 10A',dir:'Determina spread soberano y carry'}],
    risks: ['Inversion de curva sostenida predice recesion con 12-18 meses de anticipacion','Refinanciamiento corporativo mas caro','Presion en hipotecas y credito al consumo en EUA','Costo de deuda federal EUA sube (deficit crece)'],
    context: 'Historicamente el T-Note 10A promedi� ~4.5% (1970-2023). Entre 2012-2022 estuvo artificialmente bajo por QE. El ciclo de alzas 2022-2024 lo llev� a 5%+, nivel no visto desde 2006-2007. Para Mexico, el diferencial entre el Mbono 10A y el T-Note determina el atractivo del carry trade en pesos. Con T-Note alto, inversionistas extranjeros exigen mas rendimiento de los Mbonos para compensar el riesgo tipo de cambio.'
  },
  'Oro': {
    name: 'Oro � Reserva de Valor y Refugio Global',
    ticker: 'GC=F', unit: 'USD/oz',
    gradient: 'linear-gradient(135deg,#78350f,#b45309)',
    what: 'El oro es el activo de refugio y reserva de valor historica. No genera flujo de caja, pero preserva poder adquisitivo en periodos de inflacion, crisis sistemica e incertidumbre geopolitica. Los bancos centrales lo mantienen como reserva internacional. Su precio sube cuando el dolar se debilita, cuando la inflacion sube o cuando hay incertidumbre geopolitica.',
    interpretation: function(v) {
      var val = parseFloat((v||'').replace(/,/g,''));
      if (isNaN(val)) return {label:'SIN DATO',color:'#94a3b8',text:'No hay datos disponibles.'};
      if (val < 1800) return {label:'CORRECCION � ZONA DE ACUMULACION',color:'#16a34a',text:'Precio en zona de correccion. Historicamente ha sido zona de acumulacion de largo plazo para bancos centrales e inversores institucionales.'};
      if (val < 2400) return {label:'RANGO ALTO HISTORICO',color:'#d97706',text:'Oro en zona de precio elevado pero dentro de tendencia alcista post-2020. Refleja demanda estructural de bancos centrales.'};
      if (val < 3000) return {label:'MAXIMOS HISTORICOS � RALLY',color:'#ea580c',text:'Zona de maximos post-2024. Refleja alta demanda de bancos centrales (China, India), hedging de inflacion y diversificacion fuera del dolar.'};
      return {label:'TERRITORIO RECORD',color:'#dc2626',text:'Precio en niveles sin precedente. Se�al de incertidumbre sistemica, diversificacion de reservas globales y posible debilitamiento estructural del dolar.'};
    },
    watching: ['Compras de bancos centrales (China, India, Turquia)','Yields reales T-Note (correlacion inversa fuerte)','Indice Dolar DXY','Tensiones geopoliticas y conflictos activos','ETF GLD: flujos de entrada y salida','Demanda fisica Asia: India (bodas) y China (festivos)'],
    impacts: [{a:'USD / DXY',dir:'Oro alto = dolar debil (correlacion inversa)'},{a:'Mineras (GDX)',dir:'Alta sensibilidad: sube mas que el oro'},{a:'T-Note EUA',dir:'Correlacion inversa con yields reales'},{a:'Plata (XAG)',dir:'Correlacion 0.8+ con oro'},{a:'Criptomonedas (BTC)',dir:'Narrativa de "oro digital" � correlacion ocasional'},{a:'USD/MXN',dir:'Oro alto = EM mejoran = peso firme'}],
    risks: ['No genera dividendo ni flujo de caja','Alta volatilidad en fases risk-on (caidas bruscas)','Sensible a cambios de politica Fed','Costo de almacenamiento y custodia','Posible correccion si bancos centrales reducen compras'],
    context: 'El oro rompio maximos historicos en 2024 superando los $2,500 y $3,000 USD/oz impulsado por compras masivas de bancos centrales que diversifican reservas fuera del dolar. China ha sido el mayor comprador institucional. Para Mexico, el oro en pesos (ajustado por USD/MXN) es relevante para portafolios de largo plazo. BANXICO mantiene ~120 toneladas en reservas internacionales.'
  }
};

const SECTOR_PROFILES = {
  'Tecnolog�a': {
    name: 'Sector Tecnolog�a � XLK',
    ticker: 'XLK', gradient: 'linear-gradient(135deg,#1e3a5f,#2563eb)',
    what: 'XLK incluye a Apple, Microsoft, NVIDIA y Broadcom. Es el sector de mayor capitalizacion del S&P 500 (mas del 30%). Su desempe�o marca la direccion del mercado general. El ciclo de inteligencia artificial desde 2023 ha sido el principal driver.',
    watching: ['Resultados de Big Tech (Apple, MSFT, NVDA)','Tasas de interes (impactan valuaciones DCF)','Ciclo de IA y gasto en infraestructura cloud','Demanda de semiconductores','Regulacion antimonopolio EUA y UE','Capex en centros de datos'],
    impacts: [{a:'NASDAQ 100',dir:'Correlacion 0.95+'},{a:'Criptomonedas',dir:'Risk-on similar, alta beta'},{a:'USD/MXN',dir:'Tech fuerte = risk-on = peso firme'},{a:'Bonos',dir:'Tech alto = presion en bonos (yield sube)'},{a:'NVDA / AMD / TSMC',dir:'Nombres individuales amplifican el movimiento'}],
    context: 'NVIDIA (IA), Microsoft (cloud/IA/Azure) y Apple (consumo tech) dominan el indice. El ciclo de IA desde 2023 ha sido el principal driver del mercado. Para Mexico, el nearshoring en manufactura electronica y semiconductores crea nexos indirectos con este sector.'
  },
  'Energ�a': {
    name: 'Sector Energ�a � XLE',
    ticker: 'XLE', gradient: 'linear-gradient(135deg,#78350f,#d97706)',
    what: 'XLE incluye a ExxonMobil, Chevron y ConocoPhillips. Alta correlacion con el precio del petroleo WTI y Brent. Para Mexico es estrategico por el rol de PEMEX en los ingresos del gobierno federal.',
    watching: ['Precio WTI y Brent','Decisiones de produccion OPEC+','Demanda China e India','Inventarios EIA (miercoles)','Regulacion climatica y ESG','Capex de exploracion E&P'],
    impacts: [{a:'WTI Crudo',dir:'Correlacion directa 0.85+'},{a:'MXN / PEMEX',dir:'XLE alto = commodities fuertes = peso firme'},{a:'Canada (CAD)',dir:'Alta correlacion por oil sands'},{a:'Inflacion global',dir:'Energia cara = inflacion importada'},{a:'Bonos MX',dir:'Petroleo alto mejora ingresos fiscales MX'}],
    context: 'En 2022, XLE fue el unico sector positivo del S&P 500 con +58% durante el ciclo de alzas de petroleo. Para Mexico, el precio del petroleo impacta directamente los ingresos de PEMEX (mezcla mexicana) y las finanzas del gobierno federal a traves del FEIP (fondo de estabilizacion).'
  },
  'Finanzas': {
    name: 'Sector Financiero � XLF',
    ticker: 'XLF', gradient: 'linear-gradient(135deg,#164e63,#0891b2)',
    what: 'XLF incluye a JPMorgan, Berkshire Hathaway, Bank of America y Visa. Se beneficia de tasas de interes altas (spread NIM bancario) pero es vulnerable a recesiones y crisis de credito.',
    watching: ['Nivel de tasas Fed (spread NIM)','Calidad de la cartera crediticia (NPLs)','Resultados de grandes bancos (JPM, BAC, GS)','Curva de rendimientos 2s10s','Regulacion bancaria y capital','Spreads HY/IG de credito corporativo'],
    impacts: [{a:'T-Note 10A',dir:'Correlacion positiva con yields'},{a:'S&P 500 general',dir:'Finanzas lidera rallys o anticipa correcciones'},{a:'Credito Corporativo',dir:'Spreads HY/IG impactan valuaciones'},{a:'USD/MXN',dir:'Bancos fuertes = confianza en sistema'},{a:'CETES / Mbono',dir:'Ciclo de tasas afecta identicamente'}],
    context: 'En 2023, la crisis de bancos regionales (SVB, Signature Bank) causo volatilidad sistemica. JPMorgan es el mayor banco del mundo por activos. Para Mexico, los bancos locales (BBVA MX, Banorte, Santander MX) tienen alta correlacion con el ciclo de tasas de Banxico y con el sector financiero global.'
  },
  'Salud': {
    name: 'Sector Salud � XLV',
    ticker: 'XLV', gradient: 'linear-gradient(135deg,#14532d,#16a34a)',
    what: 'XLV incluye a UnitedHealth, Johnson & Johnson y Eli Lilly. Sector defensivo con demanda relativamente inelastica. Se destaca en fases de desaceleracion economica. El boom de GLP-1 (Ozempic, Wegovy) ha impulsado el sector desde 2023.',
    watching: ['Aprobaciones FDA de nuevos medicamentos','Pipeline de GLP-1 (diabetes/obesidad)','Precio de medicamentos y negociacion con Medicare','Resultados de grandes pharma y aseguradoras','Fusiones y adquisiciones farmaceuticas','Envejecimiento demografico EUA'],
    impacts: [{a:'Sectores defensivos (XLP)',dir:'Correlacion positiva en risk-off'},{a:'S&P 500 relativo',dir:'Outperformance en recesiones'},{a:'ETF XBI (biotech)',dir:'Beta alto, mayor volatilidad'},{a:'USD',dir:'Ingresos globales impactados por dolar'},{a:'Seguros salud MX',dir:'Tendencia global en prevencion/salud'}],
    context: 'Eli Lilly se convirtio en la empresa mas valiosa del sector salud impulsada por Mounjaro y Zepbound (GLP-1 para obesidad/diabetes). XLV es uno de los sectores mas estables del mercado � en las recesiones de 2001, 2008 y 2022 super� significativamente al S&P 500.'
  },
  'Industrial': {
    name: 'Sector Industrial � XLI',
    ticker: 'XLI', gradient: 'linear-gradient(135deg,#312e81,#6366f1)',
    what: 'XLI incluye a Boeing, Caterpillar, Honeywell y United Parcel Service. Indicador lider del ciclo economico � sube anticipando expansion, baja anticipando contraccion. Directamente relacionado con el nearshoring para Mexico.',
    watching: ['PMI manufacturero EUA e ISM','Gasto en infraestructura (Ley de Infraestructura EUA)','Ordenes de bienes duraderos','Backlog de Boeing y Airbus (aviacion)','Volumenes de transporte aereo y terrestre','Ciclo de capex corporativo'],
    impacts: [{a:'Mexico Nearshoring',dir:'XLI fuerte = mas manufactura hacia MX'},{a:'Commodities Industriales',dir:'Correlacion moderada-alta'},{a:'PMI Global',dir:'Indicador lider del sector'},{a:'CAD / AUD',dir:'Commodities industriales los afectan'},{a:'IPC Mexico (BMV)',dir:'Via exposicion manufacturera MX-EUA'}],
    context: 'XLI es el mejor barometro del nearshoring para Mexico. Caterpillar y Deere reflejan demanda de bienes de capital para manufactura. Con el USMCA y la relocalizacion de cadenas de suministro desde Asia, el sector industrial EUA y Mexico estan mas integrados que nunca. Un XLI fuerte suele preceder aumento de inversion extranjera directa en Mexico.'
  },
  'Consumo Discr.': {
    name: 'Consumo Discrecional � XLY',
    ticker: 'XLY', gradient: 'linear-gradient(135deg,#831843,#db2777)',
    what: 'XLY incluye a Amazon, Tesla y Home Depot. Mide la salud del consumidor estadounidense. Cae primero ante se�ales de recesion cuando el consumo no esencial se contrae. Amazon representa mas del 20% del ETF.',
    watching: ['Confianza del consumidor EUA (Conference Board)','Nivel de empleo y salarios reales','Tasa de ahorro personal','Precio del petroleo (gasto en gasolina)','Ventas minoristas EUA','Resultados de Amazon y Tesla'],
    impacts: [{a:'Retail Sales EUA',dir:'Indicador directo del sector'},{a:'USD/MXN',dir:'Consumo EUA fuerte = exportaciones MX activas'},{a:'PMI Servicios',dir:'Alta correlacion'},{a:'Remesas Mexico',dir:'Consumidor EUA fuerte = mas remesas'},{a:'Sector Manufacturero MX',dir:'Demanda de bienes de consumo EUA'}],
    context: 'Amazon representa ~20-25% del XLY, haciendo que el ETF sea parcialmente un proxy del e-commerce. Para Mexico, el consumo discrecional EUA es driver clave de las exportaciones manufactureras (autos, electronics), del turismo y de las remesas que enviaron migrantes mexicanos por ~65,000 millones de dolares en 2023.'
  },
  'Consumo B�sico': {
    name: 'Consumo B�sico (Defensivo) � XLP',
    ticker: 'XLP', gradient: 'linear-gradient(135deg,#365314,#65a30d)',
    what: 'XLP incluye a Procter & Gamble, Coca-Cola, PepsiCo y Costco. Sector defensivo por excelencia � la gente sigue comprando bienes esenciales sin importar el ciclo economico. Alternativa a los bonos en carteras conservadoras.',
    watching: ['Poder de fijacion de precios ante inflacion','Gasto de consumo en necesidades basicas','Dividendos y retorno al accionista','Fortaleza del dolar (ingresos globales)','Competencia de marcas propias (private label)','Margenes operativos y costos de insumos'],
    impacts: [{a:'Oro y Bonos',dir:'Correlacion defensiva en crisis'},{a:'Consumo Discr. (XLY)',dir:'Rotacion inversa en recesiones'},{a:'Inflacion',dir:'Empresas con alto poder de precio'},{a:'Dividendos DY',dir:'Atractivo vs bonos cuando tasas bajan'},{a:'Defensivos globales',dir:'Tendencia global de proteccion de capital'}],
    context: 'XLP es el refugio bursatil en recesiones. En 2022, con el S&P -19%, XLP cayo solo -3%. Sus empresas tienen marcas globales con historial de dividendos crecientes por decadas (Dividend Aristocrats). Para portafolios conservadores de largo plazo, XLP ofrece estabilidad con crecimiento moderado.'
  },
  'Comunicaciones': {
    name: 'Sector Comunicaciones � XLC',
    ticker: 'XLC', gradient: 'linear-gradient(135deg,#4c1d95,#7c3aed)',
    what: 'XLC incluye a Meta (Facebook/Instagram/WhatsApp), Alphabet (Google/YouTube) y Netflix. Es un sector hibrido entre tecnologia y medios digitales dominado por plataformas de publicidad digital y streaming.',
    watching: ['Ingresos por publicidad digital (Google, Meta)','Suscriptores y contenido (Netflix, Disney)','Regulacion de plataformas digitales','IA generativa en publicidad y busqueda','Gasto en infraestructura de datos','Crecimiento de usuarios activos MAU/DAU'],
    impacts: [{a:'Publicidad digital global',dir:'Meta y Alphabet son el mercado'},{a:'NASDAQ / Tech (XLK)',dir:'Correlacion 0.85+'},{a:'Consumo masivo',dir:'Plataformas siguen al consumidor'},{a:'IA (NVIDIA/MSFT)',dir:'Demanda de compute para IA'},{a:'Medios tradicionales',dir:'Sustitutos estructurales en declive'}],
    context: 'XLC fue creado en 2018 cuando Meta y Alphabet salieron de XLK. La IA generativa esta transformando modelos de negocio de publicidad digital, busqueda y creacion de contenido. Para Mexico, las plataformas de Meta y Alphabet son esenciales para el ecosistema de pequenas empresas y el comercio digital.'
  },
  'Materiales': {
    name: 'Sector Materiales � XLB',
    ticker: 'XLB', gradient: 'linear-gradient(135deg,#78350f,#92400e)',
    what: 'XLB incluye a Linde, Air Products, Freeport-McMoRan y Nucor. Mide el ciclo de materias primas industriales: metales, quimicos y mineria. Alta exposicion a la demanda industrial de China.',
    watching: ['Demanda industrial China (acero, cobre, aluminio)','Precio de metales industriales','PMI manufacturero global','Gasto en infraestructura global','Transicion energetica (cobre para EVs y redes)','Precio de litio y materiales de baterias'],
    impacts: [{a:'Cobre (HG=F)',dir:'Correlacion directa alta'},{a:'China GDP y PMI',dir:'Demanda China es el factor dominante'},{a:'Peso mexicano',dir:'Commodities fuertes = EM mejoran'},{a:'Grupo Mexico (GMEXICOB)',dir:'Empresa minera MX con alta correlacion'},{a:'Inflacion global',dir:'Materias primas son inputs de precios'}],
    context: 'XLB es el sector mas expuesto a China. Para Mexico, el precio de los metales impacta a Grupo Mexico (mineria de cobre, zinc y plata) y al sector exportador. La transicion a energias limpias crea demanda estructural de cobre, litio, niquel y cobalto, con potencial minero para Mexico que tiene reservas de plata y cobre.'
  },
  'Utilities': {
    name: 'Sector Utilidades (Servicios Publicos) � XLU',
    ticker: 'XLU', gradient: 'linear-gradient(135deg,#0e7490,#0891b2)',
    what: 'XLU incluye a NextEra Energy, Duke Energy y Southern Company. Sector defensivo y de alta rentabilidad por dividendo. Funciona como un bono de renta variable � sube cuando las tasas de interes bajan y viceversa.',
    watching: ['Nivel de tasas de interes (relacion inversa directa)','Regulacion de tarifas energeticas estatales','Inversion en energias renovables (solar/eolico)','Demanda de energia para centros de datos IA','Politica energetica federal EUA','Comparativo dividendo vs rendimiento T-Note'],
    impacts: [{a:'T-Note 10A EUA',dir:'Correlacion inversa directa muy fuerte'},{a:'Bonos de largo plazo (TLT)',dir:'Movimiento paralelo en ciclos de tasa'},{a:'Sectores defensivos (XLP, XLV)',dir:'Correlacion positiva en risk-off'},{a:'FIBRAS Mexico',dir:'Logica de tasas identica en mercado MX'},{a:'Dividendos',dir:'Atractivos en contextos de baja de tasas'}],
    context: 'XLU cayo mas del 20% en 2022-2023 con el ciclo de alzas de la Fed. Con expectativas de recortes, se ha recuperado. El boom de centros de datos para IA esta creando demanda electrica record � beneficia a utilities como NRG y Constellation Energy. En Mexico, las FIBRAS de infraestructura siguen la misma logica de sensibilidad a tasas Banxico.'
  },
  'Inmobiliario': {
    name: 'Sector Inmobiliario (REITs) � XLRE',
    ticker: 'XLRE', gradient: 'linear-gradient(135deg,#134e4a,#0f766e)',
    what: 'XLRE incluye a American Tower, Prologis y Crown Castle. Son REITs (fideicomisos de bienes raices) que distribuyen alto dividendo por ley. Son el sector mas sensible a las tasas de interes del S&P 500.',
    watching: ['Tasas de interes (costo de financiamiento y comparativo vs bono)','Demanda de data centers para IA','Mercado inmobiliario residencial y comercial EUA','Ocupacion y tasas de renta','Cap rates vs tasas de bonos','Inflacion (REITs con clausulas de ajuste CPI)'],
    impacts: [{a:'T-Note 10A',dir:'Correlacion inversa muy fuerte'},{a:'Utilidades (XLU)',dir:'Movimiento paralelo como activos de ingreso'},{a:'Bonos largo plazo (TLT)',dir:'Comportamiento similar'},{a:'FIBRAS Mexico',dir:'Equivalente local � misma logica de tasas'},{a:'Sector Construccion MX',dir:'Ciclos inmobiliarios vinculados'}],
    context: 'XLRE es el sector mas peque�o del S&P 500 y el mas sensible a las tasas. Cayo mas del 25% en 2022. Los data center REITs (Equinix, Digital Realty) son un driver unico por la demanda de IA. En Mexico, las FIBRAS (fideicomisos de bienes raices bursatiles) como FIBRA UNO y FIBRA Monterrey siguen la misma logica de sensibilidad a tasas de Banxico.'
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

  document.getElementById('pm-ticker').textContent = (profile.ticker || label) + (profile.unit ? ' � ' + profile.unit : '');
  document.getElementById('pm-name').textContent = profile.name;
  document.getElementById('pm-value').textContent = value;

  var chgEl = document.getElementById('pm-chg');
  if (pct && isPulse) {
    chgEl.textContent = pct;
    chgEl.style.background = pct.startsWith('+') ? 'rgba(22,163,74,.28)' : 'rgba(220,38,38,.28)';
    chgEl.style.display = 'block';
  } else if (!isPulse) {
    chgEl.textContent = value;
    chgEl.style.background = value.startsWith('-') ? 'rgba(220,38,38,.28)' : value === '�' ? 'rgba(255,255,255,.12)' : 'rgba(22,163,74,.28)';
    chgEl.style.display = 'block';
  } else {
    chgEl.style.display = 'none';
  }

  var interpParsed = isPulse && profile.interpretation ? profile.interpretation(value)
    : { label: value.startsWith('-') ? 'SECTOR A LA BAJA HOY' : value === '�' ? 'SIN DATO' : 'SECTOR AL ALZA HOY',
        color:  value.startsWith('-') ? '#dc2626' : value === '�' ? '#94a3b8' : '#16a34a',
        text: 'Este sector del S&P 500 mueve flujos de capital global. Su desempe�o diario refleja el sentimiento de riesgo para activos de renta variable.' };

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
    return '<div style="padding:.28rem 0;border-bottom:1px solid #f1f5f9;font-size:.67rem;color:#334155;display:flex;align-items:flex-start;gap:.35rem;"><span style="color:#00213a;font-weight:700;flex-shrink:0;">�</span>' + w + '</div>';
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
  var sep  = '-'.repeat(44);
  var sep2 = '-'.repeat(44);
  var watching = (profile.watching || profile.drivers || []).map(function(w){ return '  � ' + w; }).join('\n');
  var impacts  = profile.impacts.map(function(im){ return '  � ' + im.a + ' � ' + im.dir; }).join('\n');
  var risks    = (profile.risks||[]).map(function(r){ return '  ? ' + r; }).join('\n');
  return [
    sep2,
    'REPORTE DE INDICADOR DE MERCADO',
    'VALLNews Intelligence � ' + new Date().toLocaleString('es-MX'),
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
    '� VALLNews � Informacion con fines educativos'
  ].filter(Boolean).join('\n');
}

function _loadGeminiPulse(name, label, value, pct, what) {
  var prompt = 'Eres analista financiero experto. Analiza este indicador de mercado en 3 puntos concisos: 1) Que indica el nivel actual para los mercados globales, 2) Implicacion para activos de riesgo y carteras de inversion, 3) Perspectiva especifica para inversionistas mexicanos. INDICADOR: ' + name + '. Valor: ' + value + (pct ? ', Var: ' + pct : '') + '. Contexto: ' + what.slice(0,400);
  fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:prompt})})
    .then(function(r){return r.json();})
    .then(function(d){
      var aiText = d.reply || d.response || d.message || 'Analisis no disponible.';
      var el = document.getElementById('pm-analysis');
      if (el) el.textContent = aiText;
      var rep = document.getElementById('pm-report');
      if (rep) rep.textContent = rep.textContent.replace('(generando analisis inteligente...)', aiText);
    })
    .catch(function(){
      var el = document.getElementById('pm-analysis');
      if (el) el.textContent = 'No se pudo conectar con VALL-AI.';
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

/* === Script bloque lineas 3998-4255 === */
/* -- Market Cap Detail Modal Logic --------------------------------- */
const MKT_CAP_PROFILES = {
    'IPC': {
        gradient: 'linear-gradient(135deg,#001828,#006341)',
        fullName: '�ndice de Precios y Cotizaciones',
        exchange: 'Bolsa Mexicana de Valores',
        context: 'Principal benchmark de la renta variable mexicana. Representa las ~35 emisoras de mayor liquidez y capitalizaci�n del mercado burs�til de M�xico.',
        monitors: ['Confianza consumidor MX','Tipo de cambio USD/MXN','Precio petr�leo','Pol�tica Banxico','Remesas','Balanza comercial'],
        impacts: [
            { label:'USD/MXN',    desc:'Peso fuerte impulsa entradas de capital extranjero al IPC.' },
            { label:'FIBRAS',     desc:'Comparten flujos de inversi�n inmobiliaria local.' },
            { label:'Pemex / AMX',desc:'Las ponderaciones m�s altas mueven el �ndice significativamente.' },
            { label:'Bonos MX',   desc:'Tasas Banxico afectan el costo de capital de las emisoras.' },
        ],
    },
    'S&P 500': {
        gradient: 'linear-gradient(135deg,#0c4a6e,#1e40af)',
        fullName: 'Standard & Poor\'s 500',
        exchange: 'NYSE / NASDAQ',
        context: 'Benchmark de referencia global que agrupa las 500 empresas de mayor capitalizaci�n en EE.UU. Act�a como bar�metro del ciclo econ�mico estadounidense y es el �ndice m�s seguido del mundo.',
        monitors: ['Decisiones Fed (FOMC)','NFP y desempleo EE.UU.','IPC / PCE inflaci�n','Earnings season','Tesoro 10Y','Confianza del consumidor'],
        impacts: [
            { label:'IPC M�xico',  desc:'Alta correlaci�n: ca�da del S&P arrastra flujos fuera de mercados emergentes.' },
            { label:'DXY',         desc:'D�lar fuerte reduce m�ltiplos del S&P v�a efecto valuaci�n.' },
            { label:'Bonos US 10Y',desc:'Tasas altas compiten con la renta variable, reducen el P/E.' },
            { label:'Oro',         desc:'Relaci�n inversa en momentos de risk-off (fuga a activos seguros).' },
        ],
    },
    'NASDAQ 100': {
        gradient: 'linear-gradient(135deg,#1e1b4b,#4338ca)',
        fullName: 'NASDAQ-100 Index',
        exchange: 'NASDAQ',
        context: '�ndice de las 100 mayores empresas no financieras del NASDAQ, dominado por tecnolog�a (Apple, Microsoft, Nvidia, Meta, Amazon). Amplifica los movimientos del S&P y es altamente sensible a tasas de inter�s.',
        monitors: ['Tasas Fed','Earnings Big Tech','IA / semiconductores (NVDA)','Rendimiento real 10Y','VIX','Regulaci�n antitrust'],
        impacts: [
            { label:'S&P 500',        desc:'Correlaci�n ~0.95; el NASDAQ lidera los movimientos del mercado amplio.' },
            { label:'Bitcoin',         desc:'Ambos activos comparten perfil de riesgo growth / especulativo.' },
            { label:'Bonos US',        desc:'Duration larga: muy sensible a subidas de tasas (efecto descuento DCF).' },
            { label:'Semiconductores', desc:'NVDA, AMD, Broadcom pesan fuerte; noticias de IA mueven el �ndice.' },
        ],
    },
    'USD / MXN': {
        gradient: 'linear-gradient(135deg,#003a2c,#065f46)',
        fullName: 'D�lar Americano / Peso Mexicano',
        exchange: 'FX OTC / FOREX',
        context: 'Par de divisas que refleja la fortaleza relativa del d�lar versus el peso. Uno de los pares m�s l�quidos de Am�rica Latina. Sensible al diferencial de tasas Banxico�Fed, al petr�leo y a noticias geopol�ticas M�xico�EE.UU.',
        monitors: ['Diferencial tasa Banxico vs Fed','Precio petr�leo WTI','Remesas (soporte al peso)','Nearshoring / IED','Riesgo pol�tico MX','Inflaci�n bilateral'],
        impacts: [
            { label:'IPC',            desc:'Peso d�bil encarece importaciones y reduce m�rgenes de emisoras.' },
            { label:'Bonos MX',       desc:'Depreciaci�n del peso presiona al Banxico a subir tasas ? bonos caen.' },
            { label:'DXY',            desc:'MXN es proxy del DXY en emergentes: DXY sube ? USD/MXN sube.' },
            { label:'Materias primas',desc:'M�xico exporta petr�leo y plata; precios bajos presionan al peso.' },
        ],
    },
    'Oro': {
        gradient: 'linear-gradient(135deg,#78350f,#b45309)',
        fullName: 'Oro Spot / Futuros (XAU/USD)',
        exchange: 'COMEX / OTC',
        context: 'Activo refugio por excelencia, denominado en d�lares. Sube en entornos de incertidumbre, inflaci�n o debilidad del d�lar. Los bancos centrales son compradores estructurales importantes desde 2022.',
        monitors: ['Tasas reales EE.UU. (TIPS)','DXY','Inflaci�n PCE / IPC','Compras bancos centrales','Tensiones geopol�ticas','Flujos ETF GLD'],
        impacts: [
            { label:'D�lar (DXY)', desc:'Relaci�n inversa estructural: DXY sube ? Oro baja en t�rminos nominales.' },
            { label:'Bonos US',    desc:'Tasa real negativa ? Oro sube (no hay costo de oportunidad).' },
            { label:'Plata (XAG)', desc:'Correlaci�n >0.85; la plata amplifica los movimientos del oro.' },
            { label:'S&P 500',     desc:'Relaci�n mixta: sube en crashes pero cae en rallies prolongados.' },
        ],
    },
    'Bitcoin': {
        gradient: 'linear-gradient(135deg,#78350f,#c2410c)',
        fullName: 'Bitcoin / USD',
        exchange: 'Cripto OTC / Spot ETF',
        context: 'Principal criptoactivo por capitalizaci�n. Act�a como activo de riesgo en mercados alcistas y como reserva de valor alternativa en p�rdida de confianza institucional. Desde los ETFs spot de 2024, tiene correlaci�n creciente con flujos institucionales.',
        monitors: ['Flujos ETF spot BTC','Halvings','Regulaci�n SEC / CFTC','Fear & Greed Index','Liquidez macro global','Narrativa IA / activos digitales'],
        impacts: [
            { label:'NASDAQ',  desc:'Perfil risk-on compartido: ambos caen en sell-offs macro.' },
            { label:'Ethereum',desc:'Correlaci�n alta (>0.90); ETH amplifica los movimientos del BTC.' },
            { label:'Oro',     desc:'Narrativa "oro digital": en algunos contextos act�an como sustitutos.' },
            { label:'DXY',     desc:'D�lar fuerte presiona a BTC v�a reducci�n de apetito por risk-on.' },
        ],
    },
    'DXY': {
        gradient: 'linear-gradient(135deg,#0f172a,#1e3a5f)',
        fullName: 'US Dollar Index',
        exchange: 'ICE Futures',
        context: '�ndice que mide la fortaleza del d�lar frente a una canasta de 6 divisas principales (EUR 57.6%, JPY 13.6%, GBP 11.9%, CAD 9.1%, SEK 4.2%, CHF 3.6%). Bar�metro del d�lar a nivel global.',
        monitors: ['Decisiones Fed (FOMC)','Diferenciales de tasas G10','Inflaci�n EE.UU.','Flujos a treasuries','Riesgo geopol�tico global','EUR/USD (mayor ponderaci�n)'],
        impacts: [
            { label:'Materias primas',desc:'DXY sube ? Oro, Petr�leo, Plata bajan (denominados en USD).' },
            { label:'Emergentes',     desc:'DXY alto presiona divisas EM, encarece deuda externa en d�lares.' },
            { label:'USD/MXN',        desc:'Correlaci�n directa: DXY sube ? USD/MXN sube (peso se debilita).' },
            { label:'S&P 500',        desc:'D�lar muy fuerte reduce utilidades de multinacionales EE.UU. (efecto FX).' },
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
    const arrow = pct == null ? '' : isUp ? '?' : '?';

    function fmtP(n) {
        if (n == null) return '�';
        if (n >= 10000) return n.toLocaleString('es-MX', { maximumFractionDigits: 0 });
        if (n >= 1)     return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return n.toFixed(4);
    }

    const priceStr = fmtP(price);
    const pctStr   = pct != null ? (isUp ? '+' : '') + pct.toFixed(2) + '%' : '�';
    const pctColor = pct == null ? '#64748b' : isUp ? '#86efac' : '#fca5a5';

    let fiveDPct = '';
    if (candles.length >= 2) {
        const closes = candles.map(c => c.close);
        const lo = Math.min(...closes), hi = Math.max(...closes);
        fiveDPct = ((hi - lo) / lo * 100).toFixed(1) + '%';
    }

    let absChange = '�';
    if (price != null && pct != null) {
        const prev = price / (1 + pct / 100);
        const diff = price - prev;
        absChange = (diff >= 0 ? '+' : '-') + fmtP(Math.abs(diff));
    }

    document.getElementById('mm-gradient').style.background = profile.gradient;
    document.getElementById('mm-label').textContent    = entry.asset.label;
    document.getElementById('mm-sub').textContent      = entry.asset.sub + ' � ' + profile.exchange;
    document.getElementById('mm-price').textContent    = priceStr;
    document.getElementById('mm-pct').textContent      = arrow + ' ' + pctStr;
    document.getElementById('mm-pct').style.color      = pctColor;
    document.getElementById('mm-fullname').textContent = profile.fullName;
    document.getElementById('mm-context').textContent  = profile.context;

    document.getElementById('mm-metrics').innerHTML = [
        ['Precio Actual',  priceStr,    null],
        ['Variaci�n D�a',  arrow + ' ' + pctStr + (absChange !== '�' ? ' (' + absChange + ')' : ''), pct == null ? '#64748b' : isUp ? '#16a34a' : '#dc2626'],
        ['M�ximo D�a',     fmtP(high),  null],
        ['M�nimo D�a',     fmtP(low),   null],
        ['Rango 5 D�as',   fiveDPct || '�', null],
    ].map(([l, v, c]) =>
        `<div class="bm-metric-row"><span class="bm-metric-lbl">${l}</span><span class="bm-metric-val"${c ? ` style="color:${c}"` : ''}>${v}</span></div>`
    ).join('');

    document.getElementById('mm-monitors').innerHTML = profile.monitors.map(m =>
        `<span class="bm-risk-tag" style="margin:.2rem .2rem .2rem 0">${m}</span>`
    ).join('');

    document.getElementById('mm-impacts').innerHTML = profile.impacts.map(imp =>
        `<div class="bm-metric-row" style="align-items:flex-start;gap:.5rem"><span class="bm-metric-lbl" style="flex:0 0 auto;min-width:90px;padding-top:.1rem">${imp.label}</span><span class="bm-metric-val" style="font-size:.77rem;color:#475569;font-family:inherit;font-weight:400;text-align:left;white-space:normal;line-height:1.5">${imp.desc}</span></div>`
    ).join('');

    document.getElementById('mm-ai-box').innerHTML = '<span class="bm-ai-badge">VALL-AI</span> <span style="color:#64748b;font-size:.8rem">Analizando con Gemini�</span>';
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

    const prompt = `Eres VALL-AI, analista de mercados para VALL News. Analiza el siguiente activo y entrega un an�lisis profesional en ESPA�OL.

ACTIVO: ${label} (${profile.fullName})
EXCHANGE: ${profile.exchange}
PRECIO ACTUAL: ${priceStr}
VARIACI�N D�A: ${pctStr}
RANGO 5 D�AS: ${fiveDPct || 'N/D'}
CONTEXTO: ${profile.context}

Entrega exactamente estas 4 secciones:

1. AN�LISIS DE LA SESI�N (2-3 oraciones): interpreta la variaci�n de hoy en contexto macro.
2. FACTORES CLAVE: 3 bullets concisos de qu� est� moviendo al activo ahora.
3. QU� VIGILAR: 2 catalizadores pr�ximos que pueden mover el precio.
4. SESGO DE CORTO PLAZO: una oraci�n con direcci�n probable (alcista/bajista/neutral) y por qu�.

S� directo, t�cnico y �til. Sin frases de apertura gen�ricas.`;

    try {
        const resp = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: prompt }),
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        const text = (data.reply || data.response || data.text || '').trim();
        if (!text) throw new Error('respuesta vac�a');

        aiBox.innerHTML = '<span class="bm-ai-badge">VALL-AI</span><div style="margin-top:.5rem;line-height:1.65;white-space:pre-wrap;font-size:.83rem;color:#1e293b">' +
            text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';

        const now = new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
        reportEl.textContent = `----------------------------------------
REPORTE EJECUTIVO � ${label.toUpperCase()}
${profile.fullName}
${profile.exchange}
Generado: ${now}
----------------------------------------

DATOS DE SESI�N
  Precio Actual : ${priceStr}
  Variaci�n D�a : ${pctStr}
  Rango 5 D�as  : ${fiveDPct || 'N/D'}

AN�LISIS VALL-AI
${text}

----------------------------------------
VALL News � Inteligencia Financiera
----------------------------------------`;
        reportSection.style.display = 'block';
    } catch (e) {
        aiBox.innerHTML = '<span class="bm-ai-badge">VALL-AI</span> <span style="color:#ef4444;font-size:.8rem">No se pudo cargar el an�lisis � ' + e.message + '</span>';
    }
}

/* === Script bloque lineas 4483-4751 === */
/* -- FX Detail Modal Logic --------------------------------- */
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
    var arrow   = pct == null ? '' : (isUp ? '?' : '?');
    var disp    = pair.mode === 'jpy_cross' ? price.toFixed(4) : price.toFixed(2);
    var pctStr  = pct != null ? (isUp ? '+' : '') + pct.toFixed(2) + '%' : '�';
    var pctColor = pct == null ? '#64748b' : (isUp ? '#86efac' : '#fca5a5');
    var range5d = '�';
    if (candles && candles.length >= 2) {
        var cls = candles.map(function(c) { return c.close; });
        var clo = Math.min.apply(null, cls), chi = Math.max.apply(null, cls);
        range5d = ((chi - clo) / clo * 100).toFixed(2) + '%';
    }
    var absChange = '�';
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
        ['Variacion Dia', arrow + ' ' + pctStr + (absChange !== '�' ? ' (' + absChange + ')' : ''), pct == null ? '#64748b' : isUp ? '#16a34a' : '#dc2626'],
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
    document.getElementById('fm-ai-box').innerHTML = '<span class="bm-ai-badge">VALL-AI</span> <span style="color:#64748b;font-size:.8rem">Analizando con Gemini�</span>';
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
        var resp = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: prompt }),
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        var text = (data.reply || data.response || data.text || '').trim();
        if (!text) throw new Error('respuesta vacia');
        aiBox.innerHTML = '<span class="bm-ai-badge">VALL-AI</span><div style="margin-top:.5rem;line-height:1.65;white-space:pre-wrap;font-size:.83rem;color:#1e293b">' +
            text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>';
        var now = new Date().toLocaleString('es-MX', { dateStyle:'long', timeStyle:'short' });
        reportEl.textContent =
            '----------------------------------------\n' +
            'REPORTE EJECUTIVO - ' + label + '\n' +
            profile.fullName + '\n' +
            'Generado: ' + now + '\n' +
            '----------------------------------------\n\n' +
            'DATOS DE SESION\n' +
            '  Precio Actual : $' + priceStr + ' MXN\n' +
            '  Variacion Dia : ' + pctStr + '\n\n' +
            'ANALISIS VALL-AI\n' +
            text + '\n\n' +
            '----------------------------------------\n' +
            'VALL News - Inteligencia Financiera\n' +
            '----------------------------------------';
        reportSection.style.display = 'block';
    } catch (e) {
        aiBox.innerHTML = '<span class="bm-ai-badge">VALL-AI</span> <span style="color:#ef4444;font-size:.8rem">No se pudo cargar el analisis - ' + e.message + '</span>';
    }
}