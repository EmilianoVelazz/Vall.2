import { useEffect, useMemo, useRef, useState } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import loadScripts, { globalLegado } from '../lib/loadScripts.js';
import { ContenidoEnriquecido } from '../lib/textoEnriquecido.js';
import ProteinMLRadar from '../components/ProteinMLRadar.jsx';
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

const CLAVE_CACHE = 'prot_v15-nacional';
const MS_REFRESCO = 30 * 60 * 1000;

const CATEGORIAS = [
  { id: 'all', texto: 'TODOS' },
  { id: 'cerdo', texto: 'CERDO' },
  { id: 'pollo', texto: 'POLLO' },
  { id: 'res', texto: 'RES' },
  { id: 'huevo', texto: 'HUEVO' },
];

const ETIQUETA = { cerdo: 'Cerdo · Mercado', pollo: 'Pollo · Tendencias', res: 'Res · Comercio', huevo: 'Huevo · Abasto' };
const IMPACTO = { cerdo: 'alto', pollo: 'medio', res: 'bajo', huevo: 'medio' };
const ESPECIES = ['cerdo', 'pollo', 'res', 'huevo'];
const ESPECIES_PRECIO = ['cerdo', 'pollo', 'res', 'huevo'];

const NOMBRE_PRECIO = {
  cerdo: 'Cerdo vivo',
  pollo: 'Pollo entero o canal',
  res: 'Bovino vivo',
  huevo: 'Huevo blanco',
};

const ESTADO_FUENTE = {
  connected: 'Conectada',
  requires_config: 'Requiere clave',
  scheduled_ingestion: 'Pendiente de ingesta',
  research_required: 'Pendiente de validación',
};

const IMGS = ['/assets/img/fallback/ganaderia.webp', '/assets/img/fallback/materias-primas.webp', '/assets/img/fallback/finanzas.webp'];

const SISTEMA_IA =
  'Eres un analista financiero institucional de VALL News especializado en agroindustria y ganadería. ' +
  'Responde en español, de forma concisa y profesional. Máximo 100 palabras.';

function clasificar(titulo) {
  const t = (titulo || '').toLowerCase();
  if (/\b(?:anthropic|openai|millionaires?|billionaires?|mecca|saudi|pakistan|ankara|erdogan|nato|missile|gaza|israel|syria|iran|ukraine|election|crypto|bitcoin|nvidia|apple|google|meta|tesla)\b/.test(t)) return null;
  if (/\b(?:pork|hog|hogs|cerdo|porcin[oa]s?|swine|bacon|jam[oó]n|lean hogs?)\b/.test(t)) return 'cerdo';
  if (/\b(?:egg|eggs|huevo|huevos|ponedora|postura)\b/.test(t)) return 'huevo';
  if (/\b(?:poultry|chicken|broiler|pollo|aviar|av[ií]cola|pavo|turkey\s+(?:meat|flock|farm|price|prices|production|breast))\b/.test(t)) return 'pollo';
  if (/\b(?:beef|cattle|bovine|bovino|vacuno|angus|feedlot|carne de res|res en canal|ganado bovino|live cattle)\b/.test(t)) return 'res';
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

  const [gdProtR, gdFeedR, fhR, sniimR, wholesaleR, inegiR, blsR, woahR, catalogoR] = await Promise.allSettled([
    VDS.gdeltNews('pork poultry beef cattle hog livestock chicken meat protein egg', 8),
    VDS.gdeltNews('corn soybean feed cost USDA livestock grain animal', 5),
    VDS.finnhubNews('general'),
    fetch('/api/sniim/primer-mercado').then(res => (res.ok ? res.json() : null)),
    fetch('/api/proteinas/precios-comerciales').then(res => (res.ok ? res.json() : null)),
    VDS.inegiPreciosCarne(),
    VDS.blsMeatPrices(),
    VDS.woahAlerts(),
    fetch('/api/proteinas/fuentes').then(res => (res.ok ? res.json() : null)),
  ]);

  const usar = (r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);
  const gdProt = usar(gdProtR);
  const sniim = sniimR.status === 'fulfilled' ? sniimR.value : null;
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

  const grupos = { cerdo: [], pollo: [], res: [], huevo: [] };
  unicas.forEach((a) => {
    const especie = clasificar(a.title);
    if (especie && grupos[especie].length < 2) grupos[especie].push(a);
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

  const cornP = corn?.price ?? null;
  const soyP = soy?.price ?? null;
  // Cotizaciones internacionales reales (sin constantes sintéticas si el proveedor no responde).
  const cerdoP = hogs ? +(hogs.price * 0.022).toFixed(2) : null;
  const resP = cattle ? +(cattle.price * 0.022).toFixed(2) : null;

  const precioNacional = (key) => {
    const item = sniim?.prices?.[key];
    const parsedPrice = Number(item?.price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return null;
    return {
      price: parsedPrice,
      label: item.label || NOMBRE_PRECIO[key],
      unit: item.unit || 'MXN/kg',
      date: item.date || item.states?.map((s) => s.date).filter(Boolean).sort().at(-1) || 'vigente',
      market: `México Nacional (${(item.states || []).length}/32 estados)`,
      level: item.level || 'Mercado físico nacional',
      source: item.source || sniim?.source || 'SNIIM',
      sourceUrl: item.sourceUrl || 'https://www.economia-sniim.gob.mx/nuevo/',
      states: Array.isArray(item.states) ? item.states : [],
    };
  };

  const nacional = {
    cerdo: precioNacional('pork'),
    pollo: precioNacional('chicken'),
    res: precioNacional('beef'),
    huevo: precioNacional('egg'),
  };

  const precios = {
    cerdo: nacional.cerdo?.price ?? null,
    pollo: nacional.pollo?.price ?? null,
    res: nacional.res?.price ?? null,
    huevo: nacional.huevo?.price ?? null,
  };

  const feedMaiz = cornP != null ? (cornP / 25.4) * 2.8 : null;
  const feedSoya = soyP != null ? (soyP / 1000) * 0.8 : null;
  const feedTotal = feedMaiz != null && feedSoya != null ? +(feedMaiz + feedSoya).toFixed(2) : null;

  const margen = {
    valor: nacional.cerdo ? `$${nacional.cerdo.price.toFixed(2)}` : '—',
    positivo: Boolean(nacional.cerdo),
    analisis:
      nacional.cerdo
        ? `<b>${nacional.cerdo.label}: $${nacional.cerdo.price.toFixed(2)} ${nacional.cerdo.unit}</b> · ${nacional.cerdo.market} (${nacional.cerdo.date}). `
          + `${nacional.cerdo.level}.<br>`
          + 'No se calcula un margen neto con una sola cotización: utiliza el Simulador de Costo y los Escenarios de Ración para incorporar flete, merma, FX y FCR.'
        : 'Aún no hay una cotización nacional verificable de cerdo en este corte. La plataforma no la reemplaza con un futuro de Estados Unidos.',
  };

  const sintetica = {
    cerdo: {
      titulo: cerdoP != null ? `Referencia internacional: Lean Hogs CME $${cerdoP}/kg` : 'Sin titular verificado de cerdo en este corte',
      desc: 'Futuro de Estados Unidos para contraste internacional; no sustituye la cotización física mexicana.',
    },
    pollo: {
      titulo: 'Sin noticia verificada de pollo en este corte',
      desc: 'Los precios físicos de pollo conservan su fecha, unidad y cobertura estatal SNIIM.',
    },
    res: {
      titulo: resP != null ? `Referencia internacional: Live Cattle CME $${resP}/kg` : 'Sin titular verificado de res en este corte',
      desc: 'Futuro de Estados Unidos para contraste internacional; no sustituye la cotización física mexicana.',
    },
    huevo: {
      titulo: 'Sin noticia verificada de huevo en este corte',
      desc: 'El tablero nacional conserva las cotizaciones semanales SNIIM de huevo blanco por entidad.',
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
    return { ...base, ...sintetica[especie], fuente: (especie === 'cerdo' && hogs) || (especie === 'res' && cattle) ? 'CME / YAHOO' : 'VALL · SNIIM' };
  });

  const ratio = nacional.cerdo && nacional.pollo ? (nacional.cerdo.price / nacional.pollo.price).toFixed(2) : null;
  const notaRatio = ratio
    ? 'Indicador descriptivo nacional: los niveles comerciales no son idénticos y no equivale a un margen.'
    : 'Se publica sólo cuando existen ambas cotizaciones físicas nacionales.';

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
      nombre: 'SNIIM + Porcicultura.com (México Nacional)',
      nivel: 'Primera venta y mayoreo físico por entidad · MXN/kg',
      estado: Boolean(sniim?.available),
      detalle: sniim?.available
        ? `Corte nacional disponible (${sniim.retrievedAt ? new Date(sniim.retrievedAt).toLocaleString('es-MX') : 'vigente'}). Cada entidad conserva su fecha y unidad.`
        : 'No respondió el corte nacional SNIIM en esta consulta.',
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

  const futurosInternacionales = [
    { clave: 'hogs', etiqueta: 'Lean Hogs CME (USD/kg eq.)', valor: cerdoP != null ? `$${cerdoP.toFixed(2)}/kg` : 'Sin cotización', pct: hogs?.pct ?? null },
    { clave: 'cattle', etiqueta: 'Live Cattle CME (USD/kg eq.)', valor: resP != null ? `$${resP.toFixed(2)}/kg` : 'Sin cotización', pct: cattle?.pct ?? null },
    { clave: 'corn', etiqueta: 'Maíz CME (US¢/bu)', valor: cornP != null ? `$${Number(cornP).toFixed(2)}` : 'Sin cotización', pct: corn?.pct ?? null },
    { clave: 'soy', etiqueta: 'Soya CME (US¢/bu)', valor: soyP != null ? `$${Number(soyP).toFixed(2)}` : 'Sin cotización', pct: soy?.pct ?? null },
  ];

  return {
    precios,
    nacional,
    sniim,
    margen,
    ratio,
    notaRatio,
    noticias,
    exportTitulo: `Referencias Internacionales CME · ${fechaFmt}`,
    futurosInternacionales,
    exportInsight:
      cerdoP != null
        ? `<b>REFERENCIA INTERNACIONAL ${fechaFmt}:</b> Lean Hogs CME $${cerdoP}/kg` +
          (resP != null ? ` · Live Cattle CME $${resP}/kg.` : '.') +
          ' Estas cotizaciones son futuros de EE.UU. para contraste; no sustituyen precios físicos en México.'
        : 'Sin cotizaciones internacionales CME disponibles en este corte; no se muestran estimaciones sintéticas.',
    wholesalePrices,
    fuentes,
    fuentesActivas: fuentes.filter((fuente) => fuente.estado).length,
    catalogo,
    feedTotal,
    feedChg: corn?.pct ? `${VDS.fmtPct(corn.pct)} maíz` : '—',
    consumePara:
      ratio
        ? `Indicador cerdo/pollo nacional: ${ratio}. ${notaRatio}`
        : 'No se calcula una razón entre especies hasta tener ambas cotizaciones físicas verificables.',
  };
}

export default function MercadoProteinas() {
  usePageStyles(HOJAS);

  const [datos, setDatos] = useState(null);
  const [filtro, setFiltro] = useState('all');
  const [estadoSeleccionado, setEstadoSeleccionado] = useState('ALL');
  const [analisisIA, setAnalisisIA] = useState('');
  const [evidenciaFuentes, setEvidenciaFuentes] = useState(null);
  const [estadoEvidencia, setEstadoEvidencia] = useState('idle');
  const evidenciaAbortRef = useRef(null);

  useEffect(() => {
    let vivo = true;
    let reloj = null;

    const actualizarInsight = async (VDS, d) => {
      try {
        const cotizaciones = Object.entries(d?.nacional || {})
          .filter(([, precio]) => precio?.price != null)
          .map(([especie, precio]) => `${especie}: $${precio.price.toFixed(2)} ${precio.unit}; ${precio.market}; fecha ${precio.date}; base ${precio.level}`)
          .join('\n');
        if (!cotizaciones) return;
        const prompt =
          'Eres ORION, analista de mercados pecuarios de México. Con estas cotizaciones físicas nacionales verificadas (SNIIM / Porcicultura.com), ' +
          'redacta una lectura breve (2-3 oraciones). Menciona niveles no comparables y no calcules margen, tendencia ni variaciones que no estén en los datos.\n\n' +
          `${cotizaciones}\n\n` +
          'Sé directo y práctico para operadores mexicanos, sin frases de apertura genéricas.';
        const texto = await VDS.geminiChat(prompt, SISTEMA_IA);
        if (vivo && texto) setAnalisisIA(texto);
      } catch { /* se queda el análisis calculado localmente */ }
    };

    const ejecutar = async (VDS) => {
      const d = await calcular(VDS);
      if (!vivo) return;
      VDS.save(CLAVE_CACHE, d);
      setDatos(d);
      await actualizarInsight(VDS, d);
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
        if (!VDS.isExpired(CLAVE_CACHE)) {
          void actualizarInsight(VDS, guardado);
          reloj = setInterval(() => ejecutar(VDS).catch(() => {}), MS_REFRESCO);
          return;
        }
        VDS.clear(CLAVE_CACHE);
      }

      await ejecutar(VDS).catch((e) => console.error('Proteínas:', e));
      if (!vivo) return;

      // Antes este intervalo no se cancelaba nunca.
      reloj = setInterval(() => ejecutar(VDS).catch(() => {}), MS_REFRESCO);
    })();

    return () => {
      vivo = false;
      if (reloj) clearInterval(reloj);
      evidenciaAbortRef.current?.abort();
    };
  }, []);

  const noticias = useMemo(
    () => (datos?.noticias || []).filter((n) => filtro === 'all' || n.especie === filtro),
    [datos, filtro],
  );

  const estadosDisponibles = useMemo(() => {
    const mapa = new Map();
    Object.values(datos?.nacional || {}).forEach((item) => {
      (item?.states || []).forEach((s) => {
        if (s?.stateCode && s?.state) mapa.set(s.stateCode, s.state);
      });
    });
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [datos]);

  const cargarEvidenciaFuentes = (event) => {
    if (!event.currentTarget.open || estadoEvidencia === 'loading' || estadoEvidencia === 'ready') return;
    setEstadoEvidencia('loading');
    evidenciaAbortRef.current?.abort();
    const ctrl = new AbortController();
    evidenciaAbortRef.current = ctrl;
    Promise.allSettled([
      fetch('/api/proteinas/evidencia/usda-ams', { signal: ctrl.signal }).then((response) => (response.ok ? response.json() : null)),
      fetch('/api/proteinas/evidencia/fao-fpma', { signal: ctrl.signal }).then((response) => (response.ok ? response.json() : null)),
    ]).then(([ams, fpma]) => {
      if (ctrl.signal.aborted) return;
      const next = {
        ams: ams.status === 'fulfilled' ? ams.value : null,
        fpma: fpma.status === 'fulfilled' ? fpma.value : null,
      };
      setEvidenciaFuentes(next);
      setEstadoEvidencia(next.ams || next.fpma ? 'ready' : 'failed');
    }).catch(() => {
      if (!ctrl.signal.aborted) setEstadoEvidencia('failed');
    });
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

        <ProteinMLRadar activeSpecies={filtro} onSelectSpecies={setFiltro} />

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
              <div className="mp-section-lbl" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>México Nacional (SNIIM) · cotizaciones físicas (MXN / kg)</span>
                {estadosDisponibles.length > 0 && (
                  <label style={{ fontSize: '0.75rem', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    Entidad:
                    <select
                      aria-label="Filtrar cotizaciones físicas por entidad"
                      value={estadoSeleccionado}
                      onChange={(e) => setEstadoSeleccionado(e.target.value)}
                      style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px' }}
                    >
                      <option value="ALL">Promedio Nacional ({estadosDisponibles.length} estados)</option>
                      {estadosDisponibles.map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <p className="mp-sources-intro">
                Precios físicos verificados de SNIIM y Porcicultura.com. Cada especie conserva su nivel comercial, fecha y cobertura estatal; no se mezclan con futuros ni menudeo.
              </p>
              {ESPECIES_PRECIO.filter((especie) => filtro === 'all' || especie === filtro).map((especie) => {
                const nat = datos?.nacional?.[especie];
                const stateRow = estadoSeleccionado !== 'ALL'
                  ? nat?.states?.find((s) => s.stateCode === estadoSeleccionado)
                  : null;
                const activePrice = estadoSeleccionado === 'ALL' ? nat?.price : stateRow?.price;
                const hasPrice = Number.isFinite(Number(activePrice)) && Number(activePrice) > 0;
                const activeDate = estadoSeleccionado === 'ALL' ? nat?.date : stateRow?.date;
                const activeMarket = estadoSeleccionado === 'ALL'
                  ? nat?.market
                  : (stateRow?.markets?.join(', ') || stateRow?.state || 'Sin registro en esta entidad');
                const activeUnit = stateRow?.unit || nat?.unit || 'MXN/kg';
                const activeLevel = stateRow?.level || nat?.level || '';
                const sourceUrl = stateRow?.sourceUrl || nat?.sourceUrl;
                return (
                  <div className="mp-price-row" key={especie} style={{ alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="mp-price-name" style={{ fontWeight: 600 }}>{nat?.label || NOMBRE_PRECIO[especie]}</span>
                      <span style={{ fontSize: '0.7rem', color: '#64748B', lineHeight: '1.2', marginTop: '2px' }}>
                        {hasPrice
                          ? `${activeMarket} · ${activeDate || 'vigente'}${activeLevel ? ` · ${activeLevel}` : ''}`
                          : (estadoSeleccionado === 'ALL'
                            ? 'Cotización nacional temporalmente no disponible.'
                            : 'Sin publicación reciente para esta entidad.')}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '135px' }}>
                      <span className="mp-price-val" style={{ color: '#00213A' }}>
                        {hasPrice ? `$${Number(activePrice).toFixed(2)} ${activeUnit}` : 'Sin cotización'}
                      </span>
                      {hasPrice && sourceUrl && (
                        <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                          <a href={sourceUrl} target="_blank" rel="noreferrer">{stateRow?.source || nat?.source || 'ver fuente'}</a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="mp-ratio-note">
                <i className="fas fa-location-dot" style={{ color: '#00213a' }} />
                &nbsp;<b>{estadoSeleccionado === 'ALL' ? 'México Nacional (SNIIM + Porcicultura.com)' : (estadosDisponibles.find(([c]) => c === estadoSeleccionado)?.[1] || estadoSeleccionado)}</b>
                {datos?.sniim?.retrievedAt ? ` · corte ${new Date(datos.sniim.retrievedAt).toLocaleString('es-MX')}` : ''}
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
                      {Number.isFinite(Number(evidenciaFuentes?.ams?.payload?.negotiated_sales_usd_per_cwt?.pork_carcass?.value)) && (
                        <div className="mp-evidence-card">
                          <span>USDA AMS · cerdo FOB planta</span>
                          <strong>USD {Number(evidenciaFuentes.ams.payload.negotiated_sales_usd_per_cwt.pork_carcass.value).toFixed(2)}/cwt</strong>
                          <small>{evidenciaFuentes.ams.data_vintage} · ventas negociadas nacionales</small>
                        </div>
                      )}
                      {Number.isFinite(Number(evidenciaFuentes?.fpma?.payload?.value)) && (
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
              <div className="mp-section-lbl">{datos?.exportTitulo || 'Referencias Internacionales CME · Cargando…'}</div>
              {(datos?.futurosInternacionales || []).map((f) => (
                <div className="mp-price-row" key={f.clave}>
                  <span className="mp-price-name">{f.etiqueta}</span>
                  <span className="mp-price-val" style={{ color: '#00213A' }}>{f.valor}</span>
                </div>
              ))}
              {datos
                ? <ContenidoEnriquecido className="mp-export-insight" texto={datos.exportInsight} />
                : <div className="mp-export-insight">Cargando referencias internacionales…</div>}
            </div>
          </div>

          <div className="mp-right-col">
            <div className="mp-margin-card">
              <div className="mp-margin-lbl">Lectura nacional · ORION</div>
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
                texto={analisisIA || datos?.margen.analisis || 'Consultando cotizaciones nacionales…'}
              />
            </div>

            <div className="mp-panel">
              <div className="mp-section-lbl">Indicadores de Referencia</div>
              <div className="mp-stat-grid">
                <div className="mp-stat-box">
                  <div className="mp-stat-lbl">Indicador Cerdo/Pollo</div>
                  <div className="mp-stat-val">{datos?.ratio ?? '—'}</div>
                  <div className="mp-stat-chg">
                    {datos?.ratio ? 'cotizaciones nacionales disponibles' : 'sin comparación'}
                  </div>
                  <div className="mp-stat-note">descriptivo; no es margen</div>
                </div>
                <div className="mp-stat-box">
                  <div className="mp-stat-lbl">Insumos internacionales</div>
                  <div className="mp-stat-val">{datos?.feedTotal != null ? `$${datos.feedTotal}` : '—'}</div>
                  <div className="mp-stat-chg">{datos?.feedChg || 'maíz + soya'}</div>
                  <div className="mp-stat-note">referencia CME, no costo local</div>
                </div>
              </div>
              <p className="mp-consume-para">
                {datos?.consumePara || 'Consultando indicadores de contraste nacional…'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
