import { useEffect, useMemo, useRef, useState } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import ModuleEntryCards from '../components/ModuleEntryCards.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import { DARK_PILOT, ESQUELETO } from '../lib/hojasComunes.js';
import {
  GRAIN_SOURCE,
  MINING_SOURCE,
  STATE_GRAIN_PRODUCTION,
  STATE_MINING_PRODUCTION,
} from '../lib/mexico-state-production.js';
import './Mexico.css';

const HOJAS_BASE = [
  ...ESQUELETO,
  DARK_PILOT,
];
const MODULOS = [
  {
    id: 'bolsa', icon: 'fa-chart-line', tone: 'cyan', badge: 'BMV',
    title: 'Bolsa México', eyebrow: 'Emisoras y cierre de mercado',
    category: 'Mercado bursátil nacional',
    description: 'Acciones mexicanas e histórico del IPC para leer la sesión con contexto.',
    action: 'Explorar Bolsa México',
    image: '/assets/img/bolsa-mexico-centro-bursatil.jpg',
  },
  {
    id: 'mercados', icon: 'fa-wheat-awn', tone: 'mint', badge: 'MERCADOS',
    title: 'México Productivo', eyebrow: 'Granos, energía y proteínas',
    category: 'Economía productiva',
    description: 'Precios físicos pecuarios por estado, granos y metales con contexto mexicano.',
    action: 'Ver mercado productivo',
    image: '/assets/img/mexico-productivo-campo.jpg',
  },
];

const TARJETAS = MODULOS.map(module => ({
  id: module.id, titulo: module.title, sub: module.eyebrow,
  icono: module.icon, foto: module.image, badge: module.badge,
  categoria: module.category, intro: module.description, cta: module.action,
}));

const FALLBACK = { bmv: [], rates: null, ipc: [], fx: [], macro: [], inflation: null, inputs: [], metals: [], firstSale: null, asOf: '', errors: [] };
const IPC_RANGES = [
  // Misma matriz de granularidad usada por Finanzas: Yahoo recibe una ventana y
  // una frecuencia; los dos accesos intradía se recortan a su duración real.
  { id: '15m', label: '15 min', longLabel: '15 minutos', interval: '1m', range: '1d', trim: 15, intraday: true },
  { id: '1h', label: '1 hora', longLabel: '1 hora', interval: '1m', range: '1d', trim: 60, intraday: true },
  { id: '1y', label: '1 año', longLabel: '1 año', interval: '1d', range: '1y' },
  { id: '3y', label: '3 años', longLabel: '3 años', interval: '1wk', range: '3y' },
  { id: '5y', label: '5 años', longLabel: '5 años', interval: '1wk', range: '5y' },
  { id: '10y', label: '10 años', longLabel: '10 años', interval: '1mo', range: '10y' },
  { id: '20y', label: '20 años', longLabel: '20 años', interval: '1mo', range: '20y', trim: 240 },
];
const BMV_PROFILES = {
  AMXL: { ticker: 'AMXL.MX', sector: 'Telecomunicaciones', icon: 'fa-tower-cell' },
  GRUMA: { ticker: 'GRUMAB.MX', sector: 'Consumo básico', icon: 'fa-wheat-awn' },
  BIMBO: { ticker: 'BIMBOA.MX', sector: 'Consumo básico', icon: 'fa-bread-slice' },
  FEMSA: { ticker: 'FEMSAUBD.MX', sector: 'Consumo básico', icon: 'fa-bottle-water' },
  WALMEX: { ticker: 'WALMEX.MX', sector: 'Consumo básico', icon: 'fa-store' },
  CEMEX: { ticker: 'CEMEXCPO.MX', sector: 'Materiales', icon: 'fa-cubes-stacked' },
  GMEXICO: { ticker: 'GMEXICOB.MX', sector: 'Materiales', icon: 'fa-industry' },
  GFNORTE: { ticker: 'GFNORTEO.MX', sector: 'Financiero', icon: 'fa-building-columns' },
  KOF: { ticker: 'KOFUBL.MX', sector: 'Consumo básico', icon: 'fa-glass-water' },
  AC: { ticker: 'AC.MX', sector: 'Consumo básico', icon: 'fa-cart-shopping' },
  GAP: { ticker: 'GAPB.MX', sector: 'Transporte', icon: 'fa-plane' },
  ASUR: { ticker: 'ASURB.MX', sector: 'Transporte', icon: 'fa-plane-departure' },
  TELEVISA: { ticker: 'TLEVISACPO.MX', sector: 'Comunicación', icon: 'fa-satellite-dish' },
  BOLSA: { ticker: 'BOLSAA.MX', sector: 'Financiero', icon: 'fa-chart-column' },
};

// Cartograma estatal: respeta la vecindad y la silueta alargada de México sin
// fingir precisión territorial. Cada ficha conserva la clave oficial que
// devuelve SNIIM, por lo que un precio sólo aparece si existe observación.
const MEXICO_TILES = [
  ['BCN', 'BC', 'Baja California', 1, 1], ['SON', 'SON', 'Sonora', 3, 1], ['CHH', 'CHH', 'Chihuahua', 4, 1], ['COA', 'COAH', 'Coahuila', 5, 1], ['NLE', 'NL', 'Nuevo León', 6, 1], ['TAM', 'TAMPS', 'Tamaulipas', 7, 1],
  ['BCS', 'BCS', 'Baja California Sur', 2, 2], ['SIN', 'SIN', 'Sinaloa', 3, 2], ['DUR', 'DGO', 'Durango', 4, 2], ['ZAC', 'ZAC', 'Zacatecas', 5, 2], ['SLP', 'SLP', 'San Luis Potosí', 6, 2],
  ['NAY', 'NAY', 'Nayarit', 3, 3], ['JAL', 'JAL', 'Jalisco', 4, 3], ['AGS', 'AGS', 'Aguascalientes', 5, 3], ['GUA', 'GTO', 'Guanajuato', 6, 3], ['QUE', 'QRO', 'Querétaro', 7, 3], ['HID', 'HGO', 'Hidalgo', 8, 3], ['VER', 'VER', 'Veracruz', 9, 3],
  ['COL', 'COL', 'Colima', 3, 4], ['MIC', 'MICH', 'Michoacán', 5, 4], ['MEX', 'EDOMEX', 'Estado de México', 6, 4], ['CMX', 'CDMX', 'Ciudad de México', 7, 4], ['TLA', 'TLAX', 'Tlaxcala', 8, 4], ['PUE', 'PUE', 'Puebla', 9, 4],
  ['GRO', 'GRO', 'Guerrero', 6, 5], ['MOR', 'MOR', 'Morelos', 7, 5], ['OAX', 'OAX', 'Oaxaca', 9, 5], ['CHP', 'CHIS', 'Chiapas', 10, 5], ['TAB', 'TAB', 'Tabasco', 11, 5],
  ['CAM', 'CAMP', 'Campeche', 11, 6], ['YUC', 'YUC', 'Yucatán', 12, 6], ['ROO', 'QROO', 'Quintana Roo', 13, 6],
].map(([code, short, name, column, row]) => ({ code, short, name, column, row }));

const LIVESTOCK_PRODUCTS = [
  { id: 'pork', label: 'Cerdo vivo', icon: 'fa-bacon' },
  { id: 'beef', label: 'Bovino vivo', icon: 'fa-cow' },
  { id: 'chicken', label: 'Pollo mayoreo', icon: 'fa-drumstick-bite' },
  { id: 'egg', label: 'Huevo blanco', icon: 'fa-egg' },
];

function fmtNumber(value, options = {}) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('es-MX', { maximumFractionDigits: 2, ...options })
    : '—';
}

function fmtPct(value) {
  if (value == null || value === '') return 'Sin variación';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Sin variación';
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function hasNumber(value) {
  return value != null && value !== '' && Number.isFinite(Number(value));
}

function shortDate(value) {
  if (!value) return '';
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return '';
  const isIntraday = typeof value === 'number' || String(value).length > 10;
  return isIntraday
    ? date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: String(value).slice(0, 4) !== String(new Date().getFullYear()) ? '2-digit' : undefined });
}

function quotePeriod(quote, fallbackDate) {
  const value = quote?.date || fallbackDate;
  if (!value) return 'Último corte';
  if (quote?.cadence === 'monthly') {
    const date = new Date(`${String(value).slice(0, 7)}-15T12:00:00`);
    return `Mensual · ${date.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })}`;
  }
  if (quote?.cadence === 'weekly-ai') return `Semanal IA · ${shortDate(value)}`;
  if (quote?.cadence === 'weekly-source') return `Semanal · ${shortDate(value)}`;
  if (quote?.cadence === 'weekly') return `Semanal · ${shortDate(value)}`;
  return `Diario · ${shortDate(value)}`;
}

async function readJson(url, signal) {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store', signal });
  if (!response.ok) throw new Error(`${url} · HTTP ${response.status}`);
  return response.json();
}

async function readHistory(ticker, config, signal) {
  const buildUrl = range => `/api/stock-history?${new URLSearchParams({ ticker, interval: config.interval, range }).toString()}`;
  try {
    return await readJson(buildUrl(config.range), signal);
  } catch (error) {
    // La API nueva entiende 20y con period1/period2. Mientras una instancia
    // anterior del servidor termina de reiniciarse, max mensual permite ofrecer
    // la misma ventana sin inventar velas ni degradar silenciosamente el filtro.
    if (config.id !== '20y') throw error;
    return readJson(buildUrl('max'), signal);
  }
}

function historyPoints(payload, limit) {
  const points = (payload?.candles || [])
    .map(point => ({ date: point.time, close: Number(point.close) }))
    .filter(point => Number.isFinite(point.close));
  return limit ? points.slice(-limit) : points;
}

function banxicoLatest(payload) {
  const point = payload?.bmx?.series?.[0]?.datos?.[0];
  const value = Number(String(point?.dato ?? '').replace(/,/g, ''));
  return Number.isFinite(value) ? { value, period: point?.fecha || '' } : null;
}

function historyInput(id, label, payload, unit, icon) {
  const points = historyPoints(payload);
  const last = points.at(-1);
  const previous = points.at(-2);
  const change = last && previous && previous.close !== 0 ? ((last.close - previous.close) / previous.close) * 100 : null;
  return last ? { id, label, price: last.close, change, unit, icon, date: last.date, source: 'Yahoo Finance' } : null;
}

function quoteInput(id, label, item, unit, icon, date) {
  const price = Number(item?.price);
  if (!Number.isFinite(price)) return null;
  return { id, label, price, change: Number(item.change_pct), unit, icon, date, source: 'Yahoo Finance' };
}





function annualizedVolatility(points, periodsPerYear = 252) {
  if (points.length < 3) return null;
  const returns = points.slice(1).map((point, index) => Math.log(point.close / points[index].close)).filter(Number.isFinite);
  if (returns.length < 2) return null;

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear) * 100;
}



function windowVolatility(points) {
  if (points.length < 3) return null;
  const returns = points.slice(1).map((point, index) => Math.log(point.close / points[index].close)).filter(Number.isFinite);
  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (returns.length - 1);
  return Math.sqrt(variance) * 100;
}

function LineChart({ points, label, unit = 'puntos', tone = 'cyan' }) {
  if (points.length < 2) return <div className="mxh-chart-empty"><i className="fas fa-chart-line" /> Esperando una serie verificable.</div>;
  const values = points.map(point => point.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || Math.max(Math.abs(max) * 0.02, 1);
  const bottom = min - spread * 0.12;
  const top = max + spread * 0.12;
  const width = 720; const height = 240; const pad = { left: 50, right: 16, top: 18, bottom: 34 };
  const x = index => pad.left + (index / Math.max(1, points.length - 1)) * (width - pad.left - pad.right);
  const y = value => pad.top + (1 - ((value - bottom) / (top - bottom))) * (height - pad.top - pad.bottom);
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(1)} ${y(point.close).toFixed(1)}`).join(' ');
  const ticks = [0, Math.round((points.length - 1) / 2), points.length - 1];
  return <figure className={`mxh-line-chart tone-${tone}`}>
    <figcaption><span>{label}</span><small>{unit}</small></figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}, serie histórica de ${points.length} observaciones`}>
      {[0, .5, 1].map(position => {
        const value = top - (top - bottom) * position;
        const yy = y(value);
        return <g key={position}><line x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} /><text x={pad.left - 8} y={yy + 4} textAnchor="end">{fmtNumber(value)}</text></g>;
      })}
      <path d={path} />
      {ticks.map(index => <text key={index} x={x(index)} y={height - 10} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>{shortDate(points[index]?.date)}</text>)}
    </svg>
  </figure>;
}

function useCompanyHistories(shares, range) {
  const source = useMemo(
    () => shares.map(share => ({ symbol: share.symbol, ticker: BMV_PROFILES[share.symbol]?.ticker })).filter(item => item.ticker),
    [shares],
  );
  const rangeConfig = useMemo(() => IPC_RANGES.find(option => option.id === range) || IPC_RANGES[2], [range]);
  const [state, setState] = useState({ series: {}, loading: false });
  useEffect(() => {
    if (!source.length) {
      setState({ series: {}, loading: false });
      return undefined;
    }
    let mounted = true;
    const controller = new AbortController();
    // No se conserva la ventana anterior: mostrar un retorno de 1 año bajo el
    // rótulo de 5 años sería más engañoso que esperar el nuevo histórico.
    setState({ series: {}, loading: true });
    Promise.allSettled(source.map(item => readHistory(item.ticker, rangeConfig, controller.signal)))
      .then(results => {
        if (!mounted) return;
        const series = {};
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') series[source[index].symbol] = historyPoints(result.value, rangeConfig.trim);
        });
        setState({ series, loading: false });
      })
      .catch(() => mounted && setState({ series: {}, loading: false }));
    return () => { mounted = false; controller.abort(); };
  }, [source, rangeConfig]);
  return state;
}

function seriesChange(points) {
  const first = points[0]?.close;
  const last = points.at(-1)?.close;
  return Number.isFinite(first) && Number.isFinite(last) && first !== 0 ? ((last - first) / first) * 100 : null;
}

function CompanySparkline({ points, change }) {
  if (points.length < 2) return <div className="mxh-company-spark is-empty"><i className="fas fa-chart-line" /> Sin serie</div>;
  const values = points.map(point => point.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || Math.max(Math.abs(max) * .02, 1);
  const width = 176; const height = 52; const pad = 4;
  const x = index => pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2);
  const y = value => height - pad - ((value - min) / spread) * (height - pad * 2);
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(1)} ${y(point.close).toFixed(1)}`).join(' ');
  return <svg className={`mxh-company-spark${change != null && change < 0 ? ' is-down' : ''}`} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><path d={path} /></svg>;
}

function CompanyCard({ share, points, selected, onSelect }) {
  const profile = BMV_PROFILES[share.symbol] || { sector: 'Emisora BMV', icon: 'fa-building' };
  const periodChange = seriesChange(points);
  const sessionChange = Number(share.change_pct);
  const isUp = Number.isFinite(sessionChange) && sessionChange >= 0;
  return <button className={`mxh-company-card${selected ? ' is-selected' : ''}`} type="button" onClick={onSelect} aria-pressed={selected}>
    <header><span><i className={`fas ${profile.icon}`} aria-hidden="true" /> {profile.sector}</span><b>{share.symbol}</b></header>
    <strong>{share.name}</strong>
    <div className="mxh-company-price"><span>${fmtNumber(share.price)} <small>MXN</small></span><em className={isUp ? 'is-up' : 'is-down'}>{fmtPct(sessionChange)}</em></div>
    <CompanySparkline points={points} change={periodChange} />
    <footer><span>{points.length ? `${points.length} cierres` : 'Serie pendiente'}</span><b className={periodChange == null ? '' : periodChange >= 0 ? 'is-up' : 'is-down'}>{periodChange == null ? '—' : `${fmtPct(periodChange)} periodo`}</b></footer>
  </button>;
}

function IndexedCompareChart({ benchmark, asset, assetLabel, loading }) {
  if (loading) return <div className="mxh-chart-empty"><i className="fas fa-circle-notch fa-spin" /> Preparando comparación verificable.</div>;
  if (benchmark.length < 2 || asset.length < 2) return <div className="mxh-chart-empty"><i className="fas fa-chart-line" /> La serie de esta emisora no está disponible para comparar.</div>;
  const toBase100 = points => {
    const base = points[0]?.close;
    return Number.isFinite(base) && base !== 0 ? points.map(point => ({ ...point, close: (point.close / base) * 100 })) : [];
  };
  const ipc = toBase100(benchmark);
  const issuer = toBase100(asset);
  const values = [...ipc, ...issuer].map(point => point.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const bottom = min - spread * .14;
  const top = max + spread * .14;
  const width = 720; const height = 230; const pad = { left: 44, right: 14, top: 18, bottom: 32 };
  const x = (index, length) => pad.left + (index / Math.max(1, length - 1)) * (width - pad.left - pad.right);
  const y = value => pad.top + (1 - ((value - bottom) / (top - bottom))) * (height - pad.top - pad.bottom);
  const path = points => points.map((point, index) => `${index ? 'L' : 'M'} ${x(index, points.length).toFixed(1)} ${y(point.close).toFixed(1)}`).join(' ');
  const ticks = [0, Math.round((ipc.length - 1) / 2), ipc.length - 1];
  return <figure className="mxh-compare-chart">
    <figcaption><span>Comparativa indexada</span><small>Base 100 · inicio de la ventana</small></figcaption>
    <div className="mxh-compare-legend"><span><i className="mxh-legend-ipc" />IPC</span><span><i className="mxh-legend-issuer" />{assetLabel}</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Comparativa indexada entre IPC y ${assetLabel}`}>
      {[0, .5, 1].map(position => { const value = top - (top - bottom) * position; const yy = y(value); return <g key={position}><line x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} /><text x={pad.left - 7} y={yy + 4} textAnchor="end">{fmtNumber(value)}</text></g>; })}
      <path className="mxh-ipc-path" d={path(ipc)} /><path className="mxh-issuer-path" d={path(issuer)} />
      {ticks.map(index => <text key={index} x={x(index, ipc.length)} y={height - 9} textAnchor={index === 0 ? 'start' : index === ipc.length - 1 ? 'end' : 'middle'}>{shortDate(ipc[index]?.date)}</text>)}
    </svg>
  </figure>;
}

function MetricCard({ label, value, detail, change, changeLabel, icon, tone = 'cyan' }) {
  const direction = Number(change);
  return <article className={`mxh-metric tone-${tone}`}>
    <span className="mxh-metric-icon"><i className={`fas ${icon}`} aria-hidden="true" /></span>
    <div><small>{label}</small><strong>{value}</strong><p className={Number.isFinite(direction) ? (direction >= 0 ? 'is-up' : 'is-down') : ''}>{changeLabel || (Number.isFinite(direction) ? fmtPct(direction) : detail)}</p></div>
  </article>;
}

function SourcePill({ children }) {
  return <span className="mxh-source"><i className="fas fa-shield-halved" aria-hidden="true" /> {children}</span>;
}



function MexicoLivestockTable({ firstSale }) {
  const [query, setQuery] = useState('');
  const products = useMemo(() => firstSale?.prices || {}, [firstSale?.prices]);
  const quoteMaps = useMemo(() => Object.fromEntries(LIVESTOCK_PRODUCTS.map(product => [
    product.id,
    new Map((Array.isArray(products[product.id]?.states) ? products[product.id].states : []).map(quote => [quote.stateCode, quote])),
  ])), [products]);
  const states = useMemo(() => [...MEXICO_TILES]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .filter(state => `${state.name} ${state.code === 'JAL' ? 'Guadalajara GDL' : ''}`.toLocaleLowerCase('es-MX').includes(query.trim().toLocaleLowerCase('es-MX')))
    .filter(state => LIVESTOCK_PRODUCTS.every(product => quoteMaps[product.id].has(state.code))), [query, quoteMaps]);
  const renderPrice = (state, product) => {
    const quote = quoteMaps[product.id].get(state.code);
    const meta = products[product.id];
    if (!quote) return <span className="mxh-table-no-data">Sin dato</span>;
    const period = quotePeriod(quote, meta?.date);
    const isAi = quote.cadence === 'weekly-ai';
    return <span className={`mxh-table-price ${quote.cadence === 'monthly' ? 'is-monthly' : ''} ${isAi ? 'is-ai' : ''}`} title={`${quote.source || meta?.source || 'Fuente conectada'} · ${period}`}><strong>${fmtNumber(quote.price)}</strong><small>{meta?.unit || 'MXN/kg'}</small><em>{period}</em>{isAi && <i>Respaldo Gemini</i>}</span>;
  };

  return <section className="mxh-livestock-board" aria-labelledby="mxh-livestock-title">
    <header className="mxh-livestock-head">
      <div><span><i className="fas fa-table-list" aria-hidden="true" /> Mercado físico nacional</span><h3 id="mxh-livestock-title">Estados con mercado pecuario completo</h3><p>Sólo aparecen entidades con precio disponible de cerdo, bovino, pollo y huevo. Las fuentes estructuradas tienen prioridad; Gemini se utiliza únicamente como respaldo verificable.</p></div>
      <div className="mxh-livestock-links"><a href="https://www.porcicultura.com/economia/precios-del-cerdo-en-pie-en-mexico" target="_blank" rel="noreferrer">Porcicultura.com <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" /></a><a href="https://www.economia-sniim.gob.mx/" target="_blank" rel="noreferrer">SNIIM <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" /></a></div>
    </header>
    <div className="mxh-livestock-products" aria-label="Cobertura y promedio nacional por producto">
      {LIVESTOCK_PRODUCTS.map(item => {
        const quote = products[item.id];
        return <article key={item.id}><i className={`fas ${item.icon}`} aria-hidden="true" /><span>{item.label}<small>{hasNumber(quote?.price) ? `$${fmtNumber(quote.price)} · promedio de la fuente` : 'Sin promedio nacional'}</small></span><b>{states.length} completos</b></article>;
      })}
    </div>
    <div className="mxh-livestock-table-tools"><label><i className="fas fa-magnifying-glass" aria-hidden="true" /><span className="sr-only">Buscar estado</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar estado" /></label><span>{states.length} estados con los 4 precios</span></div>
    <div className="mxh-livestock-table-wrap">
      <table className="mxh-livestock-table">
        <thead><tr><th>Estado</th>{LIVESTOCK_PRODUCTS.map(product => { const meta = products[product.id]; return <th key={product.id}><span><i className={`fas ${product.icon}`} aria-hidden="true" /> {product.label}</span><small>{states.length} estados completos · {shortDate(meta?.date) || 'corte semanal'}</small></th>; })}</tr></thead>
        <tbody>{states.map(state => <tr key={state.code}><th scope="row"><b>{state.code === 'JAL' ? 'GDL' : state.short}</b><span>{state.code === 'JAL' ? 'Guadalajara, Jalisco' : state.name}{state.code === 'JAL' && <small>Plaza Guadalajara · cerdo con referencia estatal</small>}</span></th>{LIVESTOCK_PRODUCTS.map(product => <td key={product.id}>{renderPrice(state, product)}</td>)}</tr>)}{!states.length && <tr><td className="mxh-table-empty" colSpan="5">No hay estados que coincidan con este filtro.</td></tr>}</tbody>
      </table>
    </div>
    <footer className="mxh-livestock-table-note"><i className="fas fa-circle-info" aria-hidden="true" /><span>Cerdo: Porcicultura.com. Bovino y pollo: SNIIM directo o publicado por Abasteros. Huevo: SNIIM. Los respaldos de Gemini requieren evidencia web y se identifican en la celda. El complemento semanal se renueva cada domingo a las 11:00, hora de Ciudad de México.</span></footer>
  </section>;
}

const STATE_CODES = new Map(MEXICO_TILES.map(state => [state.name, state.short]));

function stateCode(name) {
  return STATE_CODES.get(name) || (name === 'Estado de México' ? 'EDOMEX' : name.slice(0, 3).toLocaleUpperCase('es-MX'));
}

function StateBars({ rows, formatValue, unit, emptyMessage = 'Sin observaciones disponibles.' }) {
  const max = Math.max(...rows.map(row => Number(row.value) || 0), 0);
  if (!rows.length || max <= 0) return <p className="mxh-chart-no-data">{emptyMessage}</p>;
  return <div className="mxh-state-bars" role="img" aria-label={`Comparación de ${rows.length} estados en ${unit}`}>
    {rows.map(row => <div className="mxh-state-bar" key={row.code || row.label}>
      <span title={row.label}>{row.code || stateCode(row.label)}</span>
      <i><b style={{ width: `${Math.max((Number(row.value) / max) * 100, 1.2)}%` }} /></i>
      <strong>{formatValue(row.value)}</strong>
    </div>)}
  </div>;
}

function MarketStateCharts({ firstSale }) {
  const [protein, setProtein] = useState('pork');
  const [grain, setGrain] = useState('corn');
  const proteinMeta = LIVESTOCK_PRODUCTS.find(item => item.id === protein) || LIVESTOCK_PRODUCTS[0];
  const proteinProducts = useMemo(() => firstSale?.prices || {}, [firstSale?.prices]);
  const proteinMaps = useMemo(() => Object.fromEntries(LIVESTOCK_PRODUCTS.map(product => [
    product.id,
    new Map((Array.isArray(proteinProducts[product.id]?.states) ? proteinProducts[product.id].states : []).map(quote => [quote.stateCode, quote])),
  ])), [proteinProducts]);
  const completeStates = useMemo(() => MEXICO_TILES.filter(state => LIVESTOCK_PRODUCTS.every(product => proteinMaps[product.id].has(state.code))), [proteinMaps]);
  const proteinRows = useMemo(() => completeStates
    .map(state => ({ code: state.code === 'JAL' ? 'GDL' : state.short, label: state.name, value: Number(proteinMaps[protein].get(state.code)?.price) }))
    .filter(row => Number.isFinite(row.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8), [completeStates, protein, proteinMaps]);
  const grainOptions = [
    { id: 'corn', label: 'Maíz' }, { id: 'wheat', label: 'Trigo' },
    { id: 'sorghum', label: 'Sorgo' }, { id: 'soy', label: 'Soya' },
  ];
  const grainMeta = grainOptions.find(item => item.id === grain) || grainOptions[0];
  const grainRows = useMemo(() => STATE_GRAIN_PRODUCTION
    .filter(row => hasNumber(row[grain]))
    .map(row => ({ label: row.state, value: Number(row[grain]) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8), [grain]);
  const miningRows = useMemo(() => STATE_MINING_PRODUCTION.slice(0, 8).map(row => ({ label: row.state, value: row.value / 1_000_000 })), []);
  const compact = value => new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

  return <section className="mxh-state-charts" aria-labelledby="mxh-state-charts-title">
    <header><div><span><i className="fas fa-chart-bar" aria-hidden="true" /> Comparativo estatal</span><h3 id="mxh-state-charts-title">Los estados líderes, antes de entrar al detalle</h3><p>Las gráficas muestran los ocho valores más altos de cada conjunto. Las tablas inferiores conservan toda la cobertura disponible.</p></div><small>Precios, toneladas y valor no comparten escala</small></header>
    <div className="mxh-state-chart-grid">
      <article className="mxh-state-chart tone-protein">
        <header><div><small>Proteínas · precio estatal</small><h4>{proteinMeta.label}</h4></div><b>MXN/kg</b></header>
        <div className="mxh-chart-switches" aria-label="Producto pecuario">{LIVESTOCK_PRODUCTS.map(item => <button type="button" key={item.id} className={protein === item.id ? 'is-active' : ''} aria-pressed={protein === item.id} onClick={() => setProtein(item.id)}>{item.label.replace(/ vivo| mayoreo| blanco/g, '')}</button>)}</div>
        <StateBars rows={proteinRows} unit="pesos por kilogramo" formatValue={value => `$${fmtNumber(value)}`} emptyMessage="Los precios estatales se están actualizando." />
        <footer>Estados con los cuatro precios pecuarios disponibles.</footer>
      </article>
      <article className="mxh-state-chart tone-grain">
        <header><div><small>Granos · producción 2025</small><h4>{grainMeta.label} grano</h4></div><b>Toneladas</b></header>
        <div className="mxh-chart-switches" aria-label="Grano">{grainOptions.map(item => <button type="button" key={item.id} className={grain === item.id ? 'is-active' : ''} aria-pressed={grain === item.id} onClick={() => setGrain(item.id)}>{item.label}</button>)}</div>
        <StateBars rows={grainRows} unit="toneladas" formatValue={compact} />
        <footer>DGSIAP · cierre definitivo de producción agrícola.</footer>
      </article>
      <article className="mxh-state-chart tone-mining">
        <header><div><small>Minería · valor 2024</small><h4>Producción concesible</h4></div><b>Millones MXN</b></header>
        <div className="mxh-chart-context"><i className="fas fa-ranking-star" aria-hidden="true" /> Top 8 por valor estatal</div>
        <StateBars rows={miningRows} unit="millones de pesos" formatValue={value => `$${compact(value)} M`} />
        <footer>SGM · minerales metálicos y no metálicos concesibles.</footer>
      </article>
    </div>
  </section>;
}

function GrainStateTable() {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => STATE_GRAIN_PRODUCTION.filter(row => row.state.toLocaleLowerCase('es-MX').includes(query.trim().toLocaleLowerCase('es-MX'))), [query]);
  const crops = [
    { id: 'corn', label: 'Maíz grano', icon: 'fa-seedling' },
    { id: 'wheat', label: 'Trigo grano', icon: 'fa-wheat-awn' },
    { id: 'sorghum', label: 'Sorgo grano', icon: 'fa-leaf' },
    { id: 'soy', label: 'Soya', icon: 'fa-seedling' },
  ];
  const coverage = Object.fromEntries(crops.map(crop => [crop.id, STATE_GRAIN_PRODUCTION.filter(row => hasNumber(row[crop.id])).length]));
  return <section className="mxh-state-production tone-grain" aria-labelledby="mxh-grain-state-title">
    <header className="mxh-livestock-head">
      <div><span><i className="fas fa-wheat-awn" aria-hidden="true" /> Producción agrícola estatal</span><h3 id="mxh-grain-state-title">Granos producidos en cada estado</h3><p>Volumen definitivo del cierre agrícola 2025. Se agregan municipios, ciclos y modalidades para mostrar el total estatal sin duplicar observaciones.</p></div>
      <div className="mxh-livestock-links"><a href={GRAIN_SOURCE.url} target="_blank" rel="noreferrer">Datos abiertos DGSIAP <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" /></a></div>
    </header>
    <div className="mxh-state-summary">{crops.map(crop => <article key={crop.id}><i className={`fas ${crop.icon}`} aria-hidden="true" /><span>{crop.label}<small>{coverage[crop.id]} entidades con producción</small></span></article>)}</div>
    <div className="mxh-livestock-table-tools"><label><i className="fas fa-magnifying-glass" aria-hidden="true" /><span className="sr-only">Buscar estado en granos</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar estado" /></label><span>{rows.length} de 32 entidades · toneladas</span></div>
    <div className="mxh-livestock-table-wrap mxh-state-table-wrap">
      <table className="mxh-livestock-table mxh-state-data-table">
        <thead><tr><th>Estado</th>{crops.map(crop => <th key={crop.id}><span><i className={`fas ${crop.icon}`} aria-hidden="true" /> {crop.label}</span><small>Producción {GRAIN_SOURCE.period} · toneladas</small></th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.state}><th scope="row"><b>{stateCode(row.state)}</b><span>{row.state}</span></th>{crops.map(crop => <td key={crop.id}>{hasNumber(row[crop.id]) ? <span className="mxh-state-volume"><strong>{fmtNumber(row[crop.id])}</strong><small>toneladas</small></span> : <span className="mxh-table-no-data">Sin producción reportada</span>}</td>)}</tr>)}{!rows.length && <tr><td className="mxh-table-empty" colSpan="5">No hay estados que coincidan con este filtro.</td></tr>}</tbody>
      </table>
    </div>
    <footer className="mxh-livestock-table-note"><i className="fas fa-circle-info" aria-hidden="true" /><span>{GRAIN_SOURCE.label}. Actualización del archivo: {GRAIN_SOURCE.updated}. “Sin producción reportada” significa que el cultivo no aparece en el cierre estatal; no es una estimación de cero.</span></footer>
  </section>;
}

function MiningStateTable() {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => STATE_MINING_PRODUCTION.filter(row => `${row.state} ${row.minerals}`.toLocaleLowerCase('es-MX').includes(query.trim().toLocaleLowerCase('es-MX'))), [query]);
  return <section className="mxh-state-production tone-mining" aria-labelledby="mxh-mining-state-title">
    <header className="mxh-livestock-head">
      <div><span><i className="fas fa-gem" aria-hidden="true" /> Producción minera estatal</span><h3 id="mxh-mining-state-title">Valor y minerales producidos por estado</h3><p>Las 27 entidades con producción concesible reportada en 2024, ordenadas por su posición nacional. El valor está expresado en pesos corrientes.</p></div>
      <div className="mxh-livestock-links"><a href={MINING_SOURCE.url} target="_blank" rel="noreferrer">Anuario oficial SGM <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" /></a></div>
    </header>
    <div className="mxh-mining-highlights"><article><small>Entidades reportadas</small><strong>27</strong></article><article><small>Liderazgo nacional</small><strong>Sonora · 35.25%</strong></article><article><small>Valor nacional</small><strong>$681,363.7 millones</strong></article></div>
    <div className="mxh-livestock-table-tools"><label><i className="fas fa-magnifying-glass" aria-hidden="true" /><span className="sr-only">Buscar estado o mineral</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar estado o mineral" /></label><span>{rows.length} de 27 entidades productoras</span></div>
    <div className="mxh-livestock-table-wrap mxh-state-table-wrap">
      <table className="mxh-livestock-table mxh-state-data-table mxh-mining-table">
        <thead><tr><th>Estado</th><th><span><i className="fas fa-ranking-star" aria-hidden="true" /> Posición</span><small>Nacional · {MINING_SOURCE.period}</small></th><th><span><i className="fas fa-coins" aria-hidden="true" /> Valor estatal</span><small>Pesos corrientes</small></th><th><span><i className="fas fa-chart-pie" aria-hidden="true" /> Participación</span><small>Del valor nacional</small></th><th><span><i className="fas fa-cubes-stacked" aria-hidden="true" /> Minerales principales</span><small>Concesibles reportados</small></th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.state}><th scope="row"><b>{stateCode(row.state)}</b><span>{row.state}</span></th><td><span className="mxh-rank">#{row.rank}</span></td><td><span className="mxh-state-volume"><strong>${fmtNumber(row.value / 1_000_000)} M</strong><small>millones de pesos</small></span></td><td><span className="mxh-share"><strong>{row.share.toFixed(2)}%</strong><i style={{ '--share': `${Math.max(row.share, .35)}%` }} /></span></td><td><p className="mxh-mineral-list">{row.minerals}</p></td></tr>)}{!rows.length && <tr><td className="mxh-table-empty" colSpan="5">No hay estados o minerales que coincidan con este filtro.</td></tr>}</tbody>
      </table>
    </div>
    <footer className="mxh-livestock-table-note"><i className="fas fa-circle-info" aria-hidden="true" /><span>{MINING_SOURCE.label}, tabla 6.5; cifras proporcionadas por la Dirección General de Minas. El valor incluye minerales metálicos y no metálicos concesibles y no equivale a una cotización internacional.</span></footer>
  </section>;
}

function ProductiveMarketsPanel({ snapshot }) {
  return <section className="mxh-panel-view" aria-labelledby="mxh-productive-title">
    <header className="mxh-view-head">
      <div><span>02 · México Productivo</span><h2 id="mxh-productive-title">La producción mexicana, estado por estado.</h2><p>Precios físicos pecuarios, producción de granos y actividad minera estatal reunidos en gráficas y tablas verificables.</p></div>
      <SourcePill>SNIIM · Porcicultura.com · DGSIAP · SGM</SourcePill>
    </header>
    <MarketStateCharts firstSale={snapshot.firstSale} />
    <MexicoLivestockTable firstSale={snapshot.firstSale} />
    <GrainStateTable />
    <MiningStateTable />
    <div className="mxh-method-note"><i className="fas fa-circle-info" aria-hidden="true" /><p><b>Lectura responsable:</b> el cerdo en pie usa la referencia estatal de Porcicultura.com; bovino, pollo y huevo conservan el corte de SNIIM. Granos usa el cierre agrícola de DGSIAP y minería el anuario del SGM, siempre con su periodo visible.</p></div>
  </section>;
}

function BolsaPanel({ snapshot, range, onRangeChange }) {
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [quoteFilter, setQuoteFilter] = useState('all');
  const [quoteQuery, setQuoteQuery] = useState('');
  const [activeSector, setActiveSector] = useState('all');
  const shares = snapshot.bmv.filter(item => item.type === 'stock');
  const ipc = snapshot.ipc;
  const rangeConfig = IPC_RANGES.find(option => option.id === range) || IPC_RANGES[2];
  const rangeLabel = rangeConfig.longLabel;
  const last = ipc.at(-1)?.close;
  const first = ipc[0]?.close;
  const periodChange = Number.isFinite(last) && Number.isFinite(first) && first !== 0 ? ((last - first) / first) * 100 : null;
  const positive = shares.filter(item => Number(item.change_pct) >= 0).length;
  const high = ipc.reduce((best, point) => !best || point.close > best.close ? point : best, null);
  const low = ipc.reduce((best, point) => !best || point.close < best.close ? point : best, null);
  const periodsPerYear = rangeConfig.interval === '1wk' ? 52 : rangeConfig.interval === '1mo' ? 12 : 252;
  const volatility = rangeConfig.intraday ? windowVolatility(ipc) : annualizedVolatility(ipc, periodsPerYear);
  const trend = periodChange == null ? 'Sin lectura' : periodChange > .25 ? 'Alcista' : periodChange < -.25 ? 'Bajista' : 'Lateral';
  const selectedShare = shares.find(item => item.symbol === selectedSymbol) || shares[0] || null;
  const selectedProfile = BMV_PROFILES[selectedShare?.symbol] || { sector: 'Emisora BMV', icon: 'fa-building', ticker: '' };
  const companyHistories = useCompanyHistories(shares, range);
  const issuerHistory = companyHistories.series[selectedShare?.symbol] || [];
  const sectors = Object.values(shares.reduce((accumulator, share) => {
    const profile = BMV_PROFILES[share.symbol] || { sector: 'Emisora BMV' };
    const key = profile.sector;
    if (!accumulator[key]) accumulator[key] = { sector: key, total: 0, advances: 0, changeSum: 0, changeCount: 0, periodSum: 0, periodCount: 0, members: [] };
    const item = accumulator[key];
    const change = Number(share.change_pct);
    const historicalChange = seriesChange(companyHistories.series[share.symbol] || []);
    item.total += 1;
    item.members.push(share.symbol);
    if (Number.isFinite(change) && change >= 0) item.advances += 1;
    if (Number.isFinite(change)) { item.changeSum += change; item.changeCount += 1; }
    if (Number.isFinite(historicalChange)) { item.periodSum += historicalChange; item.periodCount += 1; }
    return accumulator;
  }, {})).map(item => ({
    ...item,
    sessionAverage: item.changeCount ? item.changeSum / item.changeCount : null,
    periodAverage: item.periodCount ? item.periodSum / item.periodCount : null,
  })).sort((a, b) => (b.periodAverage ?? b.sessionAverage ?? -Infinity) - (a.periodAverage ?? a.sessionAverage ?? -Infinity));
  const sectorShares = activeSector === 'all' ? shares : shares.filter(share => (BMV_PROFILES[share.symbol]?.sector || 'Emisora BMV') === activeSector);
  const visibleShares = shares.filter(share => {
    const change = Number(share.change_pct);
    const sector = BMV_PROFILES[share.symbol]?.sector || 'Emisora BMV';
    const searchable = `${share.name} ${share.symbol}`.toLocaleLowerCase('es-MX');
    if (activeSector !== 'all' && sector !== activeSector) return false;
    if (quoteQuery.trim() && !searchable.includes(quoteQuery.trim().toLocaleLowerCase('es-MX'))) return false;
    if (quoteFilter === 'up') return Number.isFinite(change) && change >= 0;
    if (quoteFilter === 'down') return Number.isFinite(change) && change < 0;
    return true;
  }).sort((a, b) => Number(b.change_pct) - Number(a.change_pct));
  return <section className="mxh-panel-view" aria-labelledby="mxh-bolsa-title">
    <header className="mxh-view-head">
      <div><span>01 · Bolsa México</span><h2 id="mxh-bolsa-title">La sesión local, con su historial a la vista.</h2><p>Las tarjetas toman la última cotización disponible de emisoras listadas en México; la gráfica usa el índice S&amp;P/BMV IPC.</p></div>
      <SourcePill>Yahoo Finance · BMV</SourcePill>
    </header>
    <div className="mxh-kpi-grid">
      <MetricCard label="S&amp;P/BMV IPC" value={last ? fmtNumber(last) : 'Conectando'} detail="Último cierre disponible" change={periodChange} icon="fa-chart-area" />
      <MetricCard label="Emisoras con avance" value={shares.length ? `${positive}/${shares.length}` : '—'} detail="Muestra disponible" icon="fa-arrow-trend-up" tone="mint" />
      <MetricCard label="Observaciones" value={ipc.length ? `${ipc.length} ${rangeConfig.intraday ? 'velas' : 'cierres'}` : '—'} detail={`IPC · ${rangeLabel}`} icon="fa-calendar-days" tone="violet" />
      <MetricCard label={rangeConfig.intraday ? 'Volatilidad de ventana' : 'Volatilidad histórica'} value={volatility != null ? `${fmtNumber(volatility)}%` : '—'} detail={rangeConfig.intraday ? 'Desviación de retornos intradía' : 'Anualizada con cierres diarios'} icon="fa-wave-square" tone="amber" />
    </div>
    <section className="mxh-range-metrics" aria-label={`Resumen del IPC a ${rangeLabel}`}>
      <div><span>Máximo</span><strong>{high ? fmtNumber(high.close) : '—'}</strong><em>{high ? shortDate(high.date) : 'Sin serie'}</em></div>
      <div><span>Mínimo</span><strong>{low ? fmtNumber(low.close) : '—'}</strong><em>{low ? shortDate(low.date) : 'Sin serie'}</em></div>
      <div><span>Variación</span><strong className={periodChange == null ? '' : periodChange >= 0 ? 'is-up' : 'is-down'}>{periodChange == null ? '—' : fmtPct(periodChange)}</strong><em>Inicio a último cierre</em></div>
      <div><span>Tendencia</span><strong className={trend === 'Alcista' ? 'is-up' : trend === 'Bajista' ? 'is-down' : ''}>{trend}</strong><em>Lectura de la ventana</em></div>
    </section>
    <div className="mxh-bolsa-workspace">
      <div className="mxh-chart-card"><div className="mxh-chart-toolbar"><span><i className="fas fa-clock-rotate-left" aria-hidden="true" /> Horizonte del IPC</span><div className="mxh-periods" role="group" aria-label="Cambiar periodo histórico del IPC">{IPC_RANGES.map(option => <button key={option.id} type="button" className={range === option.id ? 'is-active' : ''} onClick={() => onRangeChange(option.id)}>{option.label}</button>)}</div></div><LineChart points={ipc} label={`S&P/BMV IPC · ${rangeLabel}`} unit="puntos" /><p className="mxh-chart-note">La variación compara el primer y último punto de la ventana elegida. En periodos intradía la volatilidad no se anualiza; en los demás se calcula desde cierres diarios, semanales o mensuales según corresponda.</p></div>
      <aside className="mxh-session-card"><span>Lectura del corte</span><h3>{shares.length ? (positive >= Math.ceil(shares.length / 2) ? 'Sesgo positivo en la muestra' : 'Sesgo mixto en la muestra') : 'Sin muestra disponible'}</h3><p>{shares.length ? `${positive} de ${shares.length} emisoras conectadas muestran variación positiva frente al cierre previo.` : 'La fuente todavía no devolvió emisoras para este corte.'}</p><small>La muestra no representa todo el mercado ni sustituye el índice.</small></aside>
    </div>
    <section className="mxh-mex-sector-board" aria-labelledby="mxh-sector-title">
      <header className="mxh-sector-board-head">
        <div><span><i className="fas fa-globe-americas" aria-hidden="true" /> Mercados mexicanos</span><h3 id="mxh-sector-title">Análisis sectorial</h3><p>El desempeño se calcula sólo con emisoras mexicanas conectadas a esta mesa. Selecciona un sector para enfocar las empresas y las cotizaciones.</p></div>
        <span className="mxh-sector-board-status"><i className={`fas ${companyHistories.loading ? 'fa-circle-notch fa-spin' : 'fa-chart-pie'}`} aria-hidden="true" /> {companyHistories.loading ? 'Actualizando históricos' : `${sectors.length} sectores en la muestra`}</span>
      </header>
      <div className="mxh-sector-filters" role="group" aria-label="Filtrar emisoras por sector"><button type="button" className={activeSector === 'all' ? 'is-active' : ''} onClick={() => setActiveSector('all')}>Todos <b>{shares.length}</b></button>{sectors.map(sector => <button key={sector.sector} type="button" className={activeSector === sector.sector ? 'is-active' : ''} onClick={() => setActiveSector(sector.sector)}>{sector.sector} <b>{sector.total}</b></button>)}</div>
      <div className="mxh-sector-grid">
        {sectors.map(sector => {
          const isActive = activeSector === sector.sector;
          const performance = sector.periodAverage;
          const session = sector.sessionAverage;
          return <button className={`mxh-sector-tile${isActive ? ' is-active' : ''}`} key={sector.sector} type="button" onClick={() => setActiveSector(sector.sector)} aria-pressed={isActive}>
            <header><span>{sector.sector}</span><small>{sector.members.join(' · ')}</small></header>
            <strong className={performance == null ? '' : performance >= 0 ? 'is-up' : 'is-down'}>{performance == null ? (companyHistories.loading ? 'Cargando…' : 'Sin serie') : fmtPct(performance)}</strong>
            <em>Rendimiento medio · {rangeLabel}</em>
            <footer><span>Sesión <b className={session == null ? '' : session >= 0 ? 'is-up' : 'is-down'}>{session == null ? '—' : fmtPct(session)}</b></span><span>{sector.advances}/{sector.total} al alza</span></footer>
          </button>;
        })}
      </div>
      {!sectors.length && <p className="mxh-empty-row">Esperando la composición de emisoras mexicanas conectadas.</p>}
      <footer className="mxh-sector-board-note"><i className="fas fa-circle-info" aria-hidden="true" /> El rendimiento sectorial es el promedio simple de las series disponibles; no representa una ponderación oficial del S&amp;P/BMV IPC.</footer>
    </section>
    <section className="mxh-bolsa-analysis-grid" aria-label="Comparativa de emisora mexicana e IPC">
      <article className="mxh-issuer-card mxh-issuer-card-wide">
        <header><div><span>Comparativa</span><h3>{selectedShare ? `${selectedShare.name} vs. IPC` : 'Selecciona una emisora'}</h3></div><small>{selectedProfile.sector}</small></header>
        <div className="mxh-issuer-selector" role="list" aria-label="Elegir emisora para comparar con el IPC">{shares.map(share => <button key={share.symbol} type="button" className={selectedShare?.symbol === share.symbol ? 'is-active' : ''} onClick={() => setSelectedSymbol(share.symbol)} role="listitem"><i className={`fas ${BMV_PROFILES[share.symbol]?.icon || 'fa-building'}`} aria-hidden="true" />{share.symbol}</button>)}</div>
        <IndexedCompareChart benchmark={ipc} asset={issuerHistory} assetLabel={selectedShare?.symbol || 'Emisora'} loading={companyHistories.loading && !issuerHistory.length} />
        <p>Las dos líneas parten de 100 para comparar desempeño relativo; no comparan niveles de precio ni ponderaciones dentro del índice.</p>
      </article>
    </section>
    <section className="mxh-company-board" aria-labelledby="mxh-company-board-title">
      <header><div><span>Empresas mexicanas {activeSector === 'all' ? '' : `· ${activeSector}`}</span><h3 id="mxh-company-board-title">Cada emisora, con su propio histórico.</h3><p>Selecciona una tarjeta para actualizar la comparación frente al IPC. El color de la curva refleja su rendimiento dentro de la ventana elegida.</p></div><span className="mxh-company-board-status"><i className={`fas ${companyHistories.loading ? 'fa-circle-notch fa-spin' : 'fa-chart-line'}`} aria-hidden="true" /> {companyHistories.loading ? 'Cargando series' : `${Object.keys(companyHistories.series).length}/${shares.length} series disponibles`}</span></header>
      <div className="mxh-company-grid">{sectorShares.map(share => <CompanyCard key={share.symbol} share={share} points={companyHistories.series[share.symbol] || []} selected={selectedShare?.symbol === share.symbol} onSelect={() => setSelectedSymbol(share.symbol)} />)}</div>
      {!shares.length && <p className="mxh-empty-row">Esperando cotizaciones de empresas mexicanas.</p>}
      {!!shares.length && !sectorShares.length && <p className="mxh-empty-row">No hay emisoras conectadas en este sector.</p>}
    </section>
    <section className="mxh-quote-table" aria-label="Cotizaciones de emisoras mexicanas">
      <header><div><span>Emisoras conectadas</span><small>Última cotización / cierre disponible · selecciona una fila para compararla con el IPC</small></div><div className="mxh-quote-tools"><div role="group" aria-label="Filtrar emisoras por variación"><button type="button" className={quoteFilter === 'all' ? 'is-active' : ''} onClick={() => setQuoteFilter('all')}>Todas</button><button type="button" className={quoteFilter === 'up' ? 'is-active' : ''} onClick={() => setQuoteFilter('up')}>Al alza</button><button type="button" className={quoteFilter === 'down' ? 'is-active' : ''} onClick={() => setQuoteFilter('down')}>A la baja</button></div><label><i className="fas fa-magnifying-glass" aria-hidden="true" /><span className="sr-only">Buscar emisora</span><input value={quoteQuery} onChange={event => setQuoteQuery(event.target.value)} type="search" placeholder="Buscar" aria-label="Buscar emisora" /></label></div></header>
      <div className="mxh-quote-head"><span>Emisora</span><span>Precio</span><span>Variación</span><span>Sector / señal</span></div>
      {visibleShares.map(item => { const change = Number(item.change_pct); const isUp = Number.isFinite(change) && change >= 0; const profile = BMV_PROFILES[item.symbol] || { sector: 'Emisora BMV' }; return <button className={`mxh-quote-row${selectedShare?.symbol === item.symbol ? ' is-selected' : ''}`} type="button" key={item.symbol} onClick={() => setSelectedSymbol(item.symbol)} aria-pressed={selectedShare?.symbol === item.symbol}><strong>{item.name}<small>{item.symbol}</small></strong><span>${fmtNumber(item.price)} MXN</span><b className={isUp ? 'is-up' : 'is-down'}>{fmtPct(change)}</b><em>{profile.sector} · {isUp ? 'Arriba de previo' : 'Debajo de previo'}</em></button>; })}
      {!shares.length && <p className="mxh-empty-row">No llegó una cotización verificable en este momento. Se reintenta automáticamente.</p>}
      {!!shares.length && !visibleShares.length && <p className="mxh-empty-row">No hay emisoras que coincidan con este filtro.</p>}
    </section>
  </section>;
}

export default function Mexico() {
  const [active, setActive] = useState(null);
  usePageStyles(HOJAS_BASE);
  const [ipcRange, setIpcRange] = useState('1y');
  const [snapshot, setSnapshot] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);
  const overviewRef = useRef(null);
  const detailRef = useRef(null);
  const ipcRangeConfig = useMemo(() => IPC_RANGES.find(option => option.id === ipcRange) || IPC_RANGES[2], [ipcRange]);

  useEffect(() => {
    document.documentElement.classList.add('vn-dark-mexico');
    document.body.classList.add('vn-dark-mexico');
    return () => {
      document.documentElement.classList.remove('vn-dark-mexico');
      document.body.classList.remove('vn-dark-mexico');
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const load = async () => {
      if (mounted) setLoading(true);
      const settled = await Promise.allSettled([
        readJson('/api/bmv-market', controller.signal),
        readJson('/api/mx-rates', controller.signal),
        readHistory('^MXX', ipcRangeConfig, controller.signal),
        readJson('/api/stock-history?ticker=USDMXN%3DX&interval=1d&range=3mo', controller.signal),
        readJson('/api/mexico-macro', controller.signal),
        readJson('/api/banxico/SP30578', controller.signal),
        readJson('/api/stock-history?ticker=ZC%3DF&interval=1d&range=3mo', controller.signal),
        readJson('/api/stock-history?ticker=ZW%3DF&interval=1d&range=3mo', controller.signal),
        readJson('/api/stock-history?ticker=ZS%3DF&interval=1d&range=3mo', controller.signal),
        readJson('/api/sniim/primer-mercado', controller.signal),
        readJson('/api/stock-history?ticker=GC%3DF&interval=1d&range=3mo', controller.signal),
        readJson('/api/stock-history?ticker=SI%3DF&interval=1d&range=3mo', controller.signal),
        readJson('/api/stock-history?ticker=HG%3DF&interval=1d&range=3mo', controller.signal),
      ]);
      if (!mounted) return;
      const value = index => settled[index].status === 'fulfilled' ? settled[index].value : null;
      const bmvPayload = value(0) || {};
      const inputs = [
        historyInput('corn', 'Maíz', value(6), '¢ USD/bu', 'fa-seedling'),
        historyInput('wheat', 'Trigo', value(7), '¢ USD/bu', 'fa-wheat-awn'),
        historyInput('soy', 'Soya', value(8), '¢ USD/bu', 'fa-leaf'),
        quoteInput('wti', 'Petróleo WTI', bmvPayload.gasolina?.[0], 'USD/barril', 'fa-oil-well', bmvPayload.timestamp),
        quoteInput('lean-hogs', 'Cerdo magro', bmvPayload.porcino?.[0], '¢ USD/lb', 'fa-drumstick-bite', bmvPayload.timestamp),
      ].filter(Boolean);
      const metals = [
        historyInput('gold', 'Oro', value(10), 'USD/oz', 'fa-coins'),
        historyInput('silver', 'Plata', value(11), 'USD/oz', 'fa-gem'),
        historyInput('copper', 'Cobre', value(12), 'USD/lb', 'fa-bolt'),
      ].filter(Boolean);
      setSnapshot({
        bmv: Array.isArray(bmvPayload.bmv) ? bmvPayload.bmv : [],
        rates: value(1), ipc: historyPoints(value(2), ipcRangeConfig.trim), fx: historyPoints(value(3)),
        macro: Array.isArray(value(4)?.indicators) ? value(4).indicators : [],
        inflation: banxicoLatest(value(5)), inputs, firstSale: value(9), metals,
        asOf: bmvPayload.timestamp || new Date().toISOString(),
        errors: settled.filter(item => item.status === 'rejected').map(item => item.reason?.message || 'Fuente no disponible'),
      });
      setLoading(false);
    };
    load().catch(() => mounted && setLoading(false));
    const refresh = window.setInterval(load, 12 * 60 * 1000);
    return () => { mounted = false; controller.abort(); window.clearInterval(refresh); };
  }, [ipcRangeConfig]);

  const selected = useMemo(() => MODULOS.find(module => module.id === active), [active]);
  const updated = snapshot.asOf ? new Date(snapshot.asOf).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : 'Actualizando';
  const moduleMetrics = useMemo(() => {
    const ipc = snapshot.ipc.at(-1)?.close;
    const productiveCoverage = Math.max(0, ...Object.values(snapshot.firstSale?.prices || {}).map(item => Array.isArray(item?.states) ? item.states.length : 0));
    return {
      bolsa: { etiqueta: 'S&P/BMV IPC', valor: Number.isFinite(ipc) ? fmtNumber(ipc) : '—', unidad: 'puntos del índice', verificado: Number.isFinite(ipc), estado: loading ? 'Consultando cotización…' : Number.isFinite(ipc) ? 'Último cierre disponible' : 'Sin cotización disponible' },
      mercados: { etiqueta: 'Cobertura SNIIM', valor: productiveCoverage ? `${productiveCoverage} estados` : '—', unidad: 'Mercado físico por entidad', verificado: productiveCoverage > 0, estado: loading ? 'Consultando precios…' : productiveCoverage ? 'Cobertura disponible en la fuente' : 'Sin cobertura disponible' },
    };
  }, [snapshot.firstSale, snapshot.ipc, loading]);

  const openModule = id => {
    if (!MODULOS.some(module => module.id === id)) return;
    setActive(id);
    window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' }), 0);
  };

  const returnToOverview = () => {
    setActive(null);
    window.setTimeout(() => overviewRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' }), 0);
  };

  return <>
    <Header />
    <div className="hdr-divider" />
    <main className="mxh-page">
      {!active && <div ref={overviewRef}>
        <section className="mxh-hero" aria-labelledby="mxh-title">
          <div className="mxh-orbit" aria-hidden="true"><i /><i /><i /></div>
          <div className="mxh-hero-copy"><span><i className="fas fa-flag" aria-hidden="true" /> VALLNEWS · RADAR NACIONAL</span><h1 id="mxh-title">México</h1><p>Bolsa México · México Productivo <b>Corte nacional</b></p></div>
          <div className="mxh-live-card"><span><i className="fas fa-circle" aria-hidden="true" /> Corte conectado</span><strong>{loading ? 'Actualizando datos' : updated}</strong><small>{snapshot.errors.length ? `${snapshot.errors.length} fuente(s) reintentando; el resto permanece disponible` : 'BMV · Banxico · Banco Mundial · Yahoo · USDA'}</small></div>
        </section>

        <ModuleEntryCards modulos={TARJETAS} cotizaciones={moduleMetrics} label="Apartados de México" onOpen={openModule} />
      </div>}

      {active && <section className="mxh-detail-shell" ref={detailRef} tabIndex="-1">
        <header className="mxh-detail-navigation" aria-labelledby="mxh-detail-title">
          <button className="mxh-detail-back" type="button" onClick={returnToOverview}><i className="fas fa-arrow-left" aria-hidden="true" /><span>Volver al resumen</span></button>
          <div className="mxh-detail-heading"><span>{selected?.eyebrow}</span><h1 id="mxh-detail-title">{selected?.title}</h1><p>{selected?.description}</p></div>
          <nav className="mxh-detail-tabs" aria-label="Apartados de México">
            {MODULOS.map(module => <button key={module.id} type="button" className={active === module.id ? 'is-active' : ''} onClick={() => openModule(module.id)} aria-current={active === module.id ? 'page' : undefined}><i className={`fas ${module.icon}`} aria-hidden="true" /><span>{module.title}</span></button>)}
          </nav>
          <span className="mxh-detail-feed"><i className={`fas ${loading ? 'fa-circle-notch fa-spin' : 'fa-circle'}`} aria-hidden="true" /> {loading ? 'Actualizando fuentes' : 'Fuentes conectadas'}</span>
        </header>
        <section className="mxh-module-content" id="mxh-module-content">
          {active === 'bolsa' && <BolsaPanel snapshot={snapshot} range={ipcRange} onRangeChange={setIpcRange} />}
          {active === 'mercados' && <ProductiveMarketsPanel snapshot={snapshot} />}
        </section>
      </section>}
    </main>
    <Footer />
  </>;
}
