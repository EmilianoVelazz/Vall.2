/*
 * Mapa mundial de bonos soberanos.
 *
 * Reutiliza la geometría estática de VN_WORLD_MAP, pero mantiene su propio
 * estado y render: el mapa de Bolsa no cambia ni comparte selección, filtros o
 * fichas con este módulo. Los datos llegan desde loadBonds() mediante el evento
 * `vn:bond-data`; nunca se calculan ni se inventan rendimientos aquí.
 */
(function () {
    'use strict';

    const KEY_TO_NE = {
        us: 'United States of America', mx: 'Mexico', jp: 'Japan', gb: 'United Kingdom',
        cn: 'China', br: 'Brazil', ca: 'Canada', de: 'Germany', fr: 'France',
        it: 'Italy', es: 'Spain', au: 'Australia', kr: 'South Korea', in: 'India',
        za: 'South Africa', cl: 'Chile', id: 'Indonesia', ch: 'Switzerland',
        nz: 'New Zealand', pl: 'Poland',
    };
    const FIXED_MATURITY = '10Y';
    const FIXED_MATURITY_LABEL = '10 años';
    const MOVE_COLORS = { up: '#59D2AA', down: '#FF7F91', flat: '#4C5F70' };
    const REGIONS = {
        us:'americas', mx:'americas', ca:'americas', br:'americas', cl:'americas',
        gb:'europe', de:'europe', fr:'europe', it:'europe', es:'europe', ch:'europe', pl:'europe',
        jp:'asia', cn:'asia', au:'asia', kr:'asia', in:'asia', id:'asia', nz:'asia',
        za:'africa',
    };
    const EMERGING = new Set(['mx', 'br', 'cn', 'in', 'za', 'cl', 'id', 'pl']);
    const FILTER_LABELS = { all:'Vista global', americas:'Américas', europe:'Europa', asia:'Asia–Pacífico', emerging:'Mercados emergentes' };
    const EXCLUDED_RATES = /TIIE|Tasa objetivo|Tasa base|LPR|SELIC/i;
    const state = { data: [], selected: '', pinned: '', fallback: false, filter: 'all', zoom: 1 };
    const cleanups = [];
    let mounted = false;
    let drag = null;
    let ignoreClick = false;

    const $ = id => document.getElementById(id);
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    }[char]));
    const number = value => Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    function pointsForMaturity() {
        return state.data.map(entry => {
            const ne = KEY_TO_NE[entry.key];
            if (!ne) return null; // Zona Euro es un agregado, no un país.
            const bond = (entry.bonds || []).find(item => item.maturity === FIXED_MATURITY && !EXCLUDED_RATES.test(item.label || ''));
            if (!bond || !Number.isFinite(Number(bond.yield))) return null;
            return {
                key: entry.key,
                ne,
                country: entry.country,
                flag: entry.flag || '',
                source: entry.source || '',
                bond,
                yield: Number(bond.yield),
                prev: Number.isFinite(Number(bond.prev)) ? Number(bond.prev) : null,
                indicative: state.fallback || !!bond.indicative,
                region: REGIONS[entry.key] || 'other',
            };
        }).filter(Boolean);
    }

    function visiblePoints(points) {
        if (state.filter === 'all') return points;
        if (state.filter === 'emerging') return points.filter(point => EMERGING.has(point.key));
        return points.filter(point => point.region === state.filter);
    }

    function movementFor(point) {
        if (!Number.isFinite(point.prev)) return 'flat';
        const change = point.yield - point.prev;
        return change > .005 ? 'up' : change < -.005 ? 'down' : 'flat';
    }

    function colorFor(point) {
        return MOVE_COLORS[movementFor(point)];
    }

    function centerFor(map, point) {
        return map.centros?.[point.ne] || map.suplementos?.[point.ne]?.centro || null;
    }

    function geometryFor(map, ne) {
        const regular = map.paises.find(country => country.ne === ne);
        return regular?.d || map.suplementos?.[ne]?.d || '';
    }

    function updatePicker(points) {
        const picker = $('fbm-country');
        if (!picker) return;
        const signature = points.map(point => point.key).sort().join(',');
        if (picker.dataset.signature !== signature) {
            picker.dataset.signature = signature;
            picker.innerHTML = '<option value="">Elegir país…</option>' + [...points]
                .sort((a, b) => a.country.localeCompare(b.country, 'es'))
                .map(point => `<option value="${esc(point.key)}">${esc(point.country)} · ${number(point.yield)}%</option>`)
                .join('');
        }
        picker.value = state.selected || '';
    }

    function updateMapStatus(points, filteredPoints) {
        const status = $('fbm-status');
        if (status) {
            const live = points.filter(point => !point.indicative).length;
            const refs = points.length - live;
            status.className = 'fbm-status is-ready';
            status.innerHTML = `<i class="fas fa-signal" aria-hidden="true"></i> ${points.length} ${points.length === 1 ? 'mercado' : 'mercados'} · ${live} conectado${live === 1 ? '' : 's'} · ${refs} referencia`;
        }
        document.querySelectorAll('[data-fbm-filter]').forEach(button => {
            const active = button.dataset.fbmFilter === state.filter;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        const filterStatus = $('fbm-filter-status');
        if (filterStatus) filterStatus.textContent = `${FILTER_LABELS[state.filter]} · ${filteredPoints.length} de ${points.length} mercados`;
    }

    function updateLegend(points) {
        const ups = points.filter(point => movementFor(point) === 'up').length;
        const downs = points.filter(point => movementFor(point) === 'down').length;
        if ($('fbm-legend-min')) $('fbm-legend-min').textContent = `${downs} bajas`;
        if ($('fbm-legend-max')) $('fbm-legend-max').textContent = `${ups} alzas`;
        const marker = $('fbm-legend-marker');
        if (marker) {
            marker.style.left = '50%';
            marker.title = `${downs} bajas y ${ups} alzas`;
        }
    }

    function renderDetail(point, points) {
        const host = $('fbm-detail');
        if (!host) return;
        if (!point) {
            host.innerHTML = '<div class="fbm-detail-placeholder"><i class="fas fa-location-crosshairs" aria-hidden="true"></i><strong>Selecciona un país</strong><span>Verás el rendimiento, su cambio y la fuente disponible.</span></div>';
            return;
        }
        const change = point.prev == null ? null : (point.yield - point.prev) * 100;
        const sorted = [...points].sort((a, b) => b.yield - a.yield);
        const rank = sorted.findIndex(item => item.key === point.key) + 1;
        const changeClass = change == null ? 'is-flat' : change > .5 ? 'is-up' : change < -.5 ? 'is-down' : 'is-flat';
        const changeText = change == null ? 'Sin cierre comparable' : `${change > 0 ? '+' : ''}${change.toFixed(0)} pb frente al cierre previo`;
        const statusText = point.indicative ? 'Referencia indicativa' : 'Dato conectado';
        const statusIcon = point.indicative ? 'fa-bookmark' : 'fa-signal';
        const source = point.indicative
            ? (point.bond.source || 'Referencia soberana indicativa')
            : point.source;
        host.innerHTML = `
            <div class="fbm-detail-top">
                <span class="fbm-detail-flag" aria-hidden="true">${esc(point.flag)}</span>
                <div><small>${FIXED_MATURITY_LABEL} · posición ${rank} de ${points.length}</small><h4>${esc(point.country)}</h4></div>
                <span class="fbm-data-badge ${point.indicative ? 'is-ref' : 'is-live'}"><i class="fas ${statusIcon}" aria-hidden="true"></i>${statusText}</span>
            </div>
            <div class="fbm-yield-card">
                <span>Rendimiento soberano</span>
                <strong>${number(point.yield)}%</strong>
                <em class="${changeClass}">${esc(changeText)}</em>
            </div>
            <dl class="fbm-facts">
                <div><dt>Instrumento</dt><dd>${esc(point.bond.label)}</dd></div>
                <div><dt>Vencimiento</dt><dd>${esc(point.bond.maturity || FIXED_MATURITY)}</dd></div>
                <div><dt>Cierre previo</dt><dd>${point.prev == null ? '—' : number(point.prev) + '%'}</dd></div>
                <div><dt>Tipo de lectura</dt><dd>${statusText}</dd></div>
            </dl>
            <div class="fbm-source"><span><i class="fas fa-database" aria-hidden="true"></i> Fuente declarada</span><strong>${esc(source || 'No especificada')}</strong></div>
            <button type="button" class="fbm-open-detail"><span>Ver todos los instrumentos</span><i class="fas fa-arrow-right" aria-hidden="true"></i></button>`;
        host.querySelector('.fbm-open-detail')?.addEventListener('click', () => {
            if (typeof window.setCountryFactsheet === 'function') window.setCountryFactsheet(point.key);
            $('country-factsheet')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, { once: true });
    }

    function setZoom(action) {
        const stage = $('fbm-map-stage');
        const canvas = $('fbm-map-canvas');
        if (!stage || !canvas) return;
        const previous = state.zoom;
        if (action === 'in') state.zoom = Math.min(2, +(state.zoom + .2).toFixed(1));
        else if (action === 'out') state.zoom = Math.max(1, +(state.zoom - .2).toFixed(1));
        else state.zoom = 1;
        canvas.style.setProperty('--fbm-zoom', state.zoom);
        stage.dataset.zoom = String(state.zoom);
        stage.classList.add('has-interacted');
        const output = $('fbm-zoom-value');
        if (output) output.textContent = `${Math.round(state.zoom * 100)}%`;
        document.querySelector('[data-fbm-zoom="out"]')?.toggleAttribute('disabled', state.zoom <= 1);
        document.querySelector('[data-fbm-zoom="in"]')?.toggleAttribute('disabled', state.zoom >= 2);
        if (action === 'reset') {
            stage.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
        } else if (state.zoom !== previous) {
            const ratio = state.zoom / previous;
            stage.scrollTo({
                left: (stage.scrollLeft + stage.clientWidth / 2) * ratio - stage.clientWidth / 2,
                top: (stage.scrollTop + stage.clientHeight / 2) * ratio - stage.clientHeight / 2,
                behavior: 'smooth',
            });
        }
        state.pinned = '';
        hideHover(true);
    }

    function nodeFor(key) {
        return document.querySelector(`#fbm-map-canvas .fbm-marker[data-fbm-key="${CSS.escape(key)}"]`)
            || document.querySelector(`#fbm-map-canvas .fbm-country[data-fbm-key="${CSS.escape(key)}"]`);
    }

    function centerOn(key) {
        const stage = $('fbm-map-stage');
        const target = nodeFor(key);
        if (!stage || !target) return;
        const stageBox = stage.getBoundingClientRect();
        const targetBox = target.getBoundingClientRect();
        stage.scrollBy({
            left: targetBox.left + targetBox.width / 2 - (stageBox.left + stageBox.width / 2),
            top: targetBox.top + targetBox.height / 2 - (stageBox.top + stageBox.height / 2),
            behavior: 'smooth',
        });
        stage.classList.add('has-interacted');
    }

    function showHover(key, target, options = {}) {
        if ((!options.force && window.matchMedia('(max-width: 700px)').matches) || drag?.moved) return;
        if (state.pinned && !options.force && state.pinned !== key) return;
        const point = visiblePoints(pointsForMaturity()).find(item => item.key === key);
        const tip = $('fbm-hover-tip');
        const wrap = $('fbm-map-wrap');
        if (!point || !tip || !wrap || !target) return;
        const change = point.prev == null ? null : (point.yield - point.prev) * 100;
        const move = change == null ? 'Sin variación comparable' : `${change > 0 ? '+' : ''}${change.toFixed(0)} pb`;
        const ranked = visiblePoints(pointsForMaturity()).sort((a, b) => b.yield - a.yield);
        const rank = ranked.findIndex(item => item.key === key) + 1;
        const source = point.indicative ? (point.bond.source || 'Referencia soberana indicativa') : (point.source || 'Fuente no especificada');
        document.querySelectorAll('#fbm-map-canvas .is-previewed').forEach(node => node.classList.remove('is-previewed'));
        document.querySelectorAll(`#fbm-map-canvas [data-fbm-key="${CSS.escape(key)}"]`).forEach(node => node.classList.add('is-previewed'));
        tip.classList.toggle('is-pinned', !!state.pinned);
        tip.innerHTML = `<header class="fbm-tip-head">
                <span class="fbm-hover-flag">${esc(point.flag)}</span>
                <div><small>${esc(point.bond.label)} · posición ${rank} de ${ranked.length}</small><strong>${esc(point.country)}</strong></div>
                <button type="button" class="fbm-tip-close" aria-label="Cerrar ficha"><i class="fas fa-xmark" aria-hidden="true"></i></button>
            </header>
            <div class="fbm-tip-quote"><span>Rendimiento soberano</span><strong>${number(point.yield)}%</strong><em>${esc(move)}</em></div>
            <div class="fbm-tip-grid">
                <span><small>Cierre previo</small><strong>${point.prev == null ? '—' : number(point.prev) + '%'}</strong></span>
                <span><small>Lectura</small><strong>${point.indicative ? 'Indicativa' : 'Conectada'}</strong></span>
            </div>
            <div class="fbm-tip-source"><small><i class="fas fa-database" aria-hidden="true"></i> Fuente</small><strong>${esc(source)}</strong></div>
            <span class="fbm-tip-mode"><i class="fas ${state.pinned ? 'fa-thumbtack' : 'fa-computer-mouse'}" aria-hidden="true"></i>${state.pinned ? 'Ficha fijada · vuelve a hacer clic para soltar' : 'Haz clic para mantener esta ficha abierta'}</span>
            <button type="button" class="fbm-tip-action" data-fbm-detail="${esc(point.key)}">Ver todos los instrumentos <i class="fas fa-arrow-right" aria-hidden="true"></i></button>`;
        tip.hidden = false;
        const hostBox = wrap.getBoundingClientRect();
        const targetBox = target.getBoundingClientRect();
        const margin = 10;
        let x = targetBox.left - hostBox.left + targetBox.width / 2 - tip.offsetWidth / 2;
        let y = targetBox.top - hostBox.top - tip.offsetHeight - margin;
        if (y < margin) y = targetBox.bottom - hostBox.top + margin;
        x = Math.max(margin, Math.min(x, hostBox.width - tip.offsetWidth - margin));
        y = Math.max(margin, Math.min(y, hostBox.height - tip.offsetHeight - margin));
        tip.style.left = `${Math.round(x)}px`;
        tip.style.top = `${Math.round(y)}px`;
    }

    function hideHover(force = false) {
        if (state.pinned && !force) return;
        const tip = $('fbm-hover-tip');
        if (!tip) return;
        tip.hidden = true;
        tip.style.left = '';
        tip.style.top = '';
        document.querySelectorAll('#fbm-map-canvas .is-previewed').forEach(node => node.classList.remove('is-previewed'));
    }

    function selectCountry(key, points, options = {}) {
        const point = points.find(item => item.key === key);
        if (!point) return;
        state.selected = key;
        document.querySelectorAll('#fbm-map-canvas [data-fbm-key]').forEach(node => {
            node.classList.toggle('is-selected', node.dataset.fbmKey === key);
        });
        const picker = $('fbm-country');
        if (picker) picker.value = key;
        if (options.center) centerOn(key);
    }

    function renderMap() {
        const map = window.VN_WORLD_MAP;
        const canvas = $('fbm-map-canvas');
        if (!map || !canvas) return;
        const allPoints = pointsForMaturity();
        const points = visiblePoints(allPoints);
        const visibleKeys = new Set(points.map(point => point.key));
        const byNe = new Map(allPoints.map(point => [point.ne, point]));
        updateLegend(allPoints);
        const empty = $('fbm-map-empty');
        if (empty) empty.hidden = points.length > 0;

        const countries = [...map.paises];
        Object.entries(map.suplementos || {}).forEach(([ne, supplement]) => countries.push({ ne, d: supplement.d }));
        const paths = countries.map(country => {
            const point = byNe.get(country.ne);
            if (!point) return `<path class="fbm-country" d="${country.d}" aria-hidden="true"></path>`;
            const movement = movementFor(point);
            const fill = colorFor(point);
            const filtered = !visibleKeys.has(point.key);
            return `<path class="fbm-country has-data is-${movement}${point.indicative ? ' is-reference' : ' is-live'}${filtered ? ' is-filtered' : ''}" d="${country.d}" data-fbm-key="${esc(point.key)}" style="--fbm-fill:${fill}" role="button" tabindex="${filtered ? '-1' : '0'}" aria-hidden="${filtered}" aria-label="${esc(point.country)}, ${number(point.yield)} por ciento"><title>${esc(point.country)} · ${number(point.yield)}%</title></path>`;
        }).join('');
        const markers = allPoints.map(point => {
            const center = centerFor(map, point);
            if (!center) return '';
            const movement = movementFor(point);
            const fill = colorFor(point);
            const filtered = !visibleKeys.has(point.key);
            return `<g class="fbm-marker is-${movement}${point.indicative ? ' is-reference' : ' is-live'}${filtered ? ' is-filtered' : ''}" data-fbm-key="${esc(point.key)}" transform="translate(${center.x} ${center.y})" role="button" tabindex="${filtered ? '-1' : '0'}" aria-hidden="${filtered}" aria-label="${esc(point.country)}, ${number(point.yield)} por ciento">
                <circle class="fbm-marker-halo" r="9"></circle><circle class="fbm-marker-dot" r="4" style="--fbm-fill:${fill}"></circle>
                <title>${esc(point.country)} · ${number(point.yield)}%</title>
            </g>`;
        }).join('');
        canvas.innerHTML = `<svg class="fbm-svg" viewBox="0 0 ${map.ancho} ${map.alto}" role="img" aria-label="Rendimientos soberanos mundiales a ${FIXED_MATURITY_LABEL}"><g class="fbm-geography">${paths}</g><g class="fbm-markers">${markers}</g></svg>`;
        if (!points.some(point => point.key === state.selected)) {
            state.selected = points[0]?.key || '';
        }
        updatePicker(points);
        updateMapStatus(allPoints, points);
        if (state.selected) selectCountry(state.selected, points);
        canvas.style.setProperty('--fbm-zoom', state.zoom);
        state.pinned = '';
        hideHover(true);
    }

    function receiveData(event) {
        state.data = Array.isArray(event?.detail?.data) ? event.detail.data : [];
        state.fallback = !!event?.detail?.isReferenceFallback;
        renderMap();
    }

    function mount() {
        if (mounted || !$('bond-world-map')) return;
        mounted = true;
        const root = $('bond-world-map');
        const onClick = event => {
            const closeTip = event.target.closest('.fbm-tip-close');
            if (closeTip) {
                state.pinned = '';
                hideHover(true);
                return;
            }
            const detailButton = event.target.closest('[data-fbm-detail]');
            if (detailButton) {
                if (typeof window.setCountryFactsheet === 'function') window.setCountryFactsheet(detailButton.dataset.fbmDetail);
                $('country-factsheet')?.scrollIntoView({ behavior:'smooth', block:'start' });
                return;
            }
            const zoomButton = event.target.closest('[data-fbm-zoom]');
            if (zoomButton) { event.stopPropagation(); setZoom(zoomButton.dataset.fbmZoom); return; }
            const filterButton = event.target.closest('[data-fbm-filter]');
            if (filterButton) {
                state.filter = filterButton.dataset.fbmFilter;
                state.selected = '';
                renderMap();
                return;
            }
            const target = event.target.closest('#fbm-map-canvas [data-fbm-key]:not(.is-filtered)');
            if (!target) {
                if (event.target.closest('#fbm-map-stage')) {
                    state.pinned = '';
                    hideHover(true);
                }
                return;
            }
            if (ignoreClick) return;
            if (state.pinned === target.dataset.fbmKey) {
                state.pinned = '';
                hideHover(true);
                return;
            }
            selectCountry(target.dataset.fbmKey, visiblePoints(pointsForMaturity()));
            state.pinned = target.dataset.fbmKey;
            showHover(target.dataset.fbmKey, target, { force:true });
        };
        const onChange = event => {
            if (event.target.id !== 'fbm-country' || !event.target.value) return;
            selectCountry(event.target.value, visiblePoints(pointsForMaturity()), { center: true, focus: true });
            state.pinned = event.target.value;
            window.setTimeout(() => showHover(event.target.value, nodeFor(event.target.value), { force:true }), 320);
        };
        const onMouseOver = event => {
            const target = event.target.closest('#fbm-map-canvas [data-fbm-key]:not(.is-filtered)');
            if (target) showHover(target.dataset.fbmKey, target);
            else if (!event.target.closest('#fbm-hover-tip')) hideHover();
        };
        const onMouseLeave = () => hideHover();
        const onFocusIn = event => {
            const target = event.target.closest('#fbm-map-canvas [data-fbm-key]:not(.is-filtered)');
            if (target) showHover(target.dataset.fbmKey, target);
        };
        const onFocusOut = event => {
            if (!event.relatedTarget?.closest?.('#fbm-map-canvas [data-fbm-key]')) hideHover();
        };
        const onKeyDown = event => {
            const target = event.target.closest('#fbm-map-canvas [data-fbm-key]:not(.is-filtered)');
            if (target && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                selectCountry(target.dataset.fbmKey, visiblePoints(pointsForMaturity()));
                state.pinned = target.dataset.fbmKey;
                showHover(target.dataset.fbmKey, target, { force:true });
            }
            if (event.key === 'Escape') { state.pinned = ''; hideHover(true); }
        };
        root.addEventListener('click', onClick);
        root.addEventListener('change', onChange);
        root.addEventListener('mouseover', onMouseOver);
        root.addEventListener('mouseleave', onMouseLeave);
        root.addEventListener('focusin', onFocusIn);
        root.addEventListener('focusout', onFocusOut);
        root.addEventListener('keydown', onKeyDown);
        window.addEventListener('vn:bond-data', receiveData);
        cleanups.push(() => root.removeEventListener('click', onClick));
        cleanups.push(() => root.removeEventListener('change', onChange));
        cleanups.push(() => root.removeEventListener('mouseover', onMouseOver));
        cleanups.push(() => root.removeEventListener('mouseleave', onMouseLeave));
        cleanups.push(() => root.removeEventListener('focusin', onFocusIn));
        cleanups.push(() => root.removeEventListener('focusout', onFocusOut));
        cleanups.push(() => root.removeEventListener('keydown', onKeyDown));
        cleanups.push(() => window.removeEventListener('vn:bond-data', receiveData));

        const stage = $('fbm-map-stage');
        if (stage) {
            const pointerDown = event => {
                if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('.fbm-map-tools')) return;
                drag = { id:event.pointerId, x:event.clientX, y:event.clientY, left:stage.scrollLeft, top:stage.scrollTop, moved:false };
                stage.setPointerCapture?.(event.pointerId);
            };
            const pointerMove = event => {
                if (!drag || drag.id !== event.pointerId) return;
                const dx = event.clientX - drag.x;
                const dy = event.clientY - drag.y;
                if (!drag.moved && Math.hypot(dx, dy) < 5) return;
                drag.moved = true;
                ignoreClick = true;
                stage.classList.add('is-dragging', 'has-interacted');
                state.pinned = '';
                hideHover(true);
                stage.scrollLeft = drag.left - dx;
                stage.scrollTop = drag.top - dy;
                event.preventDefault();
            };
            const pointerEnd = event => {
                if (!drag || (event.pointerId !== undefined && drag.id !== event.pointerId)) return;
                stage.releasePointerCapture?.(drag.id);
                stage.classList.remove('is-dragging');
                drag = null;
                window.setTimeout(() => { ignoreClick = false; }, 0);
            };
            const wheel = event => {
                if (!event.ctrlKey && !event.metaKey) return;
                event.preventDefault();
                setZoom(event.deltaY < 0 ? 'in' : 'out');
            };
            const doubleClick = event => {
                if (event.target.closest('[data-fbm-key]')) return;
                event.preventDefault();
                setZoom('in');
            };
            const stageKeys = event => {
                if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom('in'); }
                if (event.key === '-' || event.key === '_') { event.preventDefault(); setZoom('out'); }
                if (event.key === '0') { event.preventDefault(); setZoom('reset'); }
            };
            stage.addEventListener('pointerdown', pointerDown);
            stage.addEventListener('pointermove', pointerMove);
            stage.addEventListener('pointerup', pointerEnd);
            stage.addEventListener('pointercancel', pointerEnd);
            stage.addEventListener('wheel', wheel, { passive:false });
            stage.addEventListener('dblclick', doubleClick);
            stage.addEventListener('keydown', stageKeys);
            cleanups.push(() => stage.removeEventListener('pointerdown', pointerDown));
            cleanups.push(() => stage.removeEventListener('pointermove', pointerMove));
            cleanups.push(() => stage.removeEventListener('pointerup', pointerEnd));
            cleanups.push(() => stage.removeEventListener('pointercancel', pointerEnd));
            cleanups.push(() => stage.removeEventListener('wheel', wheel));
            cleanups.push(() => stage.removeEventListener('dblclick', doubleClick));
            cleanups.push(() => stage.removeEventListener('keydown', stageKeys));
        }
        if (Array.isArray(window.__VN_BOND_DATA)) {
            state.data = window.__VN_BOND_DATA;
            state.fallback = !!window.__VN_BOND_DATA_META?.isReferenceFallback;
            renderMap();
        }
        setZoom('reset');
        stage?.classList.remove('has-interacted');
    }

    function unmount() {
        cleanups.splice(0).forEach(cleanup => cleanup());
        drag = null;
        ignoreClick = false;
        mounted = false;
    }

    window.VNBondMap = { montar: mount, desmontar: unmount, render: renderMap };
    mount();
})();
