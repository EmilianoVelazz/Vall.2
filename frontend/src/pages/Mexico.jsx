import { useState, useEffect, useRef } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import { sanitizeRichText } from '../lib/sanitizeHtml.js';
import { usePageStyles, loadScriptsInOrder } from '../lib/assets.js';
import './Mexico.css';

const CK = 'mex_v8';
const IMGS_MEX = ['/img/finanzas.webp', '/img/mercados.webp', '/img/mercadoP.webp'];
const CHART_JS = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';

// Porta la lógica original (IIFE de mexico.html): fetch de FX/TIIE/inflación +
// noticias (AlphaVantage → GDELT → Finnhub → sintético) y ensamblado de datos.
async function computeMexico(VDS) {
  const fd = new Date();
  const hora = fd.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const fechaFmt = fd.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

  try {
    const [usdmxnR, tiieR, inflR] = await Promise.allSettled([
      VDS.usdmxn(),
      VDS.banxico('SF61745'),
      VDS.banxico('SP74660'),
    ]);
    const usdmxnV = usdmxnR.status === 'fulfilled' && usdmxnR.value != null ? usdmxnR.value : null;
    const tiieV = tiieR.status === 'fulfilled' && tiieR.value != null ? tiieR.value : null;
    const inflV = inflR.status === 'fulfilled' && inflR.value != null ? inflR.value : null;

    const fx = usdmxnV != null ? usdmxnV.toFixed(2) : '17.20';
    const tiie = tiieV != null ? tiieV.toFixed(2) : '11.0';
    const infl = inflV != null ? inflV.toFixed(1) : '4.5';

    const CATS_MEX = ['Economía · Tipo de Cambio', 'Economía · Inflación', 'Infraestructura'];
    const DCS_MEX = ['economia', 'economia', 'infraestructura'];
    const IMP_MEX = ['alto', 'medio', 'bajo'];
    let noticias = null;

    const avNews = await VDS.newsAlphaVantage('economy_macro', 5).catch(() => null);
    if (avNews?.length) {
      noticias = avNews.slice(0, 3).map((a, i) => ({
        cat: CATS_MEX[i], dc: DCS_MEX[i], fecha: `${fechaFmt} · ${hora}`,
        titulo: a.title || 'Noticia económica', desc: a.description || 'Información económica actualizada.',
        fuente: a.source || 'Alpha Vantage', imp: IMP_MEX[i],
      }));
    }
    if (!noticias) {
      const gdeltRaw = await VDS.gdeltNews('Mexico OR "Mexican peso" OR Banxico OR nearshoring OR AMLO OR "Bank of Mexico"', 3).catch(() => null);
      if (gdeltRaw?.length) {
        noticias = gdeltRaw.slice(0, 3).map((a, i) => ({
          cat: CATS_MEX[i], dc: DCS_MEX[i], fecha: `${fechaFmt} · ${hora}`,
          titulo: a.title || 'Noticia económica México', desc: a.description || 'Información económica de México actualizada.',
          fuente: a.source || 'GDELT', imp: IMP_MEX[i],
        }));
      }
    }
    if (!noticias) {
      const finnhubRaw = await VDS.finnhubNews('general').catch(() => null);
      if (finnhubRaw?.length) {
        noticias = finnhubRaw.slice(0, 3).map((a, i) => ({
          cat: CATS_MEX[i], dc: DCS_MEX[i], fecha: `${fechaFmt} · ${hora}`,
          titulo: a.title || 'Noticia económica', desc: a.description || 'Información económica actualizada.',
          fuente: a.source || 'Finnhub', imp: IMP_MEX[i],
        }));
      }
    }
    if (!noticias) {
      const fxN2 = parseFloat(fx), tiieN2 = parseFloat(tiie), fedN2 = 4.50;
      noticias = [
        { cat: 'Economía · Tipo de Cambio', dc: 'economia', fecha: `${fechaFmt} · ${hora}`, titulo: `USD/MXN: $${fx} ${usdmxnV ? '· Tiempo real' : '· Estimado'} · ${fechaFmt}`, desc: `El peso mexicano cotiza a $${fx}/USD. ${fxN2 > 17.5 ? 'Nivel beneficia exportaciones agropecuarias, aunque presiona costos de insumos importados.' : 'Nivel moderado: equilibrio exportaciones/importaciones.'}`, fuente: usdmxnV ? 'open.er-api.com' : 'Referencia', imp: 'alto' },
        { cat: 'Economía · Inflación', dc: 'economia', fecha: `${fechaFmt} · ${hora}`, titulo: `TIIE: ${tiie}% · Inflación: ${infl}% ${tiieV ? '· Banxico SIE' : '· Estimado'}`, desc: `TIIE a 28 días: ${tiie}%. Inflación general: ${infl}%. Diferencial TIIE/Fed: ${(tiieN2 - fedN2).toFixed(2)}pp · ${tiieN2 - fedN2 > 5 ? 'alto diferencial, soporte al peso.' : 'diferencial moderado.'}`, fuente: tiieV ? 'Banxico SIE' : 'Referencia', imp: 'medio' },
        { cat: 'Infraestructura', dc: 'infraestructura', fecha: `${fechaFmt} · ${hora}`, titulo: `Nearshoring México: inversión industrial en corredor norte · ${fechaFmt}`, desc: 'México consolida posición nearshoring. Manufactura, logística y agroindustria son los sectores con mayor atracción de inversión extranjera directa en el norte del país.', fuente: 'Análisis VALL', imp: 'bajo' },
      ];
    }

    const fxN = parseFloat(fx), tiieN = parseFloat(tiie), fedN = 4.50;
    const ai_nota = `TIIE ${tiie}% vs Fed ${fedN}%: diferencial ${(tiieN - fedN).toFixed(2)}pp protege al peso y atrae capitales, pero encarece crédito agropecuario.`;
    const fx_analisis = `USD/MXN $${fx} ${usdmxnV ? '(tiempo real)' : '(estimado)'}. ${fxN > 17.5 ? 'Beneficia exportaciones de proteína, presiona costo de granos importados.' : 'Nivel moderado: equilibrio costo/competitividad exportadora.'}`;

    noticias = await VDS.translateNews(noticias).catch(() => noticias);
    return { usdmxn: fx, inflacion: infl, banxico: tiie, ai_nota, fx_analisis, noticias, fechaFmt, hora };
  } catch (err) {
    console.error('México load error:', err);
    return {
      usdmxn: '17.20', inflacion: '4.5', banxico: '11.0',
      ai_nota: `Datos de referencia · ${fechaFmt} · ${hora}`,
      fx_analisis: 'Verificar conexión a internet para datos en tiempo real.',
      noticias: [
        { cat: 'Economía · Tipo de Cambio', dc: 'economia', fecha: `${fechaFmt} · ${hora}`, titulo: `USD/MXN ref. $17.20 · ${fechaFmt}`, desc: 'Tipo de cambio de referencia. Verificar conexión.', fuente: 'Referencia', imp: 'alto' },
        { cat: 'Economía · Inflación', dc: 'economia', fecha: `${fechaFmt} · ${hora}`, titulo: `TIIE ref. 11.0% · Inflación ref. 4.5% · ${fechaFmt}`, desc: 'Indicadores de referencia Banxico. Verificar conexión.', fuente: 'Referencia', imp: 'medio' },
        { cat: 'Infraestructura', dc: 'infraestructura', fecha: `${fechaFmt} · ${hora}`, titulo: `Nearshoring México · ${fechaFmt}`, desc: 'México mantiene posición estratégica como destino de nearshoring.', fuente: 'Análisis VALL', imp: 'bajo' },
      ],
      fechaFmt, hora,
    };
  }
}

const DEP = [
  { name: '🌽 Maíz Amarillo', pct: 85, color: '#dc2626', origin: 'Origen: USA' },
  { name: '🫘 Soja', pct: 95, color: '#dc2626', origin: 'Origen: USA / Brasil' },
  { name: '🧪 Fertilizantes', pct: 70, color: '#d97706', origin: 'Origen: Rusia / Canadá' },
];

export default function Mexico() {
  usePageStyles(['/css/header.css?v=6', '/css/footer.css']);
  const [data, setData] = useState(null);
  const [aiNote, setAiNote] = useState('');
  const [cat, setCat] = useState('all');
  const importsRef = useRef(null);
  const exportsRef = useRef(null);
  const ratesRef = useRef(null);

  // ── Carga de datos ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadScriptsInOrder(['/js/api-keys.js?v=3', '/js/data-service.js?v=15', CHART_JS]);
      const VDS = window.VDS;
      if (!VDS || cancelled) return;

      const stored = VDS.load(CK, true);
      const expired = VDS.isExpired(CK);
      if (stored?.noticias) {
        setData(stored);
        if (!expired) return;
        VDS.clear(CK);
      }
      const fresh = await computeMexico(VDS);
      if (cancelled) return;
      VDS.save(CK, fresh);
      setData(fresh);

      const prompt = `Eres VALL-AI, analista económico de VALLNews especializado en México. Con estos datos actuales, redacta una nota breve (2 oraciones) sobre la política monetaria y su impacto en el sector agropecuario/empresarial mexicano:\n\nUSD/MXN: ${fresh.usdmxn}\nTIIE (Banxico): ${fresh.banxico}%\nInflación: ${fresh.inflacion}%\n\nSé directo, sin frases de apertura genéricas.`;
      const SYS = 'Eres un analista económico institucional de VALL News especializado en México. Responde en español, de forma concisa y profesional. Máximo 90 palabras.';
      VDS.geminiChat(prompt, SYS).then((text) => { if (!cancelled && text) setAiNote(text); }).catch(() => {});
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Gráficas Chart.js (theme-aware) ─────────────────────────────────────
  useEffect(() => {
    if (!data || !window.Chart) return;
    const Chart = window.Chart;
    const css = getComputedStyle(document.documentElement);
    const cv = (v, fb) => (css.getPropertyValue(v).trim() || fb);
    const GOLD = cv('--clr-gold', '#c9a227');
    const TEXT = cv('--clr-text-mut', '#64748b');
    const BG = cv('--clr-bg', '#f4f6f8');
    const GRID = 'rgba(128,128,128,0.14)';
    const RED = '#dc2626', AMBER = '#d97706', SLATE = '#64748b';
    const font = { family: "'Inter', sans-serif", size: 11 };
    Chart.defaults.font = font;
    Chart.defaults.color = TEXT;
    const charts = [];

    if (importsRef.current) charts.push(new Chart(importsRef.current, {
      type: 'bar',
      data: { labels: ['Maíz Amarillo', 'Soja', 'Fertilizantes'], datasets: [{ label: 'Dependencia importada (%)', data: [85, 95, 70], backgroundColor: [RED + 'cc', RED + 'dd', AMBER + 'cc'], borderColor: [RED, RED, AMBER], borderWidth: 1.5, borderRadius: 5 }] },
      options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ' ' + ctx.raw + '%' } } }, scales: { x: { min: 0, max: 100, ticks: { callback: (v) => v + '%', color: TEXT }, grid: { color: GRID } }, y: { ticks: { color: TEXT }, grid: { display: false } } } },
    }));

    if (exportsRef.current) charts.push(new Chart(exportsRef.current, {
      type: 'doughnut',
      data: { labels: ['Japón', 'Corea del Sur', 'China', 'EE.UU.', 'Otros'], datasets: [{ data: [40, 25, 15, 10, 10], backgroundColor: [GOLD, '#2d6ca0', '#4d8fbd', '#a0c4dd', SLATE], hoverOffset: 10, borderWidth: 2, borderColor: BG }] },
      options: { responsive: true, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: TEXT, font: { family: "'Inter', sans-serif", size: 10 }, padding: 8, boxWidth: 12 } }, tooltip: { callbacks: { label: (ctx) => ' ' + ctx.label + ': ' + ctx.raw + '%' } } } },
    }));

    const tiie = parseFloat(data.banxico) || 11.0;
    const infl = parseFloat(data.inflacion) || 4.5;
    if (ratesRef.current) charts.push(new Chart(ratesRef.current, {
      type: 'bar',
      data: { labels: ['TIIE Banxico', 'Fed EE.UU.', 'Inflación MX'], datasets: [{ label: 'Tasa (%)', data: [tiie, 4.50, infl], backgroundColor: [GOLD + 'cc', SLATE + 'cc', RED + 'bb'], borderColor: [GOLD, SLATE, RED], borderWidth: 1.5, borderRadius: 5 }] },
      options: { responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ' ' + ctx.raw + '%' } } }, scales: { y: { min: 0, ticks: { callback: (v) => v + '%', color: TEXT }, grid: { color: GRID } }, x: { ticks: { color: TEXT }, grid: { display: false } } } },
    }));

    return () => charts.forEach((ch) => ch.destroy());
  }, [data]);

  const noticias = data?.noticias || [];

  return (
    <>
      <Header />
      <div className="mx-container">
        <h1 className="mx-title"><i className="fas fa-flag"></i> México</h1>

        <div className="mx-filter">
          {[['all', 'TODOS'], ['economia', '💰 ECONOMÍA'], ['comercio', '🤝 COMERCIO'], ['infraestructura', '🏗️ INFRAESTRUCTURA']].map(([c, lbl]) => (
            <button key={c} className={`mx-pill${cat === c ? ' active' : ''}`} onClick={() => setCat(c)}>{lbl}</button>
          ))}
        </div>

        {/* Noticias */}
        <div className="mx-news-grid">
          {!data && <div className="mx-loading"><i className="fas fa-circle-notch fa-spin"></i>&nbsp; Cargando panorama de México…</div>}
          {noticias.filter((n) => cat === 'all' || n.dc === cat).map((n, i) => (
            <div className="mx-card" key={n.dc + i}>
              <img className="mx-card-img" src={IMGS_MEX[i % 3]} alt={n.cat} onError={(e) => { e.target.style.display = 'none'; }} />
              <div className="mx-card-body">
                <span className="mx-card-cat">{n.cat}</span>
                <h3 className="mx-card-title">{n.titulo}</h3>
                <p className="mx-card-desc">{n.desc}</p>
                <div className="mx-card-foot">
                  <span className="mx-tag-src">{n.fuente}</span>
                  {n.imp === 'alto' ? <span className="mx-tag-high">ALTO</span> : n.imp === 'medio' ? <span className="mx-tag-med">MEDIA</span> : <span className="mx-tag-low">BAJA</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Gráficas */}
        <div className="mx-panel" style={{ marginBottom: '1.2rem' }}>
          <div className="mx-section-lbl">Panorama Económico · Visualización de Datos</div>
          <div className="mx-charts-grid">
            <div><div className="mx-chart-lbl">Dependencia de Importaciones</div><canvas ref={importsRef} style={{ maxHeight: '190px' }}></canvas></div>
            <div><div className="mx-chart-lbl">Exportaciones de Cerdo por Destino</div><canvas ref={exportsRef} style={{ maxHeight: '190px' }}></canvas></div>
            <div><div className="mx-chart-lbl">Tasas de Referencia (%)</div><canvas ref={ratesRef} style={{ maxHeight: '190px' }}></canvas></div>
          </div>
        </div>

        <div className="mx-bottom">
          <div className="mx-col">
            {/* Indicadores */}
            <div className="mx-panel">
              <div className="mx-section-lbl">Indicadores Económicos</div>
              <div className="mx-ind-row"><span className="mx-ind-name">Inflación Anualizada</span><span className="mx-ind-val down">{data ? `${data.inflacion}%` : '4.5%'}</span></div>
              <div className="mx-ind-row"><span className="mx-ind-name">Tasa Banxico (Referencia)</span><span className="mx-ind-val">{data ? `${data.banxico}%` : '11.0%'}</span></div>
              <div className="mx-ind-row"><span className="mx-ind-name">Remesas Acumuladas (Q1)</span><span className="mx-ind-val up">$5.2B USD</span></div>
              <div className="mx-ind-row"><span className="mx-ind-name">Déficit Comercial</span><span className="mx-ind-val down">-$2.1B USD</span></div>
              <div className="mx-ia-note">
                <i className="fas fa-robot"></i>&nbsp;<b>VALL-AI:</b> {aiNote || data?.ai_nota || 'El diferencial de tasas MX vs US protege al peso, pero encarece el crédito para expansión de planta en el Bajío.'}
              </div>
            </div>

            {/* Comercio */}
            <div className="mx-panel">
              <div className="mx-section-lbl">Comercio Exterior · Cerdo</div>
              <div className="mx-trade-header">
                <div><div className="mx-trade-lbl">Volumen Trimestral</div><div className="mx-trade-val">45,000 <small style={{ fontSize: '.9rem', color: 'var(--clr-text-lt)' }}>TON</small></div></div>
                <div style={{ textAlign: 'right' }}><div className="mx-trade-lbl">Valor Estimado</div><div className="mx-trade-val accent">$180M <small style={{ fontSize: '.9rem' }}>USD</small></div></div>
              </div>
              <div className="mx-export-row"><span>🇯🇵 Japón</span><span className="mx-export-pct">40%</span></div>
              <div className="mx-export-row"><span>🇰🇷 Corea del Sur</span><span className="mx-export-pct">25%</span></div>
              <div className="mx-export-row"><span>🇨🇳 China <small style={{ color: '#16a34a', fontWeight: 700 }}>↑ en crecimiento</small></span><span className="mx-export-pct">15%</span></div>
              <div className="mx-export-row"><span>🇺🇸 Estados Unidos</span><span className="mx-export-pct">10%</span></div>
              <div className="mx-insight"><b>OPORTUNIDAD:</b> China incrementa demanda por sanciones a UE. Posible alza de cuota en Q3 2026.</div>
            </div>
          </div>

          <div className="mx-col">
            {/* FX */}
            <div className="mx-fx-card">
              <div className="mx-fx-lbl">USD / MXN Spot</div>
              <div className="mx-fx-val">{data?.usdmxn || '17.20'}</div>
              <div className="mx-fx-chg"><i className="fas fa-circle-info"></i> Tipo de cambio actualizado</div>
              <div className="mx-fx-body" dangerouslySetInnerHTML={{ __html: sanitizeRichText(data?.fx_analisis || 'El nivel actual <b>beneficia exportaciones</b> de proteína. Umbral operativo: <b>$16.80 · $18.50</b>.') }} />
              <div className="mx-fx-meta">
                <div className="mx-fx-meta-item">Petróleo MX<b>$70 / bbl</b></div>
                <div className="mx-fx-meta-item">Riesgo País<b>Estable</b></div>
                <div className="mx-fx-meta-item">Tasa Fed<b>5.5%</b></div>
                <div className="mx-fx-meta-item">Reservas MX<b>$215B USD</b></div>
              </div>
            </div>

            {/* Dependencia */}
            <div className="mx-panel">
              <div className="mx-section-lbl">Dependencia de Importaciones</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                {DEP.map((d) => (
                  <div className="mx-dep-item" key={d.name}>
                    <div className="mx-dep-top"><span className="name">{d.name}</span><span className="pct" style={{ color: d.color }}>{d.pct}%</span></div>
                    <div className="mx-dep-bar"><div className="mx-dep-fill" style={{ width: `${d.pct}%`, background: d.color }}></div></div>
                    <div className="mx-dep-src">{d.origin}</div>
                  </div>
                ))}
              </div>
              <div className="mx-risk-note">
                <i className="fas fa-triangle-exclamation"></i>
                <span>La exposición al dólar en la compra de granos es el <b>principal factor de riesgo</b> para el margen operativo del sector.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
