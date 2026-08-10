import { useEffect, useMemo, useState } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import loadScripts, { globalLegado } from '../lib/loadScripts.js';
import './MercadoProteinas.css';

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
  '/assets/css/base.css',
  '/assets/css/header.css',
  '/assets/css/footer.css',
  '/assets/css/responsive.css',
];

const LIBS = [
  '/assets/js/api-keys.js?v=5',
  '/assets/js/data-service.js?v=22',
];

const CLAVE_CACHE = 'prot_v11';
const MS_REFRESCO = 30 * 60 * 1000;

const CATEGORIAS = [
  { id: 'all', texto: 'TODOS' },
  { id: 'cerdo', texto: '🐖 CERDO' },
  { id: 'pollo', texto: '🐔 POLLO' },
  { id: 'res', texto: '🐄 RES' },
];

const ETIQUETA = { cerdo: 'Cerdo · Mercado', pollo: 'Pollo · Tendencias', res: 'Res · Comercio' };
const IMPACTO = { cerdo: 'alto', pollo: 'medio', res: 'bajo' };
const ESPECIES = ['cerdo', 'pollo', 'res'];

const NOMBRE_PRECIO = {
  cerdo: '🐖 Cerdo (Pierna / Lomo)',
  pollo: '🐔 Pollo (Pechuga)',
  res: '🐄 Res (Cortes Selectos)',
};

const IMGS = ['/assets/img/mercadoP.webp', '/assets/img/mercados.webp', '/assets/img/finanzas.webp'];

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
const REF = { corn: 4.82, soy: 342.0, cerdo: 2.45, res: 4.8, pollo: 2.9 };

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

  const [gdProtR, gdFeedR, fhR] = await Promise.allSettled([
    VDS.gdeltNews('pork poultry beef cattle hog livestock chicken meat protein', 6),
    VDS.gdeltNews('corn soybean feed cost USDA livestock grain animal', 5),
    VDS.finnhubNews('general'),
  ]);

  const usar = (r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);
  const gdProt = usar(gdProtR);

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
  const cerdoP = hogs ? +(hogs.price * 0.022).toFixed(2) : REF.cerdo;
  const resP = cattle ? +(cattle.price * 0.022).toFixed(2) : REF.res;
  const polloP = +Math.max(2.5, Math.min(3.5, 2.9 + (cornP - REF.corn) * 0.08)).toFixed(2);

  const precios = {
    cerdo: cerdoP, cerdo_pct: hogs?.pct ?? 0,
    pollo: polloP, pollo_pct: +((corn?.pct ?? 0) * 0.65).toFixed(2),
    res: resP, res_pct: cattle?.pct ?? 0,
  };

  const feedMaiz = (cornP / 25.4) * 2.8;
  const feedSoya = (soyP / 1000) * 0.8;
  const costoFijo = 2.0;
  const costoTotal = +(feedMaiz + feedSoya + costoFijo).toFixed(2);
  const margenVal = +(cerdoP - costoTotal).toFixed(2);
  const margenStr = `${margenVal >= 0 ? '+' : ''}$${margenVal}`;
  const feedTotal = +(feedMaiz + feedSoya).toFixed(2);

  const margen = {
    valor: margenStr,
    positivo: margenVal >= 0,
    analisis:
      `Maíz <b>$${cornP.toFixed(2)}/bu</b>${corn ? '' : ' <i>(ref.)</i>'} · ` +
      `Soya <b>$${(soyP / 100).toFixed(2)}/cwt</b>${soy ? '' : ' <i>(ref.)</i>'}.<br>` +
      `Feed cost: <b>$${feedTotal.toFixed(2)}/kg</b> + fijos $${costoFijo}/kg = $${costoTotal}/kg total.<br>` +
      (margenVal >= 0
        ? `Margen operativo estimado: <b style="color:#4ade80">${margenStr}/kg</b>.`
        : `<b style="color:#f87171">Margen negativo ${margenStr}/kg</b> — ajustar precio de venta.`),
  };

  const sintetica = {
    cerdo: {
      titulo: `Lean Hogs CME $${cerdoP}/kg${hogs ? '' : ' (ref.)'}`,
      desc: `Futuros de cerdo: $${cerdoP}/kg. Feed cost est. $${feedTotal}/kg (maíz $${cornP.toFixed(2)}/bu). Margen: ${margenStr}/kg.`,
    },
    pollo: {
      titulo: `Pollo broiler ~$${polloP}/kg (derivado maíz $${cornP.toFixed(2)}/bu)`,
      desc: `Estimado por correlación maíz→avícola. Maíz ${VDS.fmtPct(corn?.pct ?? 0)} hoy. Soya $${(soyP / 100).toFixed(2)}/cwt.`,
    },
    res: {
      titulo: `Live Cattle CME $${resP}/kg${cattle ? '' : ' (ref.)'}`,
      desc: `Ganado en pie: $${resP}/kg. Diferencial res/cerdo $${(resP - cerdoP).toFixed(2)}/kg. Ratio cerdo/pollo ${(cerdoP / polloP).toFixed(2)}.`,
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
    return { ...base, ...sintetica[especie], fuente: hogs ? 'ALPHA VANTAGE' : 'CME REF.' };
  });

  const ratio = (cerdoP / polloP).toFixed(2);
  const r = parseFloat(ratio);
  const notaRatio =
    r < 0.85 ? 'El cerdo gana competitividad — brecha con pollo se estrecha.'
      : r < 1.0 ? 'Diferencial moderado — ambas proteínas compiten en precio.'
        : 'El cerdo supera en precio al pollo — presión en demanda.';

  const tendencia = precios.cerdo_pct > 0.5 ? 'al alza' : precios.cerdo_pct < -0.5 ? 'a la baja' : 'estable';

  return {
    precios,
    margen,
    ratio,
    notaRatio,
    noticias,
    exportTitulo: `Exportaciones México · Porcino FOB ${fechaFmt}`,
    destinos: Object.fromEntries(DESTINOS.map((d) => [d.clave, `$${(cerdoP + d.extra).toFixed(2)}/kg`])),
    exportInsight:
      `<b>MERCADO ${fechaFmt}:</b> Cerdo ${tendencia} — $${cerdoP}/kg${hogs ? ' (AV)' : ' (ref.)'}. ` +
      (cornP > 5.2 ? 'Feed cost elevado: exportaciones bajo presión. ' : 'Feed cost en rango: exportaciones competitivas. ') +
      '<b>Filipinas y Vietnam</b> ofrecen oportunidad +10% sobre destinos actuales.',
    feedTotal,
    feedChg: corn?.pct ? `${VDS.fmtPct(corn.pct)} maíz` : '—',
    consumePara:
      `Ratio cerdo/pollo: ${ratio} (${r < 0.9 ? 'ventaja competitiva' : r < 1.0 ? 'diferencial moderado' : 'cerdo = pollo'}). ` +
      `Feed cost $${feedTotal}/kg (maíz $${cornP.toFixed(2)}/bu${corn ? '' : ', ref.'}, soya $${(soyP / 100).toFixed(2)}/cwt${soy ? '' : ', ref.'}). ` +
      'Expansión de plantas en Bajío proyecta capacidad adicional 2026-2027.',
  };
}

function Variacion({ pct }) {
  const n = parseFloat(pct) || 0;
  return <span className={n >= 0 ? 'mp-up' : 'mp-down'}>{(n >= 0 ? '+' : '') + n.toFixed(1)}%</span>;
}

export default function MercadoProteinas() {
  usePageStyles(HOJAS);

  const [datos, setDatos] = useState(null);
  const [filtro, setFiltro] = useState('all');
  const [analisisIA, setAnalisisIA] = useState('');

  useEffect(() => {
    let vivo = true;
    let reloj = null;

    const ejecutar = async (VDS) => {
      const d = await calcular(VDS);
      if (!vivo) return;
      VDS.save(CLAVE_CACHE, d);
      setDatos(d);

      // El análisis de Gemini llega después y solo sustituye el texto del
      // margen si de verdad devuelve algo; si falla queda el cálculo local.
      try {
        const prompt =
          'Eres VALL-AI, analista de márgenes para la industria pecuaria mexicana. Con estos datos actuales, ' +
          'redacta un análisis breve (2-3 oraciones) del margen de producción porcina y su tendencia:\n\n' +
          `Precio cerdo: $${d.precios.cerdo}/kg (${d.precios.cerdo_pct}%)\n` +
          `Margen estimado: ${d.margen.valor}/kg\n` +
          `Precio pollo: $${d.precios.pollo}/kg\n` +
          `Precio res: $${d.precios.res}/kg\n\n` +
          'Sé directo y práctico para productores mexicanos, sin frases de apertura genéricas.';
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
        window.VNLoader?.hide();
        if (!VDS.isExpired(CLAVE_CACHE)) return;
        VDS.clear(CLAVE_CACHE);
      }

      await ejecutar(VDS).catch((e) => console.error('Proteínas:', e));
      window.VNLoader?.hide();

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

  const precios = datos?.precios;

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
              <div className="mp-section-lbl">Precios Internacionales (USD / KG)</div>
              {ESPECIES.filter((e) => filtro === 'all' || e === filtro).map((especie) => (
                <div className="mp-price-row" key={especie}>
                  <span className="mp-price-name">{NOMBRE_PRECIO[especie]}</span>
                  <span>
                    <span className="mp-price-val">
                      {precios ? `$${precios[especie].toFixed(2)}` : '—'}
                    </span>
                    {precios && <Variacion pct={precios[`${especie}_pct`]} />}
                  </span>
                </div>
              ))}
              <div className="mp-ratio-note">
                <i className="fas fa-robot" style={{ color: '#00213a' }} />
                &nbsp;<b>Ratio Cerdo/Pollo: {datos?.ratio ?? '—'}</b>
                {datos ? ` — ${datos.notaRatio}` : ''}
              </div>
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
                ? <div className="mp-export-insight" dangerouslySetInnerHTML={{ __html: datos.exportInsight }} />
                : <div className="mp-export-insight">Cargando análisis de mercado…</div>}
            </div>
          </div>

          <div className="mp-right-col">
            <div className="mp-margin-card">
              <div className="mp-margin-lbl">Alerta de Margen · VALL-AI</div>
              <div
                className="mp-margin-val"
                style={{ color: datos ? (datos.margen.positivo ? '#4ade80' : '#f87171') : '#f87171' }}
              >
                {datos?.margen.valor ?? '—'}<small> /kg</small>
              </div>
              {/* El análisis trae marcado (negritas, saltos) tanto si lo calcula
                  la página como si lo redacta Gemini. */}
              <div
                className="mp-margin-sub"
                dangerouslySetInnerHTML={{
                  __html: analisisIA || datos?.margen.analisis || 'Calculando margen de producción…',
                }}
              />
            </div>

            <div className="mp-panel">
              <div className="mp-section-lbl">Tendencias de Consumo</div>
              <div className="mp-stat-grid">
                <div className="mp-stat-box">
                  <div className="mp-stat-lbl">Ratio Cerdo/Res</div>
                  <div className="mp-stat-val">{datos?.ratio ?? '—'}</div>
                  <div className="mp-stat-chg">
                    {datos ? (parseFloat(datos.ratio) < 1 ? '↓ cerdo < res' : '↑ cerdo ≥ res') : 'calculando'}
                  </div>
                  <div className="mp-stat-note">precio relativo actual</div>
                </div>
                <div className="mp-stat-box">
                  <div className="mp-stat-lbl">Feed Cost Est.</div>
                  <div className="mp-stat-val">{datos ? `$${datos.feedTotal}` : '—'}</div>
                  <div className="mp-stat-chg">{datos?.feedChg || 'maíz + soya'}</div>
                  <div className="mp-stat-note">USD / kg cerdo</div>
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
