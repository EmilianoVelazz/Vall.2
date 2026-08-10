import { useEffect, useRef } from 'react';
import { categoriaDe } from '../data/acledDemo.js';

/*
 * Mapa de eventos de riesgo (Leaflet + MarkerCluster).
 *
 * Leaflet es imperativo y React declarativo, así que el reparto es explícito:
 * React posee el <div> contenedor y NUNCA lo toca por dentro; Leaflet posee
 * todo lo que hay dentro. Por eso el div va vacío y sin children.
 *
 * Lo que el original hacía mal y aquí se corrige:
 *  - `L.map('acledMap')` nunca se destruía. En una SPA, al volver a la sección
 *    Leaflet encuentra el contenedor ya inicializado y lanza
 *    "Map container is already initialized". Ahora hay map.remove() al
 *    desmontar.
 *  - El listener de 'resize' se añadía sin quitarse nunca.
 */

const CENTROS = {
  all: { centro: [20, 10], zoom: 2 },
  ukraine: { centro: [49, 32], zoom: 6 },
  middle_east: { centro: [30, 42], zoom: 5 },
  africa: { centro: [5, 20], zoom: 4 },
  latam: { centro: [-10, -65], zoom: 3 },
};

const COLORES = { armado: '#ef4444', social: '#a855f7', politico: '#3b82f6', economico: '#f59e0b' };
const ETIQUETAS = { armado: 'Conflicto armado', social: 'Unrest social', politico: 'Evento político', economico: 'Crisis económica' };
const LIMITES = [[-80, -175], [82, 175]];

function radioPorBajas(f) {
  const n = parseInt(f, 10) || 0;
  if (n === 0) return 5;
  if (n <= 5) return 7;
  if (n <= 20) return 10;
  if (n <= 100) return 14;
  return 20;
}

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export default function AcledMap({ eventos, categoria, region, onConteo }) {
  const contenedor = useRef(null);
  const mapa = useRef(null);
  const grupo = useRef(null);

  // ── Crear el mapa una sola vez ──────────────────────────────────────────────
  useEffect(() => {
    const L = window.L;
    if (!L || !contenedor.current || mapa.current) return undefined;

    const m = L.map(contenedor.current, {
      center: [20, 10], zoom: 2, minZoom: 2, maxZoom: 10,
      maxBounds: LIMITES, maxBoundsViscosity: 1.0, worldCopyJump: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(m);

    m.fitBounds(LIMITES, { padding: [4, 4] });

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (c) => {
        const n = c.getChildCount();
        const sz = n > 500 ? 50 : n > 100 ? 42 : 34;
        const lbl = n > 9999 ? `${Math.round(n / 1000)}k` : n;
        return L.divIcon({
          html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:rgba(100,100,200,0.85);border:2px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.68rem;color:#fff;box-shadow:0 2px 14px rgba(0,0,0,0.5)">${lbl}</div>`,
          className: '', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
        });
      },
    });
    m.addLayer(cluster);

    const alRedimensionar = () => setTimeout(() => m.invalidateSize({ animate: false }), 100);
    window.addEventListener('resize', alRedimensionar);

    mapa.current = m;
    grupo.current = cluster;

    return () => {
      window.removeEventListener('resize', alRedimensionar);
      m.remove();
      mapa.current = null;
      grupo.current = null;
    };
  }, []);

  // ── Repintar marcadores cuando cambian los datos o el filtro ────────────────
  useEffect(() => {
    const L = window.L;
    const cluster = grupo.current;
    if (!L || !cluster) return;

    cluster.clearLayers();
    let visibles = 0;

    (eventos || []).forEach((ev) => {
      const lat = parseFloat(ev.latitude);
      const lng = parseFloat(ev.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;

      const cat = categoriaDe(ev);
      if (categoria !== 'all' && cat !== categoria) return;
      visibles += 1;

      const color = COLORES[cat] || '#94a3b8';
      const marcador = L.circleMarker([lat, lng], {
        radius: radioPorBajas(ev.fatalities), fillColor: color,
        color: 'rgba(0,0,0,0.4)', weight: 1, opacity: 0.9, fillOpacity: 0.78,
      });

      const bajas = parseInt(ev.fatalities, 10) || 0;
      const notas = ev.notes ? esc(ev.notes.slice(0, 240)) + (ev.notes.length > 240 ? '…' : '') : '';

      marcador.bindPopup(
        '<div class="acled-popup">'
        + `<div class="acled-popup-type" style="color:${color}">${ETIQUETAS[cat] || cat} &nbsp;·&nbsp; ${esc(ev.event_type)}</div>`
        + `<div class="acled-popup-title">${esc(ev.location)}, ${esc(ev.country)}</div>`
        + `<div class="acled-popup-date">${esc(ev.event_date)}</div>`
        + (notas ? `<div class="acled-popup-notes">${notas}</div>` : '')
        + (bajas > 0 ? `<div class="acled-popup-fatal">&#9760; ${bajas} bajas</div>` : '')
        + '</div>',
        { maxWidth: 300 },
      );

      cluster.addLayer(marcador);
    });

    onConteo?.(visibles);
  }, [eventos, categoria, onConteo]);

  // ── Volar a la región elegida ───────────────────────────────────────────────
  useEffect(() => {
    const destino = CENTROS[region];
    if (mapa.current && destino) mapa.current.flyTo(destino.centro, destino.zoom, { duration: 1.3 });
  }, [region]);

  return <div className="gp-acled-map" ref={contenedor} />;
}
