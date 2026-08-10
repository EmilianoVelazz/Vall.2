import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import MktChart from '../components/MktChart.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import loadScripts, { globalLegado } from '../lib/loadScripts.js';
import {
  calcIPI, impactoLabel, colorCalor, inteligenciaGranos, inteligenciaEnergia,
  inteligenciaMetales, calcularPresupuestoMetal, PRESUPUESTOS_METAL, montoCorto,
  datosProteinas, NOMBRE_ESPECIE, estimarDiesel, aplicarEscenarioEnergia,
  resultadoEscenarioEnergia, precioMxnPorTonelada, LB_POR_MT,
  clasificarNoticia, ETIQUETA_CATEGORIA, impactoNoticia, imagenValida,
  perspectiva, ETIQUETA_DIRECCION, boletinesGranos, boletinesEnergia,
} from '../lib/mercados.js';
import './Mercados.css';

/*
 * Mercados en React (antes pages/mercados.html: 3330 líneas, ~1730 de JS
 * inline con 55 funciones globales).
 *
 * El cálculo NO vive aquí: está en lib/mercados.js como funciones puras y
 * verificado contra las fórmulas originales (calcIPI idéntico, spread
 * soja/maíz, raciones, márgenes por especie, presupuesto de metales). Este
 * archivo solo compone la vista a partir de ese resultado.
 *
 * Lo que cambia respecto al original:
 *  - Las pestañas eran display:none sobre cinco <div> siempre presentes en el
 *    DOM; aquí solo se monta la activa. La gráfica se crea al abrir su pestaña
 *    y se destruye al salir (ver MktChart), en vez de acumularse en un objeto
 *    global `_mktCharts`.
 *  - Los simuladores de escenario y presupuesto leían sus valores con
 *    getElementById en cada tecla; ahora son estado controlado.
 *  - El setInterval de 20 min no se cancelaba nunca.
 */

const HOJAS = [
  '/assets/css/base.css',
  '/assets/css/header.css',
  '/assets/css/footer.css',
  '/assets/css/responsive.css',
  '/assets/css/mercados-redesign-v2.css?v=1',
];

const LIBS = ['/assets/js/api-keys.js?v=5', '/assets/js/data-service.js?v=22'];
const LIB_CHART = ['https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js'];

const MS_REFRESCO = 20 * 60 * 1000;
const CLAVE_TAB = 'mkt_active_tab';

const PESTANAS = [
  { id: 'general', icono: 'fa-chart-pie', titulo: 'General', sub: 'Hub & IPI', clase: 'mtc-general' },
  { id: 'granos', icono: 'fa-seedling', titulo: 'Granos & Forrajes', sub: 'Maíz · Soja', clase: 'mtc-granos' },
  { id: 'energia', icono: 'fa-oil-well', titulo: 'Energéticos', sub: 'WTI · Gas', clase: 'mtc-energia' },
  { id: 'metales', icono: 'fa-layer-group', titulo: 'Metales', sub: 'Cobre · Aluminio', clase: 'mtc-metales' },
  { id: 'proteinas', icono: 'fa-drumstick-bite', titulo: 'Proteínas', sub: 'Cerdo · Pollo · Res', clase: 'mtc-proteinas' },
];

const RANGOS = [['1mo', '1M'], ['3mo', '3M'], ['6mo', '6M'], ['1y', '1A'], ['3y', '3A'], ['5y', '5A'], ['max', 'MAX']];
const MODOS = [['candles', 'fa-chart-column', 'Velas'], ['line', 'fa-chart-line', 'Línea'], ['area', 'fa-chart-area', 'Área']];

const INSTRUMENTOS = {
  granos: {
    'ZC=F': { name: 'Maíz amarillo #2', market: 'CME · CBOT Chicago', key: 'maiz', unit: '/bu', icon: 'fa-seedling' },
    'ZS=F': { name: 'Soja en grano', market: 'CME · CBOT Chicago', key: 'soja', unit: '/MT', icon: 'fa-leaf' },
    'ZW=F': { name: 'Trigo SRW', market: 'CME · CBOT Chicago', key: 'trigo', unit: '/bu', icon: 'fa-wheat-awn' },
    'ZM=F': { name: 'Pasta de soja', market: 'CME · CBOT Chicago', key: null, unit: '', icon: 'fa-leaf' },
    'ZO=F': { name: 'Avena', market: 'CME · CBOT Chicago', key: null, unit: '', icon: 'fa-seedling' },
    'ZR=F': { name: 'Arroz rough', market: 'CME · CBOT Chicago', key: null, unit: '', icon: 'fa-bowl-rice' },
  },
  energia: {
    'CL=F': { name: 'Petróleo WTI', market: 'NYMEX · New York', key: 'wti', unit: '/bbl', icon: 'fa-oil-well' },
    'BZ=F': { name: 'Petróleo Brent', market: 'ICE Futures Europe', key: null, unit: '/bbl', icon: 'fa-droplet' },
    'NG=F': { name: 'Gas Natural Henry Hub', market: 'NYMEX · New York', key: 'gasnat', unit: '/MMBtu', icon: 'fa-fire-flame-curved' },
    'HO=F': { name: 'Diesel ULSD', market: 'NYMEX · New York', key: 'diesel', unit: '/gal', icon: 'fa-gas-pump' },
    'RB=F': { name: 'Gasolina RBOB', market: 'NYMEX · New York', key: null, unit: '/gal', icon: 'fa-gauge-high' },
  },
  metales: {
    'HG=F': { name: 'Cobre Grado A', market: 'COMEX · New York', key: 'cobre', unit: '/lb', icon: 'fa-bolt' },
    'ALI=F': { name: 'Aluminio primario', market: 'LME / COMEX', key: 'aluminio', unit: '/MT', icon: 'fa-layer-group' },
    'GC=F': { name: 'Oro', market: 'COMEX · New York', key: null, unit: '/oz', icon: 'fa-coins' },
    'SI=F': { name: 'Plata', market: 'COMEX · New York', key: null, unit: '/oz', icon: 'fa-circle' },
    'PL=F': { name: 'Platino', market: 'NYMEX · New York', key: null, unit: '/oz', icon: 'fa-gem' },
  },
};

const TICKER_INICIAL = { granos: 'ZC=F', energia: 'CL=F', metales: 'HG=F' };
const DECIMALES = { gasnat: 3, aluminio: 0 };

const num = (v, f = 0) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : f);
const fmtPct = (v) => `${num(v) >= 0 ? '+' : ''}${num(v).toFixed(2)}%`;
const mxnFmt = (v) => v.toLocaleString('es-MX', { maximumFractionDigits: 0 });

/* ── Carga de datos ─────────────────────────────────────────────────────────
   Devuelve el objeto `precios` con la misma forma que el original: por cada
   commodity, valor + _pct + _pct3m + _hist + _real. El sufijo _real distingue
   una cotización verdadera de un valor de referencia, y se usa para bajar la
   confianza en la perspectiva y para etiquetar en pantalla. */
async function cargarPrecios(VDS) {
  const [maiz, soja, wti, cobre, trigo, gasnat, aluminio, mxn, hogs, cattle] = await Promise.allSettled([
    VDS.commodityWithPct('CORN'), VDS.commodityWithPct('SOYBEANS'), VDS.commodityWithPct('CRUDE_OIL'),
    VDS.commodityWithPct('COPPER'), VDS.commodityWithPct('WHEAT'), VDS.commodityWithPct('NATURAL_GAS'),
    VDS.commodityWithPct('ALUMINUM'), VDS.usdmxn(),
    VDS.commodityWithPct('LEAN_HOGS'), VDS.commodityWithPct('LIVE_CATTLE'),
  ]);

  const val = (r) => (r.status === 'fulfilled' && r.value != null ? r.value : null);
  const d = {
    maiz: val(maiz), soja: val(soja), wti: val(wti), cobre: val(cobre), trigo: val(trigo),
    gasnat: val(gasnat), aluminio: val(aluminio),
  };
  const mxnRate = val(mxn);
  const hogsD = val(hogs);
  const cattleD = val(cattle);

  const REF = { maiz: '4.82', soja: '342.50', trigo: '5.30', wti: '70.00', gasnat: '2.450', cobre: '4.18', aluminio: '2400' };
  const precios = {};
  for (const [k, v] of Object.entries(d)) {
    const dec = DECIMALES[k] ?? 2;
    precios[k] = v ? v.price.toFixed(dec) : REF[k];
    precios[`${k}_pct`] = v?.pct ?? 0;
    precios[`${k}_pct3m`] = v?.pct3m ?? null;
    precios[`${k}_hist`] = v?.history ?? null;
    precios[`${k}_real`] = !!v;
  }

  // El sorgo no cotiza en el tablero: se estima como maíz × 0.92.
  precios.sorgo = d.maiz ? (d.maiz.price * 0.92).toFixed(2) : '4.43';
  precios.sorgo_pct = d.maiz?.pct ?? 0;
  // El diesel tampoco: se deriva del WTI.
  precios.diesel = estimarDiesel(d.wti?.price ?? 70).toFixed(2);
  precios.diesel_pct = d.wti?.pct ?? 0;

  return { precios, mxnRate, hogsD, cattleD };
}

async function cargarNoticias(VDS, precios, mxnRate, hora) {
  const [av, fh, soy, wheat] = await Promise.allSettled([
    VDS.newsAlphaVantage('commodities', 8),
    VDS.finnhubNews('general'),
    VDS.gdeltNews('soybean', 10),
    VDS.gdeltNews('wheat', 10),
  ]);
  const usar = (r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);

  const todas = [
    ...usar(av).map((a) => ({ title: a.title, desc: a.description || '', src: a.source || 'Alpha Vantage', url: a.url || '', fecha: hora, image: a.banner_image || a.image || '' })),
    ...usar(soy).map((a) => ({ title: a.title, desc: a.description || '', src: a.source || 'GDELT', url: a.url || '', fecha: hora, image: a.image || '' })),
    ...usar(wheat).map((a) => ({ title: a.title, desc: a.description || '', src: a.source || 'GDELT', url: a.url || '', fecha: hora, image: a.image || '' })),
    ...usar(fh).map((a) => ({ title: a.title, desc: a.description || a.summary || '', src: a.source || 'Finnhub', url: a.url || '', fecha: hora, image: a.image || '' })),
  ];

  const vistos = new Set();
  const unicas = todas.filter((a) => {
    const k = (a.title || '').toLowerCase().slice(0, 50);
    if (!k || k.length < 8 || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  const de = (cat) => unicas.filter((a) => (clasificarNoticia(a.title) || clasificarNoticia(a.desc)) === cat);
  const dedup = (lista) => lista.filter((a, i, arr) => arr.findIndex((b) => (b.title || '').toLowerCase() === (a.title || '').toLowerCase()) === i);

  return {
    granos: dedup([...de('granos'), ...boletinesGranos(precios, mxnRate, hora)]).slice(0, 8),
    energia: dedup([...de('energia'), ...boletinesEnergia(precios, mxnRate, hora)]).slice(0, 8),
  };
}

/* ── Piezas de interfaz ─────────────────────────────────────────────────────*/

function Variacion({ pct }) {
  const n = num(pct);
  return <div className={`cmt-pct ${n >= 0 ? 'up' : 'down'}`}>{fmtPct(n)}</div>;
}

function PanelNoticias({ titulo, articulos, filtros, filtro, onFiltro }) {
  const visibles = filtro === 'all'
    ? articulos
    : articulos.filter((a) => (clasificarNoticia(a.title) || clasificarNoticia(a.desc)) === filtro);

  return (
    <section className="news-side-panel grain-news-card">
      <div className="news-side-hdr">
        <span><i className="fas fa-newspaper" /> {titulo}</span>
        <span className="news-refresh-badge"><i className="fas fa-rotate" /> Cada 20 min</span>
      </div>
      <div className="news-filter-bar">
        {filtros.map(([id, texto]) => (
          <span
            key={id}
            className={`news-fpill${filtro === id ? ' active' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => onFiltro(id)}
            onKeyDown={(e) => { if (e.key === 'Enter') onFiltro(id); }}
          >
            {texto}
          </span>
        ))}
      </div>
      <div className="news-scroll-viewport">
        <div className="news-scroll-inner">
          {!visibles.length && (
            <div className="news-item">
              <div className="news-cat">Sin noticias</div>
              <div className="news-title" style={{ color: 'var(--muted)' }}>No hay noticias disponibles para este filtro.</div>
            </div>
          )}
          {visibles.map((a, i) => {
            const cat = clasificarNoticia(a.title) || clasificarNoticia(a.desc) || 'macro';
            const imp = impactoNoticia(a);
            const conImagen = imagenValida(a.image);
            const Contenedor = a.url ? 'a' : 'div';
            return (
              <Contenedor
                key={`${a.title}-${i}`}
                className={`news-item${a.brief ? ' news-brief' : ''}${conImagen ? ' has-image' : ''}`}
                {...(a.url ? { href: a.url, target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {conImagen && (
                  <img className="news-thumb" src={a.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
                )}
                <div className="news-meta-row">
                  <span className="news-cat">{ETIQUETA_CATEGORIA[cat] || '📰 Mercados'}</span>
                  <span className="news-impact-tag" style={{ background: imp.color }}>{imp.etiqueta}</span>
                </div>
                <div className="news-title">{(a.title || '').slice(0, 110)}</div>
                {a.brief && <div className="news-brief-desc">{(a.desc || '').slice(0, 145)}</div>}
                <div className="news-src"><span>{a.src || 'API'}</span><span>{a.fecha || ''}</span></div>
              </Contenedor>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TarjetaGrafica({ panel, titulo, precios, ticker, onTicker, rango, onRango, modo, onModo, listo }) {
  const meta = INSTRUMENTOS[panel][ticker];
  const precio = meta.key ? num(precios[meta.key], null) : null;
  const pct = meta.key ? num(precios[`${meta.key}_pct`], null) : null;
  const dec = DECIMALES[meta.key] ?? 2;

  return (
    <section className="grain-chart-card">
      <div className="grain-card-head">
        <div><small>Explorador histórico</small><h2>{titulo}</h2></div>
        <select className="chart-sel" value={ticker} onChange={(e) => onTicker(e.target.value)}>
          {Object.entries(INSTRUMENTOS[panel]).map(([t, m]) => (
            <option key={t} value={t}>{m.name} · {t}</option>
          ))}
        </select>
      </div>

      <div className="grain-chart-snapshot">
        <span className="gcs-icon"><i className={`fas ${meta.icon}`} /></span>
        <div><small>{meta.market}</small><strong>{meta.name}</strong></div>
        <div className="gcs-price">
          <small>Último</small>
          <strong>{precio != null ? `$${precio.toFixed(dec)}${meta.unit}` : 'Histórico'}</strong>
        </div>
        <div className="gcs-change">
          <small>Variación mensual</small>
          <strong className={pct == null ? '' : pct >= 0 ? 'up' : 'down'}>
            {pct != null ? fmtPct(pct) : 'Consulta gráfica'}
          </strong>
        </div>
        <div className="gcs-status"><i /> Mercado de referencia</div>
      </div>

      <div className="grain-chart-toolbar">
        <div className="grain-view-switch">
          <span>Vista</span>
          {MODOS.map(([id, icono, texto]) => (
            <button key={id} type="button" className={modo === id ? 'active' : ''} onClick={() => onModo(id)}>
              <i className={`fas ${icono}`} /> {texto}
            </button>
          ))}
        </div>
        <div className="grain-period-control">
          <span>Periodo</span>
          <div className="chart-intervals">
            {RANGOS.map(([id, texto]) => (
              <button key={id} type="button" className={`chart-int-btn${rango === id ? ' active' : ''}`} onClick={() => onRango(id)}>
                {texto}
              </button>
            ))}
          </div>
        </div>
      </div>

      {listo
        ? <MktChart ticker={ticker} rango={rango} modo={modo} panel={panel} />
        : <div className="grain-chart-canvas" />}
    </section>
  );
}

function Senal({ icono, titulo, valor, nota }) {
  return (
    <section className="grain-signal-card">
      <div className="grain-signal-icon"><i className={`fas ${icono}`} /></div>
      <small>{titulo}</small>
      <strong>{valor}</strong>
      <p>{nota}</p>
    </section>
  );
}

/* ── Página ─────────────────────────────────────────────────────────────────*/

export default function Mercados() {
  usePageStyles(HOJAS);

  const [pestana, setPestana] = useState(() => {
    try {
      const guardada = localStorage.getItem(CLAVE_TAB);
      return PESTANAS.some((p) => p.id === guardada) ? guardada : 'general';
    } catch { return 'general'; }
  });

  const [datos, setDatos] = useState(null);
  const [noticias, setNoticias] = useState({ granos: [], energia: [] });
  const [chartListo, setChartListo] = useState(false);
  const [hora, setHora] = useState('');

  const [tickers, setTickers] = useState(TICKER_INICIAL);
  const [rangos, setRangos] = useState({ granos: '1y', energia: '1y', metales: '1y' });
  const [modos, setModos] = useState({ granos: 'candles', energia: 'candles', metales: 'candles' });
  const [filtroNoticias, setFiltroNoticias] = useState({ granos: 'all', energia: 'all' });

  const [escenario, setEscenario] = useState(null);
  const [presetEscenario, setPresetEscenario] = useState('actual');
  const [presupuesto, setPresupuesto] = useState({ cobreT: 5, aluminioT: 20, fx: 18 });
  const [presetPresupuesto, setPresetPresupuesto] = useState('medium');
  const [especie, setEspecie] = useState('pork');

  useEffect(() => {
    try { localStorage.setItem(CLAVE_TAB, pestana); } catch { /* sin almacenamiento */ }
  }, [pestana]);

  useEffect(() => {
    loadScripts(LIB_CHART).then(() => setChartListo(true)).catch((e) => console.error('Mercados: LightweightCharts', e));
  }, []);

  useEffect(() => {
    let vivo = true;
    let reloj = null;

    const ejecutar = async (VDS) => {
      const ahora = new Date();
      const h = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      const d = await cargarPrecios(VDS);
      if (!vivo) return;
      setDatos(d);
      setHora(h);
      window.VNLoader?.hide();

      try {
        const n = await cargarNoticias(VDS, d.precios, d.mxnRate, h);
        if (vivo) setNoticias(n);
      } catch (e) { console.warn('Mercados · noticias:', e); }
    };

    (async () => {
      try {
        await loadScripts(LIBS);
      } catch (e) { console.error('Mercados: no se pudo cargar data-service', e); return; }
      if (!vivo) return;

      const VDS = globalLegado('VDS');
      if (!VDS) { console.error('Mercados: data-service.js no expuso VDS.'); return; }

      await ejecutar(VDS).catch((e) => console.error('Mercados:', e));
      reloj = setInterval(() => ejecutar(VDS).catch(() => {}), MS_REFRESCO);
    })();

    return () => { vivo = false; if (reloj) clearInterval(reloj); };
  }, []);

  const precios = datos?.precios;
  const mxnRate = datos?.mxnRate;

  const ipi = useMemo(() => (precios ? calcIPI(precios) : null), [precios]);
  const granos = useMemo(() => (precios ? inteligenciaGranos(precios, mxnRate) : null), [precios, mxnRate]);
  const energia = useMemo(() => (precios ? inteligenciaEnergia(precios, mxnRate) : null), [precios, mxnRate]);
  const metales = useMemo(() => (precios ? inteligenciaMetales(precios, mxnRate) : null), [precios, mxnRate]);
  const proteinas = useMemo(
    () => (precios ? datosProteinas(precios, mxnRate, datos.hogsD, datos.cattleD) : null),
    [precios, mxnRate, datos],
  );
  const futuro = useMemo(() => (precios ? perspectiva(precios, mxnRate) : []), [precios, mxnRate]);

  // Base del simulador energético: se fija cuando llegan los datos reales.
  useEffect(() => {
    if (!energia || !precios) return;
    const base = { wti: num(precios.wti, 70), gas: num(precios.gasnat, 2.5), fx: num(mxnRate, 18) };
    setEscenario(aplicarEscenarioEnergia(base, 'actual'));
    setPresupuesto((p) => ({ ...p, fx: num(mxnRate, 18) }));
  }, [energia, precios, mxnRate]);

  const aplicarPreset = useCallback((modo) => {
    if (!precios) return;
    setPresetEscenario(modo);
    setEscenario(aplicarEscenarioEnergia(
      { wti: num(precios.wti, 70), gas: num(precios.gasnat, 2.5), fx: num(mxnRate, 18) }, modo,
    ));
  }, [precios, mxnRate]);

  const resultado = escenario ? resultadoEscenarioEnergia(escenario) : null;
  const presupuestoCalc = precios ? calcularPresupuestoMetal(presupuesto, precios) : null;

  const cambiarPresupuesto = (campo, valor) => {
    setPresetPresupuesto('');
    setPresupuesto((p) => ({ ...p, [campo]: valor }));
  };

  const aplicarPresetPresupuesto = (modo) => {
    setPresetPresupuesto(modo);
    setPresupuesto({ ...PRESUPUESTOS_METAL[modo], cobreT: PRESUPUESTOS_METAL[modo].cobre, aluminioT: PRESUPUESTOS_METAL[modo].aluminio, fx: num(mxnRate, 18) });
  };

  const cargando = !precios;

  const filasCalor = precios ? [
    { key: 'maiz', lbl: 'Maíz', price: precios.maiz, pct: precios.maiz_pct, unit: '$/bu', emoji: '🌽' },
    { key: 'soja', lbl: 'Soja', price: precios.soja, pct: precios.soja_pct, unit: '$/MT', emoji: '🫘' },
    { key: 'trigo', lbl: 'Trigo', price: precios.trigo, pct: precios.trigo_pct, unit: '$/bu', emoji: '🌾' },
    { key: 'wti', lbl: 'WTI', price: precios.wti, pct: precios.wti_pct, unit: '$/bbl', emoji: '🛢' },
    { key: 'gasnat', lbl: 'Gas Nat.', price: precios.gasnat, pct: precios.gasnat_pct, unit: '$/MMBtu', emoji: '🔥' },
    { key: 'diesel', lbl: 'Diesel', price: precios.diesel, pct: precios.diesel_pct, unit: '$/gal', emoji: '⛽' },
    { key: 'cobre', lbl: 'Cobre', price: precios.cobre, pct: precios.cobre_pct, unit: '$/lb', emoji: '🔩' },
    { key: 'aluminio', lbl: 'Aluminio', price: precios.aluminio, pct: precios.aluminio_pct, unit: '$/MT', emoji: '🏗' },
    { key: 'mxn', lbl: 'USD/MXN', price: mxnRate, pct: null, unit: 'pesos', emoji: '💱' },
  ] : [];

  const filasGranos = precios ? [
    { key: 'maiz', name: 'Maíz Amarillo #2', sub: 'CME · CBOT Chicago', price: precios.maiz, pct: precios.maiz_pct, pct3m: precios.maiz_pct3m, unit: '/bu' },
    { key: 'trigo', name: 'Trigo SRW Chicago', sub: 'CBOT · SRW', price: precios.trigo, pct: precios.trigo_pct, pct3m: precios.trigo_pct3m, unit: '/bu' },
    { key: 'soja', name: 'Soja en Grano', sub: 'CME · CBOT Chicago', price: precios.soja, pct: precios.soja_pct, pct3m: precios.soja_pct3m, unit: '/MT' },
    { key: 'sorgo', name: 'Sorgo Amarillo', sub: 'Est. Maíz ×0.92', price: precios.sorgo, pct: precios.sorgo_pct, pct3m: null, unit: '/bu' },
  ] : [];

  const filasEnergia = precios ? [
    { key: 'wti', name: 'Petróleo WTI', sub: 'NYMEX · New York', price: precios.wti, pct: precios.wti_pct, unit: '/bbl', dec: 2 },
    { key: 'gasnat', name: 'Gas Natural H.Hub', sub: 'NYMEX · MMBtu', price: precios.gasnat, pct: precios.gasnat_pct, unit: '/MMBtu', dec: 3 },
    { key: 'diesel', name: 'Diesel ULSD Est.', sub: 'NYMEX · Est.', price: precios.diesel, pct: precios.diesel_pct, unit: '/gal', dec: 2 },
  ] : [];

  const filasMetales = precios ? [
    { key: 'cobre', name: 'Cobre Grado A', sub: 'LME / COMEX', price: precios.cobre, pct: precios.cobre_pct, unit: '/lb', dec: 2, factor: LB_POR_MT },
    { key: 'aluminio', name: 'Aluminio Primario', sub: 'LME London', price: precios.aluminio, pct: precios.aluminio_pct, unit: '/MT', dec: 0, factor: 1 },
  ] : [];

  return (
    <>
      <Header />
      <div className="hdr-divider" />

      <div className="mkt-ticker">
        <div className="ticker-inner">
          {[...Array(2)].flatMap((_, rep) => [
            ['Maíz', precios?.maiz, precios?.maiz_pct, 2],
            ['Soja', precios?.soja, precios?.soja_pct, 2],
            ['Trigo', precios?.trigo, precios?.trigo_pct, 2],
            ['Sorgo', precios?.sorgo, precios?.sorgo_pct, 2],
            ['WTI', precios?.wti, precios?.wti_pct, 2],
            ['Gas Nat.', precios?.gasnat, precios?.gasnat_pct, 3],
            ['Cobre', precios?.cobre, precios?.cobre_pct, 2],
            ['Aluminio', precios?.aluminio, precios?.aluminio_pct, 0],
            ['USD/MXN', mxnRate, null, 2],
          ].map(([lbl, precio, pct, dec], i) => (
            <div className="tk-item" key={`${rep}-${i}`}>
              <span className="tk-lbl">{lbl}</span>
              <span className="tk-val">{precio != null ? `$${num(precio).toFixed(dec)}` : '–'}</span>
              {pct != null && <span className={`tk-pct ${num(pct) >= 0 ? 'up' : 'down'}`}>{fmtPct(pct)}</span>}
            </div>
          )))}
        </div>
      </div>

      <div className="mkt-wrap">
        <div className="mkt-tabs-nav">
          {PESTANAS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`mkt-tab-card ${t.clase}${pestana === t.id ? ' active' : ''}`}
              onClick={() => { setPestana(t.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            >
              <div className="mkt-tab-icon-sq"><i className={`fas ${t.icono}`} /></div>
              <div><div className="mkt-tab-ttl">{t.titulo}</div><div className="mkt-tab-sub">{t.sub}</div></div>
            </button>
          ))}
        </div>

        {/* ── General ───────────────────────────────────────────────────── */}
        {pestana === 'general' && (
          <div>
            <div className="hub-hero">
              <div className="hub-hero-accent-mkt" />
              <div className="hub-hero-beam-mkt" />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div className="hub-hero-eyebrow"><div className="hub-hero-dot-w" />VALLNews · Mercado de Insumos</div>
                <div className="hub-hero-title">Monitor de Commodities</div>
                <div className="hub-hero-sub">
                  <span className="live-dot" />
                  Granos · Energéticos · Metales · Logística &nbsp;·&nbsp;
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '.6rem' }}>{hora || '-'}</span>
                </div>
              </div>
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.5rem' }}>
                <div className="hub-hero-live-mkt"><div className="hub-live-dot-mkt" />Datos en vivo</div>
                <span style={{ fontSize: '.54rem', fontWeight: 700, padding: '.2rem .7rem', borderRadius: 20, background: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.8)', border: '1px solid rgba(255,255,255,.18)', fontFamily: "'JetBrains Mono',monospace" }}>
                  IPI {ipi ? ipi.score : '-'}/100
                </span>
              </div>
            </div>

            <div className="mkt-hub-grid">
              {[
                { id: 'granos', clase: 'mhc-granos', icono: 'fa-seedling', titulo: 'Granos & Forrajes', sub: 'Maíz · Soja · Trigo · CME', badge: 'CME', destacado: ['Maíz', precios?.maiz], desc: 'Precios de referencia CME/CBOT para maíz, soja y trigo que determinan el costo base de alimentación animal en México.', metricas: [['Maíz', precios?.maiz], ['Soja', precios?.soja], ['Trigo', precios?.trigo]], cta: 'Ver análisis de granos' },
                { id: 'energia', clase: 'mhc-energia', icono: 'fa-oil-well', titulo: 'Energéticos', sub: 'WTI · Gas Natural · Diesel', badge: 'NYMEX', destacado: ['WTI', precios?.wti], desc: 'El WTI determina el costo de diesel, fletes y toda la logística agropecuaria nacional e internacional.', metricas: [['WTI', precios?.wti], ['Gas Nat.', precios?.gasnat], ['Diesel', precios?.diesel]], cta: 'Ver energéticos' },
                { id: 'metales', clase: 'mhc-metales', icono: 'fa-layer-group', titulo: 'Metales', sub: 'Cobre · Aluminio · LME/COMEX', badge: 'LME', destacado: ['Cobre', precios?.cobre], desc: 'Metales industriales LME/COMEX. El cobre anticipa el ciclo económico global y afecta costos de infraestructura.', metricas: [['Cobre', precios?.cobre], ['Aluminio', precios?.aluminio], ['IPI Score', ipi ? `${ipi.score}/100` : null]], cta: 'Ver metales' },
                { id: 'proteinas', clase: 'mhc-proteinas', icono: 'fa-drumstick-bite', titulo: 'Mercado de Proteínas', sub: 'Cerdo · Pollo · Res · Márgenes', badge: 'GLOBAL', destacado: ['Cerdo', proteinas?.precios.pork], desc: 'Precios internacionales, costo de alimentación, competitividad y demanda de las principales proteínas animales.', metricas: [['Cerdo', proteinas?.precios.pork], ['Pollo', proteinas?.precios.chicken], ['Res', proteinas?.precios.beef]], cta: 'Abrir tablero de proteínas' },
              ].map((c) => (
                <div key={c.id} className={`mkt-hub-card ${c.clase}`} role="button" tabIndex={0}
                  onClick={() => setPestana(c.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setPestana(c.id); }}
                >
                  <div className="mkt-hub-hdr">
                    <div className="mkt-hub-shine" />
                    <div className="mkt-hub-icon"><i className={`fas ${c.icono}`} /></div>
                    <div className="mkt-hub-txt"><div className="mkt-hub-title">{c.titulo}</div><div className="mkt-hub-sub">{c.sub}</div></div>
                    <span className="mkt-hub-badge"><span className="mkt-hub-bdot" />{c.badge}</span>
                    <div className="mkt-hub-stat">
                      <div className="mkt-hub-stat-lbl">{c.destacado[0]}</div>
                      <div className="mkt-hub-stat-val">{c.destacado[1] != null ? `$${num(c.destacado[1]).toFixed(2)}` : '—'}</div>
                    </div>
                  </div>
                  <div className="mkt-hub-body">
                    <p className="mkt-hub-desc">{c.desc}</p>
                    <div className="mkt-hub-metrics">
                      {c.metricas.map(([lbl, val]) => (
                        <div className="mkt-hub-m" key={lbl}>
                          <div className="mkt-hub-m-lbl">{lbl}</div>
                          <div className="mkt-hub-m-val">
                            {val == null ? '—' : typeof val === 'string' && val.includes('/') ? val : `$${num(val).toFixed(2)}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mkt-hub-cta">{c.cta} <span className="mkt-hub-arrow"><i className="fas fa-arrow-right" /></span></div>
                </div>
              ))}
            </div>

            <div className="ipi-hero">
              <div className="ipi-gauge-wrap">
                <div className="ipi-score-big" style={{ color: ipi?.color }}>{ipi ? `${ipi.score} / 100` : '—'}</div>
                <div className="ipi-score-lbl">IPI · Índice de Presión</div>
                <div className="ipi-bar-outer">
                  <div className="ipi-bar-fill" style={{ width: `${ipi?.score ?? 0}%`, background: ipi?.color }} />
                </div>
                <div className="ipi-verdict-big" style={{ color: ipi?.color }}>{ipi?.label || 'Calculando presión…'}</div>
              </div>
              <div className="ipi-details">
                {[['Maíz m/m', precios?.maiz_pct], ['Soja m/m', precios?.soja_pct], ['Diesel m/m', precios?.diesel_pct], ['WTI m/m', precios?.wti_pct]].map(([lbl, pct]) => {
                  const n = num(pct);
                  const color = n > 1.5 ? '#dc2626' : n > 0.3 ? '#d97706' : n < -0.3 ? '#16a34a' : '#64748b';
                  return (
                    <div className="ipi-metric" key={lbl}>
                      <div className="ipi-metric-lbl">{lbl}</div>
                      <div className="ipi-metric-val" style={{ color: pct == null ? undefined : color }}>
                        {pct == null ? '—' : `${fmtPct(n)} m/m`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="sec-lbl"><span className="live-dot" /> Mapa de Calor · Presión de Insumos</div>
            <div className="heat-grid">
              {cargando && <div className="heat-cell neutral" style={{ gridColumn: 'span 3' }}><div className="heat-cell-lbl">Cargando precios…</div></div>}
              {filasCalor.map((it) => (
                <div className="heat-cell" key={it.key} style={{ background: colorCalor(it.pct) }}>
                  <div className="heat-cell-lbl">{it.emoji} {it.lbl}</div>
                  <div className="heat-cell-price">{it.price != null ? `$${num(it.price).toFixed(it.key === 'gasnat' ? 3 : 2)}` : '—'}</div>
                  <div className="heat-cell-pct">{it.pct != null ? fmtPct(it.pct) : 'Ref.'}</div>
                  <div className="heat-cell-unit">{it.unit}</div>
                </div>
              ))}
            </div>

            <div className="sec-lbl" style={{ marginTop: '1.2rem' }}><span className="live-dot" /> Perspectiva de Mercado · Próximas 2–4 Semanas</div>
            <div className="forecast-grid">
              {futuro.map((it) => (
                <div className={`fc-card ${it.dir}`} key={it.name}>
                  <div className="fc-name">{it.name}</div>
                  <div className="fc-price">{it.price}</div>
                  <div className={`fc-dir ${it.dir}`}>{ETIQUETA_DIRECCION[it.dir]}</div>
                  <div className="fc-driver">{it.driver}</div>
                  <div style={{ fontSize: '.57rem', color: 'var(--muted)', fontStyle: 'italic', marginTop: '.1rem' }}>
                    {it.confianza} · 2–4 sem
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '.58rem', color: 'var(--muted)', marginTop: '.65rem', borderTop: '1px solid var(--border)', paddingTop: '.55rem' }}>
              <i className="fas fa-circle-info" style={{ color: 'var(--navy)', marginRight: 4 }} />
              <b>Perspectiva técnica VALL</b> · tendencias basadas en variación mensual y a 3 meses. No constituye recomendación de inversión.
            </div>

            <div className="ia-insight" style={{ marginTop: '1rem' }}>
              <i className="fas fa-robot" />
              <p>
                <b>ESTRATEGIA VALL-AI:</b>{' '}
                {!precios ? 'Cargando análisis de mercado…' : (() => {
                  const reales = [
                    precios.maiz_real && `Maíz $${precios.maiz}/bu`,
                    precios.wti_real && `WTI $${precios.wti}/bbl`,
                    precios.cobre_real && `Cobre $${precios.cobre}/lb`,
                  ].filter(Boolean);
                  const wti = num(precios.wti);
                  return `${reales.length ? `${reales.join(' · ')} · datos en tiempo real. ` : 'Datos de referencia. '}`
                    + `Presión de insumos IPI: ${ipi.score}/100 (${ipi.label.split('—')[0].trim()}). `
                    + `Flete est.: ${(num(precios.diesel) * 8.5).toFixed(0)} MXN/ton·100km. `
                    + (wti > 75 ? 'WTI sobre $75/bbl — revisar coberturas de combustible.'
                      : wti > 65 ? 'WTI en zona media: costo logístico moderado.'
                        : 'WTI bajo $65/bbl: ventana favorable para contratar fletes.');
                })()}
              </p>
            </div>
          </div>
        )}

        {/* ── Granos ────────────────────────────────────────────────────── */}
        {pestana === 'granos' && (
          <div>
            <section className="grain-hero">
              <div className="grain-hero-copy">
                <div className="grain-eyebrow"><span /> VALL Agro Intelligence · CME/CBOT</div>
                <h1>Granos &amp; Forrajes</h1>
                <p>Precios, presión de insumos y señales de abastecimiento para decisiones de compra, cobertura y formulación pecuaria.</p>
                <div className="grain-hero-meta">
                  <span><i className="fas fa-satellite-dish" /> Mercado activo</span>
                  <span><i className="fas fa-seedling" /> 4 cultivos monitoreados</span>
                  <span><i className="fas fa-clock" /> {hora ? `Actualizado ${hora}` : 'Actualizando…'}</span>
                </div>
              </div>
              <div className="grain-pressure-card">
                <small>Presión de granos</small>
                <strong>{granos ? `${granos.presion}/100` : '—'}</strong>
                <div><i style={{ width: `${granos?.presion ?? 0}%` }} /></div>
                <span>{granos?.etiquetaPresion || 'Calculando señal…'}</span>
              </div>
            </section>

            <div className="grain-kpi-grid">
              {[
                ['corn', 'fa-seedling', 'Maíz amarillo #2', precios?.maiz, precios?.maiz_pct, 'Energía de la ración'],
                ['soy', 'fa-leaf', 'Soja / pasta', precios?.soja, precios?.soja_pct, 'Proteína y aminoácidos'],
                ['wheat', 'fa-wheat-awn', 'Trigo CBOT', precios?.trigo, precios?.trigo_pct, 'Alimento y sustitución'],
                ['sorghum', 'fa-plant-wilt', 'Sorgo estimado', precios?.sorgo, null, 'Alternativa energética'],
              ].map(([cls, icono, titulo, precio, pct, nota]) => (
                <div className={`grain-kpi ${cls}`} key={cls}>
                  <span className="grain-kpi-icon"><i className={`fas ${icono}`} /></span>
                  <span>
                    <small>{titulo}</small>
                    <strong>
                      {precio != null ? `$${num(precio).toFixed(2)}` : '—'}
                      {pct != null && <em className={num(pct) >= 0 ? 'up' : 'down'}> {fmtPct(pct)}</em>}
                    </strong>
                    <i>{nota}</i>
                  </span>
                </div>
              ))}
              <div className="grain-kpi fx">
                <span className="grain-kpi-icon"><i className="fas fa-dollar-sign" /></span>
                <span><small>USD/MXN</small><strong>{mxnRate ? `$${num(mxnRate).toFixed(4)}` : '—'}</strong><i>Traslado a costo local</i></span>
              </div>
            </div>

            <div className="grain-reading">
              <span><i className="fas fa-wand-magic-sparkles" /></span>
              <div><small>Lectura ejecutiva VALL</small><p>{granos?.lectura || 'Procesando precios, spreads y exposición de alimento…'}</p></div>
            </div>

            <div className="grain-market-grid">
              <TarjetaGrafica
                panel="granos" titulo="Curva de precios" precios={precios || {}}
                ticker={tickers.granos} onTicker={(t) => setTickers((s) => ({ ...s, granos: t }))}
                rango={rangos.granos} onRango={(r) => setRangos((s) => ({ ...s, granos: r }))}
                modo={modos.granos} onModo={(m) => setModos((s) => ({ ...s, granos: m }))}
                listo={chartListo}
              />
              <PanelNoticias
                titulo="Noticias · Granos &amp; Forrajes" articulos={noticias.granos}
                filtros={[['all', 'Todos'], ['granos', 'Granos'], ['macro', 'Macro']]}
                filtro={filtroNoticias.granos}
                onFiltro={(f) => setFiltroNoticias((s) => ({ ...s, granos: f }))}
              />
            </div>

            <div className="grain-signal-grid">
              <Senal icono="fa-scale-balanced" titulo="Spread soja / maíz" valor={granos ? `${granos.spread.toFixed(2)}×` : '—'} nota={granos?.notaSpread || 'Relación del componente proteico frente al energético.'} />
              <Senal icono="fa-bowl-food" titulo="Ración pecuaria base" valor={granos ? `$${granos.canasta.toFixed(0)}/MT` : '—'} nota="Canasta indicativa: 60% maíz y 40% soja." />
              <Senal icono="fa-wave-square" titulo="Pulso de volatilidad" valor={granos?.volatilidad || '—'} nota={granos?.notaVolatilidad || 'Variación media mensual del complejo.'} />
              <Senal icono="fa-calendar-check" titulo="Fase estacional" valor={granos?.fase || '—'} nota={granos?.notaFase || 'Calendario agrícola del hemisferio norte.'} />
            </div>

            <section className="grain-panel grain-monitor-panel">
              <div className="grain-panel-head"><div><small>Mercado de referencia</small><h2>Monitor CME/CBOT y equivalencia local</h2></div><span>Precios indicativos</span></div>
              <div className="grain-table-scroll">
                <table className="cmt">
                  <thead><tr><th>Commodity</th><th>Precio</th><th>Var. mensual</th><th>3 meses</th><th>Señal</th><th>MXN/MT</th></tr></thead>
                  <tbody>
                    {cargando && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '1.5rem' }}>Cargando datos…</td></tr>}
                    {filasGranos.map((r) => {
                      const imp = impactoLabel(r.key, r.pct);
                      const mxnMT = precioMxnPorTonelada(r.price, mxnRate, r.unit);
                      return (
                        <tr key={r.key}>
                          <td><div className="cmt-name">{r.name}</div><div className="cmt-sub">{r.sub}</div></td>
                          <td><div className="cmt-price">${num(r.price).toFixed(2)}{r.unit}</div></td>
                          <td><Variacion pct={r.pct} /></td>
                          <td style={{ fontSize: '.65rem', color: r.pct3m != null ? (num(r.pct3m) > 0 ? 'var(--red)' : 'var(--green)') : 'var(--muted)' }}>
                            {r.pct3m != null ? `${num(r.pct3m) >= 0 ? '+' : ''}${num(r.pct3m).toFixed(1)}% 3M` : '—'}
                          </td>
                          <td><b style={{ color: imp.color, fontSize: '.65rem' }}>{imp.lbl}</b> <span style={{ color: 'var(--muted)', fontSize: '.6rem' }}>· {imp.nota}</span></td>
                          <td><div className="cmt-mxn">{mxnMT != null ? `$${mxnMT.toFixed(0)} MXN/MT` : '—'}</div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="ia-insight">
                <i className="fas fa-robot" />
                <span>
                  {precios
                    ? `Maíz ${num(precios.maiz) > 5 ? 'sobre $5/bu — costos de ración elevados, evaluar cobertura.' : 'en rango moderado.'} `
                      + `Soja $${precios.soja}/MT — proteína en ${num(precios.soja_pct) > 0 ? 'tendencia alcista' : 'corrección'}. `
                      + `Sorgo estimado $${precios.sorgo}/bu (maíz ×0.92).`
                    : 'Calculando análisis de granos…'}
                </span>
              </div>
            </section>
          </div>
        )}

        {/* ── Energéticos ───────────────────────────────────────────────── */}
        {pestana === 'energia' && (
          <div>
            <section className="energy-hero">
              <div className="grain-hero-copy">
                <div className="energy-eyebrow"><span /> VALL Energy Intelligence · NYMEX/ICE</div>
                <h1>Energéticos &amp; Logística</h1>
                <p>Petróleo, gas y combustibles conectados con el costo real de transporte, producción y cadena fría en México.</p>
                <div className="grain-hero-meta">
                  <span><i className="fas fa-satellite-dish" /> Mercado global</span>
                  <span><i className="fas fa-fire-flame-curved" /> 5 referencias monitoreadas</span>
                  <span><i className="fas fa-clock" /> {hora ? `Actualizado ${hora}` : 'Actualizando…'}</span>
                </div>
              </div>
              <div className="energy-pressure-card">
                <small>Presión logística</small>
                <strong>{energia ? `${energia.presion}/100` : '—'}</strong>
                <div><i style={{ width: `${energia?.presion ?? 0}%` }} /></div>
                <span>{energia?.etiquetaPresion || 'Calculando transmisión a costos…'}</span>
              </div>
            </section>

            <div className="grain-kpi-grid energy-kpi-grid">
              {[
                ['energy-wti', 'fa-oil-well', 'Petróleo WTI', precios?.wti, precios?.wti_pct, 2, 'Referencia de Norteamérica'],
                ['energy-gas', 'fa-fire-flame-curved', 'Gas natural', precios?.gasnat, precios?.gasnat_pct, 3, 'Henry Hub · calefacción e industria'],
                ['energy-diesel', 'fa-gas-pump', 'Diesel ULSD estimado', precios?.diesel, precios?.diesel_pct, 2, 'Combustible agrícola y transporte'],
              ].map(([cls, icono, titulo, precio, pct, dec, nota]) => (
                <div className={`grain-kpi ${cls}`} key={cls}>
                  <span className="grain-kpi-icon"><i className={`fas ${icono}`} /></span>
                  <span>
                    <small>{titulo}</small>
                    <strong>
                      {precio != null ? `$${num(precio).toFixed(dec)}` : '—'}
                      {pct != null && <em className={num(pct) >= 0 ? 'up' : 'down'}> {fmtPct(pct)}</em>}
                    </strong>
                    <i>{nota}</i>
                  </span>
                </div>
              ))}
              <div className="grain-kpi energy-freight">
                <span className="grain-kpi-icon"><i className="fas fa-truck-fast" /></span>
                <span><small>Flete México</small><strong>{energia ? `~${energia.flete.toFixed(0)} MXN` : '—'}</strong><i>Tonelada por cada 100 km</i></span>
              </div>
              <div className="grain-kpi energy-fx">
                <span className="grain-kpi-icon"><i className="fas fa-dollar-sign" /></span>
                <span><small>USD/MXN</small><strong>{mxnRate ? `$${num(mxnRate).toFixed(4)}` : '—'}</strong><i>Traslado del costo importado</i></span>
              </div>
            </div>

            <div className="grain-reading energy-reading">
              <span><i className="fas fa-bolt" /></span>
              <div><small>Lectura ejecutiva VALL</small><p>{energia?.lectura || 'Procesando petróleo, gas, combustibles y exposición logística…'}</p></div>
            </div>

            <div className="grain-market-grid">
              <TarjetaGrafica
                panel="energia" titulo="Curva energética global" precios={precios || {}}
                ticker={tickers.energia} onTicker={(t) => setTickers((s) => ({ ...s, energia: t }))}
                rango={rangos.energia} onRango={(r) => setRangos((s) => ({ ...s, energia: r }))}
                modo={modos.energia} onModo={(m) => setModos((s) => ({ ...s, energia: m }))}
                listo={chartListo}
              />
              <PanelNoticias
                titulo="Noticias · Energéticos" articulos={noticias.energia}
                filtros={[['all', 'Todos'], ['energia', 'Energía'], ['macro', 'Macro'], ['divisas', 'Divisas']]}
                filtro={filtroNoticias.energia}
                onFiltro={(f) => setFiltroNoticias((s) => ({ ...s, energia: f }))}
              />
            </div>

            <div className="grain-signal-grid">
              <Senal icono="fa-truck-fast" titulo="Presión de flete" valor={energia ? `~$${energia.flete.toFixed(0)} MXN` : '—'} nota={energia?.notaFlete || 'Transmisión del diesel al transporte terrestre.'} />
              <Senal icono="fa-industry" titulo="Canasta operativa" valor={energia ? `$${energia.canasta.toFixed(0)}/día` : '—'} nota="Diesel 70% y gas natural 30% para operación indicativa." />
              <Senal icono="fa-wave-square" titulo="Pulso de volatilidad" valor={energia?.volatilidad || '—'} nota={energia?.notaVolatilidad || 'Movimiento mensual del complejo energético.'} />
              <Senal icono="fa-route" titulo="Riesgo de transmisión" valor={energia?.transmision || '—'} nota={energia?.notaTransmision || 'Probabilidad de presión sobre costos productivos.'} />
            </div>

            {escenario && resultado && (
              <section className="energy-scenario-panel">
                <div className="grain-panel-head">
                  <div><small>Simulador</small><h2>Escenario energético</h2></div>
                  <div className="energy-scenario-presets">
                    {[['relief', 'Alivio'], ['actual', 'Actual'], ['stress', 'Estrés']].map(([id, txt]) => (
                      <button key={id} type="button" className={presetEscenario === id ? 'active' : ''} onClick={() => aplicarPreset(id)}>{txt}</button>
                    ))}
                  </div>
                </div>
                <div className="energy-scenario-grid">
                  {[
                    ['wti', 'WTI (USD/bbl)', 35, 150, 1],
                    ['gas', 'Gas natural (USD/MMBtu)', 1, 12, 0.1],
                    ['fx', 'USD/MXN', 14, 26, 0.1],
                  ].map(([campo, etiqueta, min, max, paso]) => (
                    <label key={campo}>
                      <span>{etiqueta}</span>
                      <input
                        type="range" min={min} max={max} step={paso}
                        value={escenario[campo]}
                        onChange={(e) => { setPresetEscenario(''); setEscenario((s) => ({ ...s, [campo]: parseFloat(e.target.value) })); }}
                      />
                      <b>{escenario[campo].toFixed(campo === 'wti' ? 0 : 1)}</b>
                    </label>
                  ))}
                </div>
                <div className="energy-scenario-out">
                  <div><small>Diesel estimado</small><strong>${resultado.diesel.toFixed(2)}/gal</strong></div>
                  <div><small>Flete</small><strong>~${resultado.flete.toFixed(0)} MXN/ton·100km</strong></div>
                  <div><small>Operación diaria</small><strong>${mxnFmt(resultado.operacionMxn)} MXN</strong></div>
                </div>
              </section>
            )}

            <section className="grain-panel energy-monitor-panel">
              <div className="grain-panel-head"><div><small>Mercado de referencia</small><h2>Monitor NYMEX y equivalencia local</h2></div><span>Precios indicativos</span></div>
              <div className="grain-table-scroll">
                <table className="cmt">
                  <thead><tr><th>Commodity</th><th>Precio</th><th>Var. mensual</th><th>Señal</th><th>MXN</th></tr></thead>
                  <tbody>
                    {cargando && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: '1.5rem' }}>Cargando datos…</td></tr>}
                    {filasEnergia.map((r) => {
                      const imp = impactoLabel(r.key, r.pct);
                      return (
                        <tr key={r.key}>
                          <td><div className="cmt-name">{r.name}</div><div className="cmt-sub">{r.sub}</div></td>
                          <td><div className="cmt-price">${num(r.price).toFixed(r.dec)}{r.unit}</div></td>
                          <td><Variacion pct={r.pct} /></td>
                          <td><b style={{ color: imp.color, fontSize: '.65rem' }}>{imp.lbl}</b></td>
                          <td><div className="cmt-mxn">{mxnRate ? `$${(num(r.price) * num(mxnRate)).toFixed(2)} MXN${r.unit}` : '—'}</div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="ia-insight">
                <i className="fas fa-robot" />
                <span>
                  {precios
                    ? `WTI $${precios.wti}/bbl · Diesel estimado $${precios.diesel}/gal → flete ~${(num(precios.diesel) * 8.5).toFixed(0)} MXN/ton·100km. `
                      + (num(precios.wti) > 75 ? 'Presión alta en logística — revisar coberturas de combustible.' : 'Energéticos en zona moderada.')
                    : 'Calculando análisis energético…'}
                </span>
              </div>
            </section>
          </div>
        )}

        {/* ── Metales ───────────────────────────────────────────────────── */}
        {pestana === 'metales' && (
          <div>
            <section className="metal-hero">
              <div className="grain-hero-copy">
                <div className="grain-eyebrow"><span /> VALL Metals Intelligence · LME/COMEX</div>
                <h1>Metales Industriales</h1>
                <p>Cobre y aluminio como termómetro del ciclo industrial y del costo de infraestructura y equipamiento.</p>
                <div className="grain-hero-meta">
                  <span><i className="fas fa-satellite-dish" /> Mercado global</span>
                  <span><i className="fas fa-clock" /> {hora ? `Actualizado ${hora}` : 'Actualizando…'}</span>
                </div>
              </div>
              <div className="grain-pressure-card">
                <small>Ciclo industrial</small>
                <strong>{metales ? `${metales.score}/100` : '—'}</strong>
                <div><i style={{ width: `${metales?.score ?? 0}%` }} /></div>
                <span>{metales?.etiquetaCiclo || 'Calculando impulso…'}</span>
              </div>
            </section>

            <div className="grain-kpi-grid">
              {[
                ['fa-bolt', 'Cobre Grado A', precios?.cobre, precios?.cobre_pct, 2, '/lb', 'Anticipa el ciclo global'],
                ['fa-layer-group', 'Aluminio primario', precios?.aluminio, precios?.aluminio_pct, 0, '/MT', 'Energía y transformación'],
              ].map(([icono, titulo, precio, pct, dec, unidad, nota]) => (
                <div className="grain-kpi" key={titulo}>
                  <span className="grain-kpi-icon"><i className={`fas ${icono}`} /></span>
                  <span>
                    <small>{titulo}</small>
                    <strong>
                      {precio != null ? `$${num(precio).toFixed(dec)}${unidad}` : '—'}
                      {pct != null && <em className={num(pct) >= 0 ? 'up' : 'down'}> {fmtPct(pct)}</em>}
                    </strong>
                    <i>{nota}</i>
                  </span>
                </div>
              ))}
              <div className="grain-kpi fx">
                <span className="grain-kpi-icon"><i className="fas fa-dollar-sign" /></span>
                <span><small>USD/MXN</small><strong>{mxnRate ? `$${num(mxnRate).toFixed(4)}` : '—'}</strong><i>Presión {metales?.presionFx || '—'}</i></span>
              </div>
            </div>

            <div className="grain-reading">
              <span><i className="fas fa-industry" /></span>
              <div><small>Lectura ejecutiva VALL</small><p>{metales?.lectura || 'Procesando cobre, aluminio y ciclo industrial…'}</p></div>
            </div>

            <div className="grain-market-grid">
              <TarjetaGrafica
                panel="metales" titulo="Curva de metales" precios={precios || {}}
                ticker={tickers.metales} onTicker={(t) => setTickers((s) => ({ ...s, metales: t }))}
                rango={rangos.metales} onRango={(r) => setRangos((s) => ({ ...s, metales: r }))}
                modo={modos.metales} onModo={(m) => setModos((s) => ({ ...s, metales: m }))}
                listo={chartListo}
              />
              <section className="news-side-panel grain-news-card">
                <div className="news-side-hdr"><span><i className="fas fa-gauge-high" /> Señales del complejo</span></div>
                <div className="news-scroll-viewport"><div className="news-scroll-inner">
                  {[
                    ['Amplitud', metales?.amplitud, metales?.notaAmplitud],
                    ['Volatilidad', metales?.volatilidad, metales?.notaVolatilidad],
                    ['Demanda', metales?.demanda, metales?.notaDemanda],
                    ['Riesgo CAPEX', metales?.riesgoCapex, metales?.notaCapex],
                    ['Ratio cobre/aluminio', metales ? `${metales.ratio.toFixed(2)}×` : '—', 'Cobre convertido a tonelada (×2204.62 lb).'],
                  ].map(([lbl, val, nota]) => (
                    <div className="news-item news-brief" key={lbl}>
                      <div className="news-meta-row"><span className="news-cat">{lbl}</span></div>
                      <div className="news-title">{val || '—'}</div>
                      <div className="news-brief-desc">{nota || ''}</div>
                    </div>
                  ))}
                </div></div>
              </section>
            </div>

            {presupuestoCalc && (
              <section className="metal-budget-panel">
                <div className="grain-panel-head">
                  <div><small>Simulador</small><h2>Presupuesto de compra</h2></div>
                  <div className="metal-budget-presets">
                    {[['light', 'Ligero'], ['medium', 'Medio'], ['intensive', 'Intensivo']].map(([id, txt]) => (
                      <button key={id} type="button" className={presetPresupuesto === id ? 'active' : ''} onClick={() => aplicarPresetPresupuesto(id)}>{txt}</button>
                    ))}
                  </div>
                </div>
                <div className="energy-scenario-grid">
                  {[
                    ['cobreT', 'Cobre (toneladas)', 0, 50, 1],
                    ['aluminioT', 'Aluminio (toneladas)', 0, 200, 1],
                    ['fx', 'USD/MXN', 14, 26, 0.1],
                  ].map(([campo, etiqueta, min, max, paso]) => (
                    <label key={campo}>
                      <span>{etiqueta}</span>
                      <input
                        type="range" min={min} max={max} step={paso}
                        value={presupuesto[campo]}
                        onChange={(e) => cambiarPresupuesto(campo, parseFloat(e.target.value))}
                      />
                      <b>{campo === 'fx' ? `$${presupuesto.fx.toFixed(1)}` : `${presupuesto[campo]} t`}</b>
                    </label>
                  ))}
                </div>
                <div className="energy-scenario-out">
                  <div><small>Total USD</small><strong>${mxnFmt(presupuestoCalc.usd)}</strong></div>
                  <div><small>Total MXN</small><strong>${mxnFmt(presupuestoCalc.mxn)}</strong></div>
                  <div><small>Escenario +10%</small><strong>${mxnFmt(presupuestoCalc.estres)}</strong></div>
                  <div><small>Reparto</small><strong>{presupuestoCalc.parteCobre.toFixed(0)}% cobre · {presupuestoCalc.parteAluminio.toFixed(0)}% aluminio</strong></div>
                </div>
                <div className="ia-insight"><i className="fas fa-robot" /><span>{presupuestoCalc.resumenSuministro}</span></div>
              </section>
            )}

            <section className="grain-panel">
              <div className="grain-panel-head"><div><small>Mercado de referencia</small><h2>Monitor LME/COMEX</h2></div><span>Precios indicativos</span></div>
              <div className="grain-table-scroll">
                <table className="cmt">
                  <thead><tr><th>Metal</th><th>Precio</th><th>Var. mensual</th><th>Señal</th><th>MXN/MT</th></tr></thead>
                  <tbody>
                    {cargando && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: '1.5rem' }}>Cargando datos…</td></tr>}
                    {filasMetales.map((r) => {
                      const imp = impactoLabel(r.key, r.pct);
                      return (
                        <tr key={r.key}>
                          <td><div className="cmt-name">{r.name}</div><div className="cmt-sub">{r.sub}</div></td>
                          <td><div className="cmt-price">${num(r.price).toFixed(r.dec)}{r.unit}</div></td>
                          <td><Variacion pct={r.pct} /></td>
                          <td><b style={{ color: imp.color, fontSize: '.65rem' }}>{imp.lbl}</b> <span style={{ color: 'var(--muted)', fontSize: '.6rem' }}>· {imp.nota}</span></td>
                          <td><div className="cmt-mxn">{mxnRate ? `$${mxnFmt(num(r.price) * num(mxnRate) * r.factor)} MXN/MT` : '—'}</div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="ia-insight"><i className="fas fa-robot" /><span>{metales?.callout || 'Calculando análisis de metales…'}</span></div>
            </section>
          </div>
        )}

        {/* ── Proteínas ─────────────────────────────────────────────────── */}
        {pestana === 'proteinas' && (
          <div>
            <section className="protein-hero">
              <div className="grain-hero-copy">
                <div className="grain-eyebrow"><span /> VALL Protein Intelligence</div>
                <h1>Mercado de Proteínas</h1>
                <p>Precios internacionales, costo de alimentación y margen estimado por especie para la industria pecuaria mexicana.</p>
                <div className="grain-hero-meta">
                  <span><i className="fas fa-satellite-dish" /> CME · referencia global</span>
                  <span><i className="fas fa-clock" /> {hora ? `Actualizado ${hora}` : 'Actualizando…'}</span>
                </div>
              </div>
              <div className="grain-pressure-card">
                <small>Presión de alimento</small>
                <strong>{proteinas ? `${proteinas.presionAlimento}/100` : '—'}</strong>
                <div><i style={{ width: `${proteinas?.presionAlimento ?? 0}%` }} /></div>
                <span>{proteinas?.etiquetaAlimento || 'Calculando…'}</span>
              </div>
            </section>

            <div className="grain-kpi-grid">
              {['pork', 'chicken', 'beef'].map((k) => (
                <div className="grain-kpi" key={k}>
                  <span className="grain-kpi-icon"><i className="fas fa-drumstick-bite" /></span>
                  <span>
                    <small>{NOMBRE_ESPECIE[k]}</small>
                    <strong>
                      {proteinas ? `$${proteinas.precios[k].toFixed(2)}/kg` : '—'}
                      {proteinas && <em className={proteinas.variacion[k] >= 0 ? 'up' : 'down'}> {fmtPct(proteinas.variacion[k])}</em>}
                    </strong>
                    <i>{proteinas ? `${proteinas.economia[k].feedShare.toFixed(0)}% del costo es alimento` : ''}</i>
                  </span>
                </div>
              ))}
              <div className="grain-kpi fx">
                <span className="grain-kpi-icon"><i className="fas fa-dollar-sign" /></span>
                <span><small>USD/MXN</small><strong>{proteinas ? `$${proteinas.fx.toFixed(4)}` : '—'}</strong><i>Traslado del costo</i></span>
              </div>
            </div>

            <div className="grain-reading">
              <span><i className="fas fa-wand-magic-sparkles" /></span>
              <div><small>Lectura ejecutiva VALL</small><p>{proteinas?.lectura || 'Procesando precios y márgenes por especie…'}</p></div>
            </div>

            {proteinas && (
              <section className="grain-panel">
                <div className="grain-panel-head">
                  <div><small>Economía de producción</small><h2>{proteinas.economia[especie].title}</h2></div>
                  <div className="protein-species-switch">
                    {['pork', 'chicken', 'beef'].map((k) => (
                      <button key={k} type="button" data-species={k} className={especie === k ? 'active' : ''} onClick={() => setEspecie(k)}>
                        {NOMBRE_ESPECIE[k]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="energy-scenario-out">
                  <div><small>Precio</small><strong>${proteinas.economia[especie].price.toFixed(2)}/kg</strong></div>
                  <div><small>Costo de alimento</small><strong>${proteinas.economia[especie].feedCost.toFixed(2)}/kg</strong></div>
                  <div><small>Costo total</small><strong>${proteinas.economia[especie].totalCost.toFixed(2)}/kg</strong></div>
                  <div>
                    <small>Margen</small>
                    <strong style={{ color: proteinas.economia[especie].margin >= 0 ? '#087664' : '#b4235a' }}>
                      {proteinas.economia[especie].margin >= 0 ? '+' : ''}${proteinas.economia[especie].margin.toFixed(2)}/kg
                    </strong>
                  </div>
                  <div><small>Conversión (FCR)</small><strong>{proteinas.economia[especie].fcr}</strong></div>
                </div>
                <div className="ia-insight"><i className="fas fa-robot" /><span>{proteinas.economia[especie].note}</span></div>
              </section>
            )}

            <div className="grain-signal-grid">
              <Senal icono="fa-scale-balanced" titulo="Ratio cerdo / pollo" valor={proteinas ? `${proteinas.ratioCerdoPollo.toFixed(2)}×` : '—'} nota="Competitividad relativa entre ambas proteínas." />
              <Senal icono="fa-scale-unbalanced" titulo="Ratio res / cerdo" valor={proteinas ? `${proteinas.ratioResCerdo.toFixed(2)}×` : '—'} nota="Diferencial de precio entre res y cerdo." />
              <Senal icono="fa-trophy" titulo="Mejor margen" valor={proteinas ? NOMBRE_ESPECIE[proteinas.mejorMargen] : '—'} nota="Especie con el margen estimado más alto." />
              <Senal icono="fa-bolt" titulo="Más eficiente" valor={proteinas ? NOMBRE_ESPECIE[proteinas.masEficiente] : '—'} nota={proteinas?.lecturaEficiencia || 'Menor conversión alimenticia.'} />
            </div>
          </div>
        )}
      </div>

      <Footer />
    </>
  );
}
