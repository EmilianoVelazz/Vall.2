import { useEffect, useMemo, useRef, useState } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import loadScripts, { globalLegado } from '../lib/loadScripts.js';
import './Mexico.css';

/*
 * Sección México en React idiomático (antes pages/mexico.html).
 *
 * La capa de datos sigue siendo window.VDS (assets/js/data-service.js): la
 * cascada de noticias Alpha Vantage → GDELT → Finnhub y su caché ya están
 * resueltas ahí, y reescribirlas no era parte de esta migración. Lo que cambia
 * es que el markup es JSX y los datos viven en estado, no en el DOM.
 *
 * Tres cosas que estaban mal en el original:
 *  - La gráfica de tasas leía los valores con getElementById al arrancar, y como
 *    los datos llegan por fetch después, casi siempre graficaba los valores
 *    por defecto del HTML (11.0 y 4.5) en vez de los reales. Aquí depende del
 *    estado, así que se redibuja cuando llegan los datos de verdad.
 *  - Los emojis estaban corrompidos ("?? ECONOMÍA", "???? Japón").
 *  - El pie enlazaba a logo2.png mientras la cabecera usaba logo1.png.
 */

const HOJAS = [
  '/assets/css/base.css',
  '/assets/css/header.css',
  '/assets/css/footer.css',
  '/assets/css/responsive.css',
];

const LIBS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js',
  '/assets/js/api-keys.js?v=5',
  '/assets/js/data-service.js?v=22',
];

const IMGS = ['/assets/img/finanzas.webp', '/assets/img/mercados.webp', '/assets/img/mercadoP.webp'];

const CATEGORIAS = [
  { id: 'all', texto: 'TODOS' },
  { id: 'economia', texto: '📈 ECONOMÍA' },
  { id: 'comercio', texto: '🚢 COMERCIO' },
  { id: 'infraestructura', texto: '🏗️ INFRAESTRUCTURA' },
];

// Datos estructurales de referencia: no vienen de ninguna API, son el contenido
// editorial de la sección. Estaban repetidos en el markup y en las gráficas.
const DEPENDENCIAS = [
  { nombre: '🌽 Maíz Amarillo', pct: 85, origen: 'Origen: USA', color: '#dc2626' },
  { nombre: '🫘 Soja', pct: 95, origen: 'Origen: USA / Brasil', color: '#dc2626' },
  { nombre: '🧪 Fertilizantes', pct: 70, origen: 'Origen: Rusia / Canadá', color: '#d97706' },
];

const EXPORTACIONES = [
  { pais: '🇯🇵 Japón', pct: 40 },
  { pais: '🇰🇷 Corea del Sur', pct: 25 },
  { pais: '🇨🇳 China', pct: 15, nota: '↑ en crecimiento' },
  { pais: '🇺🇸 Estados Unidos', pct: 10 },
];

const TASA_FED = 4.5;
const CLAVE_CACHE = 'mex_v8';

// Algunas llamadas de VDS se quedan pendientes para siempre cuando el proveedor
// externo no contesta: no rechazan, así que ningún .catch() las rescata y la
// página se quedaba en "Cargando…" indefinidamente (comprobado: 30 s sin
// resolver). Pasado este plazo se muestran los datos de referencia, y si la
// respuesta real llega después simplemente los sustituye.
const MS_ESPERA_MAXIMA = 8000;

const COLORES = { base: '#00213a', acento: '#1a4a7a', rojo: '#dc2626', ambar: '#d97706' };

export default function Mexico() {
  usePageStyles(HOJAS);

  const [datos, setDatos] = useState(null);
  const [filtro, setFiltro] = useState('all');
  const [listo, setListo] = useState(false);

  // ── Carga de datos ──────────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        await loadScripts(LIBS);
      } catch (e) {
        console.error('México: no se pudieron cargar las librerías', e);
      }
      if (!vivo) return;
      setListo(true);

      const ahora = new Date();
      const hora = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      const fechaFmt = ahora
        .toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
        .toUpperCase();

      // globalLegado, no window.VDS: ver la nota en lib/loadScripts.js.
      const VDS = globalLegado('VDS');
      if (!VDS) {
        console.error('México: data-service.js no expuso VDS.');
        setDatos((p) => p ?? respaldo(fechaFmt, hora));
        return;
      }

      // Caché en disco del propio VDS: pinta al instante y revalida si venció.
      const guardado = VDS.load(CLAVE_CACHE, true);
      if (guardado?.noticias) {
        setDatos(guardado);
        if (!VDS.isExpired(CLAVE_CACHE)) return;
        VDS.clear(CLAVE_CACHE);
      }

      // Red de seguridad: si los proveedores no contestan a tiempo, la página
      // deja de esperar y muestra las notas de referencia (etiquetadas como
      // tales) en vez de quedarse en blanco.
      const reloj = setTimeout(() => {
        if (vivo) setDatos((p) => p ?? respaldo(fechaFmt, hora));
      }, MS_ESPERA_MAXIMA);

      try {
        const [fxR, tiieR, inflR] = await Promise.allSettled([
          VDS.usdmxn(), VDS.banxico('SF61745'), VDS.banxico('SP74660'),
        ]);
        const valor = (r) => (r.status === 'fulfilled' && r.value != null ? r.value : null);
        const fxV = valor(fxR), tiieV = valor(tiieR), inflV = valor(inflR);

        const fx = fxV != null ? fxV.toFixed(2) : '17.20';
        const tiie = tiieV != null ? tiieV.toFixed(2) : '11.0';
        const infl = inflV != null ? inflV.toFixed(1) : '4.5';

        const noticias = await construirNoticias(VDS, { fx, tiie, infl, fxV, tiieV, fechaFmt, hora });
        if (!vivo) return;

        const fxN = parseFloat(fx), tiieN = parseFloat(tiie);
        const paquete = {
          usdmxn: fx,
          inflacion: infl,
          banxico: tiie,
          ai_nota: `TIIE ${tiie}% vs Fed ${TASA_FED}%: diferencial ${(tiieN - TASA_FED).toFixed(2)}pp protege al peso y atrae capitales, pero encarece crédito agropecuario.`,
          fx_analisis: `USD/MXN $${fx} ${fxV ? '(tiempo real)' : '(estimado)'}. ${
            fxN > 17.5
              ? 'Beneficia exportaciones de proteína, presiona costo de granos importados.'
              : 'Nivel moderado: equilibrio costo/competitividad exportadora.'
          }`,
          noticias,
          fechaFmt,
          hora,
        };

        clearTimeout(reloj);
        VDS.save(CLAVE_CACHE, paquete);
        setDatos(paquete);

        // La nota de Gemini llega después y solo sustituye a la de referencia.
        VDS.geminiChat(
          `Eres VALL-AI, analista económico de VALLNews especializado en México. Con estos datos actuales, redacta una nota breve (2 oraciones) sobre la política monetaria y su impacto en el sector agropecuario/empresarial mexicano:\n\nUSD/MXN: ${fx}\nTIIE (Banxico): ${tiie}%\nInflación: ${infl}%\n\nSé directo, sin frases de apertura genéricas.`,
          'Eres un analista económico institucional de VALL News especializado en México. Responde en español, de forma concisa y profesional. Máximo 90 palabras.'
        )
          .then((texto) => { if (vivo && texto) setDatos((p) => ({ ...p, ai_nota: texto })); })
          .catch(() => { /* se queda la nota de referencia */ });
      } catch (err) {
        clearTimeout(reloj);
        console.error('México load error:', err);
        if (vivo) setDatos((p) => p ?? respaldo(fechaFmt, hora));
      }
    })();

    return () => { vivo = false; };
  }, []);

  const noticiasVisibles = useMemo(
    () => (datos?.noticias || []).filter((n) => filtro === 'all' || n.dc === filtro),
    [datos, filtro]
  );

  return (
    <>
      <Header />
      <div className="hdr-divider" />

      <div className="mx-container">
        <div className="mx-page-title"><i className="fas fa-flag" /> México</div>

        <div className="mx-filter-bar">
          {CATEGORIAS.map(({ id, texto }) => (
            <button
              key={id}
              type="button"
              className={`mx-fpill${filtro === id ? ' active' : ''}`}
              onClick={() => setFiltro(id)}
            >
              {texto}
            </button>
          ))}
        </div>

        <div className="mx-news-grid">
          {noticiasVisibles.map((n, i) => (
            <article className="mx-news-card" key={`${n.titulo}-${i}`}>
              <img className="mx-nc-img" src={IMGS[i % 3]} alt={n.cat} />
              <div className="mx-nc-body">
                <span className="mx-nc-cat">{n.cat}</span>
                <h3 className="mx-nc-title">{n.titulo}</h3>
                <p className="mx-nc-desc">{n.desc}</p>
                <div className="mx-nc-foot">
                  <span className="mx-tag-src">{n.fuente}</span>
                  <EtiquetaImpacto imp={n.imp} />
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mx-panel" style={{ marginBottom: '1.2rem' }}>
          <div className="mx-section-lbl">Panorama Económico · Visualización de Datos</div>
          <Graficas listo={listo} tiie={datos?.banxico} inflacion={datos?.inflacion} />
        </div>

        <div className="mx-bottom-grid">
          <div className="mx-left-col">
            <div className="mx-panel">
              <div className="mx-section-lbl">Indicadores Económicos</div>
              <Indicador nombre="Inflación Anualizada" valor={`${datos?.inflacion ?? '4.5'}%`} tono="mx-down" />
              <Indicador nombre="Tasa Banxico (Referencia)" valor={`${datos?.banxico ?? '11.0'}%`} />
              <Indicador nombre="Remesas Acumuladas (Q1)" valor="$5.2B USD" tono="mx-up" />
              <Indicador nombre="Déficit Comercial" valor="-$2.1B USD" tono="mx-down" />
              <div className="mx-ia-note">
                <i className="fas fa-robot" style={{ color: '#00213a' }} />
                &nbsp;<b>VALL-AI:</b>{' '}
                {datos?.ai_nota ??
                  'El diferencial de tasas MX vs US protege al peso, pero encarece el crédito para expansión de planta en el Bajío.'}
              </div>
            </div>

            <div className="mx-panel">
              <div className="mx-section-lbl">Comercio Exterior · Cerdo</div>
              <div className="mx-trade-header">
                <div>
                  <div className="mx-trade-lbl">Volumen Trimestral</div>
                  <div className="mx-trade-val">
                    45,000 <small style={{ fontSize: '.9rem', color: '#888' }}>TON</small>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mx-trade-lbl">Valor Estimado</div>
                  <div className="mx-trade-val accent">
                    $180M <small style={{ fontSize: '.9rem' }}>USD</small>
                  </div>
                </div>
              </div>
              {EXPORTACIONES.map(({ pais, pct, nota }) => (
                <div className="mx-export-row" key={pais}>
                  <span>
                    {pais}
                    {nota && <small style={{ color: '#16a34a', fontWeight: 700 }}> {nota}</small>}
                  </span>
                  <span className="mx-export-pct">{pct}%</span>
                </div>
              ))}
              <div className="mx-ia-insight" style={{ marginTop: '1rem' }}>
                <b>OPORTUNIDAD:</b> China incrementa demanda por sanciones a UE. Posible alza de cuota en Q3 2026.
              </div>
            </div>
          </div>

          <div className="mx-right-col">
            <div className="mx-fx-card">
              <div className="mx-fx-lbl">USD / MXN Spot</div>
              <div className="mx-fx-val">{datos?.usdmxn ?? '17.20'}</div>
              <div className="mx-fx-chg">
                <i className={`fas ${datos ? 'fa-circle-info' : 'fa-caret-up'}`} />{' '}
                {datos ? 'Tipo de cambio actualizado' : 'Cargando…'}
              </div>
              <div className="mx-fx-body">
                {datos?.fx_analisis ?? 'Consultando el tipo de cambio en tiempo real…'}
              </div>
              <div className="mx-fx-meta">
                <div className="mx-fx-meta-item">Petróleo MX<b>$70 / bbl</b></div>
                <div className="mx-fx-meta-item">Riesgo País<b>Estable</b></div>
                <div className="mx-fx-meta-item">Tasa Fed<b>{TASA_FED}%</b></div>
                <div className="mx-fx-meta-item">Reservas MX<b>$215B USD</b></div>
              </div>
            </div>

            <div className="mx-panel">
              <div className="mx-section-lbl">Dependencia de Importaciones</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                {DEPENDENCIAS.map(({ nombre, pct, origen, color }) => (
                  <div key={nombre}>
                    <div className="mx-dep-row-head">
                      <span>{nombre}</span>
                      <span style={{ color }}>{pct}%</span>
                    </div>
                    <div className="mx-dep-bar">
                      <div className="mx-dep-fill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <div className="mx-dep-origin">{origen}</div>
                  </div>
                ))}
              </div>
              <div className="mx-risk-note">
                <i className="fas fa-triangle-exclamation" />
                <span>
                  La exposición al dólar en la compra de granos es el <b>principal factor de riesgo</b>{' '}
                  para el margen operativo del sector.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}

// ── Piezas ────────────────────────────────────────────────────────────────────

function Indicador({ nombre, valor, tono = '' }) {
  return (
    <div className="mx-indicator-row">
      <span className="mx-ind-name">{nombre}</span>
      <span className={`mx-ind-val ${tono}`}>{valor}</span>
    </div>
  );
}

function EtiquetaImpacto({ imp }) {
  if (imp === 'alto') return <span className="mx-tag-high">ALTO</span>;
  if (imp === 'medio') return <span className="mx-tag-med">MEDIA</span>;
  return <span className="mx-tag-low">BAJA</span>;
}

/**
 * Las tres gráficas de Chart.js. Se dibujan imperativamente sobre refs (es una
 * librería de canvas, no declarativa) pero dependen del estado: cuando llegan
 * las tasas reales se destruyen y se vuelven a crear.
 */
function Graficas({ listo, tiie, inflacion }) {
  const refImports = useRef(null);
  const refExports = useRef(null);
  const refRates = useRef(null);

  useEffect(() => {
    const Chart = window.Chart;
    if (!listo || !Chart) return undefined;

    const fuente = { family: "'Inter', sans-serif", size: 11 };
    Chart.defaults.font = fuente;
    const ejePct = {
      ticks: { callback: (v) => `${v}%`, font: fuente },
      grid: { color: 'rgba(0,0,0,0.05)' },
    };
    const comunes = {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.raw}%` } } },
    };

    const graficas = [
      new Chart(refImports.current, {
        type: 'bar',
        data: {
          labels: DEPENDENCIAS.map((d) => d.nombre.replace(/^\S+\s/, '')),
          datasets: [{
            label: 'Dependencia importada (%)',
            data: DEPENDENCIAS.map((d) => d.pct),
            backgroundColor: DEPENDENCIAS.map((d) => `${d.color}cc`),
            borderColor: DEPENDENCIAS.map((d) => d.color),
            borderWidth: 1.5,
            borderRadius: 5,
          }],
        },
        options: {
          ...comunes,
          indexAxis: 'y',
          scales: { x: { min: 0, max: 100, ...ejePct }, y: { ticks: { font: fuente }, grid: { display: false } } },
        },
      }),

      new Chart(refExports.current, {
        type: 'doughnut',
        data: {
          labels: [...EXPORTACIONES.map((e) => e.pais.replace(/^\S+\s/, '')), 'Otros'],
          datasets: [{
            data: [...EXPORTACIONES.map((e) => e.pct), 10],
            backgroundColor: [COLORES.base, COLORES.acento, '#2d6ca0', '#4d8fbd', '#a0c4dd'],
            hoverOffset: 10,
            borderWidth: 2,
            borderColor: '#fff',
          }],
        },
        options: {
          responsive: true,
          cutout: '60%',
          plugins: {
            legend: { position: 'bottom', labels: { font: { family: "'Inter', sans-serif", size: 10 }, padding: 8, boxWidth: 12 } },
            tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.raw}%` } },
          },
        },
      }),

      new Chart(refRates.current, {
        type: 'bar',
        data: {
          labels: ['TIIE Banxico', 'Fed EE.UU.', 'Inflación MX'],
          datasets: [{
            label: 'Tasa (%)',
            // Estos son los valores que el original casi nunca lograba usar.
            data: [parseFloat(tiie) || 11.0, TASA_FED, parseFloat(inflacion) || 4.5],
            backgroundColor: [`${COLORES.base}cc`, `${COLORES.acento}cc`, `${COLORES.rojo}bb`],
            borderColor: [COLORES.base, COLORES.acento, COLORES.rojo],
            borderWidth: 1.5,
            borderRadius: 5,
          }],
        },
        options: { ...comunes, scales: { y: { min: 0, ...ejePct }, x: { ticks: { font: fuente }, grid: { display: false } } } },
      }),
    ];

    return () => graficas.forEach((g) => g.destroy());
  }, [listo, tiie, inflacion]);

  return (
    <div className="mx-charts-grid">
      <div>
        <div className="mx-chart-title">Dependencia de Importaciones</div>
        <canvas ref={refImports} style={{ maxHeight: 190 }} />
      </div>
      <div>
        <div className="mx-chart-title">Exportaciones de Cerdo por Destino</div>
        <canvas ref={refExports} style={{ maxHeight: 190 }} />
      </div>
      <div>
        <div className="mx-chart-title">Tasas de Referencia (%)</div>
        <canvas ref={refRates} style={{ maxHeight: 190 }} />
      </div>
    </div>
  );
}

// ── Datos ─────────────────────────────────────────────────────────────────────

const CATS = ['Economía · Tipo de Cambio', 'Economía · Inflación', 'Infraestructura'];
const DCS = ['economia', 'economia', 'infraestructura'];
const IMPS = ['alto', 'medio', 'bajo'];

/** Cascada de proveedores: Alpha Vantage → GDELT → Finnhub → nota calculada. */
async function construirNoticias(VDS, ctx) {
  const { fechaFmt, hora } = ctx;
  const mapear = (arr, fuentePorDefecto, insight) =>
    arr.slice(0, 3).map((a, i) => ({
      cat: CATS[i], dc: DCS[i], fecha: `${fechaFmt} · ${hora}`,
      titulo: a.title || 'Noticia económica',
      desc: a.description || 'Información económica actualizada.',
      fuente: a.source || fuentePorDefecto,
      imp: IMPS[i],
      insight: typeof insight === 'function' ? insight(a) : insight,
    }));

  const av = await VDS.newsAlphaVantage('economy_macro', 5).catch(() => null);
  if (av?.length) {
    return traducir(VDS, mapear(av, 'Alpha Vantage', (a) =>
      a.sentiment ? `Sentimiento de mercado: ${a.sentiment}.` : 'Información actualizada en tiempo real.'));
  }

  const gdelt = await VDS
    .gdeltNews('Mexico OR "Mexican peso" OR Banxico OR nearshoring OR "Bank of Mexico"', 3)
    .catch(() => null);
  if (gdelt?.length) return traducir(VDS, mapear(gdelt, 'GDELT', 'Datos en tiempo real desde GDELT.'));

  const finnhub = await VDS.finnhubNews('general').catch(() => null);
  if (finnhub?.length) return traducir(VDS, mapear(finnhub, 'Finnhub', 'Datos de mercados actualizados.'));

  return traducir(VDS, calculadas(ctx));
}

const traducir = (VDS, noticias) => VDS.translateNews(noticias).catch(() => noticias);

/** Última red: notas derivadas de los indicadores que sí se pudieron leer. */
function calculadas({ fx, tiie, infl, fxV, tiieV, fechaFmt, hora }) {
  const fxN = parseFloat(fx), tiieN = parseFloat(tiie);
  const fecha = `${fechaFmt} · ${hora}`;
  return [
    {
      cat: CATS[0], dc: DCS[0], fecha, imp: 'alto',
      titulo: `USD/MXN: $${fx} ${fxV ? '· Tiempo real' : '· Estimado'} · ${fechaFmt}`,
      desc: `El peso mexicano cotiza a $${fx}/USD. ${
        fxN > 17.5
          ? 'Nivel beneficia exportaciones agropecuarias, aunque presiona costos de insumos importados.'
          : 'Nivel moderado: equilibrio exportaciones/importaciones.'
      }`,
      fuente: fxV ? 'open.er-api.com' : 'Referencia',
      insight: `USD/MXN $${fx}: cada $1,000 USD exportado genera $${(fxN * 1000).toFixed(0)} MXN.`,
    },
    {
      cat: CATS[1], dc: DCS[1], fecha, imp: 'medio',
      titulo: `TIIE: ${tiie}% · Inflación: ${infl}% ${tiieV ? '· Banxico SIE' : '· Estimado'}`,
      desc: `TIIE a 28 días: ${tiie}%. Inflación general: ${infl}%. Diferencial TIIE/Fed: ${(tiieN - TASA_FED).toFixed(2)}pp · ${
        tiieN - TASA_FED > 5 ? 'alto diferencial, soporte al peso.' : 'diferencial moderado.'
      }`,
      fuente: tiieV ? 'Banxico SIE' : 'Referencia',
      insight: `TIIE ${tiie}% vs Fed ${TASA_FED}%: diferencial ${(tiieN - TASA_FED).toFixed(2)}pp protege al peso pero encarece crédito agropecuario.`,
    },
    {
      cat: CATS[2], dc: DCS[2], fecha, imp: 'bajo',
      titulo: `Nearshoring México: inversión industrial en corredor norte · ${fechaFmt}`,
      desc: 'México consolida posición nearshoring. Manufactura, logística y agroindustria son los sectores con mayor atracción de inversión extranjera directa en el norte del país.',
      fuente: 'Análisis VALL',
      insight: 'Nearshoring impulsa demanda de proteínas y granos en corredores industriales.',
    },
  ];
}

function respaldo(fechaFmt, hora) {
  return {
    usdmxn: '17.20', inflacion: '4.5', banxico: '11.0',
    ai_nota: `Datos de referencia · ${fechaFmt} · ${hora}`,
    fx_analisis: 'Verificar conexión a internet para datos en tiempo real.',
    noticias: calculadas({ fx: '17.20', tiie: '11.0', infl: '4.5', fxV: null, tiieV: null, fechaFmt, hora }),
    fechaFmt, hora,
  };
}
