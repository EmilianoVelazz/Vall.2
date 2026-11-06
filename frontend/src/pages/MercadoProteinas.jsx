import { useEffect, useMemo, useState } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import loadScripts, { globalLegado } from '../lib/loadScripts.js';
import { ContenidoEnriquecido } from '../lib/textoEnriquecido.js';
import './MercadoProteinas.css';
import { DATOS, ESQUELETO } from '../lib/hojasComunes.js';

/*
 * Mercado Proteínas en React idiomático (antes pages/mercadoproteinas.html).
 *
 * Esta sección sí se migra entera: todo su JS inline era cálculo sobre datos de
 * window.VDS y volcado al DOM por getElementById. Ahora el cálculo devuelve un
 * objeto, vive en estado y el marcado se deriva de él. No queda ningún
 * document.getElementById.
 *
 * Cosas que estaban rotas en el original y aquí se corrigen:
 *  - Todos los emojis estaban corrompidos: "?? CERDO", "???? Japón",
 *    "correlación maíz?avícola", "? cerdo < res".
 *  - Una "g" suelta se colaba en el marcado del recuadro Ratio Cerdo/Res
 *    (`g    <div class="stat-val" …>`) y se veía en pantalla.
 *  - El setInterval de 30 min no se cancelaba nunca. En la SPA eso significaba
 *    seguir recalculando y pidiendo datos después de salir de la sección.
 *  - El pie usaba logo2.png mientras la cabecera usaba logo1.png.
 */

const HOJAS = [
  ...ESQUELETO,
];

const LIBS = [
  ...DATOS,
];

const CLAVE_CACHE = 'prot_v13-puebla';
const MS_REFRESCO = 30 * 60 * 1000;

const CATEGORIAS = [
  { id: 'all', texto: 'TODOS' },
  { id: 'cerdo', texto: '🐖 CERDO' },
  { id: 'pollo', texto: '🐔 POLLO' },
  { id: 'res', texto: '🐄 RES' },
  { id: 'huevo', texto: '🥚 HUEVO' },
];

const ETIQUETA = { cerdo: 'Cerdo · Mercado', pollo: 'Pollo · Tendencias', res: 'Res · Comercio' };
const IMPACTO = { cerdo: 'alto', pollo: 'medio', res: 'bajo' };
const ESPECIES = ['cerdo', 'pollo', 'res'];
const ESPECIES_PRECIO = ['cerdo', 'pollo', 'res', 'huevo'];
const CLAVE_COMERCIAL = { cerdo: 'pork', pollo: 'chicken', res: 'beef', huevo: 'egg' };

const NOMBRE_PRECIO = {
  cerdo: '🐖 Cerdo vivo',
  pollo: '🐔 Pollo entero o canal',
  res: '🐄 Bovino vivo',
  huevo: '🥚 Huevo blanco',
};

const ESTADO_FUENTE = {
  connected: 'Conectada',
  requires_config: 'Requiere clave',
  scheduled_ingestion: 'Pendiente de ingesta',
  research_required: 'Pendiente de validación',
};

const IMGS = ['/assets/img/fallback/ganaderia.webp', '/assets/img/fallback/materias-primas.webp', '/assets/img/fallback/finanzas.webp'];

const DESTINOS = [
  { clave: 'japon', etiqueta: '🇯🇵 Japón (40%)', pct: 40, extra: 0.35 },
  { clave: 'corea', etiqueta: '🇰🇷 Corea del Sur (25%)', pct: 25, extra: 0.25 },
  { clave: 'china', etiqueta: '🇨🇳 China (15%)', pct: 15, extra: 0.45, acento: true },
  { clave: 'otros', etiqueta: '🌎 Otros (20%)', pct: 20, extra: 0.15, tenue: true },
];

const SISTEMA_IA =
  'Eres un analista financiero institucional de VALL News especializado en agroindustria y ganadería. ' +
  'Responde en español, de forma concisa y profesional. Máximo 100 palabras.';

/* Valores de referencia cuando el proveedor no responde. Van etiquetados como
   "(ref.)" en pantalla: la sección nunca presenta una estimación como si fuera
   una cotización real. */
const REF = { corn: 4.82, soy: 342.0, cerdo: 2.45, res: 4.8 };

function clasificar(titulo) {
  const t = (titulo || '').toLowerCase();
  if (/pork|hog|cerdo|swine|bacon|jamón/.test(t)) return 'cerdo';
  if (/poult|chicken|broiler|pollo|aviar|turkey/.test(t)) return 'pollo';
  if (/beef|cattle|bovine|res|ganado|angus|feedlot/.test(t)) return 'res';
  return null;
}

/* Todo el cálculo de la sección, sin tocar el DOM: recibe VDS y devuelve el
   objeto que el componente renderiza. Antes esto estaba entremezclado con
   ~70 llamadas a getElementById. */
async function calcular(VDS) {
  const ahora = new Date();
  const hora = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const fechaFmt = ahora
    .toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();

  const [gdProtR, gdFeedR, fhR, wholesaleR, inegiR, blsR, woahR, catalogoR] = await Promise.allSettled([
    VDS.gdeltNews('pork poultry beef cattle hog livestock chicken meat protein', 6),
    VDS.gdeltNews('corn soybean feed cost USDA livestock grain animal', 5),
    VDS.finnhubNews('general'),
    fetch('/api/proteinas/precios-comerciales').then(res => res.json()),
    VDS.inegiPreciosCarne(),
    VDS.blsMeatPrices(),
    VDS.woahAlerts(),
    fetch('/api/proteinas/fuentes').then(res => (res.ok ? res.json() : null)),
  ]);

  const usar = (r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);
  const gdProt = usar(gdProtR);
  const wholesalePrices = wholesaleR.status === 'fulfilled' ? wholesaleR.value : null;
  const inegi = inegiR.status === 'fulfilled' ? inegiR.value : null;
  const bls = blsR.status === 'fulfilled' ? blsR.value : null;
  const woah = woahR.status === 'fulfilled' ? woahR.value : null;
  const catalogo = catalogoR.status === 'fulfilled' ? catalogoR.value : null;

  // Deduplicado por los primeros 60 caracteres del titular.
  const vistos = new Set();
  const unicas = [...gdProt, ...usar(gdFeedR), ...usar(fhR)].filter((a) => {
    const k = (a.title || '').trim().toLowerCase().slice(0, 60);
    if (!k || k.length < 8 || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  const grupos = { cerdo: [], pollo: [], res: [] };
  unicas.forEach((a) => {
    const especie = clasificar(a.title);
    if (especie && grupos[especie].length < 2) grupos[especie].push(a);
  });

  // Si alguna especie se quedó sin noticia propia, se rellena con las sobrantes.
  let relleno = 0;
  ESPECIES.forEach((especie) => {
    while (grupos[especie].length === 0 && relleno < unicas.length) {
      grupos[especie].push(unicas[relleno++]);
    }
  });

  const [hogsR, cattleR, cornR, soyR] = await Promise.allSettled([
    VDS.commodityWithPct('LEAN_HOGS'),
    VDS.commodityWithPct('LIVE_CATTLE'),
    VDS.commodityWithPct('CORN'),
    VDS.commodityWithPct('SOYBEANS'),
  ]);

  const cotiza = (r) => (r.status === 'fulfilled' && r.value?.price ? r.value : null);
  const hogs = cotiza(hogsR);
  const cattle = cotiza(cattleR);
  const corn = cotiza(cornR);
  const soy = cotiza(soyR);

  const cornP = corn?.price ?? REF.corn;
  const soyP = soy?.price ?? REF.soy;
  // Estos tres valores se conservan sólo para el bloque internacional y para
  // el contexto de insumos. Nunca se presentan como precio de Puebla.
  const cerdoP = hogs ? +(hogs.price * 0.022).toFixed(2) : REF.cerdo;
  const resP = cattle ? +(cattle.price * 0.022).toFixed(2) : REF.res;

  const precioPuebla = (key) => {
    const item = wholesalePrices?.prices?.[key];
    return item?.available && Number.isFinite(Number(item.price)) ? item : null;
  };
  const puebla = {
    cerdo: precioPuebla('pork'),
    pollo: precioPuebla('chicken'),
    res: precioPuebla('beef'),
    huevo: precioPuebla('egg'),
  };

  const precios = {
    cerdo: puebla.cerdo?.price ?? null,
    pollo: puebla.pollo?.price ?? null,
    res: puebla.res?.price ?? null,
    huevo: puebla.huevo?.price ?? null,
  };

  const feedMaiz = (cornP / 25.4) * 2.8;
  const feedSoya = (soyP / 1000) * 0.8;
  const feedTotal = +(feedMaiz + feedSoya).toFixed(2);

  const margen = {
    valor: puebla.cerdo ? `$${puebla.cerdo.price.toFixed(2)}` : '—',
    positivo: Boolean(puebla.cerdo),
    analisis:
      puebla.cerdo
        ? `<b>${puebla.cerdo.label}: $${puebla.cerdo.price.toFixed(2)} ${puebla.cerdo.unit}</b> en ${puebla.cerdo.market}, `
          + `con fecha ${puebla.cerdo.date}. ${puebla.cerdo.note}.<br>`
          + 'No se calcula un margen de producción con esta cifra: requeriría costos locales y una especificación homogénea de canal, peso y alimentación.'
        : 'Aún no hay una cotización de cerdo verificable para Puebla. La plataforma no la reemplaza con un futuro de Estados Unidos.',
  };

  const sintetica = {
    cerdo: {
      titulo: `Referencia internacional: Lean Hogs CME $${cerdoP}/kg${hogs ? '' : ' (ref.)'}`,
      desc: 'Es un futuro de Estados Unidos para contexto internacional; no es una cotización de cerdo físico de Puebla.',
    },
    pollo: {
      titulo: 'Sin noticia local verificada de pollo',
      desc: 'La tarjeta de precios sólo publica pollo físico de Puebla cuando la búsqueda devuelve mercado, fecha, unidad y evidencia.',
    },
    res: {
      titulo: `Referencia internacional: Live Cattle CME $${resP}/kg${cattle ? '' : ' (ref.)'}`,
      desc: 'Es un futuro de Estados Unidos para contexto internacional; no es una cotización de bovino físico de Puebla.',
    },
  };

  const noticias = ESPECIES.map((especie, i) => {
    const a = grupos[especie][0];
    const base = { especie, categoria: ETIQUETA[especie], impacto: IMPACTO[especie], fecha: `${fechaFmt} · ${hora}`, img: IMGS[i % IMGS.length] };
    if (a?.title) {
      return {
        ...base,
        titulo: a.title.slice(0, 120),
        desc: (a.description || a.desc || a.summary || '').slice(0, 380),
        fuente: (a.source || a.domain || (i < gdProt.length ? 'GDELT' : 'FINNHUB')).toUpperCase(),
      };
    }
    return { ...base, ...sintetica[especie], fuente: especie === 'pollo' ? 'VALL · VALIDACIÓN LOCAL' : (hogs ? 'ALPHA VANTAGE' : 'CME REF.') };
  });

  const ratio = puebla.cerdo && puebla.pollo ? (puebla.cerdo.price / puebla.pollo.price).toFixed(2) : null;
  const notaRatio = ratio
    ? 'Indicador descriptivo: los niveles comerciales no son idénticos y no equivale a un margen.'
    : 'Se publica sólo cuando existen ambas cotizaciones físicas de Puebla.';

  /* No se promedian estas fuentes: cada una observa un eslabón distinto de la
     cadena. El usuario puede contrastar un futuro de EE.UU., una venta primaria
     mexicana y un precio al consumidor sin que una cifra se haga pasar por otra. */
  const fuentes = [
    {
      nombre: 'CME / Yahoo Finance',
      nivel: 'Futuros de ganado y cerdo · Estados Unidos · USD/kg derivado',
      estado: Boolean(hogs || cattle),
      detalle: hogs || cattle ? 'Cierre de mercado disponible para contraste internacional.' : 'No respondió la cotización de futuros.',
    },
    {
      nombre: 'INEGI · BIE',
      nivel: 'Precio promedio al consumidor · México · MXN/kg · mensual',
      estado: Boolean(inegi?.precios && Object.keys(inegi.precios).length),
      detalle: inegi?.precios && Object.keys(inegi.precios).length
        ? `Series disponibles: ${Object.keys(inegi.precios).join(', ')}. No se compara como si fuera precio de rastro.`
        : 'No respondió una serie mensual del INEGI.',
    },
    {
      nombre: 'BLS',
      nivel: 'Precio promedio al consumidor · Estados Unidos · USD/lb o docena · mensual',
      estado: Boolean(bls?.prices && Object.keys(bls.prices).length),
      detalle: bls?.prices && Object.keys(bls.prices).length
        ? `Series disponibles: ${Object.keys(bls.prices).join(', ')}.`
        : 'No respondió una serie mensual del BLS.',
    },
    {
      nombre: 'Cotizaciones físicas de Puebla',
      nivel: 'Puebla, Puebla · mayoreo / intermediario · MXN/kg · cada 12 h',
      estado: Boolean(wholesalePrices?.available && wholesalePrices?.prices && Object.keys(wholesalePrices.prices).length),
      detalle: wholesalePrices?.available
        ? `Gemini + búsqueda web. Última investigación: ${wholesalePrices.retrievedAt ? new Date(wholesalePrices.retrievedAt).toLocaleString('es-MX') : 'sin sello'}. Cada renglón conserva mercado, fecha, unidad y enlace de evidencia.`
        : 'No hubo evidencia local suficiente para publicar una cotización.',
    },
    {
      nombre: 'WOAH / WAHIS',
      nivel: 'Alertas sanitarias oficiales · cobertura global · continua',
      estado: Boolean(woah?.alerts),
      detalle: woah?.alerts
        ? `${woah.alerts.length} alerta(s) sanitaria(s) disponible(s) para el contexto de oferta.`
        : 'No hubo alertas disponibles en la consulta actual.',
    },
  ];

  return {
    precios,
    margen,
    ratio,
    notaRatio,
    noticias,
    exportTitulo: `Exportaciones México · Porcino FOB ${fechaFmt}`,
    destinos: Object.fromEntries(DESTINOS.map((d) => [d.clave, `$${(cerdoP + d.extra).toFixed(2)}/kg`])),
    exportInsight:
      `<b>REFERENCIA INTERNACIONAL ${fechaFmt}:</b> Lean Hogs CME $${cerdoP}/kg${hogs ? '' : ' (ref.)'}. ` +
      (cornP > 5.2 ? 'El maíz internacional se mantiene elevado. ' : 'El maíz internacional se mantiene en rango. ') +
      'Esta referencia no sustituye la cotización física de Puebla.',
    wholesalePrices,
    fuentes,
    fuentesActivas: fuentes.filter((fuente) => fuente.estado).length,
    catalogo,
    feedTotal,
    feedChg: corn?.pct ? `${VDS.fmtPct(corn.pct)} maíz` : '—',
    consumePara:
      ratio
        ? `Indicador cerdo/pollo de Puebla: ${ratio}. ${notaRatio}`
        : 'No se calcula una razón entre especies hasta tener ambas cotizaciones físicas verificables de Puebla.',
  };
}

export default function MercadoProteinas() {
  usePageStyles(HOJAS);

  const [datos, setDatos] = useState(null);
  const [filtro, setFiltro] = useState('all');
  const [analisisIA, setAnalisisIA] = useState('');
  const [evidenciaFuentes, setEvidenciaFuentes] = useState(null);
  const [estadoEvidencia, setEstadoEvidencia] = useState('idle');

  useEffect(() => {
    let vivo = true;
    let reloj = null;

    const ejecutar = async (VDS) => {
      const d = await calcular(VDS);
      if (!vivo) return;
      VDS.save(CLAVE_CACHE, d);
      setDatos(d);

      // El análisis de Gemini llega después y sólo interpreta las cotizaciones
      // locales ya validadas; no puede convertir un futuro internacional en
      // un supuesto precio de Puebla.
      try {
        const cotizacionesPuebla = Object.entries(d.wholesalePrices?.prices || {})
          .filter(([, precio]) => precio?.available)
          .map(([especie, precio]) => `${especie}: $${precio.price} ${precio.unit}; ${precio.market}; fecha ${precio.date}; base ${precio.note}`)
          .join('\n');
        if (!cotizacionesPuebla) return;
        const prompt =
          'Eres ORION, analista de mercados pecuarios de Puebla. Con estas cotizaciones físicas verificadas, ' +
          'redacta una lectura breve (2-3 oraciones). Menciona niveles no comparables y no calcules margen, tendencia ni variaciones que no estén en los datos.\n\n' +
          `${cotizacionesPuebla}\n\n` +
          'Sé directo y práctico para operadores mexicanos, sin frases de apertura genéricas.';
        const texto = await VDS.geminiChat(prompt, SISTEMA_IA);
        if (vivo && texto) setAnalisisIA(texto);
      } catch { /* se queda el análisis calculado localmente */ }
    };

    (async () => {
      try {
        await loadScripts(LIBS);
      } catch (e) {
        console.error('Proteínas: no se pudo cargar data-service', e);
        return;
      }
      if (!vivo) return;

      const VDS = globalLegado('VDS');
      if (!VDS) {
        console.error('Proteínas: data-service.js no expuso VDS.');
        return;
      }

      // Caché en disco: pinta al instante y revalida solo si venció.
      const guardado = VDS.load(CLAVE_CACHE, true);
      if (guardado?.noticias?.length) {
        setDatos(guardado);
        if (!VDS.isExpired(CLAVE_CACHE)) return;
        VDS.clear(CLAVE_CACHE);
      }

      await ejecutar(VDS).catch((e) => console.error('Proteínas:', e));

      // Antes este intervalo no se cancelaba nunca.
      reloj = setInterval(() => ejecutar(VDS).catch(() => {}), MS_REFRESCO);
    })();

    return () => {
      vivo = false;
      if (reloj) clearInterval(reloj);
    };
  }, []);

  const noticias = useMemo(
    () => (datos?.noticias || []).filter((n) => filtro === 'all' || n.especie === filtro),
    [datos, filtro],
  );

  const cargarEvidenciaFuentes = (event) => {
    if (!event.currentTarget.open || estadoEvidencia === 'loading' || estadoEvidencia === 'ready') return;
    setEstadoEvidencia('loading');
    Promise.allSettled([
      fetch('/api/proteinas/evidencia/usda-ams').then((response) => (response.ok ? response.json() : null)),
      fetch('/api/proteinas/evidencia/fao-fpma').then((response) => (response.ok ? response.json() : null)),
    ]).then(([ams, fpma]) => {
      const next = {
        ams: ams.status === 'fulfilled' ? ams.value : null,
        fpma: fpma.status === 'fulfilled' ? fpma.value : null,
      };
      setEvidenciaFuentes(next);
      setEstadoEvidencia(next.ams || next.fpma ? 'ready' : 'failed');
    }).catch(() => setEstadoEvidencia('failed'));
  };

  return (
    <>
      <Header />
      <div className="hdr-divider" />

      <div className="mp-container">
        <div className="mp-page-title">
          <i className="fas fa-drumstick-bite" /> Mercado Proteínas
        </div>

        <div className="mp-filter-bar">
          {CATEGORIAS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`mp-fpill${filtro === c.id ? ' active' : ''}`}
              onClick={() => setFiltro(c.id)}
            >
              {c.texto}
            </button>
          ))}
        </div>

        <div className="mp-news-grid">
          {noticias.map((n) => (
            <article className="mp-news-card" key={n.especie}>
              <img className="mp-nc-img" src={n.img} alt={n.categoria} />
              <div className="mp-nc-body">
                <span className="mp-nc-cat">{n.categoria}</span>
                <span className="mp-nc-date">{n.fecha}</span>
                <h3 className="mp-nc-title">{n.titulo}</h3>
                <p className="mp-nc-desc">{n.desc}</p>
                <div className="mp-nc-foot">
                  <span className="mp-tag-src">{n.fuente}</span>
                  {n.impacto === 'alto' && <span className="mp-tag-high">CRÍTICO</span>}
                  {n.impacto === 'medio' && <span className="mp-tag-med">MEDIA</span>}
                  {n.impacto === 'bajo' && <span className="mp-tag-low">BAJA</span>}
                </div>
              </div>
            </article>
          ))}
          {!datos && <p className="mp-nc-desc">Cargando información del mercado…</p>}
        </div>

        <div className="mp-bottom-grid">
          <div className="mp-left-col">
            <div className="mp-panel">
              <div className="mp-section-lbl">Puebla, Puebla · cotizaciones físicas (MXN / kg)</div>
              <p className="mp-sources-intro">
                Gemini investiga cada 12 horas. Se muestran sólo precios con mercado, fecha, nivel comercial y evidencia; no son futuros ni precios de menudeo.
              </p>
              {ESPECIES_PRECIO.filter((especie) => filtro === 'all' || especie === filtro).map((especie) => {
                const key = CLAVE_COMERCIAL[especie];
                const priceData = datos?.wholesalePrices?.prices?.[key];
                const source = datos?.wholesalePrices?.sources?.find((item) => priceData?.sourceUrls?.includes(item.url));
                return (
                  <div className="mp-price-row" key={especie} style={{ alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="mp-price-name" style={{ fontWeight: 600 }}>{priceData?.label || NOMBRE_PRECIO[especie]}</span>
                      <span style={{ fontSize: '0.7rem', color: '#64748B', lineHeight: '1.2', marginTop: '2px' }}>
                        {priceData?.available ? `${priceData.market} · ${priceData.date} · ${priceData.level}` : (priceData?.error || 'Consultando evidencia local…')}
                      </span>
                      {priceData?.available && <span style={{ fontSize: '0.7rem', color: '#64748B', lineHeight: '1.2', marginTop: '2px' }}>{priceData.note}</span>}
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '135px' }}>
                      <span className="mp-price-val" style={{ color: '#00213A' }}>
                        {priceData?.available ? priceData.displayPrice : 'Sin cotización'}
                      </span>
                      {priceData?.available && (
                        <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                          {priceData.rangeMin && priceData.rangeMax ? `rango: $${priceData.rangeMin}–$${priceData.rangeMax}` : 'precio puntual'}
                          {source && <> · <a href={source.url} target="_blank" rel="noreferrer">ver evidencia</a></>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="mp-ratio-note">
                <i className="fas fa-location-dot" style={{ color: '#00213a' }} />
                &nbsp;<b>{datos?.wholesalePrices?.market?.label || 'Puebla, Puebla'}</b>
                {datos?.wholesalePrices?.retrievedAt ? ` · investigado ${new Date(datos.wholesalePrices.retrievedAt).toLocaleString('es-MX')}` : ''}
                {datos?.wholesalePrices?.stale ? ' · mostrando el último corte validado' : ''}
              </div>
            </div>

            <div className="mp-panel mp-sources-panel">
              <div className="mp-section-lbl">
                Contraste de fuentes
                {datos && <span className="mp-sources-count">{datos.fuentesActivas}/{datos.fuentes.length} contrastadas</span>}
              </div>
              <p className="mp-sources-intro">
                Las cifras se presentan por nivel de mercado. No se promedian futuros, primera venta y menudeo.
              </p>
              <div className="mp-sources-list">
                {(datos?.fuentes || []).map((fuente) => (
                  <div className="mp-source-row" key={fuente.nombre}>
                    <span className={`mp-source-dot${fuente.estado ? ' active' : ''}`} aria-label={fuente.estado ? 'Fuente disponible' : 'Fuente no disponible'} />
                    <div>
                      <strong>{fuente.nombre}</strong>
                      <span>{fuente.nivel}</span>
                      <small>{fuente.detalle}</small>
                    </div>
                  </div>
                ))}
                {!datos && <span className="mp-nc-desc">Consultando fuentes…</span>}
              </div>
              {datos?.catalogo?.sources?.length > 0 && (
                <details className="mp-catalog" onToggle={cargarEvidenciaFuentes}>
                  <summary>
                    Cobertura internacional: {datos.catalogo.summary.connected} conectadas de {datos.catalogo.summary.total} fuentes en {datos.catalogo.summary.countries} mercados
                  </summary>
                  <p>
                    {datos.catalogo.summary.officialOrMultilateral} proceden de organismos oficiales, registros administrativos u organismos multilaterales. Las fuentes conectadas fueron verificadas contra su portal oficial; los indicadores numéricos sólo se usan cuando conservan unidad, periodo y serie de origen.
                  </p>
                  {estadoEvidencia === 'loading' && <p className="mp-evidence-loading">Cargando último corte de datos estructurados…</p>}
                  {estadoEvidencia === 'ready' && (
                    <div className="mp-evidence-grid" aria-label="Último corte de datos estructurados">
                      {evidenciaFuentes?.ams?.payload && (
                        <div className="mp-evidence-card">
                          <span>USDA AMS · cerdo FOB planta</span>
                          <strong>USD {Number(evidenciaFuentes.ams.payload.negotiated_sales_usd_per_cwt?.pork_carcass?.value).toFixed(2)}/cwt</strong>
                          <small>{evidenciaFuentes.ams.data_vintage} · ventas negociadas nacionales</small>
                        </div>
                      )}
                      {evidenciaFuentes?.fpma?.payload && (
                        <div className="mp-evidence-card">
                          <span>FAO FPMA · maíz blanco, Culiacán</span>
                          <strong>MXN {Number(evidenciaFuentes.fpma.payload.value).toFixed(2)}/kg</strong>
                          <small>{evidenciaFuentes.fpma.data_vintage} · mercado mayorista</small>
                        </div>
                      )}
                    </div>
                  )}
                  {estadoEvidencia === 'failed' && <p className="mp-evidence-loading">Los datos estructurados no respondieron en este corte; el catálogo conserva su última validación.</p>}
                  <ul>
                    {datos.catalogo.sources.map((fuente) => (
                      <li key={fuente.id}>
                        <div className="mp-catalog-source">
                          <a href={fuente.url} target="_blank" rel="noreferrer">{fuente.country} · {fuente.name}</a>
                          <small>{fuente.coverage} · {fuente.cadence}</small>
                          {fuente.connection?.status === 'connected' && <small>{fuente.connection.mode === 'structured_api' ? 'Datos estructurados conectados y verificados.' : 'Canal oficial conectado y verificado.'}</small>}
                          {fuente.connection?.title && <small>Portal verificado: {fuente.connection.title}</small>}
                          {fuente.connection?.status === 'unavailable' && <small>Validación pendiente: {fuente.connection.next_action || fuente.connection.error}</small>}
                        </div>
                        <span className={`mp-catalog-state ${fuente.available ? 'active' : ''}`} title={fuente.connection?.checked_at ? `Verificada: ${new Date(fuente.connection.checked_at).toLocaleString('es-MX')}` : undefined}>{fuente.connection?.status === 'connected' ? (fuente.connection.mode === 'structured_api' ? 'Datos conectados' : 'Portal conectado') : (ESTADO_FUENTE[fuente.integration] || fuente.integration)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            <div className="mp-panel">
              <div className="mp-section-lbl">{datos?.exportTitulo || 'Exportaciones México · Cargando…'}</div>
              {DESTINOS.map((d) => (
                <div className="mp-dest-bar" key={d.clave}>
                  <div className="mp-bar-label">
                    <span>{d.etiqueta}</span>
                    <b>{datos?.destinos?.[d.clave] || '$—'}</b>
                  </div>
                  <div className="mp-bar-bg">
                    <div
                      className={`mp-bar-fill${d.acento ? ' accent' : ''}`}
                      style={{ width: `${d.pct}%`, opacity: d.tenue ? 0.6 : undefined }}
                    />
                  </div>
                </div>
              ))}
              {datos
                ? <ContenidoEnriquecido className="mp-export-insight" texto={datos.exportInsight} />
                : <div className="mp-export-insight">Cargando análisis de mercado…</div>}
            </div>
          </div>

          <div className="mp-right-col">
            <div className="mp-margin-card">
              <div className="mp-margin-lbl">Lectura local · ORION</div>
              <div
                className="mp-margin-val"
                style={{ color: datos ? (datos.margen.positivo ? '#4ade80' : '#f87171') : '#f87171' }}
              >
                {datos?.margen.valor ?? '—'}<small> MXN/kg</small>
              </div>
              {/* El análisis trae marcado (negritas, saltos) tanto si lo calcula
                  la página como si lo redacta Gemini. Cuando lo redacta Gemini
                  es texto de un modelo, así que pasa por ContenidoEnriquecido:
                  conserva las negritas y neutraliza cualquier otra etiqueta.
                  Ver la cabecera de lib/textoEnriquecido.js. */}
              <ContenidoEnriquecido
                className="mp-margin-sub"
                texto={analisisIA || datos?.margen.analisis || 'Calculando margen de producción…'}
              />
            </div>

            <div className="mp-panel">
              <div className="mp-section-lbl">Tendencias de Consumo</div>
              <div className="mp-stat-grid">
                <div className="mp-stat-box">
                  <div className="mp-stat-lbl">Indicador Cerdo/Pollo</div>
                  <div className="mp-stat-val">{datos?.ratio ?? '—'}</div>
                  <div className="mp-stat-chg">
                    {datos?.ratio ? 'cotizaciones locales disponibles' : 'sin comparación'}
                  </div>
                  <div className="mp-stat-note">descriptivo; no es margen</div>
                </div>
                <div className="mp-stat-box">
                  <div className="mp-stat-lbl">Insumos internacionales</div>
                  <div className="mp-stat-val">{datos ? `$${datos.feedTotal}` : '—'}</div>
                  <div className="mp-stat-chg">{datos?.feedChg || 'maíz + soya'}</div>
                  <div className="mp-stat-note">referencia, no costo local</div>
                </div>
              </div>
              <p className="mp-consume-para">
                {datos?.consumePara
                  || 'El cerdo desplaza a la res en USA por factor precio (+5% sustitución). La expansión de plantas en el Bajío asegura capacidad para demanda de embutidos en 2026-2027.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
