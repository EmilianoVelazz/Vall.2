import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import loadScripts from '../lib/loadScripts.js';
import './Inicio.css';

const HOJAS = [
  '/assets/css/base.css?v=2',
  '/assets/css/header.css',
  '/assets/css/hero.css',
  '/assets/css/grid.css?v=2',
  '/assets/css/footer.css',
  '/assets/css/responsive.css',
  '/assets/css/dark-pilot.css?v=2',
];

const LIBS = [
  '/assets/js/api-keys.js?v=5',
  '/assets/js/data-service.js?v=22',
  '/assets/js/live-engine.js?v=25',
];

const SLIDES = [
  {
    clave: 'finanzas',
    ruta: '/finanzas',
    img: '/assets/img/finanzas.webp',
    icono: 'fa-building-columns',
    pill: 'Macro MX',
    pillColor: null,
    sub: 'BANXICO',
    idTitulo: 'st-finanzas',
    idDesc: 'sd-fin-desc',
    titulo: 'Banxico: Expectativas de inflación para el cierre de Q2',
    desc: 'El consenso de analistas proyecta movimientos en tasas y mercados globales.',
    fuente: 'BANXICO',
    riesgo: 'alto',
  },
  {
    clave: 'mercados',
    ruta: '/mercados',
    img: '/assets/img/mercados.webp',
    icono: 'fa-chart-bar',
    pill: 'Mercados',
    pillColor: 'var(--clr-accent)',
    sub: 'NASDAQ · BOLSA',
    idTitulo: 'st-mercados',
    idDesc: 'sd-mkt-desc',
    titulo: 'Mercados globales: volatilidad ante datos macro de EE.UU.',
    desc: 'Los índices reaccionan a los datos de empleo y expectativas de política monetaria de la Fed.',
    fuente: 'BLOOMBERG',
    riesgo: 'alto',
  },
  {
    clave: 'geo',
    ruta: '/geopolitica',
    img: '/assets/img/geo.webp',
    icono: 'fa-earth-americas',
    pill: 'Geopolítica',
    pillColor: 'var(--clr-violet)',
    sub: 'ANÁLISIS GLOBAL',
    idTitulo: 'st-geo',
    idDesc: 'sd-geo-desc',
    titulo: 'Tensiones globales incrementan el riesgo en cadenas de suministro',
    desc: 'Las tensiones en regiones clave afectan directamente las cadenas de suministro globales.',
    fuente: 'REUTERS',
    riesgo: 'medio',
  },
  {
    clave: 'proteinas',
    ruta: '/mercado-proteinas',
    img: '/assets/img/mercadoP.webp',
    icono: 'fa-seedling',
    pill: 'Proteínas',
    pillColor: null,
    sub: 'CME · CHICAGO',
    idTitulo: 'st-proteinas',
    idDesc: 'sd-prot-desc',
    titulo: 'Maíz CME: Contratos futuros ante clima en el cinturón solar',
    desc: 'Incertidumbre en la cosecha de EE.UU. eleva la volatilidad en la compra anticipada de grano.',
    fuente: 'CME GROUP',
    riesgo: 'medio',
  },
  {
    clave: 'mexico',
    ruta: '/mexico',
    img: '/assets/img/mexico2.webp',
    icono: 'fa-peso-sign',
    pill: 'México',
    pillColor: 'var(--clr-green)',
    sub: 'FOREX · ECONOMÍA',
    idTitulo: 'st-mexico',
    idDesc: 'sd-mex-desc',
    titulo: 'Tipo de cambio: El peso frente al dólar en tiempo real',
    desc: 'El mercado cambiario refleja el pulso de la economía mexicana.',
    fuente: 'BANXICO',
    riesgo: 'alto',
  },
];

/* La retícula no repite el orden del carrusel: Geopolítica usa el id
   `ct-geopolitica` para el titular pero `card-geo` para el fondo, porque
   live-engine tiene dos mapas distintos (CARD_MAP y _bgFor). Se respetan tal
   cual para no romper ninguno de los dos. */
const TARJETAS = [
  { clave: 'finanzas',  ruta: '/finanzas',           img: '/assets/img/finanzas.webp',  icono: 'fa-chart-line',     etiqueta: 'Finanzas',          idCard: 'card-finanzas',  idTitulo: 'ct-finanzas',     titulo: 'Banxico: Expectativas de inflación para el cierre de Q2' },
  { clave: 'mercados',  ruta: '/mercados',           img: '/assets/img/mercados.webp',  icono: 'fa-globe',          etiqueta: 'Mercados',          idCard: 'card-mercados',  idTitulo: 'ct-mercados',     titulo: 'Cierre de Refinería en la Costa del Golfo' },
  { clave: 'geo',       ruta: '/geopolitica',        img: '/assets/img/geo.webp',       icono: 'fa-earth-americas', etiqueta: 'Geopolítica',       idCard: 'card-geo',       idTitulo: 'ct-geopolitica',  titulo: 'El cierre de rutas en Medio Oriente incrementa el costo de contenedores en un 22%' },
  { clave: 'proteinas', ruta: '/mercado-proteinas',  img: '/assets/img/mercadoP.webp',  icono: 'fa-seedling',       etiqueta: 'Mercados Proteína', idCard: 'card-proteinas', idTitulo: 'ct-proteinas',    titulo: 'Maíz CME: Contratos futuros ante clima en el cinturón solar' },
  { clave: 'mexico',    ruta: '/mexico',             img: '/assets/img/mexico2.webp',   icono: 'fa-peso-sign',      etiqueta: 'México',            idCard: 'card-mexico',    idTitulo: 'ct-mexico',       titulo: 'Dólar a $17.20 · Tipo de cambio al día' },
];

const MS_SLIDE = 5500;

export default function Inicio() {
  usePageStyles(HOJAS);

  useEffect(() => {
    document.documentElement.classList.add('vn-dark-pilot');
    document.body.classList.add('vn-dark-pilot', 'vn-dark-inicio');
    return () => {
      document.documentElement.classList.remove('vn-dark-pilot');
      document.body.classList.remove('vn-dark-pilot', 'vn-dark-inicio');
    };
  }, []);

  const [actual, setActual] = useState(0);
  // Se congela al montar: live-engine reescribe sd-0…sd-3 con su propia marca
  // de tiempo, y si este valor cambiara en un re-render React se la pisaría.
  const [fechas] = useState(() => {
    const hoy = new Date();
    return {
      corta: hoy.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }),
      larga: hoy.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    };
  });

  const pausado = useRef(false);

  // ── Autoplay ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      if (!pausado.current) setActual((i) => (i + 1) % SLIDES.length);
    }, MS_SLIDE);
    return () => clearInterval(t);
  }, []);

  // ── Motor de datos en vivo ──────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        await loadScripts(LIBS);
      } catch (e) {
        console.error('Inicio: no se pudo cargar el motor de datos en vivo', e);
        return;
      }
      if (!vivo) return;
      // En la primera visita el propio script ya arrancó al cargarse; init() es
      // idempotente, así que esta llamada solo hace algo al volver a la página.
      window.VNLive?.init();
    })();

    return () => {
      vivo = false;
      window.VNLive?.stop();
    };
  }, []);

  const mover = (d) => setActual((i) => (i + d + SLIDES.length) % SLIDES.length);

  const puntos = useMemo(() => SLIDES.map((s, i) => ({ clave: s.clave, i })), []);

  return (
    <>
      <Header />
      <div className="hdr-divider" />

      <section
        className="hero"
        id="heroSlider"
        onMouseEnter={() => { pausado.current = true; }}
        onMouseLeave={() => { pausado.current = false; }}
      >
        {SLIDES.map((s, i) => (
          <div
            key={s.clave}
            className={`slide${i === actual ? ' active' : ''}`}
            id={`slide-${s.clave}`}
            style={{ backgroundImage: `url('${s.img}')` }}
          >
            <div className="slide-badge">
              <span className="slide-pill" style={s.pillColor ? { background: s.pillColor } : undefined}>
                <i className={`fas ${s.icono}`} />&nbsp;{s.pill}
              </span>
              <span className="slide-sub">{s.sub}</span>
            </div>
            <div className="slide-body">
              <p className="slide-date" id={`sd-${i}`}>{fechas.corta}</p>
              <h1 className="slide-title" id={s.idTitulo}>{s.titulo}</h1>
              <p className="slide-desc" id={s.idDesc}>{s.desc}</p>
              <Link className="slide-btn" to={s.ruta}>VER MÁS</Link>
              <div className="slide-tags">
                <span className="tag-source">{s.fuente}</span>
                <span className={`tag-risk${s.riesgo === 'alto' ? ' danger' : ''}`}>
                  <i
                    className={`fas ${s.riesgo === 'alto' ? 'fa-triangle-exclamation' : 'fa-diamond'}`}
                    style={{ fontSize: '.58rem' }}
                  />{' '}
                  {s.riesgo === 'alto' ? 'ALTO IMPACTO' : 'RIESGO MEDIO'}
                </span>
              </div>
            </div>
          </div>
        ))}

        <button className="arrow arrow-prev" onClick={() => mover(-1)} aria-label="Anterior">
          <i className="fas fa-chevron-left" />
        </button>
        <button className="arrow arrow-next" onClick={() => mover(1)} aria-label="Siguiente">
          <i className="fas fa-chevron-right" />
        </button>

        <div className="hero-dots">
          {puntos.map(({ clave, i }) => (
            <div
              key={clave}
              className={`dot${i === actual ? ' active' : ''}`}
              onClick={() => setActual(i)}
              role="button"
              tabIndex={0}
              aria-label={`Ir a la noticia ${i + 1}`}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActual(i); } }}
            />
          ))}
        </div>

        {/* key={actual} rearranca la animación de la barra en cada cambio de
            slide: al cambiar la key React reemplaza el nodo, y una animación
            CSS siempre empieza de cero en un elemento recién montado. */}
        <div className="hero-progress">
          <div className="hero-progress-bar" id="heroBar" key={actual} />
        </div>
      </section>

      <div className="section-bridge" />

      <div className="section-header">
        <span className="section-header-label"><span className="lf-dot" />&nbsp;Últimas noticias</span>
        <span className="section-header-line" />
        <span className="section-header-date" id="sectionDate">{fechas.larga}</span>
        <span className="sh-upd">Act.&nbsp;<span id="lastUpdated">—</span></span>
        <span className="sh-badge" id="backendBadge">VALL AI</span>
        <button className="refresh-btn" id="refreshBtn" title="Actualizar datos">
          <i className="fas fa-rotate-right" />
        </button>
      </div>

      <main className="main">
        <div className="grid">
          {TARJETAS.map((t) => (
            <Link
              key={t.clave}
              className={`card cat-${t.clave}`}
              id={t.idCard}
              to={t.ruta}
              style={{ backgroundImage: `url('${t.img}')` }}
            >
              <div className="card-overlay">
                <span className="card-badge"><i className={`fas ${t.icono}`} /> {t.etiqueta}</span>
                <div className="card-bottom">
                  <p className="card-title" id={t.idTitulo}>{t.titulo}</p>
                  <span className="card-btn">VER MÁS</span>
                </div>
              </div>
            </Link>
          ))}

          <div className="vai-card">
            <div className="vai-brand">
              <span className="vai-brand-name">VALL</span>
              <span style={{ color: 'var(--clr-gold-lt)', fontWeight: 800, fontSize: '.8rem' }}>·</span>
              <span className="vai-brand-ai">AI</span>
            </div>
            <span className="vai-lbl">PREDICTION</span>
            <div
              className="vai-select"
              id="vaiSelect"
              style={{ cursor: 'pointer' }}
              title="Clic para alternar entre vista México y vista Global"
            >
              <i className="fas fa-chart-line" id="vaiSelectIcon" style={{ fontSize: '.7rem', color: 'var(--clr-muted)' }} />
              <span id="vaiSelectLbl">Finanzas</span>
              <i className="fas fa-chevron-down" style={{ fontSize: '.6rem', color: 'var(--clr-muted)', marginLeft: '.35rem' }} />
            </div>
            <div className="vai-gauge">
              <svg viewBox="0 0 100 100">
                <circle className="g-bg" cx="50" cy="50" r="40" />
                <circle id="idx-vai-arc" className="g-arc" cx="50" cy="50" r="40" />
              </svg>
              <div className="g-num" id="idx-vai-num">74%</div>
            </div>
            <span className="vai-asset" id="idx-vai-asset">MERCADO MX</span>
            <span className="vai-verdict" id="idx-vai-verdict">Bajista</span>
            <span className="vai-warn" id="idx-vai-warn">Cargando datos en vivo…</span>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
