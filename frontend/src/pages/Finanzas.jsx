import { useEffect } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import loadScripts, { cargarCadaVez } from '../lib/loadScripts.js';
import './Finanzas.css';
import { DARK_PILOT, DATOS, ESQUELETO } from '../lib/hojasComunes.js';



const HOJAS = [
  ...ESQUELETO,
  '/assets/css/finanzas-redesign-v2.css?v=2.8',
  '/assets/css/finanzas-debt-premium.css?v=3.1',
  '/assets/css/finanzas-favro.css?v=84',
  '/assets/css/finanzas-premium.css?v=116',
  '/assets/css/daily-news-favro.css?v=23',
  '/assets/css/sectors-board.css?v=2',
  '/assets/css/finanzas-world-map.css?v=13',
  '/assets/css/finanzas-bond-map.css?v=1',
  '/assets/css/finanzas-currency-map.css?v=3',
  '/assets/css/finanzas-responsive-v3.css?v=1',
  /* Apartado Divisas. Son 1.646 líneas para el banco de trabajo cambiario
     (.fx-history-*, .fx-market-search-*) y sin ellas ese panel se queda con el
     marcado desnudo: tabla sin formato, sin las pastillas de periodo ni el
     comparador. */
  '/assets/css/finanzas-fx-workspace.css?v=15',
  /* Tema general de Finanzas. Daily News añade debajo una capa estrictamente
     acotada para que su dirección editorial no herede los colores del tablero. */
  DARK_PILOT,
  '/assets/css/daily-news-editorial.css?v=11',
  '/assets/css/daily-news-coverage-window.css?v=1',
  '/assets/css/daily-news-story-index.css?v=2',
  '/assets/css/finanzas-map-unified.css?v=2',
  '/assets/css/finanzas-fx-evolution.css?v=1',
  '/assets/css/finanzas-equity-analyzer.css?v=6',
  '/assets/css/finanzas-bolsa-harmony.css?v=10',
  '/assets/css/finanzas-bonos-harmony.css?v=3',
  '/assets/css/finanzas-divisas-harmony.css?v=4',
];

/* Orden calcado del <head> original: chart.js y data-service (window.VDS) antes
   que nada, porque el resto los usa nada más evaluarse. */
const LIBS = [
  '/assets/js/vendor/chart.umd.js?v=1',
  '/assets/js/finanzas-visual.js?v=6',
  ...DATOS,
  '/assets/js/vendor/lightweight-charts.standalone.production.js?v=1',
  '/assets/js/world-map-data.js?v=1',
  '/assets/js/world-exchanges.js?v=3',
  '/assets/js/world-currencies-data.js?v=1',
  '/assets/js/world-fx-fallback.js?v=1',
];

/* Estos tres capturan sus nodos al evaluarse, así que hay que reejecutarlos en
   cada montaje: con la caché normal solo funcionarían la primera visita. El
   orden importa — finanzas-favro.js necesita ocho globales de finanzas-page.js
   (finTab, ensureFinanceSection, refreshAll…), y el mapa va al final. */
const POR_MONTAJE = [
  ['/assets/js/finanzas-page.js?v=13', 'finanzas-page'],
  ['/assets/js/finanzas-favro.js?v=127', 'finanzas-favro'],
  ['/assets/js/finanzas-world-map.js?v=11', 'finanzas-world-map'],
  ['/assets/js/finanzas-bond-map.js?v=1', 'finanzas-bond-map'],
  ['/assets/js/finanzas-currency-map.js?v=10', 'finanzas-currency-map'],
  ['/assets/js/dark-pilot.js?v=5', 'dark-pilot'],
];

export default function Finanzas() {
  usePageStyles(HOJAS);

  /* El tema oscuro de la sección se activa por clase, no por media query:
     dark-pilot.css cuelga todo de body.vn-dark-pilot / .vn-dark-finanzas. En el
     HTML esas clases venían escritas en <html> y <body>; aquí se ponen al
     montar y se quitan al salir, para que no tiñan el resto de rutas. Es el
     mismo patrón que usa Inicio. */
  useEffect(() => {
    document.documentElement.classList.add('vn-dark-pilot');
    document.body.classList.add('vn-dark-pilot', 'vn-dark-finanzas');
    return () => {
      document.documentElement.classList.remove('vn-dark-pilot');
      document.body.classList.remove('vn-dark-pilot', 'vn-dark-finanzas');
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    const retirar = [];

    /* loadPetroleo lo lee nada más arrancar; en el HTML lo sembraba un <script>
       de una línea en la primera línea del <head>. */
    window._rpData = window._rpData || { wti: 75.2, brent: 79.5, mix: 70.1 };

    (async () => {
      try {
        await loadScripts(LIBS);
      } catch (err) {
        console.error('Finanzas: no se pudieron cargar las librerías', err);
        return;
      }
      if (!vivo) return;
      for (const [src, marca] of POR_MONTAJE) {
        retirar.push(cargarCadaVez(src, marca));
        /* En serie: cada uno depende de las globales del anterior. */
         
        await new Promise((r) => setTimeout(r, 0));
      }
    })();

    return () => {
      vivo = false;
      window.VNFavro?.desmontar?.();
      window.VNFinanzas?.desmontar?.();
      window.VNWorldMap?.desmontar?.();
      window.VNBondMap?.desmontar?.();
      window.VNCurrencyMap?.desmontar?.();
      retirar.forEach((quitar) => quitar());
    };
  }, []);

  return (
    <>
      <Header />
      <div className="hdr-divider" />

      <div className="vn-ticker" aria-label="Cotizaciones de mercados en tiempo real">
          <div className="vn-ticker-label"><span className="vn-live-dot"></span><span>Mercados</span><small>Live</small></div>
          <div className="vn-track" id="vnTrack"><span className="vn-loading">Cargando precios en tiempo real…</span></div>
      </div>



      <div className="container">

          {/* ── Tab Navigation ──────────────────────────────────────────── */}
          <div className="fin-tabs-nav" style={{ display: 'none' }}>
              <button className="fin-tab-card tc-general" data-tab="general" onClick={(e) => { window.finTab('general',e.currentTarget); }}>
                  <div className="fin-tab-icon"><i className="fas fa-chart-pie"></i></div>
                  <div className="fin-tab-info">
                      <div className="fin-tab-title">Resumen</div>
                      <div className="fin-tab-sub">Las 4 clases de activo</div>
                  </div>
              </button>
              <button className="fin-tab-card tc-mercados" data-tab="mercados" onClick={(e) => { window.finTab('mercados',e.currentTarget); }}>
                  <div className="fin-tab-icon"><i className="fas fa-chart-line"></i></div>
                  <div className="fin-tab-info">
                      <div className="fin-tab-title">Renta Variable Global</div>
                      <div className="fin-tab-sub">S&amp;P 500 · Nasdaq · IPC · VIX</div>
                  </div>
              </button>
              <button className="fin-tab-card tc-bonos" data-tab="bonos" onClick={(e) => { window.finTab('bonos',e.currentTarget); }}>
                  <div className="fin-tab-icon"><i className="fas fa-landmark"></i></div>
                  <div className="fin-tab-info">
                      <div className="fin-tab-title">Deuda &amp; Bonos Soberanos</div>
                      <div className="fin-tab-sub">Treasury · TIIE · Curvas</div>
                  </div>
              </button>
              <button className="fin-tab-card tc-mexico" data-tab="mexico" onClick={(e) => { window.finTab('mexico',e.currentTarget); }}>
                  <div className="fin-tab-icon"><i className="fas fa-money-bill-transfer"></i></div>
                  <div className="fin-tab-info">
                      <div className="fin-tab-title">Mercado Cambiario</div>
                      <div className="fin-tab-sub">Forex · DXY · Carry MX</div>
                  </div>
              </button>
              <button className="fin-tab-card tc-riesgo" data-tab="riesgo" onClick={(e) => { window.finTab('riesgo',e.currentTarget); }}>
                  <div className="fin-tab-icon"><i className="fas fa-oil-well"></i></div>
                  <div className="fin-tab-info">
                      <div className="fin-tab-title">Commodities &amp; Energía</div>
                      <div className="fin-tab-sub">WTI · Brent · Gas · Oro</div>
                  </div>
              </button>
          </div>


          <section className="ff-detail-navigation" id="ff-detail-navigation" aria-labelledby="ff-detail-title" hidden>
              <button className="ff-detail-back" id="ff-back-overview" type="button">
                  <i className="fas fa-arrow-left" aria-hidden="true"></i>
                  <span>Volver al resumen</span>
              </button>
              <div className="ff-detail-heading">
                  <span className="ff-detail-eyebrow" id="ff-detail-eyebrow">Mercados globales</span>
                  <h1 id="ff-detail-title">Bolsa</h1>
                  <p id="ff-detail-description">Índices, acciones, factores y gráficas históricas para analizar el mercado.</p>
              </div>
              <nav className="ff-detail-tabs" aria-label="Apartados de Finanzas">
                  <button type="button" data-detail-module="bolsa"><i className="fas fa-chart-line"></i><span>Bolsa</span></button>
                  <button type="button" data-detail-module="rendimientos"><i className="fas fa-wave-square"></i><span>Bonos</span></button>
                  <button type="button" data-detail-module="divisas"><i className="fas fa-money-bill-transfer"></i><span>Divisas</span></button>
                  <button type="button" data-detail-module="noticias"><i className="fas fa-newspaper"></i><span>Daily News</span></button>
              </nav>
          </section>

          {/* ── Mapa mundial de bolsas ──────────────────────────────────────────
               El SVG y las fichas los arma assets/js/finanzas-world-map.js a partir de
               world-map-data.js (geometría generada) y world-exchanges.js (catálogo).
               Aquí solo van los contenedores; el marcado real no se escribe a mano. */}
          <section className="ff-world-map" id="ff-world-map" aria-labelledby="ffwm-title" hidden>
              <header className="ffwm-head">
                  <div className="fbm-heading">
                      <span className="ff-kicker"><i className="fas fa-earth-americas" aria-hidden="true"></i> Mercados globales</span>
                      <h2 id="ffwm-title">Panorama Mundial de Bolsa</h2>
                      <p>Explora el pulso financiero del mundo. Se&ntilde;ala o toca un mercado para consultar sus bolsas, &iacute;ndice principal y hora local.</p>
                  </div>
                  <div className="ffwm-header-meta fbm-header-meta">
                      <span className="ffwm-market-feed is-loading" id="ffwm-market-feed" role="status" aria-live="polite"><i className="fas fa-circle-notch fa-spin" aria-hidden="true"></i> Conectando mercados</span>
                      <div className="ffwm-select-wrap">
                          <i className="fas fa-magnifying-glass" aria-hidden="true"></i>
                          <label htmlFor="ffwm-select">Ir a un pa&iacute;s</label>
                          <select id="ffwm-select"><option value="">Elegir pa&iacute;s&hellip;</option></select>
                      </div>
                  </div>
              </header>

              <div className="ffwm-toolbar fbm-toolbar">
                  <div className="fbm-fixed-maturity" aria-label="Lectura de la sesión actual">
                      <span>Lectura</span>
                      <strong>Sesión actual</strong>
                  </div>
                  <div className="ffwm-direction-legend fbm-legend" aria-label="Leyenda de desempeño bursátil">
                      <span><small>Baja</small><strong className="is-down">Negativo</strong></span>
                      <i className="ffwm-direction-scale" aria-hidden="true"><b></b></i>
                      <span><small>Alza</small><strong className="is-up">Positivo</strong></span>
                  </div>
              </div>

              <div className="ffwm-command" aria-label="Filtros del mapa">
                  <div className="ffwm-filters" role="group" aria-label="Filtrar mercados por desempe&ntilde;o">
                      <button type="button" className="is-active" data-ffwm-filter="todos" aria-pressed="true"><i className="fas fa-layer-group" aria-hidden="true"></i> Todos</button>
                      <button type="button" data-ffwm-filter="alza" aria-pressed="false"><i className="fas fa-arrow-trend-up" aria-hidden="true"></i> Al alza</button>
                      <button type="button" data-ffwm-filter="baja" aria-pressed="false"><i className="fas fa-arrow-trend-down" aria-hidden="true"></i> A la baja</button>
                      <button type="button" data-ffwm-filter="datos" aria-pressed="false"><i className="fas fa-signal" aria-hidden="true"></i> Con datos</button>
                  </div>
                  <span className="ffwm-filter-status fbm-filter-status" id="ffwm-filter-status" aria-live="polite">Vista global</span>
              </div>
              {/* El mapa ocupa todo el ancho: la ficha del país ya no vive en un panel
                   lateral fijo, sino en el flotante #ffwm-tip que se coloca sobre el
                   mapa al pasar el cursor. */}
              <div className="ffwm-workspace fbm-workspace">
              <div className="ffwm-map" id="ffwm-map">
                  <div className="ffwm-map-tools" role="group" aria-label="Controles de acercamiento">
                      <span className="ffwm-tools-caption"><i className="fas fa-location-crosshairs" aria-hidden="true"></i><span>Vista</span></span>
                      <button type="button" className="ffwm-tool-btn" data-ffwm-zoom="in" aria-label="Acercar mapa"><span>Acercar</span><i className="fas fa-plus" aria-hidden="true"></i></button>
                      <button type="button" className="ffwm-tool-btn" data-ffwm-zoom="out" aria-label="Alejar mapa"><span>Alejar</span><i className="fas fa-minus" aria-hidden="true"></i></button>
                      <button type="button" className="ffwm-tool-btn" data-ffwm-zoom="reset" aria-label="Restablecer mapa"><span>Centrar</span><i className="fas fa-expand" aria-hidden="true"></i></button>
                      <output className="ffwm-zoom-value" id="ffwm-zoom-value" aria-live="polite">100%</output>
                  </div>
                  <div className="ffwm-stage" id="ffwm-stage" tabIndex="0" aria-label="Mapa desplazable. Usa los controles para acercar.">
                      <div className="ffwm-lienzo"></div>
                  </div>
                  <div className="ffwm-pan-hint" aria-hidden="true"><i className="fas fa-hand" aria-hidden="true"></i><span className="ffwm-pan-desktop">Doble clic y arrastra</span><span className="ffwm-pan-mobile">Desliza para explorar</span></div>
                  <div className="ffwm-tip" id="ffwm-tip" role="tooltip" aria-live="polite" hidden></div>
              </div>
              </div>
              <footer className="ffwm-footer fbm-footer">
                  <div><span className="fbm-dot is-live"></span><strong>Dato conectado</strong><small>&Iacute;ndice consultado mediante la fuente financiera</small></div>
                  <div><span className="fbm-dot is-ref"></span><strong>Sin cotizaci&oacute;n</strong><small>Mercado identificado sin lectura disponible</small></div>
                  <p className="ffwm-stats" id="ffwm-stats"><i className="fas fa-circle-info" aria-hidden="true"></i> Preparando cobertura burs&aacute;til</p>
              </footer>
          </section>

          <section className="ff-exchange-board" id="ff-exchange-board" aria-labelledby="ff-exchange-title" hidden>
              <header className="ff-exchange-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                      <span className="ff-kicker"><i className="fas fa-earth-americas" aria-hidden="true"></i> Mercados globales</span>
                      <h2 id="ff-exchange-title">Principales Mercados Burs&aacute;tiles</h2>
                      <p>Compara la sesi&oacute;n reciente y selecciona un &iacute;ndice para analizarlo en la gr&aacute;fica principal.</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.8rem' }}>
                      <span className="ff-exchange-update" id="ff-exchange-update" aria-live="polite" style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--fin-text-muted)' }}>
                          <i className="fas fa-arrows-rotate" aria-hidden="true"></i> Cargando mercados
                      </span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(15,23,42,0.05)', padding: '0.4rem 0.8rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '700' }}>
                          <i className="fas fa-chart-pie" style={{ color: 'var(--fin-accent-blue)' }}></i>
                          <span>Estilo de minigr&aacute;ficas:</span>
                          <select id="vn-chart-type-global" aria-label="Seleccionar tipo de gráfico" onChange={(e) => { if(window.setMiniChartType) window.setMiniChartType(e.currentTarget.value); }} style={{ border: 'none', background: 'transparent', fontWeight: '700', color: 'var(--fin-text-main)', cursor: 'pointer', outline: 'none' }}>
                              <option value="candles">Velas Japonesas</option>
                              <option value="line">Línea de cierre</option>
                              <option value="area">Área de tendencia</option>
                              <option value="ohlc">Barras OHLC</option>
                          </select>
                      </label>
                  </div>
              </header>
              <div className="ff-exchange-grid" id="ff-exchange-grid" aria-label="Mini gr&aacute;ficas de bolsas internacionales"></div>
              <p className="ff-exchange-help"><i className="fas fa-arrow-pointer" aria-hidden="true"></i> Selecciona una bolsa para abrir su historial en Finanzas y gr&aacute;ficas.</p>
          </section>

          {/* Aquí aterriza #bvmx-panel ("Centro de análisis bursátil · Finanzas y
               gráficas"): prepareBolsaTopLayout() lo mueve dentro al abrir Bolsa. Va
               debajo del tablero de bolsas porque desde ahí se elige el índice que la
               gráfica analiza; el orden de la página sigue al del flujo de uso. */}
          <div className="ff-bolsa-chart-host" id="ff-bolsa-chart-host" hidden></div>

          <div className="fin-section-status" id="fin-section-status" data-section="" hidden>
              <span className="fin-section-status-icon"><i className="fas fa-arrows-rotate"></i></span>
              <span className="fin-section-status-copy">
                  <strong id="fin-section-status-title">Actualizando información</strong>
                  <small id="fin-section-status-message">Consultando las fuentes financieras disponibles…</small>
              </span>
              <span className="fin-section-status-time" id="fin-section-status-time"></span>
              <button type="button" onClick={(e) => { window.refreshCurrentFinanceSection(); }}><i className="fas fa-rotate-right"></i> Actualizar</button>
          </div>

          <section className="ff-detail-supplement" id="ff-detail-supplement" aria-labelledby="ff-supplement-title" hidden>
              <header className="ff-supplement-header">
                  <div>
                      <span className="ff-kicker" id="ff-supplement-kicker">Cobertura de datos</span>
                      <h2 id="ff-supplement-title">Desempe&ntilde;o por Mercado</h2>
                      <p id="ff-supplement-description">Resumen construido únicamente con la información disponible en las fuentes conectadas.</p>
                  </div>
                  <div className="ff-supplement-head-tools">
                      {/* Solo se muestra en el módulo Bolsa (lo controla renderSupplement). */}
                      <label className="ff-supplement-market" id="ff-supplement-market-wrap" hidden>
                          <span>Bolsa</span>    
                          <select id="ff-supplement-market" aria-label="Elegir la bolsa que se consulta" defaultValue="us">
                              <option value="us">&#127482;&#127480; Estados Unidos</option>
                              <option value="gb">&#127468;&#127463; Reino Unido</option>
                              <option value="de">&#127465;&#127466; Alemania</option>
                              <option value="fr">&#127467;&#127479; Francia</option>
                              <option value="es">&#127466;&#127480; Espa&ntilde;a</option>
                              <option value="jp">&#127471;&#127477; Jap&oacute;n</option>
                              <option value="br">&#127463;&#127479; Brasil</option>
                          </select>
                      </label>
                      <span className="ff-supplement-source" id="ff-supplement-source"><i className="fas fa-shield-halved"></i> Validando fuentes</span>
                  </div>
              </header>
              <div className="ff-supplement-kpis" id="ff-supplement-kpis" aria-label="Indicadores principales de la sección"></div>
              <div className="ff-supplement-grid">
                  <article className="ff-supplement-chart-card">
                      <header>
                          <div><small id="ff-supplement-chart-kicker">Comparativa</small><h3 id="ff-supplement-chart-title">Datos disponibles</h3></div>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                              <select id="supp-chart-type" onChange={(e) => { window.setSuppChartType && window.setSuppChartType(e.currentTarget.value); }} style={{ border: '1px solid rgba(15,23,42,0.1)', borderRadius: '8px', padding: '4px 8px', fontSize: '0.8rem', background: 'transparent', color: 'var(--fin-text-main)', fontWeight: '600', cursor: 'pointer', outline: 'none', transition: 'all 0.3s ease' }}>
                                  <option value="bar">Barras Verticales</option>
                                  <option value="horizontalBar">Barras Horizontales</option>
                                  <option value="line">Línea / Área</option>
                                  <option value="doughnut">Anillo</option>
                              </select>
                              <span id="ff-supplement-chart-unit" style={{ padding: '4px 8px', background: 'rgba(15,23,42,0.05)', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700' }}>Actual</span>
                          </div>
                      </header>
                      <div className="ff-supplement-chart"><canvas id="ff-supplement-chart" aria-label="Gráfica complementaria de la sección"></canvas></div>
                  </article>
                  <article className="ff-supplement-table-card">
                      <header><div><small>Detalle y procedencia</small><h3 id="ff-supplement-table-title">Información utilizada</h3></div></header>
                      <div className="ff-supplement-table-wrap">
                          <table>
                              <thead><tr id="ff-supplement-table-head"></tr></thead>
                              <tbody id="ff-supplement-table-body"><tr><td>Cargando información…</td></tr></tbody>
                          </table>
                      </div>
                  </article>
              </div>
              <aside className="ff-supplement-note" id="ff-supplement-note">
                  <i className="fas fa-circle-info" aria-hidden="true"></i>
                  <p>La plataforma mostrará claramente los campos que no estén disponibles en la fuente, sin completarlos con cifras estimadas.</p>
              </aside>
          </section>


          <div className="ff-news-detail-host" id="ff-news-detail-host" hidden>
              </div>

            {/* ── Pane: General — Hub de navegación ──────────────────────── */}
          <div id="pane-general" className="fin-tab-pane">

              <main className="favro-finance-shell" id="favro-finance" aria-labelledby="ff-page-title">
                  <section className="ff-hero">
                      <div className="ff-hero-copy">
                          <span className="ff-eyebrow"><span className="ff-live-dot"></span> Centro financiero</span>
                          <h1 id="ff-page-title">Finanzas</h1>
                          <p>Bolsa, bonos, divisas y noticias financieras en una sola lectura. Compara el pulso de hoy y profundiza sin perder contexto.</p>
                      </div>
                      <div className="ff-hero-actions">
                          <div className="ff-update" aria-live="polite">
                              <span>Última actualización</span>
                              <strong id="ff-last-update">Consultando fuentes…</strong>
                          </div>
                          <button className="ff-icon-button" id="ff-refresh" type="button" aria-label="Actualizar todos los datos" title="Actualizar datos">
                              <i className="fas fa-rotate-right" aria-hidden="true"></i>
                          </button>
                      </div>
                  </section>

                  <section className="ff-modules" aria-label="Módulos financieros">
                      <article className="ff-module ffm-card is-active" data-module="bolsa" tabIndex="0" aria-current="true">
                          <div className="ffm-photo"><img src="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=900&amp;q=75&amp;auto=format&amp;fit=crop" alt="" loading="lazy" referrerPolicy="no-referrer" /></div>
                          {/* Minigráfica real: la pinta renderMiniChart(), que ya recibía estos
                               datos pero no encontraba dónde dibujarlos. */}
                          <div className="ffm-spark" aria-hidden="true"><canvas id="ff-spark-bolsa"></canvas></div>
                          <div className="ffm-body">
                              <header><span className="ff-module-icon"><i className="fas fa-chart-line"></i></span><div><small>Mercados globales</small><h2>Bolsa</h2></div></header>
                              {/* Franja de dato en vivo: la rellena updateModuleTiles() desde el
                                   mismo state que ya alimenta el resto del apartado. */}
                              <div className="ffm-foot">
                                  <button className="ff-module-link" type="button" data-open-module="bolsa">Explorar Bolsa <i className="fas fa-arrow-right"></i></button>
                                  <span className="ffm-stat"><em>S&amp;P 500</em><strong id="ff-tile-bolsa">—</strong><i id="ff-tile-bolsa-delta"></i></span>
                              </div>
                          </div>
                      </article>

                      <article className="ff-module ffm-card" data-module="rendimientos" tabIndex="0">
                          <div className="ffm-photo"><img src="https://images.unsplash.com/photo-1640340434855-6084b1f4901c?w=900&amp;q=75&amp;auto=format&amp;fit=crop" alt="" loading="lazy" referrerPolicy="no-referrer" /></div>
                          <div className="ffm-spark" aria-hidden="true"><canvas id="ff-spark-rendimientos"></canvas></div>
                          <div className="ffm-body">
                              <header><span className="ff-module-icon"><i className="fas fa-landmark"></i></span><div><small>Política monetaria y deuda</small><h2>Bonos</h2></div></header>
                              <div className="ffm-foot">
                                  <button className="ff-module-link" type="button" data-open-module="rendimientos">Abrir bonos <i className="fas fa-arrow-right"></i></button>
                                  <span className="ffm-stat"><em>US 10 años</em><strong id="ff-tile-rendimientos">—</strong></span>
                              </div>
                          </div>
                      </article>

                      <article className="ff-module ffm-card" data-module="divisas" tabIndex="0">
                          <div className="ffm-photo"><img src="https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=1200&amp;q=78&amp;auto=format&amp;fit=crop" alt="" loading="lazy" referrerPolicy="no-referrer" /></div>
                          <div className="ffm-spark" aria-hidden="true"><canvas id="ff-spark-divisas"></canvas></div>
                          <div className="ffm-body">
                              <header><span className="ff-module-icon"><i className="fas fa-money-bill-transfer"></i></span><div><small>Mercado cambiario global</small><h2>Divisas</h2></div></header>
                              <div className="ffm-foot">
                                  <button className="ff-module-link" type="button" data-open-module="divisas">Explorar divisas <i className="fas fa-arrow-right"></i></button>
                                  <span className="ffm-stat"><em>EUR / USD</em><strong id="ff-tile-divisas">&mdash;</strong><i id="ff-tile-divisas-delta"></i></span>
                              </div>
                          </div>
                      </article>

                      <article className="ff-module ff-module-news ffm-card" data-module="noticias" tabIndex="0">
                          <div className="ffm-photo"><img src="https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=900&amp;q=75&amp;auto=format&amp;fit=crop" alt="" loading="lazy" referrerPolicy="no-referrer" /></div>
                          <div className="ffm-body">
                              <header><span className="ff-module-icon"><i className="fas fa-newspaper"></i></span><div><small>Noticiero financiero</small><h2>Daily News</h2></div></header>
                              <div className="ffm-foot">
                                  <button className="ff-module-link" type="button" data-open-module="noticias">Abrir Daily News <i className="fas fa-arrow-right"></i></button>
                                  <span className="ffm-stat"><em>Titulares hoy</em><strong id="ff-tile-noticias">—</strong></span>
                              </div>
                          </div>
                      </article>
                  </section>
                  <section className="ff-workspace" id="ff-workspace" aria-labelledby="ff-workspace-title" style={{ display: 'none' }}>
                      <header className="ff-section-head">
                          <div><span className="ff-kicker" id="ff-workspace-kicker">Bolsa · Evolución histórica</span><h2 id="ff-workspace-title">S&amp;P 500</h2><p id="ff-workspace-description">Comportamiento del índice y comparación contra referencias relevantes.</p></div>
                          <div className="ff-head-metric"><span>Último</span><strong id="ff-main-value">—</strong><em id="ff-main-change" className="ff-neutral-text">Esperando datos</em></div>
                      </header>

                      <div className="ff-toolbar" aria-label="Controles de la gráfica">
                          <div className="ff-segmented" id="ff-periods" role="group" aria-label="Periodo">
                              <button type="button" data-period="1d">Día</button><button type="button" data-period="5d">Semana</button><button type="button" data-period="1mo" className="is-active">Mes</button><button type="button" data-period="3mo">Trimestre</button><button type="button" data-period="1y">Año</button>
                          </div>
                          <label className="ff-select-label"><span>Indicador</span><select id="ff-indicator" aria-label="Seleccionar indicador"></select></label>
                          <label className="ff-select-label"><span>Comparar</span><select id="ff-compare" aria-label="Comparar con otro indicador"><option value="">Sin comparación</option></select></label>
                          <div className="ff-chart-modes" role="group" aria-label="Tipo de visualización">
                              <button className="is-active" type="button" data-chart-mode="area" aria-label="Gráfica de área" aria-pressed="true" title="Área"><i className="fas fa-chart-area"></i></button>
                              <button type="button" data-chart-mode="line" aria-label="Gráfica de línea" aria-pressed="false" title="Línea"><i className="fas fa-chart-line"></i></button>
                              <button type="button" data-chart-mode="bars" aria-label="Gráfica de barras" aria-pressed="false" title="Barras"><i className="fas fa-chart-column"></i></button>
                          </div>
                          <label className="ff-date-label"><span>Desde</span><input id="ff-date-from" type="date" aria-label="Fecha inicial" /></label>
                      </div>

                      <div className="ff-range-metrics" aria-label="Resumen del periodo seleccionado">
                          <div><span>Máximo</span><strong id="ff-period-high">—</strong><em id="ff-period-high-date">Periodo</em></div>
                          <div><span>Mínimo</span><strong id="ff-period-low">—</strong><em id="ff-period-low-date">Periodo</em></div>
                          <div><span>Variación</span><strong id="ff-period-change">—</strong><em>Inicio a cierre</em></div>
                          <div><span>Tendencia</span><strong id="ff-period-trend">Esperando datos</strong><em id="ff-period-trend-note">Lectura automática</em></div>
                      </div>

                      <div className="ff-chart-stage">
                          <div className="ff-chart-loading" id="ff-chart-loading" role="status"><span></span><p>Consultando la serie seleccionada…</p></div>
                          <div className="ff-chart-error" id="ff-chart-error" hidden><i className="fas fa-triangle-exclamation"></i><strong>No pudimos actualizar la gráfica</strong><p>Conservamos la última lectura disponible.</p><button type="button" id="ff-chart-retry">Reintentar</button></div>
                          <canvas id="ff-main-chart" aria-label="Gráfica financiera interactiva"></canvas>
                      </div>
                      <div className="ff-chart-foot">
                          <span><i className="fas fa-circle-info"></i> Pasa el cursor o toca la gráfica para consultar valores.</span>
                          <span id="ff-chart-source">Fuente: esperando datos</span>
                      </div>
                  </section>

                  <section className="ff-analysis-grid" aria-label="Subgráficas y desglose" style={{ display: 'none' }}>
                      <article className="ff-analysis-card ff-breakdown">
                          <header><div><span className="ff-kicker">Comparativa</span><h3 id="ff-breakdown-title">Índices principales</h3></div><button className="ff-ghost-button" type="button" id="ff-sort-breakdown" aria-label="Ordenar comparativa"><i className="fas fa-arrow-down-wide-short"></i> Ordenar</button></header>
                          <div className="ff-mini-chart"><canvas id="ff-breakdown-chart" aria-label="Gráfica comparativa"></canvas></div>
                      </article>
                      <article className="ff-analysis-card ff-context-card">
                          <header><div><span className="ff-kicker" id="ff-context-kicker">Participación</span><h3 id="ff-context-title">Lectura complementaria</h3></div><span className="ff-context-badge" id="ff-context-badge">Sesión</span></header>
                          <div className="ff-mini-chart"><canvas id="ff-context-chart" aria-label="Visualización secundaria"></canvas></div>
                          <p id="ff-context-note">La visualización se ajusta automáticamente al módulo seleccionado.</p>
                      </article>
                      <article className="ff-analysis-card ff-table-card">
                          <header><div><span className="ff-kicker">Detalle</span><h3 id="ff-table-title">Movimientos relevantes</h3></div><div className="ff-table-tools"><label className="ff-search"><i className="fas fa-magnifying-glass"></i><span className="sr-only">Buscar en la tabla</span><input id="ff-table-search" type="search" placeholder="Buscar" aria-label="Buscar en la tabla" /></label><label className="ff-compact-select"><span className="sr-only">Filtrar tabla</span><select id="ff-table-filter"><option value="all">Todos</option><option value="positive">Al alza</option><option value="negative">A la baja</option></select></label></div></header>
                          <div className="ff-table-wrap"><table><thead><tr id="ff-detail-head"><th><button type="button" data-sort="name">Activo <i className="fas fa-sort"></i></button></th><th><button type="button" data-sort="value">Valor <i className="fas fa-sort"></i></button></th><th><button type="button" data-sort="change">Cambio <i className="fas fa-sort"></i></button></th><th>Lectura</th></tr></thead><tbody id="ff-detail-rows"><tr className="ff-empty-row"><td colSpan="4">Cargando detalle…</td></tr></tbody></table></div>
                      </article>
                  </section>

                  <section className="ff-explainer" aria-labelledby="ff-explainer-title" style={{ display: 'none' }}>
                      <header><div><span className="ff-kicker">Interpretación y contexto</span><h2 id="ff-explainer-title">Cómo leer esta información</h2><p id="ff-explainer-summary">Una guía breve para entender el movimiento, sus causas y los riesgos relevantes.</p></div><span className="ff-education-badge"><i className="fas fa-graduation-cap"></i> Contenido educativo</span></header>
                      <div className="ff-explainer-grid">
                          <div id="ff-insights" className="ff-insights" aria-live="polite"></div>
                          <aside className="ff-auto-conclusion"><span>Conclusión automática</span><h3 id="ff-conclusion-title">Esperando una lectura completa</h3><p id="ff-conclusion-text">Cuando los datos estén disponibles, esta sección resumirá tendencia, catalizadores y riesgos sin emitir recomendaciones absolutas.</p><div className="ff-risk-row"><span>Riesgo observado</span><strong id="ff-risk-level">Sin clasificar</strong></div></aside>
                          <div className="ff-definitions"><button type="button" data-definition="yield"><span>Rendimiento</span><i className="fas fa-circle-info"></i><small>Retorno anualizado exigido por el mercado.</small></button><button type="button" data-definition="duration"><span>Duración</span><i className="fas fa-circle-info"></i><small>Sensibilidad del precio ante cambios en tasas.</small></button><button type="button" data-definition="spread"><span>Diferencial</span><i className="fas fa-circle-info"></i><small>Distancia entre dos rendimientos comparables.</small></button></div>
                      </div>
                      <p className="ff-disclaimer">Información de carácter educativo. No constituye asesoría ni una recomendación de compra o venta.</p>
                  </section>


                  <div className="fin-layout">
          <div className="main-col">
              <div id="ff-newsroom-anchor" aria-hidden="true"></div>
                  <section className="ff-newsroom fnb-newsroom" aria-labelledby="ff-news-title">
                      <section className="fnb-masthead" aria-labelledby="ff-news-title">
                          <header className="fnb-cover-copy">
                              <div className="fnb-brand">
                                  <span className="fnb-kicker"><span className="fnb-live"></span> International Financial Newsroom</span>
                                  <h2 className="fnb-title" id="ff-news-title">Daily <em>News</em></h2>
                                  <p className="fnb-cover-statement">Lee el mercado <span>antes de que cambie.</span></p>
                                  <p className="fnb-sub">Una edición viva que conecta el titular, su impacto y los activos que podría mover.</p>
                              </div>

                              <div className="fnb-edition" aria-live="polite">
                                  <span>Edición internacional</span>
                                  <strong id="fnb-updated">Preparando la edición…</strong>
                                  <small id="fnb-source">Fuentes financieras verificadas</small>
                              </div>

                              <div className="fnb-cover-actions">
                                  <button className="is-primary" type="button" data-news-jump="fnb-front-page"><span>Entrar a la edición</span><i className="fas fa-arrow-down" aria-hidden="true"></i></button>
                                  <button type="button" data-news-jump="fnb-brief-section"><span>Resumen en 30 segundos</span><i className="fas fa-bolt" aria-hidden="true"></i></button>
                              </div>

                              <div className="fnb-signal" aria-hidden="true">
                                  <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
                              </div>
                          </header>

                          {/* El pulso del día: la edición completa como un solo campo de
                              datos. Cada historia se coloca por hora e impacto y se colorea
                              por sentimiento, así que la jornada se entiende antes de leer
                              un titular. Lo pinta renderNewsPulse() en finanzas-favro.js. */}
                          <section className="fnb-pulse" id="fnb-pulse-section" aria-labelledby="fnb-pulse-title">
                              <header className="fnb-pulse-head">
                                  <div className="fnb-pulse-intro">
                                      <span className="fnb-pulse-kicker"><i className="fas fa-wave-square" aria-hidden="true"></i> Radar editorial en vivo</span>
                                      <h3 id="fnb-pulse-title">El pulso de la sesión</h3>
                                      <p>Explora cada punto para descubrir qué ocurrió y por qué puede mover al mercado.</p>
                                  </div>
                                  <dl className="fnb-pulse-stats">
                                      <div><dt>Historias</dt><dd id="fnb-pulse-total">—</dd></div>
                                      <div><dt>Alto impacto</dt><dd id="fnb-pulse-high">—</dd></div>
                                      <div><dt>Sesgo</dt><dd id="fnb-pulse-bias">—</dd></div>
                                      <div><dt>Ventana</dt><dd id="fnb-pulse-window">—</dd></div>
                                  </dl>
                              </header>

                              <div className="fnb-pulse-plot" id="fnb-pulse-plot"></div>

                              <div className="fnb-pulse-legend">
                                  <span className="fnb-pulse-key up"><i aria-hidden="true"></i> Alza</span>
                                  <span className="fnb-pulse-key down"><i aria-hidden="true"></i> Baja</span>
                                  <span className="fnb-pulse-key flat"><i aria-hidden="true"></i> Neutral</span>
                                  <span className="fnb-pulse-hint">Toca o señala un punto</span>
                              </div>

                              <article className="fnb-pulse-detail" id="fnb-pulse-detail" aria-live="polite">
                                  <p className="fnb-pulse-empty">Selecciona un punto para leer la historia.</p>
                              </article>
                          </section>

                          <div className="fnb-cover-scroll" aria-hidden="true"><span>Desliza para leer</span><i className="fas fa-arrow-down"></i></div>
                      </section>

                      <section className="fnb-reading-route" aria-labelledby="fnb-reading-route-title">
                          <header className="fnb-route-head">
                              <div className="fnb-route-heading">
                                  <span><i className="fas fa-location-arrow" aria-hidden="true"></i> Lectura guiada</span>
                                  <h3 id="fnb-reading-route-title">¿Cuánto tiempo tienes hoy?</h3>
                                  <p>Elige un ritmo y entra directamente a la profundidad que necesitas.</p>
                              </div>
                              <button className="fnb-refresh fnb-route-refresh" type="button" id="ff-open-news" aria-label="Actualizar Daily News">
                                  <i className="fas fa-rotate-right" aria-hidden="true"></i><span>Sincronizar edición</span>
                              </button>
                          </header>
                          <div className="fnb-reading-route-track">
                              <button className="is-flash" type="button" data-news-jump="fnb-brief-section">
                                  <span className="fnb-route-top">
                                      <span className="fnb-route-index">00:30</span>
                                      <span className="fnb-route-visual" aria-hidden="true"><i className="fas fa-bolt"></i><b><span></span><span></span><span></span></b></span>
                                  </span>
                                  <span className="fnb-route-copy"><small>Flash ejecutivo</small><strong>Lo esencial en tres claves</strong><em>Una lectura rápida para entender qué mueve la sesión.</em></span>
                                  <span className="fnb-route-action">Comenzar <i className="fas fa-arrow-right" aria-hidden="true"></i></span>
                              </button>
                              <button className="is-context" type="button" data-news-jump="fnb-front-page">
                                  <span className="fnb-route-top">
                                      <span className="fnb-route-index">03:00</span>
                                      <span className="fnb-route-visual" aria-hidden="true"><i className="fas fa-chart-line"></i><b><span></span><span></span><span></span></b></span>
                                  </span>
                                  <span className="fnb-route-copy"><small>Contexto editorial</small><strong>La historia detrás del movimiento</strong><em>Titular, explicación e impacto en una sola secuencia.</em></span>
                                  <span className="fnb-route-action">Entrar a portada <i className="fas fa-arrow-right" aria-hidden="true"></i></span>
                              </button>
                              <button className="is-explore" type="button" data-news-jump="fnb-coverage-section">
                                  <span className="fnb-route-top">
                                      <span className="fnb-route-index">LIBRE</span>
                                      <span className="fnb-route-visual" aria-hidden="true"><i className="fas fa-compass"></i><b><span></span><span></span><span></span></b></span>
                                  </span>
                                  <span className="fnb-route-copy"><small>Exploración global</small><strong>Sigue las señales que te interesan</strong><em>Recorre mercados, análisis y cobertura a tu propio ritmo.</em></span>
                                  <span className="fnb-route-action">Explorar edición <i className="fas fa-arrow-right" aria-hidden="true"></i></span>
                              </button>
                          </div>
                      </section>

                      <nav className="fnb-native-nav" id="fnb-native-nav" aria-label="Navegación de Daily News">
                          <div className="fnb-native-context"><i className="fas fa-compass" aria-hidden="true"></i><span id="fnb-native-current">Portada</span></div>
                          <div className="fnb-native-links">
                              <button className="is-active" type="button" data-news-jump="fnb-front-page"><i className="fas fa-house" aria-hidden="true"></i><span>Portada</span></button>
                              <button type="button" data-news-jump="fnb-pulse-section"><i className="fas fa-wave-square" aria-hidden="true"></i><span>Pulso</span></button>
                              <button type="button" data-news-jump="fnb-radar-section"><i className="fas fa-tower-broadcast" aria-hidden="true"></i><span>En vivo</span></button>
                              <button type="button" data-news-jump="fnb-departments-section"><i className="fas fa-layer-group" aria-hidden="true"></i><span>Secciones</span></button>
                              <button type="button" data-news-jump="fnb-insights-section"><i className="fas fa-lightbulb" aria-hidden="true"></i><span>Claves</span></button>
                              <button type="button" data-news-jump="fnb-coverage-section"><i className="fas fa-earth-americas" aria-hidden="true"></i><span>Cobertura</span></button>
                              <button type="button" data-news-jump="fnb-archive-section"><i className="fas fa-lines-leaning" aria-hidden="true"></i><span>Índice</span></button>
                          </div>
                          <div className="fnb-native-progress" aria-hidden="true"><span id="fnb-native-progress"></span></div>
                      </nav>

                      <div className="fnb-trending" aria-label="Temas en desarrollo">
                          <span className="fnb-trending-label"><i className="fas fa-circle" aria-hidden="true"></i> Ahora</span>
                          <div className="fnb-trending-track" id="fnb-trending-track">
                              <span>Preparando los temas que mueven los mercados…</span>
                          </div>
                      </div>

                      <div className="fnb-desk" aria-label="Resumen de la edición">
                          <div><span>Cobertura</span><strong>Global</strong><small>Mercados internacionales</small></div>
                          <div><span>Historias</span><strong id="fnb-story-count">—</strong><small>Selección editorial</small></div>
                          <div><span>Foco de hoy</span><strong id="fnb-dominant-focus">Mercados</strong><small>Mayor concentración informativa</small></div>
                          <div><span>Lectura</span><strong id="fnb-reading-time">3 min</strong><small>Resumen ejecutivo</small></div>
                      </div>

                      <div className="fnb-top" id="fnb-front-page">
                          <button className="fnb-lead" id="fnb-lead" type="button" aria-label="Abrir noticia principal">
                              <div className="fnb-lead-fallback"><i className="fas fa-newspaper"></i></div>
                              <div className="fnb-lead-body">
                                  <div className="fnb-chips"><span className="fnb-cat" data-cat="markets">Mercados</span><span className="fnb-impact medio">Impacto medio</span></div>
                                  <h3>Preparando la portada financiera del día…</h3>
                                  <p className="fnb-lead-dek">La lectura principal se actualizará con las fuentes financieras conectadas.</p>
                                  <div className="fnb-lead-meta"><span className="fnb-src">Mesa editorial</span><span>Ahora</span><span className="fnb-go">Leer <i className="fas fa-arrow-right"></i></span></div>
                              </div>
                          </button>

                          <aside className="fnb-brief" id="fnb-brief-section" aria-label="Briefing del día">
                              <span className="fnb-brief-h"><i className="fas fa-bolt" aria-hidden="true"></i> En 30 segundos</span>
                              <h3>Las claves de la jornada</h3>
                              <ol id="fnb-brief-list">
                                  <li><span>01</span><p>Cargando los puntos clave de la jornada…</p></li>
                                  <li><span>02</span><p>La mesa editorial resume el impacto en los mercados.</p></li>
                                  <li><span>03</span><p>Tasas, bonos y divisas en una sola lectura.</p></li>
                              </ol>
                              <div className="fnb-brief-foot"><i className="fas fa-shield-halved" aria-hidden="true"></i><span>Síntesis editorial basada en fuentes financieras conectadas.</span></div>
                          </aside>
                      </div>

                      <section className="fnb-radar" aria-labelledby="fnb-radar-title">
                          <div className="fnb-section-head fnb-radar-head" id="fnb-radar-section">
                              <div className="fnb-radar-copy">
                                  <span>Radar internacional <b>02</b></span>
                                  <h3 id="fnb-radar-title">Análisis y contexto <em>en movimiento.</em></h3>
                                  <p>Las señales que explican la sesión, ordenadas por relevancia antes que por ruido.</p>
                                  <div className="fnb-radar-legend" aria-label="Cómo leer el radar">
                                      <span><i className="is-priority" aria-hidden="true"></i> Prioridad</span>
                                      <span><i className="is-context" aria-hidden="true"></i> Contexto</span>
                                      <span><i className="is-live" aria-hidden="true"></i> En vivo</span>
                                  </div>
                              </div>
                              <div className="fnb-radar-scope" aria-label="Estado del radar editorial">
                                  <div className="fnb-radar-scope-visual" aria-hidden="true">
                                      <span className="fnb-scope-ring"></span>
                                      <i className="fnb-scope-dot one"></i><i className="fnb-scope-dot two"></i><i className="fnb-scope-dot three"></i>
                                  </div>
                                  <div className="fnb-radar-scope-copy">
                                      <span><i aria-hidden="true"></i> Escaneo editorial</span>
                                      <strong><b id="fnb-radar-signal-count">—</b> señales clave</strong>
                                      <small><b id="fnb-radar-live-count">—</b> actualizaciones en la línea temporal</small>
                                  </div>
                              </div>
                          </div>
                          <div className="fnb-news-layout">
                              <div className="fnb-grid" id="fnb-grid" aria-live="polite">
                                  <div className="fnb-card is-skeleton"><div className="fnb-card-media"></div><div className="fnb-card-body"><div className="fnb-sk" style={{ width: '40%' }}></div><div className="fnb-sk" style={{ width: '90%' }}></div><div className="fnb-sk" style={{ width: '70%' }}></div></div></div>
                                  <div className="fnb-card is-skeleton"><div className="fnb-card-media"></div><div className="fnb-card-body"><div className="fnb-sk" style={{ width: '40%' }}></div><div className="fnb-sk" style={{ width: '90%' }}></div><div className="fnb-sk" style={{ width: '70%' }}></div></div></div>
                              </div>
                              <aside className="fnb-latest" aria-labelledby="fnb-latest-title">
                                  <div className="fnb-latest-head">
                                      <div><span>Minuto a minuto</span><h3 id="fnb-latest-title">Últimas noticias</h3></div>
                                      <div className="fnb-latest-meter" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
                                  </div>
                                  <div className="fnb-stream" id="fnb-stream" aria-live="polite">
                                      <div className="fnb-stream-skeleton"></div><div className="fnb-stream-skeleton"></div><div className="fnb-stream-skeleton"></div>
                                  </div>
                              </aside>
                          </div>
                      </section>

                      <section className="fnb-departments" id="fnb-departments-section" aria-labelledby="fnb-departments-title">
                          <header className="fnb-editorial-heading fnb-departments-heading">
                              <div className="fnb-departments-intro">
                                  <span>La edición por dentro <b>03</b></span>
                                  <h3 id="fnb-departments-title">Sigue el hilo <em>que más te importa.</em></h3>
                                  <p>Mercados, política monetaria y activos conectados como una sola conversación.</p>
                              </div>
                              <nav className="fnb-thread-map" aria-label="Ir a un dossier de la edición">
                                  <button className="is-active" type="button" data-thread-jump="markets" aria-current="true"><i className="fas fa-chart-line" aria-hidden="true"></i><span><small>01</small>Mercados</span></button>
                                  <button type="button" data-thread-jump="rates"><i className="fas fa-landmark" aria-hidden="true"></i><span><small>02</small>Tasas y bonos</span></button>
                                  <button type="button" data-thread-jump="fx"><i className="fas fa-money-bill-transfer" aria-hidden="true"></i><span><small>03</small>Divisas</span></button>
                              </nav>
                          </header>
                          <div className="fnb-department-host" id="fnb-department-host" aria-live="polite"></div>
                          <aside className="fnb-priority" aria-labelledby="fnb-priority-title">
                              <div className="fnb-priority-head">
                                  <div className="fnb-priority-status"><span>Selección del editor</span><em><i aria-hidden="true"></i> Mesa activa</em></div>
                                  <h3 id="fnb-priority-title">Prioridad editorial</h3>
                                  <p>Las noticias con mayor capacidad de mover precios, expectativas y decisiones.</p>
                              </div>
                              <ol id="fnb-priority-list">
                                  <li><span>01</span><p>Evaluando el impacto de la agenda internacional…</p></li>
                                  <li><span>02</span><p>Clasificando riesgos y catalizadores del mercado.</p></li>
                                  <li><span>03</span><p>Conectando titulares con activos financieros.</p></li>
                              </ol>
                          </aside>
                      </section>

                      <section className="fnb-perspectives" id="fnb-insights-section" aria-labelledby="fnb-perspectives-title">
                          <header className="fnb-intelligence-head">
                              <div className="fnb-intelligence-intro">
                                  <span>Inteligencia editorial <b>04</b></span>
                                  <h3 id="fnb-perspectives-title">Las claves <em>del mercado.</em></h3>
                                  <p>Qué significan los titulares para empresas, inversionistas y mercados.</p>
                              </div>
                              <div className="fnb-intelligence-method" aria-label="Método de lectura editorial">
                                  <div><span>Modelo de lectura</span><strong><b id="fnb-insight-count">—</b> tesis activas</strong></div>
                                  <ol>
                                      <li><b>01</b><span>Qué ocurrió<small>Hecho verificable</small></span></li>
                                      <li><b>02</b><span>Por qué importa<small>Impacto conectado</small></span></li>
                                      <li><b>03</b><span>Qué seguir<small>Próxima señal</small></span></li>
                                  </ol>
                              </div>
                          </header>
                          <div className="fnb-perspectives-grid" id="fnb-perspectives-grid" aria-live="polite">
                              <div className="fnb-perspective-skeleton"></div><div className="fnb-perspective-skeleton"></div><div className="fnb-perspective-skeleton"></div>
                          </div>
                      </section>

                      <section className="fnb-coverage" id="fnb-coverage-section" aria-labelledby="fnb-coverage-title">
                          <header className="fnb-editorial-heading fnb-carousel-heading fnb-coverage-head">
                              <div className="fnb-coverage-intro">
                                  <span>Cobertura internacional <b>05</b></span>
                                  <h3 id="fnb-coverage-title">El mundo financiero, <em>historia por historia.</em></h3>
                                  <p>Una selección visual que conecta capitales, monedas, energía y política económica.</p>
                              </div>
                              <div className="fnb-carousel-actions">
                                  <div className="fnb-world-window" aria-hidden="true">
                                      <span className="fnb-world-orbit"></span><i className="one"></i><i className="two"></i><i className="three"></i>
                                  </div>
                                  <div className="fnb-coverage-instruction"><span><i aria-hidden="true"></i> Ventana global activa</span><strong>Arrastra para recorrer la edición</strong></div>
                                  <div className="fnb-carousel-controls" aria-label="Controles del carrusel de noticias">
                                      <button type="button" id="fnb-carousel-prev" aria-label="Ver noticias anteriores"><i className="fas fa-arrow-left" aria-hidden="true"></i></button>
                                      <span id="fnb-carousel-count" aria-live="polite">1 / 6</span>
                                      <button type="button" id="fnb-carousel-next" aria-label="Ver noticias siguientes"><i className="fas fa-arrow-right" aria-hidden="true"></i></button>
                                  </div>
                              </div>
                          </header>
                          <div className="fnb-carousel-shell">
                              <div className="fnb-coverage-console">
                                  <span><i className="fas fa-earth-americas" aria-hidden="true"></i> Historia en foco</span>
                                  <strong id="fnb-coverage-active-title">Preparando la cobertura internacional…</strong>
                                  <em><i className="fas fa-hand-pointer" aria-hidden="true"></i> Desliza o usa las flechas</em>
                              </div>
                              <div className="fnb-coverage-grid" id="fnb-coverage-grid" tabIndex="0" aria-live="polite" aria-label="Carrusel de cobertura financiera internacional">
                                  <div className="fnb-coverage-skeleton"></div><div className="fnb-coverage-skeleton"></div><div className="fnb-coverage-skeleton"></div>
                              </div>
                              <div className="fnb-coverage-navigation">
                                  <div className="fnb-carousel-dots" id="fnb-carousel-dots" aria-label="Seleccionar noticia del carrusel"></div>
                                  <div className="fnb-coverage-progress" aria-hidden="true"><span id="fnb-coverage-progress"></span></div>
                                  <small>WORLD DESK · EDICIÓN GLOBAL</small>
                              </div>
                          </div>
                      </section>

                      <section className="fnb-archive fnb-story-index" id="fnb-archive-section" aria-labelledby="fnb-archive-title">
                          <header className="fnb-story-index-head">
                              <div className="fnb-story-index-chapter" aria-hidden="true"><span>ÍNDICE VIVO</span><b>06</b></div>
                              <div className="fnb-story-index-title">
                                  <span><i aria-hidden="true"></i>Edición completa · mesa internacional</span>
                                  <h3 id="fnb-archive-title">La jornada, <em>noticia por noticia.</em></h3>
                                  <p id="fnb-archive-summary">Todas las historias de la edición, organizadas para que encuentres primero lo que realmente te importa.</p>
                              </div>
                              <div className="fnb-story-index-state">
                                  <span><i aria-hidden="true"></i>Actualización continua</span>
                                  <strong>Explora a tu ritmo</strong>
                                  <small>Busca, ordena y abre cualquier historia.</small>
                              </div>
                          </header>

                          <div className="fnb-story-feature-label"><span>01</span><strong>La historia esencial</strong><i></i><small>El punto de partida recomendado por la mesa</small></div>
                          <div className="fnb-archive-spotlight" id="fnb-archive-spotlight" aria-live="polite">
                              <div className="fnb-spotlight-skeleton" aria-hidden="true"></div>
                          </div>

                          <div className="fnb-story-desk">
                              <div className="fnb-story-desk-label">
                                  <span>02</span>
                                  <div><small>Mesa de exploración</small><strong>Construye tu propia edición</strong></div>
                              </div>
                              <div className="fnb-archive-console fnb-story-index-console">
                                  <label className="fnb-archive-search" htmlFor="fnb-archive-search">
                                      <i className="fas fa-magnifying-glass" aria-hidden="true"></i>
                                      <span className="sr-only">Buscar en las noticias de la edición</span>
                                      <input id="fnb-archive-search" type="search" placeholder="Empresa, mercado o tema…" autoComplete="off" />
                                      <kbd>Ctrl K</kbd>
                                  </label>
                                  <div className="fnb-archive-sort" role="group" aria-label="Ordenar noticias">
                                      <button className="is-active" type="button" data-archive-sort="recent" aria-pressed="true"><i className="fas fa-clock" aria-hidden="true"></i> Recientes</button>
                                      <button type="button" data-archive-sort="impact" aria-pressed="false"><i className="fas fa-bolt" aria-hidden="true"></i> Impacto</button>
                                  </div>
                                  <div className="fnb-archive-result" aria-live="polite"><strong id="fnb-archive-count">0</strong><span>historias</span></div>
                              </div>
                          </div>

                          <div className="fnb-story-ledger-head"><span>03</span><strong>El resto de la jornada</strong><i></i><small>Selecciona una tarjeta para abrir la historia completa</small></div>
                          <div className="fnb-archive-list" id="fnb-archive-list" aria-live="polite">
                              <div className="fnb-archive-skeleton"></div><div className="fnb-archive-skeleton"></div><div className="fnb-archive-skeleton"></div>
                          </div>
                          <div className="fnb-archive-more" id="fnb-archive-more" hidden>
                              <div className="fnb-archive-more-progress" aria-hidden="true"><span id="fnb-archive-more-progress"></span></div>
                              <button type="button" id="fnb-archive-more-button"><span>Descubrir más historias</span><i className="fas fa-chevron-down" aria-hidden="true"></i></button>
                              <small id="fnb-archive-more-label">Mostrando una selección de la edición</small>
                          </div>
                      </section>

              </section>
          </div>
          <div className="news-sidebar">
                  <div className="section-lbl" style={{ marginBottom: '.7rem' }}>
                      <i className="fas fa-newspaper" style={{ fontSize: '.72rem' }}></i>Noticias Financieras
                  </div>
                  <div className="filter-bar">
                      <button className="fpill active" onClick={(e) => { window.ncFilter('all',e.currentTarget); }}>TODOS</button>
                      <button className="fpill" onClick={(e) => { window.ncFilter('globales',e.currentTarget); }}>🌐 Mercados</button>
                      <button className="fpill" onClick={(e) => { window.ncFilter('commodities',e.currentTarget); }}>💱 Divisas</button>
                  </div>
                  <div className="news-carousel">
                      <div className="nc-viewport" id="ncViewport" style={{ height: '732px' }}>
                          <div className="nc-track" id="ncTrack">
                              <div className="nc-card" style={{ pointerEvents: 'none' }}><div className="nc-img sk-block"></div><div className="nc-body"><div className="sk-line w45" style={{ height: '7px', width: '80px', margin: '0' }}></div><div className="sk-line w90" style={{ height: '10px', margin: '4px 0' }}></div><div className="sk-line w70" style={{ height: '10px', margin: '0' }}></div></div></div>
                              <div className="nc-card" style={{ pointerEvents: 'none' }}><div className="nc-img sk-block"></div><div className="nc-body"><div className="sk-line w45" style={{ height: '7px', width: '80px', margin: '0' }}></div><div className="sk-line w90" style={{ height: '10px', margin: '4px 0' }}></div><div className="sk-line w70" style={{ height: '10px', margin: '0' }}></div></div></div>
                              <div className="nc-card" style={{ pointerEvents: 'none' }}><div className="nc-img sk-block"></div><div className="nc-body"><div className="sk-line w45" style={{ height: '7px', width: '80px', margin: '0' }}></div><div className="sk-line w90" style={{ height: '10px', margin: '4px 0' }}></div><div className="sk-line w70" style={{ height: '10px', margin: '0' }}></div></div></div>
                          </div>
                      </div>
                      <div className="nc-nav">
                          <button className="nc-btn" id="ncBtnUp" onClick={(e) => { window.ncMove(-1); }} title="Anteriores"><i className="fas fa-chevron-up"></i></button>
                          <button className="nc-btn" id="ncBtnDown" onClick={(e) => { window.ncMove(1); }} title="Siguientes"><i className="fas fa-chevron-down"></i></button>
                      </div>
                  </div>
                  <aside className="finance-sidebar-pulse" aria-label="Monitor cruzado de mercados">
                      <div className="finance-sidebar-pulse-head">
                          <span><i className="fas fa-wave-square"></i> Monitor cruzado</span>
                          <em>Lectura en vivo</em>
                      </div>
                      <div className="finance-sidebar-pulse-grid">
                          <div><small>EUR / USD</small><strong id="sidebar-pulse-eurusd">—</strong><span id="sidebar-pulse-eurusd-note">Tipo de cambio</span></div>
                          <div><small>DXY</small><strong id="sidebar-pulse-dxy">—</strong><span id="sidebar-pulse-dxy-note">Dólar global</span></div>
                          <div><small>VIX</small><strong id="sidebar-pulse-vix">—</strong><span id="sidebar-pulse-vix-note">Volatilidad</span></div>
                          <div><small>Amplitud USD</small><strong id="sidebar-pulse-carry">—</strong><span>Cruces favorables</span></div>
                      </div>
                      <p id="sidebar-pulse-reading"><i className="fas fa-circle-info"></i> El monitor conecta divisas, volatilidad y tasas para contextualizar la gráfica.</p>
                  </aside>
              </div>
      </div>

                  <div className="ff-news-reader" id="ff-news-reader" hidden>
                      <div className="ff-news-reader-backdrop" data-close-news-reader=""></div>
                      <article role="dialog" aria-modal="true" aria-labelledby="ff-reader-title" aria-describedby="ff-reader-description">
                          <button className="ff-reader-close" type="button" data-close-news-reader="" aria-label="Cerrar noticia"><i className="fas fa-xmark"></i></button>
                          <span className="ff-kicker" id="ff-reader-category">Mercados</span>
                          <h2 id="ff-reader-title">Detalle de la noticia</h2>
                          <div className="ff-reader-meta"><span id="ff-reader-source">Fuente</span><time id="ff-reader-time">Ahora</time><em id="ff-reader-impact">Neutral</em></div>
                          <p id="ff-reader-description"></p>
                          <div className="ff-reader-insight" id="ff-reader-insight-wrap"><span><i className="fas fa-lightbulb"></i> Lectura editorial</span><strong id="ff-reader-insight">Contexto editorial de la noticia.</strong></div>
                          <div className="ff-reader-related"><span>Mercados relacionados</span><strong id="ff-reader-related">Contexto financiero</strong></div>
                          <a className="ff-reader-original" id="ff-reader-original" href="#" target="_blank" rel="noopener noreferrer">Consultar fuente original <i className="fas fa-arrow-up-right-from-square"></i></a>
                          <p className="ff-disclaimer" id="ff-reader-disclaimer">Este resumen es informativo y no constituye una recomendación financiera.</p>
                      </article>
                  </div>
              </main>

              </div>
          </div>
              <section className="debt-pro" id="bonds-panel" style={{ display: 'none' }}>

              <section className="fbm-shell" id="bond-world-map" data-fin-scope="bonos" aria-labelledby="fbm-title">
                  <header className="fbm-header">
                      <div className="fbm-heading">
                          <span className="fbm-kicker"><i className="fas fa-earth-americas" aria-hidden="true"></i> Renta fija</span>
                          <h3 id="fbm-title">Mapa mundial de bonos</h3>
                          <p>Compara el rendimiento soberano por pa&iacute;s. El color representa el nivel del plazo seleccionado; selecciona un mercado para consultar su instrumento y procedencia.</p>
                      </div>
                      <div className="fbm-header-meta">
                          <span className="fbm-status" id="fbm-status" role="status" aria-live="polite"><i className="fas fa-circle-notch fa-spin" aria-hidden="true"></i> Preparando mapa</span>
                          <label className="fbm-country-picker">
                              <span>Ir a un pa&iacute;s</span>
                              <select id="fbm-country" aria-label="Seleccionar pa&iacute;s en el mapa"><option value="">Elegir pa&iacute;s&hellip;</option></select>
                          </label>
                      </div>
                  </header>

                  <div className="fbm-toolbar">
                      <div className="fbm-fixed-maturity" aria-label="Plazo fijo de 10 años">
                          <span>Plazo fijo</span>
                          <strong>10 a&ntilde;os</strong>
                      </div>
                      <div className="fbm-legend" aria-label="Leyenda del mapa">
                          <span><small>Menor</small><strong id="fbm-legend-min">&mdash;</strong></span>
                          <i aria-hidden="true"><b id="fbm-legend-marker"></b></i>
                          <span><small>Mayor</small><strong id="fbm-legend-max">&mdash;</strong></span>
                      </div>
                  </div>

                  <div className="fbm-command">
                      <div className="fbm-filters" role="group" aria-label="Filtrar mercados de bonos por región">
                          <button type="button" className="is-active" data-fbm-filter="all" aria-pressed="true"><i className="fas fa-layer-group" aria-hidden="true"></i> Todos</button>
                          <button type="button" data-fbm-filter="americas" aria-pressed="false"><i className="fas fa-earth-americas" aria-hidden="true"></i> Américas</button>
                          <button type="button" data-fbm-filter="europe" aria-pressed="false"><i className="fas fa-earth-europe" aria-hidden="true"></i> Europa</button>
                          <button type="button" data-fbm-filter="asia" aria-pressed="false"><i className="fas fa-earth-asia" aria-hidden="true"></i> Asia–Pacífico</button>
                          <button type="button" data-fbm-filter="emerging" aria-pressed="false"><i className="fas fa-arrow-trend-up" aria-hidden="true"></i> Emergentes</button>
                      </div>
                      <span className="fbm-filter-status" id="fbm-filter-status" aria-live="polite">Vista global</span>
                  </div>

                  <div className="fbm-workspace">
                      <div className="fbm-map-wrap" id="fbm-map-wrap">
                          <div className="fbm-map-tools" role="group" aria-label="Controles de acercamiento del mapa de bonos">
                              <button type="button" data-fbm-zoom="in" aria-label="Acercar mapa"><span>Acercar</span><i className="fas fa-plus" aria-hidden="true"></i></button>
                              <button type="button" data-fbm-zoom="out" aria-label="Alejar mapa" disabled><span>Alejar</span><i className="fas fa-minus" aria-hidden="true"></i></button>
                              <button type="button" data-fbm-zoom="reset" aria-label="Restablecer mapa"><span>Centrar</span><i className="fas fa-expand" aria-hidden="true"></i></button>
                              <output id="fbm-zoom-value" aria-live="polite">100%</output>
                          </div>
                          <div className="fbm-map-stage" id="fbm-map-stage" tabIndex="0" aria-label="Mapa interactivo de rendimientos soberanos">
                              <div className="fbm-map-canvas" id="fbm-map-canvas"></div>
                          </div>
                          <div className="fbm-pan-hint" aria-hidden="true"><i className="fas fa-hand" aria-hidden="true"></i><span>Arrastra para explorar</span></div>
                          <div className="fbm-hover-tip" id="fbm-hover-tip" role="tooltip" hidden></div>
                          <div className="fbm-map-empty" id="fbm-map-empty" hidden><i className="fas fa-map-location-dot" aria-hidden="true"></i><strong>Sin cobertura para este plazo</strong><span>Prueba con el bono a 10 a&ntilde;os.</span></div>
                      </div>
                  </div>

                  <footer className="fbm-footer">
                      <div><span className="fbm-dot is-live"></span><strong>Dato conectado</strong><small>Fuente externa consultada por el backend</small></div>
                      <div><span className="fbm-dot is-ref"></span><strong>Referencia indicativa</strong><small>Valor de apoyo; no representa una cotizaci&oacute;n en vivo</small></div>
                      <p><i className="fas fa-circle-info" aria-hidden="true"></i> Los rendimientos no expresan por s&iacute; solos calidad crediticia ni una recomendaci&oacute;n de inversi&oacute;n.</p>
                  </footer>
              </section>

              <header className="debt-pro-hero">
                  <div>
                      <span className="debt-pro-eyebrow"><i className="fas fa-landmark"></i> Global Fixed Income Monitor</span>
                      <h2>Deuda &amp; Bonos Soberanos</h2>
                      <p>Lectura integrada de curva, duración, tasas soberanas, primas relativas y condiciones monetarias globales.</p>
                  </div>
                  <div className="debt-pro-meta"><span><i className="fas fa-circle"></i> Mercado de deuda</span><small id="bonds-upd">Actualización en segundo plano</small></div>
              </header>

              <div className="debt-kpi-grid debt-country-grid" aria-label="Países disponibles en la gráfica histórica">
                  {[
                    ['us','^TNX','🇺🇸','Estados Unidos','Treasury 10A','tone-us'],
                    ['cn','CGB10Y','🇨🇳','China','ChinaBond 10A','tone-front'],
                    ['jp','IRLTLT01JPM156N','🇯🇵','Japón','JGB 10A','tone-inflation'],
                    ['de','DE','🇩🇪','Alemania','Bund 10A','tone-us'],
                    ['fr','FR','🇫🇷','Francia','OAT 10A','tone-front'],
                    ['it','IT','🇮🇹','Italia','BTP 10A','tone-inflation'],
                    ['es','ES','🇪🇸','España','Bono 10A','tone-long'],
                    ['nl','NL','🇳🇱','Países Bajos','DSL 10A','tone-front'],
                    ['gr','GR','🇬🇷','Grecia','Bono 10A','tone-credit'],
                    ['pt','PT','🇵🇹','Portugal','OT 10A','tone-carry'],
                  ].map(([country,series,flag,name,instrument,tone]) => (
                    <article key={country} className={`debt-kpi debt-country-card ${tone} report-card`} data-fin-scope="bonos" data-bond-country={country} role="button" tabIndex="0" aria-pressed="false" onClick={() => window.selectBondTimelineCountry?.(country,series)} onKeyDown={(e) => window.reportCardKey?.(e,()=>window.selectBondTimelineCountry?.(country,series))}>
                        <span className="debt-kpi-icon debt-country-flag" aria-hidden="true">{flag}</span>
                        <div><small>{name}</small><strong id={`bond-shortcut-${country}-value`}>—</strong><span>{instrument} · Abrir gráfica</span></div>
                        <i className="fas fa-arrow-right debt-country-arrow" aria-hidden="true"></i>
                    </article>
                  ))}

                  {/* ── Indicadores de tasas de referencia ──────────────────────────
                       Solo se muestran en "Tasas y bonos". Vienen de Banxico vía
                       /api/mx-rates; no se incluyen tasas de otros bancos centrales
                       porque las que hay en el backend son valores fijos, no datos. */}
                  <article className="debt-kpi tone-mx report-card" data-fin-scope="tasas" role="button" tabIndex="0" onClick={(e) => { window.openBondDetail('mx','TIIE 28D'); }}><span className="debt-kpi-icon"><i className="fas fa-peso-sign"></i></span><div><small>TIIE 28 días</small><strong id="debt-kpi-tiie">—</strong><span id="debt-kpi-tiie-chg">Interbancaria México</span></div></article>
                  <article className="debt-kpi tone-mx report-card" data-fin-scope="tasas"><span className="debt-kpi-icon"><i className="fas fa-calendar-day"></i></span><div><small>CETES 28 días</small><strong id="debt-kpi-cetes28">—</strong><span id="debt-kpi-cetes28-chg">Gobierno de México</span></div></article>
                  <article className="debt-kpi tone-mx report-card" data-fin-scope="tasas"><span className="debt-kpi-icon"><i className="fas fa-calendar-week"></i></span><div><small>CETES 91 días</small><strong id="debt-kpi-cetes91">—</strong><span id="debt-kpi-cetes91-chg">Gobierno de México</span></div></article>
                  <article className="debt-kpi tone-mx report-card" data-fin-scope="tasas"><span className="debt-kpi-icon"><i className="fas fa-calendar-days"></i></span><div><small>CETES 364 días</small><strong id="debt-kpi-cetes364">—</strong><span id="debt-kpi-cetes364-chg">Gobierno de México</span></div></article>
                  <article className="debt-kpi tone-front report-card" data-fin-scope="tasas"><span className="debt-kpi-icon"><i className="fas fa-chart-simple"></i></span><div><small>Pendiente CETES 364 − 28</small><strong id="debt-kpi-cetes-curve">—</strong><span id="debt-kpi-cetes-curve-state">Expectativa monetaria</span></div></article>
                  <article className="debt-kpi tone-carry report-card" data-fin-scope="tasas" role="button" tabIndex="0" onClick={(e) => { window.openBondDetail('mx','Prima'); }}><span className="debt-kpi-icon"><i className="fas fa-scale-balanced"></i></span><div><small>Prima México</small><strong id="debt-kpi-carry">—</strong><span id="debt-kpi-carry-state">TIIE vs US 10Y</span></div></article>
              </div>

              {/* ── Línea del tiempo de tasas y bonos ──────────────────────────────
                   Series históricas soberanas verificables de EE.UU., Europa y Asia.
                   China se obtiene de la curva oficial ChinaBond/CCDC; México queda
                   fuera de esta visualización por decisión editorial. */}
              <section className="rate-timeline" id="rate-timeline" aria-labelledby="rtl-title">
                  <header className="rtl-head">
                      <div className="rtl-copy">
                          <small>Renta fija</small>
                          <h3 id="rtl-title">Evoluci&oacute;n hist&oacute;rica</h3>
                      </div>
                      <div className="rtl-controls">
                          <label className="rtl-field">
                              <span>País</span>
                              <select id="rtl-country" aria-label="País de la serie" defaultValue="us">
                                  <option value="us">&#127482;&#127480; Estados Unidos</option>
                                  <option value="cn">&#127464;&#127475; China</option>
                              </select>
                          </label>
                          <label className="rtl-field">
                              <span>Serie</span>
                              <select id="rtl-series" aria-label="Instrumento"></select>
                          </label>
                          <div className="rtl-compare-control">
                              <label className="rtl-field">
                                  <span>Agregar comparación</span>
                                  <select id="rtl-compare-picker" aria-label="País o serie para comparar"></select>
                              </label>
                              <button type="button" className="rtl-add-compare" id="rtl-add-compare">
                                  <i className="fas fa-plus" aria-hidden="true"></i>
                                  Agregar
                              </button>
                          </div>
                          <fieldset className="rtl-field rtl-periods">
                              <legend>Periodo</legend>
                              <div className="rtl-period-group" id="rtl-periods" role="group" aria-label="Periodo">
                                  <button type="button" data-years="1">1 a&ntilde;o</button>
                                  <button type="button" data-years="3">3 a&ntilde;os</button>
                                  <button type="button" data-years="5" className="is-active">5 a&ntilde;os</button>
                                  <button type="button" data-years="10">10 a&ntilde;os</button>
                              </div>
                          </fieldset>
                      </div>
                      <div className="rtl-comparison-bar" aria-label="Países seleccionados para comparar">
                          <div className="rtl-comparisons" id="rtl-comparisons"></div>
                          <span className="rtl-compare-count" id="rtl-compare-count">1 / 5 países</span>
                      </div>
                  </header>

                  <div className="rtl-stats" id="rtl-stats">
                      <div><span>Último</span><strong id="rtl-last">—</strong><em id="rtl-last-date">Sin lectura</em></div>
                      <div><span>Máximo del periodo</span><strong id="rtl-max">—</strong><em id="rtl-max-date">—</em></div>
                      <div><span>Mínimo del periodo</span><strong id="rtl-min">—</strong><em id="rtl-min-date">—</em></div>
                      <div><span>Variación</span><strong id="rtl-chg">—</strong><em>Inicio a último</em></div>
                      <div id="rtl-spread-cell" hidden><span>Diferencial</span><strong id="rtl-spread">—</strong><em id="rtl-spread-note">—</em></div>
                      <div className="rtl-slope-cell"><span id="rtl-slope-label">Pendiente de la serie principal</span><strong id="rtl-slope">&mdash;</strong><em id="rtl-slope-note">Tendencia anualizada</em></div>
                  </div>

                  <div className="rtl-spread-list" id="rtl-spread-list" hidden></div>
                  <div className="rtl-legend" id="rtl-legend" hidden></div>

                  <div className="rtl-chart">
                      <div className="rtl-state" id="rtl-state">Cargando serie histórica…</div>
                      <canvas id="rtl-canvas" aria-label="Evolución histórica del rendimiento"></canvas>
                  </div>

                  <footer className="rtl-foot">
                      <span id="rtl-source">Fuente pendiente</span>
                      <span id="rtl-count"></span>
                  </footer>
              </section>

          {/* Diferenciales soberanos a 10 años. Solo se muestra en los módulos Bonos y
               Tasas; lo llena renderSpreadsBoard() desde /api/bond-spreads. */}
          <section className="ff-spreads-board" id="ff-spreads-board" data-fin-scope="bonos" aria-labelledby="ff-spreads-title" hidden>
              <header className="ff-spreads-header">
                  <div>
                      <span className="ff-kicker"><i className="fas fa-scale-balanced" aria-hidden="true"></i> Renta fija</span>
                      <h2 id="ff-spreads-title">Diferenciales soberanos</h2>
                      <p>Rendimiento del bono a 10 años de cada país y su diferencia, en puntos base, frente a las referencias que elijas.</p>
                  </div>
                  <div className="ff-spreads-tools">
                      <label>
                          <span>Comparar contra</span>
                          <select id="ff-spreads-ref" aria-label="Elegir el país de referencia principal"></select>
                      </label>
                      <span className="ff-spreads-asof" id="ff-spreads-asof" aria-live="polite">Consultando…</span>
                  </div>
              </header>
              <div className="ff-spreads-summary" aria-label="Resumen de diferenciales soberanos">
                  <article><span><i className="fas fa-earth-americas" aria-hidden="true"></i> Cobertura</span><strong id="ff-spreads-universe">&mdash;</strong><small>Mercados soberanos</small></article>
                  <article><span><i className="fas fa-arrow-trend-up" aria-hidden="true"></i> Mayor rendimiento</span><strong id="ff-spreads-high">&mdash;</strong><small id="ff-spreads-high-note">Dentro del universo</small></article>
                  <article><span><i className="fas fa-arrows-left-right-to-line" aria-hidden="true"></i> M&aacute;s cercano</span><strong id="ff-spreads-tight">&mdash;</strong><small id="ff-spreads-tight-note">Frente a la referencia</small></article>
                  <article><span><i className="fas fa-triangle-exclamation" aria-hidden="true"></i> Mayor prima</span><strong id="ff-spreads-wide">&mdash;</strong><small id="ff-spreads-wide-note">Frente a la referencia</small></article>
              </div>
              <div className="ff-spreads-table-wrap">
                  <table className="ff-spreads-table">
                      <thead>
                          <tr>
                              <th className="ff-sp-country"><button type="button" data-spread-sort="name">País</button></th>
                              <th className="ff-sp-num"><button type="button" data-spread-sort="yield">Rend. 10A</button></th>

                              <th className="ff-sp-num"><button type="button" data-spread-sort="chg" title="Variación frente a la observación anterior de cada fuente">Var.</button></th>
                              <th className="ff-sp-num" id="ff-sp-h1"></th>
                              <th className="ff-sp-num" id="ff-sp-h2"></th>
                              <th className="ff-sp-num" id="ff-sp-h3"></th>
                              <th className="ff-sp-num" id="ff-sp-h4"></th>
                          </tr>
                      </thead>
                      <tbody id="ff-spreads-body">
                          <tr><td colSpan="7">Cargando diferenciales…</td></tr>
                      </tbody>
                  </table>
              </div>
              <aside className="ff-spreads-note" id="ff-spreads-note">
                  <i className="fas fa-circle-info" aria-hidden="true"></i>
                  <p></p>
              </aside>
          </section>

              <section className="cf-block" id="country-factsheet" data-fin-scope="bonos" aria-labelledby="cf-title">
                  <header className="cf-head">
                      <div className="cf-copy">
                          <small>Renta fija</small>
                          <h3 id="cf-title">Perfil de pa&iacute;s</h3>
                          <p>Qué instrumento se está midiendo en cada país, con su rendimiento, cierre previo y fuente declarada.</p>
                      </div>
                      <label className="cf-picker">
                          <span>País</span>
                          <select id="cf-country" aria-label="Seleccionar país" onChange={(e) => { window.setCountryFactsheet(e.currentTarget.value); }}></select>
                      </label>
                  </header>

                  <div className="cf-top">
                      <div className="cf-hero" id="cf-hero"></div>
                      <div className="cf-side">
                          <div className="cf-position" id="cf-position"></div>
                          <div className="cf-neighbors" id="cf-neighbors"></div>
                      </div>
                  </div>

                  <div className="cf-table-block">
                      <div className="cf-table-title">
                          <span>Instrumentos del mercado</span>
                          <small id="cf-inst-count">—</small>
                      </div>
                      <div className="cf-table">
                          <div className="cf-table-head" aria-hidden="true">
                              <span>Instrumento</span>
                              <span>Plazo</span>
                              <span>Rendimiento</span>
                              <span>Cierre previo</span>
                              <span>Variación</span>
                          </div>
                          <div id="cf-instruments"></div>
                      </div>
                  </div>

                  <div className="cf-context" id="cf-context"></div>
              </section>

              <div className="debt-main-grid">


                  <article className="debt-block debt-global-block">
                      <div className="debt-block-head sovereign-board-hero">
                          <div className="sovereign-board-title"><span className="sovereign-board-title-icon"><i className="fas fa-globe"></i></span><div><small>Renta fija</small><h3>Tasas soberanas globales</h3><p>Compara rendimiento, movimiento diario y prima relativa de cada mercado.</p></div></div>
                          <span id="debt-board-status">Cargando mercados</span>
                      </div>
                      <div className="sovereign-board-summary">
                          <div><span><i className="fas fa-earth-americas"></i> Cobertura</span><strong id="debt-board-coverage">—</strong><small id="debt-board-maturity">Plazo seleccionado</small></div>
                          <div><span><i className="fas fa-chart-simple"></i> Rendimiento promedio</span><strong id="debt-board-average">—</strong><small>Media de países disponibles</small></div>
                          <div><span><i className="fas fa-scale-balanced"></i> Mediana global</span><strong id="debt-board-median">—</strong><small>Referencia para primas relativas</small></div>
                          <div><span><i className="fas fa-arrow-down-up-across-line"></i> Dispersión</span><strong id="debt-board-dispersion">—</strong><small>Máximo menos mínimo</small></div>
                      </div>
                      <div className="sovereign-board-insights" aria-label="Lecturas destacadas del mercado soberano">
                          <article className="sov-insight is-high">
                              <span><i className="fas fa-arrow-trend-up"></i> Mayor rendimiento</span>
                              <strong id="sov-high-country">—</strong>
                              <small id="sov-high-value">Esperando datos</small>
                          </article>
                          <article className="sov-insight is-low">
                              <span><i className="fas fa-shield-halved"></i> Menor rendimiento</span>
                              <strong id="sov-low-country">—</strong>
                              <small id="sov-low-value">Esperando datos</small>
                          </article>
                          <article className="sov-insight is-move">
                              <span><i className="fas fa-wave-square"></i> Mayor movimiento</span>
                              <strong id="sov-move-country">—</strong>
                              <small id="sov-move-value">Esperando datos</small>
                          </article>
                      </div>

                      <div className="sovereign-board-controls">
                          <div className="sov-filter-row">
                              <span className="sov-filter-label">Región</span>
                              <div className="sov-filter-group sovereign-region-filter" role="group" aria-label="Filtrar países por región">
                                  <button type="button" className="active" data-region="all" onClick={(e) => { window.setGlobalBondRegion('all',e.currentTarget); }}>Todos</button>
                                  <button type="button" data-region="americas" onClick={(e) => { window.setGlobalBondRegion('americas',e.currentTarget); }}>Américas</button>
                                  <button type="button" data-region="europe" onClick={(e) => { window.setGlobalBondRegion('europe',e.currentTarget); }}>Europa</button>
                                  <button type="button" data-region="asia" onClick={(e) => { window.setGlobalBondRegion('asia',e.currentTarget); }}>Asia–Pacífico</button>
                                  <button type="button" data-region="emerging" onClick={(e) => { window.setGlobalBondRegion('emerging',e.currentTarget); }}>Emergentes</button>
                              </div>
                          </div>
                          <span className="sov-fixed-note"><i className="fas fa-lock"></i> Plazo fijo: bono soberano a 10 años</span>
                      </div>

                      <div className="sov-matrix-head" aria-hidden="true">
                          <span>Mercado soberano</span>
                          <span>Rendimiento 10A</span>
                          <span>Cierre previo</span>
                          <span>Movimiento diario</span>
                          <span>Prima vs mediana</span>
                          <span>Posición global</span>
                      </div>
                      <div id="bonds-global" className="sovereign-board-table">
                          <div className="sk-block" style={{ height: '46px' }}></div>
                          <div className="sk-block" style={{ height: '46px' }}></div>
                          <div className="sk-block" style={{ height: '46px' }}></div>
                      </div>
                      {/* Desagregación por región: resume los mismos mercados de la
                           matriz y queda después de la comparación principal. */}
                      <div className="sov-regions" id="sov-regions" data-fin-scope="bonos" aria-label="Mediana de rendimiento por región"></div>
                      <div className="sovereign-board-footnote"><i className="fas fa-circle-info"></i><span>La intensidad compara cada métrica dentro del universo visible. En movimiento diario, rojo indica aumento del rendimiento y verde una disminución.</span><small>Selecciona cualquier celda para abrir el reporte del país.</small></div>
                  </article>
              </div>

              <div id="bonds-loading" style={{ display: 'none', textAlign: 'center', color: '#bbb', fontSize: '.74rem', padding: '1.2rem 0', fontFamily: '\'Inter\',sans-serif' }}></div>
          </section>

      <template id="equity-pro-panel-removed">
              <header className="inst-hero">
                  <div className="inst-hero-left">
                      <span className="inst-badge">Renta variable global</span>
                      <h2>C&oacute;mo van las bolsas del mundo</h2>
                      <p>Cu&aacute;ntos &iacute;ndices suben y cu&aacute;ntos bajan, c&oacute;mo se comporta cada regi&oacute;n y qu&eacute; se&ntilde;ala el conjunto en la sesi&oacute;n de hoy.</p>
                  </div>
                  <div className="inst-hero-right">
                      <div className="inst-status-led"></div>
                      <small id="eq-updated">Live Data Connection</small>
                  </div>
              </header>

              {/* Ticker Tape (Contexto Transversal) */}
              <div className="inst-ticker-tape">
                  <div className="inst-ticker"><span className="lbl">Bono EUA 10A</span><strong id="eq-ctx-tnx">4.60%</strong><span className="sub">Costo del dinero</span></div>
                  <div className="inst-ticker"><span className="lbl">DXY</span><strong id="eq-ctx-dxy">100.96</strong><span className="sub">&Iacute;ndice d&oacute;lar</span></div>
                  <div className="inst-ticker"><span className="lbl">VIX</span><strong id="eq-ctx-vix">18.60</strong><span className="sub">Volatilidad</span></div>
                  <div className="inst-ticker"><span className="lbl">Oro</span><strong id="eq-ctx-gold">$4,013</strong><span className="sub">Activo refugio</span></div>
                  <div className="inst-ticker"><span className="lbl">Fed</span><strong id="eq-ctx-fed">4.50%</strong><span className="sub">Tasa EE.UU.</span></div>
                  <div className="inst-ticker"><span className="lbl">TIIE</span><strong id="eq-ctx-tiie">6.50%</strong><span className="sub">Tasa M&eacute;xico</span></div>
                  <div className="inst-ticker"><span className="lbl">Carry</span><strong id="eq-ctx-carry">+2.00%</strong><span className="sub">Diferencial MX&minus;EUA</span></div>
                  <div className="inst-ticker"><span className="lbl">Amplitud</span><strong id="eq-ctx-breadth">11%</strong><span className="sub">Regiones al alza</span></div>
              </div>

                  <div className="inst-grid-main">
                  {/* Left Column: KPIs & Regions Heatmap */}
                  <div className="inst-col-left">
                      {/* Data Density KPIs */}
                                      <div className="inst-kpi-table">
                          <div className="inst-kpi-header">
                              <span>&Iacute;ndice</span>
                              <span style={{ textAlign: 'center' }}>Rango del d&iacute;a (m&iacute;n / m&aacute;x)</span>
                              <span style={{ textAlign: 'right' }}>&Uacute;ltimo</span>
                              <span style={{ textAlign: 'right' }}>Variaci&oacute;n</span>
                          </div>
                          <div className="inst-kpi-row" role="button" tabIndex="0" onClick={(e) => { window.openEquityInstitutionalReport('regions',0); }}>
                              <span className="kpi-sym">S&amp;P 500</span>
                              <div className="kpi-range">
                                  <small>7410</small>
                                  <div className="kpi-bar-bg"><div className="kpi-marker" style={{ left: '65%' }}></div></div>
                                  <small>7460</small>
                              </div>
                              <strong className="kpi-val tick-update" id="eq-sp500">7,444.06</strong>
                              <span className="kpi-pct down" id="eq-sp500-pct">-0.18%</span>
                          </div>
                          <div className="inst-kpi-row" role="button" tabIndex="0" onClick={(e) => { window.openEquityInstitutionalReport('regions',1); }}>
                              <span className="kpi-sym">NASDAQ</span>
                              <div className="kpi-range">
                                  <small>25200</small>
                                  <div className="kpi-bar-bg"><div className="kpi-marker" style={{ left: '85%' }}></div></div>
                                  <small>25650</small>
                              </div>
                              <strong className="kpi-val tick-update" id="eq-nasdaq">25,584.43</strong>
                              <span className="kpi-pct up" id="eq-nasdaq-pct">+0.25%</span>
                          </div>
                          <div className="inst-kpi-row" role="button" tabIndex="0" onClick={(e) => { window.openEquityInstitutionalReport('regions',7); }}>
                              <span className="kpi-sym">IPC MX</span>
                              <div className="kpi-range">
                                  <small>65800</small>
                                  <div className="kpi-bar-bg"><div className="kpi-marker" style={{ left: '30%' }}></div></div>
                                  <small>66900</small>
                              </div>
                              <strong className="kpi-val tick-update" id="eq-ipc">66,203.78</strong>
                              <span className="kpi-pct down" id="eq-ipc-pct">-0.65%</span>
                          </div>
                          <div className="inst-kpi-row" role="button" tabIndex="0" onClick={(e) => { window.openEquityVixReport(); }}>
                              <span className="kpi-sym">VIX IDX</span>
                              <div className="kpi-range">
                                  <small>17.2</small>
                                  <div className="kpi-bar-bg"><div className="kpi-marker" style={{ left: '55%' }}></div></div>
                                  <small>19.5</small>
                              </div>
                              <strong className="kpi-val tick-update" id="eq-vix">18.60</strong>
                              <span className="kpi-txt" id="eq-vix-state">Volatilidad moderada</span>
                          </div>
                      </div>

                      {/* Regions Heatmap */}
                      <div className="inst-panel">
                          <div className="inst-panel-hdr">&Iacute;ndices por regi&oacute;n</div>
                          <div className="inst-heatmap" id="eq-region-grid">
                              <div className="hm-cell hm-down" onClick={(e) => { window.openEquityInstitutionalReport('regions',0); }}><span>SPX</span><strong>-0.18%</strong></div>
                              <div className="hm-cell hm-up" onClick={(e) => { window.openEquityInstitutionalReport('regions',1); }}><span>NDX</span><strong>+0.25%</strong></div>
                              <div className="hm-cell hm-down" onClick={(e) => { window.openEquityInstitutionalReport('regions',2); }}><span>RUT</span><strong>-0.52%</strong></div>
                              <div className="hm-cell hm-down" onClick={(e) => { window.openEquityInstitutionalReport('regions',3); }}><span>SX5E</span><strong>-0.06%</strong></div>
                              <div className="hm-cell hm-down" onClick={(e) => { window.openEquityInstitutionalReport('regions',4); }}><span>UKX</span><strong>-0.71%</strong></div>
                              <div className="hm-cell hm-down" onClick={(e) => { window.openEquityInstitutionalReport('regions',5); }}><span>NKY</span><strong>-4.03%</strong></div>
                              <div className="hm-cell hm-down" onClick={(e) => { window.openEquityInstitutionalReport('regions',6); }}><span>HSI</span><strong>-1.78%</strong></div>
                              <div className="hm-cell hm-down" onClick={(e) => { window.openEquityInstitutionalReport('regions',7); }}><span>MEXBOL</span><strong>-0.65%</strong></div>
                              <div className="hm-cell hm-down" onClick={(e) => { window.openEquityInstitutionalReport('regions',8); }}><span>IBOV</span><strong>-0.07%</strong></div>
                          </div>
                      </div>
                  </div>

                  {/* Right Column: Regime & Thesis */}
                  <div className="inst-col-right">
                      {/* Tactical Regime */}
                      <div className="inst-panel">
                          <div className="inst-panel-hdr">Termómetro del mercado</div>
                          <div className="inst-regime-box">
                              <div className="inst-regime-score">
                                  <span className="score-val" id="eq-score">15</span><span className="score-max">/100</span>
                              </div>
                              <div className="inst-regime-desc">
                                  <strong id="eq-score-label">Calculando</strong>
                                  <p id="eq-score-desc">La lectura aparecer&aacute; cuando haya datos de &iacute;ndices y factores.</p>
                              </div>
                          </div>
                          <div className="inst-regime-signals">
                              <div className="sig-row"><span title="Porcentaje de regiones que cierran al alza">&Iacute;ndices al alza</span><strong id="eq-signal-breadth" className="down">11%</strong></div>
                              <div className="sig-row"><span title="Desempeño del sector tecnológico frente al S&amp;P 500">Tecnol&oacute;gicas vs S&amp;P 500</span><strong id="eq-signal-tech" className="up">+0.60</strong></div>
                              <div className="sig-row"><span title="S&amp;P 500 con todas las empresas al mismo peso, frente al índice normal. Si va por debajo, el alza depende de pocas empresas">Ponderaci&oacute;n pareja vs S&amp;P 500</span><strong id="eq-signal-equal" className="down">-0.25</strong></div>
                              <div className="sig-row"><span title="Empresas de baja capitalización frente al S&amp;P 500">Empresas peque&ntilde;as vs S&amp;P 500</span><strong id="eq-signal-small" className="down">-0.15</strong></div>
                          </div>
                      </div>

                      {/* Institutional Thesis */}
                      <div className="inst-panel thesis-panel" onClick={(e) => { window.openEquitySummaryReport('thesis'); }}>
                          <div className="inst-panel-hdr"><i className="fas fa-brain"></i> Lectura de VALLNews</div>
                          <div className="inst-thesis-content">
                              <h3 id="eq-thesis-title">Preparando la lectura de la sesi&oacute;n&hellip;</h3>
                              <p id="eq-thesis-text">El resumen se completar&aacute; cuando lleguen los datos de &iacute;ndices y factores.</p>
                          </div>
                      </div>
                  </div>
              </div>
          </template>

          {/* ── Renta variable global por sector ────────────────────────────────
               Consolida todas las emisoras en una sola lista (sin separar por país),
               las agrupa por sector económico y destaca los indicadores clave arriba.
               Se alimenta de loadSectorBoard() y sólo se muestra en la vista Bolsa. */}
          <section className="sb-panel" id="sectors-panel" aria-labelledby="sb-title">
              <header className="sb-head">
                  <div>
                      <small>Mercados globales</small>
                      <h3 id="sb-title">An&aacute;lisis Sectorial</h3>
                      <p>Composición, desempeño relativo y detalle de cada emisora en una sola lectura de la sesión.</p>
                  </div>
                  <div className="sb-head-meta">
                      <span className="sb-status" id="sb-status">Cargando…</span>
                      <small>Periodo <strong>1D</strong></small>
                  </div>
              </header>

              <div className="sb-overview" id="sb-kpis" aria-label="Resumen sectorial"></div>

              <div className="sb-dashboard">
                  <section className="sb-visual sb-weighting" aria-labelledby="sb-weighting-title">
                      <header>
                          <div><span id="sb-weighting-title">Distribución sectorial</span><small>Participación por número de emisoras</small></div>
                      </header>
                      <div className="sb-donut-layout" id="sb-donut"><div className="sb-skeleton is-round"></div></div>
                  </section>

                  <section className="sb-visual sb-performance" aria-labelledby="sb-performance-title">
                      <header>
                          <div><span id="sb-performance-title">Comparación de desempeño</span><small>Variación media · sesión actual</small></div>
                      </header>
                      <div className="sb-sectors" id="sb-sectors"><div className="sb-skeleton"></div><div className="sb-skeleton"></div><div className="sb-skeleton"></div></div>
                  </section>

                  <section className="sb-visual sb-matrix-panel" aria-labelledby="sb-matrix-title">
                      <header>
                          <div><span id="sb-matrix-title">Desempeño por emisora</span><small>Ordenadas de mayor a menor dentro del sector</small></div>
                          <button type="button" className="sb-reset" id="sb-reset" onClick={() => window.setSectorFilter?.('all')} hidden>Ver todos</button>
                      </header>
                      <div className="sb-matrix-scroll" id="sb-heatmap"><div className="sb-skeleton"></div><div className="sb-skeleton"></div><div className="sb-skeleton"></div></div>
                  </section>
              </div>

              <footer className="sb-foot">
                  <span><i className="fas fa-circle-info" aria-hidden="true"></i> La distribución representa cantidad de emisoras, no capitalización. La variación sectorial es la media simple del universo disponible.</span>
                  <small id="sb-source">Cotizaciones vía Yahoo Finance</small>
              </footer>
          </section>

          <div id="equity-lab-host" className="equity-lab-host"></div>


          <div className="fin-layout" id="fin-layout-wrap" style={{ display: 'none' }}>

              <div className="main-col">

          <div className="panel finance-live-summary" id="rawDataPanel" style={{ marginBottom: '.6rem', padding: '.85rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '.45rem', marginBottom: '.6rem' }}>
                  <div className="section-lbl" style={{ marginBottom: '0', flex: '1', minWidth: '180px' }}>Resumen · Datos en Tiempo Real</div>
                  <div className="rds2-tabs">
                      <button className="rds2-tab active" onClick={(e) => { window.rdsSwitchTab('all',e.currentTarget); }}>Todos</button>
                      <button className="rds2-tab" onClick={(e) => { window.rdsSwitchTab('tasas',e.currentTarget); }}>🏦 Tasas</button>
                      <button className="rds2-tab" onClick={(e) => { window.rdsSwitchTab('mkt',e.currentTarget); }}>📈 Mercados</button>
                      <button className="rds2-tab" onClick={(e) => { window.rdsSwitchTab('risk',e.currentTarget); }}>⚡ Riesgo</button>
                  </div>
                  <span id="rds-upd" style={{ fontSize: '.5rem', color: '#bbb', fontFamily: '\'Inter\',sans-serif', whiteSpace: 'nowrap' }}>—</span>
              </div>
              <div className="rds3-grid" id="rds2-cards">
                  <div className="rds3-col" data-cat="tasas">
                      <div className="rds3-hdr" style={{ borderLeft: '3px solid #3b82f6', paddingLeft: '.5rem' }}>🏦 Tasas Bancarias</div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '65px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '36px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '58px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '36px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '72px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '36px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '60px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '36px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '42px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '36px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '40px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '36px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '40px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '36px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                  </div>
                  <div className="rds3-col" data-cat="mkt">
                      <div className="rds3-hdr" style={{ borderLeft: '3px solid #10b981', paddingLeft: '.5rem' }}>📈 Mercados Clave</div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '55px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '50px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '50px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '50px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '60px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '50px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '44px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '50px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '52px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '62px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '35px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '44px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                  </div>
                  <div className="rds3-col" data-cat="risk">
                      <div className="rds3-hdr" style={{ borderLeft: '3px solid #f59e0b', paddingLeft: '.5rem' }}>⚡ Riesgo & Energía</div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '36px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '36px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '55px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '42px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '50px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '42px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '48px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '42px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                      <div className="rds3-row" style={{ opacity: '.38', pointerEvents: 'none' }}><div className="rds3-dot" style={{ background: '#e2e8f0' }}></div><span className="rds3-lbl"><span className="rds-sk" style={{ width: '52px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-val"><span className="rds-sk" style={{ width: '44px', height: '7px', display: 'inline-block', verticalAlign: 'middle' }}></span></span><span className="rds3-pct"></span></div>
                  </div>
              </div>
          </div>
          <div id="rds2-tip-el" className="rds2-tip"></div>
         <div id="bvmx-panel-anchor" aria-hidden="true"></div>
         <div className="panel market-chart-lab ff-market-terminal" id="bvmx-panel">
              <div className="market-chart-lab-head">
                  <div className="market-chart-heading"><span><i className="fas fa-chart-area"></i></span><div><small>Mercados globales</small><h3>An&aacute;lisis Hist&oacute;ricos de Activo</h3><p>Analiza acciones, &iacute;ndices, divisas, materias primas y cripto desde una sola vista.</p></div></div>
                  <div className="ff-chart-head-status"><span><i aria-hidden="true"></i> Datos de mercado</span><small id="ch-updated">Preparando consulta&hellip;</small></div>
                  <div className="market-chart-controls">
                      <label className="ff-market-control ff-market-control-type">
                          <span>Gráfico</span>
                          <span className="ff-market-field"><i className="fas fa-chart-pie" aria-hidden="true"></i>
                          <select id="vn-chart-type" aria-label="Seleccionar tipo de gráfico" onChange={(e) => { if(window.setFinChartType) window.setFinChartType(e.currentTarget.value); }}>
                              <option value="candles">Velas</option>
                              <option value="line">Línea</option>
                              <option value="area">Área</option>
                              <option value="ohlc">Barras</option>
                          </select></span>
                      </label>
                      <label className="ff-market-control ff-market-control-asset">
                          <span>Instrumento</span>
                          <span className="ff-market-field"><i className="fas fa-magnifying-glass-chart" aria-hidden="true"></i>
                      <select id="bmv-symbol" aria-label="Seleccionar instrumento financiero" defaultValue="AAPL">
                          <optgroup label="🇺🇸 Estados Unidos (NYSE / NASDAQ)">
                              <option value="AAPL">Apple</option>
                              <option value="MSFT">Microsoft</option>
                              <option value="NVDA">NVIDIA</option>
                              <option value="AMZN">Amazon</option>
                              <option value="GOOGL">Alphabet (Google)</option>
                              <option value="META">Meta</option>
                              <option value="TSLA">Tesla</option>
                              <option value="BRK-B">Berkshire Hathaway</option>
                              <option value="JPM">JPMorgan Chase</option>
                              <option value="V">Visa</option>
                              <option value="UNH">UnitedHealth</option>
                              <option value="JNJ">Johnson &amp; Johnson</option>
                              <option value="XOM">ExxonMobil</option>
                              <option value="WMT">Walmart</option>
                              <option value="BAC">Bank of America</option>
                              <option value="PG">Procter &amp; Gamble</option>
                              <option value="KO">Coca-Cola</option>
                              <option value="DIS">Disney</option>
                          </optgroup>
                          <optgroup label="🇬🇧 Reino Unido (LSE)">
                              <option value="SHEL.L">Shell</option>
                              <option value="AZN.L">AstraZeneca</option>
                              <option value="HSBA.L">HSBC</option>
                              <option value="ULVR.L">Unilever</option>
                              <option value="BP.L">BP</option>
                              <option value="GSK.L">GSK</option>
                              <option value="RIO.L">Rio Tinto</option>
                          </optgroup>
                          <optgroup label="🇩🇪 Alemania (XETRA)">
                              <option value="SAP.DE">SAP</option>
                              <option value="SIE.DE">Siemens</option>
                              <option value="BMW.DE">BMW</option>
                              <option value="VOW3.DE">Volkswagen</option>
                              <option value="BAYN.DE">Bayer</option>
                              <option value="ADS.DE">Adidas</option>
                              <option value="DHER.DE">Delivery Hero</option>
                          </optgroup>
                          <optgroup label="🇫🇷 Francia (Euronext)">
                              <option value="MC.PA">LVMH</option>
                              <option value="OR.PA">L'Oréal</option>
                              <option value="TTE.PA">TotalEnergies</option>
                              <option value="AIR.PA">Airbus</option>
                              <option value="BNP.PA">BNP Paribas</option>
                              <option value="SAN.PA">Sanofi</option>
                          </optgroup>
                          <optgroup label="🇨🇭 Suiza (SIX)">
                              <option value="NESN.SW">Nestlé</option>
                              <option value="NOVN.SW">Novartis</option>
                              <option value="ROG.SW">Roche</option>
                              <option value="UHR.SW">Swatch Group</option>
                          </optgroup>
                          <optgroup label="🇯🇵 Japón (TSE)">
                              <option value="7203.T">Toyota</option>
                              <option value="6758.T">Sony</option>
                              <option value="9984.T">SoftBank</option>
                              <option value="6501.T">Hitachi</option>
                              <option value="7974.T">Nintendo</option>
                              <option value="9432.T">NTT</option>
                          </optgroup>
                          <optgroup label="🇰🇷 Corea del Sur (KRX)">
                              <option value="005930.KS">Samsung Electronics</option>
                              <option value="000660.KS">SK Hynix</option>
                              <option value="035420.KS">NAVER</option>
                              <option value="005380.KS">Hyundai Motor</option>
                          </optgroup>
                          <optgroup label="🇨🇳 China / Hong Kong (HKEX)">
                              <option value="0700.HK">Tencent</option>
                              <option value="9988.HK">Alibaba</option>
                              <option value="3690.HK">Meituan</option>
                              <option value="9618.HK">JD.com</option>
                              <option value="2318.HK">Ping An</option>
                          </optgroup>
                          <optgroup label="🇮🇳 India (NSE / BSE)">
                              <option value="RELIANCE.NS">Reliance Industries</option>
                              <option value="TCS.NS">Tata Consultancy</option>
                              <option value="INFY.NS">Infosys</option>
                              <option value="HDFCBANK.NS">HDFC Bank</option>
                              <option value="WIPRO.NS">Wipro</option>
                          </optgroup>
                          <optgroup label="🇧🇷 Brasil (B3)">
                              <option value="PETR4.SA">Petrobras</option>
                              <option value="VALE3.SA">Vale</option>
                              <option value="ITUB4.SA">Itaú Unibanco</option>
                              <option value="BBDC4.SA">Bradesco</option>
                              <option value="ABEV3.SA">Ambev</option>
                          </optgroup>
                          <optgroup label="📊 Índices Globales">
                              <option value="^GSPC">S&amp;P 500 (EE.UU.)</option>
                              <option value="^NDX">NASDAQ 100 (EE.UU.)</option>
                              <option value="^DJI">Dow Jones (EE.UU.)</option>
                              <option value="^FTSE">FTSE 100 (UK)</option>
                              <option value="^GDAXI">DAX 40 (Alemania)</option>
                              <option value="^FCHI">CAC 40 (Francia)</option>
                              <option value="^N225">Nikkei 225 (Japón)</option>
                              <option value="^HSI">Hang Seng (HK)</option>
                              <option value="^BSESN">SENSEX (India)</option>
                              <option value="^BVSP">Bovespa (Brasil)</option>
                          </optgroup>
                          <optgroup label="🥇 Materias Primas">
                              <option value="GC=F">Oro</option>
                              <option value="SI=F">Plata</option>
                              <option value="CL=F">Petróleo WTI</option>
                              <option value="BZ=F">Petróleo Brent</option>
                              <option value="NG=F">Gas Natural</option>
                              <option value="ZC=F">Maíz</option>
                              <option value="ZW=F">Trigo</option>
                              <option value="ZS=F">Soya</option>
                              <option value="HG=F">Cobre</option>
                          </optgroup>
                          <optgroup label="₿ Criptomonedas">
                              <option value="BTC-USD">Bitcoin (BTC)</option>
                              <option value="ETH-USD">Ethereum (ETH)</option>
                              <option value="BNB-USD">BNB</option>
                              <option value="SOL-USD">Solana (SOL)</option>
                              <option value="XRP-USD">XRP</option>
                          </optgroup>
                          <optgroup label="💱 Divisas (Forex)">
                              <option value="EURUSD=X">EUR / USD</option>
                              <option value="GBPUSD=X">GBP / USD</option>
                              <option value="USDJPY=X">USD / JPY</option>
                              <option value="USDCNY=X">USD / CNY</option>
                              <option value="USDBRL=X">USD / BRL</option>
                              <option value="EURGBP=X">EUR / GBP</option>
                          </optgroup>
                      </select>
                          </span>
                      </label>
                      <fieldset className="ff-market-control ff-market-control-period">
                          <legend>Periodo</legend>
                          <div className="chart-intervals" id="bmv-intervals">
                              <button type="button" className="chart-int-btn" onClick={(e) => { window.setFinInt('15m', e.currentTarget); }} aria-pressed="false">15 min</button>
                              <button type="button" className="chart-int-btn" onClick={(e) => { window.setFinInt('1h', e.currentTarget); }} aria-pressed="false">1 hora</button>
                              <button type="button" className="chart-int-btn" onClick={(e) => { window.setFinInt('1mo', e.currentTarget); }} aria-pressed="false">1 mes</button>
                              <button type="button" className="chart-int-btn active" onClick={(e) => { window.setFinInt('1y', e.currentTarget); }} aria-pressed="true">1 a&ntilde;o</button>
                              <button type="button" className="chart-int-btn" onClick={(e) => { window.setFinInt('3y', e.currentTarget); }} aria-pressed="false">3 a&ntilde;os</button>
                              <button type="button" className="chart-int-btn" onClick={(e) => { window.setFinInt('5y', e.currentTarget); }} aria-pressed="false">5 a&ntilde;os</button>
                              <button type="button" className="chart-int-btn" onClick={(e) => { window.setFinInt('10y', e.currentTarget); }} aria-pressed="false">10 a&ntilde;os</button>
                              <button type="button" className="chart-int-btn" onClick={(e) => { window.setFinInt('20y', e.currentTarget); }} aria-pressed="false">20 a&ntilde;os</button>
                          </div>
                      </fieldset>
                      <label className="ff-market-control ff-market-control-search">
                          <span>Buscar ticker</span>
                          <span className="ff-market-search-field">
                              <input id="bmv-custom" type="text" placeholder="Ej. AMZN o BTC-USD" maxLength="20" autoComplete="off" />
                              <button id="bmv-custom-btn" type="button"><i className="fas fa-arrow-right" aria-hidden="true"></i><span>Analizar</span></button>
                          </span>
                      </label>
                      {/* El tipo de gráfica vive aquí, junto al resto de controles. Antes
                           ocupaba una fila propia de 1394px para 539px de contenido.
                           #chart-type-title y #chart-type-note se conservan ocultos a la vista
                           (no a lectores de pantalla) porque syncChartTypeUI() escribe en ellos
                           sin comprobar que existan, y alimentan el aria-label de la gráfica ademas de agrtegan paramtrso para futura conexion a la api de gemini
                           se tiene que contabilizar essos datos estadisticos para . */}
                      <fieldset className="ff-market-control ff-market-control-chart">
                          <legend>Gr&aacute;fico</legend>
                          <div className="chart-type-switch" id="chart-type-switch" role="group" aria-label="Tipo de gráfica">
                              <button type="button" className="chart-type-btn active" data-chart-type="candles" onClick={(e) => { window.setFinChartType('candles',e.currentTarget); }} aria-pressed="true" title="Velas japonesas · apertura, máximo, mínimo y cierre"><i className="fas fa-chart-column"></i><strong>Velas</strong></button>
                              <button type="button" className="chart-type-btn" data-chart-type="line" onClick={(e) => { window.setFinChartType('line',e.currentTarget); }} aria-pressed="false" title="Línea · dirección del precio de cierre"><i className="fas fa-chart-line"></i><strong>L&iacute;nea</strong></button>
                              <button type="button" className="chart-type-btn" data-chart-type="area" onClick={(e) => { window.setFinChartType('area',e.currentTarget); }} aria-pressed="false" title="Área · magnitud y evolución"><i className="fas fa-chart-area"></i><strong>&Aacute;rea</strong></button>
                              <button type="button" className="chart-type-btn" data-chart-type="ohlc" onClick={(e) => { window.setFinChartType('ohlc',e.currentTarget); }} aria-pressed="false" title="OHLC · barras profesionales de precio"><i className="fas fa-chart-bar"></i><strong>OHLC</strong></button>
                          </div>
                          <strong id="chart-type-title" className="sr-only">Velas japonesas</strong>
                          <span id="chart-type-note" className="sr-only">Apertura, m&aacute;ximo, m&iacute;nimo y cierre de cada periodo.</span>
                      </fieldset>
                  </div>
              </div>

              <section className="market-chart-quote" aria-label="Resumen del instrumento seleccionado" aria-live="polite">
                  <div className="ff-quote-identity">
                      <span>Instrumento seleccionado</span>
                      <strong id="ch-name">—</strong>
                      <small><span id="ch-cur">—</span> · Cotizaci&oacute;n disponible</small>
                  </div>
                  <div className="ff-quote-price">
                      <span>Precio actual</span>
                      <strong id="ch-price">—</strong>
                      <em id="ch-pct">—</em>
                  </div>
                  <div className="ff-quote-stat"><span>M&aacute;ximo de sesi&oacute;n</span><strong id="ch-high">—</strong></div>
                  <div className="ff-quote-stat"><span>M&iacute;nimo de sesi&oacute;n</span><strong id="ch-low">—</strong></div>
              </section>

              <div className="ff-chart-stage-layout">
                  <div id="ch-wrapper" className="market-chart-canvas" role="region" aria-label="Gráfica interactiva del instrumento seleccionado" aria-busy="true">
                      <div id="ch-loading" className="ff-chart-loading" role="status">
                          <i id="ch-loading-icon" className="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
                          <span id="ch-loading-text">Cargando datos del mercado&hellip;</span>
                          <button id="ch-retry" type="button" hidden><i className="fas fa-rotate-right" aria-hidden="true"></i> Reintentar</button>
                      </div>
                  </div>
                  <aside className="ff-chart-reading" aria-label="Lectura automática del periodo visible">
                      <header><span>Lectura del periodo</span><strong>Contexto autom&aacute;tico</strong><small>Calculado con los datos visibles en la gr&aacute;fica.</small></header>
                      <article><span>Variaci&oacute;n del periodo</span><strong id="ch-period-change">—</strong><small>Primer cierre frente al &uacute;ltimo</small></article>
                      <article><span>Amplitud del rango</span><strong id="ch-period-range">—</strong><small>Distancia entre m&aacute;ximo y m&iacute;nimo</small></article>
                      <article><span>Datos mostrados</span><strong id="ch-observations">—</strong><small>Velas o puntos disponibles</small></article>
                      <article><span>Lectura de tendencia</span><strong id="ch-trend">—</strong><small id="ch-trend-note">Esperando informaci&oacute;n</small></article>
                  </aside>
              </div>
              <footer className="ff-chart-source"><span><i className="fas fa-shield-halved" aria-hidden="true"></i> Datos del proveedor financiero conectado</span><span>La visualizaci&oacute;n no constituye una recomendaci&oacute;n de inversi&oacute;n.</span></footer>
          </div>

          {/* La lógica de esta página vive en assets/js/finanzas-page.js, que se
               carga más abajo, tras el marcado del que depende. */}
              </div>

          </div>
          <section className="fx-pro" id="fx-pro-panel" style={{ marginBottom: '.7rem', display: 'none' }}>
              <section className="fcm-shell ff-world-map" id="currency-world-map" aria-labelledby="fcm-title">
                  <header className="fcm-header ffwm-head">
                      <div className="fcm-heading fbm-heading">
                          <span className="fcm-kicker ff-kicker"><i className="fas fa-earth-americas" aria-hidden="true"></i> Conversor global</span>
                          <h2 id="fcm-title">Mapa mundial de divisas</h2>
                          <p>Elige una moneda base y señala un país para conocer la equivalencia con su moneda oficial. Invierte el cruce cuando quieras comparar en sentido contrario.</p>
                      </div>
                      <div className="fcm-header-meta fbm-header-meta">
                          <span className="fcm-status fbm-status is-loading" id="fcm-status" role="status" aria-live="polite"><i className="fas fa-circle-notch fa-spin" aria-hidden="true"></i> Conectando divisas</span>
                          <label className="fcm-country-picker fbm-country-picker">
                              <span>Ir a un país</span>
                              <select id="fcm-country" aria-label="Seleccionar país en el mapa de divisas"><option value="">Elegir país&hellip;</option></select>
                          </label>
                      </div>
                  </header>

                  <div className="fcm-toolbar fbm-toolbar">
                      <label className="fcm-base-control">
                          <span>Moneda base</span>
                          <select id="fcm-base" aria-label="Seleccionar moneda base"><option value="USD">USD · Dólar estadounidense</option></select>
                      </label>
                      <div className="fcm-converter" aria-label="Conversión seleccionada">
                          <div><small id="fcm-from-code">USD</small><strong id="fcm-from-value">1</strong></div>
                          <button type="button" id="fcm-invert" aria-label="Invertir conversión"><i className="fas fa-right-left" aria-hidden="true"></i></button>
                          <div><small id="fcm-to-code">Selecciona un país</small><strong id="fcm-to-value">—</strong></div>
                      </div>
                  </div>

                  <div className="fcm-color-key" aria-label="Leyenda de variación diaria">
                      <span className="is-up"><i className="fas fa-arrow-trend-up" aria-hidden="true"></i><strong>Verde</strong> se fortalece</span>
                      <span className="is-down"><i className="fas fa-arrow-trend-down" aria-hidden="true"></i><strong>Rojo</strong> se debilita</span>
                      <span className="is-flat"><i className="fas fa-minus" aria-hidden="true"></i><strong>Gris</strong> sin comparación</span>
                      <small id="fcm-color-base">Cambio diario frente a USD</small>
                  </div>

                  <div className="fcm-command ffwm-command">
                      <div className="fcm-filters fbm-filters" role="group" aria-label="Filtrar países por región">
                          <button type="button" className="is-active" data-fcm-filter="all" aria-pressed="true"><i className="fas fa-layer-group" aria-hidden="true"></i> Todos</button>
                          <button type="button" data-fcm-filter="americas" aria-pressed="false"><i className="fas fa-earth-americas" aria-hidden="true"></i> Américas</button>
                          <button type="button" data-fcm-filter="europe" aria-pressed="false"><i className="fas fa-earth-europe" aria-hidden="true"></i> Europa</button>
                          <button type="button" data-fcm-filter="asia" aria-pressed="false"><i className="fas fa-earth-asia" aria-hidden="true"></i> Asia–Pacífico</button>
                          <button type="button" data-fcm-filter="africa" aria-pressed="false"><i className="fas fa-earth-africa" aria-hidden="true"></i> África</button>
                      </div>
                      <span className="fcm-filter-status fbm-filter-status" id="fcm-filter-status" aria-live="polite">Vista global</span>
                  </div>

                  <div className="fcm-workspace fbm-workspace">
                      <div className="fcm-map-wrap fbm-map-wrap" id="fcm-map-wrap">
                          <div className="fcm-map-tools fbm-map-tools" role="group" aria-label="Controles de acercamiento del mapa de divisas">
                              <button type="button" data-fcm-zoom="in" aria-label="Acercar mapa"><span>Acercar</span><i className="fas fa-plus" aria-hidden="true"></i></button>
                              <button type="button" data-fcm-zoom="out" aria-label="Alejar mapa" disabled><span>Alejar</span><i className="fas fa-minus" aria-hidden="true"></i></button>
                              <button type="button" data-fcm-zoom="reset" aria-label="Restablecer mapa"><span>Centrar</span><i className="fas fa-expand" aria-hidden="true"></i></button>
                              <output id="fcm-zoom-value" aria-live="polite">100%</output>
                          </div>
                          <div className="fcm-map-stage fbm-map-stage" id="fcm-map-stage" tabIndex="0" aria-label="Mapa interactivo de equivalencias monetarias">
                              <div className="fcm-map-canvas fbm-map-canvas" id="fcm-map-canvas"></div>
                          </div>
                          <div className="fcm-pan-hint fbm-pan-hint" aria-hidden="true"><i className="fas fa-hand" aria-hidden="true"></i><span>Arrastra para explorar</span></div>
                          <div className="fcm-hover-tip fbm-hover-tip" id="fcm-hover-tip" role="tooltip" hidden></div>
                          <div className="fcm-map-empty fbm-map-empty" id="fcm-map-empty" hidden><i className="fas fa-coins" aria-hidden="true"></i><strong>Sin equivalencia disponible</strong><span>Selecciona otra moneda base.</span></div>
                      </div>
                  </div>

                  <footer className="fcm-footer fbm-footer">
                      <div><span className="fbm-dot is-live"></span><strong>Verde: moneda sube</strong><small>Se fortalece frente a la base seleccionada</small></div>
                      <div><span className="fbm-dot is-ref"></span><strong>Rojo: moneda baja</strong><small>Se debilita frente a la base seleccionada</small></div>
                      <p><i className="fas fa-circle-info" aria-hidden="true"></i> Referencia informativa; puede diferir del precio bancario, efectivo o comisiones.</p>
                  </footer>
              </section>


              <section className="fx-history-lab" id="fx-history-lab" aria-labelledby="fx-history-title">
                  <header className="fx-history-head">
                      <div className="fx-history-head-copy">
                          <span className="fx-history-eyebrow"><i className="fas fa-chart-line" aria-hidden="true"></i> Mercado global</span>
                          <h3 id="fx-history-title">Evoluci&oacute;n de monedas internacionales</h3>
                          <p>Selecciona un cruce, cambia el horizonte y comp&aacute;ralo contra otras monedas sobre una base com&uacute;n.</p>
                      </div>
                      <div className="fx-history-head-side">
                          <span className="fx-history-live" id="fx-history-updated"><i></i> Consultando mercado</span>
                          <div className="fx-history-view-state" aria-live="polite">
                              <span><small>Vista actual</small><strong id="fx-history-view-label">EUR / USD &middot; 1 a&ntilde;o &middot; Base 100</strong></span>
                              <span><small>Series</small><strong id="fx-history-series-count">3</strong></span>
                          </div>
                      </div>
                  </header>

                  <div className="fx-history-control-deck">
                      <div className="fx-history-toolbar">
                          <label className="fx-history-field">
                              <span><b>1</b> Cruce principal</span>
                              <select id="fx-history-primary" aria-label="Elegir cruce principal">
                                  <option value="DX-Y.NYB">&Iacute;ndice DXY</option><option value="EURUSD=X">EUR / USD</option><option value="GBPUSD=X">GBP / USD</option><option value="USDJPY=X">USD / JPY</option><option value="USDCAD=X">USD / CAD</option><option value="USDBRL=X">USD / BRL</option><option value="USDCNY=X">USD / CNY</option><option value="USDCHF=X">USD / CHF</option><option value="AUDUSD=X">AUD / USD</option><option value="NZDUSD=X">NZD / USD</option><option value="USDINR=X">USD / INR</option>
                              </select>
                          </label>
                          <fieldset className="fx-history-periods" id="fx-history-periods">
                              <legend><b>2</b> Horizonte</legend>
                              <button type="button" data-fx-period="5d">5D</button><button type="button" data-fx-period="1mo">1M</button><button type="button" data-fx-period="3mo">3M</button><button type="button" className="is-active" data-fx-period="1y">1A</button><button type="button" data-fx-period="5y">5A</button>
                          </fieldset>
                          <fieldset className="fx-history-modes" id="fx-history-modes">
                              <legend><b>3</b> Lectura</legend>
                              <button type="button" data-fx-mode="quote">Cotizaci&oacute;n</button><button type="button" className="is-active" data-fx-mode="relative">Base 100</button>
                          </fieldset>
                      </div>
                      <div className="fx-history-compare">
                          <div><span><i className="fas fa-layer-group" aria-hidden="true"></i> Comparar con</span><small>Activa hasta tres cruces adicionales</small></div>
                          <div className="fx-history-chips" id="fx-history-chips" role="group" aria-label="Monedas para comparar">
                              <button type="button" className="is-active" data-fx-compare="GBPUSD=X" aria-pressed="true">GBP / USD</button><button type="button" className="is-active" data-fx-compare="USDJPY=X" aria-pressed="true">USD / JPY</button><button type="button" data-fx-compare="USDBRL=X" aria-pressed="false">USD / BRL</button><button type="button" data-fx-compare="USDCAD=X" aria-pressed="false">USD / CAD</button><button type="button" data-fx-compare="USDCNY=X" aria-pressed="false">USD / CNY</button>
                          </div>
                      </div>
                      <p className="fx-history-mode-note" id="fx-history-mode-note" role="status" aria-live="polite"><i className="fas fa-circle-info" aria-hidden="true"></i> Base 100 muestra el rendimiento relativo de todas las monedas desde un mismo punto de partida.</p>
                  </div>

                  <div className="fx-history-stats" aria-label="Resumen del cruce principal">
                      <div className="is-primary"><i className="fas fa-bullseye" aria-hidden="true"></i><span>&Uacute;ltimo</span><strong id="fx-history-last">&mdash;</strong><small id="fx-history-last-label">EUR / USD</small></div>
                      <div><i className="fas fa-arrow-trend-up" aria-hidden="true"></i><span>Variaci&oacute;n</span><strong id="fx-history-change">&mdash;</strong><small>Periodo seleccionado</small></div>
                      <div><i className="fas fa-angles-up" aria-hidden="true"></i><span>M&aacute;ximo</span><strong id="fx-history-high">&mdash;</strong><small>Mayor cierre</small></div>
                      <div><i className="fas fa-angles-down" aria-hidden="true"></i><span>M&iacute;nimo</span><strong id="fx-history-low">&mdash;</strong><small>Menor cierre</small></div>
                      <div><i className="fas fa-wave-square" aria-hidden="true"></i><span>Volatilidad</span><strong id="fx-history-vol">&mdash;</strong><small>Desviaci&oacute;n anualizada</small></div>
                  </div>

                  <section className="fx-history-visual" aria-labelledby="fx-history-visual-title">
                      <header><div><small>Trayectoria comparada</small><strong id="fx-history-visual-title">Rendimiento relativo</strong></div><div className="fx-history-legend" id="fx-history-legend" aria-label="Series mostradas"></div></header>
                      <div className="fx-history-chart-shell"><canvas id="fx-history-chart" role="img" aria-label="Gr&aacute;fica hist&oacute;rica comparativa de divisas"></canvas><div className="fx-history-state" id="fx-history-state" role="status"><i className="fas fa-circle-notch fa-spin" aria-hidden="true"></i><span>Cargando series cambiarias&hellip;</span></div></div>
                  </section>
                  <details className="fx-history-data">
                      <summary><span><i className="fas fa-table" aria-hidden="true"></i> Ver datos de la comparaci&oacute;n</span><small>Detalle num&eacute;rico</small><i className="fas fa-chevron-down" aria-hidden="true"></i></summary>
                      <div className="fx-history-table-wrap"><table><thead><tr><th>Moneda</th><th>&Uacute;ltimo</th><th>Periodo</th><th>M&aacute;ximo</th><th>M&iacute;nimo</th><th>Observaciones</th></tr></thead><tbody id="fx-history-table-body"><tr><td colSpan="6">Esperando informaci&oacute;n de mercado&hellip;</td></tr></tbody></table></div>
                  </details>
                  <footer><span><i className="fas fa-shield-halved" aria-hidden="true"></i> Series del proveedor financiero conectado</span><span>Base 100 compara rendimiento relativo; no iguala el nivel nominal de cada moneda.</span></footer>
              </section>

              <div className="fx-pro-main-grid">
                  <article className="fx-pro-block fx-pro-board-block">
                      <div className="fx-pro-block-head"><div><small>Mercado global</small><h3>Cotizaciones internacionales</h3><p>Matriz de equivalencias cruzadas: cada celda indica cuántas unidades de la moneda de la columna equivale una unidad de la moneda de la fila.</p></div><span id="fx-pro-board-status">10 cruces globales</span></div>
                      <div className="fx-market-search" role="search" aria-label="Buscar monedas y cruces relevantes">
                          <div className="fx-market-search-copy"><span><i className="fas fa-magnifying-glass" aria-hidden="true"></i></span><div><small>Explorador de monedas</small><strong>Busca por cruce, moneda o pa&iacute;s</strong><p>Universo curado de divisas l&iacute;quidas con equivalencias cruzadas calculadas desde sus cotizaciones frente al d&oacute;lar.</p></div></div>
                          <div className="fx-market-search-control"><i className="fas fa-magnifying-glass" aria-hidden="true"></i><input id="fx-market-search-input" type="search" autoComplete="off" placeholder="Ej. EUR/USD, Brasil, yen, franco&hellip;" aria-describedby="fx-market-search-status" /><button id="fx-market-search-clear" type="button" aria-label="Limpiar b&uacute;squeda" hidden><i className="fas fa-xmark" aria-hidden="true"></i></button><kbd>/</kbd></div>
                          <span className="fx-market-search-status" id="fx-market-search-status" aria-live="polite">Mostrando cruces prioritarios</span>
                      </div>
                      <div className="fx-market-filterbar" id="fx-market-filterbar">
                          <div><span>Explorar por segmento</span><small>Filtra la mesa sin perder el contexto del d&oacute;lar</small></div>
                          <div role="group" aria-label="Filtrar cotizaciones por segmento">
                              <button type="button" className="is-active" data-fx-segment="all" aria-pressed="true">Todos</button>
                              <button type="button" data-fx-segment="g10" aria-pressed="false">G10</button>
                              <button type="button" data-fx-segment="asia" aria-pressed="false">Asia</button>
                              <button type="button" data-fx-segment="emerging" aria-pressed="false">Emergentes</button>
                          </div>
                      </div>
                      <div className="fx-pro-summary">
                          <div><i className="fas fa-bolt" aria-hidden="true"></i><span>Mayor movimiento</span><strong id="fx-pro-largest">—</strong><small>Variación absoluta diaria</small></div>
                          <div><i className="fas fa-ranking-star" aria-hidden="true"></i><span>Liderazgo global</span><strong id="fx-pro-pressure">—</strong><small>Divisa base con mayor avance</small></div>
                          <div><i className="fas fa-arrows-left-right" aria-hidden="true"></i><span>Dispersión global</span><strong id="fx-pro-dispersion">—</strong><small>Rango entre cruces internacionales</small></div>
                      </div>
                      <div className="fx-matrix-legend" aria-label="Leyenda de la matriz cambiaria"><span><i className="is-up"></i> Moneda base gana</span><span><i className="is-down"></i> Moneda base cede</span><small>Señala una celda para consultar el cruce y su variación diaria.</small></div>
                      <div className="fx-pro-pair-grid fx-rate-matrix" id="fx-pro-pair-grid" aria-label="Matriz de cotizaciones internacionales">
                          <div className="sk-block" style={{ height: '126px' }}></div><div className="sk-block" style={{ height: '126px' }}></div><div className="sk-block" style={{ height: '126px' }}></div>
                      </div>
                      <p className="fx-market-search-empty" id="fx-market-search-empty" hidden><i className="fas fa-magnifying-glass" aria-hidden="true"></i><strong>No encontramos ese cruce.</strong><span>Prueba con una moneda, un pa&iacute;s o una clave como USD, EUR, GBP o JPY.</span></p>
                  </article>

              </div>

          </section>





              <section className="news-pro" id="news-pro-panel" style={{ display: 'none', paddingBottom: '3rem' }} aria-label="Dashboard de Mercados Globales">


              {/* FASE 1: TICKER TAPE */}
              <div className="gmd-ticker-wrap">
                  <div className="gmd-ticker" id="gmd-ticker-content">
                      <span style={{ color: '#94a3b8' }}><i className="fas fa-spinner fa-spin"></i> Cargando Ticker de Wall Street...</span>
                  </div>
              </div>

              {/* FASE 2: BENTO BOX ARCHITECTURE */}
              <div className="bento-grid">
                  {/* Gráfica Maestra */}
                  <div className="bento-master spotlight-card" style={{ background: '#fff', border: '1px solid rgba(0,33,58,0.05)', borderRadius: '24px', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                          <div>
                              <small style={{ fontSize: '.65rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '2px', color: '#64748b' }}>PANORAMA GENERAL</small>
                              <h3 style={{ margin: '.3rem 0 0', fontSize: '1.8rem', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.5px' }}>S&P 500</h3>
                          </div>
                          <div style={{ display: 'flex', gap: '.5rem' }} id="gmd-master-intervals">
                              <button className="gmd-ibtn active" onClick={(e) => { window.gmdMasterInterval('1d',e.currentTarget); }}>1D</button>
                              <button className="gmd-ibtn" onClick={(e) => { window.gmdMasterInterval('5d',e.currentTarget); }}>5D</button>
                              <button className="gmd-ibtn" onClick={(e) => { window.gmdMasterInterval('1mo',e.currentTarget); }}>1M</button>
                              <button className="gmd-ibtn" onClick={(e) => { window.gmdMasterInterval('3mo',e.currentTarget); }}>3M</button>
                          </div>
                      </div>
                      <div id="gmd-master-chart" style={{ width: '100%', flex: '1', minHeight: '380px' }}></div>
                  </div>

                  {/* Sub 1: Nasdaq */}
                  <div className="bento-sub bento-sub-1 spotlight-card" style={{ background: '#fff', border: '1px solid rgba(0,33,58,0.05)', borderRadius: '24px', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                          <div><small style={{ fontSize: '.6rem', fontWeight: '800', letterSpacing: '1.5px', color: '#2563eb' }}>TECNOLOGÍA</small><div style={{ fontWeight: '900', fontSize: '1.1rem', color: '#0f172a' }}>Nasdaq 100</div></div>
                          <span id="gmd-sub-nasdaq-val" style={{ fontFamily: '\'JetBrains Mono\',monospace', fontWeight: '800', fontSize: '1.1rem', color: '#0f172a' }}>—</span>
                      </div>
                      <div id="gmd-sub-nasdaq" style={{ width: '100%', height: '120px' }}></div>
                  </div>

                  {/* Sub 2: Dow */}
                  <div className="bento-sub bento-sub-2 spotlight-card" style={{ background: '#fff', border: '1px solid rgba(0,33,58,0.05)', borderRadius: '24px', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                          <div><small style={{ fontSize: '.6rem', fontWeight: '800', letterSpacing: '1.5px', color: '#059669' }}>INDUSTRIAL</small><div style={{ fontWeight: '900', fontSize: '1.1rem', color: '#0f172a' }}>Dow Jones</div></div>
                          <span id="gmd-sub-dow-val" style={{ fontFamily: '\'JetBrains Mono\',monospace', fontWeight: '800', fontSize: '1.1rem', color: '#0f172a' }}>—</span>
                      </div>
                      <div id="gmd-sub-dow" style={{ width: '100%', height: '120px' }}></div>
                  </div>

                  {/* Sub 3: IPC */}
                  <div className="bento-sub bento-sub-3 spotlight-card" style={{ background: '#fff', border: '1px solid rgba(0,33,58,0.05)', borderRadius: '24px', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                          <div><small style={{ fontSize: '.6rem', fontWeight: '800', letterSpacing: '1.5px', color: '#d97706' }}>MÉXICO</small><div style={{ fontWeight: '900', fontSize: '1.1rem', color: '#0f172a' }}>IPC BMV</div></div>
                          <span id="gmd-sub-ipc-val" style={{ fontFamily: '\'JetBrains Mono\',monospace', fontWeight: '800', fontSize: '1.1rem', color: '#0f172a' }}>—</span>
                      </div>
                      <div id="gmd-sub-ipc" style={{ width: '100%', height: '160px' }}></div>
                  </div>

                  {/* Sub 4: DAX */}
                  <div className="bento-sub bento-sub-4 spotlight-card" style={{ background: '#fff', border: '1px solid rgba(0,33,58,0.05)', borderRadius: '24px', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                          <div><small style={{ fontSize: '.6rem', fontWeight: '800', letterSpacing: '1.5px', color: '#dc2626' }}>EUROPA</small><div style={{ fontWeight: '900', fontSize: '1.1rem', color: '#0f172a' }}>DAX 40</div></div>
                          <span id="gmd-sub-dax-val" style={{ fontFamily: '\'JetBrains Mono\',monospace', fontWeight: '800', fontSize: '1.1rem', color: '#0f172a' }}>—</span>
                      </div>
                      <div id="gmd-sub-dax" style={{ width: '100%', height: '160px' }}></div>
                  </div>
              </div>

              {/* FASE 4: NOTICIAS */}
              <div className="gmd-news-wrap" style={{ background: 'transparent', border: 'none', padding: '0', boxShadow: 'none', display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ margin: '2rem 0 1.5rem', fontSize: '1.8rem', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.5px' }}>Inteligencia <span className="gradient-text">Global</span></h3>
                  <div id="news-full-viewport" className="nc-viewport" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}></div>
              </div>
              {/* FASE 3: TABLA DE BOLSAS CON SPARKLINES */}
              <div className="gmd-table-wrap spotlight-card" style={{ background: '#fff', border: '1px solid rgba(0,33,58,0.05)', borderRadius: '24px', padding: '2.5rem', display: 'flex', flexDirection: 'column', width: '100%', marginBottom: '4rem', marginTop: '3rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                      <div>
                          <small style={{ fontSize: '.65rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '2px', color: '#64748b' }}>RADAR GLOBAL AVANZADO</small>
                          <h3 style={{ margin: '.3rem 0 0', fontSize: '1.8rem', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.5px' }}>Todas las Bolsas del Mundo</h3>
                      </div>
                      <span style={{ fontSize: '.75rem', fontWeight: '800', background: '#f1f5f9', color: '#0ea5e9', padding: '0.5rem 1.2rem', borderRadius: '20px' }} id="gmd-table-status">Cargando inteligencia...</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                      <table id="gmd-global-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.95rem' }}>
                          <thead>
                              <tr style={{ borderBottom: '2px solid #cbd5e1', color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                  <th style={{ textAlign: 'left', padding: '1rem .8rem', fontWeight: '800' }}>Bolsa</th>
                                  <th style={{ textAlign: 'left', padding: '1rem .8rem', fontWeight: '800' }}>Región</th>
                                  <th style={{ textAlign: 'center', padding: '1rem .8rem', fontWeight: '800' }}>Tendencia 5D</th>
                                  <th style={{ textAlign: 'right', padding: '1rem .8rem', fontWeight: '800' }}>Último</th>
                                  <th style={{ textAlign: 'right', padding: '1rem .8rem', fontWeight: '800' }}>Cambio</th>
                                  <th style={{ textAlign: 'right', padding: '1rem .8rem', fontWeight: '800' }}>% Var</th>
                              </tr>
                          </thead>
                          <tbody id="gmd-table-body">
                              {/* JS generará las filas y sparklines */}
                          </tbody>
                      </table>
                  </div>
              </div>

              </section>


                  <section className="energy-scenario-lab" aria-labelledby="energy-lab-title">
                      <div className="energy-module-head"><div><small>LABORATORIO DE ESCENARIOS</small><h3 id="energy-lab-title">Choque en el precio del crudo</h3><p>Explora la posible transmisión hacia México.</p></div><span className="scenario-badge">No es pronóstico</span></div>
                      <div className="scenario-control">
                          <div className="scenario-control-top"><label htmlFor="energy-shock-range">Movimiento hipotético WTI</label><output id="energy-shock-output" htmlFor="energy-shock-range">0%</output></div>
                          <input id="energy-shock-range" type="range" min="-25" max="25" defaultValue="0" step="1" onInput={(e) => { window.updateEnergyScenario(e.currentTarget.value); }} />
                          <div className="scenario-scale"><span>−25%</span><span>Escenario base</span><span>+25%</span></div>
                      </div>
                      <div className="scenario-results" aria-live="polite">
                          <div><span><i className="fas fa-temperature-three-quarters"></i> Inflación</span><strong id="energy-scenario-inflation">Sin presión adicional</strong><small id="energy-scenario-inflation-note">Impacto indicativo a 12 meses</small></div>
                          <div><span><i className="fas fa-truck-fast"></i> Costos logísticos</span><strong id="energy-scenario-logistics">Estables</strong><small id="energy-scenario-logistics-note">Combustibles y transporte</small></div>
                          <div><span><i className="fas fa-peso-sign"></i> Sesgo para MXN</span><strong id="energy-scenario-mxn">Neutral</strong><small id="energy-scenario-mxn-note">Canal petrolero y fiscal</small></div>
                      </div>
                      <p className="scenario-method"><i className="fas fa-flask"></i> Sensibilidades ilustrativas para comparar escenarios; no sustituyen un modelo econométrico ni asesoría financiera.</p>
                  </section>

                  <section className="energy-drivers" aria-labelledby="energy-drivers-title">
                      <div className="energy-drivers-nav">
                          <div><small>QUÉ MUEVE EL MERCADO</small><h3 id="energy-drivers-title">Panel de catalizadores</h3></div>
                          <div role="tablist" aria-label="Catalizadores de commodities">
                              <button type="button" role="tab" aria-selected="true" className="active" onClick={(e) => { window.setEnergyDriver('supply',e.currentTarget); }}><i className="fas fa-industry"></i><span>Oferta</span></button>
                              <button type="button" role="tab" aria-selected="false" onClick={(e) => { window.setEnergyDriver('inventory',e.currentTarget); }}><i className="fas fa-warehouse"></i><span>Inventarios</span></button>
                              <button type="button" role="tab" aria-selected="false" onClick={(e) => { window.setEnergyDriver('demand',e.currentTarget); }}><i className="fas fa-globe-asia"></i><span>Demanda</span></button>
                              <button type="button" role="tab" aria-selected="false" onClick={(e) => { window.setEnergyDriver('dollar',e.currentTarget); }}><i className="fas fa-dollar-sign"></i><span>Dólar</span></button>
                          </div>
                      </div>
                      <div className="energy-driver-detail" id="energy-driver-detail">
                          <span className="energy-driver-orb"><i id="energy-driver-icon" className="fas fa-industry"></i></span>
                          <div><small id="energy-driver-kicker">OFERTA GLOBAL</small><strong id="energy-driver-title">OPEP+, producción y riesgo geopolítico</strong><p id="energy-driver-copy">Los cambios en cuotas, interrupciones y capacidad ociosa alteran el balance físico y la prima de riesgo del crudo.</p></div>
                          <aside><small>Monitor clave</small><strong id="energy-driver-monitor">Cuotas OPEP+ · producción no OPEP</strong><span id="energy-driver-signal">Menor oferta → presión alcista</span></aside>
                      </div>
                  </section>



          <div className="bottom-grid" id="fin-bottom-grid" style={{ display: 'none' }}>
              <div className="left-col">

                  <div className="panel" id="petroleo-panel">
                      <div className="section-lbl">🛢 Petróleo · Correlación con el Peso</div>
                      <div id="petroleo-body">
                          <div className="petro-row" onClick={(e) => { window.openPetroDetail('wti'); }}>
                              <span className="petro-lbl">WTI Crudo <small style={{ color: '#94a3b8' }}>(CL=F)</small></span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}><span className="petro-val" id="p-wti">--</span><span className="petro-pct" id="p-wti-pct"></span><i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i></span>
                          </div>
                          <div className="petro-row" onClick={(e) => { window.openPetroDetail('brent'); }}>
                              <span className="petro-lbl">Brent Crudo <small style={{ color: '#94a3b8' }}>(BZ=F)</small></span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}><span className="petro-val" id="p-brent">--</span><span className="petro-pct" id="p-brent-pct"></span><i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i></span>
                          </div>
                          <div className="petro-row" onClick={(e) => { window.openPetroDetail('gas'); }}>
                              <span className="petro-lbl">Gas Natural <small style={{ color: '#94a3b8' }}>(NG=F)</small></span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}><span className="petro-val" id="p-gas">--</span><span className="petro-pct" id="p-gas-pct"></span><i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i></span>
                          </div>
                          <div className="petro-row" onClick={(e) => { window.openPetroDetail('mxn'); }}>
                              <span className="petro-lbl">USD/MXN</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}><span className="petro-val" id="p-mxn">--</span><span className="petro-pct" id="p-mxn-pct"></span><i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i></span>
                          </div>
                          <div className="petro-row" onClick={(e) => { window.openPetroDetail('spread'); }}>
                              <span className="petro-lbl">Spread WTI−Brent <small style={{ color: '#94a3b8' }}>(contango/backw.)</small></span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}><span className="petro-val" id="p-spread">--</span><span className="petro-pct" id="p-spread-note" style={{ fontSize: '.58rem', color: '#64748b', marginLeft: '.3rem' }}></span><i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i></span>
                          </div>

                      </div>
                      <div className="ia-insight" id="petro-note" style={{ marginTop: '.7rem', marginBottom: '0' }}>
                          <i className="fas fa-robot"></i> El peso mexicano tiene alta correlación con el petróleo por los ingresos de Pemex y el precio de exportación. Cuando el WTI sube, el peso tiende a fortalecerse.
                      </div>
                  </div>
                  <div className="panel" id="mkt-cap-panel">
                      <div className="capital-panel-head">
                          <div className="capital-panel-title">
                              <span className="capital-panel-icon"><i className="fas fa-chart-line"></i></span>
                              <div><small>Tablero multiactivo</small><h3>Mercados de capitales</h3><p>Selecciona un activo para consultar su reporte ejecutivo.</p></div>
                          </div>
                          <span className="capital-session-pill"><i className="fas fa-circle"></i> Sesión actual</span>
                      </div>
                      <div className="module-view-toolbar capital-view-toolbar">
                          <span><i className="fas fa-chart-simple"></i> Diseño de gráfica</span>
                          <div className="module-view-switch" role="group" aria-label="Diseño de Mercados de capitales">
                              <button type="button" className="active" data-capital-view="spark" onClick={(e) => { window.setCapitalView('spark',e.currentTarget); }}><i className="fas fa-chart-line"></i><span>Curvas</span></button>
                              <button type="button" data-capital-view="bars" onClick={(e) => { window.setCapitalView('bars',e.currentTarget); }}><i className="fas fa-chart-bar"></i><span>Barras</span></button>
                              <button type="button" data-capital-view="heat" onClick={(e) => { window.setCapitalView('heat',e.currentTarget); }}><i className="fas fa-table-cells-large"></i><span>Mapa</span></button>
                          </div>
                      </div>
                      <div id="mkt-cap-list" style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                          <div className="sk-block" style={{ height: '48px', margin: '.2rem 0' }}></div>
                          <div className="sk-block" style={{ height: '48px', margin: '.2rem 0' }}></div>
                          <div className="sk-block" style={{ height: '48px', margin: '.2rem 0' }}></div>
                          <div className="sk-block" style={{ height: '48px', margin: '.2rem 0' }}></div>
                          <div className="sk-block" style={{ height: '48px', margin: '.2rem 0' }}></div>
                          <div className="sk-block" style={{ height: '48px', margin: '.2rem 0' }}></div>
                      </div>
                      <div className="capital-crypto-block">
                          <div className="capital-crypto-head"><span><i className="fab fa-bitcoin"></i> Mercado cripto global</span><small>Contexto de liquidez</small></div>
                          <div className="capital-crypto-grid">
                              <div className="capital-crypto-card">
                                  <div className="capital-crypto-label">BTC Dominance</div>
                                  <div id="btc-dom" className="capital-crypto-value">--</div>
                                  <div id="btc-dom-note" className="capital-crypto-note">&gt;55% = mercado defensivo</div>
                              </div>
                              <div className="capital-crypto-card">
                                  <div className="capital-crypto-label">Capitalización total</div>
                                  <div id="crypto-cap" className="capital-crypto-value">--</div>
                                  <div id="crypto-cap-chg" className="capital-crypto-note">--</div>
                              </div>
                          </div>
                      </div>
                  </div>
                  <div className="panel" id="fx-emerging-panel">
                      <div className="section-lbl">Divisas Emergentes</div>
                      <div style={{ fontSize: '.66rem', color: '#94a3b8', marginBottom: '.6rem' }}>Variación diaria frente al USD &nbsp;·&nbsp; <span style={{ color: '#16a34a' }}>positivo</span> = se fortalece &nbsp;·&nbsp; <span style={{ color: '#dc2626' }}>negativo</span> = se debilita</div>
                      <div style={{ position: 'relative', height: '260px' }}>
                          <canvas id="fx-emerging-chart"></canvas>
                      </div>
                  </div>
              </div>
              <div className="right-col">
                  <div className="panel" id="reservas-panel">
                      <div className="section-lbl">🌐 Macro Internacional · Tasas &amp; Dólar</div>
                      {/* DXY */}
                      <div className="macro-row" onClick={(e) => { window.openMacroDetail('dxy'); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.45rem .3rem', borderBottom: '1px solid rgba(0,0,0,.06)' }}>
                          <div>
                              <div style={{ fontSize: '.78rem', fontWeight: '600', color: '#334155' }}>DXY · Índice del Dólar</div>
                              <div style={{ fontSize: '.58rem', color: '#94a3b8' }}>ICE · Cesta de 6 divisas vs USD</div>
                          </div>
                          <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                              <div><span id="res-val" style={{ fontFamily: '\'JetBrains Mono\',monospace', fontWeight: '800', fontSize: '1rem', color: '#00213a' }}>—</span><div id="res-chg" style={{ fontSize: '.62rem', fontWeight: '700' }}>—</div></div>
                              <i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i>
                          </div>
                      </div>
                      {/* T-Bill 4W */}
                      <div className="macro-row" onClick={(e) => { window.openMacroDetail('tbill'); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.45rem .3rem', borderBottom: '1px solid rgba(0,0,0,.06)' }}>
                          <div>
                              <div style={{ fontSize: '.78rem', fontWeight: '600', color: '#334155' }}>T-Bill 4W · EE.UU.</div>
                              <div style={{ fontSize: '.58rem', color: '#94a3b8' }}>US Treasury · Tasa libre de riesgo</div>
                          </div>
                          <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                              <div><span id="flujos-val" style={{ fontFamily: '\'JetBrains Mono\',monospace', fontWeight: '800', fontSize: '.92rem', color: '#00213a' }}>—</span><div id="flujos-chg" style={{ fontSize: '.62rem', fontWeight: '700' }}>—</div></div>
                              <i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i>
                          </div>
                      </div>
                      <div style={{ marginTop: '.5rem' }}>
                          <div style={{ fontSize: '.58rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1.4px', color: '#64748b', marginBottom: '.35rem' }}>Comparativa · Bancos Centrales</div>
                          <div id="tbill-compare" style={{ display: 'flex', flexDirection: 'column', gap: '.22rem' }}>
                              <div className="sk-block" style={{ height: '32px' }}></div>
                              <div className="sk-block" style={{ height: '32px' }}></div>
                              <div className="sk-block" style={{ height: '32px' }}></div>
                              <div className="sk-block" style={{ height: '32px' }}></div>
                          </div>
                      </div>
                      <div className="energy-macro-signals" aria-label="Señales macro complementarias">
                          <div>
                              <span><i className="fas fa-scale-balanced"></i> Prima EE.UU.−Europa</span>
                              <strong id="energy-macro-spread">—</strong>
                              <small id="energy-macro-spread-note">Diferencial de tasas cortas</small>
                          </div>
                          <div>
                              <span><i className="fas fa-dollar-sign"></i> Régimen del dólar</span>
                              <strong id="energy-dollar-regime">—</strong>
                              <small id="energy-dollar-regime-note">Impacto sobre materias primas</small>
                          </div>
                      </div>
                      <div className="ia-insight" id="reservas-note" style={{ marginTop: '.6rem', marginBottom: '0' }}>
                          <i className="fas fa-robot"></i> Cargando datos macro…
                      </div>
                  </div>
                  <div className="panel" id="risk-panel">
                      <div className="section-lbl">Señales de Riesgo · Tasas &amp; Volatilidad</div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div className="risk-row" onClick={(e) => { window.openRiskDetail('carry'); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '.55rem .3rem', borderBottom: '1px solid rgba(0,0,0,.06)', gap: '.5rem' }}>
                              <div style={{ flex: '1', minWidth: '0' }}>
                                  <div style={{ fontSize: '.8rem', color: '#334155', fontWeight: '600' }}>Atractivo del Peso <small style={{ color: '#94a3b8', fontWeight: '400' }}>(TIIE − Fed)</small></div>
                                  <div style={{ fontSize: '.57rem', color: '#94a3b8', marginTop: '.1rem', lineHeight: '1.3' }}>Diferencial entre la tasa mexicana y la de EE.UU. · Más alto = mayor incentivo para invertir en MXN</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: '0', paddingTop: '.15rem' }}><span id="rp-spread" style={{ fontFamily: '\'JetBrains Mono\',monospace', fontWeight: '700', fontSize: '.9rem', color: '#0f172a' }}>--</span><i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i></div>
                          </div>
                          <div className="risk-row" onClick={(e) => { window.openRiskDetail('vix'); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '.55rem .3rem', borderBottom: '1px solid rgba(0,0,0,.06)', gap: '.5rem' }}>
                              <div style={{ flex: '1', minWidth: '0' }}>
                                  <div style={{ fontSize: '.8rem', color: '#334155', fontWeight: '600' }}>Miedo en Bolsa <small style={{ color: '#94a3b8', fontWeight: '400' }}>(VIX)</small></div>
                                  <div style={{ fontSize: '.57rem', color: '#94a3b8', marginTop: '.1rem', lineHeight: '1.3' }}>«Índice del miedo» del S&amp;P 500 · Por debajo de 15 = calma · Por encima de 25 = pánico</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: '0', paddingTop: '.15rem' }}><span id="rp-vix" style={{ fontFamily: '\'JetBrains Mono\',monospace', fontWeight: '700', fontSize: '.9rem', color: '#0f172a' }}>--</span><i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i></div>
                          </div>
                          <div className="risk-row" onClick={(e) => { window.openRiskDetail('real'); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '.55rem .3rem', borderBottom: '1px solid rgba(0,0,0,.06)', gap: '.5rem' }}>
                              <div style={{ flex: '1', minWidth: '0' }}>
                                  <div style={{ fontSize: '.8rem', color: '#334155', fontWeight: '600' }}>Ganancia Real del Peso <small style={{ color: '#94a3b8', fontWeight: '400' }}>(TIIE − Inflación)</small></div>
                                  <div style={{ fontSize: '.57rem', color: '#94a3b8', marginTop: '.1rem', lineHeight: '1.3' }}>Lo que realmente ganas después de descontar la inflación · Positivo = poder adquisitivo protegido</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: '0', paddingTop: '.15rem' }}><span id="rp-real" style={{ fontFamily: '\'JetBrains Mono\',monospace', fontWeight: '700', fontSize: '.9rem', color: '#0f172a' }}>--</span><i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i></div>
                          </div>
                          <div className="risk-row" onClick={(e) => { window.openRiskDetail('yc'); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '.55rem .3rem', borderBottom: '1px solid rgba(0,0,0,.06)', gap: '.5rem' }}>
                              <div style={{ flex: '1', minWidth: '0' }}>
                                  <div style={{ fontSize: '.8rem', color: '#334155', fontWeight: '600' }}>Señal de Recesión EE.UU. <small style={{ color: '#94a3b8', fontWeight: '400' }}>(Bono 10Y − 2Y)</small></div>
                                  <div style={{ fontSize: '.57rem', color: '#94a3b8', marginTop: '.1rem', lineHeight: '1.3' }}>Negativo = curva invertida, señal histórica de recesión · Positivo = economía sana</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: '0', paddingTop: '.15rem' }}><span id="rp-yc" style={{ fontFamily: '\'JetBrains Mono\',monospace', fontWeight: '700', fontSize: '.9rem', color: '#0f172a' }}>--</span><i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i></div>
                          </div>
                          <div className="risk-row" onClick={(e) => { window.openRiskDetail('move'); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '.55rem .3rem', borderBottom: '1px solid rgba(0,0,0,.06)', gap: '.5rem' }}>
                              <div style={{ flex: '1', minWidth: '0' }}>
                                  <div style={{ fontSize: '.8rem', color: '#334155', fontWeight: '600' }}>Tensión en Bonos EE.UU. <small style={{ color: '#94a3b8', fontWeight: '400' }}>(MOVE)</small></div>
                                  <div style={{ fontSize: '.57rem', color: '#94a3b8', marginTop: '.1rem', lineHeight: '1.3' }}>Equivalente del VIX pero para deuda del Tesoro · Sobre 120 = mercado de bonos bajo tensión</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: '0', paddingTop: '.15rem' }}><span id="rp-move" style={{ fontFamily: '\'JetBrains Mono\',monospace', fontWeight: '700', fontSize: '.9rem', color: '#0f172a' }}>--</span><i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i></div>
                          </div>
                          <div className="risk-row" onClick={(e) => { window.openRiskDetail('breakeven'); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '.55rem .3rem', borderBottom: '1px solid rgba(0,0,0,.06)', gap: '.5rem' }}>
                              <div style={{ flex: '1', minWidth: '0' }}>
                                  <div style={{ fontSize: '.8rem', color: '#334155', fontWeight: '600' }}>Inflación Esperada a 10 Años <small style={{ color: '#94a3b8', fontWeight: '400' }}>(Break-even)</small></div>
                                  <div style={{ fontSize: '.57rem', color: '#94a3b8', marginTop: '.1rem', lineHeight: '1.3' }}>Lo que el mercado anticipa como inflación promedio anual · Sobre 2.5% = expectativas desancladas</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: '0', paddingTop: '.15rem' }}><span id="rp-breakeven" style={{ fontFamily: '\'JetBrains Mono\',monospace', fontWeight: '700', fontSize: '.9rem', color: '#0f172a' }}>--</span><i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i></div>
                          </div>
                          <div className="risk-row" onClick={(e) => { window.openRiskDetail('ois'); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '.55rem .3rem', gap: '.5rem' }}>
                              <div style={{ flex: '1', minWidth: '0' }}>
                                  <div style={{ fontSize: '.8rem', color: '#334155', fontWeight: '600' }}>¿Recortará la Fed? <small style={{ color: '#94a3b8', fontWeight: '400' }}>(Prob. próx. reunión)</small></div>
                                  <div style={{ fontSize: '.57rem', color: '#94a3b8', marginTop: '.1rem', lineHeight: '1.3' }}>Probabilidad implícita de que la Fed baje tasas · Más alto = mercado espera dinero más barato</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: '0', paddingTop: '.15rem' }}><span id="rp-ois" style={{ fontFamily: '\'JetBrains Mono\',monospace', fontWeight: '700', fontSize: '.9rem', color: '#0f172a' }}>--</span><i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i></div>
                          </div>
                      </div>
                      <div className="ia-insight" id="rp-note" style={{ marginTop: '.6rem', marginBottom: '0' }}>
                          <i className="fas fa-robot"></i> Calculando diferencial de tasas…
                      </div>
                  </div>
                  <div className="panel" id="credit-panel">
                      <div className="section-lbl">Apetito de Riesgo · ¿Los Inversores Prefieren Arriesgar?</div>

                      {/* Veredicto visual prominente */}
                      <div id="credit-sentinel" style={{ display: 'flex', alignItems: 'center', gap: '.8rem', padding: '.7rem .9rem', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #e2e8f0', marginBottom: '.85rem' }}>
                          <div id="credit-sentinel-dot" style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#cbd5e1', flexShrink: '0', transition: 'background .4s', boxShadow: '0 0 0 4px rgba(203,213,225,.25)' }}></div>
                          <div style={{ flex: '1', minWidth: '0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem', flexWrap: 'wrap' }}>
                                  <span id="credit-verdict-lbl" style={{ fontSize: '.82rem', fontWeight: '800', color: '#0f172a', lineHeight: '1.2' }}>Analizando…</span>
                                  <span id="credit-verdict-chip" style={{ fontSize: '.52rem', fontWeight: '700', padding: '.15rem .55rem', borderRadius: '4px', background: '#f1f5f9', color: '#475569', letterSpacing: '.5px' }}></span>
                              </div>
                              <div id="credit-verdict-desc" style={{ fontSize: '.6rem', color: '#64748b', marginTop: '.2rem', lineHeight: '1.45' }}>Comparando flujos entre bonos de riesgo y bonos seguros</div>
                          </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {/* Fila 1: HYG */}
                          <div className="risk-row" onClick={(e) => { window.openCreditDetail('hyg'); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '.5rem .3rem', borderBottom: '1px solid rgba(0,0,0,.06)', gap: '.5rem' }}>
                              <div style={{ flex: '1', minWidth: '0' }}>
                                  <div style={{ fontSize: '.8rem', color: '#334155', fontWeight: '600' }}>Bonos de Alto Riesgo <small style={{ color: '#94a3b8', fontWeight: '400' }}>(HYG)</small></div>
                                  <div style={{ fontSize: '.57rem', color: '#94a3b8', marginTop: '.1rem', lineHeight: '1.3' }}>Deuda de empresas con calificación baja · Mayor retorno, mayor riesgo de impago</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: '0', paddingTop: '.1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.2rem' }}>
                                      <span id="credit-hyg" style={{ fontFamily: '\'JetBrains Mono\',monospace', fontWeight: '700', fontSize: '.9rem', color: '#0f172a' }}>--</span>
                                      <span id="credit-hyg-chip" style={{ fontSize: '.5rem', fontWeight: '700', padding: '.1rem .4rem', borderRadius: '3px', background: '#f1f5f9', color: '#64748b' }}></span>
                                  </div>
                                  <i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i>
                              </div>
                          </div>
                          {/* Fila 2: LQD */}
                          <div className="risk-row" onClick={(e) => { window.openCreditDetail('lqd'); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '.5rem .3rem', borderBottom: '1px solid rgba(0,0,0,.06)', gap: '.5rem' }}>
                              <div style={{ flex: '1', minWidth: '0' }}>
                                  <div style={{ fontSize: '.8rem', color: '#334155', fontWeight: '600' }}>Bonos Seguros <small style={{ color: '#94a3b8', fontWeight: '400' }}>(LQD)</small></div>
                                  <div style={{ fontSize: '.57rem', color: '#94a3b8', marginTop: '.1rem', lineHeight: '1.3' }}>Deuda corporativa AAA–BBB · Refugio de capital · Los inversores van aquí cuando temen</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: '0', paddingTop: '.1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.2rem' }}>
                                      <span id="credit-lqd" style={{ fontFamily: '\'JetBrains Mono\',monospace', fontWeight: '700', fontSize: '.9rem', color: '#0f172a' }}>--</span>
                                      <span id="credit-lqd-chip" style={{ fontSize: '.5rem', fontWeight: '700', padding: '.1rem .4rem', borderRadius: '3px', background: '#f1f5f9', color: '#64748b' }}></span>
                                  </div>
                                  <i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i>
                              </div>
                          </div>
                          {/* Fila 3: Diferencial (métrica clave) */}
                          <div className="risk-row" onClick={(e) => { window.openCreditDetail('spread'); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '.5rem .3rem', borderBottom: '1px solid rgba(0,0,0,.06)', gap: '.5rem' }}>
                              <div style={{ flex: '1', minWidth: '0' }}>
                                  <div style={{ fontSize: '.8rem', color: '#334155', fontWeight: '600' }}>Diferencial de Sentimiento <small style={{ color: '#94a3b8', fontWeight: '400' }}>(HYG − LQD)</small></div>
                                  <div style={{ fontSize: '.57rem', color: '#94a3b8', marginTop: '.1rem', lineHeight: '1.3' }}>Positivo → inversores prefieren arriesgar (Risk-On) · Negativo → buscan seguridad (Risk-Off)</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: '0', paddingTop: '.1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.2rem' }}>
                                      <span id="credit-spread-val" style={{ fontFamily: '\'JetBrains Mono\',monospace', fontWeight: '700', fontSize: '.9rem', color: '#0f172a' }}>--</span>
                                      <span id="credit-spread-chip" style={{ fontSize: '.5rem', fontWeight: '700', padding: '.1rem .4rem', borderRadius: '3px', background: '#f1f5f9', color: '#64748b' }}></span>
                                  </div>
                                  <i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i>
                              </div>
                          </div>
                          {/* Fila 4: CDS MX */}
                          <div className="risk-row" onClick={(e) => { window.openCreditDetail('cds'); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '.5rem .3rem', gap: '.5rem' }}>
                              <div style={{ flex: '1', minWidth: '0' }}>
                                  <div style={{ fontSize: '.8rem', color: '#334155', fontWeight: '600' }}>Riesgo País México <small style={{ color: '#94a3b8', fontWeight: '400' }}>(CDS 5Y)</small></div>
                                  <div style={{ fontSize: '.57rem', color: '#94a3b8', marginTop: '.1rem', lineHeight: '1.3' }}>Costo de asegurar deuda mexicana · Sube cuando hay tensión fiscal o política · 95 bps = moderado</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: '0', paddingTop: '.1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.2rem' }}>
                                      <span id="credit-cds" style={{ fontFamily: '\'JetBrains Mono\',monospace', fontWeight: '700', fontSize: '.9rem', color: '#d97706' }}>~95 bps</span>
                                      <span style={{ fontSize: '.5rem', fontWeight: '700', padding: '.1rem .4rem', borderRadius: '3px', background: 'rgba(245,158,11,.1)', color: '#d97706' }}>REFERENCIAL</span>
                                  </div>
                                  <i className="fas fa-chevron-right" style={{ fontSize: '.5rem', color: '#cbd5e1' }}></i>
                              </div>
                          </div>
                      </div>

                      <div className="ia-insight" id="credit-note" style={{ marginTop: '.6rem', marginBottom: '0' }}>
                          <i className="fas fa-robot"></i> Calculando apetito de riesgo crediticio global…
                      </div>
                  </div>
                  <div className="panel" id="movers-panel">
                      <div className="capital-panel-head movers-panel-head">
                          <div className="capital-panel-title">
                              <span className="capital-panel-icon movers-icon"><i className="fas fa-arrow-trend-up"></i></span>
                              <div><small>Momentum global</small><h3>Mayores alzas y bajas</h3><p>Selecciona una emisora para abrir su reporte de sesión.</p></div>
                          </div>
                          <span className="capital-session-pill"><i className="fas fa-circle"></i> En vivo</span>
                      </div>
                      <div className="movers-overview">
                          <div><small>Amplitud</small><strong id="movers-breadth">—</strong><span>emisoras en alza</span></div>
                          <div><small>Dispersión</small><strong id="movers-spread">—</strong><span>máximo vs mínimo</span></div>
                          <div><small>Universo</small><strong id="movers-universe">19</strong><span>emisoras analizadas</span></div>
                      </div>
                      <div className="movers-columns">
                          <section className="movers-side movers-gainers">
                              <header><span><i className="fas fa-arrow-up"></i> Ganadores</span><small>Top 4</small></header>
                              <div className="movers-ranking" id="movers-gainers-list">
                                  <div className="mover-skeleton"></div><div className="mover-skeleton"></div><div className="mover-skeleton"></div><div className="mover-skeleton"></div>
                              </div>
                          </section>
                          <section className="movers-side movers-losers">
                              <header><span><i className="fas fa-arrow-down"></i> Perdedores</span><small>Bottom 4</small></header>
                              <div className="movers-ranking" id="movers-losers-list">
                                  <div className="mover-skeleton"></div><div className="mover-skeleton"></div><div className="mover-skeleton"></div><div className="mover-skeleton"></div>
                              </div>
                          </section>
                      </div>
                      <div className="movers-session-reading">
                          <span className="movers-session-icon"><i className="fas fa-chart-line"></i></span>
                          <div>
                              <small>LECTURA DE LA SESIÓN</small>
                              <strong id="movers-session-title">Calculando amplitud global…</strong>
                              <p id="movers-session-copy">Se integrarán liderazgo, dispersión y balance comprador cuando termine la actualización.</p>
                          </div>
                          <em id="movers-session-chip">EN PROCESO</em>
                      </div>
                  </div>
              </div>
          </div>



      <Footer />
    </>
  );
}
