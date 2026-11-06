import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import { DARK_PILOT, ESQUELETO } from '../lib/hojasComunes.js';
import { FUENTES_NOTICIAS, reunirNoticias } from '../lib/noticias.js';
import { ACTIVOS_INICIO, cargarCotizacion, precio, porcentaje, fechaCotizacion, geometriaSerie } from '../lib/inicioMercados.js';
import useInicioMotion from '../lib/useInicioMotion.js';
import InicioNewsCarousel from '../components/InicioNewsCarousel.jsx';
import './Inicio.css';

const HOJAS = [...ESQUELETO, DARK_PILOT];
const INDEXES = ACTIVOS_INICIO.filter(asset => asset.group === 'bolsa');
const PERIODOS = [{ id: '1mo', label: '1M' }, { id: '3mo', label: '3M' }, { id: '1y', label: '1A' }];
const Icon = ({ name }) => <i className={`fa-solid ${name}`} aria-hidden="true" />;
const assetByTicker = ticker => ACTIVOS_INICIO.find(asset => asset.ticker === ticker);
const changeClass = value => value == null ? '' : value < 0 ? 'ih-down' : value > 0 ? 'ih-up' : '';

function usePortadaDatos(refresh) {
  const [quotes, setQuotes] = useState({});
  const [editions, setEditions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newsLoading, setNewsLoading] = useState(true);
  const [checked, setChecked] = useState(null);
  const [newsStale, setNewsStale] = useState(false);
  useEffect(() => {
    let active = true, next = 0;
    const controllers = new Set();
    setLoading(true);
    setNewsLoading(true);
    async function request(task) {
      const controller = new AbortController();
      controllers.add(controller);
      const timeout = setTimeout(() => controller.abort(), 24000);
      try { return await task(controller.signal); }
      finally { clearTimeout(timeout); controllers.delete(controller); }
    }
    async function worker() {
      while (active && next < ACTIVOS_INICIO.length) {
        const asset = ACTIVOS_INICIO[next++];
        try {
          const data = await request(signal => cargarCotizacion(asset.ticker, '1mo', signal));
          if (active) setQuotes(previous => ({ ...previous, [asset.ticker]: { ...data, status: 'ready' } }));
        } catch {
          if (active) setQuotes(previous => ({ ...previous, [asset.ticker]: previous[asset.ticker]?.price != null
            ? { ...previous[asset.ticker], status: 'stale' } : { status: 'error' } }));
        }
      }
    }
    Promise.all(Array.from({ length: 4 }, worker)).then(() => {
      if (active) { setLoading(false); setChecked(new Date()); }
    });
    Promise.all(FUENTES_NOTICIAS.map(async source => {
      try {
        const payload = await request(async signal => {
          const response = await fetch(source.url, { signal, credentials: 'include' });
          if (!response.ok) throw new Error('Fuente no disponible');
          return response.json();
        });
        if (!payload.success || !Array.isArray(payload.data?.noticias)) throw new Error('Sin noticias');
        return { id: source.id, articles: payload.data.noticias, stale: !!payload.stale };
      } catch { return { id: source.id, articles: [], failed: true }; }
    })).then(results => { if (active) {
      setEditions(previous => results.map(result => result.failed ? { ...result, articles: previous.find(edition => edition.id === result.id)?.articles || [] } : result));
      setNewsStale(results.some(result => result.failed || result.stale));
      setNewsLoading(false);
    } });
    return () => { active = false; controllers.forEach(controller => controller.abort()); };
  }, [refresh]);
  const news = useMemo(() => reunirNoticias(editions), [editions]);
  return { quotes, news, loading, newsLoading, checked, newsStale };
}

function OrionBackdrop() {
  return <svg className="ih-constellation" viewBox="0 0 250 300" aria-hidden="true">
    <defs><radialGradient id="ih-star-glow"><stop stopColor="#d5e8ff" stopOpacity=".28" /><stop offset="1" stopColor="#d5e8ff" stopOpacity="0" /></radialGradient></defs>
    <g fill="none" stroke="currentColor" strokeWidth=".8"><path d="M123 28 57 86 104 139 72 268 M123 28 194 87 149 157 204 274 M57 86 194 87 M104 139 126 149 149 157 M126 149 125 186 123 211" /></g>
    {[[123,28,3.8],[57,86,3],[194,87,3],[104,139,2.8],[126,149,4],[149,157,2.8],[125,186,2],[123,211,2.2],[72,268,3.1],[204,274,4]].map(([x,y,r], i) => <g key={i}><circle cx={x} cy={y} r={r * 8} fill="url(#ih-star-glow)" /><circle cx={x} cy={y} r={r} fill="#e4eefc" /></g>)}
  </svg>;
}

function Sparkline({ quote, color = '#5dccad' }) {
  const gradient = useId().replace(/:/g, '');
  const candles = quote?.candles || [];
  const geometry = geometriaSerie(candles, 180, 44, 3);
  if (!geometry || candles.length < 2) return <div className="ih-spark-empty">{quote?.status === 'error' ? 'Sin histórico' : quote ? 'Histórico no disponible' : 'Consultando…'}</div>;
  return <svg className="ih-spark" viewBox="0 0 180 44" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop stopColor={color} stopOpacity=".23" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
    <polygon points={`3,44 ${geometry.points} 177,44`} fill={`url(#${gradient})`} />
    <polyline points={geometry.points} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
  </svg>;
}

function AssetCard({ asset, quote, onSelect }) {
  return <button type="button" className="ih-asset" style={{ '--asset-color': asset.color }} onClick={() => onSelect(asset.ticker)} aria-label={`Ver gráfica de ${asset.name}`}>
    <span className="ih-asset-head"><span className="ih-asset-icon"><Icon name={asset.icon} /></span><strong>{asset.short}</strong><Icon name="fa-arrow-up-right-from-square" /></span>
    <span className="ih-asset-price">{precio(quote?.price)} <span className={changeClass(quote?.change)}>{porcentaje(quote?.change)}</span></span>
    <span className="ih-unit">{asset.unit} · {asset.group === 'agro' || asset.group === 'metales' ? 'Futuros' : asset.group === 'acciones' ? asset.ticker : 'Índice'}</span>
    <Sparkline quote={quote} color={asset.color} />
    <span className="ih-asset-date">{quote?.status === 'stale' ? 'Último dato guardado' : quote?.date ? `Histórico al ${fechaCotizacion(quote.date)}` : quote?.status === 'error' ? 'Cotización no disponible' : 'Consultando fuente…'}</span>
  </button>;
}

function HistoryChart({ ticker, onTicker, quotes, refresh }) {
  const asset = assetByTicker(ticker);
  const [range, setRange] = useState('1mo');
  const [mode, setMode] = useState('candles');
  const [history, setHistory] = useState(null);
  const [hover, setHover] = useState(null);
  const gradient = useId().replace(/:/g, '');
  const labelId = useId();
  useEffect(() => {
    setHover(null);
    if (range === '1mo') return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 24000);
    let active = true;
    const key = `${ticker}:${range}`;
    setHistory({ key, status: 'loading' });
    cargarCotizacion(ticker, range, controller.signal)
      .then(data => { if (active) setHistory({ ...data, key, status: 'ready' }); })
      .catch(() => { if (active) setHistory({ key, status: 'error' }); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [ticker, range, refresh]);
  const quote = range === '1mo' ? quotes[ticker] : history?.key === `${ticker}:${range}` ? history : null;
  const candles = quote?.candles || [];
  const geometry = geometriaSerie(candles, 540, 178, 6, mode === 'candles');
  const selected = candles[Math.min(hover ?? candles.length - 1, candles.length - 1)];
  const first = candles[0]?.close, last = candles.at(-1)?.close;
  const periodChange = first > 0 ? (last / first - 1) * 100 : null;
  const candleWidth = Math.max(1, Math.min(12, 520 / Math.max(candles.length, 1) * .62));
  function pointer(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 620 - 60;
    setHover(Math.max(0, Math.min(candles.length - 1, Math.round((x - 6) / 528 * (candles.length - 1)))));
  }
  return <article className="ih-chart-card" style={{ '--asset-color': asset.color }}>
    <div className="ih-chart-header"><div><label className="ih-eyebrow" htmlFor={labelId}>Explorar histórico</label><select id={labelId} value={ticker} onChange={event => onTicker(event.target.value)} aria-label="Activo de la gráfica">{ACTIVOS_INICIO.map(item => <option key={item.ticker} value={item.ticker}>{item.name}</option>)}</select></div><span className="ih-chart-badge">{asset.unit}</span></div>
    <div className="ih-chart-value"><strong>{precio(quote?.price)}</strong><span className={changeClass(periodChange)}>{porcentaje(periodChange)} <small>en el periodo</small></span></div>
    <div className="ih-chart-controls"><div aria-label={`Periodo de ${asset.name}`} role="group">{PERIODOS.map(period => <button type="button" key={period.id} aria-pressed={range === period.id} onClick={() => setRange(period.id)}>{period.label}</button>)}</div><div aria-label={`Tipo de gráfica de ${asset.name}`} role="group"><button type="button" aria-pressed={mode === 'candles'} onClick={() => setMode('candles')}>Velas</button><button type="button" aria-pressed={mode === 'line'} onClick={() => setMode('line')}>Línea</button></div></div>
    {geometry ? <>
      <svg className="ih-history-chart" viewBox="0 0 620 226" role="img" aria-label={`${asset.name}: ${candles.length} sesiones diarias. Usa las flechas para explorar los cierres.`} tabIndex={0} onPointerMove={pointer} onPointerLeave={() => setHover(null)} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        setHover(previous => event.key === 'Home' ? 0 : event.key === 'End' ? candles.length - 1 : Math.max(0, Math.min(candles.length - 1, (previous ?? candles.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1))));
      }}>
        <title>{asset.name} · histórico diario</title>
        <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop stopColor={asset.color} stopOpacity=".18" /><stop offset="1" stopColor={asset.color} stopOpacity="0" /></linearGradient></defs>
        {[0,1,2,3].map(step => { const value = geometry.max - step / 3 * (geometry.max - geometry.min), y = 12 + geometry.y(value); return <g key={step}><line x1="60" x2="600" y1={y} y2={y} className="ih-gridline" /><text x="52" y={y + 4} textAnchor="end">{new Intl.NumberFormat('es-MX', { maximumFractionDigits: value < 100 ? 2 : 0 }).format(value)}</text></g>; })}
        <g transform="translate(60 12)">{mode === 'line' ? <><polygon points={`6,178 ${geometry.points} 534,178`} fill={`url(#${gradient})`} /><polyline points={geometry.points} stroke={asset.color} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" /></> : candles.map((c, index) => <g key={`${c.time}-${index}`} className={c.close >= c.open ? 'ih-candle-up' : 'ih-candle-down'}><line x1={geometry.x(index)} x2={geometry.x(index)} y1={geometry.y(c.high)} y2={geometry.y(c.low)} /><rect x={geometry.x(index) - candleWidth / 2} y={Math.min(geometry.y(c.open), geometry.y(c.close))} width={candleWidth} height={Math.max(1, Math.abs(geometry.y(c.close) - geometry.y(c.open)))} /></g>)}
          {hover != null && selected && <><line x1={geometry.x(hover)} x2={geometry.x(hover)} y1="0" y2="178" className="ih-crosshair" /><circle cx={geometry.x(hover)} cy={geometry.y(selected.close)} r="3.5" fill={asset.color} /></>}
        </g>
        <text x="66" y="214">{fechaCotizacion(candles[0].time)}</text><text x="330" y="214" textAnchor="middle">{fechaCotizacion(candles[Math.floor(candles.length / 2)].time)}</text><text x="594" y="214" textAnchor="end">{fechaCotizacion(candles.at(-1).time)}</text>
      </svg>
      <div className="ih-chart-caption"><span>{fechaCotizacion(selected?.time)} · cierre <strong>{precio(selected?.close)}</strong></span><span>{candles.length} sesiones · diario{quote.status === 'stale' ? ' · dato guardado' : ''}</span></div>
    </> : <div className="ih-chart-empty" role="status"><Icon name="fa-chart-line" /><span>{quote?.status === 'error' || quote?.status === 'ready' ? 'El histórico no está disponible.' : 'Consultando el histórico…'}</span><small>{quote?.status === 'error' ? 'Prueba otro activo o actualiza las fuentes.' : 'Datos de la fuente, sin valores de ejemplo.'}</small></div>}
  </article>;
}

const EXPLORE = [
  { to: '/finanzas', number: '01', title: 'Finanzas globales', description: 'Bolsa, bonos y divisas. Profundiza en los movimientos que estás siguiendo.', icon: 'fa-chart-line' },
  { to: '/mercados', number: '02', title: 'Mercados productivos', description: 'Conecta granos, ganado y materias primas con sus precios de referencia.', icon: 'fa-wheat-awn' },
  { to: '/mexico', number: '03', title: 'La mirada de México', description: 'Bolsa mexicana y actividad productiva, dentro del contexto mundial.', icon: 'fa-flag' },
];

export default function Inicio() {
  usePageStyles(HOJAS);
  const rootRef = useRef(null);
  useInicioMotion(rootRef);
  const [refresh, setRefresh] = useState(0);
  const [group, setGroup] = useState('agro');
  const [firstTicker, setFirstTicker] = useState('^GSPC');
  const [secondTicker, setSecondTicker] = useState('^NDX');
  const { quotes, news, loading, newsLoading, checked, newsStale } = usePortadaDatos(refresh);
  useEffect(() => {
    document.documentElement.classList.add('vn-dark-pilot');
    document.body.classList.add('vn-dark-pilot', 'vn-dark-inicio');
    document.title = 'Inicio | VALLNews';
    return () => { document.documentElement.classList.remove('vn-dark-pilot'); document.body.classList.remove('vn-dark-pilot', 'vn-dark-inicio'); };
  }, []);
  const cards = group === 'agro' ? ACTIVOS_INICIO.filter(asset => asset.group === 'agro')
    : group === 'bolsa' ? ['^GSPC', '^NDX', '^MXX', 'AAPL', 'NVDA'].map(assetByTicker)
      : ['GC=F', 'SI=F'].map(assetByTicker);
  const available = Object.values(quotes).filter(quote => quote.status === 'ready').length;
  const failed = Object.values(quotes).filter(quote => quote.status === 'error' || quote.status === 'stale').length;
  function selectAsset(ticker) {
    setFirstTicker(ticker);
    document.getElementById('ih-charts')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }
  return <><Header /><main className="ih-page" ref={rootRef}>
    <nav className="ih-category-nav" aria-label="Explorar el inicio"><a href="#ih-news">En el radar</a><a href="#ih-charts">Mercados</a><a href="#ih-assets" onClick={() => setGroup('agro')}>Proteínas y campo</a><a href="#ih-orion">Conoce ORION <Icon name="fa-arrow-right" /></a></nav>
    <section className="ih-hero" aria-labelledby="ih-title">
      <div className="ih-hero-copy"><span className="ih-eyebrow">VALLNEWS · El valor de la perspectiva</span><h1 id="ih-title">Todo está<br />conectado.<br /><span>Encuentra la señal.</span></h1><p>Noticias, mercados y proteínas. Conectamos lo que pasa en el mundo con la información que necesitas para entender tu sector.</p><div className="ih-hero-actions"><a href="#ih-charts" className="ih-button ih-button-primary">Explorar el panorama <Icon name="fa-arrow-down" /></a><Link className="ih-button ih-button-quiet" to="/orion">Preguntar a ORION <Icon name="fa-arrow-up-right-from-square" /></Link></div><div className="ih-hero-signature"><span className="ih-signature-symbol"><Icon name="fa-earth-americas" /></span><p>Del mercado global<br /><strong>a tu próxima decisión.</strong></p><span className="ih-signature-line" /><small>Economía.<br />Producción.<br />Perspectiva.</small></div></div>
      <InicioNewsCarousel news={news} loading={newsLoading} stale={newsStale} onRefresh={() => setRefresh(value => value + 1)} />
    </section>
    <section className="ih-global-section" data-ih-reveal aria-labelledby="ih-global-title"><div className="ih-section-heading"><div><span className="ih-eyebrow">El pulso del mundo</span><h2 id="ih-global-title">Muchas señales. Una mirada.</h2></div><div className="ih-check"><span>{loading ? 'Consultando mercados…' : checked ? `Consulta ${new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }).format(checked)} · CDMX` : 'Preparando datos'}</span><button type="button" disabled={loading || newsLoading} onClick={() => setRefresh(value => value + 1)} aria-label="Actualizar mercados y noticias" title="Actualizar fuentes"><Icon name="fa-rotate-right" /></button></div></div><div className="ih-global-panel">{INDEXES.map(asset => <button type="button" key={asset.ticker} className="ih-global-row" onClick={() => selectAsset(asset.ticker)} aria-label={`Ver gráfica de ${asset.name}`}><span className="ih-global-top"><span className="ih-region">{asset.region === 'México' ? 'MX' : asset.region === 'Alemania' ? 'DE' : asset.region === 'Japón' ? 'JP' : 'US'}</span><span>{asset.region}</span><Icon name="fa-arrow-up-right-from-square" /></span><span className="ih-global-name"><strong>{asset.short}</strong></span><span className="ih-global-price"><strong>{precio(quotes[asset.ticker]?.price)}</strong><small className={changeClass(quotes[asset.ticker]?.change)}>{porcentaje(quotes[asset.ticker]?.change)}</small></span><Sparkline quote={quotes[asset.ticker]} color={asset.color} /></button>)}</div><p className="ih-panel-foot">Índices en puntos · variación de sesión · desliza para explorar en pantallas pequeñas</p></section>
    <section id="ih-assets" className="ih-assets-section" data-ih-reveal aria-labelledby="ih-assets-title"><div className="ih-section-heading"><div><span className="ih-eyebrow">De la bolsa al campo</span><h2 id="ih-assets-title">{group === 'agro' ? 'La economía que alimenta al mundo.' : group === 'bolsa' ? 'Empresas e índices en tu radar.' : 'El valor de los metales.'}</h2><p>Elige una referencia para explorar su histórico.</p></div><div className="ih-tabs" role="group" aria-label="Familia de activos">{[{ id: 'bolsa', label: 'Bolsa' }, { id: 'agro', label: 'Agropecuarios' }, { id: 'metales', label: 'Metales' }].map(tab => <button type="button" key={tab.id} aria-pressed={group === tab.id} onClick={() => setGroup(tab.id)}>{tab.label}</button>)}</div></div><div className={`ih-asset-grid ${group === 'metales' ? 'ih-asset-grid-metals' : ''}`}>{cards.map(asset => <AssetCard key={asset.ticker} asset={asset} quote={quotes[asset.ticker]} onSelect={selectAsset} />)}</div></section>
    <section id="ih-charts" className="ih-analysis-section" data-ih-reveal aria-labelledby="ih-charts-title"><div className="ih-section-heading"><div><span className="ih-eyebrow">De la señal a la evidencia</span><h2 id="ih-charts-title">Pon el mercado en perspectiva.</h2><p>Dos gráficas, tu selección. Compara activos, periodos y movimientos.</p></div><Link to="/finanzas" className="ih-text-link">Explorar Finanzas <Icon name="fa-arrow-right" /></Link></div><div className="ih-analysis-grid"><HistoryChart ticker={firstTicker} onTicker={setFirstTicker} quotes={quotes} refresh={refresh} /><HistoryChart ticker={secondTicker} onTicker={setSecondTicker} quotes={quotes} refresh={refresh} /></div></section>
    <section className="ih-metals-strip" data-ih-reveal aria-label="Metales preciosos"><div><span className="ih-eyebrow">Otros puntos de referencia</span><h2>Oro y plata</h2></div>{ACTIVOS_INICIO.filter(asset => asset.group === 'metales').map(asset => <button type="button" key={asset.ticker} onClick={() => selectAsset(asset.ticker)}><span className="ih-metal-icon" style={{ color: asset.color }}><Icon name={asset.icon} /></span><span><strong>{asset.name}</strong><small>{asset.unit} · futuros</small></span><Sparkline quote={quotes[asset.ticker]} color={asset.color} /><span className="ih-metal-price"><strong>{precio(quotes[asset.ticker]?.price)}</strong><small className={changeClass(quotes[asset.ticker]?.change)}>{porcentaje(quotes[asset.ticker]?.change)}</small></span><Icon name="fa-arrow-right" /></button>)}</section>
    <section id="ih-orion" className="ih-orion-feature" data-ih-reveal aria-labelledby="ih-orion-title"><div className="ih-orion-art" aria-hidden="true"><div className="ih-orion-orbit" /><div className="ih-orion-orbit ih-orion-orbit-secondary" /><OrionBackdrop /><span className="ih-orion-wordmark">ORION<span>INTELIGENCIA CON PERSPECTIVA</span></span><span className="ih-orion-coordinate">MERCADOS ↔ PROTEÍNAS ↔ CONTEXTO</span></div><div className="ih-orion-copy"><span className="ih-eyebrow">Nuestro punto de conexión</span><h2 id="ih-orion-title">Los datos abren<br /><span>mejores preguntas.</span></h2><p>ORION te ayuda a conectar precios, noticias y comercio. Explora escenarios, contrasta fuentes y convierte una pregunta en una lectura más completa.</p><div className="ih-orion-capabilities"><span><Icon name="fa-link" /> Fuentes para contrastar</span><span><Icon name="fa-chart-line" /> Escenarios para explorar</span><span><Icon name="fa-file-lines" /> Informes para compartir</span></div><Link to="/orion" className="ih-button ih-button-primary">Iniciar una conversación <Icon name="fa-arrow-right" /></Link></div></section>
    <section className="ih-explore-section" data-ih-reveal aria-labelledby="ih-explore-title"><div className="ih-section-heading"><div><span className="ih-eyebrow">Elige tu siguiente perspectiva</span><h2 id="ih-explore-title">Tu sector no vive aislado.</h2></div><span className="ih-explore-note">Explora sus conexiones.</span></div><div className="ih-explore-grid">{EXPLORE.map(item => <Link key={item.to} to={item.to} className="ih-explore-card"><div className="ih-explore-card-top"><span className="ih-explore-number">{item.number}</span><Icon name={item.icon} /></div><h3>{item.title}</h3><p>{item.description}</p><span className="ih-explore-link">Explorar <Icon name="fa-arrow-right" /></span></Link>)}</div></section>
    <div className="ih-data-note"><Icon name="fa-circle-info" /><p>Cotizaciones e históricos vía Yahoo Finance. Las series pueden tener retraso; revisa su fecha. Las variaciones de las tarjetas corresponden a la sesión y las de las gráficas, al periodo elegido. Futuros: ¢ USD/lb = centavos por libra; ¢ USD/bu = centavos por bushel. {failed > 0 && `${failed} ${failed === 1 ? 'activo no pudo actualizarse' : 'activos no pudieron actualizarse'}. `}{!loading && `${available} de ${ACTIVOS_INICIO.length} activos consultados.`}</p></div>
  </main><Footer /></>;
}
