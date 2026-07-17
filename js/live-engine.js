'use strict';

(function VallLive() {

    // ── Configuración ──────────────────────────────────────────
    // Relative URL on Vercel (same domain); localhost for local dev.
    const BACKEND = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
    // Nota: VDS.load() ya retorna de inmediato si el caché de 12h sigue vigente,
    // sin tocar la red — revisar seguido no gasta cuota, solo permite detectar
    // a tiempo el momento exacto en que el caché expira durante una sesión larga.
    const T = {
        clock:       60_000,        //  1 min  – reloj
        newsRotate:   8_000,        //  8 seg  – rotar titulares
        newsFetch:   15 * 60_000,   // 15 min  – revisa si el caché de noticias/imágenes ya expiró (12h)
        market:       5 * 60_000,   //  5 min  – revisa si el caché de Banxico/Alpha Vantage ya expiró (12h)
        globalRisk:   5 * 60_000,   //  5 min  – VIX/HYG/LQD (proxy propio, sin cuota de terceros)
    };

    // ── Estado ─────────────────────────────────────────────────
    const S = {
        market: {
            usdmxn:   null,   // open.er-api.com
            fix:      null,   // Banxico SF43718 (oficial)
            tiie:     null,   // Banxico SF61745
            infl:     null,   // Banxico SP74660
            corn:     null,   // { price, pct }
            hogs:     null,   // { price, pct }
            soybeans: null,   // { price, pct }
            wheat:    null,   // { price, pct }
            crude:    null,   // { price, pct }
            qqq:      null,   // { price, pct }
            vix:          null,   // ^VIX precio
            creditSpread: null,   // HYG% - LQD% (apetito de riesgo global)
        },
        news: { finanzas:[], mercados:[], geo:[], proteinas:[], mexico:[] },
        idx:  { finanzas:0,  mercados:0,  geo:0,  proteinas:0,  mexico:0 },
        lastMarketAt: null,
        backendOk:    false,
        vai:     { finanzas: null, global: null }, // { pred, verdict, alerta, asset }
        vaiView: 'finanzas',
    };

    // ── Helpers DOM ────────────────────────────────────────────
    const $   = id => document.getElementById(id);
    const set = (id, v) => { const e = $(id); if (e && v != null) e.textContent = v; };

    function fade(id, fn) {
        const el = $(id);
        if (!el) return;
        el.style.transition = 'opacity .32s ease';
        el.style.opacity    = '0';
        setTimeout(() => { fn(el); el.style.opacity = '1'; }, 340);
    }

    async function safeFetch(url, opts = {}, ms = 10_000) {
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), ms);
        try   { return await fetch(url, { signal: ctrl.signal, ...opts }); }
        finally { clearTimeout(tid); }
    }

    // ── Validación ─────────────────────────────────────────────
    // Un solo valor corrupto (NaN, string, undefined) no debe tronar
    // toda una función de render — se valida antes de formatear.
    const isNum = v => typeof v === 'number' && Number.isFinite(v);
    const fmt   = (v, d = 2) => isNum(v) ? v.toFixed(d) : '—';

    // ── Clasificador semántico ─────────────────────────────────
    // Cada artículo se analiza por contenido para ir a la categoría
    // correcta independientemente de qué API lo originó.
    // Palabras clave: alto peso = 3 pts, bajo peso = 1 pt.
    const KW = {
        finanzas: {
            h: [
                'tiie','tasa de interés','política monetaria','inflación',
                'banco central','banco de méxico','banxico','fed rate',
                'reserva federal','bce','rendimiento','cetes','bono gubernamental',
                'interest rate','monetary policy','central bank','inflation',
                'rate hike','rate cut','fed funds','yield','deuda soberana',
                'tasa objetivo','basis point','punto base',
            ],
            l: [
                'forex','tipo de cambio','crédito','deuda','financiero',
                'financial','banca','mercado financiero','divisa','capital',
            ],
        },
        mercados: {
            h: [
                'nasdaq','dow jones','s&p 500','s&p500','bolsa de valores',
                'wall street','stock market','acciones','petróleo','crude oil',
                'oil price','brent','wti','gas natural','cobre','copper',
                'índice bursátil','equity','mercado de valores','índice',
                'oil futures','energy market',
            ],
            l: [
                'trading','inversión','mercado','commodities','energy','energía',
                'market','cotización','precio de','futures','contrato futuro',
            ],
        },
        geo: {
            h: [
                'guerra','conflicto','war','conflict','sanction','sanción',
                'geopolít','middle east','oriente medio','ukraine','ucrania',
                'rusia','russia','china','iran','israel','diplomac','aranceles',
                'tariff','nato','otan','tensión bélica','crisis humanitaria',
                'military','ejército','tropas','embargo','bloqueo',
            ],
            l: [
                'acuerdo','tratado','deal','trade war','guerra comercial',
                'disputa','relaciones internacionales','alianza','paz',
            ],
        },
        proteinas: {
            h: [
                'maíz','corn','soya','soja','soybean','trigo','wheat',
                'lean hog','lean hogs','cerdo','pork','beef','carne de res',
                'carne','ganado','livestock','poultry','aves de corral',
                'cosecha','harvest','usda','feedlot','crop report',
                'live cattle','feeder cattle','chicargo board','cbot',
                'grano','grain','avicultura',
            ],
            l: [
                'alimento','food price','agro','agricultural','agricultura',
                'producción agrícola','proteína animal','proteína vegetal',
                'mercado de granos','materia prima agrícola',
            ],
        },
        mexico: {
            h: [
                // 'méxico'/'mexico' es el sustantivo; los titulares traducidos casi
                // siempre usan el adjetivo ("peso mexicano", "superpeso mexicano",
                // "economía mexicana") — sin 'mexicano'/'mexicana' como keywords
                // propias, la mayoría de esos titulares no clasificaban en nada.
                'méxico','mexico','mexicano','mexicana','mxn','peso mexicano',
                'banxico','pemex','shcp','inegi','economía mexicana',
                'pib de méxico','exportaciones mexicanas','manufactura México',
                'banco de méxico','inflación en méxico','remesas',
                'tipo de cambio peso','dólar peso','superpeso',
            ],
            l: [
                'latinoamérica','emergentes','cdmx','usmca','t-mec','tlcan',
                'nearshoring','sector exportador','industria nacional',
            ],
        },
    };

    // Coincidencia por palabra completa (no subcadena): antes 'ganado' (h de
    // proteinas) hacía match dentro de 'ganadores' ("los mayores ganadores..."),
    // clasificando mal noticias de mercados como proteínas. \p{L}/\p{N} cubre
    // también acentos y ñ, a diferencia de \b que solo entiende [A-Za-z0-9_].
    function _escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    const _kwReCache = new Map();
    function _kwMatches(text, kw) {
        let re = _kwReCache.get(kw);
        if (!re) {
            re = new RegExp('(?<![\\p{L}\\p{N}])' + _escapeRegex(kw) + '(?![\\p{L}\\p{N}])', 'iu');
            _kwReCache.set(kw, re);
        }
        return re.test(text);
    }

    // Devuelve las categorías que coinciden, ordenadas por puntaje.
    // Si el segundo lugar tiene ≥60% del primero también se incluye (cross-post).
    function classifyTitle(title) {
        if (!title || typeof title !== 'string') return [];
        const scores = {};

        for (const [cat, { h, l }] of Object.entries(KW)) {
            let s = 0;
            h.forEach(kw => { if (_kwMatches(title, kw)) s += 3; });
            l.forEach(kw => { if (_kwMatches(title, kw)) s += 1; });
            if (s > 0) scores[cat] = s;
        }

        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        if (!sorted.length) return [];

        const [topCat, topScore] = sorted[0];
        const result = [topCat];

        // Cross-post si la segunda categoría tiene puntaje suficiente
        if (sorted.length > 1 && sorted[1][1] >= topScore * 0.6) {
            result.push(sorted[1][0]);
        }
        return result;
    }

    // ── Reloj ──────────────────────────────────────────────────
    function tickClock() {
        const now   = new Date();
        const hora  = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        const fecha = now.toLocaleDateString('es-MX',
            { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
        const stamp = fecha + ' · ' + hora;

        ['sd-0','sd-1','sd-2','sd-3'].forEach(id => set(id, stamp));
        const sd = $('sectionDate');
        if (sd) sd.textContent = hora;

        if (S.lastMarketAt) {
            const mins = Math.round((Date.now() - S.lastMarketAt) / 60_000);
            set('lastUpdated', mins < 1 ? 'ahora mismo' : `hace ${mins} min`);
        }
    }

    // ── Datos de mercado (Banxico + Alpha Vantage — cuota limitada).
    //    VDS.load() ya bloquea la red mientras el caché de 12h esté vigente,
    //    así que llamar esto seguido es gratis; solo se gasta cuota real
    //    cuando el caché efectivamente expira. ──
    async function loadMarket(force = false) {
        if (force) {
            [
                'rate_usdmxn','bnx_SF43718','bnx_SF61745','bnx_SP74660',
                'av_cp_CORN','av_cp_LEAN_HOGS','av_cp_SOYBEANS',
                'av_cp_WHEAT','av_cp_CRUDE_OIL','av_q_QQQ',
            ].forEach(k => VDS.clear(k));
        }

        const [uR, fxR, tR, iR, cR, hR, sR, wR, oR, qR] = await Promise.allSettled([
            VDS.usdmxn(),
            VDS.banxico('SF43718'),              // Fix Banxico (oficial)
            VDS.banxico('SF61745'),              // TIIE 28d
            VDS.banxico('SP74660'),              // Inflación anual
            VDS.commodityWithPct('CORN'),
            VDS.commodityWithPct('LEAN_HOGS'),
            VDS.commodityWithPct('SOYBEANS'),
            VDS.commodityWithPct('WHEAT'),
            VDS.commodityWithPct('CRUDE_OIL'),
            VDS.quote('QQQ'),
        ]);

        const pick = r => r.status === 'fulfilled' && r.value != null ? r.value : null;
        S.market.usdmxn   = pick(uR)  ?? S.market.usdmxn;
        S.market.fix      = pick(fxR) ?? S.market.fix;
        S.market.tiie     = pick(tR)  ?? S.market.tiie;
        S.market.infl     = pick(iR)  ?? S.market.infl;
        S.market.corn     = pick(cR)  ?? S.market.corn;
        S.market.hogs     = pick(hR)  ?? S.market.hogs;
        S.market.soybeans = pick(sR)  ?? S.market.soybeans;
        S.market.wheat    = pick(wR)  ?? S.market.wheat;
        S.market.crude    = pick(oR)  ?? S.market.crude;
        S.market.qqq      = pick(qR)  ?? S.market.qqq;

        S.lastMarketAt = Date.now();
        renderSlides();
        renderTicker();
        renderVAI();
        set('lastUpdated', 'ahora mismo');
    }

    // ── Riesgo global (VIX/HYG/LQD vía proxy propio — sin cuota de terceros,
    //    el backend ya tiene su propia caché de 15 min + límite de concurrencia,
    //    así que esto sí puede refrescarse cada pocos minutos sin riesgo) ──
    async function loadGlobalRisk() {
        try {
            const [vixR, hygR, lqdR] = await Promise.allSettled([
                safeFetch(`${BACKEND}/api/stock-history?ticker=%5EVIX&interval=1d&range=5d`).then(r => r.ok ? r.json() : null).catch(() => null),
                safeFetch(`${BACKEND}/api/stock-history?ticker=HYG&interval=1d&range=5d`).then(r => r.ok ? r.json() : null).catch(() => null),
                safeFetch(`${BACKEND}/api/stock-history?ticker=LQD&interval=1d&range=5d`).then(r => r.ok ? r.json() : null).catch(() => null),
            ]);
            const pick = r => r.status === 'fulfilled' && r.value != null ? r.value : null;

            const vixPrice = pick(vixR)?.meta?.regularMarketPrice;
            if (isNum(vixPrice)) S.market.vix = vixPrice;

            const hygPct = pick(hygR)?.meta?.regularMarketChangePercent;
            const lqdPct = pick(lqdR)?.meta?.regularMarketChangePercent;
            if (isNum(hygPct) && isNum(lqdPct)) S.market.creditSpread = hygPct - lqdPct;

            renderVAI();
        } catch (e) { console.error('loadGlobalRisk:', e); }
    }

    // Trunca un titular de forma segura para mostrar en slide/tarjeta.
    function shorten(text, max) {
        if (typeof text !== 'string' || !text) return '';
        return text.length > max ? text.slice(0, max - 3) + '…' : text;
    }

    // ── Inyección en slides ────────────────────────────────────
    // Cada bloque va en su propio try/catch: un dato corrupto en una sección
    // no debe impedir que las otras cuatro se actualicen correctamente.
    // Fondo estático original de cada card/slide (el que trae el HTML), capturado
    // la primera vez que se toca ese elemento — sirve para volver a él cuando el
    // artículo actual no trae una imagen propia válida. Sin esto, si un titular sin
    // imagen (ej. una nota del backend, o una con solo el logo de la agencia, ya
    // filtrada) se vuelve el contenido activo, el fondo se quedaba con la FOTO DE
    // UN ARTÍCULO ANTERIOR Y NO RELACIONADO en vez de la imagen neutra — esa
    // combinación de "titular X + foto de un tema Y distinto" era precisamente la
    // inyección de información que no correspondía a la imagen.
    const _defaultBg = new Map();
    function _bgFor(id, dynamicUrl) {
        const el = $(id);
        if (!el) return;
        if (!_defaultBg.has(id)) _defaultBg.set(id, el.style.backgroundImage);
        el.style.backgroundImage = dynamicUrl ? `url('${dynamicUrl}')` : _defaultBg.get(id);
    }

    // Aplica la imagen del primer artículo clasificado en ese pool al fondo del
    // slide — independiente de si el texto mostrado terminó siendo el resumen
    // numérico (TIIE, USD/MXN, etc.) o el titular de la noticia. Antes esta
    // lógica vivía SOLO dentro de la rama "sin datos numéricos" de cada slide,
    // así que en la práctica finanzas/mercados/proteínas/méxico casi nunca
    // llegaban a actualizar su imagen (esos datos numéricos casi siempre están
    // disponibles) y se quedaban fijos en la imagen estática del HTML.
    function applySlideImage(slideId, poolKey) {
        const item = S.news[poolKey]?.[0];
        const img = item && typeof item !== 'string' ? item.image : null;
        _bgFor(slideId, img);
    }

    function renderSlides() {
        const { usdmxn, fix, tiie, infl, corn, hogs, soybeans, wheat, crude } = S.market;

        // Slide Proteínas: maíz · hogs · soya · trigo + variación mensual
        try {
            if (isNum(corn?.price)) {
                const parts = [`Maíz $${fmt(corn.price)}/bu`];
                if (isNum(corn.pct)) parts[0] += ` (${VDS.fmtPct(corn.pct)})`;
                if (isNum(hogs?.price))     parts.push(`L. Hogs $${fmt(hogs.price)}/cwt`);
                if (isNum(soybeans?.price)) parts.push(`Soya $${fmt(soybeans.price)}/bu`);
                if (isNum(wheat?.price))    parts.push(`Trigo $${fmt(wheat.price)}/bu`);

                fade('st-proteinas', el => { el.textContent = parts.join(' · '); });

                let desc = `Maíz en Chicago: $${fmt(corn.price)}/bu`;
                if (isNum(corn.pct)) desc += `, ${VDS.fmtPct(corn.pct)} mensual`;
                if (isNum(soybeans?.price)) desc += `. Soya: $${fmt(soybeans.price)}/bu`;
                if (isNum(wheat?.price))    desc += `. Trigo: $${fmt(wheat.price)}/bu`;
                desc += '.';
                set('sd-prot-desc', desc);
            } else if (S.news.proteinas.length) {
                // Fallback semántico: mejor titular clasificado de proteínas
                const item = S.news.proteinas[0];
                const t = typeof item === 'string' ? item : item.title;
                fade('st-proteinas', el => { el.textContent = shorten(t, 100); });
            }
            applySlideImage('slide-proteinas', 'proteinas');
        } catch (e) { console.error('renderSlides (proteinas):', e); }

        // Slide Finanzas: TIIE + inflación + petróleo
        try {
            if (isNum(tiie)) {
                const inflStr = isNum(infl) ? ` · Inflación ${fmt(infl)}%` : '';
                const oilStr  = isNum(crude?.price) ? ` · WTI $${fmt(crude.price)}/bbl` : '';
                fade('st-finanzas', el => {
                    el.textContent = `Banxico: TIIE 28d ${fmt(tiie)}%${inflStr}${oilStr}`;
                });
                let desc = `TIIE interbancaria: ${fmt(tiie)}%.`;
                if (isNum(infl))         desc += ` Inflación anual: ${fmt(infl)}%.`;
                if (isNum(crude?.price)) desc += ` Petróleo WTI: $${fmt(crude.price)}/bbl${isNum(crude.pct) ? ` (${VDS.fmtPct(crude.pct)})` : ''}.`;
                set('sd-fin-desc', desc);
            } else if (S.news.finanzas.length) {
                // Fallback semántico: mejor titular clasificado de finanzas
                const item = S.news.finanzas[0];
                const t = typeof item === 'string' ? item : item.title;
                fade('st-finanzas', el => { el.textContent = shorten(t, 100); });
            }
            applySlideImage('slide-finanzas', 'finanzas');
        } catch (e) { console.error('renderSlides (finanzas):', e); }

        // Slide Mercados: precio QQQ o noticia de mercados
        const qqq = S.market.qqq;
        try {
            if (isNum(qqq?.price)) {
                const pct = isNum(qqq.pct) ? qqq.pct : 0;
                const dir = pct >= 0 ? '▲' : '▼';
                fade('st-mercados', el => {
                    el.textContent = `NASDAQ QQQ $${fmt(qqq.price)} ${dir}${fmt(Math.abs(pct))}% · Mercados globales en sesión`;
                });
                set('sd-mkt-desc', `El índice tecnológico cotiza en $${fmt(qqq.price)} USD, con variación de ${pct >= 0 ? '+' : ''}${fmt(pct)}% en la sesión.`);
            } else if (S.news.mercados.length) {
                const item0 = S.news.mercados[0];
                const t0 = typeof item0 === 'string' ? item0 : item0.title;
                fade('st-mercados', el => { el.textContent = shorten(t0, 100); });
                const item1 = S.news.mercados[1];
                if (item1) set('sd-mkt-desc', shorten(typeof item1 === 'string' ? item1 : item1.title, 120));
            }
            applySlideImage('slide-mercados', 'mercados');
        } catch (e) { console.error('renderSlides (mercados):', e); }

        // Slide Geopolítica: siempre noticia, no datos numéricos
        try {
            if (S.news.geo.length) {
                const item0 = S.news.geo[0];
                const t0 = typeof item0 === 'string' ? item0 : item0.title;
                fade('st-geo', el => { el.textContent = shorten(t0, 100); });
                const item1 = S.news.geo[1];
                if (item1) set('sd-geo-desc', shorten(typeof item1 === 'string' ? item1 : item1.title, 120));
            }
            applySlideImage('slide-geo', 'geo');
        } catch (e) { console.error('renderSlides (geo):', e); }

        // Slide México: Fix Banxico preferido > open.er-api
        try {
            const rate = isNum(fix) ? fix : (isNum(usdmxn) ? usdmxn : null);
            if (isNum(rate)) {
                fade('st-mexico', el => {
                    el.textContent = `Dólar ${isNum(fix) ? '(Fix Banxico)' : ''} $${fmt(rate)} MXN · Tipo de cambio en tiempo real`;
                });
                let desc = `USD/MXN: $${fmt(rate)} pesos${isNum(fix) ? ' (Fix oficial Banxico)' : ''}`;
                if (isNum(infl))         desc += `. Inflación anual: ${fmt(infl)}%`;
                if (isNum(qqq?.price))   desc += `. NASDAQ QQQ: $${fmt(qqq.price)}`;
                desc += '.';
                set('sd-mex-desc', desc);
            } else if (S.news.mexico.length) {
                const item = S.news.mexico[0];
                const t = typeof item === 'string' ? item : item.title;
                fade('st-mexico', el => { el.textContent = shorten(t, 100); });
            }
            applySlideImage('slide-mexico', 'mexico');
        } catch (e) { console.error('renderSlides (mexico):', e); }
    }

    // ── Ticker ─────────────────────────────────────────────────
    function renderTicker() {
        try {
            const { usdmxn, fix, tiie, infl, corn, hogs, soybeans, wheat, crude, qqq } = S.market;
            const rate = isNum(fix) ? fix : (isNum(usdmxn) ? usdmxn : null);
            const pctCls = p => isNum(p) ? (p > 0 ? 'tk-up' : p < 0 ? 'tk-dn' : '') : '';
            const items = [];

            if (isNum(rate))         items.push({ lbl:'USD/MXN',    val:`$${fmt(rate)}`,             cls: rate > 18.5 ? 'tk-dn' : 'tk-up' });
            if (isNum(tiie))         items.push({ lbl:'TIIE 28d',   val:`${fmt(tiie)}%`,              cls:'' });
            if (isNum(infl))         items.push({ lbl:'Inflación',  val:`${fmt(infl)}%`,              cls: infl > 4.5 ? 'tk-dn' : '' });
            if (isNum(corn?.price))     items.push({ lbl:'Maíz CME',   val:`$${fmt(corn.price)}/bu`,     cls: pctCls(corn.pct) });
            if (isNum(soybeans?.price)) items.push({ lbl:'Soya',       val:`$${fmt(soybeans.price)}/bu`, cls: pctCls(soybeans.pct) });
            if (isNum(wheat?.price))    items.push({ lbl:'Trigo',      val:`$${fmt(wheat.price)}/bu`,    cls: pctCls(wheat.pct) });
            if (isNum(hogs?.price))     items.push({ lbl:'Lean Hogs',  val:`$${fmt(hogs.price)}/cwt`,    cls:'' });
            if (isNum(crude?.price))    items.push({ lbl:'WTI',        val:`$${fmt(crude.price)}/bbl`,   cls: pctCls(crude.pct) });
            if (isNum(qqq?.price))      items.push({ lbl:'NASDAQ QQQ', val:`$${fmt(qqq.price)}`,         cls: pctCls(qqq.pct) });

            const inner = $('tickerInner');
            if (!inner || !items.length) return;

            const esc = s => String(s).replace(/[<>&]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;' }[c]));
            const mkItem = ({ lbl, val, cls }) =>
                `<span class="tk-item"><span class="tk-lbl">${esc(lbl)}</span><span class="tk-val ${cls}">${esc(val)}</span></span>`;
            const sep = `<span class="tk-sep">◆</span>`;
            const row = items.map(mkItem).join(sep);
            inner.innerHTML = row + sep + row + sep;
            inner.style.animation = 'none';
            void inner.offsetWidth;
            inner.style.animation = `vn-ticker 40s linear infinite`;
        } catch (e) { console.error('renderTicker:', e); }
    }

    // ── VAI: dos vistas — "Finanzas" (México + global, igual a finanzas.html)
    //                    y "Global" (solo VIX + riesgo crediticio) ──────────
    function renderVAI(backendData) {
        try {
            // El backend (Gemini) puede devolver un JSON con forma inesperada —
            // solo se usa si "prediccion" es realmente un número válido.
            if (backendData?.vai && isNum(backendData.vai.prediccion)) {
                const { prediccion, veredicto, alerta, asset } = backendData.vai;
                S.vai.finanzas = {
                    pred: Math.max(20, Math.min(92, Math.round(prediccion))),
                    verdict: typeof veredicto === 'string' ? veredicto : '--',
                    alerta:  typeof alerta === 'string' ? alerta : '',
                    asset:   asset || 'MERCADO MX',
                };
                applyVAIView();
                return;
            }

            const { tiie, fix, usdmxn, infl, vix, creditSpread } = S.market;
            const rate = isNum(fix) ? fix : usdmxn;

            // Vista "Finanzas": misma fórmula que calcVAI() en finanzas.html
            // (TIIE 30 / FX 20 / Inflación 15 / VIX 20 / Crédito 15)
            let score = 0, maxPossible = 0;
            if (isNum(tiie)) { maxPossible += 30; score += tiie >= 11 ? 7.5 : tiie >= 9 ? 13.5 : tiie >= 7 ? 21 : tiie >= 5 ? 27 : 30; }
            if (isNum(rate)) { maxPossible += 20; score += rate > 20 ? 4   : rate > 18.5 ? 8   : rate > 17.5 ? 14 : rate > 16.5 ? 18 : 20; }
            if (isNum(infl)) { maxPossible += 15; score += infl > 6 ? 3    : infl > 5 ? 6     : infl > 4 ? 10 : infl > 3 ? 13 : 15; }
            if (isNum(vix))  { maxPossible += 20; score += vix > 30 ? 4     : vix > 25 ? 8     : vix > 20 ? 13 : vix > 15 ? 17 : 20; }
            if (isNum(creditSpread)) { maxPossible += 15; score += creditSpread < -0.15 ? 3 : creditSpread < 0 ? 8 : creditSpread < 0.15 ? 12 : 15; }

            const raw     = maxPossible > 0 ? Math.round((score / maxPossible) * 100) : 55;
            const pred    = Math.max(20, Math.min(92, raw));
            const verdict = pred >= 65 ? 'Alcista' : pred >= 45 ? 'Neutral' : 'Bajista';
            const alerta  = isNum(tiie)
                ? `TIIE ${fmt(tiie)}%${isNum(infl) ? ` · Inflación ${fmt(infl)}%` : ''}${isNum(vix) ? ` · VIX ${fmt(vix, 1)}` : ''}.`
                : 'Analizando condiciones de mercado…';
            S.vai.finanzas = { pred, verdict, alerta, asset: 'MERCADO MX' };

            // Vista "Global": solo factores internacionales (VIX 60 / Crédito 40)
            let gScore = 0, gMax = 0;
            if (isNum(vix))          { gMax += 60; gScore += vix > 30 ? 12 : vix > 25 ? 24 : vix > 20 ? 39 : vix > 15 ? 51 : 60; }
            if (isNum(creditSpread)) { gMax += 40; gScore += creditSpread < -0.15 ? 8 : creditSpread < 0 ? 21 : creditSpread < 0.15 ? 32 : 40; }
            const gRaw     = gMax > 0 ? Math.round((gScore / gMax) * 100) : 55;
            const gPred    = Math.max(20, Math.min(92, gRaw));
            const gVerdict = gPred >= 65 ? 'Alcista' : gPred >= 45 ? 'Neutral' : 'Bajista';
            const gAlerta  = isNum(vix)
                ? `VIX ${fmt(vix, 1)}${isNum(creditSpread) ? ` · Spread HYG-LQD ${creditSpread >= 0 ? '+' : ''}${fmt(creditSpread)}pp` : ''}.`
                : 'Analizando mercados globales…';
            S.vai.global = { pred: gPred, verdict: gVerdict, alerta: gAlerta, asset: 'MERCADO GLOBAL' };

            applyVAIView();
        } catch (e) { console.error('renderVAI:', e); }
    }

    function applyVAIView() {
        const data = S.vai[S.vaiView] || S.vai.finanzas;
        if (!data) return;
        applyVAI(data.pred, data.verdict, data.alerta);
        set('idx-vai-asset', data.asset || '--');
        set('vaiSelectLbl', S.vaiView === 'global' ? 'Global' : 'Finanzas');
        const icon = $('vaiSelectIcon');
        if (icon) icon.className = S.vaiView === 'global' ? 'fas fa-globe' : 'fas fa-chart-line';
    }

    function applyVAI(pred, verdict, alerta) {
        if (!isNum(pred)) {
            set('idx-vai-verdict', verdict || '--');
            set('idx-vai-warn',    alerta  || '--');
            return;
        }
        const color  = pred >= 65 ? '#4ade80' : pred >= 45 ? '#fbbf24' : '#f87171';
        const offset = (251.2 * (1 - pred / 100)).toFixed(1);
        const arc = $('idx-vai-arc');
        if (arc) { arc.style.strokeDashoffset = offset; arc.style.stroke = color; }
        const num = $('idx-vai-num');
        if (num) { num.textContent = pred + '%'; num.style.color = color; }
        set('idx-vai-verdict', verdict || '--');
        set('idx-vai-warn',    alerta  || '--');
    }

    // ── Backend Gemini ─────────────────────────────────────────
    async function loadBackend() {
        try {
            const r = await safeFetch(`${BACKEND}/api/finanzas`);
            if (!r.ok) return;
            const j = await r.json();
            if (!j.success || !j.data) return;

            S.backendOk = true;
            renderVAI(j.data);

            if (Array.isArray(j.data.noticias)) {
                j.data.noticias.forEach(n => {
                    if (!n.titulo) return;
                    // Clasificar por contenido primero; si no hay match usar categoría del JSON
                    const cats = classifyTitle(n.titulo);
                    const fallbackCat = (function () {
                        const c = (n.categoria || '').toLowerCase();
                        if (c.includes('monetaria') || c.includes('banco') || c.includes('tiie')) return 'finanzas';
                        if (c.includes('divisa') || c.includes('tipo de cambio'))                 return 'mexico';
                        if (c.includes('commodity') || c.includes('grano'))                       return 'proteinas';
                        if (c.includes('mercado') || c.includes('global'))                        return 'mercados';
                        return 'finanzas';
                    })();

                    const targets = cats.length ? cats : [fallbackCat];
                    targets.forEach(key => {
                        if (S.news[key] && !S.news[key].includes(n.titulo))
                            S.news[key].unshift(n.titulo);
                    });
                });

                // Sobreescribir slide finanzas con noticia de política monetaria si falta TIIE.
                // Estas noticias del backend son texto generado por IA, sin imagen propia —
                // hay que resetear el fondo al estático o se queda pegada la foto de
                // cualquier artículo que estuviera antes ahí (texto e imagen de temas distintos).
                const polMon = j.data.noticias.find(n => classifyTitle(n.titulo).includes('finanzas'));
                if (polMon?.titulo && !S.market.tiie) {
                    fade('st-finanzas', el => {
                        el.textContent = polMon.titulo.length > 100
                            ? polMon.titulo.slice(0, 97) + '…' : polMon.titulo;
                    });
                    _bgFor('slide-finanzas', null);
                }
            }

            const badge = $('backendBadge');
            if (badge) { badge.textContent = 'VALL AI ✓'; badge.classList.add('badge-ok'); }
        } catch { /* backend no disponible, continuar sin él */ }
    }

    // ── Traducción ─────────────────────────────────────────────
    const ES_WORDS = /\b(el|la|los|las|de|en|y|que|un|una|por|con|del|al|se|es|su|como|para|ante|desde|su|hay)\b/i;

    // Devuelve null si la traducción falló (para descartar el titular en vez de
    // mostrarlo en inglés).
    function needsTranslation(title) {
        return !!title && title.length >= 10 && !ES_WORDS.test(title);
    }

    // ── Noticias: pipeline multi-fuente → traducir → clasificar ─
    //
    // Flujo:
    //  1. Fetch paralelo de todas las fuentes activas
    //  2. Flatten: todos los artículos en una sola lista, deduplicados
    //  3. Traducir los primeros 30 únicos (MyMemory cachea, máx 1000/día)
    //  4. Clasificar CADA título por contenido con classifyTitle()
    //     → si no clasifica, usar el fallback de la fuente original
    //  5. Distribuir a los pools correctos (cross-post si aplica)
    //  6. Inyectar en slides / tarjetas
    // 1 query GDELT para noticias (cubre todos los temas) + 1 para imágenes.
    // Antes se hacían 10 queries (5 noticias + 5 imágenes) en paralelo, lo que
    // disparaba el rate-limit de GDELT (1 req/5 s por IP) y dejaba 8 de 10 sin datos.
    // classifyTitle() distribuye los artículos al pool correcto independientemente.
    const GD_NEWS_Q  = 'Mexico economy Banxico finance interest rates corn wheat oil geopolitics war conflict stock market';
    // Consulta dedicada a México: la general casi nunca trae artículos que digan
    // "México" en el titular (se diluye entre temas globales de guerra/petróleo),
    // así que ese pool se quedaba con 0 artículos siempre — nunca cambiaba nada.
    // GDELT combina los términos como AND: agregar "Banxico" o palabras en
    // español (su índice es mayormente en inglés) devolvía 0 resultados;
    // probado en vivo, "Mexico peso" sí trae artículos reales.
    const GD_MX_Q    = 'Mexico peso';
    // Proteínas: el topic "commodities" de Alpha Vantage resultó no ser confiable
    // (traía noticias de antivirus/ciberseguridad sin relación) y combos como
    // "corn wheat soybean" o "cattle market" devuelven 0 en GDELT (AND estricto).
    // "soybean" solo sí trae resultados reales — se usa sin fallback ciego, solo
    // como candidato más para que classifyTitle() decida.
    const GD_PROT_Q  = 'soybean';

    async function loadNews(force = false) {
        if (force) {
            [
                'finnhub_forex', 'finnhub_general',
                'av_news_commodities_8', 'av_news_economy_macro_6', 'av_news_financial_markets_6',
                `gdelt_${GD_NEWS_Q}_40`, `gdelt_${GD_MX_Q}_15`, `gdelt_${GD_PROT_Q}_10`,
                'news_pools_v2',
            ].forEach(k => VDS.clear(k));
        }

        // Stale-cache fallback: apply last session's news immediately so the page
        // never shows empty placeholder text on cold-start or after TTL expiry.
        if (!force) {
            const stale = VDS.load('news_pools_v2', true);
            if (stale) {
                let applied = false;
                for (const k of Object.keys(S.news)) {
                    if (Array.isArray(stale[k]) && stale[k].length > 0) {
                        S.news[k] = stale[k];
                        applied = true;
                    }
                }
                if (applied) { renderSlides(); rotateCards(); }
            }
        }

        try {
        // Finnhub en paralelo; GDELT en serie (4 requests, 0s + 5.5s + 11s + 16.5s en backend)
        const [
            r_fhForex, r_fhGeneral,
            r_avComm, r_avMacro, r_avMkt,
            r_gdAll, r_gdMx, r_gdProt,
        ] = await Promise.allSettled([
            VDS.finnhubNews('forex'),
            VDS.finnhubNews('general'),
            VDS.newsAlphaVantage('commodities',       8),
            VDS.newsAlphaVantage('economy_macro',     6),
            VDS.newsAlphaVantage('financial_markets', 6),
            VDS.gdeltNews(GD_NEWS_Q,  40),
            VDS.gdeltNews(GD_MX_Q,    15),
            VDS.gdeltNews(GD_PROT_Q,  10),
        ]);

        // Algunas fuentes (Finnhub sobre todo) devuelven el logo genérico de la
        // agencia (ej. reuters_logo.jpeg) en el campo "image" cuando el artículo
        // no tiene foto propia — eso se ve como una tarjeta rota/genérica, no
        // como una imagen real y dinámica. Se descarta explícitamente.
        const LOGO_IMG_RE = /\/logo\/|_logo\.|-logo\.|logo[-_]?\d*\.(png|jpe?g|svg)/i;
        const isRealImage = (url) => !!url && !LOGO_IMG_RE.test(url);

        const ok  = r => r.status === 'fulfilled' && Array.isArray(r.value) && r.value.length ? r.value : [];
        const extract = arr => arr.map(a => {
            const img = a.image || a.banner_image || a.socialimage || '';
            return { title: a.title || a.titulo || '', image: isRealImage(img) ? img : '' };
        }).filter(a => typeof a.title === 'string' && a.title.length > 15);

        // Artículos aplanados con fallback de fuente para cuando no clasifiquen.
        // El fallback solo se usa para fuentes cuyo "topic" declarado demostró ser
        // temáticamente confiable en la práctica. Probado en vivo: el topic
        // "commodities" de Alpha Vantage y la consulta dedicada de México SÍ
        // traen ruido (empresas de antivirus, un artículo de autos en francés)
        // que no tiene nada que ver — confiar en su fallback metía esas noticias
        // ajenas bajo Proteínas/México. Para esas dos se exige clasificación real
        // por palabras clave; sin match, se descarta en vez de forzarlo.
        const flat = [
            ...extract(ok(r_gdMx)).map(a =>     ({ title: a.title, image: a.image, fallback: null })),
            ...extract(ok(r_gdProt)).map(a =>   ({ title: a.title, image: a.image, fallback: null })),
            ...extract(ok(r_fhForex)).map(a =>  ({ title: a.title, image: a.image, fallback: 'finanzas' })),
            ...extract(ok(r_avMacro)).map(a =>  ({ title: a.title, image: a.image, fallback: 'finanzas' })),
            ...extract(ok(r_avMkt)).map(a =>    ({ title: a.title, image: a.image, fallback: 'mercados' })),
            ...extract(ok(r_avComm)).map(a =>   ({ title: a.title, image: a.image, fallback: null })),
            ...extract(ok(r_fhGeneral)).map(a => ({ title: a.title, image: a.image, fallback: null })),
            ...extract(ok(r_gdAll)).map(a =>    ({ title: a.title, image: a.image, fallback: null })),
        ];

        // Deduplicar por los primeros 55 caracteres (mismo titular, fuentes distintas)
        const seen     = new Set();
        const unique   = flat.filter(({ title }) => {
            const key = title.toLowerCase().slice(0, 55);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 40);   // máx 40 para no saturar traducción

        // Traducir en UN solo request a Gemini (vía nuestro backend, sin rate-limit
        // de terceros) en vez de una llamada por titular a MyMemory — esa API
        // gratuita se agotaba seguido (429) y dejaba la página sin contenido fresco.
        async function translateBatchViaGemini(items) {
            const toTranslate = items.filter(({ title }) => needsTranslation(title));
            if (!toTranslate.length) return items.slice();

            let translations = null;
            try {
                const prompt = 'Traduce cada titular de noticias del inglés al español (si ya está en español, déjalo igual). '
                    + 'Responde ÚNICAMENTE con este JSON, sin texto adicional: {"t": ["traducción 1", "traducción 2", ...]} '
                    + 'en el mismo orden y misma cantidad que la lista de entrada.\n\n'
                    + JSON.stringify(toTranslate.map(x => x.title));
                const result = await VDS.gemini(prompt, null);
                if (Array.isArray(result?.t) && result.t.length === toTranslate.length) translations = result.t;
            } catch { /* si falla, esos titulares se descartan más abajo */ }

            let ti = 0;
            return items.map(({ title, image, fallback }) => {
                if (!needsTranslation(title)) return { title, image, fallback };
                const t = translations ? translations[ti] : null;
                ti++;
                return { title: (typeof t === 'string' && t.trim()) ? t.trim() : null, image, fallback };
            });
        }
        const translated = await translateBatchViaGemini(unique);

        // Distribuir por clasificación de contenido. Si no clasifica por
        // palabras clave, se usa el fallback SOLO cuando viene de una fuente
        // dedicada a ese tema (ver comentario arriba); si no hay fallback
        // confiable, se descarta en vez de forzarlo a una categoría ajena.
        const pools = { finanzas:[], mercados:[], geo:[], proteinas:[], mexico:[] };

        translated.forEach(({ title, image, fallback }) => {
            if (!title) return; // traducción fallida (needsTranslation() lo dejó en null)
            const cats = classifyTitle(title);
            const targets = cats.length ? cats : (fallback ? [fallback] : []);
            if (!targets.length) return;

            targets.forEach(cat => {
                if (pools[cat] && pools[cat].length < 12)
                    pools[cat].push({ title, image });
            });
        });

        // Aplicar solo los pools que recibieron contenido
        for (const key of Object.keys(pools)) {
            if (pools[key].length > 0) S.news[key] = pools[key];
        }

        // Actualizar slides de mercados y geo con noticias frescas
        renderSlides();

        // Nota: antes aquí se inyectaban imágenes dinámicas de Finnhub/GDELT por
        // posición de índice, sin ninguna relación real con el titular mostrado en
        // cada slide/tarjeta (a veces incluso el logo de la fuente, ej.
        // reuters_logo.jpeg, como fondo). Se quitó: las imágenes estáticas por
        // categoría ya definidas en el HTML siempre son temáticamente correctas.

        // Persist news pools so future loads can use them as stale fallback.
        if (Object.values(S.news).some(p => p.length > 0)) {
            VDS.save('news_pools_v2', JSON.parse(JSON.stringify(S.news)));
        }
        rotateCards();
        } catch (e) { console.error('loadNews:', e); }
    }

    // ── Rotación de titulares en tarjetas ──────────────────────
    const CARD_MAP = [
        { id: 'ct-finanzas',    key: 'finanzas'  },
        { id: 'ct-mercados',    key: 'mercados'  },
        { id: 'ct-geopolitica', key: 'geo'       },
        { id: 'ct-proteinas',   key: 'proteinas' },
        { id: 'ct-mexico',      key: 'mexico'    },
    ];

    function rotateCards() {
        CARD_MAP.forEach(({ id, key }) => {
            const pool = S.news[key];
            if (!pool.length) return;
            fade(id, el => {
                const item = pool[S.idx[key] % pool.length];
                const t = typeof item === 'string' ? item : item.title;
                const img = typeof item === 'string' ? null : item.image;
                el.textContent = t.length > 88 ? t.slice(0, 85) + '…' : t;

                const card = $('card-' + key);
                if (card) {
                    card.style.backgroundSize = 'cover';
                    card.style.backgroundPosition = 'center';
                }
                _bgFor('card-' + key, img);

                S.idx[key]++;
            });
        });

        // Tarjeta México: el precio de mercado siempre tiene prioridad sobre la noticia
        const rate = S.market.fix ?? S.market.usdmxn;
        if (rate) set('ct-mexico', `Dólar $${rate.toFixed(2)} MXN · Tipo de cambio al día`);
    }

    // ── Refresco manual ────────────────────────────────────────
    async function forceRefresh() {
        const btn = $('refreshBtn');
        if (btn) { btn.classList.add('spinning'); btn.disabled = true; }
        try {
            await Promise.allSettled([ loadMarket(true), loadNews(true), loadGlobalRisk() ]);
            loadBackend();
        } finally {
            if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
        }
    }

    // ── Init ───────────────────────────────────────────────────
    const _timers = [];

    async function init() {
        tickClock();
        _timers.push(setInterval(tickClock, T.clock));

        // Comprobar caché de noticias ANTES de los awaits.
        // Si existe (visita anterior), podemos mostrar la página en cuanto
        // el mercado cargue sin esperar a que terminen los fetches de noticias.
        const hasStaleNews = !!VDS.load('news_pools_v2', true);

        window.VNLoader?.setText('Cargando mercados');
        await Promise.allSettled([ loadMarket(), loadGlobalRisk() ]);

        if (hasStaleNews) {
            // Ruta rápida: la caché stale ya tiene noticias — aplicarla de
            // inmediato y ocultar el loader sin esperar la red.
            // loadNews() aplicará los datos stale sincrónicamente (localStorage)
            // antes de su primer await, y luego actualizará en segundo plano.
            window.VNLoader?.setText('Actualizando noticias');
            loadNews();                // sin await — corre en segundo plano
            window.VNLoader?.hide();
        } else {
            // Ruta completa: primera visita o caché limpia — esperar datos frescos
            // (el fallback de 45 s en page-loader.js nos cubre si algo falla).
            window.VNLoader?.setText('Cargando noticias');
            await Promise.allSettled([ loadNews() ]);
            window.VNLoader?.hide();
        }

        loadBackend();

        _timers.push(setInterval(rotateCards,    T.newsRotate));
        _timers.push(setInterval(loadNews,       T.newsFetch));
        _timers.push(setInterval(loadMarket,     T.market));
        _timers.push(setInterval(loadGlobalRisk, T.globalRisk));

        const rb = $('refreshBtn');
        if (rb) rb.addEventListener('click', forceRefresh);

        const vaiSel = $('vaiSelect');
        if (vaiSel) vaiSel.addEventListener('click', () => {
            S.vaiView = S.vaiView === 'global' ? 'finanzas' : 'global';
            applyVAIView();
        });
    }

    window.addEventListener('beforeunload', () => _timers.forEach(clearInterval));

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
