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
    let filtro = 'todos';  // todos | alza | baja | datos
    let zoom = 1;
    let arrastre = null;
    let ignorarClick = false;

    const esc = texto => String(texto).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    const catalogo = () => window.VN_WORLD_EXCHANGES || {};
    const $ = id => document.getElementById(id);

    function estadoFuente(tipo, texto) {
        const nodo = $('ffwm-market-feed');
        if (!nodo) return;
        nodo.classList.remove('is-loading', 'is-live', 'is-partial');
        nodo.classList.add(`is-${tipo}`);
        const icono = tipo === 'loading' ? 'fa-circle-notch fa-spin' : tipo === 'live' ? 'fa-signal' : 'fa-triangle-exclamation';
        nodo.innerHTML = `<i class="fas ${icono}" aria-hidden="true"></i> ${esc(texto)}`;
    }

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
        aplicarFiltro(filtro);
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
        nodo.innerHTML = `<i class="fas fa-circle-info" aria-hidden="true"></i> ${paises} países · ${bolsas} bolsas · ${conDato} con datos conectados`;
    }

    function aplicarFiltro(nuevoFiltro) {
        filtro = nuevoFiltro || 'todos';
        document.querySelectorAll('[data-ffwm-filter]').forEach(boton => {
            const seleccionado = boton.dataset.ffwmFilter === filtro;
            boton.classList.toggle('is-active', seleccionado);
            boton.setAttribute('aria-pressed', String(seleccionado));
        });

        document.querySelectorAll('#ffwm-map [data-pais]').forEach(nodo => {
            const tieneDato = nodo.classList.contains('is-alza') || nodo.classList.contains('is-baja') || nodo.classList.contains('is-plano');
            const visible = filtro === 'todos'
                || (filtro === 'alza' && nodo.classList.contains('is-alza'))
                || (filtro === 'baja' && nodo.classList.contains('is-baja'))
                || (filtro === 'datos' && tieneDato);
            nodo.classList.toggle('is-filtrado', !visible);
        });

        const filtroEstado = $('ffwm-filter-status');
        if (filtroEstado) {
            const cat = Object.values(catalogo());
            const visibles = cat.filter(pais => {
                const t = tono(pais);
                return filtro === 'todos'
                    || (filtro === 'alza' && t?.clase === 'is-alza')
                    || (filtro === 'baja' && t?.clase === 'is-baja')
                    || (filtro === 'datos' && !!t);
            }).length;
            const etiquetas = { todos:'Vista global', alza:'Mercados al alza', baja:'Mercados a la baja', datos:'Con datos' };
            filtroEstado.textContent = `${etiquetas[filtro] || 'Vista global'} · ${visibles} de ${cat.length} mercados`;
        }

        if (activo && nodoDe(activo)?.classList.contains('is-filtrado')) {
            fijado = null;
            ocultarTip();
        }
    }

    function ajustarZoom(accion) {
        const stage = $('ffwm-stage');
        const lienzo = document.querySelector('#ffwm-map .ffwm-lienzo');
        if (!stage || !lienzo) return;
        const anterior = zoom;
        if (accion === 'in') zoom = Math.min(1.8, +(zoom + .2).toFixed(1));
        else if (accion === 'out') zoom = Math.max(1, +(zoom - .2).toFixed(1));
        else zoom = 1;
        lienzo.style.setProperty('--ffwm-zoom', zoom);
        stage.dataset.zoom = String(zoom);
        const indicador = $('ffwm-zoom-value');
        if (indicador) indicador.textContent = `${Math.round(zoom * 100)}%`;
        stage.classList.add('has-interacted');

        if (accion === 'reset') {
            stage.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
        } else if (zoom !== anterior) {
            const proporcion = zoom / anterior;
            stage.scrollTo({
                left: (stage.scrollLeft + stage.clientWidth / 2) * proporcion - stage.clientWidth / 2,
                top: (stage.scrollTop + stage.clientHeight / 2) * proporcion - stage.clientHeight / 2,
                behavior: 'smooth',
            });
        }
        document.querySelector('[data-ffwm-zoom="out"]')?.toggleAttribute('disabled', zoom <= 1);
        document.querySelector('[data-ffwm-zoom="in"]')?.toggleAttribute('disabled', zoom >= 1.8);
        if (activo) colocar($('ffwm-tip'), nodoDe(activo));
    }

    function centrarEn(objetivo) {
        const stage = $('ffwm-stage');
        if (!stage || !objetivo) return;
        const caja = stage.getBoundingClientRect();
        const punto = objetivo.getBoundingClientRect();
        stage.scrollBy({
            left: punto.left + punto.width / 2 - (caja.left + caja.width / 2),
            top: punto.top + punto.height / 2 - (caja.top + caja.height / 2),
            behavior: 'smooth',
        });
        stage.classList.add('has-interacted');
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
                <button type="button" class="ffwm-tip-close" aria-label="Cerrar ficha"><i class="fas fa-xmark" aria-hidden="true"></i></button>
            </header>
            <div class="ffwm-bolsas">${pais.bolsas.map(b => fichaBolsa(b, pais.tz)).join('')}</div>
            ${cuantas > 1 ? `<span class="ffwm-tip-more"><i class="fas fa-layer-group" aria-hidden="true"></i> ${cuantas - 1} ${cuantas - 1 === 1 ? 'bolsa adicional' : 'bolsas adicionales'}</span>` : ''}`;
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
        if (window.matchMedia('(max-width: 620px)').matches) {
            tip.style.left = '';
            tip.style.top = '';
            return;
        }
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
        estadoFuente('loading', 'Conectando mercados');
        try {
            const respuesta = await fetch('/api/world-indices');
            if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
            const json = await respuesta.json();
            if (!json?.data) throw new Error('respuesta sin datos');
            indices = json.data;
            pintarTonos();
            const hora = json.asOf ? new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(new Date(json.asOf)) : null;
            const disponibles = Number(json.total) || Object.keys(json.data).length;
            estadoFuente(json.fallidos ? 'partial' : 'live', `${disponibles} índices${hora ? ` · ${hora} h` : ''}`);
        } catch (error) {
            /* Sin índices el mapa sigue sirviendo: los países quedan grises y las
               fichas dicen que no hay cotización. */
            console.warn('[mapa mundial] no se pudieron cargar los índices:', error.message);
            const respaldo = Object.values(catalogo()).flatMap(p => p.bolsas).filter(b => cotizacion(b.simbolo)).length;
            estadoFuente('partial', respaldo ? `${respaldo} índices de respaldo` : 'Mercados no disponibles');
            pintarTonos();
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
        ajustarZoom('reset');
        cargarIndices();

        document.querySelectorAll('[data-ffwm-filter]').forEach(boton => {
            boton.addEventListener('click', () => aplicarFiltro(boton.dataset.ffwmFilter));
        });
        host.querySelectorAll('[data-ffwm-zoom]').forEach(boton => {
            boton.addEventListener('click', evento => {
                evento.stopPropagation();
                ajustarZoom(boton.dataset.ffwmZoom);
                boton.classList.remove('is-activated');
                void boton.offsetWidth;
                boton.classList.add('is-activated');
                window.setTimeout(() => boton.classList.remove('is-activated'), 420);
            });
        });

        const stage = $('ffwm-stage');
        if (stage) {
            stage.addEventListener('pointerdown', evento => {
                if (evento.pointerType !== 'mouse' || evento.button !== 0 || evento.target.closest('.ffwm-tip, .ffwm-map-tools')) return;
                arrastre = {
                    id: evento.pointerId,
                    x: evento.clientX,
                    y: evento.clientY,
                    left: stage.scrollLeft,
                    top: stage.scrollTop,
                    movio: false,
                };
                stage.setPointerCapture?.(evento.pointerId);
            });
            stage.addEventListener('pointermove', evento => {
                if (!arrastre || arrastre.id !== evento.pointerId) return;
                const dx = evento.clientX - arrastre.x;
                const dy = evento.clientY - arrastre.y;
                if (!arrastre.movio && Math.hypot(dx, dy) < 5) return;
                arrastre.movio = true;
                ignorarClick = true;
                stage.classList.add('is-dragging', 'has-interacted');
                if (!fijado) ocultarTip();
                stage.scrollLeft = arrastre.left - dx;
                stage.scrollTop = arrastre.top - dy;
                evento.preventDefault();
            });
            const terminarArrastre = evento => {
                if (!arrastre || (evento.pointerId !== undefined && arrastre.id !== evento.pointerId)) return;
                stage.releasePointerCapture?.(arrastre.id);
                stage.classList.remove('is-dragging');
                arrastre = null;
                window.setTimeout(() => { ignorarClick = false; }, 0);
            };
            stage.addEventListener('pointerup', terminarArrastre);
            stage.addEventListener('pointercancel', terminarArrastre);
            stage.addEventListener('wheel', evento => {
                if (!evento.ctrlKey && !evento.metaKey) return;
                evento.preventDefault();
                ajustarZoom(evento.deltaY < 0 ? 'in' : 'out');
            }, { passive: false });
            stage.addEventListener('dblclick', evento => {
                if (evento.target.closest('[data-pais]')) return;
                evento.preventDefault();
                ajustarZoom('in');
            });
            stage.addEventListener('keydown', evento => {
                if (evento.key === '+' || evento.key === '=') { evento.preventDefault(); ajustarZoom('in'); }
                if (evento.key === '-' || evento.key === '_') { evento.preventDefault(); ajustarZoom('out'); }
                if (evento.key === '0') { evento.preventDefault(); ajustarZoom('reset'); }
            });
        }

        /* Un solo listener delegado: son ~230 nodos y no tiene sentido registrar
           un manejador por país. */
        host.addEventListener('mouseover', evento => {
            if (fijado || arrastre?.movio) return;    // hay uno fijado o se está arrastrando
            if (evento.target.closest('.ffwm-tip, .ffwm-map-tools')) return;
            const objetivo = evento.target.closest('[data-pais]');
            if (objetivo) mostrarTip(objetivo.dataset.pais, objetivo);
            else ocultarTip();                        // se pasó al océano
        });
        host.addEventListener('mouseleave', () => { if (!fijado) ocultarTip(); });

        /* El clic fija. Sin esto el mapa sería inservible en pantallas táctiles,
           donde no existe "pasar el cursor". Volver a tocar el mismo país lo
           suelta. */
        host.addEventListener('click', evento => {
            if (ignorarClick) {
                evento.preventDefault();
                return;
            }
            if (evento.target.closest('.ffwm-tip-close')) {
                fijado = null;
                ocultarTip();
                return;
            }
            if (evento.target.closest('.ffwm-tip, .ffwm-map-tools')) return;
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
            aplicarFiltro('todos');
            fijado = select.value;
            const objetivo = nodoDe(select.value);
            centrarEn(objetivo);
            mostrarTip(select.value, objetivo);
        });

        /* Al cambiar el tamaño, el flotante quedaría descolocado: se recoloca
           sobre su mismo país. */
        alRedimensionar = () => { if (activo) colocar($('ffwm-tip'), nodoDe(activo)); };
        window.addEventListener('resize', alRedimensionar);
        window.addEventListener('vn:cotizaciones', pintarTonos);
    }

    /* Los listeners del propio mapa mueren con su nodo, pero estos dos viven en
       `window` y sobrevivirían al cambio de página en la SPA de React. `init()`
       no se repite gracias a la marca data-listo del host; al desmontar, ese
       nodo desaparece, así que la próxima visita vuelve a construir el mapa
       desde cero y aquí solo hay que soltar lo global. */
    let alRedimensionar = null;

    function destruir() {
        if (alRedimensionar) window.removeEventListener('resize', alRedimensionar);
        window.removeEventListener('vn:cotizaciones', pintarTonos);
        alRedimensionar = null;
    }

    window.VNMapaMundial = { init, destruir, mostrar: mostrarTip };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
