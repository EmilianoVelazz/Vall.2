import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import { usePageStyles, loadScriptsInOrder } from '../lib/assets.js';
import FINANZAS_HTML from './finanzasMarkup.js';
import './FinanzasBonds.css';
import './FinanzasMarkets.css';
import './FinanzasDepth.css';

const CHARTJS = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
const LWC = 'https://unpkg.com/lightweight-charts@4/dist/lightweight-charts.standalone.production.js';
const AOS_JS = 'https://unpkg.com/aos@2.3.1/dist/aos.js';

const BOND_CHANNELS = [
  { icon: 'fa-building-columns', title: 'Tasa de referencia', body: 'Banxico y la Fed mueven el costo base del dinero. Un recorte suele beneficiar primero a los bonos de mayor duración.' },
  { icon: 'fa-chart-line', title: 'Precio de los bonos', body: 'Cuando el rendimiento exigido baja, el precio del bono existente sube. El efecto es mayor en vencimientos largos.' },
  { icon: 'fa-house', title: 'Crédito y vivienda', body: 'Tasas largas más bajas reducen gradualmente el costo de hipotecas y financiamiento corporativo; el traslado no es inmediato.' },
  { icon: 'fa-dollar-sign', title: 'Peso y flujos', body: 'El diferencial México–EE.UU. influye en el carry. Un diferencial amplio puede apoyar al peso, aunque aumenta el riesgo de reversión.' },
];

const MACRO_CHANNELS = [
  { tone: 'blue', icon: 'fa-dollar-sign', title: 'Dólar', signal: 'DXY y USD/MXN', body: 'Un dólar global fuerte endurece las condiciones financieras y suele presionar a activos emergentes.' },
  { tone: 'gold', icon: 'fa-percent', title: 'Tasas reales', signal: 'TIIE − inflación', body: 'Una tasa real positiva sostiene el ahorro en pesos, pero también enfría crédito, consumo e inversión.' },
  { tone: 'red', icon: 'fa-bolt', title: 'Volatilidad', signal: 'VIX y MOVE', body: 'VIX mide tensión en acciones; MOVE hace lo propio en bonos. Si ambos suben, la señal defensiva es más sólida.' },
  { tone: 'green', icon: 'fa-scale-balanced', title: 'Crédito', signal: 'HYG frente a LQD', body: 'El desempeño relativo de deuda riesgosa contra deuda segura ayuda a confirmar apetito o aversión al riesgo.' },
];

const BOND_REGIONS = {
  americas: {
    label: 'Américas', icon: 'fa-earth-americas', summary: 'Referencia global, carry latinoamericano y sensibilidad a materias primas.',
    markets: [
      { flag: 'US', market: 'Estados Unidos', instrument: 'Treasury', curve: '2Y · 10Y · 30Y', driver: 'Fed, inflación y prima por plazo', role: 'Referencia mundial' },
      { flag: 'CA', market: 'Canadá', instrument: 'GoC Bonds', curve: '2Y · 10Y', driver: 'BoC, petróleo y ciclo de EE.UU.', role: 'Deuda desarrollada' },
      { flag: 'MX', market: 'México', instrument: 'CETES · MBonos', curve: '28D · 2Y · 10Y', driver: 'Banxico, inflación y peso', role: 'Carry emergente' },
      { flag: 'BR', market: 'Brasil', instrument: 'DI · NTN-F', curve: '2Y · 10Y', driver: 'Selic, fiscal e inflación', role: 'Carry de alta beta' },
    ],
  },
  europe: {
    label: 'Europa', icon: 'fa-earth-europe', summary: 'Núcleo soberano, fragmentación fiscal y transmisión de la política del BCE.',
    markets: [
      { flag: 'DE', market: 'Alemania', instrument: 'Bund', curve: '2Y · 10Y · 30Y', driver: 'BCE, crecimiento e inflación', role: 'Activo refugio EUR' },
      { flag: 'FR', market: 'Francia', instrument: 'OAT', curve: '2Y · 10Y', driver: 'Fiscal y spread contra Bund', role: 'Crédito soberano core' },
      { flag: 'IT', market: 'Italia', instrument: 'BTP', curve: '2Y · 10Y', driver: 'Deuda pública y riesgo político', role: 'Spread periférico' },
      { flag: 'GB', market: 'Reino Unido', instrument: 'Gilt', curve: '2Y · 10Y · 30Y', driver: 'BoE, salarios e inflación', role: 'Mercado GBP' },
    ],
  },
  asia: {
    label: 'Asia–Pacífico', icon: 'fa-earth-asia', summary: 'Normalización japonesa, liquidez china y exposición al ciclo de materias primas.',
    markets: [
      { flag: 'JP', market: 'Japón', instrument: 'JGB', curve: '2Y · 10Y · 30Y', driver: 'BoJ, salarios y yen', role: 'Ancla de bajo rendimiento' },
      { flag: 'CN', market: 'China', instrument: 'CGB', curve: '2Y · 10Y', driver: 'PBoC, crédito y actividad', role: 'Diversificador RMB' },
      { flag: 'AU', market: 'Australia', instrument: 'ACGB', curve: '3Y · 10Y', driver: 'RBA, China y commodities', role: 'Ciclo Asia–Pacífico' },
      { flag: 'IN', market: 'India', instrument: 'G-Sec', curve: '5Y · 10Y', driver: 'RBI, alimentos y crecimiento', role: 'Deuda emergente local' },
    ],
  },
  emerging: {
    label: 'Emergentes', icon: 'fa-globe', summary: 'Prima real, riesgo cambiario, liquidez y disciplina fiscal en moneda local.',
    markets: [
      { flag: 'MX', market: 'México', instrument: 'MBonos', curve: '2Y · 10Y', driver: 'Carry, peso y Banxico', role: 'LatAm defensivo' },
      { flag: 'BR', market: 'Brasil', instrument: 'NTN-F', curve: '2Y · 10Y', driver: 'Selic y marco fiscal', role: 'LatAm alto rendimiento' },
      { flag: 'ZA', market: 'Sudáfrica', instrument: 'SAGB', curve: '5Y · 10Y', driver: 'Rand, energía y fiscal', role: 'Carry África' },
      { flag: 'ID', market: 'Indonesia', instrument: 'SUN', curve: '5Y · 10Y', driver: 'Rupia, commodities y flujos', role: 'Carry Asia' },
    ],
  },
};

const GLOBAL_BOND_MONITORS = [
  { icon: 'fa-building-columns', title: 'Bancos centrales', body: 'Fed, BCE, BoE, BoJ, PBoC y bancos emergentes determinan el nivel corto de cada curva.' },
  { icon: 'fa-fire', title: 'Inflación', body: 'CPI, PCE, salarios y expectativas break-even definen cuánto rendimiento real exige el mercado.' },
  { icon: 'fa-chart-area', title: 'Prima por plazo', body: 'Compensa duración, oferta de deuda e incertidumbre. Puede elevar el tramo largo incluso sin subidas oficiales.' },
  { icon: 'fa-money-bill-transfer', title: 'Divisas y cobertura', body: 'El rendimiento internacional debe evaluarse después del costo de cubrir USD, EUR, JPY o moneda emergente.' },
  { icon: 'fa-landmark', title: 'Riesgo fiscal', body: 'Déficit, deuda y subastas influyen en spreads soberanos y en la demanda por vencimientos largos.' },
  { icon: 'fa-droplet', title: 'Liquidez', body: 'Profundidad, volatilidad y bid–ask importan tanto como el cupón cuando el mercado entra en tensión.' },
];

function BondGlobalTerminal() {
  const [region, setRegion] = useState('americas');
  const [duration, setDuration] = useState(7);
  const [shock, setShock] = useState(50);
  const current = BOND_REGIONS[region];
  const priceImpact = -(duration * shock / 100);

  return (
    <section className="fin-depth fin-depth-bonds bond-terminal" aria-label="Terminal global de tasas y bonos">
      <div className="bond-terminal-hero">
        <div>
          <span className="fin-depth-kicker"><i className="fas fa-globe" /> Renta fija internacional</span>
          <h2>Terminal Global de Tasas y Bonos</h2>
          <p>Compara curvas soberanas, ciclos monetarios y riesgos de duración en mercados desarrollados y emergentes.</p>
        </div>
        <div className="bond-terminal-status"><span /> COBERTURA GLOBAL</div>
      </div>

      <nav className="bond-quick-nav" aria-label="Contenido de la terminal">
        <a href="#bond-regional"><i className="fas fa-earth-americas" /> Regiones</a>
        <a href="#bond-sensitivity"><i className="fas fa-calculator" /> Sensibilidad</a>
        <a href="#bond-risks"><i className="fas fa-radar" /> Riesgos</a>
        <a href="#bond-playbook"><i className="fas fa-compass" /> Escenarios</a>
      </nav>

      <div className="bond-overview-grid">
        <article><i className="fas fa-chart-line" /><span>Curva soberana</span><strong>2Y · 10Y · 30Y</strong><small>Política, ciclo y prima por plazo</small></article>
        <article><i className="fas fa-building-columns" /><span>Política monetaria</span><strong>6 bancos clave</strong><small>Fed · BCE · BoE · BoJ · PBoC · EM</small></article>
        <article><i className="fas fa-scale-balanced" /><span>Valor relativo</span><strong>Spreads globales</strong><small>País, divisa, crédito y cobertura</small></article>
        <article><i className="fas fa-shield-halved" /><span>Gestión de riesgo</span><strong>Duración + FX</strong><small>Sensibilidad, liquidez e inflación</small></article>
      </div>

      <div className="bond-terminal-section" id="bond-regional">
        <div className="bond-section-heading">
          <div><span>UNIVERSO SOBERANO</span><h3>Comparador regional</h3></div>
          <p>{current.summary}</p>
        </div>
        <div className="bond-region-tabs" role="tablist" aria-label="Región de renta fija">
          {Object.entries(BOND_REGIONS).map(([key, item]) => (
            <button key={key} type="button" role="tab" aria-selected={region === key} className={region === key ? 'active' : ''} onClick={() => setRegion(key)}>
              <i className={`fas ${item.icon}`} /> {item.label}
            </button>
          ))}
        </div>
        <div className="bond-market-table" role="table" aria-label={`Mercados de ${current.label}`}>
          <div className="bond-market-head" role="row"><span>Mercado</span><span>Instrumento</span><span>Curva</span><span>Principal impulsor</span><span>Función</span></div>
          {current.markets.map((item) => (
            <article className="bond-market-row" role="row" key={`${region}-${item.market}`}>
              <div className="bond-market-country"><b>{item.flag}</b><strong>{item.market}</strong></div>
              <span data-label="Instrumento">{item.instrument}</span>
              <span data-label="Curva" className="mono">{item.curve}</span>
              <span data-label="Impulsor">{item.driver}</span>
              <em>{item.role}</em>
            </article>
          ))}
        </div>
      </div>

      <div className="bond-analysis-layout">
        <div className="bond-terminal-section" id="bond-sensitivity">
          <div className="bond-section-heading compact"><div><span>HERRAMIENTA</span><h3>Simulador de duración</h3></div></div>
          <p className="bond-tool-intro">Estimación lineal del cambio de precio ante un movimiento paralelo de tasas. Sirve para comparar sensibilidad, no sustituye convexidad.</p>
          <label className="bond-slider-label"><span>Duración modificada</span><b>{duration.toFixed(1)} años</b></label>
          <input type="range" min="1" max="20" step="0.5" value={duration} onChange={(event) => setDuration(Number(event.target.value))} />
          <label className="bond-slider-label"><span>Movimiento de rendimiento</span><b>{shock > 0 ? '+' : ''}{shock} pb</b></label>
          <input type="range" min="-200" max="200" step="10" value={shock} onChange={(event) => setShock(Number(event.target.value))} />
          <div className={`bond-impact-result ${priceImpact > 0 ? 'positive' : priceImpact < 0 ? 'negative' : ''}`}>
            <span>Impacto aproximado en precio</span>
            <strong>{priceImpact > 0 ? '+' : ''}{priceImpact.toFixed(2)}%</strong>
            <small>Fórmula: − duración × cambio de tasa</small>
          </div>
        </div>

        <div className="bond-terminal-section" id="bond-risks">
          <div className="bond-section-heading compact"><div><span>LECTURA MULTIFACTOR</span><h3>Qué mueve a los bonos globales</h3></div></div>
          <div className="bond-monitor-grid">
            {GLOBAL_BOND_MONITORS.map((item) => (
              <article key={item.title}><i className={`fas ${item.icon}`} /><div><strong>{item.title}</strong><p>{item.body}</p></div></article>
            ))}
          </div>
        </div>
      </div>

      <div className="bond-terminal-section" id="bond-playbook">
        <div className="bond-section-heading">
          <div><span>GUÍA DE INTERPRETACIÓN</span><h3>Transmisión y escenarios</h3></div>
          <p>Una lectura global exige separar movimiento de tasas, riesgo cambiario y calidad crediticia.</p>
        </div>
        <div className="fin-depth-grid four">
          {BOND_CHANNELS.map((item) => (
            <article className="fin-depth-card" key={item.title}><i className={`fas ${item.icon}`} /><h3>{item.title}</h3><p>{item.body}</p></article>
          ))}
        </div>
        <div className="fin-scenario-grid">
          <article className="fin-scenario positive"><span>Desinflación ordenada</span><strong>Duración favorecida</strong><p>Caen tasas sin recesión severa; suelen beneficiarse soberanos largos y crédito de calidad.</p></article>
          <article className="fin-scenario neutral"><span>Curvas divergentes</span><strong>Selección regional</strong><p>Los bancos centrales avanzan a ritmos distintos; importan diferencial de tasas y costo de cobertura.</p></article>
          <article className="fin-scenario negative"><span>Inflación o estrés fiscal</span><strong>Presión sobre tramo largo</strong><p>Suben rendimientos exigidos; deuda corta, inflación ligada y menor duración reducen sensibilidad.</p></article>
        </div>
      </div>
    </section>
  );
}

function BondGovernmentGuide() {
  const [curve, setCurve] = useState(null);
  const [selectedMaturity, setSelectedMaturity] = useState('10 años');

  useEffect(() => {
    const source = document.querySelector('#bonds-us');
    if (!source) return undefined;

    const readCurve = () => {
      const points = [...source.querySelectorAll('.bond-pill')].map((card) => {
        const changeText = card.querySelector('.bp-chg')?.textContent || '';
        const changeMagnitude = Number.parseFloat(changeText.replace(/[^\d.-]/g, ''));
        return {
          maturity: card.querySelector('.bp-mat')?.textContent?.trim() || '',
          yield: Number.parseFloat(card.querySelector('.bp-yld')?.textContent || ''),
          change: Number.isFinite(changeMagnitude) ? (changeText.includes('▼') ? -changeMagnitude : changeMagnitude) : null,
        };
      }).filter((point) => Number.isFinite(point.yield));
      if (points.length < 2) return;
      const first = points[0];
      const last = points.at(-1);
      const five = points.find((point) => /5\s*años|5y/i.test(point.maturity));
      const ten = points.find((point) => /10\s*años|10y/i.test(point.maturity));
      const slope = (last.yield - first.yield) * 100;
      const belly = five && ten ? (ten.yield - five.yield) * 100 : null;
      const changes = points.filter((point) => Number.isFinite(point.change)).map((point) => point.change * 100);
      const averageMove = changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null;
      const regime = slope < 0 ? 'Invertida' : slope > 100 ? 'Empinada' : 'Normal';
      const interpretation = slope < 0
        ? 'El tramo corto paga más que el largo. El mercado refleja una política restrictiva y menor crecimiento esperado.'
        : slope > 100
          ? 'El tramo largo exige una prima claramente mayor. Vigila inflación, oferta de deuda y riesgo fiscal.'
          : 'La compensación aumenta gradualmente con el vencimiento. La curva mantiene una estructura equilibrada.';
      setCurve({ points, slope, belly, averageMove, regime, interpretation });
    };

    const observer = new MutationObserver(readCurve);
    observer.observe(source, { childList: true, subtree: true, characterData: true });
    readCurve();
    const retry = window.setInterval(readCurve, 1000);
    const stopRetry = window.setTimeout(() => window.clearInterval(retry), 15000);
    return () => {
      observer.disconnect();
      window.clearInterval(retry);
      window.clearTimeout(stopRetry);
    };
  }, []);

  useEffect(() => {
    const index = curve?.points?.findIndex((point) => point.maturity === selectedMaturity) ?? -1;
    document.querySelectorAll('#bonds-us .bond-pill').forEach((card, cardIndex) => {
      card.classList.toggle('is-focused', cardIndex === index);
    });
    const chart = window.Chart?.getChart?.('bonds-curve-chart');
    if (chart && index >= 0) {
      chart.setActiveElements([{ datasetIndex: 0, index }]);
      chart.update('none');
    }
  }, [curve, selectedMaturity]);

  const signed = (value, suffix = ' pb') => Number.isFinite(value)
    ? `${value > 0 ? '+' : ''}${value.toFixed(1)}${suffix}`
    : '—';
  const selectedPoint = curve?.points?.find((point) => point.maturity === selectedMaturity);
  const selectedIndex = curve?.points?.findIndex((point) => point.maturity === selectedMaturity) ?? -1;
  const focusProfiles = [
    { name: 'Liquidez y Fed', detail: 'Refleja la tasa vigente, expectativas inmediatas y demanda por instrumentos de corto plazo.' },
    { name: 'Ciclo monetario', detail: 'Resume la trayectoria esperada de tasas, crecimiento e inflación durante los próximos años.' },
    { name: 'Referencia global', detail: 'Es el benchmark para hipotecas, crédito corporativo y valuación de activos internacionales.' },
    { name: 'Prima de largo plazo', detail: 'Concentra inflación estructural, oferta de deuda, riesgo fiscal y demanda institucional.' },
  ];
  const focusProfile = focusProfiles[Math.max(0, selectedIndex)] || focusProfiles[2];
  const priceSignal = !Number.isFinite(selectedPoint?.change) || selectedPoint.change === 0
    ? 'Precio estable'
    : selectedPoint.change > 0 ? 'Precio bajo presión' : 'Precio favorecido';

  return (
    <div className="bond-government-experience">
      <section className="bond-live-analytics" aria-label="Analítica dinámica de la curva">
        <div className="bond-live-heading">
          <div><span><i className="fas fa-wave-square" /> ANALÍTICA DE CURVA</span><strong>Lectura automática</strong></div>
          <em><i /> DATOS ACTUALIZADOS</em>
        </div>
        <div className="bond-analytics-grid">
          <article><span>Régimen</span><strong className={`regime-${curve?.regime?.toLowerCase() || 'loading'}`}>{curve?.regime || 'Calculando…'}</strong><small>Estructura 3M–30Y</small></article>
          <article><span>Pendiente total</span><strong>{signed(curve?.slope)}</strong><small>30Y menos 3M</small></article>
          <article><span>Pendiente media</span><strong>{signed(curve?.belly)}</strong><small>10Y menos 5Y</small></article>
          <article><span>Movimiento promedio</span><strong>{signed(curve?.averageMove)}</strong><small>Contra sesión anterior</small></article>
        </div>
        <div className="bond-auto-reading">
          <i className="fas fa-lightbulb" />
          <div><strong>Qué está diciendo la curva</strong><p>{curve?.interpretation || 'Esperando los rendimientos para construir la lectura…'}</p></div>
        </div>
        <div className="bond-maturity-focus">
          <div className="bond-focus-selector">
            <span>Analizar vencimiento</span>
            <div role="group" aria-label="Seleccionar vencimiento">
              {curve?.points?.map((point) => (
                <button type="button" key={point.maturity} className={selectedMaturity === point.maturity ? 'active' : ''} aria-pressed={selectedMaturity === point.maturity} onClick={() => setSelectedMaturity(point.maturity)}>
                  {point.maturity.replace(' meses', 'M').replace(' años', 'Y')}
                </button>
              )) || <button type="button" disabled>Cargando…</button>}
            </div>
          </div>
          <div className="bond-focus-detail">
            <div><span>Rendimiento</span><strong>{Number.isFinite(selectedPoint?.yield) ? `${selectedPoint.yield.toFixed(2)}%` : '—'}</strong></div>
            <div><span>Cambio diario</span><strong>{signed(Number.isFinite(selectedPoint?.change) ? selectedPoint.change * 100 : null)}</strong></div>
            <div><span>Impacto en precio</span><strong className={selectedPoint?.change > 0 ? 'negative' : selectedPoint?.change < 0 ? 'positive' : ''}>{priceSignal}</strong></div>
            <div className="bond-focus-explanation"><span>{focusProfile.name}</span><p>{focusProfile.detail}</p></div>
          </div>
        </div>
      </section>

      <section className="bond-government-guide" aria-label="Guía para interpretar la curva gubernamental">
        <div className="bond-guide-intro">
          <span><i className="fas fa-graduation-cap" /> LECTURA DE LA CURVA</span>
          <strong>Qué representa cada tramo</strong>
          <p>La curva no es sólo una línea: resume expectativas de política monetaria, crecimiento e inflación.</p>
        </div>
        <div className="bond-guide-steps">
          <article><b>01</b><div><span>Corto plazo · 3M–2Y</span><p>Responde principalmente a la tasa actual y a las próximas decisiones de la Fed.</p></div></article>
          <article><b>02</b><div><span>Tramo medio · 5Y–10Y</span><p>Combina expectativas de inflación, crecimiento y trayectoria futura de tasas.</p></div></article>
          <article><b>03</b><div><span>Largo plazo · 30Y</span><p>Incorpora prima por plazo, oferta de deuda y riesgos fiscales de largo horizonte.</p></div></article>
        </div>
        <div className="bond-inverse-rule">
          <i className="fas fa-arrow-trend-up" />
          <div><strong>Regla esencial</strong><span>Rendimiento sube → precio del bono baja · Rendimiento baja → precio sube</span></div>
        </div>
      </section>
    </div>
  );
}

function EconomicCalendarCommand() {
  const [events, setEvents] = useState([]);
  const [region, setRegion] = useState('all');
  const [impact, setImpact] = useState('all');
  const [status, setStatus] = useState('upcoming');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [actionStatus, setActionStatus] = useState('');

  useEffect(() => {
    const cards = [...document.querySelectorAll('#cal-event-grid .cal-card')];
    const parsed = cards.map((card, index) => {
      const title = card.querySelector('.cal-card-title')?.textContent?.trim() || 'Evento económico';
      const description = card.querySelector('.cal-card-desc')?.textContent?.trim() || '';
      const dateText = card.querySelector('.cal-card-date')?.textContent?.trim() || '';
      const searchable = `${title} ${description} ${dateText}`.toLowerCase();
      const eventRegion = /méxico|banxico|inpc|pib méxico/.test(searchable)
        ? 'mx' : /ee\.uu|fed|fomc|pce|nfp|cpi|desempleo/.test(searchable)
          ? 'us' : /boe|inglaterra|bce|euro|japón|boj|china|pboc/.test(searchable) ? 'other' : 'global';
      return {
        id: `${card.dataset.date || 'event'}-${index}`,
        element: card,
        date: card.dataset.date || '',
        dateText,
        title,
        description,
        searchable,
        region: eventRegion,
        impact: card.classList.contains('high') ? 'high' : 'medium',
        meta: [...card.querySelectorAll('.cal-card-pill')].map((pill) => pill.textContent.trim()),
      };
    });
    setEvents(parsed);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next = parsed.filter((event) => event.date && new Date(`${event.date}T12:00:00`) >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0] || parsed[0];
    setSelectedId(next?.id || null);

    const onCardClick = (event) => {
      const card = event.target.closest('.cal-card');
      const selected = parsed.find((item) => item.element === card);
      if (selected) setSelectedId(selected.id);
    };
    const onCardKeyDown = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const card = event.target.closest('.cal-card');
      const selected = parsed.find((item) => item.element === card);
      if (selected) {
        event.preventDefault();
        setSelectedId(selected.id);
      }
    };
    const grid = document.querySelector('#cal-event-grid');
    grid?.addEventListener('click', onCardClick);
    grid?.addEventListener('keydown', onCardKeyDown);
    return () => {
      grid?.removeEventListener('click', onCardClick);
      grid?.removeEventListener('keydown', onCardKeyDown);
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isUpcoming = (event) => event.date && new Date(`${event.date}T12:00:00`) >= today;
  const visibleEvents = events.filter((event) => (
    (region === 'all' || event.region === region)
    && (impact === 'all' || event.impact === impact)
    && (status === 'all' || (status === 'upcoming' ? isUpcoming(event) : !isUpcoming(event)))
    && (!normalizedQuery || event.searchable.includes(normalizedQuery))
  ));
  const visibleIds = new Set(visibleEvents.map((event) => event.id));

  useEffect(() => {
    events.forEach((event) => {
      event.element.classList.toggle('vn-calendar-filter-hidden', !visibleIds.has(event.id));
      event.element.classList.toggle('is-calendar-selected', event.id === selectedId);
      event.element.setAttribute('tabindex', '0');
    });
  }, [events, region, impact, status, normalizedQuery, selectedId]);

  useEffect(() => {
    if (selectedId && visibleIds.has(selectedId)) return;
    setSelectedId(visibleEvents[0]?.id || null);
  }, [events, region, impact, status, normalizedQuery, selectedId]);

  const selected = events.find((event) => event.id === selectedId) || visibleEvents[0];
  const upcoming = events.filter(isUpcoming);
  const next = [...upcoming].sort((a, b) => a.date.localeCompare(b.date))[0];
  const timeline = [...upcoming].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const daysToNext = next ? Math.round((new Date(`${next.date}T00:00:00`) - today) / 86400000) : null;
  const reset = () => { setRegion('all'); setImpact('all'); setStatus('upcoming'); setQuery(''); };
  const impactAssets = (() => {
    const text = selected?.searchable || '';
    if (/banxico|inpc|pib méxico/.test(text)) return ['USD/MXN', 'MBonos', 'IPC México', 'Crédito local'];
    if (/fomc|fed/.test(text)) return ['US Treasury', 'Dólar', 'S&P 500', 'Mercados EM'];
    if (/cpi|pce|inflación/.test(text)) return ['Bonos', 'Dólar', 'Oro', 'Acciones growth'];
    if (/nfp|desempleo/.test(text)) return ['Dólar', 'Treasury 2Y', 'S&P 500', 'Fed Funds'];
    if (/boe|inglaterra/.test(text)) return ['Gilts', 'GBP', 'FTSE 100', 'GBP/MXN'];
    return ['Bonos globales', 'Divisas', 'Acciones', 'Volatilidad'];
  })();

  const notifyAction = (message) => {
    setActionStatus(message);
    window.setTimeout(() => setActionStatus(''), 2200);
  };
  const copySelected = async () => {
    if (!selected) return;
    const text = `${selected.title}\n${selected.dateText}\n${selected.description}\n${selected.meta.join(' · ')}`;
    try {
      await navigator.clipboard.writeText(text);
      notifyAction('Evento copiado');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      notifyAction('Evento copiado');
    }
  };
  const exportSelected = () => {
    if (!selected?.date) return;
    const start = selected.date.replaceAll('-', '');
    const endDate = new Date(`${selected.date}T00:00:00`);
    endDate.setDate(endDate.getDate() + 1);
    const end = `${endDate.getFullYear()}${String(endDate.getMonth() + 1).padStart(2, '0')}${String(endDate.getDate()).padStart(2, '0')}`;
    const escapeIcs = (value) => String(value).replaceAll('\\', '\\\\').replaceAll(',', '\\,').replaceAll(';', '\\;').replaceAll('\n', '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VALLNews//Calendario Economico//ES', 'BEGIN:VEVENT', `UID:${selected.id}@vallnews`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, `SUMMARY:${escapeIcs(selected.title)}`, `DESCRIPTION:${escapeIcs(selected.description)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selected.title.replace(/[^a-z0-9áéíóúñ]+/gi, '_')}.ics`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notifyAction('Calendario preparado');
  };

  return (
    <section className="economic-calendar-command" aria-label="Centro de control del calendario económico">
      <div className="calendar-command-head">
        <div><span><i className="fas fa-calendar-check" /> AGENDA MACRO GLOBAL</span><strong>Centro de eventos económicos</strong><p>Filtra publicaciones y decisiones que pueden mover tasas, divisas, bonos y mercados internacionales.</p></div>
        <div className="calendar-coverage"><i /> COBERTURA JUN–SEP 2026</div>
      </div>

      <div className="calendar-stat-grid">
        <article><i className="fas fa-calendar-days" /><div><span>Próximos</span><strong>{upcoming.length}</strong><small>Desde hoy</small></div></article>
        <article><i className="fas fa-triangle-exclamation" /><div><span>Alto impacto</span><strong>{events.filter((event) => event.impact === 'high').length}</strong><small>Requieren atención</small></div></article>
        <article><i className="fas fa-flag-usa" /><div><span>Estados Unidos</span><strong>{events.filter((event) => event.region === 'us').length}</strong><small>Fed y datos clave</small></div></article>
        <article><i className="fas fa-earth-americas" /><div><span>México</span><strong>{events.filter((event) => event.region === 'mx').length}</strong><small>Banxico y actividad</small></div></article>
      </div>

      {next && (
        <div className="calendar-next-event">
          <div className={`calendar-next-date ${next.impact}`}><strong>{daysToNext === 0 ? 'HOY' : daysToNext === 1 ? 'MAÑANA' : `EN ${daysToNext} DÍAS`}</strong><span>{next.dateText}</span></div>
          <div><span>PRÓXIMO CATALIZADOR</span><strong>{next.title}</strong><p>{next.description}</p></div>
          <button type="button" onClick={() => setSelectedId(next.id)}>Ver detalle <i className="fas fa-arrow-right" /></button>
        </div>
      )}

      <div className="calendar-timeline" aria-label="Siguientes catalizadores">
        <span>PRÓXIMOS EN LÍNEA</span>
        <div>{timeline.map((event, index) => (
          <button type="button" key={event.id} className={selectedId === event.id ? 'active' : ''} onClick={() => setSelectedId(event.id)}>
            <b>{index + 1}</b><span>{event.dateText}</span><strong>{event.title}</strong><i className={`impact-${event.impact}`} />
          </button>
        ))}</div>
      </div>

      <div className="calendar-filter-row">
        <label className="calendar-search"><i className="fas fa-magnifying-glass" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar Fed, inflación, Banxico…" aria-label="Buscar eventos" /></label>
        <div className="calendar-segments" aria-label="Filtrar por país">
          {[['all', 'Todos'], ['us', 'EE.UU.'], ['mx', 'México'], ['other', 'Otros']].map(([value, label]) => <button type="button" key={value} className={region === value ? 'active' : ''} onClick={() => setRegion(value)}>{label}</button>)}
        </div>
        <div className="calendar-segments impact" aria-label="Filtrar por impacto">
          {[['all', 'Todo impacto'], ['high', 'Alto'], ['medium', 'Medio']].map(([value, label]) => <button type="button" key={value} className={impact === value ? 'active' : ''} onClick={() => setImpact(value)}>{label}</button>)}
        </div>
        <div className="calendar-segments status" aria-label="Filtrar por fecha">
          {[['upcoming', 'Próximos'], ['past', 'Pasados'], ['all', 'Todos']].map(([value, label]) => <button type="button" key={value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>{label}</button>)}
        </div>
        <button type="button" className="calendar-reset" onClick={reset} title="Restablecer filtros"><i className="fas fa-rotate-left" /></button>
      </div>

      <div className="calendar-results-line"><span>{visibleEvents.length} de {events.length} eventos visibles</span>{visibleEvents.length === 0 && <strong>No hay coincidencias. Prueba otros filtros.</strong>}</div>

      {selected && (
        <div className="calendar-selected-detail">
          <div className={`calendar-detail-impact ${selected.impact}`}><i className={selected.impact === 'high' ? 'fas fa-bolt' : 'fas fa-circle-info'} /><span>{selected.impact === 'high' ? 'ALTO IMPACTO' : 'IMPACTO MEDIO'}</span></div>
          <div className="calendar-detail-copy"><span>{selected.dateText}</span><strong>{selected.title}</strong><p>{selected.description}</p></div>
          <div className="calendar-detail-meta">{selected.meta.map((item) => <span key={item}>{item}</span>)}</div>
          <div className="calendar-asset-impact"><span>Puede mover</span><div>{impactAssets.map((asset) => <b key={asset}>{asset}</b>)}</div></div>
          <div className="calendar-detail-actions">
            <button type="button" onClick={copySelected}><i className="fas fa-copy" /> Copiar</button>
            <button type="button" onClick={exportSelected}><i className="fas fa-calendar-plus" /> Agregar al calendario</button>
            {actionStatus && <span><i className="fas fa-check" /> {actionStatus}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

function FinanceDepth({ activeTab, bondsTarget }) {
  if (activeTab !== 'bonos' && activeTab !== 'riesgo') return null;

  if (activeTab === 'bonos') {
    const content = <BondGlobalTerminal />;
    return bondsTarget ? createPortal(content, bondsTarget) : content;
  }

  return (
    <section className="fin-depth fin-depth-risk" aria-label="Análisis ampliado de riesgo y macroeconomía">
      <div className="fin-depth-heading">
        <div>
          <span className="fin-depth-kicker"><i className="fas fa-radar" /> Tablero de decisión</span>
          <h2>Mapa de transmisión macro y riesgo</h2>
          <p>Lee las señales en conjunto: una sola métrica puede dar ruido; la confirmación entre dólar, tasas, volatilidad y crédito es más útil.</p>
        </div>
        <span className="fin-depth-badge">CONFIRMACIÓN MULTIACTIVO</span>
      </div>
      <div className="fin-depth-grid four">
        {MACRO_CHANNELS.map((item) => (
          <article className={`fin-depth-card tone-${item.tone}`} key={item.title}>
            <i className={`fas ${item.icon}`} aria-hidden="true" />
            <div className="fin-depth-signal">{item.signal}</div>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
      <div className="fin-scenario-grid">
        <article className="fin-scenario positive">
          <span>Entorno constructivo</span>
          <strong>DXY ↓ · VIX ↓ · HYG &gt; LQD</strong>
          <p>Mejora el apetito de riesgo y suelen beneficiarse acciones, crédito y monedas emergentes.</p>
        </article>
        <article className="fin-scenario neutral">
          <span>Señales mixtas</span>
          <strong>Confirmación pendiente</strong>
          <p>Reduce conclusiones direccionales; compara el movimiento con tasas reales, liquidez y datos macro próximos.</p>
        </article>
        <article className="fin-scenario negative">
          <span>Entorno defensivo</span>
          <strong>DXY ↑ · VIX/MOVE ↑ · crédito débil</strong>
          <p>Aumenta la demanda por liquidez y calidad; el peso y los activos de mayor beta quedan más expuestos.</p>
        </article>
      </div>
    </section>
  );
}

// La página tradicional incluye su propio header. En React ya se monta Header,
// así que retiramos únicamente esa copia para evitar dos barras superpuestas,
// IDs duplicados y menús móviles compitiendo entre sí.
const FINANZAS_REACT_HTML = FINANZAS_HTML.replace(
  /<header class="header">[\s\S]*?<\/header>\s*<div class="hdr-divider"><\/div>/,
  ''
).replace(
  /<footer class="footer">[\s\S]*?<\/footer>/,
  ''
);

// Finanzas es la terminal más grande (6583 líneas, 9 CSS, 23 scripts inline, Chart.js,
// web components filter-bar/chart-card, AOS). Como Inicio/Mercados: React posee la ruta
// y monta el markup verbatim, reutilizando su lógica probada (js/finanzas-page.js).
export default function Finanzas() {
  const contentRef = useRef(null);
  const [bondsDepthTarget, setBondsDepthTarget] = useState(null);
  const [bondsGuideTarget, setBondsGuideTarget] = useState(null);
  const [calendarCommandTarget, setCalendarCommandTarget] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem('fin_active_tab');
      return ['general', 'mercados', 'bonos', 'riesgo'].includes(saved) ? saved : 'general';
    } catch {
      return 'general';
    }
  });

  usePageStyles([
    '/css/header.css?v=6', '/css/footer.css', '/css/responsive.css',
    'https://unpkg.com/aos@2.3.1/dist/aos.css',
    '/css/immersive.css?v=11', '/css/finanzas.css?v=11', '/css/finanzas-bento.css?v=35',
    '/css/finanzas-glass.css?v=1', '/css/finanzas-hub.css?v=1', '/css/finanzas-mercados-locales.css?v=1',
    '/css/finanzas-mexico-dense.css?v=33', '/css/finanzas-global-dense.css?v=36', '/css/finanzas-bonds-dense.css?v=33',
    '/css/finanzas-responsive-polish.css?v=17',
  ]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const financeScriptWasLoaded = Boolean(
        document.querySelector('script[data-vn-legacy="/js/finanzas-page.js"]')
      );
      await loadScriptsInOrder([
        '/js/api-keys.js?v=3',
        '/js/data-service.js?v=15',
        CHARTJS,
        LWC,
        '/js/components/filter-bar.js',
        '/js/components/chart-card.js?v=6',
        AOS_JS,
        '/js/flags-widget.js',
        '/js/mailbox.js',
        ['/js/chat-widget.js?v=24', { 'data-mascota': '/Logotipos/mascota-atlas.svg' }],
        '/js/finanzas-page.js?v=17',
      ]);
      if (disposed) return;
      // finanzas-page.js registra 9 listeners DOMContentLoaded (ya disparado en la SPA);
      // lo re-emitimos para que inicialicen sobre el markup ya montado.
      // IMPORTANTE: 5 de esos listeners están en `window` (p.ej. el que trasplanta los
      // paneles a global-dense-wrapper en la sección Mercados). Un Event sin bubbles se
      // queda en `document` y nunca llega a `window`; con { bubbles: true } sube hasta
      // `window` y también los dispara. Sin esto, Mercados/Global quedan vacíos.
      document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true }));
      if (financeScriptWasLoaded && typeof window.vnReinitializeFinanzasCharts === 'function') {
        await window.vnReinitializeFinanzasCharts();
      }
      window.scrollTo(0, 0);
    })();
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return undefined;

    const bondsSlot = root.querySelector('#slot-bonds-top');
    const bondsReactMount = document.createElement('div');
    bondsReactMount.className = 'vn-bonds-react-slot';
    bondsSlot?.prepend(bondsReactMount);
    setBondsDepthTarget(bondsReactMount);
    const bondsPanel = root.querySelector('#bonds-panel');
    const bondsGuideMount = document.createElement('div');
    bondsGuideMount.className = 'vn-bonds-guide-slot';
    bondsPanel?.append(bondsGuideMount);
    setBondsGuideTarget(bondsGuideMount);
    const calendarPanel = root.querySelector('#calendar-panel-main');
    const calendarCommandMount = document.createElement('div');
    calendarCommandMount.className = 'vn-calendar-command-slot';
    const calendarLayout = calendarPanel?.querySelector('.cal-master-detail-layout');
    calendarPanel?.insertBefore(calendarCommandMount, calendarLayout || null);
    setCalendarCommandTarget(calendarCommandMount);

    const allowedStyles = new Set(['candlestick', 'line', 'area', 'bar']);
    const styleKey = 'vn_bmv_chart_style';

    const setBmvStyle = (requested, persist = true) => {
      const style = allowedStyles.has(requested) ? requested : 'candlestick';
      const card = root.querySelector('#bmv-chart');
      const select = root.querySelector('#bmv-chart-style');
      if (card?.getAttribute('chart-type') !== style) card?.setAttribute('chart-type', style);
      if (select && select.value !== style) select.value = style;
      root.querySelectorAll('[data-chart-style-shortcut]').forEach((button) => {
        const active = button.dataset.chartStyleShortcut === style;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      if (persist) {
        try { localStorage.setItem(styleKey, style); } catch { /* preferencias opcionales */ }
      }
    };

    const setOpenButton = (button, open) => {
      if (!button) return;
      button.setAttribute('aria-pressed', String(open));
      button.innerHTML = open
        ? '<i class="fas fa-compress" aria-hidden="true"></i> Cerrar análisis completo'
        : '<i class="fas fa-expand" aria-hidden="true"></i> Abrir análisis completo';
    };

    const closeFocus = () => {
      const panel = root.querySelector('.chart-focus-mode');
      if (!panel) return;
      const card = panel.querySelector('#bmv-chart');
      if (card?.dataset.vnReactOriginalHeight) {
        card.setAttribute('height', card.dataset.vnReactOriginalHeight);
        delete card.dataset.vnReactOriginalHeight;
      }
      panel.classList.remove('chart-focus-mode');
      document.body.classList.remove('vn-chart-focus-open');
      setOpenButton(root.querySelector('[data-chart-open="bmv-chart"]'), false);
      requestAnimationFrame(() => card?.resize?.());
    };

    const toggleFocus = (button) => {
      const card = root.querySelector(`#${button.dataset.chartOpen}`);
      const panel = card?.closest('.chart-experience-main, .panel, .bonds-curve-wrap');
      if (!card || !panel) return;
      if (panel.classList.contains('chart-focus-mode')) {
        closeFocus();
        return;
      }
      card.dataset.vnReactOriginalHeight = card.getAttribute('height') || '470';
      panel.classList.add('chart-focus-mode');
      document.body.classList.add('vn-chart-focus-open');
      setOpenButton(button, true);
      requestAnimationFrame(() => {
        const panelRect = panel.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const available = panel.clientHeight - (cardRect.top - panelRect.top) - 66;
        card.setAttribute('height', String(Math.max(360, Math.floor(available))));
        card.resize?.();
      });
    };

    // Estas marcas mantienen un solo propietario para cada interacción y evitan
    // que el adaptador legacy vuelva a registrar listeners sobre la ruta React.
    root.querySelectorAll('[data-chart-jump]').forEach((button) => { button.dataset.chartJumpReady = '1'; });
    root.querySelectorAll('[data-chart-style-shortcut]').forEach((button) => { button.dataset.shortcutReady = '1'; });
    root.querySelectorAll('[data-chart-open]').forEach((button) => { button.dataset.chartOpenReady = '1'; });

    const onClick = (event) => {
      const jump = event.target.closest('[data-chart-jump]');
      if (jump && root.contains(jump)) {
        const target = root.querySelector(`#${jump.dataset.chartJump}`);
        if (!target) return;
        root.querySelectorAll('[data-chart-jump]').forEach((button) => {
          const active = button === jump;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-current', active ? 'true' : 'false');
        });
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.remove('chart-jump-pulse');
        requestAnimationFrame(() => target.classList.add('chart-jump-pulse'));
        window.setTimeout(() => target.classList.remove('chart-jump-pulse'), 900);
        return;
      }

      const shortcut = event.target.closest('[data-chart-style-shortcut]');
      if (shortcut && root.contains(shortcut)) {
        setBmvStyle(shortcut.dataset.chartStyleShortcut);
        return;
      }

      const open = event.target.closest('[data-chart-open]');
      if (open && root.contains(open)) toggleFocus(open);
    };

    const onChange = (event) => {
      if (event.target.matches('#bmv-chart-style')) setBmvStyle(event.target.value);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeFocus();
    };

    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    document.addEventListener('keydown', onKeyDown);

    let savedStyle = 'candlestick';
    try { savedStyle = localStorage.getItem(styleKey) || savedStyle; } catch { /* preferencias opcionales */ }
    setBmvStyle(savedStyle, false);

    return () => {
      closeFocus();
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
      document.removeEventListener('keydown', onKeyDown);
      bondsReactMount.remove();
      bondsGuideMount.remove();
      calendarCommandMount.remove();
    };
  }, []);

  useEffect(() => {
    const wrapper = contentRef.current?.querySelector('#global-dense-wrapper');
    if (!wrapper) return undefined;

    const revealTransplantedPanels = () => {
      wrapper.querySelectorAll('.reveal:not(.inview)').forEach((panel) => {
        panel.classList.add('inview');
      });
    };

    // Los paneles de Mercados se mueven a sus slots después de montar React.
    // El observador legacy fue creado antes de ese traslado y puede omitirlos;
    // este observador pertenece al ciclo de vida React y revela cada panel al
    // momento de entrar al contenedor definitivo.
    const observer = new MutationObserver(revealTransplantedPanels);
    observer.observe(wrapper, {
      attributes: true,
      attributeFilter: ['style'],
      childList: true,
      subtree: true,
    });

    const frame = requestAnimationFrame(revealTransplantedPanels);
    const retry = window.setTimeout(revealTransplantedPanels, 1200);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(retry);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return undefined;
    let pendingSync = null;

    const showTabImmediately = (name) => {
      const get = (id) => root.querySelector(`#${id}`);
      root.querySelectorAll('.fin-tab-card').forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === name);
      });
      const tabNav = root.querySelector('.fin-tabs-nav');
      if (tabNav) tabNav.style.display = name === 'general' ? 'none' : '';

      ['pane-general', 'fin-layout-wrap', 'watchlist-panel', 'bolsa-news-panel',
        'bonds-panel', 'calendar-panel-main', 'global-dense-wrapper', 'bonds-dense-wrapper']
        .forEach((id) => { const el = get(id); if (el) el.style.display = 'none'; });

      const bottom = get('fin-bottom-grid');
      if (bottom) {
        bottom.style.display = 'none';
        bottom.classList.remove('only-left', 'only-right');
      }
      ['petroleo-panel', 'mkt-cap-panel', 'fx-emerging-panel', 'reservas-panel',
        'risk-panel', 'credit-panel', 'movers-panel']
        .forEach((id) => { const el = get(id); if (el) el.style.display = ''; });

      if (name === 'general') {
        const pane = get('pane-general');
        if (pane) pane.style.display = '';
      } else if (name === 'mercados') {
        const markets = get('global-dense-wrapper');
        if (markets) markets.style.display = '';
        const watchlist = get('watchlist-panel');
        if (watchlist) watchlist.style.display = '';
      } else if (name === 'bonos') {
        const bonds = get('bonds-dense-wrapper');
        if (bonds) bonds.style.display = '';
        ['bonds-panel', 'calendar-panel-main'].forEach((id) => {
          const el = get(id);
          if (el) el.style.display = '';
        });
        bonds?.querySelectorAll('.reveal').forEach((panel) => panel.classList.add('inview'));
      } else if (name === 'riesgo' && bottom) {
        bottom.style.display = 'grid';
        bottom.classList.add('only-right');
        ['petroleo-panel', 'mkt-cap-panel', 'fx-emerging-panel', 'movers-panel']
          .forEach((id) => { const el = get(id); if (el) el.style.display = 'none'; });
      }
    };

    const onTabRequest = (event) => {
      const target = event.target.closest?.('[data-tab], .hub-mkt, .hub-bnd, .hub-risk');
      if (!target || !root.contains(target)) return;
      const requested = target.dataset.tab
        || (target.classList.contains('hub-bnd') ? 'bonos' : null)
        || (target.classList.contains('hub-risk') ? 'riesgo' : null)
        || (target.classList.contains('hub-mkt') ? 'mercados' : null);
      if (!requested) return;

      setActiveTab(requested);
      try { localStorage.setItem('fin_active_tab', requested); } catch { /* preferencia opcional */ }

      // La carga financiera incluye varias librerías de gráficas. Si el usuario
      // pulsa una tarjeta antes de que `finTab` exista, React abre el contenido
      // sin esperar y sincroniza el motor legacy en cuanto queda disponible.
      showTabImmediately(requested);
      window.clearInterval(pendingSync);
      let attempts = 0;
      pendingSync = window.setInterval(() => {
        attempts += 1;
        if (typeof window.finTab === 'function') {
          window.clearInterval(pendingSync);
          pendingSync = null;
          window.finTab(requested, root.querySelector(`.fin-tab-card[data-tab="${requested}"]`));
        } else if (attempts >= 40) {
          window.clearInterval(pendingSync);
          pendingSync = null;
        }
      }, 125);
    };

    root.addEventListener('click', onTabRequest);
    return () => {
      root.removeEventListener('click', onTabRequest);
      window.clearInterval(pendingSync);
    };
  }, []);

  return (
    <>
      <Header />
      <div ref={contentRef} className="vn-fin-clear" dangerouslySetInnerHTML={{ __html: FINANZAS_REACT_HTML }} />
      <FinanceDepth activeTab={activeTab} bondsTarget={bondsDepthTarget} />
      {activeTab === 'bonos' && bondsGuideTarget ? createPortal(<BondGovernmentGuide />, bondsGuideTarget) : null}
      {activeTab === 'bonos' && calendarCommandTarget ? createPortal(<EconomicCalendarCommand />, calendarCommandTarget) : null}
      <Footer />
    </>
  );
}
