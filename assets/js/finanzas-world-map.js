/*
 * Mapa mundial de bolsas — apartado Bolsa de Finanzas.
 *
 * Une tres piezas que se mantienen por separado a propósito:
 *   world-map-data.js   geometría generada (no se edita a mano)
 *   world-exchanges.js  catálogo editorial de bolsas por país
 *   este archivo        el componente: dibuja, colorea y muestra el flotante
 *
 * Interacción: el flotante aparece al PASAR el cursor, no al hacer clic. El
 * panel lateral que había antes se retiró para que el mapa ocupe todo el ancho.
 * El clic sigue existiendo, pero ahora FIJA el flotante: es lo que hace usable
 * el mapa en pantallas táctiles, donde no hay "pasar el cursor".
 *
 * Las cotizaciones salen de dos fuentes; ver cotizacion(). Si una bolsa no tiene
 * índice conectado, su ficha se muestra sin números: NO se inventan precios.
 *
 * Vive fuera del IIFE de finanzas-favro.js y no comparte estado con él.
 */
(function () {
    'use strict';

    let indices = null;    // { ticker: {price, change} } de /api/world-indices
    let fijado = null;     // país fijado con clic; null si solo se está pasando por encima
    let activo = null;     // país mostrado ahora mismo en el flotante

    const esc = texto => String(texto).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    const catalogo = () => window.VN_WORLD_EXCHANGES || {};
    const $ = id => document.getElementById(id);

    /* Hora local de la bolsa. Se calcula con Intl a partir del identificador
       IANA, así que sale correcta sin registrar horarios ni husos a mano. */
    function horaLocal(tz) {
        try {
            return new Intl.DateTimeFormat('es-MX', {
                timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
            }).format(new Date());
        } catch {
            return null;   // huso desconocido para este navegador
        }
    }

    /* Windows no dibuja banderas de país: Segoe UI Emoji no incluye los pares de
       indicadores regionales, así que el navegador cae a las dos letras sueltas y
       parece un error. Se derivan esas letras del propio emoji ('A' está en
       U+1F1E6) y se pintan como distintivo ISO, igual en todas las plataformas. */
    function codigoIso(bandera) {
        const puntos = [...String(bandera || '')].map(c => c.codePointAt(0));
        if (puntos.length !== 2 || puntos.some(p => p < 0x1F1E6 || p > 0x1F1FF)) return '';
        return puntos.map(p => String.fromCharCode(p - 0x1F1E6 + 65)).join('');
    }

    /* Dos fuentes para el mismo dato. Se prefiere /api/world-indices.

       Podría parecer al revés —favro refresca en vivo y el endpoint se cachea 10
       minutos—, pero el `change` de favro NO es la variación de la sesión: su
       fetchSeries() pide range=5d con interval=15m, así que fetchQuote() compara
       las dos últimas velas de QUINCE MINUTOS. El 7 de agosto de 2026 eso daba
       -0.0003% para el S&P 500 en un día de +0.35%, y el mapa pintaba Estados
       Unidos de gris "sin cambio". El endpoint usa velas diarias y coincide con
       el regularMarketChangePercent que publica Yahoo.

       favro se usa solo de respaldo, para que un país no se quede sin dato si el
       endpoint falla. */
    function cotizacion(simbolo) {
        if (!simbolo) return null;
        const mundial = indices?.[simbolo];
        if (mundial && Number.isFinite(mundial.price)) return mundial;
        if (typeof window.VNBolsaCotizacion === 'function') {
            const q = window.VNBolsaCotizacion(simbolo);
            if (q && Number.isFinite(q.price)) return q;
        }
        return null;
    }

    const numero = v => Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    /* Dirección del mercado de un país: verde si su índice sube, rojo si baja.
       Se toma la PRIMERA bolsa con cotización, que en el catálogo es siempre la
       principal (NYSE antes que Nasdaq, SSE antes que SZSE). Promediar índices de
       bolsas distintas no significaría nada.

       Devuelve null si el país no tiene ningún índice conectado: entonces se
       queda gris. Un país sin dato NO es un país plano. */
    function tono(pais) {
        for (const bolsa of pais.bolsas) {
            const q = cotizacion(bolsa.simbolo);
            if (!q || !Number.isFinite(q.change)) continue;
            const pct = +q.change.toFixed(2);
            return { clase: pct > 0 ? 'is-alza' : pct < 0 ? 'is-baja' : 'is-plano', pct, bolsa };
        }
        return null;
    }

    function etiquetaPais(pais, t) {
        const cuantas = pais.bolsas.length;
        const base = `${pais.pais}: ${cuantas} ${cuantas === 1 ? 'bolsa' : 'bolsas'}`;
        if (!t) return base;
        return `${base} · ${t.bolsa.indice} ${t.pct > 0 ? '+' : ''}${t.pct.toFixed(2)}%`;
    }

    /* ── Mapa ────────────────────────────────────────────────────────────── */

    function construirMapa(host) {
        const mapa = window.VN_WORLD_MAP;
        const cat = catalogo();

        /* Los países sin bolsa son decorado: no reciben eventos, y se marcan
           aria-hidden para que un lector de pantalla no lea 126 nombres que no
           llevan a ninguna parte. */
        const trazos = mapa.paises.map(pais => {
            const entrada = cat[pais.ne];
            if (!entrada) return `<path class="ffwm-pais" d="${pais.d}" aria-hidden="true"></path>`;
            const t = tono(entrada);
            return `<path class="ffwm-pais is-mercado${t ? ' ' + t.clase : ''}" d="${pais.d}" data-pais="${esc(pais.ne)}"></path>`;
        }).join('');

        /* El marcador es el blanco real: hay bolsas en países demasiado pequeños
           para acertarles el polígono, y dos que ni siquiera lo tienen. */
        const marcas = Object.entries(mapa.centros).map(([ne, punto]) => {
            const pais = cat[ne];
            if (!pais) return '';
            const t = tono(pais);
            const etiqueta = etiquetaPais(pais, t);
            return `<g class="ffwm-marca${t ? ' ' + t.clase : ''}" data-pais="${esc(ne)}" tabindex="0" role="button" aria-label="${esc(etiqueta)}">
                <circle class="ffwm-marca-halo" cx="${punto.x}" cy="${punto.y}" r="9"></circle>
                <circle class="ffwm-marca-punto" cx="${punto.x}" cy="${punto.y}" r="3.4"></circle>
            </g>`;
        }).join('');

        host.querySelector('.ffwm-lienzo').innerHTML = `<svg class="ffwm-svg" viewBox="0 0 ${mapa.ancho} ${mapa.alto}"
             role="group" aria-label="Mapa mundial de bolsas de valores" preserveAspectRatio="xMidYMid meet">
            <g class="ffwm-paises">${trazos}</g>
            <g class="ffwm-marcas">${marcas}</g>
        </svg>`;
    }

    /* Repinta el color. Se llama aparte de construirMapa porque las cotizaciones
       llegan después de dibujar el mapa, y vuelven a llegar en cada refresco. */
    function pintarTonos() {
        const cat = catalogo();
        document.querySelectorAll('#ffwm-map [data-pais]').forEach(nodo => {
            const pais = cat[nodo.dataset.pais];
            if (!pais) return;
            const t = tono(pais);
            nodo.classList.remove('is-alza', 'is-baja', 'is-plano');
            if (t) nodo.classList.add(t.clase);
            if (nodo.classList.contains('ffwm-marca')) {
                nodo.setAttribute('aria-label', etiquetaPais(pais, t));
            }
        });
        pintarResumen();
        if (activo) mostrarTip(activo, nodoDe(activo), true);   // refrescar cifras a la vista
    }

    function pintarResumen() {
        const nodo = $('ffwm-stats');
        if (!nodo) return;
        const cat = catalogo();
        const paises = Object.keys(cat).length;
        const bolsas = Object.values(cat).reduce((n, p) => n + p.bolsas.length, 0);
        const conDato = Object.values(cat).flatMap(p => p.bolsas).filter(b => cotizacion(b.simbolo)).length;
        nodo.textContent = `${paises} países · ${bolsas} bolsas · ${conDato} con cotización`;
    }

    /* ── Flotante ────────────────────────────────────────────────────────── */

    function fichaBolsa(bolsa, tz) {
        const q = cotizacion(bolsa.simbolo);
        const hora = horaLocal(tz);

        /* La flecha se decide sobre el valor YA redondeado. Con el crudo, una
           variación de -0.0001 se pintaba como "▼ 0.00%". */
        const pct = q && Number.isFinite(q.change) ? +q.change.toFixed(2) : null;
        const signo = pct === null ? '' : pct > 0 ? '▲ +' : pct < 0 ? '▼ ' : '● ';
        const clase = pct === null ? '' : pct > 0 ? 'is-up' : pct < 0 ? 'is-down' : 'is-flat';

        const dato = q
            ? `<div class="ffwm-cotiza"><strong>${numero(q.price)}</strong>${
                pct === null ? '' : `<span class="${clase}">${signo}${Math.abs(pct).toFixed(2)}%</span>`}</div>`
            : `<div class="ffwm-cotiza is-vacio"><span>Sin cotización conectada</span></div>`;

        return `<article class="ffwm-bolsa${q ? ' tiene-dato' : ''}">
            <header>
                <span class="ffwm-sigla">${esc(bolsa.sigla)}</span>
                <div>
                    <h4>${esc(bolsa.nombre)}</h4>
                    <p>${esc(bolsa.ciudad)}${bolsa.mic ? ` · <span class="ffwm-mic">${esc(bolsa.mic)}</span>` : ''}${hora ? ` · ${hora} h` : ''}</p>
                </div>
            </header>
            <div class="ffwm-bolsa-pie">
                <span class="ffwm-indice"><em>Índice</em> ${esc(bolsa.indice)}</span>
                ${dato}
            </div>
        </article>`;
    }

    const nodoDe = ne => document.querySelector(`#ffwm-map .ffwm-marca[data-pais="${CSS.escape(ne)}"]`)
        || document.querySelector(`#ffwm-map .ffwm-pais[data-pais="${CSS.escape(ne)}"]`);

    function mostrarTip(ne, objetivo, soloContenido) {
        const pais = catalogo()[ne];
        const tip = $('ffwm-tip');
        if (!pais || !tip) return;

        const cuantas = pais.bolsas.length;
        tip.innerHTML = `<header class="ffwm-tip-head">
                <span class="ffwm-bandera" aria-hidden="true">${esc(codigoIso(pais.bandera))}</span>
                <div>
                    <h3>${esc(pais.pais)}</h3>
                    <p>${cuantas} ${cuantas === 1 ? 'bolsa de valores' : 'bolsas de valores'}</p>
                </div>
            </header>
            <div class="ffwm-bolsas">${pais.bolsas.map(b => fichaBolsa(b, pais.tz)).join('')}</div>`;
        tip.hidden = false;
        activo = ne;

        document.querySelectorAll('#ffwm-map [data-pais]').forEach(nodo => {
            nodo.classList.toggle('is-activo', nodo.dataset.pais === ne);
        });

        if (!soloContenido || !tip.style.left) colocar(tip, objetivo);
    }

    /* Se posiciona dentro de .ffwm-map (que es position:relative) en lugar de
       usar position:fixed: así no depende de si algún ancestro tiene transform,
       que convertiría el fixed en absolute y descolocaría el flotante. */
    function colocar(tip, objetivo) {
        const host = $('ffwm-map');
        if (!host || !objetivo) return;
        const caja = host.getBoundingClientRect();
        const r = objetivo.getBoundingClientRect();
        const ancho = tip.offsetWidth;
        const alto = tip.offsetHeight;
        const MARGEN = 10;

        let x = (r.left - caja.left) + r.width / 2 - ancho / 2;
        let y = (r.top - caja.top) - alto - MARGEN;

        // Si no cabe arriba, se pone debajo del marcador.
        if (y < MARGEN) y = (r.bottom - caja.top) + MARGEN;
        // Y siempre dentro del mapa, para que no se salga por los lados.
        x = Math.max(MARGEN, Math.min(x, caja.width - ancho - MARGEN));
        y = Math.max(MARGEN, Math.min(y, caja.height - alto - MARGEN));

        tip.style.left = `${Math.round(x)}px`;
        tip.style.top = `${Math.round(y)}px`;
    }

    function ocultarTip() {
        const tip = $('ffwm-tip');
        if (!tip) return;
        tip.hidden = true;
        tip.style.left = '';
        activo = null;
        document.querySelectorAll('#ffwm-map .is-activo').forEach(n => n.classList.remove('is-activo'));
    }

    /* ── Datos ───────────────────────────────────────────────────────────── */

    async function cargarIndices() {
        try {
            const respuesta = await fetch('/api/world-indices');
            if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
            const json = await respuesta.json();
            if (!json?.data) throw new Error('respuesta sin datos');
            indices = json.data;
            pintarTonos();
        } catch (error) {
            /* Sin índices el mapa sigue sirviendo: los países quedan grises y las
               fichas dicen que no hay cotización. */
            console.warn('[mapa mundial] no se pudieron cargar los índices:', error.message);
        }
    }

    function construirSelect() {
        const select = $('ffwm-select');
        if (!select) return;
        const cat = catalogo();
        const opciones = Object.keys(cat)
            .map(ne => ({ ne, nombre: cat[ne].pais }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        select.innerHTML = '<option value="">Elegir país…</option>' +
            opciones.map(o => `<option value="${esc(o.ne)}">${esc(o.nombre)}</option>`).join('');
    }

    /* ── Arranque ────────────────────────────────────────────────────────── */

    function init() {
        const host = $('ffwm-map');
        if (!host || host.dataset.listo === '1') return;
        if (!window.VN_WORLD_MAP || !window.VN_WORLD_EXCHANGES) {
            console.error('[mapa mundial] faltan world-map-data.js o world-exchanges.js');
            return;
        }

        construirMapa(host);
        construirSelect();
        pintarResumen();
        host.dataset.listo = '1';
        cargarIndices();

        /* Un solo listener delegado: son ~230 nodos y no tiene sentido registrar
           un manejador por país. */
        host.addEventListener('mouseover', evento => {
            if (fijado) return;                       // hay uno fijado con clic
            const objetivo = evento.target.closest('[data-pais]');
            if (objetivo) mostrarTip(objetivo.dataset.pais, objetivo);
            else ocultarTip();                        // se pasó al océano
        });
        host.addEventListener('mouseleave', () => { if (!fijado) ocultarTip(); });

        /* El clic fija. Sin esto el mapa sería inservible en pantallas táctiles,
           donde no existe "pasar el cursor". Volver a tocar el mismo país lo
           suelta. */
        host.addEventListener('click', evento => {
            const objetivo = evento.target.closest('[data-pais]');
            if (!objetivo) { fijado = null; ocultarTip(); return; }
            const ne = objetivo.dataset.pais;
            if (fijado === ne) { fijado = null; ocultarTip(); return; }
            fijado = ne;
            mostrarTip(ne, objetivo);
        });

        // Teclado: el foco sobre un marcador equivale a pasar el cursor.
        host.addEventListener('focusin', evento => {
            const objetivo = evento.target.closest('[data-pais]');
            if (objetivo) mostrarTip(objetivo.dataset.pais, objetivo);
        });
        host.addEventListener('focusout', () => { if (!fijado) ocultarTip(); });
        host.addEventListener('keydown', evento => {
            if (evento.key === 'Escape') { fijado = null; ocultarTip(); }
        });

        const select = $('ffwm-select');
        if (select) select.addEventListener('change', () => {
            if (!select.value) { fijado = null; ocultarTip(); return; }
            fijado = select.value;
            mostrarTip(select.value, nodoDe(select.value));
        });

        /* Al cambiar el tamaño, el flotante quedaría descolocado: se recoloca
           sobre su mismo país. */
        window.addEventListener('resize', () => {
            if (activo) colocar($('ffwm-tip'), nodoDe(activo));
        });

        window.addEventListener('vn:cotizaciones', pintarTonos);
    }

    window.VNMapaMundial = { init, mostrar: mostrarTip };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
